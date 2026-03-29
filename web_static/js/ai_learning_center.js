/**
 * AI Learning Center - Main Entry Module
 *
 * Shared state, utilities, initialization, tabs, categories, modals, and search.
 * Sub-modules (knowledge map, admin, media, AI chat) load via window.alc namespace.
 *
 * Load order (in HTML):
 *   1. ai_learning_center.js   (this file — exposes window.alc)
 *   2. alc_knowledge_map.js
 *   3. alc_media.js
 *   4. alc_admin.js
 *   5. alc_ai_chat.js
 */
(function () {
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

    // Module registry — sub-modules register themselves here
    const modules = {};

    // ==================== I18N HELPER ====================
    /**
     * Shorthand for i18n.t() with fallback.
     * Sub-modules access this via window.alc._t()
     */
    function _t(key, params) {
        if (typeof i18n !== 'undefined' && i18n.t) return i18n.t(key, params);
        // Return key as fallback (stripped of prefix)
        return key;
    }

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
                throw new Error(data.message || _t('common.requestFailed'));
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            showToast(error.message || _t('common.networkError'), 'error');
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
     * POST JSON and return raw Response (for SSE streaming)
     */
    async function apiStreamPost(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = '/';
            return null;
        }
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response;
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
                throw new Error(data.message || _t('alc.uploadFailed'));
            }

            return data;
        } catch (error) {
            console.error('Upload Error:', error);
            showToast(error.message || _t('common.networkError'), 'error');
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
    function decodeToken(tok) {
        try {
            const payload = JSON.parse(atob(tok.split('.')[1]));
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
        return function (...args) {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => func(...args), delay);
        };
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

    /**
     * Get content type icon emoji
     */
    function getContentTypeIcon(contentType) {
        switch (contentType) {
            case 'video': case 'video_local': case 'video_external':
                return '\uD83C\uDFAC';
            case 'document':
                return '\uD83D\uDCC4';
            case 'image':
                return '\uD83D\uDDBC\uFE0F';
            case 'article':
                return '\uD83D\uDCDD';
            default:
                return '\uD83D\uDCCE';
        }
    }

    /**
     * Flatten nested categories into a flat list
     */
    function flattenCategories(categories, result = []) {
        categories.forEach(cat => {
            result.push(cat);
            if (cat.children && cat.children.length > 0) {
                flattenCategories(cat.children, result);
            }
        });
        return result;
    }

    // ==================== SHARED NAMESPACE (window.alc) ====================
    // Expose shared state & utilities BEFORE sub-modules are parsed.
    // Sub-modules access these via `const $ = window.alc;`

    const alc = {
        // Constants
        API_BASE,
        ADMIN_API,
        TOAST_DURATION,
        SEARCH_DEBOUNCE_DELAY,

        // State (shared mutable reference)
        state,
        get token() { return token; },
        get currentTab() { return currentTab; },
        get isAdmin() { return isAdmin; },
        loadedTabs,

        // Utility functions
        api,
        apiPost,
        apiStreamPost,
        apiPut,
        apiDelete,
        apiUpload,
        showToast,
        formatFileSize,
        formatDuration,
        escapeHtml,
        parseVideoEmbed,
        getElement,
        on,
        off,
        debounce,
        getFileUrl,
        getContentTypeIcon,
        flattenCategories,

        // i18n helper
        _t,

        // Module registry
        modules,

        // Tooltip timer (used by knowledge map)
        _tooltipTimer: null,

        // ---- Cross-module bridge functions ----
        // These delegate to sub-module functions after all modules are loaded.
        // Modules call $.switchTab(), $.loadMedia(), etc. without knowing the source.

        switchTab,
        loadCategories,

        // Lazy bridges — resolved on first call (modules may not be registered yet)
        loadMedia(...args)              { return modules.media.loadMedia(...args); },
        loadResources(...args)          { return modules.media.loadResources(...args); },
        showEbookContent(...args)       { return modules.media.showEbookContent(...args); },
        showNodeDetail(...args)         { return modules.knowledgeMap.showNodeDetail(...args); },
        highlightNodeWithPath(...args)  { return modules.knowledgeMap.highlightNodeWithPath(...args); },
        updateAiContextIndicator()      { return modules.aiChat.updateAiContextIndicator(); },
    };

    window.alc = alc;

    // ==================== INITIALIZATION ====================

    async function init() {
        // Apply i18n
        if (typeof i18n !== 'undefined') {
            document.title = i18n.t('alc.pageTitle');
            i18n.applyDOM();
        }

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

        // Setup event listeners — core
        setupTabs();
        setupSearch();
        setupModals();

        // Setup event listeners — sub-modules
        if (modules.admin)   modules.admin.setupAdminPanel();
        if (modules.aiChat)  modules.aiChat.setupAiAssistant();
        if (modules.aiChat)  modules.aiChat.setupAiFloatingWindow();
        if (modules.media)   modules.media.setupTypeFilters();

        // Load initial data
        try {
            await loadStats();
            await loadCategories();
            switchTab('map');
        } catch (error) {
            console.error('Initialization error:', error);
            showToast(_t('alc.loadFailed'), 'error');
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
                        if (modules.media) await modules.media.loadMedia(1);
                        break;
                    case 'map':
                        if (modules.knowledgeMap) await modules.knowledgeMap.loadKnowledgeMap();
                        break;
                    case 'paths':
                        if (modules.media) await modules.media.loadPaths();
                        break;
                    case 'resources':
                        if (modules.media) await modules.media.loadResources();
                        break;
                }
            } catch (error) {
                console.error(`Failed to load ${tabName}:`, error);
                showToast(_t('alc.loadTabFailed'), 'error');
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
                if (modules.media) modules.media.renderResourceTree();
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
        allBtn.textContent = _t('alc.all');
        allBtn.addEventListener('click', async () => {
            state.filters.categoryId = null;
            state.currentPage = 1;
            if (modules.media) await modules.media.loadMedia(1);
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
                if (modules.media) await modules.media.loadMedia(1);
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
                const panelEl = getElement('adminPanel');
                if (slidePanel) slidePanel.classList.remove('active');
                if (panelEl) {
                    setTimeout(() => { panelEl.style.display = 'none'; }, 300);
                }
            });
        }

        // Node detail close button
        const nodeCloseBtn = getElement('nodeDetailCloseBtn');
        if (nodeCloseBtn) {
            nodeCloseBtn.addEventListener('click', () => {
                if (modules.knowledgeMap) modules.knowledgeMap.hideNodeDetail();
            });
        }

        // Path detail close button + backdrop click
        const pathCloseBtn = getElement('pathDetailCloseBtn');
        if (pathCloseBtn) {
            pathCloseBtn.addEventListener('click', () => {
                if (modules.media) modules.media.hidePathDetail();
            });
        }
        const pathOverlay = getElement('pathDetailOverlay');
        if (pathOverlay) {
            pathOverlay.addEventListener('click', function (e) {
                if (e.target === pathOverlay && modules.media) modules.media.hidePathDetail();
            });
        }
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
                    videoEl.innerHTML = `<source src="${escapeHtml(fileUrl)}" type="video/mp4">${_t('alc.videoNotSupported')}`;
                    videoContainer.appendChild(videoEl);
                } else if (videoContainer) {
                    const errP = document.createElement('p');
                    errP.className = 'alc-error';
                    errP.style.cssText = 'color:#fff;text-align:center;padding:40px;';
                    errP.textContent = _t('alc.videoLoadFailed');
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
                videoEl.innerHTML = `<source src="${escapeHtml(fileUrl)}" type="${escapeHtml(content.mime_type || 'video/mp4')}">${_t('alc.videoNotSupported')}`;
                videoContainer.appendChild(videoEl);
            } else if (videoContainer) {
                const errP = document.createElement('p');
                errP.className = 'alc-error';
                errP.style.cssText = 'color:#fff;text-align:center;padding:40px;';
                errP.textContent = '\u7121\u6CD5\u8F09\u5165\u8996\u983B';
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
                    ${content.created_at ? `${_t('alc.publishedAt')}${content.created_at}` : ''}
                </p>
                <div class="alc-article-content">
                    ${escapeHtml(content.content || content.description || '')}
                </div>
                ${content.tags ? `<div class="alc-tags">${content.tags.map(tag => `<span class="alc-tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
            `;

            const modalEl = document.getElementById('articleModal');
            if (modalEl) modalEl.style.display = 'block';
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
                if (modules.media) modules.media.loadMedia(1);
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
                if (modules.media) {
                    modules.media.renderMediaGrid();
                    modules.media.renderPagination();
                }
            }
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    // ==================== PUBLIC API ====================
    // Expose public functions to window for inline onclick handlers in HTML.
    // Each delegates to the appropriate sub-module.

    window.lcLearningCenter = {
        init,
        switchTab,
        setTypeFilter(type) { if (modules.media) modules.media.setTypeFilter(type); },
        openContent(id)     { if (modules.media) modules.media.openContent(id); },
        showPathDetail(id)  { if (modules.media) modules.media.showPathDetail(id); },
        hidePathDetail()    { if (modules.media) modules.media.hidePathDetail(); },
        showNodeDetail(n)   { if (modules.knowledgeMap) modules.knowledgeMap.showNodeDetail(n); },
        hideNodeDetail()    { if (modules.knowledgeMap) modules.knowledgeMap.hideNodeDetail(); },
        highlightNodeWithPath(id, opts) { if (modules.knowledgeMap) modules.knowledgeMap.highlightNodeWithPath(id, opts); },
        downloadResource(id){ if (modules.media) modules.media.downloadResource(id); },
        closeAllModals,
        editCategory(id)    { if (modules.admin) modules.admin.editCategory(id); },
        deleteCategory(id)  { if (modules.admin) modules.admin.deleteCategory(id); },
        editNode(id)        { if (modules.admin) modules.admin.editNode(id); },
        deleteNode(id)      { if (modules.admin) modules.admin.deleteNode(id); },
        getNode(id)         { if (modules.admin) return modules.admin.getNode(id); },
        openBatchImportModal()  { if (modules.admin) modules.admin.openBatchImportModal(); },
        closeBatchImportModal() { if (modules.admin) modules.admin.closeBatchImportModal(); },
        openPathImportModal()   { if (modules.admin) modules.admin.openPathImportModal(); },
        closePathImportModal()  { if (modules.admin) modules.admin.closePathImportModal(); },
        editPath(id)        { if (modules.admin) modules.admin.editPath(id); },
        deletePath(id)      { if (modules.admin) modules.admin.deletePath(id); },
        sendAiQuestion()    { if (modules.aiChat) modules.aiChat.sendAiQuestion(); },
        clearAiContext()    { if (modules.aiChat) modules.aiChat.clearAiContext(); },
        toggleAiWindow()    { if (modules.aiChat) modules.aiChat.toggleAiWindow(); },
        toggleAiWindowSize(){ if (modules.aiChat) modules.aiChat.toggleAiWindowSize(); },
        toggleAdminPanel()  { if (modules.admin) modules.admin.toggleAdminPanel(); },
        navigateToContent(id, anchor) { if (modules.knowledgeMap) modules.knowledgeMap.navigateToContent(id, anchor); },
        navigateToKnowledgeNode(id)   { if (modules.aiChat) modules.aiChat.navigateToKnowledgeNode(id); },
        searchNodes(q)      { if (modules.knowledgeMap) modules.knowledgeMap.searchNodes(q); },
    };

    // ==================== DOCUMENT READY ====================
    // Expose init so the HTML can trigger it after ALL sub-module scripts have loaded.
    // This avoids a race condition when the DOM is already complete before sub-modules register.

    alc._init = init;
})();
