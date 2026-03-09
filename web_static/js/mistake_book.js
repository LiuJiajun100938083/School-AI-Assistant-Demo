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
        mistakes: { items: [], total: 0, page: 1 },
        dashboard: null,
        currentMistake: null,
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

        this._bindEvents();
        this.navigate('home');
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

        switch (tab) {
            case 'home':    Views.renderHome(main);    break;
            case 'learn':   Views.renderLearn(main);   break;
            case 'profile': Views.renderProfile(main); break;
            default:        Views.renderHome(main);
        }
    },

    setSubject(subject) {
        this.state.currentSubject = subject;

        document.querySelectorAll('.mb-subject-chip').forEach(el => {
            el.classList.toggle('mb-subject-chip--active', el.dataset.subject === subject);
        });

        this.navigate(this.state.currentTab);
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

    async getDashboard() { return this._fetch('/api/mistakes/dashboard'); },
    async getMistakes(subject, status, page = 1) {
        const params = new URLSearchParams({ page, page_size: 20 });
        if (subject && subject !== 'all') params.set('subject', subject);
        if (status) params.set('status', status);
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
    async generatePractice(subject, count = 5) {
        return this._fetch('/api/mistakes/practice/generate', {
            method: 'POST',
            body: JSON.stringify({ subject, question_count: count, session_type: 'targeted' }),
        });
    },
    async submitPractice(sessionId, answers) {
        return this._fetch(`/api/mistakes/practice/${sessionId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });
    },
    async deleteMistake(id) { return this._fetch(`/api/mistakes/${id}`, { method: 'DELETE' }); },
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
        return `<div class="mb-subject-bar">
            ${['all','chinese','math','english'].map(s => {
                const label = {all:'全部',chinese:'中文',math:'數學',english:'英文'}[s];
                return `<button class="mb-subject-chip${current===s?' mb-subject-chip--active':''}" data-subject="${s}">${label}</button>`;
            }).join('')}
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
        const map = { chinese: '中文', math: '數學', english: '英文' };
        return map[subject] || subject;
    },

    statusLabel(status) {
        const map = {
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

        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

        if (typeof katex === 'undefined') {
            return UI.escapeHtml(text).replace(/\n/g, '<br>');
        }

        const renderKatex = (latex, displayMode) => {
            try {
                return katex.renderToString(latex.trim(), {
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
            { re: /\$([^$\n]+?)\$/g,                           display: false, extract: m => m[1] },
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

        let result = '';
        let pos = 0;
        for (const m of filtered) {
            if (m.start > pos) result += UI.escapeHtml(text.substring(pos, m.start)).replace(/\n/g, '<br>');
            result += renderKatex(m.latex, m.display);
            pos = m.end;
        }
        if (pos < text.length) result += UI.escapeHtml(text.substring(pos)).replace(/\n/g, '<br>');

        return result;
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
    formatAnalysis(text) {
        if (!text) return '';

        // 檢測是否為 JSON 格式（後端 _extract_analysis_from_prose 失敗的情況）
        const trimmed = text.trim();
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
        const cleaned = this._truncateRepetitive(text);
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
                <ul style="margin:0;padding-left:16px;font-size:13px">${obj.improvement_tips.map(t => `<li>${this.escapeHtml(t)}</li>`).join('')}</ul>
            </div>`;
        }
        return html || this.renderMath(JSON.stringify(obj, null, 2).substring(0, 2000));
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

        const sections = [];

        const makeItems = (items, fn) => items.map(item => {
            const src = item.source || '';
            const cls = src === 'inferred' ? ' class="mb-figure-desc__inferred"' : '';
            return `<div${cls}>${UI.escapeHtml(fn(item))}</div>`;
        }).join('');

        if (collinear.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">共線</div>
                ${makeItems(collinear, r => this.describeRelationship(r))}
            </div>`);
        }
        if (parallel.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">平行</div>
                ${makeItems(parallel, r => this.describeRelationship(r))}
            </div>`);
        }
        if (perp.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">垂直</div>
                ${makeItems(perp, r => this.describeRelationship(r))}
            </div>`);
        }
        if (meas.length || ratios.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">量測</div>
                ${makeItems(meas, m => this.describeMeasurement(m))}
                ${makeItems(ratios, r => this.describeRelationship(r))}
            </div>`);
        }
        if (others.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">其他關係</div>
                ${makeItems(others, r => this.describeRelationship(r))}
            </div>`);
        }

        const known = task.known_conditions || [];
        const goals = task.goals || [];
        if (known.length || goals.length) {
            sections.push(`<div class="mb-figure-desc__layer">
                <div class="mb-figure-desc__layer-title">題目條件</div>
                ${known.length ? `<div><strong>已知：</strong>${known.map(k => UI.escapeHtml(k)).join('；')}</div>` : ''}
                ${goals.length ? `<div><strong>求：</strong>${goals.map(g => `<span class="mb-figure-desc__goal">${UI.escapeHtml(g)}</span>`).join('、')}</div>` : ''}
            </div>`);
        }

        if (!sections.length) return null;
        return `<div class="mb-figure-desc">
            <div class="mb-figure-desc__title">📐 幾何圖形描述</div>
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

        const [dashRes, listRes, reviewRes] = await Promise.all([
            API.getDashboard(),
            API.getMistakes(subject),
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
                    <span class="mb-list-section__count">${list.total} 題</span>
                </div>
                <div id="mistakeList"></div>
            </div>
        `;

        this._renderMistakeList(list.items);
    },

    _renderMistakeList(items) {
        const listEl = document.getElementById('mistakeList');
        if (!items.length) {
            listEl.innerHTML = UI.empty('', '還沒有錯題，點擊上方「拍照上傳」開始吧');
            return;
        }

        let html = '<div class="mb-list-container">';
        items.forEach(m => {
            const question = m.manual_question_text || m.ocr_question_text || '（未識別）';
            html += `
                <div class="mb-mistake-item" onclick="Views.openDetail('${m.mistake_id}')">
                    <div class="mb-mistake-item__bar mb-mistake-item__bar--${m.status}"></div>
                    <div class="mb-mistake-item__content">
                        <div class="mb-mistake-item__top">
                            <span class="mb-mistake-item__subject">${UI.subjectLabel(m.subject)}</span>
                            <span class="mb-mistake-item__date">${UI.formatDate(m.created_at)}</span>
                        </div>
                        <div class="mb-mistake-item__question">${UI.renderMath(question)}</div>
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
                        <div class="mb-figure-desc__item">${UI.escapeHtml(m.figure_description_readable)}</div>
                    </div>
                </div>`;
                return '';
            })()}

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.bookOpen(16)} 題目</div>
                <div class="mb-detail-section__body">${UI.formatQuestion(m.question_text || '')}</div>
            </div>

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.x(16)} 我的答案</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.answer_text || '')}</div>
            </div>

            ${m.correct_answer ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.check(16)} 正確答案</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.correct_answer)}</div>
            </div>` : ''}

            ${m.ai_analysis ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">${Icons.zap(16)} AI 分析</div>
                <div class="mb-detail-section__body">${UI.formatAnalysis(m.ai_analysis)}</div>
                ${m.error_type ? `<div style="margin-top:10px"><span class="mb-kp-tag mb-kp-tag--weak">${UI.errorTypeLabel(m.error_type)}</span></div>` : ''}
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
                <div class="mb-detail-section__title">${Icons.image(16)} 原始照片</div>
                <img src="/uploads/mistakes/${m.original_image_path.split('uploads/mistakes/')[1] || ''}"
                     style="max-width:100%;border-radius:8px" alt="原始照片"
                     onerror="this.style.display='none'">
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
            subjectsDiv.innerHTML = ['chinese', 'math', 'english'].map(s =>
                `<button class="mb-btn mb-btn--secondary" data-practice-subject="${s}">${UI.subjectLabel(s)}</button>`
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
                <div class="mb-practice-setup__form">
                    <label class="mb-practice-setup__label">題目數量</label>
                    <select class="mb-select" id="practiceCount">
                        <option value="3">3 題 · 快速練習</option>
                        <option value="5" selected>5 題 · 標準練習</option>
                        <option value="10">10 題 · 深度練習</option>
                    </select>
                </div>
                <button class="mb-btn mb-btn--primary mb-btn--full" onclick="Views._startPractice('${subject}')"
                        id="startPracticeBtn" style="max-width:240px">
                    開始練習
                </button>
            </div>
        `;
    },

    async _startPractice(subject) {
        const btn = document.getElementById('startPracticeBtn');
        btn.disabled = true;
        btn.textContent = 'AI 出題中...';

        const count = parseInt(document.getElementById('practiceCount').value);
        const res = await API.generatePractice(subject, count);

        if (!res || !res.data) {
            btn.disabled = false;
            btn.textContent = '開始練習';
            return;
        }

        App.state._practiceSession = res.data;
        const target = document.getElementById('learnContent') || document.getElementById('mainContent');
        this._renderPracticeQuestions(target, res.data);
    },

    _renderPracticeQuestions(container, session) {
        const questions = session.questions || [];

        let html = `<div class="mb-practice">
            <div style="text-align:center;font-size:13px;color:var(--mb-text-tertiary);margin-bottom:16px">
                ${UI.subjectLabel(session.subject)} · ${questions.length} 題
            </div>`;

        questions.forEach((q, i) => {
            html += `
                <div class="mb-practice__question">
                    <div class="mb-practice__question-number">第 ${q.index || i + 1} 題</div>
                    <div class="mb-practice__question-text">${UI.renderMath(q.question)}</div>
                    ${q.options ? `<div style="margin-top:12px">${q.options.map((opt, oi) =>
                        `<label style="display:block;padding:8px 0;cursor:pointer;font-size:14px">
                            <input type="radio" name="q_${i}" value="${UI.escapeHtml(opt)}"> ${UI.renderMath(opt)}
                        </label>`
                    ).join('')}</div>` :
                    `<textarea class="mb-practice__answer-input" id="answer_${i}"
                              placeholder="在此輸入你的答案..."></textarea>`}
                </div>
            `;
        });

        html += `<button class="mb-btn mb-btn--primary mb-btn--full" onclick="Views._submitAllPractice()">
                    提交答案
                 </button></div>`;

        container.innerHTML = html;
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
                    <option value="chinese">中文</option>
                    <option value="math">數學</option>
                    <option value="english">英文</option>
                </select>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">題目類型</label>
                <select class="mb-select" id="uploadCategory">
                    <option value="閱讀理解">閱讀理解</option>
                    <option value="寫作">寫作</option>
                    <option value="語文基礎">語文基礎</option>
                    <option value="代數">代數</option>
                    <option value="幾何">幾何</option>
                    <option value="Grammar">Grammar</option>
                    <option value="Dictation">Dictation 默書</option>
                    <option value="Reading">Reading</option>
                </select>
            </div>

            <div class="mb-upload-zone" id="dropZone" onclick="document.getElementById('fileInput').click()">
                <div class="mb-upload-zone__icon">${Icons.camera(40)}</div>
                <div class="mb-upload-zone__text">點擊選擇照片或拖拽到此處</div>
                <div style="font-size:12px;color:var(--mb-text-tertiary);margin-top:4px">支持 JPG、PNG、HEIC，最大 10MB</div>
            </div>
            <input type="file" id="fileInput" accept="image/*,.heic,.heif" style="display:none">

            <div id="uploadPreview" style="display:none;margin-top:12px;text-align:center">
                <img id="previewImg" style="max-width:100%;max-height:200px;border-radius:8px"
                     onerror="this.style.display='none';document.getElementById('previewFallback').style.display='block'">
                <div id="previewFallback" style="display:none;padding:16px;background:var(--mb-brand-lighter);border-radius:8px;color:var(--mb-brand);font-size:13px">
                    已選擇照片（HEIC 格式無法預覽，上傳後會自動轉換）
                </div>
            </div>

            <div id="ocrResult" style="display:none" class="mb-ocr-confirm"></div>

            <button class="mb-btn mb-btn--primary mb-btn--full" id="uploadBtn" style="margin-top:16px;display:none"
                    onclick="Upload._doUpload()">
                上傳並識別
            </button>
        `;

        document.getElementById('fileInput').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            Upload._selectedFile = file;

            const previewImg = document.getElementById('previewImg');
            const previewFallback = document.getElementById('previewFallback');
            previewImg.style.display = '';
            previewFallback.style.display = 'none';

            const reader = new FileReader();
            reader.onload = ev => {
                previewImg.src = ev.target.result;
                document.getElementById('uploadPreview').style.display = 'block';
                document.getElementById('uploadBtn').style.display = 'block';
            };
            reader.readAsDataURL(file);
        });

        const zone = document.getElementById('dropZone');
        zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('mb-upload-zone--dragover'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('mb-upload-zone--dragover'));
        zone.addEventListener('drop', e => {
            e.preventDefault();
            zone.classList.remove('mb-upload-zone--dragover');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('image/')) {
                Upload._selectedFile = file;
                const reader = new FileReader();
                reader.onload = ev => {
                    document.getElementById('previewImg').src = ev.target.result;
                    document.getElementById('uploadPreview').style.display = 'block';
                    document.getElementById('uploadBtn').style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    },

    async _doUpload() {
        if (!this._selectedFile) return;

        const btn = document.getElementById('uploadBtn');
        btn.disabled = true;
        btn.textContent = 'AI 識別中...';

        const formData = new FormData();
        formData.append('image', this._selectedFile);
        formData.append('subject', document.getElementById('uploadSubject').value);
        formData.append('category', document.getElementById('uploadCategory').value);

        const res = await API.uploadPhoto(formData);

        if (res && res.success) {
            const data = res.data;
            btn.style.display = 'none';

            const questionText = data.ocr_question || '';
            const figDesc = data.figure_description || '';
            const figReadable = data.figure_description_readable || '';
            const cb = data.confidence_breakdown || null;

            // 保存原始 figure_description JSON，供確認時回傳
            this._figureDescriptionRaw = figDesc;

            // 分項置信度警告（僅數學題有 confidence_breakdown）
            const qWarn = cb && cb.question < 0.6
                ? '<span class="mb-confidence-warn">⚠ 題目文字可能有誤</span>' : '';
            const aWarn = cb && cb.answer < 0.6
                ? '<span class="mb-confidence-warn">⚠ 手寫答案辨識度較低，請仔細核對</span>' : '';
            const fWarn = cb && cb.figure > 0 && cb.figure < 0.6
                ? '<span class="mb-confidence-warn">⚠ 圖形識別不確定，請檢查</span>' : '';

            const ocrDiv = document.getElementById('ocrResult');
            ocrDiv.style.display = 'block';
            ocrDiv.innerHTML = `
                <div style="font-size:12px;color:var(--mb-text-tertiary);margin-bottom:8px">
                    識別信心度：${Math.round((data.confidence || 0) * 100)}%
                    ${data.has_handwriting ? ' · 檢測到手寫' : ''}
                    ${figDesc ? ' · 已識別圖形' : ''}
                </div>
                <div id="figureEditorSlot"></div>
                <div class="mb-ocr-confirm__label">題目（可修正） ${qWarn}</div>
                <textarea class="mb-ocr-confirm__textarea" id="ocrQuestion">${UI.escapeHtml(questionText)}</textarea>
                <div class="mb-ocr-confirm__label" style="margin-top:8px">我的答案（可修正） ${aWarn}</div>
                <textarea class="mb-ocr-confirm__textarea" id="ocrAnswer">${UI.escapeHtml(data.ocr_answer || '')}</textarea>
                <button class="mb-btn mb-btn--primary mb-btn--full" style="margin-top:12px"
                        onclick="Upload._confirmOCR('${data.mistake_id}')">
                    確認並分析
                </button>
            `;

            // 渲染結構化幾何編輯器（僅數學題且有 figure_description 時顯示）
            const editorSlot = document.getElementById('figureEditorSlot');
            if (editorSlot && figDesc) {
                this._renderFigureEditor(editorSlot, figDesc, fWarn);
            }
        } else {
            const errMsg = (res && res.detail) || '識別失敗，請重試';
            btn.style.display = 'none';
            const ocrDiv = document.getElementById('ocrResult');
            ocrDiv.style.display = 'block';
            ocrDiv.innerHTML = `
                <div class="mb-ocr-fail">
                    <div class="mb-ocr-fail__icon">${Icons.alertCircle(32)}</div>
                    <div class="mb-ocr-fail__msg">${UI.escapeHtml(errMsg)}</div>
                    <button class="mb-btn mb-btn--primary mb-btn--full" onclick="Upload._retryUpload()">
                        ${Icons.repeat(14)} 重新識別
                    </button>
                </div>
            `;
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
                    <option value="chinese">中文</option>
                    <option value="math">數學</option>
                    <option value="english">英文</option>
                </select>
            </div>

            <div style="margin-bottom:12px">
                <label class="mb-ocr-confirm__label">題目類型</label>
                <input type="text" class="mb-ocr-confirm__textarea" id="manualCategory"
                       style="min-height:auto;height:36px" placeholder="例如：閱讀理解、代數、Grammar">
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
            // JSON 解析失敗，降級為只讀純文字顯示
            container.innerHTML = `<div class="mb-figure-desc">
                <div class="mb-figure-desc__title">📐 幾何圖形描述 ${fWarn || ''}</div>
                <div class="mb-figure-desc__item">${UI.escapeHtml(figJsonStr)}</div>
            </div>`;
            return;
        }

        if (!fig || !fig.has_figure) {
            container.innerHTML = '';
            return;
        }

        // 保存原始結構供 _collectFigureEdits 使用
        this._figureEditData = JSON.parse(JSON.stringify(fig));

        // ---- objects（降噪：默認只顯示關鍵對象）----
        const objects = fig.objects || fig.elements || [];
        const measurements = fig.measurements || [];
        const allRels = fig.relationships || [];

        // 收集被引用的 object IDs
        const referencedIds = new Set();
        measurements.forEach(m => { if (m.target) referencedIds.add(m.target); });
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

        // ---- measurements（可編輯值，去工程前綴）----
        const measRows = measurements.map((m, i) => {
            const target = GeoDisplay.stripPrefix(m.target || m.what || '');
            const prop = m.property || '';
            const value = m.value != null ? String(m.value) : '';
            const source = m.source || '';
            return `<div class="mb-figure-editor__kv" data-meas-idx="${i}">
                <span class="mb-figure-editor__kv-label">${UI.escapeHtml(target)}${prop && prop !== 'length' ? ' ' + prop : ''}</span>
                <span class="mb-figure-editor__kv-eq">=</span>
                <input class="mb-figure-editor__kv-input" type="text" value="${UI.escapeHtml(value)}" data-field="value">
                ${source ? `<span class="mb-figure-editor__source">${source}</span>` : ''}
                <button class="mb-figure-editor__del" onclick="Upload._removeMeasurement(${i})" title="刪除">×</button>
            </div>`;
        }).join('');

        // ---- relationships（可刪除，使用 GeoDisplay 統一格式化）----
        const rels = allRels;
        const relRows = rels.map((r, i) => {
            const desc = GeoDisplay.describeRelationship(r);
            const source = r.source || '';
            const inferClass = source === 'inferred' ? ' mb-figure-editor__rel--inferred' : '';
            return `<div class="mb-figure-editor__rel${inferClass}" data-rel-idx="${i}">
                <span class="mb-figure-editor__rel-text">${UI.escapeHtml(desc)}</span>
                ${source ? `<span class="mb-figure-editor__source">${source}</span>` : ''}
                <button class="mb-figure-editor__del" onclick="Upload._removeRelationship(${i})" title="刪除">×</button>
            </div>`;
        }).join('');

        // ---- task（只讀展示）----
        const task = fig.task || {};
        const goals = (task.goals || []).map(g => `<span class="mb-figure-desc__goal">${UI.escapeHtml(g)}</span>`).join('');
        const known = (task.known_conditions || []).map(k => UI.escapeHtml(k)).join('、');

        container.innerHTML = `
            <div class="mb-figure-editor">
                <div class="mb-figure-editor__header">📐 幾何信息（可編輯） ${fWarn || ''}</div>

                ${objTags ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">幾何對象</div>
                    <div class="mb-figure-editor__tags">${objTags}</div>
                    ${secondaryTags ? `<div class="mb-figure-editor__tags-toggle">
                        <button class="mb-figure-editor__toggle-btn" onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'flex':'none'; this.textContent=this.textContent==='顯示全部對象'?'收起':'顯示全部對象'">顯示全部對象</button>
                        <div class="mb-figure-editor__tags" style="display:none">${secondaryTags}</div>
                    </div>` : ''}
                </div>` : ''}

                ${measRows ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">量測</div>
                    <div id="figMeasurements">${measRows}</div>
                </div>` : ''}

                ${relRows ? `<div class="mb-figure-editor__section">
                    <div class="mb-figure-editor__section-title">關係</div>
                    <div id="figRelationships">${relRows}</div>
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
