"""
課室日誌 — 常量定義
"""


class DiaryThresholds:
    """異常檢測閾值（默認值，Service 可接收 config 覆蓋）"""

    LOW_RATING = 2           # 紀律/整潔 ≤ 此值視為低分
    HIGH_RATING = 4.0        # 評分 ≥ 此值視為優秀
    HIGH_ABSENT_COUNT = 3    # 缺席人數 > 此值視為異常


PERIOD_LABELS = [
    "早會", "第一節", "第二節", "第三節", "第四節",
    "第五節", "第六節", "第七節", "第八節", "第九節",
]
