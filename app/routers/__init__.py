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

    logger.info("核心路由已注册: auth, user, chat, classroom, analytics, subject, notice, system, pages, app_modules, learning_task, mistake_book, ai_learning_center, teacher_class, china_game, game_upload, learning_modes, chinese_learning, attendance")

    # ====== 2. 外部模块路由（条件加载） ====== #
    _register_optional_routers(app)

    logger.info("所有路由注册完成")


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

    # 论坛系统
    try:
        from forum_system.api import forum_router
        app.include_router(forum_router)
        logger.info("可选路由已注册: forum_system")
    except Exception as e:
        logger.debug("可选模块未加载: forum_system (%s)", e)
