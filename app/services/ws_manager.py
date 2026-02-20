#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WebSocket 房间连接管理器

管理课堂房间的 WebSocket 连接池，提供:
- 按房间分组的连接管理
- 房间广播 (可排除发送者)
- 指定用户单播
- 连接数统计
- 安全断开清理

设计原则:
- 线程安全 (使用 asyncio.Lock)
- 连接上限保护
- 异常隔离 (单个发送失败不影响其他)
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)

# 每个房间最大连接数
MAX_CONNECTIONS_PER_ROOM = 500


class ClassroomWSManager:
    """
    课堂 WebSocket 连接管理器

    结构:
        _rooms: {
            room_id: {
                username: WebSocket,
                ...
            }
        }
        _user_roles: {
            (room_id, username): "teacher" | "student"
        }
    """

    def __init__(self):
        self._rooms: Dict[str, Dict[str, WebSocket]] = {}
        self._user_roles: Dict[tuple, str] = {}
        self._lock = asyncio.Lock()

    async def connect(
        self,
        room_id: str,
        username: str,
        role: str,
        websocket: WebSocket,
    ) -> bool:
        """
        将用户连接加入房间

        Args:
            room_id: 房间 ID
            username: 用户名
            role: 用户角色 (teacher/student)
            websocket: WebSocket 连接

        Returns:
            是否成功加入 (False 表示房间已满)
        """
        async with self._lock:
            if room_id not in self._rooms:
                self._rooms[room_id] = {}

            room_conns = self._rooms[room_id]

            # 检查连接数上限
            if len(room_conns) >= MAX_CONNECTIONS_PER_ROOM:
                logger.warning(
                    "房间 %s 连接数已达上限 (%d)",
                    room_id, MAX_CONNECTIONS_PER_ROOM,
                )
                return False

            # 如果该用户已有连接，先关闭旧连接
            if username in room_conns:
                old_ws = room_conns[username]
                try:
                    await old_ws.close(code=4001, reason="新连接已建立")
                except Exception:
                    pass

            room_conns[username] = websocket
            self._user_roles[(room_id, username)] = role

        logger.info(
            "WS 连接: %s (%s) 加入房间 %s [在线: %d]",
            username, role, room_id, len(self._rooms.get(room_id, {})),
        )
        return True

    async def disconnect(
        self,
        room_id: str,
        username: str,
    ) -> None:
        """将用户从房间移除"""
        async with self._lock:
            room_conns = self._rooms.get(room_id, {})
            room_conns.pop(username, None)
            self._user_roles.pop((room_id, username), None)

            # 如果房间为空，清理房间
            if room_id in self._rooms and not self._rooms[room_id]:
                del self._rooms[room_id]

        logger.info(
            "WS 断开: %s 离开房间 %s [在线: %d]",
            username, room_id, len(self._rooms.get(room_id, {})),
        )

    async def broadcast_to_room(
        self,
        room_id: str,
        message: Dict[str, Any],
        exclude: Optional[str] = None,
    ) -> int:
        """
        向房间内所有用户广播消息

        Args:
            room_id: 房间 ID
            message: 消息字典 (自动 JSON 序列化)
            exclude: 要排除的用户名 (通常是发送者)

        Returns:
            成功发送的数量
        """
        room_conns = self._rooms.get(room_id, {})
        if not room_conns:
            return 0

        sent_count = 0
        failed_users: List[str] = []

        for username, ws in list(room_conns.items()):
            if username == exclude:
                continue
            try:
                await ws.send_json(message)
                sent_count += 1
            except Exception as e:
                logger.debug(
                    "WS 发送失败: %s 在房间 %s (%s)",
                    username, room_id, e,
                )
                failed_users.append(username)

        # 清理失败的连接
        for user in failed_users:
            await self.disconnect(room_id, user)

        return sent_count

    async def send_to_user(
        self,
        room_id: str,
        username: str,
        message: Dict[str, Any],
    ) -> bool:
        """向房间内指定用户发送消息"""
        room_conns = self._rooms.get(room_id, {})
        ws = room_conns.get(username)
        if not ws:
            return False

        try:
            await ws.send_json(message)
            return True
        except Exception as e:
            logger.debug(
                "WS 单播失败: %s 在房间 %s (%s)",
                username, room_id, e,
            )
            await self.disconnect(room_id, username)
            return False

    async def broadcast_to_students(
        self,
        room_id: str,
        message: Dict[str, Any],
    ) -> int:
        """仅向房间内的学生广播"""
        room_conns = self._rooms.get(room_id, {})
        if not room_conns:
            return 0

        sent_count = 0
        failed_users: List[str] = []

        for username, ws in list(room_conns.items()):
            if self._user_roles.get((room_id, username)) != "student":
                continue
            try:
                await ws.send_json(message)
                sent_count += 1
            except Exception:
                failed_users.append(username)

        for user in failed_users:
            await self.disconnect(room_id, user)

        return sent_count

    def get_room_user_count(self, room_id: str) -> int:
        """获取房间在线用户数"""
        return len(self._rooms.get(room_id, {}))

    def get_room_usernames(self, room_id: str) -> List[str]:
        """获取房间在线用户名列表"""
        return list(self._rooms.get(room_id, {}).keys())

    def is_user_connected(self, room_id: str, username: str) -> bool:
        """检查用户是否在房间在线"""
        return username in self._rooms.get(room_id, {})

    async def close_room(self, room_id: str) -> int:
        """
        关闭房间所有连接 (房间结束时调用)

        Returns:
            关闭的连接数
        """
        async with self._lock:
            room_conns = self._rooms.pop(room_id, {})

        closed = 0
        for username, ws in room_conns.items():
            try:
                await ws.send_json({
                    "type": "room_closed",
                    "message": "课堂已结束",
                })
                await ws.close(code=1000, reason="课堂已结束")
                closed += 1
            except Exception:
                pass
            self._user_roles.pop((room_id, username), None)

        if closed > 0:
            logger.info("房间 %s 已关闭 %d 个连接", room_id, closed)
        return closed


# 全局单例
_ws_manager: Optional[ClassroomWSManager] = None


def get_classroom_ws_manager() -> ClassroomWSManager:
    """获取全局 WebSocket 管理器实例"""
    global _ws_manager
    if _ws_manager is None:
        _ws_manager = ClassroomWSManager()
    return _ws_manager
