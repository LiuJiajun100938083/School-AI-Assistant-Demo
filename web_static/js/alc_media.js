/**
 * AI Learning Center - Media, Paths & Resources Module
 * Content browsing, ebook viewer, learning paths, and resource downloads
 */
(function() {
    'use strict';

    const $ = window.alc;
    const _t = $._t;

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
            nav.innerHTML = `<p class="alc-ebook-nav-empty">${_t('alc.noContent')}</p>`;
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
                        <button class="alc-reorder-btn" data-dir="up" title="${_t('alc.moveUp')}">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="${_t('alc.moveDown')}">&#9660;</button>
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
                    <span class="alc-ebook-folder-name">${_t('alc.otherMaterials')}</span>
                </div>
                <ul class="alc-ebook-folder-items">`;

            uncategorized.forEach(content => {
                const typeIcon = getContentTypeIcon(content.content_type);
                html += `<li class="alc-ebook-item" data-id="${content.id}">
                    <span class="alc-ebook-item-icon">${typeIcon}</span>
                    <span class="alc-ebook-item-title">${$.escapeHtml(content.title)}</span>
                    <span class="alc-ebook-item-reorder">
                        <button class="alc-reorder-btn" data-dir="up" title="${_t('alc.moveUp')}">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="${_t('alc.moveDown')}">&#9660;</button>
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
                        <button class="alc-reorder-btn" data-dir="up" title="${_t('alc.moveUp')}">&#9650;</button>
                        <button class="alc-reorder-btn" data-dir="down" title="${_t('alc.moveDown')}">&#9660;</button>
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
            console.error(_t('alc.orderSaveFailed') + ':', error);
        }
    }

    /**
     * Display content inline in the right ebook viewer panel
     */
    async function showEbookContent(contentId, anchor) {
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
                            ${_t('alc.videoNotSupported')}
                        </video>`;
                    } else {
                        bodyEl.innerHTML = `<p class="alc-ebook-error">${_t('alc.videoLoadFailed')}</p>`;
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
                        bodyEl.innerHTML = `<p>${_t('alc.externalVideoLink')}：<a href="${$.escapeHtml(content.external_url || '')}" target="_blank" rel="noopener">${$.escapeHtml(content.external_url || _t('alc.noLink'))}</a></p>`;
                    }
                    break;
                }
                case 'image': {
                    const fileUrl = content.image_url || $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<img class="alc-ebook-image" src="${$.escapeHtml(fileUrl)}" alt="${$.escapeHtml(content.title || '')}" />`;
                    } else {
                        bodyEl.innerHTML = `<p class="alc-ebook-error">${_t('alc.imageLoadFailed')}</p>`;
                    }
                    break;
                }
                case 'document': {
                    const fileUrl = $.getFileUrl(content);
                    if (fileUrl) {
                        const isPdf = (content.mime_type || '').includes('pdf')
                            || (content.file_name || content.file_path || '').toLowerCase().endsWith('.pdf');
                        const startPage = (anchor && (anchor.type === 'page' || anchor.type === 'page_range'))
                            ? (anchor.type === 'page' ? anchor.value : anchor.from)
                            : 1;

                        if (isPdf && window.pdfjsLib) {
                            // Use PDF.js for cross-platform support (iPad / mobile)
                            _renderPdfViewer(bodyEl, fileUrl, startPage, content);
                        } else {
                            // Fallback: native iframe (desktop browsers with PDF plugin)
                            let iframeUrl = fileUrl;
                            if (startPage > 1) iframeUrl += '#page=' + startPage;
                            bodyEl.innerHTML = `<iframe class="alc-ebook-doc-iframe" src="${$.escapeHtml(iframeUrl)}" frameborder="0"></iframe>
                                <div class="alc-ebook-doc-actions">
                                    <a href="${$.escapeHtml(fileUrl)}" class="alc-btn alc-btn--primary" download="${$.escapeHtml(content.title || 'download')}">${_t('alc.downloadFile')}</a>
                                </div>`;
                        }
                    } else {
                        bodyEl.innerHTML = `<p class="alc-ebook-error">${_t('alc.docLoadFailed')}</p>`;
                    }
                    break;
                }
                case 'article': {
                    const articleContent = content.article_content || content.description || '';
                    if (typeof marked !== 'undefined' && articleContent) {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${DOMPurify.sanitize(marked.parse(articleContent))}</div>`;
                    } else {
                        bodyEl.innerHTML = `<div class="alc-ebook-article">${$.escapeHtml(articleContent) || '<p>' + _t('alc.noArticleContent') + '</p>'}</div>`;
                    }
                    break;
                }
                default: {
                    const fileUrl = $.getFileUrl(content);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<p>${_t('alc.fileLabel')}：<a href="${$.escapeHtml(fileUrl)}" target="_blank" rel="noopener">${$.escapeHtml(content.title || _t('alc.download'))}</a></p>`;
                    } else {
                        bodyEl.innerHTML = `<p>${_t('alc.cannotDisplayContent')}</p>`;
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

    async function openContent(contentId, anchor) {
        // 确保先切换到教学资料 tab，再打开内容
        if ($.currentTab !== 'media') {
            await $.switchTab('media');
            await new Promise(r => setTimeout(r, 150));
        }
        await showEbookContent(contentId, anchor);
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
            grid.innerHTML = `<div class="alc-empty-state">${_t('alc.noPaths')}</div>`;
            return;
        }

        const difficultyMap = { beginner: _t('alc.difficultyBeginner'), intermediate: _t('alc.difficultyIntermediate'), advanced: _t('alc.difficultyAdvanced') };
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
                            <span class="alc-duration-badge">📚 ${steps} ${_t('alc.steps')}</span>
                            <span class="alc-duration-badge">⏱️ ${hours} ${_t('alc.hours')}</span>
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

                const difficultyMap = { beginner: _t('alc.difficultyBeginner'), intermediate: _t('alc.difficultyIntermediate'), advanced: _t('alc.difficultyAdvanced') };
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
                if (durEl) durEl.textContent = `⏱️ ${path.estimated_hours || 0} ${_t('alc.hours')}`;
                if (progEl) progEl.textContent = `📚 ${(path.steps || []).length} ${_t('alc.steps')}`;

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
                                if (anchor.type === 'page') anchorHint = ` → ${_t('alc.anchorPage', { page: anchor.value })}`;
                                else if (anchor.type === 'page_range') anchorHint = ` → ${_t('alc.anchorPageRange', { from: anchor.from, to: anchor.to })}`;
                                else if (anchor.type === 'heading') anchorHint = ` → ${anchor.value}`;
                                else if (anchor.type === 'timestamp') {
                                    const min = Math.floor(anchor.value / 60);
                                    const sec = anchor.value % 60;
                                    anchorHint = ` → ${min}:${String(sec).padStart(2, '0')}`;
                                }
                            }

                            if (hasContent) {
                                // Use data attributes to avoid JSON-in-onclick quoting issues
                                const contentTitle = step.content_title ? $.escapeHtml(step.content_title) : _t('alc.document');
                                const btnLabel = `📄 ${contentTitle}${anchorHint}`;
                                const anchorAttr = anchor ? ` data-anchor="${JSON.stringify(anchor).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"` : '';
                                actions.push(`<button class="alc-step-action-btn alc-step-nav-btn" data-content-id="${step.content_id}"${anchorAttr}>${btnLabel}</button>`);
                            }
                            if (hasNode) {
                                actions.push(`<button class="alc-step-action-btn alc-step-action-btn--node" onclick="event.stopPropagation(); window.lcLearningCenter.hidePathDetail(); window.lcLearningCenter.navigateToKnowledgeNode(${step.node_id})">🔗 ${_t('alc.knowledgeNode')}</button>`);
                            }
                            return `
                                <li>
                                    <strong>${_t('alc.stepN', { n: index + 1 })}：${$.escapeHtml(step.title)}</strong>
                                    <span>${$.escapeHtml(step.description)}</span>
                                    ${actions.length > 0 ? `<div class="alc-step-actions">${actions.join('')}</div>` : ''}
                                </li>
                            `;
                        }).join('');
                    } else {
                        timelineEl.innerHTML = `<li><span>${_t('alc.noSteps')}</span></li>`;
                    }
                }

                // Event delegation for step content navigation buttons
                if (timelineEl) {
                    timelineEl.addEventListener('click', (e) => {
                        const navBtn = e.target.closest('.alc-step-nav-btn');
                        if (!navBtn) return;
                        e.stopPropagation();
                        const contentId = navBtn.dataset.contentId;
                        const anchorStr = navBtn.dataset.anchor || null;
                        hidePathDetail();
                        window.lcLearningCenter.navigateToContent(contentId, anchorStr);
                    });
                }

                // 使用 CSS active class 显示（有过渡动画）
                overlay.style.display = '';
                overlay.classList.add('active');
            }
        } catch (error) {
            console.error('Failed to load path detail:', error);
            $.showToast(_t('alc.loadPathDetailFailed'), 'error');
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
            listEl.innerHTML = `<div class="alc-empty-state">${_t('alc.noResources')}</div>`;
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
                            ${_t('alc.download')}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderResourceListByCategory(container, categoryId) {
        const categoryContents = $.state.contents.filter(c => c.category_id === categoryId);
        if (categoryContents.length === 0) {
            container.innerHTML = `<p class="alc-empty">${_t('alc.noCategoryResources')}</p>`;
            return;
        }

        container.innerHTML = categoryContents.map(content => `
            <div class="alc-resource-item alc-resource-item-tree">
                <span>${$.escapeHtml(content.title)}</span>
                <button class="alc-btn alc-btn-sm" onclick="window.lcLearningCenter.downloadResource('${content.id}')">
                    ${_t('alc.download')}
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
                    $.showToast(_t('alc.downloadStarted'), 'success');
                } else {
                    $.showToast(_t('alc.noDownloadableFile'), 'warning');
                }
            }
        } catch (error) {
            console.error('Failed to download resource:', error);
        }
    }

    // ==================== PDF.js VIEWER ====================

    /** Active PDF document reference (for cleanup) */
    let _activePdfDoc = null;
    /** Exposed goToPage function from the active PDF viewer (for external anchor navigation) */
    let _pdfGoToPage = null;

    /**
     * Render a PDF using PDF.js into a scrollable canvas-based viewer.
     * Works on iPad/Safari where native <iframe> PDF rendering is unsupported.
     *
     * @param {HTMLElement} container - Parent element to render into
     * @param {string} fileUrl - URL of the PDF file
     * @param {number} startPage - Initial page to scroll to (1-based)
     * @param {object} content - Content metadata for download button
     */
    async function _renderPdfViewer(container, fileUrl, startPage, content) {
        // Clean up previous PDF doc
        if (_activePdfDoc) {
            _activePdfDoc.destroy();
            _activePdfDoc = null;
        }

        // Set worker source
        if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                '/static/vendor/pdfjs/pdf.worker.min.js';
        }

        // Build viewer skeleton
        container.innerHTML = `
            <div class="alc-pdf-viewer">
                <div class="alc-pdf-toolbar">
                    <button class="alc-pdf-btn" data-action="prev" title="${_t('alc.prevPage')}">◀</button>
                    <span class="alc-pdf-page-info">
                        <input class="alc-pdf-page-input" type="number" min="1" value="1" />
                        <span>/ <span class="alc-pdf-total">-</span></span>
                    </span>
                    <button class="alc-pdf-btn" data-action="next" title="${_t('alc.nextPage')}">▶</button>
                    <span class="alc-pdf-separator"></span>
                    <button class="alc-pdf-btn" data-action="zoomout" title="${_t('alc.zoomOut')}">−</button>
                    <span class="alc-pdf-zoom-label">100%</span>
                    <button class="alc-pdf-btn" data-action="zoomin" title="${_t('alc.zoomIn')}">+</button>
                    <span class="alc-pdf-separator"></span>
                    <a href="${$.escapeHtml(fileUrl)}" class="alc-pdf-btn" download="${$.escapeHtml(content.title || 'download')}" title="${_t('alc.download')}">⬇</a>
                </div>
                <div class="alc-pdf-scroll-area">
                    <div class="alc-pdf-pages"></div>
                </div>
                <div class="alc-pdf-loading">${_t('alc.pdfLoading')}</div>
            </div>`;

        const viewer = container.querySelector('.alc-pdf-viewer');
        const pagesContainer = viewer.querySelector('.alc-pdf-pages');
        const scrollArea = viewer.querySelector('.alc-pdf-scroll-area');
        const loadingEl = viewer.querySelector('.alc-pdf-loading');
        const pageInput = viewer.querySelector('.alc-pdf-page-input');
        const totalEl = viewer.querySelector('.alc-pdf-total');
        const zoomLabel = viewer.querySelector('.alc-pdf-zoom-label');

        let pdfDoc = null;
        let scale = 1.5;
        let currentPage = startPage || 1;
        const renderedPages = new Map();  // pageNum → canvas

        try {
            pdfDoc = await pdfjsLib.getDocument(fileUrl).promise;
            _activePdfDoc = pdfDoc;
        } catch (err) {
            console.error('[PDF.js] Failed to load:', err);
            loadingEl.textContent = _t('alc.pdfLoadFailed');
            return;
        }

        const numPages = pdfDoc.numPages;
        totalEl.textContent = numPages;
        pageInput.max = numPages;
        pageInput.value = currentPage;
        loadingEl.style.display = 'none';

        // Create placeholder divs for all pages (lazy rendering)
        for (let i = 1; i <= numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'alc-pdf-page';
            pageDiv.dataset.page = i;
            pagesContainer.appendChild(pageDiv);
        }

        /** Render a single page into its container div */
        async function renderPage(pageNum) {
            if (renderedPages.has(pageNum) || !pdfDoc) return;
            renderedPages.set(pageNum, true);  // mark as rendering

            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale });
                const pageDiv = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
                if (!pageDiv) return;

                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                pageDiv.style.minHeight = '';
                pageDiv.innerHTML = '';
                pageDiv.appendChild(canvas);

                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                renderedPages.set(pageNum, canvas);
            } catch (err) {
                console.error(`[PDF.js] Error rendering page ${pageNum}:`, err);
            }
        }

        /** Render visible pages + 1 page ahead/behind for smooth scrolling */
        function renderVisiblePages() {
            const scrollTop = scrollArea.scrollTop;
            const scrollBottom = scrollTop + scrollArea.clientHeight;
            const pageDivs = pagesContainer.querySelectorAll('.alc-pdf-page');

            pageDivs.forEach(div => {
                const top = div.offsetTop;
                const bottom = top + (div.offsetHeight || 200);
                const pageNum = parseInt(div.dataset.page);

                // Render if in viewport or ±1 page buffer
                if (bottom >= scrollTop - 500 && top <= scrollBottom + 500) {
                    renderPage(pageNum);
                }
            });

            // Update current page indicator based on scroll position
            const centerY = scrollTop + scrollArea.clientHeight / 2;
            for (const div of pageDivs) {
                const top = div.offsetTop;
                const bottom = top + (div.offsetHeight || 200);
                if (centerY >= top && centerY <= bottom) {
                    const p = parseInt(div.dataset.page);
                    if (p !== currentPage) {
                        currentPage = p;
                        pageInput.value = p;
                    }
                    break;
                }
            }
        }

        /** Scroll to a specific page (renders the page first, then scrolls) */
        async function goToPage(pageNum) {
            pageNum = Math.max(1, Math.min(numPages, pageNum));
            currentPage = pageNum;
            pageInput.value = pageNum;
            // Ensure the page is rendered before scrolling (so height is correct)
            await renderPage(pageNum);
            const target = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        /** Re-render all visible pages at current scale */
        async function rerender() {
            renderedPages.clear();
            pagesContainer.querySelectorAll('.alc-pdf-page').forEach(div => {
                div.innerHTML = '';
                div.style.minHeight = '200px';
            });
            zoomLabel.textContent = Math.round(scale / 1.5 * 100) + '%';
            // Render current page first, then visible pages
            await renderPage(currentPage);
            renderVisiblePages();
        }

        // Toolbar event delegation
        viewer.querySelector('.alc-pdf-toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'prev') goToPage(currentPage - 1);
            else if (action === 'next') goToPage(currentPage + 1);
            else if (action === 'zoomin') { scale = Math.min(4, scale + 0.3); rerender(); }
            else if (action === 'zoomout') { scale = Math.max(0.5, scale - 0.3); rerender(); }
        });

        // Page input
        pageInput.addEventListener('change', () => {
            const p = parseInt(pageInput.value);
            if (p >= 1 && p <= numPages) goToPage(p);
        });
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const p = parseInt(pageInput.value);
                if (p >= 1 && p <= numPages) goToPage(p);
            }
        });

        // Lazy render on scroll (debounced)
        let _scrollTimer = null;
        scrollArea.addEventListener('scroll', () => {
            if (_scrollTimer) clearTimeout(_scrollTimer);
            _scrollTimer = setTimeout(renderVisiblePages, 80);
        }, { passive: true });

        // Expose goToPage for external anchor navigation (e.g. applyAnchor in knowledge map)
        _pdfGoToPage = goToPage;

        // Initial render: first few pages + jump to start page
        for (let i = 1; i <= Math.min(3, numPages); i++) {
            await renderPage(i);
        }
        if (startPage > 1) {
            // Wait for page layout to settle, then scroll
            setTimeout(() => goToPage(startPage), 100);
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
        /** Navigate the active PDF.js viewer to a specific page (1-based). No-op if no PDF viewer is active. */
        pdfGoToPage(pageNum) { if (_pdfGoToPage) _pdfGoToPage(pageNum); },
    };
})();
