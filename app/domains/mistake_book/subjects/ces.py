"""
公民與社會發展科（公民科）錯題本處理器
"""

from typing import Dict, List

from app.domains.mistake_book.subject_handler import BaseSubjectHandler


class CESHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "ces"

    @property
    def display_name(self) -> str:
        return "公民"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "一國兩制", "label": "「一國兩制」下的香港"},
            {"value": "改革開放", "label": "改革開放以來的國家"},
            {"value": "互聯相依", "label": "互聯相依的當代世界"},
        ]

    def build_analysis_prompt(self, question_text, student_answer,
                              knowledge_points_context="", figure_description="",
                              student_history_context=""):
        figure_note = f"\n資料描述：{figure_description}" if figure_description else ""
        history_note = f"\n學生歷史：{student_history_context}" if student_history_context else ""
        return f"""你是一位經驗豐富的香港中學公民與社會發展科老師，請分析以下學生的答題情況。

題目：{question_text}{figure_note}
學生答案：{student_answer}
知識點列表：{knowledge_points_context}{history_note}

注意概念的準確性、資料運用和多角度分析。

請以 JSON 格式回覆：
{{
  "is_correct": false,
  "correct_answer": "正確答案",
  "error_type": "錯誤類型",
  "error_analysis": "錯誤分析（用繁體中文）",
  "improvement_tips": ["建議"],
  "knowledge_points": ["相關知識點"],
  "difficulty_level": 3,
  "confidence": 0.8
}}
只輸出 JSON。"""

    def build_practice_prompt(self, target_points, question_count,
                              difficulty=None, student_mistakes_context="",
                              student_history_context=""):
        points_desc = "\n".join(f"- {p['point_name']}" for p in target_points)
        diff_note = f"\n難度等級：{difficulty}/5" if difficulty else ""
        history_section = f"\n{student_history_context}\n" if student_history_context else ""
        return f"""你是一位香港中學公民與社會發展科老師，請根據以下知識點出 {question_count} 道練習題：
{points_desc}{diff_note}
{history_section}
題目應涵蓋概念理解、資料分析和時事應用。
輸出 JSON 格式，每題包含 question, correct_answer, explanation, point_code, difficulty。
只輸出 JSON。"""


HANDLER_CLASS = CESHandler
