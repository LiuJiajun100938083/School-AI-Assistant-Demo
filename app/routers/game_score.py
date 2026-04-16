#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自定義遊戲計分 API 路由
========================
提供通用遊戲計分、排行榜、設定管理的 RESTful 端點。

端點：
- POST   /api/game-scores/{uuid}/submit       - 學生提交分數
- GET    /api/game-scores/{uuid}/leaderboard   - 公開排行榜
- GET    /api/game-scores/{uuid}/my-scores     - 學生查詢自己的歷史成績
- GET    /api/game-scores/{uuid}/settings      - 讀取計分設定
- PUT    /api/game-scores/{uuid}/settings      - 老師修改計分設定
- GET    /api/game-scores/{uuid}/all           - 老師查詢全部成績
- GET    /api/game-scores/{uuid}/export        - 老師下載 CSV
- DELETE /api/game-scores/{uuid}/scores/{id}   - 老師刪除記錄
"""

import asyncio
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.dependencies import get_current_user
from app.domains.game_score.schemas import ScoreSettingsRequest, ScoreSubmitRequest
from app.services.container import get_services

logger = logging.getLogger(__name__)

game_score_router = APIRouter(prefix="/api/game-scores", tags=["Game Scores"])


def _extract_user(current_user: Dict) -> Dict:
    return {
        "id": current_user.get("id", 0),
        "role": current_user.get("role", "guest"),
        "username": current_user.get("username", ""),
        "display_name": current_user.get("display_name", ""),
        "class_name": current_user.get("class_name", ""),
    }


def _get_service():
    return get_services().game_score


def _require_teacher(user: Dict) -> None:
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有老師和管理員可以執行此操作")


# ==================================================================================
#                                   學生端點
# ==================================================================================


@game_score_router.post("/{game_uuid}/submit")
async def submit_score(
    game_uuid: str,
    data: ScoreSubmitRequest,
    current_user: Dict = Depends(get_current_user),
):
    """提交遊戲分數（自動按設定檢查次數限制）"""
    user = _extract_user(current_user)
    loop = asyncio.get_event_loop()

    result = await loop.run_in_executor(
        None,
        lambda: _get_service().submit_score(
            game_uuid=game_uuid,
            student_id=user["id"],
            student_name=user["display_name"] or user["username"],
            class_name=user["class_name"],
            score=data.score,
            extra_data=data.extra_data,
        ),
    )

    return {"success": True, "message": result["message"], "data": result}


@game_score_router.get("/{game_uuid}/my-scores")
async def get_my_scores(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """查詢當前學生在指定遊戲的歷史成績"""
    user = _extract_user(current_user)
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_student_scores(game_uuid, user["id"]),
    )

    return {"success": True, "data": data}


# ==================================================================================
#                                   公開端點
# ==================================================================================


@game_score_router.get("/{game_uuid}/leaderboard")
async def get_leaderboard(
    game_uuid: str,
    limit: int = Query(10, ge=1, le=100, description="返回條數"),
):
    """獲取公開排行榜（按遊戲設定的取分策略）"""
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_leaderboard(game_uuid, limit),
    )

    return {"success": True, "data": data}


@game_score_router.get("/{game_uuid}/settings")
async def get_settings(game_uuid: str):
    """讀取遊戲計分設定（公開，前端用於顯示提示）"""
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_settings(game_uuid),
    )

    return {"success": True, "data": data}


# ==================================================================================
#                                   老師管理端點
# ==================================================================================


@game_score_router.put("/{game_uuid}/settings")
async def update_settings(
    game_uuid: str,
    data: ScoreSettingsRequest,
    current_user: Dict = Depends(get_current_user),
):
    """老師修改遊戲計分設定"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    update_data = data.model_dump(exclude_none=True)

    result = await loop.run_in_executor(
        None,
        lambda: _get_service().update_settings(
            game_uuid, update_data, updated_by=user["id"]
        ),
    )

    return {"success": True, "message": "設定已更新", "data": result}


@game_score_router.get("/{game_uuid}/all")
async def get_all_scores(
    game_uuid: str,
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    current_user: Dict = Depends(get_current_user),
):
    """老師查詢全部成績"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_all_scores(game_uuid, class_name),
    )

    return {"success": True, "data": data}


@game_score_router.get("/{game_uuid}/export")
async def export_scores(
    game_uuid: str,
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    current_user: Dict = Depends(get_current_user),
):
    """老師下載成績 CSV"""
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    csv_bytes = await loop.run_in_executor(
        None,
        lambda: _get_service().export_scores_csv(game_uuid, class_name),
    )

    filename = f"game_scores_{game_uuid[:8]}"
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


@game_score_router.delete("/{game_uuid}/scores/{score_id}")
async def delete_score(
    game_uuid: str,
    score_id: int,
    current_user: Dict = Depends(get_current_user),
):
    """老師刪除單條成績記錄"""
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


# ==================================================================================
#                                   初始化
# ==================================================================================


def init_game_score_system():
    """初始化自定義遊戲計分系統（建表）"""
    _get_service().init_system()


__all__ = ["game_score_router", "init_game_score_system"]
