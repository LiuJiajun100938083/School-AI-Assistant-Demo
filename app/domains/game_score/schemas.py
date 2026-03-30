#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自定義遊戲計分 — Pydantic Schema

定義請求/響應的數據格式與校驗規則。
"""

import json
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field, field_validator


class ScoreSubmitRequest(BaseModel):
    """提交遊戲分數"""

    score: int = Field(..., ge=0, le=999999, description="遊戲分數（0–999999）")
    extra_data: Optional[Dict[str, Any]] = Field(
        None, description="遊戲特定額外數據（JSON，最大 4KB）"
    )

    @field_validator("extra_data")
    @classmethod
    def validate_extra_data_size(cls, v: Optional[Dict]) -> Optional[Dict]:
        if v is not None and len(json.dumps(v, ensure_ascii=False)) > 4096:
            raise ValueError("extra_data 超過 4KB 限制")
        return v


class ScoreSettingsRequest(BaseModel):
    """修改遊戲計分設定（部分更新）"""

    allow_multiple_plays: Optional[bool] = Field(
        None, description="是否允許多次遊玩"
    )
    score_policy: Optional[str] = Field(
        None, description="排行榜取分策略: best / latest / first"
    )
    max_attempts: Optional[int] = Field(
        None, ge=1, le=999, description="最大遊玩次數（null 表示無限）"
    )

    @field_validator("score_policy")
    @classmethod
    def validate_policy(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("best", "latest", "first"):
            raise ValueError("score_policy 必須為 best / latest / first")
        return v
