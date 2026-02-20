"""
Domain - 事件卡系统
定义所有事件卡及其效果
"""
from dataclasses import dataclass, field
from typing import Callable, Optional, TYPE_CHECKING
from enum import Enum
import random

if TYPE_CHECKING:
    from .game_state import GameState


class EventEffectType(Enum):
    """事件效果类型"""
    IMMEDIATE = "IMMEDIATE"       # 立即生效
    PERSISTENT = "PERSISTENT"     # 持续效果
    END_GAME = "END_GAME"         # 游戏结束


@dataclass
class EventEffect:
    """事件效果"""
    effect_type: EventEffectType
    description: str
    # 效果参数
    money_change: int = 0                    # 金钱变化（所有玩家）
    income_modifier: int = 0                 # 收入修正
    affected_industries: list[str] = field(default_factory=list)  # 受影响的产业
    excluded_industries: list[str] = field(default_factory=list)  # 排除的产业
    suspend_income_rounds: int = 0           # 暂停收入回合数
    extra_cost: int = 0                      # 额外成本
    free_build_cities: list[str] = field(default_factory=list)    # 免费建设城市
    is_final_event: bool = False             # 是否为最终事件


@dataclass
class EventCard:
    """事件卡"""
    event_id: str                    # 事件唯一标识
    name: str                        # 事件名称
    year: int                        # 事件年份
    description: str                 # 事件描述
    effect: EventEffect              # 事件效果

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "event_id": self.event_id,
            "name": self.name,
            "year": self.year,
            "description": self.description,
            "effect": {
                "type": self.effect.effect_type.value,
                "description": self.effect.description,
                "money_change": self.effect.money_change,
                "income_modifier": self.effect.income_modifier,
                "affected_industries": self.effect.affected_industries,
                "excluded_industries": self.effect.excluded_industries,
                "suspend_income_rounds": self.effect.suspend_income_rounds,
                "is_final_event": self.effect.is_final_event
            }
        }


class EventDeck:
    """事件卡牌堆"""

    def __init__(self):
        self._cards: list[EventCard] = []
        self._discard_pile: list[EventCard] = []
        self._current_event: Optional[EventCard] = None
        self._active_persistent_effects: list[EventCard] = []
        self._initialize_cards()

    def _initialize_cards(self):
        """初始化所有事件卡"""
        events = [
            # 1. 改革伊始（1977）
            EventCard(
                event_id="EVT_1977_REFORM_BEGIN",
                name="改革伊始",
                year=1977,
                description="改革开放的序幕拉开，玩家获得启动资金，深圳、珠海等经济特区开放建设。",
                effect=EventEffect(
                    effect_type=EventEffectType.IMMEDIATE,
                    description="所有玩家获得50元启动资金，深圳、广州区域可免费建设一次",
                    money_change=50,
                    free_build_cities=["深圳", "广州"]
                )
            ),

            # 2. 一个窗口对外 / 一个国营城市（1982）
            EventCard(
                event_id="EVT_1982_WINDOW",
                name="一个窗口对外",
                year=1982,
                description="经济特区政策深化，在特定城市设厂不消耗行动力。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="本回合在深圳、珠海设厂不消耗行动力",
                    free_build_cities=["深圳", "珠海", "厦门", "汕头"]
                )
            ),

            # 3. 物价闯关（1988）
            EventCard(
                event_id="EVT_1988_PRICE_REFORM",
                name="物价闯关",
                year=1988,
                description="价格改革带来通货膨胀，大部分产业收入下降。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="除食品、医药外，其余产业收入-3",
                    income_modifier=-3,
                    excluded_industries=["S1_FOOD", "S2_FOOD", "S2_MEDICINE"]
                )
            ),

            # 4. 小平南巡（1992）
            EventCard(
                event_id="EVT_1992_SOUTHERN_TOUR",
                name="小平南巡",
                year=1992,
                description="邓小平南巡讲话，改革开放加速，市场经济活力迸发。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="所有工厂额外收入+3",
                    income_modifier=3
                )
            ),

            # 5. 中国入世（2001）
            EventCard(
                event_id="EVT_2001_WTO",
                name="中国入世",
                year=2001,
                description="中国加入世界贸易组织，全球化带来工业出口增强。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="第二产业工厂收入+5",
                    income_modifier=5,
                    affected_industries=[
                        "S1_FOOD", "S1_FURNITURE", "S1_TEXTILE", "S1_APPLIANCE", "S1_HEAVY",
                        "S2_FOOD", "S2_FURNITURE", "S2_TEXTILE", "S2_PETROCHEMICAL", "S2_HEAVY"
                    ]
                )
            ),

            # 6. 十一五规划（2011）
            EventCard(
                event_id="EVT_2011_11TH_PLAN",
                name="十一五规划",
                year=2011,
                description="节能减排成为国策，重工业和石化产业面临环保压力。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="重工、石化产业需支付额外成本3元/回合",
                    extra_cost=3,
                    affected_industries=["S1_HEAVY", "S2_HEAVY", "S2_PETROCHEMICAL"]
                )
            ),

            # 7. 十三五规划（2016）
            EventCard(
                event_id="EVT_2016_13TH_PLAN",
                name="十三五规划",
                year=2016,
                description="创新驱动发展战略，高新技术和绿色产业获得政策支持。",
                effect=EventEffect(
                    effect_type=EventEffectType.PERSISTENT,
                    description="高新技术产业额外收入+5",
                    income_modifier=5,
                    affected_industries=["S2_HIGHTECH"]
                )
            ),

            # 8. 中美角力白热化（2018）
            EventCard(
                event_id="EVT_2018_TRADE_WAR",
                name="中美角力白热化",
                year=2018,
                description="中美贸易摩擦加剧，高科技产业受到制裁影响。",
                effect=EventEffect(
                    effect_type=EventEffectType.IMMEDIATE,
                    description="高科技产业暂停收入1回合",
                    suspend_income_rounds=1,
                    affected_industries=["S2_HIGHTECH"]
                )
            ),

            # 9. 新冠病毒全球大流行（2020）
            EventCard(
                event_id="EVT_2020_COVID",
                name="新冠病毒全球大流行",
                year=2020,
                description="疫情冲击全球经济，医药产业需求激增，旅游业停摆。",
                effect=EventEffect(
                    effect_type=EventEffectType.IMMEDIATE,
                    description="医药产业收入+4，旅游及文化产业暂停收入1回合，其他工厂收入-4",
                    income_modifier=-4,
                    excluded_industries=["S2_MEDICINE", "S2_TOURISM"],
                    suspend_income_rounds=1,
                    affected_industries=["S2_TOURISM"]  # 专门针对旅游业暂停
                )
            ),

            # 10. 中国制造2025（最终事件）
            EventCard(
                event_id="EVT_2025_MADE_IN_CHINA",
                name="中国制造2025",
                year=2025,
                description="制造强国战略达成，进行最终收入结算。",
                effect=EventEffect(
                    effect_type=EventEffectType.END_GAME,
                    description="最终事件：所有玩家进行最终一次工厂收入结算",
                    is_final_event=True
                )
            ),
        ]

        self._cards = events
        self._shuffle()

    def _shuffle(self):
        """洗牌（保证最终事件在最后）"""
        # 分离最终事件
        final_event = None
        regular_cards = []
        for card in self._cards:
            if card.effect.is_final_event:
                final_event = card
            else:
                regular_cards.append(card)

        # 打乱普通卡
        random.shuffle(regular_cards)

        # 最终事件放在最后
        self._cards = regular_cards
        if final_event:
            self._cards.append(final_event)

    def draw(self) -> Optional[EventCard]:
        """抽取一张事件卡"""
        if not self._cards:
            return None
        card = self._cards.pop(0)
        self._current_event = card
        return card

    def get_current_event(self) -> Optional[EventCard]:
        """获取当前事件卡"""
        return self._current_event

    def add_persistent_effect(self, card: EventCard):
        """添加持续效果"""
        if card.effect.effect_type == EventEffectType.PERSISTENT:
            self._active_persistent_effects.append(card)

    def get_active_persistent_effects(self) -> list[EventCard]:
        """获取当前活跃的持续效果"""
        return self._active_persistent_effects.copy()

    def clear_persistent_effect(self, event_id: str):
        """清除指定的持续效果"""
        self._active_persistent_effects = [
            e for e in self._active_persistent_effects
            if e.event_id != event_id
        ]

    def discard_current(self):
        """将当前事件卡放入弃牌堆"""
        if self._current_event:
            self._discard_pile.append(self._current_event)
            self._current_event = None

    def remaining_count(self) -> int:
        """剩余卡牌数量"""
        return len(self._cards)

    def is_empty(self) -> bool:
        """卡牌堆是否为空"""
        return len(self._cards) == 0

    def reset(self):
        """重置卡牌堆"""
        self._cards.extend(self._discard_pile)
        self._discard_pile.clear()
        self._current_event = None
        self._active_persistent_effects.clear()
        self._shuffle()

    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "remaining_count": self.remaining_count(),
            "current_event": self._current_event.to_dict() if self._current_event else None,
            "active_effects_count": len(self._active_persistent_effects),
            "active_effects": [e.to_dict() for e in self._active_persistent_effects]
        }
