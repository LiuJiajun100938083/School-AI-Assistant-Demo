"""
AI 考試出題 — 請求/響應模型
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


class ExamGenerationRequest(BaseModel):
    """啟動 AI 出題的請求"""
    subject: str = Field(..., min_length=1, max_length=50, description="科目代碼，如 math")
    question_count: int = Field(default=5, ge=1, le=5, description="題目數量（最多5題）")
    difficulty: int = Field(default=3, ge=1, le=5, description="難度 1-5")
    target_points: Optional[List[str]] = Field(
        default=None, description="目標知識點 codes，None 則自動選擇",
    )
    question_types: Optional[List[str]] = Field(
        default=None,
        description="題型列表: multiple_choice / short_answer / long_answer / fill_blank",
    )
    exam_context: str = Field(default="", max_length=200, description="考試場景，如 '期中考試'")
    total_marks: Optional[int] = Field(default=None, ge=1, le=500, description="總分")
    geometry_description: str = Field(default="", max_length=500, description="幾何圖形描述（數學專用）")


class UpdateQuestionRequest(BaseModel):
    """編輯 AI 生成的單題"""
    question_index: int = Field(ge=0, description="題目索引")
    edits: Dict[str, Any] = Field(
        ..., description="要更新的字段 {field: new_value}",
    )


class RegenerateQuestionRequest(BaseModel):
    """重新生成指定題目"""
    question_index: int = Field(ge=0, description="題目索引")
    instruction: str = Field(default="", max_length=500, description="額外指示")


class GeometryDescriptionRequest(BaseModel):
    """從文字描述生成 JSXGraph 幾何圖形"""
    description: str = Field(..., min_length=2, max_length=500, description="幾何描述文字")


class SimilarQuestionRequest(BaseModel):
    """相似題生成請求（文字輸入模式）"""
    subject: str = Field(
        ..., pattern=r'^(math|physics)$',
        description="科目：math 或 physics",
    )
    question_text: str = Field(
        ..., min_length=5, max_length=3000,
        description="原題文字（支援 LaTeX）",
    )
    count: int = Field(default=3, ge=1, le=5, description="生成相似題數量")
    difficulty_variation: bool = Field(
        default=True, description="是否包含難度變化（±1 範圍）",
    )

    @validator('question_text')
    def strip_text(cls, v):
        return v.strip()


class QuestionExportRequest(BaseModel):
    """單題導出為 DOCX"""
    question: str = Field(default="", description="題目文字")
    correct_answer: str = Field(default="", description="參考答案")
    marking_scheme: str = Field(default="", description="評分標準")
    points: Optional[int] = Field(default=None, description="分數")
    question_type: str = Field(default="short_answer", description="題型")
    options: Optional[List[str]] = Field(default=None, description="選項（選擇題）")
