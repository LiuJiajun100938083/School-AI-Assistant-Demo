"""
通知数据访问层
=============

处理forum_notifications表的所有数据库操作。
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from .base_dal import BaseDAL, DatabaseConnection
from ..models.schemas import NotificationType

logger = logging.getLogger(__name__)


class NotificationDAL(BaseDAL):
    """通知数据访问层"""

    TABLE_NAME = "forum_notifications"
    PRIMARY_KEY = "notification_id"

    # ========== 查询方法 ==========

    def get_user_notifications(
        self,
        username: str,
        unread_only: bool = False,
        notification_type: Optional[NotificationType] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """
        获取用户通知列表

        Args:
            username: 用户名
            unread_only: 是否只获取未读
            notification_type: 筛选类型
            page: 页码
            page_size: 每页数量

        Returns:
            (通知列表, 总数)
        """
        conditions = ["n.user_username = %s"]
        params = [username]

        if unread_only:
            conditions.append("n.is_read = FALSE")

        if notification_type:
            conditions.append("n.notification_type = %s")
            params.append(notification_type.value)

        where_clause = " AND ".join(conditions)

        # 计数
        count_sql = f"""
            SELECT COUNT(*) as cnt FROM {self.TABLE_NAME} n
            WHERE {where_clause}
        """
        count_result = DatabaseConnection.execute_query(count_sql, tuple(params), fetch_one=True)
        total = count_result['cnt'] if count_result else 0

        # 分页获取（关联主题标题）
        offset = (page - 1) * page_size
        sql = f"""
            SELECT n.*, p.title as post_title
            FROM {self.TABLE_NAME} n
            LEFT JOIN forum_posts p ON n.post_id = p.post_id
            WHERE {where_clause}
            ORDER BY n.created_at DESC
            LIMIT %s OFFSET %s
        """
        params.extend([page_size, offset])
        rows = DatabaseConnection.execute_query(sql, tuple(params))

        return rows or [], total

    def get_unread_count(self, username: str) -> int:
        """获取未读通知数量"""
        sql = f"""
            SELECT COUNT(*) as cnt FROM {self.TABLE_NAME}
            WHERE user_username = %s AND is_read = FALSE
        """
        result = DatabaseConnection.execute_query(sql, (username,), fetch_one=True)
        return result['cnt'] if result else 0

    # ========== 写入方法 ==========

    def create_notification(
        self,
        user_username: str,
        notification_type: NotificationType,
        title: str,
        message: Optional[str] = None,
        post_id: Optional[int] = None,
        reply_id: Optional[int] = None,
        related_username: Optional[str] = None
    ) -> int:
        """
        创建通知

        Returns:
            新通知ID
        """
        data = {
            'user_username': user_username,
            'notification_type': notification_type.value,
            'title': title,
            'message': message,
            'post_id': post_id,
            'reply_id': reply_id,
            'related_username': related_username
        }

        return self.insert(data)

    def mark_as_read(self, notification_id: int) -> int:
        """标记为已读"""
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET is_read = TRUE, read_at = NOW()
            WHERE notification_id = %s AND is_read = FALSE
        """
        return DatabaseConnection.execute_write(sql, (notification_id,), return_lastrowid=False)

    def mark_all_as_read(self, username: str) -> int:
        """标记所有为已读"""
        sql = f"""
            UPDATE {self.TABLE_NAME}
            SET is_read = TRUE, read_at = NOW()
            WHERE user_username = %s AND is_read = FALSE
        """
        return DatabaseConnection.execute_write(sql, (username,), return_lastrowid=False)

    def delete_notification(self, notification_id: int) -> int:
        """删除通知"""
        sql = f"DELETE FROM {self.TABLE_NAME} WHERE notification_id = %s"
        return DatabaseConnection.execute_write(sql, (notification_id,), return_lastrowid=False)

    def delete_old_notifications(self, days: int = 30) -> int:
        """删除旧通知"""
        sql = f"""
            DELETE FROM {self.TABLE_NAME}
            WHERE created_at < DATE_SUB(NOW(), INTERVAL %s DAY)
        """
        return DatabaseConnection.execute_write(sql, (days,), return_lastrowid=False)

    # ========== 批量创建 ==========

    def notify_post_author(
        self,
        post_id: int,
        reply_id: int,
        replier_username: str,
        is_instructor: bool = False
    ) -> Optional[int]:
        """
        通知主题作者有新回复

        Returns:
            通知ID或None（如果是自己回复自己）
        """
        # 获取主题作者
        author_sql = "SELECT author_username, title FROM forum_posts WHERE post_id = %s"
        post = DatabaseConnection.execute_query(author_sql, (post_id,), fetch_one=True)

        if not post:
            return None

        author = post['author_username']
        title = post['title']

        # 不通知自己
        if author == replier_username:
            return None

        # 确定通知类型
        if is_instructor:
            notification_type = NotificationType.INSTRUCTOR_RESPONSE
            notification_title = "老师回复了你的讨论"
        else:
            notification_type = NotificationType.NEW_REPLY
            notification_title = "你的讨论有新回复"

        return self.create_notification(
            user_username=author,
            notification_type=notification_type,
            title=notification_title,
            message=f"在「{title[:50]}」中",
            post_id=post_id,
            reply_id=reply_id,
            related_username=replier_username
        )

    def notify_mentioned_users(
        self,
        usernames: List[str],
        post_id: int,
        reply_id: Optional[int],
        mentioner_username: str
    ) -> int:
        """
        通知被@提及的用户

        Returns:
            创建的通知数量
        """
        if not usernames:
            return 0

        # 获取主题标题
        title_sql = "SELECT title FROM forum_posts WHERE post_id = %s"
        post = DatabaseConnection.execute_query(title_sql, (post_id,), fetch_one=True)
        post_title = post['title'][:50] if post else "讨论"

        count = 0
        for username in usernames:
            # 不通知自己
            if username == mentioner_username:
                continue

            self.create_notification(
                user_username=username,
                notification_type=NotificationType.MENTION,
                title=f"{mentioner_username} 在讨论中提到了你",
                message=f"在「{post_title}」中",
                post_id=post_id,
                reply_id=reply_id,
                related_username=mentioner_username
            )
            count += 1

        return count


# 单例实例
notification_dal = NotificationDAL()
