"""
MigrationRunner — 順序執行、冪等、可審計的 Schema 遷移。

設計原則:
- 通過 _schema_migrations 表追蹤已執行遷移
- 每條遷移只能增加，不能回頭修改已有 migration
- 遷移失敗 → 阻止服務啟動
- 日誌輸出每條遷移的執行狀態
"""

import importlib
import logging
import time
from typing import List

logger = logging.getLogger(__name__)

# 遷移模塊清單（按順序執行，只增不改）
MIGRATION_MODULES = [
    "app.infrastructure.database.migrations.001_classes_and_users",
    "app.infrastructure.database.migrations.002_assignments",
    "app.infrastructure.database.migrations.003_attendance",
    "app.infrastructure.database.migrations.004_class_diary",
]


class MigrationRunner:
    """Schema 遷移執行器"""

    def __init__(self, pool):
        self._pool = pool

    def run_all(self) -> None:
        """執行所有未運行的遷移。失敗時拋出異常阻止啟動。"""
        self._ensure_migration_table()

        executed = self._get_executed_migrations()
        pending = [m for m in MIGRATION_MODULES if m not in executed]

        if not pending:
            logger.info("Schema 遷移: 無需執行，所有 %d 條遷移已完成", len(executed))
            return

        logger.info(
            "Schema 遷移: 共 %d 條，已執行 %d 條，待執行 %d 條",
            len(MIGRATION_MODULES), len(executed), len(pending),
        )

        for module_name in pending:
            self._run_one(module_name)

        logger.info("Schema 遷移全部完成")

    def _ensure_migration_table(self) -> None:
        """確保遷移追蹤表存在"""
        self._pool.execute_write("""
            CREATE TABLE IF NOT EXISTS _schema_migrations (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                migration_id  VARCHAR(255) NOT NULL UNIQUE COMMENT '遷移模塊名',
                applied_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

    def _get_executed_migrations(self) -> set:
        """獲取已執行的遷移 ID 集合"""
        rows = self._pool.execute(
            "SELECT migration_id FROM _schema_migrations ORDER BY id"
        )
        return {r["migration_id"] for r in rows} if rows else set()

    def _run_one(self, module_name: str) -> None:
        """執行單條遷移"""
        short_name = module_name.rsplit(".", 1)[-1]
        logger.info("Schema 遷移 [%s] 開始...", short_name)

        start = time.time()
        try:
            mod = importlib.import_module(module_name)
            sqls: List[str] = getattr(mod, "MIGRATION_SQLS", [])

            if not sqls:
                logger.warning("Schema 遷移 [%s] 無 SQL 語句，跳過", short_name)
                return

            for i, sql in enumerate(sqls, 1):
                sql = sql.strip()
                if not sql:
                    continue
                try:
                    self._pool.execute_write(sql)
                except Exception as e:
                    err_msg = str(e).lower()
                    # 冪等性: 忽略「已存在」的錯誤
                    if any(kw in err_msg for kw in (
                        "already exists", "duplicate column", "duplicate key",
                        "duplicate entry",
                    )):
                        logger.debug(
                            "Schema 遷移 [%s] SQL #%d 已存在，跳過: %s",
                            short_name, i, str(e)[:100],
                        )
                    else:
                        logger.error(
                            "Schema 遷移 [%s] SQL #%d 失敗: %s",
                            short_name, i, e,
                        )
                        raise

            # 記錄已完成
            self._pool.execute_write(
                "INSERT INTO _schema_migrations (migration_id) VALUES (%s)",
                (module_name,),
            )

            elapsed = time.time() - start
            logger.info(
                "Schema 遷移 [%s] 完成 (%.1fs, %d SQL)",
                short_name, elapsed, len(sqls),
            )
        except Exception as e:
            elapsed = time.time() - start
            logger.error(
                "Schema 遷移 [%s] 失敗 (%.1fs): %s",
                short_name, elapsed, e,
            )
            raise RuntimeError(
                f"Schema 遷移 [{short_name}] 失敗，服務啟動已中止: {e}"
            ) from e
