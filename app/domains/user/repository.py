#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
用户 Repository

封装所有用户相关的数据库操作，替代散落在
secure_web_main.py / secure_user_manager.py / mysql_database_manager.py 中的用户查询。
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class UserRepository(BaseRepository):
    """用户数据 Repository"""

    TABLE = "users"

    # ============================================================
    # 查询
    # ============================================================

    def find_by_username(self, username: str) -> Optional[Dict[str, Any]]:
        """根据用户名查询用户"""
        return self.find_one("username = %s", (username,))

    def find_by_username_active(self, username: str) -> Optional[Dict[str, Any]]:
        """查询活跃用户"""
        return self.find_one(
            "username = %s AND is_active = TRUE",
            (username,),
        )

    def get_user_profile(self, username: str) -> Optional[Dict[str, Any]]:
        """获取用户个人资料 (不含敏感字段)"""
        return self.find_one(
            "username = %s",
            (username,),
            columns=(
                "id, username, display_name, english_name, card_id, email, role, "
                "class_name, class_number, "
                "is_active, created_at, last_login, login_count"
            ),
        )

    def get_user_info(self, username: str) -> Optional[Dict[str, Any]]:
        """获取用户基本信息 (简版)"""
        return self.find_one(
            "username = %s",
            (username,),
            columns="id, username, display_name, english_name, card_id, class_name, class_number, role, is_active",
        )

    def username_exists(self, username: str) -> bool:
        """检查用户名是否已存在"""
        return self.exists("username = %s", (username,))

    def list_all_users(self, order_by: str = "created_at DESC") -> List[Dict[str, Any]]:
        """获取所有用户列表"""
        return self.find_all(order_by=order_by)

    def list_users_by_role(self, role: str) -> List[Dict[str, Any]]:
        """按角色查询用户"""
        return self.find_all("role = %s", (role,), order_by="created_at DESC")

    def count_by_role(self, role: str) -> int:
        """统计指定角色的用户数"""
        return self.count("role = %s", (role,))

    def count_active_students(self) -> int:
        """统计活跃学生数"""
        return self.count("role = 'student' AND is_active = TRUE")

    def get_all_usernames(self) -> List[str]:
        """获取所有用户名列表 (用于批量导入去重)"""
        rows = self.find_all(columns="username")
        return [r["username"] for r in rows]

    def get_table_columns(self) -> List[Dict[str, Any]]:
        """获取 users 表的列信息"""
        return self.raw_query("SHOW COLUMNS FROM users")

    def get_students_by_class(self, class_name: str) -> List[Dict[str, Any]]:
        """获取指定班级的所有活跃学生"""
        return self.find_all(
            "role = 'student' AND is_active = TRUE AND class_name = %s",
            (class_name,),
            columns="username, display_name, class_name, class_number",
            order_by="class_number ASC, display_name ASC",
        )

    def get_distinct_class_names(self) -> List[str]:
        """获取所有学生的不重复班级名称"""
        rows = self.raw_query(
            "SELECT DISTINCT class_name FROM users "
            "WHERE role = 'student' AND is_active = TRUE "
            "AND class_name IS NOT NULL AND class_name != '' "
            "ORDER BY class_name"
        )
        return [r["class_name"] for r in rows]

    # ============================================================
    # 写入
    # ============================================================

    def create_user(
        self,
        username: str,
        password_hash: str,
        role: str = "student",
        display_name: str = "",
        class_name: str = "",
        class_number: Optional[int] = None,
        email: str = "",
        english_name: str = "",
        card_id: Optional[str] = None,
    ) -> int:
        """创建新用户"""
        data = {
            "username": username,
            "password_hash": password_hash,
            "role": role,
            "display_name": display_name or username,
            "english_name": english_name,
            "class_name": class_name,
            "email": email,
            "is_active": True,
            "is_locked": False,
            "created_at": datetime.now(),
        }
        if class_number is not None:
            data["class_number"] = class_number
        if card_id is not None:
            data["card_id"] = card_id
        return self.insert(data)

    def batch_create_users(self, users: List[Dict[str, Any]]) -> int:
        """
        批量创建用户

        Args:
            users: 用户数据列表，每个包含 username, password_hash, display_name, class_name, role
        """
        if not users:
            return 0

        sql = (
            "INSERT INTO users "
            "(username, password_hash, display_name, english_name, card_id, "
            "class_name, class_number, role, "
            "is_active, is_locked, created_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)"
        )
        params_list = [
            (
                u["username"],
                u["password_hash"],
                u.get("display_name", u["username"]),
                u.get("english_name", ""),
                u.get("card_id"),
                u.get("class_name", ""),
                u.get("class_number"),
                u.get("role", "student"),
                True,
                False,
                datetime.now(),
            )
            for u in users
        ]
        return self.pool.execute_many(sql, params_list)

    def update_user(self, username: str, data: Dict[str, Any]) -> int:
        """更新用户信息"""
        data["updated_at"] = datetime.now()
        return self.update(data, "username = %s", (username,))

    def update_password(self, username: str, password_hash: str) -> int:
        """更新密码"""
        return self.update(
            {
                "password_hash": password_hash,
                "password_changed_at": datetime.now(),
            },
            "username = %s",
            (username,),
        )

    def update_login_info(self, username: str) -> int:
        """更新登录信息 (last_login, login_count)"""
        return self.raw_execute(
            "UPDATE users SET last_login = %s, login_count = login_count + 1 "
            "WHERE username = %s",
            (datetime.now(), username),
        )

    def set_active(self, username: str, is_active: bool) -> int:
        """设置用户是否活跃"""
        return self.update({"is_active": is_active}, "username = %s", (username,))

    def set_locked(self, username: str, is_locked: bool) -> int:
        """设置用户锁定状态"""
        return self.update({"is_locked": is_locked}, "username = %s", (username,))

    def delete_user_cascade(self, username: str) -> Dict[str, int]:
        """
        级联删除用户及其所有数据

        Returns:
            各表删除行数
        """
        results = {}
        with self.transaction() as conn:
            cursor = conn.cursor()

            # 删除消息
            cursor.execute(
                "DELETE m FROM messages m "
                "JOIN conversations c ON m.conversation_id = c.conversation_id "
                "WHERE c.username = %s",
                (username,),
            )
            results["messages"] = cursor.rowcount

            # 删除对话
            cursor.execute(
                "DELETE FROM conversations WHERE username = %s",
                (username,),
            )
            results["conversations"] = cursor.rowcount

            # 删除会话
            try:
                cursor.execute(
                    "DELETE FROM sessions WHERE username = %s",
                    (username,),
                )
                results["sessions"] = cursor.rowcount
            except Exception:
                results["sessions"] = 0

            # 删除用户
            cursor.execute(
                "DELETE FROM users WHERE username = %s",
                (username,),
            )
            results["users"] = cursor.rowcount

        logger.info(f"用户 {username} 已级联删除: {results}")
        return results
