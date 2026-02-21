#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
教师-班级管理服务层 - TeacherClassService
==========================================
负责所有教师/班级管理相关业务逻辑：
- 教师班级查询与分配
- 班级学生管理与分析
- 学习预警
- 排名与同学比较
- 科目教师分布与覆盖率
- 班级科目表现分析
"""

import logging
from typing import Any, Dict, List, Optional

from app.domains.teacher_class.repository import TeacherClassRepository

logger = logging.getLogger(__name__)


class TeacherClassService:
    """
    教师-班级管理服务

    职责:
    1. 教师班级查询与分配
    2. 班级学生分析数据
    3. 学习预警（班级级别 / 全局级别）
    4. 学生排名与同学比较
    5. 科目教师分布与覆盖率统计
    6. 班级科目表现分析
    """

    def __init__(
        self,
        repo: Optional[TeacherClassRepository] = None,
    ):
        self._repo = repo or TeacherClassRepository()

    # ============================================================
    # 教师班级查询
    # ============================================================

    def get_teacher_classes(self, teacher_username: str) -> List[Dict[str, Any]]:
        """
        获取教师负责的班级列表

        Args:
            teacher_username: 教师用户名

        Returns:
            list: [{class_id, class_code, class_name, grade, subject_code, role}]
        """
        return self._repo.get_teacher_classes(teacher_username)

    def get_teacher_assignments(self, teacher_username: str) -> List[Dict[str, Any]]:
        """
        获取教师的班级分配详情（含班级名和年级）

        Args:
            teacher_username: 教师用户名

        Returns:
            list: [{id, teacher_username, class_id, subject_code, role, ...}]
        """
        return self._repo.get_teacher_assignments(teacher_username)

    def is_teacher_of_class(self, teacher_username: str, class_id: str) -> bool:
        """
        检查教师是否属于某班级

        Args:
            teacher_username: 教师用户名
            class_id: 班级 ID

        Returns:
            bool
        """
        return self._repo.is_teacher_of_class(teacher_username, class_id)

    # ============================================================
    # 教师分配
    # ============================================================

    def assign_teacher(
        self,
        teacher_id: str,
        class_id: str,
        subject: str,
        is_head_teacher: bool = False,
    ) -> bool:
        """
        分配教师到班级

        Args:
            teacher_id: 教师用户名/ID
            class_id: 班级 ID
            subject: 学科代码
            is_head_teacher: 是否为班主任

        Returns:
            bool: 分配是否成功
        """
        return self._repo.assign_teacher_to_class(
            teacher_id, class_id, subject, is_head_teacher,
        )

    # ============================================================
    # 班级学生
    # ============================================================

    def get_class_students(self, class_id: str) -> List[str]:
        """
        获取班级学生用户名列表

        Args:
            class_id: 班级 ID

        Returns:
            list[str]: 学生用户名列表
        """
        return self._repo.get_class_students(class_id)

    def get_class_students_with_analytics(self, class_id: str) -> List[Dict[str, Any]]:
        """
        获取班级学生及其分析数据

        Args:
            class_id: 班级 ID

        Returns:
            list: [{student_id, conversation_count, last_active, average_mastery}]
        """
        return self._repo.get_class_students_with_analytics(class_id)

    # ============================================================
    # 学习预警
    # ============================================================

    def get_class_warnings(self, class_id: str) -> List[Dict[str, Any]]:
        """
        获取班级学习预警

        对班级中每个学生检查近 7 天活跃度和掌握度。

        Args:
            class_id: 班级 ID

        Returns:
            list: [{student_id, severity, type, message}]
        """
        return self._repo.get_class_learning_warnings(class_id)

    def get_all_warnings(self) -> List[Dict[str, Any]]:
        """
        获取所有学习预警（基于风险等级报告）

        Returns:
            list: [{student_id, severity, type, message}]
        """
        return self._repo.get_all_learning_warnings()

    # ============================================================
    # 排名与比较
    # ============================================================

    def get_student_ranking(self, student_id: str, class_id: str) -> Dict[str, Any]:
        """
        获取学生在班级中的排名

        Args:
            student_id: 学生用户名
            class_id: 班级 ID

        Returns:
            dict: {rank, total, percentile, mastery}
        """
        return self._repo.get_student_class_ranking(student_id, class_id)

    def get_classmate_comparison(self, student_id: str, class_id: str) -> Dict[str, Any]:
        """
        与同班同学比较

        Args:
            student_id: 学生用户名
            class_id: 班级 ID

        Returns:
            dict: {student_mastery, class_average, difference, status}
        """
        return self._repo.compare_with_classmates(student_id, class_id)

    # ============================================================
    # 科目教师分布与覆盖率
    # ============================================================

    def get_teacher_distribution(self) -> Dict[str, Any]:
        """
        获取科目教师分布

        Returns:
            dict: {subject_code: {teachers: [{username, class_count}]}}
        """
        return self._repo.get_subject_teacher_distribution()

    def get_subject_coverage(self) -> Dict[str, Any]:
        """
        计算科目覆盖率

        Returns:
            dict: {subject_code: {covered, total, percentage}}
        """
        return self._repo.calculate_subject_coverage()

    # ============================================================
    # 班级科目表现分析
    # ============================================================

    def analyze_class_subject_performance(
        self,
        class_id: str,
        subject: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        分析班级科目表现

        Args:
            class_id: 班级 ID
            subject: 学科代码（可选，不传则返回空提示）

        Returns:
            dict: {class_average, student_count, top_performers, need_help}
                  or {error: str} 当无数据时
        """
        if not subject:
            return {"error": "Subject is required for class subject performance analysis"}
        return self._repo.analyze_class_subject_performance(class_id, subject)
