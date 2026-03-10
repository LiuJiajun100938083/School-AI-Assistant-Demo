"""
錯題本 API 路由
===============
提供學生錯題管理、AI 分析、練習題生成、複習排程等端點。
"""

import asyncio
import logging
import time
from typing import List, Optional, Set, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from app.core.dependencies import get_current_user, require_admin, require_teacher_or_admin
from app.services.container import get_services
from app.domains.mistake_book.schemas import (
    ConfirmOCRRequest,
    GeneratePracticeRequest,
    ManualMistakeRequest,
    RecordReviewRequest,
    SubmitPracticeRequest,
)
from app.domains.mistake_book.exceptions import (
    MistakeBookError,
    MistakeNotFoundError,
)
from app.domains.mistake_book.subject_handler import SubjectHandlerRegistry

logger = logging.getLogger(__name__)
router = APIRouter(tags=["mistake-book"])

MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10MB

# ---- 動態科目驗證（60秒緩存） ----
_subject_cache: Set[str] = set()
_subject_cache_ts: float = 0


def _validate_subject(subject: str) -> str:
    """驗證科目代碼是否存在於 subjects 表中。"""
    global _subject_cache, _subject_cache_ts
    now = time.time()
    if now - _subject_cache_ts > 60:
        try:
            subject_service = get_services().subject
            subjects = subject_service.list_subjects()
            _subject_cache = {s["subject_code"] for s in subjects}
        except Exception:
            # 服務不可用時降級到已註冊的 handler
            _subject_cache = set(SubjectHandlerRegistry.get_all().keys())
        _subject_cache_ts = now
    if subject not in _subject_cache:
        raise HTTPException(400, f"不支持的科目: {subject}")
    return subject


# ============================================================
# 學生端：科目列表
# ============================================================

@router.get("/api/mistakes/subjects")
async def get_mistake_book_subjects(
    current_user: dict = Depends(get_current_user),
):
    """
    獲取錯題本支持的科目列表（動態從數據庫加載）。
    前端用此端點動態渲染科目切換芯片。
    """
    try:
        subject_service = get_services().subject
        subjects = subject_service.list_subjects()
    except Exception:
        subjects = []

    result = []
    for s in subjects:
        code = s.get("subject_code", "")
        db_name = s.get("subject_name", code)
        handler = SubjectHandlerRegistry.get(code)
        # 自定義 Handler 用 handler.display_name；DefaultHandler 用數據庫的 subject_name
        display = handler.display_name if handler.display_name != code else db_name
        result.append({
            "subject_code": code,
            "subject_name": db_name,
            "icon": s.get("icon", ""),
            "display_name": display,
            "categories": handler.categories,
            "ui_features": handler.ui_features,
            "error_types": handler.error_types,
        })
    return {"success": True, "data": result}


# ============================================================
# 學生端：錯題上傳與管理
# ============================================================

@router.post("/api/mistakes/upload")
async def upload_mistake_photo(
    background_tasks: BackgroundTasks,
    images: List[UploadFile] = File(...),
    subject: str = Form(...),
    category: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """
    上傳錯題照片（支持多張），立即返回，後台 AI 自動識別 + 分析

    - **images**: 照片文件列表（JPG/PNG/HEIC，每張最大 10MB，最多 5 張）
    - **subject**: 科目 (chinese/math/english)
    - **category**: 題目類型（如 閱讀理解、代數、Grammar）
    """
    _validate_subject(subject)

    if len(images) > 5:
        raise HTTPException(400, "最多支持 5 張照片")

    # 讀取並驗證所有圖片
    image_items = []  # [(bytes, filename), ...]
    for img in images:
        content = await img.read()
        if len(content) > MAX_IMAGE_SIZE:
            raise HTTPException(
                400,
                f"圖片 {img.filename} 太大，最大允許 {MAX_IMAGE_SIZE // 1024 // 1024}MB",
            )
        image_items.append((content, img.filename or "photo.jpg"))

    try:
        service = get_services().mistake_book

        # 快速創建記錄（保存所有圖片 + 建 DB，不做 OCR）
        result = await service.create_mistake_record(
            student_username=current_user["username"],
            subject=subject,
            category=category,
            image_data=image_items[0][0],
            filename=image_items[0][1],
            extra_images=image_items[1:] if len(image_items) > 1 else None,
        )

        # 後台處理：OCR → 自動確認 → AI 分析
        async def _process_task():
            try:
                svc = get_services().mistake_book
                await svc.process_mistake_background(result["mistake_id"])
            except Exception as e:
                logger.error(
                    "後台處理錯題失敗 (mistake=%s): %s",
                    result["mistake_id"], e,
                )

        background_tasks.add_task(_process_task)

        return {"success": True, "data": result}

    except MistakeBookError as e:
        raise HTTPException(400, e.message)


@router.post("/api/mistakes/{mistake_id}/confirm")
async def confirm_ocr_and_analyze(
    mistake_id: str,
    req: ConfirmOCRRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    確認 OCR 結果並觸發 AI 分析

    學生確認/修正識別結果後，AI 自動：
    1. 批改答案
    2. 分析錯誤原因
    3. 關聯知識點
    4. 設置複習排程
    """
    try:
        service = get_services().mistake_book
        result = await service.confirm_and_analyze(
            mistake_id=mistake_id,
            confirmed_question=req.confirmed_question,
            confirmed_answer=req.confirmed_answer,
            confirmed_figure_description=req.confirmed_figure_description,
        )
        return {"success": True, "data": result}

    except MistakeNotFoundError:
        raise HTTPException(404, "錯題不存在")
    except MistakeBookError as e:
        raise HTTPException(400, e.message)
    except Exception as e:
        import logging
        logging.getLogger(__name__).error("confirm_and_analyze 異常: %s", e, exc_info=True)
        raise HTTPException(500, f"AI 分析過程中發生錯誤: {str(e)[:200]}")


@router.post("/api/mistakes/manual")
async def add_manual_mistake(
    req: ManualMistakeRequest,
    current_user: dict = Depends(get_current_user),
):
    """手動添加錯題（不拍照）"""
    try:
        service = get_services().mistake_book
        loop = asyncio.get_event_loop()
        _validate_subject(req.subject)
        result = await loop.run_in_executor(
            None,
            lambda: service.add_manual_mistake(
                student_username=current_user["username"],
                subject=req.subject,
                category=req.category,
                question_text=req.question_text,
                answer_text=req.answer_text,
                correct_answer=req.correct_answer,
                tags=req.tags,
            ),
        )
        return {"success": True, "data": result}

    except MistakeBookError as e:
        raise HTTPException(400, e.message)


# ============================================================
# 學生端：錯題查詢
# ============================================================

@router.get("/api/mistakes")
async def get_my_mistakes(
    subject: Optional[str] = Query(None, description="科目篩選"),
    category: Optional[str] = Query(None, description="類型篩選"),
    status: Optional[str] = Query(None, description="狀態篩選"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """查詢我的錯題列表"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.get_my_mistakes(
            username=current_user["username"],
            subject=subject,
            category=category,
            status=status,
            page=page,
            page_size=page_size,
        ),
    )
    return {"success": True, "data": result}


@router.get("/api/mistakes/dashboard")
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
):
    """學習統計儀表板"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None, service.get_dashboard, current_user["username"],
    )
    return {"success": True, "data": result}


# ============================================================
# 學生端：知識點分析（必須在 {mistake_id} 路由之前）
# ============================================================

@router.get("/api/mistakes/weakness-report")
async def get_weakness_report(
    subject: str = Query(..., description="科目"),
    current_user: dict = Depends(get_current_user),
):
    """獲取薄弱知識點報告"""
    _validate_subject(subject)

    service = get_services().mistake_book
    result = await service.get_weakness_report(current_user["username"], subject)
    return {"success": True, "data": result}


@router.get("/api/mistakes/knowledge-map")
async def get_knowledge_map(
    subject: str = Query(..., description="科目"),
    current_user: dict = Depends(get_current_user),
):
    """獲取知識點掌握度地圖"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.get_knowledge_mastery_map(current_user["username"], subject),
    )
    return {"success": True, "data": result}


@router.get("/api/mistakes/knowledge-graph")
async def get_knowledge_graph(
    subject: str = Query(..., description="科目"),
    current_user: dict = Depends(get_current_user),
):
    """
    獲取知識圖譜全量數據（雷達圖 + 趨勢 + 樹狀圖 + 薄弱點摘要）
    """
    _validate_subject(subject)

    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.get_knowledge_graph_data(current_user["username"], subject),
    )
    return {"success": True, "data": result}


@router.get("/api/mistakes/mastery-history")
async def get_mastery_history(
    point_code: str = Query(..., description="知識點編碼"),
    limit: int = Query(30, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    """獲取單個知識點的掌握度歷史曲線"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: service.get_mastery_history(current_user["username"], point_code, limit),
    )
    return {"success": True, "data": result}


class KnowledgeQARequest(BaseModel):
    point_code: str
    question: str


@router.post("/api/mistakes/knowledge-qa")
async def ask_about_knowledge_point(
    req: KnowledgeQARequest,
    current_user: dict = Depends(get_current_user),
):
    """
    學生針對某知識點提問，AI 結合掌握情況個性化作答
    """
    service = get_services().mistake_book
    result = await service.ask_about_knowledge_point(
        current_user["username"], req.point_code, req.question
    )
    return {"success": True, "data": result}


# ============================================================
# 學生端：間隔複習（必須在 {mistake_id} 路由之前）
# ============================================================

@router.get("/api/mistakes/review-queue")
async def get_review_queue(
    subject: Optional[str] = Query(None),
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """獲取今日待複習的錯題"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    items = await loop.run_in_executor(
        None,
        lambda: service.get_review_queue(
            current_user["username"], subject, limit,
        ),
    )
    return {"success": True, "data": {"items": items, "count": len(items)}}


# ============================================================
# 學生端：錯題詳情（{mistake_id} 通配路由，必須在所有固定路徑之後）
# ============================================================

@router.get("/api/mistakes/{mistake_id}")
async def get_mistake_detail(
    mistake_id: str,
    current_user: dict = Depends(get_current_user),
):
    """獲取錯題詳情"""
    try:
        service = get_services().mistake_book
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, service.get_mistake_detail, mistake_id,
        )
        return {"success": True, "data": result}
    except MistakeNotFoundError:
        raise HTTPException(404, "錯題不存在")


@router.post("/api/mistakes/{mistake_id}/cancel")
async def cancel_mistake_recognition(
    mistake_id: str,
    current_user: dict = Depends(get_current_user),
):
    """取消正在處理的錯題識別"""
    try:
        service = get_services().mistake_book
        service.cancel_processing(mistake_id, current_user["username"])
        return {"success": True, "message": "已取消識別"}
    except MistakeNotFoundError:
        raise HTTPException(404, "錯題不存在或無權限")
    except ValueError as e:
        raise HTTPException(409, str(e))


@router.delete("/api/mistakes/{mistake_id}")
async def delete_mistake(
    mistake_id: str,
    current_user: dict = Depends(get_current_user),
):
    """刪除錯題（軟刪除）"""
    try:
        service = get_services().mistake_book
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: service.delete_mistake(mistake_id, current_user["username"]),
        )
        return {"success": True, "message": "已刪除"}
    except MistakeNotFoundError:
        raise HTTPException(404, "錯題不存在或無權限")


# ============================================================
# 學生端：練習題
# ============================================================

@router.post("/api/mistakes/practice/generate")
async def generate_practice(
    req: GeneratePracticeRequest,
    current_user: dict = Depends(get_current_user),
):
    """AI 根據薄弱知識點生成練習題"""
    try:
        service = get_services().mistake_book
        _validate_subject(req.subject)
        result = await service.generate_practice(
            username=current_user["username"],
            subject=req.subject,
            session_type=req.session_type.value,
            question_count=req.question_count,
            target_points=req.target_points,
            difficulty=req.difficulty,
        )
        return {"success": True, "data": result}

    except MistakeBookError as e:
        raise HTTPException(400, e.message)


@router.post("/api/mistakes/practice/{session_id}/submit")
async def submit_practice(
    session_id: str,
    req: SubmitPracticeRequest,
    current_user: dict = Depends(get_current_user),
):
    """提交練習答案並獲取批改結果"""
    try:
        service = get_services().mistake_book
        result = await service.submit_practice(
            session_id=session_id,
            username=current_user["username"],
            answers=req.answers,
        )
        return {"success": True, "data": result}

    except MistakeBookError as e:
        raise HTTPException(400, e.message)


@router.post("/api/mistakes/{mistake_id}/review")
async def record_review(
    mistake_id: str,
    req: RecordReviewRequest,
    current_user: dict = Depends(get_current_user),
):
    """記錄複習結果，更新複習排程"""
    try:
        service = get_services().mistake_book
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: service.record_review(
                mistake_id=mistake_id,
                username=current_user["username"],
                result=req.result.value,
                time_spent=req.time_spent_seconds,
            ),
        )
        return {"success": True, "data": result}

    except MistakeNotFoundError:
        raise HTTPException(404, "錯題不存在")


# ============================================================
# 教師端
# ============================================================

@router.get("/api/teacher/mistakes/student/{username}")
async def teacher_get_student_mistakes(
    username: str,
    subject: Optional[str] = Query(None),
    teacher_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """教師查看學生錯題概況"""
    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    overview = await loop.run_in_executor(
        None, service.get_student_overview, username,
    )

    if subject:
        weakness = await service.get_weakness_report(username, subject)
        overview["weakness_report"] = weakness

    return {"success": True, "data": overview}


@router.get("/api/teacher/mistakes/class-report")
async def teacher_class_report(
    class_name: str = Query(...),
    subject: str = Query(...),
    teacher_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """班級薄弱知識點分析報告"""
    loop = asyncio.get_event_loop()
    user_service = get_services().user
    students = await loop.run_in_executor(
        None, user_service.get_users_by_class, class_name,
    )
    student_usernames = [s["username"] for s in students] if students else []

    service = get_services().mistake_book
    result = await loop.run_in_executor(
        None,
        lambda: service.get_class_weakness_report(class_name, subject, student_usernames),
    )
    return {"success": True, "data": result}


# ============================================================
# 管理員端：知識點管理
# ============================================================

@router.get("/api/admin/knowledge-points")
async def list_knowledge_points(
    subject: Optional[str] = Query(None),
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """查看知識點列表"""
    from app.domains.mistake_book.repository import KnowledgePointRepository
    repo = KnowledgePointRepository()

    loop = asyncio.get_event_loop()
    if subject:
        points = await loop.run_in_executor(
            None, repo.find_by_subject, subject,
        )
    else:
        points = await loop.run_in_executor(
            None,
            lambda: repo.find_all(
                where="is_active = TRUE",
                order_by="subject, display_order, category",
            ),
        )
    return {"success": True, "data": points}


@router.post("/api/admin/knowledge-points/seed")
async def seed_knowledge_points(
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """從種子文件導入知識點"""
    import os
    data_path = os.path.join("data", "knowledge_points_seed.json")

    if not os.path.exists(data_path):
        raise HTTPException(404, f"種子文件不存在: {data_path}")

    service = get_services().mistake_book
    loop = asyncio.get_event_loop()
    count = await loop.run_in_executor(
        None, service.seed_knowledge_points, data_path,
    )
    return {"success": True, "message": f"已導入 {count} 個知識點"}
