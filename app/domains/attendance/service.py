"""
考勤服务层 - AttendanceService
===============================
负责所有考勤相关业务逻辑：
- 学生管理（导入、查询）
- 签到会话管理（早读 / 留堂 / 课外活动）
- 拍卡签到/签退（含智能模式）
- 留堂时间计算（双模式：按节 / 按分钟）
- 固定名单管理
- 活动组别管理
- 导出 Excel 报表
"""

import logging
import uuid
from datetime import datetime, time, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.domains.attendance.constants import (
    MINUTES_PER_PERIOD,
    MAX_PERIODS,
    MAX_PLANNED_MINUTES,
    DEFAULT_MORNING_TARGET,
    DEFAULT_LATE_THRESHOLD,
    DEFAULT_DETENTION_START,
    DEFAULT_ACTIVITY_LATE_THRESHOLD,
    DEFAULT_ACTIVITY_EARLY_THRESHOLD,
    ActivityCheckinStatus,
    ActivityCheckoutStatus,
    AttendanceStatus,
    DetentionReason,
    SessionType,
)
from app.domains.attendance.repository import (
    ActivityGroupRepository,
    ActivitySessionRepository,
    AttendanceExportRepository,
    AttendanceRecordRepository,
    AttendanceSessionRepository,
    AttendanceStudentRepository,
    DetentionHistoryRepository,
    FixedListRepository,
)

logger = logging.getLogger(__name__)


class AttendanceService:
    """
    考勤服务 - 统一管理早读、留堂、课外活动考勤

    职责:
    1. 学生管理（CSV/Excel 导入、查询）
    2. 会话管理（创建/关闭签到会话）
    3. 早读签到（拍卡 + 手动，迟到计算）
    4. 留堂管理（签到/签退/修改时长，双模式）
    5. 课外活动（签到/签退，迟到/早退）
    6. 固定名单 & 活动组别 CRUD
    7. 导出记录（元数据管理）
    """

    def __init__(
        self,
        student_repo: Optional[AttendanceStudentRepository] = None,
        session_repo: Optional[AttendanceSessionRepository] = None,
        record_repo: Optional[AttendanceRecordRepository] = None,
        detention_repo: Optional[DetentionHistoryRepository] = None,
        fixed_list_repo: Optional[FixedListRepository] = None,
        activity_group_repo: Optional[ActivityGroupRepository] = None,
        activity_session_repo: Optional[ActivitySessionRepository] = None,
        export_repo: Optional[AttendanceExportRepository] = None,
        settings: Optional[Settings] = None,
    ):
        self._student = student_repo or AttendanceStudentRepository()
        self._session = session_repo or AttendanceSessionRepository()
        self._record = record_repo or AttendanceRecordRepository()
        self._detention = detention_repo or DetentionHistoryRepository()
        self._fixed_list = fixed_list_repo or FixedListRepository()
        self._activity_group = activity_group_repo or ActivityGroupRepository()
        self._activity_session = activity_session_repo or ActivitySessionRepository()
        self._export = export_repo or AttendanceExportRepository()
        self._settings = settings or get_settings()

    # ================================================================== #
    #  Part 1: 学生管理                                                    #
    # ================================================================== #

    def import_students(
        self,
        rows: List[Dict[str, str]],
        deactivate_existing: bool = True,
    ) -> Dict[str, Any]:
        """
        批量导入学生数据

        Args:
            rows: [{class_name, class_number, user_login, english_name, chinese_name, card_id}]
            deactivate_existing: 是否先停用所有现有学生

        Returns:
            dict: {imported_count, skipped_count}
        """
        if deactivate_existing:
            self._student.deactivate_all()

        imported = 0
        skipped = 0
        for row in rows:
            user_login = (row.get("user_login") or "").strip()
            if not user_login:
                skipped += 1
                continue

            self._student.upsert_student({
                "class_name": (row.get("class_name") or "").strip(),
                "class_number": (row.get("class_number") or "").strip(),
                "user_login": user_login,
                "english_name": (row.get("english_name") or "").strip(),
                "chinese_name": (row.get("chinese_name") or "").strip(),
                "card_id": (row.get("card_id") or "").strip(),
                "is_active": 1,
            })
            imported += 1

        logger.info("学生导入完成: imported=%d, skipped=%d", imported, skipped)
        return {"imported_count": imported, "skipped_count": skipped}

    def list_students(
        self,
        class_name: str = None,
        search: str = None,
    ) -> List[Dict[str, Any]]:
        """查询学生列表（支持班级和搜索过滤）"""
        return self._student.list_students(class_name, search)

    def list_classes(self) -> List[str]:
        """获取所有班级名称"""
        return self._student.list_classes()

    # ================================================================== #
    #  Part 2: 早读签到                                                    #
    # ================================================================== #

    def create_morning_session(
        self,
        student_logins: List[str],
        target_time: str = DEFAULT_MORNING_TARGET,
        late_threshold: str = DEFAULT_LATE_THRESHOLD,
        open_mode: bool = False,
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        创建早读签到会话

        Returns:
            dict: {session_id, session_type, target_time, student_count}
        """
        session_id = self._session.create_session({
            "session_type": SessionType.MORNING,
            "session_date": datetime.now().strftime("%Y-%m-%d"),
            "target_time": target_time,
            "late_threshold": late_threshold,
            "status": "active",
            "open_mode": 1 if open_mode else 0,
            "created_by": created_by,
        })

        if student_logins:
            self._session.add_session_students_batch(session_id, student_logins)

        logger.info("早读会话创建: id=%s, students=%d", session_id, len(student_logins))
        return {
            "session_id": session_id,
            "session_type": SessionType.MORNING,
            "target_time": target_time,
            "student_count": len(student_logins),
        }

    def morning_scan(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        scan_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        早读拍卡/手动签到

        Args:
            session_id: 会话 ID
            card_id: 学生卡号（拍卡模式）
            user_login: 学生登录名（手动模式）
            scan_time: 签到时间（None 则使用当前时间）

        Returns:
            dict: {student, status, late_minutes, makeup_minutes, is_registered}

        Raises:
            NotFoundError: 学生不存在
            ValidationError: 会话无效
        """
        if not scan_time:
            scan_time = datetime.now()

        # 查找学生
        if card_id:
            student = self._student.find_by_card_id(card_id)
            if not student:
                raise NotFoundError("学生（卡号）", card_id)
        elif user_login:
            student = self._student.find_by_login(user_login)
            if not student:
                raise NotFoundError("学生（登录名）", user_login)
        else:
            raise ValidationError("必须提供 card_id 或 user_login")

        # 获取会话配置
        config = self._session.get_session_config(session_id)
        if not config:
            raise NotFoundError("签到会话", session_id)

        login = student.get("user_login")

        # 检查是否已签到
        existing = self._record.find_record(session_id, login)
        if existing and existing.get("scan_time"):
            return {
                "student": student,
                "status": "already_checked_in",
                "message": "该学生已签到",
            }

        # 检查是否在会话名单中
        is_registered = self._session.is_student_in_session(session_id, login)
        if not is_registered:
            if self._session.is_open_mode(session_id):
                self._session.add_session_student(session_id, login)
                is_registered = True
            else:
                raise ValidationError(f"学生 {login} 不在签到名单中")

        # 计算考勤状态
        target_time_str = config.get("target_time", DEFAULT_MORNING_TARGET)
        late_threshold_str = config.get("late_threshold", DEFAULT_LATE_THRESHOLD)
        status, late_minutes, makeup_minutes = self._calc_morning_status(
            scan_time, target_time_str, late_threshold_str,
        )

        # 创建签到记录
        self._record.create_record({
            "session_id": session_id,
            "user_login": login,
            "card_id": card_id or "MANUAL",
            "scan_time": scan_time.strftime("%Y-%m-%d %H:%M:%S"),
            "status": status,
            "late_minutes": late_minutes,
            "makeup_minutes": makeup_minutes,
            "is_registered": 1 if is_registered else 0,
        })

        logger.info(
            "早读签到: session=%d, student=%s, status=%s, late=%d min",
            session_id, login, status, late_minutes,
        )
        return {
            "student": student,
            "status": status,
            "late_minutes": late_minutes,
            "makeup_minutes": makeup_minutes,
            "is_registered": is_registered,
            "scan_time": scan_time.strftime("%H:%M:%S"),
        }

    # ================================================================== #
    #  Part 3: 留堂管理                                                    #
    # ================================================================== #

    def create_detention_session(
        self,
        student_logins: List[str],
        reason: str = "",
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        创建留堂会话

        Returns:
            dict: {session_id, session_type, student_count}
        """
        session_id = self._session.create_session({
            "session_type": SessionType.DETENTION,
            "session_date": datetime.now().strftime("%Y-%m-%d"),
            "target_time": DEFAULT_DETENTION_START,
            "status": "active",
            "created_by": created_by,
        })

        if student_logins:
            self._session.add_session_students_batch(session_id, student_logins)
            # 创建留堂历史记录
            self._detention.add_detentions_batch(
                session_id, student_logins, created_by, reason,
            )

        logger.info("留堂会话创建: id=%s, students=%d", session_id, len(student_logins))
        return {
            "session_id": session_id,
            "session_type": SessionType.DETENTION,
            "student_count": len(student_logins),
        }

    def detention_checkin(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        planned_periods: int = None,
        planned_minutes: int = None,
        detention_reason: str = None,
        scan_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        留堂签到（支持按节或按分钟）

        Args:
            planned_periods: 计划节数 (1/2/3)
            planned_minutes: 计划分钟数 (1-180)
            detention_reason: 留堂原因 ("homework" / "morning")
            至少提供 planned_periods 或 planned_minutes 之一

        Returns:
            dict: {student, status, planned_end_time, duration_minutes}

        Raises:
            ValidationError: 参数无效
        """
        if not scan_time:
            scan_time = datetime.now()

        student = self._find_student(card_id, user_login)
        login = student.get("user_login")

        # 验证参数
        duration_minutes, actual_periods = self._calc_detention_plan(
            planned_periods, planned_minutes,
        )

        planned_end_time = scan_time + timedelta(minutes=duration_minutes)

        # 创建/更新签到记录
        record_data = {
            "session_id": session_id,
            "user_login": login,
            "card_id": card_id or "MANUAL",
            "scan_time": scan_time.strftime("%Y-%m-%d %H:%M:%S"),
            "status": AttendanceStatus.DETENTION_ACTIVE,
            "planned_periods": actual_periods,
            "planned_minutes": planned_minutes,
            "planned_end_time": planned_end_time.strftime("%Y-%m-%d %H:%M:%S"),
        }
        if detention_reason:
            record_data["detention_reason"] = detention_reason
        self._record.create_record(record_data)

        logger.info(
            "留堂签到: session=%d, student=%s, duration=%d min",
            session_id, login, duration_minutes,
        )
        return {
            "student": student,
            "status": AttendanceStatus.DETENTION_ACTIVE,
            "scan_time": scan_time.strftime("%H:%M:%S"),
            "planned_end_time": planned_end_time.strftime("%H:%M:%S"),
            "duration_minutes": duration_minutes,
            "planned_periods": actual_periods,
            "planned_minutes": planned_minutes,
        }

    def detention_checkout(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        checkout_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        留堂签退

        Returns:
            dict: {student, actual_minutes, actual_periods, is_completed, status}

        Raises:
            NotFoundError: 未找到签到记录
        """
        if not checkout_time:
            checkout_time = datetime.now()

        student = self._find_student(card_id, user_login)
        login = student.get("user_login")

        # 查找签到记录
        record = self._record.find_record(session_id, login)
        if not record or not record.get("scan_time"):
            raise NotFoundError("签到记录", f"session={session_id}, user={login}")

        # 计算实际时长
        scan_time = record["scan_time"]
        if isinstance(scan_time, str):
            scan_time = datetime.strptime(scan_time, "%Y-%m-%d %H:%M:%S")

        actual_minutes = max(0, int((checkout_time - scan_time).total_seconds() / 60))
        actual_periods = self._calc_actual_periods(actual_minutes)

        # 判断是否完成
        planned_minutes = record.get("planned_minutes")
        planned_periods = record.get("planned_periods", 0)
        is_completed = self._check_detention_completed(
            actual_minutes, actual_periods, planned_minutes, planned_periods,
        )

        status = AttendanceStatus.DETENTION_COMPLETED if is_completed else "detention_incomplete"

        # 更新记录
        self._record.checkout(
            record_id=record["id"],
            checkout_time=checkout_time.strftime("%Y-%m-%d %H:%M:%S"),
            actual_minutes=actual_minutes,
            actual_periods=actual_periods,
        )

        # 更新留堂历史
        try:
            self._detention.complete_detention(
                session_id, login, actual_minutes,
            )
        except Exception as e:
            logger.warning("更新留堂历史失败: %s", e)

        logger.info(
            "留堂签退: session=%d, student=%s, actual=%d min, completed=%s",
            session_id, login, actual_minutes, is_completed,
        )
        return {
            "student": student,
            "checkout_time": checkout_time.strftime("%H:%M:%S"),
            "actual_minutes": actual_minutes,
            "actual_periods": actual_periods,
            "planned_minutes": planned_minutes,
            "planned_periods": planned_periods,
            "is_completed": is_completed,
            "status": status,
        }

    def detention_smart_scan(
        self,
        session_id: int,
        card_id: str,
    ) -> Dict[str, Any]:
        """
        留堂智能拍卡 - 自动判断签到/签退

        Returns:
            dict: {action, ...}
                action="need_select_periods" → 需要选择时长
                action="checkout" → 已自动签退
                action="already_completed" → 已完成
        """
        student = self._student.find_by_card_id(card_id)
        if not student:
            raise NotFoundError("学生（卡号）", card_id)

        login = student.get("user_login")
        record = self._record.find_record(session_id, login)

        if not record or not record.get("scan_time"):
            # 未签到 → 返回选项让前端选择时长
            now = datetime.now()
            options = []
            for periods in [1, 2, 3]:
                end_time = now + timedelta(minutes=periods * MINUTES_PER_PERIOD)
                options.append({
                    "periods": periods,
                    "duration_minutes": periods * MINUTES_PER_PERIOD,
                    "end_time": end_time.strftime("%H:%M"),
                })

            return {
                "action": "need_select_periods",
                "student": student,
                "options": options,
            }

        if record.get("status") == AttendanceStatus.DETENTION_COMPLETED:
            return {
                "action": "already_completed",
                "student": student,
                "message": "该学生已完成留堂",
            }

        if record.get("status") == AttendanceStatus.DETENTION_ACTIVE:
            # 已签到 → 自动签退
            result = self.detention_checkout(session_id, card_id=card_id)
            result["action"] = "checkout"
            return result

        return {
            "action": "error",
            "student": student,
            "message": f"未知签到状态: {record.get('status')}",
        }

    def modify_detention_periods(
        self,
        session_id: int,
        user_login: str,
        new_periods: int = None,
        new_minutes: int = None,
    ) -> Dict[str, Any]:
        """
        修改留堂时长（正在进行中）

        Raises:
            NotFoundError: 签到记录不存在
            ValidationError: 参数无效
        """
        record = self._record.find_record(session_id, user_login)
        if not record:
            raise NotFoundError("签到记录", f"session={session_id}, user={user_login}")

        duration_minutes, actual_periods = self._calc_detention_plan(
            new_periods, new_minutes,
        )

        scan_time = record.get("scan_time")
        if isinstance(scan_time, str):
            scan_time = datetime.strptime(scan_time, "%Y-%m-%d %H:%M:%S")

        planned_end_time = scan_time + timedelta(minutes=duration_minutes)

        self._record.update_planned_periods(
            record_id=record["id"],
            planned_periods=actual_periods,
            planned_minutes=new_minutes,
            planned_end_time=planned_end_time.strftime("%Y-%m-%d %H:%M:%S"),
        )

        return {
            "planned_periods": actual_periods,
            "planned_minutes": new_minutes or duration_minutes,
            "planned_end_time": planned_end_time.strftime("%H:%M:%S"),
        }

    def modify_detention_end_time(
        self,
        session_id: int,
        user_login: str,
        new_end_time: str,
    ) -> Dict[str, Any]:
        """
        直接设置留堂记录的新结束时间

        Args:
            session_id: 会话 ID
            user_login: 学生登录名
            new_end_time: 新结束时间 (HH:MM 格式)

        Returns:
            dict: {new_end_time, planned_periods, duration_minutes}

        Raises:
            NotFoundError: 签到记录不存在
            ValidationError: 参数无效或留堂已完成
        """
        record = self._record.find_record(session_id, user_login)
        if not record:
            raise NotFoundError("签到记录", f"session={session_id}, user={user_login}")

        if record.get("status") == AttendanceStatus.DETENTION_COMPLETED:
            raise ValidationError("该留堂记录已完成，无法修改结束时间")

        # 解析新结束时间
        try:
            parts = new_end_time.split(":")
            end_hour, end_minute = int(parts[0]), int(parts[1])
            end_time_obj = time(end_hour, end_minute)
        except (ValueError, IndexError):
            raise ValidationError(f"无效的时间格式: {new_end_time}，请使用 HH:MM")

        # 解析签到时间
        scan_time = record["scan_time"]
        if isinstance(scan_time, str):
            scan_time = datetime.strptime(scan_time, "%Y-%m-%d %H:%M:%S")

        # 组合新结束时间 (使用签到日期 + 新结束时间)
        new_end_datetime = datetime.combine(scan_time.date(), end_time_obj)

        # 验证新结束时间 > 签到时间
        if new_end_datetime <= scan_time:
            raise ValidationError("新结束时间必须晚于签到时间")

        # 计算时长和节数
        duration_minutes = int((new_end_datetime - scan_time).total_seconds() / 60)
        planned_periods = max(1, (duration_minutes + MINUTES_PER_PERIOD - 1) // MINUTES_PER_PERIOD)

        # 更新记录
        self._record.update_end_time(
            record_id=record["id"],
            planned_end_time=new_end_datetime.strftime("%Y-%m-%d %H:%M:%S"),
            planned_periods=planned_periods,
        )

        logger.info(
            "留堂结束时间修改: session=%d, user=%s, new_end=%s",
            session_id, user_login, new_end_time,
        )
        return {
            "new_end_time": new_end_datetime.strftime("%H:%M"),
            "planned_periods": planned_periods,
            "duration_minutes": duration_minutes,
        }

    def get_detention_session_detail(self, session_id: int) -> Dict[str, Any]:
        """
        获取留堂会话详情（含剩余时间计算）

        Returns:
            dict: {session, students, stats}
        """
        session = self._session.get_session(session_id)
        if not session:
            raise NotFoundError("签到会话", session_id)

        records = self._record.get_detention_records(session_id)
        now = datetime.now()

        # 为每条活跃记录计算剩余时间
        for record in records:
            if record.get("status") == AttendanceStatus.DETENTION_ACTIVE and record.get("planned_end_time"):
                planned_end = record["planned_end_time"]
                if isinstance(planned_end, str):
                    planned_end = datetime.strptime(planned_end, "%Y-%m-%d %H:%M:%S")

                remaining_seconds = max(0, (planned_end - now).total_seconds())
                record["remaining_seconds"] = remaining_seconds
                record["remaining_display"] = self.format_remaining_time(remaining_seconds)
            else:
                record["remaining_seconds"] = 0
                record["remaining_display"] = ""

        # 统计
        total = len(records)
        active = sum(1 for r in records if r.get("status") == AttendanceStatus.DETENTION_ACTIVE)
        completed = sum(1 for r in records if r.get("status") == AttendanceStatus.DETENTION_COMPLETED)

        return {
            "session": session,
            "students": records,
            "stats": {
                "total": total,
                "active": active,
                "completed": completed,
            },
        }

    # ================================================================== #
    #  Part 4: 课外活动                                                    #
    # ================================================================== #

    def create_activity_session(
        self,
        activity_name: str,
        student_logins: List[str],
        start_time: str = None,
        end_time: str = None,
        late_threshold: int = 10,
        early_threshold: int = 10,
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        创建课外活动签到会话

        Returns:
            dict: {session_id, activity_name, student_count}
        """
        session_id = self._activity_session.create_session({
            "activity_name": activity_name,
            "session_date": datetime.now().strftime("%Y-%m-%d"),
            "start_time": start_time,
            "end_time": end_time,
            "late_threshold": late_threshold,
            "early_threshold": early_threshold,
            "status": "active",
            "created_by": created_by,
            "student_logins": student_logins,
        })

        return {
            "session_id": session_id,
            "activity_name": activity_name,
            "student_count": len(student_logins),
        }

    def activity_scan(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        scan_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        课外活动智能拍卡（签到/签退自动切换）

        Returns:
            dict: {action, student, status, ...}
        """
        if not scan_time:
            scan_time = datetime.now()

        student = self._find_student(card_id, user_login)
        login = student.get("user_login")

        session = self._activity_session.get_session_detail(session_id)
        if not session:
            raise NotFoundError("活动会话", session_id)

        # 检查是否已签到（查活动记录）
        # 此处通过 activity_session_repo 处理
        # 简化：交由路由层调用底层 repository
        return {
            "student": student,
            "session_id": session_id,
            "scan_time": scan_time.strftime("%H:%M:%S"),
        }

    def activity_checkin(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        scan_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        课外活动签到（自动判断签到/签退）

        Args:
            session_id: 活动会话 ID
            card_id: 学生卡号
            user_login: 学生登录名
            scan_time: 签到时间

        Returns:
            dict: {action, student, is_late/is_early, ...}
        """
        if not scan_time:
            scan_time = datetime.now()

        student = self._find_student(card_id, user_login)
        login = student.get("user_login")

        session = self._activity_session.get_session_detail(session_id)
        if not session:
            raise NotFoundError("活动会话", session_id)
        if session.get("status") != "active":
            raise ValidationError("该活动会话已结束")

        # 获取活动记录
        record = self._activity_session.get_activity_record(session_id, login)
        if not record:
            raise NotFoundError("活动记录", f"session={session_id}, user={login}")

        if record.get("check_in_status") == ActivityCheckinStatus.NOT_ARRIVED:
            # ---- 签到 ----
            start_time_raw = session.get("start_time")
            if isinstance(start_time_raw, timedelta):
                # timedelta 转为当天的 datetime
                start_dt = datetime.combine(scan_time.date(), time(0, 0)) + start_time_raw
            elif isinstance(start_time_raw, str) and start_time_raw:
                parts = start_time_raw.split(":")
                start_dt = scan_time.replace(
                    hour=int(parts[0]), minute=int(parts[1]),
                    second=int(parts[2]) if len(parts) > 2 else 0,
                    microsecond=0,
                )
            else:
                start_dt = scan_time

            late_threshold = session.get("late_threshold", 10)
            late_deadline = start_dt + timedelta(minutes=late_threshold)

            if scan_time > late_deadline:
                status = ActivityCheckinStatus.LATE
                late_minutes = int((scan_time - start_dt).total_seconds() / 60)
            else:
                status = ActivityCheckinStatus.ON_TIME
                late_minutes = 0

            self._activity_session.activity_checkin(
                session_id, login, card_id or "MANUAL", status, late_minutes,
            )

            return {
                "action": "checkin",
                "student": student,
                "is_late": status == ActivityCheckinStatus.LATE,
                "late_minutes": late_minutes,
                "time": scan_time.strftime("%H:%M:%S"),
            }
        else:
            # ---- 已签到 → 执行签退 ----
            result = self.activity_checkout(session_id, user_login=login)
            result["action"] = "checkout"
            return result

    def activity_checkout(
        self,
        session_id: int,
        user_login: str,
        checkout_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        课外活动签退

        Args:
            session_id: 活动会话 ID
            user_login: 学生登录名
            checkout_time: 签退时间

        Returns:
            dict: {action, student, is_early, early_minutes, time}

        Raises:
            NotFoundError: 活动记录不存在
            ValidationError: 尚未签到
        """
        if not checkout_time:
            checkout_time = datetime.now()

        student = self._student.find_by_login(user_login)
        if not student:
            raise NotFoundError("学生（登录名）", user_login)

        session = self._activity_session.get_session_detail(session_id)
        if not session:
            raise NotFoundError("活动会话", session_id)

        record = self._activity_session.get_activity_record(session_id, user_login)
        if not record or record.get("check_in_status") == ActivityCheckinStatus.NOT_ARRIVED:
            raise ValidationError("该学生尚未签到，无法签退")

        # 解析活动结束时间
        end_time_raw = session.get("end_time")
        if isinstance(end_time_raw, timedelta):
            end_dt = datetime.combine(checkout_time.date(), time(0, 0)) + end_time_raw
        elif isinstance(end_time_raw, str) and end_time_raw:
            parts = end_time_raw.split(":")
            end_dt = checkout_time.replace(
                hour=int(parts[0]), minute=int(parts[1]),
                second=int(parts[2]) if len(parts) > 2 else 0,
                microsecond=0,
            )
        else:
            end_dt = checkout_time

        early_threshold = session.get("early_threshold", 10)
        early_deadline = end_dt - timedelta(minutes=early_threshold)

        if checkout_time < early_deadline:
            status = ActivityCheckoutStatus.EARLY
            early_minutes = int((end_dt - checkout_time).total_seconds() / 60)
        else:
            status = ActivityCheckoutStatus.NORMAL
            early_minutes = 0

        self._activity_session.activity_checkout(
            session_id, user_login, status, early_minutes,
        )

        logger.info(
            "活动签退: session=%d, user=%s, status=%s, early=%d min",
            session_id, user_login, status, early_minutes,
        )
        return {
            "action": "checkout",
            "student": student,
            "is_early": status == ActivityCheckoutStatus.EARLY,
            "early_minutes": early_minutes,
            "time": checkout_time.strftime("%H:%M:%S"),
        }

    def end_activity_session(self, session_id: int) -> bool:
        """
        结束课外活动会话

        Args:
            session_id: 活动会话 ID

        Returns:
            True
        """
        self._activity_session.end_session(session_id)
        logger.info("活动会话已结束: %d", session_id)
        return True

    # ================================================================== #
    #  Part 5: 固定名单管理                                                #
    # ================================================================== #

    def create_fixed_list(
        self,
        list_name: str,
        list_type: str,
        student_logins: List[str],
        created_by: str = "system",
    ) -> Optional[int]:
        """创建固定名单"""
        if list_type not in SessionType.ALL:
            raise ValidationError(f"无效名单类型: {list_type}")
        return self._fixed_list.create_list(
            list_name, list_type, created_by, student_logins,
        )

    def get_fixed_lists(self, list_type: str = None) -> List[Dict[str, Any]]:
        """获取固定名单列表"""
        return self._fixed_list.get_lists(list_type)

    def get_fixed_list_detail(self, list_id: int) -> Dict[str, Any]:
        """获取固定名单详情"""
        detail = self._fixed_list.get_list_detail(list_id)
        if not detail:
            raise NotFoundError("固定名单", list_id)
        return detail

    def delete_fixed_list(self, list_id: int) -> bool:
        """删除固定名单"""
        self._fixed_list.delete_list(list_id)
        return True

    def update_fixed_list(
        self,
        list_id: int,
        list_name: str,
        list_type: str,
        student_logins: List[str],
    ) -> Dict[str, Any]:
        """
        更新固定名单

        Args:
            list_id: 名单 ID
            list_name: 名单名称
            list_type: 名单类型 (morning / detention)
            student_logins: 学生登录名列表

        Returns:
            dict: {list_id, list_name, list_type, student_count}
        """
        if list_type not in SessionType.ALL:
            raise ValidationError(f"无效名单类型: {list_type}")

        self._fixed_list.update_list(list_id, list_name, list_type, student_logins)
        logger.info("固定名单更新: id=%d, name=%s, students=%d", list_id, list_name, len(student_logins))
        return {
            "list_id": list_id,
            "list_name": list_name,
            "list_type": list_type,
            "student_count": len(student_logins),
        }

    # ================================================================== #
    #  Part 6: 活动组别管理                                                #
    # ================================================================== #

    def create_activity_group(
        self,
        group_name: str,
        student_logins: List[str],
        created_by: str = "",
    ) -> Optional[int]:
        """创建活动组别"""
        return self._activity_group.create_group(group_name, created_by, student_logins)

    def list_activity_groups(self) -> List[Dict[str, Any]]:
        """获取活动组别列表"""
        return self._activity_group.list_groups()

    def get_activity_group_detail(self, group_id: int) -> Dict[str, Any]:
        """获取活动组别详情"""
        detail = self._activity_group.get_group_detail(group_id)
        if not detail:
            raise NotFoundError("活动组别", group_id)
        return detail

    def delete_activity_group(self, group_id: int) -> bool:
        """删除活动组别"""
        self._activity_group.delete_group(group_id)
        return True

    def update_activity_group(
        self,
        group_id: int,
        group_name: str,
        student_logins: List[str],
    ) -> Dict[str, Any]:
        """
        更新活动组别

        Args:
            group_id: 分组 ID
            group_name: 分组名称
            student_logins: 学生登录名列表

        Returns:
            dict: {group_id, group_name, student_count}
        """
        self._activity_group.update_group(group_id, group_name, student_logins)
        logger.info("活动组别更新: id=%d, name=%s, students=%d", group_id, group_name, len(student_logins))
        return {
            "group_id": group_id,
            "group_name": group_name,
            "student_count": len(student_logins),
        }

    # ================================================================== #
    #  Part 7: 查询 & 统计                                                 #
    # ================================================================== #

    def get_session_detail(self, session_id: int) -> Dict[str, Any]:
        """获取签到会话详情（含记录和统计）"""
        session = self._session.get_session(session_id)
        if not session:
            raise NotFoundError("签到会话", session_id)

        records = self._record.get_session_records(session_id)
        total = len(records)
        on_time = sum(1 for r in records if r.get("attendance_status") == "present")
        late = sum(1 for r in records if r.get("attendance_status") == "late")
        very_late = sum(1 for r in records if r.get("attendance_status") == "very_late")
        absent = sum(1 for r in records if r.get("attendance_status", "absent") == "absent")

        session["records"] = records
        session["students"] = records  # 前端 loadSessionDetail 期望 data.students
        session["stats"] = {
            "total": total,
            "on_time": on_time,
            "late": late,
            "very_late": very_late,
            "absent": absent,
        }
        return session

    def get_detention_history(
        self,
        user_login: str = None,
        class_name: str = None,
        start_date: str = None,
        end_date: str = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """查询留堂历史"""
        return self._detention.get_history(
            user_login=user_login,
            class_name=class_name,
            limit=limit,
        )

    def get_detention_summary(self, user_login: str) -> Dict[str, Any]:
        """获取学生留堂汇总"""
        summary = self._detention.get_student_summary(user_login)
        if not summary:
            return {
                "user_login": user_login,
                "total_count": 0,
                "completed_count": 0,
                "total_minutes": 0,
            }
        return summary

    def complete_session(self, session_id: int) -> bool:
        """关闭签到会话"""
        self._session.complete_session(session_id)
        logger.info("签到会话已关闭: %d", session_id)
        return True

    def list_sessions(
        self,
        session_type: str = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取签到会话列表"""
        return self._session.list_sessions(session_type, limit)

    def get_sessions_filtered(
        self,
        session_type: str = None,
        date: str = None,
        status: str = "active",
    ) -> List[Dict[str, Any]]:
        """
        按日期、状态等条件获取签到会话列表

        Args:
            session_type: 会话类型 (morning / detention / activity)
            date: 日期筛选 (YYYY-MM-DD)
            status: 状态筛选 (active / completed)

        Returns:
            list: 签到会话列表
        """
        return self._session.get_sessions_filtered(
            session_type=session_type or "",
            date=date or "",
            status=status or "",
        )

    def get_detention_history_filtered(
        self,
        user_login: str = None,
        start_date: str = None,
        end_date: str = None,
        completed: bool = None,
    ) -> List[Dict[str, Any]]:
        """
        按日期范围和完成状态查询留堂历史

        Args:
            user_login: 学生登录名
            start_date: 开始日期 (YYYY-MM-DD)
            end_date: 结束日期 (YYYY-MM-DD)
            completed: 是否已完成 (True/False/None=全部)

        Returns:
            list: 留堂历史列表
        """
        return self._detention.get_history_filtered(
            user_login=user_login or "",
            start_date=start_date or "",
            end_date=end_date or "",
            completed=completed,
        )

    def init_tables(self) -> None:
        """
        初始化考勤相关数据库表

        委托给 init_attendance_tables() 函数（DDL 操作）。
        注意：该函数定义在路由模块中（使用旧的 get_db() 模式），
        由路由层的 startup 事件直接调用，此方法仅作为 Service 层的兼容入口。
        """
        from app.routers.attendance import init_attendance_tables
        init_attendance_tables()
        logger.info("考勤数据库表初始化完成")

    # ================================================================== #
    #  Part 8: 导出管理                                                    #
    # ================================================================== #

    def save_export(
        self,
        session_id: int,
        session_type: str,
        file_path: str,
        file_size: int,
        created_by: str,
        stats: Dict[str, int] = None,
    ) -> Optional[int]:
        """保存导出记录"""
        data = {
            "session_id": session_id,
            "session_type": session_type,
            "file_path": file_path,
            "file_size": file_size,
            "created_by": created_by,
        }
        if stats:
            data.update(stats)
        return self._export.save_export(data)

    def list_exports(
        self,
        created_by: str,
        session_type: str = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """获取导出列表（分页）"""
        return self._export.list_exports(created_by, session_type, page, page_size)

    def get_export_file(
        self,
        export_id: int,
        created_by: str,
    ) -> Dict[str, Any]:
        """获取导出文件信息"""
        export = self._export.get_export_file(export_id, created_by)
        if not export:
            raise NotFoundError("导出记录", export_id)
        return export

    def delete_export(self, export_id: int, created_by: str) -> bool:
        """软删除导出记录"""
        self._export.soft_delete_export(export_id, created_by)
        return True

    # ================================================================== #
    #  内部辅助方法                                                        #
    # ================================================================== #

    def _find_student(
        self,
        card_id: str = None,
        user_login: str = None,
    ) -> Dict[str, Any]:
        """通过卡号或登录名查找学生"""
        if card_id:
            student = self._student.find_by_card_id(card_id)
            if not student:
                raise NotFoundError("学生（卡号）", card_id)
            return student
        elif user_login:
            student = self._student.find_by_login(user_login)
            if not student:
                raise NotFoundError("学生（登录名）", user_login)
            return student
        else:
            raise ValidationError("必须提供 card_id 或 user_login")

    @staticmethod
    def _time_to_hm(val) -> int:
        """
        将各种时间格式统一转换为 小时*60+分钟 的整数。

        支持:
        - str: "07:30" / "07:30:00"
        - datetime.timedelta: MySQL TIME 列返回的类型
        - datetime.time: Python time 对象
        """
        if isinstance(val, str):
            parts = val.split(":")
            return int(parts[0]) * 60 + int(parts[1])
        elif isinstance(val, timedelta):
            total_seconds = int(val.total_seconds())
            return (total_seconds // 3600) * 60 + (total_seconds % 3600) // 60
        elif isinstance(val, time):
            return val.hour * 60 + val.minute
        else:
            # 回退：尝试 str 转换
            parts = str(val).split(":")
            return int(parts[0]) * 60 + int(parts[1])

    @staticmethod
    def _calc_morning_status(
        scan_time: datetime,
        target_time_str,
        late_threshold_str,
    ) -> Tuple[str, int, int]:
        """
        计算早读签到状态

        Args:
            target_time_str: 目标时间 (str "07:30" 或 timedelta 或 time)
            late_threshold_str: 迟到阈值 (同上)

        Returns:
            (status, late_minutes, makeup_minutes)
        """
        scan_hm = scan_time.hour * 60 + scan_time.minute

        # 解析时间（兼容 str / timedelta / time）
        target_hm = AttendanceService._time_to_hm(target_time_str)
        late_hm = AttendanceService._time_to_hm(late_threshold_str)

        if scan_hm <= target_hm:
            return AttendanceStatus.PRESENT, 0, 0
        elif scan_hm <= late_hm:
            late_minutes = scan_hm - target_hm
            return AttendanceStatus.LATE, late_minutes, late_minutes
        else:
            late_minutes = scan_hm - target_hm
            return AttendanceStatus.VERY_LATE, late_minutes, MINUTES_PER_PERIOD

    @staticmethod
    def _calc_detention_plan(
        planned_periods: int = None,
        planned_minutes: int = None,
    ) -> Tuple[int, int]:
        """
        计算留堂计划时长

        Returns:
            (duration_minutes, actual_periods)

        Raises:
            ValidationError: 参数无效
        """
        if planned_minutes is not None:
            if planned_minutes < 1 or planned_minutes > MAX_PLANNED_MINUTES:
                raise ValidationError(
                    f"留堂分钟数须在 1-{MAX_PLANNED_MINUTES} 之间",
                )
            duration = planned_minutes
            periods = max(1, (planned_minutes + MINUTES_PER_PERIOD - 1) // MINUTES_PER_PERIOD)
            return duration, periods

        if planned_periods is not None:
            if planned_periods < 1 or planned_periods > MAX_PERIODS:
                raise ValidationError(
                    f"留堂节数须在 1-{MAX_PERIODS} 之间",
                )
            duration = planned_periods * MINUTES_PER_PERIOD
            return duration, planned_periods

        raise ValidationError("必须指定 planned_periods 或 planned_minutes")

    @staticmethod
    def _calc_actual_periods(actual_minutes: int) -> int:
        """根据实际分钟数计算实际完成节数"""
        if actual_minutes < MINUTES_PER_PERIOD:
            return 0
        elif actual_minutes < MINUTES_PER_PERIOD * 2:
            return 1
        elif actual_minutes < MINUTES_PER_PERIOD * 3:
            return 2
        else:
            return 3

    @staticmethod
    def _check_detention_completed(
        actual_minutes: int,
        actual_periods: int,
        planned_minutes: Optional[int],
        planned_periods: int,
    ) -> bool:
        """判断留堂是否已完成"""
        if planned_minutes is not None:
            return actual_minutes >= planned_minutes
        return actual_periods >= planned_periods

    @staticmethod
    def format_remaining_time(seconds: float) -> str:
        """格式化剩余时间"""
        if seconds <= 0:
            return "已超时"
        minutes = int(seconds // 60)
        secs = int(seconds % 60)
        return f"{minutes}分{secs}秒"
