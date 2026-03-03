"""
課室日誌 — 異常定義
"""

from app.core.exceptions import AppException


class EntryNotFoundError(AppException):
    """評級記錄不存在"""

    def __init__(self, entry_id: int):
        super().__init__(
            code="ENTRY_NOT_FOUND",
            message=f"評級記錄不存在: {entry_id}",
            status_code=404,
        )


class NotMobileDeviceError(AppException):
    """非移動裝置"""

    def __init__(self):
        super().__init__(
            code="NOT_MOBILE",
            message="請使用手機掃碼填寫",
            status_code=403,
        )


class ReviewAccessDeniedError(AppException):
    """無 Review 查看權限"""

    def __init__(self):
        super().__init__(
            code="REVIEW_ACCESS_DENIED",
            message="您沒有查看課室日誌的權限",
            status_code=403,
        )


class InvalidClassCodeError(AppException):
    """無效的班級代碼"""

    def __init__(self, class_code: str):
        super().__init__(
            code="INVALID_CLASS_CODE",
            message=f"無效的班級代碼: {class_code}",
            status_code=400,
        )
