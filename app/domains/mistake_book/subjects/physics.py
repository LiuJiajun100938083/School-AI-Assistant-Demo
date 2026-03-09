"""
物理科錯題本處理器
"""

from typing import Dict, List, Optional

from app.domains.mistake_book.subject_handler import BaseSubjectHandler
from app.domains.vision.schemas import RecognitionTask


class PhysicsHandler(BaseSubjectHandler):

    @property
    def subject_code(self) -> str:
        return "physics"

    @property
    def display_name(self) -> str:
        return "物理"

    @property
    def categories(self) -> List[Dict]:
        return [
            # Compulsory Part
            {"value": "熱與氣體", "label": "熱與氣體"},
            {"value": "力和運動", "label": "力和運動"},
            {"value": "波動", "label": "波動"},
            {"value": "電和磁", "label": "電和磁"},
            {"value": "放射現象與核能", "label": "放射現象與核能"},
            # Elective Part
            {"value": "天文與航天科學", "label": "天文與航天科學（選修）"},
            {"value": "原子世界", "label": "原子世界（選修）"},
            {"value": "能源和能源的使用", "label": "能源和能源的使用（選修）"},
            {"value": "醫學物理", "label": "醫學物理（選修）"},
            # SBA
            {"value": "探究實驗", "label": "探究實驗 / SBA"},
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
        if "探究" in category or "SBA" in category.upper():
            return RecognitionTask.QUESTION_AND_ANSWER
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
## 題目附圖（物理圖像結構化描述）

以下是由視覺模型從題目圖片中提取的物理圖像描述。
**分析時你必須充分利用這些信息，就像你親眼看到了圖形一樣。**

```
{figure_description}
```

### 如何閱讀此結構化描述：

**figure_type：** 圖像類型（如 force_diagram、circuit_schematic、wave_snapshot 等）。

**diagram_entities：** 圖中所有物理實體（物體、力、元件、波形、透鏡、裝置等）。
每個 entity 有 type、label 和具體屬性（如 mass、direction、magnitude、component_type 等）。

**diagram_relations：** 物理關係（力的方向、串並聯連接、波傳播方向、磁場方向等）。
這些是已從圖中提取的結構化關係，請直接引用。

**quantities：** 已知物理量（含符號、數值、單位）。
**優先使用 quantities 中的數值做計算。**

**option_figures：** 若選項本身是圖（如受力分析圖選擇題），每個選項的摘要。

**needs_review / review_warnings：** 若為 true，表示部分信息可能不準確，請謹慎使用。

請在分析中引用具體的物理元素，例如「根據圖中 R₁ 與 R₂ 串聯，總電阻 = R₁ + R₂ = ...」
"""
        history_section = (
            f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{student_history_context}\n"
            if student_history_context else ""
        )
        return f"""你是一位經驗豐富的香港 DSE 物理科教師。請逐步檢查以下學生的解題過程。

## 題目
{question_text}
{figure_section}
## 學生解答
{student_answer}

## 可用的知識點列表
{knowledge_points_context}
{history_section}
## 分析要求

請按照以下 7 步檢查順序分析：
1. 物理概念正確性（定律選用、適用條件）
2. 公式選用（F=ma vs p=mv？動能定理 vs 機械能守恆？）
3. 代入數值與單位換算（cm→m、°C→K、kW→W、mA→A）
4. 物理量方向/正負號約定（向量 vs 標量、力的方向、電流方向）
5. 計算過程與有效數字
6. 圖像/電路/波形解讀（結合 figure_description 中的具體元素）
7. 解釋是否符合物理因果（答案是否合理）

請以 JSON 格式回覆：

```json
{{
  "is_correct": false,
  "correct_answer": "完整正確解法（逐步展示，使用 LaTeX 表示公式，所有數值帶單位。如涉及圖形，引用圖中具體元素）",
  "error_type": "concept_error / calculation_error / careless / memory_error / logic_error / method_error",
  "error_stage": "concept / formula / substitution / calculation / unit / graph / experiment",
  "first_error_step": "第一個出錯的步驟描述（概念題可填 null）",
  "error_analysis": "詳細分析錯誤原因（繁體中文），指出哪一步出了問題。如涉及圖形，引用圖中元素和關係解釋",
  "physics_checks": {{
    "unit_check": "單位換算和量綱分析是否正確",
    "sign_direction_check": "正負號/方向約定是否一致",
    "formula_selection_check": "公式選用是否恰當，適用條件是否滿足",
    "graph_interpretation_check": "圖像/電路/波形解讀是否正確（無圖則填 N/A）",
    "significant_figures_check": "有效數字處理是否合適"
  }},
  "key_insight": "這道題考查的核心物理概念",
  "improvement_tips": ["改進建議1", "改進建議2"],
  "knowledge_points": ["從知識點列表中選擇最相關的 point_code"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

注意：
- 用繁體中文分析，物理公式用 LaTeX
- 所有數值必須帶單位
- 定位到第一個出錯的步驟
- 如果題目包含圖形描述，你必須在分析中引用圖中的具體元素（如元件、力、波形），讓學生能對照原圖理解
- error_type 只能選：concept_error / calculation_error / careless / memory_error / logic_error / method_error
- error_stage 只能選：concept / formula / substitution / calculation / unit / graph / experiment
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

        return f"""你是一位香港 DSE 物理科教師，請根據以下薄弱知識點，出 {question_count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤
{student_mistakes_context if student_mistakes_context else "無"}

## 出題要求
- 符合香港 DSE 物理科考試格式
- 題型包括：多項選擇題（MC）、結構題（structured question）、論述題（essay question）
- 物理公式使用 LaTeX 標記
- 所有數值必須帶單位
- 提供不同數值但方法相同的變式題
- 包含完整的解題步驟

## 輸出格式（JSON）
```json
{{
  "questions": [
    {{
      "index": 1,
      "question": "題目（繁體中文，LaTeX 公式用 $ 包裹，數值帶單位）",
      "question_type": "multiple_choice / structured / essay",
      "options": ["A. ...", "B. ...", "C. ...", "D. ..."],
      "correct_answer": "完整解題步驟和最終答案（帶單位）",
      "explanation": "解析（繁體中文，公式用 LaTeX）",
      "scoring_points": ["得分點1", "得分點2"],
      "common_mistakes": ["常見錯誤1"],
      "why_wrong_option": {{"A": "為何 A 是錯的", "B": "為何 B 是錯的"}},
      "point_code": "對應的知識點編碼",
      "difficulty": 3
    }}
  ]
}}
```
注意：
- multiple_choice 必須有 options 和 why_wrong_option
- structured 和 essay 題的 options 填 null，why_wrong_option 填 null
- 只輸出 JSON。"""


HANDLER_CLASS = PhysicsHandler
