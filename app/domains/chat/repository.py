#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
对话 Repository

封装所有对话和消息相关的数据库操作，替代散落在
secure_web_main.py (20+ 处) 和 mysql_database_manager.py 中的对话查询。
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class ConversationRepository(BaseRepository):
    """对话数据 Repository"""

    TABLE = "conversations"

    # ============================================================
    # 对话查询
    # ============================================================

    def get_user_conversations(
        self,
        username: str,
        include_deleted: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        获取用户的对话列表

        Args:
            username: 用户名
            include_deleted: 是否包含已删除对话
        """
        deleted_filter = ""
        if not include_deleted:
            deleted_filter = "AND (c.is_deleted = 0 OR c.is_deleted IS NULL)"

        sql = f"""
            SELECT c.conversation_id as id, c.title, c.subject,
                   COUNT(m.conversation_id) as message_count,
                   c.created_at, c.updated_at
            FROM {self.TABLE} c
            LEFT JOIN messages m ON c.conversation_id = m.conversation_id
            WHERE c.username = %s {deleted_filter}
            GROUP BY c.conversation_id, c.title, c.subject, c.created_at, c.updated_at
            ORDER BY c.updated_at DESC
        """
        return self.raw_query(sql, (username,))

    def get_conversation(
        self,
        username: str,
        conversation_id: str,
    ) -> Optional[Dict[str, Any]]:
        """获取单个对话详情"""
        return self.find_one(
            "username = %s AND conversation_id = %s AND (is_deleted = 0 OR is_deleted IS NULL)",
            (username, conversation_id),
        )

    def get_conversation_stats(self, username: str) -> Dict[str, Any]:
        """
        获取用户对话统计
        """
        return self.raw_query_one(
            "SELECT "
            "  COUNT(DISTINCT c.conversation_id) as total_conversations, "
            "  COUNT(DISTINCT c.subject) as active_subjects, "
            "  COUNT(m.conversation_id) as total_messages, "
            "  MIN(c.created_at) as first_activity, "
            "  MAX(c.updated_at) as last_activity "
            "FROM conversations c "
            "LEFT JOIN messages m ON c.conversation_id = m.conversation_id "
            "WHERE c.username = %s AND c.is_deleted = 0",
            (username,),
        ) or {}

    def get_subject_distribution(self, username: str) -> List[Dict[str, Any]]:
        """获取用户的学科分布统计"""
        return self.raw_query(
            "SELECT "
            "  c.subject, "
            "  COUNT(DISTINCT c.conversation_id) as conversation_count, "
            "  COUNT(m.conversation_id) as message_count "
            "FROM conversations c "
            "LEFT JOIN messages m ON c.conversation_id = m.conversation_id "
            "WHERE c.username = %s AND c.is_deleted = 0 "
            "GROUP BY c.subject "
            "ORDER BY message_count DESC",
            (username,),
        )

    def count_all_conversations(self) -> int:
        """统计总对话数"""
        return self.count()

    # ============================================================
    # 对话写入
    # ============================================================

    def create_conversation(
        self,
        username: str,
        conversation_id: str,
        title: str,
        subject: str,
    ) -> int:
        """创建新对话"""
        now = datetime.now()
        return self.upsert(
            {
                "username": username,
                "conversation_id": conversation_id,
                "title": title,
                "subject": subject,
                "created_at": now,
                "updated_at": now,
            },
            update_fields=["title", "subject", "updated_at"],
        )

    def update_conversation_title(
        self,
        conversation_id: str,
        title: str,
    ) -> int:
        """更新对话标题"""
        return self.update(
            {"title": title, "updated_at": datetime.now()},
            "conversation_id = %s",
            (conversation_id,),
        )

    def delete_conversation(
        self,
        username: str,
        conversation_id: str,
        soft: bool = True,
    ) -> int:
        """
        删除对话

        Args:
            soft: True=软删除, False=物理删除
        """
        if soft:
            return self.soft_delete(
                "username = %s AND conversation_id = %s",
                (username, conversation_id),
            )
        return self.delete(
            "username = %s AND conversation_id = %s",
            (username, conversation_id),
        )


class MessageRepository(BaseRepository):
    """消息数据 Repository"""

    TABLE = "messages"

    # ============================================================
    # 消息查询
    # ============================================================

    def get_conversation_messages(
        self,
        conversation_id: str,
        limit: int = 0,
    ) -> List[Dict[str, Any]]:
        """获取对话的消息列表"""
        return self.find_all(
            where="conversation_id = %s",
            params=(conversation_id,),
            order_by="timestamp ASC",
            limit=limit,
            columns="role, content, thinking, model_used, timestamp",
        )

    def get_conversation_history(
        self,
        conversation_id: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """获取最近 N 条消息 (用于 LLM 上下文)"""
        return self.find_all(
            where="conversation_id = %s",
            params=(conversation_id,),
            order_by="timestamp DESC",
            limit=limit,
            columns="role, content, thinking, model_used, timestamp",
        )

    def get_recent_user_messages(
        self,
        username: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取用户最近的消息 (跨对话)"""
        return self.raw_query(
            "SELECT m.conversation_id, m.role, m.content, m.thinking, "
            "  m.model_used, m.timestamp, c.subject, c.title "
            "FROM messages m "
            "INNER JOIN conversations c ON m.conversation_id = c.conversation_id "
            "WHERE c.username = %s AND c.is_deleted = 0 "
            "ORDER BY m.timestamp DESC LIMIT %s",
            (username, limit),
        )

    def message_exists(
        self,
        conversation_id: str,
        role: str,
        content: str,
        timestamp: str,
    ) -> bool:
        """检查消息是否已存在 (防重复)"""
        return self.exists(
            "conversation_id = %s AND role = %s AND content = %s AND timestamp = %s",
            (conversation_id, role, content, timestamp),
        )

    # ============================================================
    # 消息写入
    # ============================================================

    def save_message(
        self,
        conversation_id: str,
        role: str,
        content: str,
        thinking: str = "",
        model_used: str = "",
        timestamp: Optional[str] = None,
    ) -> int:
        """
        保存消息

        自动跳过已存在的消息 (INSERT IGNORE)。
        """
        ts = timestamp or datetime.now().isoformat()
        return self.raw_execute(
            "INSERT IGNORE INTO messages "
            "(conversation_id, role, content, thinking, model_used, timestamp) "
            "VALUES (%s, %s, %s, %s, %s, %s)",
            (conversation_id, role, content, thinking or "", model_used or "", ts),
        )

    def save_message_and_update_conversation(
        self,
        conversation_id: str,
        role: str,
        content: str,
        thinking: str = "",
        model_used: str = "",
        timestamp: Optional[str] = None,
    ) -> int:
        """保存消息并更新对话的 updated_at"""
        ts = timestamp or datetime.now().isoformat()
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT IGNORE INTO messages "
                "(conversation_id, role, content, thinking, model_used, timestamp) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (conversation_id, role, content, thinking or "", model_used or "", ts),
            )
            cursor.execute(
                "UPDATE conversations SET updated_at = %s "
                "WHERE conversation_id = %s",
                (datetime.now(), conversation_id),
            )
            return cursor.rowcount
