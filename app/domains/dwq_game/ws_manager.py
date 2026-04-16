"""
大灣區大亨遊戲 WebSocket 連線管理器

設計原則:
    - 與 ClassroomWSManager (app/services/ws_manager.py) 設計對等,但為獨立 singleton
    - 防止跨域訊息污染 (課堂訊息不會誤發到遊戲房,反之亦然)
    - 連線以 (room_code, user_id) 為鍵,單一帳號重複連線會踢掉舊連線
    - 異常隔離:單個發送失敗不影響其他玩家
    - 提供 send_to_user (單播) 與 broadcast_to_room (廣播)
"""
from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# 每個房間最大連線數 (硬上限,實際遊戲限制由 max_players 控制)
MAX_CONNECTIONS_PER_ROOM = 16


class DwqWSManager:
    """大灣區大亨 WebSocket 連線池

    結構:
        _rooms: {
            room_code: {
                user_id: WebSocket
            }
        }
    """

    def __init__(self) -> None:
        self._rooms: dict[str, dict[int, WebSocket]] = {}
        self._lock = asyncio.Lock()

    # ─────────────────────────────────────────────────────
    # 連線管理
    # ─────────────────────────────────────────────────────

    async def connect(
        self,
        room_code: str,
        user_id: int,
        websocket: WebSocket,
    ) -> bool:
        """將用戶連線加入房間。

        若同一 user_id 已有連線,先關閉舊連線 (防多分頁)。
        若房間連線數達上限,返回 False。
        """
        async with self._lock:
            if room_code not in self._rooms:
                self._rooms[room_code] = {}

            room_conns = self._rooms[room_code]

            if len(room_conns) >= MAX_CONNECTIONS_PER_ROOM and user_id not in room_conns:
                logger.warning(
                    "[DWQ-WS] 房間 %s 連線數已達上限 (%d)",
                    room_code, MAX_CONNECTIONS_PER_ROOM,
                )
                return False

            # 同一用戶已有舊連線 → 關閉
            if user_id in room_conns:
                old_ws = room_conns[user_id]
                try:
                    await old_ws.close(code=4001, reason="新連線已建立")
                except Exception:
                    pass

            room_conns[user_id] = websocket

        logger.info(
            "[DWQ-WS] 連線: user=%d 加入房間 %s [線上: %d]",
            user_id, room_code, len(self._rooms.get(room_code, {})),
        )
        return True

    async def disconnect(self, room_code: str, user_id: int) -> None:
        """從房間移除指定用戶的連線"""
        async with self._lock:
            room_conns = self._rooms.get(room_code, {})
            ws = room_conns.pop(user_id, None)
            if not self._rooms.get(room_code):
                self._rooms.pop(room_code, None)

        if ws is not None:
            logger.info(
                "[DWQ-WS] 斷開: user=%d 離開房間 %s",
                user_id, room_code,
            )

    # ─────────────────────────────────────────────────────
    # 訊息發送
    # ─────────────────────────────────────────────────────

    async def send_to_user(
        self,
        room_code: str,
        user_id: int,
        message: dict[str, Any],
    ) -> bool:
        """向房間內指定用戶發送 JSON 訊息"""
        room_conns = self._rooms.get(room_code, {})
        ws = room_conns.get(user_id)
        if ws is None:
            return False
        try:
            await ws.send_json(message)
            return True
        except Exception as e:
            logger.debug(
                "[DWQ-WS] 單播失敗 user=%d room=%s: %s",
                user_id, room_code, e,
            )
            await self.disconnect(room_code, user_id)
            return False

    async def broadcast_to_room(
        self,
        room_code: str,
        message: dict[str, Any],
        exclude: Optional[int] = None,
    ) -> int:
        """向房間內所有用戶廣播 (相同訊息)。返回成功數。

        注意:若需 per-viewer 隱私序列化,請改用 broadcast_personalized。
        """
        room_conns = self._rooms.get(room_code, {})
        if not room_conns:
            return 0

        sent = 0
        failed: list[int] = []
        for uid, ws in list(room_conns.items()):
            if uid == exclude:
                continue
            try:
                await ws.send_json(message)
                sent += 1
            except Exception as e:
                logger.debug(
                    "[DWQ-WS] 廣播失敗 user=%d room=%s: %s",
                    uid, room_code, e,
                )
                failed.append(uid)

        for uid in failed:
            await self.disconnect(room_code, uid)

        return sent

    async def broadcast_personalized(
        self,
        room_code: str,
        message_builder,
    ) -> int:
        """向房間內每個用戶發送個人化的訊息 (隱私保護用)。

        參數:
            message_builder: callable(user_id) → dict
                為每個用戶建構專屬訊息 (例如 hand 隱私處理)。
        """
        room_conns = self._rooms.get(room_code, {})
        if not room_conns:
            return 0

        sent = 0
        failed: list[int] = []
        for uid, ws in list(room_conns.items()):
            try:
                msg = message_builder(uid)
                await ws.send_json(msg)
                sent += 1
            except Exception as e:
                logger.debug(
                    "[DWQ-WS] 個人化廣播失敗 user=%d room=%s: %s",
                    uid, room_code, e,
                )
                failed.append(uid)

        for uid in failed:
            await self.disconnect(room_code, uid)

        return sent

    # ─────────────────────────────────────────────────────
    # 房間管理
    # ─────────────────────────────────────────────────────

    async def close_room(self, room_code: str, reason: str = "房間關閉") -> int:
        """關閉房間所有連線"""
        async with self._lock:
            room_conns = self._rooms.pop(room_code, {})

        closed = 0
        for uid, ws in room_conns.items():
            try:
                await ws.send_json({"type": "room_closed", "reason": reason})
                await ws.close(code=1000, reason=reason)
                closed += 1
            except Exception:
                pass

        if closed > 0:
            logger.info("[DWQ-WS] 房間 %s 已關閉 %d 個連線", room_code, closed)
        return closed

    # ─────────────────────────────────────────────────────
    # 查詢
    # ─────────────────────────────────────────────────────

    def is_user_connected(self, room_code: str, user_id: int) -> bool:
        return user_id in self._rooms.get(room_code, {})

    def get_room_user_count(self, room_code: str) -> int:
        return len(self._rooms.get(room_code, {}))

    def get_connected_user_ids(self, room_code: str) -> list[int]:
        return list(self._rooms.get(room_code, {}).keys())


# ─────────────────────────────────────────────────────────
# 全域單例
# ─────────────────────────────────────────────────────────

_ws_manager: Optional[DwqWSManager] = None


def get_dwq_ws_manager() -> DwqWSManager:
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = DwqWSManager()
    return _ws_manager
