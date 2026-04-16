/**
 * 大灣區大亨 — 客戶端顯示常量
 *
 * 注意:這些常量僅用於 UI 顯示 (圖示、樣式)。
 * 所有遊戲規則、利潤計算、合法動作判斷都由後端權威執行。
 * 後端推送 room_state 已包含所有必要資料,前端只需渲染。
 *
 * 對外介面: window.DwqApp.constants
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    const INDUSTRIES = {
        '金融':       { name: '金融',       icon: '💵', colorClass: 'bg-purple-600' },
        '高新技術':   { name: '高新技術',   icon: '💾', colorClass: 'bg-blue-500' },
        '旅遊及文化': { name: '旅遊及文化', icon: '🧳', colorClass: 'bg-teal-400' },
        '紡織及成衣': { name: '紡織及成衣', icon: '👕', colorClass: 'bg-pink-600' },
        '家電及電器': { name: '家電及電器', icon: '🔌', colorClass: 'bg-orange-500' },
        '食品':       { name: '食品',       icon: '🍽️', colorClass: 'bg-green-700' },
        '醫藥':       { name: '醫藥',       icon: '➕', colorClass: 'bg-red-600' },
        '家具':       { name: '家具',       icon: '🪑', colorClass: 'bg-red-800' },
        '重工':       { name: '重工',       icon: '⚙️', colorClass: 'bg-gray-800' },
        '石油化工':   { name: '石油化工',   icon: '🛢️', colorClass: 'bg-amber-900' },
    };

    const CITIES = {
        '肇慶': { id: '肇慶', colorClass: 'bg-orange-400', basePricesLen: 4, allowed: ['紡織及成衣','家具','食品'], pos: { x: 12, y: 15 } },
        '佛山': { id: '佛山', colorClass: 'bg-green-500',  basePricesLen: 5, allowed: ['重工','家電及電器','紡織及成衣','食品','醫藥'], pos: { x: 33, y: 38 } },
        '廣州': { id: '廣州', colorClass: 'bg-gray-400',   basePricesLen: 5, allowed: ['重工','家電及電器','食品','醫藥'], pos: { x: 50, y: 20 } },
        '東莞': { id: '東莞', colorClass: 'bg-lime-500',   basePricesLen: 3, allowed: ['重工','食品'], pos: { x: 72, y: 38 } },
        '惠州': { id: '惠州', colorClass: 'bg-cyan-500',   basePricesLen: 4, allowed: ['重工','石油化工'], pos: { x: 88, y: 18 } },
        '江門': { id: '江門', colorClass: 'bg-pink-500',   basePricesLen: 4, allowed: ['金融','家電及電器','紡織及成衣','食品'], pos: { x: 12, y: 60 } },
        '中山': { id: '中山', colorClass: 'bg-blue-800',   basePricesLen: 4, allowed: ['重工','紡織及成衣','食品'], pos: { x: 42, y: 62 } },
        '珠海': { id: '珠海', colorClass: 'bg-purple-500', basePricesLen: 5, allowed: ['重工','石油化工','醫藥'], pos: { x: 33, y: 85 } },
        '澳門': { id: '澳門', colorClass: 'bg-yellow-400', basePricesLen: 3, allowed: ['金融','旅遊及文化'], pos: { x: 15, y: 88 } },
        '深圳': { id: '深圳', colorClass: 'bg-orange-500', basePricesLen: 4, allowed: ['高新技術','金融'], pos: { x: 85, y: 58 } },
        '香港': { id: '香港', colorClass: 'bg-red-600',    basePricesLen: 4, allowed: ['金融','旅遊及文化'], pos: { x: 75, y: 88 } },
    };

    const BASE_CONNECTIONS = {
        '肇慶': ['佛山','江門'],
        '佛山': ['肇慶','廣州','中山','江門'],
        '廣州': ['佛山','東莞'],
        '東莞': ['廣州','深圳','惠州'],
        '惠州': ['東莞','深圳'],
        '江門': ['肇慶','佛山','中山','珠海'],
        '中山': ['佛山','江門','珠海'],
        '珠海': ['中山','江門','澳門'],
        '澳門': ['珠海'],
        '深圳': ['東莞','惠州','香港'],
        '香港': ['深圳'],
    };

    // offset: 正值向一側彎,負值向另一側;數值為百分比,決定曲線偏離直線的程度
    // type:
    //   'rail'       — 鐵路 (黑白斑馬紋枕木,用於廣深高鐵、廣深港高鐵)
    //   'tunnel-mid' — 中段為海底隧道,兩端為大橋 (深中通道)
    //   'hzmb'       — 港珠澳 Y 形:香港主幹 (含近香港端沉管隧道) + 珠海/澳門分支
    //   'humen'      — 虎門大橋 Y 形:東莞主幹 + 廣州/中山分支,珠江口首條跨海通道
    const DYNAMIC_LINES = [
        // 虎門大橋 Y 形 (1997 通車,turn 5 顯示)
        { from: '東莞', to: '廣州', unlockTurn: 5,  type: 'humen',      stroke: '#8b5cf6', label: '虎門大橋',   trunk: true  },
        { from: '東莞', to: '中山', unlockTurn: 5,  type: 'humen',      stroke: '#8b5cf6', label: '虎門大橋',   trunk: false },
        // 廣深港高鐵 — 廣深段 (2011 通車) 與 深港段 (2018 通車) 同屬一條線,視覺上連續
        { from: '廣州', to: '深圳', unlockTurn: 6,  type: 'rail',       stroke: '#1a1a1a', label: '廣深高鐵',         offset: -22 },
        { from: '深圳', to: '香港', unlockTurn: 8,  type: 'rail',       stroke: '#1a1a1a', label: '廣深港高鐵 香港段', offset: -14 },
        // 港珠澳大橋 (2018,從 turn 7 改為 8)
        { from: '香港', to: '珠海', unlockTurn: 8,  type: 'hzmb',       stroke: '#0ea5e9', label: '港珠澳大橋', trunk: true  },
        { from: '香港', to: '澳門', unlockTurn: 8,  type: 'hzmb',       stroke: '#0ea5e9', label: '港珠澳大橋', trunk: false },
        // 深中通道 (2024 通車)
        { from: '深圳', to: '中山', unlockTurn: 10, type: 'tunnel-mid', stroke: '#f59e0b', label: '深中通道',   offset:  18 },
    ];

    const TURN_YEARS = [1977, 1982, 1988, 1992, 2001, 2011, 2016, 2018, 2020, 2025];
    const MAX_TURNS = 10;

    /** 計算當前回合的有效連線圖 (本地預覽用,後端會驗證真實合法性) */
    function getConnectionsForTurn(turnIndex) {
        const conn = {};
        Object.entries(BASE_CONNECTIONS).forEach(function (entry) {
            conn[entry[0]] = new Set(entry[1]);
        });
        DYNAMIC_LINES.forEach(function (line) {
            if (turnIndex + 1 >= line.unlockTurn) {
                if (!conn[line.from]) conn[line.from] = new Set();
                if (!conn[line.to]) conn[line.to] = new Set();
                conn[line.from].add(line.to);
                conn[line.to].add(line.from);
            }
        });
        return conn;
    }

    window.DwqApp.constants = {
        INDUSTRIES,
        CITIES,
        BASE_CONNECTIONS,
        DYNAMIC_LINES,
        TURN_YEARS,
        MAX_TURNS,
        getConnectionsForTurn,
    };
})();
