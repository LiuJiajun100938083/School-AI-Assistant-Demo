/**
 * 互动活动编辑器 — 自由畫布 (free_canvas) 模板
 *
 * 依赖: interactive_editor.js (提供 _registerInteractiveTemplateEditor + _interactiveEditorHelpers)
 */
'use strict';

(function () {
    const helpers = window._interactiveEditorHelpers;
    const escapeHtml = helpers?.escapeHtml || (s => s || '');
    if (!helpers) return;

    const DEFAULT_TOOLS = ['pen', 'arrow', 'text'];

    function getDefaultConfig() {
        return {
            template: 'free_canvas',
            time_limit: 0,
            show_leaderboard: false,
            free_canvas: {
                instruction: '在畫布上標記或繪圖',
                background_url: '',
                enabled_tools: [...DEFAULT_TOOLS],
            },
        };
    }

    function render(container, onCreate) {
        const cfg = getDefaultConfig();
        const fc = cfg.free_canvas;

        container.innerHTML = `
            <div id="fcCommonFields"></div>
            <div class="config-section">
                <label class="config-label">背景圖片 URL (可選)</label>
                <input type="text" class="config-input" id="fcBgUrl" placeholder="https://..." value="">
            </div>
            <div class="config-section">
                <label class="config-label">啟用工具</label>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    ${DEFAULT_TOOLS.map(t => `
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" class="fc-tool-check" data-tool="${t}" checked>
                            ${{ pen: 'Pen 畫筆', arrow: 'Arrow 箭頭', text: 'Text 文字' }[t]}
                        </label>
                    `).join('')}
                </div>
            </div>
            <button id="fcCreateBtn" class="ppt-upload-btn" style="width:100%;margin-top:12px;background:var(--brand,#34C759);color:#fff;font-weight:600;">
                建立自由畫布活動
            </button>
        `;

        helpers.renderCommonFields(container.querySelector('#fcCommonFields'), fc, { hideLeaderboard: true });

        container.querySelector('#fcCreateBtn').addEventListener('click', () => {
            const tools = [];
            container.querySelectorAll('.fc-tool-check').forEach(cb => {
                if (cb.checked) tools.push(cb.dataset.tool);
            });
            if (!tools.length) return alert('至少需要啟用 1 個工具');

            const common = helpers.collectCommonFields(container.querySelector('#fcCommonFields'));
            onCreate({
                template: 'free_canvas',
                time_limit: common.time_limit || 0,
                show_leaderboard: false,
                free_canvas: {
                    instruction: common.instruction || '在畫布上標記或繪圖',
                    background_url: container.querySelector('#fcBgUrl').value.trim(),
                    enabled_tools: tools,
                },
            });
        });
    }

    function renderConfig(slide, $el) {
        const cfg = slide.config || {};
        const fc = cfg.free_canvas || {};
        const enabledTools = fc.enabled_tools || DEFAULT_TOOLS;

        $el.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="cfgFcInstruction" value="${escapeHtml(fc.instruction || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">背景圖片 URL</label>
                <input type="text" class="config-input" id="cfgFcBgUrl" value="${escapeHtml(fc.background_url || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">啟用工具</label>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    ${DEFAULT_TOOLS.map(t => `
                        <label style="display:flex;align-items:center;gap:4px;font-size:13px;">
                            <input type="checkbox" class="cfg-fc-tool" data-tool="${t}" ${enabledTools.includes(t) ? 'checked' : ''}>
                            ${{ pen: 'Pen 畫筆', arrow: 'Arrow 箭頭', text: 'Text 文字' }[t]}
                        </label>
                    `).join('')}
                </div>
            </div>
            <div class="config-section">
                <label class="config-label">時間限制 (秒, 0=無限)</label>
                <input type="number" class="config-input" id="cfgFcTimeLimit" value="${cfg.time_limit || 0}" min="0" step="10">
            </div>
        `;
    }

    function collectConfig(slide) {
        const tools = [];
        document.querySelectorAll('.cfg-fc-tool').forEach(cb => {
            if (cb.checked) tools.push(cb.dataset.tool);
        });

        return {
            template: 'free_canvas',
            time_limit: parseInt(document.getElementById('cfgFcTimeLimit')?.value) || 0,
            show_leaderboard: false,
            free_canvas: {
                instruction: document.getElementById('cfgFcInstruction')?.value?.trim() || '在畫布上標記或繪圖',
                background_url: document.getElementById('cfgFcBgUrl')?.value?.trim() || '',
                enabled_tools: tools.length ? tools : [...DEFAULT_TOOLS],
            },
        };
    }

    const editor = { render, renderConfig, collectConfig, getDefaultConfig };
    if (window._registerInteractiveTemplateEditor) {
        window._registerInteractiveTemplateEditor('free_canvas', editor);
    }
})();
