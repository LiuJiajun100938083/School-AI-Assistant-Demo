"""多圖合併 PDF — 純函式葉節點

依賴: reportlab + Pillow (已在 requirements)
職責: list[bytes] → PDF bytes
  - 每張圖一頁 A4 置中縮放
  - 處理 RGBA/P 透明度轉 RGB
  - 失敗時 raise 領域異常
"""

import io
import logging
from typing import List, Tuple

from app.domains.tools.constants import PDF_MAX_IMAGES
from app.domains.tools.exceptions import (
    FileTooLargeError,
    ToolInputError,
    ToolProcessingError,
    UnsupportedFormatError,
)

logger = logging.getLogger(__name__)


def _normalize_image(img):
    """把 RGBA / P / LA 轉成白底 RGB,避免 reportlab 處理透明度出錯"""
    if img.mode in ("RGBA", "LA"):
        from PIL import Image
        background = Image.new("RGB", img.size, (255, 255, 255))
        alpha = img.split()[-1]
        background.paste(img.convert("RGB"), mask=alpha)
        return background
    if img.mode == "P":
        return img.convert("RGB")
    if img.mode != "RGB":
        return img.convert("RGB")
    return img


def merge_images_to_pdf(
    image_bytes_list: List[bytes],
    *,
    page_size: Tuple[float, float] = None,
    margin: float = 36.0,
) -> bytes:
    """
    把多張圖片合併成一份 PDF,每張佔一頁。

    Args:
        image_bytes_list: 原始圖片 bytes 列表(PNG/JPEG/WebP/GIF)
        page_size: (width, height) in points,預設 A4
        margin: 頁面邊距 (points)

    Returns:
        PDF bytes

    Raises:
        ToolInputError: 空列表
        FileTooLargeError: 超過 PDF_MAX_IMAGES
        UnsupportedFormatError: 單張圖片無法解析
        ToolProcessingError: reportlab 其他失敗
    """
    if not image_bytes_list:
        raise ToolInputError("PDF_NO_IMAGES", "至少需要一張圖片")
    if len(image_bytes_list) > PDF_MAX_IMAGES:
        raise FileTooLargeError(
            "PDF_TOO_MANY_FILES",
            f"單次最多合併 {PDF_MAX_IMAGES} 張",
        )

    try:
        from PIL import Image
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.utils import ImageReader
        from reportlab.pdfgen import canvas as rl_canvas
    except ImportError as e:
        raise ToolProcessingError("PDF_LIB_MISSING", f"缺少依賴: {e}") from e

    ps = page_size or A4
    pw, ph = ps
    max_w = pw - 2 * margin
    max_h = ph - 2 * margin

    out = io.BytesIO()
    try:
        c = rl_canvas.Canvas(out, pagesize=ps)
        for idx, raw in enumerate(image_bytes_list):
            try:
                img = Image.open(io.BytesIO(raw))
                img.load()
            except Exception as e:  # noqa: BLE001
                raise UnsupportedFormatError(
                    "IMAGE_DECODE_FAILED",
                    f"第 {idx + 1} 張圖片無法解析",
                ) from e

            img = _normalize_image(img)
            iw, ih = img.size
            ratio = min(max_w / iw, max_h / ih, 1.0)
            dw, dh = iw * ratio, ih * ratio
            x = (pw - dw) / 2
            y = (ph - dh) / 2

            try:
                c.drawImage(
                    ImageReader(img), x, y,
                    width=dw, height=dh,
                    preserveAspectRatio=True, mask="auto",
                )
            except Exception as e:  # noqa: BLE001
                raise ToolProcessingError(
                    "PDF_DRAW_FAILED",
                    f"第 {idx + 1} 張圖片寫入 PDF 失敗",
                ) from e
            c.showPage()
        c.save()
    except (ToolInputError, FileTooLargeError, UnsupportedFormatError, ToolProcessingError):
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("PDF build failed: %s", e)
        raise ToolProcessingError("PDF_BUILD_FAILED", "PDF 產生失敗") from e

    return out.getvalue()
