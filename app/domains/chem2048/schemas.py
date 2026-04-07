#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
化學 2048 - 數據模型

請求/響應的 Pydantic 模型，用於成績提交與管理。

防作弊策略：
1. 基礎範圍/類型檢查（Field）
2. highest_tile 必須是 2 的冪次（2..2^20）
3. highest_element_no 必須 = log2(highest_tile)（元素序號與方塊值必須對應）
4. score 下界：數學上達到 2^N 至少需要 (N-2) × 2^N 分（忽略 4-spawn
   機率校正）——低於此值一定是造假
5. score 上界：寬鬆的合理上界（每步最多 highest_tile × 4）
6. total_moves 下界：達到 2^N 至少需要的合併次數 ≈ 2^(N-1) - 1
7. 不設分數硬上限，容許 AI 高分
"""

from typing import Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# 最多支援到 Ca (2^20)
_MAX_TILE = 1 << 20


class Chem2048SubmitRequest(BaseModel):
    """提交成績請求"""
    score: int = Field(ge=0, description="遊戲分數")
    highest_tile: int = Field(ge=2, le=_MAX_TILE, description="最高方塊值 (如 2048)")
    highest_element: str = Field(max_length=10, description="最高元素符號 (如 Na)")
    highest_element_no: int = Field(ge=1, le=20, description="最高元素序號 (如 11)")
    total_moves: int = Field(ge=0, le=200_000, default=0, description="總移動次數")
    tips_used: int = Field(ge=0, le=100, default=0, description="使用提示次數")

    @field_validator("highest_tile")
    @classmethod
    def validate_tile(cls, v: int) -> int:
        """方塊值必須是 2 的冪次"""
        if v < 2 or (v & (v - 1)) != 0:
            raise ValueError("highest_tile 必須是 2 的冪次")
        return v

    @model_validator(mode="after")
    def validate_consistency(self) -> "Chem2048SubmitRequest":
        """跨欄位一致性檢查（防 F12 亂填）"""
        tile = self.highest_tile
        n = tile.bit_length() - 1  # log2(tile), e.g. 2048 → 11

        # 1. element_no 必須對應 highest_tile
        if self.highest_element_no != n:
            raise ValueError(
                f"highest_element_no ({self.highest_element_no}) 與 "
                f"highest_tile ({tile}) 不符，應為 {n}"
            )

        # 2. 分數下界：達到 2^N 需至少 (N-2) × 2^N 分
        #    （理論最小，假設所有 spawn 都是 4；實際通常 ≥ (N-1) × 2^N）
        if n >= 2:
            min_score = max(0, (n - 2) * tile)
            if self.score < min_score:
                raise ValueError(
                    f"score ({self.score}) 低於達到 {tile} 的理論最小分 {min_score}"
                )

        # 3. 分數上界：寬鬆上界 —— total_moves × highest_tile × 4
        #    棋盤任何時刻總和不會超過 highest_tile × 25，每步最多增加一個
        #    合併結果，寬鬆估計 4 倍
        if self.total_moves > 0:
            max_score = self.total_moves * tile * 4
            if self.score > max_score:
                raise ValueError(
                    f"score ({self.score}) 超過 {self.total_moves} 步可能產生的最大分 {max_score}"
                )

        # 4. 合併次數下界：寬鬆 —— 達到 2^N 至少 2^(N-2) 次合併
        if n >= 3:
            min_moves = 1 << (n - 2)
            if self.total_moves > 0 and self.total_moves < min_moves:
                raise ValueError(
                    f"total_moves ({self.total_moves}) 少於達到 {tile} 的理論最小步數 {min_moves}"
                )

        return self


class Chem2048UpdateRequest(BaseModel):
    """老師編輯成績請求（僅允許修改部分字段）"""
    score: Optional[int] = None

    @field_validator("score")
    @classmethod
    def validate_update_score(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError("分數不能為負數")
        return v
