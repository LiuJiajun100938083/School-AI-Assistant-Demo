"""
大灣區大亨遊戲業務 Orchestration 門面

職責:
    - 整合 store + engine + ws_manager
    - 統一的動作分派入口 (handle_action 是防作弊集中點)
    - 管理斷線/AFK timer
    - 廣播狀態 (per-viewer 個人化序列化)

設計原則:
    - REST endpoints 與 WebSocket handlers 都通過此 service
    - 所有 mutation 都在 store 的 room lock 內執行
    - 廣播動作在解鎖後執行,避免阻塞
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, Optional

from . import constants as C
from . import engine
from .exceptions import (
    DwqGameError,
    InvalidActionError,
    NotHostError,
    NotInRoomError,
    PlayerNotFoundError,
    RoomNotFoundError,
)
from .models import GamePhase, GameState, RoomStatus
from .repository import DwqGameStore, get_dwq_store
from .ws_manager import DwqWSManager, get_dwq_ws_manager

logger = logging.getLogger(__name__)


class DwqGameService:
    """大灣區大亨業務門面"""

    def __init__(
        self,
        store: Optional[DwqGameStore] = None,
        ws_mgr: Optional[DwqWSManager] = None,
    ) -> None:
        self._store = store or get_dwq_store()
        self._ws = ws_mgr or get_dwq_ws_manager()
        # (room_code, user_id) → asyncio.Task
        self._disconnect_timers: dict[tuple[str, int], asyncio.Task] = {}
        self._afk_timers: dict[tuple[str, int], asyncio.Task] = {}

    # ═════════════════════════════════════════════════════
    # REST 入口
    # ═════════════════════════════════════════════════════

    async def create_room(
        self,
        user: dict,
        room_name: str,
        max_players: int,
        is_public: bool,
    ) -> dict:
        state = await self._store.create_room(
            host_user_id=user["id"],
            host_username=user["username"],
            host_display_name=user.get("display_name") or user["username"],
            room_name=room_name,
            max_players=max_players,
            is_public=is_public,
        )
        return self._room_summary(state)

    async def list_public_rooms(self) -> list[dict]:
        rooms = await self._store.list_public_waiting()
        return [self._room_summary(state) for state in rooms]

    async def get_room(self, code: str) -> dict:
        state = await self._store.get_room(code)
        if state is None:
            raise RoomNotFoundError(code)
        return self._room_summary(state)

    async def join_room(self, code: str, user: dict) -> dict:
        state = await self._store.join_room(
            code=code,
            user_id=user["id"],
            username=user["username"],
            display_name=user.get("display_name") or user["username"],
        )
        # 廣播 player_joined 給其他成員
        await self._ws.broadcast_to_room(
            code,
            {
                "type": "player_joined",
                "player": self._player_dto(state.players[user["id"]]),
            },
            exclude=user["id"],
        )
        return self._room_summary(state)

    async def join_by_code(self, code: str, user: dict) -> dict:
        return await self.join_room(code.upper().strip(), user)

    async def leave_room(self, code: str, user: dict) -> dict:
        state = await self._store.leave_room(code, user["id"])
        if state is not None:
            await self._ws.broadcast_to_room(
                code,
                {"type": "player_left", "user_id": user["id"]},
            )
        await self._ws.disconnect(code, user["id"])
        return {"left": True, "room_deleted": state is None}

    async def get_active_room(self, user: dict) -> Optional[dict]:
        """重連入口:返回該用戶當前所在房間的完整狀態 snapshot"""
        state = await self._store.get_user_room(user["id"])
        if state is None:
            return None
        return {
            "room_code": state.room_code,
            "ws_url": f"/api/dwq_game/ws/{state.room_code}",
            "snapshot": engine.serialize_state_for_viewer(state, viewer_user_id=user["id"]),
        }

    # ═════════════════════════════════════════════════════
    # WebSocket 生命週期
    # ═════════════════════════════════════════════════════

    async def handle_ws_connect(
        self,
        room_code: str,
        user: dict,
        websocket,
    ) -> bool:
        """WebSocket 連線建立後的處理。

        - 確認用戶是該房間成員
        - 註冊到 ws_manager
        - 取消任何斷線/AFK timer
        - 標記 is_connected=True
        - 推送 connected + room_state
        - 廣播 player_reconnected (如果之前斷線過)
        """
        user_id = user["id"]
        state = await self._store.get_room(room_code)
        if state is None or user_id not in state.players:
            await websocket.send_json({
                "type": "error",
                "code": "not_in_room",
                "message": "您不在此房間中",
            })
            await websocket.close(code=4003)
            return False

        # 註冊連線
        ok = await self._ws.connect(room_code, user_id, websocket)
        if not ok:
            await websocket.close(code=1008, reason="連線數超過限制")
            return False

        # 取消 timers (重連)
        was_disconnected = False
        async def _mark_connected(s: GameState):
            nonlocal was_disconnected
            player = s.players[user_id]
            was_disconnected = not player.is_connected or player.is_afk
            player.is_connected = True
            player.is_afk = False
            player.disconnected_at = None
            s.version += 1
            s.updated_at = time.time()

        await self._store.with_room_lock(room_code, _mark_connected)
        self._cancel_timers(room_code, user_id)

        # 發送 connected 與 room_state
        player = state.players[user_id]
        await self._ws.send_to_user(room_code, user_id, {
            "type": "connected",
            "you": {
                "user_id": user_id,
                "username": user["username"],
                "seat_index": player.seat_index,
            },
            "room": self._room_summary(state),
        })
        await self._send_state_to_user(room_code, user_id)

        # 廣播給其他人
        if was_disconnected:
            await self._ws.broadcast_to_room(
                room_code,
                {"type": "player_reconnected", "user_id": user_id},
                exclude=user_id,
            )
        else:
            await self._ws.broadcast_to_room(
                room_code,
                {
                    "type": "player_joined",
                    "player": self._player_dto(player),
                },
                exclude=user_id,
            )

        return True

    async def handle_ws_message(
        self,
        room_code: str,
        user_id: int,
        msg: dict,
    ) -> None:
        """處理單條 WebSocket 訊息"""
        msg_type = msg.get("type")

        if msg_type == "ping":
            await self._ws.send_to_user(room_code, user_id, {"type": "pong"})
            return

        if msg_type == "request_state":
            await self._send_state_to_user(room_code, user_id)
            return

        if msg_type == "action":
            action = msg.get("action") or (msg.get("payload") or {}).get("action")
            payload = msg.get("payload") or {}
            req_id = msg.get("req_id")
            try:
                await self._dispatch_action(room_code, user_id, action, payload, req_id)
            except DwqGameError as e:
                await self._ws.send_to_user(room_code, user_id, {
                    "type": "action_error",
                    "req_id": req_id,
                    "code": e.code,
                    "message": e.message,
                })
                logger.warning(
                    "[DWQ] action 拒絕 room=%s user=%d action=%s reason=%s",
                    room_code, user_id, action, e.code,
                )
            return

        if msg_type == "chat":
            text = (msg.get("payload") or {}).get("text", "")[:200]
            if text:
                state = await self._store.get_room(room_code)
                if state and user_id in state.players:
                    player = state.players[user_id]
                    await self._ws.broadcast_to_room(room_code, {
                        "type": "chat",
                        "user_id": user_id,
                        "display_name": player.display_name,
                        "text": text,
                        "ts": time.time(),
                    })
            return

        # 未知訊息類型
        await self._ws.send_to_user(room_code, user_id, {
            "type": "error",
            "code": "unknown_message_type",
            "message": f"未知訊息類型: {msg_type}",
        })

    async def handle_ws_disconnect(self, room_code: str, user_id: int) -> None:
        """WebSocket 斷線處理"""
        state = await self._store.get_room(room_code)
        if state is None or user_id not in state.players:
            await self._ws.disconnect(room_code, user_id)
            return

        async def _mark_disconnected(s: GameState):
            player = s.players[user_id]
            if not player.is_connected:
                return  # 已被標記過
            player.is_connected = False
            player.disconnected_at = time.time()
            s.version += 1
            s.updated_at = time.time()

        await self._store.with_room_lock(room_code, _mark_disconnected)
        await self._ws.disconnect(room_code, user_id)

        if state.status == RoomStatus.WAITING:
            # 等待房:廣播玩家離開但不啟動 timer (玩家可隨時回來)
            await self._ws.broadcast_to_room(room_code, {
                "type": "player_disconnected",
                "user_id": user_id,
                "grace_sec": C.DISCONNECT_GRACE_SEC,
            })
            return

        # 遊戲中:啟動 grace timer
        await self._ws.broadcast_to_room(room_code, {
            "type": "player_disconnected",
            "user_id": user_id,
            "grace_sec": C.DISCONNECT_GRACE_SEC,
        })
        self._start_disconnect_timer(room_code, user_id)

    # ═════════════════════════════════════════════════════
    # 開始遊戲
    # ═════════════════════════════════════════════════════

    async def start_game(self, room_code: str, user_id: int) -> None:
        """房主手動開始遊戲 (透過 WS action 或 REST)"""
        async def _do(state: GameState):
            if state.host_user_id != user_id:
                raise NotHostError()
            engine.start_game(state)
            engine.initial_turn_setup(state)
            state.version += 1
            state.updated_at = time.time()

        await self._store.with_room_lock(room_code, _do)

        # 廣播 game_started + room_state
        await self._ws.broadcast_to_room(room_code, {"type": "game_started"})
        await self._broadcast_state(room_code)

    # ═════════════════════════════════════════════════════
    # 動作分派 (防作弊核心)
    # ═════════════════════════════════════════════════════

    async def _dispatch_action(
        self,
        room_code: str,
        user_id: int,
        action: Optional[str],
        payload: dict,
        req_id: Optional[str],
    ) -> None:
        """統一動作入口。所有 action 必經此函數,user_id 從 WS scope 取得 (絕不從 payload)。"""

        if action == "start_game":
            await self.start_game(room_code, user_id)
            await self._ws.send_to_user(room_code, user_id, {
                "type": "action_ack",
                "req_id": req_id,
                "ok": True,
            })
            return

        if action == "leave":
            user_dict = {"id": user_id, "username": "", "display_name": ""}
            await self.leave_room(room_code, user_dict)
            return

        if action not in ("move", "build", "end_turn", "draft_pick"):
            raise InvalidActionError("unknown_action", f"未知動作 {action}")

        # ── 選秀動作走專門路徑 ──
        if action == "draft_pick":
            result_holder: dict[str, Any] = {}

            async def _do_draft(state: GameState):
                if user_id not in state.players:
                    raise PlayerNotFoundError(user_id)
                industry = payload.get("industry", "")
                engine.validate_draft_pick(state, user_id, industry)
                res = engine.do_draft_pick(state, user_id, industry)
                result_holder["result"] = res

            await self._store.with_room_lock(room_code, _do_draft)
            await self._ws.send_to_user(room_code, user_id, {
                "type": "action_ack", "req_id": req_id, "ok": True,
            })
            await self._broadcast_state(room_code)
            return

        # ── 一般動作 ──
        result_holder: dict[str, Any] = {}

        async def _do(state: GameState):
            if user_id not in state.players:
                raise PlayerNotFoundError(user_id)
            res = engine.handle_player_action(state, user_id, action, payload)
            result_holder["result"] = res

        await self._store.with_room_lock(room_code, _do)
        result = result_holder["result"]

        # ack
        await self._ws.send_to_user(room_code, user_id, {
            "type": "action_ack",
            "req_id": req_id,
            "ok": True,
        })

        # 廣播 phase_changed (若 end_turn 推進了階段)
        phase_advance = result.get("phase_advance")
        if phase_advance:
            if phase_advance.get("type") == "next_player":
                # 同回合內推進到下一玩家
                pass
            elif phase_advance.get("is_game_over"):
                await self._ws.broadcast_to_room(room_code, {
                    "type": "game_over",
                    "finalize": phase_advance["finalize"],
                })
            else:
                # 進入下一回合
                await self._ws.broadcast_to_room(room_code, {
                    "type": "turn_started",
                    "turn_index": phase_advance["turn_index"],
                    "event_result": phase_advance["event_result"],
                    "profit_report": phase_advance["profit_report"],
                })

        # 廣播完整狀態 (per-viewer)
        await self._broadcast_state(room_code)

    # ═════════════════════════════════════════════════════
    # 廣播 helpers
    # ═════════════════════════════════════════════════════

    async def _broadcast_state(self, room_code: str) -> None:
        """為房間每位成員產出個人化 state 並廣播"""
        state = await self._store.get_room(room_code)
        if state is None:
            return

        def builder(viewer_id: int) -> dict:
            return {
                "type": "room_state",
                "state": engine.serialize_state_for_viewer(state, viewer_user_id=viewer_id),
            }

        await self._ws.broadcast_personalized(room_code, builder)

    async def _send_state_to_user(self, room_code: str, user_id: int) -> None:
        """單獨向指定用戶推送其個人化的 state"""
        state = await self._store.get_room(room_code)
        if state is None:
            return
        dto = engine.serialize_state_for_viewer(state, viewer_user_id=user_id)
        await self._ws.send_to_user(room_code, user_id, {
            "type": "room_state",
            "state": dto,
        })

    # ═════════════════════════════════════════════════════
    # 斷線/AFK 計時器
    # ═════════════════════════════════════════════════════

    def _start_disconnect_timer(self, room_code: str, user_id: int) -> None:
        """啟動 grace 期 timer。超時後標記 AFK 並自動跳過。"""
        key = (room_code, user_id)
        self._cancel_timers(room_code, user_id)

        async def _expire():
            try:
                await asyncio.sleep(C.DISCONNECT_GRACE_SEC)
            except asyncio.CancelledError:
                return

            try:
                await self._mark_afk_and_skip(room_code, user_id)
            except Exception as e:
                logger.warning(
                    "[DWQ] AFK 標記失敗 room=%s user=%d: %s",
                    room_code, user_id, e,
                )

        self._disconnect_timers[key] = asyncio.create_task(_expire())

    def _cancel_timers(self, room_code: str, user_id: int) -> None:
        """取消該玩家的所有 timer (重連時呼叫)"""
        key = (room_code, user_id)
        for d in (self._disconnect_timers, self._afk_timers):
            task = d.pop(key, None)
            if task is not None and not task.done():
                task.cancel()

    async def _mark_afk_and_skip(self, room_code: str, user_id: int) -> None:
        """grace 超時:標記為 AFK,如果輪到該玩家則自動 end_turn"""
        skipped = False

        async def _do(state: GameState):
            nonlocal skipped
            player = state.players.get(user_id)
            if player is None:
                return
            if player.is_connected:
                return  # 已重連,跳過

            player.is_afk = True
            state.version += 1
            state.updated_at = time.time()

            # 若是當前玩家的回合,自動跳過
            if state.current_player_user_id() == user_id and state.phase == GamePhase.ACTION:
                advance = engine.auto_skip_afk_player(state)
                if advance is not None:
                    skipped = True
                    return advance
            return None

        try:
            advance = await self._store.with_room_lock(room_code, _do)
        except RoomNotFoundError:
            return

        # 廣播 AFK
        await self._ws.broadcast_to_room(room_code, {
            "type": "player_afk",
            "user_id": user_id,
        })

        # 若觸發階段推進
        if skipped and isinstance(advance, dict):
            if advance.get("type") != "next_player":
                if advance.get("is_game_over"):
                    await self._ws.broadcast_to_room(room_code, {
                        "type": "game_over",
                        "finalize": advance["finalize"],
                    })
                else:
                    await self._ws.broadcast_to_room(room_code, {
                        "type": "turn_started",
                        "turn_index": advance.get("turn_index"),
                        "event_result": advance.get("event_result"),
                        "profit_report": advance.get("profit_report"),
                    })

        await self._broadcast_state(room_code)

    # ═════════════════════════════════════════════════════
    # DTO helpers
    # ═════════════════════════════════════════════════════

    @staticmethod
    def _room_summary(state: GameState) -> dict:
        """房間元資料摘要 (lobby 列表用)"""
        return {
            "room_code": state.room_code,
            "room_name": state.room_name,
            "host_user_id": state.host_user_id,
            "is_public": state.is_public,
            "max_players": state.max_players,
            "min_players": C.MIN_PLAYERS,
            "player_count": state.player_count(),
            "status": state.status,
            "can_start": (
                state.status == RoomStatus.WAITING
                and state.player_count() >= C.MIN_PLAYERS
            ),
            "can_join": (
                state.status == RoomStatus.WAITING
                and state.player_count() < state.max_players
            ),
            "players": [
                DwqGameService._player_dto(p) for p in
                sorted(state.players.values(), key=lambda x: x.seat_index)
            ],
            "created_at": state.created_at,
        }

    @staticmethod
    def _player_dto(player) -> dict:
        return {
            "user_id": player.user_id,
            "username": player.username,
            "display_name": player.display_name,
            "color": player.color,
            "seat_index": player.seat_index,
            "is_connected": player.is_connected,
            "is_afk": player.is_afk,
        }


# ─────────────────────────────────────────────────────────
# 全域單例
# ─────────────────────────────────────────────────────────

_service: Optional[DwqGameService] = None


def get_dwq_service() -> DwqGameService:
    global _service
    if _service is None:
        _service = DwqGameService()
        # 啟動清理任務
        try:
            _service._store.start_cleanup_task()
        except Exception as e:
            logger.warning("[DWQ] 清理任務啟動失敗: %s", e)
    return _service
