"""
協作佈告板 — API Router（薄層）
===================================
所有 handler 僅做：參數綁定 / auth 取用 / 呼 service / 包 response。
零 try/except — 由全域錯誤中介統一處理 AppException。
"""

import asyncio
import json
import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Depends, File, Query, UploadFile, WebSocket, WebSocketDisconnect

from app.core.dependencies import get_current_user, get_jwt_manager
from app.domains.collab_board.schemas import (
    BoardCreate,
    BoardUpdate,
    CommentCreate,
    PostCreate,
    PostMove,
    PostUpdate,
    ReactionToggle,
    SectionCreate,
    SectionUpdate,
)
from app.infrastructure.database.pool import get_database_pool
from app.services.container import get_services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/boards", tags=["協作佈告板"])


def _svc():
    return get_services().collab_board


def _ok(data: Any = None, message: str = "") -> Dict[str, Any]:
    return {"success": True, "data": data, "message": message}


# ============================================================
# Board
# ============================================================

@router.post("")
async def create_board(data: BoardCreate, user: Dict = Depends(get_current_user)):
    board = await asyncio.get_event_loop().run_in_executor(None, _svc().create_board, user, data)
    return _ok(board, "佈告板已建立")


@router.get("")
async def list_boards(
    include_archived: bool = Query(False),
    user: Dict = Depends(get_current_user),
):
    boards = await asyncio.get_event_loop().run_in_executor(
        None, _svc().list_boards, user, include_archived
    )
    return _ok(boards)


@router.get("/{board_uuid}")
async def get_board(board_uuid: str, user: Dict = Depends(get_current_user)):
    detail = await asyncio.get_event_loop().run_in_executor(
        None, _svc().get_board_detail, user, board_uuid
    )
    return _ok(detail)


@router.put("/{board_uuid}")
async def update_board(
    board_uuid: str, data: BoardUpdate, user: Dict = Depends(get_current_user)
):
    board = await asyncio.get_event_loop().run_in_executor(
        None, _svc().update_board, user, board_uuid, data
    )
    return _ok(board, "佈告板已更新")


@router.delete("/{board_uuid}")
async def archive_board(board_uuid: str, user: Dict = Depends(get_current_user)):
    await asyncio.get_event_loop().run_in_executor(
        None, _svc().archive_board, user, board_uuid
    )
    return _ok(message="佈告板已歸檔")


# ============================================================
# Section
# ============================================================

@router.post("/{board_uuid}/sections")
async def create_section(
    board_uuid: str, data: SectionCreate, user: Dict = Depends(get_current_user)
):
    section = await asyncio.get_event_loop().run_in_executor(
        None, _svc().create_section, user, board_uuid, data
    )
    return _ok(section)


@router.patch("/{board_uuid}/sections/{section_id}")
async def update_section(
    board_uuid: str,
    section_id: int,
    data: SectionUpdate,
    user: Dict = Depends(get_current_user),
):
    section = await asyncio.get_event_loop().run_in_executor(
        None, _svc().update_section, user, board_uuid, section_id, data
    )
    return _ok(section)


@router.delete("/{board_uuid}/sections/{section_id}")
async def delete_section(
    board_uuid: str, section_id: int, user: Dict = Depends(get_current_user)
):
    await asyncio.get_event_loop().run_in_executor(
        None, _svc().delete_section, user, board_uuid, section_id
    )
    return _ok(message="分欄已刪除")


# ============================================================
# Post
# ============================================================

@router.post("/{board_uuid}/posts")
async def create_post(
    board_uuid: str, data: PostCreate, user: Dict = Depends(get_current_user)
):
    post = await asyncio.get_event_loop().run_in_executor(
        None, _svc().create_post, user, board_uuid, data
    )
    return _ok(post, "貼文已發布")


@router.patch("/{board_uuid}/posts/{post_id}")
async def update_post(
    board_uuid: str, post_id: int, data: PostUpdate, user: Dict = Depends(get_current_user)
):
    post = await asyncio.get_event_loop().run_in_executor(
        None, _svc().update_post, user, board_uuid, post_id, data
    )
    return _ok(post)


@router.post("/{board_uuid}/posts/{post_id}/move")
async def move_post(
    board_uuid: str, post_id: int, data: PostMove, user: Dict = Depends(get_current_user)
):
    post = await asyncio.get_event_loop().run_in_executor(
        None, _svc().move_post, user, board_uuid, post_id, data
    )
    return _ok(post)


@router.delete("/{board_uuid}/posts/{post_id}")
async def delete_post(
    board_uuid: str, post_id: int, user: Dict = Depends(get_current_user)
):
    await asyncio.get_event_loop().run_in_executor(
        None, _svc().delete_post, user, board_uuid, post_id
    )
    return _ok(message="貼文已刪除")


@router.post("/{board_uuid}/posts/{post_id}/state")
async def transition_post_state(
    board_uuid: str,
    post_id: int,
    event: str = Body(..., embed=True),
    user: Dict = Depends(get_current_user),
):
    post = await asyncio.get_event_loop().run_in_executor(
        None, _svc().transition_post_state, user, board_uuid, post_id, event
    )
    return _ok(post)


@router.post("/{board_uuid}/posts/{post_id}/reaction")
async def toggle_reaction(
    board_uuid: str,
    post_id: int,
    data: ReactionToggle = Body(default_factory=ReactionToggle),
    user: Dict = Depends(get_current_user),
):
    result = await asyncio.get_event_loop().run_in_executor(
        None, _svc().toggle_reaction, user, board_uuid, post_id, data.kind
    )
    return _ok(result)


@router.post("/{board_uuid}/posts/{post_id}/comments")
async def add_comment(
    board_uuid: str,
    post_id: int,
    data: CommentCreate,
    user: Dict = Depends(get_current_user),
):
    comment = await asyncio.get_event_loop().run_in_executor(
        None, _svc().add_comment, user, board_uuid, post_id, data
    )
    return _ok(comment)


@router.delete("/{board_uuid}/posts/{post_id}/comments/{comment_id}")
async def delete_comment(
    board_uuid: str,
    post_id: int,
    comment_id: int,
    user: Dict = Depends(get_current_user),
):
    await asyncio.get_event_loop().run_in_executor(
        None, _svc().delete_comment, user, board_uuid, post_id, comment_id
    )
    return _ok(message="評論已刪除")


# ============================================================
# File upload
# ============================================================

@router.post("/{board_uuid}/uploads")
async def upload_file(
    board_uuid: str,
    file: UploadFile = File(...),
    user: Dict = Depends(get_current_user),
):
    result = await _svc().upload_file(user, board_uuid, file)
    return _ok(result)


# ============================================================
# WebSocket
# ============================================================

@router.websocket("/{board_uuid}/ws")
async def board_ws(websocket: WebSocket, board_uuid: str, token: Optional[str] = None):
    """
    WebSocket 訂閱板即時事件。
    認證: 首個 query param `?token=<jwt>` 或首條訊息 {type:'auth', token}
    """
    await websocket.accept()

    # --- Auth ---
    if not token:
        try:
            first = await asyncio.wait_for(websocket.receive_json(), timeout=5.0)
            if first.get("type") == "auth":
                token = first.get("token")
        except Exception:
            await websocket.close(code=1008, reason="Auth timeout")
            return

    try:
        from app.core.dependencies import _jwt_manager as _global_jwt
        if _global_jwt is None:
            from app.config.settings import get_settings
            from app.core.dependencies import init_jwt_manager
            init_jwt_manager(get_settings())
            from app.core.dependencies import _jwt_manager as _global_jwt  # noqa
        from app.core import dependencies as _deps
        payload = _deps._jwt_manager.decode_token(token or "")
        username = payload.get("username")
    except Exception as e:
        logger.warning("WS auth failed: %s", e)
        await websocket.close(code=1008, reason="Invalid token")
        return

    loop = asyncio.get_event_loop()
    user_row = await loop.run_in_executor(
        None,
        get_database_pool().execute_one,
        "SELECT id, username, role, class_name FROM users WHERE username=%s",
        (username,),
    )
    if not user_row:
        await websocket.close(code=1008, reason="Unknown user")
        return

    # --- Permission check: can_view ---
    from app.domains.collab_board import policy as cb_policy
    board = await loop.run_in_executor(
        None,
        lambda: _svc()._repo.get_board_by_uuid(board_uuid),  # noqa: SLF001
    )
    if board is None or not cb_policy.can_view(board, user_row):
        await websocket.close(code=1008, reason="Forbidden")
        return

    # --- Subscribe ---
    broadcaster = _svc().broadcaster
    await broadcaster.connect(board_uuid, websocket, user_row)
    try:
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong"})
                continue
            # 處理客戶端 inbound 事件（拖拽過程實時廣播，不落盤）
            try:
                ev = json.loads(msg)
            except Exception:
                continue
            if not isinstance(ev, dict):
                continue
            if ev.get("type") == "post.dragging":
                payload = ev.get("payload") or {}
                payload["by"] = user_row.get("id")
                await broadcaster.publish(
                    board_uuid,
                    {"type": "post.dragging", "payload": payload},
                )
    except WebSocketDisconnect:
        pass
    finally:
        await broadcaster.disconnect(board_uuid, websocket)
