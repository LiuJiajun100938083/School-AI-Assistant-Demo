"""
協作佈告板 — WebSocket 廣播器
==============================
只管連線集合與訊息派發，不懂業務。
"""

import asyncio
import json
import logging
from datetime import date, datetime
from typing import Any, Dict, List, Set

from starlette.websockets import WebSocket, WebSocketState


def _json_default(o: Any) -> Any:
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, bytes):
        return o.decode("utf-8", errors="replace")
    raise TypeError(f"Object of type {type(o).__name__} is not JSON serializable")


def _safe_dumps(event: Dict[str, Any]) -> str:
    return json.dumps(event, ensure_ascii=False, default=_json_default)

logger = logging.getLogger(__name__)


class BoardBroadcaster:
    def __init__(self, max_connections: int = 100):
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._users: Dict[WebSocket, Dict[str, Any]] = {}
        self._lock = asyncio.Lock()
        self._max = max_connections
        self._main_loop: asyncio.AbstractEventLoop | None = None

    def _capture_loop(self) -> None:
        """在 async 上下文被呼叫時記錄主 event loop,供 worker thread 跨線程投遞"""
        if self._main_loop is None:
            try:
                self._main_loop = asyncio.get_running_loop()
            except RuntimeError:
                pass

    def publish_threadsafe(self, board_uuid: str, event: Dict[str, Any]) -> None:
        """從 worker thread 安全地觸發廣播"""
        loop = self._main_loop
        if loop is None or not loop.is_running():
            return
        asyncio.run_coroutine_threadsafe(self.publish(board_uuid, event), loop)

    async def connect(self, board_uuid: str, ws: WebSocket, user: Dict[str, Any]) -> None:
        self._capture_loop()
        async with self._lock:
            room = self._rooms.setdefault(board_uuid, set())
            if len(room) >= self._max:
                await ws.close(code=1013, reason="Room full")
                return
            room.add(ws)
            self._users[ws] = {"id": user.get("id"), "username": user.get("username", "")}
        await self._broadcast_presence(board_uuid)

    async def disconnect(self, board_uuid: str, ws: WebSocket) -> None:
        async with self._lock:
            room = self._rooms.get(board_uuid)
            if room and ws in room:
                room.discard(ws)
                if not room:
                    self._rooms.pop(board_uuid, None)
            self._users.pop(ws, None)
        await self._broadcast_presence(board_uuid)

    async def publish(self, board_uuid: str, event: Dict[str, Any]) -> None:
        # 快照避免遍歷時被修改
        async with self._lock:
            room = list(self._rooms.get(board_uuid, []))
        # 預先序列化一次,避免每個連線重複 dump;同時處理 datetime 等非原生類型
        try:
            payload_text = _safe_dumps(event)
        except Exception as e:  # noqa: BLE001
            logger.error("broadcaster serialize failed: %s", e)
            return
        dead: List[WebSocket] = []
        for ws in room:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload_text)
                else:
                    dead.append(ws)
            except Exception as e:  # noqa: BLE001
                logger.warning("broadcaster send failed: %s", e)
                dead.append(ws)
        for ws in dead:
            await self.disconnect(board_uuid, ws)

    def presence(self, board_uuid: str) -> List[Dict[str, Any]]:
        room = self._rooms.get(board_uuid) or set()
        seen: Dict[int, Dict[str, Any]] = {}
        for ws in room:
            info = self._users.get(ws)
            if info and info.get("id") is not None:
                seen[info["id"]] = info
        return list(seen.values())

    async def _broadcast_presence(self, board_uuid: str) -> None:
        event = {"type": "presence", "payload": {"users": self.presence(board_uuid)}}
        try:
            payload_text = _safe_dumps(event)
        except Exception:  # noqa: BLE001
            return
        room = list(self._rooms.get(board_uuid, []))
        for ws in room:
            try:
                if ws.client_state == WebSocketState.CONNECTED:
                    await ws.send_text(payload_text)
            except Exception:  # noqa: BLE001
                pass
