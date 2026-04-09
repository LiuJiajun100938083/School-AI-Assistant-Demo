/**
 * 大灣區大亨 — 動作列組件
 *
 * 提供:抽卡、建廠、結束回合按鈕
 * 移動是透過點擊地圖,不在這裡。
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    function ActionBar(props) {
        const state = props.gameState;
        const me = props.me;
        const onAction = props.onAction;

        if (!state || !me) return null;

        const myPlayer = state.players.find(function (p) { return p.user_id === me.user_id; });
        const isMyTurn = state.current_player_user_id === me.user_id && state.phase === 'action';

        if (!myPlayer) return null;

        const canDraw = isMyTurn
            && myPlayer.action_points >= 1
            && myPlayer.location === '香港'
            && !myPlayer.hand;

        const canBuild = !!myPlayer.hand
            && (myPlayer.action_points >= 1 || state.free_build_city === myPlayer.location);

        const canEndTurn = isMyTurn;

        return React.createElement('div', {
            className: 'flex flex-col gap-2 w-full',
        }, [
            React.createElement('div', {
                key: 'hint',
                className: 'text-xs md:text-sm bg-white p-2 border-2 border-dashed border-gray-400 text-center min-h-[32px]',
            }, isMyTurn
                ? '💡 您的回合 — 點擊地圖閃爍城市移動,或使用下方動作'
                : ('⏳ 等待 ' + (state.players.find(function (p) { return p.user_id === state.current_player_user_id; }) || {}).display_name + ' 行動...')),

            React.createElement('div', {
                key: 'btns',
                className: 'flex flex-row gap-2 w-full',
            }, [
                React.createElement('button', {
                    key: 'draw',
                    className: 'pixel-btn py-2 flex-1 text-xs md:text-sm',
                    disabled: !canDraw,
                    onClick: function () { onAction('draw', {}); },
                }, '🃏 抽卡'),
                React.createElement('button', {
                    key: 'build',
                    className: 'pixel-btn py-2 flex-1 text-xs md:text-sm bg-green-500 hover:bg-green-400',
                    disabled: !canBuild,
                    onClick: function () { onAction('build', {}); },
                }, '🏭 建廠'),
                React.createElement('button', {
                    key: 'end',
                    className: 'pixel-btn py-2 flex-1 text-xs md:text-sm bg-red-400 hover:bg-red-300',
                    disabled: !canEndTurn,
                    onClick: function () { onAction('end_turn', {}); },
                }, '⏭️ 結束'),
            ]),
        ]);
    }

    window.DwqApp.ActionBar = ActionBar;
})();
