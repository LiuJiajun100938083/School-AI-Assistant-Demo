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


class ClassRepository(BaseRepository):
    """班級 Repository（classes 表）"""

    TABLE = "classes"

    def get_all_ordered(self) -> List[Dict[str, Any]]:
        """獲取所有班級（含班主任資訊），按 class_code 排序"""
        sql = (
            "SELECT id, class_code, class_name, grade, "
            "teacher_username, vice_teacher_username "
            "FROM classes ORDER BY class_code"
        )
        return self.raw_query(sql)

    def find_by_class_code(self, class_code: str) -> Optional[Dict[str, Any]]:
        """按班級代碼查找"""
        return self.find_one("class_code = %s", (class_code,))

    def create_class(
        self, class_code: str, class_name: str, grade: str
    ) -> int:
        """創建班級"""
        return self.insert({
            "class_code": class_code,
            "class_name": class_name,
            "grade": grade,
        })

    def update_teachers(
        self,
        class_code: str,
        teacher_username: Optional[str],
        vice_teacher_username: Optional[str],
    ) -> int:
        """設定班級班主任"""
        return self.update(
            {
                "teacher_username": teacher_username,
                "vice_teacher_username": vice_teacher_username,
            },
            "class_code = %s",
            (class_code,),
        )

    def delete_by_code(self, class_code: str) -> int:
        """刪除班級"""
        return self.delete("class_code = %s", (class_code,))

    def get_classes_for_teacher(self, username: str) -> List[str]:
        """獲取用戶擔任班主任/副班主任的所有班級代碼"""
        rows = self.raw_query(
            "SELECT class_code FROM classes "
            "WHERE teacher_username = %s OR vice_teacher_username = %s",
            (username, username),
        )
        return [r["class_code"] for r in rows] if rows else []


class ReportRecipientRepository(BaseRepository):
    """報告接收人 Repository"""

    TABLE = "class_diary_report_recipients"

    def get_all(self) -> List[Dict[str, Any]]:
        """列出所有報告接收人"""
        return self.find_all(order_by="created_at")

    def is_recipient(self, username: str) -> bool:
        """檢查用戶是否為報告接收人"""
        return self.exists("username = %s", (username,))

    def add_recipient(self, username: str, granted_by: str) -> int:
        """添加報告接收人"""
        return self.insert({"username": username, "granted_by": granted_by})

    def remove_recipient(self, username: str) -> int:
        """移除報告接收人"""
        return self.delete("username = %s", (username,))


class DailyReportRepository(BaseRepository):
    """每日 AI 報告 Repository"""

    TABLE = "class_diary_daily_reports"

    def get_by_date(self, report_date: str) -> Optional[Dict[str, Any]]:
        """獲取指定日期的報告"""
        return self.find_one("report_date = %s", (report_date,))

    def upsert_generating(self, report_date: str) -> None:
        """標記報告為生成中（不存在則插入）"""
        self.pool.execute_write(
            "INSERT INTO class_diary_daily_reports (report_date, report_text, status) "
            "VALUES (%s, '', 'generating') "
            "ON DUPLICATE KEY UPDATE status = 'generating', updated_at = NOW()",
            (report_date,),
        )

    def save_completed(
        self, report_date: str, full_text: str, summary_text: str, anomalies_json: str
    ) -> None:
        """保存生成完成的報告"""
        self.pool.execute_write(
            "UPDATE class_diary_daily_reports "
            "SET report_text = %s, summary_text = %s, anomalies_json = %s, "
            "status = 'done', updated_at = NOW() "
            "WHERE report_date = %s",
            (full_text, summary_text, anomalies_json, report_date),
        )

    def save_failed(self, report_date: str, error_msg: str) -> None:
        """標記報告生成失敗"""
        self.pool.execute_write(
            "UPDATE class_diary_daily_reports "
            "SET status = 'failed', report_text = %s, updated_at = NOW() "
            "WHERE report_date = %s",
            (f"生成失敗: {error_msg[:500]}", report_date),
        )


class RangeReportRepository(BaseRepository):
    """日期範圍 AI 報告 Repository"""

    TABLE = "class_diary_range_reports"

    def get_by_range(
        self, start_date: str, end_date: str
    ) -> Optional[Dict[str, Any]]:
        """獲取指定日期範圍的報告"""
        return self.find_one(
            "start_date = %s AND end_date = %s",
            (start_date, end_date),
        )

    def upsert_generating(
        self, start_date: str, end_date: str, requested_by: str
    ) -> None:
        """標記報告為生成中"""
        self.pool.execute_write(
            "INSERT INTO class_diary_range_reports "
            "(start_date, end_date, status, requested_by) "
            "VALUES (%s, %s, 'generating', %s) "
            "ON DUPLICATE KEY UPDATE status = 'generating', "
            "requested_by = %s, updated_at = NOW()",
            (start_date, end_date, requested_by, requested_by),
        )

    def save_completed(
        self,
        start_date: str,
        end_date: str,
        full_text: str,
        summary_text: str,
        anomalies_json: str,
    ) -> None:
        """保存生成完成的報告"""
        self.pool.execute_write(
            "UPDATE class_diary_range_reports "
            "SET report_text = %s, summary_text = %s, anomalies_json = %s, "
            "status = 'done', updated_at = NOW() "
            "WHERE start_date = %s AND end_date = %s",
            (full_text, summary_text, anomalies_json, start_date, end_date),
        )

    def save_failed(
        self, start_date: str, end_date: str, error_msg: str
    ) -> None:
        """標記報告生成失敗"""
        self.pool.execute_write(
            "UPDATE class_diary_range_reports "
            "SET status = 'failed', report_text = %s, updated_at = NOW() "
            "WHERE start_date = %s AND end_date = %s",
            (f"生成失敗: {error_msg[:500]}", start_date, end_date),
        )
