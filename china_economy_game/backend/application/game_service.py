"""
Application - 游戏服务
管理游戏流程、回合推进、玩家行动
"""
from typing import Optional
from ..infrastructure import memory_store
from ..domain import GameState, ActionType


class GameService:
    """游戏服务"""

    def __init__(self):
        self.store = memory_store

    def _get_game_state(self, room_id: str) -> GameState:
        """获取游戏状态（内部方法）"""
        game_state = self.store.get_game_state(room_id)
        if not game_state:
            raise ValueError("游戏不存在或尚未开始")
        return game_state

    # ==================== 游戏状态查询 ====================

    def get_game_state(self, room_id: str) -> dict:
        """获取完整游戏状态"""
        game_state = self._get_game_state(room_id)
        return game_state.to_dict()

    def get_board(self, room_id: str) -> dict:
        """获取棋盘信息"""
        game_state = self._get_game_state(room_id)
        return game_state.board.to_dict()

    def get_player_info(self, room_id: str, player_id: str) -> dict:
        """获取玩家信息"""
        game_state = self._get_game_state(room_id)
        player = game_state.get_player(player_id)
        if not player:
            raise ValueError("玩家不存在")
        return {
            "player": player.to_dict(),
            "factories": game_state.get_player_factories(player_id),
            "available_actions": game_state.get_available_actions(player_id)
        }

    def get_available_actions(self, room_id: str, player_id: str) -> list[dict]:
        """获取玩家可执行的行动"""
        game_state = self._get_game_state(room_id)
        return game_state.get_available_actions(player_id)

    def get_current_turn_info(self, room_id: str) -> dict:
        """获取当前回合信息"""
        game_state = self._get_game_state(room_id)
        return {
            "turn_manager": game_state.turn_manager.to_dict(),
            "stage_manager": game_state.stage_manager.to_dict(),
            "event_deck": game_state.event_deck.to_dict()
        }

    # ==================== 回合流程 ====================

    def start_new_round(self, room_id: str) -> dict:
        """开始新回合"""
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        # 如果当前回合已完成，先进行结算
        if game_state.turn_manager.is_round_complete():
            settlement = game_state.end_round()
            # 开始新回合
            round_info = game_state.start_turn()
            return {
                "previous_round_settlement": settlement,
                "new_round": round_info
            }
        else:
            round_info = game_state.start_turn()
            return {"new_round": round_info}

    def draw_event_card(self, room_id: str) -> dict:
        """抽取事件卡"""
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        return game_state.draw_event_card()

    def end_round(self, room_id: str) -> dict:
        """结束当前回合"""
        game_state = self._get_game_state(room_id)
        return game_state.end_round()

    # ==================== 玩家行动 ====================

    def player_move(self, room_id: str, player_id: str, steps: int = 1) -> dict:
        """
        玩家移动

        参数：
        - steps: 移动步数（默认1）
        """
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        return game_state.player_move(player_id, steps)

    def player_build_factory(self, room_id: str, player_id: str, industry_id: str) -> dict:
        """
        玩家建厂

        参数：
        - industry_id: 要建设的产业ID
        """
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        return game_state.player_build_factory(player_id, industry_id)

    def player_use_transport(self, room_id: str, player_id: str, destination_index: int) -> dict:
        """
        玩家使用运输

        参数：
        - destination_index: 目的地格子索引
        """
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        return game_state.player_use_transport(player_id, destination_index)

    def player_end_turn(self, room_id: str, player_id: str) -> dict:
        """玩家结束回合"""
        game_state = self._get_game_state(room_id)

        if game_state.is_finished():
            raise ValueError("游戏已结束")

        return game_state.player_end_turn(player_id)

    def execute_action(self, room_id: str, player_id: str, action: dict) -> dict:
        """
        执行玩家行动（通用接口）

        参数：
        - action: {
            "type": "MOVE" | "BUILD_FACTORY" | "USE_TRANSPORT",
            "params": {...}  // 根据行动类型不同
          }
        """
        action_type = action.get("type")
        params = action.get("params", {})

        if action_type == ActionType.MOVE.value:
            return self.player_move(room_id, player_id, params.get("steps", 1))
        elif action_type == ActionType.BUILD_FACTORY.value:
            industry_id = params.get("industry_id")
            if not industry_id:
                raise ValueError("缺少 industry_id 参数")
            return self.player_build_factory(room_id, player_id, industry_id)
        elif action_type == ActionType.USE_TRANSPORT.value:
            destination = params.get("destination_index")
            if destination is None:
                raise ValueError("缺少 destination_index 参数")
            return self.player_use_transport(room_id, player_id, destination)
        else:
            raise ValueError(f"未知的行动类型: {action_type}")

    # ==================== 游戏信息 ====================

    def get_industries_info(self, room_id: str) -> dict:
        """获取产业信息"""
        game_state = self._get_game_state(room_id)
        available = game_state.stage_manager.get_available_industries()
        return {
            "current_stage": game_state.stage_manager.current_stage.value,
            "stage_info": game_state.stage_manager.get_stage_description(),
            "available_industries": [
                {
                    "industry_id": ind.industry_id,
                    "industry_name": ind.industry_name,
                    "category": ind.industry_category.value,
                    "stage": ind.stage.value,
                    "human_land_required": ind.human_land_required,
                    "human_type_required": ind.human_type_required.value,
                    "base_income": ind.base_income,
                    "synergy_bonus": ind.synergy_bonus
                }
                for ind in available
            ]
        }

    def get_active_events(self, room_id: str) -> dict:
        """获取活跃的事件效果"""
        game_state = self._get_game_state(room_id)
        active_events = game_state.event_deck.get_active_persistent_effects()
        return {
            "active_events": [event.to_dict() for event in active_events],
            "remaining_cards": game_state.event_deck.remaining_count()
        }

    def get_leaderboard(self, room_id: str) -> list[dict]:
        """获取玩家排行榜"""
        game_state = self._get_game_state(room_id)
        players = sorted(
            game_state.players.values(),
            key=lambda p: p.money,
            reverse=True
        )
        return [
            {
                "rank": i + 1,
                "player_id": p.player_id,
                "name": p.name,
                "money": p.money,
                "factory_count": len(p.factories)
            }
            for i, p in enumerate(players)
        ]


# 全局游戏服务实例
game_service = GameService()
