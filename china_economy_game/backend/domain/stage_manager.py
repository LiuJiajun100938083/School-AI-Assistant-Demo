"""
Domain - 阶段管理器
管理游戏阶段（第一阶段/第二阶段）的转换和规则
"""
from .enums import GameStage, HumanType
from .industry import IndustryCard, INDUSTRY_REGISTRY


class StageManager:
    """游戏阶段管理器"""

    def __init__(self):
        self._current_stage: GameStage = GameStage.STAGE_ONE
        self._stage_transition_triggered: bool = False

    @property
    def current_stage(self) -> GameStage:
        """获取当前阶段"""
        return self._current_stage

    def is_stage_one(self) -> bool:
        """是否为第一阶段"""
        return self._current_stage == GameStage.STAGE_ONE

    def is_stage_two(self) -> bool:
        """是否为第二阶段"""
        return self._current_stage == GameStage.STAGE_TWO

    def can_transition_to_stage_two(self, current_round: int, trigger_conditions: dict = None) -> bool:
        """
        判断是否可以进入第二阶段

        触发条件（可配置）：
        - 回合数达到阈值
        - 特定事件触发
        - 其他自定义条件
        """
        if self._current_stage == GameStage.STAGE_TWO:
            return False

        # 默认条件：第5回合后自动进入第二阶段
        default_round_threshold = 5

        if trigger_conditions:
            round_threshold = trigger_conditions.get("round_threshold", default_round_threshold)
            event_trigger = trigger_conditions.get("event_trigger", False)
            if event_trigger:
                return True
            return current_round >= round_threshold

        return current_round >= default_round_threshold

    def transition_to_stage_two(self) -> bool:
        """
        转换到第二阶段

        返回是否成功转换
        """
        if self._current_stage == GameStage.STAGE_TWO:
            return False

        self._current_stage = GameStage.STAGE_TWO
        self._stage_transition_triggered = True
        return True

    def get_available_industries(self) -> list[IndustryCard]:
        """获取当前阶段可用的产业卡"""
        return INDUSTRY_REGISTRY.get_available_cards(self._current_stage)

    def can_use_advanced_human(self) -> bool:
        """
        是否可以使用高级人力

        规则：第一阶段不存在高级人力
        """
        return self._current_stage == GameStage.STAGE_TWO

    def can_build_industry(self, industry_card: IndustryCard, player_has_advanced_human: bool) -> tuple[bool, str]:
        """
        判断是否可以建设指定产业

        返回: (是否可建设, 原因说明)
        """
        # 检查阶段
        if not industry_card.can_build_in_stage(self._current_stage):
            return False, f"该产业需要在第二阶段才能建设"

        # 检查人力要求
        if industry_card.human_type_required == HumanType.ADVANCED:
            if not self.can_use_advanced_human():
                return False, "第一阶段无法使用高级人力"
            if not player_has_advanced_human:
                return False, "玩家没有高级人力"

        return True, "可以建设"

    def get_stage_description(self) -> dict:
        """获取当前阶段描述"""
        if self.is_stage_one():
            return {
                "stage": 1,
                "name": "第一阶段",
                "description": "改革开放初期，仅允许建设第一阶段产业，所有产业为第二产业，不存在高级人力",
                "allowed_categories": ["第二产业"],
                "advanced_human_available": False
            }
        else:
            return {
                "stage": 2,
                "name": "第二阶段",
                "description": "经济腾飞期，解锁第二阶段产业卡和第三产业，开始区分人力类型",
                "allowed_categories": ["第二产业", "第三产业"],
                "advanced_human_available": True
            }

    def reset(self):
        """重置到初始状态"""
        self._current_stage = GameStage.STAGE_ONE
        self._stage_transition_triggered = False

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "current_stage": self._current_stage.value,
            "is_stage_one": self.is_stage_one(),
            "is_stage_two": self.is_stage_two(),
            "stage_info": self.get_stage_description()
        }
