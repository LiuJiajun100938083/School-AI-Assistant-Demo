"""實用工具 — Pydantic Schemas"""

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.domains.tools.constants import (
    QR_EC_CHOICES,
    QR_EC_DEFAULT,
    QR_MAX_TEXT_LEN,
    QR_SIZE_DEFAULT,
    QR_SIZE_MAX,
    QR_SIZE_MIN,
)


class QrRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=QR_MAX_TEXT_LEN)
    size: int = Field(QR_SIZE_DEFAULT, ge=QR_SIZE_MIN, le=QR_SIZE_MAX)
    error_correction: str = Field(QR_EC_DEFAULT)
    border: int = Field(2, ge=0, le=10)

    @field_validator("error_correction")
    @classmethod
    def _ec_valid(cls, v: str) -> str:
        if v not in QR_EC_CHOICES:
            raise ValueError(f"error_correction must be one of {sorted(QR_EC_CHOICES)}")
        return v


# ============================================================
# PDF 多功能工具
# ============================================================

class PdfExtractRequest(BaseModel):
    """從 PDF 提取頁面 — 檔案本身透過 multipart 上傳,此 schema 只給其他參數"""
    ranges: str = Field(..., min_length=1, max_length=200)


class PdfCompressRequest(BaseModel):
    level: str = Field("medium")

    @field_validator("level")
    @classmethod
    def _level_valid(cls, v: str) -> str:
        from app.domains.tools.constants import PDF_COMPRESS_LEVELS
        if v not in PDF_COMPRESS_LEVELS:
            raise ValueError(f"level must be one of {sorted(PDF_COMPRESS_LEVELS)}")
        return v


class PdfWatermarkRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=80)
    opacity: float = Field(0.3, ge=0.05, le=1.0)
    angle: int = Field(45)
    font_size: int = Field(48, ge=8, le=200)

    @field_validator("angle")
    @classmethod
    def _angle_valid(cls, v: int) -> int:
        from app.domains.tools.constants import PDF_WATERMARK_ANGLE_CHOICES
        if v not in PDF_WATERMARK_ANGLE_CHOICES:
            raise ValueError(f"angle must be one of {sorted(PDF_WATERMARK_ANGLE_CHOICES)}")
        return v


# ============================================================
# Roll Call (點名 / 分組)
# ============================================================

# ============================================================
# 圖片格式轉換
# ============================================================

class ImageConvertRequest(BaseModel):
    target_format: str = Field("png")
    quality: int = Field(92, ge=10, le=100)

    @field_validator("target_format")
    @classmethod
    def _fmt_valid(cls, v: str) -> str:
        from app.domains.tools.constants import ALLOWED_IMAGE_CONVERT_OUTPUT
        v = v.lower().strip()
        if v == "jpg":
            v = "jpeg"
        if v not in ALLOWED_IMAGE_CONVERT_OUTPUT:
            raise ValueError(
                f"target_format must be one of {sorted(ALLOWED_IMAGE_CONVERT_OUTPUT)}"
            )
        return v


# ============================================================
# Roll Call (點名 / 分組)
# ============================================================

class RollCallPickRequest(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=50)
    n: int = Field(1, ge=1, le=200)
    exclude_ids: List[int] = Field(default_factory=list)
    allow_repeat: bool = False


class RollCallGroupRequest(BaseModel):
    class_name: str = Field(..., min_length=1, max_length=50)
    mode: str = Field(...)  # "by_size" | "by_count"
    value: int = Field(..., ge=1, le=200)

    @field_validator("mode")
    @classmethod
    def _mode_valid(cls, v: str) -> str:
        if v not in ("by_size", "by_count"):
            raise ValueError("mode must be 'by_size' or 'by_count'")
        return v
