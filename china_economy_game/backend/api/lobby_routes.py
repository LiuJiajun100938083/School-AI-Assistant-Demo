"""
API - 大厅路由
只做参数校验，业务逻辑委托给 Application 层
"""
from fastapi import APIRouter, HTTPException
from .schemas import (
    CreateRoomRequest, JoinRoomRequest, LeaveRoomRequest, StartGameRequest,
    BaseResponse, ErrorResponse
)
from ..application import lobby_service

router = APIRouter(prefix="/lobby", tags=["大厅"])


@router.get("/rooms")
async def get_rooms(waiting_only: bool = False):
    """
    获取房间列表

    参数：
    - waiting_only: 是否只返回等待中的房间
    """
    try:
        if waiting_only:
            rooms = lobby_service.get_waiting_rooms()
        else:
            rooms = lobby_service.get_all_rooms()
        return {
            "success": True,
            "data": {
                "rooms": rooms,
                "total": len(rooms)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rooms")
async def create_room(request: CreateRoomRequest):
    """
    创建房间

    规则：
    - 创建者自动成为房主
    - 创建者自动加入房间
    """
    try:
        room = lobby_service.create_room(
            request.player_id,
            request.player_name,
            request.max_players
        )
        return {
            "success": True,
            "message": "房间创建成功",
            "data": room
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rooms/{room_id}")
async def get_room(room_id: str):
    """获取房间详情"""
    try:
        room = lobby_service.get_room(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="房间不存在")
        return {
            "success": True,
            "data": room
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rooms/{room_id}/join")
async def join_room(room_id: str, request: JoinRoomRequest):
    """
    加入房间

    规则：
    - 仅允许加入 WAITING 状态的房间
    - 玩家人数不能超过 max_players
    """
    try:
        room = lobby_service.join_room(room_id, request.player_id, request.player_name)
        return {
            "success": True,
            "message": "成功加入房间",
            "data": room
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rooms/{room_id}/leave")
async def leave_room(room_id: str, request: LeaveRoomRequest):
    """
    离开房间

    规则：
    - 如果房主离开，房间解散
    - 游戏进行中不能离开
    """
    try:
        room = lobby_service.leave_room(room_id, request.player_id)
        if room:
            return {
                "success": True,
                "message": "已离开房间",
                "data": room
            }
        else:
            return {
                "success": True,
                "message": "房间已解散",
                "data": None
            }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rooms/{room_id}/start")
async def start_game(room_id: str, request: StartGameRequest):
    """
    开始游戏

    规则：
    - 仅房主可以开始
    - 玩家人数 >= 最少人数（2人）
    """
    try:
        result = lobby_service.start_game(room_id, request.player_id)
        return {
            "success": True,
            "message": "游戏开始！",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_lobby_stats():
    """获取大厅统计信息"""
    try:
        stats = lobby_service.get_lobby_stats()
        return {
            "success": True,
            "data": stats
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/player/{player_id}/room")
async def get_player_room(player_id: str):
    """获取玩家所在的房间"""
    try:
        room = lobby_service.get_player_room(player_id)
        if not room:
            return {
                "success": True,
                "message": "玩家不在任何房间中",
                "data": None
            }
        return {
            "success": True,
            "data": room
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
