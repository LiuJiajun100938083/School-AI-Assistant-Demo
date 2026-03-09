"""
數學科錯題本處理器
"""

from typing import Dict, List, Optional

from app.domains.mistake_book.subject_handler import BaseSubjectHandler
from app.domains.vision.schemas import RecognitionTask


class MathHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "math"

    @property
    def display_name(self) -> str:
        return "數學"

    @property
    def categories(self) -> List[Dict]:
        return [
            {"value": "代數", "label": "代數"},
            {"value": "幾何", "label": "幾何"},
            {"value": "三角學", "label": "三角學"},
            {"value": "統計與概率", "label": "統計與概率"},
            {"value": "微積分", "label": "微積分"},
            {"value": "數列與級數", "label": "數列與級數"},
            {"value": "坐標幾何", "label": "坐標幾何"},
        ]

    @property
    def error_types(self) -> List[str]:
        return [
            "concept_error", "calculation_error", "careless",
            "memory_error", "logic_error", "method_error",
        ]

    @property
    def ui_features(self) -> Dict:
        return {"katex": True}

    @property
    def supports_confidence_breakdown(self) -> bool:
        return True

    def pick_recognition_task(self, category: str) -> RecognitionTask:
        return RecognitionTask.MATH_SOLUTION

    # ---- Prompt 構建 ----

    def build_analysis_prompt(
        self,
        question_text: str,
        student_answer: str,
        knowledge_points_context: str = "",
        figure_description: str = "",
        student_history_context: str = "",
    ) -> str:
        figure_section = ""
        if figure_description:
            figure_section = f"""
## 題目附圖（結構化幾何描述 — 4 層約束模型）

以下是由視覺模型從題目圖片中提取的結構化幾何描述。
**分析時你必須充分利用這些信息，就像你親眼看到了圖形一樣。**

```
{figure_description}
```

### 如何閱讀此 4 層 Schema：

**Layer 1 — objects（幾何對象）：**
圖中的所有幾何實體。每個對象有唯一 id（如 P_A, S_AB, Tri_ABC）。後續所有引用都使用 id。

**Layer 2 — measurements（量測）：**
已知的邊長、角度等。每條量測有 `source` 字段：
- `"figure"`：從圖上讀取的標註
- `"question_text"`：題目文字中明確給出的條件
- `"inferred"`：模型推斷出的（可靠性較低，需謹慎使用）

**Layer 3 — relationships（幾何關係）：**
平行、垂直、全等、相似、中點、共線等。每條關係同樣有 `source` 字段。
**優先引用 source="figure" 和 source="question_text" 的關係做推理。**
**對 source="inferred" 的關係保持謹慎，不要當作已知條件直接使用。**

**Layer 4 — task（任務信息）：**
已知條件摘要、求解目標、輔助線、圖上標註文字。

⚠️ `overall_description` 僅為人讀摘要，非權威字段——請以 objects/measurements/relationships 為準。

請在分析中引用具體的幾何元素和關係，例如「根據已知 S_AB // S_CD（source: question_text），可知……」
"""
        history_section = (
            f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{student_history_context}\n"
            if student_history_context else ""
        )
        return f"""你是一位經驗豐富的香港數學科教師。請逐步檢查以下學生的解題過程。

## 題目
{question_text}
{figure_section}
## 學生解答
{student_answer}

## 可用的知識點列表
{knowledge_points_context}
{history_section}
## 分析要求

請以 JSON 格式回覆：

```json
{{
  "is_correct": false,
  "correct_answer": "完整的正確解法（逐步展示，使用 LaTeX 表示數學公式。如涉及幾何，請引用圖中具體元素）",
  "error_type": "計算錯誤/概念錯誤/公式記錯/邏輯跳步/粗心大意/方法錯誤",
  "first_error_step": "第一個出錯的步驟描述",
  "error_analysis": "詳細分析錯誤原因，指出哪一步出了問題（如涉及幾何圖形，請結合圖中元素和關係解釋）",
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
- 如果題目包含幾何圖形描述，你必須在分析中引用圖中的具體元素（如點、線、角、圓的名稱和性質），讓學生能對照原圖理解
- error_type 只能選：concept_error / calculation_error / careless / memory_error / logic_error / method_error
- knowledge_points 從上方列表中選 point_code
- 只輸出 JSON"""

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
        diff_note = f"難度要求：{difficulty}/5" if difficulty else "難度逐步遞進"

        return f"""你是一位香港數學科教師，請根據以下薄弱知識點，出 {question_count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤
{student_mistakes_context if student_mistakes_context else "無"}

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


HANDLER_CLASS = MathHandler
