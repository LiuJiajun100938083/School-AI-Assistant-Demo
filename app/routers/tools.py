"""
實用工具 — API Router (薄層)
===============================
每個 handler ≤ 20 行,只做 multipart parse、呼 service、回 StreamingResponse。
零 try/except (由全域錯誤中介統一處理 AppException 子類)。
"""

import io
import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import ValidationError as _PydanticValidationError

from app.core.dependencies import get_current_user
from app.core.exceptions import AuthorizationError
from app.domains.tools.constants import (
    ALLOWED_IMAGE_CONVERT_INPUT_EXTS,
    ALLOWED_IMAGE_CONVERT_INPUT_MIMES,
    ALLOWED_IMAGE_MIMES,
    ALLOWED_PDF_MIMES,
    IMG_CONVERT_MAX_FILE_SIZE,
    PDF_COMPRESS_DEFAULT,
    PDF_COMPRESS_LEVELS,
    PDF_MAX_FILE_SIZE,
    PDF_MAX_IMAGES,
    PDF_MERGE_MAX_FILES,
    PDF_PER_FILE_MAX_SIZE,
    PDF_WATERMARK_ANGLE_CHOICES,
)
from app.domains.tools.exceptions import (
    FileTooLargeError,
    ToolInputError,
    UnsupportedFormatError,
)
from app.domains.tools.image_convert_service import convert_image
from app.domains.tools.pdf_tools_service import (
    compress_pdf,
    extract_pdf_pages,
    merge_images_to_pdf,
    merge_pdfs,
    watermark_pdf,
)
from app.domains.tools.qrcode_service import generate_qrcode_png
from app.domains.tools.roll_call_service import (
    group_by_count,
    group_by_size,
    pick_random_students,
)
from app.domains.tools.schemas import (
    ImageConvertRequest,
    PdfCompressRequest,
    PdfExtractRequest,
    PdfWatermarkRequest,
    QrRequest,
    RollCallGroupRequest,
    RollCallPickRequest,
)
from app.infrastructure.database import get_database_pool

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
# 圖片格式轉換 (HEIC 等瀏覽器無法解碼的格式走 server, 純記憶體不存檔)
# ============================================================

@router.post("/image/convert")
async def image_convert_endpoint(
    file: UploadFile = File(...),
    target_format: str = Form("png"),
    quality: int = Form(92),
    user: Dict = Depends(get_current_user),
):
    """Convert image to target format (HEIC/HEIF/BMP/TIFF → PNG/JPG/WebP)."""
    req = _validate_or_400(
        ImageConvertRequest, target_format=target_format, quality=quality,
    )

    # MIME + 副檔名雙重檢查 (HEIC 在 Chrome/Firefox 的 MIME 常為空)
    mime = (file.content_type or "").lower()
    ext = ""
    if file.filename and "." in file.filename:
        ext = ("." + file.filename.rsplit(".", 1)[-1]).lower()
    if mime not in ALLOWED_IMAGE_CONVERT_INPUT_MIMES and ext not in ALLOWED_IMAGE_CONVERT_INPUT_EXTS:
        raise UnsupportedFormatError(
            "UNSUPPORTED_MIME",
            f"不支援的圖片格式 (type: {mime or 'unknown'}, ext: {ext or 'unknown'})",
        )

    data = await file.read()
    if len(data) > IMG_CONVERT_MAX_FILE_SIZE:
        raise FileTooLargeError(
            "FILE_TOO_LARGE",
            f"圖片不得超過 {IMG_CONVERT_MAX_FILE_SIZE // (1024 * 1024)} MB",
        )

    out_bytes, out_mime = convert_image(
        data, target_format=req.target_format, quality=req.quality,
    )
    ext_map = {"image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
    out_ext = ext_map.get(out_mime, "png")
    base = (file.filename or "converted").rsplit(".", 1)[0]

    return StreamingResponse(
        io.BytesIO(out_bytes),
        media_type=out_mime,
        headers={"Content-Disposition": f'attachment; filename="{base}.{out_ext}"'},
    )


# ============================================================
# PDF 多功能工具 — 5 個端點 (images-to-pdf / merge / extract / compress / watermark)
# ============================================================

def _pdf_stream(pdf: bytes, filename: str) -> StreamingResponse:
    return StreamingResponse(
        io.BytesIO(pdf),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _validate_or_400(model_cls, **kwargs):
    """Inline Pydantic validation → 把 ValidationError 轉成 ToolInputError (400)"""
    try:
        return model_cls(**kwargs)
    except _PydanticValidationError as e:
        # 取第一個錯誤訊息組合出可讀訊息
        errs = e.errors()
        first = errs[0] if errs else {"msg": "參數錯誤"}
        field = ".".join(str(x) for x in first.get("loc", []))
        msg = first.get("msg", "參數錯誤")
        raise ToolInputError(
            "VALIDATION_FAILED",
            f"{field}: {msg}" if field else msg,
        ) from e


async def _read_pdf_files(
    files: List[UploadFile],
    *,
    max_count: int,
    require: str = "PDF",
) -> List[bytes]:
    """校驗 MIME + 單檔大小,讀取 bytes 並回傳 list"""
    if not files:
        raise ToolInputError("PDF_NO_FILES", f"請至少選擇一個 {require}")
    if len(files) > max_count:
        raise FileTooLargeError(
            "PDF_TOO_MANY_FILES",
            f"單次最多處理 {max_count} 個{require}",
        )
    raws: List[bytes] = []
    for f in files:
        mime = (f.content_type or "").lower()
        if mime not in ALLOWED_PDF_MIMES and not (f.filename or "").lower().endswith(".pdf"):
            raise UnsupportedFormatError(
                "UNSUPPORTED_MIME",
                f"「{f.filename}」不是 PDF (content-type: {mime or 'unknown'})",
            )
        data = await f.read()
        if len(data) > PDF_MAX_FILE_SIZE:
            raise FileTooLargeError(
                "FILE_TOO_LARGE",
                f"「{f.filename}」超過 {PDF_MAX_FILE_SIZE // (1024*1024)} MB 上限",
            )
        raws.append(data)
    return raws


@router.post("/pdf/images-to-pdf")
async def pdf_images_to_pdf_endpoint(
    files: List[UploadFile] = File(...),
    user: Dict = Depends(get_current_user),
):
    """多張圖片 → 一份 PDF (每張一頁 A4)"""
    if not files:
        raise ToolInputError("PDF_NO_IMAGES", "請至少選擇一張圖片")
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
    return _pdf_stream(pdf, "merged.pdf")


@router.post("/pdf/merge")
async def pdf_merge_endpoint(
    files: List[UploadFile] = File(...),
    user: Dict = Depends(get_current_user),
):
    """多份 PDF → 一份 PDF"""
    raws = await _read_pdf_files(files, max_count=PDF_MERGE_MAX_FILES)
    out = merge_pdfs(raws)
    return _pdf_stream(out, "merged.pdf")


@router.post("/pdf/extract")
async def pdf_extract_endpoint(
    file: UploadFile = File(...),
    ranges: str = Form(...),
    user: Dict = Depends(get_current_user),
):
    """從一份 PDF 提取指定頁面 (格式 "1-3,5,7-10")"""
    _validate_or_400(PdfExtractRequest, ranges=ranges)
    raws = await _read_pdf_files([file], max_count=1)
    out = extract_pdf_pages(raws[0], ranges)
    return _pdf_stream(out, "extracted.pdf")


@router.post("/pdf/compress")
async def pdf_compress_endpoint(
    file: UploadFile = File(...),
    level: str = Form(PDF_COMPRESS_DEFAULT),
    user: Dict = Depends(get_current_user),
):
    """壓縮 PDF (level: high/medium/low)"""
    _validate_or_400(PdfCompressRequest, level=level)
    raws = await _read_pdf_files([file], max_count=1)
    out = compress_pdf(raws[0], level=level)
    return _pdf_stream(out, "compressed.pdf")


@router.post("/pdf/watermark")
async def pdf_watermark_endpoint(
    file: UploadFile = File(...),
    text: str = Form(...),
    opacity: float = Form(0.3),
    angle: int = Form(45),
    font_size: int = Form(48),
    user: Dict = Depends(get_current_user),
):
    """加文字浮水印到每頁"""
    req = _validate_or_400(
        PdfWatermarkRequest,
        text=text, opacity=opacity, angle=angle, font_size=font_size,
    )
    raws = await _read_pdf_files([file], max_count=1)
    out = watermark_pdf(
        raws[0],
        text=req.text,
        opacity=req.opacity,
        angle=req.angle,
        font_size=req.font_size,
    )
    return _pdf_stream(out, "watermarked.pdf")


# Backward compat: 舊的 /images-to-pdf 保留 alias (曾經被前端直接呼叫)
@router.post("/images-to-pdf")
async def legacy_images_to_pdf_endpoint(
    files: List[UploadFile] = File(...),
    user: Dict = Depends(get_current_user),
):
    return await pdf_images_to_pdf_endpoint(files=files, user=user)


# ============================================================
# Roll Call (點名 / 隨機分組) — 僅限老師/管理員
# ============================================================

def _ensure_teacher(user: Dict[str, Any]) -> None:
    if user.get("role") not in ("teacher", "admin"):
        raise AuthorizationError("僅教師或管理員可使用點名工具")


def _load_students(class_name: str) -> List[Dict[str, Any]]:
    """查詢班級內所有活躍學生,含 id 供隨機操作使用。"""
    rows = get_database_pool().execute(
        "SELECT id, username, display_name, class_number "
        "FROM users "
        "WHERE role='student' AND is_active=TRUE AND class_name=%s "
        "ORDER BY class_number ASC, display_name ASC",
        (class_name,),
    ) or []
    return [
        {
            "id": r["id"],
            "username": r.get("username", ""),
            "display_name": r.get("display_name") or r.get("username", ""),
            "class_number": r.get("class_number"),
        }
        for r in rows
    ]


@router.get("/roll-call/classes")
async def roll_call_list_classes(user: Dict = Depends(get_current_user)):
    """列出所有有活躍學生的班級,供老師選擇。"""
    _ensure_teacher(user)
    rows = get_database_pool().execute(
        "SELECT DISTINCT class_name FROM users "
        "WHERE role='student' AND is_active=TRUE "
        "AND class_name IS NOT NULL AND class_name != '' "
        "ORDER BY class_name"
    ) or []
    return {
        "success": True,
        "data": [r["class_name"] for r in rows],
    }


@router.get("/roll-call/classes/{class_name}/students")
async def roll_call_list_students(
    class_name: str,
    user: Dict = Depends(get_current_user),
):
    """列出指定班級的學生,含 id / class_number / display_name。"""
    _ensure_teacher(user)
    students = _load_students(class_name)
    return {"success": True, "data": students}


@router.post("/roll-call/pick")
async def roll_call_pick(
    req: RollCallPickRequest,
    user: Dict = Depends(get_current_user),
):
    """隨機抽取 N 人。後端用 secrets.SystemRandom 做洗牌,公平不可預測。"""
    _ensure_teacher(user)
    students = _load_students(req.class_name)
    if not students:
        raise ToolInputError("ROLL_CALL_NO_STUDENTS", "該班級沒有活躍學生")
    picked = pick_random_students(
        students,
        n=req.n,
        exclude_ids=req.exclude_ids,
        allow_repeat=req.allow_repeat,
    )
    return {"success": True, "data": {"picked": picked}}


@router.post("/roll-call/group")
async def roll_call_group(
    req: RollCallGroupRequest,
    user: Dict = Depends(get_current_user),
):
    """隨機分組。mode='by_size' 則 value=每組人數;'by_count' 則 value=組數。"""
    _ensure_teacher(user)
    students = _load_students(req.class_name)
    if not students:
        raise ToolInputError("ROLL_CALL_NO_STUDENTS", "該班級沒有活躍學生")
    if req.mode == "by_size":
        groups = group_by_size(students, size=req.value)
    else:
        groups = group_by_count(students, count=req.value)
    return {"success": True, "data": {"groups": groups}}
