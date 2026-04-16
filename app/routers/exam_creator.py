"""
AI 考試出題 — API 路由
========================
所有端點均需 teacher 權限。
Router 只做：收參數 → 調 service → 返回標準響應。
"""

import logging
import os
import uuid
from typing import Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import StreamingResponse

from app.core.dependencies import require_admin, require_teacher
from app.core.responses import error_response, paginated_response, success_response
from app.domains.exam_creator.schemas import (
    ExamGenerationRequest,
    GeometryDescriptionRequest,
    QuestionExportRequest,
    RegenerateQuestionRequest,
    SimilarQuestionRequest,
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
        # 如有幾何描述，附加到 exam_context
        exam_context = req.exam_context
        if req.geometry_description:
            geo_prefix = f"[幾何圖形描述] {req.geometry_description}"
            exam_context = f"{geo_prefix}\n{exam_context}" if exam_context else geo_prefix

        result = service.start_exam_generation(
            teacher_username=teacher_username,
            subject=req.subject,
            question_count=req.question_count,
            difficulty=req.difficulty,
            target_points=req.target_points,
            question_types=req.question_types,
            exam_context=exam_context,
            total_marks=req.total_marks,
            language=req.language,
            provider=req.provider,
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
            language=bg_context.get("language", "zh"),
            provider=bg_context.get("provider", "local"),
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


# ================================================================
# POST /api/exam-creator/generate-geometry — 從描述生成 JSXGraph
# ================================================================

@router.post("/api/exam-creator/generate-geometry")
async def generate_geometry(
    req: GeometryDescriptionRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """從文字描述生成 JSXGraph 幾何圖形 config（用於預覽）。"""
    import json
    import re

    from app.core.ai_gate import Priority, Weight
    from app.domains.mistake_book.jsxgraph_schema import (
        sanitize_label_text,
        validate_jsxgraph_config,
    )
    from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry
    from app.infrastructure.ai_pipeline.llm_caller import call_ollama_json

    handler = SubjectHandlerRegistry.get("math")
    prompt = handler.build_jsxgraph_spec_prompt(req.description)

    try:
        raw = await call_ollama_json(
            prompt,
            temperature=0.3,
            gate_task="jsxgraph_spec",
            gate_priority=Priority.BATCH,
            gate_weight=Weight.SVG_GEOMETRY,
            timeout=120.0,
        )
    except Exception as e:
        logger.warning("generate-geometry LLM failed: %s", e)
        return error_response(message="AI 生成失敗，請重試", status_code=500)

    if not raw or not raw.strip():
        return error_response(message="AI 返回為空", status_code=500)

    # 解析 JSON
    spec_data = None
    try:
        spec_data = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r'\{[\s\S]*\}', raw)
        if m:
            try:
                spec_data = json.loads(m.group())
            except json.JSONDecodeError:
                pass

    if not spec_data or spec_data.get("skip"):
        return error_response(message="無法從描述中提取幾何圖形", status_code=422)

    # 校驗
    is_valid, errors = validate_jsxgraph_config(spec_data)
    if not is_valid:
        logger.warning("generate-geometry validation failed: %s", errors[:5])
        return error_response(
            message=f"幾何圖形校驗失敗: {', '.join(errors[:3])}", status_code=422,
        )

    # 淨化 label/text
    for el in spec_data.get("elements", []):
        if "label" in el and isinstance(el["label"], str):
            el["label"] = sanitize_label_text(el["label"])
        if el.get("type") == "textLabel" and "text" in el:
            el["text"] = sanitize_label_text(el["text"])

    return success_response(data=spec_data, message="幾何圖形已生成")


# ================================================================
# POST /api/exam-creator/export-docx — 單題導出 DOCX
# ================================================================

@router.post("/api/exam-creator/export-docx")
async def export_question_docx(
    req: QuestionExportRequest,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """將單題導出為 .docx（含 OMML 公式）。"""
    from app.domains.exam_creator.docx_exporter import export_question_to_docx

    question_data = {
        "question": req.question,
        "correct_answer": req.correct_answer,
        "marking_scheme": req.marking_scheme,
        "points": req.points,
        "question_type": req.question_type,
        "options": req.options or [],
    }

    try:
        output = export_question_to_docx(question_data)
    except Exception as e:
        logger.error("DOCX export failed: %s", e)
        return error_response(message="DOCX 生成失敗", status_code=500)

    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": "attachment; filename=question.docx"},
    )


# ================================================================
# POST /api/exam-creator/similar/text — 相似題生成（文字輸入）
# ================================================================

@router.post("/api/exam-creator/similar/text")
async def generate_similar_from_text(
    req: SimilarQuestionRequest,
    background_tasks: BackgroundTasks,
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """從文字輸入生成相似題目。"""
    teacher_username, _ = teacher_info
    service = get_services().exam_creator

    try:
        result = service.start_similar_generation(
            teacher_username=teacher_username,
            subject=req.subject,
            question_text=req.question_text,
            count=req.count,
            difficulty_variation=req.difficulty_variation,
            source_type="image" if req.figure_description else "text",
            figure_description=req.figure_description,
        )
    except ValueError as e:
        return error_response(message=str(e), status_code=400)

    bg_context = result.pop("_bg_context", None)
    if bg_context and not result.get("reused"):
        background_tasks.add_task(
            service.generate_similar_background,
            session_id=result["session_id"],
            subject=bg_context["subject"],
            question_text=bg_context["question_text"],
            count=bg_context["count"],
            difficulty_variation=bg_context["difficulty_variation"],
            figure_description=bg_context.get("figure_description"),
        )

    return success_response(data=result, message="相似題生成任務已啟動")


# ================================================================
# POST /api/exam-creator/similar/image — 相似題 OCR（圖片→文字）
# ================================================================

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB

@router.post("/api/exam-creator/similar/image")
async def ocr_similar_question_image(
    image: UploadFile = File(...),
    subject: str = Form(...),
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    上傳題目圖片 → OCR 識別 → 返回文字（不直接生成）。

    前端收到 OCR 文字後填入 textarea，老師可修正，再走 /similar/text 生成。
    """
    teacher_username, _ = teacher_info

    # 校驗科目
    if subject not in ("math", "physics"):
        return error_response(message="相似題目前只支援 math 或 physics", status_code=400)

    # 校驗檔案大小
    content = await image.read()
    if len(content) > MAX_IMAGE_SIZE:
        return error_response(message="圖片大小超過 10MB 限制", status_code=400)

    # 存檔
    upload_dir = os.path.join("uploads", "exam_creator", teacher_username)
    os.makedirs(upload_dir, exist_ok=True)

    ext = os.path.splitext(image.filename or "image.jpg")[1] or ".jpg"
    file_id = str(uuid.uuid4())[:8]
    file_path = os.path.join(upload_dir, f"similar_{file_id}{ext}")

    with open(file_path, "wb") as f:
        f.write(content)

    # OCR 識別
    try:
        from app.domains.vision.schemas import RecognitionSubject, RecognitionTask

        vision = get_services().vision
        # 使用 MATH_SOLUTION 以同時提取圖形描述（力學圖、電路圖等）
        ocr_result = await vision.recognize(
            image_path=file_path,
            subject=RecognitionSubject(subject),
            task=RecognitionTask.MATH_SOLUTION,
        )

        ocr_text = (ocr_result.question_text or "").strip()
        confidence = ocr_result.confidence
        figure_desc = (ocr_result.figure_description or "").strip()

        # OCR 可用性判斷
        warning = None
        if not ocr_text or len(ocr_text) < 10:
            warning = "OCR 識別結果過短或為空，建議手動輸入題目文字"
        elif confidence < 0.3:
            warning = f"OCR 識別信心度較低（{confidence:.0%}），建議核對並修正文字"

        return success_response(data={
            "ocr_text": ocr_text,
            "confidence": round(confidence, 2),
            "warning": warning,
            "figure_description": figure_desc if figure_desc else None,
        })

    except Exception as e:
        logger.error("Similar question OCR failed: %s", e, exc_info=True)
        return error_response(
            message="圖片識別失敗，請手動輸入題目文字",
            status_code=500,
        )


# ================================================================
# GET /api/exam-creator/cloud-status — 雲端生成可用狀態
# ================================================================

@router.get("/api/exam-creator/cloud-status")
async def get_cloud_status(
    teacher_info: Tuple[str, str] = Depends(require_teacher),
):
    """查詢雲端 LLM 是否可用（老師可用）。"""
    try:
        from llm.config import get_llm_config
        config = get_llm_config()

        if not config.api_key:
            return success_response(data={
                "available": False,
                "model": config.api_model or "qwen-plus",
                "provider": "qwen",
                "reason": "missing_api_key",
                "api_key_masked": None,
            })

        key = config.api_key
        masked = f"{key[:3]}****{key[-4:]}" if len(key) > 8 else "****"
        return success_response(data={
            "available": True,
            "model": config.api_model or "qwen-plus",
            "provider": "qwen",
            "reason": None,
            "api_key_masked": masked,
        })
    except Exception as e:
        logger.warning("cloud-status check failed: %s", e)
        return success_response(data={
            "available": False,
            "model": None,
            "provider": "qwen",
            "reason": "config_error",
        })


# ================================================================
# PUT /api/exam-creator/cloud-config — 管理員配置雲端 API Key
# ================================================================

@router.put("/api/exam-creator/cloud-config")
async def update_cloud_config(
    request: Request,
    body: dict,
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """管理員配置雲端 LLM API Key（需 admin 權限）。"""
    from llm.config import get_llm_config_manager
    from app.core.audit import SecurityAuditLogger

    manager = get_llm_config_manager()
    username, role = admin_info
    client_ip = request.client.host if request.client else None

    api_key = body.get("api_key")
    api_model = body.get("api_model")

    if api_key is not None:
        manager.update_runtime(api_key=api_key)
        # 審計記錄：只記錄 masked key，不記錄原文
        masked = f"{api_key[:3]}****{api_key[-4:]}" if len(api_key) > 8 else "****"
        SecurityAuditLogger.log(
            action="UPDATE_API_KEY",
            actor=username,
            ip_address=client_ip,
            details={"masked_key": masked},
        )

    if api_model is not None:
        old_model = manager.config.api_model
        manager.update_runtime(api_model=api_model)
        SecurityAuditLogger.log(
            action="UPDATE_API_MODEL",
            actor=username,
            ip_address=client_ip,
            details={"old_model": old_model, "new_model": api_model},
        )

    config = manager.config
    # 回傳時遮罩 API key
    masked_key = None
    if config.api_key:
        key = config.api_key
        masked_key = f"{key[:3]}****{key[-4:]}" if len(key) > 8 else "****"

    return success_response(data={
        "api_key_masked": masked_key,
        "api_model": config.api_model,
        "available": bool(config.api_key),
    }, message="雲端配置已更新")
