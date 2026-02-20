"""
Domain 层
所有游戏规则的实现
"""
from .enums import (
    GameStage,
    TileType,
    TransportType,
    IndustryCategory,
    HumanType,
    TurnPhase,
    ActionType,
    RoomStatus
)
from .player import Player
from .board import Board, Tile, TransportConnection, GAME_BOARD
from .industry import IndustryCard, Factory, IndustryRegistry, INDUSTRY_REGISTRY
from .event_card import EventCard, EventDeck, EventEffect, EventEffectType
from .stage_manager import StageManager
from .turn_manager import TurnManager
from .calculators import IncomeCalculator, SynergyCalculator
from .game_state import GameState

__all__ = [
    # 枚举
    'GameStage',
    'TileType',
    'TransportType',
    'IndustryCategory',
    'HumanType',
    'TurnPhase',
    'ActionType',
    'RoomStatus',
    # 核心类
    'Player',
    'Board',
    'Tile',
    'TransportConnection',
    'IndustryCard',
    'Factory',
    'IndustryRegistry',
    'EventCard',
    'EventDeck',
    'EventEffect',
    'EventEffectType',
    'StageManager',
    'TurnManager',
    'IncomeCalculator',
    'SynergyCalculator',
    'GameState',
    # 全局实例
    'GAME_BOARD',
    'INDUSTRY_REGISTRY',
]
