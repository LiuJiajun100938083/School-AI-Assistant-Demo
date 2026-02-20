"""
Application - 大厅服务
管理房间的创建、加入、开始游戏
注意：大厅系统不是游戏规则的一部分
"""
from typing import Optional
from ..infrastructure import memory_store, Room
from ..domain import GameState


class LobbyService:
    """大厅服务"""

    def __init__(self):
        self.store = memory_store

    def get_all_rooms(self) -> list[dict]:
        """获取所有房间列表"""
        rooms = self.store.get_all_rooms()
        return [room.to_dict() for room in rooms]

    def get_waiting_rooms(self) -> list[dict]:
        """获取等待中的房间列表"""
        rooms = self.store.get_waiting_rooms()
        return [room.to_dict() for room in rooms]

    def create_room(self, player_id: str, player_name: str, max_players: int = 4) -> dict:
        """
        创建房间

        返回房间信息
        """
        if max_players < 2 or max_players > 4:
            raise ValueError("玩家数量必须在2-4之间")

        room = self.store.create_room(player_id, player_name, max_players)
        return room.to_dict()

    def join_room(self, room_id: str, player_id: str, player_name: str) -> dict:
        """
        加入房间

        返回更新后的房间信息
        """
        room = self.store.join_room(room_id, player_id, player_name)
        return room.to_dict()

    def leave_room(self, room_id: str, player_id: str) -> Optional[dict]:
        """
        离开房间

        返回更新后的房间信息，如果房间被删除则返回None
        """
        room = self.store.leave_room(room_id, player_id)
        if room:
            return room.to_dict()
        return None

    def get_room(self, room_id: str) -> Optional[dict]:
        """获取房间信息"""
        room = self.store.get_room(room_id)
        if room:
            return room.to_dict()
        return None

    def get_player_room(self, player_id: str) -> Optional[dict]:
        """获取玩家所在的房间"""
        room = self.store.get_player_room(player_id)
        if room:
            return room.to_dict()
        return None

    def start_game(self, room_id: str, player_id: str) -> dict:
        """
        开始游戏

        规则：
        - 仅房主可以开始
        - 开始后初始化GameState
        """
        game_state = self.store.start_game(room_id, player_id)
        return {
            "message": "游戏开始！",
            "room_id": room_id,
            "game_state": game_state.to_dict()
        }

    def get_lobby_stats(self) -> dict:
        """获取大厅统计"""
        return self.store.get_stats()


# 全局大厅服务实例
lobby_service = LobbyService()
