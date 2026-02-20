/**
 * 遊戲中心 — 前端核心模組
 * ========================
 *
 * 架構：
 *   GameConfig    — 靜態配置（學科、遊戲數據）
 *   GameCenterAPI — API 請求封裝
 *   GameCenterUI  — DOM 渲染與模板
 *   GameCenterApp — 主控制器（狀態管理、事件處理）
 *
 * 依賴共享模組: AuthModule, APIClient, UIModule, Utils
 * 加載順序: shared/* → game_center.js
 */
'use strict';

/* ============================================================
   CONFIG — 靜態配置
   ============================================================ */

const GameConfig = {
    /**
     * 學科配置
     * @property {string} name - 顯示名稱
     * @property {string} icon - 圖標 emoji
     * @property {number} order - 排序順序
     */
    subjects: {
        all:       { name: '全部',   icon: '🌟', order: 0 },
        chinese:   { name: '中文',   icon: '📖', order: 1 },
        math:      { name: '數學',   icon: '📐', order: 2 },
        english:   { name: '英文',   icon: '🔤', order: 3 },
        history:   { name: '歷史',   icon: '📜', order: 4 },
        ict:       { name: 'ICT',    icon: '💻', order: 5 },
        physics:   { name: '物理',   icon: '⚡', order: 6 },
        chemistry: { name: '化學',   icon: '🧪', order: 7 },
        biology:   { name: '生物',   icon: '🧬', order: 8 },
        ces:       { name: '公民',   icon: '🏛️', order: 9 }
    },

    /**
     * 遊戲數據庫（靜態配置部分）
     *
     * 遊戲對象結構：
     * @property {string} id - 唯一標識符
     * @property {string} name - 遊戲名稱
     * @property {string} nameEn - 英文名稱
     * @property {string} icon - 顯示圖標
     * @property {string} description - 簡短描述
     * @property {string} url - 遊戲連結
     * @property {string[]} difficulty - 適用年級
     * @property {string[]} tags - 搜索標籤
     * @property {string|null} badge - 徽章文字（'新' 或 null）
     * @property {string[]} roles - 可訪問角色
     */
    games: {
        chinese: [
            {
                id: 'chinese_reading_games',
                name: '閱讀理解訓練',
                nameEn: 'Reading Comprehension',
                icon: '📚',
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
                icon: '📜',
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
                icon: '✍️',
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
                icon: '🎴',
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
                icon: '✍️',
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
                id: 'china_economy',
                name: '中國經濟發展桌遊',
                nameEn: 'China Economy Game',
                icon: '🇨🇳',
                description: '體驗改革開放經濟發展歷程，了解中國經濟騰飛的奧秘',
                url: '/china_economy_game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['經濟', '改革開放', '歷史', '策略'],
                badge: null,
                roles: ['student', 'teacher', 'admin']
            },
            {
                id: 'ming_dynasty',
                name: '大明風雲：布衣天子之路',
                nameEn: 'Rise of Ming Dynasty',
                icon: '👑',
                description: '扮演朱元璋，體驗從乞丐到皇帝的傳奇人生',
                url: '/static/ming-dynasty-game.html',
                difficulty: ['中一', '中二', '中三'],
                tags: ['明朝', '朱元璋', '歷史人物', '角色扮演'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        ict: [],
        physics: [],
        chemistry: [],
        biology: [],
        ces: []
    }
};

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const GameCenterAPI = {

    /**
     * 加載動態學科列表
     * @returns {Promise<Object|null>}
     */
    async loadSubjects() {
        try {
            const data = await APIClient.get('/api/games/subjects/list');
            return (data?.success && data.data) ? data.data : null;
        } catch {
            return null;
        }
    },

    /**
     * 加載數據庫中的遊戲列表
     * @param {number} userId
     * @param {string} userRole
     * @param {string} userClass
     * @returns {Promise<Array|null>}
     */
    async loadGames(userId, userRole, userClass) {
        try {
            const params = { user_id: userId, user_role: userRole };
            if (userClass) params.user_class = userClass;
            const data = await APIClient.get('/api/games/list', params);
            return (data?.success && data.data) ? data.data : null;
        } catch {
            return null;
        }
    },

    /**
     * 刪除遊戲
     * @param {string} uuid
     * @param {number} userId
     * @param {string} userRole
     * @returns {Promise<Object>}
     */
    async deleteGame(uuid, userId, userRole) {
        return APIClient.delete(
            `/api/games/${uuid}?user_id=${userId}&user_role=${userRole}`
        );
    },

    /**
     * 加載用戶信息
     * @returns {Promise<Object|null>}
     */
    async loadUserInfo() {
        try {
            return await AuthModule.getUserInfo();
        } catch {
            return null;
        }
    }
};

/* ============================================================
   UI — DOM 渲染工具
   ============================================================ */

const GameCenterUI = {

    /**
     * 生成學科標籤 HTML
     */
    createSubjectTabHTML(key, config) {
        const isActive = key === 'all' ? 'active' : '';
        return `
            <button class="subject-tab ${isActive}" data-subject="${key}">
                <span class="tab-icon">${config.icon}</span>
                <span class="tab-name">${config.name}</span>
            </button>
        `;
    },

    /**
     * 生成遊戲區塊 HTML
     */
    createSectionHTML(subjectKey, subjectConfig, games, isAdmin) {
        if (games.length === 0) return '';

        return `
            <section class="gc-section game-section" data-subject="${subjectKey}">
                <div class="section-header">
                    <h2 class="section-title">
                        <span class="title-icon">${subjectConfig.icon}</span>
                        ${subjectConfig.name}遊戲
                    </h2>
                    <span class="game-count">${games.length} 個遊戲</span>
                </div>
                <div class="games-grid">
                    ${games.map(game => this.createGameCardHTML(game, isAdmin)).join('')}
                </div>
            </section>
        `;
    },

    /**
     * 生成遊戲卡片 HTML
     */
    createGameCardHTML(game, isAdmin) {
        const badgeHTML = game.badge
            ? `<span class="game-badge new">${game.badge}</span>`
            : '';

        const difficultyHTML = game.difficulty?.length
            ? `<div class="game-difficulty">${game.difficulty.join(' · ')}</div>`
            : '';

        const uploaderHTML = game.isFromDatabase && game.uploaderName
            ? `<div class="game-uploader">上傳者：${Utils.escapeHtml(game.uploaderName)}</div>`
            : '';

        const adminActionsHTML = isAdmin && game.isFromDatabase
            ? `<div class="game-admin-actions">
                <button class="admin-btn edit-btn" data-action="edit" data-uuid="${game.id}" title="編輯">✏️</button>
                <button class="admin-btn delete-btn" data-action="delete" data-uuid="${game.id}" title="刪除">🗑️</button>
               </div>`
            : '';

        return `
            <div class="game-card" data-game-id="${game.id}" data-url="${game.url}" data-is-db="${game.isFromDatabase || false}">
                <div class="game-card-inner">
                    <div class="game-icon">${game.icon}</div>
                    <div class="game-info">
                        <h3 class="game-name">${Utils.escapeHtml(game.name)}</h3>
                        <p class="game-name-en">${Utils.escapeHtml(game.nameEn)}</p>
                        <p class="game-desc">${Utils.escapeHtml(game.description)}</p>
                        ${difficultyHTML}
                        ${uploaderHTML}
                    </div>
                    ${badgeHTML}
                    ${adminActionsHTML}
                    <div class="game-play-icon">▶</div>
                </div>
            </div>
        `;
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const GameCenterApp = {

    /* ---------- 狀態 ---------- */

    state: {
        currentSubject: 'all',
        searchQuery: '',
        databaseGames: {},
        userInfo: null,
        userRole: 'guest'
    },

    elements: {},

    /* ---------- 初始化 ---------- */

    async init() {
        this._cacheElements();

        // 加載用戶信息
        const info = await GameCenterAPI.loadUserInfo();
        if (info) {
            this.state.userInfo = info;
            this.state.userRole = info.role || AuthModule.getUserRole();
        } else {
            this.state.userRole = AuthModule.getUserRole();
        }

        // 動態加載學科列表
        await this._loadDynamicSubjects();

        this._renderSubjectTabs();
        this._bindEvents();

        // 加載數據庫遊戲
        await this._loadDatabaseGames();

        this._renderGameSections();
        this._updateUserDisplay();
        this._hideSplash();
    },

    _cacheElements() {
        this.elements = {
            subjectTabs: document.getElementById('subjectTabs'),
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
            const icon = (typeof info === 'object') ? (info.icon || '📚') : '📚';

            if (GameConfig.subjects[code]) {
                GameConfig.subjects[code].name = name;
                GameConfig.subjects[code].icon = icon;
            } else {
                maxOrder++;
                GameConfig.subjects[code] = { name, icon, order: maxOrder };
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
            this.state.databaseGames[game.subject].push({
                id: game.uuid,
                name: game.name,
                nameEn: game.name_en || '',
                icon: game.icon,
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

    _renderSubjectTabs() {
        const sorted = Object.entries(GameConfig.subjects)
            .sort((a, b) => a[1].order - b[1].order);

        this.elements.subjectTabs.innerHTML = sorted
            .map(([key, config]) => GameCenterUI.createSubjectTabHTML(key, config))
            .join('');
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
    },

    _hideSplash() {
        setTimeout(() => {
            this.elements.splashScreen?.classList.add('fade-out');
            setTimeout(() => {
                if (this.elements.splashScreen) {
                    this.elements.splashScreen.style.display = 'none';
                }
            }, 500);
        }, 800);
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
        // 返回首頁
        document.getElementById('backBtn')?.addEventListener('click', () => {
            window.location.href = '/';
        });

        // 學科篩選（事件委託）
        this.elements.subjectTabs.addEventListener('click', (e) => {
            const tab = e.target.closest('.subject-tab');
            if (!tab) return;
            this._handleSubjectChange(tab);
        });

        // 搜索（防抖）
        if (this.elements.searchInput) {
            const debouncedSearch = Utils.debounce((value) => {
                this.state.searchQuery = value.trim();
                this._filterGames();
            }, 200);

            this.elements.searchInput.addEventListener('input', (e) => {
                debouncedSearch(e.target.value);
            });
        }

        // 遊戲卡片點擊（事件委託）
        this.elements.gamesContainer.addEventListener('click', (e) => {
            // 管理員操作按鈕
            const adminBtn = e.target.closest('.admin-btn');
            if (adminBtn) {
                e.stopPropagation();
                const action = adminBtn.dataset.action;
                const uuid = adminBtn.dataset.uuid;
                if (action === 'edit') {
                    this._handleEditGame(uuid);
                } else if (action === 'delete') {
                    this._handleDeleteGame(uuid);
                }
                return;
            }

            // 遊戲卡片
            const card = e.target.closest('.game-card');
            if (card) {
                const url = card.dataset.url;
                if (url) window.location.href = url;
            }
        });
    },

    /* ---------- 事件處理 ---------- */

    _handleSubjectChange(tab) {
        this.elements.subjectTabs.querySelectorAll('.subject-tab')
            .forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        this.state.currentSubject = tab.dataset.subject;
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
            const userId = this.state.userInfo?.id || 0;
            const userRole = this.state.userRole;
            const result = await GameCenterAPI.deleteGame(uuid, userId, userRole);

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
                    GameCenterUI.createGameCardHTML(g, isAdmin)
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
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    GameCenterApp.init();

    // 調試模式（僅本地開發）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.GameCenterApp = GameCenterApp;
        window.GameConfig = GameConfig;
    }
});
