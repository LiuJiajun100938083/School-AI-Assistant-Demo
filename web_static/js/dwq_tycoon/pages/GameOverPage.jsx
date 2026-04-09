/**
 * 大灣區大亨 — 遊戲結束頁面
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    function GameOverPage() {
        const ctx = window.DwqApp.useDwq();
        const state = ctx.state;
        const dispatch = ctx.dispatch;
        const gs = state.gameState;

        if (!gs) {
            return React.createElement('div', { className: 'p-8 text-center' }, '載入結算中...');
        }

        const ranked = (gs.players || []).slice().sort(function (a, b) {
            return b.money - a.money;
        });

        function backToLobby() {
            window.DwqApp.session.clear();
            dispatch({ type: 'SET_ROOM_CODE', roomCode: null });
            dispatch({ type: 'SET_GAME_STATE', state: null });
            dispatch({ type: 'SET_VIEW', view: 'lobby' });
        }

        return React.createElement('div', {
            className: 'min-h-screen p-4 max-w-3xl mx-auto flex flex-col gap-4',
        }, [
            React.createElement('div', {
                key: 'h',
                className: 'pixel-panel p-4 text-center',
            }, [
                React.createElement('h1', {
                    key: 't',
                    className: 'text-3xl md:text-4xl font-black text-red-600',
                }, '🏆 遊戲結束!'),
                React.createElement('div', {
                    key: 'w',
                    className: 'text-xl mt-2',
                }, ranked.length > 0 ? '首富:' + ranked[0].display_name : ''),
            ]),
            React.createElement('div', {
                key: 'list',
                className: 'pixel-box p-4 flex flex-col gap-2',
            }, ranked.map(function (p, idx) {
                const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '🏅';
                return React.createElement('div', {
                    key: p.user_id,
                    className: 'flex items-center gap-3 p-3 border-2 border-black bg-white',
                }, [
                    React.createElement('div', { key: 'm', className: 'text-3xl' }, medal),
                    React.createElement('div', {
                        key: 'd',
                        className: 'w-6 h-6 rounded-full border-2 border-black',
                        style: { backgroundColor: p.color },
                    }),
                    React.createElement('div', { key: 'n', className: 'flex-grow' }, [
                        React.createElement('div', { key: 'dn', className: 'font-bold text-lg' }, p.display_name),
                        React.createElement('div', { key: 'fc', className: 'text-xs text-gray-600' },
                            '工廠 ' + (p.factory_ids || []).length + ' 座'),
                    ]),
                    React.createElement('div', {
                        key: 'm2',
                        className: 'font-black text-2xl text-green-700',
                    }, '💰 ' + p.money + '萬'),
                ]);
            })),
            React.createElement('button', {
                key: 'back',
                className: 'pixel-btn py-3 text-lg',
                onClick: backToLobby,
            }, '🔙 返回大廳'),
        ]);
    }

    window.DwqApp.GameOverPage = GameOverPage;
})();
