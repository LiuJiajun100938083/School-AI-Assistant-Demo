#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
考勤系统领域异常

遵循项目统一异常体系 (AppException)，
提供考勤功能专用的业务异常类型。
"""

from app.core.exceptions import AppException


class AttendanceError(AppException):
    """考勤功能基础异常"""

    def __init__(
        self,
        code: str = "ATTENDANCE_ERROR",
        message: str = "考勤功能错误",
        status_code: int = 400,
    ):
        super().__init__(code=code, message=message, status_code=status_code)


class SessionNotFoundError(AttendanceError):
    """点名会话不存在 (404)"""

    def __init__(self, session_id: int = 0):
        message = "点名会话不存在"
        if session_id:
            message = f"点名会话 (id={session_id}) 不存在"
        super().__init__(
            code="SESSION_NOT_FOUND",
            message=message,
            status_code=404,
        )


class StudentNotFoundError(AttendanceError):
    """学生不存在 (404)"""

    def __init__(self, identifier: str = ""):
        message = "学生不存在"
        if identifier:
            message = f"学生 ({identifier}) 不存在"
        super().__init__(
            code="STUDENT_NOT_FOUND",
            message=message,
            status_code=404,
        )


class DuplicateScanError(AttendanceError):
    """重复签到 (409)"""

    def __init__(self, user_login: str = ""):
        message = "该学生已签到"
        if user_login:
            message = f"学生 {user_login} 已签到"
        super().__init__(
            code="DUPLICATE_SCAN",
            message=message,
            status_code=409,
        )


class SessionClosedError(AttendanceError):
    """会话已关闭 (400)"""

    def __init__(self):
        super().__init__(
            code="SESSION_CLOSED",
            message="该点名会话已结束，无法操作",
            status_code=400,
        )


class StudentNotInSessionError(AttendanceError):
    """学生不在该会话名单中 (400)"""

    def __init__(self, user_login: str = ""):
        message = "该学生不在此点名名单中"
        if user_login:
            message = f"学生 {user_login} 不在此点名名单中"
        super().__init__(
            code="STUDENT_NOT_IN_SESSION",
            message=message,
            status_code=400,
        )


class ExcelNotAvailableError(AttendanceError):
    """Excel 导出不可用 (500)"""

    def __init__(self):
        super().__init__(
            code="EXCEL_NOT_AVAILABLE",
            message="Excel导出功能不可用，请安装 openpyxl",
            status_code=500,
        )
