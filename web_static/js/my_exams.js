/**
 * 我的考試成績 — 學生端
 * ======================
 * 三層分離：API（網路） / UI（渲染） / App（控制器）
 */

/* ============================================================
   API Layer — 純網路請求，不操作 DOM
   ============================================================ */
const MyExamsAPI = {
    _headers() {
        const h = { 'Content-Type': 'application/json' };
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        h['ngrok-skip-browser-warning'] = 'true';
        return h;
    },

    async _fetch(path, opts = {}) {
        try {
            const resp = await fetch(path, { headers: this._headers(), ...opts });
            if (resp.status === 401) { window.location.href = '/'; return null; }
            return await resp.json();
        } catch (e) {
            console.error('MyExamsAPI error:', e);
            return { success: false, message: e.message || 'Network error' };
        }
    },

    async _fetchLong(path, opts = {}) {
        try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 300000);
            const resp = await fetch(path, { headers: this._headers(), signal: controller.signal, ...opts });
            clearTimeout(tid);
            if (resp.status === 401) { window.location.href = '/'; return null; }
            return await resp.json();
        } catch (e) {
            return { success: false, message: e.message || 'Request failed' };
        }
    },

    listExams()            { return this._fetch('/api/my-exams'); },
    getDetail(examId)      { return this._fetch(`/api/my-exams/${examId}`); },
    getAiAnalysis(examId)  { return this._fetchLong(`/api/my-exams/${examId}/ai-analysis`, { method: 'POST' }); },
};

/* ============================================================
   UI Layer — 純渲染，不做網路請求
   ============================================================ */
const MyExamsUI = {
    t(key) {
        return (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(key) : key;
    },

    _esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    $main() { return document.getElementById('mainContent'); },

    // ── 考試列表 ──
    renderList(exams) {
        const main = this.$main();
        if (!exams || exams.length === 0) {
            main.innerHTML = `
                <div class="empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    <p>${this.t('me.list.noExams')}</p>
                </div>`;
            return;
        }

        let html = '<div class="exam-list">';
        exams.forEach(e => {
            const score = e.total_score != null ? e.total_score : '-';
            const total = e.total_marks || 0;
            const pct = e.percentage != null ? e.percentage : 0;
            const date = e.published_at ? new Date(e.published_at).toLocaleDateString() : '';
            html += `
                <div class="exam-card" onclick="MyExamsApp.viewExam(${e.exam_id})">
                    <div class="exam-card-info">
                        <div class="exam-card-title">${this._esc(e.exam_title)}</div>
                        <div class="exam-card-meta">${this._esc(e.subject || '')} ${date ? ' &middot; ' + date : ''}</div>
                    </div>
                    <div class="exam-card-score">
                        <div class="exam-card-score-value">${score}<span style="font-size:14px;font-weight:400;color:var(--text-tertiary)"> / ${total}</span></div>
                        <div class="exam-card-score-pct">${pct}%</div>
                    </div>
                </div>`;
        });
        html += '</div>';
        main.innerHTML = html;
    },

    // ── 考試詳情 ──
    renderDetail(data) {
        const main = this.$main();
        const { exam, paper, answers } = data;
        const pct = paper.percentage || 0;

        let html = '';

        // Back button
        html += `<button class="btn back-btn" onclick="MyExamsApp.backToList()">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
            ${this.t('me.detail.back')}
        </button>`;

        // Score header
        html += `
            <div class="score-header">
                <div><span class="score-big">${paper.total_score}</span><span class="score-max"> / ${exam.total_marks}</span></div>
                <div class="score-pct-bar"><div class="score-pct-fill" style="width:${pct}%"></div></div>
                <div class="score-info">${this._esc(exam.title)} &middot; ${this._esc(paper.student_name || '')}</div>
            </div>`;

        // Scanned images
        const images = paper.image_paths || [];
        if (images.length > 0) {
            html += `<div class="detail-card">
                <div class="detail-card-title">${this.t('me.detail.scanImages')}</div>
                <div class="scan-images">`;
            images.forEach(path => {
                const src = path.startsWith('/') ? path : '/' + path;
                html += `<img class="scan-img" src="${src}" alt="scan" loading="lazy">`;
            });
            html += `</div></div>`;
        }

        // Answer breakdown
        if (answers.length > 0) {
            html += `<div class="detail-card">
                <div class="detail-card-title">${this.t('me.detail.answers')}</div>
                <table class="answers-table">
                    <thead><tr>
                        <th>${this.t('me.detail.qno')}</th>
                        <th>${this.t('me.detail.type')}</th>
                        <th>${this.t('me.detail.myAnswer')}</th>
                        <th>${this.t('me.detail.score')}</th>
                        <th>${this.t('me.detail.feedback')}</th>
                    </tr></thead><tbody>`;
            answers.forEach(a => {
                const label = `${a.section}${a.question_number}`;
                const typeLabel = a.question_type === 'mc' ? this.t('me.detail.mc') : this.t('me.detail.sa');
                const scoreCls = a.score >= a.max_marks ? 'full' : a.score > 0 ? 'partial' : 'zero';
                html += `<tr>
                    <td>${label}</td>
                    <td>${typeLabel}</td>
                    <td class="td-answer">${this._esc(a.student_answer || '-')}</td>
                    <td class="td-score ${scoreCls}">${a.score} / ${a.max_marks}</td>
                    <td class="td-feedback">${this._esc(a.feedback || '')}</td>
                </tr>`;
            });
            html += `</tbody></table></div>`;
        }

        // AI Analysis panel (iOS style)
        html += `
            <div class="ai-panel">
                <div class="ai-panel-header">
                    <div class="ai-panel-icon"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2a5 5 0 0 1 5 5c0 2-1.5 3.5-3 4.5V13a2 2 0 0 1-4 0v-1.5C8.5 10.5 7 9 7 7a5 5 0 0 1 5-5z"/><path d="M9 18h6"/><path d="M10 22h4"/></svg></div>
                    <div class="ai-panel-title">${this.t('me.detail.aiAnalysis')}</div>
                    <button class="ai-panel-btn" id="aiBtn" onclick="MyExamsApp.generateAnalysis()">
                        ${this.t('me.detail.generate')}
                    </button>
                </div>
                <div id="aiContent" class="ai-panel-body">
                    <p class="ai-panel-hint">${this.t('me.detail.hint')}</p>
                </div>
            </div>`;

        main.innerHTML = html;
    },

    renderAnalysis(text) {
        const el = document.getElementById('aiContent');
        if (!el) return;
        const paragraphs = text.split(/\n+/).filter(Boolean);
        el.innerHTML = paragraphs.map(p => `<p>${this._esc(p)}</p>`).join('');
        el.classList.add('has-content');
    },

    renderAnalysisError(msg) {
        const el = document.getElementById('aiContent');
        if (el) el.innerHTML = `<p class="ai-panel-error">${this._esc(msg)}</p>`;
    },
};

/* ============================================================
   App Layer — 控制器，協調 API 和 UI
   ============================================================ */
const MyExamsApp = {
    _currentExamId: null,

    async init() {
        await this.loadList();
    },

    // ── 列表 ──
    async loadList() {
        this._currentExamId = null;
        const res = await MyExamsAPI.listExams();
        if (res && res.success) {
            MyExamsUI.renderList(res.data);
        } else {
            MyExamsUI.renderList([]);
        }
    },

    // ── 詳情 ──
    async viewExam(examId) {
        this._currentExamId = examId;
        MyExamsUI.$main().innerHTML = '<div class="loading-spinner" style="margin:80px auto;"></div>';

        const res = await MyExamsAPI.getDetail(examId);
        if (res && res.success) {
            MyExamsUI.renderDetail(res.data);
        } else {
            MyExamsUI.$main().innerHTML = `<p style="color:var(--color-error);text-align:center;padding:40px;">${res?.message || MyExamsUI.t('me.error.load')}</p>`;
        }
    },

    backToList() {
        this.loadList();
    },

    // ── AI 分析 ──
    async generateAnalysis() {
        if (!this._currentExamId) return;
        const btn = document.getElementById('aiBtn');
        const content = document.getElementById('aiContent');
        if (btn) btn.disabled = true;
        if (content) content.innerHTML = `<div class="ai-panel-loading"><span class="loading-spinner" style="width:16px;height:16px;"></span>${MyExamsUI.t('me.detail.generating')}</div>`;

        const res = await MyExamsAPI.getAiAnalysis(this._currentExamId);
        if (res && res.success && res.data?.analysis) {
            MyExamsUI.renderAnalysis(res.data.analysis);
        } else {
            MyExamsUI.renderAnalysisError(res?.message || MyExamsUI.t('me.error.load'));
        }
        if (btn) {
            btn.disabled = false;
            btn.textContent = MyExamsUI.t('me.detail.regenerate');
        }
    },
};
