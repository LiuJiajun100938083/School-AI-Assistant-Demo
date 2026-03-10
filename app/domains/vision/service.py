"""
VisionService — 視覺識別服務 (Facade)
=====================================
薄代理層，組合各模組提供統一的公開 API。
實際邏輯分散在：
- ollama_client.py  — Ollama API 通信
- json_utils.py     — JSON 提取/修復/驗證
- ocr_prompts.py    — 三科 OCR prompt 模板
- ocr_parser.py     — OCR 結果解析
- exam_recognizer.py — 試卷識別鏈路
- figure_handler.py — 幾何圖形描述 + schema 驗證
"""

import os
import logging
from typing import Optional

from app.domains.vision.schemas import (
    ExamPaperResult,
    OCRResult,
    ImageInfo,
    RecognitionSubject,
    RecognitionTask,
)
from app.domains.vision.ollama_client import OllamaVisionClient
from app.domains.vision.exam_recognizer import ExamRecognizer
from app.domains.vision.ocr_prompts import build_ocr_prompt
from app.domains.vision.ocr_parser import parse_ocr_response
from app.domains.vision import json_utils
from app.domains.vision import figure_handler

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
        timeout: int = 300,  # 30B 模型推理較慢，默認 5 分鐘
    ):
        self._vision_model = vision_model
        self._base_url = ollama_base_url
        self._max_image_size = max_image_size
        self._timeout = timeout
        self._client = OllamaVisionClient(
            vision_model=vision_model,
            base_url=ollama_base_url,
            max_image_size=max_image_size,
            timeout=timeout,
        )
        self._exam = ExamRecognizer(self._client)

    # ================================================================
    #  公開方法 — OCR
    # ================================================================

    async def recognize(
        self,
        image_path: str,
        subject: RecognitionSubject,
        task: RecognitionTask = RecognitionTask.QUESTION_AND_ANSWER,
    ) -> OCRResult:
        """主入口：識別圖片中的題目和答案"""
        try:
            if not os.path.exists(image_path):
                return OCRResult(success=False, error=f"圖片文件不存在: {image_path}")

            processed_path = await self._client.preprocess_image(image_path)
            prompt = build_ocr_prompt(subject, task)

            # 首次調用：JSON 強制模式
            raw_response = await self._client.call_vision_model_json(processed_path, prompt)

            # 回退：普通模式
            if raw_response is None:
                logger.warning("JSON 模式調用失敗，回退到普通模式...")
                raw_response = await self._client.call_vision_model(processed_path, prompt)

            if raw_response is None:
                return OCRResult(success=False, error="視覺模型調用失敗")

            result = parse_ocr_response(raw_response, subject, task)

            # 如果解析完全失敗，重試
            if not result.question_text:
                logger.warning("首次 OCR 解析失敗（question 為空），嘗試重試...")
                retry_prompt = (
                    "/no_think\n"
                    "CRITICAL: Output ONLY a valid JSON object. "
                    "Do NOT include reasoning, explanations, markdown, or <think> tags. "
                    "Start with { and end with }.\n\n"
                    + prompt
                )
                retry_response = await self._client.call_vision_model(
                    processed_path, retry_prompt
                )
                if retry_response:
                    retry_result = parse_ocr_response(retry_response, subject, task)
                    if retry_result.question_text:
                        logger.info("重試 OCR 成功")
                        return retry_result

            return result

        except Exception as e:
            logger.error("圖片識別異常: %s", e, exc_info=True)
            return OCRResult(success=False, error=str(e))

    async def recognize_math(self, image_path: str) -> OCRResult:
        """數學專用識別（公式 + 解題步驟）"""
        return await self.recognize(
            image_path, RecognitionSubject.MATH, RecognitionTask.MATH_SOLUTION,
        )

    async def recognize_chinese_writing(self, image_path: str) -> OCRResult:
        """中文手寫作文/答案識別"""
        return await self.recognize(
            image_path, RecognitionSubject.CHINESE, RecognitionTask.ESSAY,
        )

    async def recognize_english_dictation(self, image_path: str) -> OCRResult:
        """英文默書識別"""
        return await self.recognize(
            image_path, RecognitionSubject.ENGLISH, RecognitionTask.DICTATION,
        )

    # ================================================================
    #  公開方法 — 試卷識別
    # ================================================================

    async def recognize_exam_paper(
        self,
        image_path: str,
        subject: RecognitionSubject = RecognitionSubject.CHINESE,
    ) -> ExamPaperResult:
        """識別試卷圖片中的所有題目、答案和分數。"""
        return await self._exam.recognize_exam_paper(image_path, subject)

    # ================================================================
    #  公開方法 — 幾何圖形
    # ================================================================

    @staticmethod
    def generate_readable_description(fig_json_str: str, schema_version: int = 1) -> str:
        """將 figure_description JSON 轉為人類可讀文字。"""
        return figure_handler.generate_readable_description(fig_json_str, schema_version)

    @staticmethod
    def generate_display_descriptor(fig_json_str: str) -> "dict | None":
        """生成結構化展示字典，供前端渲染。"""
        return figure_handler.generate_display_descriptor(fig_json_str)

    @staticmethod
    def validate_figure_schema(fig_json: dict, version: int = 2) -> list:
        """輕量校驗器，返回警告列表（非阻塞）。"""
        return figure_handler.validate_figure_schema(fig_json, version)

    # ================================================================
    #  工具方法 — 向後兼容
    # ================================================================

    @staticmethod
    def _repair_truncated_json(s: str):
        """向後兼容：委派到 json_utils。"""
        return json_utils.repair_truncated_json(s)

    @staticmethod
    def _safe_json_loads(json_str: str) -> dict:
        """向後兼容：委派到 json_utils。"""
        return json_utils.safe_json_loads(json_str)

    @staticmethod
    def _encode_image_base64(image_path: str) -> Optional[str]:
        """向後兼容：委派到 ollama_client。"""
        from app.domains.vision.ollama_client import encode_image_base64
        return encode_image_base64(image_path)

    @staticmethod
    def _extract_json_from_thinking(text: str) -> str:
        """向後兼容：委派到 json_utils。"""
        return json_utils.extract_json_from_thinking(text)

    @staticmethod
    def _looks_like_pure_reasoning(text: str) -> bool:
        """向後兼容：委派到 json_utils。"""
        return json_utils.looks_like_pure_reasoning(text)

    @staticmethod
    def _strip_thinking_tags(content: str) -> str:
        """向後兼容：委派到 json_utils。"""
        return json_utils.strip_thinking_tags(content)

    def _validate_exam_json(self, text: str) -> bool:
        """向後兼容：委派到 json_utils。"""
        return json_utils.validate_exam_json(text)

    @staticmethod
    def _normalize_figure_description(raw) -> str:
        """向後兼容：委派到 figure_handler。"""
        return figure_handler.normalize_figure_description(raw)

    @staticmethod
    def _try_parse_exam_json(text: str):
        """向後兼容：委派到 json_utils。"""
        return json_utils.try_parse_exam_json(text)

    @staticmethod
    def _recover_questions_from_text(raw: str):
        """向後兼容：委派到 exam_recognizer。"""
        from app.domains.vision.exam_recognizer import recover_questions_from_text
        return recover_questions_from_text(raw)

    @staticmethod
    def _parse_points_value(raw):
        """向後兼容：委派到 exam_recognizer。"""
        from app.domains.vision.exam_recognizer import parse_points_value
        return parse_points_value(raw)

    # ================================================================
    #  工具方法 — PDF / 圖片
    # ================================================================

    @staticmethod
    def pdf_to_images(pdf_path: str, dpi: int = 200) -> list:
        """將 PDF 每頁轉為 JPEG 圖片。"""
        import fitz  # PyMuPDF

        doc = fitz.open(pdf_path)
        output_dir = os.path.join(os.path.dirname(pdf_path), ".pdf_pages")
        os.makedirs(output_dir, exist_ok=True)

        image_paths = []
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            mat = fitz.Matrix(dpi / 72, dpi / 72)
            pix = page.get_pixmap(matrix=mat)
            img_path = os.path.join(output_dir, f"page_{page_num + 1}.jpg")
            pix.save(img_path)
            image_paths.append(img_path)
            logger.debug("PDF 第 %d 頁已轉為圖片: %s", page_num + 1, img_path)

        doc.close()
        logger.info("PDF 轉圖完成: %s → %d 頁", pdf_path, len(image_paths))
        return image_paths

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
