#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
神州菜園經營家 API 路由
=====================
提供遊戲成績提交、查詢、管理的 RESTful 端點。

端點：
- POST   /api/farm-game/scores          - 學生提交成績
- GET    /api/farm-game/scores/check     - 檢查是否已遊玩
- GET    /api/farm-game/access           - 檢查遊玩權限
- GET    /api/farm-game/scores/leaderboard - 公開排行榜
- GET    /api/farm-game/scores/all       - 老師查詢全部成績
- PUT    /api/farm-game/scores/{id}      - 老師編輯成績
- DELETE /api/farm-game/scores/{id}      - 老師刪除記錄
- GET    /api/farm-game/scores/export    - 老師下載 CSV
"""

import asyncio
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.domains.farm_game.schemas import ScoreSubmitRequest, ScoreUpdateRequest
from app.services.container import get_services

logger = logging.getLogger(__name__)

farm_game_router = APIRouter(prefix="/api/farm-game", tags=["Farm Game"])

ALLOWED_CLASSES = {"2A", "2B", "2C", "2D", "2S"}


def _extract_user(current_user: Dict) -> Dict:
    return {
        "id": current_user.get("id", 0),
        "role": current_user.get("role", "guest"),
        "username": current_user.get("username", ""),
        "display_name": current_user.get("display_name", ""),
        "class_name": current_user.get("class_name", ""),
    }


def _get_service():
    return get_services().farm_game


def _require_teacher(user: Dict) -> None:
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有老師和管理員可以執行此操作")


def _require_allowed_class(user: Dict) -> None:
    if user["role"] in ("teacher", "admin"):
        return
    if user["class_name"] not in ALLOWED_CLASSES:
        raise HTTPException(
            403,
            f"只有中二學生（{', '.join(sorted(ALLOWED_CLASSES))}）可以遊玩此遊戲"
        )


# ==================================================================================
#                                   學生端點
# ==================================================================================

@farm_game_router.post("/scores")
async def submit_score(
    data: ScoreSubmitRequest,
    current_user: Dict = Depends(get_current_user),
):
    """提交遊戲成績（每位學生只能遊玩一次）"""
    user = _extract_user(current_user)
    _require_allowed_class(user)
    loop = asyncio.get_event_loop()
    is_teacher = user["role"] in ("teacher", "admin")

    # 學生只能遊玩一次（老師不受限制，用於測試）
    if not is_teacher:
        has_played = await loop.run_in_executor(
            None, lambda: _get_service().has_played(user["id"])
        )
        if has_played:
            raise HTTPException(409, "你已經遊玩過了，每位學生只能遊玩一次")

    score_data = {
        "result": data.result.value,
        "score": data.score,
        "final_money": data.final_money,
        "final_tech": data.final_tech,
        "final_land": data.final_land,
        "turns_played": data.turns_played,
        "reserve_policy": data.reserve_policy,
        "feedback_tags": data.feedback_tags,
    }

    try:
        result = await loop.run_in_executor(
            None,
            lambda: _get_service().submit_score(
                student_id=user["id"],
                student_name=user["display_name"] or user["username"],
                class_name=user["class_name"],
                data=score_data,
                bypass_limit=is_teacher,
            ),
        )
    except ValueError as e:
        if "already_played" in str(e):
            raise HTTPException(409, "你已經遊玩過了，每位學生只能遊玩一次")
        raise

    return {"success": True, "message": "成績已記錄", "data": result}


@farm_game_router.get("/scores/check")
async def check_played(
    current_user: Dict = Depends(get_current_user),
):
    """檢查當前學生是否已遊玩過"""
    user = _extract_user(current_user)
    _require_allowed_class(user)
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


@farm_game_router.get("/access")
async def check_access(
    current_user: Dict = Depends(get_current_user),
):
    """檢查當前用戶是否有權遊玩"""
    user = _extract_user(current_user)
    is_teacher = user["role"] in ("teacher", "admin")
    allowed = is_teacher or user["class_name"] in ALLOWED_CLASSES

    return {
        "success": True,
        "data": {
            "allowed": allowed,
            "is_teacher": is_teacher,
            "class_name": user["class_name"],
            "allowed_classes": sorted(ALLOWED_CLASSES),
        },
    }


# ==================================================================================
#                                   公開端點
# ==================================================================================

@farm_game_router.get("/scores/leaderboard")
async def get_leaderboard(
    limit: int = Query(50, ge=1, le=200, description="返回條數"),
    current_user: Dict = Depends(get_current_user),
):
    """獲取公開排行榜"""
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_leaderboard(limit),
    )

    return {"success": True, "data": data}


# ==================================================================================
#                                   老師管理端點
# ==================================================================================

@farm_game_router.get("/scores/all")
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


@farm_game_router.put("/scores/{score_id}")
async def update_score(
    score_id: int,
    data: ScoreUpdateRequest,
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


@farm_game_router.delete("/scores/batch")
async def batch_delete_scores(
    class_name: str = Query(..., description="要刪除的班級"),
    current_user: Dict = Depends(get_current_user),
):
    """老師按班級批量刪除成績"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    deleted = await loop.run_in_executor(
        None, lambda: _get_service().delete_scores_by_class(class_name)
    )

    return {
        "success": True,
        "message": f"已刪除 {class_name} 的 {deleted} 條記錄",
        "deleted": deleted,
    }


@farm_game_router.delete("/scores/{score_id}")
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

    return {"success": True, "message": "記錄已刪除，學生可重新遊玩"}


@farm_game_router.get("/scores/export")
async def export_scores(
    request: Request,
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    token: Optional[str] = Query(None, description="JWT token"),
    current_user: Dict = Depends(get_current_user),
):
    """老師下載成績 CSV"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    csv_bytes = await loop.run_in_executor(
        None,
        lambda: _get_service().export_scores_csv(class_name),
    )

    filename = "farm_game_scores"
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

def init_farm_game_system():
    """初始化神州菜園經營家系統（建表）"""
    _get_service().init_system()


__all__ = ["farm_game_router", "init_farm_game_system"]
