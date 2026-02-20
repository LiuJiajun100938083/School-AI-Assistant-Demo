"""
搜索业务逻辑层
=============

处理搜索相关的所有业务逻辑。
"""

import logging
from typing import List, Optional

from ..models.schemas import (
    PostType, SortOrder,
    PostResponse, PostListResponse, TagResponse, TagListResponse,
    SearchResponse
)
from ..dal.post_dal import post_dal
from ..dal.vote_dal import vote_dal
from ..utils.pagination import Paginator
from ..utils.sanitizers import ContentSanitizer
from .post_service import post_service

logger = logging.getLogger(__name__)


class SearchService:
    """搜索业务服务"""

    def search(
        self,
        query: str,
        username: str,
        role: str,
        post_type: Optional[PostType] = None,
        tag: Optional[str] = None,
        sort: SortOrder = SortOrder.NEWEST,
        page: int = 1,
        page_size: int = 20
    ) -> SearchResponse:
        """
        搜索主题

        Args:
            query: 搜索关键词
            username: 用户名
            role: 用户角色
            post_type: 筛选类型
            tag: 筛选标签
            sort: 排序方式
            page: 页码
            page_size: 每页数量

        Returns:
            搜索结果
        """
        # 使用PostService的搜索方法
        result = post_service.search_posts(
            query=query,
            username=username,
            role=role,
            post_type=post_type,
            tag=tag,
            sort=sort,
            page=page,
            page_size=page_size
        )

        return SearchResponse(
            items=result.items,
            query=query,
            total_results=result.pagination.total_items,
            pagination=result.pagination
        )

    def get_trending(
        self,
        username: str,
        role: str,
        days: int = 7,
        limit: int = 10
    ) -> List[PostResponse]:
        """
        获取热门主题

        Args:
            username: 用户名
            role: 用户角色
            days: 时间范围（天）
            limit: 数量限制

        Returns:
            热门主题列表
        """
        return post_service.get_trending_posts(username, role, days, limit)

    def get_tags(self, limit: int = 50) -> TagListResponse:
        """
        获取标签列表（按使用次数排序）

        Args:
            limit: 数量限制

        Returns:
            标签列表
        """
        tags_data = post_dal.get_tags_with_count(limit)

        items = []
        for i, tag in enumerate(tags_data):
            items.append(TagResponse(
                tag_id=i + 1,  # 临时ID
                tag_name=tag['tag_name'],
                tag_description=None,
                tag_color='#006633',  # 默认颜色
                usage_count=tag['usage_count']
            ))

        return TagListResponse(items=items)

    def suggest_tags(self, prefix: str, limit: int = 10) -> List[str]:
        """
        标签自动完成建议

        Args:
            prefix: 输入前缀
            limit: 建议数量

        Returns:
            标签名列表
        """
        if not prefix or len(prefix) < 1:
            return []

        tags_data = post_dal.get_tags_with_count(100)

        # 过滤匹配的标签
        suggestions = []
        prefix_lower = prefix.lower()
        for tag in tags_data:
            if tag['tag_name'].lower().startswith(prefix_lower):
                suggestions.append(tag['tag_name'])
                if len(suggestions) >= limit:
                    break

        return suggestions


# 单例实例
search_service = SearchService()
