"""
共享资源库 — API 请求 Pydantic 模型

统一 API 格式：{"success": true/false, "data": {...}, "error_code": "...", "message": "..."}
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ============================================================
# Group — 管理员操作
# ============================================================

class CreateGroupRequest(BaseModel):
    group_name: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)


class UpdateGroupRequest(BaseModel):
    group_name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)


class AddMemberRequest(BaseModel):
    teacher_username: str = Field(..., min_length=1, max_length=100)


# ============================================================
# Share — 教师操作
# ============================================================

class SharePlanRequest(BaseModel):
    plan_id: str = Field(..., min_length=1, max_length=64)
    share_scope: Literal["group", "school"]
    group_id: Optional[str] = Field(default=None, max_length=64)
    subject_tag: str = Field(default="", max_length=50)


class ClonePlanRequest(BaseModel):
    share_id: str = Field(..., min_length=1, max_length=64)
    target_room_id: Optional[str] = Field(default=None, max_length=64)


# ============================================================
# Plan — 资源库备课操作
# ============================================================

class CreatePlanFromLibraryRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
