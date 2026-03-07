#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — Chinese Essay Analyzer
==============================================
All Chinese essay plagiarism analysis methods: sentence splitting,
sentence-level similarity (Hungarian matching), semantic embedding,
style fingerprinting, rare phrase overlap, opening/ending similarity.

All functions are standalone (no class, no self).

**Thread-safety note**: ``semantic_embedding_similarity`` uses a lazy-loaded
embedding model via ``llm.rag.vector_store.get_embedding()``. In a
multi-threaded runtime, callers must ensure the first invocation is
serialized (or the underlying ``get_embedding()`` is itself thread-safe).
This constraint is NOT enforced here; current dev environment is
single-threaded.

Dependencies: plagiarism_text_utils.
"""

import logging
import math
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Set, Tuple

from app.domains.assignment.plagiarism_text_utils import (
    aligned_span_coverage,
    ngram_jaccard,
    paragraph_structure_similarity,
    verbatim_ratio,
)

logger = logging.getLogger(__name__)


# ================================================================
# 句子切分
# ================================================================

def split_chinese_sentences(text: str) -> List[str]:
    """按中文句末標點切分句子。"""
    # 按句末標點切分，保留標點
    parts = re.split(r'([。！？；…\!\?])', text)
    sentences = []
    for i in range(0, len(parts) - 1, 2):
        sent = (parts[i] + parts[i + 1]).strip()
        if len(sent) >= 4:  # 過濾太短的片段
            sentences.append(sent)
    # 處理最後可能沒有標點的部分
    if len(parts) % 2 == 1 and parts[-1].strip() and len(parts[-1].strip()) >= 4:
        sentences.append(parts[-1].strip())
    return sentences if sentences else [text]


# ================================================================
# 句子級相似度
# ================================================================

def sentence_level_similarity(
    sents_a: List[str], sents_b: List[str],
) -> Tuple[float, List[Tuple[int, int, float]]]:
    """
    句子級相似度：雙向一對一匹配（匈牙利算法），避免多句借用同一最佳匹配導致虛高。

    Returns:
        (score, aligned_pairs)
        aligned_pairs = [(idx_a, idx_b, ratio), ...] 按 ratio 降序
    """
    from difflib import SequenceMatcher
    from scipy.optimize import linear_sum_assignment
    import numpy as np

    if not sents_a or not sents_b:
        return 0.0, []

    m, n = len(sents_a), len(sents_b)

    # 構建相似度矩陣
    sim_matrix = np.zeros((m, n))
    for i, sa in enumerate(sents_a):
        for j, sb in enumerate(sents_b):
            sim_matrix[i, j] = SequenceMatcher(None, sa, sb, autojunk=False).ratio()

    # 匈牙利算法做最優一對一匹配（最小化 cost = 1 - similarity）
    cost_matrix = 1.0 - sim_matrix
    # 處理非方陣：padding 到方陣
    max_dim = max(m, n)
    padded = np.ones((max_dim, max_dim))  # padding 用 cost=1 (sim=0)
    padded[:m, :n] = cost_matrix
    row_ind, col_ind = linear_sum_assignment(padded)

    # 提取有效對齊（排除 padding 行/列）
    aligned_pairs: List[Tuple[int, int, float]] = []
    for r, c in zip(row_ind, col_ind):
        if r < m and c < n:
            aligned_pairs.append((int(r), int(c), float(sim_matrix[r, c])))

    # 雙向加權平均
    weight_a = sum(len(sents_a[r]) for r, _, _ in aligned_pairs) or 1
    score_a = sum(ratio * len(sents_a[r]) for r, _, ratio in aligned_pairs) / weight_a

    weight_b = sum(len(sents_b[c]) for _, c, _ in aligned_pairs) or 1
    score_b = sum(ratio * len(sents_b[c]) for _, c, ratio in aligned_pairs) / weight_b

    score = (score_a + score_b) / 2 * 100

    # 按相似度降序排列
    aligned_pairs.sort(key=lambda x: x[2], reverse=True)

    return min(score, 100), aligned_pairs


# ================================================================
# 語義嵌入相似度
# ================================================================

def semantic_embedding_similarity(text_a: str, text_b: str) -> float:
    """
    用 text2vec-large-chinese 計算語義嵌入余弦相似度。
    能檢測套用和仿寫（語義相同但文字不同）。
    """
    try:
        from llm.rag.vector_store import get_embedding
        import numpy as np

        embedding_model = get_embedding()
        vec_a = np.array(embedding_model.embed_query(text_a))
        vec_b = np.array(embedding_model.embed_query(text_b))

        # 余弦相似度
        dot = np.dot(vec_a, vec_b)
        norm_a = np.linalg.norm(vec_a)
        norm_b = np.linalg.norm(vec_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        cosine_sim = dot / (norm_a * norm_b)
        return min(max(cosine_sim * 100, 0), 100)
    except Exception as e:
        logger.warning("語義嵌入相似度計算失敗: %s", e)
        # 降級：使用 N-gram 代替
        return ngram_jaccard(text_a, text_b, 3)


# ================================================================
# 風格指紋
# ================================================================

def style_fingerprint_similarity(
    raw_a: str, raw_b: str,
    sents_a: List[str], sents_b: List[str],
) -> float:
    """
    風格指紋相似度：比較平均句長、標點頻率分布、高頻字分布、
    關聯詞頻率、情感動詞頻率、四字成語密度、句式模式分布。

    特徵分層：base_style (32 維) + deep_style (22 維) = 54 維。
    所有新增特徵均按總字數/總句數歸一化。
    """
    from app.domains.assignment.plagiarism_constants import (
        CHINESE_CONNECTIVE_WORDS,
        CHINESE_EMOTIONAL_VERBS,
    )

    def _extract_base_features(text: str, sents: List[str]) -> List[float]:
        """原始 32 維基礎風格特徵。"""
        # 平均句長（1 維）
        avg_len = sum(len(s) for s in sents) / len(sents) if sents else 0
        # 標點頻率（11 維）
        punctuations = "，。！？、；：""''…—"
        total_chars = max(len(text), 1)
        punct_freq = [text.count(p) / total_chars for p in punctuations]
        # 高頻字 top-20 占比（20 維）
        char_counter = Counter(c for c in text if '\u4e00' <= c <= '\u9fff')
        total_han = max(sum(char_counter.values()), 1)
        top20 = [count / total_han for _, count in char_counter.most_common(20)]
        top20.extend([0.0] * (20 - len(top20)))

        return [avg_len / 100] + punct_freq + top20

    def _extract_deep_features(text: str, sents: List[str]) -> List[float]:
        """新增 22 維深層風格特徵（全部歸一化）。"""
        total_chars = max(len(text), 1)
        total_sents = max(len(sents), 1)

        # 1. 關聯詞頻率（10 維）— 按總字數歸一化
        connective_freq = [0.0] * len(CHINESE_CONNECTIVE_WORDS)
        for word, idx in CHINESE_CONNECTIVE_WORDS.items():
            connective_freq[idx] = text.count(word) / total_chars * 1000

        # 2. 情感動詞頻率（8 維）— 按總字數歸一化
        emotional_freq = [0.0] * len(CHINESE_EMOTIONAL_VERBS)
        for word, idx in CHINESE_EMOTIONAL_VERBS.items():
            emotional_freq[idx] = text.count(word) / total_chars * 1000

        # 3. 四字成語密度（1 維）— 按總字數歸一化
        # 啟發式：連續四個漢字且不包含常見虛詞的片段
        _COMMON_FUNCTION_WORDS = {"的", "了", "是", "在", "我", "他", "她", "有", "和", "不"}
        idiom_count = 0
        for i in range(len(text) - 3):
            four_chars = text[i:i + 4]
            if (all('\u4e00' <= c <= '\u9fff' for c in four_chars)
                    and not any(c in _COMMON_FUNCTION_WORDS for c in four_chars)):
                idiom_count += 1
        idiom_density = idiom_count / total_chars * 1000

        # 4. 句式模式分布（3 維）— 按總句數歸一化
        short_count = 0   # < 10 字
        medium_count = 0  # 10-25 字
        long_count = 0    # > 25 字
        for s in sents:
            slen = len(s)
            if slen < 10:
                short_count += 1
            elif slen <= 25:
                medium_count += 1
            else:
                long_count += 1
        sent_pattern = [
            short_count / total_sents,
            medium_count / total_sents,
            long_count / total_sents,
        ]

        return connective_freq + emotional_freq + [idiom_density] + sent_pattern

    base_a = _extract_base_features(raw_a, sents_a)
    base_b = _extract_base_features(raw_b, sents_b)
    deep_a = _extract_deep_features(raw_a, sents_a)
    deep_b = _extract_deep_features(raw_b, sents_b)

    features_a = base_a + deep_a
    features_b = base_b + deep_b

    # 余弦相似度
    dot = sum(a * b for a, b in zip(features_a, features_b))
    norm_a = math.sqrt(sum(a * a for a in features_a))
    norm_b = math.sqrt(sum(b * b for b in features_b))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return min(max(dot / (norm_a * norm_b) * 100, 0), 100)


# ================================================================
# 低頻短語重疊
# ================================================================

def _extract_chinese_ngrams(text: str, min_n: int, max_n: int) -> Counter:
    """提取含漢字的 n-gram 及其頻率。"""
    ngrams: Counter = Counter()
    for n in range(min_n, max_n + 1):
        for i in range(len(text) - n + 1):
            gram = text[i:i + n]
            if any('\u4e00' <= c <= '\u9fff' for c in gram):
                ngrams[gram] += 1
    return ngrams


def rare_phrase_overlap(
    text_a: str, text_b: str,
    n_range: Tuple[int, int] = (4, 8),
    batch_texts: Optional[List[str]] = None,
) -> Tuple[float, List[str]]:
    """
    低頻短語重疊率：提取 4-8 字 n-gram，只保留低頻（單篇出現≤2次）的交集。
    對"改幾個字但核心措辭沒變"很敏感。

    帶批次級 **連續加權** 抑制：高頻模板短語的覆蓋貢獻被乘以 weight（0.2-1.0），
    而非二元刪除。

    Returns:
        (overlap_score, shared_rare_phrases_top10)
    """
    from app.domains.assignment.plagiarism_constants import COHORT_MIN_BATCH_SIZE

    if not text_a or not text_b:
        return 0.0, []

    ngrams_a = _extract_chinese_ngrams(text_a, n_range[0], n_range[1])
    ngrams_b = _extract_chinese_ngrams(text_b, n_range[0], n_range[1])

    # 只保留低頻（在單篇中出現≤2次 = 非模板短語）
    rare_a = {g for g, c in ngrams_a.items() if c <= 2}
    rare_b = {g for g, c in ngrams_b.items() if c <= 2}

    shared = rare_a & rare_b
    if not shared:
        return 0.0, []

    # --- 連續加權（非二元過濾）---
    # 兩層降權：第 1 層模板詞表（不依賴 batch），第 2 層 batch DF
    from app.domains.assignment.plagiarism_constants import (
        CHINESE_TEMPLATE_PHRASES,
        TEMPLATE_PHRASE_DEFAULT_WEIGHT,
    )

    gram_weights: Dict[str, float] = {}
    for g in shared:
        w = 1.0
        # 第 1 層：模板詞表降權（不依賴 batch）
        if g in CHINESE_TEMPLATE_PHRASES:
            w = min(w, TEMPLATE_PHRASE_DEFAULT_WEIGHT)
        gram_weights[g] = w

    if batch_texts and len(batch_texts) >= COHORT_MIN_BATCH_SIZE:
        all_ngram_sets = []
        for bt in batch_texts:
            bt_ngrams = _extract_chinese_ngrams(bt, n_range[0], n_range[1])
            all_ngram_sets.append(set(bt_ngrams.keys()))
        total_docs = len(all_ngram_sets)
        for gram in shared:
            doc_freq = sum(1 for s in all_ngram_sets if gram in s)
            df_ratio = doc_freq / total_docs
            df_weight = max(0.2, 1.0 - df_ratio)
            # 第 2 層：batch DF 降權（取兩層中更低的）
            gram_weights[gram] = min(gram_weights[gram], df_weight)

    # --- 加權覆蓋計算 ---
    shared_sorted = sorted(shared, key=len, reverse=True)
    weighted_covered_chars = 0.0
    covered: set = set()
    selected_phrases: List[str] = []
    for phrase in shared_sorted:
        w = gram_weights[phrase]
        start = 0
        while True:
            pos = text_a.find(phrase, start)
            if pos == -1:
                break
            new_positions = set(range(pos, pos + len(phrase)))
            if not new_positions.issubset(covered):
                uncovered_new = new_positions - covered
                weighted_covered_chars += len(uncovered_new) * w
                covered.update(new_positions)
                if phrase not in selected_phrases:
                    selected_phrases.append(phrase)
            start = pos + 1

    shorter_len = max(min(len(text_a), len(text_b)), 1)
    score = min(weighted_covered_chars / shorter_len * 100, 100)
    return score, selected_phrases[:10]


# ================================================================
# 開頭/結尾相似度
# ================================================================

def opening_ending_similarity(
    raw_a: str, raw_b: str, head: bool = True, window: int = 120,
) -> float:
    """
    開頭/結尾相似度：取前/後 window 字，用 SequenceMatcher 比較。
    """
    from difflib import SequenceMatcher
    if head:
        seg_a = raw_a[:window].strip()
        seg_b = raw_b[:window].strip()
    else:
        seg_a = raw_a[-window:].strip()
        seg_b = raw_b[-window:].strip()

    if not seg_a or not seg_b:
        return 0.0
    return SequenceMatcher(None, seg_a, seg_b, autojunk=False).ratio() * 100


# ================================================================
# 功能段落結構分析
# ================================================================

# --- 文體關鍵詞 ---
_NARRATIVE_KEYWORDS = [
    "记得", "那天", "有一次", "突然", "后来", "当时", "那时",
    "渐渐", "终于", "不禁", "回想", "从前", "那年", "小时候",
    "某天", "一天", "曾经", "往事", "那一刻", "忽然",
    "原来", "没想到", "回忆", "转身", "望着", "抬头",
]
_ARGUMENTATIVE_KEYWORDS = [
    "我认为", "应该", "因此", "总之", "例如", "比如",
    "然而", "首先", "其次", "最后", "论述", "观点",
    "综上所述", "不可否认", "可见", "由此可见",
    "一方面", "另一方面", "论点", "论据", "反驳",
    "换言之", "不仅如此", "毋庸置疑",
]

# --- 段落功能關鍵詞（P1-A 加深版）---
_NARRATIVE_OPENING_KW = [
    "记得", "那天", "有一次", "小时候", "那年", "曾经", "从前",
    "在我的记忆中", "往事如烟", "回想起", "那是一个", "岁月",
    "时光", "童年", "少年时", "印象最深",
]
_NARRATIVE_EVENT_KW = [
    "然后", "接着", "后来", "于是", "渐渐", "一边", "正在",
    "这时", "当时", "那时候", "过了一会", "紧接着", "随后",
    "与此同时", "就在", "不一会儿",
]
_NARRATIVE_TURNING_KW = [
    "突然", "没想到", "然而", "却", "忽然", "意外", "出乎意料",
    "万万没想到", "谁知", "不料", "可是", "哪知道", "偏偏",
    "就在这时", "转折", "峰回路转",
]
_NARRATIVE_REFLECTION_KW = [
    "让我明白", "从此以后", "使我懂得", "感悟", "深刻", "明白了", "领悟",
    "这件事教会", "我终于理解", "经历告诉我", "从那以后",
    "这次经历", "心中", "铭记", "永远不会忘记", "至今难忘",
]

_ARGUMENT_ARGUMENT_KW = [
    "我认为", "我觉得", "应该", "必须", "不应该", "观点",
    "我的看法", "毫无疑问", "显而易见", "不言而喻",
    "毋庸置疑", "我坚信", "我主张",
]
_ARGUMENT_EXAMPLE_KW = [
    "比如", "例如", "有一个", "就拿", "曾经有", "举例",
    "正如", "据统计", "有这样一个", "以…为例",
    "典型的例子", "事实上", "数据显示",
]
_ARGUMENT_COUNTER_KW = [
    "有人说", "虽然", "尽管", "诚然", "固然", "不可否认",
    "有人认为", "反对者", "有人可能会说", "也许有人觉得",
    "当然", "固然如此",
]
_ARGUMENT_CONCLUSION_KW = [
    "总之", "综上所述", "因此", "所以", "总而言之", "由此可见",
    "归根结底", "一言以蔽之", "概而言之", "最终",
    "我们应该", "让我们",
]


def detect_essay_type(text: str) -> Tuple[str, float]:
    """
    自動檢測文體類型。

    Returns:
        (essay_type, confidence)
        - essay_type: "narrative" / "argumentative"
        - confidence: 0.0-1.0，低於 0.5 表示不確定（默認回退 narrative）
    """
    total_chars = max(len(text), 1)
    narrative_hits = sum(text.count(kw) for kw in _NARRATIVE_KEYWORDS)
    argumentative_hits = sum(text.count(kw) for kw in _ARGUMENTATIVE_KEYWORDS)

    # 按字數歸一化
    narr_density = narrative_hits / total_chars * 1000
    arg_density = argumentative_hits / total_chars * 1000

    total_density = narr_density + arg_density
    if total_density < 0.5:
        # 關鍵詞太少，無法判斷
        return "narrative", 0.3

    if arg_density > narr_density * 1.5:
        confidence = min(arg_density / (total_density + 0.01), 1.0)
        return "argumentative", max(confidence, 0.5)
    elif narr_density > arg_density * 1.5:
        confidence = min(narr_density / (total_density + 0.01), 1.0)
        return "narrative", max(confidence, 0.5)
    else:
        # 兩者密度差不大，不確定
        return "narrative", 0.4


def classify_paragraph_function(
    paragraph: str, position: int, total_paras: int,
    essay_type: str = "narrative",
) -> str:
    """
    分類段落的功能角色。

    叙事文: opening / event / turning_point / reflection / other
    議論文: argument / example / counter / conclusion / other
    """
    text = paragraph.strip()
    if not text:
        return "other"

    is_first = (position == 0)
    is_last = (position == total_paras - 1)

    if essay_type == "narrative":
        # 首段偏好 opening
        if is_first and any(kw in text for kw in _NARRATIVE_OPENING_KW):
            return "opening"
        # 末段偏好 reflection
        if is_last and any(kw in text for kw in _NARRATIVE_REFLECTION_KW):
            return "reflection"
        # 轉折
        if any(kw in text for kw in _NARRATIVE_TURNING_KW):
            return "turning_point"
        # 敘事
        if any(kw in text for kw in _NARRATIVE_EVENT_KW):
            return "event"
        # 首段無關鍵詞也歸 opening
        if is_first:
            return "opening"
        # 末段無關鍵詞也歸 reflection
        if is_last:
            return "reflection"
        return "event"
    else:  # argumentative
        if is_first and any(kw in text for kw in _ARGUMENT_ARGUMENT_KW):
            return "argument"
        if is_last and any(kw in text for kw in _ARGUMENT_CONCLUSION_KW):
            return "conclusion"
        if any(kw in text for kw in _ARGUMENT_COUNTER_KW):
            return "counter"
        if any(kw in text for kw in _ARGUMENT_EXAMPLE_KW):
            return "example"
        if is_first:
            return "argument"
        if is_last:
            return "conclusion"
        return "example"


def functional_structure_similarity(
    raw_a: str, raw_b: str,
) -> Tuple[float, Dict[str, Any]]:
    """
    功能段落結構相似度（0-100）。

    步驟：
    1. detect_essay_type() 判定文體 + 置信度
    2. classify_paragraph_function() 對每段分類
    3. 比較功能序列相似度（SequenceMatcher）
    4. 比較功能段內的長度比例相似度
    5. 融合：序列相似度 * 0.6 + 長度比例 * 0.4
    6. 可靠性修正（4 層 dampening）
    """
    from difflib import SequenceMatcher as SM

    def _get_paragraphs(text: str) -> List[str]:
        paras = [p.strip() for p in re.split(r'\n\s*\n|\n', text) if p.strip()]
        return paras if paras else [text]

    paras_a = _get_paragraphs(raw_a)
    paras_b = _get_paragraphs(raw_b)

    essay_type_a, confidence_a = detect_essay_type(raw_a)
    essay_type_b, confidence_b = detect_essay_type(raw_b)

    # 分類每段的功能角色
    func_seq_a = [
        classify_paragraph_function(p, i, len(paras_a), essay_type_a)
        for i, p in enumerate(paras_a)
    ]
    func_seq_b = [
        classify_paragraph_function(p, i, len(paras_b), essay_type_b)
        for i, p in enumerate(paras_b)
    ]

    # 功能序列相似度
    seq_sim = SM(None, func_seq_a, func_seq_b).ratio()

    # 功能段長度比例相似度
    def _length_ratios(paras: List[str]) -> List[float]:
        total = max(sum(len(p) for p in paras), 1)
        return [len(p) / total for p in paras]

    ratios_a = _length_ratios(paras_a)
    ratios_b = _length_ratios(paras_b)

    if len(ratios_a) == len(ratios_b):
        diff = sum(abs(a - b) for a, b in zip(ratios_a, ratios_b))
        max_diff = max(sum(ratios_a), sum(ratios_b), 0.01)
        ratio_sim = max(1 - diff / max_diff, 0)
    else:
        shorter, longer = (ratios_a, ratios_b) if len(ratios_a) <= len(ratios_b) else (ratios_b, ratios_a)
        if not shorter:
            ratio_sim = 0.0
        else:
            best_diff = float('inf')
            for start in range(max(len(longer) - len(shorter) + 1, 1)):
                diff = sum(abs(shorter[i] - longer[start + i]) for i in range(len(shorter)))
                best_diff = min(best_diff, diff)
            max_diff = max(sum(longer), 0.01)
            ratio_sim = max(1 - best_diff / max_diff, 0)

    raw_score = (seq_sim * 0.6 + ratio_sim * 0.4) * 100

    # --- 可靠性修正（4 層 dampening）---
    dampening = 1.0
    if min(len(paras_a), len(paras_b)) < 3:
        dampening *= 0.6      # 段落太少
    if min(len(raw_a), len(raw_b)) < 200:
        dampening *= 0.6      # 內容太短
    if min(confidence_a, confidence_b) < 0.5:
        dampening *= 0.7      # 文體回退
    if essay_type_a != essay_type_b:
        dampening *= 0.7      # 文體不一致

    score = min(raw_score * dampening, 100)

    info = {
        "essay_type_a": essay_type_a,
        "essay_type_b": essay_type_b,
        "confidence_a": round(confidence_a, 2),
        "confidence_b": round(confidence_b, 2),
        "func_seq_a": func_seq_a,
        "func_seq_b": func_seq_b,
    }
    return score, info


# ================================================================
# 同批次公共模式降權（Cohort Suppression）
# ================================================================

def compute_chinese_cohort_suppression(
    raw_a: str, raw_b: str,
    batch_texts: List[str],
) -> Dict[str, Any]:
    """
    中文作文批次抑制因子。

    rare_phrase: 在 rare_phrase_overlap() 內部已用連續加權處理。
    此函數計算 rare_phrase 的統計字段 + opening/ending 抑制因子。

    opening/ending 抑制方案：提取 batch 中所有文本開頭/結尾的
    高頻 4-8 字短語（模板片段 DF），看當前 pair 的 opening/ending
    共享 n-grams 中有多少是高頻模板覆蓋。模板覆蓋高則壓低。

    Returns:
        {
            "rare_phrase_avg_weight": float,
            "rare_phrase_suppressed_count": int,
            "rare_phrase_total_shared": int,
            "opening_suppression": float,
            "ending_suppression": float,
            "suppressed_patterns": List[str],
            "cohort_size": int,
        }
    """
    from app.domains.assignment.plagiarism_constants import COHORT_MIN_BATCH_SIZE

    result: Dict[str, Any] = {
        "rare_phrase_avg_weight": 1.0,
        "rare_phrase_suppressed_count": 0,
        "rare_phrase_total_shared": 0,
        "opening_suppression": 1.0,
        "ending_suppression": 1.0,
        "suppressed_patterns": [],
        "cohort_size": len(batch_texts),
    }

    if len(batch_texts) < COHORT_MIN_BATCH_SIZE:
        return result

    # --- rare_phrase 統計（實際抑制已在 rare_phrase_overlap 內完成）---
    ngrams_a = _extract_chinese_ngrams(raw_a, 4, 8)
    ngrams_b = _extract_chinese_ngrams(raw_b, 4, 8)
    rare_a = {g for g, c in ngrams_a.items() if c <= 2}
    rare_b = {g for g, c in ngrams_b.items() if c <= 2}
    shared_rare = rare_a & rare_b

    if shared_rare:
        all_ngram_sets = []
        for bt in batch_texts:
            bt_ngrams = _extract_chinese_ngrams(bt, 4, 8)
            all_ngram_sets.append(set(bt_ngrams.keys()))
        total_docs = len(all_ngram_sets)

        weights = []
        suppressed_count = 0
        for gram in shared_rare:
            doc_freq = sum(1 for s in all_ngram_sets if gram in s)
            df_ratio = doc_freq / total_docs
            w = max(0.2, 1.0 - df_ratio)
            weights.append(w)
            if w < 0.5:
                suppressed_count += 1
        result["rare_phrase_avg_weight"] = round(
            sum(weights) / len(weights), 3
        ) if weights else 1.0
        result["rare_phrase_suppressed_count"] = suppressed_count
        result["rare_phrase_total_shared"] = len(shared_rare)

        # --- opening/ending 抑制（模板片段 DF）---
        window = 120
        # 提取 batch 中所有 opening/ending n-grams
        opening_ngram_sets: List[Set[str]] = []
        ending_ngram_sets: List[Set[str]] = []
        for bt in batch_texts:
            op_text = bt[:window].strip()
            ed_text = bt[-window:].strip()
            op_ngrams = _extract_chinese_ngrams(op_text, 4, 8)
            ed_ngrams = _extract_chinese_ngrams(ed_text, 4, 8)
            opening_ngram_sets.append(set(op_ngrams.keys()))
            ending_ngram_sets.append(set(ed_ngrams.keys()))

        def _compute_boundary_suppression(
            seg_a: str, seg_b: str,
            batch_ngram_sets: List[Set[str]],
        ) -> Tuple[float, List[str]]:
            """計算 opening 或 ending 的抑制因子。"""
            seg_a_ngrams = set(_extract_chinese_ngrams(seg_a, 4, 8).keys())
            seg_b_ngrams = set(_extract_chinese_ngrams(seg_b, 4, 8).keys())
            pair_shared = seg_a_ngrams & seg_b_ngrams
            if not pair_shared:
                return 1.0, []
            total_d = len(batch_ngram_sets)
            template_count = 0
            template_patterns = []
            for gram in pair_shared:
                doc_freq = sum(1 for s in batch_ngram_sets if gram in s)
                df_ratio = doc_freq / total_d
                if df_ratio > 0.4:
                    template_count += 1
                    if len(template_patterns) < 5:
                        template_patterns.append(gram)
            template_ratio = template_count / len(pair_shared)
            if template_ratio > 0.6:
                suppression = max(0.3, 0.7 - template_ratio * 0.5)
            elif template_ratio > 0.3:
                suppression = max(0.5, 1.0 - template_ratio * 0.8)
            else:
                suppression = 1.0
            return suppression, template_patterns

        op_a = raw_a[:window].strip()
        op_b = raw_b[:window].strip()
        ed_a = raw_a[-window:].strip()
        ed_b = raw_b[-window:].strip()

        op_supp, op_patterns = _compute_boundary_suppression(
            op_a, op_b, opening_ngram_sets,
        )
        ed_supp, ed_patterns = _compute_boundary_suppression(
            ed_a, ed_b, ending_ngram_sets,
        )
        result["opening_suppression"] = round(op_supp, 3)
        result["ending_suppression"] = round(ed_supp, 3)
        result["suppressed_patterns"] = op_patterns + ed_patterns
    else:
        # 即使沒有共享 rare_phrase，仍嘗試 opening/ending 抑制
        window = 120
        opening_ngram_sets_2: List[Set[str]] = []
        ending_ngram_sets_2: List[Set[str]] = []
        for bt in batch_texts:
            op_ngrams = _extract_chinese_ngrams(bt[:window].strip(), 4, 8)
            ed_ngrams = _extract_chinese_ngrams(bt[-window:].strip(), 4, 8)
            opening_ngram_sets_2.append(set(op_ngrams.keys()))
            ending_ngram_sets_2.append(set(ed_ngrams.keys()))

        def _boundary_supp_simple(
            seg_a: str, seg_b: str,
            batch_sets: List[Set[str]],
        ) -> float:
            seg_a_ng = set(_extract_chinese_ngrams(seg_a, 4, 8).keys())
            seg_b_ng = set(_extract_chinese_ngrams(seg_b, 4, 8).keys())
            pair_shared_2 = seg_a_ng & seg_b_ng
            if not pair_shared_2:
                return 1.0
            total_d = len(batch_sets)
            template_count_2 = 0
            for gram in pair_shared_2:
                doc_freq = sum(1 for s in batch_sets if gram in s)
                if doc_freq / total_d > 0.4:
                    template_count_2 += 1
            t_ratio = template_count_2 / len(pair_shared_2)
            if t_ratio > 0.6:
                return max(0.3, 0.7 - t_ratio * 0.5)
            elif t_ratio > 0.3:
                return max(0.5, 1.0 - t_ratio * 0.8)
            return 1.0

        result["opening_suppression"] = round(
            _boundary_supp_simple(
                raw_a[:window].strip(), raw_b[:window].strip(),
                opening_ngram_sets_2,
            ), 3
        )
        result["ending_suppression"] = round(
            _boundary_supp_simple(
                raw_a[-window:].strip(), raw_b[-window:].strip(),
                ending_ngram_sets_2,
            ), 3
        )

    return result


# ================================================================
# 句子對齊鏈連續度
# ================================================================

def sentence_chain_continuity(
    sents_a: List[str], sents_b: List[str],
    aligned_pairs: List[Tuple[int, int, float]],
    min_ratio: float = 0.35,
) -> Tuple[float, int, int]:
    """
    句子對齊鏈連續度。

    找出 A 和 B 中索引都遞增且連續（或跳躍 ≤ 2）的對齊鏈，
    檢測「整段順序一致」的抄袭模式。

    Returns:
        (chain_score 0-100, chain_count, max_chain_length)
    """
    if not aligned_pairs or not sents_a or not sents_b:
        return 0.0, 0, 0

    # 過濾低相似度的對齊
    valid_pairs = [(a, b, r) for a, b, r in aligned_pairs if r >= min_ratio]
    if not valid_pairs:
        return 0.0, 0, 0

    # 按 A 索引排序
    valid_pairs.sort(key=lambda x: x[0])

    # 找連續鏈（A 和 B 都遞增，跳躍 ≤ 2）
    chains: List[List[Tuple[int, int, float]]] = []
    current_chain: List[Tuple[int, int, float]] = [valid_pairs[0]]

    for i in range(1, len(valid_pairs)):
        prev_a, prev_b, _ = current_chain[-1]
        curr_a, curr_b, curr_r = valid_pairs[i]

        # A 和 B 都遞增，且跳躍 ≤ 2
        if (curr_a > prev_a and curr_b > prev_b
                and curr_a - prev_a <= 3 and curr_b - prev_b <= 3):
            current_chain.append(valid_pairs[i])
        else:
            if len(current_chain) >= 2:
                chains.append(current_chain)
            current_chain = [valid_pairs[i]]

    if len(current_chain) >= 2:
        chains.append(current_chain)

    if not chains:
        return 0.0, 0, 0

    chain_count = len(chains)
    max_chain_len = max(len(c) for c in chains)

    # 計算鏈覆蓋的句子比例
    chained_sents_a: Set[int] = set()
    chained_sents_b: Set[int] = set()
    for chain in chains:
        for a, b, _ in chain:
            chained_sents_a.add(a)
            chained_sents_b.add(b)

    coverage_a = len(chained_sents_a) / max(len(sents_a), 1)
    coverage_b = len(chained_sents_b) / max(len(sents_b), 1)
    coverage = (coverage_a + coverage_b) / 2

    # 分數 = 覆蓋率 * 100，加上鏈長 bonus
    chain_len_bonus = min((max_chain_len - 2) * 10, 30) if max_chain_len > 2 else 0
    score = min(coverage * 100 + chain_len_bonus, 100)

    return round(score, 1), chain_count, max_chain_len


# ================================================================
# Soft Evidence Score（Sigmoid 平滑）
# ================================================================

# 維度差異化權重
_SOFT_EVIDENCE_WEIGHTS: Dict[str, float] = {
    "verbatim": 1.5,
    "comment": 1.5,
    "rare_phrase": 1.2,
    "identifier": 1.0,
    "structure": 0.6,
    "indent": 0.6,
    "boundary": 0.5,
}

_SIGMOID_MIDPOINT = 55.0
_SIGMOID_K = 0.12


def compute_soft_evidence_score(
    dimension_scores: Dict[str, float],
    opening_sim: float,
    ending_sim: float,
) -> Tuple[float, int, str, Dict[str, float]]:
    """
    Sigmoid 平滑 + 維度差異化權重的證據分。

    opening/ending 合併為 "boundary" 維度（max）。
    total_dims = 7。

    Returns:
        (evidence_score, effective_hits_count, signal_text, detail_dict)
    """
    # 合併 opening/ending 為 boundary
    boundary_score = max(opening_sim, ending_sim)
    all_scores = dict(dimension_scores)
    all_scores["boundary"] = boundary_score

    total_dims = len(all_scores)  # 7

    detail: Dict[str, float] = {}
    weighted_sum = 0.0
    total_weight = 0.0
    effective_hits = 0

    for dim_name, score in all_scores.items():
        w = _SOFT_EVIDENCE_WEIGHTS.get(dim_name, 1.0)
        # Sigmoid contribution
        exponent = -_SIGMOID_K * (score - _SIGMOID_MIDPOINT)
        # 防止溢位
        if exponent > 50:
            contrib = 0.0
        elif exponent < -50:
            contrib = 1.0
        else:
            contrib = 1.0 / (1.0 + math.exp(exponent))

        detail[dim_name] = round(contrib, 3)
        weighted_sum += contrib * w
        total_weight += w
        if contrib > 0.5:
            effective_hits += 1

    if total_weight == 0:
        return 0.0, 0, "", detail

    # 歸一化到 0-100
    evidence_score = min(weighted_sum / total_weight * 100, 100)

    # Signal
    if effective_hits >= 4:
        signal = f"Soft 多重證據: {effective_hits}/{total_dims} 個維度顯著命中（sigmoid 平滑）"
    elif effective_hits >= 2:
        signal = f"Soft 證據: {effective_hits}/{total_dims} 個維度部分命中"
    elif effective_hits >= 1:
        signal = f"Soft 證據: 僅 {effective_hits} 個維度命中，證據較弱"
    else:
        signal = ""

    return round(evidence_score, 1), effective_hits, signal, detail


# ================================================================
# 片段級證據輸出
# ================================================================

def extract_chinese_evidence_blocks(
    raw_a: str, raw_b: str,
    sents_a: List[str], sents_b: List[str],
    aligned_pairs: List[Tuple[int, int, float]],
    shared_rare_phrases: List[str],
    opening_sim: float,
    ending_sim: float,
    span_info: Dict[str, Any],
) -> List[Dict[str, Any]]:
    """
    提取中文作文片段級證據，供老師查看。

    Evidence block types (按強度優先級排序):
    1. "shared_rare_phrase" (strong)
    2. "high_sim_sentence_pair" ratio >= 0.85 (strong)
    3. "high_sim_sentence_pair" ratio >= 0.7 (medium)
    4. "similar_opening" / "similar_ending" (medium)
    5. "alignment_chain" (weak)

    約束：最多 10 個 blocks，跨類型去重，snippet 截斷 200 字符。
    """
    from app.domains.assignment.plagiarism_constants import (
        MAX_EVIDENCE_BLOCKS,
        EVIDENCE_SNIPPET_MAX_CHARS,
    )

    blocks: List[Dict[str, Any]] = []
    # 記錄已用於 evidence 的句子索引（避免跨類型重複）
    used_sent_indices_a: Set[int] = set()
    used_sent_indices_b: Set[int] = set()
    used_snippets: Set[str] = set()

    def _truncate(s: str) -> str:
        if len(s) > EVIDENCE_SNIPPET_MAX_CHARS:
            return s[:EVIDENCE_SNIPPET_MAX_CHARS] + "..."
        return s

    def _snippet_key(snippet: str) -> str:
        """用於去重的 key：取前 50 字符。"""
        return snippet[:50]

    # --- 1. Shared rare phrases (strong) ---
    for phrase in shared_rare_phrases[:5]:
        if len(blocks) >= MAX_EVIDENCE_BLOCKS:
            break
        # 在原文中找上下文
        pos_a = raw_a.find(phrase)
        pos_b = raw_b.find(phrase)
        ctx_a = raw_a[max(0, pos_a - 20):pos_a + len(phrase) + 20] if pos_a >= 0 else phrase
        ctx_b = raw_b[max(0, pos_b - 20):pos_b + len(phrase) + 20] if pos_b >= 0 else phrase
        key = _snippet_key(phrase)
        if key in used_snippets:
            continue
        used_snippets.add(key)
        blocks.append({
            "type": "shared_rare_phrase",
            "description": f"共享罕見短語: \"{_truncate(phrase)}\"",
            "snippet_a": _truncate(ctx_a),
            "snippet_b": _truncate(ctx_b),
            "strength": "strong",
            "rank": 0,  # 排後面再填
        })

    # --- 2. High similarity sentence pairs (strong/medium) ---
    for idx_a, idx_b, ratio in aligned_pairs:
        if len(blocks) >= MAX_EVIDENCE_BLOCKS:
            break
        if ratio < 0.7:
            continue
        if idx_a in used_sent_indices_a or idx_b in used_sent_indices_b:
            continue
        sent_a = sents_a[idx_a] if idx_a < len(sents_a) else ""
        sent_b = sents_b[idx_b] if idx_b < len(sents_b) else ""
        key = _snippet_key(sent_a)
        if key in used_snippets:
            continue
        used_snippets.add(key)
        used_sent_indices_a.add(idx_a)
        used_sent_indices_b.add(idx_b)
        strength = "strong" if ratio >= 0.85 else "medium"
        blocks.append({
            "type": "high_sim_sentence_pair",
            "description": f"高相似句子對（{ratio:.0%}匹配）",
            "snippet_a": _truncate(sent_a),
            "snippet_b": _truncate(sent_b),
            "strength": strength,
            "rank": 0,
        })

    # --- 3. Similar opening/ending (medium) ---
    if opening_sim > 50 and len(blocks) < MAX_EVIDENCE_BLOCKS:
        op_a = _truncate(raw_a[:120].strip())
        op_b = _truncate(raw_b[:120].strip())
        key = _snippet_key(op_a)
        if key not in used_snippets:
            used_snippets.add(key)
            blocks.append({
                "type": "similar_opening",
                "description": f"相似開頭（{opening_sim:.0f}%匹配）",
                "snippet_a": op_a,
                "snippet_b": op_b,
                "strength": "medium",
                "rank": 0,
            })

    if ending_sim > 50 and len(blocks) < MAX_EVIDENCE_BLOCKS:
        ed_a = _truncate(raw_a[-120:].strip())
        ed_b = _truncate(raw_b[-120:].strip())
        key = _snippet_key(ed_a)
        if key not in used_snippets:
            used_snippets.add(key)
            blocks.append({
                "type": "similar_ending",
                "description": f"相似結尾（{ending_sim:.0f}%匹配）",
                "snippet_a": ed_a,
                "snippet_b": ed_b,
                "strength": "medium",
                "rank": 0,
            })

    # --- 4. Alignment chains (weak) ---
    if span_info.get("chain_count", 0) > 0 and len(blocks) < MAX_EVIDENCE_BLOCKS:
        chain_count = span_info.get("chain_count", 0)
        max_len = span_info.get("max_chain_length", 0)
        coverage = span_info.get("total_coverage", 0)
        blocks.append({
            "type": "alignment_chain",
            "description": (
                f"連續對齊鏈: {chain_count} 條鏈，"
                f"最長 {max_len} 句，覆蓋 {coverage:.0%}"
            ),
            "snippet_a": "",
            "snippet_b": "",
            "strength": "weak",
            "rank": 0,
        })

    # --- 排序 + 分配 rank ---
    strength_order = {"strong": 0, "medium": 1, "weak": 2}
    blocks.sort(key=lambda b: strength_order.get(b["strength"], 3))
    for i, block in enumerate(blocks[:MAX_EVIDENCE_BLOCKS]):
        block["rank"] = i + 1

    return blocks[:MAX_EVIDENCE_BLOCKS]


# ================================================================
# 編排函數
# ================================================================

def compute_chinese_essay_similarity(
    clean_a: str,
    clean_b: str,
    raw_a: str,
    raw_b: str,
    n: int,
    batch_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    中文作文多維度相似度分析（P0 升級版）。

    Returns unified dict per the schema spec.
    """
    signals: List[str] = []

    # 1. 逐字重疊率 (verbatim) + 低頻短語重疊（帶批次連續加權）
    raw_verbatim = verbatim_ratio(clean_a, clean_b)
    rare_overlap_score, shared_rare = rare_phrase_overlap(
        clean_a, clean_b, batch_texts=batch_texts,
    )
    # 融合：原始 verbatim 60% + 低頻短語 40%
    verbatim_score = raw_verbatim * 0.6 + rare_overlap_score * 0.4

    if verbatim_score > 80:
        signals.append(f"逐字重疊極高({verbatim_score:.0f}%，含低頻短語)，疑似直接抄襲")
    elif verbatim_score > 50:
        signals.append(f"逐字重疊較高({verbatim_score:.0f}%)，部分段落可能直接複製")
    if rare_overlap_score > 30 and raw_verbatim < 50:
        signals.append(f"低頻短語重疊({rare_overlap_score:.0f}%)但整體逐字率低，核心措辭未改")

    # 2. 句子級相似度 (comment) — 雙向一對一匹配
    sents_a = split_chinese_sentences(raw_a)
    sents_b = split_chinese_sentences(raw_b)
    sentence_score, aligned_pairs = sentence_level_similarity(sents_a, sents_b)

    # 3. 對齊鏈覆蓋率（_span_coverage 保留供解釋）
    span_info = aligned_span_coverage(sents_a, sents_b, aligned_pairs)

    # P1-B: 句子對齊鏈連續度（替代原 coverage_bonus）
    chain_score, chain_count, max_chain_len = sentence_chain_continuity(
        sents_a, sents_b, aligned_pairs,
    )
    comment_score = min(sentence_score * 0.75 + chain_score * 0.25, 100)
    if chain_score > 30:
        signals.append(
            f"句子對齊鏈: {chain_count} 條連續鏈，最長 {max_chain_len} 句"
            f"（鏈分={chain_score:.0f}）"
        )

    if comment_score > 60 and verbatim_score < 60:
        signals.append(f"句子級相似度高({comment_score:.0f}%)但逐字重疊較低，疑似套用改寫")

    # 4. 段落結構相似度 (structure) — 功能段落 + 舊長度結構融合
    func_struct_score, func_struct_info = functional_structure_similarity(raw_a, raw_b)
    old_para_sim = paragraph_structure_similarity(raw_a, raw_b)
    structure_score = func_struct_score * 0.70 + old_para_sim * 0.30

    # P1-A: 功能段落結構 signal
    if func_struct_score > 70:
        type_a = func_struct_info["essay_type_a"]
        type_b = func_struct_info["essay_type_b"]
        seq_a = func_struct_info["func_seq_a"]
        seq_b = func_struct_info["func_seq_b"]
        if type_a == type_b and seq_a == seq_b:
            signals.append(
                f"功能段落序列完全一致（{type_a}）: {' → '.join(seq_a)}"
            )
        elif type_a == type_b:
            signals.append(
                f"同為{type_a}文，功能段落結構高度相似({func_struct_score:.0f}%)"
            )

    # 5. 語義嵌入相似度 (identifier)
    semantic_score = semantic_embedding_similarity(clean_a, clean_b)
    if semantic_score > 70 and verbatim_score < 40:
        signals.append(f"語義相似度高({semantic_score:.0f}%)但文字不同，疑似深度改寫")

    # 6. 風格指紋相似度 (indent)
    style_score = style_fingerprint_similarity(raw_a, raw_b, sents_a, sents_b)

    # 7. 開頭 / 結尾相似度
    opening_sim = opening_ending_similarity(raw_a, raw_b, head=True)
    ending_sim = opening_ending_similarity(raw_a, raw_b, head=False)

    # 8. Cohort suppression（opening/ending 模板片段 DF 降權）
    cohort: Dict[str, Any] = {
        "rare_phrase_avg_weight": 1.0,
        "rare_phrase_suppressed_count": 0,
        "rare_phrase_total_shared": 0,
        "opening_suppression": 1.0,
        "ending_suppression": 1.0,
        "suppressed_patterns": [],
        "cohort_size": 0,
    }
    if batch_texts and len(batch_texts) >= 3:
        cohort = compute_chinese_cohort_suppression(raw_a, raw_b, batch_texts)
        opening_sim *= cohort["opening_suppression"]
        ending_sim *= cohort["ending_suppression"]
        if cohort["suppressed_patterns"]:
            signals.append(
                f"同批次模板降權: {len(cohort['suppressed_patterns'])} 個開頭/結尾模板被抑制"
            )

    if opening_sim > 70:
        signals.append(f"開頭高度相似({opening_sim:.0f}%)，學生互抄常從開頭入手")
    if ending_sim > 70:
        signals.append(f"結尾高度相似({ending_sim:.0f}%)，感悟段可能套用")

    # 綜合信號
    if verbatim_score > 80 and comment_score > 70:
        signals.append("多維度同時命中：高度疑似直接抄襲")
    elif comment_score > 60 and semantic_score > 60 and verbatim_score < 50:
        signals.append("語義和句子結構相似但文字不同：疑似套用改寫")
    elif structure_score > 70 and semantic_score > 50 and verbatim_score < 30:
        signals.append("結構相似但內容不同：可能為仿寫")

    # 9. Soft evidence score（rare_phrase 獨立維度）
    soft_ev_dims = {
        "verbatim": raw_verbatim,
        "comment": comment_score,
        "identifier": semantic_score,
        "structure": structure_score,
        "indent": style_score,
        "rare_phrase": rare_overlap_score,
    }
    soft_ev_score, soft_ev_hits, soft_ev_signal, soft_ev_detail = (
        compute_soft_evidence_score(soft_ev_dims, opening_sim, ending_sim)
    )

    # 10. 片段級證據輸出
    evidence_blocks = extract_chinese_evidence_blocks(
        raw_a, raw_b, sents_a, sents_b, aligned_pairs,
        shared_rare, opening_sim, ending_sim, span_info,
    )

    return {
        "structure_score": min(structure_score, 100),
        "identifier_score": min(semantic_score, 100),
        "verbatim_score": min(verbatim_score, 100),
        "indent_score": min(style_score, 100),
        "comment_score": min(comment_score, 100),
        "signals": signals,
        # 中間產物
        "_aligned_pairs": aligned_pairs[:10],
        "_opening_sim": round(opening_sim, 1),
        "_ending_sim": round(ending_sim, 1),
        "_span_coverage": span_info,
        "_sentence_chain_score": chain_score,
        "_chain_count": chain_count,
        "_max_chain_len": max_chain_len,
        "_rare_phrases": shared_rare[:5],
        "_evidence_blocks": evidence_blocks,
        # 功能段落結構中間產物
        "_func_structure_score": round(func_struct_score, 1),
        "_essay_type_a": func_struct_info["essay_type_a"],
        "_essay_type_b": func_struct_info["essay_type_b"],
        "_essay_type_confidence_a": func_struct_info["confidence_a"],
        "_essay_type_confidence_b": func_struct_info["confidence_b"],
        "_func_seq_a": func_struct_info["func_seq_a"],
        "_func_seq_b": func_struct_info["func_seq_b"],
        # Cohort suppression 統計
        "_cohort_rare_phrase_avg_weight": cohort["rare_phrase_avg_weight"],
        "_cohort_rare_phrase_suppressed_count": cohort["rare_phrase_suppressed_count"],
        "_cohort_rare_phrase_total_shared": cohort["rare_phrase_total_shared"],
        "_cohort_opening_suppression": cohort["opening_suppression"],
        "_cohort_ending_suppression": cohort["ending_suppression"],
        "_cohort_suppressed_patterns": cohort["suppressed_patterns"],
        "_cohort_size": cohort["cohort_size"],
        # Soft evidence score
        "_soft_evidence_score": soft_ev_score,
        "_soft_evidence_hits": soft_ev_hits,
        "_soft_evidence_total_dims": 7,
        "_soft_evidence_signal": soft_ev_signal,
        "_soft_evidence_detail": soft_ev_detail,
        "_rare_phrase_score_raw": round(rare_overlap_score, 1),
        # 統一 schema 佔位
        "_rare_phrase_score": 0.0,
        "_risk_type": {},
        "_warnings": [],
        "data_flow_score": 0.0,
        "winnow_score": 0.0,
        "typo_score": 0.0,
        "dead_code_score": 0.0,
        "ai_suspicion": 0.0,
    }
