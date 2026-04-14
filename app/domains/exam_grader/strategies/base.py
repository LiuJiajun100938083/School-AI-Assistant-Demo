"""
试卷批阅 — 科目评分策略抽象接口
================================
每个科目实现此接口，提供科目特定的 prompt 模板和评分规则。
Service 层通过策略模式调用，不关心具体科目逻辑。
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, Optional


class SubjectGradingStrategy(ABC):
    """科目评分策略基类"""

    @property
    @abstractmethod
    def subject_code(self) -> str:
        """科目代码，如 'ict'"""

    @property
    @abstractmethod
    def subject_name(self) -> str:
        """科目显示名，如 '電腦科 (ICT)'"""

    @abstractmethod
    def build_question_extraction_prompt(self, page_count: int = 1) -> str:
        """
        构建题目提取 prompt。
        用于视觉模型从干净试卷中提取所有题目。
        """

    @abstractmethod
    def build_answer_sheet_extraction_prompt(self) -> str:
        """
        构建答案卷提取 prompt。
        用于视觉模型从带红注的答案卷中提取正确答案。
        """

    @abstractmethod
    def build_answer_generation_prompt(
        self,
        question_text: str,
        question_type: str,
        max_marks: float,
        rag_context: str,
    ) -> str:
        """
        构建 RAG+LLM 答案生成 prompt。
        用于在无答案卷时，根据知识库生成参考答案。
        """

    @abstractmethod
    def build_student_ocr_prompt(self) -> str:
        """
        构建学生答卷 OCR prompt。
        用于视觉模型从学生手写答卷中提取答案。
        """

    @abstractmethod
    def build_student_header_ocr_prompt(self) -> str:
        """
        构建卷头信息 OCR prompt。
        用于从试卷卷头提取学生姓名、班别、学号。
        """

    @abstractmethod
    def build_grading_prompt(
        self,
        question_text: str,
        reference_answer: str,
        student_answer: str,
        max_marks: float,
        grading_mode: str,
    ) -> str:
        """
        构建简答题 LLM 评分 prompt。
        grading_mode: 'strict' / 'moderate' / 'lenient'
        """
