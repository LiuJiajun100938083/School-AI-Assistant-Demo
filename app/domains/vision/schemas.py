"""
視覺識別數據模型
"""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from enum import Enum


class RecognitionSubject(str, Enum):
    CHINESE = "chinese"
    MATH = "math"
    ENGLISH = "english"
    PHYSICS = "physics"

    @classmethod
    def _missing_(cls, value):
        """未知科目不報錯，作為通用科目處理。"""
        obj = str.__new__(cls, value)
        obj._value_ = value
        obj._name_ = value.upper()
        return obj


class RecognitionTask(str, Enum):
    QUESTION_AND_ANSWER = "question_and_answer"
    QUESTION_ONLY = "question_only"
    ANSWER_ONLY = "answer_only"
    DICTATION = "dictation"
    MATH_SOLUTION = "math_solution"
    ESSAY = "essay"
    EXAM_PAPER = "exam_paper"


@dataclass
class OCRResult:
    """OCR 識別結果"""
    question_text: str = ""
    answer_text: str = ""
    figure_description: str = ""  # 圖形/圖表的文字描述（幾何圖、座標圖等）
    raw_text: str = ""
    confidence: float = 0.0
    has_math_formula: bool = False
    has_handwriting: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    success: bool = True
    # Phase 2: 分項置信度（數學題拆分為 question/answer/figure）
    question_confidence: float = 0.0
    answer_confidence: float = 0.0
    figure_confidence: float = 0.0


@dataclass
class ExamPaperResult:
    """試卷多題 OCR 識別結果"""
    questions: List[Dict[str, Any]] = field(default_factory=list)
    paper_title: str = ""
    total_score: Optional[float] = None
    confidence: float = 0.0
    warnings: List[str] = field(default_factory=list)
    raw_text: str = ""
    success: bool = True
    error: Optional[str] = None


@dataclass
class ImageInfo:
    """圖片元數據"""
    file_path: str = ""
    original_filename: str = ""
    file_size: int = 0
    width: int = 0
    height: int = 0
    format: str = ""
    processed_path: Optional[str] = None
