"""實用工具 — 領域異常

全部繼承 app.core.exceptions.AppException,由全域錯誤中介層
統一轉為 {success: false, error: {code, message}} 回應。
"""

from app.core.exceptions import AppException


class ToolInputError(AppException):
    """使用者輸入不合法(空、過長、無法編碼)"""

    def __init__(self, code: str, message: str):
        super().__init__(code=code, message=message, status_code=400)


class FileTooLargeError(AppException):
    def __init__(self, code: str, message: str):
        super().__init__(code=code, message=message, status_code=413)


class UnsupportedFormatError(AppException):
    def __init__(self, code: str, message: str):
        super().__init__(code=code, message=message, status_code=400)


class ToolProcessingError(AppException):
    """第三方庫失敗等伺服器端錯誤"""

    def __init__(self, code: str, message: str):
        super().__init__(code=code, message=message, status_code=500)
