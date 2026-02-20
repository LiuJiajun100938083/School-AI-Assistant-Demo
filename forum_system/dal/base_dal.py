"""
基础数据访问层
=============

提供数据库连接和基础CRUD操作。
复用现有的数据库连接池。
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple, TypeVar, Generic
from contextlib import contextmanager
from datetime import datetime

logger = logging.getLogger(__name__)

# 导入项目数据库连接（使用 bridge 兼容层）
try:
    from app.bridge import get_db as get_pooled_connection
    DB_POOL_AVAILABLE = True
except ImportError:
    DB_POOL_AVAILABLE = False
    logger.warning("app.bridge模块不可用")

# 兼容层：统一使用同一个连接源
get_context_connection = get_pooled_connection if DB_POOL_AVAILABLE else None
SECURE_DB_AVAILABLE = DB_POOL_AVAILABLE


T = TypeVar('T')


class DatabaseConnection:
    """数据库连接管理器"""

    @staticmethod
    @contextmanager
    def get_connection():
        """
        获取数据库连接的上下文管理器

        Yields:
            数据库连接对象
        """
        if DB_POOL_AVAILABLE:
            # get_pooled_connection() (即 app.bridge.get_db) 是 @contextmanager，
            # 必须用 with 进入才能拿到真正的 connection 对象
            with get_pooled_connection() as conn:
                yield conn
        elif SECURE_DB_AVAILABLE:
            with get_context_connection() as conn:
                yield conn
        else:
            raise RuntimeError("没有可用的数据库连接模块")

    @staticmethod
    def execute_query(
        sql: str,
        params: tuple = None,
        fetch_one: bool = False,
        fetch_all: bool = True
    ) -> Optional[Any]:
        """
        执行SQL查询

        Args:
            sql: SQL语句
            params: 参数元组
            fetch_one: 是否只获取一条
            fetch_all: 是否获取所有

        Returns:
            查询结果
        """
        with DatabaseConnection.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(sql, params or ())

                if fetch_one:
                    return cursor.fetchone()
                elif fetch_all:
                    return cursor.fetchall()
                else:
                    return None
            finally:
                cursor.close()

    @staticmethod
    def execute_write(
        sql: str,
        params: tuple = None,
        return_lastrowid: bool = True
    ) -> Optional[int]:
        """
        执行写操作（INSERT/UPDATE/DELETE）

        Args:
            sql: SQL语句
            params: 参数元组
            return_lastrowid: 是否返回最后插入的ID

        Returns:
            最后插入的ID或受影响的行数
        """
        with DatabaseConnection.get_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(sql, params or ())
                conn.commit()

                if return_lastrowid:
                    return cursor.lastrowid
                else:
                    return cursor.rowcount
            except Exception as e:
                conn.rollback()
                logger.error(f"数据库写入失败: {e}")
                raise
            finally:
                cursor.close()


class BaseDAL(Generic[T]):
    """
    基础数据访问层

    提供通用的CRUD操作方法。
    """

    # 子类需要覆盖的属性
    TABLE_NAME: str = ""
    PRIMARY_KEY: str = "id"

    def __init__(self):
        if not self.TABLE_NAME:
            raise ValueError(f"{self.__class__.__name__}必须设置TABLE_NAME")

    def _dict_to_row(self, row: Dict) -> Optional[T]:
        """
        将数据库行转换为模型对象

        子类可覆盖此方法进行自定义转换
        """
        return row

    def _rows_to_list(self, rows: List[Dict]) -> List[T]:
        """将多行数据转换为模型列表"""
        if not rows:
            return []
        return [self._dict_to_row(row) for row in rows if row]

    # ========== 查询方法 ==========

    def get_by_id(self, id_value: Any) -> Optional[T]:
        """
        根据主键获取单条记录

        Args:
            id_value: 主键值

        Returns:
            记录对象或None
        """
        sql = f"SELECT * FROM {self.TABLE_NAME} WHERE {self.PRIMARY_KEY} = %s"
        row = DatabaseConnection.execute_query(sql, (id_value,), fetch_one=True)
        return self._dict_to_row(row) if row else None

    def get_all(
        self,
        where: str = None,
        params: tuple = None,
        order_by: str = None,
        limit: int = None,
        offset: int = None
    ) -> List[T]:
        """
        获取多条记录

        Args:
            where: WHERE子句（不含WHERE关键字）
            params: 参数元组
            order_by: ORDER BY子句
            limit: 限制数量
            offset: 偏移量

        Returns:
            记录列表
        """
        sql = f"SELECT * FROM {self.TABLE_NAME}"

        if where:
            sql += f" WHERE {where}"

        if order_by:
            sql += f" ORDER BY {order_by}"

        if limit is not None:
            # 安全處理：確保 limit 和 offset 是整數，防止 SQL 注入
            try:
                safe_limit = int(limit)
                if safe_limit > 0:
                    sql += f" LIMIT {safe_limit}"
                    if offset is not None:
                        safe_offset = int(offset)
                        if safe_offset >= 0:
                            sql += f" OFFSET {safe_offset}"
            except (ValueError, TypeError):
                pass  # 忽略無效值

        rows = DatabaseConnection.execute_query(sql, params)
        return self._rows_to_list(rows)

    def count(self, where: str = None, params: tuple = None) -> int:
        """
        统计记录数

        Args:
            where: WHERE子句
            params: 参数元组

        Returns:
            记录数
        """
        sql = f"SELECT COUNT(*) as cnt FROM {self.TABLE_NAME}"

        if where:
            sql += f" WHERE {where}"

        result = DatabaseConnection.execute_query(sql, params, fetch_one=True)
        return result['cnt'] if result else 0

    def exists(self, where: str, params: tuple = None) -> bool:
        """
        检查记录是否存在

        Args:
            where: WHERE子句
            params: 参数元组

        Returns:
            是否存在
        """
        sql = f"SELECT 1 FROM {self.TABLE_NAME} WHERE {where} LIMIT 1"
        result = DatabaseConnection.execute_query(sql, params, fetch_one=True)
        return result is not None

    # ========== 写入方法 ==========

    def insert(self, data: Dict[str, Any]) -> int:
        """
        插入单条记录

        Args:
            data: 字段名到值的映射

        Returns:
            插入的记录ID
        """
        # 处理JSON字段
        processed_data = {}
        for key, value in data.items():
            if isinstance(value, (list, dict)):
                processed_data[key] = json.dumps(value, ensure_ascii=False)
            else:
                processed_data[key] = value

        columns = ', '.join(processed_data.keys())
        placeholders = ', '.join(['%s'] * len(processed_data))
        values = tuple(processed_data.values())

        sql = f"INSERT INTO {self.TABLE_NAME} ({columns}) VALUES ({placeholders})"

        return DatabaseConnection.execute_write(sql, values)

    def update(
        self,
        id_value: Any,
        data: Dict[str, Any]
    ) -> int:
        """
        更新单条记录

        Args:
            id_value: 主键值
            data: 要更新的字段

        Returns:
            受影响的行数
        """
        if not data:
            return 0

        # 处理JSON字段
        processed_data = {}
        for key, value in data.items():
            if isinstance(value, (list, dict)):
                processed_data[key] = json.dumps(value, ensure_ascii=False)
            else:
                processed_data[key] = value

        set_clause = ', '.join([f"{k} = %s" for k in processed_data.keys()])
        values = tuple(processed_data.values()) + (id_value,)

        sql = f"UPDATE {self.TABLE_NAME} SET {set_clause} WHERE {self.PRIMARY_KEY} = %s"

        return DatabaseConnection.execute_write(sql, values, return_lastrowid=False)

    def delete(self, id_value: Any, soft: bool = True) -> int:
        """
        删除记录

        Args:
            id_value: 主键值
            soft: 是否软删除

        Returns:
            受影响的行数
        """
        if soft:
            sql = f"""
                UPDATE {self.TABLE_NAME}
                SET is_deleted = TRUE, deleted_at = NOW()
                WHERE {self.PRIMARY_KEY} = %s
            """
        else:
            sql = f"DELETE FROM {self.TABLE_NAME} WHERE {self.PRIMARY_KEY} = %s"

        return DatabaseConnection.execute_write(sql, (id_value,), return_lastrowid=False)

    def batch_insert(self, data_list: List[Dict[str, Any]]) -> int:
        """
        批量插入

        Args:
            data_list: 记录列表

        Returns:
            插入的记录数
        """
        if not data_list:
            return 0

        # 获取列名（使用第一条记录）
        columns = list(data_list[0].keys())
        columns_str = ', '.join(columns)
        placeholders = ', '.join(['%s'] * len(columns))

        # 准备所有值
        all_values = []
        for data in data_list:
            row_values = []
            for col in columns:
                value = data.get(col)
                if isinstance(value, (list, dict)):
                    row_values.append(json.dumps(value, ensure_ascii=False))
                else:
                    row_values.append(value)
            all_values.append(tuple(row_values))

        sql = f"INSERT INTO {self.TABLE_NAME} ({columns_str}) VALUES ({placeholders})"

        count = 0
        with DatabaseConnection.get_connection() as conn:
            cursor = conn.cursor()
            try:
                for values in all_values:
                    cursor.execute(sql, values)
                    count += 1
                conn.commit()
            except Exception as e:
                conn.rollback()
                logger.error(f"批量插入失败: {e}")
                raise
            finally:
                cursor.close()

        return count

    # ========== 工具方法 ==========

    def increment(
        self,
        id_value: Any,
        field: str,
        amount: int = 1
    ) -> int:
        """
        增加计数字段

        Args:
            id_value: 主键值
            field: 字段名
            amount: 增加的数量

        Returns:
            受影响的行数
        """
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET {field} = {field} + %s
            WHERE {self.PRIMARY_KEY} = %s
        """
        return DatabaseConnection.execute_write(
            sql,
            (amount, id_value),
            return_lastrowid=False
        )

    def decrement(
        self,
        id_value: Any,
        field: str,
        amount: int = 1
    ) -> int:
        """
        减少计数字段

        Args:
            id_value: 主键值
            field: 字段名
            amount: 减少的数量

        Returns:
            受影响的行数
        """
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET {field} = GREATEST(0, {field} - %s)
            WHERE {self.PRIMARY_KEY} = %s
        """
        return DatabaseConnection.execute_write(
            sql,
            (amount, id_value),
            return_lastrowid=False
        )
