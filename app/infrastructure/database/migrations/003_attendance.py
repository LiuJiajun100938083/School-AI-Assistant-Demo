"""
Migration 003: 考勤系統表

原位置: app/routers/attendance.py init_attendance_tables()
"""

MIGRATION_SQLS = [
    # --- attendance_students ---
    """
    CREATE TABLE IF NOT EXISTS attendance_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        class_name VARCHAR(10) NOT NULL COMMENT '班级',
        class_number INT NOT NULL COMMENT '班号',
        user_login VARCHAR(50) NOT NULL UNIQUE COMMENT '学号',
        english_name VARCHAR(100) NOT NULL COMMENT '英文名',
        chinese_name VARCHAR(100) NOT NULL COMMENT '中文名',
        card_id VARCHAR(50) COMMENT '学生证CardID',
        is_active BOOLEAN DEFAULT TRUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_class (class_name),
        INDEX idx_card (card_id),
        INDEX idx_user_login (user_login)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- attendance_sessions ---
    """
    CREATE TABLE IF NOT EXISTS attendance_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_type ENUM('morning', 'detention') NOT NULL,
        session_date DATE NOT NULL,
        start_time TIME, end_time TIME,
        target_time TIME NOT NULL DEFAULT '07:30:00',
        late_threshold TIME NOT NULL DEFAULT '07:40:00',
        makeup_minutes INT DEFAULT 35,
        status ENUM('active', 'completed', 'cancelled') DEFAULT 'active',
        created_by VARCHAR(50), notes TEXT,
        open_mode BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (session_date), INDEX idx_type (session_type), INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- attendance_session_students ---
    """
    CREATE TABLE IF NOT EXISTS attendance_session_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_session_student (session_id, user_login),
        INDEX idx_session (session_id), INDEX idx_student (user_login)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- attendance_records ---
    """
    CREATE TABLE IF NOT EXISTS attendance_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        card_id VARCHAR(50), scan_time DATETIME NOT NULL,
        checkout_time DATETIME,
        status ENUM('present','late','very_late','absent','detention_active','detention_completed') NOT NULL,
        late_minutes INT DEFAULT 0, makeup_minutes INT DEFAULT 0,
        is_registered BOOLEAN DEFAULT TRUE,
        planned_periods INT DEFAULT 0, planned_minutes INT DEFAULT NULL,
        planned_end_time DATETIME, actual_minutes INT DEFAULT 0, actual_periods INT DEFAULT 0,
        detention_reason VARCHAR(50),
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_session_record (session_id, user_login),
        INDEX idx_session (session_id), INDEX idx_student (user_login), INDEX idx_scan_time (scan_time)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- 舊表相容 ALTER ---
    "ALTER TABLE attendance_sessions ADD COLUMN open_mode BOOLEAN DEFAULT FALSE AFTER notes",
    "ALTER TABLE attendance_records ADD COLUMN checkout_time DATETIME NULL AFTER scan_time",
    "ALTER TABLE attendance_records ADD COLUMN planned_periods INT DEFAULT 0 AFTER is_registered",
    "ALTER TABLE attendance_records ADD COLUMN planned_end_time DATETIME NULL AFTER planned_periods",
    "ALTER TABLE attendance_records ADD COLUMN actual_minutes INT DEFAULT 0 AFTER planned_end_time",
    "ALTER TABLE attendance_records ADD COLUMN actual_periods INT DEFAULT 0 AFTER actual_minutes",
    "ALTER TABLE attendance_records ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP",
    "ALTER TABLE attendance_records ADD COLUMN detention_reason VARCHAR(50) NULL AFTER actual_periods",
    "ALTER TABLE attendance_records ADD COLUMN planned_minutes INT DEFAULT NULL AFTER planned_periods",

    # --- attendance_fixed_lists ---
    """
    CREATE TABLE IF NOT EXISTS attendance_fixed_lists (
        id INT AUTO_INCREMENT PRIMARY KEY,
        list_name VARCHAR(100) NOT NULL, list_type ENUM('morning','detention') DEFAULT 'morning',
        created_by VARCHAR(50), is_default BOOLEAN DEFAULT FALSE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_list_name (list_name, list_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- attendance_fixed_list_students ---
    """
    CREATE TABLE IF NOT EXISTS attendance_fixed_list_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        list_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (list_id) REFERENCES attendance_fixed_lists(id) ON DELETE CASCADE,
        UNIQUE KEY unique_list_student (list_id, user_login), INDEX idx_list (list_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- detention_history ---
    """
    CREATE TABLE IF NOT EXISTS detention_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_login VARCHAR(50) NOT NULL, session_id INT,
        detention_date DATE NOT NULL, reason TEXT, duration_minutes INT DEFAULT 35,
        completed BOOLEAN DEFAULT FALSE, completed_at DATETIME,
        created_by VARCHAR(50), notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_user (user_login), INDEX idx_date (detention_date), INDEX idx_completed (completed)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- attendance_exports ---
    """
    CREATE TABLE IF NOT EXISTS attendance_exports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL, session_type ENUM('morning','detention') NOT NULL,
        session_date DATE NOT NULL,
        created_by VARCHAR(50) NOT NULL, created_by_name VARCHAR(100),
        file_name VARCHAR(255) NOT NULL, file_path VARCHAR(500) NOT NULL,
        file_size BIGINT DEFAULT 0,
        student_count INT DEFAULT 0, present_count INT DEFAULT 0,
        late_count INT DEFAULT 0, absent_count INT DEFAULT 0,
        notes TEXT, is_deleted BOOLEAN DEFAULT FALSE, deleted_at DATETIME NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_created_by (created_by), INDEX idx_session (session_id),
        INDEX idx_date (session_date), INDEX idx_type (session_type), INDEX idx_deleted (is_deleted)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- activity_groups ---
    """
    CREATE TABLE IF NOT EXISTS activity_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL, created_by VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_group_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- activity_group_students ---
    """
    CREATE TABLE IF NOT EXISTS activity_group_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        group_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE,
        UNIQUE KEY unique_group_student (group_id, user_login), INDEX idx_group (group_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- activity_sessions ---
    """
    CREATE TABLE IF NOT EXISTS activity_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_date DATE NOT NULL, activity_name VARCHAR(200) NOT NULL,
        start_time TIME NOT NULL, end_time TIME NOT NULL,
        late_threshold INT DEFAULT 10, early_threshold INT DEFAULT 10,
        status ENUM('active','completed','cancelled') DEFAULT 'active',
        created_by VARCHAR(50), notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_date (session_date), INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- activity_session_students ---
    """
    CREATE TABLE IF NOT EXISTS activity_session_students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_session_student (session_id, user_login), INDEX idx_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,

    # --- activity_records ---
    """
    CREATE TABLE IF NOT EXISTS activity_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        session_id INT NOT NULL, user_login VARCHAR(50) NOT NULL,
        card_id VARCHAR(50),
        check_in_time DATETIME, check_in_status ENUM('on_time','late','not_arrived') DEFAULT 'not_arrived',
        check_out_time DATETIME, check_out_status ENUM('normal','early','not_arrived','still_here') DEFAULT 'not_arrived',
        late_minutes INT DEFAULT 0, early_minutes INT DEFAULT 0, notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
        UNIQUE KEY unique_session_record (session_id, user_login),
        INDEX idx_session (session_id), INDEX idx_student (user_login)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """,
]
