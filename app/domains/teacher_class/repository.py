#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
教师-班级管理 Repository

封装所有教师/班级管理相关的数据库操作，提取自
enhanced_analytics.py 和 enhanced_analytics_llm.py 中的
教师班级管理方法，并转换为 BaseRepository 模式。
"""

import logging
from collections import defaultdict
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class TeacherClassRepository(BaseRepository):
    """教师-班级管理数据 Repository"""

    TABLE = "teacher_assignments"

    # ============================================================
    # 教师班级查询
    # ============================================================

    def get_teacher_classes(self, teacher_username: str) -> List[Dict[str, Any]]:
        """
        获取教师负责的班级列表

        从 enhanced_analytics.py ~line 811 提取。
        原始代码通过 JOIN classes 表获取班级详情。
        """
        rows = self.raw_query(
            "SELECT c.id AS class_id, c.class_code, c.class_name, "
            "       c.grade, ta.subject_code, ta.role "
            "FROM teacher_assignments ta "
            "JOIN classes c ON ta.class_id = c.id "
            "WHERE ta.teacher_username = %s AND ta.is_active = 1",
            (teacher_username,),
        )
        return [
            {
                "class_id": row["class_id"],
                "class_code": row.get("class_code", ""),
                "class_name": row.get("class_name", ""),
                "grade": row.get("grade", ""),
                "subject_code": row.get("subject_code", ""),
                "role": row.get("role", ""),
            }
            for row in rows
        ]

    def is_teacher_of_class(self, teacher_username: str, class_id: str) -> bool:
        """
        检查是否是班级教师

        从 enhanced_analytics_llm.py ~line 917 提取。
        """
        result = self.raw_query_one(
            "SELECT COUNT(*) AS cnt FROM teacher_assignments "
            "WHERE teacher_username = %s AND class_id = %s AND is_active = 1",
            (teacher_username, class_id),
        )
        return (result["cnt"] if result else 0) > 0

    def get_teacher_assignments(self, teacher_username: str) -> List[Dict[str, Any]]:
        """
        获取教师的班级分配详情（含班级名和年级）

        从 enhanced_analytics_llm.py ~line 882 提取。
        """
        return self.raw_query(
            "SELECT ta.*, c.class_name, c.grade "
            "FROM teacher_assignments ta "
            "JOIN classes c ON ta.class_id = c.id "
            "WHERE ta.teacher_username = %s AND ta.is_active = 1",
            (teacher_username,),
        )

    # ============================================================
    # 教师分配
    # ============================================================

    def assign_teacher_to_class(
        self,
        teacher_id: str,
        class_id: str,
        subject: str,
        is_head_teacher: bool = False,
    ) -> bool:
        """
        分配教师到班级

        从 enhanced_analytics.py ~line 916 提取。
        使用 ON DUPLICATE KEY UPDATE 实现 upsert。
        """
        try:
            role = "head_teacher" if is_head_teacher else "subject_teacher"
            self.raw_execute(
                "INSERT INTO teacher_assignments "
                "(teacher_username, class_id, subject_code, role, assigned_at, is_active) "
                "VALUES (%s, %s, %s, %s, NOW(), 1) "
                "ON DUPLICATE KEY UPDATE "
                "role = VALUES(role), is_active = 1",
                (teacher_id, class_id, subject, role),
            )
            return True
        except Exception as e:
            logger.error("分配教师失败: %s", e)
            return False

    # ============================================================
    # 班级学生查询
    # ============================================================

    def get_class_students(self, class_id: str) -> List[str]:
        """
        获取班级学生用户名列表

        从 enhanced_analytics_llm.py ~line 871 提取。
        """
        rows = self.raw_query(
            "SELECT DISTINCT student_username "
            "FROM student_classes "
            "WHERE class_id = %s AND is_active = 1",
            (class_id,),
        )
        return [row["student_username"] for row in rows]

    def get_class_students_with_analytics(self, class_id: str) -> List[Dict[str, Any]]:
        """
        获取班级学生及其分析数据

        合并自 enhanced_analytics.py ~line 940 和
        enhanced_analytics_llm.py ~line 220。

        返回每个学生的对话统计、最后活跃时间和平均掌握度。
        """
        # 获取学生基础信息及对话统计
        students_rows = self.raw_query(
            "SELECT "
            "  sc.student_username, "
            "  COUNT(DISTINCT c.conversation_id) AS conversation_count, "
            "  MAX(c.created_at) AS last_active "
            "FROM student_classes sc "
            "LEFT JOIN conversations c ON sc.student_username = c.username "
            "WHERE sc.class_id = %s AND sc.is_active = 1 "
            "GROUP BY sc.student_username",
            (class_id,),
        )

        students = []
        for row in students_rows:
            student_username = row["student_username"]

            # 获取该学生的平均掌握度
            mastery_row = self.raw_query_one(
                "SELECT AVG(mastery_level) AS avg_mastery "
                "FROM knowledge_mastery "
                "WHERE student_id = %s",
                (student_username,),
            )
            avg_mastery = float(mastery_row["avg_mastery"]) if mastery_row and mastery_row["avg_mastery"] is not None else 0.0

            last_active = row.get("last_active")
            if last_active and hasattr(last_active, "strftime"):
                last_active_str = last_active.strftime("%Y-%m-%d %H:%M")
            else:
                last_active_str = "Never"

            students.append({
                "student_id": student_username,
                "conversation_count": row.get("conversation_count", 0),
                "last_active": last_active_str,
                "average_mastery": round(avg_mastery, 2),
            })

        return students

    # ============================================================
    # 学习预警
    # ============================================================

    def get_class_learning_warnings(self, class_id: str) -> List[Dict[str, Any]]:
        """
        获取班级学习预警

        从 enhanced_analytics.py ~line 838 提取。
        对班级中每个学生检查近 7 天活跃度和掌握度。
        """
        # 获取班级学生
        student_rows = self.raw_query(
            "SELECT student_username FROM student_classes "
            "WHERE class_id = %s AND is_active = 1",
            (class_id,),
        )
        student_ids = [row["student_username"] for row in student_rows]

        warnings: List[Dict[str, Any]] = []

        for student_id in student_ids:
            # 检查最近 7 天活跃度
            recent_row = self.raw_query_one(
                "SELECT COUNT(*) AS cnt FROM conversations "
                "WHERE username = %s "
                "AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
                (student_id,),
            )
            recent_count = recent_row["cnt"] if recent_row else 0

            if recent_count == 0:
                warnings.append({
                    "student_id": student_id,
                    "severity": "high",
                    "type": "inactive",
                    "message": f"学生 {student_id} 最近7天无学习记录",
                })

            # 检查掌握度
            mastery_row = self.raw_query_one(
                "SELECT AVG(mastery_level) AS avg_mastery "
                "FROM knowledge_mastery "
                "WHERE student_id = %s",
                (student_id,),
            )
            avg_mastery = float(mastery_row["avg_mastery"]) if mastery_row and mastery_row["avg_mastery"] is not None else 0.0

            if avg_mastery < 0.4:
                warnings.append({
                    "student_id": student_id,
                    "severity": "medium",
                    "type": "low_mastery",
                    "message": f"学生 {student_id} 整体掌握度偏低 ({avg_mastery:.2%})",
                })

        return warnings

    def get_all_learning_warnings(self) -> List[Dict[str, Any]]:
        """
        获取所有学习预警（基于风险等级报告）

        从 enhanced_analytics.py ~line 890 提取。
        """
        rows = self.raw_query(
            "SELECT student_id, risk_level, overall_summary "
            "FROM student_analysis_reports "
            "WHERE risk_level IN ('high', 'medium') "
            "ORDER BY updated_at DESC "
            "LIMIT 50",
        )
        warnings = []
        for row in rows:
            summary = row.get("overall_summary") or ""
            warnings.append({
                "student_id": row["student_id"],
                "severity": row["risk_level"],
                "type": "risk_assessment",
                "message": summary[:100] if summary else "需要关注",
            })
        return warnings

    # ============================================================
    # 排名与比较
    # ============================================================

    def get_student_class_ranking(self, student_id: str, class_id: str) -> Dict[str, Any]:
        """
        获取学生在班级中的排名

        从 enhanced_analytics.py ~line 1072 提取。
        """
        rows = self.raw_query(
            "SELECT "
            "  sc.student_username, "
            "  COALESCE(AVG(km.mastery_level), 0) AS avg_mastery "
            "FROM student_classes sc "
            "LEFT JOIN knowledge_mastery km ON sc.student_username = km.student_id "
            "WHERE sc.class_id = %s AND sc.is_active = 1 "
            "GROUP BY sc.student_username "
            "ORDER BY avg_mastery DESC",
            (class_id,),
        )

        for idx, row in enumerate(rows, 1):
            if row["student_username"] == student_id:
                total = len(rows)
                return {
                    "rank": idx,
                    "total": total,
                    "percentile": round((total - idx + 1) / total * 100, 1) if total > 0 else 0,
                    "mastery": round(float(row["avg_mastery"]), 2),
                }

        return {
            "rank": None,
            "total": len(rows),
            "percentile": 0,
            "mastery": 0,
        }

    def compare_with_classmates(self, student_id: str, class_id: str) -> Dict[str, Any]:
        """
        与同班同学比较

        从 enhanced_analytics.py ~line 1102 提取。
        """
        # 获取学生自己的平均掌握度
        student_row = self.raw_query_one(
            "SELECT AVG(mastery_level) AS avg_mastery "
            "FROM knowledge_mastery "
            "WHERE student_id = %s",
            (student_id,),
        )
        student_mastery = float(student_row["avg_mastery"]) if student_row and student_row["avg_mastery"] is not None else 0.0

        # 获取班级平均掌握度
        class_row = self.raw_query_one(
            "SELECT AVG(km.mastery_level) AS avg_mastery "
            "FROM knowledge_mastery km "
            "JOIN student_classes sc ON km.student_id = sc.student_username "
            "WHERE sc.class_id = %s AND sc.is_active = 1",
            (class_id,),
        )
        class_average = float(class_row["avg_mastery"]) if class_row and class_row["avg_mastery"] is not None else 0.0

        difference = student_mastery - class_average
        if difference > 0:
            status = "above"
        elif difference < 0:
            status = "below"
        else:
            status = "equal"

        return {
            "student_mastery": round(student_mastery, 2),
            "class_average": round(class_average, 2),
            "difference": round(difference, 2),
            "status": status,
        }

    # ============================================================
    # 科目教师分布与覆盖率
    # ============================================================

    def get_subject_teacher_distribution(self) -> Dict[str, Any]:
        """
        获取科目教师分布

        从 enhanced_analytics.py ~line 1023 提取。
        """
        rows = self.raw_query(
            "SELECT subject_code, teacher_username, "
            "       COUNT(DISTINCT class_id) AS class_count "
            "FROM teacher_assignments "
            "WHERE is_active = 1 "
            "GROUP BY subject_code, teacher_username",
        )

        distribution: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"teachers": []})
        for row in rows:
            distribution[row["subject_code"]]["teachers"].append({
                "username": row["teacher_username"],
                "class_count": row["class_count"],
            })

        return dict(distribution)

    def calculate_subject_coverage(self) -> Dict[str, Any]:
        """
        计算科目覆盖率

        从 enhanced_analytics.py ~line 1045 提取。
        """
        # 总班级数
        total_row = self.raw_query_one(
            "SELECT COUNT(*) AS cnt FROM classes WHERE is_active = 1",
        )
        total_classes = total_row["cnt"] if total_row else 0

        # 各科目覆盖的班级数
        rows = self.raw_query(
            "SELECT subject_code, COUNT(DISTINCT class_id) AS covered_classes "
            "FROM teacher_assignments "
            "WHERE is_active = 1 "
            "GROUP BY subject_code",
        )

        coverage = {}
        for row in rows:
            covered = row["covered_classes"]
            coverage[row["subject_code"]] = {
                "covered": covered,
                "total": total_classes,
                "percentage": round(covered / total_classes * 100, 1) if total_classes > 0 else 0,
            }

        return coverage

    # ============================================================
    # 班级科目表现分析
    # ============================================================

    def analyze_class_subject_performance(
        self,
        class_id: str,
        subject: str,
    ) -> Dict[str, Any]:
        """
        分析班级科目表现

        从 enhanced_analytics.py ~line 976 提取。
        获取班级中每个学生在指定科目上的掌握度。
        """
        # 获取班级学生
        student_rows = self.raw_query(
            "SELECT student_username FROM student_classes "
            "WHERE class_id = %s AND is_active = 1",
            (class_id,),
        )
        student_ids = [row["student_username"] for row in student_rows]

        if not student_ids:
            return {"error": "No students in class"}

        # 分析每个学生的表现
        performances = []
        for student_id in student_ids:
            row = self.raw_query_one(
                "SELECT AVG(mastery_level) AS avg_mastery, "
                "       COUNT(DISTINCT topic) AS topics "
                "FROM knowledge_mastery "
                "WHERE student_id = %s AND subject = %s",
                (student_id, subject),
            )
            if row:
                performances.append({
                    "student_id": student_id,
                    "mastery": float(row["avg_mastery"]) if row["avg_mastery"] is not None else 0,
                    "topics_covered": row["topics"] or 0,
                })

        if performances:
            avg_class_mastery = sum(p["mastery"] for p in performances) / len(performances)
            return {
                "class_average": round(avg_class_mastery, 2),
                "student_count": len(performances),
                "top_performers": sorted(performances, key=lambda x: x["mastery"], reverse=True)[:5],
                "need_help": [p for p in performances if p["mastery"] < 0.5],
            }

        return {"error": "No performance data available"}
