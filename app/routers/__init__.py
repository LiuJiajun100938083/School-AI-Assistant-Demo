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
                total_pairs     INT DEFAULT 0                   COMMENT '對比總對數',
                flagged_pairs   INT DEFAULT 0                   COMMENT '標記可疑對數',
                created_by      INT                             COMMENT '發起教師ID',
                error_message   TEXT                            COMMENT '錯誤資訊',
                created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at    DATETIME,
                INDEX idx_plag_assignment (assignment_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

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
