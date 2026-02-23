#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
考勤系统常量定义

集中管理所有考勤相关的状态码、类型标识和默认配置值，
避免字符串字面量散落在 service / repository / router 各层。
"""


# ============================================================
# 会话类型
# ============================================================

class SessionType:
    """点名会话类型"""
    MORNING = "morning"
    DETENTION = "detention"

    ALL = (MORNING, DETENTION)


# ============================================================
# 早读 / 留堂 签到状态 (attendance_records.status)
# ============================================================

class AttendanceStatus:
    """签到记录状态"""
    PRESENT = "present"
    LATE = "late"
    VERY_LATE = "very_late"
    ABSENT = "absent"
    DETENTION_ACTIVE = "detention_active"
    DETENTION_COMPLETED = "detention_completed"

    # 中文翻译映射
    LABELS_ZH = {
        PRESENT: "准时",
        LATE: "迟到",
        VERY_LATE: "严重迟到",
        ABSENT: "缺席",
        DETENTION_ACTIVE: "留堂中",
        DETENTION_COMPLETED: "留堂完成",
    }


# ============================================================
# 课外活动 签到/签退状态 (activity_records)
# ============================================================

class ActivityCheckinStatus:
    """课外活动签到状态"""
    ON_TIME = "on_time"
    LATE = "late"
    NOT_ARRIVED = "not_arrived"


class ActivityCheckoutStatus:
    """课外活动签退状态"""
    NORMAL = "normal"
    EARLY = "early"
    NOT_ARRIVED = "not_arrived"
    STILL_HERE = "still_here"


# ============================================================
# 留堂原因
# ============================================================

class DetentionReason:
    """留堂原因代码"""
    HOMEWORK = "homework"
    MORNING = "morning"

    LABELS_ZH = {
        HOMEWORK: "功课",
        MORNING: "晨读",
    }


# ============================================================
# 时间与数量配置
# ============================================================

# 留堂时间计算
MINUTES_PER_PERIOD = 35
MAX_PERIODS = 3
MAX_PLANNED_MINUTES = 180

# 默认时间
DEFAULT_MORNING_TARGET = "07:30"
DEFAULT_LATE_THRESHOLD = "07:40"
DEFAULT_DETENTION_START = "15:30"

# 课外活动默认阈值（分钟）
DEFAULT_ACTIVITY_LATE_THRESHOLD = 10
DEFAULT_ACTIVITY_EARLY_THRESHOLD = 10


# ============================================================
# Excel 导出样式颜色
# ============================================================

class ExcelColors:
    """Excel 导出用颜色值"""
    HEADER_BLUE = "4472C4"
    SUCCESS_GREEN = "92D050"
    WARNING_ORANGE = "FFC000"
    ERROR_RED = "FF0000"
    LIGHT_YELLOW = "FFFDE7"
    LIGHT_GRAY = "F5F5F5"
    WHITE = "FFFFFF"
