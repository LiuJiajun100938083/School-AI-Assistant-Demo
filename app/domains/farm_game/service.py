#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
神州菜園經營家 - Service 層

封裝所有業務邏輯。
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domains.farm_game.repository import FarmGameRepository

logger = logging.getLogger(__name__)

EXPORT_COLUMNS = [
    ("student_name", "學生姓名"),
    ("class_name", "班級"),
    ("result", "結果"),
    ("score", "總分"),
    ("final_money", "最終資金"),
    ("final_tech", "科技等級"),
    ("final_land", "剩餘耕地"),
    ("turns_played", "回合數"),
    ("reserve_policy", "收儲計畫"),
    ("played_at", "遊玩時間"),
]

RESULT_NAMES = {"completed": "任期屆滿", "bankrupt": "破產", "redline": "國安紅線"}


class FarmGameService:
    """神州菜園經營家業務服務"""

    def __init__(self, score_repo: FarmGameRepository):
        self._repo = score_repo

    def init_system(self) -> None:
        """初始化系統（建表）"""
        try:
            self._repo.init_table()
            logger.info("神州菜園經營家系統初始化完成")
        except Exception as e:
            logger.error("神州菜園經營家系統初始化失敗: %s", e)
            raise

    def check_played(self, student_id: int) -> Optional[Dict[str, Any]]:
        """檢查學生是否已遊玩過"""
        return self._repo.get_student_best_score(student_id)

    def has_played(self, student_id: int) -> bool:
        """檢查學生是否已遊玩過（布爾值）"""
        return self._repo.count_student_plays(student_id) > 0

    def submit_score(
        self,
        student_id: int,
        student_name: str,
        class_name: str,
        data: Dict[str, Any],
        bypass_limit: bool = False,
    ) -> Dict[str, Any]:
        """提交遊戲成績（每位學生只能遊玩一次）"""
        # 寫入前再次檢查（防並發提交）
        if not bypass_limit and self._repo.count_student_plays(student_id) > 0:
            raise ValueError("already_played")

        previous_best = self._repo.get_student_best_score(student_id)
        previous_best_score = previous_best["score"] if previous_best else None

        record = {
            "student_id": student_id,
            "student_name": student_name,
            "class_name": class_name,
            "result": data["result"],
            "score": data["score"],
            "final_money": data["final_money"],
            "final_tech": data["final_tech"],
            "final_land": data["final_land"],
            "turns_played": data["turns_played"],
            "reserve_policy": 1 if data.get("reserve_policy") else 0,
            "feedback_tags": data.get("feedback_tags", []),
        }

        new_id = self._repo.create_score(record)

        is_new_best = (
            previous_best_score is None
            or data["score"] > previous_best_score
        )

        logger.info(
            "成績已記錄: student_id=%d, score=%d, result=%s, is_new_best=%s",
            student_id, data["score"], data["result"], is_new_best,
        )
        return {
            "id": new_id,
            "message": "新紀錄！" if is_new_best else "成績已記錄",
            "is_new_best": is_new_best,
            "previous_best": previous_best_score,
        }

    def get_leaderboard(self, limit: int = 50) -> List[Dict[str, Any]]:
        """獲取排行榜"""
        rows = self._repo.get_leaderboard(limit)
        for idx, row in enumerate(rows, 1):
            row["rank"] = idx
        return rows

    def get_all_scores(self, class_name: Optional[str] = None) -> Dict[str, Any]:
        """老師查詢全部成績"""
        scores = self._repo.get_all_scores(class_name)
        classes = self._repo.get_class_list()

        total = len(scores)
        completed = sum(1 for s in scores if s.get("result") == "completed")
        avg_score = (
            round(sum(s.get("score", 0) for s in scores) / total)
            if total > 0 else 0
        )

        return {
            "scores": scores,
            "classes": classes,
            "summary": {
                "total_plays": total,
                "completed": completed,
                "completion_rate": round(completed / total, 2) if total > 0 else 0,
                "avg_score": avg_score,
            },
        }

    def update_score(self, score_id: int, data: Dict[str, Any]) -> bool:
        """老師編輯成績"""
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return False
        affected = self._repo.update_score(score_id, update_data)
        if affected > 0:
            logger.info("老師已編輯成績 score_id=%d: %s", score_id, update_data)
        return affected > 0

    def delete_score(self, score_id: int) -> bool:
        """老師刪除記錄"""
        affected = self._repo.delete_score(score_id)
        if affected > 0:
            logger.info("老師已刪除成績 score_id=%d", score_id)
        return affected > 0

    def delete_scores_by_class(self, class_name: str) -> int:
        """按班級批量刪除所有成績"""
        affected = self._repo.delete_by_class(class_name)
        logger.info("批量刪除 class=%s 的 %d 條成績", class_name, affected)
        return affected

    def export_scores_csv(self, class_name: Optional[str] = None) -> bytes:
        """導出成績為 CSV"""
        scores = self._repo.export_scores(class_name)

        lines: list[str] = []
        headers = [col[1] for col in EXPORT_COLUMNS]
        lines.append(",".join(headers))

        for s in scores:
            row: list[str] = []
            for col_key, _ in EXPORT_COLUMNS:
                val = s.get(col_key, "")

                if col_key == "result":
                    val = RESULT_NAMES.get(str(val), str(val))
                elif col_key == "reserve_policy":
                    val = "是" if val else "否"
                elif col_key == "played_at" and isinstance(val, datetime):
                    val = val.strftime("%Y-%m-%d %H:%M")

                val_str = str(val) if val is not None else ""
                if "," in val_str or '"' in val_str or "\n" in val_str:
                    val_str = '"' + val_str.replace('"', '""') + '"'
                row.append(val_str)

            lines.append(",".join(row))

        csv_content = "\n".join(lines)
        return b"\xef\xbb\xbf" + csv_content.encode("utf-8")
