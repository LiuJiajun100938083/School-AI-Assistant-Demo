"""
投票数据访问层
=============

处理forum_votes表的所有数据库操作。
"""

import logging
from typing import Dict, List, Optional

from .base_dal import BaseDAL, DatabaseConnection
from ..models.schemas import VoteType

logger = logging.getLogger(__name__)


class VoteDAL(BaseDAL):
    """投票数据访问层"""

    TABLE_NAME = "forum_votes"
    PRIMARY_KEY = "vote_id"

    # ========== 查询方法 ==========

    def get_user_vote_for_post(
        self,
        post_id: int,
        username: str
    ) -> Optional[VoteType]:
        """
        获取用户对主题的投票

        Args:
            post_id: 主题ID
            username: 用户名

        Returns:
            投票类型或None
        """
        sql = f"""
            SELECT vote_type FROM {self.TABLE_NAME}
            WHERE post_id = %s AND voter_username = %s
        """
        result = DatabaseConnection.execute_query(sql, (post_id, username), fetch_one=True)
        if result:
            return VoteType(result['vote_type'])
        return None

    def get_user_vote_for_reply(
        self,
        reply_id: int,
        username: str
    ) -> Optional[VoteType]:
        """
        获取用户对回复的投票

        Args:
            reply_id: 回复ID
            username: 用户名

        Returns:
            投票类型或None
        """
        sql = f"""
            SELECT vote_type FROM {self.TABLE_NAME}
            WHERE reply_id = %s AND voter_username = %s
        """
        result = DatabaseConnection.execute_query(sql, (reply_id, username), fetch_one=True)
        if result:
            return VoteType(result['vote_type'])
        return None

    def get_user_votes_for_posts(
        self,
        post_ids: List[int],
        username: str
    ) -> Dict[int, VoteType]:
        """
        批量获取用户对多个主题的投票

        Args:
            post_ids: 主题ID列表
            username: 用户名

        Returns:
            {post_id: vote_type} 映射
        """
        if not post_ids:
            return {}

        placeholders = ','.join(['%s'] * len(post_ids))
        sql = f"""
            SELECT post_id, vote_type FROM {self.TABLE_NAME}
            WHERE post_id IN ({placeholders}) AND voter_username = %s
        """
        params = tuple(post_ids) + (username,)
        rows = DatabaseConnection.execute_query(sql, params)

        return {
            row['post_id']: VoteType(row['vote_type'])
            for row in (rows or [])
        }

    def get_user_votes_for_replies(
        self,
        reply_ids: List[int],
        username: str
    ) -> Dict[int, VoteType]:
        """
        批量获取用户对多个回复的投票

        Args:
            reply_ids: 回复ID列表
            username: 用户名

        Returns:
            {reply_id: vote_type} 映射
        """
        if not reply_ids:
            return {}

        placeholders = ','.join(['%s'] * len(reply_ids))
        sql = f"""
            SELECT reply_id, vote_type FROM {self.TABLE_NAME}
            WHERE reply_id IN ({placeholders}) AND voter_username = %s
        """
        params = tuple(reply_ids) + (username,)
        rows = DatabaseConnection.execute_query(sql, params)

        return {
            row['reply_id']: VoteType(row['vote_type'])
            for row in (rows or [])
        }

    def count_post_votes(self, post_id: int) -> Dict[str, int]:
        """
        统计主题的投票

        Returns:
            {'upvote': n, 'downvote': m}
        """
        sql = f"""
            SELECT vote_type, COUNT(*) as cnt FROM {self.TABLE_NAME}
            WHERE post_id = %s
            GROUP BY vote_type
        """
        rows = DatabaseConnection.execute_query(sql, (post_id,))

        result = {'upvote': 0, 'downvote': 0}
        for row in (rows or []):
            result[row['vote_type']] = row['cnt']
        return result

    def count_reply_votes(self, reply_id: int) -> Dict[str, int]:
        """
        统计回复的投票

        Returns:
            {'upvote': n, 'downvote': m}
        """
        sql = f"""
            SELECT vote_type, COUNT(*) as cnt FROM {self.TABLE_NAME}
            WHERE reply_id = %s
            GROUP BY vote_type
        """
        rows = DatabaseConnection.execute_query(sql, (reply_id,))

        result = {'upvote': 0, 'downvote': 0}
        for row in (rows or []):
            result[row['vote_type']] = row['cnt']
        return result

    # ========== 写入方法 ==========

    def vote_post(
        self,
        post_id: int,
        username: str,
        vote_type: VoteType
    ) -> str:
        """
        对主题投票

        Args:
            post_id: 主题ID
            username: 用户名
            vote_type: 投票类型

        Returns:
            操作结果: 'created', 'updated', 'removed'
        """
        # 检查是否已投票
        existing = self.get_user_vote_for_post(post_id, username)

        if existing is None:
            # 新投票
            self.insert({
                'post_id': post_id,
                'voter_username': username,
                'vote_type': vote_type.value
            })
            return 'created'

        elif existing == vote_type:
            # 取消投票
            sql = f"""
                DELETE FROM {self.TABLE_NAME}
                WHERE post_id = %s AND voter_username = %s
            """
            DatabaseConnection.execute_write(sql, (post_id, username), return_lastrowid=False)
            return 'removed'

        else:
            # 更改投票
            sql = f"""
                UPDATE {self.TABLE_NAME}
                SET vote_type = %s
                WHERE post_id = %s AND voter_username = %s
            """
            DatabaseConnection.execute_write(
                sql,
                (vote_type.value, post_id, username),
                return_lastrowid=False
            )
            return 'updated'

    def vote_reply(
        self,
        reply_id: int,
        username: str,
        vote_type: VoteType
    ) -> str:
        """
        对回复投票

        Args:
            reply_id: 回复ID
            username: 用户名
            vote_type: 投票类型

        Returns:
            操作结果: 'created', 'updated', 'removed'
        """
        # 检查是否已投票
        existing = self.get_user_vote_for_reply(reply_id, username)

        if existing is None:
            # 新投票
            self.insert({
                'reply_id': reply_id,
                'voter_username': username,
                'vote_type': vote_type.value
            })
            return 'created'

        elif existing == vote_type:
            # 取消投票
            sql = f"""
                DELETE FROM {self.TABLE_NAME}
                WHERE reply_id = %s AND voter_username = %s
            """
            DatabaseConnection.execute_write(sql, (reply_id, username), return_lastrowid=False)
            return 'removed'

        else:
            # 更改投票
            sql = f"""
                UPDATE {self.TABLE_NAME}
                SET vote_type = %s
                WHERE reply_id = %s AND voter_username = %s
            """
            DatabaseConnection.execute_write(
                sql,
                (vote_type.value, reply_id, username),
                return_lastrowid=False
            )
            return 'updated'

    def remove_post_vote(self, post_id: int, username: str) -> bool:
        """移除主题投票"""
        sql = f"""
            DELETE FROM {self.TABLE_NAME}
            WHERE post_id = %s AND voter_username = %s
        """
        affected = DatabaseConnection.execute_write(
            sql,
            (post_id, username),
            return_lastrowid=False
        )
        return affected > 0

    def remove_reply_vote(self, reply_id: int, username: str) -> bool:
        """移除回复投票"""
        sql = f"""
            DELETE FROM {self.TABLE_NAME}
            WHERE reply_id = %s AND voter_username = %s
        """
        affected = DatabaseConnection.execute_write(
            sql,
            (reply_id, username),
            return_lastrowid=False
        )
        return affected > 0


# 单例实例
vote_dal = VoteDAL()
