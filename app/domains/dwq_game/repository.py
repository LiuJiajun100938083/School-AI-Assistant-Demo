"""
大灣區大亨遊戲 In-Memory 倉儲

設計原則:
    - 純記憶體實現,符合用戶要求 (狀態於遊戲生命週期內存在)
    - 介面設計成 ABC 風格,將來可換成 Redis/MySQL 實作而不動 service.py (可擴展)
    - 全域索引鎖 (_lock) 用於 _rooms / _user_room 的維護
    - 每房間獨立鎖 (_room_locks) 避免跨房間阻塞
    - cleanup_expired 為背景任務,定期清理 finished/abandoned 房間
"""
from __future__ import annotations

import asyncio
import logging
import random
import string
import time
from typing import Awaitable, Callable, Optional, TypeVar

from . import constants as C
from .exceptions import (
    AlreadyInRoomError,
    NotInRoomError,
    RoomFullError,
    RoomNotFoundError,
)
from .models import GameState, Player, RoomStatus

logger = logging.getLogger(__name__)

T = TypeVar("T")


class DwqGameStore:
    """大灣區大亨房間記憶體倉儲

    結構:
        _rooms: 房間碼 → GameState
        _user_room: user_id → 該用戶當前所在房間碼 (保證單一活躍房間)
        _room_locks: 房間碼 → 該房間獨立的 asyncio.Lock
        _lock: 全域鎖,僅用於維護上述索引 (建立房間/加入/離開)
    """

    def __init__(self) -> None:
        self._rooms: dict[str, GameState] = {}
        self._user_room: dict[int, str] = {}
        self._room_locks: dict[str, asyncio.Lock] = {}
        self._lock = asyncio.Lock()
        self._cleanup_task: Optional[asyncio.Task] = None

    # ─────────────────────────────────────────────────────
    # Room CRUD
    # ─────────────────────────────────────────────────────

    async def create_room(
        self,
        host_user_id: int,
        host_username: str,
        host_display_name: str,
        room_name: str,
        max_players: int,
        is_public: bool,
    ) -> GameState:
        """建立新房間。host 自動加入並成為 seat 0。"""
        async with self._lock:
            # 檢查 host 是否已在其他房間
            if host_user_id in self._user_room:
                old_code = self._user_room[host_user_id]
                if old_code in self._rooms:
                    raise AlreadyInRoomError(old_code)
                # 索引污染,清理
                del self._user_room[host_user_id]

            # 校驗 max_players
            mp = max(C.MIN_PLAYERS, min(C.MAX_PLAYERS, max_players))

            # 生成唯一房間碼
            for _ in range(20):
                code = self._generate_room_code()
                if code not in self._rooms:
                    break
            else:
                raise RuntimeError("無法生成唯一房間碼 (太多重試)")

            state = GameState(
                room_code=code,
                room_name=room_name[:40],  # 限長
                host_user_id=host_user_id,
                is_public=is_public,
                max_players=mp,
                status=RoomStatus.WAITING,
            )
            host_player = Player(
                user_id=host_user_id,
                username=host_username,
                display_name=host_display_name,
                color=C.PLAYER_COLORS[0],
                seat_index=0,
            )
            state.players[host_user_id] = host_player

            self._rooms[code] = state
            self._user_room[host_user_id] = code
            self._room_locks[code] = asyncio.Lock()

            logger.info(
                "[DWQ] 房間建立 code=%s host=%s public=%s max=%d",
                code, host_username, is_public, mp,
            )
            return state

    async def join_room(
        self,
        code: str,
        user_id: int,
        username: str,
        display_name: str,
    ) -> GameState:
        """玩家加入房間 (僅 WAITING 狀態)。重複加入返回現狀,不報錯。"""
        async with self._lock:
            state = self._rooms.get(code)
            if state is None:
                raise RoomNotFoundError(code)

            # 已在此房間 → 視為刷新返回
            if user_id in state.players:
                return state

            # 在其他房間 → 拒絕
            if user_id in self._user_room and self._user_room[user_id] != code:
                raise AlreadyInRoomError(self._user_room[user_id])

            # 房間狀態檢查
            if state.status != RoomStatus.WAITING:
                from .exceptions import RoomAlreadyStartedError
                raise RoomAlreadyStartedError(code)

            if state.player_count() >= state.max_players:
                raise RoomFullError(code, state.max_players)

            # 分配座位 + 顏色
            used_seats = {p.seat_index for p in state.players.values()}
            new_seat = next(i for i in range(state.max_players) if i not in used_seats)
            color = C.PLAYER_COLORS[new_seat % len(C.PLAYER_COLORS)]

            player = Player(
                user_id=user_id,
                username=username,
                display_name=display_name,
                color=color,
                seat_index=new_seat,
            )
            state.players[user_id] = player
            self._user_room[user_id] = code
            state.updated_at = time.time()
            state.version += 1

            logger.info(
                "[DWQ] 玩家加入 code=%s user=%s seat=%d (%d/%d)",
                code, username, new_seat, state.player_count(), state.max_players,
            )
            return state

    async def leave_room(self, code: str, user_id: int) -> Optional[GameState]:
        """離開房間。

        - WAITING 狀態:從房間移除玩家;若是房主或最後一人,房間刪除
        - RUNNING 狀態:標記為 abandoned 但不立即移除 (玩家可能會回來)
                       此處走的是「主動退出」分支,將該玩家標 disconnected+afk
        - 返回房間最新狀態,或 None 若房間被刪除
        """
        async with self._lock:
            state = self._rooms.get(code)
            if state is None:
                return None
            if user_id not in state.players:
                raise NotInRoomError(code)

            if state.status == RoomStatus.WAITING:
                # 從房間移除
                del state.players[user_id]
                if user_id in self._user_room:
                    del self._user_room[user_id]

                # 房主離開或剩 0 人 → 解散
                if state.host_user_id == user_id or state.player_count() == 0:
                    self._delete_room_unlocked(code)
                    logger.info("[DWQ] 房間解散 code=%s reason=host_left_or_empty", code)
                    return None

                state.updated_at = time.time()
                state.version += 1
                return state

            # RUNNING:標記為 disconnected + afk,但保留位置
            player = state.players[user_id]
            player.is_connected = False
            player.is_afk = True
            player.disconnected_at = time.time()
            state.updated_at = time.time()
            state.version += 1
            return state

    async def get_room(self, code: str) -> Optional[GameState]:
        """獲取房間 (不持鎖)"""
        return self._rooms.get(code)

    async def get_user_room_code(self, user_id: int) -> Optional[str]:
        """獲取用戶當前所在房間碼"""
        return self._user_room.get(user_id)

    async def get_user_room(self, user_id: int) -> Optional[GameState]:
        code = self._user_room.get(user_id)
        if code is None:
            return None
        return self._rooms.get(code)

    async def list_public_waiting(self) -> list[GameState]:
        """列出所有公開且等待中的房間 (用於大廳)"""
        return [
            state for state in self._rooms.values()
            if state.is_public and state.status == RoomStatus.WAITING
        ]

    async def delete_room(self, code: str) -> None:
        """強制刪除房間 (清理所有索引)"""
        async with self._lock:
            self._delete_room_unlocked(code)

    def _delete_room_unlocked(self, code: str) -> None:
        """無鎖版本,呼叫者必須持有 self._lock"""
        state = self._rooms.pop(code, None)
        if state is None:
            return
        for uid in list(self._user_room.keys()):
            if self._user_room[uid] == code:
                del self._user_room[uid]
        self._room_locks.pop(code, None)

    # ─────────────────────────────────────────────────────
    # Per-room lock helpers
    # ─────────────────────────────────────────────────────

    async def with_room_lock(
        self,
        code: str,
        fn: Callable[[GameState], Awaitable[T]],
    ) -> T:
        """獲取指定房間的獨立鎖並執行 fn(state)。

        所有 mutation 必須通過此方法以保證原子性。
        若房間不存在,拋 RoomNotFoundError。
        """
        lock = self._room_locks.get(code)
        if lock is None:
            raise RoomNotFoundError(code)
        async with lock:
            state = self._rooms.get(code)
            if state is None:
                raise RoomNotFoundError(code)
            return await fn(state)

    def get_room_lock(self, code: str) -> Optional[asyncio.Lock]:
        """直接取得房間鎖 (進階用法,需自行管理 acquire/release)"""
        return self._room_locks.get(code)

    # ─────────────────────────────────────────────────────
    # Maintenance
    # ─────────────────────────────────────────────────────

    async def cleanup_expired(self) -> int:
        """清理過期房間 (status=finished/abandoned 且超過 ROOM_TTL_SEC)"""
        async with self._lock:
            now = time.time()
            expired_codes = []
            for code, state in list(self._rooms.items()):
                if state.status in (RoomStatus.FINISHED, RoomStatus.ABANDONED):
                    age = now - state.updated_at
                    if age > C.ROOM_TTL_SEC:
                        expired_codes.append(code)
            for code in expired_codes:
                self._delete_room_unlocked(code)
                logger.info("[DWQ] 過期房間清理 code=%s", code)
            return len(expired_codes)

    def start_cleanup_task(self, interval_sec: int = 600) -> None:
        """啟動背景清理任務 (在 service 初始化時呼叫)"""
        if self._cleanup_task is not None and not self._cleanup_task.done():
            return

        async def _loop():
            while True:
                try:
                    await asyncio.sleep(interval_sec)
                    await self.cleanup_expired()
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.warning("[DWQ] 清理任務異常: %s", e)

        try:
            self._cleanup_task = asyncio.create_task(_loop())
            logger.info("[DWQ] 房間清理任務已啟動 interval=%ds", interval_sec)
        except RuntimeError:
            # 沒有事件循環 (例如測試環境),靜默
            logger.debug("[DWQ] 無事件循環,跳過清理任務啟動")

    def stop_cleanup_task(self) -> None:
        if self._cleanup_task is not None:
            self._cleanup_task.cancel()
            self._cleanup_task = None

    # ─────────────────────────────────────────────────────
    # Internal helpers
    # ─────────────────────────────────────────────────────

    @staticmethod
    def _generate_room_code() -> str:
        """生成 6 位英數字大寫房間碼"""
        chars = string.ascii_uppercase + string.digits
        return "".join(random.choices(chars, k=C.ROOM_CODE_LENGTH))

    # ─────────────────────────────────────────────────────
    # 統計查詢 (給管理 endpoint)
    # ─────────────────────────────────────────────────────

    def stats(self) -> dict:
        return {
            "total_rooms": len(self._rooms),
            "active_users": len(self._user_room),
            "by_status": {
                status: sum(1 for s in self._rooms.values() if s.status == status)
                for status in (RoomStatus.WAITING, RoomStatus.RUNNING, RoomStatus.FINISHED, RoomStatus.ABANDONED)
            },
        }


# ─────────────────────────────────────────────────────────
# 全域單例
# ─────────────────────────────────────────────────────────

_store: Optional[DwqGameStore] = None


def get_dwq_store() -> DwqGameStore:
    global _store
    if _store is None:
        _store = DwqGameStore()
    return _store
