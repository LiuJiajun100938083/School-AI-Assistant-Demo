/**
 * 大灣區大亨 — 大廳頁面
 *
 * 功能:
 *   - 列出公開等待中的房間 (可加入)
 *   - 創建新房間 (公開或私人)
 *   - 透過房間碼加入私人房間
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const { useEffect, useState } = React;

    function LobbyPage() {
        const ctx = window.DwqApp.useDwq();
        const state = ctx.state;
        const dispatch = ctx.dispatch;
        const api = window.DwqApp.api;

        const [showCreate, setShowCreate] = useState(false);
        const [roomName, setRoomName] = useState('');
        const [maxPlayers, setMaxPlayers] = useState(4);
        const [isPublic, setIsPublic] = useState(true);
        const [joinCode, setJoinCode] = useState('');
        const [error, setError] = useState(null);

        async function refreshList() {
            dispatch({ type: 'LOBBY_LOADING' });
            try {
                const data = await api.listRooms();
                dispatch({ type: 'SET_PUBLIC_ROOMS', rooms: data.rooms || [] });
            } catch (e) {
                dispatch({ type: 'LOBBY_ERROR', error: e.message || '載入失敗' });
            }
        }

        useEffect(function () {
            refreshList();
            const timer = setInterval(refreshList, 5000);
            return function () { clearInterval(timer); };
        }, []);

        async function handleCreate() {
            setError(null);
            if (!roomName.trim()) {
                setError('請輸入房間名稱');
                return;
            }
            try {
                const data = await api.createRoom(roomName.trim(), maxPlayers, isPublic);
                dispatch({ type: 'SET_ROOM_CODE', roomCode: data.room_code });
                dispatch({ type: 'SET_VIEW', view: 'waiting' });
            } catch (e) {
                setError(e.message || '建立失敗');
            }
        }

        async function handleJoinByCode() {
            setError(null);
            if (!joinCode.trim()) {
                setError('請輸入房間碼');
                return;
            }
            try {
                const data = await api.joinByCode(joinCode.trim().toUpperCase());
                dispatch({ type: 'SET_ROOM_CODE', roomCode: data.room_code });
                dispatch({ type: 'SET_VIEW', view: 'waiting' });
            } catch (e) {
                setError(e.message || '加入失敗');
            }
        }

        async function handleJoinPublic(code) {
            setError(null);
            try {
                const data = await api.joinRoom(code);
                dispatch({ type: 'SET_ROOM_CODE', roomCode: data.room_code });
                dispatch({ type: 'SET_VIEW', view: 'waiting' });
            } catch (e) {
                setError(e.message || '加入失敗');
            }
        }

        const rooms = state.publicRooms || [];

        return React.createElement('div', {
            className: 'min-h-screen p-4 max-w-5xl mx-auto',
        }, [
            // 頁首
            React.createElement('div', {
                key: 'header',
                className: 'pixel-panel p-4 mb-4 flex items-center justify-between flex-wrap gap-2',
            }, [
                React.createElement('h1', {
                    key: 'title',
                    className: 'text-2xl md:text-3xl font-black text-blue-900',
                }, '🏙️ 大灣區大亨 — 多人對戰'),
                React.createElement('span', {
                    key: 'me',
                    className: 'text-sm text-gray-700',
                }, state.me ? '👤 ' + state.me.display_name : ''),
            ]),

            // 操作區
            React.createElement('div', {
                key: 'actions',
                className: 'flex flex-wrap gap-2 mb-4',
            }, [
                React.createElement('button', {
                    key: 'create',
                    className: 'pixel-btn py-2 px-4 bg-green-500 hover:bg-green-400',
                    onClick: function () { setShowCreate(true); },
                }, '➕ 創建房間'),
                React.createElement('button', {
                    key: 'refresh',
                    className: 'pixel-btn py-2 px-4 bg-blue-300',
                    onClick: refreshList,
                }, '🔄 重新整理'),
                React.createElement('div', {
                    key: 'join-by-code',
                    className: 'flex gap-1',
                }, [
                    React.createElement('input', {
                        key: 'i',
                        type: 'text',
                        placeholder: '房間碼',
                        value: joinCode,
                        onChange: function (e) { setJoinCode(e.target.value.toUpperCase()); },
                        className: 'border-2 border-black px-2 py-1 font-mono uppercase w-28',
                    }),
                    React.createElement('button', {
                        key: 'b',
                        className: 'pixel-btn py-2 px-3',
                        onClick: handleJoinByCode,
                    }, '🔑 加入'),
                ]),
            ]),

            // 錯誤
            error ? React.createElement('div', {
                key: 'err',
                className: 'bg-red-100 border-2 border-red-500 p-2 mb-2 text-red-700',
            }, '❌ ' + error) : null,

            // 房間列表
            React.createElement('div', {
                key: 'list',
                className: 'pixel-box p-4',
            }, [
                React.createElement('h3', {
                    key: 'h3',
                    className: 'font-bold text-lg mb-2 border-b-2 border-black pb-1',
                }, '📋 公開房間 (' + rooms.length + ')'),
                state.lobbyLoading
                    ? React.createElement('div', { key: 'loading', className: 'text-gray-500 py-4 text-center' }, '載入中...')
                    : rooms.length === 0
                        ? React.createElement('div', { key: 'empty', className: 'text-gray-500 py-4 text-center' }, '暫無公開房間,試試自己創建一個吧!')
                        : React.createElement('div', { key: 'rooms', className: 'flex flex-col gap-2' },
                            rooms.map(function (room) {
                                return React.createElement('div', {
                                    key: room.room_code,
                                    className: 'flex items-center justify-between p-2 border-2 border-black bg-white',
                                }, [
                                    React.createElement('div', { key: 'l' }, [
                                        React.createElement('div', { key: 'n', className: 'font-bold' },
                                            room.room_name + ' '),
                                        React.createElement('span', {
                                            key: 'c',
                                            className: 'text-xs font-mono bg-yellow-200 px-1 border border-black',
                                        }, room.room_code),
                                        React.createElement('div', { key: 'p', className: 'text-xs text-gray-600' },
                                            '玩家 ' + room.player_count + '/' + room.max_players),
                                    ]),
                                    React.createElement('button', {
                                        key: 'b',
                                        className: 'pixel-btn py-1 px-3 text-sm',
                                        disabled: !room.can_join,
                                        onClick: function () { handleJoinPublic(room.room_code); },
                                    }, room.can_join ? '加入' : '已滿'),
                                ]);
                            })),
            ]),

            // 創建房間 modal
            showCreate ? React.createElement('div', {
                key: 'modal',
                className: 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 p-4',
            }, React.createElement('div', {
                className: 'pixel-box bg-white w-full max-w-md p-4',
            }, [
                React.createElement('h3', { key: 'h', className: 'text-lg font-bold mb-3 border-b-2 border-black pb-1' }, '創建新房間'),
                React.createElement('div', { key: 'fields', className: 'flex flex-col gap-3' }, [
                    React.createElement('div', { key: 'name' }, [
                        React.createElement('label', { key: 'l', className: 'text-sm font-bold block mb-1' }, '房間名稱'),
                        React.createElement('input', {
                            key: 'i',
                            type: 'text',
                            value: roomName,
                            onChange: function (e) { setRoomName(e.target.value); },
                            placeholder: '例如:同學對戰',
                            className: 'border-2 border-black px-2 py-1 w-full',
                            maxLength: 40,
                        }),
                    ]),
                    React.createElement('div', { key: 'mp' }, [
                        React.createElement('label', { key: 'l', className: 'text-sm font-bold block mb-1' }, '最大玩家數'),
                        React.createElement('select', {
                            key: 'i',
                            value: maxPlayers,
                            onChange: function (e) { setMaxPlayers(parseInt(e.target.value, 10)); },
                            className: 'border-2 border-black px-2 py-1 w-full',
                        }, [3, 4, 5, 6].map(function (n) {
                            return React.createElement('option', { key: n, value: n }, n + ' 人');
                        })),
                    ]),
                    React.createElement('div', { key: 'pub' }, [
                        React.createElement('label', { key: 'l', className: 'flex items-center gap-2 cursor-pointer' }, [
                            React.createElement('input', {
                                key: 'i',
                                type: 'checkbox',
                                checked: isPublic,
                                onChange: function (e) { setIsPublic(e.target.checked); },
                                className: 'w-4 h-4 accent-black',
                            }),
                            React.createElement('span', { key: 's', className: 'text-sm' }, '公開房間 (顯示在大廳列表)'),
                        ]),
                    ]),
                ]),
                React.createElement('div', { key: 'btns', className: 'flex gap-2 mt-4' }, [
                    React.createElement('button', {
                        key: 'cancel',
                        className: 'pixel-btn py-2 px-4 flex-1 bg-gray-300',
                        onClick: function () { setShowCreate(false); },
                    }, '取消'),
                    React.createElement('button', {
                        key: 'create',
                        className: 'pixel-btn py-2 px-4 flex-1 bg-green-500',
                        onClick: handleCreate,
                    }, '創建'),
                ]),
            ])) : null,
        ]);
    }

    window.DwqApp.LobbyPage = LobbyPage;
})();
