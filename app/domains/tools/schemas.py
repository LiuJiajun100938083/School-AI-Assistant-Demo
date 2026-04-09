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
