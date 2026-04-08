#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英文默書模組 Pydantic schemas (DTO 層)
======================================
輸入 / 輸出格式集中定義，router 只做 schema ↔ dict 轉換，
business logic 全部在 service。
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ─── 老師端：建立 / 更新 ───────────────────────────────────
class CreateDictationRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    reference_text: str = Field(..., min_length=1, description="默書原文")
    target_type: str = Field("all", description="all | class | student")
    target_value: Optional[str] = ""
    deadline: Optional[datetime] = None
    allow_late: bool = False


class UpdateDictationRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    reference_text: Optional[str] = None
    target_type: Optional[str] = None
    target_value: Optional[str] = None
    deadline: Optional[datetime] = None
    allow_late: Optional[bool] = None


# ─── 老師端：覆核 ────────────────────────────────────────
class OverrideSubmissionRequest(BaseModel):
    score: Optional[float] = Field(None, ge=0, le=100)
    teacher_feedback: Optional[str] = None
    manual_ocr_text: Optional[str] = Field(
        None, description="老師手動修正後的 OCR 文字 (會重新算 diff)"
    )
