#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全球貿易大亨 - Service 層

封裝所有業務邏輯，包括：
- 成績提交（含防重複校驗）
- 排行榜查詢
- 老師管理操作
- Excel 導出數據準備
"""

import io
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domains.trade_game.repository import TradeGameRepository

logger = logging.getLogger(__name__)

# Excel 導出的列配置
EXPORT_COLUMNS = [
    ("student_name", "學生姓名"),
    ("class_name", "班級"),
    ("difficulty", "難度"),
    ("player_spec", "國家優勢"),
    ("result", "結果"),
    ("player_score", "綜合國力分"),
    ("ai_score", "AI 分數"),
    ("turns_played", "回合數"),
    ("final_money", "最終資金"),
    ("final_security", "最終安全指數"),
    ("total_trades", "總交易次數"),
    ("good_trades", "好交易次數"),
    ("bad_trades", "壞交易次數"),
    ("security_invests", "安全投資次數"),
    ("sanctions_used", "制裁使用次數"),
    ("tips_read", "錦囊閱讀次數"),
    ("played_at", "遊玩時間"),
]

# 專業化名稱映射
SPEC_NAMES = {"AGRI": "農業", "IND": "工業", "TECH": "科技"}
DIFFICULTY_NAMES = {"EASY": "新手", "NORMAL": "標準", "HARD": "貿易大鱷"}
RESULT_NAMES = {"win": "勝利", "lose": "失敗", "bankrupt": "破產"}


class TradeGameService:
    """全球貿易大亨業務服務"""

    def __init__(self, score_repo: TradeGameRepository):
        self._repo = score_repo

    # ============================================================
    # 初始化
    # ============================================================

    def init_system(self) -> None:
        """初始化系統（建表）"""
        try:
            self._repo.init_table()
            logger.info("全球貿易大亨系統初始化完成")
        except Exception as e:
            logger.error("全球貿易大亨系統初始化失敗: %s", e)
            raise

    # ============================================================
    # 學生操作
    # ============================================================

    def check_played(self, student_id: int) -> Optional[Dict[str, Any]]:
        """
        檢查學生是否已遊玩過

        Returns:
            已有成績記錄則返回該記錄，否則返回 None
        """
        return self._repo.get_student_score(student_id)

    def submit_score(
        self,
        student_id: int,
        student_name: str,
        class_name: str,
        data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        提交遊戲成績（允許多次遊玩）

        每次遊玩都會記錄成績，排行榜取最高分。

        Args:
            student_id: 用戶 ID
            student_name: 顯示名稱
            class_name: 班級
            data: 遊戲成績數據

        Returns:
            {"id": int, "message": str, "is_new_best": bool}
        """
        # 先查詢歷史最高分
        previous_best = self._repo.get_student_best_score(student_id)
        previous_best_score = previous_best["player_score"] if previous_best else None

        record = {
            "student_id": student_id,
            "student_name": student_name,
            "class_name": class_name,
            "difficulty": data["difficulty"],
            "player_spec": data["player_spec"],
            "ai_spec": data["ai_spec"],
            "result": data["result"],
            "player_score": data["player_score"],
            "ai_score": data["ai_score"],
            "turns_played": data["turns_played"],
            "final_money": data["final_money"],
            "final_security": data["final_security"],
            "final_inventory": data.get("final_inventory", {}),
            "total_trades": data.get("total_trades", 0),
            "good_trades": data.get("good_trades", 0),
            "bad_trades": data.get("bad_trades", 0),
            "security_invests": data.get("security_invests", 0),
            "sanctions_used": data.get("sanctions_used", 0),
            "tips_read": data.get("tips_read", 0),
            "bankrupt_reason": data.get("bankrupt_reason"),
            "feedback_tags": data.get("feedback_tags", []),
        }

        new_id = self._repo.create_score(record)

        is_new_best = (
            previous_best_score is None
            or data["player_score"] > previous_best_score
        )

        logger.info(
            "成績已記錄: student_id=%d, score=%d, result=%s, is_new_best=%s",
            student_id, data["player_score"], data["result"], is_new_best,
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
        difficulty: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """獲取排行榜"""
        rows = self._repo.get_leaderboard(difficulty, limit)
        # 添加排名
        for idx, row in enumerate(rows, 1):
            row["rank"] = idx
        return rows

    # ============================================================
    # 老師管理
    # ============================================================

    def get_all_scores(
        self,
        class_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        老師查詢全部成績

        Returns:
            {"scores": [...], "classes": [...], "summary": {...}}
        """
        scores = self._repo.get_all_scores(class_name)
        classes = self._repo.get_class_list()

        # 統計摘要
        total = len(scores)
        wins = sum(1 for s in scores if s.get("result") == "win")
        avg_score = (
            round(sum(s.get("player_score", 0) for s in scores) / total)
            if total > 0 else 0
        )

        return {
            "scores": scores,
            "classes": classes,
            "summary": {
                "total_plays": total,
                "wins": wins,
                "win_rate": round(wins / total, 2) if total > 0 else 0,
                "avg_score": avg_score,
            },
        }

    def update_score(self, score_id: int, data: Dict[str, Any]) -> bool:
        """
        老師編輯成績

        Args:
            score_id: 成績 ID
            data: 要更新的字段（已由 Pydantic 驗證）

        Returns:
            是否更新成功
        """
        # 過濾掉 None 值
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return False

        affected = self._repo.update_score(score_id, update_data)
        if affected > 0:
            logger.info("老師已編輯成績 score_id=%d: %s", score_id, update_data)
        return affected > 0

    def delete_score(self, score_id: int) -> bool:
        """
        老師刪除記錄（允許學生重新遊玩）

        Args:
            score_id: 成績 ID

        Returns:
            是否刪除成功
        """
        affected = self._repo.delete_score(score_id)
        if affected > 0:
            logger.info("老師已刪除成績 score_id=%d（學生可重新遊玩）", score_id)
        return affected > 0

    # ============================================================
    # Excel 導出
    # ============================================================

    def export_scores_csv(
        self,
        class_name: Optional[str] = None,
    ) -> bytes:
        """
        導出成績為 CSV（UTF-8 BOM，兼容 Excel 中文顯示）

        Args:
            class_name: 可選，按班級篩選

        Returns:
            CSV 文件 bytes
        """
        scores = self._repo.export_scores(class_name)

        lines: list[str] = []

        # 表頭
        headers = [col[1] for col in EXPORT_COLUMNS]
        lines.append(",".join(headers))

        # 數據行
        for s in scores:
            row: list[str] = []
            for col_key, _ in EXPORT_COLUMNS:
                val = s.get(col_key, "")

                # 格式化特殊字段
                if col_key == "player_spec":
                    val = SPEC_NAMES.get(str(val), str(val))
                elif col_key == "difficulty":
                    val = DIFFICULTY_NAMES.get(str(val), str(val))
                elif col_key == "result":
                    val = RESULT_NAMES.get(str(val), str(val))
                elif col_key == "played_at" and isinstance(val, datetime):
                    val = val.strftime("%Y-%m-%d %H:%M")

                # CSV 安全：包含逗號或引號的值需要用引號包裹
                val_str = str(val) if val is not None else ""
                if "," in val_str or '"' in val_str or "\n" in val_str:
                    val_str = '"' + val_str.replace('"', '""') + '"'
                row.append(val_str)

            lines.append(",".join(row))

        csv_content = "\n".join(lines)
        # UTF-8 BOM 確保 Excel 正確識別編碼
        return b"\xef\xbb\xbf" + csv_content.encode("utf-8")
