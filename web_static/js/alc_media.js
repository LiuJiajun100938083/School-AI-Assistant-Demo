/**
 * AI Learning Center - Media, Paths & Resources Module
 * Content browsing, ebook viewer, learning paths, and resource downloads
 */
(function() {
    'use strict';

    const $ = window.alc;

    // ==================== MEDIA LIBRARY ====================

    async function loadMedia(page = 1) {
        try {
            const rawParams = {
                page: page,
                page_size: $.state.pageSize,
            };
            if ($.state.filters.contentType) rawParams.content_type = $.state.filters.contentType;
            if ($.state.filters.categoryId) rawParams.category_id = $.state.filters.categoryId;
            if ($.state.filters.tag) rawParams.tag = $.state.filters.tag;
            if ($.state.filters.search) rawParams.search = $.state.filters.search;
            const params = new URLSearchParams(rawParams);

            const response = await $.api(`${$.API_BASE}/contents?${params}`);
            if (response.success) {
                $.state.contents = response.data || [];
                $.state.currentPage = response.pagination?.page || page;
                $.state.totalItems = response.pagination?.total || 0;
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

        if ($.state.contents.length === 0) {
            nav.innerHTML = '<p class="alc-ebook-nav-empty">暫無內容</p>';
            return;
        }

        // Build category lookup
        const flatCats = $.flattenCategories($.state.categories);
        const catMap = {};
        flatCats.forEach(c => { catMap[c.id] = c; });

        // Group contents by category
        const grouped = {};
        const uncategorized = [];
        $.state.contents.forEach(content => {
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
                    <span class="alc-ebook-folder-name">${$.escapeHtml(cat.name)}</span>
                </div>
                <ul class="alc-ebook-folder-items">`;

            grouped[cat.id].forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${$.escapeHtml(content.title)}</span>
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
                    <span class="alc-ebook-item-title">${$.escapeHtml(content.title)}</span>
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
            $.state.contents.forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${$.escapeHtml(content.title)}</span>
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
            await $.apiPut(`${$.ADMIN_API}/contents/reorder`, { content_ids: contentIds });
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
            const response = await $.api(`${$.API_BASE}/contents/${contentId}`);
            if (!response.success) return;
            const content = response.data;

            // 更新 AI 助教的内容上下文
            $.state.currentContentId = parseInt(contentId);
            $.state.currentContentTitle = content.title || '';
            $.updateAiContextIndicator();

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
                    const fileUrl = $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<video class="alc-ebook-video" controls>
                            <source src="${$.escapeHtml(fileUrl)}" type="${$.escapeHtml(content.mime_type || 'video/mp4')}">
                            您的瀏覽器不支持視頻播放
                        </video>`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入視頻</p>';
                    }
                    break;
                }
                case 'video_external': {
                    const embedUrl = $.parseVideoEmbed(content.external_url);
                    if (embedUrl) {
                        bodyEl.innerHTML = `<div class="alc-ebook-video-wrap">
                            <iframe class="alc-ebook-iframe" src="${$.escapeHtml(embedUrl)}"
                                frameborder="0" allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                            </iframe>
                        </div>`;
                    } else {
                        // Fallback: show link
                        bodyEl.innerHTML = `<p>外部視頻連結：<a href="${$.escapeHtml(content.external_url || '')}" target="_blank" rel="noopener">${$.escapeHtml(content.external_url || '無連結')}</a></p>`;
                    }
                    break;
                }
                case 'image': {
                    const fileUrl = content.image_url || $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<img class="alc-ebook-image" src="${$.escapeHtml(fileUrl)}" alt="${$.escapeHtml(content.title || '')}" />`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入圖片</p>';
                    }
                    break;
                }
                case 'document': {
                    const fileUrl = $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<iframe class="alc-ebook-doc-iframe" src="${$.escapeHtml(fileUrl)}" frameborder="0"></iframe>
                            <div class="alc-ebook-doc-actions">
                                <a href="${$.escapeHtml(fileUrl)}" class="alc-btn alc-btn--primary" download="${$.escapeHtml(content.title || 'download')}">下載文件</a>
                            </div>`;
                    } else {
                        bodyEl.innerHTML = '<p class="alc-ebook-error">無法載入文件</p>';
                    }
                    break;
                }
                case 'article': {
                    const articleContent = content.article_content || content.description || '';
                    if (typeof marked !== 'undefined' && articleContent) {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${DOMPurify.sanitize(marked.parse(articleContent))}</div>`;
                    } else {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${$.escapeHtml(articleContent) || '<p>暫無內容</p>'}</div>`;
                    }
                    break;
                }
                default: {
                    const fileUrl = $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<p>檔案：<a href="${$.escapeHtml(fileUrl)}" target="_blank" rel="noopener">${$.escapeHtml(content.title || '下載')}</a></p>`;
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
        // 确保先切换到教学资料 tab，再打开内容
        if ($.currentTab !== 'media') {
            await $.switchTab('media');
            await new Promise(r => setTimeout(r, 150));
        }
        await showEbookContent(contentId);
    }

    function setTypeFilter(type) {
        // No longer used in ebook layout
    }

    function setupTypeFilters() {
        // No longer used in ebook layout (filters removed from HTML)
    }

    // ==================== LEARNING PATHS ====================

    async function loadPaths() {
        try {
            const response = await $.api(`${$.API_BASE}/paths`);
            if (response.success) {
                $.state.paths = response.data || [];
                renderPaths();
            }
        } catch (error) {
            console.error('Failed to load paths:', error);
        }
    }

    function renderPaths() {
        const grid = $.getElement('pathsGrid');
        if (!grid) return;

        if ($.state.paths.length === 0) {
            grid.innerHTML = '<div class="alc-empty-state">暂无学习路径</div>';
            return;
        }

        const difficultyMap = { beginner: '入门', intermediate: '中级', advanced: '高级' };
        const iconMap = { beginner: '🌱', intermediate: '📘', advanced: '🚀' };
        const colorMap = {
            beginner: 'linear-gradient(135deg, #e8f5e9 0%, #c8e6c9 100%)',
            intermediate: 'linear-gradient(135deg, #fff3e0 0%, #ffe0b2 100%)',
            advanced: 'linear-gradient(135deg, #fce4ec 0%, #f8bbd0 100%)'
        };

        grid.innerHTML = $.state.paths.map(path => {
            const diff = path.difficulty || 'beginner';
            const steps = path.step_count || 0;
            const hours = path.estimated_hours || 0;
            return `
                <div class="alc-path-card" data-id="${path.id}" onclick="window.lcLearningCenter.showPathDetail('${path.id}')">
                    <div class="alc-path-cover" style="background: ${colorMap[diff] || colorMap.beginner}; display:flex; align-items:center; justify-content:center;">
                        <span style="font-size: 48px;">${path.icon || iconMap[diff] || '📚'}</span>
                    </div>
                    <div class="alc-path-body">
                        <h3 class="alc-path-title">${$.escapeHtml(path.title)}</h3>
                        <span class="alc-difficulty-badge ${diff}">${iconMap[diff] || ''} ${difficultyMap[diff] || diff}</span>
                        <p style="font-size:13px; color:var(--text-secondary); line-height:1.5; margin:0; flex:1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">
                            ${$.escapeHtml(path.description)}
                        </p>
                        <div class="alc-path-meta">
                            <span class="alc-duration-badge">📚 ${steps} 步骤</span>
                            <span class="alc-duration-badge">⏱️ ${hours} 小时</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    async function showPathDetail(pathId) {
        try {
            const response = await $.api(`${$.API_BASE}/paths/${pathId}`);
            if (response.success) {
                const path = response.data;
                const overlay = $.getElement('pathDetailOverlay');
                if (!overlay) return;

                const difficultyMap = { beginner: '入门', intermediate: '中级', advanced: '高级' };
                const iconMap = { beginner: '🌱', intermediate: '📘', advanced: '🚀' };
                const diff = path.difficulty || 'beginner';

                // 填充预构建的 DOM 元素
                const titleEl = $.getElement('pathDetailTitle');
                const descEl = $.getElement('pathDetailDesc');
                const diffEl = $.getElement('pathDetailDifficulty');
                const durEl = $.getElement('pathDetailDuration');
                const progEl = $.getElement('pathDetailProgress');
                const timelineEl = $.getElement('pathTimeline');

                if (titleEl) titleEl.textContent = path.title;
                if (descEl) descEl.textContent = path.description || '';
                if (diffEl) {
                    diffEl.className = `alc-difficulty-badge ${diff}`;
                    diffEl.textContent = `${iconMap[diff] || ''} ${difficultyMap[diff] || diff}`;
                }
                if (durEl) durEl.textContent = `⏱️ ${path.estimated_hours || 0} 小时`;
                if (progEl) progEl.textContent = `📚 ${(path.steps || []).length} 步骤`;

                // 渲染时间线步骤
                if (timelineEl) {
                    if (path.steps && path.steps.length > 0) {
                        timelineEl.innerHTML = path.steps.map((step, index) => {
                            const hasContent = step.content_id;
                            const hasNode = step.node_id;
                            const anchor = step.anchor;
                            const actions = [];

                            // Build anchor hint (e.g. "→ 第 5-10 页")
                            let anchorHint = '';
                            if (anchor) {
                                if (anchor.type === 'page') anchorHint = ` → 第 ${anchor.value} 页`;
                                else if (anchor.type === 'page_range') anchorHint = ` → 第 ${anchor.from}-${anchor.to} 页`;
                                else if (anchor.type === 'heading') anchorHint = ` → ${anchor.value}`;
                                else if (anchor.type === 'timestamp') {
                                    const min = Math.floor(anchor.value / 60);
                                    const sec = anchor.value % 60;
                                    anchorHint = ` → ${min}:${String(sec).padStart(2, '0')}`;
                                }
                            }

                            if (hasContent) {
                                // Use navigateToContent with anchor for precise page positioning
                                const anchorArg = anchor ? `'${$.escapeHtml(JSON.stringify(anchor))}'` : 'null';
                                const contentTitle = step.content_title ? $.escapeHtml(step.content_title) : '文档';
                                const btnLabel = `📄 ${contentTitle}${anchorHint}`;
                                actions.push(`<button class="alc-step-action-btn" onclick="event.stopPropagation(); window.lcLearningCenter.hidePathDetail(); window.lcLearningCenter.navigateToContent('${step.content_id}', ${anchorArg})">${btnLabel}</button>`);
                            }
                            if (hasNode) {
                                actions.push(`<button class="alc-step-action-btn alc-step-action-btn--node" onclick="event.stopPropagation(); window.lcLearningCenter.hidePathDetail(); window.lcLearningCenter.navigateToKnowledgeNode(${step.node_id})">🔗 知识节点</button>`);
                            }
                            return `
                                <li>
                                    <strong>步骤 ${index + 1}：${$.escapeHtml(step.title)}</strong>
                                    <span>${$.escapeHtml(step.description)}</span>
                                    ${actions.length > 0 ? `<div class="alc-step-actions">${actions.join('')}</div>` : ''}
                                </li>
                            `;
                        }).join('');
                    } else {
                        timelineEl.innerHTML = '<li><span>暂无步骤</span></li>';
                    }
                }

                // 使用 CSS active class 显示（有过渡动画）
                overlay.style.display = '';
                overlay.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to load path detail:', error);
            $.showToast('加载路径详情失败', 'error');
        }
    }

    function hidePathDetail() {
        const overlay = $.getElement('pathDetailOverlay');
        if (overlay) {
            overlay.classList.remove('active');
        }
    }

    // ==================== RESOURCE LIBRARY ====================

    async function loadResources(categoryId = null) {
        try {
            const rawParams = { content_type: 'document', page_size: 1000 };
            if (categoryId) rawParams.category_id = categoryId;
            const params = new URLSearchParams(rawParams);

            const response = await $.api(`${$.API_BASE}/contents?${params}`);
            if (response.success) {
                $.state.contents = response.data || [];
                renderResourceList();
            }
        } catch (error) {
            console.error('Failed to load resources:', error);
        }
    }

    function renderResourceTree() {
        const treeEl = $.getElement('resourceTree');
        if (!treeEl) return;

        treeEl.innerHTML = `
            <div class="alc-category-tree">
                ${$.state.categories.map(cat => `
                    <div class="alc-tree-item">
                        <button class="alc-tree-toggle" data-category="${cat.id}">
                            <span class="alc-tree-arrow">▶</span>
                            <span>${$.escapeHtml(cat.name)}</span>
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
        const listEl = $.getElement('resourceList');
        if (!listEl) return;

        if ($.state.contents.length === 0) {
            listEl.innerHTML = '<div class="alc-empty-state">暂无资源</div>';
            return;
        }

        listEl.innerHTML = `
            <div class="alc-resource-list">
                ${$.state.contents.map(content => `
                    <div class="alc-resource-item">
                        <div class="alc-resource-icon">
                            <i class="icon-document"></i>
                        </div>
                        <div class="alc-resource-info">
                            <h4>${$.escapeHtml(content.title)}</h4>
                            <p>${$.escapeHtml(content.description || '')}</p>
                            <span class="alc-file-size">${$.formatFileSize(content.file_size || 0)}</span>
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
        const categoryContents = $.state.contents.filter(c => c.category_id === categoryId);
        if (categoryContents.length === 0) {
            container.innerHTML = '<p class="alc-empty">该分类暂无资源</p>';
            return;
        }

        container.innerHTML = categoryContents.map(content => `
            <div class="alc-resource-item alc-resource-item-tree">
                <span>${$.escapeHtml(content.title)}</span>
                <button class="alc-btn alc-btn-sm" onclick="window.lcLearningCenter.downloadResource('${content.id}')">
                    下载
                </button>
            </div>
        `).join('');
    }

    async function downloadResource(contentId) {
        try {
            const response = await $.api(`${$.API_BASE}/contents/${contentId}`);
            if (response.success) {
                const content = response.data;
                const fileUrl = $.getFileUrl(content);
                if (fileUrl) {
                    const link = document.createElement('a');
                    link.href = fileUrl;
                    link.download = content.title;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    $.showToast('下載開始', 'success');
                } else {
                    $.showToast('此內容無可下載文件', 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to download resource:', error);
        }
    }

    // Register module functions
    $.modules.media = {
        loadMedia,
        renderMediaGrid,
        showEbookContent,
        openContent,
        setTypeFilter,
        setupTypeFilters,
        renderPagination,
        renderResourceTree,
        loadPaths,
        renderPaths,
        showPathDetail,
        hidePathDetail,
        loadResources,
        downloadResource,
    };
})();
