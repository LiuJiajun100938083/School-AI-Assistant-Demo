"""
課室日誌 — 異常檢測模組（純規則/算法）

純函數設計，接收配置而非硬編碼，易於單元測試。
"""

from typing import Any, Dict, List, Optional

from app.domains.class_diary.constants import DiaryThresholds


def detect_anomalies(
    entries: List[Dict[str, Any]],
    low_rating: int = DiaryThresholds.LOW_RATING,
    high_absent_count: int = DiaryThresholds.HIGH_ABSENT_COUNT,
    format_behavior_fn=None,
) -> List[Dict[str, Any]]:
    """規則檢測異常記錄。

    Args:
        entries: 課堂評級記錄列表
        low_rating: 低分閾值（紀律/整潔 ≤ 此值視為異常）
        high_absent_count: 缺席人數超過此值視為異常
        format_behavior_fn: 行為欄位格式化函數（可選，用於截斷顯示）

    Returns:
        異常記錄列表，每條含 entry_id、class_code、reasons 等
    """
    if format_behavior_fn is None:
        format_behavior_fn = _default_format

    anomalies = []
    for e in entries:
        reasons = []

        if e.get("discipline_rating") and int(e["discipline_rating"]) <= low_rating:
            reasons.append(f"紀律評分低 ({e['discipline_rating']}/5)")
        if e.get("cleanliness_rating") and int(e["cleanliness_rating"]) <= low_rating:
            reasons.append(f"整潔評分低 ({e['cleanliness_rating']}/5)")

        absent = (e.get("absent_students") or "").strip()
        if absent:
            count = len([s for s in absent.split(",") if s.strip()])
            if count > high_absent_count:
                reasons.append(f"缺席人數多 ({count}人)")

        violations_raw = (e.get("rule_violations") or "").strip()
        if violations_raw:
            reasons.append(f"課堂違規: {format_behavior_fn(violations_raw)[:80]}")
        appearance_raw = (e.get("appearance_issues") or "").strip()
        if appearance_raw:
            reasons.append(f"儀表問題: {format_behavior_fn(appearance_raw)[:80]}")
        medical_raw = (e.get("medical_room_students") or "").strip()
        if medical_raw:
            reasons.append(f"醫務室: {format_behavior_fn(medical_raw)[:80]}")

        if reasons:
            anomalies.append({
                "entry_id": e.get("id"),
                "class_code": e.get("class_code", ""),
                "period_start": e.get("period_start"),
                "period_end": e.get("period_end"),
                "subject": e.get("subject", ""),
                "reasons": reasons,
            })

    return anomalies


def _default_format(value: str) -> str:
    """默認格式化：原文返回"""
    return value
