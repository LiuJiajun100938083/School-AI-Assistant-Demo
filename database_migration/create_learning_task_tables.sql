-- ============================================================
-- 學習任務發布系統 - 數據庫表
-- ============================================================
-- 用途: 管理員發布學習任務，教師/學生打卡追蹤進度
-- 創建日期: 2026-02-11
-- ============================================================

-- 1. 學習任務主表
CREATE TABLE IF NOT EXISTS learning_tasks (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL COMMENT '任務標題',
    description     TEXT COMMENT '簡短描述',
    content         TEXT COMMENT '詳細內容 (HTML/Markdown)',
    category        VARCHAR(50) DEFAULT 'general' COMMENT '分類: general, homework, reading, training, certification',
    priority        INT DEFAULT 1 COMMENT '優先級: 1=普通, 2=重要, 3=緊急',
    status          VARCHAR(20) DEFAULT 'draft' COMMENT '狀態: draft, published, archived',

    -- 創建者
    created_by      VARCHAR(100) NOT NULL COMMENT '創建者用戶名',

    -- 目標受眾
    target_type     VARCHAR(20) NOT NULL DEFAULT 'all' COMMENT '目標類型: all, all_teachers, all_students, teacher, student, class',
    target_value    VARCHAR(255) DEFAULT NULL COMMENT '目標值: 用戶名 / 班級名 (all 類型時為 NULL)',

    -- 統計
    total_recipients INT DEFAULT 0 COMMENT '接收人數',
    completed_count  INT DEFAULT 0 COMMENT '已完成人數',

    -- 附件
    attachments     JSON DEFAULT NULL COMMENT '附件/連結列表',

    -- 時間
    deadline        DATETIME DEFAULT NULL COMMENT '截止日期時間',
    published_at    DATETIME DEFAULT NULL COMMENT '發布時間',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- 軟刪除
    is_deleted      TINYINT(1) DEFAULT 0,

    -- 索引
    INDEX idx_status (status),
    INDEX idx_created_by (created_by),
    INDEX idx_target (target_type, target_value),
    INDEX idx_deadline (deadline),
    INDEX idx_published (published_at),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習任務主表';


-- 2. 學習任務子項 (打卡項)
CREATE TABLE IF NOT EXISTS learning_task_items (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    task_id         INT NOT NULL COMMENT '關聯任務ID',
    item_order      INT DEFAULT 0 COMMENT '排列順序',
    title           VARCHAR(255) NOT NULL COMMENT '項目標題',
    description     TEXT DEFAULT NULL COMMENT '項目描述',
    link_url        VARCHAR(500) DEFAULT NULL COMMENT '連結地址',
    link_label      VARCHAR(100) DEFAULT NULL COMMENT '連結文字',
    tag             VARCHAR(50) DEFAULT NULL COMMENT '標籤: video, doc, cert, practice, website',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_task_id (task_id),
    INDEX idx_task_order (task_id, item_order),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習任務子項/打卡項';


-- 3. 完成記錄表
CREATE TABLE IF NOT EXISTS learning_task_completions (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    task_id         INT NOT NULL COMMENT '關聯任務ID',
    username        VARCHAR(100) NOT NULL COMMENT '用戶名',
    item_id         INT DEFAULT NULL COMMENT '關聯子項ID (NULL=整體任務)',
    is_completed    TINYINT(1) DEFAULT 0 COMMENT '是否已完成',
    completed_at    DATETIME DEFAULT NULL COMMENT '完成時間',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_task_user_item (task_id, username, item_id),
    INDEX idx_task_id (task_id),
    INDEX idx_username (username),
    INDEX idx_completed (is_completed),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習任務完成記錄';
