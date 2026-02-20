#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
學習任務 Repository
===================
數據訪問層，封裝所有學習任務相關的數據庫操作。

包含三個 Repository:
1. LearningTaskRepository - 任務主表 CRUD
2. TaskItemRepository - 子項/打卡項管理
3. TaskCompletionRepository - 完成記錄追蹤
"""

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class LearningTaskRepository(BaseRepository):
    """
    學習任務主表 Repository

    管理任務的創建、發布、歸檔等操作。
    """

    TABLE = "learning_tasks"

    def find_active(
        self,
        status: str = "",
        created_by: str = "",
        page: int = 1,
        page_size: int = 20,
    ) -> Dict[str, Any]:
        """
        查詢未刪除的任務列表 (分頁)

        Args:
            status: 按狀態過濾 (draft/published/archived)
            created_by: 按創建者過濾
            page: 頁碼
            page_size: 每頁大小

        Returns:
            分頁結果 {"items": [...], "total": int, ...}
        """
        conditions = ["is_deleted = 0"]
        params = []

        if status:
            conditions.append("status = %s")
            params.append(status)

        if created_by:
            conditions.append("created_by = %s")
            params.append(created_by)

        where = " AND ".join(conditions)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="priority DESC, created_at DESC",
        )

    def find_published_for_user(
        self,
        username: str,
        role: str,
        class_name: str = "",
    ) -> List[Dict[str, Any]]:
        """
        查詢分配給某用戶的已發布任務

        根據用戶的角色和班級，匹配對應的目標類型:
        - all: 所有人
        - all_teachers: 所有教師
        - all_students: 所有學生
        - teacher: 指定教師 (username)
        - student: 指定學生 (username)
        - class: 指定班級 (class_name)

        Args:
            username: 用戶名
            role: 用戶角色 (teacher/student)
            class_name: 用戶班級
        """
        conditions = [
            "status = 'published'",
            "is_deleted = 0",
        ]
        params = []

        # 構建目標匹配條件
        target_conditions = ["target_type = 'all'"]

        if role == "teacher":
            target_conditions.append("target_type = 'all_teachers'")
            target_conditions.append(
                "(target_type = 'teacher' AND target_value = %s)"
            )
            params.append(username)
        elif role == "student":
            target_conditions.append("target_type = 'all_students'")
            target_conditions.append(
                "(target_type = 'student' AND target_value = %s)"
            )
            params.append(username)
            if class_name:
                target_conditions.append(
                    "(target_type = 'class' AND target_value = %s)"
                )
                params.append(class_name)

        conditions.append(f"({' OR '.join(target_conditions)})")
        where = " AND ".join(conditions)

        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="priority DESC, published_at DESC",
        )

    def publish(self, task_id: int, target_type: str, target_value: Optional[str], recipient_count: int) -> int:
        """
        發布任務

        Args:
            task_id: 任務ID
            target_type: 目標類型
            target_value: 目標值
            recipient_count: 接收人數

        Returns:
            影響行數
        """
        return self.update(
            data={
                "status": "published",
                "target_type": target_type,
                "target_value": target_value,
                "total_recipients": recipient_count,
                "published_at": datetime.now(),
            },
            where="id = %s AND is_deleted = 0",
            params=(task_id,),
        )

    def update_completion_count(self, task_id: int, count: int) -> int:
        """更新任務的已完成人數"""
        return self.update(
            data={"completed_count": count},
            where="id = %s",
            params=(task_id,),
        )


class TaskItemRepository(BaseRepository):
    """
    學習任務子項 Repository

    管理任務中的各個打卡項目。
    """

    TABLE = "learning_task_items"

    def find_by_task(self, task_id: int) -> List[Dict[str, Any]]:
        """獲取任務的所有子項 (按順序)"""
        return self.find_all(
            where="task_id = %s",
            params=(task_id,),
            order_by="item_order ASC, id ASC",
        )

    def batch_insert(self, task_id: int, items: List[Dict[str, Any]]) -> int:
        """
        批量插入子項

        Args:
            task_id: 任務ID
            items: 子項列表，每個包含 title, description, link_url, link_label, tag

        Returns:
            插入的行數
        """
        if not items:
            return 0

        inserted = 0
        for i, item in enumerate(items):
            self.insert({
                "task_id": task_id,
                "item_order": i,
                "title": item.get("title", ""),
                "description": item.get("description"),
                "link_url": item.get("link_url"),
                "link_label": item.get("link_label"),
                "tag": item.get("tag"),
            })
            inserted += 1

        return inserted

    def delete_by_task(self, task_id: int) -> int:
        """刪除任務的所有子項 (用於重新編輯)"""
        return self.delete(
            where="task_id = %s",
            params=(task_id,),
        )


class TaskCompletionRepository(BaseRepository):
    """
    完成記錄 Repository

    追蹤用戶對任務子項的完成狀態。
    """

    TABLE = "learning_task_completions"

    def toggle_completion(
        self,
        task_id: int,
        username: str,
        item_id: int,
    ) -> Dict[str, Any]:
        """
        切換某個子項的完成狀態

        如果記錄不存在，創建為已完成。
        如果已存在，翻轉 is_completed 狀態。

        Returns:
            {"is_completed": bool, "completed_at": datetime|None}
        """
        existing = self.find_one(
            where="task_id = %s AND username = %s AND item_id = %s",
            params=(task_id, username, item_id),
        )

        if existing is None:
            # 不存在，創建為已完成
            now = datetime.now()
            self.insert({
                "task_id": task_id,
                "username": username,
                "item_id": item_id,
                "is_completed": 1,
                "completed_at": now,
            })
            return {"is_completed": True, "completed_at": now}
        else:
            # 已存在，翻轉狀態
            new_status = not existing["is_completed"]
            completed_at = datetime.now() if new_status else None
            self.update(
                data={
                    "is_completed": int(new_status),
                    "completed_at": completed_at,
                },
                where="id = %s",
                params=(existing["id"],),
            )
            return {"is_completed": new_status, "completed_at": completed_at}

    def get_user_completions(
        self,
        task_id: int,
        username: str,
    ) -> List[Dict[str, Any]]:
        """獲取某用戶對某任務的所有完成記錄"""
        return self.find_all(
            where="task_id = %s AND username = %s",
            params=(task_id, username),
        )

    def get_task_completion_stats(self, task_id: int) -> Dict[str, Any]:
        """
        獲取任務的整體完成統計

        Returns:
            {
                "total_items": int,
                "user_stats": [
                    {"username": str, "completed_items": int, "total_items": int}
                ]
            }
        """
        sql = """
            SELECT
                username,
                COUNT(*) AS total_records,
                SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) AS completed_count
            FROM learning_task_completions
            WHERE task_id = %s
            GROUP BY username
            ORDER BY completed_count DESC
        """
        return self.raw_query(sql, (task_id,))

    def count_completed_users(self, task_id: int, total_items: int) -> int:
        """
        統計完全完成任務的用戶數

        一個用戶被視為「完成」= 該用戶完成了所有子項

        Args:
            task_id: 任務ID
            total_items: 任務的子項總數

        Returns:
            完成的用戶數
        """
        if total_items <= 0:
            return 0

        sql = """
            SELECT COUNT(*) AS cnt FROM (
                SELECT username
                FROM learning_task_completions
                WHERE task_id = %s AND is_completed = 1
                GROUP BY username
                HAVING COUNT(*) >= %s
            ) AS completed_users
        """
        result = self.raw_query_one(sql, (task_id, total_items))
        return result["cnt"] if result else 0

    def get_user_overall_progress(self, username: str) -> Dict[str, Any]:
        """
        獲取用戶的總體學習進度

        Returns:
            {"total_items": int, "completed_items": int}
        """
        sql = """
            SELECT
                COUNT(*) AS total_items,
                SUM(CASE WHEN is_completed = 1 THEN 1 ELSE 0 END) AS completed_items
            FROM learning_task_completions
            WHERE username = %s
        """
        result = self.raw_query_one(sql, (username,))
        if result and result.get("total_items"):
            return {
                "total_items": result["total_items"],
                "completed_items": result["completed_items"] or 0,
            }
        return {"total_items": 0, "completed_items": 0}
