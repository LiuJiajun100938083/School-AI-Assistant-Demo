-- ============================================================
-- Local Database Initialization Script
-- Run: "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p12321 < init_local_db.sql
-- ============================================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Create database
CREATE DATABASE IF NOT EXISTS school_ai_assistant
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE school_ai_assistant;

-- ============================================================
-- Drop all existing tables (clean slate)
-- ============================================================
DROP TABLE IF EXISTS forum_user_preferences;
DROP TABLE IF EXISTS forum_subscriptions;
DROP TABLE IF EXISTS forum_tags;
DROP TABLE IF EXISTS forum_attachments;
DROP TABLE IF EXISTS forum_notifications;
DROP TABLE IF EXISTS forum_votes;
DROP TABLE IF EXISTS forum_replies;
DROP TABLE IF EXISTS forum_posts;
DROP TABLE IF EXISTS lc_path_steps;
DROP TABLE IF EXISTS lc_learning_paths;
DROP TABLE IF EXISTS lc_node_contents;
DROP TABLE IF EXISTS lc_knowledge_edges;
DROP TABLE IF EXISTS lc_knowledge_nodes;
DROP TABLE IF EXISTS lc_content_categories;
DROP TABLE IF EXISTS lc_contents;
DROP TABLE IF EXISTS lc_categories;
DROP TABLE IF EXISTS learning_task_completions;
DROP TABLE IF EXISTS learning_task_items;
DROP TABLE IF EXISTS learning_tasks;
DROP TABLE IF EXISTS mastery_snapshots;
DROP TABLE IF EXISTS mistake_review_log;
DROP TABLE IF EXISTS practice_sessions;
DROP TABLE IF EXISTS student_knowledge_mastery;
DROP TABLE IF EXISTS mistake_knowledge_links;
DROP TABLE IF EXISTS student_mistakes;
DROP TABLE IF EXISTS knowledge_points;
DROP TABLE IF EXISTS classroom_pushes;
DROP TABLE IF EXISTS ppt_pages;
DROP TABLE IF EXISTS ppt_files;
DROP TABLE IF EXISTS classroom_enrollments;
DROP TABLE IF EXISTS classroom_rooms;
DROP TABLE IF EXISTS query_cache;
DROP TABLE IF EXISTS knowledge_index;
DROP TABLE IF EXISTS subjects;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS deletion_requests;
DROP TABLE IF EXISTS data_access_logs;
DROP TABLE IF EXISTS learning_analytics;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS password_history;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS classes;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- 1. Users table (core - must be first)
-- ============================================================
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    username VARCHAR(50) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100),
    email VARCHAR(100),
    email_encrypted TEXT,
    phone VARCHAR(20),
    phone_encrypted TEXT,
    role ENUM('student', 'teacher', 'admin') DEFAULT 'student',
    class_id INT,
    class_name VARCHAR(100) DEFAULT '',
    is_active BOOLEAN DEFAULT TRUE,
    is_locked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    login_count INT DEFAULT 0,
    password_changed_at TIMESTAMP NULL,
    must_change_password BOOLEAN DEFAULT FALSE,
    data_consent BOOLEAN DEFAULT FALSE,
    data_consent_date TIMESTAMP NULL,
    INDEX idx_username (username),
    INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Classes table
-- ============================================================
CREATE TABLE classes (
    class_id INT AUTO_INCREMENT PRIMARY KEY,
    class_code VARCHAR(20) UNIQUE NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    grade VARCHAR(20),
    teacher_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Messages & Conversations (from create_tables.py)
-- ============================================================
CREATE TABLE conversations (
    conversation_id VARCHAR(36) PRIMARY KEY,
    user_id INT NOT NULL,
    username VARCHAR(100),
    title VARCHAR(200),
    subject VARCHAR(50),
    messages JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    message_count INT DEFAULT 0,
    is_archived BOOLEAN DEFAULT FALSE,
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_conv (username, conversation_id),
    INDEX idx_user_conversations (user_id, updated_at),
    INDEX idx_username (username),
    INDEX idx_subject (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    role ENUM('user', 'assistant', 'system') NOT NULL,
    content TEXT NOT NULL,
    content_encrypted TEXT,
    thinking TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token_count INT,
    model_used VARCHAR(50),
    is_flagged BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    INDEX idx_conversation_messages (conversation_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Audit & Security tables
-- ============================================================
CREATE TABLE audit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    user_id INT,
    username VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(100),
    details JSON,
    status ENUM('success', 'failure', 'warning'),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_timestamp (timestamp),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE password_history (
    history_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE learning_analytics (
    analytics_id INT AUTO_INCREMENT PRIMARY KEY,
    user_hash VARCHAR(64) NOT NULL,
    subject_code VARCHAR(50),
    session_date DATE,
    metrics JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_analytics_date (session_date),
    INDEX idx_analytics_subject (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE data_access_logs (
    access_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    accessed_user_id INT,
    access_type ENUM('read', 'write', 'delete') NOT NULL,
    data_category VARCHAR(50),
    purpose VARCHAR(200),
    legal_basis VARCHAR(100),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (accessed_user_id) REFERENCES users(id),
    INDEX idx_access_user (user_id),
    INDEX idx_access_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE deletion_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason TEXT,
    status ENUM('pending', 'approved', 'completed', 'rejected') DEFAULT 'pending',
    processed_date TIMESTAMP NULL,
    processed_by INT,
    notes TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    INDEX idx_deletion_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. Subjects, Knowledge Index, Cache (from create_tables.sql)
-- ============================================================
CREATE TABLE IF NOT EXISTS subjects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_code VARCHAR(50) UNIQUE NOT NULL,
    subject_name VARCHAR(100) NOT NULL,
    config JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_subject_code (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS knowledge_index (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject_code VARCHAR(50) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path TEXT,
    content_hash VARCHAR(64),
    metadata JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_subject (subject_code),
    UNIQUE KEY unique_subject_file (subject_code, file_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS query_cache (
    id INT AUTO_INCREMENT PRIMARY KEY,
    cache_key VARCHAR(255) UNIQUE NOT NULL,
    cache_value JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    INDEX idx_cache_key (cache_key),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. Classroom tables (Phase 1)
-- ============================================================
CREATE TABLE IF NOT EXISTS classroom_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) UNIQUE NOT NULL,
    teacher_id INT NOT NULL,
    teacher_username VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    allowed_classes JSON NOT NULL,
    current_ppt_file_id VARCHAR(64),
    room_status ENUM('draft', 'active', 'paused', 'ended') DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at DATETIME,
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_teacher (teacher_username),
    INDEX idx_status (room_status),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (is_deleted, room_status),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classroom_enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    student_id INT NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    left_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room (room_id),
    INDEX idx_student (student_username),
    INDEX idx_room_active (room_id, is_active),
    UNIQUE KEY uk_room_student (room_id, student_username),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. Classroom tables (Phase 2)
-- ============================================================
CREATE TABLE IF NOT EXISTS ppt_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    teacher_username VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    total_pages INT DEFAULT 0,
    process_status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_message TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_room (room_id),
    INDEX idx_status (process_status),
    INDEX idx_teacher (teacher_username),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ppt_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id VARCHAR(64) UNIQUE NOT NULL,
    file_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    thumbnail_path VARCHAR(500),
    text_content LONGTEXT,
    INDEX idx_file_page (file_id, page_number),
    FOREIGN KEY (file_id) REFERENCES ppt_files(file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classroom_pushes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    push_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    annotations_json LONGTEXT,
    pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_time (room_id, pushed_at DESC),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. Mistake Book tables
-- ============================================================
CREATE TABLE IF NOT EXISTS knowledge_points (
    id INT AUTO_INCREMENT PRIMARY KEY,
    subject VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    point_code VARCHAR(100) UNIQUE NOT NULL,
    point_name VARCHAR(255) NOT NULL,
    description TEXT,
    grade_levels JSON,
    parent_code VARCHAR(100),
    difficulty_level INT DEFAULT 1,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_subject (subject),
    INDEX idx_category (subject, category),
    INDEX idx_parent (parent_code),
    INDEX idx_active (is_active, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_mistakes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) UNIQUE NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    original_image_path VARCHAR(500),
    ocr_question_text TEXT,
    ocr_answer_text TEXT,
    manual_question_text TEXT,
    manual_answer_text TEXT,
    correct_answer TEXT,
    ai_analysis TEXT,
    improvement_tips JSON,
    key_insight TEXT,
    error_type VARCHAR(100),
    difficulty_level INT DEFAULT 1,
    confidence_score FLOAT,
    status ENUM('pending_ocr', 'pending_review', 'analyzed', 'practicing', 'mastered', 'processing', 'ocr_failed', 'needs_review', 'analysis_failed') DEFAULT 'pending_ocr',
    review_count INT DEFAULT 0,
    last_review_at DATETIME,
    next_review_at DATETIME,
    mastery_level INT DEFAULT 0,
    source VARCHAR(50) DEFAULT 'photo',
    tags JSON,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_student_subject (student_username, subject),
    INDEX idx_student_status (student_username, status),
    INDEX idx_student_category (student_username, subject, category),
    INDEX idx_next_review (student_username, next_review_at),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (student_username, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mistake_knowledge_links (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    relevance_score FLOAT DEFAULT 1.0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_mistake_point (mistake_id, point_code),
    INDEX idx_point (point_code),
    INDEX idx_mistake (mistake_id),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_knowledge_mastery (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_username VARCHAR(100) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    mastery_level INT DEFAULT 50,
    total_mistakes INT DEFAULT 0,
    resolved_mistakes INT DEFAULT 0,
    total_practices INT DEFAULT 0,
    correct_practices INT DEFAULT 0,
    last_mistake_at DATETIME,
    last_practice_at DATETIME,
    trend VARCHAR(20) DEFAULT 'stable',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_student_point (student_username, point_code),
    INDEX idx_student_subject (student_username, subject),
    INDEX idx_mastery (student_username, mastery_level),
    INDEX idx_trend (student_username, trend)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS practice_sessions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(64) UNIQUE NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    session_type ENUM('targeted', 'review', 'challenge', 'exam_prep') DEFAULT 'targeted',
    target_points JSON,
    questions JSON NOT NULL,
    total_questions INT DEFAULT 0,
    student_answers JSON,
    correct_count INT DEFAULT 0,
    score FLOAT,
    ai_feedback TEXT,
    weak_points_identified JSON,
    status ENUM('generated', 'in_progress', 'completed', 'expired') DEFAULT 'generated',
    started_at DATETIME,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student (student_username, subject),
    INDEX idx_status (student_username, status),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mistake_review_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id VARCHAR(64) NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    review_type ENUM('flashcard', 'reattempt', 'practice') DEFAULT 'flashcard',
    result ENUM('remembered', 'forgot', 'partial') NOT NULL,
    time_spent_seconds INT,
    reviewed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_mistake (mistake_id),
    INDEX idx_student_date (student_username, reviewed_at DESC),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS mastery_snapshots (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_username VARCHAR(100) NOT NULL,
    point_code VARCHAR(100) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    mastery_level INT NOT NULL,
    trigger_type ENUM('mistake', 'practice', 'review') NOT NULL,
    trigger_id VARCHAR(64),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_student_point_time (student_username, point_code, created_at),
    INDEX idx_student_subject_time (student_username, subject, created_at DESC),
    INDEX idx_trigger (trigger_type, trigger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 9. Learning Task tables
-- ============================================================
CREATE TABLE IF NOT EXISTS learning_tasks (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content TEXT,
    category VARCHAR(50) DEFAULT 'general',
    priority INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'draft',
    created_by VARCHAR(100) NOT NULL,
    target_type VARCHAR(20) NOT NULL DEFAULT 'all',
    target_value VARCHAR(255) DEFAULT NULL,
    total_recipients INT DEFAULT 0,
    completed_count INT DEFAULT 0,
    attachments JSON DEFAULT NULL,
    deadline DATETIME DEFAULT NULL,
    published_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_status (status),
    INDEX idx_created_by (created_by),
    INDEX idx_target (target_type, target_value),
    INDEX idx_deadline (deadline),
    INDEX idx_published (published_at),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_task_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    item_order INT DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT DEFAULT NULL,
    link_url VARCHAR(500) DEFAULT NULL,
    link_label VARCHAR(100) DEFAULT NULL,
    tag VARCHAR(50) DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_task_id (task_id),
    INDEX idx_task_order (task_id, item_order),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS learning_task_completions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    task_id INT NOT NULL,
    username VARCHAR(100) NOT NULL,
    item_id INT DEFAULT NULL,
    is_completed TINYINT(1) DEFAULT 0,
    completed_at DATETIME DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_task_user_item (task_id, username, item_id),
    INDEX idx_task_id (task_id),
    INDEX idx_username (username),
    INDEX idx_completed (is_completed),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. Learning Center tables
-- ============================================================
CREATE TABLE IF NOT EXISTS lc_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(10) DEFAULT '📁',
    description TEXT,
    parent_id INT DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_parent (parent_id),
    INDEX idx_sort (sort_order),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_contents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type VARCHAR(30) NOT NULL,
    file_path VARCHAR(500),
    file_name VARCHAR(255),
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(100),
    external_url VARCHAR(500),
    video_platform VARCHAR(50),
    embed_url VARCHAR(500),
    article_content LONGTEXT,
    thumbnail_path VARCHAR(500),
    duration INT DEFAULT 0,
    tags JSON,
    metadata JSON,
    status VARCHAR(20) DEFAULT 'draft',
    view_count INT DEFAULT 0,
    created_by VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_type (content_type),
    INDEX idx_status (status),
    INDEX idx_created (created_at DESC),
    INDEX idx_deleted (is_deleted),
    FULLTEXT idx_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_content_categories (
    content_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (content_id, category_id),
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_knowledge_nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '💡',
    color VARCHAR(20) DEFAULT '#006633',
    node_size INT DEFAULT 40,
    position_x FLOAT DEFAULT NULL,
    position_y FLOAT DEFAULT NULL,
    is_pinned TINYINT(1) DEFAULT 0,
    category_id INT DEFAULT NULL,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_category (category_id),
    INDEX idx_deleted (is_deleted),
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_knowledge_edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    relation_type VARCHAR(50) DEFAULT 'related',
    label VARCHAR(100),
    weight FLOAT DEFAULT 1.0,
    UNIQUE KEY uk_edge (source_node_id, target_node_id),
    FOREIGN KEY (source_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_node_contents (
    node_id INT NOT NULL,
    content_id INT NOT NULL,
    sort_order INT DEFAULT 0,
    anchor JSON DEFAULT NULL COMMENT '定位锚点 JSON',
    PRIMARY KEY (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_learning_paths (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '🗺️',
    cover_image VARCHAR(500),
    difficulty VARCHAR(20) DEFAULT 'beginner',
    estimated_hours FLOAT DEFAULT 0,
    tags JSON,
    status VARCHAR(20) DEFAULT 'draft',
    sort_order INT DEFAULT 0,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,
    INDEX idx_status (status),
    INDEX idx_difficulty (difficulty),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lc_path_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path_id INT NOT NULL,
    step_order INT NOT NULL DEFAULT 0,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_id INT DEFAULT NULL,
    node_id INT DEFAULT NULL,
    metadata JSON,
    INDEX idx_path_order (path_id, step_order),
    FOREIGN KEY (path_id) REFERENCES lc_learning_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE SET NULL,
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. Forum tables
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_posts (
    post_id INT AUTO_INCREMENT PRIMARY KEY,
    author_username VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT NOT NULL,
    content_html LONGTEXT,
    post_type ENUM('discussion', 'question', 'announcement') NOT NULL DEFAULT 'discussion',
    visibility ENUM('public', 'private') NOT NULL DEFAULT 'public',
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    anonymous_name VARCHAR(50) DEFAULT NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
    view_count INT UNSIGNED NOT NULL DEFAULT 0,
    reply_count INT UNSIGNED NOT NULL DEFAULT 0,
    upvote_count INT UNSIGNED NOT NULL DEFAULT 0,
    tags JSON DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at DATETIME DEFAULT NULL,
    deleted_by VARCHAR(100) DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    CONSTRAINT fk_post_author FOREIGN KEY (author_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_post_author (author_username),
    INDEX idx_post_visibility_deleted (visibility, is_deleted),
    INDEX idx_post_type (post_type),
    INDEX idx_post_created (created_at DESC),
    INDEX idx_post_pinned (is_pinned DESC, created_at DESC),
    INDEX idx_post_upvote (upvote_count DESC),
    FULLTEXT INDEX ft_post_search (title, content)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_replies (
    reply_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT NOT NULL,
    parent_reply_id INT DEFAULT NULL,
    author_username VARCHAR(100) NOT NULL,
    content LONGTEXT NOT NULL,
    content_html LONGTEXT,
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE,
    anonymous_name VARCHAR(50) DEFAULT NULL,
    is_instructor_response BOOLEAN NOT NULL DEFAULT FALSE,
    is_accepted_answer BOOLEAN NOT NULL DEFAULT FALSE,
    upvote_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at DATETIME DEFAULT NULL,
    deleted_by VARCHAR(100) DEFAULT NULL,
    metadata JSON DEFAULT NULL,
    CONSTRAINT fk_reply_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reply_author FOREIGN KEY (author_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reply_parent FOREIGN KEY (parent_reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_reply_post (post_id, created_at ASC),
    INDEX idx_reply_author (author_username),
    INDEX idx_reply_parent (parent_reply_id),
    INDEX idx_reply_instructor (is_instructor_response),
    INDEX idx_reply_accepted (is_accepted_answer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_votes (
    vote_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT DEFAULT NULL,
    reply_id INT DEFAULT NULL,
    voter_username VARCHAR(100) NOT NULL,
    vote_type ENUM('upvote', 'downvote') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_vote_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_voter FOREIGN KEY (voter_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_post_vote (post_id, voter_username),
    UNIQUE KEY uk_reply_vote (reply_id, voter_username),
    -- Note: CHECK constraint removed due to MySQL 8.0 incompatibility with FK columns
    INDEX idx_vote_voter (voter_username),
    INDEX idx_vote_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_username VARCHAR(100) NOT NULL,
    post_id INT DEFAULT NULL,
    reply_id INT DEFAULT NULL,
    notification_type ENUM('new_reply', 'new_post', 'mention', 'instructor_response', 'answer_accepted', 'upvote') NOT NULL,
    related_username VARCHAR(100) DEFAULT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    read_at DATETIME DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_related FOREIGN KEY (related_username)
        REFERENCES users(username) ON DELETE SET NULL ON UPDATE CASCADE,
    INDEX idx_notification_user_unread (user_username, is_read, created_at DESC),
    INDEX idx_notification_created (created_at DESC),
    INDEX idx_notification_type (notification_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_attachments (
    attachment_id INT AUTO_INCREMENT PRIMARY KEY,
    post_id INT DEFAULT NULL,
    reply_id INT DEFAULT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_path VARCHAR(500) NOT NULL,
    file_size INT UNSIGNED NOT NULL,
    file_type ENUM('image', 'document', 'video', 'audio', 'other') NOT NULL DEFAULT 'other',
    mime_type VARCHAR(100) NOT NULL,
    upload_username VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at DATETIME DEFAULT NULL,
    CONSTRAINT fk_attachment_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attachment_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attachment_uploader FOREIGN KEY (upload_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_attachment_post (post_id),
    INDEX idx_attachment_reply (reply_id),
    INDEX idx_attachment_type (file_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_tags (
    tag_id INT AUTO_INCREMENT PRIMARY KEY,
    tag_name VARCHAR(50) NOT NULL,
    tag_description VARCHAR(255) DEFAULT NULL,
    tag_color VARCHAR(7) DEFAULT '#006633',
    usage_count INT UNSIGNED NOT NULL DEFAULT 0,
    created_by VARCHAR(100) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tag_creator FOREIGN KEY (created_by)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_tag_name (tag_name),
    INDEX idx_tag_usage (usage_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_subscriptions (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    user_username VARCHAR(100) NOT NULL,
    post_id INT DEFAULT NULL,
    tag_name VARCHAR(50) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_subscription_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_user_post (user_username, post_id),
    UNIQUE KEY uk_user_tag (user_username, tag_name),
    INDEX idx_subscription_user (user_username),
    INDEX idx_subscription_post (post_id),
    INDEX idx_subscription_tag (tag_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS forum_user_preferences (
    preference_id INT AUTO_INCREMENT PRIMARY KEY,
    user_username VARCHAR(100) NOT NULL UNIQUE,
    notify_new_reply BOOLEAN NOT NULL DEFAULT TRUE,
    notify_mention BOOLEAN NOT NULL DEFAULT TRUE,
    notify_instructor_response BOOLEAN NOT NULL DEFAULT TRUE,
    notify_upvote BOOLEAN NOT NULL DEFAULT FALSE,
    email_digest ENUM('none', 'daily', 'weekly') NOT NULL DEFAULT 'none',
    default_sort ENUM('newest', 'oldest', 'most_upvoted', 'most_replied') NOT NULL DEFAULT 'newest',
    posts_per_page INT UNSIGNED NOT NULL DEFAULT 20,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_preference_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. Insert test data (admin + teacher + student)
-- ============================================================
-- Password for all test users: admin123
INSERT INTO users (username, password_hash, display_name, role, is_active) VALUES
('admin', '$2b$12$8gTZEggq3oSOssCOaYLtrOIAPWYEj9A4PLxVWWlbBm5kMJmgVR/XO', 'Administrator', 'admin', TRUE),
('teacher1', '$2b$12$8gTZEggq3oSOssCOaYLtrOIAPWYEj9A4PLxVWWlbBm5kMJmgVR/XO', 'Teacher One', 'teacher', TRUE),
('student1', '$2b$12$8gTZEggq3oSOssCOaYLtrOIAPWYEj9A4PLxVWWlbBm5kMJmgVR/XO', 'Student One', 'student', TRUE);

-- ============================================================
-- Done!
-- ============================================================
SELECT CONCAT('Database initialized successfully! Total tables: ',
    (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'school_ai_assistant')
) AS status;
