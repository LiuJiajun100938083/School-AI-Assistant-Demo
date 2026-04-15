"""
我的考試成績 — API 路由
========================
學生查看自己的已發放考試結果。
所有端點僅按 user_id 過濾數據，不做角色限制。
"""

import logging

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.core.responses import success_response, error_response
from app.core.exceptions import AppException

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/my-exams", tags=["my-exams"])


def _get_service():
    from app.services.container import get_services
    return get_services().my_exams


# ── 列表：學生所有已發放考試 ──

@router.get("")
async def list_my_exams(current_user: dict = Depends(get_current_user)):
    """查詢當前用戶所有已發放的考試結果"""
    svc = _get_service()
    exams = svc.list_exams(current_user["id"])
    return success_response(exams)


# ── 詳情：某場考試的完整結果 ──

@router.get("/{exam_id}")
async def get_exam_detail(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    """查詢某場考試的試卷 + 答題詳情"""
    svc = _get_service()
    try:
        detail = svc.get_detail(current_user["id"], exam_id)
        return success_response(detail)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)


# ── AI 個人分析 ──

@router.post("/{exam_id}/ai-analysis")
async def generate_ai_analysis(
    exam_id: int,
    current_user: dict = Depends(get_current_user),
):
    """AI 生成個人考試表現分析"""
    svc = _get_service()
    try:
        analysis = await svc.generate_analysis(current_user["id"], exam_id)
        return success_response({"analysis": analysis})
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("AI 個人分析失敗 (exam=%d): %s", exam_id, e, exc_info=True)
        raise HTTPException(500, f"AI 分析失敗: {str(e)[:200]}")
