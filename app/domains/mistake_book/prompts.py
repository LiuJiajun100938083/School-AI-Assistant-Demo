"""
錯題本 AI Prompt 工程
====================
三科（中/英/數）專用的分析和出題 Prompt。
所有 Prompt 均針對香港中學課程設計。
"""

import json
from typing import List, Dict, Optional


# ============================================================
# 錯題分析 Prompt（由 Qwen3:30B 執行）
# ============================================================

def build_analysis_prompt(
    subject: str,
    question_text: str,
    student_answer: str,
    knowledge_points_context: str = "",
    figure_description: str = "",
    student_history_context: str = "",
) -> str:
    """
    構建 AI 分析 prompt

    Args:
        subject: 科目 (chinese/math/english)
        question_text: 題目文字
        student_answer: 學生答案
        knowledge_points_context: 該科目的知識點列表（供 AI 關聯）
        figure_description: 圖形/圖表的文字描述（由 Vision 模型提取）
        student_history_context: 學生歷史薄弱點上下文（累積分析）
    """
    builder = _ANALYSIS_BUILDERS.get(subject, _build_generic_analysis)
    return builder(question_text, student_answer, knowledge_points_context, figure_description, student_history_context)


def _build_chinese_analysis(
    question: str, answer: str, kp_context: str, figure_desc: str = "", history: str = ""
) -> str:
    figure_section = f"\n## 題目附圖描述\n{figure_desc}\n" if figure_desc else ""
    history_section = f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{history}\n" if history else ""
    return f"""你是一位經驗豐富的香港中文科教師。請仔細分析以下學生的答題情況。

## 題目
{question}
{figure_section}
## 學生答案
{answer}

## 可用的知識點列表
{kp_context}
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


def _build_math_analysis(
    question: str, answer: str, kp_context: str, figure_desc: str = "", history: str = ""
) -> str:
    figure_section = ""
    if figure_desc:
        figure_section = f"""
## 題目附圖描述（重要：此為圖片中的幾何圖形/座標圖的文字描述，分析時必須考慮）
{figure_desc}
"""
    history_section = f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{history}\n" if history else ""
    return f"""你是一位經驗豐富的香港數學科教師。請逐步檢查以下學生的解題過程。

## 題目
{question}
{figure_section}
## 學生解答
{answer}

## 可用的知識點列表
{kp_context}
{history_section}
## 分析要求

請以 JSON 格式回覆：

```json
{{
  "is_correct": false,
  "correct_answer": "完整的正確解法（逐步展示，使用 LaTeX 表示數學公式）",
  "error_type": "計算錯誤/概念錯誤/公式記錯/邏輯跳步/粗心大意/方法錯誤",
  "first_error_step": "第一個出錯的步驟描述",
  "error_analysis": "詳細分析錯誤原因，指出哪一步出了問題",
  "key_insight": "這道題考查的核心數學概念",
  "improvement_tips": ["改進建議1", "改進建議2"],
  "knowledge_points": ["從知識點列表中選擇最相關的 point_code"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

注意：
- 用繁體中文分析，數學公式用 LaTeX
- 定位到第一個出錯的步驟
- error_type 只能選：concept_error / calculation_error / careless / memory_error / logic_error / method_error
- knowledge_points 從上方列表中選 point_code
- 只輸出 JSON"""


def _build_english_analysis(
    question: str, answer: str, kp_context: str, figure_desc: str = "", history: str = ""
) -> str:
    figure_section = f"\n## Figure Description\n{figure_desc}\n" if figure_desc else ""
    history_section = f"\n## Student Learning History (use this to give more targeted advice)\n{history}\n" if history else ""
    return f"""You are an experienced Hong Kong English teacher. Analyze the student's answer below.

## Question
{question}
{figure_section}
## Student's Answer
{answer}

## Available Knowledge Points
{kp_context}
{history_section}
## Analysis Requirements

Reply in JSON format:

```json
{{
  "is_correct": false,
  "correct_answer": "Model answer or corrected version",
  "error_type": "grammar error / spelling error / comprehension gap / expression weak / careless / vocabulary error",
  "error_analysis": "用繁體中文詳細解釋學生的錯誤，幫助學生理解（Explain in Traditional Chinese to help the student understand）",
  "grammar_errors": ["List specific grammar errors if any"],
  "spelling_errors": ["List misspelled words with corrections: wrong → right"],
  "key_insight": "What this question tests (in Traditional Chinese)",
  "improvement_tips": ["Improvement tip 1 (繁體中文)", "Tip 2"],
  "knowledge_points": ["Select relevant point_codes from the list above"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

Notes:
- error_analysis and improvement_tips in Traditional Chinese (繁體中文)
- error_type: concept_error / calculation_error / comprehension_gap / expression_weak / careless / memory_error / logic_error
- knowledge_points from the list above
- JSON output only"""


def _build_generic_analysis(
    question: str, answer: str, kp_context: str, figure_desc: str = "", history: str = ""
) -> str:
    figure_note = f"\n圖形描述：{figure_desc}" if figure_desc else ""
    history_note = f"\n學生歷史：{history}" if history else ""
    return f"""請分析以下學生的答題情況。

題目：{question}{figure_note}
學生答案：{answer}
知識點列表：{kp_context}{history_note}

請以 JSON 格式回覆：
{{
  "is_correct": false,
  "correct_answer": "正確答案",
  "error_type": "錯誤類型",
  "error_analysis": "錯誤分析",
  "improvement_tips": ["建議"],
  "knowledge_points": ["相關知識點"],
  "difficulty_level": 3,
  "confidence": 0.8
}}
只輸出 JSON。"""


_ANALYSIS_BUILDERS = {
    "chinese": _build_chinese_analysis,
    "math": _build_math_analysis,
    "english": _build_english_analysis,
}


# ============================================================
# 練習題生成 Prompt（由 Qwen3:30B 執行）
# ============================================================

def build_practice_prompt(
    subject: str,
    target_points: List[Dict],
    question_count: int,
    difficulty: Optional[int] = None,
    student_mistakes_context: str = "",
) -> str:
    """
    構建出題 prompt

    Args:
        subject: 科目
        target_points: 目標知識點列表 [{point_code, point_name, category}]
        question_count: 題目數量
        difficulty: 難度 1-5（None = 自動匹配知識點難度）
        student_mistakes_context: 學生此前的典型錯題（供參考）
    """
    builder = _PRACTICE_BUILDERS.get(subject, _build_generic_practice)
    return builder(target_points, question_count, difficulty, student_mistakes_context)


def _build_chinese_practice(
    points: List[Dict], count: int, diff: Optional[int], ctx: str
) -> str:
    points_desc = "\n".join(
        f"- {p['point_name']}（{p.get('category', '')}）: {p.get('description', '')}"
        for p in points
    )
    diff_note = f"難度要求：{diff}/5" if diff else "難度逐步遞進（由易到難）"

    return f"""你是一位香港中文科教師，請根據以下薄弱知識點，出 {count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤（供參考出題方向）
{ctx if ctx else "無"}

## 出題要求
- 題型要符合香港中學考試格式（DSE 風格）
- 使用繁體中文
- 每道題獨立、完整
- 涵蓋所列的知識點

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


def _build_math_practice(
    points: List[Dict], count: int, diff: Optional[int], ctx: str
) -> str:
    points_desc = "\n".join(
        f"- {p['point_name']}（{p.get('category', '')}）"
        for p in points
    )
    diff_note = f"難度要求：{diff}/5" if diff else "難度逐步遞進"

    return f"""你是一位香港數學科教師，請根據以下薄弱知識點，出 {count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤
{ctx if ctx else "無"}

## 出題要求
- 符合香港中學數學課程（DSE 風格）
- 數學公式使用 LaTeX 標記
- 提供不同數值但方法相同的變式題
- 包含完整的解題步驟

## 輸出格式（JSON）
```json
{{
  "questions": [
    {{
      "index": 1,
      "question": "題目（LaTeX 公式用 $ 包裹）",
      "question_type": "short_answer / multiple_choice / fill_blank",
      "options": null,
      "correct_answer": "完整解題步驟和最終答案",
      "explanation": "解析（繁體中文，公式用 LaTeX）",
      "point_code": "對應的知識點編碼",
      "difficulty": 3
    }}
  ]
}}
```
只輸出 JSON。"""


def _build_english_practice(
    points: List[Dict], count: int, diff: Optional[int], ctx: str
) -> str:
    points_desc = "\n".join(
        f"- {p['point_name']}（{p.get('category', '')}）"
        for p in points
    )
    diff_note = f"Difficulty: {diff}/5" if diff else "Progressive difficulty (easy to hard)"

    return f"""You are a Hong Kong English teacher. Generate {count} practice questions based on these weak points.

## Target Knowledge Points
{points_desc}

## {diff_note}

## Student's Previous Mistakes
{ctx if ctx else "None"}

## Requirements
- Follow Hong Kong secondary school English curriculum style
- For grammar: error correction, fill-in-the-blank, sentence rewriting
- For dictation/spelling: word lists, sentence completion
- For reading: short passages with comprehension questions
- Provide explanations in Traditional Chinese (繁體中文)

## Output Format (JSON)
```json
{{
  "questions": [
    {{
      "index": 1,
      "question": "Question text in English",
      "question_type": "multiple_choice / fill_blank / error_correction / short_answer",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "Correct answer",
      "explanation": "解析（用繁體中文解釋，幫助學生理解）",
      "point_code": "knowledge point code",
      "difficulty": 3
    }}
  ]
}}
```
JSON output only."""


def _build_generic_practice(
    points: List[Dict], count: int, diff: Optional[int], ctx: str
) -> str:
    points_desc = "\n".join(f"- {p['point_name']}" for p in points)
    return f"""請根據以下知識點出 {count} 道練習題：
{points_desc}

輸出 JSON 格式，每題包含 question, correct_answer, explanation, point_code, difficulty。
只輸出 JSON。"""


_PRACTICE_BUILDERS = {
    "chinese": _build_chinese_practice,
    "math": _build_math_practice,
    "english": _build_english_practice,
}


# ============================================================
# 薄弱知識點報告 Prompt
# ============================================================

def build_weakness_report_prompt(
    subject: str,
    weak_points: List[Dict],
    error_stats: List[Dict],
    student_name: str = "同學",
) -> str:
    """構建薄弱知識點摘要 prompt"""
    points_text = "\n".join(
        f"- {wp.get('point_name', '')}: 掌握度 {wp.get('mastery_level', 0)}%, "
        f"錯題數 {wp.get('mistake_count', 0)}, 趨勢 {wp.get('trend', 'stable')}"
        for wp in weak_points
    )
    errors_text = "\n".join(
        f"- {es.get('error_type', '未知')}: {es.get('cnt', 0)} 次"
        for es in error_stats
    )

    subject_names = {"chinese": "中文", "math": "數學", "english": "英文"}
    subj_name = subject_names.get(subject, subject)

    return f"""你是一位關心學生學習的香港中學教師。請根據以下數據，為學生撰寫一份{subj_name}科學習分析摘要。

## 學生的薄弱知識點
{points_text if points_text else "暫無數據"}

## 錯誤類型分佈
{errors_text if errors_text else "暫無數據"}

## 要求
1. 用繁體中文撰寫
2. 語氣溫暖鼓勵，不要批評
3. 指出 2-3 個最需要關注的知識點
4. 給出具體、可操作的改進建議
5. 適當肯定學生已有的進步

## 輸出格式（JSON）
```json
{{
  "summary": "整體學習情況簡述（2-3句）",
  "key_weaknesses": ["最需關注的知識點1", "知識點2"],
  "recommendations": ["具體建議1", "具體建議2", "具體建議3"],
  "encouragement": "一句鼓勵的話"
}}
```
只輸出 JSON。"""
