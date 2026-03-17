/**
 * JSXGraph 受限 DSL 渲染器
 * ========================
 * 白名單解釋器：只處理已知 element type，未知 type 靜默跳過。
 * 所有元素 fixed: true，禁用互動。
 * 文字經 _escapeHtml 轉義（前端第二道保險，後端已做嚴格字符集過濾）。
 *
 * Phase 1 支援：point, circle, pointOnCircle, segment, intersection, textLabel
 * Phase 2 支援：tangent（切線）
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

    // 標籤防重疊最小距離（board 座標單位）
    const LABEL_MIN_DIST = 0.8;
    // 點標籤從點位向外偏移的距離
    const POINT_LABEL_OFFSET = 0.5;
    // textLabel 碰撞推移步長
    const TEXT_NUDGE_STEP = 0.6;
    // 最大推移嘗試次數
    const TEXT_NUDGE_MAX = 6;

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
        // 追蹤已放置標籤的座標，用於碰撞檢測
        const labelPositions = [];
        const elements = config.elements || [];

        // 預掃描：收集所有圓心資訊，用於計算標籤的徑向偏移方向
        const circleInfoMap = {};
        for (const el of elements) {
            if (el.type === 'circle' && el.center && el.id) {
                circleInfoMap[el.id] = { centerId: el.center, radius: el.radius || 3 };
            }
        }

        for (const el of elements) {
            _createElement(board, el, refs, labelPositions, circleInfoMap);
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

    function _createElement(board, el, refs, labelPositions, circleInfoMap) {
        if (!el || !el.type) return;

        let created = null;

        switch (el.type) {
            case 'point':
                created = _createPoint(board, el, refs, labelPositions, circleInfoMap);
                break;
            case 'circle':
                created = _createCircle(board, el, refs);
                break;
            case 'pointOnCircle':
                created = _createPointOnCircle(board, el, refs, labelPositions);
                break;
            case 'segment':
                created = _createSegment(board, el, refs);
                break;
            case 'intersection':
                created = _createIntersection(board, el, refs, labelPositions);
                break;
            case 'tangent':
                created = _createTangent(board, el, refs);
                break;
            case 'textLabel':
                created = _createTextLabel(board, el, refs, labelPositions);
                break;
            default:
                // 未知 type → 靜默跳過
                return;
        }

        if (el.id && created) {
            refs[el.id] = created;
        }
    }

    // ================================================================
    // 標籤智能定位工具
    // ================================================================

    /**
     * 計算標籤偏移 — 將標籤沿徑向方向推到點的外側。
     * @param {number} px - 點的 x 座標
     * @param {number} py - 點的 y 座標
     * @param {number} cx - 參考中心 x（圓心或圖形重心）
     * @param {number} cy - 參考中心 y
     * @param {number} offset - 偏移距離
     * @returns {number[]} [offsetX, offsetY]
     */
    function _radialLabelOffset(px, py, cx, cy, offset) {
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) return [offset, offset]; // 重合時默認右上
        return [(dx / dist) * offset, (dy / dist) * offset];
    }

    /**
     * 將標籤偏移方向轉為 JSXGraph anchorX / anchorY。
     * 根據偏移方向選擇合適的對齊方式，讓文字不遮擋點位。
     */
    function _anchorFromOffset(offX, offY) {
        let anchorX = 'middle';
        let anchorY = 'middle';
        if (offX > 0.1) anchorX = 'left';
        else if (offX < -0.1) anchorX = 'right';
        if (offY > 0.1) anchorY = 'bottom';  // JSXGraph: bottom = 文字在上方
        else if (offY < -0.1) anchorY = 'top';
        return { anchorX, anchorY };
    }

    /**
     * 檢查座標是否與已有標籤位置衝突，若衝突則沿垂直方向推移。
     * @returns {number[]} 調整後的 [x, y]
     */
    function _resolveTextCollision(x, y, labelPositions) {
        for (let attempt = 0; attempt < TEXT_NUDGE_MAX; attempt++) {
            let collision = false;
            for (const pos of labelPositions) {
                const dx = x - pos[0];
                const dy = y - pos[1];
                if (Math.sqrt(dx * dx + dy * dy) < LABEL_MIN_DIST) {
                    collision = true;
                    break;
                }
            }
            if (!collision) break;
            // 向下推移（避免推出 boundingBox 上緣）
            y -= TEXT_NUDGE_STEP;
        }
        return [x, y];
    }

    /**
     * 記錄一個標籤的座標到 labelPositions。
     */
    function _registerLabel(labelPositions, x, y) {
        labelPositions.push([x, y]);
    }

    // ================================================================
    // 元素創建（帶智能標籤定位）
    // ================================================================

    function _createPoint(board, el, refs, labelPositions, circleInfoMap) {
        const coords = el.coords || [0, 0];
        const labelName = _escapeHtml(el.label || el.id || '');
        const hasLabel = !!(el.label || el.id);

        // 計算標籤偏移（默認右上方）
        let labelOpts = { fontSize: THEME.fontSize, strokeColor: '#000' };
        if (hasLabel) {
            // 嘗試找到此點所在圓的圓心，沿徑向偏移
            let offX = POINT_LABEL_OFFSET;
            let offY = POINT_LABEL_OFFSET;

            // 如果是圓心，標籤放右上即可
            // 否則嘗試基於 bbox 中心做徑向偏移
            const bboxCenter = _getBoardCenter(board);
            const [ox, oy] = _radialLabelOffset(
                coords[0], coords[1], bboxCenter[0], bboxCenter[1], POINT_LABEL_OFFSET
            );
            offX = ox;
            offY = oy;

            const resolved = _resolveTextCollision(
                coords[0] + offX, coords[1] + offY, labelPositions
            );
            const finalOffX = resolved[0] - coords[0];
            const finalOffY = resolved[1] - coords[1];
            const anchor = _anchorFromOffset(finalOffX, finalOffY);

            labelOpts = {
                fontSize: THEME.fontSize,
                strokeColor: '#000',
                offset: [Math.round(finalOffX * 25), Math.round(finalOffY * 25)],
                anchorX: anchor.anchorX,
                anchorY: anchor.anchorY,
            };
            _registerLabel(labelPositions, resolved[0], resolved[1]);
        }

        const opts = {
            ...POINT_STYLE,
            name: labelName,
            withLabel: hasLabel,
            label: labelOpts,
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

    function _createPointOnCircle(board, el, refs, labelPositions) {
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

        const labelName = _escapeHtml(el.label || el.id || '');
        const hasLabel = !!(el.label || el.id);

        // 標籤沿徑向外推（從圓心向外）
        let labelOpts = { fontSize: THEME.fontSize, strokeColor: '#000' };
        if (hasLabel) {
            const [offX, offY] = _radialLabelOffset(x, y, cx, cy, POINT_LABEL_OFFSET);
            const resolved = _resolveTextCollision(
                x + offX, y + offY, labelPositions
            );
            const finalOffX = resolved[0] - x;
            const finalOffY = resolved[1] - y;
            const anchor = _anchorFromOffset(finalOffX, finalOffY);

            labelOpts = {
                fontSize: THEME.fontSize,
                strokeColor: '#000',
                offset: [Math.round(finalOffX * 25), Math.round(finalOffY * 25)],
                anchorX: anchor.anchorX,
                anchorY: anchor.anchorY,
            };
            _registerLabel(labelPositions, resolved[0], resolved[1]);
        }

        const opts = {
            ...POINT_STYLE,
            name: labelName,
            withLabel: hasLabel,
            label: labelOpts,
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

    function _createIntersection(board, el, refs, labelPositions) {
        const ofIds = el.of || [];
        const obj1 = refs[ofIds[0]];
        const obj2 = refs[ofIds[1]];
        if (!obj1 || !obj2) return null;

        const idx = el.index || 0;
        const labelName = _escapeHtml(el.label || el.id || '');
        const hasLabel = !!(el.label || el.id);

        // 交點標籤偏移 — 向圖形中心的反方向推
        let labelOpts = { fontSize: THEME.fontSize, strokeColor: '#000' };

        const opts = {
            ...POINT_STYLE,
            name: labelName,
            withLabel: hasLabel,
            label: labelOpts,
            // 硬規則：弦是線段，必須按實際幾何相交判定
            // alwaysIntersect: false 確保線段不延長成直線
            alwaysIntersect: false,
        };
        const created = board.create('intersection', [obj1, obj2, idx], opts);

        // 交點創建後才能讀到座標，事後調整標籤
        if (hasLabel && created && typeof created.X === 'function') {
            const px = created.X();
            const py = created.Y();
            const bboxCenter = _getBoardCenter(board);
            const [offX, offY] = _radialLabelOffset(
                px, py, bboxCenter[0], bboxCenter[1], POINT_LABEL_OFFSET
            );
            const resolved = _resolveTextCollision(
                px + offX, py + offY, labelPositions
            );
            const finalOffX = resolved[0] - px;
            const finalOffY = resolved[1] - py;
            const anchor = _anchorFromOffset(finalOffX, finalOffY);

            created.label.setAttribute({
                offset: [Math.round(finalOffX * 25), Math.round(finalOffY * 25)],
                anchorX: anchor.anchorX,
                anchorY: anchor.anchorY,
            });
            _registerLabel(labelPositions, resolved[0], resolved[1]);
        }

        return created;
    }

    function _createTangent(board, el, refs) {
        const circleObj = refs[el.circle];
        const pointObj = refs[el.point];
        if (!circleObj || !pointObj) return null;

        // 計算切線方向：垂直於半徑（圓心→切點）
        const cx = circleObj.center.X();
        const cy = circleObj.center.Y();
        const px = typeof pointObj.X === 'function' ? pointObj.X() : 0;
        const py = typeof pointObj.Y === 'function' ? pointObj.Y() : 0;

        // 半徑方向 (dx, dy)，切線方向 = 旋轉 90° = (-dy, dx)
        const dx = px - cx;
        const dy = py - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 0.01) return null;

        const tx = -dy / dist;
        const ty = dx / dist;

        // 切線策略：從切點向兩側延伸，但用 bbox 裁剪可見範圍
        // 取足夠長的線段，JSXGraph 會自動裁剪到 bbox 內
        const r = circleObj.Radius();
        const bbox = board.getBoundingBox(); // [xmin, ymax, xmax, ymin]
        const bboxDiag = Math.sqrt(
            (bbox[2] - bbox[0]) ** 2 + (bbox[1] - bbox[3]) ** 2
        );
        const ext = bboxDiag * 0.6; // 足夠長，bbox 自然裁剪
        const p1 = [px - tx * ext, py - ty * ext];
        const p2 = [px + tx * ext, py + ty * ext];

        const opts = {
            strokeColor: THEME.strokeColor,
            strokeWidth: THEME.strokeWidth,
            highlightStrokeColor: THEME.highlightStrokeColor,
            fixed: true,
            straightFirst: false,
            straightLast: false,
            name: _escapeHtml(el.label || ''),
            withLabel: !!el.label,
            label: { fontSize: THEME.fontSize - 1, strokeColor: '#555' },
        };
        return board.create('segment', [p1, p2], opts);
    }

    function _createTextLabel(board, el, refs, labelPositions) {
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

        // 碰撞檢測：若與已有標籤重疊，自動推移
        const resolved = _resolveTextCollision(x, y, labelPositions);
        x = resolved[0];
        y = resolved[1];

        const text = _escapeHtml(el.text || '');
        const created = board.create('text', [x, y, text], {
            fontSize: THEME.fontSize - 1,
            strokeColor: '#333',
            fixed: true,
            highlight: false,
        });

        _registerLabel(labelPositions, x, y);
        return created;
    }

    // ================================================================
    // Board 工具
    // ================================================================

    function _getBoardCenter(board) {
        const bbox = board.getBoundingBox(); // [xmin, ymax, xmax, ymin]
        return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
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
