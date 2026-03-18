"""
幻灯片处理器注册表

按 slide_type 获取对应 handler 实例。
新增类型只需：
  1. 创建 xxx_handler.py
  2. 在此注册
"""

from .base import SlideHandler
from .game_handler import GameSlideHandler
from .interactive_handler import InteractiveSlideHandler
from .link_handler import LinkSlideHandler
from .poll_handler import PollSlideHandler
from .ppt_handler import PPTSlideHandler
from .quiz_handler import QuizSlideHandler

# 单例 handler 实例 (handler 无状态，可安全复用)
_HANDLER_REGISTRY: dict[str, SlideHandler] = {
    "ppt": PPTSlideHandler(),
    "game": GameSlideHandler(),
    "quiz": QuizSlideHandler(),
    "poll": PollSlideHandler(),
    "link": LinkSlideHandler(),
    "interactive": InteractiveSlideHandler(),
}


def get_slide_handler(slide_type: str) -> SlideHandler:
    """获取 slide_type 对应的 handler。"""
    handler = _HANDLER_REGISTRY.get(slide_type)
    if handler is None:
        raise ValueError(f"No handler registered for slide_type: {slide_type}")
    return handler


def get_registered_types() -> list[str]:
    """返回所有已注册的 slide_type。"""
    return list(_HANDLER_REGISTRY.keys())


__all__ = [
    "SlideHandler",
    "get_slide_handler",
    "get_registered_types",
    "PPTSlideHandler",
    "GameSlideHandler",
    "QuizSlideHandler",
    "PollSlideHandler",
    "LinkSlideHandler",
    "InteractiveSlideHandler",
]
