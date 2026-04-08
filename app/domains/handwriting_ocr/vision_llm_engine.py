"""Vision-LLM-backed OCR engine (legacy / fallback).

Single responsibility: adapt the existing VisionService into the
HandwritingOCREngine contract so the dictation service can treat it
identically to any other OCR provider.

This engine wraps `recognize_english_dictation` / `recognize_chinese_dictation`
which use the strict forensic prompts in `app/domains/vision/ocr_prompts.py`.
It is the safety net when a stricter engine (TrOCR) fails or is disabled.
"""

from __future__ import annotations

import logging

from app.domains.handwriting_ocr.base import (
    HandwritingOCREngine,
    HandwritingOCRResult,
)

logger = logging.getLogger(__name__)


class VisionLLMEngine(HandwritingOCREngine):
    """Adapter: VisionService → HandwritingOCREngine."""

    name = "vision_llm"
    supports = frozenset({"en", "zh"})

    def __init__(self, vision_service, language: str = "en"):
        """
        Args:
            vision_service: app.domains.vision.service.VisionService
            language: which dictation method to invoke ('en' or 'zh').
                One VisionLLMEngine instance is dedicated to one language so
                the registry can hold separate adapters per language.
        """
        self._vision = vision_service
        self._language = language

    async def recognize_image(self, image_path: str) -> HandwritingOCRResult:
        try:
            if self._language == "zh":
                result = await self._vision.recognize_chinese_dictation(image_path)
            else:
                result = await self._vision.recognize_english_dictation(image_path)
        except Exception as e:
            logger.exception("vision_llm engine failed on %s", image_path)
            return HandwritingOCRResult(
                engine=self.name, success=False, error=str(e),
            )

        if not getattr(result, "success", True):
            return HandwritingOCRResult(
                engine=self.name,
                success=False,
                error=getattr(result, "error", None) or "vision LLM returned failure",
            )

        text = (
            getattr(result, "answer_text", "")
            or getattr(result, "raw_text", "")
            or ""
        ).strip()

        confidence = float(
            getattr(result, "answer_confidence", 0.0)
            or getattr(result, "confidence", 0.0)
            or 0.0
        )

        lines = tuple(line for line in text.split("\n") if line.strip())

        return HandwritingOCRResult(
            text=text,
            lines=lines,
            confidence=confidence,
            engine=self.name,
            metadata={"language": self._language},
        )
