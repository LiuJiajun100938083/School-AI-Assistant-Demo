"""TrOCR + OpenCV line-detection engine for English handwriting.

Single responsibility: convert a handwritten English image into a literal
plain-text transcription, with no language-model autocorrection.

Pipeline:
  1. Preprocess image (HEIC/EXIF/resize) via shared preprocess_for_ocr
  2. Detect text-line crops via OpenCV horizontal projection
     (line_detector.detect_text_lines — no deep model, no extra deps)
  3. Run TrOCR on each crop (greedy decoding, num_beams=1)
  4. Join lines with newlines
  5. Return HandwritingOCRResult

Why greedy decoding (num_beams=1, do_sample=False, length_penalty=1.0):
  Beam search aggregates token-level scores across the whole sequence,
  which lets the model "fix" `recieve` → `receive`. Greedy takes the
  argmax at every step in isolation, so the model can't reach back to
  smooth a misspelling into a real word.

Why OpenCV instead of doctr:
  doctr 1.0 needs numpy>=2 (we pin numpy 1.26.4); doctr 0.x backtracks
  to broken shapely versions. Classical row-projection on adaptive-
  thresholded handwriting works very well for the dictation use case
  (students write on lined paper with clear spacing).

Lazy loading:
  TrOCR processor/model is loaded inside an asyncio.Lock on first call.
  Subsequent calls reuse the same instances. Container can call
  warm_up() at startup to avoid paying the latency on the first user
  request.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import List, Optional

from app.domains.handwriting_ocr.base import (
    HandwritingOCREngine,
    HandwritingOCRResult,
)
from app.domains.handwriting_ocr.line_detector import detect_text_lines
from app.domains.handwriting_ocr.preprocess import preprocess_for_ocr

logger = logging.getLogger(__name__)


class TrocrLineEngine(HandwritingOCREngine):
    """English handwriting OCR via OpenCV line detection + TrOCR."""

    name = "trocr_local"
    supports = frozenset({"en"})

    def __init__(
        self,
        model_name: str = "microsoft/trocr-large-handwritten",
        device: str = "auto",
        max_lines: int = 64,
    ):
        self._model_name = model_name
        self._device_pref = device
        self._max_lines = max_lines

        self._processor = None
        self._model = None
        self._device = None
        self._init_lock = asyncio.Lock()

    # ---------- public API ----------

    async def warm_up(self) -> None:
        try:
            await self._ensure_loaded()
        except Exception as e:
            logger.warning("trocr_line_engine warm-up failed: %s", e)

    async def recognize_image(
        self, image_path: str, language: str = "en",
    ) -> HandwritingOCRResult:
        # Engine is English-only; if caller asks for zh, fail-soft so
        # the registry can fall through to vision_llm.
        if language != "en":
            return HandwritingOCRResult(
                engine=self.name,
                success=False,
                error=f"trocr_local does not support language={language}",
            )

        t0 = time.monotonic()
        try:
            await self._ensure_loaded()
            jpg = await preprocess_for_ocr(image_path)

            line_crops = await asyncio.get_event_loop().run_in_executor(
                None, detect_text_lines, jpg,
            )
            if not line_crops:
                # Detection found nothing → try recognizing the whole image
                # as one line. Some pages have a single short answer.
                logger.info(
                    "trocr_line_engine: no lines detected, falling back to whole-image"
                )
                from PIL import Image
                whole = Image.open(jpg).convert("RGB")
                line_crops = [whole]

            if len(line_crops) > self._max_lines:
                logger.warning(
                    "trocr_line_engine: %d lines exceeded max %d, truncating",
                    len(line_crops), self._max_lines,
                )
                line_crops = line_crops[: self._max_lines]

            lines = await asyncio.get_event_loop().run_in_executor(
                None, self._recognize_crops, line_crops,
            )
            text = "\n".join(line for line in lines if line)
            elapsed = time.monotonic() - t0

            if not text:
                return HandwritingOCRResult(
                    engine=self.name,
                    success=False,
                    error="trocr produced empty text",
                    metadata={"elapsed_sec": round(elapsed, 2)},
                )

            return HandwritingOCRResult(
                text=text,
                lines=tuple(lines),
                confidence=self._estimate_confidence(lines),
                engine=self.name,
                metadata={
                    "model": self._model_name,
                    "n_lines": len(lines),
                    "elapsed_sec": round(elapsed, 2),
                },
            )
        except Exception as e:
            logger.exception("trocr_line_engine failed on %s", image_path)
            return HandwritingOCRResult(
                engine=self.name, success=False, error=str(e),
            )

    # ---------- model loading ----------

    async def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        async with self._init_lock:
            if self._model is not None:
                return
            await asyncio.get_event_loop().run_in_executor(None, self._load_sync)

    def _load_sync(self) -> None:
        from transformers import TrOCRProcessor, VisionEncoderDecoderModel

        device = self._resolve_device()
        logger.info(
            "loading TrOCR model '%s' on device=%s",
            self._model_name, device,
        )
        processor = TrOCRProcessor.from_pretrained(self._model_name)
        model = VisionEncoderDecoderModel.from_pretrained(self._model_name)
        model.to(device)
        model.eval()
        self._processor = processor
        self._model = model
        self._device = device

    def _resolve_device(self) -> str:
        import torch
        pref = (self._device_pref or "auto").lower()
        if pref == "cpu":
            return "cpu"
        if pref == "cuda":
            return "cuda" if torch.cuda.is_available() else "cpu"
        # auto
        if torch.cuda.is_available():
            return "cuda"
        return "cpu"

    # ---------- recognition ----------

    def _recognize_crops(self, crops):
        import torch
        from PIL import Image
        results: List[str] = []
        if not crops:
            return results

        # Batch in chunks of 8 to bound memory
        batch_size = 8
        for i in range(0, len(crops), batch_size):
            batch = crops[i : i + batch_size]
            pixel_values = self._processor(images=batch, return_tensors="pt").pixel_values
            pixel_values = pixel_values.to(self._device)
            with torch.no_grad():
                generated = self._model.generate(
                    pixel_values,
                    num_beams=1,             # greedy — no beam-search smoothing
                    do_sample=False,         # deterministic
                    length_penalty=1.0,      # no length bias
                    no_repeat_ngram_size=0,  # don't suppress repetitions
                    early_stopping=False,
                    max_new_tokens=64,
                )
            decoded = self._processor.batch_decode(generated, skip_special_tokens=True)
            for s in decoded:
                results.append(s.strip())
        return results

    @staticmethod
    def _estimate_confidence(lines: List[str]) -> float:
        """Rough heuristic confidence:
        - 0.0 if no lines
        - decreases with proportion of empty / very-short lines
        - capped at 0.85 because we have no real per-token logprob exposed
        """
        if not lines:
            return 0.0
        non_empty = sum(1 for l in lines if len(l.strip()) >= 2)
        ratio = non_empty / max(1, len(lines))
        return round(min(0.85, 0.4 + 0.45 * ratio), 3)
