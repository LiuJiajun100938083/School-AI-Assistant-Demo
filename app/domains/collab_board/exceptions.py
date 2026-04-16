"""
協作佈告板 — 領域異常
======================
全部繼承 app.core.exceptions.AppException，由全域錯誤中介層統一
轉為 {success: false, error: {code, message}} 的 JSON 回應。

本檔不含任何業務邏輯；僅定義異常型別 + code + status。
"""

from typing import Any, Dict, Optional

from app.core.exceptions import AppException


# ============================================================
# Board
# ============================================================

class BoardNotFoundError(AppException):
    def __init__(self, board_uuid: str):
        super().__init__(
            code="BOARD_NOT_FOUND",
            message=f"佈告板不存在 (uuid={board_uuid})",
            status_code=404,
        )


class BoardAccessDeniedError(AppException):
    def __init__(self, reason: str = "無權訪問此佈告板"):
        super().__init__(
            code="BOARD_ACCESS_DENIED",
            message=reason,
            status_code=403,
        )


class InvalidLayoutError(AppException):
    def __init__(self, layout: str):
        super().__init__(
            code="INVALID_LAYOUT",
            message=f"不支援的版式: {layout}",
            status_code=400,
        )


class InvalidVisibilityError(AppException):
    def __init__(self, visibility: str):
        super().__init__(
            code="INVALID_VISIBILITY",
            message=f"不支援的可見性: {visibility}",
            status_code=400,
        )


# ============================================================
# Section / Group
# ============================================================

class SectionNotFoundError(AppException):
    def __init__(self, section_id: int):
        super().__init__(
            code="SECTION_NOT_FOUND",
            message=f"分欄不存在 (id={section_id})",
            status_code=404,
        )


class InvalidSectionError(AppException):
    def __init__(self, reason: str):
        super().__init__(
            code="INVALID_SECTION",
            message=reason,
            status_code=400,
        )


# ============================================================
# Post
# ============================================================

class PostNotFoundError(AppException):
    def __init__(self, post_id: Any):
        super().__init__(
            code="POST_NOT_FOUND",
            message=f"貼文不存在 (id={post_id})",
            status_code=404,
        )


class PostStateError(AppException):
    """狀態機非法轉換"""

    def __init__(self, current: Any, event: str, details: Optional[Dict] = None):
        super().__init__(
            code="POST_STATE_ERROR",
            message=f"貼文狀態 {current} 無法執行 '{event}' 事件",
            status_code=409,
            details=details,
        )


# ============================================================
# File upload
# ============================================================

class FileTooLargeError(AppException):
    def __init__(self, size: int, max_size: int):
        super().__init__(
            code="FILE_TOO_LARGE",
            message=f"檔案過大 ({size} bytes)，最大允許 {max_size} bytes",
            status_code=413,
        )


class InvalidFileTypeError(AppException):
    def __init__(self, mime: str):
        super().__init__(
            code="INVALID_FILE_TYPE",
            message=f"不支援的檔案類型: {mime}",
            status_code=400,
        )
