#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一数据库连接池管理

替代原有的 db_pool.py 和 secure_database.py 中分散的数据库连接管理。
提供统一的连接获取、上下文管理和连接池监控。

使用方式:
    from app.infrastructure.database import get_database_pool

    pool = get_database_pool()

    # 方式1: 上下文管理器 (推荐)
    with pool.connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = %s", (user_id,))
        result = cursor.fetchone()

    # 方式2: 带事务的上下文管理器
    with pool.transaction() as conn:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO ...", (...))
        cursor.execute("UPDATE ...", (...))
        # 自动 commit，异常自动 rollback

    # 方式3: 快捷查询
    rows = pool.execute("SELECT * FROM users WHERE role = %s", ("admin",))
    row = pool.execute_one("SELECT * FROM users WHERE id = %s", (1,))
"""

import logging
import threading
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

import pymysql
from pymysql.cursors import DictCursor
from dbutils.pooled_db import PooledDB

logger = logging.getLogger(__name__)


class DatabasePool:
    """
    数据库连接池封装

    统一管理所有数据库连接，提供:
    - 连接池化 (减少连接创建开销)
    - 自动重连 (ping 检测)
    - 上下文管理 (自动释放)
    - 事务支持 (自动提交/回滚)
    - 连接池状态监控
    """

    def __init__(
        self,
        host: str = "localhost",
        port: int = 3306,
        user: str = "root",
        password: str = "",
        database: str = "school_ai_assistant",
        charset: str = "utf8mb4",
        max_connections: int = 100,
        min_cached: int = 20,
        max_cached: int = 50,
        max_shared: int = 0,
        max_usage: int = 1000,
        blocking: bool = True,
        connect_timeout: int = 10,
        read_timeout: int = 30,
        write_timeout: int = 30,
    ):
        self._config = {
            "host": host,
            "port": port,
            "user": user,
            "password": password,
            "database": database,
            "charset": charset,
        }
        self._pool_config = {
            "max_connections": max_connections,
            "min_cached": min_cached,
            "max_cached": max_cached,
            "max_shared": max_shared,
            "max_usage": max_usage,
            "blocking": blocking,
        }
        self._timeout_config = {
            "connect_timeout": connect_timeout,
            "read_timeout": read_timeout,
            "write_timeout": write_timeout,
        }

        self._pool: Optional[PooledDB] = None
        self._lock = threading.Lock()
        self._stats = {
            "connections_created": 0,
            "connections_released": 0,
            "queries_executed": 0,
            "errors": 0,
        }

    def _ensure_pool(self) -> PooledDB:
        """延迟初始化连接池 (线程安全)"""
        if self._pool is None:
            with self._lock:
                if self._pool is None:
                    self._pool = PooledDB(
                        creator=pymysql,
                        maxconnections=self._pool_config["max_connections"],
                        mincached=self._pool_config["min_cached"],
                        maxcached=self._pool_config["max_cached"],
                        maxshared=self._pool_config["max_shared"],
                        blocking=self._pool_config["blocking"],
                        maxusage=self._pool_config["max_usage"],
                        setsession=["SET AUTOCOMMIT = 1"],
                        ping=1,
                        host=self._config["host"],
                        port=self._config["port"],
                        user=self._config["user"],
                        password=self._config["password"],
                        database=self._config["database"],
                        charset=self._config["charset"],
                        cursorclass=DictCursor,
                        connect_timeout=self._timeout_config["connect_timeout"],
                        read_timeout=self._timeout_config["read_timeout"],
                        write_timeout=self._timeout_config["write_timeout"],
                    )
                    logger.info(
                        f"数据库连接池初始化完成: "
                        f"{self._config['host']}:{self._config['port']}/"
                        f"{self._config['database']} "
                        f"(max={self._pool_config['max_connections']}, "
                        f"cached={self._pool_config['min_cached']}-{self._pool_config['max_cached']})"
                    )
        return self._pool

    @contextmanager
    def connection(self):
        """
        获取数据库连接 (上下文管理器)

        自动释放连接回连接池，并修复 MySQL 的 GROUP BY 限制。

        用法:
            with pool.connection() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT ...")
        """
        pool = self._ensure_pool()
        conn = None
        try:
            conn = pool.connection()
            self._stats["connections_created"] += 1

            # 修复 MySQL ONLY_FULL_GROUP_BY 限制 (保持向后兼容)
            try:
                with conn.cursor() as cursor:
                    cursor.execute(
                        "SET SESSION sql_mode = ("
                        "SELECT REPLACE(@@sql_mode, 'ONLY_FULL_GROUP_BY', '')"
                        ")"
                    )
            except Exception:
                pass  # 非致命错误

            yield conn
        except pymysql.Error as e:
            self._stats["errors"] += 1
            logger.error(f"数据库操作失败: {e}")
            raise
        finally:
            if conn:
                try:
                    conn.close()
                    self._stats["connections_released"] += 1
                except Exception:
                    pass

    @contextmanager
    def transaction(self):
        """
        事务上下文管理器

        自动 commit，异常自动 rollback。

        用法:
            with pool.transaction() as conn:
                cursor = conn.cursor()
                cursor.execute("INSERT ...")
                cursor.execute("UPDATE ...")
                # 自动 commit
        """
        pool = self._ensure_pool()
        conn = None
        try:
            conn = pool.connection()
            self._stats["connections_created"] += 1
            cursor = conn.cursor()
            cursor.execute("SET autocommit=0")
            cursor.execute("BEGIN")
            cursor.close()

            yield conn

            conn.commit()
        except Exception as e:
            if conn:
                try:
                    conn.rollback()
                except Exception:
                    pass
            self._stats["errors"] += 1
            logger.error(f"事务执行失败，已回滚: {e}")
            raise
        finally:
            if conn:
                try:
                    cursor = conn.cursor()
                    cursor.execute("SET autocommit=1")
                    cursor.close()
                    conn.close()
                    self._stats["connections_released"] += 1
                except Exception:
                    pass

    def execute(
        self,
        query: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> List[Dict[str, Any]]:
        """
        执行查询并返回所有结果

        Args:
            query: SQL 查询语句
            params: 查询参数 (防 SQL 注入)

        Returns:
            字典列表
        """
        with self.connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            self._stats["queries_executed"] += 1
            return cursor.fetchall()

    def execute_one(
        self,
        query: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        执行查询并返回单条结果

        Args:
            query: SQL 查询语句
            params: 查询参数

        Returns:
            字典或 None
        """
        with self.connection() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            self._stats["queries_executed"] += 1
            return cursor.fetchone()

    def execute_many(
        self,
        query: str,
        params_list: List[Union[Tuple, Dict]],
    ) -> int:
        """
        批量执行 (INSERT/UPDATE)

        Args:
            query: SQL 语句
            params_list: 参数列表

        Returns:
            影响的行数
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            affected = cursor.executemany(query, params_list)
            self._stats["queries_executed"] += 1
            return affected

    def execute_write(
        self,
        query: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> int:
        """
        执行写入操作 (INSERT/UPDATE/DELETE)，返回影响行数

        Args:
            query: SQL 语句
            params: 查询参数

        Returns:
            影响的行数
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            self._stats["queries_executed"] += 1
            return cursor.rowcount

    def get_status(self) -> Dict[str, Any]:
        """获取连接池状态 (用于监控)"""
        return {
            "config": {
                "host": self._config["host"],
                "port": self._config["port"],
                "database": self._config["database"],
                "max_connections": self._pool_config["max_connections"],
                "min_cached": self._pool_config["min_cached"],
                "max_cached": self._pool_config["max_cached"],
            },
            "stats": dict(self._stats),
            "initialized": self._pool is not None,
        }

    def test_connection(self) -> bool:
        """测试数据库连接是否正常"""
        try:
            result = self.execute_one("SELECT 1 as test")
            return result is not None and result.get("test") == 1
        except Exception as e:
            logger.error(f"数据库连接测试失败: {e}")
            return False

    def close(self):
        """关闭连接池"""
        if self._pool:
            try:
                self._pool.close()
                logger.info("数据库连接池已关闭")
            except Exception as e:
                logger.error(f"关闭连接池失败: {e}")
            finally:
                self._pool = None


# ============================================================
# 全局连接池实例 (延迟初始化)
# ============================================================

_global_pool: Optional[DatabasePool] = None
_global_pool_lock = threading.Lock()


def init_database_pool(
    host: str = "localhost",
    port: int = 3306,
    user: str = "root",
    password: str = "",
    database: str = "school_ai_assistant",
    **kwargs,
) -> DatabasePool:
    """
    初始化全局数据库连接池

    在应用启动时调用一次。后续通过 get_database_pool() 获取。
    """
    global _global_pool
    with _global_pool_lock:
        if _global_pool is not None:
            _global_pool.close()
        _global_pool = DatabasePool(
            host=host,
            port=port,
            user=user,
            password=password,
            database=database,
            **kwargs,
        )
        return _global_pool


def get_database_pool() -> DatabasePool:
    """
    获取全局数据库连接池

    如果未初始化，将使用默认配置创建。
    推荐在应用启动时先调用 init_database_pool()。
    """
    global _global_pool
    if _global_pool is None:
        with _global_pool_lock:
            if _global_pool is None:
                # 从 Settings 获取配置进行初始化
                try:
                    from app.config.settings import get_settings
                    settings = get_settings()
                    _global_pool = DatabasePool(
                        host=settings.db_host,
                        port=settings.db_port,
                        user=settings.db_user,
                        password=settings.db_password,
                        database=settings.db_name,
                        charset=settings.db_charset,
                        max_connections=settings.db_pool_max_connections,
                        min_cached=settings.db_pool_min_cached,
                        max_cached=settings.db_pool_max_cached,
                        max_shared=settings.db_pool_max_shared,
                        max_usage=settings.db_pool_max_usage,
                        blocking=settings.db_pool_blocking,
                        connect_timeout=settings.db_connect_timeout,
                        read_timeout=settings.db_read_timeout,
                        write_timeout=settings.db_write_timeout,
                    )
                except Exception as e:
                    logger.warning(f"从 Settings 初始化数据库连接池失败: {e}，使用默认配置")
                    _global_pool = DatabasePool()
    return _global_pool


def close_database_pool():
    """关闭全局数据库连接池"""
    global _global_pool
    if _global_pool:
        _global_pool.close()
        _global_pool = None
