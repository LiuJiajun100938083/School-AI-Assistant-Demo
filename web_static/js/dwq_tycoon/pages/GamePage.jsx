/**
 * 大灣區大亨 — 主遊戲頁面
 *
 * 整合:
 *   - 地圖 (MapCanvas)
 *   - 玩家面板 (PlayerPanel × N)
 *   - 動作列 (ActionBar)
 *   - 回合資訊 (TurnHeader)
 *   - 事件/結算彈窗 (EventModal/ProfitReport)
 *   - 系統日誌 (EventLog)
 *
 * 透過 WebSocket 接收 server 推送的 room_state 並渲染。
 * 所有玩家動作通過 ws.sendAction(),不在客戶端計算遊戲狀態。
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const { useEffect, useRef, useState } = React;

    function GamePage() {
        const ctx = window.DwqApp.useDwq();
        const state = ctx.state;
        const dispatch = ctx.dispatch;
        const api = window.DwqApp.api;

        const wsRef = useRef(null);
        const [eventModalEvent, setEventModalEvent] = useState(null);
        const [profitModal, setProfitModal] = useState(null);

        // 建立 WebSocket
        useEffect(function () {
            if (!state.roomCode || wsRef.current) return;

            const token = api.getAuthToken();
            const ws = new window.DwqApp.DwqSocket(
                state.roomCode,
                token,
                handleMessage,
                function (status) {
                    dispatch({ type: 'SET_CONN_STATUS', status: status });
                }
            );
            wsRef.current = ws;

            return function () {
                if (wsRef.current) {
                    wsRef.current.close();
                    wsRef.current = null;
                }
            };
        }, [state.roomCode]);

        function handleMessage(msg) {
            if (msg.type === 'room_state') {
                dispatch({ type: 'SET_GAME_STATE', state: msg.state });
                window.DwqApp.session.updateSnapshot(state.roomCode, msg.state);
                if (msg.state.status === 'finished') {
                    dispatch({ type: 'SET_VIEW', view: 'gameover' });
                }
            } else if (msg.type === 'turn_started') {
                if (msg.event_result && msg.event_result.event) {
                    setEventModalEvent(msg.event_result.event);
                }
                if (msg.profit_report) {
                    setProfitModal(msg.profit_report);
                }
            } else if (msg.type === 'game_over') {
                dispatch({ type: 'SET_VIEW', view: 'gameover' });
            } else if (msg.type === 'action_error') {
                dispatch({ type: 'SET_ACTION_ERROR', error: msg.message });
                setTimeout(function () {
                    dispatch({ type: 'CLEAR_ACTION_ERROR' });
                }, 4000);
            } else if (
                msg.type === 'player_disconnected' ||
                msg.type === 'player_reconnected' ||
                msg.type === 'player_left' ||
                msg.type === 'host_changed'
            ) {
                if (wsRef.current) wsRef.current.requestState();
            }
        }

        function sendAction(action, payload) {
            if (wsRef.current) {
                wsRef.current.sendAction(action, payload);
            }
        }

        function handleCityClick(cityId) {
            sendAction('move', { to: cityId });
        }

        async function handleLeave() {
            if (!confirm('確定要離開遊戲嗎?')) return;
            try {
                await api.leaveRoom(state.roomCode);
            } catch (e) {}
            if (wsRef.current) wsRef.current.close();
            window.DwqApp.session.clear();
            dispatch({ type: 'SET_ROOM_CODE', roomCode: null });
            dispatch({ type: 'SET_GAME_STATE', state: null });
            dispatch({ type: 'SET_VIEW', view: 'lobby' });
        }

        const gs = state.gameState;
        if (!gs) {
            return React.createElement('div', { className: 'p-8 text-center' }, '載入遊戲狀態...');
        }

        const me = state.me;

        return React.createElement('div', {
            className: 'min-h-screen p-2 md:p-4 max-w-7xl mx-auto flex flex-col gap-3',
        }, [
            // 頂部:回合資訊 + 連線狀態 + 離開按鈕
            React.createElement('div', { key: 'top', className: 'flex items-stretch gap-2' }, [
                React.createElement('div', { key: 'th', className: 'flex-grow' },
                    React.createElement(window.DwqApp.TurnHeader, { gameState: gs, me: me })),
                React.createElement('div', {
                    key: 'right',
                    className: 'flex flex-col gap-1 items-end',
                }, [
                    React.createElement(window.DwqApp.ConnectionStatus, {
                        key: 'cs',
                        status: state.connectionStatus,
                    }),
                    React.createElement('button', {
                        key: 'leave',
                        className: 'pixel-btn py-1 px-2 text-xs bg-red-300',
                        onClick: handleLeave,
                    }, '🚪 離開'),
                ]),
            ]),

            // 錯誤提示
            state.actionError ? React.createElement('div', {
                key: 'err',
                className: 'bg-red-100 border-2 border-red-500 p-2 text-red-700 font-bold',
            }, '❌ ' + state.actionError) : null,

            // 主要區域:地圖 + 右側面板
            React.createElement('div', {
                key: 'main',
                className: 'flex flex-col lg:flex-row gap-3',
            }, [
                React.createElement('div', { key: 'map', className: 'flex-grow' },
                    React.createElement(window.DwqApp.MapCanvas, {
                        gameState: gs,
                        me: me,
                        onCityClick: handleCityClick,
                    })),
                React.createElement('div', {
                    key: 'side',
                    className: 'lg:w-72 flex flex-col gap-2',
                }, [
                    // 選秀面板 (DRAFT 階段顯示)
                    React.createElement(window.DwqApp.DraftPanel, {
                        key: 'draft',
                        gameState: gs,
                        me: me,
                        onAction: sendAction,
                    }),
                    // 動作列
                    React.createElement(window.DwqApp.ActionBar, {
                        key: 'ab',
                        gameState: gs,
                        me: me,
                        onAction: sendAction,
                    }),
                    // 玩家列表
                    React.createElement('div', { key: 'players', className: 'flex flex-col gap-2' },
                        gs.players.map(function (p) {
                            return React.createElement(window.DwqApp.PlayerPanel, {
                                key: p.user_id,
                                player: p,
                                isCurrentTurn: (p.user_id === gs.current_player_user_id && gs.phase === 'action')
                                    || (gs.phase === 'draft' && gs.draft_order && gs.draft_order[gs.draft_current_idx || 0] === p.user_id),
                                isMe: me && p.user_id === me.user_id,
                                isHost: p.user_id === gs.host_user_id,
                                maxAp: gs.max_ap,
                            });
                        })),
                ]),
            ]),

            // 事件背景 + 日誌
            React.createElement('div', { key: 'bottom', className: 'grid grid-cols-1 md:grid-cols-2 gap-3' }, [
                gs.current_event ? React.createElement('div', { key: 'evt', className: 'pixel-box bg-[#f8fafc] flex flex-col h-[200px]' }, [
                    React.createElement('div', {
                        key: 'h',
                        className: 'h-8 bg-red-700 flex items-center justify-center text-white font-bold border-b-4 border-black',
                    }, gs.current_event.title + ' (' + gs.current_event.year + ')'),
                    React.createElement('div', {
                        key: 'b',
                        className: 'p-3 text-xs overflow-y-auto leading-relaxed',
                    }, [
                        React.createElement('p', { key: 'l', className: 'font-bold mb-1 text-blue-800' }, '【當前開放產業】'),
                        React.createElement('div', { key: 'inds', className: 'flex flex-wrap gap-1 mb-2' },
                            (gs.unlocked_industries || []).map(function (ind) {
                                const meta = window.DwqApp.constants.INDUSTRIES[ind];
                                return meta ? React.createElement('span', {
                                    key: ind,
                                    className: 'text-[10px] px-1 text-white border border-black ' + meta.colorClass,
                                }, ind) : null;
                            })),
                        React.createElement('p', { key: 'd', className: 'text-gray-700 text-xs' }, gs.current_event.desc),
                    ]),
                ]) : null,
                React.createElement(window.DwqApp.EventLog, { key: 'log', gameState: gs }),
            ]),

            // 事件彈窗
            eventModalEvent ? React.createElement(window.DwqApp.EventModal, {
                key: 'em',
                event: eventModalEvent,
                onClose: function () { setEventModalEvent(null); },
            }) : null,

            // 結算彈窗
            profitModal ? React.createElement(window.DwqApp.ProfitReport, {
                key: 'pr',
                report: profitModal,
                onClose: function () { setProfitModal(null); },
            }) : null,
        ]);
    }

    window.DwqApp.GamePage = GamePage;
})();
