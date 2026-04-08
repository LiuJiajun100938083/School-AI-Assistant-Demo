"""Lightweight text-line detection via OpenCV horizontal projection.

Single responsibility: given a handwriting image path, return a list of
PIL.Image crops, one per detected text line, in top-to-bottom order.

Why not a deep model:
  python-doctr 1.0 requires numpy>=2 (incompatible with our pinned
  numpy==1.26.4) and 0.x backtracks to a shapely version without
  Python 3.13 wheels. To avoid pip-resolver hell we do line detection
  with classical CV: binarize → row sums → contiguous text bands.

Quality:
  Works very well for handwritten English on lined or blank paper with
  clear vertical spacing between lines (the typical dictation use case).
  For dense / overlapping handwriting it may merge two lines into one.
  In that case the engine still works (TrOCR will just transcribe the
  merged region as one longer string), accuracy degrades gracefully.

Pure-ish: imports cv2/numpy lazily inside the function so the module
can be imported without those deps installed (e.g. in unit tests of
the calling code).
"""

from __future__ import annotations

import logging
from typing import List

logger = logging.getLogger(__name__)


def detect_text_lines(
    image_path: str,
    min_line_height_px: int = 12,
    pad_y_ratio: float = 0.15,
    pad_x_px: int = 6,
):
    """Find horizontal text lines in an image using row-projection.

    Args:
        image_path: filesystem path to a JPG/PNG
        min_line_height_px: drop bands shorter than this (noise filter)
        pad_y_ratio: vertical padding as ratio of band height
        pad_x_px: fixed horizontal padding (pixels)

    Returns:
        List of PIL.Image.Image crops, one per line, top-to-bottom.
        Empty list if no lines found or on any error.
    """
    try:
        import cv2  # type: ignore
        import numpy as np
        from PIL import Image
    except Exception as e:
        logger.warning("line_detector: cv2/PIL import failed: %s", e)
        return []

    try:
        # Load as RGB PIL first (so we can crop later) and grayscale numpy for CV
        pil = Image.open(image_path).convert("RGB")
        rgb = np.array(pil)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        h, w = gray.shape[:2]

        # Adaptive threshold tolerates uneven lighting on phone photos.
        # Inverted so ink (writing) becomes white (255).
        bw = cv2.adaptiveThreshold(
            gray, 255,
            cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV,
            blockSize=35, C=15,
        )

        # Slight horizontal closing to bridge inter-letter gaps within a word
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, kernel)

        # Row sum: how much ink is in each row
        row_sums = np.sum(bw > 0, axis=1)

        # A row is "ink" if it has more than 1% of width as ink pixels
        ink_threshold = max(3, int(w * 0.01))
        is_ink = row_sums > ink_threshold

        # Find contiguous bands of ink rows
        bands: List[tuple] = []
        in_band = False
        band_start = 0
        for y in range(h):
            if is_ink[y]:
                if not in_band:
                    in_band = True
                    band_start = y
            else:
                if in_band:
                    in_band = False
                    bands.append((band_start, y))
        if in_band:
            bands.append((band_start, h))

        # Filter out tiny bands (noise specks)
        bands = [b for b in bands if b[1] - b[0] >= min_line_height_px]

        if not bands:
            return []

        # Merge bands that are very close vertically (same line broken
        # by descenders / ascenders gap). Threshold = half median height.
        heights = [b[1] - b[0] for b in bands]
        median_h = sorted(heights)[len(heights) // 2]
        merge_gap = max(4, median_h // 3)

        merged: List[tuple] = []
        for b in bands:
            if merged and (b[0] - merged[-1][1]) <= merge_gap:
                merged[-1] = (merged[-1][0], b[1])
            else:
                merged.append(b)

        # Crop each merged band as a PIL image with padding
        crops: List = []
        for y0, y1 in merged:
            band_h = y1 - y0
            pad_y = max(2, int(band_h * pad_y_ratio))
            crop = pil.crop((
                max(0, 0 - pad_x_px),  # left padding (clamped)
                max(0, y0 - pad_y),
                min(w, w + pad_x_px),  # right padding
                min(h, y1 + pad_y),
            ))
            crops.append(crop)

        return crops
    except Exception as e:
        logger.warning("line_detector: detection failed for %s: %s", image_path, e)
        return []
