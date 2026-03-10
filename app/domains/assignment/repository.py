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


class QuestionRepository(BaseRepository):
    """Form 作業題目 Repository"""

    TABLE = "assignment_questions"

    def find_by_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        """獲取某作業的所有題目（按順序）"""
        return self.find_all(
            where="assignment_id = %s",
            params=(assignment_id,),
            order_by="question_order ASC, id ASC",
        )

    def batch_insert(self, assignment_id: int, questions: List[Dict[str, Any]]) -> List[int]:
        """批量插入題目，返回新 ID 列表"""
        ids = []
        for i, q in enumerate(questions):
            data = {
                "assignment_id": assignment_id,
                "question_order": i,
                "question_type": q["question_type"],
                "question_text": q["question_text"],
                "max_points": q["max_points"],
                "grading_notes": q.get("grading_notes") or None,
                "correct_answer": q.get("correct_answer") or None,
                "reference_answer": q.get("reference_answer") or None,
            }
            qid = self.insert_get_id(data)
            ids.append(qid)
        return ids

    def delete_by_assignment(self, assignment_id: int) -> int:
        """刪除某作業的所有題目（CASCADE 會清理選項和答案）"""
        return self.delete(
            where="assignment_id = %s",
            params=(assignment_id,),
        )


class QuestionOptionRepository(BaseRepository):
    """MC 選項 Repository"""

    TABLE = "assignment_question_options"

    def find_by_questions(self, question_ids: List[int]) -> List[Dict[str, Any]]:
        """批量獲取多個題目的選項"""
        if not question_ids:
            return []
        placeholders = ",".join(["%s"] * len(question_ids))
        return self.find_all(
            where=f"question_id IN ({placeholders})",
            params=tuple(question_ids),
            order_by="question_id ASC, option_key ASC",
        )

    def batch_insert(self, question_id: int, options: List[Dict[str, Any]]) -> int:
        """批量插入選項"""
        count = 0
        for opt in options:
            self.insert({
                "question_id": question_id,
                "option_key": opt["option_key"],
                "option_text": opt["option_text"],
            })
            count += 1
        return count

    def delete_by_questions(self, question_ids: List[int]) -> int:
        """刪除多個題目的所有選項"""
        if not question_ids:
            return 0
        placeholders = ",".join(["%s"] * len(question_ids))
        return self.delete(
            where=f"question_id IN ({placeholders})",
            params=tuple(question_ids),
        )


class SubmissionAnswerRepository(BaseRepository):
    """學生作答 Repository"""

    TABLE = "submission_answers"

    def find_by_submission(self, submission_id: int) -> List[Dict[str, Any]]:
        """獲取某提交的所有作答"""
        return self.find_all(
            where="submission_id = %s",
            params=(submission_id,),
            order_by="question_id ASC",
        )

    def batch_insert(self, submission_id: int, answers: List[Dict[str, Any]]) -> List[int]:
        """批量插入作答記錄，返回新 ID 列表"""
        ids = []
        for ans in answers:
            data = {
                "submission_id": submission_id,
                "question_id": ans["question_id"],
                "answer_text": ans.get("answer_text") or "",
                "is_correct": ans.get("is_correct"),
                "points": ans.get("points"),
                "score_source": ans.get("score_source"),
            }
            aid = self.insert_get_id(data)
            ids.append(aid)
        return ids

    def update_score(self, answer_id: int, data: Dict[str, Any]) -> int:
        """更新單題評分"""
        return self.update(
            data=data,
            where="id = %s",
            params=(answer_id,),
        )

    def find_ungraded_text(self, submission_id: int) -> List[Dict[str, Any]]:
        """找出未評分或 AI 未覆核的文字題答案"""
        return self.find_all(
            where=(
                "submission_id = %s "
                "AND question_id IN ("
                "  SELECT id FROM assignment_questions WHERE question_type != 'mc'"
                ") "
                "AND (score_source IS NULL OR (score_source = 'ai' AND reviewed_at IS NULL))"
            ),
            params=(submission_id,),
        )


class SubmissionAnswerFileRepository(BaseRepository):
    """作答附件 Repository"""

    TABLE = "submission_answer_files"

    def find_by_answer(self, answer_id: int) -> List[Dict[str, Any]]:
        """獲取某作答的所有文件"""
        return self.find_all(
            where="answer_id = %s",
            params=(answer_id,),
            order_by="id ASC",
        )

    def find_by_answers(self, answer_ids: List[int]) -> List[Dict[str, Any]]:
        """批量獲取多個作答的文件"""
        if not answer_ids:
            return []
        placeholders = ",".join(["%s"] * len(answer_ids))
        return self.find_all(
            where=f"answer_id IN ({placeholders})",
            params=tuple(answer_ids),
            order_by="answer_id ASC, id ASC",
        )

    def batch_insert(self, answer_id: int, files_data: List[Dict[str, Any]]) -> int:
        """批量插入作答文件"""
        count = 0
        for f in files_data:
            self.insert({
                "answer_id": answer_id,
                "original_name": f["original_name"],
                "stored_name": f["stored_name"],
                "file_path": f["file_path"],
                "file_size": f.get("file_size", 0),
                "file_type": f.get("file_type", ""),
                "mime_type": f.get("mime_type", ""),
            })
            count += 1
        return count
