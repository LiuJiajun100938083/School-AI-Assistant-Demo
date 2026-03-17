"""
共享资源库 — Service 层

薄编排层：协调 Repository、异常处理。
职责:
- 教师分组 CRUD (管理员)
- 分组成员管理 (管理员)
- 个人课案列表 (教师, 跨课堂)
- 分享课案 (教师 → 组别/全校)
- 浏览共享资源 (教师)
- 克隆课案到自己课堂 (教师)
"""

import json
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.domains.resource_library.exceptions import (
    AlreadySharedError,
    GroupNotFoundError,
    NotGroupMemberError,
    PlanNotReadyError,
    ResourceError,
    ShareNotFoundError,
)
from app.domains.resource_library.repository import (
    ResourceGroupMemberRepository,
    ResourceGroupRepository,
    SharedResourceRepository,
    SharedResourceSlideRepository,
)
from app.domains.classroom.lesson_repository import (
    LessonPlanRepository,
    LessonSlideRepository,
)
from app.domains.classroom.repository import ClassroomRoomRepository

logger = logging.getLogger(__name__)


class ResourceLibraryService:
    """共享资源库管理服务"""

    def __init__(
        self,
        group_repo: ResourceGroupRepository,
        member_repo: ResourceGroupMemberRepository,
        share_repo: SharedResourceRepository,
        share_slide_repo: SharedResourceSlideRepository,
        plan_repo: LessonPlanRepository,
        slide_repo: LessonSlideRepository,
        room_repo: ClassroomRoomRepository,
    ):
        self._group_repo = group_repo
        self._member_repo = member_repo
        self._share_repo = share_repo
        self._share_slide_repo = share_slide_repo
        self._plan_repo = plan_repo
        self._slide_repo = slide_repo
        self._room_repo = room_repo

    # ============================================================
    # Init (auto-create tables)
    # ============================================================

    def init_tables(self) -> None:
        """幂等建表 — 启动时调用，确保 4 张表存在"""
        logger.info("初始化共享资源库系统表...")
        pool = self._group_repo.pool

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS resource_groups (
                id               INT AUTO_INCREMENT,
                group_id         VARCHAR(64) NOT NULL,
                group_name       VARCHAR(255) NOT NULL,
                description      TEXT,
                created_by       VARCHAR(100) NOT NULL COMMENT '管理员 username',
                created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_deleted       BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (id),
                UNIQUE KEY uk_group_id (group_id),
                INDEX idx_created_by (created_by)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS resource_group_members (
                id                INT AUTO_INCREMENT,
                group_id          VARCHAR(64) NOT NULL,
                teacher_username  VARCHAR(100) NOT NULL,
                joined_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
                is_active         BOOLEAN DEFAULT TRUE,
                PRIMARY KEY (id),
                UNIQUE KEY uk_group_teacher (group_id, teacher_username),
                INDEX idx_teacher (teacher_username)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS shared_resources (
                id                    INT AUTO_INCREMENT,
                share_id              VARCHAR(64) NOT NULL,
                source_plan_id        VARCHAR(64) NOT NULL COMMENT '原始 plan_id (溯源)',
                source_room_id        VARCHAR(64) DEFAULT NULL COMMENT '原始课堂 (溯源)',
                title                 VARCHAR(255) NOT NULL,
                description           TEXT,
                teacher_username      VARCHAR(100) NOT NULL COMMENT '分享者',
                teacher_display_name  VARCHAR(100) DEFAULT '' COMMENT '分享当下的显示名 (快照)',
                subject_tag           VARCHAR(50) DEFAULT '',
                total_slides          INT DEFAULT 0,
                thumbnail_url         VARCHAR(500) DEFAULT '' COMMENT '第一页 PPT 缩略图路径',
                share_scope           ENUM('group','school') NOT NULL,
                group_id              VARCHAR(64) DEFAULT NULL COMMENT 'scope=group 时必填',
                clone_count           INT DEFAULT 0,
                status                ENUM('active','archived') DEFAULT 'active',
                shared_at             DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at            DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                is_deleted            BOOLEAN DEFAULT FALSE,
                PRIMARY KEY (id),
                UNIQUE KEY uk_share_id (share_id),
                INDEX idx_teacher (teacher_username),
                INDEX idx_scope (share_scope, status),
                INDEX idx_group (group_id),
                INDEX idx_source_plan (source_plan_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        pool.execute_write("""
            CREATE TABLE IF NOT EXISTS shared_resource_slides (
                id                INT AUTO_INCREMENT,
                share_id          VARCHAR(64) NOT NULL,
                slide_order       INT NOT NULL,
                slide_type        ENUM('ppt','game','quiz','quick_answer','raise_hand','poll') NOT NULL,
                title             VARCHAR(255) DEFAULT '',
                config            JSON NOT NULL,
                config_version    INT DEFAULT 1,
                duration_seconds  INT DEFAULT 0,
                PRIMARY KEY (id),
                INDEX idx_share (share_id),
                FOREIGN KEY (share_id) REFERENCES shared_resources(share_id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """)

        logger.info("共享资源库系统表初始化完成")

    # ============================================================
    # Group CRUD (管理员)
    # ============================================================

    def create_group(
        self, group_name: str, description: str, admin_username: str,
    ) -> Dict[str, Any]:
        group_id = str(uuid.uuid4())
        now = datetime.now()
        data = {
            "group_id": group_id,
            "group_name": group_name.strip(),
            "description": description.strip(),
            "created_by": admin_username,
            "created_at": now,
            "updated_at": now,
        }
        self._group_repo.create_group(data)
        logger.info("管理员 %s 创建分组 %s", admin_username, group_id)
        return data

    def update_group(
        self, group_id: str, data: Dict[str, Any],
    ) -> Dict[str, Any]:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        update = {}
        if "group_name" in data and data["group_name"] is not None:
            update["group_name"] = data["group_name"].strip()
        if "description" in data and data["description"] is not None:
            update["description"] = data["description"].strip()
        if update:
            update["updated_at"] = datetime.now()
            self._group_repo.update_group(group_id, update)
        group.update(update)
        return group

    def delete_group(self, group_id: str) -> None:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        self._group_repo.soft_delete_group(group_id)
        logger.info("分组 %s 已删除", group_id)

    def get_group(self, group_id: str) -> Dict[str, Any]:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        return group

    def list_groups(self) -> List[Dict[str, Any]]:
        return self._group_repo.list_all()

    # ============================================================
    # Group Member (管理员)
    # ============================================================

    def add_member(self, group_id: str, teacher_username: str) -> Dict[str, Any]:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        self._member_repo.add_member(group_id, teacher_username)
        logger.info("教师 %s 已加入分组 %s", teacher_username, group_id)
        return {"group_id": group_id, "teacher_username": teacher_username}

    def remove_member(self, group_id: str, teacher_username: str) -> None:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        self._member_repo.remove_member(group_id, teacher_username)
        logger.info("教师 %s 已从分组 %s 移除", teacher_username, group_id)

    def list_members(self, group_id: str) -> List[Dict[str, Any]]:
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        return self._member_repo.list_members(group_id)

    def get_group_detail(self, group_id: str) -> Dict[str, Any]:
        """获取分组详情 (含成员列表 + 人数)"""
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        members = self._member_repo.list_members(group_id)
        group["members"] = members
        group["member_count"] = len(members)
        return group

    # ============================================================
    # Personal Plans (教师, 跨课堂)
    # ============================================================

    def list_personal_plans(
        self,
        teacher_username: str,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        列出教师的所有课案 (跨课堂, 分页)。
        与 LessonService.list_plans 不同: 这里不按 room_id 过滤，
        而是展示教师在所有课堂中的课案全局视图。
        """
        where = "teacher_username = %s AND is_deleted = FALSE"
        params: list = [teacher_username]
        if status:
            where += " AND status = %s"
            params.append(status)
        return self._plan_repo.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="updated_at DESC",
        )

    # ============================================================
    # Share Plan (教师)
    # ============================================================

    def share_plan(
        self,
        plan_id: str,
        teacher_username: str,
        teacher_display_name: str,
        scope: str,
        group_id: Optional[str] = None,
        subject_tag: str = "",
    ) -> Dict[str, Any]:
        """
        将课案分享到组别或全校。
        创建快照: 复制 plan 元数据 + 全部 slides。
        """
        # 1. 校验 scope + group_id 一致性
        if scope == "group":
            if not group_id:
                raise ResourceError(
                    code="RESOURCE_ERROR",
                    message="分享到组别时必须指定 group_id",
                )
            if not self._member_repo.is_member(group_id, teacher_username):
                raise NotGroupMemberError()
        elif scope == "school":
            if group_id:
                raise ResourceError(
                    code="RESOURCE_ERROR",
                    message="分享到全校时不应指定 group_id",
                )
            group_id = None

        # 2. 校验课案存在 + 归属 + 状态
        plan = self._plan_repo.get_by_plan_id(plan_id)
        if not plan:
            raise ShareNotFoundError()  # 统一返回 404，不暴露 plan 是否存在
        if plan["teacher_username"] != teacher_username:
            raise ShareNotFoundError()  # 同上
        if plan.get("status") != "ready":
            raise PlanNotReadyError()

        # 3. 检查重复分享
        if self._share_repo.exists_for_plan(plan_id, scope, group_id):
            raise AlreadySharedError()

        # 4. 获取 slides 快照
        slides = self._slide_repo.list_by_plan(plan_id)

        # 5. 尝试获取缩略图 URL (第一个 PPT slide 的 file_id)
        thumbnail_url = self._extract_thumbnail_url(slides)

        # 6. 创建共享资源记录
        share_id = str(uuid.uuid4())
        now = datetime.now()
        share_data = {
            "share_id": share_id,
            "source_plan_id": plan_id,
            "source_room_id": plan.get("room_id"),
            "title": plan["title"],
            "description": plan.get("description", ""),
            "teacher_username": teacher_username,
            "teacher_display_name": teacher_display_name,
            "subject_tag": subject_tag.strip(),
            "total_slides": len(slides),
            "thumbnail_url": thumbnail_url,
            "share_scope": scope,
            "group_id": group_id,
            "clone_count": 0,
            "status": "active",
            "shared_at": now,
            "updated_at": now,
        }
        self._share_repo.create_resource(share_data)

        # 7. 复制 slides 快照
        for slide in slides:
            slide_snapshot = {
                "share_id": share_id,
                "slide_order": slide["slide_order"],
                "slide_type": slide["slide_type"],
                "title": slide.get("title", ""),
                "config": slide["config"],  # 保持 dict, create_slide 内部序列化
                "config_version": slide.get("config_version", 1),
                "duration_seconds": slide.get("duration_seconds", 0),
            }
            self._share_slide_repo.create_slide(slide_snapshot)

        logger.info(
            "教师 %s 分享课案 %s -> %s (share_id=%s, group=%s)",
            teacher_username, plan_id, scope, share_id, group_id,
        )
        return share_data

    # ============================================================
    # Browse Shared Resources (教师)
    # ============================================================

    def get_share_detail(
        self, share_id: str, teacher_username: str,
    ) -> Dict[str, Any]:
        """获取共享资源详情 (含 slides)。非组员访问组资源返回 404。"""
        share = self._share_repo.get_by_share_id(share_id)
        if not share:
            raise ShareNotFoundError(share_id)

        # 权限检查: 组别资源只对组员可见
        if share["share_scope"] == "group" and share.get("group_id"):
            if not self._member_repo.is_member(share["group_id"], teacher_username):
                raise ShareNotFoundError(share_id)  # 返回 404, 不暴露存在性

        slides = self._share_slide_repo.list_by_share(share_id)
        share["slides"] = slides
        return share

    def list_my_shares(
        self, teacher_username: str, page: int = 1, page_size: int = 20,
    ) -> Dict[str, Any]:
        """教师自己分享过的资源"""
        return self._share_repo.list_by_teacher(teacher_username, page, page_size)

    def list_group_shares(
        self,
        group_id: str,
        teacher_username: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """组内共享资源 (需验证组员身份)"""
        group = self._group_repo.get_by_group_id(group_id)
        if not group:
            raise GroupNotFoundError(group_id)
        if not self._member_repo.is_member(group_id, teacher_username):
            raise GroupNotFoundError(group_id)  # 返回 404, 不暴露存在性
        return self._share_repo.list_by_group(group_id, page, page_size)

    def list_school_shares(
        self, page: int = 1, page_size: int = 20,
    ) -> Dict[str, Any]:
        """全校共享资源"""
        return self._share_repo.list_school(page, page_size)

    def unshare(self, share_id: str, teacher_username: str) -> None:
        """取消分享 (只有分享者可操作)"""
        share = self._share_repo.get_by_share_id(share_id)
        if not share:
            raise ShareNotFoundError(share_id)
        if share["teacher_username"] != teacher_username:
            raise ShareNotFoundError(share_id)  # 不暴露存在性
        self._share_repo.soft_delete_resource(share_id)
        logger.info("教师 %s 取消分享 %s", teacher_username, share_id)

    # ============================================================
    # Clone Plan (教师)
    # ============================================================

    def clone_plan(
        self,
        share_id: str,
        teacher_username: str,
        target_room_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        克隆共享课案到教师自己的课堂或个人备课空间。
        target_room_id=None 时创建独立课件 (room_id=NULL)。
        创建新的 lesson_plan + lesson_slides，保留 PPT file_id 引用。
        """
        # 1. 获取共享资源
        share = self._share_repo.get_by_share_id(share_id)
        if not share:
            raise ShareNotFoundError(share_id)

        # 权限: 组资源需要组员身份
        if share["share_scope"] == "group" and share.get("group_id"):
            if not self._member_repo.is_member(share["group_id"], teacher_username):
                raise ShareNotFoundError(share_id)

        # 2. 校验目标课堂归属 (仅当指定了 target_room_id)
        if target_room_id:
            room = self._room_repo.get_by_room_id(target_room_id)
            if not room:
                raise ResourceError(
                    code="RESOURCE_ERROR",
                    message="目标课堂不存在",
                    status_code=404,
                )
            if room["teacher_username"] != teacher_username:
                raise ResourceError(
                    code="RESOURCE_ERROR",
                    message="目标课堂不存在",  # 不暴露 "没权限"
                    status_code=404,
                )

        # 3. 获取共享 slides
        shared_slides = self._share_slide_repo.list_by_share(share_id)

        # 4. 创建新的 lesson_plan
        new_plan_id = str(uuid.uuid4())
        now = datetime.now()
        plan_data = {
            "plan_id": new_plan_id,
            "title": share["title"],
            "description": share.get("description", ""),
            "teacher_username": teacher_username,
            "room_id": target_room_id,  # None → 独立课件
            "total_slides": len(shared_slides),
            "status": "draft",  # 克隆后默认草稿，教师可编辑后再就绪
            "created_at": now,
            "updated_at": now,
        }
        self._plan_repo.create_plan(plan_data)

        # 5. 复制 slides (生成新 slide_id, 保留 config 中的 file_id)
        for slide in shared_slides:
            new_slide_id = str(uuid.uuid4())
            slide_data = {
                "slide_id": new_slide_id,
                "plan_id": new_plan_id,
                "slide_order": slide["slide_order"],
                "slide_type": slide["slide_type"],
                "title": slide.get("title", ""),
                "config": slide["config"],  # 保持 dict, create_slide 内部序列化
                "config_version": slide.get("config_version", 1),
                "duration_seconds": slide.get("duration_seconds", 0),
                "created_at": now,
                "updated_at": now,
            }
            self._slide_repo.create_slide(slide_data)

        # 6. 增加克隆计数
        self._share_repo.increment_clone_count(share_id)

        logger.info(
            "教师 %s 克隆共享课案 %s -> plan %s (room=%s)",
            teacher_username, share_id, new_plan_id, target_room_id or "独立课件",
        )
        return {
            "new_plan_id": new_plan_id,
            "target_room_id": target_room_id,
            "title": share["title"],
            "total_slides": len(shared_slides),
        }

    # ============================================================
    # Teacher Groups (教师视角)
    # ============================================================

    def list_my_groups(self, teacher_username: str) -> List[Dict[str, Any]]:
        """教师所属的所有分组"""
        return self._member_repo.list_groups_for_teacher(teacher_username)

    # ============================================================
    # Delete Plan (教师, 带分享检测)
    # ============================================================

    def delete_plan(
        self,
        plan_id: str,
        teacher_username: str,
        force: bool = False,
    ) -> Dict[str, Any]:
        """
        删除课件 (带分享检测)。

        - 无活跃分享 → 直接软删除
        - 有活跃分享 + force=False → 返回阻止信息 (含 shares 列表)
        - 有活跃分享 + force=True → 事务内级联取消分享 + 软删除
        """
        # 1. 校验课件存在 + owner 归属
        plan = self._plan_repo.get_by_plan_id(plan_id)
        if not plan:
            raise ShareNotFoundError()
        if plan["teacher_username"] != teacher_username:
            raise ShareNotFoundError()

        # 2. 查找活跃分享记录
        active_shares = self._share_repo.list_active_by_source_plan(plan_id)

        # 情况 A: 无活跃分享 — 直接删除
        if not active_shares:
            self._plan_repo.soft_delete_plan(plan_id)
            logger.info("教师 %s 删除课件 %s (无分享)", teacher_username, plan_id)
            return {"deleted": True}

        # 情况 B: 有活跃分享 + force=False — 阻止并返回信息
        if not force:
            serializable_shares = [
                {k: (v.isoformat() if isinstance(v, datetime) else v)
                 for k, v in s.items()}
                for s in active_shares
            ]
            return {
                "deleted": False,
                "code": "PLAN_HAS_ACTIVE_SHARES",
                "active_shares": serializable_shares,
                "message": f"该课件有 {len(active_shares)} 条活跃分享，"
                           "确认删除将同时取消所有分享",
            }

        # 情况 C: 有活跃分享 + force=True — 事务内级联删除
        with self._share_repo.transaction() as conn:
            cursor = conn.cursor()
            # 软删所有相关 shared_resources
            cursor.execute(
                "UPDATE shared_resources SET is_deleted = TRUE "
                "WHERE source_plan_id = %s AND is_deleted = FALSE",
                (plan_id,),
            )
            cancelled = cursor.rowcount
            # 软删课件
            cursor.execute(
                "UPDATE lesson_plans SET is_deleted = TRUE "
                "WHERE plan_id = %s AND is_deleted = FALSE",
                (plan_id,),
            )

        logger.info(
            "教师 %s 强制删除课件 %s (取消 %d 条分享)",
            teacher_username, plan_id, cancelled,
        )
        return {"deleted": True, "cancelled_shares": cancelled}

    # ============================================================
    # Standalone Plans List (教师, 独立课件)
    # ============================================================

    def list_standalone_plans(
        self,
        teacher_username: str,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        列出教师的独立课件 (room_id IS NULL)。
        """
        where = "teacher_username = %s AND room_id IS NULL AND is_deleted = FALSE"
        params: list = [teacher_username]
        if status:
            where += " AND status = %s"
            params.append(status)
        return self._plan_repo.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="updated_at DESC",
        )

    # ============================================================
    # Internal Helpers
    # ============================================================

    @staticmethod
    def _extract_thumbnail_url(slides: List[Dict[str, Any]]) -> str:
        """从 slides 中提取第一个 PPT slide 的缩略图路径"""
        for slide in slides:
            if slide.get("slide_type") == "ppt":
                config = slide.get("config", {})
                file_id = config.get("file_id")
                page = config.get("page_number", 1)
                if file_id:
                    return f"/api/classroom/ppt/{file_id}/thumb/{page}"
        return ""
