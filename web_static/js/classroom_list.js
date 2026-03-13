/**
 * 課堂列表 — 前端核心模組
 * ========================
 *
 * 架構：
 *   ClassroomAPI  — API 請求封裝
 *   ClassroomUI   — DOM 渲染
 *   ClassroomApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, UIModule, Utils
 * 加載順序: shared/* → classroom_list.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const ClassroomAPI = {
    BASE: '/api/classroom',

    async fetchRooms() {
        return APIClient.get(`${this.BASE}/rooms`);
    },

    async createRoom(payload) {
        return APIClient.post(`${this.BASE}/rooms`, payload);
    },

    async deleteRoom(roomId) {
        return APIClient.delete(`${this.BASE}/rooms/${roomId}`);
    },

    async updateRoomStatus(roomId, newStatus) {
        const resp = await fetch(`${this.BASE}/rooms/${roomId}/status`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${AuthModule.getToken()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: newStatus })
        });
        if (resp.status === 401) {
            window.location.href = '/';
            return null;
        }
        return resp.json();
    },

    async joinRoom(roomId) {
        return APIClient.post(`${this.BASE}/rooms/${roomId}/join`);
    }
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */

const ClassroomUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            splashScreen: document.getElementById('splashScreen'),
            mainContainer: document.getElementById('mainContainer'),
            backBtn: document.getElementById('backBtn'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            userRole: document.getElementById('userRole'),
            createBtn: document.getElementById('createBtn'),
            searchInput: document.getElementById('searchInput'),
            teacherSection: document.getElementById('teacherSection'),
            studentSection: document.getElementById('studentSection'),
            teacherRooms: document.getElementById('teacherRooms'),
            studentRooms: document.getElementById('studentRooms'),
            createRoomModal: document.getElementById('createRoomModal'),
            createRoomForm: document.getElementById('createRoomForm'),
            roomTitle: document.getElementById('roomTitle'),
            roomDescription: document.getElementById('roomDescription'),
            roomClasses: document.getElementById('roomClasses'),
            closeCreateModal: document.getElementById('closeCreateModal'),
            cancelCreateBtn: document.getElementById('cancelCreateBtn'),
            submitCreateBtn: document.getElementById('submitCreateBtn')
        };
    },

    updateUserInfo(user, isTeacher) {
        const el = this.elements;
        el.userName.textContent = user.name || 'User';
        el.userAvatar.textContent = (user.name || 'U').substring(0, 1).toUpperCase();

        if (isTeacher) {
            el.userRole.textContent = '教師';
            el.userRole.classList.add('teacher');
            el.createBtn.style.display = 'inline-block';
            el.teacherSection.style.display = 'block';
        } else {
            el.userRole.textContent = '學生';
            el.userRole.classList.add('student');
            el.createBtn.style.display = 'none';
            el.studentSection.style.display = 'block';
        }
    },

    hideSplash() {
        setTimeout(() => {
            this.elements.splashScreen.classList.add('hidden');
            this.elements.mainContainer.style.display = 'flex';
        }, 800);
    },

    openCreateModal() {
        this.elements.createRoomModal.classList.add('active');
        this.elements.roomTitle.focus();
    },

    closeModal() {
        this.elements.createRoomModal.classList.remove('active');
    },

    renderTeacherRooms(rooms) {
        const container = this.elements.teacherRooms;
        if (rooms.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1;">
                    <div class="empty-state">
                        <svg class="empty-state-icon-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="6" y="8" width="36" height="32" rx="3"/>
                            <path d="M6 16h36"/>
                            <path d="M16 8v8"/>
                            <path d="M32 8v8"/>
                            <path d="M18 26h12"/>
                            <path d="M18 32h8"/>
                        </svg>
                        <div class="empty-state-text">暫無課堂</div>
                        <div class="empty-state-hint">點擊「創建課堂」開始</div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = rooms.map(room => `
            <div class="room-card">
                <div class="room-card-header">
                    <h3 class="room-title">${Utils.escapeHtml(room.title)}</h3>
                    <span class="status-badge ${room.room_status}">${this._statusText(room.room_status)}</span>
                </div>
                ${room.description ? `<p class="room-description">${Utils.escapeHtml(room.description)}</p>` : ''}
                <div class="room-meta">
                    <span>${room.student_count || 0} 名學生</span>
                    <span>${Utils.formatDate(room.created_at)}</span>
                </div>
                ${room.allowed_classes && room.allowed_classes.length > 0 ? `
                    <div class="room-classes">
                        ${room.allowed_classes.map(cls => `<span class="class-tag">${Utils.escapeHtml(cls)}</span>`).join('')}
                    </div>` : ''}
                <div class="room-actions">
                    <button class="room-action-btn primary" data-action="enter" data-room-id="${room.room_id}">進入課堂</button>
                    <button class="room-action-btn" data-action="lesson-plans" data-room-id="${room.room_id}">課案編輯</button>
                    <button class="room-action-btn" data-action="toggle" data-room-id="${room.room_id}" data-status="${room.room_status}">${this._toggleStatusText(room.room_status)}</button>
                    <button class="room-action-btn danger" data-action="delete" data-room-id="${room.room_id}">刪除</button>
                </div>
            </div>
        `).join('');
    },

    renderStudentRooms(rooms) {
        const container = this.elements.studentRooms;
        if (rooms.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1;">
                    <div class="empty-state">
                        <svg class="empty-state-icon-svg" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
                            <circle cx="22" cy="22" r="14"/>
                            <path d="M32 32l10 10" stroke-linecap="round"/>
                        </svg>
                        <div class="empty-state-text">暫無可用課堂</div>
                        <div class="empty-state-hint">請聯繫教師獲取課堂</div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = rooms.map(room => `
            <div class="room-card">
                <div class="room-card-header">
                    <h3 class="room-title">${Utils.escapeHtml(room.title)}</h3>
                    <span class="status-badge ${room.room_status}">${this._statusText(room.room_status)}</span>
                </div>
                ${room.description ? `<p class="room-description">${Utils.escapeHtml(room.description)}</p>` : ''}
                <div class="room-meta">
                    <span>${room.teacher_display_name || '教師'}</span>
                    <span>${Utils.formatDate(room.created_at)}</span>
                </div>
                ${room.allowed_classes && room.allowed_classes.length > 0 ? `
                    <div class="room-classes">
                        ${room.allowed_classes.map(cls => `<span class="class-tag">${Utils.escapeHtml(cls)}</span>`).join('')}
                    </div>` : ''}
                <div class="room-actions">
                    <button class="room-action-btn primary" data-action="join" data-room-id="${room.room_id}" ${room.room_status === 'paused' ? 'disabled' : ''}>
                        ${room.room_status === 'paused' ? '課堂已暫停' : '加入課堂'}
                    </button>
                </div>
            </div>
        `).join('');
    },

    _statusText(status) {
        const map = { draft: '草稿', active: '進行中', paused: '已暫停', ended: '已結束' };
        return map[status] || status;
    },

    _toggleStatusText(status) {
        if (status === 'draft') return '啟動';
        if (status === 'active') return '暫停';
        if (status === 'paused') return '繼續';
        return '狀態';
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const ClassroomApp = {
    state: {
        currentUser: null,
        isTeacher: false,
        rooms: [],
        filteredRooms: []
    },

    async init() {
        ClassroomUI.cacheElements();

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

            this.state.currentUser = verifyData;
            this.state.currentUser.name = verifyData.display_name || verifyData.username || 'User';
            this.state.currentUser.role = verifyData.role || AuthModule.getUserRole();
            this.state.isTeacher = ['teacher', 'admin'].includes(this.state.currentUser.role);

            ClassroomUI.updateUserInfo(this.state.currentUser, this.state.isTeacher);
            this._bindEvents();
            await this._loadRooms();
            ClassroomUI.hideSplash();
        } catch (error) {
            console.error('Initialization error:', error);
            UIModule.toast('初始化失敗，請重新刷新頁面', 'error');
            setTimeout(() => { window.location.href = '/'; }, 2000);
        }
    },

    _bindEvents() {
        const el = ClassroomUI.elements;

        el.backBtn.addEventListener('click', () => { window.location.href = '/'; });
        el.createBtn.addEventListener('click', () => ClassroomUI.openCreateModal());
        el.closeCreateModal.addEventListener('click', () => ClassroomUI.closeModal());
        el.cancelCreateBtn.addEventListener('click', () => ClassroomUI.closeModal());
        el.createRoomModal.addEventListener('click', (e) => {
            if (e.target === el.createRoomModal) ClassroomUI.closeModal();
        });
        el.createRoomForm.addEventListener('submit', (e) => this._handleCreateRoom(e));
        el.searchInput.addEventListener('input', () => this._filterAndRender());

        // Event delegation for room action buttons
        el.teacherRooms.addEventListener('click', (e) => this._handleRoomAction(e));
        el.studentRooms.addEventListener('click', (e) => this._handleRoomAction(e));
    },

    async _handleRoomAction(e) {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;

        const action = btn.dataset.action;
        const roomId = btn.dataset.roomId;

        switch (action) {
            case 'enter':
                window.location.href = `/classroom/teacher/${roomId}`;
                break;
            case 'toggle':
                await this._toggleRoomStatus(roomId, btn.dataset.status);
                break;
            case 'delete':
                await this._deleteRoom(roomId);
                break;
            case 'join':
                await this._joinRoom(roomId);
                break;
            case 'lesson-plans':
                this._openLessonPlans(roomId);
                break;
        }
    },

    async _loadRooms() {
        try {
            const result = await ClassroomAPI.fetchRooms();
            if (!result || !result.success) {
                UIModule.toast('加載課堂失敗', 'error');
                return;
            }
            this.state.rooms = result.data || [];
            this._filterAndRender();
        } catch (error) {
            console.error('Load rooms error:', error);
            UIModule.toast('加載課堂出錯', 'error');
        }
    },

    _filterAndRender() {
        const searchTerm = ClassroomUI.elements.searchInput.value.toLowerCase();

        if (this.state.isTeacher) {
            this.state.filteredRooms = this.state.rooms.filter(room =>
                room.title.toLowerCase().includes(searchTerm)
            );
            ClassroomUI.renderTeacherRooms(this.state.filteredRooms);
        } else {
            this.state.filteredRooms = this.state.rooms.filter(room =>
                (room.room_status === 'active' || room.room_status === 'paused') &&
                room.title.toLowerCase().includes(searchTerm)
            );
            ClassroomUI.renderStudentRooms(this.state.filteredRooms);
        }
    },

    async _handleCreateRoom(e) {
        e.preventDefault();
        const el = ClassroomUI.elements;
        el.submitCreateBtn.disabled = true;
        el.submitCreateBtn.innerHTML = '<span class="spinner"></span> 創建中...';

        try {
            const allowedClasses = el.roomClasses.value
                .split(',').map(c => c.trim()).filter(c => c);

            const result = await ClassroomAPI.createRoom({
                title: el.roomTitle.value,
                description: el.roomDescription.value,
                allowed_classes: allowedClasses
            });

            if (!result || !result.success) {
                UIModule.toast(result?.message || '創建失敗', 'error');
                return;
            }

            UIModule.toast('課堂創建成功', 'success');
            ClassroomUI.closeModal();
            el.createRoomForm.reset();
            await this._loadRooms();
        } catch (error) {
            console.error('Create room error:', error);
            UIModule.toast('創建課堂出錯', 'error');
        } finally {
            el.submitCreateBtn.disabled = false;
            el.submitCreateBtn.textContent = '創建';
        }
    },

    async _deleteRoom(roomId) {
        const confirmed = await UIModule.confirm('確定要刪除這個課堂嗎？');
        if (!confirmed) return;

        try {
            const result = await ClassroomAPI.deleteRoom(roomId);
            if (!result || !result.success) {
                UIModule.toast(result?.message || '刪除失敗', 'error');
                return;
            }
            UIModule.toast('課堂已刪除', 'success');
            await this._loadRooms();
        } catch (error) {
            console.error('Delete room error:', error);
            UIModule.toast('刪除課堂出錯', 'error');
        }
    },

    async _toggleRoomStatus(roomId, currentStatus) {
        let newStatus;
        if (currentStatus === 'draft') newStatus = 'active';
        else if (currentStatus === 'active') newStatus = 'paused';
        else if (currentStatus === 'paused') newStatus = 'active';
        else return;

        try {
            const result = await ClassroomAPI.updateRoomStatus(roomId, newStatus);
            if (!result || !result.success) {
                UIModule.toast(result?.message || '更新失敗', 'error');
                return;
            }
            UIModule.toast('狀態已更新', 'success');
            await this._loadRooms();
        } catch (error) {
            console.error('Update status error:', error);
            UIModule.toast('更新課堂出錯', 'error');
        }
    },

    async _joinRoom(roomId) {
        try {
            const result = await ClassroomAPI.joinRoom(roomId);
            if (!result || !result.success) {
                UIModule.toast(result?.message || '加入失敗', 'error');
                return;
            }
            UIModule.toast('加入課堂成功', 'success');
            setTimeout(() => {
                window.location.href = `/classroom/student/${roomId}`;
            }, 500);
        } catch (error) {
            console.error('Join room error:', error);
            UIModule.toast('加入課堂出錯', 'error');
        }
    },

    async _openLessonPlans(roomId) {
        // Fetch lesson plans for this specific classroom, or create a new one
        try {
            const token = AuthModule.getToken();
            const url = roomId
                ? `/api/classroom/lesson-plans?room_id=${encodeURIComponent(roomId)}`
                : '/api/classroom/lesson-plans';
            const res = await fetch(url, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            const json = await res.json();
            const plans = (json.success && json.data) ? json.data : [];

            if (plans.length > 0) {
                // Open the first plan belonging to this room
                window.location.href = `/classroom/lesson-editor/${plans[0].plan_id}`;
            } else {
                // Create a new plan bound to this classroom
                const room = this.state.rooms.find(r => r.room_id === roomId);
                const title = room ? `${room.title} 課案` : '新課案';
                const createRes = await fetch('/api/classroom/lesson-plans', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ title, description: '', room_id: roomId || null }),
                });
                const createJson = await createRes.json();
                if (createJson.success && createJson.data) {
                    window.location.href = `/classroom/lesson-editor/${createJson.data.plan_id}`;
                } else {
                    UIModule.toast(createJson.message || '創建課案失敗', 'error');
                }
            }
        } catch (e) {
            console.error('Open lesson plans error:', e);
            UIModule.toast('打開課案失敗', 'error');
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    ClassroomApp.init();
});
