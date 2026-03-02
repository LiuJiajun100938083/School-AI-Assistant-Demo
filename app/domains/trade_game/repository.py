#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全球貿易大亨 - Repository 層

封裝 trade_game_scores 表的所有數據庫操作。
遵循 BaseRepository 模式，全部使用參數化查詢防止 SQL 注入。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class TradeGameRepository(BaseRepository):
    """全球貿易大亨成績 Repository"""

    TABLE = "trade_game_scores"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 trade_game_scores 表（冪等）"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS trade_game_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL COMMENT '用戶ID (users.id)',
            student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱',
            class_name VARCHAR(50) DEFAULT '' COMMENT '班級',
            difficulty VARCHAR(10) NOT NULL COMMENT 'EASY/NORMAL/HARD',
            player_spec VARCHAR(10) NOT NULL COMMENT 'AGRI/IND/TECH',
            ai_spec VARCHAR(10) NOT NULL COMMENT 'AGRI/IND/TECH',
            result ENUM('win', 'lose', 'bankrupt') NOT NULL,
            player_score INT NOT NULL COMMENT '綜合國力分',
            ai_score INT NOT NULL,
            turns_played INT NOT NULL DEFAULT 20,
            final_money INT NOT NULL,
            final_security INT NOT NULL,
            final_inventory JSON,
            total_trades INT DEFAULT 0,
            good_trades INT DEFAULT 0,
            bad_trades INT DEFAULT 0,
            security_invests INT DEFAULT 0,
            sanctions_used INT DEFAULT 0,
            tips_read INT DEFAULT 0,
            bankrupt_reason VARCHAR(20) DEFAULT NULL COMMENT 'money/security/null',
            feedback_tags JSON COMMENT '學習反饋標籤',
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_student (student_id),
            INDEX idx_class (class_name),
            INDEX idx_played (played_at),
            INDEX idx_difficulty (difficulty),
            UNIQUE INDEX uk_student (student_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='全球貿易大亨遊戲成績'
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(create_sql)
        logger.info("trade_game_scores 表初始化成功")

    # ============================================================
    # 成績寫入
    # ============================================================

    def create_score(self, data: Dict[str, Any]) -> Optional[int]:
        """
        插入成績記錄（帶防重複保護）

        使用 SELECT ... FOR UPDATE 在事務中檢查是否已存在記錄，
        避免並發場景下的重複提交。

        Returns:
            新記錄 ID，若已存在返回 None
        """
        with self.transaction() as conn:
            cursor = conn.cursor()

            # 加鎖檢查是否已有記錄
            cursor.execute(
                "SELECT id FROM trade_game_scores WHERE student_id = %s FOR UPDATE",
                (data["student_id"],),
            )
            existing = cursor.fetchone()
            if existing:
                return None  # 已有記錄，拒絕重複提交

            # 序列化 JSON 字段
            insert_data = dict(data)
            if "final_inventory" in insert_data and isinstance(insert_data["final_inventory"], dict):
                insert_data["final_inventory"] = json.dumps(insert_data["final_inventory"])
            if "feedback_tags" in insert_data and isinstance(insert_data["feedback_tags"], list):
                insert_data["feedback_tags"] = json.dumps(insert_data["feedback_tags"])

            columns = ", ".join(insert_data.keys())
            placeholders = ", ".join(["%s"] * len(insert_data))
            sql = f"INSERT INTO trade_game_scores ({columns}) VALUES ({placeholders})"
            cursor.execute(sql, tuple(insert_data.values()))

            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            return result["id"] if result else None

    # ============================================================
    # 查詢
    # ============================================================

    def get_student_score(self, student_id: int) -> Optional[Dict[str, Any]]:
        """查詢學生是否已有成績記錄"""
        return self.find_one("student_id = %s", (student_id,))

    def get_leaderboard(
        self,
        difficulty: Optional[str] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        獲取排行榜（按 player_score 降序）

        Args:
            difficulty: 可選，按難度篩選
            limit: 返回條數，默認 50
        """
        conditions = []
        params: list = []

        if difficulty:
            conditions.append("difficulty = %s")
            params.append(difficulty)

        where = " AND ".join(conditions) if conditions else ""
        return self.find_all(
            where=where,
            params=tuple(params) if params else None,
            order_by="player_score DESC",
            limit=limit,
            columns="id, student_name, class_name, difficulty, player_spec, "
                    "result, player_score, turns_played, played_at",
        )

    def get_all_scores(
        self,
        class_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        老師查詢全部成績（支持按班級篩選）

        Args:
            class_name: 可選，按班級篩選
        """
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
        """
        老師編輯成績

        Args:
            score_id: 成績記錄 ID
            data: 要更新的字段

        Returns:
            影響行數
        """
        update_data = dict(data)
        if "feedback_tags" in update_data and isinstance(update_data["feedback_tags"], list):
            update_data["feedback_tags"] = json.dumps(update_data["feedback_tags"])
        return self.update(update_data, "id = %s", (score_id,))

    def delete_score(self, score_id: int) -> int:
        """
        老師刪除記錄（允許學生重新遊玩）

        Args:
            score_id: 成績記錄 ID

        Returns:
            影響行數
        """
        return self.delete("id = %s", (score_id,))

    def export_scores(
        self,
        class_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        導出成績數據（全欄位，供 Excel 生成使用）

        Args:
            class_name: 可選，按班級篩選
        """
        conditions: list = []
        params: list = []

        if class_name:
            conditions.append("class_name = %s")
            params.append(class_name)

        where = " AND ".join(conditions) if conditions else ""
        return self.find_all(
            where=where,
            params=tuple(params) if params else None,
            order_by="class_name ASC, player_score DESC",
        )

    def get_class_list(self) -> List[str]:
        """獲取有成績記錄的班級列表"""
        rows = self.raw_query(
            "SELECT DISTINCT class_name FROM trade_game_scores "
            "WHERE class_name != '' ORDER BY class_name"
        )
        return [r["class_name"] for r in rows]
