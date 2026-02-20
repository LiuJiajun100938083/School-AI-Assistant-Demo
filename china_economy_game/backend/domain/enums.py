"""
Domain 枚举定义
所有游戏中使用的枚举类型
"""
from enum import Enum, auto


class GameStage(Enum):
    """游戏阶段"""
    STAGE_ONE = 1  # 第一阶段
    STAGE_TWO = 2  # 第二阶段


class TileType(Enum):
    """格子类型"""
    START = "START"           # 起点格
    INDUSTRY = "INDUSTRY"     # 产业格
    TRANSPORT = "TRANSPORT"   # 运输格
    SYSTEM = "SYSTEM"         # 功能格


class TransportType(Enum):
    """运输类型"""
    RAILWAY = "RAILWAY"   # 铁路
    SHIPPING = "SHIPPING"  # 海运


class IndustryCategory(Enum):
    """产业类别"""
    SECONDARY = "第二产业"  # 第二产业（工业）
    TERTIARY = "第三产业"   # 第三产业（服务业）


class HumanType(Enum):
    """人力类型"""
    NONE = "无"           # 无特殊要求
    ADVANCED = "高级人力"  # 需要高级人力


class TurnPhase(Enum):
    """回合阶段"""
    TURN_START = auto()       # 回合开始
    EVENT_PHASE = auto()      # 事件卡阶段
    PLAYER_ACTIONS = auto()   # 玩家行动阶段
    TURN_END = auto()         # 回合结束


class ActionType(Enum):
    """玩家行动类型"""
    MOVE = "MOVE"                     # 移动1格
    BUILD_FACTORY = "BUILD_FACTORY"   # 建立工厂
    USE_TRANSPORT = "USE_TRANSPORT"   # 使用运输系统


class RoomStatus(Enum):
    """房间状态 - 注意：这不属于游戏规则，仅用于大厅系统"""
    WAITING = "WAITING"    # 等待中
    IN_GAME = "IN_GAME"    # 游戏中
