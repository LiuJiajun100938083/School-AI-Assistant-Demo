"""TrOCR + doctr line-detection engine for English handwriting.

Single responsibility: convert a handwritten English image into a literal
plain-text transcription, with no language-model autocorrection.

Pipeline:
  1. Preprocess image (HEIC/EXIF/resize) via shared preprocess_for_ocr
  2. Detect text-line bounding boxes via doctr db_resnet50
  3. Sort boxes into reading order (pure function box_sorter)
  4. Crop each line and run TrOCR (greedy decoding, num_beams=1)
  5. Join lines with newlines
  6. Return HandwritingOCRResult

Why greedy decoding (num_beams=1, do_sample=False, length_penalty=1.0):
  Beam search aggregates token-level scores across the whole sequence,
  which lets the model "fix" `recieve` → `receive`. Greedy takes the
  argmax at every step in isolation, so the model can't reach back to
  smooth a misspelling into a real word.

Lazy loading:
  All heavy model objects (TrOCR processor/model + doctr predictor) are
  loaded inside an asyncio.Lock on first call. Subsequent calls reuse
  the same instances. Container can call warm_up() at startup to avoid
  paying the latency on the first user request.
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
from app.domains.handwriting_ocr.box_sorter import group_boxes_by_line
from app.domains.handwriting_ocr.preprocess import preprocess_for_ocr

logger = logging.getLogger(__name__)


class TrocrLineEngine(HandwritingOCREngine):
    """English handwriting OCR via doctr line detection + TrOCR."""

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
        self._detector = None
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
                None, self._detect_and_crop_lines, jpg,
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
        if self._model is not None and self._detector is not None:
            return
        async with self._init_lock:
            if self._model is not None and self._detector is not None:
                return
            await asyncio.get_event_loop().run_in_executor(None, self._load_sync)

    def _load_sync(self) -> None:
        import torch
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

        logger.info("loading doctr detection model db_resnet50")
        try:
            from doctr.models import detection_predictor
            detector = detection_predictor(arch="db_resnet50", pretrained=True)
        except Exception as e:
            logger.error("doctr detection_predictor failed to load: %s", e)
            raise
        self._detector = detector

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

    # ---------- detection + cropping ----------

    def _detect_and_crop_lines(self, jpg_path: str):
        """Run doctr detection and return list of cropped PIL.Image lines."""
        import numpy as np
        from PIL import Image

        pil = Image.open(jpg_path).convert("RGB")
        img = np.array(pil)
        h, w = img.shape[:2]

        # doctr expects a list of images; output is per-image dict with 'words' (or 'lines')
        try:
            outputs = self._detector([img])
        except Exception as e:
            logger.warning("doctr detection error on %s: %s", jpg_path, e)
            return []

        boxes_norm = self._extract_boxes(outputs)
        if not boxes_norm:
            return []

        # Convert normalized [0..1] coords to pixels
        boxes_px = []
        for b in boxes_norm:
            xmin = max(0.0, b[0]) * w
            ymin = max(0.0, b[1]) * h
            xmax = min(1.0, b[2]) * w
            ymax = min(1.0, b[3]) * h
            if xmax - xmin > 4 and ymax - ymin > 4:
                boxes_px.append((xmin, ymin, xmax, ymax))

        # Group into lines and merge each line into one wide crop
        line_groups = group_boxes_by_line(boxes_px)

        crops: List[Image.Image] = []
        for group in line_groups:
            xmin = min(b[0] for b in group)
            ymin = min(b[1] for b in group)
            xmax = max(b[2] for b in group)
            ymax = max(b[3] for b in group)
            # Padding helps TrOCR see the whole stroke
            pad_x = (xmax - xmin) * 0.02 + 4
            pad_y = (ymax - ymin) * 0.10 + 4
            crop = pil.crop((
                max(0, int(xmin - pad_x)),
                max(0, int(ymin - pad_y)),
                min(w, int(xmax + pad_x)),
                min(h, int(ymax + pad_y)),
            ))
            crops.append(crop)
        return crops

    @staticmethod
    def _extract_boxes(doctr_outputs):
        """Pull (xmin, ymin, xmax, ymax) tuples from a doctr predictor result.

        doctr's API has changed across versions. We try the most common
        shapes and fall back to an empty list if none match.
        """
        boxes = []
        try:
            # New-style: list of np.ndarray of shape (N, 5) [xmin, ymin, xmax, ymax, prob]
            arr = doctr_outputs[0] if isinstance(doctr_outputs, list) else doctr_outputs
            if hasattr(arr, "shape") and arr.shape[-1] >= 4:
                for row in arr:
                    boxes.append((float(row[0]), float(row[1]), float(row[2]), float(row[3])))
                return boxes
        except Exception:
            pass
        try:
            # Dict-style: {"words": np.ndarray}
            d = doctr_outputs[0] if isinstance(doctr_outputs, list) else doctr_outputs
            if isinstance(d, dict):
                arr = d.get("words") or d.get("lines") or d.get("boxes")
                if arr is not None:
                    for row in arr:
                        boxes.append((float(row[0]), float(row[1]), float(row[2]), float(row[3])))
        except Exception:
            pass
        return boxes

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
