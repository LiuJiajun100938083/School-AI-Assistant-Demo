#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理 Schemas
================
Pydantic 請求/響應模型。
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


# ================================================================
# 常量
# ================================================================

class AssignmentType:
    FILE_UPLOAD = "file_upload"
    FORM = "form"
    EXAM = "exam"
    ALL = {FILE_UPLOAD, FORM, EXAM}


class ScoreSource:
    AUTO = "auto"
    AI = "ai"
    TEACHER = "teacher"


QUESTION_TYPES = {"mc", "short_answer", "long_answer"}


# ================================================================
# 評分標準
# ================================================================

class LevelDefinition(BaseModel):
    """等級定義 (用於 analytic_levels / dse_criterion)"""
    level: str = Field(..., description="等級標籤, e.g. 'Excellent' 或 '5'")
    points: Optional[float] = Field(default=None, description="該等級對應分數")
    description: str = Field(default="", description="等級描述")


class RubricItemInput(BaseModel):
    """評分標準項目輸入 (支持所有類型)"""
    title: str = Field(..., min_length=1, max_length=255, description="評分項目名稱")
    max_points: Optional[float] = Field(default=None, ge=0, le=1000, description="該項滿分")
    weight: Optional[float] = Field(default=None, ge=0, le=100, description="權重百分比")
    level_definitions: Optional[List[LevelDefinition]] = Field(
        default=None, description="等級定義列表"
    )


# ================================================================
# 作業 - 請求
# ================================================================

class CreateAssignmentRequest(BaseModel):
    """創建作業請求"""
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    assignment_type: str = Field(default="file_upload", description="作業類型: file_upload / form / exam")
    target_type: str = Field(default="all", description="目標類型: all, class, student")
    target_value: Optional[str] = Field(default=None, description="班級名或逗號分隔的 username")
    deadline: Optional[str] = Field(default=None, description="截止日期 ISO 格式")
    max_files: int = Field(default=5, ge=1, le=20)
    allow_late: bool = False
    rubric_type: str = Field(default="points", description="評分類型")
    rubric_config: Optional[Dict[str, Any]] = Field(default=None, description="類型配置")
    rubric_items: List[RubricItemInput] = Field(default=[], description="評分標準項目")
    questions: Optional[List["ExamQuestionInput"]] = Field(default=None, description="試卷識別題目")
    exam_batch_id: Optional[str] = Field(default=None, description="OCR 批次 ID（試卷類型）")

    @validator("assignment_type")
    def validate_assignment_type(cls, v):
        if v not in AssignmentType.ALL:
            raise ValueError(f"作業類型必須是 {AssignmentType.ALL} 之一，收到: '{v}'")
        return v


class UpdateAssignmentRequest(BaseModel):
    """更新作業請求"""
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    target_type: Optional[str] = None
    target_value: Optional[str] = None
    deadline: Optional[str] = None
    max_files: Optional[int] = Field(default=None, ge=1, le=20)
    allow_late: Optional[bool] = None
    rubric_type: Optional[str] = None
    rubric_config: Optional[Dict[str, Any]] = None
    rubric_items: Optional[List[RubricItemInput]] = None
    questions: Optional[List["ExamQuestionInput"]] = Field(default=None, description="試卷識別題目")
    exam_batch_id: Optional[str] = Field(default=None, description="OCR 批次 ID（試卷類型）")


# ================================================================
# 題目
# ================================================================

class QuestionTypeEnum(str, Enum):
    OPEN = "open"
    MULTIPLE_CHOICE = "multiple_choice"
    FILL_BLANK = "fill_blank"
    TRUE_FALSE = "true_false"
    PASSAGE = "passage"  # 資料/段落 (display-only, 不需作答)


class AnswerSourceEnum(str, Enum):
    EXTRACTED = "extracted"
    INFERRED = "inferred"
    MISSING = "missing"
    MANUAL = "manual"


class BlankModeEnum(str, Enum):
    INLINE = "inline"      # 行內填空 (____空格)
    SECTION = "section"    # 分項答題 (論點/論據/論述)
    MIXED = "mixed"        # 混合模式 (模板驅動，短填+長答)


class BlankItem(BaseModel):
    """填空題的單個空格/分項"""
    id: str = Field(default="", max_length=20, description="空格 ID, e.g. b1")
    label: str = Field(default="", max_length=255, description="空格標籤（模板模式下可為空）")
    points: float = Field(..., ge=0, description="此空格分值")
    answer: str = Field(default="", description="預期答案")
    input_type: str = Field(default="short_text", description="輸入類型: short_text / long_text")


class ExamQuestionInput(BaseModel):
    """單道題目輸入 (OCR 識別或手動添加)"""
    question_number: str = Field(default="", max_length=20)
    question_text: str = Field(..., min_length=1)
    answer_text: str = ""
    answer_source: AnswerSourceEnum = AnswerSourceEnum.MISSING
    points: Optional[float] = Field(default=None, ge=0)
    question_type: QuestionTypeEnum = QuestionTypeEnum.OPEN
    is_ai_extracted: bool = True
    source_batch_id: Optional[str] = None
    source_page: Optional[int] = None
    ocr_confidence: Optional[float] = None
    metadata: Optional[Dict[str, Any]] = None


# 更新前向引用
CreateAssignmentRequest.model_rebuild()
UpdateAssignmentRequest.model_rebuild()


# ================================================================
# 批改 - 請求
# ================================================================

class RubricScoreInput(BaseModel):
    """單項評分輸入"""
    rubric_item_id: int
    points: Optional[float] = Field(default=None, ge=0)
    selected_level: Optional[str] = Field(default=None, description="選擇的等級")


class GradeSubmissionRequest(BaseModel):
    """批改提交請求"""
    rubric_scores: List[RubricScoreInput] = Field(default=[], description="各項得分")
    feedback: str = Field(default="", description="教師評語")


# ================================================================
# Swift 運行
# ================================================================

class RunSwiftRequest(BaseModel):
    """運行 Swift 代碼請求"""
    code: str = Field(..., min_length=1, description="Swift 代碼")


# ================================================================
# Form 作業
# ================================================================

class QuestionOptionInput(BaseModel):
    """MC 選項"""
    option_key: str = Field(..., max_length=5, description="選項 key, e.g. A/B/C/D")
    option_text: str = Field(..., min_length=1, description="選項內容")

    @validator("option_text")
    def strip_option_text(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("選項內容不能為空白")
        return v


class QuestionInput(BaseModel):
    """Form 題目"""
    question_type: str = Field(..., description="題型: mc / short_answer / long_answer")
    question_text: str = Field(..., min_length=1, description="題目內容")
    max_points: float = Field(..., gt=0, le=1000, description="該題滿分")
    grading_notes: str = Field(default="", description="批改注意事項")
    correct_answer: str = Field(default="", description="MC 正確答案 key")
    reference_answer: str = Field(default="", description="短答/長答參考答案")
    options: List[QuestionOptionInput] = Field(default=[], description="MC 選項列表")

    @validator("question_type")
    def validate_question_type(cls, v):
        if v not in QUESTION_TYPES:
            raise ValueError(f"題型必須是 {QUESTION_TYPES} 之一")
        return v

    @validator("question_text")
    def strip_question_text(cls, v):
        return v.strip()

    @validator("grading_notes")
    def strip_grading_notes(cls, v):
        return v.strip() if v else ""

    @validator("reference_answer")
    def strip_reference_answer(cls, v):
        return v.strip() if v else ""

    @validator("options")
    def validate_mc_options(cls, v, values):
        qt = values.get("question_type", "")
        if qt == "mc":
            if len(v) < 2:
                raise ValueError("MC 題至少需要 2 個選項")
            keys = [o.option_key for o in v]
            if len(keys) != len(set(keys)):
                raise ValueError("MC 選項 key 不能重複")
        elif qt in ("short_answer", "long_answer"):
            if v:
                raise ValueError("短答/長答題不應設定選項")
        return v

    @validator("correct_answer")
    def validate_correct_answer(cls, v, values):
        qt = values.get("question_type", "")
        if qt == "mc":
            if not v:
                raise ValueError("MC 題必須設定正確答案")
            opts = values.get("options", [])
            if opts and v not in [o.option_key for o in opts]:
                raise ValueError(f"正確答案 '{v}' 不在選項列表中")
        elif qt in ("short_answer", "long_answer"):
            if v:
                raise ValueError("短答/長答題不應設定 correct_answer，請使用 reference_answer")
        return v


class SubmitAnswerInput(BaseModel):
    """學生單題作答"""
    question_id: int = Field(..., description="題目 ID")
    answer_text: str = Field(default="", description="作答內容")


class SubmitFormRequest(BaseModel):
    """提交 Form 作業請求"""
    answers: List[SubmitAnswerInput] = Field(..., min_length=1, description="作答列表")


class GradeFormAnswerRequest(BaseModel):
    """教師手動批改單題"""
    points: float = Field(..., ge=0, description="給分")
    feedback: str = Field(default="", description="教師反饋")


# 修復 forward reference
CreateAssignmentRequest.model_rebuild()
UpdateAssignmentRequest.model_rebuild()
