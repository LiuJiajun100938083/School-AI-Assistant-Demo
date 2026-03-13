"""
课案计划 — 业务异常

遵循项目统一异常体系 (AppException)，
所有 error_code 预定义，统一返回格式。
"""

from app.core.exceptions import AppException


class LessonError(AppException):
    """课案功能基础异常"""

    def __init__(
        self,
        code: str = "LESSON_ERROR",
        message: str = "课案功能错误",
        status_code: int = 400,
    ):
        super().__init__(code=code, message=message, status_code=status_code)


# ── Plan ──────────────────────────────────────────────────

class PlanNotFoundError(LessonError):
    def __init__(self, plan_id: str = ""):
        msg = f"课案 ({plan_id}) 不存在" if plan_id else "课案不存在"
        super().__init__(code="PLAN_NOT_FOUND", message=msg, status_code=404)


class PlanAccessDeniedError(LessonError):
    def __init__(self):
        super().__init__(
            code="PLAN_ACCESS_DENIED",
            message="无权访问该课案",
            status_code=403,
        )


# ── Slide ─────────────────────────────────────────────────

class SlideNotFoundError(LessonError):
    def __init__(self, slide_id: str = ""):
        msg = f"幻灯片 ({slide_id}) 不存在" if slide_id else "幻灯片不存在"
        super().__init__(code="SLIDE_NOT_FOUND", message=msg, status_code=404)


class InvalidSlideConfigError(LessonError):
    def __init__(self, detail: str = ""):
        msg = f"幻灯片配置无效: {detail}" if detail else "幻灯片配置无效"
        super().__init__(code="INVALID_SLIDE_CONFIG", message=msg, status_code=422)


# ── Session ───────────────────────────────────────────────

class SessionNotFoundError(LessonError):
    def __init__(self):
        super().__init__(
            code="SESSION_NOT_FOUND",
            message="当前房间没有活跃的课案",
            status_code=404,
        )


class SessionAlreadyActiveError(LessonError):
    def __init__(self):
        super().__init__(
            code="SESSION_ALREADY_ACTIVE",
            message="该房间已有正在进行的课案",
            status_code=409,
        )


# ── Lifecycle ─────────────────────────────────────────────

class InvalidLifecycleTransitionError(LessonError):
    def __init__(self, current: str = "", action: str = ""):
        if current and action:
            msg = f"当前状态 '{current}' 不允许操作 '{action}'"
        else:
            msg = "当前幻灯片状态不允许此操作"
        super().__init__(
            code="INVALID_LIFECYCLE_TRANSITION",
            message=msg,
            status_code=400,
        )


# ── Response ──────────────────────────────────────────────

class SlideNotAcceptingResponsesError(LessonError):
    def __init__(self):
        super().__init__(
            code="SLIDE_NOT_ACCEPTING_RESPONSES",
            message="当前幻灯片未在接受响应",
            status_code=403,
        )


class AlreadyRespondedError(LessonError):
    def __init__(self):
        super().__init__(
            code="ALREADY_RESPONDED",
            message="你已经提交过响应",
            status_code=409,
        )


# ── Permission ────────────────────────────────────────────

class NotTeacherError(LessonError):
    def __init__(self):
        super().__init__(
            code="NOT_TEACHER",
            message="只有教师可以执行此操作",
            status_code=403,
        )
