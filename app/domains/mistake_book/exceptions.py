"""
錯題本業務異常
"""


class MistakeBookError(Exception):
    """錯題本基礎異常"""
    def __init__(self, message: str, code: str = "MISTAKE_BOOK_ERROR"):
        self.message = message
        self.code = code
        super().__init__(message)


class MistakeNotFoundError(MistakeBookError):
    def __init__(self, mistake_id: str):
        super().__init__(f"錯題不存在: {mistake_id}", "MISTAKE_NOT_FOUND")


class OCRFailedError(MistakeBookError):
    def __init__(self, detail: str = ""):
        super().__init__(f"圖片識別失敗: {detail}", "OCR_FAILED")


class AnalysisFailedError(MistakeBookError):
    def __init__(self, detail: str = ""):
        super().__init__(f"AI 分析失敗: {detail}", "ANALYSIS_FAILED")


class PracticeNotFoundError(MistakeBookError):
    def __init__(self, session_id: str):
        super().__init__(f"練習不存在: {session_id}", "PRACTICE_NOT_FOUND")


class InvalidSubjectError(MistakeBookError):
    def __init__(self, subject: str):
        super().__init__(f"不支持的科目: {subject}", "INVALID_SUBJECT")


class ImageTooLargeError(MistakeBookError):
    def __init__(self, size: int, max_size: int):
        super().__init__(
            f"圖片太大 ({size} bytes)，最大允許 {max_size} bytes",
            "IMAGE_TOO_LARGE",
        )
