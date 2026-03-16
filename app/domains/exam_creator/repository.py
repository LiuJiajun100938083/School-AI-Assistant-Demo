"""
AI 考試出題 — 數據訪問層
"""

from typing import Dict, Optional

from app.infrastructure.database.base_repository import BaseRepository


class ExamGenerationSessionRepository(BaseRepository):
    """exam_generation_sessions 表的 CRUD 操作"""

    TABLE = "exam_generation_sessions"

    def find_by_session_id(self, session_id: str) -> Optional[Dict]:
        return self.find_one("session_id = %s", (session_id,))

    def find_generating_by_teacher(self, username: str) -> Optional[Dict]:
        """查找該教師正在生成中的 session（防重複）"""
        return self.find_one(
            "teacher_username = %s AND status = 'generating'",
            (username,),
        )

    def find_by_teacher(self, username: str, page: int = 1, page_size: int = 10) -> Dict:
        """教師的出題歷史（分頁）"""
        return self.paginate(
            page=page,
            page_size=page_size,
            where="teacher_username = %s",
            params=(username,),
            order_by="created_at DESC",
        )
