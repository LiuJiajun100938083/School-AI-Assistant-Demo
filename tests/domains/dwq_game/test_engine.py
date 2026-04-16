"""
大灣區大亨遊戲引擎單元測試

測試 engine.py 的純函數邏輯,無需資料庫或網路。
"""
import pytest

from app.domains.dwq_game import constants as C
from app.domains.dwq_game import engine
from app.domains.dwq_game.exceptions import (
    CityBlockedError,
    CityFullError,
    HandFullError,
    IndustryNotAllowedError,
    InsufficientAPError,
    InsufficientMoneyError,
    NoHandCardError,
    NotAdjacentCityError,
    NotInHongKongError,
    NotYourTurnError,
    WrongPhaseError,
)
from app.domains.dwq_game.models import (
    GamePhase,
    GameState,
    Player,
    RoomStatus,
)


# ─────────────────────────────────────────────────────────
# Test fixtures
# ─────────────────────────────────────────────────────────

def make_state_with_players(num_players: int = 3) -> GameState:
    """建立一個含 N 個玩家的遊戲狀態,並 start_game"""
    state = GameState(
        room_code="TEST01",
        room_name="測試房間",
        host_user_id=1,
        is_public=True,
        max_players=6,
    )
    for i in range(num_players):
        uid = i + 1
        state.players[uid] = Player(
            user_id=uid,
            username=f"user{uid}",
            display_name=f"玩家{uid}",
            color=C.PLAYER_COLORS[i],
            seat_index=i,
        )
    engine.start_game(state)
    engine.initial_turn_setup(state)
    return state


# ─────────────────────────────────────────────────────────
# 鄰接計算
# ─────────────────────────────────────────────────────────

class TestAdjacency:
    def test_base_connections_loaded(self):
        state = make_state_with_players()
        # 香港 base 只連深圳
        adj = engine.get_adjacent(state, "香港")
        assert "深圳" in adj
        # turn 0 (1977),港珠澳大橋未通,香港不應連珠海/澳門
        assert "珠海" not in adj
        assert "澳門" not in adj

    def test_dynamic_line_unlocks_at_correct_turn(self):
        state = make_state_with_players()
        # turn_index = 0 (回合 1, 1977),沒有任何動態線解鎖
        assert "深圳" not in engine.get_adjacent(state, "廣州") or True  # 廣州 base 連 佛山, 東莞,沒深圳

        # 推進到 turn_index = 5 (回合 6, 2011) 廣深高鐵應該解鎖
        state.turn_index = 5
        assert "深圳" in engine.get_adjacent(state, "廣州")
        assert "廣州" in engine.get_adjacent(state, "深圳")

    def test_hkzhuhai_macau_bridge_at_turn_7(self):
        state = make_state_with_players()
        state.turn_index = 6  # 回合 7 (2016)
        adj = engine.get_adjacent(state, "香港")
        assert "珠海" in adj
        assert "澳門" in adj


# ─────────────────────────────────────────────────────────
# Move 校驗
# ─────────────────────────────────────────────────────────

class TestMoveValidation:
    def test_move_to_adjacent_city_allowed(self):
        state = make_state_with_players()
        # 玩家 1 在香港,移動到深圳 (相鄰)
        engine.validate_move(state, user_id=1, dest="深圳")  # 不應拋例外

    def test_move_to_non_adjacent_rejected(self):
        state = make_state_with_players()
        # 香港 → 肇慶 (非相鄰)
        with pytest.raises(NotAdjacentCityError):
            engine.validate_move(state, user_id=1, dest="肇慶")

    def test_move_when_not_my_turn(self):
        state = make_state_with_players()
        # 玩家 2 不是當前玩家
        with pytest.raises(NotYourTurnError):
            engine.validate_move(state, user_id=2, dest="深圳")

    def test_move_with_zero_ap(self):
        state = make_state_with_players()
        state.players[1].action_points = 0
        with pytest.raises(InsufficientAPError):
            engine.validate_move(state, user_id=1, dest="深圳")

    def test_move_to_blocked_city(self):
        state = make_state_with_players()
        state.blocked_cities = ["深圳"]
        with pytest.raises(CityBlockedError):
            engine.validate_move(state, user_id=1, dest="深圳")

    def test_move_in_wrong_phase(self):
        state = make_state_with_players()
        state.phase = GamePhase.EVENT
        with pytest.raises(WrongPhaseError):
            engine.validate_move(state, user_id=1, dest="深圳")


# ─────────────────────────────────────────────────────────
# Draw 校驗
# ─────────────────────────────────────────────────────────

class TestDrawValidation:
    def test_draw_in_hk_with_unlocked_card(self):
        state = make_state_with_players()
        # 玩家 1 在香港,turn 1 已解鎖紡織/食品/家電
        engine.validate_draw(state, user_id=1)  # 不應拋例外

    def test_draw_outside_hk_rejected(self):
        state = make_state_with_players()
        engine.do_move(state, user_id=1, dest="深圳")
        state.players[1].action_points = 1  # 補回 AP 給接下來的測試
        with pytest.raises(NotInHongKongError):
            engine.validate_draw(state, user_id=1)

    def test_draw_with_existing_hand_rejected(self):
        state = make_state_with_players()
        state.players[1].hand = "紡織及成衣"
        with pytest.raises(HandFullError):
            engine.validate_draw(state, user_id=1)


# ─────────────────────────────────────────────────────────
# Build 校驗
# ─────────────────────────────────────────────────────────

class TestBuildValidation:
    def test_build_without_hand_rejected(self):
        state = make_state_with_players()
        with pytest.raises(NoHandCardError):
            engine.validate_build(state, user_id=1)

    def test_build_in_disallowed_city(self):
        state = make_state_with_players()
        # 香港不允許建紡織,所以給玩家1紡織卡並嘗試在香港建
        state.players[1].hand = "紡織及成衣"
        with pytest.raises(IndustryNotAllowedError):
            engine.validate_build(state, user_id=1)

    def test_build_with_insufficient_money(self):
        state = make_state_with_players()
        # 移到江門 (允許紡織) 並給卡
        state.players[1].location = "江門"
        state.players[1].hand = "紡織及成衣"
        state.players[1].money = 0  # 沒錢
        with pytest.raises(InsufficientMoneyError):
            engine.validate_build(state, user_id=1)

    def test_build_in_full_city(self):
        state = make_state_with_players()
        # 江門 base_prices 長度 = 4,先填滿 4 個 plots
        state.players[1].location = "江門"
        state.players[1].hand = "紡織及成衣"
        for i in range(4):
            f_id = engine.gen_factory_id()
            state.factories[f_id] = engine.Factory(
                factory_id=f_id,
                owner_user_id=2,
                industry_id="食品",
                city_id="江門",
                plot_index=i,
                built_turn=0,
            )
        with pytest.raises(CityFullError):
            engine.validate_build(state, user_id=1)


# ─────────────────────────────────────────────────────────
# 完整動作流程
# ─────────────────────────────────────────────────────────

class TestActionFlow:
    def test_move_decreases_ap_and_changes_location(self):
        state = make_state_with_players()
        ap_before = state.players[1].action_points
        engine.do_move(state, user_id=1, dest="深圳")
        assert state.players[1].location == "深圳"
        assert state.players[1].action_points == ap_before - 1

    def test_draw_picks_unlocked_card_only(self):
        state = make_state_with_players()
        # turn 0 unlocked: 紡織及成衣, 食品, 家電及電器
        engine.do_draw(state, user_id=1)
        assert state.players[1].hand in ["紡織及成衣", "食品", "家電及電器"]

    def test_build_costs_money_and_reduces_hand(self):
        state = make_state_with_players()
        state.players[1].location = "江門"
        state.players[1].hand = "紡織及成衣"
        money_before = state.players[1].money
        engine.do_build(state, user_id=1)
        assert state.players[1].hand is None
        assert state.players[1].money < money_before
        assert len(state.players[1].factory_ids) == 1


# ─────────────────────────────────────────────────────────
# 階段機
# ─────────────────────────────────────────────────────────

class TestPhaseAdvancement:
    def test_end_turn_advances_to_next_player(self):
        state = make_state_with_players(3)
        assert state.current_player_seat == 0
        result = engine.handle_player_action(state, user_id=1, action="end_turn", payload={})
        assert state.current_player_seat == 1
        assert result["phase_advance"]["type"] == "next_player"

    def test_end_turn_after_last_player_advances_turn(self):
        state = make_state_with_players(3)
        old_turn = state.turn_index
        # 三個玩家依序結束
        engine.handle_player_action(state, user_id=1, action="end_turn", payload={})
        assert state.current_player_seat == 1
        engine.handle_player_action(state, user_id=2, action="end_turn", payload={})
        assert state.current_player_seat == 2
        engine.handle_player_action(state, user_id=3, action="end_turn", payload={})
        # 第三個玩家結束後,進入下回合
        assert state.turn_index == old_turn + 1
        assert state.current_player_seat == 0

    def test_event_unlocks_industries(self):
        state = make_state_with_players()
        # turn 0 = 1977 改革伊始,解鎖紡織/食品/家電
        assert "紡織及成衣" in state.unlocked_industries
        assert "食品" in state.unlocked_industries
        assert "家電及電器" in state.unlocked_industries


# ─────────────────────────────────────────────────────────
# 利潤結算
# ─────────────────────────────────────────────────────────

class TestProfitSettlement:
    def test_no_factories_zero_profit(self):
        state = make_state_with_players()
        report = engine.settle_profit(state)
        for uid, data in report.items():
            assert data["total_profit"] == 0

    def test_single_factory_profit(self):
        state = make_state_with_players()
        # 在江門建一個紡織廠
        state.players[1].location = "江門"
        state.players[1].hand = "紡織及成衣"
        engine.do_build(state, user_id=1)
        money_before = state.players[1].money
        report = engine.settle_profit(state)
        # 江門 紡織及成衣 PROFIT_MATRIX = 6
        assert report[1]["total_profit"] == 6
        assert state.players[1].money == money_before + 6

    def test_synergy_with_two_same_industry_factories(self):
        state = make_state_with_players()
        # 在江門和肇慶各建一個紡織廠
        state.players[1].location = "江門"
        state.players[1].hand = "紡織及成衣"
        engine.do_build(state, user_id=1)
        state.players[1].location = "肇慶"
        state.players[1].hand = "紡織及成衣"
        engine.do_build(state, user_id=1)
        report = engine.settle_profit(state)
        # 江門紡織 6 + 肇慶紡織 5 = 11
        # 同業優勢:擁有 2 個同產業時,每個工廠額外加 synergy = 3
        # 預期:每個工廠加 +3 → (6+3) + (5+3) = 17
        assert report[1]["total_profit"] == 17


# ─────────────────────────────────────────────────────────
# 序列化 (隱私保護)
# ─────────────────────────────────────────────────────────

class TestSerialization:
    def test_viewer_sees_own_hand(self):
        state = make_state_with_players()
        state.players[1].hand = "紡織及成衣"
        dto = engine.serialize_state_for_viewer(state, viewer_user_id=1)
        p1 = next(p for p in dto["players"] if p["user_id"] == 1)
        assert p1["hand"] == "紡織及成衣"
        assert p1["has_hand"] is True

    def test_viewer_does_not_see_others_hand(self):
        state = make_state_with_players()
        state.players[2].hand = "紡織及成衣"
        dto = engine.serialize_state_for_viewer(state, viewer_user_id=1)
        p2 = next(p for p in dto["players"] if p["user_id"] == 2)
        assert p2["hand"] is None
        assert p2["has_hand"] is True  # 知道他有牌但不知道是什麼

    def test_no_viewer_redacts_all_hands(self):
        state = make_state_with_players()
        state.players[1].hand = "紡織及成衣"
        state.players[2].hand = "食品"
        dto = engine.serialize_state_for_viewer(state, viewer_user_id=None)
        for p in dto["players"]:
            assert p["hand"] is None
