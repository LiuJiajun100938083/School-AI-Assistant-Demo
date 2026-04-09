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
        """批量插入知識點（種子數據用,純 upsert）。

        注意:這個方法不會把「DB 裡有但 seed JSON 裡沒有」的 point 標記為
        inactive。若需要完整 reconciliation,請改用 `reconcile_subject`。
        """
        count = 0
        for p in points:
            try:
                self.upsert(
                    p,
                    update_fields=[
                        "point_name", "description", "grade_levels",
                        "parent_code", "difficulty_level", "display_order",
                        "category", "is_active",
                    ],
                )
                count += 1
            except Exception as e:
                logger.warning("知識點插入失敗 %s: %s", p.get("point_code"), e)
        return count

    def find_all_point_codes_for_subject(
        self, subject: str, *, only_active: bool = False
    ) -> List[str]:
        """列出某科目在 DB 中所有 point_code (可選只列 active 的)"""
        sql = "SELECT point_code FROM knowledge_points WHERE subject = %s"
        if only_active:
            sql += " AND is_active = TRUE"
        rows = self.raw_query(sql, (subject,))
        return [r["point_code"] for r in rows]

    def deactivate_by_codes(self, point_codes: List[str]) -> int:
        """把指定 point_code 的 is_active 設為 FALSE(不刪除,保留歷史引用)"""
        if not point_codes:
            return 0
        placeholders = ",".join(["%s"] * len(point_codes))
        return self.raw_execute(
            f"UPDATE knowledge_points SET is_active = FALSE "
            f"WHERE point_code IN ({placeholders})",
            tuple(point_codes),
        )

    def reconcile_subject(
        self, subject: str, desired_points: List[Dict]
    ) -> Dict[str, int]:
        """
        對某科目做完整 reconciliation:
          1. upsert desired_points (新的 INSERT,已存在的 UPDATE 並 is_active=TRUE)
          2. DB 裡有但 desired 沒有的 → is_active=FALSE (保留 row 不刪)

        Args:
            subject: 要處理的科目 (e.g. 'physics')
            desired_points: 該科目完整的 seed points (已準備好,含所有必要欄位)

        Returns:
            {inserted: int (upserted), deactivated: int, kept: int}

        注意:這個 method 只負責資料層的 diff + 寫入,不讀 JSON,不關心 HTTP。
        """
        # 1. 先記錄 DB 現有該科目的全部 point_code (含 inactive)
        existing_all = set(
            self.find_all_point_codes_for_subject(subject, only_active=False)
        )
        desired_codes = {p["point_code"] for p in desired_points}

        # 2. 舊的但不在新 seed 裡 → deactivate
        to_deactivate = sorted(existing_all - desired_codes)
        deactivated = self.deactivate_by_codes(to_deactivate)

        # 3. desired 全部 upsert (force is_active=TRUE)
        upserted = 0
        for p in desired_points:
            p_with_active = dict(p)
            p_with_active["is_active"] = True
            try:
                self.upsert(
                    p_with_active,
                    update_fields=[
                        "point_name", "description", "grade_levels",
                        "parent_code", "difficulty_level", "display_order",
                        "category", "is_active",
                    ],
                )
                upserted += 1
            except Exception as e:
                logger.warning("知識點 reconcile 失敗 %s: %s", p.get("point_code"), e)

        return {
            "inserted": upserted,
            "deactivated": deactivated,
            "kept": len(existing_all & desired_codes),
        }


class MistakeRepository(BaseRepository):
    """學生錯題 Repository"""
    TABLE = "student_mistakes"

    def find_by_mistake_id(self, mistake_id: str) -> Optional[Dict]:
        return self.find_one(
            "mistake_id = %s AND is_deleted = FALSE", (mistake_id,)
        )

    def ensure_analyzing_status(self):
        """確保 status ENUM 包含 'analyzing' 值（v2.1 遷移）"""
        try:
            self.raw_query(
                "ALTER TABLE student_mistakes MODIFY COLUMN status "
                "ENUM('pending_ocr','pending_review','analyzed','practicing',"
                "'mastered','processing','ocr_failed','needs_review',"
                "'analysis_failed','cancelled','analyzing') "
                "DEFAULT 'pending_ocr'",
                (),
            )
        except Exception:
            pass  # already applied

    def cleanup_stale_processing(self, max_age_minutes: int = 30) -> int:
        """
        將超時的 processing / analyzing 記錄標記為失敗。

        服務器重啟後，之前正在處理的任務已經中斷，
        需要清理以避免前端無限輪詢。
        """
        conn = self._get_conn()
        try:
            cursor = conn.cursor()
            cursor.execute(
                """
                UPDATE student_mistakes
                SET status = CASE
                    WHEN status = 'processing' THEN 'ocr_failed'
                    WHEN status = 'analyzing' THEN 'analysis_failed'
                END
                WHERE status IN ('processing', 'analyzing')
                  AND is_deleted = FALSE
                  AND created_at < NOW() - INTERVAL %s MINUTE
                """,
                (max_age_minutes,),
            )
            count = cursor.rowcount
            conn.commit()
            return count
        finally:
            cursor.close()
            conn.close()

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
            "MIN(COALESCE(skm.mastery_level, 30)) as mastery_level, "
            "MIN(COALESCE(skm.trend, 'unknown')) as trend "
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
            "GROUP BY kp.point_code, kp.point_name, kp.category, kp.subject "
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

    # 歷史列表只需摘要 + student_answers（算 error_type），
    # 排除 questions / ai_feedback / weak_points_identified 等大字段
    _HISTORY_COLUMNS = (
        "id, session_id, student_username, subject, session_type, "
        "target_points, total_questions, student_answers, correct_count, "
        "score, status, error_code, "
        "started_at, completed_at, created_at"
    )

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
            columns=self._HISTORY_COLUMNS,
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
