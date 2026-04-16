"""
大灣區大亨遊戲核心邏輯 (純函數)

設計原則:
    - 無 I/O 依賴:不訪問資料庫、不發送網路、不讀寫檔案
    - 易測試:所有函數可直接 pytest,只接收 GameState + 參數
    - 防作弊核心:所有 validate_* 是動作合法性的唯一裁判
    - mutation 統一通過 do_* 函數,避免散落
    - engine 負責遊戲規則,不負責訊息廣播 (那是 service 的責任)

依賴方向:
    engine → models / exceptions / constants  (上層依賴下層,單向)
"""
from __future__ import annotations

import random
from typing import Any, Optional

from . import constants as C
from .exceptions import (
    CityBlockedError,
    CityFullError,
    DeckEmptyError,
    HandFullError,
    IndustryNotAllowedError,
    IndustryNotUnlockedError,
    InsufficientAPError,
    InsufficientMoneyError,
    InvalidActionError,
    NoHandCardError,
    NoUnlockedCardError,
    NotAdjacentCityError,
    NotInHongKongError,
    NotYourTurnError,
    PlayerNotFoundError,
    UnknownActionError,
    WrongPhaseError,
)
from .models import (
    Factory,
    GamePhase,
    GameState,
    Player,
    RoomStatus,
    gen_factory_id,
)


# ═════════════════════════════════════════════════════════
# 鄰接計算 (合併基礎連線 + 已解鎖動態連線)
# ═════════════════════════════════════════════════════════

def get_current_connections(state: GameState) -> dict[str, set[str]]:
    """計算當前回合的城市連線圖 (基礎 + 已解鎖動態)"""
    conn: dict[str, set[str]] = {
        city: set(neighbors) for city, neighbors in C.BASE_CONNECTIONS.items()
    }
    # 套用已解鎖的動態連線
    for line in C.DYNAMIC_LINES:
        if state.turn_index + 1 >= line["unlock_turn"]:  # turn_index 是 0-based
            a, b = line["from"], line["to"]
            conn.setdefault(a, set()).add(b)
            conn.setdefault(b, set()).add(a)
    return conn


def get_adjacent(state: GameState, city_id: str) -> set[str]:
    """獲取指定城市當前的相鄰城市集合"""
    return get_current_connections(state).get(city_id, set())


# ═════════════════════════════════════════════════════════
# 通用 helpers
# ═════════════════════════════════════════════════════════

def _get_player_or_raise(state: GameState, user_id: int) -> Player:
    """取得玩家;不存在則拋例外"""
    player = state.get_player(user_id)
    if player is None:
        raise PlayerNotFoundError(user_id)
    return player


def _ensure_action_phase(state: GameState) -> None:
    if state.phase != GamePhase.ACTION:
        raise WrongPhaseError(state.phase, GamePhase.ACTION)


def _ensure_my_turn(state: GameState, user_id: int) -> None:
    """確保是該玩家的回合"""
    current_uid = state.current_player_user_id()
    if current_uid != user_id:
        raise NotYourTurnError()


def _count_factories_in_city(state: GameState, city_id: str) -> int:
    """計算城市內已建工廠總數 (所有玩家)"""
    return sum(1 for f in state.factories.values() if f.city_id == city_id)


def _calculate_plot_price(state: GameState, city_id: str, plot_index: int) -> int:
    """計算指定城市第 plot_index 塊地皮的當前實際地價 (考慮事件修飾)"""
    base_prices = C.CITIES[city_id]["base_prices"]
    if plot_index >= len(base_prices):
        return 9999  # 超過上限,實質禁止
    base = base_prices[plot_index]
    modifier = state.city_price_modifiers.get(city_id, 0)
    return max(0, base + modifier)


def _calculate_build_cost(state: GameState, city_id: str, industry_id: str, plot_index: int) -> int:
    """建廠總費用 = demand × 當前地價"""
    plot_price = _calculate_plot_price(state, city_id, plot_index)
    demand = C.INDUSTRIES[industry_id]["demand"]
    return demand * plot_price


# ═════════════════════════════════════════════════════════
# 校驗函數 (拋 InvalidActionError 子類)
# ═════════════════════════════════════════════════════════

def validate_move(state: GameState, user_id: int, dest: str) -> None:
    """校驗移動動作"""
    _ensure_action_phase(state)
    _ensure_my_turn(state, user_id)
    player = _get_player_or_raise(state, user_id)

    if player.action_points < 1:
        raise InsufficientAPError(1, player.action_points)

    if dest not in C.CITIES:
        raise InvalidActionError("invalid_city", f"未知城市 {dest}")

    if dest in state.blocked_cities:
        raise CityBlockedError(dest)

    adjacent = get_adjacent(state, player.location)
    if dest not in adjacent:
        raise NotAdjacentCityError(player.location, dest)


def validate_draw(state: GameState, user_id: int) -> None:
    """校驗抽卡動作"""
    _ensure_action_phase(state)
    _ensure_my_turn(state, user_id)
    player = _get_player_or_raise(state, user_id)

    if player.action_points < 1:
        raise InsufficientAPError(1, player.action_points)

    if player.location != "香港":
        raise NotInHongKongError(player.location)

    if player.hand is not None:
        raise HandFullError()

    if not state.deck:
        raise DeckEmptyError()

    # 必須有至少一張已解鎖的卡可抽
    available = [c for c in state.deck if c in state.unlocked_industries]
    if not available:
        raise NoUnlockedCardError()


def validate_build(state: GameState, user_id: int) -> None:
    """校驗建廠動作 (industry 由 player.hand 決定)"""
    _ensure_action_phase(state)
    _ensure_my_turn(state, user_id)
    player = _get_player_or_raise(state, user_id)

    if player.hand is None:
        raise NoHandCardError()

    industry = player.hand
    if industry not in state.unlocked_industries:
        raise IndustryNotUnlockedError(industry)

    city = C.CITIES[player.location]
    if industry not in city["allowed"]:
        raise IndustryNotAllowedError(player.location, industry)

    plot_index = _count_factories_in_city(state, player.location)
    if plot_index >= len(city["base_prices"]):
        raise CityFullError(player.location)

    cost = _calculate_build_cost(state, player.location, industry, plot_index)
    if player.money < cost:
        raise InsufficientMoneyError(cost, player.money)

    # 行動點檢查 (特區免費建廠例外)
    is_free = state.free_build_city == player.location
    if not is_free and player.action_points < 1:
        raise InsufficientAPError(1, player.action_points)


def validate_end_turn(state: GameState, user_id: int) -> None:
    """校驗結束回合動作"""
    _ensure_action_phase(state)
    _ensure_my_turn(state, user_id)
    _get_player_or_raise(state, user_id)


# ═════════════════════════════════════════════════════════
# 動作執行 (do_*) — 假設已通過 validate_*
# ═════════════════════════════════════════════════════════

def do_move(state: GameState, user_id: int, dest: str) -> dict:
    """執行移動。已校驗。"""
    player = _get_player_or_raise(state, user_id)
    old_location = player.location
    player.location = dest
    player.action_points -= 1
    state.append_log(f"🏃‍♂️ {player.display_name} 從 {old_location} 移動至 {dest}", "success")
    return {"action": "move", "user_id": user_id, "from": old_location, "to": dest}


def do_draw(state: GameState, user_id: int) -> dict:
    """執行抽卡。已校驗。"""
    player = _get_player_or_raise(state, user_id)

    # 隨機抽取一張已解鎖的卡
    available = [c for c in state.deck if c in state.unlocked_industries]
    drawn = random.choice(available)

    # 從牌庫移除一張該產業的卡
    state.deck.remove(drawn)
    player.hand = drawn
    player.action_points -= 1

    state.append_log(f"🃏 {player.display_name} 抽取了 [{drawn}] 圖紙", "success")
    return {"action": "draw", "user_id": user_id, "card": drawn}


def do_build(state: GameState, user_id: int) -> dict:
    """執行建廠。已校驗。industry 由 player.hand 決定。"""
    player = _get_player_or_raise(state, user_id)
    industry = player.hand
    assert industry is not None  # 校驗保證

    city_id = player.location
    plot_index = _count_factories_in_city(state, city_id)
    cost = _calculate_build_cost(state, city_id, industry, plot_index)
    is_free = state.free_build_city == city_id

    factory_id = gen_factory_id()
    factory = Factory(
        factory_id=factory_id,
        owner_user_id=user_id,
        industry_id=industry,
        city_id=city_id,
        plot_index=plot_index,
        built_turn=state.turn_index,
    )
    state.factories[factory_id] = factory
    player.factory_ids.append(factory_id)
    player.money -= cost
    player.hand = None
    state.discard.append(industry)
    if not is_free:
        player.action_points -= 1

    free_tag = " (特區免費)" if is_free else ""
    state.append_log(
        f"🏭 {player.display_name} 在 {city_id} 建立了 [{industry}] 工廠 (-{cost}萬{free_tag})",
        "success",
    )
    return {
        "action": "build",
        "user_id": user_id,
        "factory_id": factory_id,
        "city": city_id,
        "industry": industry,
        "cost": cost,
        "free_ap": is_free,
    }


def do_end_turn(state: GameState, user_id: int) -> dict:
    """玩家主動結束回合 (或 AFK 自動跳過)"""
    player = _get_player_or_raise(state, user_id)
    state.append_log(f"⏭️ {player.display_name} 結束行動回合", "sys")
    return {"action": "end_turn", "user_id": user_id}


# ═════════════════════════════════════════════════════════
# 階段機 (Event → Profit → Action → Next Turn)
# ═════════════════════════════════════════════════════════

def apply_event(state: GameState, event: dict) -> dict:
    """套用事件效果到 state。在 EVENT 階段呼叫。

    清空上一回合的封鎖城市與 free_build_city,然後套用新事件。
    """
    state.current_event = event
    ef = event.get("effects", {})

    # ── 清除上回合的暫時性效果 ──
    state.blocked_cities = []
    state.free_build_city = None

    # ── 地價變更 ──
    if "land_price_change" in ef:
        change = ef["land_price_change"]
        if "default" in change:
            default_delta = change["default"]
            exceptions = set(change.get("exceptions", []))
            for city in C.CITIES:
                if city not in exceptions:
                    state.city_price_modifiers[city] = (
                        state.city_price_modifiers.get(city, 0) + default_delta
                    )
        else:
            for city, delta in change.items():
                state.city_price_modifiers[city] = (
                    state.city_price_modifiers.get(city, 0) + delta
                )

    # ── 解鎖產業 ──
    if "unlocked_industries" in ef:
        for ind in ef["unlocked_industries"]:
            if ind not in state.unlocked_industries:
                state.unlocked_industries.append(ind)

    # ── 自由建廠城市 ──
    if "free_build_city" in ef:
        state.free_build_city = ef["free_build_city"]

    # ── 收入修飾 (倍率) ──
    if "income_modifier" in ef:
        mod = ef["income_modifier"]
        for ind in mod["target"]:
            state.income_mult_by_industry[ind] = mod["mult"]

    if "income_modifier_list" in ef:
        for mod in ef["income_modifier_list"]:
            for ind in mod["target"]:
                state.income_mult_by_industry[ind] = mod["mult"]

    # ── 收入修飾 (固定加成) ──
    if "income_modifier_flat" in ef:
        mod = ef["income_modifier_flat"]
        for ind in mod["target"]:
            state.income_add_by_industry[ind] = (
                state.income_add_by_industry.get(ind, 0) + mod["add"]
            )

    # ── 同業優勢翻倍 ──
    if ef.get("double_synergy"):
        state.double_synergy = True

    # ── 全員加錢 ──
    money_bonus = ef.get("add_money", 0)
    if money_bonus > 0:
        for player in state.players.values():
            player.money += money_bonus

    # ── 行動點上限提升 ──
    if "add_max_ap" in ef:
        state.max_ap += ef["add_max_ap"]

    # ── 封鎖城市 ──
    if "block_city" in ef:
        state.blocked_cities = list(ef["block_city"])

    state.append_log(f"📜 歷史事件: {event['title']} ({event['year']})", "event")
    return {
        "event": event,
        "money_bonus": money_bonus,
        "blocked_cities": state.blocked_cities,
        "unlocked_industries": ef.get("unlocked_industries", []),
    }


def settle_profit(state: GameState) -> dict[int, dict]:
    """結算所有玩家的本回合利潤,money 累加。返回每個玩家的詳細報告。"""
    report: dict[int, dict] = {}
    for user_id, player in state.players.items():
        total = 0
        details = []
        # 按產業計數,用於 synergy
        counts: dict[str, int] = {}
        for fid in player.factory_ids:
            f = state.factories[fid]
            counts[f.industry_id] = counts.get(f.industry_id, 0) + 1

        for fid in player.factory_ids:
            factory = state.factories[fid]
            industry = factory.industry_id

            # 基礎利潤 (PROFIT_MATRIX)
            base = C.PROFIT_MATRIX.get(industry, {}).get(factory.city_id, 0)

            # 套用倍率
            if industry in state.income_mult_by_industry:
                base = int(base * state.income_mult_by_industry[industry])

            # 套用固定加成
            if industry in state.income_add_by_industry:
                base += state.income_add_by_industry[industry]

            # 同業優勢
            synergy = 0
            if counts[industry] > 1:
                synergy_base = C.INDUSTRIES[industry]["synergy"]
                synergy = synergy_base * (2 if state.double_synergy else 1)

            factory_total = base + synergy
            total += factory_total
            details.append({
                "factory_id": fid,
                "industry": industry,
                "city": factory.city_id,
                "base": base,
                "synergy": synergy,
                "total": factory_total,
            })

        player.money += total
        player.last_profit = total
        report[user_id] = {
            "user_id": user_id,
            "display_name": player.display_name,
            "total_profit": total,
            "factories": details,
            "new_money": player.money,
        }
        if total > 0:
            state.append_log(f"💰 {player.display_name} 獲得利潤 {total} 萬", "success")
        elif total < 0:
            state.append_log(f"📉 {player.display_name} 虧損 {abs(total)} 萬", "error")
        else:
            state.append_log(f"⚖️ {player.display_name} 本回合利潤為 0", "sys")
    return report


def reset_action_points(state: GameState) -> None:
    """新回合開始時,所有玩家行動點重置"""
    for player in state.players.values():
        player.action_points = state.max_ap


def advance_to_next_player(state: GameState) -> bool:
    """推進到下一位玩家。

    返回 True 表示已推進到下一位 (仍在 action phase);
    返回 False 表示所有玩家都已完成,本回合行動階段結束。
    """
    state.current_player_seat += 1
    return state.current_player_seat < len(state.seat_to_user)


def is_game_over(state: GameState) -> bool:
    return state.turn_index >= C.MAX_TURNS - 1 and state.phase == GamePhase.FINISHED


def finalize_game(state: GameState) -> dict:
    """結束遊戲:計算排名與贏家"""
    state.status = RoomStatus.FINISHED
    state.phase = GamePhase.FINISHED
    import time as _t
    state.finished_at = _t.time()

    sorted_players = sorted(
        state.players.values(),
        key=lambda p: p.money,
        reverse=True,
    )
    state.final_ranking = [p.user_id for p in sorted_players]
    if sorted_players:
        state.winner_user_id = sorted_players[0].user_id

    state.append_log("🏆 遊戲結束!", "sys")
    return {
        "winner_user_id": state.winner_user_id,
        "ranking": [
            {
                "user_id": p.user_id,
                "display_name": p.display_name,
                "money": p.money,
                "factory_count": len(p.factory_ids),
            }
            for p in sorted_players
        ],
    }


# ═════════════════════════════════════════════════════════
# 遊戲初始化
# ═════════════════════════════════════════════════════════

def start_game(state: GameState) -> dict:
    """從 WAITING 狀態啟動遊戲。

    - 鎖定座位順序 (seat_to_user)
    - 初始化各玩家狀態 (錢、位置、AP)
    - 重置牌庫
    - 設定到 turn 0 EVENT phase
    """
    if state.status != RoomStatus.WAITING:
        raise InvalidActionError("already_started", "遊戲已經開始")

    if len(state.players) < C.MIN_PLAYERS:
        raise InvalidActionError(
            "not_enough_players",
            f"玩家不足 (需要至少 {C.MIN_PLAYERS} 人)",
        )

    # 按 seat_index 排序鎖定座位順序
    sorted_players = sorted(state.players.values(), key=lambda p: p.seat_index)
    state.seat_to_user = [p.user_id for p in sorted_players]

    # 重新分配連續座位 (避免 leave 留空隙)
    for new_idx, player in enumerate(sorted_players):
        player.seat_index = new_idx
        player.money = C.STARTING_MONEY
        player.location = C.STARTING_LOCATION
        player.action_points = 0  # 第一回合 EVENT phase 後再 reset
        player.hand = None
        player.factory_ids = []
        player.is_afk = False

    state.turn_index = 0
    state.phase = GamePhase.EVENT
    state.current_player_seat = 0
    state.status = RoomStatus.RUNNING
    state.deck = list(C.INITIAL_DECK)
    state.discard = []
    state.factories = {}
    state.unlocked_industries = []
    state.city_price_modifiers = {city: 0 for city in C.CITIES}
    state.income_mult_by_industry = {}
    state.income_add_by_industry = {}
    state.free_build_city = None
    state.double_synergy = False
    state.blocked_cities = []
    state.max_ap = C.STARTING_AP
    state.event_log = []
    import time as _t
    state.started_at = _t.time()

    state.append_log(f"遊戲開始!{C.MAX_TURNS} 回合 1977-2025 大灣區建設", "sys")
    return {"status": "started", "player_count": len(state.players)}


# ═════════════════════════════════════════════════════════
# Phase 推進總控
# ═════════════════════════════════════════════════════════

def begin_turn_event_phase(state: GameState) -> dict:
    """進入新回合的 EVENT 階段:套用對應事件"""
    state.phase = GamePhase.EVENT
    event = C.get_event_for_turn(state.turn_index)
    return apply_event(state, event)


def begin_profit_phase(state: GameState) -> dict[int, dict]:
    """進入 PROFIT 階段:結算利潤"""
    state.phase = GamePhase.PROFIT
    return settle_profit(state)


def begin_action_phase(state: GameState) -> None:
    """進入 ACTION 階段:重置 AP,從 seat 0 開始"""
    state.phase = GamePhase.ACTION
    state.current_player_seat = 0
    reset_action_points(state)


def end_action_phase_and_advance(state: GameState) -> dict:
    """ACTION 階段結束 (所有玩家輪完):進入下一回合或結束遊戲

    返回 dict 包含:
        - phase: 進入的下一階段名
        - is_game_over: bool
        - profit_report: 若進入下一回合,本回合的結算報告
        - event: 若進入下一回合,新回合的事件
        - finalize: 若遊戲結束,排名資料
    """
    # 是否為最後一回合?
    if state.turn_index >= C.MAX_TURNS - 1:
        # 最後一回合的 ACTION 結束 → 結束遊戲
        finalize_data = finalize_game(state)
        return {
            "phase": GamePhase.FINISHED,
            "is_game_over": True,
            "finalize": finalize_data,
        }

    # 不是最後一回合 → 推進到下一回合
    state.turn_index += 1

    # 1. EVENT phase
    event_result = begin_turn_event_phase(state)

    # 2. PROFIT phase
    profit_report = begin_profit_phase(state)

    # 3. ACTION phase
    begin_action_phase(state)

    return {
        "phase": GamePhase.ACTION,
        "is_game_over": False,
        "turn_index": state.turn_index,
        "event_result": event_result,
        "profit_report": profit_report,
    }


def initial_turn_setup(state: GameState) -> dict:
    """遊戲剛 start 後的第一次階段推進:event → profit → action

    第一回合沒有上回合的工廠,profit 必為 0,但仍走流程保持一致。
    """
    event_result = begin_turn_event_phase(state)
    profit_report = begin_profit_phase(state)
    begin_action_phase(state)
    return {
        "phase": GamePhase.ACTION,
        "is_game_over": False,
        "turn_index": state.turn_index,
        "event_result": event_result,
        "profit_report": profit_report,
    }


# ═════════════════════════════════════════════════════════
# 統一動作分派
# ═════════════════════════════════════════════════════════

ACTION_HANDLERS = {
    "move": (validate_move, do_move),
    "draw": (validate_draw, do_draw),
    "build": (validate_build, do_build),
    "end_turn": (validate_end_turn, do_end_turn),
}


def handle_player_action(state: GameState, user_id: int, action: str, payload: dict) -> dict:
    """處理單個玩家動作 (原子操作:校驗 + 執行 + 版本號 +1)。

    調用方 (service.py) 必須在持有 room lock 的情況下呼叫此函數。
    本函數**不會**廣播訊息,僅返回操作結果供 service 廣播。

    參數:
        state: 當前 GameState (將被 mutate)
        user_id: 動作發起者的 user_id (來自 JWT,絕不從 payload 取)
        action: 動作類型字串
        payload: 動作參數 (例如 move 的 dest)

    返回 dict 包含:
        - action: 動作類型
        - result: 動作執行結果 (含 user_id, 影響的資源等)
        - phase_advance: 若動作觸發階段推進 (end_turn),含推進結果
    """
    handler = ACTION_HANDLERS.get(action)
    if handler is None:
        raise UnknownActionError(action)
    validate_fn, do_fn = handler

    # 校驗階段 (依動作類型補充參數)
    if action == "move":
        validate_fn(state, user_id, payload.get("to"))
    else:
        validate_fn(state, user_id)

    # 執行動作
    if action == "move":
        result = do_fn(state, user_id, payload.get("to"))
    else:
        result = do_fn(state, user_id)

    # end_turn 觸發階段推進
    phase_advance = None
    if action == "end_turn":
        phase_advance = _handle_end_turn_advance(state)

    state.version += 1
    import time as _t
    state.updated_at = _t.time()

    return {
        "action": action,
        "result": result,
        "phase_advance": phase_advance,
    }


def _handle_end_turn_advance(state: GameState) -> dict:
    """處理 end_turn 觸發的階段推進:或推進到下一玩家,或結束本回合"""
    has_more_players = advance_to_next_player(state)
    if has_more_players:
        return {"type": "next_player", "current_seat": state.current_player_seat}
    # 所有玩家輪完,進入下回合或結束遊戲
    return end_action_phase_and_advance(state)


def auto_skip_afk_player(state: GameState) -> Optional[dict]:
    """自動跳過 AFK 玩家的回合 (供 service 呼叫)。

    返回 None 若當前不是 AFK 玩家;否則執行 end_turn 並返回推進結果。
    """
    current_uid = state.current_player_user_id()
    if current_uid is None:
        return None
    player = state.players.get(current_uid)
    if player is None or not player.is_afk:
        return None

    state.append_log(f"⏭️ {player.display_name} 因 AFK 自動跳過回合", "sys")
    advance = _handle_end_turn_advance(state)
    state.version += 1
    import time as _t
    state.updated_at = _t.time()
    return advance


# ═════════════════════════════════════════════════════════
# 序列化 (給客戶端的 DTO)
# ═════════════════════════════════════════════════════════

def serialize_state_for_viewer(state: GameState, viewer_user_id: Optional[int] = None) -> dict:
    """產出送給特定觀眾的 GameState DTO。

    對非 viewer 的玩家,hand 欄位被替換為 has_hand: bool (隱私保護)。
    """
    players_dto = []
    for uid, player in state.players.items():
        is_self = (uid == viewer_user_id)
        players_dto.append({
            "user_id": uid,
            "username": player.username,
            "display_name": player.display_name,
            "color": player.color,
            "seat_index": player.seat_index,
            "money": player.money,
            "location": player.location,
            "action_points": player.action_points,
            "hand": player.hand if is_self else None,
            "has_hand": player.hand is not None,
            "factory_ids": list(player.factory_ids),
            "is_connected": player.is_connected,
            "is_afk": player.is_afk,
            "last_profit": player.last_profit,
        })
    players_dto.sort(key=lambda p: p["seat_index"])

    factories_dto = {
        fid: {
            "factory_id": fid,
            "owner_user_id": f.owner_user_id,
            "industry_id": f.industry_id,
            "city_id": f.city_id,
            "plot_index": f.plot_index,
            "built_turn": f.built_turn,
        }
        for fid, f in state.factories.items()
    }

    return {
        "room_code": state.room_code,
        "room_name": state.room_name,
        "host_user_id": state.host_user_id,
        "is_public": state.is_public,
        "max_players": state.max_players,
        "status": state.status,
        "turn_index": state.turn_index,
        "phase": state.phase,
        "current_player_seat": state.current_player_seat,
        "current_player_user_id": state.current_player_user_id(),
        "max_ap": state.max_ap,
        "players": players_dto,
        "seat_to_user": state.seat_to_user,
        "factories": factories_dto,
        "deck_size": len(state.deck),
        "current_event": state.current_event,
        "unlocked_industries": list(state.unlocked_industries),
        "city_price_modifiers": dict(state.city_price_modifiers),
        "income_mult_by_industry": dict(state.income_mult_by_industry),
        "income_add_by_industry": dict(state.income_add_by_industry),
        "free_build_city": state.free_build_city,
        "double_synergy": state.double_synergy,
        "blocked_cities": list(state.blocked_cities),
        "event_log": list(state.event_log[:30]),
        "version": state.version,
        "winner_user_id": state.winner_user_id,
        "final_ranking": list(state.final_ranking),
        "viewer_user_id": viewer_user_id,
    }
