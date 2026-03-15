"""
資訊與通訊科技（ICT）錯題本處理器
"""

from typing import Dict, List

from app.domains.mistake_book.subject_handler import BaseSubjectHandler


class ICTHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "ICT"

    @property
    def display_name(self) -> str:
        return "資訊與通訊科技"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "資訊處理", "label": "資訊處理"},
            {"value": "程式編寫", "label": "程式編寫"},
            {"value": "電腦系統", "label": "電腦系統"},
            {"value": "互聯網及其應用", "label": "互聯網及其應用"},
            {"value": "數據通訊及建網", "label": "數據通訊及建網"},
            {"value": "資訊安全", "label": "資訊安全"},
            {"value": "數據庫", "label": "數據庫"},
            {"value": "多媒體", "label": "多媒體"},
        ]

    def build_analysis_prompt(self, question_text, student_answer,
                              knowledge_points_context="", figure_description="",
                              student_history_context=""):
        figure_note = f"\n圖形/截圖描述：{figure_description}" if figure_description else ""
        history_note = f"\n學生歷史：{student_history_context}" if student_history_context else ""
        return f"""你是一位經驗豐富的香港中學ICT老師，請分析以下學生的答題情況。

題目：{question_text}{figure_note}
學生答案：{student_answer}
知識點列表：{knowledge_points_context}{history_note}

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
        return f"""你是一位香港中學ICT老師，請根據以下知識點出 {question_count} 道練習題：
{points_desc}{diff_note}
{history_section}
題目應涵蓋概念理解和實際應用。
輸出 JSON 格式，每題包含 question, correct_answer, explanation, point_code, difficulty。
只輸出 JSON。"""


HANDLER_CLASS = ICTHandler
