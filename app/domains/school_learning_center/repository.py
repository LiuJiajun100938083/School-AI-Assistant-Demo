#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学校学习中心 Repository
========================
独立于 AI 学习中心，使用 slc_ 前缀的数据库表。
"""

import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class SLCContentRepository(BaseRepository):
    """学校学习中心内容 Repository"""

    TABLE = "slc_contents"

    def count_published(self, subject_code: Optional[str] = None) -> int:
        conditions = ["status = 'published'", "is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.count(" AND ".join(conditions), tuple(params) if params else None)

    def find_published(
        self,
        subject_code: Optional[str] = None,
        grade_level: Optional[str] = None,
        content_type: str = "",
        search: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        conditions = ["status = 'published'", "is_deleted = 0"]
        params: list = []

        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        if grade_level:
            conditions.append("grade_level = %s")
            params.append(grade_level)
        if content_type:
            conditions.append("content_type = %s")
            params.append(content_type)
        if search:
            conditions.append("(title LIKE %s OR description LIKE %s)")
            kw = f"%{search}%"
            params.extend([kw, kw])

        return self.paginate(
            page=page,
            page_size=page_size,
            where=" AND ".join(conditions),
            params=tuple(params) if params else None,
            order_by="sort_order ASC, created_at DESC",
        )

    def search_contents(
        self,
        keyword: str,
        subject_code: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        kw = f"%{keyword}%"
        conditions = [
            "status = 'published'",
            "is_deleted = 0",
            "(title LIKE %s OR description LIKE %s)",
        ]
        params: list = [kw, kw]
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=" AND ".join(conditions),
            params=tuple(params),
            order_by="created_at DESC",
        )

    def find_distinct_subjects(self) -> List[str]:
        rows = self.raw_query(
            """
            SELECT DISTINCT subject_code
            FROM slc_contents
            WHERE subject_code IS NOT NULL
              AND subject_code != ''
              AND is_deleted = 0
            ORDER BY subject_code ASC
            """
        )
        return [row["subject_code"] for row in rows]

    def count_published_by_subject(self, subject_code: str) -> int:
        return self.count(
            "status = 'published' AND is_deleted = 0 AND subject_code = %s",
            (subject_code,),
        )

    def increment_view(self, content_id: int) -> int:
        return self.raw_execute(
            "UPDATE slc_contents SET view_count = view_count + 1 WHERE id = %s",
            (content_id,),
        )

    def get_stats(self, subject_code: Optional[str] = None) -> Dict[str, int]:
        conditions = ["status = 'published'", "is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        where = " AND ".join(conditions)
        rows = self.raw_query(
            f"""
            SELECT content_type, COUNT(*) as count
            FROM slc_contents
            WHERE {where}
            GROUP BY content_type
            """,
            tuple(params) if params else None,
        )
        return {row["content_type"]: row["count"] for row in rows}

    def find_all_active(
        self,
        subject_code: Optional[str] = None,
        page: int = 1,
        page_size: int = 200,
    ) -> Dict[str, Any]:
        """管理员查看所有未删除内容（含 draft）"""
        conditions = ["is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=" AND ".join(conditions),
            params=tuple(params) if params else None,
            order_by="created_at DESC",
        )


class SLCKnowledgeNodeRepository(BaseRepository):
    """学校学习中心知识节点 Repository"""

    TABLE = "slc_knowledge_nodes"

    def find_active(self, subject_code: Optional[str] = None) -> List[Dict[str, Any]]:
        conditions = ["is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.find_all(
            " AND ".join(conditions),
            tuple(params) if params else None,
            order_by="created_at DESC",
        )

    def count_active(self, subject_code: Optional[str] = None) -> int:
        conditions = ["is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.count(
            " AND ".join(conditions),
            tuple(params) if params else None,
        )


class SLCKnowledgeEdgeRepository(BaseRepository):
    """学校学习中心知识边 Repository"""

    TABLE = "slc_knowledge_edges"

    def find_all_edges(self, subject_code: Optional[str] = None) -> List[Dict[str, Any]]:
        conditions = ["is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.find_all(
            " AND ".join(conditions),
            tuple(params) if params else None,
            order_by="weight DESC",
        )


class SLCNodeContentRepository(BaseRepository):
    """学校学习中心节点-内容关联 Repository"""

    TABLE = "slc_node_contents"

    def link_with_anchor(
        self,
        node_id: int,
        content_id: int,
        anchor: Optional[Dict[str, Any]] = None,
        sort_order: int = 0,
    ) -> int:
        import json as _json
        anchor_str = _json.dumps(anchor, ensure_ascii=False) if anchor else None
        sql = """
            INSERT IGNORE INTO slc_node_contents
                (node_id, content_id, sort_order, anchor)
            VALUES (%s, %s, %s, %s)
        """
        return self.raw_execute(sql, (node_id, content_id, sort_order, anchor_str))

    def find_by_node(self, node_id: int) -> List[Dict[str, Any]]:
        import json as _json
        rows = self.raw_query(
            """
            SELECT nc.node_id, nc.content_id, nc.sort_order, nc.anchor,
                   c.title AS content_title,
                   c.content_type,
                   c.file_path,
                   c.file_name,
                   c.external_url
            FROM slc_node_contents nc
            INNER JOIN slc_contents c ON nc.content_id = c.id
            WHERE nc.node_id = %s AND c.is_deleted = 0
            ORDER BY nc.sort_order ASC
            """,
            (node_id,),
        )
        for row in rows:
            if isinstance(row.get("anchor"), str):
                try:
                    row["anchor"] = _json.loads(row["anchor"])
                except (ValueError, TypeError):
                    row["anchor"] = None
        return rows


class SLCLearningPathRepository(BaseRepository):
    """学校学习中心学习路径 Repository"""

    TABLE = "slc_learning_paths"

    def find_published(
        self,
        subject_code: Optional[str] = None,
        grade_level: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        conditions = ["status = 'published'", "is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        if grade_level:
            conditions.append("grade_level = %s")
            params.append(grade_level)
        return self.find_all(
            " AND ".join(conditions),
            tuple(params) if params else None,
            order_by="created_at DESC",
        )

    def count_published(self, subject_code: Optional[str] = None) -> int:
        conditions = ["status = 'published'", "is_deleted = 0"]
        params: list = []
        if subject_code:
            conditions.append("subject_code = %s")
            params.append(subject_code)
        return self.count(
            " AND ".join(conditions),
            tuple(params) if params else None,
        )


class SLCPathStepRepository(BaseRepository):
    """学校学习中心路径步骤 Repository"""

    TABLE = "slc_path_steps"

    def find_by_path(self, path_id: int) -> List[Dict[str, Any]]:
        return self.find_all("path_id = %s", (path_id,), order_by="step_order ASC")

    def replace_steps(self, path_id: int, steps: List[Dict[str, Any]]) -> int:
        self.delete("path_id = %s", (path_id,))
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
