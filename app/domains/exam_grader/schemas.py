"""
试卷批阅系统 — 请求/响应模型
==============================
纯数据定义，不含逻辑。
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.domains.exam_grader.constants import (
    AnswerSource,
    DEFAULT_SUBJECT,
    GradingMode,
)


# ── 请求模型 ──


class CreateExamRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255, description="考试标题")
    subject: str = Field(DEFAULT_SUBJECT, description="科目")
    class_name: str = Field(..., min_length=1, max_length=100, description="班级")
    pages_per_exam: int = Field(1, ge=1, le=20, description="每份试卷页数")
    grading_mode: GradingMode = Field(GradingMode.MODERATE, description="批改松紧度")
    total_marks: float = Field(40, ge=1, description="满分")


class UpdateExamRequest(BaseModel):
    title: Optional[str] = None
    class_name: Optional[str] = None
    pages_per_exam: Optional[int] = None
    grading_mode: Optional[GradingMode] = None
    total_marks: Optional[float] = None


class QuestionEdit(BaseModel):
    id: int
    question_text: Optional[str] = None
    reference_answer: Optional[str] = None
    max_marks: Optional[float] = None
    mc_options: Optional[Dict[str, str]] = None


class UpdateQuestionsRequest(BaseModel):
    questions: List[QuestionEdit]


class AdjustScoreRequest(BaseModel):
    score: float = Field(..., ge=0, description="调整后分数")
    feedback: Optional[str] = Field(None, description="教师反馈")


# ── 响应模型 ──


class QuestionResponse(BaseModel):
    id: int
    section: str
    question_number: str
    question_type: str
    question_text: str
    max_marks: float
    reference_answer: Optional[str] = None
    answer_source: Optional[str] = None
    mc_options: Optional[Dict[str, str]] = None
    question_order: int = 0


class ExamResponse(BaseModel):
    id: int
    title: str
    subject: str
    class_name: str
    total_marks: float
    pages_per_exam: int
    grading_mode: str
    status: str
    total_students: int = 0
    graded_count: int = 0
    created_by: int = 0
    created_at: Optional[str] = None
    questions: Optional[List[QuestionResponse]] = None


class StudentAnswerResponse(BaseModel):
    id: int
    question_id: int
    question_number: str = ""
    section: str = ""
    question_type: str = ""
    question_text: str = ""
    student_answer: Optional[str] = None
    score: Optional[float] = None
    max_marks: float = 0
    feedback: Optional[str] = None
    graded_by: Optional[str] = None
    reference_answer: Optional[str] = None


class StudentPaperResponse(BaseModel):
    id: int
    student_index: int
    user_id: Optional[int] = None
    student_name: Optional[str] = None
    student_number: Optional[str] = None
    class_name: Optional[str] = None
    total_score: Optional[float] = None
    status: str = "pending"
    section_a_score: Optional[float] = None
    section_b_score: Optional[float] = None
    answers: Optional[List[StudentAnswerResponse]] = None


class GradingProgressResponse(BaseModel):
    status: str  # running / completed / cancelled / error
    total: int = 0
    done: int = 0
    success: int = 0
    fail: int = 0
    current_student: Optional[str] = None


class ExamStatisticsResponse(BaseModel):
    total_students: int = 0
    graded_count: int = 0
    average_score: Optional[float] = None
    highest_score: Optional[float] = None
    lowest_score: Optional[float] = None
    std_deviation: Optional[float] = None
    score_distribution: Optional[Dict[str, int]] = None
    per_question_stats: Optional[List[Dict[str, Any]]] = None
