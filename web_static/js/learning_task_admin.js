/**
 * 學習任務管理（管理後台）— 前端核心模組
 * ==========================================
 *
 * 架構：
 *   TaskAdminAPI  — API 請求封裝
 *   TaskAdminUI   — DOM 渲染
 *   TaskAdminApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, UIModule, Utils
 * 加載順序: shared/* → learning_task_admin.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const TaskAdminAPI = {
    BASE: '/api/admin/learning-tasks',

    async _call(url, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...AuthModule.getAuthHeaders()
        };
        const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
        if (response.status === 401) {
            window.location.href = '/';
            return null;
        }
        return response;
    },

    async listTasks(status = '', page = 1, pageSize = 20) {
        return this._call(`${this.BASE}?status=${status}&page=${page}&page_size=${pageSize}`);
    },

    async getTask(taskId) {
        return this._call(`${this.BASE}/${taskId}`);
    },

    async createTask(data) {
        return this._call(this.BASE, { method: 'POST', body: JSON.stringify(data) });
    },

    async updateTask(taskId, data) {
        return this._call(`${this.BASE}/${taskId}`, { method: 'PUT', body: JSON.stringify(data) });
    },

    async deleteTask(taskId) {
        return this._call(`${this.BASE}/${taskId}`, { method: 'DELETE' });
    },

    async publishTask(taskId, target) {
        return this._call(`${this.BASE}/${taskId}/publish`, {
            method: 'POST',
            body: JSON.stringify(target)
        });
    },

    async getTaskStats(taskId) {
        return this._call(`${this.BASE}/${taskId}/stats`);
    },

    async getTargets() {
        return this._call(`${this.BASE}/targets`);
    },

    async uploadFile(file) {
        // 注意：multipart/form-data 不能設 Content-Type，讓瀏覽器自動加 boundary
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`${this.BASE}/upload`, {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders() },
            body: formData
        });
        if (response.status === 401) { window.location.href = '/'; return null; }
        return response;
    }
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */

const TaskAdminUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            statDraft: document.getElementById('stat-draft'),
            statPublished: document.getElementById('stat-published'),
            taskForm: document.getElementById('taskForm'),
            taskTitle: document.getElementById('taskTitle'),
            taskDescription: document.getElementById('taskDescription'),
            taskCategory: document.getElementById('taskCategory'),
            taskPriority: document.getElementById('taskPriority'),
            taskDeadline: document.getElementById('taskDeadline'),
            subItemsContainer: document.getElementById('subItemsContainer'),
            submitBtn: document.getElementById('submitBtn'),
            statusFilter: document.getElementById('statusFilter'),
            taskListContainer: document.getElementById('taskListContainer'),
            listPagination: document.getElementById('listPagination'),
            publishTaskSelect: document.getElementById('publishTaskSelect'),
            publishTaskPreview: document.getElementById('publishTaskPreview'),
            previewTitle: document.getElementById('previewTitle'),
            previewDescription: document.getElementById('previewDescription'),
            previewItemCount: document.getElementById('previewItemCount'),
            publishPreview: document.getElementById('publishPreview'),
            teacherSelect: document.getElementById('teacherSelect'),
            studentSelect: document.getElementById('studentSelect'),
            classSelect: document.getElementById('classSelect'),
            statsTaskSelect: document.getElementById('statsTaskSelect'),
            statsContainer: document.getElementById('statsContainer'),
            statsRecipients: document.getElementById('statsRecipients'),
            statsCompleted: document.getElementById('statsCompleted'),
            statsRate: document.getElementById('statsRate'),
            statsTableBody: document.getElementById('statsTableBody'),
            confirmModal: document.getElementById('confirmModal'),
            confirmMessage: document.getElementById('confirmMessage')
        };
    },

    updateHeaderStats(draftCount, publishedCount) {
        this.elements.statDraft.textContent = draftCount;
        this.elements.statPublished.textContent = publishedCount;
    },

    renderSubItems(subItems) {
        this.elements.subItemsContainer.innerHTML = subItems.map((item, index) => `
            <div class="sub-item">
                <div class="sub-item-content">
                    <div>
                        <label style="display:block;margin-bottom:4px;font-size:13px;">${i18n.t('lta.subTitle')}</label>
                        <input type="text" value="${Utils.escapeHtml(item.title)}" data-sub-id="${item.id}" data-field="title">
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-size:13px;">${i18n.t('lta.subTag')}</label>
                        <select data-sub-id="${item.id}" data-field="tag">
                            <option value="video" ${item.tag === 'video' ? 'selected' : ''}>${i18n.t('lta.tagVideo')}</option>
                            <option value="doc" ${item.tag === 'doc' ? 'selected' : ''}>${i18n.t('lta.tagDoc')}</option>
                            <option value="cert" ${item.tag === 'cert' ? 'selected' : ''}>${i18n.t('lta.tagCert')}</option>
                            <option value="practice" ${item.tag === 'practice' ? 'selected' : ''}>${i18n.t('lta.tagPractice')}</option>
                            <option value="website" ${item.tag === 'website' ? 'selected' : ''}>${i18n.t('lta.tagWebsite')}</option>
                        </select>
                    </div>
                    <div class="sub-item-full">
                        <label style="display:block;margin-bottom:4px;font-size:13px;">${i18n.t('lta.subDescription')}</label>
                        <textarea data-sub-id="${item.id}" data-field="description" style="min-height:60px;">${Utils.escapeHtml(item.description)}</textarea>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-size:13px;">${i18n.t('lta.subLinkUrl')}</label>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input type="text" placeholder="https://..." value="${Utils.escapeHtml(item.link_url)}" data-sub-id="${item.id}" data-field="link_url" style="flex:1;">
                            <button type="button" class="btn-secondary btn-small" data-action="upload" data-sub-id="${item.id}" style="white-space:nowrap;">${i18n.t('lta.subUploadBtn')}</button>
                            <input type="file" data-upload-for="${item.id}" style="display:none;">
                        </div>
                        <div class="upload-status" data-upload-status="${item.id}" style="font-size:12px;color:#666;margin-top:4px;"></div>
                    </div>
                    <div>
                        <label style="display:block;margin-bottom:4px;font-size:13px;">${i18n.t('lta.subLinkLabel')}</label>
                        <input type="text" value="${Utils.escapeHtml(item.link_label)}" data-sub-id="${item.id}" data-field="link_label">
                    </div>
                </div>
                <div class="sub-item-actions">
                    <button type="button" class="btn-secondary btn-small" data-action="move-up" data-sub-id="${item.id}" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button type="button" class="btn-secondary btn-small" data-action="move-down" data-sub-id="${item.id}" ${index === subItems.length - 1 ? 'disabled' : ''}>↓</button>
                    <button type="button" class="btn-danger btn-small" data-action="remove" data-sub-id="${item.id}">✕</button>
                </div>
            </div>
        `).join('');
    },

    renderTaskList(tasks) {
        const container = this.elements.taskListContainer;
        if (tasks.length === 0) {
            container.innerHTML = `<div style="text-align:center;padding:40px;color:#666666;">${i18n.t('lta.emptyList')}</div>`;
            return;
        }

        container.innerHTML = tasks.map(task => {
            const statusClass = task.status === 'draft' ? 'draft' : task.status === 'published' ? 'published' : 'archived';
            const statusText = task.status === 'draft' ? i18n.t('lta.statusDraft') : task.status === 'published' ? i18n.t('lta.statusPublished') : i18n.t('lta.statusArchived');
            const completed = task.completed_count || 0;
            const total = task.total_recipients || 0;
            const targetLabel = this._formatTargetType(task.target_type, task.target_value);

            return `
                <div class="card">
                    <div class="card-title">
                        <span class="badge badge-${statusClass}">${statusText}</span>
                        ${Utils.escapeHtml(task.title)}
                    </div>
                    <div style="font-size:13px;color:#666666;margin-bottom:12px;">
                        ${i18n.t('lta.listCategory')}: ${task.category} | ${i18n.t('lta.listPriority')}: ${task.priority} | ${i18n.t('lta.listCreatedAt')}: ${new Date(task.created_at).toLocaleDateString(i18n.isEn ? 'en-US' : 'zh-HK')}
                        ${targetLabel ? `| ${i18n.t('lta.listTarget')}: ${targetLabel}` : ''}
                        ${total > 0 ? `| ${i18n.t('lta.listRecipients')}: ${completed}/${total}` : ''}
                    </div>
                    <div class="card-actions">
                        ${task.status === 'draft' ? `<button class="btn-secondary btn-small" data-action="edit" data-task-id="${task.id}">${i18n.t('lta.btnEdit')}</button>` : ''}
                        <button class="btn-secondary btn-small" data-action="publish" data-task-id="${task.id}">${i18n.t('lta.btnPublish')}</button>
                        <button class="btn-secondary btn-small" data-action="stats" data-task-id="${task.id}">${i18n.t('lta.btnStats')}</button>
                        ${task.status === 'published' ? `<button class="btn-secondary btn-small" data-action="copy-link" data-task-id="${task.id}">${i18n.t('lta.btnCopyLink')}</button>` : ''}
                        <button class="btn-danger btn-small" data-action="archive" data-task-id="${task.id}">${i18n.t('lta.btnArchive')}</button>
                    </div>
                </div>
            `;
        }).join('');
    },

    renderPagination(currentPage, totalPages) {
        const container = this.elements.listPagination;
        if (totalPages <= 1) { container.innerHTML = ''; return; }
        let html = '';
        for (let i = 1; i <= totalPages; i++) {
            html += `<button ${i === currentPage ? 'class="active"' : ''} data-page="${i}">${i}</button>`;
        }
        container.innerHTML = html;
    },

    renderStatsTable(users, sortBy) {
        const tbody = this.elements.statsTableBody;
        if (!users || users.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#666;">${i18n.t('lta.emptyStats')}</td></tr>`;
            return;
        }

        users.sort((a, b) => {
            if (sortBy === 'rate') return (b.rate || 0) - (a.rate || 0);
            return (b.completed_items || 0) - (a.completed_items || 0);
        });

        tbody.innerHTML = users.map(user => {
            const rate = Math.round(user.rate || 0);
            let rowColor = '#1D1D1F';
            if (rate === 100) rowColor = '#00663B';
            else if (rate > 0) rowColor = '#CC8800';
            else rowColor = '#B00010';

            return `<tr>
                <td>${Utils.escapeHtml(user.username)}</td>
                <td>${Utils.escapeHtml(user.display_name || user.username)}</td>
                <td>${user.role || '-'}</td>
                <td>${user.class_name || '-'}</td>
                <td>${user.completed_items || 0}/${user.total_items || 0}</td>
                <td style="color:${rowColor};font-weight:600;">${rate}%</td>
            </tr>`;
        }).join('');
    },

    populateSelect(selectId, items) {
        const select = document.getElementById(selectId);
        if (!select || !items) return;
        select.innerHTML = items.map(item =>
            `<option value="${Utils.escapeHtml(item.value)}">${Utils.escapeHtml(item.label)}</option>`
        ).join('');
    },

    _formatTargetType(type, value) {
        const labels = {
            'all': i18n.t('lta.targetLabelAll'),
            'all_teachers': i18n.t('lta.targetLabelAllTeachers'),
            'all_students': i18n.t('lta.targetLabelAllStudents'),
            'teacher': i18n.t('lta.targetLabelTeacher', { value: value || '' }),
            'student': i18n.t('lta.targetLabelStudent', { value: value || '' }),
            'class': i18n.t('lta.targetLabelClass', { value: value || '' })
        };
        return labels[type] || '';
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const TaskAdminApp = {
    state: {
        currentTab: 'create',
        editingTaskId: null,
        subItems: [],
        tasks: [],
        currentPage: 1,
        totalPages: 1,
        targets: { classes: [], teachers: [], students: [] },
        confirmAction: null,
        statsData: null,
        statsSortBy: 'rate'
    },

    init() {
        TaskAdminUI.cacheElements();
        i18n.applyDOM();
        this._bindEvents();
        this._updateStats();
        TaskAdminUI.renderSubItems(this.state.subItems);
    },

    _bindEvents() {
        const el = TaskAdminUI.elements;

        // Back link
        document.querySelector('.back-link')?.addEventListener('click', () => {
            window.location.href = '/';
        });

        // Tab switching
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.dataset.tab;
                if (tabName) this._switchTab(tabName);
            });
        });

        // Task form
        el.taskForm.addEventListener('submit', (e) => this._handleSaveTask(e));

        // Add sub-item
        document.querySelector('.add-item-btn')?.addEventListener('click', () => this._addSubItem());

        // Sub-items container — event delegation
        el.subItemsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const id = parseInt(btn.dataset.subId);
            switch (btn.dataset.action) {
                case 'move-up': this._moveSubItem(id, 'up'); break;
                case 'move-down': this._moveSubItem(id, 'down'); break;
                case 'remove': this._removeSubItem(id); break;
                case 'upload': {
                    // 觸發對應的隱藏 file input
                    const fileInput = el.subItemsContainer.querySelector(`input[type="file"][data-upload-for="${id}"]`);
                    if (fileInput) fileInput.click();
                    break;
                }
            }
        });
        el.subItemsContainer.addEventListener('change', (e) => {
            // 檔案選擇 → 上傳
            if (e.target.type === 'file' && e.target.dataset.uploadFor) {
                const id = parseInt(e.target.dataset.uploadFor);
                const file = e.target.files[0];
                if (file) this._handleFileUpload(id, file);
                e.target.value = '';  // 重設以便同檔名再選
                return;
            }
            if (e.target.dataset.subId && e.target.dataset.field) {
                this._updateSubItem(parseInt(e.target.dataset.subId), e.target.dataset.field, e.target.value);
            }
        });

        // URL 輸入框離開焦點時自動補 https:// — 避免存成相對路徑
        el.subItemsContainer.addEventListener('blur', (e) => {
            if (e.target.dataset.field === 'link_url' && e.target.dataset.subId) {
                const normalized = this._normalizeUrl(e.target.value);
                if (normalized !== e.target.value) {
                    e.target.value = normalized;
                    this._updateSubItem(parseInt(e.target.dataset.subId), 'link_url', normalized);
                }
            }
        }, true);  // capture：blur 不 bubble

        // List tab
        el.statusFilter.addEventListener('change', () => this._loadTaskList());

        // Task list — event delegation
        el.taskListContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const taskId = btn.dataset.taskId;
            switch (btn.dataset.action) {
                case 'edit': this._editTask(taskId); break;
                case 'publish': this._switchToPublish(taskId); break;
                case 'stats': this._switchToStats(taskId); break;
                case 'archive': this._archiveTask(taskId); break;
                case 'copy-link': this._copyShareLink(taskId); break;
            }
        });

        // Pagination
        el.listPagination.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn) this._loadTaskList(parseInt(btn.dataset.page));
        });

        // Publish tab
        el.publishTaskSelect.addEventListener('change', () => this._handlePublishTaskSelect());
        document.querySelectorAll('input[name="targetType"]').forEach(radio => {
            radio.addEventListener('change', () => this._handleTargetTypeChange());
        });
        el.teacherSelect.addEventListener('change', () => this._updatePublishPreview());
        el.studentSelect.addEventListener('change', () => this._updatePublishPreview());
        el.classSelect.addEventListener('change', () => this._updatePublishPreview());
        document.querySelector('[data-action="confirm-publish"]')?.addEventListener('click', () => this._confirmPublish());

        // Stats tab
        el.statsTaskSelect.addEventListener('change', () => this._loadTaskStats());
        document.querySelectorAll('[data-sort]').forEach(th => {
            th.addEventListener('click', () => {
                this.state.statsSortBy = th.dataset.sort;
                if (this.state.statsData) {
                    TaskAdminUI.renderStatsTable(this.state.statsData.user_details || [], this.state.statsSortBy);
                }
            });
        });

        // Modal
        document.querySelector('[data-action="close-modal"]')?.addEventListener('click', () => this._closeConfirmModal());
        document.querySelector('[data-action="execute-confirm"]')?.addEventListener('click', () => this._executeConfirmAction());
    },

    _switchTab(tabName) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
        document.getElementById(tabName)?.classList.add('active');
        document.querySelector(`.tab-button[data-tab="${tabName}"]`)?.classList.add('active');
        this.state.currentTab = tabName;

        if (tabName === 'list') this._loadTaskList();
        else if (tabName === 'publish') { this._loadPublishTasks(); this._loadTargets(); }
        else if (tabName === 'stats') this._loadStatsTasks();
    },

    /* ---------- Sub-items ---------- */

    _addSubItem() {
        const id = Date.now();
        this.state.subItems.push({ id, title: '', description: '', link_url: '', link_label: '', tag: 'video' });
        TaskAdminUI.renderSubItems(this.state.subItems);
    },

    _removeSubItem(id) {
        this.state.subItems = this.state.subItems.filter(i => i.id !== id);
        TaskAdminUI.renderSubItems(this.state.subItems);
    },

    _moveSubItem(id, direction) {
        const index = this.state.subItems.findIndex(i => i.id === id);
        if ((direction === 'up' && index > 0) || (direction === 'down' && index < this.state.subItems.length - 1)) {
            const newIndex = direction === 'up' ? index - 1 : index + 1;
            [this.state.subItems[index], this.state.subItems[newIndex]] = [this.state.subItems[newIndex], this.state.subItems[index]];
            TaskAdminUI.renderSubItems(this.state.subItems);
        }
    },

    _updateSubItem(id, field, value) {
        const item = this.state.subItems.find(i => i.id === id);
        if (item) item[field] = value;
    },

    /** 補齊 URL 協議：'www.xx.com' → 'https://www.xx.com'；站內路徑與 mailto 等不動 */
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
        if (s.startsWith('/')) return s;
        return 'https://' + s;
    },

    async _handleFileUpload(id, file) {
        const statusEl = document.querySelector(`[data-upload-status="${id}"]`);
        const urlInput = document.querySelector(`input[data-sub-id="${id}"][data-field="link_url"]`);
        const labelInput = document.querySelector(`input[data-sub-id="${id}"][data-field="link_label"]`);

        if (statusEl) {
            statusEl.style.color = '#666';
            statusEl.textContent = i18n.t('lta.subUploading');
        }

        try {
            const resp = await TaskAdminAPI.uploadFile(file);
            if (!resp || !resp.ok) {
                const errData = resp ? await resp.json().catch(() => ({})) : {};
                const msg = errData?.error?.message || errData?.detail || i18n.t('lta.subUploadFailed');
                throw new Error(msg);
            }
            const result = await resp.json();
            const data = result.data || {};
            const url = data.url;
            if (!url) throw new Error(i18n.t('lta.subUploadFailed'));

            // 自動填入 link_url，同步狀態
            if (urlInput) {
                urlInput.value = url;
                this._updateSubItem(id, 'link_url', url);
            }
            // 如果 link_label 還沒填，預設成原始檔名
            const item = this.state.subItems.find(i => i.id === id);
            if (labelInput && item && !item.link_label) {
                labelInput.value = data.original_name || '';
                this._updateSubItem(id, 'link_label', data.original_name || '');
            }

            if (statusEl) {
                statusEl.style.color = '#006633';
                statusEl.textContent = i18n.t('lta.subUploadSuccess') + (data.original_name || '');
            }
        } catch (err) {
            console.error('[learning_task_admin] upload failed:', err);
            if (statusEl) {
                statusEl.style.color = '#c53030';
                statusEl.textContent = err.message || i18n.t('lta.subUploadFailed');
            }
            UIModule?.toast?.(err.message || i18n.t('lta.subUploadFailed'), 'error');
        }
    },

    /* ---------- Task Form ---------- */

    async _handleSaveTask(event) {
        event.preventDefault();
        const el = TaskAdminUI.elements;

        if (!el.taskTitle.value.trim()) {
            UIModule.toast(i18n.t('lta.toastTitleRequired'), 'error');
            return;
        }

        const taskData = {
            title: el.taskTitle.value,
            description: el.taskDescription.value,
            content: '',
            category: el.taskCategory.value,
            priority: parseInt(el.taskPriority.value),
            deadline: el.taskDeadline.value || null,
            items: this.state.subItems.map(item => ({
                title: item.title, description: item.description,
                link_url: item.link_url, link_label: item.link_label, tag: item.tag
            }))
        };

        el.submitBtn.disabled = true;
        el.submitBtn.innerHTML = '<span class="spinner"></span>';

        try {
            const response = this.state.editingTaskId
                ? await TaskAdminAPI.updateTask(this.state.editingTaskId, taskData)
                : await TaskAdminAPI.createTask(taskData);

            if (!response || !response.ok) {
                const error = await response?.json();
                UIModule.toast(error?.detail || i18n.t('lta.toastSaveFailed'), 'error');
                return;
            }

            UIModule.toast(this.state.editingTaskId ? i18n.t('lta.toastTaskUpdated') : i18n.t('lta.toastTaskSaved'), 'success');
            this._resetTaskForm();
            this._loadTaskList();
            this._updateStats();
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastSaveFailed') + ': ' + error.message, 'error');
        } finally {
            el.submitBtn.disabled = false;
            el.submitBtn.textContent = this.state.editingTaskId ? i18n.t('lta.update') : i18n.t('lta.saveDraft');
        }
    },

    _resetTaskForm() {
        TaskAdminUI.elements.taskForm.reset();
        this.state.editingTaskId = null;
        this.state.subItems = [];
        TaskAdminUI.renderSubItems(this.state.subItems);
        TaskAdminUI.elements.submitBtn.textContent = i18n.t('lta.saveDraft');
    },

    /* ---------- Task List ---------- */

    async _loadTaskList(page = 1) {
        const status = TaskAdminUI.elements.statusFilter.value;
        try {
            const response = await TaskAdminAPI.listTasks(status, page);
            if (!response || !response.ok) return;

            const data = await response.json();
            this.state.tasks = data.data || [];
            this.state.currentPage = data.pagination.page;
            this.state.totalPages = data.pagination.total_pages;

            TaskAdminUI.renderTaskList(this.state.tasks);
            TaskAdminUI.renderPagination(this.state.currentPage, this.state.totalPages);
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadListFailed') + ': ' + error.message, 'error');
        }
    },

    async _editTask(taskId) {
        try {
            const response = await TaskAdminAPI.getTask(taskId);
            if (!response || !response.ok) return;

            const result = await response.json();
            const task = result.data || result;
            const el = TaskAdminUI.elements;

            el.taskTitle.value = task.title;
            el.taskDescription.value = task.description || '';
            el.taskCategory.value = task.category || 'general';
            el.taskPriority.value = task.priority || 1;
            el.taskDeadline.value = task.deadline ? task.deadline.slice(0, 16) : '';

            this.state.editingTaskId = task.id;
            this.state.subItems = (task.items || []).map((item, idx) => ({
                id: idx, title: item.title, description: item.description,
                link_url: item.link_url, link_label: item.link_label, tag: item.tag
            }));
            TaskAdminUI.renderSubItems(this.state.subItems);
            el.submitBtn.textContent = i18n.t('lta.update');
            this._switchTab('create');
            document.querySelector('.container').scrollIntoView({ behavior: 'smooth' });
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadTaskFailed') + ': ' + error.message, 'error');
        }
    },

    async _archiveTask(taskId) {
        this.state.confirmAction = async () => {
            try {
                const response = await TaskAdminAPI.deleteTask(taskId);
                if (!response || !response.ok) { UIModule.toast(i18n.t('lta.toastArchiveFailed'), 'error'); return; }
                UIModule.toast(i18n.t('lta.toastArchived'), 'success');
                this._loadTaskList();
                this._updateStats();
            } catch (error) {
                UIModule.toast(i18n.t('lta.toastArchiveFailed') + ': ' + error.message, 'error');
            }
        };
        this._openConfirmModal(i18n.t('lta.toastArchiveConfirm'));
    },

    async _copyShareLink(taskId) {
        const url = `${window.location.origin}/learning-tasks/${taskId}`;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(url);
            } else {
                // 退路：不支援 Clipboard API 時用臨時 textarea
                const ta = document.createElement('textarea');
                ta.value = url;
                ta.style.position = 'fixed';
                ta.style.opacity = '0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
            }
            UIModule.toast(i18n.t('lta.toastLinkCopied') + ' ' + url, 'success');
        } catch (err) {
            console.error('[copy link]', err);
            // 最終退路：prompt 讓用戶手動複製
            window.prompt(i18n.t('lta.toastLinkFallback'), url);
        }
    },

    /* ---------- Publish Tab ---------- */

    async _switchToPublish(taskId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
        document.getElementById('publish').classList.add('active');
        document.querySelector('.tab-button[data-tab="publish"]')?.classList.add('active');
        this.state.currentTab = 'publish';
        await Promise.all([this._loadPublishTasks(), this._loadTargets()]);
        TaskAdminUI.elements.publishTaskSelect.value = String(taskId);
        this._handlePublishTaskSelect();
    },

    async _loadPublishTasks() {
        try {
            const response = await TaskAdminAPI.listTasks('', 1, 100);
            if (!response || !response.ok) return;
            const data = await response.json();
            const select = TaskAdminUI.elements.publishTaskSelect;
            select.innerHTML = `<option value="">${i18n.t('lta.selectTaskPlaceholder')}</option>`;
            data.data.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                opt.textContent = `${task.title} (${task.status})`;
                select.appendChild(opt);
            });
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadTaskFailed') + ': ' + error.message, 'error');
        }
    },

    async _loadTargets() {
        try {
            const response = await TaskAdminAPI.getTargets();
            if (!response || !response.ok) return;
            const result = await response.json();
            const targets = result.data || {};
            this.state.targets = targets;

            TaskAdminUI.populateSelect('teacherSelect', (targets.teachers || []).map(t =>
                ({ value: t.username, label: t.display_name || t.username })));
            TaskAdminUI.populateSelect('studentSelect', (targets.students || []).map(s =>
                ({ value: s.username, label: `${s.display_name || s.username} (${s.class_name || ''})` })));
            TaskAdminUI.populateSelect('classSelect', (targets.classes || []).map(c =>
                ({ value: c, label: c })));
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadTargetsFailed') + ': ' + error.message, 'error');
        }
    },

    async _handlePublishTaskSelect() {
        const taskId = TaskAdminUI.elements.publishTaskSelect.value;
        const preview = TaskAdminUI.elements.publishTaskPreview;
        if (!taskId) { preview.style.display = 'none'; return; }

        try {
            const response = await TaskAdminAPI.getTask(taskId);
            if (!response || !response.ok) return;
            const result = await response.json();
            const task = result.data || result;

            TaskAdminUI.elements.previewTitle.textContent = task.title;
            TaskAdminUI.elements.previewDescription.textContent = task.description || '';
            TaskAdminUI.elements.previewItemCount.textContent = i18n.t('lta.subItemCount', { count: (task.items || []).length });
            preview.style.display = 'block';
            this._updatePublishPreview();
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadDetailFailed') + ': ' + error.message, 'error');
        }
    },

    _handleTargetTypeChange() {
        const type = document.querySelector('input[name="targetType"]:checked')?.value;
        TaskAdminUI.elements.teacherSelect.style.display = type === 'teacher' ? 'inline-block' : 'none';
        TaskAdminUI.elements.studentSelect.style.display = type === 'student' ? 'inline-block' : 'none';
        TaskAdminUI.elements.classSelect.style.display = type === 'class' ? 'inline-block' : 'none';
        this._updatePublishPreview();
    },

    _updatePublishPreview() {
        const type = document.querySelector('input[name="targetType"]:checked')?.value;
        const el = TaskAdminUI.elements;
        let text = '';
        if (type === 'all') text = i18n.t('lta.previewAll');
        else if (type === 'all_teachers') text = i18n.t('lta.previewAllTeachers');
        else if (type === 'all_students') text = i18n.t('lta.previewAllStudents');
        else if (type === 'teacher') text = i18n.t('lta.previewTeacher', { name: el.teacherSelect.options[el.teacherSelect.selectedIndex]?.text || '' });
        else if (type === 'student') text = i18n.t('lta.previewStudent', { name: el.studentSelect.options[el.studentSelect.selectedIndex]?.text || '' });
        else if (type === 'class') text = i18n.t('lta.previewClass', { name: el.classSelect.options[el.classSelect.selectedIndex]?.text || '' });
        el.publishPreview.textContent = text;
    },

    async _confirmPublish() {
        const taskId = TaskAdminUI.elements.publishTaskSelect.value;
        const type = document.querySelector('input[name="targetType"]:checked')?.value;
        if (!taskId || !type) { UIModule.toast(i18n.t('lta.toastSelectTaskAndTarget'), 'error'); return; }

        let targetValue = null;
        if (type === 'teacher') targetValue = TaskAdminUI.elements.teacherSelect.value;
        else if (type === 'student') targetValue = TaskAdminUI.elements.studentSelect.value;
        else if (type === 'class') targetValue = TaskAdminUI.elements.classSelect.value;

        this.state.confirmAction = async () => {
            try {
                const response = await TaskAdminAPI.publishTask(taskId, { target_type: type, target_value: targetValue });
                if (!response || !response.ok) {
                    const errData = await response?.json().catch(() => null);
                    UIModule.toast(errData?.detail || i18n.t('lta.toastPublishFailed'), 'error');
                    return;
                }
                const pubResult = await response.json();
                UIModule.toast(i18n.t('lta.toastPublished', { count: pubResult?.data?.recipient_count || 0 }), 'success');
                TaskAdminUI.elements.publishTaskSelect.value = '';
                TaskAdminUI.elements.publishTaskPreview.style.display = 'none';
                this._loadPublishTasks();
                this._loadTaskList();
                this._updateStats();
            } catch (error) {
                UIModule.toast(i18n.t('lta.toastPublishFailed') + ': ' + error.message, 'error');
            }
        };
        this._openConfirmModal(`${i18n.t('lta.toastPublishConfirm')} ${TaskAdminUI.elements.publishPreview.textContent}`);
    },

    /* ---------- Stats Tab ---------- */

    async _switchToStats(taskId) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-button').forEach(el => el.classList.remove('active'));
        document.getElementById('stats').classList.add('active');
        document.querySelector('.tab-button[data-tab="stats"]')?.classList.add('active');
        this.state.currentTab = 'stats';
        await this._loadStatsTasks();
        TaskAdminUI.elements.statsTaskSelect.value = String(taskId);
        this._loadTaskStats();
    },

    async _loadStatsTasks() {
        try {
            const response = await TaskAdminAPI.listTasks('published', 1, 100);
            if (!response || !response.ok) return;
            const data = await response.json();
            const select = TaskAdminUI.elements.statsTaskSelect;
            select.innerHTML = `<option value="">${i18n.t('lta.selectTaskPlaceholder')}</option>`;
            data.data.forEach(task => {
                const opt = document.createElement('option');
                opt.value = task.id;
                opt.textContent = task.title;
                select.appendChild(opt);
            });
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadTaskFailed') + ': ' + error.message, 'error');
        }
    },

    async _loadTaskStats() {
        const taskId = TaskAdminUI.elements.statsTaskSelect.value;
        if (!taskId) { TaskAdminUI.elements.statsContainer.style.display = 'none'; return; }

        try {
            const response = await TaskAdminAPI.getTaskStats(taskId);
            if (!response || !response.ok) return;
            const result = await response.json();
            const stats = result.data || result;
            this.state.statsData = stats;

            const recipients = stats.total_recipients || 0;
            const completed = stats.completed_count || 0;
            const rate = stats.completion_rate || (recipients > 0 ? Math.round((completed / recipients) * 100) : 0);

            TaskAdminUI.elements.statsRecipients.textContent = recipients;
            TaskAdminUI.elements.statsCompleted.textContent = completed;
            TaskAdminUI.elements.statsRate.textContent = rate + '%';
            TaskAdminUI.renderStatsTable(stats.user_details || [], this.state.statsSortBy);
            TaskAdminUI.elements.statsContainer.style.display = 'block';
        } catch (error) {
            UIModule.toast(i18n.t('lta.toastLoadStatsFailed') + ': ' + error.message, 'error');
        }
    },

    /* ---------- Confirm Modal ---------- */

    _openConfirmModal(message) {
        TaskAdminUI.elements.confirmMessage.textContent = message;
        TaskAdminUI.elements.confirmModal.classList.add('active');
    },

    _closeConfirmModal() {
        TaskAdminUI.elements.confirmModal.classList.remove('active');
        this.state.confirmAction = null;
    },

    async _executeConfirmAction() {
        if (this.state.confirmAction) await this.state.confirmAction();
        this._closeConfirmModal();
    },

    /* ---------- Header Stats ---------- */

    async _updateStats() {
        try {
            const response = await TaskAdminAPI.listTasks('', 1, 100);
            if (!response || !response.ok) return;
            const data = await response.json();
            let draft = 0, published = 0;
            data.data.forEach(t => {
                if (t.status === 'draft') draft++;
                else if (t.status === 'published') published++;
            });
            TaskAdminUI.updateHeaderStats(draft, published);
        } catch (error) {
            console.error('Update stats error:', error);
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    TaskAdminApp.init();
});
