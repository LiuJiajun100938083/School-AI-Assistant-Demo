"""
主题数据访问层
=============

处理forum_posts表的所有数据库操作。
"""

import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

from .base_dal import BaseDAL, DatabaseConnection
from ..models.schemas import PostType, Visibility, SortOrder

logger = logging.getLogger(__name__)


class PostDAL(BaseDAL):
    """主题数据访问层"""

    TABLE_NAME = "forum_posts"
    PRIMARY_KEY = "post_id"

    # ========== 查询方法 ==========

    def get_by_id_with_permission(
        self,
        post_id: int,
        user_role: str,
        include_deleted: bool = False
    ) -> Optional[Dict]:
        """
        根据ID获取主题（带权限检查）

        Args:
            post_id: 主题ID
            user_role: 用户角色
            include_deleted: 是否包含已删除

        Returns:
            主题数据或None
        """
        conditions = ["post_id = %s"]
        params = [post_id]

        # 非教师/管理员只能看public
        if user_role not in ('teacher', 'admin'):
            conditions.append("visibility = 'public'")

        if not include_deleted:
            conditions.append("is_deleted = FALSE")

        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE {' AND '.join(conditions)}
        """

        return DatabaseConnection.execute_query(sql, tuple(params), fetch_one=True)

    def list_posts(
        self,
        user_role: str,
        post_type: Optional[PostType] = None,
        visibility: Optional[Visibility] = None,
        tag: Optional[str] = None,
        author: Optional[str] = None,
        is_pinned: Optional[bool] = None,
        sort: SortOrder = SortOrder.NEWEST,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """
        获取主题列表

        Args:
            user_role: 用户角色
            post_type: 筛选类型
            visibility: 筛选可见性
            tag: 筛选标签
            author: 筛选作者
            is_pinned: 筛选置顶
            sort: 排序方式
            page: 页码
            page_size: 每页数量

        Returns:
            (主题列表, 总数)
        """
        conditions = ["is_deleted = FALSE"]
        params = []

        # 权限控制
        if user_role not in ('teacher', 'admin'):
            conditions.append("visibility = 'public'")
        elif visibility:
            conditions.append("visibility = %s")
            params.append(visibility.value)

        # 类型筛选
        if post_type:
            conditions.append("post_type = %s")
            params.append(post_type.value)

        # 标签筛选
        if tag:
            conditions.append("JSON_CONTAINS(tags, JSON_QUOTE(%s))")
            params.append(tag)

        # 作者筛选
        if author:
            conditions.append("author_username = %s")
            params.append(author)

        # 置顶筛选
        if is_pinned is not None:
            conditions.append("is_pinned = %s")
            params.append(is_pinned)

        where_clause = " AND ".join(conditions)

        # 排序
        order_map = {
            SortOrder.NEWEST: "is_pinned DESC, created_at DESC",
            SortOrder.OLDEST: "is_pinned DESC, created_at ASC",
            SortOrder.MOST_UPVOTED: "is_pinned DESC, upvote_count DESC, created_at DESC",
            SortOrder.MOST_REPLIED: "is_pinned DESC, reply_count DESC, created_at DESC",
            SortOrder.MOST_VIEWED: "is_pinned DESC, view_count DESC, created_at DESC",
        }
        order_by = order_map.get(sort, "is_pinned DESC, created_at DESC")

        # 获取总数
        count_sql = f"SELECT COUNT(*) as cnt FROM {self.TABLE_NAME} WHERE {where_clause}"
        count_result = DatabaseConnection.execute_query(count_sql, tuple(params), fetch_one=True)
        total = count_result['cnt'] if count_result else 0

        # 分页
        offset = (page - 1) * page_size

        # 获取数据
        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE {where_clause}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """
        params.extend([page_size, offset])

        rows = DatabaseConnection.execute_query(sql, tuple(params))

        return rows or [], total

    def search(
        self,
        query: str,
        user_role: str,
        post_type: Optional[PostType] = None,
        tag: Optional[str] = None,
        sort: SortOrder = SortOrder.NEWEST,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """
        全文搜索主题

        Args:
            query: 搜索词
            user_role: 用户角色
            post_type: 筛选类型
            tag: 筛选标签
            sort: 排序方式
            page: 页码
            page_size: 每页数量

        Returns:
            (搜索结果, 总数)
        """
        conditions = ["is_deleted = FALSE"]
        params = []

        # 权限控制
        if user_role not in ('teacher', 'admin'):
            conditions.append("visibility = 'public'")

        # 全文搜索
        if query:
            conditions.append("MATCH(title, content) AGAINST(%s IN BOOLEAN MODE)")
            params.append(query)

        # 类型筛选
        if post_type:
            conditions.append("post_type = %s")
            params.append(post_type.value)

        # 标签筛选
        if tag:
            conditions.append("JSON_CONTAINS(tags, JSON_QUOTE(%s))")
            params.append(tag)

        where_clause = " AND ".join(conditions)

        # 获取总数
        count_sql = f"SELECT COUNT(*) as cnt FROM {self.TABLE_NAME} WHERE {where_clause}"
        count_result = DatabaseConnection.execute_query(count_sql, tuple(params), fetch_one=True)
        total = count_result['cnt'] if count_result else 0

        # 排序
        if query:
            # 搜索时优先按相关性排序
            order_by = f"MATCH(title, content) AGAINST(%s) DESC, created_at DESC"
            params_for_select = params + [query]
        else:
            order_map = {
                SortOrder.NEWEST: "created_at DESC",
                SortOrder.MOST_UPVOTED: "upvote_count DESC",
                SortOrder.MOST_REPLIED: "reply_count DESC",
            }
            order_by = order_map.get(sort, "created_at DESC")
            params_for_select = params.copy()

        # 分页
        offset = (page - 1) * page_size

        sql = f"""
            SELECT * FROM {self.TABLE_NAME}
            WHERE {where_clause}
            ORDER BY {order_by}
            LIMIT %s OFFSET %s
        """
        params_for_select.extend([page_size, offset])

        rows = DatabaseConnection.execute_query(sql, tuple(params_for_select))

        return rows or [], total

    def get_trending(
        self,
        user_role: str,
        days: int = 7,
        limit: int = 10
    ) -> List[Dict]:
        """
        获取热门主题

        Args:
            user_role: 用户角色
            days: 时间范围（天）
            limit: 数量限制

        Returns:
            热门主题列表
        """
        conditions = [
            "is_deleted = FALSE",
            f"created_at >= DATE_SUB(NOW(), INTERVAL {days} DAY)"
        ]

        if user_role not in ('teacher', 'admin'):
            conditions.append("visibility = 'public'")

        where_clause = " AND ".join(conditions)

        sql = f"""
            SELECT *,
                (view_count * 1 + reply_count * 5 + upvote_count * 3) as score
            FROM {self.TABLE_NAME}
            WHERE {where_clause}
            ORDER BY score DESC, created_at DESC
            LIMIT %s
        """

        return DatabaseConnection.execute_query(sql, (limit,)) or []

    # ========== 写入方法 ==========

    def create_post(
        self,
        author_username: str,
        title: str,
        content: str,
        content_html: str,
        post_type: PostType,
        visibility: Visibility,
        is_anonymous: bool = False,
        anonymous_name: Optional[str] = None,
        tags: List[str] = None
    ) -> int:
        """
        创建主题

        Returns:
            新主题ID
        """
        data = {
            'author_username': author_username,
            'title': title,
            'content': content,
            'content_html': content_html,
            'post_type': post_type.value,
            'visibility': visibility.value,
            'is_anonymous': is_anonymous,
            'anonymous_name': anonymous_name,
            'tags': tags or []
        }

        return self.insert(data)

    def update_post(
        self,
        post_id: int,
        title: Optional[str] = None,
        content: Optional[str] = None,
        content_html: Optional[str] = None,
        visibility: Optional[Visibility] = None,
        tags: Optional[List[str]] = None,
        is_pinned: Optional[bool] = None,
        is_locked: Optional[bool] = None,
        is_resolved: Optional[bool] = None
    ) -> int:
        """
        更新主题

        Returns:
            受影响的行数
        """
        data = {}

        if title is not None:
            data['title'] = title
        if content is not None:
            data['content'] = content
        if content_html is not None:
            data['content_html'] = content_html
        if visibility is not None:
            data['visibility'] = visibility.value
        if tags is not None:
            data['tags'] = tags
        if is_pinned is not None:
            data['is_pinned'] = is_pinned
        if is_locked is not None:
            data['is_locked'] = is_locked
        if is_resolved is not None:
            data['is_resolved'] = is_resolved

        if not data:
            return 0

        return self.update(post_id, data)

    def increment_view_count(self, post_id: int) -> int:
        """增加浏览次数"""
        return self.increment(post_id, 'view_count')

    def increment_reply_count(self, post_id: int) -> int:
        """增加回复数"""
        return self.increment(post_id, 'reply_count')

    def decrement_reply_count(self, post_id: int) -> int:
        """减少回复数"""
        return self.decrement(post_id, 'reply_count')

    def increment_upvote_count(self, post_id: int) -> int:
        """增加点赞数"""
        return self.increment(post_id, 'upvote_count')

    def decrement_upvote_count(self, post_id: int) -> int:
        """减少点赞数"""
        return self.decrement(post_id, 'upvote_count')

    # ========== 辅助方法 ==========

    def has_instructor_response(self, post_id: int) -> bool:
        """检查是否有教师回复"""
        sql = """
            SELECT 1 FROM forum_replies
            WHERE post_id = %s
              AND is_instructor_response = TRUE
              AND is_deleted = FALSE
            LIMIT 1
        """
        result = DatabaseConnection.execute_query(sql, (post_id,), fetch_one=True)
        return result is not None

    def get_author(self, post_id: int) -> Optional[str]:
        """获取主题作者"""
        sql = f"SELECT author_username FROM {self.TABLE_NAME} WHERE post_id = %s"
        result = DatabaseConnection.execute_query(sql, (post_id,), fetch_one=True)
        return result['author_username'] if result else None

    def is_locked(self, post_id: int) -> bool:
        """检查主题是否锁定"""
        sql = f"SELECT is_locked FROM {self.TABLE_NAME} WHERE post_id = %s"
        result = DatabaseConnection.execute_query(sql, (post_id,), fetch_one=True)
        return result['is_locked'] if result else True

    def get_tags_with_count(self, limit: int = 20) -> List[Dict]:
        """获取标签使用统计"""
        sql = """
            SELECT
                JSON_UNQUOTE(tag.tag) as tag_name,
                COUNT(*) as usage_count
            FROM forum_posts,
                JSON_TABLE(tags, '$[*]' COLUMNS(tag VARCHAR(50) PATH '$')) as tag
            WHERE is_deleted = FALSE
            GROUP BY tag.tag
            ORDER BY usage_count DESC
            LIMIT %s
        """
        return DatabaseConnection.execute_query(sql, (limit,)) or []


# 单例实例
post_dal = PostDAL()
