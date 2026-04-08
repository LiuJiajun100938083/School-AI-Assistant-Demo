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

from app.domains.dictation.cjk_normalizer import chars_equivalent
from app.domains.dictation.constants import CJK_REGEX, Language, Mode, WORD_REGEX

_WORD_RE = re.compile(WORD_REGEX)
_CJK_RE = re.compile(CJK_REGEX)

# Chinese sentence delimiters (full-width period, exclamation, question, newline)
_ZH_SENTENCE_DELIMS = frozenset("。!?!?\n;;")


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


def _split_chinese_sentences(reference: str) -> List[Dict]:
    """把中文 reference 切成句子,記錄每句覆蓋的 CJK token index 範圍。

    純函數,無 IO,專供前端「錯字一覽」按句分組用。

    Returns:
        list of {"text": str, "start_idx": int, "end_idx": int}
        其中 start/end_idx 是該句覆蓋的 CJK token (字元) 在
        `tokenize(reference, 'zh')` 結果中的 [start, end) 範圍。

    Edge cases:
      - 空字串                  → []
      - 沒有任何分隔符          → 單一句覆蓋全部 CJK chars
      - 連續分隔符              → 中間不產生空句
      - 純非 CJK 內容           → []
    """
    if not reference:
        return []

    sentences: List[Dict] = []
    current_chars: List[str] = []
    current_start = 0
    cjk_idx = 0

    for ch in reference:
        if _CJK_RE.match(ch):
            current_chars.append(ch)
            cjk_idx += 1
        elif ch in _ZH_SENTENCE_DELIMS:
            if current_chars:
                sentences.append({
                    "text": "".join(current_chars),
                    "start_idx": current_start,
                    "end_idx": cjk_idx,
                })
                current_start = cjk_idx
                current_chars = []
        # 其他字元 (空白 / 半形標點 / 拉丁字母) → 忽略,不切句也不計數

    # tail
    if current_chars:
        sentences.append({
            "text": "".join(current_chars),
            "start_idx": current_start,
            "end_idx": cjk_idx,
        })
    return sentences


def compare_dictation(
    reference: str,
    ocr: str,
    language: str = Language.ENGLISH,
    mode: str = Mode.PARAGRAPH,
    lenient_variants: bool = True,
) -> Dict:
    """比對參考文本與 OCR 文本，產生 word/char-level diff 與統計。

    Args:
        reference: 老師輸入的原文
        ocr: 視覺模型 OCR 後的學生手寫文字
        language: 'en' | 'zh'
        mode: 'paragraph' | 'word_list'
        lenient_variants: 中文繁簡互換是否視為等價 (僅 zh+paragraph 生效)。
            預設值 True 只是「呼叫者忘記傳值」的安全網 — 真正的預設由
            dictations 表 schema 的 DEFAULT 1 決定,service 從 row 讀後傳入。

    Returns:
        {
            "items": [
                {"status": "correct"|"wrong"|"missing"|"extra",
                 "ref": str|None, "ocr": str|None, "index": int,
                 "variant_match": bool (僅在 zh lenient correct 時有)},
                ...
            ],
            "correct_count": int,
            "wrong_count": int,
            "missing_count": int,
            "extra_count": int,
            "total_ref": int,
            "accuracy": float,
            "language": str,
            "mode": str,
            "reference_tokens": [...],
            "ocr_tokens": [...],
            "sentences": [...],   # 僅 zh+paragraph 時填,結構見 _split_chinese_sentences
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
    use_lenient = (
        lenient_variants
        and language == Language.CHINESE
        and mode == Mode.PARAGRAPH
    )

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
                ref_c = ref_tokens[i1 + k]
                ocr_c = ocr_tokens[j1 + k]
                # 中文寬容模式:繁簡互換視為 correct (但加 variant_match flag
                # 讓前端可選擇用淡色提示)
                if use_lenient and chars_equivalent(ref_c, ocr_c):
                    items.append({
                        "status": "correct",
                        "ref": ref_c,
                        "ocr": ocr_c,
                        "index": i1 + k,
                        "variant_match": True,
                    })
                    correct += 1
                else:
                    items.append({
                        "status": "wrong",
                        "ref": ref_c,
                        "ocr": ocr_c,
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

    result: Dict = {
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
    # 中文 paragraph 才提供 sentences,讓前端能按句分組顯示「錯字一覽」
    if language == Language.CHINESE and mode == Mode.PARAGRAPH:
        result["sentences"] = _split_chinese_sentences(reference)
    return result
