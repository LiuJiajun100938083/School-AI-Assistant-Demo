#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
化學 2048 - Service 層

封裝所有業務邏輯，包括：
- 成績提交
- 排行榜查詢
- 老師管理操作
- CSV 導出數據準備
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domains.chem2048.repository import Chem2048Repository

logger = logging.getLogger(__name__)

# Excel 導出的列配置
EXPORT_COLUMNS = [
    ("student_name", "學生姓名"),
    ("class_name", "班級"),
    ("score", "遊戲分數"),
    ("highest_element", "最高元素"),
    ("highest_element_no", "元素序號"),
    ("highest_tile", "最高方塊值"),
    ("total_moves", "移動次數"),
    ("tips_used", "使用提示"),
    ("played_at", "遊玩時間"),
]

# 元素名稱映射
ELEMENT_NAMES = {
    "H": "氫", "He": "氦", "Li": "鋰", "Be": "鈹", "B": "硼",
    "C": "碳", "N": "氮", "O": "氧", "F": "氟", "Ne": "氖",
    "Na": "鈉", "Mg": "鎂", "Al": "鋁", "Si": "矽", "P": "磷",
    "S": "硫", "Cl": "氯", "Ar": "氬", "K": "鉀", "Ca": "鈣",
}


class Chem2048Service:
    """化學 2048 業務服務"""

    def __init__(self, score_repo: Chem2048Repository):
        self._repo = score_repo

    # ============================================================
    # 初始化
    # ============================================================

    def init_system(self) -> None:
        """初始化系統（建表）"""
        try:
            self._repo.init_table()
            logger.info("化學 2048 系統初始化完成")
        except Exception as e:
            logger.error("化學 2048 系統初始化失敗: %s", e)
            raise

    # ============================================================
    # 學生操作
    # ============================================================

    def check_played(self, student_id: int) -> Optional[Dict[str, Any]]:
        """檢查學生是否已遊玩過，返回最高分記錄或 None"""
        return self._repo.get_student_best_score(student_id)

    def submit_score(
        self,
        student_id: int,
        student_name: str,
        class_name: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        提交遊戲成績（允許多次遊玩）

        Returns:
            {"id": int, "message": str, "is_new_best": bool}
        """
        previous_best = self._repo.get_student_best_score(student_id)
        previous_best_score = previous_best["score"] if previous_best else None

        record = {
            "student_id": student_id,
            "student_name": student_name,
            "class_name": class_name,
            "score": data["score"],
            "highest_tile": data["highest_tile"],
            "highest_element": data["highest_element"],
            "highest_element_no": data["highest_element_no"],
            "total_moves": data.get("total_moves", 0),
            "tips_used": data.get("tips_used", 0),
        }

        new_id = self._repo.create_score(record)

        is_new_best = (
            previous_best_score is None
            or data["score"] > previous_best_score
        )

        logger.info(
            "化學 2048 成績已記錄: student_id=%d, score=%d, element=%s, is_new_best=%s",
            student_id, data["score"], data["highest_element"], is_new_best,
        )
        return {
            "id": new_id,
            "message": "新紀錄！" if is_new_best else "成績已記錄",
            "is_new_best": is_new_best,
            "previous_best": previous_best_score,
        }

    # ============================================================
    # 公開查詢
    # ============================================================

    def get_leaderboard(
        self,
        limit: int = 50,
        class_filter: list = None,
        exclude_classes: list = None,
    ) -> List[Dict[str, Any]]:
        """
        獲取排行榜

        Args:
            limit: 返回條數
            class_filter: 僅包含這些班級
            exclude_classes: 排除這些班級
        """
        rows = self._repo.get_leaderboard(
            limit,
            class_filter=class_filter,
            exclude_classes=exclude_classes,
        )
        for idx, row in enumerate(rows, 1):
            row["rank"] = idx
            row["element_zh"] = ELEMENT_NAMES.get(row.get("highest_element", ""), "")
        return rows

    # ============================================================
    # 老師管理
    # ============================================================

    def get_all_scores(
        self,
        class_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """老師查詢全部成績"""
        scores = self._repo.get_all_scores(class_name)
        classes = self._repo.get_class_list()

        total = len(scores)
        avg_score = (
            round(sum(s.get("score", 0) for s in scores) / total)
            if total > 0 else 0
        )
        max_element = max(
            (s.get("highest_element_no", 0) for s in scores), default=0
        )

        return {
            "scores": scores,
            "classes": classes,
            "summary": {
                "total_plays": total,
                "avg_score": avg_score,
                "max_element_no": max_element,
            },
        }

    def update_score(self, score_id: int, data: Dict[str, Any]) -> bool:
        """老師編輯成績"""
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return False
        affected = self._repo.update_score(score_id, update_data)
        if affected > 0:
            logger.info("老師已編輯化學 2048 成績 score_id=%d", score_id)
        return affected > 0

    def delete_score(self, score_id: int) -> bool:
        """老師刪除記錄"""
        affected = self._repo.delete_score(score_id)
        if affected > 0:
            logger.info("老師已刪除化學 2048 成績 score_id=%d", score_id)
        return affected > 0

    # ============================================================
    # CSV 導出
    # ============================================================

    def export_scores_csv(
        self,
        class_name: Optional[str] = None,
    ) -> bytes:
        """導出成績為 CSV（UTF-8 BOM）"""
        scores = self._repo.export_scores(class_name)

        lines: list[str] = []

        headers = [col[1] for col in EXPORT_COLUMNS]
        lines.append(",".join(headers))

        for s in scores:
            row: list[str] = []
            for col_key, _ in EXPORT_COLUMNS:
                val = s.get(col_key, "")

                if col_key == "highest_element":
                    zh = ELEMENT_NAMES.get(str(val), "")
                    val = f"{val} ({zh})" if zh else val
                elif col_key == "played_at" and isinstance(val, datetime):
                    val = val.strftime("%Y-%m-%d %H:%M")

                val_str = str(val) if val is not None else ""
                if "," in val_str or '"' in val_str or "\n" in val_str:
                    val_str = '"' + val_str.replace('"', '""') + '"'
                row.append(val_str)

            lines.append(",".join(row))

        csv_content = "\n".join(lines)
        return b"\xef\xbb\xbf" + csv_content.encode("utf-8")
