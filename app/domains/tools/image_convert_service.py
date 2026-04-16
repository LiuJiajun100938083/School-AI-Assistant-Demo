"""圖片格式轉換 — 純函數 service

bytes in → bytes out, 零檔案系統寫入, 轉換完畢即丟棄。
僅在瀏覽器無法解碼 (HEIC 等) 時由前端呼叫。
"""

from __future__ import annotations

import io
import logging
from typing import Tuple

from app.domains.tools.constants import ALLOWED_IMAGE_CONVERT_OUTPUT
from app.domains.tools.exceptions import ToolInputError, UnsupportedFormatError

logger = logging.getLogger(__name__)

_FORMAT_TO_MIME = {
    "png": "image/png",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}


def convert_image(
    data: bytes,
    *,
    target_format: str,
    quality: int = 92,
) -> Tuple[bytes, str]:
    """Convert image bytes to *target_format*.

    Returns (output_bytes, mime_type).
    Pure in-memory — nothing is saved to disk.
    """
    if target_format not in ALLOWED_IMAGE_CONVERT_OUTPUT:
        raise ToolInputError(
            "INVALID_TARGET_FORMAT",
            f"target_format must be one of {sorted(ALLOWED_IMAGE_CONVERT_OUTPUT)}",
        )

    try:
        from PIL import Image, ImageOps

        try:
            import pillow_heif
            pillow_heif.register_heif_opener()
        except Exception:
            pass

        im = Image.open(io.BytesIO(data))
    except Exception as exc:
        raise UnsupportedFormatError(
            "CANNOT_DECODE",
            f"無法解碼圖片: {exc}",
        ) from exc

    # EXIF rotation (critical for HEIC from iPhones)
    im = ImageOps.exif_transpose(im)

    # RGBA / palette → RGB (JPEG doesn't support transparency)
    if target_format == "jpeg" and im.mode in ("RGBA", "LA", "PA", "P"):
        bg = Image.new("RGB", im.size, (255, 255, 255))
        bg.paste(im, mask=im.convert("RGBA").split()[-1])
        im = bg
    elif im.mode not in ("RGB", "L"):
        im = im.convert("RGB")

    buf = io.BytesIO()
    save_kwargs: dict = {"format": target_format.upper()}
    if target_format in ("jpeg", "webp"):
        save_kwargs["quality"] = quality
        if target_format == "jpeg":
            save_kwargs["optimize"] = True
    im.save(buf, **save_kwargs)

    mime = _FORMAT_TO_MIME.get(target_format, "application/octet-stream")
    return buf.getvalue(), mime
