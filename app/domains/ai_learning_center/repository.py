#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI学习中心 Repository

封装所有AI学习中心相关的数据库操作，包括：
- 学习分类管理
- 学习内容管理
- 知识节点和边的管理
- 学习路径管理
"""

import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class LCCategoryRepository(BaseRepository):
    """学习中心分类 Repository"""

    TABLE = "lc_categories"

    # ============================================================
    # 查询
    # ============================================================

    def find_active(self, parent_id: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        查询活跃分类（未删除）

        Args:
            parent_id: 父分类ID（可选，用于按父分类筛选）

        Returns:
            分类列表
        """
        if parent_id is not None:
            return self.find_all(
                "is_deleted = 0 AND parent_id = %s",
                (parent_id,),
                order_by="sort_order ASC",
            )
        return self.find_all(
            "is_deleted = 0",
            order_by="sort_order ASC",
        )

    def find_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """根据 slug 查询分类"""
        return self.find_one("slug = %s AND is_deleted = 0", (slug,))

    def find_tree(self) -> List[Dict[str, Any]]:
        """
        获取所有分类用于树形构建

        返回扁平列表，前端根据 parent_id 构建树形结构
        """
        return self.find_all(
            "is_deleted = 0",
            order_by="parent_id ASC, sort_order ASC",
        )

    def count_active(self) -> int:
        """统计未删除分类数量"""
        return self.count("is_deleted = 0")


class LCContentRepository(BaseRepository):
    """学习中心内容 Repository"""

    TABLE = "lc_contents"

    # ============================================================
    # 查询
    # ============================================================

    def count_published(self) -> int:
        """统计已发布内容总数"""
        return self.count("status = 'published' AND is_deleted = 0")

    def find_published(
        self,
        content_type: str = "",
        category_id: Optional[int] = None,
        tags: Optional[List[str]] = None,
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        查询已发布内容（分页）

        Args:
            content_type: 内容类型（article, video, code 等，空=全部）
            category_id: 分类ID（可选）
            tags: 标签列表（可选）
            search: 搜索关键词
            page: 页码
            page_size: 每页条数

        Returns:
            {items: [...], total: int, page: int, page_size: int}
        """
        conditions = ["status = 'published'", "is_deleted = 0"]
        params = []

        if content_type:
            conditions.append("content_type = %s")
            params.append(content_type)

        if category_id is not None:
            conditions.append(
                "id IN (SELECT content_id FROM lc_content_categories WHERE category_id = %s)"
            )
            params.append(category_id)

        if search:
            conditions.append("(title LIKE %s OR description LIKE %s)")
            search_keyword = f"%{search}%"
            params.extend([search_keyword, search_keyword])

        where = " AND ".join(conditions)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params) if params else None,
            order_by="sort_order ASC, created_at DESC",
        )

    def search_contents(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        全文搜索内容

        Args:
            keyword: 搜索关键词
            page: 页码
            page_size: 每页条数

        Returns:
            {items: [...], total: int, page: int, page_size: int}
        """
        search_keyword = f"%{keyword}%"
        where = "status = 'published' AND is_deleted = 0 AND (title LIKE %s OR description LIKE %s)"
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=(search_keyword, search_keyword),
            order_by="created_at DESC",
        )

    def increment_view(self, content_id: int) -> int:
        """增加内容浏览次数"""
        return self.raw_execute(
            "UPDATE lc_contents SET view_count = view_count + 1 WHERE id = %s",
            (content_id,),
        )

    def find_by_node(self, node_id: int) -> List[Dict[str, Any]]:
        """
        查询与知识节点关联的内容

        通过 lc_node_contents 表进行 JOIN
        """
        return self.raw_query(
            """
            SELECT c.*
            FROM lc_contents c
            INNER JOIN lc_node_contents nc ON c.id = nc.content_id
            WHERE nc.node_id = %s AND c.is_deleted = 0
            ORDER BY c.created_at DESC
            """,
            (node_id,),
        )

    def get_stats(self) -> Dict[str, int]:
        """
        获取内容统计信息

        按内容类型统计
        """
        rows = self.raw_query(
            """
            SELECT content_type, COUNT(*) as count
            FROM lc_contents
            WHERE status = 'published' AND is_deleted = 0
            GROUP BY content_type
            """
        )
        stats = {}
        for row in rows:
            stats[row["content_type"]] = row["count"]
        return stats


class LCContentCategoryRepository(BaseRepository):
    """内容-分类关联 Repository"""

    TABLE = "lc_content_categories"

    # ============================================================
    # 关联操作
    # ============================================================

    def link(self, content_id: int, category_ids: List[int]) -> int:
        """
        关联内容到分类

        Args:
            content_id: 内容ID
            category_ids: 分类ID列表

        Returns:
            影响行数
        """
        # 删除旧关联
        self.delete("content_id = %s", (content_id,))

        # 插入新关联
        if not category_ids:
            return 0

        sql = "INSERT INTO lc_content_categories (content_id, category_id) VALUES (%s, %s)"
        params_list = [(content_id, cat_id) for cat_id in category_ids]

        total = 0
        for params in params_list:
            total += self.raw_execute(sql, params)
        return total

    def find_by_content(self, content_id: int) -> List[Dict[str, Any]]:
        """查询内容的所有分类"""
        return self.find_all("content_id = %s", (content_id,))

    def find_by_category(self, category_id: int) -> List[Dict[str, Any]]:
        """查询分类中的所有内容ID"""
        return self.find_all("category_id = %s", (category_id,))

    def count_by_category(self) -> List[Dict[str, Any]]:
        """按分类统计内容数量"""
        return self.raw_query(
            """
            SELECT category_id, COUNT(*) as cnt
            FROM lc_content_categories
            GROUP BY category_id
            """
        )


class LCKnowledgeNodeRepository(BaseRepository):
    """知识节点 Repository"""

    TABLE = "lc_knowledge_nodes"

    # ============================================================
    # 查询
    # ============================================================

    def find_active(self) -> List[Dict[str, Any]]:
        """查询所有活跃节点（未删除）"""
        return self.find_all(
            "is_deleted = 0",
            order_by="created_at DESC",
        )

    def count_active(self) -> int:
        """统计未删除节点数量"""
        return self.count("is_deleted = 0")

    def find_with_edges(self) -> Dict[str, Any]:
        """
        获取所有节点及其关联的边

        用于知识图谱展示
        """
        # 获取所有节点
        nodes = self.raw_query(
            "SELECT id, title, description FROM lc_knowledge_nodes WHERE is_deleted = 0"
        )

        # 获取所有边
        edges = self.raw_query(
            """
            SELECT source_node_id, target_node_id, relationship_type, weight
            FROM lc_knowledge_edges
            WHERE is_deleted = 0
            ORDER BY weight DESC
            """
        )

        return {
            "nodes": nodes,
            "edges": edges,
        }


class LCKnowledgeEdgeRepository(BaseRepository):
    """知识边 Repository"""

    TABLE = "lc_knowledge_edges"

    # ============================================================
    # 查询
    # ============================================================

    def find_by_node(self, node_id: int) -> List[Dict[str, Any]]:
        """
        查询与节点相连的所有边

        包括作为源和作为目标的边
        """
        return self.raw_query(
            """
            SELECT *
            FROM lc_knowledge_edges
            WHERE source_node_id = %s OR target_node_id = %s
            ORDER BY weight DESC
            """,
            (node_id, node_id),
        )

    def find_all_edges(self) -> List[Dict[str, Any]]:
        """获取所有边"""
        return self.find_all(
            "1 = 1",
            order_by="weight DESC",
        )


class LCNodeContentRepository(BaseRepository):
    """节点-内容关联 Repository"""

    TABLE = "lc_node_contents"

    # ============================================================
    # 关联操作
    # ============================================================

    def link(self, node_id: int, content_ids: List[int]) -> int:
        """
        关联节点到内容

        Args:
            node_id: 节点ID
            content_ids: 内容ID列表

        Returns:
            影响行数
        """
        # 删除旧关联
        self.delete("node_id = %s", (node_id,))

        # 插入新关联
        if not content_ids:
            return 0

        sql = "INSERT INTO lc_node_contents (node_id, content_id, sort_order) VALUES (%s, %s, %s)"
        params_list = [(node_id, content_id, idx) for idx, content_id in enumerate(content_ids)]

        total = 0
        for params in params_list:
            total += self.raw_execute(sql, params)
        return total

    def find_by_node(self, node_id: int) -> List[Dict[str, Any]]:
        """查询节点的所有内容ID"""
        return self.find_all("node_id = %s", (node_id,))


class LCLearningPathRepository(BaseRepository):
    """学习路径 Repository"""

    TABLE = "lc_learning_paths"

    # ============================================================
    # 查询
    # ============================================================

    def find_published(self) -> List[Dict[str, Any]]:
        """查询所有已发布的学习路径"""
        return self.find_all(
            "status = 'published' AND is_deleted = 0",
            order_by="created_at DESC",
        )

    def count_published(self) -> int:
        """统计已发布路径数量"""
        return self.count("status = 'published' AND is_deleted = 0")

    def find_active(
        self,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        管理员查询所有活跃学习路径（分页）

        Args:
            page: 页码
            page_size: 每页条数

        Returns:
            {items: [...], total: int, page: int, page_size: int}
        """
        return self.paginate(
            page=page,
            page_size=page_size,
            where="is_deleted = 0",
            order_by="created_at DESC",
        )


class LCPathStepRepository(BaseRepository):
    """学习路径步骤 Repository"""

    TABLE = "lc_path_steps"

    # ============================================================
    # 查询
    # ============================================================

    def find_by_path(self, path_id: int) -> List[Dict[str, Any]]:
        """查询路径的所有步骤（按顺序）"""
        return self.find_all(
            "path_id = %s",
            (path_id,),
            order_by="step_order ASC",
        )

    # ============================================================
    # 写入
    # ============================================================

    def replace_steps(self, path_id: int, steps: List[Dict[str, Any]]) -> int:
        """
        替换路径的所有步骤

        Args:
            path_id: 路径ID
            steps: 步骤列表，每个步骤应包含 step_order, content_id 等字段

        Returns:
            影响行数
        """
        # 删除旧步骤
        self.delete("path_id = %s", (path_id,))

        # 插入新步骤
        if not steps:
            return 0

        total = 0
        for step in steps:
            step_data = {
                "path_id": path_id,
                "step_order": step.get("step_order", 0),
                "title": step.get("title", ""),
                "description": step.get("description", ""),
                "content_id": step.get("content_id"),
                "node_id": step.get("node_id"),
            }
            total += self.insert(step_data)
        return total
