"""
題目 SVG / Chart 增強 — 基礎設施
==================================
為 AI 生成的題目添加幾何 SVG 和統計圖表 SVG。

依賴：SubjectHandlerRegistry（唯讀）、geometry_engine、svg_renderer、chart_renderer
這些都是無狀態工具模組，import 即用。

SVG 是增強項，任何異常只跳過該題，不影響主鏈路（fail-soft）。
"""

import json
import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)


# ================================================================
# SVG 安全過濾
# ================================================================

def sanitize_svg(text: str) -> str:
    """清除 SVG 中的危險內容，保留安全繪圖標籤。"""
    if not text or "<" not in text:
        return text
    # 刪除危險標籤
    text = re.sub(
        r"<(script|foreignObject|image|iframe|object|embed)[^>]*>.*?</\1>",
        "", text, flags=re.DOTALL | re.IGNORECASE,
    )
    text = re.sub(
        r"<(script|foreignObject|image|iframe|object|embed)[^>]*/?\s*>",
        "", text, flags=re.IGNORECASE,
    )
    # 刪除事件處理器屬性
    text = re.sub(r"\s+on\w+\s*=\s*[\"'][^\"']*[\"']", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+on\w+\s*=\s*\S+", "", text, flags=re.IGNORECASE)
    # 刪除 javascript: / data:text/html URL
    text = re.sub(r"javascript\s*:", "", text, flags=re.IGNORECASE)
    text = re.sub(r"data\s*:\s*text/html", "", text, flags=re.IGNORECASE)
    return text


# ================================================================
# 幾何 SVG 增強（3 階段管線：LLM spec → 約束求解 → 確定性渲染）
# ================================================================

async def enrich_with_svg(questions: list, subject: str) -> None:
    """
    為 needs_svg=True 的題目生成幾何 SVG，直接修改 questions list。

    管線：
      Step 1 (LLM): 題目 → geometry spec JSON（幾何語義提取）
      Step 2 (Python): spec JSON → 座標（約束求解器）
      Step 3 (Python): 座標 → SVG（確定性渲染器）
    """
    from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry

    handler = SubjectHandlerRegistry.get(subject)
    if not handler.supports_svg_generation:
        return

    from llm.config import get_llm_config
    from app.core.ai_gate import Priority, Weight
    from app.infrastructure.ai_pipeline.llm_caller import call_ollama_json

    svg_model = get_llm_config().svg_model
    has_spec_mode = bool(handler.build_geometry_spec_prompt("test"))

    svg_triggered = 0
    svg_success = 0

    for i, q in enumerate(questions):
        text = q.get("question", "")
        if q.get("needs_svg") is False:
            continue
        needs = q.get("needs_svg", None)
        if needs is None:
            needs = handler.needs_svg(text)
        if not needs or "<svg" in text:
            continue

        svg_triggered += 1
        try:
            svg = await _generate_svg_two_step(
                handler, text, svg_model, has_spec_mode, i + 1,
            )
            if svg:
                svg = sanitize_svg(svg)
                if "<svg" in svg and "</svg>" in svg:
                    q["question_svg"] = svg
                    svg_success += 1
                    logger.info("題 %d SVG 生成成功", i + 1)
                else:
                    logger.warning("題 %d SVG 清洗後無效，跳過", i + 1)
            else:
                logger.info("題 %d 無 SVG 輸出，跳過", i + 1)
        except Exception as e:
            logger.warning("題 %d SVG 生成失敗: %s", i + 1, e)

    if svg_triggered:
        logger.info(
            "SVG 生成完成: 觸發=%d, 成功=%d, 失敗=%d",
            svg_triggered, svg_success, svg_triggered - svg_success,
        )


async def _generate_svg_two_step(
    handler, question_text: str, svg_model: str,
    has_spec_mode: bool, question_num: int,
) -> str:
    """
    兩步 SVG 生成：
      Step 1 (LLM): 題目 → geometry spec JSON
      Step 2 (Python): spec → 約束求解 → 確定性渲染
    """
    from app.core.ai_gate import Priority, Weight
    from app.infrastructure.ai_pipeline.llm_caller import call_ollama_json

    gate_kwargs = dict(
        model=svg_model,
        timeout=120.0,
        gate_task="svg_geometry",
        gate_priority=Priority.BATCH,
        gate_weight=Weight.SVG_GEOMETRY,
    )

    if not has_spec_mode:
        return ""

    try:
        # Step 1: LLM 提取幾何約束
        spec_prompt = handler.build_geometry_spec_prompt(question_text)
        spec_raw = await call_ollama_json(spec_prompt, **gate_kwargs)

        spec_data = None
        if spec_raw:
            try:
                spec_data = json.loads(spec_raw)
            except json.JSONDecodeError:
                m = re.search(r'\{[\s\S]*\}', spec_raw)
                if m:
                    try:
                        spec_data = json.loads(m.group())
                    except json.JSONDecodeError:
                        pass

        if not spec_data or spec_data.get("skip"):
            logger.info("題 %d spec 提取為 skip 或無結果", question_num)
            return ""

        logger.info(
            "題 %d 約束 spec 提取成功, spec=%s",
            question_num,
            json.dumps(spec_data, ensure_ascii=False)[:500],
        )

        # Step 2: Python 約束求解器 → 座標
        from app.domains.mistake_book.geometry_engine import (
            solve_geometry_spec, GeometrySolveError,
        )
        try:
            renderer_spec = solve_geometry_spec(spec_data)
        except GeometrySolveError as e:
            logger.warning("題 %d solver 失敗: %s", question_num, e)
            return ""

        # Step 3: Python 確定性渲染
        from app.domains.mistake_book.svg_renderer import render_svg_from_spec
        svg = render_svg_from_spec(renderer_spec)
        if svg and "<svg" in svg:
            logger.info("題 %d V3 solver + renderer SVG 生成成功", question_num)
            return svg
        logger.warning("題 %d renderer 輸出為空", question_num)
        return ""

    except Exception as e:
        logger.warning("題 %d V3 管線失敗: %s", question_num, e)
        return ""


# ================================================================
# 統計圖表 SVG 增強（chart_spec → 確定性渲染）
# ================================================================

def enrich_with_charts(questions: list, subject: str) -> None:
    """
    為含 chart_spec 的題目生成統計圖表 SVG，直接修改 questions list。

    question_svg 與幾何 SVG 共用同一字段（同一題不會同時需要兩者）。
    """
    from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
    from app.domains.mistake_book.chart_renderer import render_chart_from_spec

    handler = SubjectHandlerRegistry.get(subject)

    chart_triggered = 0
    chart_success = 0

    for i, q in enumerate(questions):
        # 已有 SVG（幾何題已生成），跳過
        if q.get("question_svg"):
            continue

        chart_spec = q.get("chart_spec")
        if not chart_spec:
            needs = q.get("needs_chart", None)
            if needs is None:
                needs = handler.needs_chart(q.get("question", ""))
            if not needs:
                continue
            logger.info("題 %d needs_chart=True 但無 chart_spec，跳過圖表生成", i + 1)
            continue

        chart_triggered += 1
        try:
            svg = render_chart_from_spec(chart_spec)
            if svg and "<svg" in svg:
                q["question_svg"] = svg
                chart_success += 1
                logger.info(
                    "題 %d chart SVG 生成成功 (type=%s)",
                    i + 1, chart_spec.get("type", "?"),
                )
            else:
                logger.warning(
                    "題 %d chart SVG 為空 (type=%s)",
                    i + 1, chart_spec.get("type", "?"),
                )
        except Exception as e:
            logger.warning(
                "題 %d chart SVG 生成失敗 (type=%s): %s",
                i + 1, chart_spec.get("type", "?"), e,
            )

        # 無論成功或失敗，都移除 chart_spec（不顯示給用戶）
        q.pop("chart_spec", None)
        q.pop("needs_chart", None)

    if chart_triggered:
        logger.info(
            "Chart SVG 生成完成: 觸發=%d, 成功=%d, 失敗=%d",
            chart_triggered, chart_success, chart_triggered - chart_success,
        )
