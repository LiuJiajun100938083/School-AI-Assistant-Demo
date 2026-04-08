"""Image preprocessing utilities for OCR engines.

Single responsibility: convert any input image (HEIC/JPG/PNG, possibly
rotated, possibly huge) into a normalized RGB JPG ready for OCR.

Pure functions where possible (compute_resize_dims) plus an async wrapper
that handles file IO and PIL operations off-thread.
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Tuple

logger = logging.getLogger(__name__)

# Default max long-side after resize. OCR models work best around 1500-2500px.
DEFAULT_MAX_DIM = 2048
DEFAULT_JPEG_QUALITY = 92


def compute_resize_dims(
    src_w: int, src_h: int, max_dim: int = DEFAULT_MAX_DIM,
) -> Tuple[int, int]:
    """Compute target (width, height) preserving aspect ratio.

    Pure function — no IO. Easy to unit test.

    Args:
        src_w: source width
        src_h: source height
        max_dim: target maximum dimension (long side)

    Returns:
        (target_w, target_h). If image is already smaller than max_dim
        in both dimensions, returns the source dimensions unchanged.
    """
    if src_w <= 0 or src_h <= 0:
        return (src_w, src_h)
    long_side = max(src_w, src_h)
    if long_side <= max_dim:
        return (src_w, src_h)
    scale = max_dim / long_side
    return (max(1, int(round(src_w * scale))), max(1, int(round(src_h * scale))))


async def preprocess_for_ocr(
    image_path: str,
    max_dim: int = DEFAULT_MAX_DIM,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> str:
    """Normalize an image to RGB JPG, applying EXIF rotation and resize.

    Output is written to `<dir>/.processed/<basename>.jpg` and the path
    is returned. Heavy PIL operations run in a thread executor so async
    callers don't block the event loop.

    Always returns a path. If processing fails, returns the original path
    and logs a warning — engines downstream should handle whatever they get.
    """
    return await asyncio.get_event_loop().run_in_executor(
        None, _preprocess_sync, image_path, max_dim, jpeg_quality,
    )


def _preprocess_sync(image_path: str, max_dim: int, jpeg_quality: int) -> str:
    try:
        # Late imports so unit tests of pure helpers don't pull PIL.
        from PIL import Image, ImageOps
        try:
            import pillow_heif  # type: ignore
            pillow_heif.register_heif_opener()
        except Exception:
            pass

        src = Path(image_path)
        out_dir = src.parent / ".processed"
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / (src.stem + ".jpg")

        with Image.open(src) as im:
            im = ImageOps.exif_transpose(im)  # respect EXIF orientation
            if im.mode not in ("RGB", "L"):
                im = im.convert("RGB")
            elif im.mode == "L":
                im = im.convert("RGB")
            tw, th = compute_resize_dims(im.width, im.height, max_dim)
            if (tw, th) != (im.width, im.height):
                im = im.resize((tw, th), Image.LANCZOS)
            im.save(out_path, "JPEG", quality=jpeg_quality, optimize=True)
        return str(out_path)
    except Exception as e:
        logger.warning("preprocess_for_ocr failed for %s: %s", image_path, e)
        return image_path
