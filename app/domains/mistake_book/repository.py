"""
錯題本 Repository 層
====================
數據訪問層，封裝所有 SQL 操作。
"""

import json
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class KnowledgePointRepository(BaseRepository):
    """知識點庫 Repository"""
    TABLE = "knowledge_points"

    def find_by_code(self, point_code: str) -> Optional[Dict]:
        return self.find_one("point_code = %s AND is_active = TRUE", (point_code,))

    def find_by_subject(self, subject: str) -> List[Dict]:
        return self.find_all(
            where="subject = %s AND is_active = TRUE",
            params=(subject,),
            order_by="display_order, category, point_code",
        )

    def find_by_category(self, subject: str, category: str) -> List[Dict]:
        return self.find_all(
            where="subject = %s AND category = %s AND is_active = TRUE",
            params=(subject, category),
            order_by="display_order, point_code",
        )

    def find_children(self, parent_code: str) -> List[Dict]:
        return self.find_all(
            where="parent_code = %s AND is_active = TRUE",
            params=(parent_code,),
            order_by="display_order",
        )

    def get_tree(self, subject: str) -> List[Dict]:
        """獲取某科目的知識點樹（根節點 = parent_code IS NULL）"""
        return self.find_all(
            where="subject = %s AND parent_code IS NULL AND is_active = TRUE",
            params=(subject,),
            order_by="display_order, category",
        )

    def find_by_codes(self, codes: List[str]) -> List[Dict]:
        if not codes:
            return []
        placeholders = ",".join(["%s"] * len(codes))
        return self.find_all(
            where=f"point_code IN ({placeholders}) AND is_active = TRUE",
            params=tuple(codes),
        )

    def get_categories(self, subject: str) -> List[str]:
        rows = self.raw_query(
            "SELECT DISTINCT category FROM knowledge_points "
            "WHERE subject = %s AND is_active = TRUE ORDER BY category",
            (subject,),
        )
        return [r["category"] for r in rows]

    def bulk_insert(self, points: List[Dict]) -> int:
        """批量插入知識點（種子數據用）"""
        count = 0
        for p in points:
            try:
                self.upsert(p, update_fields=["point_name", "description", "grade_levels", "parent_code", "difficulty_level", "display_order"])
                count += 1
            except Exception as e:
                logger.warning("知識點插入失敗 %s: %s", p.get("point_code"), e)
        return count


class MistakeRepository(BaseRepository):
    """學生錯題 Repository"""
    TABLE = "student_mistakes"

    def find_by_mistake_id(self, mistake_id: str) -> Optional[Dict]:
        return self.find_one(
            "mistake_id = %s AND is_deleted = FALSE", (mistake_id,)
        )

    def find_by_student(
        self,
        username: str,
        subject: Optional[str] = None,
        category: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        conditions = ["student_username = %s", "is_deleted = FALSE"]
        params = [username]

        if subject:
            conditions.append("subject = %s")
            params.append(subject)
        if category:
            conditions.append("category = %s")
            params.append(category)
        if status:
            conditions.append("status = %s")
            params.append(status)

        where = " AND ".join(conditions)
        return self.paginate(
            page=page,
            page_size=page_size,
            where=where,
            params=tuple(params),
            order_by="created_at DESC",
        )

    def count_by_student_subject(self, username: str, subject: str) -> int:
        return self.count(
            "student_username = %s AND subject = %s AND is_deleted = FALSE",
            (username, subject),
        )

    def count_by_status(self, username: str, subject: Optional[str] = None) -> List[Dict]:
        sql = (
            "SELECT subject, status, COUNT(*) as cnt "
            "FROM student_mistakes "
            "WHERE student_username = %s AND is_deleted = FALSE "
        )
        params = [username]
        if subject:
            sql += "AND subject = %s "
            params.append(subject)
        sql += "GROUP BY subject, status"
        return self.raw_query(sql, tuple(params))

    def find_for_review(
        self, username: str, subject: Optional[str] = None, limit: int = 10
    ) -> List[Dict]:
        """查詢今天需要複習的錯題"""
        conditions = [
            "student_username = %s",
            "is_deleted = FALSE",
            "status IN ('analyzed', 'practicing')",
            "(next_review_at IS NULL OR next_review_at <= NOW())",
        ]
        params = [username]

        if subject:
            conditions.append("subject = %s")
            params.append(subject)

        where = " AND ".join(conditions)
        return self.find_all(
            where=where,
            params=tuple(params),
            order_by="COALESCE(next_review_at, created_at) ASC",
            limit=limit,
        )

    def get_student_subjects(self, username: str) -> List[str]:
        rows = self.raw_query(
            "SELECT DISTINCT subject FROM student_mistakes "
            "WHERE student_username = %s AND is_deleted = FALSE",
            (username,),
        )
        return [r["subject"] for r in rows]

    def get_error_type_stats(
        self, username: str, subject: Optional[str] = None
    ) -> List[Dict]:
        sql = (
            "SELECT subject, error_type, COUNT(*) as cnt "
            "FROM student_mistakes "
            "WHERE student_username = %s AND is_deleted = FALSE AND error_type IS NOT NULL "
        )
        params = [username]
        if subject:
            sql += "AND subject = %s "
            params.append(subject)
        sql += "GROUP BY subject, error_type ORDER BY cnt DESC"
        return self.raw_query(sql, tuple(params))


class MistakeKnowledgeLinkRepository(BaseRepository):
    """錯題-知識點關聯 Repository"""
    TABLE = "mistake_knowledge_links"

    def link_mistake_to_points(
        self, mistake_id: str, point_codes: List[str], scores: Optional[List[float]] = None
    ) -> int:
        count = 0
        for i, code in enumerate(point_codes):
            score = scores[i] if scores and i < len(scores) else 1.0
            try:
                self.upsert(
                    {"mistake_id": mistake_id, "point_code": code, "relevance_score": score},
                    update_fields=["relevance_score"],
                )
                count += 1
            except Exception as e:
                logger.warning("知識點關聯失敗: %s -> %s: %s", mistake_id, code, e)
        return count

    def get_points_for_mistake(self, mistake_id: str) -> List[Dict]:
        return self.raw_query(
            "SELECT mkl.point_code, mkl.relevance_score, kp.point_name, kp.category, kp.subject "
            "FROM mistake_knowledge_links mkl "
            "JOIN knowledge_points kp ON mkl.point_code = kp.point_code "
            "WHERE mkl.mistake_id = %s "
            "ORDER BY mkl.relevance_score DESC",
            (mistake_id,),
        )

    def get_mistakes_for_point(self, point_code: str, username: str) -> List[Dict]:
        return self.raw_query(
            "SELECT sm.mistake_id, sm.subject, sm.category, sm.status, sm.mastery_level, sm.created_at "
            "FROM mistake_knowledge_links mkl "
            "JOIN student_mistakes sm ON mkl.mistake_id = sm.mistake_id "
            "WHERE mkl.point_code = %s AND sm.student_username = %s AND sm.is_deleted = FALSE "
            "ORDER BY sm.created_at DESC",
            (point_code, username),
        )

    def get_mistakes_for_point_detail(
        self, point_code: str, username: str, limit: int = 3
    ) -> List[Dict]:
        """獲取某知識點的近期錯題（含題目文字和錯誤類型，供 Q&A 上下文使用）"""
        return self.raw_query(
            "SELECT sm.mistake_id, sm.subject, sm.category, sm.error_type, "
            "COALESCE(sm.manual_question_text, sm.ocr_question_text, '') as question_text, "
            "sm.ai_analysis, sm.created_at "
            "FROM mistake_knowledge_links mkl "
            "JOIN student_mistakes sm ON mkl.mistake_id = sm.mistake_id "
            "WHERE mkl.point_code = %s AND sm.student_username = %s AND sm.is_deleted = FALSE "
            "ORDER BY sm.created_at DESC LIMIT %s",
            (point_code, username, limit),
        )

    def get_weak_points_for_student(
        self, username: str, subject: Optional[str] = None, limit: int = 20
    ) -> List[Dict]:
        """查詢學生最薄弱的知識點（錯題數最多且掌握度最低）"""
        sql = (
            "SELECT kp.point_code, kp.point_name, kp.category, kp.subject, "
            "COUNT(DISTINCT mkl.mistake_id) as mistake_count, "
            "COALESCE(skm.mastery_level, 30) as mastery_level, "
            "COALESCE(skm.trend, 'unknown') as trend "
            "FROM mistake_knowledge_links mkl "
            "JOIN student_mistakes sm ON mkl.mistake_id = sm.mistake_id "
            "JOIN knowledge_points kp ON mkl.point_code = kp.point_code "
            "LEFT JOIN student_knowledge_mastery skm "
            "  ON skm.student_username = sm.student_username AND skm.point_code = kp.point_code "
            "WHERE sm.student_username = %s AND sm.is_deleted = FALSE "
        )
        params = [username]

        if subject:
            sql += "AND sm.subject = %s "
            params.append(subject)

        sql += (
            "GROUP BY kp.point_code, kp.point_name, kp.category, kp.subject, skm.mastery_level, skm.trend "
            "ORDER BY mastery_level ASC, mistake_count DESC "
            f"LIMIT {limit}"
        )
        return self.raw_query(sql, tuple(params))


class StudentMasteryRepository(BaseRepository):
    """學生知識掌握度 Repository"""
    TABLE = "student_knowledge_mastery"

    def get_mastery(self, username: str, point_code: str) -> Optional[Dict]:
        return self.find_one(
            "student_username = %s AND point_code = %s",
            (username, point_code),
        )

    def get_all_mastery(
        self, username: str, subject: Optional[str] = None
    ) -> List[Dict]:
        """獲取學生所有知識點掌握度（LEFT JOIN 知識點表帶出名稱和分類）"""
        conditions = ["skm.student_username = %s"]
        params: list = [username]
        if subject:
            conditions.append("skm.subject = %s")
            params.append(subject)

        where_clause = " AND ".join(conditions)
        return self.raw_query(
            f"SELECT skm.point_code, skm.subject, skm.mastery_level, "
            f"skm.total_mistakes, skm.resolved_mistakes, "
            f"skm.total_practices, skm.correct_practices, "
            f"skm.trend, skm.last_mistake_at, skm.last_practice_at, "
            f"COALESCE(kp.point_name, skm.point_code) AS point_name, "
            f"COALESCE(kp.category, '') AS category, "
            f"COALESCE(kp.parent_code, '') AS parent_code "
            f"FROM {self.TABLE} skm "
            f"LEFT JOIN knowledge_points kp ON skm.point_code = kp.point_code "
            f"WHERE {where_clause} "
            f"ORDER BY skm.mastery_level ASC",
            tuple(params),
        )

    def upsert_mastery(self, data: Dict) -> int:
        return self.upsert(
            data,
            update_fields=[
                "mastery_level", "total_mistakes", "resolved_mistakes",
                "total_practices", "correct_practices",
                "last_mistake_at", "last_practice_at", "trend",
            ],
        )

    def get_weakest(
        self, username: str, subject: str, limit: int = 5
    ) -> List[Dict]:
        return self.find_all(
            where="student_username = %s AND subject = %s",
            params=(username, subject),
            order_by="mastery_level ASC",
            limit=limit,
        )

    def get_declining(self, username: str, subject: Optional[str] = None) -> List[Dict]:
        conditions = ["student_username = %s", "trend = 'declining'"]
        params = [username]
        if subject:
            conditions.append("subject = %s")
            params.append(subject)
        return self.find_all(
            where=" AND ".join(conditions),
            params=tuple(params),
            order_by="mastery_level ASC",
        )

    def get_subject_summary(self, username: str) -> List[Dict]:
        return self.raw_query(
            "SELECT subject, "
            "COUNT(*) as total_points, "
            "AVG(mastery_level) as avg_mastery, "
            "SUM(CASE WHEN mastery_level < 40 THEN 1 ELSE 0 END) as weak_count, "
            "SUM(CASE WHEN mastery_level >= 80 THEN 1 ELSE 0 END) as strong_count, "
            "SUM(CASE WHEN trend = 'declining' THEN 1 ELSE 0 END) as declining_count "
            "FROM student_knowledge_mastery "
            "WHERE student_username = %s "
            "GROUP BY subject",
            (username,),
        )


class PracticeSessionRepository(BaseRepository):
    """練習題 Repository"""
    TABLE = "practice_sessions"

    def find_by_session_id(self, session_id: str) -> Optional[Dict]:
        return self.find_one("session_id = %s", (session_id,))

    def find_by_student(
        self,
        username: str,
        subject: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        conditions = ["student_username = %s"]
        params = [username]

        if subject:
            conditions.append("subject = %s")
            params.append(subject)
        if status:
            conditions.append("status = %s")
            params.append(status)

        return self.paginate(
            page=page,
            page_size=page_size,
            where=" AND ".join(conditions),
            params=tuple(params),
            order_by="created_at DESC",
        )

    def get_recent_scores(
        self, username: str, subject: str, limit: int = 10
    ) -> List[Dict]:
        return self.find_all(
            where="student_username = %s AND subject = %s AND status = 'completed'",
            params=(username, subject),
            order_by="completed_at DESC",
            limit=limit,
            columns="session_id, score, correct_count, total_questions, session_type, completed_at",
        )


class ReviewLogRepository(BaseRepository):
    """複習日誌 Repository"""
    TABLE = "mistake_review_log"

    def get_reviews_for_mistake(self, mistake_id: str) -> List[Dict]:
        return self.find_all(
            where="mistake_id = %s",
            params=(mistake_id,),
            order_by="reviewed_at DESC",
        )

    def get_recent_reviews(
        self, username: str, days: int = 7
    ) -> List[Dict]:
        return self.raw_query(
            "SELECT DATE(reviewed_at) as review_date, "
            "COUNT(*) as review_count, "
            "SUM(CASE WHEN result = 'remembered' THEN 1 ELSE 0 END) as remembered, "
            "SUM(CASE WHEN result = 'forgot' THEN 1 ELSE 0 END) as forgot "
            "FROM mistake_review_log "
            "WHERE student_username = %s AND reviewed_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "GROUP BY DATE(reviewed_at) ORDER BY review_date",
            (username, days),
        )

    def get_streak(self, username: str) -> int:
        """計算連續複習天數"""
        rows = self.raw_query(
            "SELECT DISTINCT DATE(reviewed_at) as d "
            "FROM mistake_review_log "
            "WHERE student_username = %s "
            "ORDER BY d DESC LIMIT 60",
            (username,),
        )
        if not rows:
            return 0

        streak = 0
        from datetime import date, timedelta
        today = date.today()
        expected = today

        for row in rows:
            d = row["d"]
            if isinstance(d, datetime):
                d = d.date()
            if d == expected:
                streak += 1
                expected -= timedelta(days=1)
            elif d < expected:
                break
        return streak


class MasterySnapshotRepository(BaseRepository):
    """掌握度快照 Repository — 每次分析/練習/複習都記錄，用於繪製趨勢圖"""
    TABLE = "mastery_snapshots"

    def save_snapshot(
        self,
        username: str,
        point_code: str,
        subject: str,
        mastery_level: int,
        trigger_type: str,
        trigger_id: str = "",
    ) -> int:
        return self.insert({
            "student_username": username,
            "point_code": point_code,
            "subject": subject,
            "mastery_level": mastery_level,
            "trigger_type": trigger_type,
            "trigger_id": trigger_id,
        })

    def save_batch(self, snapshots: List[Dict]) -> int:
        """批量插入快照"""
        count = 0
        for s in snapshots:
            try:
                self.insert(s)
                count += 1
            except Exception:
                pass
        return count

    def get_point_history(
        self, username: str, point_code: str, limit: int = 30
    ) -> List[Dict]:
        """獲取某知識點的掌握度歷史曲線"""
        return self.raw_query(
            "SELECT mastery_level, trigger_type, trigger_id, created_at "
            "FROM mastery_snapshots "
            "WHERE student_username = %s AND point_code = %s "
            "ORDER BY created_at DESC LIMIT %s",
            (username, point_code, limit),
        )

    def get_category_trend(
        self, username: str, subject: str, days: int = 30
    ) -> List[Dict]:
        """按分類聚合的近 N 天趨勢（每天每分類取平均掌握度）"""
        return self.raw_query(
            "SELECT DATE(ms.created_at) as snapshot_date, "
            "kp.category, "
            "ROUND(AVG(ms.mastery_level)) as avg_mastery "
            "FROM mastery_snapshots ms "
            "JOIN knowledge_points kp ON ms.point_code = kp.point_code "
            "WHERE ms.student_username = %s AND ms.subject = %s "
            "AND ms.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "GROUP BY snapshot_date, kp.category "
            "ORDER BY snapshot_date ASC, kp.category",
            (username, subject, days),
        )

    def get_latest_by_category(
        self, username: str, subject: str
    ) -> List[Dict]:
        """每個分類的最新平均掌握度"""
        return self.raw_query(
            "SELECT kp.category, "
            "ROUND(AVG(skm.mastery_level)) as avg_mastery, "
            "COUNT(*) as point_count "
            "FROM student_knowledge_mastery skm "
            "JOIN knowledge_points kp ON skm.point_code = kp.point_code "
            "WHERE skm.student_username = %s AND skm.subject = %s "
            "GROUP BY kp.category "
            "ORDER BY avg_mastery ASC",
            (username, subject),
        )

    def get_prev_category_mastery(
        self, username: str, subject: str, days_ago: int = 7
    ) -> List[Dict]:
        """N 天前每個分類的平均掌握度（用於對比進退步）"""
        return self.raw_query(
            "SELECT kp.category, "
            "ROUND(AVG(ms.mastery_level)) as avg_mastery "
            "FROM mastery_snapshots ms "
            "JOIN knowledge_points kp ON ms.point_code = kp.point_code "
            "WHERE ms.student_username = %s AND ms.subject = %s "
            "AND DATE(ms.created_at) = ("
            "  SELECT DATE(created_at) FROM mastery_snapshots "
            "  WHERE student_username = %s AND subject = %s "
            "  AND created_at < DATE_SUB(NOW(), INTERVAL %s DAY) "
            "  ORDER BY created_at DESC LIMIT 1"
            ") "
            "GROUP BY kp.category",
            (username, subject, username, subject, days_ago),
        )
