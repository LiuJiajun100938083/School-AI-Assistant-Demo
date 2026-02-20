"""
自適應學習引擎 (Adaptive Learning Engine)
=========================================
基於 SM-2 間隔重複算法 + 智能選題策略，
為每個學生提供個性化的學習排程和練習推薦。

設計原則：
- 補弱優先：薄弱知識點優先練習
- 防遺忘：已掌握的知識點定期複習
- 信心增強：適當穿插簡單題目
- 可擴展：預留學習路徑推薦、風險預測接口
"""

import logging
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# 間隔重複參數（SM-2 變體）
DEFAULT_INTERVAL_HOURS = 24
MIN_INTERVAL_HOURS = 4
MAX_INTERVAL_DAYS = 90
EASE_FACTOR_DEFAULT = 2.5
EASE_FACTOR_MIN = 1.3


class AdaptiveLearningEngine:
    """
    自適應學習引擎

    核心能力：
    1. 間隔重複排程（Spaced Repetition）
    2. 智能選題策略
    3. 掌握度動態更新
    """

    # ================================================================
    # 間隔重複排程
    # ================================================================

    @staticmethod
    def calculate_next_review(
        review_count: int,
        last_result: str,
        current_interval_hours: float = DEFAULT_INTERVAL_HOURS,
        ease_factor: float = EASE_FACTOR_DEFAULT,
    ) -> Tuple[datetime, float, float]:
        """
        計算下次複習時間（SM-2 算法變體）

        Args:
            review_count: 已複習次數
            last_result: 'remembered' | 'partial' | 'forgot'
            current_interval_hours: 當前間隔（小時）
            ease_factor: 難易因子

        Returns:
            (next_review_at, new_interval_hours, new_ease_factor)
        """
        now = datetime.now()

        if last_result == "forgot":
            new_interval = MIN_INTERVAL_HOURS
            new_ease = max(EASE_FACTOR_MIN, ease_factor - 0.3)

        elif last_result == "partial":
            new_interval = current_interval_hours * 1.2
            new_ease = max(EASE_FACTOR_MIN, ease_factor - 0.1)

        else:  # remembered
            if review_count <= 1:
                new_interval = DEFAULT_INTERVAL_HOURS
            elif review_count == 2:
                new_interval = DEFAULT_INTERVAL_HOURS * 3
            else:
                new_interval = current_interval_hours * ease_factor

            new_ease = ease_factor + 0.1

        max_hours = MAX_INTERVAL_DAYS * 24
        new_interval = min(new_interval, max_hours)
        new_interval = max(new_interval, MIN_INTERVAL_HOURS)

        next_review = now + timedelta(hours=new_interval)

        return next_review, new_interval, new_ease

    # ================================================================
    # 智能選題策略
    # ================================================================

    @staticmethod
    def select_practice_targets(
        mastery_data: List[Dict],
        mistake_points: List[Dict],
        count: int = 5,
        strategy: str = "balanced",
    ) -> List[Dict]:
        """
        智能選擇練習目標知識點

        策略說明：
        - balanced（默認）：60% 補弱 + 20% 防遺忘 + 20% 增信心
        - weakness_first：80% 補弱 + 20% 防遺忘
        - review_all：均勻複習所有知識點

        Args:
            mastery_data: 學生各知識點掌握度
                [{point_code, mastery_level, last_practice_at, trend, ...}]
            mistake_points: 錯題中出現頻率最高的知識點
                [{point_code, point_name, mistake_count, mastery_level, ...}]
            count: 需要選擇的知識點數量
            strategy: 選題策略

        Returns:
            選中的知識點列表 [{point_code, point_name, reason, priority}]
        """
        if not mastery_data and not mistake_points:
            return []

        selected = []
        used_codes = set()

        if strategy == "balanced":
            weak_count = max(1, int(count * 0.6))
            stale_count = max(1, int(count * 0.2))
            easy_count = count - weak_count - stale_count
        elif strategy == "weakness_first":
            weak_count = max(1, int(count * 0.8))
            stale_count = count - weak_count
            easy_count = 0
        else:
            weak_count = count
            stale_count = 0
            easy_count = 0

        # 1) 薄弱知識點（掌握度最低 + 錯題最多）
        weakness_pool = sorted(
            mistake_points,
            key=lambda x: (x.get("mastery_level", 50), -x.get("mistake_count", 0)),
        )
        for wp in weakness_pool:
            if len(selected) >= weak_count:
                break
            code = wp.get("point_code")
            if code and code not in used_codes:
                selected.append({
                    "point_code": code,
                    "point_name": wp.get("point_name", ""),
                    "category": wp.get("category", ""),
                    "reason": "weakness",
                    "priority": 1,
                    "mastery_level": wp.get("mastery_level", 0),
                })
                used_codes.add(code)

        # 2) 久未練習的知識點（防遺忘）
        now = datetime.now()
        stale_pool = sorted(
            mastery_data,
            key=lambda x: x.get("last_practice_at") or datetime.min,
        )
        for sp in stale_pool:
            if len(selected) >= weak_count + stale_count:
                break
            code = sp.get("point_code")
            if code and code not in used_codes:
                last = sp.get("last_practice_at")
                if last is None or (now - last).days > 7:
                    selected.append({
                        "point_code": code,
                        "point_name": sp.get("point_name", ""),
                        "category": sp.get("category", ""),
                        "reason": "stale",
                        "priority": 2,
                        "mastery_level": sp.get("mastery_level", 50),
                    })
                    used_codes.add(code)

        # 3) 已掌握的知識點（增強信心）
        strong_pool = sorted(
            mastery_data,
            key=lambda x: -x.get("mastery_level", 0),
        )
        for ep in strong_pool:
            if len(selected) >= count:
                break
            code = ep.get("point_code")
            if code and code not in used_codes and ep.get("mastery_level", 0) >= 70:
                selected.append({
                    "point_code": code,
                    "point_name": ep.get("point_name", ""),
                    "category": ep.get("category", ""),
                    "reason": "confidence",
                    "priority": 3,
                    "mastery_level": ep.get("mastery_level", 80),
                })
                used_codes.add(code)

        # 4) 下降趨勢的知識點（及時干預）— 插入到隊列中
        declining = [
            m for m in mastery_data
            if m.get("trend") == "declining" and m.get("point_code") not in used_codes
        ]
        for dp in declining[:2]:
            code = dp.get("point_code")
            if code:
                selected.insert(0, {
                    "point_code": code,
                    "point_name": dp.get("point_name", ""),
                    "category": dp.get("category", ""),
                    "reason": "declining",
                    "priority": 0,
                    "mastery_level": dp.get("mastery_level", 40),
                })
                used_codes.add(code)

        return selected[:count]

    # ================================================================
    # 掌握度更新模型
    # ================================================================

    @staticmethod
    def calculate_mastery_update(
        current_mastery: int,
        is_correct: bool,
        difficulty: int = 3,
        consecutive_correct: int = 0,
        consecutive_wrong: int = 0,
    ) -> Tuple[int, str]:
        """
        計算掌握度更新值

        Args:
            current_mastery: 當前掌握度 (0-100)
            is_correct: 是否答對
            difficulty: 題目難度 (1-5)
            consecutive_correct: 連續答對次數
            consecutive_wrong: 連續答錯次數

        Returns:
            (new_mastery, trend)
            trend: 'improving' | 'declining' | 'stable'
        """
        base_delta = {1: 3, 2: 5, 3: 8, 4: 12, 5: 15}.get(difficulty, 8)

        if is_correct:
            # 答對：掌握度低時提升快，掌握度高時提升慢
            scale = 1.0 - (current_mastery / 200.0)
            streak_bonus = min(consecutive_correct * 0.1, 0.3)
            delta = base_delta * (scale + streak_bonus)
            new_mastery = min(100, current_mastery + int(delta))
        else:
            # 答錯：掌握度高時下降慢（偶爾失誤），掌握度低時下降快
            scale = 0.5 + (current_mastery / 200.0)
            streak_penalty = min(consecutive_wrong * 0.15, 0.45)
            delta = base_delta * (scale + streak_penalty) * 0.6
            new_mastery = max(0, current_mastery - int(delta))

        # 趨勢判斷
        change = new_mastery - current_mastery
        if change > 3:
            trend = "improving"
        elif change < -3:
            trend = "declining"
        else:
            trend = "stable"

        return new_mastery, trend

    # ================================================================
    # 擴展接口（未來實現）
    # ================================================================

    def get_learning_path(
        self, student_username: str, subject: str
    ) -> List[Dict]:
        """
        [未來] 推薦完整學習路線

        根據知識圖譜的前置依賴關係和學生掌握度，
        推薦最優學習順序。
        """
        raise NotImplementedError("學習路徑推薦功能開發中")

    def predict_risk(self, student_username: str) -> Dict:
        """
        [未來] 預測學習風險

        基於學習頻率、掌握度變化趨勢、錯題增長率，
        預測學生是否即將掉隊。
        """
        raise NotImplementedError("風險預測功能開發中")

    def adapt_difficulty(
        self, student_username: str, subject: str
    ) -> int:
        """
        [未來] 動態調整出題難度

        根據學生近期表現自動調整，
        保持在「學習區」（不太簡單也不太難）。
        """
        raise NotImplementedError("難度自適應功能開發中")
