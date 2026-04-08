#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英文默書模組常量

所有魔法數字、路徑、狀態字串集中管理，避免散落在 service/router 中。
"""

from enum import Enum
from pathlib import Path

# ─── 檔案儲存 ──────────────────────────────────────────────
# uploads/ 的絕對路徑（與 assignment 模組風格一致）
UPLOAD_DIR: Path = (
    Path(__file__).resolve().parent.parent.parent.parent
    / "uploads" / "dictation"
)

MAX_FILE_SIZE: int = 20 * 1024 * 1024        # 20MB / file
MAX_FILES_PER_SUBMISSION: int = 10           # 每次提交最多 10 張圖
SUPPORTED_IMAGE_EXTS: set = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif",
}

# ─── 狀態機 ────────────────────────────────────────────────
class DictationStatus(str, Enum):
    """默書本身的發布狀態。"""
    DRAFT = "draft"
    PUBLISHED = "published"
    CLOSED = "closed"


class SubmissionStatus(str, Enum):
    """學生提交的處理狀態。

    狀態流:
      submitted → ocr_processing → graded
                                ↘ ocr_failed (可重新 OCR)
    """
    SUBMITTED = "submitted"
    OCR_PROCESSING = "ocr_processing"
    GRADED = "graded"
    OCR_FAILED = "ocr_failed"


# ─── 比對參數 ──────────────────────────────────────────────
# 文字正規化後的分詞 regex（單詞包含字母、撇號、連字號）
WORD_REGEX: str = r"[A-Za-z]+(?:['\-][A-Za-z]+)*"
