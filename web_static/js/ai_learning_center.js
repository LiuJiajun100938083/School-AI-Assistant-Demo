(function() {
    'use strict';

    // ==================== CONSTANTS ====================
    const API_BASE = '/api/learning-center';
    const ADMIN_API = '/api/admin/learning-center';
    const TOAST_DURATION = 3000;
    const SEARCH_DEBOUNCE_DELAY = 300;

    // ==================== STATE ====================
    let token = null;
    let userRole = null;
    let currentTab = 'media';
    let isAdmin = false;

    const state = {
        categories: [],
        contents: [],
        nodes: [],
        edges: [],
        paths: [],
        currentPage: 1,
        pageSize: 200,
        totalItems: 0,
        filters: {
            contentType: null,
            categoryId: null,
            tag: null,
            search: ''
        },
        stats: {
            courses: 0,
            videos: 0,
            documents: 0
        },
        // AI 助教 - 当前阅读的内容上下文
        currentContentId: null,
        currentContentTitle: null,
        // 知识地图 - 导航状态
        lastSelectedNodeId: null,
        lastZoomTransform: null,
    };

    // Track loaded tabs to avoid duplicate API calls
    const loadedTabs = new Set();

    // Map tab names to their panel element IDs in HTML
    const TAB_PANEL_MAP = {
        'map': 'tabMap',
        'paths': 'tabPaths',
        'media': 'tabMedia',
        'resources': 'tabResources',
    };

    // ==================== UTILITY FUNCTIONS ====================

    /**
     * Generic fetch wrapper with authentication and error handling
     */
    async function api(url, options = {}) {
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '请求失败');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            showToast(error.message || '网络错误，请重试', 'error');
            throw error;
        }
    }

    /**
     * POST JSON data
     */
    async function apiPost(url, body) {
        return api(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    }

    /**
     * PUT JSON data
     */
    async function apiPut(url, body) {
        return api(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    /**
     * DELETE request
     */
    async function apiDelete(url) {
        return api(url, {
            method: 'DELETE'
        });
    }

    /**
     * Upload FormData (file upload)
     */
    async function apiUpload(url, formData) {
        const headers = {
            'Authorization': `Bearer ${token}`
        };
        // Don't set Content-Type for FormData, let browser set it
        delete headers['Content-Type'];

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: formData
            });

            if (response.status === 401) {
                localStorage.removeItem('token');
                window.location.href = '/';
                return;
            }

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || '上传失败');
            }

            return data;
        } catch (error) {
            console.error('Upload Error:', error);
            showToast(error.message || '网络错误，请重试', 'error');
            throw error;
        }
    }

    /**
     * Show toast notification
     */
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `alc-toast alc-toast-${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        // Trigger animation
        setTimeout(() => toast.classList.add('alc-toast-show'), 10);

        // Remove after duration
        setTimeout(() => {
            toast.classList.remove('alc-toast-show');
            setTimeout(() => toast.remove(), 300);
        }, TOAST_DURATION);
    }

    /**
     * Format bytes to human-readable size
     */
    function formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * Format duration in seconds to MM:SS
     */
    function formatDuration(seconds) {
        if (!seconds) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    /**
     * Escape HTML to prevent XSS
     */
    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    /**
     * Parse video URL and extract embed URL
     */
    function parseVideoEmbed(url) {
        if (!url) return null;

        // YouTube
        let youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
        if (youtubeMatch) {
            return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
        }

        // Bilibili
        let bilibiliMatch = url.match(/bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/);
        if (bilibiliMatch) {
            return `https://player.bilibili.com/player.html?bvid=${bilibiliMatch[1]}`;
        }

        // If it's already an embed URL, return as is
        if (url.includes('youtube.com/embed') || url.includes('player.bilibili.com')) {
            return url;
        }

        return null;
    }

    /**
     * Decode JWT payload to get user info
     */
    function decodeToken(token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload;
        } catch (e) {
            console.error('Failed to decode token');
            return null;
        }
    }

    /**
     * Check if element exists and return it
     */
    function getElement(id) {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`Element with id '${id}' not found`);
        }
        return el;
    }

    /**
     * Add event listener safely
     */
    function on(selector, event, handler) {
        const elements = Array.isArray(selector) ? selector : document.querySelectorAll(selector);
        if (elements.length === 0) return;
        elements.forEach(el => {
            if (el) el.addEventListener(event, handler);
        });
    }

    /**
     * Remove event listener
     */
    function off(selector, event, handler) {
        const elements = Array.isArray(selector) ? selector : document.querySelectorAll(selector);
        elements.forEach(el => {
            if (el) el.removeEventListener(event, handler);
        });
    }

    /**
     * Debounce function
     */
    function debounce(func, delay) {
        let timeoutId;
        return function(...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
    }

    // ==================== INITIALIZATION ====================

    async function init() {
        // Check authentication
        token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (!token) {
            window.location.href = '/';
            return;
        }

        // Decode token to get user role
        const payload = decodeToken(token);
        if (!payload) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return;
        }

        userRole = payload.role || 'student';
        isAdmin = ['teacher', 'admin'].includes(userRole);

        // Admin button hidden by default; only shown in manage mode
        const adminToggleBtn = getElement('adminToggleBtn');
        if (adminToggleBtn) {
            adminToggleBtn.style.display = 'none';
        }

        // Setup event listeners
        setupTabs();
        setupSearch();
        setupAdminPanel();
        setupModals();
        setupAiAssistant();
        setupAiFloatingWindow();
        setupTypeFilters();

        // Load initial data
        try {
            await loadStats();
            await loadCategories();
            switchTab('media');
        } catch (error) {
            console.error('Initialization error:', error);
            showToast('加载失败，请刷新页面', 'error');
        }
    }

    // ==================== STATISTICS ====================

    async function loadStats() {
        try {
            const response = await api(`${API_BASE}/stats`);
            if (response.success) {
                state.stats = response.data;
                updateStatsDisplay();
            }
        } catch (error) {
            console.error('Failed to load stats:', error);
        }
    }

    function updateStatsDisplay() {
        const courseEl = getElement('statCourses');
        const videoEl = getElement('statVideos');
        const docEl = getElement('statDocs');

        if (courseEl) courseEl.textContent = state.stats.courses || 0;
        if (videoEl) videoEl.textContent = state.stats.videos || 0;
        if (docEl) docEl.textContent = state.stats.documents || 0;
    }

    // ==================== TAB MANAGEMENT ====================

    function setupTabs() {
        const tabButtons = document.querySelectorAll('[data-tab]');
        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-tab');
                switchTab(tabName);
            });
        });

        // Sidebar toggle
        setupSidebarToggle();

        // Mode switcher
        setupModeSwitcher();
    }

    function setupSidebarToggle() {
        const ebookContainer = document.getElementById('ebookContainer');
        const toggleBtn = document.getElementById('sidebarToggleBtn');
        const closeBtn = document.getElementById('sidebarCloseBtn');

        // 默认展开目录，让用户一进来就能看到内容列表
        if (ebookContainer && toggleBtn) {
            ebookContainer.classList.add('alc-ebook--sidebar-open');
            toggleBtn.querySelector('svg path').setAttribute('d', 'M15 18l-6-6 6-6');
        }

        if (toggleBtn && ebookContainer) {
            toggleBtn.addEventListener('click', () => {
                const isOpen = ebookContainer.classList.toggle('alc-ebook--sidebar-open');
                // Update toggle button arrow direction
                toggleBtn.querySelector('svg path').setAttribute('d',
                    isOpen ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'
                );
            });
        }

        if (closeBtn && ebookContainer) {
            closeBtn.addEventListener('click', () => {
                ebookContainer.classList.remove('alc-ebook--sidebar-open');
                if (toggleBtn) {
                    toggleBtn.querySelector('svg path').setAttribute('d', 'M9 18l6-6-6-6');
                }
            });
        }
    }

    function setupModeSwitcher() {
        const modeBtns = document.querySelectorAll('[data-mode]');
        const page = document.getElementById('app');
        const ebookContainer = document.getElementById('ebookContainer');

        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.getAttribute('data-mode');

                // Update button states
                modeBtns.forEach(b => b.classList.remove('alc-mode-btn--active'));
                btn.classList.add('alc-mode-btn--active');

                // Remove all mode classes
                page.classList.remove('alc-page--reading', 'alc-page--edit', 'alc-page--manage');

                // Apply mode class
                page.classList.add(`alc-page--${mode}`);

                // Auto-show sidebar in manage mode, hide in reading mode
                if (ebookContainer) {
                    if (mode === 'manage' || mode === 'edit') {
                        ebookContainer.classList.add('alc-ebook--sidebar-open');
                    } else if (mode === 'reading') {
                        ebookContainer.classList.remove('alc-ebook--sidebar-open');
                    }
                }

                // Show admin panel toggle in manage mode
                const adminToggleBtn = getElement('adminToggleBtn');
                if (adminToggleBtn && isAdmin) {
                    adminToggleBtn.style.display = mode === 'manage' ? 'block' : 'none';
                }
            });
        });
    }

    async function switchTab(tabName) {
        currentTab = tabName;

        // Update active tab button
        document.querySelectorAll('[data-tab]').forEach(btn => {
            const isActive = btn.getAttribute('data-tab') === tabName;
            btn.classList.toggle('alc-active', isActive);
            btn.classList.toggle('alc-tab-button--active', isActive);
        });

        // Hide all panels using the TAB_PANEL_MAP
        Object.values(TAB_PANEL_MAP).forEach(panelId => {
            const panel = document.getElementById(panelId);
            if (panel) {
                panel.style.display = 'none';
                panel.classList.remove('alc-tab-panel--active');
            }
        });

        // Show selected panel
        const panelId = TAB_PANEL_MAP[tabName];
        const panel = panelId ? document.getElementById(panelId) : null;
        if (panel) {
            panel.style.display = 'block';
            panel.classList.add('alc-tab-panel--active');
        }

        // Load data if not already loaded
        if (!loadedTabs.has(tabName)) {
            loadedTabs.add(tabName);

            try {
                switch (tabName) {
                    case 'media':
                        await loadMedia(1);
                        break;
                    case 'map':
                        await loadKnowledgeMap();
                        break;
                    case 'paths':
                        await loadPaths();
                        break;
                    case 'resources':
                        await loadResources();
                        break;
                }
            } catch (error) {
                console.error(`Failed to load ${tabName}:`, error);
                showToast(`加载${tabName}失败`, 'error');
            }
        }
    }

    // ==================== CATEGORIES ====================

    async function loadCategories() {
        try {
            const response = await api(`${API_BASE}/categories`);
            if (response.success) {
                state.categories = response.data || [];
                renderCategoryTags();
                renderResourceTree();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    function renderCategoryTags() {
        const container = getElement('categoryTags');
        if (!container) return;

        container.innerHTML = '';
        const allBtn = document.createElement('button');
        allBtn.className = 'alc-category-tag alc-active';
        allBtn.setAttribute('data-category', '');
        allBtn.textContent = '全部';
        allBtn.addEventListener('click', async () => {
            state.filters.categoryId = null;
            state.currentPage = 1;
            await loadMedia(1);
            updateCategoryButtonStates();
        });
        container.appendChild(allBtn);

        state.categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'alc-category-tag';
            btn.textContent = cat.name;
            btn.setAttribute('data-category', cat.id);
            btn.addEventListener('click', async () => {
                state.filters.categoryId = cat.id;
                state.currentPage = 1;
                await loadMedia(1);
                updateCategoryButtonStates();
            });
            container.appendChild(btn);
        });

        updateCategoryButtonStates();
    }

    function updateCategoryButtonStates() {
        document.querySelectorAll('.alc-category-tag').forEach(btn => {
            const catId = btn.getAttribute('data-category');
            const isActive = String(state.filters.categoryId || '') === String(catId);
            btn.classList.toggle('alc-active', isActive);
        });
    }

    // ==================== MEDIA LIBRARY ====================

    async function loadMedia(page = 1) {
        try {
            const rawParams = {
                page: page,
                page_size: state.pageSize,
            };
            if (state.filters.contentType) rawParams.content_type = state.filters.contentType;
            if (state.filters.categoryId) rawParams.category_id = state.filters.categoryId;
            if (state.filters.tag) rawParams.tag = state.filters.tag;
            if (state.filters.search) rawParams.search = state.filters.search;
            const params = new URLSearchParams(rawParams);

            const response = await api(`${API_BASE}/contents?${params}`);
            if (response.success) {
                state.contents = response.data || [];
                state.currentPage = response.pagination?.page || page;
                state.totalItems = response.pagination?.total || 0;
                renderMediaGrid();
                renderPagination();
            }
        } catch (error) {
            console.error('Failed to load media:', error);
        }
    }

    /**
     * Get content type icon emoji
     */
    function getContentTypeIcon(contentType) {
        switch (contentType) {
            case 'video': case 'video_local': case 'video_external':
                return '🎬';
            case 'document':
                return '📄';
            case 'image':
                return '🖼️';
            case 'article':
                return '📝';
            default:
                return '📎';
        }
    }

    /**
     * Render the ebook-style sidebar directory
     * Left sidebar shows categories as folders with content items underneath
     */
    function renderMediaGrid() {
        const nav = document.getElementById('ebookDirectory');
        if (!nav) return;

        if (state.contents.length === 0) {
            nav.innerHTML = '<p class="alc-ebook-nav-empty">暫無內容</p>';
            return;
        }

        // Build category lookup
        const flatCats = flattenCategories(state.categories);
        const catMap = {};
        flatCats.forEach(c => { catMap[c.id] = c; });

        // Group contents by category
        const grouped = {};
        const uncategorized = [];
        state.contents.forEach(content => {
            const catId = content.category_id || (content.category_ids && content.category_ids[0]) || null;
            if (catId && catMap[catId]) {
                if (!grouped[catId]) grouped[catId] = [];
                grouped[catId].push(content);
            } else {
                uncategorized.push(content);
            }
        });

        let html = '';

        // Render each category as a folder group
        flatCats.forEach(cat => {
            if (!grouped[cat.id] || grouped[cat.id].length === 0) return;
            const icon = cat.icon || '📁';
            html += `<div class="alc-ebook-folder">
                <div class="alc-ebook-folder-header" data-cat-id="${cat.id}">
                    <span class="alc-ebook-folder-arrow">▾</span>
                    <span class="alc-ebook-folder-icon">${icon}</span>
                    <span class="alc-ebook-folder-name">${escapeHtml(cat.name)}</span>
                </div>
                <ul class="alc-ebook-folder-items">`;

            grouped[cat.id].forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${escapeHtml(content.title)}</span>
                    <span class="alc-ebook-item-reorder">
                        <button class="alc-reorder-btn" data-dir="up" title="上移">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="下移">&#9660;</button>
                    </span>
                </li>`;
            });

            html += `</ul></div>`;
        });

        // Uncategorized items
        if (uncategorized.length > 0) {
            html += `<div class="alc-ebook-folder">
                <div class="alc-ebook-folder-header">
                    <span class="alc-ebook-folder-arrow">▾</span>
                    <span class="alc-ebook-folder-icon">📎</span>
                    <span class="alc-ebook-folder-name">其他資料</span>
                </div>
                <ul class="alc-ebook-folder-items">`;

            uncategorized.forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${escapeHtml(content.title)}</span>
                    <span class="alc-ebook-item-reorder">
                        <button class="alc-reorder-btn" data-dir="up" title="上移">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="下移">&#9660;</button>
                    </span>
                </li>`;
            });
            html += `</ul></div>`;
        }

        // If no categories at all, render flat list
        if (flatCats.length === 0 || Object.keys(grouped).length === 0) {
            html = '<ul class="alc-ebook-folder-items alc-ebook-folder-items--flat">';
            state.contents.forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${escapeHtml(content.title)}</span>
                    <span class="alc-ebook-item-reorder">
                        <button class="alc-reorder-btn" data-dir="up" title="上移">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="下移">&#9660;</button>
                    </span>
                </li>`;
            });
            html += '</ul>';
        }

        nav.innerHTML = html;

        // Folder toggle
        nav.querySelectorAll('.alc-ebook-folder-header').forEach(header => {
            header.addEventListener('click', () => {
                header.closest('.alc-ebook-folder').classList.toggle('alc-ebook-folder--collapsed');
            });
        });

        // Item click -> show content in right panel
        nav.querySelectorAll('.alc-ebook-item').forEach(item => {
            item.addEventListener('click', (e) => {
                // 忽略排序按钮的点击
                if (e.target.closest('.alc-reorder-btn')) return;
                // Highlight active
                nav.querySelectorAll('.alc-ebook-item').forEach(i => i.classList.remove('alc-ebook-item--active'));
                item.classList.add('alc-ebook-item--active');
                const contentId = item.getAttribute('data-id');
                showEbookContent(contentId);
            });
        });

        // 排序按钮（仅编辑模式可见）
        nav.querySelectorAll('.alc-reorder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.alc-ebook-item');
                const list = item.closest('.alc-ebook-folder-items');
                if (!list) return;

                const dir = btn.getAttribute('data-dir');
                if (dir === 'up' && item.previousElementSibling) {
                    list.insertBefore(item, item.previousElementSibling);
                } else if (dir === 'down' && item.nextElementSibling) {
                    list.insertBefore(item.nextElementSibling, item);
                }

                // 收集当前列表顺序并保存
                saveDirectoryOrder(list);
            });
        });
    }

    async function saveDirectoryOrder(listEl) {
        const items = listEl.querySelectorAll('.alc-ebook-item');
        const contentIds = Array.from(items).map(el => parseInt(el.getAttribute('data-id')));
        if (contentIds.length === 0) return;

        try {
            await apiPut(`${ADMIN_API}/contents/reorder`, { content_ids: contentIds });
        } catch (error) {
            console.error('排序保存失败:', error);
        }
    }

    /**
     * Display content inline in the right ebook viewer panel
     */
    async function showEbookContent(contentId) {
        const welcome = document.getElementById('ebookWelcome');
        const viewer = document.getElementById('ebookViewer');
        const titleEl = document.getElementById('ebookViewerTitle');
        const descEl = document.getElementById('ebookViewerDesc');
        const bodyEl = document.getElementById('ebookViewerBody');

        if (!viewer || !bodyEl) return;

        try {
            const response = await api(`${API_BASE}/contents/${contentId}`);
            if (!response.success) return;
            const content = response.data;

            // 更新 AI 助教的内容上下文
            state.currentContentId = parseInt(contentId);
            state.currentContentTitle = content.title || '';
            updateAiContextIndicator();

            // Hide welcome, show viewer
            if (welcome) welcome.style.display = 'none';
            viewer.style.display = 'flex';

            // Set header
            if (titleEl) titleEl.textContent = content.title || '';
            if (descEl) descEl.textContent = content.description || '';

            // Clear previous content
            bodyEl.innerHTML = '';

            // Render based on type
            switch (content.content_type) {
                case 'video':
                case 'video_local': {
                    const fileUrl = getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<video class="alc-ebook-video" controls>
                            <source src="${escapeHtml(fileUrl)}" type="${escapeHtml(content.mime_type || 'video/mp4')}">
                            您的瀏覽器不支持視頻播放
                        </video>`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入視頻</p>';
                    }
                    break;
                }
                case 'video_external': {
                    const embedUrl = parseVideoEmbed(content.external_url);
                    if (embedUrl) {
                        bodyEl.innerHTML = `<div class="alc-ebook-video-wrap">
                            <iframe class="alc-ebook-iframe" src="${escapeHtml(embedUrl)}"
                                frameborder="0" allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                            </iframe>
                        </div>`;
                    } else {
                        // Fallback: show link
                        bodyEl.innerHTML = `<p>外部視頻連結：<a href="${escapeHtml(content.external_url || '')}" target="_blank" rel="noopener">${escapeHtml(content.external_url || '無連結')}</a></p>`;
                    }
                    break;
                }
                case 'image': {
                    const fileUrl = content.image_url || getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<img class="alc-ebook-image" src="${escapeHtml(fileUrl)}" alt="${escapeHtml(content.title || '')}" />`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入圖片</p>';
                    }
                    break;
                }
                case 'document': {
                    const fileUrl = getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<iframe class="alc-ebook-doc-iframe" src="${escapeHtml(fileUrl)}" frameborder="0"></iframe>
                            <div class="alc-ebook-doc-actions">
                                <a href="${escapeHtml(fileUrl)}" class="alc-btn alc-btn--primary" download="${escapeHtml(content.title || 'download')}">下載文件</a>
                            </div>`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入文件</p>';
                    }
                    break;
                }
                case 'article': {
                    const articleContent = content.article_content || content.description || '';
                    if (typeof marked !== 'undefined' && articleContent) {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${marked.parse(articleContent)}</div>`;
                    } else {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${escapeHtml(articleContent) || '<p>暫無內容</p>'}</div>`;
                    }
                    break;
                }
                default: {
                    const fileUrl = getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<p>檔案：<a href="${escapeHtml(fileUrl)}" target="_blank" rel="noopener">${escapeHtml(content.title || '下載')}</a></p>`;
                    } else {
                        bodyEl.innerHTML = '<p>無法顯示此內容</p>';
                    }
                }
            }

        } catch (error) {
            console.error('Failed to load content:', error);
        }
    }

    function renderPagination() {
        // Pagination is not needed for ebook sidebar layout
        // all items are shown in directory
    }

    async function openContent(contentId) {
        // Redirect to inline ebook viewer
        showEbookContent(contentId);
    }

    function setTypeFilter(type) {
        // No longer used in ebook layout
    }

    function setupTypeFilters() {
        // No longer used in ebook layout (filters removed from HTML)
    }

    // ==================== KNOWLEDGE MAP (D3.js) ====================

    async function loadKnowledgeMap() {
        try {
            const response = await api(`${API_BASE}/knowledge-map`);
            if (response.success) {
                state.nodes = response.data.nodes || [];
                state.edges = response.data.edges || [];
                renderKnowledgeMap();
            }
        } catch (error) {
            console.error('Failed to load knowledge map:', error);
        }
    }

    // ---- Hierarchy helpers ----

    /** Node tier configuration by depth */
    const TIER_CONFIG = {
        0: { radius: 50, border: 4, fontSize: 15, iconSize: 28, shadow: 12, label: 'root' },
        1: { radius: 34, border: 3, fontSize: 12, iconSize: 20, shadow: 6,  label: 'L1' },
        2: { radius: 22, border: 2, fontSize: 10, iconSize: 14, shadow: 3,  label: 'L2' },
        3: { radius: 16, border: 1.5, fontSize: 9, iconSize: 12, shadow: 2, label: 'L3' },
    };

    /** Radial Tree layout configuration */
    const LAYOUT_CONFIG = {
        defaultCollapseDepth: 1,              // 默认只展示 root + L1
        ringRadii: [0, 260, 440, 640, 800],  // depth 0-4 各层半径 (L1≈260, L2≈440, L3≈640)
        nodeSpacing: 2.2,                     // d3.tree separation 系数
        animationDuration: 600,               // 展开/收起动画时长 ms
        collisionPadding: 14,                 // forceCollide: radius + padding
        collisionIterations: 6,               // collision resolution iterations
        sectorGap: 0.08,                      // radians gap between L0 subtree sectors
        lodLabelThreshold: 1.1,               // zoom < this → hide L2+ labels
        lodCrossLinkThreshold: 1.5,           // zoom > this → show cross-links
    };

    /** Edge color palette by relation_type */
    const EDGE_COLORS = {
        '包含': '#999',
        '前置': '#006633',
        '關聯': '#0066cc',
        '关联': '#0066cc',
        '影響': '#e67e22',
        '影响': '#e67e22',
        '備選': '#8e44ad',
        '备选': '#8e44ad',
        '延伸': '#0066cc',
    };
    const EDGE_COLOR_DEFAULT = '#aaa';

    /**
     * Detect hierarchy via BFS from zero-in-degree root nodes.
     * Attaches `_depth`, `_tierCfg`, `_children` to each node in-place.
     * Returns { childrenMap, adjacencyMap, hierarchyEdges, crossEdges }.
     */
    function computeHierarchy(nodes, edges) {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const inDegree = new Map(nodes.map(n => [n.id, 0]));
        const childrenMap = new Map(nodes.map(n => [n.id, []]));
        const adjacencyMap = new Map(nodes.map(n => [n.id, new Set()]));

        // Separate hierarchy (包含) edges from cross-link edges
        const hierarchyEdges = [];
        const crossEdges = [];

        edges.forEach(e => {
            const sId = e.source_node_id ?? (typeof e.source === 'object' ? e.source.id : e.source);
            const tId = e.target_node_id ?? (typeof e.target === 'object' ? e.target.id : e.target);
            if (!nodeMap.has(sId) || !nodeMap.has(tId)) return;

            adjacencyMap.get(sId).add(tId);
            adjacencyMap.get(tId).add(sId);

            const relType = e.relation_type || e.relationship_type || e.label || '';
            if (relType === '包含') {
                inDegree.set(tId, (inDegree.get(tId) || 0) + 1);
                childrenMap.get(sId).push(tId);
                hierarchyEdges.push(e);
            } else {
                crossEdges.push(e);
            }
        });

        // Find roots = nodes with 0 in-degree within hierarchy edges
        const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);

        // BFS to assign depth
        nodes.forEach(n => { n._depth = Infinity; });
        const queue = [];
        roots.forEach(r => { r._depth = 0; queue.push(r); });

        while (queue.length > 0) {
            const current = queue.shift();
            const kids = childrenMap.get(current.id) || [];
            kids.forEach(kidId => {
                const kid = nodeMap.get(kidId);
                if (kid && kid._depth > current._depth + 1) {
                    kid._depth = current._depth + 1;
                    queue.push(kid);
                }
            });
        }

        // Assign tier config: depth 0 → root, 1 → L1, 2 → L2, 3+ → L3
        const maxTier = Math.max(...Object.keys(TIER_CONFIG).map(Number));
        nodes.forEach(n => {
            if (n._depth === Infinity) n._depth = 2; // orphans treated as L2
            const tierKey = Math.min(n._depth, maxTier);
            n._tierCfg = TIER_CONFIG[tierKey];
            n._children = childrenMap.get(n.id) || [];
            n._collapsed = false;
            n._visible = true;
        });

        return { childrenMap, adjacencyMap, hierarchyEdges, crossEdges };
    }

    /**
     * Collect all descendant IDs of a node via BFS over childrenMap.
     */
    function getDescendants(nodeId, childrenMap) {
        const result = new Set();
        const stack = [...(childrenMap.get(nodeId) || [])];
        while (stack.length > 0) {
            const id = stack.pop();
            if (result.has(id)) continue;
            result.add(id);
            (childrenMap.get(id) || []).forEach(c => stack.push(c));
        }
        return result;
    }

    /**
     * Truncate text with ellipsis; handles CJK and Latin.
     */
    function truncateLabel(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    }

    /**
     * Count visible descendants (recursive) for subtree weight calculation.
     */
    function countVisibleDescendants(nodeId, childrenMap, nodeMap) {
        const node = nodeMap.get(nodeId);
        if (!node || !node._visible) return 0;
        if (node._collapsed) return 0; // collapsed = no visible children below
        const kids = (childrenMap.get(nodeId) || []).filter(cId => {
            const c = nodeMap.get(cId);
            return c && c._visible;
        });
        let count = kids.length;
        kids.forEach(cId => { count += countVisibleDescendants(cId, childrenMap, nodeMap); });
        return count;
    }

    /**
     * Build a radial tree layout with sector-based angle allocation
     * and post-layout collision resolution.
     *
     * Strategy:
     * 1. Each root (depth-0) node gets a proportional angular sector based on
     *    its visible subtree size (leaf-weighted).
     * 2. Within each sector, L1 children are evenly spaced.
     * 3. Within each L1 sub-sector, L2/L3 children are further subdivided.
     * 4. After angle allocation, a collision-resolution pass nudges overlapping
     *    nodes on the same ring apart.
     *
     * @param {Array} nodes - All graph nodes (with _depth, _collapsed, _visible set)
     * @param {Map} childrenMap - Map<nodeId, [childId, ...]>
     * @returns {{ treeRoot: null, layoutMap: Map }}
     */
    function buildRadialTree(nodes, childrenMap) {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const layoutMap = new Map();

        // Find real root nodes (depth 0)
        const realRoots = nodes.filter(n => n._depth === 0 && n._visible);
        if (realRoots.length === 0) return { treeRoot: null, layoutMap };

        // ── 1. Compute subtree weights for proportional sector allocation ──
        // Weight = 1 (self) + visible descendants; minimum 1 so even leaf-roots get space
        const rootWeights = realRoots.map(r => {
            const desc = countVisibleDescendants(r.id, childrenMap, nodeMap);
            return { root: r, weight: Math.max(1, 1 + desc) };
        });
        const totalWeight = rootWeights.reduce((s, rw) => s + rw.weight, 0);
        const totalGap = LAYOUT_CONFIG.sectorGap * realRoots.length;
        const availableAngle = 2 * Math.PI - totalGap;

        // ── 2. Assign sectors to root nodes ──
        let currentAngle = 0;
        const rootSectors = []; // { root, startAngle, endAngle, midAngle }

        rootWeights.forEach(rw => {
            const sectorSize = (rw.weight / totalWeight) * availableAngle;
            const startAngle = currentAngle;
            const endAngle = currentAngle + sectorSize;
            const midAngle = (startAngle + endAngle) / 2;
            rootSectors.push({ root: rw.root, startAngle, endAngle, midAngle, sectorSize });
            currentAngle = endAngle + LAYOUT_CONFIG.sectorGap;
        });

        // ── 3. Place root nodes ──
        // If single root → center. Multiple roots → spread on a ring (radius ~100)
        const rootRadius = realRoots.length > 1 ? Math.max(LAYOUT_CONFIG.ringRadii[0], 100) : 0;

        rootSectors.forEach(rs => {
            const r = rs.root;
            const angle = rs.midAngle;
            const radius = rootRadius;
            const x = radius * Math.sin(angle);
            const y = -radius * Math.cos(angle);
            r.x = x; r.y = y; r._angle = angle; r._radius = radius;
            layoutMap.set(r.id, { x, y, angle, radius });
        });

        // ── 4. Recursively place children within their parent's sector ──
        function placeChildren(parentId, sectorStart, sectorEnd, depth) {
            const parent = nodeMap.get(parentId);
            if (!parent || parent._collapsed) return;

            const kids = (childrenMap.get(parentId) || []).filter(cId => {
                const c = nodeMap.get(cId);
                return c && c._visible;
            });
            if (kids.length === 0) return;

            const ringIdx = Math.min(depth, LAYOUT_CONFIG.ringRadii.length - 1);
            const radius = LAYOUT_CONFIG.ringRadii[ringIdx];

            // Compute sub-sector weights for children
            const kidWeights = kids.map(cId => {
                const desc = countVisibleDescendants(cId, childrenMap, nodeMap);
                return { id: cId, weight: Math.max(1, 1 + desc) };
            });
            const totalKidWeight = kidWeights.reduce((s, kw) => s + kw.weight, 0);

            // Minimum angular spacing per child based on node radius
            const tierKey = Math.min(depth, Math.max(...Object.keys(TIER_CONFIG).map(Number)));
            const nodeRadius = TIER_CONFIG[tierKey].radius;
            const minAngularSpacing = (2 * (nodeRadius + LAYOUT_CONFIG.collisionPadding)) / Math.max(radius, 1);

            let sectorSize = sectorEnd - sectorStart;
            // Ensure enough room; if sector too small, expand minimally
            const minNeeded = kids.length * minAngularSpacing;
            if (sectorSize < minNeeded) {
                // Center-expand the sector
                const mid = (sectorStart + sectorEnd) / 2;
                sectorStart = mid - minNeeded / 2;
                sectorEnd = mid + minNeeded / 2;
                sectorSize = minNeeded;
            }

            // Place each child proportionally within the sector
            let childAngle = sectorStart;
            kidWeights.forEach(kw => {
                const childSectorSize = (kw.weight / totalKidWeight) * sectorSize;
                const angle = childAngle + childSectorSize / 2;

                const c = nodeMap.get(kw.id);
                if (c) {
                    const x = radius * Math.sin(angle);
                    const y = -radius * Math.cos(angle);
                    c.x = x; c.y = y; c._angle = angle; c._radius = radius;
                    layoutMap.set(c.id, { x, y, angle, radius });

                    // Recurse into child's sub-sector
                    placeChildren(kw.id, childAngle, childAngle + childSectorSize, depth + 1);
                }
                childAngle += childSectorSize;
            });
        }

        rootSectors.forEach(rs => {
            placeChildren(rs.root.id, rs.startAngle, rs.endAngle, 1);
        });

        // ── 5. Handle orphan nodes (not in any subtree) ──
        nodes.forEach(n => {
            if (!layoutMap.has(n.id) && n._visible) {
                const fallbackAngle = Math.random() * 2 * Math.PI;
                const fallbackR = LAYOUT_CONFIG.ringRadii[LAYOUT_CONFIG.ringRadii.length - 1] + 100;
                n.x = fallbackR * Math.sin(fallbackAngle);
                n.y = -fallbackR * Math.cos(fallbackAngle);
                n._angle = fallbackAngle;
                n._radius = fallbackR;
                layoutMap.set(n.id, { x: n.x, y: n.y, angle: fallbackAngle, radius: fallbackR });
            }
        });

        // ── 6. Post-layout collision resolution on same ring ──
        // Group visible nodes by their ring radius, then iteratively push apart
        const ringGroups = new Map(); // radius → [node, ...]
        nodes.forEach(n => {
            if (!n._visible || n._radius == null) return;
            const rKey = Math.round(n._radius);
            if (!ringGroups.has(rKey)) ringGroups.set(rKey, []);
            ringGroups.get(rKey).push(n);
        });

        for (let iter = 0; iter < LAYOUT_CONFIG.collisionIterations; iter++) {
            ringGroups.forEach((ringNodes, rKey) => {
                if (ringNodes.length < 2 || rKey === 0) return;
                const radius = ringNodes[0]._radius;

                // Sort by angle
                ringNodes.sort((a, b) => a._angle - b._angle);

                for (let i = 0; i < ringNodes.length; i++) {
                    const a = ringNodes[i];
                    const b = ringNodes[(i + 1) % ringNodes.length];

                    const tierA = Math.min(a._depth, Math.max(...Object.keys(TIER_CONFIG).map(Number)));
                    const tierB = Math.min(b._depth, Math.max(...Object.keys(TIER_CONFIG).map(Number)));
                    const rA = TIER_CONFIG[tierA].radius;
                    const rB = TIER_CONFIG[tierB].radius;
                    const minDist = rA + rB + LAYOUT_CONFIG.collisionPadding * 2;

                    // Angular distance between a and b
                    let angleDiff = b._angle - a._angle;
                    if (i === ringNodes.length - 1) {
                        // Wrap-around
                        angleDiff = (b._angle + 2 * Math.PI) - a._angle;
                    }
                    const arcDist = angleDiff * radius;

                    if (arcDist < minDist && arcDist > 0) {
                        // Push apart
                        const pushAngle = ((minDist - arcDist) / radius) / 2;
                        a._angle -= pushAngle * 0.5;
                        b._angle += pushAngle * 0.5;
                    }
                }

                // Update cartesian coordinates
                ringNodes.forEach(n => {
                    n.x = n._radius * Math.sin(n._angle);
                    n.y = -n._radius * Math.cos(n._angle);
                    const entry = layoutMap.get(n.id);
                    if (entry) {
                        entry.x = n.x; entry.y = n.y; entry.angle = n._angle;
                    }
                });
            });
        }

        return { treeRoot: null, layoutMap };
    }

    /**
     * Find ancestor path from a node up to a root node via parent mapping.
     * Returns array of node IDs from root down to (but not including) the target.
     */
    function getAncestorPath(nodeId, parentMap) {
        const path = [];
        let current = parentMap.get(nodeId);
        while (current) {
            path.unshift(current);
            current = parentMap.get(current);
        }
        return path;
    }

    // ---- Main render function ----

    function renderKnowledgeMap() {
        const svgElement = getElement('knowledgeMapSvg');
        if (!svgElement || !window.d3) {
            console.warn('D3.js not loaded or SVG element not found');
            return;
        }

        // Hide loading, show empty state if no data
        const loadingEl = getElement('mapLoadingState');
        const emptyEl = getElement('mapEmptyState');
        if (loadingEl) loadingEl.style.display = 'none';

        if (state.nodes.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        // Clear previous content
        d3.select(svgElement).selectAll('*').remove();

        // ── A. Hierarchy detection ──
        const { childrenMap, adjacencyMap, hierarchyEdges, crossEdges } =
            computeHierarchy(state.nodes, state.edges);

        // Build parent map for ancestor path lookups
        const parentMap = new Map();
        hierarchyEdges.forEach(e => {
            const sId = e.source_node_id ?? (typeof e.source === 'object' ? e.source.id : e.source);
            const tId = e.target_node_id ?? (typeof e.target === 'object' ? e.target.id : e.target);
            parentMap.set(tId, sId);
        });

        // Build D3 edge arrays (keep source/target as IDs, resolve to objects later)
        const nodeMap = new Map(state.nodes.map(n => [n.id, n]));
        const toD3Edge = (e, isHierarchy) => ({
            ...e,
            source: e.source_node_id,
            target: e.target_node_id,
            label: e.relationship_type || e.label || '',
            _isHierarchy: isHierarchy,
        });
        const d3HierarchyEdges = hierarchyEdges.map(e => toD3Edge(e, true));
        const d3CrossEdges = crossEdges.map(e => toD3Edge(e, false));

        // ── B. Default collapse — only show root + L1 initially ──
        state.nodes.forEach(n => {
            if (n._depth > 0 && n._children.length > 0) {
                n._collapsed = (n._depth >= LAYOUT_CONFIG.defaultCollapseDepth);
            }
            n._visible = (n._depth <= LAYOUT_CONFIG.defaultCollapseDepth);
        });

        // ── C. Radial Tree layout ──
        buildRadialTree(state.nodes, childrenMap);

        // ── Setup dimensions ──
        const width = svgElement.clientWidth || 800;
        const height = svgElement.clientHeight || 600;
        const cx = width / 2;
        const cy = height / 2;

        const svg = d3.select(svgElement)
            .attr('width', width)
            .attr('height', height);

        // ── Defs: arrow markers per type + glow filter ──
        const defs = svg.append('defs');

        // Arrow markers for each edge color
        const markerColors = { hierarchy: '#ccc', prerequisite: '#006633', relation: '#0066cc', fallback: '#aaa' };
        Object.entries(markerColors).forEach(([key, color]) => {
            defs.append('marker')
                .attr('id', `arrow-${key}`)
                .attr('markerWidth', 8).attr('markerHeight', 8)
                .attr('refX', 6).attr('refY', 3)
                .attr('orient', 'auto')
                .append('polygon')
                .attr('points', '0 0, 8 3, 0 6')
                .attr('fill', color);
        });

        // Glow filter for root nodes
        const glowFilter = defs.append('filter')
            .attr('id', 'rootGlow')
            .attr('x', '-50%').attr('y', '-50%')
            .attr('width', '200%').attr('height', '200%');
        glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', 6).attr('result', 'blur');
        glowFilter.append('feMerge')
            .selectAll('feMergeNode')
            .data(['blur', 'SourceGraphic'])
            .enter().append('feMergeNode')
            .attr('in', d => d);

        // ── Layer groups (order matters for z-index) ──
        const g = svg.append('g').attr('class', 'kg-root-group');

        // Ring guide circles (subtle concentric rings for depth reference)
        const ringGuideGroup = g.append('g').attr('class', 'kg-ring-guides');

        function updateRingGuides() {
            ringGuideGroup.selectAll('.kg-ring-guide').remove();
            // Draw rings only for depths that have visible nodes
            const activeRadii = new Set();
            state.nodes.forEach(n => {
                if (n._visible && n._radius > 0) activeRadii.add(Math.round(n._radius));
            });
            activeRadii.forEach(r => {
                ringGuideGroup.append('circle')
                    .attr('cx', 0).attr('cy', 0)
                    .attr('r', r)
                    .attr('class', 'kg-ring-guide')
                    .attr('fill', 'none')
                    .attr('stroke', '#eee')
                    .attr('stroke-width', 0.5)
                    .attr('stroke-dasharray', '4 4')
                    .attr('pointer-events', 'none');
            });
        }
        updateRingGuides();

        const crossLinkGroup = g.append('g').attr('class', 'kg-cross-links');
        const hierLinkGroup  = g.append('g').attr('class', 'kg-hier-links');
        const nodeGroupEl    = g.append('g').attr('class', 'kg-nodes');

        // ── D. Render hierarchy edges as paths (radial curves) ──
        const hierLinks = hierLinkGroup.selectAll('path.kg-hier-edge')
            .data(d3HierarchyEdges)
            .enter().append('path')
            .attr('class', 'kg-hier-edge')
            .attr('fill', 'none')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1.2)
            .attr('stroke-opacity', d => {
                const s = nodeMap.get(d.source);
                const t = nodeMap.get(d.target);
                return (s && s._visible && t && t._visible) ? 0.5 : 0;
            })
            .attr('d', d => {
                const s = nodeMap.get(d.source);
                const t = nodeMap.get(d.target);
                if (!s || !t) return '';
                return computeHierEdgePath(s, t);
            });

        // ── Render cross-link edges (straight lines, hidden by default) ──
        const crossLinks = crossLinkGroup.selectAll('line.kg-cross-edge')
            .data(d3CrossEdges)
            .enter().append('line')
            .attr('class', 'kg-cross-edge')
            .attr('stroke', d => {
                const rel = d.relation_type || d.relationship_type || '';
                return EDGE_COLORS[rel] || EDGE_COLOR_DEFAULT;
            })
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '6 3')
            .attr('stroke-opacity', 0)
            .attr('x1', d => { const s = nodeMap.get(d.source); return s ? s.x : 0; })
            .attr('y1', d => { const s = nodeMap.get(d.source); return s ? s.y : 0; })
            .attr('x2', d => { const t = nodeMap.get(d.target); return t ? t.x : 0; })
            .attr('y2', d => { const t = nodeMap.get(d.target); return t ? t.y : 0; });

        // Edge labels for cross-links (hidden by default)
        const crossEdgeLabels = crossLinkGroup.selectAll('text.kg-cross-label')
            .data(d3CrossEdges)
            .enter().append('text')
            .attr('class', 'kg-cross-label')
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .attr('opacity', 0)
            .attr('x', d => {
                const s = nodeMap.get(d.source);
                const t = nodeMap.get(d.target);
                return s && t ? (s.x + t.x) / 2 : 0;
            })
            .attr('y', d => {
                const s = nodeMap.get(d.source);
                const t = nodeMap.get(d.target);
                return s && t ? (s.y + t.y) / 2 - 6 : 0;
            })
            .text(d => d.label || '');

        // Helper: compute smooth hierarchy edge path (quadratic curve via origin)
        function computeHierEdgePath(source, target) {
            const sx = source.x, sy = source.y;
            const tx = target.x, ty = target.y;
            // Curve control point: midpoint pulled toward center
            const mx = (sx + tx) / 2 * 0.8;
            const my = (sy + ty) / 2 * 0.8;
            return `M${sx},${sy} Q${mx},${my} ${tx},${ty}`;
        }

        // ── E. Render node groups ──
        const nodeGroups = nodeGroupEl.selectAll('g.kg-node')
            .data(state.nodes)
            .enter().append('g')
            .attr('class', d => `kg-node kg-depth-${Math.min(d._depth, 3)}`)
            .attr('cursor', 'pointer')
            .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
            .attr('opacity', d => d._visible ? 1 : 0)
            .attr('pointer-events', d => d._visible ? 'all' : 'none')
            .on('click', (event, d) => {
                event.stopPropagation();
                showNodeDetail(d);
            })
            .on('dblclick', (event, d) => {
                event.stopPropagation();
                toggleCollapse(d);
            })
            .on('mouseenter', (event, d) => {
                handleNodeHover(d, true);
                _tooltipTimer = setTimeout(() => showNodeTooltip(d, event), 300);
            })
            .on('mouseleave', () => {
                handleNodeHover(null, false);
                hideNodeTooltip();
            });

        // Glow ring for root nodes
        nodeGroups.filter(d => d._depth === 0)
            .append('circle')
            .attr('class', 'kg-glow-ring')
            .attr('r', d => d._tierCfg.radius + 8)
            .attr('fill', 'none')
            .attr('stroke', d => d.color || '#006633')
            .attr('stroke-width', 3)
            .attr('stroke-opacity', 0.4)
            .attr('filter', 'url(#rootGlow)');

        // Main circle
        nodeGroups.append('circle')
            .attr('class', 'kg-node-circle')
            .attr('r', d => d._tierCfg.radius)
            .attr('fill', d => d.color || '#4CAF50')
            .attr('stroke', '#fff')
            .attr('stroke-width', d => d._tierCfg.border)
            .style('filter', d => `drop-shadow(0 2px ${d._tierCfg.shadow}px rgba(0,0,0,0.25))`);

        // Icon
        nodeGroups.append('text')
            .attr('class', 'kg-node-icon')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('dy', d => d._depth === 0 ? '-0.25em' : '-0.15em')
            .attr('font-size', d => d._tierCfg.iconSize + 'px')
            .attr('pointer-events', 'none')
            .text(d => d.icon || '📌');

        // In-circle label (root + L1 only)
        nodeGroups.filter(d => d._depth <= 1)
            .append('text')
            .attr('class', 'kg-node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d._depth === 0 ? '1.6em' : '1.5em')
            .attr('font-size', d => d._tierCfg.fontSize + 'px')
            .attr('font-weight', '600')
            .attr('fill', '#fff')
            .attr('pointer-events', 'none')
            .text(d => {
                const maxLen = d._depth === 0 ? 12 : 8;
                return truncateLabel(d.title, maxLen);
            });

        // Below-node title (visible for root + L1, hidden for L2+ until hover)
        nodeGroups.append('text')
            .attr('class', 'kg-node-title')
            .attr('text-anchor', 'middle')
            .attr('dy', d => (d._tierCfg.radius + 16) + 'px')
            .attr('font-size', d => (d._depth === 0 ? 13 : 11) + 'px')
            .attr('font-weight', '500')
            .attr('fill', '#333')
            .attr('pointer-events', 'none')
            .attr('opacity', d => d._depth <= 1 ? 1 : 0)
            .text(d => d.title);

        // Descendant count badge (replaces old collapse indicator)
        function updateDescendantBadges() {
            nodeGroups.selectAll('.kg-descendant-badge').remove();

            const collapsedWithKids = nodeGroups.filter(d =>
                d._children.length > 0 && d._collapsed && d._visible
            );

            const badge = collapsedWithKids.append('g')
                .attr('class', 'kg-descendant-badge');

            badge.append('circle')
                .attr('cx', d => d._tierCfg.radius * 0.7)
                .attr('cy', d => -(d._tierCfg.radius * 0.7))
                .attr('r', 11)
                .attr('fill', 'var(--brand, #006633)')
                .attr('stroke', '#fff')
                .attr('stroke-width', 1.5);

            badge.append('text')
                .attr('x', d => d._tierCfg.radius * 0.7)
                .attr('y', d => -(d._tierCfg.radius * 0.7))
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', '9px')
                .attr('font-weight', '700')
                .attr('fill', '#fff')
                .attr('pointer-events', 'none')
                .text(d => {
                    const count = getDescendants(d.id, childrenMap).size;
                    return '+' + count;
                });
        }

        // Content count badge for nodes with linked content
        const badgeGroups = nodeGroups.filter(d => d.contents && d.contents.length > 0);

        badgeGroups.append('circle')
            .attr('class', 'kg-badge-bg')
            .attr('cx', d => d._depth === 0 ? d._tierCfg.radius * 0.65 : d._tierCfg.radius * 0.55)
            .attr('cy', d => d._depth === 0 ? -d._tierCfg.radius * 0.65 : -d._tierCfg.radius * 0.55)
            .attr('r', 8)
            .attr('fill', '#e67e22')
            .attr('stroke', '#fff')
            .attr('stroke-width', 1.5);

        badgeGroups.append('text')
            .attr('class', 'kg-badge-text')
            .attr('x', d => d._depth === 0 ? d._tierCfg.radius * 0.65 : d._tierCfg.radius * 0.55)
            .attr('y', d => d._depth === 0 ? -d._tierCfg.radius * 0.65 : -d._tierCfg.radius * 0.55)
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('font-size', '8px')
            .attr('font-weight', '700')
            .attr('fill', '#fff')
            .attr('pointer-events', 'none')
            .text(d => d.contents.length);

        // Initial descendant badges
        updateDescendantBadges();

        // ── F. Zoom with LOD ──
        let currentScale = 1;

        const zoom = d3.zoom()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                state.lastZoomTransform = event.transform;
                const newScale = event.transform.k;
                if (Math.abs(newScale - currentScale) > 0.05) {
                    currentScale = newScale;
                    applyLOD(newScale);
                }
            });

        svg.call(zoom);

        // Center view on the radial tree (origin is at 0,0)
        const initialTransform = d3.zoomIdentity.translate(cx, cy).scale(0.75);
        svg.call(zoom.transform, initialTransform);

        function applyLOD(scale) {
            const lblThreshold = LAYOUT_CONFIG.lodLabelThreshold;     // 1.1
            const clThreshold = LAYOUT_CONFIG.lodCrossLinkThreshold;  // 1.5

            if (scale < 0.4) {
                // Far out: only root visible
                nodeGroups.attr('opacity', d => (d._visible && d._depth === 0) ? 1 : 0.1);
                hierLinks.attr('stroke-opacity', 0.1);
                crossLinks.attr('stroke-opacity', 0);
                crossEdgeLabels.attr('opacity', 0);
            } else if (scale < clThreshold) {
                // Normal: show visible nodes per collapse state
                nodeGroups.attr('opacity', d => d._visible ? 1 : 0);
                hierLinks.attr('stroke-opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.5 : 0;
                });
                crossLinks.attr('stroke-opacity', 0);
                crossEdgeLabels.attr('opacity', 0);
            } else {
                // Zoomed in: show cross-links and edge labels too
                nodeGroups.attr('opacity', d => d._visible ? 1 : 0);
                hierLinks.attr('stroke-opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.6 : 0;
                });
                crossLinks.attr('stroke-opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.6 : 0;
                });
                crossEdgeLabels.attr('opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.8 : 0;
                });
            }

            // Label LOD: zoom < lodLabelThreshold → hide L2+ below-node titles
            // zoom >= lodLabelThreshold → show L2+ titles for visible nodes
            nodeGroups.selectAll('.kg-node-title')
                .attr('opacity', d => {
                    if (!d._visible) return 0;
                    if (d._depth <= 1) return 1; // root + L1 always show title
                    return scale >= lblThreshold ? 0.85 : 0; // L2+ only at zoom≥1.1
                });

            // In-circle labels: hide L1 in-circle label when zoomed out too far
            nodeGroups.selectAll('.kg-node-label')
                .attr('opacity', d => {
                    if (!d._visible) return 0;
                    if (d._depth === 0) return 1;
                    return scale >= 0.6 ? 1 : 0;
                });
        }

        // ── G. Hover path highlighting ──
        function handleNodeHover(hoveredNode, isEntering) {
            if (!isEntering || !hoveredNode) {
                // Restore default
                nodeGroups.transition().duration(200)
                    .attr('opacity', d => d._visible ? 1 : 0);
                hierLinks.transition().duration(200)
                    .attr('stroke-opacity', d => {
                        const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                        const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                        return (s && s._visible && t && t._visible) ? 0.5 : 0;
                    })
                    .attr('stroke-width', 1.2);
                crossLinks.transition().duration(200)
                    .attr('stroke-opacity', 0);
                crossEdgeLabels.transition().duration(200).attr('opacity', 0);
                applyLOD(currentScale); // re-apply LOD state (includes label opacity)
                return;
            }

            const neighbors = adjacencyMap.get(hoveredNode.id) || new Set();

            // Dim non-neighbors
            nodeGroups.transition().duration(200)
                .attr('opacity', d => {
                    if (!d._visible) return 0;
                    if (d.id === hoveredNode.id || neighbors.has(d.id)) return 1;
                    return 0.15;
                });

            // Show titles on hover for hovered + neighbors (regardless of LOD)
            nodeGroups.selectAll('.kg-node-title')
                .transition().duration(200)
                .attr('opacity', d => {
                    if (d.id === hoveredNode.id || neighbors.has(d.id)) return 1;
                    if (d._depth <= 1) return 0.15;
                    return 0;
                });

            // Highlight connected hierarchy edges
            hierLinks.transition().duration(200)
                .attr('stroke-opacity', d => {
                    const sId = typeof d.source === 'object' ? d.source.id : d.source;
                    const tId = typeof d.target === 'object' ? d.target.id : d.target;
                    if (sId === hoveredNode.id || tId === hoveredNode.id) return 0.9;
                    return 0.08;
                })
                .attr('stroke-width', d => {
                    const sId = typeof d.source === 'object' ? d.source.id : d.source;
                    const tId = typeof d.target === 'object' ? d.target.id : d.target;
                    return (sId === hoveredNode.id || tId === hoveredNode.id) ? 2.5 : 1.2;
                });

            // Show connected cross-links on hover
            crossLinks.transition().duration(200)
                .attr('stroke-opacity', d => {
                    const sId = typeof d.source === 'object' ? d.source.id : d.source;
                    const tId = typeof d.target === 'object' ? d.target.id : d.target;
                    return (sId === hoveredNode.id || tId === hoveredNode.id) ? 0.7 : 0;
                });

            crossEdgeLabels.transition().duration(200)
                .attr('opacity', d => {
                    const sId = typeof d.source === 'object' ? d.source.id : d.source;
                    const tId = typeof d.target === 'object' ? d.target.id : d.target;
                    return (sId === hoveredNode.id || tId === hoveredNode.id) ? 0.9 : 0;
                });
        }

        // ── H. Expand / Collapse with tree re-layout + auto-center ──
        function toggleCollapse(node) {
            if (!node._children || node._children.length === 0) return;

            const wasCollapsed = node._collapsed;
            node._collapsed = !node._collapsed;
            const descendants = getDescendants(node.id, childrenMap);

            if (node._collapsed) {
                // Hide all descendants
                descendants.forEach(id => {
                    const n = state.nodes.find(nd => nd.id === id);
                    if (n) n._visible = false;
                });
            } else {
                // Show children (but respect their own collapsed state)
                const revealQueue = [...(childrenMap.get(node.id) || [])];
                while (revealQueue.length > 0) {
                    const id = revealQueue.shift();
                    const n = state.nodes.find(nd => nd.id === id);
                    if (n) {
                        n._visible = true;
                        if (!n._collapsed) {
                            (childrenMap.get(id) || []).forEach(c => revealQueue.push(c));
                        }
                    }
                }
            }

            // Recompute radial tree layout
            buildRadialTree(state.nodes, childrenMap);

            const dur = LAYOUT_CONFIG.animationDuration;

            // Animate nodes to new positions
            nodeGroups.transition().duration(dur)
                .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
                .attr('opacity', d => d._visible ? 1 : 0)
                .attr('pointer-events', d => d._visible ? 'all' : 'none');

            // Animate hierarchy edges
            hierLinks.transition().duration(dur)
                .attr('d', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    if (!s || !t) return '';
                    return computeHierEdgePath(s, t);
                })
                .attr('stroke-opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.5 : 0;
                });

            // Update cross-link positions
            crossLinks.transition().duration(dur)
                .attr('x1', d => { const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.x : 0; })
                .attr('y1', d => { const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.y : 0; })
                .attr('x2', d => { const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.x : 0; })
                .attr('y2', d => { const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.y : 0; })
                .attr('stroke-opacity', 0);

            crossEdgeLabels.transition().duration(dur)
                .attr('x', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return s && t ? (s.x + t.x) / 2 : 0;
                })
                .attr('y', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return s && t ? (s.y + t.y) / 2 - 6 : 0;
                });

            // Update ring guides
            updateRingGuides();

            // Update descendant badges
            updateDescendantBadges();

            // Re-apply LOD after layout change
            applyLOD(currentScale);

            // Auto-center on expanded branch (only when expanding, not collapsing)
            if (!node._collapsed && wasCollapsed) {
                // Compute bounding box of the expanded subtree (node + revealed children)
                const branchNodes = [node];
                descendants.forEach(id => {
                    const n = state.nodes.find(nd => nd.id === id);
                    if (n && n._visible) branchNodes.push(n);
                });

                if (branchNodes.length > 1) {
                    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
                    branchNodes.forEach(n => {
                        if (n.x < minX) minX = n.x;
                        if (n.x > maxX) maxX = n.x;
                        if (n.y < minY) minY = n.y;
                        if (n.y > maxY) maxY = n.y;
                    });
                    const centerX = (minX + maxX) / 2;
                    const centerY = (minY + maxY) / 2;

                    // Pan to center the branch, keep current zoom scale
                    const svgElement = getElement('knowledgeMapSvg');
                    const w = svgElement ? svgElement.clientWidth || 800 : 800;
                    const h = svgElement ? svgElement.clientHeight || 600 : 600;
                    const scale = currentScale || 0.85;
                    svg.transition().duration(dur + 200).call(
                        zoom.transform,
                        d3.zoomIdentity
                            .translate(w / 2, h / 2)
                            .scale(scale)
                            .translate(-centerX, -centerY)
                    );
                }
            }
        }

        // ── I. Overview / Explore mode toggle ──
        let _exploreMode = false;

        function setExploreMode(explore) {
            _exploreMode = explore;

            if (explore) {
                // Expand all
                state.nodes.forEach(n => {
                    n._collapsed = false;
                    n._visible = true;
                });
            } else {
                // Collapse to default depth
                state.nodes.forEach(n => {
                    if (n._depth > 0 && n._children.length > 0) {
                        n._collapsed = (n._depth >= LAYOUT_CONFIG.defaultCollapseDepth);
                    }
                    n._visible = (n._depth <= LAYOUT_CONFIG.defaultCollapseDepth);
                });
            }

            // Recompute layout
            buildRadialTree(state.nodes, childrenMap);

            const dur = LAYOUT_CONFIG.animationDuration;

            nodeGroups.transition().duration(dur)
                .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
                .attr('opacity', d => d._visible ? 1 : 0)
                .attr('pointer-events', d => d._visible ? 'all' : 'none');

            hierLinks.transition().duration(dur)
                .attr('d', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    if (!s || !t) return '';
                    return computeHierEdgePath(s, t);
                })
                .attr('stroke-opacity', d => {
                    const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                    const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                    return (s && s._visible && t && t._visible) ? 0.5 : 0;
                });

            crossLinks.transition().duration(dur)
                .attr('x1', d => { const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.x : 0; })
                .attr('y1', d => { const s = nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.y : 0; })
                .attr('x2', d => { const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.x : 0; })
                .attr('y2', d => { const t = nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.y : 0; })
                .attr('stroke-opacity', 0);

            updateRingGuides();
            updateDescendantBadges();
            applyLOD(currentScale);

            // Update toggle button state
            const toggleBtn = getElement('mapModeToggle');
            if (toggleBtn) {
                toggleBtn.classList.toggle('active', explore);
                toggleBtn.title = explore ? '切换概览模式' : '切换探索模式';
            }
        }

        // Wire up mode toggle button
        const modeToggleBtn = getElement('mapModeToggle');
        if (modeToggleBtn) {
            modeToggleBtn.addEventListener('click', () => {
                setExploreMode(!_exploreMode);
            });
        }

        // ── J. Legend + Search + Tooltip ──
        renderMapLegend();
        initMapSearch(childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, computeHierEdgePath);

        // Setup tooltip hover-keep behavior
        const tooltipEl = getElement('kgTooltip');
        if (tooltipEl) {
            tooltipEl.addEventListener('mouseenter', keepTooltipOpen);
            tooltipEl.addEventListener('mouseleave', hideNodeTooltip);
        }

        // ── Setup zoom controls ──
        setupKnowledgeMapControls(svg, zoom);
    }

    /**
     * Render the map legend in the #mapLegend container.
     */
    function renderMapLegend() {
        const container = getElement('mapLegend');
        if (!container) return;

        container.innerHTML = `
            <div class="alc-map-legend-title">图例</div>
            <div class="alc-map-legend-section">
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:16px;height:16px;background:#6200EA;"></span>
                    <span>根节点</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:11px;height:11px;background:#7C4DFF;"></span>
                    <span>一级节点</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:7px;height:7px;background:#B388FF;"></span>
                    <span>二级节点</span>
                </div>
            </div>
            <div class="alc-map-legend-section">
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#ccc;"></span>
                    <span>包含</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#006633;border-style:dashed;"></span>
                    <span>前置</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#0066cc;border-style:dashed;"></span>
                    <span>关联</span>
                </div>
            </div>
            <div class="alc-map-legend-hint">双击展开/收起 · 默认展示一级结构</div>
        `;
    }

    // ── Tooltip ──

    let _tooltipTimer = null;

    function showNodeTooltip(node, event) {
        clearTimeout(_tooltipTimer);
        const tooltip = getElement('kgTooltip');
        if (!tooltip) return;

        const contents = node.contents || [];
        const neighbors = state.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id
        );

        const contentCount = contents.length;
        const neighborCount = neighbors.length;
        const desc = (node.description || '').substring(0, 80);

        // Build quick-jump button if content exists
        const quickJumpHtml = contentCount > 0
            ? `<button class="kg-tooltip-btn"
                 onclick="window.lcLearningCenter.navigateToContent('${contents[0].content_id}', ${contents[0].anchor ? "'" + escapeHtml(JSON.stringify(contents[0].anchor)) + "'" : 'null'})">
                 进入教程
               </button>`
            : '';

        tooltip.innerHTML = `
            <div class="kg-tooltip-title">${node.icon || '📌'} ${escapeHtml(node.title)}</div>
            ${desc ? `<div class="kg-tooltip-desc">${escapeHtml(desc)}${node.description && node.description.length > 80 ? '...' : ''}</div>` : ''}
            <div class="kg-tooltip-meta">
                ${contentCount > 0 ? `<span>📄 ${contentCount} 份教程</span>` : ''}
                <span>↗ ${neighborCount} 个相关节点</span>
            </div>
            <div class="kg-tooltip-actions">
                ${quickJumpHtml}
                <button class="kg-tooltip-btn kg-tooltip-btn--secondary"
                    onclick="window.lcLearningCenter.showNodeDetail(window.lcLearningCenter.getNode('${node.id}'))">
                    查看详情
                </button>
            </div>
        `;

        // Position tooltip near the node
        const container = tooltip.closest('.alc-map-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Auto-position: prefer right side, fall back to left
        const tooltipWidth = 240;
        const tooltipHeight = tooltip.offsetHeight || 160;
        let left = mouseX + 16;
        let top = mouseY - 10;

        if (left + tooltipWidth > rect.width) left = mouseX - tooltipWidth - 16;
        if (top + tooltipHeight > rect.height) top = rect.height - tooltipHeight - 8;
        if (top < 8) top = 8;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.opacity = '1';
        tooltip.style.pointerEvents = 'auto';
    }

    function hideNodeTooltip() {
        _tooltipTimer = setTimeout(() => {
            const tooltip = getElement('kgTooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
            }
        }, 200);
    }

    function keepTooltipOpen() {
        clearTimeout(_tooltipTimer);
    }

    // ── Node Search ──

    /**
     * Search nodes and auto-expand collapsed ancestors if needed.
     * Accepts render context for layout updates.
     */
    function searchNodes(keyword, ctx) {
        const allNodeGroups = d3.selectAll('.kg-node');

        if (!keyword || !keyword.trim()) {
            // Reset: restore all nodes to default
            allNodeGroups.transition().duration(300)
                .attr('opacity', d => d._visible ? 1 : 0);
            d3.selectAll('.kg-search-ring').remove();
            return;
        }

        const term = keyword.trim().toLowerCase();
        const matches = state.nodes.filter(n =>
            (n.title && n.title.toLowerCase().includes(term)) ||
            (n.description && n.description.toLowerCase().includes(term))
        );

        if (matches.length === 0) {
            showToast('未找到匹配的节点', 'warning');
            return;
        }

        // Auto-expand collapsed ancestors so matches become visible
        if (ctx && ctx.childrenMap && ctx.nodeMap) {
            let needsRelayout = false;
            matches.forEach(m => {
                if (!m._visible) {
                    // Walk up parent chain and expand
                    const ancestors = getAncestorPath(m.id, ctx.parentMap || new Map());
                    ancestors.forEach(aId => {
                        const ancestor = ctx.nodeMap.get(aId);
                        if (ancestor && ancestor._collapsed) {
                            ancestor._collapsed = false;
                            needsRelayout = true;
                            // Reveal direct children
                            const revealQueue = [...(ctx.childrenMap.get(aId) || [])];
                            while (revealQueue.length > 0) {
                                const id = revealQueue.shift();
                                const n = state.nodes.find(nd => nd.id === id);
                                if (n) {
                                    n._visible = true;
                                    if (!n._collapsed) {
                                        (ctx.childrenMap.get(id) || []).forEach(c => revealQueue.push(c));
                                    }
                                }
                            }
                        }
                    });
                    m._visible = true;
                }
            });

            if (needsRelayout) {
                buildRadialTree(state.nodes, ctx.childrenMap);
                const dur = LAYOUT_CONFIG.animationDuration;

                ctx.nodeGroups.transition().duration(dur)
                    .attr('transform', d => `translate(${d.x || 0},${d.y || 0})`)
                    .attr('opacity', d => d._visible ? 1 : 0)
                    .attr('pointer-events', d => d._visible ? 'all' : 'none');

                ctx.hierLinks.transition().duration(dur)
                    .attr('d', d => {
                        const s = ctx.nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                        const t = ctx.nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                        if (!s || !t) return '';
                        return ctx.computeHierEdgePath(s, t);
                    })
                    .attr('stroke-opacity', d => {
                        const s = ctx.nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source);
                        const t = ctx.nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target);
                        return (s && s._visible && t && t._visible) ? 0.5 : 0;
                    });

                ctx.crossLinks.transition().duration(dur)
                    .attr('x1', d => { const s = ctx.nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.x : 0; })
                    .attr('y1', d => { const s = ctx.nodeMap.get(typeof d.source === 'object' ? d.source.id : d.source); return s ? s.y : 0; })
                    .attr('x2', d => { const t = ctx.nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.x : 0; })
                    .attr('y2', d => { const t = ctx.nodeMap.get(typeof d.target === 'object' ? d.target.id : d.target); return t ? t.y : 0; });

                if (ctx.updateDescendantBadges) ctx.updateDescendantBadges();
            }
        }

        const matchIds = new Set(matches.map(n => n.id));

        // Dim non-matches, highlight matches
        const nodeGroupsNow = d3.selectAll('.kg-node');
        nodeGroupsNow.transition().duration(300)
            .attr('opacity', d => matchIds.has(d.id) ? 1 : 0.12);

        // Add pulsing ring to matches
        d3.selectAll('.kg-search-ring').remove();
        nodeGroupsNow.filter(d => matchIds.has(d.id))
            .append('circle')
            .attr('class', 'kg-search-ring')
            .attr('r', d => d._tierCfg.radius + 10)
            .attr('fill', 'none')
            .attr('stroke', 'var(--brand, #006633)')
            .attr('stroke-width', 3)
            .attr('stroke-opacity', 0.8);

        // Auto-pan to first match
        const first = matches[0];
        if (first && first.x != null && first.y != null && ctx && ctx.zoom && ctx.svg) {
            const svgElement = getElement('knowledgeMapSvg');
            if (svgElement) {
                const width = svgElement.clientWidth || 800;
                const height = svgElement.clientHeight || 600;
                ctx.svg.transition().duration(750).call(
                    ctx.zoom.transform,
                    d3.zoomIdentity
                        .translate(width / 2, height / 2)
                        .scale(1.2)
                        .translate(-first.x, -first.y)
                );
            }
        }

        showToast(`找到 ${matches.length} 个匹配节点`, 'success');
    }

    function initMapSearch(childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, computeHierEdgePath) {
        const input = getElement('mapSearchInput');
        if (!input) return;

        // Build parent map for ancestor lookups
        const parentMap = new Map();
        state.edges.forEach(e => {
            const relType = e.relation_type || e.relationship_type || e.label || '';
            if (relType === '包含') {
                parentMap.set(e.target_node_id, e.source_node_id);
            }
        });

        const ctx = { childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, computeHierEdgePath, parentMap };

        let searchTimer = null;
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchNodes(input.value, ctx);
            }, SEARCH_DEBOUNCE_DELAY);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.value = '';
                searchNodes('', ctx);
                input.blur();
            }
        });
    }

    function setupKnowledgeMapControls(svg, zoom) {
        const zoomInBtn = getElement('mapZoomInBtn');
        const zoomOutBtn = getElement('mapZoomOutBtn');
        const resetZoomBtn = getElement('mapResetBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                svg.transition().duration(750).call(zoom.scaleBy, 1.3);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                svg.transition().duration(750).call(zoom.scaleBy, 0.7);
            });
        }

        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => {
                const svgElement = getElement('knowledgeMapSvg');
                const w = svgElement ? svgElement.clientWidth || 800 : 800;
                const h = svgElement ? svgElement.clientHeight || 600 : 600;
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(w / 2, h / 2).scale(0.75)
                );
            });
        }
    }

    function showNodeDetail(node) {
        const panel = getElement('nodeDetailPanel');
        if (!panel) return;

        state.lastSelectedNodeId = node.id;

        // Find related edges
        const relatedEdges = state.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id
        );

        // Build content links HTML
        const contents = node.contents || [];
        const contentLinksHtml = contents.length > 0
            ? contents.map(c => {
                const icon = getContentTypeIcon(c.content_type);
                const anchorHint = formatAnchorHint(c.anchor);
                const anchorAttr = c.anchor
                    ? ` data-anchor="${JSON.stringify(c.anchor).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`
                    : '';
                return `
                    <div class="alc-nd__content-card" data-content-id="${c.content_id}"${anchorAttr} role="button" tabindex="0">
                        <span class="alc-nd__content-icon">${icon}</span>
                        <div class="alc-nd__content-meta">
                            <span class="alc-nd__content-name">${escapeHtml(c.content_title || '未命名内容')}</span>
                            ${anchorHint ? `<span class="alc-nd__content-hint">${anchorHint}</span>` : ''}
                        </div>
                        <span class="alc-nd__content-arrow">&rsaquo;</span>
                    </div>`;
            }).join('')
            : '<p class="alc-nd__empty">暂无关联教程</p>';

        // Build related nodes HTML
        const relatedNodesHtml = relatedEdges.length > 0
            ? relatedEdges.map(edge => {
                const relatedNode = state.nodes.find(n =>
                    (edge.source_node_id === node.id ? edge.target_node_id : edge.source_node_id) === n.id
                );
                if (!relatedNode) return '';
                const direction = edge.source_node_id === node.id ? '>' : '<';
                return `
                    <button class="alc-nd__rel-chip" data-node-id="${relatedNode.id}">
                        <span class="alc-nd__rel-dir">${direction}</span>
                        ${escapeHtml(relatedNode.title)}
                    </button>`;
            }).join('')
            : '<p class="alc-nd__empty">暂无相关节点</p>';

        // Render panel
        const nodeColor = node.color || '#006633';
        panel.innerHTML = `
            <div class="alc-nd">
                <div class="alc-nd__header" style="background: linear-gradient(135deg, ${nodeColor}, ${nodeColor}dd)">
                    <button class="alc-nd__close">&times;</button>
                    <div class="alc-nd__icon">${node.icon || '📌'}</div>
                    <h2 class="alc-nd__title">${escapeHtml(node.title)}</h2>
                </div>
                <div class="alc-nd__body">
                    <div class="alc-nd__section">
                        <p class="alc-nd__desc">${escapeHtml(node.description || '暂无描述')}</p>
                    </div>

                    <hr class="alc-nd__divider">

                    <div class="alc-nd__section">
                        <h4 class="alc-nd__section-label">
                            关联教程
                            ${contents.length > 0 ? `<span class="alc-nd__count">${contents.length}</span>` : ''}
                        </h4>
                        <div class="alc-nd__content-list">${contentLinksHtml}</div>
                    </div>

                    <hr class="alc-nd__divider">

                    <div class="alc-nd__section">
                        <h4 class="alc-nd__section-label">
                            关联节点
                            ${relatedEdges.length > 0 ? `<span class="alc-nd__count">${relatedEdges.length}</span>` : ''}
                        </h4>
                        <div class="alc-nd__rel-list">${relatedNodesHtml}</div>
                    </div>
                </div>
            </div>
        `;

        // Show panel with slide-in animation
        panel.style.display = 'flex';
        requestAnimationFrame(() => {
            panel.classList.add('alc-node-detail-panel--active');
        });

        // Event delegation: close button
        panel.querySelector('.alc-nd__close').addEventListener('click', hideNodeDetail);

        // Event delegation: content cards (navigate to content)
        panel.querySelectorAll('.alc-nd__content-card[data-content-id]').forEach(card => {
            card.addEventListener('click', () => {
                const contentId = card.getAttribute('data-content-id');
                const anchorStr = card.getAttribute('data-anchor');
                let anchor = null;
                if (anchorStr) {
                    try { anchor = JSON.parse(anchorStr); }
                    catch (e) { console.warn('[KG] anchor parse error:', e); }
                }
                navigateToContent(contentId, anchor);
            });
        });

        // Event delegation: related node chips
        panel.querySelectorAll('.alc-nd__rel-chip[data-node-id]').forEach(chip => {
            chip.addEventListener('click', () => {
                const nodeId = chip.getAttribute('data-node-id');
                const targetNode = state.nodes.find(n => n.id == nodeId);
                if (targetNode) showNodeDetail(targetNode);
            });
        });
    }

    /** Format anchor hint text for display */
    function formatAnchorHint(anchor) {
        if (!anchor) return '';
        switch (anchor.type) {
            case 'page': return `→ 第 ${anchor.value} 页`;
            case 'page_range': return `→ 第 ${anchor.from}-${anchor.to} 页`;
            case 'heading': return `→ ${anchor.value}`;
            case 'timestamp': {
                const min = Math.floor(anchor.value / 60);
                const sec = anchor.value % 60;
                return `→ ${min}:${String(sec).padStart(2, '0')}`;
            }
            case 'keyword': return `→ 搜索: ${anchor.value}`;
            default: return '';
        }
    }

    /**
     * Navigate from knowledge map to content viewer with anchor positioning.
     * @param {string|number} contentId - Content ID to open
     * @param {string|null} anchorJson - JSON string of anchor object (escaped)
     */
    async function navigateToContent(contentId, anchorJson) {
        console.log('[KG Navigate] contentId:', contentId, 'anchorJson:', anchorJson);

        // Parse anchor - handle both string JSON and pre-parsed objects
        let anchor = null;
        if (anchorJson) {
            try {
                anchor = typeof anchorJson === 'string' ? JSON.parse(anchorJson) : anchorJson;
                // If JSON.parse returned a string (double-encoded), parse again
                if (typeof anchor === 'string') {
                    anchor = JSON.parse(anchor);
                }
            } catch (e) {
                console.warn('[KG Navigate] Failed to parse anchor:', anchorJson, e);
            }
        }
        console.log('[KG Navigate] Parsed anchor:', anchor);

        // Hide node detail panel to avoid overlap
        hideNodeDetail();

        // Switch to media tab
        await switchTab('media');

        // Small delay to ensure tab is visible
        await new Promise(resolve => setTimeout(resolve, 150));

        // Open content in ebook viewer
        try {
            await showEbookContent(contentId);
            console.log('[KG Navigate] Content loaded successfully');
        } catch (e) {
            console.error('[KG Navigate] Failed to load content:', e);
            return;
        }

        // Apply anchor positioning after content loads
        if (anchor) {
            // For PDF, apply anchor directly in the iframe src (more reliable than waiting)
            if (anchor.type === 'page' || anchor.type === 'page_range') {
                const bodyEl = document.getElementById('ebookViewerBody');
                if (bodyEl) {
                    const iframe = bodyEl.querySelector('iframe');
                    if (iframe && iframe.src) {
                        const page = anchor.type === 'page' ? anchor.value : anchor.from;
                        const baseUrl = iframe.src.split('#')[0];
                        const newSrc = baseUrl + '#page=' + page;
                        console.log('[KG Navigate] Setting PDF page:', page, 'URL:', newSrc);
                        iframe.src = newSrc;
                    } else {
                        console.warn('[KG Navigate] No iframe found for PDF navigation');
                    }
                }
            }
            // Wait for content to render, then apply anchor (for non-PDF or as fallback)
            await new Promise(resolve => setTimeout(resolve, 800));
            applyAnchor(anchor);
        }
    }

    /**
     * Apply anchor positioning to the currently loaded content.
     */
    function applyAnchor(anchor) {
        const bodyEl = document.getElementById('ebookViewerBody');
        if (!bodyEl || !anchor) return;

        switch (anchor.type) {
            case 'page':
            case 'page_range': {
                // PDF: reload iframe with #page=N
                const iframe = bodyEl.querySelector('iframe');
                if (iframe && iframe.src) {
                    const page = anchor.type === 'page' ? anchor.value : anchor.from;
                    const baseUrl = iframe.src.split('#')[0];
                    iframe.src = baseUrl + '#page=' + page;
                }
                break;
            }
            case 'heading': {
                // Article: scroll to heading
                const headingId = anchor.value.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-');
                const el = bodyEl.querySelector(`#${CSS.escape(headingId)}`)
                        || bodyEl.querySelector(`h1, h2, h3, h4`);
                // Try text match if id not found
                if (!el) {
                    const allHeadings = bodyEl.querySelectorAll('h1, h2, h3, h4');
                    for (const h of allHeadings) {
                        if (h.textContent.includes(anchor.value)) {
                            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            h.style.outline = '3px solid var(--brand, #006633)';
                            setTimeout(() => { h.style.outline = ''; }, 3000);
                            return;
                        }
                    }
                }
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                break;
            }
            case 'timestamp': {
                // Video: set currentTime
                const video = bodyEl.querySelector('video');
                if (video) {
                    video.currentTime = anchor.value;
                } else {
                    // YouTube/external: reload with start param
                    const iframe = bodyEl.querySelector('iframe');
                    if (iframe && iframe.src) {
                        const url = new URL(iframe.src);
                        url.searchParams.set('start', anchor.value);
                        iframe.src = url.toString();
                    }
                }
                break;
            }
            case 'keyword': {
                // Fallback: search text in content
                const text = bodyEl.innerText;
                const idx = text.indexOf(anchor.value);
                if (idx >= 0) {
                    // Find the nearest block element containing the keyword
                    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
                    while (walker.nextNode()) {
                        if (walker.currentNode.textContent.includes(anchor.value)) {
                            const parent = walker.currentNode.parentElement;
                            if (parent) {
                                parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                parent.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
                                setTimeout(() => { parent.style.backgroundColor = ''; }, 4000);
                            }
                            break;
                        }
                    }
                }
                break;
            }
        }
    }

    function hideNodeDetail() {
        const panel = getElement('nodeDetailPanel');
        if (panel) {
            panel.classList.remove('alc-node-detail-panel--active');
            // Wait for CSS transition to finish before hiding
            const onTransitionEnd = () => {
                panel.style.display = 'none';
                panel.removeEventListener('transitionend', onTransitionEnd);
            };
            panel.addEventListener('transitionend', onTransitionEnd);
            // Fallback: hide after 400ms in case transitionend doesn't fire
            setTimeout(() => {
                panel.style.display = 'none';
            }, 400);
        }
    }

    // ==================== LEARNING PATHS ====================

    async function loadPaths() {
        try {
            const response = await api(`${API_BASE}/paths`);
            if (response.success) {
                state.paths = response.data || [];
                renderPaths();
            }
        } catch (error) {
            console.error('Failed to load paths:', error);
        }
    }

    function renderPaths() {
        const grid = getElement('pathsGrid');
        if (!grid) return;

        if (state.paths.length === 0) {
            grid.innerHTML = '<div class="alc-empty-state">暂无学习路径</div>';
            return;
        }

        grid.innerHTML = state.paths.map(path => {
            const difficultyMap = { beginner: '入门', intermediate: '中级', advanced: '高级' };
            return `
                <div class="alc-path-card" data-id="${path.id}">
                    <div class="alc-path-header">
                        <h3>${escapeHtml(path.title)}</h3>
                        <span class="alc-difficulty ${path.difficulty}">${difficultyMap[path.difficulty] || path.difficulty}</span>
                    </div>
                    <p class="alc-path-desc">${escapeHtml(path.description)}</p>
                    <div class="alc-path-meta">
                        <span class="alc-steps">📚 ${path.step_count || 0} 步骤</span>
                        <span class="alc-duration">⏱️ ${path.estimated_hours || 0} 小时</span>
                    </div>
                    <button class="alc-btn alc-btn-primary alc-btn-full" onclick="window.lcLearningCenter.showPathDetail('${path.id}')">
                        开始学习
                    </button>
                </div>
            `;
        }).join('');
    }

    async function showPathDetail(pathId) {
        try {
            const response = await api(`${API_BASE}/paths/${pathId}`);
            if (response.success) {
                const path = response.data;
                const overlay = getElement('pathDetailOverlay');
                if (!overlay) return;

                const difficultyMap = { beginner: '入门', intermediate: '中级', advanced: '高级' };

                overlay.innerHTML = `
                    <div class="alc-path-detail">
                        <button class="alc-close-btn" onclick="window.lcLearningCenter.hidePathDetail()">&times;</button>
                        <h2>${escapeHtml(path.title)}</h2>
                        <p>${escapeHtml(path.description)}</p>
                        <div class="alc-path-info">
                            <span class="alc-difficulty ${path.difficulty}">${difficultyMap[path.difficulty] || path.difficulty}</span>
                            <span class="alc-duration">⏱️ 预计 ${path.estimated_hours || 0} 小时</span>
                        </div>
                        <div class="alc-path-steps">
                            ${path.steps ? path.steps.map((step, index) => `
                                <div class="alc-step">
                                    <div class="alc-step-number">${index + 1}</div>
                                    <div class="alc-step-content">
                                        <h4>${escapeHtml(step.title)}</h4>
                                        <p>${escapeHtml(step.description)}</p>
                                        ${step.content_id ? `<button class="alc-btn alc-btn-sm" onclick="window.lcLearningCenter.openContent('${step.content_id}')">查看内容</button>` : ''}
                                    </div>
                                </div>
                            `).join('') : '<p>暂无步骤</p>'}
                        </div>
                    </div>
                `;

                overlay.style.display = 'flex';
            }
        } catch (error) {
            console.error('Failed to load path detail:', error);
        }
    }

    function hidePathDetail() {
        const overlay = getElement('pathDetailOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }

    // ==================== RESOURCE LIBRARY ====================

    async function loadResources(categoryId = null) {
        try {
            const rawParams = { content_type: 'document', page_size: 1000 };
            if (categoryId) rawParams.category_id = categoryId;
            const params = new URLSearchParams(rawParams);

            const response = await api(`${API_BASE}/contents?${params}`);
            if (response.success) {
                state.contents = response.data || [];
                renderResourceList();
            }
        } catch (error) {
            console.error('Failed to load resources:', error);
        }
    }

    function renderResourceTree() {
        const treeEl = getElement('resourceTree');
        if (!treeEl) return;

        treeEl.innerHTML = `
            <div class="alc-category-tree">
                ${state.categories.map(cat => `
                    <div class="alc-tree-item">
                        <button class="alc-tree-toggle" data-category="${cat.id}">
                            <span class="alc-tree-arrow">▶</span>
                            <span>${escapeHtml(cat.name)}</span>
                        </button>
                        <div class="alc-tree-children" style="display: none;"></div>
                    </div>
                `).join('')}
            </div>
        `;

        // Setup tree toggle handlers
        treeEl.querySelectorAll('.alc-tree-toggle').forEach(btn => {
            btn.addEventListener('click', async () => {
                const categoryId = btn.getAttribute('data-category');
                const childrenEl = btn.parentElement.querySelector('.alc-tree-children');

                if (childrenEl.style.display === 'none') {
                    await loadResources(categoryId);
                    renderResourceListByCategory(childrenEl, categoryId);
                    childrenEl.style.display = 'block';
                    btn.querySelector('.alc-tree-arrow').textContent = '▼';
                } else {
                    childrenEl.style.display = 'none';
                    btn.querySelector('.alc-tree-arrow').textContent = '▶';
                }
            });
        });
    }

    function renderResourceList() {
        const listEl = getElement('resourceList');
        if (!listEl) return;

        if (state.contents.length === 0) {
            listEl.innerHTML = '<div class="alc-empty-state">暂无资源</div>';
            return;
        }

        listEl.innerHTML = `
            <div class="alc-resource-list">
                ${state.contents.map(content => `
                    <div class="alc-resource-item">
                        <div class="alc-resource-icon">
                            <i class="icon-document"></i>
                        </div>
                        <div class="alc-resource-info">
                            <h4>${escapeHtml(content.title)}</h4>
                            <p>${escapeHtml(content.description || '')}</p>
                            <span class="alc-file-size">${formatFileSize(content.file_size || 0)}</span>
                        </div>
                        <button class="alc-btn alc-btn-sm" onclick="window.lcLearningCenter.downloadResource('${content.id}')">
                            下载
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderResourceListByCategory(container, categoryId) {
        const categoryContents = state.contents.filter(c => c.category_id === categoryId);
        if (categoryContents.length === 0) {
            container.innerHTML = '<p class="alc-empty">该分类暂无资源</p>';
            return;
        }

        container.innerHTML = categoryContents.map(content => `
            <div class="alc-resource-item alc-resource-item-tree">
                <span>${escapeHtml(content.title)}</span>
                <button class="alc-btn alc-btn-sm" onclick="window.lcLearningCenter.downloadResource('${content.id}')">
                    下载
                </button>
            </div>
        `).join('');
    }

    async function downloadResource(contentId) {
        try {
            const response = await api(`${API_BASE}/contents/${contentId}`);
            if (response.success) {
                const content = response.data;
                const fileUrl = getFileUrl(content);
                if (fileUrl) {
                    const link = document.createElement('a');
                    link.href = fileUrl;
                    link.download = content.title;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    showToast('下載開始', 'success');
                } else {
                    showToast('此內容無可下載文件', 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to download resource:', error);
        }
    }

    // ==================== AI ASSISTANT ====================

    function setupAiAssistant() {
        const inputBox = getElement('aiInputBox');
        const sendBtn = getElement('aiSendBtn');

        if (sendBtn) {
            sendBtn.addEventListener('click', sendAiQuestion);
        }

        if (inputBox) {
            inputBox.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAiQuestion();
                }
            });
        }

        // Setup suggested questions
        const suggestedQuestions = document.querySelectorAll('[data-question]');
        suggestedQuestions.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-question');
                const inputBox = getElement('aiInputBox');
                if (inputBox) {
                    inputBox.value = question;
                    sendAiQuestion();
                }
            });
        });

        // 页码跳转事件委托（点击 AI 消息中的页码引用或快捷按钮）
        const messagesEl = getElement('aiMessages');
        if (messagesEl) {
            messagesEl.addEventListener('click', (e) => {
                const pageRef = e.target.closest('.alc-page-ref, .alc-page-ref-btn');
                if (pageRef) {
                    const page = parseInt(pageRef.dataset.page, 10);
                    if (!isNaN(page)) {
                        navigatePdfToPage(page);
                    }
                }
            });
        }

        // 初始化上下文指示条
        updateAiContextIndicator();
    }

    /**
     * 更新 AI 助教上下文指示条，显示当前阅读的内容标题。
     */
    function updateAiContextIndicator() {
        const indicator = document.getElementById('aiContextIndicator');
        if (!indicator) return;

        if (state.currentContentId && state.currentContentTitle) {
            indicator.style.display = 'flex';
            indicator.innerHTML = `
                <span class="alc-ai-context-icon">&#128214;</span>
                <span class="alc-ai-context-text">
                    当前阅读：<strong>${escapeHtml(state.currentContentTitle)}</strong>
                </span>
                <button class="alc-ai-context-clear"
                        onclick="window.lcLearningCenter.clearAiContext()"
                        title="清除上下文">&#10005;</button>
            `;
        } else {
            indicator.style.display = 'none';
            indicator.innerHTML = '';
        }
    }

    /**
     * 清除当前内容上下文关联（恢复通用问答模式）。
     */
    function clearAiContext() {
        state.currentContentId = null;
        state.currentContentTitle = null;
        updateAiContextIndicator();
    }

    // ==================== AI 浮动窗口 ====================

    /**
     * 切换 AI 助教浮动窗口的显示/隐藏状态。
     */
    function toggleAiWindow() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        const isVisible = win.style.display === 'flex';
        win.style.display = isVisible ? 'none' : 'flex';

        // 首次打开时聚焦输入框
        if (!isVisible) {
            const input = getElement('aiInputBox');
            if (input) input.focus();
        }
    }

    /**
     * 在小窗口和大窗口之间切换。
     */
    function toggleAiWindowSize() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        const isExpanded = win.classList.toggle('alc-ai-float--expanded');
        const btn = document.getElementById('aiFloatExpandBtn');
        if (btn) {
            btn.innerHTML = isExpanded ? '&#9635;' : '&#9634;';
            btn.title = isExpanded ? '缩小' : '放大';
        }
    }

    /**
     * 初始化浮动窗口的拖拽行为。
     * 在 init() 中调用一次即可。
     */
    function setupAiFloatingWindow() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        // Bind AI window toggle/resize buttons (replaced inline onclick)
        const aiToggleBtn = document.getElementById('aiFloatingToggleBtn');
        if (aiToggleBtn) aiToggleBtn.addEventListener('click', toggleAiWindow);
        const aiExpandBtn = document.getElementById('aiFloatExpandBtn');
        if (aiExpandBtn) aiExpandBtn.addEventListener('click', toggleAiWindowSize);
        const aiCloseBtn = document.getElementById('aiFloatCloseBtn');
        if (aiCloseBtn) aiCloseBtn.addEventListener('click', toggleAiWindow);

        const header = document.getElementById('aiFloatHeader');

        let dragState = null;
        let lastX = 0;
        let lastY = 0;
        let rafPending = false;

        // ---- 拖拽 ----
        if (header) {
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                e.preventDefault();

                const rect = win.getBoundingClientRect();
                win.style.left = rect.left + 'px';
                win.style.top = rect.top + 'px';
                win.style.right = 'auto';
                win.style.bottom = 'auto';

                dragState = {
                    offsetX: e.clientX - rect.left,
                    offsetY: e.clientY - rect.top,
                };
                win.style.transition = 'none';
                win.classList.add('alc-ai-float--interacting');
                document.body.style.userSelect = 'none';
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!dragState) return;
            lastX = e.clientX;
            lastY = e.clientY;

            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                if (dragState) {
                    win.style.left = Math.max(0, Math.min(lastX - dragState.offsetX, window.innerWidth - win.offsetWidth)) + 'px';
                    win.style.top = Math.max(0, Math.min(lastY - dragState.offsetY, window.innerHeight - win.offsetHeight)) + 'px';
                }
            });
        });

        document.addEventListener('mouseup', () => {
            if (!dragState) return;
            dragState = null;
            win.style.transition = '';
            win.classList.remove('alc-ai-float--interacting');
            document.body.style.userSelect = '';
        });
    }

    async function sendAiQuestion() {
        const inputBox = getElement('aiInputBox');
        if (!inputBox || !inputBox.value.trim()) {
            showToast('请输入问题', 'warning');
            return;
        }

        const question = inputBox.value.trim();
        const messagesEl = getElement('aiMessages');
        if (!messagesEl) return;

        renderAiMessage('user', question);
        inputBox.value = '';
        inputBox.focus();

        // 显示打字动画
        const loadingEl = document.createElement('div');
        loadingEl.className = 'alc-message alc-message--ai';
        loadingEl.innerHTML = '<div class="alc-message-avatar">🤖</div><div class="alc-message-content"><div class="alc-typing-indicator"><span></span><span></span><span></span></div></div>';
        messagesEl.appendChild(loadingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const requestBody = { question };
        if (state.currentContentId) {
            requestBody.content_id = state.currentContentId;
        }

        try {
            const resp = await apiPost(`${API_BASE}/ai-ask`, requestBody);
            const result = resp.data || resp;
            loadingEl.remove();
            renderAiMessage('assistant', result.answer || '暂无回答', result.sources, result.page_references);
        } catch (error) {
            loadingEl.remove();
            renderAiMessage('assistant', '发送失败，请重试');
            console.error('AI ask error:', error);
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderAiMessage(role, content, sources = null, pageReferences = null) {
        const messagesEl = getElement('aiMessages');
        if (!messagesEl) return;

        const isUser = role === 'user';
        const messageEl = document.createElement('div');
        messageEl.className = isUser ? 'alc-message user' : 'alc-message alc-message--ai';

        // 头像
        const avatarEl = document.createElement('div');
        avatarEl.className = 'alc-message-avatar';
        avatarEl.textContent = isUser ? '🧑' : '🤖';
        messageEl.appendChild(avatarEl);

        // 气泡内容
        const contentEl = document.createElement('div');
        contentEl.className = 'alc-message-content';

        if (!isUser && typeof marked !== 'undefined') {
            let html = marked.parse(content);
            // 将 AI 回答中的【第X页】标记转换为可点击链接
            html = linkifyPageReferences(html);
            contentEl.innerHTML = html;
        } else {
            contentEl.innerHTML = `<p>${escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
        }

        if (sources && sources.length > 0) {
            const sourcesHtml = sources.map(s =>
                `<a href="${escapeHtml(s.url)}" target="_blank" class="alc-source-link">${escapeHtml(s.title)}</a>`
            ).join('');
            contentEl.insertAdjacentHTML('beforeend', `<div class="alc-ai-sources"><p>参考资料：</p>${sourcesHtml}</div>`);
        }

        // 页码快捷导航按钮
        if (pageReferences && pageReferences.length > 0) {
            const allPages = new Set();
            pageReferences.forEach(ref => {
                ref.page_numbers.forEach(p => allPages.add(p));
            });
            const sortedPages = Array.from(allPages).sort((a, b) => a - b);

            const btnsHtml = sortedPages.map(p =>
                `<button class="alc-page-ref-btn" data-page="${p}" title="跳转到第${p}页">第${p}页</button>`
            ).join('');
            contentEl.insertAdjacentHTML('beforeend',
                `<div class="alc-page-refs-bar"><span class="alc-page-refs-label">相关页码：</span>${btnsHtml}</div>`
            );
        }

        messageEl.appendChild(contentEl);
        messagesEl.appendChild(messageEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /**
     * 将 AI 回答中的【第X页】标记转换为可点击的页码链接。
     * 支持格式：【第3页】、【第3,4页】、【第3、4页】
     */
    function linkifyPageReferences(html) {
        // 同时匹配简体「页」和繁体「頁」，以及 page/p. 等英文格式
        // 支持：【第42页】【第42頁】【第42-44页】【第42,43页】
        return html.replace(
            /【第([\d,、\u2013\-]+)[页頁]】/g,
            (match, pages) => {
                // 取第一个页码作为跳转目标
                const firstPage = parseInt(pages.replace(/[、\u2013\-]/g, ',').split(',')[0], 10);
                if (isNaN(firstPage)) return match;
                return `<span class="alc-page-ref" data-page="${firstPage}" title="跳转到第${firstPage}页">${match}</span>`;
            }
        );
    }

    /**
     * 跳转 PDF iframe 到指定页码。
     * 利用 PDF Open Parameters 标准：在 URL 后添加 #page=N。
     */
    function navigatePdfToPage(page) {
        const iframe = document.querySelector('.alc-ebook-doc-iframe');
        if (!iframe) {
            console.warn('未找到 PDF iframe，无法跳转页码');
            return;
        }

        const currentSrc = iframe.src || '';
        const baseSrc = currentSrc.replace(/#.*$/, '');
        const newSrc = `${baseSrc}#page=${page}`;

        // 使用 contentWindow.location.replace() 导航到带页码的 URL
        // Chrome PDF viewer 只在加载时读取 #page=N，hash 变化不会触发跳页
        // replace() 会利用浏览器缓存，PDF 文件不重新下载，减少闪烁
        try {
            iframe.contentWindow.location.replace(newSrc);
        } catch (e) {
            // 跨域 iframe fallback
            iframe.src = newSrc;
        }

        showToast(`已跳转到第 ${page} 页`, 'info');
    }

    // ==================== MODALS ====================

    function setupModals() {
        // Close buttons (both .alc-modal-close and .alc-close-btn)
        document.querySelectorAll('.alc-modal-close').forEach(btn => {
            btn.addEventListener('click', closeAllModals);
        });

        // Click outside to close (modal overlays)
        document.querySelectorAll('.alc-modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeAllModals();
                }
            });
        });

        // Admin close panel button
        const adminCloseBtn = getElement('adminClosePanelBtn');
        if (adminCloseBtn) {
            adminCloseBtn.addEventListener('click', () => {
                const slidePanel = getElement('adminSlidePanel');
                const panel = getElement('adminPanel');
                if (slidePanel) slidePanel.classList.remove('active');
                if (panel) {
                    setTimeout(() => { panel.style.display = 'none'; }, 300);
                }
            });
        }

        // Node detail close button
        const nodeCloseBtn = getElement('nodeDetailCloseBtn');
        if (nodeCloseBtn) {
            nodeCloseBtn.addEventListener('click', hideNodeDetail);
        }

        // Path detail close button
        const pathCloseBtn = getElement('pathDetailCloseBtn');
        if (pathCloseBtn) {
            pathCloseBtn.addEventListener('click', hidePathDetail);
        }
    }

    /**
     * Build a playable file URL from the content's file_path
     * DB stores paths like "uploads/learning_center/video_locals/xxx.mp4"
     * Files are served at /uploads/...
     */
    function getFileUrl(content) {
        if (content.file_url) return content.file_url;
        if (content.file_path) {
            // file_path may already start with "uploads/" or may not have leading slash
            const path = content.file_path.startsWith('/') ? content.file_path : `/${content.file_path}`;
            return path;
        }
        return null;
    }

    function openVideoModal(content) {
        const modal = getElement('videoModal');
        if (!modal) return;

        const videoPlayer = getElement('videoPlayer');
        const videoTitle = getElement('videoModalTitle');
        const videoDesc = getElement('videoModalDesc');
        const videoContainer = modal.querySelector('.alc-video-container');

        // Reset container: restore iframe, clear previous content
        if (videoContainer && videoPlayer) {
            // Remove any previously injected <video> or error elements
            videoContainer.querySelectorAll('video, p, div').forEach(el => el.remove());
            videoPlayer.src = '';
            videoPlayer.style.display = 'none';
        }

        if (content.content_type === 'video_external' || content.external_url) {
            // External video (YouTube / Bilibili)
            const embedUrl = parseVideoEmbed(content.external_url);
            if (embedUrl && videoPlayer) {
                videoPlayer.src = embedUrl;
                videoPlayer.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
                videoPlayer.style.display = 'block';
            } else {
                // Fallback: try to open external URL in a new way
                const fileUrl = getFileUrl(content);
                if (fileUrl && videoContainer) {
                    const videoEl = document.createElement('video');
                    videoEl.setAttribute('width', '100%');
                    videoEl.setAttribute('height', '100%');
                    videoEl.setAttribute('controls', '');
                    videoEl.innerHTML = `<source src="${escapeHtml(fileUrl)}" type="video/mp4">您的瀏覽器不支持視頻播放`;
                    videoContainer.appendChild(videoEl);
                } else if (videoContainer) {
                    const errP = document.createElement('p');
                    errP.className = 'alc-error';
                    errP.style.cssText = 'color:#fff;text-align:center;padding:40px;';
                    errP.textContent = '無法載入視頻';
                    videoContainer.appendChild(errP);
                }
            }
        } else {
            // Local video - use file_path to construct URL
            const fileUrl = getFileUrl(content);
            if (fileUrl && videoContainer) {
                const videoEl = document.createElement('video');
                videoEl.setAttribute('width', '100%');
                videoEl.setAttribute('height', '100%');
                videoEl.setAttribute('controls', '');
                videoEl.innerHTML = `<source src="${escapeHtml(fileUrl)}" type="${escapeHtml(content.mime_type || 'video/mp4')}">您的瀏覽器不支持視頻播放`;
                videoContainer.appendChild(videoEl);
            } else if (videoContainer) {
                const errP = document.createElement('p');
                errP.className = 'alc-error';
                errP.style.cssText = 'color:#fff;text-align:center;padding:40px;';
                errP.textContent = '無法載入視頻';
                videoContainer.appendChild(errP);
            }
        }

        if (videoTitle) videoTitle.textContent = content.title || '';
        if (videoDesc) videoDesc.textContent = content.description || '';

        modal.style.display = 'flex';
    }

    function openImageModal(content) {
        const modal = getElement('imageModal');
        if (!modal) return;

        const img = getElement('imageMdalImage');
        const title = getElement('imageModalTitle');
        const desc = getElement('imageModalDesc');
        const fileUrl = getFileUrl(content);

        if (img) {
            img.src = content.image_url || fileUrl || '';
            img.alt = content.title || '';
        }
        if (title) title.textContent = content.title || '';
        if (desc) desc.textContent = content.description || '';

        modal.style.display = 'flex';
    }

    function openDocModal(content) {
        const modal = getElement('docModal');
        if (!modal) return;

        const docViewer = getElement('docViewer');
        const docTitle = getElement('docModalTitle');
        const downloadLink = getElement('docDownloadLink');
        const fileUrl = getFileUrl(content);

        if (docViewer && fileUrl) {
            docViewer.src = fileUrl;
        }
        if (docTitle) docTitle.textContent = content.title || '';
        if (downloadLink && fileUrl) {
            downloadLink.href = fileUrl;
            downloadLink.download = content.title || 'download';
        }

        modal.style.display = 'flex';
    }

    function openArticleModal(content) {
        const modal = getElement('articleModal');
        if (!modal) {
            // Create modal if it doesn't exist
            const newModal = document.createElement('div');
            newModal.id = 'articleModal';
            newModal.className = 'alc-modal';
            newModal.innerHTML = `
                <div class="alc-modal-content">
                    <button class="alc-modal-close">&times;</button>
                    <div class="alc-modal-body alc-article-body"></div>
                </div>
            `;
            document.body.appendChild(newModal);
            newModal.addEventListener('click', (e) => {
                if (e.target === newModal) closeAllModals();
            });
        }

        const modalBody = document.querySelector('#articleModal .alc-modal-body');
        if (modalBody) {
            modalBody.innerHTML = `
                <h2>${escapeHtml(content.title)}</h2>
                <p class="alc-article-meta">
                    ${content.created_at ? `发布时间：${content.created_at}` : ''}
                </p>
                <div class="alc-article-content">
                    ${escapeHtml(content.content || content.description || '')}
                </div>
                ${content.tags ? `<div class="alc-tags">${content.tags.map(tag => `<span class="alc-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            `;

            const modal = document.getElementById('articleModal');
            if (modal) modal.style.display = 'block';
        }
    }

    function closeAllModals() {
        document.querySelectorAll('.alc-modal-overlay').forEach(modal => {
            modal.style.display = 'none';
        });
        // Stop iframe video
        const videoPlayer = getElement('videoPlayer');
        if (videoPlayer) {
            videoPlayer.src = '';
            videoPlayer.style.display = 'none';
        }
        // Remove any injected <video> elements in the video modal
        const videoModal = getElement('videoModal');
        if (videoModal) {
            videoModal.querySelectorAll('video').forEach(v => {
                v.pause();
                v.remove();
            });
            videoModal.querySelectorAll('p.alc-error').forEach(p => p.remove());
        }
    }

    // ==================== SEARCH ====================

    function setupSearch() {
        const searchInput = getElement('globalSearchInput');
        if (!searchInput) return;

        const debouncedSearch = debounce(async (keyword) => {
            if (keyword.trim()) {
                await globalSearch(keyword);
            } else {
                loadMedia(1);
            }
        }, SEARCH_DEBOUNCE_DELAY);

        searchInput.addEventListener('input', (e) => {
            state.filters.search = e.target.value;
            debouncedSearch(e.target.value);
        });
    }

    async function globalSearch(keyword) {
        try {
            const params = new URLSearchParams({
                keyword: keyword,
                page: 1,
                page_size: state.pageSize
            });

            const response = await api(`${API_BASE}/search?${params}`);
            if (response.success) {
                state.contents = response.data || [];
                state.currentPage = 1;
                state.totalItems = response.pagination?.total || 0;
                renderMediaGrid();
                renderPagination();
            }
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    // ==================== ADMIN PANEL ====================

    // Map admin tab names to HTML element IDs
    const ADMIN_TAB_MAP = {
        categories: 'adminTabCategories',
        upload: 'adminTabUpload',
        contents: 'adminTabContents',
        nodes: 'adminTabNodes',
        paths: 'adminTabPaths',
    };

    function setupAdminPanel() {
        const adminToggleBtn = getElement('adminToggleBtn');
        if (adminToggleBtn && isAdmin) {
            adminToggleBtn.addEventListener('click', toggleAdminPanel);
        }

        // FAB button inside admin panel also toggles the slide panel
        const adminFabBtn = getElement('adminFabBtn');
        if (adminFabBtn && isAdmin) {
            adminFabBtn.addEventListener('click', () => {
                const slidePanel = getElement('adminSlidePanel');
                if (slidePanel) {
                    slidePanel.classList.toggle('active');
                }
            });
        }

        setupAdminTabs();
        setupAdminForms();
    }

    function toggleAdminPanel() {
        const panel = getElement('adminPanel');
        const slidePanel = getElement('adminSlidePanel');
        if (!panel || !slidePanel) return;

        const isOpen = slidePanel.classList.contains('active');
        if (isOpen) {
            slidePanel.classList.remove('active');
            setTimeout(() => { panel.style.display = 'none'; }, 300);
        } else {
            panel.style.display = 'block';
            // Force reflow before adding active class for CSS transition
            slidePanel.offsetHeight;
            slidePanel.classList.add('active');
            loadAdminCategories();
        }
    }

    function setupAdminTabs() {
        const adminTabBtns = document.querySelectorAll('[data-admin-tab]');
        adminTabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tabName = btn.getAttribute('data-admin-tab');
                switchAdminTab(tabName);
            });
        });
    }

    function switchAdminTab(tabName) {
        // Update active tab button
        document.querySelectorAll('[data-admin-tab]').forEach(btn => {
            const isActive = btn.getAttribute('data-admin-tab') === tabName;
            btn.classList.toggle('alc-admin-tab-btn--active', isActive);
            btn.classList.toggle('alc-active', isActive);
        });

        // Hide all tab content panels (using the ID-based map)
        Object.values(ADMIN_TAB_MAP).forEach(panelId => {
            const panel = getElement(panelId);
            if (panel) {
                panel.style.display = 'none';
                panel.classList.remove('alc-admin-tab-content--active');
            }
        });

        // Show selected panel
        const panelId = ADMIN_TAB_MAP[tabName];
        const panel = panelId ? getElement(panelId) : null;
        if (panel) {
            panel.style.display = 'block';
            panel.classList.add('alc-admin-tab-content--active');
        }

        // Load data when switching to certain tabs
        if (tabName === 'categories') {
            loadAdminCategories();
        } else if (tabName === 'contents') {
            loadAdminContents();
        } else if (tabName === 'nodes') {
            loadAdminNodes();
        } else if (tabName === 'paths') {
            loadAdminPaths();
        }
    }

    function setupAdminForms() {
        // File upload handler
        const uploadInput = getElement('contentFileInput');
        const uploadDropZone = getElement('dragDropZone');

        if (uploadInput) {
            uploadInput.addEventListener('change', handleFileUpload);
        }

        if (uploadDropZone) {
            uploadDropZone.addEventListener('click', () => {
                if (uploadInput) uploadInput.click();
            });

            uploadDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadDropZone.classList.add('alc-drag-over');
            });

            uploadDropZone.addEventListener('dragleave', () => {
                uploadDropZone.classList.remove('alc-drag-over');
            });

            uploadDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadDropZone.classList.remove('alc-drag-over');
                handleDrop(e);
            });
        }

        // Toggle file upload / external video URL based on content type
        const typeSelect = getElement('contentTypeSelect');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                const externalSection = getElement('externalVideoSection');
                const dropZone = getElement('dragDropZone');
                if (typeSelect.value === 'video_external') {
                    if (externalSection) externalSection.style.display = 'block';
                    if (dropZone) dropZone.style.display = 'none';
                } else {
                    if (externalSection) externalSection.style.display = 'none';
                    if (dropZone) dropZone.style.display = '';
                }
            });
        }

        // Category create button
        const createCategoryBtn = getElement('createCategoryBtn');
        if (createCategoryBtn) {
            createCategoryBtn.addEventListener('click', submitCategory);
        }

        // Upload content button
        const uploadContentBtn = getElement('uploadContentBtn');
        if (uploadContentBtn) {
            uploadContentBtn.addEventListener('click', submitUploadContent);
        }

        // Batch import listeners
        initBatchImportListeners();

        // Create node button
        const createNodeBtn = getElement('createNodeBtn');
        if (createNodeBtn) {
            createNodeBtn.addEventListener('click', submitNode);
        }

        // Create edge button
        const createEdgeBtn = getElement('createEdgeBtn');
        if (createEdgeBtn) {
            createEdgeBtn.addEventListener('click', submitEdge);
        }

        // Create path button
        const createPathBtn = getElement('createPathBtn');
        if (createPathBtn) {
            createPathBtn.addEventListener('click', submitPath);
        }
    }

    // ==================== ADMIN: CONTENT MANAGEMENT ====================

    async function loadAdminContents() {
        const listEl = getElement('adminContentsList');
        if (!listEl) return;

        listEl.innerHTML = '<p style="padding:16px;color:var(--text-tertiary);">載入中...</p>';

        try {
            const response = await api(`${API_BASE}/contents?page=1&page_size=200`);
            if (response.success) {
                const contents = response.data?.items || response.data || [];
                if (contents.length === 0) {
                    listEl.innerHTML = '<p style="padding:16px;color:var(--text-tertiary);">暫無內容</p>';
                    return;
                }

                // Build category lookup for display
                const flatCats = flattenCategories(state.categories);
                const catMap = {};
                flatCats.forEach(c => { catMap[c.id] = c.name; });

                listEl.innerHTML = contents.map(content => {
                    const typeIcon = getContentTypeIcon(content.content_type);
                    const catName = content.category_id && catMap[content.category_id]
                        ? catMap[content.category_id] : '未分類';
                    return `<div class="alc-admin-list-item" data-content-id="${content.id}">
                        <div class="alc-admin-list-item-info">
                            <span style="margin-right:6px;">${typeIcon}</span>
                            <strong>${escapeHtml(content.title)}</strong>
                            <span style="margin-left:8px;font-size:12px;color:var(--text-tertiary);">[${catName}]</span>
                        </div>
                        <div class="alc-admin-list-item-actions">
                            <button class="alc-btn alc-btn--small alc-btn--secondary" onclick="window._alcEditContent(${content.id})">編輯</button>
                            <button class="alc-btn alc-btn--small alc-btn--danger" onclick="window._alcDeleteContent(${content.id}, '${escapeHtml(content.title).replace(/'/g, "\\'")}')">刪除</button>
                        </div>
                    </div>`;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load admin contents:', error);
            listEl.innerHTML = '<p style="padding:16px;color:red;">載入失敗</p>';
        }
    }

    // Expose content management functions globally for onclick handlers
    window._alcDeleteContent = async function(contentId, title) {
        if (!confirm(`確定要刪除「${title}」嗎？此操作無法撤銷。`)) return;

        try {
            const response = await api(`${ADMIN_API}/contents/${contentId}`, {
                method: 'DELETE'
            });
            if (response.success) {
                showToast('內容已刪除', 'success');
                loadAdminContents();
                // Also refresh ebook sidebar
                loadMedia();
            } else {
                showToast(response.message || '刪除失敗', 'error');
            }
        } catch (error) {
            console.error('Failed to delete content:', error);
            showToast('刪除失敗', 'error');
        }
    };

    window._alcEditContent = async function(contentId) {
        try {
            const response = await api(`${API_BASE}/contents/${contentId}`);
            if (!response.success) return;
            const content = response.data;

            // 构建分类选项
            const flatCats = flattenCategories(state.categories);
            const catOptions = flatCats.map(c =>
                `<option value="${c.id}" ${(content.category_ids || []).includes(c.id) ? 'selected' : ''}>${escapeHtml(c.name)}</option>`
            ).join('');

            // 构建编辑弹窗
            const overlay = document.createElement('div');
            overlay.className = 'alc-modal-overlay active';
            overlay.style.zIndex = '3000';
            overlay.innerHTML = `
                <div class="alc-modal-content alc-confirm-dialog" style="max-width:480px;">
                    <h3>編輯內容</h3>
                    <div class="alc-admin-form">
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">標題</label>
                        <input type="text" id="_editTitle" class="alc-form-input" value="${escapeHtml(content.title)}" />
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">描述</label>
                        <textarea id="_editDesc" class="alc-form-input" rows="3">${escapeHtml(content.description || '')}</textarea>
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">內容類型</label>
                        <select id="_editType" class="alc-form-input">
                            <option value="video_local" ${content.content_type === 'video_local' ? 'selected' : ''}>本地視頻</option>
                            <option value="video_external" ${content.content_type === 'video_external' ? 'selected' : ''}>視頻連結</option>
                            <option value="document" ${content.content_type === 'document' ? 'selected' : ''}>文件</option>
                            <option value="image" ${content.content_type === 'image' ? 'selected' : ''}>圖片</option>
                            <option value="article" ${content.content_type === 'article' ? 'selected' : ''}>文章</option>
                        </select>
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">分類</label>
                        <select id="_editCategory" class="alc-form-input">
                            <option value="">不選擇分類</option>
                            ${catOptions}
                        </select>
                    </div>
                    <div class="alc-dialog-actions" style="margin-top:12px;">
                        <button id="_editCancel" class="alc-btn alc-btn--secondary">取消</button>
                        <button id="_editSave" class="alc-btn alc-btn--primary">保存</button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            // 点击遮罩或取消关闭
            overlay.querySelector('#_editCancel').addEventListener('click', () => overlay.remove());
            overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

            // 保存
            overlay.querySelector('#_editSave').addEventListener('click', async () => {
                const newTitle = overlay.querySelector('#_editTitle').value.trim();
                const newDesc = overlay.querySelector('#_editDesc').value.trim();
                const newType = overlay.querySelector('#_editType').value;
                const newCatId = overlay.querySelector('#_editCategory').value;

                const updateData = {};
                if (newTitle && newTitle !== content.title) updateData.title = newTitle;
                if (newDesc !== (content.description || '')) updateData.description = newDesc;
                if (newType !== content.content_type) updateData.content_type = newType;
                if (newCatId) {
                    updateData.category_ids = [parseInt(newCatId)];
                } else {
                    updateData.category_ids = [];
                }

                try {
                    const updateResponse = await api(`${ADMIN_API}/contents/${contentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updateData)
                    });

                    if (updateResponse.success) {
                        showToast('內容已更新', 'success');
                        overlay.remove();
                        loadAdminContents();
                        loadedTabs.delete('media');
                        loadMedia();
                    } else {
                        showToast(updateResponse.message || '更新失敗', 'error');
                    }
                } catch (error) {
                    console.error('Failed to update content:', error);
                    showToast('更新失敗', 'error');
                }
            });
        } catch (error) {
            console.error('Failed to edit content:', error);
            showToast('載入內容失敗', 'error');
        }
    };

    // ==================== ADMIN: CATEGORIES ====================

    async function loadAdminCategories() {
        try {
            const response = await api(`${API_BASE}/categories`);
            if (response.success) {
                state.categories = response.data || [];
                renderAdminCategories();
                populateCategoryDropdowns();
            }
        } catch (error) {
            console.error('Failed to load categories:', error);
        }
    }

    function populateCategoryDropdowns() {
        // Populate all category select dropdowns
        const selects = [
            getElement('contentCategorySelect'),
            getElement('nodeCategorySelect'),
        ];

        const flatCategories = flattenCategories(state.categories);

        selects.forEach(select => {
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = '<option value="">選擇分類</option>';
            flatCategories.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`;
            });
            select.value = currentVal;
        });
    }

    function flattenCategories(categories, result = []) {
        categories.forEach(cat => {
            result.push(cat);
            if (cat.children && cat.children.length > 0) {
                flattenCategories(cat.children, result);
            }
        });
        return result;
    }

    function renderAdminCategories() {
        const listEl = getElement('categoriesList');
        if (!listEl) return;

        const flatCats = flattenCategories(state.categories);

        if (flatCats.length === 0) {
            listEl.innerHTML = '<p class="alc-empty">暂无分类</p>';
            return;
        }

        listEl.innerHTML = flatCats.map(cat => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${escapeHtml(cat.icon || '📁')} ${escapeHtml(cat.name)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${escapeHtml(cat.description || '')}</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editCategory(${cat.id})">编辑</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deleteCategory(${cat.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    async function submitCategory() {
        const nameInput = getElement('categoryNameInput');
        const iconInput = getElement('categoryIconInput');

        const name = nameInput ? nameInput.value.trim() : '';
        const icon = iconInput ? iconInput.value.trim() : '';

        if (!name) {
            showToast('请输入分类名称', 'error');
            return;
        }

        try {
            const editingId = (nameInput && nameInput.getAttribute('data-editing-id'));
            let response;

            if (editingId) {
                response = await apiPut(`${ADMIN_API}/categories/${editingId}`, { name, icon });
            } else {
                response = await apiPost(`${ADMIN_API}/categories`, { name, icon });
            }

            if (response.success) {
                showToast(editingId ? '分类更新成功' : '分类创建成功', 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (iconInput) iconInput.value = '';
                await loadAdminCategories();
                await loadCategories();
            }
        } catch (error) {
            console.error('Category submit error:', error);
        }
    }

    async function editCategory(categoryId) {
        const flatCats = flattenCategories(state.categories);
        const category = flatCats.find(c => c.id == categoryId);
        if (!category) return;

        const nameInput = getElement('categoryNameInput');
        const iconInput = getElement('categoryIconInput');

        if (nameInput) {
            nameInput.value = category.name;
            nameInput.setAttribute('data-editing-id', categoryId);
            nameInput.focus();
        }
        if (iconInput) iconInput.value = category.icon || '';

        // Switch to categories tab and scroll
        switchAdminTab('categories');
    }

    async function deleteCategory(categoryId) {
        if (!confirm('确定要删除该分类吗？')) return;

        try {
            const response = await apiDelete(`${ADMIN_API}/categories/${categoryId}`);
            if (response.success) {
                showToast('分类删除成功', 'success');
                await loadAdminCategories();
                await loadCategories();
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    // ==================== ADMIN: FILE UPLOAD & CONTENT ====================

    async function handleFileUpload(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        for (let file of files) {
            await uploadContentFile(file);
        }

        event.target.value = '';
    }

    async function handleDrop(event) {
        const files = event.dataTransfer.files;
        if (files.length === 0) return;

        for (let file of files) {
            await uploadContentFile(file);
        }
    }

    async function uploadContentFile(file) {
        const titleInput = getElement('contentTitleInput');
        const typeSelect = getElement('contentTypeSelect');
        const descInput = getElement('contentDescInput');
        const categorySelect = getElement('contentCategorySelect');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', (titleInput && titleInput.value.trim()) || file.name);
        formData.append('description', (descInput && descInput.value.trim()) || '');
        formData.append('tags', '');
        if (categorySelect && categorySelect.value) {
            formData.append('category_ids', categorySelect.value);
        }

        // Determine content type
        let contentType = (typeSelect && typeSelect.value) || 'document';
        if (!contentType) {
            if (file.type.startsWith('video/')) contentType = 'video_local';
            else if (file.type.startsWith('image/')) contentType = 'image';
            else contentType = 'document';
        }
        formData.append('content_type', contentType);

        try {
            const response = await apiUpload(`${ADMIN_API}/upload`, formData);
            if (response.success) {
                showToast(`${file.name} 上传成功`, 'success');
                if (titleInput) titleInput.value = '';
                if (descInput) descInput.value = '';
                // Refresh content lists
                loadedTabs.delete('media');
                loadedTabs.delete('resources');
                if (currentTab === 'media') await loadMedia(1);
                if (currentTab === 'resources') await loadResources();
            }
        } catch (error) {
            console.error('Upload error:', error);
            showToast(`${file.name} 上传失败`, 'error');
        }
    }

    async function submitUploadContent() {
        const titleInput = getElement('contentTitleInput');
        const typeSelect = getElement('contentTypeSelect');
        const descInput = getElement('contentDescInput');
        const categorySelect = getElement('contentCategorySelect');

        const title = titleInput ? titleInput.value.trim() : '';
        const contentType = typeSelect ? typeSelect.value : '';
        const description = descInput ? descInput.value.trim() : '';
        const categoryId = categorySelect ? categorySelect.value : '';

        if (!title) {
            showToast('請輸入標題', 'error');
            return;
        }
        if (!contentType) {
            showToast('請選擇內容類型', 'error');
            return;
        }

        // 外部視頻連結：走 /upload 端點 (FormData)
        if (contentType === 'video_external') {
            const urlInput = getElement('externalVideoUrlInput');
            const platformSelect = getElement('videoPlatformSelect');
            const externalUrl = urlInput ? urlInput.value.trim() : '';
            const videoPlatform = platformSelect ? platformSelect.value : '';

            if (!externalUrl) {
                showToast('請輸入視頻連結', 'error');
                return;
            }

            try {
                const formData = new FormData();
                formData.append('title', title);
                formData.append('description', description);
                formData.append('content_type', 'video_external');
                formData.append('external_url', externalUrl);
                formData.append('tags', '');
                if (videoPlatform) formData.append('video_platform', videoPlatform);
                if (categoryId) formData.append('category_ids', categoryId);

                const response = await apiUpload(`${ADMIN_API}/upload`, formData);
                if (response.success) {
                    showToast('視頻連結上傳成功', 'success');
                    if (titleInput) titleInput.value = '';
                    if (descInput) descInput.value = '';
                    if (urlInput) urlInput.value = '';
                    loadedTabs.delete('media');
                    loadedTabs.delete('resources');
                    if (currentTab === 'media') await loadMedia(1);
                }
            } catch (error) {
                console.error('Video link submit error:', error);
                showToast('視頻連結上傳失敗', 'error');
            }
            return;
        }

        // 其他類型：走 /contents 端點 (JSON)
        try {
            const body = {
                title,
                description,
                content_type: contentType,
            };
            if (categoryId) body.category_ids = [parseInt(categoryId)];

            const response = await apiPost(`${ADMIN_API}/contents`, body);
            if (response.success) {
                showToast('內容創建成功', 'success');
                if (titleInput) titleInput.value = '';
                if (descInput) descInput.value = '';
                loadedTabs.delete('media');
                loadedTabs.delete('resources');
                if (currentTab === 'media') await loadMedia(1);
            }
        } catch (error) {
            console.error('Content submit error:', error);
        }
    }

    // ==================== ADMIN: KNOWLEDGE NODES ====================

    async function loadAdminNodes() {
        try {
            const response = await api(`${API_BASE}/knowledge-map`);
            if (response.success) {
                state.nodes = response.data.nodes || [];
                state.edges = response.data.edges || [];
                renderAdminNodes();
                populateNodeDropdowns();
            }
        } catch (error) {
            console.error('Failed to load nodes:', error);
        }
    }

    function populateNodeDropdowns() {
        const sourceSelect = getElement('edgeSourceNodeSelect');
        const targetSelect = getElement('edgeTargetNodeSelect');

        [sourceSelect, targetSelect].forEach(select => {
            if (!select) return;
            const val = select.value;
            select.innerHTML = '<option value="">選擇知識點</option>';
            state.nodes.forEach(node => {
                select.innerHTML += `<option value="${node.id}">${escapeHtml(node.title)}</option>`;
            });
            select.value = val;
        });
    }

    function renderAdminNodes() {
        const listEl = getElement('nodesList');
        if (!listEl) return;

        if (state.nodes.length === 0) {
            listEl.innerHTML = '<p class="alc-empty">暂无知识节点</p>';
            return;
        }

        listEl.innerHTML = state.nodes.map(node => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${escapeHtml(node.icon || '📌')} ${escapeHtml(node.title)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${escapeHtml(node.description || '')}</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editNode(${node.id})">编辑</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deleteNode(${node.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    async function submitNode() {
        const nameInput = getElement('nodeNameInput');
        const descInput = getElement('nodeDescInput');
        const categorySelect = getElement('nodeCategorySelect');

        const title = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const categoryId = categorySelect ? categorySelect.value : '';

        if (!title) {
            showToast('请输入知识点名称', 'error');
            return;
        }

        try {
            const editingId = nameInput && nameInput.getAttribute('data-editing-id');
            const body = { title, description };
            if (categoryId) body.category_id = parseInt(categoryId);

            let response;
            if (editingId) {
                response = await apiPut(`${ADMIN_API}/knowledge-nodes/${editingId}`, body);
            } else {
                response = await apiPost(`${ADMIN_API}/knowledge-nodes`, body);
            }

            if (response.success) {
                showToast(editingId ? '知识点更新成功' : '知识点创建成功', 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (descInput) descInput.value = '';
                await loadAdminNodes();
                loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Node submit error:', error);
        }
    }

    async function submitEdge() {
        const sourceSelect = getElement('edgeSourceNodeSelect');
        const targetSelect = getElement('edgeTargetNodeSelect');
        const typeInput = getElement('edgeTypeInput');

        const sourceId = sourceSelect ? sourceSelect.value : '';
        const targetId = targetSelect ? targetSelect.value : '';
        const relationType = typeInput ? typeInput.value.trim() : 'related';

        if (!sourceId || !targetId) {
            showToast('请选择来源和目标知识点', 'error');
            return;
        }

        try {
            const response = await apiPost(`${ADMIN_API}/knowledge-edges`, {
                source_node_id: parseInt(sourceId),
                target_node_id: parseInt(targetId),
                relation_type: relationType || 'related',
                label: relationType || '',
            });

            if (response.success) {
                showToast('知识点连接成功', 'success');
                if (typeInput) typeInput.value = '';
                await loadAdminNodes();
                loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Edge submit error:', error);
        }
    }

    // ==================== ADMIN: BATCH IMPORT ====================

    /**
     * 打開批量導入模態框，重置表單狀態。
     */
    function openBatchImportModal() {
        const modal = getElement('batchImportModal');
        if (!modal) return;

        // 重置表單
        const jsonInput = getElement('batchImportJsonInput');
        const fileInput = getElement('batchImportFileInput');
        const fileNameEl = getElement('batchImportFileName');
        const clearCheckbox = getElement('batchImportClearExisting');
        const resultEl = getElement('batchImportResult');
        const submitBtn = getElement('batchImportSubmitBtn');

        if (jsonInput) jsonInput.value = '';
        if (fileInput) fileInput.value = '';
        if (fileNameEl) fileNameEl.style.display = 'none';
        if (clearCheckbox) clearCheckbox.checked = false;
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
        if (submitBtn) submitBtn.disabled = false;

        modal.classList.add('active');
    }

    /**
     * 關閉批量導入模態框。
     */
    function closeBatchImportModal() {
        const modal = getElement('batchImportModal');
        if (modal) modal.classList.remove('active');
    }

    /**
     * 讀取用戶選擇的 JSON 文件並填入文本區域。
     * @param {File} file - 上傳的 JSON 文件
     */
    function readBatchImportFile(file) {
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            showToast('請選擇 .json 格式的文件', 'error');
            return;
        }

        const fileNameEl = getElement('batchImportFileName');
        if (fileNameEl) {
            fileNameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            fileNameEl.style.display = 'block';
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const jsonInput = getElement('batchImportJsonInput');
            if (jsonInput) jsonInput.value = e.target.result;
        };
        reader.onerror = function () {
            showToast('文件讀取失敗', 'error');
        };
        reader.readAsText(file);
    }

    /**
     * 初始化批量導入相關的事件監聽器。
     * 包括：開關模態框、文件拖放、文件選擇、提交。
     */
    function initBatchImportListeners() {
        // 開啟按鈕
        const openBtn = getElement('openBatchImportBtn');
        if (openBtn) openBtn.addEventListener('click', openBatchImportModal);

        // 關閉按鈕 & 取消按鈕
        const closeBtn = getElement('batchImportCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeBatchImportModal);

        const cancelBtn = getElement('batchImportCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeBatchImportModal);

        // 點擊遮罩關閉
        const modal = getElement('batchImportModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeBatchImportModal();
            });
        }

        // 文件選擇
        const dropZone = getElement('batchImportDropZone');
        const fileInput = getElement('batchImportFileInput');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) readBatchImportFile(this.files[0]);
            });

            // 拖放
            dropZone.addEventListener('dragover', function (e) {
                e.preventDefault();
                this.classList.add('dragover');
            });
            dropZone.addEventListener('dragleave', function () {
                this.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', function (e) {
                e.preventDefault();
                this.classList.remove('dragover');
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    readBatchImportFile(e.dataTransfer.files[0]);
                }
            });
        }

        // 提交
        const submitBtn = getElement('batchImportSubmitBtn');
        if (submitBtn) submitBtn.addEventListener('click', submitBatchImport);
    }

    /**
     * 驗證並提交批量導入請求。
     *
     * 流程：解析 JSON → 確認 clear_existing → 調用 API → 顯示結果 → 刷新列表。
     */
    async function submitBatchImport() {
        const jsonInput = getElement('batchImportJsonInput');
        const clearCheckbox = getElement('batchImportClearExisting');
        const resultEl = getElement('batchImportResult');
        const submitBtn = getElement('batchImportSubmitBtn');

        const rawJson = jsonInput ? jsonInput.value.trim() : '';
        if (!rawJson) {
            showToast('請輸入或上傳 JSON 數據', 'error');
            return;
        }

        // 1. 解析 JSON
        let payload;
        try {
            payload = JSON.parse(rawJson);
        } catch (e) {
            showToast('JSON 格式無效，請檢查語法', 'error');
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `JSON 解析失敗：${e.message}`;
                resultEl.style.display = 'block';
            }
            return;
        }

        // 2. 基本結構校驗
        if (!payload.nodes || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
            showToast('JSON 中必須包含非空的 nodes 陣列', 'error');
            return;
        }

        // 3. 確認清空操作（如果勾選）
        const clearExisting = clearCheckbox ? clearCheckbox.checked : false;
        if (clearExisting) {
            if (!confirm('⚠️ 您確定要清空所有現有知識點嗎？此操作無法撤銷！')) {
                return;
            }
        }

        // 4. 組裝請求並提交
        payload.clear_existing = clearExisting;
        if (!payload.edges) payload.edges = [];

        if (submitBtn) submitBtn.disabled = true;
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

        try {
            const response = await apiPost(
                `${ADMIN_API}/knowledge-graph/import`,
                payload
            );

            if (response.success) {
                const data = response.data || {};
                const nodeCount = data.created_nodes || 0;
                const edgeCount = data.created_edges || 0;
                const skipped = data.skipped_edges || 0;
                const errors = data.errors || [];

                // 5. 顯示結果
                const hasErrors = errors.length > 0;
                const resultClass = hasErrors
                    ? 'alc-batch-import-result--partial'
                    : 'alc-batch-import-result--success';

                let html = `<strong>✅ 導入完成</strong><br>`;
                html += `建立 ${nodeCount} 個知識點、${edgeCount} 條連接`;
                if (skipped > 0) html += `（跳過 ${skipped} 條邊）`;
                if (hasErrors) {
                    html += `<br><br><strong>⚠️ 部分警告：</strong><br>`;
                    html += errors.map(e => `• ${e}`).join('<br>');
                }

                if (resultEl) {
                    resultEl.className = `alc-batch-import-result ${resultClass}`;
                    resultEl.innerHTML = html;
                    resultEl.style.display = 'block';
                }

                showToast(`成功導入 ${nodeCount} 個知識點`, 'success');

                // 6. 刷新相關數據
                await loadAdminNodes();
                loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Batch import error:', error);
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `導入失敗：${error.message || '未知錯誤'}`;
                resultEl.style.display = 'block';
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function editNode(nodeId) {
        const node = state.nodes.find(n => n.id == nodeId);
        if (!node) return;

        const nameInput = getElement('nodeNameInput');
        const descInput = getElement('nodeDescInput');

        if (nameInput) {
            nameInput.value = node.title;
            nameInput.setAttribute('data-editing-id', nodeId);
            nameInput.focus();
        }
        if (descInput) descInput.value = node.description || '';

        switchAdminTab('nodes');
    }

    async function deleteNode(nodeId) {
        if (!confirm('确定要删除该节点吗？')) return;

        try {
            const response = await apiDelete(`${ADMIN_API}/knowledge-nodes/${nodeId}`);
            if (response.success) {
                showToast('节点删除成功', 'success');
                await loadAdminNodes();
                loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    function getNode(nodeId) {
        return state.nodes.find(n => n.id == nodeId);
    }

    // ==================== ADMIN: LEARNING PATHS ====================

    async function loadAdminPaths() {
        try {
            const response = await api(`${API_BASE}/paths`);
            if (response.success) {
                state.paths = response.data || [];
                renderAdminPaths();
            }
        } catch (error) {
            console.error('Failed to load paths:', error);
        }
    }

    function renderAdminPaths() {
        const listEl = getElement('pathsList');
        if (!listEl) return;

        if (state.paths.length === 0) {
            listEl.innerHTML = '<p class="alc-empty">暂无学习路径</p>';
            return;
        }

        listEl.innerHTML = state.paths.map(path => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${escapeHtml(path.icon || '🎯')} ${escapeHtml(path.title)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${escapeHtml(path.difficulty || '')} · ${path.estimated_hours || 0}h</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editPath(${path.id})">编辑</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deletePath(${path.id})">删除</button>
                </div>
            </div>
        `).join('');
    }

    async function submitPath() {
        const nameInput = getElement('pathNameInput');
        const descInput = getElement('pathDescInput');
        const diffSelect = getElement('pathDifficultySelect');
        const durationInput = getElement('pathDurationInput');

        const title = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const difficulty = diffSelect ? diffSelect.value : 'beginner';
        const estimatedHours = durationInput ? parseFloat(durationInput.value) || 0 : 0;

        if (!title) {
            showToast('请输入路径名称', 'error');
            return;
        }

        try {
            const editingId = nameInput && nameInput.getAttribute('data-editing-id');
            const body = { title, description, difficulty, estimated_hours: estimatedHours };

            let response;
            if (editingId) {
                response = await apiPut(`${ADMIN_API}/paths/${editingId}`, body);
            } else {
                response = await apiPost(`${ADMIN_API}/paths`, body);
            }

            if (response.success) {
                showToast(editingId ? '路径更新成功' : '路径创建成功', 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (descInput) descInput.value = '';
                if (durationInput) durationInput.value = '';
                await loadAdminPaths();
                loadedTabs.delete('paths');
            }
        } catch (error) {
            console.error('Path submit error:', error);
        }
    }

    async function editPath(pathId) {
        const path = state.paths.find(p => p.id == pathId);
        if (!path) return;

        const nameInput = getElement('pathNameInput');
        const descInput = getElement('pathDescInput');
        const diffSelect = getElement('pathDifficultySelect');
        const durationInput = getElement('pathDurationInput');

        if (nameInput) {
            nameInput.value = path.title;
            nameInput.setAttribute('data-editing-id', pathId);
            nameInput.focus();
        }
        if (descInput) descInput.value = path.description || '';
        if (diffSelect) diffSelect.value = path.difficulty || 'beginner';
        if (durationInput) durationInput.value = path.estimated_hours || '';

        switchAdminTab('paths');
    }

    async function deletePath(pathId) {
        if (!confirm('确定要删除该路径吗？')) return;

        try {
            const response = await apiDelete(`${ADMIN_API}/paths/${pathId}`);
            if (response.success) {
                showToast('路径删除成功', 'success');
                await loadAdminPaths();
                loadedTabs.delete('paths');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    // ==================== PUBLIC API ====================

    // Expose public functions to window
    window.lcLearningCenter = {
        init,
        switchTab,
        setTypeFilter,
        openContent,
        showPathDetail,
        hidePathDetail,
        showNodeDetail,
        hideNodeDetail,
        downloadResource,
        closeAllModals,
        editCategory,
        deleteCategory,
        editNode,
        deleteNode,
        getNode,
        openBatchImportModal,
        closeBatchImportModal,
        editPath,
        deletePath,
        sendAiQuestion,
        clearAiContext,
        toggleAiWindow,
        toggleAiWindowSize,
        toggleAdminPanel,
        navigateToContent,
        searchNodes
    };

    // ==================== DOCUMENT READY ====================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
