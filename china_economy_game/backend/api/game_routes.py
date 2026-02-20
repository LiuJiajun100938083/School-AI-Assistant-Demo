"""
API - 游戏路由
只做参数校验，业务逻辑委托给 Application 层
"""
from fastapi import APIRouter, HTTPException
from .schemas import (
    MoveRequest, BuildFactoryRequest, UseTransportRequest,
    EndTurnRequest, ExecuteActionRequest, DrawEventRequest
)
from ..application import game_service

router = APIRouter(prefix="/game", tags=["游戏"])


# ==================== 游戏状态 ====================

@router.get("/{room_id}/state")
async def get_game_state(room_id: str):
    """获取完整游戏状态"""
    try:
        state = game_service.get_game_state(room_id)
        return {
            "success": True,
            "data": state
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/board")
async def get_board(room_id: str):
    """获取棋盘信息"""
    try:
        board = game_service.get_board(room_id)
        return {
            "success": True,
            "data": board
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/player/{player_id}")
async def get_player_info(room_id: str, player_id: str):
    """获取玩家信息"""
    try:
        info = game_service.get_player_info(room_id, player_id)
        return {
            "success": True,
            "data": info
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/player/{player_id}/actions")
async def get_available_actions(room_id: str, player_id: str):
    """获取玩家可执行的行动"""
    try:
        actions = game_service.get_available_actions(room_id, player_id)
        return {
            "success": True,
            "data": {"actions": actions}
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/turn")
async def get_turn_info(room_id: str):
    """获取当前回合信息"""
    try:
        info = game_service.get_current_turn_info(room_id)
        return {
            "success": True,
            "data": info
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 回合流程 ====================

@router.post("/{room_id}/turn/start")
async def start_new_round(room_id: str):
    """开始新回合"""
    try:
        result = game_service.start_new_round(room_id)
        return {
            "success": True,
            "message": "新回合开始",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/turn/draw-event")
async def draw_event_card(room_id: str, request: DrawEventRequest = None):
    """抽取事件卡"""
    try:
        result = game_service.draw_event_card(room_id)
        return {
            "success": True,
            "message": "事件卡已抽取",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/turn/end")
async def end_round(room_id: str):
    """结束当前回合（触发结算）"""
    try:
        result = game_service.end_round(room_id)
        return {
            "success": True,
            "message": "回合结算完成",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 玩家行动 ====================

@router.post("/{room_id}/action/move")
async def player_move(room_id: str, request: MoveRequest):
    """
    玩家移动

    消耗1行动力，移动1格（顺时针）
    """
    try:
        result = game_service.player_move(room_id, request.player_id, request.steps)
        return {
            "success": True,
            "message": "移动成功",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/action/build")
async def player_build_factory(room_id: str, request: BuildFactoryRequest):
    """
    玩家建厂

    消耗1行动力，在当前位置建立工厂
    """
    try:
        result = game_service.player_build_factory(
            room_id, request.player_id, request.industry_id
        )
        return {
            "success": True,
            "message": "工厂建设成功",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/action/transport")
async def player_use_transport(room_id: str, request: UseTransportRequest):
    """
    玩家使用运输系统

    消耗1行动力，通过运输网络移动到目的地
    """
    try:
        result = game_service.player_use_transport(
            room_id, request.player_id, request.destination_index
        )
        return {
            "success": True,
            "message": "运输成功",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/action/end-turn")
async def player_end_turn(room_id: str, request: EndTurnRequest):
    """玩家结束本回合行动"""
    try:
        result = game_service.player_end_turn(room_id, request.player_id)
        return {
            "success": True,
            "message": "回合结束",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{room_id}/action/execute")
async def execute_action(room_id: str, request: ExecuteActionRequest):
    """
    执行行动（通用接口）

    支持的行动类型：
    - MOVE: 移动
    - BUILD_FACTORY: 建厂
    - USE_TRANSPORT: 使用运输
    """
    try:
        action = {
            "type": request.action_type,
            "params": request.params
        }
        result = game_service.execute_action(room_id, request.player_id, action)
        return {
            "success": True,
            "message": "行动执行成功",
            "data": result
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 游戏信息 ====================

@router.get("/{room_id}/industries")
async def get_industries_info(room_id: str):
    """获取产业信息（当前阶段可用的产业）"""
    try:
        info = game_service.get_industries_info(room_id)
        return {
            "success": True,
            "data": info
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/events")
async def get_active_events(room_id: str):
    """获取活跃的事件效果"""
    try:
        events = game_service.get_active_events(room_id)
        return {
            "success": True,
            "data": events
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{room_id}/leaderboard")
async def get_leaderboard(room_id: str):
    """获取玩家排行榜"""
    try:
        leaderboard = game_service.get_leaderboard(room_id)
        return {
            "success": True,
            "data": {"leaderboard": leaderboard}
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
