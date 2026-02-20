#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
學習任務 Service
=================
業務邏輯層，處理學習任務的創建、發布、打卡等業務流程。

用法:
    service = LearningTaskService(task_repo, item_repo, completion_repo, user_repo)

    # 管理員: 創建並發布任務
    task_id = service.create_task(admin="jjliu", title="AI學習任務", items=[...])
    service.publish_task(task_id, admin="jjliu", target_type="all_teachers")

    # 用戶: 查看並打卡
    tasks = service.get_my_tasks(username="teacher1", role="teacher")
    service.toggle_item_completion(task_id=1, username="teacher1", item_id=3)
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.exceptions import NotFoundError, ValidationError, AuthorizationError
from app.domains.learning_task.repository import (
    LearningTaskRepository,
    TaskCompletionRepository,
    TaskItemRepository,
)
from app.domains.user.repository import UserRepository

logger = logging.getLogger(__name__)


class LearningTaskService:
    """
    學習任務服務

    負責管理員任務管理和用戶打卡追蹤的完整業務流程。
    """

    def __init__(
        self,
        task_repo: LearningTaskRepository,
        item_repo: TaskItemRepository,
        completion_repo: TaskCompletionRepository,
        user_repo: UserRepository,
        settings=None,
    ):
        self._task_repo = task_repo
        self._item_repo = item_repo
        self._completion_repo = completion_repo
        self._user_repo = user_repo
        self._settings = settings

    # ================================================================
    # 管理員操作
    # ================================================================

    def create_task(
        self,
        admin: str,
        title: str,
        description: str = "",
        content: str = "",
        category: str = "general",
        priority: int = 1,
        deadline: Optional[str] = None,
        items: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """
        創建學習任務 (草稿狀態)

        Args:
            admin: 管理員用戶名
            title: 任務標題
            description: 簡短描述
            content: 詳細內容
            category: 分類
            priority: 優先級 (1-3)
            deadline: 截止日期 (ISO 格式字串)
            items: 子項列表

        Returns:
            創建的任務詳情 (含子項)
        """
        if not title or not title.strip():
            raise ValidationError("任務標題不能為空", field="title")

        if priority not in (1, 2, 3):
            priority = 1

        # 解析截止日期
        deadline_dt = None
        if deadline:
            try:
                deadline_dt = datetime.fromisoformat(deadline)
            except ValueError:
                raise ValidationError("截止日期格式無效", field="deadline")

        # 插入任務
        task_id = self._task_repo.insert_get_id({
            "title": title.strip(),
            "description": description.strip() if description else "",
            "content": content,
            "category": category,
            "priority": priority,
            "status": "draft",
            "created_by": admin,
            "target_type": "all",
            "deadline": deadline_dt,
        })

        # 插入子項
        if items:
            self._item_repo.batch_insert(task_id, items)

        logger.info("管理員 %s 創建了學習任務 #%d: %s", admin, task_id, title)
        return self.get_task_detail_admin(task_id)

    def update_task(
        self,
        task_id: int,
        admin: str,
        **fields,
    ) -> Dict[str, Any]:
        """
        更新草稿任務

        只有 draft 狀態的任務可以編輯。
        如果 fields 中包含 items，會清除舊子項並重新插入。

        Returns:
            更新後的任務詳情
        """
        task = self._get_task_or_raise(task_id)

        if task["status"] != "draft":
            raise ValidationError(
                f"任務 (id={task_id}) 狀態為 {task['status']}，只有草稿可以編輯"
            )

        # 提取子項 (如果有)
        items = fields.pop("items", None)

        # 過濾允許更新的欄位
        allowed_fields = {"title", "description", "content", "category", "priority", "deadline"}
        update_data = {}
        for key, value in fields.items():
            if key in allowed_fields and value is not None:
                if key == "deadline" and isinstance(value, str):
                    try:
                        update_data[key] = datetime.fromisoformat(value) if value else None
                    except ValueError:
                        raise ValidationError("截止日期格式無效", field="deadline")
                else:
                    update_data[key] = value

        if update_data:
            self._task_repo.update(
                data=update_data,
                where="id = %s",
                params=(task_id,),
            )

        # 重新插入子項
        if items is not None:
            self._item_repo.delete_by_task(task_id)
            if items:
                self._item_repo.batch_insert(task_id, items)

        logger.info("管理員 %s 更新了學習任務 #%d", admin, task_id)
        return self.get_task_detail_admin(task_id)

    def publish_task(
        self,
        task_id: int,
        admin: str,
        target_type: str,
        target_value: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        發布任務到目標受眾

        Args:
            task_id: 任務ID
            admin: 管理員用戶名
            target_type: 目標類型 (all, all_teachers, all_students, teacher, student, class)
            target_value: 目標值 (用戶名或班級名)

        Returns:
            {"task": dict, "recipient_count": int}
        """
        task = self._get_task_or_raise(task_id)

        if task["status"] == "archived":
            raise ValidationError("已歸檔的任務不能發布")

        # 驗證目標類型
        valid_types = {"all", "all_teachers", "all_students", "teacher", "student", "class"}
        if target_type not in valid_types:
            raise ValidationError(f"無效的目標類型: {target_type}", field="target_type")

        # 需要 target_value 的類型
        if target_type in ("teacher", "student", "class") and not target_value:
            raise ValidationError(f"目標類型 {target_type} 需要指定目標值", field="target_value")

        # 解析接收人數
        recipients = self._resolve_recipients(target_type, target_value)
        recipient_count = len(recipients)

        if recipient_count == 0:
            raise ValidationError("找不到符合條件的接收者")

        # 更新任務狀態
        self._task_repo.publish(
            task_id=task_id,
            target_type=target_type,
            target_value=target_value,
            recipient_count=recipient_count,
        )

        logger.info(
            "管理員 %s 發布了學習任務 #%d 給 %s (共 %d 人)",
            admin, task_id, target_type, recipient_count,
        )

        return {
            "task": self.get_task_detail_admin(task_id),
            "recipient_count": recipient_count,
        }

    def archive_task(self, task_id: int, admin: str) -> None:
        """歸檔任務 (軟刪除)"""
        self._get_task_or_raise(task_id)
        self._task_repo.soft_delete(
            where="id = %s",
            params=(task_id,),
        )
        logger.info("管理員 %s 歸檔了學習任務 #%d", admin, task_id)

    def list_admin_tasks(
        self,
        admin: str = "",
        status: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        獲取任務列表 (管理員視角，分頁)

        Args:
            admin: 按創建者過濾 (空=所有)
            status: 按狀態過濾
            page: 頁碼
            page_size: 每頁大小
        """
        return self._task_repo.find_active(
            status=status,
            created_by=admin,
            page=page,
            page_size=page_size,
        )

    def get_task_detail_admin(self, task_id: int) -> Dict[str, Any]:
        """獲取任務完整詳情 (含子項，管理員視角)"""
        task = self._get_task_or_raise(task_id)
        task["items"] = self._item_repo.find_by_task(task_id)
        return task

    def get_task_stats(self, task_id: int) -> Dict[str, Any]:
        """
        獲取任務的完成統計

        Returns:
            {
                "task": dict,
                "total_recipients": int,
                "completed_count": int,
                "completion_rate": float,
                "user_details": [
                    {"username": str, "completed_items": int, "total_items": int, "rate": float}
                ]
            }
        """
        task = self._get_task_or_raise(task_id)
        items = self._item_repo.find_by_task(task_id)
        total_items = len(items)

        # 獲取每個用戶的完成情況
        user_stats = self._completion_repo.get_task_completion_stats(task_id)

        # 計算完全完成的用戶數
        completed_users = self._completion_repo.count_completed_users(task_id, total_items)

        # 更新任務的完成人數
        self._task_repo.update_completion_count(task_id, completed_users)

        # 構建用戶明細
        user_details = []
        for stat in user_stats:
            user_info = self._user_repo.find_one(
                where="username = %s",
                params=(stat["username"],),
                columns="username, display_name, role, class_name",
            )
            user_details.append({
                "username": stat["username"],
                "display_name": user_info["display_name"] if user_info else stat["username"],
                "role": user_info["role"] if user_info else "unknown",
                "class_name": user_info["class_name"] if user_info else "",
                "completed_items": stat["completed_count"],
                "total_items": total_items,
                "rate": round(stat["completed_count"] / total_items * 100, 1) if total_items > 0 else 0,
            })

        total_recipients = task["total_recipients"] or 0
        completion_rate = (
            round(completed_users / total_recipients * 100, 1)
            if total_recipients > 0
            else 0
        )

        return {
            "task_id": task_id,
            "task_title": task["title"],
            "total_recipients": total_recipients,
            "completed_count": completed_users,
            "completion_rate": completion_rate,
            "total_items": total_items,
            "user_details": user_details,
        }

    def get_available_targets(self) -> Dict[str, Any]:
        """
        獲取可選的發布目標

        Returns:
            {
                "classes": ["F.1A", "F.2B", ...],
                "teachers": [{"username": str, "display_name": str}, ...],
                "students": [{"username": str, "display_name": str, "class_name": str}, ...]
            }
        """
        # 獲取所有班級
        classes_result = self._user_repo.raw_query(
            "SELECT DISTINCT class_name FROM users WHERE class_name IS NOT NULL AND class_name != '' ORDER BY class_name"
        )
        classes = [r["class_name"] for r in classes_result]

        # 獲取所有教師
        teachers = self._user_repo.find_all(
            where="role = 'teacher' AND is_active = 1",
            columns="username, display_name",
            order_by="username ASC",
        )

        # 獲取所有學生
        students = self._user_repo.find_all(
            where="role = 'student' AND is_active = 1",
            columns="username, display_name, class_name",
            order_by="class_name ASC, username ASC",
        )

        return {
            "classes": classes,
            "teachers": teachers,
            "students": students,
        }

    # ================================================================
    # 用戶操作
    # ================================================================

    def get_my_tasks(
        self,
        username: str,
        role: str,
        class_name: str = "",
        status_filter: str = "",
    ) -> List[Dict[str, Any]]:
        """
        獲取用戶的學習任務列表

        Args:
            username: 用戶名
            role: 用戶角色
            class_name: 用戶班級
            status_filter: 完成狀態過濾 (pending/completed/空=全部)

        Returns:
            任務列表，每個任務包含完成進度信息
        """
        tasks = self._task_repo.find_published_for_user(username, role, class_name)

        result = []
        for task in tasks:
            task_id = task["id"]
            items = self._item_repo.find_by_task(task_id)
            total_items = len(items)

            # 獲取用戶的完成記錄
            completions = self._completion_repo.get_user_completions(task_id, username)
            completed_item_ids = {
                c["item_id"]
                for c in completions
                if c["is_completed"]
            }

            completed_items = len(completed_item_ids)
            is_all_done = total_items > 0 and completed_items >= total_items

            # 按狀態過濾
            if status_filter == "completed" and not is_all_done:
                continue
            if status_filter == "pending" and is_all_done:
                continue

            result.append({
                **task,
                "total_items": total_items,
                "completed_items": completed_items,
                "is_all_done": is_all_done,
            })

        return result

    def get_task_detail(
        self,
        task_id: int,
        username: str,
        role: str,
        class_name: str = "",
    ) -> Dict[str, Any]:
        """
        獲取任務詳情 (用戶視角，含打卡狀態)

        Returns:
            任務詳情 + 每個子項的完成狀態
        """
        task = self._get_task_or_raise(task_id)

        if task["status"] != "published":
            raise NotFoundError("學習任務", task_id)

        # 獲取子項
        items = self._item_repo.find_by_task(task_id)

        # 獲取用戶的完成記錄
        completions = self._completion_repo.get_user_completions(task_id, username)
        completion_map = {
            c["item_id"]: c
            for c in completions
        }

        # 合併子項和完成狀態
        items_with_status = []
        for item in items:
            comp = completion_map.get(item["id"])
            items_with_status.append({
                **item,
                "is_completed": bool(comp and comp["is_completed"]) if comp else False,
                "completed_at": comp["completed_at"] if comp and comp["is_completed"] else None,
            })

        total = len(items)
        completed = sum(1 for i in items_with_status if i["is_completed"])

        return {
            **task,
            "items": items_with_status,
            "total_items": total,
            "completed_items": completed,
            "is_all_done": total > 0 and completed >= total,
        }

    def toggle_item_completion(
        self,
        task_id: int,
        username: str,
        item_id: int,
    ) -> Dict[str, Any]:
        """
        打卡/取消打卡某個子項

        Returns:
            {"item_id": int, "is_completed": bool, "completed_at": datetime|None}
        """
        # 驗證任務存在且已發布
        task = self._get_task_or_raise(task_id)
        if task["status"] != "published":
            raise ValidationError("任務尚未發布")

        # 驗證子項存在
        item = self._item_repo.find_by_id(item_id)
        if not item or item["task_id"] != task_id:
            raise NotFoundError("任務子項", item_id)

        # 切換完成狀態
        result = self._completion_repo.toggle_completion(task_id, username, item_id)

        # 更新任務完成統計
        items = self._item_repo.find_by_task(task_id)
        total_items = len(items)
        completed_users = self._completion_repo.count_completed_users(task_id, total_items)
        self._task_repo.update_completion_count(task_id, completed_users)

        return {
            "item_id": item_id,
            **result,
        }

    def get_my_progress(self, username: str, role: str, class_name: str = "") -> Dict[str, Any]:
        """
        獲取用戶的總體學習進度

        Returns:
            {
                "total_tasks": int,
                "completed_tasks": int,
                "completion_rate": float,
                "total_items": int,
                "completed_items": int,
            }
        """
        tasks = self._task_repo.find_published_for_user(username, role, class_name)
        total_tasks = len(tasks)
        completed_tasks = 0

        total_all_items = 0
        completed_all_items = 0

        for task in tasks:
            items = self._item_repo.find_by_task(task["id"])
            total_items = len(items)
            total_all_items += total_items

            completions = self._completion_repo.get_user_completions(task["id"], username)
            completed = sum(1 for c in completions if c["is_completed"])
            completed_all_items += completed

            if total_items > 0 and completed >= total_items:
                completed_tasks += 1

        return {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "completion_rate": round(completed_tasks / total_tasks * 100, 1) if total_tasks > 0 else 0,
            "total_items": total_all_items,
            "completed_items": completed_all_items,
        }

    # ================================================================
    # 輔助方法
    # ================================================================

    def _get_task_or_raise(self, task_id: int) -> Dict[str, Any]:
        """獲取任務，不存在或已刪除則拋出 NotFoundError"""
        task = self._task_repo.find_one(
            where="id = %s AND is_deleted = 0",
            params=(task_id,),
        )
        if not task:
            raise NotFoundError("學習任務", task_id)
        return task

    def _resolve_recipients(
        self,
        target_type: str,
        target_value: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        解析目標受眾為用戶列表

        Args:
            target_type: 目標類型
            target_value: 目標值

        Returns:
            用戶列表 [{"username": str, "role": str}, ...]
        """
        if target_type == "all":
            return self._user_repo.find_all(
                where="is_active = 1 AND role != 'admin'",
                columns="username, role",
            )
        elif target_type == "all_teachers":
            return self._user_repo.find_all(
                where="role = 'teacher' AND is_active = 1",
                columns="username, role",
            )
        elif target_type == "all_students":
            return self._user_repo.find_all(
                where="role = 'student' AND is_active = 1",
                columns="username, role",
            )
        elif target_type == "teacher":
            users = self._user_repo.find_all(
                where="username = %s AND role = 'teacher' AND is_active = 1",
                params=(target_value,),
                columns="username, role",
            )
            return users
        elif target_type == "student":
            users = self._user_repo.find_all(
                where="username = %s AND role = 'student' AND is_active = 1",
                params=(target_value,),
                columns="username, role",
            )
            return users
        elif target_type == "class":
            return self._user_repo.find_all(
                where="class_name = %s AND is_active = 1",
                params=(target_value,),
                columns="username, role",
            )
        else:
            return []
