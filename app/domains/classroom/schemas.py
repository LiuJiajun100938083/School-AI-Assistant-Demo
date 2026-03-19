#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课堂教学 - Pydantic 数据模型

定义所有请求体和响应体的结构化模型，
确保输入验证和接口文档自动生成。
"""

from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field


# ============================================================
# 请求模型
# ============================================================

class CreateRoomRequest(BaseModel):
    """创建房间请求"""
    title: str = Field(
        ...,
        min_length=1,
        max_length=255,
        description="房间标题",
        examples=["第三章 力的合成"],
    )
    description: str = Field(
        default="",
        max_length=1000,
        description="房间描述",
    )
    allowed_classes: List[str] = Field(
        default=[],
        max_length=50,
        description="允许加入的班级列表，留空表示不限制",
        examples=[["7A", "7B"]],
    )


class UpdateRoomStatusRequest(BaseModel):
    """更新房间状态请求"""
    status: Literal["draft", "active", "paused", "ended"] = Field(
        ...,
        description="目标状态: draft(重新開啟), active(开始上课), paused(暂停), ended(结束)",
    )


class UpdateRoomInfoRequest(BaseModel):
    """更新房间基本信息请求"""
    title: Optional[str] = Field(
        default=None,
        min_length=1,
        max_length=255,
        description="房间标题",
    )
    description: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="房间描述",
    )
    allowed_classes: Optional[List[str]] = Field(
        default=None,
        min_length=1,
        max_length=50,
        description="允许加入的班级列表",
    )


# ============================================================
# 响应模型
# ============================================================

class RoomResponse(BaseModel):
    """房间信息响应"""
    room_id: str
    title: str
    description: str = ""
    allowed_classes: List[str]
    room_status: str
    teacher_username: str
    teacher_display_name: str = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    student_count: int = 0


class RoomListItem(BaseModel):
    """房间列表项 (精简信息)"""
    room_id: str
    title: str
    room_status: str
    teacher_username: str
    teacher_display_name: str = ""
    allowed_classes: List[str]
    student_count: int = 0
    created_at: Optional[datetime] = None


class EnrollmentResponse(BaseModel):
    """学生加入记录响应"""
    enrollment_id: str
    room_id: str
    student_username: str
    joined_at: Optional[datetime] = None
    is_active: bool = True


class StudentInRoom(BaseModel):
    """房间内学生信息"""
    student_username: str
    display_name: str = ""
    class_name: str = ""
    is_active: bool = True
    joined_at: Optional[datetime] = None
    last_heartbeat: Optional[datetime] = None


class RoomStudentsResponse(BaseModel):
    """房间学生列表响应"""
    room_id: str
    total: int
    active_count: int
    students: List[StudentInRoom]


# ============================================================
# PPT 相关模型
# ============================================================

class PPTFileResponse(BaseModel):
    """PPT 文件信息响应"""
    file_id: str
    room_id: str
    teacher_username: str
    original_filename: str
    file_size: int = 0
    total_pages: int = 0
    process_status: str = "pending"
    error_message: str = ""
    uploaded_at: Optional[datetime] = None
    processed_at: Optional[datetime] = None


class PPTPageResponse(BaseModel):
    """PPT 单页信息响应"""
    page_id: str
    file_id: str
    page_number: int
    image_url: str = ""
    thumbnail_url: str = ""
    text_content: str = ""


class PPTListResponse(BaseModel):
    """PPT 文件列表响应"""
    room_id: str
    total: int
    files: List[PPTFileResponse]


# ============================================================
# 推送相关模型
# ============================================================

class PushPageRequest(BaseModel):
    """教师推送页面请求"""
    page_id: str = Field(..., description="当前页面 ID")
    page_number: int = Field(..., ge=1, description="当前页码")
    annotations_json: Optional[str] = Field(
        default=None,
        description="Fabric.js Canvas JSON 标注数据",
    )


class PushResponse(BaseModel):
    """推送记录响应"""
    push_id: str
    room_id: str
    page_id: str
    page_number: int
    annotations_json: Optional[str] = None
    pushed_at: Optional[datetime] = None


class PushHistoryResponse(BaseModel):
    """推送历史列表响应"""
    room_id: str
    total: int
    pushes: List[PushResponse]
