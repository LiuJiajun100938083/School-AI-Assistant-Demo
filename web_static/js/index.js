'use strict';

/**
 * 首頁（AI 學習夥伴）— 前端核心模組（精簡版）
 * ================================================
 *
 * 聊天功能已移至 /chat 頁面（chat.js），
 * 本檔案僅負責：登入、首頁應用導航、密碼修改。
 *
 * 架構：
 *   IndexAPI  — API 請求封裝
 *   IndexUI   — DOM 渲染 / 介面操作
 *   IndexApp  — 主控制器（狀態、事件、業務流程）
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 * 外部依賴:     GSAP（啟動動畫）
 */

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const IndexAPI = {

    /**
     * 通用請求封裝（附帶 JWT，自動處理 401）
     */
    async _fetch(url, options = {}) {
        const defaults = { headers: {} };
        const token = AuthModule.getToken();
        if (token) {
            defaults.headers['Authorization'] = `Bearer ${token}`;
        }
        // 非 FormData 時設置 Content-Type
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
            IndexApp._clearAuth();
            IndexUI.showLoginInterface();
            throw new Error('认证失效，请重新登录');
        }
        return resp;
    },

    async verify() {
        return this._fetch('/api/verify');
    },

    async login(username, password) {
        return this._fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
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

const IndexUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            // 登入
            loginContainer:      document.getElementById('loginContainer'),
            homeContainer:       document.getElementById('homeContainer'),
            loginForm:           document.getElementById('loginForm'),
            usernameInput:       document.getElementById('usernameInput'),
            passwordInput:       document.getElementById('passwordInput'),
            loginButton:         document.getElementById('loginButton'),
            loginError:          document.getElementById('loginError'),
            loginLoading:        document.getElementById('loginLoading'),

            // 密碼修改
            changePasswordModal: document.getElementById('changePasswordModal'),
            changePasswordForm:  document.getElementById('changePasswordForm'),
            oldPasswordInput:    document.getElementById('oldPasswordInput'),
            newPasswordInput:    document.getElementById('newPasswordInput'),
            confirmPasswordInput:document.getElementById('confirmPasswordInput'),
            passwordError:       document.getElementById('passwordError'),
            cancelPasswordChange:document.getElementById('cancelPasswordChange'),

            // 首頁
            homeAppsGrid:        document.getElementById('homeAppsGrid'),
            homeUserInfo:        document.getElementById('homeUserInfo'),
            homeUserAvatar:      document.getElementById('homeUserAvatar'),
            homeUserName:        document.getElementById('homeUserName'),
            homeUserClass:       document.getElementById('homeUserClass'),
            homeUserMenu:        document.getElementById('homeUserMenu'),
            homeAdminPanel:      document.getElementById('homeAdminPanel'),
            homeAdminSeparator:  document.getElementById('homeAdminSeparator'),

            // 啟動畫面
            splashScreen:        document.getElementById('splashScreen')
        };
    },

    /* ---------- 登入介面 ---------- */

    showLoginInterface() {
        const el = this.elements;
        el.loginContainer.style.display = 'flex';
        el.homeContainer.style.display = 'none';
        // 登出回到登入頁時，0.5 秒淡入
        if (typeof gsap !== 'undefined') {
            const bp = el.loginContainer.querySelector('.login-brand-panel');
            const fp = el.loginContainer.querySelector('.login-form-panel');
            gsap.set([bp, fp], { opacity: 1, x: 0 });
            gsap.fromTo(el.loginContainer, { opacity: 0 }, {
                opacity: 1, duration: 0.5, ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
                onComplete() { el.usernameInput.focus(); }
            });
        } else {
            el.usernameInput.focus();
        }
    },

    showLoginError(message) {
        const el = this.elements;
        el.loginError.textContent = message;
        el.loginError.style.display = 'block';
    },

    hideLoginError() {
        this.elements.loginError.style.display = 'none';
    },

    showLoginLoading(show) {
        const el = this.elements;
        el.loginLoading.style.display = show ? 'block' : 'none';
        el.loginButton.disabled = show;
        if (show) {
            el.loginButton.classList.add('is-loading');
        } else {
            el.loginButton.classList.remove('is-loading');
        }
    },

    /* ---------- 主介面 ---------- */

    showMainInterface() {
        const el = this.elements;
        el.loginContainer.style.display = 'none';
        el.homeContainer.style.display = 'flex';

        // 已登入用戶：0.5 秒淡入
        if (typeof gsap !== 'undefined') {
            gsap.fromTo(el.homeContainer,
                { opacity: 0 },
                { opacity: 1, duration: 0.5, ease: 'cubic-bezier(0.4, 0, 0.2, 1)' }
            );
        }
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

    // 分組配置：顯示名稱 + 排序權重 + 是否預設折疊
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

        // 按 category 分組
        const groups = {};
        for (const app of apps) {
            const cat = app.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(app);
        }

        // 按配置排序
        const sortedCats = Object.keys(groups).sort((a, b) => {
            const oa = (this._categoryConfig[a] || {}).order || 99;
            const ob = (this._categoryConfig[b] || {}).order || 99;
            return oa - ob;
        });

        // 渲染各分組
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

const IndexApp = {

    /* ---------- 狀態 ---------- */

    state: {
        authToken: null,
        currentUser: null,
        userInfo: null,
        userRole: 'student',
        isAdmin: false,
        isTeacher: false,
        allSubjects: {}
    },

    /* ---------- 初始化 ---------- */

    async init() {
        IndexUI.cacheElements();

        this.state.authToken = AuthModule.getToken();

        this._bindEvents();

        // 檢查認證狀態
        if (this.state.authToken) {
            await this._verifyToken();
        } else {
            IndexUI.showLoginInterface();
        }
    },

    /* ---------- 事件綁定 ---------- */

    _bindEvents() {
        const el = IndexUI.elements;

        // 登入
        el.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._login();
        });

        // 首頁用戶頭像選單
        if (el.homeUserInfo) {
            el.homeUserInfo.addEventListener('click', (e) => {
                const menu = el.homeUserMenu;
                if (menu) {
                    menu.classList.toggle('active');
                    e.stopPropagation();
                }
            });
        }

        // 首頁密碼修改
        const homeChangePasswordBtn = document.getElementById('homeChangePassword');
        if (homeChangePasswordBtn) {
            homeChangePasswordBtn.addEventListener('click', () => {
                IndexUI.showChangePasswordModal();
            });
        }

        // 首頁管理後台
        if (el.homeAdminPanel) {
            el.homeAdminPanel.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 首頁退出登入
        const homeLogoutBtn = document.getElementById('homeLogout');
        if (homeLogoutBtn) {
            homeLogoutBtn.addEventListener('click', () => this.logout());
        }

        // 點擊頁面空白處關閉首頁用戶選單
        document.addEventListener('click', () => {
            const menu = document.getElementById('homeUserMenu');
            if (menu) menu.classList.remove('active');
        });

        // 首頁應用卡片點擊（事件委託）
        if (el.homeAppsGrid) {
            el.homeAppsGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.home-app-card');
                if (!card) return;
                const appId = card.dataset.appId;
                const url = card.dataset.appUrl;
                this._openApp(appId, url);
            });
        }

        // 密碼修改
        el.changePasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleChangePassword();
        });
        el.cancelPasswordChange.addEventListener('click', () => IndexUI.hideChangePasswordModal());
    },

    /* ---------- 認證 ---------- */

    async _verifyToken() {
        try {
            const response = await IndexAPI.verify();
            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error('Token驗證失敗');
                const userProfile = result.data;
                this.state.currentUser = userProfile.username;
                this.state.userRole = userProfile.role || 'student';
                this.state.isAdmin = (this.state.userRole === 'admin');
                this.state.isTeacher = (this.state.userRole === 'teacher');

                IndexUI.showMainInterface();

                await this._loadSubjectOptions();

                this.state.userInfo = userProfile;
                this._loadHomeApps();
                IndexUI.updateHomeUserInfo(userProfile);
            } else {
                throw new Error('Token驗證失敗');
            }
        } catch (error) {
            console.error('Token驗證錯誤:', error);
            this._clearAuth();
            IndexUI.showLoginInterface();
        }
    },

    async _login() {
        const el = IndexUI.elements;
        const username = el.usernameInput.value.trim();
        const password = el.passwordInput.value;

        if (!username || !password) {
            IndexUI.showLoginError('請輸入用戶名和密碼');
            return;
        }

        IndexUI.showLoginLoading(true);
        IndexUI.hideLoginError();

        try {
            const response = await IndexAPI.login(username, password);
            const result = await response.json();

            if (response.ok && result.success) {
                this.state.authToken = result.access_token;
                this.state.currentUser = result.username;
                this.state.userRole = result.role;
                this.state.isAdmin = (result.role === 'admin');
                this.state.isTeacher = (result.role === 'teacher');

                AuthModule.setToken(this.state.authToken);
                localStorage.setItem('user_role', result.role);

                IndexUI.showMainInterface();

                await this._loadSubjectOptions();

                this.state.userInfo = result.user_info;
                this._loadHomeApps();
                IndexUI.updateHomeUserInfo(result.user_info);
            } else {
                IndexUI.showLoginError(result.detail || '登入失敗，請檢查用戶名和密碼');
            }
        } catch (error) {
            console.error('登入錯誤:', error);
            IndexUI.showLoginError('網絡錯誤，請稍後重試');
        } finally {
            IndexUI.showLoginLoading(false);
        }
    },

    logout() {
        this._clearAuth();
        IndexUI.showLoginInterface();
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
        const el = IndexUI.elements;
        const oldPassword = el.oldPasswordInput.value;
        const newPassword = el.newPasswordInput.value;
        const confirmPassword = el.confirmPasswordInput.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            el.passwordError.textContent = '请填写所有字段';
            return;
        }
        if (newPassword.length < 4) {
            el.passwordError.textContent = '新密码至少需要4个字符';
            return;
        }
        if (newPassword !== confirmPassword) {
            el.passwordError.textContent = '兩次輸入的新密碼不一致';
            return;
        }

        try {
            const response = await IndexAPI.changePassword(oldPassword, newPassword);
            const result = await response.json();
            if (response.ok && result.success) {
                alert('密碼修改成功！');
                IndexUI.hideChangePasswordModal();
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
            const response = await IndexAPI.fetchSubjects();
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
            'ces':         { code: 'ces',         name: 'CES (公民經濟與社會)', icon: '🏛️', description: '公民经济与社会' },
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
            const response = await IndexAPI.fetchApps();
            if (!response.ok) return;
            const data = await response.json();
            IndexUI.renderHomeApps(data.apps || []);
        } catch (error) {
            console.error('載入應用列表失敗:', error);
        }
    },

    _openApp(appId, url) {
        window.location.href = url;
    }
};

/* ============================================================
   企業級啟動動畫 + 名言輪播
   System Wake -> Interface Deployment -> Content Enter
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    const splashScreen   = document.getElementById('splashScreen');
    const glassPanel     = document.getElementById('glassPanel');
    const loginContainer = document.getElementById('loginContainer');
    if (!splashScreen || !loginContainer) return;

    // -- 統一 easing --
    const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

    // -- 已登入用戶：跳過全部動畫 --
    const hasToken = AuthModule && AuthModule.getToken && AuthModule.getToken();
    if (hasToken) {
        splashScreen.style.display = 'none';
        if (glassPanel) glassPanel.style.display = 'none';
        loginContainer.style.display = 'none';
        return;
    }

    // -- DOM 引用 --
    const splashContent = splashScreen.querySelector('.splash-content');
    const splashMascot  = splashScreen.querySelector('.splash-mascot');
    const splashTitle   = splashScreen.querySelector('.splash-title');
    const splashSub     = splashScreen.querySelector('.splash-subtitle');
    const loaderBar     = splashScreen.querySelector('.splash-loader-bar');
    const brandPanel    = loginContainer.querySelector('.login-brand-panel');
    const formPanel     = loginContainer.querySelector('.login-form-panel');
    const brandMascot   = loginContainer.querySelector('.brand-mascot');
    const brandWelcome  = loginContainer.querySelector('.brand-welcome');
    const brandAppName  = loginContainer.querySelector('.brand-app-name');
    const brandSchool   = loginContainer.querySelector('.brand-school');
    const brandQuote    = loginContainer.querySelector('.brand-quote');
    const loginCard     = loginContainer.querySelector('.login-card');
    const loginHeader   = loginContainer.querySelector('.login-header');
    const inputGroups   = loginContainer.querySelectorAll('.input-group');
    const loginButton   = loginContainer.querySelector('.login-button');

    /* ====================================================
       第一幕：系統喚醒（System Wake）~ 2.5s
       ==================================================== */
    const tl = gsap.timeline();

    tl
        // 小馬「點亮」：blur 6->0，opacity 0->1
        .to(splashMascot, {
            opacity: 1, filter: 'blur(0px)',
            duration: 1.2, ease: EASE
        }, 0.3)

        // 標題依序出現（blur -> 清晰）
        .to(splashTitle, {
            opacity: 1, filter: 'blur(0px)',
            duration: 0.6, ease: 'power2.out'
        }, 0.9)
        .to(splashSub, {
            opacity: 1, filter: 'blur(0px)',
            duration: 0.6, ease: 'power2.out'
        }, 1.1)

        // 載入細線：左->右掃過，再淡出
        .to(loaderBar, { x: '200%', duration: 1.0, ease: 'power2.inOut' }, 1.2)
        .to(loaderBar, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 2.0)

    /* ====================================================
       第二幕：空間展開（Interface Deployment）
       splash 整體淡出 -> 深綠遮罩 -> 登入頁面
       ==================================================== */

        // 提取小馬到 body 層
        .add(() => {
            const r = splashMascot.getBoundingClientRect();
            Object.assign(splashMascot.style, {
                position: 'fixed',
                left: r.left + 'px',
                top: r.top + 'px',
                width: r.width + 'px',
                height: 'auto',
                zIndex: '10001',
                pointerEvents: 'none',
                margin: '0',
                filter: 'blur(0px)'
            });
            document.body.appendChild(splashMascot);
        }, 2.5)

        // 深綠遮罩升起（蓋住 splash 背景）
        .to(glassPanel, { opacity: 1, duration: 0.5, ease: EASE }, 2.5)

        // splash 藏在遮罩後面直接移除
        .add(() => { splashScreen.style.display = 'none'; }, 2.9)

        // 準備登入容器（藏在遮罩後面）
        .add(() => {
            loginContainer.style.display = 'flex';
            gsap.set(loginContainer, { opacity: 1 });
            gsap.set(brandPanel, { opacity: 0 });
            gsap.set(formPanel, { opacity: 0 });
            gsap.set(brandMascot, { opacity: 0 });
            gsap.set([brandWelcome, brandAppName, brandSchool], { opacity: 0, y: 16, filter: 'blur(6px)' });
            gsap.set(brandQuote, { opacity: 0, y: 16 });
            gsap.set(loginHeader, { opacity: 0, y: 20 });
            gsap.set(inputGroups, { opacity: 0, y: 20 });
            gsap.set(loginButton, { opacity: 0, y: 20, scale: 0.98 });
        }, 2.95)

        // 遮罩淡去，露出登入頁面
        .to(glassPanel, {
            opacity: 0, duration: 0.6, ease: EASE,
            onComplete() { glassPanel.style.display = 'none'; }
        }, 3.0)
        .to(brandPanel, { opacity: 1, duration: 0.6, ease: EASE }, 3.05)
        .to(formPanel, { opacity: 1, duration: 0.6, ease: EASE }, 3.1)

    /* ====================================================
       第三幕：內容進入（Content Enter）
       小馬滑動 + 左側文字 + 右側表單
       ==================================================== */

        // 小馬滑向左側面板
        .add(() => {
            const target = brandMascot.getBoundingClientRect();
            const source = splashMascot.getBoundingClientRect();
            const dx = target.left + target.width / 2 - (source.left + source.width / 2);
            const dy = target.top + target.height / 2 - (source.top + source.height / 2);
            const s = target.width / source.width;

            gsap.to(splashMascot, {
                x: dx, y: dy, scale: s,
                duration: 0.7, ease: 'power3.inOut',
                onComplete() {
                    splashMascot.style.display = 'none';
                    gsap.set(brandMascot, { opacity: 1 });
                }
            });
        }, 3.2)

        // 左側文字依次出現（blur -> 清晰，stagger 0.12s）
        .to(brandWelcome, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out'
        }, 3.4)
        .to(brandAppName, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out'
        }, 3.52)
        .to(brandSchool, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.35, ease: 'power2.out'
        }, 3.64)
        .to(brandQuote, {
            opacity: 1, y: 0, duration: 0.4, ease: 'power2.out'
        }, 3.76)

        // 右側表單內容錯位入場（與左側並行）
        .to(loginHeader, {
            opacity: 1, y: 0, duration: 0.5, ease: 'power2.out'
        }, 3.4)
        .to(inputGroups, {
            opacity: 1, y: 0, duration: 0.5,
            stagger: 0.12, ease: 'power2.out'
        }, 3.55)
        .to(loginButton, {
            opacity: 1, y: 0, scale: 1, duration: 0.5, ease: EASE,
            onComplete() {
                document.getElementById('usernameInput')?.focus();
            }
        }, 3.8);

    /* ====================================================
       名人名言輪播（純 opacity，8 秒間隔）
       ==================================================== */
    const quotes = [
        { chinese: '「人工智慧是新的電力。」', english: 'AI is the new electricity.', author: 'Andrew Ng（吳恩達）' },
        { chinese: '「AI 是我們這個時代最強大的技術力量。」', english: 'AI is the most powerful technology force of our time.', author: 'Jensen Huang（黃仁勳）' },
        { chinese: '「AI 將改變每一個產業與每一個業務功能。」', english: 'AI will transform every industry and every business function.', author: 'Satya Nadella（微軟 CEO）' },
        { chinese: '「AI 最大的進步將來自讓它更加以人為中心。」', english: 'The greatest advances in AI will come from making it more human-centered.', author: 'Fei-Fei Li（李飛飛）' },
        { chinese: '「機器常常以驚人的方式讓我感到意外。」', english: 'Machines take me by surprise with great frequency.', author: 'Alan Turing（艾倫·圖靈）' },
        { chinese: '「AI 可能是人類迄今為止最重要的研究方向。」', english: 'AI is probably the most important thing humanity has ever worked on.', author: 'Bill Gates（比爾·蓋茲）' },
        { chinese: '「教育不是為生活做準備；教育本身就是生活。」', english: 'Education is not preparation for life; education is life itself.', author: 'John Dewey（約翰·杜威）' },
        { chinese: '「創造力在教育中與讀寫能力同樣重要。」', english: 'Creativity is as important in education as literacy.', author: 'Ken Robinson（肯·羅賓遜爵士）' },
        { chinese: '「教師最大的成功，是能說：孩子們學習時好像不再需要我了。」', english: "The greatest sign of success for a teacher is to be able to say, 'The children are now working as if I did not exist.'", author: 'Maria Montessori（蒙特梭利）' },
        { chinese: '「教育是一個自我組織系統，學習是一種自然湧現的現象。」', english: 'Education is a self-organizing system, where learning is an emergent phenomenon.', author: 'Sugata Mitra（米特拉教授）' }
    ];

    const quoteWrapper    = document.getElementById('quoteWrapper');
    const quoteIndicators = document.getElementById('quoteIndicators');
    if (!quoteWrapper || !quoteIndicators) return;

    let currentIdx = 0;
    let autoTimer  = null;

    // 生成 HTML
    quoteWrapper.innerHTML = quotes.map((q, i) =>
        `<div class="quote-item${i === 0 ? ' active' : ''}" data-index="${i}">
            <div class="quote-chinese">${q.chinese}</div>
            <div class="quote-english">${q.english}</div>
            <div class="quote-author">${q.author}</div>
        </div>`
    ).join('');

    quoteIndicators.innerHTML = quotes.map((_, i) =>
        `<div class="quote-indicator${i === 0 ? ' active' : ''}" data-index="${i}"></div>`
    ).join('');

    function switchQuote(next) {
        if (next === currentIdx) return;
        const items = quoteWrapper.querySelectorAll('.quote-item');
        const dots  = quoteIndicators.querySelectorAll('.quote-indicator');
        items[currentIdx].classList.remove('active');
        dots[currentIdx].classList.remove('active');
        currentIdx = next;
        items[currentIdx].classList.add('active');
        dots[currentIdx].classList.add('active');
    }

    function startAutoPlay() {
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = setInterval(() => {
            switchQuote((currentIdx + 1) % quotes.length);
        }, 8000);
    }

    quoteIndicators.addEventListener('click', (e) => {
        const dot = e.target.closest('.quote-indicator');
        if (!dot) return;
        switchQuote(parseInt(dot.dataset.index));
        startAutoPlay();
    });

    // 動畫結束後啟動輪播
    setTimeout(startAutoPlay, 5000);
});

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    IndexApp.init();
});

// 全局引用（向後兼容 HTML 中的 window.app 引用）
window.app = IndexApp;
