#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
默書文字比對 (純函數層)
========================
設計原則：
- **無副作用**、不碰 DB、不碰檔案、不做 I/O
- 只依賴 stdlib (re + difflib)
- 容易單元測試
- 由 DictationService 呼叫，也可以從 pytest 直接用

核心：word-level diff。用 difflib.SequenceMatcher 對參考文本與 OCR 文本
的詞序列求 opcode，把 equal / replace / delete / insert 映射成：
    correct → 學生寫對
    wrong   → 錯字(替換)
    missing → 漏字
    extra   → 多寫字

最終回傳 dict 可直接 json 化寫進 submission.diff_result。
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Dict, List

from app.domains.dictation.constants import WORD_REGEX

_WORD_RE = re.compile(WORD_REGEX)


def tokenize(text: str) -> List[str]:
    """把文本拆成小寫單詞序列 (忽略標點與空白)。"""
    if not text:
        return []
    return [m.group(0).lower() for m in _WORD_RE.finditer(text)]


def compare_dictation(reference: str, ocr: str) -> Dict:
    """比對參考文本與 OCR 文本，產生 word-level diff 與統計。

    Args:
        reference: 老師輸入的原文
        ocr: 視覺模型 OCR 後的學生手寫文字

    Returns:
        {
            "items": [
                {"status": "correct"|"wrong"|"missing"|"extra",
                 "ref": str|None, "ocr": str|None, "index": int},
                ...
            ],
            "correct_count": int,
            "wrong_count": int,
            "missing_count": int,
            "extra_count": int,
            "total_ref": int,           # 原文總詞數
            "accuracy": float,          # correct / total_ref * 100 (0~100)
            "reference_tokens": [...],
            "ocr_tokens": [...],
        }
    """
    ref_tokens = tokenize(reference)
    ocr_tokens = tokenize(ocr)

    matcher = SequenceMatcher(a=ref_tokens, b=ocr_tokens, autojunk=False)
    items: List[Dict] = []
    correct = wrong = missing = extra = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            for k in range(i2 - i1):
                items.append({
                    "status": "correct",
                    "ref": ref_tokens[i1 + k],
                    "ocr": ocr_tokens[j1 + k],
                    "index": i1 + k,
                })
                correct += 1

        elif tag == "replace":
            # 對齊：前 min(len_r, len_o) 對視為「錯字」(ref vs ocr 替換)，
            # 其餘 ref 多出 → missing，ocr 多出 → extra
            len_r = i2 - i1
            len_o = j2 - j1
            pair_len = min(len_r, len_o)
            for k in range(pair_len):
                items.append({
                    "status": "wrong",
                    "ref": ref_tokens[i1 + k],
                    "ocr": ocr_tokens[j1 + k],
                    "index": i1 + k,
                })
                wrong += 1
            for k in range(pair_len, len_r):
                items.append({
                    "status": "missing",
                    "ref": ref_tokens[i1 + k],
                    "ocr": None,
                    "index": i1 + k,
                })
                missing += 1
            for k in range(pair_len, len_o):
                items.append({
                    "status": "extra",
                    "ref": None,
                    "ocr": ocr_tokens[j1 + k],
                    "index": i2,
                })
                extra += 1

        elif tag == "delete":
            for k in range(i2 - i1):
                items.append({
                    "status": "missing",
                    "ref": ref_tokens[i1 + k],
                    "ocr": None,
                    "index": i1 + k,
                })
                missing += 1

        elif tag == "insert":
            for k in range(j2 - j1):
                items.append({
                    "status": "extra",
                    "ref": None,
                    "ocr": ocr_tokens[j1 + k],
                    "index": i1,
                })
                extra += 1

    total_ref = len(ref_tokens)
    accuracy = round(correct / total_ref * 100, 2) if total_ref > 0 else 0.0

    return {
        "items": items,
        "correct_count": correct,
        "wrong_count": wrong,
        "missing_count": missing,
        "extra_count": extra,
        "total_ref": total_ref,
        "accuracy": accuracy,
        "reference_tokens": ref_tokens,
        "ocr_tokens": ocr_tokens,
    }
