/**
 * 互动活动运行时渲染器
 * ============================================
 * 全局挂载: LessonSlideRenderers.register('interactive', ...)
 *
 * Phase 1: drag_sort 模板
 * - Pointer Events 触控拖拽引擎 (结构状态驱动, 非像素坐标)
 * - GSAP 揭晓动画
 * - 老师端进度仪表板
 */
'use strict';

LessonSlideRenderers.register('interactive', {

    _dragEngine: null,
    _matchEngine: null,
    _placeEngine: null,
    _canvasEngine: null,
    _timer: null,
    _state: {
        submitted: false,
        locked: false,
        slideData: null,
        onSubmitCallback: null,
        onProgressCallback: null,
        shuffledRightIds: null,
    },

    reset() {
        // 清理所有引擎
        ['_dragEngine', '_matchEngine', '_placeEngine', '_canvasEngine'].forEach(key => {
            if (this[key]) { this[key].destroy(); this[key] = null; }
        });
        if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
        }
        this._state = {
            submitted: false,
            locked: false,
            slideData: null,
            onSubmitCallback: null,
            onProgressCallback: null,
            shuffledRightIds: null,
        };
    },

    // ═══════════════════════════════════════════════════════
    // 学生端: 路由到模板渲染器
    // ═══════════════════════════════════════════════════════

    renderStudent(container, slideData, opts) {
        this.reset();
        this._state.slideData = slideData;
        this._state.onSubmitCallback = opts.onSubmit;
        this._state.onProgressCallback = opts.onProgress;
        this._state.locked = slideData.locked || false;

        const renderer = this['_render_' + slideData.template];
        if (renderer) {
            renderer.call(this, container, slideData, opts);
        } else {
            container.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-tertiary);">此互動模板尚未支援</div>';
        }
    },

    // ═══════════════════════════════════════════════════════
    // 老师端: 进度仪表板
    // ═══════════════════════════════════════════════════════

    renderTeacher(container, slide, cfg, runtimeMeta) {
        const template = cfg.template || 'drag_sort';
        const subCfg = cfg[template] || {};
        const locked = runtimeMeta?.locked || false;

        // html_sandbox: 教師端也顯示 iframe 內容，方便一邊播放一邊教學
        if (template === 'html_sandbox' && subCfg.html_content) {
            // 強制容器撐滿
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.width = '100%';
            container.style.height = '100%';

            container.innerHTML = `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;min-height:70vh;">
                    <div style="padding:8px 14px;font-size:13px;font-weight:600;color:#1D1D1F;background:rgba(245,245,247,0.9);border-bottom:1px solid #E5E5EA;display:flex;align-items:center;gap:8px;">
                        <span style="padding:2px 8px;border-radius:6px;background:#006633;color:#fff;font-size:11px;">${this._templateName(template)}</span>
                        <span>${this._escapeHtml(subCfg.instruction || '')}</span>
                    </div>
                    <iframe id="teacherSandboxFrame" sandbox="allow-scripts" style="flex:1;width:100%;border:none;min-height:0;"></iframe>
                </div>
            `;
            const frame = document.getElementById('teacherSandboxFrame');
            if (frame) frame.srcdoc = subCfg.html_content;
            return;
        }

        const totalItems = subCfg.items?.length || subCfg.left_items?.length || 0;

        container.innerHTML = `
            <div class="interactive-teacher-view">
                <div class="interactive-teacher-header">
                    <div class="interactive-template-badge">${this._templateName(template)}</div>
                    <div style="font-size:13px;color:var(--text-secondary);">${totalItems} 個項目</div>
                </div>
                <div class="interactive-instruction" style="padding:12px 0;font-size:14px;color:var(--text-secondary);">
                    ${this._escapeHtml(subCfg.instruction || '')}
                </div>
                <div class="interactive-progress-grid" id="interactiveProgressGrid">
                    <div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;">
                        等待學生操作中...
                    </div>
                </div>
                <div style="margin-top:12px;text-align:center;">
                    <span style="font-size:12px;color:var(--text-tertiary);">
                        ${locked ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> 已鎖定 — 學生無法操作' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle;margin-right:4px;"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 019.9-1"/></svg> 已解鎖 — 學生可操作'}
                    </span>
                </div>
            </div>
        `;
    },

    /**
     * 更新老师端单个学生的进度 (从 WS 调用)
     */
    updateStudentProgress(username, pct) {
        const grid = document.getElementById('interactiveProgressGrid');
        if (!grid) return;
        let row = grid.querySelector(`[data-username="${CSS.escape(username)}"]`);
        if (!row) {
            // 清除"等待"提示
            const placeholder = grid.querySelector('div[style*="text-align:center"]');
            if (placeholder && !grid.querySelector('.interactive-progress-row')) {
                placeholder.remove();
            }
            row = document.createElement('div');
            row.className = 'interactive-progress-row';
            row.dataset.username = username;
            row.innerHTML = `
                <span class="interactive-progress-name">${this._escapeHtml(username)}</span>
                <div class="interactive-progress-bar-wrap">
                    <div class="interactive-progress-bar-fill" style="width:0%"></div>
                </div>
                <span class="interactive-progress-pct">0%</span>
            `;
            grid.appendChild(row);
        }
        const fill = row.querySelector('.interactive-progress-bar-fill');
        const pctEl = row.querySelector('.interactive-progress-pct');
        if (fill) fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
        if (pctEl) pctEl.textContent = Math.round(pct) + '%';
    },

    // ═══════════════════════════════════════════════════════
    // 揭晓动画 (GSAP)
    // ═══════════════════════════════════════════════════════

    renderReveal(container, slideData, revealPayload, myResponse) {
        const template = revealPayload?.template || slideData?.template;
        const animator = this['_reveal_' + template];
        if (animator) {
            animator.call(this, container, slideData, revealPayload?.reveal || {}, myResponse);
        }
    },

    // ═══════════════════════════════════════════════════════
    // 成绩展示
    // ═══════════════════════════════════════════════════════

    renderResults(container, results, myUsername) {
        const total = results?.total_responses || 0;
        const avg = results?.avg_score || 0;
        const leaderboard = results?.leaderboard || [];

        let html = '<div class="interactive-results">';
        html += `<div class="interactive-results-stats">
            <div><span style="font-size:24px;font-weight:700;">${total}</span><br><span style="font-size:12px;color:var(--text-tertiary);">人已作答</span></div>
            <div><span style="font-size:24px;font-weight:700;">${avg}</span><br><span style="font-size:12px;color:var(--text-tertiary);">平均分</span></div>
        </div>`;

        if (leaderboard.length > 0) {
            html += '<div class="interactive-results-board">';
            leaderboard.forEach(entry => {
                const isMe = entry.username === myUsername;
                html += `<div class="interactive-results-row ${isMe ? 'is-me' : ''}">
                    <span class="rank">#${entry.rank}</span>
                    <span class="name">${this._escapeHtml(entry.username)}${isMe ? ' (你)' : ''}</span>
                    <span class="score">${entry.score}分</span>
                </div>`;
            });
            html += '</div>';
        }
        html += '</div>';
        container.innerHTML = html;
    },

    // ═══════════════════════════════════════════════════════
    // drag_sort 模板
    // ═══════════════════════════════════════════════════════

    _render_drag_sort(container, slideData, opts) {
        const cfg = slideData.config || {};
        const items = cfg.items ? [...cfg.items] : [];
        const instruction = cfg.instruction || '將以下項目排列為正確順序';
        const timeLimit = slideData.time_limit || 0;

        // 打乱顺序 (Fisher-Yates)
        for (let i = items.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [items[i], items[j]] = [items[j], items[i]];
        }

        container.innerHTML = `
            <div class="interactive-activity drag-sort-activity">
                <div class="interactive-header">
                    <div class="interactive-instruction-text">${this._escapeHtml(instruction)}</div>
                    ${timeLimit > 0 ? `<div class="interactive-timer" id="interactiveTimer">${timeLimit}s</div>` : ''}
                </div>
                <div class="drag-sort-container" id="dragSortContainer">
                    ${items.map((item, i) => `
                        <div class="drag-item" data-id="${this._escapeHtml(item.id)}" data-index="${i}">
                            <span class="drag-handle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg></span>
                            <span class="drag-content">${this._renderItemContent(item)}</span>
                        </div>
                    `).join('')}
                </div>
                <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交答案</button>
                <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                    <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <div>老師已暫停操作</div>
                </div>
            </div>
        `;

        // 初始化拖拽引擎
        const dragContainer = document.getElementById('dragSortContainer');
        this._dragEngine = this._createDragEngine(dragContainer, items);

        // 锁定状态
        if (this._state.locked) {
            this._dragEngine.setLocked(true);
        }

        // 计时器
        if (timeLimit > 0) {
            this._startTimer(timeLimit);
        }

        // 提交按钮
        document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
            if (this._state.submitted) return;
            this._state.submitted = true;
            const order = this._dragEngine.getOrder();
            document.getElementById('interactiveSubmitBtn').textContent = '已提交';
            document.getElementById('interactiveSubmitBtn').disabled = true;
            this._dragEngine.setLocked(true);
            if (this._state.onSubmitCallback) {
                this._state.onSubmitCallback({ order });
            }
        });

        // 进度上报 (debounced)
        this._setupProgressReporting(items.length);
    },

    _reveal_drag_sort(container, slideData, reveal, myResponse) {
        const correctOrder = reveal?.correct_order || [];
        const myOrder = myResponse?.order || [];
        const dragContainer = document.getElementById('dragSortContainer');
        if (!dragContainer || !correctOrder.length) return;

        const itemEls = Array.from(dragContainer.querySelectorAll('.drag-item'));
        const gsap = window.gsap;

        if (!gsap) {
            // 无 GSAP 降级: 直接标记对错
            itemEls.forEach(el => {
                const id = el.dataset.id;
                const currentIdx = myOrder.indexOf(id);
                const correctIdx = correctOrder.indexOf(id);
                if (currentIdx === correctIdx) {
                    el.classList.add('correct');
                } else {
                    el.classList.add('incorrect');
                }
            });
            return;
        }

        // GSAP 动画
        const tl = gsap.timeline();

        // 1. 标记当前位置对错
        itemEls.forEach((el, i) => {
            const id = el.dataset.id;
            const correctIdx = correctOrder.indexOf(id);
            if (i === correctIdx) {
                tl.to(el, {
                    backgroundColor: 'rgba(52, 199, 89, 0.15)',
                    borderColor: '#34C759',
                    boxShadow: '0 0 12px rgba(52,199,89,0.3)',
                    duration: 0.4,
                }, i * 0.1);
            } else {
                tl.to(el, {
                    x: '+=5',
                    duration: 0.08,
                    repeat: 5,
                    yoyo: true,
                    ease: 'power2.inOut',
                }, i * 0.1);
                tl.to(el, {
                    backgroundColor: 'rgba(255, 59, 48, 0.1)',
                    borderColor: '#FF3B30',
                    duration: 0.3,
                }, i * 0.1 + 0.4);
            }
        });

        // 2. 重排到正确顺序
        tl.add(() => {}, '+=0.8');
        correctOrder.forEach((id, targetIdx) => {
            const el = dragContainer.querySelector(`[data-id="${CSS.escape(id)}"]`);
            if (!el) return;
            const currentIdx = Array.from(dragContainer.children).indexOf(el);
            if (currentIdx !== targetIdx) {
                const targetEl = dragContainer.children[targetIdx];
                tl.add(() => {
                    if (targetEl) {
                        dragContainer.insertBefore(el, targetIdx < currentIdx ? targetEl : targetEl.nextSibling);
                    }
                });
                tl.fromTo(el, { scale: 1.05, opacity: 0.7 }, {
                    scale: 1,
                    opacity: 1,
                    duration: 0.3,
                    ease: 'back.out(1.2)',
                });
            }
            // 最终全部绿色
            tl.to(el, {
                backgroundColor: 'rgba(52, 199, 89, 0.1)',
                borderColor: '#34C759',
                boxShadow: '0 0 8px rgba(52,199,89,0.2)',
                duration: 0.3,
            }, `-=0.2`);
        });
    },

    // ═══════════════════════════════════════════════════════
    // 拖拽引擎 — Pointer Events, 结构状态驱动
    // ═══════════════════════════════════════════════════════

    _createDragEngine(container, initialItems) {
        // 结构状态: 维护 orderedIds 数组
        let orderedIds = initialItems.map(i => i.id);
        let locked = false;
        let dragging = null; // { el, startIndex, startY, placeholder }

        function getOrder() { return [...orderedIds]; }

        function setLocked(val) {
            locked = val;
            container.style.pointerEvents = val ? 'none' : '';
        }

        function getItemIndex(el) {
            return Array.from(container.children).indexOf(el);
        }

        function onPointerDown(e) {
            if (locked) return;
            const itemEl = e.target.closest('.drag-item');
            if (!itemEl || !container.contains(itemEl)) return;

            e.preventDefault();
            itemEl.setPointerCapture(e.pointerId);

            const rect = itemEl.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // 创建 placeholder
            const placeholder = document.createElement('div');
            placeholder.className = 'drag-placeholder';
            placeholder.style.height = rect.height + 'px';
            itemEl.parentNode.insertBefore(placeholder, itemEl);

            // 移到浮动层
            itemEl.classList.add('dragging');
            itemEl.style.position = 'fixed';
            itemEl.style.left = rect.left + 'px';
            itemEl.style.top = rect.top + 'px';
            itemEl.style.width = rect.width + 'px';
            itemEl.style.zIndex = '1000';

            dragging = {
                el: itemEl,
                startIndex: getItemIndex(placeholder),
                startY: e.clientY,
                offsetY: e.clientY - rect.top,
                placeholder,
                containerTop: containerRect.top,
            };
        }

        function onPointerMove(e) {
            if (!dragging) return;
            e.preventDefault();

            const { el, offsetY, placeholder } = dragging;
            const newTop = e.clientY - offsetY;
            el.style.top = newTop + 'px';

            // 计算目标 index: 基于其他 item 的中心点
            const children = Array.from(container.children).filter(c => c !== el && !c.classList.contains('drag-placeholder'));
            let targetIndex = children.length; // default: last
            for (let i = 0; i < children.length; i++) {
                const childRect = children[i].getBoundingClientRect();
                const childCenter = childRect.top + childRect.height / 2;
                if (e.clientY < childCenter) {
                    targetIndex = Array.from(container.children).indexOf(children[i]);
                    break;
                }
            }

            // 移动 placeholder
            const currentPlaceholderIdx = Array.from(container.children).indexOf(placeholder);
            if (targetIndex !== currentPlaceholderIdx) {
                const refNode = container.children[targetIndex];
                if (refNode && refNode !== placeholder) {
                    container.insertBefore(placeholder, refNode);
                } else if (!refNode) {
                    container.appendChild(placeholder);
                }
            }
        }

        function onPointerUp(e) {
            if (!dragging) return;

            const { el, placeholder } = dragging;

            // 将元素放回 placeholder 位置
            container.insertBefore(el, placeholder);
            placeholder.remove();

            // 清除浮动样式
            el.classList.remove('dragging');
            el.style.position = '';
            el.style.left = '';
            el.style.top = '';
            el.style.width = '';
            el.style.zIndex = '';

            // GSAP snap 动画
            if (window.gsap) {
                window.gsap.from(el, {
                    scale: 1.03,
                    duration: 0.25,
                    ease: 'back.out(1.5)',
                });
            }

            // 更新结构状态
            orderedIds = Array.from(container.querySelectorAll('.drag-item')).map(
                item => item.dataset.id
            );

            dragging = null;
        }

        // 绑定事件
        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerUp);
        container.addEventListener('pointercancel', onPointerUp);

        function destroy() {
            container.removeEventListener('pointerdown', onPointerDown);
            container.removeEventListener('pointermove', onPointerMove);
            container.removeEventListener('pointerup', onPointerUp);
            container.removeEventListener('pointercancel', onPointerUp);
        }

        return { getOrder, setLocked, destroy };
    },

    // ═══════════════════════════════════════════════════════
    // 辅助工具
    // ═══════════════════════════════════════════════════════

    _startTimer(seconds) {
        let remaining = seconds;
        const timerEl = document.getElementById('interactiveTimer');
        if (!timerEl) return;
        this._timer = setInterval(() => {
            remaining--;
            if (remaining <= 0) {
                clearInterval(this._timer);
                timerEl.textContent = '0s';
                timerEl.classList.add('time-up');
                // 自动提交
                if (!this._state.submitted) {
                    document.getElementById('interactiveSubmitBtn')?.click();
                }
            } else {
                timerEl.textContent = remaining + 's';
                if (remaining <= 10) timerEl.classList.add('time-warning');
            }
        }, 1000);
    },

    _setupProgressReporting(totalItems) {
        if (!this._state.onProgressCallback || !this._dragEngine) return;
        let lastPct = 0;
        const report = () => {
            if (this._state.submitted) return;
            // 简单的进度计算: 已拖拽过 = 有操作 → 50%, 否则 0%
            // 更好的方式是追踪每次 drop 事件, 但 MVP 用简化方式
            const pct = 50; // 表示"在操作中"
            if (pct !== lastPct) {
                lastPct = pct;
                this._state.onProgressCallback(pct);
            }
        };
        const container = document.getElementById('dragSortContainer');
        if (container) {
            container.addEventListener('pointerup', () => {
                setTimeout(report, 100);
            });
        }
    },

    _renderItemContent(item) {
        if (item.content_type === 'math' && window.katex) {
            try {
                return window.katex.renderToString(item.content, { throwOnError: false });
            } catch { /* fall through */ }
        }
        if (item.content_type === 'image') {
            return `<img src="${this._escapeHtml(item.content)}" style="max-height:60px;max-width:100%;object-fit:contain;">`;
        }
        return this._escapeHtml(item.content);
    },

    _templateName(template) {
        const names = {
            drag_sort: '拖拽排序',
            drag_match: '拖拽配對',
            drag_place: '拖拽放置',
            free_canvas: '自由畫布',
            html_sandbox: '代碼動畫',
        };
        return names[template] || template;
    },

    _escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    // ═══════════════════════════════════════════════════════
    // 锁定/解锁 (从外部 WS 调用)
    // ═══════════════════════════════════════════════════════

    setLocked(locked) {
        this._state.locked = locked;
        // 路由到当前活跃引擎
        ['_dragEngine', '_matchEngine', '_placeEngine', '_canvasEngine'].forEach(key => {
            if (this[key]) this[key].setLocked(locked);
        });
        const overlay = document.getElementById('interactiveLockOverlay');
        if (overlay) {
            overlay.style.display = locked ? 'flex' : 'none';
        }
    },

    // ═══════════════════════════════════════════════════════
    // drag_match 模板 — SVG 连线配对
    // ═══════════════════════════════════════════════════════

    _render_drag_match(container, slideData, opts) {
        const cfg = slideData.config || {};
        const leftItems = cfg.left_items || [];
        const rightItems = cfg.right_items || [];
        const instruction = cfg.instruction || '將左右兩側配對連線';
        const timeLimit = slideData.time_limit || 0;

        // 首次 shuffle 右列并固定
        if (!this._state.shuffledRightIds) {
            const shuffled = rightItems.map(i => i.id);
            for (let i = shuffled.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
            }
            this._state.shuffledRightIds = shuffled;
        }
        const orderedRight = this._state.shuffledRightIds.map(id => rightItems.find(i => i.id === id)).filter(Boolean);

        container.innerHTML = `
            <div class="interactive-activity drag-match-activity">
                <div class="interactive-header">
                    <div class="interactive-instruction-text">${this._escapeHtml(instruction)}</div>
                    ${timeLimit > 0 ? `<div class="interactive-timer" id="interactiveTimer">${timeLimit}s</div>` : ''}
                </div>
                <div class="drag-match-workspace" id="dragMatchWorkspace">
                    <div class="drag-match-column left-column">
                        ${leftItems.map(item => `
                            <div class="drag-match-item left-item" data-id="${this._escapeHtml(item.id)}">
                                <span class="drag-match-content">${this._renderItemContent(item)}</span>
                            </div>
                        `).join('')}
                    </div>
                    <svg class="drag-match-canvas" id="dragMatchSvg"></svg>
                    <div class="drag-match-column right-column">
                        ${orderedRight.map(item => `
                            <div class="drag-match-item right-item" data-id="${this._escapeHtml(item.id)}">
                                <span class="drag-match-content">${this._renderItemContent(item)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交答案</button>
                <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                    <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <div>老師已暫停操作</div>
                </div>
            </div>
        `;

        const workspace = document.getElementById('dragMatchWorkspace');
        const svg = document.getElementById('dragMatchSvg');
        this._matchEngine = this._createMatchEngine(workspace, svg, leftItems.length);

        if (this._state.locked) this._matchEngine.setLocked(true);
        if (timeLimit > 0) this._startTimer(timeLimit);

        document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
            if (this._state.submitted) return;
            this._state.submitted = true;
            const response = this._matchEngine.getResponse();
            document.getElementById('interactiveSubmitBtn').textContent = '已提交';
            document.getElementById('interactiveSubmitBtn').disabled = true;
            this._matchEngine.setLocked(true);
            if (this._state.onSubmitCallback) this._state.onSubmitCallback(response);
        });

        // 进度
        if (this._state.onProgressCallback) {
            workspace.addEventListener('pointerup', () => {
                const pct = Math.round(Object.keys(this._matchEngine.getResponse().pairs).length / leftItems.length * 100);
                this._state.onProgressCallback(pct);
            });
        }
    },

    _createMatchEngine(workspace, svg, totalLeft) {
        const pairs = {};       // leftId → rightId
        const reversePairs = {}; // rightId → leftId
        let locked = false;
        let activeLine = null;  // 临时连线
        let activeLeftId = null;
        const lines = {};       // leftId → SVG <line>

        function computeAnchorPoint(el, side) {
            const rect = el.getBoundingClientRect();
            const wsRect = workspace.getBoundingClientRect();
            const y = rect.top + rect.height / 2 - wsRect.top;
            const x = side === 'right' ? rect.left - wsRect.left : rect.right - wsRect.left;
            return { x, y };
        }

        function redrawAllLines() {
            Object.keys(lines).forEach(leftId => {
                const line = lines[leftId];
                const rightId = pairs[leftId];
                if (!rightId) { line.remove(); delete lines[leftId]; return; }
                const leftEl = workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`);
                const rightEl = workspace.querySelector(`.right-item[data-id="${CSS.escape(rightId)}"]`);
                if (!leftEl || !rightEl) return;
                const a = computeAnchorPoint(leftEl, 'right');
                const b = computeAnchorPoint(rightEl, 'left');
                line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
                line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
            });
        }

        function createLine(x1, y1, x2, y2, cls) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x1); line.setAttribute('y1', y1);
            line.setAttribute('x2', x2); line.setAttribute('y2', y2);
            if (cls) line.setAttribute('class', cls);
            svg.appendChild(line);
            return line;
        }

        function clearPair(leftId) {
            const oldRight = pairs[leftId];
            if (oldRight) {
                delete reversePairs[oldRight];
                workspace.querySelector(`.right-item[data-id="${CSS.escape(oldRight)}"]`)?.classList.remove('paired');
            }
            delete pairs[leftId];
            workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`)?.classList.remove('paired');
            if (lines[leftId]) { lines[leftId].remove(); delete lines[leftId]; }
        }

        function makePair(leftId, rightId) {
            // 自动挤掉旧绑定
            if (reversePairs[rightId]) clearPair(reversePairs[rightId]);
            clearPair(leftId);
            pairs[leftId] = rightId;
            reversePairs[rightId] = leftId;
            workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`)?.classList.add('paired');
            workspace.querySelector(`.right-item[data-id="${CSS.escape(rightId)}"]`)?.classList.add('paired');
            const leftEl = workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`);
            const rightEl = workspace.querySelector(`.right-item[data-id="${CSS.escape(rightId)}"]`);
            if (leftEl && rightEl) {
                const a = computeAnchorPoint(leftEl, 'right');
                const b = computeAnchorPoint(rightEl, 'left');
                lines[leftId] = createLine(a.x, a.y, b.x, b.y, 'match-line');
            }
        }

        function onPointerDown(e) {
            if (locked) return;
            const leftEl = e.target.closest('.left-item');
            if (!leftEl) return;
            e.preventDefault();
            const leftId = leftEl.dataset.id;

            // 如果已配对，点击取消
            if (pairs[leftId] && !activeLine) {
                clearPair(leftId);
                return;
            }

            activeLeftId = leftId;
            leftEl.classList.add('active');
            const anchor = computeAnchorPoint(leftEl, 'right');
            activeLine = createLine(anchor.x, anchor.y, anchor.x, anchor.y, 'match-line-temp');
        }

        function onPointerMove(e) {
            if (!activeLine) return;
            e.preventDefault();
            const wsRect = workspace.getBoundingClientRect();
            activeLine.setAttribute('x2', e.clientX - wsRect.left);
            activeLine.setAttribute('y2', e.clientY - wsRect.top);
        }

        function onPointerUp(e) {
            if (!activeLine || !activeLeftId) return;
            const rightEl = e.target.closest('.right-item');
            if (rightEl) {
                makePair(activeLeftId, rightEl.dataset.id);
            }
            // 清理
            activeLine.remove();
            activeLine = null;
            workspace.querySelector(`.left-item[data-id="${CSS.escape(activeLeftId)}"]`)?.classList.remove('active');
            activeLeftId = null;
        }

        workspace.addEventListener('pointerdown', onPointerDown);
        workspace.addEventListener('pointermove', onPointerMove);
        workspace.addEventListener('pointerup', onPointerUp);
        workspace.addEventListener('pointercancel', onPointerUp);

        const ro = new ResizeObserver(() => redrawAllLines());
        ro.observe(workspace);

        return {
            getResponse() { return { pairs: { ...pairs } }; },
            setLocked(v) { locked = v; if (v && activeLine) { activeLine.remove(); activeLine = null; activeLeftId = null; } },
            destroy() {
                workspace.removeEventListener('pointerdown', onPointerDown);
                workspace.removeEventListener('pointermove', onPointerMove);
                workspace.removeEventListener('pointerup', onPointerUp);
                workspace.removeEventListener('pointercancel', onPointerUp);
                ro.disconnect();
            },
        };
    },

    _reveal_drag_match(container, slideData, reveal, myResponse) {
        const correctPairs = reveal?.correct_pairs || {};
        const myPairs = myResponse?.pairs || {};
        const workspace = document.getElementById('dragMatchWorkspace');
        const svg = document.getElementById('dragMatchSvg');
        if (!workspace || !svg) return;

        const gsap = window.gsap;

        // 清除旧连线, 画出学生的对错
        svg.innerHTML = '';
        const wsRect = workspace.getBoundingClientRect();

        function anchor(el, side) {
            const r = el.getBoundingClientRect();
            return {
                x: side === 'right' ? r.right - wsRect.left : r.left - wsRect.left,
                y: r.top + r.height / 2 - wsRect.top,
            };
        }

        // 画学生连线 + 标记对错
        Object.entries(myPairs).forEach(([leftId, rightId]) => {
            const leftEl = workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`);
            const rightEl = workspace.querySelector(`.right-item[data-id="${CSS.escape(rightId)}"]`);
            if (!leftEl || !rightEl) return;
            const a = anchor(leftEl, 'right');
            const b = anchor(rightEl, 'left');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
            const isCorrect = correctPairs[leftId] === rightId;
            line.setAttribute('class', isCorrect ? 'match-line correct' : 'match-line incorrect');
            svg.appendChild(line);
            leftEl.classList.add(isCorrect ? 'correct' : 'incorrect');
            rightEl.classList.add(isCorrect ? 'correct' : 'incorrect');
        });

        // 补画缺失的正确连线 (学生未配对的)
        Object.entries(correctPairs).forEach(([leftId, rightId]) => {
            if (myPairs[leftId] === rightId) return; // 已画
            const leftEl = workspace.querySelector(`.left-item[data-id="${CSS.escape(leftId)}"]`);
            const rightEl = workspace.querySelector(`.right-item[data-id="${CSS.escape(rightId)}"]`);
            if (!leftEl || !rightEl) return;
            const a = anchor(leftEl, 'right');
            const b = anchor(rightEl, 'left');
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
            line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
            line.setAttribute('class', 'match-line correct missed');
            line.style.opacity = '0';
            svg.appendChild(line);
            if (gsap) {
                gsap.to(line, { opacity: 1, duration: 0.6, delay: 0.8 });
            } else {
                line.style.opacity = '0.6';
            }
        });

        if (gsap) {
            gsap.from(svg.querySelectorAll('.incorrect'), { opacity: 0, duration: 0.4, stagger: 0.1 });
        }
    },

    // ═══════════════════════════════════════════════════════
    // drag_place 模板 — 背景图 + zone 放置
    // ═══════════════════════════════════════════════════════

    _render_drag_place(container, slideData, opts) {
        const cfg = slideData.config || {};
        const items = cfg.items || [];
        const zones = cfg.zones || [];
        const bgImage = cfg.background_image || '';
        const instruction = cfg.instruction || '將項目放置到正確位置';
        const timeLimit = slideData.time_limit || 0;

        container.innerHTML = `
            <div class="interactive-activity drag-place-activity">
                <div class="interactive-header">
                    <div class="interactive-instruction-text">${this._escapeHtml(instruction)}</div>
                    ${timeLimit > 0 ? `<div class="interactive-timer" id="interactiveTimer">${timeLimit}s</div>` : ''}
                </div>
                <div class="drag-place-workspace" id="dragPlaceWorkspace">
                    <div class="drag-place-background" id="dragPlaceBg">
                        ${bgImage ? `<img src="${this._escapeHtml(bgImage)}" id="dragPlaceBgImg" style="width:100%;height:100%;object-fit:contain;display:block;">` : ''}
                        ${zones.map(z => `
                            <div class="drag-place-zone" data-zone-id="${this._escapeHtml(z.id)}"
                                 style="left:${z.x_pct}%;top:${z.y_pct}%;width:${z.width_pct}%;height:${z.height_pct}%;">
                                <span class="zone-label">${this._escapeHtml(z.label || '')}</span>
                            </div>
                        `).join('')}
                    </div>
                    <div class="drag-place-item-pool" id="dragPlacePool">
                        ${items.map(item => `
                            <div class="drag-place-chip" data-item-id="${this._escapeHtml(item.id)}">
                                ${this._renderItemContent(item)}
                            </div>
                        `).join('')}
                    </div>
                </div>
                <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交答案</button>
                <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                    <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <div>老師已暫停操作</div>
                </div>
            </div>
        `;

        const workspace = document.getElementById('dragPlaceWorkspace');
        const bgEl = document.getElementById('dragPlaceBg');
        const pool = document.getElementById('dragPlacePool');
        this._placeEngine = this._createPlaceEngine(workspace, bgEl, pool, zones);

        if (this._state.locked) this._placeEngine.setLocked(true);
        if (timeLimit > 0) this._startTimer(timeLimit);

        document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
            if (this._state.submitted) return;
            this._state.submitted = true;
            const response = this._placeEngine.getResponse();
            document.getElementById('interactiveSubmitBtn').textContent = '已提交';
            document.getElementById('interactiveSubmitBtn').disabled = true;
            this._placeEngine.setLocked(true);
            if (this._state.onSubmitCallback) this._state.onSubmitCallback(response);
        });

        if (this._state.onProgressCallback) {
            workspace.addEventListener('pointerup', () => {
                setTimeout(() => {
                    const resp = this._placeEngine.getResponse();
                    const total = items.length || 1;
                    const pct = Math.round(Object.keys(resp.placement).length / total * 100);
                    this._state.onProgressCallback(pct);
                }, 100);
            });
        }
    },

    _createPlaceEngine(workspace, bgEl, pool, zones) {
        const placement = {};   // itemId → zoneId
        const zoneItems = {};   // zoneId → itemId
        let locked = false;
        let dragging = null;

        function getImageRect() {
            const img = bgEl.querySelector('img');
            if (!img || !img.naturalWidth) {
                return { offsetX: 0, offsetY: 0, width: bgEl.clientWidth, height: bgEl.clientHeight };
            }
            const cw = bgEl.clientWidth, ch = bgEl.clientHeight;
            const nw = img.naturalWidth, nh = img.naturalHeight;
            const scale = Math.min(cw / nw, ch / nh);
            const w = nw * scale, h = nh * scale;
            return { offsetX: (cw - w) / 2, offsetY: (ch - h) / 2, width: w, height: h };
        }

        function hitTestZone(clientX, clientY) {
            const bgRect = bgEl.getBoundingClientRect();
            const imgRect = getImageRect();
            const relX = clientX - bgRect.left - imgRect.offsetX;
            const relY = clientY - bgRect.top - imgRect.offsetY;
            const pctX = relX / imgRect.width * 100;
            const pctY = relY / imgRect.height * 100;
            for (const z of zones) {
                if (pctX >= z.x_pct && pctX <= z.x_pct + z.width_pct &&
                    pctY >= z.y_pct && pctY <= z.y_pct + z.height_pct) {
                    return z.id;
                }
            }
            return null;
        }

        function snapToZone(chipEl, zoneId) {
            const zoneEl = bgEl.querySelector(`[data-zone-id="${CSS.escape(zoneId)}"]`);
            if (!zoneEl || !chipEl) return;
            // 从 pool 移除, 放入 zone 中心
            chipEl.classList.add('placed');
            chipEl.style.position = 'absolute';
            const zr = zoneEl.getBoundingClientRect();
            const bgRect = bgEl.getBoundingClientRect();
            chipEl.style.left = (zr.left - bgRect.left + zr.width / 2 - chipEl.offsetWidth / 2) + 'px';
            chipEl.style.top = (zr.top - bgRect.top + zr.height / 2 - chipEl.offsetHeight / 2) + 'px';
            if (chipEl.parentNode !== bgEl) bgEl.appendChild(chipEl);
        }

        function returnToPool(chipEl) {
            chipEl.classList.remove('placed');
            chipEl.style.position = '';
            chipEl.style.left = '';
            chipEl.style.top = '';
            if (chipEl.parentNode !== pool) pool.appendChild(chipEl);
        }

        function onPointerDown(e) {
            if (locked) return;
            const chip = e.target.closest('.drag-place-chip');
            if (!chip) return;
            e.preventDefault();
            chip.setPointerCapture(e.pointerId);
            const rect = chip.getBoundingClientRect();
            // 如果已放置, 先退回
            const itemId = chip.dataset.itemId;
            if (placement[itemId]) {
                const oldZone = placement[itemId];
                delete zoneItems[oldZone];
                delete placement[itemId];
            }
            returnToPool(chip);
            chip.classList.add('dragging');
            dragging = { el: chip, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
            chip.style.position = 'fixed';
            chip.style.left = rect.left + 'px';
            chip.style.top = rect.top + 'px';
            chip.style.width = rect.width + 'px';
            chip.style.zIndex = '1000';
        }

        function onPointerMove(e) {
            if (!dragging) return;
            e.preventDefault();
            dragging.el.style.left = (e.clientX - dragging.offsetX) + 'px';
            dragging.el.style.top = (e.clientY - dragging.offsetY) + 'px';
            // 高亮命中 zone
            bgEl.querySelectorAll('.drag-place-zone').forEach(z => z.classList.remove('hover'));
            const hitZone = hitTestZone(e.clientX, e.clientY);
            if (hitZone) {
                bgEl.querySelector(`[data-zone-id="${CSS.escape(hitZone)}"]`)?.classList.add('hover');
            }
        }

        function onPointerUp(e) {
            if (!dragging) return;
            const chip = dragging.el;
            const itemId = chip.dataset.itemId;
            chip.classList.remove('dragging');
            chip.style.position = '';
            chip.style.left = '';
            chip.style.top = '';
            chip.style.width = '';
            chip.style.zIndex = '';
            bgEl.querySelectorAll('.drag-place-zone').forEach(z => z.classList.remove('hover'));

            const hitZone = hitTestZone(e.clientX, e.clientY);
            if (hitZone) {
                // zone 已有 item → 退回 pool
                if (zoneItems[hitZone]) {
                    const oldItemId = zoneItems[hitZone];
                    const oldChip = workspace.querySelector(`[data-item-id="${CSS.escape(oldItemId)}"]`);
                    if (oldChip) returnToPool(oldChip);
                    delete placement[oldItemId];
                }
                placement[itemId] = hitZone;
                zoneItems[hitZone] = itemId;
                snapToZone(chip, hitZone);
                if (window.gsap) window.gsap.from(chip, { scale: 1.1, duration: 0.2, ease: 'back.out(1.5)' });
            } else {
                returnToPool(chip);
                if (window.gsap) window.gsap.from(chip, { opacity: 0.5, duration: 0.2 });
            }
            dragging = null;
        }

        workspace.addEventListener('pointerdown', onPointerDown);
        workspace.addEventListener('pointermove', onPointerMove);
        workspace.addEventListener('pointerup', onPointerUp);
        workspace.addEventListener('pointercancel', onPointerUp);

        const ro = new ResizeObserver(() => {
            // 重新定位所有已放置的 chip
            Object.entries(placement).forEach(([itemId, zoneId]) => {
                const chip = workspace.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
                if (chip) snapToZone(chip, zoneId);
            });
        });
        ro.observe(bgEl);

        return {
            getResponse() { return { placement: { ...placement } }; },
            setLocked(v) { locked = v; if (v && dragging) { returnToPool(dragging.el); dragging.el.classList.remove('dragging'); dragging = null; } },
            destroy() {
                workspace.removeEventListener('pointerdown', onPointerDown);
                workspace.removeEventListener('pointermove', onPointerMove);
                workspace.removeEventListener('pointerup', onPointerUp);
                workspace.removeEventListener('pointercancel', onPointerUp);
                ro.disconnect();
            },
        };
    },

    _reveal_drag_place(container, slideData, reveal, myResponse) {
        const correctPlacement = reveal?.correct_placement || {};
        const myPlacement = myResponse?.placement || {};
        const workspace = document.getElementById('dragPlaceWorkspace');
        const bgEl = document.getElementById('dragPlaceBg');
        if (!workspace || !bgEl) return;

        const gsap = window.gsap;

        Object.entries(myPlacement).forEach(([itemId, zoneId]) => {
            const chip = workspace.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
            const isCorrect = correctPlacement[itemId] === zoneId;
            if (chip) chip.classList.add(isCorrect ? 'correct' : 'incorrect');
            if (chip && isCorrect && gsap) {
                gsap.to(chip, { boxShadow: '0 0 12px rgba(52,199,89,0.4)', duration: 0.4 });
            }
        });

        // 动画: 错误的飞到正确 zone
        if (gsap) {
            setTimeout(() => {
                Object.entries(correctPlacement).forEach(([itemId, zoneId]) => {
                    if (myPlacement[itemId] === zoneId) return;
                    const chip = workspace.querySelector(`[data-item-id="${CSS.escape(itemId)}"]`);
                    const zoneEl = bgEl.querySelector(`[data-zone-id="${CSS.escape(zoneId)}"]`);
                    if (!chip || !zoneEl) return;
                    const zr = zoneEl.getBoundingClientRect();
                    const bgRect = bgEl.getBoundingClientRect();
                    const targetLeft = zr.left - bgRect.left + zr.width / 2 - chip.offsetWidth / 2;
                    const targetTop = zr.top - bgRect.top + zr.height / 2 - chip.offsetHeight / 2;
                    chip.style.position = 'absolute';
                    if (chip.parentNode !== bgEl) bgEl.appendChild(chip);
                    gsap.to(chip, {
                        left: targetLeft, top: targetTop,
                        duration: 0.6, ease: 'power2.out',
                        onComplete: () => { chip.classList.remove('incorrect'); chip.classList.add('correct'); }
                    });
                });
            }, 800);
        }
    },

    // ═══════════════════════════════════════════════════════
    // free_canvas 模板 — Fabric.js 画布
    // ═══════════════════════════════════════════════════════

    _render_free_canvas(container, slideData, opts) {
        const cfg = slideData.config || {};
        const tools = cfg.tools || ['pen', 'arrow', 'text'];
        const instruction = cfg.instruction || '在畫布上標記或繪圖';
        const bgImage = cfg.background_image || '';
        const timeLimit = slideData.time_limit || 0;
        const COLORS = ['#000000', '#FF3B30', '#006633', '#007AFF', '#FF9500', '#AF52DE'];
        const WIDTHS = [2, 4, 8];

        container.innerHTML = `
            <div class="interactive-activity free-canvas-activity">
                <div class="interactive-header">
                    <div class="interactive-instruction-text">${this._escapeHtml(instruction)}</div>
                    ${timeLimit > 0 ? `<div class="interactive-timer" id="interactiveTimer">${timeLimit}s</div>` : ''}
                </div>
                <div class="free-canvas-toolbar" id="canvasToolbar">
                    ${tools.includes('pen') ? '<button class="canvas-tool-btn active" data-tool="pen" title="畫筆"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg></button>' : ''}
                    ${tools.includes('arrow') ? '<button class="canvas-tool-btn" data-tool="arrow" title="箭頭"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></button>' : ''}
                    ${tools.includes('text') ? '<button class="canvas-tool-btn" data-tool="text" title="文字"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9.5" y1="20" x2="14.5" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg></button>' : ''}
                    <button class="canvas-tool-btn" data-tool="undo" title="撤銷"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg></button>
                    <span style="width:1px;height:24px;background:rgba(0,0,0,0.1);margin:0 4px;"></span>
                    ${COLORS.map((c, i) => `<span class="canvas-color-swatch ${i === 0 ? 'active' : ''}" data-color="${c}" style="background:${c};"></span>`).join('')}
                    <span style="width:1px;height:24px;background:rgba(0,0,0,0.1);margin:0 4px;"></span>
                    ${WIDTHS.map((w, i) => `<button class="canvas-tool-btn canvas-stroke-btn ${i === 1 ? 'active' : ''}" data-width="${w}" style="font-size:${8 + w * 2}px;">●</button>`).join('')}
                </div>
                <div class="free-canvas-wrapper" id="canvasWrapper">
                    <canvas id="fabricCanvas"></canvas>
                </div>
                <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交作品</button>
                <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                    <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                    <div>老師已暫停操作</div>
                </div>
            </div>
        `;

        if (!window.fabric) {
            document.getElementById('canvasWrapper').innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-tertiary);">畫布組件未載入</div>';
            return;
        }

        const wrapper = document.getElementById('canvasWrapper');
        this._canvasEngine = this._createCanvasEngine(wrapper, { tools, bgImage, colors: COLORS, widths: WIDTHS });

        if (this._state.locked) this._canvasEngine.setLocked(true);
        if (timeLimit > 0) this._startTimer(timeLimit);

        // 工具栏交互
        const toolbar = document.getElementById('canvasToolbar');
        toolbar.addEventListener('click', (e) => {
            const toolBtn = e.target.closest('[data-tool]');
            const colorSwatch = e.target.closest('[data-color]');
            const widthBtn = e.target.closest('[data-width]');
            if (toolBtn) {
                const tool = toolBtn.dataset.tool;
                if (tool === 'undo') { this._canvasEngine.undo(); return; }
                toolbar.querySelectorAll('[data-tool]').forEach(b => b.classList.remove('active'));
                toolBtn.classList.add('active');
                this._canvasEngine.setTool(tool);
            }
            if (colorSwatch) {
                toolbar.querySelectorAll('[data-color]').forEach(s => s.classList.remove('active'));
                colorSwatch.classList.add('active');
                this._canvasEngine.setColor(colorSwatch.dataset.color);
            }
            if (widthBtn) {
                toolbar.querySelectorAll('[data-width]').forEach(b => b.classList.remove('active'));
                widthBtn.classList.add('active');
                this._canvasEngine.setWidth(parseInt(widthBtn.dataset.width));
            }
        });

        // 进度: 首次绘图 → 50%
        let progressSent = false;
        if (this._state.onProgressCallback) {
            this._canvasEngine.onFirstDraw = () => {
                if (!progressSent) { progressSent = true; this._state.onProgressCallback(50); }
            };
        }

        document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
            if (this._state.submitted) return;
            this._state.submitted = true;
            const response = this._canvasEngine.getResponse();
            document.getElementById('interactiveSubmitBtn').textContent = '已提交';
            document.getElementById('interactiveSubmitBtn').disabled = true;
            this._canvasEngine.setLocked(true);
            if (this._state.onSubmitCallback) this._state.onSubmitCallback(response);
        });
    },

    _createCanvasEngine(wrapper, config) {
        const canvasEl = wrapper.querySelector('canvas');
        const w = wrapper.clientWidth || 600;
        const h = wrapper.clientHeight || 400;
        canvasEl.width = w; canvasEl.height = h;
        const canvas = new fabric.Canvas(canvasEl, { isDrawingMode: true, width: w, height: h });
        let currentTool = 'pen';
        let currentColor = config.colors?.[0] || '#000';
        let currentWidth = config.widths?.[1] || 4;
        const undoStack = [];
        let onFirstDraw = null;

        canvas.freeDrawingBrush = new fabric.PencilBrush(canvas);
        canvas.freeDrawingBrush.color = currentColor;
        canvas.freeDrawingBrush.width = currentWidth;

        // 背景图
        if (config.bgImage) {
            fabric.Image.fromURL(config.bgImage, (img) => {
                if (!img) return;
                canvas.setBackgroundImage(img, canvas.renderAll.bind(canvas), {
                    scaleX: canvas.width / img.width,
                    scaleY: canvas.height / img.height,
                });
            });
        }

        // undo 状态
        canvas.on('object:added', () => {
            undoStack.push(JSON.stringify(canvas.toJSON()));
            if (onFirstDraw) { onFirstDraw(); onFirstDraw = null; }
        });

        // Arrow tool: pointerdown/up 在非 drawing mode 下画线
        let arrowStart = null;
        canvas.on('mouse:down', (opt) => {
            if (currentTool === 'arrow') {
                arrowStart = canvas.getPointer(opt.e);
            } else if (currentTool === 'text') {
                const pointer = canvas.getPointer(opt.e);
                const text = new fabric.IText('文字', {
                    left: pointer.x, top: pointer.y,
                    fontSize: 18, fill: currentColor,
                    fontFamily: '-apple-system, sans-serif',
                });
                canvas.add(text);
                canvas.setActiveObject(text);
                text.enterEditing();
            }
        });
        canvas.on('mouse:up', (opt) => {
            if (currentTool === 'arrow' && arrowStart) {
                const end = canvas.getPointer(opt.e);
                const dx = end.x - arrowStart.x, dy = end.y - arrowStart.y;
                if (Math.sqrt(dx * dx + dy * dy) < 10) { arrowStart = null; return; }
                const line = new fabric.Line([arrowStart.x, arrowStart.y, end.x, end.y], {
                    stroke: currentColor, strokeWidth: currentWidth, selectable: true,
                });
                // 箭头头部
                const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                const head = new fabric.Triangle({
                    left: end.x, top: end.y,
                    width: currentWidth * 4, height: currentWidth * 4,
                    fill: currentColor, angle: angle + 90,
                    originX: 'center', originY: 'center', selectable: false,
                });
                canvas.add(line, head);
                arrowStart = null;
            }
        });

        function setTool(tool) {
            currentTool = tool;
            canvas.isDrawingMode = (tool === 'pen');
            canvas.selection = (tool !== 'pen');
            if (tool === 'pen') {
                canvas.freeDrawingBrush.color = currentColor;
                canvas.freeDrawingBrush.width = currentWidth;
            }
        }

        // ResizeObserver
        const ro = new ResizeObserver(() => {
            const nw = wrapper.clientWidth, nh = wrapper.clientHeight;
            if (nw > 0 && nh > 0) {
                canvas.setDimensions({ width: nw, height: nh });
                canvas.renderAll();
            }
        });
        ro.observe(wrapper);

        return {
            getResponse() {
                const maxW = 1200;
                let dataUrl;
                if (canvas.width > maxW) {
                    const scale = maxW / canvas.width;
                    dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.5, multiplier: scale });
                } else {
                    dataUrl = canvas.toDataURL({ format: 'jpeg', quality: 0.5 });
                }
                return { canvas_json: JSON.stringify(canvas.toJSON()), preview_base64: dataUrl };
            },
            setLocked(v) {
                canvas.isDrawingMode = false;
                canvas.selection = !v;
                canvas.forEachObject(o => { o.selectable = !v; o.evented = !v; });
                canvas.renderAll();
            },
            setTool,
            setColor(c) { currentColor = c; canvas.freeDrawingBrush.color = c; },
            setWidth(w) { currentWidth = w; canvas.freeDrawingBrush.width = w; },
            undo() {
                if (undoStack.length > 1) {
                    undoStack.pop();
                    canvas.loadFromJSON(undoStack[undoStack.length - 1], () => canvas.renderAll());
                } else if (undoStack.length === 1) {
                    undoStack.pop();
                    canvas.clear();
                }
            },
            set onFirstDraw(fn) { onFirstDraw = fn; },
            destroy() { ro.disconnect(); try { canvas.dispose(); } catch(e) {} },
        };
    },

    _reveal_free_canvas(container, slideData, reveal, myResponse) {
        // 无标准答案，显示提示
        const activity = container.querySelector('.free-canvas-activity');
        if (!activity) return;
        const msg = document.createElement('div');
        msg.style.cssText = 'text-align:center;padding:20px;background:var(--brand-light,#E8F5EC);border-radius:12px;margin-top:12px;font-size:15px;color:var(--brand,#006633);';
        msg.textContent = '老師將批閱您的作品';
        activity.appendChild(msg);
    },

    // ═══════════════════════════════════════════════════════
    // html_sandbox 模板 — 沙箱 iframe
    // ═══════════════════════════════════════════════════════

    _render_html_sandbox(container, slideData, opts) {
        const cfg = slideData.config || {};
        const htmlContent = cfg.html_content || '<p>內容未設定</p>';
        const instruction = cfg.instruction || '與下方互動內容進行操作';
        const allowEdit = cfg.allow_student_edit || false;
        const timeLimit = slideData.time_limit || 0;

        // DOMPurify 清理 (如果可用)
        const sanitized = window.DOMPurify ? window.DOMPurify.sanitize(htmlContent, {
            FORBID_TAGS: ['form', 'input', 'object', 'embed'],
            ALLOW_UNKNOWN_PROTOCOLS: false,
        }) : htmlContent;

        if (allowEdit) {
            container.innerHTML = `
                <div class="interactive-activity html-sandbox-activity">
                    <div class="interactive-header">
                        <div class="interactive-instruction-text">${this._escapeHtml(instruction)}</div>
                        ${timeLimit > 0 ? `<div class="interactive-timer" id="interactiveTimer">${timeLimit}s</div>` : ''}
                    </div>
                    <div class="html-sandbox-split">
                        <div class="html-sandbox-editor-pane">
                            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                                <span style="font-size:12px;color:var(--text-tertiary);">HTML 編輯器</span>
                                <button class="canvas-tool-btn" id="sandboxRefreshBtn" title="更新預覽" style="font-size:12px;padding:4px 8px;width:auto;display:inline-flex;align-items:center;gap:4px;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg> 預覽</button>
                            </div>
                            <textarea id="sandboxCodeEditor">${this._escapeHtml(htmlContent)}</textarea>
                        </div>
                        <div class="html-sandbox-preview-pane">
                            <iframe id="sandboxFrame" sandbox="allow-scripts"></iframe>
                        </div>
                    </div>
                    <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交代碼</button>
                    <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                        <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                        <div>老師已暫停操作</div>
                    </div>
                </div>
            `;

            const editor = document.getElementById('sandboxCodeEditor');
            const frame = document.getElementById('sandboxFrame');
            if (frame) frame.srcdoc = sanitized;

            // Tab 键插入空格
            editor.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const start = editor.selectionStart;
                    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(editor.selectionEnd);
                    editor.selectionStart = editor.selectionEnd = start + 2;
                }
            });

            // debounced 自动预览
            let debounceTimer;
            editor.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(() => {
                    frame.srcdoc = editor.value;
                }, 500);
            });

            // 手动刷新
            document.getElementById('sandboxRefreshBtn').addEventListener('click', () => {
                frame.srcdoc = editor.value;
            });

            document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
                if (this._state.submitted) return;
                this._state.submitted = true;
                document.getElementById('interactiveSubmitBtn').textContent = '已提交';
                document.getElementById('interactiveSubmitBtn').disabled = true;
                if (this._state.onSubmitCallback) {
                    this._state.onSubmitCallback({ html_content: editor.value });
                }
            });

            if (this._state.onProgressCallback) {
                editor.addEventListener('input', () => { this._state.onProgressCallback(50); }, { once: true });
            }
        } else {
            // 纯展示模式 — iframe 全屏顯示
            // 強制容器撐滿（覆蓋 canvas-wrapper 的 inline-block 限制）
            container.style.display = 'flex';
            container.style.flexDirection = 'column';
            container.style.width = '100%';
            container.style.height = '100%';
            container.style.maxWidth = 'none';
            container.style.maxHeight = 'none';

            container.innerHTML = `
                <div style="display:flex;flex-direction:column;width:100%;height:100%;min-height:80vh;">
                    <div style="padding:10px 16px;font-size:14px;font-weight:600;color:#1D1D1F;background:rgba(255,255,255,0.8);border-bottom:1px solid #E5E5EA;">
                        ${this._escapeHtml(instruction)}
                    </div>
                    <iframe id="sandboxFrame" sandbox="allow-scripts" style="flex:1;width:100%;border:none;min-height:0;"></iframe>
                    <div style="padding:10px 16px;display:flex;gap:10px;background:rgba(255,255,255,0.8);border-top:1px solid #E5E5EA;">
                        <button class="interactive-submit-btn" id="interactiveSubmitBtn" style="flex:1;">我已查看</button>
                    </div>
                    <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                        <div class="lock-icon"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
                        <div>老師已暫停操作</div>
                    </div>
                </div>
            `;

            const frame = document.getElementById('sandboxFrame');
            if (frame) frame.srcdoc = htmlContent;
            if (this._state.onProgressCallback) {
                frame.addEventListener('load', () => { this._state.onProgressCallback(100); });
            }

            document.getElementById('interactiveSubmitBtn').addEventListener('click', () => {
                if (this._state.submitted) return;
                this._state.submitted = true;
                document.getElementById('interactiveSubmitBtn').textContent = '已確認';
                document.getElementById('interactiveSubmitBtn').disabled = true;
                if (this._state.onSubmitCallback) this._state.onSubmitCallback({});
            });
        }

        if (timeLimit > 0) this._startTimer(timeLimit);
    },

    _reveal_html_sandbox(container, slideData, reveal, myResponse) {
        // 无揭晓
    },
});
