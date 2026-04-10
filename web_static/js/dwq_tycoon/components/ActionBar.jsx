/**
 * 大灣區大亨 — 動作列組件
 *
 * 提供:建廠、結束回合按鈕
 * 移動是透過點擊地圖,不在這裡。
 * 選秀 (draft) 有專門的 DraftPanel 組件。
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

        // ── 動態主提示:告訴玩家「現在該做什麼」──────────
        let mainHint = null;
        let mainColor = 'bg-white border-gray-400 text-gray-800';

        if (state.phase === 'draft') {
            // 選秀階段
            const draftOrder = state.draft_order || [];
            const draftIdx = state.draft_current_idx || 0;
            const currentDrafter = draftIdx < draftOrder.length ? draftOrder[draftIdx] : null;
            if (currentDrafter === me.user_id) {
                mainHint = '🃏 輪到你選秀!請在下方選擇一張圖紙';
                mainColor = 'bg-blue-100 border-blue-600 text-blue-900 font-bold';
            } else {
                const drafter = state.players.find(function (p) { return p.user_id === currentDrafter; });
                mainHint = '🃏 選秀中 — 等待 ' + ((drafter || {}).display_name || '其他玩家') + ' 選擇...';
            }
        } else if (!isMyTurn) {
            const other = (state.players.find(function (p) { return p.user_id === state.current_player_user_id; }) || {}).display_name;
            mainHint = '⏳ 等待 ' + (other || '其他玩家') + ' 行動...';
        } else if (!hasAp && !isFreeBuild) {
            mainHint = '⚡ 行動點已用完 — 請點擊下方「結束」完成回合';
            mainColor = 'bg-orange-100 border-orange-500 text-orange-900 font-bold';
        } else if (hand && handInd) {
            // 有手牌 — 建廠路線
            if (!isUnlocked) {
                mainHint = '🔒 ' + handInd.icon + handInd.name + ' 尚未解鎖,等待歷史事件';
                mainColor = 'bg-yellow-50 border-yellow-500 text-yellow-900';
            } else if (!cityAllows) {
                const targets = Object.keys(C.CITIES).filter(function (cid) {
                    return C.CITIES[cid].allowed.indexOf(hand) >= 0;
                });
                mainHint = '🚶 手牌 ' + handInd.icon + handInd.name + ' — 移動到:' + targets.join('、') + ' 可建廠';
                mainColor = 'bg-blue-50 border-blue-500 text-blue-900';
            } else if (!cityNotBlocked) {
                mainHint = '🚧 此城市已被封,無法建廠,請移動或結束';
                mainColor = 'bg-yellow-50 border-yellow-500 text-yellow-900';
            } else if (!hasPlot) {
                mainHint = '🏗️ ' + curCityId + ' 地皮已滿,請移動到其他城市';
                mainColor = 'bg-yellow-50 border-yellow-500 text-yellow-900';
            } else if (canBuild) {
                mainHint = '✅ 可在 ' + curCityId + ' 建造 ' + handInd.icon + handInd.name + (isFreeBuild ? ' (免費!)' : ' — 點擊「建廠」');
                mainColor = 'bg-green-100 border-green-600 text-green-800 font-bold';
            }
        } else {
            // 無手牌 — 下回合選秀會分配
            mainHint = '📋 無圖紙 — 下回合選秀時會分配,先移動佈局吧';
            mainColor = 'bg-gray-100 border-gray-500 text-gray-700';
        }

        const canEndTurn = isMyTurn;

        return React.createElement('div', {
            className: 'flex flex-col gap-2 w-full',
        }, [
            // 主要動作提示
            React.createElement('div', {
                key: 'mainhint',
                className: 'text-xs md:text-sm p-2 border-2 text-center min-h-[36px] flex items-center justify-center ' + mainColor,
            }, mainHint || '—'),

            // 副提示
            isMyTurn ? React.createElement('div', {
                key: 'subhint',
                className: 'text-[10px] md:text-[11px] text-center text-gray-600 italic',
            }, '💡 點擊閃爍城市可移動 · 剩餘 AP: ' + myPlayer.action_points + '/' + (state.max_ap || 3)) : null,

            // 行動按鈕 (選秀階段隱藏)
            state.phase === 'action' ? React.createElement('div', {
                key: 'btns',
                className: 'flex flex-row gap-2 w-full',
            }, [
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
            ]) : null,
        ]);
    }

    window.DwqApp.ActionBar = ActionBar;
})();
