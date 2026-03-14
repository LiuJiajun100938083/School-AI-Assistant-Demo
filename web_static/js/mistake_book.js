/**
 * AI 智能錯題本 — 前端核心模組 v2
 *
 * 架構：
 *   App        — 全局狀態管理與導航
 *   API        — 後端 API 封裝
 *   Icons      — SVG 圖標庫
 *   UI         — DOM 渲染工具
 *   Views      — 各頁面視圖渲染
 *   Upload     — 上傳面板邏輯
 *
 * 設計原則：
 *   - 產品級 UI，非 demo 風格
 *   - 克制、層次、真實、耐看
 *   - 統一 SVG 圖標，無 emoji
 */

'use strict';

/* ============================================================
   ICONS — SVG 圖標庫（Lucide 風格）
   ============================================================ */

const Icons = {
    _svg(paths, size = 16) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    },
    camera:    (s) => Icons._svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle>', s),
    edit:      (s) => Icons._svg('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>', s),
    chevronR:  (s) => Icons._svg('<polyline points="9 18 15 12 9 6"></polyline>', s),
    chevronL:  (s) => Icons._svg('<polyline points="15 18 9 12 15 6"></polyline>', s),
    chevronD:  (s) => Icons._svg('<polyline points="6 9 12 15 18 9"></polyline>', s),
    arrowR:    (s) => Icons._svg('<line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline>', s),
    check:     (s) => Icons._svg('<polyline points="20 6 9 17 4 12"></polyline>', s),
    x:         (s) => Icons._svg('<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>', s),
    target:    (s) => Icons._svg('<circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle>', s),
    barChart:  (s) => Icons._svg('<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>', s),
    repeat:    (s) => Icons._svg('<polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path>', s),
    trash:     (s) => Icons._svg('<polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>', s),
    image:     (s) => Icons._svg('<rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline>', s),
    alertCircle: (s) => Icons._svg('<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line>', s),
    bookOpen:  (s) => Icons._svg('<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>', s),
    zap:       (s) => Icons._svg('<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>', s),
    listView:  (s) => Icons._svg('<line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line>', s),
    gridView:  (s) => Icons._svg('<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect>', s),
};


/* ============================================================
   APP — 全局狀態與導航
   ============================================================ */

const App = {
    state: {
        token: null,
        user: null,
        currentTab: 'home',
        currentSubject: 'all',
        currentCategory: 'all',
        currentPage: 1,
        subjects: [],  // 動態從 API 加載
        mistakes: { items: [], total: 0, page: 1 },
        dashboard: null,
        currentMistake: null,
        viewMode: localStorage.getItem('mb_viewMode') || 'list',
    },

    /** 切換列表/網格視圖 */
    setViewMode(mode) {
        this.state.viewMode = mode;
        localStorage.setItem('mb_viewMode', mode);
        Views._renderCurrentMistakes();
    },

    /** 獲取當前科目的分類列表 */
    getCurrentCategories() {
        const subj = (this.state.subjects || []).find(s => s.subject_code === this.state.currentSubject);
        return (subj?.categories) || [];
    },

    async init() {
        this.state.token = localStorage.getItem('auth_token');
        if (!this.state.token) {
            window.location.href = '/';
            return;
        }

        const verified = await API.verify();
        if (!verified) {
            localStorage.removeItem('auth_token');
            window.location.href = '/';
            return;
        }

        await this._loadSubjects();
        this._bindEvents();
        this.navigate('home');
    },

    // 科目顯示優先順序：中英ICT數公民物理排前面，其餘按原順序
    _SUBJECT_ORDER: ['chinese', 'english', 'ICT', 'math', 'ces', 'physics'],

    async _loadSubjects() {
        try {
            const res = await API.getSubjects();
            if (res && res.data) {
                const order = this._SUBJECT_ORDER;
                this.state.subjects = res.data.slice().sort((a, b) => {
                    const ai = order.indexOf(a.subject_code);
                    const bi = order.indexOf(b.subject_code);
                    if (ai !== -1 && bi !== -1) return ai - bi;
                    if (ai !== -1) return -1;
                    if (bi !== -1) return 1;
                    return 0;
                });
            }
        } catch (e) {
            // 降級到默認三科
            this.state.subjects = [
                { subject_code: 'chinese', display_name: '中文', ui_features: {} },
                { subject_code: 'math', display_name: '數學', ui_features: { katex: true } },
                { subject_code: 'english', display_name: '英文', ui_features: {} },
            ];
        }
    },

    navigate(tab) {
        this.state.currentTab = tab;

        document.querySelectorAll('.mb-tab-bar__item').forEach(el => {
            el.classList.toggle('mb-tab-bar__item--active', el.dataset.tab === tab);
        });

        // Update header title
        const titleMap = { home: '錯題本', learn: '學習', profile: '我的' };
        const titleEl = document.getElementById('headerTitle');
        if (titleEl) titleEl.textContent = titleMap[tab] || '錯題本';

        const main = document.getElementById('mainContent');
        main.innerHTML = UI.loading();

        // Render subject chips in header for home tab only
        const headerActions = document.getElementById('headerActions');
        if (tab === 'home') {
            headerActions.innerHTML = UI.subjectChips();
            headerActions.addEventListener('click', e => {
                const chip = e.target.closest('.mb-subject-chip');
                if (chip) this.setSubject(chip.dataset.subject);
            });
        } else {
            headerActions.innerHTML = '';
        }

        const renderFn = {
            home: Views.renderHome,
            learn: Views.renderLearn,
            profile: Views.renderProfile,
        }[tab] || Views.renderHome;

        renderFn.call(Views, main).catch(err => {
            console.error('Render error:', err);
            main.innerHTML = `<div class="mb-empty">
                <div class="mb-empty__text">載入失敗，請重試</div>
                <button class="mb-btn mb-btn--primary" onclick="App.navigate('${tab}')" style="margin-top:12px">重新載入</button>
            </div>`;
        });
    },

    setSubject(subject) {
        this.state.currentSubject = subject;
        this.state.currentCategory = 'all';
        this.state.currentPage = 1;

        document.querySelectorAll('.mb-subject-chip').forEach(el => {
            el.classList.toggle('mb-subject-chip--active', el.dataset.subject === subject);
        });

        this.navigate(this.state.currentTab);
    },

    setCategory(category) {
        const validCats = this.getCurrentCategories().map(c => c.value);
        if (category !== 'all' && !validCats.includes(category)) category = 'all';

        this.state.currentCategory = category;
        this.state.currentPage = 1;

        document.querySelectorAll('.mb-category-chip').forEach(el => {
            el.classList.toggle('mb-category-chip--active', el.dataset.category === category);
        });

        Views.refreshMistakeList();
    },

    _bindEvents() {
        document.getElementById('tabBar').addEventListener('click', e => {
            const item = e.target.closest('.mb-tab-bar__item');
            if (item) this.navigate(item.dataset.tab);
        });

        document.getElementById('uploadPanel').addEventListener('click', e => {
            if (e.target.id === 'uploadPanel') Upload.close();
        });
    },
};


/* ============================================================
   API — 後端調用封裝
   ============================================================ */

const API = {
    _headers() {
        return {
            'Authorization': `Bearer ${App.state.token}`,
            'Content-Type': 'application/json',
        };
    },

    async _fetch(url, options = {}) {
        try {
            const res = await fetch(url, {
                headers: this._headers(),
                ...options,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
            return data;
        } catch (err) {
            console.error(`API Error [${url}]:`, err);
            UI.toast(err.message, 'error');
            return null;
        }
    },

    async verify() {
        const res = await this._fetch('/api/verify');
        if (res && res.success) {
            App.state.user = res.data;
            return true;
        }
        return false;
    },

    async getSubjects() { return this._fetch('/api/mistakes/subjects'); },
    async getDashboard() { return this._fetch('/api/mistakes/dashboard'); },
    async getMistakes(subject, status, page = 1, category) {
        const params = new URLSearchParams({ page, page_size: 20 });
        if (subject && subject !== 'all') params.set('subject', subject);
        if (status) params.set('status', status);
        if (category && category !== 'all') params.set('category', category);
        return this._fetch(`/api/mistakes?${params}`);
    },
    async getMistakeDetail(id) { return this._fetch(`/api/mistakes/${id}`); },
    async uploadPhoto(formData) {
        try {
            const res = await fetch('/api/mistakes/upload', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.state.token}` },
                body: formData,
            });
            return await res.json();
        } catch (err) {
            UI.toast('上傳失敗: ' + err.message, 'error');
            return null;
        }
    },
    async confirmOCR(mistakeId, question, answer) {
        return this._fetch(`/api/mistakes/${mistakeId}/confirm`, {
            method: 'POST',
            body: JSON.stringify({ confirmed_question: question, confirmed_answer: answer }),
        });
    },
    async addManual(data) {
        return this._fetch('/api/mistakes/manual', {
            method: 'POST',
            body: JSON.stringify(data),
        });
    },
    async getWeaknessReport(subject) { return this._fetch(`/api/mistakes/weakness-report?subject=${subject}`); },
    async getKnowledgeMap(subject) { return this._fetch(`/api/mistakes/knowledge-map?subject=${subject}`); },
    async getKnowledgeGraph(subject) { return this._fetch(`/api/mistakes/knowledge-graph?subject=${subject}`); },
    async getMasteryHistory(pointCode, limit = 30) { return this._fetch(`/api/mistakes/mastery-history?point_code=${pointCode}&limit=${limit}`); },
    async askKnowledgeQA(pointCode, question) {
        return this._fetch('/api/mistakes/knowledge-qa', {
            method: 'POST',
            body: JSON.stringify({ point_code: pointCode, question }),
        });
    },
    async getReviewQueue(subject, limit = 10) {
        const params = new URLSearchParams({ limit });
        if (subject && subject !== 'all') params.set('subject', subject);
        return this._fetch(`/api/mistakes/review-queue?${params}`);
    },
    async recordReview(mistakeId, result) {
        return this._fetch(`/api/mistakes/${mistakeId}/review`, {
            method: 'POST',
            body: JSON.stringify({ result }),
        });
    },
    async getPracticeMastery(subject) {
        return this._fetch(`/api/mistakes/practice/mastery?subject=${encodeURIComponent(subject)}`);
    },
    async generatePractice(subject, count = 5, targetPoints = null, difficulty = null) {
        const body = { subject, question_count: count, session_type: 'targeted' };
        if (targetPoints && targetPoints.length > 0) body.target_points = targetPoints;
        if (difficulty) body.difficulty = difficulty;
        return this._fetch('/api/mistakes/practice/generate', {
            method: 'POST',
            body: JSON.stringify(body),
        });
    },
    async submitPractice(sessionId, answers) {
        return this._fetch(`/api/mistakes/practice/${sessionId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });
    },
    async recognizeHandwriting(imageBlob, subject, mode = 'canvas') {
        try {
            const formData = new FormData();
            formData.append('image', imageBlob, 'handwriting.png');
            formData.append('subject', subject);
            formData.append('mode', mode);
            const res = await fetch('/api/mistakes/practice/recognize-handwriting', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${App.state.token}` },
                body: formData,
            });
            return await res.json();
        } catch (err) {
            UI.toast('識別失敗: ' + err.message, 'error');
            return null;
        }
    },
    async deleteMistake(id) { return this._fetch(`/api/mistakes/${id}`, { method: 'DELETE' }); },
    async cancelRecognition(id) { return this._fetch(`/api/mistakes/${id}/cancel`, { method: 'POST' }); },
};


/* ============================================================
   UI — DOM 工具函數
   ============================================================ */

const UI = {
    loading() {
        return '<div class="mb-loading"><div class="mb-loading__spinner"></div>載入中...</div>';
    },

    empty(icon, text) {
        return `<div class="mb-empty"><div class="mb-empty__icon">${icon}</div><div class="mb-empty__text">${text}</div></div>`;
    },

    subjectChips() {
        const current = App.state.currentSubject;
        const subjects = App.state.subjects || [];
        return `<div class="mb-subject-bar">
            <button class="mb-subject-chip${current==='all'?' mb-subject-chip--active':''}" data-subject="all">全部</button>
            ${subjects.map(s =>
                `<button class="mb-subject-chip${current===s.subject_code?' mb-subject-chip--active':''}" data-subject="${s.subject_code}">${s.display_name}</button>`
            ).join('')}
        </div>`;
    },

    toast(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `mb-toast mb-toast--${type}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    subjectLabel(subject) {
        const s = (App.state.subjects || []).find(s => s.subject_code === subject);
        return s ? s.display_name : subject;
    },

    statusLabel(status) {
        const map = {
            processing: 'Step 1/2: 識別中...',
            analyzing: 'Step 2/2: 分析中...',
            ocr_failed: '識別失敗',
            analysis_failed: '分析失敗',
            needs_review: '待確認',
            pending_ocr: '待識別',
            pending_review: '待確認',
            analyzed: '已分析',
            practicing: '練習中',
            mastered: '已掌握',
        };
        return map[status] || status;
    },

    errorTypeLabel(type) {
        const map = {
            concept_error: '概念錯誤',
            calculation_error: '計算錯誤',
            comprehension_gap: '理解偏差',
            careless: '粗心大意',
            expression_weak: '表達不足',
            memory_error: '記憶錯誤',
            logic_error: '邏輯錯誤',
            method_error: '方法錯誤',
        };
        return map[type] || type || '未分類';
    },

    masteryClass(level) {
        if (level < 40) return 'low';
        if (level < 70) return 'medium';
        return 'high';
    },

    formatDate(dateStr) {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return `${d.getMonth() + 1}月${d.getDate()}日`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    renderMath(text) {
        if (!text) return '';

        // 修復已存 DB 中被 JSON 解析損壞的 LaTeX（\times→TAB+"imes" 等）
        text = text.replace(/\t([a-zA-Z]{2,})/g, '\\t$1');   // \times, \text, \theta, \tan
        text = text.replace(/\x08([a-zA-Z]{2,})/g, '\\b$1'); // \bar, \binom, \begin, \beta
        text = text.replace(/\f([a-zA-Z]{2,})/g, '\\f$1');   // \frac, \forall
        text = text.replace(/\r([a-zA-Z]{2,})/g, '\\r$1');   // \right, \rangle, \rho

        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

        // 保護 SVG 塊不被後續 LaTeX/Markdown 處理干擾
        const svgBlocks = [];
        text = text.replace(/<svg[\s\S]*?<\/svg>/gi, (match) => {
            svgBlocks.push(match);
            return `SVGPH${svgBlocks.length - 1}ENDSVGPH`;
        });

        // OCR 模型常輸出字面 \n 而非真正換行符，轉換之
        // 保護已知 LaTeX \n* 命令（\nabla \neg \neq \newline \ni \not \notin \nu）
        text = text.replace(/\\n(?!abla|e[gq]|ew|ot|otin|u(?![a-z])|i(?![a-z]))/g, '\n');

        // 修復 AI 生成的無效 LaTeX：\text{^\circ C} → °C
        text = text.replace(/\\text\{\s*\^?\s*\\circ\s*([^}]*)\}/g, '°$1');
        // 獨立的 ^\circ → °
        text = text.replace(/\^\\circ(?![a-zA-Z])/g, '°');

        // 修復未用 $ 包裹的裸露 LaTeX（AI 有時漏掉 $ 分隔符）
        // 分割文本為 $...$ 內和外的片段，只對外部片段修復
        const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/);
        text = parts.map(part => {
            // 奇數索引是已有的 $...$ 片段，保留不動
            if (part.startsWith('$')) return part;
            // 偶數索引是普通文本，包裹含 \ 命令的片段
            return part.replace(
                /([A-Za-z_]\s*=\s*)?(\d[\d.,]*\s*)?\\(text|frac|sqrt|Delta|Omega|theta|alpha|beta|gamma|omega|mu|pi|times|cdot|vec|hat|bar)\b[^$\n,，。；]*/g,
                match => `$${match.trim()}$`
            );
        }).join('');

        if (typeof katex === 'undefined') {
            return UI._renderMarkdown(text);
        }

        const renderKatex = (latex, displayMode) => {
            try {
                // KaTeX 不支援 tabular，轉為 array
                let fixed = latex.trim()
                    .replace(/\\begin\{tabular\}/g, '\\begin{array}')
                    .replace(/\\end\{tabular\}/g, '\\end{array}');
                return katex.renderToString(fixed, {
                    throwOnError: false,
                    displayMode,
                    trust: true,
                });
            } catch {
                return UI.escapeHtml(latex);
            }
        };

        const matches = [];
        const patterns = [
            { re: /\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}/g, display: true,  extract: m => m[0] },
            { re: /\$\$([\s\S]*?)\$\$/g,                      display: true,  extract: m => m[1] },
            { re: /\$([^$]+?)\$/g,                             display: false, extract: m => m[1] },
        ];

        for (const p of patterns) {
            const re = new RegExp(p.re.source, p.re.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({ start: m.index, end: m.index + m[0].length, latex: p.extract(m), display: p.display });
            }
        }

        matches.sort((a, b) => a.start - b.start);
        const filtered = [];
        let lastEnd = 0;
        for (const m of matches) {
            if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
        }

        // 用占位符替換 LaTeX 區段，渲染 Markdown 後再還原
        const placeholders = [];
        let mdText = '';
        let pos = 0;
        for (const m of filtered) {
            if (m.start > pos) mdText += text.substring(pos, m.start);
            const ph = `KATEXPH${placeholders.length}ENDPH`;
            placeholders.push(renderKatex(m.latex, m.display));
            mdText += ph;
            pos = m.end;
        }
        if (pos < text.length) mdText += text.substring(pos);

        // 渲染 Markdown（含 XSS 防護），然後還原 KaTeX 占位符
        let result = UI._renderMarkdown(mdText);
        placeholders.forEach((html, i) => {
            result = result.replace(`KATEXPH${i}ENDPH`, html);
        });

        // 還原 SVG 塊（先單獨 sanitize 每個 SVG）
        const svgPurifyConfig = typeof DOMPurify !== 'undefined' ? {
            ADD_TAGS: ['svg', 'g', 'line', 'circle', 'rect', 'polygon', 'polyline', 'path', 'text'],
            ADD_ATTR: ['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                       'cx', 'cy', 'r', 'points', 'd', 'fill', 'stroke', 'stroke-width',
                       'stroke-dasharray', 'transform', 'font-size', 'text-anchor', 'opacity'],
            FORBID_TAGS: ['script', 'style', 'foreignObject', 'image', 'img', 'iframe', 'object', 'embed', 'a'],
        } : null;
        svgBlocks.forEach((svg, i) => {
            const safe = svgPurifyConfig ? DOMPurify.sanitize(svg, svgPurifyConfig) : UI.escapeHtml(svg);
            result = result.replace(`SVGPH${i}ENDSVGPH`, safe);
        });

        return result;
    },

    /**
     * 渲染 Markdown 文字（支持 **粗體**、### 標題 等）
     * 若 marked 不可用則退回 escapeHtml + <br>
     */
    _renderMarkdown(text) {
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            const html = marked.parse(text, { breaks: true });
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['svg', 'g', 'line', 'circle', 'rect', 'polygon', 'polyline', 'path', 'text'],
                ADD_ATTR: ['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                           'cx', 'cy', 'r', 'points', 'd', 'fill', 'stroke', 'stroke-width',
                           'stroke-dasharray', 'transform', 'font-size', 'text-anchor', 'opacity'],
            });
        }
        return UI.escapeHtml(text).replace(/\n/g, '<br>');
    },

    /**
     * 處理題目文字中的圖形描述 JSON
     * 將 [圖形描述：{...JSON...}] 轉為可讀的文字描述
     */
    formatQuestion(text) {
        if (!text) return '';

        // 匹配 [圖形描述：{...}] 前綴
        const figMatch = text.match(/^\[圖形描述[：:]\s*([\s\S]*?)\]\s*([\s\S]*)$/);
        if (!figMatch) return this.renderMath(text);

        const figRaw = figMatch[1].trim();
        const questionBody = figMatch[2].trim();

        // 嘗試解析 JSON 圖形描述
        let figHtml = '';
        try {
            // 可能是部分 JSON（被截斷），嘗試修補
            let jsonStr = figRaw;
            if (!jsonStr.endsWith('}')) jsonStr += '"}]}';
            const fig = JSON.parse(jsonStr);

            if (fig && fig.elements) {
                const points = fig.elements.filter(e => e.type === 'point');
                const lines = fig.elements.filter(e => e.type === 'line_segment');

                let desc = `<div class="mb-figure-desc">`;
                desc += `<div class="mb-figure-desc__title">${Icons.image(14)} 幾何圖形</div>`;
                if (points.length) {
                    desc += `<div class="mb-figure-desc__item">點：${points.map(p => p.label).join('、')}</div>`;
                }
                if (lines.length) {
                    desc += `<div class="mb-figure-desc__item">直線：${lines.map(l => l.label || (l.from + l.to)).join('、')}</div>`;
                }
                desc += `</div>`;
                figHtml = desc;
            }
        } catch {
            // JSON 解析失敗，顯示簡潔摘要
            figHtml = `<div class="mb-figure-desc">
                <div class="mb-figure-desc__title">${Icons.image(14)} 含幾何圖形</div>
            </div>`;
        }

        return figHtml + this.renderMath(questionBody);
    },

    /**
     * 處理 AI 分析文字
     * 如果是 JSON 格式（後端解析失敗時），嘗試前端解析提取
     * 同時截斷重複性文字
     */
    /**
     * 去除 markdown code fence 包裹 (```json ... ``` 或 ``` ... ```)
     */
    _stripCodeFence(text) {
        if (!text) return text;
        return text.replace(/^```(?:json|JSON)?\s*\n?/gm, '').replace(/\n?```\s*$/gm, '').trim();
    },

    formatAnalysis(text) {
        if (!text) return '';

        // 去除 markdown code fence 包裹
        let trimmed = this._stripCodeFence(text.trim());
        if (trimmed.startsWith('{')) {
            try {
                // 嘗試直接解析
                const obj = JSON.parse(trimmed);
                return this._renderAnalysisObj(obj);
            } catch {
                // 嘗試修復常見的 LaTeX 轉義問題
                try {
                    const fixed = trimmed.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
                    const obj = JSON.parse(fixed);
                    return this._renderAnalysisObj(obj);
                } catch {
                    // 用正則提取字段
                    return this._extractAndRenderAnalysis(trimmed);
                }
            }
        }

        // 截斷重複文字
        const cleaned = this._truncateRepetitive(trimmed);
        return this.renderMath(cleaned);
    },

    _renderAnalysisObj(obj) {
        let html = '';
        if (obj.error_analysis) {
            html += this.renderMath(this._truncateRepetitive(obj.error_analysis));
        }
        if (obj.correct_answer && !html.includes(obj.correct_answer.substring(0, 20))) {
            html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--mb-border)">
                <div style="font-size:12px;font-weight:600;color:var(--mb-text-secondary);margin-bottom:4px">正確答案</div>
                ${this.renderMath(this._truncateRepetitive(obj.correct_answer))}
            </div>`;
        }
        if (obj.improvement_tips && obj.improvement_tips.length) {
            html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--mb-border)">
                <div style="font-size:12px;font-weight:600;color:var(--mb-text-secondary);margin-bottom:4px">改進建議</div>
                <ul style="margin:0;padding-left:16px;font-size:13px">${obj.improvement_tips.map(t => `<li>${this.renderMath(t)}</li>`).join('')}</ul>
            </div>`;
        }
        if (html) return html;
        // Fallback: render JSON in scrollable pre block
        const jsonStr = this.escapeHtml(JSON.stringify(obj, null, 2).substring(0, 2000));
        return `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;max-width:100%;overflow-x:auto;font-size:13px;line-height:1.5;margin:0">${jsonStr}</pre>`;
    },

    _extractAndRenderAnalysis(text) {
        // 從 JSON-like 文本中正則提取字段
        let html = '';

        const eaMatch = text.match(/"error_analysis"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
        if (eaMatch) {
            const analysis = eaMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            html += this.renderMath(this._truncateRepetitive(analysis));
        }

        const caMatch = text.match(/"correct_answer"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
        if (caMatch) {
            const answer = caMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
            html += `<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--mb-border)">
                <div style="font-size:12px;font-weight:600;color:var(--mb-text-secondary);margin-bottom:4px">正確答案</div>
                ${this.renderMath(this._truncateRepetitive(answer))}
            </div>`;
        }

        if (html) return html;

        // 什麼都沒提取到，清理後直接顯示
        return this.renderMath(this._truncateRepetitive(text));
    },

    /**
     * 截斷重複性文字（AI 模型循環生成）
     */
    _truncateRepetitive(text, maxLen = 3000) {
        if (!text || text.length <= maxLen) return text;

        // 檢測重複片段
        for (const winSize of [200, 100, 50]) {
            if (text.length < winSize * 4) continue;
            const mid = Math.floor(text.length / 3);
            const sample = text.substring(mid, mid + winSize);
            const rest = text.substring(mid + winSize);
            const count = (rest.match(new RegExp(sample.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
            if (count >= 2) {
                const firstEnd = text.indexOf(sample, mid) + winSize;
                return text.substring(0, firstEnd).trimEnd() + '\n\n（分析內容過長，已截斷）';
            }
        }

        return text.substring(0, maxLen);
    },

    /* ---- 詳情頁分層佈局輔助函數 ---- */

    /**
     * 從 ai_analysis 中提取 JSON 對象（3 層解析策略）
     * 返回 parsed object 或 null
     */
    _parseAnalysisJson(text) {
        if (!text) return null;
        const trimmed = this._stripCodeFence(text.trim());
        if (!trimmed.startsWith('{')) return null;
        try { return JSON.parse(trimmed); } catch {}
        try {
            const fixed = trimmed.replace(/\\(?!["\\\/bfnrtu])/g, '\\\\');
            return JSON.parse(fixed);
        } catch {}
        return null;
    },

    /**
     * 提取 error_analysis 純文字（處理 JSON 或 prose）
     */
    extractRawAnalysis(m) {
        const text = m.ai_analysis;
        if (!text) return '';
        const cleaned = this._stripCodeFence(text);
        const obj = this._parseAnalysisJson(cleaned);
        if (obj && obj.error_analysis) {
            return obj.error_analysis.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        // 嘗試正則提取
        const eaMatch = cleaned.match(/"error_analysis"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
        if (eaMatch) {
            return eaMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
        }
        // 非 JSON，視為純文字
        if (cleaned.startsWith('{')) return ''; // JSON 但無 error_analysis
        return cleaned;
    },

    /**
     * 判斷錯題是否被 AI 標記為「答案正確」（A/B/C 級）
     */
    isAnswerCorrect(m) {
        return !m.error_type || m.error_type === 'careless' || m.error_type === 'expression_weak';
    },

    /**
     * 一句話摘要：errorTypeLabel + 第一句 error_analysis
     * 答案正確時顯示正向摘要
     */
    extractErrorSummary(m) {
        const typeLabel = this.errorTypeLabel(m.error_type);
        const raw = this.extractRawAnalysis(m);
        if (!raw) return typeLabel !== '未分類' ? typeLabel : '';

        // 取第一句（到句號/驚嘆號/換行，最多 80 字）
        const sentenceMatch = raw.match(/^(.{1,80}?)[。！\n]/);
        const sentence = sentenceMatch ? sentenceMatch[1] : raw.substring(0, 80);

        // 答案正確（A 級，無 error_type）→ 直接顯示第一句（通常是正向評價）
        if (!m.error_type) return sentence;

        if (typeLabel && typeLabel !== '未分類') {
            return `${typeLabel}：${sentence}`;
        }
        return sentence;
    },

    /**
     * 提取核心考點
     */
    extractKeyInsight(m) {
        if (m.key_insight) return m.key_insight;
        // 從 JSON 中找
        const obj = this._parseAnalysisJson(m.ai_analysis);
        if (obj) {
            if (obj.key_insight) return obj.key_insight;
            if (obj.knowledge_points?.length) {
                const first = obj.knowledge_points[0];
                return typeof first === 'string' ? first : first.point_name || first.name || null;
            }
        }
        // 從已有 knowledge_points 取
        const kps = m.knowledge_points || [];
        if (kps.length) return kps[0].point_name || null;
        return null;
    },

    /**
     * 提取第一條改進建議
     */
    extractFirstTip(m) {
        // 直接從 m.improvement_tips 取
        const tips = m.improvement_tips;
        if (Array.isArray(tips) && tips.length) return tips[0];
        // 從 JSON 中找
        const obj = this._parseAnalysisJson(m.ai_analysis);
        if (obj?.improvement_tips?.length) return obj.improvement_tips[0];
        return null;
    },

    /**
     * 學生做法摘要（1-3 bullet points）
     */
    summarizeStudentApproach(m) {
        const bullets = [];
        // 只顯示學生的實際答案，不從 AI 分析中提取描述
        if (m.answer_text && m.answer_text.trim()) {
            bullets.push(m.answer_text.trim());
        }
        return bullets;
    },

    /**
     * 正確做法摘要（2-4 bullet points，從 correct_answer 拆步驟）
     */
    summarizeCorrectAnswer(m) {
        const ca = m.correct_answer;
        if (!ca || !ca.trim()) return [];

        // 拆行時保護 $...$ 和 $$...$$ 不被拆散
        const _safeSplit = (text, sep) => {
            // 先把 $...$ / $$...$$ 替換為占位符
            const holders = [];
            let safe = text.replace(/\$\$[\s\S]*?\$\$/g, m => {
                holders.push(m); return `\x00MATH${holders.length - 1}\x00`;
            }).replace(/\$[^$]*?\$/g, m => {
                holders.push(m); return `\x00MATH${holders.length - 1}\x00`;
            });
            const parts = safe.split(sep).map(s => s.trim()).filter(s => s.length > 5);
            // 還原占位符
            return parts.map(p => p.replace(/\x00MATH(\d+)\x00/g, (_, i) => holders[+i]));
        };

        // 按步驟標記或換行拆分（完整顯示每步）
        const lines = _safeSplit(ca, /(?:Step\s*\d+[:：]|步驟\s*\d+[:：]|\(\d+\)\s*|^\d+[.、]\s*|\n{2,})/im);

        if (lines.length <= 1) {
            return _safeSplit(ca, /\n/);
        }

        return lines;
    },
};


/* ============================================================
   GeoDisplay — 統一幾何展示格式化（schema → 教學化中文）
   ============================================================ */
const GeoDisplay = {
    /** 去除工程前綴：S_AB→AB, P_A→A, Tri_ABC→△ABC, Ang_ABC→∠ABC, Cir_O→⊙O */
    stripPrefix(token) {
        if (!token) return token;
        const map = [
            ['S_', ''], ['P_', ''], ['Tri_', '△'],
            ['Ang_', '∠'], ['Cir_', '⊙'], ['Poly_', ''],
            ['L_', ''], ['Ray_', '']
        ];
        for (const [prefix, replacement] of map) {
            if (token.startsWith(prefix)) return replacement + token.slice(prefix.length);
        }
        return token;
    },

    /** 將 relationship 對象轉為中文自然語言 */
    describeRelationship(rel) {
        const t = rel.type || '';
        const e = (rel.entities || []).map(x => this.stripPrefix(x));
        const source = rel.source || '';
        const suffix = source === 'inferred' ? '（推斷）' : '';

        const formatters = {
            parallel:      () => e.join(' ∥ '),
            perpendicular: () => e.join(' ⊥ ') + (rel.at ? `，交於 ${this.stripPrefix(rel.at)}` : ''),
            collinear:     () => (rel.points || []).map(p => this.stripPrefix(p)).join('、') + ' 共線',
            midpoint:      () => `${this.stripPrefix(rel.subject || '?')} 是 ${this.stripPrefix(rel.of || '?')} 中點`,
            on_segment:    () => `${this.stripPrefix(rel.subject || '?')} 在 ${this.stripPrefix(rel.target || '?')} 上`,
            bisector:      () => `${this.stripPrefix(rel.subject || '?')} 平分 ${this.stripPrefix(rel.target || '?')}`,
            congruent:     () => e.join(' ≅ '),
            similar:       () => e.join(' ∼ '),
            tangent:       () => `${e[0] || '?'} 切 ${e[1] || '?'}` + (rel.at ? `，切點 ${this.stripPrefix(rel.at)}` : ''),
            equal:         () => {
                const items = rel.items || [];
                if (items.length >= 2) return `${this.stripPrefix(items[0].ref)} = ${this.stripPrefix(items[1].ref)}`;
                return 'equal';
            },
            ratio:         () => {
                const items = rel.items || [];
                const value = rel.value;
                const valStr = typeof value === 'object' && value !== null
                    ? `${value.left} : ${value.right}`
                    : String(value || '');
                if (items.length >= 2)
                    return `${this.stripPrefix(items[0].ref)} : ${this.stripPrefix(items[1].ref)} = ${valStr}`;
                return `ratio = ${valStr}`;
            },
        };

        const fn = formatters[t];
        return (fn ? fn() : (e.length ? `${t}: ${e.join(', ')}` : t)) + suffix;
    },

    /** 清除 LaTeX 殘留，轉為 Unicode 符號 */
    cleanLatex(text) {
        if (!text) return text;
        return text
            // 雙重轉義（JSON 回退路徑可能殘留 \\parallel 等）
            .replace(/\\\\parallel/g, '∥')
            .replace(/\\\\perp/g, '⊥')
            .replace(/\\\\angle/g, '∠')
            .replace(/\\\\triangle/g, '△')
            .replace(/\\\\cong/g, '≅')
            .replace(/\\\\sim/g, '∼')
            .replace(/\\\\times/g, '×')
            .replace(/\\\\cdot/g, '·')
            .replace(/\\\\text\s*\{([^}]*)\}/g, '$1')
            .replace(/\\\\[()]/g, '')
            // 單重轉義（正常路徑）
            .replace(/\\parallel/g, '∥')
            .replace(/\\perp/g, '⊥')
            .replace(/\\angle/g, '∠')
            .replace(/\\triangle/g, '△')
            .replace(/\\cong/g, '≅')
            .replace(/\\sim/g, '∼')
            .replace(/\\times/g, '×')
            .replace(/\\cdot/g, '·')
            .replace(/\\text\s*\{([^}]*)\}/g, '$1')
            .replace(/\\[()]/g, '')
            .replace(/\\(quad|,|;|!)/g, ' ')
            .replace(/\$/g, '')
            .trim();
    },

    /** 將 measurement 對象轉為中文自然語言 */
    describeMeasurement(m) {
        const target = this.stripPrefix(m.target || m.what || '');
        const prop = m.property || '';
        const value = m.value != null ? String(m.value) : '';
        const source = m.source || '';
        const suffix = source === 'inferred' ? '（推斷）' : '';
        if (prop === 'degrees') {
            return `∠${target} = ${value}${String(value).endsWith('°') ? '' : '°'}${suffix}`;
        } else if (prop === 'length') {
            return `${target} = ${value}${suffix}`;
        }
        return `${target} ${prop} = ${value}${suffix}`;
    },

    /** 從原始 schema JSON 生成結構化幾何詳情 HTML */
    renderFigureDetail(figJsonStr) {
        let fig;
        try {
            fig = typeof figJsonStr === 'string' ? JSON.parse(figJsonStr) : figJsonStr;
        } catch {
            return null;
        }
        if (!fig || !fig.has_figure) return null;

        const rels = fig.relationships || [];
        const meas = fig.measurements || [];
        const task = fig.task || {};

        // 按類型分類關係
        const collinear = rels.filter(r => r.type === 'collinear');
        const parallel = rels.filter(r => r.type === 'parallel');
        const perp = rels.filter(r => r.type === 'perpendicular');
        const ratios = rels.filter(r => r.type === 'ratio');
        const others = rels.filter(r => !['collinear','parallel','perpendicular','ratio'].includes(r.type));

        // 量測分離：事實 vs 推斷
        const measFact = meas.filter(m => m.source !== 'inferred');
        const measInferred = meas.filter(m => m.source === 'inferred');

        const sections = [];

        const makeItems = (items, fn) => items.map(item => {
            const src = item.source || '';
            const isInferred = src === 'inferred';
            const cls = isInferred ? ' class="mb-figure-desc__inferred"' : '';
            const tag = isInferred ? '<span class="mb-figure-desc__inferred-tag">（推斷）</span>' : '';
            return `<div${cls}>${UI.escapeHtml(fn(item))}${tag}</div>`;
        }).join('');

        // 解題優先順序：平行 → 比例 → 量測 → 垂直 → 共線 → 其他
        if (parallel.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">平行</div>
                ${makeItems(parallel, r => this.describeRelationship(r))}
            </div>`);
        }
        if (ratios.length || measFact.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">量測</div>
                ${makeItems(ratios, r => this.describeRelationship(r))}
                ${makeItems(measFact, m => this.describeMeasurement(m))}
            </div>`);
        }
        if (perp.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">垂直</div>
                ${makeItems(perp, r => this.describeRelationship(r))}
            </div>`);
        }
        if (collinear.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">共線</div>
                ${makeItems(collinear, r => this.describeRelationship(r))}
            </div>`);
        }
        if (others.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">其他關係</div>
                ${makeItems(others, r => this.describeRelationship(r))}
            </div>`);
        }
        if (measInferred.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">推斷</div>
                ${makeItems(measInferred, m => this.describeMeasurement(m))}
            </div>`);
        }

        const known = task.known_conditions || [];
        const goals = task.goals || [];
        if (known.length || goals.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">題目條件</div>
                ${known.length ? `<div><strong>已知：</strong>${known.map(k => UI.renderMath(k)).join('；')}</div>` : ''}
                ${goals.length ? `<div><strong>求：</strong>${goals.map(g => `<span class="mb-figure-desc__goal">${UI.renderMath(g)}</span>`).join('、')}</div>` : ''}
            </div>`);
        }

        if (!sections.length) return null;
        return `<div class="mb-figure-desc">
            <div class="mb-figure-desc__title">幾何圖形描述</div>
            ${sections.join('')}
        </div>`;
    }
};

/* ============================================================
   VIEWS — 頁面渲染
   ============================================================ */

const Views = {

    /* ---- 錯題本 Tab ---- */
    async renderHome(container) {
        const subject = App.state.currentSubject;
        const category = App.state.currentCategory;

        const [dashRes, listRes, reviewRes] = await Promise.all([
            API.getDashboard(),
            API.getMistakes(subject, null, 1, category),
            API.getReviewQueue(subject, 50),
        ]);

        const dash = dashRes?.data || {};
        const list = listRes?.data || { items: [], total: 0 };
        const reviewItems = reviewRes?.data?.items || [];
        App.state.dashboard = dash;
        App.state.mistakes = list;

        const reviewDue = reviewItems.length;

        // Update learn badge
        const badge = document.getElementById('learnBadge');
        if (badge) {
            if (reviewDue > 0) { badge.textContent = reviewDue; badge.style.display = ''; }
            else { badge.style.display = 'none'; }
        }

        // Category chips（只在選了具體科目且有 ≥2 分類時顯示）
        const cats = App.getCurrentCategories();
        const showCategoryBar = subject !== 'all' && cats.length >= 2;
        const categoryBarHtml = showCategoryBar ? `
                <div class="mb-category-bar" id="categoryBar">
                    <button class="mb-category-chip${category === 'all' ? ' mb-category-chip--active' : ''}" data-category="all">全部</button>
                    ${cats.map(c => `<button class="mb-category-chip${category === c.value ? ' mb-category-chip--active' : ''}" data-category="${UI.escapeHtml(c.value)}">${UI.escapeHtml(c.label)}</button>`).join('')}
                </div>` : '';

        container.innerHTML = `
            ${reviewDue > 0 ? `
            <div class="mb-banner" onclick="App.navigate('learn')">
                <div class="mb-banner__text">${Icons.repeat(14)} <strong>${reviewDue}</strong> 題待複習</div>
                <div class="mb-banner__action">開始 ${Icons.arrowR(14)}</div>
            </div>` : ''}

            <div class="mb-quick-actions">
                <div class="mb-quick-action" onclick="Upload.open('photo')">
                    <div class="mb-quick-action__icon">${Icons.camera(20)}</div>
                    <div class="mb-quick-action__text">
                        <div class="mb-quick-action__label">拍照上傳</div>
                        <div class="mb-quick-action__desc">拍題目和答案</div>
                    </div>
                </div>
                <div class="mb-quick-action" onclick="Upload.open('manual')">
                    <div class="mb-quick-action__icon">${Icons.edit(20)}</div>
                    <div class="mb-quick-action__text">
                        <div class="mb-quick-action__label">手動添加</div>
                        <div class="mb-quick-action__desc">打字輸入錯題</div>
                    </div>
                </div>
            </div>

            <div class="mb-list-section">
                <div class="mb-list-section__header">
                    <span class="mb-list-section__title">最近錯題</span>
                    <div class="mb-view-toggle">
                        <button class="mb-view-toggle__btn${App.state.viewMode === 'list' ? ' mb-view-toggle__btn--active' : ''}"
                                data-view="list" title="列表視圖">${Icons.listView(16)}</button>
                        <button class="mb-view-toggle__btn${App.state.viewMode === 'grid' ? ' mb-view-toggle__btn--active' : ''}"
                                data-view="grid" title="網格視圖">${Icons.gridView(16)}</button>
                        <span class="mb-list-section__count">${list.total} 題</span>
                    </div>
                </div>
                ${categoryBarHtml}
                <div id="mistakeList"></div>
            </div>
        `;

        // Category chips 事件
        const catBar = document.getElementById('categoryBar');
        if (catBar) {
            catBar.addEventListener('click', e => {
                const chip = e.target.closest('.mb-category-chip');
                if (chip) App.setCategory(chip.dataset.category);
            });
        }

        // 視圖切換事件
        const viewToggle = container.querySelector('.mb-view-toggle');
        if (viewToggle) {
            viewToggle.addEventListener('click', e => {
                const btn = e.target.closest('.mb-view-toggle__btn');
                if (btn && btn.dataset.view !== App.state.viewMode) {
                    App.setViewMode(btn.dataset.view);
                }
            });
        }

        this._renderMistakeList(list.items);
    },

    /** 取消正在識別的錯題 */
    async cancelRecognition(mistakeId) {
        if (!confirm('確定取消識別？')) return;
        try {
            await API.cancelRecognition(mistakeId);
            UI.toast('已取消識別');
            this._stopProcessingPoll();
            await this.refreshMistakeList();
        } catch (e) {
            UI.toast('取消失敗', 'error');
        }
    },

    /** 統一列表刷新（帶全部篩選條件） */
    async refreshMistakeList() {
        const { currentSubject, currentCategory, currentStatus, currentPage } = App.state;
        try {
            const res = await API.getMistakes(currentSubject, currentStatus, currentPage, currentCategory);
            if (res?.data?.items) {
                this._renderMistakeList(res.data.items);
                const countEl = document.querySelector('.mb-list-section__count');
                if (countEl) countEl.textContent = `${res.data.total} 題`;
            }
        } catch (e) {
            console.error('refreshMistakeList error:', e);
        }
    },

    _renderMistakeList(items) {
        const listEl = document.getElementById('mistakeList');
        if (!listEl) return;

        if (!items.length) {
            const cat = App.state.currentCategory;
            const msg = cat !== 'all'
                ? `目前沒有「${cat}」分類的錯題`
                : '還沒有錯題，點擊上方「拍照上傳」開始吧';
            listEl.innerHTML = UI.empty('', msg);
            this._stopProcessingPoll();
            return;
        }

        if (App.state.viewMode === 'grid') {
            this._renderGridView(items, listEl);
        } else {
            this._renderListView(items, listEl);
        }

        // List-level polling: auto-refresh when processing/analyzing items exist
        const hasProcessing = items.some(m => m.status === 'processing' || m.status === 'analyzing');
        if (hasProcessing) {
            this._startProcessingPoll();
        } else {
            this._stopProcessingPoll();
        }
    },

    _renderListView(items, listEl) {
        let html = '<div class="mb-list-container">';
        items.forEach(m => {
            const isProcessing = m.status === 'processing' || m.status === 'analyzing';
            const progressMsg = m.status === 'analyzing' ? 'AI 正在解題分析中...' : 'AI 正在識別中...';
            const question = isProcessing
                ? `<span class="mb-processing-pulse">${progressMsg}</span>
                   <span class="mb-processing-wait"></span>
                   <button class="mb-btn mb-btn--danger mb-btn--sm mb-cancel-btn"
                           onclick="event.stopPropagation();Views.cancelRecognition('${m.mistake_id}')">取消</button>`
                : (m.manual_question_text || m.ocr_question_text || '（未識別）');
            const onclick = isProcessing ? '' : `onclick="Views.openDetail('${m.mistake_id}')"`;
            const cursorStyle = isProcessing ? 'style="cursor:default;opacity:0.7"' : '';
            html += `
                <div class="mb-mistake-item" ${onclick} ${cursorStyle}>
                    <div class="mb-mistake-item__bar mb-mistake-item__bar--${m.status}"></div>
                    <div class="mb-mistake-item__content">
                        <div class="mb-mistake-item__top">
                            <span class="mb-mistake-item__subject">${UI.subjectLabel(m.subject)}</span>
                            <span class="mb-mistake-item__date">${UI.formatDate(m.created_at)}</span>
                        </div>
                        <div class="mb-mistake-item__question">${isProcessing ? question : UI.renderMath(question)}</div>
                        <div class="mb-mistake-item__footer">
                            ${m.error_type ? `<span class="mb-mistake-item__tag">${UI.errorTypeLabel(m.error_type)}</span>` : ''}
                            ${m.mastery_level > 0 ? `<span>掌握 ${m.mastery_level}%</span>` : ''}
                            <span>${UI.statusLabel(m.status)}</span>
                        </div>
                    </div>
                    <div class="mb-mistake-item__arrow">${Icons.chevronR(16)}</div>
                </div>
            `;
        });
        html += '</div>';
        listEl.innerHTML = html;
    },

    _renderGridView(items, listEl) {
        let html = '<div class="mb-grid-container">';
        items.forEach(m => {
            const isProcessing = m.status === 'processing' || m.status === 'analyzing';
            const progressMsg = m.status === 'analyzing' ? '分析中' : '識別中';
            const progressMsgLong = m.status === 'analyzing' ? 'AI 正在解題分析中...' : 'AI 正在識別中...';
            const question = m.manual_question_text || m.ocr_question_text || '（未識別）';
            const onclick = isProcessing ? '' : `onclick="Views.openDetail('${m.mistake_id}')"`;
            const cursorStyle = isProcessing ? 'style="cursor:default;opacity:0.7"' : '';
            const imgSrc = m.original_image_path
                ? `/uploads/mistakes/${m.original_image_path.split('uploads/mistakes/')[1] || ''}`
                : '';

            html += `
                <div class="mb-grid-card" ${onclick} ${cursorStyle}>
                    <div class="mb-grid-card__status mb-grid-card__status--${m.status}"></div>
                    <div class="mb-grid-card__thumb">
                        ${imgSrc
                            ? `<img src="${imgSrc}" alt="" loading="lazy"
                                   onerror="this.style.display='none';this.parentElement.classList.add('mb-grid-card__thumb--fallback')">`
                            : ''
                        }
                        ${!imgSrc ? `<div class="mb-grid-card__thumb--fallback">${Icons.bookOpen(24)}</div>` : ''}
                        ${isProcessing ? `<div class="mb-grid-card__processing"><span class="mb-processing-pulse">${progressMsg}</span>
                            <span class="mb-processing-wait"></span>
                            <button class="mb-btn mb-btn--danger mb-btn--sm mb-cancel-btn"
                                    onclick="event.stopPropagation();Views.cancelRecognition('${m.mistake_id}')">取消</button></div>` : ''}
                    </div>
                    <div class="mb-grid-card__body">
                        <div class="mb-grid-card__meta">
                            <span class="mb-mistake-item__subject">${UI.subjectLabel(m.subject)}</span>
                            <span class="mb-grid-card__date">${UI.formatDate(m.created_at)}</span>
                        </div>
                        <div class="mb-grid-card__question">${isProcessing ? progressMsgLong : UI.escapeHtml(question)}</div>
                        ${m.error_type ? `<span class="mb-mistake-item__tag">${UI.errorTypeLabel(m.error_type)}</span>` : ''}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        listEl.innerHTML = html;
    },

    /** 不重新拉取數據，僅切換視圖渲染 */
    _renderCurrentMistakes() {
        const items = App.state.mistakes?.items || [];
        this._renderMistakeList(items);
        // 更新切換按鈕狀態
        document.querySelectorAll('.mb-view-toggle__btn').forEach(btn => {
            btn.classList.toggle('mb-view-toggle__btn--active', btn.dataset.view === App.state.viewMode);
        });
    },

    _processingPollTimer: null,
    _processingPollStart: 0,

    _startProcessingPoll() {
        if (this._processingPollTimer) return; // already polling
        this._processingPollStart = Date.now();
        this._fetchQueueStatus();
        this._processingPollTimer = setInterval(async () => {
            // Stop after 5 minutes max
            if (Date.now() - this._processingPollStart > 5 * 60 * 1000) {
                this._stopProcessingPoll();
                return;
            }
            // Only refresh if we're on the home tab
            if (App.state.currentTab !== 'home') return;
            await Views.refreshMistakeList();
            this._fetchQueueStatus();
        }, 5000);
    },

    _stopProcessingPoll() {
        if (this._processingPollTimer) {
            clearInterval(this._processingPollTimer);
            this._processingPollTimer = null;
        }
        // Remove queue hint
        const hint = document.getElementById('mbQueueHint');
        if (hint) hint.remove();
    },

    async _fetchQueueStatus() {
        try {
            const res = await fetch('/api/mistakes/queue-status', {
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
            });
            if (!res.ok) return;
            const data = await res.json();
            const queued = data.queued || 0;
            const running = data.running || 0;
            const estWait = data.est_wait_seconds || 0;
            const avgDur = data.avg_duration || 0;
            let hint = document.getElementById('mbQueueHint');
            if (queued > 0 || running > 0) {
                const _fmt = (s) => s >= 60 ? `${Math.floor(s/60)}分${s%60?Math.round(s%60)+'秒':''}` : `${Math.round(s)}秒`;
                let msg = `AI 隊列：${running} 個任務執行中`;
                if (queued > 0) {
                    msg += `，${queued} 個排隊等待`;
                    if (estWait > 0) msg += `（預計 ${_fmt(estWait)}）`;
                }
                if (!hint) {
                    hint = document.createElement('div');
                    hint.id = 'mbQueueHint';
                    hint.className = 'mb-queue-hint';
                    const listEl = document.getElementById('mistakeList');
                    if (listEl) listEl.parentNode.insertBefore(hint, listEl);
                }
                hint.innerHTML = `<span class="mb-queue-hint__icon">&#9203;</span> ${msg}`;
            } else if (hint) {
                hint.remove();
            }

            // 更新每張處理中卡片的等待提示
            document.querySelectorAll('.mb-processing-wait').forEach(el => {
                if (avgDur > 0) {
                    el.textContent = `平均耗時 ${Math.round(avgDur)}秒`;
                }
            });
        } catch (e) { /* ignore */ }
    },

    /* ---- 錯題詳情 ---- */
    async openDetail(mistakeId) {
        const panel = document.getElementById('detailPanel');
        panel.classList.add('mb-detail-panel--active');
        panel.innerHTML = UI.loading();

        const res = await API.getMistakeDetail(mistakeId);
        if (!res || !res.data) {
            panel.innerHTML = UI.empty('', '載入失敗');
            return;
        }

        const m = res.data;
        const kps = m.knowledge_points || [];

        // needs_review: show OCR confirm flow
        if (m.status === 'needs_review') {
            panel.innerHTML = `
                <header class="mb-header">
                    <div class="mb-header__title">
                        <a href="javascript:void(0)" onclick="Views.closeDetail()">${Icons.chevronL(18)}</a>
                        <span>確認識別結果</span>
                    </div>
                </header>
                <div class="mb-detail-section" style="padding:16px">
                    <div style="font-size:13px;color:var(--mb-warning);margin-bottom:12px">
                        OCR 識別信心度較低，請確認或修正以下內容
                    </div>
                    <div class="mb-ocr-confirm__label">題目（可修正）</div>
                    <textarea class="mb-ocr-confirm__textarea" id="reviewQuestion">${UI.escapeHtml(m.ocr_question_text || '')}</textarea>
                    <div class="mb-ocr-confirm__label" style="margin-top:8px">我的答案（可修正）</div>
                    <textarea class="mb-ocr-confirm__textarea" id="reviewAnswer">${UI.escapeHtml(m.ocr_answer_text || '')}</textarea>
                    <button class="mb-btn mb-btn--primary mb-btn--full" style="margin-top:12px"
                            onclick="Views._confirmReview('${m.mistake_id}')">
                        確認並分析
                    </button>
                </div>
            `;
            return;
        }

        // ---- 分層佈局：預計算提取數據 ----
        const errorSummary   = UI.extractErrorSummary(m);
        const keyInsight     = UI.extractKeyInsight(m);
        const firstTip       = UI.extractFirstTip(m);
        const studentBullets = UI.summarizeStudentApproach(m);
        const correctBullets = UI.summarizeCorrectAnswer(m);
        const rawAnalysis    = UI.extractRawAnalysis(m);
        const hasCompare     = studentBullets.length > 0 || correctBullets.length > 0;
        const hasSummary     = errorSummary || keyInsight || firstTip;

        // 分析文字截斷邏輯
        const analysisId = 'detail_analysis_' + Date.now();
        const analysisNeedsTruncate = rawAnalysis.length > 500;
        const analysisTruncated = analysisNeedsTruncate ? rawAnalysis.substring(0, 300) : rawAnalysis;

        panel.innerHTML = `
            <header class="mb-header">
                <div class="mb-header__title">
                    <a href="javascript:void(0)" onclick="Views.closeDetail()">${Icons.chevronL(18)}</a>
                    <span>錯題詳情</span>
                </div>
                <div class="mb-header__actions">
                    <span class="mb-mistake-item__subject">${UI.subjectLabel(m.subject)}</span>
                </div>
            </header>

            ${(() => {
                const structuredHtml = m.figure_description ? GeoDisplay.renderFigureDetail(m.figure_description) : null;
                if (structuredHtml) return `<div class="mb-detail-section">${structuredHtml}</div>`;
                if (m.figure_description_readable) return `<div class="mb-detail-section">
                    <div class="mb-figure-desc">
                        <div class="mb-figure-desc__title">📐 幾何圖形描述</div>
                        <div class="mb-figure-desc__item">${UI.renderMath(m.figure_description_readable)}</div>
                    </div>
                </div>`;
                return '';
            })()}

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.bookOpen(16)} 題目</div>
                <div class="mb-detail-section__body">${UI.formatQuestion(m.question_text || '')}</div>
            </div>

            ${hasSummary ? `
            <div class="mb-summary-card${!m.error_type && errorSummary ? ' mb-summary-card--correct' : ''}">
                <div class="mb-summary-card__header">${m.error_type ? '錯因摘要' : '分析摘要'}</div>
                ${errorSummary ? `
                <div class="mb-summary-card__row">
                    <div class="mb-summary-card__label">${m.error_type ? '主要錯因' : '評估'}</div>
                    <div class="mb-summary-card__value ${m.error_type ? 'mb-summary-card__value--error' : 'mb-summary-card__value--correct'}">${UI.renderMath(errorSummary)}</div>
                </div>` : ''}
                ${keyInsight ? `
                <div class="mb-summary-card__row">
                    <div class="mb-summary-card__label">核心考點</div>
                    <div class="mb-summary-card__value">${UI.renderMath(keyInsight)}</div>
                </div>` : ''}
                ${firstTip ? `
                <div class="mb-summary-card__row">
                    <div class="mb-summary-card__label">改進要點</div>
                    <div class="mb-summary-card__value mb-summary-card__value--tip">${UI.renderMath(firstTip)}</div>
                </div>` : ''}
            </div>` : ''}

            ${hasCompare ? `
            <div class="mb-collapse mb-collapse--open">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">思路對比</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div class="mb-compare-grid">
                        ${studentBullets.length ? `
                        <div class="mb-compare-section">
                            <div class="mb-compare-label">我的做法</div>
                            <ul class="mb-compare-list">${studentBullets.map(b => `<li>${UI.renderMath(b)}</li>`).join('')}</ul>
                        </div>` : ''}
                        ${correctBullets.length ? `
                        <div class="mb-compare-section">
                            <div class="mb-compare-label mb-compare-label--correct">正確做法</div>
                            <ul class="mb-compare-list">${correctBullets.map(b => `<li>${UI.renderMath(b)}</li>`).join('')}</ul>
                        </div>` : ''}
                    </div>
                </div>
            </div>` : ''}

            ${m.correct_answer ? `
            <div class="mb-collapse mb-collapse--open">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">參考解法</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div class="mb-step-intro">以下為此題完整解題步驟</div>
                    <div class="mb-step-layout">${UI.renderMath(m.correct_answer)}</div>
                </div>
            </div>` : ''}

            ${rawAnalysis ? `
            <div class="mb-collapse mb-collapse--open">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">詳細分析</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div id="${analysisId}">
                        ${analysisNeedsTruncate
                            ? `<div class="mb-analysis-truncated">${UI.renderMath(analysisTruncated)}…</div>
                               <div class="mb-analysis-full" style="display:none">${UI.renderMath(rawAnalysis)}</div>
                               <span class="mb-analysis-expand" onclick="
                                   var wrap = this.parentElement;
                                   wrap.querySelector('.mb-analysis-truncated').style.display='none';
                                   wrap.querySelector('.mb-analysis-full').style.display='block';
                                   this.remove();
                               ">顯示完整分析</span>`
                            : UI.renderMath(rawAnalysis)
                        }
                    </div>
                    ${m.error_type ? `<div style="margin-top:10px"><span class="mb-kp-tag mb-kp-tag--weak">${UI.errorTypeLabel(m.error_type)}</span></div>` : ''}
                </div>
            </div>` : ''}

            ${kps.length ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.target(16)} 關聯知識點</div>
                <div>${kps.map(kp => `<span class="mb-kp-tag mb-kp-tag--medium">${UI.escapeHtml(kp.point_name)}</span>`).join('')}</div>
            </div>` : ''}

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.barChart(16)} 掌握狀態</div>
                <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:24px;font-weight:700;letter-spacing:-0.02em">${m.mastery_level || 0}%</span>
                    <div style="flex:1">
                        <div class="mb-mastery-bar">
                            <div class="mb-mastery-bar__fill mb-mastery-bar__fill--${UI.masteryClass(m.mastery_level || 0)}"
                                 style="width:${m.mastery_level || 0}%"></div>
                        </div>
                    </div>
                </div>
                <div style="font-size:12px;color:var(--mb-text-tertiary);margin-top:8px">
                    已複習 ${m.review_count || 0} 次
                    ${m.next_review_at ? ` · 下次複習 ${UI.formatDate(m.next_review_at)}` : ''}
                </div>
            </div>

            ${m.original_image_path ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.image(16)} 原始照片${m.extra_image_paths ? ' (' + (JSON.parse(m.extra_image_paths).length + 1) + ' 張)' : ''}</div>
                <div style="display:flex;flex-wrap:wrap;gap:8px">
                    <img src="/uploads/mistakes/${m.original_image_path.split('uploads/mistakes/')[1] || ''}"
                         style="max-width:100%;border-radius:8px;cursor:pointer" alt="照片 1"
                         onclick="window.open(this.src,'_blank')"
                         onerror="this.style.display='none'">
                    ${(() => {
                        if (!m.extra_image_paths) return '';
                        try {
                            const extras = JSON.parse(m.extra_image_paths);
                            return extras.map((p, i) =>
                                '<img src="/uploads/mistakes/' + (p.split('uploads/mistakes/')[1] || '') + '"'
                                + ' style="max-width:100%;border-radius:8px;cursor:pointer" alt="照片 ' + (i + 2) + '"'
                                + ' onclick="window.open(this.src,\'_blank\')"'
                                + ' onerror="this.style.display=\'none\'">'
                            ).join('');
                        } catch(e) { return ''; }
                    })()}
                </div>
            </div>` : ''}

            <div style="padding:20px;text-align:center">
                <button class="mb-btn mb-btn--danger mb-btn--sm"
                        onclick="if(confirm('確定刪除？')){API.deleteMistake('${m.mistake_id}').then(()=>{Views.closeDetail();App.navigate('home')})}">
                    ${Icons.trash(14)} 刪除此錯題
                </button>
            </div>
        `;
    },

    closeDetail() {
        document.getElementById('detailPanel').classList.remove('mb-detail-panel--active');
    },

    async _confirmReview(mistakeId) {
        const q = document.getElementById('reviewQuestion')?.value?.trim();
        const a = document.getElementById('reviewAnswer')?.value?.trim();
        if (!q || !a) { UI.toast('請填寫題目和答案', 'error'); return; }

        const panel = document.getElementById('detailPanel');
        panel.innerHTML = UI.loading('AI 分析中，預計需要 30-60 秒...');

        try {
            const res = await fetch(`/api/mistakes/${mistakeId}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${App.state.token}` },
                body: JSON.stringify({ confirmed_question: q, confirmed_answer: a }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
                UI.toast('分析完成！', 'success');
                this.closeDetail();
                App.navigate('home');
            } else {
                UI.toast(`分析失敗: ${data.detail || '未知錯誤'}`, 'error');
                this.openDetail(mistakeId); // reload
            }
        } catch (err) {
            UI.toast(`網絡錯誤: ${err.message}`, 'error');
            this.openDetail(mistakeId);
        }
    },

    /* ---- 學習 Tab（合併複習 + 練習） ---- */
    async renderLearn(container) {
        if (!App.state._learnMode) App.state._learnMode = 'review';
        const mode = App.state._learnMode;

        // Pre-fetch review queue
        const subject = App.state.currentSubject;
        const reviewRes = await API.getReviewQueue(subject);
        const reviewItems = reviewRes?.data?.items || [];
        const reviewCount = reviewItems.length;

        // Update tab badge
        const badge = document.getElementById('learnBadge');
        if (badge) {
            if (reviewCount > 0) { badge.textContent = reviewCount; badge.style.display = ''; }
            else { badge.style.display = 'none'; }
        }

        container.innerHTML = `
            <div class="mb-segmented-control">
                <button class="mb-segmented-control__item${mode === 'review' ? ' mb-segmented-control__item--active' : ''}"
                        data-mode="review">復習${reviewCount > 0 ? ` (${reviewCount})` : ''}</button>
                <button class="mb-segmented-control__item${mode === 'practice' ? ' mb-segmented-control__item--active' : ''}"
                        data-mode="practice">練習</button>
            </div>
            <div id="learnContent"></div>
        `;

        // Bind segmented control
        container.querySelector('.mb-segmented-control').addEventListener('click', e => {
            const btn = e.target.closest('.mb-segmented-control__item');
            if (!btn || btn.classList.contains('mb-segmented-control__item--active')) return;
            App.state._learnMode = btn.dataset.mode;
            container.querySelectorAll('.mb-segmented-control__item').forEach(b =>
                b.classList.toggle('mb-segmented-control__item--active', b.dataset.mode === btn.dataset.mode));
            const content = document.getElementById('learnContent');
            content.innerHTML = UI.loading();
            if (btn.dataset.mode === 'review') {
                this.renderReview(content);
            } else {
                this.renderPractice(content);
            }
        });

        // Render initial content
        const content = document.getElementById('learnContent');
        if (mode === 'review') {
            if (reviewItems.length) {
                App.state._reviewQueue = reviewItems;
                App.state._reviewIdx = 0;
                this._renderReviewCard(content);
            } else {
                content.innerHTML = `<div class="mb-empty-state">
                    <div class="mb-empty-state__icon">${Icons.check(40)}</div>
                    <div class="mb-empty-state__title">今日複習已完成</div>
                    <div class="mb-empty-state__desc">沒有需要複習的錯題，去練習提升吧</div>
                </div>`;
            }
        } else {
            this.renderPractice(content);
        }
    },

    /* ---- 複習頁 ---- */
    async renderReview(container) {
        const subject = App.state.currentSubject;
        const res = await API.getReviewQueue(subject);
        const items = res?.data?.items || [];

        if (!items.length) {
            container.innerHTML = UI.empty('', '太棒了！今天沒有需要複習的錯題。');
            return;
        }

        App.state._reviewQueue = items;
        App.state._reviewIdx = 0;
        this._renderReviewCard(container);
    },

    _renderReviewCard(container) {
        const items = App.state._reviewQueue;
        const idx = App.state._reviewIdx;

        if (idx >= items.length) {
            container.innerHTML = UI.empty('', `今天的複習完成了！共複習了 ${items.length} 題。`);
            return;
        }

        const m = items[idx];
        const progress = ((idx) / items.length) * 100;

        container.innerHTML = `
            <div class="mb-review-progress">
                <div class="mb-review-progress__fill" style="width:${progress}%"></div>
            </div>

            <div style="text-align:center;padding:16px 20px 4px;font-size:13px;color:var(--mb-text-tertiary)">
                ${idx + 1} / ${items.length}
                · ${UI.subjectLabel(m.subject)}
            </div>

            <div class="mb-review-card" id="reviewCard" onclick="document.getElementById('reviewCard').classList.add('mb-review-card--revealed')">
                <div style="font-size:15px;line-height:1.65">${UI.renderMath(m.question_text || '（未識別）')}</div>
                <div class="mb-review-card__answer">
                    <div style="font-size:13px;color:var(--mb-text-secondary);margin-bottom:8px">點擊下方按鈕記錄複習結果</div>
                    ${m.correct_answer ? `<div style="font-size:14px;line-height:1.6">${UI.renderMath(m.correct_answer)}</div>` : ''}
                </div>
            </div>

            <div class="mb-review-actions">
                <button class="mb-review-btn mb-review-btn--forgot" onclick="Views._submitReview('${m.mistake_id}','forgot')">
                    忘記了
                </button>
                <button class="mb-review-btn mb-review-btn--partial" onclick="Views._submitReview('${m.mistake_id}','partial')">
                    想起部分
                </button>
                <button class="mb-review-btn mb-review-btn--remembered" onclick="Views._submitReview('${m.mistake_id}','remembered')">
                    記住了
                </button>
            </div>
        `;
    },

    async _submitReview(mistakeId, result) {
        await API.recordReview(mistakeId, result);
        App.state._reviewIdx++;
        // Use learnContent if inside Learn tab, otherwise mainContent
        const container = document.getElementById('learnContent') || document.getElementById('mainContent');
        this._renderReviewCard(container);
    },

    /* ---- 練習頁 ---- */
    async renderPractice(container) {
        const subject = App.state.currentSubject;
        if (subject === 'all') {
            container.innerHTML = `
                <div class="mb-practice-setup">
                    <div class="mb-practice-setup__icon">${Icons.target(40)}</div>
                    <div class="mb-practice-setup__title">AI 智能練習</div>
                    <div class="mb-practice-setup__desc">選擇一個科目，根據薄弱知識點自動出題</div>
                    <div class="mb-practice-subjects"></div>
                </div>
            `;
            const subjectsDiv = container.querySelector('.mb-practice-subjects');
            subjectsDiv.innerHTML = (App.state.subjects || []).map(s =>
                `<button class="mb-btn mb-btn--secondary" data-practice-subject="${s.subject_code}">${s.display_name}</button>`
            ).join('');
            subjectsDiv.addEventListener('click', e => {
                const btn = e.target.closest('[data-practice-subject]');
                if (btn) {
                    App.state.currentSubject = btn.dataset.practiceSubject;
                    this.renderPractice(container);
                }
            });
            return;
        }

        container.innerHTML = `
            <div class="mb-practice-setup">
                <div class="mb-practice-setup__icon">${Icons.target(40)}</div>
                <div class="mb-practice-setup__title">AI 智能練習</div>
                <div class="mb-practice-setup__desc">
                    根據你的${UI.subjectLabel(subject)}薄弱知識點自動出題
                </div>

                <!-- 知識點選擇器 -->
                <div class="mb-practice-setup__points" id="practicePointsArea">
                    <div class="mb-practice-setup__label" style="text-align:left;margin-bottom:8px">
                        選擇知識點
                        <span style="font-weight:400;color:var(--mb-text-tertiary)">（不選則由系統智能推薦）</span>
                    </div>
                    <div id="practicePointsList" style="text-align:left;margin-bottom:12px">
                        <div style="padding:20px;text-align:center;color:var(--mb-text-tertiary);font-size:13px">
                            載入知識點中...
                        </div>
                    </div>
                    <div id="practicePointsActions" style="display:none;text-align:left;margin-bottom:16px;gap:8px;display:flex;flex-wrap:wrap">
                        <button class="mb-btn mb-btn--ghost mb-btn--sm" onclick="Views._practiceSelectWeak()">只選薄弱</button>
                        <button class="mb-btn mb-btn--ghost mb-btn--sm" onclick="Views._practiceSelectAll()">全選</button>
                        <button class="mb-btn mb-btn--ghost mb-btn--sm" onclick="Views._practiceClearAll()">清空</button>
                    </div>
                    <div id="practicePointsWarning" style="display:none;font-size:12px;color:var(--mb-warning);margin-bottom:8px"></div>
                </div>

                <div class="mb-practice-setup__form">
                    <label class="mb-practice-setup__label">題目數量</label>
                    <select class="mb-select" id="practiceCount">
                        <option value="3">3 題 · 快速練習</option>
                        <option value="5" selected>5 題 · 標準練習</option>
                        <option value="10">10 題 · 深度練習</option>
                    </select>
                </div>

                <div class="mb-practice-setup__form">
                    <label class="mb-practice-setup__label">難度</label>
                    <select class="mb-select" id="practiceDifficulty">
                        <option value="" selected>自動匹配（根據掌握度）</option>
                        <option value="1">基礎</option>
                        <option value="3">中等</option>
                        <option value="5">進階</option>
                    </select>
                </div>

                <!-- 練習計劃預覽 -->
                <div id="practicePlanPreview" style="display:none;margin-bottom:16px;padding:12px;border-radius:8px;background:var(--mb-bg-secondary);text-align:left;font-size:13px;color:var(--mb-text-secondary)">
                </div>

                <button class="mb-btn mb-btn--primary mb-btn--full" onclick="Views._startPractice('${subject}')"
                        id="startPracticeBtn" style="max-width:240px">
                    開始練習
                </button>
            </div>
        `;

        // 加載知識點掌握度數據
        this._loadPracticeMastery(subject);
    },

    // ---- 練習知識點加載 ----
    _practiceAbortController: null,
    _practiceMasteryData: [],

    async _loadPracticeMastery(subject) {
        // 取消舊請求
        if (this._practiceAbortController) {
            this._practiceAbortController.abort();
        }
        this._practiceAbortController = new AbortController();
        this._practiceMasteryData = [];

        const listEl = document.getElementById('practicePointsList');
        const actionsEl = document.getElementById('practicePointsActions');
        if (!listEl) return;

        try {
            const res = await API.getPracticeMastery(subject);
            // 檢查是否已切換科目
            if (!document.getElementById('practicePointsList')) return;

            if (!res || !res.data || res.data.length === 0) {
                listEl.innerHTML = `<div style="padding:12px;text-align:center;color:var(--mb-text-tertiary);font-size:13px">
                    暫無知識點數據，仍可直接開始練習
                </div>`;
                return;
            }

            this._practiceMasteryData = res.data;
            this._renderPracticePointsList(listEl, res.data);
            if (actionsEl) actionsEl.style.display = 'flex';
        } catch (e) {
            if (e.name === 'AbortError') return;
            listEl.innerHTML = `<div style="padding:12px;text-align:center;color:var(--mb-text-tertiary);font-size:13px">
                掌握度數據暫不可用，仍可直接開始練習
            </div>`;
        }
    },

    _renderPracticePointsList(container, data) {
        const statusLabels = {
            weak: { text: '薄弱', color: 'var(--mb-danger, #e74c3c)' },
            consolidating: { text: '待鞏固', color: 'var(--mb-warning, #f39c12)' },
            mastered: { text: '已掌握', color: 'var(--mb-success, #27ae60)' },
            unknown: { text: '暫無數據', color: 'var(--mb-text-tertiary)' },
        };

        const html = data.map((pt, i) => {
            const sl = statusLabels[pt.status_label] || statusLabels.unknown;
            const mastery = pt.mastery_level !== null ? `${pt.mastery_level}%` : '--';
            const checked = pt.is_recommended ? 'checked' : '';

            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 0;cursor:pointer;font-size:13px;border-bottom:1px solid var(--mb-border)">
                <input type="checkbox" class="practice-point-cb" value="${UI.escapeHtml(pt.point_code)}" ${checked} onchange="Views._onPracticePointChange()">
                <span style="flex:1">${UI.escapeHtml(pt.point_name)}</span>
                <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:${sl.color}22;color:${sl.color};font-weight:500">${sl.text}</span>
                <span style="font-size:12px;color:var(--mb-text-tertiary);min-width:36px;text-align:right">${mastery}</span>
            </label>`;
        }).join('');

        container.innerHTML = `<div style="max-height:260px;overflow-y:auto;border:1px solid var(--mb-border);border-radius:8px;padding:4px 12px">${html}</div>`;
    },

    _onPracticePointChange() {
        const checked = document.querySelectorAll('.practice-point-cb:checked');
        const warningEl = document.getElementById('practicePointsWarning');
        if (warningEl) {
            if (checked.length > 8) {
                warningEl.style.display = 'block';
                warningEl.textContent = `已選 ${checked.length} 個知識點，建議一次聚焦不超過 5 個`;
            } else {
                warningEl.style.display = 'none';
            }
        }
        this._updatePracticePlanPreview();
    },

    _practiceSelectWeak() {
        document.querySelectorAll('.practice-point-cb').forEach((cb, i) => {
            const pt = this._practiceMasteryData[i];
            cb.checked = pt && pt.is_recommended;
        });
        this._onPracticePointChange();
    },

    _practiceSelectAll() {
        document.querySelectorAll('.practice-point-cb').forEach(cb => cb.checked = true);
        this._onPracticePointChange();
    },

    _practiceClearAll() {
        document.querySelectorAll('.practice-point-cb').forEach(cb => cb.checked = false);
        this._onPracticePointChange();
    },

    _getSelectedPracticePoints() {
        const checked = document.querySelectorAll('.practice-point-cb:checked');
        return Array.from(checked).map(cb => cb.value);
    },

    _updatePracticePlanPreview() {
        const previewEl = document.getElementById('practicePlanPreview');
        if (!previewEl) return;

        const selected = this._getSelectedPracticePoints();
        const count = document.getElementById('practiceCount')?.value || 5;
        const diffEl = document.getElementById('practiceDifficulty');
        const diffVal = diffEl?.value;
        const diffLabel = diffVal ? diffEl.options[diffEl.selectedIndex].text : '自動匹配';

        if (selected.length === 0) {
            previewEl.style.display = 'block';
            previewEl.innerHTML = `將由系統根據薄弱點智能推薦知識點 · ${count} 題 · 難度：${diffLabel}`;
            return;
        }

        const pointNames = selected.map(code => {
            const pt = this._practiceMasteryData.find(p => p.point_code === code);
            return pt ? pt.point_name : code;
        });

        previewEl.style.display = 'block';
        previewEl.innerHTML = `${pointNames.join('、')} · ${count} 題 · 難度：${diffLabel}`;
    },

    async _startPractice(subject) {
        const btn = document.getElementById('startPracticeBtn');
        if (btn.disabled) return; // 防重複點擊
        btn.disabled = true;
        btn.textContent = 'AI 出題中...';

        const count = parseInt(document.getElementById('practiceCount').value);
        const targetPoints = this._getSelectedPracticePoints();
        const diffVal = document.getElementById('practiceDifficulty')?.value;
        const difficulty = diffVal ? parseInt(diffVal) : null;

        const res = await API.generatePractice(subject, count, targetPoints.length > 0 ? targetPoints : null, difficulty);

        if (!res || !res.data) {
            btn.disabled = false;
            btn.textContent = '開始練習';
            return;
        }

        App.state._practiceSession = res.data;
        const target = document.getElementById('learnContent') || document.getElementById('mainContent');

        // 如果是系統推薦模式，先顯示推薦信息
        if (res.data.recommendation_mode === 'auto_recommended' && res.data.recommended_points?.length > 0) {
            const pointNames = res.data.recommended_points.map(p =>
                `${p.point_name}${p.mastery_level !== null ? ` (${p.mastery_level}%)` : ''}`
            ).join('、');
            App.state._practiceSession._recommendedInfo = pointNames;
        }

        this._renderPracticeQuestions(target, res.data);
    },

    // ---- 練習題渲染 + 手寫識別 ----

    // 每題 state：{mode, strokes, imagePreview, loading}
    _practiceInputStates: {},

    _renderPracticeQuestions(container, session) {
        const questions = session.questions || [];
        const recommendedInfo = session._recommendedInfo || '';
        const diffLabel = session.difficulty ? `難度 ${session.difficulty}/5` : '';
        this._practiceInputStates = {};

        let headerInfo = `${UI.subjectLabel(session.subject)} · ${questions.length} 題`;
        if (diffLabel) headerInfo += ` · ${diffLabel}`;

        let html = `<div class="mb-practice">
            <div style="text-align:center;font-size:13px;color:var(--mb-text-tertiary);margin-bottom:16px">
                ${headerInfo}
            </div>`;

        if (recommendedInfo) {
            html += `<div style="text-align:center;font-size:12px;color:var(--mb-text-tertiary);margin-bottom:16px;padding:8px 12px;background:var(--mb-bg-secondary);border-radius:8px">
                系統推薦知識點：${UI.escapeHtml(recommendedInfo)}
            </div>`;
        }

        questions.forEach((q, i) => {
            this._practiceInputStates[i] = { mode: 'keyboard', strokes: [], imagePreview: null, loading: false };
            const isMultiChoice = !!q.options;
            html += `
                <div class="mb-practice__question">
                    <div class="mb-practice__question-number">第 ${q.index || i + 1} 題</div>
                    <div class="mb-practice__question-text">${UI.renderMath(q.question)}</div>
                    ${isMultiChoice ? `<div style="margin-top:12px">${q.options.map((opt, oi) =>
                        `<label style="display:block;padding:8px 0;cursor:pointer;font-size:14px">
                            <input type="radio" name="q_${i}" value="${UI.escapeHtml(opt)}"> ${UI.renderMath(opt)}
                        </label>`
                    ).join('')}</div>` : `
                    <div class="mb-hw" id="hw_wrap_${i}">
                        <div class="mb-hw__modes">
                            <button class="mb-hw__mode-btn mb-hw__mode-btn--active" data-mode="keyboard" onclick="Views._switchInputMode(${i},'keyboard')" title="鍵盤">⌨️ 鍵盤</button>
                            <button class="mb-hw__mode-btn" data-mode="handwrite" onclick="Views._switchInputMode(${i},'handwrite')" title="手寫">✏️ 手寫</button>
                            <button class="mb-hw__mode-btn" data-mode="photo" onclick="Views._switchInputMode(${i},'photo')" title="拍照">📷 拍照</button>
                        </div>
                        <div class="mb-hw__panel" id="hw_panel_${i}">
                            <textarea class="mb-practice__answer-input" id="answer_${i}" placeholder="在此輸入你的答案..."></textarea>
                        </div>
                    </div>`}
                </div>
            `;
        });

        html += `<button class="mb-btn mb-btn--primary mb-btn--full" onclick="Views._submitAllPractice()">
                    提交答案
                 </button></div>`;

        container.innerHTML = html;
    },

    _switchInputMode(idx, mode) {
        const state = this._practiceInputStates[idx];
        if (!state || state.mode === mode) return;

        // 保存 textarea 值（只在鍵盤模式下保存，其他模式的 textarea 是占位符）
        if (state.mode === 'keyboard') {
            const ta = document.getElementById(`answer_${idx}`);
            if (ta) state.textareaValue = ta.value;
        }

        state.mode = mode;

        // 更新按鈕 active
        const wrap = document.getElementById(`hw_wrap_${idx}`);
        if (!wrap) return;
        wrap.querySelectorAll('.mb-hw__mode-btn').forEach(btn => {
            btn.classList.toggle('mb-hw__mode-btn--active', btn.dataset.mode === mode);
        });

        const panel = document.getElementById(`hw_panel_${idx}`);
        if (!panel) return;

        if (mode === 'keyboard') {
            const val = state.textareaValue || '';
            // 先放 textarea
            panel.innerHTML = `<textarea class="mb-practice__answer-input mb-practice__answer-input--auto" id="answer_${idx}" placeholder="在此輸入你的答案..."></textarea>`;
            const ta = document.getElementById(`answer_${idx}`);
            if (ta) {
                ta.value = val; // 用 .value 設置，避免 HTML 轉義問題
                this._autoResizeTextarea(ta);
                // 有內容則插入渲染預覽
                if (val.trim()) {
                    this._updateAnswerPreview(idx, val);
                }
                ta.addEventListener('input', () => {
                    this._autoResizeTextarea(ta);
                    state.textareaValue = ta.value;
                    this._updateAnswerPreview(idx, ta.value);
                });
            }
        } else if (mode === 'handwrite') {
            this._renderHandwritePanel(panel, idx);
        } else if (mode === 'photo') {
            this._renderPhotoPanel(panel, idx);
        }
    },

    _updateAnswerPreview(idx, text) {
        const ta = document.getElementById(`answer_${idx}`);
        if (!ta) return;
        let preview = document.getElementById(`hw_preview_${idx}`);
        if (text.trim()) {
            if (!preview) {
                preview = document.createElement('div');
                preview.className = 'mb-hw__preview';
                preview.id = `hw_preview_${idx}`;
                ta.parentElement.insertBefore(preview, ta);
            }
            preview.innerHTML = UI.renderMath(text);
        } else if (preview) {
            preview.remove();
        }
    },

    _autoResizeTextarea(ta) {
        ta.style.height = 'auto';
        ta.style.height = Math.max(60, ta.scrollHeight) + 'px';
    },

    _renderHandwritePanel(panel, idx) {
        // 手寫模式：打開全屏彈層
        // panel 內只放一個提示 + textarea（回到鍵盤模式時會被替換）
        const state = this._practiceInputStates[idx];
        panel.innerHTML = `
            <textarea class="mb-practice__answer-input mb-hw__result-ta" id="answer_${idx}" placeholder="識別結果將顯示在這裡，也可手動輸入...">${UI.escapeHtml(state.textareaValue || '')}</textarea>
        `;
        this._openHandwriteModal(idx);
    },

    _openHandwriteModal(idx) {
        const state = this._practiceInputStates[idx];
        if (!state.pencilMode) state.pencilMode = false;
        if (!state.canvasTransform) state.canvasTransform = { scale: 1, tx: 0, ty: 0 };
        const session = App.state._practiceSession;
        const q = session && session.questions ? session.questions[idx] : null;
        const questionText = q ? q.question : '';

        const overlay = document.createElement('div');
        overlay.className = 'mb-hw__fullscreen-overlay';
        overlay.id = `hw_modal_${idx}`;
        overlay.innerHTML = `
            <div class="mb-hw__fullscreen">
                <div class="mb-hw__fullscreen-header">
                    <span class="mb-hw__fullscreen-title">第 ${(q && q.index) || idx + 1} 題 · 手寫輸入</span>
                    <button class="mb-hw__fullscreen-close" id="hw_modal_close_${idx}">✕</button>
                </div>
                <div class="mb-hw__fullscreen-question">${UI.renderMath(questionText)}</div>
                <div class="mb-hw__fullscreen-canvas-area" id="hw_canvas_area_${idx}">
                    <div class="mb-hw__canvas-wrap mb-hw__canvas-wrap--full" id="hw_canvas_container_${idx}">
                        <canvas class="mb-hw__canvas" id="hw_canvas_${idx}"></canvas>
                    </div>
                </div>
                <div class="mb-hw__fullscreen-toolbar">
                    <div class="mb-hw__pen-toggle" id="hw_pen_toggle_${idx}">
                        <button class="mb-hw__pen-btn ${state.pencilMode ? '' : 'mb-hw__pen-btn--active'}" data-pen="finger" onclick="Views._setPencilMode(${idx}, false)">👆 手指</button>
                        <button class="mb-hw__pen-btn ${state.pencilMode ? 'mb-hw__pen-btn--active' : ''}" data-pen="pencil" onclick="Views._setPencilMode(${idx}, true)">✏️ Pencil</button>
                    </div>
                    <button class="mb-hw__tool-btn" onclick="Views._hwUndo(${idx})">↩</button>
                    <button class="mb-hw__tool-btn" onclick="Views._hwClear(${idx})">🗑</button>
                    <button class="mb-hw__tool-btn" onclick="Views._hwResetZoom(${idx})">⊙</button>
                    <button class="mb-hw__tool-btn mb-hw__tool-btn--primary mb-hw__tool-btn--lg" id="hw_recognize_${idx}" onclick="Views._hwRecognize(${idx})">
                        識別
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById(`hw_modal_close_${idx}`).onclick = () => overlay.remove();

        requestAnimationFrame(() => this._initCanvas(idx));
    },

    _closeHandwriteModal(idx) {
        const modal = document.getElementById(`hw_modal_${idx}`);
        if (modal) modal.remove();
    },

    _setPencilMode(idx, pencilMode) {
        const state = this._practiceInputStates[idx];
        if (!state) return;
        state.pencilMode = pencilMode;
        const toggle = document.getElementById(`hw_pen_toggle_${idx}`);
        if (toggle) {
            toggle.querySelectorAll('.mb-hw__pen-btn').forEach(btn => {
                const isPencil = btn.dataset.pen === 'pencil';
                btn.classList.toggle('mb-hw__pen-btn--active', isPencil === pencilMode);
            });
        }
    },

    _hwResetZoom(idx) {
        const state = this._practiceInputStates[idx];
        if (!state) return;
        state.canvasTransform = { scale: 1, tx: 0, ty: 0 };
        const canvas = document.getElementById(`hw_canvas_${idx}`);
        if (canvas) {
            canvas.style.transform = '';
        }
    },

    _applyCanvasTransform(idx) {
        const state = this._practiceInputStates[idx];
        const canvas = document.getElementById(`hw_canvas_${idx}`);
        if (!state || !canvas) return;
        const tf = state.canvasTransform;
        canvas.style.transformOrigin = '0 0';
        canvas.style.transform = `translate(${tf.tx}px, ${tf.ty}px) scale(${tf.scale})`;
    },

    _initCanvas(idx) {
        const canvas = document.getElementById(`hw_canvas_${idx}`);
        if (!canvas) return;
        const state = this._practiceInputStates[idx];
        const container = canvas.parentElement;

        // 高 DPI 適配
        const containerRect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const cssW = containerRect.width || 320;
        const cssH = containerRect.height || 300;
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
        canvas.width = cssW * dpr;
        canvas.height = cssH * dpr;
        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#222';

        // 恢復已有 transform
        if (state.canvasTransform && state.canvasTransform.scale !== 1) {
            this._applyCanvasTransform(idx);
        }

        // 重繪已有 strokes
        this._hwRedraw(canvas, state.strokes);

        // ---- Pointer + Gesture 處理 ----
        const activePointers = new Map();
        let drawing = false;
        let currentStroke = [];
        let isPanning = false;
        let lastPinchDist = null;
        let lastPinchCenter = null;

        const getTf = () => state.canvasTransform || { scale: 1, tx: 0, ty: 0 };

        // 螢幕座標 → canvas 本地座標（考慮 CSS transform）
        const screenToCanvas = (clientX, clientY) => {
            const tf = getTf();
            const cr = container.getBoundingClientRect();
            return [
                (clientX - cr.left - tf.tx) / tf.scale,
                (clientY - cr.top - tf.ty) / tf.scale,
            ];
        };

        // 是否應該畫線（基於 pencilMode 和 pointerType）
        const shouldDraw = (e) => {
            if (state.pencilMode) return e.pointerType === 'pen';
            return true; // 手指模式下所有輸入都畫
        };

        // 是否應該平移（基於 pencilMode 和 pointerType）
        const shouldPan = (e) => {
            if (state.pencilMode) return e.pointerType === 'touch';
            return false; // 手指模式下單指不平移（靠兩指）
        };

        // ---- 繪畫 ----
        const startDraw = (e) => {
            drawing = true;
            currentStroke = [screenToCanvas(e.clientX, e.clientY)];
            ctx.beginPath();
            ctx.moveTo(...currentStroke[0]);
        };

        const moveDraw = (e) => {
            const pos = screenToCanvas(e.clientX, e.clientY);
            currentStroke.push(pos);
            ctx.lineTo(...pos);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(...pos);
        };

        const endDraw = () => {
            if (drawing && currentStroke.length > 1) {
                state.strokes.push([...currentStroke]);
            }
            drawing = false;
            currentStroke = [];
        };

        // ---- 單指平移 (pencil mode) ----
        let panStart = null;
        const startPan = (e) => {
            isPanning = true;
            panStart = { x: e.clientX, y: e.clientY, tx: getTf().tx, ty: getTf().ty };
        };

        const movePan = (e) => {
            if (!panStart) return;
            const tf = getTf();
            tf.tx = panStart.tx + (e.clientX - panStart.x);
            tf.ty = panStart.ty + (e.clientY - panStart.y);
            this._applyCanvasTransform(idx);
        };

        const endPan = () => {
            isPanning = false;
            panStart = null;
        };

        // ---- 兩指縮放+平移 ----
        const handlePinch = () => {
            const pts = [...activePointers.values()];
            if (pts.length < 2) return;
            const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
            const cx = (pts[0].x + pts[1].x) / 2;
            const cy = (pts[0].y + pts[1].y) / 2;

            if (lastPinchDist !== null) {
                const tf = getTf();
                const scaleDelta = dist / lastPinchDist;
                const newScale = Math.max(0.5, Math.min(5, tf.scale * scaleDelta));
                const cr = container.getBoundingClientRect();
                const px = cx - cr.left;
                const py = cy - cr.top;
                // 以 pinch 中心為基點縮放
                tf.tx = px - (px - tf.tx) * (newScale / tf.scale);
                tf.ty = py - (py - tf.ty) * (newScale / tf.scale);
                // 加上平移
                tf.tx += cx - lastPinchCenter.x;
                tf.ty += cy - lastPinchCenter.y;
                tf.scale = newScale;
                this._applyCanvasTransform(idx);
            }
            lastPinchDist = dist;
            lastPinchCenter = { x: cx, y: cy };
        };

        // ---- 事件處理 ----
        container.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            container.setPointerCapture(e.pointerId);
            activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (activePointers.size === 1) {
                if (shouldDraw(e)) {
                    startDraw(e);
                } else if (shouldPan(e)) {
                    startPan(e);
                }
            } else if (activePointers.size >= 2) {
                // 兩指開始 → 取消正在進行的繪畫/平移
                endDraw();
                endPan();
                lastPinchDist = null;
                lastPinchCenter = null;
            }
        });

        container.addEventListener('pointermove', (e) => {
            e.preventDefault();
            if (activePointers.has(e.pointerId)) {
                activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }

            if (activePointers.size >= 2) {
                handlePinch();
            } else if (drawing) {
                moveDraw(e);
            } else if (isPanning) {
                movePan(e);
            }
        });

        const onPointerEnd = (e) => {
            activePointers.delete(e.pointerId);
            if (activePointers.size < 2) {
                lastPinchDist = null;
                lastPinchCenter = null;
            }
            if (activePointers.size === 0) {
                endDraw();
                endPan();
            }
        };

        container.addEventListener('pointerup', onPointerEnd);
        container.addEventListener('pointercancel', onPointerEnd);
    },

    _hwRedraw(canvas, strokes) {
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#222';
        strokes.forEach(stroke => {
            if (stroke.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(...stroke[0]);
            for (let i = 1; i < stroke.length; i++) ctx.lineTo(...stroke[i]);
            ctx.stroke();
        });
    },

    _hwUndo(idx) {
        const state = this._practiceInputStates[idx];
        if (!state || state.strokes.length === 0) return;
        state.strokes.pop();
        const canvas = document.getElementById(`hw_canvas_${idx}`);
        if (canvas) this._hwRedraw(canvas, state.strokes);
    },

    _hwClear(idx) {
        const state = this._practiceInputStates[idx];
        if (!state) return;
        state.strokes = [];
        const canvas = document.getElementById(`hw_canvas_${idx}`);
        if (canvas) this._hwRedraw(canvas, state.strokes);
    },

    _hwGetCroppedBlob(canvas, strokes) {
        // 白底 + 裁邊 + padding + 最小尺寸
        return new Promise(resolve => {
            const dpr = window.devicePixelRatio || 1;
            const w = canvas.width / dpr;
            const h = canvas.height / dpr;

            // 創建白底圖
            const offscreen = document.createElement('canvas');
            offscreen.width = canvas.width;
            offscreen.height = canvas.height;
            const octx = offscreen.getContext('2d');
            octx.scale(dpr, dpr);
            octx.fillStyle = '#fff';
            octx.fillRect(0, 0, w, h);
            // 重繪 strokes
            octx.lineCap = 'round';
            octx.lineJoin = 'round';
            octx.lineWidth = 2;
            octx.strokeStyle = '#222';
            strokes.forEach(stroke => {
                if (stroke.length < 2) return;
                octx.beginPath();
                octx.moveTo(...stroke[0]);
                for (let i = 1; i < stroke.length; i++) octx.lineTo(...stroke[i]);
                octx.stroke();
            });

            // 掃描有效像素邊界
            const imageData = octx.getImageData(0, 0, offscreen.width, offscreen.height);
            const data = imageData.data;
            let minX = offscreen.width, minY = offscreen.height, maxX = 0, maxY = 0;
            for (let y = 0; y < offscreen.height; y++) {
                for (let x = 0; x < offscreen.width; x++) {
                    const i = (y * offscreen.width + x) * 4;
                    if (data[i] < 250 || data[i+1] < 250 || data[i+2] < 250) {
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }

            if (maxX <= minX || maxY <= minY) {
                // 空白畫布
                resolve(null);
                return;
            }

            // 加 padding
            const pad = 20 * dpr;
            minX = Math.max(0, minX - pad);
            minY = Math.max(0, minY - pad);
            maxX = Math.min(offscreen.width, maxX + pad);
            maxY = Math.min(offscreen.height, maxY + pad);

            let cropW = maxX - minX;
            let cropH = maxY - minY;

            // 最小輸出尺寸
            const minDim = 100 * dpr;
            if (cropW < minDim) { const d = minDim - cropW; minX = Math.max(0, minX - d/2); cropW = minDim; }
            if (cropH < minDim) { const d = minDim - cropH; minY = Math.max(0, minY - d/2); cropH = minDim; }

            const cropped = document.createElement('canvas');
            cropped.width = cropW;
            cropped.height = cropH;
            const cctx = cropped.getContext('2d');
            cctx.fillStyle = '#fff';
            cctx.fillRect(0, 0, cropW, cropH);
            cctx.drawImage(offscreen, minX, minY, cropW, cropH, 0, 0, cropW, cropH);

            cropped.toBlob(blob => resolve(blob), 'image/png');
        });
    },

    async _hwRecognize(idx) {
        const state = this._practiceInputStates[idx];
        if (!state || state.loading) return;
        if (state.strokes.length === 0) {
            UI.toast('請先書寫內容', 'warning');
            return;
        }

        const canvas = document.getElementById(`hw_canvas_${idx}`);
        const blob = await this._hwGetCroppedBlob(canvas, state.strokes);
        if (!blob) {
            UI.toast('畫布為空', 'warning');
            return;
        }

        await this._doRecognize(idx, blob, 'canvas');
    },

    _renderPhotoPanel(panel, idx) {
        const state = this._practiceInputStates[idx];
        panel.innerHTML = `
            <div class="mb-hw__photo-area">
                <div class="mb-hw__photo-zone" id="hw_photo_zone_${idx}" onclick="document.getElementById('hw_file_${idx}').click()">
                    ${state.imagePreview ?
                        `<img src="${state.imagePreview}" class="mb-hw__photo-preview">` :
                        `<div style="padding:24px;text-align:center;color:var(--mb-text-tertiary)">
                            <div style="font-size:28px;margin-bottom:8px">📷</div>
                            <div style="font-size:13px">點擊拍照或選擇照片</div>
                        </div>`
                    }
                </div>
                <input type="file" id="hw_file_${idx}" accept="image/*" capture="environment" style="display:none"
                       onchange="Views._hwPhotoSelected(${idx}, this)">
                <div class="mb-hw__toolbar" style="margin-top:8px">
                    <button class="mb-hw__tool-btn mb-hw__tool-btn--primary" id="hw_recognize_${idx}" onclick="Views._hwPhotoRecognize(${idx})"
                            ${state.imagePreview ? '' : 'disabled'}>
                        識別
                    </button>
                </div>
            </div>
            <textarea class="mb-practice__answer-input mb-hw__result-ta" id="answer_${idx}" placeholder="識別結果將顯示在這裡，也可手動輸入...">${UI.escapeHtml(state.textareaValue || '')}</textarea>
        `;
    },

    _hwPhotoSelected(idx, input) {
        const file = input.files && input.files[0];
        if (!file) return;
        const state = this._practiceInputStates[idx];
        state._photoFile = file;

        const reader = new FileReader();
        reader.onload = (e) => {
            state.imagePreview = e.target.result;
            const zone = document.getElementById(`hw_photo_zone_${idx}`);
            if (zone) zone.innerHTML = `<img src="${state.imagePreview}" class="mb-hw__photo-preview">`;
            const btn = document.getElementById(`hw_recognize_${idx}`);
            if (btn) btn.disabled = false;
        };
        reader.readAsDataURL(file);
    },

    async _hwPhotoRecognize(idx) {
        const state = this._practiceInputStates[idx];
        if (!state || state.loading || !state._photoFile) return;
        await this._doRecognize(idx, state._photoFile, 'photo');
    },

    async _doRecognize(idx, blob, mode) {
        const state = this._practiceInputStates[idx];
        const session = App.state._practiceSession;
        if (!session) return;
        state.loading = true;

        // 禁用識別按鈕
        const btn = document.getElementById(`hw_recognize_${idx}`);
        if (btn) { btn.disabled = true; btn.textContent = '識別中...'; }

        const _warnings = {
            empty_result: '未能識別到內容',
            very_short_abnormal: '識別結果可能不完整',
            garbled_text: '部分內容無法識別',
            possible_truncation: '部分內容可能未被識別',
            unclear_math_symbols: '公式部分可能不準確',
        };

        try {
            const res = await API.recognizeHandwriting(blob, session.subject, mode);
            if (!res || !res.success || !res.data) {
                UI.toast('識別失敗，請重試', 'error');
                return;
            }

            const { text, low_confidence, warnings } = res.data;

            // 低信心提示
            if (low_confidence && warnings && warnings.length > 0) {
                const msg = warnings.map(w => _warnings[w] || w).join('；');
                UI.toast(msg, 'warning');
            }

            if (!text) {
                UI.toast('未能識別到內容', 'warning');
                return;
            }

            // 回填邏輯
            const ta = document.getElementById(`answer_${idx}`);
            const existing = (ta ? ta.value.trim() : '') || (state.textareaValue || '').trim();

            // 關閉手寫全屏彈層
            this._closeHandwriteModal(idx);

            if (!existing) {
                // 直接填入
                state.textareaValue = text;
                this._switchInputMode(idx, 'keyboard');
                const taAfter = document.getElementById(`answer_${idx}`);
                if (taAfter) taAfter.value = text;
            } else {
                // 覆蓋/追加選擇
                this._showFillDialog(idx, existing, text);
            }

        } catch (e) {
            UI.toast('識別失敗: ' + e.message, 'error');
        } finally {
            state.loading = false;
            if (btn) { btn.disabled = false; btn.textContent = '識別'; }
        }
    },

    _showFillDialog(idx, existing, recognized) {
        // 彈層：原內容 + 識別內容 + 覆蓋/追加
        const overlay = document.createElement('div');
        overlay.className = 'mb-hw__dialog-overlay';
        const defaultBtn = existing.length <= 5 ? 'replace' : 'append';
        overlay.innerHTML = `
            <div class="mb-hw__dialog">
                <div class="mb-hw__dialog-title">識別結果</div>
                <div class="mb-hw__dialog-section">
                    <div class="mb-hw__dialog-label">原有內容</div>
                    <div class="mb-hw__dialog-text">${UI.escapeHtml(existing)}</div>
                </div>
                <div class="mb-hw__dialog-section">
                    <div class="mb-hw__dialog-label">識別內容</div>
                    <div class="mb-hw__dialog-text">${UI.escapeHtml(recognized)}</div>
                </div>
                <div class="mb-hw__dialog-actions">
                    <button class="mb-btn mb-btn--sm ${defaultBtn === 'replace' ? 'mb-btn--primary' : 'mb-btn--ghost'}"
                            id="hwDialogReplace">覆蓋</button>
                    <button class="mb-btn mb-btn--sm ${defaultBtn === 'append' ? 'mb-btn--primary' : 'mb-btn--ghost'}"
                            id="hwDialogAppend">追加</button>
                    <button class="mb-btn mb-btn--sm mb-btn--ghost" id="hwDialogCancel">取消</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        const applyAndClose = (value) => {
            const state = this._practiceInputStates[idx];
            state.textareaValue = value;
            this._switchInputMode(idx, 'keyboard');
            overlay.remove();
        };

        overlay.querySelector('#hwDialogReplace').onclick = () => applyAndClose(recognized);
        overlay.querySelector('#hwDialogAppend').onclick = () => applyAndClose(existing + '\n' + recognized);
        overlay.querySelector('#hwDialogCancel').onclick = () => overlay.remove();
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    },

    async _submitAllPractice() {
        const session = App.state._practiceSession;
        const questions = session.questions || [];
        const answers = [];

        questions.forEach((q, i) => {
            let answer = '';
            if (q.options) {
                const checked = document.querySelector(`input[name="q_${i}"]:checked`);
                answer = checked ? checked.value : '';
            } else {
                const textarea = document.getElementById(`answer_${i}`);
                answer = textarea ? textarea.value.trim() : '';
            }
            answers.push({ question_idx: i, answer });
        });

        const container = document.getElementById('learnContent') || document.getElementById('mainContent');
        container.innerHTML = UI.loading();

        const res = await API.submitPractice(session.session_id, answers);
        if (!res || !res.data) {
            container.innerHTML = UI.empty('', '提交失敗，請重試');
            return;
        }

        this._renderPracticeResult(container, res.data, questions);
    },

    _renderPracticeResult(container, result, questions) {
        const results = result.results || [];

        let html = `<div style="padding:32px 20px;text-align:center">
            <div style="font-size:48px;font-weight:700;letter-spacing:-0.03em;color:var(--mb-text)">${Math.round(result.score)}</div>
            <div style="font-size:13px;color:var(--mb-text-tertiary);margin-top:4px">
                答對 ${result.correct_count} / ${result.total_questions} 題
            </div>
        </div>`;

        if (result.ai_feedback) {
            html += `<div class="mb-detail-section" style="margin:0 20px 12px">
                <div class="mb-detail-section__title">${Icons.zap(16)} AI 反饋</div>
                <div class="mb-detail-section__body">${UI.escapeHtml(result.ai_feedback)}</div>
            </div>`;
        }

        results.forEach((r, i) => {
            html += `<div class="mb-detail-section" style="margin:0 20px 8px;border-left:3px solid ${r.is_correct ? 'var(--mb-success)' : 'var(--mb-danger)'}">
                <div class="mb-detail-section__title">${r.is_correct ? Icons.check(16) : Icons.x(16)} 第 ${i + 1} 題</div>
                <div style="font-size:13px;margin-bottom:4px"><strong>你的答案：</strong>${UI.renderMath(r.student_answer || '（未作答）')}</div>
                ${!r.is_correct ? `<div style="font-size:13px;margin-bottom:4px;color:var(--mb-success)"><strong>正確答案：</strong>${UI.renderMath(r.correct_answer || '')}</div>` : ''}
                ${r.explanation ? `<div style="font-size:12px;color:var(--mb-text-secondary);margin-top:4px">${UI.renderMath(r.explanation)}</div>` : ''}
            </div>`;
        });

        html += `<div style="padding:20px;text-align:center;display:flex;gap:8px;justify-content:center">
            <button class="mb-btn mb-btn--primary" onclick="App.state._learnMode='practice';App.navigate('learn')">再練一組</button>
            <button class="mb-btn mb-btn--secondary" onclick="App.navigate('home')">回到首頁</button>
        </div>`;

        container.innerHTML = html;
    },

    /* ---- 我的 Tab（個人分析） ---- */
    async renderProfile(container) {
        container.innerHTML = UI.loading();

        const dashRes = await API.getDashboard();
        const dash = dashRes?.data || {};
        App.state.dashboard = dash;

        const totalMistakes = dash.total_mistakes || 0;
        const reviewStreak = dash.review_streak || 0;

        // Compute overall avg mastery from per-subject mastery_overview
        const overview = dash.mastery_overview || {};
        const masteryVals = Object.values(overview).map(v => v.avg_mastery || 0).filter(v => v > 0);
        const avgMastery = masteryVals.length ? Math.round(masteryVals.reduce((a, b) => a + b, 0) / masteryVals.length) : 0;

        container.innerHTML = `
            <div class="mb-stat-row">
                <div class="mb-stat-block">
                    <div class="mb-stat-block__value">${totalMistakes}</div>
                    <div class="mb-stat-block__label">總錯題</div>
                </div>
                <div class="mb-stat-block">
                    <div class="mb-stat-block__value">${avgMastery}%</div>
                    <div class="mb-stat-block__label">平均掌握</div>
                </div>
                <div class="mb-stat-block">
                    <div class="mb-stat-block__value">${reviewStreak}<span class="mb-stat-block__unit">天</span></div>
                    <div class="mb-stat-block__label">連續複習</div>
                </div>
            </div>

            <div class="mb-profile-subjects">${UI.subjectChips()}</div>

            <div id="profileAnalysis">${UI.loading()}</div>
        `;

        // Bind subject chips inside profile
        container.querySelector('.mb-profile-subjects')?.addEventListener('click', e => {
            const chip = e.target.closest('.mb-subject-chip');
            if (chip) {
                App.state.currentSubject = chip.dataset.subject;
                container.querySelectorAll('.mb-subject-chip').forEach(el =>
                    el.classList.toggle('mb-subject-chip--active', el.dataset.subject === chip.dataset.subject));
                const analysisDiv = document.getElementById('profileAnalysis');
                analysisDiv.innerHTML = UI.loading();
                if (chip.dataset.subject === 'all') {
                    analysisDiv.innerHTML = `<div class="mb-empty-state">
                        <div class="mb-empty-state__desc">選擇一個科目查看詳細分析報告</div>
                    </div>`;
                } else {
                    this.renderAnalysis(analysisDiv);
                }
            }
        });

        // Render analysis
        const analysisDiv = document.getElementById('profileAnalysis');
        if (App.state.currentSubject === 'all') {
            analysisDiv.innerHTML = `<div class="mb-empty-state">
                <div class="mb-empty-state__desc">選擇一個科目查看詳細分析報告</div>
            </div>`;
        } else {
            this.renderAnalysis(analysisDiv);
        }
    },

    /* ---- 分析頁（內部使用） ---- */
    async renderAnalysis(container) {
        const subject = App.state.currentSubject;
        if (subject === 'all') {
            container.innerHTML = `<div class="mb-empty-state">
                <div class="mb-empty-state__desc">選擇一個科目查看詳細分析報告</div>
            </div>`;
            return;
        }

        container.innerHTML = UI.loading();

        const [weakRes, graphRes, mapRes] = await Promise.all([
            API.getWeaknessReport(subject).catch(() => null),
            API.getKnowledgeGraph(subject).catch(() => null),
            API.getKnowledgeMap(subject).catch(() => null),
        ]);

        const weak = weakRes?.data || {};
        const graph = graphRes?.data || {};
        const mapData = mapRes?.data || {};
        const radar = graph.radar || {};
        const trend = graph.trend || {};
        const tree = (graph.tree && graph.tree.length) ? graph.tree : (mapData.knowledge_tree || []);
        const weakSummary = graph.weak_summary || {};
        const weakPaths = graph.weak_paths || [];
        const weakPoints = weak.weak_points || [];

        let html = `<div class="mb-analysis-page">`;

        // ── 1. AI 摘要 ──
        if (weak.ai_summary || weak.encouragement) {
            html += `<div class="mb-analysis-summary">
                ${weak.ai_summary ? `<div class="mb-analysis-summary__text">${UI.escapeHtml(weak.ai_summary)}</div>` : ''}
                ${weak.encouragement ? `<div style="margin-top:8px;font-size:13px;color:var(--mb-brand);font-weight:500">${UI.escapeHtml(weak.encouragement)}</div>` : ''}
            </div>`;
        }

        // ── 2. 薄弱知識點列表（第一層可見） ──
        const topWeak = weakSummary.top_weak || [];
        const weakDisplay = topWeak.length ? topWeak : weakPoints.map(wp => ({
            point_code: wp.point_code,
            point_name: wp.point_name || wp.point_code,
            category: wp.category || '',
            mastery_level: wp.mastery_level || 0,
            total_mistakes: wp.mistake_count || 0,
            total_practices: 0,
            trend: wp.trend || 'stable',
        }));

        if (weakDisplay.length) {
            html += `<div class="mb-weak-list">
                <div class="mb-weak-list__title">最需攻克</div>`;
            const pathMap = {};
            weakPaths.forEach(wp => { pathMap[wp.weak_point] = wp; });

            weakDisplay.forEach(w => {
                const name = w.point_name || w.point_code;
                const tIcon = w.trend === 'declining' ? '↓' : w.trend === 'improving' ? '↑' : '→';
                const tCls = w.trend === 'declining' ? 'mb-trend--down' : w.trend === 'improving' ? 'mb-trend--up' : 'mb-trend--stable';
                html += `
                <div class="mb-weak-item" data-point-code="${UI.escapeHtml(w.point_code)}" data-point-name="${UI.escapeHtml(name)}" data-action="ask-kp">
                    <div class="mb-weak-item__info">
                        <div class="mb-weak-item__name">${UI.escapeHtml(name)}</div>
                        <div class="mb-weak-item__meta">${w.category ? UI.escapeHtml(w.category) + ' · ' : ''}錯 ${w.total_mistakes || 0} 題</div>
                    </div>
                    <div class="mb-weak-item__level">
                        <div class="mb-weak-item__percent mb-weak-item__percent--${UI.masteryClass(w.mastery_level)}">${w.mastery_level}%</div>
                        <div class="mb-weak-item__trend ${tCls}">${tIcon}</div>
                    </div>
                </div>`;
            });
            html += `</div>`;
        }

        // ── 3. 折疊區塊 ──
        const cats = radar.categories || [];
        const trendDates = trend.dates || [];

        // 雷達圖
        if (cats.length >= 3) {
            html += `
            <div class="mb-collapse" id="collapseRadar">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">${Icons.target(16)} 掌握度總覽</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div class="mb-graph-card__chart">
                        <canvas id="radarChart" width="320" height="320"></canvas>
                    </div>
                    <div class="mb-graph-legend">
                        <span class="mb-graph-legend__item"><span class="mb-graph-legend__dot mb-graph-legend__dot--current"></span>目前</span>
                        <span class="mb-graph-legend__item"><span class="mb-graph-legend__dot mb-graph-legend__dot--prev"></span>上次</span>
                    </div>
                </div>
            </div>`;
        }

        // 趨勢圖
        if (trendDates.length >= 2) {
            html += `
            <div class="mb-collapse" id="collapseTrend">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">${Icons.barChart(16)} 近期趨勢</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div class="mb-graph-card__chart">
                        <canvas id="trendChart" width="320" height="200"></canvas>
                    </div>
                </div>
            </div>`;
        }

        // AI 建議
        const recs = weak.recommendations || [];
        if (recs.length) {
            html += `
            <div class="mb-collapse" id="collapseRecs">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">${Icons.zap(16)} 改進建議</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    ${recs.map(r => `<div class="mb-graph-rec-item">· ${UI.escapeHtml(r)}</div>`).join('')}
                </div>
            </div>`;
        }

        // 知識樹
        const weakCodeSet = new Set(topWeak.map(w => w.point_code));
        if (tree.length) {
            html += `
            <div class="mb-collapse" id="collapseTree">
                <div class="mb-collapse__trigger" onclick="this.parentElement.classList.toggle('mb-collapse--open')">
                    <span class="mb-collapse__title">${Icons.bookOpen(16)} 知識點全覽</span>
                    <span class="mb-collapse__arrow">${Icons.chevronR(16)}</span>
                </div>
                <div class="mb-collapse__body">
                    <div class="mb-graph-tree" id="knowledgeTree">
                    ${tree.map(node => this._renderTreeNode(node, 0, weakCodeSet)).join('')}
                    </div>
                </div>
            </div>`;
        }

        // QA 對話框
        html += `
        <div class="mb-qa-overlay" id="qaOverlay" style="display:none">
            <div class="mb-qa-panel">
                <div class="mb-qa-panel__header">
                    <span id="qaTitle">提問</span>
                    <button class="mb-qa-panel__close" id="qaClose">${Icons.x(14)}</button>
                </div>
                <div class="mb-qa-panel__body" id="qaBody">
                    <div class="mb-qa-presets" id="qaPresets"></div>
                    <div class="mb-qa-custom">
                        <input type="text" class="mb-qa-input" id="qaInput" placeholder="輸入你的問題...">
                        <button class="mb-btn mb-btn--primary mb-btn--sm" id="qaSend">發送</button>
                    </div>
                    <div class="mb-qa-answer" id="qaAnswer" style="display:none"></div>
                </div>
            </div>
        </div>`;

        html += `</div>`;
        container.innerHTML = html;

        // 渲染圖表（需要展開後才能繪製）
        // 監聽折疊展開事件
        const radarCollapse = document.getElementById('collapseRadar');
        if (radarCollapse) {
            radarCollapse.querySelector('.mb-collapse__trigger').addEventListener('click', () => {
                setTimeout(() => this._renderRadarChart(radar), 50);
            }, { once: true });
        }
        const trendCollapse = document.getElementById('collapseTrend');
        if (trendCollapse) {
            trendCollapse.querySelector('.mb-collapse__trigger').addEventListener('click', () => {
                setTimeout(() => this._renderTrendChart(trend), 50);
            }, { once: true });
        }

        this._bindTreeEvents(weakCodeSet);
        this._bindQAEvents();
    },

    _renderRadarChart(radar) {
        const canvas = document.getElementById('radarChart');
        if (!canvas || typeof Chart === 'undefined') return;
        const cats = radar.categories || [];
        if (cats.length < 3) return;

        new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: cats,
                datasets: [
                    {
                        label: '目前掌握度',
                        data: radar.mastery || [],
                        backgroundColor: 'rgba(0, 102, 51, 0.1)',
                        borderColor: '#006633',
                        borderWidth: 1.5,
                        pointBackgroundColor: '#006633',
                        pointRadius: 3,
                    },
                    {
                        label: '上次',
                        data: radar.prev_mastery || [],
                        backgroundColor: 'rgba(180, 180, 180, 0.05)',
                        borderColor: '#ccc',
                        borderWidth: 1,
                        borderDash: [4, 4],
                        pointBackgroundColor: '#ccc',
                        pointRadius: 2,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        min: 0, max: 100,
                        ticks: { stepSize: 25, font: { size: 10 }, backdropColor: 'transparent' },
                        pointLabels: { font: { size: 11 } },
                        grid: { color: 'rgba(0,0,0,0.04)' },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } },
                },
            },
        });
    },

    _renderTrendChart(trend) {
        const canvas = document.getElementById('trendChart');
        if (!canvas || typeof Chart === 'undefined') return;
        const dates = trend.dates || [];
        const series = trend.series || {};
        if (dates.length < 2) return;

        const colors = ['#006633', '#FF3B30', '#007AFF', '#FF9500', '#AF52DE', '#30D158'];
        const datasets = Object.keys(series).map((cat, i) => ({
            label: cat,
            data: series[cat],
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 1.5,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
        }));

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: dates, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 25, font: { size: 10 } } },
                    x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
                },
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 10 }, boxWidth: 10 } },
                    tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw}%` } },
                },
            },
        });
    },

    _renderTreeNode(node, depth, weakCodeSet) {
        const mastery = node.mastery_level >= 0 ? node.mastery_level : -1;
        const cls = mastery >= 0 ? UI.masteryClass(mastery) : '';
        const hasChildren = node.children && node.children.length > 0;
        const trendIcon = node.trend === 'declining' ? '↓' : node.trend === 'improving' ? '↑' : '→';
        const trendCls = node.trend === 'declining' ? 'mb-trend--down' : node.trend === 'improving' ? 'mb-trend--up' : 'mb-trend--stable';
        const isWeak = weakCodeSet && weakCodeSet.has(node.point_code);
        const hasWeakChild = hasChildren && this._subtreeHasWeak(node, weakCodeSet);

        let html = `
        <div class="mb-tree-node mb-tree-node--depth${Math.min(depth, 2)} ${isWeak ? 'mb-tree-node--weak' : ''} ${hasWeakChild ? 'mb-tree-node--has-weak' : ''}"
             data-code="${UI.escapeHtml(node.point_code || '')}" data-name="${UI.escapeHtml(node.point_name || '')}">
            <div class="mb-tree-node__header" ${hasChildren ? 'data-toggle="tree"' : 'data-action="ask-kp"'}>
                ${hasChildren ? '<span class="mb-tree-node__arrow">▶</span>' : '<span class="mb-tree-node__dot"></span>'}
                <span class="mb-tree-node__name">${UI.escapeHtml(node.point_name)}</span>
                <span class="mb-tree-node__info">
                    ${mastery >= 0 ? `
                        <span class="mb-kp-tag mb-kp-tag--${cls}">${mastery}%</span>
                        <span class="${trendCls}">${trendIcon}</span>
                    ` : '<span class="mb-tree-node__na">—</span>'}
                    ${node.mistake_count > 0 ? `<span class="mb-tree-node__mistakes">錯${node.mistake_count}</span>` : ''}
                </span>
            </div>`;

        if (hasChildren) {
            const defaultOpen = hasWeakChild;
            html += `<div class="mb-tree-node__children" style="display:${defaultOpen ? 'block' : 'none'}">`;
            node.children.forEach(child => { html += this._renderTreeNode(child, depth + 1, weakCodeSet); });
            html += `</div>`;
        }

        html += `</div>`;
        return html;
    },

    _subtreeHasWeak(node, weakCodeSet) {
        if (!weakCodeSet || !node.children) return false;
        for (const child of node.children) {
            if (weakCodeSet.has(child.point_code)) return true;
            if (this._subtreeHasWeak(child, weakCodeSet)) return true;
        }
        return false;
    },

    _bindTreeEvents(weakCodeSet) {
        const tree = document.getElementById('knowledgeTree');
        if (!tree) return;

        tree.addEventListener('click', (e) => {
            const header = e.target.closest('[data-toggle="tree"]');
            if (!header) return;
            const node = header.closest('.mb-tree-node');
            const children = node?.querySelector('.mb-tree-node__children');
            const arrow = header.querySelector('.mb-tree-node__arrow');
            if (!children) return;
            const isOpen = children.style.display !== 'none';
            children.style.display = isOpen ? 'none' : 'block';
            if (arrow) arrow.classList.toggle('mb-tree-node__arrow--open', !isOpen);
        });

        tree.querySelectorAll('.mb-tree-node--has-weak > .mb-tree-node__header .mb-tree-node__arrow').forEach(arrow => {
            arrow.classList.add('mb-tree-node__arrow--open');
        });
    },

    _bindQAEvents() {
        const overlay = document.getElementById('qaOverlay');
        if (!overlay) return;

        document.querySelectorAll('[data-action="ask-kp"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('[data-point-code]') || btn.closest('.mb-tree-node');
                const code = card?.dataset?.pointCode || card?.dataset?.code || '';
                const name = card?.dataset?.pointName || card?.dataset?.name || code;
                if (!code) return;
                this._openQA(code, name);
            });
        });

        document.getElementById('qaClose')?.addEventListener('click', () => { overlay.style.display = 'none'; });
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.style.display = 'none'; });
        document.getElementById('qaSend')?.addEventListener('click', () => this._sendQA());
        document.getElementById('qaInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') this._sendQA(); });
    },

    _openQA(pointCode, pointName) {
        const overlay = document.getElementById('qaOverlay');
        document.getElementById('qaTitle').textContent = `提問：${pointName}`;
        overlay.dataset.pointCode = pointCode;
        overlay.dataset.pointName = pointName;

        const presets = document.getElementById('qaPresets');
        presets.innerHTML = [
            '這個知識點的核心概念是什麼？',
            '可以舉個簡單例子解釋嗎？',
            '我要怎麼改善這個知識點？',
            '有什麼常見錯誤需要注意？',
        ].map(q => `<button class="mb-qa-preset-btn" data-question="${UI.escapeHtml(q)}">${UI.escapeHtml(q)}</button>`).join('');

        presets.querySelectorAll('.mb-qa-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('qaInput').value = btn.dataset.question;
                this._sendQA();
            });
        });

        const answerDiv = document.getElementById('qaAnswer');
        answerDiv.style.display = 'none';
        answerDiv.innerHTML = '';
        document.getElementById('qaInput').value = '';
        overlay.style.display = 'flex';
    },

    async _sendQA() {
        const overlay = document.getElementById('qaOverlay');
        const input = document.getElementById('qaInput');
        const answerDiv = document.getElementById('qaAnswer');
        const question = input.value.trim();
        if (!question) return;

        const pointCode = overlay.dataset.pointCode;
        answerDiv.style.display = 'block';
        answerDiv.innerHTML = `<div class="mb-qa-loading">AI 老師思考中...</div>`;
        document.getElementById('qaPresets').style.display = 'none';

        const res = await API.askKnowledgeQA(pointCode, question);
        if (res?.data?.answer) {
            let answer = res.data.answer;
            answer = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            answer = answer.replace(/<\/?think>/gi, '').trim();

            answerDiv.innerHTML = `
                <div class="mb-qa-q">你問：${UI.escapeHtml(question)}</div>
                <div class="mb-qa-a">${UI.renderMath(answer)}</div>
                <button class="mb-qa-again" onclick="document.getElementById('qaPresets').style.display='';document.getElementById('qaAnswer').style.display='none';document.getElementById('qaInput').value='';">繼續提問</button>
            `;
        } else {
            answerDiv.innerHTML = `<div class="mb-qa-a">抱歉，暫時無法回答，請稍後再試。</div>`;
        }
    },
};


/* ============================================================
   UPLOAD — 上傳面板
   ============================================================ */

const Upload = {
    open(mode) {
        const panel = document.getElementById('uploadPanel');
        const content = document.getElementById('uploadContent');
        panel.classList.add('mb-upload-panel--active');

        if (mode === 'photo') {
            this._renderPhotoUpload(content);
        } else {
            this._renderManualInput(content);
        }
    },

    close() {
        document.getElementById('uploadPanel').classList.remove('mb-upload-panel--active');
    },

    _renderPhotoUpload(container) {
        container.innerHTML = `
            <h3 style="font-size:16px;font-weight:600;margin-bottom:16px">拍照上傳錯題</h3>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">科目</label>
                <select class="mb-select" id="uploadSubject">
                    ${(App.state.subjects || []).map(s =>
                        `<option value="${s.subject_code}">${s.display_name}</option>`
                    ).join('')}
                </select>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">題目類型</label>
                <select class="mb-select" id="uploadCategory"></select>
            </div>

            <div class="mb-upload-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
                <div class="mb-upload-zone__icon">${Icons.camera(40)}</div>
                <div class="mb-upload-zone__text">點擊選擇照片或拖拽到此處</div>
                <div style="font-size:12px;color:var(--mb-text-tertiary);margin-top:4px">支持多張照片，JPG、PNG、HEIC，每張最大 10MB</div>
            </div>
            <input type="file" id="fileInput" accept="image/*,.heic,.heif" multiple style="display:none">

            <div id="uploadPreview" style="display:none;margin-top:12px">
                <div id="previewGrid" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center"></div>
                <div id="previewFallback" style="display:none;padding:16px;background:var(--mb-brand-lighter);border-radius:8px;color:var(--mb-brand);font-size:13px;text-align:center;margin-top:8px">
                    部分照片為 HEIC 格式無法預覽，上傳後會自動轉換
                </div>
            </div>

            <div id="ocrResult" style="display:none" class="mb-ocr-confirm"></div>

            <button class="mb-btn mb-btn--primary mb-btn--full" id="uploadBtn" style="margin-top:16px;display:none"
                    onclick="Upload._doUpload()">
                上傳並識別
            </button>
        `;

        // 科目切換時更新題目類型
        const uploadSubjectEl = document.getElementById('uploadSubject');
        const uploadCategoryEl = document.getElementById('uploadCategory');
        const _updateUploadCategories = () => {
            const subj = (App.state.subjects || []).find(s => s.subject_code === uploadSubjectEl.value);
            const cats = (subj && subj.categories) || [{value:'其他', label:'其他'}];
            uploadCategoryEl.innerHTML = cats.map(c =>
                `<option value="${UI.escapeHtml(c.value)}">${UI.escapeHtml(c.label)}</option>`
            ).join('');
        };
        uploadSubjectEl.addEventListener('change', _updateUploadCategories);
        _updateUploadCategories(); // 初始化

        document.getElementById('fileInput').addEventListener('change', e => {
            const files = Array.from(e.target.files);
            if (!files.length) return;
            Upload._selectedFiles = files;
            Upload._renderPreviews(files);
        });

        const zone = document.getElementById('dropZone');
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('mb-upload-zone--dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('mb-upload-zone--dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('mb-upload-zone--dragover');
            const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
            if (files.length) {
                Upload._selectedFiles = files;
                Upload._renderPreviews(files);
            }
        });
    },

    _renderPreviews(files) {
        const grid = document.getElementById('previewGrid');
        const fallback = document.getElementById('previewFallback');
        grid.innerHTML = '';
        fallback.style.display = 'none';
        let hasHeic = false;

        files.forEach((file, idx) => {
            const wrap = document.createElement('div');
            wrap.style.cssText = 'position:relative;width:120px;height:120px;border-radius:8px;overflow:hidden;border:1px solid var(--mb-border)';

            if (/\.(heic|heif)$/i.test(file.name)) {
                hasHeic = true;
                wrap.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:var(--mb-brand-lighter);font-size:12px;color:var(--mb-brand)">HEIC #${idx + 1}</div>`;
            } else {
                const img = document.createElement('img');
                img.style.cssText = 'width:100%;height:100%;object-fit:cover';
                const reader = new FileReader();
                reader.onload = ev => { img.src = ev.target.result; };
                reader.readAsDataURL(file);
                wrap.appendChild(img);
            }

            // 序號標記
            const badge = document.createElement('div');
            badge.style.cssText = 'position:absolute;top:4px;left:4px;background:rgba(0,0,0,0.6);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:11px';
            badge.textContent = idx + 1;
            wrap.appendChild(badge);

            // 刪除按鈕
            const del = document.createElement('div');
            del.style.cssText = 'position:absolute;top:4px;right:4px;background:rgba(220,53,69,0.85);color:#fff;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer';
            del.textContent = '×';
            del.onclick = (ev) => {
                ev.stopPropagation();
                Upload._selectedFiles.splice(idx, 1);
                if (Upload._selectedFiles.length === 0) {
                    document.getElementById('uploadPreview').style.display = 'none';
                    document.getElementById('uploadBtn').style.display = 'none';
                } else {
                    Upload._renderPreviews(Upload._selectedFiles);
                }
            };
            wrap.appendChild(del);

            grid.appendChild(wrap);
        });

        if (hasHeic) fallback.style.display = 'block';
        document.getElementById('uploadPreview').style.display = 'block';
        document.getElementById('uploadBtn').style.display = 'block';
    },

    async _doUpload() {
        if (!this._selectedFiles || !this._selectedFiles.length) return;

        const btn = document.getElementById('uploadBtn');
        btn.disabled = true;
        btn.textContent = '上傳中...';

        const formData = new FormData();
        this._selectedFiles.forEach(f => formData.append('images', f));
        formData.append('subject', document.getElementById('uploadSubject').value);
        formData.append('category', document.getElementById('uploadCategory').value);

        const res = await API.uploadPhoto(formData);

        if (res && res.success) {
            // Background processing — return immediately
            UI.toast('已上傳，AI 正在背景識別分析...', 'info');
            this.close();

            // 直接在現有列表中插入「處理中」卡片，不重新加載整個頁面
            // （避免後台 OCR 佔用資源導致 API 回應慢）
            const listEl = document.getElementById('mistakeList');
            if (listEl && App.state.currentTab === 'home') {
                const emptyMsg = listEl.querySelector('.mb-empty');
                if (emptyMsg) emptyMsg.remove();

                const subject = document.getElementById('uploadSubject')?.value || '';
                const tempCard = document.createElement('div');
                tempCard.className = 'mb-list-container';
                tempCard.innerHTML = `
                    <div class="mb-mistake-item" style="cursor:default;opacity:0.7">
                        <div class="mb-mistake-item__bar mb-mistake-item__bar--processing"></div>
                        <div class="mb-mistake-item__content">
                            <div class="mb-mistake-item__top">
                                <span class="mb-mistake-item__subject">${UI.subjectLabel(subject)}</span>
                                <span class="mb-mistake-item__date">剛剛</span>
                            </div>
                            <div class="mb-mistake-item__question"><span class="mb-processing-pulse">AI 正在識別分析中...</span></div>
                        </div>
                    </div>
                `;
                listEl.insertBefore(tempCard, listEl.firstChild);

                // 更新計數
                const countEl = listEl.closest('.mb-list-section')?.querySelector('.mb-list-section__count');
                if (countEl) {
                    const oldCount = parseInt(countEl.textContent) || 0;
                    countEl.textContent = `${oldCount + 1} 題`;
                }

                // 啟動輪詢，等待後台處理完成後自動刷新
                Views._startProcessingPoll();
            } else {
                // 不在首頁，直接導航
                App.navigate('home');
            }
        } else {
            const errMsg = (res && res.detail) || '上傳失敗，請重試';
            btn.disabled = false;
            btn.textContent = '上傳並識別';
            UI.toast(errMsg, 'error');
        }
    },

    async _confirmOCR(mistakeId) {
        // 重試時 textarea 可能已被替換，使用快取值
        const qEl = document.getElementById('ocrQuestion');
        const aEl = document.getElementById('ocrAnswer');
        const question = qEl ? qEl.value.trim() : (this._lastQuestion || '');
        const answer   = aEl ? aEl.value.trim() : (this._lastAnswer || '');

        if (!question || !answer) {
            UI.toast('請填寫題目和答案', 'error');
            return;
        }

        // 快取題目和答案，以便重試時使用
        this._lastQuestion = question;
        this._lastAnswer = answer;

        const ocrDiv = document.getElementById('ocrResult');
        ocrDiv.innerHTML = '<div class="mb-loading"><div class="mb-loading__spinner"></div>AI 分析中，預計需要 30-60 秒...</div>';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000);

            const res = await fetch(`/api/mistakes/${mistakeId}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${App.state.token}` },
                body: JSON.stringify({
                    confirmed_question: question,
                    confirmed_answer: answer,
                    confirmed_figure_description: this._collectFigureEdits() || this._figureDescriptionRaw || null,
                }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await res.json();

            if (res.ok && data.success) {
                UI.toast('分析完成！', 'success');
                this.close();
                App.navigate('home');
            } else {
                this._renderConfirmError(ocrDiv, mistakeId, `分析失敗: ${data.detail || '未知錯誤'}`);
            }
        } catch (err) {
            const msg = err.name === 'AbortError'
                ? '分析超時（3分鐘）'
                : `網絡錯誤: ${err.message}`;
            this._renderConfirmError(ocrDiv, mistakeId, msg);
        }
    },

    /**
     * 重新識別：重置上傳狀態，用已選的照片再次識別
     */
    _retryUpload() {
        const ocrDiv = document.getElementById('ocrResult');
        ocrDiv.style.display = 'none';
        ocrDiv.innerHTML = '';

        const btn = document.getElementById('uploadBtn');
        btn.style.display = 'block';
        btn.disabled = false;
        btn.textContent = '上傳並識別';
    },

    /**
     * 渲染確認/分析失敗的錯誤狀態（帶重試按鈕）
     */
    _renderConfirmError(container, mistakeId, message) {
        container.innerHTML = `
            <div class="mb-ocr-fail">
                <div class="mb-ocr-fail__icon">${Icons.alertCircle(32)}</div>
                <div class="mb-ocr-fail__msg">${UI.escapeHtml(message)}</div>
                <button class="mb-btn mb-btn--primary mb-btn--full"
                        onclick="Upload._confirmOCR('${mistakeId}')">
                    ${Icons.repeat(14)} 重新分析
                </button>
                <button class="mb-btn mb-btn--full" style="margin-top:8px"
                        onclick="Upload._retryUpload()">
                    重新上傳照片
                </button>
            </div>
        `;
    },

    _renderManualInput(container) {
        container.innerHTML = `
            <h3 style="font-size:16px;font-weight:600;margin-bottom:16px">手動添加錯題</h3>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">科目</label>
                <select class="mb-select" id="manualSubject">
                    ${(App.state.subjects || []).map(s =>
                        `<option value="${s.subject_code}">${s.display_name}</option>`
                    ).join('')}
                </select>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">題目類型</label>
                <select class="mb-select" id="manualCategory"></select>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">題目</label>
                <textarea class="mb-ocr-confirm__textarea" id="manualQuestion" placeholder="輸入題目內容"></textarea>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">我的（錯誤）答案</label>
                <textarea class="mb-ocr-confirm__textarea" id="manualAnswer" placeholder="輸入你寫的答案"></textarea>
            </div>

            <button class="mb-btn mb-btn--primary mb-btn--full" onclick="Upload._submitManual()">
                添加並分析
            </button>
        `;

        // 科目切換時更新題目類型
        const manualSubjectEl = document.getElementById('manualSubject');
        const manualCategoryEl = document.getElementById('manualCategory');
        const _updateManualCategories = () => {
            const subj = (App.state.subjects || []).find(s => s.subject_code === manualSubjectEl.value);
            const cats = (subj && subj.categories) || [{value:'其他', label:'其他'}];
            manualCategoryEl.innerHTML = cats.map(c =>
                `<option value="${UI.escapeHtml(c.value)}">${UI.escapeHtml(c.label)}</option>`
            ).join('');
        };
        manualSubjectEl.addEventListener('change', _updateManualCategories);
        _updateManualCategories(); // 初始化
    },

    async _submitManual() {
        const subject = document.getElementById('manualSubject').value;
        const category = document.getElementById('manualCategory').value.trim();
        const question = document.getElementById('manualQuestion').value.trim();
        const answer = document.getElementById('manualAnswer').value.trim();

        if (!category || !question || !answer) {
            UI.toast('請填寫所有字段', 'error');
            return;
        }

        const res = await API.addManual({ subject, category, question_text: question, answer_text: answer });

        if (res && res.success) {
            const mistakeId = res.data.mistake_id;
            UI.toast('已添加，AI 分析中...', 'info');
            await API.confirmOCR(mistakeId, question, answer);
            UI.toast('分析完成！', 'success');
            this.close();
            App.navigate('home');
        }
    },

    /**
     * Phase 4: 結構化幾何編輯器
     * MVP — 3 類操作：刪除關係/量測、修改量測值、新增簡單關係
     */
    _renderFigureEditor(container, figJsonStr, fWarn) {
        let fig;
        try {
            fig = typeof figJsonStr === 'string' ? JSON.parse(figJsonStr) : figJsonStr;
        } catch (e) {
            // JSON 解析失敗，嘗試用 GeoDisplay 結構化顯示
            const structuredFallback = GeoDisplay.renderFigureDetail(figJsonStr);
            if (structuredFallback) {
                container.innerHTML = structuredFallback;
            } else {
                container.innerHTML = `<div class="mb-figure-desc">
                    <div class="mb-figure-desc__title">幾何圖形描述 ${fWarn || ''}</div>
                    <div class="mb-figure-desc__item" style="color:#888;">
                        已檢測到幾何圖形，結構化解析失敗。您仍可手動編輯題目文字。
                    </div>
                    <details style="margin-top:4px;font-size:12px;color:#aaa;">
                        <summary>開發者：查看原始資料</summary>
                        <pre style="white-space:pre-wrap;word-break:break-all;max-height:200px;overflow:auto;background:#f5f5f5;padding:8px;border-radius:4px;font-size:11px;">${UI.escapeHtml(String(figJsonStr))}</pre>
                    </details>
                </div>`;
            }
            return;
        }

        if (!fig || !fig.has_figure) {
            container.innerHTML = '';
            return;
        }

        // 整個渲染邏輯包在 try/catch 裡，防止任何異常導致 raw JSON 泄漏
        try {
            this._renderFigureEditorInner(container, fig, fWarn);
        } catch (e) {
            console.warn('幾何編輯器渲染失敗，降級為結構化展示', e);
            const structuredFallback = GeoDisplay.renderFigureDetail(fig);
            container.innerHTML = structuredFallback || '';
        }
    },

    /** 內部：實際渲染結構化幾何編輯器 */
    _renderFigureEditorInner(container, fig, fWarn) {
        // 保存原始結構供 _collectFigureEdits 使用
        this._figureEditData = JSON.parse(JSON.stringify(fig));

        // ---- 預處理：將 measurements 中錯放的 ratio 移入 relationships ----
        const rawMeasurements = fig.measurements || [];
        const measurements = [];
        const allRels = [...(fig.relationships || [])];

        rawMeasurements.forEach(m => {
            if (m.property === 'ratio') {
                // ratio 屬性的 measurement → 轉為 ratio relationship
                // 不在量測區顯示，但保留在 _figureEditData 裡
                return;
            }
            measurements.push(m);
        });

        // ---- objects（降噪：默認只顯示關鍵對象）----
        const objects = fig.objects || fig.elements || [];

        // 收集被引用的 object IDs
        const referencedIds = new Set();
        rawMeasurements.forEach(m => { if (m.target) referencedIds.add(m.target); });
        allRels.forEach(r => {
            (r.entities || []).forEach(e => referencedIds.add(e));
            (r.points || []).forEach(p => referencedIds.add(p));
            ['subject', 'of', 'target', 'at'].forEach(k => { if (r[k]) referencedIds.add(r[k]); });
            (r.items || []).forEach(it => { if (it.ref) referencedIds.add(it.ref); });
        });

        const primaryObjs = objects.filter(o => o.type === 'point' || o.type === 'circle' || referencedIds.has(o.id));
        const secondaryObjs = objects.filter(o => o.type !== 'point' && o.type !== 'circle' && !referencedIds.has(o.id));

        const typeMap = { point: '點', segment: '線段', line: '直線', ray: '射線',
            angle: '角', circle: '圓', triangle: '△', polygon: '多邊形', line_segment: '線段' };

        const objTags = primaryObjs.map(o => {
            const label = GeoDisplay.stripPrefix(o.label || o.id || '');
            const typeName = typeMap[o.type] || o.type || '';
            return `<span class="mb-figure-editor__tag" title="${o.id || ''}">${typeName} ${UI.escapeHtml(label)}</span>`;
        }).join('');

        const secondaryTags = secondaryObjs.map(o => {
            const label = GeoDisplay.stripPrefix(o.label || o.id || '');
            const typeName = typeMap[o.type] || o.type || '';
            return `<span class="mb-figure-editor__tag mb-figure-editor__tag--secondary" title="${o.id || ''}">${typeName} ${UI.escapeHtml(label)}</span>`;
        }).join('');

        // ---- measurements（可編輯值，去工程前綴，過濾推斷）----
        const measFact = measurements.filter(m => m.source !== 'inferred');
        const measInferred = measurements.filter(m => m.source === 'inferred');

        const renderMeasRow = (m, i) => {
            const target = GeoDisplay.stripPrefix(m.target || m.what || '');
            const prop = m.property || '';
            const value = m.value != null
                ? (typeof m.value === 'object' ? JSON.stringify(m.value) : String(m.value))
                : '';
            const source = m.source || '';
            const inferTag = source === 'inferred'
                ? '<span class="mb-figure-desc__inferred-tag">（推斷）</span>' : '';
            return `<div class="mb-figure-editor__kv${source === 'inferred' ? ' mb-figure-desc__inferred' : ''}" data-meas-idx="${i}">
                <span class="mb-figure-editor__kv-label">${UI.escapeHtml(target)}${prop && prop !== 'length' ? ' ' + prop : ''}</span>
                <span class="mb-figure-editor__kv-eq">=</span>
                <input class="mb-figure-editor__kv-input" type="text" value="${UI.escapeHtml(value)}" data-field="value">
                ${source ? `<span class="mb-figure-editor__source">${source}</span>` : ''}
                ${inferTag}
                <button class="mb-figure-editor__del" onclick="Upload._removeMeasurement(${i})" title="刪除">×</button>
            </div>`;
        };

        const measRows = measFact.map((m, i) => renderMeasRow(m, i)).join('');
        const inferredRows = measInferred.map((m, i) => renderMeasRow(m, measFact.length + i)).join('');

        // ---- relationships（可刪除，使用 GeoDisplay 統一格式化）----
        const relRows = allRels.map((r, i) => {
            const desc = GeoDisplay.describeRelationship(r);
            const source = r.source || '';
            const inferClass = source === 'inferred' ? ' mb-figure-editor__rel--inferred' : '';
            return `<div class="mb-figure-editor__rel${inferClass}" data-rel-idx="${i}">
                <span class="mb-figure-editor__rel-text">${UI.escapeHtml(desc)}</span>
                ${source ? `<span class="mb-figure-editor__source">${source}</span>` : ''}
                <button class="mb-figure-editor__del" onclick="Upload._removeRelationship(${i})" title="刪除">×</button>
            </div>`;
        }).join('');

        // ---- task（只讀展示，清洗 LaTeX）----
        const task = fig.task || {};
        const goals = (task.goals || []).map(g =>
            `<span class="mb-figure-desc__goal">${UI.escapeHtml(GeoDisplay.cleanLatex(g))}</span>`
        ).join('');
        const known = (task.known_conditions || []).map(k =>
            UI.escapeHtml(GeoDisplay.cleanLatex(k))
        ).join('；');

        // ---- raw JSON 折疊面板（僅供開發調試）----
        const rawJsonStr = JSON.stringify(fig, null, 2);

        container.innerHTML = `
            <div class="mb-figure-editor">
                <div class="mb-figure-editor__header">幾何信息（可編輯） ${fWarn || ''}</div>

                ${objTags ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">幾何對象</div>
                    <div class="mb-figure-editor__tags">${objTags}</div>
                    ${secondaryTags ? `<div class="mb-figure-editor__tags-toggle">
                        <button class="mb-figure-editor__toggle-btn" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'flex':'none'; this.textContent=this.textContent==='顯示全部對象'?'收起':'顯示全部對象'">顯示全部對象</button>
                        <div class="mb-figure-editor__tags" style="display:none">${secondaryTags}</div>
                    </div>` : ''}
                </div>` : ''}

                ${relRows ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">關係</div>
                    <div id="figRelationships">${relRows}</div>
                </div>` : ''}

                ${measRows ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">量測</div>
                    <div id="figMeasurements">${measRows}</div>
                </div>` : ''}

                ${inferredRows ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">推斷</div>
                    ${inferredRows}
                </div>` : ''}

                <div class="mb-figure-editor__section">
                    <button class="mb-figure-editor__add" onclick="Upload._showAddRelation()">+ 新增關係</button>
                    <div id="figAddRelPanel" style="display:none">
                        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap;align-items:center">
                            <select id="figNewRelType" class="mb-figure-editor__select">
                                <option value="parallel">平行 //</option>
                                <option value="perpendicular">垂直 ⊥</option>
                                <option value="midpoint">中點</option>
                                <option value="congruent">全等 ≅</option>
                                <option value="similar">相似 ∼</option>
                                <option value="collinear">共線</option>
                                <option value="ratio">比例</option>
                                <option value="on_segment">在…上</option>
                                <option value="bisector">平分</option>
                            </select>
                            <input id="figNewRelA" class="mb-figure-editor__input" placeholder="對象1 (如 S_AB)" style="width:80px">
                            <input id="figNewRelB" class="mb-figure-editor__input" placeholder="對象2 (如 S_CD)" style="width:80px">
                            <button class="mb-btn mb-btn--sm mb-btn--primary" onclick="Upload._addRelation()">添加</button>
                        </div>
                    </div>
                </div>

                ${known || goals ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">任務</div>
                    ${known ? `<div style="font-size:12px;color:var(--mb-text-secondary)">已知：${known}</div>` : ''}
                    ${goals ? `<div style="font-size:12px;margin-top:4px">求：${goals}</div>` : ''}
                </div>` : ''}

                <div class="mb-figure-editor__section">
                    <button class="mb-figure-editor__toggle-btn" onclick="const p=this.nextElementSibling;p.style.display=p.style.display==='none'?'block':'none';this.textContent=p.style.display==='none'?'查看原始 JSON':'收起 JSON'">查看原始 JSON</button>
                    <pre style="display:none;font-size:11px;line-height:1.4;max-height:200px;overflow:auto;background:rgba(0,0,0,0.03);padding:8px;border-radius:4px;margin-top:4px;white-space:pre-wrap;word-break:break-all">${UI.escapeHtml(rawJsonStr)}</pre>
                </div>
            </div>
        `;
    },

    /** 將 relationship 對象轉為可讀文字（委託 GeoDisplay 統一格式化） */
    _describeRelationship(rel) {
        return GeoDisplay.describeRelationship(rel);
    },

    /** 刪除量測 */
    _removeMeasurement(idx) {
        if (!this._figureEditData || !this._figureEditData.measurements) return;
        this._figureEditData.measurements.splice(idx, 1);
        const slot = document.getElementById('figureEditorSlot');
        if (slot) this._renderFigureEditor(slot, this._figureEditData, '');
    },

    /** 刪除關係 */
    _removeRelationship(idx) {
        if (!this._figureEditData || !this._figureEditData.relationships) return;
        this._figureEditData.relationships.splice(idx, 1);
        const slot = document.getElementById('figureEditorSlot');
        if (slot) this._renderFigureEditor(slot, this._figureEditData, '');
    },

    /** 顯示新增關係面板 */
    _showAddRelation() {
        const panel = document.getElementById('figAddRelPanel');
        if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
    },

    /** 新增關係 */
    _addRelation() {
        if (!this._figureEditData) return;
        if (!this._figureEditData.relationships) this._figureEditData.relationships = [];

        const type = document.getElementById('figNewRelType').value;
        const a = document.getElementById('figNewRelA').value.trim();
        const b = document.getElementById('figNewRelB').value.trim();

        if (!a) { UI.toast('請填寫對象1', 'error'); return; }

        const directedTypes = ['midpoint', 'on_segment', 'bisector'];
        let newRel;

        if (type === 'collinear') {
            newRel = { type, points: [a, b].filter(Boolean), source: 'question_text' };
        } else if (type === 'ratio') {
            // 對象1 填 ref (如 S_DI)，對象2 填比例值 (如 3:2)
            if (!b) { UI.toast('請填寫比例值 (如 3:2)', 'error'); return; }
            const parts = b.split(':').map(s => parseInt(s.trim()));
            const value = parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])
                ? { left: parts[0], right: parts[1] } : b;
            newRel = { type, items: [{ ref: a, prop: 'length' }], value, source: 'question_text' };
        } else if (directedTypes.includes(type)) {
            newRel = { type, subject: a, [type === 'midpoint' ? 'of' : 'target']: b, source: 'question_text' };
        } else {
            if (!b) { UI.toast('請填寫對象2', 'error'); return; }
            newRel = { type, entities: [a, b], source: 'question_text' };
        }

        this._figureEditData.relationships.push(newRel);
        const slot = document.getElementById('figureEditorSlot');
        if (slot) this._renderFigureEditor(slot, this._figureEditData, '');
    },

    /**
     * 從編輯器中收集完整的 figure_description JSON
     * ⚠️ 必須返回完整 JSON，不是 patch
     */
    _collectFigureEdits() {
        if (!this._figureEditData) return null;

        const fig = JSON.parse(JSON.stringify(this._figureEditData));

        // 從 input 同步修改後的量測值
        const measEls = document.querySelectorAll('.mb-figure-editor__kv');
        measEls.forEach(el => {
            const idx = parseInt(el.dataset.measIdx, 10);
            if (fig.measurements && fig.measurements[idx]) {
                const input = el.querySelector('.mb-figure-editor__kv-input');
                if (input) {
                    const newVal = input.value.trim();
                    // 嘗試轉數字
                    const num = Number(newVal);
                    fig.measurements[idx].value = isNaN(num) ? newVal : num;
                }
            }
        });

        try {
            return JSON.stringify(fig);
        } catch (e) {
            return null;
        }
    },

    _figureEditData: null,
    _selectedFile: null,
};


/* ============================================================
   啟動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => App.init());
