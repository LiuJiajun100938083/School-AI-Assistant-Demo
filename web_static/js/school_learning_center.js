/**
 * 學校 AI 學習中心 — school_learning_center.js
 * ============================================================
 * 架構: SLC 命名空間 + API / UI / App 三物件模式
 */

window.slc = (() => {
    'use strict';

    // ── 狀態 ──
    const state = {
        subjects: [],
        currentSubject: null,
        currentGrade: null,
        currentTab: 'resources',
        contentTypeFilter: null,
        contents: [],
        knowledgeMap: { nodes: [], edges: [] },
        paths: [],
        aiMessages: [],
        aiStreaming: false,
        // 當前查看的內容（用於 AI 助教內容感知問答）
        currentContentId: null,
        currentContentTitle: null,
        pdfGoToPage: null,  // PDF.js goToPage 函數引用
        // Admin
        isAdmin: false,
        userRole: 'student',
        adminPanelOpen: false,
        adminTab: 'upload',
        adminNodes: [],
        uploadFile: null,
    };

    const GRADES = ['中一', '中二', '中三', '中四', '中五', '中六'];
    const ADMIN_API = '/api/admin/school-learning-center';

    // ── SVG 圖標系統（取代所有 emoji）──
    const _ICONS = {
        school:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
        books:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
        doc:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
        video:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><path d="M10 8l6 4-6 4V8z"/></svg>',
        link:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        article:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        image:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>',
        clip:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>',
        map:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>',
        path:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M6 9a9 9 0 0 0 9 9"/></svg>',
        pin:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
        target:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
        bulb:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
        eye:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        plus:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
        pkg:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
        gear:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
        clock:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        steps:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>',
        chat:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        person:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
        book:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
        download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
        chevron:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
        close:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        node:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/></svg>',
        upload:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
        menu:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>',
        arrow:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>',
        send:     '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
        expand:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        shrink:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        folder:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    };

    /** Return an inline SVG icon string. `name` = key in _ICONS, `size` = px (default 14). */
    function _icon(name, size) {
        const s = size || 14;
        const svg = _ICONS[name];
        if (!svg) return '';
        return svg.replace('<svg', `<svg width="${s}" height="${s}" class="slc-icon" style="display:inline-block;vertical-align:middle"`);
    }

    /** Emoji → icon name mapping for backend data that might contain emoji */
    const _EMOJI_TO_ICON = {
        '\u{1F4A1}': 'bulb',  '\u{1F4CC}': 'pin',   '\u{1F3AF}': 'target',
        '\u{1F4DA}': 'books', '\u{1F4C4}': 'doc',   '\u{1F3AC}': 'video',
        '\u{1F517}': 'link',  '\u{1F4DD}': 'article','\u{1F5BC}': 'image',
        '\u{1F4CE}': 'clip',  '\u{1F5FA}': 'map',
    };

    /** Convert an icon string (possibly emoji from backend) to safe SVG markup for HTML contexts */
    function _safeIcon(iconStr, fallback, size) {
        if (!iconStr) return _icon(fallback || 'bulb', size);
        const mapped = _EMOJI_TO_ICON[iconStr] || _EMOJI_TO_ICON[iconStr.replace(/\uFE0F/g, '')];
        if (mapped) return _icon(mapped, size);
        if (/[\u{1F000}-\u{1FFFF}]|[\u{2600}-\u{27BF}]|[\u{FE00}-\u{FE0F}]/u.test(iconStr)) {
            return _icon(fallback || 'bulb', size);
        }
        return iconStr;
    }

    // ── 獲取 Token ──
    function _getToken() {
        return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    }

    // ── API ──
    const API = {
        _headers() {
            return {
                'Authorization': `Bearer ${_getToken()}`,
                'Content-Type': 'application/json',
            };
        },

        async getSubjects() {
            const r = await fetch('/api/school-learning-center/subjects', { headers: this._headers() });
            const j = await r.json();
            if (!r.ok) console.error('getSubjects error:', r.status, j);
            return j.data || [];
        },

        async getContents(subjectCode, gradeLevel, contentType, page = 1, pageSize = 50) {
            const params = new URLSearchParams({ page, page_size: pageSize });
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            if (contentType) params.set('content_type', contentType);
            const r = await fetch(`/api/school-learning-center/contents?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getKnowledgeMap(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/school-learning-center/knowledge-map${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || { nodes: [], edges: [] };
        },

        async getPaths(subjectCode, gradeLevel) {
            const params = new URLSearchParams();
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            const qs = params.toString();
            const r = await fetch(`/api/school-learning-center/paths${qs ? '?' + qs : ''}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getPathDetail(pathId) {
            const r = await fetch(`/api/school-learning-center/paths/${pathId}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || null;
        },

        async getStats(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/school-learning-center/stats${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || {};
        },

        async searchContents(keyword, subjectCode) {
            const params = new URLSearchParams({ keyword });
            if (subjectCode) params.set('subject_code', subjectCode);
            const r = await fetch(`/api/school-learning-center/search?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        aiAskStream(question, subjectCode, contentId) {
            const body = { question };
            if (subjectCode) body.subject_code = subjectCode;
            if (contentId) body.content_id = contentId;
            return fetch('/api/school-learning-center/ai-ask-stream', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
        },

        // ── Admin APIs ──
        async adminUpload(formData) {
            const r = await fetch(`${ADMIN_API}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${_getToken()}` },
                body: formData,
            });
            return r.json();
        },

        async adminCreateContent(body) {
            const r = await fetch(`${ADMIN_API}/contents`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeleteContent(id) {
            const r = await fetch(`${ADMIN_API}/contents/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminCreateNode(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-nodes`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeleteNode(id) {
            const r = await fetch(`${ADMIN_API}/knowledge-nodes/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminCreateEdge(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-edges`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminBatchImportGraph(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-graph/batch-import`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminCreatePath(body) {
            const r = await fetch(`${ADMIN_API}/paths`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeletePath(id) {
            const r = await fetch(`${ADMIN_API}/paths/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminBatchImportPaths(body) {
            const r = await fetch(`${ADMIN_API}/paths/batch-import`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },
    };

    // ── UI ──
    const UI = {
        // --- 側邊欄 ---
        renderSubjects(subjects) {
            const list = document.getElementById('subjectList');
            if (!list) return;
            if (!subjects.length) {
                list.innerHTML = '<div class="slc-empty-state"><div class="slc-empty-state__icon">' + _icon('books', 28) + '</div><div>暫無科目資源</div></div>';
                return;
            }
            list.innerHTML = subjects.map(s => `
                <div class="slc-subject-item ${state.currentSubject?.subject_code === s.subject_code ? '--active' : ''}"
                     data-code="${s.subject_code}" onclick="slc.selectSubject('${s.subject_code}')">
                    <span class="slc-subject-item__icon">${_safeIcon(s.icon, 'books')}</span>
                    <span class="slc-subject-item__name">${s.subject_name}</span>
                    <span class="slc-subject-item__count">${s.content_count || 0}</span>
                </div>
            `).join('');
        },

        // --- 年級欄 ---
        renderGradeBar() {
            const bar = document.getElementById('gradeBar');
            if (!bar) return;
            const chips = ['全部', ...GRADES].map(g => {
                const isAll = g === '全部';
                const active = isAll ? !state.currentGrade : state.currentGrade === g;
                return `<button class="slc-grade-chip ${active ? '--active' : ''}"
                            onclick="slc.selectGrade(${isAll ? 'null' : `'${g}'`})">${g}</button>`;
            }).join('');
            bar.innerHTML = `<span class="slc-grade-bar__label">年級：</span>${chips}`;
        },

        // --- Tab ---
        setActiveTab(tab) {
            document.querySelectorAll('.slc-tab-btn').forEach(btn => {
                btn.classList.toggle('--active', btn.dataset.tab === tab);
            });
            document.querySelectorAll('.slc-tab-panel').forEach(panel => {
                panel.classList.toggle('--active', panel.id === `tab-${tab}`);
            });
        },

        // --- 教學資源（電子教科書目錄） ---
        renderEbookDirectory(items) {
            const nav = document.getElementById('slcEbookDirectory');
            if (!nav) return;
            if (!items || !items.length) {
                nav.innerHTML = '<p class="slc-ebook-nav-empty">該科目暫無教學資源</p>';
                return;
            }

            const typeIcon = { document: _icon('doc'), video_local: _icon('video'), video_external: _icon('link'), article: _icon('article'), image: _icon('image') };
            const typeLabel = { document: '文檔', video_local: '本地視頻', video_external: '外部視頻', article: '文章', image: '圖片' };

            // 按類型分組
            const grouped = {};
            items.forEach(item => {
                const t = item.content_type || 'document';
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(item);
            });

            const typeOrder = ['document', 'video_local', 'video_external', 'article', 'image'];
            let html = '';

            typeOrder.forEach(t => {
                if (!grouped[t] || !grouped[t].length) return;
                const icon = typeIcon[t] || _icon('clip');
                const label = typeLabel[t] || t;
                html += `<div class="slc-ebook-folder">
                    <div class="slc-ebook-folder-header">
                        <span class="slc-ebook-folder-arrow">${_icon('chevron', 12)}</span>
                        <span class="slc-ebook-folder-icon">${icon}</span>
                        <span class="slc-ebook-folder-name">${label} (${grouped[t].length})</span>
                    </div>
                    <ul class="slc-ebook-folder-items">`;
                grouped[t].forEach(item => {
                    html += `<li class="slc-ebook-item" data-id="${item.id}" data-type="${t}">
                        <span class="slc-ebook-item-icon">${icon}</span>
                        <span class="slc-ebook-item-title">${_escHtml(item.title)}</span>
                    </li>`;
                });
                html += `</ul></div>`;
            });

            nav.innerHTML = html;

            // 文件夾摺疊
            nav.querySelectorAll('.slc-ebook-folder-header').forEach(header => {
                header.addEventListener('click', () => {
                    header.closest('.slc-ebook-folder').classList.toggle('slc-ebook-folder--collapsed');
                });
            });

            // 點擊內容項 → 右側內嵌顯示
            nav.querySelectorAll('.slc-ebook-item').forEach(item => {
                item.addEventListener('click', () => {
                    nav.querySelectorAll('.slc-ebook-item').forEach(i => i.classList.remove('slc-ebook-item--active'));
                    item.classList.add('slc-ebook-item--active');
                    const contentId = item.getAttribute('data-id');
                    App.openContent(parseInt(contentId));
                });
            });
        },

        showResourceLoading() {
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) nav.innerHTML = '<p class="slc-ebook-nav-empty">加載中...</p>';
        },

        // --- 知識圖譜 ---
        renderKnowledgeMap(mapData) {
            const container = document.getElementById('knowledgeMapContainer');
            if (!container) return;

            container.innerHTML = '';
            const detail = document.createElement('div');
            detail.className = 'slc-node-detail';
            detail.id = 'nodeDetail';
            container.appendChild(detail);

            // Re-create tooltip element
            const tooltipEl = document.createElement('div');
            tooltipEl.className = 'slc-kg-tooltip';
            tooltipEl.id = 'slcKgTooltip';
            container.appendChild(tooltipEl);

            if (!mapData.nodes || !mapData.nodes.length) {
                container.innerHTML = `<div class="slc-map-empty"><div class="slc-map-empty__icon">${_icon('map', 40)}</div><div>該科目暫無知識圖譜</div></div>`;
                return;
            }

            const width = container.clientWidth;
            const height = container.clientHeight || 500;

            const svg = d3.select(container).insert('svg', ':first-child')
                .attr('width', width).attr('height', height);

            const g = svg.append('g');

            // Zoom (pan + scroll zoom, no drag on nodes)
            const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => g.attr('transform', e.transform));
            svg.call(zoom);

            const nodes = mapData.nodes.map(n => ({ ...n }));
            const nodeMap = new Map(nodes.map(n => [n.id, n]));

            const edges = (mapData.edges || []).filter(e =>
                nodeMap.has(e.source_node_id) && nodeMap.has(e.target_node_id)
            ).map(e => ({ ...e }));

            // --- Build hierarchy via BFS (包含 edges define parent→child) ---
            const inDegree = new Map(nodes.map(n => [n.id, 0]));
            const childrenMap = new Map(nodes.map(n => [n.id, []]));
            const adjacencyMap = new Map(nodes.map(n => [n.id, new Set()]));

            edges.forEach(e => {
                const s = e.source_node_id, t = e.target_node_id;
                adjacencyMap.get(s).add(t);
                adjacencyMap.get(t).add(s);
                const rel = e.relation_type || '';
                const label = e.label || '';
                if (rel === 'contains' || rel === 'includes' || rel === '包含' || label === '包含') {
                    inDegree.set(t, (inDegree.get(t) || 0) + 1);
                    childrenMap.get(s).push(t);
                }
            });

            // Roots = zero in-degree nodes
            const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);
            nodes.forEach(n => { n._depth = Infinity; });
            const queue = [];
            roots.forEach(r => { r._depth = 0; queue.push(r); });
            while (queue.length > 0) {
                const cur = queue.shift();
                (childrenMap.get(cur.id) || []).forEach(kidId => {
                    const kid = nodeMap.get(kidId);
                    if (kid && kid._depth > cur._depth + 1) {
                        kid._depth = cur._depth + 1;
                        queue.push(kid);
                    }
                });
            }
            // Orphans (no hierarchy edges) treated as depth 1
            nodes.forEach(n => { if (n._depth === Infinity) n._depth = 1; });

            // --- Radial layout ---
            const radii = [0, 140, 260, 360];
            const tierRadius = { 0: 26, 1: 18, 2: 14, 3: 11 };
            const tierIcon = { 0: 16, 1: 13, 2: 11, 3: 10 };
            const tierFont = { 0: 12, 1: 11, 2: 10, 3: 9 };

            // Count visible leaf descendants for angular allocation
            const _descCache = new Map();
            function leafCount(nodeId) {
                if (_descCache.has(nodeId)) return _descCache.get(nodeId);
                const kids = childrenMap.get(nodeId) || [];
                const count = kids.length === 0 ? 1 : kids.reduce((s, id) => s + leafCount(id), 0);
                _descCache.set(nodeId, count);
                return count;
            }

            function layoutCluster(root, cx, cy) {
                root.x = cx; root.y = cy;
                function placeChildren(parentId, centerAngle, arcSpan, depth) {
                    const kids = (childrenMap.get(parentId) || []).map(id => nodeMap.get(id)).filter(Boolean);
                    if (kids.length === 0) return;
                    const r = radii[Math.min(depth, radii.length - 1)] || (depth * 140);
                    const totalLeaves = kids.reduce((s, k) => s + leafCount(k.id), 0);
                    let angle = centerAngle - arcSpan / 2;
                    kids.forEach(kid => {
                        const weight = leafCount(kid.id) / totalLeaves;
                        const kidArc = arcSpan * weight;
                        const kidAngle = angle + kidArc / 2;
                        kid.x = cx + Math.cos(kidAngle) * r;
                        kid.y = cy + Math.sin(kidAngle) * r;
                        placeChildren(kid.id, kidAngle, kidArc, depth + 1);
                        angle += kidArc;
                    });
                }
                placeChildren(root.id, -Math.PI / 2, 2 * Math.PI, 1);
            }

            if (roots.length === 1) {
                layoutCluster(roots[0], 0, 0);
            } else if (roots.length > 1) {
                // Arrange clusters in a grid (2 columns) instead of a single row
                const maxR = radii[radii.length - 1] || 360;
                const clusterDiam = maxR * 2 + 80;
                const cols = Math.min(roots.length, Math.ceil(Math.sqrt(roots.length)));
                const rows = Math.ceil(roots.length / cols);
                const totalW = cols * clusterDiam;
                const totalH = rows * clusterDiam;
                roots.forEach((root, i) => {
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const cx = -totalW / 2 + clusterDiam / 2 + col * clusterDiam;
                    const cy = -totalH / 2 + clusterDiam / 2 + row * clusterDiam;
                    layoutCluster(root, cx, cy);
                });
            }
            _descCache.clear();

            // Place orphan nodes that have no parent and no children on a separate ring
            const placedIds = new Set();
            nodes.forEach(n => { if (n.x !== undefined && n.y !== undefined) placedIds.add(n.id); });
            const orphans = nodes.filter(n => !placedIds.has(n.id));
            if (orphans.length > 0) {
                const oRadius = (radii[radii.length - 1] || 400) + 80;
                orphans.forEach((n, i) => {
                    const angle = (2 * Math.PI * i) / orphans.length - Math.PI / 2;
                    n.x = Math.cos(angle) * oRadius;
                    n.y = Math.sin(angle) * oRadius;
                });
            }

            // --- Draw edges (static positions) ---
            const link = g.selectAll('.link')
                .data(edges).enter().append('line')
                .attr('class', 'link')
                .attr('stroke', d => {
                    const rel = d.relation_type || '';
                    if (rel === 'prerequisite') return '#F59E0B';
                    if (rel === 'related') return '#94A3B8';
                    return '#A7F3D0';
                })
                .attr('stroke-width', d => {
                    const rel = d.relation_type || '';
                    if (rel === 'includes' || rel === 'contains') return 1.8;
                    return 1.2;
                })
                .attr('stroke-opacity', 0.6)
                .attr('stroke-dasharray', d => {
                    const rel = d.relation_type || '';
                    if (rel === 'related') return '4,3';
                    if (rel === 'prerequisite') return '6,3';
                    return 'none';
                })
                .attr('x1', d => nodeMap.get(d.source_node_id).x)
                .attr('y1', d => nodeMap.get(d.source_node_id).y)
                .attr('x2', d => nodeMap.get(d.target_node_id).x)
                .attr('y2', d => nodeMap.get(d.target_node_id).y);

            // --- Edge labels ---
            const edgeLabel = g.selectAll('.edge-label')
                .data(edges).enter().append('text')
                .attr('class', 'edge-label')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', '9px')
                .attr('fill', d => {
                    const rel = d.relation_type || '';
                    if (rel === 'prerequisite') return '#B45309';
                    if (rel === 'related') return '#64748B';
                    return '#059669';
                })
                .attr('opacity', 0.8)
                .attr('pointer-events', 'none')
                .attr('x', d => {
                    const s = nodeMap.get(d.source_node_id), t = nodeMap.get(d.target_node_id);
                    return (s.x + t.x) / 2;
                })
                .attr('y', d => {
                    const s = nodeMap.get(d.source_node_id), t = nodeMap.get(d.target_node_id);
                    return (s.y + t.y) / 2 - 6;
                })
                .text(d => d.label || d.relation_type || '');

            // --- Draw nodes (static positions, no drag) ---
            const nodeGroup = g.selectAll('.node')
                .data(nodes).enter().append('g')
                .attr('class', 'node')
                .style('cursor', 'pointer')
                .attr('transform', d => `translate(${d.x},${d.y})`);

            // Glow ring for root nodes
            nodeGroup.filter(d => d._depth === 0)
                .append('circle')
                .attr('r', d => (tierRadius[0] || 28) + 6)
                .attr('fill', 'none')
                .attr('stroke', d => d.color || '#006633')
                .attr('stroke-width', 2.5)
                .attr('stroke-opacity', 0.35);

            nodeGroup.append('circle')
                .attr('r', d => tierRadius[Math.min(d._depth, 3)] || 14)
                .attr('fill', d => d.color || '#006633')
                .attr('stroke', '#fff')
                .attr('stroke-width', d => d._depth === 0 ? 3 : 2)
                .style('filter', d => `drop-shadow(0 2px ${d._depth === 0 ? 6 : 3}px rgba(0,0,0,0.2))`);

            nodeGroup.append('text')
                .text('◆')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', d => (tierIcon[Math.min(d._depth, 3)] || 12) + 'px')
                .attr('pointer-events', 'none');

            nodeGroup.append('text')
                .text(d => {
                    const maxLen = d._depth === 0 ? 10 : 8;
                    return d.title.length > maxLen ? d.title.slice(0, maxLen) + '…' : d.title;
                })
                .attr('text-anchor', 'middle')
                .attr('dy', d => (tierRadius[Math.min(d._depth, 3)] || 14) + 14)
                .attr('font-size', d => (tierFont[Math.min(d._depth, 3)] || 10) + 'px')
                .attr('font-weight', d => d._depth === 0 ? '600' : '400')
                .attr('fill', '#333')
                .attr('pointer-events', 'none');

            nodeGroup.on('click', (e, d) => UI.showNodeDetail(d));

            // --- Hover highlight + Tooltip ---
            let _hoverTimer = null;
            let _tooltipTimer = null;
            const tooltip = document.getElementById('slcKgTooltip');

            function edgeConnectsNode(d, nodeId) {
                return d.source_node_id === nodeId || d.target_node_id === nodeId;
            }

            function handleNodeHover(hoveredNode, isEntering) {
                if (!isEntering || !hoveredNode) {
                    nodeGroup.transition().duration(200).attr('opacity', 1);
                    link.transition().duration(200)
                        .attr('stroke-opacity', 0.6)
                        .attr('stroke-width', d => {
                            const rel = d.relation_type || '';
                            return (rel === 'includes' || rel === 'contains') ? 1.8 : 1.2;
                        });
                    edgeLabel.transition().duration(200).attr('opacity', 0.8);
                    return;
                }
                const neighbors = adjacencyMap.get(hoveredNode.id) || new Set();
                nodeGroup.transition().duration(200)
                    .attr('opacity', d => (d.id === hoveredNode.id || neighbors.has(d.id)) ? 1 : 0.15);
                link.transition().duration(200)
                    .attr('stroke-opacity', d => edgeConnectsNode(d, hoveredNode.id) ? 0.9 : 0.06)
                    .attr('stroke-width', d => edgeConnectsNode(d, hoveredNode.id) ? 3 : 1);
                edgeLabel.transition().duration(200)
                    .attr('opacity', d => edgeConnectsNode(d, hoveredNode.id) ? 1 : 0.1);
            }

            function showNodeTooltip(node, event) {
                if (!tooltip) return;
                const contents = node.contents || [];
                const neighborCount = (adjacencyMap.get(node.id) || new Set()).size;
                const desc = (node.description || '').substring(0, 80);
                tooltip.innerHTML = `
                    <div class="slc-kg-tooltip-title">${_safeIcon(node.icon, 'bulb')} ${_escHtml(node.title)}</div>
                    ${desc ? `<div class="slc-kg-tooltip-desc">${_escHtml(desc)}${node.description && node.description.length > 80 ? '...' : ''}</div>` : ''}
                    <div class="slc-kg-tooltip-meta">
                        ${contents.length > 0 ? `<span>${_icon('doc')} ${contents.length} 份資源</span>` : ''}
                        <span>${_icon('arrow')} ${neighborCount} 個相關節點</span>
                    </div>
                `;
                const rect = container.getBoundingClientRect();
                const mouseX = event.clientX - rect.left;
                const mouseY = event.clientY - rect.top;
                const tw = 240, th = tooltip.offsetHeight || 120;
                let left = mouseX + 16, top = mouseY - 10;
                if (left + tw > rect.width) left = mouseX - tw - 16;
                if (top + th > rect.height) top = rect.height - th - 8;
                if (top < 8) top = 8;
                tooltip.style.left = left + 'px';
                tooltip.style.top = top + 'px';
                tooltip.style.opacity = '1';
                tooltip.style.pointerEvents = 'auto';
            }

            function hideNodeTooltip() {
                _tooltipTimer = setTimeout(() => {
                    if (tooltip) {
                        tooltip.style.opacity = '0';
                        tooltip.style.pointerEvents = 'none';
                    }
                }, 200);
            }

            nodeGroup
                .on('mouseenter', (event, d) => {
                    clearTimeout(_hoverTimer);
                    clearTimeout(_tooltipTimer);
                    _hoverTimer = setTimeout(() => {
                        handleNodeHover(d, true);
                    }, 350);
                    _tooltipTimer = setTimeout(() => {
                        showNodeTooltip(d, event);
                    }, 500);
                })
                .on('mouseleave', () => {
                    clearTimeout(_hoverTimer);
                    handleNodeHover(null, false);
                    hideNodeTooltip();
                });

            // Center the view — auto-fit all nodes
            const xs = nodes.map(n => n.x).filter(v => v !== undefined);
            const ys = nodes.map(n => n.y).filter(v => v !== undefined);
            const graphW = (Math.max(...xs) - Math.min(...xs)) || 1;
            const graphH = (Math.max(...ys) - Math.min(...ys)) || 1;
            const graphCx = (Math.max(...xs) + Math.min(...xs)) / 2;
            const graphCy = (Math.max(...ys) + Math.min(...ys)) / 2;
            const fitScale = Math.min(width / (graphW + 200), height / (graphH + 200), 1.2);
            const initialTransform = d3.zoomIdentity
                .translate(width / 2 - graphCx * fitScale, height / 2 - graphCy * fitScale)
                .scale(fitScale);
            svg.call(zoom.transform, initialTransform);
        },

        showNodeDetail(node) {
            const panel = document.getElementById('nodeDetail');
            if (!panel) return;

            const contents = (node.contents || []);
            const resourcesHtml = contents.length
                ? contents.map(c => {
                    const pg = c.anchor?.type === 'page' ? c.anchor.value : 0;
                    return `
                    <div class="slc-node-resource-item" onclick="slc.openContent(${c.content_id}, '${c.content_type || 'document'}', ${pg})">
                        ${_icon('clip')} ${_escHtml(c.content_title || '資源')}
                        ${pg ? `<span style="color:var(--slc-primary);font-size:12px">第${pg}頁</span>` : ''}
                    </div>`;
                }).join('')
                : '<div style="font-size:13px;color:var(--slc-text-secondary)">暫無關聯資源</div>';

            // Find learning paths that reference this node
            const relatedPaths = (state.paths || []).filter(p =>
                (p.steps || []).some(s => s.node_id === node.id)
            );
            const pathsHtml = relatedPaths.length
                ? relatedPaths.map(p => `
                    <div class="slc-node-resource-item" onclick="slc.jumpToPath(${p.id})" style="cursor:pointer">
                        ${_icon('path')} ${_escHtml(p.title)}
                    </div>`).join('')
                : '<div style="font-size:13px;color:var(--slc-text-secondary)">暫無相關路徑</div>';

            panel.innerHTML = `
                <div class="slc-node-detail__header">
                    <span>${_safeIcon(node.icon, 'bulb', 18)}</span>
                    <span class="slc-node-detail__title">${_escHtml(node.title)}</span>
                    <button class="slc-node-detail__close" onclick="document.getElementById('nodeDetail').classList.remove('--visible')">${_icon('close', 16)}</button>
                </div>
                <div class="slc-node-detail__body">
                    <div class="slc-node-detail__desc">${_escHtml(node.description || '暫無描述')}</div>
                    <div class="slc-node-detail__resources">
                        <h4>${_icon('clip')} 關聯資源</h4>
                        ${resourcesHtml}
                    </div>
                    <div class="slc-node-detail__resources" style="margin-top:8px">
                        <h4>${_icon('path')} 相關學習路徑</h4>
                        ${pathsHtml}
                    </div>
                </div>
            `;
            panel.classList.add('--visible');
        },

        showMapLoading() {
            const container = document.getElementById('knowledgeMapContainer');
            if (container) container.innerHTML = '<div class="slc-loading"><div class="slc-loading__spinner"></div><div>加載知識圖譜...</div></div>';
        },

        // --- 學習路徑 ---
        renderPaths(paths) {
            const list = document.getElementById('pathList');
            if (!list) return;
            if (!paths.length) {
                list.innerHTML = `<div class="slc-empty-state"><div class="slc-empty-state__icon">${_icon('map', 40)}</div><div class="slc-empty-state__text">該科目暫無學習路徑</div></div>`;
                return;
            }
            list.innerHTML = paths.map(p => {
                const diffLabel = { beginner: '入門', intermediate: '進階', advanced: '高級' };
                const stepsCount = (p.steps || []).length;
                return `
                <div class="slc-path-card" data-path-id="${p.id}">
                    <div class="slc-path-card__header" onclick="slc.togglePathSteps(${p.id})">
                        <span class="slc-path-card__icon">${_safeIcon(p.icon, 'target')}</span>
                        <div class="slc-path-card__info">
                            <div class="slc-path-card__title">${_escHtml(p.title)}</div>
                            <div class="slc-path-card__desc">${_escHtml(p.description || '')}</div>
                        </div>
                        <div class="slc-path-card__meta">
                            <span class="slc-difficulty --${p.difficulty || 'beginner'}">${diffLabel[p.difficulty] || p.difficulty}</span>
                            <span class="slc-path-meta-item">${_icon('clock')} ${p.estimated_hours || 1}h</span>
                            <span class="slc-path-meta-item">${_icon('steps')} ${stepsCount} 步</span>
                        </div>
                        <button class="slc-path-card__toggle" id="toggleBtn-${p.id}">▼</button>
                    </div>
                    <div class="slc-path-card__steps" id="pathSteps-${p.id}"></div>
                </div>`;
            }).join('');
        },

        renderPathSteps(pathId, steps) {
            const container = document.getElementById(`pathSteps-${pathId}`);
            if (!container) return;

            if (!steps.length) {
                container.innerHTML = '<div style="padding:16px;color:var(--slc-text-secondary)">暫無步驟</div>';
                return;
            }

            container.innerHTML = `<div class="slc-step-timeline">${steps.map(s => {
                const contentLink = s.content_id
                    ? `<a class="slc-step-item__link" onclick="event.stopPropagation(); slc.openContent(${s.content_id}, '${s.content_type || 'document'}', ${s.anchor?.type === 'page' ? s.anchor.value : 0})">
                        ${_icon('clip')} ${_escHtml(s.content_title || '查看資源')}
                        ${s.anchor?.type === 'page' ? ` (第${s.anchor.value}頁)` : ''}
                       </a>`
                    : '';
                const nodeLink = s.node_id
                    ? `<a class="slc-step-item__link slc-step-item__link--node" onclick="event.stopPropagation(); slc.focusNode(${s.node_id})">
                        ${_icon('node')} 查看知識點
                       </a>`
                    : '';
                return `
                <div class="slc-step-item">
                    <div class="slc-step-item__title">${s.step_order + 1}. ${_escHtml(s.title)}</div>
                    <div class="slc-step-item__desc">${_escHtml(s.description || '')}</div>
                    <div class="slc-step-item__links">${contentLink}${nodeLink}</div>
                </div>`;
            }).join('')}</div>`;
        },

        showPathLoading() {
            const list = document.getElementById('pathList');
            if (list) list.innerHTML = '<div class="slc-loading"><div class="slc-loading__spinner"></div><div>加載學習路徑...</div></div>';
        },

        // --- AI 聊天 ---
        addAIMessage(role, content, opts = {}) {
            const container = document.getElementById('aiMessages');
            if (!container) return null;
            const msg = document.createElement('div');
            msg.className = `slc-ai-msg --${role}`;
            // 頭像
            const avatar = document.createElement('div');
            avatar.className = 'slc-ai-msg__avatar';
            if (role === 'assistant') {
                avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 10h.01"/><path d="M12 10h.01"/><path d="M16 10h.01"/></svg>';
            } else {
                avatar.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>';
            }
            msg.appendChild(avatar);
            // 氣泡
            const bubble = document.createElement('div');
            bubble.className = 'slc-ai-msg__bubble';
            if (opts.typing) {
                bubble.innerHTML = '<div class="slc-typing-indicator"><span></span><span></span><span></span></div>';
            } else {
                bubble.innerHTML = role === 'assistant' ? _renderMarkdown(content) : _escHtml(content);
            }
            msg.appendChild(bubble);
            container.appendChild(msg);
            container.scrollTop = container.scrollHeight;
            return msg;
        },

        // --- 內容查看器（內嵌版） ---
        closeEbookViewer() {
            const welcome = document.getElementById('slcEbookWelcome');
            const viewer = document.getElementById('slcEbookViewer');
            const bodyEl = document.getElementById('slcViewerBody');
            if (welcome) welcome.style.display = '';
            if (viewer) viewer.style.display = 'none';
            if (bodyEl) bodyEl.innerHTML = '';
            // 清除當前內容上下文
            state.currentContentId = null;
            state.currentContentTitle = null;
            state.pdfGoToPage = null;
            _updateAIContentContext();
            // 取消目錄高亮
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) nav.querySelectorAll('.slc-ebook-item').forEach(i => i.classList.remove('slc-ebook-item--active'));
        },

        // --- Header stats ---
        updateHeaderStats(stats) {
            const el = document.getElementById('headerStats');
            if (!el) return;
            const total = stats.total_contents || 0;
            const nodes = stats.total_nodes || 0;
            const paths = stats.total_paths || 0;
            el.textContent = `${total} 資源 · ${nodes} 知識點 · ${paths} 路徑`;
        },
    };

    // ── Admin UI ──
    const AdminUI = {
        showToast(message, type = 'info') {
            let toast = document.querySelector('.slc-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'slc-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.className = `slc-toast --${type}`;
            // Trigger reflow
            toast.offsetHeight;
            toast.classList.add('--visible');
            setTimeout(() => toast.classList.remove('--visible'), 2500);
        },

        updateSubjectLabel() {
            const label = document.getElementById('adminSubjectLabel');
            if (label) {
                label.textContent = state.currentSubject
                    ? `${_safeIcon(state.currentSubject.icon, 'books')} ${state.currentSubject.subject_name}`
                    : '— 未選科目 —';
            }
        },

        renderAdminContents(items) {
            const el = document.getElementById('slcContentsList');
            if (!el) return;
            if (!items || !items.length) {
                el.innerHTML = '<div class="slc-admin-empty">該科目暫無內容</div>';
                return;
            }
            const typeLabel = { document: _icon('doc'), video_local: _icon('video'), video_external: _icon('link'), article: _icon('article'), image: _icon('image') };
            el.innerHTML = items.map(c => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${typeLabel[c.content_type] || _icon('doc')} ${_escHtml(c.title)}</div>
                        <div class="slc-admin-list-item__meta">${c.grade_level || '通用'} · ${c.content_type} · ${_icon('eye')} ${c.view_count || 0}</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger --sm" onclick="slc.deleteContent(${c.id}, '${_escHtml(c.title).replace(/'/g, "\\'")}')">刪除</button>
                    </div>
                </div>
            `).join('');
        },

        renderAdminNodes(nodes) {
            const el = document.getElementById('slcNodesList');
            if (!el) return;
            if (!nodes || !nodes.length) {
                el.innerHTML = '<div class="slc-admin-empty">暫無知識節點</div>';
                return;
            }
            el.innerHTML = nodes.map(n => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${_safeIcon(n.icon, 'pin')} ${_escHtml(n.title)}</div>
                        <div class="slc-admin-list-item__meta">${_escHtml(n.description || '').substring(0, 50)}</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger --sm" onclick="slc.deleteNode(${n.id})">刪除</button>
                    </div>
                </div>
            `).join('');

            // 更新邊的下拉選項
            AdminUI.populateEdgeDropdowns(nodes);
        },

        populateEdgeDropdowns(nodes) {
            const source = document.getElementById('slcEdgeSource');
            const target = document.getElementById('slcEdgeTarget');
            [source, target].forEach(sel => {
                if (!sel) return;
                const val = sel.value;
                sel.innerHTML = '<option value="">選擇知識點</option>';
                nodes.forEach(n => {
                    sel.innerHTML += `<option value="${n.id}">${_escHtml(n.title)}</option>`;
                });
                sel.value = val;
            });
        },

        renderAdminPaths(paths) {
            const el = document.getElementById('slcPathsList');
            if (!el) return;
            if (!paths || !paths.length) {
                el.innerHTML = '<div class="slc-admin-empty">暫無學習路徑</div>';
                return;
            }
            const diffLabel = { beginner: '入門', intermediate: '進階', advanced: '高級' };
            el.innerHTML = paths.map(p => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${_safeIcon(p.icon, 'target')} ${_escHtml(p.title)}</div>
                        <div class="slc-admin-list-item__meta">${diffLabel[p.difficulty] || p.difficulty} · ${p.estimated_hours || 1}h · ${(p.steps || []).length} 步</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger --sm" onclick="slc.deletePath(${p.id})">刪除</button>
                    </div>
                </div>
            `).join('');
        },
    };

    // ── App 邏輯 ──
    const App = {
        async init() {
            console.log('[SLC] 學校學習中心初始化...');

            // 檢查登入
            if (!_getToken()) {
                window.location.href = '/login';
                return;
            }

            // 檢查角色 — 解碼 JWT
            App._detectRole();

            // 載入科目
            try {
                state.subjects = await API.getSubjects();
                UI.renderSubjects(state.subjects);

                // 嘗試從 URL 中讀取科目
                const urlParams = new URLSearchParams(window.location.search);
                const urlSubject = urlParams.get('subject');
                if (urlSubject && state.subjects.find(s => s.subject_code === urlSubject)) {
                    await App.selectSubject(urlSubject);
                } else if (state.subjects.length > 0) {
                    await App.selectSubject(state.subjects[0].subject_code);
                }
            } catch (e) {
                console.error('載入科目失敗:', e);
            }

            UI.renderGradeBar();

            // Admin 初始化
            if (state.isAdmin) {
                App._setupAdmin();
            }

            // Tab 切換
            document.querySelectorAll('.slc-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => App.switchTab(btn.dataset.tab));
            });

            // 搜索
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') App.doSearch();
                });
            }

            // 學科側邊欄折疊
            const collapseBtn = document.getElementById('slcSidebarCollapseBtn');
            if (collapseBtn) collapseBtn.addEventListener('click', App.toggleSidebarCollapse);
            // 恢復用戶偏好
            try {
                if (localStorage.getItem('slc_sidebar_collapsed') === '1') {
                    const sb = document.getElementById('slcSidebar');
                    if (sb) sb.classList.add('--collapsed');
                }
            } catch {}

            // 電子書側邊欄開關
            const sidebarToggle = document.getElementById('slcSidebarToggle');
            if (sidebarToggle) sidebarToggle.addEventListener('click', App.toggleEbookSidebar);
            const sidebarClose = document.getElementById('slcSidebarClose');
            if (sidebarClose) sidebarClose.addEventListener('click', App.closeEbookSidebar);

            // AI FAB
            const fab = document.getElementById('aiFab');
            if (fab) fab.addEventListener('click', App.toggleAIWindow);

            // AI 窗口按鈕
            const aiExpandBtn = document.getElementById('aiExpandBtn');
            if (aiExpandBtn) aiExpandBtn.addEventListener('click', App.toggleAIWindowSize);
            const aiCloseBtn = document.getElementById('aiCloseBtn');
            if (aiCloseBtn) aiCloseBtn.addEventListener('click', App.toggleAIWindow);

            // AI 發送
            const aiSendBtn = document.getElementById('aiSendBtn');
            if (aiSendBtn) aiSendBtn.addEventListener('click', App.sendAIMessage);

            const aiInput = document.getElementById('aiInput');
            if (aiInput) {
                aiInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        App.sendAIMessage();
                    }
                });
            }

            // AI 拖拽
            _setupAiWindowDrag();

            // AI 訊息區事件委託（頁碼跳轉 + 知識節點點擊）
            const aiMsgs = document.getElementById('aiMessages');
            if (aiMsgs) {
                aiMsgs.addEventListener('click', (e) => {
                    const pageRef = e.target.closest('.slc-ai-page-ref, .slc-ai-page-ref-btn');
                    if (pageRef) {
                        const page = parseInt(pageRef.dataset.page, 10);
                        if (!isNaN(page)) _navigatePdfToPage(page);
                        return;
                    }
                    const chip = e.target.closest('.slc-ai-node-chip');
                    if (chip) {
                        const nodeId = parseInt(chip.dataset.nodeId, 10);
                        if (!isNaN(nodeId)) App.focusNode(nodeId);
                    }
                });
            }

            console.log('[SLC] 學校學習中心初始化完成');
        },

        async selectSubject(subjectCode) {
            state.currentSubject = state.subjects.find(s => s.subject_code === subjectCode) || null;
            UI.renderSubjects(state.subjects);

            // 更新管理面板科目標籤
            if (state.isAdmin) AdminUI.updateSubjectLabel();

            // 更新 URL
            const url = new URL(window.location);
            url.searchParams.set('subject', subjectCode);
            window.history.replaceState({}, '', url);

            // 刷新當前 Tab 數據
            await App.loadCurrentTab();

            // 如果管理面板打開，刷新管理面板數據
            if (state.adminPanelOpen) {
                App.switchAdminTab(state.adminTab);
            }

            // 更新統計
            try {
                const stats = await API.getStats(subjectCode);
                UI.updateHeaderStats(stats);
            } catch (e) { /* ignore */ }
        },

        async selectGrade(grade) {
            state.currentGrade = grade;
            UI.renderGradeBar();
            await App.loadCurrentTab();
        },

        async switchTab(tab) {
            state.currentTab = tab;
            UI.setActiveTab(tab);
            await App.loadCurrentTab();
        },

        async loadCurrentTab() {
            const subjectCode = state.currentSubject?.subject_code;
            const grade = state.currentGrade;

            switch (state.currentTab) {
                case 'resources':
                    UI.showResourceLoading();
                    try {
                        state.contents = await API.getContents(subjectCode, grade, state.contentTypeFilter);
                        UI.renderEbookDirectory(state.contents);
                        // 自動展開側邊欄
                        App.openEbookSidebar();
                    } catch (e) {
                        console.error('載入資源失敗:', e);
                        UI.renderEbookDirectory([]);
                    }
                    break;
                case 'map':
                    UI.showMapLoading();
                    try {
                        state.knowledgeMap = await API.getKnowledgeMap(subjectCode);
                        UI.renderKnowledgeMap(state.knowledgeMap);
                    } catch (e) {
                        console.error('載入知識圖譜失敗:', e);
                    }
                    break;
                case 'paths':
                    UI.showPathLoading();
                    try {
                        state.paths = await API.getPaths(subjectCode, grade);
                        UI.renderPaths(state.paths);
                    } catch (e) {
                        console.error('載入學習路徑失敗:', e);
                        UI.renderPaths([]);
                    }
                    break;
            }
        },

        async filterByType(type) {
            state.contentTypeFilter = type === state.contentTypeFilter ? null : type;
            // Update type filter UI
            document.querySelectorAll('.slc-type-chip').forEach(chip => {
                chip.classList.toggle('--active', chip.dataset.type === state.contentTypeFilter);
            });
            if (state.currentTab === 'resources') {
                await App.loadCurrentTab();
            }
        },

        async doSearch() {
            const input = document.getElementById('searchInput');
            if (!input || !input.value.trim()) return;

            const keyword = input.value.trim();
            UI.showResourceLoading();
            try {
                const result = await API.searchContents(keyword, state.currentSubject?.subject_code);
                UI.renderEbookDirectory(result);
            } catch (e) {
                console.error('搜索失敗:', e);
            }
        },

        async togglePathSteps(pathId) {
            const stepsEl = document.getElementById(`pathSteps-${pathId}`);
            const toggleBtn = document.getElementById(`toggleBtn-${pathId}`);
            if (!stepsEl) return;

            const isExpanded = stepsEl.classList.contains('--expanded');
            if (isExpanded) {
                stepsEl.classList.remove('--expanded');
                if (toggleBtn) toggleBtn.classList.remove('--expanded');
            } else {
                // 載入步驟詳情
                try {
                    const detail = await API.getPathDetail(pathId);
                    if (detail && detail.steps) {
                        UI.renderPathSteps(pathId, detail.steps);
                    }
                } catch (e) {
                    console.error('載入路徑步驟失敗:', e);
                }
                stepsEl.classList.add('--expanded');
                if (toggleBtn) toggleBtn.classList.add('--expanded');
            }
        },

        // 跳轉到知識圖譜並聚焦某節點
        async focusNode(nodeId) {
            // 切到知識圖譜 Tab
            if (state.currentTab !== 'map') {
                await App.switchTab('map');
                // 等渲染完成
                await new Promise(r => setTimeout(r, 500));
            }
            // 在 SVG 中找到該節點並高亮 + 居中
            const container = document.getElementById('knowledgeMapContainer');
            if (!container) return;
            const svgEl = container.querySelector('svg');
            if (!svgEl) return;
            const nodeGroups = svgEl.querySelectorAll('g.node');
            let targetNode = null;
            let targetData = null;
            nodeGroups.forEach(ng => {
                const d = ng.__data__;
                if (d && d.id === nodeId) {
                    targetNode = ng;
                    targetData = d;
                }
            });
            if (!targetNode || !targetData) return;

            // 觸發 zoom 居中到該節點
            const width = svgEl.clientWidth || svgEl.getAttribute('width');
            const height = svgEl.clientHeight || svgEl.getAttribute('height');
            const zoomScale = 1.2;
            const tx = width / 2 - targetData.x * zoomScale;
            const ty = height / 2 - targetData.y * zoomScale;
            const transform = d3.zoomIdentity.translate(tx, ty).scale(zoomScale);
            d3.select(svgEl).transition().duration(600).call(
                d3.zoom().on('zoom', (e) => svgEl.querySelector('g').setAttribute('transform', e.transform)).transform,
                transform
            );

            // 閃爍高亮節點
            const circle = targetNode.querySelector('circle');
            if (circle) {
                const origStroke = circle.getAttribute('stroke');
                const origStrokeWidth = circle.getAttribute('stroke-width');
                let blinks = 0;
                const blinkInterval = setInterval(() => {
                    circle.setAttribute('stroke', blinks % 2 === 0 ? '#F59E0B' : origStroke);
                    circle.setAttribute('stroke-width', blinks % 2 === 0 ? '4' : origStrokeWidth);
                    blinks++;
                    if (blinks >= 6) {
                        clearInterval(blinkInterval);
                        circle.setAttribute('stroke', origStroke);
                        circle.setAttribute('stroke-width', origStrokeWidth);
                    }
                }, 300);
            }

            // 顯示節點詳情面板
            if (targetData) UI.showNodeDetail(targetData);
        },

        // 跳轉到學習路徑並展開
        async jumpToPath(pathId) {
            if (state.currentTab !== 'paths') {
                await App.switchTab('paths');
                await new Promise(r => setTimeout(r, 500));
            }
            const stepsEl = document.getElementById(`pathSteps-${pathId}`);
            if (stepsEl && !stepsEl.classList.contains('--expanded')) {
                await App.togglePathSteps(pathId);
            }
            // 滾動到該路徑
            const card = document.querySelector(`.slc-path-card[data-path-id="${pathId}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.outline = '2px solid var(--slc-primary)';
                card.style.outlineOffset = '2px';
                setTimeout(() => { card.style.outline = ''; card.style.outlineOffset = ''; }, 2000);
            }
        },

        async openContent(contentId, contentType, startPage) {
            const welcome = document.getElementById('slcEbookWelcome');
            const viewer = document.getElementById('slcEbookViewer');
            const titleEl = document.getElementById('slcViewerTitle');
            const descEl = document.getElementById('slcViewerDesc');
            const bodyEl = document.getElementById('slcViewerBody');

            if (!viewer || !bodyEl) return;

            // 確保在教學資源 Tab
            if (state.currentTab !== 'resources') {
                await App.switchTab('resources');
            }

            // 統一先拿內容詳情
            let data;
            try {
                const r = await fetch(`/api/school-learning-center/contents/${contentId}`, { headers: API._headers() });
                const j = await r.json();
                data = j.data;
            } catch (e) {
                console.error('載入內容失敗:', e);
                return;
            }
            if (!data) return;

            // 記錄當前查看的內容（供 AI 助教使用）
            state.currentContentId = contentId;
            state.currentContentTitle = data.title || '';
            state.pdfGoToPage = null;  // 重置，PDF 渲染後會重新設置
            _updateAIContentContext();

            // 隱藏歡迎頁，顯示查看器
            if (welcome) welcome.style.display = 'none';
            viewer.style.display = 'flex';

            // 設置標題 / 描述
            if (titleEl) titleEl.textContent = data.title || '';
            if (descEl) descEl.textContent = data.description || '';

            // 清空舊內容
            bodyEl.innerHTML = '';

            // 高亮目錄中的活躍項
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) {
                nav.querySelectorAll('.slc-ebook-item').forEach(i => {
                    i.classList.toggle('slc-ebook-item--active', i.getAttribute('data-id') == contentId);
                });
            }

            const _type = contentType || data.content_type || '';

            switch (_type) {
                case 'document': {
                    const fileUrl = _getFileUrl(data);
                    if (!fileUrl) {
                        bodyEl.innerHTML = '<p class="slc-ebook-error" style="padding:20px;">無法載入文件</p>';
                        break;
                    }
                    const isPdf = (data.mime_type || '').includes('pdf')
                        || (data.file_name || data.file_path || '').toLowerCase().endsWith('.pdf');

                    if (isPdf && window.pdfjsLib) {
                        // PDF.js — iPad/Safari 兼容
                        _renderPdfViewer(bodyEl, fileUrl, startPage || 1, data);
                    } else {
                        bodyEl.innerHTML = `
                            <iframe src="${_escHtml(fileUrl)}" style="width:100%;height:80vh;border:none;"></iframe>
                            <div style="text-align:center;margin-top:8px;">
                                <a href="${_escHtml(fileUrl)}" download="${_escHtml(data.title || 'download')}" style="color:var(--slc-primary);">下載文件</a>
                            </div>`;
                    }
                    break;
                }
                case 'video_external': {
                    const embedUrl = _parseVideoEmbed(data.external_url);
                    if (embedUrl) {
                        bodyEl.innerHTML = `<div class="slc-ebook-video-wrap">
                            <iframe class="slc-ebook-iframe" src="${_escHtml(embedUrl)}"
                                frameborder="0" allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                            </iframe>
                        </div>`;
                    } else {
                        bodyEl.innerHTML = `<p>外部視頻連結：<a href="${_escHtml(data.external_url || '')}" target="_blank" rel="noopener">${_escHtml(data.external_url || '無連結')}</a></p>`;
                    }
                    break;
                }
                case 'video_local': {
                    const fileUrl = _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<video class="slc-ebook-video" controls>
                            <source src="${_escHtml(fileUrl)}" type="${data.mime_type || 'video/mp4'}">
                            瀏覽器不支持視頻播放
                        </video>`;
                    } else {
                        bodyEl.innerHTML = '<p class="slc-ebook-error">無法載入視頻</p>';
                    }
                    break;
                }
                case 'article': {
                    const articleContent = data.article_content || data.description || '';
                    if (typeof marked !== 'undefined' && articleContent) {
                        const html = marked.parse(articleContent);
                        const clean = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
                        bodyEl.innerHTML = `<div class="slc-ebook-article">${clean}</div>`;
                    } else {
                        bodyEl.innerHTML = `<div class="slc-ebook-article">${_escHtml(articleContent) || '<p>暫無內容</p>'}</div>`;
                    }
                    break;
                }
                case 'image': {
                    const fileUrl = data.image_url || _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<img class="slc-ebook-image" src="${_escHtml(fileUrl)}" alt="${_escHtml(data.title || '')}" />`;
                    } else {
                        bodyEl.innerHTML = '<p class="slc-ebook-error">無法載入圖片</p>';
                    }
                    break;
                }
                default: {
                    const fileUrl = _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<p>檔案：<a href="${_escHtml(fileUrl)}" target="_blank" rel="noopener">${_escHtml(data.title || '下載')}</a></p>`;
                    } else {
                        bodyEl.innerHTML = `<div style="padding:20px;">${_escHtml(data.description || '暫無描述')}</div>`;
                    }
                }
            }
        },

        // --- 電子書側邊欄 ---
        openEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.add('slc-ebook--sidebar-open');
        },

        closeEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.remove('slc-ebook--sidebar-open');
        },

        toggleEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.toggle('slc-ebook--sidebar-open');
        },

        // --- AI 聊天 ---
        toggleAIWindow() {
            const win = document.getElementById('aiWindow');
            if (!win) return;
            const isVisible = win.classList.toggle('--visible');
            if (isVisible) {
                const subjectName = state.currentSubject?.subject_name || '學習';
                if (!state.aiMessages.length) {
                    UI.addAIMessage('assistant', `你好！我是 ${subjectName} 科目的 AI 助教，有什麼可以幫你的嗎？`);
                }
                document.getElementById('aiInput')?.focus();
            }
        },

        toggleAIWindowSize() {
            const win = document.getElementById('aiWindow');
            if (!win) return;
            const isExpanded = win.classList.toggle('--expanded');
            const btn = document.getElementById('aiExpandBtn');
            if (btn) {
                btn.innerHTML = isExpanded ? '&#9635;' : '&#9634;';
                btn.title = isExpanded ? '縮小' : '放大';
            }
        },

        async sendAIMessage() {
            if (state.aiStreaming) return;
            const input = document.getElementById('aiInput');
            if (!input || !input.value.trim()) return;

            const question = input.value.trim();
            input.value = '';
            state.aiStreaming = true;

            UI.addAIMessage('user', question);
            // 顯示打字動畫
            const assistantMsg = UI.addAIMessage('assistant', '', { typing: true });
            const bubble = assistantMsg?.querySelector('.slc-ai-msg__bubble');

            try {
                const response = await API.aiAskStream(
                    question,
                    state.currentSubject?.subject_code,
                    state.currentContentId,
                );

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let fullAnswer = '';
                let relatedNodes = null;
                let pageReferences = null;

                // 移除打字動畫，開始串流顯示
                if (bubble) {
                    bubble.innerHTML = '<span class="slc-streaming-text"></span><span class="slc-streaming-cursor">\u258D</span>';
                }
                const streamText = bubble?.querySelector('.slc-streaming-text');
                const messagesEl = document.getElementById('aiMessages');

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'token' && event.content) {
                                fullAnswer += event.content;
                                if (streamText) streamText.textContent = fullAnswer;
                                if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
                            } else if (event.type === 'done') {
                                pageReferences = event.page_references || [];
                                relatedNodes = event.related_nodes || [];
                            }
                        } catch (e) { /* skip */ }
                    }
                }

                // 串流完成：移除游標，渲染 Markdown + linkify
                const cursor = bubble?.querySelector('.slc-streaming-cursor');
                if (cursor) cursor.remove();

                if (bubble) {
                    if (fullAnswer) {
                        let html = _renderMarkdown(fullAnswer);
                        html = _linkifyPageReferences(html);
                        bubble.innerHTML = html;
                    } else {
                        bubble.innerHTML = '抱歉，暫時無法回答此問題。';
                    }
                }

                // 頁碼快捷按鈕
                if (pageReferences && pageReferences.length > 0) {
                    _renderPageReferences(assistantMsg, pageReferences);
                }
                // 相關知識節點
                if (relatedNodes && relatedNodes.length > 0) {
                    _renderRelatedNodes(assistantMsg, relatedNodes);
                }
            } catch (e) {
                console.error('AI 回答錯誤:', e);
                if (bubble) {
                    bubble.innerHTML = 'AI 助教暫時無法回答，請稍後再試。';
                }
            }

            state.aiStreaming = false;
            const container = document.getElementById('aiMessages');
            if (container) container.scrollTop = container.scrollHeight;
        },

        toggleMobileSidebar() {
            const sidebar = document.querySelector('.slc-sidebar');
            if (sidebar) sidebar.classList.toggle('--mobile-open');
        },

        toggleSidebarCollapse() {
            const sidebar = document.getElementById('slcSidebar');
            if (!sidebar) return;
            sidebar.classList.toggle('--collapsed');
            const collapsed = sidebar.classList.contains('--collapsed');
            try { localStorage.setItem('slc_sidebar_collapsed', collapsed ? '1' : ''); } catch {}
        },

        // ── Admin ──
        _detectRole() {
            const token = _getToken();
            if (!token) return;
            try {
                const parts = token.split('.');
                if (parts.length !== 3) return;
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                state.userRole = payload.role || 'student';
                state.isAdmin = ['teacher', 'admin'].includes(state.userRole);
            } catch (e) {
                console.warn('Token decode failed:', e);
            }
        },

        _setupAdmin() {
            // 顯示管理按鈕
            const btn = document.getElementById('slcAdminToggle');
            if (btn) btn.style.display = 'flex';

            // 文件上傳區事件
            const dropZone = document.getElementById('slcFileDropZone');
            const fileInput = document.getElementById('slcFileInput');
            if (dropZone && fileInput) {
                dropZone.addEventListener('click', () => fileInput.click());
                dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('--dragover'); });
                dropZone.addEventListener('dragleave', () => dropZone.classList.remove('--dragover'));
                dropZone.addEventListener('drop', e => {
                    e.preventDefault();
                    dropZone.classList.remove('--dragover');
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        state.uploadFile = e.dataTransfer.files[0];
                        const nameEl = document.getElementById('slcFileName');
                        if (nameEl) {
                            nameEl.innerHTML = `${_icon('clip')} ${_escHtml(state.uploadFile.name)} (${(state.uploadFile.size / 1024).toFixed(1)} KB)`;
                            nameEl.style.display = 'block';
                        }
                    }
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files && fileInput.files[0]) {
                        state.uploadFile = fileInput.files[0];
                        const nameEl = document.getElementById('slcFileName');
                        if (nameEl) {
                            nameEl.innerHTML = `${_icon('clip')} ${_escHtml(state.uploadFile.name)} (${(state.uploadFile.size / 1024).toFixed(1)} KB)`;
                            nameEl.style.display = 'block';
                        }
                    }
                });
            }
        },

        toggleAdminPanel() {
            state.adminPanelOpen = !state.adminPanelOpen;
            const panel = document.getElementById('slcAdminPanel');
            const overlay = document.getElementById('slcAdminOverlay');
            if (panel) panel.classList.toggle('--visible', state.adminPanelOpen);
            if (overlay) overlay.classList.toggle('--visible', state.adminPanelOpen);
            if (state.adminPanelOpen) {
                AdminUI.updateSubjectLabel();
                // 加載當前 admin tab 數據
                App.switchAdminTab(state.adminTab);
            }
        },

        switchAdminTab(tab) {
            state.adminTab = tab;
            // Update tab buttons
            document.querySelectorAll('.slc-admin-tab').forEach(btn => {
                btn.classList.toggle('--active', btn.dataset.adminTab === tab);
            });
            // Update panels
            document.querySelectorAll('.slc-admin-tab-panel').forEach(panel => {
                panel.classList.toggle('--active', panel.id === `adminTab-${tab}`);
            });

            // Load data
            if (tab === 'contents') App._loadAdminContents();
            if (tab === 'nodes') App._loadAdminNodes();
            if (tab === 'paths') App._loadAdminPaths();
        },

        onContentTypeChange() {
            const typeSelect = document.getElementById('slcContentType');
            const dropZone = document.getElementById('slcFileDropZone');
            const externalSection = document.getElementById('slcExternalVideoSection');
            const articleSection = document.getElementById('slcArticleSection');
            const type = typeSelect ? typeSelect.value : 'document';

            if (dropZone) dropZone.style.display = type === 'video_external' || type === 'article' ? 'none' : '';
            if (externalSection) externalSection.style.display = type === 'video_external' ? 'block' : 'none';
            if (articleSection) articleSection.style.display = type === 'article' ? 'block' : 'none';
        },

        async submitContent() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) {
                AdminUI.showToast('請先選擇一個科目', 'error');
                return;
            }

            const title = document.getElementById('slcContentTitle')?.value.trim();
            const desc = document.getElementById('slcContentDesc')?.value.trim() || '';
            const contentType = document.getElementById('slcContentType')?.value || 'document';
            const grade = document.getElementById('slcContentGrade')?.value || '';

            if (!title) {
                AdminUI.showToast('請輸入標題', 'error');
                return;
            }

            try {
                if (contentType === 'video_external') {
                    const extUrl = document.getElementById('slcExternalUrl')?.value.trim();
                    const platform = document.getElementById('slcVideoPlatform')?.value || '';
                    if (!extUrl) {
                        AdminUI.showToast('請輸入視頻連結', 'error');
                        return;
                    }
                    const formData = new FormData();
                    formData.append('title', title);
                    formData.append('description', desc);
                    formData.append('content_type', 'video_external');
                    formData.append('external_url', extUrl);
                    formData.append('tags', '');
                    formData.append('subject_code', subjectCode);
                    if (grade) formData.append('grade_level', grade);
                    if (platform) formData.append('video_platform', platform);

                    const r = await API.adminUpload(formData);
                    if (r.success) {
                        AdminUI.showToast('視頻連結上傳成功', 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '上傳失敗', 'error');
                    }
                } else if (contentType === 'article') {
                    const articleContent = document.getElementById('slcArticleContent')?.value.trim() || '';
                    const body = {
                        title, description: desc, content_type: 'article',
                        subject_code: subjectCode, article_content: articleContent,
                    };
                    if (grade) body.grade_level = grade;

                    const r = await API.adminCreateContent(body);
                    if (r.success) {
                        AdminUI.showToast('文章創建成功', 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '創建失敗', 'error');
                    }
                } else {
                    // 文件上傳
                    if (!state.uploadFile) {
                        AdminUI.showToast('請選擇文件', 'error');
                        return;
                    }
                    const formData = new FormData();
                    formData.append('file', state.uploadFile);
                    formData.append('title', title);
                    formData.append('description', desc);
                    formData.append('content_type', contentType);
                    formData.append('tags', '');
                    formData.append('subject_code', subjectCode);
                    if (grade) formData.append('grade_level', grade);

                    const r = await API.adminUpload(formData);
                    if (r.success) {
                        AdminUI.showToast(`${state.uploadFile.name} 上傳成功`, 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '上傳失敗', 'error');
                    }
                }
            } catch (e) {
                console.error('上傳失敗:', e);
                AdminUI.showToast('上傳失敗', 'error');
            }
        },

        _resetUploadForm() {
            const fields = ['slcContentTitle', 'slcContentDesc', 'slcExternalUrl', 'slcArticleContent'];
            fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            state.uploadFile = null;
            const nameEl = document.getElementById('slcFileName');
            if (nameEl) { nameEl.style.display = 'none'; nameEl.textContent = ''; }
            const fileInput = document.getElementById('slcFileInput');
            if (fileInput) fileInput.value = '';
        },

        async _loadAdminContents() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const items = await API.getContents(subjectCode, null, null, 1, 200);
                AdminUI.renderAdminContents(items);
            } catch (e) {
                console.error('載入管理內容失敗:', e);
            }
        },

        async deleteContent(id, title) {
            if (!confirm(`確定要刪除「${title}」嗎？`)) return;
            try {
                const r = await API.adminDeleteContent(id);
                if (r.success) {
                    AdminUI.showToast('已刪除', 'success');
                    App._loadAdminContents();
                    App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        // ── Knowledge Nodes ──
        async _loadAdminNodes() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const mapData = await API.getKnowledgeMap(subjectCode);
                state.adminNodes = mapData.nodes || [];
                AdminUI.renderAdminNodes(state.adminNodes);
            } catch (e) {
                console.error('載入節點失敗:', e);
            }
        },

        async submitNode() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const title = document.getElementById('slcNodeTitle')?.value.trim();
            const desc = document.getElementById('slcNodeDesc')?.value.trim() || '';
            const grade = document.getElementById('slcNodeGrade')?.value || '';

            if (!title) { AdminUI.showToast('請輸入知識點名稱', 'error'); return; }

            try {
                const body = { title, description: desc, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminCreateNode(body);
                if (r.success) {
                    AdminUI.showToast('知識節點已創建', 'success');
                    document.getElementById('slcNodeTitle').value = '';
                    document.getElementById('slcNodeDesc').value = '';
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '創建失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('創建失敗', 'error');
            }
        },

        async submitEdge() {
            const sourceId = document.getElementById('slcEdgeSource')?.value;
            const targetId = document.getElementById('slcEdgeTarget')?.value;
            const relType = document.getElementById('slcEdgeType')?.value.trim() || 'related';

            if (!sourceId || !targetId) { AdminUI.showToast('請選擇來源和目標節點', 'error'); return; }

            try {
                const body = {
                    source_node_id: parseInt(sourceId),
                    target_node_id: parseInt(targetId),
                    relation_type: relType,
                    label: relType,
                };
                const sourceNode = state.adminNodes.find(n => n.id == sourceId);
                if (sourceNode && sourceNode.subject_code) body.subject_code = sourceNode.subject_code;

                const r = await API.adminCreateEdge(body);
                if (r.success) {
                    AdminUI.showToast('連接已建立', 'success');
                    document.getElementById('slcEdgeType').value = 'related';
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '建立連接失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('建立連接失敗', 'error');
            }
        },

        async deleteNode(id) {
            if (!confirm('確定要刪除此知識節點嗎？')) return;
            try {
                const r = await API.adminDeleteNode(id);
                if (r.success) {
                    AdminUI.showToast('節點已刪除', 'success');
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        async submitBatchNodes() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const jsonStr = document.getElementById('slcBatchNodeJson')?.value.trim();
            const grade = document.getElementById('slcBatchNodeGrade')?.value || '';
            const clearExisting = document.getElementById('slcBatchClear')?.checked || false;
            const resultEl = document.getElementById('slcBatchNodeResult');

            if (!jsonStr) { AdminUI.showToast('請輸入 JSON 數據', 'error'); return; }

            let payload;
            try { payload = JSON.parse(jsonStr); } catch (e) {
                AdminUI.showToast('JSON 格式無效', 'error');
                if (resultEl) { resultEl.style.display = 'block'; resultEl.style.background = '#fce4ec'; resultEl.textContent = `JSON 解析失敗: ${e.message}`; }
                return;
            }

            if (!payload.nodes || !Array.isArray(payload.nodes) || !payload.nodes.length) {
                AdminUI.showToast('JSON 中必須包含 nodes 陣列', 'error');
                return;
            }

            if (clearExisting && !confirm('確定清空該科目所有知識點嗎？')) return;

            payload.clear_existing = clearExisting;
            if (!payload.edges) payload.edges = [];
            payload.subject_code = subjectCode;
            if (grade) payload.grade_level = grade;

            try {
                const r = await API.adminBatchImportGraph(payload);
                if (r.success) {
                    const d = r.data || {};
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.style.background = '#e8f5e9';
                        resultEl.innerHTML = `<strong>✅ 導入完成</strong><br>建立 ${d.created_nodes || 0} 節點、${d.created_edges || 0} 連接`;
                    }
                    AdminUI.showToast('批量導入成功', 'success');
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '導入失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('導入失敗', 'error');
            }
        },

        // ── Learning Paths ──
        async _loadAdminPaths() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const paths = await API.getPaths(subjectCode, null);
                AdminUI.renderAdminPaths(paths);
            } catch (e) {
                console.error('載入路徑失敗:', e);
            }
        },

        async submitPath() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const title = document.getElementById('slcPathTitle')?.value.trim();
            const desc = document.getElementById('slcPathDesc')?.value.trim() || '';
            const difficulty = document.getElementById('slcPathDifficulty')?.value || 'beginner';
            const hours = parseFloat(document.getElementById('slcPathHours')?.value) || 1;
            const grade = document.getElementById('slcPathGrade')?.value || '';

            if (!title) { AdminUI.showToast('請輸入路徑標題', 'error'); return; }

            try {
                const body = { title, description: desc, difficulty, estimated_hours: hours, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminCreatePath(body);
                if (r.success) {
                    AdminUI.showToast('學習路徑已創建', 'success');
                    document.getElementById('slcPathTitle').value = '';
                    document.getElementById('slcPathDesc').value = '';
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '創建失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('創建失敗', 'error');
            }
        },

        async deletePath(id) {
            if (!confirm('確定要刪除此學習路徑嗎？')) return;
            try {
                const r = await API.adminDeletePath(id);
                if (r.success) {
                    AdminUI.showToast('路徑已刪除', 'success');
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        async submitBatchPaths() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const jsonStr = document.getElementById('slcBatchPathJson')?.value.trim();
            const grade = document.getElementById('slcBatchPathGrade')?.value || '';
            const resultEl = document.getElementById('slcBatchPathResult');

            if (!jsonStr) { AdminUI.showToast('請輸入 JSON 數據', 'error'); return; }

            let paths;
            try { paths = JSON.parse(jsonStr); } catch (e) {
                AdminUI.showToast('JSON 格式無效', 'error');
                if (resultEl) { resultEl.style.display = 'block'; resultEl.style.background = '#fce4ec'; resultEl.textContent = `JSON 解析失敗: ${e.message}`; }
                return;
            }

            if (!Array.isArray(paths) || !paths.length) {
                AdminUI.showToast('JSON 必須是路徑陣列', 'error');
                return;
            }

            try {
                const body = { paths, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminBatchImportPaths(body);
                if (r.success) {
                    const d = r.data || {};
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.style.background = '#e8f5e9';
                        resultEl.innerHTML = `<strong>✅ 導入完成</strong><br>建立 ${d.created_paths || d.created || 0} 條路徑`;
                    }
                    AdminUI.showToast('批量導入成功', 'success');
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '導入失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('導入失敗', 'error');
            }
        },
    };

    // ── 工具函數 ──

    /** 從內容數據中獲取文件 URL */
    function _getFileUrl(content) {
        if (!content) return '';
        if (content.file_path) {
            return content.file_path.replace(/^uploads\//, '/uploads/');
        }
        return '';
    }

    /** 解析視頻外鏈為嵌入 URL */
    function _parseVideoEmbed(url) {
        if (!url) return '';
        // YouTube
        let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        if (m) return `https://www.youtube.com/embed/${m[1]}`;
        // Bilibili
        m = url.match(/bilibili\.com\/video\/(BV[\w]+)/);
        if (m) return `https://player.bilibili.com/player.html?bvid=${m[1]}&high_quality=1`;
        return url; // fallback: 直接用原始 URL
    }

    /** PDF.js 渲染器 — iPad/Safari 兼容 */
    async function _renderPdfViewer(container, fileUrl, startPage, content) {
        if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        container.innerHTML = `
            <div class="slc-pdf-viewer">
                <div class="slc-pdf-toolbar">
                    <button class="slc-pdf-btn" data-action="prev" title="上一頁">◀</button>
                    <span class="slc-pdf-page-info">
                        <input class="slc-pdf-page-input" type="number" min="1" value="1" />
                        <span>/ <span class="slc-pdf-total">-</span></span>
                    </span>
                    <button class="slc-pdf-btn" data-action="next" title="下一頁">▶</button>
                    <span class="slc-pdf-separator"></span>
                    <button class="slc-pdf-btn" data-action="zoomout" title="縮小">−</button>
                    <span class="slc-pdf-zoom-label">100%</span>
                    <button class="slc-pdf-btn" data-action="zoomin" title="放大">+</button>
                    <span class="slc-pdf-separator"></span>
                    <a href="${_escHtml(fileUrl)}" class="slc-pdf-btn" download="${_escHtml((content && content.title) || 'download')}" title="下載">${_icon('download', 16)}</a>
                </div>
                <div class="slc-pdf-scroll-area">
                    <div class="slc-pdf-pages"></div>
                </div>
                <div class="slc-pdf-loading">載入 PDF 中...</div>
            </div>`;

        const viewer = container.querySelector('.slc-pdf-viewer');
        const pagesContainer = viewer.querySelector('.slc-pdf-pages');
        const scrollArea = viewer.querySelector('.slc-pdf-scroll-area');
        const loadingEl = viewer.querySelector('.slc-pdf-loading');
        const pageInput = viewer.querySelector('.slc-pdf-page-input');
        const totalEl = viewer.querySelector('.slc-pdf-total');
        const zoomLabel = viewer.querySelector('.slc-pdf-zoom-label');

        let pdfDoc = null;
        let scale = 1.5;
        let currentPage = startPage || 1;
        const renderedPages = new Map();

        try {
            pdfDoc = await pdfjsLib.getDocument(fileUrl).promise;
        } catch (err) {
            console.error('[PDF.js] Failed to load:', err);
            loadingEl.textContent = 'PDF 載入失敗';
            return;
        }

        const numPages = pdfDoc.numPages;
        totalEl.textContent = numPages;
        pageInput.max = numPages;
        pageInput.value = currentPage;
        loadingEl.style.display = 'none';

        for (let i = 1; i <= numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'slc-pdf-page';
            pageDiv.dataset.page = i;
            pagesContainer.appendChild(pageDiv);
        }

        async function renderPage(pageNum) {
            if (renderedPages.has(pageNum) || !pdfDoc) return;
            renderedPages.set(pageNum, true);
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

        function renderVisiblePages() {
            const scrollTop = scrollArea.scrollTop;
            const scrollBottom = scrollTop + scrollArea.clientHeight;
            const pageDivs = pagesContainer.querySelectorAll('.slc-pdf-page');
            pageDivs.forEach(div => {
                const top = div.offsetTop;
                const bottom = top + (div.offsetHeight || 200);
                const pageNum = parseInt(div.dataset.page);
                if (bottom >= scrollTop - 500 && top <= scrollBottom + 500) {
                    renderPage(pageNum);
                }
            });
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

        async function goToPage(pageNum) {
            pageNum = Math.max(1, Math.min(numPages, pageNum));
            currentPage = pageNum;
            pageInput.value = pageNum;
            await renderPage(pageNum);
            const target = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // 暴露 goToPage 到 state，供 AI 助教頁碼跳轉使用
        state.pdfGoToPage = goToPage;

        async function rerender() {
            renderedPages.clear();
            pagesContainer.querySelectorAll('.slc-pdf-page').forEach(div => {
                div.innerHTML = '';
                div.style.minHeight = '200px';
            });
            zoomLabel.textContent = Math.round(scale / 1.5 * 100) + '%';
            await renderPage(currentPage);
            renderVisiblePages();
        }

        viewer.querySelector('.slc-pdf-toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'prev') goToPage(currentPage - 1);
            else if (action === 'next') goToPage(currentPage + 1);
            else if (action === 'zoomin') { scale = Math.min(4, scale + 0.3); rerender(); }
            else if (action === 'zoomout') { scale = Math.max(0.5, scale - 0.3); rerender(); }
        });

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

        let _scrollTimer = null;
        scrollArea.addEventListener('scroll', () => {
            if (_scrollTimer) clearTimeout(_scrollTimer);
            _scrollTimer = setTimeout(renderVisiblePages, 80);
        }, { passive: true });

        for (let i = 1; i <= Math.min(3, numPages); i++) {
            await renderPage(i);
        }
        if (startPage > 1) {
            setTimeout(() => goToPage(startPage), 100);
        }
    }

    /** 初始化 AI 聊天窗口拖拽行為 */
    function _setupAiWindowDrag() {
        const win = document.getElementById('aiWindow');
        const header = document.getElementById('aiWindowHeader');
        if (!win || !header) return;

        let dragState = null;
        let lastX = 0, lastY = 0, rafPending = false;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            e.preventDefault();
            const rect = win.getBoundingClientRect();
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            dragState = { offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top };
            win.style.transition = 'none';
            win.classList.add('--dragging');
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragState) return;
            lastX = e.clientX; lastY = e.clientY;
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
            win.classList.remove('--dragging');
            document.body.style.userSelect = '';
        });
    }

    /** 將 AI 回答中的【第X頁】轉為可點擊連結 */
    function _linkifyPageReferences(html) {
        return html.replace(
            /【第([\d,、\u2013\-]+)[页頁]】/g,
            (match, pages) => {
                const firstPage = parseInt(pages.replace(/[、\u2013\-]/g, ',').split(',')[0], 10);
                if (isNaN(firstPage)) return match;
                return `<span class="slc-ai-page-ref" data-page="${firstPage}" title="跳轉到第${firstPage}頁">${match}</span>`;
            }
        );
    }

    /** 更新 AI 聊天窗口中的內容上下文指示器 */
    function _updateAIContentContext() {
        const indicator = document.getElementById('slcAiContentContext');
        if (!indicator) return;
        if (state.currentContentId && state.currentContentTitle) {
            indicator.innerHTML = `
                <span class="slc-ai-content-context__label">${_icon('doc')} 正在查看：</span>
                <span class="slc-ai-content-context__title">${_escHtml(state.currentContentTitle)}</span>
                <button class="slc-ai-content-context__clear" onclick="slc.clearContentContext()" title="取消關聯">${_icon('close', 12)}</button>
            `;
            indicator.style.display = 'flex';
        } else {
            indicator.style.display = 'none';
        }
    }

    /** 渲染 AI 回覆中的頁碼引用按鈕 */
    function _renderPageReferences(msgElement, pageRefs) {
        if (!msgElement || !pageRefs || !pageRefs.length) return;
        const bubble = msgElement.querySelector('.slc-ai-msg__bubble');
        if (!bubble) return;

        // 去重頁碼
        const seen = new Set();
        const uniqueRefs = [];
        for (const ref of pageRefs) {
            const page = ref.page || ref.page_number;
            if (page && !seen.has(page)) {
                seen.add(page);
                uniqueRefs.push(ref);
            }
        }
        if (!uniqueRefs.length) return;

        const refsDiv = document.createElement('div');
        refsDiv.className = 'slc-ai-page-refs';
        refsDiv.innerHTML = `
            <div class="slc-ai-page-refs__label">${_icon('book')} 相關頁面：</div>
            <div class="slc-ai-page-refs__buttons">
                ${uniqueRefs.map(ref => {
                    const page = ref.page || ref.page_number;
                    return `<button class="slc-ai-page-ref-btn" data-page="${page}" title="${_escHtml(ref.snippet || '')}">第 ${page} 頁</button>`;
                }).join('')}
            </div>
        `;
        bubble.appendChild(refsDiv);
    }

    /** 渲染 AI 回覆中的相關知識節點 */
    function _renderRelatedNodes(msgElement, nodes) {
        if (!msgElement || !nodes || !nodes.length) return;
        const bubble = msgElement.querySelector('.slc-ai-msg__bubble');
        if (!bubble) return;

        const nodesDiv = document.createElement('div');
        nodesDiv.className = 'slc-ai-related-nodes';
        nodesDiv.innerHTML = `
            <div class="slc-ai-related-nodes__label">${_icon('link')} 相關知識點：</div>
            <div class="slc-ai-related-nodes__list">
                ${nodes.map(n => `<button class="slc-ai-node-chip" data-node-id="${n.id}" title="${_escHtml(n.title)}">${_safeIcon(n.icon, 'pin')} ${_escHtml(n.title)}</button>`).join('')}
            </div>
        `;
        bubble.appendChild(nodesDiv);
    }

    /** 跳轉到 PDF 指定頁碼 */
    function _navigatePdfToPage(pageNum) {
        if (state.pdfGoToPage) {
            state.pdfGoToPage(pageNum);
            AdminUI.showToast(`已跳轉到第 ${pageNum} 頁`, 'info');
            return;
        }
        // Fallback: 嘗試找到 PDF 容器中的頁面元素（內嵌查看器）
        const container = document.getElementById('slcViewerBody');
        if (container) {
            const target = container.querySelector(`[data-page="${pageNum}"]`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                AdminUI.showToast(`已跳轉到第 ${pageNum} 頁`, 'info');
                return;
            }
        }
        AdminUI.showToast('請先打開 PDF 文檔', 'info');
    }

    function _escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch {
            return dateStr;
        }
    }

    function _renderMarkdown(text) {
        if (!text) return '';
        if (typeof marked !== 'undefined') {
            try {
                const html = marked.parse(text);
                if (typeof DOMPurify !== 'undefined') {
                    return DOMPurify.sanitize(html);
                }
                return html;
            } catch {
                return _escHtml(text);
            }
        }
        return _escHtml(text).replace(/\n/g, '<br>');
    }

    // ── 公開 API ──
    return {
        state,
        _init: () => App.init(),
        selectSubject: (code) => App.selectSubject(code),
        selectGrade: (grade) => App.selectGrade(grade),
        switchTab: (tab) => App.switchTab(tab),
        filterByType: (type) => App.filterByType(type),
        doSearch: () => App.doSearch(),
        togglePathSteps: (id) => App.togglePathSteps(id),
        openContent: (id, type, page) => App.openContent(id, type, page),
        toggleAIWindow: () => App.toggleAIWindow(),
        toggleAIWindowSize: () => App.toggleAIWindowSize(),
        sendAIMessage: () => App.sendAIMessage(),
        closeModal: () => UI.closeEbookViewer(),
        toggleMobileSidebar: () => App.toggleMobileSidebar(),
        toggleSidebarCollapse: () => App.toggleSidebarCollapse(),
        toggleEbookSidebar: () => App.toggleEbookSidebar(),
        // AI 內容感知
        navigatePdfToPage: (page) => _navigatePdfToPage(page),
        clearContentContext: () => {
            state.currentContentId = null;
            state.currentContentTitle = null;
            state.pdfGoToPage = null;
            _updateAIContentContext();
        },
        // Admin
        toggleAdminPanel: () => App.toggleAdminPanel(),
        switchAdminTab: (tab) => App.switchAdminTab(tab),
        onContentTypeChange: () => App.onContentTypeChange(),
        submitContent: () => App.submitContent(),
        deleteContent: (id, title) => App.deleteContent(id, title),
        submitNode: () => App.submitNode(),
        submitEdge: () => App.submitEdge(),
        deleteNode: (id) => App.deleteNode(id),
        submitBatchNodes: () => App.submitBatchNodes(),
        submitPath: () => App.submitPath(),
        deletePath: (id) => App.deletePath(id),
        submitBatchPaths: () => App.submitBatchPaths(),
        focusNode: (nodeId) => App.focusNode(nodeId),
        jumpToPath: (pathId) => App.jumpToPath(pathId),
    };
})();
