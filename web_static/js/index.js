'use strict';

/**
 * 首頁（校園AI助手）— 前端核心模組
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
        // 429 不視為認證失敗，直接返回讓調用方處理
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

    // ═══════════════════════════════════════════════════════════
    //   Editorial Engraved Icon Set  (Old Money × Apple)
    //   stroke-width: 1.5 on 24×24  ·  stroke-linecap: round
    //   Motifs: open book · compass rose · quill · seal · hourglass · laurel · scroll
    // ═══════════════════════════════════════════════════════════
    _appIcons: {
        // 對話 + 羽毛筆尖：AI chat as correspondence
        ai_chat:          '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h13a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H10l-4 3.2V16H4a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2z"/><path d="M8.5 10.2c.8-.3 1.4 .1 1.6 .7c.3 .8-.2 1.4-1 1.4"/><path d="M13.5 12.3c-.1-.9 .5-1.6 1.3-1.6"/></svg>',
        // 羅盤玫瑰：navigating knowledge
        ai_learning_center:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 7l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></svg>',
        // 拱廊圖書館：library facade with 3 arches
        school_learning_center:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20V10l9-6 9 6v10"/><path d="M7 20V14a2 2 0 0 1 2-2h1V20"/><path d="M14 20V12h1a2 2 0 0 1 2 2v6"/><path d="M2.5 20h19"/></svg>',
        // 遊戲：菱形 + 中央星
        game_center:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.5L21.5 12 12 21.5 2.5 12z"/><path d="M12 8l1.2 2.7 3 .3-2.3 2 0.7 3L12 14.5 9.4 16l0.7-3-2.3-2 3-0.3z"/></svg>',
        // 雙重對話泡泡：forum as salon
        forum:            '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h11a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H8l-3 2.5V14H3a2 2 0 0 1-2-2V6.5a2 2 0 0 1 2-2z"/><path d="M8 11.5h9a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-3.5l-2.5 2V20H8"/></svg>',
        // 折線圖 + 刻度：analytics报
        student_report:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3.5-4 3 2.5 4.5-6"/><circle cx="7" cy="14" r="0.8" fill="currentColor"/><circle cx="10.5" cy="10" r="0.8" fill="currentColor"/><circle cx="13.5" cy="12.5" r="0.8" fill="currentColor"/><circle cx="18" cy="6.5" r="0.8" fill="currentColor"/></svg>',
        // 清單 + 勾（優雅版）
        learning_tasks:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M8 8h8M8 12h5"/><path d="M14.5 14.5l1.8 1.8 3.7-4"/></svg>',
        // 開書：mistake journal（舊時代摘記本）
        mistake_book:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5c3-1 6-1 9 0v15c-3-1-6-1-9 0z"/><path d="M21 4.5c-3-1-6-1-9 0v15c3-1 6-1 9 0z"/><path d="M6 8.5h3M6 11.5h3M15 8.5h3M15 11.5h3"/></svg>',
        // 畫框 + 筆刷：image generation as fine art
        image_gen:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="17" height="13" rx="1"/><path d="M3.5 13l4-4 3.5 3 3-3 6.5 6.5"/><circle cx="9" cy="8" r="1.2"/><path d="M8 20.5h8"/><path d="M12 16.5v4"/></svg>',
        // 古典黑板 + 粉筆印記
        classroom:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="1"/><path d="M6 8.5c2 0 2-1 4-1s2 1 4 1 2-1 4-1"/><path d="M6 12.5h7"/><path d="M8.5 21l3.5-4 3.5 4"/></svg>',
        // 日曆 + 書票: attendance register
        attendance:       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5.5" width="17" height="15" rx="1"/><path d="M3.5 10h17"/><path d="M8 3.5v4M16 3.5v4"/><path d="M8 14.5l2 2 4-4"/></svg>',
        // 信封 + 封蠟印：official notice
        notice:           '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3.5 6l8.5 7 8.5-7"/><circle cx="18" cy="18" r="3"/><path d="M16.8 18l0.9 0.9L19.2 17"/></svg>',
        // 開書 + 圓鏡：teacher reviews mistakes
        mistake_book_teacher:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5c3-1 5-1 8 0v13c-3-1-5-1-8 0z"/><path d="M11 5c3-1 5-1 8 0v10"/><circle cx="17" cy="18" r="3"/><path d="M19.5 20.5l2 2"/></svg>',
        // 羅馬數字 I + 齒輪: admin for learning tasks
        learning_task_admin:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="14" height="18" rx="1.5"/><path d="M7 7h6M7 11h6M7 15h3"/><circle cx="18" cy="17" r="3.5"/><path d="M18 13.5v2M18 18.5v2M21 17h-2M17 17h-2"/></svg>',
        // 盒子 + 上箭頭：elegant upload
        game_upload:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8.5l8-4 8 4v10l-8 4-8-4z"/><path d="M4 8.5l8 4 8-4M12 12.5v8"/><path d="M12 2v6M9 5l3-3 3 3"/></svg>',
        // 卷軸：assignment as scroll
        assignment:       '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 5.5a2 2 0 1 1 4 0v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-13a2 2 0 1 0-4 0v1h-12"/><path d="M11 10h7M11 13h7M11 16h4"/></svg>',
        // 墨水瓶 + 羽毛筆：dictation
        dictation:        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18.5 3.5c-1 2-3 4-5 5l-8 8v3.5h3.5l8-8c1-2 3-4 5-5z"/><path d="M13 8l3 3"/><path d="M4 20h5"/></svg>',
        // 編年書：diary with date marker
        class_diary_review:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2z"/><path d="M4 18a2 2 0 0 1 2-2h14"/><path d="M8 7.5h5M8 10.5h5"/><path d="M16.5 7.5v2h2v-2z"/></svg>',
        // 文件 + 量尺：exam creator as typesetting
        exam_creator:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3.5h10l5 5v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1z"/><path d="M14 3.5v5h5"/><path d="M8 13h8M8 16h8M8 19h4"/><path d="M20 13v3M18.5 14.5h3"/></svg>',
        // 儀表盤刻度：admin dashboard
        admin_dashboard:  '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14a9 9 0 0 1 18 0"/><path d="M3 14h18"/><path d="M12 14v-3M12 7.5v1M7 9l0.7 1M17 9l-0.7 1"/><path d="M12 14l4-5"/><circle cx="12" cy="14" r="1" fill="currentColor"/></svg>',
        // 軟木板 + 圖釘：collab board
        collab_board:     '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3.5" width="18" height="17" rx="1"/><rect x="6" y="7" width="4.5" height="4.5"/><rect x="13.5" y="7" width="4.5" height="6.5"/><rect x="6" y="14" width="5.5" height="3"/><circle cx="12" cy="7" r="0.7" fill="currentColor"/></svg>',
        // QR 矩陣（簡約老錢）
        tool_qrcode:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5"/><rect x="13.5" y="3" width="7.5" height="7.5"/><rect x="3" y="13.5" width="7.5" height="7.5"/><rect x="15.5" y="15.5" width="1.5" height="1.5" fill="currentColor"/><rect x="18.5" y="13.5" width="1.5" height="1.5" fill="currentColor"/><rect x="18.5" y="18.5" width="1.5" height="1.5" fill="currentColor"/><rect x="13.5" y="18.5" width="1.5" height="1.5" fill="currentColor"/></svg>',
        // 兩畫框交換：image format convert
        tool_image_convert:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="9" height="9" rx="1"/><rect x="12.5" y="11.5" width="9" height="9" rx="1"/><circle cx="5.5" cy="6.5" r="0.9"/><path d="M2.5 10l3-3 3 3"/><path d="M14 10l3-1.5 3 1.5"/><path d="M12 4.5l3 3-3 3M15 7.5h-3"/></svg>',
        // 兩疊文件合併：pdf merge
        tool_pdf_merge:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5h5l2 2.5v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/><path d="M14 4.5h5l2 2.5v11a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1z"/><path d="M9 11h3"/><path d="M10.5 9.5v3"/></svg>',
        // 沙漏：最經典老錢計時器
        tool_countdown:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12M6 21h12"/><path d="M7 3c0 4 3 6 5 9-2 3-5 5-5 9"/><path d="M17 3c0 4-3 6-5 9 2 3 5 5 5 9"/><path d="M9 8c1 1 2 2 3 3 1-1 2-2 3-3"/></svg>',
        // 點名冊 + 勾
        tool_roll_call:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3.5" width="16" height="17" rx="1"/><path d="M8 8.5h4M8 12.5h4M8 16.5h4"/><path d="M15 7.5l1.5 1.5 2.5-2.5"/><path d="M15 11.5l1.5 1.5 2.5-2.5"/><path d="M15 15.5l1.5 1.5 2.5-2.5"/></svg>',
        // M 字母書頁：markdown reader (monogram M)
        tool_md_reader:   '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5a2 2 0 0 1 2-2h14v19H6a2 2 0 0 1-2-2z"/><path d="M4 18a2 2 0 0 1 2-2h14"/><path d="M8 14V8.5l2.5 3 2.5-3V14M15.5 14V8.5"/></svg>',
        // 筆 + ∑：handwriting math
        tool_handwriting_math:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 16l5-5 2 2-5 5H4z"/><path d="M11 9l7-7 3 3-7 7"/><path d="M15 5l3 3"/><path d="M4 20l2-1 2 1"/><path d="M14 15l3 3 3-3M14 15h6"/></svg>',
        // 桂冠：pet teacher (laurel crown)
        pet_teacher:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11c0-5 2.5-8 8-8s8 3 8 8c0 4-3 6.5-8 6.5s-8-2.5-8-6.5z"/><path d="M6 8c1.5 0 2.5 1 3 2.5M18 8c-1.5 0-2.5 1-3 2.5"/><path d="M12 17v4M10 19l2 2 2-2"/></svg>',
        // 星盾：pet hero crest
        pet:              '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5l8-2 8 2V13c0 5-4 7.5-8 8.5-4-1-8-3.5-8-8.5z"/><path d="M12 8l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.7-3 1.7.6-3.3-2.4-2.3 3.3-.4z"/></svg>',
        // 圓規：laser engrave / drafting
        tool_laser_engrave:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="4.5" r="1.5"/><path d="M12 6l-5 13"/><path d="M12 6l5 13"/><circle cx="7" cy="19" r="1.2"/><circle cx="17" cy="19" r="1.2"/><path d="M7.5 18l8.5 0"/></svg>',
        // 鋼筆勾號：exam grader (red pen check)
        exam_grader:      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="14" height="17" rx="1"/><path d="M7 8h7M7 11h5"/><path d="M8 15l2 2 5-5"/><path d="M18 3.5l3 3-6 6h-3v-3z"/></svg>',
    },

    /* ---------- 分組配置 ---------- */

    // Category icons — 16×16 engraved line art (mirrors app icon language)
    _categoryConfig: {
        // 雙書頁
        learning:  { i18nKey: 'category.learning',  order: 1, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 5c3-1 6-1 9 0v14c-3-1-6-1-9 0z"/><path d="M21 5c-3-1-6-1-9 0v14c3-1 6-1 9 0z"/><path d="M6 9h3M6 12h3M15 9h3M15 12h3"/></svg>' },
        // 三位議事剪影
        community: { i18nKey: 'category.community',  order: 2, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="7" r="3.2"/><circle cx="5" cy="9.5" r="2.3"/><circle cx="19" cy="9.5" r="2.3"/><path d="M3 18c0-3 1.5-4.5 4-4.5M21 18c0-3-1.5-4.5-4-4.5"/><path d="M6.5 20c0-3.5 2-5.5 5.5-5.5s5.5 2 5.5 5.5"/></svg>' },
        // 黑板 + 基座
        teaching:  { i18nKey: 'category.teaching',   order: 3, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="3.5" width="19" height="13" rx="1"/><path d="M6 8c2 0 2-1 4-1s2 1 4 1 2-1 4-1"/><path d="M6 12h7"/><path d="M9 21l3-3.5 3 3.5"/></svg>' },
        // 羅馬鑰匙：utilities
        utilities: { i18nKey: 'category.utilities',  order: 4, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="7" r="4"/><circle cx="7" cy="7" r="1.2"/><path d="M10 10l11 11"/><path d="M14 14l2-2 2 2M18 18l2-2 2 2"/></svg>' },
        // 盾徽：admin/system
        admin:     { i18nKey: 'category.system',     order: 5, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4.5l8-2 8 2V13c0 5-4 7.5-8 8.5-4-1-8-3.5-8-8.5z"/><path d="M12 8l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.7-3 1.7.6-3.3-2.4-2.3 3.3-.4z"/></svg>' },
        // 裝飾方格：other (tessellation)
        other:     { i18nKey: 'category.other',      order: 6, collapsed: false, icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/><circle cx="6.75" cy="6.75" r="0.6" fill="currentColor"/><circle cx="17.25" cy="6.75" r="0.6" fill="currentColor"/><circle cx="6.75" cy="17.25" r="0.6" fill="currentColor"/><circle cx="17.25" cy="17.25" r="0.6" fill="currentColor"/></svg>' },
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

        // "All" category — ornamented 4-petal rosette with centre dot (old money monogram)
        const allIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><path d="M12 3v5M12 16v5M3 12h5M16 12h5"/><path d="M6 6l3 3M18 6l-3 3M6 18l3-3M18 18l-3-3"/></svg>';

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
                        <svg class="home-group__chevron" width="12" height="12" viewBox="0 0 24 24"
                             fill="none" stroke="currentColor" stroke-width="1.5"
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

function _esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
            // 動畫與數據加載並行，不阻塞
            const dataReady = this._verifyToken();
            await this._playSplashAnimation(dataReady);
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

            // 429 = 限流，不代表 token 失效，不應清除登入狀態
            if (response.status === 429) {
                console.warn('[HomeApp] 驗證請求被限流，保留登入狀態');
                // 嘗試等待後重試一次
                const retryAfter = parseInt(response.headers.get('Retry-After') || '3', 10);
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                const retry = await HomeAPI.verify();
                if (retry.ok) {
                    const result = await retry.json();
                    if (result.success) return this._applyUserProfile(result.data);
                }
                // 重試仍失敗，但 token 可能有效，先載入基礎頁面
                this._loadHomeApps();
                return;
            }

            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error(i18n.t('token.verifyFailed'));
                this._applyUserProfile(result.data);
            } else {
                throw new Error(i18n.t('token.verifyFailed'));
            }
        } catch (error) {
            console.error(i18n.t('token.verifyError') + ':', error);
            this._clearAuth();
            window.location.href = '/login';
        }
    },

    /** 驗證成功後套用用戶資料 */
    _applyUserProfile(userProfile) {
        this.state.currentUser = userProfile.username;
        this.state.userRole = userProfile.role || 'student';
        this.state.isAdmin = (this.state.userRole === 'admin');
        this.state.isTeacher = (this.state.userRole === 'teacher');
        this.state.userInfo = userProfile;

        this._loadSubjectOptions();
        this._loadHomeApps();
        HomeUI.updateHomeUserInfo(userProfile);
        this._loadHomePetWidget();
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

            var widget = document.getElementById('homePetWidget');
            if (!widget) return;
            widget.style.display = 'block';

            // ── 状态 A：无宠物 → 像素蛋 + 领养按钮 ──
            if (!data.has_pet) {
                widget.innerHTML =
                    '<div class="sidebar-pet-adopt" onclick="window.location=\'/pet\'">' +
                        '<div class="sidebar-pet-adopt__egg">' +
                            '<canvas id="sidebarEggCanvas" width="256" height="256"></canvas>' +
                        '</div>' +
                        '<div class="sidebar-pet-adopt__text">\uD83D\uDC3E ' + i18n.t('pet.adopt') + '</div>' +
                    '</div>';
                var eggCanvas = document.getElementById('sidebarEggCanvas');
                if (eggCanvas && window.PetRenderer) {
                    var eggData = { color_id: 12, body_type: 0, eyes_id: 0, ears_id: 8, tail_id: 7, stage: 'egg', hunger: 100, hygiene: 100 };
                    PetRenderer.create(eggCanvas, eggData, { mini: true });
                }
                this._showPetIntroBubble('egg');
                return;
            }

            var pet = data.pet;

            // ── 状态 B：宠物还在蛋阶段 → 像素蛋 + 宠物名 ──
            if (pet.stage === 'egg') {
                widget.innerHTML =
                    '<div class="sidebar-pet-adopt" onclick="window.location=\'/pet\'">' +
                        '<div class="sidebar-pet-adopt__egg">' +
                            '<canvas id="sidebarEggCanvas" width="256" height="256"></canvas>' +
                        '</div>' +
                        '<div class="sidebar-pet-adopt__text">' + _esc(pet.pet_name || '') + '</div>' +
                    '</div>';
                var eggCanvas = document.getElementById('sidebarEggCanvas');
                if (eggCanvas && window.PetRenderer) {
                    var eggData = {
                        color_id: pet.color_id || 0, body_type: 0, eyes_id: 0,
                        ears_id: 8, tail_id: 7, stage: 'egg', hunger: 100, hygiene: 100
                    };
                    PetRenderer.create(eggCanvas, eggData, { mini: true });
                }
                return;
            }

            // ── 状态 C：宠物升到幼年但还没破壳 → 破壳仪式 ──
            if (localStorage.getItem('pet_needs_hatch')) {
                widget.innerHTML =
                    '<div class="sidebar-pet-adopt" id="sidebarHatchCard">' +
                        '<div class="sidebar-pet-adopt__egg">' +
                            '<canvas id="sidebarHatchCanvas" width="256" height="256"></canvas>' +
                        '</div>' +
                        '<div class="sidebar-pet-adopt__text" id="sidebarHatchHint">\uD83E\uDD5A \u70B9\u51FB\u7834\u58F3\uFF01</div>' +
                    '</div>';

                this._showHatchPopup();

                var hatchCanvas = document.getElementById('sidebarHatchCanvas');
                if (hatchCanvas && window.PetRenderer) {
                    var hatchEggData = {
                        color_id: pet.color_id || 0, body_type: pet.body_type || 0,
                        eyes_id: pet.eyes_id || 0, ears_id: pet.ears_id || 0,
                        tail_id: pet.tail_id || 0, stage: 'egg',
                        hunger: 100, hygiene: 100
                    };
                    var hatchRenderer = PetRenderer.create(hatchCanvas, hatchEggData, { mini: true });
                    var self = this;

                    document.getElementById('sidebarHatchCard').onclick = function () {
                        if (!hatchRenderer) return;
                        var hatched = hatchRenderer.crackEgg();
                        var hint = document.getElementById('sidebarHatchHint');
                        var level = hatchRenderer.getEggCrackLevel();

                        if (level === 1 && hint) hint.textContent = '\u26A1 \u518D\u70B9\u4E00\u6B21\uFF01';
                        else if (level === 2 && hint) hint.textContent = '\u26A1 \u5FEB\u8981\u7834\u58F3\u4E86\uFF01';

                        if (hatched) {
                            if (hint) hint.textContent = '\u2728 \u5B9D\u5B9D\u8BDE\u751F\u4E86\uFF01';
                            setTimeout(function () {
                                localStorage.removeItem('pet_needs_hatch');
                                hatchRenderer.destroy();
                                hatchRenderer = null;
                                var popup = document.getElementById('petHatchPopup');
                                if (popup) popup.remove();
                                self._loadHomePetWidget();
                            }, 2500);
                        }
                    };
                }
                return;
            }

            // ── 状态 D：正常宠物卡片 ──
            widget.innerHTML =
                '<div class="sidebar-pet-card" onclick="window.location=\'/pet\'">' +
                    '<div class="sidebar-pet-name">' + _esc(pet.pet_name || '') + '</div>' +
                    '<div class="sidebar-pet-stats">' +
                        '<span>\uD83C\uDF56 ' + pet.hunger + '</span>' +
                        '<span>\uD83E\uDDFC ' + pet.hygiene + '</span>' +
                        '<span>\uD83D\uDE0A ' + pet.mood + '</span>' +
                    '</div>' +
                    '<div class="sidebar-pet-coins">\uD83D\uDCB0 ' + pet.coins + '</div>' +
                '</div>';

            if (!localStorage.getItem('pet_intro_seen')) {
                this._showPetIntroBubble('intro');
            }

            this._initRoamingPet(data);
        } catch (e) {
            console.warn('Pet widget load failed:', e);
        }
    },

    _showPetIntroBubble(type) {
        // 避免重复显示
        if (document.getElementById('petIntroBubble')) return;

        var isZh = !window.i18n || i18n.isZh !== false;

        var messages = {
            egg: {
                title: isZh ? '🥚 嘿！我在这裡！' : '🥚 Hey! I\'m here!',
                lines: isZh ? [
                    '🐾 我是你的專屬寵物精靈',
                    '📚 完成學習任務可以賺金幣',
                    '🛒 金幣可以買食物養我長大',
                    '🏆 和同學比比誰養得最好！',
                    '',
                    '👈 點擊左邊領養我吧！'
                ] : [
                    '🐾 I\'m your virtual pet!',
                    '📚 Earn coins by learning',
                    '🛒 Buy food to grow me',
                    '🏆 Compete with classmates!',
                    '',
                    '👈 Click left to adopt me!'
                ]
            },
            intro: {
                title: isZh ? '💡 你知道嗎？' : '💡 Did you know?',
                lines: isZh ? [
                    '🍖 記得餵我吃東西哦~',
                    '📚 默寫、做題、玩遊戲都能賺金幣',
                    '🧼 用金幣買清潔用品幫我洗澡',
                    '🔥 連續學習天數越多，金幣加倍！',
                    '💬 點我還可以跟我聊天～'
                ] : [
                    '🍖 Remember to feed me!',
                    '📚 Earn coins from quizzes & games',
                    '🧼 Buy soap to keep me clean',
                    '🔥 Streak = coin multiplier!',
                    '💬 Click me to chat!'
                ]
            }
        };

        var msg = messages[type] || messages.intro;

        var bubble = document.createElement('div');
        bubble.id = 'petIntroBubble';
        bubble.className = 'pet-intro-bubble';
        bubble.innerHTML =
            '<div class="pet-intro-bubble__close" id="petIntroBubbleClose">&times;</div>' +
            '<div class="pet-intro-bubble__title">' + msg.title + '</div>' +
            '<div class="pet-intro-bubble__body">' +
                msg.lines.map(function(l) { return l ? '<div>' + l + '</div>' : '<div style="height:4px;"></div>'; }).join('') +
            '</div>';

        // 用 fixed 定位到 sidebar pet widget 附近（避免被 overflow 裁掉）
        var widget = document.getElementById('homePetWidget');
        bubble.style.position = 'fixed';
        bubble.style.left = '8px';
        bubble.style.width = '180px';
        bubble.style.zIndex = '60';

        if (widget) {
            var rect = widget.getBoundingClientRect();
            bubble.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
            bubble.style.left = rect.left + 'px';
            bubble.style.width = Math.max(180, rect.width) + 'px';
        } else {
            bubble.style.bottom = '120px';
        }

        document.body.appendChild(bubble);

        // 关闭按钮
        document.getElementById('petIntroBubbleClose').onclick = function(e) {
            e.stopPropagation();
            bubble.style.animation = 'petIntroOut 0.2s ease-in forwards';
            setTimeout(function() { bubble.remove(); }, 250);
            localStorage.setItem('pet_intro_seen', '1');
        };

        // 15 秒后自动消失
        setTimeout(function() {
            if (bubble.parentElement) {
                bubble.style.animation = 'petIntroOut 0.3s ease-in forwards';
                setTimeout(function() { bubble.remove(); }, 350);
                localStorage.setItem('pet_intro_seen', '1');
            }
        }, 15000);
    },

    _showHatchPopup() {
        if (document.getElementById('petHatchPopup')) return;

        var isZh = !window.i18n || i18n.isZh !== false;
        var text = isZh
            ? '\u4F60\u7684\u5BA0\u7269\u51C6\u5907\u597D\u7834\u58F3\u4E86\uFF01\u70B9\u51FB\u51E0\u4E0B\u5C31\u80FD\u89C1\u5230\u5B83\u5566\uFF01'
            : 'Your pet is ready to hatch! Click a few times to meet it!';

        var popup = document.createElement('div');
        popup.id = 'petHatchPopup';
        popup.className = 'pet-hatch-popup';
        popup.innerHTML = '<div class="pet-hatch-popup__text">\uD83E\uDD5A ' + text + '</div>';

        var widget = document.getElementById('homePetWidget');
        popup.style.position = 'fixed';
        popup.style.left = '8px';
        popup.style.width = '180px';

        if (widget) {
            var rect = widget.getBoundingClientRect();
            popup.style.bottom = (window.innerHeight - rect.top + 8) + 'px';
            popup.style.left = rect.left + 'px';
            popup.style.width = Math.max(180, rect.width) + 'px';
        } else {
            popup.style.bottom = '120px';
        }

        document.body.appendChild(popup);

        setTimeout(function () {
            if (popup.parentElement) {
                popup.style.animation = 'petIntroOut 0.3s ease-in forwards';
                setTimeout(function () { popup.remove(); }, 350);
            }
        }, 8000);
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

        // ── 分类消息系统（60+ 条）──
        var PET_MESSAGES = {
            morning:   ['☀️ 早安！新的一天加油！','🌅 早上好～今天也要努力哦！','📖 早读时间到！一起学习吧！','🥛 吃过早餐了吗？','🌤️ 美好的一天开始啦～'],
            afternoon: ['☀️ 下午好～别打瞌睡哦！','📚 下午也要认真学习！','🍵 喝点水休息一下吧～','💪 下午的课也要加油！','🌻 午后时光真好～'],
            evening:   ['🌙 晚上好～作业写完了吗？','✨ 晚安前记得复习哦！','🌟 今天辛苦啦！','📝 睡前回顾一下今天学的吧～','💤 别太晚睡哦！'],
            night:     ['🌙 这么晚了还没睡呀？','💤 早点休息，明天才有精神！','🛏️ 该睡觉啦，晚安～'],
            hungry:    ['🍕 好饿...想吃东西...','🍔 肚子咕咕叫了～','🍖 喂我吃东西嘛！','😢 饿得没力气了...'],
            dirty:     ['🫧 我需要洗澡澡～','🧼 感觉身上脏脏的...','🚿 帮我洗个澡吧！','😣 好想泡个热水澡...'],
            sadMood:   ['😢 好无聊，陪我玩嘛...','😔 今天心情不太好...','🥺 摸摸我嘛...','😿 好想要人陪...'],
            happyMood: ['🎉 我好开心！','❤️ 有你真好！','😆 嘻嘻，今天超棒的！','🌈 心情好好～想跳舞！','✨ 幸福满满！'],
            study:     ['📚 写完作业了吗？','✏️ 今天的功课要加油哦！','📖 一起来复习吧！','🧠 多动脑筋，越来越聪明！','📝 不懂的题目要问老师哦！','💡 学习就像闯关！','🏆 坚持就是胜利！','📊 错题记得整理哦！','🎯 今天的学习目标完成了吗？','🌟 每天进步一点点！'],
            streak:    ['🔥 连续打卡好厉害！','📅 坚持学习，继续加油！','💪 连续签到中，别断了哦！'],
            general:   ['😊 嘿嘿～','🌟 今天天气真好！','🎵 哼哼哼～','🐾 在做什么呀？','💭 在发呆中...','🎈 无聊无聊～'],
        };
        var _lastPick = {};

        function randomInt(min, max) {
            return Math.floor(Math.random() * (max - min + 1)) + min;
        }

        function pickRoamMessage() {
            var hour = new Date().getHours();
            var pool = [];
            // 状态紧急
            if (pet.hunger < 40)  pool.push({cat:'hungry',  anim:'sad',   w:5});
            if (pet.hygiene < 40) pool.push({cat:'dirty',   anim:'sad',   w:5});
            if (pet.mood < 40)    pool.push({cat:'sadMood', anim:'sad',   w:5});
            // 快乐
            if (pet.mood >= 80)   pool.push({cat:'happyMood',anim:'happy',w:3});
            // 连续打卡
            var sk = (data.streak && data.streak.current_streak) || 0;
            if (sk >= 3)          pool.push({cat:'streak',  anim:'happy', w:2});
            // 时段
            var tc = hour < 6 ? 'night' : hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
            pool.push({cat:tc,    anim:'idle', w:3});
            pool.push({cat:'study',  anim:'idle', w:3});
            pool.push({cat:'general',anim:'idle', w:1});

            // 加权随机
            var total = pool.reduce(function(s,p){return s+p.w;},0);
            var r = Math.random() * total, acc = 0, chosen = pool[pool.length-1];
            for (var i=0;i<pool.length;i++){acc+=pool[i].w;if(r<acc){chosen=pool[i];break;}}

            // 避免连续重复
            var msgs = PET_MESSAGES[chosen.cat];
            var idx = randomInt(0, msgs.length - 1);
            if (_lastPick[chosen.cat] === idx && msgs.length > 1) idx = (idx + 1) % msgs.length;
            _lastPick[chosen.cat] = idx;

            return {text: msgs[idx], anim: chosen.anim, dur: 3000};
        }

        // ── 侧边栏卡片内随机动画 ──
        var sidebarAnimTimer = null;
        var sidebarRenderer = self._sidebarRenderer;
        var sidebarAnims = [
            {anim:'happy',  dur:2000},
            {anim:'dance',  dur:2500},
            {anim:'tickle', dur:1200},
            {anim:'pat',    dur:1200},
            {anim:'poke',   dur:800},
            {anim:'eat',    dur:2000},
            {anim:'sleep',  dur:2500},
        ];
        function sidebarIdleLoop() {
            if (isOut || !sidebarRenderer) return;
            var a = sidebarAnims[randomInt(0, sidebarAnims.length - 1)];
            sidebarRenderer.setState(a.anim, a.dur);
            sidebarAnimTimer = setTimeout(sidebarIdleLoop, a.dur + randomInt(4000, 10000));
        }
        sidebarAnimTimer = setTimeout(sidebarIdleLoop, randomInt(3000, 8000));

        // ── 从框里跑出来 ──
        function comeOut() {
            if (isOut) return;
            isOut = true;
            if (sidebarAnimTimer) { clearTimeout(sidebarAnimTimer); sidebarAnimTimer = null; }

            var sc = document.getElementById('sidebarPetCanvas');
            if (sc) sc.style.display = 'none';

            var startX = 40, startBottom = 60;
            if (sidebarCard) {
                var rect = sidebarCard.getBoundingClientRect();
                startX = rect.left;
                startBottom = window.innerHeight - rect.bottom + 10;
            }

            floater.style.transition = 'none';
            floater.style.left = startX + 'px';
            floater.style.bottom = startBottom + 'px';
            floater.style.display = 'block';

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

            // 到达后显示时段问候
            setTimeout(function() {
                if (bubbleEl) {
                    var picked = pickRoamMessage();
                    bubbleEl.textContent = picked.text;
                    bubbleEl.style.display = '';
                    setTimeout(function() { bubbleEl.style.display = 'none'; }, 3000);
                }
            }, 3200);

            roamTimer = setTimeout(doRoam, randomInt(8000, 15000));
        }

        // ── 回到框里 ──
        function goHome() {
            if (!isOut) return;

            var homeX = 40;
            if (sidebarCard) homeX = sidebarCard.getBoundingClientRect().left;

            if (homeX < currentX) floater.classList.add('home-roaming-pet--flip');
            else floater.classList.remove('home-roaming-pet--flip');

            floater.style.transition = 'left 3s cubic-bezier(0.4,0,0.2,1), bottom 1s ease-out';
            floater.style.left = homeX + 'px';
            floatRenderer.setState('dance', 3000);

            setTimeout(function() {
                floater.style.display = 'none';
                floater.classList.remove('home-roaming-pet--flip');
                isOut = false;
                var sc = document.getElementById('sidebarPetCanvas');
                if (sc) sc.style.display = '';
                // 恢复侧边栏动画
                sidebarAnimTimer = setTimeout(sidebarIdleLoop, randomInt(3000, 8000));
                roamTimer = setTimeout(comeOut, randomInt(15000, 30000));
            }, 3200);
        }

        // ── 漫游行为（新增 micro 动作）──
        var microAnims = [
            {anim:'sleep',  dur:2500, text:'💤 哈欠～'},
            {anim:'tickle', dur:1500, text:'🙆 伸个懒腰～'},
            {anim:'dance',  dur:2000, text:'👀 看看四周...'},
            {anim:'eat',    dur:2000, text:'🍬 想吃零食...'},
            {anim:'bath',   dur:1800, text:'💦 甩甩毛～'},
        ];

        function doRoam() {
            if (!isOut) return;
            var actions = ['walk', 'walk', 'happy', 'micro', 'goHome', 'idle'];
            var action = actions[randomInt(0, actions.length - 1)];

            if (action === 'walk') {
                var targetX = randomInt(150, Math.max(400, window.innerWidth - 150));
                if (targetX < currentX) floater.classList.add('home-roaming-pet--flip');
                else floater.classList.remove('home-roaming-pet--flip');
                floater.style.left = targetX + 'px';
                currentX = targetX;
                floatRenderer.setState('dance', 3500);

            } else if (action === 'happy') {
                var picked = pickRoamMessage();
                floatRenderer.setState(picked.anim, picked.dur);
                if (bubbleEl) {
                    bubbleEl.textContent = picked.text;
                    bubbleEl.style.display = '';
                    setTimeout(function() { bubbleEl.style.display = 'none'; }, picked.dur);
                }

            } else if (action === 'micro') {
                var m = microAnims[randomInt(0, microAnims.length - 1)];
                floatRenderer.setState(m.anim, m.dur);
                if (bubbleEl && Math.random() > 0.3) {
                    bubbleEl.textContent = m.text;
                    bubbleEl.style.display = '';
                    setTimeout(function() { bubbleEl.style.display = 'none'; }, m.dur);
                }

            } else if (action === 'goHome') {
                goHome();
                return;

            } else { /* idle */ }

            roamTimer = setTimeout(doRoam, randomInt(6000, 12000));
        }

        // ── 点击反应（6 种 + 状态感知）──
        var clickReactions = [
            {anim:'happy',  msgs:['😊 嘿嘿~','😆 哈哈哈！','🎉 好开心！']},
            {anim:'pat',    msgs:['✨ 好舒服~','😌 再摸摸~','❤️ 最喜欢被摸了！']},
            {anim:'poke',   msgs:['💢 别戳我啦!','😤 哼！','👉 戳什么戳！']},
            {anim:'tickle', msgs:['🌟 好痒好痒!','😂 哈哈停下！','🤣 不要挠了！']},
            {anim:'dance',  msgs:['💃 一起跳舞！','🎵 摇摆摇摆～','🕺 看我跳！']},
            {anim:'eat',    msgs:['🍰 有吃的吗？','🍪 想吃饼干！']},
        ];

        function onPetClick(e) {
            e.stopPropagation();
            e.preventDefault();
            var pool = clickReactions.slice();
            if (pet.hunger < 40) pool.push({anim:'sad', msgs:['😢 好饿...先喂我嘛','🍕 给我吃的！']});
            if (pet.mood >= 80) pool.push({anim:'happy', msgs:['🥰 超爱你！','💖 幸福！']});

            var reaction = pool[randomInt(0, pool.length - 1)];
            floatRenderer.setState(reaction.anim, 1500);
            if (bubbleEl) {
                bubbleEl.textContent = reaction.msgs[randomInt(0, reaction.msgs.length - 1)];
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
                if (sidebarAnimTimer) { clearTimeout(sidebarAnimTimer); sidebarAnimTimer = null; }
            } else {
                if (!roamTimer) {
                    if (isOut) roamTimer = setTimeout(doRoam, randomInt(3000, 8000));
                    else roamTimer = setTimeout(comeOut, randomInt(5000, 15000));
                }
                if (!sidebarAnimTimer && !isOut) {
                    sidebarAnimTimer = setTimeout(sidebarIdleLoop, randomInt(2000, 5000));
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

    async _playSplashAnimation(dataReadyPromise) {
        if (typeof gsap === 'undefined') {
            if (dataReadyPromise) await dataReadyPromise.catch(() => {});
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

        // 隱藏主界面元素
        gsap.set([header, sidebar, welcome, appsGrid].filter(Boolean), { opacity: 0 });

        /* ── 第一幕：系統喚醒（立即播放，不等網路） ──
           編輯式節奏：Icon → Title → Subtitle → Loader 依次浮現，每段延遲約 180ms */
        gsap.timeline()
            .to(splashIcon, {
                opacity: 1, scale: 1,
                duration: 0.55, ease: 'power2.out'
            }, 0.1)
            .to(splashTitle, {
                opacity: 1, scale: 1,
                duration: 0.6, ease: 'power2.out'
            }, 0.35)
            .to(splashSub, {
                opacity: 1, scale: 1,
                duration: 0.55, ease: 'power2.out'
            }, 0.6)
            .to(splashLoader, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0.85);

        /* ── 等待數據就緒 + 最短展示時間 ──
           最短 2200ms：確保用戶看到
             · 1.2s 入場（icon + title + subtitle + loader 依序浮現）
             · 至少一個完整 2.4s 墨跡筆觸循環的大部分
             · 不會「一閃而過」 */
        const minDisplay = new Promise(r => setTimeout(r, 2200));
        await Promise.all([minDisplay, dataReadyPromise].filter(Boolean)).catch(() => {});

        /* ── 第二幕：絲滑過渡到主界面 ── */
        return new Promise(resolve => {
            gsap.timeline({ onComplete: resolve })
                // 淡出加載動畫（慢一點，有告別感）
                .to(splashLoader, { opacity: 0, duration: 0.3, ease: 'power2.in' })
                // Icon/Title/Sub 微微上浮淡出
                .to([splashIcon, splashTitle, splashSub].filter(Boolean), {
                    opacity: 0, y: -6,
                    duration: 0.35, ease: 'power2.in'
                }, '-=0.2')
                // 遮罩升起（蓋住 splash → 主界面切換）
                .to(glassPanel, { opacity: 1, duration: 0.28, ease: 'power2.inOut' }, '-=0.15')
                // 在遮罩完全不透明時切換底層內容
                .add(() => {
                    splashScreen.style.display = 'none';
                    if (header)   gsap.set(header,   { opacity: 0, y: -10 });
                    if (sidebar)  gsap.set(sidebar,  { opacity: 0, x: -10 });
                    if (welcome)  gsap.set(welcome,  { opacity: 0, y:  10 });
                    if (appsGrid) gsap.set(appsGrid, { opacity: 0, y:  10 });
                })
                // 遮罩淡出，同時主界面滑入（重疊動畫消除空隙）
                .to(glassPanel, {
                    opacity: 0, duration: 0.25, ease: 'power2.out',
                    onComplete() { glassPanel.style.display = 'none'; }
                })
                .to([header, sidebar, welcome, appsGrid].filter(Boolean), {
                    opacity: 1, y: 0, x: 0,
                    duration: 0.3, ease: 'power2.out'
                }, '-=0.18');
        });
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
