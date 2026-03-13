/**
 * 課案編輯器 — JavaScript
 * State-driven: single source of truth in `editorState`
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
        const json = await res.json();
        if (!json.success) throw new Error(json.message || json.error_code || 'API Error');
        return json.data;
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
    function renderTimeline() {
        const slides = editorState.slides;
        $slideCount.textContent = slides.length;
        $slideList.innerHTML = '';

        slides.forEach((s, i) => {
            const el = document.createElement('div');
            el.className = 'slide-thumb' + (s.slide_id === editorState.selectedSlideId ? ' active' : '');
            el.dataset.slideId = s.slide_id;
            el.innerHTML = `
                <span class="slide-thumb-order">${i + 1}</span>
                <div class="slide-thumb-info">
                    <div class="slide-thumb-type">${s.slide_type}</div>
                    <div class="slide-thumb-title">${s.title || typeLabel(s.slide_type)}</div>
                </div>
            `;
            el.addEventListener('click', () => selectSlide(s.slide_id));
            $slideList.appendChild(el);
        });
    }

    function typeLabel(t) {
        const map = { ppt: 'PPT', game: 'Game', quiz: 'Quiz', poll: 'Poll', quick_answer: 'Quick Answer', raise_hand: 'Raise Hand' };
        return map[t] || t;
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

    // ===== Render preview =====
    function renderPreview() {
        const slide = getSelectedSlide();
        if (!slide) {
            $previewEmpty.style.display = '';
            $previewContent.style.display = 'none';
            return;
        }
        $previewEmpty.style.display = 'none';
        $previewContent.style.display = '';

        if (slide.slide_type === 'ppt') {
            const cfg = slide.config || {};
            const imgUrl = `/api/classroom/ppt/${cfg.file_id}/page/${cfg.page_number}`;
            $previewContent.innerHTML = `<img src="${imgUrl}" alt="PPT Page ${cfg.page_number}" onerror="this.alt='Image not available';this.style.opacity=0.3;">`;
        } else if (slide.slide_type === 'game') {
            const cfg = slide.config || {};
            $previewContent.innerHTML = `
                <div class="preview-game-card">
                    <div class="game-icon">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="1.5"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/><circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/></svg>
                    </div>
                    <h3>${cfg.game_name || 'Game'}</h3>
                    <p>${cfg.time_limit ? cfg.time_limit + ' 秒' : '無時限'}</p>
                </div>
            `;
        } else {
            $previewContent.innerHTML = `<div style="text-align:center;color:var(--text-tertiary);">${typeLabel(slide.slide_type)} 預覽</div>`;
        }
    }

    // ===== Render config =====
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

        renderTypeConfig(slide);
    }

    function renderTypeConfig(slide) {
        const cfg = slide.config || {};
        let html = '';

        if (slide.slide_type === 'ppt') {
            html = `
                <div class="config-section">
                    <label class="config-label">File ID</label>
                    <input type="text" class="config-input" value="${cfg.file_id || ''}" readonly>
                </div>
                <div class="config-section">
                    <label class="config-label">Page Number</label>
                    <input type="number" class="config-input" value="${cfg.page_number || 1}" readonly>
                </div>
            `;
        } else if (slide.slide_type === 'game') {
            html = `
                <div class="config-section">
                    <label class="config-label">Game Name</label>
                    <input type="text" class="config-input" id="cfgGameName" value="${cfg.game_name || ''}" readonly>
                </div>
                <div class="config-section">
                    <label class="config-label">Game URL</label>
                    <div class="game-config-preview" id="cfgGameUrlBtn" title="點擊更換遊戲">
                        <span class="game-url">${cfg.game_url || ''}</span>
                        <span class="change-game-hint">更換</span>
                    </div>
                </div>
                <div class="config-section">
                    <label class="config-label">Time Limit (seconds)</label>
                    <input type="number" class="config-input" id="cfgGameTimeLimit" value="${cfg.time_limit || 0}" min="0">
                </div>
            `;
        }

        $typeConfigArea.innerHTML = html;

        // Bind "change game" click
        const $gameUrlBtn = document.getElementById('cfgGameUrlBtn');
        if ($gameUrlBtn) {
            $gameUrlBtn.addEventListener('click', () => openGamePicker('replace'));
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

            // save current slide if selected
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

    async function saveCurrentSlide(slide) {
        const update = {
            title: $slideTitle.value,
            duration_seconds: parseInt($slideDuration.value) || 0,
        };

        // type-specific config updates
        if (slide.slide_type === 'game') {
            const nameEl = document.getElementById('cfgGameName');
            const timeLimitEl = document.getElementById('cfgGameTimeLimit');
            if (nameEl || timeLimitEl) {
                update.config = { ...slide.config };
                if (nameEl) update.config.game_name = nameEl.value;
                if (timeLimitEl) update.config.time_limit = parseInt(timeLimitEl.value) || 0;
            }
        }

        await api('PUT', `/api/classroom/lesson-plans/${planId}/slides/${slide.slide_id}`, update);
        // update local state
        Object.assign(slide, update);
        if (update.config) slide.config = update.config;
        renderTimeline();
    }

    // ===== Delete slide =====
    async function deleteSlide() {
        const slide = getSelectedSlide();
        if (!slide) return;
        if (!confirm(`確定刪除此幻燈片？`)) return;

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
    }
    function closeAddModal() { $addSlideModal.style.display = 'none'; }

    document.querySelectorAll('.slide-type-card').forEach(card => {
        card.addEventListener('click', () => {
            const type = card.dataset.type;
            if (card.classList.contains('disabled')) return;

            if (type === 'ppt') {
                document.getElementById('pptImportSection').style.display = '';
                document.getElementById('gameSelectSection').style.display = 'none';
                loadRoomsForPPT();
            } else if (type === 'game') {
                document.getElementById('gameSelectSection').style.display = '';
                document.getElementById('pptImportSection').style.display = 'none';
                loadGames();
            }
        });
    });

    // ===== PPT import =====

    // --- PPT Tab switching ---
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

    // --- Direct Upload ---
    const $pptUploadZone = document.getElementById('pptUploadZone');
    const $pptFileInput = document.getElementById('pptFileInput');
    const $pptUploadProgress = document.getElementById('pptUploadProgress');

    // Click zone to trigger file input
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

    // Drag & drop
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

        // Show progress
        $pptUploadProgress.style.display = '';
        document.getElementById('pptProgressFilename').textContent = file.name;
        const $status = document.getElementById('pptProgressStatus');
        const $fill = document.getElementById('pptProgressFill');
        $status.textContent = '上傳中...';
        $status.className = 'ppt-progress-status';
        $fill.className = 'ppt-progress-fill';
        $fill.style.width = '30%';

        try {
            // Upload via multipart
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

            // Poll for processing completion
            const pptInfo = await pollPPTStatus(fileId);

            $fill.classList.remove('processing');
            $fill.style.width = '80%';
            $status.textContent = '匯入中...';

            // Auto-import slides
            const slides = await api('POST', `/api/classroom/lesson-plans/${planId}/import-ppt?file_id=${fileId}`);
            editorState.slides.push(...slides);

            $fill.style.width = '100%';
            $status.textContent = `完成 (${slides.length} 頁)`;
            $status.classList.add('success');

            renderTimeline();
            if (slides.length > 0) selectSlide(slides[0].slide_id);

            // Auto-close modal after brief delay
            setTimeout(() => {
                closeAddModal();
                // Reset upload UI
                $pptUploadProgress.style.display = 'none';
                $pptFileInput.value = '';
            }, 800);

        } catch (e) {
            $fill.classList.remove('processing');
            $fill.style.width = '100%';
            $fill.style.background = 'var(--color-danger)';
            $status.textContent = '失敗: ' + e.message;
            $status.classList.add('error');
            // Allow retry
            setTimeout(() => {
                $pptUploadProgress.style.display = 'none';
                $fill.style.background = '';
                $pptFileInput.value = '';
            }, 3000);
        }
    }

    async function pollPPTStatus(fileId) {
        const maxAttempts = 120;  // up to ~2 minutes
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
                // Network error — keep polling
            }
        }
        throw new Error('PPT 處理超時');
    }

    // --- Select from Room (existing flow) ---
    async function loadRoomsForPPT() {
        try {
            const rooms = await api('GET', '/api/classroom/rooms');
            const select = document.getElementById('pptSourceSelect');
            select.innerHTML = '<option value="">-- 選擇房間 --</option>';
            (rooms || []).forEach(r => {
                select.innerHTML += `<option value="${r.room_id}">${r.title}</option>`;
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
                        <div class="ppt-file-name">${f.original_name || f.file_id}</div>
                        <div class="ppt-file-pages">${f.total_pages || '?'} pages</div>
                    </div>
                `;
                el.addEventListener('click', () => importPPT(f.file_id));
                $list.appendChild(el);
            });
        } catch (e) {
            $list.innerHTML = '<p style="color:var(--color-danger);font-size:13px;padding:8px;">' + e.message + '</p>';
        }
    });

    async function importPPT(fileId) {
        try {
            const slides = await api('POST', `/api/classroom/lesson-plans/${planId}/import-ppt?file_id=${fileId}`);
            editorState.slides.push(...slides);
            closeAddModal();
            renderTimeline();
            if (slides.length > 0) selectSlide(slides[0].slide_id);
        } catch (e) {
            alert('匯入失敗: ' + e.message);
        }
    }

    // ===== Game picker (subject-based modal) =====
    const $gamePickerModal = document.getElementById('gamePickerModal');
    const $gamePickerSubjects = document.getElementById('gamePickerSubjects');
    const $gamePickerList = document.getElementById('gamePickerList');
    const $gamePickerSearch = document.getElementById('gamePickerSearch');

    let gpSubjects = {};
    let gpAllGames = [];
    let gpFilteredGames = [];
    let gpActiveSubject = 'all';
    let gpMode = 'add'; // 'add' = new slide, 'replace' = change existing slide's game
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

        // Merge API subjects with defaults
        const merged = { ...defaultSubjects };
        for (const [key, val] of Object.entries(gpSubjects)) {
            if (!merged[key]) merged[key] = { name: val.name, icon: val.icon || '📚' };
        }

        $gamePickerSubjects.innerHTML = '';
        for (const [key, sub] of Object.entries(merged)) {
            const btn = document.createElement('button');
            btn.className = 'gp-subject-btn' + (key === gpActiveSubject ? ' active' : '');
            btn.innerHTML = `<span class="gp-subject-icon">${sub.icon}</span>${sub.name}`;
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
                    tags.slice(0, 3).map(t => `<span class="gp-game-tag">${t}</span>`).join('') +
                    '</div>';
            }
            el.innerHTML = `
                <div class="gp-game-icon">${icon}</div>
                <div class="gp-game-info">
                    <div class="gp-game-name">${name}</div>
                    <div class="gp-game-desc">${desc}</div>
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
            // Update existing slide's game config
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
            // Add new game slide
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
                });
                editorState.slides.push(newSlide);
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

    // Legacy flat game list (used in add-slide modal) — now delegates to game picker
    function loadGames() {
        openGamePicker('add');
    }

    // Legacy search (kept for backwards compat but no longer primary)
    document.getElementById('gameSearch').addEventListener('input', function () {
        // no-op: game picker modal handles search now
    });

    // ===== Event listeners =====
    document.getElementById('backBtn').addEventListener('click', () => {
        window.location.href = '/classroom';
    });
    document.getElementById('saveBtn').addEventListener('click', savePlan);
    document.getElementById('addSlideBtn').addEventListener('click', openAddModal);
    document.getElementById('closeModalBtn').addEventListener('click', closeAddModal);
    document.getElementById('deleteSlideBtn').addEventListener('click', deleteSlide);

    // close modal on overlay click
    $addSlideModal.addEventListener('click', (e) => {
        if (e.target === $addSlideModal) closeAddModal();
    });

    // keyboard shortcut: Ctrl/Cmd+S
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            savePlan();
        }
    });

    // ===== Init =====
    loadPlan();

})();
