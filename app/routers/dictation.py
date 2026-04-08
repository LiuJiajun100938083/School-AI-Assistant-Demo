#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
英文默書路由
=============
老師端: 建立、更新、發布、關閉、刪除、查看提交、重新 OCR、覆核
學生端: 查看列表、拍照上傳、查看批改結果

Router 只做:
  1. 接收參數 / schema 驗證
  2. 呼叫 service
  3. 包裝 success_response

業務邏輯一律在 DictationService。
"""

import asyncio
import logging
from pathlib import Path
from typing import Tuple

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile
from fastapi.responses import FileResponse

from app.core.dependencies import get_current_user, require_teacher
from app.core.exceptions import NotFoundError
from app.core.responses import error_response, success_response
from app.domains.dictation.schemas import (
    CreateDictationRequest,
    OverrideSubmissionRequest,
    UpdateDictationRequest,
)
from app.services.container import get_services

logger = logging.getLogger(__name__)
router = APIRouter(tags=["英文默書"])


# ================================================================
# 老師端
# ================================================================

@router.post("/api/dictation/teacher")
async def create_dictation(
    request: CreateDictationRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """建立默書草稿"""
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0
    teacher_name = user.get("display_name", username) if user else username

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.dictation.create_dictation(
            teacher_id=teacher_id,
            teacher_name=teacher_name,
            title=request.title,
            reference_text=request.reference_text,
            description=request.description or "",
            target_type=request.target_type,
            target_value=request.target_value or "",
            deadline=request.deadline,
            allow_late=request.allow_late,
        ),
    )
    return success_response(data=result, message="默書創建成功")


@router.get("/api/dictation/teacher/targets")
async def get_targets(
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """回傳可佈置的班級與學生清單 (給建立 modal 的 class picker 用)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, lambda: services.dictation.get_available_targets(),
    )
    return success_response(data=data)


@router.post("/api/dictation/teacher/extract-text")
async def extract_reference_text(
    file: UploadFile = File(...),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """從上傳的文件 (txt/md/pdf/docx/pptx) 或圖片 (jpg/png) 抽取純文字"""
    services = get_services()
    data = await services.dictation.extract_reference_text(file)
    return success_response(data=data, message="已抽取")


@router.get("/api/dictation/teacher")
async def list_teacher_dictations(
    status: str = Query("", description="draft | published | closed"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.list_teacher_dictations(
            teacher_id=teacher_id, status=status,
            page=page, page_size=page_size,
        ),
    )
    return success_response(data=data)


@router.get("/api/dictation/teacher/{dictation_id}")
async def get_teacher_dictation(
    dictation_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    services = get_services()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None, lambda: services.dictation.get_dictation_detail(dictation_id),
    )
    return success_response(data=data)


@router.put("/api/dictation/teacher/{dictation_id}")
async def update_dictation(
    dictation_id: int,
    request: UpdateDictationRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.update_dictation(
            dictation_id, teacher_id, request.dict(exclude_unset=True),
        ),
    )
    return success_response(data=data, message="已更新")


@router.post("/api/dictation/teacher/{dictation_id}/publish")
async def publish_dictation(
    dictation_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.publish_dictation(dictation_id, teacher_id),
    )
    return success_response(data=data, message="已發布")


@router.post("/api/dictation/teacher/{dictation_id}/close")
async def close_dictation(
    dictation_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.close_dictation(dictation_id, teacher_id),
    )
    return success_response(data=data, message="已關閉")


@router.delete("/api/dictation/teacher/{dictation_id}")
async def delete_dictation(
    dictation_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: services.dictation.delete_dictation(dictation_id, teacher_id),
    )
    return success_response(message="已刪除")


@router.get("/api/dictation/teacher/{dictation_id}/submissions")
async def list_submissions(
    dictation_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.list_submissions(dictation_id, teacher_id),
    )
    return success_response(data=data)


@router.get("/api/dictation/teacher/submissions/{submission_id}")
async def get_submission_teacher(
    submission_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    services = get_services()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.get_submission_detail(
            submission_id, viewer_is_student=False,
        ),
    )
    return success_response(data=data)


@router.post("/api/dictation/teacher/submissions/{submission_id}/override")
async def override_submission(
    submission_id: int,
    request: OverrideSubmissionRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.override_submission(
            submission_id, teacher_id, request.dict(exclude_unset=True),
        ),
    )
    return success_response(data=data, message="已更新")


@router.post("/api/dictation/teacher/submissions/{submission_id}/re-ocr")
async def reprocess_submission(
    submission_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    data = await services.dictation.reprocess_submission(submission_id, teacher_id)
    return success_response(data=data, message="重新辨識中")


# ================================================================
# 學生端
# ================================================================

@router.get("/api/dictation")
async def list_student_dictations(
    current_user: dict = Depends(get_current_user),
):
    services = get_services()
    user = services.user.get_user(current_user["username"])
    if not user:
        return error_response("NOT_FOUND", "用戶不存在", status_code=404)

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.list_student_dictations(
            student_id=user["id"],
            student_class=user.get("class_name", "") or "",
            student_username=user.get("username", ""),
        ),
    )
    return success_response(data=data)


@router.get("/api/dictation/{dictation_id}")
async def get_student_dictation(
    dictation_id: int,
    current_user: dict = Depends(get_current_user),
):
    """學生端:查看默書詳情 (不含原文,避免洩題)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.get_dictation_detail(
            dictation_id, include_reference=False,
        ),
    )
    # 帶上該生的提交記錄 (若有)
    user = services.user.get_user(current_user["username"])
    if user:
        sub = services.dictation._sub_repo.find_by_dictation_student(  # noqa: SLF001
            dictation_id, user["id"],
        )
        if sub:
            data["my_submission_id"] = sub["id"]
    return success_response(data=data)


@router.post("/api/dictation/{dictation_id}/submit")
async def submit_dictation(
    dictation_id: int,
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(get_current_user),
):
    services = get_services()
    user = services.user.get_user(current_user["username"])
    if not user:
        return error_response("NOT_FOUND", "用戶不存在", status_code=404)

    data = await services.dictation.submit_dictation(
        dictation_id=dictation_id,
        student=user,
        files=files,
    )
    return success_response(data=data, message="已提交,正在辨識...")


@router.get("/api/dictation/submissions/me/{submission_id}")
async def get_my_submission(
    submission_id: int,
    current_user: dict = Depends(get_current_user),
):
    services = get_services()
    user = services.user.get_user(current_user["username"])
    if not user:
        return error_response("NOT_FOUND", "用戶不存在", status_code=404)

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: services.dictation.get_submission_detail(
            submission_id, viewer_is_student=True, reveal_reference=True,
        ),
    )
    # 驗證歸屬
    if data.get("student_id") != user["id"]:
        return error_response("FORBIDDEN", "無權查看", status_code=403)
    return success_response(data=data)


# ================================================================
# 圖片預覽 (師生共用)
# ================================================================

@router.get("/api/dictation/files/{file_id}/preview")
async def preview_file(
    file_id: int,
    current_user: dict = Depends(get_current_user),
):
    services = get_services()
    file_row = services.dictation._file_repo.find_by_id(file_id)  # noqa: SLF001
    if not file_row:
        raise NotFoundError("圖片", file_id)

    base_dir = Path(__file__).resolve().parent.parent.parent
    full_path = base_dir / file_row["file_path"]
    if not full_path.exists():
        raise NotFoundError("圖片檔案", file_id)

    return FileResponse(str(full_path))
