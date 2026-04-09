/**
 * 大灣區大亨 — 地圖組件
 *
 * 顯示:
 *   - 11 個 GBA 城市 (位置、顏色、產業圖示預覽)
 *   - 基礎連線 (虛線白色) + 已解鎖動態連線 (彩色)
 *   - 玩家棋子 (按 seat 顏色)
 *   - 各城市的地皮 (空地/已建工廠)
 *   - 點擊城市發起移動 (僅限相鄰且輪到自己時)
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const { useMemo, useState } = React;

    function MapCanvas(props) {
        const state = props.gameState;
        const me = props.me;
        const onCityClick = props.onCityClick || function () {};
        const C = window.DwqApp.constants;

        const [detailCityId, setDetailCityId] = useState(null);

        if (!state) return null;

        const turnIndex = state.turn_index || 0;
        const myUid = me ? me.user_id : null;
        const myPlayer = state.players.find(function (p) { return p.user_id === myUid; });
        const isMyTurn = state.current_player_user_id === myUid && state.phase === 'action';
        const isAction = state.phase === 'action';

        const adjacency = useMemo(function () {
            return C.getConnectionsForTurn(turnIndex);
        }, [turnIndex]);

        const movableSet = useMemo(function () {
            if (!isMyTurn || !myPlayer) return new Set();
            const adj = adjacency[myPlayer.location];
            return adj || new Set();
        }, [isMyTurn, myPlayer, adjacency]);

        // 按城市分組工廠
        const factoriesByCity = useMemo(function () {
            const m = {};
            Object.values(state.factories).forEach(function (f) {
                if (!m[f.city_id]) m[f.city_id] = [];
                m[f.city_id].push(f);
            });
            return m;
        }, [state.factories]);

        // 可建廠城市集合 — 有手牌時計算,排除已滿/封城/產業未解鎖
        const buildableSet = useMemo(function () {
            const s = new Set();
            if (!myPlayer || !myPlayer.hand) return s;
            const industry = myPlayer.hand;
            if ((state.unlocked_industries || []).indexOf(industry) < 0) return s;
            const blocked = state.blocked_cities || [];
            Object.keys(C.CITIES).forEach(function (cid) {
                const city = C.CITIES[cid];
                if (blocked.indexOf(cid) >= 0) return;
                if (city.allowed.indexOf(industry) < 0) return;
                const built = (factoriesByCity[cid] || []).length;
                if (built >= city.basePricesLen) return;
                s.add(cid);
            });
            return s;
        }, [myPlayer && myPlayer.hand, state.unlocked_industries, state.blocked_cities, factoriesByCity]);

        function getPlayerColor(uid) {
            const p = state.players.find(function (x) { return x.user_id === uid; });
            return p ? p.color : '#999';
        }

        function renderConnections() {
            const lines = [];
            // 基礎連線
            Object.entries(C.BASE_CONNECTIONS).forEach(function (entry) {
                const from = entry[0];
                entry[1].forEach(function (to) {
                    if (from < to) {
                        const p1 = C.CITIES[from].pos;
                        const p2 = C.CITIES[to].pos;
                        lines.push(React.createElement('line', {
                            key: 'base-' + from + '-' + to,
                            x1: p1.x + '%', y1: p1.y + '%',
                            x2: p2.x + '%', y2: p2.y + '%',
                            stroke: 'rgba(255,255,255,0.7)',
                            strokeWidth: 3,
                            strokeDasharray: '6 6',
                        }));
                    }
                });
            });
            // 動態連線
            C.DYNAMIC_LINES.forEach(function (line, idx) {
                if (turnIndex + 1 < line.unlockTurn) return;
                const p1 = C.CITIES[line.from].pos;
                const p2 = C.CITIES[line.to].pos;
                lines.push(React.createElement('line', {
                    key: 'dyn-' + idx,
                    x1: p1.x + '%', y1: p1.y + '%',
                    x2: p2.x + '%', y2: p2.y + '%',
                    stroke: line.stroke,
                    strokeWidth: 4,
                    strokeDasharray: '8 6',
                    className: 'animate-pulse',
                }));
            });

            // 可移動路徑高亮 — 僅自己回合時,從我的位置到所有可移動城市
            if (isMyTurn && myPlayer) {
                const fromCity = C.CITIES[myPlayer.location];
                const fromPos = fromCity && fromCity.pos;
                if (fromPos && movableSet && movableSet.forEach) {
                    movableSet.forEach(function (toId) {
                        const toCity = C.CITIES[toId];
                        const toPos = toCity && toCity.pos;
                        if (!toPos) return;
                        lines.push(React.createElement('line', {
                            key: 'move-' + toId,
                            x1: fromPos.x + '%', y1: fromPos.y + '%',
                            x2: toPos.x + '%', y2: toPos.y + '%',
                            stroke: '#facc15',
                            strokeWidth: 6,
                            strokeDasharray: '10 4',
                            className: 'movable-edge',
                            style: { filter: 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.9))' },
                        }));
                    });
                }
            }

            return lines;
        }

        function renderCity(city) {
            const cityFactories = factoriesByCity[city.id] || [];
            const isBlocked = (state.blocked_cities || []).indexOf(city.id) >= 0;
            const isMovable = movableSet.has && movableSet.has(city.id);
            const isBuildable = buildableSet.has && buildableSet.has(city.id);
            const isBuildHere = isBuildable && myPlayer && myPlayer.location === city.id;
            const totalBuilt = cityFactories.length;
            const maxFactories = city.basePricesLen;

            // 玩家棋子 — 自己的棋子放大 + 光環 + 跳動,易於定位
            const pawns = state.players
                .filter(function (p) { return p.location === city.id; })
                .map(function (p) {
                    const isMe = p.user_id === myUid;
                    return React.createElement('span', {
                        key: 'pawn-' + p.user_id,
                        className: isMe
                            ? 'inline-block w-7 h-7 md:w-8 md:h-8 rounded-full border-[3px] border-white shadow-lg pawn-me'
                            : 'inline-block w-4 h-4 rounded-full border-2 border-white shadow-md opacity-90',
                        style: { backgroundColor: p.color },
                        title: p.display_name + (isMe ? ' (你)' : ''),
                    });
                });

            // 地皮顯示
            const plotEls = [];
            for (let i = 0; i < maxFactories; i++) {
                const factory = cityFactories[i];
                const ownerColor = factory ? getPlayerColor(factory.owner_user_id) : null;
                const ind = factory ? C.INDUSTRIES[factory.industry_id] : null;
                const basePrice = (state.city_price_modifiers && state.city_price_modifiers[city.id]) || 0;
                plotEls.push(React.createElement('div', {
                    key: 'plot-' + i,
                    className: 'w-4 h-4 md:w-5 md:h-5 text-[8px] md:text-[10px] flex items-center justify-center font-bold border border-gray-600',
                    style: factory ? { backgroundColor: ownerColor, color: 'white' } : { background: '#fff', color: '#000' },
                    title: factory ? (ind.name + ' (玩家)') : '空地',
                }, factory ? ind.icon : (i + 1)));
            }

            return React.createElement('div', {
                key: city.id,
                className: 'absolute flex flex-col items-center justify-center -translate-x-1/2 -translate-y-1/2 transition-transform hover:scale-110 z-10 ' + (isMovable ? 'highlight-city' : 'cursor-pointer'),
                style: { left: city.pos.x + '%', top: city.pos.y + '%' },
                onClick: function (e) {
                    e.stopPropagation();
                    if (isMovable) {
                        onCityClick(city.id);
                    } else {
                        setDetailCityId(city.id);
                    }
                },
                onContextMenu: function (e) {
                    e.preventDefault();
                    setDetailCityId(city.id);
                },
            }, [
                React.createElement('div', {
                    key: 'pawns',
                    className: 'absolute -top-5 md:-top-6 flex gap-1 z-30',
                }, pawns),
                React.createElement('div', {
                    key: 'box',
                    className: 'pixel-box p-1 md:p-1.5 min-w-[3.5rem] md:min-w-[4.5rem] flex flex-col items-center text-center text-white leading-tight ' + (isBlocked ? 'bg-gray-800' : city.colorClass) + (isMovable ? ' border-yellow-400 border-4 movable-city' : '') + (isBuildHere ? ' buildable-here' : (isBuildable ? ' buildable-target' : '')),
                }, [
                    // 可建廠徽章 — 在當前位置可立即建廠時顯示
                    isBuildHere ? React.createElement('div', {
                        key: 'bbadge',
                        className: 'absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-[9px] md:text-[10px] font-bold px-1 py-0.5 border-2 border-black whitespace-nowrap z-30 animate-pulse',
                    }, '🏭 可建廠') : null,
                    React.createElement('span', {
                        key: 'name',
                        className: 'font-bold text-xs md:text-sm whitespace-nowrap',
                    }, isBlocked ? '封城' : city.id),
                    React.createElement('div', {
                        key: 'inds',
                        className: 'flex flex-wrap justify-center gap-[2px] mt-1 max-w-[50px] md:max-w-[60px]',
                    }, city.allowed.map(function (indId) {
                        const isUnlocked = (state.unlocked_industries || []).indexOf(indId) >= 0;
                        return React.createElement('span', {
                            key: indId,
                            title: indId + (isUnlocked ? '' : '(未解鎖)'),
                            className: 'text-[8px] md:text-[10px] bg-white border border-black rounded-[2px] p-[1px] leading-none text-black ' + (isUnlocked ? '' : 'opacity-40 grayscale'),
                        }, C.INDUSTRIES[indId].icon);
                    })),
                ]),
                React.createElement('div', {
                    key: 'plots',
                    className: 'flex gap-[2px] mt-1 bg-gray-200 p-[2px] border-2 border-black rounded shadow-md',
                }, plotEls),
            ]);
        }

        function renderDetailCard() {
            if (!detailCityId) return null;
            const city = C.CITIES[detailCityId];
            if (!city) return null;
            const cityFactories = factoriesByCity[city.id] || [];
            const priceMod = (state.city_price_modifiers && state.city_price_modifiers[city.id]) || 0;
            const isBlocked = (state.blocked_cities || []).indexOf(city.id) >= 0;

            const industryRows = city.allowed.map(function (indId) {
                const ind = C.INDUSTRIES[indId];
                const isUnlocked = (state.unlocked_industries || []).indexOf(indId) >= 0;
                const builtCount = cityFactories.filter(function (f) { return f.industry_id === indId; }).length;
                return React.createElement('div', {
                    key: indId,
                    className: 'flex items-center gap-2 p-2 border-2 border-black rounded ' + (isUnlocked ? 'bg-white' : 'bg-gray-200 opacity-60'),
                }, [
                    React.createElement('span', {
                        key: 'icon',
                        className: 'text-2xl',
                    }, ind.icon),
                    React.createElement('div', { key: 'info', className: 'flex-1' }, [
                        React.createElement('div', {
                            key: 'name',
                            className: 'font-bold text-sm',
                        }, ind.name),
                        React.createElement('div', {
                            key: 'status',
                            className: 'text-xs ' + (isUnlocked ? 'text-green-700' : 'text-red-600'),
                        }, isUnlocked ? '✓ 已解鎖' : '🔒 尚未解鎖'),
                    ]),
                    builtCount > 0 ? React.createElement('span', {
                        key: 'count',
                        className: 'text-xs bg-yellow-300 border border-black px-1 rounded font-bold',
                    }, '已建 ' + builtCount) : null,
                ]);
            });

            return React.createElement('div', {
                key: 'detail-overlay',
                className: 'absolute inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4',
                onClick: function () { setDetailCityId(null); },
            }, React.createElement('div', {
                className: 'pixel-box bg-white max-w-sm w-full p-4 max-h-[90%] overflow-y-auto',
                onClick: function (e) { e.stopPropagation(); },
            }, [
                React.createElement('div', {
                    key: 'title',
                    className: 'flex items-center justify-between mb-3 pb-2 border-b-2 border-black',
                }, [
                    React.createElement('div', { key: 'name', className: 'flex items-center gap-2' }, [
                        React.createElement('div', {
                            key: 'box',
                            className: 'w-6 h-6 border-2 border-black ' + city.colorClass,
                        }),
                        React.createElement('h3', {
                            key: 't',
                            className: 'text-lg font-bold',
                        }, '📍 ' + city.id),
                        isBlocked ? React.createElement('span', {
                            key: 'b',
                            className: 'text-xs bg-red-500 text-white px-1 border border-black',
                        }, '封城') : null,
                    ]),
                    React.createElement('button', {
                        key: 'close',
                        className: 'pixel-btn px-2 py-1 text-sm bg-gray-300',
                        onClick: function () { setDetailCityId(null); },
                    }, '✕'),
                ]),
                React.createElement('div', {
                    key: 'plots-info',
                    className: 'text-xs mb-2 text-gray-700',
                }, '🏗️ 地皮: ' + cityFactories.length + ' / ' + city.basePricesLen + (priceMod ? '  ·  💰 地價修正: ' + (priceMod > 0 ? '+' : '') + priceMod : '')),
                React.createElement('div', {
                    key: 'sect',
                    className: 'text-xs font-bold mb-1 text-gray-600',
                }, '可建產業:'),
                React.createElement('div', {
                    key: 'inds',
                    className: 'flex flex-col gap-1',
                }, industryRows),
                React.createElement('div', {
                    key: 'hint',
                    className: 'text-[10px] text-gray-500 mt-3 text-center',
                }, '💡 點擊卡片外或 ✕ 關閉  ·  地圖上閃爍的城市可移動'),
            ]));
        }

        return React.createElement('div', {
            className: 'relative w-full map-container pixel-box overflow-hidden border-4 md:border-8 border-gray-800 shadow-lg aspect-[4/3]',
        }, [
            React.createElement('svg', {
                key: 'svg',
                className: 'absolute top-0 left-0 w-full h-full pointer-events-none z-0',
            }, renderConnections()),
            ...Object.values(C.CITIES).map(renderCity),
            renderDetailCard(),
        ]);
    }

    window.DwqApp.MapCanvas = MapCanvas;
})();
