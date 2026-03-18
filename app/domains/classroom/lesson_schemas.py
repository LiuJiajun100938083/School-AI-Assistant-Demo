"""
课案计划 — API 请求/响应 Pydantic 模型

统一 API 格式：{"success": true/false, "data": {...}, "error_code": "...", "message": "..."}
"""

from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================
# Plan — 请求
# ============================================================

class CreatePlanRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field(default="", max_length=2000)
    room_id: Optional[str] = Field(default=None, max_length=64)


class UpdatePlanRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=2000)
    status: Optional[Literal["draft", "ready", "archived"]] = None


# ============================================================
# Slide — 请求
# ============================================================

class AddSlideRequest(BaseModel):
    slide_type: Literal["ppt", "game", "quiz", "quick_answer", "raise_hand", "poll", "link", "interactive"]
    title: str = Field(default="", max_length=255)
    config: dict = Field(..., description="类型专属配置 (按 slide_type 校验)")
    duration_seconds: int = Field(default=0, ge=0)
    insert_at: Optional[int] = Field(
        default=None,
        ge=0,
        description="插入位置 (None=末尾)",
    )


class UpdateSlideRequest(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    config: Optional[dict] = None
    duration_seconds: Optional[int] = Field(default=None, ge=0)


class ReorderSlidesRequest(BaseModel):
    slide_ids: list[str] = Field(..., min_length=1, description="按新顺序排列的 slide_id 列表")


# ============================================================
# Session — 请求
# ============================================================

class StartSessionRequest(BaseModel):
    plan_id: str = Field(..., description="要使用的课案模板 ID")


class NavigateRequest(BaseModel):
    action: Literal["next", "prev", "goto"] = Field(..., description="导航动作")
    slide_id: Optional[str] = Field(default=None, description="goto 时必填")
    annotations_json: Optional[str] = Field(default=None, description="PPT 标注 JSON")


class SlideActionRequest(BaseModel):
    action: Literal[
        "activate", "open_responses", "close_responses",
        "show_results", "complete",
        "quiz_reveal", "quiz_next",
        "interactive_lock", "interactive_unlock",
    ] = Field(..., description="生命周期动作 (含 quiz/interactive 专属动作)")
    annotations_json: Optional[str] = Field(default=None, description="PPT 标注 JSON (activate 时)")


class PushAnnotationsRequest(BaseModel):
    """推送教师标注 — 不走 lifecycle，仅更新当前 PPT slide 的标注并广播"""
    slide_id: str = Field(..., description="当前 slide ID (必须匹配 session 当前 slide)")
    annotations_json: str = Field(..., description="Fabric.js JSON (含 _canvasRef)")


# ============================================================
# Response — 请求
# ============================================================

class SubmitResponseRequest(BaseModel):
    response_type: Literal[
        "quiz_answer", "quick_answer", "raise_hand", "poll_vote", "game_score",
        "interactive_response",
    ]
    response_data: dict = Field(..., description="响应数据")


# ============================================================
# 响应模型
# ============================================================

class PlanResponse(BaseModel):
    plan_id: str
    title: str
    description: str = ""
    teacher_username: str
    total_slides: int = 0
    status: str = "draft"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SlideResponse(BaseModel):
    slide_id: str
    plan_id: str
    slide_order: int
    slide_type: str
    title: str = ""
    config: dict
    config_version: int = 1
    duration_seconds: int = 0


class PlanWithSlidesResponse(BaseModel):
    plan_id: str
    title: str
    description: str = ""
    teacher_username: str
    total_slides: int = 0
    status: str = "draft"
    slides: list[SlideResponse] = []
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class SessionStateResponse(BaseModel):
    """当前课案运行状态 (用于教师控制和学生重连恢复)"""
    session_id: str
    room_id: str
    plan_id: str
    status: str
    current_slide_id: Optional[str] = None
    current_slide_order: int = -1
    slide_lifecycle: str = "prepared"
    slide_started_at: Optional[datetime] = None
    slide_ends_at: Optional[datetime] = None
    accepting_responses: bool = False
    annotations_json: Optional[str] = None
    current_slide: Optional[SlideResponse] = None
    started_at: Optional[datetime] = None


class SlideResultsResponse(BaseModel):
    slide_id: str
    slide_type: str
    total_responses: int = 0
    results: dict = {}
