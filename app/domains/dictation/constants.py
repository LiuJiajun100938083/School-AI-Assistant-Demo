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
      submitted → ocr_processing ─┬─▶ graded
                                  ├─▶ needs_review  (信心不足,需老師複核)
                                  └─▶ ocr_failed    (可重新 OCR)
    """
    SUBMITTED = "submitted"
    OCR_PROCESSING = "ocr_processing"
    GRADED = "graded"
    NEEDS_REVIEW = "needs_review"
    OCR_FAILED = "ocr_failed"


# ─── 比對參數 ──────────────────────────────────────────────
# 英文分詞 regex (含撇號 / 連字號)
WORD_REGEX: str = r"[A-Za-z]+(?:['\-][A-Za-z]+)*"
# 中日韓統一表意文字範圍 (用於語言偵測 + 中文字元過濾)
CJK_REGEX: str = (
    r"[\u4e00-\u9fff"      # CJK Unified Ideographs
    r"\u3400-\u4dbf"       # CJK Extension A
    r"\uf900-\ufaff"       # CJK Compatibility Ideographs
    r"]"
)


class Language(str):
    """默書語言"""
    ENGLISH = "en"
    CHINESE = "zh"


class Mode(str):
    """默書模式"""
    PARAGRAPH = "paragraph"   # 段落/課文,順序敏感、詞序比對
    WORD_LIST = "word_list"   # 單字列表,順序無關、支援拼寫模糊比對 (英文專用)


def detect_language(text: str) -> str:
    """根據文本中 CJK 字元比例判斷語言。

    規則:只要出現任一 CJK 字元 → 中文,否則英文。
    """
    import re
    if not text:
        return Language.ENGLISH
    return Language.CHINESE if re.search(CJK_REGEX, text) else Language.ENGLISH
