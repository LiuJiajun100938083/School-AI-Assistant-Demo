"""
Domain - 回合管理器
管理回合流程、玩家顺序、阶段推进
"""
from typing import Optional
from .enums import TurnPhase
from .player import Player


class TurnManager:
    """回合管理器"""

    # 每位玩家的初始行动力
    ACTION_POINTS_PER_TURN = 2

    def __init__(self, players: list[Player] = None):
        self._players: list[Player] = players or []
        self._current_round: int = 0
        self._current_phase: TurnPhase = TurnPhase.TURN_START
        self._starting_player_index: int = 0  # 起始玩家索引
        self._current_player_index: int = 0   # 当前行动玩家索引
        self._players_completed_this_round: set[str] = set()
        self._is_game_over: bool = False

    def initialize(self, players: list[Player]):
        """初始化回合管理器"""
        self._players = players
        self._current_round = 0
        self._current_phase = TurnPhase.TURN_START
        self._starting_player_index = 0
        self._current_player_index = 0
        self._players_completed_this_round = set()
        self._is_game_over = False

    def get_player_count(self) -> int:
        """获取玩家数量"""
        return len(self._players)

    def get_current_round(self) -> int:
        """获取当前回合数"""
        return self._current_round

    def get_current_phase(self) -> TurnPhase:
        """获取当前阶段"""
        return self._current_phase

    def get_current_player(self) -> Optional[Player]:
        """获取当前行动的玩家"""
        if not self._players:
            return None
        return self._players[self._current_player_index]

    def get_starting_player(self) -> Optional[Player]:
        """获取本回合起始玩家"""
        if not self._players:
            return None
        return self._players[self._starting_player_index]

    def start_new_round(self) -> dict:
        """
        开始新回合

        回合流程：
        1. 回合开始
        2. 翻开事件卡
        3. 玩家行动（从起始玩家开始，顺时针）
        4. 回合结束
        """
        self._current_round += 1
        self._current_phase = TurnPhase.TURN_START
        self._current_player_index = self._starting_player_index
        self._players_completed_this_round = set()

        # 重置所有玩家的行动力
        for player in self._players:
            player.reset_action_points(self.ACTION_POINTS_PER_TURN)

        return {
            "round": self._current_round,
            "phase": self._current_phase.name,
            "starting_player": self.get_starting_player().player_id if self.get_starting_player() else None
        }

    def advance_to_event_phase(self) -> dict:
        """进入事件卡阶段"""
        self._current_phase = TurnPhase.EVENT_PHASE
        return {
            "round": self._current_round,
            "phase": self._current_phase.name,
            "message": "进入事件卡阶段，请翻开事件卡"
        }

    def advance_to_player_actions(self) -> dict:
        """进入玩家行动阶段"""
        self._current_phase = TurnPhase.PLAYER_ACTIONS
        self._current_player_index = self._starting_player_index
        return {
            "round": self._current_round,
            "phase": self._current_phase.name,
            "current_player": self.get_current_player().player_id if self.get_current_player() else None,
            "message": "进入玩家行动阶段"
        }

    def is_current_player(self, player_id: str) -> bool:
        """判断是否为当前行动玩家"""
        current = self.get_current_player()
        return current is not None and current.player_id == player_id

    def end_current_player_turn(self) -> dict:
        """
        结束当前玩家回合

        返回下一个玩家或回合结束信息
        """
        current_player = self.get_current_player()
        if current_player:
            self._players_completed_this_round.add(current_player.player_id)

        # 检查是否所有玩家都完成了
        if len(self._players_completed_this_round) >= len(self._players):
            return self._end_round()

        # 移动到下一个玩家（顺时针）
        self._current_player_index = (self._current_player_index + 1) % len(self._players)

        # 跳过已完成的玩家
        attempts = 0
        while (self.get_current_player().player_id in self._players_completed_this_round
               and attempts < len(self._players)):
            self._current_player_index = (self._current_player_index + 1) % len(self._players)
            attempts += 1

        return {
            "round": self._current_round,
            "phase": self._current_phase.name,
            "current_player": self.get_current_player().player_id,
            "message": f"轮到玩家 {self.get_current_player().name} 行动"
        }

    def _end_round(self) -> dict:
        """
        结束当前回合

        - 起始玩家标记顺移一位
        - 准备进入下一回合
        """
        self._current_phase = TurnPhase.TURN_END

        # 起始玩家顺移
        self._starting_player_index = (self._starting_player_index + 1) % len(self._players)

        return {
            "round": self._current_round,
            "phase": self._current_phase.name,
            "round_ended": True,
            "next_starting_player": self._players[self._starting_player_index].player_id,
            "message": f"第 {self._current_round} 回合结束"
        }

    def can_player_act(self, player_id: str) -> tuple[bool, str]:
        """
        判断玩家是否可以行动

        返回: (是否可行动, 原因)
        """
        # 检查是否在玩家行动阶段
        if self._current_phase != TurnPhase.PLAYER_ACTIONS:
            return False, "当前不是玩家行动阶段"

        # 检查是否为当前玩家
        if not self.is_current_player(player_id):
            current = self.get_current_player()
            return False, f"当前是玩家 {current.name if current else 'Unknown'} 的回合"

        # 检查玩家是否有行动力
        player = self.get_current_player()
        if not player.has_action_points():
            return False, "没有剩余行动力"

        return True, "可以行动"

    def is_round_complete(self) -> bool:
        """检查当前回合是否完成"""
        return self._current_phase == TurnPhase.TURN_END

    def set_game_over(self, is_over: bool = True):
        """设置游戏结束"""
        self._is_game_over = is_over

    def is_game_over(self) -> bool:
        """游戏是否结束"""
        return self._is_game_over

    def get_turn_order(self) -> list[str]:
        """获取本回合的玩家行动顺序"""
        order = []
        for i in range(len(self._players)):
            index = (self._starting_player_index + i) % len(self._players)
            order.append(self._players[index].player_id)
        return order

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "current_round": self._current_round,
            "current_phase": self._current_phase.name,
            "starting_player": self.get_starting_player().player_id if self.get_starting_player() else None,
            "current_player": self.get_current_player().player_id if self.get_current_player() else None,
            "turn_order": self.get_turn_order(),
            "players_completed": list(self._players_completed_this_round),
            "is_game_over": self._is_game_over
        }
