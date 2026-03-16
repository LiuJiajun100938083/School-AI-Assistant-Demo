"""
AI 考試出題 — API 路由
========================
所有端點均需 teacher 權限。
Router 只做：收參數 → 調 service → 返回標準響應。
"""

import logging
from typing import Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, Query

from app.core.dependencies import require_teacher
from app.core.responses import error_response, paginated_response, success_response
from app.domains.exam_creator.schemas import (
    ExamGenerationRequest,
    RegenerateQuestionRequest,
    UpdateQuestionRequest,
)
from app.services import get_services

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI 考卷出題"])


# ================================================================
# POST /api/exam-creator/generate — 啟動 AI 出題
# ================================================================

@router.post("/api/exam-creator/generate")
async def start_exam_generation(
    req: ExamGenerationRequest,
    background_tasks: BackgroundTasks,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    try:
        result = service.start_exam_generation(
            teacher_username=teacher_username,
            subject=req.subject,
            question_count=req.question_count,
            difficulty=req.difficulty,
            target_points=req.target_points,
            question_types=req.question_types,
            exam_context=req.exam_context,
            total_marks=req.total_marks,
        )
    except ValueError as e:
        return error_response(message=str(e), status_code=400)

    # 非複用 session 才啟動後台任務
    bg_context = result.pop("_bg_context", None)
    if bg_context and not result.get("reused"):
        background_tasks.add_task(
            service.generate_exam_background,
            session_id=result["session_id"],
            subject=bg_context["subject"],
            question_count=bg_context["question_count"],
            difficulty=bg_context["difficulty"],
            points_data=bg_context["points_data"],
            question_types=bg_context.get("question_types"),
            exam_context=bg_context.get("exam_context", ""),
            total_marks=bg_context.get("total_marks"),
        )

    return success_response(data=result, message="出題任務已啟動")


# ================================================================
# GET /api/exam-creator/{session_id}/status — 輪詢生成狀態
# ================================================================

@router.get("/api/exam-creator/{session_id}/status")
async def get_exam_generation_status(
    session_id: str,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    result = service.get_generation_status(session_id, teacher_username)
    if not result:
        return error_response(message="Session 不存在或無權限", status_code=404)

    return success_response(data=result)


# ================================================================
# PUT /api/exam-creator/{session_id}/questions/{index} — 編輯單題
# ================================================================

@router.put("/api/exam-creator/{session_id}/questions/{index}")
async def update_question(
    session_id: str,
    index: int,
    req: UpdateQuestionRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    try:
        result = service.update_question(
            session_id, teacher_username, index, req.edits,
        )
    except ValueError as e:
        return error_response(message=str(e), status_code=400)

    if result is None:
        return error_response(message="Session 不存在或無權限", status_code=404)

    return success_response(data=result, message="題目已更新")


# ================================================================
# POST /api/exam-creator/{session_id}/regenerate — 重新生成單題
# ================================================================

@router.post("/api/exam-creator/{session_id}/regenerate")
async def regenerate_question(
    session_id: str,
    req: RegenerateQuestionRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    try:
        result = await service.regenerate_question(
            session_id, teacher_username, req.question_index, req.instruction,
        )
    except ValueError as e:
        return error_response(message=str(e), status_code=400)

    if result is None:
        return error_response(message="Session 不存在或無權限", status_code=404)

    return success_response(data=result, message="題目已重新生成")


# ================================================================
# GET /api/exam-creator/history — 出題歷史
# ================================================================

@router.get("/api/exam-creator/history")
async def get_exam_generation_history(
    teacher_info: Tuple[str, str] = Depends(require_teacher),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    result = service.get_history(teacher_username, page, page_size)
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


# ================================================================
# DELETE /api/exam-creator/{session_id} — 刪除 session
# ================================================================

@router.delete("/api/exam-creator/{session_id}")
async def delete_exam_session(
    session_id: str,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    deleted = service.delete_session(session_id, teacher_username)
    if not deleted:
        return error_response(message="Session 不存在、無權限或正在生成中", status_code=400)

    return success_response(message="已刪除")


# ================================================================
# GET /api/exam-creator/knowledge-points/{subject} — 知識點列表
# ================================================================

@router.get("/api/exam-creator/knowledge-points/{subject}")
async def get_knowledge_points(
    subject: str,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    service = get_services().exam_creator
    points = service.get_knowledge_points(subject)
    return success_response(data=points)


# ================================================================
# GET /api/exam-creator/{session_id}/export — 匯出試卷數據
# ================================================================

@router.get("/api/exam-creator/{session_id}/export")
async def export_exam_data(
    session_id: str,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    result = service.export_exam_data(session_id, teacher_username)
    if not result:
        return error_response(message="Session 不存在或無權限", status_code=404)

    return success_response(data=result)
