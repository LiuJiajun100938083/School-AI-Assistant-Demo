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
        }
    };

    // Track loaded tabs to avoid duplicate API calls
    const loadedTabs = new Set();

    // Map tab names to their panel element IDs in HTML
    const TAB_PANEL_MAP = {
        'map': 'tabMap',
        'paths': 'tabPaths',
        'media': 'tabMedia',
        'ai': 'tabAi',
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

        // Show admin button if authorized
        const adminToggleBtn = getElement('adminToggleBtn');
        if (adminToggleBtn && isAdmin) {
            adminToggleBtn.style.display = 'block';
        }

        // Setup event listeners
        setupTabs();
        setupSearch();
        setupAdminPanel();
        setupModals();
        setupAiAssistant();
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
                    case 'ai':
                        // AI tab is ready to go
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
            item.addEventListener('click', () => {
                // Highlight active
                nav.querySelectorAll('.alc-ebook-item').forEach(i => i.classList.remove('alc-ebook-item--active'));
                item.classList.add('alc-ebook-item--active');
                const contentId = item.getAttribute('data-id');
                showEbookContent(contentId);
            });
        });
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

            // Hide welcome, show viewer
            if (welcome) welcome.style.display = 'none';
            viewer.style.display = 'block';

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

        // Map edge data: API returns source_node_id/target_node_id, D3 expects source/target
        const d3Edges = state.edges.map(e => ({
            ...e,
            source: e.source_node_id,
            target: e.target_node_id,
            label: e.relationship_type || e.label || '',
        }));

        // Setup dimensions
        const width = svgElement.clientWidth || 800;
        const height = svgElement.clientHeight || 600;

        // Create SVG
        const svg = d3.select(svgElement)
            .attr('width', width)
            .attr('height', height);

        // Define arrow marker
        svg.append('defs').append('marker')
            .attr('id', 'arrowhead')
            .attr('markerWidth', 10)
            .attr('markerHeight', 10)
            .attr('refX', 25)
            .attr('refY', 3)
            .attr('orient', 'auto')
            .append('polygon')
            .attr('points', '0 0, 10 3, 0 6')
            .attr('fill', '#999');

        // Create groups
        const g = svg.append('g');
        const linkGroup = g.append('g').attr('class', 'links');
        const nodeGroup = g.append('g').attr('class', 'nodes');
        const labelGroup = g.append('g').attr('class', 'labels');

        // Create force simulation
        const simulation = d3.forceSimulation(state.nodes)
            .force('link', d3.forceLink(d3Edges)
                .id(d => d.id)
                .distance(100)
                .strength(0.5))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collision', d3.forceCollide().radius(50));

        // Render edges
        const links = linkGroup.selectAll('line')
            .data(d3Edges)
            .enter()
            .append('line')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 2)
            .attr('marker-end', 'url(#arrowhead)');

        // Edge labels
        const edgeLabels = labelGroup.selectAll('text.edge-label')
            .data(d3Edges)
            .enter()
            .append('text')
            .attr('class', 'edge-label')
            .attr('dy', -5)
            .text(d => d.label || '')
            .attr('fill', '#666')
            .attr('font-size', '12px');

        // Render nodes
        const nodes = nodeGroup.selectAll('circle')
            .data(state.nodes)
            .enter()
            .append('circle')
            .attr('r', 25)
            .attr('fill', d => d.color || '#4CAF50')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2)
            .attr('cursor', 'pointer')
            .on('click', (event, d) => {
                event.stopPropagation();
                showNodeDetail(d);
            })
            .call(d3.drag()
                .on('start', dragStarted)
                .on('drag', dragged)
                .on('end', dragEnded));

        // Node labels
        const nodeLabels = labelGroup.selectAll('text.node-label')
            .data(state.nodes)
            .enter()
            .append('text')
            .attr('class', 'node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.3em')
            .attr('font-size', '12px')
            .attr('fill', '#fff')
            .attr('pointer-events', 'none')
            .text(d => d.title.substring(0, 8));

        // Zoom behavior
        const zoom = d3.zoom()
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        svg.call(zoom);

        // Update positions on simulation tick
        simulation.on('tick', () => {
            links
                .attr('x1', d => d.source.x)
                .attr('y1', d => d.source.y)
                .attr('x2', d => d.target.x)
                .attr('y2', d => d.target.y);

            edgeLabels
                .attr('x', d => (d.source.x + d.target.x) / 2)
                .attr('y', d => (d.source.y + d.target.y) / 2);

            nodes
                .attr('cx', d => d.x)
                .attr('cy', d => d.y);

            nodeLabels
                .attr('x', d => d.x)
                .attr('y', d => d.y);
        });

        // Drag behavior
        function dragStarted(event, d) {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
        }

        function dragged(event, d) {
            d.fx = event.x;
            d.fy = event.y;
        }

        function dragEnded(event, d) {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
        }

        // Add zoom controls
        setupKnowledgeMapControls(svg, zoom);
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
                svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
            });
        }
    }

    function showNodeDetail(node) {
        const panel = getElement('nodeDetailPanel');
        if (!panel) return;

        // Find related contents
        const relatedEdges = state.edges.filter(e => e.source_node_id === node.id || e.target_node_id === node.id);
        const relatedContentIds = [];
        // Note: This assumes the API provides content associations

        panel.innerHTML = `
            <div class="alc-node-detail">
                <button class="alc-close-btn" onclick="window.lcLearningCenter.hideNodeDetail()">&times;</button>
                <div class="alc-node-header" style="background-color: ${node.color || '#4CAF50'}">
                    <h2>${escapeHtml(node.title)}</h2>
                </div>
                <div class="alc-node-body">
                    <p>${escapeHtml(node.description || '')}</p>
                    <div class="alc-related-nodes">
                        <h4>相关节点</h4>
                        ${relatedEdges.length > 0 ? relatedEdges.map(edge => {
                            const relatedNode = state.nodes.find(n =>
                                (edge.source_node_id === node.id ? edge.target_node_id : edge.source_node_id) === n.id
                            );
                            return relatedNode ? `
                                <div class="alc-related-node">
                                    <span class="alc-relation-label">${escapeHtml(edge.label || edge.relation_type)}</span>
                                    <button class="alc-related-node-btn" onclick="window.lcLearningCenter.showNodeDetail(window.lcLearningCenter.getNode('${relatedNode.id}'))">
                                        ${escapeHtml(relatedNode.title)}
                                    </button>
                                </div>
                            ` : '';
                        }).join('') : '<p class="alc-empty">暂无相关节点</p>'}
                    </div>
                </div>
            </div>
        `;

        panel.style.display = 'block';
    }

    function hideNodeDetail() {
        const panel = getElement('nodeDetailPanel');
        if (panel) {
            panel.style.display = 'none';
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

        // Add user message
        renderAiMessage('user', question);
        inputBox.value = '';
        inputBox.focus();

        // Show loading indicator
        const loadingEl = document.createElement('div');
        loadingEl.className = 'alc-ai-message alc-ai-assistant alc-ai-loading';
        loadingEl.innerHTML = '<div class="alc-typing-indicator"><span></span><span></span><span></span></div>';
        messagesEl.appendChild(loadingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        try {
            const response = await apiPost(`${API_BASE}/ai-ask`, {
                question: question,
                context_filter: {}
            });

            loadingEl.remove();

            if (response.success) {
                const data = response.data;
                renderAiMessage('assistant', data.answer, data.sources);
            } else {
                showToast('AI 响应出错', 'error');
            }
        } catch (error) {
            loadingEl.remove();
            showToast('发送失败，请重试', 'error');
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderAiMessage(role, content, sources = null) {
        const messagesEl = getElement('aiMessages');
        if (!messagesEl) return;

        const messageEl = document.createElement('div');
        messageEl.className = `alc-ai-message alc-ai-${role}`;

        const contentEl = document.createElement('div');
        contentEl.className = 'alc-ai-content';

        // Parse markdown-like formatting
        let formattedContent = escapeHtml(content);
        formattedContent = formattedContent.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formattedContent = formattedContent.replace(/\*(.*?)\*/g, '<em>$1</em>');
        formattedContent = formattedContent.replace(/\n/g, '<br>');

        contentEl.innerHTML = formattedContent;
        messageEl.appendChild(contentEl);

        if (sources && sources.length > 0) {
            const sourcesEl = document.createElement('div');
            sourcesEl.className = 'alc-ai-sources';
            sourcesEl.innerHTML = '<p>参考资料：</p>' + sources.map(source => `
                <a href="${escapeHtml(source.url)}" target="_blank" class="alc-source-link">
                    ${escapeHtml(source.title)}
                </a>
            `).join('');
            messageEl.appendChild(sourcesEl);
        }

        messagesEl.appendChild(messageEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
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
            // Local video — use file_path to construct URL
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

            const newTitle = prompt('修改標題：', content.title);
            if (newTitle === null) return; // cancelled

            const newDesc = prompt('修改描述：', content.description || '');
            if (newDesc === null) return;

            const updateData = {};
            if (newTitle !== content.title) updateData.title = newTitle;
            if (newDesc !== (content.description || '')) updateData.description = newDesc;

            if (Object.keys(updateData).length === 0) {
                showToast('沒有修改', 'info');
                return;
            }

            const updateResponse = await api(`${ADMIN_API}/contents/${contentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            if (updateResponse.success) {
                showToast('內容已更新', 'success');
                loadAdminContents();
                loadMedia();
            } else {
                showToast(updateResponse.message || '更新失敗', 'error');
            }
        } catch (error) {
            console.error('Failed to edit content:', error);
            showToast('更新失敗', 'error');
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

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', (titleInput && titleInput.value.trim()) || file.name);
        formData.append('description', (descInput && descInput.value.trim()) || '');
        formData.append('tags', '');

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
        editPath,
        deletePath,
        sendAiQuestion,
        toggleAdminPanel
    };

    // ==================== DOCUMENT READY ====================

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
