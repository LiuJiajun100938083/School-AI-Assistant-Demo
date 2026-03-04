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
        ict: [
            {
                id: 'swift_code_game',
                name: 'SwiftUI 代碼學堂',
                nameEn: 'SwiftUI Code Academy',
                icon: '💻',
                description: '看圖選代碼 + 拖拽拼代碼，從零開始理解 SwiftUI 界面編程',
                url: '/swift-code-game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['編程', 'SwiftUI', '代碼', '拖拽', 'iOS'],
                badge: '新',
                roles: ['student', 'teacher', 'admin']
            }
        ],
        physics: [],
        chemistry: [],
        biology: [],
        ces: [
            {
                id: 'trade_game',
                name: '全球貿易大亨',
                nameEn: 'Global Trade Tycoon',
                icon: '🌐',
                description: '模擬國際貿易：比較優勢、供需法則與經濟安全',
                url: '/trade-game',
                difficulty: ['中一', '中二', '中三'],
                tags: ['貿易', '經濟', '國際', '策略', '公民'],
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
            const params = {};
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
    async deleteGame(uuid) {
        return APIClient.delete(`/api/games/${uuid}`);
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

        const isTeacherOrAdmin = ['teacher', 'admin'].includes(GameCenterApp.state.userRole);
        const safeGameName = Utils.escapeHtml(game.name).replace(/"/g, '&quot;');
        const adminActionsHTML = isAdmin && game.isFromDatabase
            ? `<div class="game-admin-actions">
                <button class="admin-btn edit-btn" data-action="edit" data-uuid="${game.id}" title="編輯">✏️</button>
                <button class="admin-btn share-btn" data-action="share" data-uuid="${game.id}" data-name="${safeGameName}" title="分享">📤</button>
                <button class="admin-btn delete-btn" data-action="delete" data-uuid="${game.id}" title="刪除">🗑️</button>
               </div>`
            : (isTeacherOrAdmin && game.isFromDatabase
                ? `<div class="game-admin-actions">
                    <button class="admin-btn share-btn" data-action="share" data-uuid="${game.id}" data-name="${safeGameName}" title="分享">📤</button>
                   </div>`
                : '');

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

        // 教师/管理员显示管理入口
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
            /* ═══ 第一幕：系統喚醒 ═══ */
            .to(splashIcon, {
                opacity: 1, filter: 'blur(0px)',
                duration: 1.0, ease: EASE
            }, 0.3)
            .to(splashTitle, {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.6, ease: 'power2.out'
            }, 0.8)
            .to(splashSub, {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.6, ease: 'power2.out'
            }, 1.0)
            .to(splashLoader, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.1)
            .to(splashLoader, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 1.9)

            /* ═══ 第二幕：過渡到主界面 ═══ */
            .to(glassPanel, { opacity: 1, duration: 0.5, ease: EASE }, 2.3)
            .add(() => { splashScreen.style.display = 'none'; }, 2.7)
            .to(glassPanel, {
                opacity: 0, duration: 0.6, ease: EASE,
                onComplete() { glassPanel.style.display = 'none'; }
            }, 2.8);
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
                } else if (action === 'share') {
                    GameShareHelper.open(uuid, adminBtn.dataset.name || '');
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
   分享助手
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

        // 重置 duration 按钮
        document.querySelectorAll('#gcShareDurations .gc-dur-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.duration === '1h');
            btn.onclick = () => {
                document.querySelectorAll('#gcShareDurations .gc-dur-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.selectedDuration = btn.dataset.duration;
            };
        });

        // 重置状态
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

                // QR code
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

    // 調試模式（僅本地開發）
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        window.GameCenterApp = GameCenterApp;
        window.GameConfig = GameConfig;
    }
});
