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

# 默認視覺模型
DEFAULT_VISION_MODEL = "qwen3-vl:8b"


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

            payload = {
                "model": self._vision_model,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt,
                        "images": [image_b64],
                    }
                ],
                "stream": False,
                "think": False,  # 關閉思考模式，OCR 不需要深度推理
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

IMPORTANT: If there is any diagram, graph, geometric figure, coordinate system, or illustration in the image, you MUST describe it in detail in the "figure_description" field. This description will be used by a text-only AI for analysis, so be thorough — include coordinates, labels, shapes, angles, measurements, and spatial relationships.

Output in the following JSON format:
{
  "question": "The complete math problem (use LaTeX for formulas, e.g. $x^2 + 2x + 1 = 0$)",
  "answer": "The student's handwritten solution steps ONLY if visible in the image. Use LaTeX for math expressions.",
  "figure_description": "Detailed description of any diagram/figure in the image. Example: 'A coordinate plane showing point Q at (2,7) and point R at (6,-3). A circle appears to pass through or near these points. Point P(x,y) is marked as a general point. The figure suggests PQ^2 + PR^2 = QR^2, which means angle QPR = 90 degrees (right angle), so P lies on a circle with QR as diameter.' If no figure, write 'none'.",
  "has_math_formula": true/false,
  "has_handwriting": true/false,
  "notes": "Any unclear parts marked with [?]"
}

Important:
- Use LaTeX notation for all math: fractions as \\frac{a}{b}, square roots as \\sqrt{x}, etc.
- Preserve the order of solution steps
- Recognize all numbers, operators, and geometric labels
- figure_description is CRITICAL — describe the geometric relationships you observe
- Output JSON only, no extra text

⚠️ CRITICAL — READ THIS CAREFULLY:
- Your job is PURE OCR (text extraction). ONLY transcribe text that is PHYSICALLY VISIBLE in the image.
- If the student has NOT written any answer or solution, "answer" MUST be an empty string "".
- NEVER solve the problem yourself. NEVER generate, infer, or fabricate an answer.
- If you only see the printed question with no handwritten work, "answer" = "" and "has_handwriting" = false.
""",

            (RecognitionSubject.MATH, RecognitionTask.MATH_SOLUTION): """
Please carefully recognize this math solution image. It MAY contain a student's step-by-step work.

IMPORTANT: If there is any diagram, graph, geometric figure, coordinate system, or illustration in the image, you MUST describe it in detail in the "figure_description" field. Include coordinates, labels, shapes, angles, measurements, and spatial relationships. A text-only AI will use this description for analysis.

Output in the following JSON format:
{
  "question": "The original problem statement (use LaTeX for math)",
  "answer": "Step-by-step solution as written by the student. Separate each step with \\n. Use LaTeX for all math.",
  "figure_description": "Detailed description of any diagram/figure. Include all labeled points, coordinates, geometric shapes, angles, lines, and their relationships. If no figure, write 'none'.",
  "steps": ["Step 1: ...", "Step 2: ...", "..."],
  "final_answer": "The student's final answer",
  "has_math_formula": true,
  "has_handwriting": true/false,
  "notes": "Unclear parts"
}

Use LaTeX for all mathematical notation. Output JSON only.

⚠️ CRITICAL — READ THIS CAREFULLY:
- Your job is PURE OCR (text extraction). ONLY transcribe text that is PHYSICALLY VISIBLE in the image.
- If the student has NOT written any solution steps, set "answer" = "", "steps" = [], "final_answer" = "".
- NEVER solve the problem yourself. NEVER generate, infer, or fabricate solution steps.
- If you only see the printed question with no handwritten work, leave all answer fields empty.
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

    def _parse_ocr_response(
        self,
        raw_response: str,
        subject: RecognitionSubject,
        task: RecognitionTask,
    ) -> OCRResult:
        """解析視覺模型的 JSON 輸出"""
        try:
            # 嘗試提取 JSON（模型可能包裹在 ```json ... ``` 中）
            json_str = raw_response.strip()
            if "```json" in json_str:
                json_str = json_str.split("```json")[1].split("```")[0].strip()
            elif "```" in json_str:
                json_str = json_str.split("```")[1].split("```")[0].strip()

            # 嘗試找到第一個 { 和最後一個 }
            start = json_str.find("{")
            end = json_str.rfind("}")
            if start != -1 and end != -1:
                json_str = json_str[start : end + 1]

            data = self._safe_json_loads(json_str)

            # 提取圖形描述（過濾掉 "none" 等無效值）
            fig_desc = data.get("figure_description", "")
            if fig_desc and fig_desc.strip().lower() in ("none", "null", "n/a", "無", ""):
                fig_desc = ""

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
                    if k not in ("question", "answer", "figure_description")
                },
                success=True,
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

        # 過濾無效的 figure_description
        if fig_desc.strip().lower() in ("none", "null", "n/a", "無", ""):
            fig_desc = ""

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
        """
        import re

        # 模式 1：標準 JSON 字符串 "field": "value"
        m = re.search(
            rf'"{field_name}"\s*:\s*"((?:[^"\\]|\\.)*)"', text, re.DOTALL
        )
        if m and m.group(1).strip():
            return m.group(1).strip()

        # 模式 2：值裡有未轉義的換行或引號，匹配到下一個已知欄位或 } 結束
        #         "answer": "some long text...
        #         with newlines..."
        next_fields = r'(?="(?:question|answer|has_handwriting|has_math_formula|steps|notes|correct_answer|error_type|knowledge_points)"\s*:)'
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

        # 第一次嘗試：直接解析
        try:
            return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # 第二次嘗試：修復未轉義的反斜槓
        # 將不合法的 \x（x 不是 " \ / b f n r t u）替換為 \\x
        fixed = re.sub(
            r'\\(?!["\\/bfnrtu])',
            r'\\\\',
            json_str,
        )
        try:
            return json.loads(fixed)
        except json.JSONDecodeError:
            pass

        # 第三次嘗試：用 Python ast.literal_eval 也不行的話，
        # 手動提取 key-value
        try:
            # 把所有反斜槓統一雙重轉義
            aggressive = json_str.replace('\\', '\\\\')
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
