"""pdf_tools_service 單元測試 — 覆蓋 5 個公開函式 + parse_page_ranges helper"""

import io
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

pytest.importorskip("PIL")
pytest.importorskip("fitz")  # PyMuPDF

from PIL import Image
import fitz  # PyMuPDF

from app.domains.tools.pdf_tools_service import (
    compress_pdf,
    extract_pdf_pages,
    merge_pdfs,
    parse_page_ranges,
    watermark_pdf,
)
from app.domains.tools.exceptions import (
    FileTooLargeError,
    ToolInputError,
    ToolProcessingError,
    UnsupportedFormatError,
)

# merge_images_to_pdf 依賴 reportlab,本地 venv 無,用 importorskip
try:
    import reportlab  # noqa: F401
    _HAS_REPORTLAB = True
except ImportError:
    _HAS_REPORTLAB = False


# ============================================================
# Helper builders
# ============================================================

def _png_bytes(w=100, h=80, color=(200, 100, 50)) -> bytes:
    img = Image.new("RGB", (w, h), color)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes(w=100, h=80) -> bytes:
    img = Image.new("RGB", (w, h), (50, 100, 200))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _make_pdf(num_pages: int, *, label_prefix: str = "Page") -> bytes:
    """用 PyMuPDF 直接造一份 N 頁 PDF (不需要 reportlab)"""
    doc = fitz.open()
    for i in range(num_pages):
        page = doc.new_page(width=595, height=842)  # A4
        page.insert_text((50, 50), f"{label_prefix} {i + 1}", fontsize=20)
    buf = io.BytesIO()
    doc.save(buf)
    doc.close()
    return buf.getvalue()


def _count_pdf_pages(pdf_bytes: bytes) -> int:
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    try:
        return doc.page_count
    finally:
        doc.close()


# ============================================================
# 1. merge_images_to_pdf (legacy, reportlab 依賴)
# ============================================================

@pytest.mark.skipif(not _HAS_REPORTLAB, reason="reportlab not installed")
class TestMergeImagesToPdf:
    def test_single_png(self):
        from app.domains.tools.pdf_tools_service import merge_images_to_pdf
        out = merge_images_to_pdf([_png_bytes()])
        assert out.startswith(b"%PDF-")

    def test_multiple_mixed(self):
        from app.domains.tools.pdf_tools_service import merge_images_to_pdf
        raws = [_png_bytes(100, 80), _png_bytes(200, 150), _jpeg_bytes(300, 200)]
        out = merge_images_to_pdf(raws)
        assert out.startswith(b"%PDF-")
        assert _count_pdf_pages(out) == 3

    def test_empty_raises(self):
        from app.domains.tools.pdf_tools_service import merge_images_to_pdf
        with pytest.raises(ToolInputError):
            merge_images_to_pdf([])

    def test_invalid_bytes_raises(self):
        from app.domains.tools.pdf_tools_service import merge_images_to_pdf
        with pytest.raises(UnsupportedFormatError):
            merge_images_to_pdf([b"not an image"])

    def test_rgba_with_alpha_handled(self):
        from app.domains.tools.pdf_tools_service import merge_images_to_pdf
        img = Image.new("RGBA", (100, 100), (255, 0, 0, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        out = merge_images_to_pdf([buf.getvalue()])
        assert out.startswith(b"%PDF-")


# ============================================================
# 2. parse_page_ranges — 頁面範圍解析
# ============================================================

class TestParsePageRanges:
    def test_single_page(self):
        assert parse_page_ranges("5", 10) == [5]

    def test_range(self):
        assert parse_page_ranges("1-3", 10) == [1, 2, 3]

    def test_comma_separated(self):
        assert parse_page_ranges("1,3,5", 10) == [1, 3, 5]

    def test_mixed(self):
        assert parse_page_ranges("1-3,5,7-10", 10) == [1, 2, 3, 5, 7, 8, 9, 10]

    def test_whitespace_ignored(self):
        assert parse_page_ranges(" 1 - 3 , 5 ", 10) == [1, 2, 3, 5]

    def test_dedupe_preserves_first_order(self):
        assert parse_page_ranges("1,1,2-3,3", 10) == [1, 2, 3]

    def test_empty_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("", 10)

    def test_whitespace_only_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("   ", 10)

    def test_invalid_chars_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("abc", 10)

    def test_reverse_range_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("5-3", 10)

    def test_out_of_bounds_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("1-20", 10)

    def test_zero_raises(self):
        with pytest.raises(ToolInputError):
            parse_page_ranges("0", 10)


# ============================================================
# 3. merge_pdfs — PDF 合併
# ============================================================

class TestMergePdfs:
    def test_merge_two(self):
        a = _make_pdf(3)
        b = _make_pdf(2)
        out = merge_pdfs([a, b])
        assert out.startswith(b"%PDF-")
        assert _count_pdf_pages(out) == 5

    def test_merge_three(self):
        out = merge_pdfs([_make_pdf(1), _make_pdf(2), _make_pdf(3)])
        assert _count_pdf_pages(out) == 6

    def test_single_pdf_passes_through(self):
        src = _make_pdf(4)
        out = merge_pdfs([src])
        assert _count_pdf_pages(out) == 4

    def test_empty_list_raises(self):
        with pytest.raises(ToolInputError):
            merge_pdfs([])

    def test_invalid_pdf_raises(self):
        with pytest.raises(UnsupportedFormatError):
            merge_pdfs([b"not a pdf"])

    def test_too_many_files_raises(self):
        # 超過 PDF_MERGE_MAX_FILES (20)
        many = [_make_pdf(1) for _ in range(21)]
        with pytest.raises(FileTooLargeError):
            merge_pdfs(many)


# ============================================================
# 4. extract_pdf_pages — 頁面提取
# ============================================================

class TestExtractPdfPages:
    def test_single_page(self):
        src = _make_pdf(5)
        out = extract_pdf_pages(src, "2")
        assert _count_pdf_pages(out) == 1

    def test_range(self):
        src = _make_pdf(5)
        out = extract_pdf_pages(src, "2-4")
        assert _count_pdf_pages(out) == 3

    def test_mixed(self):
        src = _make_pdf(10)
        out = extract_pdf_pages(src, "1-3,5,7-8")
        assert _count_pdf_pages(out) == 6

    def test_all_pages(self):
        src = _make_pdf(3)
        out = extract_pdf_pages(src, "1-3")
        assert _count_pdf_pages(out) == 3

    def test_out_of_bounds_raises(self):
        src = _make_pdf(5)
        with pytest.raises(ToolInputError):
            extract_pdf_pages(src, "1-10")

    def test_invalid_pdf_raises(self):
        with pytest.raises(UnsupportedFormatError):
            extract_pdf_pages(b"garbage", "1")

    def test_empty_ranges_raises(self):
        src = _make_pdf(5)
        with pytest.raises(ToolInputError):
            extract_pdf_pages(src, "")


# ============================================================
# 5. compress_pdf — PDF 壓縮
# ============================================================

class TestCompressPdf:
    def test_high_level(self):
        src = _make_pdf(3)
        out = compress_pdf(src, level="high")
        assert out.startswith(b"%PDF-")
        assert _count_pdf_pages(out) == 3

    def test_medium_level(self):
        src = _make_pdf(3)
        out = compress_pdf(src, level="medium")
        assert out.startswith(b"%PDF-")

    def test_low_level(self):
        src = _make_pdf(3)
        out = compress_pdf(src, level="low")
        assert out.startswith(b"%PDF-")

    def test_default_level(self):
        src = _make_pdf(2)
        out = compress_pdf(src)  # 默認 medium
        assert out.startswith(b"%PDF-")

    def test_invalid_level_raises(self):
        src = _make_pdf(2)
        with pytest.raises(ToolInputError):
            compress_pdf(src, level="ultra")

    def test_invalid_pdf_raises(self):
        with pytest.raises(UnsupportedFormatError):
            compress_pdf(b"nope", level="medium")


# ============================================================
# 6. watermark_pdf — PDF 浮水印
# ============================================================

class TestWatermarkPdf:
    def test_basic_english(self):
        src = _make_pdf(2)
        out = watermark_pdf(src, text="DRAFT", opacity=0.3, angle=45)
        assert out.startswith(b"%PDF-")
        assert _count_pdf_pages(out) == 2

    def test_chinese(self):
        src = _make_pdf(2)
        out = watermark_pdf(src, text="機密文件", opacity=0.3, angle=45)
        assert out.startswith(b"%PDF-")

    def test_angle_0(self):
        src = _make_pdf(1)
        out = watermark_pdf(src, text="T", angle=0, font_size=40)
        assert out.startswith(b"%PDF-")

    def test_angle_90(self):
        src = _make_pdf(1)
        out = watermark_pdf(src, text="T", angle=90, font_size=40)
        assert out.startswith(b"%PDF-")

    def test_angle_neg45(self):
        src = _make_pdf(1)
        out = watermark_pdf(src, text="T", angle=-45, font_size=40)
        assert out.startswith(b"%PDF-")

    def test_empty_text_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="")

    def test_whitespace_only_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="   ")

    def test_too_long_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="x" * 100)

    def test_invalid_opacity_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="T", opacity=1.5)

    def test_invalid_angle_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="T", angle=30)  # not in allowed set

    def test_invalid_font_size_raises(self):
        src = _make_pdf(1)
        with pytest.raises(ToolInputError):
            watermark_pdf(src, text="T", font_size=500)

    def test_invalid_pdf_raises(self):
        with pytest.raises(UnsupportedFormatError):
            watermark_pdf(b"bad", text="T")
