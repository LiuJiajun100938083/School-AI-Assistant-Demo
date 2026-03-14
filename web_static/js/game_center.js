/**
 * 遊戲中心 v3.0 — 前端核心模組
 * ================================
 *
 * 架構：
 *   GameConfig    — 靜態配置（學科、遊戲數據、顏色、SVG 圖標）
 *   GameCenterAPI — API 請求封裝
 *   GameCenterUI  — DOM 渲染與模板
 *   GameCenterApp — 主控制器（狀態管理、事件處理）
 *
 * 依賴共享模組: AuthModule, APIClient, UIModule, Utils
 */
'use strict';

/* ============================================================
   SVG 圖標庫
   ============================================================ */

const GCIcons = {
    // 科目圖標
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    calculator: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="10" x2="8" y2="10.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="16" y1="10" x2="16" y2="10.01"/><line x1="8" y1="14" x2="8" y2="14.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="16" y1="14" x2="16" y2="14.01"/><line x1="8" y1="18" x2="16" y2="18"/></svg>',
    languages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 8l6 6"/><path d="M4 14l6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="M22 22l-5-10-5 10"/><path d="M14 18h6"/></svg>',
    landmark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>',
    monitor: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>',
    zap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    flask: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M9 3h6"/><path d="M10 3v7.4a2 2 0 0 1-.6 1.4L4 17.2A2 2 0 0 0 5.4 21h13.2a2 2 0 0 0 1.4-3.4l-5.4-5.8a2 2 0 0 1-.6-1.4V3"/></svg>',
    leaf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 20A7 7 0 0 1 9.8 6.9C15.5 4.9 17 3.5 19 2c1 2 2 4.5 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.2-6.5 3.8-8.5"/></svg>',
    scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M16 16l3-8 3 8c-.9 1.2-2.5 2-4.5 2s-3.6-.8-4.5-2z"/><path d="M2 16l3-8 3 8c-.9 1.2-2.5 2-4.5 2S.4 17.2-.5 16z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>',
    globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
    coins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><line x1="7" y1="6" x2="7.01" y2="6"/><line x1="16" y1="14" x2="16.01" y2="14"/></svg>',
    defaultIcon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',

    // UI 圖標
    play: '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
};

/* ============================================================
   CONFIG — 靜態配置
   ============================================================ */

const GameConfig = {
    subjects: {
        all:       { name: '全部',       icon: 'star',       color: '#006633', order: 0 },
        chinese:   { name: '中文',       icon: 'book',       color: '#DC2626', order: 1 },
        math:      { name: '數學',       icon: 'calculator',  color: '#2563EB', order: 2 },
        english:   { name: '英文',       icon: 'languages',   color: '#7C3AED', order: 3 },
        history:   { name: '歷史',       icon: 'landmark',    color: '#D97706', order: 4 },
        ict:       { name: 'ICT',        icon: 'monitor',     color: '#059669', order: 5 },
        physics:   { name: '物理',       icon: 'zap',         color: '#EA580C', order: 6 },
        chemistry: { name: '化學',       icon: 'flask',       color: '#0891B2', order: 7 },
        biology:   { name: '生物',       icon: 'leaf',        color: '#16A34A', order: 8 },
        ces:       { name: '公民與社會發展', icon: 'scale',   color: '#E11D48', order: 9 },
        geography: { name: '地理',       icon: 'globe',       color: '#8B5CF6', order: 10 },
        economics: { name: '經濟',       icon: 'coins',       color: '#0D9488', order: 11 }
    },

    // Hero 漸變色背景
    heroGradients: [
        'linear-gradient(135deg, #006633 0%, #059669 100%)',
        'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
        'linear-gradient(135deg, #D97706 0%, #DC2626 100%)',
        'linear-gradient(135deg, #0891B2 0%, #059669 100%)',
        'linear-gradient(135deg, #E11D48 0%, #D97706 100%)',
    ],

    games: {
        chinese: [
            {
                id: 'chinese_reading_games',
                name: '閱讀理解訓練',
                nameEn: 'Reading Comprehension',
                icon: 'book',
                description: '15種閱讀理解遊戲，覆蓋理解、表達、結構、思維、元認知',
                url: '/chinese_learning',
                difficulty: ['中一', '中二', '中三'],
                tags: ['閱讀', '理解', '表達', '思維'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            },
            {
                id: 'classical_chinese',
                name: '文言文訓練',
                nameEn: 'Classical Chinese',
                icon: 'book',
                description: '文言文閱讀理解與翻譯練習',
                url: '/learning_mode/classical',
                difficulty: ['中一', '中二', '中三'],
                tags: ['文言文', '翻譯', '古文'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            },
            {
                id: 'chinese_writing',
                name: '作文輔導',
                nameEn: 'Writing Guide',
                icon: 'book',
                description: 'AI引導式作文訓練，蘇格拉底式提問',
                url: '/learning_mode/writing',
                difficulty: ['中一', '中二', '中三'],
                tags: ['寫作', '作文', '引導'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            }
        ],
        math: [
            {
                id: 'math_word_cards',
                name: '數學詞彙寶庫',
                nameEn: 'Math Word Vault',
                icon: 'calculator',
                description: '掌握數學英文術語，從定義到題目語境全面訓練',
                url: '/games/math_word_cards',
                difficulty: ['中一', '中二', '中三'],
                tags: ['詞彙', '英文術語', '定義', '語境'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        english: [
            {
                id: 'english_writing_helper',
                name: '英文寫作助手',
                nameEn: 'Writing Helper',
                icon: 'languages',
                description: 'AI輔助英文寫作訓練',
                url: '/learning_mode/english_writing',
                difficulty: ['中一', '中二', '中三'],
                tags: ['寫作', '作文'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            }
        ],
        history: [
            {
                id: 'ming_dynasty',
                name: '大明風雲：布衣天子之路',
                nameEn: 'Rise of Ming Dynasty',
                icon: 'landmark',
                description: '扮演朱元璋，體驗從乞丐到皇帝的傳奇人生',
                url: '/static/ming-dynasty-game.html',
                difficulty: ['中一', '中二', '中三'],
                tags: ['明朝', '朱元璋', '歷史人物', '角色扮演'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        ict: [
            {
                id: 'swift_code_game',
                name: 'SwiftUI 代碼學堂',
                nameEn: 'SwiftUI Code Academy',
                icon: 'monitor',
                description: '看圖選代碼 + 拖拽拼代碼，從零開始理解 SwiftUI 界面編程',
                url: '/swift-code-game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['編程', 'SwiftUI', '代碼', '拖拽', 'iOS'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        physics: [],
        chemistry: [
            {
                id: 'chemistry_2048',
                name: '中三 — 化學元素 2048',
                nameEn: 'Chemistry 2048',
                icon: 'flask',
                description: '合併元素到達鈣 (Ca)！5x5 終極挑戰',
                url: '/chemistry-2048',
                difficulty: ['中三'],
                tags: ['元素', '化學', '益智', '2048'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        biology: [],
        ces: [
            {
                id: 'china_economy',
                name: '中國經濟發展桌遊',
                nameEn: 'China Economy Game',
                icon: 'scale',
                description: '體驗改革開放經濟發展歷程，了解中國經濟騰飛的奧秘',
                url: '/china_economy_game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['經濟', '改革開放', '公民', '策略'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            },
            {
                id: 'trade_game',
                name: '中三 — 全球貿易大亨',
                nameEn: 'Global Trade Tycoon',
                icon: 'globe',
                description: '模擬國際貿易：比較優勢、供需法則與經濟安全',
                url: '/trade-game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['貿易', '經濟', '國際', '策略', '公民'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            },
            {
                id: 'farm_game',
                name: '中二 — 神州菜園經營家',
                nameEn: 'Farm Security Tycoon',
                icon: 'leaf',
                description: '經營菜園守護糧食安全：戰爭貿易戰、種子主權與耕地紅線',
                url: '/farm-game',
                difficulty: ['中二'],
                tags: ['糧食安全', '農業', '國安', '策略', '公民'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ]
    }
};

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const GameCenterAPI = {
    async loadSubjects() {
        try {
            const data = await APIClient.get('/api/games/subjects/list');
            return (data?.success && data.data) ? data.data : null;
        } catch { return null; }
    },

    async loadGames(userId, userRole, userClass) {
        try {
            const params = {};
            if (userClass) params.user_class = userClass;
            const data = await APIClient.get('/api/games/list', params);
            return (data?.success && data.data) ? data.data : null;
        } catch { return null; }
    },

    async deleteGame(uuid) {
        return APIClient.delete(`/api/games/${uuid}`);
    },

    async loadUserInfo() {
        try { return await AuthModule.getUserInfo(); }
        catch { return null; }
    },

    async loadFarmLeaderboard(limit = 10) {
        try {
            const data = await APIClient.get('/api/farm-game/scores/leaderboard', { limit });
            return (data?.success && data.data) ? data.data : null;
        } catch { return null; }
    },

    async loadTradeLeaderboard(difficulty = null, limit = 10) {
        try {
            const params = { limit };
            if (difficulty) params.difficulty = difficulty;
            const data = await APIClient.get('/api/trade-game/scores/leaderboard', params);
            return (data?.success && data.data) ? data.data : null;
        } catch { return null; }
    }
};

/* ============================================================
   UI — DOM 渲染工具
   ============================================================ */

const GameCenterUI = {

    _getSubjectColor(subjectKey) {
        return GameConfig.subjects[subjectKey]?.color || '#6B7280';
    },

    _getSubjectIcon(subjectKey) {
        const iconName = GameConfig.subjects[subjectKey]?.icon || 'defaultIcon';
        return GCIcons[iconName] || GCIcons.defaultIcon;
    },

    _getGameIcon(game) {
        if (game.icon && GCIcons[game.icon]) return GCIcons[game.icon];
        return GCIcons.defaultIcon;
    },

    _lightenColor(hex, amount = 0.92) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const lr = Math.round(r + (255 - r) * amount);
        const lg = Math.round(g + (255 - g) * amount);
        const lb = Math.round(b + (255 - b) * amount);
        return `rgb(${lr}, ${lg}, ${lb})`;
    },

    // ── Hero 精選區 ────────────────────────────────────────

    renderHero(featuredGames) {
        if (featuredGames.length === 0) return '';

        const cards = featuredGames.slice(0, 3).map((game, i) => {
            const isPrimary = i === 0;
            const gradient = GameConfig.heroGradients[i % GameConfig.heroGradients.length];
            const icon = this._getGameIcon(game);
            return `
                <a class="gc-hero-card ${isPrimary ? 'gc-hero-card--primary' : ''}"
                   href="${game.url}" style="background: ${gradient};">
                    <span class="gc-hero-badge">${game.badge || '精選'}</span>
                    <div class="gc-hero-icon">${icon}</div>
                    <div class="gc-hero-title">${Utils.escapeHtml(game.name)}</div>
                    <div class="gc-hero-desc">${Utils.escapeHtml(game.description)}</div>
                </a>
            `;
        });

        return `<div class="gc-hero-grid">${cards.join('')}</div>`;
    },

    // ── Pill Chips ─────────────────────────────────────────

    createPillHTML(key, config) {
        const isActive = key === 'all' ? 'active' : '';
        const icon = GCIcons[config.icon] || GCIcons.defaultIcon;
        return `
            <button class="gc-pill ${isActive}" data-subject="${key}">
                ${icon}
                <span>${config.name}</span>
            </button>
        `;
    },

    // ── 區塊 ──────────────────────────────────────────────

    createSectionHTML(subjectKey, subjectConfig, games, isAdmin) {
        if (games.length === 0) return '';

        const icon = this._getSubjectIcon(subjectKey);
        const color = this._getSubjectColor(subjectKey);

        return `
            <section class="gc-section game-section" data-subject="${subjectKey}">
                <div class="section-header">
                    <h2 class="section-title" style="color: ${color}">
                        ${icon}
                        ${subjectConfig.name}遊戲
                    </h2>
                    <span class="game-count">${games.length} 個遊戲</span>
                </div>
                <div class="games-grid">
                    ${games.map(game => this.createGameCardHTML(game, isAdmin, subjectKey)).join('')}
                </div>
            </section>
        `;
    },

    // ── 排行榜 ─────────────────────────────────────────────

    createLeaderboardHTML(title, icon, entries, gameUrl) {
        if (!entries || entries.length === 0) return '';

        const RANK_ICONS = ['🥇', '🥈', '🥉'];
        const RESULT_MAP = { completed: '任期屆滿', bankrupt: '破產', redline: '國安紅線' };

        const rowsHTML = entries.map((e, i) => {
            const rankIcon = RANK_ICONS[i] || `<span class="gc-lb-rank-num">${e.rank || i + 1}</span>`;
            const rowClass = i < 3 ? `gc-lb-row--top${i + 1}` : '';
            const resultTag = e.result ? `<span class="gc-lb-result">${RESULT_MAP[e.result] || e.result}</span>` : '';
            return `<div class="gc-lb-row ${rowClass}">
                <span class="gc-lb-rank">${rankIcon}</span>
                <span class="gc-lb-name">${Utils.escapeHtml(e.student_name || '')}</span>
                <span class="gc-lb-class">${Utils.escapeHtml(e.class_name || '')}</span>
                ${resultTag}
                <span class="gc-lb-score">${e.score?.toLocaleString() || 0}</span>
            </div>`;
        }).join('');

        return `
            <div class="gc-leaderboard-card">
                <div class="gc-lb-header">
                    <span class="gc-lb-icon">${icon}</span>
                    <span class="gc-lb-title">${Utils.escapeHtml(title)}</span>
                    <a href="${gameUrl}" class="gc-lb-play-btn">去挑戰 ▶</a>
                </div>
                <div class="gc-lb-body">${rowsHTML}</div>
            </div>
        `;
    },

    // ── 遊戲卡片 ──────────────────────────────────────────

    createGameCardHTML(game, isAdmin, subjectKey) {
        const icon = this._getGameIcon(game);

        const badgeHTML = game.badge
            ? `<span class="game-badge new">${game.badge}</span>`
            : '';

        const difficultyHTML = game.difficulty?.length
            ? `<span class="game-difficulty">${game.difficulty.join(' · ')}</span>`
            : '';

        const uploaderHTML = game.isFromDatabase && game.uploaderName
            ? `<div class="game-uploader">上傳者：${Utils.escapeHtml(game.uploaderName)}</div>`
            : '';

        const isTeacherOrAdmin = ['teacher', 'admin'].includes(GameCenterApp.state.userRole);
        const safeGameName = Utils.escapeHtml(game.name).replace(/"/g, '&quot;');
        const adminActionsHTML = isAdmin && game.isFromDatabase
            ? `<div class="game-admin-actions">
                <button class="admin-btn edit-btn" data-action="edit" data-uuid="${game.id}" title="編輯">${GCIcons.edit}</button>
                <button class="admin-btn share-btn" data-action="share" data-uuid="${game.id}" data-name="${safeGameName}" title="分享">${GCIcons.share}</button>
                <button class="admin-btn delete-btn" data-action="delete" data-uuid="${game.id}" title="刪除">${GCIcons.trash}</button>
               </div>`
            : (isTeacherOrAdmin && game.isFromDatabase
                ? `<div class="game-admin-actions">
                    <button class="admin-btn share-btn" data-action="share" data-uuid="${game.id}" data-name="${safeGameName}" title="分享">${GCIcons.share}</button>
                   </div>`
                : '');

        return `
            <div class="game-card" data-game-id="${game.id}" data-url="${game.url}" data-is-db="${game.isFromDatabase || false}">
                <div class="game-card-header">
                    <div class="game-icon-wrap">${icon}</div>
                    ${badgeHTML}
                    ${adminActionsHTML}
                </div>
                <div class="game-card-body">
                    <h3 class="game-name">${Utils.escapeHtml(game.name)}</h3>
                    <p class="game-name-en">${Utils.escapeHtml(game.nameEn)}</p>
                    <p class="game-desc">${Utils.escapeHtml(game.description)}</p>
                    <div class="game-meta">
                        ${difficultyHTML}
                    </div>
                    ${uploaderHTML}
                </div>
                <div class="game-play-icon">${GCIcons.play}</div>
            </div>
        `;
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const GameCenterApp = {

    state: {
        currentSubject: 'all',
        searchQuery: '',
        databaseGames: {},
        userInfo: null,
        userRole: 'guest'
    },

    elements: {},

    async init() {
        this._cacheElements();

        const info = await GameCenterAPI.loadUserInfo();
        if (info) {
            this.state.userInfo = info;
            this.state.userRole = info.role || AuthModule.getUserRole();
        } else {
            this.state.userRole = AuthModule.getUserRole();
        }

        await this._loadDynamicSubjects();
        this._renderPills();
        this._bindEvents();

        await this._loadDatabaseGames();

        this._renderHero();
        this._renderGameSections();
        this._updateUserDisplay();
        this._hideSplash();

        this._loadLeaderboards();
    },

    _cacheElements() {
        this.elements = {
            subjectPills: document.getElementById('subjectPills'),
            heroSection: document.getElementById('heroSection'),
            gamesContainer: document.getElementById('gamesContainer'),
            emptyState: document.getElementById('emptyState'),
            searchInput: document.getElementById('gameSearch'),
            userName: document.getElementById('userName'),
            userAvatar: document.getElementById('userAvatar'),
            splashScreen: document.getElementById('splashScreen')
        };
    },

    /* ---------- 數據加載 ---------- */

    async _loadDynamicSubjects() {
        const subjects = await GameCenterAPI.loadSubjects();
        if (!subjects || Object.keys(subjects).length === 0) return;

        let maxOrder = Math.max(
            ...Object.values(GameConfig.subjects).map(s => s.order || 0)
        );

        for (const [code, info] of Object.entries(subjects)) {
            if (code === 'all') continue;

            const name = (typeof info === 'object') ? (info.name || code) : info;
            const icon = (typeof info === 'object') ? (info.icon || 'defaultIcon') : 'defaultIcon';

            if (GameConfig.subjects[code]) {
                GameConfig.subjects[code].name = name;
                if (typeof info === 'object' && info.icon && GCIcons[info.icon]) {
                    GameConfig.subjects[code].icon = info.icon;
                }
            } else {
                maxOrder++;
                GameConfig.subjects[code] = { name, icon, color: '#6B7280', order: maxOrder };
                if (!GameConfig.games[code]) {
                    GameConfig.games[code] = [];
                }
            }
        }
    },

    async _loadDatabaseGames() {
        const userId = this.state.userInfo?.id || 0;
        const userRole = this.state.userRole;
        const userClass = this.state.userInfo?.class_name || '';

        const games = await GameCenterAPI.loadGames(userId, userRole, userClass);
        if (!games) return;

        this.state.databaseGames = {};
        games.forEach(game => {
            if (!this.state.databaseGames[game.subject]) {
                this.state.databaseGames[game.subject] = [];
            }
            const subjectIcon = GameConfig.subjects[game.subject]?.icon || 'defaultIcon';
            this.state.databaseGames[game.subject].push({
                id: game.uuid,
                name: game.name,
                nameEn: game.name_en || '',
                icon: subjectIcon,
                description: game.description,
                url: game.url,
                difficulty: game.difficulty || [],
                tags: game.tags || [],
                badge: null,
                roles: ['student', 'teacher', 'admin'],
                isFromDatabase: true,
                uploaderName: game.uploader_name || null,
                isPublic: game.is_public
            });
        });
    },

    /* ---------- 渲染 ---------- */

    _renderPills() {
        const sorted = Object.entries(GameConfig.subjects)
            .sort((a, b) => a[1].order - b[1].order);

        this.elements.subjectPills.innerHTML = sorted
            .map(([key, config]) => GameCenterUI.createPillHTML(key, config))
            .join('');
    },

    _renderHero() {
        // Collect featured games (badge = '新')
        const featured = [];
        Object.entries(GameConfig.games).forEach(([subjectKey, games]) => {
            games.forEach(g => {
                if (g.badge) featured.push(g);
            });
        });

        if (featured.length > 0) {
            this.elements.heroSection.innerHTML = GameCenterUI.renderHero(featured);
            this.elements.heroSection.classList.add('active');
        }
    },

    _renderGameSections() {
        const isAdmin = this.state.userRole === 'admin';

        const sorted = Object.entries(GameConfig.subjects)
            .filter(([key]) => key !== 'all')
            .sort((a, b) => a[1].order - b[1].order);

        const html = sorted
            .map(([key, config]) => {
                const games = this._getAccessibleGames(key);
                return GameCenterUI.createSectionHTML(key, config, games, isAdmin);
            })
            .filter(Boolean)
            .join('');

        this.elements.gamesContainer.innerHTML = html;
        this._updateEmptyState();
    },

    _updateUserDisplay() {
        const name = this.state.userInfo?.display_name
            || this.state.userInfo?.username
            || '訪客';
        this.elements.userName.textContent = name;
        this.elements.userAvatar.textContent = name.charAt(0).toUpperCase();

        const teacherActions = document.getElementById('teacherActions');
        if (teacherActions && ['teacher', 'admin'].includes(this.state.userRole)) {
            teacherActions.style.display = 'flex';
        }
    },

    _hideSplash() {
        const splashScreen = document.getElementById('splashScreen');
        const glassPanel   = document.getElementById('glassPanel');

        if (!splashScreen) return;

        if (typeof gsap === 'undefined') {
            splashScreen.style.display = 'none';
            if (glassPanel) glassPanel.style.display = 'none';
            return;
        }

        const splashIcon   = splashScreen.querySelector('.splash-icon');
        const splashTitle  = splashScreen.querySelector('.splash-title');
        const splashSub    = splashScreen.querySelector('.splash-subtitle');
        const splashLoader = splashScreen.querySelector('.splash-loader');
        const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
        const tl = gsap.timeline();

        tl
            .to([splashIcon, splashTitle, splashSub].filter(Boolean), {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.6, ease: EASE
            }, 0.1)
            .to(splashLoader, { opacity: 1, duration: 0.3, ease: 'power2.out' }, 0.3)
            .to(splashLoader, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.9)
            .to(glassPanel, { opacity: 1, duration: 0.3, ease: EASE }, 1.2)
            .add(() => { splashScreen.style.display = 'none'; }, 1.5)
            .to(glassPanel, {
                opacity: 0, duration: 0.4, ease: EASE,
                onComplete() { glassPanel.style.display = 'none'; }
            }, 1.55);
    },

    /* ---------- 數據過濾 ---------- */

    _getAccessibleGames(subjectKey) {
        const staticGames = GameConfig.games[subjectKey] || [];
        const dbGames = this.state.databaseGames[subjectKey] || [];
        const allGames = [...staticGames, ...dbGames];
        const role = this.state.userRole;

        return allGames.filter(game => {
            if (!game.roles.includes(role) && role !== 'guest') return false;
            if (this.state.searchQuery) {
                return this._matchesSearch(game);
            }
            return true;
        });
    },

    _matchesSearch(game) {
        const query = this.state.searchQuery.toLowerCase();
        const fields = [
            game.name, game.nameEn, game.description,
            ...(game.tags || [])
        ];
        return fields.some(f => f && f.toLowerCase().includes(query));
    },

    _updateEmptyState() {
        const sections = this.elements.gamesContainer.querySelectorAll('.game-section');
        const hasVisible = Array.from(sections).some(s => s.style.display !== 'none');
        this.elements.emptyState.style.display = hasVisible ? 'none' : 'flex';
    },

    /* ---------- 事件綁定 ---------- */

    _bindEvents() {
        document.getElementById('backBtn')?.addEventListener('click', () => {
            window.location.href = '/';
        });

        // Pill chips 切換
        this.elements.subjectPills.addEventListener('click', (e) => {
            const pill = e.target.closest('.gc-pill');
            if (!pill) return;
            this._handleSubjectChange(pill);
        });

        // 搜索
        if (this.elements.searchInput) {
            const debouncedSearch = Utils.debounce((value) => {
                this.state.searchQuery = value.trim();
                this._filterGames();
            }, 200);

            this.elements.searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });
        }

        // 遊戲卡片
        this.elements.gamesContainer.addEventListener('click', (e) => {
            const adminBtn = e.target.closest('.admin-btn');
            if (adminBtn) {
                e.stopPropagation();
                const action = adminBtn.dataset.action;
                const uuid = adminBtn.dataset.uuid;
                if (action === 'edit') {
                    this._handleEditGame(uuid);
                } else if (action === 'delete') {
                    this._handleDeleteGame(uuid);
                } else if (action === 'share') {
                    GameShareHelper.open(uuid, adminBtn.dataset.name || '');
                }
                return;
            }

            const card = e.target.closest('.game-card');
            if (card) {
                const url = card.dataset.url;
                if (url) window.location.href = url;
            }
        });
    },

    /* ---------- 事件處理 ---------- */

    _handleSubjectChange(pill) {
        this.elements.subjectPills.querySelectorAll('.gc-pill')
            .forEach(t => t.classList.remove('active'));
        pill.classList.add('active');

        this.state.currentSubject = pill.dataset.subject;

        // Show/hide hero based on subject
        if (this.state.currentSubject === 'all') {
            this.elements.heroSection.classList.add('active');
        } else {
            this.elements.heroSection.classList.remove('active');
        }

        this._filterGames();
    },

    _handleEditGame(uuid) {
        window.location.href = `/game_upload?edit=${uuid}`;
    },

    async _handleDeleteGame(uuid) {
        const confirmed = await UIModule.confirm(
            '確定要刪除這個遊戲嗎？此操作無法撤銷。',
            '刪除確認'
        );
        if (!confirmed) return;

        try {
            const result = await GameCenterAPI.deleteGame(uuid);
            if (result.success) {
                UIModule.toast('遊戲已刪除', 'success');
                await this._loadDatabaseGames();
                this._renderGameSections();
            } else {
                UIModule.toast('刪除失敗：' + (result.message || '未知錯誤'), 'error');
            }
        } catch (error) {
            console.error('刪除遊戲失敗:', error);
            UIModule.toast('刪除失敗，請稍後再試', 'error');
        }
    },

    async _loadLeaderboards() {
        const farmData = await GameCenterAPI.loadFarmLeaderboard(10);
        const cesSection = this.elements.gamesContainer.querySelector('.game-section[data-subject="ces"]');
        if (!cesSection) return;

        const farmHtml = GameCenterUI.createLeaderboardHTML('神州菜園經營家 排行榜', '🥬', farmData, '/farm-game');
        if (!farmHtml) return;

        let container = cesSection.querySelector('.gc-leaderboards');
        if (!container) {
            container = document.createElement('div');
            container.className = 'gc-leaderboards';
            cesSection.appendChild(container);
        }
        container.innerHTML = farmHtml;
    },

    _filterGames() {
        const isAdmin = this.state.userRole === 'admin';
        const sections = this.elements.gamesContainer.querySelectorAll('.game-section');

        sections.forEach(section => {
            const subject = section.dataset.subject;
            const shouldShow = this.state.currentSubject === 'all'
                || this.state.currentSubject === subject;

            if (!shouldShow) {
                section.style.display = 'none';
                return;
            }

            const games = this._getAccessibleGames(subject);
            const grid = section.querySelector('.games-grid');
            const countEl = section.querySelector('.game-count');

            if (games.length > 0) {
                grid.innerHTML = games.map(g =>
                    GameCenterUI.createGameCardHTML(g, isAdmin, subject)
                ).join('');
                countEl.textContent = `${games.length} 個遊戲`;
                section.style.display = 'block';
            } else {
                section.style.display = 'none';
            }
        });

        this._updateEmptyState();
    }
};

/* ============================================================
   分享助手（保持不變）
   ============================================================ */

const GameShareHelper = {
    targetUuid: null,
    selectedDuration: '1h',
    qrInstance: null,

    open(uuid, gameName) {
        this.targetUuid = uuid;
        this.selectedDuration = '1h';

        const modal = document.getElementById('gcShareModal');
        if (!modal) {
            console.error('Share modal not found in DOM');
            return;
        }

        document.getElementById('gcShareTitle').textContent = `分享：${gameName}`;

        document.querySelectorAll('#gcShareDurations .gc-dur-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.duration === '1h');
            btn.onclick = () => {
                document.querySelectorAll('#gcShareDurations .gc-dur-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedDuration = btn.dataset.duration;
            };
        });

        document.getElementById('gcShareResult').classList.remove('show');
        const genBtn = document.getElementById('gcShareGenBtn');
        genBtn.disabled = false;
        genBtn.textContent = '生成二維碼';
        document.getElementById('gcShareQr').innerHTML = '';
        this.qrInstance = null;

        modal.style.display = 'flex';
    },

    close() {
        this.targetUuid = null;
        const modal = document.getElementById('gcShareModal');
        if (modal) modal.style.display = 'none';
    },

    async generate() {
        if (!this.targetUuid) return;

        const btn = document.getElementById('gcShareGenBtn');
        btn.disabled = true;
        btn.textContent = '生成中...';

        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch(`/api/games/${this.targetUuid}/share`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ duration: this.selectedDuration })
            });

            const result = await resp.json();

            if (result.success) {
                const data = result.data;
                const shareUrl = data.share_url;

                document.getElementById('gcShareResult').classList.add('show');
                document.getElementById('gcShareUrl').value = shareUrl;

                const qrBox = document.getElementById('gcShareQr');
                qrBox.innerHTML = '';
                this.qrInstance = new QRCode(qrBox, {
                    text: shareUrl,
                    width: 180,
                    height: 180,
                    colorDark: '#1D1D1F',
                    colorLight: '#FFFFFF',
                    correctLevel: QRCode.CorrectLevel.M
                });

                const expiresAt = new Date(data.expires_at);
                const labels = { '30m': '30 分鐘', '1h': '1 小時', '1d': '1 天', '1w': '1 週' };
                document.getElementById('gcShareExpires').textContent =
                    `有效期：${labels[this.selectedDuration]} | 過期：${expiresAt.toLocaleString('zh-TW')}`;

                btn.textContent = '重新生成';
                btn.disabled = false;
            } else {
                UIModule.toast(result.message || '生成失敗', 'error');
                btn.textContent = '生成二維碼';
                btn.disabled = false;
            }
        } catch (err) {
            console.error('生成分享链接失败:', err);
            UIModule.toast('生成失敗，請重試', 'error');
            btn.textContent = '生成二維碼';
            btn.disabled = false;
        }
    },

    copyUrl() {
        const input = document.getElementById('gcShareUrl');
        input.select();
        navigator.clipboard.writeText(input.value).then(() => {
            const btn = input.nextElementSibling;
            const orig = btn.textContent;
            btn.textContent = '已複製';
            setTimeout(() => { btn.textContent = orig; }, 2000);
        }).catch(() => {
            document.execCommand('copy');
        });
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    GameCenterApp.init();

    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.GameCenterApp = GameCenterApp;
        window.GameConfig = GameConfig;
    }
});
