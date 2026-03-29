#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏上传领域异常

遵循项目统一异常体系 (AppException)，
提供游戏上传功能专用的业务异常类型。
"""

from app.core.exceptions import AppException


class GameUploadError(AppException):
    """游戏上传功能基础异常"""

    def __init__(
        self,
        code: str = "GAME_UPLOAD_ERROR",
        message: str = "游戏上传功能错误",
        status_code: int = 400,
    ):
        super().__init__(code=code, message=message, status_code=status_code)


class GameNotFoundError(GameUploadError):
    """游戏不存在 (404)"""

    def __init__(self, game_uuid: str = ""):
        message = "游戏不存在"
        if game_uuid:
            message = f"游戏 ({game_uuid}) 不存在"
        super().__init__(
            code="GAME_NOT_FOUND",
            message=message,
            status_code=404,
        )


class GameAccessDeniedError(GameUploadError):
    """无权访问游戏 (403)"""

    def __init__(self, reason: str = ""):
        message = "无权访问此游戏"
        if reason:
            message = f"无权访问此游戏: {reason}"
        super().__init__(
            code="GAME_ACCESS_DENIED",
            message=message,
            status_code=403,
        )


class InvalidSubjectError(GameUploadError):
    """无效的学科分类 (400)"""

    def __init__(self, subject: str = ""):
        message = "无效的学科分类"
        if subject:
            message = f"无效的学科: {subject}"
        super().__init__(
            code="INVALID_SUBJECT",
            message=message,
            status_code=400,
        )


class GameFileTooLargeError(GameUploadError):
    """文件过大 (400)"""

    def __init__(self, max_size_mb: int = 5):
        super().__init__(
            code="GAME_FILE_TOO_LARGE",
            message=f"文件大小超过限制 ({max_size_mb}MB)",
            status_code=400,
        )


class InvalidFileTypeError(GameUploadError):
    """不支持的文件类型 (400)"""

    def __init__(self, ext: str = ""):
        message = "不支持的文件类型"
        if ext:
            message = f"不支持的文件类型: {ext}"
        super().__init__(
            code="INVALID_FILE_TYPE",
            message=message,
            status_code=400,
        )


class GameGenerationError(GameUploadError):
    """AI 游戏生成失败 (500)"""

    def __init__(self, message: str = "AI 遊戲生成失敗"):
        super().__init__(
            code="GAME_GENERATION_ERROR",
            message=message,
            status_code=500,
        )


class LLMNotConfiguredError(GameUploadError):
    """LLM API 未配置 (503)"""

    def __init__(self):
        super().__init__(
            code="LLM_NOT_CONFIGURED",
            message="AI API 未配置，請聯繫管理員",
            status_code=503,
        )
