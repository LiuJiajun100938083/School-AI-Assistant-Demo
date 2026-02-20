-- ============================================================
-- 课堂教学功能 - 阶段二建表脚本
-- 执行方式: mysql -u root -p school_ai_assistant < create_classroom_tables_phase2.sql
-- ============================================================

-- 1. PPT 文件表
CREATE TABLE IF NOT EXISTS ppt_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(64) UNIQUE NOT NULL COMMENT '文件唯一标识 (UUID)',
    room_id VARCHAR(64) NOT NULL COMMENT '所属房间 ID',
    teacher_username VARCHAR(100) NOT NULL COMMENT '上传教师',
    original_filename VARCHAR(255) NOT NULL COMMENT '原始文件名',
    stored_path VARCHAR(500) NOT NULL COMMENT '服务器存储路径',
    file_size BIGINT NOT NULL COMMENT '文件大小 (bytes)',
    total_pages INT DEFAULT 0 COMMENT '总页数',
    process_status ENUM('pending','processing','completed','failed') DEFAULT 'pending' COMMENT '处理状态',
    error_message TEXT COMMENT '处理失败时的错误信息',
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME COMMENT '处理完成时间',
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_room (room_id),
    INDEX idx_status (process_status),
    INDEX idx_teacher (teacher_username),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='PPT 文件';

-- 2. PPT 单页表
CREATE TABLE IF NOT EXISTS ppt_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id VARCHAR(64) UNIQUE NOT NULL COMMENT '页面唯一标识 (UUID)',
    file_id VARCHAR(64) NOT NULL COMMENT '所属 PPT 文件 ID',
    page_number INT NOT NULL COMMENT '页码 (从1开始)',
    image_path VARCHAR(500) NOT NULL COMMENT '页面图片路径',
    thumbnail_path VARCHAR(500) COMMENT '缩略图路径',
    text_content LONGTEXT COMMENT '页面提取的文字内容 (供 AI 使用)',
    INDEX idx_file_page (file_id, page_number),
    FOREIGN KEY (file_id) REFERENCES ppt_files(file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='PPT 单页';

-- 3. 教师推送快照表
CREATE TABLE IF NOT EXISTS classroom_pushes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    push_id VARCHAR(64) UNIQUE NOT NULL COMMENT '推送唯一标识 (UUID)',
    room_id VARCHAR(64) NOT NULL COMMENT '房间 ID',
    page_id VARCHAR(64) NOT NULL COMMENT '当前页面 ID',
    page_number INT NOT NULL COMMENT '当前页码',
    annotations_json LONGTEXT COMMENT 'Fabric.js Canvas JSON 标注数据',
    pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '推送时间',
    INDEX idx_room_time (room_id, pushed_at DESC),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='教师推送快照 (每次传送记录一条)';
