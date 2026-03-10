-- ============================================================
-- AI 智能錯題本 - 建表腳本
-- 執行方式: mysql -u root -p school_ai_assistant < create_mistake_book_tables.sql
-- ============================================================

-- 1. 知識點庫（樹形結構，支持任意科目擴展）
CREATE TABLE IF NOT EXISTS knowledge_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(50) NOT NULL COMMENT '科目: chinese/math/english',
    category VARCHAR(100) NOT NULL COMMENT '大類: 寫作/閱讀理解/代數/語法...',
    point_code VARCHAR(100) UNIQUE NOT NULL COMMENT '知識點編碼: math_algebra_quadratic',
    point_name VARCHAR(255) NOT NULL COMMENT '知識點名稱（繁體中文）',
    description TEXT COMMENT '知識點描述',
    grade_levels JSON COMMENT '適用年級 ["S1","S2","S3"]',
    parent_code VARCHAR(100) COMMENT '父知識點（樹形結構）',
    difficulty_level INT DEFAULT 1 COMMENT '難度 1-5',
    display_order INT DEFAULT 0 COMMENT '排序',
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_subject (subject),
    INDEX idx_category (subject, category),
    INDEX idx_parent (parent_code),
    INDEX idx_active (is_active, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='知識點庫（支持樹形結構，為自適應學習引擎預留）';

-- 2. 學生錯題記錄（核心表）
CREATE TABLE IF NOT EXISTS student_mistakes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) UNIQUE NOT NULL COMMENT 'UUID',
    student_username VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL COMMENT 'chinese/math/english',
    category VARCHAR(100) NOT NULL COMMENT '題目類型: 閱讀理解/代數/語法...',

    -- 原始內容
    original_image_path VARCHAR(500) COMMENT '上傳的原始照片路徑',
    extra_image_paths TEXT DEFAULT NULL COMMENT '額外圖片路徑（JSON 陣列）',
    ocr_question_text TEXT COMMENT 'AI 識別出的題目文字',
    ocr_answer_text TEXT COMMENT 'AI 識別出的學生答案',
    manual_question_text TEXT COMMENT '學生手動輸入/修正的題目',
    manual_answer_text TEXT COMMENT '學生手動輸入/修正的答案',

    -- AI 分析結果
    correct_answer TEXT COMMENT 'AI 給出的正確答案/參考答案',
    ai_analysis TEXT COMMENT 'AI 分析（錯誤原因、解題思路）',
    improvement_tips JSON COMMENT '改進建議 JSON 陣列',
    key_insight TEXT COMMENT '核心考點/知識點總結',
    error_type VARCHAR(100) COMMENT '錯誤類型: concept_error/calculation_error/comprehension_gap/careless/expression_weak',
    difficulty_level INT DEFAULT 1 COMMENT '題目難度 1-5',
    confidence_score FLOAT COMMENT 'AI 批改信心度 0-1',

    -- 狀態機
    status ENUM('pending_ocr', 'pending_review', 'analyzed', 'practicing', 'mastered', 'processing', 'ocr_failed', 'needs_review', 'analysis_failed', 'cancelled', 'analyzing')
        DEFAULT 'pending_ocr' COMMENT '錯題狀態',
    review_count INT DEFAULT 0 COMMENT '複習次數',
    last_review_at DATETIME COMMENT '最後複習時間',
    next_review_at DATETIME COMMENT '下次建議複習時間（間隔重複）',
    mastery_level INT DEFAULT 0 COMMENT '掌握度 0-100',

    -- 元數據
    source VARCHAR(50) DEFAULT 'photo' COMMENT 'photo/manual/classroom/game',
    tags JSON COMMENT '自定義標籤',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,

    INDEX idx_student_subject (student_username, subject),
    INDEX idx_student_status (student_username, status),
    INDEX idx_student_category (student_username, subject, category),
    INDEX idx_next_review (student_username, next_review_at),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (student_username, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='學生錯題記錄';

-- 3. 錯題-知識點關聯表（多對多）
CREATE TABLE IF NOT EXISTS mistake_knowledge_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    relevance_score FLOAT DEFAULT 1.0 COMMENT '相關度 0-1',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_mistake_point (mistake_id, point_code),
    INDEX idx_point (point_code),
    INDEX idx_mistake (mistake_id),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='錯題與知識點的多對多關聯';

-- 4. 學生知識點掌握度（自適應學習引擎核心數據）
CREATE TABLE IF NOT EXISTS student_knowledge_mastery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_username VARCHAR(100) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    mastery_level INT DEFAULT 50 COMMENT '掌握度 0-100',
    total_mistakes INT DEFAULT 0 COMMENT '該知識點總錯題數',
    resolved_mistakes INT DEFAULT 0 COMMENT '已掌握的錯題數',
    total_practices INT DEFAULT 0 COMMENT '練習次數',
    correct_practices INT DEFAULT 0 COMMENT '練習正確次數',
    last_mistake_at DATETIME COMMENT '最近一次出錯',
    last_practice_at DATETIME COMMENT '最近一次練習',
    trend VARCHAR(20) DEFAULT 'stable' COMMENT 'improving/declining/stable',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_student_point (student_username, point_code),
    INDEX idx_student_subject (student_username, subject),
    INDEX idx_mastery (student_username, mastery_level),
    INDEX idx_trend (student_username, trend)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='學生各知識點掌握度';

-- 5. AI 生成的練習題
CREATE TABLE IF NOT EXISTS practice_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    session_type ENUM('targeted', 'review', 'challenge', 'exam_prep') DEFAULT 'targeted'
        COMMENT 'targeted=針對薄弱點, review=間隔複習, challenge=挑戰提升, exam_prep=備考',
    target_points JSON COMMENT '目標知識點列表',
    questions JSON NOT NULL COMMENT '題目列表 JSON',
    total_questions INT DEFAULT 0,
    student_answers JSON COMMENT '學生答案 JSON',
    correct_count INT DEFAULT 0,
    score FLOAT COMMENT '得分 0-100',
    ai_feedback TEXT COMMENT 'AI 整體反饋',
    weak_points_identified JSON COMMENT '本次練習發現的薄弱點',
    status ENUM('generated', 'in_progress', 'completed', 'expired') DEFAULT 'generated',
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student (student_username, subject),
    INDEX idx_status (student_username, status),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='AI 生成的練習題';

-- 6. 錯題複習日誌（間隔重複追蹤）
CREATE TABLE IF NOT EXISTS mistake_review_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    review_type ENUM('flashcard', 'reattempt', 'practice') DEFAULT 'flashcard',
    result ENUM('remembered', 'forgot', 'partial') NOT NULL,
    time_spent_seconds INT COMMENT '花費時間（秒）',
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mistake (mistake_id),
    INDEX idx_student_date (student_username, reviewed_at DESC),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='錯題複習日誌（用於計算間隔重複時間）';

-- 7. 知識點掌握度快照（每次分析/練習/複習都記錄，用於繪製趨勢圖）
CREATE TABLE IF NOT EXISTS mastery_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_username VARCHAR(100) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    mastery_level INT NOT NULL COMMENT '快照時的掌握度 0-100',
    trigger_type ENUM('mistake', 'practice', 'review') NOT NULL COMMENT '觸發來源',
    trigger_id VARCHAR(64) COMMENT '觸發的 mistake_id 或 session_id',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student_point_time (student_username, point_code, created_at),
    INDEX idx_student_subject_time (student_username, subject, created_at DESC),
    INDEX idx_trigger (trigger_type, trigger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='知識點掌握度快照（每次變動都記錄，用於趨勢分析）';
