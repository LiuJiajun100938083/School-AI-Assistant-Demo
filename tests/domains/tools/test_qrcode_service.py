"""qrcode_service 單元測試 — 純函式 bytes→bytes 測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.tools.qrcode_service import generate_qrcode_png
from app.domains.tools.exceptions import ToolInputError


PNG_MAGIC = b"\x89PNG\r\n\x1a\n"


class TestGenerateQrcodePng:
    def test_basic_text_returns_png(self):
        out = generate_qrcode_png("hello", size=256)
        assert isinstance(out, bytes)
        assert out.startswith(PNG_MAGIC)
        assert len(out) > 200

    def test_url(self):
        out = generate_qrcode_png("https://example.com/foo?bar=1", size=256)
        assert out.startswith(PNG_MAGIC)

    def test_chinese(self):
        out = generate_qrcode_png("你好世界", size=256)
        assert out.startswith(PNG_MAGIC)

    def test_empty_raises(self):
        with pytest.raises(ToolInputError):
            generate_qrcode_png("", size=256)

    def test_whitespace_only_raises(self):
        with pytest.raises(ToolInputError):
            generate_qrcode_png("   ", size=256)

    def test_too_long_raises(self):
        with pytest.raises(ToolInputError):
            generate_qrcode_png("x" * 5000, size=256)

    def test_size_param_affects_output(self):
        small = generate_qrcode_png("abc", size=128)
        big = generate_qrcode_png("abc", size=512)
        # 越大的 size,PNG 檔案越大
        assert len(big) > len(small)

    @pytest.mark.parametrize("ec", ["L", "M", "Q", "H"])
    def test_error_correction_levels(self, ec):
        out = generate_qrcode_png("abc", size=256, error_correction=ec)
        assert out.startswith(PNG_MAGIC)

    def test_invalid_ec_raises(self):
        with pytest.raises(ToolInputError):
            generate_qrcode_png("abc", size=256, error_correction="Z")
