"""
地理科錯題本處理器
"""

from typing import Dict, List

from app.domains.mistake_book.subject_handler import BaseSubjectHandler


class GeographyHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "geography"

    @property
    def display_name(self) -> str:
        return "地理"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "機會與風險", "label": "機會與風險（自然災害）"},
            {"value": "管理河流和海岸", "label": "管理河流和海岸"},
            {"value": "轉變中的工業區位", "label": "轉變中的工業區位"},
            {"value": "建設可持續城市", "label": "建設可持續城市"},
            {"value": "對抗饑荒", "label": "對抗饑荒"},
            {"value": "氣候變化", "label": "氣候變化"},
            {"value": "地圖閱讀", "label": "地圖閱讀與實地考察"},
        ]

    def build_analysis_prompt(self, question_text, student_answer,
                              knowledge_points_context="", figure_description="",
                              student_history_context=""):
        figure_note = f"\n地圖/圖表描述：{figure_description}" if figure_description else ""
        history_note = f"\n學生歷史：{student_history_context}" if student_history_context else ""
        return f"""你是一位經驗豐富的香港中學地理科老師，請分析以下學生的答題情況。

題目：{question_text}{figure_note}
學生答案：{student_answer}
知識點列表：{knowledge_points_context}{history_note}

注意地理概念的準確性、地圖閱讀技巧和論述的完整性。

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
        return f"""你是一位香港中學地理科老師，請根據以下知識點出 {question_count} 道練習題：
{points_desc}{diff_note}
{history_section}
題目應涵蓋概念理解、地圖閱讀和數據分析。
輸出 JSON 格式，每題包含 question, correct_answer, explanation, point_code, difficulty。
只輸出 JSON。"""


HANDLER_CLASS = GeographyHandler
