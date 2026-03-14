"""
共享资源库 — Repository 层

封装 resource_groups / resource_group_members / shared_resources / shared_resource_slides
四张表的数据库操作。遵循 BaseRepository 模式。
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


# ============================================================
# Group
# ============================================================

class ResourceGroupRepository(BaseRepository):
    TABLE = "resource_groups"

    def get_by_group_id(self, group_id: str) -> Optional[Dict[str, Any]]:
        return self.find_one(
            "group_id = %s AND is_deleted = FALSE", (group_id,),
        )

    def list_all(self) -> List[Dict[str, Any]]:
        return self.find_all(
            where="is_deleted = FALSE",
            order_by="created_at DESC",
        )

    def create_group(self, data: Dict[str, Any]) -> int:
        return self.insert(data)

    def update_group(self, group_id: str, data: Dict[str, Any]) -> int:
        return self.update(
            data, "group_id = %s AND is_deleted = FALSE", (group_id,),
        )

    def soft_delete_group(self, group_id: str) -> int:
        return self.soft_delete("group_id = %s", (group_id,))


# ============================================================
# Group Member
# ============================================================

class ResourceGroupMemberRepository(BaseRepository):
    TABLE = "resource_group_members"

    def is_member(self, group_id: str, teacher_username: str) -> bool:
        return self.exists(
            "group_id = %s AND teacher_username = %s AND is_active = TRUE",
            (group_id, teacher_username),
        )

    def list_members(self, group_id: str) -> List[Dict[str, Any]]:
        return self.find_all(
            where="group_id = %s AND is_active = TRUE",
            params=(group_id,),
            order_by="joined_at ASC",
        )

    def list_groups_for_teacher(self, teacher_username: str) -> List[Dict[str, Any]]:
        """查询教师所属的所有活跃分组 (JOIN resource_groups)"""
        sql = (
            "SELECT g.group_id, g.group_name, g.description, g.created_by, g.created_at "
            "FROM resource_group_members m "
            "JOIN resource_groups g ON g.group_id = m.group_id AND g.is_deleted = FALSE "
            "WHERE m.teacher_username = %s AND m.is_active = TRUE "
            "ORDER BY g.group_name ASC"
        )
        return self.raw_query(sql, (teacher_username,))

    def add_member(self, group_id: str, teacher_username: str) -> int:
        """添加成员 (upsert: 重新激活已退出的成员)"""
        return self.raw_execute(
            "INSERT INTO resource_group_members (group_id, teacher_username, joined_at, is_active) "
            "VALUES (%s, %s, NOW(), TRUE) "
            "ON DUPLICATE KEY UPDATE is_active = TRUE, joined_at = NOW()",
            (group_id, teacher_username),
        )

    def remove_member(self, group_id: str, teacher_username: str) -> int:
        """移除成员 (软移除: is_active = FALSE)"""
        return self.raw_execute(
            "UPDATE resource_group_members SET is_active = FALSE "
            "WHERE group_id = %s AND teacher_username = %s",
            (group_id, teacher_username),
        )

    def count_members(self, group_id: str) -> int:
        return self.count(
            "group_id = %s AND is_active = TRUE", (group_id,),
        )


# ============================================================
# Shared Resource
# ============================================================

class SharedResourceRepository(BaseRepository):
    TABLE = "shared_resources"

    def get_by_share_id(self, share_id: str) -> Optional[Dict[str, Any]]:
        return self.find_one(
            "share_id = %s AND is_deleted = FALSE", (share_id,),
        )

    def exists_for_plan(
        self,
        plan_id: str,
        scope: str,
        group_id: Optional[str] = None,
    ) -> bool:
        """检查同一 plan 是否已在指定范围内分享过"""
        if scope == "group" and group_id:
            return self.exists(
                "source_plan_id = %s AND share_scope = 'group' AND group_id = %s "
                "AND is_deleted = FALSE",
                (plan_id, group_id),
            )
        # school scope
        return self.exists(
            "source_plan_id = %s AND share_scope = 'school' AND is_deleted = FALSE",
            (plan_id,),
        )

    def list_by_teacher(
        self,
        teacher_username: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """教师自己分享过的资源 (分页)"""
        return self.paginate(
            page=page,
            page_size=page_size,
            where="teacher_username = %s AND is_deleted = FALSE",
            params=(teacher_username,),
            order_by="shared_at DESC",
        )

    def list_by_group(
        self,
        group_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """组内共享资源 (分页)"""
        return self.paginate(
            page=page,
            page_size=page_size,
            where="group_id = %s AND share_scope = 'group' AND status = 'active' "
                  "AND is_deleted = FALSE",
            params=(group_id,),
            order_by="shared_at DESC",
        )

    def list_school(
        self,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """全校共享资源 (分页)"""
        return self.paginate(
            page=page,
            page_size=page_size,
            where="share_scope = 'school' AND status = 'active' AND is_deleted = FALSE",
            order_by="shared_at DESC",
        )

    def create_resource(self, data: Dict[str, Any]) -> int:
        return self.insert(data)

    def update_resource(self, share_id: str, data: Dict[str, Any]) -> int:
        return self.update(
            data, "share_id = %s AND is_deleted = FALSE", (share_id,),
        )

    def soft_delete_resource(self, share_id: str) -> int:
        return self.soft_delete("share_id = %s", (share_id,))

    def increment_clone_count(self, share_id: str) -> int:
        return self.raw_execute(
            "UPDATE shared_resources SET clone_count = clone_count + 1 "
            "WHERE share_id = %s",
            (share_id,),
        )


# ============================================================
# Shared Resource Slide
# ============================================================

class SharedResourceSlideRepository(BaseRepository):
    TABLE = "shared_resource_slides"

    def list_by_share(self, share_id: str) -> List[Dict[str, Any]]:
        rows = self.find_all(
            where="share_id = %s",
            params=(share_id,),
            order_by="slide_order ASC",
        )
        for row in rows:
            if isinstance(row.get("config"), str):
                row["config"] = json.loads(row["config"])
        return rows

    def create_slide(self, data: Dict[str, Any]) -> int:
        if isinstance(data.get("config"), dict):
            data["config"] = json.dumps(data["config"], ensure_ascii=False)
        return self.insert(data)

    def delete_by_share(self, share_id: str) -> int:
        """删除某个共享资源的所有幻灯片 (物理删除)"""
        return self.raw_execute(
            "DELETE FROM shared_resource_slides WHERE share_id = %s",
            (share_id,),
        )

    def has_file_reference(self, file_id: str) -> bool:
        """检查是否有任何共享幻灯片引用了指定 file_id (PPT 文件安全检查)"""
        row = self.raw_query_one(
            "SELECT 1 FROM shared_resource_slides "
            "WHERE JSON_EXTRACT(config, '$.file_id') = %s LIMIT 1",
            (file_id,),
        )
        return row is not None
