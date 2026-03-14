#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课堂教学 - Service 层

封装所有课堂教学的业务逻辑，包括:
- 房间创建/查询/状态管理
- 学生加入/离开
- PPT 上传/处理/页面管理
- 教师推送 (页面 + 标注)
- 权限校验 (教师拥有房间、学生班级匹配)

所有权限验证在此层完成，Router 层只负责解析请求和调用 Service。
"""

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.config.settings import Settings
from app.domains.classroom.exceptions import (
    ClassNotAllowedError,
    EnrollmentError,
    PPTError,
    PPTNotFoundError,
    PushError,
    RoomAccessDeniedError,
    RoomNotFoundError,
    RoomStatusError,
)
from app.domains.classroom.repository import (
    ClassroomEnrollmentRepository,
    ClassroomPushRepository,
    ClassroomRoomRepository,
    PPTFileRepository,
    PPTPageRepository,
)
from app.domains.user.repository import UserRepository
from app.services.ppt_processor import PPTProcessor

logger = logging.getLogger(__name__)

# 合法的房间状态转换
_VALID_STATUS_TRANSITIONS = {
    "draft": {"active"},
    "active": {"paused", "ended"},
    "paused": {"active", "ended"},
    "ended": set(),  # ended 是终态
}


class ClassroomService:
    """
    课堂管理服务

    职责:
    1. 房间 CRUD 与状态机管理
    2. 学生注册/退出与权限校验
    3. 数据隔离 (教师只能管理自己的房间、学生只能看见对应班级)
    """

    def __init__(
        self,
        room_repo: ClassroomRoomRepository,
        enrollment_repo: ClassroomEnrollmentRepository,
        ppt_repo: PPTFileRepository,
        page_repo: PPTPageRepository,
        push_repo: ClassroomPushRepository,
        user_repo: UserRepository,
        settings: Settings,
    ):
        self._room_repo = room_repo
        self._enrollment_repo = enrollment_repo
        self._ppt_repo = ppt_repo
        self._page_repo = page_repo
        self._push_repo = push_repo
        self._user_repo = user_repo
        self._settings = settings

        # PPT 处理引擎 (延迟初始化)
        self._ppt_processor: Optional[PPTProcessor] = None

    # ================================================================
    # 房间管理
    # ================================================================

    def create_room(
        self,
        teacher_username: str,
        title: str,
        description: str,
        allowed_classes: List[str],
    ) -> Dict[str, Any]:
        """
        创建教室房间

        Args:
            teacher_username: 教师用户名
            title: 房间标题
            description: 房间描述
            allowed_classes: 允许加入的班级列表

        Returns:
            创建的房间信息

        Raises:
            RoomAccessDeniedError: 非教师角色
        """
        # 校验教师身份
        teacher = self._user_repo.find_by_username(teacher_username)
        if not teacher or teacher["role"] not in ("teacher", "admin"):
            raise RoomAccessDeniedError("只有教师可以创建教室房间")

        # 去重并清理班级名称（空列表表示不限制班级）
        cleaned_classes = list(dict.fromkeys(
            c.strip() for c in allowed_classes if c.strip()
        ))

        room_id = str(uuid.uuid4())
        now = datetime.now()

        self._room_repo.create_room({
            "room_id": room_id,
            "teacher_id": teacher["id"],
            "teacher_username": teacher_username,
            "title": title.strip(),
            "description": description.strip() if description else "",
            "allowed_classes": cleaned_classes,
            "room_status": "draft",
            "created_at": now,
        })

        logger.info(
            "教师 %s 创建房间 %s (班级: %s)",
            teacher_username, room_id, cleaned_classes,
        )

        return {
            "room_id": room_id,
            "title": title.strip(),
            "description": description.strip() if description else "",
            "allowed_classes": cleaned_classes,
            "room_status": "draft",
            "teacher_username": teacher_username,
            "teacher_display_name": teacher.get("display_name", ""),
            "created_at": now,
            "student_count": 0,
        }

    def get_room(
        self,
        room_id: str,
        current_username: str,
        current_role: str,
    ) -> Dict[str, Any]:
        """
        获取房间详情 (含权限校验)

        教师: 只能查看自己创建的房间
        学生: 只能查看 allowed_classes 包含自己班级的房间
        管理员: 可查看所有房间
        """
        room = self._room_repo.get_room_with_student_count(room_id)
        if not room:
            raise RoomNotFoundError(room_id)

        self._check_room_access(room, current_username, current_role)

        # 解析 JSON 字段
        room = self._parse_room_json(room)
        return room

    def list_rooms(
        self,
        current_username: str,
        current_role: str,
    ) -> List[Dict[str, Any]]:
        """
        获取房间列表 (按角色自动过滤)

        教师 → 自己创建的所有房间
        学生 → 班级对应的活跃/暂停房间
        管理员 → 所有房间
        """
        if current_role in ("teacher", "admin"):
            rooms = self._room_repo.list_teacher_rooms_with_count(
                current_username
            )
        elif current_role == "student":
            user = self._user_repo.find_by_username(current_username)
            if not user or not user.get("class_name"):
                return []
            rooms = self._room_repo.list_class_rooms_with_count(
                user["class_name"]
            )
        else:
            return []

        return [self._parse_room_json(r) for r in rooms]

    def update_room_status(
        self,
        room_id: str,
        new_status: str,
        teacher_username: str,
    ) -> Dict[str, Any]:
        """
        更新房间状态

        状态机:
            draft → active (开始上课)
            active → paused (暂停)
            active → ended (结束)
            paused → active (恢复)
            paused → ended (结束)

        Raises:
            RoomNotFoundError: 房间不存在
            RoomAccessDeniedError: 非房间创建者
            RoomStatusError: 非法状态转换
        """
        room = self._get_teacher_room(room_id, teacher_username)
        current_status = room["room_status"]

        valid_targets = _VALID_STATUS_TRANSITIONS.get(current_status, set())
        if new_status not in valid_targets:
            raise RoomStatusError(current_status, new_status)

        self._room_repo.update_room_status(room_id, new_status)

        # 结束房间时，批量标记所有学生离开
        if new_status == "ended":
            left_count = self._enrollment_repo.deactivate_all_in_room(room_id)
            logger.info(
                "房间 %s 已结束，%d 名学生已标记离开",
                room_id, left_count,
            )

        logger.info(
            "房间 %s 状态: %s → %s (教师: %s)",
            room_id, current_status, new_status, teacher_username,
        )

        # 返回更新后的房间
        updated = self._room_repo.get_room_with_student_count(room_id)
        return self._parse_room_json(updated)

    def update_room_info(
        self,
        room_id: str,
        teacher_username: str,
        update_data: Dict[str, Any],
    ) -> Dict[str, Any]:
        """更新房间基本信息 (仅 draft 状态可修改)"""
        room = self._get_teacher_room(room_id, teacher_username)

        # 清理更新数据，只保留非 None 字段
        cleaned = {
            k: v for k, v in update_data.items()
            if v is not None
        }
        if not cleaned:
            return self._parse_room_json(room)

        if "allowed_classes" in cleaned:
            cleaned["allowed_classes"] = list(dict.fromkeys(
                c.strip() for c in cleaned["allowed_classes"] if c.strip()
            ))

        self._room_repo.update_room_info(room_id, cleaned)

        updated = self._room_repo.get_room_with_student_count(room_id)
        return self._parse_room_json(updated)

    def delete_room(
        self,
        room_id: str,
        teacher_username: str,
    ) -> None:
        """
        软删除房间

        Raises:
            RoomNotFoundError: 房间不存在
            RoomAccessDeniedError: 非房间创建者
        """
        self._get_teacher_room(room_id, teacher_username)

        # 先将所有学生标记离开
        self._enrollment_repo.deactivate_all_in_room(room_id)
        # 软删除房间
        self._room_repo.soft_delete_room(room_id)

        logger.info("房间 %s 已删除 (教师: %s)", room_id, teacher_username)

    # ================================================================
    # 学生管理
    # ================================================================

    def join_room(
        self,
        room_id: str,
        student_username: str,
    ) -> Dict[str, Any]:
        """
        学生加入房间

        校验逻辑:
        1. 房间存在且为 active/paused 状态
        2. 学生存在且角色为 student
        3. 学生的 class_name 在房间的 allowed_classes 中
        4. 幂等: 已加入且 active → 直接返回；已加入但 inactive → 重新激活

        Returns:
            加入记录信息

        Raises:
            RoomNotFoundError: 房间不存在
            RoomStatusError: 房间未开始或已结束
            ClassNotAllowedError: 班级不在允许列表
        """
        room = self._room_repo.get_by_room_id(room_id)
        if not room:
            raise RoomNotFoundError(room_id)

        if room["room_status"] not in ("active", "paused"):
            raise RoomStatusError(
                current_status=room["room_status"],
                target_status="join",
            )

        # 校验学生
        student = self._user_repo.find_by_username(student_username)
        if not student:
            raise EnrollmentError("学生账号不存在")
        if student["role"] != "student":
            raise EnrollmentError("只有学生可以加入课堂")

        # 校验班级权限（空列表表示不限制班级）
        student_class = (student.get("class_name") or "").strip()
        allowed = self._get_allowed_classes(room)
        if allowed:
            if not student_class or student_class not in allowed:
                raise ClassNotAllowedError(student_class)

        # 检查是否已注册
        existing = self._enrollment_repo.get_enrollment(
            room_id, student_username
        )

        if existing:
            if existing["is_active"]:
                # 已在房间内，幂等返回
                return {
                    "enrollment_id": existing["enrollment_id"],
                    "room_id": room_id,
                    "student_username": student_username,
                    "joined_at": existing["joined_at"],
                    "is_active": True,
                }
            else:
                # 重新激活
                self._enrollment_repo.reactivate(room_id, student_username)
                logger.info(
                    "学生 %s 重新加入房间 %s",
                    student_username, room_id,
                )
                return {
                    "enrollment_id": existing["enrollment_id"],
                    "room_id": room_id,
                    "student_username": student_username,
                    "joined_at": datetime.now(),
                    "is_active": True,
                }

        # 新注册
        enrollment_id = str(uuid.uuid4())
        now = datetime.now()
        self._enrollment_repo.enroll({
            "enrollment_id": enrollment_id,
            "room_id": room_id,
            "student_id": student["id"],
            "student_username": student_username,
            "joined_at": now,
            "is_active": True,
            "last_heartbeat": now,
        })

        logger.info(
            "学生 %s 加入房间 %s (班级: %s)",
            student_username, room_id, student_class,
        )

        return {
            "enrollment_id": enrollment_id,
            "room_id": room_id,
            "student_username": student_username,
            "joined_at": now,
            "is_active": True,
        }

    def leave_room(
        self,
        room_id: str,
        student_username: str,
    ) -> None:
        """学生离开房间"""
        enrollment = self._enrollment_repo.get_enrollment(
            room_id, student_username
        )
        if not enrollment or not enrollment["is_active"]:
            return  # 幂等: 未加入或已离开

        self._enrollment_repo.deactivate(room_id, student_username)
        logger.info("学生 %s 离开房间 %s", student_username, room_id)

    def get_room_students(
        self,
        room_id: str,
        teacher_username: str,
        active_only: bool = True,
    ) -> Dict[str, Any]:
        """
        获取房间学生列表 (仅教师可调用)

        Returns:
            {room_id, total, active_count, students: [...]}
        """
        self._get_teacher_room(room_id, teacher_username)

        students = self._enrollment_repo.list_room_students(
            room_id, active_only=active_only
        )
        active_count = sum(1 for s in students if s.get("is_active"))

        return {
            "room_id": room_id,
            "total": len(students),
            "active_count": active_count,
            "students": students,
        }

    def update_heartbeat(
        self,
        room_id: str,
        student_username: str,
    ) -> None:
        """更新学生心跳 (由 WebSocket 调用)"""
        self._enrollment_repo.update_heartbeat(room_id, student_username)

    # ================================================================
    # PPT 管理
    # ================================================================

    @property
    def ppt_processor(self) -> PPTProcessor:
        """获取 PPT 处理引擎 (懒加载)"""
        if self._ppt_processor is None:
            upload_dir = os.path.join(self._settings.upload_dir, "ppt")
            self._ppt_processor = PPTProcessor(
                upload_dir=upload_dir,
                max_size_mb=150,
            )
        return self._ppt_processor

    def upload_ppt(
        self,
        room_id: str,
        teacher_username: str,
        file_bytes: bytes,
        original_filename: str,
    ) -> Dict[str, Any]:
        """
        上传 PPT 文件

        步骤:
        1. 校验教师身份 + 房间所有权
        2. 验证文件安全性 (类型、大小、完整性)
        3. 保存文件到磁盘
        4. 在数据库中创建 ppt_files 记录 (状态=pending)

        后续由异步任务调用 process_ppt() 处理。

        Returns:
            PPT 文件信息字典

        Raises:
            RoomNotFoundError: 房间不存在
            RoomAccessDeniedError: 非房间创建者
            PPTError: 文件验证失败
        """
        room = self._get_teacher_room(room_id, teacher_username)

        # 验证文件
        is_valid, err_msg = self.ppt_processor.validate_file(
            file_bytes, original_filename,
        )
        if not is_valid:
            raise PPTError(err_msg)

        # 保存文件
        file_id = str(uuid.uuid4())
        stored_path = self.ppt_processor.save_file(
            file_bytes, file_id, original_filename,
        )

        # 创建数据库记录
        now = datetime.now()
        self._ppt_repo.create_ppt_record({
            "file_id": file_id,
            "room_id": room_id,
            "teacher_username": teacher_username,
            "original_filename": original_filename,
            "stored_path": stored_path,
            "file_size": len(file_bytes),
            "total_pages": 0,
            "process_status": "pending",
            "uploaded_at": now,
        })

        logger.info(
            "PPT 上传成功: %s (房间 %s, 教师 %s, 大小 %d bytes)",
            file_id, room_id, teacher_username, len(file_bytes),
        )

        return {
            "file_id": file_id,
            "room_id": room_id,
            "teacher_username": teacher_username,
            "original_filename": original_filename,
            "file_size": len(file_bytes),
            "process_status": "pending",
            "uploaded_at": now,
        }

    def upload_ppt_standalone(
        self,
        teacher_username: str,
        file_bytes: bytes,
        original_filename: str,
    ) -> Dict[str, Any]:
        """
        上传 PPT 文件 (不绑定房间, 用于课案编辑器直传)

        与 upload_ppt 逻辑相同，但不需要 room_id、不做房间权限校验。
        ppt_files.room_id 存为 NULL。
        """
        # 验证文件
        is_valid, err_msg = self.ppt_processor.validate_file(
            file_bytes, original_filename,
        )
        if not is_valid:
            raise PPTError(err_msg)

        # 保存文件
        file_id = str(uuid.uuid4())
        stored_path = self.ppt_processor.save_file(
            file_bytes, file_id, original_filename,
        )

        # 创建数据库记录 (room_id=None)
        now = datetime.now()
        self._ppt_repo.create_ppt_record({
            "file_id": file_id,
            "room_id": None,
            "teacher_username": teacher_username,
            "original_filename": original_filename,
            "stored_path": stored_path,
            "file_size": len(file_bytes),
            "total_pages": 0,
            "process_status": "pending",
            "uploaded_at": now,
        })

        logger.info(
            "PPT 直传上传成功: %s (教师 %s, 大小 %d bytes)",
            file_id, teacher_username, len(file_bytes),
        )

        return {
            "file_id": file_id,
            "teacher_username": teacher_username,
            "original_filename": original_filename,
            "file_size": len(file_bytes),
            "process_status": "pending",
            "uploaded_at": now,
        }

    async def process_ppt(
        self,
        file_id: str,
        teacher_username: str,
    ) -> Dict[str, Any]:
        """
        处理 PPT 文件 (异步后台任务)

        将 PPT 转换为每页图片，提取文字，生成缩略图，
        并将结果写入 ppt_pages 表。

        Returns:
            处理结果 (含页面列表)

        Raises:
            PPTNotFoundError: PPT 不存在
            RoomAccessDeniedError: 非上传者
            PPTError: 处理失败
        """
        ppt_record = self._ppt_repo.get_by_file_id(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        if ppt_record["teacher_username"] != teacher_username:
            raise RoomAccessDeniedError("只有上传者可以处理 PPT")

        # 更新状态为 processing
        self._ppt_repo.update_process_status(file_id, "processing")

        try:
            result = await self.ppt_processor.process_ppt(
                file_id, ppt_record["stored_path"],
            )

            # 批量写入页面数据
            pages_data = []
            for page in result["pages"]:
                pages_data.append({
                    "page_id": page["page_id"],
                    "file_id": file_id,
                    "page_number": page["page_number"],
                    "image_path": page["image_path"],
                    "thumbnail_path": page.get("thumbnail_path", ""),
                    "text_content": page.get("text_content", ""),
                })

            self._page_repo.batch_create_pages(pages_data)

            # 更新状态为 completed
            self._ppt_repo.update_process_status(
                file_id, "completed",
                total_pages=result["total_pages"],
            )

            logger.info(
                "PPT 处理完成: %s (%d 页)",
                file_id, result["total_pages"],
            )

            return result

        except Exception as e:
            # 更新状态为 failed
            self._ppt_repo.update_process_status(
                file_id, "failed",
                error_message=str(e),
            )
            logger.error("PPT 处理失败: %s - %s", file_id, e)
            raise PPTError(f"PPT 处理失败: {e}")

    def get_ppt_info(
        self,
        file_id: str,
        current_username: str,
        current_role: str,
    ) -> Dict[str, Any]:
        """
        获取 PPT 文件信息

        Returns:
            PPT 文件信息 + 页面列表
        """
        ppt_record = self._ppt_repo.get_by_file_id(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        # 校验房间访问权限
        room = self._room_repo.get_by_room_id(ppt_record["room_id"])
        if room:
            self._check_room_access(room, current_username, current_role)

        # 获取页面列表
        pages = self._page_repo.list_file_pages(file_id)

        return {
            **ppt_record,
            "pages": pages,
        }

    def list_room_ppts(
        self,
        room_id: str,
        current_username: str,
        current_role: str,
    ) -> Dict[str, Any]:
        """获取房间的所有 PPT 文件列表"""
        room = self._room_repo.get_by_room_id(room_id)
        if not room:
            raise RoomNotFoundError(room_id)

        self._check_room_access(room, current_username, current_role)

        files = self._ppt_repo.list_room_ppts(room_id)
        return {
            "room_id": room_id,
            "total": len(files),
            "files": files,
        }

    def get_page_image_path(
        self,
        file_id: str,
        page_number: int,
        current_username: str,
        current_role: str,
    ) -> str:
        """
        获取 PPT 页面图片的磁盘路径 (用于 FileResponse)

        使用 get_by_file_id_include_deleted 查询，确保被 soft-delete 但磁盘文件
        仍保留 (因被共享/克隆引用) 的 PPT 图片可正常访问。

        Returns:
            图片文件的绝对路径

        Raises:
            PPTNotFoundError: PPT 或页面不存在
        """
        ppt_record = self._ppt_repo.get_by_file_id_include_deleted(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        # 校验房间访问权限
        room_id = ppt_record.get("room_id")
        if room_id:
            room = self._room_repo.get_by_room_id(room_id)
            if room:
                self._check_room_access(room, current_username, current_role)

        page = self._page_repo.get_page_by_number(file_id, page_number)
        if not page:
            raise PPTNotFoundError(f"页面 {page_number} 不存在")

        return page["image_path"]

    def get_page_thumbnail_path(
        self,
        file_id: str,
        page_number: int,
        current_username: str,
        current_role: str,
    ) -> str:
        """
        获取 PPT 页面缩略图的磁盘路径。
        使用 get_by_file_id_include_deleted 确保被 soft-delete 但磁盘文件
        仍保留 (因被共享/克隆引用) 的 PPT 缩略图可正常访问。
        """
        ppt_record = self._ppt_repo.get_by_file_id_include_deleted(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        room_id = ppt_record.get("room_id")
        if room_id:
            room = self._room_repo.get_by_room_id(room_id)
            if room:
                self._check_room_access(room, current_username, current_role)

        page = self._page_repo.get_page_by_number(file_id, page_number)
        if not page:
            raise PPTNotFoundError(f"页面 {page_number} 不存在")

        thumbnail_path = page.get("thumbnail_path", "")
        if not thumbnail_path:
            # 没有缩略图时返回原图
            return page["image_path"]
        return thumbnail_path

    def get_page_text(
        self,
        file_id: str,
        page_number: int,
        current_username: str,
        current_role: str,
    ) -> str:
        """获取 PPT 页面的文字内容 (供 AI 使用)"""
        ppt_record = self._ppt_repo.get_by_file_id(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        room = self._room_repo.get_by_room_id(ppt_record["room_id"])
        if room:
            self._check_room_access(room, current_username, current_role)

        page = self._page_repo.get_page_by_number(file_id, page_number)
        if not page:
            raise PPTNotFoundError(f"页面 {page_number} 不存在")

        return page.get("text_content", "")

    def delete_ppt(
        self,
        file_id: str,
        teacher_username: str,
    ) -> None:
        """
        删除 PPT 文件 (软删除数据库记录 + 条件清理磁盘文件)

        如果 PPT 文件被共享资源或其他课案引用，则保留磁盘文件，
        仅软删除数据库记录，确保引用方的图片不会 404。
        """
        ppt_record = self._ppt_repo.get_by_file_id(file_id)
        if not ppt_record:
            raise PPTNotFoundError(file_id)

        if ppt_record["teacher_username"] != teacher_username:
            raise RoomAccessDeniedError("只有上传者可以删除 PPT")

        # 软删除数据库记录（永远做）
        self._ppt_repo.soft_delete_ppt(file_id)

        # 检查是否被共享/克隆引用，决定是否清理磁盘文件
        if self._ppt_repo.is_file_referenced(file_id):
            logger.info(
                "PPT 已软删除但保留磁盘文件 (被共享/克隆引用): %s (教师: %s)",
                file_id, teacher_username,
            )
        else:
            self.ppt_processor.delete_ppt_files(file_id)
            logger.info(
                "PPT 已删除 (含磁盘文件): %s (教师: %s)",
                file_id, teacher_username,
            )

    # ================================================================
    # 教师推送
    # ================================================================

    def push_page(
        self,
        room_id: str,
        teacher_username: str,
        page_id: str,
        page_number: int,
        annotations_json: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        教师推送当前页面 + 标注数据给学生

        每次推送在 classroom_pushes 表中记录一条快照，
        方便学生断线重连时获取最新状态，也用于课后回放。

        Args:
            room_id: 房间 ID
            teacher_username: 教师用户名
            page_id: 当前页面 ID
            page_number: 当前页码
            annotations_json: Fabric.js Canvas 序列化 JSON

        Returns:
            推送记录信息

        Raises:
            RoomNotFoundError: 房间不存在
            RoomAccessDeniedError: 非房间创建者
            RoomStatusError: 房间非活跃状态
        """
        room = self._get_teacher_room(room_id, teacher_username)

        # 只允许在 active/paused 状态推送
        if room["room_status"] not in ("active", "paused"):
            raise RoomStatusError(
                current_status=room["room_status"],
                target_status="push",
            )

        # 验证页面存在
        # 前端传入的 page_id 实际上是 file_id，需要结合 page_number 定位页面
        page = self._page_repo.get_page_by_number(page_id, page_number)
        if not page:
            # 兼容: 也尝试直接按 page_id 查
            page = self._page_repo.get_page(page_id)
        if not page:
            raise PushError(f"页面不存在 (file={page_id}, page={page_number})")

        push_id = str(uuid.uuid4())
        now = datetime.now()

        self._push_repo.record_push({
            "push_id": push_id,
            "room_id": room_id,
            "page_id": page_id,
            "page_number": page_number,
            "annotations_json": annotations_json or "",
            "pushed_at": now,
        })

        logger.info(
            "教师推送: 房间 %s, 页面 %d (push_id: %s)",
            room_id, page_number, push_id,
        )

        return {
            "push_id": push_id,
            "room_id": room_id,
            "page_id": page_id,
            "page_number": page_number,
            "annotations_json": annotations_json,
            "pushed_at": now,
            "text_content": page.get("text_content", ""),
        }

    def get_latest_push(
        self,
        room_id: str,
        current_username: str,
        current_role: str,
    ) -> Optional[Dict[str, Any]]:
        """
        获取房间最新推送 (学生断线重连时使用)

        Returns:
            最新推送记录，如果没有则返回 None
        """
        room = self._room_repo.get_by_room_id(room_id)
        if not room:
            raise RoomNotFoundError(room_id)

        self._check_room_access(room, current_username, current_role)

        push = self._push_repo.get_latest_push(room_id)
        if not push:
            return None

        # 补充页面图片路径
        page = self._page_repo.get_page(push["page_id"])
        if page:
            push["image_path"] = page.get("image_path", "")
            push["text_content"] = page.get("text_content", "")

        return push

    def list_push_history(
        self,
        room_id: str,
        teacher_username: str,
        limit: int = 0,
    ) -> Dict[str, Any]:
        """
        获取房间推送历史 (课后回放 / 教师查看)

        Returns:
            {room_id, total, pushes: [...]}
        """
        self._get_teacher_room(room_id, teacher_username)

        pushes = self._push_repo.list_room_pushes(room_id, limit=limit)
        return {
            "room_id": room_id,
            "total": len(pushes),
            "pushes": pushes,
        }

    # ================================================================
    # 内部方法
    # ================================================================

    def _get_teacher_room(
        self,
        room_id: str,
        teacher_username: str,
    ) -> Dict[str, Any]:
        """获取房间并校验教师所有权"""
        room = self._room_repo.get_by_room_id(room_id)
        if not room:
            raise RoomNotFoundError(room_id)
        if room["teacher_username"] != teacher_username:
            raise RoomAccessDeniedError("你不是该房间的创建者")
        return room

    def _check_room_access(
        self,
        room: Dict[str, Any],
        username: str,
        role: str,
    ) -> None:
        """校验用户是否有权限查看房间"""
        if role == "admin":
            return  # 管理员可访问所有

        if role == "teacher":
            if room["teacher_username"] != username:
                raise RoomAccessDeniedError("你不是该房间的创建者")
            return

        if role == "student":
            user = self._user_repo.find_by_username(username)
            if not user:
                raise RoomAccessDeniedError("用户不存在")

            allowed = self._get_allowed_classes(room)
            student_class = (user.get("class_name") or "").strip()
            if student_class not in allowed:
                raise RoomAccessDeniedError("你的班级无权访问此房间")
            return

        raise RoomAccessDeniedError("未知角色")

    @staticmethod
    def _get_allowed_classes(room: Dict[str, Any]) -> List[str]:
        """从房间数据中解析 allowed_classes"""
        allowed = room.get("allowed_classes", [])
        if isinstance(allowed, str):
            try:
                allowed = json.loads(allowed)
            except (json.JSONDecodeError, TypeError):
                allowed = []
        return allowed

    @staticmethod
    def _parse_room_json(room: Dict[str, Any]) -> Dict[str, Any]:
        """解析房间数据中的 JSON 字段"""
        if not room:
            return room
        allowed = room.get("allowed_classes", [])
        if isinstance(allowed, str):
            try:
                room["allowed_classes"] = json.loads(allowed)
            except (json.JSONDecodeError, TypeError):
                room["allowed_classes"] = []
        return room
