#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
中间件与全局异常处理器

注册到 FastAPI 应用的中间件:
- 全局异常处理器 (将 AppException 转为标准 JSON)
- 安全响应头中间件 (CSP / HSTS / nosniff / X-Frame-Options 等)
- 请求日志中间件
- 缓存控制中间件
"""

import logging
import os
import time
from pathlib import Path
from typing import Callable

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
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


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    安全响应头中间件

    为所有 HTTP 响应添加安全相关头部，防御常见 Web 攻击:
    - X-Content-Type-Options: nosniff          (防止 MIME 类型嗅探)
    - X-Frame-Options: DENY                    (防止点击劫持)
    - Referrer-Policy                          (控制 Referer 泄露)
    - X-XSS-Protection: 0                      (禁用旧版 XSS 过滤器，依赖 CSP)
    - Permissions-Policy                        (禁用不需要的浏览器 API)
    - Content-Security-Policy                   (限制资源加载来源)
    - Strict-Transport-Security                 (强制 HTTPS，仅在 HTTPS 下生效)
    """

    # 默认 CSP：允许自身 + 常用 CDN + 内联样式/脚本（现有 UI 需要）
    DEFAULT_CSP = (
        "default-src 'self'; "
        "script-src 'self' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com "
        "https://cdn.jsdelivr.net https://unpkg.com 'unsafe-inline'; "
        "style-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net "
        "https://fonts.googleapis.com 'unsafe-inline'; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com https://cdn.jsdelivr.net data:; "
        "img-src 'self' data: blob:; "
        "connect-src 'self' ws: wss: https://cdn.jsdelivr.net; "
        "frame-src 'none'; "
        "object-src 'none'; "
        "base-uri 'self'"
    )

    async def dispatch(self, request: Request, call_next: Callable):
        response = await call_next(request)
        path = request.url.path

        # ---- 通用安全头（所有响应） ----
        response.headers["X-Content-Type-Options"] = "nosniff"
        # 上传游戏需要在 iframe 中显示（game_play_shared.html 通过 iframe 嵌入）
        if path.startswith("/uploaded_games/"):
            response.headers["X-Frame-Options"] = "SAMEORIGIN"
        else:
            response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["X-XSS-Protection"] = "0"
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=()"
        )

        # ---- CSP ----
        # 跳过 Swagger UI 路径（需要 eval/inline）
        # 如果路由已设置 CSP（如上传游戏的更严格策略），则不覆盖
        if not path.startswith(("/docs", "/redoc", "/openapi.json")):
            if "content-security-policy" not in {
                k.lower() for k in response.headers.keys()
            }:
                response.headers["Content-Security-Policy"] = self.DEFAULT_CSP

        # ---- HSTS（仅当通过 HTTPS 访问时） ----
        scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
        if scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        return response


# ── Maintenance Mode ────────────────────────────────────────

class MaintenanceModeMiddleware(BaseHTTPMiddleware):
    """
    维护模式中间件。
    当环境变量 MAINTENANCE_MODE=true 时，拦截所有请求并返回 503 维护页面。
    白名单路径（如 /health）不受影响。
    """

    WHITELIST = {"/health", "/api/pool-status"}

    def __init__(self, app, maintenance_html_path: str = None):
        super().__init__(app)
        # 预加载维护页面 HTML
        if maintenance_html_path is None:
            maintenance_html_path = str(
                Path(__file__).resolve().parent.parent.parent
                / "web_static" / "maintenance.html"
            )
        try:
            with open(maintenance_html_path, "r", encoding="utf-8") as f:
                self._html = f.read()
        except FileNotFoundError:
            self._html = "<h1>System under maintenance</h1>"
            logger.warning("maintenance.html not found at %s", maintenance_html_path)

    @staticmethod
    def is_enabled() -> bool:
        return os.environ.get("MAINTENANCE_MODE", "").lower() in ("true", "1", "yes")

    async def dispatch(self, request: Request, call_next: Callable):
        if self.is_enabled() and request.url.path not in self.WHITELIST:
            return HTMLResponse(content=self._html, status_code=503)
        return await call_next(request)


# ── Domain Redirect ────────────────────────────────────────

class DomainRedirectMiddleware(BaseHTTPMiddleware):
    """
    域名跳转中间件。
    当用户访问旧域名时，自动 301 跳转到新域名，保留路径和参数。
    """

    def __init__(self, app):
        super().__init__(app)
        self._redirect_map = {}
        redirect_config = os.environ.get("DOMAIN_REDIRECTS", "")
        # 格式: "旧域名1>新域名1,旧域名2>新域名2"
        for pair in redirect_config.split(","):
            pair = pair.strip()
            if ">" in pair:
                old, new = pair.split(">", 1)
                self._redirect_map[old.strip().lower()] = new.strip()
        if self._redirect_map:
            logger.info("域名跳转已配置: %s", self._redirect_map)

    async def dispatch(self, request: Request, call_next: Callable):
        if self._redirect_map:
            host = (request.headers.get("host") or "").split(":")[0].lower()
            if host in self._redirect_map:
                new_domain = self._redirect_map[host]
                new_url = f"https://{new_domain}{request.url.path}"
                if request.url.query:
                    new_url += f"?{request.url.query}"
                return RedirectResponse(url=new_url, status_code=301)
        return await call_next(request)
