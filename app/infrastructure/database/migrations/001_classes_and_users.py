"""
Migration 001: classes 表 + users.class_name 欄位

原位置: app/routers/__init__.py _run_schema_migrations() 前半部分
"""

MIGRATION_SQLS = [
    # --- classes 表 ---
    """
    CREATE TABLE IF NOT EXISTS classes (
        class_id    INT AUTO_INCREMENT PRIMARY KEY,
        class_code  VARCHAR(20) UNIQUE NOT NULL   COMMENT '班級代碼，如 S1A',
        class_name  VARCHAR(100) NOT NULL          COMMENT '班級名稱',
        grade       VARCHAR(20)                    COMMENT '年級，如 中一',
        teacher_id  INT                            COMMENT '班主任 → users.id',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- 確保 class_code 欄位存在（舊表相容）---
    "ALTER TABLE classes ADD COLUMN class_code VARCHAR(20) DEFAULT NULL COMMENT '班級代碼'",

    # --- 確保 grade 欄位存在 ---
    "ALTER TABLE classes ADD COLUMN grade VARCHAR(20) DEFAULT NULL COMMENT '年級'",

    # --- 班主任/副班欄位 ---
    "ALTER TABLE classes ADD COLUMN teacher_username VARCHAR(100) DEFAULT NULL COMMENT '班主任 username'",
    "ALTER TABLE classes ADD COLUMN vice_teacher_username VARCHAR(100) DEFAULT NULL COMMENT '副班主任 username'",

    # --- users 表添加 class_name 列 ---
    "ALTER TABLE users ADD COLUMN class_name VARCHAR(100) DEFAULT '' COMMENT '班級名稱'",
]
