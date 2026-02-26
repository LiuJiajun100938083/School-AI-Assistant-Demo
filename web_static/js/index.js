'use strict';

/**
 * 首頁（AI 學習夥伴）— 前端核心模組
 * ====================================
 *
 * 僅負責：首頁應用導航、密碼修改。
 * 登入邏輯已獨立至 login.js。
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

    /**
     * 通用請求封裝（附帶 JWT，自動處理 401）
     */
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
        const resp = await fetch(url, merged);
        if (resp.status === 401) {
            AuthModule.removeToken();
            window.location.href = '/login';
            throw new Error('認證失效，請重新登入');
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
            homeAdminSeparator:  document.getElementById('homeAdminSeparator')
        };
    },

    /* ---------- 首頁用戶資訊 ---------- */

    updateHomeUserInfo(info) {
        if (!info) return;
        const avatar = info.display_name ? info.display_name.charAt(0).toUpperCase() : 'A';
        const map = {
            homeUserAvatar: avatar,
            homeUserName: info.display_name || info.username || '學生',
            homeUserClass: info.class_name || '未分班'
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

    /* ---------- 首頁應用卡片 ---------- */

    // SVG 圖標映射（Lucide 風格，24x24，2px stroke）
    _appIcons: {
        ai_chat:          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        ai_learning_center:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
        game_center:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        forum:            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h8"/><path d="M8 14h4"/></svg>',
        student_report:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
        learning_tasks:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        mistake_book:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        classroom:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
        attendance:       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M9 14l2 2 4-4"/></svg>',
        notice:           '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        mistake_book_teacher:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>',
        learning_task_admin:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        game_upload:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>',
        admin_dashboard:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>',
    },

    // 分組配置
    _categoryConfig: {
        learning:  { label: '學習工具',  order: 1, collapsed: false },
        community: { label: '社區',      order: 2, collapsed: false },
        teaching:  { label: '教學管理',  order: 3, collapsed: true  },
        admin:     { label: '系統管理',  order: 4, collapsed: true  },
        other:     { label: '其他',      order: 5, collapsed: true  },
    },

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
            const cfg = this._categoryConfig[cat] || { label: cat, order: 99, collapsed: true };
            const items = groups[cat];
            const isCollapsed = cfg.collapsed;

            html += `
                <div class="home-group" data-category="${cat}">
                    <div class="home-group__header${isCollapsed ? ' home-group__header--collapsed' : ''}"
                         data-toggle-group="${cat}">
                        <span class="home-group__label">${cfg.label}</span>
                        <span class="home-group__count">${items.length}</span>
                        <svg class="home-group__chevron" width="16" height="16" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="2"
                             stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="6 9 12 15 18 9"/>
                        </svg>
                    </div>
                    <div class="home-group__grid${isCollapsed ? ' home-group__grid--collapsed' : ''}">
                        ${items.map(app => {
                            const icon = this._appIcons[app.id] || `<span class="home-app-card__emoji">${app.icon}</span>`;
                            return `
                                <div class="home-app-card" data-app-id="${app.id}" data-app-url="${app.url}">
                                    <div class="tool-icon">${icon}</div>
                                    <div class="tool-name">${app.name}</div>
                                    <div class="tool-desc">${app.description}</div>
                                </div>`;
                        }).join('')}
                    </div>
                </div>`;
        }
        grid.innerHTML = html;

        // 綁定折疊切換事件
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
        HomeUI.cacheElements();

        this.state.authToken = AuthModule.getToken();
        this._bindEvents();

        if (this.state.authToken) {
            await this._verifyToken();
        } else {
            // 無 token，跳轉登入頁
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

    /* ---------- 認證 ---------- */

    async _verifyToken() {
        try {
            const response = await HomeAPI.verify();
            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error('Token驗證失敗');
                const userProfile = result.data;
                this.state.currentUser = userProfile.username;
                this.state.userRole = userProfile.role || 'student';
                this.state.isAdmin = (this.state.userRole === 'admin');
                this.state.isTeacher = (this.state.userRole === 'teacher');

                await this._loadSubjectOptions();

                this.state.userInfo = userProfile;
                this._loadHomeApps();
                HomeUI.updateHomeUserInfo(userProfile);
            } else {
                throw new Error('Token驗證失敗');
            }
        } catch (error) {
            console.error('Token驗證錯誤:', error);
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
        AuthModule.removeToken();
    },

    /* ---------- 密碼修改 ---------- */

    async _handleChangePassword() {
        const el = HomeUI.elements;
        const oldPassword = el.oldPasswordInput.value;
        const newPassword = el.newPasswordInput.value;
        const confirmPassword = el.confirmPasswordInput.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            el.passwordError.textContent = '請填寫所有欄位';
            return;
        }
        if (newPassword.length < 4) {
            el.passwordError.textContent = '新密碼至少需要4個字符';
            return;
        }
        if (newPassword !== confirmPassword) {
            el.passwordError.textContent = '兩次輸入的新密碼不一致';
            return;
        }

        try {
            const response = await HomeAPI.changePassword(oldPassword, newPassword);
            const result = await response.json();
            if (response.ok && result.success) {
                alert('密碼修改成功！');
                HomeUI.hideChangePasswordModal();
            } else {
                el.passwordError.textContent = result.detail || '密碼修改失敗';
            }
        } catch (error) {
            console.error('修改密碼錯誤:', error);
            el.passwordError.textContent = '網絡錯誤，請稍後重試';
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
            console.error('載入學科失敗:', error);
            this._useDefaultSubjects();
        }
    },

    _useDefaultSubjects() {
        this.state.allSubjects = {
            'ict':         { code: 'ict',         name: 'ICT (資訊及通訊科技)', icon: '💻', description: '資訊與通訊科技' },
            'ces':         { code: 'ces',         name: 'CES (公民經濟與社會)', icon: '🏛️', description: '公民經濟與社會' },
            'history':     { code: 'history',     name: '歷史 (History)',       icon: '📚', description: '歷史學科' },
            'chinese':     { code: 'chinese',     name: '中文',               icon: '📖', description: '中文語言文學' },
            'english':     { code: 'english',     name: '英文',               icon: '🔤', description: '英語語言文學' },
            'math':        { code: 'math',        name: '數學',               icon: '🔢', description: '數學學科' },
            'physics':     { code: 'physics',     name: '物理',               icon: '⚛️', description: '物理學科' },
            'chemistry':   { code: 'chemistry',   name: '化學',               icon: '🧪', description: '化學學科' },
            'biology':     { code: 'biology',     name: '生物',               icon: '🧬', description: '生物學科' },
            'science':     { code: 'science',     name: '科學',               icon: '🔬', description: '綜合科學' },
            'economics':   { code: 'economics',   name: '經濟',               icon: '💹', description: '經濟學科' },
            'geography':   { code: 'geography',   name: '地理',               icon: '🌍', description: '地理學科' },
            'visual_arts': { code: 'visual_arts', name: '視覺藝術',           icon: '🎨', description: '視覺藝術' }
        };
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
            HomeUI.renderHomeApps(data.apps || []);
        } catch (error) {
            console.error('載入應用列表失敗:', error);
        }
    },

    _openApp(appId, url) {
        window.location.href = url;
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    HomeApp.init();
});

// 向後兼容（部分頁面可能引用 window.app）
window.app = HomeApp;
