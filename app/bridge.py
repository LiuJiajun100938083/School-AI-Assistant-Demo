#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
向后兼容桥接模块

允许旧代码 (secure_web_main.py, attendance_api.py 等) 逐步迁移到新基础设施。
旧代码可以直接导入此模块来使用新的数据库连接池、配置管理等，
无需一次性修改所有代码。

使用方式 (在旧代码中):
    # 替代旧的 from secure_database import get_db
    from app.bridge import get_db, get_db_connection

    # 替代旧的硬编码配置
    from app.bridge import get_config

    # 替代旧的 auth_dependencies
    from app.bridge import (
        create_jwt_token, verify_token, verify_admin,
        verify_teacher, get_current_user, get_client_info,
    )
"""

import logging
from contextlib import contextmanager
from typing import Dict, Optional, Tuple

from app.config.settings import get_settings
from app.infrastructure.database.pool import get_database_pool

logger = logging.getLogger(__name__)


# ============================================================
# 数据库兼容层
# ============================================================

@contextmanager
def get_db():
    """
    向后兼容的数据库连接获取 (上下文管理器)

    替代旧的 secure_database.get_db()

    用法 (与旧代码完全兼容):
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM users")
            results = cursor.fetchall()
    """
    pool = get_database_pool()
    with pool.connection() as conn:
        yield conn


def get_db_connection():
    """
    向后兼容的数据库连接获取 (直接返回连接)

    替代旧的 secure_database.get_db_connection()

    注意: 调用者需要自行关闭连接！推荐使用 get_db() 上下文管理器。
    """
    pool = get_database_pool()
    return pool._ensure_pool().connection()


def execute_query(query: str, params=None, fetch_one: bool = False):
    """
    向后兼容的查询执行

    替代旧的 secure_database.execute_query()
    """
    pool = get_database_pool()
    if fetch_one:
        return pool.execute_one(query, params)
    return pool.execute(query, params)


# ============================================================
# 配置兼容层
# ============================================================

def get_config() -> dict:
    """
    获取配置字典 (向后兼容)

    旧代码中可能直接读取 DB_CONFIG 等字典，
    此函数将新的 Settings 转换为旧的字典格式。
    """
    settings = get_settings()
    return {
        "DB_HOST": settings.db_host,
        "DB_PORT": settings.db_port,
        "DB_USER": settings.db_user,
        "DB_PASSWORD": settings.db_password,
        "DB_NAME": settings.db_name,
        "JWT_SECRET": settings.jwt_secret,
        "JWT_ALGORITHM": settings.jwt_algorithm,
        "JWT_EXPIRATION_HOURS": settings.jwt_access_token_expire_hours,
        "LLM_MODEL": settings.llm_local_model,
        "LLM_BASE_URL": settings.llm_local_base_url,
        "SERVER_HOST": settings.server_host,
        "SERVER_PORT": settings.server_port,
    }


# ============================================================
# 认证兼容层
# ============================================================

def _get_jwt_manager():
    """获取 JWT 管理器 (延迟初始化，避免 FastAPI 导入依赖)"""
    # 先尝试获取已初始化的实例 (FastAPI 运行时)
    try:
        from app.core.dependencies import _jwt_manager
        if _jwt_manager is not None:
            return _jwt_manager
    except ImportError:
        pass

    # 独立使用时创建临时实例
    from app.core.security import JWTManager
    settings = get_settings()
    return JWTManager(
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        access_expire_hours=settings.jwt_access_token_expire_hours,
    )


def create_jwt_token(username: str, role: str) -> str:
    """
    创建 JWT Token (向后兼容)

    替代旧的 auth_dependencies.create_jwt_token()
    """
    mgr = _get_jwt_manager()
    return mgr.create_access_token(username, role)


def decode_jwt_token(token: str) -> Optional[Dict]:
    """
    解码 JWT Token (向后兼容)

    替代旧的 auth_dependencies.decode_jwt_token()
    """
    mgr = _get_jwt_manager()
    try:
        return mgr.decode_token(token)
    except Exception:
        return None


# 向后兼容别名
create_access_token = create_jwt_token
verify_jwt_token = decode_jwt_token


# ============================================================
# 数据库配置兼容层 (替代 DB_CONFIG 全局字典)
# ============================================================

def get_db_config() -> dict:
    """
    获取数据库配置字典 (替代旧的 secure_database.DB_CONFIG)
    """
    settings = get_settings()
    return {
        "host": settings.db_host,
        "user": settings.db_user,
        "password": settings.db_password,
        "database": settings.db_name,
        "charset": settings.db_charset,
    }
