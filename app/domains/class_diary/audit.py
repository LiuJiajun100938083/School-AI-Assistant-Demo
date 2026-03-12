"""
課室日誌 — 審計日誌
"""

import json
import logging
from typing import Any, Optional

from app.infrastructure.database.pool import get_database_pool

logger = logging.getLogger(__name__)


class ClassDiaryAuditLogger:
    """課室日誌審計記錄器（輕量級，直接寫入 DB）"""

    @staticmethod
    def log(
        action: str,
        target_type: str,
        actor: str,
        target_id: Optional[str] = None,
        old_value: Any = None,
        new_value: Any = None,
        metadata: Optional[dict] = None,
    ):
        """寫入一條審計記錄

        Args:
            action:      CREATE | UPDATE | DELETE | GRANT_REVIEWER | REVOKE_REVIEWER
                         | GRANT_RECIPIENT | REVOKE_RECIPIENT | GENERATE_REPORT | EXPORT
            target_type: entry | reviewer | recipient | daily_report | range_report | class
            actor:       操作人用戶名
            target_id:   目標 ID（entry_id、username 等）
            old_value:   修改前的值（dict/str）
            new_value:   修改後的值（dict/str）
            metadata:    額外元數據（dict）
        """
        try:
            pool = get_database_pool()
            pool.execute_write(
                """
                INSERT INTO class_diary_audit_log
                    (action, target_type, target_id, actor, old_value, new_value, metadata_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    action,
                    target_type,
                    str(target_id) if target_id is not None else None,
                    actor,
                    json.dumps(old_value, ensure_ascii=False, default=str) if old_value is not None else None,
                    json.dumps(new_value, ensure_ascii=False, default=str) if new_value is not None else None,
                    json.dumps(metadata, ensure_ascii=False, default=str) if metadata is not None else None,
                ),
            )
        except Exception as e:
            # 審計失敗不應阻塞業務流程
            logger.warning("審計記錄寫入失敗: %s", e)

    @staticmethod
    def query(
        actor: Optional[str] = None,
        target_type: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list:
        """查詢審計記錄"""
        pool = get_database_pool()
        conditions = []
        params = []

        if actor:
            conditions.append("actor = %s")
            params.append(actor)
        if target_type:
            conditions.append("target_type = %s")
            params.append(target_type)
        if action:
            conditions.append("action = %s")
            params.append(action)

        where = " AND ".join(conditions) if conditions else "1=1"
        params.extend([limit, offset])

        rows = pool.execute_query(
            f"SELECT * FROM class_diary_audit_log WHERE {where} ORDER BY created_at DESC LIMIT %s OFFSET %s",
            tuple(params),
        )
        # JSON 欄位反序列化
        for row in rows:
            for key in ("old_value", "new_value", "metadata_json"):
                val = row.get(key)
                if val:
                    try:
                        row[key] = json.loads(val)
                    except (json.JSONDecodeError, TypeError):
                        pass
        return rows
