#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课堂教学 - Repository 层

封装课堂教学所有表的数据库操作:
- ClassroomRoomRepository: 教室房间
- ClassroomEnrollmentRepository: 学生加入记录
- PPTFileRepository: PPT 文件
- PPTPageRepository: PPT 单页
- ClassroomPushRepository: 教师推送快照

遵循项目 BaseRepository 模式，通过参数化查询防止 SQL 注入。
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class ClassroomRoomRepository(BaseRepository):
    """教室房间 Repository"""

    TABLE = "classroom_rooms"

    # ============================================================
    # 查询
    # ============================================================

    def get_by_room_id(self, room_id: str) -> Optional[Dict[str, Any]]:
        """根据 room_id 查询房间 (排除已删除)"""
        return self.find_one(
            "room_id = %s AND is_deleted = FALSE",
            (room_id,),
        )

    def list_teacher_rooms(
        self,
        teacher_username: str,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """查询教师创建的所有房间"""
        where = "teacher_username = %s AND is_deleted = FALSE"
        params: list = [teacher_username]

        if status:
            where += " AND room_status = %s"
            params.append(status)

        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
        )

    def list_rooms_for_class(
        self,
        class_name: str,
    ) -> List[Dict[str, Any]]:
        """
        查询对某班级可见的活跃房间

        allowed_classes 为空数组时表示不限制班级，对所有学生可见。
        否则使用 JSON_CONTAINS 匹配。
        """
        return self.find_all(
            where=(
                "(JSON_LENGTH(allowed_classes) = 0 OR JSON_CONTAINS(allowed_classes, %s)) "
                "AND room_status IN ('active', 'paused') "
                "AND is_deleted = FALSE"
            ),
            params=(json.dumps(class_name),),
            order_by="created_at DESC",
        )

    def get_room_with_student_count(
        self,
        room_id: str,
    ) -> Optional[Dict[str, Any]]:
        """查询房间详情并附带在线学生数"""
        sql = (
            "SELECT r.*, "
            "  (SELECT COUNT(*) FROM classroom_enrollments e "
            "   WHERE e.room_id = r.room_id AND e.is_active = TRUE"
            "  ) AS student_count "
            "FROM classroom_rooms r "
            "WHERE r.room_id = %s AND r.is_deleted = FALSE"
        )
        return self.raw_query_one(sql, (room_id,))

    def list_teacher_rooms_with_count(
        self,
        teacher_username: str,
    ) -> List[Dict[str, Any]]:
        """查询教师的房间列表 (含学生计数)"""
        sql = (
            "SELECT r.*, "
            "  (SELECT COUNT(*) FROM classroom_enrollments e "
            "   WHERE e.room_id = r.room_id AND e.is_active = TRUE"
            "  ) AS student_count "
            "FROM classroom_rooms r "
            "WHERE r.teacher_username = %s AND r.is_deleted = FALSE "
            "ORDER BY r.created_at DESC"
        )
        return self.raw_query(sql, (teacher_username,))

    def list_class_rooms_with_count(
        self,
        class_name: str,
    ) -> List[Dict[str, Any]]:
        """查询班级可见的房间列表 (含学生计数)，空 allowed_classes 对所有学生可见"""
        sql = (
            "SELECT r.*, "
            "  (SELECT COUNT(*) FROM classroom_enrollments e "
            "   WHERE e.room_id = r.room_id AND e.is_active = TRUE"
            "  ) AS student_count "
            "FROM classroom_rooms r "
            "WHERE (JSON_LENGTH(r.allowed_classes) = 0 OR JSON_CONTAINS(r.allowed_classes, %s)) "
            "  AND r.room_status IN ('active', 'paused') "
            "  AND r.is_deleted = FALSE "
            "ORDER BY r.created_at DESC"
        )
        return self.raw_query(sql, (json.dumps(class_name),))

    # ============================================================
    # 写入
    # ============================================================

    def create_room(self, data: Dict[str, Any]) -> int:
        """
        创建房间

        Args:
            data: 包含 room_id, teacher_id, teacher_username,
                  title, description, allowed_classes 的字典
        """
        # allowed_classes 需要序列化为 JSON 字符串
        if isinstance(data.get("allowed_classes"), list):
            data["allowed_classes"] = json.dumps(
                data["allowed_classes"], ensure_ascii=False
            )
        return self.insert(data)

    def update_room_status(
        self,
        room_id: str,
        new_status: str,
    ) -> int:
        """更新房间状态"""
        data: Dict[str, Any] = {"room_status": new_status}
        if new_status == "ended":
            data["ended_at"] = datetime.now()
        return self.update(data, "room_id = %s", (room_id,))

    def update_room_info(
        self,
        room_id: str,
        data: Dict[str, Any],
    ) -> int:
        """更新房间基本信息 (标题/描述/班级)"""
        if isinstance(data.get("allowed_classes"), list):
            data["allowed_classes"] = json.dumps(
                data["allowed_classes"], ensure_ascii=False
            )
        return self.update(data, "room_id = %s", (room_id,))

    def soft_delete_room(self, room_id: str) -> int:
        """软删除房间"""
        return self.soft_delete("room_id = %s", (room_id,))


class ClassroomEnrollmentRepository(BaseRepository):
    """学生加入房间 Repository"""

    TABLE = "classroom_enrollments"

    # ============================================================
    # 查询
    # ============================================================

    def get_enrollment(
        self,
        room_id: str,
        student_username: str,
    ) -> Optional[Dict[str, Any]]:
        """查询学生在某房间的注册记录"""
        return self.find_one(
            "room_id = %s AND student_username = %s",
            (room_id, student_username),
        )

    def list_room_students(
        self,
        room_id: str,
        active_only: bool = True,
    ) -> List[Dict[str, Any]]:
        """
        查询房间内的学生列表 (关联 users 表获取详细信息)
        """
        where_active = "AND e.is_active = TRUE" if active_only else ""
        sql = (
            "SELECT e.enrollment_id, e.student_username, e.is_active, "
            "  e.joined_at, e.last_heartbeat, "
            "  u.display_name, u.class_name "
            "FROM classroom_enrollments e "
            "JOIN users u ON e.student_id = u.id "
            f"WHERE e.room_id = %s {where_active} "
            "ORDER BY e.joined_at ASC"
        )
        return self.raw_query(sql, (room_id,))

    def count_active(self, room_id: str) -> int:
        """统计房间在线学生数"""
        return self.count(
            "room_id = %s AND is_active = TRUE",
            (room_id,),
        )

    def list_student_rooms(
        self,
        student_username: str,
    ) -> List[Dict[str, Any]]:
        """查询学生已加入的房间列表"""
        return self.find_all(
            where="student_username = %s AND is_active = TRUE",
            params=(student_username,),
            order_by="joined_at DESC",
        )

    # ============================================================
    # 写入
    # ============================================================

    def enroll(self, data: Dict[str, Any]) -> int:
        """
        学生加入房间

        Args:
            data: enrollment_id, room_id, student_id, student_username
        """
        return self.insert(data)

    def reactivate(
        self,
        room_id: str,
        student_username: str,
    ) -> int:
        """重新激活已离开的学生"""
        return self.update(
            {
                "is_active": True,
                "joined_at": datetime.now(),
                "left_at": None,
                "last_heartbeat": datetime.now(),
            },
            "room_id = %s AND student_username = %s",
            (room_id, student_username),
        )

    def deactivate(
        self,
        room_id: str,
        student_username: str,
    ) -> int:
        """学生离开房间 (标记为不活跃)"""
        return self.update(
            {
                "is_active": False,
                "left_at": datetime.now(),
            },
            "room_id = %s AND student_username = %s",
            (room_id, student_username),
        )

    def update_heartbeat(
        self,
        room_id: str,
        student_username: str,
    ) -> int:
        """更新学生心跳时间"""
        return self.update(
            {"last_heartbeat": datetime.now()},
            "room_id = %s AND student_username = %s",
            (room_id, student_username),
        )

    def deactivate_all_in_room(self, room_id: str) -> int:
        """房间结束时，批量标记所有学生离开"""
        return self.update(
            {
                "is_active": False,
                "left_at": datetime.now(),
            },
            "room_id = %s AND is_active = TRUE",
            (room_id,),
        )


class PPTFileRepository(BaseRepository):
    """PPT 文件 Repository"""

    TABLE = "ppt_files"

    # ============================================================
    # 查询
    # ============================================================

    def get_by_file_id(self, file_id: str) -> Optional[Dict[str, Any]]:
        """根据 file_id 查询 PPT 文件"""
        return self.find_one(
            "file_id = %s AND is_deleted = FALSE",
            (file_id,),
        )

    def list_room_ppts(self, room_id: str) -> List[Dict[str, Any]]:
        """查询房间所有 PPT 文件"""
        return self.find_all(
            where="room_id = %s AND is_deleted = FALSE",
            params=(room_id,),
            order_by="uploaded_at DESC",
        )

    def get_latest_ppt(self, room_id: str) -> Optional[Dict[str, Any]]:
        """获取房间最新的已处理完成的 PPT"""
        return self.find_one(
            "room_id = %s AND process_status = 'completed' AND is_deleted = FALSE",
            (room_id,),
        )

    # ============================================================
    # 写入
    # ============================================================

    def create_ppt_record(self, data: Dict[str, Any]) -> int:
        """创建 PPT 文件记录"""
        return self.insert(data)

    def update_process_status(
        self,
        file_id: str,
        status: str,
        error_message: str = "",
        total_pages: int = 0,
    ) -> int:
        """更新 PPT 处理状态"""
        data: Dict[str, Any] = {"process_status": status}
        if status == "completed":
            data["processed_at"] = datetime.now()
            data["total_pages"] = total_pages
        if error_message:
            data["error_message"] = error_message
        return self.update(data, "file_id = %s", (file_id,))

    def get_by_file_id_include_deleted(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        根据 file_id 查询 PPT 文件 (不过滤 is_deleted)。
        仅限图片/缩略图路径解析场景使用 — 确保 soft-deleted 但磁盘文件仍在的 PPT 可访问。
        """
        return self.find_one("file_id = %s", (file_id,))

    def is_file_referenced(self, file_id: str, exclude_plan_id: Optional[str] = None) -> bool:
        """
        检查 PPT 文件是否被共享资源或其他课案引用 (防止删除磁盘文件)。
        同时查 shared_resource_slides + lesson_slides 两张表。
        """
        # 1. 检查共享资源引用
        row = self.raw_query_one(
            "SELECT 1 FROM shared_resource_slides "
            "WHERE JSON_EXTRACT(config, '$.file_id') = %s LIMIT 1",
            (file_id,),
        )
        if row:
            return True

        # 2. 检查其他课案引用 (排除原 plan 自身)
        if exclude_plan_id:
            row = self.raw_query_one(
                "SELECT 1 FROM lesson_slides "
                "WHERE JSON_EXTRACT(config, '$.file_id') = %s AND plan_id != %s LIMIT 1",
                (file_id, exclude_plan_id),
            )
        else:
            row = self.raw_query_one(
                "SELECT 1 FROM lesson_slides "
                "WHERE JSON_EXTRACT(config, '$.file_id') = %s LIMIT 1",
                (file_id,),
            )
        return row is not None

    def soft_delete_ppt(self, file_id: str) -> int:
        """软删除 PPT 文件"""
        return self.soft_delete("file_id = %s", (file_id,))


class PPTPageRepository(BaseRepository):
    """PPT 单页 Repository"""

    TABLE = "ppt_pages"

    # ============================================================
    # 查询
    # ============================================================

    def get_page(self, page_id: str) -> Optional[Dict[str, Any]]:
        """根据 page_id 查询页面"""
        return self.find_one("page_id = %s", (page_id,))

    def get_page_by_number(
        self,
        file_id: str,
        page_number: int,
    ) -> Optional[Dict[str, Any]]:
        """根据文件 ID 和页码查询页面"""
        return self.find_one(
            "file_id = %s AND page_number = %s",
            (file_id, page_number),
        )

    def list_file_pages(self, file_id: str) -> List[Dict[str, Any]]:
        """获取 PPT 所有页面 (按页码排序)"""
        return self.find_all(
            where="file_id = %s",
            params=(file_id,),
            order_by="page_number ASC",
        )

    def count_pages(self, file_id: str) -> int:
        """统计 PPT 页数"""
        return self.count("file_id = %s", (file_id,))

    # ============================================================
    # 写入
    # ============================================================

    def create_page(self, data: Dict[str, Any]) -> int:
        """创建页面记录"""
        return self.insert(data)

    def batch_create_pages(self, pages: List[Dict[str, Any]]) -> int:
        """批量创建页面记录"""
        if not pages:
            return 0
        total = 0
        for page in pages:
            total += self.insert(page)
        return total

    def update_text_content(self, page_id: str, text_content: str) -> int:
        """更新页面文字内容"""
        return self.update(
            {"text_content": text_content},
            "page_id = %s",
            (page_id,),
        )


class ClassroomPushRepository(BaseRepository):
    """教师推送快照 Repository"""

    TABLE = "classroom_pushes"

    # ============================================================
    # 查询
    # ============================================================

    def get_push(self, push_id: str) -> Optional[Dict[str, Any]]:
        """根据 push_id 查询推送"""
        return self.find_one("push_id = %s", (push_id,))

    def get_latest_push(self, room_id: str) -> Optional[Dict[str, Any]]:
        """获取房间最新的推送 (学生断线重连时使用)"""
        return self.find_one(
            "room_id = %s",
            (room_id,),
        )

    def list_room_pushes(
        self,
        room_id: str,
        limit: int = 0,
    ) -> List[Dict[str, Any]]:
        """获取房间所有推送记录 (回放功能使用)"""
        return self.find_all(
            where="room_id = %s",
            params=(room_id,),
            order_by="pushed_at ASC",
            limit=limit,
        )

    def count_pushes(self, room_id: str) -> int:
        """统计房间推送次数"""
        return self.count("room_id = %s", (room_id,))

    # ============================================================
    # 写入
    # ============================================================

    def record_push(self, data: Dict[str, Any]) -> int:
        """记录一次推送"""
        return self.insert(data)
