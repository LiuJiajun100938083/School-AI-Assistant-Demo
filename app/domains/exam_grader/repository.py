"""
试卷批阅系统 — Repository 层
==============================
纯数据库 CRUD，不含业务逻辑。每张表一个 Repository。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class ExamPaperRepository(BaseRepository):
    """考试配置表"""

    TABLE = "exam_papers"

    def find_by_teacher(
        self,
        teacher_id: int,
        status: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        conditions = ["is_deleted = 0", "created_by = %s"]
        params: List[Any] = [teacher_id]
        if status:
            conditions.append("status = %s")
            params.append(status)
        where = " AND ".join(conditions)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
        )

    def update_status(self, exam_id: int, status: str, **kwargs) -> int:
        fields = {"status": status}
        fields.update(kwargs)
        return self.update(fields, "id = %s", (exam_id,))


class ExamQuestionRepository(BaseRepository):
    """题目表"""

    TABLE = "exam_questions"

    def find_by_exam(self, exam_id: int) -> List[Dict[str, Any]]:
        rows = self.find_all(
            where="exam_id = %s",
            params=(exam_id,),
            order_by="question_order ASC, id ASC",
        )
        for row in rows:
            if isinstance(row.get("mc_options"), str):
                try:
                    row["mc_options"] = json.loads(row["mc_options"])
                except (json.JSONDecodeError, TypeError):
                    row["mc_options"] = None
        return rows

    def batch_insert(self, exam_id: int, questions: List[Dict[str, Any]]) -> int:
        count = 0
        for i, q in enumerate(questions):
            mc_opts = q.get("mc_options")
            if isinstance(mc_opts, dict):
                mc_opts = json.dumps(mc_opts, ensure_ascii=False)
            self.insert({
                "exam_id": exam_id,
                "section": q.get("section", "A"),
                "question_number": q.get("question_number", str(i + 1)),
                "question_type": q.get("question_type", "mc"),
                "question_text": q.get("question_text", ""),
                "max_marks": q.get("max_marks", 2),
                "reference_answer": q.get("reference_answer"),
                "answer_source": q.get("answer_source"),
                "mc_options": mc_opts,
                "question_order": i,
            })
            count += 1
        return count

    def batch_update_answers(self, updates: List[Dict[str, Any]]) -> int:
        count = 0
        for u in updates:
            fields: Dict[str, Any] = {}
            if "reference_answer" in u:
                fields["reference_answer"] = u["reference_answer"]
            if "answer_source" in u:
                fields["answer_source"] = u["answer_source"]
            if "question_text" in u:
                fields["question_text"] = u["question_text"]
            if "max_marks" in u:
                fields["max_marks"] = u["max_marks"]
            if "mc_options" in u:
                opts = u["mc_options"]
                fields["mc_options"] = json.dumps(opts, ensure_ascii=False) if isinstance(opts, dict) else opts
            if fields:
                self.update(fields, "id = %s", (u["id"],))
                count += 1
        return count

    def delete_by_exam(self, exam_id: int) -> int:
        return self.raw_execute(
            f"DELETE FROM {self.TABLE} WHERE exam_id = %s", (exam_id,)
        )


class ExamStudentPaperRepository(BaseRepository):
    """学生试卷表"""

    TABLE = "exam_student_papers"

    def find_by_exam(
        self,
        exam_id: int,
        status: str = "",
    ) -> List[Dict[str, Any]]:
        conditions = ["exam_id = %s"]
        params: List[Any] = [exam_id]
        if status:
            conditions.append("status = %s")
            params.append(status)
        where = " AND ".join(conditions)
        rows = self.find_all(where=where, params=tuple(params), order_by="student_index ASC")
        for row in rows:
            if isinstance(row.get("image_paths"), str):
                try:
                    row["image_paths"] = json.loads(row["image_paths"])
                except (json.JSONDecodeError, TypeError):
                    row["image_paths"] = []
        return rows

    def find_pending(self, exam_id: int) -> List[Dict[str, Any]]:
        return self.find_by_exam(exam_id, status="pending")

    def batch_insert(self, exam_id: int, papers: List[Dict[str, Any]]) -> int:
        count = 0
        for p in papers:
            img_paths = p.get("image_paths", [])
            if isinstance(img_paths, list):
                img_paths = json.dumps(img_paths)
            self.insert({
                "exam_id": exam_id,
                "student_index": p["student_index"],
                "page_start": p["page_start"],
                "page_end": p["page_end"],
                "image_paths": img_paths,
                "status": "pending",
            })
            count += 1
        return count

    def update_student_info(
        self,
        paper_id: int,
        student_name: Optional[str] = None,
        student_number: Optional[str] = None,
        class_name: Optional[str] = None,
        user_id: Optional[int] = None,
    ) -> int:
        fields: Dict[str, Any] = {}
        if student_name is not None:
            fields["student_name"] = student_name
        if student_number is not None:
            fields["student_number"] = student_number
        if class_name is not None:
            fields["class_name"] = class_name
        if user_id is not None:
            fields["user_id"] = user_id
        if not fields:
            return 0
        return self.update(fields, "id = %s", (paper_id,))

    def update_status(self, paper_id: int, status: str, **kwargs) -> int:
        fields = {"status": status}
        fields.update(kwargs)
        return self.update(fields, "id = %s", (paper_id,))

    def update_score(self, paper_id: int, total_score: float) -> int:
        return self.update(
            {"total_score": total_score, "status": "graded"},
            "id = %s",
            (paper_id,),
        )

    def delete_by_exam(self, exam_id: int) -> int:
        return self.raw_execute(
            f"DELETE FROM {self.TABLE} WHERE exam_id = %s", (exam_id,)
        )


class ExamStudentAnswerRepository(BaseRepository):
    """学生答题结果表"""

    TABLE = "exam_student_answers"

    def find_by_paper(self, student_paper_id: int) -> List[Dict[str, Any]]:
        return self.find_all(
            where="student_paper_id = %s",
            params=(student_paper_id,),
            order_by="id ASC",
        )

    def batch_upsert(self, student_paper_id: int, answers: List[Dict[str, Any]]) -> int:
        count = 0
        for ans in answers:
            existing = self.find_one(
                where="student_paper_id = %s AND question_id = %s",
                params=(student_paper_id, ans["question_id"]),
            )
            fields = {
                "student_paper_id": student_paper_id,
                "question_id": ans["question_id"],
                "student_answer": ans.get("student_answer"),
                "score": ans.get("score"),
                "max_marks": ans.get("max_marks", 0),
                "feedback": ans.get("feedback"),
                "graded_by": ans.get("graded_by", "ai"),
            }
            if existing:
                self.update(fields, "id = %s", (existing["id"],))
            else:
                self.insert(fields)
            count += 1
        return count

    def update_score(
        self,
        answer_id: int,
        score: float,
        feedback: Optional[str] = None,
        graded_by: str = "teacher",
    ) -> int:
        fields: Dict[str, Any] = {"score": score, "graded_by": graded_by}
        if feedback is not None:
            fields["feedback"] = feedback
        return self.update(fields, "id = %s", (answer_id,))

    def find_by_exam_with_questions(self, exam_id: int) -> List[Dict[str, Any]]:
        """联查：所有学生答案 + 题目信息（用于统计）"""
        sql = """
            SELECT sa.*, eq.section, eq.question_number, eq.question_type,
                   eq.question_text, eq.reference_answer, eq.max_marks AS q_max_marks,
                   sp.student_index, sp.student_name
            FROM exam_student_answers sa
            JOIN exam_questions eq ON sa.question_id = eq.id
            JOIN exam_student_papers sp ON sa.student_paper_id = sp.id
            WHERE eq.exam_id = %s
            ORDER BY sp.student_index, eq.question_order
        """
        return self.raw_query(sql, (exam_id,))

    def delete_by_paper(self, student_paper_id: int) -> int:
        return self.raw_execute(
            f"DELETE FROM {self.TABLE} WHERE student_paper_id = %s",
            (student_paper_id,),
        )
