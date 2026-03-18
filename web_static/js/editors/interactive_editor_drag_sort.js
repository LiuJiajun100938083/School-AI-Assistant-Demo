/**
 * 互动活动编辑器 — 拖拽排序 (drag_sort) 模板
 *
 * 依赖: interactive_editor.js (提供 window._registerInteractiveTemplateEditor)
 */
'use strict';

(function () {
    const escapeHtml = window._lessonEditorEscapeHtml || (s => s || '');

    let _itemCounter = 0;

    function genItemId() {
        _itemCounter++;
        return 'item' + _itemCounter + '_' + Date.now().toString(36);
    }

    function getDefaultConfig() {
        const ids = [genItemId(), genItemId(), genItemId()];
        return {
            template: 'drag_sort',
            time_limit: 120,
            show_correct_on_submit: false,
            show_leaderboard: false,
            show_top_n: 3,
            drag_sort: {
                items: [
                    { id: ids[0], content: '第一步', content_type: 'text' },
                    { id: ids[1], content: '第二步', content_type: 'text' },
                    { id: ids[2], content: '第三步', content_type: 'text' },
                ],
                correct_order: ids,
                instruction: '將以下項目排列為正確順序',
            },
        };
    }

    /**
     * 渲染"添加幻灯片"弹窗中的 drag_sort 配置
     */
    function render(container, onCreate) {
        const cfg = getDefaultConfig();
        let items = [...cfg.drag_sort.items];

        function renderItems() {
            const listEl = container.querySelector('#dsSortItemList');
            if (!listEl) return;
            listEl.innerHTML = items.map((item, i) => `
                <div class="ds-item-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px;">
                    <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;text-align:center;">${i + 1}</span>
                    <input type="text" class="config-input ds-item-content" value="${escapeHtml(item.content)}"
                           placeholder="項目內容..." style="flex:1;margin:0;">
                    <button class="ds-remove-btn" data-idx="${i}" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:16px;padding:4px;">&times;</button>
                </div>
            `).join('');

            // 删除按钮
            listEl.querySelectorAll('.ds-remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    if (items.length <= 2) return alert('至少需要 2 個項目');
                    items.splice(idx, 1);
                    renderItems();
                });
            });

            // 实时更新 content
            listEl.querySelectorAll('.ds-item-content').forEach((inp, idx) => {
                inp.addEventListener('input', () => {
                    items[idx].content = inp.value;
                });
            });
        }

        container.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="dsInstruction" value="${escapeHtml(cfg.drag_sort.instruction)}" placeholder="排序指令...">
            </div>
            <div class="config-section">
                <label class="config-label">項目列表 <span style="font-weight:normal;color:var(--text-tertiary);font-size:11px;">(按正確順序排列)</span></label>
                <div id="dsSortItemList"></div>
                <button id="dsAddItemBtn" class="ppt-upload-btn" style="width:100%;margin-top:8px;padding:8px;">+ 添加項目</button>
            </div>
            <div class="config-section" style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <label class="config-label">時間限制 (秒)</label>
                    <input type="number" class="config-input" id="dsTimeLimit" value="120" min="0" step="10">
                </div>
                <div style="flex:1;">
                    <label class="config-label" style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="dsShowLeaderboard"> 顯示排行榜
                    </label>
                </div>
            </div>
            <button id="dsCreateBtn" class="ppt-upload-btn" style="width:100%;margin-top:12px;background:var(--brand,#34C759);color:#fff;font-weight:600;">
                建立拖拽排序活動
            </button>
        `;

        renderItems();

        // 添加项目
        container.querySelector('#dsAddItemBtn').addEventListener('click', () => {
            const newId = genItemId();
            items.push({ id: newId, content: `項目 ${items.length + 1}`, content_type: 'text' });
            renderItems();
        });

        // 创建
        container.querySelector('#dsCreateBtn').addEventListener('click', () => {
            // 收集最新内容
            container.querySelectorAll('.ds-item-content').forEach((inp, idx) => {
                if (items[idx]) items[idx].content = inp.value.trim();
            });

            // 过滤空项
            items = items.filter(i => i.content);
            if (items.length < 2) return alert('至少需要 2 個非空項目');

            const config = {
                template: 'drag_sort',
                time_limit: parseInt(container.querySelector('#dsTimeLimit').value) || 120,
                show_correct_on_submit: false,
                show_leaderboard: container.querySelector('#dsShowLeaderboard').checked,
                show_top_n: 3,
                drag_sort: {
                    items: items.map(i => ({ id: i.id, content: i.content, content_type: i.content_type || 'text' })),
                    correct_order: items.map(i => i.id),
                    instruction: container.querySelector('#dsInstruction').value.trim() || '將以下項目排列為正確順序',
                },
            };
            onCreate(config);
        });
    }

    /**
     * 渲染 slide 配置面板 (选中已有 slide 时)
     */
    function renderConfig(slide, $el) {
        const cfg = slide.config || {};
        const ds = cfg.drag_sort || {};
        const items = ds.items || [];
        const instruction = ds.instruction || '';

        $el.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="cfgDsInstruction" value="${escapeHtml(instruction)}">
            </div>
            <div class="config-section">
                <label class="config-label">項目 <span style="font-weight:normal;color:var(--text-tertiary);font-size:11px;">(按正確順序排列)</span></label>
                <div id="cfgDsItemList">
                    ${items.map((item, i) => `
                        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
                            <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;">${i + 1}</span>
                            <input type="text" class="config-input cfg-ds-item" data-id="${escapeHtml(item.id)}" value="${escapeHtml(item.content)}" style="flex:1;margin:0;">
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="config-section" style="display:flex;gap:12px;">
                <div style="flex:1;">
                    <label class="config-label">時間限制 (秒)</label>
                    <input type="number" class="config-input" id="cfgDsTimeLimit" value="${cfg.time_limit || 120}" min="0" step="10">
                </div>
                <div style="flex:1;">
                    <label class="config-label" style="display:flex;align-items:center;gap:6px;">
                        <input type="checkbox" id="cfgDsLeaderboard" ${cfg.show_leaderboard ? 'checked' : ''}> 顯示排行榜
                    </label>
                </div>
            </div>
        `;
    }

    /**
     * 收集配置面板中的值
     */
    function collectConfig(slide) {
        const instruction = document.getElementById('cfgDsInstruction')?.value?.trim();
        if (!instruction && instruction !== '') return null;

        const itemEls = document.querySelectorAll('.cfg-ds-item');
        if (!itemEls.length) return null;

        const items = [];
        itemEls.forEach(inp => {
            items.push({
                id: inp.dataset.id,
                content: inp.value.trim(),
                content_type: 'text',
            });
        });

        return {
            template: 'drag_sort',
            time_limit: parseInt(document.getElementById('cfgDsTimeLimit')?.value) || 120,
            show_correct_on_submit: false,
            show_leaderboard: document.getElementById('cfgDsLeaderboard')?.checked ?? false,
            show_top_n: 3,
            drag_sort: {
                items: items,
                correct_order: items.map(i => i.id),
                instruction: instruction || '將以下項目排列為正確順序',
            },
        };
    }

    // 暴露
    const editor = { render, renderConfig, collectConfig, getDefaultConfig };
    window._interactiveDragSortEditor = editor;

    // 注册到模板编辑器 registry
    if (window._registerInteractiveTemplateEditor) {
        window._registerInteractiveTemplateEditor('drag_sort', editor);
    }
})();
