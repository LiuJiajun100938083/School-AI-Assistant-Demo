"""
回复数据访问层
=============

处理forum_replies表的所有数据库操作。
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from .base_dal import BaseDAL, DatabaseConnection

logger = logging.getLogger(__name__)


class ReplyDAL(BaseDAL):
    """回复数据访问层"""

    TABLE_NAME = "forum_replies"
    PRIMARY_KEY = "reply_id"

    # ========== 查询方法 ==========

    def get_by_id(self, reply_id: int) -> Optional[Dict]:
        """根据ID获取回复"""
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE reply_id = %s AND is_deleted = FALSE
        """
        return DatabaseConnection.execute_query(sql, (reply_id,), fetch_one=True)

    def get_replies_by_post(
        self,
        post_id: int,
        include_nested: bool = True,
        order_instructor_first: bool = True
    ) -> List[Dict]:
        """
        获取主题的所有回复

        Args:
            post_id: 主题ID
            include_nested: 是否包含嵌套回复
            order_instructor_first: 教师回复是否优先

        Returns:
            回复列表
        """
        conditions = [
            "post_id = %s",
            "is_deleted = FALSE"
        ]

        if not include_nested:
            conditions.append("parent_reply_id IS NULL")

        where_clause = " AND ".join(conditions)

        # 排序：教师回复优先，然后按时间
        if order_instructor_first:
            order_by = "is_instructor_response DESC, is_accepted_answer DESC, created_at ASC"
        else:
            order_by = "created_at ASC"

        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE {where_clause}
            ORDER BY {order_by}
        """

        return DatabaseConnection.execute_query(sql, (post_id,)) or []

    def get_nested_replies(self, parent_reply_id: int) -> List[Dict]:
        """获取嵌套回复"""
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE parent_reply_id = %s AND is_deleted = FALSE
            ORDER BY created_at ASC
        """
        return DatabaseConnection.execute_query(sql, (parent_reply_id,)) or []

    def count_by_post(self, post_id: int) -> int:
        """统计主题的回复数"""
        sql = f"""
            SELECT COUNT(*) as cnt FROM {self.TABLE_NAME}
            WHERE post_id = %s AND is_deleted = FALSE
        """
        result = DatabaseConnection.execute_query(sql, (post_id,), fetch_one=True)
        return result['cnt'] if result else 0

    def get_user_replies(
        self,
        username: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """
        获取用户的所有回复

        Returns:
            (回复列表, 总数)
        """
        # 计数
        count_sql = f"""
            SELECT COUNT(*) as cnt FROM {self.TABLE_NAME}
            WHERE author_username = %s AND is_deleted = FALSE
        """
        count_result = DatabaseConnection.execute_query(count_sql, (username,), fetch_one=True)
        total = count_result['cnt'] if count_result else 0

        # 分页获取
        offset = (page - 1) * page_size
        sql = f"""
            SELECT r.*, p.title as post_title
            FROM {self.TABLE_NAME} r
            LEFT JOIN forum_posts p ON r.post_id = p.post_id
            WHERE r.author_username = %s AND r.is_deleted = FALSE
            ORDER BY r.created_at DESC
            LIMIT %s OFFSET %s
        """
        rows = DatabaseConnection.execute_query(sql, (username, page_size, offset))

        return rows or [], total

    # ========== 写入方法 ==========

    def create_reply(
        self,
        post_id: int,
        author_username: str,
        content: str,
        content_html: str,
        is_anonymous: bool = False,
        anonymous_name: Optional[str] = None,
        is_instructor_response: bool = False,
        parent_reply_id: Optional[int] = None
    ) -> int:
        """
        创建回复

        Returns:
            新回复ID
        """
        data = {
            'post_id': post_id,
            'author_username': author_username,
            'content': content,
            'content_html': content_html,
            'is_anonymous': is_anonymous,
            'anonymous_name': anonymous_name,
            'is_instructor_response': is_instructor_response,
            'parent_reply_id': parent_reply_id
        }

        return self.insert(data)

    def update_reply(
        self,
        reply_id: int,
        content: Optional[str] = None,
        content_html: Optional[str] = None,
        is_accepted_answer: Optional[bool] = None
    ) -> int:
        """
        更新回复

        Returns:
            受影响的行数
        """
        data = {}

        if content is not None:
            data['content'] = content
        if content_html is not None:
            data['content_html'] = content_html
        if is_accepted_answer is not None:
            data['is_accepted_answer'] = is_accepted_answer

        if not data:
            return 0

        return self.update(reply_id, data)

    def set_accepted_answer(self, reply_id: int, post_id: int) -> int:
        """
        设置采纳答案（同时取消其他采纳）

        Args:
            reply_id: 要采纳的回复ID
            post_id: 主题ID

        Returns:
            受影响的行数
        """
        # 先取消所有已采纳的
        unset_sql = f"""
            UPDATE {self.TABLE_NAME}
            SET is_accepted_answer = FALSE
            WHERE post_id = %s AND is_accepted_answer = TRUE
        """
        DatabaseConnection.execute_write(unset_sql, (post_id,), return_lastrowid=False)

        # 设置新的采纳
        set_sql = f"""
            UPDATE {self.TABLE_NAME}
            SET is_accepted_answer = TRUE
            WHERE reply_id = %s
        """
        return DatabaseConnection.execute_write(set_sql, (reply_id,), return_lastrowid=False)

    def increment_upvote_count(self, reply_id: int) -> int:
        """增加点赞数"""
        return self.increment(reply_id, 'upvote_count')

    def decrement_upvote_count(self, reply_id: int) -> int:
        """减少点赞数"""
        return self.decrement(reply_id, 'upvote_count')

    # ========== 辅助方法 ==========

    def get_author(self, reply_id: int) -> Optional[str]:
        """获取回复作者"""
        sql = f"SELECT author_username FROM {self.TABLE_NAME} WHERE reply_id = %s"
        result = DatabaseConnection.execute_query(sql, (reply_id,), fetch_one=True)
        return result['author_username'] if result else None

    def get_post_id(self, reply_id: int) -> Optional[int]:
        """获取回复所属的主题ID"""
        sql = f"SELECT post_id FROM {self.TABLE_NAME} WHERE reply_id = %s"
        result = DatabaseConnection.execute_query(sql, (reply_id,), fetch_one=True)
        return result['post_id'] if result else None

    def has_instructor_response(self, post_id: int) -> bool:
        """检查主题是否有教师回复"""
        sql = f"""
            SELECT 1 FROM {self.TABLE_NAME}
            WHERE post_id = %s
              AND is_instructor_response = TRUE
              AND is_deleted = FALSE
            LIMIT 1
        """
        result = DatabaseConnection.execute_query(sql, (post_id,), fetch_one=True)
        return result is not None


# 单例实例
reply_dal = ReplyDAL()
