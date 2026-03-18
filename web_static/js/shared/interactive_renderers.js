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
    _timer: null,
    _state: {
        submitted: false,
        locked: false,
        slideData: null,
        onSubmitCallback: null,
        onProgressCallback: null,
    },

    reset() {
        if (this._dragEngine) {
            this._dragEngine.destroy();
            this._dragEngine = null;
        }
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
                        ${locked ? '🔒 已鎖定 — 學生無法操作' : '🔓 已解鎖 — 學生可操作'}
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
                            <span class="drag-handle">☰</span>
                            <span class="drag-content">${this._renderItemContent(item)}</span>
                        </div>
                    `).join('')}
                </div>
                <button class="interactive-submit-btn" id="interactiveSubmitBtn">提交答案</button>
                <div class="interactive-lock-overlay" id="interactiveLockOverlay" style="display:${this._state.locked ? 'flex' : 'none'};">
                    <div class="lock-icon">🔒</div>
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
        if (this._dragEngine) {
            this._dragEngine.setLocked(locked);
        }
        const overlay = document.getElementById('interactiveLockOverlay');
        if (overlay) {
            overlay.style.display = locked ? 'flex' : 'none';
        }
    },
});
