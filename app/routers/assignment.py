#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理路由
============
提供作業佈置、學生提交、文件上傳、評分批改的 API 端點。

老師端點 (/api/assignments/teacher):
    - CRUD 操作、發布、關閉、查看提交、批改、AI 批改

學生端點 (/api/assignments):
    - 查看作業、提交文件、查看成績

Swift 運行:
    - POST /api/assignments/run-swift
"""

import asyncio
import logging
from typing import List, Optional, Tuple

from fastapi import APIRouter, Body, Depends, File, Form, Query, Request, UploadFile

from app.core.dependencies import get_current_user, require_teacher
from app.core.responses import error_response, paginated_response, success_response
from app.domains.assignment.schemas import (
    CreateAssignmentRequest,
    GradeSubmissionRequest,
    RunSwiftRequest,
    UpdateAssignmentRequest,
)
from app.services.container import get_services

logger = logging.getLogger(__name__)
router = APIRouter(tags=["作業管理"])


# ================================================================
# 老師端點
# ================================================================

@router.post("/api/assignments/teacher")
async def create_assignment(
    request: CreateAssignmentRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """創建作業 (草稿)"""
    username, role = teacher_info
    services = get_services()

    # 獲取教師 user id
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0
    teacher_name = user.get("display_name", username) if user else username

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.create_assignment(
            teacher_id=teacher_id,
            teacher_name=teacher_name,
            title=request.title,
            description=request.description,
            target_type=request.target_type,
            target_value=request.target_value,
            deadline=request.deadline,
            max_files=request.max_files,
            allow_late=request.allow_late,
            rubric_type=request.rubric_type,
            rubric_config=request.rubric_config,
            rubric_items=[item.dict() for item in request.rubric_items],
        ),
    )
    return success_response(data=result, message="作業創建成功")


@router.get("/api/assignments/teacher")
async def list_teacher_assignments(
    status: str = Query("", description="狀態過濾: draft, published, closed"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """老師的作業列表"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.list_teacher_assignments(
            teacher_id=teacher_id,
            status=status,
            page=page,
            page_size=page_size,
        ),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/api/assignments/teacher/targets")
async def get_targets(
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """獲取可選目標 (班級/學生列表)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    targets = await loop.run_in_executor(
        None, services.assignment.get_available_targets
    )
    return success_response(data=targets)


@router.get("/api/assignments/teacher/{assignment_id}")
async def get_teacher_assignment_detail(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """作業詳情 (老師視角)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, services.assignment.get_assignment_detail, assignment_id,
    )
    return success_response(data=result)


@router.put("/api/assignments/teacher/{assignment_id}")
async def update_assignment(
    assignment_id: int,
    request: UpdateAssignmentRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新作業（草稿和已發布均可）"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    fields = request.dict(exclude_unset=True)
    if "rubric_items" in fields and fields["rubric_items"] is not None:
        fields["rubric_items"] = [item.dict() for item in request.rubric_items]
    if "rubric_scores" in fields:
        # rubric_scores belongs to grading, not update
        fields.pop("rubric_scores", None)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.update_assignment(
            assignment_id, teacher_id, **fields,
        ),
    )
    return success_response(data=result, message="作業更新成功")


@router.post("/api/assignments/teacher/{assignment_id}/publish")
async def publish_assignment(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """發布作業"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.publish_assignment(assignment_id, teacher_id),
    )
    return success_response(data=result, message="作業已發布")


@router.post("/api/assignments/teacher/{assignment_id}/close")
async def close_assignment(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """關閉作業"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.close_assignment(assignment_id, teacher_id),
    )
    return success_response(data=result, message="作業已關閉")


@router.delete("/api/assignments/teacher/{assignment_id}")
async def delete_assignment(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """刪除作業 (軟刪除)"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: services.assignment.delete_assignment(assignment_id, teacher_id),
    )
    return success_response(message="作業已刪除")


@router.get("/api/assignments/teacher/{assignment_id}/submissions")
async def list_submissions(
    assignment_id: int,
    status: str = Query("", description="狀態過濾: submitted, graded"),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查看某作業的所有提交"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.list_submissions(assignment_id, status),
    )
    return success_response(data=result)


@router.get("/api/assignments/teacher/submissions/{submission_id}")
async def get_submission_detail(
    submission_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查看單個提交詳情"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.get_submission_detail(submission_id),
    )
    return success_response(data=result)


@router.post("/api/assignments/teacher/submissions/{submission_id}/grade")
async def grade_submission(
    submission_id: int,
    request: GradeSubmissionRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """批改提交"""
    username, _ = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    scores_data = []
    for s in request.rubric_scores:
        sd = {"rubric_item_id": s.rubric_item_id}
        if s.points is not None:
            sd["points"] = s.points
        if s.selected_level is not None:
            sd["selected_level"] = s.selected_level
        scores_data.append(sd)

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.grade_submission(
            submission_id=submission_id,
            teacher_id=teacher_id,
            rubric_scores=scores_data,
            feedback=request.feedback,
        ),
    )
    return success_response(data=result, message="批改完成")


@router.post("/api/assignments/teacher/submissions/{submission_id}/ai-grade")
async def ai_grade_submission(
    submission_id: int,
    req: Request,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """AI 自動批改（可附帶額外提示）"""
    extra_prompt = ""
    try:
        body = await req.json()
        extra_prompt = (body.get("extra_prompt") or "") if isinstance(body, dict) else ""
    except Exception:
        pass
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.ai_grade_submission(submission_id, extra_prompt=extra_prompt),
    )
    return success_response(data=result, message="AI 批改完成")


# ================================================================
# 作業附件
# ================================================================

@router.post("/api/assignments/teacher/{assignment_id}/attachments")
async def upload_attachments(
    assignment_id: int,
    files: List[UploadFile] = File(...),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """上傳作業附件 (教師用，multipart)"""
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    results = []
    for f in files:
        result = await services.assignment.upload_attachment(
            assignment_id=assignment_id,
            teacher_id=teacher_id,
            file=f,
        )
        results.append(result)

    return success_response(data=results, message=f"已上傳 {len(results)} 個附件")


@router.delete("/api/assignments/teacher/{assignment_id}/attachments/{file_id}")
async def delete_attachment(
    assignment_id: int,
    file_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """刪除作業附件"""
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: services.assignment.delete_attachment(
            attachment_id=file_id,
            teacher_id=teacher_id,
        ),
    )
    return success_response(message="附件已刪除")


# ================================================================
# 學生端點
# ================================================================

@router.get("/api/assignments")
async def list_student_assignments(
    status: str = Query("", description="狀態過濾: not_submitted, submitted, graded"),
    current_user: dict = Depends(get_current_user),
):
    """學生的作業列表"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.list_student_assignments(
            username=current_user["username"],
            class_name=current_user.get("class_name", ""),
            status_filter=status,
        ),
    )
    return success_response(data=result)


@router.get("/api/assignments/{assignment_id}")
async def get_student_assignment_detail(
    assignment_id: int,
    current_user: dict = Depends(get_current_user),
):
    """學生的作業詳情 (含我的提交)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.get_student_assignment_detail(
            assignment_id=assignment_id,
            username=current_user["username"],
        ),
    )
    return success_response(data=result)


@router.post("/api/assignments/{assignment_id}/submit")
async def submit_assignment(
    assignment_id: int,
    content: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
    current_user: dict = Depends(get_current_user),
):
    """學生提交作業 (multipart: 文字 + 文件)"""
    services = get_services()
    result = await services.assignment.submit_assignment(
        assignment_id=assignment_id,
        student=current_user,
        content=content,
        files=files if files else None,
    )
    return success_response(data=result, message="提交成功")


@router.post("/api/assignments/teacher/{assignment_id}/submit-for-student")
async def teacher_submit_for_student(
    assignment_id: int,
    student_username: str = Form(...),
    content: str = Form(default=""),
    files: List[UploadFile] = File(default=[]),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """教師代替學生提交作業"""
    services = get_services()

    # 查找學生信息
    student_user = services.user.get_user(student_username)
    if not student_user:
        return error_response(f"找不到學生: {student_username}", status_code=404)

    student = {
        "id": student_user["id"],
        "username": student_user.get("username", student_username),
        "display_name": student_user.get("display_name") or student_user.get("name", student_username),
        "class_name": student_user.get("class_name", ""),
    }

    result = await services.assignment.submit_assignment(
        assignment_id=assignment_id,
        student=student,
        content=content or f"（由教師 {teacher_info[0]} 代為提交）",
        files=files if files else None,
    )
    return success_response(data=result, message="代提交成功")


# ================================================================
# Swift 運行
# ================================================================

@router.post("/api/assignments/run-swift")
async def run_swift_code(
    request: RunSwiftRequest,
    current_user: dict = Depends(get_current_user),
):
    """運行 Swift 代碼"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.run_swift_code(request.code),
    )
    return success_response(data=result)
