-- 试卷批阅系统 — 数据库表创建
-- 执行时机：应用启动时自动检查（通过 _run_schema_migrations）

CREATE TABLE IF NOT EXISTS exam_papers (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    title             VARCHAR(255) NOT NULL                 COMMENT '考试标题',
    subject           VARCHAR(50) NOT NULL DEFAULT 'ict'    COMMENT '科目代码',
    class_name        VARCHAR(100) DEFAULT NULL              COMMENT '目标班级',
    total_marks       DECIMAL(5,1) NOT NULL DEFAULT 40      COMMENT '满分',
    pages_per_exam    INT NOT NULL DEFAULT 1                 COMMENT '每份试卷页数（用于批量切分）',
    grading_mode      ENUM('strict','moderate','lenient') DEFAULT 'moderate' COMMENT '批改松紧度',
    status            ENUM('draft','questions_extracted','answers_ready','grading','completed')
                      DEFAULT 'draft'                        COMMENT '考试状态',
    clean_paper_path  VARCHAR(500) DEFAULT NULL              COMMENT '干净试卷路径',
    answer_paper_path VARCHAR(500) DEFAULT NULL              COMMENT '答案卷路径',
    batch_pdf_path    VARCHAR(500) DEFAULT NULL              COMMENT '全班扫描PDF路径',
    total_students    INT DEFAULT 0                          COMMENT '切分后学生数',
    graded_count      INT DEFAULT 0                          COMMENT '已批改数',
    created_by        INT NOT NULL                           COMMENT '教师 user.id',
    is_deleted        TINYINT(1) DEFAULT 0                   COMMENT '软删除标记',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_teacher (created_by),
    INDEX idx_status (status),
    INDEX idx_class (class_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS exam_questions (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    exam_id           INT NOT NULL                           COMMENT '-> exam_papers.id',
    section           ENUM('A','B') NOT NULL                 COMMENT '甲部/乙部',
    question_number   VARCHAR(20) NOT NULL                   COMMENT '原始题号',
    question_order    INT DEFAULT 0                          COMMENT '显示排序',
    question_type     ENUM('mc','short_answer') NOT NULL     COMMENT '题目类型',
    question_text     TEXT NOT NULL                          COMMENT '题目内容',
    max_marks         DECIMAL(5,1) NOT NULL                  COMMENT '该题分值',
    reference_answer  TEXT DEFAULT NULL                      COMMENT '参考答案',
    answer_source     ENUM('answer_sheet','rag','manual') DEFAULT NULL COMMENT '答案来源',
    mc_options        JSON DEFAULT NULL                      COMMENT 'MC 选项 {"A":"..."}',
    metadata          JSON DEFAULT NULL                      COMMENT '扩展字段',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_exam (exam_id),
    INDEX idx_order (exam_id, question_order),
    FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS exam_student_papers (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    exam_id           INT NOT NULL                           COMMENT '-> exam_papers.id',
    student_index     INT NOT NULL                           COMMENT '顺序编号(1-based)',
    user_id           INT DEFAULT NULL                       COMMENT '匹配到的 users.id',
    student_name      VARCHAR(100) DEFAULT NULL              COMMENT 'OCR 识别的姓名',
    student_number    VARCHAR(50) DEFAULT NULL               COMMENT 'OCR 识别的学号',
    class_name        VARCHAR(50) DEFAULT NULL               COMMENT 'OCR 识别的班别',
    page_start        INT NOT NULL                           COMMENT '批量PDF中起始页(1-based)',
    page_end          INT NOT NULL                           COMMENT '批量PDF中结束页(含)',
    image_paths       JSON DEFAULT NULL                      COMMENT '页面图片路径数组',
    total_score       DECIMAL(5,1) DEFAULT NULL              COMMENT '总分',
    status            ENUM('pending','ocr_processing','grading','graded','error')
                      DEFAULT 'pending'                      COMMENT '批改状态',
    ocr_raw           JSON DEFAULT NULL                      COMMENT 'OCR原始输出',
    error_message     TEXT DEFAULT NULL                      COMMENT '错误信息',
    graded_at         DATETIME DEFAULT NULL,
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_exam (exam_id),
    INDEX idx_status (exam_id, status),
    FOREIGN KEY (exam_id) REFERENCES exam_papers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE IF NOT EXISTS exam_student_answers (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    student_paper_id  INT NOT NULL                           COMMENT '-> exam_student_papers.id',
    question_id       INT NOT NULL                           COMMENT '-> exam_questions.id',
    student_answer    TEXT DEFAULT NULL                      COMMENT '学生答案(OCR识别)',
    score             DECIMAL(5,1) DEFAULT NULL              COMMENT '得分',
    max_marks         DECIMAL(5,1) NOT NULL                  COMMENT '满分',
    feedback          TEXT DEFAULT NULL                      COMMENT 'AI/教师反馈',
    graded_by         ENUM('ai','teacher') DEFAULT 'ai'      COMMENT '评分者',
    confidence        FLOAT DEFAULT NULL                     COMMENT 'AI评分置信度',
    created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_paper (student_paper_id),
    INDEX idx_question (question_id),
    UNIQUE KEY uk_paper_question (student_paper_id, question_id),
    FOREIGN KEY (student_paper_id) REFERENCES exam_student_papers(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES exam_questions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
