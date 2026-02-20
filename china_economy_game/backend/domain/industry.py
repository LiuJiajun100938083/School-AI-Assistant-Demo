"""
Domain - 产业卡系统
定义所有产业卡及其属性
"""
from dataclasses import dataclass, field
from typing import Optional
from .enums import IndustryCategory, GameStage, HumanType


@dataclass
class IndustryCard:
    """产业卡"""
    industry_id: str                    # 产业唯一标识
    industry_name: str                  # 产业名称
    industry_category: IndustryCategory # 产业类别（第二/第三产业）
    stage: GameStage                    # 所属阶段
    human_land_required: int            # 人力土地需求
    human_type_required: HumanType      # 需要的人力类型
    base_income: int                    # 基础收入
    synergy_bonus: int                  # 同业优势加成

    def can_build_in_stage(self, current_stage: GameStage) -> bool:
        """判断在当前阶段是否可以建设"""
        if self.stage == GameStage.STAGE_ONE:
            return True  # 第一阶段产业在任何阶段都可建
        return current_stage == GameStage.STAGE_TWO


@dataclass
class Factory:
    """工厂实例 - 玩家在某格子上建立的工厂"""
    factory_id: str
    owner_player_id: str
    industry_card: IndustryCard
    tile_index: int
    is_income_suspended: bool = False   # 收入是否暂停
    suspended_rounds: int = 0           # 剩余暂停回合数
    extra_income_modifier: int = 0      # 额外收入修正（来自事件等）
    extra_cost: int = 0                 # 额外成本（来自事件等）


class IndustryRegistry:
    """产业卡注册表 - 管理所有产业卡定义"""

    def __init__(self):
        self._cards: dict[str, IndustryCard] = {}
        self._initialize_stage_one_cards()
        self._initialize_stage_two_cards()

    def _initialize_stage_one_cards(self):
        """初始化第一阶段产业卡"""
        stage_one_cards = [
            IndustryCard(
                industry_id="S1_FOOD",
                industry_name="食品",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_ONE,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S1_FURNITURE",
                industry_name="家具",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_ONE,
                human_land_required=3,
                human_type_required=HumanType.NONE,
                base_income=8,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S1_TEXTILE",
                industry_name="纺织及成衣",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_ONE,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S1_APPLIANCE",
                industry_name="家电及电器",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_ONE,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S1_HEAVY",
                industry_name="重工",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_ONE,
                human_land_required=3,
                human_type_required=HumanType.NONE,
                base_income=8,
                synergy_bonus=3
            ),
        ]
        for card in stage_one_cards:
            self._cards[card.industry_id] = card

    def _initialize_stage_two_cards(self):
        """初始化第二阶段产业卡"""
        stage_two_cards = [
            # 第二产业
            IndustryCard(
                industry_id="S2_FOOD",
                industry_name="食品",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S2_FURNITURE",
                industry_name="家具",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=3,
                human_type_required=HumanType.NONE,
                base_income=8,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S2_TEXTILE",
                industry_name="纺织及成衣",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S2_PETROCHEMICAL",
                industry_name="石油化工",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=3,
                human_type_required=HumanType.NONE,
                base_income=8,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S2_HEAVY",
                industry_name="重工",
                industry_category=IndustryCategory.SECONDARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=3,
                human_type_required=HumanType.NONE,
                base_income=8,
                synergy_bonus=3
            ),
            # 第三产业
            IndustryCard(
                industry_id="S2_MEDICINE",
                industry_name="医药",
                industry_category=IndustryCategory.TERTIARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=5,
                synergy_bonus=3
            ),
            IndustryCard(
                industry_id="S2_TOURISM",
                industry_name="旅游及文化",
                industry_category=IndustryCategory.TERTIARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=2,
                human_type_required=HumanType.NONE,
                base_income=7,
                synergy_bonus=12
            ),
            IndustryCard(
                industry_id="S2_FINANCE",
                industry_name="金融",
                industry_category=IndustryCategory.TERTIARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=3,
                human_type_required=HumanType.ADVANCED,
                base_income=16,
                synergy_bonus=9
            ),
            IndustryCard(
                industry_id="S2_HIGHTECH",
                industry_name="高新技术",
                industry_category=IndustryCategory.TERTIARY,
                stage=GameStage.STAGE_TWO,
                human_land_required=3,
                human_type_required=HumanType.ADVANCED,
                base_income=16,
                synergy_bonus=8
            ),
        ]
        for card in stage_two_cards:
            self._cards[card.industry_id] = card

    def get_card(self, industry_id: str) -> Optional[IndustryCard]:
        """获取产业卡"""
        return self._cards.get(industry_id)

    def get_all_cards(self) -> list[IndustryCard]:
        """获取所有产业卡"""
        return list(self._cards.values())

    def get_cards_by_stage(self, stage: GameStage) -> list[IndustryCard]:
        """获取指定阶段的产业卡"""
        return [card for card in self._cards.values() if card.stage == stage]

    def get_available_cards(self, current_stage: GameStage) -> list[IndustryCard]:
        """获取当前阶段可用的产业卡"""
        return [card for card in self._cards.values()
                if card.can_build_in_stage(current_stage)]


# 全局产业卡注册表实例
INDUSTRY_REGISTRY = IndustryRegistry()
