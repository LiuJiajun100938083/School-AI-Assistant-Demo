#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理異常
============
作業系統的業務異常定義。
"""

from app.core.exceptions import AppException


class AssignmentNotFoundError(AppException):
    """作業不存在"""

    def __init__(self, assignment_id: int = None):
        msg = "作業不存在"
        if assignment_id:
            msg = f"作業 (id={assignment_id}) 不存在"
        super().__init__(code="ASSIGNMENT_NOT_FOUND", message=msg, status_code=404)


class SubmissionNotFoundError(AppException):
    """提交不存在"""

    def __init__(self, submission_id: int = None):
        msg = "提交不存在"
        if submission_id:
            msg = f"提交 (id={submission_id}) 不存在"
        super().__init__(code="SUBMISSION_NOT_FOUND", message=msg, status_code=404)


class FileTooLargeError(AppException):
    """文件過大"""

    def __init__(self, max_mb: int = 50):
        super().__init__(
            code="FILE_TOO_LARGE",
            message=f"文件大小超過限制 ({max_mb}MB)",
            status_code=413,
        )


class InvalidFileTypeError(AppException):
    """不支持的文件類型"""

    def __init__(self, ext: str = ""):
        msg = f"不支持的文件類型: {ext}" if ext else "不支持的文件類型"
        super().__init__(code="INVALID_FILE_TYPE", message=msg, status_code=422)


class DeadlinePassedError(AppException):
    """已過截止日期"""

    def __init__(self):
        super().__init__(
            code="DEADLINE_PASSED",
            message="已過截止日期，無法提交",
            status_code=422,
        )


class TooManyFilesError(AppException):
    """文件數量超限"""

    def __init__(self, max_files: int = 5):
        super().__init__(
            code="TOO_MANY_FILES",
            message=f"文件數量超過限制 (最多 {max_files} 個)",
            status_code=422,
        )


class AlreadySubmittedError(AppException):
    """重複提交"""

    def __init__(self):
        super().__init__(
            code="ALREADY_SUBMITTED",
            message="你已經提交過此作業，如需修改請重新提交",
            status_code=409,
        )


class AssignmentNotPublishedError(AppException):
    """作業未發布"""

    def __init__(self):
        super().__init__(
            code="ASSIGNMENT_NOT_PUBLISHED",
            message="作業尚未發布",
            status_code=422,
        )
