"""
试卷批阅系统 — 常量与配置
===========================
枚举、状态定义、文件限制、科目配置。
所有可调参数集中在此，不散落在业务代码中。
"""

from enum import Enum

# ── 状态枚举 ──


class ExamStatus(str, Enum):
    """考试生命周期状态"""
    DRAFT = "draft"
    EXTRACTING = "extracting"
    QUESTIONS_EXTRACTED = "questions_extracted"
    ANSWERS_READY = "answers_ready"
    GRADING = "grading"
    COMPLETED = "completed"


class StudentPaperStatus(str, Enum):
    """单份学生试卷批改状态"""
    PENDING = "pending"
    OCR_PROCESSING = "ocr_processing"
    GRADING = "grading"
    GRADED = "graded"
    ERROR = "error"


class GradingMode(str, Enum):
    """批改松紧度"""
    STRICT = "strict"
    MODERATE = "moderate"
    LENIENT = "lenient"


class QuestionType(str, Enum):
    """题目类型"""
    MC = "mc"
    SHORT_ANSWER = "short_answer"


class AnswerSource(str, Enum):
    """答案来源"""
    ANSWER_SHEET = "answer_sheet"
    RAG = "rag"
    MANUAL = "manual"


class GradedBy(str, Enum):
    """评分者"""
    AI = "ai"
    TEACHER = "teacher"


# ── 状态流转规则 ──

VALID_STATUS_TRANSITIONS = {
    ExamStatus.DRAFT: {ExamStatus.QUESTIONS_EXTRACTED},
    ExamStatus.QUESTIONS_EXTRACTED: {ExamStatus.ANSWERS_READY, ExamStatus.DRAFT},
    ExamStatus.ANSWERS_READY: {ExamStatus.GRADING, ExamStatus.QUESTIONS_EXTRACTED},
    ExamStatus.GRADING: {ExamStatus.COMPLETED, ExamStatus.ANSWERS_READY},
    ExamStatus.COMPLETED: set(),
}

# ── 文件限制 ──

MAX_CLEAN_PAPER_SIZE_MB = 50
MAX_BATCH_PDF_SIZE_MB = 500
MAX_ANSWER_SHEET_SIZE_MB = 50
ALLOWED_PAPER_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png"}
ALLOWED_BATCH_EXTENSIONS = {".pdf"}
UPLOAD_DIR = "uploads/exam_grader"

# ── PDF 处理 ──

PDF_DPI = 200  # PDF 转图片分辨率

# ── AI Gateway 配置 ──

GATE_TASK_EXTRACT_QUESTIONS = "exam_extract_questions"
GATE_TASK_EXTRACT_ANSWERS = "exam_extract_answers"
GATE_TASK_GENERATE_ANSWERS = "exam_generate_answers"
GATE_TASK_STUDENT_OCR = "exam_student_ocr"
GATE_TASK_GRADE_SA = "exam_grade_sa"
GATE_TASK_STUDENT_INFO = "exam_student_info"

# ── 支持的科目 ──

SUPPORTED_SUBJECTS = ["ict"]
DEFAULT_SUBJECT = "ict"

# ── 轮询间隔 (前端参考) ──

POLLING_INTERVAL_MS = 2000
