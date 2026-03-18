/**
 * 互动活动编辑器 — 拖拽放置 (drag_place) 模板
 *
 * 依赖: interactive_editor.js (提供 _registerInteractiveTemplateEditor + _interactiveEditorHelpers)
 */
'use strict';

(function () {
    const helpers = window._interactiveEditorHelpers;
    const escapeHtml = helpers?.escapeHtml || (s => s || '');
    if (!helpers) return;

    function getDefaultConfig() {
        const zoneIds = [helpers.genItemId(), helpers.genItemId()];
        const itemIds = [helpers.genItemId(), helpers.genItemId()];
        return {
            template: 'drag_place',
            time_limit: 120,
            show_leaderboard: false,
            show_top_n: 3,
            drag_place: {
                background_url: '',
                zones: [
                    { id: zoneIds[0], label: '區域 A', x_pct: 10, y_pct: 10, width_pct: 30, height_pct: 30 },
                    { id: zoneIds[1], label: '區域 B', x_pct: 60, y_pct: 60, width_pct: 30, height_pct: 30 },
                ],
                items: [
                    { id: itemIds[0], content: '項目 1' },
                    { id: itemIds[1], content: '項目 2' },
                ],
                correct_placement: {
                    [itemIds[0]]: zoneIds[0],
                    [itemIds[1]]: zoneIds[1],
                },
                instruction: '將項目拖放到正確的區域',
            },
        };
    }

    function renderZoneList(container, zones) {
        const el = container.querySelector('#dpZoneList');
        if (!el) return;
        el.innerHTML = zones.map((z, i) => `
            <div class="ds-item-row" style="display:flex;flex-wrap:wrap;gap:6px;padding:8px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px;">
                <div style="display:flex;align-items:center;gap:6px;width:100%;">
                    <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                    <input type="text" class="config-input dp-zone-label" data-idx="${i}" value="${escapeHtml(z.label)}" placeholder="區域名稱" style="flex:1;margin:0;">
                    <button class="dp-zone-remove" data-idx="${i}" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:16px;">&times;</button>
                </div>
                <div style="display:flex;gap:4px;width:100%;padding-left:26px;">
                    <input type="number" class="config-input dp-zone-x" data-idx="${i}" value="${z.x_pct}" placeholder="X%" min="0" max="100" style="flex:1;margin:0;font-size:12px;" title="X %">
                    <input type="number" class="config-input dp-zone-y" data-idx="${i}" value="${z.y_pct}" placeholder="Y%" min="0" max="100" style="flex:1;margin:0;font-size:12px;" title="Y %">
                    <input type="number" class="config-input dp-zone-w" data-idx="${i}" value="${z.width_pct}" placeholder="W%" min="1" max="100" style="flex:1;margin:0;font-size:12px;" title="寬 %">
                    <input type="number" class="config-input dp-zone-h" data-idx="${i}" value="${z.height_pct}" placeholder="H%" min="1" max="100" style="flex:1;margin:0;font-size:12px;" title="高 %">
                </div>
            </div>
        `).join('');

        el.querySelectorAll('.dp-zone-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                if (zones.length <= 1) return alert('至少需要 1 個區域');
                zones.splice(parseInt(btn.dataset.idx), 1);
                renderZoneList(container, zones);
                renderPlacementSelects(container, items, zones, correctPlacement);
            });
        });
        // sync zone edits
        el.querySelectorAll('.dp-zone-label').forEach(inp => {
            inp.addEventListener('input', () => { zones[parseInt(inp.dataset.idx)].label = inp.value; });
        });
        el.querySelectorAll('.dp-zone-x').forEach(inp => {
            inp.addEventListener('input', () => { zones[parseInt(inp.dataset.idx)].x_pct = parseFloat(inp.value) || 0; });
        });
        el.querySelectorAll('.dp-zone-y').forEach(inp => {
            inp.addEventListener('input', () => { zones[parseInt(inp.dataset.idx)].y_pct = parseFloat(inp.value) || 0; });
        });
        el.querySelectorAll('.dp-zone-w').forEach(inp => {
            inp.addEventListener('input', () => { zones[parseInt(inp.dataset.idx)].width_pct = parseFloat(inp.value) || 10; });
        });
        el.querySelectorAll('.dp-zone-h').forEach(inp => {
            inp.addEventListener('input', () => { zones[parseInt(inp.dataset.idx)].height_pct = parseFloat(inp.value) || 10; });
        });
    }

    let items = [], correctPlacement = {};

    function renderPlacementSelects(container, itemsList, zones, placement) {
        const el = container.querySelector('#dpPlacementConfig');
        if (!el) return;
        el.innerHTML = itemsList.map(item => `
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                <span style="flex:1;font-size:13px;">${escapeHtml(item.content) || item.id}</span>
                <span style="color:var(--text-tertiary);">→</span>
                <select class="config-input dp-place-select" data-item-id="${item.id}" style="flex:1;margin:0;">
                    <option value="">-- 未指定 --</option>
                    ${zones.map(z => `<option value="${z.id}" ${placement[item.id] === z.id ? 'selected' : ''}>${escapeHtml(z.label) || z.id}</option>`).join('')}
                </select>
            </div>
        `).join('');
    }

    function render(container, onCreate) {
        const cfg = getDefaultConfig();
        const dp = cfg.drag_place;
        items = [...dp.items];
        let zones = [...dp.zones];
        correctPlacement = { ...dp.correct_placement };

        container.innerHTML = `
            <div id="dpCommonFields"></div>
            <div class="config-section">
                <label class="config-label">背景圖片 URL (可選)</label>
                <input type="text" class="config-input" id="dpBgUrl" placeholder="https://..." value="">
            </div>
            <div class="config-section">
                <label class="config-label">放置區域</label>
                <div id="dpZoneList"></div>
                <button id="dpAddZoneBtn" class="ppt-upload-btn" style="width:100%;margin-top:6px;padding:6px;">+ 添加區域</button>
            </div>
            <div class="config-section">
                <label class="config-label">可拖放項目</label>
                <div id="dpItemList"></div>
                <button id="dpAddItemBtn" class="ppt-upload-btn" style="width:100%;margin-top:6px;padding:6px;">+ 添加項目</button>
            </div>
            <div class="config-section">
                <label class="config-label">放置映射 (項目 → 區域)</label>
                <div id="dpPlacementConfig"></div>
            </div>
            <button id="dpCreateBtn" class="ppt-upload-btn" style="width:100%;margin-top:12px;background:var(--brand,#34C759);color:#fff;font-weight:600;">
                建立拖拽放置活動
            </button>
        `;

        helpers.renderCommonFields(container.querySelector('#dpCommonFields'), dp, {});

        function refresh() {
            renderZoneList(container, zones);
            helpers.renderItemListEditor(container.querySelector('#dpItemList'), items, { label: '項目', minItems: 1 });
            renderPlacementSelects(container, items, zones, correctPlacement);
        }
        refresh();

        container.querySelector('#dpAddZoneBtn').addEventListener('click', () => {
            zones.push({ id: helpers.genItemId(), label: `區域 ${zones.length + 1}`, x_pct: 10, y_pct: 10, width_pct: 20, height_pct: 20 });
            refresh();
        });
        container.querySelector('#dpAddItemBtn').addEventListener('click', () => {
            items.push({ id: helpers.genItemId(), content: `項目 ${items.length + 1}` });
            refresh();
        });

        container.querySelector('#dpCreateBtn').addEventListener('click', () => {
            container.querySelectorAll('#dpItemList .helper-item-content').forEach((inp, i) => {
                if (items[i]) items[i].content = inp.value.trim();
            });
            items = items.filter(i => i.content);
            zones = zones.filter(z => z.label);
            if (items.length < 1) return alert('至少需要 1 個項目');
            if (zones.length < 1) return alert('至少需要 1 個區域');

            const placement = {};
            container.querySelectorAll('.dp-place-select').forEach(sel => {
                if (sel.value) placement[sel.dataset.itemId] = sel.value;
            });

            const common = helpers.collectCommonFields(container.querySelector('#dpCommonFields'));
            onCreate({
                template: 'drag_place',
                time_limit: common.time_limit || 120,
                show_leaderboard: common.show_leaderboard,
                show_top_n: 3,
                drag_place: {
                    background_url: container.querySelector('#dpBgUrl').value.trim(),
                    zones: zones,
                    items: items,
                    correct_placement: placement,
                    instruction: common.instruction || '將項目拖放到正確的區域',
                },
            });
        });
    }

    function renderConfig(slide, $el) {
        const cfg = slide.config || {};
        const dp = cfg.drag_place || {};
        const zonesList = dp.zones || [];
        const itemsList = dp.items || [];
        const placement = dp.correct_placement || {};

        $el.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="cfgDpInstruction" value="${escapeHtml(dp.instruction || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">背景圖片 URL</label>
                <input type="text" class="config-input" id="cfgDpBgUrl" value="${escapeHtml(dp.background_url || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">區域 (${zonesList.length})</label>
                ${zonesList.map((z, i) => `
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;">
                        ${i + 1}. ${escapeHtml(z.label)} (${z.x_pct}%, ${z.y_pct}%, ${z.width_pct}×${z.height_pct}%)
                    </div>
                `).join('')}
            </div>
            <div class="config-section">
                <label class="config-label">項目</label>
                ${itemsList.map((item, i) => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="color:var(--text-tertiary);font-size:12px;">${i + 1}</span>
                        <input type="text" class="config-input cfg-dp-item" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                    </div>
                `).join('')}
            </div>
            <div class="config-section">
                <label class="config-label">放置映射</label>
                ${itemsList.map(item => `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span style="flex:1;font-size:13px;">${escapeHtml(item.content)}</span>
                        <span style="color:var(--text-tertiary);">→</span>
                        <select class="config-input cfg-dp-place" data-item-id="${item.id}" style="flex:1;margin:0;">
                            <option value="">--</option>
                            ${zonesList.map(z => `<option value="${z.id}" ${placement[item.id] === z.id ? 'selected' : ''}>${escapeHtml(z.label)}</option>`).join('')}
                        </select>
                    </div>
                `).join('')}
            </div>
            <div class="config-section" style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <label class="config-label">時間限制 (秒)</label>
                    <input type="number" class="config-input" id="cfgDpTimeLimit" value="${cfg.time_limit || 120}" min="0" step="10">
                </div>
                <div style="flex:1;">
                    <label class="config-label" style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="cfgDpLeaderboard" ${cfg.show_leaderboard ? 'checked' : ''}> 顯示排行榜
                    </label>
                </div>
            </div>
        `;
    }

    function collectConfig(slide) {
        const cfg = slide.config || {};
        const dp = cfg.drag_place || {};

        const itemEls = document.querySelectorAll('.cfg-dp-item');
        if (!itemEls.length) return null;
        const itemsList = [];
        itemEls.forEach(inp => itemsList.push({ id: inp.dataset.id, content: inp.value.trim() }));

        const placement = {};
        document.querySelectorAll('.cfg-dp-place').forEach(sel => {
            if (sel.value) placement[sel.dataset.itemId] = sel.value;
        });

        return {
            template: 'drag_place',
            time_limit: parseInt(document.getElementById('cfgDpTimeLimit')?.value) || 120,
            show_leaderboard: document.getElementById('cfgDpLeaderboard')?.checked ?? false,
            show_top_n: 3,
            drag_place: {
                background_url: document.getElementById('cfgDpBgUrl')?.value?.trim() || '',
                zones: dp.zones || [],
                items: itemsList,
                correct_placement: placement,
                instruction: document.getElementById('cfgDpInstruction')?.value?.trim() || '將項目拖放到正確的區域',
            },
        };
    }

    const editor = { render, renderConfig, collectConfig, getDefaultConfig };
    if (window._registerInteractiveTemplateEditor) {
        window._registerInteractiveTemplateEditor('drag_place', editor);
    }
})();
