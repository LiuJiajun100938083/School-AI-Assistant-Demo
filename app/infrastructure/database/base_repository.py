#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Repository 基类

所有 Repository 的公共父类，封装:
- 数据库连接池获取
- 通用 CRUD 操作
- 事务管理
- 分页查询
- 错误处理

使用方式:
    class UserRepository(BaseRepository):
        TABLE = "users"

        def find_by_username(self, username: str) -> Optional[dict]:
            return self.find_one("username = %s", (username,))
"""

import logging
from contextlib import contextmanager
from typing import Any, Dict, List, Optional, Tuple, Union

from app.infrastructure.database.pool import DatabasePool, get_database_pool

logger = logging.getLogger(__name__)


class BaseRepository:
    """
    Repository 基类

    提供通用的数据库操作方法。子类只需设置 TABLE 属性
    并实现特定的业务查询方法。
    """

    # 子类必须覆盖
    TABLE: str = ""

    def __init__(self, pool: Optional[DatabasePool] = None):
        """
        初始化 Repository

        Args:
            pool: 数据库连接池 (不传则使用全局连接池)
        """
        self._pool = pool

    @property
    def pool(self) -> DatabasePool:
        """获取连接池 (延迟获取)"""
        if self._pool is None:
            self._pool = get_database_pool()
        return self._pool

    # ============================================================
    # 连接管理
    # ============================================================

    @contextmanager
    def connection(self):
        """获取数据库连接 (上下文管理器)"""
        with self.pool.connection() as conn:
            yield conn

    @contextmanager
    def transaction(self):
        """获取事务连接 (自动 commit/rollback)"""
        with self.pool.transaction() as conn:
            yield conn

    # ============================================================
    # 通用查询
    # ============================================================

    def find_all(
        self,
        where: str = "",
        params: Union[Tuple, Dict, None] = None,
        order_by: str = "",
        limit: int = 0,
        offset: int = 0,
        columns: str = "*",
    ) -> List[Dict[str, Any]]:
        """
        查询多条记录

        Args:
            where: WHERE 子句 (不含 WHERE 关键字)
            params: 查询参数
            order_by: ORDER BY 子句 (不含 ORDER BY 关键字)
            limit: 返回条数限制 (0=不限)
            offset: 偏移量
            columns: 要查询的列

        Returns:
            字典列表
        """
        sql = f"SELECT {columns} FROM {self.TABLE}"
        if where:
            sql += f" WHERE {where}"
        if order_by:
            sql += f" ORDER BY {order_by}"
        if limit > 0:
            sql += f" LIMIT {limit}"
            if offset > 0:
                sql += f" OFFSET {offset}"
        return self.pool.execute(sql, params)

    def find_one(
        self,
        where: str,
        params: Union[Tuple, Dict, None] = None,
        columns: str = "*",
    ) -> Optional[Dict[str, Any]]:
        """
        查询单条记录

        Args:
            where: WHERE 子句
            params: 查询参数
            columns: 要查询的列

        Returns:
            字典或 None
        """
        sql = f"SELECT {columns} FROM {self.TABLE} WHERE {where} LIMIT 1"
        return self.pool.execute_one(sql, params)

    def find_by_id(
        self,
        record_id: Any,
        id_column: str = "id",
        columns: str = "*",
    ) -> Optional[Dict[str, Any]]:
        """根据 ID 查询单条记录"""
        return self.find_one(f"{id_column} = %s", (record_id,), columns)

    def count(
        self,
        where: str = "",
        params: Union[Tuple, Dict, None] = None,
    ) -> int:
        """
        统计记录数

        Returns:
            记录数量
        """
        sql = f"SELECT COUNT(*) as cnt FROM {self.TABLE}"
        if where:
            sql += f" WHERE {where}"
        result = self.pool.execute_one(sql, params)
        return result["cnt"] if result else 0

    def exists(
        self,
        where: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> bool:
        """检查记录是否存在"""
        sql = f"SELECT 1 FROM {self.TABLE} WHERE {where} LIMIT 1"
        return self.pool.execute_one(sql, params) is not None

    # ============================================================
    # 通用写入
    # ============================================================

    def insert(self, data: Dict[str, Any]) -> int:
        """
        插入单条记录

        Args:
            data: 字段名-值 字典

        Returns:
            影响行数
        """
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["%s"] * len(data))
        sql = f"INSERT INTO {self.TABLE} ({columns}) VALUES ({placeholders})"
        return self.pool.execute_write(sql, tuple(data.values()))

    def insert_get_id(self, data: Dict[str, Any]) -> Optional[int]:
        """
        插入并返回自增 ID

        Args:
            data: 字段名-值 字典

        Returns:
            插入记录的 ID
        """
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["%s"] * len(data))
        sql = f"INSERT INTO {self.TABLE} ({columns}) VALUES ({placeholders})"

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, tuple(data.values()))
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            return result["id"] if result else None

    def upsert(
        self,
        data: Dict[str, Any],
        update_fields: Optional[List[str]] = None,
    ) -> int:
        """
        插入或更新 (ON DUPLICATE KEY UPDATE)

        Args:
            data: 字段名-值 字典
            update_fields: 冲突时更新的字段列表 (None=全部更新)

        Returns:
            影响行数
        """
        columns = ", ".join(data.keys())
        placeholders = ", ".join(["%s"] * len(data))

        if update_fields is None:
            update_fields = list(data.keys())

        updates = ", ".join(
            f"{f} = VALUES({f})" for f in update_fields
        )
        sql = (
            f"INSERT INTO {self.TABLE} ({columns}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {updates}"
        )
        return self.pool.execute_write(sql, tuple(data.values()))

    def update(
        self,
        data: Dict[str, Any],
        where: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> int:
        """
        更新记录

        Args:
            data: 要更新的字段
            where: WHERE 子句
            params: WHERE 参数

        Returns:
            影响行数
        """
        set_clause = ", ".join(f"{k} = %s" for k in data.keys())
        sql = f"UPDATE {self.TABLE} SET {set_clause} WHERE {where}"
        values = list(data.values())
        if params:
            if isinstance(params, dict):
                values.extend(params.values())
            else:
                values.extend(params)
        return self.pool.execute_write(sql, tuple(values))

    def delete(
        self,
        where: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> int:
        """
        删除记录

        Args:
            where: WHERE 子句
            params: WHERE 参数

        Returns:
            影响行数
        """
        sql = f"DELETE FROM {self.TABLE} WHERE {where}"
        return self.pool.execute_write(sql, params)

    def soft_delete(
        self,
        where: str,
        params: Union[Tuple, Dict, None] = None,
        field: str = "is_deleted",
    ) -> int:
        """
        软删除

        Args:
            where: WHERE 子句
            params: WHERE 参数
            field: 删除标记字段名
        """
        return self.update({field: True}, where, params)

    # ============================================================
    # 分页查询
    # ============================================================

    def paginate(
        self,
        page: int = 1,
        page_size: int = 20,
        where: str = "",
        params: Union[Tuple, Dict, None] = None,
        order_by: str = "id DESC",
        columns: str = "*",
    ) -> Dict[str, Any]:
        """
        分页查询

        Returns:
            {"items": [...], "total": int, "page": int, "page_size": int}
        """
        total = self.count(where, params)
        offset = (page - 1) * page_size
        items = self.find_all(
            where=where,
            params=params,
            order_by=order_by,
            limit=page_size,
            offset=offset,
            columns=columns,
        )
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    # ============================================================
    # 原始查询 (不绑定 TABLE)
    # ============================================================

    def raw_query(
        self,
        sql: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> List[Dict[str, Any]]:
        """执行原始 SQL 查询 (多条)"""
        return self.pool.execute(sql, params)

    def raw_query_one(
        self,
        sql: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> Optional[Dict[str, Any]]:
        """执行原始 SQL 查询 (单条)"""
        return self.pool.execute_one(sql, params)

    def raw_execute(
        self,
        sql: str,
        params: Union[Tuple, Dict, None] = None,
    ) -> int:
        """执行原始 SQL 写入"""
        return self.pool.execute_write(sql, params)
