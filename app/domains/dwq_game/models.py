"""
大灣區大亨遊戲域資料模型 (純資料類,無 I/O)

設計原則:
    - dataclass 純資料,無業務邏輯 (邏輯放 engine.py)
    - 所有 mutation 由 engine 函數執行,model 不自我修改
    - 使用 user_id (int) 作為玩家鍵,而非 username/player_id 字串 (防身份混淆)
    - 與資料庫無耦合 (純記憶體模型)
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

# ─────────────────────────────────────────────────────────
# 房間/遊戲狀態列舉
# ─────────────────────────────────────────────────────────

class RoomStatus:
    """房間狀態 (使用 class 而非 Enum,序列化更簡單)"""
    WAITING = "waiting"      # 等待玩家加入
    RUNNING = "running"      # 遊戲進行中
    FINISHED = "finished"    # 遊戲結束
    ABANDONED = "abandoned"  # 廢棄 (全員離開)


class GamePhase:
    """遊戲階段"""
    EVENT = "event"          # 歷史事件揭示中
    PROFIT = "profit"        # 利潤結算中
    ACTION = "action"        # 玩家行動階段
    FINISHED = "finished"    # 遊戲結束


# ─────────────────────────────────────────────────────────
# 領域模型
# ─────────────────────────────────────────────────────────

@dataclass
class Card:
    """工業圖紙卡 (持有後可在允許城市建廠)"""
    card_id: str
    industry_id: str  # 對應 INDUSTRIES 鍵


@dataclass
class Factory:
    """已建設的工廠"""
    factory_id: str
    owner_user_id: int        # 從 JWT 解析的 user.id
    industry_id: str          # 對應 INDUSTRIES 鍵
    city_id: str              # 對應 CITIES 鍵
    plot_index: int           # 城市內第幾塊地皮 (用於 base_prices 索引)
    built_turn: int           # 建廠時的回合索引 (0-based)


@dataclass
class Player:
    """單個玩家狀態 (in-room)"""
    user_id: int               # 從 JWT 解析,唯一識別
    username: str              # 帳號名 (用於日誌)
    display_name: str          # 顯示名 (UI)
    color: str                 # UI 顯示色
    seat_index: int            # 座位 (決定回合順序)
    money: int = 0
    location: str = ""         # 城市 id
    action_points: int = 0
    hand: Optional[str] = None     # 持有的圖紙 (industry_id),簡化:同時最多 1 張
    factory_ids: list[str] = field(default_factory=list)
    is_connected: bool = True
    disconnected_at: Optional[float] = None  # monotonic time
    is_afk: bool = False
    last_profit: int = 0       # 最近一回合的淨利潤 (給 UI 顯示用)


@dataclass
class GameState:
    """房間 + 遊戲整合狀態 (一個房間就是一個 GameState)"""
    # ── 房間元資料 ──
    room_code: str
    room_name: str
    host_user_id: int
    is_public: bool
    max_players: int
    status: str = RoomStatus.WAITING

    # ── 玩家 ──
    players: dict[int, Player] = field(default_factory=dict)  # user_id → Player
    seat_to_user: list[int] = field(default_factory=list)     # 座位順序 [user_id...]

    # ── 遊戲進度 ──
    turn_index: int = 0                  # 0..MAX_TURNS-1
    phase: str = GamePhase.EVENT
    current_player_seat: int = 0         # 0..len(seat_to_user)-1

    # ── 遊戲資源 ──
    factories: dict[str, Factory] = field(default_factory=dict)
    deck: list[str] = field(default_factory=list)        # 剩餘圖紙 (industry_id 列表)
    discard: list[str] = field(default_factory=list)

    # ── 事件與規則修飾 ──
    current_event: Optional[dict] = None  # 當前回合的事件 (對應 EVENTS[turn_index])
    unlocked_industries: list[str] = field(default_factory=list)
    city_price_modifiers: dict[str, int] = field(default_factory=dict)  # 城市地價修飾
    income_mult_by_industry: dict[str, float] = field(default_factory=dict)
    income_add_by_industry: dict[str, int] = field(default_factory=dict)
    free_build_city: Optional[str] = None
    double_synergy: bool = False
    blocked_cities: list[str] = field(default_factory=list)
    max_ap: int = 2

    # ── 日誌 ──
    event_log: list[dict] = field(default_factory=list)   # 給前端展示的近期事件 (循環緩衝)

    # ── 同步控制 ──
    version: int = 0           # 每次 mutation +1
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    finished_at: Optional[float] = None

    # ── 結局 ──
    winner_user_id: Optional[int] = None
    final_ranking: list[int] = field(default_factory=list)  # 按金額降序的 user_id 列表

    # ───── helper ─────
    def current_player_user_id(self) -> Optional[int]:
        """當前回合行動玩家的 user_id"""
        if not self.seat_to_user:
            return None
        if self.current_player_seat >= len(self.seat_to_user):
            return None
        return self.seat_to_user[self.current_player_seat]

    def get_player(self, user_id: int) -> Optional[Player]:
        return self.players.get(user_id)

    def is_user_in_room(self, user_id: int) -> bool:
        return user_id in self.players

    def player_count(self) -> int:
        return len(self.players)

    def append_log(self, msg: str, log_type: str = "info") -> None:
        """新增日誌條目 (限制最多 50 條,先進先出)"""
        self.event_log.insert(0, {
            "msg": msg,
            "type": log_type,
            "ts": time.time(),
        })
        if len(self.event_log) > 50:
            self.event_log = self.event_log[:50]


# ─────────────────────────────────────────────────────────
# ID 生成 helper
# ─────────────────────────────────────────────────────────

def gen_factory_id() -> str:
    return f"f-{uuid.uuid4().hex[:8]}"


def gen_card_id() -> str:
    return f"c-{uuid.uuid4().hex[:8]}"
