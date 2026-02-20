-- ============================================================
-- 课堂教学功能 - 阶段一建表脚本
-- 执行方式: mysql -u root -p school_ai_assistant < create_classroom_tables.sql
-- ============================================================

-- 1. 教室房间表
CREATE TABLE IF NOT EXISTS classroom_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) UNIQUE NOT NULL COMMENT '房间唯一标识 (UUID)',
    teacher_id INT NOT NULL COMMENT '创建教师 ID',
    teacher_username VARCHAR(100) NOT NULL COMMENT '创建教师用户名',
    title VARCHAR(255) NOT NULL COMMENT '房间标题',
    description TEXT COMMENT '房间描述',
    allowed_classes JSON NOT NULL COMMENT '允许的班级列表 ["7A","7B"]',
    current_ppt_file_id VARCHAR(64) COMMENT '当前使用的 PPT 文件 ID',
    room_status ENUM('draft', 'active', 'paused', 'ended') DEFAULT 'draft' COMMENT '房间状态',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at DATETIME COMMENT '结束时间',
    is_deleted BOOLEAN DEFAULT FALSE COMMENT '软删除标记',
    INDEX idx_teacher (teacher_username),
    INDEX idx_status (room_status),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (is_deleted, room_status),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='教室房间';

-- 2. 学生加入房间记录表
CREATE TABLE IF NOT EXISTS classroom_enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id VARCHAR(64) UNIQUE NOT NULL COMMENT '记录唯一标识 (UUID)',
    room_id VARCHAR(64) NOT NULL COMMENT '房间 ID',
    student_id INT NOT NULL COMMENT '学生用户 ID',
    student_username VARCHAR(100) NOT NULL COMMENT '学生用户名',
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '加入时间',
    left_at DATETIME COMMENT '离开时间',
    is_active BOOLEAN DEFAULT TRUE COMMENT '是否在线',
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '最后心跳时间',
    INDEX idx_room (room_id),
    INDEX idx_student (student_username),
    INDEX idx_room_active (room_id, is_active),
    UNIQUE KEY uk_room_student (room_id, student_username),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='学生加入房间记录';
