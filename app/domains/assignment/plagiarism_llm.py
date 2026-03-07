#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Plagiarism Detection — LLM Analysis
====================================
Prompt construction and AI-powered pair analysis for plagiarism detection.

This module is **stateless** — no pair cache, no repo access, no persistence
logic. Prompt cache / retry state lives in the service layer.

``ask_ai_func`` and ``settings`` are passed as explicit parameters instead of
being accessed via ``self``.

Import constraints
------------------
Only imports sentence-splitting helpers (``split_chinese_sentences``,
``split_english_sentences``).  Does NOT import analyzer entrypoints to avoid
pulling in the entire analyzer dependency tree.

Dependencies: plagiarism_constants, plagiarism_chinese_essay (split only),
              plagiarism_english_essay (split only).
"""

import logging
from typing import Any, Callable, Dict, List, Optional

from app.domains.assignment.plagiarism_constants import DETECTION_PRESETS

logger = logging.getLogger(__name__)


# ================================================================
# Prompt Components
# ================================================================

def get_analysis_requirements(detect_mode: str) -> str:
    """Return analysis requirement text for the LLM prompt."""
    if detect_mode == "chinese_essay":
        return (
            "請重點關注以下特徵（按證據強度排序）:\n\n"
            "1. **逐字重複** [實錘級]: 是否有大段原封不動的句子？只改了人名/地名/稱呼？\n"
            "2. **情節對應** [強信號]: 關鍵事件是否一一對應？（如：清晨→做早餐→河邊玩→傍晚乘涼→結尾抒情）\n"
            "3. **人物替換** [強信號]: 人物角色是否只是換了稱呼？（外婆↔奶奶、小伙伴↔鄰居的孩子）\n"
            "4. **場景雷同** [中等信號]: 具體場景描寫是否相似？（如河邊抓魚、老槐樹下下棋）\n"
            "5. **結構模仿** [參考信號]: 段落結構和敘事順序是否高度一致？\n"
            "6. **抒情模式** [參考信號]: 結尾是否使用相同的抒情套路？\n"
            "7. **共同錯別字/特殊表達**: 是否存在相同的錯別字或不常見表達？"
        )
    if detect_mode == "english_essay":
        return (
            "請重點關注以下特徵（按證據強度排序）:\n\n"
            "1. **逐字複製** [實錘級]: 是否有大段原文照搬的句子？是否只做了大小寫或標點改動？\n"
            "2. **句子改寫** [強信號]: 是否有句子通過同義詞替換、主動↔被動轉換、從句重組來掩蓋？\n"
            "3. **罕見短語** [強信號]: 是否共用了不常見的多詞表達？（非通用搭配的短語）\n"
            "4. **結構鏡像** [中等信號]: 段落功能序列是否高度吻合？（如 intro→evidence→counter→conclusion）\n"
            "5. **開頭/結尾雷同** [中等信號]: 首段或尾段是否高度相似？\n"
            "6. **論述模式** [參考信號]: 轉折詞使用模式、論點推進順序是否一致？\n"
            "7. **文體特徵** [參考信號]: 句長分佈、功能詞頻率、標點習慣是否異常一致？"
        )
    return (
        "按證據強度排序，請重點關注以下「非邏輯」特徵:\n\n"
        "1. **共享拼寫錯誤** [實錘級]: 兩人是否在變量名或注釋裡拼錯了同一個單詞？\n"
        "2. **死代碼/調試痕跡** [實錘級]: 相同位置是否有未刪除的 print(\"test\")、被注釋的代碼？\n"
        "3. **變量命名** [強信號]: 自定義命名是否完全相同？\n"
        "4. **空格/縮排節奏** [中等信號]: 運算符空格、花括號換行風格是否一致？\n"
        "5. **注釋/字串** [中等信號]: 是否保留了相同注釋文字？\n"
        "6. **AI 生成嫌疑**: 是否存在超出教學進度的語法？\n"
        "7. **結構相似**: 整體邏輯一致？（注意: 簡單題目天然相似，不能單獨作為證據）"
    )


def get_response_format(detect_mode: str) -> str:
    """Return response format instruction for the LLM prompt."""
    if detect_mode == "chinese_essay":
        return (
            "請直接用中文給出簡明的分析結論（2-4 句話），包含:\n"
            "- 你的判斷：「直接抄襲」/「套用改寫」/「仿寫模仿」/「正常相似」\n"
            "- 關鍵依據（具體指出哪些句子/情節/人物/場景雷同）\n"
            "- 如果是套用或仿寫，說明改寫的程度和原創的部分"
        )
    if detect_mode == "english_essay":
        return (
            "請直接用中文給出簡明的分析結論（2-4 句話），包含:\n"
            "- 你的判斷：「直接抄襲 (Direct Copy)」/「改寫 (Paraphrase Rewrite)」/"
            "「結構模仿 (Structural Imitation)」/「正常相似」\n"
            "- 你的信心程度：「high」/「medium」/「low」\n"
            "- 關鍵依據（具體指出哪些句子被逐字複製、哪些句子被改寫、"
            "哪些罕見短語共現、段落結構如何吻合）\n"
            "- 如果是改寫，說明改寫手法（同義詞替換/主被動轉換/從句重組）"
        )
    return (
        "請直接用中文給出簡明的分析結論（2-4 句話），包含:\n"
        "- 你的判斷：「高度疑似抄襲」/「可能抄襲」/「相似但可能巧合」/「正常相似」\n"
        "- 關鍵依據（具體指出哪些變量名/拼錯/死代碼/注釋雷同）\n"
        "- 如果發現 AI 生成嫌疑，額外提醒"
    )


# ================================================================
# Algorithm Summary Builders
# ================================================================

def build_algo_summary_for_llm(
    text_a: str,
    text_b: str,
    fragments: List[Dict],
    detect_mode: str = "chinese_essay",
) -> str:
    """構建算法中間產物摘要，供 LLM 參考。"""
    if not fragments:
        return ""

    detail = fragments[0] if fragments and fragments[0].get("type") == "dimension_breakdown" else None
    if not detail:
        return ""

    if detect_mode == "english_essay":
        return build_english_algo_summary(text_a, text_b, detail)

    # Lazy import: only sentence splitting, not analyzer entrypoints
    from app.domains.assignment.plagiarism_chinese_essay import split_chinese_sentences

    lines = []
    # 維度分數
    lines.append(
        f"各維度: 逐字={detail.get('verbatim_score', 0):.0f}% "
        f"句子={detail.get('comment_score', 0):.0f}% "
        f"語義={detail.get('identifier_score', 0):.0f}% "
        f"結構={detail.get('structure_score', 0):.0f}% "
        f"風格={detail.get('indent_score', 0):.0f}%"
    )

    # 開頭/結尾
    opening = detail.get("_opening_sim")
    ending = detail.get("_ending_sim")
    if opening is not None:
        lines.append(f"開頭相似度: {opening:.0f}% | 結尾相似度: {ending:.0f}%")

    # 對齊句對 Top-5
    aligned = detail.get("_aligned_pairs")
    if aligned:
        sents_a = split_chinese_sentences(text_a)
        sents_b = split_chinese_sentences(text_b)
        lines.append("\n### 最相似句對")
        for idx_a, idx_b, ratio in aligned[:5]:
            sa = sents_a[idx_a] if idx_a < len(sents_a) else "?"
            sb = sents_b[idx_b] if idx_b < len(sents_b) else "?"
            lines.append(f'A句{idx_a + 1}: "{sa[:60]}" ↔ B句{idx_b + 1}: "{sb[:60]}" ({ratio * 100:.0f}%)')

    # 對齊鏈
    span_info = detail.get("_span_coverage")
    if span_info and span_info.get("chain_count", 0) > 0:
        lines.append(
            f"\n對齊鏈: {span_info['chain_count']}條，"
            f"覆蓋{span_info['total_coverage']:.0%}，"
            f"最長{span_info['max_span_len']}字"
        )

    # 低頻共享短語
    rare = detail.get("_rare_phrases")
    if rare:
        lines.append(f"\n共享低頻短語: {'、'.join(rare[:5])}")

    return "\n".join(lines)


def build_english_algo_summary(
    text_a: str,
    text_b: str,
    detail: Dict,
) -> str:
    """構建英文作文算法中間產物摘要，供 LLM 參考。"""
    # Lazy import: only sentence splitting, not analyzer entrypoints
    from app.domains.assignment.plagiarism_english_essay import split_english_sentences

    lines = []

    # 維度分數（English labels for clarity）
    lines.append(
        f"各維度: Lexical Overlap={detail.get('verbatim_score', 0):.0f}% "
        f"Sentence Alignment={detail.get('comment_score', 0):.0f}% "
        f"Semantic Paraphrase={detail.get('identifier_score', 0):.0f}% "
        f"Discourse Structure={detail.get('structure_score', 0):.0f}% "
        f"Stylometry={detail.get('indent_score', 0):.0f}%"
    )

    # 開頭/結尾
    opening = detail.get("_opening_sim")
    ending = detail.get("_ending_sim")
    if opening is not None:
        lines.append(f"開頭相似度: {opening:.0f}% | 結尾相似度: {ending:.0f}%")

    # 風險評估
    risk_type = detail.get("_risk_type")
    if risk_type and isinstance(risk_type, dict):
        primary = risk_type.get("primary_risk", "unknown")
        conf = risk_type.get("risk_confidence_score", 0)
        lines.append(
            f"\n### 風險評估"
            f"\n主要風險類型: {primary} (算法信心: {conf:.0f}/100)"
            f"\n- Direct Copy 風險: {risk_type.get('risk_direct_copy', 0):.0f}"
            f"\n- Paraphrase 風險: {risk_type.get('risk_paraphrase', 0):.0f}"
            f"\n- Imitation 風險: {risk_type.get('risk_imitation', 0):.0f}"
        )

    # 罕見短語分數
    rare_score = detail.get("_rare_phrase_score")
    if rare_score is not None and rare_score > 0:
        lines.append(f"\n罕見短語重疊分數: {rare_score:.0f}%")

    # 罕見短語列表
    rare = detail.get("_rare_phrases")
    if rare:
        lines.append(f"共享罕見短語: {', '.join(rare[:8])}")

    # 對齊句對 Top-5
    aligned = detail.get("_aligned_pairs")
    if aligned:
        sents_a = split_english_sentences(text_a)
        sents_b = split_english_sentences(text_b)
        lines.append("\n### 最相似句對 (Aligned Sentence Pairs)")
        for idx_a, idx_b, ratio in aligned[:5]:
            sa = sents_a[idx_a] if idx_a < len(sents_a) else "?"
            sb = sents_b[idx_b] if idx_b < len(sents_b) else "?"
            # Truncate long English sentences for readability
            sa_display = sa[:80] + ("..." if len(sa) > 80 else "")
            sb_display = sb[:80] + ("..." if len(sb) > 80 else "")
            sim_pct = ratio * 100 if ratio <= 1 else ratio
            lines.append(
                f'A句{idx_a + 1}: "{sa_display}" ↔ '
                f'B句{idx_b + 1}: "{sb_display}" ({sim_pct:.0f}%)'
            )

    # 對齊鏈（span coverage）
    span_info = detail.get("_span_coverage")
    if span_info and isinstance(span_info, dict) and span_info.get("chain_count", 0) > 0:
        lines.append(
            f"\n對齊鏈: {span_info['chain_count']}條，"
            f"覆蓋{span_info['total_coverage']:.0%}，"
            f"最長{span_info['max_span_len']}句"
        )

    # 警告
    warnings = detail.get("_warnings")
    if warnings:
        lines.append(f"\n⚠️ 警告: {'；'.join(warnings)}")

    return "\n".join(lines)


# ================================================================
# Main AI Analysis Entry Point
# ================================================================

def ai_analyze_pair(
    text_a: str,
    text_b: str,
    similarity_score: float,
    ask_ai_func: Callable,
    settings: Any = None,
    detect_mode: str = "mixed",
    fragments: Optional[List[Dict]] = None,
) -> str:
    """
    調用 AI 模型分析兩份提交是否存在抄襲。

    Args:
        text_a: 提交 A 的文本
        text_b: 提交 B 的文本
        similarity_score: 算法計算的相似度分數
        ask_ai_func: AI 調用函數（原 self._ask_ai_func）
        settings: 應用設定（原 self._settings）
        detect_mode: 檢測模式
        fragments: matched_fragments 列表，第一項包含維度分數和中間產物

    Returns:
        AI 分析報告文本
    """
    if not ask_ai_func:
        return "AI 功能未啟用"

    # 截斷過長文本
    max_len = 3000
    excerpt_a = text_a[:max_len] + ("..." if len(text_a) > max_len else "")
    excerpt_b = text_b[:max_len] + ("..." if len(text_b) > max_len else "")

    mode_label = DETECTION_PRESETS.get(detect_mode, {}).get("label", "混合")
    mode_hint = {
        "code": "這是中學電腦課的代碼作業。注意: 簡單題目（如冒泡排序）結構天然相似，不能僅靠結構判斷。",
        "text": "這是文字類作業，重點關注段落是否整段複製、改寫是否只是同義詞替換。",
        "mixed": "這份作業可能包含代碼和文字，請根據實際內容特徵自行判斷最適合的分析策略。",
        "chinese_essay": (
            "這是中文作文作業。請判斷兩篇作文之間是否存在以下關係：\n"
            "1. **直接抄襲**: 原封不動或只改了幾個字（如換了人物稱呼、地名等）\n"
            "2. **套用/改寫**: 故事情節完全相同，但用自己的語言重新敘述\n"
            "3. **仿寫/模仿**: 模仿了結構和寫法，但內容有較多原創\n\n"
            "請重點關注：關鍵情節/事件是否對應、人物角色是否只是換了稱呼、"
            "場景描寫是否雷同、結尾抒情模式是否相同、是否存在共同的特殊表達或錯別字。\n"
            "注意：分數判定不是你的職責，你只需要識別和分類抄襲類型，並給出具體證據。"
        ),
        "english_essay": (
            "這是英文作文作業。請判斷兩篇作文之間是否存在以下關係：\n"
            "1. **Direct Copy（直接抄襲）**: 大段原文照搬，或只做了拼寫、大小寫等表面改動\n"
            "2. **Paraphrase Rewrite（改寫）**: 用同義詞替換、主被動轉換、從句重組等手法改寫\n"
            "3. **Structural Imitation（結構模仿）**: 段落組織、論點順序、開頭結尾模式高度相似\n\n"
            "請重點關注：是否有逐字複製的句子、同義詞是否系統性替換、罕見短語是否共現、"
            "段落功能序列（intro→evidence→counter→conclusion）是否相同、"
            "開頭或結尾是否雷同、文體特徵（句長分佈、功能詞頻率）是否異常一致。\n"
            "注意：分數判定不是你的職責，你只需要識別和分類抄襲類型，並給出具體證據。"
        ),
    }.get(detect_mode, "")

    # 構建算法中間產物摘要（中文/英文作文模式）
    algo_summary = ""
    if detect_mode in ("chinese_essay", "english_essay") and fragments:
        algo_summary = build_algo_summary_for_llm(
            text_a, text_b, fragments, detect_mode=detect_mode,
        )

    prompt = f"""你是一位專業的學術誠信分析師，專門分析中學生作業。請分析以下兩份學生提交是否存在抄襲。

## 作業類型: {mode_label}
{mode_hint}

## 自動檢測結果
綜合相似度: {similarity_score:.1f}%（基於多維度加權得分）
{algo_summary}

## 提交 A 的內容
{excerpt_a}

## 提交 B 的內容
{excerpt_b}

## 分析要求
{get_analysis_requirements(detect_mode)}

## 回答格式
{get_response_format(detect_mode)}
"""

    try:
        model = None
        if settings and hasattr(settings, "llm_local_model"):
            model = settings.llm_local_model

        answer, _ = ask_ai_func(
            question=prompt,
            subject_code="general",
            use_api=False,
            conversation_history=[],
            model=model,
            task_type="summary",  # 關閉 thinking + 低 temperature 提高一致性
        )
        return answer.strip() if answer else "AI 未返回結果"
    except Exception as e:
        logger.warning("AI 抄襲分析失敗: %s", e)
        return f"AI 分析失敗: {e}"
