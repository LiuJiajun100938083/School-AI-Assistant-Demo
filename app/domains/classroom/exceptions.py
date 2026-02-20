#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课堂教学领域异常

遵循项目统一异常体系 (AppException)，
提供课堂功能专用的业务异常类型。
"""

from app.core.exceptions import AppException


class ClassroomError(AppException):
    """课堂功能基础异常"""

    def __init__(
        self,
        code: str = "CLASSROOM_ERROR",
        message: str = "课堂功能错误",
        status_code: int = 400,
    ):
        super().__init__(code=code, message=message, status_code=status_code)


class RoomNotFoundError(ClassroomError):
    """房间不存在 (404)"""

    def __init__(self, room_id: str = ""):
        message = "教室房间不存在"
        if room_id:
            message = f"教室房间 ({room_id}) 不存在"
        super().__init__(
            code="ROOM_NOT_FOUND",
            message=message,
            status_code=404,
        )


class RoomAccessDeniedError(ClassroomError):
    """无权访问房间 (403)"""

    def __init__(self, reason: str = ""):
        message = "无权访问该教室房间"
        if reason:
            message = f"无权访问该教室房间: {reason}"
        super().__init__(
            code="ROOM_ACCESS_DENIED",
            message=message,
            status_code=403,
        )


class RoomStatusError(ClassroomError):
    """房间状态不允许当前操作 (409)"""

    def __init__(self, current_status: str = "", target_status: str = ""):
        if current_status and target_status:
            message = f"房间状态 '{current_status}' 不能变更为 '{target_status}'"
        else:
            message = "当前房间状态不允许此操作"
        super().__init__(
            code="ROOM_STATUS_INVALID",
            message=message,
            status_code=409,
        )


class EnrollmentError(ClassroomError):
    """学生加入/离开房间相关错误"""

    def __init__(self, message: str = "加入房间失败"):
        super().__init__(
            code="ENROLLMENT_ERROR",
            message=message,
            status_code=400,
        )


class ClassNotAllowedError(ClassroomError):
    """学生所在班级不在允许列表中 (403)"""

    def __init__(self, class_name: str = ""):
        message = "你所在的班级不在该房间的允许范围内"
        if class_name:
            message = f"班级 '{class_name}' 不在该房间的允许范围内"
        super().__init__(
            code="CLASS_NOT_ALLOWED",
            message=message,
            status_code=403,
        )


class PPTError(ClassroomError):
    """PPT 处理相关错误"""

    def __init__(self, message: str = "PPT 处理失败"):
        super().__init__(
            code="PPT_ERROR",
            message=message,
            status_code=400,
        )


class PPTNotFoundError(ClassroomError):
    """PPT 文件不存在 (404)"""

    def __init__(self, file_id: str = ""):
        message = "PPT 文件不存在"
        if file_id:
            message = f"PPT 文件 ({file_id}) 不存在"
        super().__init__(
            code="PPT_NOT_FOUND",
            message=message,
            status_code=404,
        )


class PushError(ClassroomError):
    """推送相关错误"""

    def __init__(self, message: str = "推送失败"):
        super().__init__(
            code="PUSH_ERROR",
            message=message,
            status_code=400,
        )
