/**
 * 大灣區大亨 — 客戶端狀態管理 (React Context + reducer)
 *
 * 此檔案使用 Babel JSX (text/babel),依賴 React 全域。
 * 對外介面: window.DwqApp.{DwqProvider, useDwq, initialState, reducer}
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    const { createContext, useReducer, useContext } = React;

    const initialState = {
        // ── 路由 ──
        view: 'lobby',  // 'lobby' | 'waiting' | 'game' | 'gameover'

        // ── 用戶 ──
        me: null,       // {user_id, username, display_name, ...}

        // ── 房間/遊戲狀態 ──
        roomCode: null,
        gameState: null,    // 從 server 推送的完整 GameStateDTO
        connectionStatus: 'idle', // idle | connecting | open | reconnecting | closed

        // ── UI 狀態 ──
        selectedCity: null,
        eventModalShown: false,
        profitModalShown: false,
        profitReport: null,
        lastEventResult: null,
        actionError: null,
        chatMessages: [],

        // ── Lobby ──
        publicRooms: [],
        lobbyLoading: false,
        lobbyError: null,
    };

    function reducer(state, action) {
        switch (action.type) {
            case 'SET_VIEW':
                return Object.assign({}, state, { view: action.view });
            case 'SET_ME':
                return Object.assign({}, state, { me: action.me });
            case 'SET_ROOM_CODE':
                return Object.assign({}, state, { roomCode: action.roomCode });
            case 'SET_GAME_STATE':
                return Object.assign({}, state, { gameState: action.state });
            case 'PATCH_GAME_STATE':
                return Object.assign({}, state, {
                    gameState: Object.assign({}, state.gameState, action.patch),
                });
            case 'SET_CONN_STATUS':
                return Object.assign({}, state, { connectionStatus: action.status });
            case 'SET_SELECTED_CITY':
                return Object.assign({}, state, { selectedCity: action.city });
            case 'SHOW_EVENT_MODAL':
                return Object.assign({}, state, {
                    eventModalShown: true,
                    lastEventResult: action.result,
                });
            case 'HIDE_EVENT_MODAL':
                return Object.assign({}, state, { eventModalShown: false });
            case 'SHOW_PROFIT_MODAL':
                return Object.assign({}, state, {
                    profitModalShown: true,
                    profitReport: action.report,
                });
            case 'HIDE_PROFIT_MODAL':
                return Object.assign({}, state, { profitModalShown: false });
            case 'SET_ACTION_ERROR':
                return Object.assign({}, state, { actionError: action.error });
            case 'CLEAR_ACTION_ERROR':
                return Object.assign({}, state, { actionError: null });
            case 'SET_PUBLIC_ROOMS':
                return Object.assign({}, state, {
                    publicRooms: action.rooms,
                    lobbyLoading: false,
                    lobbyError: null,
                });
            case 'LOBBY_LOADING':
                return Object.assign({}, state, { lobbyLoading: true, lobbyError: null });
            case 'LOBBY_ERROR':
                return Object.assign({}, state, {
                    lobbyError: action.error,
                    lobbyLoading: false,
                });
            case 'APPEND_CHAT':
                return Object.assign({}, state, {
                    chatMessages: state.chatMessages.concat([action.msg]).slice(-50),
                });
            case 'RESET':
                return Object.assign({}, initialState, {
                    me: state.me,
                    view: 'lobby',
                });
            default:
                return state;
        }
    }

    const DwqContext = createContext(null);

    function DwqProvider(props) {
        const [state, dispatch] = useReducer(reducer, initialState);
        return React.createElement(
            DwqContext.Provider,
            { value: { state, dispatch } },
            props.children
        );
    }

    function useDwq() {
        return useContext(DwqContext);
    }

    window.DwqApp.DwqProvider = DwqProvider;
    window.DwqApp.useDwq = useDwq;
    window.DwqApp.initialState = initialState;
    window.DwqApp.reducer = reducer;
})();
