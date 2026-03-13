"""
课案计划 — Repository 层

封装 lesson_plans / lesson_slides / lesson_sessions / lesson_slide_responses
四张表的数据库操作。遵循 BaseRepository 模式。
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


# ============================================================
# Plan
# ============================================================

class LessonPlanRepository(BaseRepository):
    TABLE = "lesson_plans"

    def get_by_plan_id(self, plan_id: str) -> Optional[Dict[str, Any]]:
        return self.find_one("plan_id = %s AND is_deleted = FALSE", (plan_id,))

    def list_by_teacher(
        self,
        teacher_username: str,
        status: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        where = "teacher_username = %s AND is_deleted = FALSE"
        params: list = [teacher_username]
        if status:
            where += " AND status = %s"
            params.append(status)
        return self.find_all(
            where=where, params=tuple(params), order_by="updated_at DESC"
        )

    def create_plan(self, data: Dict[str, Any]) -> int:
        return self.insert(data)

    def update_plan(self, plan_id: str, data: Dict[str, Any]) -> int:
        return self.update(data, "plan_id = %s AND is_deleted = FALSE", (plan_id,))

    def soft_delete_plan(self, plan_id: str) -> int:
        return self.soft_delete("plan_id = %s", (plan_id,))

    def update_total_slides(self, plan_id: str, total: int) -> int:
        return self.update(
            {"total_slides": total},
            "plan_id = %s",
            (plan_id,),
        )


# ============================================================
# Slide
# ============================================================

class LessonSlideRepository(BaseRepository):
    TABLE = "lesson_slides"

    def get_by_slide_id(self, slide_id: str) -> Optional[Dict[str, Any]]:
        row = self.find_one("slide_id = %s", (slide_id,))
        if row and isinstance(row.get("config"), str):
            row["config"] = json.loads(row["config"])
        return row

    def list_by_plan(self, plan_id: str) -> List[Dict[str, Any]]:
        rows = self.find_all(
            where="plan_id = %s",
            params=(plan_id,),
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

    def update_slide(self, slide_id: str, data: Dict[str, Any]) -> int:
        if isinstance(data.get("config"), dict):
            data["config"] = json.dumps(data["config"], ensure_ascii=False)
        return self.update(data, "slide_id = %s", (slide_id,))

    def delete_slide(self, slide_id: str) -> int:
        return self.delete("slide_id = %s", (slide_id,))

    def count_by_plan(self, plan_id: str) -> int:
        return self.count("plan_id = %s", (plan_id,))

    def get_max_order(self, plan_id: str) -> int:
        row = self.raw_query_one(
            f"SELECT MAX(slide_order) AS max_order FROM {self.TABLE} WHERE plan_id = %s",
            (plan_id,),
        )
        return (row["max_order"] if row and row["max_order"] is not None else -1)

    def reorder_slides(self, plan_id: str, slide_ids: List[str]) -> int:
        """按 slide_ids 顺序重排 slide_order (0-based)。"""
        updated = 0
        for order, sid in enumerate(slide_ids):
            updated += self.update(
                {"slide_order": order},
                "slide_id = %s AND plan_id = %s",
                (sid, plan_id),
            )
        return updated

    def shift_orders_up(self, plan_id: str, from_order: int) -> int:
        """从 from_order 起所有 slide 的 order + 1 (为插入腾位)。"""
        return self.raw_query(
            f"UPDATE {self.TABLE} SET slide_order = slide_order + 1 "
            f"WHERE plan_id = %s AND slide_order >= %s "
            f"ORDER BY slide_order DESC",
            (plan_id, from_order),
        )

    def shift_orders_down(self, plan_id: str, from_order: int) -> int:
        """从 from_order 起所有 slide 的 order - 1 (删除后收缩)。"""
        return self.raw_query(
            f"UPDATE {self.TABLE} SET slide_order = slide_order - 1 "
            f"WHERE plan_id = %s AND slide_order > %s "
            f"ORDER BY slide_order ASC",
            (plan_id, from_order),
        )

    def get_slide_at_order(self, plan_id: str, order: int) -> Optional[Dict[str, Any]]:
        row = self.find_one(
            "plan_id = %s AND slide_order = %s",
            (plan_id, order),
        )
        if row and isinstance(row.get("config"), str):
            row["config"] = json.loads(row["config"])
        return row

    def get_adjacent_slide(
        self, plan_id: str, current_order: int, direction: str
    ) -> Optional[Dict[str, Any]]:
        """获取前/后一张 slide。direction: 'next' or 'prev'"""
        if direction == "next":
            op, order_by = ">", "ASC"
        else:
            op, order_by = "<", "DESC"
        rows = self.find_all(
            where=f"plan_id = %s AND slide_order {op} %s",
            params=(plan_id, current_order),
            order_by=f"slide_order {order_by}",
            limit=1,
        )
        if rows:
            row = rows[0]
            if isinstance(row.get("config"), str):
                row["config"] = json.loads(row["config"])
            return row
        return None


# ============================================================
# Session
# ============================================================

class LessonSessionRepository(BaseRepository):
    TABLE = "lesson_sessions"

    def get_by_session_id(self, session_id: str) -> Optional[Dict[str, Any]]:
        row = self.find_one("session_id = %s", (session_id,))
        if row:
            self._parse_json_fields(row)
        return row

    def get_active_session(self, room_id: str) -> Optional[Dict[str, Any]]:
        """获取房间当前活跃 session (pending/live/paused)。"""
        row = self.find_one(
            "room_id = %s AND status IN ('pending','live','paused')",
            (room_id,),
        )
        if row:
            self._parse_json_fields(row)
        return row

    def list_by_room(
        self, room_id: str, limit: int = 50
    ) -> List[Dict[str, Any]]:
        rows = self.find_all(
            where="room_id = %s",
            params=(room_id,),
            order_by="started_at DESC",
            limit=limit,
        )
        for row in rows:
            self._parse_json_fields(row)
        return rows

    def create_session(self, data: Dict[str, Any]) -> int:
        if isinstance(data.get("runtime_meta"), dict):
            data["runtime_meta"] = json.dumps(data["runtime_meta"], ensure_ascii=False)
        return self.insert(data)

    def update_session(self, session_id: str, data: Dict[str, Any]) -> int:
        if isinstance(data.get("runtime_meta"), dict):
            data["runtime_meta"] = json.dumps(data["runtime_meta"], ensure_ascii=False)
        return self.update(data, "session_id = %s", (session_id,))

    def _parse_json_fields(self, row: Dict[str, Any]) -> None:
        if isinstance(row.get("runtime_meta"), str):
            try:
                row["runtime_meta"] = json.loads(row["runtime_meta"])
            except (json.JSONDecodeError, TypeError):
                row["runtime_meta"] = None


# ============================================================
# Response
# ============================================================

class LessonResponseRepository(BaseRepository):
    TABLE = "lesson_slide_responses"

    def get_student_response(
        self,
        session_id: str,
        slide_id: str,
        student_username: str,
        response_type: str,
    ) -> Optional[Dict[str, Any]]:
        row = self.find_one(
            "session_id = %s AND slide_id = %s AND student_username = %s AND response_type = %s",
            (session_id, slide_id, student_username, response_type),
        )
        if row and isinstance(row.get("response_data"), str):
            row["response_data"] = json.loads(row["response_data"])
        return row

    def list_by_slide(
        self, session_id: str, slide_id: str
    ) -> List[Dict[str, Any]]:
        rows = self.find_all(
            where="session_id = %s AND slide_id = %s",
            params=(session_id, slide_id),
            order_by="responded_at ASC",
        )
        for row in rows:
            if isinstance(row.get("response_data"), str):
                row["response_data"] = json.loads(row["response_data"])
        return rows

    def count_by_slide(self, session_id: str, slide_id: str) -> int:
        return self.count(
            "session_id = %s AND slide_id = %s",
            (session_id, slide_id),
        )

    def create_response(self, data: Dict[str, Any]) -> int:
        if isinstance(data.get("response_data"), dict):
            data["response_data"] = json.dumps(data["response_data"], ensure_ascii=False)
        return self.insert(data)
