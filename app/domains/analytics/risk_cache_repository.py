#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
學生風險快取 Repository

封裝 student_risk_cache 表的所有數據庫操作。
此快取由背景任務每日 03:00 刷新；教師可手動觸發強制刷新。

設計理念：
- 避免每次教師打開「學生分析」分頁時，對所有 800+ 學生即時跑
  assess_student_risk()，造成可觀的延遲。
- 風險評估只用 SQL 統計（非 LLM），跑一次很快但 N=800 累積就慢。
- 把結果預先計算放進快取表，端點直接 SELECT，<10ms 完成。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class RiskCacheRepository(BaseRepository):
    """學生風險快取 Repository"""

    TABLE = "student_risk_cache"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 student_risk_cache 表（冪等）"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS student_risk_cache (
            student_id      VARCHAR(64)  NOT NULL PRIMARY KEY COMMENT '學生 username',
            student_name    VARCHAR(100) NOT NULL DEFAULT '',
            class_name      VARCHAR(50)  NOT NULL DEFAULT '',
            risk_level      VARCHAR(16)  NOT NULL DEFAULT 'unknown' COMMENT 'low/medium/high/unknown',
            risk_score      INT          NOT NULL DEFAULT 0,
            risk_factors    TEXT         COMMENT 'JSON array',
            total_conversations INT      NOT NULL DEFAULT 0,
            total_messages  INT          NOT NULL DEFAULT 0,
            last_active     DATETIME     NULL,
            overall_summary TEXT         COMMENT '簡短摘要',
            preview_status  VARCHAR(50)  DEFAULT '',
            updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_class (class_name),
            INDEX idx_risk_score (risk_level, risk_score DESC),
            INDEX idx_class_risk (class_name, risk_score DESC),
            INDEX idx_updated (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='學生風險評估快取（每日 03:00 自動刷新）'
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(create_sql)
        logger.info("student_risk_cache 表初始化成功")

    # ============================================================
    # 寫入
    # ============================================================

    def upsert_one(self, row: Dict[str, Any]) -> None:
        """插入或更新一筆學生風險"""
        sql = """
            INSERT INTO student_risk_cache
                (student_id, student_name, class_name, risk_level, risk_score,
                 risk_factors, total_conversations, total_messages, last_active,
                 overall_summary, preview_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                student_name = VALUES(student_name),
                class_name = VALUES(class_name),
                risk_level = VALUES(risk_level),
                risk_score = VALUES(risk_score),
                risk_factors = VALUES(risk_factors),
                total_conversations = VALUES(total_conversations),
                total_messages = VALUES(total_messages),
                last_active = VALUES(last_active),
                overall_summary = VALUES(overall_summary),
                preview_status = VALUES(preview_status),
                updated_at = CURRENT_TIMESTAMP
        """
        params = (
            row.get("student_id"),
            row.get("student_name", ""),
            row.get("class_name", "") or "",
            row.get("risk_level", "unknown"),
            int(row.get("risk_score", 0)),
            row.get("risk_factors", "[]"),
            int(row.get("total_conversations", 0)),
            int(row.get("total_messages", 0)),
            row.get("last_active"),
            row.get("overall_summary", ""),
            row.get("preview_status", ""),
        )
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(sql, params)

    def bulk_upsert(self, rows: List[Dict[str, Any]]) -> int:
        """批次插入或更新；回傳實際處理筆數"""
        if not rows:
            return 0
        sql = """
            INSERT INTO student_risk_cache
                (student_id, student_name, class_name, risk_level, risk_score,
                 risk_factors, total_conversations, total_messages, last_active,
                 overall_summary, preview_status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            ON DUPLICATE KEY UPDATE
                student_name = VALUES(student_name),
                class_name = VALUES(class_name),
                risk_level = VALUES(risk_level),
                risk_score = VALUES(risk_score),
                risk_factors = VALUES(risk_factors),
                total_conversations = VALUES(total_conversations),
                total_messages = VALUES(total_messages),
                last_active = VALUES(last_active),
                overall_summary = VALUES(overall_summary),
                preview_status = VALUES(preview_status),
                updated_at = CURRENT_TIMESTAMP
        """
        params_list = [
            (
                r.get("student_id"),
                r.get("student_name", ""),
                r.get("class_name", "") or "",
                r.get("risk_level", "unknown"),
                int(r.get("risk_score", 0)),
                r.get("risk_factors", "[]"),
                int(r.get("total_conversations", 0)),
                int(r.get("total_messages", 0)),
                r.get("last_active"),
                r.get("overall_summary", ""),
                r.get("preview_status", ""),
            )
            for r in rows
        ]
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.executemany(sql, params_list)
        return len(params_list)

    # ============================================================
    # 查詢
    # ============================================================

    def _normalize(self, row: Dict[str, Any]) -> Dict[str, Any]:
        """把 DB 行整理成前端友善的格式"""
        if not row:
            return row
        # JSON 解 risk_factors
        raw_factors = row.get("risk_factors")
        if isinstance(raw_factors, str):
            try:
                row["risk_factors"] = json.loads(raw_factors)
            except (ValueError, TypeError):
                row["risk_factors"] = []
        # datetime → ISO
        for k in ("last_active", "updated_at"):
            v = row.get(k)
            if v is not None and not isinstance(v, str):
                try:
                    row[k] = v.strftime("%Y-%m-%d %H:%M:%S")
                except Exception:
                    row[k] = str(v)
        return row

    def get_by_class(self, class_name: Optional[str] = None) -> List[Dict[str, Any]]:
        """取某班所有學生（None 時取全部）"""
        if class_name:
            sql = """
                SELECT * FROM student_risk_cache
                WHERE class_name = %s
                ORDER BY risk_score DESC, student_name ASC
            """
            rows = self.raw_query(sql, (class_name,))
        else:
            sql = """
                SELECT * FROM student_risk_cache
                ORDER BY risk_score DESC, student_name ASC
            """
            rows = self.raw_query(sql, ())
        return [self._normalize(r) for r in (rows or [])]

    def get_top_at_risk(self, limit: int = 10) -> List[Dict[str, Any]]:
        """取整校最高風險學生 Top N"""
        sql = """
            SELECT * FROM student_risk_cache
            WHERE risk_level IN ('high', 'medium')
            ORDER BY risk_score DESC, last_active DESC
            LIMIT %s
        """
        rows = self.raw_query(sql, (int(limit),))
        return [self._normalize(r) for r in (rows or [])]

    def get_one(self, student_id: str) -> Optional[Dict[str, Any]]:
        """取單一學生最新快取"""
        rows = self.raw_query(
            "SELECT * FROM student_risk_cache WHERE student_id = %s",
            (student_id,),
        )
        return self._normalize(rows[0]) if rows else None

    def count_all(self) -> int:
        rows = self.raw_query("SELECT COUNT(*) AS n FROM student_risk_cache", ())
        return int(rows[0]["n"]) if rows else 0

    def latest_updated_at(self) -> Optional[str]:
        rows = self.raw_query(
            "SELECT MAX(updated_at) AS t FROM student_risk_cache", ()
        )
        if not rows or not rows[0].get("t"):
            return None
        t = rows[0]["t"]
        if isinstance(t, str):
            return t
        try:
            return t.strftime("%Y-%m-%d %H:%M:%S")
        except Exception:
            return str(t)
