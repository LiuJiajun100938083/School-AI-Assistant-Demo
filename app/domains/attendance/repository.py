#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
考勤 Repository

封装所有考勤系统的数据库操作 (100+ 个查询)，替代 attendance_api.py 中
散落在各个端点的直接 SQL 调用。

按子领域组织:
- StudentRepo: 学生信息
- SessionRepo: 考勤场次
- RecordRepo: 打卡记录
- DetentionRepo: 留堂管理
- FixedListRepo: 固定名单
- ActivityRepo: 活动考勤
- ExportRepo: 导出管理
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


# ============================================================
# 考勤学生
# ============================================================

class AttendanceStudentRepository(BaseRepository):
    """
    考勤学生数据 — 已合併至 users 表

    所有查询直接操作 users 表，通过 column alias 保持 API 回传格式不变：
      username → user_login, display_name → chinese_name
    """

    TABLE = "users"  # 已從 attendance_students 合併至 users 表

    # --- 統一 SELECT 片段 ---
    _STUDENT_COLS = (
        "username AS user_login, english_name, display_name AS chinese_name, "
        "class_name, class_number, card_id"
    )

    def find_by_card_id(self, card_id: str) -> Optional[Dict[str, Any]]:
        """根据卡号查找学生（从 users 表）"""
        return self.raw_query_one(
            f"SELECT {self._STUDENT_COLS} FROM users "
            "WHERE card_id = %s AND is_active = TRUE AND role = 'student'",
            (card_id,),
        )

    def find_by_login(self, user_login: str) -> Optional[Dict[str, Any]]:
        """根据登录名查找学生（从 users 表）"""
        return self.raw_query_one(
            f"SELECT {self._STUDENT_COLS} FROM users "
            "WHERE username = %s AND is_active = TRUE",
            (user_login,),
        )

    def list_students(
        self,
        class_name: str = "",
        search: str = "",
    ) -> List[Dict[str, Any]]:
        """查询学生列表（从 users 表）"""
        where = "role = 'student' AND is_active = TRUE"
        params: list = []

        if class_name:
            where += " AND class_name = %s"
            params.append(class_name)
        if search:
            where += (
                " AND (english_name LIKE %s OR display_name LIKE %s OR username LIKE %s)"
            )
            params.extend([f"%{search}%"] * 3)

        return self.raw_query(
            f"SELECT id, class_name, class_number, username AS user_login, "
            f"english_name, display_name AS chinese_name, card_id "
            f"FROM users WHERE {where} "
            "ORDER BY class_name, class_number",
            tuple(params) if params else None,
        )

    def list_classes(self) -> List[str]:
        """获取所有班级名称（从 users 表）"""
        rows = self.raw_query(
            "SELECT DISTINCT class_name FROM users "
            "WHERE role = 'student' AND is_active = TRUE "
            "AND class_name IS NOT NULL AND class_name != '' "
            "ORDER BY class_name"
        )
        return [r["class_name"] for r in rows]

    def deactivate_all(self) -> int:
        """停用所有学生（仅 role='student'，不影响教师/管理员）"""
        return self.raw_execute(
            "UPDATE users SET is_active = FALSE WHERE role = 'student'"
        )

    def upsert_student(self, data: Dict[str, Any]) -> int:
        """
        创建或更新学生（写入 users 表）

        - 已存在 → UPDATE 班级、姓名、卡号等
        - 不存在 → INSERT 新帐号，密码 = hash(username)，must_change_password = TRUE
        """
        existing = self.raw_query_one(
            "SELECT id FROM users WHERE username = %s",
            (data["user_login"],),
        )
        if existing:
            return self.raw_execute(
                "UPDATE users SET "
                "  class_name = %s, class_number = %s, "
                "  english_name = %s, display_name = %s, "
                "  card_id = %s, is_active = TRUE "
                "WHERE username = %s",
                (
                    data["class_name"], data["class_number"],
                    data["english_name"], data["chinese_name"],
                    data.get("card_id", ""),
                    data["user_login"],
                ),
            )
        else:
            # 自动建帐：密码 = username，首次登入需改密码
            from app.core.security import PasswordManager
            password_hash = PasswordManager.hash_password(data["user_login"])
            return self.raw_execute(
                "INSERT INTO users "
                "(username, password_hash, display_name, english_name, card_id, "
                " class_name, class_number, role, is_active, must_change_password, created_at) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, 'student', TRUE, TRUE, NOW())",
                (
                    data["user_login"], password_hash,
                    data["chinese_name"], data["english_name"],
                    data.get("card_id", ""),
                    data["class_name"], data["class_number"],
                ),
            )


# ============================================================
# 考勤场次
# ============================================================

class AttendanceSessionRepository(BaseRepository):
    """考勤场次数据"""

    TABLE = "attendance_sessions"

    def create_session(self, data: Dict[str, Any]) -> Optional[int]:
        """创建考勤场次并返回 ID"""
        return self.insert_get_id({
            "session_type": data["session_type"],
            "session_date": data["session_date"],
            "target_time": data.get("target_time"),
            "late_threshold": data.get("late_threshold", 0),
            "created_by": data["created_by"],
            "notes": data.get("notes", ""),
            "start_time": data.get("start_time"),
            "open_mode": data.get("open_mode", False),
        })

    def get_session(self, session_id: int) -> Optional[Dict[str, Any]]:
        """获取场次详情"""
        return self.find_by_id(session_id)

    def get_session_config(self, session_id: int) -> Optional[Dict[str, Any]]:
        """获取场次配置 (用于打卡计算)"""
        return self.find_one(
            "id = %s",
            (session_id,),
            columns="session_type, target_time, late_threshold, makeup_minutes, open_mode",
        )

    def is_open_mode(self, session_id: int) -> bool:
        """检查是否为开放点名模式"""
        row = self.find_one("id = %s", (session_id,), columns="open_mode")
        return bool(row and row.get("open_mode"))

    def list_sessions(
        self,
        session_type: str = "",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """查询场次列表 (含统计)"""
        where = "1=1"
        params = []
        if session_type:
            where = "s.session_type = %s"
            params.append(session_type)

        return self.raw_query(
            "SELECT s.*, "
            "  COUNT(DISTINCT ss.user_login) as total_students, "
            "  COUNT(DISTINCT ar.user_login) as checked_in "
            "FROM attendance_sessions s "
            "LEFT JOIN attendance_session_students ss ON s.id = ss.session_id "
            "LEFT JOIN attendance_records ar ON s.id = ar.session_id "
            f"WHERE {where} "
            "GROUP BY s.id "
            "ORDER BY s.created_at DESC "
            "LIMIT %s",
            tuple(params) + (limit,),
        )

    def complete_session(self, session_id: int) -> int:
        """完成场次"""
        return self.update(
            {"status": "completed", "end_time": datetime.now()},
            "id = %s",
            (session_id,),
        )

    def add_session_student(self, session_id: int, user_login: str) -> int:
        """添加场次学生"""
        return self.raw_execute(
            "INSERT IGNORE INTO attendance_session_students "
            "(session_id, user_login) VALUES (%s, %s)",
            (session_id, user_login),
        )

    def add_session_students_batch(
        self,
        session_id: int,
        user_logins: List[str],
    ) -> int:
        """批量添加场次学生"""
        if not user_logins:
            return 0
        return self.pool.execute_many(
            "INSERT IGNORE INTO attendance_session_students "
            "(session_id, user_login) VALUES (%s, %s)",
            [(session_id, login) for login in user_logins],
        )

    def is_student_in_session(self, session_id: int, user_login: str) -> bool:
        """检查学生是否在场次中"""
        result = self.raw_query_one(
            "SELECT id FROM attendance_session_students "
            "WHERE session_id = %s AND user_login = %s",
            (session_id, user_login),
        )
        return result is not None

    def get_sessions_filtered(
        self,
        session_type: str = "",
        date: str = "",
        status: str = "active",
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """
        按日期、状态等条件筛选场次列表 (含统计)

        Args:
            session_type: 场次类型筛选
            date: 日期筛选 (YYYY-MM-DD)
            status: 状态筛选 (active / completed)
            limit: 返回数量上限
        """
        clauses = []
        params: List[Any] = []

        if session_type:
            clauses.append("s.session_type = %s")
            params.append(session_type)
        if date:
            clauses.append("s.session_date = %s")
            params.append(date)
        if status:
            clauses.append("s.status = %s")
            params.append(status)

        where = " AND ".join(clauses) if clauses else "1=1"

        return self.raw_query(
            "SELECT s.*, "
            "  COUNT(DISTINCT ss.user_login) as total_students, "
            "  COUNT(DISTINCT ar.user_login) as checked_in "
            "FROM attendance_sessions s "
            "LEFT JOIN attendance_session_students ss ON s.id = ss.session_id "
            "LEFT JOIN attendance_records ar ON s.id = ar.session_id "
            f"WHERE {where} "
            "GROUP BY s.id "
            "ORDER BY s.created_at DESC "
            "LIMIT %s",
            tuple(params) + (limit,),
        )


# ============================================================
# 打卡记录
# ============================================================

class AttendanceRecordRepository(BaseRepository):
    """打卡记录数据"""

    TABLE = "attendance_records"

    def find_record(
        self,
        session_id: int,
        user_login: str,
    ) -> Optional[Dict[str, Any]]:
        """查找打卡记录"""
        return self.find_one(
            "session_id = %s AND user_login = %s",
            (session_id, user_login),
        )

    def record_exists(self, session_id: int, user_login: str) -> bool:
        """检查是否已打卡"""
        return self.exists(
            "session_id = %s AND user_login = %s",
            (session_id, user_login),
        )

    def create_record(self, data: Dict[str, Any]) -> int:
        """创建打卡记录"""
        return self.insert(data)

    def get_session_records(self, session_id: int) -> List[Dict[str, Any]]:
        """
        获取场次的所有学生记录 (含签到信息)

        使用 LEFT JOIN 确保即使未签到的学生也会出现在结果中。
        attendance_status 别名供前端 JS 使用。
        """
        return self.raw_query(
            "SELECT ss.user_login, "
            "  COALESCE(ar.status, 'absent') AS status, "
            "  COALESCE(ar.status, 'absent') AS attendance_status, "
            "  ar.scan_time, ar.card_id, ar.late_minutes, ar.makeup_minutes, "
            "  ar.is_registered, ar.id AS record_id, "
            "  s.class_name, s.class_number, s.english_name, s.display_name AS chinese_name "
            "FROM attendance_session_students ss "
            "JOIN users s ON ss.user_login = s.username "
            "LEFT JOIN attendance_records ar "
            "  ON ar.session_id = ss.session_id AND ar.user_login = ss.user_login "
            "WHERE ss.session_id = %s "
            "ORDER BY s.class_name, s.class_number",
            (session_id,),
        )

    def checkout(
        self,
        record_id: int,
        checkout_time: datetime,
        actual_minutes: int,
        actual_periods: int,
    ) -> int:
        """签退 (留堂用)"""
        return self.raw_execute(
            "UPDATE attendance_records SET "
            "  checkout_time = %s, status = 'detention_completed', "
            "  actual_minutes = %s, actual_periods = %s "
            "WHERE id = %s",
            (checkout_time, actual_minutes, actual_periods, record_id),
        )

    def update_planned_periods(
        self,
        record_id: int,
        planned_periods: int,
        planned_minutes: Optional[int],
        planned_end_time: Optional[datetime],
    ) -> int:
        """修改计划留堂时间"""
        return self.raw_execute(
            "UPDATE attendance_records SET "
            "  planned_periods = %s, planned_minutes = %s, planned_end_time = %s "
            "WHERE id = %s",
            (planned_periods, planned_minutes, planned_end_time, record_id),
        )

    def get_detention_records(self, session_id: int) -> List[Dict[str, Any]]:
        """
        获取留堂场次的详细打卡记录

        包含计划和实际留堂信息，以及留堂原因和签退时间，
        用于留堂场次详情视图。
        """
        return self.raw_query(
            "SELECT ar.id, ar.session_id, ar.user_login, ar.status, ar.scan_time, "
            "  ar.planned_periods, ar.planned_minutes, ar.planned_end_time, "
            "  ar.actual_minutes, ar.actual_periods, ar.checkout_time, "
            "  ar.detention_reason, "
            "  s.class_name, s.class_number, s.english_name, s.display_name AS chinese_name "
            "FROM attendance_records ar "
            "JOIN users s ON ar.user_login = s.username "
            "WHERE ar.session_id = %s "
            "ORDER BY s.class_name, s.class_number",
            (session_id,),
        )

    def update_end_time(
        self,
        record_id: int,
        planned_end_time: str,
        planned_periods: int,
    ) -> int:
        """
        更新打卡记录的计划结束时间和计划节次

        Args:
            record_id: 打卡记录 ID
            planned_end_time: 计划结束时间 (HH:MM 或 HH:MM:SS)
            planned_periods: 计划节次数
        """
        return self.raw_execute(
            "UPDATE attendance_records SET "
            "  planned_end_time = %s, planned_periods = %s "
            "WHERE id = %s",
            (planned_end_time, planned_periods, record_id),
        )


# ============================================================
# 留堂历史
# ============================================================

class DetentionHistoryRepository(BaseRepository):
    """留堂历史数据"""

    TABLE = "detention_history"

    def add_detention(self, data: Dict[str, Any]) -> int:
        """添加留堂记录"""
        return self.insert(data)

    def add_detentions_batch(
        self,
        session_id: int,
        user_logins: List[str],
        created_by: str,
        reason: str = "",
    ) -> int:
        """批量添加留堂记录"""
        if not user_logins:
            return 0
        now = datetime.now().strftime("%Y-%m-%d")
        return self.pool.execute_many(
            "INSERT INTO detention_history "
            "(user_login, session_id, detention_date, created_by, reason) "
            "VALUES (%s, %s, %s, %s, %s)",
            [(login, session_id, now, created_by, reason) for login in user_logins],
        )

    def complete_detention(
        self,
        session_id: int,
        user_login: str,
        duration_minutes: int,
    ) -> int:
        """完成留堂"""
        return self.raw_execute(
            "UPDATE detention_history SET "
            "  completed = TRUE, completed_at = %s, duration_minutes = %s "
            "WHERE session_id = %s AND user_login = %s",
            (datetime.now(), duration_minutes, session_id, user_login),
        )

    def get_history(
        self,
        user_login: str = "",
        class_name: str = "",
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """查询留堂历史"""
        where = "1=1"
        params = []

        if user_login:
            where += " AND dh.user_login = %s"
            params.append(user_login)
        if class_name:
            where += " AND s.class_name = %s"
            params.append(class_name)

        return self.raw_query(
            "SELECT dh.*, s.english_name, s.display_name AS chinese_name, s.class_name, s.class_number, "
            "  ar.planned_minutes, ar.actual_minutes, ar.planned_periods, ar.actual_periods "
            "FROM detention_history dh "
            "JOIN users s ON dh.user_login = s.username "
            "LEFT JOIN attendance_records ar ON dh.session_id = ar.session_id "
            "  AND dh.user_login = ar.user_login "
            f"WHERE {where} "
            "ORDER BY dh.detention_date DESC "
            "LIMIT %s",
            tuple(params) + (limit,),
        )

    def get_student_summary(self, user_login: str) -> Dict[str, Any]:
        """获取学生留堂汇总"""
        return self.raw_query_one(
            "SELECT "
            "  COUNT(*) as total_count, "
            "  SUM(CASE WHEN completed = TRUE THEN 1 ELSE 0 END) as completed_count, "
            "  COALESCE(SUM(duration_minutes), 0) as total_minutes "
            "FROM detention_history WHERE user_login = %s",
            (user_login,),
        ) or {"total_count": 0, "completed_count": 0, "total_minutes": 0}

    def get_history_filtered(
        self,
        user_login: str = "",
        start_date: str = "",
        end_date: str = "",
        completed: Optional[bool] = None,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        """
        按日期范围和完成状态筛选留堂历史

        Args:
            user_login: 学生登录名筛选
            start_date: 起始日期 (YYYY-MM-DD)
            end_date: 截止日期 (YYYY-MM-DD)
            completed: 是否已完成筛选 (None 表示不筛选)
            limit: 返回数量上限
        """
        clauses = []
        params: List[Any] = []

        if user_login:
            clauses.append("dh.user_login = %s")
            params.append(user_login)
        if start_date:
            clauses.append("dh.detention_date >= %s")
            params.append(start_date)
        if end_date:
            clauses.append("dh.detention_date <= %s")
            params.append(end_date)
        if completed is not None:
            clauses.append("dh.completed = %s")
            params.append(completed)

        where = " AND ".join(clauses) if clauses else "1=1"

        return self.raw_query(
            "SELECT dh.*, s.english_name, s.display_name AS chinese_name, s.class_name, s.class_number, "
            "  ar.planned_minutes, ar.actual_minutes, ar.planned_periods, ar.actual_periods "
            "FROM detention_history dh "
            "JOIN users s ON dh.user_login = s.username "
            "LEFT JOIN attendance_records ar ON dh.session_id = ar.session_id "
            "  AND dh.user_login = ar.user_login "
            f"WHERE {where} "
            "ORDER BY dh.detention_date DESC "
            "LIMIT %s",
            tuple(params) + (limit,),
        )


# ============================================================
# 固定名单
# ============================================================

class FixedListRepository(BaseRepository):
    """固定名单数据"""

    TABLE = "attendance_fixed_lists"

    def create_list(
        self,
        list_name: str,
        list_type: str,
        created_by: str,
        user_logins: List[str],
    ) -> Optional[int]:
        """创建固定名单"""
        with self.transaction() as conn:
            cursor = conn.cursor()

            # 创建或更新名单
            cursor.execute(
                "INSERT INTO attendance_fixed_lists (list_name, list_type, created_by) "
                "VALUES (%s, %s, %s) "
                "ON DUPLICATE KEY UPDATE list_type = VALUES(list_type), "
                "updated_at = CURRENT_TIMESTAMP",
                (list_name, list_type, created_by),
            )

            # 获取名单 ID
            cursor.execute(
                "SELECT id FROM attendance_fixed_lists WHERE list_name = %s AND list_type = %s",
                (list_name, list_type),
            )
            row = cursor.fetchone()
            if not row:
                return None
            list_id = row["id"]

            # 清除旧学生并添加新学生
            cursor.execute("DELETE FROM attendance_fixed_list_students WHERE list_id = %s", (list_id,))
            if user_logins:
                cursor.executemany(
                    "INSERT INTO attendance_fixed_list_students (list_id, user_login) VALUES (%s, %s)",
                    [(list_id, login) for login in user_logins],
                )

            return list_id

    def get_lists(self, list_type: str = "") -> List[Dict[str, Any]]:
        """获取名单列表"""
        where = ""
        params = ()
        if list_type:
            where = "WHERE fl.list_type = %s"
            params = (list_type,)

        return self.raw_query(
            "SELECT fl.*, COUNT(fls.user_login) as student_count "
            "FROM attendance_fixed_lists fl "
            "LEFT JOIN attendance_fixed_list_students fls ON fl.id = fls.list_id "
            f"{where} "
            "GROUP BY fl.id "
            "ORDER BY fl.created_at DESC",
            params or None,
        )

    def get_list_detail(self, list_id: int) -> Optional[Dict[str, Any]]:
        """获取名单详情 (含学生)"""
        list_info = self.find_by_id(list_id)
        if not list_info:
            return None

        students = self.raw_query(
            "SELECT s.username AS user_login, s.class_name, s.class_number, "
            "  s.english_name, s.display_name AS chinese_name "
            "FROM attendance_fixed_list_students fls "
            "JOIN users s ON fls.user_login = s.username "
            "WHERE fls.list_id = %s",
            (list_id,),
        )
        list_info["students"] = students
        return list_info

    def delete_list(self, list_id: int) -> int:
        """删除名单"""
        return self.delete("id = %s", (list_id,))

    def get_list_students(self, list_id: int) -> List[str]:
        """获取名单中的学生登录名列表"""
        rows = self.raw_query(
            "SELECT user_login FROM attendance_fixed_list_students WHERE list_id = %s",
            (list_id,),
        )
        return [r["user_login"] for r in rows]

    def update_list(
        self,
        list_id: int,
        list_name: str,
        list_type: str,
        user_logins: List[str],
    ) -> bool:
        """
        更新固定名单 (名称、类型、学生列表)

        在事务中: 更新名单基本信息 -> 清除旧学生 -> 插入新学生。

        Args:
            list_id: 名单 ID
            list_name: 名单名称
            list_type: 名单类型
            user_logins: 学生登录名列表
        Returns:
            是否更新成功
        """
        with self.transaction() as conn:
            cursor = conn.cursor()

            # 更新名单基本信息
            cursor.execute(
                "UPDATE attendance_fixed_lists SET "
                "  list_name = %s, list_type = %s, updated_at = CURRENT_TIMESTAMP "
                "WHERE id = %s",
                (list_name, list_type, list_id),
            )

            # 清除旧学生并添加新学生
            cursor.execute(
                "DELETE FROM attendance_fixed_list_students WHERE list_id = %s",
                (list_id,),
            )
            if user_logins:
                cursor.executemany(
                    "INSERT INTO attendance_fixed_list_students "
                    "(list_id, user_login) VALUES (%s, %s)",
                    [(list_id, login) for login in user_logins],
                )

            return True


# ============================================================
# 活动考勤
# ============================================================

class ActivityGroupRepository(BaseRepository):
    """活动分组数据"""

    TABLE = "activity_groups"

    def list_groups(self) -> List[Dict[str, Any]]:
        """获取活动分组列表"""
        return self.raw_query(
            "SELECT g.id, g.name, g.created_at, "
            "  COUNT(gs.user_login) as student_count "
            "FROM activity_groups g "
            "LEFT JOIN activity_group_students gs ON g.id = gs.group_id "
            "GROUP BY g.id "
            "ORDER BY g.created_at DESC"
        )

    def get_group_detail(self, group_id: int) -> Optional[Dict[str, Any]]:
        """获取分组详情 (含学生)"""
        group = self.find_by_id(group_id)
        if not group:
            return None
        students = self.raw_query(
            "SELECT s.username AS user_login, s.english_name, "
            "  s.display_name AS chinese_name, s.class_name, s.class_number, s.card_id "
            "FROM users s "
            "JOIN activity_group_students gs ON s.username = gs.user_login "
            "WHERE gs.group_id = %s",
            (group_id,),
        )
        group["students"] = students
        return group

    def create_group(
        self,
        name: str,
        created_by: str,
        user_logins: List[str],
    ) -> Optional[int]:
        """创建活动分组"""
        group_id = self.insert_get_id({"name": name, "created_by": created_by})
        if group_id and user_logins:
            self.pool.execute_many(
                "INSERT IGNORE INTO activity_group_students (group_id, user_login) VALUES (%s, %s)",
                [(group_id, login) for login in user_logins],
            )
        return group_id

    def delete_group(self, group_id: int) -> int:
        """删除分组"""
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM activity_group_students WHERE group_id = %s", (group_id,))
            cursor.execute("DELETE FROM activity_groups WHERE id = %s", (group_id,))
            return cursor.rowcount

    def update_group(
        self,
        group_id: int,
        name: str,
        user_logins: List[str],
    ) -> bool:
        """
        更新活动分组 (名称和学生列表)

        在事务中: 更新分组名称 -> 清除旧学生 -> 插入新学生。

        Args:
            group_id: 分组 ID
            name: 分组名称
            user_logins: 学生登录名列表
        Returns:
            是否更新成功
        """
        with self.transaction() as conn:
            cursor = conn.cursor()

            # 更新分组名称
            cursor.execute(
                "UPDATE activity_groups SET name = %s WHERE id = %s",
                (name, group_id),
            )

            # 清除旧学生并添加新学生
            cursor.execute(
                "DELETE FROM activity_group_students WHERE group_id = %s",
                (group_id,),
            )
            if user_logins:
                cursor.executemany(
                    "INSERT INTO activity_group_students "
                    "(group_id, user_login) VALUES (%s, %s)",
                    [(group_id, login) for login in user_logins],
                )

            return True


class ActivitySessionRepository(BaseRepository):
    """活动场次数据"""

    TABLE = "activity_sessions"

    def create_session(self, data: Dict[str, Any], user_logins: List[str]) -> Optional[int]:
        """创建活动场次"""
        session_id = self.insert_get_id(data)
        if session_id and user_logins:
            self.pool.execute_many(
                "INSERT INTO activity_session_students (session_id, user_login) VALUES (%s, %s)",
                [(session_id, login) for login in user_logins],
            )
            self.pool.execute_many(
                "INSERT INTO activity_records (session_id, user_login) VALUES (%s, %s)",
                [(session_id, login) for login in user_logins],
            )
        return session_id

    def get_session_detail(self, session_id: int) -> Optional[Dict[str, Any]]:
        """获取活动场次详情 (含记录)"""
        session = self.find_by_id(session_id)
        if not session:
            return None
        records = self.raw_query(
            "SELECT r.*, s.class_name, s.class_number, s.display_name AS chinese_name, s.english_name "
            "FROM activity_records r "
            "JOIN users s ON r.user_login = s.username "
            "WHERE r.session_id = %s",
            (session_id,),
        )
        session["records"] = records
        return session

    def end_session(self, session_id: int) -> int:
        """结束活动场次"""
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "UPDATE activity_sessions SET status = 'completed' WHERE id = %s",
                (session_id,),
            )
            cursor.execute(
                "UPDATE activity_records SET check_out_status = 'still_here' "
                "WHERE session_id = %s AND check_in_status != 'not_arrived' "
                "AND check_out_status = 'not_arrived'",
                (session_id,),
            )
            return cursor.rowcount

    def activity_checkin(
        self,
        session_id: int,
        user_login: str,
        card_id: str,
        status: str,
        late_minutes: int,
    ) -> int:
        """
        活动签到

        更新 activity_records 中的签到状态。

        Args:
            session_id: 活动场次 ID
            user_login: 学生登录名
            card_id: 刷卡卡号
            status: 签到状态 (on_time / late)
            late_minutes: 迟到分钟数
        Returns:
            影响行数
        """
        return self.raw_execute(
            "UPDATE activity_records SET "
            "  check_in_status = %s, check_in_time = NOW(), "
            "  card_id = %s, late_minutes = %s "
            "WHERE session_id = %s AND user_login = %s",
            (status, card_id, late_minutes, session_id, user_login),
        )

    def activity_checkout(
        self,
        session_id: int,
        user_login: str,
        status: str,
        early_minutes: int,
    ) -> int:
        """
        活动签退

        更新 activity_records 中的签退状态。

        Args:
            session_id: 活动场次 ID
            user_login: 学生登录名
            status: 签退状态 (normal / early_leave)
            early_minutes: 早退分钟数
        Returns:
            影响行数
        """
        return self.raw_execute(
            "UPDATE activity_records SET "
            "  check_out_status = %s, check_out_time = NOW(), "
            "  early_minutes = %s "
            "WHERE session_id = %s AND user_login = %s",
            (status, early_minutes, session_id, user_login),
        )

    def get_activity_record(
        self,
        session_id: int,
        user_login: str,
    ) -> Optional[Dict[str, Any]]:
        """
        获取单条活动打卡记录

        Args:
            session_id: 活动场次 ID
            user_login: 学生登录名
        Returns:
            记录字典或 None
        """
        return self.raw_query_one(
            "SELECT * FROM activity_records "
            "WHERE session_id = %s AND user_login = %s",
            (session_id, user_login),
        )


# ============================================================
# 导出管理
# ============================================================

class AttendanceExportRepository(BaseRepository):
    """考勤导出记录"""

    TABLE = "attendance_exports"

    def save_export(self, data: Dict[str, Any]) -> Optional[int]:
        """保存导出记录"""
        return self.insert_get_id(data)

    def list_exports(
        self,
        created_by: str,
        session_type: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """查询导出列表"""
        where = "created_by = %s AND is_deleted = FALSE"
        params = [created_by]

        if session_type:
            where += " AND session_type = %s"
            params.append(session_type)

        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
            columns=(
                "id, session_id, session_type, session_date, created_by_name, "
                "file_path, file_name, file_size, student_count, present_count, "
                "late_count, absent_count, notes, created_at"
            ),
        )

    def get_export_file(self, export_id: int, created_by: str) -> Optional[Dict[str, Any]]:
        """获取导出文件信息（含 session_id/type 以便文件丢失时重新生成）"""
        return self.find_one(
            "id = %s AND created_by = %s AND is_deleted = FALSE",
            (export_id, created_by),
            columns="id, session_id, session_type, file_path, file_name",
        )

    def soft_delete_export(self, export_id: int, created_by: str) -> int:
        """软删除导出记录"""
        return self.raw_execute(
            "UPDATE attendance_exports SET is_deleted = TRUE, deleted_at = NOW() "
            "WHERE id = %s AND created_by = %s AND is_deleted = FALSE",
            (export_id, created_by),
        )
