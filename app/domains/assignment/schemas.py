#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理 Schemas
================
Pydantic 請求/響應模型。
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


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
    target_type: str = Field(default="all", description="目標類型: all, class, student")
    target_value: Optional[str] = Field(default=None, description="班級名或逗號分隔的 username")
    deadline: Optional[str] = Field(default=None, description="截止日期 ISO 格式")
    max_files: int = Field(default=5, ge=1, le=20)
    allow_late: bool = False
    rubric_type: str = Field(default="points", description="評分類型")
    rubric_config: Optional[Dict[str, Any]] = Field(default=None, description="類型配置")
    rubric_items: List[RubricItemInput] = Field(default=[], description="評分標準項目")


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
