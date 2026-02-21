#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学习分析 Repository

封装所有学习分析相关的数据库操作，替代
enhanced_analytics.py / enhanced_analytics_llm.py / create_student_analysis_table.py
中的分析数据查询。
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class AnalyticsRepository(BaseRepository):
    """学习分析数据 Repository"""

    TABLE = "student_analysis_reports"

    # ============================================================
    # 学生分析报告
    # ============================================================

    def get_student_report(
        self,
        username: str,
        subject: str = "",
    ) -> Optional[Dict[str, Any]]:
        """获取学生分析报告"""
        if subject:
            return self.find_one(
                "student_id = %s AND subject = %s",
                (username, subject),
            )
        return self.find_one("student_id = %s", (username,))

    def get_cached_report(
        self,
        username: str,
        subject: str,
        max_age_hours: int = 24,
    ) -> Optional[Dict[str, Any]]:
        """获取缓存的分析报告 (在有效期内)"""
        return self.raw_query_one(
            "SELECT * FROM student_analysis_reports "
            "WHERE student_id = %s AND subject = %s "
            "AND updated_at > DATE_SUB(NOW(), INTERVAL %s HOUR)",
            (username, subject, max_age_hours),
        )

    def save_student_report(
        self,
        student_id: str,
        subject: str,
        report_data: Dict[str, Any],
    ) -> int:
        """保存或更新学生分析报告"""
        full_analysis_json = json.dumps(report_data, ensure_ascii=False, default=str)

        return self.raw_execute(
            "INSERT INTO student_analysis_reports "
            "(student_id, subject, overall_summary, overall_assessment, "
            " risk_level, full_analysis_json, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, NOW()) "
            "ON DUPLICATE KEY UPDATE "
            "  overall_summary = VALUES(overall_summary), "
            "  overall_assessment = VALUES(overall_assessment), "
            "  risk_level = VALUES(risk_level), "
            "  full_analysis_json = VALUES(full_analysis_json), "
            "  updated_at = NOW()",
            (
                student_id,
                subject,
                report_data.get("overall_summary", ""),
                report_data.get("overall_assessment", ""),
                report_data.get("risk_level", "normal"),
                full_analysis_json,
            ),
        )

    # ============================================================
    # 对话分析
    # ============================================================

    def save_conversation_analysis(
        self,
        conversation_id: str,
        username: str,
        subject: str,
        analysis_data: Dict[str, Any],
    ) -> int:
        """保存对话分析结果"""
        return self.raw_execute(
            "INSERT INTO conversation_analysis "
            "(conversation_id, username, subject, analysis_json, created_at) "
            "VALUES (%s, %s, %s, %s, NOW()) "
            "ON DUPLICATE KEY UPDATE "
            "  analysis_json = VALUES(analysis_json), "
            "  updated_at = NOW()",
            (
                conversation_id,
                username,
                subject,
                json.dumps(analysis_data, ensure_ascii=False, default=str),
            ),
        )

    # ============================================================
    # 仪表盘统计
    # ============================================================

    def get_dashboard_overview(self) -> Dict[str, Any]:
        """获取仪表盘概览数据"""
        total_students = self.raw_query_one(
            "SELECT COUNT(*) as cnt FROM users WHERE role = 'student'"
        )
        active_students = self.raw_query_one(
            "SELECT COUNT(*) as cnt FROM users WHERE role = 'student' AND is_active = TRUE"
        )
        total_conversations = self.raw_query_one(
            "SELECT COUNT(*) as cnt FROM conversations"
        )

        return {
            "total_students": total_students["cnt"] if total_students else 0,
            "active_students": active_students["cnt"] if active_students else 0,
            "total_conversations": total_conversations["cnt"] if total_conversations else 0,
        }

    def get_all_students_summary(self) -> List[Dict[str, Any]]:
        """获取所有学生的汇总信息 (含对话统计)"""
        return self.raw_query(
            "SELECT "
            "  u.username, u.display_name, u.class_name, u.role, "
            "  u.is_active, u.last_login, "
            "  COUNT(DISTINCT c.conversation_id) as conversation_count, "
            "  COUNT(m.message_id) as message_count "
            "FROM users u "
            "LEFT JOIN conversations c ON u.username = c.username AND c.is_deleted = 0 "
            "LEFT JOIN messages m ON c.conversation_id = m.conversation_id "
            "WHERE u.role = 'student' "
            "GROUP BY u.username "
            "ORDER BY message_count DESC"
        )

    def get_student_conversations(
        self,
        username: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取学生的对话列表 (含消息计数)"""
        return self.raw_query(
            "SELECT "
            "  c.conversation_id, c.title, c.subject, "
            "  c.created_at, c.updated_at, "
            "  COUNT(m.message_id) as message_count "
            "FROM conversations c "
            "LEFT JOIN messages m ON c.conversation_id = m.conversation_id "
            "WHERE c.username = %s AND c.is_deleted = 0 "
            "GROUP BY c.conversation_id "
            "ORDER BY c.updated_at DESC "
            "LIMIT %s",
            (username, limit),
        )

    # ============================================================
    # 知识掌握
    # ============================================================

    def update_knowledge_mastery(
        self,
        username: str,
        subject: str,
        topic: str,
        mastery_level: float,
    ) -> int:
        """更新知识点掌握度"""
        return self.raw_execute(
            "INSERT INTO knowledge_mastery "
            "(username, subject, topic, mastery_level, updated_at) "
            "VALUES (%s, %s, %s, %s, NOW()) "
            "ON DUPLICATE KEY UPDATE "
            "  mastery_level = VALUES(mastery_level), "
            "  updated_at = NOW()",
            (username, subject, topic, mastery_level),
        )

    def get_knowledge_mastery(
        self,
        username: str,
        subject: str = "",
    ) -> List[Dict[str, Any]]:
        """获取知识掌握度"""
        if subject:
            return self.raw_query(
                "SELECT * FROM knowledge_mastery "
                "WHERE username = %s AND subject = %s "
                "ORDER BY mastery_level ASC",
                (username, subject),
            )
        return self.raw_query(
            "SELECT * FROM knowledge_mastery "
            "WHERE username = %s ORDER BY subject, mastery_level ASC",
            (username,),
        )

    # ============================================================
    # 分析报告扩展查询
    # ============================================================

    def get_latest_student_analysis(self, student_id: str) -> Optional[Dict[str, Any]]:
        """获取学生的最新分析报告（任意科目）"""
        return self.raw_query_one(
            "SELECT * FROM student_analysis_reports "
            "WHERE student_id = %s "
            "ORDER BY updated_at DESC LIMIT 1",
            (student_id,),
        )

    def get_student_summary(self, student_id: str) -> Optional[Dict[str, Any]]:
        """获取学生摘要（overall_summary + risk_level）"""
        return self.raw_query_one(
            "SELECT overall_summary, risk_level, "
            "       preview_style_report, preview_level_report, updated_at "
            "FROM student_analysis_reports "
            "WHERE student_id = %s "
            "ORDER BY updated_at DESC LIMIT 1",
            (student_id,),
        )

    def get_all_reports_for_student(self, student_id: str) -> List[Dict[str, Any]]:
        """获取学生的所有科目报告"""
        return self.raw_query(
            "SELECT subject, risk_level, overall_summary, updated_at "
            "FROM student_analysis_reports "
            "WHERE student_id = %s "
            "ORDER BY updated_at DESC",
            (student_id,),
        )

    def save_full_analysis_report(
        self,
        student_id: str,
        subject: str,
        report_fields: Dict[str, Any],
    ) -> int:
        """保存完整的分析报告（含所有独立字段）"""
        now = datetime.now().isoformat()
        return self.raw_execute(
            "INSERT INTO student_analysis_reports "
            "(student_id, subject, analysis_date, "
            " knowledge_mastery_report, learning_style_report, "
            " difficulty_report, emotion_report, suggestion_report, "
            " progress_report, overall_assessment, risk_level, "
            " preview_style_report, preview_level_report, "
            " overall_summary, teacher_attention_points, "
            " created_at, updated_at) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE "
            "  analysis_date = VALUES(analysis_date), "
            "  knowledge_mastery_report = VALUES(knowledge_mastery_report), "
            "  learning_style_report = VALUES(learning_style_report), "
            "  difficulty_report = VALUES(difficulty_report), "
            "  emotion_report = VALUES(emotion_report), "
            "  suggestion_report = VALUES(suggestion_report), "
            "  progress_report = VALUES(progress_report), "
            "  overall_assessment = VALUES(overall_assessment), "
            "  risk_level = VALUES(risk_level), "
            "  preview_style_report = VALUES(preview_style_report), "
            "  preview_level_report = VALUES(preview_level_report), "
            "  overall_summary = VALUES(overall_summary), "
            "  teacher_attention_points = VALUES(teacher_attention_points), "
            "  updated_at = VALUES(updated_at)",
            (
                student_id, subject, now,
                report_fields.get("knowledge_mastery_report", ""),
                report_fields.get("learning_style_report", ""),
                report_fields.get("difficulty_report", ""),
                report_fields.get("emotion_report", ""),
                report_fields.get("suggestion_report", ""),
                report_fields.get("progress_report", ""),
                report_fields.get("overall_assessment", ""),
                report_fields.get("risk_level", "low"),
                report_fields.get("preview_style_report", ""),
                report_fields.get("preview_level_report", ""),
                report_fields.get("overall_summary", ""),
                report_fields.get("teacher_attention_points", ""),
                now, now,
            ),
        )

    # ============================================================
    # 对话分析扩展查询
    # ============================================================

    def get_conversation_analyses(
        self,
        student_id: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """获取学生的对话分析结果列表"""
        return self.raw_query(
            "SELECT * FROM conversation_analysis "
            "WHERE student_username = %s "
            "ORDER BY analyzed_at DESC LIMIT %s",
            (student_id, limit),
        )

    def get_conversation_analyses_by_subject(
        self,
        student_id: str,
        subject: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取学生特定科目的对话分析"""
        return self.raw_query(
            "SELECT conversation_id, analysis_result, analyzed_at "
            "FROM conversation_analysis "
            "WHERE student_username = %s AND subject_code = %s "
            "ORDER BY analyzed_at LIMIT %s",
            (student_id, subject, limit),
        )

    # ============================================================
    # 学生学习模式查询
    # ============================================================

    def get_student_active_hours(self, student_id: str) -> List[Dict[str, Any]]:
        """获取学生活跃时段"""
        return self.raw_query(
            "SELECT HOUR(created_at) AS hour, COUNT(*) AS count "
            "FROM conversations "
            "WHERE username = %s "
            "GROUP BY HOUR(created_at) "
            "ORDER BY count DESC LIMIT 3",
            (student_id,),
        )

    def get_student_engagement(self, student_id: str, days: int = 30) -> Optional[Dict[str, Any]]:
        """获取学生参与度数据"""
        return self.raw_query_one(
            "SELECT "
            "  COUNT(DISTINCT DATE(created_at)) AS active_days, "
            "  COUNT(*) AS total_conversations "
            "FROM conversations "
            "WHERE username = %s "
            "AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)",
            (student_id, days),
        )

    def get_student_progress_rate(self, student_id: str) -> Optional[Dict[str, Any]]:
        """获取学生进步速度"""
        return self.raw_query_one(
            "SELECT "
            "  AVG(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 15 DAY) "
            "      THEN overall_progress ELSE NULL END) AS recent_progress, "
            "  AVG(CASE WHEN date < DATE_SUB(CURDATE(), INTERVAL 15 DAY) "
            "      AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY) "
            "      THEN overall_progress ELSE NULL END) AS previous_progress "
            "FROM learning_progress "
            "WHERE student_id = %s",
            (student_id,),
        )

    def get_student_strengths_weaknesses(self, student_id: str) -> List[Dict[str, Any]]:
        """获取学生知识点掌握度（按掌握度排序，用于判断强弱项）"""
        return self.raw_query(
            "SELECT topic, AVG(mastery_level) AS avg_mastery "
            "FROM knowledge_mastery "
            "WHERE student_id = %s "
            "GROUP BY topic "
            "ORDER BY avg_mastery",
            (student_id,),
        )

    def get_learning_time_patterns(self, student_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """获取学习时间模式"""
        return self.raw_query(
            "SELECT "
            "  DAYOFWEEK(created_at) AS day_of_week, "
            "  HOUR(created_at) AS hour, "
            "  COUNT(*) AS count "
            "FROM conversations "
            "WHERE username = %s "
            "AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "GROUP BY DAYOFWEEK(created_at), HOUR(created_at)",
            (student_id, days),
        )

    def get_learning_frequency(self, student_id: str, days: int = 30) -> List[Dict[str, Any]]:
        """获取学习频率数据"""
        return self.raw_query(
            "SELECT DATE(created_at) AS date, COUNT(*) AS daily_count "
            "FROM conversations "
            "WHERE username = %s "
            "AND created_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "GROUP BY DATE(created_at)",
            (student_id, days),
        )

    def get_cross_subject_performance(self, student_id: str) -> List[Dict[str, Any]]:
        """获取跨学科表现"""
        return self.raw_query(
            "SELECT "
            "  subject, "
            "  AVG(mastery_level) AS avg_mastery, "
            "  COUNT(DISTINCT topic) AS topic_count, "
            "  MAX(updated_at) AS last_activity "
            "FROM knowledge_mastery "
            "WHERE student_id = %s "
            "GROUP BY subject",
            (student_id,),
        )

    # ============================================================
    # 概览与进度曲线
    # ============================================================

    def get_active_student_count(
        self,
        class_id: Optional[str] = None,
        days: int = 30,
    ) -> int:
        """获取活跃学生数"""
        if class_id:
            row = self.raw_query_one(
                "SELECT COUNT(DISTINCT la.student_username) AS cnt "
                "FROM learning_analytics la "
                "JOIN student_classes sc ON la.student_username = sc.student_username "
                "WHERE sc.class_id = %s "
                "AND la.analysis_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)",
                (class_id, days),
            )
        else:
            row = self.raw_query_one(
                "SELECT COUNT(DISTINCT student_username) AS cnt "
                "FROM learning_analytics "
                "WHERE analysis_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)",
                (days,),
            )
        return row["cnt"] if row else 0

    def get_average_mastery(
        self,
        class_id: Optional[str] = None,
        subject: Optional[str] = None,
    ) -> float:
        """获取平均掌握度"""
        sql = "SELECT AVG(mastery_level) AS avg_mastery FROM knowledge_mastery"
        conditions: List[str] = []
        params: List[Any] = []

        if class_id:
            conditions.append(
                "student_id IN (SELECT student_username FROM student_classes WHERE class_id = %s)"
            )
            params.append(class_id)
        if subject:
            conditions.append("subject = %s")
            params.append(subject)

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)

        row = self.raw_query_one(sql, tuple(params) if params else None)
        return float(row["avg_mastery"]) if row and row["avg_mastery"] is not None else 0.0

    def get_risk_student_count(self) -> int:
        """获取风险学生数"""
        row = self.raw_query_one(
            "SELECT COUNT(DISTINCT student_id) AS cnt "
            "FROM student_analysis_reports "
            "WHERE risk_level IN ('high', 'medium')",
        )
        return row["cnt"] if row else 0

    def get_total_conversations_count(
        self,
        class_id: Optional[str] = None,
        days: int = 30,
    ) -> int:
        """获取对话总数"""
        if class_id:
            row = self.raw_query_one(
                "SELECT COUNT(DISTINCT c.conversation_id) AS cnt "
                "FROM conversations c "
                "JOIN student_classes sc ON c.username = sc.student_username "
                "WHERE sc.class_id = %s "
                "AND c.updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY)",
                (class_id, days),
            )
        else:
            row = self.raw_query_one(
                "SELECT COUNT(DISTINCT conversation_id) AS cnt "
                "FROM conversations "
                "WHERE updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY)",
                (days,),
            )
        return row["cnt"] if row else 0

    def get_knowledge_mastery_overview(
        self,
        class_id: Optional[str] = None,
        subject: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取知识点掌握概览"""
        sql = (
            "SELECT topic, AVG(mastery_level) AS avg_mastery, "
            "       COUNT(DISTINCT student_id) AS student_count "
            "FROM knowledge_mastery"
        )
        conditions: List[str] = []
        params: List[Any] = []

        if class_id:
            conditions.append(
                "student_id IN (SELECT student_username FROM student_classes WHERE class_id = %s)"
            )
            params.append(class_id)
        if subject:
            conditions.append("subject = %s")
            params.append(subject)

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " GROUP BY topic ORDER BY avg_mastery DESC LIMIT 20"

        return self.raw_query(sql, tuple(params) if params else None)

    def get_class_progress_curves(
        self,
        class_id: str,
        subject: Optional[str] = None,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """获取班级进度曲线"""
        sql = (
            "SELECT lp.date, AVG(lp.overall_progress) AS avg_progress "
            "FROM learning_progress lp "
            "JOIN student_classes sc ON lp.student_id = sc.student_username "
            "WHERE sc.class_id = %s AND lp.date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)"
        )
        params: List[Any] = [class_id, days]

        if subject:
            sql += " AND lp.subject = %s"
            params.append(subject)

        sql += " GROUP BY lp.date ORDER BY lp.date"
        return self.raw_query(sql, tuple(params))

    def get_overall_progress_curves(self, days: int = 30) -> List[Dict[str, Any]]:
        """获取整体进度曲线"""
        return self.raw_query(
            "SELECT date, AVG(overall_progress) AS avg_progress "
            "FROM learning_progress "
            "WHERE date >= DATE_SUB(CURDATE(), INTERVAL %s DAY) "
            "GROUP BY date ORDER BY date",
            (days,),
        )

    def get_student_conversations_by_subject(
        self,
        student_id: str,
        subject: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """获取学生特定科目的对话列表"""
        return self.raw_query(
            "SELECT conversation_id, title, subject, created_at, updated_at "
            "FROM conversations "
            "WHERE username = %s AND subject = %s "
            "AND is_deleted = FALSE "
            "AND updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "ORDER BY updated_at DESC",
            (student_id, subject, days),
        )

    def get_student_all_conversations(
        self,
        student_id: str,
        days: int = 30,
    ) -> List[Dict[str, Any]]:
        """获取学生所有对话列表"""
        return self.raw_query(
            "SELECT conversation_id, title, subject, created_at, updated_at "
            "FROM conversations "
            "WHERE username = %s AND is_deleted = FALSE "
            "AND updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY) "
            "ORDER BY updated_at DESC",
            (student_id, days),
        )

    def get_conversation_messages(
        self,
        conversation_id: str,
    ) -> List[Dict[str, Any]]:
        """获取对话消息列表"""
        return self.raw_query(
            "SELECT role, content, timestamp "
            "FROM messages "
            "WHERE conversation_id = %s "
            "ORDER BY timestamp ASC",
            (conversation_id,),
        )

    def get_student_subject_stats(self, student_id: str) -> List[Dict[str, Any]]:
        """获取学生各科目对话统计"""
        return self.raw_query(
            "SELECT subject, COUNT(*) AS count, "
            "  SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS recent_count "
            "FROM conversations "
            "WHERE username = %s AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) "
            "GROUP BY subject",
            (student_id,),
        )
