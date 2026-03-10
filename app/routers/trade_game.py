#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全球貿易大亨 API 路由
=====================
提供遊戲成績提交、查詢、管理的 RESTful 端點。

端點：
- POST   /api/trade-game/scores          - 學生提交成績（僅一次）
- GET    /api/trade-game/scores/check     - 檢查是否已遊玩
- GET    /api/trade-game/scores/leaderboard - 公開排行榜
- GET    /api/trade-game/scores/all       - 老師查詢全部成績
- PUT    /api/trade-game/scores/{id}      - 老師編輯成績
- DELETE /api/trade-game/scores/{id}      - 老師刪除記錄
- GET    /api/trade-game/scores/export    - 老師下載 CSV

認證：全部端點需要 JWT，管理端點需要 teacher/admin 角色。
"""

import asyncio
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.dependencies import get_current_user
from app.domains.trade_game.schemas import ScoreSubmitRequest, ScoreUpdateRequest
from app.services.container import get_services

logger = logging.getLogger(__name__)

# ==================================================================================
#                                   路由器
# ==================================================================================

trade_game_router = APIRouter(prefix="/api/trade-game", tags=["Trade Game"])

# 允許遊玩的班級（僅中三學生）
ALLOWED_CLASSES = {"3A", "3B", "3C", "3D", "3S"}


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
    """獲取 TradeGameService 實例"""
    return get_services().trade_game


def _require_teacher(user: Dict) -> None:
    """檢查是否為老師或管理員，否則拋出 403"""
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有老師和管理員可以執行此操作")


def _require_allowed_class(user: Dict) -> None:
    """檢查學生是否在允許的班級（中三），老師/管理員跳過"""
    if user["role"] in ("teacher", "admin"):
        return
    if user["class_name"] not in ALLOWED_CLASSES:
        raise HTTPException(
            403,
            f"只有中三學生（{', '.join(sorted(ALLOWED_CLASSES))}）可以遊玩此遊戲"
        )


# ==================================================================================
#                                   學生端點
# ==================================================================================

@trade_game_router.post("/scores")
async def submit_score(
    data: ScoreSubmitRequest,
    current_user: Dict = Depends(get_current_user),
):
    """
    提交遊戲成績

    允許多次遊玩，系統記錄每次成績，排行榜取最高分。
    僅限中三學生（3A/3B/3C/3D/3S），老師不受限制。
    """
    user = _extract_user(current_user)
    _require_allowed_class(user)
    loop = asyncio.get_event_loop()

    # 將 Pydantic 模型展開為扁平字典
    score_data = {
        "difficulty": data.difficulty.value,
        "player_spec": data.player_spec.value,
        "ai_spec": data.ai_spec.value,
        "result": data.result.value,
        "player_score": data.player_score,
        "ai_score": data.ai_score,
        "turns_played": data.turns_played,
        "final_money": data.final_money,
        "final_security": data.final_security,
        "final_inventory": data.final_inventory.model_dump(),
        "total_trades": data.stats.trades,
        "good_trades": data.stats.good_trades,
        "bad_trades": data.stats.bad_trades,
        "security_invests": data.stats.security_invests,
        "sanctions_used": data.stats.sanctions_used,
        "tips_read": data.stats.tips_read,
        "bankrupt_reason": data.stats.bankrupt_reason,
        "feedback_tags": data.feedback_tags,
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


@trade_game_router.get("/scores/check")
async def check_played(
    current_user: Dict = Depends(get_current_user),
):
    """
    檢查當前學生是否已遊玩過

    返回最佳成績記錄（含分數等），或 null 表示未遊玩。
    允許多次遊玩，此端點返回歷史最高分。
    """
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


@trade_game_router.get("/access")
async def check_access(
    current_user: Dict = Depends(get_current_user),
):
    """
    檢查當前用戶是否有權遊玩

    返回 allowed=true/false 和用戶班級信息。
    """
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

@trade_game_router.get("/scores/leaderboard")
async def get_leaderboard(
    difficulty: Optional[str] = Query(None, description="按難度篩選: EASY/NORMAL/HARD"),
    limit: int = Query(50, ge=1, le=200, description="返回條數"),
    current_user: Dict = Depends(get_current_user),
):
    """獲取公開排行榜"""
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None,
        lambda: _get_service().get_leaderboard(difficulty, limit),
    )

    return {"success": True, "data": data}


# ==================================================================================
#                                   老師管理端點
# ==================================================================================

@trade_game_router.get("/scores/all")
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


@trade_game_router.put("/scores/{score_id}")
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


@trade_game_router.delete("/scores/{score_id}")
async def delete_score(
    score_id: int,
    current_user: Dict = Depends(get_current_user),
):
    """老師刪除記錄（允許學生重新遊玩）"""
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


@trade_game_router.get("/scores/export")
async def export_scores(
    request: Request,
    class_name: Optional[str] = Query(None, description="按班級篩選"),
    token: Optional[str] = Query(None, description="JWT token (URL 參數傳遞)"),
    current_user: Dict = Depends(get_current_user),
):
    """
    老師下載成績 CSV 文件

    支持兩種認證方式：
    1. Authorization Header (標準)
    2. URL query 中的 token 參數 (用於 window.open 下載場景)
    """
    user = _extract_user(current_user)
    _require_teacher(user)

    loop = asyncio.get_event_loop()
    csv_bytes = await loop.run_in_executor(
        None,
        lambda: _get_service().export_scores_csv(class_name),
    )

    filename = "trade_game_scores"
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

def init_trade_game_system():
    """初始化全球貿易大亨系統（建表）"""
    _get_service().init_system()


__all__ = ["trade_game_router", "init_trade_game_system"]
