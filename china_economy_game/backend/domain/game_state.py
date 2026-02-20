"""
Domain - 游戏状态
整合所有游戏组件，管理完整的游戏状态
"""
from dataclasses import dataclass, field
from typing import Optional
import uuid

from .enums import GameStage, TileType, ActionType, TurnPhase, HumanType
from .player import Player
from .board import Board, Tile, GAME_BOARD
from .industry import Factory, IndustryCard, INDUSTRY_REGISTRY
from .event_card import EventDeck, EventCard, EventEffectType
from .stage_manager import StageManager
from .turn_manager import TurnManager
from .calculators import IncomeCalculator, SynergyCalculator


class GameState:
    """游戏状态 - Domain层核心"""

    def __init__(self, game_id: str = None):
        self.game_id: str = game_id or str(uuid.uuid4())
        self.board: Board = Board()  # 每个游戏实例有自己的棋盘
        self.players: dict[str, Player] = {}
        self.factories: dict[str, Factory] = {}
        self.event_deck: EventDeck = EventDeck()
        self.stage_manager: StageManager = StageManager()
        self.turn_manager: TurnManager = TurnManager()
        self.income_calculator: IncomeCalculator = IncomeCalculator()

        # 游戏状态标志
        self._is_started: bool = False
        self._is_finished: bool = False
        self._winner_id: Optional[str] = None

        # 初始资金
        self.INITIAL_MONEY = 30

    # ==================== 游戏初始化 ====================

    def add_player(self, player_id: str, name: str) -> Player:
        """添加玩家"""
        if player_id in self.players:
            raise ValueError(f"玩家 {player_id} 已存在")
        if len(self.players) >= 4:
            raise ValueError("玩家数量已达上限（4人）")

        player = Player(
            player_id=player_id,
            name=name,
            money=self.INITIAL_MONEY,
            position=self.board.get_start_position()
        )
        self.players[player_id] = player
        return player

    def remove_player(self, player_id: str) -> bool:
        """移除玩家"""
        if player_id in self.players:
            del self.players[player_id]
            return True
        return False

    def get_player(self, player_id: str) -> Optional[Player]:
        """获取玩家"""
        return self.players.get(player_id)

    def start_game(self) -> dict:
        """开始游戏"""
        if self._is_started:
            raise ValueError("游戏已经开始")
        if len(self.players) < 2:
            raise ValueError("至少需要2名玩家才能开始游戏")

        self._is_started = True
        player_list = list(self.players.values())
        self.turn_manager.initialize(player_list)

        # 开始第一回合
        round_info = self.turn_manager.start_new_round()

        return {
            "game_id": self.game_id,
            "message": "游戏开始！",
            "players": [p.to_dict() for p in player_list],
            "round_info": round_info
        }

    # ==================== 回合流程 ====================

    def start_turn(self) -> dict:
        """开始新回合"""
        if not self._is_started:
            raise ValueError("游戏尚未开始")
        if self._is_finished:
            raise ValueError("游戏已结束")

        return self.turn_manager.start_new_round()

    def draw_event_card(self) -> dict:
        """抽取事件卡"""
        if self.turn_manager.get_current_phase() != TurnPhase.TURN_START:
            # 自动推进到事件阶段
            self.turn_manager.advance_to_event_phase()

        event_card = self.event_deck.draw()
        if not event_card:
            return {"message": "事件卡已用完", "event": None}

        # 执行事件效果
        effect_result = self._apply_event_effect(event_card)

        # 如果是持续效果，添加到活跃效果列表
        if event_card.effect.effect_type == EventEffectType.PERSISTENT:
            self.event_deck.add_persistent_effect(event_card)

        # 检查是否为最终事件
        if event_card.effect.is_final_event:
            return self._handle_final_event(event_card)

        # 推进到玩家行动阶段
        self.turn_manager.advance_to_player_actions()

        return {
            "event": event_card.to_dict(),
            "effect_result": effect_result,
            "phase_info": self.turn_manager.to_dict()
        }

    def _apply_event_effect(self, event_card: EventCard) -> dict:
        """应用事件效果"""
        effect = event_card.effect
        result = {
            "event_id": event_card.event_id,
            "description": effect.description,
            "affected_players": [],
            "affected_factories": []
        }

        # 金钱变化
        if effect.money_change != 0:
            for player in self.players.values():
                player.add_money(effect.money_change)
                result["affected_players"].append({
                    "player_id": player.player_id,
                    "money_change": effect.money_change
                })

        # 收入暂停（针对特定产业）
        if effect.suspend_income_rounds > 0:
            for factory in self.factories.values():
                if factory.industry_card.industry_id in effect.affected_industries:
                    factory.is_income_suspended = True
                    factory.suspended_rounds = effect.suspend_income_rounds
                    result["affected_factories"].append({
                        "factory_id": factory.factory_id,
                        "effect": "income_suspended",
                        "rounds": effect.suspend_income_rounds
                    })

        return result

    def _handle_final_event(self, event_card: EventCard) -> dict:
        """处理最终事件"""
        # 进行最终收入结算
        final_settlement = self._calculate_final_settlement()

        # 结束游戏
        self._is_finished = True
        self.turn_manager.set_game_over(True)

        # 确定胜者
        winner = max(self.players.values(), key=lambda p: p.money)
        self._winner_id = winner.player_id

        return {
            "event": event_card.to_dict(),
            "is_final_event": True,
            "final_settlement": final_settlement,
            "winner": {
                "player_id": winner.player_id,
                "name": winner.name,
                "final_money": winner.money
            },
            "all_players_final": [
                {"player_id": p.player_id, "name": p.name, "money": p.money}
                for p in sorted(self.players.values(), key=lambda x: x.money, reverse=True)
            ]
        }

    def _calculate_final_settlement(self) -> dict:
        """计算最终结算"""
        active_events = self.event_deck.get_active_persistent_effects()
        factory_list = list(self.factories.values())

        settlement = {}
        for player_id in self.players:
            income_result = self.income_calculator.calculate_player_total_income(
                player_id, factory_list, active_events
            )
            self.players[player_id].add_money(income_result["total_income"])
            settlement[player_id] = income_result

        return settlement

    # ==================== 玩家行动 ====================

    def player_move(self, player_id: str, steps: int = 1) -> dict:
        """
        玩家移动

        规则：
        - 消耗1行动力
        - 移动1格（顺时针）
        """
        # 验证行动合法性
        can_act, reason = self.turn_manager.can_player_act(player_id)
        if not can_act:
            raise ValueError(reason)

        player = self.get_player(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 消耗行动力
        if not player.consume_action_point():
            raise ValueError("行动力不足")

        # 移动
        old_position = player.position
        new_position = self.board.get_next_position(old_position, steps)
        player.move_to(new_position)

        # 获取新位置的格子信息
        tile = self.board.get_tile(new_position)

        result = {
            "player_id": player_id,
            "action": "MOVE",
            "from_position": old_position,
            "to_position": new_position,
            "tile": tile.to_dict() if tile else None,
            "remaining_action_points": player.action_points
        }

        # 检查是否经过起点
        if self.board.passed_start(old_position, new_position):
            result["passed_start"] = True

        return result

    def player_build_factory(self, player_id: str, industry_id: str) -> dict:
        """
        玩家建厂

        规则：
        - 消耗1行动力
        - 检查当前位置是否为产业格
        - 检查产业是否可在当前阶段建设
        - 检查玩家是否有足够资金/人力
        """
        # 验证行动合法性
        can_act, reason = self.turn_manager.can_player_act(player_id)
        if not can_act:
            raise ValueError(reason)

        player = self.get_player(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 获取当前位置
        tile = self.board.get_tile(player.position)
        if not tile or not tile.is_industry_tile():
            raise ValueError("当前位置不是产业格")

        # 获取产业卡
        industry_card = INDUSTRY_REGISTRY.get_card(industry_id)
        if not industry_card:
            raise ValueError(f"产业 {industry_id} 不存在")

        # 检查格子是否允许该产业
        if not tile.can_build_industry(industry_id, self.stage_manager.current_stage):
            raise ValueError(f"该位置不允许建设 {industry_card.industry_name}")

        # 检查阶段和人力要求
        can_build, build_reason = self.stage_manager.can_build_industry(
            industry_card, player.has_advanced_human
        )
        if not can_build:
            raise ValueError(build_reason)

        # 检查该位置是否已有该玩家的同类工厂
        for factory in self.factories.values():
            if (factory.tile_index == player.position and
                factory.owner_player_id == player_id and
                factory.industry_card.industry_id == industry_id):
                raise ValueError("该位置已有同类工厂")

        # 消耗行动力
        if not player.consume_action_point():
            raise ValueError("行动力不足")

        # 创建工厂
        factory_id = str(uuid.uuid4())
        factory = Factory(
            factory_id=factory_id,
            owner_player_id=player_id,
            industry_card=industry_card,
            tile_index=player.position
        )
        self.factories[factory_id] = factory
        player.add_factory(factory_id)

        return {
            "player_id": player_id,
            "action": "BUILD_FACTORY",
            "factory_id": factory_id,
            "industry": {
                "id": industry_card.industry_id,
                "name": industry_card.industry_name,
                "category": industry_card.industry_category.value,
                "base_income": industry_card.base_income
            },
            "tile_index": player.position,
            "tile_name": tile.name,
            "remaining_action_points": player.action_points
        }

    def player_use_transport(self, player_id: str, destination_index: int) -> dict:
        """
        玩家使用运输系统

        规则：
        - 消耗1行动力
        - 当前位置必须是运输格
        - 目的地必须是有效的运输连接
        """
        # 验证行动合法性
        can_act, reason = self.turn_manager.can_player_act(player_id)
        if not can_act:
            raise ValueError(reason)

        player = self.get_player(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 获取当前位置
        tile = self.board.get_tile(player.position)
        if not tile or not tile.is_transport_tile():
            raise ValueError("当前位置不是运输格")

        # 验证目的地
        if not self.board.is_valid_transport_destination(player.position, destination_index):
            raise ValueError("无效的运输目的地")

        # 消耗行动力
        if not player.consume_action_point():
            raise ValueError("行动力不足")

        # 移动
        old_position = player.position
        player.move_to(destination_index)

        # 获取目的地格子信息
        dest_tile = self.board.get_tile(destination_index)

        # 获取使用的运输连接信息
        transport_info = None
        for conn in tile.transport_connections:
            if conn.destination_index == destination_index:
                transport_info = {
                    "type": conn.transport_type.value,
                    "name": conn.name
                }
                break

        return {
            "player_id": player_id,
            "action": "USE_TRANSPORT",
            "from_position": old_position,
            "from_tile": tile.name,
            "to_position": destination_index,
            "to_tile": dest_tile.name if dest_tile else None,
            "transport": transport_info,
            "remaining_action_points": player.action_points
        }

    def player_end_turn(self, player_id: str) -> dict:
        """玩家结束回合"""
        if not self.turn_manager.is_current_player(player_id):
            raise ValueError("不是你的回合")

        return self.turn_manager.end_current_player_turn()

    # ==================== 回合结束处理 ====================

    def end_round(self) -> dict:
        """结束回合并进行结算"""
        if not self.turn_manager.is_round_complete():
            raise ValueError("回合尚未完成")

        # 计算所有玩家收入
        active_events = self.event_deck.get_active_persistent_effects()
        factory_list = list(self.factories.values())

        income_results = {}
        for player_id, player in self.players.items():
            income_result = self.income_calculator.calculate_player_total_income(
                player_id, factory_list, active_events
            )
            player.add_money(income_result["total_income"])
            income_results[player_id] = income_result

        # 更新工厂暂停状态
        for factory in self.factories.values():
            if factory.is_income_suspended and factory.suspended_rounds > 0:
                factory.suspended_rounds -= 1
                if factory.suspended_rounds <= 0:
                    factory.is_income_suspended = False

        # 检查阶段转换
        stage_transition = None
        if self.stage_manager.can_transition_to_stage_two(self.turn_manager.get_current_round()):
            self.stage_manager.transition_to_stage_two()
            stage_transition = {
                "message": "进入第二阶段！解锁更多产业和高级人力",
                "stage_info": self.stage_manager.get_stage_description()
            }

        return {
            "round": self.turn_manager.get_current_round(),
            "income_results": income_results,
            "stage_transition": stage_transition,
            "player_standings": [
                {"player_id": p.player_id, "name": p.name, "money": p.money}
                for p in sorted(self.players.values(), key=lambda x: x.money, reverse=True)
            ]
        }

    # ==================== 查询方法 ====================

    def get_available_actions(self, player_id: str) -> list[dict]:
        """获取玩家可执行的行动列表"""
        actions = []
        player = self.get_player(player_id)

        if not player or not player.has_action_points():
            return actions

        can_act, _ = self.turn_manager.can_player_act(player_id)
        if not can_act:
            return actions

        tile = self.board.get_tile(player.position)

        # 1. 移动
        actions.append({
            "action": ActionType.MOVE.value,
            "description": "移动1格（顺时针）",
            "cost": 1
        })

        # 2. 建厂（如果在产业格）
        if tile and tile.is_industry_tile():
            available_industries = []
            for industry_id in tile.allowed_industries:
                industry = INDUSTRY_REGISTRY.get_card(industry_id)
                if industry:
                    can_build, reason = self.stage_manager.can_build_industry(
                        industry, player.has_advanced_human
                    )
                    available_industries.append({
                        "industry_id": industry_id,
                        "name": industry.industry_name,
                        "can_build": can_build,
                        "reason": reason if not can_build else None
                    })

            if available_industries:
                actions.append({
                    "action": ActionType.BUILD_FACTORY.value,
                    "description": "建立工厂",
                    "cost": 1,
                    "available_industries": available_industries
                })

        # 3. 使用运输（如果在运输格）
        if tile and tile.is_transport_tile():
            destinations = []
            for conn in tile.transport_connections:
                dest_tile = self.board.get_tile(conn.destination_index)
                destinations.append({
                    "index": conn.destination_index,
                    "name": dest_tile.name if dest_tile else f"格子{conn.destination_index}",
                    "transport_type": conn.transport_type.value,
                    "route_name": conn.name
                })

            if destinations:
                actions.append({
                    "action": ActionType.USE_TRANSPORT.value,
                    "description": "使用运输系统",
                    "cost": 1,
                    "destinations": destinations
                })

        return actions

    def get_player_factories(self, player_id: str) -> list[dict]:
        """获取玩家的工厂列表"""
        factories = []
        for factory in self.factories.values():
            if factory.owner_player_id == player_id:
                tile = self.board.get_tile(factory.tile_index)
                factories.append({
                    "factory_id": factory.factory_id,
                    "industry_id": factory.industry_card.industry_id,
                    "industry_name": factory.industry_card.industry_name,
                    "tile_index": factory.tile_index,
                    "tile_name": tile.name if tile else None,
                    "base_income": factory.industry_card.base_income,
                    "is_suspended": factory.is_income_suspended,
                    "suspended_rounds": factory.suspended_rounds
                })
        return factories

    def is_started(self) -> bool:
        """游戏是否已开始"""
        return self._is_started

    def is_finished(self) -> bool:
        """游戏是否已结束"""
        return self._is_finished

    def get_winner(self) -> Optional[Player]:
        """获取胜利者"""
        if self._winner_id:
            return self.players.get(self._winner_id)
        return None

    def to_dict(self) -> dict:
        """转换为完整的游戏状态字典"""
        return {
            "game_id": self.game_id,
            "is_started": self._is_started,
            "is_finished": self._is_finished,
            "winner_id": self._winner_id,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "factories": {
                fid: {
                    "factory_id": f.factory_id,
                    "owner_player_id": f.owner_player_id,
                    "industry_id": f.industry_card.industry_id,
                    "industry_name": f.industry_card.industry_name,
                    "tile_index": f.tile_index,
                    "is_suspended": f.is_income_suspended
                }
                for fid, f in self.factories.items()
            },
            "board": self.board.to_dict(),
            "stage": self.stage_manager.to_dict(),
            "turn": self.turn_manager.to_dict(),
            "event_deck": self.event_deck.to_dict()
        }
