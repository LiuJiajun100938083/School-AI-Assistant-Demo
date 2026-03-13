-- ============================================================
-- 课案计划 (Lesson Plan) 建表脚本
-- 执行方式: mysql -u root -p school_ai_assistant < create_lesson_plan_tables.sql
-- ============================================================

-- 1. 课案模板表 (可复用，不绑定具体房间)
CREATE TABLE IF NOT EXISTS lesson_plans (
    id               INT AUTO_INCREMENT,
    plan_id          VARCHAR(64) NOT NULL COMMENT '课案唯一标识 (UUID)',
    title            VARCHAR(255) NOT NULL COMMENT '课案标题',
    description      TEXT COMMENT '课案描述',
    teacher_username VARCHAR(100) NOT NULL COMMENT '创建教师用户名',
    total_slides     INT DEFAULT 0 COMMENT '幻灯片总数',
    status           ENUM('draft','ready','archived') DEFAULT 'draft' COMMENT '课案状态',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN DEFAULT FALSE COMMENT '软删除标记',
    PRIMARY KEY (id),
    UNIQUE KEY uk_plan_id (plan_id),
    INDEX idx_teacher (teacher_username),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='课案模板 — 可复用，不绑定具体房间';


-- 2. 课案幻灯片表 (多态类型，config 按 slide_type 严格校验)
CREATE TABLE IF NOT EXISTS lesson_slides (
    id               INT AUTO_INCREMENT,
    slide_id         VARCHAR(64) NOT NULL COMMENT '幻灯片唯一标识 (UUID)',
    plan_id          VARCHAR(64) NOT NULL COMMENT '所属课案 ID',
    slide_order      INT NOT NULL COMMENT '排序 (从 0 开始)',
    slide_type       ENUM('ppt','game','quiz','quick_answer','raise_hand','poll') NOT NULL COMMENT '类型',
    title            VARCHAR(255) DEFAULT '' COMMENT '幻灯片标题 (可选)',
    config           JSON NOT NULL COMMENT '类型专属配置 (由 Pydantic 严格校验)',
    config_version   INT DEFAULT 1 COMMENT '配置版本号 (用于未来兼容升级)',
    duration_seconds INT DEFAULT 0 COMMENT '建议时长 (秒, 0=无限)',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_slide_id (slide_id),
    UNIQUE KEY uk_plan_order (plan_id, slide_order),
    FOREIGN KEY (plan_id) REFERENCES lesson_plans(plan_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='课案幻灯片 — 支持多种类型的内容块';


-- 3. 课案运行实例表 (一个房间一次 live run)
CREATE TABLE IF NOT EXISTS lesson_sessions (
    id                  INT AUTO_INCREMENT,
    session_id          VARCHAR(64) NOT NULL COMMENT '运行实例唯一标识 (UUID)',
    room_id             VARCHAR(64) NOT NULL COMMENT '所属房间 ID',
    plan_id             VARCHAR(64) NOT NULL COMMENT '使用的课案模板 ID',
    status              ENUM('pending','live','paused','ended') DEFAULT 'pending' COMMENT '运行状态',
    current_slide_id    VARCHAR(64) DEFAULT NULL COMMENT '当前幻灯片 ID',
    current_slide_order INT DEFAULT -1 COMMENT '当前幻灯片排序值 (缓存)',
    slide_lifecycle     ENUM('prepared','activated','responding','closed',
                             'results_shown','completed') DEFAULT 'prepared'
                        COMMENT '当前幻灯片生命周期阶段',
    slide_started_at    DATETIME DEFAULT NULL COMMENT '当前幻灯片开始时间',
    slide_ends_at       DATETIME DEFAULT NULL COMMENT '当前幻灯片预计结束时间 (计时)',
    accepting_responses BOOLEAN DEFAULT FALSE COMMENT '是否正在接受学生响应',
    annotations_json    LONGTEXT DEFAULT NULL COMMENT 'Fabric.js 标注 (仅 PPT 类型)',
    runtime_meta        JSON DEFAULT NULL COMMENT '类型专属运行态 (typed, 换 slide 清空)',
    started_at          DATETIME DEFAULT NULL COMMENT '课案开始时间',
    ended_at            DATETIME DEFAULT NULL COMMENT '课案结束时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_session_id (session_id),
    INDEX idx_room (room_id),
    INDEX idx_room_status (room_id, status),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='课案运行实例 — 一个房间可有多个历史 session (应用层确保同时仅一个活跃)';


-- 4. 学生响应表 (每 slide 一次提交模型)
CREATE TABLE IF NOT EXISTS lesson_slide_responses (
    id               INT AUTO_INCREMENT,
    response_id      VARCHAR(64) NOT NULL COMMENT '响应唯一标识 (UUID)',
    session_id       VARCHAR(64) NOT NULL COMMENT '所属运行实例 ID',
    slide_id         VARCHAR(64) NOT NULL COMMENT '所属幻灯片 ID',
    student_username VARCHAR(100) NOT NULL COMMENT '学生用户名',
    response_type    ENUM('quiz_answer','quick_answer','raise_hand',
                         'poll_vote','game_score') NOT NULL COMMENT '响应类型',
    response_data    JSON NOT NULL COMMENT '响应数据 (由 handler 校验)',
    is_correct       TINYINT(1) DEFAULT NULL COMMENT '是否正确 (自动判分)',
    score            DECIMAL(8,2) DEFAULT NULL COMMENT '得分',
    responded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_response_id (response_id),
    UNIQUE KEY uk_one_response (session_id, slide_id, student_username, response_type),
    INDEX idx_session_slide (session_id, slide_id),
    INDEX idx_student (student_username, session_id),
    FOREIGN KEY (session_id) REFERENCES lesson_sessions(session_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='学生响应 — 每 slide 每学生每类型最多一条';


-- 5. 在 classroom_rooms 表上添加 lesson_session_id
-- Note: run this manually if column doesn't exist yet
-- ALTER TABLE classroom_rooms ADD COLUMN lesson_session_id VARCHAR(64) DEFAULT NULL COMMENT '当前活跃的课案 session ID';
