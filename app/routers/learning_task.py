#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
學習任務路由
============
提供學習任務的管理和用戶打卡 API 端點。

管理員端點 (/api/admin/learning-tasks):
    - CRUD 操作、發布、統計查看

用戶端點 (/api/learning-tasks):
    - 查看任務、打卡、進度查詢
"""

import asyncio
import logging
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Query, UploadFile
from pydantic import BaseModel, Field, field_validator

from app.core.dependencies import get_current_user, require_teacher_or_admin
from app.core.responses import error_response, paginated_response, success_response
from app.services.container import get_services

logger = logging.getLogger(__name__)
router = APIRouter()


# ================================================================
# 檔案上傳設定
# ================================================================

_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "learning_tasks"
_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

_MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 MB

# 允許的檔案類型：文檔、影片、圖片、PDF 等
_ALLOWED_MIME_PREFIXES = ("image/", "video/", "audio/")
_ALLOWED_MIMES = frozenset({
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
})


# ================================================================
# 請求模型
# ================================================================

def _normalize_url(raw: Optional[str]) -> Optional[str]:
    """
    自動補齊缺失的協議前綴。

    規則：
      - 空/None → 原樣返回
      - 已有 http://、https://、mailto:、tel: → 原樣
      - 以 // 開頭（協議相對）→ 補 https:
      - 以 / 開頭（站內路徑，例如 /uploads/...）→ 原樣
      - 其他（www.xxx.com / xxx.com）→ 補 https://
    """
    if not raw:
        return raw
    s = raw.strip()
    if not s:
        return s
    low = s.lower()
    if low.startswith(("http://", "https://", "mailto:", "tel:", "ftp://")):
        return s
    if s.startswith("//"):
        return "https:" + s
    if s.startswith("/"):
        return s
    return "https://" + s


class TaskItemInput(BaseModel):
    """任務子項輸入"""
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    link_url: Optional[str] = None
    link_label: Optional[str] = None
    tag: Optional[str] = None  # video, doc, cert, practice, website

    @field_validator("link_url", mode="before")
    @classmethod
    def _fix_link_url(cls, v):
        return _normalize_url(v) if isinstance(v, str) else v


class CreateTaskRequest(BaseModel):
    """創建任務請求"""
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    content: str = ""
    category: str = "general"
    priority: int = Field(default=1, ge=1, le=3)
    deadline: Optional[str] = None
    items: List[TaskItemInput] = []


class UpdateTaskRequest(BaseModel):
    """更新任務請求"""
    title: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[int] = Field(default=None, ge=1, le=3)
    deadline: Optional[str] = None
    items: Optional[List[TaskItemInput]] = None


class PublishTaskRequest(BaseModel):
    """發布任務請求"""
    target_type: str = Field(
        ...,
        description="目標類型: all, all_teachers, all_students, teacher, student, class",
    )
    target_value: Optional[str] = None


# ================================================================
# 管理員端點
# ================================================================

@router.post("/api/admin/learning-tasks")
async def create_task(
    request: CreateTaskRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建學習任務 (草稿)"""
    admin_username, _ = admin_info
    service = get_services().learning_task

    loop = asyncio.get_event_loop()
    task = await loop.run_in_executor(
        None,
        lambda: service.create_task(
            admin=admin_username,
            title=request.title,
            description=request.description,
            content=request.content,
            category=request.category,
            priority=request.priority,
            deadline=request.deadline,
            items=[item.dict() for item in request.items],
        ),
    )
    return success_response(data=task, message="任務創建成功")


@router.put("/api/admin/learning-tasks/{task_id}")
async def update_task(
    task_id: int,
    request: UpdateTaskRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新草稿任務"""
    admin_username, _ = admin_info
    service = get_services().learning_task

    fields = request.dict(exclude_unset=True)
    if "items" in fields and fields["items"] is not None:
        fields["items"] = [item.dict() for item in request.items]

    loop = asyncio.get_event_loop()
    task = await loop.run_in_executor(
        None,
        lambda: service.update_task(task_id, admin=admin_username, **fields),
    )
    return success_response(data=task, message="任務更新成功")


@router.delete("/api/admin/learning-tasks/{task_id}")
async def archive_task(
    task_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """歸檔任務 (軟刪除)"""
    admin_username, _ = admin_info
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: service.archive_task(task_id, admin=admin_username),
    )
    return success_response(message="任務已歸檔")


@router.post("/api/admin/learning-tasks/{task_id}/publish")
async def publish_task(
    task_id: int,
    request: PublishTaskRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """發布任務到目標受眾"""
    admin_username, _ = admin_info
    service = get_services().learning_task

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.publish_task(
            task_id=task_id,
            admin=admin_username,
            target_type=request.target_type,
            target_value=request.target_value,
        ),
    )
    return success_response(
        data=result,
        message=f"任務已發布給 {result['recipient_count']} 人",
    )


@router.get("/api/admin/learning-tasks")
async def list_admin_tasks(
    status: str = Query("", description="按狀態過濾: draft, published, archived"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """列出管理員的任務"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.list_admin_tasks(status=status, page=page, page_size=page_size),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.post("/api/admin/learning-tasks/upload")
async def upload_task_file(
    file: UploadFile = File(...),
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """上傳學習任務附件（文檔/影片/圖片等），返回可直接填入 link_url 的 URL"""
    mime = file.content_type or ""

    # 校驗類型
    mime_allowed = mime in _ALLOWED_MIMES or any(
        mime.startswith(prefix) for prefix in _ALLOWED_MIME_PREFIXES
    )
    if not mime_allowed:
        return error_response(
            "INVALID_FILE_TYPE",
            f"不支援的檔案類型：{mime or '未知'}",
            status_code=400,
        )

    # 讀取並校驗大小
    content = await file.read()
    size = len(content)
    if size > _MAX_FILE_SIZE:
        return error_response(
            "FILE_TOO_LARGE",
            f"檔案大小超過限制（{_MAX_FILE_SIZE // (1024*1024)} MB）",
            status_code=400,
        )
    if size == 0:
        return error_response("EMPTY_FILE", "檔案為空", status_code=400)

    # 儲存
    ext = Path(file.filename or "").suffix.lower()
    if len(ext) > 10:  # 防超長副檔名
        ext = ""
    filename = f"{uuid.uuid4().hex}{ext}"
    file_path = _UPLOAD_DIR / filename

    try:
        file_path.write_bytes(content)
    except OSError as e:
        logger.error("學習任務檔案寫入失敗: %s", e)
        return error_response("UPLOAD_FAILED", "檔案寫入失敗", status_code=500)

    return success_response(
        data={
            "url": f"/uploads/learning_tasks/{filename}",
            "filename": filename,
            "original_name": file.filename or filename,
            "size": size,
            "mime": mime,
        },
        message="上傳成功",
    )


@router.get("/api/admin/learning-tasks/targets")
async def get_targets(
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """獲取可選的發布目標 (班級、教師、學生列表)"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    targets = await loop.run_in_executor(None, service.get_available_targets)
    return success_response(data=targets)


@router.get("/api/admin/learning-tasks/{task_id}")
async def get_admin_task_detail(
    task_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """獲取任務詳情 (管理員視角)"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    task = await loop.run_in_executor(
        None, service.get_task_detail_admin, task_id,
    )
    return success_response(data=task)


@router.get("/api/admin/learning-tasks/{task_id}/stats")
async def get_task_stats(
    task_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """獲取任務完成統計"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    stats = await loop.run_in_executor(
        None, service.get_task_stats, task_id,
    )
    return success_response(data=stats)


# ================================================================
# 用戶端點
# ================================================================

@router.get("/api/learning-tasks")
async def get_my_tasks(
    status: str = Query("", description="完成狀態: pending, completed, 空=全部"),
    current_user: dict = Depends(get_current_user),
):
    """獲取我的學習任務列表"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    tasks = await loop.run_in_executor(
        None,
        lambda: service.get_my_tasks(
            username=current_user["username"],
            role=current_user["role"],
            class_name=current_user.get("class_name", ""),
            status_filter=status,
        ),
    )
    return success_response(data=tasks)


@router.get("/api/learning-tasks/progress")
async def get_my_progress(
    current_user: dict = Depends(get_current_user),
):
    """獲取我的總體學習進度"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    progress = await loop.run_in_executor(
        None,
        lambda: service.get_my_progress(
            username=current_user["username"],
            role=current_user["role"],
            class_name=current_user.get("class_name", ""),
        ),
    )
    return success_response(data=progress)


@router.get("/api/learning-tasks/{task_id}")
async def get_task_detail(
    task_id: int,
    current_user: dict = Depends(get_current_user),
):
    """獲取任務詳情 (含我的打卡狀態)"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    detail = await loop.run_in_executor(
        None,
        lambda: service.get_task_detail(
            task_id=task_id,
            username=current_user["username"],
            role=current_user["role"],
            class_name=current_user.get("class_name", ""),
        ),
    )
    return success_response(data=detail)


@router.put("/api/learning-tasks/{task_id}/items/{item_id}/toggle")
async def toggle_item_completion(
    task_id: int,
    item_id: int,
    current_user: dict = Depends(get_current_user),
):
    """打卡/取消打卡某個子項"""
    service = get_services().learning_task
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.toggle_item_completion(
            task_id=task_id,
            username=current_user["username"],
            item_id=item_id,
        ),
    )
    return success_response(data=result)
