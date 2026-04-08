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

支持三種組合：
    (en, paragraph) → 英文段落,word-level SequenceMatcher 比對
    (en, word_list) → 英文單字表,順序無關,支援模糊拼寫比對
    (zh, paragraph) → 中文課文,character-level SequenceMatcher 比對

用 difflib.SequenceMatcher 求 opcode，把 equal / replace / delete / insert
映射成 correct / wrong / missing / extra。最終回傳 dict 可直接 json 化
寫進 submission.diff_result。
"""

from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Dict, List

from app.domains.dictation.constants import CJK_REGEX, Language, Mode, WORD_REGEX

_WORD_RE = re.compile(WORD_REGEX)
_CJK_RE = re.compile(CJK_REGEX)


def tokenize(text: str, language: str = Language.ENGLISH) -> List[str]:
    """把文本拆成 token 序列。

    - English: 每個「單詞」為一 token,忽略標點與空白,小寫化
    - Chinese: 每個漢字為一 token,忽略所有非漢字
    """
    if not text:
        return []
    if language == Language.CHINESE:
        return _CJK_RE.findall(text)
    return [m.group(0).lower() for m in _WORD_RE.finditer(text)]


# 默書要求嚴格拼寫,僅完全一致才算對;有相似度但不完全 → 拼錯
_FUZZY_CORRECT_THRESHOLD = 1.00   # 必須 100% 相同才視為正確
_FUZZY_WRONG_THRESHOLD   = 0.55   # ≥ 這個視為「有嘗試但拼錯」,否則當成 missing


def _word_similarity(a: str, b: str) -> float:
    """兩個單詞的相似度 (0.0~1.0)"""
    return SequenceMatcher(a=a, b=b, autojunk=False).ratio()


def _compare_word_list(ref_tokens: List[str], ocr_tokens: List[str]) -> Dict:
    """英文單字表比對 — 順序無關,支援模糊拼寫。

    演算法:
      對每個 ref 詞,從尚未配對的 ocr 詞中找相似度最高者:
        ratio ≥ 0.85 → correct
        ratio ≥ 0.60 → wrong (學生有寫但拼錯)
        否則         → missing
      所有未被配對的 ocr 詞 → extra
    """
    items: List[Dict] = []
    correct = wrong = missing = extra = 0
    used = [False] * len(ocr_tokens)

    for i, ref_w in enumerate(ref_tokens):
        best_j = -1
        best_r = 0.0
        for j, ocr_w in enumerate(ocr_tokens):
            if used[j]:
                continue
            r = _word_similarity(ref_w, ocr_w)
            if r > best_r:
                best_r = r
                best_j = j

        if best_j >= 0 and best_r >= _FUZZY_CORRECT_THRESHOLD:
            used[best_j] = True
            items.append({
                "status": "correct",
                "ref": ref_w,
                "ocr": ocr_tokens[best_j],
                "index": i,
            })
            correct += 1
        elif best_j >= 0 and best_r >= _FUZZY_WRONG_THRESHOLD:
            used[best_j] = True
            items.append({
                "status": "wrong",
                "ref": ref_w,
                "ocr": ocr_tokens[best_j],
                "index": i,
            })
            wrong += 1
        else:
            items.append({
                "status": "missing",
                "ref": ref_w,
                "ocr": None,
                "index": i,
            })
            missing += 1

    for j, ocr_w in enumerate(ocr_tokens):
        if not used[j]:
            items.append({
                "status": "extra",
                "ref": None,
                "ocr": ocr_w,
                "index": len(ref_tokens),
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
    }


def compare_dictation(
    reference: str,
    ocr: str,
    language: str = Language.ENGLISH,
    mode: str = Mode.PARAGRAPH,
) -> Dict:
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
    ref_tokens = tokenize(reference, language)
    ocr_tokens = tokenize(ocr, language)

    # Word-list 模式 (英文單字表)走模糊比對,順序無關
    if mode == Mode.WORD_LIST and language == Language.ENGLISH:
        result = _compare_word_list(ref_tokens, ocr_tokens)
        result["language"] = language
        result["mode"] = mode
        result["reference_tokens"] = ref_tokens
        result["ocr_tokens"] = ocr_tokens
        return result

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
        "language": language,
        "mode": mode,
        "reference_tokens": ref_tokens,
        "ocr_tokens": ocr_tokens,
    }
