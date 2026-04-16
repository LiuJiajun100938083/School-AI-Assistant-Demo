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
            rowsEl.innerHTML = pairs.map((p, i) => {
                const lIsImg = p.leftType === 'image' && p.leftContent;
                const rIsImg = p.rightType === 'image' && p.rightContent;
                return `<div class="dm-pair-row" data-idx="${i}">
                    <span class="dm-pair-num">${i + 1}</span>
                    ${lIsImg
                        ? `<img src="${escapeHtml(p.leftContent)}" class="dm-pair-img"><button class="dm-img-remove" data-idx="${i}" data-side="left" title="移除">&times;</button>`
                        : `<input type="text" class="config-input dm-pair-left" data-idx="${i}" placeholder="左項..." value="${escapeHtml(p.leftContent)}">
                           <label class="dm-img-upload" title="上傳圖片"><input type="file" accept="image/*" class="dm-img-input" data-idx="${i}" data-side="left" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                    }
                    <span class="dm-pair-arrow"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg></span>
                    ${rIsImg
                        ? `<img src="${escapeHtml(p.rightContent)}" class="dm-pair-img"><button class="dm-img-remove" data-idx="${i}" data-side="right" title="移除">&times;</button>`
                        : `<input type="text" class="config-input dm-pair-right" data-idx="${i}" placeholder="右項..." value="${escapeHtml(p.rightContent)}">
                           <label class="dm-img-upload" title="上傳圖片"><input type="file" accept="image/*" class="dm-img-input" data-idx="${i}" data-side="right" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                    }
                    <button class="dm-pair-remove" data-idx="${i}" ${pairs.length <= 2 ? 'disabled' : ''}>&times;</button>
                </div>`;
            }).join('');

            // 圖片上傳
            rowsEl.querySelectorAll('.dm-img-input').forEach(input => {
                input.addEventListener('change', async () => {
                    const idx = parseInt(input.dataset.idx);
                    const side = input.dataset.side;
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        syncFromDOM();
                        const token = (typeof AuthModule !== 'undefined') ? AuthModule.getToken() : localStorage.getItem('auth_token');
                        const fd = new FormData();
                        fd.append('file', file);
                        const res = await fetch('/api/classroom/quiz-images', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: fd,
                        });
                        const json = await res.json();
                        if (json.success && json.data?.url) {
                            if (side === 'left') { pairs[idx].leftContent = json.data.url; pairs[idx].leftType = 'image'; }
                            else { pairs[idx].rightContent = json.data.url; pairs[idx].rightType = 'image'; }
                            renderPairRows();
                        }
                    } catch (e) { console.error('圖片上傳失敗', e); }
                });
            });

            // 移除圖片
            rowsEl.querySelectorAll('.dm-img-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    syncFromDOM();
                    const idx = parseInt(btn.dataset.idx);
                    const side = btn.dataset.side;
                    if (side === 'left') { pairs[idx].leftContent = ''; pairs[idx].leftType = 'text'; }
                    else { pairs[idx].rightContent = ''; pairs[idx].rightType = 'text'; }
                    renderPairRows();
                });
            });
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
                ${leftItems.map((item, i) => {
                    const isImg = item.content_type === 'image' && item.content;
                    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                        ${isImg
                            ? `<img src="${escapeHtml(item.content)}" style="height:36px;border-radius:4px;object-fit:cover;"><button class="cfg-dm-img-remove" data-id="${escapeHtml(item.id)}" data-side="left" style="background:none;border:none;color:#FF3B30;cursor:pointer;">&times;</button>`
                            : `<input type="text" class="config-input cfg-dm-left" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                               <label style="cursor:pointer;flex-shrink:0;color:var(--text-tertiary);" title="上傳圖片"><input type="file" accept="image/*" class="cfg-dm-img-input" data-id="${escapeHtml(item.id)}" data-side="left" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                        }
                    </div>`;
                }).join('')}
            </div>
            <div class="config-section">
                <label class="config-label">右側項目</label>
                ${rightItems.map((item, i) => {
                    const isImg = item.content_type === 'image' && item.content;
                    return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                        ${isImg
                            ? `<img src="${escapeHtml(item.content)}" style="height:36px;border-radius:4px;object-fit:cover;"><button class="cfg-dm-img-remove" data-id="${escapeHtml(item.id)}" data-side="right" style="background:none;border:none;color:#FF3B30;cursor:pointer;">&times;</button>`
                            : `<input type="text" class="config-input cfg-dm-right" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                               <label style="cursor:pointer;flex-shrink:0;color:var(--text-tertiary);" title="上傳圖片"><input type="file" accept="image/*" class="cfg-dm-img-input" data-id="${escapeHtml(item.id)}" data-side="right" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                        }
                    </div>`;
                }).join('')}
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

        // Config mode: image upload for left/right items
        $el.querySelectorAll('.cfg-dm-img-input').forEach(input => {
            input.addEventListener('change', async () => {
                const id = input.dataset.id;
                const side = input.dataset.side;
                const file = input.files[0];
                if (!file) return;
                try {
                    const token = (typeof AuthModule !== 'undefined') ? AuthModule.getToken() : localStorage.getItem('auth_token');
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch('/api/classroom/quiz-images', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` },
                        body: fd,
                    });
                    const json = await res.json();
                    if (json.success && json.data?.url) {
                        const items = side === 'left' ? leftItems : rightItems;
                        const item = items.find(it => it.id === id);
                        if (item) { item.content = json.data.url; item.content_type = 'image'; }
                        renderConfig(slide, $el);
                    }
                } catch (e) { console.error('圖片上傳失敗', e); }
            });
        });
        $el.querySelectorAll('.cfg-dm-img-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                const side = btn.dataset.side;
                const items = side === 'left' ? leftItems : rightItems;
                const item = items.find(it => it.id === id);
                if (item) { item.content = ''; item.content_type = 'text'; }
                renderConfig(slide, $el);
            });
        });
    }

    function collectConfig(slide) {
        const instruction = document.getElementById('cfgDmInstruction')?.value?.trim();
        const dm = (slide.config || {}).drag_match || {};
        const origLeft = dm.left_items || [];
        const origRight = dm.right_items || [];

        // Merge: text inputs for text items, keep existing data for image items
        const leftItems = origLeft.map(orig => {
            if (orig.content_type === 'image') return { ...orig };
            const inp = document.querySelector(`.cfg-dm-left[data-id="${orig.id}"]`);
            return { id: orig.id, content: inp ? inp.value.trim() : orig.content, content_type: 'text' };
        });
        const rightItems = origRight.map(orig => {
            if (orig.content_type === 'image') return { ...orig };
            const inp = document.querySelector(`.cfg-dm-right[data-id="${orig.id}"]`);
            return { id: orig.id, content: inp ? inp.value.trim() : orig.content, content_type: 'text' };
        });
        if (!leftItems.length) return null;

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
