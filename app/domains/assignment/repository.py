#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理 Repository
====================
數據訪問層，包含 6 個 Repository:
1. AssignmentRepository - 作業主表
2. SubmissionRepository - 提交記錄
3. SubmissionFileRepository - 提交文件
4. RubricItemRepository - 評分標準項目
5. RubricScoreRepository - 逐項得分
6. AssignmentAttachmentRepository - 作業附件
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class AssignmentRepository(BaseRepository):
    """作業主表 Repository"""

    TABLE = "assignments"

    def find_active(
        self,
        status: str = "",
        created_by: int = 0,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """查詢未刪除的作業列表 (分頁)"""
        conditions = ["is_deleted = 0"]
        params = []

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
        username: str,
        class_name: str = "",
    ) -> List[Dict[str, Any]]:
        """
        查詢分配給某學生的已發布作業

        根據 target_type 匹配:
        - all: 所有人
        - class: 班級匹配 (target_value = class_name)
        - student: 用戶名匹配 (target_value 包含 username)
        """
        conditions = [
            "status = 'published'",
            "is_deleted = 0",
        ]
        params = []

        target_conditions = ["target_type = 'all'"]

        # 班級匹配
        if class_name:
            target_conditions.append(
                "(target_type = 'class' AND target_value = %s)"
            )
            params.append(class_name)

        # 個人匹配 (target_value 是逗號分隔的 username)
        target_conditions.append(
            "(target_type = 'student' AND FIND_IN_SET(%s, target_value) > 0)"
        )
        params.append(username)

        conditions.append(f"({' OR '.join(target_conditions)})")
        where = " AND ".join(conditions)

        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
        )


class SubmissionRepository(BaseRepository):
    """提交記錄 Repository"""

    TABLE = "assignment_submissions"

    def find_by_assignment_student(
        self,
        assignment_id: int,
        student_id: int,
    ) -> Optional[Dict[str, Any]]:
        """查詢某學生對某作業的提交"""
        return self.find_one(
            where="assignment_id = %s AND student_id = %s",
            params=(assignment_id, student_id),
        )

    def find_by_assignment(
        self,
        assignment_id: int,
        status: str = "",
    ) -> List[Dict[str, Any]]:
        """查詢某作業的所有提交"""
        conditions = ["assignment_id = %s"]
        params = [assignment_id]

        if status:
            conditions.append("status = %s")
            params.append(status)

        return self.find_all(
            where=" AND ".join(conditions),
            params=tuple(params),
            order_by="submitted_at DESC",
        )

    def get_submission_stats(self, assignment_id: int) -> Dict[str, Any]:
        """獲取作業提交統計"""
        sql = """
            SELECT
                COUNT(*) AS total_submissions,
                SUM(CASE WHEN status = 'graded' THEN 1 ELSE 0 END) AS graded_count,
                AVG(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) AS avg_score,
                MAX(score) AS max_score,
                MIN(CASE WHEN score IS NOT NULL THEN score ELSE NULL END) AS min_score
            FROM assignment_submissions
            WHERE assignment_id = %s
        """
        return self.raw_query_one(sql, (assignment_id,))


class SubmissionFileRepository(BaseRepository):
    """提交文件 Repository"""

    TABLE = "submission_files"

    def find_by_submission(self, submission_id: int) -> List[Dict[str, Any]]:
        """獲取某提交的所有文件"""
        return self.find_all(
            where="submission_id = %s",
            params=(submission_id,),
            order_by="id ASC",
        )

    def delete_by_submission(self, submission_id: int) -> int:
        """刪除某提交的所有文件記錄"""
        return self.delete(
            where="submission_id = %s",
            params=(submission_id,),
        )


class RubricItemRepository(BaseRepository):
    """評分標準項目 Repository"""

    TABLE = "assignment_rubric_items"

    def find_by_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        """獲取某作業的所有評分標準 (按順序)"""
        return self.find_all(
            where="assignment_id = %s",
            params=(assignment_id,),
            order_by="item_order ASC, id ASC",
        )

    def batch_insert(self, assignment_id: int, items: List[Dict[str, Any]]) -> int:
        """批量插入評分標準項目"""
        if not items:
            return 0

        inserted = 0
        for i, item in enumerate(items):
            data = {
                "assignment_id": assignment_id,
                "item_order": i,
                "title": item.get("title", ""),
                "max_points": item.get("max_points") or 0,
            }
            # 等級定義 (JSON)
            ld = item.get("level_definitions")
            if ld is not None:
                data["level_definitions"] = json.dumps(ld, ensure_ascii=False) if isinstance(ld, (list, dict)) else ld
            # 權重
            w = item.get("weight")
            if w is not None:
                data["weight"] = w
            self.insert(data)
            inserted += 1
        return inserted

    def delete_by_assignment(self, assignment_id: int) -> int:
        """刪除某作業的所有評分標準 (用於重新編輯)"""
        return self.delete(
            where="assignment_id = %s",
            params=(assignment_id,),
        )


class RubricScoreRepository(BaseRepository):
    """逐項得分 Repository"""

    TABLE = "submission_rubric_scores"

    def find_by_submission(self, submission_id: int) -> List[Dict[str, Any]]:
        """獲取某提交的所有逐項得分"""
        return self.find_all(
            where="submission_id = %s",
            params=(submission_id,),
            order_by="rubric_item_id ASC",
        )

    def batch_upsert(self, submission_id: int, scores: List[Dict[str, Any]]) -> int:
        """批量插入或更新逐項得分"""
        if not scores:
            return 0

        count = 0
        for score in scores:
            data = {
                "submission_id": submission_id,
                "rubric_item_id": score["rubric_item_id"],
                "points": score.get("points"),
                "selected_level": score.get("selected_level"),
            }
            self.upsert(
                data=data,
                update_fields=["points", "selected_level"],
            )
            count += 1
        return count

    def delete_by_submission(self, submission_id: int) -> int:
        """刪除某提交的所有得分"""
        return self.delete(
            where="submission_id = %s",
            params=(submission_id,),
        )


class AssignmentAttachmentRepository(BaseRepository):
    """作業附件 Repository"""

    TABLE = "assignment_attachments"

    def find_by_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        """查詢某作業的所有附件（排除已刪除）"""
        return self.find_all(
            where="assignment_id = %s AND is_deleted = 0",
            params=(assignment_id,),
            order_by="uploaded_at ASC",
        )

    def soft_delete_attachment(self, attachment_id: int) -> int:
        """軟刪除附件"""
        return self.soft_delete(attachment_id)


class ExamUploadBatchRepository(BaseRepository):
    """試卷上傳批次 Repository"""

    TABLE = "exam_upload_batches"

    def find_by_batch_id(self, batch_id: str) -> Optional[Dict[str, Any]]:
        return self.find_one(where="batch_id = %s", params=(batch_id,))

    def create_batch(
        self,
        batch_id: str,
        subject: str,
        created_by: int,
        total_files: int,
    ) -> int:
        return self.insert({
            "batch_id": batch_id,
            "subject": subject,
            "status": "uploading",
            "total_files": total_files,
            "created_by": created_by,
        })

    def update_status(self, batch_id: str, status: str, **kwargs) -> int:
        data = {"status": status}
        data.update(kwargs)
        return self.update(data, where="batch_id = %s", params=(batch_id,))


class ExamUploadFileRepository(BaseRepository):
    """試卷上傳文件 Repository"""

    TABLE = "exam_upload_files"

    def find_by_batch(self, batch_id: str) -> List[Dict[str, Any]]:
        return self.find_all(
            where="batch_id = %s",
            params=(batch_id,),
            order_by="id ASC",
        )

    def create_file(self, data: Dict[str, Any]) -> int:
        return self.insert(data)

    def update_ocr_status(
        self,
        file_id: int,
        status: str,
        result: Optional[str] = None,
        error: Optional[str] = None,
    ) -> int:
        data: Dict[str, Any] = {"ocr_status": status}
        if status in ("completed", "failed"):
            data["processed_at"] = datetime.now()
        if result is not None:
            data["ocr_result"] = result
        if error is not None:
            data["error_message"] = error
        return self.update(data, where="id = %s", params=(file_id,))


class AssignmentQuestionRepository(BaseRepository):
    """正式作業題目 Repository"""

    TABLE = "assignment_questions"

    def find_by_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        return self.find_all(
            where="assignment_id = %s",
            params=(assignment_id,),
            order_by="question_order ASC, id ASC",
        )

    def batch_insert(self, assignment_id: int, questions: List[Dict[str, Any]]) -> int:
        if not questions:
            return 0
        inserted = 0
        for i, q in enumerate(questions):
            data = {
                "assignment_id": assignment_id,
                "question_order": i,
                "question_number": q.get("question_number", ""),
                "question_text": q.get("question_text", ""),
                "answer_text": q.get("answer_text", ""),
                "answer_source": q.get("answer_source", "missing"),
                "points": q.get("points"),
                "question_type": q.get("question_type", "open"),
                "question_type_confidence": q.get("question_type_confidence"),
                "is_ai_extracted": q.get("is_ai_extracted", True),
                "source_batch_id": q.get("source_batch_id"),
                "source_page": q.get("source_page"),
                "ocr_confidence": q.get("ocr_confidence"),
            }
            md = q.get("metadata")
            if md is not None:
                data["metadata"] = json.dumps(md, ensure_ascii=False) if isinstance(md, (dict, list)) else md
            self.insert(data)
            inserted += 1
        return inserted

    def delete_by_assignment(self, assignment_id: int) -> int:
        return self.delete(
            where="assignment_id = %s",
            params=(assignment_id,),
        )
