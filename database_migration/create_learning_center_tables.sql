-- ============================================================
-- AI 學習中心 - 數據庫表
-- ============================================================
-- 建立學習中心所需的所有表，包括分類、內容、知識點、學習路徑等。

-- 1. 分類表
CREATE TABLE IF NOT EXISTS lc_categories (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL COMMENT '分類名稱',
    slug            VARCHAR(100) NOT NULL UNIQUE COMMENT 'URL 標識',
    icon            VARCHAR(10) DEFAULT '📁' COMMENT '圖標 emoji',
    description     TEXT COMMENT '分類描述',
    parent_id       INT DEFAULT NULL COMMENT '父分類 ID（支持層級）',
    sort_order      INT DEFAULT 0 COMMENT '排序權重',
    created_by      VARCHAR(100) COMMENT '創建者',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_parent (parent_id),
    INDEX idx_sort (sort_order),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 分類表';

-- 2. 內容/資源表（核心表）
CREATE TABLE IF NOT EXISTS lc_contents (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL COMMENT '標題',
    description     TEXT COMMENT '簡短描述',
    content_type    VARCHAR(30) NOT NULL COMMENT '類型: video_local, video_external, document, image, article',

    -- 文件相關
    file_path       VARCHAR(500) COMMENT '本地文件路徑',
    file_name       VARCHAR(255) COMMENT '原始文件名',
    file_size       BIGINT DEFAULT 0 COMMENT '文件大小（字節）',
    mime_type       VARCHAR(100) COMMENT 'MIME 類型',

    -- 外部視頻
    external_url    VARCHAR(500) COMMENT '外部視頻鏈接（YouTube/Bilibili）',
    video_platform  VARCHAR(50) COMMENT '視頻平台: youtube, bilibili, other',
    embed_url       VARCHAR(500) COMMENT '嵌入播放URL',

    -- 富文本文章
    article_content LONGTEXT COMMENT 'Markdown/HTML 文章內容',

    -- 元數據
    thumbnail_path  VARCHAR(500) COMMENT '縮略圖路徑',
    duration        INT DEFAULT 0 COMMENT '視頻時長（秒）',
    tags            JSON COMMENT '標籤數組 ["AI基礎", "機器學習"]',
    metadata        JSON COMMENT '擴展元數據',

    -- 狀態
    status          VARCHAR(20) DEFAULT 'draft' COMMENT '狀態: draft, published, archived',
    view_count      INT DEFAULT 0 COMMENT '查看次數',

    -- 審計
    created_by      VARCHAR(100) NOT NULL COMMENT '上傳者',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_type (content_type),
    INDEX idx_status (status),
    INDEX idx_created (created_at DESC),
    INDEX idx_deleted (is_deleted),
    FULLTEXT idx_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 內容資源表';

-- 3. 內容-分類關聯表（多對多）
CREATE TABLE IF NOT EXISTS lc_content_categories (
    content_id      INT NOT NULL,
    category_id     INT NOT NULL,
    PRIMARY KEY (content_id, category_id),
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 內容分類關聯';

-- 4. 知識點表（知識地圖節點）
CREATE TABLE IF NOT EXISTS lc_knowledge_nodes (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL COMMENT '知識點名稱',
    description     TEXT COMMENT '知識點描述',
    icon            VARCHAR(10) DEFAULT '💡' COMMENT '圖標',
    color           VARCHAR(20) DEFAULT '#006633' COMMENT '節點顏色',
    node_size       INT DEFAULT 40 COMMENT '節點大小（權重）',

    -- 地圖位置（可選，力導向圖自動佈局也可手動固定）
    position_x      FLOAT DEFAULT NULL,
    position_y      FLOAT DEFAULT NULL,
    is_pinned       TINYINT(1) DEFAULT 0 COMMENT '是否固定位置',

    category_id     INT DEFAULT NULL,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_category (category_id),
    INDEX idx_deleted (is_deleted),
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 知識點節點';

-- 5. 知識點連線表（邊）
CREATE TABLE IF NOT EXISTS lc_knowledge_edges (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id  INT NOT NULL COMMENT '來源節點',
    target_node_id  INT NOT NULL COMMENT '目標節點',
    relation_type   VARCHAR(50) DEFAULT 'related' COMMENT '關係: prerequisite, related, extends',
    label           VARCHAR(100) COMMENT '連線標籤',
    weight          FLOAT DEFAULT 1.0 COMMENT '連線權重',

    UNIQUE KEY uk_edge (source_node_id, target_node_id),
    FOREIGN KEY (source_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 知識點連線';

-- 6. 知識點-內容關聯
CREATE TABLE IF NOT EXISTS lc_node_contents (
    node_id         INT NOT NULL,
    content_id      INT NOT NULL,
    sort_order      INT DEFAULT 0,
    anchor          JSON DEFAULT NULL COMMENT '定位锚点 JSON',
    PRIMARY KEY (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 知識點內容關聯';

-- 7. 學習路徑表
CREATE TABLE IF NOT EXISTS lc_learning_paths (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL COMMENT '路徑標題',
    description     TEXT COMMENT '路徑描述',
    icon            VARCHAR(10) DEFAULT '🗺️' COMMENT '圖標',
    cover_image     VARCHAR(500) COMMENT '封面圖',
    difficulty      VARCHAR(20) DEFAULT 'beginner' COMMENT '難度: beginner, intermediate, advanced',
    estimated_hours FLOAT DEFAULT 0 COMMENT '預計學時（小時）',
    tags            JSON COMMENT '標籤',

    status          VARCHAR(20) DEFAULT 'draft' COMMENT '狀態: draft, published, archived',
    sort_order      INT DEFAULT 0,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_status (status),
    INDEX idx_difficulty (difficulty),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 學習路徑';

-- 8. 學習路徑步驟表
CREATE TABLE IF NOT EXISTS lc_path_steps (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    path_id         INT NOT NULL COMMENT '所屬路徑',
    step_order      INT NOT NULL DEFAULT 0 COMMENT '步驟順序',
    title           VARCHAR(255) NOT NULL COMMENT '步驟標題',
    description     TEXT COMMENT '步驟描述',
    content_id      INT DEFAULT NULL COMMENT '關聯內容',
    node_id         INT DEFAULT NULL COMMENT '關聯知識點',
    metadata        JSON COMMENT '擴展數據',

    INDEX idx_path_order (path_id, step_order),
    FOREIGN KEY (path_id) REFERENCES lc_learning_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE SET NULL,
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='學習中心 - 路徑步驟';


-- ============================================================
-- v2.0 擴展：學校 AI 學習中心 — 科目 + 年級維度
-- ============================================================
-- 所有新列 DEFAULT NULL，向後兼容已有數據。
-- subject_code 匹配 subjects.subject_code，
-- grade_level 值為 '中一'~'中六'，匹配 classes.grade。

-- 分類表加科目
ALTER TABLE lc_categories
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50) DEFAULT NULL COMMENT '科目代碼';

-- 內容表加科目+年級
ALTER TABLE lc_contents
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50) DEFAULT NULL COMMENT '科目代碼',
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20) DEFAULT NULL COMMENT '年級: 中一~中六';

-- 知識節點加科目+年級
ALTER TABLE lc_knowledge_nodes
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50) DEFAULT NULL COMMENT '科目代碼',
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20) DEFAULT NULL COMMENT '年級: 中一~中六';

-- 知識邊加科目
ALTER TABLE lc_knowledge_edges
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50) DEFAULT NULL COMMENT '科目代碼';

-- 學習路徑加科目+年級
ALTER TABLE lc_learning_paths
  ADD COLUMN IF NOT EXISTS subject_code VARCHAR(50) DEFAULT NULL COMMENT '科目代碼',
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(20) DEFAULT NULL COMMENT '年級: 中一~中六';
