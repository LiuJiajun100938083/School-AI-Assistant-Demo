/**
 * 大灣區大亨 — 等待房間頁面
 *
 * 顯示:
 *   - 房間碼 (可點擊複製)
 *   - 玩家列表
 *   - 房主可點開始遊戲 (人數 >= 3 時)
 *   - 玩家可離開房間
 *
 * 透過 WebSocket 接收 player_joined / player_left 等事件即時更新。
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const { useEffect, useState, useRef } = React;

    function WaitingRoomPage() {
        const ctx = window.DwqApp.useDwq();
        const state = ctx.state;
        const dispatch = ctx.dispatch;
        const api = window.DwqApp.api;

        const wsRef = useRef(null);
        const [error, setError] = useState(null);

        useEffect(function () {
            if (!state.roomCode) return;

            const token = api.getAuthToken();
            if (!token) {
                console.error('[WaitingRoom] no auth token');
                return;
            }
            const ws = new window.DwqApp.DwqSocket(
                state.roomCode,
                token,
                function (msg) {
                    handleMessage(msg);
                },
                function (status) {
                    dispatch({ type: 'SET_CONN_STATUS', status: status });
                }
            );
            wsRef.current = ws;

            return function () {
                ws.close();
            };
        }, [state.roomCode]);

        function handleMessage(msg) {
            if (msg.type === 'room_state') {
                dispatch({ type: 'SET_GAME_STATE', state: msg.state });
                window.DwqApp.session.updateSnapshot(state.roomCode, msg.state);
                if (msg.state.status === 'running') {
                    dispatch({ type: 'SET_VIEW', view: 'game' });
                } else if (msg.state.status === 'finished') {
                    dispatch({ type: 'SET_VIEW', view: 'gameover' });
                }
            } else if (msg.type === 'game_started') {
                dispatch({ type: 'SET_VIEW', view: 'game' });
            } else if (msg.type === 'action_error') {
                setError(msg.message);
                setTimeout(function () { setError(null); }, 4000);
            } else if (
                msg.type === 'player_joined' ||
                msg.type === 'player_left' ||
                msg.type === 'player_reconnected' ||
                msg.type === 'player_disconnected' ||
                msg.type === 'host_changed' ||
                msg.type === 'connected'
            ) {
                // 增量事件 — 拉取完整 room_state 重渲染
                if (wsRef.current) wsRef.current.requestState();
            }
        }

        function handleStart() {
            if (wsRef.current) {
                wsRef.current.sendAction('start_game', {});
            }
        }

        async function handleLeave() {
            try {
                await api.leaveRoom(state.roomCode);
            } catch (e) {}
            if (wsRef.current) wsRef.current.close();
            window.DwqApp.session.clear();
            dispatch({ type: 'SET_ROOM_CODE', roomCode: null });
            dispatch({ type: 'SET_GAME_STATE', state: null });
            dispatch({ type: 'SET_VIEW', view: 'lobby' });
        }

        function copyCode() {
            if (navigator.clipboard) {
                navigator.clipboard.writeText(state.roomCode);
            }
        }

        const gs = state.gameState;
        const players = (gs && gs.players) || [];
        const isHost = gs && state.me && gs.host_user_id === state.me.user_id;
        const canStart = isHost && players.length >= 3;

        return React.createElement('div', {
            className: 'min-h-screen p-4 max-w-3xl mx-auto',
        }, [
            React.createElement('div', {
                key: 'header',
                className: 'pixel-panel p-4 mb-4',
            }, [
                React.createElement('div', {
                    key: 'title',
                    className: 'flex items-center justify-between flex-wrap gap-2',
                }, [
                    React.createElement('h1', {
                        key: 'h',
                        className: 'text-xl md:text-2xl font-black text-blue-900',
                    }, '⏳ 等待房間'),
                    React.createElement(window.DwqApp.ConnectionStatus, {
                        key: 'cs',
                        status: state.connectionStatus,
                    }),
                ]),
                React.createElement('div', {
                    key: 'code',
                    className: 'mt-2 flex items-center gap-2',
                }, [
                    React.createElement('span', { key: 'l', className: 'text-sm font-bold' }, '房間碼:'),
                    React.createElement('span', {
                        key: 'c',
                        className: 'text-2xl font-mono bg-yellow-300 border-2 border-black px-3 py-1 cursor-pointer',
                        onClick: copyCode,
                        title: '點擊複製',
                    }, state.roomCode),
                    React.createElement('span', {
                        key: 'h',
                        className: 'text-xs text-gray-600',
                    }, '(點擊複製分享給朋友)'),
                ]),
                React.createElement('div', {
                    key: 'name',
                    className: 'mt-1 text-sm text-gray-700',
                }, gs ? '房間名稱:' + gs.room_name : ''),
            ]),

            error ? React.createElement('div', {
                key: 'err',
                className: 'bg-red-100 border-2 border-red-500 p-2 mb-2 text-red-700',
            }, '❌ ' + error) : null,

            React.createElement('div', {
                key: 'players',
                className: 'pixel-box p-4 mb-4',
            }, [
                React.createElement('h3', { key: 'h', className: 'font-bold text-lg mb-2' },
                    '👥 玩家 (' + players.length + '/' + (gs ? gs.max_players : '?') + ')'),
                React.createElement('div', { key: 'list', className: 'flex flex-col gap-2' },
                    players.map(function (p) {
                        return React.createElement('div', {
                            key: p.user_id,
                            className: 'flex items-center gap-3 p-2 border-2 border-black bg-white',
                        }, [
                            React.createElement('div', {
                                key: 'd',
                                className: 'w-6 h-6 rounded-full border-2 border-black',
                                style: { backgroundColor: p.color },
                            }),
                            React.createElement('span', { key: 'n', className: 'flex-grow font-bold' }, p.display_name),
                            gs.host_user_id === p.user_id ? React.createElement('span', {
                                key: 'h',
                                className: 'bg-yellow-300 text-black text-xs px-1 border border-black',
                            }, '房主') : null,
                            !p.is_connected ? React.createElement('span', {
                                key: 'off',
                                className: 'text-red-500 text-xs',
                            }, '🔴 離線') : null,
                        ]);
                    })),
                players.length < 3 ? React.createElement('div', {
                    key: 'wait',
                    className: 'mt-3 text-sm text-orange-700 bg-orange-50 p-2 border border-orange-300',
                }, '⏳ 至少需要 3 人才能開始遊戲') : null,
            ]),

            React.createElement('div', {
                key: 'actions',
                className: 'flex gap-2',
            }, [
                isHost ? React.createElement('button', {
                    key: 'start',
                    className: 'pixel-btn py-3 px-4 flex-1 text-base bg-green-500 hover:bg-green-400',
                    disabled: !canStart,
                    onClick: handleStart,
                }, canStart ? '🚀 開始遊戲' : '等待玩家...') : null,
                React.createElement('button', {
                    key: 'leave',
                    className: 'pixel-btn py-3 px-4 flex-1 text-base bg-red-400 hover:bg-red-300',
                    onClick: handleLeave,
                }, '🚪 離開房間'),
            ]),
        ]);
    }

    window.DwqApp.WaitingRoomPage = WaitingRoomPage;
})();
