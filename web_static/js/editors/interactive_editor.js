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
        { id: 'drag_sort', name: '拖拽排序', desc: '將項目排列為正確順序', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="8,9 12,5 16,9"/><polyline points="8,15 12,19 16,15"/></svg>', enabled: true },
        { id: 'drag_match', name: '拖拽配對', desc: '將左右兩側配對連線', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="15,8 19,12 15,16"/><polyline points="9,8 5,12 9,16"/></svg>', enabled: true },
        { id: 'drag_place', name: '拖拽放置', desc: '將項目放置到正確位置', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>', enabled: true },
        { id: 'free_canvas', name: '自由畫布', desc: '在畫布上標記或繪圖', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/></svg>', enabled: true },
        { id: 'html_sandbox', name: '代碼動畫', desc: '嵌入互動 HTML 動畫', icon: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>', enabled: true },
    ];

    // 模板子编辑器 registry
    const TEMPLATE_EDITORS = {};
    window._registerInteractiveTemplateEditor = function (templateId, editor) {
        TEMPLATE_EDITORS[templateId] = editor;
    };

    // ── 编辑器公共 helpers (避免子编辑器复制粘贴) ──
    let _helperCounter = 0;
    window._interactiveEditorHelpers = {
        genItemId() {
            _helperCounter++;
            return 'item' + _helperCounter + '_' + Date.now().toString(36);
        },

        /** 渲染通用字段: instruction / time_limit / show_leaderboard */
        renderCommonFields(container, cfg, opts) {
            const hideLeaderboard = opts && opts.hideLeaderboard;
            container.innerHTML = `
                <div class="config-section">
                    <label class="config-label">指令文本</label>
                    <input type="text" class="config-input common-instruction" value="${escapeHtml(cfg.instruction || '')}" placeholder="活動指令...">
                </div>
                <div class="config-section" style="display:flex;gap:12px;">
                    <div style="flex:1;">
                        <label class="config-label">時間限制 (秒)</label>
                        <input type="number" class="config-input common-time-limit" value="${cfg.time_limit || 0}" min="0" step="10">
                    </div>
                    ${hideLeaderboard ? '' : `
                    <div style="flex:1;">
                        <label class="config-label" style="display:flex;align-items:center;gap:6px;">
                            <input type="checkbox" class="common-show-leaderboard" ${cfg.show_leaderboard ? 'checked' : ''}> 顯示排行榜
                        </label>
                    </div>`}
                </div>
            `;
        },

        /** 收集通用字段值 */
        collectCommonFields(container) {
            return {
                instruction: container.querySelector('.common-instruction')?.value?.trim() || '',
                time_limit: parseInt(container.querySelector('.common-time-limit')?.value) || 0,
                show_leaderboard: container.querySelector('.common-show-leaderboard')?.checked ?? false,
            };
        },

        /** 渲染可增删的 item 列表（支持圖片上傳） */
        renderItemListEditor(listEl, items, opts) {
            const label = opts && opts.label || '項目';
            listEl.innerHTML = items.map((item, i) => {
                const isImg = item.content_type === 'image' && item.content;
                return `<div class="ds-item-row" data-idx="${i}" style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px;">
                    <span style="color:var(--text-tertiary);font-size:12px;min-width:20px;text-align:center;">${i + 1}</span>
                    <input type="text" class="config-input helper-item-content" value="${escapeHtml(isImg ? '' : item.content)}"
                           placeholder="${label}內容..." style="flex:1;margin:0;${isImg ? 'display:none;' : ''}">
                    ${isImg
                        ? `<img src="${escapeHtml(item.content)}" style="height:40px;border-radius:4px;object-fit:cover;flex:1;max-width:120px;">
                           <button class="helper-img-remove" data-idx="${i}" style="background:none;border:none;color:#FF3B30;cursor:pointer;font-size:14px;" title="移除圖片">&times;</button>`
                        : `<label style="cursor:pointer;flex-shrink:0;color:var(--text-tertiary);" title="上傳圖片">
                               <input type="file" accept="image/*" class="helper-img-input" data-idx="${i}" style="display:none;">
                               <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                           </label>`
                    }
                    <button class="helper-remove-btn" data-idx="${i}" style="background:none;border:none;color:var(--text-tertiary);cursor:pointer;font-size:16px;padding:4px;">&times;</button>
                </div>`;
            }).join('');

            const self = this;
            listEl.querySelectorAll('.helper-remove-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    if (items.length <= (opts && opts.minItems || 2)) return alert(`至少需要 ${opts && opts.minItems || 2} 個${label}`);
                    items.splice(idx, 1);
                    self.renderItemListEditor(listEl, items, opts);
                });
            });

            listEl.querySelectorAll('.helper-item-content').forEach((inp, idx) => {
                inp.addEventListener('input', () => {
                    items[idx].content = inp.value;
                    items[idx].content_type = 'text';
                });
            });

            // 圖片上傳
            listEl.querySelectorAll('.helper-img-input').forEach(input => {
                input.addEventListener('change', async () => {
                    const idx = parseInt(input.dataset.idx);
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
                            items[idx].content = json.data.url;
                            items[idx].content_type = 'image';
                            self.renderItemListEditor(listEl, items, opts);
                            if (typeof editorState !== 'undefined') editorState.dirty = true;
                        }
                    } catch (e) { console.error('圖片上傳失敗', e); }
                });
            });

            // 移除圖片
            listEl.querySelectorAll('.helper-img-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.dataset.idx);
                    items[idx].content = '';
                    items[idx].content_type = 'text';
                    self.renderItemListEditor(listEl, items, opts);
                    if (typeof editorState !== 'undefined') editorState.dirty = true;
                });
            });
        },

        escapeHtml,
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
                            <div style="display:flex;justify-content:center;margin-bottom:4px;">${t.icon}</div>
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
            if (window._interactivePreview) {
                // Deferred: preview.create() will be called from renderConfig()
                // because renderPreview runs first and config DOM doesn't exist yet
                $el.classList.add('has-interactive-preview');
                this._pendingPreview = { container: $el, slide: slide };
            } else {
                // Fallback: inline preview
                const cfg = slide.config || {};
                const tpl = TEMPLATES.find(t => t.id === cfg.template) || TEMPLATES[0];
                const subCfg = cfg[cfg.template] || {};

                // html_sandbox: 直接用 iframe 預覽 HTML 代碼
                if (cfg.template === 'html_sandbox' && subCfg.html_content) {
                    $el.innerHTML = `
                        <div style="width:100%;height:100%;display:flex;flex-direction:column;">
                            <div style="padding:8px 12px;font-size:12px;color:var(--text-tertiary);border-bottom:1px solid var(--border-light,#F2F2F7);display:flex;justify-content:space-between;align-items:center;">
                                <span>${tpl.name} — ${escapeHtml(subCfg.instruction || '')}</span>
                            </div>
                            <iframe id="editorHtmlPreviewFrame" sandbox="allow-scripts" style="flex:1;border:none;width:100%;min-height:400px;border-radius:0 0 8px 8px;background:#fff;"></iframe>
                        </div>
                    `;
                    const frame = document.getElementById('editorHtmlPreviewFrame');
                    if (frame) frame.srcdoc = subCfg.html_content;
                } else {
                    const itemCount = subCfg.items?.length || subCfg.left_items?.length || 0;
                    $el.innerHTML = `
                        <div class="preview-type-card">
                            <div class="preview-type-icon" style="display:flex;justify-content:center;">${tpl.icon}</div>
                            <div style="font-weight:600;margin:8px 0 4px;">${tpl.name}</div>
                            <div style="font-size:12px;color:var(--text-tertiary);">
                                ${subCfg.instruction || tpl.desc}
                            </div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:8px;">
                                ${itemCount} 個項目 · 時限 ${cfg.time_limit || 120}s
                            </div>
                        </div>
                    `;
                }
            }
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

            // Now both preview container and config root exist — create live preview
            const pending = this._pendingPreview;
            if (pending && window._interactivePreview) {
                window._interactivePreview.create(
                    pending.container,
                    slide,
                    () => {
                        // Dynamic: always read current template, never capture stale value
                        const tid = (slide.config || {}).template || 'drag_sort';
                        return { editor: TEMPLATE_EDITORS[tid], templateId: tid };
                    },
                    $el  // configRoot — preview binds/unbinds listeners here
                );
                this._pendingPreview = null;
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
