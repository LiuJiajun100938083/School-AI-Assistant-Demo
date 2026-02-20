"""
论坛API路由
==========

汇总所有论坛API端点。
"""

from fastapi import APIRouter

from .post_routes import router as post_router
from .reply_routes import router as reply_router

# 创建主路由
forum_router = APIRouter(prefix="/api/forum", tags=["论坛"])

# 注册子路由
forum_router.include_router(post_router)
forum_router.include_router(reply_router)

# 导出
__all__ = ["forum_router"]
