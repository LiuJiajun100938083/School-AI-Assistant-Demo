"""
中国经济发展桌游 - FastAPI 路由
粤港澳大湾区版本 - 基于网络地图的移动系统
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List, Set
from dataclasses import dataclass, field
from enum import Enum
import uuid
import random
from collections import defaultdict

# ==================== 枚举定义 ====================

class GameStage(Enum):
    STAGE_ONE = 1
    STAGE_TWO = 2

class RouteType(Enum):
    ROAD = "公路"
    HSR = "高铁"
    HUMEN_BRIDGE = "虎门大桥"
    HSR_HK = "广深港高铁"
    SZ_ZS_LINK = "深中通道"
    HZMB = "港珠澳大桥"
    FERRY = "轮渡"

class IndustryCategory(Enum):
    SECONDARY = "第二产业"
    TERTIARY = "第三产业"

class HumanType(Enum):
    NONE = "无"
    ADVANCED = "高级人力"

class TurnPhase(Enum):
    WAITING_START = "waiting_start"       # 等待开始新回合
    EVENT_REVEALED = "event_revealed"     # 事件卡已翻开
    PLAYER_ACTIONS = "player_actions"     # 玩家行动阶段
    ROUND_SETTLING = "round_settling"     # 回合结算中
    GAME_OVER = "game_over"               # 游戏结束

class RoomStatus(Enum):
    WAITING = "WAITING"
    IN_GAME = "IN_GAME"

class EventEffectType(Enum):
    IMMEDIATE = "IMMEDIATE"
    PERSISTENT = "PERSISTENT"
    END_GAME = "END_GAME"

# ==================== 数据类 ====================

@dataclass
class IndustryCard:
    industry_id: str
    industry_name: str
    industry_category: IndustryCategory
    stage: GameStage
    human_land_required: int
    human_type_required: HumanType
    base_income: int
    synergy_bonus: int

    def can_build_in_stage(self, current_stage: GameStage) -> bool:
        if self.stage == GameStage.STAGE_ONE:
            return True
        return current_stage == GameStage.STAGE_TWO

@dataclass
class Factory:
    factory_id: str
    owner_player_id: str
    industry_card: IndustryCard
    city: str
    is_income_suspended: bool = False
    suspended_rounds: int = 0
    extra_income_modifier: int = 0

@dataclass
class Route:
    """城市之间的连接路线"""
    route_type: RouteType
    city_a: str
    city_b: str

    def connects(self, city: str) -> Optional[str]:
        """如果此路线连接给定城市，返回另一端城市"""
        if city == self.city_a:
            return self.city_b
        elif city == self.city_b:
            return self.city_a
        return None

@dataclass
class City:
    """城市节点"""
    city_id: str
    name: str
    allowed_industries: List[str] = field(default_factory=list)
    max_factories: int = 3  # 每个城市最多建多少工厂

    def to_dict(self):
        return {
            "city_id": self.city_id,
            "name": self.name,
            "allowed_industries": self.allowed_industries,
            "max_factories": self.max_factories
        }

@dataclass
class Player:
    player_id: str
    name: str
    color: str = ""
    money: int = 30
    position: str = "shenzhen"  # 城市ID
    action_points: int = 0
    has_advanced_human: bool = False
    factories: list = field(default_factory=list)

    def to_dict(self):
        return {
            "player_id": self.player_id,
            "name": self.name,
            "color": self.color,
            "money": self.money,
            "position": self.position,
            "action_points": self.action_points,
            "has_advanced_human": self.has_advanced_human,
            "factory_count": len(self.factories)
        }

@dataclass
class EventEffect:
    effect_type: EventEffectType
    description: str
    money_change: int = 0
    income_modifier: int = 0
    affected_industries: list = field(default_factory=list)
    excluded_industries: list = field(default_factory=list)
    suspend_income_rounds: int = 0
    extra_cost: int = 0
    free_build_cities: list = field(default_factory=list)
    is_final_event: bool = False
    trigger_stage_two: bool = False

@dataclass
class EventCard:
    event_id: str
    name: str
    year: int
    description: str
    effect: EventEffect

    def to_dict(self):
        return {
            "event_id": self.event_id,
            "name": self.name,
            "year": self.year,
            "description": self.description,
            "effect": {
                "type": self.effect.effect_type.value,
                "description": self.effect.description,
                "is_final_event": self.effect.is_final_event
            }
        }

# ==================== 产业卡注册表 ====================

INDUSTRY_CARDS = {
    # 第一阶段产业
    "S1_FOOD": IndustryCard("S1_FOOD", "食品", IndustryCategory.SECONDARY, GameStage.STAGE_ONE, 2, HumanType.NONE, 5, 3),
    "S1_FURNITURE": IndustryCard("S1_FURNITURE", "家具", IndustryCategory.SECONDARY, GameStage.STAGE_ONE, 3, HumanType.NONE, 8, 3),
    "S1_TEXTILE": IndustryCard("S1_TEXTILE", "纺织及成衣", IndustryCategory.SECONDARY, GameStage.STAGE_ONE, 2, HumanType.NONE, 5, 3),
    "S1_APPLIANCE": IndustryCard("S1_APPLIANCE", "家电及电器", IndustryCategory.SECONDARY, GameStage.STAGE_ONE, 2, HumanType.NONE, 5, 3),
    "S1_HEAVY": IndustryCard("S1_HEAVY", "重工", IndustryCategory.SECONDARY, GameStage.STAGE_ONE, 3, HumanType.NONE, 8, 3),
    # 第二阶段产业
    "S2_FOOD": IndustryCard("S2_FOOD", "食品", IndustryCategory.SECONDARY, GameStage.STAGE_TWO, 2, HumanType.NONE, 5, 3),
    "S2_FURNITURE": IndustryCard("S2_FURNITURE", "家具", IndustryCategory.SECONDARY, GameStage.STAGE_TWO, 3, HumanType.NONE, 8, 3),
    "S2_TEXTILE": IndustryCard("S2_TEXTILE", "纺织及成衣", IndustryCategory.SECONDARY, GameStage.STAGE_TWO, 2, HumanType.NONE, 5, 3),
    "S2_PETROCHEMICAL": IndustryCard("S2_PETROCHEMICAL", "石油化工", IndustryCategory.SECONDARY, GameStage.STAGE_TWO, 3, HumanType.NONE, 8, 3),
    "S2_HEAVY": IndustryCard("S2_HEAVY", "重工", IndustryCategory.SECONDARY, GameStage.STAGE_TWO, 3, HumanType.NONE, 8, 3),
    "S2_MEDICINE": IndustryCard("S2_MEDICINE", "医药", IndustryCategory.TERTIARY, GameStage.STAGE_TWO, 2, HumanType.NONE, 5, 3),
    "S2_TOURISM": IndustryCard("S2_TOURISM", "旅游及文化", IndustryCategory.TERTIARY, GameStage.STAGE_TWO, 2, HumanType.NONE, 7, 12),
    "S2_FINANCE": IndustryCard("S2_FINANCE", "金融", IndustryCategory.TERTIARY, GameStage.STAGE_TWO, 3, HumanType.ADVANCED, 16, 9),
    "S2_HIGHTECH": IndustryCard("S2_HIGHTECH", "高新技术", IndustryCategory.TERTIARY, GameStage.STAGE_TWO, 3, HumanType.ADVANCED, 16, 8),
}

# ==================== 大湾区地图定义 ====================

def create_gba_map():
    """创建粤港澳大湾区地图"""

    # 11个城市
    cities = {
        "zhaoqing": City("zhaoqing", "肇庆", ["S1_FOOD", "S1_FURNITURE", "S2_FOOD", "S2_FURNITURE"]),
        "jiangmen": City("jiangmen", "江门", ["S1_TEXTILE", "S1_APPLIANCE", "S2_TEXTILE"]),
        "foshan": City("foshan", "佛山", ["S1_FURNITURE", "S1_APPLIANCE", "S2_FURNITURE"]),
        "guangzhou": City("guangzhou", "广州", ["S1_TEXTILE", "S1_HEAVY", "S2_TEXTILE", "S2_HEAVY", "S2_FINANCE"]),
        "zhongshan": City("zhongshan", "中山", ["S1_APPLIANCE", "S1_FOOD", "S2_FOOD"]),
        "dongguan": City("dongguan", "东莞", ["S1_TEXTILE", "S1_APPLIANCE", "S2_TEXTILE", "S2_HIGHTECH"]),
        "huizhou": City("huizhou", "惠州", ["S1_HEAVY", "S2_HEAVY", "S2_PETROCHEMICAL"]),
        "shenzhen": City("shenzhen", "深圳", ["S1_APPLIANCE", "S2_HIGHTECH", "S2_FINANCE"]),
        "zhuhai": City("zhuhai", "珠海", ["S1_FOOD", "S2_TOURISM", "S2_MEDICINE"]),
        "macau": City("macau", "澳门", ["S2_TOURISM", "S2_FINANCE"]),
        "hongkong": City("hongkong", "香港", ["S2_FINANCE", "S2_TOURISM", "S2_HIGHTECH"]),
    }

    # 路线连接
    routes = [
        # 普通公路
        Route(RouteType.ROAD, "zhaoqing", "foshan"),
        Route(RouteType.ROAD, "foshan", "guangzhou"),
        Route(RouteType.ROAD, "guangzhou", "dongguan"),
        Route(RouteType.ROAD, "dongguan", "huizhou"),
        Route(RouteType.ROAD, "dongguan", "shenzhen"),
        Route(RouteType.ROAD, "foshan", "zhongshan"),
        Route(RouteType.ROAD, "zhongshan", "jiangmen"),
        Route(RouteType.ROAD, "zhongshan", "zhuhai"),
        Route(RouteType.ROAD, "jiangmen", "zhaoqing"),

        # 虎门大桥 (东莞-广州南沙-中山)
        Route(RouteType.HUMEN_BRIDGE, "dongguan", "zhongshan"),

        # 广深港高铁
        Route(RouteType.HSR, "guangzhou", "dongguan"),
        Route(RouteType.HSR, "dongguan", "shenzhen"),
        Route(RouteType.HSR_HK, "shenzhen", "hongkong"),

        # 深中通道
        Route(RouteType.SZ_ZS_LINK, "shenzhen", "zhongshan"),

        # 港珠澳大桥
        Route(RouteType.HZMB, "hongkong", "macau"),
        Route(RouteType.HZMB, "macau", "zhuhai"),
        Route(RouteType.HZMB, "hongkong", "zhuhai"),

        # 轮渡
        Route(RouteType.FERRY, "hongkong", "macau"),
        Route(RouteType.FERRY, "shenzhen", "hongkong"),
        Route(RouteType.FERRY, "zhuhai", "shenzhen"),
    ]

    return cities, routes

# ==================== 事件卡 ====================

EVENT_CARDS = [
    EventCard("EVT_1977", "改革伊始", 1977, "改革开放的序幕拉开，玩家获得启动资金。",
              EventEffect(EventEffectType.IMMEDIATE, "所有玩家获得50元启动资金", money_change=50)),
    EventCard("EVT_1982", "一个窗口对外", 1982, "经济特区政策深化，深圳、珠海建厂不消耗行动力。",
              EventEffect(EventEffectType.PERSISTENT, "特区城市建厂不消耗行动力", free_build_cities=["shenzhen", "zhuhai"])),
    EventCard("EVT_1988", "物价闯关", 1988, "价格改革带来通货膨胀。",
              EventEffect(EventEffectType.PERSISTENT, "除食品、医药外收入-3", income_modifier=-3,
                         excluded_industries=["S1_FOOD", "S2_FOOD", "S2_MEDICINE"])),
    EventCard("EVT_1992", "小平南巡", 1992, "改革开放加速，市场经济活力迸发。进入第二阶段！",
              EventEffect(EventEffectType.PERSISTENT, "所有工厂额外收入+3，解锁第二阶段产业", income_modifier=3, trigger_stage_two=True)),
    EventCard("EVT_2001", "中国入世", 2001, "中国加入WTO，工业出口增强。",
              EventEffect(EventEffectType.PERSISTENT, "第二产业收入+5", income_modifier=5,
                         affected_industries=["S1_FOOD", "S1_FURNITURE", "S1_TEXTILE", "S1_APPLIANCE", "S1_HEAVY",
                                            "S2_FOOD", "S2_FURNITURE", "S2_TEXTILE", "S2_PETROCHEMICAL", "S2_HEAVY"])),
    EventCard("EVT_2011", "十一五规划", 2011, "节能减排成为国策。",
              EventEffect(EventEffectType.PERSISTENT, "重工、石化需额外成本3元", extra_cost=3,
                         affected_industries=["S1_HEAVY", "S2_HEAVY", "S2_PETROCHEMICAL"])),
    EventCard("EVT_2016", "十三五规划", 2016, "创新驱动发展战略。",
              EventEffect(EventEffectType.PERSISTENT, "高新技术额外收入+5", income_modifier=5,
                         affected_industries=["S2_HIGHTECH"])),
    EventCard("EVT_2018", "中美角力白热化", 2018, "高科技产业受制裁影响。",
              EventEffect(EventEffectType.IMMEDIATE, "高科技产业暂停收入1回合", suspend_income_rounds=1,
                         affected_industries=["S2_HIGHTECH"])),
    EventCard("EVT_2020", "新冠病毒全球大流行", 2020, "疫情冲击全球经济。医药+4，旅游暂停，其他-4。",
              EventEffect(EventEffectType.IMMEDIATE, "医药+4，旅游暂停，其他-4", income_modifier=-4,
                         excluded_industries=["S2_MEDICINE", "S2_TOURISM"], suspend_income_rounds=1,
                         affected_industries=["S2_TOURISM"])),
    EventCard("EVT_2025", "中国制造2025", 2025, "制造强国战略达成，进行最终结算。",
              EventEffect(EventEffectType.END_GAME, "最终事件：进行最终收入结算", is_final_event=True)),
]

# ==================== 游戏状态 ====================

class GameState:
    def __init__(self, game_id: str = None):
        self.game_id = game_id or str(uuid.uuid4())[:8]
        self.cities, self.routes = create_gba_map()
        self.players: Dict[str, Player] = {}
        self.factories: Dict[str, Factory] = {}
        self.city_factories: Dict[str, List[str]] = defaultdict(list)  # city_id -> [factory_ids]

        # 事件卡
        self.event_deck = EVENT_CARDS.copy()
        # 不需要洗牌，事件按时间顺序发生
        self.current_event: Optional[EventCard] = None
        self.active_effects: List[EventCard] = []

        # 游戏阶段
        self.current_stage = GameStage.STAGE_ONE
        self.current_round = 0
        self.current_phase = TurnPhase.WAITING_START

        # 玩家回合
        self.player_order: List[str] = []
        self.starting_player_index = 0
        self.current_player_index = 0
        self.players_completed_turn: Set[str] = set()

        # 游戏状态
        self.is_started = False
        self.is_finished = False
        self.winner_id = None

    def add_player(self, player_id: str, name: str, color: str = ""):
        if len(self.players) >= 4:
            raise ValueError("玩家已满")
        player = Player(player_id=player_id, name=name, color=color, position="shenzhen")
        self.players[player_id] = player
        return player

    def start_game(self):
        """开始游戏"""
        if len(self.players) < 2:
            raise ValueError("至少需要2名玩家")
        self.is_started = True
        self.player_order = list(self.players.keys())
        self.current_round = 0  # 会在start_new_round中变成1
        self.current_phase = TurnPhase.WAITING_START

        # 自动开始第一回合
        return self.start_new_round()

    def start_new_round(self):
        """开始新回合 - 自动翻开事件卡"""
        self.current_round += 1

        # 重置所有玩家的行动力
        for p in self.players.values():
            p.action_points = 2

        # 设置当前玩家
        self.current_player_index = self.starting_player_index
        self.players_completed_turn.clear()

        # 自动翻开事件卡（回合开始时）
        event_result = self._draw_and_apply_event()

        self.current_phase = TurnPhase.PLAYER_ACTIONS

        return {
            "round": self.current_round,
            "starting_player": self.player_order[self.current_player_index],
            "event": event_result,
            "stage": self.current_stage.value
        }

    def _draw_and_apply_event(self):
        """翻开并应用事件卡"""
        if not self.event_deck:
            return None

        self.current_event = self.event_deck.pop(0)
        self._apply_event_effect(self.current_event)

        if self.current_event.effect.effect_type == EventEffectType.PERSISTENT:
            self.active_effects.append(self.current_event)

        if self.current_event.effect.is_final_event:
            self._end_game()

        return self.current_event.to_dict()

    def _apply_event_effect(self, event: EventCard):
        """应用事件效果"""
        effect = event.effect

        # 立即金钱变化
        if effect.money_change != 0:
            for p in self.players.values():
                p.money += effect.money_change

        # 触发第二阶段
        if effect.trigger_stage_two:
            self.current_stage = GameStage.STAGE_TWO

        # 暂停特定产业收入
        if effect.suspend_income_rounds > 0 and effect.affected_industries:
            for factory in self.factories.values():
                if factory.industry_card.industry_id in effect.affected_industries:
                    factory.is_income_suspended = True
                    factory.suspended_rounds = effect.suspend_income_rounds

    def _end_game(self):
        """结束游戏"""
        # 最终收入结算
        self._settle_income()

        self.is_finished = True
        winner = max(self.players.values(), key=lambda p: p.money)
        self.winner_id = winner.player_id

    def get_adjacent_cities(self, city_id: str) -> List[Dict]:
        """获取指定城市可以移动到的相邻城市列表"""
        adjacent = []
        for route in self.routes:
            dest = route.connects(city_id)
            if dest:
                adjacent.append({
                    "city_id": dest,
                    "city_name": self.cities[dest].name,
                    "route_type": route.route_type.value,
                    "route_name": route.route_type.value
                })

        # 去重（同一个城市可能有多条路线连接）
        seen = set()
        unique = []
        for adj in adjacent:
            key = adj["city_id"]
            if key not in seen:
                seen.add(key)
                unique.append(adj)
        return unique

    def player_move(self, player_id: str, destination_city: str):
        """玩家移动到相邻城市"""
        player = self.players.get(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 检查是否是当前玩家的回合
        current_player_id = self.player_order[self.current_player_index]
        if player_id != current_player_id:
            raise ValueError(f"现在是 {self.players[current_player_id].name} 的回合")

        if player.action_points < 1:
            raise ValueError("行动力不足")

        # 检查目标城市是否相邻
        adjacent = self.get_adjacent_cities(player.position)
        valid_dest = any(adj["city_id"] == destination_city for adj in adjacent)

        if not valid_dest:
            raise ValueError(f"无法从 {self.cities[player.position].name} 移动到 {self.cities[destination_city].name}")

        # 执行移动
        old_pos = player.position
        player.position = destination_city
        player.action_points -= 1

        return {
            "from": old_pos,
            "from_name": self.cities[old_pos].name,
            "to": destination_city,
            "to_name": self.cities[destination_city].name,
            "remaining_actions": player.action_points
        }

    def player_build(self, player_id: str, industry_id: str):
        """玩家在当前城市建立工厂"""
        player = self.players.get(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 检查是否是当前玩家的回合
        current_player_id = self.player_order[self.current_player_index]
        if player_id != current_player_id:
            raise ValueError(f"现在是 {self.players[current_player_id].name} 的回合")

        city = self.cities.get(player.position)
        if not city:
            raise ValueError("位置错误")

        # 检查该城市是否允许此产业
        if industry_id not in city.allowed_industries:
            raise ValueError(f"{city.name} 不允许建设此产业")

        industry = INDUSTRY_CARDS.get(industry_id)
        if not industry:
            raise ValueError("产业不存在")

        # 检查阶段
        if not industry.can_build_in_stage(self.current_stage):
            raise ValueError("当前阶段不可建设此产业")

        # 检查城市工厂数量上限
        if len(self.city_factories[city.city_id]) >= city.max_factories:
            raise ValueError(f"{city.name} 工厂数量已达上限")

        # 检查高级人力需求
        if industry.human_type_required == HumanType.ADVANCED and not player.has_advanced_human:
            raise ValueError("需要高级人力才能建设此产业")

        # 检查是否在特区（不消耗行动力）
        free_build = False
        for effect in self.active_effects:
            if player.position in effect.effect.free_build_cities:
                free_build = True
                break

        if not free_build:
            if player.action_points < 1:
                raise ValueError("行动力不足")
            player.action_points -= 1

        # 创建工厂
        factory_id = str(uuid.uuid4())[:8]
        factory = Factory(factory_id, player_id, industry, player.position)
        self.factories[factory_id] = factory
        self.city_factories[player.position].append(factory_id)
        player.factories.append(factory_id)

        return {
            "factory_id": factory_id,
            "industry": {"id": industry_id, "name": industry.industry_name},
            "city": city.name,
            "free_build": free_build,
            "remaining_actions": player.action_points
        }

    def player_end_turn(self, player_id: str):
        """玩家结束回合"""
        player = self.players.get(player_id)
        if not player:
            raise ValueError("玩家不存在")

        # 检查是否是当前玩家的回合
        current_player_id = self.player_order[self.current_player_index]
        if player_id != current_player_id:
            raise ValueError(f"现在是 {self.players[current_player_id].name} 的回合")

        # 标记当前玩家完成回合
        self.players_completed_turn.add(player_id)

        # 清空剩余行动力
        player.action_points = 0

        # 检查是否所有玩家都完成了回合
        if len(self.players_completed_turn) >= len(self.players):
            return self._end_round()

        # 移动到下一个玩家
        self.current_player_index = (self.current_player_index + 1) % len(self.player_order)
        next_player_id = self.player_order[self.current_player_index]

        return {
            "round_ended": False,
            "next_player": next_player_id,
            "next_player_name": self.players[next_player_id].name
        }

    def _end_round(self):
        """回合结束处理"""
        self.current_phase = TurnPhase.ROUND_SETTLING

        # 收入结算
        income_report = self._settle_income()

        # 更新暂停收入的工厂
        for factory in self.factories.values():
            if factory.is_income_suspended:
                factory.suspended_rounds -= 1
                if factory.suspended_rounds <= 0:
                    factory.is_income_suspended = False

        # 起始玩家轮换
        self.starting_player_index = (self.starting_player_index + 1) % len(self.player_order)

        # 检查游戏是否结束
        if self.is_finished:
            self.current_phase = TurnPhase.GAME_OVER
            return {
                "round_ended": True,
                "income_report": income_report,
                "game_finished": True
            }

        # 自动开始下一回合
        new_round_result = self.start_new_round()

        return {
            "round_ended": True,
            "income_report": income_report,
            "next_round": self.current_round,
            "new_round_event": new_round_result.get("event"),
            "game_finished": False
        }

    def _settle_income(self):
        """结算所有玩家的工厂收入"""
        income_report = {}

        for player_id, player in self.players.items():
            player_income = 0
            factory_details = []

            # 统计同业优势
            industry_counts = defaultdict(int)
            for fid in player.factories:
                factory = self.factories.get(fid)
                if factory:
                    industry_counts[factory.industry_card.industry_name] += 1

            # 计算每个工厂的收入
            for fid in player.factories:
                factory = self.factories.get(fid)
                if not factory:
                    continue

                if factory.is_income_suspended:
                    factory_details.append({
                        "factory_id": fid,
                        "industry": factory.industry_card.industry_name,
                        "income": 0,
                        "reason": "收入暂停"
                    })
                    continue

                # 基础收入
                income = factory.industry_card.base_income

                # 同业优势（同一产业>=2间工厂时）
                synergy = 0
                if industry_counts[factory.industry_card.industry_name] >= 2:
                    synergy = factory.industry_card.synergy_bonus
                    income += synergy

                # 应用事件效果
                event_modifier = 0
                for effect_event in self.active_effects:
                    effect = effect_event.effect
                    ind_id = factory.industry_card.industry_id

                    # 检查是否被排除
                    if ind_id in effect.excluded_industries:
                        continue

                    # 检查是否是目标产业（空列表表示所有产业）
                    if not effect.affected_industries or ind_id in effect.affected_industries:
                        event_modifier += effect.income_modifier

                income += event_modifier
                income = max(0, income)  # 收入不能为负

                player_income += income
                factory_details.append({
                    "factory_id": fid,
                    "industry": factory.industry_card.industry_name,
                    "city": factory.city,
                    "base": factory.industry_card.base_income,
                    "synergy": synergy,
                    "event_modifier": event_modifier,
                    "total": income
                })

            player.money += player_income
            income_report[player_id] = {
                "player_name": player.name,
                "total_income": player_income,
                "new_money": player.money,
                "factories": factory_details
            }

        return income_report

    def get_available_actions(self, player_id: str):
        """获取玩家可执行的行动"""
        player = self.players.get(player_id)
        if not player:
            return []

        # 检查是否是当前玩家的回合
        current_player_id = self.player_order[self.current_player_index] if self.player_order else None
        if player_id != current_player_id:
            return []

        if player.action_points < 1:
            return [{"action": "END_TURN", "description": "结束回合"}]

        actions = []

        # 移动选项
        adjacent = self.get_adjacent_cities(player.position)
        if adjacent:
            actions.append({
                "action": "MOVE",
                "description": "移动到相邻城市",
                "destinations": adjacent
            })

        # 建厂选项
        city = self.cities.get(player.position)
        if city:
            # 检查是否在特区（不消耗行动力）
            free_build = False
            for effect in self.active_effects:
                if player.position in effect.effect.free_build_cities:
                    free_build = True
                    break

            industries = []
            for ind_id in city.allowed_industries:
                ind = INDUSTRY_CARDS.get(ind_id)
                if ind:
                    can_build = ind.can_build_in_stage(self.current_stage)
                    reason = None
                    if not can_build:
                        reason = "需要第二阶段"
                    elif ind.human_type_required == HumanType.ADVANCED and not player.has_advanced_human:
                        can_build = False
                        reason = "需要高级人力"
                    elif len(self.city_factories[city.city_id]) >= city.max_factories:
                        can_build = False
                        reason = "城市工厂已满"

                    industries.append({
                        "industry_id": ind_id,
                        "name": ind.industry_name,
                        "can_build": can_build,
                        "reason": reason,
                        "base_income": ind.base_income,
                        "synergy_bonus": ind.synergy_bonus,
                        "free_build": free_build and can_build
                    })

            if industries:
                actions.append({
                    "action": "BUILD_FACTORY",
                    "description": "建立工厂" + (" (特区免费)" if free_build else ""),
                    "available_industries": industries,
                    "city": city.name
                })

        # 总是可以结束回合
        actions.append({"action": "END_TURN", "description": "结束回合"})

        return actions

    def to_dict(self):
        """导出游戏状态"""
        current_player = self.player_order[self.current_player_index] if self.player_order else None

        return {
            "game_id": self.game_id,
            "is_started": self.is_started,
            "is_finished": self.is_finished,
            "winner_id": self.winner_id,
            "players": {pid: p.to_dict() for pid, p in self.players.items()},
            "factories": {
                fid: {
                    "factory_id": f.factory_id,
                    "owner_player_id": f.owner_player_id,
                    "industry_id": f.industry_card.industry_id,
                    "industry_name": f.industry_card.industry_name,
                    "city": f.city,
                    "city_name": self.cities[f.city].name if f.city in self.cities else f.city
                } for fid, f in self.factories.items()
            },
            "map": {
                "cities": {cid: c.to_dict() for cid, c in self.cities.items()},
                "routes": [
                    {
                        "type": r.route_type.value,
                        "city_a": r.city_a,
                        "city_b": r.city_b
                    } for r in self.routes
                ]
            },
            "stage": {
                "current_stage": self.current_stage.value,
                "stage_info": {
                    "name": "第一阶段" if self.current_stage == GameStage.STAGE_ONE else "第二阶段"
                }
            },
            "turn": {
                "current_round": self.current_round,
                "current_phase": self.current_phase.value,
                "current_player": current_player,
                "current_player_name": self.players[current_player].name if current_player else None,
                "player_order": self.player_order
            },
            "event_deck": {
                "remaining_count": len(self.event_deck),
                "current_event": self.current_event.to_dict() if self.current_event else None
            },
            "active_effects": [e.to_dict() for e in self.active_effects]
        }

# ==================== 内存存储 ====================

class GameStore:
    def __init__(self):
        self.rooms: Dict[str, dict] = {}
        self.player_room_map: Dict[str, str] = {}

    def create_room(self, player_id: str, player_name: str, player_color: str = "", max_players: int = 4):
        if player_id in self.player_room_map:
            old_room_id = self.player_room_map[player_id]
            self.leave_room(old_room_id, player_id)

        room_id = str(uuid.uuid4())[:8]
        room = {
            "room_id": room_id,
            "host_player_id": player_id,
            "players": [player_id],
            "player_names": {player_id: player_name},
            "player_colors": {player_id: player_color or "#e74c3c"},
            "max_players": max_players,
            "min_players": 2,
            "status": "WAITING",
            "game_state": None
        }
        self.rooms[room_id] = room
        self.player_room_map[player_id] = room_id
        return room

    def get_room(self, room_id: str):
        return self.rooms.get(room_id)

    def join_room(self, room_id: str, player_id: str, player_name: str, player_color: str = ""):
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")
        if room["status"] != "WAITING":
            raise ValueError("游戏已开始")

        if player_id in self.player_room_map:
            existing_room_id = self.player_room_map[player_id]
            if existing_room_id == room_id:
                room["player_names"][player_id] = player_name
                if player_color:
                    room["player_colors"][player_id] = player_color
                return room
            else:
                raise ValueError("请先离开当前房间")

        if len(room["players"]) >= room["max_players"]:
            raise ValueError("房间已满")

        # 分配颜色
        default_colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12"]
        used_colors = set(room["player_colors"].values())
        if not player_color:
            for c in default_colors:
                if c not in used_colors:
                    player_color = c
                    break
            if not player_color:
                player_color = default_colors[len(room["players"]) % len(default_colors)]

        room["players"].append(player_id)
        room["player_names"][player_id] = player_name
        room["player_colors"][player_id] = player_color
        self.player_room_map[player_id] = room_id
        return room

    def leave_room(self, room_id: str, player_id: str):
        room = self.get_room(room_id)
        if not room or player_id not in room["players"]:
            return None
        if room["status"] == "IN_GAME":
            raise ValueError("游戏中不能离开，请使用退出游戏功能")
        room["players"].remove(player_id)
        if player_id in room["player_names"]:
            del room["player_names"][player_id]
        if player_id in room["player_colors"]:
            del room["player_colors"][player_id]
        if player_id in self.player_room_map:
            del self.player_room_map[player_id]
        if room["host_player_id"] == player_id or len(room["players"]) == 0:
            for p in room["players"]:
                if p in self.player_room_map:
                    del self.player_room_map[p]
            del self.rooms[room_id]
            return None
        return room

    def quit_game(self, room_id: str, player_id: str):
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")
        if player_id not in room["players"]:
            raise ValueError("你不在此房间中")

        room["players"].remove(player_id)
        if player_id in room["player_names"]:
            del room["player_names"][player_id]
        if player_id in room["player_colors"]:
            del room["player_colors"][player_id]
        if player_id in self.player_room_map:
            del self.player_room_map[player_id]

        if len(room["players"]) == 0 or room["host_player_id"] == player_id:
            for p in room["players"]:
                if p in self.player_room_map:
                    del self.player_room_map[p]
            del self.rooms[room_id]
            return {"deleted": True, "message": "房间已解散"}

        return {"deleted": False, "remaining_players": len(room["players"])}

    def delete_room(self, room_id: str, player_id: str):
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")
        if room["host_player_id"] != player_id:
            raise ValueError("只有房主可以删除房间")

        for p in room["players"]:
            if p in self.player_room_map:
                del self.player_room_map[p]

        del self.rooms[room_id]
        return {"deleted": True, "message": "房间已删除"}

    def start_game(self, room_id: str, player_id: str):
        room = self.get_room(room_id)
        if not room:
            raise ValueError("房间不存在")
        if room["host_player_id"] != player_id:
            raise ValueError("只有房主可以开始")
        if len(room["players"]) < room["min_players"]:
            raise ValueError("玩家不足")

        game_state = GameState(room_id)
        for pid in room["players"]:
            color = room["player_colors"].get(pid, "")
            game_state.add_player(pid, room["player_names"][pid], color)

        game_state.start_game()
        room["status"] = "IN_GAME"
        room["game_state"] = game_state
        return game_state

    def get_all_rooms(self):
        result = []
        for room in self.rooms.values():
            result.append({
                "room_id": room["room_id"],
                "host_player_id": room["host_player_id"],
                "players": room["players"],
                "player_names": room["player_names"],
                "player_colors": room.get("player_colors", {}),
                "player_count": len(room["players"]),
                "max_players": room["max_players"],
                "min_players": room["min_players"],
                "status": room["status"],
                "can_start": room["status"] == "WAITING" and len(room["players"]) >= room["min_players"],
                "can_join": room["status"] == "WAITING" and len(room["players"]) < room["max_players"]
            })
        return result

game_store = GameStore()

# ==================== API 路由 ====================

router = APIRouter(prefix="/api/china_game", tags=["中国经济桌游"])

# 请求模型
class CreateRoomRequest(BaseModel):
    player_id: str
    player_name: str
    player_color: str = ""
    max_players: int = 4

class JoinRoomRequest(BaseModel):
    player_id: str
    player_name: str
    player_color: str = ""

class PlayerActionRequest(BaseModel):
    player_id: str

class MoveRequest(BaseModel):
    player_id: str
    destination: str  # 目标城市ID

class BuildRequest(BaseModel):
    player_id: str
    industry_id: str

# 大厅路由
@router.get("/lobby/rooms")
async def get_rooms():
    rooms = game_store.get_all_rooms()
    return {"success": True, "data": {"rooms": rooms}}

@router.post("/lobby/rooms")
async def create_room(req: CreateRoomRequest):
    try:
        room = game_store.create_room(req.player_id, req.player_name, req.player_color, req.max_players)
        return {"success": True, "data": room}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/lobby/rooms/{room_id}")
async def get_room(room_id: str):
    room = game_store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="房间不存在")
    return {"success": True, "data": {
        "room_id": room["room_id"],
        "host_player_id": room["host_player_id"],
        "players": room["players"],
        "player_names": room["player_names"],
        "player_colors": room.get("player_colors", {}),
        "player_count": len(room["players"]),
        "max_players": room["max_players"],
        "min_players": room["min_players"],
        "status": room["status"],
        "can_start": room["status"] == "WAITING" and len(room["players"]) >= room["min_players"],
        "can_join": room["status"] == "WAITING" and len(room["players"]) < room["max_players"]
    }}

@router.post("/lobby/rooms/{room_id}/join")
async def join_room(room_id: str, req: JoinRoomRequest):
    try:
        room = game_store.join_room(room_id, req.player_id, req.player_name, req.player_color)
        return {"success": True, "data": room}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/lobby/rooms/{room_id}/leave")
async def leave_room(room_id: str, req: PlayerActionRequest):
    try:
        room = game_store.leave_room(room_id, req.player_id)
        return {"success": True, "data": room}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/lobby/rooms/{room_id}/quit")
async def quit_game(room_id: str, req: PlayerActionRequest):
    try:
        result = game_store.quit_game(room_id, req.player_id)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/lobby/rooms/{room_id}/delete")
async def delete_room(room_id: str, req: PlayerActionRequest):
    try:
        result = game_store.delete_room(room_id, req.player_id)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/lobby/rooms/{room_id}/start")
async def start_game(room_id: str, req: PlayerActionRequest):
    try:
        game_state = game_store.start_game(room_id, req.player_id)
        return {"success": True, "data": game_state.to_dict()}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

# 游戏路由
@router.get("/game/{room_id}/state")
async def get_game_state(room_id: str):
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    return {"success": True, "data": room["game_state"].to_dict()}

@router.post("/game/{room_id}/turn/next")
async def next_round(room_id: str):
    """开始下一回合（自动翻开事件卡）"""
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    result = room["game_state"].start_new_round()
    return {"success": True, "data": result}

@router.post("/game/{room_id}/action/move")
async def player_move(room_id: str, req: MoveRequest):
    """玩家移动到相邻城市"""
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    try:
        result = room["game_state"].player_move(req.player_id, req.destination)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/game/{room_id}/action/build")
async def player_build(room_id: str, req: BuildRequest):
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    try:
        result = room["game_state"].player_build(req.player_id, req.industry_id)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/game/{room_id}/action/end-turn")
async def player_end_turn(room_id: str, req: PlayerActionRequest):
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    try:
        result = room["game_state"].player_end_turn(req.player_id)
        return {"success": True, "data": result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/game/{room_id}/player/{player_id}/actions")
async def get_actions(room_id: str, player_id: str):
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    actions = room["game_state"].get_available_actions(player_id)
    return {"success": True, "data": {"actions": actions}}

@router.get("/game/{room_id}/adjacent/{city_id}")
async def get_adjacent_cities(room_id: str, city_id: str):
    """获取指定城市的相邻城市列表"""
    room = game_store.get_room(room_id)
    if not room or not room.get("game_state"):
        raise HTTPException(status_code=404, detail="游戏不存在")
    adjacent = room["game_state"].get_adjacent_cities(city_id)
    return {"success": True, "data": {"adjacent_cities": adjacent}}
