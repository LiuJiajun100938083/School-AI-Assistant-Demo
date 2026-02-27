-- ============================================================
-- 学校学习中心 (School Learning Center) 独立数据库表
-- 前缀: slc_
-- 与 AI 学习中心 (lc_) 完全独立，互不影响
-- ============================================================

-- 1. 学习内容表
CREATE TABLE IF NOT EXISTS slc_contents (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    content_type    VARCHAR(50) NOT NULL DEFAULT 'document'
        COMMENT 'document | video_local | video_external | article | image',
    file_path       VARCHAR(1000),
    file_name       VARCHAR(500),
    file_size       BIGINT,
    mime_type       VARCHAR(200),
    external_url    VARCHAR(2000),
    video_platform  VARCHAR(50),
    article_content LONGTEXT,
    thumbnail_path  VARCHAR(1000),
    duration        INT COMMENT '时长(秒)',
    tags            JSON,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
        COMMENT 'draft | published | archived',
    sort_order      INT DEFAULT 0,
    view_count      INT DEFAULT 0,
    subject_code    VARCHAR(50) NOT NULL COMMENT '科目代码(必填)',
    grade_level     VARCHAR(20) DEFAULT NULL COMMENT '年级: 中一~中六',
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT DEFAULT 0,
    INDEX idx_slc_contents_subject (subject_code),
    INDEX idx_slc_contents_grade (grade_level),
    INDEX idx_slc_contents_status (status),
    INDEX idx_slc_contents_type (content_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. 知识节点表
CREATE TABLE IF NOT EXISTS slc_knowledge_nodes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    icon            VARCHAR(50) DEFAULT '📌',
    color           VARCHAR(20) DEFAULT '#006633',
    node_size       INT DEFAULT 40,
    category_id     INT,
    position_x      FLOAT DEFAULT 0,
    position_y      FLOAT DEFAULT 0,
    is_pinned       TINYINT DEFAULT 0,
    subject_code    VARCHAR(50) NOT NULL COMMENT '科目代码(必填)',
    grade_level     VARCHAR(20) DEFAULT NULL,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT DEFAULT 0,
    INDEX idx_slc_nodes_subject (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. 知识边表
CREATE TABLE IF NOT EXISTS slc_knowledge_edges (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id    INT NOT NULL,
    target_node_id    INT NOT NULL,
    relation_type     VARCHAR(100) DEFAULT 'related',
    label             VARCHAR(200),
    weight            FLOAT DEFAULT 1.0,
    subject_code      VARCHAR(50),
    is_deleted        TINYINT DEFAULT 0,
    FOREIGN KEY (source_node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. 节点-内容关联表
CREATE TABLE IF NOT EXISTS slc_node_contents (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    node_id     INT NOT NULL,
    content_id  INT NOT NULL,
    sort_order  INT DEFAULT 0,
    anchor      JSON COMMENT '定位锚点, 如 {"type":"page","value":5}',
    UNIQUE KEY uk_slc_node_content (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES slc_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. 学习路径表
CREATE TABLE IF NOT EXISTS slc_learning_paths (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    icon            VARCHAR(50) DEFAULT '🎯',
    difficulty      VARCHAR(20) DEFAULT 'beginner'
        COMMENT 'beginner | intermediate | advanced',
    estimated_hours FLOAT DEFAULT 1.0,
    tags            JSON,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    subject_code    VARCHAR(50) NOT NULL COMMENT '科目代码(必填)',
    grade_level     VARCHAR(20) DEFAULT NULL,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT DEFAULT 0,
    INDEX idx_slc_paths_subject (subject_code),
    INDEX idx_slc_paths_grade (grade_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. 学习路径步骤表
CREATE TABLE IF NOT EXISTS slc_path_steps (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    path_id     INT NOT NULL,
    step_order  INT DEFAULT 0,
    title       VARCHAR(500),
    description TEXT,
    content_id  INT,
    node_id     INT,
    FOREIGN KEY (path_id) REFERENCES slc_learning_paths(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
