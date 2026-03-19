"""
通用安全審計日誌
================
記錄敏感操作（API Key 變更、權限修改等），fail-soft 不阻塞業務。
"""

import json
import logging
from typing import Any, Optional

from app.infrastructure.database.pool import get_database_pool

logger = logging.getLogger(__name__)


# ── 建表 DDL（由 app_init 調用） ──

SECURITY_AUDIT_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS security_audit_log (
    id              BIGINT AUTO_INCREMENT PRIMARY KEY,
    action          VARCHAR(64)  NOT NULL COMMENT '操作類型: UPDATE_API_KEY, UPDATE_API_MODEL ...',
    actor           VARCHAR(128) NOT NULL COMMENT '操作人 username',
    ip_address      VARCHAR(45)  DEFAULT NULL COMMENT '來源 IP',
    details_json    JSON         DEFAULT NULL COMMENT '附加資訊（不含原文 Key）',
    created_at      TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_sa_actor    (actor),
    INDEX idx_sa_action   (action),
    INDEX idx_sa_created  (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
"""


class SecurityAuditLogger:
    """安全審計記錄器 — 輕量級，直接寫入 DB，失敗不阻塞業務"""

    @staticmethod
    def log(
        action: str,
        actor: str,
        ip_address: Optional[str] = None,
        details: Optional[dict] = None,
    ):
        """寫入一條安全審計記錄

        Args:
            action:     操作類型，如 UPDATE_API_KEY, UPDATE_API_MODEL
            actor:      操作人用戶名
            ip_address: 來源 IP（可選）
            details:    附加資訊 dict（不應包含原文 Key）
        """
        try:
            pool = get_database_pool()
            pool.execute_write(
                """
                INSERT INTO security_audit_log (action, actor, ip_address, details_json)
                VALUES (%s, %s, %s, %s)
                """,
                (
                    action,
                    actor,
                    ip_address,
                    json.dumps(details, ensure_ascii=False, default=str) if details else None,
                ),
            )
            logger.info("安全審計: %s by %s from %s", action, actor, ip_address or "unknown")
        except Exception as e:
            # 審計失敗不應阻塞業務流程
            logger.warning("安全審計記錄寫入失敗: %s", e)

    @staticmethod
    def query(
        actor: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list:
        """查詢安全審計記錄"""
        pool = get_database_pool()
        conditions = []
        params = []

        if actor:
            conditions.append("actor = %s")
            params.append(actor)
        if action:
            conditions.append("action = %s")
            params.append(action)

        where = " AND ".join(conditions) if conditions else "1=1"
        params.extend([limit, offset])

        rows = pool.execute_query(
            f"SELECT * FROM security_audit_log WHERE {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
            tuple(params),
        )
        for row in rows:
            val = row.get("details_json")
            if val:
                try:
                    row["details_json"] = json.loads(val)
                except (json.JSONDecodeError, TypeError):
                    pass
        return rows
