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
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    ValidationError,
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

# ===== 常量 ===== #
MINUTES_PER_PERIOD = 35
MAX_PERIODS = 3
MAX_PLANNED_MINUTES = 180

# 默认时间配置
DEFAULT_MORNING_TARGET = "07:30"
DEFAULT_LATE_THRESHOLD = "07:40"
DEFAULT_DETENTION_START = "15:30"


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
            "session_type": "morning",
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
            "session_type": "morning",
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
            "session_type": "detention",
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
            "session_type": "detention",
            "student_count": len(student_logins),
        }

    def detention_checkin(
        self,
        session_id: int,
        card_id: str = None,
        user_login: str = None,
        planned_periods: int = None,
        planned_minutes: int = None,
        scan_time: datetime = None,
    ) -> Dict[str, Any]:
        """
        留堂签到（支持按节或按分钟）

        Args:
            planned_periods: 计划节数 (1/2/3)
            planned_minutes: 计划分钟数 (1-180)
            至少提供其中之一

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
        self._record.create_record({
            "session_id": session_id,
            "user_login": login,
            "card_id": card_id or "MANUAL",
            "scan_time": scan_time.strftime("%Y-%m-%d %H:%M:%S"),
            "status": "detention_active",
            "planned_periods": actual_periods,
            "planned_minutes": planned_minutes,
            "planned_end_time": planned_end_time.strftime("%Y-%m-%d %H:%M:%S"),
        })

        logger.info(
            "留堂签到: session=%d, student=%s, duration=%d min",
            session_id, login, duration_minutes,
        )
        return {
            "student": student,
            "status": "detention_active",
            "planned_end_time": planned_end_time.strftime("%H:%M:%S"),
            "duration_minutes": duration_minutes,
            "planned_periods": actual_periods,
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

        status = "detention_completed" if is_completed else "detention_incomplete"

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
            "actual_minutes": actual_minutes,
            "actual_periods": actual_periods,
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
                    "minutes": periods * MINUTES_PER_PERIOD,
                    "end_time": end_time.strftime("%H:%M"),
                })

            return {
                "action": "need_select_periods",
                "student": student,
                "options": options,
            }

        if record.get("status") == "detention_completed":
            return {
                "action": "already_completed",
                "student": student,
                "message": "该学生已完成留堂",
            }

        if record.get("status") == "detention_active":
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
        if list_type not in ("morning", "detention"):
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

    # ================================================================== #
    #  Part 6: 活动组别管理                                                #
    # ================================================================== #

    def create_activity_group(
        self,
        group_name: str,
        student_logins: List[str],
    ) -> Optional[int]:
        """创建活动组别"""
        return self._activity_group.create_group(group_name, student_logins)

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
        checked_in = sum(1 for r in records if r.get("scan_time"))
        absent = total - checked_in

        session["records"] = records
        session["stats"] = {
            "total": total,
            "checked_in": checked_in,
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
    def _calc_morning_status(
        scan_time: datetime,
        target_time_str: str,
        late_threshold_str: str,
    ) -> Tuple[str, int, int]:
        """
        计算早读签到状态

        Returns:
            (status, late_minutes, makeup_minutes)
        """
        scan_hm = scan_time.hour * 60 + scan_time.minute

        # 解析时间
        t_parts = target_time_str.split(":")
        target_hm = int(t_parts[0]) * 60 + int(t_parts[1])

        l_parts = late_threshold_str.split(":")
        late_hm = int(l_parts[0]) * 60 + int(l_parts[1])

        if scan_hm <= target_hm:
            return "present", 0, 0
        elif scan_hm <= late_hm:
            late_minutes = scan_hm - target_hm
            return "late", late_minutes, late_minutes
        else:
            late_minutes = scan_hm - target_hm
            return "very_late", late_minutes, MINUTES_PER_PERIOD

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
