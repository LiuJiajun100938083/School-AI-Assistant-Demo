/**
 * Exam Grader — Frontend Core Module
 * ====================================
 * Architecture:
 *   ExamGraderAPI   — Backend API wrapper
 *   ExamGraderState — Reactive state store
 *   ExamGraderUI    — DOM rendering (pure)
 *   ExamGraderApp   — Main controller
 *
 * Dependencies: AuthModule, APIClient, i18n
 */
'use strict';

/* ============================================================
   API Layer
   ============================================================ */
const ExamGraderAPI = {
    _headers() {
        const h = { 'Content-Type': 'application/json' };
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        h['ngrok-skip-browser-warning'] = 'true';
        return h;
    },
    _authHeaders() {
        const h = {};
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        h['ngrok-skip-browser-warning'] = 'true';
        return h;
    },
    async _fetch(path, opts = {}) {
        try {
            const resp = await fetch(path, { headers: this._headers(), ...opts });
            if (resp.status === 401) {
                window.location.href = '/';
                return null;
            }
            const data = await resp.json();
            return data;
        } catch (e) {
            console.error('ExamGraderAPI error:', e);
            return { success: false, message: e.message || 'Network error' };
        }
    },
    async _fetchLong(path, opts = {}) {
        // Long-running requests (vision OCR) — 5 min timeout
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 300000);
            const resp = await fetch(path, { headers: this._headers(), signal: controller.signal, ...opts });
            clearTimeout(timeoutId);
            if (resp.status === 401) { window.location.href = '/'; return null; }
            const data = await resp.json();
            return data;
        } catch (e) {
            if (e.name === 'AbortError') {
                return { success: false, message: '请求超时（5分钟），请重试' };
            }
            console.error('ExamGraderAPI error:', e);
            return { success: false, message: e.message || 'Network error' };
        }
    },
    async _multipart(path, formData) {
        try {
            const resp = await fetch(path, {
                method: 'POST',
                headers: this._authHeaders(),
                body: formData,
            });
            if (resp.status === 401) {
                window.location.href = '/';
                return null;
            }
            const text = await resp.text();
            try {
                return JSON.parse(text);
            } catch {
                return { success: false, message: `Server returned non-JSON (HTTP ${resp.status})` };
            }
        } catch (e) {
            console.error('ExamGraderAPI multipart error:', e);
            return { success: false, message: e.message || 'Upload failed' };
        }
    },

    // ── Exam CRUD ────────────────────────────────────────────
    createExam(data) {
        return this._fetch('/api/exam-grader/exams', {
            method: 'POST', body: JSON.stringify(data),
        });
    },
    listExams(status, page = 1) {
        let url = `/api/exam-grader/exams?page=${page}`;
        if (status) url += `&status=${status}`;
        return this._fetch(url);
    },
    getExam(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}`);
    },
    updateExam(examId, data) {
        return this._fetch(`/api/exam-grader/exams/${examId}`, {
            method: 'PUT', body: JSON.stringify(data),
        });
    },
    deleteExam(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}`, {
            method: 'DELETE',
        });
    },

    // ── Clean Paper & Questions ──────────────────────────────
    uploadCleanPaper(examId, file) {
        const fd = new FormData();
        fd.append('file', file);
        return this._multipart(`/api/exam-grader/exams/${examId}/clean-paper`, fd);
    },
    extractQuestions(examId) {
        // Triggers background extraction, returns immediately
        return this._fetch(`/api/exam-grader/exams/${examId}/extract-questions`, {
            method: 'POST',
        });
    },
    getQuestions(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}`);
    },
    updateQuestions(examId, questions) {
        return this._fetch(`/api/exam-grader/exams/${examId}/questions`, {
            method: 'PUT', body: JSON.stringify({ questions }),
        });
    },

    // ── Answers ──────────────────────────────────────────────
    uploadAnswerSheet(examId, file) {
        const fd = new FormData();
        fd.append('file', file);
        return this._multipart(`/api/exam-grader/exams/${examId}/answer-sheet`, fd);
    },
    generateAnswers(examId) {
        return this._fetchLong(`/api/exam-grader/exams/${examId}/generate-answers`, {
            method: 'POST',
        });
    },
    confirmAnswers(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}/confirm-answers`, {
            method: 'POST',
        });
    },

    // ── Batch Grading ────────────────────────────────────────
    uploadBatchPdf(examId, file) {
        const fd = new FormData();
        fd.append('file', file);
        return this._multipart(`/api/exam-grader/exams/${examId}/batch-pdf`, fd);
    },
    getGradingStatus(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}/grading-status`);
    },
    cancelGrading(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}/cancel-grading`, {
            method: 'POST',
        });
    },

    // ── Results ──────────────────────────────────────────────
    getResults(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}/results`);
    },
    getStudentAnswers(paperId) {
        return this._fetch(`/api/exam-grader/students/${paperId}/answers`);
    },
    adjustScore(answerId, score, feedback) {
        return this._fetch(`/api/exam-grader/answers/${answerId}/adjust`, {
            method: 'PUT', body: JSON.stringify({ score, feedback }),
        });
    },
    getStatistics(examId) {
        return this._fetch(`/api/exam-grader/exams/${examId}/statistics`);
    },
    exportClassUrl(examId) {
        return `/api/exam-grader/exams/${examId}/export-class`;
    },
    exportStudentUrl(paperId) {
        return `/api/exam-grader/students/${paperId}/export`;
    },

    // ── Class targets (shared with assignments) ──────────────
    getTargets() {
        return this._fetch('/api/assignments/teacher/targets');
    },
};


/* ============================================================
   State
   ============================================================ */
const ExamGraderState = {
    currentExam: null,
    currentStep: 0,   // 0=list, 1=create, 2=upload, 3=answers, 4=grading, 5=results
    exams: [],
    questions: [],
    students: [],
    gradingProgress: null,
    pollingTimer: null,
    filterStatus: '',
    classTargets: [],
    editingExamId: null,
    expandedStudents: new Set(),
};


/* ============================================================
   UI Layer — Pure Rendering
   ============================================================ */
const ExamGraderUI = {
    /** Translate helper */
    t(key, ...args) {
        let s = (typeof i18n !== 'undefined' && i18n.t) ? i18n.t(key) : key;
        args.forEach((v, i) => { s = s.replace(`{${i}}`, v); });
        return s;
    },

    /** Get workspace element */
    $workspace() { return document.getElementById('mainContent'); },

    /** Show toast */
    toast(msg, type = 'info') {
        let container = document.querySelector('.toast-container');
        if (!container) {
            container = document.createElement('div');
            container.className = 'toast-container';
            document.body.appendChild(container);
        }
        const el = document.createElement('div');
        el.className = `toast ${type}`;
        el.textContent = msg;
        container.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 3000);
    },

    /** Render sidebar */
    renderSidebar() {
        const sidebar = document.getElementById('sidebarInner');
        if (!sidebar) return;

        const statusFilters = [
            { key: '', label: this.t('eg.sidebar.filterAll') },
            { key: 'draft', label: this.t('eg.sidebar.filterDraft') },
            { key: 'ready', label: this.t('eg.sidebar.filterReady') },
            { key: 'grading', label: this.t('eg.sidebar.filterGrading') },
            { key: 'completed', label: this.t('eg.sidebar.filterDone') },
        ];

        const countByStatus = {};
        ExamGraderState.exams.forEach(e => {
            const s = e.status || 'draft';
            countByStatus[s] = (countByStatus[s] || 0) + 1;
        });
        const totalCount = ExamGraderState.exams.length;

        let html = `
            <div class="sidebar-section">
                <button class="sidebar-action-btn" onclick="ExamGraderApp.showCreateForm()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    ${this.t('eg.sidebar.newExam')}
                </button>
            </div>
            <nav class="sidebar-nav">
                <div class="sidebar-nav-label">${this.t('eg.sidebar.allExams')}</div>
                ${statusFilters.map(f => `
                    <button class="sidebar-nav-item ${ExamGraderState.filterStatus === f.key ? 'active' : ''}"
                            onclick="ExamGraderApp.filterExams('${f.key}')">
                        <span>${f.label}</span>
                        <span class="sidebar-nav-count">${f.key === '' ? totalCount : (countByStatus[f.key] || 0)}</span>
                    </button>
                `).join('')}
            </nav>
        `;

        // Exam list in sidebar
        const filtered = ExamGraderState.filterStatus
            ? ExamGraderState.exams.filter(e => e.status === ExamGraderState.filterStatus)
            : ExamGraderState.exams;

        if (filtered.length > 0) {
            html += `<div class="sidebar-exam-list">`;
            filtered.forEach(exam => {
                const isActive = ExamGraderState.currentExam && ExamGraderState.currentExam.id === exam.id;
                html += `
                    <button class="sidebar-exam-item ${isActive ? 'active' : ''}"
                            onclick="ExamGraderApp.selectExam('${exam.id}')">
                        <span class="sidebar-exam-item-title">${this._esc(exam.title || 'Untitled')}</span>
                        <span class="sidebar-exam-item-meta">${this._badgeLabel(exam.status)}</span>
                    </button>
                `;
            });
            html += `</div>`;
        }

        sidebar.innerHTML = html;
    },

    /** Render exam list view (step 0) */
    renderExamList() {
        const ws = this.$workspace();
        const filtered = ExamGraderState.filterStatus
            ? ExamGraderState.exams.filter(e => e.status === ExamGraderState.filterStatus)
            : ExamGraderState.exams;

        if (filtered.length === 0) {
            ws.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <div class="empty-state-title">${this.t('eg.sidebar.noExams')}</div>
                    <div class="empty-state-desc">${this.t('eg.upload.desc')}</div>
                    <button class="btn btn-primary" onclick="ExamGraderApp.showCreateForm()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        ${this.t('eg.sidebar.newExam')}
                    </button>
                </div>
            `;
            return;
        }

        let html = `
            <div class="workspace-header">
                <div>
                    <div class="workspace-title">${this.t('eg.page.title')}</div>
                    <div class="workspace-subtitle">${this.t('eg.sidebar.examCount').replace('{0}', filtered.length)}</div>
                </div>
            </div>
            <div class="exam-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:var(--space-4);">
        `;

        filtered.forEach(exam => {
            const statusBadge = this._renderBadge(exam.status);
            html += `
                <div class="grid-card" onclick="ExamGraderApp.selectExam('${exam.id}')" tabindex="0">
                    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:4px;">
                        <div style="font-size:15px;font-weight:600;color:var(--text-primary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            ${this._esc(exam.title || 'Untitled')}
                        </div>
                        ${statusBadge}
                    </div>
                    <div style="font-size:var(--type-meta);color:var(--text-tertiary);margin-bottom:8px;">
                        ${exam.subject ? this._esc(exam.subject) + ' &middot; ' : ''}${exam.class_name ? this._esc(exam.class_name) : ''}
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center;padding-top:8px;border-top:1px solid var(--border-light);">
                        <span style="font-size:12px;color:var(--text-tertiary);">${this._formatDate(exam.created_at)}</span>
                        <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();ExamGraderApp.continueExam('${exam.id}')">
                            ${this.t('eg.btn.continue')}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        ws.innerHTML = html;
    },

    /** Render step indicator */
    _renderStepIndicator(currentStep) {
        const steps = [
            { num: 1, key: 'eg.step.create' },
            { num: 2, key: 'eg.step.upload' },
            { num: 3, key: 'eg.step.answers' },
            { num: 4, key: 'eg.step.grading' },
            { num: 5, key: 'eg.step.results' },
        ];
        return `
            <div class="step-indicator">
                ${steps.map((s, i) => {
                    const cls = currentStep === s.num ? 'active' : (currentStep > s.num ? 'completed' : '');
                    const lineClass = currentStep > s.num ? 'completed' : '';
                    return `
                        ${i > 0 ? `<div class="step-line ${lineClass}"></div>` : ''}
                        <div class="step-item ${cls}" onclick="ExamGraderApp.goToStep(${s.num})">
                            <div class="step-dot">${currentStep > s.num ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : s.num}</div>
                            <span>${this.t(s.key)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    },

    /** Render create/edit form (step 1) */
    renderCreateForm(editData) {
        const ws = this.$workspace();
        const isEdit = !!editData;
        const title = isEdit ? this.t('eg.create.editTitle') : this.t('eg.create.title');

        // Build class options — targets API returns plain string array: ["1A", "1B", ...]
        let classOptions = `<option value="">${this.t('eg.create.classPh')}</option>`;
        (ExamGraderState.classTargets || []).forEach(cls => {
            const className = typeof cls === 'string' ? cls : (cls.name || cls.class_name || '');
            if (!className) return;
            const selected = editData && editData.class_name === className ? 'selected' : '';
            classOptions += `<option value="${this._esc(className)}" ${selected}>${this._esc(className)}</option>`;
        });

        const v = editData || {};

        ws.innerHTML = `
            ${this._renderStepIndicator(1)}
            <div class="form-section">
                <div class="form-section-title">${title}</div>
                <div class="form-group">
                    <label>${this.t('eg.create.examTitle')} *</label>
                    <input type="text" id="examTitleInput" placeholder="${this.t('eg.create.examTitlePh')}" value="${this._esc(v.title || '')}">
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>${this.t('eg.create.subject')}</label>
                        <select id="examSubjectInput">
                            <option value="ict" ${(v.subject || 'ict') === 'ict' ? 'selected' : ''}>ICT (電腦科)</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>${this.t('eg.create.class')}</label>
                        <select id="examClassSelect">${classOptions}</select>
                    </div>
                </div>
                <div class="form-group">
                    <label>${this.t('eg.create.pagesPerExam')}</label>
                    <input type="number" id="examPagesInput" value="${v.pages_per_exam || 2}" min="1" max="50">
                    <div class="form-hint">${this.t('eg.grading.batchHint')}</div>
                </div>
                <div class="form-group">
                    <label>${this.t('eg.create.gradingMode')}</label>
                    <div class="mode-selector" style="grid-template-columns:repeat(3,1fr);">
                        <div class="mode-option ${v.grading_mode === 'strict' ? 'selected' : ''}" data-mode="strict" onclick="ExamGraderApp.selectMode('strict')">
                            <div class="mode-option-title">${this.t('eg.create.modeStrict')}</div>
                            <div class="mode-option-desc">${this.t('eg.create.modeStrictDesc')}</div>
                        </div>
                        <div class="mode-option ${(!v.grading_mode || v.grading_mode === 'moderate') ? 'selected' : ''}" data-mode="moderate" onclick="ExamGraderApp.selectMode('moderate')">
                            <div class="mode-option-title">${this.t('eg.create.modeModerate')}</div>
                            <div class="mode-option-desc">${this.t('eg.create.modeModerateDesc')}</div>
                        </div>
                        <div class="mode-option ${v.grading_mode === 'lenient' ? 'selected' : ''}" data-mode="lenient" onclick="ExamGraderApp.selectMode('lenient')">
                            <div class="mode-option-title">${this.t('eg.create.modeLenient')}</div>
                            <div class="mode-option-desc">${this.t('eg.create.modeLenientDesc')}</div>
                        </div>
                    </div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:var(--space-2);margin-top:var(--space-5);">
                    <button class="btn btn-outline" onclick="ExamGraderApp.cancelCreate()">${this.t('eg.create.cancel')}</button>
                    <button class="btn btn-primary" onclick="ExamGraderApp.submitCreate()">
                        ${isEdit ? this.t('eg.create.save') : this.t('eg.create.submit')}
                    </button>
                </div>
            </div>
        `;
    },

    /** Render upload clean paper (step 2) */
    renderUploadStep() {
        const ws = this.$workspace();
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        ws.innerHTML = `
            ${this._renderStepIndicator(2)}
            <div class="form-section">
                <div class="form-section-title">${this.t('eg.upload.title')}</div>
                <p style="font-size:var(--type-body);color:var(--text-secondary);margin-bottom:var(--space-4);">${this.t('eg.upload.desc')}</p>
                <div class="upload-zone" id="cleanPaperUploadZone"
                     ondragover="ExamGraderApp.onDragOver(event, 'cleanPaperUploadZone')"
                     ondragleave="ExamGraderApp.onDragLeave(event, 'cleanPaperUploadZone')"
                     ondrop="ExamGraderApp.onDrop(event, 'cleanPaper')"
                     onclick="document.getElementById('cleanPaperInput').click()">
                    <div class="upload-zone-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                    </div>
                    <div class="upload-zone-text">${this.t('eg.upload.dragDrop')}</div>
                    <div class="upload-zone-hint">${this.t('eg.upload.hint')}</div>
                </div>
                <input type="file" id="cleanPaperInput" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" style="display:none"
                       onchange="ExamGraderApp.onFileSelected(this.files, 'cleanPaper')">
                <div id="cleanPaperStatus" style="margin-top:var(--space-4);"></div>
            </div>
            ${this._renderQuestionsSection()}
            <div style="display:flex;justify-content:space-between;margin-top:var(--space-5);">
                <button class="btn btn-outline" onclick="ExamGraderApp.goToStep(1)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    ${this.t('eg.btn.prev')}
                </button>
                <button class="btn btn-primary" onclick="ExamGraderApp.goToStep(3)" ${ExamGraderState.questions.length === 0 ? 'disabled' : ''}>
                    ${this.t('eg.btn.next')}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
        `;
    },

    /** Render questions section (used in step 2 and 3) */
    _renderQuestionsSection() {
        const qs = ExamGraderState.questions;
        if (!qs || qs.length === 0) {
            return `
                <div class="form-section" style="margin-top:var(--space-5);">
                    <div class="form-section-title">${this.t('eg.questions.title')}</div>
                    <p style="color:var(--text-tertiary);font-size:var(--type-body);">${this.t('eg.questions.noQuestions')}</p>
                </div>
            `;
        }

        const totalPoints = qs.reduce((s, q) => s + (parseFloat(q.max_marks) || 0), 0);

        let html = `
            <div class="form-section" style="margin-top:var(--space-5);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
                    <div class="form-section-title" style="margin-bottom:0;">${this.t('eg.questions.title')}</div>
                    <span style="font-size:var(--type-meta);color:var(--text-tertiary);">${this.t('eg.questions.total').replace('{0}', qs.length).replace('{1}', totalPoints)}</span>
                </div>
                <div class="question-list">
        `;

        qs.forEach((q, idx) => {
            const qTypeLabel = this._questionTypeLabel(q.question_type);
            const hasAnswer = q.reference_answer;
            const answerText = q.reference_answer || '';
            const source = q.answer_source || '';

            // MC options
            let optionsHtml = '';
            if (q.question_type === 'mc' && q.mc_options) {
                const opts = typeof q.mc_options === 'string' ? JSON.parse(q.mc_options) : q.mc_options;
                optionsHtml = '<div style="margin:6px 0;padding:6px 12px;background:var(--bg-page);border-radius:8px;font-size:13px;line-height:1.7;">';
                for (const [key, val] of Object.entries(opts)) {
                    optionsHtml += `<div><strong>${this._esc(key)}.</strong> ${this._esc(val)}</div>`;
                }
                optionsHtml += '</div>';
            }

            html += `
                <div class="question-card" data-index="${idx}">
                    <div class="question-card-header">
                        <div class="question-number">
                            <div class="question-number-badge">${q.question_number || (idx + 1)}</div>
                            <span class="question-type-badge">${qTypeLabel}</span>
                        </div>
                        <span class="question-points">${q.max_marks || 0} pts</span>
                    </div>
                    <div class="question-content">${this._esc(q.question_text || '')}</div>
                    ${optionsHtml}
                    ${hasAnswer ? `
                        <div class="question-answer-row">
                            <span class="question-answer-label">${this.t('eg.questions.answer')}:</span>
                            <span class="question-answer-text">${this._esc(answerText)}</span>
                            ${source ? `<span class="question-answer-source source-${source}">${this._sourceLabel(source)}</span>` : ''}
                        </div>
                    ` : `
                        <div class="question-no-answer">${this.t('eg.answers.noAnswer')}</div>
                    `}
                </div>
            `;
        });

        html += `</div></div>`;
        return html;
    },

    /** Render answers management (step 3) */
    renderAnswersStep() {
        const ws = this.$workspace();
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const qs = ExamGraderState.questions;
        const allHaveAnswers = qs.length > 0 && qs.every(q => q.reference_answer);

        ws.innerHTML = `
            ${this._renderStepIndicator(3)}
            <div class="form-section">
                <div class="form-section-title">${this.t('eg.answers.title')}</div>
                <div class="tab-bar">
                    <button class="tab-item active" onclick="ExamGraderApp.switchAnswerTab('upload')" id="tabUpload">${this.t('eg.answers.tabUpload')}</button>
                    <button class="tab-item" onclick="ExamGraderApp.switchAnswerTab('ai')" id="tabAI">${this.t('eg.answers.tabAI')}</button>
                </div>
                <div class="tab-content active" id="answerTabUpload">
                    <p style="font-size:var(--type-body);color:var(--text-secondary);margin-bottom:var(--space-4);">${this.t('eg.answers.uploadDesc')}</p>
                    <div class="upload-zone" id="answerSheetUploadZone"
                         ondragover="ExamGraderApp.onDragOver(event, 'answerSheetUploadZone')"
                         ondragleave="ExamGraderApp.onDragLeave(event, 'answerSheetUploadZone')"
                         ondrop="ExamGraderApp.onDrop(event, 'answerSheet')"
                         onclick="document.getElementById('answerSheetInput').click()">
                        <div class="upload-zone-icon">
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/></svg>
                        </div>
                        <div class="upload-zone-text">${this.t('eg.upload.dragDrop')}</div>
                        <div class="upload-zone-hint">${this.t('eg.upload.hint')}</div>
                    </div>
                    <input type="file" id="answerSheetInput" accept=".pdf,.jpg,.jpeg,.png,.heic,.heif" style="display:none"
                           onchange="ExamGraderApp.onFileSelected(this.files, 'answerSheet')">
                    <div id="answerSheetStatus" style="margin-top:var(--space-3);"></div>
                </div>
                <div class="tab-content" id="answerTabAI">
                    <p style="font-size:var(--type-body);color:var(--text-secondary);margin-bottom:var(--space-4);">${this.t('eg.answers.aiDesc')}</p>
                    <button class="btn btn-primary" id="aiGenerateBtn" onclick="ExamGraderApp.generateAnswers()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        ${this.t('eg.answers.aiGenerate')}
                    </button>
                    <div id="aiGenerateStatus" style="margin-top:var(--space-3);"></div>
                </div>
            </div>

            ${this._renderEditableAnswers()}

            <div style="display:flex;justify-content:space-between;margin-top:var(--space-5);">
                <button class="btn btn-outline" onclick="ExamGraderApp.goToStep(2)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    ${this.t('eg.btn.prev')}
                </button>
                <div style="display:flex;gap:var(--space-2);">
                    <button class="btn btn-outline" onclick="ExamGraderApp.saveQuestions()">
                        ${this.t('eg.questions.editSave')}
                    </button>
                    <button class="btn btn-primary" onclick="ExamGraderApp.confirmAndProceed()" ${!allHaveAnswers ? 'disabled' : ''}>
                        ${this.t('eg.answers.confirm')}
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            </div>
        `;
    },

    /** Render editable answer list for step 3 */
    _renderEditableAnswers() {
        const qs = ExamGraderState.questions;
        if (!qs || qs.length === 0) return '';

        let html = `<div class="form-section" style="margin-top:var(--space-5);">
            <div class="form-section-title">${this.t('eg.questions.title')}</div>
            <div class="question-list">`;

        qs.forEach((q, idx) => {
            const qTypeLabel = this._questionTypeLabel(q.question_type);
            const answerText = q.reference_answer || '';
            const source = q.answer_source || '';

            // MC options display
            let optionsHtml = '';
            if (q.question_type === 'mc' && q.mc_options) {
                const opts = typeof q.mc_options === 'string' ? JSON.parse(q.mc_options) : q.mc_options;
                optionsHtml = '<div style="margin:8px 0;padding:8px 12px;background:var(--bg-page);border-radius:8px;font-size:14px;line-height:1.8;">';
                for (const [key, val] of Object.entries(opts)) {
                    optionsHtml += `<div><strong>${this._esc(key)}.</strong> ${this._esc(val)}</div>`;
                }
                optionsHtml += '</div>';
            }

            html += `
                <div class="question-card" data-index="${idx}">
                    <div class="question-card-header">
                        <div class="question-number">
                            <div class="question-number-badge">${q.question_number || (idx + 1)}</div>
                            <span class="question-type-badge">${qTypeLabel}</span>
                        </div>
                        <span class="question-points">${q.max_marks || 0} pts</span>
                    </div>
                    <div class="question-content">${this._esc(q.question_text || '')}</div>
                    ${optionsHtml}
                    <div class="answer-edit-area">
                        <label style="font-size:var(--type-meta);font-weight:600;color:var(--brand);margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                            ${this.t('eg.questions.answer')}
                            ${source ? `<span class="question-answer-source source-${source}">${this._sourceLabel(source)}</span>` : ''}
                        </label>
                        <textarea rows="${q.question_type === 'mc' ? 1 : 3}" data-q-index="${idx}" class="answer-textarea"
                                  placeholder="${q.question_type === 'mc' ? 'A / B / C / D' : this.t('eg.answers.editAnswer')}">${this._esc(answerText)}</textarea>
                    </div>
                </div>
            `;
        });

        html += `</div></div>`;
        return html;
    },

    /** Render grading step (step 4) */
    renderGradingStep() {
        const ws = this.$workspace();
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        ws.innerHTML = `
            ${this._renderStepIndicator(4)}
            <div class="form-section">
                <div class="form-section-title">${this.t('eg.grading.title')}</div>
                <p style="font-size:var(--type-body);color:var(--text-secondary);margin-bottom:var(--space-4);">${this.t('eg.grading.uploadBatchDesc')}</p>
                <div class="upload-zone" id="batchUploadZone"
                     ondragover="ExamGraderApp.onDragOver(event, 'batchUploadZone')"
                     ondragleave="ExamGraderApp.onDragLeave(event, 'batchUploadZone')"
                     ondrop="ExamGraderApp.onDrop(event, 'batch')"
                     onclick="document.getElementById('batchInput').click()">
                    <div class="upload-zone-icon">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    </div>
                    <div class="upload-zone-text">${this.t('eg.upload.dragDrop')}</div>
                    <div class="upload-zone-hint">${this.t('eg.grading.batchHint')}</div>
                </div>
                <input type="file" id="batchInput" accept=".pdf" style="display:none"
                       onchange="ExamGraderApp.onFileSelected(this.files, 'batch')">
            </div>
            <div id="gradingProgressPanel"></div>
            <div style="display:flex;justify-content:space-between;margin-top:var(--space-5);">
                <button class="btn btn-outline" onclick="ExamGraderApp.goToStep(3)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    ${this.t('eg.btn.prev')}
                </button>
                <button class="btn btn-primary" onclick="ExamGraderApp.goToStep(5)" id="viewResultsBtn" style="display:none;">
                    ${this.t('eg.btn.viewResults')}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                </button>
            </div>
        `;

        // If there's already grading in progress, start polling
        if (exam.status === 'grading') {
            ExamGraderApp.startPolling();
        }
    },

    /** Render grading progress */
    renderGradingProgress(data) {
        const panel = document.getElementById('gradingProgressPanel');
        if (!panel) return;

        if (!data) {
            panel.innerHTML = '';
            return;
        }

        const total = data.total || 0;
        const processed = data.processed || 0;
        const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
        const status = data.status || 'pending';
        const isComplete = status === 'completed';
        const isFailed = status === 'failed';
        const isCancelled = status === 'cancelled';

        let barClass = '';
        if (isComplete) barClass = 'complete';
        else if (isFailed) barClass = 'error';

        const statusLabel = this.t(`eg.grading.status.${status}`);

        panel.innerHTML = `
            <div class="progress-panel ${(!isComplete && !isFailed && !isCancelled) ? 'grading-pulse' : ''}">
                <div class="progress-panel-header">
                    <div class="progress-panel-title">${this.t('eg.grading.progress')}</div>
                    <span class="progress-panel-status badge badge-${status}">${statusLabel}</span>
                </div>
                <div class="progress-bar-wrap">
                    <div class="progress-bar-fill ${barClass}" style="width:${pct}%"></div>
                </div>
                <div class="progress-info">
                    <span class="progress-text">${this.t('eg.grading.processed').replace('{0}', processed).replace('{1}', total)}</span>
                    <span class="progress-percentage">${pct}%</span>
                </div>
                ${(!isComplete && !isFailed && !isCancelled) ? `
                    <div style="margin-top:var(--space-3);text-align:right;">
                        <button class="btn btn-sm btn-danger" onclick="ExamGraderApp.cancelGrading()">
                            ${this.t('eg.grading.cancel')}
                        </button>
                    </div>
                ` : ''}
            </div>
        `;

        // Show "View Results" button when complete
        const vrBtn = document.getElementById('viewResultsBtn');
        if (vrBtn && isComplete) {
            vrBtn.style.display = '';
        }
    },

    /** Render results step (step 5) */
    renderResultsStep(results, stats) {
        const ws = this.$workspace();
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const papers = results || [];
        if (papers.length === 0) {
            ws.innerHTML = `
                ${this._renderStepIndicator(5)}
                <div class="empty-state">
                    <div class="empty-state-icon">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div class="empty-state-title">${this.t('eg.results.noResults')}</div>
                </div>
                <div style="margin-top:var(--space-5);">
                    <button class="btn btn-outline" onclick="ExamGraderApp.goToStep(4)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        ${this.t('eg.btn.prev')}
                    </button>
                </div>
            `;
            return;
        }

        // Summary cards
        let html = this._renderStepIndicator(5);
        if (stats) {
            html += `
                <div class="results-summary">
                    <div class="summary-card">
                        <div class="summary-card-value">${stats.average_score != null ? stats.average_score.toFixed(1) : '-'}</div>
                        <div class="summary-card-label">${this.t('eg.results.avgScore')}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-card-value">${stats.highest_score != null ? stats.highest_score : '-'}</div>
                        <div class="summary-card-label">${this.t('eg.results.highScore')}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-card-value">${stats.lowest_score != null ? stats.lowest_score : '-'}</div>
                        <div class="summary-card-label">${this.t('eg.results.lowScore')}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-card-value">${stats.pass_rate != null ? stats.pass_rate + '%' : '-'}</div>
                        <div class="summary-card-label">${this.t('eg.results.passRate')}</div>
                    </div>
                    <div class="summary-card">
                        <div class="summary-card-value">${papers.length}</div>
                        <div class="summary-card-label">${this.t('eg.results.totalStudents')}</div>
                    </div>
                </div>
            `;
        }

        // Results table
        html += `
            <div class="results-table-wrap">
                <table class="results-table">
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>${this.t('eg.results.classNo')}</th>
                            <th>${this.t('eg.results.studentName')}</th>
                            <th>${this.t('eg.results.totalScore')}</th>
                            <th>${this.t('eg.results.percentage')}</th>
                            <th>${this.t('eg.results.detail')}</th>
                        </tr>
                    </thead>
                    <tbody id="resultsTableBody">
        `;

        papers.forEach((p, idx) => {
            const score = p.total_score != null ? p.total_score : 0;
            const maxScore = p.max_score || 100;
            const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
            const scoreClass = pct >= 80 ? 'high' : pct >= 50 ? 'mid' : 'low';
            const isExpanded = ExamGraderState.expandedStudents.has(p.id);

            const classNo = [p.class_name, p.student_number].filter(Boolean).join(' ');

            html += `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${this._esc(classNo || '-')}</td>
                    <td class="student-name">${this._esc(p.student_name || `#${idx + 1}`)}</td>
                    <td><span class="score-cell ${scoreClass}">${score}</span> / ${maxScore}</td>
                    <td>${pct}%</td>
                    <td style="display:flex;gap:4px;">
                        <button class="detail-toggle-btn ${isExpanded ? 'expanded' : ''}"
                                onclick="ExamGraderApp.toggleStudentDetail('${p.id}')">
                            ${isExpanded ? this.t('eg.results.collapse') : this.t('eg.results.expand')}
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <button class="detail-toggle-btn" onclick="ExamGraderApp.exportStudent('${p.id}')" title="${this.t('eg.btn.exportStudent')}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        </button>
                    </td>
                </tr>
                <tr class="student-detail-row" id="detail-${p.id}" style="${isExpanded ? '' : 'display:none;'}">
                    <td colspan="6">
                        <div class="student-detail-content" id="detailContent-${p.id}">
                            ${isExpanded ? '<div class="loading-spinner" style="margin:16px auto;"></div>' : ''}
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `</tbody></table></div>`;

        // Statistics section
        if (stats && stats.score_distribution) {
            html += this._renderStatistics(stats);
        }

        html += `
            <div style="display:flex;justify-content:space-between;margin-top:var(--space-5);">
                <button class="btn btn-outline" onclick="ExamGraderApp.goToStep(4)">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                    ${this.t('eg.btn.prev')}
                </button>
                <div style="display:flex;gap:var(--space-2);">
                    <button class="btn btn-outline" onclick="ExamGraderApp.exportClass()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        ${this.t('eg.btn.exportClass')}
                    </button>
                    <button class="btn btn-outline" onclick="ExamGraderApp.loadResults()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                        ${this.t('eg.btn.refresh')}
                    </button>
                </div>
            </div>
        `;

        ws.innerHTML = html;

        // Auto-load expanded students
        if (ExamGraderState.expandedStudents.size > 0) {
            ExamGraderState.expandedStudents.forEach(id => {
                ExamGraderApp.loadStudentDetail(id);
            });
        }
    },

    /** Render student detail (answers per question) */
    renderStudentDetail(paperId, answers) {
        const container = document.getElementById(`detailContent-${paperId}`);
        if (!container) return;

        if (!answers || answers.length === 0) {
            container.innerHTML = `<p style="color:var(--text-tertiary);font-size:var(--type-body);">No answers found.</p>`;
            return;
        }

        let html = `<div class="student-answer-list">`;
        answers.forEach(a => {
            const scoreMax = a.max_score || a.points || 0;
            html += `
                <div class="student-answer-item">
                    <div class="student-answer-header">
                        <span class="student-answer-q">Q${a.question_number || '?'}: ${this._esc((a.question_content || '').substring(0, 80))}</span>
                        <div class="student-answer-score">
                            <input type="number" class="score-input-inline" value="${a.score != null ? a.score : 0}" min="0" max="${scoreMax}"
                                   data-answer-id="${a.id}" data-max="${scoreMax}"
                                   onchange="ExamGraderApp.onScoreChange(this)">
                            <span style="font-size:var(--type-meta);color:var(--text-tertiary);">/ ${scoreMax}</span>
                        </div>
                    </div>
                    <div class="student-answer-body">${this._esc(a.student_answer || '(empty)')}</div>
                    <div class="student-answer-correct">${this.t('eg.questions.answer')}: ${this._esc(a.correct_answer || '-')}</div>
                    <input type="text" class="feedback-input-inline" value="${this._esc(a.feedback || '')}"
                           placeholder="${this.t('eg.adjust.feedbackPh')}" data-answer-id="${a.id}"
                           onchange="ExamGraderApp.onFeedbackChange(this)">
                </div>
            `;
        });
        html += `</div>`;
        container.innerHTML = html;
    },

    /** Render statistics */
    _renderStatistics(stats) {
        let html = `<div class="stats-grid" style="margin-top:var(--space-5);">`;

        // Score distribution
        if (stats.score_distribution) {
            html += `
                <div class="stats-card">
                    <div class="stats-card-title">${this.t('eg.stats.distribution')}</div>
                    <div class="bar-chart">
            `;
            const dist = stats.score_distribution;
            const maxCount = Math.max(...Object.values(dist), 1);
            Object.entries(dist).forEach(([range, count]) => {
                const pct = Math.round((count / maxCount) * 100);
                html += `
                    <div class="bar-chart-row">
                        <span class="bar-chart-label">${range}</span>
                        <div class="bar-chart-track">
                            <div class="bar-chart-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="bar-chart-value">${count}</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }

        // Question analysis
        if (stats.question_analysis) {
            html += `
                <div class="stats-card">
                    <div class="stats-card-title">${this.t('eg.stats.questionAnalysis')}</div>
                    <div class="bar-chart">
            `;
            const qa = stats.question_analysis;
            qa.forEach(q => {
                const rate = q.correct_rate != null ? Math.round(q.correct_rate * 100) : 0;
                html += `
                    <div class="bar-chart-row">
                        <span class="bar-chart-label">Q${q.number || '?'}</span>
                        <div class="bar-chart-track">
                            <div class="bar-chart-fill" style="width:${rate}%"></div>
                        </div>
                        <span class="bar-chart-value">${rate}%</span>
                    </div>
                `;
            });
            html += `</div></div>`;
        }

        html += `</div>`;
        return html;
    },

    // ── Helpers ──────────────────────────────────────────────
    _esc(s) {
        if (!s) return '';
        const d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    },

    _badgeLabel(status) {
        const map = {
            draft: this.t('eg.sidebar.filterDraft'),
            ready: this.t('eg.sidebar.filterReady'),
            grading: this.t('eg.sidebar.filterGrading'),
            completed: this.t('eg.sidebar.filterDone'),
            failed: this.t('eg.grading.status.failed'),
            cancelled: this.t('eg.grading.status.cancelled'),
        };
        return map[status] || status || '';
    },

    _renderBadge(status) {
        return `<span class="badge badge-${status || 'draft'}">${this._badgeLabel(status)}</span>`;
    },

    _questionTypeLabel(type) {
        const map = {
            mc: this.t('eg.qtype.mc'),
            multiple_choice: this.t('eg.qtype.mc'),
            fill: this.t('eg.qtype.fill'),
            fill_blank: this.t('eg.qtype.fill'),
            short: this.t('eg.qtype.short'),
            short_answer: this.t('eg.qtype.short'),
            essay: this.t('eg.qtype.essay'),
            tf: this.t('eg.qtype.tf'),
            true_false: this.t('eg.qtype.tf'),
        };
        return map[type] || type || '';
    },

    _sourceLabel(source) {
        const map = {
            manual: this.t('eg.answers.sourceManual'),
            upload: this.t('eg.answers.sourceUpload'),
            ai: this.t('eg.answers.sourceAI'),
        };
        return map[source] || source || '';
    },

    _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return dateStr;
        }
    },
};


/* ============================================================
   App Controller
   ============================================================ */
const ExamGraderApp = {
    async init() {
        // Auth check
        if (!window.AuthModule?.getToken()) {
            window.location.href = '/login';
            return;
        }

        // Load class targets
        this._loadTargets();

        // Load exams
        await this.loadExams();

        // Render initial view
        ExamGraderUI.renderSidebar();
        ExamGraderUI.renderExamList();
    },

    async _loadTargets() {
        const res = await ExamGraderAPI.getTargets();
        if (res && res.success && res.data) {
            // targets can be {classes: [...], students: [...]}
            ExamGraderState.classTargets = res.data.classes || res.data || [];
        }
    },

    // ── Exam List ────────────────────────────────────────────
    async loadExams() {
        const res = await ExamGraderAPI.listExams(ExamGraderState.filterStatus);
        if (res && res.success && res.data) {
            // paginate() returns {items: [...], total, page, page_size}
            ExamGraderState.exams = Array.isArray(res.data) ? res.data : (res.data.items || []);
        } else {
            ExamGraderState.exams = [];
        }
        ExamGraderUI.renderSidebar();
        if (ExamGraderState.currentStep === 0) {
            ExamGraderUI.renderExamList();
        }
    },

    filterExams(status) {
        ExamGraderState.filterStatus = status;
        ExamGraderState.currentStep = 0;
        ExamGraderState.currentExam = null;
        this.loadExams();
    },

    async selectExam(examId) {
        const res = await ExamGraderAPI.getExam(examId);
        if (res && res.success && res.data) {
            ExamGraderState.currentExam = res.data;
            ExamGraderState.questions = res.data.questions || [];
            ExamGraderUI.renderSidebar();
            // Determine which step to show based on exam status
            this._goToAppropriateStep(res.data);
        } else {
            ExamGraderUI.toast(ExamGraderUI.t('eg.error.loadFail'), 'error');
        }
    },

    async continueExam(examId) {
        await this.selectExam(examId);
    },

    _goToAppropriateStep(exam) {
        const status = exam.status || 'draft';
        if (status === 'completed') {
            ExamGraderState.currentStep = 5;
            this.loadResults();
        } else if (status === 'grading') {
            ExamGraderState.currentStep = 4;
            ExamGraderUI.renderGradingStep();
        } else if (exam.answers_confirmed) {
            ExamGraderState.currentStep = 4;
            ExamGraderUI.renderGradingStep();
        } else if (ExamGraderState.questions.length > 0) {
            ExamGraderState.currentStep = 3;
            ExamGraderUI.renderAnswersStep();
        } else {
            ExamGraderState.currentStep = 2;
            ExamGraderUI.renderUploadStep();
        }
    },

    goToStep(step) {
        // Validate navigation
        if (step > 1 && !ExamGraderState.currentExam) {
            return;
        }
        ExamGraderState.currentStep = step;
        this.stopPolling();

        switch (step) {
            case 0:
                ExamGraderState.currentExam = null;
                ExamGraderUI.renderSidebar();
                ExamGraderUI.renderExamList();
                break;
            case 1:
                if (ExamGraderState.currentExam) {
                    ExamGraderUI.renderCreateForm(ExamGraderState.currentExam);
                } else {
                    ExamGraderUI.renderCreateForm(null);
                }
                break;
            case 2:
                ExamGraderUI.renderUploadStep();
                break;
            case 3:
                ExamGraderUI.renderAnswersStep();
                break;
            case 4:
                ExamGraderUI.renderGradingStep();
                break;
            case 5:
                this.loadResults();
                break;
        }
    },

    // ── Create / Edit ────────────────────────────────────────
    showCreateForm() {
        ExamGraderState.currentExam = null;
        ExamGraderState.editingExamId = null;
        ExamGraderState.questions = [];
        ExamGraderState.currentStep = 1;
        ExamGraderUI.renderCreateForm(null);
    },

    selectMode(mode) {
        document.querySelectorAll('.mode-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.mode === mode);
        });
    },

    cancelCreate() {
        ExamGraderState.currentStep = 0;
        ExamGraderUI.renderExamList();
    },

    async submitCreate() {
        const title = document.getElementById('examTitleInput')?.value?.trim();
        if (!title) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.error.required'), 'error');
            return;
        }
        const className = document.getElementById('examClassSelect')?.value || '';
        if (!className) {
            ExamGraderUI.toast('請選擇班級', 'error');
            return;
        }

        const data = {
            title,
            subject: document.getElementById('examSubjectInput')?.value?.trim() || 'ict',
            class_name: className,
            pages_per_exam: parseInt(document.getElementById('examPagesInput')?.value) || 2,
            grading_mode: document.querySelector('.mode-option.selected')?.dataset?.mode || 'moderate',
        };

        let res;
        if (ExamGraderState.currentExam) {
            res = await ExamGraderAPI.updateExam(ExamGraderState.currentExam.id, data);
        } else {
            res = await ExamGraderAPI.createExam(data);
        }

        if (res && res.success) {
            ExamGraderState.currentExam = res.data;
            ExamGraderState.questions = res.data?.questions || [];
            ExamGraderUI.toast(ExamGraderState.editingExamId ? ExamGraderUI.t('eg.toast.saved') : ExamGraderUI.t('eg.toast.created'), 'success');
            await this.loadExams();
            ExamGraderState.currentStep = 2;
            ExamGraderUI.renderUploadStep();
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.saveFail'), 'error');
        }
    },

    // ── Sidebar ──────────────────────────────────────────────
    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        if (!sidebar) return;

        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            sidebar.classList.toggle('open');
            overlay?.classList.toggle('active');
        } else {
            sidebar.classList.toggle('collapsed');
        }
    },

    // ── Upload / Drag-Drop ───────────────────────────────────
    onDragOver(e, zoneId) {
        e.preventDefault();
        e.stopPropagation();
        const zone = document.getElementById(zoneId);
        if (zone) zone.classList.add('drag-over');
    },

    onDragLeave(e, zoneId) {
        e.preventDefault();
        e.stopPropagation();
        const zone = document.getElementById(zoneId);
        if (zone) zone.classList.remove('drag-over');
    },

    onDrop(e, type) {
        e.preventDefault();
        e.stopPropagation();

        // Remove drag-over from all zones
        document.querySelectorAll('.upload-zone').forEach(z => z.classList.remove('drag-over'));

        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
            this.onFileSelected(files, type);
        }
    },

    async onFileSelected(files, type) {
        if (!files || files.length === 0) return;
        const file = files[0];
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        if (type === 'cleanPaper') {
            await this._uploadCleanPaper(exam.id, file);
        } else if (type === 'answerSheet') {
            await this._uploadAnswerSheet(exam.id, file);
        } else if (type === 'batch') {
            await this._uploadBatch(exam.id, file);
        }
    },

    async _uploadCleanPaper(examId, file) {
        const statusEl = document.getElementById('cleanPaperStatus');
        const zone = document.getElementById('cleanPaperUploadZone');
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--text-secondary);"><span class="loading-spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:8px;"></span>${ExamGraderUI.t('eg.upload.uploading')}</p>`;
        if (zone) zone.classList.add('has-file');

        const res = await ExamGraderAPI.uploadCleanPaper(examId, file);
        if (res && res.success) {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-success);font-weight:500;">${ExamGraderUI.t('eg.upload.uploadSuccess')}</p>`;

            // Trigger background extraction (returns immediately)
            if (statusEl) statusEl.innerHTML += `<p style="color:var(--text-secondary);margin-top:8px;"><span class="loading-spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:8px;"></span>${ExamGraderUI.t('eg.upload.extracting')}</p>`;

            await ExamGraderAPI.extractQuestions(examId);

            // Poll until extraction completes
            this._pollExtraction(examId, statusEl);
        } else {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-error);">${ExamGraderUI.t('eg.error.uploadFail')}: ${res?.message || ''}</p>`;
        }
    },

    _pollExtraction(examId, statusEl) {
        if (this._extractTimer) clearInterval(this._extractTimer);
        this._extractTimer = setInterval(async () => {
            const res = await ExamGraderAPI.getExam(examId);
            if (!res || !res.success) return;

            const exam = res.data;
            const status = exam.status;

            if (status === 'questions_extracted') {
                clearInterval(this._extractTimer);
                this._extractTimer = null;
                ExamGraderState.currentExam = exam;
                ExamGraderState.questions = exam.questions || [];
                if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-success);font-weight:500;">${ExamGraderUI.t('eg.upload.extractSuccess')}</p>`;
                ExamGraderUI.renderUploadStep();
                await this.loadExams();
            } else if (status === 'draft') {
                // Extraction failed, reverted to draft
                clearInterval(this._extractTimer);
                this._extractTimer = null;
                if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-error);">${ExamGraderUI.t('eg.upload.extractFail')}</p>`;
            }
            // else still extracting, keep polling
        }, 3000);
    },

    async _uploadAnswerSheet(examId, file) {
        const statusEl = document.getElementById('answerSheetStatus');
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--text-secondary);"><span class="loading-spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:8px;"></span>${ExamGraderUI.t('eg.upload.uploading')}</p>`;

        const res = await ExamGraderAPI.uploadAnswerSheet(examId, file);
        if (res && res.success) {
            const matchInfo = res.data || {};
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-success);font-weight:500;">${ExamGraderUI.t('eg.upload.uploadSuccess')} (${matchInfo.matched || 0}/${matchInfo.total || 0} 題匹配)</p>`;

            // Reload questions to get updated answers
            const examRes = await ExamGraderAPI.getExam(examId);
            if (examRes?.success) {
                ExamGraderState.currentExam = examRes.data;
                ExamGraderState.questions = examRes.data?.questions || [];
            }
            ExamGraderUI.renderAnswersStep();
        } else {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-error);">${ExamGraderUI.t('eg.error.uploadFail')}: ${res?.message || ''}</p>`;
        }
    },

    async _uploadBatch(examId, file) {
        const zone = document.getElementById('batchUploadZone');
        if (zone) {
            zone.classList.add('has-file');
            zone.innerHTML = `
                <div class="upload-zone-file">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    ${ExamGraderUI._esc(file.name)}
                    <span class="loading-spinner" style="width:16px;height:16px;"></span>
                </div>
            `;
        }

        const res = await ExamGraderAPI.uploadBatchPdf(examId, file);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.gradingStarted'), 'success');
            this.startPolling();
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.uploadFail'), 'error');
            if (zone) {
                zone.classList.remove('has-file');
                ExamGraderUI.renderGradingStep();
            }
        }
    },

    // ── Answer Tab ───────────────────────────────────────────
    switchAnswerTab(tab) {
        document.getElementById('tabUpload')?.classList.toggle('active', tab === 'upload');
        document.getElementById('tabAI')?.classList.toggle('active', tab === 'ai');
        document.getElementById('answerTabUpload')?.classList.toggle('active', tab === 'upload');
        document.getElementById('answerTabAI')?.classList.toggle('active', tab === 'ai');
    },

    async generateAnswers() {
        const btn = document.getElementById('aiGenerateBtn');
        const statusEl = document.getElementById('aiGenerateStatus');
        if (btn) btn.disabled = true;
        if (statusEl) statusEl.innerHTML = `<p style="color:var(--text-secondary);"><span class="loading-spinner" style="display:inline-block;width:16px;height:16px;vertical-align:middle;margin-right:8px;"></span>${ExamGraderUI.t('eg.answers.aiGenerating')}</p>`;

        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const res = await ExamGraderAPI.generateAnswers(exam.id);
        if (res && res.success) {
            // Reload questions to get updated answers
            const examRes = await ExamGraderAPI.getExam(exam.id);
            if (examRes?.success) {
                ExamGraderState.currentExam = examRes.data;
                ExamGraderState.questions = examRes.data?.questions || [];
            }
            const info = res.data || {};
            ExamGraderUI.toast(`答案已生成 (${info.generated || 0}/${info.total || 0})`, 'success');
            ExamGraderUI.renderAnswersStep();
        } else {
            if (statusEl) statusEl.innerHTML = `<p style="color:var(--color-error);">${res?.message || ExamGraderUI.t('eg.error.saveFail')}</p>`;
            if (btn) btn.disabled = false;
        }
    },

    async saveQuestions() {
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        // Read answer textareas
        const textareas = document.querySelectorAll('.answer-textarea');
        textareas.forEach(ta => {
            const idx = parseInt(ta.dataset.qIndex);
            if (ExamGraderState.questions[idx]) {
                ExamGraderState.questions[idx].answer = ta.value;
                ExamGraderState.questions[idx].correct_answer = ta.value;
                if (!ExamGraderState.questions[idx].answer_source) {
                    ExamGraderState.questions[idx].answer_source = 'manual';
                }
            }
        });

        const res = await ExamGraderAPI.updateQuestions(exam.id, ExamGraderState.questions);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.saved'), 'success');
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.saveFail'), 'error');
        }
    },

    async confirmAndProceed() {
        await this.saveQuestions();

        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const res = await ExamGraderAPI.confirmAnswers(exam.id);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.answerConfirmed'), 'success');
            ExamGraderState.currentStep = 4;
            ExamGraderUI.renderGradingStep();
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.saveFail'), 'error');
        }
    },

    // ── Grading Progress Polling ─────────────────────────────
    startPolling() {
        this.stopPolling();
        this._pollOnce();
        ExamGraderState.pollingTimer = setInterval(() => this._pollOnce(), 2000);
    },

    stopPolling() {
        if (ExamGraderState.pollingTimer) {
            clearInterval(ExamGraderState.pollingTimer);
            ExamGraderState.pollingTimer = null;
        }
    },

    async _pollOnce() {
        const exam = ExamGraderState.currentExam;
        if (!exam) { this.stopPolling(); return; }

        const res = await ExamGraderAPI.getGradingStatus(exam.id);
        if (res && res.success && res.data) {
            ExamGraderState.gradingProgress = res.data;
            ExamGraderUI.renderGradingProgress(res.data);

            const status = res.data.status;
            if (status === 'completed' || status === 'failed' || status === 'cancelled') {
                this.stopPolling();
                if (status === 'completed') {
                    ExamGraderUI.toast(ExamGraderUI.t('eg.grading.complete'), 'success');
                }
            }
        }
    },

    async cancelGrading() {
        if (!confirm(ExamGraderUI.t('eg.confirm.cancelGrading'))) return;

        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const res = await ExamGraderAPI.cancelGrading(exam.id);
        if (res && res.success) {
            this.stopPolling();
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.gradingCancelled'), 'info');
            ExamGraderUI.renderGradingProgress({ ...ExamGraderState.gradingProgress, status: 'cancelled' });
        }
    },

    // ── Results ──────────────────────────────────────────────
    async loadResults() {
        ExamGraderState.currentStep = 5;
        const exam = ExamGraderState.currentExam;
        if (!exam) return;

        const ws = ExamGraderUI.$workspace();
        ws.innerHTML = `<div class="workspace-loading"><div class="loading-spinner"></div><p>${ExamGraderUI.t('eg.page.loading')}</p></div>`;

        const [resultsRes, statsRes] = await Promise.all([
            ExamGraderAPI.getResults(exam.id),
            ExamGraderAPI.getStatistics(exam.id),
        ]);

        const results = resultsRes?.success ? resultsRes.data : [];
        const stats = statsRes?.success ? statsRes.data : null;

        ExamGraderState.students = results || [];
        ExamGraderUI.renderResultsStep(results, stats);
    },

    async toggleStudentDetail(paperId) {
        if (ExamGraderState.expandedStudents.has(paperId)) {
            ExamGraderState.expandedStudents.delete(paperId);
            const row = document.getElementById(`detail-${paperId}`);
            if (row) row.style.display = 'none';
            const btn = document.querySelector(`[onclick="ExamGraderApp.toggleStudentDetail('${paperId}')"]`);
            if (btn) {
                btn.classList.remove('expanded');
                btn.innerHTML = `${ExamGraderUI.t('eg.results.expand')} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
            }
        } else {
            ExamGraderState.expandedStudents.add(paperId);
            const row = document.getElementById(`detail-${paperId}`);
            if (row) row.style.display = '';
            const btn = document.querySelector(`[onclick="ExamGraderApp.toggleStudentDetail('${paperId}')"]`);
            if (btn) {
                btn.classList.add('expanded');
                btn.innerHTML = `${ExamGraderUI.t('eg.results.collapse')} <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>`;
            }
            await this.loadStudentDetail(paperId);
        }
    },

    async loadStudentDetail(paperId) {
        const container = document.getElementById(`detailContent-${paperId}`);
        if (container) container.innerHTML = `<div class="loading-spinner" style="margin:16px auto;"></div>`;

        const res = await ExamGraderAPI.getStudentAnswers(paperId);
        if (res && res.success) {
            ExamGraderUI.renderStudentDetail(paperId, res.data);
        } else {
            if (container) container.innerHTML = `<p style="color:var(--color-error);">Failed to load details.</p>`;
        }
    },

    // ── Score Adjustment ─────────────────────────────────────
    async onScoreChange(input) {
        const answerId = input.dataset.answerId;
        const score = parseFloat(input.value);
        const max = parseFloat(input.dataset.max);
        if (isNaN(score) || score < 0 || score > max) {
            input.value = Math.min(Math.max(0, score || 0), max);
            return;
        }

        const feedbackEl = document.querySelector(`input.feedback-input-inline[data-answer-id="${answerId}"]`);
        const feedback = feedbackEl?.value || '';

        const res = await ExamGraderAPI.adjustScore(answerId, score, feedback);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.scoreAdjusted'), 'success');
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.saveFail'), 'error');
        }
    },

    async onFeedbackChange(input) {
        const answerId = input.dataset.answerId;
        const feedback = input.value;
        const scoreEl = document.querySelector(`input.score-input-inline[data-answer-id="${answerId}"]`);
        const score = parseFloat(scoreEl?.value) || 0;

        const res = await ExamGraderAPI.adjustScore(answerId, score, feedback);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.adjust.saved'), 'success');
        }
    },

    // ── Export ───────────────────────────────────────────────
    exportClass() {
        const exam = ExamGraderState.currentExam;
        if (!exam) return;
        window.open(ExamGraderAPI.exportClassUrl(exam.id), '_blank');
    },

    exportStudent(paperId) {
        window.open(ExamGraderAPI.exportStudentUrl(paperId), '_blank');
    },

    // ── Delete ───────────────────────────────────────────────
    async deleteExam(examId) {
        if (!confirm(ExamGraderUI.t('eg.confirm.delete'))) return;

        const res = await ExamGraderAPI.deleteExam(examId);
        if (res && res.success) {
            ExamGraderUI.toast(ExamGraderUI.t('eg.toast.deleted'), 'success');
            ExamGraderState.currentExam = null;
            ExamGraderState.currentStep = 0;
            await this.loadExams();
        } else {
            ExamGraderUI.toast(res?.message || ExamGraderUI.t('eg.error.deleteFail'), 'error');
        }
    },
};


/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // Apply i18n
    if (typeof i18n !== 'undefined' && i18n.applyDOM) {
        i18n.applyDOM();
        document.title = i18n.t('eg.page.title');
    }

    // Init app
    ExamGraderApp.init();
});
