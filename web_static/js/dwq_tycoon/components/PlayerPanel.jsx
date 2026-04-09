/**
 * 大灣區大亨 — 玩家面板組件
 *
 * 顯示單個玩家的:
 *   - 名字、顏色、座位、是否房主
 *   - 金錢、AP、位置
 *   - 手中圖紙 (僅自己可見實際內容,他人只顯示「持有/未持有」)
 *   - 連線狀態 (在線/離線/AFK)
 *   - 是否當前回合的高亮
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    function PlayerPanel(props) {
        const player = props.player;
        const isCurrentTurn = props.isCurrentTurn;
        const isMe = props.isMe;
        const isHost = props.isHost;
        const maxAp = props.maxAp || 2;
        const C = window.DwqApp.constants;

        const handIndustry = player.hand ? C.INDUSTRIES[player.hand] : null;

        const statusBadge = !player.is_connected
            ? React.createElement('span', { className: 'text-red-500 text-xs font-bold ml-1' }, '🔴 離線')
            : player.is_afk
                ? React.createElement('span', { className: 'text-orange-500 text-xs font-bold ml-1' }, '⏸ AFK')
                : null;

        const hostBadge = isHost
            ? React.createElement('span', {
                className: 'bg-yellow-300 text-black text-[10px] px-1 border border-black ml-1',
              }, '房主')
            : null;

        const meBadge = isMe
            ? React.createElement('span', {
                className: 'bg-green-300 text-black text-[10px] px-1 border border-black ml-1',
              }, 'YOU')
            : null;

        return React.createElement('div', {
            className: 'pixel-box p-2 transition-colors duration-300 '
                + (isCurrentTurn ? 'bg-yellow-100 border-4 border-yellow-500' : 'bg-gray-100 border-4 border-gray-400')
                + (player.is_afk ? ' opacity-60' : ''),
        }, [
            React.createElement('div', {
                key: 'header',
                className: 'flex items-center justify-between border-b border-gray-300 pb-1 mb-1',
            }, [
                React.createElement('div', {
                    key: 'name',
                    className: 'flex items-center gap-1',
                }, [
                    React.createElement('div', {
                        key: 'dot',
                        className: 'w-3 h-3 rounded-full border border-black',
                        style: { backgroundColor: player.color },
                    }),
                    React.createElement('span', {
                        key: 'dn',
                        className: 'font-bold text-sm',
                    }, player.display_name),
                    hostBadge,
                    meBadge,
                    statusBadge,
                ]),
                React.createElement('span', {
                    key: 'money',
                    className: 'font-bold text-base text-green-700',
                }, '$' + player.money + '萬'),
            ]),
            React.createElement('div', {
                key: 'stats',
                className: 'grid grid-cols-3 gap-1 text-xs mt-1',
            }, [
                React.createElement('div', { key: 'ap' },
                    '⚡ ', React.createElement('span', { className: 'font-bold' }, player.action_points + '/' + maxAp)
                ),
                React.createElement('div', { key: 'loc' },
                    '📍 ', React.createElement('span', { className: 'font-bold' }, player.location || '-')
                ),
                React.createElement('div', { key: 'fc' },
                    '🏭 ', React.createElement('span', { className: 'font-bold' }, (player.factory_ids || []).length)
                ),
            ]),
            React.createElement('div', {
                key: 'hand',
                className: 'mt-1 pt-1 border-t border-gray-300 text-xs',
            }, [
                isMe
                    ? (handIndustry
                        ? React.createElement('span', {
                            key: 'h1',
                            className: 'inline-flex items-center gap-1 px-1 py-0.5 border border-black text-white font-bold ' + handIndustry.colorClass,
                          }, handIndustry.icon + ' ' + handIndustry.name)
                        : React.createElement('span', { key: 'h2', className: 'text-gray-500' }, '(無圖紙)'))
                    : (player.has_hand
                        ? React.createElement('span', { key: 'h3', className: 'text-gray-700' }, '🃏 持有圖紙')
                        : React.createElement('span', { key: 'h4', className: 'text-gray-500' }, '(無圖紙)')),
            ]),
        ]);
    }

    window.DwqApp.PlayerPanel = PlayerPanel;
})();
