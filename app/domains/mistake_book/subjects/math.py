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
            "expression_weak", "memory_error", "logic_error", "method_error",
        ]

    @property
    def ui_features(self) -> Dict:
        return {"katex": True}

    @property
    def supports_confidence_breakdown(self) -> bool:
        return True

    def pick_recognition_task(self, category: str) -> RecognitionTask:
        return RecognitionTask.MATH_SOLUTION

    # ---- SVG 幾何圖生成 ----

    _GEOMETRY_KEYWORDS = (
        "三角", "四邊", "圓", "角", "平行", "垂直", "直角",
        "相似", "全等", "面積", "周長", "弦", "切線", "半徑",
        "座標", "坐標", "梯形", "菱形", "正方形", "長方形",
        "多邊形", "對角線", "扇形", "弧", "內接", "外接",
        "中線", "角平分線", "切點", "弦心距",
    )

    @property
    def supports_svg_generation(self) -> bool:
        return True

    def needs_svg(self, question_text: str) -> bool:
        return any(kw in question_text for kw in self._GEOMETRY_KEYWORDS)

    def build_svg_prompt(self, question_text: str) -> str:
        return f"""你是一個專門畫幾何圖形的助手。根據以下數學題目，生成一個 SVG 圖形。

題目：
{question_text}

要求：
- 只輸出 JSON：{{"svg": "<svg>...</svg>"}}
- 若題目不需要圖形或條件不足以唯一確定圖形，輸出 {{"svg": ""}}
- 在內部完成分析與自檢，不要輸出分析步驟、解釋文字、Markdown 或代碼塊
- 不可依靠目測比例表達隱含條件；所有關鍵幾何關係必須能從題目文字直接得出

SVG 畫圖步驟（必須按此流程）：
1. 讀題：列出所有頂點、邊、角度、已知條件
2. 定座標：根據直角和邊長，確定每個頂點的 (x, y)
   - 例：∠A=90° 且 A 在左下角 → A 處兩邊分別水平和垂直
3. 畫邊：按頂點順序用 <line> 連線
4. 標直角：在題目指定的直角頂點處放 <rect>，x/y 對準該頂點
5. 標邊長：每個已知邊長標在對應邊中間
6. 標頂點名：大寫英文字母，放圖形外側
7. 自檢：逐條對照題目條件，確認每個直角、邊、標注正確

SVG 技術規範：
- <svg viewBox="0 0 300 250" width="300" height="250">
- 黑白簡潔 DSE 考試風格，無陰影無漸變
- 主邊線 stroke="black" stroke-width="2"，fill="none"
- 直角用邊長 8 的 <rect> 標記，必須在正確的直角頂點
- 相等線段用刻痕（短 <line>），相等角用弧線（<path>）
- 平行線用箭頭記號（小 <polygon>）
- 關鍵點（交點、切點、圓心）用 <circle r="2" fill="black">
- 頂點名 font-size="14"，數值 font-size="13"
- 只用 svg/g/line/circle/rect/polygon/polyline/path/text 標籤
- 不要在 SVG 中使用 LaTeX"""

    # ---- V2: Geometry Spec JSON 中間層 ----

    def build_geometry_spec_prompt(self, question_text: str) -> str:
        return f"""你是一個幾何語義提取助手。從數學題目中提取幾何約束，不計算任何座標。
系統會根據你的約束自動求解座標並渲染圖形。

題目：
{question_text}

## 你的任務

1. 讀題：識別所有頂點、邊長、角度、特殊關係（等腰、直角、平行等）
2. 選 base_edge：選最適合作水平底邊的一條邊
3. 列約束：用下方格式列出所有幾何關係
4. 列 draw：指定要畫哪些線段、標哪些數字

## 輸出格式（只輸出 JSON，不要解釋）

若題目不涉及幾何圖形，輸出 {{"skip": true}}

否則輸出：
{{
  "base_edge": {{"from": "P", "to": "Q", "orientation": "above"}},
  "constraints": [...],
  "draw": {{
    "segments": [["P","Q"], ["Q","R"], ...],
    "labels": [{{"segment": ["P","Q"], "text": "12"}}, ...],
    "suppress_angle_labels": []
  }}
}}

## base_edge

- from/to：底邊兩端點名，系統會水平放置
- orientation："above"（默認）= 其餘頂點在底邊上方，"below" = 下方

## 約束類型（constraints 數組元素）

| 類型 | 格式 | 說明 |
|------|------|------|
| length | {{"type":"length", "segment":["A","B"], "value":12}} | 邊長 |
| angle | {{"type":"angle", "vertex":"A", "ray1":"B", "ray2":"C", "value":48}} | 頂角度數 |
| right_angle | {{"type":"right_angle", "vertex":"A", "ray1":"B", "ray2":"C"}} | 直角（=angle 90°） |
| equal_length | {{"type":"equal_length", "segments":[["A","B"],["A","C"]]}} | 等長邊 |
| altitude | {{"type":"altitude", "from":"B", "to_side":["A","C"], "foot":"D"}} | 從頂點到對邊的高，D 是垂足 |
| midpoint | {{"type":"midpoint", "point":"M", "of":["A","B"]}} | 中點 |
| perpendicular | {{"type":"perpendicular", "seg1":["B","D"], "seg2":["A","C"]}} | 兩線段垂直 |
| point_on_segment | {{"type":"point_on_segment", "point":"D", "segment":["A","C"]}} | 點在邊上（位置由其他約束決定） |
| parallel | {{"type":"parallel", "seg1":["A","B"], "seg2":["C","D"]}} | 平行 |

## draw 字段

- segments：要畫的線段列表
- labels：邊長標注（text 為顯示文字）
- suppress_angle_labels：不標注角度的頂點名列表

系統會自動從約束推導以下渲染標記，你不需要寫：
- right_angles（直角標記）← right_angle / altitude 約束
- special_points（特殊點標記）← altitude.foot / midpoint.point / point_on_segment.point
- equal_segments（等長標記）← equal_length 約束
- parallel_lines（平行標記）← parallel 約束
- angle_labels（角度標注）← angle 約束

## 完整示例

題目：四邊形 PQRS 中，∠P=∠Q=90°，PQ=12，PS=10，QR=13。

{{
  "base_edge": {{"from": "P", "to": "Q", "orientation": "above"}},
  "constraints": [
    {{"type": "length", "segment": ["P","Q"], "value": 12}},
    {{"type": "length", "segment": ["P","S"], "value": 10}},
    {{"type": "length", "segment": ["Q","R"], "value": 13}},
    {{"type": "right_angle", "vertex": "P", "ray1": "Q", "ray2": "S"}},
    {{"type": "right_angle", "vertex": "Q", "ray1": "P", "ray2": "R"}}
  ],
  "draw": {{
    "segments": [["P","Q"], ["Q","R"], ["R","S"], ["S","P"]],
    "labels": [
      {{"segment": ["P","Q"], "text": "12"}},
      {{"segment": ["P","S"], "text": "10"}},
      {{"segment": ["Q","R"], "text": "13"}}
    ],
    "suppress_angle_labels": []
  }}
}}

## 重要規則

- 不要計算任何座標，只提取語義約束
- base_edge 沒有對應 length 約束也沒關係，系統會自動分配長度
- point_on_segment 的位置必須由其他約束（如 altitude、perpendicular）確定，不要假設在中點
- 所有約束都是硬約束，系統會精確求解"""

    def build_svg_from_spec_prompt(self, question_text: str, spec_json: str) -> str:
        # V2: Step 2 已改用 Python renderer，此方法僅作 fallback
        return ""

    # ---- V3: 練習批改 prompt ----

    def build_practice_grading_prompt(
        self,
        question_text: str,
        student_answer: str,
        correct_answer: str,
        question_type: str = "short_answer",
    ) -> str:
        return f"""你是一位經驗豐富的香港數學科教師。請批改以下練習題的學生答案。

題目：{question_text}
學生答案：{student_answer}
參考答案：{correct_answer}
題型：{question_type}

## 評分等級（必須嚴格遵守邊界）

| 等級 | 含義 | is_correct |
|------|------|------------|
| A | 完全正確，結果與表達都合格 | true |
| B | 本質正確，有輕微表達問題（未化簡、格式不規範） | true |
| C | 主要思路對，但答案不完整/部分缺失 | false |
| D | 有明顯方法或計算錯誤，但體現出部分理解 | false |
| E | 基本不理解核心概念 | false |
| F | 無關、空白、拒答、嚴重偏離題意 | false |

**嚴格規則：**
- is_correct=true 只限 A/B 兩級
- 以下情況不算錯誤，最多 B 級：未化簡（$\\frac{{6}}{{4}}$ vs $\\frac{{3}}{{2}}$）、等價形式（$2\\sqrt{{3}}$ vs $\\sqrt{{12}}$）、省略中間步驟但結果正確
- 如果數學意義完全等價，即使表達方式不同也應判 A 或 B
- 空白或無關答案直接判 F

## error_type 枚舉（只能選其一，A 級填 null）
careless / concept / calculation / method / format / incomplete / irrelevant

## 輸出（只輸出 JSON，不要解釋）
```json
{{"correctness_level": "A", "is_correct": true, "error_analysis": "1-2句繁體中文評語", "error_type": null}}
```"""

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

### 首要原則：先判斷正確性，再分析問題

**你的第一步永遠是：判斷學生的最終答案是否正確。**
不要預設學生答錯。許多學生的答案是正確的，只是寫法不標準、過程不夠完整、或使用了非主流但數學上等價的表達方式。

### 正確性分級（correctness_level A–F）

請先判斷學生屬於以下哪個等級，再決定 is_correct 和 error_type：

| 等級 | 含義 | is_correct | error_type |
|------|------|------------|------------|
| A | 完全正確，表達清晰 | true | null |
| B | 答案正確，但寫法非標準或可改進（如未化簡、省略括號、格式不規範） | true | "careless" |
| C | 核心答案正確，但過程不完整或跳步嚴重 | true | "expression_weak" |
| D | 接近正確，但有一個關鍵計算錯誤導致最終數值偏差 | false | 按實際錯誤選擇 |
| E | 方法方向性錯誤（如用了不適用的公式/定理） | false | "method_error" |
| F | 核心數學概念錯誤（如混淆基本運算法則、定理適用條件） | false | "concept_error" |

### 數學表達等價性規則

以下情況不算錯誤，最多標為 B 級：
- 答案數值正確但未化簡（如寫 $\\frac{{6}}{{4}}$ 而非 $\\frac{{3}}{{2}}$）
- 使用等價的不同形式（如 $2\\sqrt{{3}}$ vs $\\sqrt{{12}}$、$x=-1 \\text{{ or }} x=2$ vs $x \\in \\{{-1, 2\\}}$）
- 省略中間步驟但結果正確
- 有效數字/小數位數在合理範圍內
- 用不同但正確的解法（如配方法 vs 公式法、幾何法 vs 代數法）

請以 JSON 格式回覆：

```json
{{
  "correctness_level": "A / B / C / D / E / F",
  "is_correct": true,
  "correct_answer": "完整的正確解法（逐步展示，使用 LaTeX 表示數學公式。如涉及幾何，請引用圖中具體元素）",
  "error_type": "null / concept_error / calculation_error / careless / expression_weak / memory_error / logic_error / method_error",
  "first_error_step": "第一個出錯的步驟描述（A/B/C 級填 null）",
  "error_analysis": "分析內容（繁體中文）。A/B/C 級：先肯定正確之處，再指出可改進的地方。D/E/F 級：指出哪一步出了問題。如涉及幾何圖形，結合圖中元素和關係解釋",
  "key_insight": "這道題考查的核心數學概念",
  "improvement_tips": ["改進建議1", "改進建議2"],
  "knowledge_points": ["從知識點列表中選擇最相關的 point_code"],
  "difficulty_level": 3,
  "confidence": 0.85
}}
```

注意：
- 用繁體中文分析，數學公式用 LaTeX
- **如果學生的最終答案正確（A/B/C 級），is_correct 必須為 true，error_type 按上表填寫（A 級填 null）**
- **嚴禁在答案正確的情況下標記 concept_error 或 calculation_error**
- 如果學生有作答且答案錯誤（D/E/F 級），定位到第一個出錯的步驟
- 如果題目包含幾何圖形描述，你必須在分析中引用圖中的具體元素（如點、線、角、圓的名稱和性質），讓學生能對照原圖理解
- error_type 只能選：null / concept_error / calculation_error / careless / expression_weak / memory_error / logic_error / method_error
- knowledge_points 從上方列表中選 point_code
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
            f"- {p['point_name']}（{p.get('category', '')}）"
            for p in target_points
        )
        diff_note = f"難度要求：{difficulty}/5" if difficulty else "難度逐步遞進"
        history_section = f"\n{student_history_context}\n" if student_history_context else ""
        num_points = len(target_points)

        return f"""你是一位香港數學科教師，請根據以下薄弱知識點，出 {question_count} 道練習題。

## 目標知識點
{points_desc}

## {diff_note}

## 學生此前的典型錯誤
{student_mistakes_context if student_mistakes_context else "無"}
{history_section}
## 出題要求
- 符合香港中學數學課程（DSE 風格）
- 數學公式使用 LaTeX 標記
- 提供不同數值但方法相同的變式題
- 包含完整的解題步驟
- 數據表格用 Markdown 表格格式直接寫在題目中（| 列1 | 列2 | ... |）
- 題目文字條件必須自包含，即使附圖未顯示也能唯一理解幾何關係
- 不可把答案建立在學生目測圖形長短或角度大小之上；需要的條件必須在文字中明確給出

## 幾何題與 needs_svg 標記
- 幾何題不需要畫圖，系統會自動為幾何題生成配圖
- 但題目文字必須自包含，即使無圖也能唯一理解幾何關係
- 不可把答案建立在目測圖形之上；需要的條件必須在文字中明確給出
- 每道題必須標記 needs_svg 字段：
  - true：題目涉及幾何圖形（三角形、四邊形、圓、角、平行線、座標幾何等），配圖能幫助理解
  - false：純代數、函數、概率、數列等不需要幾何圖形的題目

## 題目分配規則
- 每個目標知識點至少 1 題（共 {num_points} 個知識點，{question_count} 題）
- 不可讓超過一半的題目集中在同一個知識點（除非只有 1 個知識點）
- 掌握度低的知識點可多分 1 題，出基礎理解題（單步運算、直接辨識）
- 掌握度中等的知識點出常規應用題（兩步推導、基礎變式）
- 掌握度高的知識點出綜合變式題（多條件綜合、跨點遷移、非常規設問）

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
      "explanation": "解析（公式用 LaTeX）",
      "point_code": "對應的知識點編碼",
      "difficulty": 3,
      "needs_svg": true
    }}
  ]
}}
```
只輸出 JSON。"""


HANDLER_CLASS = MathHandler
