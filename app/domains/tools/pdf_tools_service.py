"""PDF 多功能工具 — 純函式葉節點

5 個公開函式,全部接受/回傳 bytes,完全不碰 DB / 檔案系統 / HTTP:
  - merge_images_to_pdf  : [img_bytes] → pdf bytes (每張一頁 A4 置中)
  - merge_pdfs           : [pdf_bytes] → pdf bytes (按順序串接)
  - extract_pdf_pages    : pdf_bytes + ranges "1-3,5,7-10" → pdf bytes (子集)
  - compress_pdf         : pdf_bytes + level → pdf bytes (重新採樣圖片降低檔案大小)
  - watermark_pdf        : pdf_bytes + text + opacity + angle → pdf bytes (每頁加文字浮水印)

依賴:
  - Pillow, reportlab (圖片轉 PDF,已在 requirements)
  - PyMuPDF (fitz,已在 requirements) — 負責其他 4 個操作

所有函式失敗時 raise 領域異常,由全域錯誤中介統一轉為 API response。
"""

import io
import logging
import re
from typing import List, Tuple

from app.domains.tools.constants import (
    PDF_COMPRESS_DEFAULT,
    PDF_COMPRESS_LEVELS,
    PDF_COMPRESS_PRESETS,
    PDF_MAX_IMAGES,
    PDF_MAX_PAGES,
    PDF_MERGE_MAX_FILES,
    PDF_WATERMARK_ANGLE_CHOICES,
    PDF_WATERMARK_MAX_TEXT_LEN,
)
from app.domains.tools.exceptions import (
    FileTooLargeError,
    ToolInputError,
    ToolProcessingError,
    UnsupportedFormatError,
)

logger = logging.getLogger(__name__)


# ============================================================
# helpers
# ============================================================

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


def _open_pdf_or_raise(pdf_bytes: bytes, *, name: str = "PDF"):
    """打開一份 PDF,驗證不超過頁數上限,失敗時 raise。回傳 fitz.Document"""
    if not pdf_bytes or not pdf_bytes.startswith(b"%PDF"):
        raise UnsupportedFormatError(
            "PDF_INVALID",
            f"{name} 不是合法的 PDF 檔案",
        )
    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise ToolProcessingError("PDF_LIB_MISSING", f"缺少 PyMuPDF: {e}") from e

    try:
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    except Exception as e:  # noqa: BLE001
        raise UnsupportedFormatError(
            "PDF_OPEN_FAILED",
            f"無法讀取 {name}:{e}",
        ) from e

    if doc.page_count > PDF_MAX_PAGES:
        doc.close()
        raise FileTooLargeError(
            "PDF_TOO_MANY_PAGES",
            f"{name} 超過 {PDF_MAX_PAGES} 頁上限(實際 {doc.page_count} 頁)",
        )
    return doc


def parse_page_ranges(ranges_str: str, total_pages: int) -> List[int]:
    """
    解析使用者輸入的頁面範圍字串。

    支援格式:
      "1"           → [1]
      "1-3"         → [1, 2, 3]
      "1,3,5"       → [1, 3, 5]
      "1-3,5,7-10"  → [1, 2, 3, 5, 7, 8, 9, 10]
      " 1 - 3 "     → [1, 2, 3]  (忽略空白)

    頁碼為 1-based(使用者視角),結果也是 1-based。
    去重並保留輸入順序(extract 時順序有意義)。

    Raises:
        ToolInputError: 格式錯誤 / 頁碼超出範圍 / 空字串
    """
    if not ranges_str or not ranges_str.strip():
        raise ToolInputError("PDF_RANGES_EMPTY", "請輸入要提取的頁面範圍")

    cleaned = re.sub(r"\s+", "", ranges_str)
    if not re.fullmatch(r"[0-9,\-]+", cleaned):
        raise ToolInputError(
            "PDF_RANGES_INVALID",
            "頁面範圍格式錯誤,只能包含數字、逗號、連字號,例如 1-3,5,7-10",
        )

    result: List[int] = []
    seen = set()
    for part in cleaned.split(","):
        if not part:
            continue
        if "-" in part:
            try:
                lo_str, hi_str = part.split("-", 1)
                lo, hi = int(lo_str), int(hi_str)
            except ValueError as e:
                raise ToolInputError(
                    "PDF_RANGES_INVALID",
                    f"範圍「{part}」無效",
                ) from e
            if lo < 1 or hi < lo:
                raise ToolInputError(
                    "PDF_RANGES_INVALID",
                    f"範圍「{part}」無效(需要 起始 ≤ 結束,且 ≥ 1)",
                )
            if hi > total_pages:
                raise ToolInputError(
                    "PDF_RANGES_OUT_OF_BOUNDS",
                    f"頁碼 {hi} 超出總頁數 {total_pages}",
                )
            for p in range(lo, hi + 1):
                if p not in seen:
                    seen.add(p)
                    result.append(p)
        else:
            try:
                p = int(part)
            except ValueError as e:
                raise ToolInputError(
                    "PDF_RANGES_INVALID",
                    f"「{part}」不是合法的頁碼",
                ) from e
            if p < 1 or p > total_pages:
                raise ToolInputError(
                    "PDF_RANGES_OUT_OF_BOUNDS",
                    f"頁碼 {p} 超出範圍 (1-{total_pages})",
                )
            if p not in seen:
                seen.add(p)
                result.append(p)

    if not result:
        raise ToolInputError("PDF_RANGES_EMPTY", "解析後沒有任何有效頁碼")
    return result


# ============================================================
# 1. 圖片合併 PDF  (原 merge_images_to_pdf 保留)
# ============================================================

def merge_images_to_pdf(
    image_bytes_list: List[bytes],
    *,
    page_size: Tuple[float, float] = None,
    margin: float = 36.0,
) -> bytes:
    """把多張圖片合併成一份 PDF,每張佔一頁 A4。"""
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


# ============================================================
# 2. PDF 合併 (多個 PDF → 一個 PDF)
# ============================================================

def merge_pdfs(pdf_bytes_list: List[bytes]) -> bytes:
    """
    按順序把多份 PDF 串接成一份,保留每份的全部頁面。

    Args:
        pdf_bytes_list: 原始 PDF bytes 列表,按輸入順序串接

    Returns:
        合併後的 PDF bytes
    """
    if not pdf_bytes_list:
        raise ToolInputError("PDF_NO_FILES", "至少需要一份 PDF")
    if len(pdf_bytes_list) > PDF_MERGE_MAX_FILES:
        raise FileTooLargeError(
            "PDF_TOO_MANY_FILES",
            f"單次最多合併 {PDF_MERGE_MAX_FILES} 份 PDF",
        )

    try:
        import fitz  # PyMuPDF
    except ImportError as e:
        raise ToolProcessingError("PDF_LIB_MISSING", f"缺少 PyMuPDF: {e}") from e

    merged = fitz.open()
    try:
        for idx, raw in enumerate(pdf_bytes_list):
            src = _open_pdf_or_raise(raw, name=f"第 {idx + 1} 份 PDF")
            try:
                merged.insert_pdf(src)
            finally:
                src.close()
        out = io.BytesIO()
        merged.save(out, garbage=3, deflate=True)
        return out.getvalue()
    except (ToolInputError, FileTooLargeError, UnsupportedFormatError, ToolProcessingError):
        raise
    except Exception as e:  # noqa: BLE001
        logger.exception("PDF merge failed: %s", e)
        raise ToolProcessingError("PDF_MERGE_FAILED", f"PDF 合併失敗:{e}") from e
    finally:
        merged.close()


# ============================================================
# 3. PDF 頁面提取 (Split → 提取指定頁面到新 PDF)
# ============================================================

def extract_pdf_pages(pdf_bytes: bytes, ranges_str: str) -> bytes:
    """
    從一份 PDF 提取指定頁面組成新 PDF。

    ranges_str 格式: "1-3,5,7-10" (1-based, 可混合單頁與範圍)
    """
    src = _open_pdf_or_raise(pdf_bytes)
    try:
        total = src.page_count
        pages_1based = parse_page_ranges(ranges_str, total)
        try:
            import fitz
        except ImportError as e:
            raise ToolProcessingError("PDF_LIB_MISSING", f"缺少 PyMuPDF: {e}") from e

        out_doc = fitz.open()
        try:
            for p in pages_1based:
                out_doc.insert_pdf(src, from_page=p - 1, to_page=p - 1)
            buf = io.BytesIO()
            out_doc.save(buf, garbage=3, deflate=True)
            return buf.getvalue()
        except (ToolInputError, UnsupportedFormatError, ToolProcessingError):
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("PDF extract failed: %s", e)
            raise ToolProcessingError("PDF_EXTRACT_FAILED", f"提取頁面失敗:{e}") from e
        finally:
            out_doc.close()
    finally:
        src.close()


# ============================================================
# 4. PDF 壓縮 (重新採樣圖片降低檔案大小)
# ============================================================

def compress_pdf(pdf_bytes: bytes, level: str = PDF_COMPRESS_DEFAULT) -> bytes:
    """
    壓縮 PDF:對每頁內嵌的圖片做降採樣 + 重新用 JPEG 編碼。

    策略:
      high   → 200 dpi, JPEG quality 85
      medium → 120 dpi, JPEG quality 70
      low    →  72 dpi, JPEG quality 50
    """
    if level not in PDF_COMPRESS_LEVELS:
        raise ToolInputError(
            "PDF_COMPRESS_LEVEL_INVALID",
            f"level 必須為 {sorted(PDF_COMPRESS_LEVELS)}",
        )
    target_dpi, jpeg_quality = PDF_COMPRESS_PRESETS[level]

    src = _open_pdf_or_raise(pdf_bytes)
    try:
        try:
            import fitz
            from PIL import Image
        except ImportError as e:
            raise ToolProcessingError("PDF_LIB_MISSING", f"缺少依賴: {e}") from e

        try:
            for page_index in range(src.page_count):
                page = src[page_index]
                img_list = page.get_images(full=True)
                for img_info in img_list:
                    xref = img_info[0]
                    try:
                        pix = fitz.Pixmap(src, xref)
                    except Exception:
                        continue

                    if pix.n >= 5:  # CMYK → RGB
                        pix = fitz.Pixmap(fitz.csRGB, pix)

                    try:
                        mode = "RGBA" if pix.alpha else "RGB"
                        img = Image.frombytes(mode, (pix.width, pix.height), pix.samples)
                    except Exception:
                        pix = None
                        continue
                    pix = None

                    page_rect = page.rect
                    page_w_in = page_rect.width / 72.0
                    page_h_in = page_rect.height / 72.0
                    max_w_px = max(1, int(page_w_in * target_dpi))
                    max_h_px = max(1, int(page_h_in * target_dpi))

                    iw, ih = img.size
                    if iw > max_w_px or ih > max_h_px:
                        ratio = min(max_w_px / iw, max_h_px / ih, 1.0)
                        new_size = (max(1, int(iw * ratio)), max(1, int(ih * ratio)))
                        img = img.resize(new_size, Image.LANCZOS)

                    if img.mode in ("RGBA", "LA", "P"):
                        bg = Image.new("RGB", img.size, (255, 255, 255))
                        if "A" in img.getbands():
                            alpha = img.split()[-1]
                            bg.paste(img.convert("RGB"), mask=alpha)
                        else:
                            bg.paste(img.convert("RGB"))
                        img = bg

                    buf = io.BytesIO()
                    img.save(buf, format="JPEG", quality=jpeg_quality, optimize=True)
                    new_bytes = buf.getvalue()

                    try:
                        src.update_stream(xref, new_bytes)
                    except Exception:
                        continue  # 某些 xref (mask) 無法 update

            out = io.BytesIO()
            src.save(out, garbage=4, deflate=True, clean=True)
            return out.getvalue()
        except (ToolInputError, UnsupportedFormatError, ToolProcessingError):
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("PDF compress failed: %s", e)
            raise ToolProcessingError("PDF_COMPRESS_FAILED", f"PDF 壓縮失敗:{e}") from e
    finally:
        src.close()


# ============================================================
# 5. PDF 浮水印 (每頁加文字浮水印)
# ============================================================

def watermark_pdf(
    pdf_bytes: bytes,
    *,
    text: str,
    opacity: float = 0.3,
    angle: int = 45,
    font_size: int = 48,
) -> bytes:
    """每一頁加一個置中的文字浮水印。"""
    if not text or not text.strip():
        raise ToolInputError("PDF_WM_EMPTY", "浮水印文字不能為空")
    if len(text) > PDF_WATERMARK_MAX_TEXT_LEN:
        raise ToolInputError(
            "PDF_WM_TOO_LONG",
            f"浮水印文字最多 {PDF_WATERMARK_MAX_TEXT_LEN} 字",
        )
    if not (0.05 <= opacity <= 1.0):
        raise ToolInputError("PDF_WM_OPACITY", "opacity 必須在 0.05 - 1.0 之間")
    if angle not in PDF_WATERMARK_ANGLE_CHOICES:
        raise ToolInputError(
            "PDF_WM_ANGLE",
            f"angle 必須為 {sorted(PDF_WATERMARK_ANGLE_CHOICES)}",
        )
    if not (8 <= font_size <= 200):
        raise ToolInputError("PDF_WM_FONT_SIZE", "font_size 必須在 8 - 200 之間")

    src = _open_pdf_or_raise(pdf_bytes)
    try:
        try:
            import fitz
        except ImportError as e:
            raise ToolProcessingError("PDF_LIB_MISSING", f"缺少 PyMuPDF: {e}") from e

        try:
            # 優先 china-s (Simplified Chinese built-in CJK font),失敗退回 helv
            primary_font = "china-s"

            def _do_insert(page, text, cx, cy, opacity, font_size, angle, fontname):
                if angle in (0, 90):
                    box_w = page.rect.width * 0.9
                    box_h = font_size * 2
                    rect = fitz.Rect(
                        cx - box_w / 2, cy - box_h / 2,
                        cx + box_w / 2, cy + box_h / 2,
                    )
                    page.insert_textbox(
                        rect, text,
                        fontsize=font_size,
                        fontname=fontname,
                        color=(0.5, 0.5, 0.5),
                        align=1,
                        rotate=angle,
                        fill_opacity=opacity,
                        stroke_opacity=opacity,
                    )
                else:
                    # 45° / -45°: insert_text + morph 旋轉
                    text_w = font_size * len(text) * 0.55
                    point = fitz.Point(cx - text_w / 2, cy + font_size / 3)
                    pivot = fitz.Point(cx, cy)
                    morph = (pivot, fitz.Matrix(1, 1).prerotate(-angle))
                    page.insert_text(
                        point, text,
                        fontsize=font_size,
                        fontname=fontname,
                        color=(0.5, 0.5, 0.5),
                        morph=morph,
                        fill_opacity=opacity,
                        stroke_opacity=opacity,
                    )

            for page in src:
                pw, ph = page.rect.width, page.rect.height
                cx, cy = pw / 2, ph / 2
                try:
                    _do_insert(page, text, cx, cy, opacity, font_size, angle, primary_font)
                except Exception:
                    try:
                        _do_insert(page, text, cx, cy, opacity, font_size, angle, "helv")
                    except Exception as e:  # noqa: BLE001
                        logger.warning("insert watermark on a page failed: %s", e)
                        continue

            out = io.BytesIO()
            src.save(out, garbage=3, deflate=True)
            return out.getvalue()
        except (ToolInputError, UnsupportedFormatError, ToolProcessingError):
            raise
        except Exception as e:  # noqa: BLE001
            logger.exception("PDF watermark failed: %s", e)
            raise ToolProcessingError("PDF_WATERMARK_FAILED", f"加浮水印失敗:{e}") from e
    finally:
        src.close()
