#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
神州菜園經營家 - 數據模型

請求/響應的 Pydantic 模型，用於成績提交與管理。
"""

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field, field_validator


# ==================================================================================
#                                   枚舉
# ==================================================================================

class GameResult(str, Enum):
    COMPLETED = "completed"
    BANKRUPT = "bankrupt"
    REDLINE = "redline"


# ==================================================================================
#                                   請求模型
# ==================================================================================

class ScoreSubmitRequest(BaseModel):
    """提交成績請求"""
    result: GameResult
    score: int = Field(description="總分")
    final_money: int = Field(description="最終資金")
    final_tech: int = Field(ge=0, description="最終科技等級")
    final_land: int = Field(ge=0, description="剩餘耕地數")
    turns_played: int = Field(ge=1, le=30, description="實際遊戲回合數")
    reserve_policy: bool = Field(default=False, description="是否啟動國家收儲計畫")
    feedback_tags: List[str] = Field(default_factory=list, description="學習反饋標籤")

    @field_validator("score")
    @classmethod
    def validate_score_range(cls, v: int) -> int:
        if v < -50000:
            raise ValueError("分數超出合理範圍")
        return v


class ScoreUpdateRequest(BaseModel):
    """老師編輯成績請求"""
    score: Optional[int] = None
    result: Optional[GameResult] = None
    feedback_tags: Optional[List[str]] = None

    @field_validator("score")
    @classmethod
    def validate_update_score(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < -50000:
            raise ValueError("分數超出合理範圍")
        return v
