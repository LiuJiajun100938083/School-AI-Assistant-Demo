"""
AI 考試出題 — 請求/響應模型
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


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
