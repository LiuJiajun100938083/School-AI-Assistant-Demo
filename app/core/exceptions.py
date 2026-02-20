#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一异常处理模块

定义应用级异常层次结构，替代分散在各处的 HTTPException 和 try-except。
每个异常携带 code、message、status_code，由全局异常处理器统一转换为 JSON 响应。

使用方式:
    from app.core.exceptions import NotFoundError, ValidationError

    # 在 Service 层抛出
    raise NotFoundError("用户", user_id)

    # 在 Router 层由全局处理器自动捕获并返回标准 JSON 响应:
    # {"success": false, "error": {"code": "NOT_FOUND", "message": "用户 (id=123) 不存在"}}
"""

from typing import Any, Dict, Optional


class AppException(Exception):
    """
    应用异常基类

    所有业务异常都应该继承此类。
    全局异常处理器会自动将其转换为标准化 JSON 响应。
    """

    def __init__(
        self,
        code: str = "APP_ERROR",
        message: str = "应用内部错误",
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        super().__init__(self.message)

    def to_dict(self) -> Dict[str, Any]:
        """转换为可序列化的字典"""
        result = {
            "code": self.code,
            "message": self.message,
        }
        if self.details:
            result["details"] = self.details
        return result


# ============================================================
# 认证与授权
# ============================================================

class AuthenticationError(AppException):
    """认证失败 (401)"""

    def __init__(self, message: str = "认证失败，请重新登录"):
        super().__init__(
            code="AUTHENTICATION_FAILED",
            message=message,
            status_code=401,
        )


class TokenExpiredError(AppException):
    """Token 已过期 (401)"""

    def __init__(self):
        super().__init__(
            code="TOKEN_EXPIRED",
            message="登录已过期，请重新登录",
            status_code=401,
        )


class TokenRevokedError(AppException):
    """Token 已被撤销 (401)"""

    def __init__(self):
        super().__init__(
            code="TOKEN_REVOKED",
            message="登录凭证已失效，请重新登录",
            status_code=401,
        )


class AuthorizationError(AppException):
    """权限不足 (403)"""

    def __init__(self, required_role: str = ""):
        message = "权限不足"
        if required_role:
            message = f"需要 {required_role} 权限"
        super().__init__(
            code="AUTHORIZATION_FAILED",
            message=message,
            status_code=403,
        )


class AccountDisabledError(AppException):
    """账户已禁用 (403)"""

    def __init__(self, username: str = ""):
        message = "账户已被禁用"
        if username:
            message = f"账户 {username} 已被禁用"
        super().__init__(
            code="ACCOUNT_DISABLED",
            message=message,
            status_code=403,
        )


class AccountLockedError(AppException):
    """账户已锁定 (423)"""

    def __init__(self, retry_after: int = 0):
        message = "账户已被锁定，请稍后重试"
        if retry_after > 0:
            message = f"账户已被锁定，请 {retry_after} 秒后重试"
        super().__init__(
            code="ACCOUNT_LOCKED",
            message=message,
            status_code=423,
            details={"retry_after": retry_after} if retry_after else {},
        )


# ============================================================
# 数据验证
# ============================================================

class ValidationError(AppException):
    """数据验证失败 (422)"""

    def __init__(self, message: str = "输入数据验证失败", field: str = "", details: Optional[Dict] = None):
        d = details or {}
        if field:
            d["field"] = field
        super().__init__(
            code="VALIDATION_ERROR",
            message=message,
            status_code=422,
            details=d,
        )


class PasswordTooWeakError(ValidationError):
    """密码强度不足 (422)"""

    def __init__(self, reasons: Optional[list] = None):
        super().__init__(
            message="密码不满足安全策略要求",
            field="password",
            details={"reasons": reasons or []},
        )


# ============================================================
# 资源操作
# ============================================================

class NotFoundError(AppException):
    """资源不存在 (404)"""

    def __init__(self, resource: str = "资源", identifier: Any = None):
        message = f"{resource} 不存在"
        if identifier is not None:
            message = f"{resource} (id={identifier}) 不存在"
        super().__init__(
            code="NOT_FOUND",
            message=message,
            status_code=404,
        )


class ConflictError(AppException):
    """资源冲突 (409) - 如用户名重复"""

    def __init__(self, message: str = "资源已存在"):
        super().__init__(
            code="CONFLICT",
            message=message,
            status_code=409,
        )


class RateLimitError(AppException):
    """请求频率限制 (429)"""

    def __init__(self, retry_after: int = 60):
        super().__init__(
            code="RATE_LIMIT_EXCEEDED",
            message=f"请求过于频繁，请 {retry_after} 秒后重试",
            status_code=429,
            details={"retry_after": retry_after},
        )


# ============================================================
# 数据库与外部服务
# ============================================================

class DatabaseError(AppException):
    """数据库操作失败 (500)"""

    def __init__(self, message: str = "数据库操作失败", operation: str = ""):
        details = {"operation": operation} if operation else {}
        super().__init__(
            code="DATABASE_ERROR",
            message=message,
            status_code=500,
            details=details,
        )


class ExternalServiceError(AppException):
    """外部服务调用失败 (502)"""

    def __init__(self, service: str = "外部服务", message: str = ""):
        msg = f"{service} 调用失败"
        if message:
            msg = f"{service}: {message}"
        super().__init__(
            code="EXTERNAL_SERVICE_ERROR",
            message=msg,
            status_code=502,
        )


class LLMServiceError(ExternalServiceError):
    """LLM 服务错误"""

    def __init__(self, message: str = "AI 模型服务暂时不可用"):
        super().__init__(service="LLM", message=message)
