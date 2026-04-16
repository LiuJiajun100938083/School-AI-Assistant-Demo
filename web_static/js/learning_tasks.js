/**
 * 學習任務 — 前端核心模組
 * ========================
 *
 * 架構：
 *   TasksAPI  — API 請求封裝
 *   TasksUI   — DOM 渲染
 *   TasksApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, UIModule, Utils
 * 加載順序: shared/* → learning_tasks.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const TasksAPI = {

    async fetchTasks(status = '') {
        const url = status
            ? `/api/learning-tasks?status=${status}`
            : '/api/learning-tasks';
        return this._call(url);
    },

    async fetchProgress() {
        return this._call('/api/learning-tasks/progress');
    },

    async fetchTaskDetail(taskId) {
        return this._call(`/api/learning-tasks/${taskId}`);
    },

    async toggleTaskItem(taskId, itemId) {
        const resp = await fetch(`/api/learning-tasks/${taskId}/items/${itemId}/toggle`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                ...AuthModule.getAuthHeaders()
            }
        });
        if (resp.status === 401) {
            window.location.href = '/';
            return null;
        }
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.json();
    },

    async _call(url) {
        try {
            const resp = await fetch(url, {
                headers: {
                    'Content-Type': 'application/json',
                    ...AuthModule.getAuthHeaders()
                }
            });
            if (resp.status === 401) {
                const returnTo = window.location.pathname + window.location.search + window.location.hash;
                window.location.href = '/login?redirect=' + encodeURIComponent(returnTo);
                return null;
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            return resp.json();
        } catch (error) {
            console.error('API call failed:', error);
            return null;
        }
    }
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */

const TasksUI = {

    get TAG_LABELS() {
        return {
            video: i18n.t('lt.tagVideo'), doc: i18n.t('lt.tagDoc'), cert: i18n.t('lt.tagCert'),
            practice: i18n.t('lt.tagPractice'), website: i18n.t('lt.tagWebsite')
        };
    },

    /**
     * 補齊缺失的 URL 協議。
     * 對舊資料（如 "www.ulearning.asia"）防守性處理，避免被當作相對路徑。
     */
    _normalizeUrl(raw) {
        if (!raw) return raw;
        const s = String(raw).trim();
        if (!s) return s;
        const low = s.toLowerCase();
        if (low.startsWith('http://') || low.startsWith('https://') ||
            low.startsWith('mailto:') || low.startsWith('tel:') || low.startsWith('ftp://')) {
            return s;
        }
        if (s.startsWith('//')) return 'https:' + s;
        if (s.startsWith('/')) return s;  // 站內路徑（例如 /uploads/...）
        return 'https://' + s;
    },

    /** 依 tag 回傳對應的 SVG 圖示路徑（feather-icons 風格） */
    _tagIconPath(tag) {
        const paths = {
            // 影片 — play 圖示
            video: '<polygon points="5 3 19 12 5 21 5 3"></polygon>',
            // 文檔 — file-text
            doc: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>',
            // 認證 — award
            cert: '<circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/>',
            // 練習 — edit
            practice: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
            // 網站 — globe
            website: '<circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
        };
        // 預設：external-link
        return paths[tag] || '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';
    },

    /** 依 tag 回傳動詞按鈕文字（不含 link_url 時不顯示按鈕） */
    _actionLabel(tag, customLabel) {
        if (customLabel) return customLabel;
        const map = {
            video: i18n.t('lt.actionVideo'),
            doc: i18n.t('lt.actionDoc'),
            cert: i18n.t('lt.actionCert'),
            practice: i18n.t('lt.actionPractice'),
            website: i18n.t('lt.actionWebsite'),
        };
        return map[tag] || i18n.t('lt.actionDefault');
    },

    renderTasks(tasks, currentStatus) {
        const taskList = document.getElementById('taskList');

        if (!tasks || tasks.length === 0) {
            const emptyText = currentStatus === 'completed' ? i18n.t('lt.emptyCompleted') :
                              currentStatus === 'pending' ? i18n.t('lt.emptyPending') : i18n.t('lt.emptyAll');
            taskList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📋</div>
                    <div class="empty-state-title">${emptyText}</div>
                </div>`;
            return;
        }

        taskList.innerHTML = tasks.map(task => `
            <div class="task-card" data-task-id="${task.id}">
                <div class="task-header">
                    <div class="task-priority-dot ${task.priority || 'normal'}"></div>
                    <div class="task-title-section">
                        <div class="task-title">${Utils.escapeHtml(task.title)}</div>
                        <div class="task-meta">
                            <span class="task-category">${Utils.escapeHtml(task.category)}</span>
                            ${task.deadline ? `
                                <span class="task-deadline ${this._isOverdue(task.deadline) ? 'overdue' : ''}">
                                    📅 ${this._formatDate(task.deadline)}
                                </span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="task-progress-section">
                    <div class="task-progress-text">
                        ${task.completed_items}/${task.total_items} ${i18n.t('lt.completed')}
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar-fill" style="width: ${task.total_items > 0 ? (task.completed_items / task.total_items * 100) : 0}%"></div>
                    </div>
                </div>
                <div class="task-detail" data-task-id="${task.id}">
                    <div class="task-description">${Utils.escapeHtml(task.description)}</div>
                    <div class="task-items" id="items-${task.id}">
                        <div class="loading" style="padding: 20px;">
                            <div class="spinner"></div>
                        </div>
                    </div>
                    <div class="completion-badge" id="badge-${task.id}">
                        <span class="completion-checkmark">✓</span>
                        <span>${i18n.t('lt.allDone')}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    renderTaskDetail(taskId, detail) {
        const container = document.getElementById(`items-${taskId}`);
        if (!container) return;

        container.innerHTML = detail.items.map(item => {
            const actionText = this._actionLabel(item.tag, item.link_label);
            const tagClass = item.tag || 'default';
            const safeUrl = this._normalizeUrl(item.link_url);
            return `
            <div class="task-item ${item.is_completed ? 'completed' : ''}" data-item-id="${item.id}">
                <div class="task-item-checkbox" data-task-id="${taskId}" data-item-id="${item.id}">
                    <input type="checkbox" class="checkbox-input" ${item.is_completed ? 'checked' : ''} />
                    <div class="checkbox-visual">
                        <span class="checkmark"></span>
                    </div>
                </div>
                <div class="task-item-content">
                    <div class="task-item-title">${Utils.escapeHtml(item.title)}</div>
                    ${item.description ? `<div class="task-item-description">${Utils.escapeHtml(item.description)}</div>` : ''}
                    ${safeUrl ? `
                        <a href="${Utils.escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer"
                           class="task-item-action ${tagClass}">
                            <svg class="task-item-action__icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                ${this._tagIconPath(item.tag)}
                            </svg>
                            <span class="task-item-action__text">${Utils.escapeHtml(actionText)}</span>
                            <svg class="task-item-action__arrow" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                <path d="M7 17L17 7M17 7H8M17 7V16"/>
                            </svg>
                        </a>` : (item.tag ? `<span class="task-item-tag ${item.tag}">${this.TAG_LABELS[item.tag] || item.tag}</span>` : '')}
                </div>
            </div>
        `;}).join('');

        this.updateCompletionBadge(taskId, detail);
    },

    updateCompletionBadge(taskId, detail) {
        const badge = document.getElementById(`badge-${taskId}`);
        if (!badge) return;

        const isAllDone = detail.completed_items === detail.total_items && detail.total_items > 0;
        badge.classList.toggle('show', isAllDone);
    },

    updateTaskCounts(tasks) {
        const allCount = tasks.length;
        const pendingCount = tasks.filter(t => !t.is_all_done).length;
        const completedCount = tasks.filter(t => t.is_all_done).length;

        document.getElementById('count-all').textContent = allCount;
        document.getElementById('count-pending').textContent = pendingCount;
        document.getElementById('count-completed').textContent = completedCount;
    },

    updateProgressRing(progress) {
        const { completion_rate } = progress;
        const circumference = 2 * Math.PI * 24;
        const offset = circumference * (1 - completion_rate / 100);

        const ring = document.getElementById('progressRing');
        ring.style.strokeDasharray = circumference;
        ring.style.strokeDashoffset = offset;

        document.getElementById('progressText').textContent = `${Math.round(completion_rate)}%`;
    },

    updateCardProgress(taskId, completedItems, totalItems) {
        const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (!card) return;

        const percent = totalItems > 0 ? (completedItems / totalItems * 100) : 0;
        const progressBar = card.querySelector('.progress-bar-fill');
        const progressText = card.querySelector('.task-progress-text');

        if (progressBar) progressBar.style.width = percent + '%';
        if (progressText) progressText.textContent = `${completedItems}/${totalItems} ${i18n.t('lt.completed')}`;
    },

    playCelebration(element) {
        const rect = element.getBoundingClientRect();
        const container = document.createElement('div');
        container.className = 'celebration-container';
        container.style.left = (rect.left + rect.width / 2) + 'px';
        container.style.top = (rect.top + rect.height / 2) + 'px';
        document.body.appendChild(container);

        const colors = ['var(--priority-normal)', 'var(--priority-important)', 'var(--brand-color)', 'var(--priority-urgent)'];

        for (let i = 0; i < 8; i++) {
            const dot = document.createElement('div');
            dot.className = 'celebration-dot';
            const angle = (i / 8) * Math.PI * 2;
            const tx = Math.cos(angle) * 40;
            dot.style.setProperty('--tx', tx + 'px');
            dot.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            dot.style.left = '0px';
            dot.style.top = '0px';
            container.appendChild(dot);
        }

        setTimeout(() => container.remove(), 1500);
    },

    showError(message) {
        const taskList = document.getElementById('taskList');
        taskList.innerHTML = `<div class="error-message">${Utils.escapeHtml(message)}</div>`;
    },

    _isOverdue(deadline) {
        return new Date(deadline) < new Date();
    },

    _formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString(i18n.isEn ? 'en-US' : 'zh-HK', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const TasksApp = {

    state: {
        tasks: [],
        currentStatus: '',
        progress: { total_tasks: 0, completed_tasks: 0, completion_rate: 0 },
        expandedTaskId: null
    },

    async init() {
        i18n.applyDOM();
        this._bindEvents();
        await this._loadTasks();
        await this._loadProgress();

        // 深連結：/learning-tasks/{id} 或 ?task_id={id} → 自動展開
        const deepLinkId = this._readDeepLinkTaskId();
        if (deepLinkId) {
            await this._expandTaskById(deepLinkId);
        }
    },

    _readDeepLinkTaskId() {
        // 從 URL 路徑讀：/learning-tasks/123
        const m = window.location.pathname.match(/\/learning-tasks\/(\d+)/);
        if (m) return parseInt(m[1], 10);
        // 退路：?task_id=123
        const q = new URLSearchParams(window.location.search).get('task_id');
        return q ? parseInt(q, 10) : null;
    },

    async _expandTaskById(taskId) {
        const card = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
        if (card) {
            this._handleTaskCardClick(card);
            // 滾動到可視區
            setTimeout(() => card.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
            return;
        }
        // 不在當前過濾結果裡 → 切到「全部」再試一次
        if (this.state.currentStatus !== '') {
            const allTab = document.querySelector('.tab[data-status=""]');
            if (allTab) {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                allTab.classList.add('active');
                this.state.currentStatus = '';
                await this._loadTasks('');
                const retry = document.querySelector(`.task-card[data-task-id="${taskId}"]`);
                if (retry) {
                    this._handleTaskCardClick(retry);
                    setTimeout(() => retry.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
                }
            }
        }
    },

    _bindEvents() {
        // Back button
        document.querySelector('.back-button').addEventListener('click', () => {
            window.location.href = '/';
        });

        // Tab selection
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', async () => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                this.state.currentStatus = tab.dataset.status;
                this.state.expandedTaskId = null;
                await this._loadTasks(this.state.currentStatus);
            });
        });

        // Task card clicks (delegation)
        document.getElementById('taskList').addEventListener('click', (e) => {
            // Handle checkbox clicks
            const checkboxEl = e.target.closest('.task-item-checkbox');
            if (checkboxEl) {
                e.stopPropagation();
                const taskId = parseInt(checkboxEl.dataset.taskId);
                const itemId = parseInt(checkboxEl.dataset.itemId);
                this._handleCheckboxClick(e, taskId, itemId);
                return;
            }

            // Handle card expand/collapse
            const card = e.target.closest('.task-card');
            if (card && !e.target.closest('a')) {
                this._handleTaskCardClick(card);
            }
        });
    },

    async _loadTasks(status = '') {
        const result = await TasksAPI.fetchTasks(status);
        if (!result) {
            TasksUI.showError(i18n.t('lt.errorApi'));
            return;
        }
        if (result.success) {
            this.state.tasks = result.data || [];
            TasksUI.updateTaskCounts(this.state.tasks);
            TasksUI.renderTasks(this.state.tasks, this.state.currentStatus);
        } else {
            TasksUI.showError(i18n.t('lt.errorLoad'));
        }
    },

    async _loadProgress() {
        const result = await TasksAPI.fetchProgress();
        if (result && result.success) {
            this.state.progress = result.data;
            TasksUI.updateProgressRing(this.state.progress);
        }
    },

    async _handleTaskCardClick(card) {
        const taskId = parseInt(card.dataset.taskId);
        const isExpanded = card.classList.contains('expanded');

        // Close other expanded cards
        document.querySelectorAll('.task-card.expanded').forEach(c => {
            if (c !== card) c.classList.remove('expanded');
        });

        if (!isExpanded) {
            card.classList.add('expanded');
            this.state.expandedTaskId = taskId;

            const result = await TasksAPI.fetchTaskDetail(taskId);
            if (result && result.success) {
                TasksUI.renderTaskDetail(taskId, result.data);
            }
        } else {
            card.classList.remove('expanded');
            this.state.expandedTaskId = null;
        }
    },

    async _handleCheckboxClick(event, taskId, itemId) {
        const checkboxEl = event.target.closest('.task-item-checkbox');
        const checkbox = checkboxEl.querySelector('.checkbox-input');
        const itemElement = checkboxEl.closest('.task-item');

        // Optimistic UI update
        checkbox.checked = !checkbox.checked;
        itemElement.classList.toggle('completed');

        const result = await TasksAPI.toggleTaskItem(taskId, itemId);
        if (!result || !result.success) {
            // Revert on failure
            checkbox.checked = !checkbox.checked;
            itemElement.classList.toggle('completed');
            UIModule.toast(i18n.t('lt.errorUpdate'), 'error');
            return;
        }

        // Update task progress
        const task = this.state.tasks.find(t => t.id === taskId);
        if (task) {
            task.completed_items += checkbox.checked ? 1 : -1;
            TasksUI.updateCardProgress(taskId, task.completed_items, task.total_items);

            // Get detail and update badge
            const detailResult = await TasksAPI.fetchTaskDetail(taskId);
            if (detailResult && detailResult.success) {
                TasksUI.updateCompletionBadge(taskId, detailResult.data);
            }

            // Update progress ring
            await this._loadProgress();
        }

        // Celebration animation
        if (checkbox.checked) {
            TasksUI.playCelebration(checkboxEl);
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    TasksApp.init();
});
