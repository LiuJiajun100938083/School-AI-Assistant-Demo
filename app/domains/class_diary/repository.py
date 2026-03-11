"""
課室日誌 — Repository (數據訪問層)
"""

import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class ClassDiaryEntryRepository(BaseRepository):
    """課堂評級記錄 Repository"""

    TABLE = "class_diary_entries"

    def find_by_class_and_date(
        self, class_code: str, entry_date: str
    ) -> List[Dict[str, Any]]:
        """查詢某班某日的所有評級記錄"""
        return self.find_all(
            where="class_code = %s AND entry_date = %s",
            params=(class_code, entry_date),
            order_by="period_start ASC",
        )

    def find_by_date_range(
        self,
        class_code: str,
        start_date: str,
        end_date: str,
    ) -> List[Dict[str, Any]]:
        """查詢某班日期範圍內的記錄"""
        return self.find_all(
            where="class_code = %s AND entry_date BETWEEN %s AND %s",
            params=(class_code, start_date, end_date),
            order_by="entry_date DESC, period_start ASC",
        )

    def find_all_by_date_range(
        self, start_date: str, end_date: str
    ) -> List[Dict[str, Any]]:
        """查詢日期範圍內所有班級的記錄"""
        return self.find_all(
            where="entry_date BETWEEN %s AND %s",
            params=(start_date, end_date),
            order_by="entry_date ASC, class_code ASC, period_start ASC",
        )

    def find_all_by_date(self, entry_date: str) -> List[Dict[str, Any]]:
        """查詢某日所有班級的記錄"""
        return self.find_all(
            where="entry_date = %s",
            params=(entry_date,),
            order_by="class_code ASC, period_start ASC",
        )

    def get_summary_by_class_date(
        self, class_code: str, entry_date: str
    ) -> Optional[Dict[str, Any]]:
        """獲取某班某日的匯總數據"""
        sql = """
            SELECT
                class_code,
                entry_date,
                COUNT(*) as total_entries,
                ROUND(AVG(discipline_rating), 1) as avg_discipline,
                ROUND(AVG(cleanliness_rating), 1) as avg_cleanliness,
                MIN(period_start) as first_period,
                MAX(period_end) as last_period
            FROM class_diary_entries
            WHERE class_code = %s AND entry_date = %s
            GROUP BY class_code, entry_date
        """
        return self.raw_query_one(sql, (class_code, entry_date))

    def find_overlapping_entries(
        self,
        class_code: str,
        entry_date: str,
        period_start: int,
        period_end: int,
        exclude_id: int = None,
    ) -> List[Dict[str, Any]]:
        """查找重疊節數的記錄"""
        sql = """
            SELECT id, period_start, period_end, subject
            FROM class_diary_entries
            WHERE class_code = %s AND entry_date = %s
              AND period_start <= %s AND period_end >= %s
        """
        params: list = [class_code, entry_date, period_end, period_start]
        if exclude_id:
            sql += " AND id != %s"
            params.append(exclude_id)
        return self.raw_query(sql, tuple(params))

    def get_classes_with_entries_on_date(self, entry_date: str) -> List[Dict[str, Any]]:
        """獲取某日有記錄的所有班級"""
        sql = """
            SELECT
                class_code,
                COUNT(*) as entry_count,
                ROUND(AVG(discipline_rating), 1) as avg_discipline,
                ROUND(AVG(cleanliness_rating), 1) as avg_cleanliness
            FROM class_diary_entries
            WHERE entry_date = %s
            GROUP BY class_code
            ORDER BY class_code
        """
        return self.raw_query(sql, (entry_date,))


class ClassDiaryReviewerRepository(BaseRepository):
    """Review 授權用戶 Repository"""

    TABLE = "class_diary_reviewers"

    def is_reviewer(self, username: str) -> bool:
        """檢查用戶是否為 reviewer"""
        return self.exists("username = %s", (username,))

    def get_all_reviewers(self) -> List[Dict[str, Any]]:
        """獲取所有 reviewer"""
        return self.find_all(order_by="created_at DESC")

    def add_reviewer(self, username: str, granted_by: str) -> int:
        """添加 reviewer"""
        return self.insert(
            {"username": username, "granted_by": granted_by}
        )

    def remove_reviewer(self, username: str) -> int:
        """移除 reviewer"""
        return self.delete("username = %s", (username,))
