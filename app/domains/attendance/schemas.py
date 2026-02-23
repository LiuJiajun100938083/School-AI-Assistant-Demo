#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
考勤系统 - 数据模型

请求/响应的 Pydantic 模型，从 attendance router 中提取。
"""

from typing import List, Optional

from pydantic import BaseModel


# ==================================================================================
#                              早读/留堂 请求模型
# ==================================================================================

class AttendanceSession(BaseModel):
    """创建点名会话"""
    session_type: str  # 'morning' 或 'detention'
    session_date: str  # YYYY-MM-DD
    student_ids: List[str]  # UserLogin 列表
    notes: Optional[str] = None
    open_mode: Optional[bool] = False  # 开放点名模式


class CardScanRequest(BaseModel):
    """拍卡签到请求"""
    session_id: int
    card_id: str


class ManualScanRequest(BaseModel):
    """手动签到请求（忘带卡）"""
    session_id: int
    user_login: str


class DetentionCheckinRequest(BaseModel):
    """留堂签到请求"""
    session_id: int
    card_id: str
    planned_periods: Optional[int] = None
    planned_minutes: Optional[int] = None
    detention_reason: Optional[str] = None


class DetentionManualCheckinRequest(BaseModel):
    """留堂手动签到请求"""
    session_id: int
    user_login: str
    planned_periods: Optional[int] = None
    planned_minutes: Optional[int] = None
    detention_reason: Optional[str] = None


class ModifyPeriodsRequest(BaseModel):
    """修改留堂节数/分钟数"""
    session_id: int
    user_login: str
    new_periods: Optional[int] = None
    new_minutes: Optional[int] = None


class ModifyEndTimeRequest(BaseModel):
    """修改留堂结束时间"""
    session_id: int
    user_login: str
    new_end_time: str  # HH:MM


# ==================================================================================
#                              固定名单 请求模型
# ==================================================================================

class FixedListRequest(BaseModel):
    """固定名单请求"""
    list_name: str
    student_ids: List[str]
    list_type: str = 'morning'


# ==================================================================================
#                              课外活动 请求模型
# ==================================================================================

class ActivitySessionRequest(BaseModel):
    """课外活动会话请求"""
    session_date: str  # YYYY-MM-DD
    activity_name: str
    start_time: str  # HH:MM
    end_time: str  # HH:MM
    late_threshold: int = 10
    early_threshold: int = 10
    student_ids: List[str]


class ActivityScanRequest(BaseModel):
    """课外活动扫描请求"""
    session_id: int
    card_id: str


class ActivityCheckoutRequest(BaseModel):
    """课外活动签退请求"""
    session_id: int
    user_login: str


class ActivityGroupRequest(BaseModel):
    """课外活动固定组别请求"""
    name: str
    student_ids: List[str]


# ==================================================================================
#                              学生信息模型
# ==================================================================================

class StudentInfo(BaseModel):
    """学生信息"""
    class_name: str
    class_number: int
    user_login: str
    english_name: str
    chinese_name: str
    card_id: str
