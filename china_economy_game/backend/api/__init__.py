"""
API 层
HTTP 接口，只做参数校验
"""
from .lobby_routes import router as lobby_router
from .game_routes import router as game_router

__all__ = ['lobby_router', 'game_router']
