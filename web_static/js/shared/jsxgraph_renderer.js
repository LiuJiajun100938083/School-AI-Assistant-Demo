/**
 * JSXGraph 受限 DSL 渲染器
 * ========================
 * 白名單解釋器：只處理已知 element type，未知 type 靜默跳過。
 * 所有元素 fixed: true，禁用互動。
 * 文字經 _escapeHtml 轉義（前端第二道保險，後端已做嚴格字符集過濾）。
 *
 * Phase 1 支援：point, circle, pointOnCircle, segment, intersection, textLabel
 */

window.JSXGraphRenderer = (() => {
    'use strict';

    // 生命周期管理
    const _boards = {};

    // DSE 黑白考試風格
    const THEME = {
        strokeColor: '#000',
        strokeWidth: 1.5,
        fillColor: 'none',
        highlightStrokeColor: '#000',
        highlightStrokeWidth: 1.5,
        fontSize: 14,
        fixed: true,
    };

    const POINT_STYLE = {
        size: 2,
        strokeColor: '#000',
        fillColor: '#000',
        fixed: true,
        showInfobox: false,
        highlightFillColor: '#000',
        highlightStrokeColor: '#000',
    };

    // ================================================================
    // 公開 API
    // ================================================================

    function render(containerId, config) {
        // 銷毀舊 board
        destroy(containerId);

        const container = document.getElementById(containerId);
        if (!container) return;

        // 確保容器有尺寸
        if (!container.style.width) container.style.width = '300px';
        if (!container.style.height) container.style.height = '250px';

        const bbox = config.boundingBox || [-1, 8, 9, -1];

        // initBoard — 禁用所有互動，預留 renderer: 'svg' 口
        const board = JXG.JSXGraph.initBoard(containerId, {
            boundingbox: bbox,
            axis: false,
            grid: false,
            showNavigation: false,
            showCopyright: false,
            pan: { enabled: false },
            zoom: { wheel: false, needShift: true },
            renderer: 'svg',  // 預留：之後可切換 canvas 做打印 snapshot
        });
        _boards[containerId] = board;

        // 按順序創建 elements（config 要求拓撲有序）
        const refs = {};
        const elements = config.elements || [];
        for (const el of elements) {
            _createElement(board, el, refs);
        }
    }

    function destroy(containerId) {
        if (_boards[containerId]) {
            JXG.JSXGraph.freeBoard(_boards[containerId]);
            delete _boards[containerId];
        }
    }

    function destroyAll() {
        for (const id of Object.keys(_boards)) {
            destroy(id);
        }
    }

    // ================================================================
    // 白名單 element 創建
    // ================================================================

    function _createElement(board, el, refs) {
        if (!el || !el.type) return;

        let created = null;

        switch (el.type) {
            case 'point':
                created = _createPoint(board, el, refs);
                break;
            case 'circle':
                created = _createCircle(board, el, refs);
                break;
            case 'pointOnCircle':
                created = _createPointOnCircle(board, el, refs);
                break;
            case 'segment':
                created = _createSegment(board, el, refs);
                break;
            case 'intersection':
                created = _createIntersection(board, el, refs);
                break;
            case 'textLabel':
                created = _createTextLabel(board, el, refs);
                break;
            default:
                // 未知 type → 靜默跳過
                return;
        }

        if (el.id && created) {
            refs[el.id] = created;
        }
    }

    function _createPoint(board, el) {
        const coords = el.coords || [0, 0];
        const opts = {
            ...POINT_STYLE,
            name: _escapeHtml(el.label || el.id || ''),
            withLabel: !!(el.label || el.id),
            label: { fontSize: THEME.fontSize, strokeColor: '#000' },
        };
        return board.create('point', coords, opts);
    }

    function _createCircle(board, el, refs) {
        const center = refs[el.center];
        if (!center) return null;

        const opts = {
            strokeColor: THEME.strokeColor,
            strokeWidth: THEME.strokeWidth,
            fillColor: 'none',
            highlightStrokeColor: THEME.highlightStrokeColor,
            fixed: true,
            name: _escapeHtml(el.label || ''),
            withLabel: !!el.label,
            label: { fontSize: THEME.fontSize, strokeColor: '#000' },
        };
        return board.create('circle', [center, el.radius], opts);
    }

    function _createPointOnCircle(board, el, refs) {
        const circleObj = refs[el.circle];
        if (!circleObj) return null;

        // 從圓心 + 半徑 + 角度計算座標
        const center = circleObj.center;
        const cx = center.X();
        const cy = center.Y();
        const r = circleObj.Radius();
        const angleRad = (el.angle || 0) * Math.PI / 180;
        const x = cx + r * Math.cos(angleRad);
        const y = cy + r * Math.sin(angleRad);

        const opts = {
            ...POINT_STYLE,
            name: _escapeHtml(el.label || el.id || ''),
            withLabel: !!(el.label || el.id),
            label: { fontSize: THEME.fontSize, strokeColor: '#000' },
        };
        return board.create('point', [x, y], opts);
    }

    function _createSegment(board, el, refs) {
        const eps = el.endpoints || [];
        const p1 = refs[eps[0]];
        const p2 = refs[eps[1]];
        if (!p1 || !p2) return null;

        const opts = {
            strokeColor: THEME.strokeColor,
            strokeWidth: THEME.strokeWidth,
            highlightStrokeColor: THEME.highlightStrokeColor,
            fixed: true,
            name: _escapeHtml(el.label || ''),
            withLabel: !!el.label,
            label: { fontSize: THEME.fontSize - 1, strokeColor: '#555' },
        };
        return board.create('segment', [p1, p2], opts);
    }

    function _createIntersection(board, el, refs) {
        const ofIds = el.of || [];
        const obj1 = refs[ofIds[0]];
        const obj2 = refs[ofIds[1]];
        if (!obj1 || !obj2) return null;

        const idx = el.index || 0;

        const opts = {
            ...POINT_STYLE,
            name: _escapeHtml(el.label || el.id || ''),
            withLabel: !!(el.label || el.id),
            label: { fontSize: THEME.fontSize, strokeColor: '#000' },
            // 硬規則：弦是線段，必須按實際幾何相交判定
            // alwaysIntersect: false 確保線段不延長成直線
            alwaysIntersect: false,
        };
        return board.create('intersection', [obj1, obj2, idx], opts);
    }

    function _createTextLabel(board, el, refs) {
        let x, y;
        if (el.coords && el.coords.length === 2) {
            x = el.coords[0];
            y = el.coords[1];
        } else if (el.at && refs[el.at]) {
            // 在元素附近放置文字
            const target = refs[el.at];
            if (typeof target.X === 'function') {
                x = target.X() + 0.3;
                y = target.Y() + 0.3;
            } else {
                x = 0;
                y = 0;
            }
        } else {
            x = 0;
            y = 0;
        }

        const text = _escapeHtml(el.text || '');
        return board.create('text', [x, y, text], {
            fontSize: THEME.fontSize - 1,
            strokeColor: '#333',
            fixed: true,
            highlight: false,
        });
    }

    // ================================================================
    // 安全工具
    // ================================================================

    function _escapeHtml(str) {
        if (!str) return '';
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(str).replace(/[&<>"']/g, c => map[c]);
    }

    // ================================================================
    // 導出
    // ================================================================

    return { render, destroy, destroyAll };
})();
