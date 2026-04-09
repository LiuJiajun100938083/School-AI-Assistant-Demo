"""
實用工具 — API Router (薄層)
===============================
每個 handler ≤ 20 行,只做 multipart parse、呼 service、回 StreamingResponse。
零 try/except (由全域錯誤中介統一處理 AppException 子類)。
"""

import io
import logging
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user
from app.core.exceptions import AuthorizationError
from app.domains.tools.constants import (
    ALLOWED_IMAGE_MIMES,
    PDF_MAX_IMAGES,
    PDF_PER_FILE_MAX_SIZE,
)
from app.domains.tools.exceptions import (
    FileTooLargeError,
    ToolInputError,
    UnsupportedFormatError,
)
from app.domains.tools.pdf_merge_service import merge_images_to_pdf
from app.domains.tools.qrcode_service import generate_qrcode_png
from app.domains.tools.roll_call_service import (
    group_by_count,
    group_by_size,
    pick_random_students,
)
from app.domains.tools.schemas import (
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
