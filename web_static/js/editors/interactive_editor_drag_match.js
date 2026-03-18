/**
 * 互动活动编辑器 — 拖拽配對 (drag_match) 模板
 *
 * 依赖: interactive_editor.js (提供 _registerInteractiveTemplateEditor + _interactiveEditorHelpers)
 */
'use strict';

(function () {
    const helpers = window._interactiveEditorHelpers;
    const escapeHtml = helpers?.escapeHtml || (s => s || '');
    if (!helpers) return;

    function getDefaultConfig() {
        const lIds = [helpers.genItemId(), helpers.genItemId(), helpers.genItemId()];
        const rIds = [helpers.genItemId(), helpers.genItemId(), helpers.genItemId()];
        return {
            template: 'drag_match',
            time_limit: 120,
            show_leaderboard: false,
            show_top_n: 3,
            drag_match: {
                left_items: [
                    { id: lIds[0], content: '左項 1' },
                    { id: lIds[1], content: '左項 2' },
                    { id: lIds[2], content: '左項 3' },
                ],
                right_items: [
                    { id: rIds[0], content: '右項 1' },
                    { id: rIds[1], content: '右項 2' },
                    { id: rIds[2], content: '右項 3' },
                ],
                correct_pairs: {
                    [lIds[0]]: rIds[0],
                    [lIds[1]]: rIds[1],
                    [lIds[2]]: rIds[2],
                },
                instruction: '將左右兩側項目正確配對',
            },
        };
    }

    // ── 渲染 pair select UI (used by renderConfig only) ──
    function renderPairSelects(container, leftItems, rightItems, correctPairs) {
        const pairEl = container.querySelector('#dmPairConfig');
        if (!pairEl) return;
        pairEl.innerHTML = leftItems.map(li => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                <span style="flex:1;font-size:13px;color:var(--text-primary);">${escapeHtml(li.content) || li.id}</span>
                <span style="color:var(--text-tertiary);">→</span>
                <select class="config-input dm-pair-select" data-left-id="${li.id}" style="flex:1;margin:0;">
                    <option value="">-- 未配對 --</option>
                    ${rightItems.map(ri => `
                        <option value="${ri.id}" ${correctPairs[li.id] === ri.id ? 'selected' : ''}>${escapeHtml(ri.content) || ri.id}</option>
                    `).join('')}
                </select>
            </div>
        `).join('');
    }

    // ── "添加幻灯片" 弹窗中的配置 (paired-row UI) ──
    function render(container, onCreate) {
        // Unified pairs model — each row is one left↔right pair
        let pairs = [
            { leftId: helpers.genItemId(), leftContent: '左項 1', rightId: helpers.genItemId(), rightContent: '右項 1' },
            { leftId: helpers.genItemId(), leftContent: '左項 2', rightId: helpers.genItemId(), rightContent: '右項 2' },
            { leftId: helpers.genItemId(), leftContent: '左項 3', rightId: helpers.genItemId(), rightContent: '右項 3' },
        ];

        container.innerHTML = `
            <div id="dmCommonFields"></div>
            <div class="config-section">
                <label class="config-label">配對項目</label>
                <div id="dmPairRows"></div>
                <button id="dmAddPairBtn" class="ppt-upload-btn" style="width:100%;margin-top:6px;padding:6px;">+ 添加配對</button>
            </div>
            <button id="dmCreateBtn" class="ppt-upload-btn" style="width:100%;margin-top:12px;background:var(--brand,#34C759);color:#fff;font-weight:600;">
                建立拖拽配對活動
            </button>
        `;

        helpers.renderCommonFields(container.querySelector('#dmCommonFields'), { instruction: '將左右兩側項目正確配對' }, {});

        function renderPairRows() {
            const rowsEl = container.querySelector('#dmPairRows');
            if (!rowsEl) return;
            rowsEl.innerHTML = pairs.map((p, i) => `
                <div class="dm-pair-row" data-idx="${i}">
                    <span class="dm-pair-num">${i + 1}</span>
                    <input type="text" class="config-input dm-pair-left" data-idx="${i}"
                           placeholder="左項..." value="${escapeHtml(p.leftContent)}">
                    <span class="dm-pair-arrow">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M5 12h14"/><path d="M13 6l6 6-6 6"/>
                        </svg>
                    </span>
                    <input type="text" class="config-input dm-pair-right" data-idx="${i}"
                           placeholder="右項..." value="${escapeHtml(p.rightContent)}">
                    <button class="dm-pair-remove" data-idx="${i}" ${pairs.length <= 2 ? 'disabled' : ''}>&times;</button>
                </div>
            `).join('');
        }
        renderPairRows();

        // Sync input values back to pairs model before any structural change
        function syncFromDOM() {
            container.querySelectorAll('.dm-pair-left').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                if (pairs[idx]) pairs[idx].leftContent = inp.value;
            });
            container.querySelectorAll('.dm-pair-right').forEach(inp => {
                const idx = parseInt(inp.dataset.idx);
                if (pairs[idx]) pairs[idx].rightContent = inp.value;
            });
        }

        // Add pair
        container.querySelector('#dmAddPairBtn').addEventListener('click', () => {
            syncFromDOM();
            const n = pairs.length + 1;
            pairs.push({ leftId: helpers.genItemId(), leftContent: `左項 ${n}`, rightId: helpers.genItemId(), rightContent: `右項 ${n}` });
            renderPairRows();
        });

        // Remove pair (event delegation)
        container.querySelector('#dmPairRows').addEventListener('click', (e) => {
            const btn = e.target.closest('.dm-pair-remove');
            if (!btn || pairs.length <= 2) return;
            syncFromDOM();
            pairs.splice(parseInt(btn.dataset.idx), 1);
            renderPairRows();
        });

        // Create
        container.querySelector('#dmCreateBtn').addEventListener('click', () => {
            syncFromDOM();
            // Filter empty pairs
            const validPairs = pairs.filter(p => p.leftContent.trim() && p.rightContent.trim());
            if (validPairs.length < 2) return alert('至少需要 2 組配對');

            // Convert to API format
            const leftItems = validPairs.map(p => ({ id: p.leftId, content: p.leftContent.trim() }));
            const rightItems = validPairs.map(p => ({ id: p.rightId, content: p.rightContent.trim() }));
            const correctPairs = {};
            validPairs.forEach(p => { correctPairs[p.leftId] = p.rightId; });

            const common = helpers.collectCommonFields(container.querySelector('#dmCommonFields'));
            onCreate({
                template: 'drag_match',
                time_limit: common.time_limit || 120,
                show_leaderboard: common.show_leaderboard,
                show_top_n: 3,
                drag_match: {
                    left_items: leftItems,
                    right_items: rightItems,
                    correct_pairs: correctPairs,
                    instruction: common.instruction || '將左右兩側項目正確配對',
                },
            });
        });
    }

    // ── 配置面板 (选中已有 slide) ──
    function renderConfig(slide, $el) {
        const cfg = slide.config || {};
        const dm = cfg.drag_match || {};
        const leftItems = dm.left_items || [];
        const rightItems = dm.right_items || [];
        const correctPairs = dm.correct_pairs || {};

        $el.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="cfgDmInstruction" value="${escapeHtml(dm.instruction || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">左側項目</label>
                ${leftItems.map((item, i) => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                        <input type="text" class="config-input cfg-dm-left" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                    </div>
                `).join('')}
            </div>
            <div class="config-section">
                <label class="config-label">右側項目</label>
                ${rightItems.map((item, i) => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                        <input type="text" class="config-input cfg-dm-right" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                    </div>
                `).join('')}
            </div>
            <div class="config-section">
                <label class="config-label">配對</label>
                <div id="cfgDmPairs">
                    ${leftItems.map(li => `
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                            <span style="flex:1;font-size:13px;">${escapeHtml(li.content)}</span>
                            <span style="color:var(--text-tertiary);">→</span>
                            <select class="config-input cfg-dm-pair" data-left-id="${li.id}" style="flex:1;margin:0;">
                                <option value="">--</option>
                                ${rightItems.map(ri => `<option value="${ri.id}" ${correctPairs[li.id] === ri.id ? 'selected' : ''}>${escapeHtml(ri.content)}</option>`).join('')}
                            </select>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="config-section" style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <label class="config-label">時間限制 (秒)</label>
                    <input type="number" class="config-input" id="cfgDmTimeLimit" value="${cfg.time_limit || 120}" min="0" step="10">
                </div>
                <div style="flex:1;">
                    <label class="config-label" style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="cfgDmLeaderboard" ${cfg.show_leaderboard ? 'checked' : ''}> 顯示排行榜
                    </label>
                </div>
            </div>
        `;
    }

    function collectConfig(slide) {
        const instruction = document.getElementById('cfgDmInstruction')?.value?.trim();
        const leftEls = document.querySelectorAll('.cfg-dm-left');
        const rightEls = document.querySelectorAll('.cfg-dm-right');
        if (!leftEls.length) return null;

        const leftItems = [];
        leftEls.forEach(inp => leftItems.push({ id: inp.dataset.id, content: inp.value.trim() }));
        const rightItems = [];
        rightEls.forEach(inp => rightItems.push({ id: inp.dataset.id, content: inp.value.trim() }));

        const pairs = {};
        document.querySelectorAll('.cfg-dm-pair').forEach(sel => {
            if (sel.value) pairs[sel.dataset.leftId] = sel.value;
        });

        return {
            template: 'drag_match',
            time_limit: parseInt(document.getElementById('cfgDmTimeLimit')?.value) || 120,
            show_leaderboard: document.getElementById('cfgDmLeaderboard')?.checked ?? false,
            show_top_n: 3,
            drag_match: {
                left_items: leftItems,
                right_items: rightItems,
                correct_pairs: pairs,
                instruction: instruction || '將左右兩側項目正確配對',
            },
        };
    }

    const editor = { render, renderConfig, collectConfig, getDefaultConfig };
    if (window._registerInteractiveTemplateEditor) {
        window._registerInteractiveTemplateEditor('drag_match', editor);
    }
})();
