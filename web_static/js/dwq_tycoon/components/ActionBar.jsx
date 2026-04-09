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
        const C = window.DwqApp.constants;

        if (!state || !me) return null;

        const myPlayer = state.players.find(function (p) { return p.user_id === me.user_id; });
        const isMyTurn = state.current_player_user_id === me.user_id && state.phase === 'action';

        if (!myPlayer) return null;

        const canDraw = isMyTurn
            && myPlayer.action_points >= 1
            && myPlayer.location === '香港'
            && !myPlayer.hand;

        // 建廠條件逐一檢查,以便給出具體提示
        const hand = myPlayer.hand;
        const curCityId = myPlayer.location;
        const curCity = curCityId ? C.CITIES[curCityId] : null;
        const handInd = hand ? C.INDUSTRIES[hand] : null;
        const isUnlocked = hand && (state.unlocked_industries || []).indexOf(hand) >= 0;
        const cityAllows = hand && curCity && curCity.allowed.indexOf(hand) >= 0;
        const cityNotBlocked = curCity && (state.blocked_cities || []).indexOf(curCityId) < 0;
        const factoriesHere = Object.values(state.factories || {})
            .filter(function (f) { return f.city_id === curCityId; }).length;
        const hasPlot = curCity && factoriesHere < curCity.basePricesLen;
        const isFreeBuild = state.free_build_city === curCityId;
        const hasAp = myPlayer.action_points >= 1;

        const canBuild = isMyTurn && !!hand && isUnlocked && cityAllows && cityNotBlocked && hasPlot && (hasAp || isFreeBuild);

        // 建廠提示:為什麼不能建?
        let buildHint = null;
        if (hand && handInd) {
            if (!isUnlocked) {
                buildHint = '🔒 ' + handInd.name + ' 尚未解鎖,等待歷史事件';
            } else if (!cityAllows) {
                // 建議去哪裡建
                const targets = Object.keys(C.CITIES).filter(function (cid) {
                    return C.CITIES[cid].allowed.indexOf(hand) >= 0;
                });
                buildHint = '🚶 需移動到可建 ' + handInd.icon + handInd.name + ' 的城市:' + targets.join('、');
            } else if (!cityNotBlocked) {
                buildHint = '🚧 此城市已被封,無法建廠';
            } else if (!hasPlot) {
                buildHint = '🏗️ ' + curCityId + ' 地皮已滿';
            } else if (!hasAp && !isFreeBuild) {
                buildHint = '⚡ 行動點不足,請結束回合';
            } else if (canBuild) {
                buildHint = '✅ 可在 ' + curCityId + ' 建造 ' + handInd.icon + handInd.name + (isFreeBuild ? ' (免費!)' : '');
            }
        }

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

            // 建廠狀態提示 — 有手牌時顯示
            buildHint ? React.createElement('div', {
                key: 'bh',
                className: 'text-[11px] md:text-xs p-2 border-2 text-center ' +
                    (canBuild ? 'bg-green-100 border-green-600 text-green-800 font-bold' : 'bg-yellow-50 border-yellow-500 text-yellow-900'),
            }, buildHint) : null,

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
