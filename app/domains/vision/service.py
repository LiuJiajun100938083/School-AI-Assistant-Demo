"""
VisionService — Qwen3-VL 圖片識別服務
======================================
封裝對 Ollama qwen3-vl 模型的調用，
針對三科（中/英/數）提供專用的 OCR 識別策略。
"""

import os
import json
import logging
import base64
import asyncio
from typing import Optional
from pathlib import Path

from app.domains.vision.schemas import (
    OCRResult,
    ImageInfo,
    RecognitionSubject,
    RecognitionTask,
)

logger = logging.getLogger(__name__)

# 默認視覺模型（可通過環境變量 VISION_MODEL 覆蓋）
DEFAULT_VISION_MODEL = os.getenv("VISION_MODEL", "qwen3-vl:30b")


class VisionService:
    """
    視覺識別服務

    職責:
    1. 圖片預處理（壓縮、旋轉校正）
    2. 調用 Qwen3-VL 進行 OCR
    3. 三科專用識別 prompt
    4. 結果結構化解析
    """

    def __init__(
        self,
        vision_model: str = DEFAULT_VISION_MODEL,
        ollama_base_url: str = "http://localhost:11434",
        max_image_size: int = 4 * 1024 * 1024,  # 4MB
        timeout: int = 120,
    ):
        self._vision_model = vision_model
        self._base_url = ollama_base_url
        self._max_image_size = max_image_size
        self._timeout = timeout

    # ================================================================
    #  公開方法
    # ================================================================

    async def recognize(
        self,
        image_path: str,
        subject: RecognitionSubject,
        task: RecognitionTask = RecognitionTask.QUESTION_AND_ANSWER,
    ) -> OCRResult:
        """
        主入口：識別圖片中的題目和答案

        Args:
            image_path: 圖片文件路徑
            subject: 科目
            task: 識別任務類型

        Returns:
            OCRResult
        """
        try:
            if not os.path.exists(image_path):
                return OCRResult(success=False, error=f"圖片文件不存在: {image_path}")

            processed_path = await self._preprocess_image(image_path)
            prompt = self._build_ocr_prompt(subject, task)
            raw_response = await self._call_vision_model(processed_path, prompt)

            if raw_response is None:
                return OCRResult(success=False, error="視覺模型調用失敗")

            result = self._parse_ocr_response(raw_response, subject, task)
            return result

        except Exception as e:
            logger.error("圖片識別異常: %s", e, exc_info=True)
            return OCRResult(success=False, error=str(e))

    async def recognize_math(self, image_path: str) -> OCRResult:
        """數學專用識別（公式 + 解題步驟）"""
        return await self.recognize(
            image_path,
            RecognitionSubject.MATH,
            RecognitionTask.MATH_SOLUTION,
        )

    async def recognize_chinese_writing(self, image_path: str) -> OCRResult:
        """中文手寫作文/答案識別"""
        return await self.recognize(
            image_path,
            RecognitionSubject.CHINESE,
            RecognitionTask.ESSAY,
        )

    async def recognize_english_dictation(self, image_path: str) -> OCRResult:
        """英文默書識別"""
        return await self.recognize(
            image_path,
            RecognitionSubject.ENGLISH,
            RecognitionTask.DICTATION,
        )

    # ================================================================
    #  Ollama API 調用
    # ================================================================

    async def _call_vision_model(
        self, image_path: str, prompt: str
    ) -> Optional[str]:
        """
        調用 Ollama qwen3-vl 模型

        使用 /api/chat 端點，通過 images 參數傳遞圖片
        """
        try:
            import httpx

            image_b64 = self._encode_image_base64(image_path)
            if not image_b64:
                logger.error("圖片 base64 編碼失敗")
                return None

            # Qwen3-VL 的 think:false 在 Ollama 中不生效（已知 bug），
            # 使用 /no_think 軟開關強制關閉思考模式
            final_prompt = f"/no_think\n{prompt}"

            payload = {
                "model": self._vision_model,
                "messages": [
                    {
                        "role": "user",
                        "content": final_prompt,
                        "images": [image_b64],
                    }
                ],
                "stream": False,
                "think": False,
                "options": {
                    "temperature": 0.1,
                    "num_predict": 4096,
                },
            }

            url = f"{self._base_url}/api/chat"

            async with httpx.AsyncClient(timeout=self._timeout) as client:
                response = await client.post(url, json=payload)
                response.raise_for_status()
                data = response.json()

            msg = data.get("message", {})
            raw_content = msg.get("content", "")
            thinking_content = msg.get("thinking", "")

            # 記錄原始回應長度（調試用）
            logger.info(
                "Vision 原始回應: content_len=%d, thinking_len=%d",
                len(raw_content), len(thinking_content),
            )
            if not raw_content and not thinking_content:
                logger.warning("Vision 模型返回完全空回應，完整 data: %s", str(data)[:500])

            # 移除 thinking 標籤（如果有殘留在 content 裡）
            content = self._strip_thinking_tags(raw_content)

            # ---- 核心修復：Qwen3-VL 可能把所有輸出放進 thinking 字段 ----
            if not content:
                if thinking_content:
                    # Ollama 返回的 message.thinking 字段包含了實際 OCR 內容
                    logger.info(
                        "content 為空但 thinking 字段有內容 (len=%d)，使用 thinking 作為回應",
                        len(thinking_content),
                    )
                    content = self._strip_thinking_tags(thinking_content)
                    if not content:
                        # thinking 本身就是純文本（沒有 <think> 標籤）
                        content = thinking_content.strip()
                elif raw_content:
                    # strip_thinking_tags 清空了 content，嘗試從 <think> 標籤提取
                    logger.warning(
                        "strip_thinking_tags 後內容為空，嘗試提取 think 內容, raw_len=%d",
                        len(raw_content),
                    )
                    import re
                    think_match = re.search(r"<think>(.*?)</think>", raw_content, re.DOTALL)
                    if think_match:
                        content = think_match.group(1).strip()

            # ---- 從推理文本中嘗試提取嵌入的 JSON ----
            # Qwen3-VL 即使啟用思考模式，有時會在推理中輸出 JSON
            if content and "{" in content:
                import re
                json_candidate = self._extract_json_from_reasoning(content)
                if json_candidate:
                    logger.info("從推理文本中提取到嵌入 JSON (len=%d)", len(json_candidate))
                    content = json_candidate

            logger.info(
                "Vision 模型調用成功: model=%s, raw_len=%d, thinking_len=%d, final_len=%d",
                self._vision_model,
                len(raw_content),
                len(thinking_content),
                len(content),
            )
            return content

        except Exception as e:
            logger.error("Vision 模型調用失敗: %s", e, exc_info=True)
            return None

    # ================================================================
    #  圖片預處理
    # ================================================================

    async def _preprocess_image(self, image_path: str) -> str:
        """
        圖片預處理：HEIC 轉換、壓縮、旋轉校正

        Returns:
            處理後的圖片路徑（JPEG 格式）
        """
        try:
            from PIL import Image, ExifTags

            # HEIC / HEIF 格式支持（iPhone 默認拍照格式）
            ext = os.path.splitext(image_path)[1].lower()
            if ext in (".heic", ".heif"):
                img = self._convert_heic_to_pil(image_path)
                if img is None:
                    raise ValueError(f"無法轉換 HEIC 文件: {image_path}")
            else:
                img = Image.open(image_path)

            # EXIF 旋轉校正
            try:
                exif = img._getexif()
                if exif:
                    for key, val in exif.items():
                        if ExifTags.TAGS.get(key) == "Orientation":
                            if val == 3:
                                img = img.rotate(180, expand=True)
                            elif val == 6:
                                img = img.rotate(270, expand=True)
                            elif val == 8:
                                img = img.rotate(90, expand=True)
                            break
            except (AttributeError, KeyError):
                pass

            # 限制最大尺寸（Qwen3-VL 8B 建議不超過 2048px）
            max_dim = 2048
            if max(img.size) > max_dim:
                ratio = max_dim / max(img.size)
                new_size = (int(img.size[0] * ratio), int(img.size[1] * ratio))
                img = img.resize(new_size, Image.LANCZOS)

            # 轉為 RGB（去掉 alpha 通道）
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")

            # 保存處理後的圖片
            processed_dir = os.path.join(
                os.path.dirname(image_path), ".processed"
            )
            os.makedirs(processed_dir, exist_ok=True)
            processed_path = os.path.join(
                processed_dir,
                os.path.basename(image_path).rsplit(".", 1)[0] + ".jpg",
            )
            img.save(processed_path, "JPEG", quality=90)

            logger.debug("圖片預處理完成: %s → %s", image_path, processed_path)
            return processed_path

        except ImportError:
            logger.error("Pillow 未安裝，無法預處理圖片")
            raise RuntimeError("Pillow 未安裝，請執行: pip install Pillow")
        except Exception as e:
            logger.error("圖片預處理失敗: %s", e)
            raise RuntimeError(f"圖片預處理失敗: {e}")

    # ================================================================
    #  HEIC 格式轉換
    # ================================================================

    @staticmethod
    def _convert_heic_to_pil(image_path: str):
        """
        將 HEIC/HEIF 圖片轉為 PIL Image 對象

        優先使用 pillow-heif，回退到 pyheif。
        """
        # 方案一：pillow-heif（推薦）
        try:
            from pillow_heif import register_heif_opener
            register_heif_opener()
            from PIL import Image
            return Image.open(image_path)
        except ImportError:
            pass

        # 方案二：pyheif
        try:
            import pyheif
            from PIL import Image
            heif_file = pyheif.read(image_path)
            return Image.frombytes(
                heif_file.mode,
                heif_file.size,
                heif_file.data,
                "raw",
                heif_file.mode,
                heif_file.stride,
            )
        except ImportError:
            pass

        logger.error(
            "無法處理 HEIC 文件，請安裝 pillow-heif: "
            "pip install pillow-heif"
        )
        return None

    # ================================================================
    #  Prompt 構建（三科專用）
    # ================================================================

    def _build_ocr_prompt(
        self, subject: RecognitionSubject, task: RecognitionTask
    ) -> str:
        """根據科目和任務類型構建 OCR prompt"""

        prompts = {
            # ---- 中文 ---- #
            (RecognitionSubject.CHINESE, RecognitionTask.QUESTION_AND_ANSWER): """
請仔細識別這張圖片中的中文內容。圖片可能包含一道題目和學生的手寫答案。

如果圖片中有任何插圖、圖表或參考圖片，請在 figure_description 中詳細描述。

請按以下 JSON 格式輸出（使用繁體中文）：
{
  "question": "題目的完整文字（包括題號、要求等）",
  "answer": "學生手寫答案的完整文字",
  "figure_description": "圖片中的插圖或圖表描述。若無則填 'none'",
  "has_handwriting": true/false,
  "notes": "任何補充說明，如字跡模糊處的猜測"
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

請按以下 JSON 格式輸出（使用繁體中文）：
{
  "question": "作文題目或寫作要求（如果圖片中有的話）",
  "answer": "學生手寫的完整作文內容",
  "has_handwriting": true,
  "paragraph_count": 段落數,
  "estimated_word_count": 估計字數,
  "notes": "字跡辨識困難的部分說明"
}

注意：保留段落分隔，用 [?] 標記不確定的字。只輸出 JSON。
⚠️ 極其重要：只識別圖片中**實際存在的手寫文字**，如果學生沒有寫任何內容，"answer" 填空字串 ""。絕對不要自己編寫作文！
""",

            # ---- 數學 ---- #
            (RecognitionSubject.MATH, RecognitionTask.QUESTION_AND_ANSWER): """
Please recognize the math content in this image. The image contains a math problem and MAY contain the student's handwritten solution.

You have TWO jobs:
1. **OCR (text extraction)** — transcribe the question and student's answer EXACTLY as shown.
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
      {"type": "parallel", "entities": ["S_AB", "S_CD"], "source": "question_text"},
      {"type": "perpendicular", "entities": ["S_AB", "S_CE"], "at": "P_E", "source": "figure"},
      {"type": "midpoint", "subject": "P_O", "of": "S_AB", "source": "question_text"},
      {"type": "collinear", "points": ["P_A", "P_B", "P_D"], "source": "figure"},
      {"type": "congruent", "entities": ["Tri_ABC", "Tri_DEF"], "source": "inferred"},
      {"type": "similar", "entities": ["Tri_ABC", "Tri_DEF"], "source": "inferred"},
      {"type": "tangent", "entities": ["L_1", "Cir_O"], "at": "P_T", "source": "figure"},
      {"type": "on_segment", "subject": "P_D", "target": "S_BC", "source": "question_text"},
      {"type": "bisector", "subject": "Ray_1", "target": "Ang_ACB", "source": "inferred"},
      {"type": "equal", "items": [{"ref": "S_AB", "prop": "length"}, {"ref": "S_AC", "prop": "length"}], "source": "question_text"}
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

⚠️ RULES FOR "question" AND "answer" FIELDS (strict OCR):
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- If the student has NOT written any answer, "answer" MUST be "".
- NEVER solve the problem yourself. NEVER fabricate an answer.

⚠️ RULES FOR "figure_description" — 4-LAYER STRUCTURED SCHEMA:
- You ARE allowed to analyze and interpret the figure — this is NOT pure OCR.
- Use the 4-layer schema: objects → measurements → relationships → task.

LAYER 1 — objects:
- Every geometric entity gets a unique "id" using naming convention: P_ for points, S_ for segments, L_ for lines, Ray_ for rays, Ang_ for angles, Cir_ for circles, Tri_ for triangles, Poly_ for polygons.
- ALL references in other layers MUST use object ids, NOT labels.
- Only include objects that actually appear in the figure.

LAYER 2 — measurements:
- "target" references an object id from layer 1.
- "source" indicates WHERE this measurement comes from: "figure" (read from diagram), "question_text" (stated in problem text), or "inferred" (you deduced it).

LAYER 3 — relationships:
- Use "entities" for symmetric relations (parallel, perpendicular, congruent, similar, tangent).
- Use "subject"+"target"/"of" for directed relations (midpoint, on_segment, bisector).
- Use "points" for point-set relations (collinear).
- Use "items" for equality comparisons (equal).
- EVERY relationship MUST have a "source" field: "figure", "question_text", or "inferred".

LAYER 4 — task:
- "known_conditions": list of given conditions in human-readable form.
- "goals": what the problem asks to find/prove.
- "auxiliary_lines": any construction lines mentioned.
- "figure_annotations": text labels visible on the figure.

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

You have TWO jobs:
1. **OCR (text extraction)** — transcribe the question and student's solution EXACTLY as shown.
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
      {"type": "parallel", "entities": ["S_AB", "S_CD"], "source": "question_text"},
      {"type": "midpoint", "subject": "P_O", "of": "S_AB", "source": "question_text"}
    ],

    "task": {
      "known_conditions": ["AB = 5cm", "∠ACB = 90°"],
      "goals": ["Find ∠AOC"],
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

⚠️ RULES FOR "question", "answer", "steps", "final_answer" (strict OCR):
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- If the student has NOT written any solution, set "answer" = "", "steps" = [], "final_answer" = "".
- NEVER solve the problem yourself. NEVER fabricate solution steps.

⚠️ RULES FOR "figure_description" — 4-LAYER STRUCTURED SCHEMA:
- You ARE allowed to analyze and interpret the figure — this is NOT pure OCR.
- Use the 4-layer schema: objects → measurements → relationships → task.
- Every object gets a unique "id" (P_ for points, S_ for segments, etc.).
- ALL references in measurements/relationships MUST use object ids, NOT labels.
- Every measurement and relationship MUST have a "source" field: "figure", "question_text", or "inferred".
- Only include objects/relationships that actually exist. The examples show ALL possible types; use only relevant ones.
- If there is NO figure, set: "figure_description": {"has_figure": false}

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
Please recognize the English content in this image. It contains a question and MAY contain the student's handwritten answer.

If there are any diagrams, illustrations, or reference images, describe them in the "figure_description" field.

Output in the following JSON format:
{
  "question": "The complete question text",
  "answer": "The student's handwritten answer",
  "figure_description": "Description of any diagram or illustration in the image. Write 'none' if no figure.",
  "has_handwriting": true/false,
  "spelling_issues": ["list any words that appear misspelled in the student's writing"],
  "notes": "Any unclear parts marked with [?]"
}

Important:
- Preserve original spelling in the student's answer (do NOT correct it)
- Note any spelling errors you observe in the spelling_issues field
- Output JSON only

⚠️ CRITICAL — READ THIS CAREFULLY:
- Your job is PURE OCR (text extraction). ONLY transcribe text that is PHYSICALLY VISIBLE in the image.
- If the student has NOT written any answer, "answer" MUST be an empty string "".
- NEVER write an answer yourself. NEVER generate, infer, or fabricate content.
- If you only see the printed question with no handwritten work, "answer" = "" and "has_handwriting" = false.
""",

            (RecognitionSubject.ENGLISH, RecognitionTask.DICTATION): """
Please recognize this English dictation/spelling test image. The student MAY have written words or sentences.

Output in the following JSON format:
{
  "question": "The dictation instructions or word list (if visible)",
  "answer": "All words/sentences the student wrote, separated by commas or newlines",
  "word_list": ["word1", "word2", "word3"],
  "has_handwriting": true/false,
  "potential_misspellings": ["words that look misspelled with their likely intended word"],
  "notes": "Unclear handwriting notes"
}

Important:
- Transcribe EXACTLY what the student wrote, including any spelling errors
- Do NOT correct the student's spelling
- Output JSON only
- ⚠️ If the student has NOT written anything, set "answer" = "", "word_list" = []. NEVER invent or fabricate content.
""",

            # ---- 物理 ---- #
            (RecognitionSubject.PHYSICS, RecognitionTask.QUESTION_AND_ANSWER): """
You are a physics exam paper OCR specialist. Recognize the physics content in this image.
The image is a HKDSE-style physics question, possibly with:
- A printed question (Traditional Chinese + LaTeX formulas)
- A student's handwritten answer
- One or more physics diagrams/figures

You have THREE jobs:
1. **OCR** — transcribe the printed question into "question" and student's handwritten answer into "answer". These are the CANONICAL fields used downstream.
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
- kinematics_graph: v-t, s-t, a-t graphs. Extract: axis quantities/units, key points, line types, slope/area meaning.
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

GENERAL (2):
- data_table_problem: Data tables. Extract: rows, columns, units, values.
- mixed_option_figure: Options A/B/C/D are themselves figures. Parse each option sub-figure independently.

FALLBACK:
- other: Does not fit any above category.

=== CRITICAL RULES ===

**OCR Rules (question & answer):**
- ONLY transcribe text PHYSICALLY VISIBLE in the image.
- "question" = printed question text (CANONICAL source for downstream analysis).
- "answer" = student's handwritten answer (CANONICAL source for downstream analysis).
- If student has NOT written any answer, "answer" MUST be "".
- NEVER solve the problem yourself. NEVER fabricate answers.

**Handwriting Separation Rules:**
- Student handwriting marks are NOT diagram entities, unless the question explicitly asks the student to draw on the figure.
- Do NOT treat student annotation arrows as part of the original diagram.
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
"component_label_unclear", "scale_missing"

Output JSON only, no extra text.
""",

            (RecognitionSubject.PHYSICS, RecognitionTask.MATH_SOLUTION): """
You are a physics exam paper OCR specialist. Recognize this physics solution image.
The image contains a HKDSE-style physics calculation problem with the student's step-by-step solution.

You have THREE jobs:
1. **OCR** — transcribe the printed question into "question" and student's handwritten solution into "answer", "steps", and "final_answer". These are the CANONICAL fields.
2. **Diagram-aware description** — classify and describe any physics figure using the structured schema below.
3. **Handwriting separation** — report interference level in "handwriting_overlay".

Output the following JSON:
{
  "question": "Complete printed question text (Traditional Chinese, LaTeX for formulas)",
  "answer": "Full student solution as continuous text (LaTeX for math). Separate steps with \\n.",
  "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ..."],
  "final_answer": "Student's final numerical answer with units",
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

=== figure_type options (same 21 types as QUESTION_AND_ANSWER) ===
force_diagram, kinematics_graph, projectile_motion_diagram,
wave_snapshot, standing_wave_diagram, pulse_reflection_grid,
ray_optics_diagram, diffraction_grating_diagram,
circuit_schematic, motor_magnetic_diagram, magnetic_field_pattern,
electrostatic_interaction, electric_field_map,
sound_interference_setup, frequency_scale_diagram,
appliance_safety_circuit, experiment_setup_photo, labelled_apparatus_diagram,
data_table_problem, mixed_option_figure, other

=== CRITICAL RULES ===

**OCR Rules:**
- ONLY transcribe PHYSICALLY VISIBLE text. "answer"/"steps"/"final_answer" come from student's handwriting.
- If student has NOT written any solution: "answer" = "", "steps" = [], "final_answer" = "".
- NEVER solve the problem yourself. NEVER fabricate solution steps.

**Steps extraction:**
- Each step should be one logical unit (formula selection, substitution, calculation).
- Include units in every step where applicable.
- "final_answer" = the last boxed/circled/underlined answer the student wrote.

**Handwriting rules:**
- Student marks are NOT diagram entities unless the question asks to draw.
- If handwriting covers diagram content, set needs_review = true.

**Hard Rule — Do NOT guess:**
- If any value/unit/label is unclear, do NOT infer. Set needs_review = true + warning.

**Units/notation:**
- Traditional Chinese, LaTeX for math
- Preserve unit spacing: m s⁻¹, kg m s⁻², etc.
- Preserve ⊙/⊗ markers, arrow directions, solid/dashed distinction

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
  "question": "any question/prompt text found",
  "answer": "any handwritten answer/response text found",
  "raw_text": "all text in the image",
  "has_handwriting": true/false,
  "notes": ""
}
Output JSON only.
⚠️ CRITICAL: Your job is PURE OCR. ONLY extract text PHYSICALLY VISIBLE in the image. If there is no handwritten answer, "answer" MUST be "". NEVER generate or fabricate content.
"""

    # ================================================================
    #  響應解析
    # ================================================================

    @staticmethod
    def _extract_json_from_thinking(text: str) -> str:
        """
        從 thinking 模式的混合文本中智能提取 JSON 塊。

        thinking 輸出通常是：推理文字 + JSON 塊 + 可能更多推理文字。
        策略：找到所有 '{' 位置，從每個位置做括號匹配，
        嘗試解析為 JSON，返回第一個含 'question' 或 'answer' 鍵的有效 JSON 字符串。
        """
        import re as _re

        # 先嘗試 ```json ... ``` 塊
        if "```json" in text:
            block = text.split("```json")[1].split("```")[0].strip()
            if block:
                return block
        if "```" in text:
            parts = text.split("```")
            if len(parts) >= 3:
                block = parts[1].strip()
                if block.startswith("{"):
                    return block

        # 從每個 '{' 位置做括號匹配，嘗試提取完整 JSON 對象
        candidates = []
        i = 0
        while i < len(text):
            if text[i] == '{':
                depth = 0
                in_str = False
                esc = False
                for j in range(i, len(text)):
                    ch = text[j]
                    if esc:
                        esc = False
                        continue
                    if ch == '\\' and in_str:
                        esc = True
                        continue
                    if ch == '"' and not esc:
                        in_str = not in_str
                        continue
                    if in_str:
                        continue
                    if ch == '{':
                        depth += 1
                    elif ch == '}':
                        depth -= 1
                        if depth == 0:
                            candidate = text[i:j + 1]
                            # 快速檢查是否包含 OCR 相關的鍵
                            if ('"question"' in candidate or '"answer"' in candidate):
                                candidates.append(candidate)
                            break
            i += 1

        # 優先選擇最大的候選（通常包含最完整的數據）
        if candidates:
            candidates.sort(key=len, reverse=True)
            return candidates[0]

        # 回退：傳統的 find/rfind 方法
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            return text[start:end + 1]

        return text

    def _parse_ocr_response(
        self,
        raw_response: str,
        subject: RecognitionSubject,
        task: RecognitionTask,
    ) -> OCRResult:
        """解析視覺模型的 JSON 輸出"""
        try:
            # 智能提取 JSON（處理 thinking 模式的混合文本）
            json_str = self._extract_json_from_thinking(raw_response)

            data = self._safe_json_loads(json_str)

            # 提取圖形描述 —— 支持結構化 JSON 對象或純文字字符串
            fig_desc_raw = data.get("figure_description", "")
            fig_desc = self._normalize_figure_description(fig_desc_raw)

            # 提取分項置信度（數學科才有，非數學科為 None）
            cb = data.get("confidence_breakdown")
            q_conf = 0.0
            a_conf = 0.0
            f_conf = 0.0
            if isinstance(cb, dict):
                q_conf = float(cb.get("question", 0.0))
                a_conf = float(cb.get("answer", 0.0))
                f_conf = float(cb.get("figure", 0.0))

            return OCRResult(
                question_text=data.get("question", ""),
                answer_text=data.get("answer", ""),
                figure_description=fig_desc,
                raw_text=raw_response,
                confidence=0.85 if not data.get("notes") else 0.65,
                has_math_formula=data.get("has_math_formula", False),
                has_handwriting=data.get("has_handwriting", False),
                metadata={
                    k: v
                    for k, v in data.items()
                    if k not in ("question", "answer", "figure_description",
                                 "confidence_breakdown")
                },
                success=True,
                question_confidence=q_conf,
                answer_confidence=a_conf,
                figure_confidence=f_conf,
            )

        except (json.JSONDecodeError, KeyError) as e:
            logger.warning("OCR JSON 解析失敗，嘗試正則提取: %s", e)
            # 回退方案：用正則從原始文本中提取 question 和 answer
            return self._fallback_extract(raw_response, e)

    def _fallback_extract(self, raw_response: str, error: Exception) -> OCRResult:
        """JSON 解析失敗時，用正則從原始文本提取內容"""
        import re

        text = raw_response

        question = self._regex_extract_field(text, "question")
        answer = self._regex_extract_field(text, "answer")
        fig_desc = self._regex_extract_field(text, "figure_description")

        # 反轉義常見的 JSON 轉義序列
        for old, new in [("\\n", "\n"), ("\\t", "\t"), ('\\"', '"')]:
            question = question.replace(old, new)
            answer = answer.replace(old, new)
            fig_desc = fig_desc.replace(old, new)

        # 統一處理 figure_description（兼容結構化 / 純文字）
        fig_desc = self._normalize_figure_description(fig_desc)

        confidence = 0.7 if (question and answer) else 0.3

        if question or answer:
            logger.info("正則回退提取成功: question=%d字, answer=%d字", len(question), len(answer))
        else:
            logger.warning("正則回退也無法提取內容")

        return OCRResult(
            question_text=question,
            answer_text=answer,
            figure_description=fig_desc,
            raw_text=raw_response,
            confidence=confidence,
            has_handwriting='"has_handwriting": true' in text.lower()
                or '"has_handwriting":true' in text.lower(),
            has_math_formula='"has_math_formula": true' in text.lower()
                or '"has_math_formula":true' in text.lower(),
            metadata={"parse_error": str(error), "fallback": True},
            success=True,
        )

    @staticmethod
    def _regex_extract_field(text: str, field_name: str) -> str:
        """
        從不完整的 JSON 文本中提取指定欄位的值

        嘗試多種模式：
        1. 標準 JSON 雙引號字符串
        2. 包含未轉義換行的長字符串（貪婪匹配到下一個欄位）
        3. 數組格式的值 [...]
        4. 純文本值（無引號）
        5. 嵌套 JSON 物件 "field": {...}（用括號匹配）
        """
        import re

        # 模式 5（優先）：值是嵌套 JSON 物件 "field": {...}
        # 使用括號深度匹配，支持任意嵌套層級
        obj_start = re.search(rf'"{field_name}"\s*:\s*\{{', text)
        if obj_start:
            # 從 { 開始做括號匹配
            brace_pos = obj_start.end() - 1  # 回退到 { 位置
            depth = 0
            in_str = False
            esc = False
            for i in range(brace_pos, len(text)):
                ch = text[i]
                if esc:
                    esc = False
                    continue
                if ch == '\\' and in_str:
                    esc = True
                    continue
                if ch == '"' and not esc:
                    in_str = not in_str
                    continue
                if in_str:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        obj_str = text[brace_pos:i + 1]
                        return obj_str
            # 括號不匹配也返回已截取的部分（比什麼都沒有好）
            if depth > 0:
                obj_str = text[brace_pos:]
                return obj_str

        # 模式 1：標準 JSON 字符串 "field": "value"
        m = re.search(
            rf'"{field_name}"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.DOTALL
        )
        if m and m.group(1).strip():
            return m.group(1).strip()

        # 模式 2：值裡有未轉義的換行或引號，匹配到下一個已知欄位或 } 結束
        #         "answer": "some long text...
        #         with newlines..."
        next_fields = (
            r'(?="(?:question|answer|figure_description|has_figure|'
            r'has_handwriting|has_math_formula|steps|notes|'
            r'correct_answer|error_type|knowledge_points|'
            r'spelling_issues|word_list|potential_misspellings|'
            r'paragraph_count|estimated_word_count)"\s*:)'
        )
        m2 = re.search(
            rf'"{field_name}"\s*:\s*"([\s\S]*?)"\s*(?:,\s*{next_fields}|,?\s*\}})',
            text,
        )
        if m2 and m2.group(1).strip():
            return m2.group(1).strip()

        # 模式 3：值是數組 "field": ["item1", "item2"]
        m3 = re.search(
            rf'"{field_name}"\s*:\s*\[([\s\S]*?)\]', text
        )
        if m3:
            # 提取數組中所有字符串元素並拼接
            items = re.findall(r'"((?:[^"\\]|\\.)*)"', m3.group(1))
            if items:
                return "\n".join(items)

        # 模式 4：值是純文本（沒有引號），取到逗號或大括號
        m4 = re.search(
            rf'"{field_name}"\s*:\s*([^",\}}\]]+)', text
        )
        if m4 and m4.group(1).strip() not in ("null", "true", "false", ""):
            return m4.group(1).strip()

        return ""

    # ================================================================
    #  圖形描述處理
    # ================================================================

    @staticmethod
    def _normalize_figure_description(raw) -> str:
        """
        將 figure_description 統一轉為字符串。

        Vision 模型可能返回：
        1. 結構化 JSON 對象（新版 prompt）→ 序列化為 JSON 字符串保存
        2. 純文字字符串（舊版 prompt / 回退）→ 直接使用
        3. "none" / null / 空 → 返回 ""
        """
        if not raw:
            return ""

        # 如果是 dict（結構化幾何描述），檢查 has_figure 再序列化
        if isinstance(raw, dict):
            if not raw.get("has_figure", True):
                return ""
            try:
                return json.dumps(raw, ensure_ascii=False)
            except (TypeError, ValueError):
                return str(raw)

        # 純文字字符串
        if isinstance(raw, str):
            stripped = raw.strip().lower()
            if stripped in ("none", "null", "n/a", "無", "", "{}"):
                return ""
            # 可能是 JSON 字符串形式的結構化對象（模型偶爾如此）
            if raw.strip().startswith("{"):
                try:
                    obj = json.loads(raw)
                    if isinstance(obj, dict) and not obj.get("has_figure", True):
                        return ""
                    return raw.strip()
                except (json.JSONDecodeError, ValueError):
                    pass
            return raw.strip()

        return str(raw) if raw else ""

    @staticmethod
    def generate_readable_description(fig_json_str: str, schema_version: int = 1) -> str:
        """
        純函數：將 figure_description JSON 轉為人類可讀文字。

        - v1（舊 elements 版）：提取 points/line_segments，生成「點：A、B、C；直線：AB、CD」
        - v2（新 4 層約束版）：按 objects/measurements/relationships/task 分層生成

        JSON 解析失敗時返回「含幾何圖形」。
        可被批量重生成腳本和 service 方法共用。
        """
        if not fig_json_str or not fig_json_str.strip():
            return ""

        try:
            fig = json.loads(fig_json_str) if isinstance(fig_json_str, str) else fig_json_str
        except (json.JSONDecodeError, TypeError):
            return "含幾何圖形"

        if not isinstance(fig, dict):
            return "含幾何圖形"

        if not fig.get("has_figure", True):
            return ""

        if schema_version >= 2:
            return VisionService._readable_v2(fig)
        return VisionService._readable_v1(fig)

    @staticmethod
    def _readable_v1(fig: dict) -> str:
        """v1 schema (舊 elements 版) 的可讀描述"""
        parts = []

        # 提取 elements
        elements = fig.get("elements", [])
        if elements:
            points = []
            segments = []
            others = []
            for el in elements:
                el_type = el.get("type", "")
                label = el.get("label", el.get("name", ""))
                if el_type == "point" and label:
                    points.append(label)
                elif el_type in ("line_segment", "segment", "line") and label:
                    segments.append(label)
                elif label:
                    others.append(f"{el_type}: {label}")

            if points:
                parts.append(f"點：{'、'.join(points)}")
            if segments:
                parts.append(f"線段：{'、'.join(segments)}")
            if others:
                parts.extend(others)

        # 提取 relationships
        rels = fig.get("relationships", [])
        if rels:
            for rel in rels:
                rel_type = rel.get("type", "")
                desc = rel.get("description", "")
                if desc:
                    parts.append(desc)
                elif rel_type:
                    entities = rel.get("entities", [])
                    parts.append(f"{rel_type}: {', '.join(str(e) for e in entities)}")

        # 提取 measurements
        measurements = fig.get("measurements", [])
        if measurements:
            for m in measurements:
                target = m.get("target", "")
                prop = m.get("property", "")
                value = m.get("value", "")
                if target and value:
                    parts.append(f"{target} {prop} = {value}")

        # 提取 figure_type
        fig_type = fig.get("figure_type", "")
        if fig_type and not parts:
            parts.append(f"圖形類型：{fig_type}")

        # 回退：overall_description
        if not parts:
            overall = fig.get("overall_description", "")
            if overall:
                return overall
            return "含幾何圖形"

        return "；".join(parts)

    @staticmethod
    def _readable_v2(fig: dict) -> str:
        """v2 schema (新 4 層約束版) 的可讀描述"""
        parts = []

        # objects 層
        objects = fig.get("objects", [])
        if objects:
            by_type: dict = {}
            for obj in objects:
                t = obj.get("type", "unknown")
                label = obj.get("label", obj.get("id", ""))
                by_type.setdefault(t, []).append(label)
            type_labels = {
                "point": "點", "segment": "線段", "line": "直線",
                "ray": "射線", "angle": "角", "circle": "圓",
                "triangle": "三角形", "polygon": "多邊形",
            }
            for t, labels in by_type.items():
                name = type_labels.get(t, t)
                parts.append(f"{name}：{'、'.join(labels)}")

        # measurements 層
        measurements = fig.get("measurements", [])
        if measurements:
            m_parts = []
            for m in measurements:
                target = m.get("target", "")
                prop = m.get("property", "")
                value = m.get("value", "")
                if target and value:
                    if prop == "degrees":
                        val_str = str(value)
                        m_parts.append(
                            f"∠{target} = {value}°"
                            if not val_str.endswith("°")
                            else f"∠{target} = {value}"
                        )
                    elif prop == "length":
                        m_parts.append(f"{target} = {value}")
                    else:
                        m_parts.append(f"{target} {prop} = {value}")
            if m_parts:
                parts.append("；".join(m_parts))

        # relationships 層
        rels = fig.get("relationships", [])
        if rels:
            rel_parts = []
            for rel in rels:
                rel_type = rel.get("type", "")
                source = rel.get("source", "")
                inferred_mark = "?" if source == "inferred" else ""

                if rel_type == "parallel":
                    entities = rel.get("entities", [])
                    if len(entities) == 2:
                        rel_parts.append(f"{entities[0]} // {entities[1]}{inferred_mark}")
                elif rel_type == "perpendicular":
                    entities = rel.get("entities", [])
                    if len(entities) == 2:
                        rel_parts.append(f"{entities[0]} ⊥ {entities[1]}{inferred_mark}")
                elif rel_type == "midpoint":
                    subj = rel.get("subject", "")
                    of = rel.get("of", "")
                    rel_parts.append(f"{subj} 是 {of} 中點{inferred_mark}")
                elif rel_type == "collinear":
                    pts = rel.get("points", [])
                    rel_parts.append(f"{'、'.join(pts)} 共線{inferred_mark}")
                elif rel_type == "congruent":
                    entities = rel.get("entities", [])
                    if len(entities) == 2:
                        rel_parts.append(f"{entities[0]} ≅ {entities[1]}{inferred_mark}")
                elif rel_type == "similar":
                    entities = rel.get("entities", [])
                    if len(entities) == 2:
                        rel_parts.append(f"{entities[0]} ∼ {entities[1]}{inferred_mark}")
                elif rel_type == "tangent":
                    entities = rel.get("entities", [])
                    at = rel.get("at", "")
                    if len(entities) == 2:
                        t = f"，切點 {at}" if at else ""
                        rel_parts.append(f"{entities[0]} 切 {entities[1]}{t}{inferred_mark}")
                elif rel_type == "on_segment":
                    subj = rel.get("subject", "")
                    target = rel.get("target", "")
                    rel_parts.append(f"{subj} 在 {target} 上{inferred_mark}")
                elif rel_type == "bisector":
                    subj = rel.get("subject", "")
                    target = rel.get("target", "")
                    rel_parts.append(f"{subj} 平分 {target}{inferred_mark}")
                elif rel_type == "equal":
                    items = rel.get("items", [])
                    if len(items) == 2:
                        a = f"{items[0].get('ref', '')}({items[0].get('prop', '')})"
                        b = f"{items[1].get('ref', '')}({items[1].get('prop', '')})"
                        rel_parts.append(f"{a} = {b}{inferred_mark}")
                else:
                    entities = rel.get("entities", [])
                    if entities:
                        rel_parts.append(
                            f"{rel_type}: {', '.join(str(e) for e in entities)}{inferred_mark}"
                        )

            if rel_parts:
                parts.append("；".join(rel_parts))

        # task 層
        task = fig.get("task", {})
        if task:
            goals = task.get("goals", [])
            known = task.get("known_conditions", [])
            if known:
                parts.append(f"已知：{'、'.join(known)}")
            if goals:
                parts.append(f"求：{'、'.join(goals)}")

        if not parts:
            overall = fig.get("overall_description", "")
            if overall:
                return overall
            return "含幾何圖形"

        return "；".join(parts)

    @staticmethod
    def validate_figure_schema(fig_json: dict, version: int = 2) -> list:
        """
        輕量校驗器，返回警告列表（非阻塞）。

        v2 校驗：
        - has_figure=true 時關鍵層是否存在
        - measurements.target 是否引用已存在的 object id
        - relationships.entities 是否是合法引用
        - source 是否屬於允許枚舉值

        校驗結果寫入日誌，不阻塞流程。
        """
        warnings = []

        if not isinstance(fig_json, dict):
            warnings.append("figure_description 不是有效的字典")
            return warnings

        if not fig_json.get("has_figure", True):
            return []  # 無圖形，無需校驗

        if version < 2:
            return []  # v1 不做詳細校驗

        # 收集所有已知 object ids
        objects = fig_json.get("objects", [])
        if not objects:
            warnings.append("has_figure=true 但 objects 層為空")

        known_ids = set()
        for obj in objects:
            oid = obj.get("id", "")
            if not oid:
                warnings.append(f"object 缺少 id: {obj}")
            else:
                known_ids.add(oid)

        allowed_sources = {"figure", "question_text", "inferred"}

        # 校驗 measurements
        for m in fig_json.get("measurements", []):
            target = m.get("target", "")
            if target and target not in known_ids:
                warnings.append(f"measurement target '{target}' 不在 objects 中")
            source = m.get("source", "")
            if source and source not in allowed_sources:
                warnings.append(f"measurement source '{source}' 不在允許值中")

        # 校驗 relationships
        for rel in fig_json.get("relationships", []):
            source = rel.get("source", "")
            if source and source not in allowed_sources:
                warnings.append(f"relationship source '{source}' 不在允許值中")

            # 檢查引用的 entity ids
            for entity in rel.get("entities", []):
                if entity and entity not in known_ids:
                    warnings.append(
                        f"relationship entities 引用 '{entity}' 不在 objects 中"
                    )
            # 檢查 subject/of/target 引用
            for ref_key in ("subject", "of", "target", "at"):
                ref_val = rel.get(ref_key, "")
                if ref_val and ref_val not in known_ids:
                    warnings.append(
                        f"relationship.{ref_key} 引用 '{ref_val}' 不在 objects 中"
                    )
            # 檢查 points 列表
            for pt in rel.get("points", []):
                if pt and pt not in known_ids:
                    warnings.append(
                        f"relationship points 引用 '{pt}' 不在 objects 中"
                    )

        if warnings:
            logger.info(
                "figure schema 校驗發現 %d 個警告: %s",
                len(warnings), "; ".join(warnings[:5]),
            )

        return warnings

    # ================================================================
    #  工具方法
    # ================================================================

    @staticmethod
    def _encode_image_base64(image_path: str) -> Optional[str]:
        """將圖片編碼為 base64 字串"""
        try:
            with open(image_path, "rb") as f:
                return base64.b64encode(f.read()).decode("utf-8")
        except Exception as e:
            logger.error("圖片 base64 編碼失敗: %s", e)
            return None

    @staticmethod
    def _safe_json_loads(json_str: str) -> dict:
        """
        安全解析 JSON，處理模型常見的格式問題

        模型返回的 JSON 經常包含未轉義的反斜槓（LaTeX 公式如
        \\frac、\\sqrt），導致 json.loads 報 Invalid \\escape。
        此方法逐步嘗試修復後重新解析。
        """
        import re

        # 第 0 步：清理控制字元（thinking 模式經常夾帶 \x00-\x1f）
        cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', json_str)
        # 清理字串值內的未轉義換行符（JSON 規範不允許字串內有裸 \n \r \t）
        # 但保留已轉義的 \\n \\r \\t
        # 這裡只處理 JSON 字串值內的裸控制字元
        cleaned = cleaned.strip()

        # 第一次嘗試：直接解析（清理後）
        for attempt_str in [cleaned, json_str]:
            try:
                return json.loads(attempt_str)
            except json.JSONDecodeError:
                pass

        # 第二次嘗試：修復未轉義的反斜槓
        # 將不合法的 \x（x 不是 " \ / b f n r t u）替換為 \\x
        fixed = re.sub(
            r'\\(?!["\\/bfnrtu])',
            r'\\\\',
            cleaned,
        )
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 第三次嘗試：修復字串值內的裸換行符
        # 在 JSON 字串值中，裸 \n 是非法的，需要替換為 \\n
        def _fix_newlines_in_strings(s: str) -> str:
            """遍歷字元，在字串值內部將裸換行替換為 \\n"""
            result = []
            in_str = False
            esc = False
            for ch in s:
                if esc:
                    result.append(ch)
                    esc = False
                    continue
                if ch == '\\' and in_str:
                    result.append(ch)
                    esc = True
                    continue
                if ch == '"':
                    in_str = not in_str
                    result.append(ch)
                    continue
                if in_str and ch == '\n':
                    result.append('\\n')
                    continue
                if in_str and ch == '\r':
                    result.append('\\r')
                    continue
                if in_str and ch == '\t':
                    result.append('\\t')
                    continue
                result.append(ch)
            return ''.join(result)

        fixed2 = _fix_newlines_in_strings(fixed)
        try:
            return json.loads(fixed2)
        except json.JSONDecodeError:
            pass

        # 第四次嘗試：把所有反斜槓統一雙重轉義
        try:
            aggressive = cleaned.replace('\\', '\\\\')
            return json.loads(aggressive)
        except json.JSONDecodeError:
            pass

        # 最終回退：拋出原始錯誤讓上層處理
        return json.loads(json_str)

    @staticmethod
    def _strip_thinking_tags(content: str) -> str:
        """移除 <think>...</think> 標籤"""
        import re
        return re.sub(r"<think>.*?</think>", "", content, flags=re.DOTALL).strip()

    def _extract_json_from_reasoning(self, text: str) -> str:
        """
        從模型的推理文本中提取嵌入的 JSON 對象。

        Qwen3-VL 在思考模式下可能輸出類似：
            'I can see a math problem... the question is about...\n{"question": "...", "answer": "..."}\n'
        這裡嘗試找到包含 "question" 字段的最大合法 JSON 對象。

        修復：使用 _safe_json_loads 處理 LaTeX 反斜槓等常見格式問題，
        並嘗試所有可能的 { 起始位置（而非只嘗試第一個）。
        """
        import re

        # 優先提取 ```json ... ``` 包裹的 JSON
        m = re.search(r"```json\s*(.*?)```", text, re.DOTALL)
        if m:
            candidate = m.group(1).strip()
            try:
                self._safe_json_loads(candidate)
                return candidate
            except (json.JSONDecodeError, ValueError):
                pass

        # 收集所有包含 "question" 的 { 起始位置
        candidates_start = []
        for i, ch in enumerate(text):
            if ch == '{':
                rest = text[i:]
                if '"question"' in rest[:500]:
                    candidates_start.append(i)

        # 逐個嘗試括號匹配 + 解析
        for start in candidates_start:
            depth = 0
            in_string = False
            escape_next = False
            for i in range(start, len(text)):
                ch = text[i]
                if escape_next:
                    escape_next = False
                    continue
                if ch == '\\' and in_string:
                    escape_next = True
                    continue
                if ch == '"' and not escape_next:
                    in_string = not in_string
                    continue
                if in_string:
                    continue
                if ch == '{':
                    depth += 1
                elif ch == '}':
                    depth -= 1
                    if depth == 0:
                        candidate = text[start:i + 1]
                        try:
                            self._safe_json_loads(candidate)
                            return candidate
                        except (json.JSONDecodeError, ValueError):
                            break  # 這個起始位置失敗，嘗試下一個

        return ""

    def get_image_info(self, image_path: str) -> ImageInfo:
        """獲取圖片元數據"""
        try:
            from PIL import Image

            stat = os.stat(image_path)
            img = Image.open(image_path)
            return ImageInfo(
                file_path=image_path,
                original_filename=os.path.basename(image_path),
                file_size=stat.st_size,
                width=img.size[0],
                height=img.size[1],
                format=img.format or "",
            )
        except Exception:
            return ImageInfo(file_path=image_path)
