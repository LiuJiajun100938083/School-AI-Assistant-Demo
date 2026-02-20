"""
分页工具
=======

提供统一的分页处理功能。
"""

from typing import TypeVar, Generic, List, Tuple, Optional, Dict, Any
from dataclasses import dataclass
import math

from ..models.schemas import PaginationMeta


T = TypeVar('T')


@dataclass
class PageInfo:
    """分页信息"""
    page: int
    page_size: int
    offset: int
    limit: int


class Paginator:
    """分页器"""

    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    @classmethod
    def get_page_info(
        cls,
        page: int = 1,
        page_size: int = None
    ) -> PageInfo:
        """
        计算分页参数

        Args:
            page: 页码（从1开始）
            page_size: 每页数量

        Returns:
            PageInfo对象
        """
        # 验证页码
        page = max(1, page)

        # 验证每页数量
        if page_size is None:
            page_size = cls.DEFAULT_PAGE_SIZE
        page_size = max(1, min(page_size, cls.MAX_PAGE_SIZE))

        # 计算偏移量
        offset = (page - 1) * page_size

        return PageInfo(
            page=page,
            page_size=page_size,
            offset=offset,
            limit=page_size
        )

    @classmethod
    def create_meta(
        cls,
        page: int,
        page_size: int,
        total_items: int
    ) -> PaginationMeta:
        """
        创建分页元数据

        Args:
            page: 当前页码
            page_size: 每页数量
            total_items: 总条数

        Returns:
            PaginationMeta对象
        """
        total_pages = math.ceil(total_items / page_size) if page_size > 0 else 0

        return PaginationMeta(
            page=page,
            page_size=page_size,
            total_items=total_items,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )

    @classmethod
    def paginate_list(
        cls,
        items: List[T],
        page: int = 1,
        page_size: int = None
    ) -> Tuple[List[T], PaginationMeta]:
        """
        对内存中的列表进行分页

        Args:
            items: 完整列表
            page: 页码
            page_size: 每页数量

        Returns:
            (分页后的列表, 分页元数据)
        """
        page_info = cls.get_page_info(page, page_size)

        total_items = len(items)
        start = page_info.offset
        end = start + page_info.limit

        paginated_items = items[start:end]

        meta = cls.create_meta(
            page=page_info.page,
            page_size=page_info.page_size,
            total_items=total_items
        )

        return paginated_items, meta


class SQLPaginator:
    """SQL分页器"""

    @classmethod
    def build_pagination_clause(
        cls,
        page: int = 1,
        page_size: int = 20
    ) -> str:
        """
        构建SQL分页子句

        Args:
            page: 页码
            page_size: 每页数量

        Returns:
            LIMIT offset, limit 子句
        """
        page_info = Paginator.get_page_info(page, page_size)
        return f"LIMIT {page_info.offset}, {page_info.limit}"

    @classmethod
    def get_offset_limit(
        cls,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[int, int]:
        """
        获取offset和limit值

        Args:
            page: 页码
            page_size: 每页数量

        Returns:
            (offset, limit) 元组
        """
        page_info = Paginator.get_page_info(page, page_size)
        return page_info.offset, page_info.limit


# 便捷函数
def paginate(
    items: List[T],
    page: int = 1,
    page_size: int = 20
) -> Tuple[List[T], PaginationMeta]:
    """对列表进行分页"""
    return Paginator.paginate_list(items, page, page_size)


def get_pagination_params(
    page: int = 1,
    page_size: int = 20
) -> Tuple[int, int]:
    """获取分页参数 (offset, limit)"""
    return SQLPaginator.get_offset_limit(page, page_size)
