#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全球貿易大亨 - 數據模型

請求/響應的 Pydantic 模型，用於成績提交與管理。
"""

import json
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


# ==================================================================================
#                                   枚舉
# ==================================================================================

class Difficulty(str, Enum):
    EASY = "EASY"
    NORMAL = "NORMAL"
    HARD = "HARD"


class Specialization(str, Enum):
    AGRI = "AGRI"
    IND = "IND"
    TECH = "TECH"


class GameResult(str, Enum):
    WIN = "win"
    LOSE = "lose"
    BANKRUPT = "bankrupt"


# ==================================================================================
#                                   請求模型
# ==================================================================================

class InventoryData(BaseModel):
    """庫存數據"""
    food: int = Field(ge=0, default=0)
    industry: int = Field(ge=0, default=0)
    tech: int = Field(ge=0, default=0)


class GameStats(BaseModel):
    """遊戲行為統計"""
    trades: int = Field(ge=0, default=0, description="總交易次數")
    good_trades: int = Field(ge=0, default=0, description="好交易次數")
    bad_trades: int = Field(ge=0, default=0, description="壞交易次數")
    security_invests: int = Field(ge=0, default=0, description="投資安全次數")
    sanctions_used: int = Field(ge=0, default=0, description="使用制裁次數")
    tips_read: int = Field(ge=0, default=0, description="閱讀錦囊次數")
    bankrupt_reason: Optional[str] = Field(
        None,
        description="破產原因: money / security / null"
    )

    @field_validator("bankrupt_reason")
    @classmethod
    def validate_bankrupt_reason(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("money", "security"):
            raise ValueError("bankrupt_reason 只能是 'money', 'security' 或 null")
        return v


class ScoreSubmitRequest(BaseModel):
    """提交成績請求"""
    difficulty: Difficulty
    player_spec: Specialization
    ai_spec: Specialization
    result: GameResult
    player_score: int = Field(description="玩家綜合國力分")
    ai_score: int = Field(description="AI 綜合國力分")
    turns_played: int = Field(ge=1, le=20, description="實際遊戲回合數")
    final_money: int = Field(description="最終資金")
    final_security: int = Field(ge=0, le=100, description="最終安全指數")
    final_inventory: InventoryData = Field(default_factory=InventoryData)
    stats: GameStats = Field(default_factory=GameStats)
    feedback_tags: List[str] = Field(default_factory=list, description="學習反饋標籤")

    @field_validator("player_score", "ai_score")
    @classmethod
    def validate_score_range(cls, v: int) -> int:
        """分數合理性校驗：防止客戶端篡改"""
        if v < -50000:
            raise ValueError("分數超出合理範圍")
        return v


class ScoreUpdateRequest(BaseModel):
    """老師編輯成績請求（僅允許修改部分字段）"""
    player_score: Optional[int] = None
    result: Optional[GameResult] = None
    feedback_tags: Optional[List[str]] = None

    @field_validator("player_score")
    @classmethod
    def validate_update_score(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < -50000:
            raise ValueError("分數超出合理範圍")
        return v
