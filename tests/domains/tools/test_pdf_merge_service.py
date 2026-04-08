"""pdf_merge_service 單元測試"""

import io
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

pytest.importorskip("PIL")
pytest.importorskip("reportlab")

from PIL import Image

from app.domains.tools.pdf_merge_service import merge_images_to_pdf
from app.domains.tools.exceptions import ToolInputError, UnsupportedFormatError


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


class TestMergeImagesToPdf:
    def test_single_png(self):
        out = merge_images_to_pdf([_png_bytes()])
        assert out.startswith(b"%PDF-")

    def test_multiple_mixed(self):
        raws = [_png_bytes(100, 80), _png_bytes(200, 150), _jpeg_bytes(300, 200)]
        out = merge_images_to_pdf(raws)
        assert out.startswith(b"%PDF-")
        # 3 張圖 → 至少 3 次 showPage 標記(粗略估)
        assert out.count(b"/Page") >= 3

    def test_empty_raises(self):
        with pytest.raises(ToolInputError):
            merge_images_to_pdf([])

    def test_invalid_bytes_raises(self):
        with pytest.raises(UnsupportedFormatError):
            merge_images_to_pdf([b"not an image"])

    def test_rgba_with_alpha_handled(self):
        img = Image.new("RGBA", (100, 100), (255, 0, 0, 128))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        out = merge_images_to_pdf([buf.getvalue()])
        assert out.startswith(b"%PDF-")
