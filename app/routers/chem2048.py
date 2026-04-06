#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
化學 2048 API 路由
==================
提供遊戲成績提交、查詢、管理的 RESTful 端點。

端點：
- POST   /api/chem2048/scores            - 學生提交成績
- GET    /api/chem2048/scores/check       - 檢查是否已遊玩
- GET    /api/chem2048/scores/leaderboard - 公開排行榜
- GET    /api/chem2048/scores/all         - 老師查詢全部成績
- PUT    /api/chem2048/scores/{id}        - 老師編輯成績
- DELETE /api/chem2048/scores/{id}        - 老師刪除記錄
- GET    /api/chem2048/scores/export      - 老師下載 CSV

認證：全部端點需要 JWT，管理端點需要 teacher/admin 角色。
"""

import asyncio
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.domains.chem2048.schemas import Chem2048SubmitRequest, Chem2048UpdateRequest
from app.services.container import get_services

logger = logging.getLogger(__name__)

chem2048_router = APIRouter(prefix="/api/chem2048", tags=["Chemistry 2048"])

# 中三班級（排行榜分組用）
FORM3_CLASSES = {"3A", "3B", "3C", "3D", "3S"}


def _extract_user(current_user: Dict) -> Dict:
    """從 get_current_user 依賴中提取用戶信息"""
    return {
        "id": current_user.get("id", 0),
        "role": current_user.get("role", "guest"),
        "username": current_user.get("username", ""),
        "display_name": current_user.get("display_name", ""),
        "class_name": current_user.get("class_name", ""),
    }


def _get_service():
    """獲取 Chem2048Service 實例"""
    return get_services().chem2048


def _require_teacher(user: Dict) -> None:
    """檢查是否為老師或管理員"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有老師和管理員可以執行此操作")


def _is_form3(user: Dict) -> bool:
    """判斷用戶是否屬於中三班級"""
    return user.get("class_name", "") in FORM3_CLASSES


# ==================================================================================
#                                   學生端點
# ==================================================================================

@chem2048_router.post("/scores")
async def submit_score(
    data: Chem2048SubmitRequest,
    current_user: Dict = Depends(get_current_user),
):
    """
    提交遊戲成績

    允許多次遊玩，系統記錄每次成績，排行榜取最高分。
    開放給所有用戶遊玩。
    """
    user = _extract_user(current_user)
    loop = asyncio.get_event_loop()

    score_data = {
        "score": data.score,
        "highest_tile": data.highest_tile,
        "highest_element": data.highest_element,
        "highest_element_no": data.highest_element_no,
        "total_moves": data.total_moves,
        "tips_used": data.tips_used,
    }

    result = await loop.run_in_executor(
        None,
        lambda: _get_service().submit_score(
            student_id=user["id"],
            student_name=user["display_name"] or user["username"],
            class_name=user["class_name"],
            data=score_data,
        ),
    )
    return {"success": True, "message": "成績已記錄", "data": result}


@chem2048_router.get("/scores/check")
async def check_played(
    current_user: Dict = Depends(get_current_user),
):
    """檢查當前學生是否已遊玩過，返回歷史最高分"""
    user = _extract_user(current_user)
    loop = asyncio.get_event_loop()

    score = await loop.run_in_executor(
        None,
        lambda: _get_service().check_played(user["id"]),
    )

    return {
        "success": True,
        "data": {
            "played": score is not None,
            "score": score,
        },
    }


# ==================================================================================
#                                   公開端點
# ==================================================================================

@chem2048_router.get("/scores/leaderboard")
async def get_leaderboard(
    limit: int = Query(50, ge=1, le=200, description="返回條數"),
    group: Optional[str] = Query(None, description="分組: form3=中三, open=其他所有人"),
    current_user: Dict = Depends(get_current_user),
):
    """
    獲取公開排行榜

    group 參數：
    - form3: 僅中三學生 (3A/3B/3C/3D/3S)
    - open: 除中三以外的所有人
    - 不傳: 全部混合排行
    """
    loop = asyncio.get_event_loop()

    # 根據 group 篩選班級
    class_filter = None
    exclude_classes = None
    if group == "form3":
        class_filter = sorted(FORM3_CLASSES)
    elif group == "open":
        exclude_classes = sorted(FORM3_CLASSES)

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_leaderboard(
            limit,
            class_filter=class_filter,
            exclude_classes=exclude_classes,
        ),
    )

    return {"success": True, "data": data}


# ==================================================================================
#                                   老師管理端點
# ==================================================================================

@chem2048_router.get("/scores/all")
async def get_all_scores(
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    current_user: Dict = Depends(get_current_user),
):
    """老師查詢全部成績列表"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_all_scores(class_name),
    )

    return {"success": True, "data": data}


@chem2048_router.put("/scores/{score_id}")
async def update_score(
    score_id: int,
    data: Chem2048UpdateRequest,
    current_user: Dict = Depends(get_current_user),
):
    """老師編輯成績"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    update_data = data.model_dump(exclude_none=True)

    success = await loop.run_in_executor(
        None,
        lambda: _get_service().update_score(score_id, update_data),
    )

    if not success:
        raise HTTPException(404, "成績記錄不存在或無有效更新")

    return {"success": True, "message": "成績已更新"}


@chem2048_router.delete("/scores/{score_id}")
async def delete_score(
    score_id: int,
    current_user: Dict = Depends(get_current_user),
):
    """老師刪除記錄"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(
        None,
        lambda: _get_service().delete_score(score_id),
    )

    if not success:
        raise HTTPException(404, "成績記錄不存在")

    return {"success": True, "message": "記錄已刪除"}


@chem2048_router.get("/scores/export")
async def export_scores(
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    current_user: Dict = Depends(get_current_user),
):
    """老師下載成績 CSV 文件"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    csv_bytes = await loop.run_in_executor(
        None,
        lambda: _get_service().export_scores_csv(class_name),
    )

    filename = "chem2048_scores"
    if class_name:
        filename += f"_{class_name}"
    filename += ".csv"

    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-cache",
        },
    )


# ==================================================================================
#                                   初始化
# ==================================================================================

def init_chem2048_system():
    """初始化化學 2048 系統（建表）"""
    _get_service().init_system()


__all__ = ["chem2048_router", "init_chem2048_system"]
