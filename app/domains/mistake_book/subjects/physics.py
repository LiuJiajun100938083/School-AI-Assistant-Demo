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
            "expression_weak", "memory_error", "logic_error", "method_error",
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

**graph_features：** 若題目包含 X-Y 圖（如 v-t 圖、溫度-長度圖），此字段包含：
- x_axis / y_axis：軸名稱、單位、刻度值
- line_anchor_points：直線/曲線經過的精確坐標點（從網格交點讀取）
**圖表計算題必須使用 line_anchor_points 中的錨點作為計算基準，不要自行估計端點。**

**option_figures：** 若選項本身是圖（如受力分析圖選擇題），每個選項的摘要。

**needs_review / review_warnings：** 若為 true，表示部分信息可能不準確，請謹慎使用。

請在分析中引用具體的物理元素，例如「根據圖中 R₁ 與 R₂ 串聯，總電阻 = R₁ + R₂ = ...」
"""
        history_section = (
            f"\n## 學生歷史學習情況（請結合歷史薄弱點給出更有針對性的建議）\n{student_history_context}\n"
            if student_history_context else ""
        )
        empty_answer = not student_answer or student_answer.strip() == ""
        answer_section = "（學生未作答）" if empty_answer else student_answer

        return f"""你是一位經驗豐富的香港 DSE 物理科教師。{'學生未作答此題，請直接提供完整正確解法和此題的核心考點分析。' if empty_answer else '請逐步檢查以下學生的解題過程。'}

## 題目
{question_text}
{figure_section}
## 學生解答
{answer_section}

## 可用的知識點列表
{knowledge_points_context}
{history_section}
## 分析要求

### 首要原則：先判斷正確性，再分析問題

**你的第一步永遠是：判斷學生的最終答案和解題思路是否正確。**
不要預設學生答錯。許多學生的答案是正確的，只是寫法不標準、過程不夠完整、或使用了非主流但物理上等價的表達方式。

### 正確性分級（correctness_level A–F）

請先判斷學生屬於以下哪個等級，再決定 is_correct 和 error_type：

| 等級 | 含義 | is_correct | error_type |
|------|------|------------|------------|
| A | 完全正確，表達清晰 | true | null |
| B | 答案正確，但寫法非標準或可改進（如省略單位、用非主流符號、未化簡） | true | "careless" |
| C | 核心答案正確，但過程不完整或跳步嚴重 | true | "expression_weak" |
| D | 接近正確，但有一個關鍵計算或代入錯誤導致最終數值偏差 | false | 按實際錯誤選擇 |
| E | 方法方向性錯誤（如用了不適用的公式/定律） | false | "method_error" |
| F | 核心物理概念錯誤（如把向量當標量、混淆基本定律） | false | "concept_error" |

### 物理表達等價性規則

以下情況不算錯誤，最多標為 B 級：
- 答案數值正確但未化簡（如寫 $\\frac{{20}}{{3}}$ 而非 $6.67$）
- 使用等價的不同形式（如 $mg\\sin\\theta$ vs $\\mu mg\\cos\\theta$ 在正確語境下）
- 省略中間步驟但結果正確
- 單位寫法差異（如 ms⁻¹ vs m/s、N·m vs Nm）
- 有效數字多一位或少一位（在合理範圍內）
- 使用不同但正確的正負號約定（只要前後一致）
- 正確使用了非教科書主流的解法（如能量法 vs 力學法，只要物理上成立）

### 7 步檢查順序

1. **最終答案核對**：先算出正確答案，與學生答案比較。數值接近且物理量級正確 → 可能是 A/B/C 級
2. 物理概念正確性（定律選用、適用條件）
3. 公式選用（F=ma vs p=mv？動能定理 vs 機械能守恆？）
4. 代入數值與單位換算（cm→m、°C→K、kW→W、mA→A）
5. 物理量方向/正負號約定（向量 vs 標量、力的方向、電流方向）
6. 計算過程與有效數字
7. 圖像/電路/波形解讀（結合 figure_description 中的具體元素。**圖表題：必須使用 graph_features.line_anchor_points 的錨點座標，不要自行讀圖估值**）

### 分析語氣要求

- **A/B/C 級（答案正確）**：先肯定學生的正確之處，再溫和指出可改進的地方。語氣：「你的解題思路和答案正確！建議可以……」
- **D 級（接近正確）**：肯定思路正確，精確指出出錯的那一步。語氣：「你的解題方向正確，但在某步出現了……」
- **E/F 級（方向錯誤）**：客觀指出問題，不要用過度否定的語氣。

請以 JSON 格式回覆：

```json
{{
  "correctness_level": "A / B / C / D / E / F",
  "is_correct": true,
  "correct_answer": "完整正確解法（逐步展示，所有數值帶單位。如涉及圖形，引用圖中具體元素）",
  "error_type": "null / concept_error / calculation_error / careless / expression_weak / memory_error / logic_error / method_error",
  "error_stage": "concept / formula / substitution / calculation / unit / graph / experiment / null",
  "first_error_step": "第一個出錯的步驟描述（A/B/C 級填 null）",
  "error_analysis": "分析內容（繁體中文）。A/B/C 級：先肯定正確之處，再指出可改進的地方。D/E/F 級：指出哪一步出了問題。如涉及圖形，引用圖中元素和關係解釋",
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
- 用繁體中文分析
- **所有物理公式和數學表達式必須用 $ 符號包裹**，例如 $F = ma$、$Q = mc\\Delta T$、$v = 14 \\text{{ m s}}^{{-1}}$。不要出現未包裹的 LaTeX 命令（如裸露的 \\text{{}}、\\frac{{}}{{}} 等）
- 單位寫法：在 LaTeX 內用 $\\text{{ J kg}}^{{-1}} \\text{{ °C}}^{{-1}}$ 或直接寫 J kg⁻¹ °C⁻¹，不要用 \\circ
- 所有數值必須帶單位
- 如果學生未作答（答案為空），correctness_level 設為 "F"，error_type 設為 "method_error"，error_analysis 寫明「學生未作答此題」，然後重點放在 correct_answer（完整正確解法）和 key_insight（考點分析），不要分析「學生忽略了什麼」
- **如果學生的最終答案正確（A/B/C 級），is_correct 必須為 true，error_type 按上表填寫（A 級填 null）**
- **嚴禁在答案正確的情況下標記 concept_error 或 calculation_error**
- 如果學生有作答且答案錯誤（D/E/F 級），定位到第一個出錯的步驟
- 如果題目包含圖形描述，你必須在分析中引用圖中的具體元素（如元件、力、波形），讓學生能對照原圖理解
- error_type 只能選：null / concept_error / calculation_error / careless / expression_weak / memory_error / logic_error / method_error
- error_stage 只能選：concept / formula / substitution / calculation / unit / graph / experiment / null（A/B/C 級填 null）
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
- **所有物理公式必須用 $ 符號包裹**，如 $F = ma$、$Q = mc\\Delta T$
- 單位在 LaTeX 內用 $\\text{{ J kg}}^{{-1}}$ 或直接寫 J kg⁻¹，不要用 \\circ
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
      "explanation": "解析（公式用 LaTeX）",
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
