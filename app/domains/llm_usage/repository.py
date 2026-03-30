#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM API 使用量 — Repository 層

封裝 llm_api_usage 表的所有數據庫操作。
追蹤每次 LLM API 調用的 token 用量和耗時。
"""

import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class LlmUsageRepository(BaseRepository):
    """LLM API 使用量 Repository"""

    TABLE = "llm_api_usage"

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 llm_api_usage 表（冪等）"""
        create_sql = """
        CREATE TABLE IF NOT EXISTS llm_api_usage (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT DEFAULT NULL COMMENT '觸發用戶 ID',
            provider VARCHAR(20) NOT NULL COMMENT 'deepseek / ollama',
            model VARCHAR(50) NOT NULL COMMENT '模型名稱',
            purpose VARCHAR(50) NOT NULL COMMENT '用途：game_gen / exam_gen / chat / analysis',
            prompt_tokens INT NOT NULL DEFAULT 0,
            completion_tokens INT NOT NULL DEFAULT 0,
            total_tokens INT NOT NULL DEFAULT 0,
            duration_ms INT DEFAULT NULL COMMENT '請求耗時（毫秒）',
            status VARCHAR(10) NOT NULL DEFAULT 'ok' COMMENT 'ok / error',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_created (created_at),
            INDEX idx_provider (provider),
            INDEX idx_purpose (purpose),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='LLM API Token 使用量追蹤'
        """
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(create_sql)

        logger.info("llm_api_usage 表初始化成功")

    # ============================================================
    # 寫入
    # ============================================================

    def record_usage(self, data: Dict[str, Any]) -> int:
        """插入一條 usage 記錄，返回 ID"""
        with self.transaction() as conn:
            cursor = conn.cursor()
            columns = ", ".join(data.keys())
            placeholders = ", ".join(["%s"] * len(data))
            sql = f"INSERT INTO llm_api_usage ({columns}) VALUES ({placeholders})"
            cursor.execute(sql, tuple(data.values()))
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            result = cursor.fetchone()
            return result["id"] if result else 0

    # ============================================================
    # 統計查詢
    # ============================================================

    def get_today_summary(self) -> Dict[str, Any]:
        """今日統計：總 tokens、調用次數"""
        row = self.raw_query_one(
            "SELECT "
            "  CAST(COALESCE(SUM(prompt_tokens), 0) AS SIGNED) AS prompt_tokens, "
            "  CAST(COALESCE(SUM(completion_tokens), 0) AS SIGNED) AS completion_tokens, "
            "  CAST(COALESCE(SUM(total_tokens), 0) AS SIGNED) AS total_tokens, "
            "  COUNT(*) AS call_count "
            "FROM llm_api_usage "
            "WHERE DATE(created_at) = CURDATE()"
        )
        return row if row else {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "call_count": 0,
        }

    def get_daily_stats(self, days: int = 30) -> List[Dict[str, Any]]:
        """每日聚合統計（最近 N 天）"""
        return self.raw_query(
            "SELECT "
            "  DATE(created_at) AS date, "
            "  SUM(prompt_tokens) AS prompt_tokens, "
            "  SUM(completion_tokens) AS completion_tokens, "
            "  SUM(total_tokens) AS total_tokens, "
            "  COUNT(*) AS call_count "
            "FROM llm_api_usage "
            "WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY) "
            "GROUP BY DATE(created_at) "
            "ORDER BY date ASC",
            (days,),
        )

    def get_usage_by_purpose(self) -> List[Dict[str, Any]]:
        """今日按用途分組統計"""
        return self.raw_query(
            "SELECT "
            "  purpose, "
            "  SUM(total_tokens) AS total_tokens, "
            "  COUNT(*) AS call_count "
            "FROM llm_api_usage "
            "WHERE DATE(created_at) = CURDATE() "
            "GROUP BY purpose "
            "ORDER BY total_tokens DESC"
        )

    def get_recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        """最近 N 條調用記錄（含用戶名）"""
        return self.raw_query(
            "SELECT a.*, u.display_name, u.username "
            "FROM llm_api_usage a "
            "LEFT JOIN users u ON a.user_id = u.id "
            "ORDER BY a.created_at DESC LIMIT %s",
            (limit,),
        )

    def get_usage_by_user(self, days: int = 30) -> List[Dict[str, Any]]:
        """按用戶聚合統計（最近 N 天）"""
        return self.raw_query(
            "SELECT "
            "  a.user_id, "
            "  COALESCE(u.display_name, u.username, '未知') AS display_name, "
            "  u.username, "
            "  u.role, "
            "  SUM(a.prompt_tokens) AS prompt_tokens, "
            "  SUM(a.completion_tokens) AS completion_tokens, "
            "  SUM(a.total_tokens) AS total_tokens, "
            "  COUNT(*) AS call_count, "
            "  MAX(a.created_at) AS last_call_at "
            "FROM llm_api_usage a "
            "LEFT JOIN users u ON a.user_id = u.id "
            "WHERE a.created_at >= DATE_SUB(CURDATE(), INTERVAL %s DAY) "
            "  AND a.user_id IS NOT NULL "
            "GROUP BY a.user_id, u.display_name, u.username, u.role "
            "ORDER BY total_tokens DESC",
            (days,),
        )
