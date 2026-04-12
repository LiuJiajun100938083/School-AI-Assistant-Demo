'use strict';

/**
 * 首頁（AI 學習夥伴）— 前端核心模組
 * ====================================
 *
 * v4.0 — SaaS Flat Dashboard
 *
 * 架構：
 *   HomeAPI  — API 請求封裝
 *   HomeUI   — DOM 渲染 / 介面操作
 *   HomeApp  — 主控制器（狀態、事件、業務流程）
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 */

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const HomeAPI = {

    async _fetch(url, options = {}) {
        const defaults = { headers: {} };
        const token = AuthModule.getToken();
        if (token) {
            defaults.headers['Authorization'] = `Bearer ${token}`;
        }
        if (!(options.body instanceof FormData)) {
            defaults.headers['Content-Type'] = 'application/json';
        }
        const merged = {
            ...defaults,
            ...options,
            headers: { ...defaults.headers, ...options.headers }
        };
        let resp = await fetch(url, merged);
        if (resp.status === 401 && AuthModule.getRefreshToken()) {
            const refreshed = await AuthModule.refresh();
            if (refreshed) {
                merged.headers['Authorization'] = `Bearer ${AuthModule.getToken()}`;
                resp = await fetch(url, merged);
            }
        }
        if (resp.status === 401) {
            AuthModule.clearAll();
            window.location.href = '/login';
            throw new Error('Session expired');
        }
        return resp;
    },

    async verify() {
        return this._fetch('/api/verify');
    },

    async changePassword(oldPassword, newPassword) {
        return this._fetch('/api/change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
    },

    async fetchSubjects() {
        const token = AuthModule.getToken();
        const headers = { 'Authorization': `Bearer ${token}` };
        let resp = await fetch('/api/subjects', { headers });
        if (!resp.ok) {
            resp = await fetch('/api/admin/subjects', { headers });
        }
        return resp;
    },

    async fetchApps() {
        return this._fetch('/api/apps');
    }
};

/* ============================================================
   UI — DOM 渲染 / 介面操作
   ============================================================ */

const HomeUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            // 密碼修改
            changePasswordModal: document.getElementById('changePasswordModal'),
            changePasswordForm:  document.getElementById('changePasswordForm'),
            oldPasswordInput:    document.getElementById('oldPasswordInput'),
            newPasswordInput:    document.getElementById('newPasswordInput'),
            confirmPasswordInput:document.getElementById('confirmPasswordInput'),
            passwordError:       document.getElementById('passwordError'),
            cancelPasswordChange:document.getElementById('cancelPasswordChange'),

            // 首頁
            homeContainer:       document.getElementById('homeContainer'),
            homeAppsGrid:        document.getElementById('homeAppsGrid'),
            homeUserInfo:        document.getElementById('homeUserInfo'),
            homeUserAvatar:      document.getElementById('homeUserAvatar'),
            homeUserName:        document.getElementById('homeUserName'),
            homeUserClass:       document.getElementById('homeUserClass'),
            homeUserMenu:        document.getElementById('homeUserMenu'),
            homeAdminPanel:      document.getElementById('homeAdminPanel'),
            homeAdminSeparator:  document.getElementById('homeAdminSeparator'),

            // SaaS 新增
            homeSidebar:         document.getElementById('homeSidebar'),
            homeSidebarNav:      document.getElementById('homeSidebarNav'),
            homeFilterBar:       document.getElementById('homeFilterBar'),
            homeWelcome:         document.getElementById('homeWelcome'),
            homeWelcomeTitle:    document.getElementById('homeWelcomeTitle'),
            homeWelcomeStats:    document.getElementById('homeWelcomeStats'),
        };
    },

    /* ---------- 首頁用戶資訊 ---------- */

    updateHomeUserInfo(info) {
        if (!info) return;
        const avatar = info.display_name ? info.display_name.charAt(0).toUpperCase() : 'A';
        const map = {
            homeUserAvatar: avatar,
            homeUserName: info.display_name || info.username || i18n.t('home.defaultUser'),
            homeUserClass: info.class_name || i18n.t('home.defaultClass')
        };
        for (const [id, val] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
        // 管理員面板
        if (info.role === 'admin' || info.role === 'teacher') {
            const ap = this.elements.homeAdminPanel;
            const as = this.elements.homeAdminSeparator;
            if (ap) ap.style.display = '';
            if (as) as.style.display = '';
        }
    },

    /* ---------- 密碼修改模態框 ---------- */

    showChangePasswordModal() {
        this.elements.changePasswordModal.style.display = 'flex';
        this.elements.oldPasswordInput.focus();
    },

    hideChangePasswordModal() {
        const el = this.elements;
        el.changePasswordModal.style.display = 'none';
        el.changePasswordForm.reset();
        el.passwordError.textContent = '';
    },

    /* ---------- SVG 圖標映射 ---------- */

    _appIcons: {
        ai_chat:          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        ai_learning_center:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
        school_learning_center:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        game_center:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        forum:            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h8"/><path d="M8 14h4"/></svg>',
        student_report:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        learning_tasks:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        mistake_book:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        image_gen:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        classroom:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        attendance:       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>',
        notice:           '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        mistake_book_teacher:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
        learning_task_admin:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        game_upload:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
        assignment:       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M9 15l2 2 4-4"/></svg>',
        dictation:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        class_diary_review:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="9" y1="7" x2="16" y2="7"/><line x1="9" y1="11" x2="16" y2="11"/><line x1="9" y1="15" x2="13" y2="15"/></svg>',
        exam_creator:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>',
        admin_dashboard:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
        collab_board:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>',
        tool_qrcode:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><line x1="14" y1="14" x2="14" y2="17"/><line x1="17" y1="14" x2="17" y2="14.01"/><line x1="20" y1="14" x2="20" y2="17"/><line x1="14" y1="20" x2="17" y2="20"/><line x1="20" y1="20" x2="20" y2="20.01"/><line x1="17" y1="17" x2="17" y2="20"/></svg>',
        tool_image_convert:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/><path d="M12 5l3 3-3 3"/></svg>',
        tool_pdf_merge:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="15" y2="17"/><line x1="12" y1="11" x2="12" y2="19"/></svg>',
        tool_countdown:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><polyline points="12 9 12 13 14.5 14.5"/><line x1="9" y1="2" x2="15" y2="2"/><line x1="12" y1="2" x2="12" y2="4"/></svg>',
        tool_roll_call:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/></svg>',
    },

    /* ---------- 分組配置 ---------- */

    _categoryConfig: {
        learning:  { i18nKey: 'category.learning',  order: 1, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
        community: { i18nKey: 'category.community',  order: 2, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
        teaching:  { i18nKey: 'category.teaching',   order: 3, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
        utilities: { i18nKey: 'category.utilities',  order: 4, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>' },
        admin:     { i18nKey: 'category.system',     order: 5, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 0 1 0 4h-.09c-.658.003-1.25.396-1.51 1z"/></svg>' },
        other:     { i18nKey: 'category.other',      order: 6, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>' },
    },

    /* ---------- Sidebar 導航 ---------- */

    renderSidebarNav(apps) {
        const nav = this.elements.homeSidebarNav;
        if (!nav) return;

        const counts = {};
        for (const app of apps) {
            const cat = app.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        }

        const sortedCats = Object.keys(counts).sort((a, b) => {
            const oa = (this._categoryConfig[a] || {}).order || 99;
            const ob = (this._categoryConfig[b] || {}).order || 99;
            return oa - ob;
        });

        const allIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>';

        let html = `
            <div class="home-sidebar__item home-sidebar__item--active" data-sidebar-cat="all">
                <span class="home-sidebar__item-icon">${allIcon}</span>
                <span>${i18n.t('home.allApps')}</span>
                <span class="home-sidebar__item-count">${apps.length}</span>
            </div>`;

        for (const cat of sortedCats) {
            const cfg = this._categoryConfig[cat] || { i18nKey: null, icon: '' };
            const catLabel = cfg.i18nKey ? i18n.t(cfg.i18nKey) : cat;
            html += `
                <div class="home-sidebar__item" data-sidebar-cat="${cat}">
                    <span class="home-sidebar__item-icon">${cfg.icon || ''}</span>
                    <span>${catLabel}</span>
                    <span class="home-sidebar__item-count">${counts[cat]}</span>
                </div>`;
        }

        nav.innerHTML = html;
    },

    /* ---------- 手機 Filter Bar ---------- */

    renderFilterBar(apps) {
        const bar = this.elements.homeFilterBar;
        if (!bar) return;

        const counts = {};
        for (const app of apps) {
            const cat = app.category || 'other';
            counts[cat] = (counts[cat] || 0) + 1;
        }

        const sortedCats = Object.keys(counts).sort((a, b) => {
            const oa = (this._categoryConfig[a] || {}).order || 99;
            const ob = (this._categoryConfig[b] || {}).order || 99;
            return oa - ob;
        });

        let html = `<button class="home-filter-bar__tab home-filter-bar__tab--active" data-filter-cat="all">${i18n.t('home.all')}</button>`;
        for (const cat of sortedCats) {
            const cfg = this._categoryConfig[cat] || { i18nKey: cat };
            html += `<button class="home-filter-bar__tab" data-filter-cat="${cat}">${i18n.t(cfg.i18nKey)}</button>`;
        }
        bar.innerHTML = html;
    },

    /* ---------- Welcome 統計 ---------- */

    renderWelcomeStats(apps, userName) {
        const title = this.elements.homeWelcomeTitle;
        if (title && userName) {
            const welcomeText = i18n.t('home.welcomeUser', { name: userName });
            DecryptText.animate(title, welcomeText, {
                speed: 50,
                maxIterations: 8,
                sequential: true,
                revealDirection: 'start',
                className: 'decrypt-revealed',
                encryptedClassName: 'decrypt-scramble',
            });
        }

        const statsEl = this.elements.homeWelcomeStats;
        if (!statsEl) return;

        const catCount = new Set(apps.map(a => a.category)).size;
        statsEl.innerHTML = `
            <div class="home-stat">
                <div class="home-stat__value">${apps.length}</div>
                <div class="home-stat__label">${i18n.t('home.apps')}</div>
            </div>
            <div class="home-stat">
                <div class="home-stat__value">${catCount}</div>
                <div class="home-stat__label">${i18n.t('home.categories')}</div>
            </div>`;
    },

    /* ---------- 首頁應用卡片 ---------- */

    renderHomeApps(apps) {
        const grid = this.elements.homeAppsGrid;
        if (!grid) return;

        const groups = {};
        for (const app of apps) {
            const cat = app.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(app);
        }

        const sortedCats = Object.keys(groups).sort((a, b) => {
            const oa = (this._categoryConfig[a] || {}).order || 99;
            const ob = (this._categoryConfig[b] || {}).order || 99;
            return oa - ob;
        });

        let html = '';
        for (const cat of sortedCats) {
            const cfg = this._categoryConfig[cat] || { i18nKey: cat, order: 99, collapsed: false };
            const items = groups[cat];
            const isCollapsed = cfg.collapsed;

            html += `
                <div class="home-group" data-category="${cat}">
                    <div class="home-group__header${isCollapsed ? ' home-group__header--collapsed' : ''}"
                         data-toggle-group="${cat}">
                        <span class="home-group__label">${i18n.t(cfg.i18nKey)}</span>
                        <span class="home-group__count">${items.length}</span>
                        <svg class="home-group__chevron" width="14" height="14" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="home-group__grid${isCollapsed ? ' home-group__grid--collapsed' : ''}">
                        ${items.map(app => {
                            const icon = this._appIcons[app.id]
                                ? `<div class="tool-icon">${this._appIcons[app.id]}</div>`
                                : `<div class="tool-icon"><span class="home-app-card__emoji">${app.icon}</span></div>`;
                            const appName = i18n.t(`app.${app.id}`, null) !== `app.${app.id}` ? i18n.t(`app.${app.id}`) : app.name;
                            const appDesc = i18n.t(`app.${app.id}.desc`, null) !== `app.${app.id}.desc` ? i18n.t(`app.${app.id}.desc`) : app.description;
                            return `
                                <div class="home-app-card" data-app-id="${app.id}" data-app-url="${app.url}">
                                    ${icon}
                                    <div class="home-app-card__text">
                                        <div class="tool-name">${appName}</div>
                                        <div class="tool-desc">${appDesc}</div>
                                    </div>
                                </div>`;
                        }).join('')}
                    </div>
                </div>`;
        }
        grid.innerHTML = html;

        // 折疊切換
        grid.querySelectorAll('[data-toggle-group]').forEach(header => {
            header.addEventListener('click', () => {
                const groupEl = header.closest('.home-group');
                const gridEl = groupEl.querySelector('.home-group__grid');
                const isNowCollapsed = header.classList.toggle('home-group__header--collapsed');
                gridEl.classList.toggle('home-group__grid--collapsed', isNowCollapsed);
            });
        });
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const HomeApp = {

    state: {
        authToken: null,
        currentUser: null,
        userInfo: null,
        userRole: 'student',
        isAdmin: false,
        isTeacher: false,
        allSubjects: {}
    },

    async init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();
        HomeUI.cacheElements();

        this.state.authToken = AuthModule.getToken();
        this._bindEvents();

        // 沒有 access token 但有 refresh token → 先嘗試續期
        if (!this.state.authToken && AuthModule.getRefreshToken()) {
            const refreshed = await AuthModule.refresh();
            if (refreshed) this.state.authToken = AuthModule.getToken();
        }

        if (this.state.authToken) {
            await this._verifyToken();
            this._playSplashAnimation();
        } else {
            window.location.href = '/login';
        }
    },

    _bindEvents() {
        const el = HomeUI.elements;

        // 用戶頭像選單
        if (el.homeUserInfo) {
            el.homeUserInfo.addEventListener('click', (e) => {
                const menu = el.homeUserMenu;
                if (menu) {
                    menu.classList.toggle('active');
                    e.stopPropagation();
                }
            });
        }

        // 密碼修改
        const homeChangePasswordBtn = document.getElementById('homeChangePassword');
        if (homeChangePasswordBtn) {
            homeChangePasswordBtn.addEventListener('click', () => {
                HomeUI.showChangePasswordModal();
            });
        }

        // 管理後台
        if (el.homeAdminPanel) {
            el.homeAdminPanel.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 退出登入
        const homeLogoutBtn = document.getElementById('homeLogout');
        if (homeLogoutBtn) {
            homeLogoutBtn.addEventListener('click', () => this.logout());
        }

        // 點擊空白處關閉選單
        document.addEventListener('click', () => {
            const menu = document.getElementById('homeUserMenu');
            if (menu) menu.classList.remove('active');
        });

        // 應用卡片點擊（事件委託）
        if (el.homeAppsGrid) {
            el.homeAppsGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.home-app-card');
                if (!card) return;
                const appId = card.dataset.appId;
                const url = card.dataset.appUrl;
                this._openApp(appId, url);
            });
        }

        // 密碼修改表單
        el.changePasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleChangePassword();
        });
        el.cancelPasswordChange.addEventListener('click', () => HomeUI.hideChangePasswordModal());
    },

    /* ---------- 分類導航 ---------- */

    _bindCategoryNav() {
        // Sidebar 點擊
        const sidebarNav = document.getElementById('homeSidebarNav');
        if (sidebarNav) {
            sidebarNav.addEventListener('click', (e) => {
                const item = e.target.closest('.home-sidebar__item');
                if (!item) return;

                sidebarNav.querySelectorAll('.home-sidebar__item').forEach(
                    el => el.classList.remove('home-sidebar__item--active')
                );
                item.classList.add('home-sidebar__item--active');

                const cat = item.dataset.sidebarCat;
                this._filterByCategory(cat);
            });
        }

        // Filter bar 點擊 (手機)
        const filterBar = document.getElementById('homeFilterBar');
        if (filterBar) {
            filterBar.addEventListener('click', (e) => {
                const tab = e.target.closest('.home-filter-bar__tab');
                if (!tab) return;

                filterBar.querySelectorAll('.home-filter-bar__tab').forEach(
                    el => el.classList.remove('home-filter-bar__tab--active')
                );
                tab.classList.add('home-filter-bar__tab--active');

                const cat = tab.dataset.filterCat;
                this._filterByCategory(cat);
            });
        }
    },

    _filterByCategory(cat) {
        const groups = document.querySelectorAll('.home-group');
        const visible = [];
        groups.forEach(group => {
            const show = (cat === 'all') || (group.dataset.category === cat);
            group.style.display = show ? '' : 'none';
            if (show) visible.push(group);
            // remove animation class so we can re-trigger
            group.classList.remove('home-group--animate-in');
        });

        // Force reflow once to reset animations, then re-add the class with stagger
        // (use requestAnimationFrame so layout settles before animations start)
        if (visible.length > 0) {
            // Trigger reflow on first visible
            // eslint-disable-next-line no-unused-expressions
            void visible[0].offsetWidth;
            requestAnimationFrame(() => {
                visible.forEach((g, i) => {
                    g.style.setProperty('--home-stagger-delay', (i * 60) + 'ms');
                    g.classList.add('home-group--animate-in');
                });
            });
        }
    },

    /* ---------- 認證 ---------- */

    async _verifyToken() {
        try {
            const response = await HomeAPI.verify();
            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error(i18n.t('token.verifyFailed'));
                const userProfile = result.data;
                this.state.currentUser = userProfile.username;
                this.state.userRole = userProfile.role || 'student';
                this.state.isAdmin = (this.state.userRole === 'admin');
                this.state.isTeacher = (this.state.userRole === 'teacher');

                await this._loadSubjectOptions();

                this.state.userInfo = userProfile;
                this._loadHomeApps();
                HomeUI.updateHomeUserInfo(userProfile);

                // 加载宠物组件（admin 可见）
                if (this.state.isAdmin) {
                    this._loadHomePetWidget();
                }
            } else {
                throw new Error(i18n.t('token.verifyFailed'));
            }
        } catch (error) {
            console.error(i18n.t('token.verifyError') + ':', error);
            this._clearAuth();
            window.location.href = '/login';
        }
    },

    logout() {
        this._clearAuth();
        window.location.href = '/login';
    },

    _clearAuth() {
        this.state.authToken = null;
        this.state.currentUser = null;
        this.state.userInfo = null;
        this.state.isAdmin = false;
        AuthModule.clearAll();
    },

    /* ---------- 密碼修改 ---------- */

    async _handleChangePassword() {
        const el = HomeUI.elements;
        const oldPassword = el.oldPasswordInput.value;
        const newPassword = el.newPasswordInput.value;
        const confirmPassword = el.confirmPasswordInput.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            el.passwordError.textContent = i18n.t('password.emptyFields');
            return;
        }
        if (newPassword.length < 8) {
            el.passwordError.textContent = i18n.t('password.tooShort');
            return;
        }
        if (newPassword !== confirmPassword) {
            el.passwordError.textContent = i18n.t('password.mismatch');
            return;
        }

        try {
            const response = await HomeAPI.changePassword(oldPassword, newPassword);
            const result = await response.json();
            if (response.ok && result.success) {
                alert(i18n.t('password.success'));
                HomeUI.hideChangePasswordModal();
                AuthModule.clearAll();
                window.location.href = '/login';
                return;
            } else {
                el.passwordError.textContent = result.detail || i18n.t('password.failed');
            }
        } catch (error) {
            console.error(i18n.t('password.error') + ':', error);
            el.passwordError.textContent = i18n.t('common.networkError');
        }
    },

    /* ---------- 宠物组件（主页迷你版） ---------- */

    async _loadHomePetWidget() {
        try {
            var token = this.state.authToken;
            var res = await fetch('/api/pet/me', {
                headers: { 'Authorization': 'Bearer ' + token }
            });
            if (!res.ok) return;
            var data = await res.json();

            // sidebar 简要状态
            var widget = document.getElementById('homePetWidget');
            if (widget) {
                widget.style.display = 'block';
                if (!data.has_pet) {
                    widget.innerHTML =
                        '<div class="sidebar-pet-adopt" onclick="window.location=\'/pet\'">' +
                            '<div class="sidebar-pet-adopt__egg">\uD83E\uDD5A</div>' +
                            '<div class="sidebar-pet-adopt__text">\uD83D\uDC3E ' + i18n.t('pet.adopt') + '</div>' +
                        '</div>';
                    return;
                }
                var pet = data.pet;
                widget.innerHTML =
                    '<div class="sidebar-pet-card" onclick="window.location=\'/pet\'">' +
                        '<div class="sidebar-pet-name">' + (pet.pet_name || '') + '</div>' +
                        '<div class="sidebar-pet-stats">' +
                            '<span>\uD83C\uDF56 ' + pet.hunger + '</span>' +
                            '<span>\uD83E\uDDFC ' + pet.hygiene + '</span>' +
                            '<span>\uD83D\uDE0A ' + pet.mood + '</span>' +
                        '</div>' +
                        '<div class="sidebar-pet-coins">\uD83D\uDCB0 ' + pet.coins + '</div>' +
                    '</div>';
            }

            if (!data.has_pet) return;

            // 漫游桌面宠物
            this._initRoamingPet(data);
        } catch (e) {
            console.warn('Pet widget load failed:', e);
        }
    },

    _initRoamingPet(data) {
        var pet = data.pet;
        var floater = document.getElementById('roamingPet');
        var floatCanvas = document.getElementById('roamingPetCanvas');
        var infoEl = document.getElementById('roamingPetInfo');
        var bubbleEl = document.getElementById('roamingPetBubble');
        if (!floater || !floatCanvas || !window.PetRenderer) return;

        // sidebar 里的宠物 canvas（待在框里的状态）
        var sidebarWidget = document.getElementById('homePetWidget');
        var sidebarCard = sidebarWidget ? sidebarWidget.querySelector('.sidebar-pet-card') : null;

        // 在 sidebar 框里渲染宠物（初始状态）
        if (sidebarCard) {
            var sidebarCanvasHtml = '<canvas id="sidebarPetCanvas" width="256" height="256" style="width:100px;height:100px;image-rendering:pixelated;"></canvas>';
            sidebarCard.insertAdjacentHTML('afterbegin', sidebarCanvasHtml);
            var sidebarCanvas = document.getElementById('sidebarPetCanvas');
            if (sidebarCanvas) {
                this._sidebarRenderer = PetRenderer.create(sidebarCanvas, pet, { mini: true });
            }
        }

        // 浮动宠物初始隐藏（只有跑出来时显示）
        floater.style.display = 'none';
        if (infoEl) infoEl.textContent = pet.pet_name || '';
        var floatRenderer = PetRenderer.create(floatCanvas, pet, { mini: true });

        var isOut = false;  // 是否在外面漫游
        var currentX = 80;
        var roamTimer = null;
        var self = this;

        var bubbleMessages = [
            '\uD83D\uDCDA \u4E3B\u4EBA\u52A0\u6CB9!',
            '\u2728 \u4ECA\u5929\u4E5F\u8981\u52AA\u529B!',
            '\uD83D\uDE0A \u597D\u65E0\u804A~',
            '\uD83C\uDF1F \u6211\u597D\u5F00\u5FC3!',
            '\uD83D\uDCA4 \u6709\u70B9\u56F0...',
        ];

        function randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        // 从框里跑出来
        function comeOut() {
            if (isOut) return;
            isOut = true;

            // 隐藏 sidebar canvas
            var sc = document.getElementById('sidebarPetCanvas');
            if (sc) sc.style.display = 'none';

            // 计算 sidebar 框的位置作为起点
            var startX = 40;
            var startBottom = 60;
            if (sidebarCard) {
                var rect = sidebarCard.getBoundingClientRect();
                startX = rect.left;
                startBottom = window.innerHeight - rect.bottom + 10;
            }

            // 在起点显示浮动宠物（无 transition 先定位）
            floater.style.transition = 'none';
            floater.style.left = startX + 'px';
            floater.style.bottom = startBottom + 'px';
            floater.style.display = 'block';

            // 下一帧开启 transition 并走到目标位置
            requestAnimationFrame(function() {
                requestAnimationFrame(function() {
                    floater.style.transition = 'left 3s cubic-bezier(0.4,0,0.2,1), bottom 1s ease-out';
                    var targetX = randomInt(200, Math.max(400, window.innerWidth - 200));
                    floater.style.left = targetX + 'px';
                    floater.style.bottom = '10px';
                    currentX = targetX;
                    floatRenderer.setState('dance', 3000);
                });
            });

            // 开始漫游循环
            roamTimer = setTimeout(doRoam, randomInt(8000, 15000));
        }

        // 回到框里
        function goHome() {
            if (!isOut) return;

            // 走回 sidebar 位置
            var homeX = 40;
            if (sidebarCard) {
                homeX = sidebarCard.getBoundingClientRect().left;
            }

            var goingLeft = homeX < currentX;
            if (goingLeft) {
                floater.classList.add('home-roaming-pet--flip');
            } else {
                floater.classList.remove('home-roaming-pet--flip');
            }

            floater.style.transition = 'left 3s cubic-bezier(0.4,0,0.2,1), bottom 1s ease-out';
            floater.style.left = homeX + 'px';
            floatRenderer.setState('dance', 3000);

            // 3 秒后隐藏浮动宠物，显示 sidebar canvas
            setTimeout(function() {
                floater.style.display = 'none';
                floater.classList.remove('home-roaming-pet--flip');
                isOut = false;
                var sc = document.getElementById('sidebarPetCanvas');
                if (sc) sc.style.display = '';

                // 下次再出来
                roamTimer = setTimeout(comeOut, randomInt(15000, 30000));
            }, 3200);
        }

        // 漫游行为
        function doRoam() {
            if (!isOut) return;
            var actions = ['walk', 'walk', 'happy', 'goHome', 'idle'];
            var action = actions[randomInt(0, actions.length - 1)];

            if (action === 'walk') {
                var targetX = randomInt(150, Math.max(400, window.innerWidth - 150));
                var goingLeft = targetX < currentX;

                if (goingLeft) { floater.classList.add('home-roaming-pet--flip'); }
                else { floater.classList.remove('home-roaming-pet--flip'); }

                floater.style.left = targetX + 'px';
                currentX = targetX;
                floatRenderer.setState('dance', 3500);

            } else if (action === 'happy') {
                floatRenderer.setState('happy', 2000);
                if (Math.random() > 0.4 && bubbleEl) {
                    var msg = bubbleMessages[randomInt(0, bubbleMessages.length - 1)];
                    bubbleEl.textContent = msg;
                    bubbleEl.style.display = '';
                    setTimeout(function() { bubbleEl.style.display = 'none'; }, 3000);
                }

            } else if (action === 'goHome') {
                goHome();
                return; // goHome 会自己安排下次 comeOut

            } else {
                // idle
            }

            roamTimer = setTimeout(doRoam, randomInt(6000, 12000));
        }

        // 点击浮动宠物 → 只播放动画 + 冒气泡（不跳转）
        function onPetClick(e) {
            e.stopPropagation();
            e.preventDefault();
            var reactions = ['happy', 'pat', 'poke', 'tickle'];
            var anim = reactions[randomInt(0, reactions.length - 1)];
            floatRenderer.setState(anim, 1500);
            // 随机冒气泡
            if (bubbleEl) {
                var clickMsgs = [
                    '\uD83D\uDE0A \u563F\u563F~',           // 嘿嘿~
                    '\u2728 \u522B\u6233\u6211\u5566!',       // 别戳我啦!
                    '\uD83D\uDC96 \u559C\u6B22\u4E3B\u4EBA!', // 喜欢主人!
                    '\uD83C\uDF1F \u597D\u75D2\u597D\u75D2!', // 好痒好痒!
                    '\uD83D\uDE06 \u54C8\u54C8\u54C8!',       // 哈哈哈!
                ];
                bubbleEl.textContent = clickMsgs[randomInt(0, clickMsgs.length - 1)];
                bubbleEl.style.display = '';
                setTimeout(function() { bubbleEl.style.display = 'none'; }, 2500);
            }
        }
        floater.addEventListener('click', onPetClick);
        floatCanvas.addEventListener('click', onPetClick);
        floatCanvas.addEventListener('pointerdown', function(e) { e.stopPropagation(); });

        // 点击 sidebar 卡片也跳转
        if (sidebarCard) {
            sidebarCard.onclick = function() { window.location = '/pet'; };
        }

        // 页面不可见时暂停
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                if (roamTimer) { clearTimeout(roamTimer); roamTimer = null; }
            } else {
                if (!roamTimer) {
                    if (isOut) roamTimer = setTimeout(doRoam, randomInt(3000, 8000));
                    else roamTimer = setTimeout(comeOut, randomInt(5000, 15000));
                }
            }
        });

        // 初始：在框里待 10-20 秒后第一次出来
        roamTimer = setTimeout(comeOut, randomInt(10000, 20000));

        // 如果有消息，提前出来打招呼
        if (data.message) {
            clearTimeout(roamTimer);
            roamTimer = setTimeout(comeOut, 3000);
        }
    },

    /* ---------- 學科管理 ---------- */

    async _loadSubjectOptions() {
        try {
            const response = await HomeAPI.fetchSubjects();
            if (response.ok) {
                const data = await response.json();
                let subjectsMap = {};

                if (data && data.subjects && typeof data.subjects === 'object' && !Array.isArray(data.subjects)) {
                    for (const [code, subjectData] of Object.entries(data.subjects)) {
                        let icon = subjectData?.icon;
                        if (!icon && subjectData?.config) icon = subjectData.config.icon;
                        subjectsMap[code] = {
                            code,
                            name: subjectData?.name || code,
                            icon: icon || '📚',
                            description: subjectData?.description || subjectData?.config?.description || ''
                        };
                    }
                } else if (Array.isArray(data)) {
                    data.forEach(sd => {
                        if (!sd || !sd.code) return;
                        let icon = sd?.icon;
                        if (!icon && sd?.config) icon = sd.config.icon;
                        subjectsMap[sd.code] = {
                            code: sd.code,
                            name: sd?.name || sd.code,
                            icon: icon || '📚',
                            description: sd?.description || sd?.config?.description || ''
                        };
                    });
                } else if (Array.isArray(data?.subjects)) {
                    data.subjects.forEach(sd => {
                        if (!sd || !sd.code) return;
                        let icon = sd?.icon;
                        if (!icon && sd?.config) icon = sd.config.icon;
                        subjectsMap[sd.code] = {
                            code: sd.code,
                            name: sd?.name || sd.code,
                            icon: icon || '📚',
                            description: sd?.description || sd?.config?.description || ''
                        };
                    });
                }

                this.state.allSubjects = subjectsMap;

                if (Object.keys(this.state.allSubjects).length === 0) {
                    this._useDefaultSubjects();
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error(i18n.t('subject.loadFailed') + ':', error);
            this._useDefaultSubjects();
        }
    },

    _useDefaultSubjects() {
        const subjects = ['ict','ces','history','chinese','english','math','physics','chemistry','biology','science','economics','geography','va'];
        this.state.allSubjects = {};
        for (const code of subjects) {
            this.state.allSubjects[code] = {
                code,
                name: i18n.t(`subject.${code}`),
                icon: '📚',
                description: i18n.t(`subject.${code}.desc`)
            };
        }
    },

    _getSubjectInfo(subjectCode) {
        const subject = this.state.allSubjects[subjectCode];
        if (subject) {
            let icon = subject.icon;
            if (!icon && subject.config) icon = subject.config.icon;
            return {
                code: subjectCode,
                name: subject.name || subjectCode,
                icon: icon || '📚'
            };
        }
        return { code: subjectCode, name: subjectCode, icon: '📚' };
    },

    /* ---------- 首頁應用 ---------- */

    async _loadHomeApps() {
        try {
            const response = await HomeAPI.fetchApps();
            if (!response.ok) return;
            const data = await response.json();
            const apps = data.apps || [];

            HomeUI.renderHomeApps(apps);
            HomeUI.renderSidebarNav(apps);
            HomeUI.renderFilterBar(apps);
            HomeUI.renderWelcomeStats(
                apps,
                this.state.userInfo?.display_name || this.state.currentUser
            );

            this._bindCategoryNav();
        } catch (error) {
            console.error('Failed to load apps:', error);
        }
    },

    _openApp(appId, url) {
        window.location.href = url;
    },

    /* ---------- 啟動動畫 ---------- */

    _playSplashAnimation() {
        if (typeof gsap === 'undefined') {
            const splash = document.getElementById('splashScreen');
            if (splash) splash.style.display = 'none';
            return;
        }

        const splashScreen  = document.getElementById('splashScreen');
        const glassPanel    = document.getElementById('glassPanel');
        if (!splashScreen) return;

        const splashIcon   = splashScreen.querySelector('.splash-icon');
        const splashTitle  = splashScreen.querySelector('.splash-title');
        const splashSub    = splashScreen.querySelector('.splash-subtitle');
        const splashLoader = splashScreen.querySelector('.splash-loader');

        const header       = document.querySelector('.home-header');
        const sidebar      = document.querySelector('.home-sidebar');
        const welcome      = document.querySelector('.home-welcome');
        const appsGrid     = document.querySelector('.home-apps-grid');

        const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

        // 隱藏主界面元素
        gsap.set([header, sidebar, welcome, appsGrid].filter(Boolean), { opacity: 0 });

        const tl = gsap.timeline();

        tl
            // 第一幕：系統喚醒（全部同時出現）
            .to([splashIcon, splashTitle, splashSub].filter(Boolean), {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.35, ease: EASE
            }, 0.05)
            .to(splashLoader, { opacity: 1, duration: 0.15, ease: 'power2.out' }, 0.15)
            .to(splashLoader, { opacity: 0, duration: 0.15, ease: 'power2.in' }, 0.45)

            // 第二幕：過渡
            .to(glassPanel, { opacity: 1, duration: 0.15, ease: EASE }, 0.6)
            .add(() => { splashScreen.style.display = 'none'; }, 0.75)
            .add(() => {
                if (header)  gsap.set(header,  { opacity: 0, y: -10 });
                if (sidebar) gsap.set(sidebar, { opacity: 0, x: -10 });
                if (welcome) gsap.set(welcome, { opacity: 0, y: 10 });
                if (appsGrid) gsap.set(appsGrid, { opacity: 0, y: 10 });
            }, 0.75)
            .to(glassPanel, {
                opacity: 0, duration: 0.2, ease: EASE,
                onComplete() { glassPanel.style.display = 'none'; }
            }, 0.78)

            // 第三幕：界面元素同時進入
            .to([header, sidebar, welcome, appsGrid].filter(Boolean), {
                opacity: 1, y: 0, x: 0,
                duration: 0.25, ease: 'power2.out'
            }, 0.8);
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    HomeApp.init();
});

// 向後兼容
window.app = HomeApp;
