/**
 * 互动活动编辑器 — 注册入口 + 模板选择
 *
 * 依赖: lesson_editor.js (提供 window._lessonEditorRegisterSlideType)
 * 子模块: interactive_editor_drag_sort.js (提供 window._interactiveDragSortEditor)
 */
'use strict';

(function () {
    const registerSlideType = window._lessonEditorRegisterSlideType;
    const escapeHtml = window._lessonEditorEscapeHtml || (s => s || '');
    if (!registerSlideType) return;

    // 模板定义
    const TEMPLATES = [
        { id: 'drag_sort', name: '拖拽排序', desc: '將項目排列為正確順序', icon: '↕', enabled: true },
        { id: 'drag_match', name: '拖拽配對', desc: '將左右兩側配對連線', icon: '↔', enabled: false },
        { id: 'drag_place', name: '拖拽放置', desc: '將項目放置到正確位置', icon: '📌', enabled: false },
        { id: 'free_canvas', name: '自由畫布', desc: '在畫布上標記或繪圖', icon: '🎨', enabled: false },
        { id: 'html_sandbox', name: '代碼動畫', desc: '嵌入互動 HTML 動畫', icon: '💻', enabled: false },
    ];

    // 模板子编辑器 registry
    const TEMPLATE_EDITORS = {};
    window._registerInteractiveTemplateEditor = function (templateId, editor) {
        TEMPLATE_EDITORS[templateId] = editor;
    };

    /**
     * 初始化模板选择 UI (在 add-slide modal 中)
     * @param {HTMLElement} container - #interactiveTemplateConfig
     * @param {Function} onCreate - 调用 createSlideOfType('interactive', config)
     */
    window._interactiveEditorInit = function (container, onCreate) {
        container.innerHTML = `
            <div class="config-section">
                <label class="config-label">選擇活動模板</label>
                <div class="interactive-template-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;margin-bottom:16px;">
                    ${TEMPLATES.map(t => `
                        <div class="interactive-tpl-card ${t.enabled ? '' : 'disabled'}"
                             data-template="${t.id}"
                             style="border:2px solid var(--border);border-radius:12px;padding:12px;text-align:center;cursor:${t.enabled ? 'pointer' : 'not-allowed'};opacity:${t.enabled ? '1' : '0.4'};transition:all .2s;">
                            <div style="font-size:24px;margin-bottom:4px;">${t.icon}</div>
                            <div style="font-weight:600;font-size:13px;">${t.name}</div>
                            <div style="font-size:11px;color:var(--text-tertiary);">${t.desc}</div>
                            ${!t.enabled ? '<div style="font-size:10px;color:var(--text-tertiary);margin-top:4px;">即將推出</div>' : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            <div id="interactiveSubConfig"></div>
        `;

        // 模板选择交互
        container.querySelectorAll('.interactive-tpl-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', () => {
                // 高亮选中
                container.querySelectorAll('.interactive-tpl-card').forEach(c =>
                    c.style.borderColor = 'var(--border)'
                );
                card.style.borderColor = 'var(--brand, #34C759)';

                const templateId = card.dataset.template;
                const subContainer = document.getElementById('interactiveSubConfig');
                const editor = TEMPLATE_EDITORS[templateId];
                if (editor) {
                    editor.render(subContainer, onCreate);
                } else {
                    subContainer.innerHTML = '<p style="color:var(--text-tertiary);text-align:center;">此模板編輯器尚未就緒</p>';
                }
            });
        });

        // 默认选中第一个可用模板
        const firstEnabled = container.querySelector('.interactive-tpl-card:not(.disabled)');
        if (firstEnabled) firstEnabled.click();
    };

    // ── 注册 slide type handler (编辑器的预览/配置/收集) ──
    registerSlideType('interactive', {
        label: '互動活動',

        getDefaultTitle() { return '互動活動'; },

        getDefaultConfig() {
            if (window._interactiveDragSortEditor) {
                return window._interactiveDragSortEditor.getDefaultConfig();
            }
            return {
                template: 'drag_sort',
                time_limit: 120,
                show_correct_on_submit: false,
                show_leaderboard: false,
                show_top_n: 3,
                drag_sort: {
                    items: [
                        { id: 'item1', content: '項目 1', content_type: 'text' },
                        { id: 'item2', content: '項目 2', content_type: 'text' },
                        { id: 'item3', content: '項目 3', content_type: 'text' },
                    ],
                    correct_order: ['item1', 'item2', 'item3'],
                    instruction: '將以下項目排列為正確順序',
                },
            };
        },

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            const tpl = TEMPLATES.find(t => t.id === cfg.template) || TEMPLATES[0];
            const subCfg = cfg[cfg.template] || {};
            const itemCount = subCfg.items?.length || subCfg.left_items?.length || 0;
            $el.innerHTML = `
                <div class="preview-type-card">
                    <div class="preview-type-icon" style="font-size:32px;">${tpl.icon}</div>
                    <div style="font-weight:600;margin:8px 0 4px;">${tpl.name}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">
                        ${subCfg.instruction || tpl.desc}
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                        ${itemCount} 個項目 · 時限 ${cfg.time_limit || 120}s
                    </div>
                </div>
            `;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            const templateId = cfg.template || 'drag_sort';
            const editor = TEMPLATE_EDITORS[templateId];
            if (editor && editor.renderConfig) {
                editor.renderConfig(slide, $el);
            } else {
                $el.innerHTML = `
                    <div class="config-section">
                        <p style="color:var(--text-tertiary);">模板: ${templateId}</p>
                        <p style="color:var(--text-tertiary);">此模板的配置編輯器尚未就緒</p>
                    </div>
                `;
            }
        },

        collectConfig(slide) {
            const cfg = slide.config || {};
            const templateId = cfg.template || 'drag_sort';
            const editor = TEMPLATE_EDITORS[templateId];
            if (editor && editor.collectConfig) {
                return editor.collectConfig(slide);
            }
            return null;
        },
    });
})();
