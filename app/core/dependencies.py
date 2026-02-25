#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastAPI 依赖注入模块

集中管理所有 FastAPI 的 Depends 依赖，包括:
- 数据库连接获取
- 用户认证与授权
- 配置获取
- 服务层实例化

使用方式:
    from app.core.dependencies import get_current_user, require_admin

    @router.get("/users/me")
    async def get_me(user: dict = Depends(get_current_user)):
        return user

    @router.delete("/users/{user_id}")
    async def delete_user(user: dict = Depends(require_admin)):
        ...
"""

import asyncio
import logging
from typing import Dict, Tuple

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    AccountDisabledError,
    AuthenticationError,
    AuthorizationError,
)
from app.core.security import JWTManager, get_client_ip
from app.infrastructure.database import DatabasePool, get_database_pool

logger = logging.getLogger(__name__)

# HTTP Bearer 认证方案
_security_scheme = HTTPBearer()


# ============================================================
# 配置依赖
# ============================================================

def get_config() -> Settings:
    """获取全局配置 (FastAPI 依赖)"""
    return get_settings()


# ============================================================
# 数据库依赖
# ============================================================

def get_db() -> DatabasePool:
    """获取数据库连接池 (FastAPI 依赖)"""
    return get_database_pool()


# ============================================================
# JWT Manager 依赖
# ============================================================

_jwt_manager: JWTManager = None


def get_jwt_manager(settings: Settings = Depends(get_config)) -> JWTManager:
    """获取 JWT 管理器 (单例)"""
    global _jwt_manager
    if _jwt_manager is None:
        _jwt_manager = JWTManager(
            secret=settings.jwt_secret,
            algorithm=settings.jwt_algorithm,
            access_expire_hours=settings.jwt_access_token_expire_hours,
            refresh_expire_days=settings.jwt_refresh_token_expire_days,
        )
    return _jwt_manager


def init_jwt_manager(settings: Settings) -> JWTManager:
    """
    在应用启动时初始化 JWT 管理器 (非 Depends 方式)

    在 main.py 的 startup 事件中调用。
    """
    global _jwt_manager
    _jwt_manager = JWTManager(
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_expire_hours=settings.jwt_access_token_expire_hours,
        refresh_expire_days=settings.jwt_refresh_token_expire_days,
    )
    return _jwt_manager


# ============================================================
# 认证依赖
# ============================================================

async def verify_token(
    credentials: HTTPAuthorizationCredentials = Depends(_security_scheme),
) -> Tuple[str, str]:
    """
    验证 JWT Token，返回 (username, role)

    用法:
        @router.get("/protected")
        async def protected(user_info: tuple = Depends(verify_token)):
            username, role = user_info
    """
    if _jwt_manager is None:
        raise HTTPException(status_code=500, detail="认证服务未初始化")

    token = credentials.credentials
    if not token:
        raise AuthenticationError("缺少认证凭证")

    payload = _jwt_manager.decode_token(token)
    username = payload.get("username")
    role = payload.get("role", "student")

    if not username:
        raise AuthenticationError("无效的认证凭证")

    return username, role


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_security_scheme),
) -> Dict:
    """
    获取当前登录用户的完整信息

    通过 JWT token 验证后，从数据库获取用户详情。

    Returns:
        用户信息字典
    """
    if _jwt_manager is None:
        raise HTTPException(status_code=500, detail="认证服务未初始化")

    token = credentials.credentials
    if not token:
        raise AuthenticationError("缺少认证凭证")

    payload = _jwt_manager.decode_token(token)
    username = payload.get("username")
    role = payload.get("role", "student")

    if not username:
        raise AuthenticationError("无效的认证凭证")

    # 从数据库验证用户是否仍然存在和活跃（在线程池中执行，避免阻塞事件循环）
    try:
        pool = get_database_pool()
        loop = asyncio.get_event_loop()
        user_info = await loop.run_in_executor(
            None,
            pool.execute_one,
            "SELECT * FROM users WHERE username = %s",
            (username,),
        )
    except Exception as e:
        logger.error(f"查询用户信息失败: {e}")
        raise HTTPException(status_code=500, detail="数据库连接错误")

    if not user_info:
        raise AuthenticationError("用户不存在")

    if not user_info.get("is_active", True):
        raise AccountDisabledError(username)

    return user_info


# ============================================================
# 授权依赖 (基于角色)
# ============================================================

async def require_admin(
    user_info: Tuple[str, str] = Depends(verify_token),
) -> Tuple[str, str]:
    """要求管理员权限"""
    username, role = user_info
    if role != "admin":
        raise AuthorizationError("admin")
    return username, role


async def require_teacher(
    user_info: Tuple[str, str] = Depends(verify_token),
) -> Tuple[str, str]:
    """要求教师或管理员权限"""
    username, role = user_info
    if role not in ("teacher", "admin"):
        raise AuthorizationError("teacher")
    return username, role


async def require_teacher_or_admin(
    user_info: Tuple[str, str] = Depends(verify_token),
) -> Tuple[str, str]:
    """要求教师或管理员权限 (别名)"""
    return await require_teacher(user_info)


# ============================================================
# 客户端信息依赖
# ============================================================

async def get_client_info(request: Request) -> Dict[str, str]:
    """获取客户端 IP 和 User-Agent"""
    return {
        "ip": get_client_ip(request),
        "user_agent": request.headers.get("User-Agent", "unknown"),
    }
