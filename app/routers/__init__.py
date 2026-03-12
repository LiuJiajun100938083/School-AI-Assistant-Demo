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
    运行数据库 schema 迁移（委托给 MigrationRunner）。
    """
    try:
        from app.infrastructure.database import get_database_pool
        from app.infrastructure.database.migrations.migration_runner import MigrationRunner

        pool = get_database_pool()
        runner = MigrationRunner(pool)
        runner.run_all()
    except Exception as e:
        logger.error("数据库 schema 迁移失败: %s", e)
        raise


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

    # 论坛系统
    try:
        from forum_system.api import forum_router
        app.include_router(forum_router)
        logger.info("可选路由已注册: forum_system")
    except Exception as e:
        logger.debug("可选模块未加载: forum_system (%s)", e)
