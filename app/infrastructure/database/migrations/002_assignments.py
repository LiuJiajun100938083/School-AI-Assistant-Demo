"""
Migration 002: 作業管理系統表

原位置: app/routers/__init__.py _run_schema_migrations() 後半部分
"""

MIGRATION_SQLS = [
    # --- assignments ---
    """
    CREATE TABLE IF NOT EXISTS assignments (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        title           VARCHAR(255) NOT NULL           COMMENT '作業標題',
        description     TEXT                            COMMENT '作業描述',
        created_by      INT                             COMMENT '教師 user id',
        created_by_name VARCHAR(100)                    COMMENT '教師名',
        target_type     ENUM('all','class','student') DEFAULT 'all' COMMENT '目標類型',
        target_value    VARCHAR(255)                    COMMENT '班級名 或 逗號分隔 username',
        max_score       DECIMAL(5,1) DEFAULT 100        COMMENT '滿分',
        deadline        DATETIME                        COMMENT '截止日期',
        status          ENUM('draft','published','closed') DEFAULT 'draft',
        allow_late      BOOLEAN DEFAULT FALSE           COMMENT '允許逾期',
        max_files       INT DEFAULT 5                   COMMENT '最大文件數',
        published_at    DATETIME                        COMMENT '發布時間',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_deleted      BOOLEAN DEFAULT FALSE           COMMENT '軟刪除'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- assignment_submissions ---
    """
    CREATE TABLE IF NOT EXISTS assignment_submissions (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id   INT NOT NULL                    COMMENT '作業ID',
        student_id      INT NOT NULL                    COMMENT '學生 user id',
        student_name    VARCHAR(100)                    COMMENT '學生名',
        username        VARCHAR(100)                    COMMENT '用戶名',
        class_name      VARCHAR(100)                    COMMENT '班級',
        content         TEXT                            COMMENT '文字備註',
        status          ENUM('submitted','graded','returned') DEFAULT 'submitted',
        score           DECIMAL(5,1)                    COMMENT '得分',
        feedback        TEXT                            COMMENT '教師評語',
        graded_by       INT                             COMMENT '批改教師 id',
        graded_at       DATETIME                        COMMENT '批改時間',
        is_late         BOOLEAN DEFAULT FALSE           COMMENT '是否逾期',
        submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_assignment_student (assignment_id, student_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- submission_files ---
    """
    CREATE TABLE IF NOT EXISTS submission_files (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        submission_id   INT NOT NULL                    COMMENT '提交ID',
        original_name   VARCHAR(255)                    COMMENT '原始文件名',
        stored_name     VARCHAR(255)                    COMMENT 'UUID存儲名',
        file_path       VARCHAR(500)                    COMMENT '相對路徑',
        file_size       BIGINT                          COMMENT '字節數',
        file_type       VARCHAR(20)                     COMMENT '類型: pdf/doc/image/video/code/archive',
        mime_type       VARCHAR(100)                    COMMENT 'MIME 類型',
        INDEX idx_submission (submission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- assignment_rubric_items ---
    """
    CREATE TABLE IF NOT EXISTS assignment_rubric_items (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id   INT NOT NULL                    COMMENT '作業ID',
        item_order      INT DEFAULT 0                   COMMENT '排序',
        title           VARCHAR(255) NOT NULL           COMMENT '評分項目名',
        max_points      DECIMAL(5,1) NOT NULL           COMMENT '該項滿分',
        INDEX idx_assignment (assignment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- submission_rubric_scores ---
    """
    CREATE TABLE IF NOT EXISTS submission_rubric_scores (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        submission_id   INT NOT NULL                    COMMENT '提交ID',
        rubric_item_id  INT NOT NULL                    COMMENT '評分項目ID',
        points          DECIMAL(5,1)                    COMMENT '該項得分',
        UNIQUE KEY uk_submission_rubric (submission_id, rubric_item_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- 多類型評分標準擴展 ---
    "ALTER TABLE assignments ADD COLUMN rubric_type VARCHAR(30) DEFAULT 'points' COMMENT '评分类型' AFTER max_score",
    "ALTER TABLE assignments ADD COLUMN rubric_config JSON DEFAULT NULL COMMENT '类型配置 JSON' AFTER rubric_type",
    "ALTER TABLE assignments ADD COLUMN assignment_type VARCHAR(20) DEFAULT 'file_upload' COMMENT '作業類型: file_upload/form/exam' AFTER description",

    # --- rubric_items 擴展 ---
    "ALTER TABLE assignment_rubric_items ADD COLUMN level_definitions JSON DEFAULT NULL COMMENT '等级定义 JSON' AFTER max_points",
    "ALTER TABLE assignment_rubric_items ADD COLUMN weight DECIMAL(5,2) DEFAULT NULL COMMENT '权重百分比' AFTER level_definitions",

    # --- rubric_scores 擴展 ---
    "ALTER TABLE submission_rubric_scores ADD COLUMN selected_level VARCHAR(100) DEFAULT NULL COMMENT '选择的等级' AFTER points",

    # --- assignment_attachments ---
    """
    CREATE TABLE IF NOT EXISTS assignment_attachments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id INT NOT NULL,
        original_name VARCHAR(500) NOT NULL,
        stored_name VARCHAR(500) NOT NULL,
        file_path VARCHAR(1000) NOT NULL,
        file_size BIGINT DEFAULT 0,
        file_type VARCHAR(50) DEFAULT '',
        mime_type VARCHAR(200) DEFAULT '',
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        is_deleted TINYINT(1) DEFAULT 0,
        INDEX idx_attachment_assignment (assignment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- plagiarism_reports ---
    """
    CREATE TABLE IF NOT EXISTS plagiarism_reports (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id   INT NOT NULL                    COMMENT '作業ID',
        status          ENUM('pending','running','completed','failed') DEFAULT 'pending',
        threshold       DECIMAL(5,2) DEFAULT 60.00     COMMENT '相似度閾值',
        subject         VARCHAR(30) DEFAULT ''           COMMENT '科目代碼',
        detect_mode     VARCHAR(20) DEFAULT 'mixed'     COMMENT '作業類型 code/text/mixed',
        total_pairs     INT DEFAULT 0                   COMMENT '對比總對數',
        flagged_pairs   INT DEFAULT 0                   COMMENT '標記可疑對數',
        created_by      INT                             COMMENT '發起教師ID',
        error_message   TEXT                            COMMENT '錯誤資訊',
        created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at    DATETIME,
        INDEX idx_plag_assignment (assignment_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- plagiarism_reports 欄位補全 ---
    "ALTER TABLE plagiarism_reports ADD COLUMN subject VARCHAR(30) DEFAULT '' COMMENT '科目代碼' AFTER threshold",
    "ALTER TABLE plagiarism_reports ADD COLUMN detect_mode VARCHAR(20) DEFAULT 'mixed' COMMENT '作業類型 code/text/mixed' AFTER subject",

    # --- plagiarism_pairs ---
    """
    CREATE TABLE IF NOT EXISTS plagiarism_pairs (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        report_id       INT NOT NULL                    COMMENT '報告ID',
        submission_a_id INT NOT NULL                    COMMENT '提交A',
        submission_b_id INT NOT NULL                    COMMENT '提交B',
        student_a_name  VARCHAR(100) DEFAULT ''         COMMENT '學生A名',
        student_b_name  VARCHAR(100) DEFAULT ''         COMMENT '學生B名',
        similarity_score DECIMAL(5,2) NOT NULL          COMMENT '相似度 0-100',
        matched_fragments JSON                          COMMENT '匹配片段詳情',
        ai_analysis     TEXT                            COMMENT 'AI 分析說明',
        is_flagged      TINYINT(1) DEFAULT 0            COMMENT '是否標記為可疑',
        INDEX idx_plag_report (report_id),
        INDEX idx_plag_flagged (report_id, is_flagged)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- exam_upload_batches ---
    """
    CREATE TABLE IF NOT EXISTS exam_upload_batches (
        id                   INT AUTO_INCREMENT PRIMARY KEY,
        batch_id             VARCHAR(64) NOT NULL UNIQUE   COMMENT 'UUID 批次號',
        subject              VARCHAR(50) NOT NULL           COMMENT '科目',
        status               ENUM('uploading','processing','completed','partial_failed','failed')
                             DEFAULT 'uploading'            COMMENT '批次聚合狀態',
        total_files          INT DEFAULT 0,
        completed_files      INT DEFAULT 0,
        failed_files         INT DEFAULT 0,
        total_questions      INT DEFAULT 0,
        low_confidence_count INT DEFAULT 0,
        created_by           INT NOT NULL                   COMMENT '上傳教師 user.id',
        created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_batch (batch_id),
        INDEX idx_creator (created_by)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- exam_upload_files ---
    """
    CREATE TABLE IF NOT EXISTS exam_upload_files (
        id                INT AUTO_INCREMENT PRIMARY KEY,
        batch_id          VARCHAR(64) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        stored_filename   VARCHAR(255) NOT NULL,
        file_type         VARCHAR(20) NOT NULL,
        file_size         INT DEFAULT 0,
        total_pages       INT DEFAULT 1,
        ocr_status        ENUM('pending','processing','completed','failed') DEFAULT 'pending',
        ocr_result        JSON DEFAULT NULL,
        error_message     TEXT DEFAULT NULL,
        processed_at      DATETIME DEFAULT NULL,
        created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_euf_batch (batch_id),
        INDEX idx_euf_status (ocr_status),
        FOREIGN KEY (batch_id) REFERENCES exam_upload_batches(batch_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- assignment_questions ---
    """
    CREATE TABLE IF NOT EXISTS assignment_questions (
        id                       INT AUTO_INCREMENT PRIMARY KEY,
        assignment_id            INT NOT NULL,
        question_order           INT DEFAULT 0,
        question_number          VARCHAR(20) DEFAULT '',
        question_text            TEXT NOT NULL,
        answer_text              TEXT,
        answer_source            VARCHAR(20) DEFAULT 'missing',
        points                   DECIMAL(5,1) DEFAULT NULL,
        question_type            VARCHAR(50) DEFAULT 'open',
        question_type_confidence FLOAT DEFAULT NULL,
        is_ai_extracted          BOOLEAN DEFAULT TRUE,
        source_batch_id          VARCHAR(64) DEFAULT NULL,
        source_page              INT DEFAULT NULL,
        ocr_confidence           FLOAT DEFAULT NULL,
        metadata                 JSON DEFAULT NULL,
        created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_aq_assignment (assignment_id),
        INDEX idx_aq_order (assignment_id, question_order),
        FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- submission_answers ---
    """
    CREATE TABLE IF NOT EXISTS submission_answers (
        id                  INT AUTO_INCREMENT PRIMARY KEY,
        submission_id       INT NOT NULL,
        question_id         INT NOT NULL,
        answer_text         TEXT,
        is_correct          TINYINT(1) DEFAULT NULL,
        points              DECIMAL(5,1) DEFAULT NULL,
        ai_points           DECIMAL(5,1) DEFAULT NULL,
        ai_feedback         TEXT,
        teacher_feedback    TEXT,
        score_source        ENUM('auto','ai','teacher') DEFAULT NULL,
        graded_at           DATETIME DEFAULT NULL,
        reviewed_at         DATETIME DEFAULT NULL,
        created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_answer_submission
            FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE,
        CONSTRAINT fk_answer_question
            FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
        UNIQUE KEY uk_sub_question (submission_id, question_id),
        INDEX idx_sa_submission (submission_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- submission_answer_files ---
    """
    CREATE TABLE IF NOT EXISTS submission_answer_files (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        answer_id       INT NOT NULL,
        original_name   VARCHAR(500) NOT NULL,
        stored_name     VARCHAR(500) NOT NULL,
        file_path       VARCHAR(1000) NOT NULL,
        file_size       BIGINT DEFAULT 0,
        file_type       VARCHAR(50) DEFAULT '',
        mime_type       VARCHAR(200) DEFAULT '',
        uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_answer_file_answer
            FOREIGN KEY (answer_id) REFERENCES submission_answers(id) ON DELETE CASCADE,
        INDEX idx_saf_answer (answer_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
]
