"""OCR engine registry with language-aware fallback chains.

Single responsibility: pick the right engine for a language and, on
failure, walk down a configured fallback chain.

Adding a new provider for a language requires only:
  1. Register the engine instance in `engines` dict (in container.py)
  2. Add it to `_fallback_chain[lang]`

No business code in `dictation/` ever needs to change.
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from app.domains.handwriting_ocr.base import (
    HandwritingOCREngine,
    HandwritingOCRResult,
)

logger = logging.getLogger(__name__)


class HandwritingOCRRegistry:
    """Holds engine singletons and resolves them per language."""

    def __init__(
        self,
        engines: Dict[str, HandwritingOCREngine],
        primary_by_language: Dict[str, str],
        fallback_chain: Optional[Dict[str, List[str]]] = None,
    ):
        """
        Args:
            engines: {engine_name: engine_instance}
            primary_by_language: {"en": "trocr_local", "zh": "vision_llm"}
            fallback_chain: per-language priority list (primary first or not).
                If None, defaults to [primary, vision_llm] dedup.
        """
        self._engines = engines
        self._primary = primary_by_language
        if fallback_chain is None:
            fallback_chain = {
                lang: self._dedup([primary, "vision_llm"])
                for lang, primary in primary_by_language.items()
            }
        self._fallback_chain = fallback_chain

    @staticmethod
    def _dedup(names: List[str]) -> List[str]:
        seen = set()
        out = []
        for n in names:
            if n and n not in seen:
                seen.add(n)
                out.append(n)
        return out

    def has(self, name: str) -> bool:
        return name in self._engines

    def primary_for(self, language: str) -> str:
        return self._primary.get(language, "vision_llm")

    async def recognize_with_fallback(
        self, image_path: str, language: str,
    ) -> HandwritingOCRResult:
        """Try the primary engine for `language`; on failure walk fallback chain.

        Always returns a HandwritingOCRResult (never raises). The `engine`
        field reflects whichever engine actually produced the text.
        """
        chain = self._fallback_chain.get(language) or [self.primary_for(language)]
        last_error: Optional[str] = None

        for name in chain:
            engine = self._engines.get(name)
            if engine is None:
                continue
            result = await engine.recognize_image(image_path, language=language)
            if result.success and result.text:
                if name != chain[0]:
                    logger.info(
                        "OCR fallback hit: language=%s primary=%s used=%s",
                        language, chain[0], name,
                    )
                return result
            last_error = result.error or "empty text"
            logger.warning(
                "OCR engine '%s' failed for language=%s: %s",
                name, language, last_error,
            )

        return HandwritingOCRResult(
            engine="none",
            success=False,
            error=last_error or "all engines failed",
        )

    async def warm_up_all(self) -> None:
        """Pre-load every registered engine. Safe to call at startup."""
        for name, engine in self._engines.items():
            try:
                await engine.warm_up()
            except Exception as e:
                logger.warning("Warm-up failed for engine %s: %s", name, e)
