"""Lightweight text-line detection via OpenCV horizontal projection.

Single responsibility: given a handwriting image path, return a list of
PIL.Image crops, one per detected text line, in top-to-bottom order.

Why not a deep model:
  python-doctr 1.0 requires numpy>=2 (incompatible with our pinned
  numpy==1.26.4) and 0.x backtracks to a shapely version without
  Python 3.13 wheels. To avoid pip-resolver hell we do line detection
  with classical CV: binarize → row sums → contiguous text bands.

Why this matters for forensic OCR:
  TrOCR is a generative encoder-decoder. It NEVER says "I see nothing":
  given a blank or noisy crop it will hallucinate common words from its
  training set (e.g. "Download as PDFPrintable version"). So this module
  must be CONSERVATIVE — better to miss a line than feed garbage to
  TrOCR. We apply multiple gates:
    1. ink density per row (high threshold)
    2. minimum band aspect ratio (text lines are wider than tall)
    3. ink fill ratio inside the band (drop sparse / noise bands)
    4. ink connected to a real horizontal extent (drop tall thin specks)
"""

from __future__ import annotations

import logging
from typing import List

logger = logging.getLogger(__name__)


def detect_text_lines(
    image_path: str,
    min_line_height_px: int = 24,
    pad_y_ratio: float = 0.18,
    pad_x_px: int = 8,
    # gates — tuned to avoid hallucinated TrOCR outputs
    ink_row_threshold_ratio: float = 0.04,   # row needs ≥4% width as ink
    min_band_aspect_ratio: float = 1.2,      # band width/height ≥ 1.2
    min_band_fill_ratio: float = 0.015,      # ≥1.5% of band area must be ink
    min_horizontal_extent_ratio: float = 0.04,  # ink must span ≥4% of width
    min_components_per_band: int = 2,        # band must have ≥N ink blobs
):
    """Find horizontal text lines in an image using row-projection.

    Args:
        image_path: filesystem path to a JPG/PNG
        min_line_height_px: drop bands shorter than this
        pad_y_ratio: vertical padding as ratio of band height
        pad_x_px: fixed horizontal padding (pixels)
        ink_row_threshold_ratio: row counts as "ink" if ink pixels exceed
            this fraction of image width
        min_band_aspect_ratio: a real text line is wider than tall — drop
            bands violating this (filters specks, vertical artifacts)
        min_band_fill_ratio: minimum proportion of band area that must be
            ink (filters near-empty bands like shadows / paper texture)
        min_horizontal_extent_ratio: ink within the band must cover this
            fraction of width horizontally (filters tall narrow specks)

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
            blockSize=35, C=18,  # higher C → less sensitive to noise
        )

        # ── Remove horizontal printed rules (lined notebook paper) ──
        # A printed horizontal line is, by definition, a long thin horizontal
        # feature. MORPH_OPEN with a wide-but-1-tall kernel keeps only
        # features that are at least that wide horizontally — i.e., the rules.
        # Then we subtract them from the binary image. Handwritten letters
        # have vertical strokes so they don't survive the opening — they
        # remain in the subtracted result.
        rule_width = max(40, w // 25)  # ~4% of page width
        rule_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (rule_width, 1))
        rules_only = cv2.morphologyEx(bw, cv2.MORPH_OPEN, rule_kernel)
        bw = cv2.subtract(bw, rules_only)

        # Slight horizontal closing to bridge inter-letter gaps
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        bw = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, kernel)

        # Light denoise: remove tiny isolated specks (paper texture, dust)
        denoise_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        bw = cv2.morphologyEx(bw, cv2.MORPH_OPEN, denoise_kernel)

        # Row sum: how much ink is in each row
        row_sums = np.sum(bw > 0, axis=1)

        ink_threshold = max(5, int(w * ink_row_threshold_ratio))
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

        # Merge bands that are very close vertically (descenders/ascenders)
        heights = [b[1] - b[0] for b in bands]
        median_h = sorted(heights)[len(heights) // 2]
        merge_gap = max(4, median_h // 3)

        merged: List[tuple] = []
        for b in bands:
            if merged and (b[0] - merged[-1][1]) <= merge_gap:
                merged[-1] = (merged[-1][0], b[1])
            else:
                merged.append(b)

        # Per-band quality gates — drop bands that don't look like text
        good_bands: List[tuple] = []
        for y0, y1 in merged:
            band_h = y1 - y0

            # Check horizontal extent of ink in this band
            band_bw = bw[y0:y1, :]
            col_has_ink = np.any(band_bw > 0, axis=0)
            if not col_has_ink.any():
                continue
            ink_left = int(np.argmax(col_has_ink))
            ink_right = w - int(np.argmax(col_has_ink[::-1]))
            ink_width = max(1, ink_right - ink_left)

            # Gate 1: aspect ratio (real text lines are wider than tall)
            if (ink_width / band_h) < min_band_aspect_ratio:
                logger.debug(
                    "line_detector: drop band y=%d-%d aspect=%.2f < %.2f",
                    y0, y1, ink_width / band_h, min_band_aspect_ratio,
                )
                continue

            # Gate 2: horizontal extent (ink must span enough of the page)
            if (ink_width / w) < min_horizontal_extent_ratio:
                logger.debug(
                    "line_detector: drop band y=%d-%d extent=%.3f < %.3f",
                    y0, y1, ink_width / w, min_horizontal_extent_ratio,
                )
                continue

            # Gate 3: fill ratio (band must have enough ink, not be a shadow)
            ink_pixels = int(np.sum(band_bw > 0))
            band_area = band_h * w
            fill = ink_pixels / max(1, band_area)
            if fill < min_band_fill_ratio:
                logger.debug(
                    "line_detector: drop band y=%d-%d fill=%.4f < %.4f",
                    y0, y1, fill, min_band_fill_ratio,
                )
                continue

            # Gate 4: connected components inside the band must look like
            # multiple ink blobs (letters/strokes), not one continuous bar.
            # A printed rule that survived the rule removal is one wide blob.
            # Real handwriting fragments into many small blobs.
            n_components, _, stats, _ = cv2.connectedComponentsWithStats(
                band_bw, connectivity=8,
            )
            # stats[0] is background; count non-trivial foreground components
            real_components = sum(
                1 for i in range(1, n_components)
                if stats[i, cv2.CC_STAT_AREA] >= 8  # ignore tiny specks
            )
            if real_components < min_components_per_band:
                logger.debug(
                    "line_detector: drop band y=%d-%d components=%d < %d",
                    y0, y1, real_components, min_components_per_band,
                )
                continue

            good_bands.append((y0, y1, ink_left, ink_right))

        if not good_bands:
            logger.info(
                "line_detector: no bands passed quality gates "
                "(image=%dx%d, raw_bands=%d)",
                w, h, len(merged),
            )
            return []

        # Crop each surviving band as a PIL image with padding
        # Crop horizontally too — only the region with ink, not the whole row
        crops: List = []
        for y0, y1, ink_left, ink_right in good_bands:
            band_h = y1 - y0
            pad_y = max(3, int(band_h * pad_y_ratio))
            crop = pil.crop((
                max(0, ink_left - pad_x_px),
                max(0, y0 - pad_y),
                min(w, ink_right + pad_x_px),
                min(h, y1 + pad_y),
            ))
            crops.append(crop)

        logger.info(
            "line_detector: %d crops kept (raw=%d) for %s",
            len(crops), len(merged), image_path,
        )
        return crops
    except Exception as e:
        logger.warning("line_detector: detection failed for %s: %s", image_path, e)
        return []
