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
