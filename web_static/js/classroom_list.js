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
    },

    async updateRoom(roomId, payload) {
        const resp = await fetch(`${this.BASE}/rooms/${roomId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${AuthModule.getToken()}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });
        if (resp.status === 401) {
            window.location.href = '/';
            return null;
        }
        return resp.json();
    },

    async fetchClasses() {
        return APIClient.get(`${this.BASE}/classes`);
    }
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */

const ClassroomUI = {
    elements: {},

    /* Status → CSS color mapping */
    STATUS_COLORS: {
        active: '#34C759',
        paused: '#FF9500',
        draft: '#A1A1A6',
        ended: '#FF3B30'
    },

    cacheElements() {
        this.elements = {
            splashScreen: document.getElementById('splashScreen'),
            mainContainer: document.getElementById('mainContainer'),
            backBtn: document.getElementById('backBtn'),
            userAvatar: document.getElementById('userAvatar'),
            userName: document.getElementById('userName'),
            userRole: document.getElementById('userRole'),
            resourceLibBtn: document.getElementById('resourceLibBtn'),
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
            classPicker: document.getElementById('classPicker'),
            closeCreateModal: document.getElementById('closeCreateModal'),
            cancelCreateBtn: document.getElementById('cancelCreateBtn'),
            submitCreateBtn: document.getElementById('submitCreateBtn'),
            editRoomModal: document.getElementById('editRoomModal'),
            editRoomForm: document.getElementById('editRoomForm'),
            editRoomId: document.getElementById('editRoomId'),
            editRoomTitle: document.getElementById('editRoomTitle'),
            editRoomDescription: document.getElementById('editRoomDescription'),
            editClassPicker: document.getElementById('editClassPicker'),
            closeEditModal: document.getElementById('closeEditModal'),
            cancelEditBtn: document.getElementById('cancelEditBtn'),
            submitEditBtn: document.getElementById('submitEditBtn')
        };
    },

    updateUserInfo(user, isTeacher) {
        const el = this.elements;
        el.userName.textContent = user.name || 'User';
        el.userAvatar.textContent = (user.name || 'U').substring(0, 1).toUpperCase();

        if (isTeacher) {
            el.userRole.textContent = i18n.t('cl.teacher');
            el.userRole.classList.add('teacher');
            el.createBtn.style.display = 'inline-block';
            el.resourceLibBtn.style.display = 'inline-flex';
            el.teacherSection.style.display = 'block';
        } else {
            el.userRole.textContent = i18n.t('cl.student');
            el.userRole.classList.add('student');
            el.createBtn.style.display = 'none';
            el.resourceLibBtn.style.display = 'none';
            el.studentSection.style.display = 'block';
        }
    },

    hideSplash() {
        setTimeout(() => {
            this.elements.splashScreen.classList.add('hidden');
            this.elements.mainContainer.style.display = 'flex';
        }, 800);
    },

    async openCreateModal() {
        this.elements.createRoomModal.classList.add('active');
        this.elements.roomTitle.focus();
        await this._loadClassPicker();
    },

    closeModal() {
        this.elements.createRoomModal.classList.remove('active');
    },

    async _loadClassPicker() {
        const picker = this.elements.classPicker;
        if (!picker) return;
        picker.innerHTML = `<div class="class-picker-loading">${i18n.t('cl.loadingClasses')}</div>`;

        try {
            const result = await ClassroomAPI.fetchClasses();
            const grades = (result && result.success && result.data) ? result.data.grades : {};
            this._renderClassPickerInto(picker, grades, []);
        } catch (e) {
            picker.innerHTML = `<div class="class-picker-loading">${i18n.t('cl.loadFailed')}</div>`;
        }
    },

    /**
     * Render class picker into a target element.
     * @param {HTMLElement} pickerEl — container element
     * @param {Object} grades — { "P1": [{class_name: "1A"}, ...], ... }
     * @param {string[]} preSelected — pre-selected class names (empty = all students)
     */
    _renderClassPickerInto(pickerEl, grades, preSelected) {
        const isAllStudents = !preSelected || preSelected.length === 0;
        const preSet = new Set(preSelected || []);
        const uid = 'cp_' + Math.random().toString(36).slice(2, 8);

        let html = '';
        html += `<label class="cp-all-row">
            <input type="checkbox" data-cp-all="${uid}" ${isAllStudents ? 'checked' : ''}>
            <span>${i18n.t('cl.allStudentsNoLimit')}</span>
        </label>`;

        const gradeKeys = Object.keys(grades);
        if (gradeKeys.length > 0) {
            html += '<div class="cp-grades">';
            gradeKeys.forEach(grade => {
                const classes = grades[grade] || [];
                html += `<div class="cp-grade-row">`;
                html += `<span class="cp-grade-label">${Utils.escapeHtml(grade)}</span>`;
                html += `<div class="cp-classes">`;
                classes.forEach(cls => {
                    const checked = preSet.has(cls.class_name) ? 'checked' : '';
                    const disabled = isAllStudents ? 'disabled' : '';
                    html += `<label class="cp-class-item">
                        <input type="checkbox" class="cp-class-cb" value="${Utils.escapeHtml(cls.class_name)}" ${checked} ${disabled}>
                        <span>${Utils.escapeHtml(cls.class_name)}</span>
                    </label>`;
                });
                html += '</div></div>';
            });
            html += '</div>';
        }

        pickerEl.innerHTML = html;

        const allCb = pickerEl.querySelector(`[data-cp-all="${uid}"]`);
        const classCbs = pickerEl.querySelectorAll('.cp-class-cb');

        allCb.addEventListener('change', () => {
            if (allCb.checked) {
                classCbs.forEach(cb => { cb.checked = false; cb.disabled = true; });
            } else {
                classCbs.forEach(cb => { cb.disabled = false; });
            }
        });

        classCbs.forEach(cb => {
            cb.addEventListener('change', () => {
                const anyChecked = Array.from(classCbs).some(c => c.checked);
                if (anyChecked) {
                    allCb.checked = false;
                    classCbs.forEach(c => { c.disabled = false; });
                }
            });
        });
    },

    _getSelectedClassesFrom(pickerEl) {
        if (!pickerEl) return [];
        const allCb = pickerEl.querySelector('[data-cp-all]');
        if (allCb && allCb.checked) return [];
        return Array.from(pickerEl.querySelectorAll('.cp-class-cb:checked')).map(cb => cb.value);
    },

    getSelectedClasses() {
        return this._getSelectedClassesFrom(this.elements.classPicker);
    },

    getEditSelectedClasses() {
        return this._getSelectedClassesFrom(this.elements.editClassPicker);
    },

    async openEditModal(room) {
        const el = this.elements;
        el.editRoomId.value = room.room_id;
        el.editRoomTitle.value = room.title || '';
        el.editRoomDescription.value = room.description || '';
        el.editRoomModal.classList.add('active');
        el.editRoomTitle.focus();

        // Load class picker with pre-selected classes
        const picker = el.editClassPicker;
        picker.innerHTML = `<div class="class-picker-loading">${i18n.t('cl.loadingClasses')}</div>`;
        try {
            const result = await ClassroomAPI.fetchClasses();
            const grades = (result && result.success && result.data) ? result.data.grades : {};
            this._renderClassPickerInto(picker, grades, room.allowed_classes || []);
        } catch (e) {
            picker.innerHTML = `<div class="class-picker-loading">${i18n.t('cl.loadFailed')}</div>`;
        }
    },

    closeEditModal() {
        this.elements.editRoomModal.classList.remove('active');
    },

    renderTeacherRooms(rooms) {
        const container = this.elements.teacherRooms;
        if (rooms.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1;">
                    <div class="empty-state">
                        <svg class="empty-state-icon-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
                            <rect x="8" y="12" width="48" height="40" rx="4"/>
                            <path d="M8 22h48"/>
                            <circle cx="32" cy="36" r="6"/>
                            <path d="M26 46h12"/>
                            <path d="M20 12V8a4 4 0 0 1 4-4h16a4 4 0 0 1 4 4v4"/>
                        </svg>
                        <div class="empty-state-text">${i18n.t('cl.noClassrooms')}</div>
                        <div class="empty-state-hint">${i18n.t('cl.noClassroomsHint')}</div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = rooms.map(room => {
            const statusDot = room.room_status === 'active' ? '<span class="status-dot-inline"></span>' : '';
            return `
            <div class="room-card">
                <div class="room-card-header">
                    <h3 class="room-title">${Utils.escapeHtml(room.title)}</h3>
                    <span class="status-badge ${room.room_status}">${statusDot}${this._statusText(room.room_status)}</span>
                </div>
                ${room.description ? `<p class="room-description">${Utils.escapeHtml(room.description)}</p>` : ''}
                <div class="room-meta">
                    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>${i18n.t('cl.studentCount', {count: room.student_count || 0})}</span>
                    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${Utils.formatDate(room.created_at)}</span>
                </div>
                ${room.allowed_classes && room.allowed_classes.length > 0 ? `
                    <div class="room-classes">
                        ${room.allowed_classes.map(cls => `<span class="class-tag">${Utils.escapeHtml(cls)}</span>`).join('')}
                    </div>` : ''}
                <div class="room-actions">
                    ${room.room_status === 'ended'
                        ? `<button class="room-action-btn primary" data-action="reopen" data-room-id="${room.room_id}">${i18n.t('cl.reopen')}</button>`
                        : `<button class="room-action-btn primary" data-action="enter" data-room-id="${room.room_id}">${i18n.t('cl.enterClassroom')}</button>`}
                    <button class="room-action-btn" data-action="lesson-plans" data-room-id="${room.room_id}">${i18n.t('cl.lessonPlans')}</button>
                    <button class="room-action-btn" data-action="edit" data-room-id="${room.room_id}">${i18n.t('cl.edit')}</button>
                    <button class="room-action-btn danger" data-action="delete" data-room-id="${room.room_id}">${i18n.t('cl.delete')}</button>
                </div>
            </div>`;
        }).join('');
    },

    renderStudentRooms(rooms) {
        const container = this.elements.studentRooms;
        if (rooms.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1 / -1;">
                    <div class="empty-state">
                        <svg class="empty-state-icon-svg" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5">
                            <path d="M32 4L4 18l28 14 28-14L32 4z"/>
                            <path d="M4 18v20l28 14"/>
                            <path d="M60 18v20L32 52"/>
                            <circle cx="32" cy="34" r="4"/>
                        </svg>
                        <div class="empty-state-text">${i18n.t('cl.noAvailableClassrooms')}</div>
                        <div class="empty-state-hint">${i18n.t('cl.waitingForTeacher')}</div>
                    </div>
                </div>`;
            return;
        }

        container.innerHTML = rooms.map(room => {
            const statusDot = room.room_status === 'active' ? '<span class="status-dot-inline"></span>' : '';
            return `
            <div class="room-card">
                <div class="room-card-header">
                    <h3 class="room-title">${Utils.escapeHtml(room.title)}</h3>
                    <span class="status-badge ${room.room_status}">${statusDot}${this._statusText(room.room_status)}</span>
                </div>
                ${room.description ? `<p class="room-description">${Utils.escapeHtml(room.description)}</p>` : ''}
                <div class="room-meta">
                    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>${room.teacher_display_name || i18n.t('cl.teacher')}</span>
                    <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>${Utils.formatDate(room.created_at)}</span>
                </div>
                ${room.allowed_classes && room.allowed_classes.length > 0 ? `
                    <div class="room-classes">
                        ${room.allowed_classes.map(cls => `<span class="class-tag">${Utils.escapeHtml(cls)}</span>`).join('')}
                    </div>` : ''}
                <div class="room-actions">
                    <button class="room-action-btn primary" data-action="join" data-room-id="${room.room_id}" ${room.room_status === 'paused' ? 'disabled' : ''}>
                        ${room.room_status === 'paused' ? i18n.t('cl.classroomPaused') : i18n.t('cl.joinClassroom')}
                    </button>
                </div>
            </div>`;
        }).join('');
    },

    _statusText(status) {
        const map = {
            draft: i18n.t('cl.statusDraft'),
            active: i18n.t('cl.statusActive'),
            paused: i18n.t('cl.statusPaused'),
            ended: i18n.t('cl.statusEnded')
        };
        return map[status] || status;
    },

    _toggleStatusText(status) {
        if (status === 'draft') return i18n.t('cl.actionStart');
        if (status === 'active') return i18n.t('cl.actionPause');
        if (status === 'paused') return i18n.t('cl.actionResume');
        return i18n.t('cl.status');
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
            i18n.applyDOM();
            this._bindEvents();
            await this._loadRooms();
            ClassroomUI.hideSplash();
        } catch (error) {
            console.error('Initialization error:', error);
            UIModule.toast(i18n.t('cl.initFailed'), 'error');
            setTimeout(() => { window.location.href = '/'; }, 2000);
        }
    },

    _bindEvents() {
        const el = ClassroomUI.elements;

        el.backBtn.title = i18n.t('cl.back');
        el.backBtn.addEventListener('click', () => { window.location.href = '/'; });
        el.createBtn.addEventListener('click', () => { ClassroomUI.openCreateModal(); });
        el.closeCreateModal.addEventListener('click', () => ClassroomUI.closeModal());
        el.cancelCreateBtn.addEventListener('click', () => ClassroomUI.closeModal());
        el.createRoomModal.addEventListener('click', (e) => {
            if (e.target === el.createRoomModal) ClassroomUI.closeModal();
        });
        el.createRoomForm.addEventListener('submit', (e) => this._handleCreateRoom(e));
        el.closeEditModal.addEventListener('click', () => ClassroomUI.closeEditModal());
        el.cancelEditBtn.addEventListener('click', () => ClassroomUI.closeEditModal());
        el.editRoomModal.addEventListener('click', (e) => {
            if (e.target === el.editRoomModal) ClassroomUI.closeEditModal();
        });
        el.editRoomForm.addEventListener('submit', (e) => this._handleEditRoom(e));
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
            case 'edit':
                this._openEditModal(roomId);
                break;
            case 'reopen':
                await this._reopenRoom(roomId);
                break;
        }
    },

    async _loadRooms() {
        try {
            const result = await ClassroomAPI.fetchRooms();
            if (!result || !result.success) {
                UIModule.toast(i18n.t('cl.loadRoomsFailed'), 'error');
                return;
            }
            this.state.rooms = result.data || [];
            this._filterAndRender();
        } catch (error) {
            console.error('Load rooms error:', error);
            UIModule.toast(i18n.t('cl.loadRoomsError'), 'error');
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
        el.submitCreateBtn.innerHTML = `<span class="spinner"></span> ${i18n.t('cl.creating')}`;

        try {
            const allowedClasses = ClassroomUI.getSelectedClasses();

            const result = await ClassroomAPI.createRoom({
                title: el.roomTitle.value,
                description: el.roomDescription.value,
                allowed_classes: allowedClasses
            });

            if (!result || !result.success) {
                UIModule.toast(result?.message || i18n.t('cl.createFailed'), 'error');
                return;
            }

            UIModule.toast(i18n.t('cl.createSuccess'), 'success');
            ClassroomUI.closeModal();
            el.createRoomForm.reset();
            await this._loadRooms();
        } catch (error) {
            console.error('Create room error:', error);
            UIModule.toast(i18n.t('cl.createError'), 'error');
        } finally {
            el.submitCreateBtn.disabled = false;
            el.submitCreateBtn.textContent = i18n.t('cl.create');
        }
    },

    async _deleteRoom(roomId) {
        const confirmed = await UIModule.confirm(i18n.t('cl.confirmDelete'));
        if (!confirmed) return;

        try {
            const result = await ClassroomAPI.deleteRoom(roomId);
            if (!result || !result.success) {
                UIModule.toast(result?.message || i18n.t('cl.deleteFailed'), 'error');
                return;
            }
            UIModule.toast(i18n.t('cl.deleteSuccess'), 'success');
            await this._loadRooms();
        } catch (error) {
            console.error('Delete room error:', error);
            UIModule.toast(i18n.t('cl.deleteError'), 'error');
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
                UIModule.toast(result?.message || i18n.t('cl.updateFailed'), 'error');
                return;
            }
            UIModule.toast(i18n.t('cl.statusUpdated'), 'success');
            await this._loadRooms();
        } catch (error) {
            console.error('Update status error:', error);
            UIModule.toast(i18n.t('cl.updateError'), 'error');
        }
    },

    async _joinRoom(roomId) {
        try {
            const result = await ClassroomAPI.joinRoom(roomId);
            if (!result || !result.success) {
                UIModule.toast(result?.message || i18n.t('cl.joinFailed'), 'error');
                return;
            }
            UIModule.toast(i18n.t('cl.joinSuccess'), 'success');
            setTimeout(() => {
                window.location.href = `/classroom/student/${roomId}`;
            }, 500);
        } catch (error) {
            console.error('Join room error:', error);
            UIModule.toast(i18n.t('cl.joinError'), 'error');
        }
    },

    async _reopenRoom(roomId) {
        try {
            const result = await ClassroomAPI.updateRoomStatus(roomId, 'draft');
            if (!result || !result.success) {
                UIModule.toast(result?.message || i18n.t('cl.reopenFailed'), 'error');
                return;
            }
            UIModule.toast(i18n.t('cl.reopenSuccess'), 'success');
            await this._loadRooms();
        } catch (error) {
            console.error('Reopen room error:', error);
            UIModule.toast(i18n.t('cl.reopenError'), 'error');
        }
    },

    _openEditModal(roomId) {
        const room = this.state.rooms.find(r => r.room_id === roomId);
        if (!room) {
            UIModule.toast(i18n.t('cl.roomNotFound'), 'error');
            return;
        }
        ClassroomUI.openEditModal(room);
    },

    async _handleEditRoom(e) {
        e.preventDefault();
        const el = ClassroomUI.elements;
        el.submitEditBtn.disabled = true;
        el.submitEditBtn.innerHTML = `<span class="spinner"></span> ${i18n.t('cl.saving')}`;

        try {
            const roomId = el.editRoomId.value;
            const allowedClasses = ClassroomUI.getEditSelectedClasses();

            const result = await ClassroomAPI.updateRoom(roomId, {
                title: el.editRoomTitle.value,
                description: el.editRoomDescription.value,
                allowed_classes: allowedClasses,
            });

            if (!result || !result.success) {
                UIModule.toast(result?.message || i18n.t('cl.saveFailed'), 'error');
                return;
            }

            UIModule.toast(i18n.t('cl.updateSuccess'), 'success');
            ClassroomUI.closeEditModal();
            await this._loadRooms();
        } catch (error) {
            console.error('Edit room error:', error);
            UIModule.toast(i18n.t('cl.updateError'), 'error');
        } finally {
            el.submitEditBtn.disabled = false;
            el.submitEditBtn.textContent = i18n.t('cl.save');
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
                const title = room ? `${room.title} ${i18n.t('cl.lessonPlan')}` : i18n.t('cl.newLessonPlan');
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
                    UIModule.toast(createJson.message || i18n.t('cl.createLessonPlanFailed'), 'error');
                }
            }
        } catch (e) {
            console.error('Open lesson plans error:', e);
            UIModule.toast(i18n.t('cl.openLessonPlanFailed'), 'error');
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    ClassroomApp.init();
});
