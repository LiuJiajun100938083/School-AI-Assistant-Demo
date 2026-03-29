"""
錯題本 AI Prompt 代理層
======================
向後兼容的薄代理，所有 Prompt 構建委託到 SubjectHandlerRegistry。
科目專用的 Prompt 已拆分到 subjects/ 包中各自的 Handler 文件。
"""

from typing import List, Dict, Optional

from app.domains.mistake_book.subject_handler import (
    BaseSubjectHandler,
    SubjectHandlerRegistry,
)

# 英文班回覆語言指令（偵測到英文題目時統一追加，不分科目）
_ENGLISH_ANALYSIS_NOTE = (
    "\n\nIMPORTANT — Language requirement: "
    "The question is in English. ALL text fields in your JSON response "
    "(error_analysis, correct_answer, key_insight, improvement_tips, "
    "first_error_step, and any other descriptive fields) "
    "MUST be written in English. Use English for all explanations and analysis."
)
_ENGLISH_PRACTICE_NOTE = (
    "\n\nIMPORTANT — Language requirement: "
    "The student studies in an English-medium class. ALL text fields "
    "(question, correct_answer, explanation, and any other descriptive fields) "
    "MUST be written in English."
)


def build_analysis_prompt(
    subject: str,
    question_text: str,
    student_answer: str,
    knowledge_points_context: str = "",
    figure_description: str = "",
    student_history_context: str = "",
    lang: str = "",
) -> str:
    """
    構建 AI 分析 prompt（委託到對應科目的 Handler）

    Args:
        subject: 科目代碼 (如 chinese/math/english 或任何已註冊科目)
        question_text: 題目文字
        student_answer: 學生答案
        knowledge_points_context: 該科目的知識點列表（供 AI 關聯）
        figure_description: 圖形/圖表的文字描述（由 Vision 模型提取）
        student_history_context: 學生歷史薄弱點上下文（累積分析）
        lang: 用戶語言偏好 ("en" / "zh" / "" 表示自動偵測)
    """
    handler = SubjectHandlerRegistry.get(subject)
    prompt = handler.build_analysis_prompt(
        question_text, student_answer, knowledge_points_context,
        figure_description, student_history_context,
    )
    # Append English instruction if explicitly requested or auto-detected
    if lang == "en" or (not lang and BaseSubjectHandler._is_english_text(question_text)):
        prompt += _ENGLISH_ANALYSIS_NOTE
    return prompt


def build_practice_prompt(
    subject: str,
    target_points: List[Dict],
    question_count: int,
    difficulty: Optional[int] = None,
    student_mistakes_context: str = "",
    student_history_context: str = "",
    lang: str = "",
) -> str:
    """
    構建出題 prompt（委託到對應科目的 Handler）

    Args:
        subject: 科目代碼
        target_points: 目標知識點列表 [{point_code, point_name, category}]
        question_count: 題目數量
        difficulty: 難度 1-5（None = 自動匹配知識點難度）
        student_mistakes_context: 學生此前的典型錯題（供參考）
        student_history_context: 結構化學生畫像上下文（掌握度、錯誤分佈、去重）
        lang: 用戶語言偏好 ("en" / "zh" / "" 表示自動偵測)
    """
    handler = SubjectHandlerRegistry.get(subject)
    prompt = handler.build_practice_prompt(
        target_points, question_count, difficulty,
        student_mistakes_context, student_history_context,
    )
    # Append English instruction if explicitly requested or auto-detected
    if lang == "en" or (not lang and BaseSubjectHandler._is_english_text(student_mistakes_context)):
        prompt += _ENGLISH_PRACTICE_NOTE
    return prompt


def build_weakness_report_prompt(
    subject: str,
    weak_points: List[Dict],
    error_stats: List[Dict],
    student_name: str = "同學",
    lang: str = "",
) -> str:
    """構建薄弱知識點摘要 prompt（委託到對應科目的 Handler）"""
    handler = SubjectHandlerRegistry.get(subject)
    prompt = handler.build_weakness_report_prompt(
        weak_points, error_stats, student_name,
    )
    if lang == "en":
        prompt += (
            "\n\nIMPORTANT — Language requirement: "
            "ALL text in your response MUST be written in English."
        )
    return prompt
