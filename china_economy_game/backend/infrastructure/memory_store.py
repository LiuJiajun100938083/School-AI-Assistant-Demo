"""
Infrastructure - 内存数据存储
第一版使用内存存储，后续可扩展为数据库
"""
from typing import Optional, Dict
from dataclasses import dataclass, field
import uuid

from ..domain import GameState, RoomStatus


@dataclass
class Room:
    """
    房间数据结构

    注意：这不是游戏规则的一部分，
    它只是一个多人匹配与等待机制。
    """
    room_id: str
    host_player_id: str
    players: list[str] = field(default_factory=list)  # 玩家ID列表
    player_names: dict[str, str] = field(default_factory=dict)  # 玩家ID -> 名称映射
    max_players: int = 4
    min_players: int = 2
    status: RoomStatus = RoomStatus.WAITING
    game_state: Optional[GameState] = None

    def is_full(self) -> bool:
        """房间是否已满"""
        return len(self.players) >= self.max_players

    def is_host(self, player_id: str) -> bool:
        """是否为房主"""
        return self.host_player_id == player_id

    def can_start(self) -> bool:
        """是否可以开始游戏"""
        return (
            self.status == RoomStatus.WAITING and
            len(self.players) >= self.min_players
        )

    def can_join(self) -> bool:
        """是否可以加入"""
        return self.status == RoomStatus.WAITING and not self.is_full()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "room_id": self.room_id,
            "host_player_id": self.host_player_id,
            "players": self.players,
            "player_names": self.player_names,
            "player_count": len(self.players),
            "max_players": self.max_players,
            "min_players": self.min_players,
            "status": self.status.value,
            "can_start": self.can_start(),
            "can_join": self.can_join()
        }


class MemoryStore:
    """内存存储管理器"""

    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._rooms: Dict[str, Room] = {}
        self._player_room_map: Dict[str, str] = {}  # 玩家ID -> 房间ID
        self._initialized = True

    # ==================== 房间管理 ====================

    def create_room(self, host_player_id: str, host_name: str, max_players: int = 4) -> Room:
        """
        创建房间

        规则：
        - 创建者自动成为房主
        - 创建者自动加入房间
        - 房间状态为 WAITING
        """
        # 检查玩家是否已在房间中
        if host_player_id in self._player_room_map:
            raise ValueError("玩家已在其他房间中")

        room_id = str(uuid.uuid4())[:8]  # 短ID更友好
        room = Room(
            room_id=room_id,
            host_player_id=host_player_id,
            players=[host_player_id],
            player_names={host_player_id: host_name},
            max_players=max_players
        )

        self._rooms[room_id] = room
        self._player_room_map[host_player_id] = room_id

        return room

    def get_room(self, room_id: str) -> Optional[Room]:
        """获取房间"""
        return self._rooms.get(room_id)

    def get_all_rooms(self) -> list[Room]:
        """获取所有房间"""
        return list(self._rooms.values())

    def get_waiting_rooms(self) -> list[Room]:
        """获取所有等待中的房间"""
        return [r for r in self._rooms.values() if r.status == RoomStatus.WAITING]

    def join_room(self, room_id: str, player_id: str, player_name: str) -> Room:
        """
        加入房间

        规则：
        - 仅允许加入 WAITING 状态的房间
        - 玩家人数不能超过 max_players
        """
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")

        if not room.can_join():
            if room.status != RoomStatus.WAITING:
                raise ValueError("游戏已开始，无法加入")
            raise ValueError("房间已满")

        if player_id in self._player_room_map:
            if self._player_room_map[player_id] == room_id:
                raise ValueError("你已在此房间中")
            raise ValueError("你已在其他房间中")

        room.players.append(player_id)
        room.player_names[player_id] = player_name
        self._player_room_map[player_id] = room_id

        return room

    def leave_room(self, room_id: str, player_id: str) -> Optional[Room]:
        """
        离开房间

        规则：
        - 如果房主离开，房间解散
        - 游戏进行中不能离开
        """
        room = self.get_room(room_id)
        if not room:
            return None

        if player_id not in room.players:
            return None

        if room.status == RoomStatus.IN_GAME:
            raise ValueError("游戏进行中，无法离开")

        room.players.remove(player_id)
        del room.player_names[player_id]
        del self._player_room_map[player_id]

        # 如果房主离开或房间空了，删除房间
        if room.is_host(player_id) or len(room.players) == 0:
            self.delete_room(room_id)
            return None

        return room

    def delete_room(self, room_id: str):
        """删除房间"""
        room = self.get_room(room_id)
        if room:
            # 清理玩家-房间映射
            for player_id in room.players:
                if player_id in self._player_room_map:
                    del self._player_room_map[player_id]
            del self._rooms[room_id]

    def get_player_room(self, player_id: str) -> Optional[Room]:
        """获取玩家所在的房间"""
        room_id = self._player_room_map.get(player_id)
        if room_id:
            return self.get_room(room_id)
        return None

    # ==================== 游戏状态管理 ====================

    def start_game(self, room_id: str, player_id: str) -> GameState:
        """
        开始游戏

        规则：
        - 仅房主可以开始
        - 玩家人数 >= 最少人数
        - 开始后房间状态切换为 IN_GAME
        - 初始化 GameState
        """
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")

        if not room.is_host(player_id):
            raise ValueError("只有房主可以开始游戏")

        if not room.can_start():
            raise ValueError(f"至少需要 {room.min_players} 名玩家才能开始")

        # 创建游戏状态
        game_state = GameState(game_id=room_id)

        # 添加所有玩家
        for pid in room.players:
            pname = room.player_names.get(pid, f"玩家{pid[:4]}")
            game_state.add_player(pid, pname)

        # 开始游戏
        game_state.start_game()

        # 更新房间状态
        room.status = RoomStatus.IN_GAME
        room.game_state = game_state

        return game_state

    def get_game_state(self, room_id: str) -> Optional[GameState]:
        """获取游戏状态"""
        room = self.get_room(room_id)
        if room:
            return room.game_state
        return None

    # ==================== 工具方法 ====================

    def reset(self):
        """重置所有数据（用于测试）"""
        self._rooms.clear()
        self._player_room_map.clear()

    def get_stats(self) -> dict:
        """获取统计信息"""
        waiting_rooms = [r for r in self._rooms.values() if r.status == RoomStatus.WAITING]
        in_game_rooms = [r for r in self._rooms.values() if r.status == RoomStatus.IN_GAME]
        return {
            "total_rooms": len(self._rooms),
            "waiting_rooms": len(waiting_rooms),
            "in_game_rooms": len(in_game_rooms),
            "total_players": len(self._player_room_map)
        }


# 全局存储实例
memory_store = MemoryStore()
