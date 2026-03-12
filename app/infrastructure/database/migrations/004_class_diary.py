"""
Migration 004: 課室日誌系統表

原位置: app/routers/class_diary.py init_class_diary_tables()
"""

MIGRATION_SQLS = [
    # --- class_diary_entries ---
    """
    CREATE TABLE IF NOT EXISTS class_diary_entries (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        class_code          VARCHAR(20)  NOT NULL          COMMENT '班級代碼',
        entry_date          DATE         NOT NULL          COMMENT '上課日期',
        period_start        TINYINT      NOT NULL          COMMENT '起始節數 0=早會,1-9',
        period_end          TINYINT      NOT NULL          COMMENT '結束節數',
        subject             VARCHAR(100) NOT NULL          COMMENT '科目',
        absent_students     TEXT                           COMMENT '缺席學生',
        late_students       TEXT                           COMMENT '遲到學生',
        discipline_rating   TINYINT      NOT NULL DEFAULT 0 COMMENT '紀律 1-5',
        cleanliness_rating  TINYINT      NOT NULL DEFAULT 0 COMMENT '整潔 1-5',
        commended_students  TEXT                           COMMENT '嘉許學生',
        appearance_issues   TEXT                           COMMENT '儀表違規',
        rule_violations     TEXT                           COMMENT '課堂違規',
        signature           MEDIUMTEXT                     COMMENT '手寫簽名 base64',
        submitted_from      VARCHAR(255)                   COMMENT '提交來源 UA',
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_class_date (class_code, entry_date),
        INDEX idx_date (entry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- class_diary_reviewers ---
    """
    CREATE TABLE IF NOT EXISTS class_diary_reviewers (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(100) NOT NULL UNIQUE     COMMENT '被授權用戶名',
        granted_by  VARCHAR(100) NOT NULL            COMMENT '授權管理員',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- class_diary_daily_reports ---
    """
    CREATE TABLE IF NOT EXISTS class_diary_daily_reports (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        report_date     DATE NOT NULL UNIQUE          COMMENT '報告日期',
        report_text     MEDIUMTEXT NOT NULL            COMMENT 'AI 生成的報告文本',
        anomalies_json  MEDIUMTEXT                    COMMENT '異常記錄 JSON',
        status          VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/generating/done/failed',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- class_diary_report_recipients ---
    """
    CREATE TABLE IF NOT EXISTS class_diary_report_recipients (
        id          INT AUTO_INCREMENT PRIMARY KEY,
        username    VARCHAR(100) NOT NULL UNIQUE     COMMENT '報告接收人用戶名',
        granted_by  VARCHAR(100) NOT NULL            COMMENT '授權管理員',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- 欄位遷移 ---
    "ALTER TABLE class_diary_entries ADD COLUMN submitted_by VARCHAR(100) DEFAULT NULL COMMENT '提交者用戶名' AFTER submitted_from",
    "ALTER TABLE class_diary_entries ADD UNIQUE INDEX uq_class_date_period (class_code, entry_date, period_start, period_end)",
    "ALTER TABLE class_diary_entries ADD COLUMN medical_room_students TEXT DEFAULT NULL COMMENT '醫務室' AFTER rule_violations",
    "ALTER TABLE class_diary_daily_reports ADD COLUMN summary_text MEDIUMTEXT DEFAULT NULL COMMENT '摘要版報告（不含學生姓名）' AFTER report_text",

    # --- class_diary_range_reports ---
    """
    CREATE TABLE IF NOT EXISTS class_diary_range_reports (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        start_date      DATE NOT NULL              COMMENT '開始日期',
        end_date        DATE NOT NULL              COMMENT '結束日期',
        report_text     MEDIUMTEXT                 COMMENT '完整版報告',
        summary_text    MEDIUMTEXT                 COMMENT '摘要版報告',
        anomalies_json  MEDIUMTEXT                 COMMENT '異常記錄 JSON',
        status          VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/generating/done/failed',
        requested_by    VARCHAR(100)               COMMENT '請求生成者',
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE INDEX uq_date_range (start_date, end_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
]
