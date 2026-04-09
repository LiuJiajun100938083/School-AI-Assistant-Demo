"""
大灣區大亨遊戲域自訂例外

設計原則:
    - 例外即架構 (架構原則 #7)
    - 每種錯誤情境有專屬例外類,error_code 與 message 分離
    - InvalidActionError 是所有遊戲動作校驗失敗的基類
    - 客戶端透過 error_code 而非字串匹配,降低耦合
"""


class DwqGameError(Exception):
    """大灣區大亨遊戲域基類例外"""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(f"[{code}] {message}")


# ─────────────────────────────────────────────────────────
# 房間/Lobby 相關
# ─────────────────────────────────────────────────────────

class RoomNotFoundError(DwqGameError):
    def __init__(self, room_code: str):
        super().__init__("room_not_found", f"房間 {room_code} 不存在")


class RoomFullError(DwqGameError):
    def __init__(self, room_code: str, max_players: int):
        super().__init__("room_full", f"房間 {room_code} 已滿 ({max_players} 人)")


class RoomAlreadyStartedError(DwqGameError):
    def __init__(self, room_code: str):
        super().__init__("room_already_started", f"房間 {room_code} 已開始遊戲,無法加入")


class AlreadyInRoomError(DwqGameError):
    def __init__(self, room_code: str):
        super().__init__(
            "already_in_room",
            f"您已在房間 {room_code} 中,請先離開當前房間",
        )


class NotInRoomError(DwqGameError):
    def __init__(self, room_code: str):
        super().__init__("not_in_room", f"您不在房間 {room_code} 中")


class NotHostError(DwqGameError):
    def __init__(self):
        super().__init__("not_host", "只有房主能執行此操作")


class NotEnoughPlayersError(DwqGameError):
    def __init__(self, current: int, minimum: int):
        super().__init__(
            "not_enough_players",
            f"玩家不足:目前 {current} 人,至少需要 {minimum} 人",
        )


# ─────────────────────────────────────────────────────────
# 遊戲動作相關 (InvalidActionError 系列)
# ─────────────────────────────────────────────────────────

class InvalidActionError(DwqGameError):
    """所有遊戲動作校驗失敗的基類"""
    pass


class NotYourTurnError(InvalidActionError):
    def __init__(self):
        super().__init__("not_your_turn", "尚未輪到您的回合")


class WrongPhaseError(InvalidActionError):
    def __init__(self, current_phase: str, required_phase: str):
        super().__init__(
            "wrong_phase",
            f"當前階段為 {current_phase},此動作需要 {required_phase} 階段",
        )


class InsufficientAPError(InvalidActionError):
    def __init__(self, required: int, available: int):
        super().__init__(
            "insufficient_ap",
            f"行動點不足:需要 {required},剩餘 {available}",
        )


class InsufficientMoneyError(InvalidActionError):
    def __init__(self, required: int, available: int):
        super().__init__(
            "insufficient_money",
            f"資金不足:需要 {required} 萬,剩餘 {available} 萬",
        )


class NotAdjacentCityError(InvalidActionError):
    def __init__(self, current: str, target: str):
        super().__init__(
            "not_adjacent",
            f"無法從 {current} 直接移動到 {target} (非相鄰)",
        )


class CityBlockedError(InvalidActionError):
    def __init__(self, city_id: str):
        super().__init__("city_blocked", f"{city_id} 因事件被封鎖,無法進入")


class NotInHongKongError(InvalidActionError):
    def __init__(self, current_location: str):
        super().__init__(
            "not_in_hongkong",
            f"必須在香港才能抽卡,當前位置:{current_location}",
        )


class HandFullError(InvalidActionError):
    def __init__(self):
        super().__init__("hand_full", "手中已有圖紙,請先建廠或丟棄")


class NoHandCardError(InvalidActionError):
    def __init__(self):
        super().__init__("no_hand_card", "手中沒有圖紙,無法建廠")


class IndustryNotUnlockedError(InvalidActionError):
    def __init__(self, industry: str):
        super().__init__(
            "industry_not_unlocked",
            f"產業 {industry} 尚未解鎖",
        )


class IndustryNotAllowedError(InvalidActionError):
    def __init__(self, city: str, industry: str):
        super().__init__(
            "industry_not_allowed",
            f"{city} 不允許建設 {industry}",
        )


class CityFullError(InvalidActionError):
    def __init__(self, city: str):
        super().__init__("city_full", f"{city} 的建設空間已滿")


class DeckEmptyError(InvalidActionError):
    def __init__(self):
        super().__init__("deck_empty", "牌庫已空,無法抽卡")


class NoUnlockedCardError(InvalidActionError):
    def __init__(self):
        super().__init__("no_unlocked_card", "牌庫中目前沒有已解鎖的圖紙")


class UnknownActionError(InvalidActionError):
    def __init__(self, action: str):
        super().__init__("unknown_action", f"未知的動作類型:{action}")


class PlayerNotFoundError(DwqGameError):
    def __init__(self, user_id: int):
        super().__init__("player_not_found", f"玩家 (id={user_id}) 不在房間中")


# ─────────────────────────────────────────────────────────
# 連線相關
# ─────────────────────────────────────────────────────────

class WSAuthError(DwqGameError):
    def __init__(self, message: str = "WebSocket 認證失敗"):
        super().__init__("ws_auth_failed", message)


class RoomConnectionLimitError(DwqGameError):
    def __init__(self, room_code: str, limit: int):
        super().__init__(
            "room_connection_limit",
            f"房間 {room_code} 連線數已達上限 {limit}",
        )
