"""
路由注册总入口
===============
将所有领域路由统一注册到 FastAPI 应用。

用法:
    from app.routers import register_all_routers
    app = FastAPI()
    register_all_routers(app)
"""

import logging
from fastapi import FastAPI

logger = logging.getLogger(__name__)


def register_all_routers(app: FastAPI) -> None:
    """
    注册所有路由到 FastAPI 应用

    注册顺序:
    1. 核心路由（认证、用户、对话、分析、学科、通知、系统）
    2. 页面路由
    3. 外部模块路由（考勤、论坛、游戏等 - 条件加载）
    """

    # ====== 1. 核心路由 ====== #
    from app.routers.auth import router as auth_router
    from app.routers.user import router as user_router
    from app.routers.chat import router as chat_router
    from app.routers.analytics import router as analytics_router
    from app.routers.subject import router as subject_router
    from app.routers.notice import router as notice_router
    from app.routers.system import router as system_router
    from app.routers.pages import router as pages_router
    from app.routers.app_modules import router as app_modules_router
    from app.routers.classroom import router as classroom_router
    from app.routers.learning_task import router as learning_task_router
    from app.routers.mistake_book import router as mistake_book_router
    from app.routers.ai_learning_center import router as ai_learning_center_router
    from app.routers.teacher_class import router as teacher_class_router
    from app.routers.china_game import router as china_game_router
    from app.routers.game_upload import game_router as game_upload_router
    from app.routers.learning_modes import router as learning_modes_router
    from app.routers.chinese_learning import router as chinese_learning_router
    from app.routers.attendance import router as attendance_router
    from app.routers.school_learning_center import router as school_learning_center_router
    from app.routers.trade_game import trade_game_router
    from app.routers.farm_game import farm_game_router
    from app.routers.assignment import router as assignment_router
    from app.routers.class_diary import router as class_diary_router

    app.include_router(auth_router)
    app.include_router(user_router)
    app.include_router(chat_router)
    app.include_router(classroom_router)
    app.include_router(analytics_router)
    app.include_router(subject_router)
    app.include_router(notice_router)
    app.include_router(system_router)
    app.include_router(pages_router)
    app.include_router(app_modules_router)
    app.include_router(learning_task_router)
    app.include_router(mistake_book_router)
    app.include_router(ai_learning_center_router)
    app.include_router(teacher_class_router)
    app.include_router(china_game_router)
    app.include_router(game_upload_router)
    app.include_router(learning_modes_router)
    app.include_router(chinese_learning_router)
    app.include_router(attendance_router)
    app.include_router(school_learning_center_router)
    app.include_router(trade_game_router)
    app.include_router(farm_game_router)
    app.include_router(assignment_router)
    app.include_router(class_diary_router)

    logger.info("核心路由已注册: auth, user, chat, classroom, analytics, subject, notice, system, pages, app_modules, learning_task, mistake_book, ai_learning_center, teacher_class, china_game, game_upload, learning_modes, chinese_learning, attendance, school_learning_center, trade_game, assignment, class_diary")

    # ====== 2. 数据库迁移 ====== #
    _run_schema_migrations()

    # ====== 3. 外部模块路由（条件加载） ====== #
    _register_optional_routers(app)

    logger.info("所有路由注册完成")


def _run_schema_migrations() -> None:
    """
    运行必要的数据库 schema 迁移。
    每次启动时安全执行（幂等操作）。
    """
    try:
        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()

        # --- 确保 classes 表存在 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS classes (
                class_id    INT AUTO_INCREMENT PRIMARY KEY,
                class_code  VARCHAR(20) UNIQUE NOT NULL   COMMENT '班級代碼，如 S1A',
                class_name  VARCHAR(100) NOT NULL          COMMENT '班級名稱',
                grade       VARCHAR(20)                    COMMENT '年級，如 中一',
                teacher_id  INT                            COMMENT '班主任 → users.id',
                created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 确保 classes 表有 class_code 欄位 ---
        cols = pool.execute("SHOW COLUMNS FROM classes LIKE 'class_code'")
        if not cols:
            pool.execute(
                "ALTER TABLE classes ADD COLUMN class_code VARCHAR(20) "
                "DEFAULT NULL COMMENT '班級代碼' AFTER class_id"
            )
            pool.execute("UPDATE classes SET class_code = class_name WHERE class_code IS NULL")
            try:
                pool.execute("ALTER TABLE classes ADD UNIQUE INDEX idx_class_code (class_code)")
            except Exception:
                pass
            logger.info("数据库迁移: 已为 classes 表添加 class_code 列")

        # --- 确保 classes 表有班主任/副班欄位 ---
        cols = pool.execute("SHOW COLUMNS FROM classes LIKE 'teacher_username'")
        if not cols:
            pool.execute(
                "ALTER TABLE classes ADD COLUMN teacher_username VARCHAR(100) "
                "DEFAULT NULL COMMENT '班主任 username'"
            )
            pool.execute(
                "ALTER TABLE classes ADD COLUMN vice_teacher_username VARCHAR(100) "
                "DEFAULT NULL COMMENT '副班主任 username'"
            )
            logger.info("数据库迁移: 已为 classes 表添加 teacher_username / vice_teacher_username 列")

        # --- 确保 users 表有 class_name 列 ---
        # 代码中广泛使用 class_name（VARCHAR）而非 class_id（INT），
        # 需要在 users 表中添加此列以兼容现有代码逻辑。
        cols = pool.execute("SHOW COLUMNS FROM users LIKE 'class_name'")
        if not cols:
            pool.execute(
                "ALTER TABLE users ADD COLUMN class_name VARCHAR(100) "
                "DEFAULT '' COMMENT '班級名稱' AFTER class_id"
            )
            logger.info("数据库迁移: 已为 users 表添加 class_name 列")

        # --- 作業管理系統表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS assignments (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                title           VARCHAR(255) NOT NULL           COMMENT '作業標題',
                description     TEXT                            COMMENT '作業描述',
                created_by      INT                             COMMENT '教師 user id',
                created_by_name VARCHAR(100)                    COMMENT '教師名',
                target_type     ENUM('all','class','student') DEFAULT 'all' COMMENT '目標類型',
                target_value    VARCHAR(255)                    COMMENT '班級名 或 逗號分隔 username',
                max_score       DECIMAL(5,1) DEFAULT 100        COMMENT '滿分',
                deadline        DATETIME                        COMMENT '截止日期',
                status          ENUM('draft','published','closed') DEFAULT 'draft',
                allow_late      BOOLEAN DEFAULT FALSE           COMMENT '允許逾期',
                max_files       INT DEFAULT 5                   COMMENT '最大文件數',
                published_at    DATETIME                        COMMENT '發布時間',
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_deleted      BOOLEAN DEFAULT FALSE           COMMENT '軟刪除'
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute("""
            CREATE TABLE IF NOT EXISTS assignment_submissions (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id   INT NOT NULL                    COMMENT '作業ID',
                student_id      INT NOT NULL                    COMMENT '學生 user id',
                student_name    VARCHAR(100)                    COMMENT '學生名',
                username        VARCHAR(100)                    COMMENT '用戶名',
                class_name      VARCHAR(100)                    COMMENT '班級',
                content         TEXT                            COMMENT '文字備註',
                status          ENUM('submitted','graded','returned') DEFAULT 'submitted',
                score           DECIMAL(5,1)                    COMMENT '得分',
                feedback        TEXT                            COMMENT '教師評語',
                graded_by       INT                             COMMENT '批改教師 id',
                graded_at       DATETIME                        COMMENT '批改時間',
                is_late         BOOLEAN DEFAULT FALSE           COMMENT '是否逾期',
                submitted_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                UNIQUE KEY uk_assignment_student (assignment_id, student_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute("""
            CREATE TABLE IF NOT EXISTS submission_files (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                submission_id   INT NOT NULL                    COMMENT '提交ID',
                original_name   VARCHAR(255)                    COMMENT '原始文件名',
                stored_name     VARCHAR(255)                    COMMENT 'UUID存儲名',
                file_path       VARCHAR(500)                    COMMENT '相對路徑',
                file_size       BIGINT                          COMMENT '字節數',
                file_type       VARCHAR(20)                     COMMENT '類型: pdf/doc/image/video/code/archive',
                mime_type       VARCHAR(100)                    COMMENT 'MIME 類型',
                INDEX idx_submission (submission_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute("""
            CREATE TABLE IF NOT EXISTS assignment_rubric_items (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id   INT NOT NULL                    COMMENT '作業ID',
                item_order      INT DEFAULT 0                   COMMENT '排序',
                title           VARCHAR(255) NOT NULL           COMMENT '評分項目名',
                max_points      DECIMAL(5,1) NOT NULL           COMMENT '該項滿分',
                INDEX idx_assignment (assignment_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute("""
            CREATE TABLE IF NOT EXISTS submission_rubric_scores (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                submission_id   INT NOT NULL                    COMMENT '提交ID',
                rubric_item_id  INT NOT NULL                    COMMENT '評分項目ID',
                points          DECIMAL(5,1)                    COMMENT '該項得分',
                UNIQUE KEY uk_submission_rubric (submission_id, rubric_item_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 多类型评分标准扩展 ---
        # assignments 表: rubric_type, rubric_config
        cols = pool.execute("SHOW COLUMNS FROM assignments LIKE 'rubric_type'")
        if not cols:
            pool.execute(
                "ALTER TABLE assignments "
                "ADD COLUMN rubric_type VARCHAR(30) DEFAULT 'points' COMMENT '评分类型' AFTER max_score, "
                "ADD COLUMN rubric_config JSON DEFAULT NULL COMMENT '类型配置 JSON' AFTER rubric_type"
            )
            logger.info("数据库迁移: assignments 表添加 rubric_type, rubric_config")

        # assignments 表: assignment_type
        cols = pool.execute("SHOW COLUMNS FROM assignments LIKE 'assignment_type'")
        if not cols:
            pool.execute(
                "ALTER TABLE assignments "
                "ADD COLUMN assignment_type VARCHAR(20) DEFAULT 'file_upload' "
                "COMMENT '作業類型: file_upload/form/exam' AFTER description"
            )
            logger.info("数据库迁移: assignments 表添加 assignment_type")
        else:
            # 確保 assignment_type 是 VARCHAR(20) 而非 ENUM，以支持所有類型 (file_upload/form/exam)
            col_type = cols[0].get("Type", "") if isinstance(cols[0], dict) else ""
            if col_type and "enum" in str(col_type).lower():
                pool.execute(
                    "ALTER TABLE assignments "
                    "MODIFY COLUMN assignment_type VARCHAR(20) DEFAULT 'file_upload' "
                    "COMMENT '作業類型: file_upload/form/exam'"
                )
                logger.info("数据库迁移: assignments.assignment_type 從 ENUM 轉為 VARCHAR(20)")

        # assignment_rubric_items 表: level_definitions, weight
        cols = pool.execute("SHOW COLUMNS FROM assignment_rubric_items LIKE 'level_definitions'")
        if not cols:
            pool.execute(
                "ALTER TABLE assignment_rubric_items "
                "ADD COLUMN level_definitions JSON DEFAULT NULL COMMENT '等级定义 JSON' AFTER max_points, "
                "ADD COLUMN weight DECIMAL(5,2) DEFAULT NULL COMMENT '权重百分比' AFTER level_definitions"
            )
            logger.info("数据库迁移: assignment_rubric_items 表添加 level_definitions, weight")

        # submission_rubric_scores 表: selected_level
        cols = pool.execute("SHOW COLUMNS FROM submission_rubric_scores LIKE 'selected_level'")
        if not cols:
            pool.execute(
                "ALTER TABLE submission_rubric_scores "
                "ADD COLUMN selected_level VARCHAR(100) DEFAULT NULL COMMENT '选择的等级' AFTER points"
            )
            logger.info("数据库迁移: submission_rubric_scores 表添加 selected_level")

        # --- 作业附件表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS assignment_attachments (
                id INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id INT NOT NULL,
                original_name VARCHAR(500) NOT NULL,
                stored_name VARCHAR(500) NOT NULL,
                file_path VARCHAR(1000) NOT NULL,
                file_size BIGINT DEFAULT 0,
                file_type VARCHAR(50) DEFAULT '',
                mime_type VARCHAR(200) DEFAULT '',
                uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_deleted TINYINT(1) DEFAULT 0,
                INDEX idx_attachment_assignment (assignment_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 抄袭检测报告表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS plagiarism_reports (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id   INT NOT NULL                    COMMENT '作業ID',
                status          ENUM('pending','running','completed','failed') DEFAULT 'pending',
                threshold       DECIMAL(5,2) DEFAULT 60.00     COMMENT '相似度閾值',
                subject         VARCHAR(30) DEFAULT ''           COMMENT '科目代碼',
                detect_mode     VARCHAR(20) DEFAULT 'mixed'     COMMENT '作業類型 code/text/mixed',
                total_pairs     INT DEFAULT 0                   COMMENT '對比總對數',
                flagged_pairs   INT DEFAULT 0                   COMMENT '標記可疑對數',
                created_by      INT                             COMMENT '發起教師ID',
                error_message   TEXT                            COMMENT '錯誤資訊',
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at    DATETIME,
                INDEX idx_plag_assignment (assignment_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # 遷移: 為已存在的 plagiarism_reports 表補上 subject / detect_mode 欄位
        cols = pool.execute("SHOW COLUMNS FROM plagiarism_reports LIKE 'subject'")
        if not cols:
            pool.execute(
                "ALTER TABLE plagiarism_reports ADD COLUMN subject VARCHAR(30) "
                "DEFAULT '' COMMENT '科目代碼' AFTER threshold"
            )
            logger.info("数据库迁移: 已为 plagiarism_reports 表添加 subject 列")

        cols = pool.execute("SHOW COLUMNS FROM plagiarism_reports LIKE 'detect_mode'")
        if not cols:
            pool.execute(
                "ALTER TABLE plagiarism_reports ADD COLUMN detect_mode VARCHAR(20) "
                "DEFAULT 'mixed' COMMENT '作業類型 code/text/mixed' AFTER subject"
            )
            logger.info("数据库迁移: 已为 plagiarism_reports 表添加 detect_mode 列")

        # --- 抄袭检测配对表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS plagiarism_pairs (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                report_id       INT NOT NULL                    COMMENT '報告ID',
                submission_a_id INT NOT NULL                    COMMENT '提交A',
                submission_b_id INT NOT NULL                    COMMENT '提交B',
                student_a_name  VARCHAR(100) DEFAULT ''         COMMENT '學生A名',
                student_b_name  VARCHAR(100) DEFAULT ''         COMMENT '學生B名',
                similarity_score DECIMAL(5,2) NOT NULL          COMMENT '相似度 0-100',
                matched_fragments JSON                          COMMENT '匹配片段詳情',
                ai_analysis     TEXT                            COMMENT 'AI 分析說明',
                is_flagged      TINYINT(1) DEFAULT 0            COMMENT '是否標記為可疑',
                INDEX idx_plag_report (report_id),
                INDEX idx_plag_flagged (report_id, is_flagged)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 試卷上傳批次表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS exam_upload_batches (
                id                   INT AUTO_INCREMENT PRIMARY KEY,
                batch_id             VARCHAR(64) NOT NULL UNIQUE   COMMENT 'UUID 批次號',
                subject              VARCHAR(50) NOT NULL           COMMENT '科目',
                status               ENUM('uploading','processing','completed','partial_failed','failed')
                                     DEFAULT 'uploading'            COMMENT '批次聚合狀態',
                total_files          INT DEFAULT 0                  COMMENT '文件總數',
                completed_files      INT DEFAULT 0                  COMMENT '已完成文件數',
                failed_files         INT DEFAULT 0                  COMMENT '失敗文件數',
                total_questions      INT DEFAULT 0                  COMMENT '識別出的總題數',
                low_confidence_count INT DEFAULT 0                  COMMENT '低置信度題數',
                created_by           INT NOT NULL                   COMMENT '上傳教師 user.id',
                created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_batch (batch_id),
                INDEX idx_creator (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 試卷上傳文件表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS exam_upload_files (
                id                INT AUTO_INCREMENT PRIMARY KEY,
                batch_id          VARCHAR(64) NOT NULL              COMMENT '-> exam_upload_batches.batch_id',
                original_filename VARCHAR(255) NOT NULL,
                stored_filename   VARCHAR(255) NOT NULL              COMMENT 'UUID 磁盤文件名',
                file_type         VARCHAR(20) NOT NULL               COMMENT 'image / pdf',
                file_size         INT DEFAULT 0                      COMMENT '字節數',
                total_pages       INT DEFAULT 1                      COMMENT 'PDF 頁數，圖片=1',
                ocr_status        ENUM('pending','processing','completed','failed') DEFAULT 'pending',
                ocr_result        JSON DEFAULT NULL                  COMMENT '識別結果',
                error_message     TEXT DEFAULT NULL,
                processed_at      DATETIME DEFAULT NULL              COMMENT '處理完成時間',
                created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX idx_euf_batch (batch_id),
                INDEX idx_euf_status (ocr_status),
                FOREIGN KEY (batch_id) REFERENCES exam_upload_batches(batch_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 作業題目表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS assignment_questions (
                id                       INT AUTO_INCREMENT PRIMARY KEY,
                assignment_id            INT NOT NULL                   COMMENT '-> assignments.id',
                question_order           INT DEFAULT 0                  COMMENT '排序',
                question_number          VARCHAR(20) DEFAULT ''         COMMENT '原始題號',
                question_text            TEXT NOT NULL                  COMMENT '題目內容',
                answer_text              TEXT                           COMMENT '參考答案',
                answer_source            VARCHAR(20) DEFAULT 'missing'  COMMENT 'extracted/inferred/missing/manual',
                points                   DECIMAL(5,1) DEFAULT NULL      COMMENT '分值',
                question_type            VARCHAR(50) DEFAULT 'open'     COMMENT '題型',
                question_type_confidence FLOAT DEFAULT NULL              COMMENT '題型判斷置信度',
                is_ai_extracted          BOOLEAN DEFAULT TRUE            COMMENT 'AI 識別 vs 手動添加',
                source_batch_id          VARCHAR(64) DEFAULT NULL        COMMENT '來源批次',
                source_page              INT DEFAULT NULL                COMMENT '來源 PDF 頁碼',
                ocr_confidence           FLOAT DEFAULT NULL              COMMENT '識別置信度',
                metadata                 JSON DEFAULT NULL               COMMENT '擴展字段',
                created_at               DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at               DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_aq_assignment (assignment_id),
                INDEX idx_aq_order (assignment_id, question_order),
                FOREIGN KEY (assignment_id) REFERENCES assignments(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 學生作答表 (問卷/試卷用) ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS submission_answers (
                id                  INT AUTO_INCREMENT PRIMARY KEY,
                submission_id       INT NOT NULL,
                question_id         INT NOT NULL,
                answer_text         TEXT                     COMMENT '學生作答',
                is_correct          TINYINT(1) DEFAULT NULL  COMMENT 'MC 自動判定',
                points              DECIMAL(5,1) DEFAULT NULL COMMENT '最終得分',
                ai_points           DECIMAL(5,1) DEFAULT NULL COMMENT 'AI 建議分',
                ai_feedback         TEXT                     COMMENT 'AI 批改反饋',
                teacher_feedback    TEXT                     COMMENT '老師批改反饋',
                score_source        ENUM('auto','ai','teacher') DEFAULT NULL COMMENT '分數來源',
                graded_at           DATETIME DEFAULT NULL,
                reviewed_at         DATETIME DEFAULT NULL    COMMENT '老師覆核時間',
                created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                CONSTRAINT fk_answer_submission
                    FOREIGN KEY (submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE,
                CONSTRAINT fk_answer_question
                    FOREIGN KEY (question_id) REFERENCES assignment_questions(id) ON DELETE CASCADE,
                UNIQUE KEY uk_sub_question (submission_id, question_id),
                INDEX idx_sa_submission (submission_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        # --- 作答附件表 ---
        pool.execute("""
            CREATE TABLE IF NOT EXISTS submission_answer_files (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                answer_id       INT NOT NULL              COMMENT 'submission_answers.id',
                original_name   VARCHAR(500) NOT NULL,
                stored_name     VARCHAR(500) NOT NULL,
                file_path       VARCHAR(1000) NOT NULL,
                file_size       BIGINT DEFAULT 0,
                file_type       VARCHAR(50) DEFAULT '',
                mime_type       VARCHAR(200) DEFAULT '',
                uploaded_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT fk_answer_file_answer
                    FOREIGN KEY (answer_id) REFERENCES submission_answers(id) ON DELETE CASCADE,
                INDEX idx_saf_answer (answer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        logger.info("数据库 schema 迁移完成 (含作業管理表)")
    except Exception as e:
        logger.warning("数据库 schema 迁移失败（非致命）: %s", e)


def _register_optional_routers(app: FastAPI) -> None:
    """
    注册可选的外部模块路由

    这些模块可能不存在于所有部署环境中，
    所以使用 try/except 进行条件加载。
    """

    # 初始化游戏上传系统
    try:
        from app.routers.game_upload import init_game_upload_system
        init_game_upload_system()
    except Exception as e:
        logger.warning("游戏上传系统初始化失败: %s", e)

    # 初始化全球貿易大亨系統
    try:
        from app.routers.trade_game import init_trade_game_system
        init_trade_game_system()
    except Exception as e:
        logger.warning("全球貿易大亨系統初始化失敗: %s", e)

    # 初始化神州菜園經營家系統
    try:
        from app.routers.farm_game import init_farm_game_system
        init_farm_game_system()
    except Exception as e:
        logger.warning("神州菜園經營家系統初始化失敗: %s", e)

    # 初始化課室日誌系統
    try:
        from app.routers.class_diary import init_class_diary_tables
        init_class_diary_tables()
    except Exception as e:
        logger.warning("課室日誌系統初始化失敗: %s", e)

    # 论坛系统
    try:
        from forum_system.api import forum_router
        app.include_router(forum_router)
        logger.info("可选路由已注册: forum_system")
    except Exception as e:
        logger.debug("可选模块未加载: forum_system (%s)", e)
