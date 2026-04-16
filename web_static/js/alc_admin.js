/**
 * AI Learning Center - Admin Panel Module
 * Category, content, node, edge, and learning path CRUD management
 */
(function() {
    'use strict';

    const $ = window.alc;
    const _t = $._t;

    // ==================== ADMIN PANEL ====================

    // Map admin tab names to HTML element IDs
    const ADMIN_TAB_MAP = {
        categories: 'adminTabCategories',
        upload: 'adminTabUpload',
        contents: 'adminTabContents',
        nodes: 'adminTabNodes',
        paths: 'adminTabPaths',
    };

    const ADMIN_API = '/api/admin/learning-center';

    function setupAdminPanel() {
        const adminToggleBtn = $.getElement('adminToggleBtn');
        if (adminToggleBtn && $.isAdmin) {
            adminToggleBtn.addEventListener('click', toggleAdminPanel);
        }

        // FAB button inside admin panel also toggles the slide panel
        const adminFabBtn = $.getElement('adminFabBtn');
        if (adminFabBtn && $.isAdmin) {
            adminFabBtn.addEventListener('click', () => {
                const slidePanel = $.getElement('adminSlidePanel');
                if (slidePanel) {
                    slidePanel.classList.toggle('active');
                }
            });
        }

        setupAdminTabs();
        setupAdminForms();
        loadSubjectOptions();
    }

    function toggleAdminPanel() {
        const panel = $.getElement('adminPanel');
        const slidePanel = $.getElement('adminSlidePanel');
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
            const panel = $.getElement(panelId);
            if (panel) {
                panel.style.display = 'none';
                panel.classList.remove('alc-admin-tab-content--active');
            }
        });

        // Show selected panel
        const panelId = ADMIN_TAB_MAP[tabName];
        const panel = panelId ? $.getElement(panelId) : null;
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
        const uploadInput = $.getElement('contentFileInput');
        const uploadDropZone = $.getElement('dragDropZone');

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
        const typeSelect = $.getElement('contentTypeSelect');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                const externalSection = $.getElement('externalVideoSection');
                const dropZone = $.getElement('dragDropZone');
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
        const createCategoryBtn = $.getElement('createCategoryBtn');
        if (createCategoryBtn) {
            createCategoryBtn.addEventListener('click', submitCategory);
        }

        // Upload content button
        const uploadContentBtn = $.getElement('uploadContentBtn');
        if (uploadContentBtn) {
            uploadContentBtn.addEventListener('click', submitUploadContent);
        }

        // Batch import listeners
        initBatchImportListeners();
        initPathImportListeners();

        // Create node button
        const createNodeBtn = $.getElement('createNodeBtn');
        if (createNodeBtn) {
            createNodeBtn.addEventListener('click', submitNode);
        }

        // Create edge button
        const createEdgeBtn = $.getElement('createEdgeBtn');
        if (createEdgeBtn) {
            createEdgeBtn.addEventListener('click', submitEdge);
        }

        // Create path button
        const createPathBtn = $.getElement('createPathBtn');
        if (createPathBtn) {
            createPathBtn.addEventListener('click', submitPath);
        }
    }

    // ==================== ADMIN: CONTENT MANAGEMENT ====================

    async function loadAdminContents() {
        const listEl = $.getElement('adminContentsList');
        if (!listEl) return;

        listEl.innerHTML = `<p style="padding:16px;color:var(--text-tertiary);">${_t('alc.loading')}</p>`;

        try {
            const response = await $.api(`${$.API_BASE}/contents?page=1&page_size=200`);
            if (response.success) {
                const contents = response.data?.items || response.data || [];
                if (contents.length === 0) {
                    listEl.innerHTML = `<p style="padding:16px;color:var(--text-tertiary);">${_t('alc.noContents')}</p>`;
                    return;
                }

                // Build category lookup for display
                const flatCats = flattenCategories($.state.categories);
                const catMap = {};
                flatCats.forEach(c => { catMap[c.id] = c.name; });

                listEl.innerHTML = contents.map(content => {
                    const typeIcon = $.getContentTypeIcon(content.content_type);
                    const catName = content.category_id && catMap[content.category_id]
                        ? catMap[content.category_id] : _t('alc.uncategorized');
                    return `<div class="alc-admin-list-item" data-content-id="${content.id}">
                        <div class="alc-admin-list-item-info">
                            <span style="margin-right:6px;">${typeIcon}</span>
                            <strong>${$.escapeHtml(content.title)}</strong>
                            <span style="margin-left:8px;font-size:12px;color:var(--text-tertiary);">[${catName}]</span>
                        </div>
                        <div class="alc-admin-list-item-actions">
                            <button class="alc-btn alc-btn--small alc-btn--secondary" onclick="window._alcEditContent(${content.id})">${_t('alc.edit')}</button>
                            <button class="alc-btn alc-btn--small alc-btn--danger" onclick="window._alcDeleteContent(${content.id}, '${$.escapeHtml(content.title).replace(/'/g, "\\'")}')">${_t('alc.delete')}</button>
                        </div>
                    </div>`;
                }).join('');
            }
        } catch (error) {
            console.error('Failed to load admin contents:', error);
            listEl.innerHTML = `<p style="padding:16px;color:red;">${_t('alc.loadFailedShort')}</p>`;
        }
    }

    // Expose content management functions globally for onclick handlers
    window._alcDeleteContent = async function(contentId, title) {
        if (!confirm(_t('alc.confirmDeleteContent', { title: title }))) return;

        try {
            const response = await $.api(`${ADMIN_API}/contents/${contentId}`, {
                method: 'DELETE'
            });
            if (response.success) {
                $.showToast(_t('alc.contentDeleted'), 'success');
                loadAdminContents();
                // Also refresh ebook sidebar
                $.loadMedia();
            } else {
                $.showToast(response.message || _t('alc.deleteFailed'), 'error');
            }
        } catch (error) {
            console.error('Failed to delete content:', error);
            $.showToast(_t('alc.deleteFailed'), 'error');
        }
    };

    window._alcEditContent = async function(contentId) {
        try {
            const response = await $.api(`${$.API_BASE}/contents/${contentId}`);
            if (!response.success) return;
            const content = response.data;

            // 构建分类选项
            const flatCats = flattenCategories($.state.categories);
            const catOptions = flatCats.map(c =>
                `<option value="${c.id}" ${(content.category_ids || []).includes(c.id) ? 'selected' : ''}>${$.escapeHtml(c.name)}</option>`
            ).join('');

            // 构建编辑弹窗
            const overlay = document.createElement('div');
            overlay.className = 'alc-modal-overlay active';
            overlay.style.zIndex = '3000';
            overlay.innerHTML = `
                <div class="alc-modal-content alc-confirm-dialog" style="max-width:480px;">
                    <h3>${_t('alc.editContent')}</h3>
                    <div class="alc-admin-form">
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">${_t('alc.titleLabel')}</label>
                        <input type="text" id="_editTitle" class="alc-form-input" value="${$.escapeHtml(content.title)}" />
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">${_t('alc.descLabel')}</label>
                        <textarea id="_editDesc" class="alc-form-input" rows="3">${$.escapeHtml(content.description || '')}</textarea>
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">${_t('alc.contentTypeLabel')}</label>
                        <select id="_editType" class="alc-form-input">
                            <option value="video_local" ${content.content_type === 'video_local' ? 'selected' : ''}>${_t('alc.typeVideoLocal')}</option>
                            <option value="video_external" ${content.content_type === 'video_external' ? 'selected' : ''}>${_t('alc.typeVideoExternal')}</option>
                            <option value="document" ${content.content_type === 'document' ? 'selected' : ''}>${_t('alc.typeDocument')}</option>
                            <option value="image" ${content.content_type === 'image' ? 'selected' : ''}>${_t('alc.typeImage')}</option>
                            <option value="article" ${content.content_type === 'article' ? 'selected' : ''}>${_t('alc.typeArticle')}</option>
                        </select>
                        <label style="font-size:13px;font-weight:600;color:var(--text-secondary);">${_t('alc.categoryLabel')}</label>
                        <select id="_editCategory" class="alc-form-input">
                            <option value="">${_t('alc.noCategoryOption')}</option>
                            ${catOptions}
                        </select>
                    </div>
                    <div class="alc-dialog-actions" style="margin-top:12px;">
                        <button id="_editCancel" class="alc-btn alc-btn--secondary">${_t('common.cancel')}</button>
                        <button id="_editSave" class="alc-btn alc-btn--primary">${_t('alc.save')}</button>
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
                    const updateResponse = await $.api(`${ADMIN_API}/contents/${contentId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(updateData)
                    });

                    if (updateResponse.success) {
                        $.showToast(_t('alc.contentUpdated'), 'success');
                        overlay.remove();
                        loadAdminContents();
                        $.loadedTabs.delete('media');
                        $.loadMedia();
                    } else {
                        $.showToast(updateResponse.message || _t('alc.updateFailed'), 'error');
                    }
                } catch (error) {
                    console.error('Failed to update content:', error);
                    $.showToast(_t('alc.updateFailed'), 'error');
                }
            });
        } catch (error) {
            console.error('Failed to edit content:', error);
            $.showToast(_t('alc.contentLoadFailed'), 'error');
        }
    };

    // ==================== ADMIN: CATEGORIES ====================

    async function loadAdminCategories() {
        try {
            const response = await $.api(`${$.API_BASE}/categories`);
            if (response.success) {
                $.state.categories = response.data || [];
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
            $.getElement('contentCategorySelect'),
            $.getElement('nodeCategorySelect'),
        ];

        const flatCategories = flattenCategories($.state.categories);

        selects.forEach(select => {
            if (!select) return;
            const currentVal = select.value;
            select.innerHTML = `<option value="">${_t('alc.selectCategoryPlaceholder')}</option>`;
            flatCategories.forEach(cat => {
                select.innerHTML += `<option value="${cat.id}">${$.escapeHtml(cat.name)}</option>`;
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
        const listEl = $.getElement('categoriesList');
        if (!listEl) return;

        const flatCats = flattenCategories($.state.categories);

        if (flatCats.length === 0) {
            listEl.innerHTML = `<p class="alc-empty">${_t('alc.noCategories')}</p>`;
            return;
        }

        listEl.innerHTML = flatCats.map(cat => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${$.escapeHtml(cat.icon || '📁')} ${$.escapeHtml(cat.name)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${$.escapeHtml(cat.description || '')}</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editCategory(${cat.id})">${_t('alc.edit')}</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deleteCategory(${cat.id})">${_t('alc.delete')}</button>
                </div>
            </div>
        `).join('');
    }

    async function submitCategory() {
        const nameInput = $.getElement('categoryNameInput');
        const iconInput = $.getElement('categoryIconInput');

        const name = nameInput ? nameInput.value.trim() : '';
        const icon = iconInput ? iconInput.value.trim() : '';

        if (!name) {
            $.showToast(_t('alc.enterCategoryName'), 'error');
            return;
        }

        try {
            const editingId = (nameInput && nameInput.getAttribute('data-editing-id'));
            let response;

            if (editingId) {
                response = await $.apiPut(`${ADMIN_API}/categories/${editingId}`, { name, icon });
            } else {
                response = await $.apiPost(`${ADMIN_API}/categories`, { name, icon });
            }

            if (response.success) {
                $.showToast(editingId ? _t('alc.categoryUpdateSuccess') : _t('alc.categoryCreateSuccess'), 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (iconInput) iconInput.value = '';
                await loadAdminCategories();
                await $.loadCategories();
            }
        } catch (error) {
            console.error('Category submit error:', error);
        }
    }

    async function editCategory(categoryId) {
        const flatCats = flattenCategories($.state.categories);
        const category = flatCats.find(c => c.id == categoryId);
        if (!category) return;

        const nameInput = $.getElement('categoryNameInput');
        const iconInput = $.getElement('categoryIconInput');

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
        if (!confirm(_t('alc.confirmDeleteCategory'))) return;

        try {
            const response = await $.apiDelete(`${ADMIN_API}/categories/${categoryId}`);
            if (response.success) {
                $.showToast(_t('alc.categoryDeleteSuccess'), 'success');
                await loadAdminCategories();
                await $.loadCategories();
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
        const titleInput = $.getElement('contentTitleInput');
        const typeSelect = $.getElement('contentTypeSelect');
        const descInput = $.getElement('contentDescInput');
        const categorySelect = $.getElement('contentCategorySelect');
        const subjectSelect = $.getElement('contentSubjectSelect');
        const gradeSelect = $.getElement('contentGradeSelect');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('title', (titleInput && titleInput.value.trim()) || file.name);
        formData.append('description', (descInput && descInput.value.trim()) || '');
        formData.append('tags', '');
        if (categorySelect && categorySelect.value) {
            formData.append('category_ids', categorySelect.value);
        }
        if (subjectSelect && subjectSelect.value) {
            formData.append('subject_code', subjectSelect.value);
        }
        if (gradeSelect && gradeSelect.value) {
            formData.append('grade_level', gradeSelect.value);
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
            const response = await $.apiUpload(`${ADMIN_API}/upload`, formData);
            if (response.success) {
                $.showToast(`${file.name} ${_t('alc.uploadSuccess')}`, 'success');
                if (titleInput) titleInput.value = '';
                if (descInput) descInput.value = '';
                // Refresh content lists
                $.loadedTabs.delete('media');
                $.loadedTabs.delete('resources');
                if ($.currentTab === 'media') await $.loadMedia(1);
                if ($.currentTab === 'resources') await $.loadResources();

                // 对文档/文章类型启动 AI 分析轮询
                if (contentType === 'document' || contentType === 'article') {
                    const contentId = response.data && response.data.id;
                    if (contentId) {
                        $.showToast('AI 正在分析文档，自动生成知识图谱和学习路径...', 'info');
                        _pollAnalysisStatus(contentId);
                    }
                }
            }
        } catch (error) {
            console.error('Upload error:', error);
            $.showToast(`${file.name} ${_t('alc.uploadFailed')}`, 'error');
        }
    }

    /**
     * 轮询 AI 分析状态，完成/失败后自动停止。
     * @param {number} contentId - 内容 ID
     */
    function _pollAnalysisStatus(contentId) {
        let elapsed = 0;
        const INTERVAL = 5000;   // 5 秒
        const TIMEOUT = 300000;  // 5 分钟超时

        const timer = setInterval(async () => {
            elapsed += INTERVAL;
            if (elapsed > TIMEOUT) {
                clearInterval(timer);
                $.showToast('AI 分析超时，请稍后在管理面板查看状态', 'warning');
                return;
            }

            try {
                const resp = await $.api(`${ADMIN_API}/contents/${contentId}/analysis-status`);
                if (!resp.success) return;

                const status = resp.data.ai_analysis_status;
                if (status === 'completed') {
                    clearInterval(timer);
                    $.showToast('AI 分析完成！已自动生成知识图谱和学习路径', 'success');
                    // 标记需要重新加载，并主动刷新当前可见的 tab
                    $.loadedTabs.delete('knowledgeMap');
                    $.loadedTabs.delete('paths');
                    // 如果知识地图模块已加载，主动刷新
                    if ($.modules.knowledgeMap && $.modules.knowledgeMap.loadKnowledgeMap) {
                        $.modules.knowledgeMap.loadKnowledgeMap();
                    }
                    // 如果学习路径模块已加载，主动刷新
                    if ($.modules.paths && $.modules.paths.loadPaths) {
                        $.modules.paths.loadPaths();
                    }
                } else if (status === 'failed') {
                    clearInterval(timer);
                    const errMsg = resp.data.ai_analysis_error || '未知错误';
                    $.showToast(`AI 分析失败: ${errMsg}`, 'error');
                }
                // pending / processing → 继续轮询
            } catch (e) {
                // 网络错误不中断轮询
                console.warn('Poll analysis status error:', e);
            }
        }, INTERVAL);
    }

    async function submitUploadContent() {
        const titleInput = $.getElement('contentTitleInput');
        const typeSelect = $.getElement('contentTypeSelect');
        const descInput = $.getElement('contentDescInput');
        const categorySelect = $.getElement('contentCategorySelect');
        const subjectSelect = $.getElement('contentSubjectSelect');
        const gradeSelect = $.getElement('contentGradeSelect');

        const title = titleInput ? titleInput.value.trim() : '';
        const contentType = typeSelect ? typeSelect.value : '';
        const description = descInput ? descInput.value.trim() : '';
        const categoryId = categorySelect ? categorySelect.value : '';
        const subjectCode = subjectSelect ? subjectSelect.value : '';
        const gradeLevel = gradeSelect ? gradeSelect.value : '';

        if (!title) {
            $.showToast(_t('alc.enterTitle'), 'error');
            return;
        }
        if (!contentType) {
            $.showToast(_t('alc.selectContentTypeError'), 'error');
            return;
        }

        // 外部視頻連結：走 /upload 端點 (FormData)
        if (contentType === 'video_external') {
            const urlInput = $.getElement('externalVideoUrlInput');
            const platformSelect = $.getElement('videoPlatformSelect');
            const externalUrl = urlInput ? urlInput.value.trim() : '';
            const videoPlatform = platformSelect ? platformSelect.value : '';

            if (!externalUrl) {
                $.showToast(_t('alc.enterVideoUrl'), 'error');
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
                if (subjectCode) formData.append('subject_code', subjectCode);
                if (gradeLevel) formData.append('grade_level', gradeLevel);

                const response = await $.apiUpload(`${ADMIN_API}/upload`, formData);
                if (response.success) {
                    $.showToast(_t('alc.videoLinkUploadSuccess'), 'success');
                    if (titleInput) titleInput.value = '';
                    if (descInput) descInput.value = '';
                    if (urlInput) urlInput.value = '';
                    $.loadedTabs.delete('media');
                    $.loadedTabs.delete('resources');
                    if ($.currentTab === 'media') await $.loadMedia(1);
                }
            } catch (error) {
                console.error('Video link submit error:', error);
                $.showToast(_t('alc.videoLinkUploadFailed'), 'error');
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
            if (subjectCode) body.subject_code = subjectCode;
            if (gradeLevel) body.grade_level = gradeLevel;

            const response = await $.apiPost(`${ADMIN_API}/contents`, body);
            if (response.success) {
                $.showToast(_t('alc.contentCreateSuccess'), 'success');
                if (titleInput) titleInput.value = '';
                if (descInput) descInput.value = '';
                $.loadedTabs.delete('media');
                $.loadedTabs.delete('resources');
                if ($.currentTab === 'media') await $.loadMedia(1);
            }
        } catch (error) {
            console.error('Content submit error:', error);
        }
    }

    // ==================== ADMIN: KNOWLEDGE NODES ====================

    async function loadAdminNodes() {
        try {
            const response = await $.api(`${$.API_BASE}/knowledge-map`);
            if (response.success) {
                $.state.nodes = response.data.nodes || [];
                $.state.edges = response.data.edges || [];
                renderAdminNodes();
                populateNodeDropdowns();
            }
        } catch (error) {
            console.error('Failed to load nodes:', error);
        }
    }

    function populateNodeDropdowns() {
        const sourceSelect = $.getElement('edgeSourceNodeSelect');
        const targetSelect = $.getElement('edgeTargetNodeSelect');

        [sourceSelect, targetSelect].forEach(select => {
            if (!select) return;
            const val = select.value;
            select.innerHTML = `<option value="">${_t('alc.selectNodePlaceholder')}</option>`;
            $.state.nodes.forEach(node => {
                select.innerHTML += `<option value="${node.id}">${$.escapeHtml(node.title)}</option>`;
            });
            select.value = val;
        });
    }

    function renderAdminNodes() {
        const listEl = $.getElement('nodesList');
        if (!listEl) return;

        if ($.state.nodes.length === 0) {
            listEl.innerHTML = `<p class="alc-empty">${_t('alc.noNodes')}</p>`;
            return;
        }

        listEl.innerHTML = $.state.nodes.map(node => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${$.escapeHtml(node.icon || '📌')} ${$.escapeHtml(node.title)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${$.escapeHtml(node.description || '')}</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editNode(${node.id})">${_t('alc.edit')}</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deleteNode(${node.id})">${_t('alc.delete')}</button>
                </div>
            </div>
        `).join('');
    }

    async function submitNode() {
        const nameInput = $.getElement('nodeNameInput');
        const descInput = $.getElement('nodeDescInput');
        const categorySelect = $.getElement('nodeCategorySelect');
        const subjectSelect = $.getElement('nodeSubjectSelect');
        const gradeSelect = $.getElement('nodeGradeSelect');

        const title = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const categoryId = categorySelect ? categorySelect.value : '';
        const subjectCode = subjectSelect ? subjectSelect.value : '';
        const gradeLevel = gradeSelect ? gradeSelect.value : '';

        if (!title) {
            $.showToast(_t('alc.enterNodeName'), 'error');
            return;
        }

        try {
            const editingId = nameInput && nameInput.getAttribute('data-editing-id');
            const body = { title, description };
            if (categoryId) body.category_id = parseInt(categoryId);
            if (subjectCode) body.subject_code = subjectCode;
            if (gradeLevel) body.grade_level = gradeLevel;

            let response;
            if (editingId) {
                response = await $.apiPut(`${ADMIN_API}/knowledge-nodes/${editingId}`, body);
            } else {
                response = await $.apiPost(`${ADMIN_API}/knowledge-nodes`, body);
            }

            if (response.success) {
                $.showToast(editingId ? _t('alc.nodeUpdateSuccess') : _t('alc.nodeCreateSuccess'), 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (descInput) descInput.value = '';
                await loadAdminNodes();
                $.loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Node submit error:', error);
        }
    }

    async function submitEdge() {
        const sourceSelect = $.getElement('edgeSourceNodeSelect');
        const targetSelect = $.getElement('edgeTargetNodeSelect');
        const typeInput = $.getElement('edgeTypeInput');

        const sourceId = sourceSelect ? sourceSelect.value : '';
        const targetId = targetSelect ? targetSelect.value : '';
        const relationType = typeInput ? typeInput.value.trim() : 'related';

        if (!sourceId || !targetId) {
            $.showToast(_t('alc.selectSourceAndTarget'), 'error');
            return;
        }

        try {
            const edgeBody = {
                source_node_id: parseInt(sourceId),
                target_node_id: parseInt(targetId),
                relation_type: relationType || 'related',
                label: relationType || '',
            };
            // Inherit subject_code from source node if available
            const sourceNode = $.state.nodes.find(n => n.id == sourceId);
            if (sourceNode && sourceNode.subject_code) {
                edgeBody.subject_code = sourceNode.subject_code;
            }
            const response = await $.apiPost(`${ADMIN_API}/knowledge-edges`, edgeBody);

            if (response.success) {
                $.showToast(_t('alc.edgeCreateSuccess'), 'success');
                if (typeInput) typeInput.value = '';
                await loadAdminNodes();
                $.loadedTabs.delete('map');
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
        const modal = $.getElement('batchImportModal');
        if (!modal) return;

        // 重置表單
        const jsonInput = $.getElement('batchImportJsonInput');
        const fileInput = $.getElement('batchImportFileInput');
        const fileNameEl = $.getElement('batchImportFileName');
        const clearCheckbox = $.getElement('batchImportClearExisting');
        const resultEl = $.getElement('batchImportResult');
        const submitBtn = $.getElement('batchImportSubmitBtn');

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
        const modal = $.getElement('batchImportModal');
        if (modal) modal.classList.remove('active');
    }

    /**
     * 讀取用戶選擇的 JSON 文件並填入文本區域。
     * @param {File} file - 上傳的 JSON 文件
     */
    function readBatchImportFile(file) {
        if (!file) return;

        if (!file.name.endsWith('.json')) {
            $.showToast(_t('alc.selectJsonFile'), 'error');
            return;
        }

        const fileNameEl = $.getElement('batchImportFileName');
        if (fileNameEl) {
            fileNameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            fileNameEl.style.display = 'block';
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const jsonInput = $.getElement('batchImportJsonInput');
            if (jsonInput) jsonInput.value = e.target.result;
        };
        reader.onerror = function () {
            $.showToast(_t('alc.fileReadFailed'), 'error');
        };
        reader.readAsText(file);
    }

    /**
     * 初始化批量導入相關的事件監聽器。
     * 包括：開關模態框、文件拖放、文件選擇、提交。
     */
    function initBatchImportListeners() {
        // 開啟按鈕
        const openBtn = $.getElement('openBatchImportBtn');
        if (openBtn) openBtn.addEventListener('click', openBatchImportModal);

        // 關閉按鈕 & 取消按鈕
        const closeBtn = $.getElement('batchImportCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closeBatchImportModal);

        const cancelBtn = $.getElement('batchImportCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closeBatchImportModal);

        // 點擊遮罩關閉
        const modal = $.getElement('batchImportModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closeBatchImportModal();
            });
        }

        // 文件選擇
        const dropZone = $.getElement('batchImportDropZone');
        const fileInput = $.getElement('batchImportFileInput');

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
        const submitBtn = $.getElement('batchImportSubmitBtn');
        if (submitBtn) submitBtn.addEventListener('click', submitBatchImport);
    }

    /**
     * 驗證並提交批量導入請求。
     *
     * 流程：解析 JSON → 確認 clear_existing → 調用 API → 顯示結果 → 刷新列表。
     */
    async function submitBatchImport() {
        const jsonInput = $.getElement('batchImportJsonInput');
        const clearCheckbox = $.getElement('batchImportClearExisting');
        const resultEl = $.getElement('batchImportResult');
        const submitBtn = $.getElement('batchImportSubmitBtn');

        const rawJson = jsonInput ? jsonInput.value.trim() : '';
        if (!rawJson) {
            $.showToast(_t('alc.enterOrUploadJson'), 'error');
            return;
        }

        // 1. 解析 JSON
        let payload;
        try {
            payload = JSON.parse(rawJson);
        } catch (e) {
            $.showToast(_t('alc.invalidJson'), 'error');
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `${_t('alc.jsonParseFailed')}：${e.message}`;
                resultEl.style.display = 'block';
            }
            return;
        }

        // 2. 基本結構校驗
        if (!payload.nodes || !Array.isArray(payload.nodes) || payload.nodes.length === 0) {
            $.showToast(_t('alc.requireNodesArray'), 'error');
            return;
        }

        // 3. 確認清空操作（如果勾選）
        const clearExisting = clearCheckbox ? clearCheckbox.checked : false;
        if (clearExisting) {
            if (!confirm(_t('alc.confirmClearNodes'))) {
                return;
            }
        }

        // 4. 組裝請求並提交
        payload.clear_existing = clearExisting;
        if (!payload.edges) payload.edges = [];

        // 附加科目/年級
        const batchSubjectSelect = $.getElement('batchImportSubjectSelect');
        const batchGradeSelect = $.getElement('batchImportGradeSelect');
        const batchSubjectCode = batchSubjectSelect ? batchSubjectSelect.value : '';
        const batchGradeLevel = batchGradeSelect ? batchGradeSelect.value : '';
        if (batchSubjectCode) payload.subject_code = batchSubjectCode;
        if (batchGradeLevel) payload.grade_level = batchGradeLevel;

        if (submitBtn) submitBtn.disabled = true;
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

        try {
            const response = await $.apiPost(
                `${ADMIN_API}/knowledge-graph/batch-import`,
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

                let html = `<strong>✅ ${_t('alc.importComplete')}</strong><br>`;
                html += _t('alc.importCreatedNodesEdges', { nodes: nodeCount, edges: edgeCount });
                if (skipped > 0) html += `（${_t('alc.skippedEdges', { count: skipped })}）`;
                if (hasErrors) {
                    html += `<br><br><strong>⚠️ ${_t('alc.partialWarnings')}：</strong><br>`;
                    html += errors.map(e => `• ${e}`).join('<br>');
                }

                if (resultEl) {
                    resultEl.className = `alc-batch-import-result ${resultClass}`;
                    resultEl.innerHTML = html;
                    resultEl.style.display = 'block';
                }

                $.showToast(_t('alc.importSuccess', { count: nodeCount }), 'success');

                // 6. 刷新相關數據
                await loadAdminNodes();
                $.loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Batch import error:', error);
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `${_t('alc.importFailed')}：${error.message || _t('alc.unknownError')}`;
                resultEl.style.display = 'block';
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // ==================== ADMIN: BATCH IMPORT LEARNING PATHS ====================

    /**
     * 打開學習路徑批量導入模態框，重置表單狀態。
     */
    function openPathImportModal() {
        const modal = $.getElement('pathImportModal');
        if (!modal) return;

        const jsonInput = $.getElement('pathImportJsonInput');
        const fileInput = $.getElement('pathImportFileInput');
        const fileNameEl = $.getElement('pathImportFileName');
        const clearCheckbox = $.getElement('pathImportClearExisting');
        const resultEl = $.getElement('pathImportResult');
        const submitBtn = $.getElement('pathImportSubmitBtn');

        if (jsonInput) jsonInput.value = '';
        if (fileInput) fileInput.value = '';
        if (fileNameEl) { fileNameEl.textContent = ''; fileNameEl.style.display = 'none'; }
        if (clearCheckbox) clearCheckbox.checked = false;
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
        if (submitBtn) submitBtn.disabled = false;

        modal.classList.add('active');
    }

    function closePathImportModal() {
        const modal = $.getElement('pathImportModal');
        if (modal) modal.classList.remove('active');
    }

    /**
     * 讀取用戶上傳的學習路徑 JSON 文件並填入文本區域。
     */
    function readPathImportFile(file) {
        if (!file) return;
        if (!file.name.endsWith('.json')) {
            $.showToast(_t('alc.selectJsonFile'), 'error');
            return;
        }

        const fileNameEl = $.getElement('pathImportFileName');
        if (fileNameEl) {
            fileNameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
            fileNameEl.style.display = 'block';
        }

        const reader = new FileReader();
        reader.onload = function (e) {
            const jsonInput = $.getElement('pathImportJsonInput');
            if (jsonInput) jsonInput.value = e.target.result;
        };
        reader.onerror = function () {
            $.showToast(_t('alc.fileReadFailed'), 'error');
        };
        reader.readAsText(file);
    }

    /**
     * 初始化學習路徑批量導入的事件監聯器。
     */
    function initPathImportListeners() {
        const openBtn = $.getElement('importPathsBtn');
        if (openBtn) openBtn.addEventListener('click', openPathImportModal);

        const closeBtn = $.getElement('pathImportCloseBtn');
        if (closeBtn) closeBtn.addEventListener('click', closePathImportModal);

        const cancelBtn = $.getElement('pathImportCancelBtn');
        if (cancelBtn) cancelBtn.addEventListener('click', closePathImportModal);

        const modal = $.getElement('pathImportModal');
        if (modal) {
            modal.addEventListener('click', function (e) {
                if (e.target === modal) closePathImportModal();
            });
        }

        const dropZone = $.getElement('pathImportDropZone');
        const fileInput = $.getElement('pathImportFileInput');

        if (dropZone && fileInput) {
            dropZone.addEventListener('click', () => fileInput.click());

            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) readPathImportFile(this.files[0]);
            });

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
                    readPathImportFile(e.dataTransfer.files[0]);
                }
            });
        }

        const submitBtn = $.getElement('pathImportSubmitBtn');
        if (submitBtn) submitBtn.addEventListener('click', submitPathImport);
    }

    /**
     * 驗證並提交學習路徑批量導入請求。
     * 解析 JSON → 確認 clear → 調用 /paths/batch-import API → 顯示結果 → 刷新列表。
     */
    async function submitPathImport() {
        const jsonInput = $.getElement('pathImportJsonInput');
        const clearCheckbox = $.getElement('pathImportClearExisting');
        const resultEl = $.getElement('pathImportResult');
        const submitBtn = $.getElement('pathImportSubmitBtn');

        const rawJson = jsonInput ? jsonInput.value.trim() : '';
        if (!rawJson) {
            $.showToast(_t('alc.enterOrUploadJson'), 'error');
            return;
        }

        // 1. 解析 JSON
        let payload;
        try {
            payload = JSON.parse(rawJson);
        } catch (e) {
            $.showToast(_t('alc.invalidJson'), 'error');
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `${_t('alc.jsonParseFailed')}：${e.message}`;
                resultEl.style.display = 'block';
            }
            return;
        }

        // 2. 結構校驗
        if (!payload.paths || !Array.isArray(payload.paths) || payload.paths.length === 0) {
            $.showToast(_t('alc.requirePathsArray'), 'error');
            return;
        }

        // 3. 確認清空操作
        const clearExisting = clearCheckbox ? clearCheckbox.checked : false;
        if (clearExisting) {
            if (!confirm(_t('alc.confirmClearPaths'))) {
                return;
            }
        }

        // 4. 組裝請求
        const pathSubjectSelect = $.getElement('pathImportSubjectSelect');
        const pathGradeSelect = $.getElement('pathImportGradeSelect');
        const pathSubjectCode = pathSubjectSelect ? pathSubjectSelect.value : '';
        const pathGradeLevel = pathGradeSelect ? pathGradeSelect.value : '';

        const requestBody = {
            paths: payload.paths,
            clear_existing: clearExisting
        };
        if (pathSubjectCode) requestBody.subject_code = pathSubjectCode;
        if (pathGradeLevel) requestBody.grade_level = pathGradeLevel;

        if (submitBtn) submitBtn.disabled = true;
        if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

        try {
            const response = await $.apiPost(
                `${ADMIN_API}/paths/batch-import`,
                requestBody
            );

            if (response.success) {
                const data = response.data || {};
                const created = data.created_paths || 0;
                const totalSteps = data.created_steps || 0;
                const errors = data.errors || [];

                const hasErrors = errors.length > 0;
                const resultClass = hasErrors
                    ? 'alc-batch-import-result--partial'
                    : 'alc-batch-import-result--success';

                let html = `<strong>✅ ${_t('alc.importComplete')}</strong><br>`;
                html += _t('alc.importCreatedPaths', { paths: created, steps: totalSteps });
                if (hasErrors) {
                    html += `<br><br><strong>⚠️ ${_t('alc.partialWarnings')}：</strong><br>`;
                    html += errors.map(e => `• ${e}`).join('<br>');
                }

                if (resultEl) {
                    resultEl.className = `alc-batch-import-result ${resultClass}`;
                    resultEl.innerHTML = html;
                    resultEl.style.display = 'block';
                }

                $.showToast(_t('alc.importPathsSuccess', { count: created }), 'success');

                // 刷新路徑列表
                await loadAdminPaths();
                $.loadedTabs.delete('paths');
            }
        } catch (error) {
            console.error('Path import error:', error);
            if (resultEl) {
                resultEl.className = 'alc-batch-import-result alc-batch-import-result--error';
                resultEl.textContent = `${_t('alc.importFailed')}：${error.message || _t('alc.unknownError')}`;
                resultEl.style.display = 'block';
            }
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    async function editNode(nodeId) {
        const node = $.state.nodes.find(n => n.id == nodeId);
        if (!node) return;

        const nameInput = $.getElement('nodeNameInput');
        const descInput = $.getElement('nodeDescInput');

        if (nameInput) {
            nameInput.value = node.title;
            nameInput.setAttribute('data-editing-id', nodeId);
            nameInput.focus();
        }
        if (descInput) descInput.value = node.description || '';

        switchAdminTab('nodes');
    }

    async function deleteNode(nodeId) {
        if (!confirm(_t('alc.confirmDeleteNode'))) return;
        try {
            const response = await $.apiDelete(`${ADMIN_API}/knowledge-nodes/${nodeId}`);
            if (response.success) {
                $.showToast(_t('alc.nodeDeleteSuccess'), 'success');
                await loadAdminNodes();
                $.loadedTabs.delete('map');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    function getNode(nodeId) {
        return $.state.nodes.find(n => n.id == nodeId);
    }

    // ==================== ADMIN: LEARNING PATHS ====================

    async function loadAdminPaths() {
        try {
            const response = await $.api(`${$.API_BASE}/paths`);
            if (response.success) {
                $.state.paths = response.data || [];
                renderAdminPaths();
            }
        } catch (error) {
            console.error('Failed to load paths:', error);
        }
    }

    function renderAdminPaths() {
        const listEl = $.getElement('pathsList');
        if (!listEl) return;

        if ($.state.paths.length === 0) {
            listEl.innerHTML = `<p class="alc-empty">${_t('alc.noPaths')}</p>`;
            return;
        }

        listEl.innerHTML = $.state.paths.map(path => `
            <div class="alc-admin-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px;margin-bottom:8px;background:var(--bg-card,#fff);border-radius:10px;">
                <div>
                    <strong>${$.escapeHtml(path.icon || '🎯')} ${$.escapeHtml(path.title)}</strong>
                    <span style="color:#888;font-size:0.85em;margin-left:8px;">${$.escapeHtml(path.difficulty || '')} · ${path.estimated_hours || 0}h</span>
                </div>
                <div>
                    <button class="alc-btn alc-btn--secondary" style="font-size:0.8em;padding:4px 10px;" onclick="window.lcLearningCenter.editPath(${path.id})">${_t('alc.edit')}</button>
                    <button class="alc-btn" style="font-size:0.8em;padding:4px 10px;background:#ff3b30;color:#fff;" onclick="window.lcLearningCenter.deletePath(${path.id})">${_t('alc.delete')}</button>
                </div>
            </div>
        `).join('');
    }

    async function submitPath() {
        const nameInput = $.getElement('pathNameInput');
        const descInput = $.getElement('pathDescInput');
        const diffSelect = $.getElement('pathDifficultySelect');
        const durationInput = $.getElement('pathDurationInput');
        const subjectSelect = $.getElement('pathSubjectSelect');
        const gradeSelect = $.getElement('pathGradeSelect');

        const title = nameInput ? nameInput.value.trim() : '';
        const description = descInput ? descInput.value.trim() : '';
        const difficulty = diffSelect ? diffSelect.value : 'beginner';
        const estimatedHours = durationInput ? parseFloat(durationInput.value) || 0 : 0;
        const subjectCode = subjectSelect ? subjectSelect.value : '';
        const gradeLevel = gradeSelect ? gradeSelect.value : '';

        if (!title) {
            $.showToast(_t('alc.enterPathName'), 'error');
            return;
        }

        try {
            const editingId = nameInput && nameInput.getAttribute('data-editing-id');
            const body = { title, description, difficulty, estimated_hours: estimatedHours };
            if (subjectCode) body.subject_code = subjectCode;
            if (gradeLevel) body.grade_level = gradeLevel;

            let response;
            if (editingId) {
                response = await $.apiPut(`${ADMIN_API}/paths/${editingId}`, body);
            } else {
                response = await $.apiPost(`${ADMIN_API}/paths`, body);
            }

            if (response.success) {
                $.showToast(editingId ? _t('alc.pathUpdateSuccess') : _t('alc.pathCreateSuccess'), 'success');
                if (nameInput) { nameInput.value = ''; nameInput.removeAttribute('data-editing-id'); }
                if (descInput) descInput.value = '';
                if (durationInput) durationInput.value = '';
                await loadAdminPaths();
                $.loadedTabs.delete('paths');
            }
        } catch (error) {
            console.error('Path submit error:', error);
        }
    }

    async function editPath(pathId) {
        const path = $.state.paths.find(p => p.id == pathId);
        if (!path) return;

        const nameInput = $.getElement('pathNameInput');
        const descInput = $.getElement('pathDescInput');
        const diffSelect = $.getElement('pathDifficultySelect');
        const durationInput = $.getElement('pathDurationInput');

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
        if (!confirm(_t('alc.confirmDeletePath'))) return;

        try {
            const response = await $.apiDelete(`${ADMIN_API}/paths/${pathId}`);
            if (response.success) {
                $.showToast(_t('alc.pathDeleteSuccess'), 'success');
                await loadAdminPaths();
                $.loadedTabs.delete('paths');
            }
        } catch (error) {
            console.error('Delete error:', error);
        }
    }

    // ==================== ADMIN: LOAD SUBJECT OPTIONS ====================

    /**
     * 從 /api/subjects 載入科目列表，填充所有科目下拉選單。
     */
    async function loadSubjectOptions() {
        try {
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const resp = await fetch('/api/subjects', {
                headers: token ? { 'Authorization': `Bearer ${token}` } : {}
            });
            const data = await resp.json();

            // /api/subjects returns { subjects: { code: { code, name, icon }, ... } }
            const subjectsMap = data.subjects || {};
            const subjects = Object.values(subjectsMap);

            // All subject selects that need to be populated
            const selectIds = [
                'contentSubjectSelect',
                'nodeSubjectSelect',
                'pathSubjectSelect',
                'batchImportSubjectSelect',
                'pathImportSubjectSelect',
            ];

            selectIds.forEach(id => {
                const select = $.getElement(id);
                if (!select) return;
                // Keep the first "placeholder" option
                const placeholder = select.options[0];
                select.innerHTML = '';
                select.appendChild(placeholder);
                // <option> 只能純文字；subject 圖示在其他地方統一呈現
                subjects.forEach(subj => {
                    const opt = document.createElement('option');
                    opt.value = subj.code;
                    opt.textContent = subj.name;
                    select.appendChild(opt);
                });
            });
        } catch (error) {
            console.error('Failed to load subject options:', error);
        }
    }

    // Register module functions
    $.modules.admin = {
        setupAdminPanel,
        toggleAdminPanel,
        loadAdminContents,
        editCategory,
        deleteCategory,
        editNode,
        deleteNode,
        getNode,
        openBatchImportModal,
        closeBatchImportModal,
        openPathImportModal,
        closePathImportModal,
        editPath,
        deletePath,
        loadSubjectOptions,
    };
})();
