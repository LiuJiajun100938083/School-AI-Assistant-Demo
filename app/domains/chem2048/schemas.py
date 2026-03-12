#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
化學 2048 - 數據模型

請求/響應的 Pydantic 模型，用於成績提交與管理。
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator


class Chem2048SubmitRequest(BaseModel):
    """提交成績請求"""
    score: int = Field(ge=0, description="遊戲分數")
    highest_tile: int = Field(ge=2, description="最高方塊值 (如 2048)")
    highest_element: str = Field(max_length=10, description="最高元素符號 (如 Na)")
    highest_element_no: int = Field(ge=1, le=20, description="最高元素序號 (如 11)")
    total_moves: int = Field(ge=0, default=0, description="總移動次數")
    tips_used: int = Field(ge=0, default=0, description="使用提示次數")

    @field_validator("score")
    @classmethod
    def validate_score(cls, v: int) -> int:
        """防止客戶端篡改：合理分數不應超過 1000 萬"""
        if v > 10_000_000:
            raise ValueError("分數超出合理範圍")
        return v

    @field_validator("highest_tile")
    @classmethod
    def validate_tile(cls, v: int) -> int:
        """方塊值必須是 2 的冪次"""
        if v & (v - 1) != 0:
            raise ValueError("highest_tile 必須是 2 的冪次")
        return v


class Chem2048UpdateRequest(BaseModel):
    """老師編輯成績請求（僅允許修改部分字段）"""
    score: Optional[int] = None

    @field_validator("score")
    @classmethod
    def validate_update_score(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("分數不能為負數")
        return v
