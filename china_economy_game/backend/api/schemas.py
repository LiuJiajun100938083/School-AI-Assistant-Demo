"""
API - 请求/响应模型
只做参数校验，不包含业务逻辑
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


# ==================== 通用响应 ====================

class BaseResponse(BaseModel):
    """基础响应"""
    success: bool = True
    message: str = ""
    data: Optional[Any] = None


class ErrorResponse(BaseModel):
    """错误响应"""
    success: bool = False
    error: str
    detail: Optional[str] = None


# ==================== 大厅相关 ====================

class CreateRoomRequest(BaseModel):
    """创建房间请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    player_name: str = Field(..., min_length=1, max_length=20, description="玩家名称")
    max_players: int = Field(default=4, ge=2, le=4, description="最大玩家数")


class JoinRoomRequest(BaseModel):
    """加入房间请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    player_name: str = Field(..., min_length=1, max_length=20, description="玩家名称")


class LeaveRoomRequest(BaseModel):
    """离开房间请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")


class StartGameRequest(BaseModel):
    """开始游戏请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID（必须是房主）")


# ==================== 游戏行动相关 ====================

class MoveRequest(BaseModel):
    """移动请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    steps: int = Field(default=1, ge=1, le=1, description="移动步数（固定为1）")


class BuildFactoryRequest(BaseModel):
    """建厂请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    industry_id: str = Field(..., min_length=1, description="产业ID")


class UseTransportRequest(BaseModel):
    """使用运输请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    destination_index: int = Field(..., ge=0, description="目的地格子索引")


class EndTurnRequest(BaseModel):
    """结束回合请求"""
    player_id: str = Field(..., min_length=1, description="玩家ID")


class ExecuteActionRequest(BaseModel):
    """执行行动请求（通用）"""
    player_id: str = Field(..., min_length=1, description="玩家ID")
    action_type: str = Field(..., description="行动类型: MOVE, BUILD_FACTORY, USE_TRANSPORT")
    params: Dict[str, Any] = Field(default_factory=dict, description="行动参数")


# ==================== 回合相关 ====================

class DrawEventRequest(BaseModel):
    """抽取事件卡请求（可选玩家ID用于验证）"""
    player_id: Optional[str] = None


# ==================== 响应模型 ====================

class RoomResponse(BaseModel):
    """房间响应"""
    room_id: str
    host_player_id: str
    players: List[str]
    player_names: Dict[str, str]
    player_count: int
    max_players: int
    min_players: int
    status: str
    can_start: bool
    can_join: bool


class RoomListResponse(BaseModel):
    """房间列表响应"""
    rooms: List[RoomResponse]
    total: int


class PlayerResponse(BaseModel):
    """玩家响应"""
    player_id: str
    name: str
    money: int
    position: int
    action_points: int
    has_advanced_human: bool
    factory_count: int


class GameStateResponse(BaseModel):
    """游戏状态响应"""
    game_id: str
    is_started: bool
    is_finished: bool
    winner_id: Optional[str]
    players: Dict[str, Any]
    factories: Dict[str, Any]
    board: Dict[str, Any]
    stage: Dict[str, Any]
    turn: Dict[str, Any]
    event_deck: Dict[str, Any]
