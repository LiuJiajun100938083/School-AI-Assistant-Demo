/**
 * AI 智能錯題本 — 前端核心模組
 *
 * 架構：
 *   App        — 全局狀態管理與導航
 *   API        — 後端 API 封裝
 *   UI         — DOM 渲染工具
 *   Views      — 各頁面視圖渲染
 *   Upload     — 上傳面板邏輯
 *
 * 代碼規範：
 *   - 嚴格模組分離，避免全局污染
 *   - 所有 DOM 操作集中在 UI / Views 層
 *   - 所有 API 調用集中在 API 層
 *   - 使用繁體中文作為界面語言
 */

'use strict';

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

        const main = document.getElementById('mainContent');
        main.innerHTML = UI.loading();

        switch (tab) {
            case 'home':    Views.renderHome(main);     break;
            case 'review':  Views.renderReview(main);   break;
            case 'practice':Views.renderPractice(main);  break;
            case 'analysis':Views.renderAnalysis(main);  break;
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
        // 標籤欄
        document.getElementById('tabBar').addEventListener('click', e => {
            const item = e.target.closest('.mb-tab-bar__item');
            if (item) this.navigate(item.dataset.tab);
        });

        // 科目篩選
        document.getElementById('subjectBar').addEventListener('click', e => {
            const chip = e.target.closest('.mb-subject-chip');
            if (chip) this.setSubject(chip.dataset.subject);
        });

        // 點擊上傳面板背景關閉
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

    async getDashboard() {
        return this._fetch('/api/mistakes/dashboard');
    },

    async getMistakes(subject, status, page = 1) {
        const params = new URLSearchParams({ page, page_size: 20 });
        if (subject && subject !== 'all') params.set('subject', subject);
        if (status) params.set('status', status);
        return this._fetch(`/api/mistakes?${params}`);
    },

    async getMistakeDetail(id) {
        return this._fetch(`/api/mistakes/${id}`);
    },

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

    async getWeaknessReport(subject) {
        return this._fetch(`/api/mistakes/weakness-report?subject=${subject}`);
    },

    async getKnowledgeMap(subject) {
        return this._fetch(`/api/mistakes/knowledge-map?subject=${subject}`);
    },

    async getKnowledgeGraph(subject) {
        return this._fetch(`/api/mistakes/knowledge-graph?subject=${subject}`);
    },

    async getMasteryHistory(pointCode, limit = 30) {
        return this._fetch(`/api/mistakes/mastery-history?point_code=${pointCode}&limit=${limit}`);
    },

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

    async deleteMistake(id) {
        return this._fetch(`/api/mistakes/${id}`, { method: 'DELETE' });
    },
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
        const month = d.getMonth() + 1;
        const day = d.getDate();
        return `${month}月${day}日`;
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * 渲染含 LaTeX 的文本：
     * 關鍵：先從原始文本中找到所有 LaTeX 塊，
     * 只對非 LaTeX 部分做 escapeHtml，
     * LaTeX 部分直接傳給 KaTeX（保留 & \\ 等符號）。
     */
    renderMath(text) {
        if (!text) return '';

        // 移除 AI 回答中殘留的 <think> 標籤
        text = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<\/?think>/gi, '').trim();

        // KaTeX 尚未載入時，直接 escape 返回
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

        // 從原始文本中找出所有 LaTeX 區間（按出現順序）
        const matches = [];
        const patterns = [
            // \begin{env}...\end{env}（display mode）
            { re: /\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}/g, display: true,  extract: m => m[0] },
            // $$...$$ (display mode)
            { re: /\$\$([\s\S]*?)\$\$/g,                      display: true,  extract: m => m[1] },
            // $...$ (inline mode)
            { re: /\$([^$\n]+?)\$/g,                           display: false, extract: m => m[1] },
        ];

        for (const p of patterns) {
            const re = new RegExp(p.re.source, p.re.flags);
            let m;
            while ((m = re.exec(text)) !== null) {
                matches.push({
                    start: m.index,
                    end: m.index + m[0].length,
                    latex: p.extract(m),
                    display: p.display,
                });
            }
        }

        // 按位置排序，去除重疊
        matches.sort((a, b) => a.start - b.start);
        const filtered = [];
        let lastEnd = 0;
        for (const m of matches) {
            if (m.start >= lastEnd) {
                filtered.push(m);
                lastEnd = m.end;
            }
        }

        // 組裝結果：非 LaTeX 部分 escapeHtml + 換行，LaTeX 部分交給 KaTeX
        let result = '';
        let pos = 0;
        for (const m of filtered) {
            if (m.start > pos) {
                const before = text.substring(pos, m.start);
                result += UI.escapeHtml(before).replace(/\n/g, '<br>');
            }
            result += renderKatex(m.latex, m.display);
            pos = m.end;
        }
        if (pos < text.length) {
            result += UI.escapeHtml(text.substring(pos)).replace(/\n/g, '<br>');
        }

        return result;
    },
};


/* ============================================================
   VIEWS — 頁面渲染
   ============================================================ */

const Views = {

    /* ---- 首頁 ---- */
    async renderHome(container) {
        const subject = App.state.currentSubject;

        // 並行加載
        const [dashRes, listRes] = await Promise.all([
            API.getDashboard(),
            API.getMistakes(subject),
        ]);

        const dash = dashRes?.data || {};
        const list = listRes?.data || { items: [], total: 0 };
        App.state.dashboard = dash;
        App.state.mistakes = list;

        const total = dash.total_mistakes || 0;
        const streak = dash.review_streak || 0;
        const mastery = dash.mastery_overview || {};

        // 各科平均掌握度
        let avgMastery = 0;
        const mKeys = Object.keys(mastery);
        if (mKeys.length) {
            avgMastery = Math.round(mKeys.reduce((s, k) => s + (mastery[k].avg_mastery || 0), 0) / mKeys.length);
        }

        container.innerHTML = `
            <!-- 統計 -->
            <div class="mb-stats">
                <div class="mb-stat-card">
                    <div class="mb-stat-card__value">${total}</div>
                    <div class="mb-stat-card__label">錯題總數</div>
                </div>
                <div class="mb-stat-card">
                    <div class="mb-stat-card__value">${avgMastery}%</div>
                    <div class="mb-stat-card__label">平均掌握度</div>
                </div>
                <div class="mb-stat-card">
                    <div class="mb-stat-card__value">${streak}</div>
                    <div class="mb-stat-card__label">連續複習天</div>
                </div>
            </div>

            <!-- 功能入口 -->
            <div class="mb-actions-grid">
                <div class="mb-action-btn" onclick="Upload.open('photo')">
                    <div class="mb-action-btn__icon">📷</div>
                    <div class="mb-action-btn__label">拍照上傳</div>
                    <div class="mb-action-btn__desc">拍題目和答案</div>
                </div>
                <div class="mb-action-btn" onclick="Upload.open('manual')">
                    <div class="mb-action-btn__icon">✍️</div>
                    <div class="mb-action-btn__label">手動添加</div>
                    <div class="mb-action-btn__desc">打字輸入錯題</div>
                </div>
                <div class="mb-action-btn" onclick="App.navigate('practice')">
                    <div class="mb-action-btn__icon">🎯</div>
                    <div class="mb-action-btn__label">AI 練習</div>
                    <div class="mb-action-btn__desc">針對薄弱點出題</div>
                </div>
                <div class="mb-action-btn" onclick="App.navigate('review')">
                    <div class="mb-action-btn__icon">🧠</div>
                    <div class="mb-action-btn__label">今日複習</div>
                    <div class="mb-action-btn__desc">間隔重複記牢</div>
                </div>
            </div>

            <!-- 錯題列表 -->
            <div class="mb-list-section">
                <div class="mb-list-section__title">
                    <span>最近錯題</span>
                    <span style="font-size:12px;color:var(--mb-text-secondary)">共 ${list.total} 題</span>
                </div>
                <div id="mistakeList"></div>
            </div>
        `;

        this._renderMistakeList(list.items);
    },

    _renderMistakeList(items) {
        const listEl = document.getElementById('mistakeList');
        if (!items.length) {
            listEl.innerHTML = UI.empty('📭', '還沒有錯題，點擊上方「拍照上傳」開始吧！');
            return;
        }

        listEl.innerHTML = items.map(m => {
            const question = m.manual_question_text || m.ocr_question_text || '（未識別）';
            return `
                <div class="mb-mistake-card mb-mistake-card--${m.status}" onclick="Views.openDetail('${m.mistake_id}')">
                    <div class="mb-mistake-card__header">
                        <span class="mb-mistake-card__subject mb-mistake-card__subject--${m.subject}">
                            ${UI.subjectLabel(m.subject)} · ${UI.escapeHtml(m.category)}
                        </span>
                        <span class="mb-mistake-card__status">${UI.statusLabel(m.status)}</span>
                    </div>
                    <div class="mb-mistake-card__question">${UI.renderMath(question)}</div>
                    <div class="mb-mistake-card__meta">
                        <span>${UI.formatDate(m.created_at)}</span>
                        ${m.error_type ? `<span>${UI.errorTypeLabel(m.error_type)}</span>` : ''}
                        ${m.mastery_level > 0 ? `<span>掌握 ${m.mastery_level}%</span>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    },

    /* ---- 錯題詳情 ---- */
    async openDetail(mistakeId) {
        const panel = document.getElementById('detailPanel');
        panel.classList.add('mb-detail-panel--active');
        panel.innerHTML = UI.loading();

        const res = await API.getMistakeDetail(mistakeId);
        if (!res || !res.data) {
            panel.innerHTML = UI.empty('❌', '載入失敗');
            return;
        }

        const m = res.data;
        const kps = m.knowledge_points || [];

        panel.innerHTML = `
            <header class="mb-header">
                <button class="mb-btn mb-btn--sm mb-btn--outline" onclick="Views.closeDetail()">← 返回</button>
                <span class="mb-mistake-card__subject mb-mistake-card__subject--${m.subject}">
                    ${UI.subjectLabel(m.subject)}
                </span>
            </header>

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">📝 題目</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.question_text || '')}</div>
            </div>

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">❌ 我的答案</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.answer_text || '')}</div>
            </div>

            ${m.correct_answer ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">✅ 正確答案</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.correct_answer)}</div>
            </div>` : ''}

            ${m.ai_analysis ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">🤖 AI 分析</div>
                <div class="mb-detail-section__body">${UI.renderMath(m.ai_analysis)}</div>
                ${m.error_type ? `<div style="margin-top:8px"><span class="mb-kp-tag mb-kp-tag--weak">${UI.errorTypeLabel(m.error_type)}</span></div>` : ''}
            </div>` : ''}

            ${kps.length ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">🎯 關聯知識點</div>
                <div>${kps.map(kp => `<span class="mb-kp-tag mb-kp-tag--medium">${UI.escapeHtml(kp.point_name)}</span>`).join('')}</div>
            </div>` : ''}

            <div class="mb-detail-section">
                <div class="mb-detail-section__title">📈 掌握狀態</div>
                <div style="display:flex;align-items:center;gap:12px">
                    <span style="font-size:24px;font-weight:700">${m.mastery_level || 0}%</span>
                    <div style="flex:1">
                        <div class="mb-mastery-bar">
                            <div class="mb-mastery-bar__fill mb-mastery-bar__fill--${UI.masteryClass(m.mastery_level || 0)}"
                                 style="width:${m.mastery_level || 0}%"></div>
                        </div>
                    </div>
                </div>
                <div style="font-size:12px;color:var(--mb-text-secondary);margin-top:8px">
                    已複習 ${m.review_count || 0} 次
                    ${m.next_review_at ? ` · 下次複習 ${UI.formatDate(m.next_review_at)}` : ''}
                </div>
            </div>

            ${m.original_image_path ? `
            <div class="mb-detail-section">
                <div class="mb-detail-section__title">📷 原始照片</div>
                <img src="/uploads/mistakes/${m.original_image_path.split('uploads/mistakes/')[1] || ''}"
                     style="max-width:100%;border-radius:8px" alt="原始照片"
                     onerror="this.style.display='none'">
            </div>` : ''}

            <div style="padding:16px;text-align:center">
                <button class="mb-btn mb-btn--outline mb-btn--sm"
                        onclick="if(confirm('確定刪除？')){API.deleteMistake('${m.mistake_id}').then(()=>{Views.closeDetail();App.navigate('home')})}">
                    刪除此錯題
                </button>
            </div>
        `;
    },

    closeDetail() {
        document.getElementById('detailPanel').classList.remove('mb-detail-panel--active');
    },

    /* ---- 複習頁 ---- */
    async renderReview(container) {
        const subject = App.state.currentSubject;
        const res = await API.getReviewQueue(subject);
        const items = res?.data?.items || [];

        if (!items.length) {
            container.innerHTML = UI.empty('🎉', '太棒了！今天沒有需要複習的錯題。');
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
            container.innerHTML = UI.empty('🎉', `今天的複習完成了！共複習了 ${items.length} 題。`);
            return;
        }

        const m = items[idx];
        container.innerHTML = `
            <div style="text-align:center;padding:16px;font-size:13px;color:var(--mb-text-secondary)">
                第 ${idx + 1} / ${items.length} 題
                · ${UI.subjectLabel(m.subject)}
                · ${UI.escapeHtml(m.category)}
            </div>

            <div class="mb-review-card" id="reviewCard" onclick="this.querySelector('.review-answer').style.display='block'">
                <div style="font-size:15px;line-height:1.6">${UI.renderMath(m.question_text || '（未識別）')}</div>
                <div class="review-answer" style="display:none;margin-top:16px;padding-top:16px;border-top:1px dashed var(--mb-border);font-size:13px;color:var(--mb-text-secondary)">
                    點擊下方按鈕記錄複習結果
                </div>
            </div>

            <div class="mb-review-actions">
                <button class="mb-review-btn mb-review-btn--forgot" onclick="Views._submitReview('${m.mistake_id}','forgot')">
                    😅 忘記了
                </button>
                <button class="mb-review-btn mb-review-btn--partial" onclick="Views._submitReview('${m.mistake_id}','partial')">
                    🤔 想起部分
                </button>
                <button class="mb-review-btn mb-review-btn--remembered" onclick="Views._submitReview('${m.mistake_id}','remembered')">
                    😊 記住了
                </button>
            </div>
        `;
    },

    async _submitReview(mistakeId, result) {
        await API.recordReview(mistakeId, result);
        App.state._reviewIdx++;
        this._renderReviewCard(document.getElementById('mainContent'));
    },

    /* ---- 練習頁 ---- */
    async renderPractice(container) {
        const subject = App.state.currentSubject;
        if (subject === 'all') {
            container.innerHTML = `
                <div class="mb-empty">
                    <div class="mb-empty__icon">📝</div>
                    <div class="mb-empty__text">請先選擇一個科目，再開始 AI 練習</div>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div style="padding:24px 16px;text-align:center">
                <div style="font-size:48px;margin-bottom:16px">🎯</div>
                <div style="font-size:18px;font-weight:600;margin-bottom:8px">AI 智能練習</div>
                <div style="font-size:14px;color:var(--mb-text-secondary);margin-bottom:24px">
                    根據你的${UI.subjectLabel(subject)}薄弱知識點，AI 自動出題
                </div>
                <div style="margin-bottom:16px">
                    <label style="font-size:13px;color:var(--mb-text-secondary)">題目數量</label>
                    <select class="mb-select" id="practiceCount" style="max-width:200px;margin:8px auto;display:block">
                        <option value="3">3 題（快速練習）</option>
                        <option value="5" selected>5 題（標準練習）</option>
                        <option value="10">10 題（深度練習）</option>
                    </select>
                </div>
                <button class="mb-btn mb-btn--primary mb-btn--full" onclick="Views._startPractice('${subject}')"
                        id="startPracticeBtn">
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

        const session = res.data;
        App.state._practiceSession = session;
        App.state._practiceAnswers = [];

        this._renderPracticeQuestions(document.getElementById('mainContent'), session);
    },

    _renderPracticeQuestions(container, session) {
        const questions = session.questions || [];

        let html = `<div class="mb-practice">
            <div style="text-align:center;font-size:13px;color:var(--mb-text-secondary);margin-bottom:16px">
                ${UI.subjectLabel(session.subject)} · ${questions.length} 題
            </div>`;

        questions.forEach((q, i) => {
            html += `
                <div class="mb-practice__question">
                    <div class="mb-practice__question-number">第 ${q.index || i + 1} 題</div>
                    <div class="mb-practice__question-text">${UI.renderMath(q.question)}</div>
                    ${q.options ? `<div style="margin-top:12px">${q.options.map((opt, oi) =>
                        `<label style="display:block;padding:8px 0;cursor:pointer">
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

        const container = document.getElementById('mainContent');
        container.innerHTML = UI.loading();

        const res = await API.submitPractice(session.session_id, answers);
        if (!res || !res.data) {
            container.innerHTML = UI.empty('❌', '提交失敗，請重試');
            return;
        }

        const result = res.data;
        this._renderPracticeResult(container, result, questions);
    },

    _renderPracticeResult(container, result, questions) {
        const results = result.results || [];

        let html = `<div style="padding:24px 16px;text-align:center">
            <div style="font-size:48px">${result.score >= 80 ? '🎉' : result.score >= 60 ? '💪' : '📖'}</div>
            <div style="font-size:36px;font-weight:700;margin:8px 0">${Math.round(result.score)}分</div>
            <div style="font-size:14px;color:var(--mb-text-secondary)">
                答對 ${result.correct_count} / ${result.total_questions} 題
            </div>
        </div>`;

        if (result.ai_feedback) {
            html += `<div class="mb-detail-section" style="margin:0 16px 12px">
                <div class="mb-detail-section__title">🤖 AI 反饋</div>
                <div class="mb-detail-section__body">${UI.escapeHtml(result.ai_feedback)}</div>
            </div>`;
        }

        results.forEach((r, i) => {
            const icon = r.is_correct ? '✅' : '❌';
            html += `<div class="mb-detail-section" style="margin:0 16px 12px;border-left:3px solid ${r.is_correct ? 'var(--mb-success)' : 'var(--mb-danger)'}">
                <div class="mb-detail-section__title">${icon} 第 ${i + 1} 題</div>
                <div style="font-size:13px;margin-bottom:4px"><strong>你的答案：</strong>${UI.renderMath(r.student_answer || '（未作答）')}</div>
                ${!r.is_correct ? `<div style="font-size:13px;margin-bottom:4px;color:var(--mb-success)"><strong>正確答案：</strong>${UI.renderMath(r.correct_answer || '')}</div>` : ''}
                ${r.explanation ? `<div style="font-size:12px;color:var(--mb-text-secondary);margin-top:4px">${UI.renderMath(r.explanation)}</div>` : ''}
            </div>`;
        });

        html += `<div style="padding:16px;text-align:center">
            <button class="mb-btn mb-btn--primary" onclick="App.navigate('practice')">再練一組</button>
            <button class="mb-btn mb-btn--outline" onclick="App.navigate('home')" style="margin-left:8px">回到首頁</button>
        </div>`;

        container.innerHTML = html;
    },

    /* ---- 分析頁 ---- */
    async renderAnalysis(container) {
        const subject = App.state.currentSubject;
        if (subject === 'all') {
            container.innerHTML = `
                <div class="mb-empty">
                    <div class="mb-empty__icon">📊</div>
                    <div class="mb-empty__text">請先選擇一個科目查看分析報告</div>
                </div>
            `;
            return;
        }

        container.innerHTML = UI.loading();

        // 三個 API 並行加載，各自容錯
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
        // 優先用 graph 的 tree，失敗時回退到 knowledge-map
        const tree = (graph.tree && graph.tree.length) ? graph.tree : (mapData.knowledge_tree || []);
        const weakSummary = graph.weak_summary || {};
        const weakPaths = graph.weak_paths || [];
        // 如果 graph API 的 weakSummary 沒有數據，用 weakness report 的
        const weakPoints = weak.weak_points || [];

        let html = `<div class="mb-graph-page">`;

        // ── 標題 ──
        html += `<div class="mb-graph-header">
            <h3>${UI.subjectLabel(subject)} 知識圖譜</h3>
        </div>`;

        // ── 1. 雷達圖 ──
        const cats = radar.categories || [];
        if (cats.length >= 3) {
            html += `
            <div class="mb-graph-card">
                <div class="mb-graph-card__title">📡 各分類掌握度總覽</div>
                <div class="mb-graph-card__chart">
                    <canvas id="radarChart" width="320" height="320"></canvas>
                </div>
                <div class="mb-graph-legend">
                    <span class="mb-graph-legend__item"><span class="mb-graph-legend__dot mb-graph-legend__dot--current"></span>目前</span>
                    <span class="mb-graph-legend__item"><span class="mb-graph-legend__dot mb-graph-legend__dot--prev"></span>上次</span>
                </div>
            </div>`;
        }

        // ── 2. 薄弱知識點卡片 ──
        const topWeak = weakSummary.top_weak || [];
        // 如果 graph API 有完整數據（含名稱）就用它，否則回退到 weakness-report 的數據
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
            html += `<div class="mb-graph-card">
                <div class="mb-graph-card__title">🎯 最需攻克的知識點</div>
                <div class="mb-graph-card__body">`;

            // 構建 weak_paths 的查找映射
            const pathMap = {};
            weakPaths.forEach(wp => { pathMap[wp.weak_point] = wp; });

            weakDisplay.forEach(w => {
                const name = w.point_name || w.point_code;
                const tIcon = w.trend === 'declining' ? '↓' : w.trend === 'improving' ? '↑' : '→';
                const tCls = w.trend === 'declining' ? 'mb-trend--down' : w.trend === 'improving' ? 'mb-trend--up' : 'mb-trend--stable';
                const path = pathMap[w.point_code];
                const pathStr = path ? path.path.join(' → ') : '';

                html += `
                <div class="mb-weak-card" data-point-code="${UI.escapeHtml(w.point_code)}" data-point-name="${UI.escapeHtml(name)}">
                    <div class="mb-weak-card__top">
                        <div class="mb-weak-card__main">
                            <div class="mb-weak-card__name">${UI.escapeHtml(name)}</div>
                            <div class="mb-weak-card__meta">
                                ${w.category ? `<span class="mb-weak-card__cat">${UI.escapeHtml(w.category)}</span>` : ''}
                                <span>錯 ${w.total_mistakes || 0} 題</span>
                                ${(w.total_practices || 0) > 0 ? `<span>練 ${w.total_practices} 次</span>` : ''}
                            </div>
                        </div>
                        <div class="mb-weak-card__right">
                            <span class="mb-kp-tag mb-kp-tag--${UI.masteryClass(w.mastery_level)}">${w.mastery_level}%</span>
                            <span class="${tCls}">${tIcon}</span>
                        </div>
                    </div>
                    <div class="mb-mastery-bar mb-mastery-bar--sm" style="margin:6px 0">
                        <div class="mb-mastery-bar__fill mb-mastery-bar__fill--${UI.masteryClass(w.mastery_level)}"
                             style="width:${w.mastery_level}%"></div>
                    </div>
                    ${pathStr ? `<div class="mb-weak-card__path">${UI.escapeHtml(pathStr)}</div>` : ''}
                    <button class="mb-weak-card__ask" data-action="ask-kp">我想問問這個知識點</button>
                </div>`;
            });

            // 進步中的知識點
            const improving = weakSummary.improving || [];
            if (improving.length) {
                html += `<div class="mb-graph-weak-title" style="margin-top:16px">📈 正在進步</div>`;
                improving.forEach(m => {
                    const mName = m.point_name || m.point_code;
                    html += `<div class="mb-graph-improving-item">
                        <span>${UI.escapeHtml(mName)}</span>
                        <span class="mb-kp-tag mb-kp-tag--${UI.masteryClass(m.mastery_level)}">${m.mastery_level}%</span>
                        <span class="mb-trend--up">↑</span>
                    </div>`;
                });
            }

            html += `</div></div>`;
        }

        // ── 3. 趨勢折線圖 ──
        const trendDates = trend.dates || [];
        if (trendDates.length >= 2) {
            html += `
            <div class="mb-graph-card">
                <div class="mb-graph-card__title">📈 近期掌握度趨勢</div>
                <div class="mb-graph-card__chart">
                    <canvas id="trendChart" width="320" height="200"></canvas>
                </div>
            </div>`;
        }

        // ── 4. AI 分析 + 建議 ──
        html += `<div class="mb-graph-card">
            <div class="mb-graph-card__title">🤖 AI 學習建議</div>
            <div class="mb-graph-card__body">`;

        if (weak.ai_summary) {
            html += `<div class="mb-graph-ai-summary">${UI.escapeHtml(weak.ai_summary)}</div>`;
        }

        const recs = weak.recommendations || [];
        if (recs.length) {
            html += `<div class="mb-graph-weak-title" style="margin-top:8px">💡 改進建議</div>`;
            recs.forEach(r => {
                html += `<div class="mb-graph-rec-item">• ${UI.escapeHtml(r)}</div>`;
            });
        }

        if (weak.encouragement) {
            html += `<div class="mb-graph-encourage">${UI.escapeHtml(weak.encouragement)}</div>`;
        }

        html += `</div></div>`;

        // ── 5. 可展開樹狀圖（薄弱節點高亮）──
        const weakCodeSet = new Set(topWeak.map(w => w.point_code));
        if (tree.length) {
            html += `
            <div class="mb-graph-card">
                <div class="mb-graph-card__title">🌳 知識點全覽</div>
                <div class="mb-graph-card__subtitle">點擊展開分支，薄弱知識點以紅色標記</div>
                <div class="mb-graph-tree" id="knowledgeTree">`;
            tree.forEach(node => {
                html += this._renderTreeNode(node, 0, weakCodeSet);
            });
            html += `</div></div>`;
        }

        // ── 6. 提問對話框（隱藏，點擊後顯示）──
        html += `
        <div class="mb-qa-overlay" id="qaOverlay" style="display:none">
            <div class="mb-qa-panel">
                <div class="mb-qa-panel__header">
                    <span id="qaTitle">提問</span>
                    <button class="mb-qa-panel__close" id="qaClose">✕</button>
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

        html += `</div>`;  // close mb-graph-page
        container.innerHTML = html;

        // ── 渲染 Chart.js 圖表 ──
        this._renderRadarChart(radar);
        this._renderTrendChart(trend);

        // ── 綁定事件 ──
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
                        backgroundColor: 'rgba(0, 102, 51, 0.15)',
                        borderColor: '#006633',
                        borderWidth: 2,
                        pointBackgroundColor: '#006633',
                        pointRadius: 4,
                    },
                    {
                        label: '上次',
                        data: radar.prev_mastery || [],
                        backgroundColor: 'rgba(180, 180, 180, 0.08)',
                        borderColor: '#bbb',
                        borderWidth: 1.5,
                        borderDash: [4, 4],
                        pointBackgroundColor: '#bbb',
                        pointRadius: 3,
                    },
                ],
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    r: {
                        min: 0,
                        max: 100,
                        ticks: { stepSize: 20, font: { size: 11 }, backdropColor: 'transparent' },
                        pointLabels: { font: { size: 12 } },
                        grid: { color: 'rgba(0,0,0,0.06)' },
                    },
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`
                        }
                    },
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

        const colors = ['#006633', '#e74c3c', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#2c3e50'];
        const datasets = Object.keys(series).map((cat, i) => ({
            label: cat,
            data: series[cat],
            borderColor: colors[i % colors.length],
            backgroundColor: 'transparent',
            borderWidth: 2,
            tension: 0.3,
            pointRadius: 3,
            pointHoverRadius: 5,
        }));

        new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: dates, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                scales: {
                    y: { min: 0, max: 100, ticks: { stepSize: 20, font: { size: 11 } } },
                    x: { ticks: { font: { size: 10 }, maxRotation: 45 } },
                },
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } },
                    tooltip: {
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${ctx.raw}%`
                        }
                    },
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
        // 檢查子樹中是否有薄弱節點（用於高亮整條分支）
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
            // 有薄弱子節點時默認展開
            const defaultOpen = hasWeakChild;
            html += `<div class="mb-tree-node__children" style="display:${defaultOpen ? 'block' : 'none'}">`;
            node.children.forEach(child => {
                html += this._renderTreeNode(child, depth + 1, weakCodeSet);
            });
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

        // 展開/收合
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

        // 確保有薄弱子節點的分支箭頭初始狀態正確
        tree.querySelectorAll('.mb-tree-node--has-weak > .mb-tree-node__header .mb-tree-node__arrow').forEach(arrow => {
            arrow.classList.add('mb-tree-node__arrow--open');
        });
    },

    _bindQAEvents() {
        const overlay = document.getElementById('qaOverlay');
        if (!overlay) return;

        // 點擊 "我想問問這個知識點" 按鈕
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

        // 關閉
        document.getElementById('qaClose')?.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.style.display = 'none';
        });

        // 發送問題
        document.getElementById('qaSend')?.addEventListener('click', () => this._sendQA());
        document.getElementById('qaInput')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this._sendQA();
        });
    },

    _openQA(pointCode, pointName) {
        const overlay = document.getElementById('qaOverlay');
        document.getElementById('qaTitle').textContent = `提問：${pointName}`;
        overlay.dataset.pointCode = pointCode;
        overlay.dataset.pointName = pointName;

        // 預設問題
        const presets = document.getElementById('qaPresets');
        presets.innerHTML = [
            '這個知識點的核心概念是什麼？',
            '可以舉個簡單例子解釋嗎？',
            '我要怎麼改善這個知識點？',
            '有什麼常見錯誤需要注意？',
        ].map(q => `<button class="mb-qa-preset-btn" data-question="${UI.escapeHtml(q)}">${UI.escapeHtml(q)}</button>`).join('');

        // 綁定預設問題
        presets.querySelectorAll('.mb-qa-preset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.getElementById('qaInput').value = btn.dataset.question;
                this._sendQA();
            });
        });

        // 清空上次的回答
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

        // 隱藏預設問題
        document.getElementById('qaPresets').style.display = 'none';

        const res = await API.askKnowledgeQA(pointCode, question);
        if (res?.data?.answer) {
            // 清除 AI 回答中殘留的 <think> 標籤
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
            <h3 style="font-size:16px;margin-bottom:16px">📷 拍照上傳錯題</h3>

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
                <div class="mb-upload-zone__icon">📷</div>
                <div class="mb-upload-zone__text">點擊選擇照片或拖拽到此處</div>
                <div style="font-size:12px;color:var(--mb-text-secondary);margin-top:4px">支持 JPG、PNG、HEIC，最大 10MB</div>
            </div>
            <input type="file" id="fileInput" accept="image/*,.heic,.heif" style="display:none">

            <div id="uploadPreview" style="display:none;margin-top:12px;text-align:center">
                <img id="previewImg" style="max-width:100%;max-height:200px;border-radius:8px"
                     onerror="this.style.display='none';document.getElementById('previewFallback').style.display='block'">
                <div id="previewFallback" style="display:none;padding:20px;background:#f0f7ff;border-radius:8px;color:#0066cc">
                    ✅ 已選擇照片（HEIC 格式無法在瀏覽器預覽，但上傳後會自動轉換）
                </div>
            </div>

            <div id="ocrResult" style="display:none" class="mb-ocr-confirm"></div>

            <button class="mb-btn mb-btn--primary mb-btn--full" id="uploadBtn" style="margin-top:16px;display:none"
                    onclick="Upload._doUpload()">
                上傳並識別
            </button>
        `;

        // 文件選擇
        document.getElementById('fileInput').addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            Upload._selectedFile = file;

            // 重置預覽狀態
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

        // 拖拽
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

            const ocrDiv = document.getElementById('ocrResult');
            ocrDiv.style.display = 'block';
            ocrDiv.innerHTML = `
                <div style="font-size:13px;color:var(--mb-text-secondary);margin-bottom:8px">
                    AI 識別信心度：${Math.round((data.confidence || 0) * 100)}%
                    ${data.has_handwriting ? ' · 檢測到手寫' : ''}
                </div>
                <div class="mb-ocr-confirm__label">題目（可修正）</div>
                <textarea class="mb-ocr-confirm__textarea" id="ocrQuestion">${UI.escapeHtml(data.ocr_question || '')}</textarea>
                <div class="mb-ocr-confirm__label" style="margin-top:8px">我的答案（可修正）</div>
                <textarea class="mb-ocr-confirm__textarea" id="ocrAnswer">${UI.escapeHtml(data.ocr_answer || '')}</textarea>
                <button class="mb-btn mb-btn--primary mb-btn--full" style="margin-top:12px"
                        onclick="Upload._confirmOCR('${data.mistake_id}')">
                    確認並分析
                </button>
            `;
        } else {
            btn.disabled = false;
            btn.textContent = '上傳並識別';
        }
    },

    async _confirmOCR(mistakeId) {
        const question = document.getElementById('ocrQuestion').value.trim();
        const answer = document.getElementById('ocrAnswer').value.trim();

        if (!question || !answer) {
            UI.toast('請填寫題目和答案', 'error');
            return;
        }

        const ocrDiv = document.getElementById('ocrResult');
        ocrDiv.innerHTML = '<div class="mb-loading"><div class="mb-loading__spinner"></div>AI 分析中，預計需要 30-60 秒，請耐心等待...</div>';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 180000); // 3 分鐘超時

            const res = await fetch(`/api/mistakes/${mistakeId}/confirm`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${App.state.token}` },
                body: JSON.stringify({ confirmed_question: question, confirmed_answer: answer }),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            const data = await res.json();

            if (res.ok && data.success) {
                UI.toast('分析完成！', 'success');
                this.close();
                App.navigate('home');
            } else {
                ocrDiv.innerHTML = `<div style="color:var(--mb-danger);text-align:center">分析失敗: ${data.detail || '請重試'}</div>`;
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                ocrDiv.innerHTML = '<div style="color:var(--mb-danger);text-align:center">分析超時（3分鐘），請重試或聯繫老師</div>';
            } else {
                ocrDiv.innerHTML = `<div style="color:var(--mb-danger);text-align:center">網絡錯誤: ${err.message}</div>`;
            }
        }
    },

    _renderManualInput(container) {
        container.innerHTML = `
            <h3 style="font-size:16px;margin-bottom:16px">✍️ 手動添加錯題</h3>

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

        const res = await API.addManual({
            subject,
            category,
            question_text: question,
            answer_text: answer,
        });

        if (res && res.success) {
            const mistakeId = res.data.mistake_id;
            UI.toast('已添加，AI 分析中...', 'info');

            // 自動觸發分析
            await API.confirmOCR(mistakeId, question, answer);
            UI.toast('分析完成！', 'success');
            this.close();
            App.navigate('home');
        }
    },

    _selectedFile: null,
};


/* ============================================================
   啟動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => App.init());
