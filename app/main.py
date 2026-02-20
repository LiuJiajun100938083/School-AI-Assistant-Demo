#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
FastAPI 应用入口 (新架构)

这是重构后的应用入口点，负责:
1. 初始化日志系统
2. 加载统一配置
3. 创建 FastAPI 应用实例
4. 注册中间件和异常处理器
5. 初始化数据库连接池
6. 初始化安全组件
7. 注册路由 (当前仍挂载旧的 secure_web_main 路由)

使用方式:
    # 开发模式
    python -m app.main

    # 或使用 uvicorn
    uvicorn app.main:app --host 0.0.0.0 --port 8002 --reload
"""

import logging
import os
import sys

# 确保项目根目录在 Python 路径中
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config.settings import get_settings
from app.core.logging_config import setup_logging
from app.core.middleware import (
    CacheControlMiddleware,
    RequestLoggingMiddleware,
    register_exception_handlers,
)
from app.core.dependencies import init_jwt_manager
from app.infrastructure.database import get_database_pool
from app.infrastructure.database.pool import close_database_pool

logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """
    应用工厂函数

    创建并配置 FastAPI 应用实例。
    使用工厂模式便于测试和不同环境的配置。
    """
    # 1. 加载配置
    settings = get_settings()

    # 2. 初始化日志
    log_level = "DEBUG" if settings.server_debug else "INFO"
    setup_logging(
        level=log_level,
        log_dir=os.path.join(str(settings.base_dir), settings.log_dir),
        enable_file_log=settings.is_production(),
    )

    logger.info(f"正在启动 {settings.app_name} v{settings.app_version}")
    logger.info(f"运行环境: {settings.environment}")

    # 3. 创建 FastAPI 应用
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        docs_url="/docs" if not settings.is_production() else None,
        redoc_url="/redoc" if not settings.is_production() else None,
    )

    # 4. 注册中间件
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.get_cors_origins(),
        allow_credentials=settings.cors_allow_credentials,
        allow_methods=settings.cors_allow_methods,
        allow_headers=settings.cors_allow_headers,
    )
    # 缓存控制
    app.add_middleware(CacheControlMiddleware)
    # 请求日志 (仅非生产环境)
    if not settings.is_production():
        app.add_middleware(RequestLoggingMiddleware)

    # 5. 注册全局异常处理器
    register_exception_handlers(app)

    # 6. 生命周期事件
    @app.on_event("startup")
    async def startup():
        """应用启动时初始化"""
        logger.info("=" * 60)
        logger.info(f"  {settings.app_name} v{settings.app_version}")
        logger.info(f"  环境: {settings.environment}")
        logger.info(f"  端口: {settings.server_port}")
        logger.info("=" * 60)

        # 初始化数据库连接池
        try:
            pool = get_database_pool()
            if pool.test_connection():
                logger.info("数据库连接池初始化成功")
            else:
                logger.error("数据库连接测试失败！")
        except Exception as e:
            logger.error(f"数据库初始化失败: {e}")

        # 初始化 JWT 管理器
        jwt_mgr = init_jwt_manager(settings)
        logger.info("JWT 管理器初始化成功")

        # 注入 AI / RAG 函数到服务容器
        try:
            from app.services import get_services
            from llm.services.qa_service import ask_ai_subject
            from llm.services.streaming import stream_ai_subject

            services = get_services()
            services.inject_ai_functions(
                ask_ai=ask_ai_subject,
                ask_ai_stream=stream_ai_subject,
            )
            logger.info("AI 函数已注入服务容器 (ask_ai + stream)")
        except Exception as e:
            logger.warning("AI 函数注入失败（AI 对话功能将不可用）: %s", e)

        # 预加载 Embedding 模型和向量数据库 (避免首次对话卡顿)
        try:
            from llm.rag.retrieval import get_embedding, get_vector_db
            logger.info("正在预加载 Embedding 模型...")
            get_embedding()
            logger.info("Embedding 模型预加载完成")
            get_vector_db()
            logger.info("向量数据库预加载完成")
        except Exception as e:
            logger.warning("预加载 Embedding/向量数据库失败（首次对话时会自动加载）: %s", e)

        # 创建必要目录
        for dir_name in [
            settings.log_dir,
            settings.upload_dir,
            os.path.join(settings.upload_dir, "ppt"),
            settings.user_data_dir,
            "user_backups",
            "security_backups",
        ]:
            dir_path = os.path.join(str(settings.base_dir), dir_name)
            os.makedirs(dir_path, exist_ok=True)

        logger.info("应用启动完成")

    @app.on_event("shutdown")
    async def shutdown():
        """应用关闭时清理"""
        logger.info("正在关闭应用...")
        close_database_pool()
        logger.info("应用已关闭")

    # 7. 健康检查端点
    @app.get("/health")
    async def health_check():
        """健康检查"""
        pool = get_database_pool()
        db_ok = pool.test_connection()
        return {
            "status": "healthy" if db_ok else "degraded",
            "version": settings.app_version,
            "database": "connected" if db_ok else "disconnected",
        }

    @app.get("/api/pool-status")
    async def pool_status():
        """连接池状态 (监控用)"""
        pool = get_database_pool()
        return pool.get_status()

    # 8. 初始化服务容器
    from app.services import init_services
    init_services(settings=settings, jwt_manager=None)
    # JWT manager 在 startup 事件中初始化后会自动可用
    logger.info("ServiceContainer 已创建")

    # 9. 注册新架构路由
    from app.routers import register_all_routers
    register_all_routers(app)

    # 10. 挂载静态文件
    _mount_static_files(app, settings)

    return app


def _mount_static_files(app: FastAPI, settings) -> None:
    """挂载静态文件目录"""
    try:
        static_dir = os.path.join(str(settings.base_dir), "web_static")
        if os.path.exists(static_dir):
            app.mount("/static", StaticFiles(directory=static_dir), name="static")
            logger.info("静态文件目录已挂载: %s", static_dir)

        # 掛載上傳文件目錄（錯題本圖片等）
        uploads_dir = os.path.join(str(settings.base_dir), "uploads")
        os.makedirs(uploads_dir, exist_ok=True)
        app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
        logger.info("上傳文件目錄已掛載: %s", uploads_dir)
    except Exception as e:
        logger.warning("挂载静态文件时出错: %s", e)


# 创建应用实例
app = create_app()


if __name__ == "__main__":
    import uvicorn

    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.server_reload or settings.server_debug,
        workers=settings.server_workers,
        log_level="debug" if settings.server_debug else "info",
    )
