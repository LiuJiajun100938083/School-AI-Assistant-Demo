/**
 * AI 考卷出題 — 前端邏輯
 * ========================
 * 分層：State → API(內部) → UI → Views → History → Actions → App
 *
 * 依賴（共用模組）：
 *   - window.AuthModule  — JWT 管理
 *   - window.UIModule    — Toast / Confirm / Loading
 *   - window.APIClient   — HTTP 請求（新代碼使用）
 *   - window.Utils       — formatDate / escapeHtml
 *
 * 視圖狀態機：config ↔ history ↔ detail
 */

const ExamCreator = (() => {
    'use strict';

    // ================================================================
    // State — 集中管理頁面狀態
    // ================================================================
    const state = {
        token: null,
        username: '',
        sessionId: null,
        questions: [],
        difficulty: 3,
        pollTimer: null,
        editingIndex: -1,
        knowledgePoints: [],
        // 新增：視圖狀態機
        view: 'config',              // 'config' | 'history' | 'detail'
        historyPollingTimer: null,    // 歷史頁輪詢 timer
        historyGeneratingIds: [],    // 正在生成的 session ids
        pendingGeometry: null,       // 待用的 JSXGraph config（幾何預覽）
        // 相似題模式
        mode: 'generate',            // 'generate' | 'similar'
        inputMethod: 'text',         // 'text' | 'image'
        uploadedFile: null,          // 圖片上傳 File object
    };

    // ================================================================
    // API — 後端 fetch 封裝（舊代碼保持兼容，新功能用 APIClient）
    // ================================================================
    const API = {
        _headers() {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            };
        },

        async generate(params) {
            const resp = await fetch('/api/exam-creator/generate', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(params),
            });
            return resp.json();
        },

        async getStatus(sessionId) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/status`, {
                headers: this._headers(),
            });
            return resp.json();
        },

        async updateQuestion(sessionId, index, edits) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/questions/${index}`, {
                method: 'PUT',
                headers: this._headers(),
                body: JSON.stringify({ question_index: index, edits }),
            });
            return resp.json();
        },

        async regenerateQuestion(sessionId, index, instruction) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/regenerate`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({ question_index: index, instruction }),
            });
            return resp.json();
        },

        async getKnowledgePoints(subject) {
            const resp = await fetch(`/api/exam-creator/knowledge-points/${subject}`, {
                headers: this._headers(),
            });
            return resp.json();
        },

        async generateSimilar(params) {
            const resp = await fetch('/api/exam-creator/similar/text', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(params),
            });
            return resp.json();
        },

        async ocrImage(formData) {
            const resp = await fetch('/api/exam-creator/similar/image', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${state.token}` },
                body: formData,
            });
            return resp.json();
        },
    };

    // ================================================================
    // UI — 渲染工具
    // ================================================================
    const UI = {
        renderMath(text) {
            if (!text) return '';
            if (typeof text !== 'string') text = String(text);
            // 保護 SVG 塊
            const svgBlocks = [];
            text = text.replace(/<svg[\s\S]*?<\/svg>/gi, m => {
                svgBlocks.push(m); return `SVGPH${svgBlocks.length - 1}ENDSVGPH`;
            });
            // KaTeX display: $$...$$
            let html = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
                try {
                    return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true, strict: 'ignore' });
                } catch { return `$$${tex}$$`; }
            });
            // KaTeX inline: $...$（跳過純中文/CJK 內容）
            html = html.replace(/\$([^$\n]+?)\$/g, (full, tex) => {
                const cjk = tex.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef，。：；！？、]/g, '');
                if (cjk.trim().length < tex.trim().length * 0.3) return full;
                try {
                    return katex.renderToString(tex, { throwOnError: false, strict: 'ignore' });
                } catch { return full; }
            });
            // Markdown (GFM tables supported)
            if (typeof marked !== 'undefined') {
                html = marked.parse(html, { gfm: true, breaks: true });
            }
            // Sanitize
            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['svg', 'path', 'line', 'circle', 'rect', 'text', 'g', 'defs',
                               'marker', 'polygon', 'polyline', 'ellipse', 'use'],
                    ADD_ATTR: ['viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy',
                               'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
                               'transform', 'font-size', 'text-anchor', 'dominant-baseline',
                               'stroke-linecap', 'stroke-linejoin', 'points', 'rx', 'ry',
                               'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
                               'stroke-dasharray', 'opacity'],
                });
            }
            // 還原 SVG 塊
            svgBlocks.forEach((svg, i) => {
                html = html.replace(`SVGPH${i}ENDSVGPH`, svg);
            });
            return html;
        },

        $(id) { return document.getElementById(id); },
        show(id) { const el = this.$(id); if (el) el.style.display = ''; },
        hide(id) { const el = this.$(id); if (el) el.style.display = 'none'; },
    };

    // ================================================================
    // 視圖狀態機 — 統一控制 config / history / detail 切換
    // ================================================================

    const ALL_VIEW_IDS = [
        'emptyState', 'generatingState', 'errorState',
        'questionsContainer', 'historyView', 'detailView',
    ];

    function showView(name) {
        // 離開舊視圖時清理
        if (state.view === 'history') stopHistoryPolling();
        if (state.view !== name && window.JSXGraphRenderer) JSXGraphRenderer.destroyAll();

        state.view = name;

        // 隱藏所有容器
        ALL_VIEW_IDS.forEach(id => UI.hide(id));

        // 顯示目標
        switch (name) {
            case 'config':
                UI.show('emptyState');
                break;
            case 'history':
                UI.show('historyView');
                loadHistory();
                break;
            case 'detail':
                UI.show('detailView');
                break;
        }
    }

    // ================================================================
    // Views — 各面板渲染
    // ================================================================
    const Views = {
        renderKnowledgePoints(points) {
            const container = UI.$('pointsList');
            if (!points.length) {
                container.innerHTML = '<div class="loading-text">暫無知識點數據</div>';
                return;
            }

            // Group by category
            const groups = {};
            points.forEach(p => {
                const cat = p.category || '其他';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(p);
            });

            let html = '';
            for (const [cat, pts] of Object.entries(groups)) {
                html += `<div class="point-category">${cat}</div>`;
                pts.forEach(p => {
                    html += `
                        <label class="point-item">
                            <input type="checkbox" value="${p.point_code}" data-name="${p.point_name}">
                            <span>${p.point_name}</span>
                        </label>`;
                });
            }
            container.innerHTML = html;
            UI.$('pointsCount').textContent = `(${points.length} 個)`;
        },

        /**
         * 渲染題目列表到指定容器
         * @param {string} containerId — DOM 容器 id
         * @param {Array} questions — 題目列表
         */
        renderQuestionsInto(containerId, questions) {
            const container = UI.$(containerId);
            if (!container) return;
            if (!questions || !questions.length) {
                container.innerHTML = '<div class="loading-text">無題目</div>';
                return;
            }

            let html = '';
            const typeLabels = {
                multiple_choice: '選擇題', short_answer: '簡答題',
                long_answer: '解答題', fill_blank: '填空題',
            };

            const pendingJsx = [];

            questions.forEach((q, i) => {
                const typeLabel = typeLabels[q.question_type] || q.question_type || '題目';
                const points = q.points || 0;

                // JSXGraph 優先，SVG 其次
                let diagramHtml = '';
                if (q.question_jsxgraph) {
                    const cid = `jsxg-exam-q${i}`;
                    diagramHtml = `<div id="${cid}" class="question-svg-container" style="width:300px;height:250px"></div>`;
                    pendingJsx.push({ id: cid, config: q.question_jsxgraph });
                } else if (q.question_svg) {
                    diagramHtml = `<div class="question-svg-container">${q.question_svg}</div>`;
                }

                const questionHtml = UI.renderMath(q.question || '');
                const answerHtml = UI.renderMath(q.correct_answer || '');
                const markingHtml = q.marking_scheme
                    ? `<div class="marking-scheme"><strong>評分準則：</strong>${UI.renderMath(q.marking_scheme)}</div>`
                    : '';

                // Options for MC
                let optionsHtml = '';
                if (q.options && Array.isArray(q.options) && q.options.length) {
                    optionsHtml = '<div class="mc-options" style="margin-top:8px;">';
                    q.options.forEach((opt, j) => {
                        const letter = String.fromCharCode(65 + j);
                        optionsHtml += `<div style="margin:4px 0;font-size:14px;">${letter}. ${UI.renderMath(opt)}</div>`;
                    });
                    optionsHtml += '</div>';
                }

                html += `
                <div class="question-card" id="qcard-${i}">
                    <div class="question-card-header">
                        <div class="question-meta">
                            <span class="question-number">Q${q.index || i + 1}</span>
                            <span class="question-points-badge">${points} 分</span>
                            <span class="question-type-badge">${typeLabel}</span>
                        </div>
                        <div class="question-card-actions">
                            <button class="card-action-btn" title="編輯" onclick="ExamCreator.openEditModal(${i})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="card-action-btn" title="重新生成" onclick="ExamCreator.regenerate(${i})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                            </button>
                            <button class="card-action-btn" title="導出 Word" onclick="ExamCreator.exportDocx(${i})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="question-card-body">
                        <div class="question-text">${questionHtml}</div>
                        ${diagramHtml}
                        ${optionsHtml}
                    </div>
                    <button class="answer-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
                        顯示/隱藏答案
                    </button>
                    <div class="answer-content">
                        <div>${answerHtml}</div>
                        ${markingHtml}
                    </div>
                </div>`;
            });

            container.innerHTML = html;

            // JSXGraph 渲染（DOM 已就緒）
            pendingJsx.forEach(r => {
                if (window.JSXGraphRenderer) {
                    try { JSXGraphRenderer.render(r.id, r.config); }
                    catch (e) { console.warn('JSXGraph render failed:', r.id, e); }
                }
            });
        },

        /** 向後兼容：舊的 renderQuestions 指向 questionsList */
        renderQuestions(questions) {
            this.renderQuestionsInto('questionsList', questions);
        },

        showState(stateName) {
            ALL_VIEW_IDS.forEach(id => UI.hide(id));
            UI.show(stateName);
        },
    };

    // ================================================================
    // localStorage 持久化 — pending session（30min TTL）
    // ================================================================

    const PENDING_KEY = 'ec_pending_session';
    const PENDING_TTL = 30 * 60 * 1000; // 30 分鐘

    function savePendingSession(sessionId) {
        try {
            localStorage.setItem(PENDING_KEY, JSON.stringify({
                sid: sessionId, ts: Date.now(),
            }));
        } catch (_) { /* localStorage 不可用時靜默 */ }
    }

    function loadPendingSession() {
        try {
            const raw = localStorage.getItem(PENDING_KEY);
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (Date.now() - data.ts > PENDING_TTL) {
                localStorage.removeItem(PENDING_KEY);
                return null;
            }
            return data;
        } catch (_) { return null; }
    }

    function clearPendingSession() {
        try { localStorage.removeItem(PENDING_KEY); } catch (_) {}
    }

    // ================================================================
    // History — 歷史列表視圖
    // ================================================================

    const SUBJECT_LABELS = { math: '數學', physics: '物理' };
    const MODE_LABELS = { generate: 'AI 出題', similar: '相似題' };
    const SOURCE_TYPE_LABELS = { text: '文字輸入', image: '圖片 OCR' };
    const STATUS_CONFIG = {
        generating:        { label: '生成中', cls: 'status-badge--generating' },
        generated:         { label: '已完成', cls: 'status-badge--generated' },
        generation_failed: { label: '失敗',   cls: 'status-badge--failed' },
    };

    async function loadHistory() {
        const listEl = UI.$('historyList');
        const emptyEl = UI.$('historyEmpty');
        if (!listEl) return;

        listEl.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;color:#9ca3af;">載入歷史...</div>';
        if (emptyEl) emptyEl.style.display = 'none';

        try {
            const histResp = await fetch('/api/exam-creator/history?page=1&page_size=50', {
                headers: API._headers(),
            });
            const result = await histResp.json();

            if (!result.success || !result.data || !result.data.length) {
                listEl.innerHTML = '';
                if (emptyEl) emptyEl.style.display = '';
                return;
            }

            renderHistoryCards(result.data, listEl);

            // 輪詢 generating 項
            const generating = result.data.filter(i => i.status === 'generating');
            state.historyGeneratingIds = generating.map(i => i.session_id);
            if (generating.length > 0) startHistoryPolling();
        } catch (e) {
            console.error('loadHistory failed:', e);
            listEl.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;color:#ef4444;">載入失敗</div>';
        }
    }

    function renderHistoryCards(items, container) {
        const formatDate = window.Utils?.formatDate || (d => String(d).slice(0, 16));

        let html = '';
        items.forEach(item => {
            const subjectLabel = SUBJECT_LABELS[item.subject] || item.subject || '未知';
            const statusCfg = STATUS_CONFIG[item.status] || { label: item.status, cls: '' };
            const dateStr = formatDate(item.created_at, true);
            const count = item.question_count || 0;
            const difficulty = item.difficulty || '-';
            const isClickable = item.status === 'generated';

            // Mode badge
            const modeLabel = MODE_LABELS[item.mode] || MODE_LABELS.generate;
            const sourceLabel = item.source_type ? SOURCE_TYPE_LABELS[item.source_type] : '';
            const modeBadgeText = sourceLabel ? `${modeLabel} · ${sourceLabel}` : modeLabel;
            const modeBadgeCls = item.mode === 'similar' ? 'mode-badge mode-badge--similar' : 'mode-badge';

            // 解析 target_points
            let pointsText = '';
            if (item.target_points) {
                const pts = typeof item.target_points === 'string'
                    ? JSON.parse(item.target_points) : item.target_points;
                if (Array.isArray(pts) && pts.length) {
                    pointsText = pts.slice(0, 3).join('、') + (pts.length > 3 ? '...' : '');
                }
            }

            html += `
            <div class="history-card ${isClickable ? 'history-card--clickable' : ''}"
                 id="card-${item.session_id}"
                 ${isClickable ? `onclick="ExamCreator.showDetail('${item.session_id}')"` : ''}>
                <div class="history-card__row">
                    <div class="history-card__info">
                        <span class="${modeBadgeCls}">${modeBadgeText}</span>
                        <span class="history-card__sep">·</span>
                        <span class="history-card__subject">${subjectLabel}</span>
                        <span class="history-card__sep">·</span>
                        <span>${count} 題</span>
                        <span class="history-card__sep">·</span>
                        <span>難度 ${difficulty}</span>
                        ${pointsText ? `<span class="history-card__sep">·</span><span class="history-card__points">${pointsText}</span>` : ''}
                    </div>
                    <div class="history-card__right">
                        <span class="status-badge ${statusCfg.cls}">${statusCfg.label}</span>
                        ${item.status !== 'generating' ? `
                            <button class="btn-delete" title="刪除" onclick="event.stopPropagation(); ExamCreator.deleteSession('${item.session_id}')">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                            </button>` : ''}
                    </div>
                </div>
                <div class="history-card__date">${dateStr}</div>
            </div>`;
        });

        container.innerHTML = html;
    }

    function updateCardStatus(sessionId, newStatus) {
        const card = UI.$(`card-${sessionId}`);
        if (!card) return;

        const badge = card.querySelector('.status-badge');
        if (badge) {
            const cfg = STATUS_CONFIG[newStatus] || { label: newStatus, cls: '' };
            badge.className = `status-badge ${cfg.cls}`;
            badge.textContent = cfg.label;
        }

        if (newStatus === 'generated') {
            card.classList.add('history-card--clickable');
            card.onclick = () => showDetail(sessionId);
            // 加刪除按鈕
            const rightEl = card.querySelector('.history-card__right');
            if (rightEl && !rightEl.querySelector('.btn-delete')) {
                rightEl.insertAdjacentHTML('beforeend', `
                    <button class="btn-delete" title="刪除" onclick="event.stopPropagation(); ExamCreator.deleteSession('${sessionId}')">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                    </button>`);
            }
        }
    }

    // ================================================================
    // History Polling — 輪詢 generating 項
    // ================================================================

    function startHistoryPolling() {
        stopHistoryPolling();
        state.historyPollingTimer = setInterval(pollGeneratingItems, 5000);
    }

    function stopHistoryPolling() {
        if (state.historyPollingTimer) {
            clearInterval(state.historyPollingTimer);
            state.historyPollingTimer = null;
        }
    }

    async function pollGeneratingItems() {
        const ids = [...state.historyGeneratingIds];
        if (!ids.length) {
            stopHistoryPolling();
            return;
        }

        for (const sid of ids) {
            try {
                const resp = await API.getStatus(sid);
                if (!resp.success || !resp.data) continue;

                const { status } = resp.data;
                if (status === 'generated') {
                    updateCardStatus(sid, 'generated');
                    state.historyGeneratingIds = state.historyGeneratingIds.filter(id => id !== sid);
                    clearPendingSession();
                    if (window.UIModule) UIModule.toast('試卷生成完成！', 'success');
                } else if (status === 'generation_failed') {
                    updateCardStatus(sid, 'generation_failed');
                    state.historyGeneratingIds = state.historyGeneratingIds.filter(id => id !== sid);
                    clearPendingSession();
                    if (window.UIModule) UIModule.toast('試卷生成失敗', 'error');
                }
            } catch (e) {
                console.warn('Poll generating item failed:', sid, e);
            }
        }

        // 全部完成 → 停止輪詢
        if (!state.historyGeneratingIds.length) stopHistoryPolling();
    }

    // ================================================================
    // Detail — 試卷詳情視圖
    // ================================================================

    async function showDetail(sessionId) {
        showView('detail');

        // 加載中
        const listEl = UI.$('detailQuestionsList');
        if (listEl) listEl.innerHTML = '<div class="loading-text" style="text-align:center;padding:40px;">載入題目...</div>';

        try {
            const resp = await API.getStatus(sessionId);
            if (!resp.success || !resp.data || !resp.data.questions) {
                if (listEl) listEl.innerHTML = '<div class="loading-text" style="color:#ef4444;">無法載入題目</div>';
                return;
            }

            state.sessionId = sessionId;
            state.questions = resp.data.questions;

            // 更新總分
            const totalMarks = state.questions.reduce((sum, q) => sum + (q.points || 0), 0);
            const badge = UI.$('detailMarksBadge');
            if (badge) badge.textContent = `總分 ${totalMarks} 分`;

            // 渲染題目
            Views.renderQuestionsInto('detailQuestionsList', state.questions);
        } catch (e) {
            console.error('showDetail failed:', e);
            if (listEl) listEl.innerHTML = '<div class="loading-text" style="color:#ef4444;">載入失敗</div>';
        }
    }

    // ================================================================
    // Similar Mode — 相似題生成模式
    // ================================================================

    function switchMode(mode) {
        state.mode = mode;

        // Toggle pill buttons
        document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Toggle config panels
        const genPanel = UI.$('generateConfig');
        const simPanel = UI.$('similarConfig');
        if (genPanel) genPanel.style.display = mode === 'generate' ? '' : 'none';
        if (simPanel) simPanel.style.display = mode === 'similar' ? '' : 'none';
    }

    function switchInputMethod(method) {
        state.inputMethod = method;

        document.querySelectorAll('.input-method-toggle .method-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.method === method);
        });

        const textGroup = UI.$('similarTextInput');
        const imageGroup = UI.$('similarImageInput');
        if (textGroup) textGroup.style.display = method === 'text' ? '' : 'none';
        if (imageGroup) imageGroup.style.display = method === 'image' ? '' : 'none';
    }

    function setupUploadZone() {
        const zone = UI.$('uploadZone');
        const fileInput = UI.$('similarImageFile');
        if (!zone || !fileInput) return;

        // Click → open file picker
        zone.addEventListener('click', () => fileInput.click());

        // Drag events
        zone.addEventListener('dragover', e => {
            e.preventDefault();
            zone.classList.add('drag-over');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('drag-over');
        });
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) handleImageFile(file);
        });

        // File input change
        fileInput.addEventListener('change', () => {
            if (fileInput.files[0]) handleImageFile(fileInput.files[0]);
        });
    }

    function handleImageFile(file) {
        if (file.size > 10 * 1024 * 1024) {
            if (window.UIModule) UIModule.toast('圖片大小超過 10MB 限制', 'warning');
            return;
        }
        state.uploadedFile = file;

        // Show preview using existing HTML structure
        const previewEl = UI.$('uploadPreview');
        const previewImg = UI.$('previewImg');
        const zone = UI.$('uploadZone');
        if (previewEl && previewImg) {
            const reader = new FileReader();
            reader.onload = e => {
                previewImg.src = e.target.result;
                previewEl.style.display = '';
            };
            reader.readAsDataURL(file);
        }
        if (zone) zone.style.display = 'none';

        // Show OCR button
        const ocrBtn = UI.$('ocrBtn');
        if (ocrBtn) ocrBtn.style.display = '';
    }

    function removeUploadedImage() {
        state.uploadedFile = null;
        const previewEl = UI.$('uploadPreview');
        const previewImg = UI.$('previewImg');
        const zone = UI.$('uploadZone');
        const ocrBtn = UI.$('ocrBtn');
        const fileInput = UI.$('similarImageFile');

        if (previewImg) previewImg.src = '';
        if (previewEl) previewEl.style.display = 'none';
        if (zone) zone.style.display = '';
        if (ocrBtn) ocrBtn.style.display = 'none';
        if (fileInput) fileInput.value = '';
    }

    async function ocrImage() {
        if (!state.uploadedFile) {
            if (window.UIModule) UIModule.toast('請先上傳圖片', 'warning');
            return;
        }

        const subject = UI.$('similarSubject')?.value || 'math';
        const formData = new FormData();
        formData.append('image', state.uploadedFile);
        formData.append('subject', subject);

        // Loading state
        const ocrBtn = UI.$('ocrBtn');
        const ocrLoading = UI.$('ocrLoading');
        if (ocrBtn) ocrBtn.style.display = 'none';
        if (ocrLoading) ocrLoading.style.display = '';

        try {
            const resp = await API.ocrImage(formData);

            if (resp.success && resp.data) {
                const textarea = UI.$('similarQuestionText');
                if (textarea) {
                    textarea.value = resp.data.ocr_text || '';
                    textarea.focus();
                }

                // Show warning if any
                if (resp.data.warning) {
                    if (window.UIModule) UIModule.toast(resp.data.warning, 'warning');
                } else {
                    if (window.UIModule) UIModule.toast('OCR 識別完成，請確認文字後生成', 'success');
                }

                // Switch to text view so teacher can edit
                switchInputMethod('text');
            } else {
                if (window.UIModule) UIModule.toast(resp.message || 'OCR 識別失敗', 'error');
            }
        } catch (e) {
            console.error('OCR failed:', e);
            if (window.UIModule) UIModule.toast('OCR 請求失敗', 'error');
        } finally {
            if (ocrLoading) ocrLoading.style.display = 'none';
            if (ocrBtn) ocrBtn.style.display = '';
        }
    }

    async function generateSimilar() {
        const subject = UI.$('similarSubject')?.value || 'math';
        const questionText = (UI.$('similarQuestionText')?.value || '').trim();
        const count = parseInt(UI.$('similarCount')?.value) || 3;

        if (!questionText || questionText.length < 5) {
            if (window.UIModule) UIModule.toast('請輸入至少 5 個字的題目文字', 'warning');
            return;
        }

        const btn = UI.$('similarGenerateBtn');
        if (btn) { btn.disabled = true; btn.textContent = '正在提交...'; }

        try {
            const resp = await API.generateSimilar({
                subject,
                question_text: questionText,
                count,
                difficulty_variation: true,
            });

            if (resp.success && resp.data) {
                state.sessionId = resp.data.session_id;
                savePendingSession(resp.data.session_id);
                if (window.UIModule) UIModule.toast('相似題生成任務已啟動', 'success');
                showView('history');
            } else {
                if (window.UIModule) UIModule.toast('啟動失敗：' + (resp.message || ''), 'error');
            }
        } catch (e) {
            console.error('generateSimilar failed:', e);
            if (window.UIModule) UIModule.toast('請求失敗', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    生成相似題`;
            }
        }
    }

    // ================================================================
    // App — 初始化 + 事件綁定
    // ================================================================

    function init() {
        // Auth check
        state.token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        state.username = localStorage.getItem('username') || '';
        if (!state.token) {
            window.location.href = '/login';
            return;
        }

        const badge = UI.$('userBadge');
        if (badge) badge.textContent = state.username;

        // Difficulty buttons
        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.difficulty = parseInt(btn.dataset.diff);
            });
        });

        // Question count slider
        const slider = UI.$('questionCount');
        const sliderVal = UI.$('questionCountVal');
        if (slider) {
            slider.addEventListener('input', () => {
                sliderVal.textContent = slider.value;
            });
        }

        // Subject change → reload knowledge points + toggle geometry group
        const subjectSelect = UI.$('subjectSelect');
        if (subjectSelect) {
            subjectSelect.addEventListener('change', () => {
                loadKnowledgePoints(subjectSelect.value);
                toggleGeometryGroup(subjectSelect.value);
            });
        }

        // Load initial knowledge points + show geometry group for math
        loadKnowledgePoints('math');
        toggleGeometryGroup('math');

        // Mode toggle — AI 出題 / 相似題
        document.querySelectorAll('#modeToggle .mode-btn').forEach(btn => {
            btn.addEventListener('click', () => switchMode(btn.dataset.mode));
        });

        // Input method toggle — 文字 / 圖片
        document.querySelectorAll('.input-method-toggle .method-btn').forEach(btn => {
            btn.addEventListener('click', () => switchInputMethod(btn.dataset.method));
        });

        // Similar count slider
        const simSlider = UI.$('similarCount');
        const simSliderVal = UI.$('similarCountVal');
        if (simSlider && simSliderVal) {
            simSlider.addEventListener('input', () => {
                simSliderVal.textContent = simSlider.value;
            });
        }

        // Upload zone drag-drop
        setupUploadZone();

        // 檢查 pending session → 自動跳歷史
        const pending = loadPendingSession();
        if (pending) {
            showView('history');
        }
    }

    async function loadKnowledgePoints(subject) {
        UI.$('pointsList').innerHTML = '<div class="loading-text">載入知識點...</div>';
        try {
            const resp = await API.getKnowledgePoints(subject);
            if (resp.success && resp.data) {
                state.knowledgePoints = resp.data;
                Views.renderKnowledgePoints(resp.data);
            } else {
                UI.$('pointsList').innerHTML = '<div class="loading-text">載入失敗</div>';
            }
        } catch (e) {
            console.error('Failed to load knowledge points:', e);
            UI.$('pointsList').innerHTML = '<div class="loading-text">載入失敗</div>';
        }
    }

    // ================================================================
    // Geometry — 幾何描述區塊（數學專用）
    // ================================================================

    function toggleGeometryGroup(subject) {
        const group = UI.$('mathGeometryGroup');
        if (group) group.style.display = subject === 'math' ? '' : 'none';
    }

    async function generateGeometry() {
        const desc = (UI.$('geometryDesc')?.value || '').trim();
        if (!desc) {
            if (window.UIModule) UIModule.toast('請輸入幾何描述', 'warning');
            return;
        }

        const btn = UI.$('generateGeoBtn');
        if (btn) { btn.disabled = true; btn.textContent = '生成中...'; }

        try {
            const resp = await fetch('/api/exam-creator/generate-geometry', {
                method: 'POST',
                headers: API._headers(),
                body: JSON.stringify({ description: desc }),
            });
            const result = await resp.json();

            if (result.success && result.data) {
                state.pendingGeometry = result.data;
                // 渲染預覽
                const preview = UI.$('geoPreview');
                if (preview) preview.style.display = '';
                if (window.JSXGraphRenderer) {
                    try {
                        JSXGraphRenderer.destroy('geoPreviewBoard');
                    } catch (_) {}
                    JSXGraphRenderer.render('geoPreviewBoard', result.data);
                }
                if (window.UIModule) UIModule.toast('幾何圖形已生成', 'success');
            } else {
                if (window.UIModule) UIModule.toast(result.message || '生成失敗', 'error');
            }
        } catch (e) {
            console.error('generateGeometry failed:', e);
            if (window.UIModule) UIModule.toast('請求失敗', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                    預覽幾何圖形`;
            }
        }
    }

    async function exportDocx(index) {
        const q = state.questions[index];
        if (!q) return;

        try {
            const resp = await fetch('/api/exam-creator/export-docx', {
                method: 'POST',
                headers: API._headers(),
                body: JSON.stringify({
                    question: q.question || '',
                    correct_answer: q.correct_answer || '',
                    marking_scheme: q.marking_scheme || '',
                    points: q.points || null,
                    question_type: q.question_type || 'short_answer',
                    options: q.options || null,
                }),
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                if (window.UIModule) UIModule.toast(err.message || 'DOCX 導出失敗', 'error');
                return;
            }

            // 觸發下載
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `題目${index + 1}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('exportDocx failed:', e);
            if (window.UIModule) UIModule.toast('導出失敗', 'error');
        }
    }

    // ================================================================
    // Actions — 生成 / 編輯 / 刪除
    // ================================================================

    async function generate() {
        const subject = UI.$('subjectSelect').value;
        const questionCount = parseInt(UI.$('questionCount').value);
        const totalMarks = UI.$('totalMarks').value ? parseInt(UI.$('totalMarks').value) : null;
        const examContext = UI.$('examContext').value.trim();

        // Collect selected points
        const selectedPoints = [];
        document.querySelectorAll('#pointsList input[type="checkbox"]:checked').forEach(cb => {
            selectedPoints.push(cb.value);
        });

        // Collect question types
        const questionTypes = [];
        document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked').forEach(cb => {
            questionTypes.push(cb.value);
        });

        // Disable button
        const btn = UI.$('generateBtn');
        btn.disabled = true;
        btn.textContent = '正在提交...';

        try {
            const geometryDesc = (UI.$('geometryDesc')?.value || '').trim();

            const resp = await API.generate({
                subject,
                question_count: questionCount,
                difficulty: state.difficulty,
                target_points: selectedPoints.length ? selectedPoints : null,
                question_types: questionTypes.length ? questionTypes : null,
                exam_context: examContext,
                total_marks: totalMarks,
                geometry_description: geometryDesc || '',
            });

            if (resp.success && resp.data) {
                state.sessionId = resp.data.session_id;
                savePendingSession(resp.data.session_id);
                if (window.UIModule) UIModule.toast('試卷已開始生成', 'success');
                showView('history');
            } else {
                if (window.UIModule) {
                    UIModule.toast('啟動失敗：' + (resp.message || '未知錯誤'), 'error');
                } else {
                    alert('啟動失敗：' + (resp.message || '未知錯誤'));
                }
            }
        } catch (e) {
            console.error('Generate failed:', e);
            if (window.UIModule) {
                UIModule.toast('請求失敗，請檢查網路連線', 'error');
            } else {
                alert('請求失敗，請檢查網路連線');
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                AI 生成試卷`;
        }
    }

    function startPolling() {
        const interval = 3000;
        let attempts = 0;
        const totalCount = parseInt(UI.$('questionCount').value) || 5;

        function updateProgress(completed, total) {
            const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
            const bar = UI.$('progressBarFill');
            const text = UI.$('progressText');
            if (bar) bar.style.width = pct + '%';
            if (text) text.textContent = `已完成 ${completed} / ${total} 題`;
        }

        function poll() {
            attempts++;
            API.getStatus(state.sessionId).then(resp => {
                if (!resp.success || !resp.data) {
                    if (attempts < 200) {
                        state.pollTimer = setTimeout(poll, interval);
                    }
                    return;
                }

                const data = resp.data;
                if (data.status === 'generated') {
                    updateProgress(data.question_count, data.question_count);
                    setTimeout(() => {
                        state.questions = data.questions || [];
                        Views.showState('questionsContainer');
                        Views.renderQuestions(state.questions);
                        UI.$('totalMarksBadge').textContent = `總分 ${data.total_marks || 0} 分`;
                    }, 500);
                } else if (data.status === 'generation_failed') {
                    UI.$('errorMessage').textContent = data.error_message || '生成過程出錯';
                    Views.showState('errorState');
                } else {
                    const completed = data.completed_count || 0;
                    const total = data.question_count || totalCount;
                    updateProgress(completed, total);
                    state.pollTimer = setTimeout(poll, interval);
                }
            }).catch(e => {
                console.error('Poll error:', e);
                if (attempts < 200) {
                    state.pollTimer = setTimeout(poll, interval);
                }
            });
        }

        updateProgress(0, totalCount);
        poll();
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function retry() {
        stopPolling();
        if (window.JSXGraphRenderer) JSXGraphRenderer.destroyAll();
        showView('config');
    }

    async function deleteSession(sessionId) {
        if (!window.UIModule) {
            if (!confirm('確定要刪除這份試卷嗎？')) return;
        } else {
            const ok = await UIModule.confirm('確定要刪除這份試卷嗎？');
            if (!ok) return;
        }

        try {
            const resp = await fetch(`/api/exam-creator/${sessionId}`, {
                method: 'DELETE',
                headers: API._headers(),
            });
            const result = await resp.json();

            if (result.success) {
                const card = UI.$(`card-${sessionId}`);
                if (card) {
                    card.style.transition = 'opacity 0.3s, transform 0.3s';
                    card.style.opacity = '0';
                    card.style.transform = 'translateX(20px)';
                    setTimeout(() => card.remove(), 300);
                }
                if (window.UIModule) UIModule.toast('已刪除', 'info');
            } else {
                if (window.UIModule) UIModule.toast(result.message || '刪除失敗', 'error');
            }
        } catch (e) {
            console.error('Delete failed:', e);
            if (window.UIModule) UIModule.toast('刪除失敗', 'error');
        }
    }

    // ---- Edit Modal ----

    function openEditModal(index) {
        const q = state.questions[index];
        if (!q) return;
        state.editingIndex = index;

        UI.$('editQuestion').value = q.question || '';
        UI.$('editAnswer').value = q.correct_answer || '';
        UI.$('editMarking').value = q.marking_scheme || '';
        UI.$('editPoints').value = q.points || 0;
        UI.$('editType').value = q.question_type || 'short_answer';

        UI.show('editModal');
    }

    function closeEditModal() {
        UI.hide('editModal');
        state.editingIndex = -1;
    }

    async function saveEdit() {
        const i = state.editingIndex;
        if (i < 0) return;

        const edits = {
            question: UI.$('editQuestion').value,
            correct_answer: UI.$('editAnswer').value,
            marking_scheme: UI.$('editMarking').value,
            points: parseInt(UI.$('editPoints').value) || 0,
            question_type: UI.$('editType').value,
        };

        try {
            const resp = await API.updateQuestion(state.sessionId, i, edits);
            if (resp.success) {
                Object.assign(state.questions[i], edits);
                // 根據當前視圖渲染到對應容器
                const containerId = state.view === 'detail' ? 'detailQuestionsList' : 'questionsList';
                Views.renderQuestionsInto(containerId, state.questions);
                const totalMarks = state.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                const badgeId = state.view === 'detail' ? 'detailMarksBadge' : 'totalMarksBadge';
                const badge = UI.$(badgeId);
                if (badge) badge.textContent = `總分 ${totalMarks} 分`;
                closeEditModal();
            } else {
                if (window.UIModule) UIModule.toast('保存失敗：' + (resp.message || ''), 'error');
                else alert('保存失敗：' + (resp.message || ''));
            }
        } catch (e) {
            console.error('Save edit failed:', e);
            if (window.UIModule) UIModule.toast('保存失敗', 'error');
            else alert('保存失敗');
        }
    }

    // ---- Regenerate Single ----

    async function regenerate(index) {
        const card = document.getElementById(`qcard-${index}`);
        if (card) card.classList.add('regenerating');

        try {
            const resp = await API.regenerateQuestion(state.sessionId, index, '');
            if (resp.success && resp.data) {
                state.questions[index] = resp.data;
                const containerId = state.view === 'detail' ? 'detailQuestionsList' : 'questionsList';
                Views.renderQuestionsInto(containerId, state.questions);
                const totalMarks = state.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                const badgeId = state.view === 'detail' ? 'detailMarksBadge' : 'totalMarksBadge';
                const badge = UI.$(badgeId);
                if (badge) badge.textContent = `總分 ${totalMarks} 分`;
            } else {
                if (window.UIModule) UIModule.toast('重新生成失敗：' + (resp.message || ''), 'error');
                else alert('重新生成失敗：' + (resp.message || ''));
                if (card) card.classList.remove('regenerating');
            }
        } catch (e) {
            console.error('Regenerate failed:', e);
            if (window.UIModule) UIModule.toast('重新生成失敗', 'error');
            else alert('重新生成失敗');
            if (card) card.classList.remove('regenerating');
        }
    }

    // ---- Print ----

    function printExam() {
        window.print();
    }

    // ================================================================
    // Bootstrap
    // ================================================================
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        // 原有
        generate,
        retry,
        openEditModal,
        closeEditModal,
        saveEdit,
        regenerate,
        printExam,
        // 歷史/詳情導航
        showHistory: () => showView('history'),
        showDetail,
        showConfig: () => showView('config'),
        deleteSession,
        // 幾何預覽 + DOCX 導出
        generateGeometry,
        exportDocx,
        // 相似題模式
        switchMode,
        switchInputMethod,
        removeUploadedImage,
        ocrImage,
        generateSimilar,
    };
})();
