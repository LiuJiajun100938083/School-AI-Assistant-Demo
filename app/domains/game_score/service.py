#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自定義遊戲計分 — Service 層

封裝計分、排行榜、設定管理、CSV 導出等所有業務邏輯。
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domains.game_score.exceptions import (
    AlreadyPlayedError,
    GameNotFoundForScoreError,
    MaxAttemptsReachedError,
    ScoreRateLimitError,
)
from app.domains.game_score.repository import GameScoreRepository
from app.domains.game_upload.repository import GameUploadRepository

logger = logging.getLogger(__name__)

EXPORT_COLUMNS = [
    ("student_name", "學生姓名"),
    ("class_name", "班級"),
    ("score", "分數"),
    ("extra_data", "額外數據"),
    ("played_at", "遊玩時間"),
]

RATE_LIMIT_SECONDS = 5


class GameScoreService:
    """自定義遊戲計分業務服務"""

    def __init__(
        self,
        score_repo: GameScoreRepository,
        game_repo: GameUploadRepository,
    ):
        self._score_repo = score_repo
        self._game_repo = game_repo

    # ============================================================
    # 初始化
    # ============================================================

    def init_system(self) -> None:
        """初始化系統（建表）"""
        try:
            self._score_repo.init_table()
            logger.info("自定義遊戲計分系統初始化完成")
        except Exception as e:
            logger.error("自定義遊戲計分系統初始化失敗: %s", e)
            raise

    # ============================================================
    # 分數提交
    # ============================================================

    def submit_score(
        self,
        game_uuid: str,
        student_id: int,
        student_name: str,
        class_name: str,
        score: int,
        extra_data: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        提交遊戲分數。

        流程：驗證遊戲存在 → 讀取設定 → 檢查次數限制 → 限流 → 寫入 → 返回結果
        """
        # ① 驗證遊戲存在
        game = self._game_repo.find_by_uuid(game_uuid)
        if not game:
            raise GameNotFoundForScoreError(game_uuid)

        # ② 讀取計分設定
        settings = self._score_repo.get_settings(game_uuid)

        # ③ 檢查遊玩次數限制
        if not settings["allow_multiple_plays"]:
            existing = self._score_repo.count_student_plays(game_uuid, student_id)
            if existing > 0:
                raise AlreadyPlayedError(game_uuid)
        elif settings["max_attempts"] is not None:
            played = self._score_repo.count_student_plays(game_uuid, student_id)
            if played >= settings["max_attempts"]:
                raise MaxAttemptsReachedError(game_uuid, settings["max_attempts"])

        # ④ 防刷限流（5 秒冷卻）
        recent = self._score_repo.count_plays_since(
            game_uuid, student_id, RATE_LIMIT_SECONDS
        )
        if recent > 0:
            raise ScoreRateLimitError()

        # ⑤ 取舊最高分
        previous_best = self._score_repo.get_student_best_score(game_uuid, student_id)
        previous_best_score = previous_best["score"] if previous_best else None

        # ⑥ 寫入
        record = {
            "game_uuid": game_uuid,
            "student_id": student_id,
            "student_name": student_name,
            "class_name": class_name,
            "score": score,
            "extra_data": extra_data,
        }
        new_id = self._score_repo.create_score(record)

        # ⑦ 判斷是否新紀錄
        is_new_best = previous_best_score is None or score > previous_best_score

        logger.info(
            "遊戲分數已記錄: game=%s, student=%d, score=%d, is_new_best=%s",
            game_uuid, student_id, score, is_new_best,
        )
        return {
            "id": new_id,
            "message": "新紀錄！" if is_new_best else "分數已記錄",
            "is_new_best": is_new_best,
            "previous_best": previous_best_score,
        }

    # ============================================================
    # 排行榜
    # ============================================================

    def get_leaderboard(self, game_uuid: str, limit: int = 50) -> List[Dict[str, Any]]:
        """獲取排行榜（按遊戲設定的取分策略）"""
        settings = self._score_repo.get_settings(game_uuid)
        policy = settings.get("score_policy", "best")

        rows = self._score_repo.get_leaderboard(game_uuid, policy=policy, limit=limit)
        for idx, row in enumerate(rows, 1):
            row["rank"] = idx
        return rows

    # ============================================================
    # 學生查詢
    # ============================================================

    def get_student_scores(
        self, game_uuid: str, student_id: int
    ) -> List[Dict[str, Any]]:
        """獲取學生在指定遊戲的歷史成績"""
        return self._score_repo.get_student_scores(game_uuid, student_id)

    # ============================================================
    # 老師查詢
    # ============================================================

    def get_all_scores(
        self, game_uuid: str, class_name: Optional[str] = None
    ) -> Dict[str, Any]:
        """老師查詢全部成績（含統計摘要）"""
        scores = self._score_repo.get_all_scores(game_uuid, class_name)
        classes = self._score_repo.get_class_list(game_uuid)

        total = len(scores)
        avg_score = (
            round(sum(s.get("score", 0) for s in scores) / total)
            if total > 0
            else 0
        )

        return {
            "scores": scores,
            "classes": classes,
            "summary": {
                "total_plays": total,
                "avg_score": avg_score,
            },
        }

    def delete_score(self, score_id: int) -> bool:
        """老師刪除單條成績記錄"""
        affected = self._score_repo.delete_score(score_id)
        if affected > 0:
            logger.info("老師已刪除遊戲成績 score_id=%d", score_id)
        return affected > 0

    # ============================================================
    # Settings 管理
    # ============================================================

    def get_settings(self, game_uuid: str) -> Dict[str, Any]:
        """讀取遊戲計分設定（不存在則返回默認值）"""
        return self._score_repo.get_settings(game_uuid)

    def update_settings(
        self,
        game_uuid: str,
        data: Dict[str, Any],
        updated_by: int,
    ) -> Dict[str, Any]:
        """老師修改遊戲計分設定"""
        # 過濾 None 值（部分更新）
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return self.get_settings(game_uuid)

        # bool → int（MySQL TINYINT）
        if "allow_multiple_plays" in update_data:
            update_data["allow_multiple_plays"] = (
                1 if update_data["allow_multiple_plays"] else 0
            )

        update_data["updated_by"] = updated_by
        self._score_repo.upsert_settings(game_uuid, update_data)

        logger.info(
            "遊戲計分設定已更新: game=%s, by=%d, data=%s",
            game_uuid, updated_by, update_data,
        )
        return self.get_settings(game_uuid)

    # ============================================================
    # 導出
    # ============================================================

    def export_scores_csv(
        self, game_uuid: str, class_name: Optional[str] = None
    ) -> bytes:
        """導出成績為 CSV（BOM UTF-8）"""
        scores = self._score_repo.export_scores(game_uuid, class_name)

        lines: list[str] = []
        headers = [col[1] for col in EXPORT_COLUMNS]
        lines.append(",".join(headers))

        for s in scores:
            row: list[str] = []
            for col_key, _ in EXPORT_COLUMNS:
                val = s.get(col_key, "")

                if col_key == "played_at" and isinstance(val, datetime):
                    val = val.strftime("%Y-%m-%d %H:%M")
                elif col_key == "extra_data":
                    if isinstance(val, dict):
                        val = json.dumps(val, ensure_ascii=False)
                    elif val is None:
                        val = ""

                val_str = str(val) if val is not None else ""
                if "," in val_str or '"' in val_str or "\n" in val_str:
                    val_str = '"' + val_str.replace('"', '""') + '"'
                row.append(val_str)

            lines.append(",".join(row))

        csv_content = "\n".join(lines)
        return b"\xef\xbb\xbf" + csv_content.encode("utf-8")

    # ============================================================
    # 統計
    # ============================================================

    def get_game_play_count(self, game_uuid: str) -> int:
        """查詢指定遊戲的總遊玩次數"""
        return self._score_repo.count_by_game(game_uuid)
