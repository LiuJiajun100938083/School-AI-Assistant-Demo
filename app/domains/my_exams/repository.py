"""
我的考試成績 — Repository 層
==============================
只讀查詢：學生查看自己已發放的考試結果。
複用 exam_grader 的資料表，不做寫入。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class MyExamsRepository(BaseRepository):
    """學生考試成績查詢（只讀）"""

    TABLE = "exam_student_papers"

    # ── 列表：查詢學生所有已發放的考試 ──

    def find_published_by_user(self, user_id: int) -> List[Dict[str, Any]]:
        """查詢某學生所有已發放且已批改的考試"""
        sql = """
            SELECT sp.id AS paper_id, sp.exam_id, sp.total_score,
                   sp.student_name, sp.student_number, sp.class_name,
                   ep.title AS exam_title, ep.subject, ep.total_marks,
                   ep.published_at
            FROM exam_student_papers sp
            JOIN exam_papers ep ON sp.exam_id = ep.id
            WHERE sp.user_id = %s
              AND ep.is_published = 1
              AND ep.is_deleted = 0
              AND sp.status = 'graded'
            ORDER BY ep.published_at DESC
        """
        return self.raw_query(sql, (user_id,))

    # ── 詳情：查詢某場考試的學生試卷 ──

    def find_one_for_user(self, user_id: int, exam_id: int) -> Optional[Dict[str, Any]]:
        """查詢某學生在某場已發放考試中的試卷"""
        sql = """
            SELECT sp.*,
                   ep.title AS exam_title, ep.subject, ep.total_marks,
                   ep.class_name AS exam_class
            FROM exam_student_papers sp
            JOIN exam_papers ep ON sp.exam_id = ep.id
            WHERE sp.user_id = %s
              AND sp.exam_id = %s
              AND ep.is_published = 1
              AND ep.is_deleted = 0
            LIMIT 1
        """
        rows = self.raw_query(sql, (user_id, exam_id))
        if not rows:
            return None
        paper = rows[0]
        # 解析 image_paths JSON
        if isinstance(paper.get("image_paths"), str):
            try:
                paper["image_paths"] = json.loads(paper["image_paths"])
            except (json.JSONDecodeError, TypeError):
                paper["image_paths"] = []
        return paper

    # ── 答題詳情（不返回參考答案）──

    def find_answers_for_paper(self, paper_id: int) -> List[Dict[str, Any]]:
        """查詢某試卷的所有答題記錄，聯查題目資訊（不含參考答案）"""
        sql = """
            SELECT sa.id, sa.student_answer, sa.score, sa.max_marks,
                   sa.feedback, sa.graded_by,
                   eq.section, eq.question_number, eq.question_type,
                   eq.question_text, eq.question_order
            FROM exam_student_answers sa
            JOIN exam_questions eq ON sa.question_id = eq.id
            WHERE sa.student_paper_id = %s
            ORDER BY eq.question_order ASC, eq.id ASC
        """
        return self.raw_query(sql, (paper_id,))
