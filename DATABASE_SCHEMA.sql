-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║          培僑中學 AI 學習助手 — 完整資料庫結構說明文檔              ║
-- ║          PKMS AI Learning Buddy — Database Schema Reference        ║
-- ║                                                                    ║
-- ║  資料庫:  school_ai_assistant                                      ║
-- ║  引擎:    MySQL 8.0 / InnoDB                                       ║
-- ║  字元集:  utf8mb4 / utf8mb4_unicode_ci                             ║
-- ║  總表數:  60 張表                                                   ║
-- ║  生成日期: 2026-03-02                                              ║
-- ╚══════════════════════════════════════════════════════════════════════╝
--
-- ┌─────────────────────────────────────────────────────────────────────┐
-- │  模組總覽                                                          │
-- ├─────────────────────────────────────────────────────────────────────┤
-- │  1.  核心用戶與認證       users, classes, sessions, ...     (8 表) │
-- │  2.  AI 對話              conversations, messages            (2 表) │
-- │  3.  課堂教學             classroom_rooms, ppt_files, ...   (5 表) │
-- │  4.  錯題本與知識掌握     student_mistakes, knowledge_...   (8 表) │
-- │  5.  學習任務             learning_tasks, ...                (3 表) │
-- │  6.  AI 學習中心 (lc_)    lc_categories, lc_contents, ...   (8 表) │
-- │  7.  學校學習中心 (slc_)  slc_contents, slc_nodes, ...      (6 表) │
-- │  8.  論壇系統 (forum_)    forum_posts, forum_replies, ...   (9 表) │
-- │  9.  考勤點名 (attendance_/activity_)                       (12 表) │
-- │  10. 基礎配置與緩存       subjects, knowledge_index, ...    (3 表) │
-- │  11. 安全與審計           audit_logs, learning_analytics,.. (4 表) │
-- └─────────────────────────────────────────────────────────────────────┘


-- ====================================================================
-- ====================================================================
--   模組 1 ：核心用戶與認證 (Core User & Authentication)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 1.1  users — 用戶主表
-- 說明: 系統所有用戶(學生/教師/管理員)的核心資料表
-- 關聯: 被 classes, conversations, messages, sessions 等幾乎所有表引用
-- --------------------------------------------------------------------
CREATE TABLE users (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    user_id              INT UNIQUE                        COMMENT '備用用戶ID',
    username             VARCHAR(50) UNIQUE NOT NULL       COMMENT '登入帳號(唯一)',
    password_hash        VARCHAR(255) NOT NULL             COMMENT 'bcrypt 加密密碼',
    display_name         VARCHAR(100)                      COMMENT '顯示名稱（中文名）',
    english_name         VARCHAR(100) DEFAULT ''           COMMENT '英文名',
    card_id              VARCHAR(50) DEFAULT NULL          COMMENT '學生證 CardID（簽到用）',
    email                VARCHAR(100)                      COMMENT '電郵(明文)',
    email_encrypted      TEXT                              COMMENT '電郵(加密存儲)',
    phone                VARCHAR(20)                       COMMENT '電話(明文)',
    phone_encrypted      TEXT                              COMMENT '電話(加密存儲)',
    role                 ENUM('student','teacher','admin') DEFAULT 'student' COMMENT '角色',
    class_id             INT                               COMMENT '所屬班級ID',
    class_name           VARCHAR(100) DEFAULT ''           COMMENT '班級名稱(冗餘欄位，方便查詢)',
    class_number         INT DEFAULT NULL                  COMMENT '班號',
    is_active            BOOLEAN DEFAULT TRUE              COMMENT '帳號是否啟用',
    is_locked            BOOLEAN DEFAULT FALSE             COMMENT '帳號是否鎖定',
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login           TIMESTAMP NULL                    COMMENT '最後登入時間',
    login_count          INT DEFAULT 0                     COMMENT '登入次數',
    password_changed_at  TIMESTAMP NULL                    COMMENT '最後改密碼時間',
    must_change_password BOOLEAN DEFAULT FALSE             COMMENT '是否強制改密碼',
    data_consent         BOOLEAN DEFAULT FALSE             COMMENT '是否已同意資料使用',
    data_consent_date    TIMESTAMP NULL                    COMMENT '同意日期',

    INDEX idx_username (username),
    INDEX idx_role (role),
    INDEX idx_card_id (card_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.2  classes — 班級表
-- 說明: 學校班級定義，每個班級有一個班主任(teacher_id)
-- --------------------------------------------------------------------
CREATE TABLE classes (
    class_id    INT AUTO_INCREMENT PRIMARY KEY,
    class_code  VARCHAR(20) UNIQUE NOT NULL      COMMENT '班級代碼，如 S1A',
    class_name  VARCHAR(100) NOT NULL             COMMENT '班級名稱',
    grade       VARCHAR(20)                       COMMENT '年級，如 中一',
    teacher_id  INT                               COMMENT '班主任 → users.id',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.3  sessions — 登入會話表
-- 說明: 管理 JWT Token 與用戶登入會話
-- --------------------------------------------------------------------
CREATE TABLE sessions (
    session_id  VARCHAR(255) PRIMARY KEY          COMMENT '會話ID',
    user_id     INT NOT NULL                      COMMENT '→ users.id',
    token_hash  VARCHAR(255) NOT NULL             COMMENT 'Token Hash',
    ip_address  VARCHAR(45)                       COMMENT '登入IP',
    user_agent  VARCHAR(255)                      COMMENT '瀏覽器UA',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at  TIMESTAMP NOT NULL                COMMENT '過期時間',
    is_active   BOOLEAN DEFAULT TRUE              COMMENT '是否有效',

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.4  token_blacklist — JWT Token 撤銷黑名單
-- 說明: 持久化已登出/撤銷的 Token，防止重啟後 Token 重新生效
-- --------------------------------------------------------------------
CREATE TABLE token_blacklist (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    jti         VARCHAR(36) NOT NULL UNIQUE       COMMENT 'JWT Token ID',
    username    VARCHAR(100) DEFAULT ''            COMMENT '關聯用戶名(審計)',
    revoked_at  DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '撤銷時間',
    expires_at  DATETIME NOT NULL                  COMMENT 'Token 原始過期時間(用於定期清理)',

    INDEX idx_jti (jti),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='JWT Token 撤銷黑名單';


-- --------------------------------------------------------------------
-- 1.5  password_history — 密碼變更歷史
-- 說明: 記錄密碼變更以防止重複使用舊密碼
-- --------------------------------------------------------------------
CREATE TABLE password_history (
    history_id    INT AUTO_INCREMENT PRIMARY KEY,
    user_id       INT NOT NULL                    COMMENT '→ users.id',
    password_hash VARCHAR(255) NOT NULL            COMMENT '歷史密碼 Hash',
    changed_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    changed_by    VARCHAR(50)                      COMMENT '操作人',

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_password_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.6  audit_logs — 審計日誌
-- 說明: 記錄系統中所有重要操作的安全審計日誌
-- --------------------------------------------------------------------
CREATE TABLE audit_logs (
    log_id        INT AUTO_INCREMENT PRIMARY KEY,
    event_type    VARCHAR(50) NOT NULL             COMMENT '事件類型: login/logout/create/update/delete...',
    user_id       INT                              COMMENT '→ users.id',
    username      VARCHAR(50)                      COMMENT '操作用戶名',
    ip_address    VARCHAR(45)                      COMMENT '客戶端IP',
    user_agent    VARCHAR(255)                     COMMENT '瀏覽器UA',
    action        VARCHAR(100) NOT NULL            COMMENT '具體動作',
    resource_type VARCHAR(50)                      COMMENT '資源類型',
    resource_id   VARCHAR(100)                     COMMENT '資源ID',
    details       JSON                             COMMENT '詳細資訊(JSON)',
    status        ENUM('success','failure','warning') COMMENT '操作結果',
    timestamp     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_audit_timestamp (timestamp),
    INDEX idx_audit_user (user_id),
    INDEX idx_audit_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.7  deletion_requests — 資料刪除請求 (GDPR 合規)
-- 說明: 用戶申請刪除個人資料的工單
-- --------------------------------------------------------------------
CREATE TABLE deletion_requests (
    request_id     INT AUTO_INCREMENT PRIMARY KEY,
    user_id        INT NOT NULL                   COMMENT '申請人 → users.id',
    request_date   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reason         TEXT                            COMMENT '刪除原因',
    status         ENUM('pending','approved','completed','rejected') DEFAULT 'pending',
    processed_date TIMESTAMP NULL                  COMMENT '處理日期',
    processed_by   INT                             COMMENT '處理人 → users.id',
    notes          TEXT                            COMMENT '處理備註',

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id),
    INDEX idx_deletion_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 1.8  data_access_logs — 資料存取日誌 (隱私合規)
-- 說明: 記錄誰在何時存取了誰的哪些資料
-- --------------------------------------------------------------------
CREATE TABLE data_access_logs (
    access_id        INT AUTO_INCREMENT PRIMARY KEY,
    user_id          INT NOT NULL                  COMMENT '操作人 → users.id',
    accessed_user_id INT                           COMMENT '被存取的用戶 → users.id',
    access_type      ENUM('read','write','delete') NOT NULL,
    data_category    VARCHAR(50)                   COMMENT '資料類別',
    purpose          VARCHAR(200)                  COMMENT '存取目的',
    legal_basis      VARCHAR(100)                  COMMENT '法律依據',
    timestamp        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (accessed_user_id) REFERENCES users(id),
    INDEX idx_access_user (user_id),
    INDEX idx_access_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 2 ：AI 對話系統 (Chat & Conversations)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 2.1  conversations — 對話表
-- 說明: 學生與 AI 助手的對話列表，每個對話屬於一個科目
-- --------------------------------------------------------------------
CREATE TABLE conversations (
    conversation_id VARCHAR(36) PRIMARY KEY        COMMENT 'UUID 格式',
    user_id         INT NOT NULL                   COMMENT '→ users.id',
    username        VARCHAR(100)                   COMMENT '用戶名(冗餘便於查詢)',
    title           VARCHAR(200)                   COMMENT '對話標題',
    subject         VARCHAR(50)                    COMMENT '學科: math/chinese/english...',
    messages        JSON                           COMMENT '消息快照(JSON)',
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    message_count   INT DEFAULT 0                  COMMENT '消息數量',
    is_archived     BOOLEAN DEFAULT FALSE          COMMENT '已歸檔',
    is_deleted      BOOLEAN DEFAULT FALSE          COMMENT '已刪除(軟刪)',
    deleted_at      TIMESTAMP NULL,

    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_user_conv (username, conversation_id),
    INDEX idx_user_conversations (user_id, updated_at),
    INDEX idx_username (username),
    INDEX idx_subject (subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 2.2  messages — 消息表
-- 說明: 對話中的每條消息，包含 AI 思考過程(thinking)
-- --------------------------------------------------------------------
CREATE TABLE messages (
    message_id      INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL            COMMENT '→ conversations.conversation_id',
    role            ENUM('user','assistant','system') NOT NULL COMMENT '角色',
    content         TEXT NOT NULL                    COMMENT '消息正文',
    content_encrypted TEXT                           COMMENT '加密消息(隱私保護)',
    thinking        TEXT                             COMMENT 'AI 思考過程',
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token_count     INT                              COMMENT 'Token 用量',
    model_used      VARCHAR(50)                      COMMENT '使用的 AI 模型',
    is_flagged      BOOLEAN DEFAULT FALSE            COMMENT '是否被標記(安全)',

    FOREIGN KEY (conversation_id) REFERENCES conversations(conversation_id) ON DELETE CASCADE,
    INDEX idx_conversation_messages (conversation_id, timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 3 ：課堂教學 (Classroom Teaching)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 3.1  classroom_rooms — 課室表
-- 說明: 教師建立的線上課室，用於推送 PPT 等教學內容
-- 狀態流轉: draft → active ↔ paused → ended
-- --------------------------------------------------------------------
CREATE TABLE classroom_rooms (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    room_id              VARCHAR(64) UNIQUE NOT NULL   COMMENT '課室唯一碼',
    teacher_id           INT NOT NULL                   COMMENT '→ users.id',
    teacher_username     VARCHAR(100) NOT NULL          COMMENT '教師用戶名',
    title                VARCHAR(255) NOT NULL          COMMENT '課室標題',
    description          TEXT                           COMMENT '描述',
    allowed_classes      JSON NOT NULL                  COMMENT '允許加入的班級 JSON 陣列',
    current_ppt_file_id  VARCHAR(64)                    COMMENT '當前使用的PPT → ppt_files.file_id',
    room_status          ENUM('draft','active','paused','ended') DEFAULT 'draft',
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at             DATETIME                       COMMENT '結束時間',
    is_deleted           BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_teacher (teacher_username),
    INDEX idx_status (room_status),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (is_deleted, room_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 3.2  classroom_enrollments — 課室加入紀錄
-- 說明: 學生加入課室的紀錄，含心跳偵測
-- --------------------------------------------------------------------
CREATE TABLE classroom_enrollments (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id     VARCHAR(64) UNIQUE NOT NULL       COMMENT '報名唯一碼',
    room_id           VARCHAR(64) NOT NULL              COMMENT '→ classroom_rooms.room_id',
    student_id        INT NOT NULL                      COMMENT '→ users.id',
    student_username  VARCHAR(100) NOT NULL,
    joined_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
    left_at           DATETIME                          COMMENT '離開時間',
    is_active         BOOLEAN DEFAULT TRUE              COMMENT '是否在線',
    last_heartbeat    DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '最後心跳',

    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY uk_room_student (room_id, student_username),
    INDEX idx_room (room_id),
    INDEX idx_student (student_username),
    INDEX idx_room_active (room_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 3.3  ppt_files — PPT 上傳檔案表
-- 說明: 教師上傳的 PPT/PDF 檔案，經處理後轉為圖片
-- 狀態流轉: pending → processing → completed / failed
-- --------------------------------------------------------------------
CREATE TABLE ppt_files (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    file_id           VARCHAR(64) UNIQUE NOT NULL       COMMENT '檔案唯一碼',
    room_id           VARCHAR(64) NOT NULL              COMMENT '→ classroom_rooms.room_id',
    teacher_username  VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL             COMMENT '原始檔名',
    stored_path       VARCHAR(500) NOT NULL             COMMENT '伺服器儲存路徑',
    file_size         BIGINT NOT NULL                   COMMENT '檔案大小(bytes)',
    total_pages       INT DEFAULT 0                     COMMENT '總頁數',
    process_status    ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_message     TEXT                              COMMENT '處理錯誤訊息',
    uploaded_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at      DATETIME                          COMMENT '處理完成時間',
    is_deleted        BOOLEAN DEFAULT FALSE,

    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    INDEX idx_room (room_id),
    INDEX idx_status (process_status),
    INDEX idx_teacher (teacher_username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 3.4  ppt_pages — PPT 頁面表
-- 說明: PPT 每一頁轉換後的圖片和文字內容
-- --------------------------------------------------------------------
CREATE TABLE ppt_pages (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    page_id         VARCHAR(64) UNIQUE NOT NULL         COMMENT '頁面唯一碼',
    file_id         VARCHAR(64) NOT NULL                COMMENT '→ ppt_files.file_id',
    page_number     INT NOT NULL                        COMMENT '頁碼(從1開始)',
    image_path      VARCHAR(500) NOT NULL               COMMENT '頁面圖片路徑',
    thumbnail_path  VARCHAR(500)                        COMMENT '縮圖路徑',
    text_content    LONGTEXT                            COMMENT 'OCR/解析出的文字內容',

    FOREIGN KEY (file_id) REFERENCES ppt_files(file_id) ON DELETE CASCADE,
    INDEX idx_file_page (file_id, page_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 3.5  classroom_pushes — 課堂推送紀錄
-- 說明: 教師向學生推送 PPT 頁面(含批註)的紀錄
-- --------------------------------------------------------------------
CREATE TABLE classroom_pushes (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    push_id          VARCHAR(64) UNIQUE NOT NULL        COMMENT '推送唯一碼',
    room_id          VARCHAR(64) NOT NULL               COMMENT '→ classroom_rooms.room_id',
    page_id          VARCHAR(64) NOT NULL               COMMENT '→ ppt_pages.page_id',
    page_number      INT NOT NULL                       COMMENT '頁碼',
    annotations_json LONGTEXT                           COMMENT '批註 JSON (畫筆/文字/圖形)',
    pushed_at        DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    INDEX idx_room_time (room_id, pushed_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 4 ：錯題本與知識掌握 (Mistake Book & Knowledge Mastery)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 4.1  knowledge_points — 知識點定義表
-- 說明: 各科目的知識點樹形結構，由 parent_code 形成層級
-- --------------------------------------------------------------------
CREATE TABLE knowledge_points (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    subject          VARCHAR(50) NOT NULL               COMMENT '科目',
    category         VARCHAR(100) NOT NULL              COMMENT '分類',
    point_code       VARCHAR(100) UNIQUE NOT NULL       COMMENT '知識點代碼(唯一)',
    point_name       VARCHAR(255) NOT NULL              COMMENT '知識點名稱',
    description      TEXT                               COMMENT '描述',
    grade_levels     JSON                               COMMENT '適用年級 JSON 陣列',
    parent_code      VARCHAR(100)                       COMMENT '父知識點代碼(樹形結構)',
    difficulty_level INT DEFAULT 1                      COMMENT '難度 1-5',
    display_order    INT DEFAULT 0                      COMMENT '排序',
    is_active        BOOLEAN DEFAULT TRUE,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_subject (subject),
    INDEX idx_category (subject, category),
    INDEX idx_parent (parent_code),
    INDEX idx_active (is_active, subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.2  student_mistakes — 學生錯題表
-- 說明: 學生通過拍照/手動輸入的錯題，經 OCR 和 AI 分析
-- 狀態流轉: pending_ocr → pending_review → analyzed → practicing → mastered
-- --------------------------------------------------------------------
CREATE TABLE student_mistakes (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id          VARCHAR(64) UNIQUE NOT NULL     COMMENT '錯題唯一碼',
    student_username    VARCHAR(100) NOT NULL            COMMENT '學生用戶名',
    subject             VARCHAR(50) NOT NULL             COMMENT '科目',
    category            VARCHAR(100) NOT NULL            COMMENT '分類',
    original_image_path VARCHAR(500)                     COMMENT '原始圖片路徑',
    ocr_question_text   TEXT                             COMMENT 'OCR 識別的題目',
    ocr_answer_text     TEXT                             COMMENT 'OCR 識別的答案',
    manual_question_text TEXT                            COMMENT '手動輸入的題目',
    manual_answer_text  TEXT                             COMMENT '手動輸入的答案',
    correct_answer      TEXT                             COMMENT '正確答案',
    ai_analysis         TEXT                             COMMENT 'AI 分析結果',
    improvement_tips    JSON                             COMMENT '改進建議 JSON 陣列',
    key_insight         TEXT                             COMMENT '核心考點/知識點總結',
    error_type          VARCHAR(100)                     COMMENT '錯誤類型',
    difficulty_level    INT DEFAULT 1                    COMMENT '難度 1-5',
    confidence_score    FLOAT                            COMMENT 'AI 信心分數',
    status              ENUM('pending_ocr','pending_review','analyzed','practicing','mastered','processing','ocr_failed','needs_review','analysis_failed','cancelled')
                            DEFAULT 'pending_ocr'       COMMENT '狀態',
    review_count        INT DEFAULT 0                    COMMENT '已複習次數',
    last_review_at      DATETIME                         COMMENT '上次複習時間',
    next_review_at      DATETIME                         COMMENT '下次複習時間(間隔重複)',
    mastery_level       INT DEFAULT 0                    COMMENT '掌握程度 0-100',
    source              VARCHAR(50) DEFAULT 'photo'      COMMENT '來源: photo/manual',
    tags                JSON                              COMMENT '標籤 JSON',
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted          BOOLEAN DEFAULT FALSE,

    INDEX idx_student_subject (student_username, subject),
    INDEX idx_student_status (student_username, status),
    INDEX idx_student_category (student_username, subject, category),
    INDEX idx_next_review (student_username, next_review_at),
    INDEX idx_created (created_at DESC),
    INDEX idx_not_deleted (student_username, is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.3  mistake_knowledge_links — 錯題-知識點關聯表
-- 說明: 將錯題連結到相關知識點，含相關度評分
-- --------------------------------------------------------------------
CREATE TABLE mistake_knowledge_links (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id      VARCHAR(64) NOT NULL               COMMENT '→ student_mistakes.mistake_id',
    point_code      VARCHAR(100) NOT NULL              COMMENT '→ knowledge_points.point_code',
    relevance_score FLOAT DEFAULT 1.0                  COMMENT '相關度 0-1',
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,

    UNIQUE KEY uk_mistake_point (mistake_id, point_code),
    INDEX idx_point (point_code),
    INDEX idx_mistake (mistake_id),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.4  student_knowledge_mastery — 學生知識掌握度
-- 說明: 每位學生對每個知識點的掌握程度追蹤
-- --------------------------------------------------------------------
CREATE TABLE student_knowledge_mastery (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    student_username    VARCHAR(100) NOT NULL,
    point_code          VARCHAR(100) NOT NULL            COMMENT '→ knowledge_points.point_code',
    subject             VARCHAR(50) NOT NULL,
    mastery_level       INT DEFAULT 50                   COMMENT '掌握度 0-100',
    total_mistakes      INT DEFAULT 0                    COMMENT '累計錯題數',
    resolved_mistakes   INT DEFAULT 0                    COMMENT '已解決錯題數',
    total_practices     INT DEFAULT 0                    COMMENT '累計練習次數',
    correct_practices   INT DEFAULT 0                    COMMENT '正確練習次數',
    last_mistake_at     DATETIME,
    last_practice_at    DATETIME,
    trend               VARCHAR(20) DEFAULT 'stable'     COMMENT '趨勢: improving/stable/declining',
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_student_point (student_username, point_code),
    INDEX idx_student_subject (student_username, subject),
    INDEX idx_mastery (student_username, mastery_level),
    INDEX idx_trend (student_username, trend)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.5  practice_sessions — 練習會話表
-- 說明: AI 針對學生薄弱知識點生成的個性化練習
-- 類型: targeted(針對性) / review(複習) / challenge(挑戰) / exam_prep(備考)
-- --------------------------------------------------------------------
CREATE TABLE practice_sessions (
    id                   INT AUTO_INCREMENT PRIMARY KEY,
    session_id           VARCHAR(64) UNIQUE NOT NULL,
    student_username     VARCHAR(100) NOT NULL,
    subject              VARCHAR(50) NOT NULL,
    session_type         ENUM('targeted','review','challenge','exam_prep') DEFAULT 'targeted',
    target_points        JSON                            COMMENT '目標知識點 JSON',
    questions            JSON NOT NULL                   COMMENT '題目 JSON',
    total_questions      INT DEFAULT 0,
    student_answers      JSON                            COMMENT '學生作答 JSON',
    correct_count        INT DEFAULT 0,
    score                FLOAT                           COMMENT '得分',
    ai_feedback          TEXT                            COMMENT 'AI 反饋',
    weak_points_identified JSON                          COMMENT '識別出的薄弱點',
    status               ENUM('generating','generated','in_progress','completed','expired','generation_failed') DEFAULT 'generated',
    error_code           VARCHAR(50)                     COMMENT '錯誤代碼',
    error_message        TEXT                            COMMENT '錯誤訊息',
    started_at           DATETIME,
    completed_at         DATETIME,
    created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_student (student_username, subject),
    INDEX idx_status (student_username, status),
    INDEX idx_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.6  mistake_review_log — 錯題複習紀錄
-- 說明: 記錄每次複習錯題的結果，用於間隔重複算法
-- --------------------------------------------------------------------
CREATE TABLE mistake_review_log (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    mistake_id        VARCHAR(64) NOT NULL              COMMENT '→ student_mistakes.mistake_id',
    student_username  VARCHAR(100) NOT NULL,
    review_type       ENUM('flashcard','reattempt','practice') DEFAULT 'flashcard',
    result            ENUM('remembered','forgot','partial') NOT NULL COMMENT '複習結果',
    time_spent_seconds INT                              COMMENT '花費秒數',
    reviewed_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_mistake (mistake_id),
    INDEX idx_student_date (student_username, reviewed_at DESC),
    FOREIGN KEY (mistake_id) REFERENCES student_mistakes(mistake_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 4.7  mastery_snapshots — 知識掌握度快照
-- 說明: 每次掌握度變更的快照，用於生成趨勢圖
-- --------------------------------------------------------------------
CREATE TABLE mastery_snapshots (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    student_username VARCHAR(100) NOT NULL,
    point_code       VARCHAR(100) NOT NULL,
    subject          VARCHAR(50) NOT NULL,
    mastery_level    INT NOT NULL                       COMMENT '當時的掌握度',
    trigger_type     ENUM('mistake','practice','review') NOT NULL COMMENT '觸發類型',
    trigger_id       VARCHAR(64)                        COMMENT '觸發源ID',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_student_point_time (student_username, point_code, created_at),
    INDEX idx_student_subject_time (student_username, subject, created_at DESC),
    INDEX idx_trigger (trigger_type, trigger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 5 ：學習任務 (Learning Tasks)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 5.1  learning_tasks — 學習任務表
-- 說明: 教師發佈的學習任務，可指定目標群體(全部/班級/個人)
-- --------------------------------------------------------------------
CREATE TABLE learning_tasks (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    title            VARCHAR(255) NOT NULL              COMMENT '任務標題',
    description      TEXT                               COMMENT '任務描述',
    content          TEXT                               COMMENT '任務內容',
    category         VARCHAR(50) DEFAULT 'general'      COMMENT '分類',
    priority         INT DEFAULT 1                      COMMENT '優先級 1-5',
    status           VARCHAR(20) DEFAULT 'draft'        COMMENT '狀態: draft/published/archived',
    created_by       VARCHAR(100) NOT NULL              COMMENT '建立者用戶名',
    target_type      VARCHAR(20) NOT NULL DEFAULT 'all' COMMENT '目標類型: all/class/student',
    target_value     VARCHAR(255) DEFAULT NULL           COMMENT '目標值: 班級名或學生名',
    total_recipients INT DEFAULT 0                      COMMENT '總接收人數',
    completed_count  INT DEFAULT 0                      COMMENT '已完成人數',
    attachments      JSON DEFAULT NULL                   COMMENT '附件 JSON',
    deadline         DATETIME DEFAULT NULL               COMMENT '截止日期',
    published_at     DATETIME DEFAULT NULL               COMMENT '發佈時間',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted       TINYINT(1) DEFAULT 0,

    INDEX idx_status (status),
    INDEX idx_created_by (created_by),
    INDEX idx_target (target_type, target_value),
    INDEX idx_deadline (deadline),
    INDEX idx_published (published_at),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 5.2  learning_task_items — 學習任務子項目
-- 說明: 每個任務可包含多個子項目(連結、閱讀材料等)
-- --------------------------------------------------------------------
CREATE TABLE learning_task_items (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    task_id     INT NOT NULL                           COMMENT '→ learning_tasks.id',
    item_order  INT DEFAULT 0                          COMMENT '排序',
    title       VARCHAR(255) NOT NULL                  COMMENT '子項標題',
    description TEXT DEFAULT NULL                       COMMENT '描述',
    link_url    VARCHAR(500) DEFAULT NULL               COMMENT '連結URL',
    link_label  VARCHAR(100) DEFAULT NULL               COMMENT '連結標籤',
    tag         VARCHAR(50) DEFAULT NULL                COMMENT '標籤',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_task_id (task_id),
    INDEX idx_task_order (task_id, item_order),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 5.3  learning_task_completions — 任務完成紀錄
-- 說明: 學生完成任務子項的紀錄
-- --------------------------------------------------------------------
CREATE TABLE learning_task_completions (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    task_id      INT NOT NULL                          COMMENT '→ learning_tasks.id',
    username     VARCHAR(100) NOT NULL                  COMMENT '學生用戶名',
    item_id      INT DEFAULT NULL                       COMMENT '→ learning_task_items.id (NULL=整體任務)',
    is_completed TINYINT(1) DEFAULT 0,
    completed_at DATETIME DEFAULT NULL,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY uk_task_user_item (task_id, username, item_id),
    INDEX idx_task_id (task_id),
    INDEX idx_username (username),
    INDEX idx_completed (is_completed),
    FOREIGN KEY (task_id) REFERENCES learning_tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 6 ：AI 學習中心 (AI Learning Center, 前綴 lc_)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 6.1  lc_categories — 分類表
-- 說明: 學習資源的樹形分類結構
-- --------------------------------------------------------------------
CREATE TABLE lc_categories (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL                  COMMENT '分類名稱',
    slug        VARCHAR(100) NOT NULL UNIQUE            COMMENT 'URL slug',
    icon        VARCHAR(10) DEFAULT '📁'               COMMENT '圖標 emoji',
    description TEXT,
    parent_id   INT DEFAULT NULL                        COMMENT '父分類 → lc_categories.id',
    sort_order  INT DEFAULT 0,
    created_by  VARCHAR(100),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted  TINYINT(1) DEFAULT 0,

    INDEX idx_parent (parent_id),
    INDEX idx_sort (sort_order),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.2  lc_contents — 學習內容表
-- 說明: 各類型教學資源(文檔/影片/文章等)
-- content_type: document / video_local / video_external / article / image
-- --------------------------------------------------------------------
CREATE TABLE lc_contents (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL              COMMENT '標題',
    description     TEXT                               COMMENT '描述',
    content_type    VARCHAR(30) NOT NULL               COMMENT '類型: document/video_local/video_external/article/image',
    file_path       VARCHAR(500)                       COMMENT '本地檔案路徑',
    file_name       VARCHAR(255)                       COMMENT '檔名',
    file_size       BIGINT DEFAULT 0                   COMMENT '檔案大小(bytes)',
    mime_type       VARCHAR(100)                       COMMENT 'MIME 類型',
    external_url    VARCHAR(500)                       COMMENT '外部連結',
    video_platform  VARCHAR(50)                        COMMENT '影片平台: youtube/bilibili...',
    embed_url       VARCHAR(500)                       COMMENT '嵌入URL',
    article_content LONGTEXT                           COMMENT '文章正文(HTML)',
    thumbnail_path  VARCHAR(500)                       COMMENT '縮圖路徑',
    duration        INT DEFAULT 0                      COMMENT '時長(秒)',
    tags            JSON                               COMMENT '標籤 JSON',
    metadata        JSON                               COMMENT '額外元資料',
    status          VARCHAR(20) DEFAULT 'draft'        COMMENT '狀態: draft/published/archived',
    view_count      INT DEFAULT 0                      COMMENT '瀏覽次數',
    sort_order      INT DEFAULT 0                      COMMENT '排序',
    created_by      VARCHAR(100) NOT NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_type (content_type),
    INDEX idx_status (status),
    INDEX idx_created (created_at DESC),
    INDEX idx_deleted (is_deleted),
    INDEX idx_sort_order (sort_order),
    FULLTEXT idx_search (title, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.3  lc_content_categories — 內容-分類關聯表 (多對多)
-- --------------------------------------------------------------------
CREATE TABLE lc_content_categories (
    content_id  INT NOT NULL                           COMMENT '→ lc_contents.id',
    category_id INT NOT NULL                           COMMENT '→ lc_categories.id',
    PRIMARY KEY (content_id, category_id),
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.4  lc_knowledge_nodes — 知識圖譜節點
-- 說明: 視覺化知識圖譜的節點，可定位(x/y)、可釘選
-- --------------------------------------------------------------------
CREATE TABLE lc_knowledge_nodes (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    title       VARCHAR(255) NOT NULL                  COMMENT '節點標題',
    description TEXT,
    icon        VARCHAR(10) DEFAULT '💡',
    color       VARCHAR(20) DEFAULT '#006633'           COMMENT '節點顏色',
    node_size   INT DEFAULT 40                          COMMENT '節點大小',
    position_x  FLOAT DEFAULT NULL                      COMMENT 'X 座標',
    position_y  FLOAT DEFAULT NULL                      COMMENT 'Y 座標',
    is_pinned   TINYINT(1) DEFAULT 0                    COMMENT '是否釘選位置',
    category_id INT DEFAULT NULL                        COMMENT '→ lc_categories.id',
    created_by  VARCHAR(100),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted  TINYINT(1) DEFAULT 0,

    INDEX idx_category (category_id),
    INDEX idx_deleted (is_deleted),
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.5  lc_knowledge_edges — 知識圖譜邊(關係)
-- 說明: 知識節點之間的關係連線
-- --------------------------------------------------------------------
CREATE TABLE lc_knowledge_edges (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id  INT NOT NULL                       COMMENT '起始節點 → lc_knowledge_nodes.id',
    target_node_id  INT NOT NULL                       COMMENT '目標節點 → lc_knowledge_nodes.id',
    relation_type   VARCHAR(50) DEFAULT 'related'       COMMENT '關係類型: related/prerequisite/extends...',
    label           VARCHAR(100)                        COMMENT '邊標籤',
    weight          FLOAT DEFAULT 1.0                   COMMENT '權重',

    UNIQUE KEY uk_edge (source_node_id, target_node_id),
    FOREIGN KEY (source_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.6  lc_node_contents — 節點-內容關聯表
-- 說明: 將學習內容關聯到知識節點，支持定位錨點
-- --------------------------------------------------------------------
CREATE TABLE lc_node_contents (
    node_id     INT NOT NULL                           COMMENT '→ lc_knowledge_nodes.id',
    content_id  INT NOT NULL                           COMMENT '→ lc_contents.id',
    sort_order  INT DEFAULT 0,
    anchor      JSON DEFAULT NULL                       COMMENT '定位錨點 {"type":"page","value":5}',

    PRIMARY KEY (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.7  lc_learning_paths — 學習路徑
-- 說明: 由教師策劃的結構化學習路徑
-- --------------------------------------------------------------------
CREATE TABLE lc_learning_paths (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(255) NOT NULL,
    description     TEXT,
    icon            VARCHAR(10) DEFAULT '🗺️',
    cover_image     VARCHAR(500)                       COMMENT '封面圖',
    difficulty      VARCHAR(20) DEFAULT 'beginner'      COMMENT 'beginner/intermediate/advanced',
    estimated_hours FLOAT DEFAULT 0                     COMMENT '預估學時',
    tags            JSON,
    status          VARCHAR(20) DEFAULT 'draft',
    sort_order      INT DEFAULT 0,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT(1) DEFAULT 0,

    INDEX idx_status (status),
    INDEX idx_difficulty (difficulty),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 6.8  lc_path_steps — 學習路徑步驟
-- 說明: 路徑中的每個學習步驟，可關聯內容或知識節點
-- --------------------------------------------------------------------
CREATE TABLE lc_path_steps (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    path_id     INT NOT NULL                           COMMENT '→ lc_learning_paths.id',
    step_order  INT NOT NULL DEFAULT 0                  COMMENT '步驟順序',
    title       VARCHAR(255) NOT NULL,
    description TEXT,
    content_id  INT DEFAULT NULL                        COMMENT '→ lc_contents.id',
    node_id     INT DEFAULT NULL                        COMMENT '→ lc_knowledge_nodes.id',
    metadata    JSON                                    COMMENT '額外資料',

    INDEX idx_path_order (path_id, step_order),
    FOREIGN KEY (path_id) REFERENCES lc_learning_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE SET NULL,
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 7 ：學校學習中心 (School Learning Center, 前綴 slc_)
--   與 AI 學習中心 (lc_) 完全獨立，互不影響
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 7.1  slc_contents — 學校學習內容表
-- 說明: 學校教師上傳的教學資源(文檔/影片/文章)，必須指定科目
-- content_type: document / video_local / video_external / article / image
-- --------------------------------------------------------------------
CREATE TABLE slc_contents (
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
    duration        INT                                COMMENT '時長(秒)',
    tags            JSON,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                        COMMENT 'draft | published | archived',
    sort_order      INT DEFAULT 0,
    view_count      INT DEFAULT 0,
    subject_code    VARCHAR(50) NOT NULL               COMMENT '科目代碼(必填)',
    grade_level     VARCHAR(20) DEFAULT NULL            COMMENT '年級: 中一~中六',
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT DEFAULT 0,

    INDEX idx_slc_contents_subject (subject_code),
    INDEX idx_slc_contents_grade (grade_level),
    INDEX idx_slc_contents_status (status),
    INDEX idx_slc_contents_type (content_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 7.2  slc_knowledge_nodes — 學校知識圖譜節點
-- --------------------------------------------------------------------
CREATE TABLE slc_knowledge_nodes (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    title        VARCHAR(500) NOT NULL,
    description  TEXT,
    icon         VARCHAR(50) DEFAULT '📌',
    color        VARCHAR(20) DEFAULT '#006633',
    node_size    INT DEFAULT 40,
    category_id  INT,
    position_x   FLOAT DEFAULT 0,
    position_y   FLOAT DEFAULT 0,
    is_pinned    TINYINT DEFAULT 0,
    subject_code VARCHAR(50) NOT NULL                  COMMENT '科目代碼(必填)',
    grade_level  VARCHAR(20) DEFAULT NULL,
    created_by   VARCHAR(100),
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted   TINYINT DEFAULT 0,

    INDEX idx_slc_nodes_subject (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 7.3  slc_knowledge_edges — 學校知識圖譜邊
-- --------------------------------------------------------------------
CREATE TABLE slc_knowledge_edges (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id  INT NOT NULL                       COMMENT '→ slc_knowledge_nodes.id',
    target_node_id  INT NOT NULL                       COMMENT '→ slc_knowledge_nodes.id',
    relation_type   VARCHAR(100) DEFAULT 'related',
    label           VARCHAR(200),
    weight          FLOAT DEFAULT 1.0,
    subject_code    VARCHAR(50),
    is_deleted      TINYINT DEFAULT 0,

    FOREIGN KEY (source_node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 7.4  slc_node_contents — 學校節點-內容關聯表
-- --------------------------------------------------------------------
CREATE TABLE slc_node_contents (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    node_id     INT NOT NULL                           COMMENT '→ slc_knowledge_nodes.id',
    content_id  INT NOT NULL                           COMMENT '→ slc_contents.id',
    sort_order  INT DEFAULT 0,
    anchor      JSON                                    COMMENT '定位錨點 {"type":"page","value":5}',

    UNIQUE KEY uk_slc_node_content (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES slc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES slc_contents(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 7.5  slc_learning_paths — 學校學習路徑
-- --------------------------------------------------------------------
CREATE TABLE slc_learning_paths (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    title           VARCHAR(500) NOT NULL,
    description     TEXT,
    icon            VARCHAR(50) DEFAULT '🎯',
    difficulty      VARCHAR(20) DEFAULT 'beginner'
                        COMMENT 'beginner | intermediate | advanced',
    estimated_hours FLOAT DEFAULT 1.0,
    tags            JSON,
    status          VARCHAR(20) NOT NULL DEFAULT 'draft',
    subject_code    VARCHAR(50) NOT NULL               COMMENT '科目代碼(必填)',
    grade_level     VARCHAR(20) DEFAULT NULL,
    created_by      VARCHAR(100),
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted      TINYINT DEFAULT 0,

    INDEX idx_slc_paths_subject (subject_code),
    INDEX idx_slc_paths_grade (grade_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 7.6  slc_path_steps — 學校學習路徑步驟
-- --------------------------------------------------------------------
CREATE TABLE slc_path_steps (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    path_id     INT NOT NULL                           COMMENT '→ slc_learning_paths.id',
    step_order  INT DEFAULT 0,
    title       VARCHAR(500),
    description TEXT,
    content_id  INT                                    COMMENT '→ slc_contents.id',
    node_id     INT                                    COMMENT '→ slc_knowledge_nodes.id',

    FOREIGN KEY (path_id) REFERENCES slc_learning_paths(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 8 ：論壇系統 (Forum System, 前綴 forum_)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 8.1  forum_posts — 帖子表
-- 說明: 論壇帖子，支持討論/提問/公告三種類型，支持匿名
-- --------------------------------------------------------------------
CREATE TABLE forum_posts (
    post_id          INT AUTO_INCREMENT PRIMARY KEY,
    author_username  VARCHAR(100) NOT NULL              COMMENT '作者 → users.username',
    title            VARCHAR(255) NOT NULL              COMMENT '標題',
    content          LONGTEXT NOT NULL                  COMMENT 'Markdown 正文',
    content_html     LONGTEXT                           COMMENT '渲染後 HTML',
    post_type        ENUM('discussion','question','announcement') NOT NULL DEFAULT 'discussion',
    visibility       ENUM('public','private') NOT NULL DEFAULT 'public',
    is_anonymous     BOOLEAN NOT NULL DEFAULT FALSE     COMMENT '是否匿名',
    anonymous_name   VARCHAR(50) DEFAULT NULL            COMMENT '匿名顯示名',
    is_pinned        BOOLEAN NOT NULL DEFAULT FALSE     COMMENT '是否置頂',
    is_locked        BOOLEAN NOT NULL DEFAULT FALSE     COMMENT '是否鎖定(禁止回覆)',
    is_resolved      BOOLEAN NOT NULL DEFAULT FALSE     COMMENT '是否已解決(提問類型)',
    view_count       INT UNSIGNED NOT NULL DEFAULT 0,
    reply_count      INT UNSIGNED NOT NULL DEFAULT 0,
    upvote_count     INT UNSIGNED NOT NULL DEFAULT 0,
    tags             JSON DEFAULT NULL                   COMMENT '標籤 JSON 陣列',
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at       DATETIME DEFAULT NULL,
    deleted_by       VARCHAR(100) DEFAULT NULL,
    metadata         JSON DEFAULT NULL,

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


-- --------------------------------------------------------------------
-- 8.2  forum_replies — 回覆表
-- 說明: 帖子的回覆，支持巢狀回覆(parent_reply_id)、教師回覆標記
-- --------------------------------------------------------------------
CREATE TABLE forum_replies (
    reply_id              INT AUTO_INCREMENT PRIMARY KEY,
    post_id               INT NOT NULL                  COMMENT '→ forum_posts.post_id',
    parent_reply_id       INT DEFAULT NULL               COMMENT '父回覆(巢狀) → forum_replies.reply_id',
    author_username       VARCHAR(100) NOT NULL          COMMENT '→ users.username',
    content               LONGTEXT NOT NULL,
    content_html          LONGTEXT,
    is_anonymous          BOOLEAN NOT NULL DEFAULT FALSE,
    anonymous_name        VARCHAR(50) DEFAULT NULL,
    is_instructor_response BOOLEAN NOT NULL DEFAULT FALSE COMMENT '教師回覆',
    is_accepted_answer    BOOLEAN NOT NULL DEFAULT FALSE  COMMENT '被採納的答案',
    upvote_count          INT UNSIGNED NOT NULL DEFAULT 0,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted            BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at            DATETIME DEFAULT NULL,
    deleted_by            VARCHAR(100) DEFAULT NULL,
    metadata              JSON DEFAULT NULL,

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


-- --------------------------------------------------------------------
-- 8.3  forum_votes — 投票表
-- 說明: 對帖子或回覆的投票(贊/踩)，每人每目標只能投一次
-- --------------------------------------------------------------------
CREATE TABLE forum_votes (
    vote_id         INT AUTO_INCREMENT PRIMARY KEY,
    post_id         INT DEFAULT NULL                   COMMENT '→ forum_posts.post_id (帖子投票)',
    reply_id        INT DEFAULT NULL                   COMMENT '→ forum_replies.reply_id (回覆投票)',
    voter_username  VARCHAR(100) NOT NULL               COMMENT '→ users.username',
    vote_type       ENUM('upvote','downvote') NOT NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_vote_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_voter FOREIGN KEY (voter_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_post_vote (post_id, voter_username),
    UNIQUE KEY uk_reply_vote (reply_id, voter_username),
    INDEX idx_vote_voter (voter_username),
    INDEX idx_vote_created (created_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 8.4  forum_notifications — 論壇通知
-- 說明: 回覆/提及/@教師回覆/採納/點讚 等通知
-- --------------------------------------------------------------------
CREATE TABLE forum_notifications (
    notification_id   INT AUTO_INCREMENT PRIMARY KEY,
    user_username     VARCHAR(100) NOT NULL             COMMENT '接收者 → users.username',
    post_id           INT DEFAULT NULL,
    reply_id          INT DEFAULT NULL,
    notification_type ENUM('new_reply','new_post','mention','instructor_response','answer_accepted','upvote') NOT NULL,
    related_username  VARCHAR(100) DEFAULT NULL          COMMENT '觸發者用戶名',
    title             VARCHAR(255) NOT NULL              COMMENT '通知標題',
    message           TEXT                               COMMENT '通知內容',
    is_read           BOOLEAN NOT NULL DEFAULT FALSE,
    read_at           DATETIME DEFAULT NULL,
    created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

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


-- --------------------------------------------------------------------
-- 8.5  forum_attachments — 論壇附件
-- 說明: 帖子或回覆的附件檔案
-- --------------------------------------------------------------------
CREATE TABLE forum_attachments (
    attachment_id    INT AUTO_INCREMENT PRIMARY KEY,
    post_id          INT DEFAULT NULL                   COMMENT '→ forum_posts.post_id',
    reply_id         INT DEFAULT NULL                   COMMENT '→ forum_replies.reply_id',
    file_name        VARCHAR(255) NOT NULL,
    file_path        VARCHAR(500) NOT NULL,
    file_size        INT UNSIGNED NOT NULL              COMMENT '檔案大小(bytes)',
    file_type        ENUM('image','document','video','audio','other') NOT NULL DEFAULT 'other',
    mime_type        VARCHAR(100) NOT NULL,
    upload_username  VARCHAR(100) NOT NULL               COMMENT '上傳者 → users.username',
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_deleted       BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at       DATETIME DEFAULT NULL,

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


-- --------------------------------------------------------------------
-- 8.6  forum_tags — 論壇標籤
-- --------------------------------------------------------------------
CREATE TABLE forum_tags (
    tag_id          INT AUTO_INCREMENT PRIMARY KEY,
    tag_name        VARCHAR(50) NOT NULL,
    tag_description VARCHAR(255) DEFAULT NULL,
    tag_color       VARCHAR(7) DEFAULT '#006633'        COMMENT '顏色 HEX',
    usage_count     INT UNSIGNED NOT NULL DEFAULT 0     COMMENT '使用次數',
    created_by      VARCHAR(100) NOT NULL               COMMENT '→ users.username',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT fk_tag_creator FOREIGN KEY (created_by)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uk_tag_name (tag_name),
    INDEX idx_tag_usage (usage_count DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 8.7  forum_subscriptions — 訂閱表
-- 說明: 用戶可訂閱特定帖子或標籤，以接收通知
-- --------------------------------------------------------------------
CREATE TABLE forum_subscriptions (
    subscription_id INT AUTO_INCREMENT PRIMARY KEY,
    user_username   VARCHAR(100) NOT NULL               COMMENT '→ users.username',
    post_id         INT DEFAULT NULL                    COMMENT '→ forum_posts.post_id',
    tag_name        VARCHAR(50) DEFAULT NULL             COMMENT '訂閱的標籤名',
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

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


-- --------------------------------------------------------------------
-- 8.8  forum_user_preferences — 用戶論壇偏好設定
-- --------------------------------------------------------------------
CREATE TABLE forum_user_preferences (
    preference_id              INT AUTO_INCREMENT PRIMARY KEY,
    user_username              VARCHAR(100) NOT NULL UNIQUE COMMENT '→ users.username',
    notify_new_reply           BOOLEAN NOT NULL DEFAULT TRUE,
    notify_mention             BOOLEAN NOT NULL DEFAULT TRUE,
    notify_instructor_response BOOLEAN NOT NULL DEFAULT TRUE,
    notify_upvote              BOOLEAN NOT NULL DEFAULT FALSE,
    email_digest               ENUM('none','daily','weekly') NOT NULL DEFAULT 'none',
    default_sort               ENUM('newest','oldest','most_upvoted','most_replied') NOT NULL DEFAULT 'newest',
    posts_per_page             INT UNSIGNED NOT NULL DEFAULT 20,
    created_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                 DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    CONSTRAINT fk_preference_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 9 ：考勤點名系統 (Attendance System)
--   包含三種模式: 晨讀 / 留堂 / 課外活動
--   注意: 這些表在 Python 啟動時動態建立 (app/routers/attendance.py)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 9.1  attendance_students — [DEPRECATED] 已合併至 users 表
-- 說明: 原獨立學生表，english_name 和 card_id 已遷移至 users 表。
--       保留此表作為備份，不再被程式碼查詢。
-- --------------------------------------------------------------------
CREATE TABLE attendance_students (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    class_name   VARCHAR(10) NOT NULL                  COMMENT '班級，如 S1A',
    class_number INT NOT NULL                          COMMENT '班號',
    user_login   VARCHAR(50) NOT NULL UNIQUE            COMMENT '學號(唯一)',
    english_name VARCHAR(100) NOT NULL                  COMMENT '英文名',
    chinese_name VARCHAR(100) NOT NULL                  COMMENT '中文名',
    card_id      VARCHAR(50)                            COMMENT '學生證 CardID',
    is_active    BOOLEAN DEFAULT TRUE,
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_class (class_name),
    INDEX idx_card (card_id),
    INDEX idx_user_login (user_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.2  attendance_sessions — 點名會話表
-- 說明: 每次開啟晨讀/留堂點名就建立一個 session
-- session_type: morning(晨讀) / detention(留堂)
-- open_mode: TRUE=自由模式(任何人可簽到) / FALSE=只限名單
-- --------------------------------------------------------------------
CREATE TABLE attendance_sessions (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_type     ENUM('morning','detention') NOT NULL COMMENT '晨讀/留堂',
    session_date     DATE NOT NULL                       COMMENT '日期',
    start_time       TIME                                COMMENT '開始時間',
    end_time         TIME                                COMMENT '結束時間',
    target_time      TIME NOT NULL DEFAULT '07:30:00'    COMMENT '目標到校時間',
    late_threshold   TIME NOT NULL DEFAULT '07:40:00'    COMMENT '嚴重遲到閾值',
    makeup_minutes   INT DEFAULT 35                      COMMENT '預設補時分鐘',
    status           ENUM('active','completed','cancelled') DEFAULT 'active',
    created_by       VARCHAR(50)                         COMMENT '建立者',
    notes            TEXT,
    open_mode        BOOLEAN DEFAULT FALSE                COMMENT '自由簽到模式',
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_date (session_date),
    INDEX idx_type (session_type),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.3  attendance_session_students — 會話學生名單
-- 說明: 每個 session 中被加入的學生名單
-- --------------------------------------------------------------------
CREATE TABLE attendance_session_students (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    session_id  INT NOT NULL                           COMMENT '→ attendance_sessions.id',
    user_login  VARCHAR(50) NOT NULL                    COMMENT '→ attendance_students.user_login',
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_session_student (session_id, user_login),
    INDEX idx_session (session_id),
    INDEX idx_student (user_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.4  attendance_records — 簽到紀錄表
-- 說明: 每位學生在 session 中的簽到紀錄
-- status 取值:
--   晨讀: present(準時) / late(遲到) / very_late(嚴重遲到) / absent(未到)
--   留堂: detention_active(進行中) / detention_completed(已完成)
-- --------------------------------------------------------------------
CREATE TABLE attendance_records (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_id       INT NOT NULL                      COMMENT '→ attendance_sessions.id',
    user_login       VARCHAR(50) NOT NULL               COMMENT '→ attendance_students.user_login',
    card_id          VARCHAR(50)                        COMMENT '刷卡ID',
    scan_time        DATETIME NOT NULL                  COMMENT '簽到時間',
    checkout_time    DATETIME                           COMMENT '簽退時間',
    status           ENUM('present','late','very_late','absent',
                          'detention_active','detention_completed') NOT NULL,
    late_minutes     INT DEFAULT 0                     COMMENT '遲到分鐘數',
    makeup_minutes   INT DEFAULT 0                     COMMENT '補時分鐘數',
    is_registered    BOOLEAN DEFAULT TRUE               COMMENT '是否在登記名單中',
    planned_periods  INT DEFAULT 0                     COMMENT '計劃留堂節數(每節35分鐘)',
    planned_minutes  INT DEFAULT NULL                   COMMENT '計劃留堂分鐘(自訂)',
    planned_end_time DATETIME                           COMMENT '計劃結束時間',
    actual_minutes   INT DEFAULT 0                     COMMENT '實際留堂分鐘',
    actual_periods   INT DEFAULT 0                     COMMENT '實際完成節數',
    detention_reason VARCHAR(50)                        COMMENT '留堂原因: homework/morning',
    notes            TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_session_record (session_id, user_login),
    INDEX idx_session (session_id),
    INDEX idx_student (user_login),
    INDEX idx_scan_time (scan_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.5  attendance_fixed_lists — 固定名單表
-- 說明: 預設的學生名單模板，可快速載入到 session
-- --------------------------------------------------------------------
CREATE TABLE attendance_fixed_lists (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    list_name   VARCHAR(100) NOT NULL                  COMMENT '名單名稱',
    list_type   ENUM('morning','detention') DEFAULT 'morning',
    created_by  VARCHAR(50),
    is_default  BOOLEAN DEFAULT FALSE                   COMMENT '是否為預設名單',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_list_name (list_name, list_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.6  attendance_fixed_list_students — 固定名單成員
-- --------------------------------------------------------------------
CREATE TABLE attendance_fixed_list_students (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    list_id     INT NOT NULL                           COMMENT '→ attendance_fixed_lists.id',
    user_login  VARCHAR(50) NOT NULL                    COMMENT '→ attendance_students.user_login',
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (list_id) REFERENCES attendance_fixed_lists(id) ON DELETE CASCADE,
    UNIQUE KEY unique_list_student (list_id, user_login),
    INDEX idx_list (list_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.7  detention_history — 留堂歷史紀錄
-- 說明: 記錄學生的歷史留堂資料，用於統計和匯報
-- --------------------------------------------------------------------
CREATE TABLE detention_history (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    user_login       VARCHAR(50) NOT NULL               COMMENT '學生學號',
    session_id       INT                                COMMENT '→ attendance_sessions.id',
    detention_date   DATE NOT NULL                      COMMENT '留堂日期',
    reason           TEXT                               COMMENT '留堂原因',
    duration_minutes INT DEFAULT 35                     COMMENT '留堂時長(分鐘)',
    completed        BOOLEAN DEFAULT FALSE               COMMENT '是否完成',
    completed_at     DATETIME                           COMMENT '完成時間',
    created_by       VARCHAR(50),
    notes            TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_user (user_login),
    INDEX idx_date (detention_date),
    INDEX idx_completed (completed)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.8  attendance_exports — 匯出紀錄表
-- 說明: 保存每次點名結果匯出的 Excel 檔案元資料
-- --------------------------------------------------------------------
CREATE TABLE attendance_exports (
    id              INT AUTO_INCREMENT PRIMARY KEY,
    session_id      INT NOT NULL                       COMMENT '→ attendance_sessions.id',
    session_type    ENUM('morning','detention') NOT NULL,
    session_date    DATE NOT NULL,
    created_by      VARCHAR(50) NOT NULL,
    created_by_name VARCHAR(100),
    file_name       VARCHAR(255) NOT NULL               COMMENT 'Excel 檔名',
    file_path       VARCHAR(500) NOT NULL               COMMENT '伺服器儲存路徑',
    file_size       BIGINT DEFAULT 0,
    student_count   INT DEFAULT 0                      COMMENT '總學生數',
    present_count   INT DEFAULT 0                      COMMENT '出席人數',
    late_count      INT DEFAULT 0                      COMMENT '遲到人數',
    absent_count    INT DEFAULT 0                      COMMENT '缺席人數',
    notes           TEXT,
    is_deleted      BOOLEAN DEFAULT FALSE,
    deleted_at      DATETIME NULL,
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_created_by (created_by),
    INDEX idx_session (session_id),
    INDEX idx_date (session_date),
    INDEX idx_type (session_type),
    INDEX idx_deleted (is_deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.9  activity_groups — 課外活動固定小組
-- 說明: 預設的課外活動學生分組
-- --------------------------------------------------------------------
CREATE TABLE activity_groups (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(100) NOT NULL                  COMMENT '小組名稱',
    created_by  VARCHAR(50),
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    UNIQUE KEY unique_group_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.10 activity_group_students — 活動小組成員
-- --------------------------------------------------------------------
CREATE TABLE activity_group_students (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    group_id    INT NOT NULL                           COMMENT '→ activity_groups.id',
    user_login  VARCHAR(50) NOT NULL,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (group_id) REFERENCES activity_groups(id) ON DELETE CASCADE,
    UNIQUE KEY unique_group_student (group_id, user_login),
    INDEX idx_group (group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.11 activity_sessions — 課外活動會話
-- 說明: 每次課外活動簽到建立一個 session
-- late_threshold: 遲到容許分鐘數(預設10分)
-- early_threshold: 早退容許分鐘數(預設10分)
-- --------------------------------------------------------------------
CREATE TABLE activity_sessions (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    session_date     DATE NOT NULL,
    activity_name    VARCHAR(200) NOT NULL              COMMENT '活動名稱',
    start_time       TIME NOT NULL                     COMMENT '開始時間',
    end_time         TIME NOT NULL                     COMMENT '結束時間',
    late_threshold   INT DEFAULT 10                    COMMENT '遲到容許分鐘',
    early_threshold  INT DEFAULT 10                    COMMENT '早退容許分鐘',
    status           ENUM('active','completed','cancelled') DEFAULT 'active',
    created_by       VARCHAR(50),
    notes            TEXT,
    created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_date (session_date),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.12 activity_session_students — 活動會話學生名單
-- --------------------------------------------------------------------
CREATE TABLE activity_session_students (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    session_id  INT NOT NULL                           COMMENT '→ activity_sessions.id',
    user_login  VARCHAR(50) NOT NULL,
    added_at    DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_session_student (session_id, user_login),
    INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 9.13 activity_records — 課外活動簽到/簽退紀錄
-- 說明: 記錄每位學生的簽到和簽退時間與狀態
-- check_in_status:  on_time / late / not_arrived
-- check_out_status: normal / early / not_arrived / still_here
-- --------------------------------------------------------------------
CREATE TABLE activity_records (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    session_id        INT NOT NULL                     COMMENT '→ activity_sessions.id',
    user_login        VARCHAR(50) NOT NULL,
    card_id           VARCHAR(50)                       COMMENT '刷卡ID',
    check_in_time     DATETIME                          COMMENT '簽到時間',
    check_in_status   ENUM('on_time','late','not_arrived') DEFAULT 'not_arrived',
    check_out_time    DATETIME                          COMMENT '簽退時間',
    check_out_status  ENUM('normal','early','not_arrived','still_here') DEFAULT 'not_arrived',
    late_minutes      INT DEFAULT 0                    COMMENT '遲到分鐘',
    early_minutes     INT DEFAULT 0                    COMMENT '早退分鐘',
    notes             TEXT,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (session_id) REFERENCES activity_sessions(id) ON DELETE CASCADE,
    UNIQUE KEY unique_session_record (session_id, user_login),
    INDEX idx_session (session_id),
    INDEX idx_student (user_login)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 10 ：基礎配置與緩存 (Configuration & Cache)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 10.1 subjects — 學科配置表
-- 說明: 系統支持的學科及其配置(AI 模型參數等)
-- --------------------------------------------------------------------
CREATE TABLE subjects (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    subject_code VARCHAR(50) UNIQUE NOT NULL            COMMENT '科目代碼: math/chinese/english...',
    subject_name VARCHAR(100) NOT NULL                  COMMENT '科目名稱',
    config       JSON                                   COMMENT '配置 JSON (AI 參數、Prompt 等)',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_subject_code (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 10.2 knowledge_index — 知識文檔索引表
-- 說明: 各科目的 RAG 知識庫文件索引
-- --------------------------------------------------------------------
CREATE TABLE knowledge_index (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    subject_code VARCHAR(50) NOT NULL                   COMMENT '→ subjects.subject_code',
    file_name    VARCHAR(255) NOT NULL                  COMMENT '檔案名',
    file_path    TEXT                                    COMMENT '檔案路徑',
    content_hash VARCHAR(64)                            COMMENT '內容 Hash(去重)',
    metadata     JSON                                    COMMENT '文件元資料',
    created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_subject (subject_code),
    UNIQUE KEY unique_subject_file (subject_code, file_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 10.3 query_cache — 查詢緩存表
-- 說明: 緩存 AI 查詢結果以減少重複呼叫
-- --------------------------------------------------------------------
CREATE TABLE query_cache (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    cache_key   VARCHAR(255) UNIQUE NOT NULL            COMMENT '緩存鍵(Hash)',
    cache_value JSON                                    COMMENT '緩存值 JSON',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at  DATETIME                                COMMENT '過期時間',

    INDEX idx_cache_key (cache_key),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- ====================================================================
--   模組 11 ：安全與分析 (Security & Analytics)
-- ====================================================================
-- ====================================================================

-- --------------------------------------------------------------------
-- 11.1 learning_analytics — 學習分析表
-- 說明: 匿名化的學習指標統計，用於教學分析
-- --------------------------------------------------------------------
CREATE TABLE learning_analytics (
    analytics_id INT AUTO_INCREMENT PRIMARY KEY,
    user_hash    VARCHAR(64) NOT NULL                   COMMENT '用戶匿名 Hash',
    subject_code VARCHAR(50)                            COMMENT '科目',
    session_date DATE                                   COMMENT '日期',
    metrics      JSON                                   COMMENT '指標 JSON (問題數/正確率/...)',
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_analytics_date (session_date),
    INDEX idx_analytics_subject (subject_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ====================================================================
-- 模組 11: 課室日誌 (Class Diary)          class_diary_*      (2 表)
-- ====================================================================

-- --------------------------------------------------------------------
-- 11.1  class_diary_entries — 課堂評級記錄
-- 說明: 教師掃碼後填寫的每節課評級，包含紀律、整潔、考勤等
-- --------------------------------------------------------------------
CREATE TABLE class_diary_entries (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    class_code          VARCHAR(20)  NOT NULL              COMMENT '班級代碼，如 5B',
    entry_date          DATE         NOT NULL              COMMENT '上課日期',
    period_start        TINYINT      NOT NULL              COMMENT '起始節數 (0=早會, 1-9)',
    period_end          TINYINT      NOT NULL              COMMENT '結束節數',
    subject             VARCHAR(100) NOT NULL              COMMENT '科目名稱',
    absent_students     TEXT                               COMMENT '缺席學生（自由文本）',
    late_students       TEXT                               COMMENT '遲到學生（自由文本）',
    discipline_rating   TINYINT      NOT NULL DEFAULT 0    COMMENT '紀律評級 1-5（5最佳）',
    cleanliness_rating  TINYINT      NOT NULL DEFAULT 0    COMMENT '整潔評級 1-5（5最佳）',
    commended_students  TEXT                               COMMENT '值得嘉許的學生（姓名+原因）',
    appearance_issues   TEXT                               COMMENT '儀表違規記錄',
    rule_violations     TEXT                               COMMENT '課堂違規記錄',
    signature           MEDIUMTEXT                         COMMENT '教師手寫簽名 (base64 PNG)',
    submitted_from      VARCHAR(255)                       COMMENT '提交來源 User-Agent 摘要',
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_class_date (class_code, entry_date),
    INDEX idx_date (entry_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- --------------------------------------------------------------------
-- 11.2  class_diary_reviewers — Review 授權用戶
-- 說明: 管理員授權哪些帳戶可以查看課室日誌 Review
-- --------------------------------------------------------------------
CREATE TABLE class_diary_reviewers (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    username    VARCHAR(100) NOT NULL UNIQUE         COMMENT '被授權的用戶名',
    granted_by  VARCHAR(100) NOT NULL                COMMENT '授權管理員',
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║                        表關係速查 (ER 概要)                         ║
-- ╠══════════════════════════════════════════════════════════════════════╣
-- ║                                                                    ║
-- ║  users ─┬─< sessions                (1:N 登入會話)                 ║
-- ║         ├─< conversations ─< messages (1:N:N 對話與消息)           ║
-- ║         ├─< audit_logs               (1:N 審計日誌)                ║
-- ║         ├─< password_history          (1:N 密碼歷史)               ║
-- ║         ├─< deletion_requests         (1:N 刪除請求)               ║
-- ║         ├─< data_access_logs          (1:N 存取日誌)               ║
-- ║         ├─< classroom_rooms          (1:N 教師的課室)              ║
-- ║         ├─< classroom_enrollments    (1:N 學生加入課室)            ║
-- ║         ├─< forum_posts              (1:N 發帖)                    ║
-- ║         └─< forum_replies            (1:N 回覆)                    ║
-- ║                                                                    ║
-- ║  classes ──< users.class_id          (1:N 班級成員)                ║
-- ║                                                                    ║
-- ║  classroom_rooms ─┬─< classroom_enrollments  (1:N 加入紀錄)       ║
-- ║                   ├─< ppt_files ─< ppt_pages (1:N:N PPT與頁)     ║
-- ║                   └─< classroom_pushes        (1:N 推送紀錄)       ║
-- ║                                                                    ║
-- ║  student_mistakes ─┬─< mistake_knowledge_links (M:N 知識點)       ║
-- ║                    └─< mistake_review_log      (1:N 複習紀錄)      ║
-- ║                                                                    ║
-- ║  learning_tasks ─┬─< learning_task_items       (1:N 子項目)       ║
-- ║                  └─< learning_task_completions  (1:N 完成紀錄)     ║
-- ║                                                                    ║
-- ║  lc_categories ─< lc_content_categories >── lc_contents (M:N)     ║
-- ║  lc_knowledge_nodes ─┬─< lc_knowledge_edges (N:N 關係)            ║
-- ║                      └─< lc_node_contents >── lc_contents (M:N)   ║
-- ║  lc_learning_paths ─< lc_path_steps            (1:N 步驟)         ║
-- ║                                                                    ║
-- ║  slc_* 結構與 lc_* 完全平行但獨立                                  ║
-- ║                                                                    ║
-- ║  forum_posts ─┬─< forum_replies (支持巢狀)                        ║
-- ║               ├─< forum_votes                                      ║
-- ║               ├─< forum_notifications                              ║
-- ║               ├─< forum_attachments                                ║
-- ║               └─< forum_subscriptions                              ║
-- ║                                                                    ║
-- ║  attendance_sessions ─┬─< attendance_session_students (1:N)       ║
-- ║                       ├─< attendance_records          (1:N)        ║
-- ║                       └─< attendance_exports          (1:N)        ║
-- ║  attendance_fixed_lists ─< attendance_fixed_list_students (1:N)   ║
-- ║  activity_groups ─< activity_group_students            (1:N)       ║
-- ║  activity_sessions ─┬─< activity_session_students     (1:N)       ║
-- ║                     └─< activity_records               (1:N)       ║
-- ║                                                                    ║
-- ║  class_diary_entries   (獨立表，class_code 關聯 classes)           ║
-- ║  class_diary_reviewers (獨立表，username 關聯 users)               ║
-- ║                                                                    ║
-- ╚══════════════════════════════════════════════════════════════════════╝
