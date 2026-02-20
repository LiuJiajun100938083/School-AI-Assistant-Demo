#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中间件与全局异常处理器

注册到 FastAPI 应用的中间件:
- 全局异常处理器 (将 AppException 转为标准 JSON)
- 请求日志中间件
- 缓存控制中间件
"""

import logging
import time
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.exceptions import AppException
from app.core.responses import error_response

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """
    注册全局异常处理器

    将应用异常统一转换为标准化 JSON 响应。
    """

    @app.exception_handler(AppException)
    async def handle_app_exception(request: Request, exc: AppException):
        """处理自定义应用异常"""
        logger.warning(
            f"AppException: {exc.code} - {exc.message} "
            f"[{request.method} {request.url.path}]"
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=error_response(
                code=exc.code,
                message=exc.message,
                details=exc.details if exc.details else None,
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError):
        """处理 Pydantic 请求验证错误"""
        errors = []
        for error in exc.errors():
            field = " -> ".join(str(loc) for loc in error.get("loc", []))
            errors.append(f"{field}: {error.get('msg', '验证失败')}")

        logger.warning(
            f"ValidationError: {errors} [{request.method} {request.url.path}]"
        )
        return JSONResponse(
            status_code=422,
            content=error_response(
                code="VALIDATION_ERROR",
                message="请求参数验证失败",
                details={"errors": errors},
            ),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        """处理未预期的异常 (兜底)"""
        logger.error(
            f"UnexpectedError: {type(exc).__name__}: {exc} "
            f"[{request.method} {request.url.path}]",
            exc_info=True,
        )
        return JSONResponse(
            status_code=500,
            content=error_response(
                code="INTERNAL_ERROR",
                message="服务器内部错误，请稍后重试",
            ),
        )


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    请求日志中间件

    记录每个请求的方法、路径、状态码和耗时。
    """

    async def dispatch(self, request: Request, call_next: Callable):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time

        # 跳过静态资源和健康检查
        path = request.url.path
        if not (path.startswith("/static") or path == "/health"):
            logger.info(
                f"{request.method} {path} -> {response.status_code} "
                f"({duration:.3f}s)"
            )

        return response


class CacheControlMiddleware(BaseHTTPMiddleware):
    """
    缓存控制中间件

    对静态资源路径添加无缓存头。
    """

    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)

        if request.url.path.startswith("/static"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"

        return response
