#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — Shared Text Utilities
=============================================
Language-agnostic text processing functions shared by multiple analyzer
modules. All functions are standalone (no class, no self).

Dependencies: plagiarism_constants only.
"""

import re
from collections import Counter
from typing import Any, Dict, List, Set, Tuple

from app.domains.assignment.plagiarism_constants import MAX_TEXT_LENGTH


# ================================================================
# 基礎文本處理
# ================================================================

def normalize_text(text: str) -> str:
    """文本預處理: 去除多餘空白、統一小寫。"""
    if not text:
        return ""
    if len(text) > MAX_TEXT_LENGTH:
        text = text[:MAX_TEXT_LENGTH]
    text = re.sub(r'\s+', ' ', text).strip().lower()
    return text


def build_ngrams(text: str, n: int) -> Counter:
    """將文本切分為 N-gram 並統計頻次"""
    if len(text) < n:
        return Counter()
    return Counter(text[i:i + n] for i in range(len(text) - n + 1))


def ngram_jaccard(text_a: str, text_b: str, n: int) -> float:
    """計算兩段文本的 N-gram Jaccard 相似度（百分比）。"""
    clean_a = normalize_text(text_a)
    clean_b = normalize_text(text_b)

    if not clean_a or not clean_b:
        return 0.0

    ngrams_a = build_ngrams(clean_a, n)
    ngrams_b = build_ngrams(clean_b, n)

    if not ngrams_a or not ngrams_b:
        return 0.0

    set_a = set(ngrams_a.keys())
    set_b = set(ngrams_b.keys())
    intersection = set_a & set_b
    union = set_a | set_b

    if not union:
        return 0.0

    return len(intersection) / len(union) * 100


def set_overlap(set_a: Set[str], set_b: Set[str]) -> float:
    """計算兩個集合的重疊率（百分比）。"""
    if not set_a or not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) * 100


def verbatim_ratio(text_a: str, text_b: str) -> float:
    """
    計算逐字複製比率: 所有公共子串長度之和 / 較短文本長度。
    偵測直接複製粘貼的行為。
    """
    from difflib import SequenceMatcher

    if not text_a or not text_b:
        return 0.0

    shorter_len = min(len(text_a), len(text_b))
    if shorter_len == 0:
        return 0.0

    matcher = SequenceMatcher(None, text_a, text_b, autojunk=False)
    # 計算所有匹配塊的總長度
    total_match = sum(block.size for block in matcher.get_matching_blocks())
    return min(total_match / shorter_len * 100, 100)


def sequence_similarity(seq_a: List[int], seq_b: List[int]) -> float:
    """比較兩個整數序列的相似度（用於縮排深度和空行模式）"""
    if not seq_a or not seq_b:
        return 0.0

    # 使用 LCS 比率
    from difflib import SequenceMatcher
    matcher = SequenceMatcher(None, seq_a, seq_b, autojunk=False)
    return matcher.ratio()


def extract_matching_fragments(
    text_a: str,
    text_b: str,
    min_length: int = 30,
) -> List[Dict[str, Any]]:
    """
    使用 SequenceMatcher 提取兩段文本的共同片段。
    只保留長度 >= min_length 的片段，避免過多瑣碎匹配。
    """
    from difflib import SequenceMatcher

    matcher = SequenceMatcher(None, text_a, text_b, autojunk=False)
    fragments: List[Dict[str, Any]] = []

    for block in matcher.get_matching_blocks():
        if block.size >= min_length:
            matched_text = text_a[block.a: block.a + block.size]
            fragments.append({
                "text": matched_text[:200],
                "type": "verbatim_match",
                "pos_a": block.a,
                "pos_b": block.b,
                "length": block.size,
            })

    fragments.sort(key=lambda f: f["length"], reverse=True)
    return fragments


# ================================================================
# 段落結構分析（中文+英文作文共用）
# ================================================================

def paragraph_structure_similarity(raw_a: str, raw_b: str) -> float:
    """
    段落結構相似度：比較段落數量和長度比例。
    """
    def _get_paragraphs(text: str) -> List[str]:
        paras = [p.strip() for p in re.split(r'\n\s*\n|\n', text) if p.strip()]
        return paras if paras else [text]

    paras_a = _get_paragraphs(raw_a)
    paras_b = _get_paragraphs(raw_b)

    # 段落數相似度
    max_paras = max(len(paras_a), len(paras_b))
    min_paras = min(len(paras_a), len(paras_b))
    count_sim = min_paras / max_paras if max_paras > 0 else 1.0

    # 段落長度比例序列相似度
    def _length_ratios(paras: List[str]) -> List[float]:
        total = max(sum(len(p) for p in paras), 1)
        return [len(p) / total for p in paras]

    ratios_a = _length_ratios(paras_a)
    ratios_b = _length_ratios(paras_b)

    # 用 SequenceMatcher 比較比例序列（轉為可比較的整數序列）
    int_a = [int(r * 100) for r in ratios_a]
    int_b = [int(r * 100) for r in ratios_b]
    # 比較段落長度分布差異
    if len(int_a) == len(int_b):
        diff = sum(abs(a - b) for a, b in zip(int_a, int_b))
        max_diff = max(sum(int_a), sum(int_b), 1)
        ratio_sim = max(1 - diff / max_diff, 0)
    else:
        # 長度不同時用較短序列對齊
        shorter, longer = (int_a, int_b) if len(int_a) <= len(int_b) else (int_b, int_a)
        best_diff = float('inf')
        for start in range(len(longer) - len(shorter) + 1):
            diff = sum(abs(s - longer[start + i]) for i, s in enumerate(shorter))
            best_diff = min(best_diff, diff)
        max_diff = max(sum(longer), 1)
        ratio_sim = max(1 - best_diff / max_diff, 0)

    return min((count_sim * 0.4 + ratio_sim * 0.6) * 100, 100)


def aligned_span_coverage(
    sents_a: List[str],
    sents_b: List[str],
    aligned_pairs: List[Tuple[int, int, float]],
    min_ratio: float = 0.35,
) -> Dict[str, Any]:
    """
    對齊鏈覆蓋率：找到相似句對中連續出現的對齊鏈。

    Args:
        aligned_pairs: [(idx_a, idx_b, ratio), ...] 來自匈牙利匹配
        min_ratio: 最低相似度閾值，低於此的不算有效對齊

    Returns:
        {max_span_len, total_coverage, chain_count, chains: [...]}
    """
    if not aligned_pairs or not sents_a:
        return {"max_span_len": 0, "total_coverage": 0.0, "chain_count": 0, "chains": []}

    # 過濾低相似度的對齊
    valid = [(a, b, r) for a, b, r in aligned_pairs if r >= min_ratio]
    if not valid:
        return {"max_span_len": 0, "total_coverage": 0.0, "chain_count": 0, "chains": []}

    # 按 A 側索引排序
    valid.sort(key=lambda x: x[0])

    # 找連續對齊鏈：相鄰句對在 A 和 B 中都是相鄰（差值≤2）
    chains: List[List[Tuple[int, int, float]]] = []
    current_chain = [valid[0]]
    for i in range(1, len(valid)):
        prev_a, prev_b, _ = current_chain[-1]
        cur_a, cur_b, _ = valid[i]
        # A 側差 ≤2 且 B 側差 ≤2 且方向一致（B 也在遞增）
        if cur_a - prev_a <= 2 and 0 < cur_b - prev_b <= 2:
            current_chain.append(valid[i])
        else:
            if len(current_chain) >= 2:
                chains.append(current_chain)
            current_chain = [valid[i]]
    if len(current_chain) >= 2:
        chains.append(current_chain)

    # 計算覆蓋
    total_a_len = sum(len(s) for s in sents_a) or 1
    total_covered = 0
    max_span = 0
    chain_details = []
    for chain in chains:
        chain_chars = sum(len(sents_a[a]) for a, _, _ in chain)
        total_covered += chain_chars
        max_span = max(max_span, chain_chars)
        chain_details.append({
            "a_range": (chain[0][0], chain[-1][0]),
            "b_range": (chain[0][1], chain[-1][1]),
            "chars": chain_chars,
            "avg_ratio": sum(r for _, _, r in chain) / len(chain),
        })

    return {
        "max_span_len": max_span,
        "total_coverage": total_covered / total_a_len,
        "chain_count": len(chains),
        "chains": chain_details,
    }
