#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — English Essay Analyzer
==============================================
All English essay plagiarism analysis methods: sentence splitting,
tokenization, normalization, language detection, lexical overlap,
rare phrase overlap, sentence similarity matrix (Hungarian matching),
multi-granularity semantic similarity, opening/ending similarity,
discourse structure, stylometry, risk classification, and final status
determination.

All functions are standalone (no class, no self).

**Thread-safety note**: ``_get_english_embedding`` uses a module-level
lazy-loaded embedding model. In a multi-threaded runtime the first
invocation must be serialized (e.g. via a ``threading.Lock``) or an
equivalent idempotent initialization guard.  This constraint is NOT
enforced here; the current dev environment is single-threaded.

Dependencies: plagiarism_constants, plagiarism_text_utils.
"""

import logging
import re
from collections import Counter
from typing import Any, Dict, List, Optional, Set, Tuple

from app.domains.assignment.plagiarism_constants import (
    ENGLISH_STOPWORDS,
    _ALL_TRANSITION_MARKERS,
    _ENGLISH_ABBREVIATIONS,
    _ENGLISH_EMBEDDING_MODEL_NAME,
    _ENGLISH_IRREGULAR_MAP,
)
from app.domains.assignment.plagiarism_text_utils import (
    aligned_span_coverage,
    paragraph_structure_similarity,
)

logger = logging.getLogger(__name__)


# ================================================================
# Module-level Embedding State
# ================================================================

_english_embedding_model = None


def _get_english_embedding():
    """Lazy-load English sentence-transformer model (~80MB)."""
    global _english_embedding_model
    if _english_embedding_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _english_embedding_model = SentenceTransformer(_ENGLISH_EMBEDDING_MODEL_NAME)
            logger.info("English embedding model (%s) loaded", _ENGLISH_EMBEDDING_MODEL_NAME)
        except Exception as e:
            logger.warning("Failed to load English embedding model: %s", e)
            return None
    return _english_embedding_model


# ================================================================
# Text Processing
# ================================================================

def split_english_sentences(text: str) -> List[str]:
    """英文句子切分，帶縮寫保護。"""
    if not text or not text.strip():
        return []
    t = text.strip()
    # 替換常見縮寫的句點為佔位符（保留原始大小寫，保護所有內部及末尾句點）
    for abbr in _ENGLISH_ABBREVIATIONS:
        # 全部句點保護（e.g. → e<<DOT>>g<<DOT>>）
        protected = abbr.replace(".", "<<DOT>>") + "<<DOT>>"
        # 首字母大寫形式 (Mr., E.g.)
        cap_form = abbr[0].upper() + abbr[1:] + "."
        cap_protected = cap_form[0] + protected[1:]
        low_form = abbr + "."
        t = t.replace(cap_form, cap_protected)
        t = t.replace(low_form, protected)
    # 按句末標點切分（.!? 後接空格+大寫字母或結尾）
    parts = re.split(r'([.!?]+)\s+', t)
    sentences: List[str] = []
    i = 0
    while i < len(parts):
        seg = parts[i]
        if i + 1 < len(parts) and re.match(r'^[.!?]+$', parts[i + 1]):
            seg = seg + parts[i + 1]
            i += 2
        else:
            i += 1
        seg = seg.replace("<<DOT>>", ".").strip()
        if seg and len(seg.split()) >= 2:
            sentences.append(seg)
    return sentences


def tokenize_english_words(text: str) -> List[str]:
    """英文分詞，支持連字符和縮寫。"""
    return re.findall(r"[a-z]+(?:[-'][a-z]+)*", text.lower())


def english_normalize_token(word: str) -> str:
    """保守英文詞形歸一化（非 aggressive stemming）。"""
    w = word.lower().strip()
    if not w or not w.isalpha():
        return w

    # 不規則映射
    if w in _ENGLISH_IRREGULAR_MAP:
        return _ENGLISH_IRREGULAR_MAP[w]

    # 所有格
    if w.endswith("'s"):
        return w[:-2]

    original = w

    # -ing
    if w.endswith("ing") and len(w) > 5:
        stem = w[:-3]
        # doubled consonant: running -> run
        if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
            stem = stem[:-1]
        # silent-e restoration: making -> make, hoping -> hope
        # Only for consonants that commonly precede silent-e (not y, w, r after vowel)
        elif (stem and stem[-1] in "bcdfgklmnpqstvxz"
              and len(stem) >= 2):
            stem = stem + "e"
        w = stem
    # -ed
    elif w.endswith("ed") and len(w) > 4:
        stem = w[:-2]
        # doubled consonant: stopped -> stop
        if len(stem) >= 2 and stem[-1] == stem[-2] and stem[-1] not in "aeiou":
            stem = stem[:-1]
        # silent-e restoration: moved -> move, agreed -> agree
        # Only for consonants that commonly precede silent-e (not y, w, r after vowel)
        elif (stem and stem[-1] in "bcdfgklmnpqstvxz"
              and len(stem) >= 2):
            stem = stem + "e"
        w = stem
    # -ies -> -y
    elif w.endswith("ies") and len(w) > 4:
        w = w[:-3] + "y"
    # -es
    elif w.endswith("es") and len(w) > 4 and w[-3] in "sxzho":
        w = w[:-2]
    # -s (not -ss)
    elif w.endswith("s") and not w.endswith("ss") and len(w) > 3:
        w = w[:-1]

    # Degenerate protection
    if len(w) < 3 or not w.isalpha():
        return original
    return w


def detect_text_language(text: str) -> str:
    """
    輕量語言嗅探（advisory only，不改 detect_mode）。
    Returns: "en" / "zh" / "mixed"
    """
    if not text:
        return "mixed"
    sample = text[:2000]
    total = len(sample)
    if total == 0:
        return "mixed"
    latin = sum(1 for c in sample if 'a' <= c.lower() <= 'z')
    cjk = sum(1 for c in sample if '\u4e00' <= c <= '\u9fff')
    latin_ratio = latin / total
    cjk_ratio = cjk / total
    if cjk_ratio > 0.3:
        return "zh"
    if latin_ratio > 0.5:
        # 再驗證 stopword 命中率
        words = re.findall(r'[a-z]+', sample.lower())[:200]
        if words:
            hit = sum(1 for w in words if w in ENGLISH_STOPWORDS)
            if hit / len(words) > 0.2:
                return "en"
    return "mixed"


# ================================================================
# Scoring Dimensions
# ================================================================

def english_lexical_overlap(text_a: str, text_b: str) -> float:
    """
    英文詞級重疊度（verbatim_score 通道）。
    三個子分：word overlap + normalized-token overlap + char n-gram。
    """
    words_a = [w for w in tokenize_english_words(text_a)
                if w not in ENGLISH_STOPWORDS]
    words_b = [w for w in tokenize_english_words(text_b)
                if w not in ENGLISH_STOPWORDS]
    if not words_a or not words_b:
        return 0.0

    set_a, set_b = set(words_a), set(words_b)
    # 1. Word-level Jaccard (0.35)
    if set_a | set_b:
        word_jaccard = len(set_a & set_b) / len(set_a | set_b) * 100
    else:
        word_jaccard = 0.0

    # 2. Normalized-token Jaccard (0.35)
    norm_a = {english_normalize_token(w) for w in words_a}
    norm_b = {english_normalize_token(w) for w in words_b}
    if norm_a | norm_b:
        norm_jaccard = len(norm_a & norm_b) / len(norm_a | norm_b) * 100
    else:
        norm_jaccard = 0.0

    # 3. Char n-gram Jaccard (0.30) — 3-grams + 4-grams
    clean_a = re.sub(r'\s+', '', text_a.lower())
    clean_b = re.sub(r'\s+', '', text_b.lower())
    ngrams_a: Set[str] = set()
    ngrams_b: Set[str] = set()
    for n in (3, 4):
        for i in range(len(clean_a) - n + 1):
            ngrams_a.add(clean_a[i:i + n])
        for i in range(len(clean_b) - n + 1):
            ngrams_b.add(clean_b[i:i + n])
    if ngrams_a | ngrams_b:
        char_jaccard = len(ngrams_a & ngrams_b) / len(ngrams_a | ngrams_b) * 100
    else:
        char_jaccard = 0.0

    return min(word_jaccard * 0.35 + norm_jaccard * 0.35 + char_jaccard * 0.30, 100)


def english_rare_phrase_overlap(
    text_a: str, text_b: str,
    batch_texts: Optional[List[str]] = None,
) -> Tuple[float, List[str]]:
    """
    英文稀有短語重疊（word-level 2-5 gram）。
    帶批次級抑制。
    """
    words_a = tokenize_english_words(text_a)
    words_b = tokenize_english_words(text_b)
    if not words_a or not words_b:
        return 0.0, []

    def _extract_word_ngrams(words: List[str], min_n: int, max_n: int) -> Counter:
        ngrams: Counter = Counter()
        for n in range(min_n, max_n + 1):
            for i in range(len(words) - n + 1):
                gram = tuple(words[i:i + n])
                # 過濾 stopword 超過 50% 的短語
                sw_count = sum(1 for w in gram if w in ENGLISH_STOPWORDS)
                if sw_count / n <= 0.5:
                    ngrams[gram] += 1
        return ngrams

    ngrams_a = _extract_word_ngrams(words_a, 2, 5)
    ngrams_b = _extract_word_ngrams(words_b, 2, 5)

    # 單文檔低頻過濾
    rare_a = {g for g, c in ngrams_a.items() if c <= 2}
    rare_b = {g for g, c in ngrams_b.items() if c <= 2}
    shared = rare_a & rare_b
    if not shared:
        return 0.0, []

    # 批次級抑制
    if batch_texts and len(batch_texts) >= 3:
        all_ngram_sets = []
        for bt in batch_texts:
            bt_words = tokenize_english_words(bt)
            bt_ngrams = _extract_word_ngrams(bt_words, 2, 5)
            all_ngram_sets.append(set(bt_ngrams.keys()))
        total_docs = len(all_ngram_sets)
        suppressed_shared = set()
        for gram in shared:
            doc_freq = sum(1 for s in all_ngram_sets if gram in s)
            df_ratio = doc_freq / total_docs
            weight = max(0.2, 1.0 - df_ratio)
            if weight > 0.3:  # 只保留權重 >0.3 的
                suppressed_shared.add(gram)
        shared = suppressed_shared

    if not shared:
        return 0.0, []

    # 貪心覆蓋計算（按詞位置）
    shared_sorted = sorted(shared, key=len, reverse=True)
    covered_positions: Set[int] = set()
    selected_phrases: List[str] = []
    for gram in shared_sorted:
        phrase_str = " ".join(gram)
        gram_len = len(gram)
        # 在 words_a 中找出現位置
        for i in range(len(words_a) - gram_len + 1):
            if tuple(words_a[i:i + gram_len]) == gram:
                new_pos = set(range(i, i + gram_len))
                if not new_pos.issubset(covered_positions):
                    covered_positions.update(new_pos)
                    if phrase_str not in selected_phrases:
                        selected_phrases.append(phrase_str)

    shorter_len = max(min(len(words_a), len(words_b)), 1)
    score = min(len(covered_positions) / shorter_len * 100, 100)
    return score, selected_phrases[:10]


def english_sentence_sim_matrix(
    sents_a: List[str],
    sents_b: List[str],
) -> Tuple[float, List[Tuple[int, int, float]]]:
    """
    構建英文句子相似度矩陣（兩步策略）。
    Returns: (score, aligned_pairs)
    """
    import numpy as np
    from scipy.optimize import linear_sum_assignment

    m, n = len(sents_a), len(sents_b)
    if m == 0 or n == 0:
        return 0.0, []

    # 預處理：每句的 content words 和 normalized tokens
    cw_a = [set(w for w in tokenize_english_words(s) if w not in ENGLISH_STOPWORDS) for s in sents_a]
    cw_b = [set(w for w in tokenize_english_words(s) if w not in ENGLISH_STOPWORDS) for s in sents_b]
    norm_a = [" ".join(english_normalize_token(w) for w in tokenize_english_words(s) if w not in ENGLISH_STOPWORDS)
              for s in sents_a]
    norm_b = [" ".join(english_normalize_token(w) for w in tokenize_english_words(s) if w not in ENGLISH_STOPWORDS)
              for s in sents_b]

    # Step 1: TF-IDF 預計算（批量）
    tfidf_sims = np.zeros((m, n))
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        all_sents = sents_a + sents_b
        vectorizer = TfidfVectorizer(max_features=5000)
        tfidf_matrix = vectorizer.fit_transform(all_sents)
        # 計算 A 與 B 之間的 cosine
        from sklearn.metrics.pairwise import cosine_similarity
        tfidf_sims = cosine_similarity(tfidf_matrix[:m], tfidf_matrix[m:])
    except Exception:
        pass

    # 嘗試載入 embedding model
    emb_model = _get_english_embedding()
    sent_embs_a = None
    sent_embs_b = None
    if emb_model is not None:
        try:
            sent_embs_a = emb_model.encode(sents_a, normalize_embeddings=True)
            sent_embs_b = emb_model.encode(sents_b, normalize_embeddings=True)
        except Exception:
            sent_embs_a = None
            sent_embs_b = None

    # 構建完整相似度矩陣
    sim_matrix = np.zeros((m, n))
    from difflib import SequenceMatcher

    for i in range(m):
        for j in range(n):
            # Step 1: 輕量預篩
            cw_union = cw_a[i] | cw_b[j]
            lexical_j = len(cw_a[i] & cw_b[j]) / len(cw_union) if cw_union else 0
            tfidf_j = float(tfidf_sims[i, j]) if tfidf_sims is not None else 0

            if lexical_j < 0.15 and tfidf_j < 0.15:
                sim_matrix[i, j] = 0.0
                continue

            # Step 2: 完整混合相似度
            # Lexical (0.30)
            lex_score = lexical_j

            # Semantic (0.40)
            if sent_embs_a is not None and sent_embs_b is not None:
                sem_score = float(np.dot(sent_embs_a[i], sent_embs_b[j]))
            else:
                sem_score = tfidf_j  # fallback

            # Phrase (0.30) — SequenceMatcher on normalized tokens
            na, nb = norm_a[i], norm_b[j]
            na_tokens = na.split()
            nb_tokens = nb.split()
            # Short sentence guard
            if len(na_tokens) < 6 and len(nb_tokens) < 6:
                phrase_weight = 0.15  # 降權
            else:
                phrase_weight = 0.30
            phrase_score = SequenceMatcher(None, na, nb, autojunk=False).ratio()

            # 動態權重（phrase 降權時重新分配）
            if phrase_weight < 0.30:
                extra = 0.30 - phrase_weight
                sim = lex_score * (0.30 + extra / 2) + sem_score * (0.40 + extra / 2) + phrase_score * phrase_weight
            else:
                sim = lex_score * 0.30 + sem_score * 0.40 + phrase_score * 0.30

            sim_matrix[i, j] = sim

    # Hungarian matching
    cost_matrix = 1.0 - sim_matrix
    max_dim = max(m, n)
    padded = np.ones((max_dim, max_dim))
    padded[:m, :n] = cost_matrix
    row_ind, col_ind = linear_sum_assignment(padded)

    aligned_pairs: List[Tuple[int, int, float]] = []
    for r, c in zip(row_ind, col_ind):
        if r < m and c < n:
            aligned_pairs.append((int(r), int(c), float(sim_matrix[r, c])))

    # 雙向加權平均
    weight_a = sum(len(sents_a[r].split()) for r, _, _ in aligned_pairs) or 1
    score_a = sum(ratio * len(sents_a[r].split()) for r, _, ratio in aligned_pairs) / weight_a

    weight_b = sum(len(sents_b[c].split()) for _, c, _ in aligned_pairs) or 1
    score_b = sum(ratio * len(sents_b[c].split()) for _, c, ratio in aligned_pairs) / weight_b

    score = (score_a + score_b) / 2 * 100
    aligned_pairs.sort(key=lambda x: x[2], reverse=True)

    return min(score, 100), aligned_pairs


def english_semantic_similarity(
    clean_a: str, clean_b: str,
    sents_a: List[str], sents_b: List[str],
    raw_a: str, raw_b: str,
) -> float:
    """
    多粒度英文語義相似度（identifier_score 通道）。
    Fallback cascade: embedding → TF-IDF → lexical proxy。
    """
    import numpy as np

    emb_model = _get_english_embedding()

    if emb_model is not None:
        try:
            # 準備所有文本
            paras_a = [p.strip() for p in raw_a.split('\n') if p.strip()]
            paras_b = [p.strip() for p in raw_b.split('\n') if p.strip()]
            total_words_a = len(tokenize_english_words(raw_a))
            total_words_b = len(tokenize_english_words(raw_b))
            dyn_window = min(100, max(total_words_a, total_words_b) // 4)
            dyn_window = max(dyn_window, 20)

            words_a = tokenize_english_words(raw_a)
            words_b = tokenize_english_words(raw_b)
            open_a = " ".join(words_a[:dyn_window])
            open_b = " ".join(words_b[:dyn_window])
            close_a = " ".join(words_a[-dyn_window:])
            close_b = " ".join(words_b[-dyn_window:])

            all_texts = [clean_a, clean_b] + paras_a + paras_b + [open_a, open_b, close_a, close_b]
            embeddings = emb_model.encode(all_texts, normalize_embeddings=True)

            # Document-level (0.40)
            doc_sim = float(np.dot(embeddings[0], embeddings[1])) * 100

            # Paragraph-level (0.20)
            pa_start = 2
            pa_end = pa_start + len(paras_a)
            pb_start = pa_end
            pb_end = pb_start + len(paras_b)
            emb_pa = embeddings[pa_start:pa_end]
            emb_pb = embeddings[pb_start:pb_end]

            para_sim = 0.0
            if len(emb_pa) > 0 and len(emb_pb) > 0:
                # max-avg bidirectional
                max_sims_a = [max(float(np.dot(ea, eb)) for eb in emb_pb) for ea in emb_pa]
                max_sims_b = [max(float(np.dot(eb, ea)) for ea in emb_pa) for eb in emb_pb]
                para_sim = (sum(max_sims_a) / len(max_sims_a) + sum(max_sims_b) / len(max_sims_b)) / 2 * 100

            # Sentence-level (0.25) — avg of top aligned
            sent_sim = 0.0
            if sents_a and sents_b:
                sent_embs = emb_model.encode(sents_a + sents_b, normalize_embeddings=True)
                ea = sent_embs[:len(sents_a)]
                eb = sent_embs[len(sents_a):]
                # top-10 cosine pairs
                pairs_sims = []
                for i, sa_emb in enumerate(ea):
                    for j, sb_emb in enumerate(eb):
                        pairs_sims.append(float(np.dot(sa_emb, sb_emb)))
                pairs_sims.sort(reverse=True)
                top_k = min(10, len(pairs_sims))
                if top_k > 0:
                    sent_sim = sum(pairs_sims[:top_k]) / top_k * 100

            # Opening/closing (0.15)
            oc_start = pb_end
            oc_sim_open = float(np.dot(embeddings[oc_start], embeddings[oc_start + 1])) * 100
            oc_sim_close = float(np.dot(embeddings[oc_start + 2], embeddings[oc_start + 3])) * 100
            oc_sim = (oc_sim_open + oc_sim_close) / 2

            result = doc_sim * 0.40 + para_sim * 0.20 + sent_sim * 0.25 + oc_sim * 0.15
            return min(max(result, 0), 100)

        except Exception as e:
            logger.warning("English embedding similarity failed: %s, falling back to TF-IDF", e)

    # Fallback: TF-IDF multi-granularity cosine
    try:
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim

        # Document level
        vec = TfidfVectorizer(max_features=5000)
        doc_mat = vec.fit_transform([clean_a, clean_b])
        doc_sim = float(cos_sim(doc_mat[0:1], doc_mat[1:2])[0, 0]) * 100

        # Sentence level
        sent_sim = 0.0
        if sents_a and sents_b:
            all_s = sents_a + sents_b
            sv = TfidfVectorizer(max_features=3000)
            s_mat = sv.fit_transform(all_s)
            s_cos = cos_sim(s_mat[:len(sents_a)], s_mat[len(sents_a):])
            # top-10 values
            flat = sorted(s_cos.flatten(), reverse=True)
            top_k = min(10, len(flat))
            if top_k > 0:
                sent_sim = sum(flat[:top_k]) / top_k * 100

        return min(max(doc_sim * 0.60 + sent_sim * 0.40, 0), 100)
    except Exception:
        # Last resort: lexical proxy
        return english_lexical_overlap(clean_a, clean_b) * 0.6


def english_opening_ending_similarity(
    raw_a: str, raw_b: str,
    sents_a: List[str], sents_b: List[str],
    compare_opening: bool = True,
) -> float:
    """
    英文開頭/結尾相似度（獨立計算、獨立緩存、獨立輸出）。
    Multi-granularity + dynamic window。
    """
    from difflib import SequenceMatcher

    if not sents_a or not sents_b:
        return 0.0

    # 1. 首/尾 1-2 句 (0.40)
    if compare_opening:
        seg_sents_a = " ".join(sents_a[:2])
        seg_sents_b = " ".join(sents_b[:2])
    else:
        seg_sents_a = " ".join(sents_a[-2:])
        seg_sents_b = " ".join(sents_b[-2:])
    sent_sim = SequenceMatcher(None, seg_sents_a.lower(), seg_sents_b.lower(),
                               autojunk=False).ratio() * 100

    # 2. 首/尾段 (0.30)
    paras_a = [p.strip() for p in raw_a.split('\n') if p.strip()]
    paras_b = [p.strip() for p in raw_b.split('\n') if p.strip()]
    if compare_opening:
        para_a = paras_a[0] if paras_a else ""
        para_b = paras_b[0] if paras_b else ""
    else:
        para_a = paras_a[-1] if paras_a else ""
        para_b = paras_b[-1] if paras_b else ""
    para_sim = SequenceMatcher(None, para_a.lower(), para_b.lower(),
                               autojunk=False).ratio() * 100 if para_a and para_b else 0.0

    # 3. 首/尾 N tokens (0.30) — dynamic window
    words_a = tokenize_english_words(raw_a)
    words_b = tokenize_english_words(raw_b)
    total_max = max(len(words_a), len(words_b))
    dyn_window = min(100, max(total_max // 4, 15))
    if compare_opening:
        tok_a = " ".join(words_a[:dyn_window])
        tok_b = " ".join(words_b[:dyn_window])
    else:
        tok_a = " ".join(words_a[-dyn_window:])
        tok_b = " ".join(words_b[-dyn_window:])
    tok_sim = SequenceMatcher(None, tok_a, tok_b, autojunk=False).ratio() * 100 if tok_a and tok_b else 0.0

    return min(sent_sim * 0.40 + para_sim * 0.30 + tok_sim * 0.30, 100)


def english_discourse_structure(
    raw_a: str, raw_b: str,
    sents_a: List[str], sents_b: List[str],
) -> float:
    """
    英文段落/議論結構相似度（structure_score 通道）。
    帶短文可靠性修正。
    """
    from difflib import SequenceMatcher

    paras_a = [p.strip() for p in raw_a.split('\n') if p.strip()]
    paras_b = [p.strip() for p in raw_b.split('\n') if p.strip()]

    if not paras_a or not paras_b:
        return 0.0

    # 1. Transition marker fingerprint (0.35)
    def _para_marker_categories(para: str) -> Set[str]:
        lower = para.lower()
        cats: Set[str] = set()
        for phrase, cat in _ALL_TRANSITION_MARKERS:
            if phrase in lower:
                cats.add(cat)
        return cats

    markers_a = [_para_marker_categories(p) for p in paras_a]
    markers_b = [_para_marker_categories(p) for p in paras_b]

    # 按位置對比 Jaccard
    min_len = min(len(markers_a), len(markers_b))
    if min_len > 0:
        jaccards = []
        for i in range(min_len):
            union = markers_a[i] | markers_b[i]
            if union:
                jaccards.append(len(markers_a[i] & markers_b[i]) / len(union))
            else:
                jaccards.append(1.0)  # 都沒有 marker = 中性
        transition_sim = sum(jaccards) / len(jaccards) * 100
    else:
        transition_sim = 0.0

    # 2. Paragraph function classification (0.30)
    def _classify_para(para: str, idx: int, total: int) -> str:
        lower = para.lower()
        if idx == 0:
            return "intro"
        if idx == total - 1:
            for marker in ["in conclusion", "to sum up", "in summary", "overall",
                           "all in all", "to conclude", "from this experience",
                           "i learned", "this taught me", "looking back"]:
                if marker in lower:
                    return "conclusion"
            return "conclusion"  # 最後一段通常是結論
        for marker in ["however", "although", "on the other hand", "some may argue",
                       "despite", "nevertheless", "in contrast"]:
            if marker in lower:
                return "counter"
        for marker in ["for example", "for instance", "studies show", "according to",
                       "research indicates", "evidence suggests"]:
            if marker in lower:
                return "evidence"
        return "argument"

    func_a = [_classify_para(p, i, len(paras_a)) for i, p in enumerate(paras_a)]
    func_b = [_classify_para(p, i, len(paras_b)) for i, p in enumerate(paras_b)]
    func_sim = SequenceMatcher(None, func_a, func_b).ratio() * 100

    # 3. Topic sentence patterns (0.20) — first words of each paragraph
    def _first_words(para: str, n: int = 4) -> str:
        words = re.findall(r'[a-z]+', para.lower())
        return " ".join(words[:n])

    topic_a = [_first_words(p) for p in paras_a]
    topic_b = [_first_words(p) for p in paras_b]
    topic_sim = SequenceMatcher(None, topic_a, topic_b).ratio() * 100

    # 4. Paragraph structure (0.15)
    struct_sim = paragraph_structure_similarity(raw_a, raw_b)

    score = transition_sim * 0.35 + func_sim * 0.30 + topic_sim * 0.20 + struct_sim * 0.15

    # Reliability correction: 短文降權
    total_words = max(
        len(tokenize_english_words(raw_a)),
        len(tokenize_english_words(raw_b)),
    )
    if len(paras_a) < 3 or len(paras_b) < 3 or total_words < 150:
        score *= 0.6

    return min(score, 100)


def english_stylometry(
    raw_a: str, raw_b: str,
    sents_a: List[str], sents_b: List[str],
) -> float:
    """
    英文風格計量學（indent_score 通道）。
    帶短文可靠性修正。
    """
    import numpy as np

    if not sents_a or not sents_b:
        return 0.0

    def _cosine_sim(v1: List[float], v2: List[float]) -> float:
        a = np.array(v1, dtype=float)
        b = np.array(v2, dtype=float)
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(a, b) / (norm_a * norm_b))

    # 1. Sentence length distribution (0.25)
    lens_a = [len(s.split()) for s in sents_a]
    lens_b = [len(s.split()) for s in sents_b]
    feat_len_a = [np.mean(lens_a) / 50, np.std(lens_a) / 20, np.median(lens_a) / 50]
    feat_len_b = [np.mean(lens_b) / 50, np.std(lens_b) / 20, np.median(lens_b) / 50]
    sent_len_sim = _cosine_sim(feat_len_a, feat_len_b) * 100

    # 2. Short/long sentence ratio (0.10)
    short_a = sum(1 for l in lens_a if l <= 8) / max(len(lens_a), 1)
    short_b = sum(1 for l in lens_b if l <= 8) / max(len(lens_b), 1)
    long_a = sum(1 for l in lens_a if l >= 25) / max(len(lens_a), 1)
    long_b = sum(1 for l in lens_b if l >= 25) / max(len(lens_b), 1)
    sl_sim = (1 - abs(short_a - short_b) / 2 - abs(long_a - long_b) / 2) * 100

    # 3. Function word distribution (0.25)
    words_a = tokenize_english_words(raw_a)
    words_b = tokenize_english_words(raw_b)
    stopword_list = sorted(ENGLISH_STOPWORDS)
    total_a = max(len(words_a), 1)
    total_b = max(len(words_b), 1)
    counter_a = Counter(words_a)
    counter_b = Counter(words_b)
    fw_vec_a = [counter_a.get(sw, 0) / total_a for sw in stopword_list]
    fw_vec_b = [counter_b.get(sw, 0) / total_b for sw in stopword_list]
    fw_sim = _cosine_sim(fw_vec_a, fw_vec_b) * 100

    # 4. Punctuation patterns (0.20)
    punct_chars = ",.;:!?-()\"'"
    punct_a = [raw_a.count(c) / max(total_a / 100, 1) for c in punct_chars]
    punct_b = [raw_b.count(c) / max(total_b / 100, 1) for c in punct_chars]
    punct_sim = _cosine_sim(punct_a, punct_b) * 100

    # 5. Vocabulary richness (0.10)
    unique_a = len(set(words_a))
    unique_b = len(set(words_b))
    ttr_a = unique_a / total_a
    ttr_b = unique_b / total_b
    hapax_a = sum(1 for w, c in counter_a.items() if c == 1) / max(unique_a, 1)
    hapax_b = sum(1 for w, c in counter_b.items() if c == 1) / max(unique_b, 1)
    vocab_sim = _cosine_sim([ttr_a, hapax_a], [ttr_b, hapax_b]) * 100

    # 6. Sentence starter diversity (0.10)
    starters_a = Counter(s.split()[0].lower() if s.split() else "" for s in sents_a)
    starters_b = Counter(s.split()[0].lower() if s.split() else "" for s in sents_b)
    all_starters = sorted(set(starters_a.keys()) | set(starters_b.keys()))
    if all_starters:
        sv_a = [starters_a.get(s, 0) / max(len(sents_a), 1) for s in all_starters]
        sv_b = [starters_b.get(s, 0) / max(len(sents_b), 1) for s in all_starters]
        starter_sim = _cosine_sim(sv_a, sv_b) * 100
    else:
        starter_sim = 0.0

    score = (sent_len_sim * 0.25 + sl_sim * 0.10 + fw_sim * 0.25
             + punct_sim * 0.20 + vocab_sim * 0.10 + starter_sim * 0.10)

    # Reliability correction
    if len(sents_a) < 8 or len(sents_b) < 8 or max(total_a, total_b) < 150:
        score *= 0.6

    return min(max(score, 0), 100)


# ================================================================
# Risk Classification
# ================================================================

def classify_english_risk(
    lexical: float,
    rare_phrase: float,
    sentence_align: float,
    semantic: float,
    discourse: float,
    stylometry: float,
    opening_sim: float,
    ending_sim: float,
    span_coverage: float,
) -> Dict[str, Any]:
    """
    英文作文風險分類。
    返回三類風險分數 + primary_risk + risk_confidence_score。
    """
    oe_max = max(opening_sim, ending_sim)

    risk_direct = (
        lexical * 0.30 + rare_phrase * 0.25 + span_coverage * 0.20
        + oe_max * 0.15 + sentence_align * 0.10
    )

    risk_para = (
        sentence_align * 0.30 + semantic * 0.30 + discourse * 0.20
        + rare_phrase * 0.10 + max(100 - lexical, 0) * 0.10
    )
    # Boost: high semantic + low lexical = paraphrase signal
    if semantic > 60 and lexical < 40:
        risk_para = min(risk_para * 1.15, 100)

    risk_imit = (
        discourse * 0.30 + stylometry * 0.25 + oe_max * 0.20
        + semantic * 0.15 + max(100 - lexical, 0) * 0.10
    )

    risks = {
        "direct_copy": risk_direct,
        "paraphrase": risk_para,
        "imitation": risk_imit,
    }
    sorted_risks = sorted(risks.items(), key=lambda x: x[1], reverse=True)
    primary = sorted_risks[0][0]
    primary_score = sorted_risks[0][1]
    secondary_score = sorted_risks[1][1] if len(sorted_risks) > 1 else 0

    # Tie-breaking: 接近打平時降低置信度
    if primary_score - secondary_score < 5:
        risk_confidence = min(primary_score * 0.6, 40)
    elif primary_score - secondary_score < 10:
        risk_confidence = primary_score * 0.7
    else:
        risk_confidence = primary_score * 0.85

    # 低分時標記 normal
    if primary_score < 30:
        primary = "normal"

    signals = []
    if primary_score - secondary_score < 5 and primary_score > 30:
        signals.append("風險類型接近，判定存在混合信號")

    return {
        "risk_direct_copy": round(risk_direct, 1),
        "risk_paraphrase": round(risk_para, 1),
        "risk_imitation": round(risk_imit, 1),
        "primary_risk": primary,
        "risk_confidence_score": round(min(risk_confidence, 100), 1),
        "_signals": signals,
    }


def determine_english_final_status(
    pair: Dict[str, Any],
    threshold: float,
) -> str:
    """
    根據算法分數 + LLM 分析結果，確定英文作文配對的最終狀態。

    Returns:
        "high_risk" | "review_needed" | "low_risk"
    """
    score = pair.get("similarity_score", 0)
    frags = pair.get("matched_fragments", [])
    det = None
    if frags and isinstance(frags[0], dict) and frags[0].get("type") == "dimension_breakdown":
        det = frags[0]

    if not det:
        return "low_risk" if score < threshold else "review_needed"

    # Extract intermediate scores
    verbatim = det.get("verbatim_score", 0)
    comment = det.get("comment_score", 0)
    opening_sim = det.get("_opening_sim", 0) or 0
    ending_sim = det.get("_ending_sim", 0) or 0
    rare_phrase_score = det.get("_rare_phrase_score", 0) or 0
    risk_type = det.get("_risk_type") or {}
    primary_risk = risk_type.get("primary_risk", "normal")
    span_info = det.get("_span_coverage") or {}
    total_coverage = span_info.get("total_coverage", 0) if isinstance(span_info, dict) else 0
    chain_count = span_info.get("chain_count", 0) if isinstance(span_info, dict) else 0

    # Parse LLM output for confidence and label
    ai_text = pair.get("ai_analysis", "")
    llm_confidence = "low"
    llm_label = ""
    if isinstance(ai_text, str):
        ai_lower = ai_text.lower()
        # Extract confidence
        if "high" in ai_lower and ("信心" in ai_text or "confidence" in ai_lower):
            llm_confidence = "high"
        elif "medium" in ai_lower and ("信心" in ai_text or "confidence" in ai_lower):
            llm_confidence = "medium"
        # Extract label
        if "直接抄襲" in ai_text or "direct copy" in ai_lower:
            llm_label = "direct_copy"
        elif "改寫" in ai_text or "paraphrase" in ai_lower:
            llm_label = "paraphrase_rewrite"
        elif "結構模仿" in ai_text or "structural imitation" in ai_lower:
            llm_label = "structural_imitation"
        elif "正常" in ai_text or "no plagiarism" in ai_lower:
            llm_label = "normal"

    # ---- Hard evidence rules (override even without high LLM confidence) ----
    hard_evidence = False
    if verbatim >= 85:
        hard_evidence = True
    elif total_coverage >= 0.70 and comment >= 80:
        hard_evidence = True
    elif rare_phrase_score >= 75 and chain_count >= 2:
        hard_evidence = True

    if hard_evidence:
        return "high_risk"

    # ---- Standard high_risk conditions ----
    if score >= threshold:
        if llm_label in ("direct_copy", "paraphrase_rewrite") and llm_confidence in ("medium", "high"):
            return "high_risk"
        # structural_imitation needs strong additional evidence to be high_risk
        if llm_label == "structural_imitation":
            strong_evidence = (
                opening_sim >= 80
                or ending_sim >= 80
                or rare_phrase_score >= 65
                or chain_count >= 2
                or comment >= 75
            )
            if strong_evidence:
                return "high_risk"
            else:
                return "review_needed"

    # ---- review_needed conditions ----
    # LLM entry met but low confidence
    llm_entry = (
        score >= 40
        or comment >= 70
        or opening_sim >= 75
        or ending_sim >= 75
        or rare_phrase_score >= 60
    )
    if llm_entry and ai_text and llm_confidence == "low" and llm_label not in ("normal", ""):
        return "review_needed"

    # Near threshold with mixed signals
    if abs(score - threshold) <= 10 and score >= threshold * 0.8:
        if primary_risk != "normal":
            return "review_needed"

    # structural_imitation default
    if primary_risk == "imitation" and risk_type.get("risk_imitation", 0) >= 40:
        return "review_needed"

    # ---- low_risk ----
    # LLM explicitly cleared
    if llm_label == "normal" and ai_text:
        return "low_risk"

    # Below all entry thresholds
    if score < threshold and not llm_entry:
        return "low_risk"

    # Default: below threshold = low_risk, above = review_needed
    return "low_risk" if score < threshold else "review_needed"


# ================================================================
# Orchestration
# ================================================================

def compute_english_essay_similarity(
    clean_a: str,
    clean_b: str,
    raw_a: str,
    raw_b: str,
    n: int,
    batch_texts: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    英文作文多維度相似度計算。
    返回 5 個標準通道 + 中間產物。

    Returns unified dict per the schema spec.
    """
    signals: List[str] = []
    warnings: List[str] = []

    # 1. 詞級重疊 (verbatim channel)
    verbatim_score = english_lexical_overlap(clean_a, clean_b)
    if verbatim_score > 70:
        signals.append(f"Lexical overlap very high ({verbatim_score:.0f}%), likely direct copy")
    elif verbatim_score > 45:
        signals.append(f"Lexical overlap moderate ({verbatim_score:.0f}%), some shared wording")

    # 2. 稀有短語 (intermediate)
    rare_score, rare_phrases = english_rare_phrase_overlap(clean_a, clean_b, batch_texts)
    if rare_score > 40 and verbatim_score < 50:
        signals.append(f"Rare phrase overlap ({rare_score:.0f}%) despite moderate lexical overlap — key phrases unchanged")

    # 3. 句子對齊 (comment channel)
    sents_a = split_english_sentences(raw_a)
    sents_b = split_english_sentences(raw_b)
    sentence_score, aligned_pairs = english_sentence_sim_matrix(sents_a, sents_b)

    # 對齊鏈覆蓋
    span_info = aligned_span_coverage(sents_a, sents_b, aligned_pairs)
    coverage_bonus = 0.0
    if span_info["total_coverage"] > 0.5:
        coverage_bonus = min((span_info["total_coverage"] - 0.5) * 40, 20)
        signals.append(
            f"Alignment chains cover {span_info['total_coverage']:.0%} "
            f"({span_info['chain_count']} chains), sentence_align +{coverage_bonus:.0f}"
        )
    comment_score = min(sentence_score + coverage_bonus, 100)

    if comment_score > 60 and verbatim_score < 50:
        signals.append(f"High sentence alignment ({comment_score:.0f}%) but moderate lexical overlap — possible paraphrase")

    # 4. 語義相似度 (identifier channel)
    semantic_score = english_semantic_similarity(clean_a, clean_b, sents_a, sents_b, raw_a, raw_b)
    if semantic_score > 65 and verbatim_score < 40:
        signals.append(f"High semantic similarity ({semantic_score:.0f}%) despite low lexical overlap — deep rewriting suspected")

    # 5. 段落結構 (structure channel)
    structure_score = english_discourse_structure(raw_a, raw_b, sents_a, sents_b)

    # 6. 風格計量 (indent channel)
    style_score = english_stylometry(raw_a, raw_b, sents_a, sents_b)

    # 7. 開頭/結尾 (intermediates)
    opening_sim = english_opening_ending_similarity(raw_a, raw_b, sents_a, sents_b, compare_opening=True)
    ending_sim = english_opening_ending_similarity(raw_a, raw_b, sents_a, sents_b, compare_opening=False)
    if opening_sim > 70:
        signals.append(f"Opening highly similar ({opening_sim:.0f}%) — common in copied essays")
    if ending_sim > 70:
        signals.append(f"Ending highly similar ({ending_sim:.0f}%) — reflection/conclusion may be shared")

    # 8. 風險分類
    span_cov_pct = span_info["total_coverage"] * 100
    risk_info = classify_english_risk(
        lexical=verbatim_score,
        rare_phrase=rare_score,
        sentence_align=comment_score,
        semantic=semantic_score,
        discourse=structure_score,
        stylometry=style_score,
        opening_sim=opening_sim,
        ending_sim=ending_sim,
        span_coverage=span_cov_pct,
    )
    signals.extend(risk_info.pop("_signals", []))

    # 綜合信號
    if verbatim_score > 75 and comment_score > 65:
        signals.append("Multi-dimension hit: highly likely direct copy")
    elif comment_score > 55 and semantic_score > 55 and verbatim_score < 45:
        signals.append("Semantic + sentence alignment high but lexical low: likely paraphrase rewriting")
    elif structure_score > 60 and semantic_score > 50 and verbatim_score < 35:
        signals.append("Structure similar but content differs: possible imitation")

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
        "_rare_phrases": rare_phrases[:10],
        "_rare_phrase_score": round(rare_score, 1),
        "_risk_type": risk_info,
        "_warnings": warnings,
        # 統一 schema 佔位
        "data_flow_score": 0.0,
        "winnow_score": 0.0,
        "typo_score": 0.0,
        "dead_code_score": 0.0,
        "ai_suspicion": 0.0,
    }
