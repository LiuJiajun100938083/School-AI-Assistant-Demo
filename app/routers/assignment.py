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
import io
import logging
import math
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

from fastapi import APIRouter, Body, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import get_current_user, require_teacher
from app.core.responses import error_response, paginated_response, success_response
from app.domains.assignment.schemas import (
    CreateAssignmentRequest,
    ExamQuestionInput,
    GradeFormAnswerRequest,
    GradeSubmissionRequest,
    QuestionInput,
    RunSwiftRequest,
    SubmitFormRequest,
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

    questions_data = None
    if request.questions:
        questions_data = [q.dict() for q in request.questions]

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.create_assignment(
            teacher_id=teacher_id,
            teacher_name=teacher_name,
            title=request.title,
            description=request.description,
            assignment_type=request.assignment_type,
            target_type=request.target_type,
            target_value=request.target_value,
            deadline=request.deadline,
            max_files=request.max_files,
            allow_late=request.allow_late,
            rubric_type=request.rubric_type,
            rubric_config=request.rubric_config,
            rubric_items=[item.dict() for item in request.rubric_items],
            questions=questions_data,
            exam_batch_id=request.exam_batch_id,
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


@router.get("/api/assignments/teacher/plagiarism-presets")
async def get_plagiarism_presets(
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """返回檢測策略預設列表（前端用於顯示策略說明）"""
    from app.domains.assignment.plagiarism_service import DETECTION_PRESETS
    presets = {}
    for key, val in DETECTION_PRESETS.items():
        presets[key] = {
            "label": val["label"],
            "description": val["description"],
            "default_threshold": val["default_threshold"],
        }
    return success_response(data=presets)


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
    if "questions" in fields and fields["questions"] is not None:
        fields["questions"] = [q.dict() for q in request.questions]
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
# 批量 AI 批改（背景任務 — 委托 BatchGradingManager）
# ================================================================


@router.post("/api/assignments/teacher/{assignment_id}/batch-ai-grade")
async def start_batch_ai_grade(
    assignment_id: int,
    req: Request,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """啟動批量 AI 批改（背景執行）"""
    services = get_services()
    mgr = services.batch_grading

    existing = mgr.get_status(assignment_id)
    if existing and existing.status == "running":
        return success_response(data=existing.to_dict(), message="批改任務進行中")

    extra_prompt = ""
    mode = "remaining"
    try:
        body = await req.json()
        if isinstance(body, dict):
            extra_prompt = body.get("extra_prompt") or ""
            mode = body.get("mode") or "remaining"
    except Exception:
        pass

    username, _ = teacher_info
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    if mode == "all":
        all_subs = services.assignment.list_submissions(assignment_id)
        subs = [s for s in all_subs if s.get("status") in ("submitted", "graded")]
    else:
        subs = services.assignment.list_submissions(assignment_id, status="submitted")

    if not subs:
        return error_response("沒有可批改的提交")

    sub_ids = [s["id"] for s in subs]
    job = mgr.start_batch(
        assignment_id=assignment_id,
        submission_ids=sub_ids,
        teacher_id=teacher_id,
        extra_prompt=extra_prompt,
        grade_fn=services.assignment.ai_grade_submission,
        save_fn=services.assignment.grade_submission,
    )
    return success_response(data=job.to_dict(), message="批改任務已啟動")


@router.get("/api/assignments/teacher/{assignment_id}/batch-ai-grade/status")
async def get_batch_ai_status(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查詢批量 AI 批改進度"""
    job = get_services().batch_grading.get_status(assignment_id)
    if not job:
        return success_response(data={"status": "idle"})
    return success_response(data=job.to_dict())


@router.post("/api/assignments/teacher/{assignment_id}/batch-ai-grade/cancel")
async def cancel_batch_ai_grade(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """取消批量 AI 批改"""
    if not get_services().batch_grading.cancel(assignment_id):
        return error_response("沒有正在進行的批改任務")
    return success_response(message="已請求取消")


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
# 文件預覽
# ================================================================

@router.get("/api/assignments/files/{file_id}/preview")
async def preview_file(
    file_id: int,
    current_user: dict = Depends(get_current_user),
):
    """將 Office 文件轉為 HTML 預覽（docx/xlsx/pptx）"""
    services = get_services()
    user = services.user.get_user(current_user["username"])
    user_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: services.assignment.preview_file(file_id, user_id),
        )
        return success_response(data=result)
    except Exception as e:
        return error_response(str(e), status_code=400)


# ================================================================
# 作業 AI 問答（學生用，已批改作業）
# ================================================================

@router.post("/api/assignments/{assignment_id}/ai-chat-stream")
async def assignment_ai_chat_stream(
    assignment_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """
    學生作業 AI 問答 — SSE 流式回答。
    首次對話自動構建作業上下文，後續對話驗證 conversation 歸屬。
    """
    body = await request.json()
    question = (body.get("question") or "").strip()
    subject = body.get("subject", "")
    conversation_id = body.get("conversation_id")

    if not question:
        return error_response("VALIDATION_ERROR", "問題不能為空", status_code=400)

    services = get_services()
    username = current_user["username"]
    user = services.user.get_user(username)
    if not user:
        return error_response("NOT_FOUND", "用戶不存在", status_code=404)
    user_id = user["id"]

    try:
        if conversation_id:
            # 後續對話：驗證 conversation 屬於該學生 + 該作業
            if not services.assignment.validate_ai_conversation(
                conversation_id, assignment_id, username
            ):
                return error_response(
                    "FORBIDDEN", "此對話不屬於當前作業", status_code=403
                )
            augmented_question = question
        else:
            # 首次對話：構建作業上下文
            context = services.assignment.build_assignment_context(
                assignment_id, user_id
            )
            augmented_question = context + "\n" + question

        async def event_generator():
            import json as _json
            async for raw_event in services.chat.chat_stream(
                username=username,
                question=augmented_question,
                conversation_id=conversation_id,
                subject=subject,
                assignment_id=assignment_id,
            ):
                # ChatService 回傳 "event: <type>\ndata: <json>\n\n" 格式
                # 前端期望 SLC 風格：   "data: {type: ..., ...}\n\n"
                # 在此轉譯為前端可直接解析的格式
                event_type = None
                data_str = None
                for part in raw_event.strip().split("\n"):
                    if part.startswith("event: "):
                        event_type = part[7:].strip()
                    elif part.startswith("data: "):
                        data_str = part[6:]
                if event_type and data_str:
                    try:
                        payload = _json.loads(data_str)
                    except _json.JSONDecodeError:
                        payload = {}
                    payload["type"] = event_type
                    yield f"data: {_json.dumps(payload, ensure_ascii=False)}\n\n"
                elif data_str:
                    yield f"data: {data_str}\n\n"

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as e:
        logger.error("作業 AI 問答失敗: %s", e)
        return error_response(str(e), status_code=400)


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


# ================================================================
# Form 作業端點
# ================================================================

@router.post("/api/assignments/{assignment_id}/submit-form")
async def submit_form(
    assignment_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """學生提交 Form 作業（multipart: JSON answers + 文件）"""
    import json as _json

    services = get_services()

    # 解析 multipart form data
    form = await request.form()
    answers_json = form.get("answers", "[]")
    try:
        answers_data = _json.loads(answers_json)
    except _json.JSONDecodeError:
        return error_response("answers 格式無效", status_code=400)

    # 收集每題的上傳文件
    files_by_question: Dict[int, List[UploadFile]] = {}
    for key, value in form.multi_items():
        if key.startswith("files_") and isinstance(value, UploadFile):
            try:
                q_id = int(key.split("_", 1)[1])
                files_by_question.setdefault(q_id, []).append(value)
            except (ValueError, IndexError):
                pass

    result = await services.assignment.submit_form_answers(
        assignment_id=assignment_id,
        student=current_user,
        answers=answers_data,
        files_by_question=files_by_question if files_by_question else None,
    )
    return success_response(data=result, message="提交成功")


@router.post("/api/assignments/{assignment_id}/submit-exam")
async def submit_exam(
    assignment_id: int,
    request: Request,
    current_user: dict = Depends(get_current_user),
):
    """學生提交 Exam 作業（JSON body: {answers: [{question_id, answer_text}]}）"""
    import json as _json

    services = get_services()
    body = await request.json()
    answers_data = body.get("answers", [])

    result = await services.assignment.submit_exam_answers(
        assignment_id=assignment_id,
        student=current_user,
        answers=answers_data,
    )
    return success_response(data=result, message="提交成功")


@router.post("/api/assignments/teacher/submissions/{submission_id}/ai-grade-form")
async def ai_grade_form(
    submission_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """AI 批改 Form 文字題"""
    services = get_services()
    result = await services.assignment.ai_grade_form_submission(submission_id)
    return success_response(data=result)


@router.put("/api/assignments/teacher/submissions/{submission_id}/answers/{answer_id}/grade")
async def grade_form_answer(
    submission_id: int,
    answer_id: int,
    request: GradeFormAnswerRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """教師手動批改 Form 單題"""
    username, _ = teacher_info
    services = get_services()
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.teacher_grade_form_answer(
            answer_id=answer_id,
            teacher_id=teacher_id,
            points=request.points,
            feedback=request.feedback,
        ),
    )
    return success_response(data=result, message="批改成功")


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
        is_teacher_proxy=True,
    )
    return success_response(data=result, message="代提交成功")


# ================================================================
# Excel 匯出
# ================================================================


@router.get("/api/assignments/teacher/{assignment_id}/export-excel")
async def export_grade_excel(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """匯出作業成績到 Excel"""
    from app.domains.assignment.excel_export import build_grade_export_excel

    services = get_services()
    loop = asyncio.get_event_loop()

    try:
        assignment = await loop.run_in_executor(
            None,
            lambda: services.assignment.get_assignment_detail(assignment_id),
        )
    except Exception:
        return error_response("作業不存在", status_code=404)

    rubric_items = assignment.get("rubric_items") or []
    submissions = await loop.run_in_executor(
        None,
        lambda: services.assignment.list_submissions(assignment_id),
    )

    wb, filename = build_grade_export_excel(assignment, submissions, rubric_items)

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


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


# ================================================================
# 抄襲檢測（背景任務 — 委托 PlagiarismJobManager）
# ================================================================


@router.post("/api/assignments/teacher/{assignment_id}/plagiarism-check")
async def start_plagiarism_check(
    assignment_id: int,
    req: Request,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """啟動抄袭檢測（背景執行）"""
    services = get_services()
    mgr = services.plagiarism_jobs

    existing = mgr.get_status(assignment_id)
    if existing and existing.status == "running":
        return success_response(data=existing.to_dict(), message="檢測任務進行中")

    threshold = 60.0
    subject = ""
    detect_mode = "mixed"
    try:
        body = await req.json()
        if isinstance(body, dict):
            threshold = float(body.get("threshold", 60.0))
            subject = str(body.get("subject", ""))
            detect_mode = str(body.get("detect_mode", "mixed"))
    except Exception:
        pass

    username, _ = teacher_info
    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    loop = asyncio.get_event_loop()
    report = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.start_check(
            assignment_id=assignment_id,
            teacher_id=teacher_id,
            threshold=threshold,
            subject=subject,
            detect_mode=detect_mode,
        ),
    )

    report_id = report["report_id"]
    job = mgr.start_check(
        assignment_id=assignment_id,
        report_id=report_id,
        run_check_fn=services.plagiarism.run_check,
        get_report_fn=services.plagiarism.get_report_by_id,
    )
    return success_response(data=job.to_dict(), message="抄袭檢測已啟動")


@router.get("/api/assignments/teacher/{assignment_id}/plagiarism-check/status")
async def get_plagiarism_status(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查詢抄袭檢測進度"""
    services = get_services()
    job = services.plagiarism_jobs.get_status(assignment_id)
    if job and job.status == "running":
        return success_response(data=job.to_dict())

    loop = asyncio.get_event_loop()
    report = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_report(assignment_id),
    )

    if not report:
        return success_response(data={"status": "idle"})

    return success_response(data={
        "status": report.get("status", "idle"),
        "report_id": report.get("id"),
        "total_pairs": report.get("total_pairs", 0),
        "flagged_pairs": report.get("flagged_pairs", 0),
        "created_at": str(report.get("created_at", "")),
        "completed_at": str(report.get("completed_at", "")) if report.get("completed_at") else None,
    })


@router.get("/api/assignments/teacher/{assignment_id}/plagiarism-report")
async def get_plagiarism_report(
    assignment_id: int,
    flagged_only: bool = Query(False, description="僅顯示可疑配對"),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """取得抄袭檢測報告（含配對列表）"""
    services = get_services()
    loop = asyncio.get_event_loop()

    report = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_report(assignment_id),
    )
    if not report:
        return error_response("尚未執行過抄袭檢測", status_code=404)

    report_id = report["id"]
    pairs = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_pairs(report_id, flagged_only=flagged_only),
    )

    # 聚類分析
    clusters_data = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_clusters(report_id),
    )

    return success_response(data={
        "report": {
            "id": report["id"],
            "assignment_id": report["assignment_id"],
            "status": report["status"],
            "threshold": float(report.get("threshold", 60)),
            "total_pairs": report.get("total_pairs", 0),
            "flagged_pairs": report.get("flagged_pairs", 0),
            "detect_mode": report.get("detect_mode", "mixed"),
            "created_at": str(report.get("created_at", "")),
            "completed_at": str(report.get("completed_at", "")) if report.get("completed_at") else None,
        },
        "pairs": pairs,
        "clusters": clusters_data.get("clusters", []),
        "hub_students": clusters_data.get("hub_students", []),
    })


@router.get("/api/assignments/teacher/plagiarism-pairs/{pair_id}")
async def get_plagiarism_pair_detail(
    pair_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """取得單個配對的詳細內容（含並排文本）"""
    services = get_services()
    loop = asyncio.get_event_loop()

    pair = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_pair_detail(pair_id),
    )
    if not pair:
        return error_response("配對不存在", status_code=404)

    return success_response(data=pair)


@router.post("/api/assignments/teacher/plagiarism-pairs/{pair_id}/ai-analyze")
async def ai_analyze_pair(
    pair_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """按需對單個配對進行 AI 深度分析（教師手動觸發）"""
    services = get_services()
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.ai_analyze_single_pair(pair_id),
    )

    return success_response(data={"ai_analysis": result})


@router.get("/api/assignments/teacher/{assignment_id}/plagiarism-report/export-excel")
async def export_plagiarism_excel(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """匯出抄袭檢測報告到 Excel"""
    from app.domains.assignment.excel_export import build_plagiarism_export_excel

    services = get_services()
    loop = asyncio.get_event_loop()

    report = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_report(assignment_id),
    )
    if not report:
        return error_response("尚未執行過抄袭檢測", status_code=404)

    report_id = report["id"]
    pairs = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_pairs(report_id),
    )
    clusters_data = await loop.run_in_executor(
        None,
        lambda: services.plagiarism.get_clusters(report_id),
    )

    assignment = await loop.run_in_executor(
        None,
        lambda: services.assignment.get_assignment_detail(assignment_id),
    )

    wb, filename = build_plagiarism_export_excel(
        assignment, report, pairs,
        clusters_data.get("clusters", []),
        clusters_data.get("hub_students", []),
    )

    output = io.BytesIO()
    wb.save(output)
    output.seek(0)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


# ================================================================
# 試卷上傳 OCR 識別
# ================================================================

import json
import os
import uuid
from datetime import datetime
from pathlib import Path

# 上傳目錄
EXAM_UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "exam_papers"

ALLOWED_EXAM_EXTENSIONS = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".pdf"}
MAX_EXAM_FILE_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/api/assignments/teacher/upload-exam-paper")
async def upload_exam_paper(
    files: List[UploadFile] = File(...),
    subject: str = Form("general"),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """上傳試卷圖片/PDF，啟動 OCR 識別"""
    from fastapi import BackgroundTasks
    username, role = teacher_info
    services = get_services()

    user = services.user.get_user(username)
    teacher_id = user["id"] if user else 0

    if not files:
        return error_response("請至少上傳一個文件", status_code=400)

    # 校驗文件
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        if ext not in ALLOWED_EXAM_EXTENSIONS:
            return error_response(
                f"不支持的文件類型: {ext}，支持 JPG/PNG/HEIC/PDF",
                status_code=400,
            )

    batch_id = str(uuid.uuid4())
    batch_dir = EXAM_UPLOAD_DIR / batch_id
    batch_dir.mkdir(parents=True, exist_ok=True)

    # 創建批次記錄
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(
        None,
        lambda: services.assignment.create_upload_batch(
            batch_id=batch_id,
            subject=subject,
            created_by=teacher_id,
            total_files=len(files),
        ),
    )

    # 存儲文件 + 創建文件記錄
    for f in files:
        ext = os.path.splitext(f.filename or "")[1].lower()
        stored_name = f"{uuid.uuid4()}{ext}"
        file_path = batch_dir / stored_name

        content = await f.read()
        if len(content) > MAX_EXAM_FILE_SIZE:
            return error_response(
                f"文件 {f.filename} 超過 10MB 限制",
                status_code=400,
            )

        with open(file_path, "wb") as out:
            out.write(content)

        file_type = "pdf" if ext == ".pdf" else "image"

        # 計算 PDF 頁數
        total_pages = 1
        if file_type == "pdf":
            try:
                import fitz
                doc = fitz.open(str(file_path))
                total_pages = len(doc)
                doc.close()
            except Exception:
                total_pages = 1

        await loop.run_in_executor(
            None,
            lambda fn=f.filename, sn=stored_name, ft=file_type, fs=len(content), tp=total_pages: (
                services.assignment.create_upload_file({
                    "batch_id": batch_id,
                    "original_filename": fn or "unknown",
                    "stored_filename": sn,
                    "file_type": ft,
                    "file_size": fs,
                    "total_pages": tp,
                })
            ),
        )

    # 更新批次為 processing
    await loop.run_in_executor(
        None,
        lambda: services.assignment.update_batch_status(batch_id, "processing"),
    )

    # 啟動後台 OCR 任務
    asyncio.create_task(_process_exam_paper_ocr(batch_id, subject))

    return success_response(
        data={"batch_id": batch_id, "total_files": len(files)},
        message="文件上傳成功，正在識別中",
    )


@router.get("/api/assignments/teacher/upload-exam-paper/{batch_id}/status")
async def get_exam_paper_status(
    batch_id: str,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查詢試卷 OCR 識別狀態"""
    services = get_services()
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: services.assignment.get_batch_status(batch_id),
    )
    if not result:
        return error_response("批次不存在", status_code=404)
    return success_response(data=result)


@router.get("/api/assignments/teacher/{assignment_id}/questions")
async def get_assignment_questions(
    assignment_id: int,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """獲取作業題目列表"""
    services = get_services()
    loop = asyncio.get_event_loop()
    try:
        questions = await loop.run_in_executor(
            None,
            lambda: services.assignment.get_assignment_questions(assignment_id),
        )
        return success_response(data=questions)
    except Exception as e:
        return error_response(str(e), status_code=404)


@router.put("/api/assignments/teacher/{assignment_id}/questions")
async def save_assignment_questions(
    assignment_id: int,
    questions: List[ExamQuestionInput],
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """保存/更新作業題目 (事務化)"""
    services = get_services()
    loop = asyncio.get_event_loop()
    try:
        questions_data = [q.dict() for q in questions]
        result = await loop.run_in_executor(
            None,
            lambda: services.assignment.save_assignment_questions(
                assignment_id, questions_data
            ),
        )
        return success_response(data=result, message=f"已保存 {len(result)} 道題目")
    except Exception as e:
        logger.error("保存題目失敗: %s", e)
        return error_response(str(e), status_code=400)


async def _process_exam_paper_ocr(batch_id: str, subject: str):
    """後台任務：處理試卷 OCR 識別"""
    from app.domains.vision.schemas import RecognitionSubject

    services = get_services()
    loop = asyncio.get_event_loop()

    batch = await loop.run_in_executor(
        None, lambda: services.assignment.get_batch(batch_id)
    )
    if not batch:
        logger.error("OCR 批次不存在: %s", batch_id)
        return

    # 幂等檢查
    if batch["status"] in ("completed", "partial_failed", "failed"):
        logger.info("OCR 批次已完成，跳過: %s", batch_id)
        return

    files = await loop.run_in_executor(
        None, lambda: services.assignment.get_batch_files(batch_id)
    )

    vision = services.vision

    for file_rec in files:
        # 幂等: 跳過已完成
        if file_rec["ocr_status"] == "completed":
            continue

        # Stale processing 防護
        if file_rec["ocr_status"] == "processing":
            processed_at = file_rec.get("processed_at")
            if processed_at and (datetime.now() - processed_at).total_seconds() < 600:
                continue
            # 超過 10 分鐘，視為 stale，重新處理

        try:
            await loop.run_in_executor(
                None,
                lambda fid=file_rec["id"]: services.assignment.update_file_ocr(fid, "processing"),
            )

            file_path = EXAM_UPLOAD_DIR / batch_id / file_rec["stored_filename"]

            if file_rec["file_type"] == "pdf":
                image_paths = await loop.run_in_executor(
                    None,
                    lambda: vision.pdf_to_images(str(file_path)),
                )
            else:
                image_paths = [str(file_path)]

            # 逐頁 OCR，保守合併
            all_questions = []
            for page_idx, img_path in enumerate(image_paths):
                result = await vision.recognize_exam_paper(
                    img_path, RecognitionSubject(subject)
                )
                if result.success:
                    for q in result.questions:
                        q["source_page"] = page_idx + 1
                        q["source_file"] = file_rec["original_filename"]
                    all_questions.extend(result.questions)
                else:
                    logger.warning(
                        "頁 %d OCR 失敗: %s", page_idx + 1, result.error
                    )

            await loop.run_in_executor(
                None,
                lambda fid=file_rec["id"], qs=all_questions: (
                    services.assignment.update_file_ocr(
                        fid, "completed",
                        result=json.dumps(qs, ensure_ascii=False),
                    )
                ),
            )
            logger.info(
                "文件 %s OCR 完成: %d 題",
                file_rec["original_filename"], len(all_questions),
            )

        except Exception as e:
            logger.error("文件 OCR 失敗: %s - %s", file_rec["original_filename"], e)
            await loop.run_in_executor(
                None,
                lambda fid=file_rec["id"], err=str(e): (
                    services.assignment.update_file_ocr(fid, "failed", error=err)
                ),
            )

    # 刷新批次聚合狀態
    await loop.run_in_executor(
        None, lambda: services.assignment.refresh_batch_status(batch_id)
    )
    logger.info("批次 %s OCR 處理完畢", batch_id)
