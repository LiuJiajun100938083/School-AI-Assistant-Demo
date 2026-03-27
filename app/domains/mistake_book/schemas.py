"""
錯題本 Pydantic 模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


# ============================================================
# 枚舉
# ============================================================

class SubjectEnum(str, Enum):
    """DEPRECATED: 保留向後兼容，新代碼請直接使用 str 並通過 SubjectHandlerRegistry 驗證。"""
    CHINESE = "chinese"
    MATH = "math"
    ENGLISH = "english"


class MistakeStatus(str, Enum):
    PENDING_OCR = "pending_ocr"
    PENDING_REVIEW = "pending_review"
    ANALYZED = "analyzed"
    PRACTICING = "practicing"
    MASTERED = "mastered"


class ErrorType(str, Enum):
    CONCEPT_ERROR = "concept_error"         # 概念錯誤
    CALCULATION_ERROR = "calculation_error"  # 計算錯誤
    COMPREHENSION_GAP = "comprehension_gap"  # 理解偏差
    CARELESS = "careless"                    # 粗心大意
    EXPRESSION_WEAK = "expression_weak"      # 表達不足
    MEMORY_ERROR = "memory_error"            # 記憶錯誤（默書/公式）
    LOGIC_ERROR = "logic_error"              # 邏輯錯誤
    METHOD_ERROR = "method_error"            # 方法錯誤


class SessionType(str, Enum):
    TARGETED = "targeted"      # 針對薄弱點
    REVIEW = "review"          # 間隔複習
    CHALLENGE = "challenge"    # 挑戰提升
    EXAM_PREP = "exam_prep"    # 備考模式


class ReviewResult(str, Enum):
    REMEMBERED = "remembered"
    FORGOT = "forgot"
    PARTIAL = "partial"


# ============================================================
# 請求模型
# ============================================================

class ConfirmOCRRequest(BaseModel):
    """確認/修正 OCR 結果"""
    confirmed_question: str = Field(..., min_length=1, description="確認後的題目文字")
    confirmed_answer: str = Field(..., min_length=1, description="確認後的答案文字")
    confirmed_figure_description: Optional[str] = Field(
        None, description="確認後的幾何描述 JSON（可選，前端編輯後回傳）"
    )


class ManualMistakeRequest(BaseModel):
    """手動添加錯題"""
    subject: str = Field(..., min_length=1, max_length=50, description="科目代碼")
    category: str = Field(..., min_length=1, description="題目類型")
    question_text: str = Field(..., min_length=1, description="題目內容")
    answer_text: str = Field(..., min_length=1, description="學生答案")
    correct_answer: Optional[str] = Field(None, description="正確答案（可選，AI 也會分析）")
    tags: Optional[List[str]] = None


class GeneratePracticeRequest(BaseModel):
    """生成練習題"""
    subject: str = Field(..., min_length=1, max_length=50, description="科目代碼")
    session_type: SessionType = SessionType.TARGETED
    question_count: int = Field(default=5, ge=1, le=20, description="題目數量")
    target_points: Optional[List[str]] = Field(None, description="指定知識點（不填則自動選擇薄弱點）")
    difficulty: Optional[int] = Field(None, ge=1, le=5, description="指定難度（不填則自動匹配）")
    provider: str = Field(default="local", description="LLM 提供者：local（Ollama）或 qwen/deepseek（雲端）")


class SubmitPracticeRequest(BaseModel):
    """提交練習答案"""
    answers: List[Dict[str, Any]] = Field(
        ...,
        description="答案列表 [{question_idx: int, answer: str, time_spent_seconds?: int}]",
    )


class RecordReviewRequest(BaseModel):
    """記錄複習結果"""
    result: ReviewResult
    time_spent_seconds: Optional[int] = None


# ============================================================
# 響應模型
# ============================================================

class UploadMistakeResponse(BaseModel):
    """上傳錯題響應"""
    mistake_id: str
    ocr_question: str
    ocr_answer: str
    confidence: float
    has_handwriting: bool
    figure_description: Optional[str] = None
    figure_description_readable: Optional[str] = None
    status: str
    message: str


class MistakeDetail(BaseModel):
    """錯題詳情"""
    mistake_id: str
    subject: str
    category: str
    question_text: str
    answer_text: str
    correct_answer: Optional[str]
    ai_analysis: Optional[str]
    improvement_tips: List[str] = []
    key_insight: Optional[str] = None
    error_type: Optional[str]
    difficulty_level: int
    status: str
    mastery_level: int
    review_count: int
    knowledge_points: List[Dict[str, Any]] = []
    original_image_path: Optional[str]
    created_at: str
    next_review_at: Optional[str]
    tags: Optional[List[str]]
    figure_description: Optional[str] = None
    figure_description_readable: Optional[str] = None


class WeaknessReport(BaseModel):
    """薄弱知識點報告"""
    subject: str
    total_mistakes: int
    weak_points: List[Dict[str, Any]]
    error_type_distribution: List[Dict[str, Any]]
    ai_summary: str
    recommendations: List[str]


class KnowledgeMapNode(BaseModel):
    """知識地圖節點"""
    point_code: str
    point_name: str
    category: str
    mastery_level: int
    mistake_count: int
    trend: str
    children: List["KnowledgeMapNode"] = []


class PracticeQuestion(BaseModel):
    """練習題"""
    index: int
    question: str
    question_type: str = "short_answer"  # multiple_choice / short_answer / fill_blank
    options: Optional[List[str]] = None
    point_code: str
    point_name: str
    difficulty: int


class PracticeSessionResponse(BaseModel):
    """練習題會話響應"""
    session_id: str
    subject: str
    session_type: str
    questions: List[Dict[str, Any]]
    total_questions: int


class PracticeResult(BaseModel):
    """練習結果"""
    session_id: str
    score: float
    correct_count: int
    total_questions: int
    ai_feedback: str
    mastery_updates: List[Dict[str, Any]]
    new_mistakes_added: int


class DashboardStats(BaseModel):
    """學習統計儀表板"""
    total_mistakes: int
    per_subject: Dict[str, Dict[str, Any]]
    mastery_overview: Dict[str, Any]
    review_streak: int
    weekly_review_trend: List[Dict[str, Any]]
    recent_practice_scores: List[Dict[str, Any]]
