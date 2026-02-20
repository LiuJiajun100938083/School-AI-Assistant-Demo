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
                window.location.href = '/';
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

    TAG_LABELS: {
        video: '視頻', doc: '文檔', cert: '認證',
        practice: '練習', website: '網站'
    },

    renderTasks(tasks, currentStatus) {
        const taskList = document.getElementById('taskList');

        if (!tasks || tasks.length === 0) {
            const emptyText = currentStatus === 'completed' ? '尚無已完成任務' :
                              currentStatus === 'pending' ? '尚無待完成任務' : '尚無任務';
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
                        ${task.completed_items}/${task.total_items} 已完成
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
                        <span>全部完成</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    renderTaskDetail(taskId, detail) {
        const container = document.getElementById(`items-${taskId}`);
        if (!container) return;

        container.innerHTML = detail.items.map(item => `
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
                </div>
                <div class="task-item-actions">
                    ${item.tag ? `<span class="task-item-tag ${item.tag}">${this.TAG_LABELS[item.tag] || item.tag}</span>` : ''}
                    ${item.link_url ? `
                        <a href="${Utils.escapeHtml(item.link_url)}" target="_blank" rel="noopener noreferrer"
                           class="task-item-link" title="${Utils.escapeHtml(item.link_label || '打開連結')}">↗</a>` : ''}
                </div>
            </div>
        `).join('');

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
        if (progressText) progressText.textContent = `${completedItems}/${totalItems} 已完成`;
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
        return date.toLocaleDateString('zh-HK', {
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
        this._bindEvents();
        await this._loadTasks();
        await this._loadProgress();
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
            TasksUI.showError('API 請求失敗，請重試');
            return;
        }
        if (result.success) {
            this.state.tasks = result.data || [];
            TasksUI.updateTaskCounts(this.state.tasks);
            TasksUI.renderTasks(this.state.tasks, this.state.currentStatus);
        } else {
            TasksUI.showError('加載任務失敗');
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
            UIModule.toast('更新失敗，請重試', 'error');
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
