"""
課室日誌 — 報告構建器

負責 prompt context 構造、report input normalization、prompt text generation。
"""

import json
import logging
from typing import Any, Callable, Dict, List, Optional

from app.domains.class_diary.anomaly_detection import detect_anomalies
from app.domains.class_diary.prompts import (
    DAILY_REPORT_SYSTEM_PROMPT,
    RANGE_REPORT_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


def build_daily_report_prompt(
    entries: List[Dict[str, Any]],
    anomalies: List[Dict[str, Any]],
    report_date: str,
    format_behavior_fn: Optional[Callable] = None,
) -> str:
    """把當天所有記錄組織成給 AI 的提問文本。

    Args:
        entries: 課堂評級記錄列表
        anomalies: 異常記錄列表（由 detect_anomalies 生成）
        report_date: 報告日期
        format_behavior_fn: 行為欄位格式化函數
    """
    if format_behavior_fn is None:
        format_behavior_fn = _identity

    if not entries:
        return f"日期：{report_date}\n今天沒有任何課堂記錄。請簡單說明沒有數據。"

    by_class: Dict[str, list] = {}
    for e in entries:
        cc = e.get("class_code", "unknown")
        by_class.setdefault(cc, []).append(e)

    lines = [f"日期：{report_date}", f"共 {len(by_class)} 個班有記錄，合計 {len(entries)} 條。", ""]

    for cc, class_entries in sorted(by_class.items()):
        disc_avg = sum(int(e.get("discipline_rating") or 0) for e in class_entries) / len(class_entries)
        clean_avg = sum(int(e.get("cleanliness_rating") or 0) for e in class_entries) / len(class_entries)
        lines.append(f"【班級 {cc}】 {len(class_entries)} 條記錄, 平均紀律 {disc_avg:.1f}, 平均整潔 {clean_avg:.1f}")

        for e in class_entries:
            absent = (e.get("absent_students") or "").strip()
            late = (e.get("late_students") or "").strip()
            violations = format_behavior_fn((e.get("rule_violations") or "").strip())
            appearance = format_behavior_fn((e.get("appearance_issues") or "").strip())
            commended = format_behavior_fn((e.get("commended_students") or "").strip())
            medical = format_behavior_fn((e.get("medical_room_students") or "").strip())

            detail = (
                f"  節{e.get('period_start', '?')}-{e.get('period_end', '?')} "
                f"{e.get('subject', '')} 紀律{e.get('discipline_rating', '?')} "
                f"整潔{e.get('cleanliness_rating', '?')}"
            )
            if absent:
                detail += f" 缺席:{absent}"
            if late:
                detail += f" 遲到:{late}"
            if violations:
                detail += f" 違規:{violations}"
            if appearance:
                detail += f" 儀表:{appearance}"
            if commended:
                detail += f" 嘉許:{commended}"
            if medical:
                detail += f" 醫務室:{medical}"
            lines.append(detail)
        lines.append("")

    if anomalies:
        lines.append(f"===== 異常記錄（共 {len(anomalies)} 條） =====")
        for a in anomalies:
            lines.append(
                f"  {a['class_code']} 節{a.get('period_start', '?')}-{a.get('period_end', '?')} "
                f"{a['subject']}: {', '.join(a['reasons'])}"
            )

    return "\n".join(lines)


def build_range_report_prompt(
    agg: Dict[str, Any],
    start_date: str,
    end_date: str,
) -> str:
    """將日期範圍聚合數據組織成給 AI 的提問文本。"""
    ov = agg.get("overview", {})
    lines = [
        f"日期範圍：{start_date} 至 {end_date}",
        f"總記錄：{ov.get('total_entries', 0)} 條，"
        f"涉及 {ov.get('total_classes', 0)} 個班級，"
        f"共 {ov.get('total_dates', 0)} 天",
        f"平均紀律：{ov.get('avg_discipline', '-')}，平均整潔：{ov.get('avg_cleanliness', '-')}",
        f"總缺席：{ov.get('total_absent', 0)} 人次，總遲到：{ov.get('total_late', 0)} 人次",
        "",
    ]

    daily = agg.get("daily_summary", [])
    if daily:
        lines.append("=== 每日趨勢 ===")
        for d in daily[-14:]:
            lines.append(
                f"  {d.get('date', '?')}: 記錄{d.get('entry_count', 0)} "
                f"紀律{d.get('avg_discipline', '-')} 整潔{d.get('avg_cleanliness', '-')} "
                f"缺席{d.get('absent_count', 0)} 遲到{d.get('late_count', 0)} "
                f"違規{d.get('violation_count', 0)} 表揚{d.get('praise_count', 0)}"
            )
        lines.append("")

    risk = agg.get("risk_students", [])
    if risk:
        lines.append(f"=== 高風險學生（{len(risk)} 位）===")
        for s in risk[:10]:
            flags = ", ".join(s.get("risk_flags", []))
            lines.append(
                f"  {s.get('name', '?')} ({s.get('class_code', '?')}) "
                f"違規{s.get('violation_count', 0)} 缺席{s.get('absent_count', 0)} "
                f"遲到{s.get('late_count', 0)} 風險:{flags}"
            )
        lines.append("")

    reasons = agg.get("reason_analysis", [])
    if reasons:
        lines.append("=== 主要原因 (Top 10) ===")
        for r in reasons[:10]:
            lines.append(
                f"  {r.get('reason', '?')} ({r.get('category', '?')}) "
                f"{r.get('total_count', 0)}人次 涉及{r.get('student_count', 0)}學生"
            )
        lines.append("")

    return "\n".join(lines)


def split_report_versions(ai_output: str):
    """將 AI 輸出拆分為完整版和摘要版。

    Returns:
        (full_text, summary_text) 元組
    """
    full_text = ai_output
    summary_text = ""

    if "===摘要版===" in ai_output:
        parts = ai_output.split("===摘要版===", 1)
        full_text = parts[0].replace("===完整版===", "").strip()
        summary_text = parts[1].strip()
    elif "===完整版===" in ai_output:
        full_text = ai_output.replace("===完整版===", "").strip()

    return full_text, summary_text


def _identity(value: str) -> str:
    return value
