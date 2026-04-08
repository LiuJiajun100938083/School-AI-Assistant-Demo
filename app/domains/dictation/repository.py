#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英文默書模組 Repository
========================
只做資料庫 CRUD，不含業務邏輯。

三張表:
    dictations                  — 老師建立的默書
    dictation_submissions       — 學生提交
    dictation_submission_files  — 提交的圖片
"""

import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class DictationRepository(BaseRepository):
    """默書主表 Repository"""

    TABLE = "dictations"

    def find_active(
        self,
        status: str = "",
        created_by: int = 0,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """老師端：查詢未刪除的默書列表（分頁）"""
        conditions = ["is_deleted = 0"]
        params: List[Any] = []

        if status:
            conditions.append("status = %s")
            params.append(status)
        if created_by:
            conditions.append("created_by = %s")
            params.append(created_by)

        where = " AND ".join(conditions)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
        )

    def find_published_for_student(
        self,
        student_id: int,
        student_class: str = "",
        student_username: str = "",
    ) -> List[Dict[str, Any]]:
        """學生端：查詢該學生可見的已發布默書。"""
        sql = (
            "SELECT * FROM dictations "
            "WHERE is_deleted = 0 AND status = 'published' "
            "  AND (target_type = 'all' "
            "       OR (target_type = 'class' AND target_value = %s) "
            "       OR (target_type = 'student' "
            "           AND FIND_IN_SET(%s, REPLACE(target_value, ' ', '')) > 0)) "
            "ORDER BY created_at DESC"
        )
        return self.raw_query(sql, (student_class, student_username))

    def soft_delete_by_id(self, dictation_id: int) -> int:
        return self.update(
            {"is_deleted": 1}, where="id = %s", params=(dictation_id,),
        )


class DictationSubmissionRepository(BaseRepository):
    """學生提交記錄 Repository"""

    TABLE = "dictation_submissions"

    def find_by_dictation_student(
        self, dictation_id: int, student_id: int,
    ) -> Optional[Dict[str, Any]]:
        return self.find_one(
            where="dictation_id = %s AND student_id = %s",
            params=(dictation_id, student_id),
        )

    def find_by_dictation(self, dictation_id: int) -> List[Dict[str, Any]]:
        return self.find_all(
            where="dictation_id = %s",
            params=(dictation_id,),
            order_by="submitted_at DESC",
        )

    def find_by_student(self, student_id: int) -> List[Dict[str, Any]]:
        return self.find_all(
            where="student_id = %s",
            params=(student_id,),
            order_by="submitted_at DESC",
        )


class DictationSubmissionFileRepository(BaseRepository):
    """提交檔案 Repository"""

    TABLE = "dictation_submission_files"

    def find_by_submission(self, submission_id: int) -> List[Dict[str, Any]]:
        return self.find_all(
            where="submission_id = %s",
            params=(submission_id,),
            order_by="page_order ASC, id ASC",
        )

    def delete_by_submission(self, submission_id: int) -> int:
        return self.delete(
            where="submission_id = %s", params=(submission_id,),
        )
