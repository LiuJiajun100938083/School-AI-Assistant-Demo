"""
中文科錯題本處理器
"""

from typing import Dict, List, Optional

from app.domains.mistake_book.subject_handler import BaseSubjectHandler
from app.domains.vision.schemas import RecognitionTask


class ChineseHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "chinese"

    @property
    def display_name(self) -> str:
        return "中文"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "閱讀理解", "label": "閱讀理解"},
            {"value": "語文基礎", "label": "語文基礎"},
            {"value": "文言文", "label": "文言文"},
            {"value": "寫作", "label": "寫作"},
            {"value": "默書", "label": "默書"},
            {"value": "修辭手法", "label": "修辭手法"},
            {"value": "語法", "label": "語法"},
        ]

    @property
    def error_types(self) -> List[str]:
        return [
            "concept_error", "comprehension_gap", "expression_weak",
            "careless", "memory_error", "logic_error", "method_error",
        ]

    def pick_recognition_task(self, category: str) -> RecognitionTask:
        if "寫作" in category:
            return RecognitionTask.ESSAY
        return RecognitionTask.QUESTION_AND_ANSWER

    # ---- Prompt 構建 ----

    def build_analysis_prompt(
        self,
        question_text: str,
        student_answer: str,
        knowledge_points_context: str = "",
        figure_description: str = "",
        student_history_context: str = "",
    ) -> str:
        figure_section = f"\n## 題目附圖描述\n{figure_description}\n" if figure_description else ""
        history_section = (
            f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{student_history_context}\n"
            if student_history_context else ""
        )
        return f"""你是一位經驗豐富的香港中文科教師。請仔細分析以下學生的答題情況。

## 題目
{question_text}
{figure_section}
## 學生答案
{student_answer}

## 可用的知識點列表
{knowledge_points_context}
{history_section}
## 分析要求

請以 JSON 格式回覆，包含以下字段：

```json
{{
  "is_correct": false,
  "correct_answer": "參考答案（完整且具教學意義）",
  "error_type": "概念理解偏差/表達不準確/遺漏要點/文言文翻譯錯誤/修辭判斷錯誤/粗心大意",
  "error_analysis": "詳細分析學生答錯的原因（用繁體中文，語氣鼓勵正面）",
  "key_insight": "這道題的核心考點是什麼",
  "improvement_tips": ["改進建議1", "改進建議2"],
  "knowledge_points": ["從知識點列表中選擇最相關的 point_code"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

注意：
- 使用繁體中文
- 語氣要鼓勵、正面，避免批評
- error_type 只能選：concept_error / comprehension_gap / expression_weak / careless / memory_error / logic_error / method_error
- knowledge_points 從上方列表中選 point_code（1-3 個最相關的）
- difficulty_level 範圍 1-5
- 只輸出 JSON"""

    def build_practice_prompt(
        self,
        target_points: List[Dict],
        question_count: int,
        difficulty: Optional[int] = None,
        student_mistakes_context: str = "",
        student_history_context: str = "",
    ) -> str:
        points_desc = "\n".join(
            f"- {p['point_name']}（{p.get('category', '')}）: {p.get('description', '')}"
            for p in target_points
        )
        diff_note = f"難度要求：{difficulty}/5" if difficulty else "難度逐步遞進（由易到難）"
        history_section = f"\n{student_history_context}\n" if student_history_context else ""
        num_points = len(target_points)

        return f"""你是一位香港中文科教師，請根據以下薄弱知識點，出 {question_count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤（供參考出題方向）
{student_mistakes_context if student_mistakes_context else "無"}
{history_section}
## 出題要求
- 題型要符合香港中學考試格式（DSE 風格）
- 使用繁體中文
- 每道題獨立、完整
- 涵蓋所列的知識點

## 題目分配規則
- 每個目標知識點至少 1 題（共 {num_points} 個知識點，{question_count} 題）
- 不可讓超過一半的題目集中在同一個知識點（除非只有 1 個知識點）
- 掌握度低的知識點出基礎題（字詞理解、顯性信息提取）
- 掌握度中等的知識點出應用題（修辭作用、段意概括、語境分析）
- 掌握度高的知識點出綜合題（篇章主旨、表達手法比較、遷移寫作）

## 輸出格式（JSON）
```json
{{
  "questions": [
    {{
      "index": 1,
      "question": "題目內容",
      "question_type": "short_answer / multiple_choice / fill_blank",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "正確答案",
      "explanation": "解析（繁體中文）",
      "point_code": "對應的知識點編碼",
      "difficulty": 3
    }}
  ]
}}
```
只輸出 JSON。"""


HANDLER_CLASS = ChineseHandler
