"""
英文科錯題本處理器
"""

from typing import Dict, List, Optional

from app.domains.mistake_book.subject_handler import BaseSubjectHandler
from app.domains.vision.schemas import RecognitionTask


class EnglishHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "english"

    @property
    def display_name(self) -> str:
        return "英文"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "Grammar", "label": "Grammar 文法"},
            {"value": "Reading", "label": "Reading 閱讀"},
            {"value": "Writing", "label": "Writing 寫作"},
            {"value": "Vocabulary", "label": "Vocabulary 詞彙"},
            {"value": "Dictation", "label": "Dictation 默書"},
            {"value": "Listening", "label": "Listening 聆聽"},
        ]

    @property
    def error_types(self) -> List[str]:
        return [
            "concept_error", "calculation_error", "comprehension_gap",
            "expression_weak", "careless", "memory_error", "logic_error",
        ]

    def pick_recognition_task(self, category: str) -> RecognitionTask:
        category_lower = category.lower()
        if "dictation" in category_lower or "默書" in category:
            return RecognitionTask.DICTATION
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
        figure_section = f"\n## Figure Description\n{figure_description}\n" if figure_description else ""
        history_section = (
            f"\n## Student Learning History (use this to give more targeted advice)\n{student_history_context}\n"
            if student_history_context else ""
        )
        return f"""You are an experienced Hong Kong English teacher. Analyze the student's answer below.

## Question
{question_text}
{figure_section}
## Student's Answer
{student_answer}

## Available Knowledge Points
{knowledge_points_context}
{history_section}
## Analysis Requirements

Reply in JSON format:

```json
{{
  "is_correct": false,
  "correct_answer": "Model answer or corrected version",
  "error_type": "grammar error / spelling error / comprehension gap / expression weak / careless / vocabulary error",
  "error_analysis": "Explain the student's mistake in detail in English, helping the student understand what went wrong",
  "grammar_errors": ["List specific grammar errors if any"],
  "spelling_errors": ["List misspelled words with corrections: wrong → right"],
  "key_insight": "What this question tests (in English)",
  "improvement_tips": ["Improvement tip 1 in English", "Tip 2"],
  "knowledge_points": ["Select relevant point_codes from the list above"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

Notes:
- error_analysis, key_insight, and improvement_tips ALL in English
- error_type: concept_error / calculation_error / comprehension_gap / expression_weak / careless / memory_error / logic_error
- knowledge_points from the list above
- JSON output only"""

    def build_practice_prompt(
        self,
        target_points: List[Dict],
        question_count: int,
        difficulty: Optional[int] = None,
        student_mistakes_context: str = "",
    ) -> str:
        points_desc = "\n".join(
            f"- {p['point_name']}（{p.get('category', '')}）"
            for p in target_points
        )
        diff_note = f"Difficulty: {difficulty}/5" if difficulty else "Progressive difficulty (easy to hard)"

        return f"""You are a Hong Kong English teacher. Generate {question_count} practice questions based on these weak points.

## Target Knowledge Points
{points_desc}

## {diff_note}

## Student's Previous Mistakes
{student_mistakes_context if student_mistakes_context else "None"}

## Requirements
- Follow Hong Kong secondary school English curriculum style
- For grammar: error correction, fill-in-the-blank, sentence rewriting
- For dictation/spelling: word lists, sentence completion
- For reading: short passages with comprehension questions
- Provide ALL explanations in English

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
      "explanation": "Explain why this is the correct answer, help the student understand",
      "point_code": "knowledge point code",
      "difficulty": 3
    }}
  ]
}}
```
JSON output only."""


HANDLER_CLASS = EnglishHandler
