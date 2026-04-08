"""
實用工具 — API Router (薄層)
===============================
每個 handler ≤ 20 行,只做 multipart parse、呼 service、回 StreamingResponse。
零 try/except (由全域錯誤中介統一處理 AppException 子類)。
"""

import io
import logging
from typing import Dict, List

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user
from app.domains.tools.constants import (
    ALLOWED_IMAGE_MIMES,
    PDF_MAX_IMAGES,
    PDF_PER_FILE_MAX_SIZE,
)
from app.domains.tools.exceptions import (
    FileTooLargeError,
    UnsupportedFormatError,
)
from app.domains.tools.pdf_merge_service import merge_images_to_pdf
from app.domains.tools.qrcode_service import generate_qrcode_png
from app.domains.tools.schemas import QrRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["實用工具"])


# ============================================================
# QR 碼
# ============================================================

@router.post("/qrcode")
async def qrcode_endpoint(req: QrRequest, user: Dict = Depends(get_current_user)):
    png = generate_qrcode_png(
        req.text,
        size=req.size,
        error_correction=req.error_correction,
        border=req.border,
    )
    return StreamingResponse(
        io.BytesIO(png),
        media_type="image/png",
        headers={"Content-Disposition": 'attachment; filename="qrcode.png"'},
    )


# ============================================================
# 多圖合併 PDF
# ============================================================

@router.post("/images-to-pdf")
async def images_to_pdf_endpoint(
    files: List[UploadFile] = File(...),
    user: Dict = Depends(get_current_user),
):
    if not files:
        raise FileTooLargeError("PDF_NO_FILES", "請至少選擇一張圖片")
    if len(files) > PDF_MAX_IMAGES:
        raise FileTooLargeError(
            "PDF_TOO_MANY_FILES",
            f"單次最多合併 {PDF_MAX_IMAGES} 張",
        )

    raws: List[bytes] = []
    for f in files:
        mime = (f.content_type or "").lower()
        if mime not in ALLOWED_IMAGE_MIMES:
            raise UnsupportedFormatError(
                "UNSUPPORTED_MIME",
                f"不支援的格式: {mime or 'unknown'}",
            )
        data = await f.read()
        if len(data) > PDF_PER_FILE_MAX_SIZE:
            raise FileTooLargeError(
                "FILE_TOO_LARGE",
                f"單檔不得超過 {PDF_PER_FILE_MAX_SIZE // (1024*1024)} MB",
            )
        raws.append(data)

    pdf = merge_images_to_pdf(raws)
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="merged.pdf"'},
    )
