"""
AI 出題管線 — 基礎設施層
============================
提供 LLM 調用、JSON 解析、SVG/Chart 增強等通用能力。

被 mistake_book 和 exam_creator 等多個域共用。
依賴方向：域 → 此模組 → ai_gate / geometry_engine / chart_renderer
"""

from app.infrastructure.ai_pipeline.llm_caller import (
    call_llm_json,
    call_ollama_json,
    parse_questions_json,
    repair_latex_json,
)
from app.infrastructure.ai_pipeline.question_enricher import (
    enrich_with_charts,
    enrich_with_svg,
    sanitize_svg,
)

__all__ = [
    "call_llm_json",
    "call_ollama_json",
    "parse_questions_json",
    "repair_latex_json",
    "enrich_with_svg",
    "enrich_with_charts",
    "sanitize_svg",
]
