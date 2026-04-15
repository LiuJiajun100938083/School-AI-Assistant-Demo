"""
试卷批阅系统 — API 路由
=========================
只做参数接收 + 响应返回，不含业务逻辑。
所有业务编排在 ExamGraderService 中完成。
"""

import asyncio
import logging
from typing import Dict

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.encoders import jsonable_encoder

from app.core.dependencies import get_current_user
from app.domains.exam_grader.schemas import (
    AdjustScoreRequest,
    CreateExamRequest,
    UpdateExamRequest,
    UpdateQuestionsRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/exam-grader", tags=["exam-grader"])


def _get_service():
    from app.services.container import get_services
    return get_services().exam_grader


def _require_teacher(user: dict):
    if user.get("role") not in ("teacher", "admin"):
        raise HTTPException(403, "只有教师和管理员可以使用试卷批阅")


def _success(data=None, message: str = "ok"):
    return {"success": True, "message": message, "data": jsonable_encoder(data)}


# ── 考试 CRUD ──


@router.post("/exams")
async def create_exam(
    req: CreateExamRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    exam = await asyncio.get_event_loop().run_in_executor(
        None, svc.create_exam, current_user["id"], req.dict(),
    )
    return _success(exam)


@router.get("/exams")
async def list_exams(
    status: str = Query("", description="按状态筛选"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    result = await asyncio.get_event_loop().run_in_executor(
        None, svc.list_exams, current_user["id"], status, page, page_size,
    )
    return _success(result)


@router.get("/exams/{exam_id}")
async def get_exam(exam_id: int, current_user: dict = Depends(get_current_user)):
    _require_teacher(current_user)
    svc = _get_service()
    exam = svc.get_exam(exam_id)
    if not exam:
        raise HTTPException(404, "考试不存在")
    questions = svc.get_questions(exam_id)
    exam["questions"] = questions
    return _success(exam)


@router.put("/exams/{exam_id}")
async def update_exam(
    exam_id: int,
    req: UpdateExamRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    exam = svc.update_exam(exam_id, req.dict(exclude_none=True))
    return _success(exam)


@router.delete("/exams/{exam_id}")
async def delete_exam(exam_id: int, current_user: dict = Depends(get_current_user)):
    _require_teacher(current_user)
    svc = _get_service()
    svc.delete_exam(exam_id)
    return _success(message="已删除")


# ── 题目提取 ──


@router.post("/exams/{exam_id}/clean-paper")
async def upload_clean_paper(
    exam_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    try:
        file_bytes = await file.read()
        path = svc.save_clean_paper(exam_id, file_bytes, file.filename or "paper.pdf")
        return _success({"path": path})
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("上传试卷失败: %s", e, exc_info=True)
        raise HTTPException(500, f"上传失败: {str(e)[:200]}")


@router.post("/exams/{exam_id}/extract-questions")
async def extract_questions(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    """触发题目提取（后台执行，立即返回）"""
    _require_teacher(current_user)
    svc = _get_service()
    try:
        svc.start_extract_questions(exam_id)
        return _success({"status": "extracting"}, message="题目提取已开始，请稍候")
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("题目提取启动失败: %s", e, exc_info=True)
        raise HTTPException(500, f"题目提取启动失败: {str(e)[:200]}")


# ── 答案获取 ──


@router.post("/exams/{exam_id}/answer-sheet")
async def upload_answer_sheet(
    exam_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    try:
        file_bytes = await file.read()
        svc.save_answer_sheet(exam_id, file_bytes, file.filename or "answers.pdf")
        result = await svc.extract_answer_sheet(exam_id)
        return _success(result)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("答案卷处理失败: %s", e, exc_info=True)
        raise HTTPException(500, f"答案卷处理失败: {str(e)[:200]}")


@router.post("/exams/{exam_id}/generate-answers")
async def generate_answers(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    try:
        result = await svc.generate_answers_with_rag(exam_id)
        return _success(result)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("答案生成失败: %s", e, exc_info=True)
        raise HTTPException(500, f"答案生成失败: {str(e)[:200]}")


@router.get("/exams/{exam_id}/questions")
async def get_questions(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    questions = svc.get_questions(exam_id)
    return _success(questions)


@router.put("/exams/{exam_id}/questions")
async def update_questions(
    exam_id: int,
    req: UpdateQuestionsRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    count = svc.update_questions(exam_id, [q.dict() for q in req.questions])
    return _success({"updated": count})


@router.post("/exams/{exam_id}/confirm-answers")
async def confirm_answers(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    svc.confirm_answers(exam_id)
    return _success(message="答案已确认")


# ── 批量 PDF + 批改 ──


@router.post("/exams/{exam_id}/batch-pdf")
async def upload_batch_pdf(
    exam_id: int,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
):
    """上传全班 PDF → 自动切分 + 开始批改"""
    _require_teacher(current_user)
    svc = _get_service()
    try:
        file_bytes = await file.read()
        svc.save_batch_pdf(exam_id, file_bytes, file.filename or "batch.pdf")
        result = await svc.split_and_start_grading(exam_id)
        return _success(result)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        logger.error("批量批改启动失败: %s", e, exc_info=True)
        raise HTTPException(500, f"批量批改启动失败: {str(e)[:200]}")


@router.get("/exams/{exam_id}/students")
async def get_students(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    papers = svc.get_student_papers(exam_id)
    return _success(papers)


@router.get("/exams/{exam_id}/grading-status")
async def get_grading_status(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    progress = svc.get_grading_progress(exam_id)
    return _success(progress)


@router.post("/exams/{exam_id}/cancel-grading")
async def cancel_grading(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    cancelled = svc.cancel_grading(exam_id)
    return _success({"cancelled": cancelled})


# ── 结果 ──


@router.get("/exams/{exam_id}/results")
async def get_results(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    papers = svc.get_student_papers(exam_id)
    return _success(papers)


@router.get("/students/{paper_id}/answers")
async def get_student_answers(
    paper_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    answers = svc.get_student_answers(paper_id)
    return _success(answers)


@router.put("/answers/{answer_id}/adjust")
async def adjust_score(
    answer_id: int,
    req: AdjustScoreRequest,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    result = svc.adjust_score(answer_id, req.score, req.feedback)
    return _success(result)


@router.get("/exams/{exam_id}/statistics")
async def get_statistics(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    _require_teacher(current_user)
    svc = _get_service()
    stats = svc.get_statistics(exam_id)
    return _success(stats)


# ── 匯出 ──


@router.get("/exams/{exam_id}/export-class")
async def export_class(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    """匯出全班成績表 xlsx"""
    from fastapi.responses import Response
    from app.domains.exam_grader.exporters import export_class_report

    _require_teacher(current_user)
    svc = _get_service()

    exam = svc._paper_repo.find_by_id(exam_id)
    if not exam:
        raise HTTPException(404, "考試不存在")

    try:
        papers = svc.get_student_papers(exam_id)
        questions = svc._question_repo.find_by_exam(exam_id)
        stats_data = svc.get_statistics(exam_id)

        # 為每個學生附加每題得分
        all_answers = svc._student_answer_repo.find_by_exam_with_questions(exam_id)
        paper_answers: Dict = {}
        for ans in all_answers:
            sp_id = ans.get("student_paper_id") or ans.get("student_index")
            if sp_id not in paper_answers:
                paper_answers[sp_id] = {}
            paper_answers[sp_id][ans["question_id"]] = ans

        for p in papers:
            p["_answers_map"] = paper_answers.get(p["id"], {})

        xlsx = export_class_report(
            exam, papers, questions,
            stats_data.get("per_question_stats", []),
            stats_data,
        )
        from urllib.parse import quote
        title = exam.get("title", "exam")
        fname = f"{title}_class.xlsx"
        return Response(
            content=xlsx,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
        )
    except Exception as e:
        logger.error("匯出全班成績失敗 (exam=%d): %s", exam_id, e, exc_info=True)
        raise HTTPException(500, f"匯出失敗: {str(e)[:200]}")


@router.get("/students/{paper_id}/export")
async def export_student(
    paper_id: int,
    current_user: dict = Depends(get_current_user),
):
    """匯出單個學生報告 xlsx"""
    from fastapi.responses import Response
    from app.domains.exam_grader.exporters import export_student_report

    _require_teacher(current_user)
    svc = _get_service()

    paper = svc._student_paper_repo.find_by_id(paper_id)
    if not paper:
        raise HTTPException(404, "學生試卷不存在")

    exam = svc._paper_repo.find_by_id(paper["exam_id"])
    if not exam:
        raise HTTPException(404, "考試不存在")

    answers = svc.get_student_answers(paper_id)

    from urllib.parse import quote
    xlsx = export_student_report(exam, paper, answers)
    name = paper.get("student_name") or f"student_{paper_id}"
    fname = f"{name}_report.xlsx"
    return Response(
        content=xlsx,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(fname)}"},
    )
