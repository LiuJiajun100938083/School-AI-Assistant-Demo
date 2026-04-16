/**
 * 課案編輯器 — JavaScript
 * State-driven: single source of truth in `editorState`
 *
 * 架構：Slide Type Handler Registry
 * - 每種幻燈片類型（ppt/game/quiz/poll/link）的預覽/配置/儲存邏輯
 *   封裝在獨立 handler 物件中，通過 SLIDE_TYPE_HANDLERS registry 查找
 * - 新增類型只需 registerSlideType() + 實作 handler 介面
 * - 核心渲染函數（renderPreview/renderConfig/saveCurrentSlide）零分支
 */

(function () {
    'use strict';

    // ===== Auth =====
    const token = localStorage.getItem('auth_token');
    if (!token) {
        window.location.href = '/';
        return;
    }

    const planId = window.location.pathname.split('/').pop();
    if (!planId) {
        window.location.href = '/classroom';
        return;
    }

    // ===== Slide Type Handler Registry =====
    // 每個 handler 實作：
    //   label: string                           — 顯示名稱
    //   renderPreview(slide, $container): void   — 渲染預覽面板
    //   renderConfig(slide, $container): void    — 渲染配置面板（含事件綁定）
    //   collectConfig(slide): object|null        — 從 DOM 收集 config（null=不更新）
    //   getDefaultConfig(): object               — 新建時的默認 config
    //   getDefaultTitle(): string                — 新建時的默認標題

    const SLIDE_TYPE_HANDLERS = {};

    function registerSlideType(type, handler) {
        SLIDE_TYPE_HANDLERS[type] = handler;
    }

    // 暴露给外部编辑器模块 (如 interactive_editor.js)
    window._lessonEditorRegisterSlideType = registerSlideType;
    window._lessonEditorEscapeHtml = escapeHtml;

    function typeLabel(t) {
        return SLIDE_TYPE_HANDLERS[t]?.label || t;
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ===== State =====
    const editorState = {
        plan: null,
        slides: [],
        selectedSlideId: null,
        dirty: false,
        saving: false,
    };

    // ===== DOM refs =====
    const $planTitle = document.getElementById('planTitle');
    const $planStatus = document.getElementById('planStatus');
    const $saveStatus = document.getElementById('saveStatus');
    const $slideList = document.getElementById('slideList');
    const $slideCount = document.getElementById('slideCount');
    const $previewEmpty = document.getElementById('previewEmpty');
    const $previewContent = document.getElementById('previewContent');
    const $configForm = document.getElementById('configForm');
    const $configEmpty = document.getElementById('configEmpty');
    const $slideTypeBadge = document.getElementById('slideTypeBadge');
    const $slideTitle = document.getElementById('slideTitle');
    const $slideDuration = document.getElementById('slideDuration');
    const $typeConfigArea = document.getElementById('typeConfigArea');
    const $addSlideModal = document.getElementById('addSlideModal');

    // ===== API helpers =====
    async function api(method, path, body) {
        const opts = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
        };
        if (body !== undefined) opts.body = JSON.stringify(body);
        const res = await fetch(path, opts);
        if (res.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = '/?expired=1';
            throw new Error('登入已過期，請重新登入');
        }
        const json = await res.json();
        if (!json.success) throw new Error(json.message || json.error_code || 'API Error');
        return json.data;
    }

    // ===== Insert Position Helpers =====
    function getInsertAt() {
        if (!editorState.selectedSlideId) return null;
        const idx = editorState.slides.findIndex(
            s => s.slide_id === editorState.selectedSlideId
        );
        return idx >= 0 ? idx + 1 : null;
    }

    function insertSlideIntoState(newSlide, insertAt) {
        if (insertAt != null && insertAt <= editorState.slides.length) {
            editorState.slides.splice(insertAt, 0, newSlide);
        } else {
            editorState.slides.push(newSlide);
        }
    }

    function insertSlidesIntoState(newSlides, insertAt) {
        if (insertAt != null && insertAt <= editorState.slides.length) {
            editorState.slides.splice(insertAt, 0, ...newSlides);
        } else {
            editorState.slides.push(...newSlides);
        }
    }

    // ===== Unified slide creation =====
    async function createSlideOfType(type, configOverride) {
        const handler = SLIDE_TYPE_HANDLERS[type];
        if (!handler) return;
        const insertAt = getInsertAt();
        try {
            const newSlide = await api('POST', `/api/classroom/lesson-plans/${planId}/slides`, {
                slide_type: type,
                title: handler.getDefaultTitle(),
                config: configOverride || handler.getDefaultConfig(),
                insert_at: insertAt,
            });
            insertSlideIntoState(newSlide, insertAt);
            closeAddModal();
            renderTimeline();
            selectSlide(newSlide.slide_id);
        } catch (e) {
            alert('新增失敗: ' + e.message);
        }
    }

    // ===== Load plan =====
    async function loadPlan() {
        try {
            const data = await api('GET', `/api/classroom/lesson-plans/${planId}`);
            editorState.plan = data;
            editorState.slides = data.slides || [];
            $planTitle.value = data.title || '';
            $planStatus.value = data.status || 'draft';
            renderTimeline();
            if (editorState.slides.length > 0) {
                selectSlide(editorState.slides[0].slide_id);
            }
        } catch (e) {
            console.error('Load plan failed:', e);
            alert('無法載入課案: ' + e.message);
        }
    }

    // ===== Render timeline =====
    let dragSrcId = null;

    function renderTimeline() {
        const slides = editorState.slides;
        $slideCount.textContent = slides.length;
        $slideList.innerHTML = '';

        slides.forEach((s, i) => {
            const el = document.createElement('div');
            el.className = 'slide-thumb' + (s.slide_id === editorState.selectedSlideId ? ' active' : '');
            el.dataset.slideId = s.slide_id;
            el.draggable = true;
            el.innerHTML = `
                <span class="slide-thumb-order">${i + 1}</span>
                <div class="slide-thumb-info">
                    <div class="slide-thumb-type">${typeLabel(s.slide_type)}</div>
                    <div class="slide-thumb-title">${escapeHtml(s.title) || typeLabel(s.slide_type)}</div>
                </div>
            `;
            el.addEventListener('click', () => selectSlide(s.slide_id));

            // Drag events
            el.addEventListener('dragstart', (e) => {
                dragSrcId = s.slide_id;
                el.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragend', () => {
                dragSrcId = null;
                el.classList.remove('dragging');
                document.querySelectorAll('.slide-thumb.drag-over-above, .slide-thumb.drag-over-below').forEach(
                    n => n.classList.remove('drag-over-above', 'drag-over-below')
                );
            });
            el.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (s.slide_id === dragSrcId) return;
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                if (e.clientY < mid) {
                    el.classList.add('drag-over-above');
                    el.classList.remove('drag-over-below');
                } else {
                    el.classList.add('drag-over-below');
                    el.classList.remove('drag-over-above');
                }
            });
            el.addEventListener('dragleave', () => {
                el.classList.remove('drag-over-above', 'drag-over-below');
            });
            el.addEventListener('drop', (e) => {
                e.preventDefault();
                el.classList.remove('drag-over-above', 'drag-over-below');
                if (!dragSrcId || dragSrcId === s.slide_id) return;
                const rect = el.getBoundingClientRect();
                const mid = rect.top + rect.height / 2;
                const dropAbove = e.clientY < mid;
                reorderSlides(dragSrcId, s.slide_id, dropAbove);
            });

            $slideList.appendChild(el);
        });
    }

    async function reorderSlides(srcId, targetId, above) {
        const slides = editorState.slides;
        const srcIdx = slides.findIndex(s => s.slide_id === srcId);
        let targetIdx = slides.findIndex(s => s.slide_id === targetId);
        if (srcIdx === -1 || targetIdx === -1) return;

        const [moved] = slides.splice(srcIdx, 1);
        targetIdx = slides.findIndex(s => s.slide_id === targetId);
        const insertAt = above ? targetIdx : targetIdx + 1;
        slides.splice(insertAt, 0, moved);

        renderTimeline();
        renderPreview();

        const slideIds = slides.map(s => s.slide_id);
        try {
            await api('PUT', `/api/classroom/lesson-plans/${planId}/slides/reorder`, { slide_ids: slideIds });
        } catch (e) {
            console.error('Reorder failed:', e);
        }
    }

    // ===== Select slide =====
    function selectSlide(slideId) {
        editorState.selectedSlideId = slideId;
        renderTimeline();
        renderPreview();
        renderConfig();
    }

    function getSelectedSlide() {
        return editorState.slides.find(s => s.slide_id === editorState.selectedSlideId) || null;
    }

    // ===== Render preview (registry-driven) =====
    function renderPreview() {
        // Cleanup interactive preview engines when switching slides
        if (window._interactivePreview) {
            window._interactivePreview.destroy();
        }
        $previewContent.classList.remove('has-interactive-preview');

        const slide = getSelectedSlide();
        if (!slide) {
            $previewEmpty.style.display = '';
            $previewContent.style.display = 'none';
            return;
        }
        $previewEmpty.style.display = 'none';
        $previewContent.style.display = '';

        const handler = SLIDE_TYPE_HANDLERS[slide.slide_type];
        if (handler && handler.renderPreview) {
            handler.renderPreview(slide, $previewContent);
        } else {
            $previewContent.innerHTML = `<div style="text-align:center;color:var(--text-tertiary);padding:40px;">${typeLabel(slide.slide_type)} 預覽</div>`;
        }
    }

    // ===== Render config (registry-driven) =====
    function renderConfig() {
        const slide = getSelectedSlide();
        if (!slide) {
            $configForm.style.display = 'none';
            $configEmpty.style.display = '';
            return;
        }
        $configForm.style.display = '';
        $configEmpty.style.display = 'none';

        $slideTypeBadge.textContent = typeLabel(slide.slide_type);
        $slideTypeBadge.className = 'config-type-badge ' + slide.slide_type;
        $slideTitle.value = slide.title || '';
        $slideDuration.value = slide.duration_seconds || 0;

        const handler = SLIDE_TYPE_HANDLERS[slide.slide_type];
        if (handler && handler.renderConfig) {
            handler.renderConfig(slide, $typeConfigArea);
        } else {
            $typeConfigArea.innerHTML = '';
        }
    }

    // ===== Save plan =====
    async function savePlan() {
        if (editorState.saving) return;
        editorState.saving = true;
        $saveStatus.textContent = 'Saving...';

        try {
            await api('PUT', `/api/classroom/lesson-plans/${planId}`, {
                title: $planTitle.value,
                status: $planStatus.value,
            });

            const slide = getSelectedSlide();
            if (slide) {
                await saveCurrentSlide(slide);
            }

            $saveStatus.textContent = 'Saved';
            editorState.dirty = false;
            setTimeout(() => { $saveStatus.textContent = ''; }, 2000);
        } catch (e) {
            $saveStatus.textContent = 'Error: ' + e.message;
        } finally {
            editorState.saving = false;
        }
    }

    // ===== Save current slide (registry-driven) =====
    async function saveCurrentSlide(slide) {
        const update = {
            title: $slideTitle.value,
            duration_seconds: parseInt($slideDuration.value) || 0,
        };

        const handler = SLIDE_TYPE_HANDLERS[slide.slide_type];
        if (handler && handler.collectConfig) {
            const cfg = handler.collectConfig(slide);
            if (cfg) update.config = cfg;
        }

        await api('PUT', `/api/classroom/lesson-plans/${planId}/slides/${slide.slide_id}`, update);
        Object.assign(slide, update);
        if (update.config) slide.config = update.config;
        renderTimeline();
    }

    // ===== Delete slide =====
    async function deleteSlide() {
        const slide = getSelectedSlide();
        if (!slide) return;
        if (!confirm('確定刪除此幻燈片？')) return;

        try {
            await api('DELETE', `/api/classroom/lesson-plans/${planId}/slides/${slide.slide_id}`);
            editorState.slides = editorState.slides.filter(s => s.slide_id !== slide.slide_id);
            editorState.selectedSlideId = editorState.slides.length > 0 ? editorState.slides[0].slide_id : null;
            renderTimeline();
            renderPreview();
            renderConfig();
        } catch (e) {
            alert('刪除失敗: ' + e.message);
        }
    }

    // ===== Add slide modal =====
    function openAddModal() {
        $addSlideModal.style.display = '';
        document.getElementById('pptImportSection').style.display = 'none';
        document.getElementById('gameSelectSection').style.display = 'none';
        document.getElementById('linkInputSection').style.display = 'none';
        document.getElementById('interactiveConfigSection').style.display = 'none';
    }
    function closeAddModal() { $addSlideModal.style.display = 'none'; }

    document.querySelectorAll('.slide-type-card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            if (card.classList.contains('disabled')) return;

            // Hide all sub-sections first
            document.getElementById('pptImportSection').style.display = 'none';
            document.getElementById('gameSelectSection').style.display = 'none';
            document.getElementById('linkInputSection').style.display = 'none';
            document.getElementById('interactiveConfigSection').style.display = 'none';

            if (type === 'ppt') {
                document.getElementById('pptImportSection').style.display = '';
                loadRoomsForPPT();
            } else if (type === 'game') {
                loadGames();
            } else if (type === 'quiz') {
                createSlideOfType('quiz');
            } else if (type === 'poll') {
                createSlideOfType('poll');
            } else if (type === 'link') {
                document.getElementById('linkInputSection').style.display = '';
            } else if (type === 'interactive') {
                document.getElementById('interactiveConfigSection').style.display = '';
                if (window._interactiveEditorInit) {
                    window._interactiveEditorInit(
                        document.getElementById('interactiveTemplateConfig'),
                        (config) => createSlideOfType('interactive', config),
                    );
                }
            }
        });
    });

    // ===== PPT import =====

    const $pptTabUpload = document.getElementById('pptTabUpload');
    const $pptTabRoom = document.getElementById('pptTabRoom');
    const $pptUploadTab = document.getElementById('pptUploadTab');
    const $pptRoomTab = document.getElementById('pptRoomTab');

    function switchPPTTab(tab) {
        if (tab === 'upload') {
            $pptTabUpload.classList.add('active');
            $pptTabRoom.classList.remove('active');
            $pptUploadTab.style.display = '';
            $pptRoomTab.style.display = 'none';
        } else {
            $pptTabRoom.classList.add('active');
            $pptTabUpload.classList.remove('active');
            $pptRoomTab.style.display = '';
            $pptUploadTab.style.display = 'none';
            loadRoomsForPPT();
        }
    }

    $pptTabUpload.addEventListener('click', () => switchPPTTab('upload'));
    $pptTabRoom.addEventListener('click', () => switchPPTTab('room'));

    const $pptUploadZone = document.getElementById('pptUploadZone');
    const $pptFileInput = document.getElementById('pptFileInput');
    const $pptUploadProgress = document.getElementById('pptUploadProgress');

    $pptUploadZone.addEventListener('click', (e) => {
        if (e.target.closest('#pptUploadBtn') || e.target === $pptUploadZone || e.target.closest('svg') || e.target.closest('p') || e.target.closest('span')) {
            $pptFileInput.click();
        }
    });

    $pptFileInput.addEventListener('change', () => {
        if ($pptFileInput.files.length > 0) {
            handlePPTUpload($pptFileInput.files[0]);
        }
    });

    $pptUploadZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        $pptUploadZone.classList.add('drag-over');
    });
    $pptUploadZone.addEventListener('dragleave', () => {
        $pptUploadZone.classList.remove('drag-over');
    });
    $pptUploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        $pptUploadZone.classList.remove('drag-over');
        const files = e.dataTransfer.files;
        if (files.length > 0) handlePPTUpload(files[0]);
    });

    async function handlePPTUpload(file) {
        const name = file.name.toLowerCase();
        if (!name.endsWith('.pptx') && !name.endsWith('.ppt')) {
            alert('請選擇 .pptx 或 .ppt 檔案');
            return;
        }
        if (file.size > 150 * 1024 * 1024) {
            alert('檔案大小不能超過 150MB');
            return;
        }

        $pptUploadProgress.style.display = '';
        document.getElementById('pptProgressFilename').textContent = file.name;
        const $status = document.getElementById('pptProgressStatus');
        const $fill = document.getElementById('pptProgressFill');
        $status.textContent = '上傳中...';
        $status.className = 'ppt-progress-status';
        $fill.className = 'ppt-progress-fill';
        $fill.style.width = '30%';

        try {
            const formData = new FormData();
            formData.append('file', file);

            const uploadRes = await fetch(`/api/classroom/lesson-plans/${planId}/upload-ppt`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` },
                body: formData,
            });
            const uploadJson = await uploadRes.json();
            if (!uploadJson.success) throw new Error(uploadJson.message || 'Upload failed');

            const fileId = uploadJson.data.file_id;
            $fill.style.width = '50%';
            $status.textContent = '處理中...';
            $fill.classList.add('processing');

            await pollPPTStatus(fileId);

            $fill.classList.remove('processing');
            $fill.style.width = '80%';
            $status.textContent = '匯入中...';

            const insertAt = getInsertAt();
            const insertParam = insertAt != null ? `&insert_at=${insertAt}` : '';
            const slides = await api('POST', `/api/classroom/lesson-plans/${planId}/import-ppt?file_id=${fileId}${insertParam}`);
            insertSlidesIntoState(slides, insertAt);

            $fill.style.width = '100%';
            $status.textContent = `完成 (${slides.length} 頁)`;
            $status.classList.add('success');

            renderTimeline();
            if (slides.length > 0) selectSlide(slides[0].slide_id);

            setTimeout(() => {
                closeAddModal();
                $pptUploadProgress.style.display = 'none';
                $pptFileInput.value = '';
            }, 800);

        } catch (e) {
            $fill.classList.remove('processing');
            $fill.style.width = '100%';
            $fill.style.background = 'var(--color-danger)';
            $status.textContent = '失敗: ' + e.message;
            $status.classList.add('error');
            setTimeout(() => {
                $pptUploadProgress.style.display = 'none';
                $fill.style.background = '';
                $pptFileInput.value = '';
            }, 3000);
        }
    }

    async function pollPPTStatus(fileId) {
        const maxAttempts = 120;
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 1000));
            try {
                const info = await api('GET', `/api/classroom/ppt/${fileId}`);
                if (info.process_status === 'completed') return info;
                if (info.process_status === 'failed') {
                    throw new Error(info.error_message || 'PPT 處理失敗');
                }
            } catch (e) {
                if (e.message.includes('處理失敗')) throw e;
            }
        }
        throw new Error('PPT 處理超時');
    }

    async function loadRoomsForPPT() {
        try {
            const rooms = await api('GET', '/api/classroom/rooms');
            const select = document.getElementById('pptSourceSelect');
            select.innerHTML = '<option value="">-- 選擇房間 --</option>';
            (rooms || []).forEach(r => {
                select.innerHTML += `<option value="${r.room_id}">${escapeHtml(r.title)}</option>`;
            });
        } catch (e) {
            console.error('Load rooms failed:', e);
        }
    }

    document.getElementById('pptSourceSelect').addEventListener('change', async function () {
        const roomId = this.value;
        const $list = document.getElementById('pptFileList');
        $list.innerHTML = '';
        if (!roomId) return;

        try {
            const data = await api('GET', `/api/classroom/rooms/${roomId}/ppt`);
            const files = data.files || [];
            if (files.length === 0) {
                $list.innerHTML = '<p style="color:var(--text-tertiary);font-size:13px;padding:8px;">此房間沒有 PPT</p>';
                return;
            }
            files.forEach(f => {
                const el = document.createElement('div');
                el.className = 'ppt-file-item';
                el.innerHTML = `
                    <div>
                        <div class="ppt-file-name">${escapeHtml(f.original_name || f.file_id)}</div>
                        <div class="ppt-file-pages">${f.total_pages || '?'} pages</div>
                    </div>
                `;
                el.addEventListener('click', () => importPPT(f.file_id));
                $list.appendChild(el);
            });
        } catch (e) {
            $list.innerHTML = '<p style="color:var(--color-danger);font-size:13px;padding:8px;">' + escapeHtml(e.message) + '</p>';
        }
    });

    async function importPPT(fileId) {
        try {
            const insertAt = getInsertAt();
            const insertParam = insertAt != null ? `&insert_at=${insertAt}` : '';
            const slides = await api('POST', `/api/classroom/lesson-plans/${planId}/import-ppt?file_id=${fileId}${insertParam}`);
            insertSlidesIntoState(slides, insertAt);
            closeAddModal();
            renderTimeline();
            if (slides.length > 0) selectSlide(slides[0].slide_id);
        } catch (e) {
            alert('匯入失敗: ' + e.message);
        }
    }

    // ===== Link creation (from modal) =====
    document.getElementById('linkCreateBtn').addEventListener('click', async () => {
        const urlInput = document.getElementById('linkUrlInput');
        const descInput = document.getElementById('linkDescInput');
        const url = urlInput.value.trim();
        if (!url) { alert('請輸入網址'); return; }
        const desc = descInput.value.trim();
        await createSlideOfType('link', { url: url, description: desc });
        urlInput.value = '';
        descInput.value = '';
    });

    // ===== Game picker (subject-based modal) =====
    const $gamePickerModal = document.getElementById('gamePickerModal');
    const $gamePickerSubjects = document.getElementById('gamePickerSubjects');
    const $gamePickerList = document.getElementById('gamePickerList');
    const $gamePickerSearch = document.getElementById('gamePickerSearch');

    let gpSubjects = {};
    let gpAllGames = [];
    let gpFilteredGames = [];
    let gpActiveSubject = 'all';
    let gpMode = 'add';
    let gpSubjectsLoaded = false;

    async function openGamePicker(mode) {
        gpMode = mode;
        document.getElementById('gamePickerTitle').textContent =
            mode === 'replace' ? '更換遊戲' : '選擇遊戲';
        $gamePickerModal.style.display = '';
        $gamePickerSearch.value = '';
        gpActiveSubject = 'all';

        if (!gpSubjectsLoaded) {
            $gamePickerList.innerHTML = '<div class="gp-loading">載入中...</div>';
            try {
                const subjectsData = await api('GET', '/api/games/subjects/list');
                gpSubjects = subjectsData || {};
            } catch (e) {
                gpSubjects = {};
            }
            gpSubjectsLoaded = true;
            renderSubjectTabs();
        } else {
            renderSubjectTabs();
        }

        await loadGamesBySubject('all');
    }

    function closeGamePicker() {
        $gamePickerModal.style.display = 'none';
    }

    function renderSubjectTabs() {
        const defaultSubjects = {
            all: { name: '全部', icon: '🌟' },
            chinese: { name: '中文', icon: '📖' },
            math: { name: '數學', icon: '📐' },
            english: { name: '英文', icon: '🔤' },
            history: { name: '歷史', icon: '📜' },
            ict: { name: 'ICT', icon: '💻' },
            physics: { name: '物理', icon: '⚡' },
            chemistry: { name: '化學', icon: '🧪' },
            biology: { name: '生物', icon: '🧬' },
            ces: { name: '公民', icon: '🏛️' },
        };

        const merged = { ...defaultSubjects };
        for (const [key, val] of Object.entries(gpSubjects)) {
            if (!merged[key]) merged[key] = { name: val.name, icon: val.icon || '📚' };
        }

        $gamePickerSubjects.innerHTML = '';
        for (const [key, sub] of Object.entries(merged)) {
            const btn = document.createElement('button');
            btn.className = 'gp-subject-btn' + (key === gpActiveSubject ? ' active' : '');
            const iconHtml = (typeof SubjectIcon !== 'undefined') ? SubjectIcon.render(sub.icon, 18) : (sub.icon || '');
            btn.innerHTML = `<span class="gp-subject-icon">${iconHtml}</span>${sub.name}`;
            btn.addEventListener('click', () => {
                gpActiveSubject = key;
                renderSubjectTabs();
                loadGamesBySubject(key);
            });
            $gamePickerSubjects.appendChild(btn);
        }
    }

    async function loadGamesBySubject(subject) {
        $gamePickerList.innerHTML = '<div class="gp-loading">載入中...</div>';
        try {
            const url = subject === 'all'
                ? '/api/games/list'
                : `/api/games/list?subject=${encodeURIComponent(subject)}`;
            const data = await api('GET', url);
            gpAllGames = data || [];
            gpFilteredGames = gpAllGames;
            $gamePickerSearch.value = '';
            renderPickerGameList(gpFilteredGames);
        } catch (e) {
            $gamePickerList.innerHTML = '<div class="gp-empty">載入遊戲失敗</div>';
        }
    }

    function renderPickerGameList(games) {
        $gamePickerList.innerHTML = '';
        if (games.length === 0) {
            $gamePickerList.innerHTML = '<div class="gp-empty">此科目暫無遊戲</div>';
            return;
        }
        games.forEach(g => {
            const el = document.createElement('div');
            el.className = 'gp-game-card';
            const icon = g.icon || '🎮';
            const name = g.name || g.title || g.uuid || 'Game';
            const desc = g.description || '';
            const tags = g.tags || [];
            let tagsHtml = '';
            if (tags.length > 0) {
                tagsHtml = '<div class="gp-game-tags">' +
                    tags.slice(0, 3).map(t => `<span class="gp-game-tag">${escapeHtml(t)}</span>`).join('') +
                    '</div>';
            }
            el.innerHTML = `
                <div class="gp-game-icon">${icon}</div>
                <div class="gp-game-info">
                    <div class="gp-game-name">${escapeHtml(name)}</div>
                    <div class="gp-game-desc">${escapeHtml(desc)}</div>
                    ${tagsHtml}
                </div>
            `;
            el.addEventListener('click', () => onPickGame(g));
            $gamePickerList.appendChild(el);
        });
    }

    $gamePickerSearch.addEventListener('input', function () {
        const q = this.value.toLowerCase();
        if (!q) {
            gpFilteredGames = gpAllGames;
        } else {
            gpFilteredGames = gpAllGames.filter(g =>
                (g.name || g.title || '').toLowerCase().includes(q) ||
                (g.description || '').toLowerCase().includes(q)
            );
        }
        renderPickerGameList(gpFilteredGames);
    });

    async function onPickGame(game) {
        const gameUrl = game.url || game.play_url || `/uploaded_games/${game.uuid || game.game_uuid}`;
        const gameName = game.name || game.title || 'Game';
        const gameUuid = game.uuid || game.game_uuid || '';

        if (gpMode === 'replace') {
            const slide = getSelectedSlide();
            if (slide) {
                slide.config = {
                    ...slide.config,
                    game_uuid: gameUuid,
                    game_name: gameName,
                    game_url: gameUrl,
                };
                slide.title = gameName;
                closeGamePicker();
                renderPreview();
                renderConfig();
                renderTimeline();
                editorState.dirty = true;
            }
        } else {
            const insertAt = getInsertAt();
            try {
                const newSlide = await api('POST', `/api/classroom/lesson-plans/${planId}/slides`, {
                    slide_type: 'game',
                    title: gameName,
                    config: {
                        game_uuid: gameUuid,
                        game_name: gameName,
                        game_url: gameUrl,
                        time_limit: 0,
                        collect_scores: true,
                    },
                    insert_at: insertAt,
                });
                insertSlideIntoState(newSlide, insertAt);
                closeGamePicker();
                closeAddModal();
                renderTimeline();
                selectSlide(newSlide.slide_id);
            } catch (e) {
                alert('新增遊戲失敗: ' + e.message);
            }
        }
    }

    document.getElementById('closeGamePickerBtn').addEventListener('click', closeGamePicker);
    $gamePickerModal.addEventListener('click', (e) => {
        if (e.target === $gamePickerModal) closeGamePicker();
    });

    function loadGames() {
        openGamePicker('add');
    }

    document.getElementById('gameSearch').addEventListener('input', function () {
        // no-op: game picker modal handles search now
    });

    // ================================================================
    // SLIDE TYPE HANDLERS — 每種類型的預覽/配置/儲存封裝
    // ================================================================

    // ----- PPT -----
    registerSlideType('ppt', {
        label: 'PPT',

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            const imgUrl = `/uploads/ppt/${cfg.file_id}/page_${cfg.page_number}.png`;
            $el.innerHTML = `<img src="${imgUrl}" alt="PPT Page ${cfg.page_number}" style="max-width:100%;max-height:100%;" onerror="this.alt='Image not available';this.style.opacity=0.3;">`;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            $el.innerHTML = `
                <div class="config-section">
                    <label class="config-label">File ID</label>
                    <input type="text" class="config-input" value="${escapeHtml(cfg.file_id || '')}" readonly>
                </div>
                <div class="config-section">
                    <label class="config-label">Page Number</label>
                    <input type="number" class="config-input" value="${cfg.page_number || 1}" readonly>
                </div>
            `;
        },

        collectConfig() { return null; },
        getDefaultConfig() { return {}; },
        getDefaultTitle() { return 'PPT'; },
    });

    // ----- Game -----
    registerSlideType('game', {
        label: '遊戲',

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            $el.innerHTML = `
                <div class="preview-type-card">
                    <div class="preview-type-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>
                    </div>
                    <h3>${escapeHtml(cfg.game_name || 'Game')}</h3>
                    <p>${cfg.time_limit ? cfg.time_limit + ' 秒' : '無時限'}</p>
                </div>
            `;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            $el.innerHTML = `
                <div class="config-section">
                    <label class="config-label">Game Name</label>
                    <input type="text" class="config-input" id="cfgGameName" value="${escapeHtml(cfg.game_name || '')}" readonly>
                </div>
                <div class="config-section">
                    <label class="config-label">Game URL</label>
                    <div class="game-config-preview" id="cfgGameUrlBtn" title="點擊更換遊戲">
                        <span class="game-url">${escapeHtml(cfg.game_url || '')}</span>
                        <span class="change-game-hint">更換</span>
                    </div>
                </div>
                <div class="config-section">
                    <label class="config-label">Time Limit (seconds)</label>
                    <input type="number" class="config-input" id="cfgGameTimeLimit" value="${cfg.time_limit || 0}" min="0">
                </div>
            `;
            const $gameUrlBtn = document.getElementById('cfgGameUrlBtn');
            if ($gameUrlBtn) {
                $gameUrlBtn.addEventListener('click', () => openGamePicker('replace'));
            }
        },

        collectConfig(slide) {
            const nameEl = document.getElementById('cfgGameName');
            const timeLimitEl = document.getElementById('cfgGameTimeLimit');
            if (!nameEl && !timeLimitEl) return null;
            const cfg = { ...slide.config };
            if (nameEl) cfg.game_name = nameEl.value;
            if (timeLimitEl) cfg.time_limit = parseInt(timeLimitEl.value) || 0;
            return cfg;
        },

        getDefaultConfig() { return {}; },
        getDefaultTitle() { return 'Game'; },
    });

    // ----- Quiz -----
    registerSlideType('quiz', {
        label: '測驗',

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            const qs = cfg.questions || [];
            $el.innerHTML = `
                <div class="preview-type-card">
                    <div class="preview-type-icon quiz-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </div>
                    <h3>測驗 (${qs.length} 題)</h3>
                    <p>${cfg.time_limit ? cfg.time_limit + ' 秒' : '無時限'}</p>
                    <ul class="preview-list">
                        ${qs.slice(0, 5).map((q, i) => `<li>${i + 1}. ${escapeHtml(q.text) || '(未填題目)'}</li>`).join('')}
                        ${qs.length > 5 ? `<li>...共 ${qs.length} 題</li>` : ''}
                    </ul>
                </div>
            `;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            const questions = cfg.questions || [];

            const questionsHtml = questions.map((q, qi) => {
                const typeMap = { mc: '選擇題', fill: '填空題', tf: '判斷題' };
                let answerHtml = '';

                if (q.type === 'mc') {
                    const rawOpts = q.options || ['', '', '', ''];
                    // 兼容：string → {text, image_url}
                    const opts = rawOpts.map(o => typeof o === 'string' ? { text: o, image_url: null } : o);
                    answerHtml = opts.map((opt, oi) => {
                        const optText = opt.text || '';
                        const optImg = opt.image_url || '';
                        return `<div class="quiz-option-row">
                            <input type="radio" name="quizCorrect_${qi}" value="${oi}" ${q.correct_answer === optText ? 'checked' : ''}>
                            <input type="text" class="config-input quiz-opt-input" data-qi="${qi}" data-oi="${oi}" value="${escapeHtml(optText)}" placeholder="選項 ${oi + 1}">
                            <div class="opt-img-area" data-qi="${qi}" data-oi="${oi}">
                                ${optImg
                                    ? `<img class="opt-img-thumb" src="${escapeHtml(optImg)}"><button class="opt-img-remove" data-qi="${qi}" data-oi="${oi}" title="移除">&times;</button>`
                                    : `<label class="opt-img-btn" title="選項圖片"><input type="file" accept="image/*" class="opt-img-input" data-qi="${qi}" data-oi="${oi}" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                                }
                            </div>
                            ${rawOpts.length > 2 ? `<button class="remove-item-btn quiz-remove-opt" data-qi="${qi}" data-oi="${oi}" title="刪除">&times;</button>` : ''}
                        </div>`;
                    }).join('') + `<button class="add-item-btn quiz-add-opt" data-qi="${qi}">+ 新增選項</button>`;
                } else if (q.type === 'tf') {
                    answerHtml = `
                        <div class="quiz-option-row">
                            <label><input type="radio" name="quizCorrect_${qi}" value="true" ${q.correct_answer === 'true' ? 'checked' : ''}> 正確</label>
                            <label><input type="radio" name="quizCorrect_${qi}" value="false" ${q.correct_answer === 'false' ? 'checked' : ''}> 錯誤</label>
                        </div>
                    `;
                } else {
                    answerHtml = `
                        <input type="text" class="config-input quiz-fill-answer" data-qi="${qi}" value="${escapeHtml(q.correct_answer || '')}" placeholder="正確答案...">
                    `;
                }

                return `
                    <div class="quiz-question-block" data-qi="${qi}">
                        <div class="quiz-q-header">
                            <span class="quiz-q-num">Q${qi + 1}</span>
                            <select class="config-input quiz-q-type" data-qi="${qi}">
                                ${Object.entries(typeMap).map(([k, v]) => `<option value="${k}" ${q.type === k ? 'selected' : ''}>${v}</option>`).join('')}
                            </select>
                            <div class="quiz-q-points-wrap">
                                <input type="number" class="config-input quiz-q-points" data-qi="${qi}" value="${q.points || 10}" min="0" title="分數">
                                <span class="quiz-q-points-label">分</span>
                            </div>
                            ${questions.length > 1 ? `<button class="remove-item-btn quiz-remove-q" data-qi="${qi}" title="刪除題目">&times;</button>` : ''}
                        </div>
                        <textarea class="config-input quiz-q-text" data-qi="${qi}" placeholder="題目文本...">${escapeHtml(q.text || '')}</textarea>
                        <div class="quiz-img-area" data-qi="${qi}">
                            ${q.image_url
                                ? `<div class="quiz-img-preview"><img src="${escapeHtml(q.image_url)}" alt="題目圖片"><button class="quiz-img-remove" data-qi="${qi}" title="移除圖片">&times;</button></div>`
                                : `<label class="quiz-img-upload-btn"><input type="file" accept="image/*" class="quiz-img-input" data-qi="${qi}" style="display:none;"> + 上傳圖片</label>`
                            }
                        </div>
                        <div class="quiz-answer-area">${answerHtml}</div>
                    </div>
                `;
            }).join('');

            $el.innerHTML = `
                <div class="config-section">
                    <label class="config-label">題目列表</label>
                    <div id="quizQuestionList">${questionsHtml}</div>
                    <button class="add-item-btn" id="addQuizQuestionBtn">+ 新增題目</button>
                </div>
                <div class="config-section">
                    <label class="config-label">答題時限 (秒, 0=無限)</label>
                    <input type="number" class="config-input" id="cfgQuizTimeLimit" value="${cfg.time_limit ?? 60}" min="0">
                </div>
                <div class="config-section toggle-row">
                    <label><input type="checkbox" id="cfgQuizShowResults" ${cfg.show_results_live ? 'checked' : ''}> 即時顯示結果</label>
                    <label><input type="checkbox" id="cfgQuizAllowRetry" ${cfg.allow_retry ? 'checked' : ''}> 允許重答</label>
                </div>
            `;

            // Event: add question
            document.getElementById('addQuizQuestionBtn').addEventListener('click', () => {
                const qs = slide.config.questions || [];
                qs.push({
                    id: 'q_' + Date.now(),
                    type: 'mc',
                    text: '',
                    options: ['', '', '', ''],
                    correct_answer: '',
                    points: 10,
                });
                slide.config.questions = qs;
                this.renderConfig(slide, $el);
                editorState.dirty = true;
            });

            // Event: remove question
            $el.querySelectorAll('.quiz-remove-q').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qi = parseInt(btn.dataset.qi);
                    slide.config.questions.splice(qi, 1);
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: change question type
            $el.querySelectorAll('.quiz-q-type').forEach(sel => {
                sel.addEventListener('change', () => {
                    const qi = parseInt(sel.dataset.qi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.questions[qi].type = sel.value;
                    if (sel.value === 'tf') {
                        slide.config.questions[qi].options = ['true', 'false'];
                        slide.config.questions[qi].correct_answer = 'true';
                    } else if (sel.value === 'mc') {
                        slide.config.questions[qi].options = ['', '', '', ''];
                        slide.config.questions[qi].correct_answer = '';
                    } else {
                        slide.config.questions[qi].options = null;
                        slide.config.questions[qi].correct_answer = '';
                    }
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: add option (mc)
            $el.querySelectorAll('.quiz-add-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qi = parseInt(btn.dataset.qi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.questions[qi].options.push('');
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: remove option (mc)
            $el.querySelectorAll('.quiz-remove-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qi = parseInt(btn.dataset.qi);
                    const oi = parseInt(btn.dataset.oi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.questions[qi].options.splice(oi, 1);
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: image upload
            $el.querySelectorAll('.quiz-img-input').forEach(input => {
                input.addEventListener('change', async () => {
                    const qi = parseInt(input.dataset.qi);
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const token = AuthModule.getToken();
                        const res = await fetch('/api/classroom/quiz-images', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData,
                        });
                        const json = await res.json();
                        if (json.success && json.data?.url) {
                            const collected = this.collectConfig(slide);
                            if (collected) slide.config = collected;
                            slide.config.questions[qi].image_url = json.data.url;
                            this.renderConfig(slide, $el);
                            editorState.dirty = true;
                        } else {
                            UIModule.toast(json.message || '圖片上傳失敗', 'error');
                        }
                    } catch (e) {
                        UIModule.toast('圖片上傳失敗', 'error');
                    }
                });
            });

            // Event: remove image
            $el.querySelectorAll('.quiz-img-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qi = parseInt(btn.dataset.qi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.questions[qi].image_url = null;
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: option image upload
            $el.querySelectorAll('.opt-img-input').forEach(input => {
                input.addEventListener('change', async () => {
                    const qi = parseInt(input.dataset.qi);
                    const oi = parseInt(input.dataset.oi);
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const token = AuthModule.getToken();
                        const res = await fetch('/api/classroom/quiz-images', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData,
                        });
                        const json = await res.json();
                        if (json.success && json.data?.url) {
                            const collected = this.collectConfig(slide);
                            if (collected) slide.config = collected;
                            const opts = slide.config.questions[qi].options || [];
                            if (opts[oi] !== undefined) {
                                if (typeof opts[oi] === 'string') opts[oi] = { text: opts[oi], image_url: json.data.url };
                                else opts[oi].image_url = json.data.url;
                            }
                            this.renderConfig(slide, $el);
                            editorState.dirty = true;
                        } else {
                            UIModule.toast(json.message || '圖片上傳失敗', 'error');
                        }
                    } catch (e) { UIModule.toast('圖片上傳失敗', 'error'); }
                });
            });

            // Event: remove option image
            $el.querySelectorAll('.opt-img-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const qi = parseInt(btn.dataset.qi);
                    const oi = parseInt(btn.dataset.oi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    const opts = slide.config.questions[qi].options || [];
                    if (opts[oi] && typeof opts[oi] === 'object') opts[oi].image_url = null;
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });
        },

        collectConfig(slide) {
            const blocks = document.querySelectorAll('.quiz-question-block');
            if (blocks.length === 0) return null;

            const questions = [];
            blocks.forEach((block, qi) => {
                const origQ = (slide.config.questions || [])[qi] || {};
                const type = block.querySelector('.quiz-q-type')?.value || origQ.type || 'mc';
                const text = block.querySelector('.quiz-q-text')?.value || '';
                const points = parseInt(block.querySelector('.quiz-q-points')?.value) || 10;

                let options = null;
                let correctAnswer = '';

                if (type === 'mc') {
                    options = [];
                    block.querySelectorAll('.quiz-opt-input').forEach(inp => {
                        const oi = parseInt(inp.dataset.oi);
                        const origOpt = (origQ.options || [])[oi];
                        const imgUrl = (origOpt && typeof origOpt === 'object') ? origOpt.image_url : null;
                        options.push(imgUrl ? { text: inp.value, image_url: imgUrl } : inp.value);
                    });
                    const checkedRadio = block.querySelector(`input[name="quizCorrect_${qi}"]:checked`);
                    if (checkedRadio && options[parseInt(checkedRadio.value)] !== undefined) {
                        correctAnswer = options[parseInt(checkedRadio.value)];
                    }
                } else if (type === 'tf') {
                    options = ['true', 'false'];
                    const checkedRadio = block.querySelector(`input[name="quizCorrect_${qi}"]:checked`);
                    correctAnswer = checkedRadio ? checkedRadio.value : 'true';
                } else {
                    const fillInput = block.querySelector('.quiz-fill-answer');
                    correctAnswer = fillInput ? fillInput.value : '';
                }

                const questionData = {
                    id: origQ.id || ('q_' + Date.now() + '_' + qi),
                    type,
                    text,
                    options,
                    correct_answer: correctAnswer,
                    points,
                };
                if (origQ.image_url) questionData.image_url = origQ.image_url;
                questions.push(questionData);
            });

            return {
                questions,
                time_limit: parseInt(document.getElementById('cfgQuizTimeLimit')?.value) || 0,
                show_results_live: document.getElementById('cfgQuizShowResults')?.checked ?? true,
                allow_retry: document.getElementById('cfgQuizAllowRetry')?.checked ?? false,
            };
        },

        getDefaultConfig() {
            return {
                questions: [{
                    id: 'q_' + Date.now(),
                    type: 'mc',
                    text: '新題目',
                    options: ['選項 A', '選項 B', '選項 C', '選項 D'],
                    correct_answer: 'A',
                    points: 10,
                }],
                time_limit: 60,
                show_results_live: true,
                allow_retry: false,
            };
        },

        getDefaultTitle() { return '測驗'; },
    });

    // ----- Poll -----
    registerSlideType('poll', {
        label: '投票',

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            $el.innerHTML = `
                <div class="preview-type-card">
                    <div class="preview-type-icon poll-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                    </div>
                    <h3>${escapeHtml(cfg.question_text) || '(未填問題)'}</h3>
                    <ul class="preview-list">
                        ${(cfg.options || []).map((o, i) => `<li>${escapeHtml(o) || '選項 ' + (i + 1)}</li>`).join('')}
                    </ul>
                </div>
            `;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            const rawOptions = cfg.options || ['', ''];
            // 兼容：string → {text, image_url}
            const options = rawOptions.map(o => typeof o === 'string' ? { text: o, image_url: null } : o);

            const optionsHtml = options.map((opt, i) => {
                const optText = opt.text || '';
                const optImg = opt.image_url || '';
                return `<div class="poll-option-row">
                    <span class="poll-option-num">${i + 1}.</span>
                    <input type="text" class="config-input poll-opt-input" data-oi="${i}" value="${escapeHtml(optText)}" placeholder="選項 ${i + 1}">
                    <div class="opt-img-area" data-poll-oi="${i}">
                        ${optImg
                            ? `<img class="opt-img-thumb" src="${escapeHtml(optImg)}"><button class="opt-img-remove-poll" data-oi="${i}" title="移除">&times;</button>`
                            : `<label class="opt-img-btn" title="選項圖片"><input type="file" accept="image/*" class="opt-img-input-poll" data-oi="${i}" style="display:none;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></label>`
                        }
                    </div>
                    ${rawOptions.length > 2 ? `<button class="remove-item-btn poll-remove-opt" data-oi="${i}" title="刪除">&times;</button>` : ''}
                </div>`;
            }).join('');

            $el.innerHTML = `
                <div class="config-section">
                    <label class="config-label">投票問題</label>
                    <textarea class="config-input" id="cfgPollQuestion" placeholder="輸入投票問題...">${escapeHtml(cfg.question_text || '')}</textarea>
                    <div class="quiz-img-area" id="pollQuestionImgArea">
                        ${cfg.question_image_url
                            ? `<div class="quiz-img-preview"><img src="${escapeHtml(cfg.question_image_url)}" alt="問題圖片"><button class="poll-q-img-remove" title="移除圖片">&times;</button></div>`
                            : `<label class="quiz-img-upload-btn"><input type="file" accept="image/*" class="poll-q-img-input" style="display:none;"> + 上傳圖片</label>`
                        }
                    </div>
                </div>
                <div class="config-section">
                    <label class="config-label">選項</label>
                    <div id="pollOptionsList">${optionsHtml}</div>
                    <button class="add-item-btn" id="addPollOptionBtn">+ 新增選項</button>
                </div>
                <div class="config-section toggle-row">
                    <label><input type="checkbox" id="cfgPollMultiple" ${cfg.allow_multiple ? 'checked' : ''}> 允許多選</label>
                    <label><input type="checkbox" id="cfgPollAnonymous" ${cfg.anonymous ? 'checked' : ''}> 匿名投票</label>
                    <label><input type="checkbox" id="cfgPollShowResults" ${cfg.show_results_live !== false ? 'checked' : ''}> 即時顯示結果</label>
                </div>
            `;

            // Event: add option
            document.getElementById('addPollOptionBtn').addEventListener('click', () => {
                const collected = this.collectConfig(slide);
                if (collected) slide.config = collected;
                slide.config.options.push('');
                this.renderConfig(slide, $el);
                editorState.dirty = true;
            });

            // Event: remove option
            $el.querySelectorAll('.poll-remove-opt').forEach(btn => {
                btn.addEventListener('click', () => {
                    const oi = parseInt(btn.dataset.oi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.options.splice(oi, 1);
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: poll question image upload
            $el.querySelectorAll('.poll-q-img-input').forEach(input => {
                input.addEventListener('change', async () => {
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const token = AuthModule.getToken();
                        const res = await fetch('/api/classroom/quiz-images', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData,
                        });
                        const json = await res.json();
                        if (json.success && json.data?.url) {
                            const collected = this.collectConfig(slide);
                            if (collected) slide.config = collected;
                            slide.config.question_image_url = json.data.url;
                            this.renderConfig(slide, $el);
                            editorState.dirty = true;
                        } else {
                            UIModule.toast(json.message || '圖片上傳失敗', 'error');
                        }
                    } catch (e) { UIModule.toast('圖片上傳失敗', 'error'); }
                });
            });

            // Event: remove poll question image
            $el.querySelectorAll('.poll-q-img-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    slide.config.question_image_url = null;
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });

            // Event: poll option image upload
            $el.querySelectorAll('.opt-img-input-poll').forEach(input => {
                input.addEventListener('change', async () => {
                    const oi = parseInt(input.dataset.oi);
                    const file = input.files[0];
                    if (!file) return;
                    try {
                        const formData = new FormData();
                        formData.append('file', file);
                        const token = AuthModule.getToken();
                        const res = await fetch('/api/classroom/quiz-images', {
                            method: 'POST',
                            headers: { 'Authorization': `Bearer ${token}` },
                            body: formData,
                        });
                        const json = await res.json();
                        if (json.success && json.data?.url) {
                            const collected = this.collectConfig(slide);
                            if (collected) slide.config = collected;
                            const opts = slide.config.options || [];
                            if (opts[oi] !== undefined) {
                                if (typeof opts[oi] === 'string') opts[oi] = { text: opts[oi], image_url: json.data.url };
                                else opts[oi].image_url = json.data.url;
                            }
                            this.renderConfig(slide, $el);
                            editorState.dirty = true;
                        } else {
                            UIModule.toast(json.message || '圖片上傳失敗', 'error');
                        }
                    } catch (e) { UIModule.toast('圖片上傳失敗', 'error'); }
                });
            });

            // Event: remove poll option image
            $el.querySelectorAll('.opt-img-remove-poll').forEach(btn => {
                btn.addEventListener('click', () => {
                    const oi = parseInt(btn.dataset.oi);
                    const collected = this.collectConfig(slide);
                    if (collected) slide.config = collected;
                    const opts = slide.config.options || [];
                    if (opts[oi] && typeof opts[oi] === 'object') opts[oi].image_url = null;
                    this.renderConfig(slide, $el);
                    editorState.dirty = true;
                });
            });
        },

        collectConfig(slide) {
            const questionEl = document.getElementById('cfgPollQuestion');
            if (!questionEl) return null;

            const origOpts = (slide?.config?.options) || [];
            const options = [];
            document.querySelectorAll('.poll-opt-input').forEach((inp, i) => {
                const orig = origOpts[i];
                const imgUrl = (orig && typeof orig === 'object') ? orig.image_url : null;
                options.push(imgUrl ? { text: inp.value, image_url: imgUrl } : inp.value);
            });

            return {
                question_text: questionEl.value || '',
                question_image_url: slide?.config?.question_image_url || null,
                options: options,
                allow_multiple: document.getElementById('cfgPollMultiple')?.checked ?? false,
                anonymous: document.getElementById('cfgPollAnonymous')?.checked ?? false,
                show_results_live: document.getElementById('cfgPollShowResults')?.checked ?? true,
            };
        },

        getDefaultConfig() {
            return {
                question_text: '新投票問題',
                options: ['選項 1', '選項 2'],
                allow_multiple: false,
                anonymous: false,
                show_results_live: true,
            };
        },

        getDefaultTitle() { return '投票'; },
    });

    // ----- Link -----
    registerSlideType('link', {
        label: '連結',

        renderPreview(slide, $el) {
            const cfg = slide.config || {};
            const qrSrc = cfg.url ? `/api/classroom/qr?url=${encodeURIComponent(cfg.url)}` : '';
            $el.innerHTML = `
                <div class="preview-type-card">
                    <div class="preview-type-icon link-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
                    </div>
                    ${qrSrc ? `<img src="${qrSrc}" class="preview-qr-img" alt="QR Code">` : '<p style="color:var(--text-tertiary)">輸入 URL 後顯示 QR Code</p>'}
                    <a href="${escapeHtml(cfg.url || '')}" target="_blank" rel="noopener" class="preview-link-url">${escapeHtml(cfg.url || '(未填 URL)')}</a>
                    ${cfg.description ? `<p class="preview-link-desc">${escapeHtml(cfg.description)}</p>` : ''}
                </div>
            `;
        },

        renderConfig(slide, $el) {
            const cfg = slide.config || {};
            $el.innerHTML = `
                <div class="config-section">
                    <label class="config-label">URL</label>
                    <input type="url" class="config-input" id="cfgLinkUrl" value="${escapeHtml(cfg.url || '')}" placeholder="https://...">
                </div>
                <div class="config-section">
                    <label class="config-label">描述</label>
                    <input type="text" class="config-input" id="cfgLinkDesc" value="${escapeHtml(cfg.description || '')}" placeholder="連結描述...">
                </div>
            `;
        },

        collectConfig() {
            const urlEl = document.getElementById('cfgLinkUrl');
            if (!urlEl) return null;
            return {
                url: urlEl.value || '',
                description: document.getElementById('cfgLinkDesc')?.value || '',
            };
        },

        getDefaultConfig() { return { url: '', description: '' }; },
        getDefaultTitle() { return '連結'; },
    });

    // ===== Event listeners =====
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/classroom';
    });
    document.getElementById('saveBtn').addEventListener('click', savePlan);
    document.getElementById('saveSlideBtn').addEventListener('click', async () => {
        const btn = document.getElementById('saveSlideBtn');
        const origText = btn.innerHTML;
        btn.classList.add('saved');
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> 已儲存';
        await savePlan();
        setTimeout(() => {
            btn.classList.remove('saved');
            btn.innerHTML = origText;
        }, 1500);
    });
    document.getElementById('previewBtn').addEventListener('click', () => {
        if (editorState.slides.length === 0) return;
        window.LessonPreview.open(editorState.slides);
    });
    document.getElementById('addSlideBtn').addEventListener('click', openAddModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeAddModal);
    document.getElementById('deleteSlideBtn').addEventListener('click', deleteSlide);

    /* 禁止點擊遮罩關閉，僅允許 X 按鈕關閉 */

    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            savePlan();
        }
    });

    // ===== Init =====
    loadPlan();

})();
