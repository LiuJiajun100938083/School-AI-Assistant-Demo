"""
API层 (表现层)
=============

处理HTTP请求/响应，认证依赖注入。
"""

from .router import forum_router

__all__ = [
    "forum_router",
]
