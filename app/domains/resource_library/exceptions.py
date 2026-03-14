"""
共享资源库 — 业务异常

遵循项目统一异常体系 (AppException)，
所有 error_code 预定义，统一返回格式。
"""

from app.core.exceptions import AppException


class ResourceError(AppException):
    """共享资源库基础异常"""

    def __init__(
        self,
        code: str = "RESOURCE_ERROR",
        message: str = "资源库功能错误",
        status_code: int = 400,
    ):
        super().__init__(code=code, message=message, status_code=status_code)


# ── Group ────────────────────────────────────────────────

class GroupNotFoundError(ResourceError):
    def __init__(self, group_id: str = ""):
        msg = f"教师分组 ({group_id}) 不存在" if group_id else "教师分组不存在"
        super().__init__(
            code="RESOURCE_GROUP_NOT_FOUND", message=msg, status_code=404,
        )


# ── Share ────────────────────────────────────────────────

class ShareNotFoundError(ResourceError):
    def __init__(self, share_id: str = ""):
        msg = f"共享资源 ({share_id}) 不存在" if share_id else "共享资源不存在"
        super().__init__(
            code="RESOURCE_SHARE_NOT_FOUND", message=msg, status_code=404,
        )


class AlreadySharedError(ResourceError):
    def __init__(self):
        super().__init__(
            code="RESOURCE_ALREADY_SHARED",
            message="该课案已在此范围内分享过",
            status_code=409,
        )


# ── Permission ───────────────────────────────────────────

class NotGroupMemberError(ResourceError):
    def __init__(self):
        super().__init__(
            code="RESOURCE_NOT_MEMBER",
            message="你不是该分组的成员",
            status_code=403,
        )


# ── Plan ─────────────────────────────────────────────────

class PlanNotReadyError(ResourceError):
    def __init__(self):
        super().__init__(
            code="RESOURCE_PLAN_NOT_READY",
            message="课案尚未就绪，无法分享",
            status_code=400,
        )
