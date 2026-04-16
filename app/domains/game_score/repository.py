#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自定義遊戲計分 — Repository 層

封裝 game_scores 和 game_score_settings 表的所有數據庫操作。
支持多次遊玩（取最高 / 最新 / 首次），排行榜按策略取分。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)

# 未配置時的默認設定
DEFAULT_SETTINGS: Dict[str, Any] = {
    "allow_multiple_plays": True,
    "score_policy": "best",
    "max_attempts": None,
    "updated_by": None,
    "updated_at": None,
}


class GameScoreRepository(BaseRepository):
    """自定義遊戲計分 Repository"""

    TABLE = "game_scores"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 game_scores + game_score_settings 表（冪等）"""

        scores_sql = """
        CREATE TABLE IF NOT EXISTS game_scores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            game_uuid VARCHAR(36) NOT NULL COMMENT 'uploaded_games.uuid',
            student_id INT NOT NULL COMMENT 'users.id',
            student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱快照',
            class_name VARCHAR(50) DEFAULT '' COMMENT '班級快照',
            score INT NOT NULL COMMENT '主分數',
            extra_data JSON COMMENT '遊戲特定指標',
            played_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_game_uuid (game_uuid),
            INDEX idx_game_student (game_uuid, student_id),
            INDEX idx_game_score (game_uuid, score DESC),
            INDEX idx_class (class_name),
            INDEX idx_played (played_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='自定義遊戲計分（通用）'
        """

        settings_sql = """
        CREATE TABLE IF NOT EXISTS game_score_settings (
            game_uuid VARCHAR(36) PRIMARY KEY COMMENT 'uploaded_games.uuid',
            allow_multiple_plays TINYINT(1) NOT NULL DEFAULT 1
                COMMENT '是否允許多次遊玩（0=僅一次, 1=多次）',
            score_policy ENUM('best', 'latest', 'first') NOT NULL DEFAULT 'best'
                COMMENT '排行榜取分策略',
            max_attempts INT DEFAULT NULL
                COMMENT '最大遊玩次數限制（NULL=無限）',
            updated_by INT DEFAULT NULL
                COMMENT '最後修改者 users.id',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='遊戲計分設定（老師可修改）'
        """

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(scores_sql)
            cursor.execute(settings_sql)

        logger.info("game_scores + game_score_settings 表初始化成功")

    # ============================================================
    # 成績寫入
    # ============================================================

    def create_score(self, data: Dict[str, Any]) -> int:
        """插入成績記錄，返回新記錄 ID"""
        with self.transaction() as conn:
            cursor = conn.cursor()

            insert_data = dict(data)
            if "extra_data" in insert_data and isinstance(insert_data["extra_data"], dict):
                insert_data["extra_data"] = json.dumps(insert_data["extra_data"], ensure_ascii=False)

            columns = ", ".join(insert_data.keys())
            placeholders = ", ".join(["%s"] * len(insert_data))
            sql = f"INSERT INTO game_scores ({columns}) VALUES ({placeholders})"
            cursor.execute(sql, tuple(insert_data.values()))

            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            return result["id"] if result else 0

    # ============================================================
    # 查詢
    # ============================================================

    def get_student_best_score(self, game_uuid: str, student_id: int) -> Optional[Dict[str, Any]]:
        """查詢學生在指定遊戲的最高分記錄"""
        rows = self.raw_query(
            "SELECT * FROM game_scores "
            "WHERE game_uuid = %s AND student_id = %s "
            "ORDER BY score DESC LIMIT 1",
            (game_uuid, student_id),
        )
        return rows[0] if rows else None

    def get_student_scores(
        self, game_uuid: str, student_id: int, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """查詢學生在指定遊戲的歷史成績"""
        return self.raw_query(
            "SELECT * FROM game_scores "
            "WHERE game_uuid = %s AND student_id = %s "
            "ORDER BY played_at DESC LIMIT %s",
            (game_uuid, student_id, limit),
        )

    def get_leaderboard(
        self, game_uuid: str, policy: str = "best", limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        獲取排行榜（每位學生取一條代表記錄）。

        policy:
          - best:   取每位學生最高分
          - latest: 取每位學生最近一次
          - first:  取每位學生第一次
        """
        if policy == "latest":
            agg_col, agg_func = "played_at", "MAX(played_at)"
            join_col = "played_at"
        elif policy == "first":
            agg_col, agg_func = "played_at", "MIN(played_at)"
            join_col = "played_at"
        else:  # best (默認)
            agg_col, agg_func = "score", "MAX(score)"
            join_col = "score"

        sql = f"""
            SELECT t.id, t.student_id, t.student_name, t.class_name,
                   t.score, t.extra_data, t.played_at
            FROM game_scores t
            INNER JOIN (
                SELECT student_id, {agg_func} AS agg_val
                FROM game_scores
                WHERE game_uuid = %s
                GROUP BY student_id
            ) best ON t.student_id = best.student_id AND t.{join_col} = best.agg_val
            WHERE t.game_uuid = %s
            ORDER BY t.score DESC
            LIMIT %s
        """
        return self.raw_query(sql, (game_uuid, game_uuid, limit))

    def get_all_scores(
        self, game_uuid: str, class_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """老師查詢全部成績"""
        conditions = ["game_uuid = %s"]
        params: list = [game_uuid]

        if class_name:
            conditions.append("class_name = %s")
            params.append(class_name)

        where = " AND ".join(conditions)
        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="played_at DESC",
        )

    def get_class_list(self, game_uuid: str) -> List[str]:
        """獲取有成績記錄的班級列表"""
        rows = self.raw_query(
            "SELECT DISTINCT class_name FROM game_scores "
            "WHERE game_uuid = %s AND class_name != '' "
            "ORDER BY class_name",
            (game_uuid,),
        )
        return [r["class_name"] for r in rows]

    # ============================================================
    # 計數
    # ============================================================

    def count_student_plays(self, game_uuid: str, student_id: int) -> int:
        """查詢學生在指定遊戲的遊玩次數"""
        rows = self.raw_query(
            "SELECT COUNT(*) as cnt FROM game_scores "
            "WHERE game_uuid = %s AND student_id = %s",
            (game_uuid, student_id),
        )
        return rows[0]["cnt"] if rows else 0

    def count_plays_since(
        self, game_uuid: str, student_id: int, seconds: int = 5
    ) -> int:
        """查詢學生在最近 N 秒內的提交次數（防刷限流）"""
        rows = self.raw_query(
            "SELECT COUNT(*) as cnt FROM game_scores "
            "WHERE game_uuid = %s AND student_id = %s "
            "AND played_at > DATE_SUB(NOW(), INTERVAL %s SECOND)",
            (game_uuid, student_id, seconds),
        )
        return rows[0]["cnt"] if rows else 0

    def count_by_game(self, game_uuid: str) -> int:
        """查詢指定遊戲的總遊玩次數"""
        rows = self.raw_query(
            "SELECT COUNT(*) as cnt FROM game_scores WHERE game_uuid = %s",
            (game_uuid,),
        )
        return rows[0]["cnt"] if rows else 0

    # ============================================================
    # 老師管理
    # ============================================================

    def delete_score(self, score_id: int) -> int:
        """刪除單條成績記錄"""
        return self.delete("id = %s", (score_id,))

    def export_scores(
        self, game_uuid: str, class_name: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """導出成績數據"""
        conditions = ["game_uuid = %s"]
        params: list = [game_uuid]

        if class_name:
            conditions.append("class_name = %s")
            params.append(class_name)

        where = " AND ".join(conditions)
        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="class_name ASC, score DESC",
        )

    # ============================================================
    # Settings（計分設定）
    # ============================================================

    def get_settings(self, game_uuid: str) -> Dict[str, Any]:
        """查詢遊戲計分設定，無記錄則返回默認值"""
        row = self.raw_query_one(
            "SELECT * FROM game_score_settings WHERE game_uuid = %s",
            (game_uuid,),
        )
        if row:
            # TINYINT(1) → bool
            row["allow_multiple_plays"] = bool(row.get("allow_multiple_plays", 1))
            return row

        # 返回默認設定（帶 game_uuid）
        return {"game_uuid": game_uuid, **DEFAULT_SETTINGS}

    def upsert_settings(self, game_uuid: str, data: Dict[str, Any]) -> None:
        """新增或更新遊戲計分設定（INSERT ON DUPLICATE KEY UPDATE）"""
        # 合併 game_uuid
        insert_data = {"game_uuid": game_uuid, **data}

        columns = ", ".join(insert_data.keys())
        placeholders = ", ".join(["%s"] * len(insert_data))

        # 構建 ON DUPLICATE KEY UPDATE 子句（排除 game_uuid）
        update_parts = [f"{k} = VALUES({k})" for k in data.keys()]
        update_clause = ", ".join(update_parts)

        sql = (
            f"INSERT INTO game_score_settings ({columns}) VALUES ({placeholders}) "
            f"ON DUPLICATE KEY UPDATE {update_clause}"
        )

        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, tuple(insert_data.values()))
