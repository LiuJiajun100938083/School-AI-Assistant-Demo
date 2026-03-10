-- ============================================================
-- 試卷上傳 + AI 識別 + 作業題目 (三層數據模型)
-- ============================================================

-- 表 1: 批次主表
CREATE TABLE IF NOT EXISTS exam_upload_batches (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    batch_id             VARCHAR(64) NOT NULL UNIQUE   COMMENT 'UUID 批次號',
    subject              VARCHAR(50) NOT NULL           COMMENT '科目',
    status               ENUM('uploading','processing','completed','partial_failed','failed')
                         DEFAULT 'uploading'            COMMENT '批次聚合狀態',
    total_files          INT DEFAULT 0                  COMMENT '文件總數',
    completed_files      INT DEFAULT 0                  COMMENT '已完成文件數',
    failed_files         INT DEFAULT 0                  COMMENT '失敗文件數',
    total_questions      INT DEFAULT 0                  COMMENT '識別出的總題數',
    low_confidence_count INT DEFAULT 0                  COMMENT '低置信度題數',
    created_by           INT NOT NULL                   COMMENT '上傳教師 user.id',
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_batch (batch_id),
    INDEX idx_creator (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 表 2: 文件級記錄
CREATE TABLE IF NOT EXISTS exam_upload_files (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    batch_id          VARCHAR(64) NOT NULL              COMMENT '-> exam_upload_batches.batch_id',
    original_filename VARCHAR(255) NOT NULL,
    stored_filename   VARCHAR(255) NOT NULL              COMMENT 'UUID 磁盤文件名',
    file_type         VARCHAR(20) NOT NULL               COMMENT 'image / pdf',
    file_size         INT DEFAULT 0                      COMMENT '字節數',
    total_pages       INT DEFAULT 1                      COMMENT 'PDF 頁數，圖片=1',
    ocr_status        ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    ocr_result        JSON DEFAULT NULL                  COMMENT '該文件的識別結果 [{question...}]',
    error_message     TEXT DEFAULT NULL,
    processed_at      DATETIME DEFAULT NULL              COMMENT '處理完成時間',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_batch (batch_id),
    INDEX idx_status (ocr_status),
    FOREIGN KEY (batch_id) REFERENCES exam_upload_batches(batch_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 表 3: 正式作業題目（僅老師確認保存後寫入）
CREATE TABLE IF NOT EXISTS assignment_questions (
    id                       INT AUTO_INCREMENT PRIMARY KEY,
    assignment_id            INT NOT NULL                   COMMENT '-> assignments.id',
    question_order           INT DEFAULT 0                  COMMENT '排序',
    question_number          VARCHAR(20) DEFAULT ''         COMMENT '原始題號',
    question_text            TEXT NOT NULL                  COMMENT '題目內容 (支持 LaTeX)',
    answer_text              TEXT                           COMMENT '參考答案',
    answer_source            VARCHAR(20) DEFAULT 'missing'  COMMENT 'extracted/inferred/missing/manual',
    points                   DECIMAL(5,1) DEFAULT NULL      COMMENT '分值 (NULL=未標註)',
    question_type            VARCHAR(50) DEFAULT 'open'     COMMENT '題型: open/multiple_choice/fill_blank/true_false',
    question_type_confidence FLOAT DEFAULT NULL              COMMENT '題型判斷置信度',
    is_ai_extracted          BOOLEAN DEFAULT TRUE            COMMENT 'AI 識別 vs 老師手動添加',
    source_batch_id          VARCHAR(64) DEFAULT NULL        COMMENT '來源批次 (可追溯)',
    source_page              INT DEFAULT NULL                COMMENT '來源 PDF 頁碼',
    ocr_confidence           FLOAT DEFAULT NULL              COMMENT '識別置信度',
    metadata                 JSON DEFAULT NULL               COMMENT '擴展: has_math, has_figure 等',
    created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_assignment (assignment_id),
    INDEX idx_order (assignment_id, question_order),
    FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
