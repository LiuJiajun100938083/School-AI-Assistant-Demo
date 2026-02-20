"""
Domain - 计算器
收入计算和同业优势计算
"""
from typing import TYPE_CHECKING
from collections import defaultdict

if TYPE_CHECKING:
    from .game_state import GameState
    from .industry import Factory
    from .event_card import EventCard


class SynergyCalculator:
    """同业优势计算器"""

    @staticmethod
    def calculate_synergy_bonus(factories: list['Factory'], target_factory: 'Factory') -> int:
        """
        计算指定工厂的同业优势加成

        规则：
        - 玩家在同一产业拥有多家工厂时
        - 每家工厂额外获得同业优势收入
        - 同业优势数值取决于产业卡本身
        """
        # 统计同一玩家同一产业的工厂数量
        same_industry_count = sum(
            1 for f in factories
            if f.owner_player_id == target_factory.owner_player_id
            and f.industry_card.industry_name == target_factory.industry_card.industry_name
        )

        # 如果有2家或以上同产业工厂，才有同业优势
        if same_industry_count >= 2:
            return target_factory.industry_card.synergy_bonus
        return 0

    @staticmethod
    def get_player_synergy_summary(factories: list['Factory'], player_id: str) -> dict:
        """
        获取玩家的同业优势汇总

        返回: {产业名称: {"count": 数量, "bonus_per_factory": 单厂加成, "total_bonus": 总加成}}
        """
        player_factories = [f for f in factories if f.owner_player_id == player_id]

        # 按产业分组
        industry_groups = defaultdict(list)
        for f in player_factories:
            industry_groups[f.industry_card.industry_name].append(f)

        summary = {}
        for industry_name, factory_list in industry_groups.items():
            count = len(factory_list)
            if count >= 2:
                bonus_per_factory = factory_list[0].industry_card.synergy_bonus
                total_bonus = bonus_per_factory * count
            else:
                bonus_per_factory = 0
                total_bonus = 0

            summary[industry_name] = {
                "count": count,
                "bonus_per_factory": bonus_per_factory,
                "total_bonus": total_bonus
            }

        return summary


class IncomeCalculator:
    """收入计算器"""

    def __init__(self, synergy_calculator: SynergyCalculator = None):
        self.synergy_calculator = synergy_calculator or SynergyCalculator()

    def calculate_factory_income(
        self,
        factory: 'Factory',
        all_factories: list['Factory'],
        active_events: list['EventCard']
    ) -> dict:
        """
        计算单个工厂的收入

        返回详细的收入分解:
        {
            "base_income": 基础收入,
            "synergy_bonus": 同业优势加成,
            "event_modifier": 事件修正,
            "extra_cost": 额外成本,
            "is_suspended": 是否暂停,
            "total": 总收入
        }
        """
        result = {
            "factory_id": factory.factory_id,
            "industry_name": factory.industry_card.industry_name,
            "base_income": 0,
            "synergy_bonus": 0,
            "event_modifier": 0,
            "extra_cost": 0,
            "is_suspended": False,
            "total": 0
        }

        # 检查是否暂停收入
        if factory.is_income_suspended and factory.suspended_rounds > 0:
            result["is_suspended"] = True
            return result

        # 1. 基础收入
        result["base_income"] = factory.industry_card.base_income

        # 2. 同业优势加成
        result["synergy_bonus"] = self.synergy_calculator.calculate_synergy_bonus(
            all_factories, factory
        )

        # 3. 事件修正
        event_income_mod = 0
        event_cost = 0
        industry_id = factory.industry_card.industry_id

        for event in active_events:
            effect = event.effect

            # 检查是否为受影响的产业
            is_affected = False
            is_excluded = industry_id in effect.excluded_industries

            if effect.affected_industries:
                # 如果指定了受影响产业，检查是否在列表中
                is_affected = industry_id in effect.affected_industries
            else:
                # 如果没有指定，则所有产业都受影响（除了排除的）
                is_affected = not is_excluded

            if is_affected and not is_excluded:
                event_income_mod += effect.income_modifier
                event_cost += effect.extra_cost

        result["event_modifier"] = event_income_mod
        result["extra_cost"] = event_cost + factory.extra_cost

        # 4. 计算总收入
        total = (
            result["base_income"]
            + result["synergy_bonus"]
            + result["event_modifier"]
            + factory.extra_income_modifier
            - result["extra_cost"]
        )
        result["total"] = max(0, total)  # 收入不能为负

        return result

    def calculate_player_total_income(
        self,
        player_id: str,
        all_factories: list['Factory'],
        active_events: list['EventCard']
    ) -> dict:
        """
        计算玩家所有工厂的总收入

        返回:
        {
            "player_id": 玩家ID,
            "factories": [各工厂收入详情],
            "total_income": 总收入,
            "synergy_summary": 同业优势汇总
        }
        """
        player_factories = [f for f in all_factories if f.owner_player_id == player_id]

        factory_incomes = []
        total_income = 0

        for factory in player_factories:
            income_detail = self.calculate_factory_income(
                factory, all_factories, active_events
            )
            factory_incomes.append(income_detail)
            total_income += income_detail["total"]

        synergy_summary = self.synergy_calculator.get_player_synergy_summary(
            all_factories, player_id
        )

        return {
            "player_id": player_id,
            "factories": factory_incomes,
            "total_income": total_income,
            "synergy_summary": synergy_summary
        }

    def calculate_all_players_income(
        self,
        player_ids: list[str],
        all_factories: list['Factory'],
        active_events: list['EventCard']
    ) -> dict:
        """计算所有玩家的收入"""
        results = {}
        for player_id in player_ids:
            results[player_id] = self.calculate_player_total_income(
                player_id, all_factories, active_events
            )
        return results
