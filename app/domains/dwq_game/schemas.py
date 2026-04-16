"""
大灣區大亨遊戲 Pydantic schemas

定義所有 REST 請求/響應 + WebSocket 訊息的資料形狀。
注意:**所有請求模型都不包含 user_id/player_id 欄位**,
身份永遠從 JWT 取得 (防作弊)。
"""
from typing import Any, Optional

from pydantic import BaseModel, Field

from . import constants as C


# ─────────────────────────────────────────────────────────
# REST 請求
# ─────────────────────────────────────────────────────────

class CreateRoomRequest(BaseModel):
    room_name: str = Field(min_length=1, max_length=40)
    max_players: int = Field(ge=C.MIN_PLAYERS, le=C.MAX_PLAYERS, default=4)
    is_public: bool = True


class JoinByCodeRequest(BaseModel):
    room_code: str = Field(min_length=4, max_length=12)


# ─────────────────────────────────────────────────────────
# REST 響應 (用 dict 即可,FastAPI 不強制 schema,簡化前後端對接)
# 此處保留 stub 以備未來文件化
# ─────────────────────────────────────────────────────────

# ─────────────────────────────────────────────────────────
# WebSocket 入站訊息 (Client → Server)
# ─────────────────────────────────────────────────────────

class WSInMessage(BaseModel):
    type: str
    payload: Optional[dict[str, Any]] = None
    req_id: Optional[str] = None


class ActionPayload(BaseModel):
    """action 訊息的 payload 結構 (僅用於文件化,實際運行用 dict)"""
    action: str
    data: Optional[dict[str, Any]] = None
