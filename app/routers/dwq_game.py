"""
大灣區大亨遊戲 — 路由層

REST endpoints (lobby/room 管理) + WebSocket endpoint (即時遊戲)
所有 endpoints 強制 JWT 認證,user_id 從 JWT payload 取得 (絕不信任 request body)。
"""
from __future__ import annotations

import asyncio
import logging
from typing import Dict, Optional

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)

from app.core.dependencies import get_current_user
from app.domains.dwq_game.exceptions import DwqGameError
from app.domains.dwq_game.schemas import (
    CreateRoomRequest,
    JoinByCodeRequest,
)
from app.domains.dwq_game.service import get_dwq_service
from app.infrastructure.database import get_database_pool

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/dwq_game",
    tags=["大灣區大亨"],
)


def _svc():
    return get_dwq_service()


def _handle_dwq_error(e: DwqGameError) -> HTTPException:
    """將領域例外轉為 HTTP 例外"""
    status_map = {
        "room_not_found": 404,
        "player_not_found": 404,
        "not_in_room": 404,
        "room_full": 409,
        "room_already_started": 409,
        "already_in_room": 409,
        "not_host": 403,
        "ws_auth_failed": 401,
    }
    status = status_map.get(e.code, 400)
    return HTTPException(status_code=status, detail={"code": e.code, "message": e.message})


# ═════════════════════════════════════════════════════════
# REST: Lobby / Room
# ═════════════════════════════════════════════════════════

@router.get("/rooms")
async def list_rooms(user: Dict = Depends(get_current_user)):
    """列出公開且等待中的房間 (大廳)"""
    rooms = await _svc().list_public_rooms()
    return {"success": True, "data": {"rooms": rooms}}


@router.post("/rooms")
async def create_room(
    req: CreateRoomRequest,
    user: Dict = Depends(get_current_user),
):
    """建立新房間"""
    try:
        data = await _svc().create_room(
            user=user,
            room_name=req.room_name,
            max_players=req.max_players,
            is_public=req.is_public,
        )
    except DwqGameError as e:
        raise _handle_dwq_error(e)
    return {"success": True, "data": data}


@router.get("/rooms/{code}")
async def get_room(code: str, user: Dict = Depends(get_current_user)):
    """獲取房間詳情"""
    try:
        data = await _svc().get_room(code.upper().strip())
    except DwqGameError as e:
        raise _handle_dwq_error(e)
    return {"success": True, "data": data}


@router.post("/rooms/{code}/join")
async def join_room(code: str, user: Dict = Depends(get_current_user)):
    """加入房間 (按房間碼或從大廳列表)"""
    try:
        data = await _svc().join_room(code.upper().strip(), user)
    except DwqGameError as e:
        raise _handle_dwq_error(e)
    return {"success": True, "data": data}


@router.post("/join_by_code")
async def join_by_code(
    req: JoinByCodeRequest,
    user: Dict = Depends(get_current_user),
):
    """通過房間碼加入私人房間"""
    try:
        data = await _svc().join_by_code(req.room_code, user)
    except DwqGameError as e:
        raise _handle_dwq_error(e)
    return {"success": True, "data": data}


@router.post("/rooms/{code}/leave")
async def leave_room(code: str, user: Dict = Depends(get_current_user)):
    """離開房間 (主動退出)"""
    try:
        data = await _svc().leave_room(code.upper().strip(), user)
    except DwqGameError as e:
        raise _handle_dwq_error(e)
    return {"success": True, "data": data}


@router.get("/me/active_room")
async def get_active_room(user: Dict = Depends(get_current_user)):
    """獲取當前用戶所在的房間 (用於頁面重新整理後重連)"""
    data = await _svc().get_active_room(user)
    return {"success": True, "data": data}


# ═════════════════════════════════════════════════════════
# WebSocket: 即時遊戲
# ═════════════════════════════════════════════════════════

@router.websocket("/ws/{room_code}")
async def game_ws(
    websocket: WebSocket,
    room_code: str,
    token: Optional[str] = Query(default=None),
):
    """大灣區大亨遊戲 WebSocket 端點

    認證流程 (與 collab_board 一致):
        1. 優先從 query string 取 token
        2. 若無,接收第一條訊息 {type:'auth', token:'...'}
        3. JWT 驗證,從 payload 取得 username,查 DB 取 user.id
        4. 通過則 register 到 ws_manager 並開始訊息循環
    """
    await websocket.accept()

    # ── Auth ──
    if not token:
        try:
            first = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            if first.get("type") == "auth":
                token = first.get("token")
        except Exception:
            await websocket.close(code=1008, reason="Auth timeout")
            return

    try:
        from app.core import dependencies as _deps
        if _deps._jwt_manager is None:
            from app.config.settings import get_settings
            from app.core.dependencies import init_jwt_manager
            init_jwt_manager(get_settings())
        payload = _deps._jwt_manager.decode_token(token or "")
        username = payload.get("username")
    except Exception as e:
        logger.warning("[DWQ-WS] auth failed: %s", e)
        await websocket.close(code=1008, reason="Invalid token")
        return

    # 查 DB 取 user.id
    loop = asyncio.get_event_loop()
    user_row = await loop.run_in_executor(
        None,
        get_database_pool().execute_one,
        "SELECT id, username, role FROM users WHERE username=%s",
        (username,),
    )
    if not user_row:
        await websocket.close(code=1008, reason="Unknown user")
        return

    user_dict = {
        "id": user_row["id"],
        "username": user_row["username"],
        "display_name": user_row["username"],
        "role": user_row.get("role", "student"),
    }
    code = room_code.upper().strip()

    # ── 連線到房間 ──
    svc = _svc()
    ok = await svc.handle_ws_connect(code, user_dict, websocket)
    if not ok:
        return

    # ── 訊息循環 ──
    try:
        while True:
            msg = await websocket.receive_json()
            if not isinstance(msg, dict):
                continue
            await svc.handle_ws_message(code, user_dict["id"], msg)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("[DWQ-WS] 訊息處理異常 user=%s: %s", username, e)
    finally:
        await svc.handle_ws_disconnect(code, user_dict["id"])
