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
            // 基礎連線 — viewBox 0-100,直接用原始座標
            Object.entries(C.BASE_CONNECTIONS).forEach(function (entry) {
                const from = entry[0];
                entry[1].forEach(function (to) {
                    if (from < to) {
                        const p1 = C.CITIES[from].pos;
                        const p2 = C.CITIES[to].pos;
                        lines.push(React.createElement('line', {
                            key: 'base-' + from + '-' + to,
                            x1: p1.x, y1: p1.y,
                            x2: p2.x, y2: p2.y,
                            stroke: 'rgba(255,255,255,0.7)',
                            strokeWidth: 3,
                            strokeDasharray: '6 6',
                            vectorEffect: 'non-scaling-stroke',
                        }));
                    }
                });
            });
            // 二次貝茲曲線分割工具 (de Casteljau)
            function lerpPt(a, b, t) {
                return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            }
            function splitBezier(p0, p1, p2, t) {
                const m1 = lerpPt(p0, p1, t);
                const m2 = lerpPt(p1, p2, t);
                const mid = lerpPt(m1, m2, t);
                return { left: [p0, m1, mid], right: [mid, m2, p2] };
            }
            function segPath(s) {
                return 'M ' + s[0].x + ' ' + s[0].y + ' Q ' + s[1].x + ' ' + s[1].y + ' ' + s[2].x + ' ' + s[2].y;
            }
            // 取曲線上某參數 t 的位置 + 單位法向量 (用於畫懸索)
            function bezierSamplePerp(p0, p1, p2, t) {
                const omt = 1 - t;
                const x = omt * omt * p0.x + 2 * omt * t * p1.x + t * t * p2.x;
                const y = omt * omt * p0.y + 2 * omt * t * p1.y + t * t * p2.y;
                const tx = 2 * omt * (p1.x - p0.x) + 2 * t * (p2.x - p1.x);
                const ty = 2 * omt * (p1.y - p0.y) + 2 * t * (p2.y - p1.y);
                const l = Math.max(0.001, Math.sqrt(tx * tx + ty * ty));
                return { x: x, y: y, nx: -ty / l, ny: tx / l };
            }

            // 大橋段 — 乾淨的彩色曲線 (5px 實線),不加複雜的橋身裝飾
            function pushBridgeSeg(key, seg, stroke) {
                lines.push(React.createElement('path', {
                    key: key + '-b',
                    d: segPath(seg),
                    fill: 'none',
                    stroke: stroke,
                    strokeWidth: 5,
                    strokeLinecap: 'round',
                    vectorEffect: 'non-scaling-stroke',
                }));
            }
            // 隧道段 — 半透明彩色虛線 + 深色底,模擬海底隧道
            function pushTunnelSeg(key, seg, stroke) {
                lines.push(React.createElement('path', {
                    key: key + '-t-bg',
                    d: segPath(seg),
                    fill: 'none',
                    stroke: '#1e293b',
                    strokeWidth: 8,
                    strokeLinecap: 'butt',
                    opacity: 0.35,
                    vectorEffect: 'non-scaling-stroke',
                }));
                lines.push(React.createElement('path', {
                    key: key + '-t',
                    d: segPath(seg),
                    fill: 'none',
                    stroke: stroke,
                    strokeWidth: 4,
                    strokeDasharray: '2 2.5',
                    strokeLinecap: 'round',
                    opacity: 0.75,
                    vectorEffect: 'non-scaling-stroke',
                }));
            }
            // 隧道入口/出口 — 小圓環標記
            function pushPortal(key, pt, stroke) {
                lines.push(React.createElement('circle', {
                    key: key + '-portal',
                    cx: pt.x, cy: pt.y, r: 1.2,
                    fill: '#0f172a',
                    stroke: stroke,
                    strokeWidth: 1.2,
                    vectorEffect: 'non-scaling-stroke',
                }));
            }

            // 計算動態連線的完整 path d — 給黃色可移動路徑提示線用
            // 讓黃線也沿著真實路徑走 (曲線/Y 形),而不是直線橫切地圖
            function getDynamicPathD(line) {
                const p0src = C.CITIES[line.from].pos;
                const p2src = C.CITIES[line.to].pos;
                if (line.type === 'hzmb') {
                    const hk = C.CITIES['香港'].pos;
                    const forkPt = { x: 47, y: 96 };
                    // 非香港端即為目的地
                    const toPos = (line.from === '香港') ? p2src : p0src;
                    const trunkCP = {
                        x: (hk.x + forkPt.x) / 2,
                        y: (hk.y + forkPt.y) / 2 + 4,
                    };
                    const branchCP = {
                        x: (forkPt.x + toPos.x) / 2,
                        y: Math.max(forkPt.y, toPos.y) + 2,
                    };
                    return 'M ' + hk.x + ' ' + hk.y +
                        ' Q ' + trunkCP.x + ' ' + trunkCP.y + ' ' + forkPt.x + ' ' + forkPt.y +
                        ' Q ' + branchCP.x + ' ' + branchCP.y + ' ' + toPos.x + ' ' + toPos.y;
                }
                if (line.type === 'humen') {
                    // 虎門大橋 Y 形:東莞主幹 → fork → {廣州, 中山}
                    const dg = C.CITIES['東莞'].pos;
                    const forkPt = { x: 53, y: 44 };
                    const toPos = (line.from === '東莞') ? p2src : p0src;
                    const trunkCP = {
                        x: (dg.x + forkPt.x) / 2,
                        y: (dg.y + forkPt.y) / 2 + 4,
                    };
                    const bdx = toPos.x - forkPt.x;
                    const bdy = toPos.y - forkPt.y;
                    const blen = Math.max(0.001, Math.sqrt(bdx * bdx + bdy * bdy));
                    const bendSign = toPos === C.CITIES['廣州'].pos ? 1 : -1;
                    const branchCP = {
                        x: (forkPt.x + toPos.x) / 2 + (-bdy / blen) * 2.5 * bendSign,
                        y: (forkPt.y + toPos.y) / 2 + ( bdx / blen) * 2.5 * bendSign,
                    };
                    return 'M ' + dg.x + ' ' + dg.y +
                        ' Q ' + trunkCP.x + ' ' + trunkCP.y + ' ' + forkPt.x + ' ' + forkPt.y +
                        ' Q ' + branchCP.x + ' ' + branchCP.y + ' ' + toPos.x + ' ' + toPos.y;
                }
                // rail / tunnel-mid:單條二次貝茲
                const mx = (p0src.x + p2src.x) / 2;
                const my = (p0src.y + p2src.y) / 2;
                const dx = p2src.x - p0src.x;
                const dy = p2src.y - p0src.y;
                const l = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
                const off = line.offset || 0;
                const cpx = mx + (-dy / l) * off;
                const cpy = my + (dx / l) * off;
                return 'M ' + p0src.x + ' ' + p0src.y +
                    ' Q ' + cpx + ' ' + cpy + ' ' + p2src.x + ' ' + p2src.y;
            }

            // 建立 "from->to" → path d 的查找表 (已解鎖的動態連線)
            const dynPathByPair = {};
            C.DYNAMIC_LINES.forEach(function (line) {
                if (turnIndex + 1 < line.unlockTurn) return;
                const d = getDynamicPathD(line);
                dynPathByPair[line.from + '->' + line.to] = d;
                dynPathByPair[line.to + '->' + line.from] = d;
            });

            // 動態連線 — 按類型分別渲染 (rail / bridge / tunnel-from / tunnel-mid)
            C.DYNAMIC_LINES.forEach(function (line, idx) {
                if (turnIndex + 1 < line.unlockTurn) return;
                const p0src = C.CITIES[line.from].pos;
                const p2src = C.CITIES[line.to].pos;
                // 計算控制點:中點 + 垂直偏移
                const mx = (p0src.x + p2src.x) / 2;
                const my = (p0src.y + p2src.y) / 2;
                const dx = p2src.x - p0src.x;
                const dy = p2src.y - p0src.y;
                const len = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
                const perpX = -dy / len;
                const perpY = dx / len;
                const off = line.offset || 0;
                const p0 = { x: p0src.x, y: p0src.y };
                const p2 = { x: p2src.x, y: p2src.y };
                const pc = { x: mx + perpX * off, y: my + perpY * off };

                if (line.type === 'rail') {
                    // 傳統鐵路風格:白色粗底線 + 黑色枕木 + 中線
                    const d = segPath([p0, pc, p2]);
                    lines.push(React.createElement('path', {
                        key: 'dyn-rail-bg-' + idx,
                        d: d, fill: 'none',
                        stroke: '#ffffff', strokeWidth: 11,
                        vectorEffect: 'non-scaling-stroke',
                    }));
                    lines.push(React.createElement('path', {
                        key: 'dyn-rail-tie-' + idx,
                        d: d, fill: 'none',
                        stroke: '#111827', strokeWidth: 13,
                        strokeDasharray: '1.4 1.2',
                        vectorEffect: 'non-scaling-stroke',
                    }));
                    lines.push(React.createElement('path', {
                        key: 'dyn-rail-center-' + idx,
                        d: d, fill: 'none',
                        stroke: '#1f2937', strokeWidth: 1.5,
                        vectorEffect: 'non-scaling-stroke',
                    }));
                } else if (line.type === 'tunnel-mid') {
                    // 深中通道:大橋 (1/3) — 隧道 (1/3) — 大橋 (1/3)
                    const s1 = splitBezier(p0, pc, p2, 1 / 3);
                    const partA = s1.left;                      // [0, 1/3]
                    const s2 = splitBezier(s1.right[0], s1.right[1], s1.right[2], 0.5);
                    const partB = s2.left;                      // [1/3, 2/3]
                    const partC = s2.right;                     // [2/3, 1]
                    pushBridgeSeg('dyn-' + idx + '-a', partA, line.stroke);
                    pushTunnelSeg('dyn-' + idx + '-b', partB, line.stroke);
                    pushBridgeSeg('dyn-' + idx + '-c', partC, line.stroke);
                    pushPortal('dyn-' + idx + '-p1', partA[2], line.stroke);
                    pushPortal('dyn-' + idx + '-p2', partC[0], line.stroke);
                } else if (line.type === 'hzmb') {
                    // 港珠澳大橋 Y 形:從城市下方 (南面海面) 走
                    // 主幹由香港向西南延伸到分叉點,再分成兩條分支抬升到珠海/澳門
                    const hk = C.CITIES['香港'].pos;
                    // 分叉點在城市下方的海面
                    const forkPt = { x: 47, y: 96 };

                    if (line.trunk) {
                        const trunkP0 = { x: hk.x, y: hk.y };
                        const trunkP2 = forkPt;
                        // 控制點:中點向下推,主幹向南拱出
                        const trunkCP = {
                            x: (trunkP0.x + trunkP2.x) / 2,
                            y: (trunkP0.y + trunkP2.y) / 2 + 4,
                        };
                        // 近香港端 35% 為沉管隧道
                        const tSplit = splitBezier(trunkP0, trunkCP, trunkP2, 0.35);
                        pushTunnelSeg('hzmb-trunk-tunnel-' + idx, tSplit.left, line.stroke);
                        pushBridgeSeg('hzmb-trunk-bridge-' + idx, tSplit.right, line.stroke);
                        pushPortal('hzmb-hk-portal-' + idx, tSplit.left[2], line.stroke);
                        // 分叉節點標記
                        lines.push(React.createElement('circle', {
                            key: 'hzmb-fork-' + idx,
                            cx: forkPt.x, cy: forkPt.y, r: 1.4,
                            fill: '#ffffff',
                            stroke: line.stroke,
                            strokeWidth: 1,
                            vectorEffect: 'non-scaling-stroke',
                        }));
                    }

                    // 分支:從分叉點往北抬升到目的城市 (珠海/澳門)
                    const toCity = C.CITIES[line.to].pos;
                    const branchP0 = forkPt;
                    const branchP2 = { x: toCity.x, y: toCity.y };
                    // 控制點下推 → 分支也從下方弧形上升
                    const branchCP = {
                        x: (branchP0.x + branchP2.x) / 2,
                        y: Math.max(branchP0.y, branchP2.y) + 2,
                    };
                    pushBridgeSeg('hzmb-branch-' + idx, [branchP0, branchCP, branchP2], line.stroke);
                } else if (line.type === 'humen') {
                    // 虎門大橋 Y 形:東莞 → fork → {廣州, 中山}
                    // 1997 通車,首次打通珠江口東西兩岸
                    const dg = C.CITIES['東莞'].pos;
                    const forkPt = { x: 53, y: 44 };  // 東莞西側的珠江口分叉點

                    if (line.trunk) {
                        const trunkP0 = { x: dg.x, y: dg.y };
                        const trunkP2 = forkPt;
                        const trunkCP = {
                            x: (trunkP0.x + trunkP2.x) / 2,
                            y: (trunkP0.y + trunkP2.y) / 2 + 4,
                        };
                        pushBridgeSeg('humen-trunk-' + idx, [trunkP0, trunkCP, trunkP2], line.stroke);
                        // 分叉節點 (白心紫環,珠江口中央島嶼)
                        lines.push(React.createElement('circle', {
                            key: 'humen-fork-' + idx,
                            cx: forkPt.x, cy: forkPt.y, r: 1.4,
                            fill: '#ffffff',
                            stroke: line.stroke,
                            strokeWidth: 1,
                            vectorEffect: 'non-scaling-stroke',
                        }));
                    }

                    // 分支:fork → 目的城市 (廣州/中山)
                    const toPos = C.CITIES[line.to].pos;
                    const bdx = toPos.x - forkPt.x;
                    const bdy = toPos.y - forkPt.y;
                    const blen = Math.max(0.001, Math.sqrt(bdx * bdx + bdy * bdy));
                    // 廣州向東微彎,中山向西微彎,避免兩條分支重疊
                    const bendSign = line.to === '廣州' ? 1 : -1;
                    const branchCP = {
                        x: (forkPt.x + toPos.x) / 2 + (-bdy / blen) * 2.5 * bendSign,
                        y: (forkPt.y + toPos.y) / 2 + ( bdx / blen) * 2.5 * bendSign,
                    };
                    pushBridgeSeg('humen-branch-' + idx, [forkPt, branchCP, toPos], line.stroke);
                } else {
                    // 純大橋 (未來可能用)
                    pushBridgeSeg('dyn-' + idx, [p0, pc, p2], line.stroke);
                }
            });

            // 可移動路徑高亮 — 僅自己回合時,從我的位置到所有可移動城市
            // 若目的地是動態連線 (鐵路/大橋/隧道),沿真實路徑畫曲線;否則直線
            if (isMyTurn && myPlayer) {
                const fromId = myPlayer.location;
                const fromCity = C.CITIES[fromId];
                const fromPos = fromCity && fromCity.pos;
                if (fromPos && movableSet && movableSet.forEach) {
                    movableSet.forEach(function (toId) {
                        const toCity = C.CITIES[toId];
                        const toPos = toCity && toCity.pos;
                        if (!toPos) return;
                        const dynD = dynPathByPair[fromId + '->' + toId];
                        const d = dynD || ('M ' + fromPos.x + ' ' + fromPos.y + ' L ' + toPos.x + ' ' + toPos.y);
                        lines.push(React.createElement('path', {
                            key: 'move-' + toId,
                            d: d,
                            fill: 'none',
                            stroke: '#facc15',
                            strokeWidth: 6,
                            strokeDasharray: '10 4',
                            strokeLinecap: 'round',
                            vectorEffect: 'non-scaling-stroke',
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
                viewBox: '0 0 100 100',
                preserveAspectRatio: 'none',
            }, renderConnections()),
            ...Object.values(C.CITIES).map(renderCity),
            renderDetailCard(),
        ]);
    }

    window.DwqApp.MapCanvas = MapCanvas;
})();
