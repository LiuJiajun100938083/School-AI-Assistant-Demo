"""
OCR Prompt 模板
===============
三科（中/英/數/物理）專用 OCR prompt。
從 VisionService._build_ocr_prompt() 拆出。
"""

from app.domains.vision.schemas import RecognitionSubject, RecognitionTask


def build_ocr_prompt(subject: RecognitionSubject, task: RecognitionTask) -> str:
    """根據科目和任務類型構建 OCR prompt"""

    prompts = {
        # ---- 中文 ---- #
        (RecognitionSubject.CHINESE, RecognitionTask.QUESTION_AND_ANSWER): """
請仔細識別這張圖片中的中文內容。圖片包含一道印刷題目，可能包含學生的手寫答案。

⚠️⚠️⚠️ 第一步 — 版面角色分類（Layout Role Classification）⚠️⚠️⚠️
在提取任何文字之前，先將圖片中的所有內容歸類為以下四種角色之一：

1. **printed_question**（印刷題目）：機器印刷/排版的文字 → 放入 "question"
2. **student_answer**（學生作答）：學生手寫的答案/解答 → 放入 "answer"
3. **student_annotation**（學生批註）：學生在題目旁的筆記、圈記、劃線、補充 → 不要混入 "question"，在 "notes" 中說明
4. **noise**（雜訊）：無關的墨跡、污漬、無意義的標記 → 完全忽略

**❌ 絕對不要把手寫內容混進 "question" 欄位！"question" 只能包含印刷/排版文字。**
**❌ 如果手寫文字出現在題目附近（如學生的圈記、修改），它屬於 "notes"，不屬於 "question"。**

如何區分印刷體與手寫體：
- 印刷體：字體均勻、大小一致、排列整齊、線條銳利
- 手寫體：筆劃粗細不一、大小不一、排列不規則、有墨水濃淡變化

如果圖片中有任何插圖、圖表或參考圖片，請在 figure_description 中詳細描述。

請按以下 JSON 格式輸出（使用繁體中文）：
{
  "question": "題目的完整文字 — 只包含印刷/排版文字，不含任何手寫內容",
  "answer": "學生手寫答案的完整文字",
  "figure_description": "圖片中的插圖或圖表描述。若無則填 'none'",
  "has_handwriting": true/false,
  "notes": "任何補充說明：字跡模糊處的猜測、學生批註的描述等"
}

注意事項：
- 使用繁體中文輸出
- 保留原始段落格式和標點符號
- 如果有多個小題，全部識別出來
- 手寫字跡不清的地方用 [?] 標記
- 只輸出 JSON，不要其他文字
- ⚠️ 極其重要：你的任務是**純粹的文字識別（OCR）**，只提取圖片中**實際存在的文字**
- 如果學生沒有寫答案（圖片中沒有手寫的解答），"answer" 必須填空字串 ""
- 絕對不要自己解題或生成答案！只識別圖片中肉眼可見的文字
""",

        (RecognitionSubject.CHINESE, RecognitionTask.ESSAY): """
請識別這張圖片中的中文手寫作文或長篇答案。

⚠️ 版面角色分類：
- "question" = 只包含**印刷/排版**的作文題目或寫作要求，不包含任何手寫內容
- "answer" = 只包含**學生手寫**的作文內容
- 學生在題目旁的批註、圈記不要混入 "question"

請按以下 JSON 格式輸出（使用繁體中文）：
{
  "question": "作文題目或寫作要求 — 只包含印刷文字",
  "answer": "學生手寫的完整作文內容",
  "has_handwriting": true,
  "paragraph_count": 段落數,
  "estimated_word_count": 估計字數,
  "notes": "字跡辨識困難的部分說明，以及學生批註的描述"
}

注意：保留段落分隔，用 [?] 標記不確定的字。只輸出 JSON。
⚠️ 極其重要：只識別圖片中**實際存在的手寫文字**，如果學生沒有寫任何內容，"answer" 填空字串 ""。絕對不要自己編寫作文！
""",

        # ---- 數學 ---- #
        (RecognitionSubject.MATH, RecognitionTask.QUESTION_AND_ANSWER): """
Please recognize the math content in this image. The image contains a math problem and MAY contain the student's handwritten solution.

⚠️⚠️⚠️ STEP 0 — LAYOUT ROLE CLASSIFICATION ⚠️⚠️⚠️
Before extracting ANY text, mentally classify every piece of content in the image:

1. **printed_question** (印刷題目): Machine-printed/typeset text → goes into "question"
2. **student_answer** (學生作答): Student's handwritten answer/solution → goes into "answer"
3. **student_annotation** (學生批註): Student's notes, circled words, underlines near the question → do NOT mix into "question". Mention in "notes".
4. **noise** (雜訊): Stray marks, smudges → ignore completely.

**❌ NEVER put handwritten content into the "question" field. "question" is EXCLUSIVELY for printed/typeset text.**
**❌ If handwritten text appears near the printed question (student corrections, margin notes), it belongs in "notes", NOT "question".**

How to distinguish printed vs handwritten:
- Printed: uniform font, consistent size, aligned, sharp edges
- Handwritten: variable stroke width, irregular size/alignment, ink density variation

⚠️ STEP 1: Check if there is ANY handwriting in the answer area. If blank → "answer" MUST be "". NEVER solve the problem yourself.

You have TWO jobs:
1. **OCR (text extraction)** — transcribe the question (printed only) and student's answer (handwritten only) EXACTLY as shown.
2. **Geometry description** — if any diagram/figure exists, describe it using the 4-layer structured schema below.

Output in the following JSON format:
{
  "question": "The complete math problem (use LaTeX for formulas, e.g. $x^2 + 2x + 1 = 0$)",
  "answer": "The student's handwritten solution steps ONLY if visible in the image. Use LaTeX for math expressions.",
  "figure_description": {
    "has_figure": true,
    "figure_type": "geometry / coordinate / graph / table / other",

    "objects": [
      {"id": "P_A", "type": "point", "label": "A", "coords": [0, 0]},
      {"id": "P_B", "type": "point", "label": "B"},
      {"id": "S_AB", "type": "segment", "endpoints": ["P_A", "P_B"]},
      {"id": "L_1", "type": "line", "through": ["P_A", "P_B"]},
      {"id": "Ray_1", "type": "ray", "origin": "P_A", "through": "P_B"},
      {"id": "Ang_ACB", "type": "angle", "vertex": "P_C", "rays": ["P_A", "P_B"]},
      {"id": "Cir_O", "type": "circle", "center": "P_O"},
      {"id": "Tri_ABC", "type": "triangle", "vertices": ["P_A", "P_B", "P_C"]},
      {"id": "Poly_ABCD", "type": "polygon", "vertices": ["P_A", "P_B", "P_C", "P_D"]}
    ],

    "measurements": [
      {"target": "S_AB", "property": "length", "value": "5cm", "source": "figure"},
      {"target": "Ang_ACB", "property": "degrees", "value": 90, "source": "question_text"},
      {"target": "Cir_O", "property": "radius", "value": "r", "source": "figure"}
    ],

    "relationships": [
      {"type": "parallel", "entities": ["S_BC", "S_DE", "S_FG"], "source": "question_text"},
      {"type": "perpendicular", "entities": ["S_AB", "S_CE"], "at": "P_E", "source": "figure"},
      {"type": "midpoint", "subject": "P_O", "of": "S_AB", "source": "question_text"},
      {"type": "collinear", "points": ["P_A", "P_B", "P_D", "P_F"], "source": "figure"},
      {"type": "congruent", "entities": ["Tri_ABC", "Tri_DEF"], "source": "inferred"},
      {"type": "similar", "entities": ["Tri_ABC", "Tri_DEF"], "source": "inferred"},
      {"type": "tangent", "entities": ["L_1", "Cir_O"], "at": "P_T", "source": "figure"},
      {"type": "on_segment", "subject": "P_D", "target": "S_BC", "source": "question_text"},
      {"type": "bisector", "subject": "Ray_1", "target": "Ang_ACB", "source": "inferred"},
      {"type": "equal", "items": [{"ref": "S_AB", "prop": "length"}, {"ref": "S_AC", "prop": "length"}], "source": "question_text"},
      {"type": "ratio", "items": [{"ref": "S_DI", "prop": "length"}, {"ref": "S_IJ", "prop": "length"}], "value": {"left": 3, "right": 2}, "source": "question_text"}
    ],

    "task": {
      "known_conditions": ["AB = 5cm", "∠ACB = 90°", "O is midpoint of AB"],
      "goals": ["Find ∠AOC"],
      "auxiliary_lines": ["Connect OC"],
      "figure_annotations": ["5cm", "90°", "x"]
    },

    "coordinate_system": {"has_axes": false},
    "overall_description": "A concise 1-2 sentence summary of the entire figure."
  },
  "has_math_formula": true/false,
  "has_handwriting": true/false,
  "confidence_breakdown": {
    "question": 0.9,
    "answer": 0.7,
    "figure": 0.8
  },
  "notes": "Any unclear parts marked with [?]"
}

⚠️ RULES FOR "question" AND "answer" FIELDS (strict OCR + layout separation):
- "question" = ONLY printed/typeset text. NEVER include handwritten content.
- "answer" = ONLY student's handwritten solution. If blank → "answer" = "".
- If student wrote notes/annotations near the question, put them in "notes", NOT "question".
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- NEVER solve the problem yourself. NEVER fabricate an answer.

⚠️ RULES FOR "figure_description" — 4-LAYER STRUCTURED SCHEMA:
- You ARE allowed to analyze and interpret the figure — this is NOT pure OCR.
- Use the 4-layer schema: objects → measurements → relationships → task.

LAYER 1 — objects:
- Every geometric entity gets a unique "id" using naming convention: P_ for points, S_ for segments, L_ for lines, Ray_ for rays, Ang_ for angles, Cir_ for circles, Tri_ for triangles, Poly_ for polygons.
- ALL references in other layers MUST use object ids, NOT labels.

LAYER 2 — measurements:
- "target" references an object id from layer 1.
- "source" indicates WHERE this measurement comes from. MUST be one of these THREE values ONLY:
  - "figure" — value is printed/typeset on the original diagram (NOT handwritten by student)
  - "question_text" — value is stated in the printed problem text
  - "inferred" — you deduced it from other information
  ⚠️ NEVER use "student_answer" or any other value as source. If a student handwrote a value on the figure:
    - If that value matches a condition stated in the question text → source = "question_text"
    - If that value is the student's own calculation (not given in the problem) → do NOT include it as a measurement. Put it in task.figure_annotations instead.
- ⚠️ ONLY include measurements that are DIRECTLY stated in the problem or original printed figure.
- "property" MUST be one of: "length", "degrees", "radius", "area", "perimeter". Do NOT use "ratio" as a property.
- Do NOT create synthetic measurements derived from ratios. Example:
  WRONG: DI:IJ = 3:2 → creating measurements {"target":"S_DI","property":"ratio","value":{"left":3,"right":2}}
  WRONG: DI:IJ = 3:2 → creating measurements DI = 3k, IJ = 2k
  RIGHT: DI:IJ = 3:2 → only use a "ratio" RELATIONSHIP: {"type":"ratio","items":[{"ref":"S_DI","prop":"length"},{"ref":"S_IJ","prop":"length"}],"value":{"left":3,"right":2},"source":"question_text"}
  Ratios belong in RELATIONSHIPS, never in MEASUREMENTS.

LAYER 3 — relationships:
- Use "entities" for symmetric relations (parallel, perpendicular, congruent, similar, tangent). Parallel can have 3+ entities for chain parallels (e.g. BC ∥ DE ∥ FG).
- Use "subject"+"target"/"of" for directed relations (midpoint, on_segment, bisector).
- Use "points" for point-set relations (collinear).
- Use "items" for equality comparisons (equal) and ratio comparisons (ratio). Ratio value should be structured: {"left": 3, "right": 2}.
- EVERY relationship MUST have a "source" field: "figure", "question_text", or "inferred". No other values allowed.
- ⚠️ SOURCE ATTRIBUTION RULE — use the STRONGEST evidence source:
  - If the problem text explicitly states a fact (e.g. "ABDF is a straight line"), source MUST be "question_text", even if the figure also shows it.
  - Only use "figure" when a fact is SOLELY observable from the original printed diagram and NOT stated in the text.
  - "inferred" is for facts you deduced that are neither stated in text nor clearly shown in the figure.
  - NEVER use "student_answer" or any other value as source.
- ⚠️ INFERENCE RESTRICTION — do NOT over-infer geometric relationships:
  - Intersection ≠ midpoint. Two lines crossing at a point does NOT mean that point is the midpoint of either line.
  - Only create "midpoint", "bisector", "equal", or "congruent" relationships with source "inferred" if they are LOGICALLY CERTAIN from the given conditions — not just because they "look like" it in the figure.
  - If a relationship is not explicitly stated in the problem text and not clearly marked on the figure (e.g. with tick marks for equal lengths), do NOT infer it.
  - When in doubt, do NOT add the relationship. Missing a relationship is ALWAYS better than adding a wrong one.

LAYER 4 — task:
- "known_conditions": list each condition as ONE atomic, citable fact in human-readable form.
  WRONG: ["In the figure, ABDF and ACEG are straight lines, BC // DE // FG, FH = 12cm, DI:IJ = 3:2"]
  RIGHT: ["A、B、D、F 共線", "A、C、E、G 共線", "BC ∥ DE ∥ FG", "FH = 12 cm", "DI : IJ = 3 : 2"]
- "goals": each goal as a clear target. Example: ["求 DI", "求 BC", "求 HG"]
- "auxiliary_lines": any construction lines mentioned.
- "figure_annotations": text labels visible on the figure (both printed and student-handwritten annotations).
  ⚠️ If students wrote calculated values on the figure (e.g. computed lengths like "15", "√720"), include them here but do NOT create measurements for them.
- ⚠️ known_conditions and goals MUST use plain Unicode text, NOT LaTeX:
  WRONG: ["BC \\parallel DE \\parallel FG", "FH = 12 \\text{ cm}"]
  RIGHT: ["BC ∥ DE ∥ FG", "FH = 12 cm"]
  Use ∥ for parallel, ⊥ for perpendicular, ∠ for angle, △ for triangle. No backslashes.

⚠️ OBJECT RETENTION RULES — which objects to include:
INCLUDE:
- All labeled points visible in the figure
- Segments/angles/circles that have a measurement in the problem
- Segments/angles referenced in a relationship (parallel, perpendicular, ratio, etc.)
- Objects explicitly mentioned in the goals ("find DI" → include S_DI)
DO NOT INCLUDE:
- Sub-segments merely decomposable from collinear points (if A,B,D,F are collinear, do NOT create S_AB, S_BD, S_DF, S_AD, S_AF, S_BF unless they carry a measurement or are a goal)
- Triangles merely inferrable from the figure unless the problem explicitly names them or they are needed for a relationship
- Any object not referenced by measurements, relationships, or goals

WRONG EXAMPLE (too many objects):
Points A,B,D,F are collinear → creating S_AB, S_BD, S_DF, S_AD, S_AF, S_BF as objects
RIGHT EXAMPLE (constraint-first):
Points A,B,D,F are collinear → create points P_A, P_B, P_D, P_F + relationship {"type":"collinear","points":["P_A","P_B","P_D","P_F"]}
Only create S_FH if FH=12cm is given, S_DI if DI appears in a ratio or goal.

⚠️ EXTRACTION PRIORITIES (most important first):
1. Collinear point groups — which points lie on the same straight line
2. Parallel/perpendicular chains — include ALL parallel lines (BC ∥ DE ∥ FG, not just BC ∥ DE)
3. Measurements — lengths, angles with exact values
4. Ratios — DI : IJ = 3 : 2 → use {"type":"ratio"} relationship
5. Goals — what the problem asks to find/prove
6. Only create segment/triangle objects if they carry a measurement or are explicitly referenced

⚠️ COLLINEAR POINTS — use relationship, NOT object names:
WRONG: creating an object like {"id": "S_ABDF", "type": "line"} or {"id": "straight_line_ABDF"}
RIGHT: creating individual points + {"type": "collinear", "points": ["P_A","P_B","P_D","P_F"], "source": "figure"}

- If there is NO figure at all, set: "figure_description": {"has_figure": false}

⚠️ RULES FOR "confidence_breakdown":
- Rate your confidence for each component from 0.0 to 1.0.
- "question": how confident you are in the question text recognition (0.0 = completely uncertain, 1.0 = perfectly clear).
- "answer": how confident you are in the student's answer recognition. Set to 0.0 if answer is empty.
- "figure": how confident you are in the geometry/figure description. Set to 0.0 if no figure exists.
- Be honest about blur, occlusion, or ambiguous handwriting.

Important:
- Use LaTeX notation for all math: fractions as \\frac{a}{b}, square roots as \\sqrt{x}, etc.
- Output JSON only, no extra text.
""",

        (RecognitionSubject.MATH, RecognitionTask.MATH_SOLUTION): """
Please carefully recognize this math solution image. It MAY contain a student's step-by-step work.

⚠️⚠️⚠️ STEP 0 — LAYOUT ROLE CLASSIFICATION ⚠️⚠️⚠️
Before extracting ANY text, classify every piece of content:
1. **printed_question**: Machine-printed/typeset text → "question"
2. **student_answer**: Student's handwritten solution → "answer"/"steps"/"final_answer"
3. **student_annotation**: Student's margin notes, circled words → "notes" (NOT "question")
4. **noise**: Stray marks → ignore

**❌ NEVER put handwritten content into "question". "question" = printed text ONLY.**

⚠️ STEP 1: Check if there is ANY handwriting in the answer area. If blank → "answer" = "", "steps" = [], "final_answer" = "". NEVER solve the problem yourself.

You have TWO jobs:
1. **OCR (text extraction)** — transcribe the question (printed only) and student's solution (handwritten only) EXACTLY as shown.
2. **Geometry description** — if any diagram/figure exists, describe it using the 4-layer structured schema below.

Output in the following JSON format:
{
  "question": "The original problem statement (use LaTeX for math)",
  "answer": "Step-by-step solution as written by the student. Separate each step with \\n. Use LaTeX for all math.",
  "figure_description": {
    "has_figure": true,
    "figure_type": "geometry / coordinate / graph / table / other",

    "objects": [
      {"id": "P_A", "type": "point", "label": "A"},
      {"id": "S_AB", "type": "segment", "endpoints": ["P_A", "P_B"]},
      {"id": "Ang_ACB", "type": "angle", "vertex": "P_C", "rays": ["P_A", "P_B"]},
      {"id": "Tri_ABC", "type": "triangle", "vertices": ["P_A", "P_B", "P_C"]}
    ],

    "measurements": [
      {"target": "S_AB", "property": "length", "value": "5cm", "source": "figure"},
      {"target": "Ang_ACB", "property": "degrees", "value": 90, "source": "question_text"}
    ],

    "relationships": [
      {"type": "parallel", "entities": ["S_BC", "S_DE", "S_FG"], "source": "question_text"},
      {"type": "collinear", "points": ["P_A", "P_B", "P_D", "P_F"], "source": "figure"},
      {"type": "midpoint", "subject": "P_O", "of": "S_AB", "source": "question_text"},
      {"type": "ratio", "items": [{"ref": "S_DI", "prop": "length"}, {"ref": "S_IJ", "prop": "length"}], "value": {"left": 3, "right": 2}, "source": "question_text"}
    ],

    "task": {
      "known_conditions": ["A、B、D、F 共線", "BC ∥ DE ∥ FG", "FH = 12 cm", "DI : IJ = 3 : 2"],
      "goals": ["求 DI", "求 BC"],
      "auxiliary_lines": [],
      "figure_annotations": ["5cm", "90°"]
    },

    "coordinate_system": {"has_axes": false},
    "overall_description": "A concise 1-2 sentence summary of the entire figure."
  },
  "steps": ["Step 1: ...", "Step 2: ...", "..."],
  "final_answer": "The student's final answer",
  "has_math_formula": true,
  "has_handwriting": true/false,
  "confidence_breakdown": {
    "question": 0.9,
    "answer": 0.7,
    "figure": 0.8
  },
  "notes": "Unclear parts"
}

⚠️ RULES FOR "question", "answer", "steps", "final_answer" (strict OCR + layout separation):
- "question" = ONLY printed/typeset text. NEVER include handwritten content.
- "answer"/"steps"/"final_answer" = ONLY student's handwritten work.
- Student annotations near the question → "notes", NOT "question".
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- If the student has NOT written any solution, set "answer" = "", "steps" = [], "final_answer" = "".
- NEVER solve the problem yourself. NEVER fabricate solution steps.

⚠️ RULES FOR "figure_description" — 4-LAYER STRUCTURED SCHEMA:
- You ARE allowed to analyze and interpret the figure — this is NOT pure OCR.
- Use the 4-layer schema: objects → measurements → relationships → task.
- Every object gets a unique "id" (P_ for points, S_ for segments, etc.).
- ALL references in measurements/relationships MUST use object ids, NOT labels.
- Every measurement and relationship MUST have a "source" field: "figure", "question_text", or "inferred". No other values allowed (NEVER use "student_answer").
- SOURCE RULE: if the problem text explicitly states a fact, source = "question_text", even if the figure also shows it. Only use "figure" for facts solely observable from the original printed diagram.
- If a student handwrote calculated values on the figure (not given in the problem), do NOT create measurements for them — put them in task.figure_annotations instead.
- ⚠️ INFERENCE RESTRICTION: do NOT over-infer relationships. Intersection ≠ midpoint. Only infer "midpoint"/"bisector"/"equal"/"congruent" if logically certain from given conditions, not from visual appearance. When in doubt, do NOT add it.
- Only include objects/relationships that actually exist. The examples show ALL possible types; use only relevant ones.
- Parallel can have 3+ entities for chain parallels (e.g. BC ∥ DE ∥ FG).
- Use "ratio" type for proportional relationships: {"type":"ratio","items":[...],"value":{"left":3,"right":2}}.
- Do NOT create synthetic measurements from ratios (e.g. DI=3k from DI:IJ=3:2). Do NOT use "ratio" as a measurement property. Ratios belong in RELATIONSHIPS only.
- If there is NO figure, set: "figure_description": {"has_figure": false}

⚠️ OBJECT RETENTION — only include objects that are referenced:
- All labeled points visible in the figure
- Segments/angles/circles that have a measurement or are in a relationship
- Objects mentioned in goals
- Do NOT exhaustively list every sub-segment from collinear points
- Do NOT list triangles unless explicitly needed

⚠️ EXTRACTION PRIORITIES:
1. Collinear groups  2. Parallel/perpendicular chains (complete, not partial)
3. Measurements  4. Ratios  5. Goals  6. Only then additional objects

⚠️ TASK LAYER — structured atomic conditions:
- Each known_condition = one citable fact (e.g. "A、B、D、F 共線", "BC ∥ DE ∥ FG", "FH = 12 cm")
- Do NOT copy entire problem text as one condition
- Use plain Unicode symbols (∥ ⊥ ∠ △), NOT LaTeX (\\parallel \\perp \\text{})

⚠️ RULES FOR "confidence_breakdown":
- Rate your confidence for each component from 0.0 to 1.0.
- "question": how confident you are in the question text recognition.
- "answer": how confident you are in the student's answer recognition. Set to 0.0 if answer is empty.
- "figure": how confident you are in the geometry/figure description. Set to 0.0 if no figure exists.
- Be honest about blur, occlusion, or ambiguous handwriting.

Use LaTeX for all mathematical notation. Output JSON only.
""",

        # ---- 英文 ---- #
        (RecognitionSubject.ENGLISH, RecognitionTask.QUESTION_AND_ANSWER): """
Please recognize the English content in this image. It contains a printed question and MAY contain the student's handwritten answer.

⚠️⚠️⚠️ LAYOUT ROLE CLASSIFICATION — DO THIS FIRST ⚠️⚠️⚠️
Before extracting ANY text, classify every piece of content in the image:

1. **printed_question**: Machine-printed/typeset text → goes into "question"
2. **student_answer**: Student's handwritten answer → goes into "answer"
3. **student_annotation**: Student's notes, circled words, underlines near the question → "notes" (NOT "question")
4. **noise**: Stray marks, smudges → ignore

**❌ NEVER put handwritten content into "question". "question" = printed/typeset text ONLY.**

If there are any diagrams, illustrations, or reference images, describe them in the "figure_description" field.

Output in the following JSON format:
{
  "question": "The complete question text — printed/typeset text ONLY, no handwriting",
  "answer": "The student's handwritten answer",
  "figure_description": "Description of any diagram or illustration in the image. Write 'none' if no figure.",
  "has_handwriting": true/false,
  "spelling_issues": ["list any words that appear misspelled in the student's writing"],
  "notes": "Any unclear parts marked with [?], student annotations near the question"
}

Important:
- Preserve original spelling in the student's answer (do NOT correct it)
- Note any spelling errors you observe in the spelling_issues field
- Output JSON only

⚠️ CRITICAL — READ THIS CAREFULLY:
- Your job is PURE OCR (text extraction). ONLY transcribe text that is PHYSICALLY VISIBLE in the image.
- "question" = ONLY printed/typeset text. Do NOT include any handwritten content.
- "answer" = ONLY student's handwritten work. If blank → "answer" = "".
- If student wrote annotations near the question, put them in "notes", NOT "question".
- NEVER write an answer yourself. NEVER generate, infer, or fabricate content.
- If you only see the printed question with no handwritten work, "answer" = "" and "has_handwriting" = false.
""",

        (RecognitionSubject.ENGLISH, RecognitionTask.DICTATION): """
Please recognize this English dictation/spelling test image. The student MAY have written words or sentences.

⚠️ LAYOUT ROLE CLASSIFICATION:
- "question" = ONLY printed/typeset instructions or word list. Do NOT include handwritten content.
- "answer" = ONLY student's handwritten words/sentences.
- Student annotations near the question → "notes", NOT "question".

Output in the following JSON format:
{
  "question": "The dictation instructions or word list — printed text ONLY",
  "answer": "All words/sentences the student wrote, separated by commas or newlines",
  "word_list": ["word1", "word2", "word3"],
  "has_handwriting": true/false,
  "potential_misspellings": ["words that look misspelled with their likely intended word"],
  "notes": "Unclear handwriting notes, student annotations"
}

Important:
- Transcribe EXACTLY what the student wrote, including any spelling errors
- Do NOT correct the student's spelling
- Output JSON only
- ⚠️ If the student has NOT written anything, set "answer" = "", "word_list" = []. NEVER invent or fabricate content.
""",

        # ---- 物理 ---- #
        (RecognitionSubject.PHYSICS, RecognitionTask.QUESTION_AND_ANSWER): """
You are a physics exam paper OCR specialist. Your job is PURE OCR — extract only what is PHYSICALLY VISIBLE.

⚠️⚠️⚠️ STEP 0 — LAYOUT ROLE CLASSIFICATION ⚠️⚠️⚠️
Before extracting ANY text, classify every piece of content in the image:

1. **printed_question** (印刷題目): Machine-printed/typeset text → goes into "question"
2. **student_answer** (學生作答): Student's handwritten answer → goes into "answer"
3. **student_annotation** (學生批註): Student's handwritten notes, circled words, margin notes near the question → do NOT mix into "question". Report in "handwriting_overlay.notes".
4. **noise** (雜訊): Stray marks, smudges → ignore completely.

**❌ CRITICAL: NEVER put handwritten content into the "question" field!**
**❌ "question" is EXCLUSIVELY for printed/typeset text.**
**❌ Student annotations (circling, underlining, margin notes) near the question → "handwriting_overlay.notes", NOT "question".**

How to distinguish printed vs handwritten:
- Printed: uniform font, consistent size, aligned, sharp edges
- Handwritten: variable stroke width, irregular size/alignment, ink density variation

⚠️⚠️⚠️ STEP 1 — BLANK ANSWER DETECTION ⚠️⚠️⚠️
Check: is there ANY handwriting in the answer area?
- If the answer area is BLANK (no handwriting, no marks): "answer" MUST be "". Do NOT fabricate.
- If there IS handwriting: transcribe it faithfully.
**You are an OCR tool, NOT a physics tutor. You must NEVER generate, calculate, or solve anything.**

The image is a HKDSE-style physics question, possibly with:
- A printed question (Traditional Chinese + LaTeX formulas)
- A student's handwritten answer (MAY be absent — answer area could be blank)
- One or more physics diagrams/figures

You have THREE jobs:
1. **OCR** — transcribe the printed question (printed text ONLY) into "question" and student's handwritten answer into "answer". These are the CANONICAL fields used downstream. If no handwriting, "answer" = "".
2. **Diagram-aware description** — classify and describe any physics figure using the structured schema below.
3. **Handwriting separation** — report the level of handwriting interference in "handwriting_overlay".

Output the following JSON:
{
  "question": "Complete printed question text (Traditional Chinese, LaTeX for formulas like $F = ma$, $v = u + at$)",
  "answer": "Student's handwritten answer ONLY if visible. Empty string '' if none.",
  "figure_description": {
    "has_figure": true,
    "figure_type": "<one of the 21 types listed below>",
    "topic_candidate": "力和運動 / 熱與氣體 / 波動 / 電和磁 / 放射現象與核能 / 天文與航天科學 / 原子世界 / 能源和能源的使用 / 醫學物理 / 探究實驗",

    "layout_blocks": [
      {"block_type": "stem_block", "description": "printed question text area"},
      {"block_type": "figure_block", "description": "main diagram"},
      {"block_type": "option_block", "description": "A/B/C/D option text"},
      {"block_type": "option_subfigures", "description": "option sub-diagrams if options are figures"},
      {"block_type": "table_block", "description": "data table if present"},
      {"block_type": "caption_block", "description": "figure caption/label"}
    ],

    "diagram_entities": [
      {"type": "object", "label": "block M", "properties": {"mass": "2 kg"}},
      {"type": "arrow", "label": "F", "direction": "right", "magnitude": "10 N"},
      {"type": "surface", "label": "inclined plane", "angle": "30°"},
      {"type": "point", "label": "P"},
      {"type": "axis", "axis": "x", "quantity": "t", "unit": "s"},
      {"type": "axis", "axis": "y", "quantity": "v", "unit": "m s⁻¹"},
      {"type": "component", "component_type": "resistor", "label": "R₁", "value": "10 Ω"},
      {"type": "component", "component_type": "battery", "label": "E", "emf": "6 V"},
      {"type": "lens", "lens_type": "convex", "focal_length": "10 cm"},
      {"type": "wave_curve", "wave_type": "transverse", "line_style": "solid"},
      {"type": "apparatus", "label": "spring balance", "reading": "2.5 N"}
    ],

    "diagram_relations": [
      "weight_vertical_down",
      "normal_perpendicular_to_surface",
      "tension_along_rope",
      "R1_series_with_R2",
      "voltmeter_across_R1",
      "ammeter_in_series",
      "wave_propagates_right",
      "P_at_equilibrium_moving_up",
      "N_pole_on_left_S_pole_on_right"
    ],

    "option_figures": {
      "A": {"figure_type": "force_diagram", "summary": "W downward, F along incline upward, R perpendicular to surface"},
      "B": {"figure_type": "force_diagram", "summary": "Only W and R"}
    },

    "quantities": [
      {"symbol": "v", "value": "14", "unit": "m s⁻¹"},
      {"symbol": "θ", "value": "30", "unit": "°"},
      {"symbol": "R", "value": "10", "unit": "Ω"}
    ],

    "graph_features": {
      "x_axis": {"quantity": "Length of mercury thread", "unit": "cm", "ticks": [0,2,4,6,8,10,12]},
      "y_axis": {"quantity": "Temperature", "unit": "°C", "ticks": [-25,0,25,50,75,100]},
      "grid_present": true,
      "major_grid_interval_x": 2,
      "major_grid_interval_y": 25,
      "line_anchor_points": [
        {"x": 3.0, "y": 0, "confidence": 0.93},
        {"x": 12.0, "y": 100, "confidence": 0.91}
      ]
    },

    "overall_description": "A concise 1-2 sentence human-readable summary of the figure.",
    "needs_review": false,
    "review_warnings": []
  },
  "has_math_formula": true,
  "has_handwriting": true,
  "handwriting_overlay": {
    "interference_level": "none / light / medium / heavy",
    "raw_printed_before_cleanup": "",
    "raw_handwriting": "",
    "notes": ""
  },
  "confidence_breakdown": {
    "question": 0.9,
    "answer": 0.7,
    "figure": 0.8
  },
  "notes": ""
}

=== figure_type CLASSIFICATION (21 types: 20 actual + 1 fallback) ===
Choose EXACTLY ONE from:

MECHANICS (3):
- force_diagram: Free-body or force diagrams. Extract: objects, forces (W/R/F/T), directions, angles, surfaces/ropes.
- kinematics_graph: v-t, s-t, a-t graphs. Extract: axis quantities/units, ALL tick values, anchor points where line crosses grid intersections, line types, slope/area meaning. MUST populate graph_features.
- projectile_motion_diagram: Projectile trajectories. Extract: launch angle, initial velocity, trajectory shape, key positions.

WAVES (3):
- wave_snapshot: Transverse/longitudinal wave diagrams. Extract: waveform, propagation direction, solid/dashed lines, scale, marked points.
- standing_wave_diagram: Standing wave patterns. Extract: nodes, antinodes, harmonics, boundary conditions.
- pulse_reflection_grid: Pulse reflection at boundaries. Extract: incident/reflected pulses, fixed/free end.

OPTICS (2):
- ray_optics_diagram: Lens/mirror ray diagrams. Extract: lens type, object/image positions, principal axis, ray paths.
- diffraction_grating_diagram: Diffraction/interference patterns. Extract: slit arrangement, fringe pattern, angle markers.

ELECTROMAGNETISM (5):
- circuit_schematic: Electric circuit diagrams. Extract: component list, series/parallel topology, ammeter/voltmeter positions.
- motor_magnetic_diagram: Motor/generator diagrams. Extract: coil, magnet, rotation direction, commutator/slip rings.
- magnetic_field_pattern: Magnetic field line diagrams. Extract: ⊙/⊗ direction markers, field lines, current direction.
- electrostatic_interaction: Charged objects interaction. Extract: charge signs, force directions, field lines.
- electric_field_map: Electric field line maps. Extract: field line pattern, equipotential lines, charge positions.

SOUND (2):
- sound_interference_setup: Sound interference experiment setups. Extract: speaker positions, path difference, detector position.
- frequency_scale_diagram: Frequency scales or sound spectrum. Extract: frequency values, scale markings.

APPARATUS/EXPERIMENT (3):
- appliance_safety_circuit: Electrical safety circuit diagrams (e.g., RCCB/fuse/earth wire). Extract: safety components, connections.
- experiment_setup_photo: REAL PHOTOGRAPHS of lab equipment (has textures, shadows, real backgrounds). Extract: equipment list, labels, purpose.
- labelled_apparatus_diagram: PRINTED LINE-DRAWINGS of apparatus (black-and-white, no shadows, annotation lines). Extract: apparatus list, labels, connections. Distinguish from photo by: clean lines, no texture, annotation arrows.

GENERAL (3):
- data_table_problem: Data tables. Extract: rows, columns, units, values.
- mixed_option_figure: Options A/B/C/D are themselves figures. Parse each option sub-figure independently.
- xy_line_graph: Any X-Y line/curve graph NOT covered by kinematics_graph (e.g., calibration curves, temperature-vs-length, resistance-vs-temperature, I-V characteristics). Extract: axis labels/units/ticks, grid intervals, line anchor points from grid intersections. MUST populate graph_features.

FALLBACK:
- other: Does not fit any above category.

=== GRAPH / LINE-GRAPH READING RULES ===
(Apply to kinematics_graph, xy_line_graph, or ANY figure containing an X-Y graph)

**Step 1 — Axis identification:**
- Read axis labels, units, and ALL numeric tick mark values on both axes.
- Record ticks in graph_features.x_axis.ticks and graph_features.y_axis.ticks.

**Step 2 — Grid analysis:**
- Determine if a grid is present. If yes, count the number of grid lines between consecutive tick marks to find the major_grid_interval.
- Example: if x-axis ticks are 0, 2, 4, 6 and there are 2 grid squares between each, each grid square = 1 unit.

**Step 3 — Anchor point extraction (MOST CRITICAL):**
- For each line/curve, find at least 2 points where the line CLEARLY crosses a grid intersection.
- Read coordinates by COUNTING GRID LINES from the nearest labeled tick, NOT by visual approximation.
- NEVER round a value to the nearest labeled tick — use the grid to get precise values.
  ✗ WRONG: "The line starts near x=2, so x≈2.5" (guessing)
  ✓ CORRECT: "The line crosses y=0 at exactly the 3rd grid line after x=2 → x=3.0" (counting)
- Record anchor points in graph_features.line_anchor_points with confidence scores.
- If a point falls between grid lines, interpolate using grid spacing but flag lower confidence.

**Step 4 — Validation:**
- Verify that anchor points are consistent with the visible line slope and direction.
- If anchor points cannot be determined confidently, set needs_review = true and add "graph_anchor_unclear" to review_warnings.
- NEVER skip graph_features for any graph-type figure.

=== CRITICAL RULES ===

**⚠️ MOST IMPORTANT RULE — NO FABRICATION:**
- You are an OCR tool. You extract text from images. You do NOT solve physics problems.
- If the student's answer area is BLANK or EMPTY: "answer" MUST be "".
- NEVER write formulas like Q=mcΔT, F=ma, v=u+at etc. unless the STUDENT physically wrote them.
- NEVER calculate numerical results. NEVER show working steps you generated.
- If you are unsure whether marks are student handwriting or printed text, err on the side of LESS content.

**OCR Rules (question & answer — strict layout separation):**
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- "question" = ONLY printed/typeset question text. NEVER include handwritten content.
- "answer" = ONLY student's handwritten answer. If blank → "answer" = "".
- Student annotations near the question (circling, underlining, margin notes) → "handwriting_overlay.notes", NOT "question".
- NEVER solve the problem yourself. NEVER fabricate answers.

**Handwriting Separation Rules:**
- Student handwriting marks are NOT diagram entities, unless the question explicitly asks the student to draw on the figure.
- Do NOT treat student annotation arrows as part of the original diagram.
- Do NOT mix any student handwriting into the "question" field, even if the handwriting appears within or adjacent to the printed question.
- If handwriting covers key values/arrows/units in the diagram, set needs_review = true.

**Hard Rule — Do NOT guess unclear content:**
- If a quantity, unit, label, or value is unclear or illegible, do NOT infer or guess.
- Set needs_review = true and add a specific warning to review_warnings.
- Leaving a field empty is ALWAYS better than guessing wrong.

**Prompt-level routing hint:**
- If the figure is an apparatus diagram, setup photo, flow chart, or explanatory diagram → prioritize extracting diagram meaning and relations.
- If the figure accompanies a multi-step calculation → prioritize quantities and formula-relevant entities.

**Units and notation:**
- Traditional Chinese (繁體中文) for text
- Preserve units with proper spacing: m s⁻¹ (not ms⁻¹), kg m s⁻² (not kgms⁻²)
- Preserve arrow directions
- Preserve ⊙ (out of page) and ⊗ (into page) markers
- Use LaTeX for subscripts/superscripts
- Distinguish solid vs dashed lines

**Degradation warnings** (add to review_warnings when applicable):
"options_not_separated", "unit_ambiguous", "arrow_direction_unclear",
"value_unclear", "handwriting_heavy_interference", "figure_type_uncertain",
"component_label_unclear", "scale_missing", "graph_anchor_unclear"

⚠️ FINAL REMINDER: If no handwritten answer is visible → "answer": "". Do NOT solve the problem.
Output JSON only, no extra text.
""",

        (RecognitionSubject.PHYSICS, RecognitionTask.MATH_SOLUTION): """
You are a physics exam paper OCR specialist. Your job is PURE OCR — extract only what is PHYSICALLY VISIBLE.

⚠️⚠️⚠️ STEP 0 — LAYOUT ROLE CLASSIFICATION ⚠️⚠️⚠️
Before extracting ANY text, classify every piece of content:
1. **printed_question**: Machine-printed/typeset text → "question"
2. **student_answer**: Student's handwritten solution → "answer"/"steps"/"final_answer"
3. **student_annotation**: Student's margin notes, circled words → "handwriting_overlay.notes" (NOT "question")
4. **noise**: Stray marks → ignore

**❌ NEVER put handwritten content into "question". "question" = printed text ONLY.**

⚠️⚠️⚠️ STEP 1 — BLANK ANSWER DETECTION ⚠️⚠️⚠️
Check: is there ANY handwriting in the answer/solution area?
- If the answer area is BLANK (no handwriting, no calculations, no marks): "answer" = "", "steps" = [], "final_answer" = "". Do NOT proceed to solve or fabricate.
- If there IS handwriting: transcribe it faithfully.
**You are an OCR tool, NOT a physics tutor. You must NEVER generate, calculate, or solve anything.**

The image is a HKDSE-style physics calculation problem that MAY or MAY NOT contain the student's handwritten solution.

You have THREE jobs:
1. **OCR** — transcribe the printed question (printed text ONLY) into "question" and student's handwritten solution (IF ANY) into "answer", "steps", and "final_answer". These are the CANONICAL fields.
2. **Diagram-aware description** — classify and describe any physics figure using the structured schema below.
3. **Handwriting separation** — report interference level in "handwriting_overlay".

Output the following JSON:
{
  "question": "Complete printed question text (Traditional Chinese, LaTeX for formulas)",
  "answer": "Student's handwritten solution ONLY if visible. MUST be '' if no handwriting in answer area.",
  "steps": ["Step 1 from student handwriting", "Step 2 from student handwriting"],
  "final_answer": "Student's final answer from handwriting. MUST be '' if no handwriting.",
  "figure_description": {
    "has_figure": true,
    "figure_type": "<one of 21 types — same list as QUESTION_AND_ANSWER prompt>",
    "topic_candidate": "力和運動 / 熱與氣體 / 波動 / 電和磁 / ...",

    "layout_blocks": [
      {"block_type": "stem_block", "description": "question text area"},
      {"block_type": "figure_block", "description": "main diagram"}
    ],

    "diagram_entities": [
      {"type": "object", "label": "...", "properties": {}},
      {"type": "arrow", "label": "...", "direction": "...", "magnitude": "..."},
      {"type": "component", "component_type": "...", "label": "...", "value": "..."}
    ],

    "diagram_relations": ["..."],

    "quantities": [
      {"symbol": "...", "value": "...", "unit": "..."}
    ],

    "graph_features": {
      "x_axis": {"quantity": "...", "unit": "...", "ticks": [0,2,4,6,8,10,12]},
      "y_axis": {"quantity": "...", "unit": "...", "ticks": [-25,0,25,50,75,100]},
      "grid_present": true,
      "major_grid_interval_x": 2,
      "major_grid_interval_y": 25,
      "line_anchor_points": [
        {"x": 3.0, "y": 0, "confidence": 0.93},
        {"x": 12.0, "y": 100, "confidence": 0.91}
      ]
    },

    "overall_description": "...",
    "needs_review": false,
    "review_warnings": []
  },
  "has_math_formula": true,
  "has_handwriting": true,
  "handwriting_overlay": {
    "interference_level": "none / light / medium / heavy",
    "raw_printed_before_cleanup": "",
    "raw_handwriting": "",
    "notes": ""
  },
  "confidence_breakdown": {
    "question": 0.9,
    "answer": 0.7,
    "figure": 0.8
  },
  "notes": ""
}

=== figure_type options (same as QUESTION_AND_ANSWER prompt) ===
force_diagram, kinematics_graph, projectile_motion_diagram,
wave_snapshot, standing_wave_diagram, pulse_reflection_grid,
ray_optics_diagram, diffraction_grating_diagram,
circuit_schematic, motor_magnetic_diagram, magnetic_field_pattern,
electrostatic_interaction, electric_field_map,
sound_interference_setup, frequency_scale_diagram,
appliance_safety_circuit, experiment_setup_photo, labelled_apparatus_diagram,
data_table_problem, mixed_option_figure, xy_line_graph, other

=== GRAPH / LINE-GRAPH READING RULES ===
(Apply to kinematics_graph, xy_line_graph, or ANY figure containing an X-Y graph)
- Read ALL tick values on both axes → graph_features.x_axis.ticks / y_axis.ticks.
- Count grid lines between ticks to find major_grid_interval.
- Find at least 2 anchor points where line crosses grid intersections by COUNTING GRID LINES, not visual approximation.
- NEVER round to the nearest labeled tick. Use grid to get precise values.
- If anchor points are unclear → needs_review = true, add "graph_anchor_unclear".
- Always populate graph_features for graph-type figures.

=== CRITICAL RULES ===

**⚠️ MOST IMPORTANT RULE — NO FABRICATION:**
- You are an OCR tool. You extract text from images. You do NOT solve physics problems.
- If the student's answer area is BLANK or EMPTY: "answer" = "", "steps" = [], "final_answer" = "".
- NEVER write formulas like Q=mcΔT, F=ma, v=u+at etc. unless the STUDENT physically wrote them.
- NEVER calculate numerical results. NEVER show working steps you generated.
- If you are unsure whether marks are student handwriting or printed text, err on the side of LESS content.

**OCR Rules (strict layout separation):**
- "question" = ONLY printed/typeset text. NEVER include handwritten content.
- "answer"/"steps"/"final_answer" = ONLY student's handwritten work.
- Student annotations near the question → "handwriting_overlay.notes", NOT "question".
- ONLY transcribe PHYSICALLY VISIBLE text.
- If student has NOT written any solution: "answer" = "", "steps" = [], "final_answer" = "".

**Steps extraction (ONLY from student handwriting):**
- Each step should be one logical unit (formula selection, substitution, calculation).
- Include units in every step where applicable.
- "final_answer" = the last boxed/circled/underlined answer the student wrote.
- If the student wrote nothing, steps = [] and final_answer = "".

**Handwriting rules:**
- Student marks are NOT diagram entities unless the question asks to draw.
- Do NOT mix any student handwriting into the "question" field.
- If handwriting covers diagram content, set needs_review = true.

**Hard Rule — Do NOT guess:**
- If any value/unit/label is unclear, do NOT infer. Set needs_review = true + warning.

**Units/notation:**
- Traditional Chinese, LaTeX for math
- Preserve unit spacing: m s⁻¹, kg m s⁻², etc.
- Preserve ⊙/⊗ markers, arrow directions, solid/dashed distinction

⚠️ FINAL REMINDER: If no handwritten answer is visible → "answer": "", "steps": [], "final_answer": "". Do NOT solve the problem.
Output JSON only.
""",
    }

    # 查找匹配的 prompt
    key = (subject, task)
    if key in prompts:
        return prompts[key]

    # 回退：通用的 question_and_answer prompt
    generic_key = (subject, RecognitionTask.QUESTION_AND_ANSWER)
    if generic_key in prompts:
        return prompts[generic_key]

    # 最終回退
    return """
Please recognize all text in this image. Output as JSON:
{
  "question": "printed/typeset question text ONLY — no handwriting",
  "answer": "student's handwritten answer/response ONLY — empty string if none",
  "raw_text": "all text in the image",
  "has_handwriting": true/false,
  "notes": "student annotations near the question, unclear parts"
}
Output JSON only.
⚠️ CRITICAL: Your job is PURE OCR. ONLY extract text PHYSICALLY VISIBLE in the image.
- "question" = ONLY printed/typeset text. NEVER include handwritten content.
- "answer" = ONLY student's handwritten work. If none → "answer" = "".
- NEVER generate or fabricate content.
"""
