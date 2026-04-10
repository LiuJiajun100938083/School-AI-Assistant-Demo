/**
 * 大灣區大亨 — 其他小型組件 (合併在一起以減少檔案數)
 *
 * 包含:
 *   - TurnHeader 回合資訊條
 *   - EventModal 歷史事件彈窗
 *   - ProfitReport 利潤結算彈窗
 *   - ConnectionStatus 連線狀態指示器
 *   - ChatPanel 聊天面板 (簡單版)
 *   - EventLog 事件日誌
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const C_TURN_YEARS = function () { return window.DwqApp.constants.TURN_YEARS; };
    const C_MAX_TURNS = function () { return window.DwqApp.constants.MAX_TURNS; };

    // ─── TurnHeader ──────────────────────────────────────
    function TurnHeader(props) {
        const state = props.gameState;
        const me = props.me;
        if (!state) return null;
        const year = C_TURN_YEARS()[state.turn_index] || '';
        const phaseLabel = {
            event: '📜 歷史事件',
            profit: '💰 利潤結算',
            action: '🕹️ 玩家行動',
            finished: '🏆 遊戲結束',
        }[state.phase] || state.phase;

        const myUid = me ? me.user_id : null;
        const isMyTurn = state.current_player_user_id === myUid && state.phase === 'action';
        const currentPlayer = (state.players || []).find(function (p) {
            return p.user_id === state.current_player_user_id;
        });

        return React.createElement('div', {
            className: 'sticky top-0 z-40 flex flex-col gap-1',
        }, [
            React.createElement('div', {
                key: 'row1',
                className: 'pixel-panel p-2 md:p-3 flex items-center justify-between flex-wrap gap-2',
            }, [
                React.createElement('div', { key: 'left', className: 'flex items-center gap-2' }, [
                    React.createElement('div', {
                        key: 'turn',
                        className: 'bg-black text-yellow-400 px-3 py-1 text-sm font-bold border-2 border-black rounded',
                    }, '回合 ' + (state.turn_index + 1) + ' / ' + C_MAX_TURNS()),
                    React.createElement('div', {
                        key: 'year',
                        className: 'text-lg font-bold text-blue-900',
                    }, year + ' 年'),
                ]),
                React.createElement('div', {
                    key: 'phase',
                    className: 'bg-yellow-100 border-2 border-yellow-600 px-3 py-1 text-sm font-bold',
                }, phaseLabel),
            ]),
            // 輪次橫幅 — 動作階段時顯示誰的回合
            state.phase === 'action' ? React.createElement('div', {
                key: 'row2',
                className: 'pixel-box p-2 text-center font-bold text-sm md:text-base ' +
                    (isMyTurn ? 'bg-green-300 text-green-900' : 'bg-gray-200 text-gray-700'),
            }, isMyTurn
                ? '🎯 輪到您行動 — 點擊閃爍城市移動'
                : '⏳ 等待 ' + (currentPlayer ? currentPlayer.display_name : '其他玩家') + ' 行動...'
            ) : null,
        ]);
    }
    window.DwqApp.TurnHeader = TurnHeader;

    // ─── EventModal ──────────────────────────────────────
    function EventModal(props) {
        const event = props.event;
        const onClose = props.onClose;
        if (!event) return null;
        return React.createElement('div', {
            className: 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4',
        }, React.createElement('div', {
            className: 'pixel-box bg-[#f8fafc] w-full max-w-lg flex flex-col relative animate-popup shadow-2xl',
        }, [
            React.createElement('button', {
                key: 'x',
                onClick: onClose,
                className: 'absolute top-1 right-2 font-bold text-xl text-white hover:text-yellow-300 z-10 px-2',
            }, 'X'),
            React.createElement('div', {
                key: 'header',
                className: 'w-full h-12 bg-red-700 flex items-center justify-center text-white font-bold border-b-4 border-black text-lg',
            }, event.title + ' (' + event.year + ')'),
            React.createElement('div', { key: 'body', className: 'p-5 text-sm leading-relaxed text-gray-800' }, [
                React.createElement('p', { key: 'l', className: 'font-bold mb-2 border-b-2 border-gray-300 pb-1 inline-block' }, '【歷史背景】'),
                React.createElement('p', { key: 'd', className: 'mb-4 text-gray-700' }, event.desc),
                React.createElement('button', {
                    key: 'ok',
                    onClick: onClose,
                    className: 'pixel-btn py-2 px-4 w-full',
                }, '確認'),
            ]),
        ]));
    }
    window.DwqApp.EventModal = EventModal;

    // ─── ProfitReport ────────────────────────────────────
    function ProfitReport(props) {
        const report = props.report;
        const onClose = props.onClose;
        if (!report) return null;
        const items = Object.values(report);
        return React.createElement('div', {
            className: 'fixed inset-0 z-[100] flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4',
        }, React.createElement('div', {
            className: 'pixel-box bg-[#f8fafc] w-full max-w-md flex flex-col animate-popup shadow-2xl',
        }, [
            React.createElement('div', {
                key: 'h',
                className: 'w-full h-12 bg-blue-700 flex items-center justify-center text-white font-bold border-b-4 border-black text-lg',
            }, '📊 利潤結算'),
            React.createElement('div', { key: 'body', className: 'p-4 flex flex-col gap-2' }, [
                ...items.map(function (item, idx) {
                    var lines = [
                        React.createElement('div', { key: 'profit', className: 'flex justify-between' }, [
                            React.createElement('span', { key: 'l' }, '利潤'),
                            React.createElement('span', {
                                key: 'v',
                                className: 'font-bold ' + (item.total_profit >= 0 ? 'text-green-600' : 'text-red-600'),
                            }, (item.total_profit >= 0 ? '+' : '') + item.total_profit + ' 萬'),
                        ]),
                    ];
                    if (item.tax > 0) {
                        lines.push(React.createElement('div', { key: 'tax', className: 'flex justify-between text-sm text-red-500' }, [
                            React.createElement('span', { key: 'l' }, '🏛️ 地價稅'),
                            React.createElement('span', { key: 'v' }, '-' + item.tax + ' 萬'),
                        ]));
                    }
                    if (item.subsidy > 0) {
                        lines.push(React.createElement('div', { key: 'sub', className: 'flex justify-between text-sm text-blue-600' }, [
                            React.createElement('span', { key: 'l' }, '🏦 政策補貼'),
                            React.createElement('span', { key: 'v' }, '+' + item.subsidy + ' 萬'),
                        ]));
                    }
                    return React.createElement('div', {
                        key: idx,
                        className: 'p-2 border-2 border-black bg-white',
                    }, [
                        React.createElement('div', { key: 'name', className: 'font-bold mb-1' }, item.display_name),
                        ...lines,
                    ]);
                }),
                React.createElement('button', {
                    key: 'ok',
                    onClick: onClose,
                    className: 'pixel-btn py-2 mt-2',
                }, '確認'),
            ]),
        ]));
    }
    window.DwqApp.ProfitReport = ProfitReport;

    // ─── DraftPanel ──────────────────────────────────────
    function DraftPanel(props) {
        const state = props.gameState;
        const me = props.me;
        const onAction = props.onAction;
        const C = window.DwqApp.constants;

        if (!state || state.phase !== 'draft') return null;
        const pool = state.draft_pool || [];
        const order = state.draft_order || [];
        const idx = state.draft_current_idx || 0;
        if (!pool.length || idx >= order.length) return null;

        const isMyPick = order[idx] === me.user_id;
        const currentDrafter = state.players.find(function (p) { return p.user_id === order[idx]; });

        return React.createElement('div', {
            className: 'pixel-box bg-[#fffbeb] p-3 flex flex-col gap-2',
        }, [
            React.createElement('div', {
                key: 'title',
                className: 'text-center font-bold text-sm',
            }, '🃏 產業選秀 — ' + (isMyPick ? '輪到你!' : '等待 ' + ((currentDrafter || {}).display_name || '...'))),
            React.createElement('div', {
                key: 'order',
                className: 'text-[10px] text-center text-gray-500',
            }, '選秀順序 (資產低→高): ' + order.map(function (uid, i) {
                var p = state.players.find(function (pp) { return pp.user_id === uid; });
                return (i === idx ? '👉' : '') + ((p || {}).display_name || uid);
            }).join(' → ')),
            React.createElement('div', {
                key: 'cards',
                className: 'flex flex-wrap gap-2 justify-center',
            }, pool.map(function (industry) {
                var ind = C.INDUSTRIES[industry] || {};
                return React.createElement('button', {
                    key: industry,
                    className: 'pixel-btn py-2 px-3 text-xs ' + (isMyPick ? 'bg-yellow-300 hover:bg-yellow-200' : 'bg-gray-200 cursor-not-allowed'),
                    disabled: !isMyPick,
                    onClick: function () {
                        if (isMyPick) onAction('draft_pick', { industry: industry });
                    },
                }, (ind.icon || '') + ' ' + (ind.name || industry));
            })),
        ]);
    }
    window.DwqApp.DraftPanel = DraftPanel;

    // ─── ConnectionStatus ────────────────────────────────
    function ConnectionStatus(props) {
        const status = props.status;
        const colorMap = {
            open: 'bg-green-500',
            connecting: 'bg-yellow-500',
            reconnecting: 'bg-orange-500',
            closed: 'bg-red-500',
            idle: 'bg-gray-400',
        };
        const labelMap = {
            open: '已連線',
            connecting: '連線中',
            reconnecting: '重連中',
            closed: '已斷線',
            idle: '尚未連線',
        };
        return React.createElement('div', {
            className: 'flex items-center gap-1 text-xs',
        }, [
            React.createElement('div', {
                key: 'd',
                className: 'w-2 h-2 rounded-full ' + (colorMap[status] || 'bg-gray-400'),
            }),
            React.createElement('span', { key: 'l' }, labelMap[status] || status),
        ]);
    }
    window.DwqApp.ConnectionStatus = ConnectionStatus;

    // ─── EventLog ────────────────────────────────────────
    function EventLog(props) {
        const logs = (props.gameState && props.gameState.event_log) || [];
        return React.createElement('div', {
            className: 'pixel-box bg-gray-900 p-3 flex flex-col h-[200px] overflow-hidden',
        }, [
            React.createElement('div', {
                key: 'h',
                className: 'text-white border-b border-gray-700 pb-1 mb-2 font-bold text-sm',
            }, '>_ 系統日誌'),
            React.createElement('div', {
                key: 'body',
                className: 'flex-grow overflow-y-auto pr-2 text-xs font-mono',
            }, logs.map(function (l, i) {
                let cls = 'text-gray-200';
                if (l.type === 'error') cls = 'text-red-400 font-bold';
                else if (l.type === 'success') cls = 'text-green-300';
                else if (l.type === 'event') cls = 'text-yellow-300 font-bold';
                else if (l.type === 'sys') cls = 'text-blue-300';
                return React.createElement('div', { key: i, className: 'mb-1.5 leading-tight ' + cls }, l.msg);
            })),
        ]);
    }
    window.DwqApp.EventLog = EventLog;
})();
