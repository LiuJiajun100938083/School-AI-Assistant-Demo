/**
 * 共享資源庫 — 前端核心模組
 * ============================
 *
 * 架構：
 *   ResourceAPI  — API 請求封裝
 *   ResourceUI   — DOM 渲染
 *   ResourceApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 * 加載順序: shared/* → resource_library.js
 */
'use strict';

/* ============================================================
   SVG Icons
   ============================================================ */
const Icons = {
    slides: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16,6 12,2 8,6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    empty: '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="8" y="12" width="48" height="36" rx="4"/><path d="M8 22h48"/><circle cx="32" cy="38" r="6"/><path d="M28 38l3 3 5-6"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
};

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const ResourceAPI = {
    BASE: '/api/resource-library',

    // Personal plans
    async getPersonalPlans(params = {}) {
        return APIClient.get(`${this.BASE}/personal-plans`, params);
    },

    // Shares
    async sharePlan(body) {
        return APIClient.post(`${this.BASE}/shares`, body);
    },
    async getMyShares(params = {}) {
        return APIClient.get(`${this.BASE}/shares/my`, params);
    },
    async getShareDetail(shareId) {
        return APIClient.get(`${this.BASE}/shares/${shareId}`);
    },
    async unshare(shareId) {
        return APIClient.delete(`${this.BASE}/shares/${shareId}`);
    },

    // Group shares
    async getGroupShares(groupId, params = {}) {
        return APIClient.get(`${this.BASE}/shares/group/${groupId}`, params);
    },

    // School shares
    async getSchoolShares(params = {}) {
        return APIClient.get(`${this.BASE}/shares/school`, params);
    },

    // Clone
    async clonePlan(body) {
        return APIClient.post(`${this.BASE}/clone`, body);
    },

    // My groups (teacher)
    async getMyGroups() {
        return APIClient.get(`${this.BASE}/my-groups`);
    },

    // Admin — groups
    async listGroups() {
        return APIClient.get(`${this.BASE}/groups`);
    },
    async createGroup(body) {
        return APIClient.post(`${this.BASE}/groups`, body);
    },
    async getGroupDetail(groupId) {
        return APIClient.get(`${this.BASE}/groups/${groupId}`);
    },
    async updateGroup(groupId, body) {
        return APIClient.put(`${this.BASE}/groups/${groupId}`, body);
    },
    async deleteGroup(groupId) {
        return APIClient.delete(`${this.BASE}/groups/${groupId}`);
    },
    async addMember(groupId, body) {
        return APIClient.post(`${this.BASE}/groups/${groupId}/members`, body);
    },
    async removeMember(groupId, username) {
        return APIClient.delete(`${this.BASE}/groups/${groupId}/members/${username}`);
    },

    // Teachers list (admin)
    async getTeachers() {
        const res = await APIClient.get('/api/admin/users?role=teacher');
        // This endpoint returns {users: [...]} format
        return res;
    },

    // Classroom rooms (for clone target)
    async getMyRooms() {
        return APIClient.get('/api/classroom/rooms');
    },

    // ── Standalone Plans (独立备课) ──────────────────────────
    async createPlan(body) {
        return APIClient.post(`${this.BASE}/plans`, body);
    },
    async getStandalonePlans(params = {}) {
        return APIClient.get(`${this.BASE}/plans`, params);
    },
    async getPlanDetail(planId) {
        return APIClient.get(`${this.BASE}/plans/${planId}`);
    },
    async updatePlan(planId, body) {
        return APIClient.put(`${this.BASE}/plans/${planId}`, body);
    },
    async deletePlan(planId, force = false) {
        return APIClient.delete(`${this.BASE}/plans/${planId}?force=${force}`);
    },
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */

const ResourceUI = {
    _statusMap: { draft: '草稿', ready: '就緒', archived: '已歸檔' },
    _scopeMap: { group: '組別', school: '全校' },

    renderPersonalPlans(plans, container) {
        // Toolbar with create button
        const toolbar = `
            <div class="toolbar">
                <div class="toolbar-left"><span style="font-size:13px;color:var(--text-secondary)">所有課案（含課堂綁定與獨立課件）</span></div>
                <div class="toolbar-right">
                    <button class="btn btn-primary" data-action="create-plan">${Icons.plus} 新建課件</button>
                </div>
            </div>`;

        if (!plans || plans.length === 0) {
            container.innerHTML = toolbar + `
                <div class="empty-state">
                    ${Icons.empty}
                    <div class="empty-state-text">暫無課案</div>
                    <div class="empty-state-hint">點擊「新建課件」直接開始備課</div>
                </div>`;
            return;
        }
        container.innerHTML = toolbar + '<div class="plan-list">' + plans.map(p => `
            <div class="plan-card" data-plan-id="${p.plan_id}">
                <div class="plan-icon">${Icons.slides}</div>
                <div class="plan-info">
                    <div class="plan-title">${Utils.escapeHtml(p.title)}</div>
                    <div class="plan-subtitle">
                        <span>${p.total_slides || 0} 頁</span>
                        <span>&middot;</span>
                        <span>${Utils.formatDate(p.updated_at || p.created_at)}</span>
                        ${p.room_id ? '<span>&middot;</span><span>已綁定課堂</span>' : '<span>&middot;</span><span style="color:var(--brand-green)">獨立課件</span>'}
                    </div>
                </div>
                <select class="plan-status-select ${p.status}" data-action="change-status" data-plan-id="${p.plan_id}">
                    <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>草稿</option>
                    <option value="ready" ${p.status === 'ready' ? 'selected' : ''}>就緒</option>
                    <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>已歸檔</option>
                </select>
                <div class="plan-actions">
                    <button class="btn btn-sm btn-secondary" data-action="edit-plan" data-plan-id="${p.plan_id}" title="編輯">
                        ${Icons.edit}
                    </button>
                    ${p.status === 'ready' ? `
                        <button class="btn btn-sm btn-primary" data-action="share-plan" data-plan-id="${p.plan_id}" data-plan-title="${Utils.escapeHtml(p.title)}" title="分享">
                            ${Icons.share} 分享
                        </button>
                    ` : ''}
                    <button class="btn btn-sm btn-danger" data-action="delete-plan" data-plan-id="${p.plan_id}" data-plan-title="${Utils.escapeHtml(p.title)}" title="刪除">
                        ${Icons.trash}
                    </button>
                </div>
            </div>
        `).join('') + '</div>';
    },

    renderResourceCards(items, container, opts = {}) {
        const { showClone = true, showUnshare = false } = opts;
        if (!items || items.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.empty}
                    <div class="empty-state-text">暫無共享資源</div>
                    <div class="empty-state-hint">${opts.emptyHint || '教師分享的課案將顯示在此處'}</div>
                </div>`;
            return;
        }

        const token = window.AuthModule?.getToken() || '';
        container.innerHTML = '<div class="resource-grid">' + items.map(item => {
            const thumbUrl = item.thumbnail_url
                ? `${item.thumbnail_url}${item.thumbnail_url.includes('?') ? '&' : '?'}token=${token}`
                : '';
            const thumbHtml = thumbUrl
                ? `<img src="${thumbUrl}" alt="縮略圖" loading="lazy" class="thumb-img">`
                : `<div class="card-thumb-placeholder">${Icons.slides}</div>`;

            return `
            <div class="resource-card" data-share-id="${item.share_id}">
                <div class="card-thumb">
                    ${thumbHtml}
                    <span class="scope-badge ${item.share_scope}">${this._scopeMap[item.share_scope] || item.share_scope}</span>
                    ${item.clone_count > 0 ? `<span class="clone-count">${Icons.copy} ${item.clone_count}</span>` : ''}
                </div>
                <div class="card-body">
                    <div class="card-title">${Utils.escapeHtml(item.title)}</div>
                    ${item.description ? `<div class="card-desc">${Utils.escapeHtml(item.description)}</div>` : ''}
                    <div class="card-meta">
                        <span class="card-meta-item">${Icons.user} ${Utils.escapeHtml(item.teacher_display_name || item.teacher_username)}</span>
                        <span class="card-meta-item">${Icons.slides} ${item.total_slides || 0} 頁</span>
                        <span class="card-meta-item">${Icons.clock} ${Utils.formatDate(item.shared_at)}</span>
                        ${item.subject_tag ? `<span class="subject-tag">${Utils.escapeHtml(item.subject_tag)}</span>` : ''}
                    </div>
                    <div class="card-footer">
                        ${showClone ? `<button class="btn btn-sm btn-primary" data-action="clone" data-share-id="${item.share_id}">
                            ${Icons.copy} 克隆到課堂
                        </button>` : ''}
                        ${showUnshare ? `<button class="btn btn-sm btn-danger" data-action="unshare" data-share-id="${item.share_id}">
                            ${Icons.trash} 取消分享
                        </button>` : ''}
                    </div>
                </div>
            </div>`;
        }).join('') + '</div>';

        // 為縮略圖添加 error fallback（避免 inline onerror 中 SVG 引號衝突）
        container.querySelectorAll('.thumb-img').forEach(img => {
            img.addEventListener('error', function() {
                this.parentElement.innerHTML = `<div class="card-thumb-placeholder">${Icons.slides}</div>`;
            }, { once: true });
        });
    },

    renderGroupSelector(groups, container, activeId) {
        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.empty}
                    <div class="empty-state-text">暫無分組</div>
                    <div class="empty-state-hint">管理員可在「分組管理」中創建教師分組</div>
                </div>`;
            return;
        }
        container.innerHTML = `
            <div class="group-selector">
                ${groups.map(g => `
                    <button class="group-pill ${g.group_id === activeId ? 'active' : ''}" data-group-id="${g.group_id}">
                        ${Utils.escapeHtml(g.group_name)}
                    </button>
                `).join('')}
            </div>
            <div id="groupSharesContent"></div>`;
    },

    renderAdminGroups(groups, container) {
        if (!groups || groups.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    ${Icons.empty}
                    <div class="empty-state-text">暫無分組</div>
                    <div class="empty-state-hint">點擊「創建分組」開始管理教師分組</div>
                    <button class="btn btn-primary" data-action="create-group" style="margin-top:16px">${Icons.plus} 創建分組</button>
                </div>`;
            return;
        }
        container.innerHTML = `
            <div class="toolbar">
                <div class="toolbar-left"></div>
                <div class="toolbar-right">
                    <button class="btn btn-primary" data-action="create-group">${Icons.plus} 創建分組</button>
                </div>
            </div>
            <div class="group-grid">
                ${groups.map(g => `
                    <div class="group-card" data-group-id="${g.group_id}">
                        <div class="group-header">
                            <div>
                                <div class="group-name">${Utils.escapeHtml(g.group_name)}</div>
                                ${g.description ? `<div class="group-desc">${Utils.escapeHtml(g.description)}</div>` : ''}
                            </div>
                            <button class="btn btn-sm btn-danger" data-action="delete-group" data-group-id="${g.group_id}" title="刪除分組">
                                ${Icons.trash}
                            </button>
                        </div>
                        <div class="member-count" id="memberCount-${g.group_id}">
                            ${Icons.users} <span>載入中...</span>
                        </div>
                        <div class="member-list" id="memberList-${g.group_id}"></div>
                        <div style="margin-top:12px">
                            <button class="btn btn-sm btn-secondary" data-action="add-member" data-group-id="${g.group_id}">
                                ${Icons.plus} 添加成員
                            </button>
                        </div>
                    </div>
                `).join('')}
            </div>`;
    },

    renderPagination(container, { page, totalPages, onPage }) {
        if (totalPages <= 1) {
            container.querySelector('.pagination')?.remove();
            return;
        }
        let existing = container.querySelector('.pagination');
        if (!existing) {
            existing = document.createElement('div');
            existing.className = 'pagination';
            container.appendChild(existing);
        }
        let html = `<button data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>&laquo;</button>`;
        const start = Math.max(1, page - 2);
        const end = Math.min(totalPages, page + 2);
        for (let i = start; i <= end; i++) {
            html += `<button data-page="${i}" class="${i === page ? 'active' : ''}">${i}</button>`;
        }
        html += `<button data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>&raquo;</button>`;
        existing.innerHTML = html;
        existing.onclick = (e) => {
            const btn = e.target.closest('[data-page]');
            if (btn && !btn.disabled) onPage(parseInt(btn.dataset.page));
        };
    },
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const ResourceApp = {
    state: {
        user: null,
        isTeacher: false,
        isAdmin: false,
        activeTab: 'personal',
        myGroups: [],        // teacher's groups
        allGroups: [],       // admin view
        activeGroupId: null, // for group tab
        myRooms: [],         // for clone target
    },

    async init() {
        try {
            if (!AuthModule.isAuthenticated()) {
                window.location.href = '/';
                return;
            }
            const verifyData = await AuthModule.verify();
            if (!verifyData) {
                AuthModule.removeToken();
                window.location.href = '/';
                return;
            }

            this.state.user = verifyData;
            this.state.user.name = verifyData.display_name || verifyData.username || 'User';
            this.state.user.role = verifyData.role || AuthModule.getUserRole();
            this.state.isTeacher = ['teacher', 'admin'].includes(this.state.user.role);
            this.state.isAdmin = this.state.user.role === 'admin';

            this._updateHeader();
            this._bindEvents();

            // Show admin tab if admin
            if (this.state.isAdmin) {
                document.getElementById('adminTab').style.display = '';
            }

            // Load initial tab
            await this._switchTab('personal');
            this._hideSplash();
        } catch (err) {
            console.error('Init error:', err);
            UIModule.toast('初始化失敗', 'error');
            setTimeout(() => { window.location.href = '/classroom'; }, 2000);
        }
    },

    _updateHeader() {
        const u = this.state.user;
        document.getElementById('userName').textContent = u.name;
        document.getElementById('userAvatar').textContent = (u.name || 'U')[0].toUpperCase();
        document.getElementById('userRole').textContent = this.state.isAdmin ? '管理員' : '教師';
    },

    _hideSplash() {
        setTimeout(() => {
            document.getElementById('splashScreen').classList.add('hidden');
            document.getElementById('mainContainer').style.display = 'flex';
        }, 600);
    },

    _bindEvents() {
        // Back button
        document.getElementById('backBtn').addEventListener('click', () => {
            window.location.href = '/classroom';
        });

        // Tab navigation
        document.getElementById('tabNav').addEventListener('click', (e) => {
            const btn = e.target.closest('.tab-btn');
            if (btn && btn.dataset.tab) this._switchTab(btn.dataset.tab);
        });

        // Tab panel event delegation
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.addEventListener('click', (e) => this._handlePanelAction(e));
            panel.addEventListener('change', (e) => this._handlePanelChange(e));
        });

        // Share modal
        this._bindModal('shareModal', 'closeShareModal', 'cancelShareBtn');
        document.getElementById('shareForm').addEventListener('submit', (e) => this._handleShare(e));
        document.querySelectorAll('input[name="shareScope"]').forEach(radio => {
            radio.addEventListener('change', () => {
                document.getElementById('groupSelectGroup').style.display =
                    document.getElementById('scopeGroup').checked ? '' : 'none';
            });
        });

        // Clone modal
        this._bindModal('cloneModal', 'closeCloneModal', 'cancelCloneBtn');
        document.getElementById('cloneForm').addEventListener('submit', (e) => this._handleClone(e));

        // Create group modal
        this._bindModal('createGroupModal', 'closeGroupModal', 'cancelGroupBtn');
        document.getElementById('createGroupForm').addEventListener('submit', (e) => this._handleCreateGroup(e));

        // Add member modal
        this._bindModal('addMemberModal', 'closeMemberModal', 'cancelMemberBtn');
        document.getElementById('addMemberForm').addEventListener('submit', (e) => this._handleAddMember(e));

        // Create plan modal
        this._bindModal('createPlanModal', 'closePlanModal', 'cancelPlanBtn');
        document.getElementById('createPlanForm').addEventListener('submit', (e) => this._handleCreatePlan(e));
    },

    _bindModal(overlayId, closeId, cancelId) {
        const overlay = document.getElementById(overlayId);
        document.getElementById(closeId).addEventListener('click', () => overlay.classList.remove('active'));
        document.getElementById(cancelId).addEventListener('click', () => overlay.classList.remove('active'));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    },

    // ── Tab Switching ────────────────────────────────────────

    async _switchTab(tab) {
        this.state.activeTab = tab;

        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tab);
        });

        // Update panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `panel-${tab}`);
        });

        // Load tab data
        const panel = document.getElementById(`panel-${tab}`);
        panel.innerHTML = '<div class="loading-center"><div class="spinner spinner-dark" style="width:24px;height:24px"></div></div>';

        try {
            switch (tab) {
                case 'personal':
                    await this._loadPersonalPlans(panel);
                    break;
                case 'group':
                    await this._loadGroupTab(panel);
                    break;
                case 'school':
                    await this._loadSchoolShares(panel);
                    break;
                case 'my-shares':
                    await this._loadMyShares(panel);
                    break;
                case 'admin':
                    await this._loadAdminGroups(panel);
                    break;
            }
        } catch (err) {
            console.error(`Load tab ${tab} error:`, err);
            panel.innerHTML = `<div class="empty-state"><div class="empty-state-text">載入失敗</div><div class="empty-state-hint">${err.message || '請稍後重試'}</div></div>`;
        }
    },

    // ── Tab Data Loaders ─────────────────────────────────────

    async _loadPersonalPlans(panel, page = 1) {
        const result = await ResourceAPI.getPersonalPlans({ page, page_size: 20 });
        ResourceUI.renderPersonalPlans(result.data, panel);
        if (result.pagination) {
            ResourceUI.renderPagination(panel, {
                page: result.pagination.page,
                totalPages: result.pagination.total_pages,
                onPage: (p) => this._loadPersonalPlans(panel, p),
            });
        }
    },

    async _loadGroupTab(panel) {
        const result = await ResourceAPI.getMyGroups();
        const groups = result.data || [];
        this.state.myGroups = groups;

        if (groups.length === 0) {
            ResourceUI.renderGroupSelector([], panel);
            return;
        }

        // Default to first group
        if (!this.state.activeGroupId || !groups.find(g => g.group_id === this.state.activeGroupId)) {
            this.state.activeGroupId = groups[0].group_id;
        }

        ResourceUI.renderGroupSelector(groups, panel, this.state.activeGroupId);

        // Bind group pill clicks
        panel.querySelectorAll('.group-pill').forEach(pill => {
            pill.addEventListener('click', () => {
                this.state.activeGroupId = pill.dataset.groupId;
                panel.querySelectorAll('.group-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                this._loadGroupShares(panel);
            });
        });

        await this._loadGroupShares(panel);
    },

    async _loadGroupShares(panel, page = 1) {
        const contentDiv = panel.querySelector('#groupSharesContent');
        if (!contentDiv) return;
        contentDiv.innerHTML = '<div class="loading-center"><div class="spinner spinner-dark" style="width:24px;height:24px"></div></div>';

        const result = await ResourceAPI.getGroupShares(this.state.activeGroupId, { page, page_size: 20 });
        ResourceUI.renderResourceCards(result.data, contentDiv, {
            showClone: true,
            emptyHint: '組員分享的課案將顯示在此處',
        });
        if (result.pagination) {
            ResourceUI.renderPagination(contentDiv, {
                page: result.pagination.page,
                totalPages: result.pagination.total_pages,
                onPage: (p) => this._loadGroupShares(panel, p),
            });
        }
    },

    async _loadSchoolShares(panel, page = 1) {
        const result = await ResourceAPI.getSchoolShares({ page, page_size: 20 });
        ResourceUI.renderResourceCards(result.data, panel, {
            showClone: true,
            emptyHint: '教師分享到全校的課案將顯示在此處',
        });
        if (result.pagination) {
            ResourceUI.renderPagination(panel, {
                page: result.pagination.page,
                totalPages: result.pagination.total_pages,
                onPage: (p) => this._loadSchoolShares(panel, p),
            });
        }
    },

    async _loadMyShares(panel, page = 1) {
        const result = await ResourceAPI.getMyShares({ page, page_size: 20 });
        ResourceUI.renderResourceCards(result.data, panel, {
            showClone: false,
            showUnshare: true,
            emptyHint: '你分享的課案將顯示在此處',
        });
        if (result.pagination) {
            ResourceUI.renderPagination(panel, {
                page: result.pagination.page,
                totalPages: result.pagination.total_pages,
                onPage: (p) => this._loadMyShares(panel, p),
            });
        }
    },

    async _loadAdminGroups(panel) {
        const result = await ResourceAPI.listGroups();
        const groups = result.data || [];
        this.state.allGroups = groups;
        ResourceUI.renderAdminGroups(groups, panel);

        // Load member details for each group
        for (const g of groups) {
            this._loadGroupMembers(g.group_id);
        }
    },

    async _loadGroupMembers(groupId) {
        try {
            const result = await ResourceAPI.getGroupDetail(groupId);
            const group = result.data;
            const countEl = document.getElementById(`memberCount-${groupId}`);
            const listEl = document.getElementById(`memberList-${groupId}`);
            if (!countEl || !listEl) return;

            const members = group.members || [];
            countEl.innerHTML = `${Icons.users} <span>${members.length} 位成員</span>`;

            if (members.length === 0) {
                listEl.innerHTML = '<span style="font-size:13px;color:var(--text-tertiary)">尚無成員</span>';
            } else {
                listEl.innerHTML = members.map(m => `
                    <span class="member-chip">
                        ${Utils.escapeHtml(m.teacher_username)}
                        <button class="remove-member" data-action="remove-member" data-group-id="${groupId}" data-username="${m.teacher_username}" title="移除">
                            &times;
                        </button>
                    </span>
                `).join('');
            }
        } catch (err) {
            console.error(`Load members for ${groupId} error:`, err);
        }
    },

    // ── Action Handler (Event Delegation) ────────────────────

    async _handlePanelAction(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;

        switch (action) {
            case 'create-plan':
                document.getElementById('createPlanModal').classList.add('active');
                document.getElementById('newPlanTitle').value = '';
                document.getElementById('newPlanDesc').value = '';
                document.getElementById('newPlanTitle').focus();
                break;

            case 'edit-plan':
                window.location.href = `/classroom/lesson-editor/${btn.dataset.planId}`;
                break;

            case 'delete-plan':
                await this._handleDeletePlan(btn.dataset.planId, btn.dataset.planTitle);
                break;

            case 'share-plan':
                await this._openShareModal(btn.dataset.planId);
                break;

            case 'clone':
                await this._openCloneModal(btn.dataset.shareId);
                break;

            case 'unshare':
                await this._handleUnshare(btn.dataset.shareId);
                break;

            case 'create-group':
                document.getElementById('createGroupModal').classList.add('active');
                document.getElementById('groupName').focus();
                break;

            case 'delete-group':
                await this._handleDeleteGroup(btn.dataset.groupId);
                break;

            case 'add-member':
                document.getElementById('memberGroupId').value = btn.dataset.groupId;
                await this._loadTeacherSelect(btn.dataset.groupId);
                document.getElementById('addMemberModal').classList.add('active');
                break;

            case 'remove-member':
                await this._handleRemoveMember(btn.dataset.groupId, btn.dataset.username);
                break;
        }
    },

    // ── Status Change ─────────────────────────────────────────

    async _handlePanelChange(e) {
        const el = e.target.closest('[data-action="change-status"]');
        if (!el) return;
        await this._handleChangeStatus(el.dataset.planId, el.value, el);
    },

    async _handleChangeStatus(planId, newStatus, selectEl) {
        try {
            await ResourceAPI.updatePlan(planId, { status: newStatus });
            // Update select styling
            selectEl.className = `plan-status-select ${newStatus}`;
            UIModule.toast(`狀態已更新為「${ResourceUI._statusMap[newStatus]}」`, 'success');
        } catch (err) {
            console.error('Change status error:', err);
            // Revert on failure — reload tab
            await this._switchTab(this.state.activeTab);
        }
    },

    // ── Share Modal ──────────────────────────────────────────

    async _openShareModal(planId) {
        document.getElementById('sharePlanId').value = planId;

        // Load groups for dropdown
        try {
            const result = await ResourceAPI.getMyGroups();
            const groups = result.data || [];
            const select = document.getElementById('shareGroupId');
            select.innerHTML = '<option value="">請選擇...</option>' +
                groups.map(g => `<option value="${g.group_id}">${Utils.escapeHtml(g.group_name)}</option>`).join('');
        } catch (err) {
            console.error('Load groups for share:', err);
        }

        // Reset to group scope
        document.getElementById('scopeGroup').checked = true;
        document.getElementById('groupSelectGroup').style.display = '';
        document.getElementById('shareSubjectTag').value = '';

        document.getElementById('shareModal').classList.add('active');
    },

    async _handleShare(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitShareBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> 分享中...';

        try {
            const scope = document.querySelector('input[name="shareScope"]:checked').value;
            const body = {
                plan_id: document.getElementById('sharePlanId').value,
                share_scope: scope,
                subject_tag: document.getElementById('shareSubjectTag').value,
            };
            if (scope === 'group') {
                body.group_id = document.getElementById('shareGroupId').value;
                if (!body.group_id) {
                    UIModule.toast('請選擇分組', 'warning');
                    return;
                }
            }

            await ResourceAPI.sharePlan(body);
            UIModule.toast('分享成功', 'success');
            document.getElementById('shareModal').classList.remove('active');

            // Reload current tab
            await this._switchTab(this.state.activeTab);
        } catch (err) {
            console.error('Share error:', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '確認分享';
        }
    },

    // ── Clone Modal ──────────────────────────────────────────

    async _openCloneModal(shareId) {
        document.getElementById('cloneShareId').value = shareId;

        // Load my rooms
        try {
            const result = await ResourceAPI.getMyRooms();
            const rooms = (result.data || []).filter(r => !r.is_deleted);
            this.state.myRooms = rooms;
            const select = document.getElementById('cloneRoomId');
            select.innerHTML = '<option value="">克隆為獨立課件（不綁定課堂）</option>' +
                rooms.map(r => `<option value="${r.room_id}">${Utils.escapeHtml(r.title)}</option>`).join('');
        } catch (err) {
            console.error('Load rooms for clone:', err);
        }

        document.getElementById('cloneModal').classList.add('active');
    },

    async _handleClone(e) {
        e.preventDefault();
        const roomId = document.getElementById('cloneRoomId').value;

        const submitBtn = document.getElementById('submitCloneBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> 克隆中...';

        try {
            const body = { share_id: document.getElementById('cloneShareId').value };
            if (roomId) body.target_room_id = roomId;

            const result = await ResourceAPI.clonePlan(body);
            const msg = roomId ? '克隆成功！課案已添加到課堂中' : '克隆成功！已創建為獨立課件';
            UIModule.toast(msg, 'success');
            document.getElementById('cloneModal').classList.remove('active');

            // Offer to go edit
            const confirmed = await UIModule.confirm('是否前往編輯克隆的課案？');
            if (confirmed && result.data?.new_plan_id) {
                window.location.href = `/classroom/lesson-editor/${result.data.new_plan_id}`;
            }
        } catch (err) {
            console.error('Clone error:', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '確認克隆';
        }
    },

    // ── Unshare ──────────────────────────────────────────────

    async _handleUnshare(shareId) {
        const confirmed = await UIModule.confirm('確定要取消分享嗎？其他教師將無法再看到此資源。');
        if (!confirmed) return;

        try {
            await ResourceAPI.unshare(shareId);
            UIModule.toast('已取消分享', 'success');
            await this._switchTab('my-shares');
        } catch (err) {
            console.error('Unshare error:', err);
        }
    },

    // ── Create Plan ─────────────────────────────────────────

    async _handleCreatePlan(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitPlanBtn');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner"></span> 創建中...';

        try {
            const result = await ResourceAPI.createPlan({
                title: document.getElementById('newPlanTitle').value.trim(),
                description: document.getElementById('newPlanDesc').value.trim(),
            });
            UIModule.toast('課件創建成功', 'success');
            document.getElementById('createPlanModal').classList.remove('active');

            // Go to editor
            if (result.data?.plan_id) {
                window.location.href = `/classroom/lesson-editor/${result.data.plan_id}`;
            }
        } catch (err) {
            console.error('Create plan error:', err);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '創建並編輯';
        }
    },

    // ── Delete Plan (with share detection) ───────────────────

    async _handleDeletePlan(planId, planTitle) {
        const confirmed = await UIModule.confirm(`確定要刪除課件「${planTitle || ''}」嗎？`);
        if (!confirmed) return;

        try {
            const result = await ResourceAPI.deletePlan(planId, false);

            // Check if blocked by active shares (409)
            if (!result.success && result.error?.details?.active_shares) {
                const shares = result.error.details.active_shares;
                const forceConfirm = await UIModule.confirm(
                    `此課件有 ${shares.length} 條活躍分享。\n刪除將同時取消所有分享，確定繼續嗎？`
                );
                if (!forceConfirm) return;

                // Force delete
                await ResourceAPI.deletePlan(planId, true);
            }

            UIModule.toast('課件已刪除', 'success');
            await this._switchTab(this.state.activeTab);
        } catch (err) {
            // Handle 409 from error response
            if (err.details?.active_shares) {
                const shares = err.details.active_shares;
                const forceConfirm = await UIModule.confirm(
                    `此課件有 ${shares.length} 條活躍分享。\n刪除將同時取消所有分享，確定繼續嗎？`
                );
                if (!forceConfirm) return;
                try {
                    await ResourceAPI.deletePlan(planId, true);
                    UIModule.toast('課件已刪除', 'success');
                    await this._switchTab(this.state.activeTab);
                } catch (err2) {
                    console.error('Force delete error:', err2);
                }
            } else {
                console.error('Delete plan error:', err);
            }
        }
    },

    // ── Admin: Create Group ──────────────────────────────────

    async _handleCreateGroup(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitGroupBtn');
        submitBtn.disabled = true;

        try {
            await ResourceAPI.createGroup({
                group_name: document.getElementById('groupName').value,
                description: document.getElementById('groupDesc').value,
            });
            UIModule.toast('分組創建成功', 'success');
            document.getElementById('createGroupModal').classList.remove('active');
            document.getElementById('createGroupForm').reset();
            await this._switchTab('admin');
        } catch (err) {
            console.error('Create group error:', err);
        } finally {
            submitBtn.disabled = false;
        }
    },

    // ── Admin: Delete Group ──────────────────────────────────

    async _handleDeleteGroup(groupId) {
        const confirmed = await UIModule.confirm('確定要刪除此分組嗎？');
        if (!confirmed) return;

        try {
            await ResourceAPI.deleteGroup(groupId);
            UIModule.toast('分組已刪除', 'success');
            await this._switchTab('admin');
        } catch (err) {
            console.error('Delete group error:', err);
        }
    },

    // ── Admin: Load Teacher Select ────────────────────────────

    async _loadTeacherSelect(groupId) {
        const select = document.getElementById('memberUsername');
        select.innerHTML = '<option value="">載入中...</option>';
        try {
            // Get all teachers + admins
            const [teacherRes, adminRes] = await Promise.all([
                ResourceAPI.getTeachers(),
                APIClient.get('/api/admin/users?role=admin'),
            ]);
            const teachers = [...(teacherRes.users || []), ...(adminRes.users || [])];
            // Get current group members to filter them out
            const groupRes = await ResourceAPI.getGroupDetail(groupId);
            const existingMembers = new Set(
                (groupRes.data?.members || []).map(m => m.teacher_username)
            );
            // Filter out existing members
            const available = teachers.filter(t => !existingMembers.has(t.username));
            select.innerHTML = '<option value="">請選擇教師...</option>';
            if (available.length === 0) {
                select.innerHTML = '<option value="">沒有可添加的教師</option>';
                return;
            }
            available.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.username;
                opt.textContent = `${t.display_name || t.username} (${t.username})`;
                select.appendChild(opt);
            });
        } catch (err) {
            console.error('Load teachers error:', err);
            select.innerHTML = '<option value="">載入失敗</option>';
        }
    },

    // ── Admin: Add Member ────────────────────────────────────

    async _handleAddMember(e) {
        e.preventDefault();
        const submitBtn = document.getElementById('submitMemberBtn');
        submitBtn.disabled = true;

        const groupId = document.getElementById('memberGroupId').value;
        const username = document.getElementById('memberUsername').value;

        try {
            await ResourceAPI.addMember(groupId, { teacher_username: username });
            UIModule.toast('成員添加成功', 'success');
            document.getElementById('addMemberModal').classList.remove('active');
            document.getElementById('addMemberForm').reset();
            await this._loadGroupMembers(groupId);
        } catch (err) {
            console.error('Add member error:', err);
        } finally {
            submitBtn.disabled = false;
        }
    },

    // ── Admin: Remove Member ─────────────────────────────────

    async _handleRemoveMember(groupId, username) {
        const confirmed = await UIModule.confirm(`確定要將 ${username} 移出分組嗎？`);
        if (!confirmed) return;

        try {
            await ResourceAPI.removeMember(groupId, username);
            UIModule.toast('成員已移除', 'success');
            await this._loadGroupMembers(groupId);
        } catch (err) {
            console.error('Remove member error:', err);
        }
    },
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    ResourceApp.init();
});
