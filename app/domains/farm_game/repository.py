#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
神州菜園經營家 - Repository 層

封裝 farm_game_scores 表的所有數據庫操作。
支持多次遊玩，排行榜取每位學生最高分。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class FarmGameRepository(BaseRepository):
    """神州菜園經營家成績 Repository"""

    TABLE = "farm_game_scores"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 farm_game_scores 表（冪等）"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS farm_game_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL COMMENT '用戶ID (users.id)',
            student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱',
            class_name VARCHAR(50) DEFAULT '' COMMENT '班級',
            result ENUM('completed', 'bankrupt', 'redline') NOT NULL,
            score INT NOT NULL COMMENT '總分',
            final_money INT NOT NULL COMMENT '最終資金',
            final_tech INT NOT NULL DEFAULT 0 COMMENT '科技等級',
            final_land INT NOT NULL DEFAULT 6 COMMENT '剩餘耕地',
            turns_played INT NOT NULL DEFAULT 30 COMMENT '回合數',
            reserve_policy TINYINT(1) DEFAULT 0 COMMENT '是否啟動收儲計畫',
            feedback_tags JSON COMMENT '學習反饋標籤',
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student (student_id),
            INDEX idx_class (class_name),
            INDEX idx_played (played_at),
            INDEX idx_score (score)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='神州菜園經營家遊戲成績'
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(create_sql)

        logger.info("farm_game_scores 表初始化成功")

    # ============================================================
    # 成績寫入
    # ============================================================

    def create_score(self, data: Dict[str, Any]) -> int:
        """插入成績記錄"""
        with self.transaction() as conn:
            cursor = conn.cursor()

            insert_data = dict(data)
            if "feedback_tags" in insert_data and isinstance(insert_data["feedback_tags"], list):
                insert_data["feedback_tags"] = json.dumps(insert_data["feedback_tags"])

            columns = ", ".join(insert_data.keys())
            placeholders = ", ".join(["%s"] * len(insert_data))
            sql = f"INSERT INTO farm_game_scores ({columns}) VALUES ({placeholders})"
            cursor.execute(sql, tuple(insert_data.values()))

            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            return result["id"] if result else 0

    # ============================================================
    # 查詢
    # ============================================================

    def get_student_best_score(self, student_id: int) -> Optional[Dict[str, Any]]:
        """查詢學生的最高分記錄"""
        rows = self.raw_query(
            "SELECT * FROM farm_game_scores "
            "WHERE student_id = %s "
            "ORDER BY score DESC "
            "LIMIT 1",
            (student_id,),
        )
        return rows[0] if rows else None

    def get_leaderboard(self, limit: int = 50) -> List[Dict[str, Any]]:
        """獲取排行榜（每位學生取最高分，按 score 降序）"""
        sql = """
            SELECT t.id, t.student_name, t.class_name, t.result,
                   t.score, t.final_money, t.final_tech, t.final_land,
                   t.turns_played, t.reserve_policy, t.played_at
            FROM farm_game_scores t
            INNER JOIN (
                SELECT student_id, MAX(score) AS max_score
                FROM farm_game_scores
                GROUP BY student_id
            ) best ON t.student_id = best.student_id AND t.score = best.max_score
            ORDER BY t.score DESC
            LIMIT %s
        """
        return self.raw_query(sql, (limit,))

    def get_all_scores(self, class_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """老師查詢全部成績"""
        conditions: list = []
        params: list = []

        if class_name:
            conditions.append("class_name = %s")
            params.append(class_name)

        where = " AND ".join(conditions) if conditions else ""
        return self.find_all(
            where=where,
            params=tuple(params) if params else None,
            order_by="played_at DESC",
        )

    # ============================================================
    # 老師管理
    # ============================================================

    def update_score(self, score_id: int, data: Dict[str, Any]) -> int:
        """老師編輯成績"""
        update_data = dict(data)
        if "feedback_tags" in update_data and isinstance(update_data["feedback_tags"], list):
            update_data["feedback_tags"] = json.dumps(update_data["feedback_tags"])
        return self.update(update_data, "id = %s", (score_id,))

    def delete_score(self, score_id: int) -> int:
        """老師刪除記錄"""
        return self.delete("id = %s", (score_id,))

    def export_scores(self, class_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """導出成績數據"""
        conditions: list = []
        params: list = []

        if class_name:
            conditions.append("class_name = %s")
            params.append(class_name)

        where = " AND ".join(conditions) if conditions else ""
        return self.find_all(
            where=where,
            params=tuple(params) if params else None,
            order_by="class_name ASC, score DESC",
        )

    def get_class_list(self) -> List[str]:
        """獲取有成績記錄的班級列表"""
        rows = self.raw_query(
            "SELECT DISTINCT class_name FROM farm_game_scores "
            "WHERE class_name != '' ORDER BY class_name"
        )
        return [r["class_name"] for r in rows]
