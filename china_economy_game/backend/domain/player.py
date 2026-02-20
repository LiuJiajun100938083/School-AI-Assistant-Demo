"""
Domain - 玩家
定义玩家状态和属性
"""
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class Player:
    """玩家"""
    player_id: str                          # 玩家唯一标识
    name: str                               # 玩家名称
    money: int = 0                          # 当前金钱
    position: int = 0                       # 当前位置（格子索引）
    action_points: int = 0                  # 当前行动力
    has_advanced_human: bool = False        # 是否拥有高级人力
    factories: list[str] = field(default_factory=list)  # 拥有的工厂ID列表

    def reset_action_points(self, points: int = 2):
        """重置行动力（每回合开始时调用）"""
        self.action_points = points

    def consume_action_point(self, points: int = 1) -> bool:
        """消耗行动力，返回是否成功"""
        if self.action_points >= points:
            self.action_points -= points
            return True
        return False

    def has_action_points(self) -> bool:
        """是否还有行动力"""
        return self.action_points > 0

    def add_money(self, amount: int):
        """增加金钱"""
        self.money += amount

    def deduct_money(self, amount: int) -> bool:
        """扣除金钱，返回是否成功"""
        if self.money >= amount:
            self.money -= amount
            return True
        return False

    def move_to(self, new_position: int):
        """移动到指定位置"""
        self.position = new_position

    def add_factory(self, factory_id: str):
        """添加工厂"""
        if factory_id not in self.factories:
            self.factories.append(factory_id)

    def remove_factory(self, factory_id: str):
        """移除工厂"""
        if factory_id in self.factories:
            self.factories.remove(factory_id)

    def to_dict(self) -> dict:
        """转换为字典（用于API响应）"""
        return {
            "player_id": self.player_id,
            "name": self.name,
            "money": self.money,
            "position": self.position,
            "action_points": self.action_points,
            "has_advanced_human": self.has_advanced_human,
            "factory_count": len(self.factories)
        }
