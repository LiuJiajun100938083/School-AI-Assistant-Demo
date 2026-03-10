/**
 * 作業管理 — 前端核心模組
 * ========================
 * 架構：
 *   AssignmentAPI  — API 請求封裝
 *   AssignmentUI   — DOM 渲染
 *   AssignmentApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, APIClient
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */
const AssignmentAPI = {
    _headers() {
        const h = { 'Content-Type': 'application/json' };
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    },
    _authHeaders() {
        const h = {};
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    },
    async _call(url, opts = {}) {
        try {
            const resp = await fetch(url, { headers: this._headers(), ...opts });
            if (resp.status === 401) { window.location.href = '/'; return null; }
            return resp.json();
        } catch (e) { console.error('API error:', e); return null; }
    },

    // Teacher APIs
    async createAssignment(data) {
        return this._call('/api/assignments/teacher', { method: 'POST', body: JSON.stringify(data) });
    },
    async listTeacherAssignments(status = '', page = 1) {
        let url = `/api/assignments/teacher?page=${page}&page_size=50`;
        if (status) url += `&status=${status}`;
        return this._call(url);
    },
    async getTeacherAssignment(id) {
        return this._call(`/api/assignments/teacher/${id}`);
    },
    async updateAssignment(id, data) {
        return this._call(`/api/assignments/teacher/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async publishAssignment(id) {
        return this._call(`/api/assignments/teacher/${id}/publish`, { method: 'POST' });
    },
    async closeAssignment(id) {
        return this._call(`/api/assignments/teacher/${id}/close`, { method: 'POST' });
    },
    async deleteAssignment(id) {
        return this._call(`/api/assignments/teacher/${id}`, { method: 'DELETE' });
    },
    async listSubmissions(assignmentId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/submissions`);
    },
    async getSubmission(subId) {
        return this._call(`/api/assignments/teacher/submissions/${subId}`);
    },
    async gradeSubmission(subId, data) {
        return this._call(`/api/assignments/teacher/submissions/${subId}/grade`, {
            method: 'POST', body: JSON.stringify(data)
        });
    },
    async aiGrade(subId, extraPrompt = '') {
        return this._call(`/api/assignments/teacher/submissions/${subId}/ai-grade`, {
            method: 'POST',
            body: JSON.stringify({ extra_prompt: extraPrompt }),
        });
    },
    // Batch AI Grade
    async startBatchAiGrade(assignmentId, extraPrompt = '', mode = 'remaining') {
        return this._call(`/api/assignments/teacher/${assignmentId}/batch-ai-grade`, {
            method: 'POST',
            body: JSON.stringify({ extra_prompt: extraPrompt, mode }),
        });
    },
    async getBatchAiStatus(assignmentId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/batch-ai-grade/status`);
    },
    async cancelBatchAiGrade(assignmentId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/batch-ai-grade/cancel`, { method: 'POST' });
    },
    // Plagiarism Excel export (returns raw Response)
    async exportPlagiarismExcel(assignmentId) {
        const token = AuthModule?.getToken?.() || localStorage.getItem('auth_token');
        const resp = await fetch(`/api/assignments/teacher/${assignmentId}/plagiarism-report/export-excel`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        if (!resp.ok) throw new Error('匯出失敗');
        return resp;
    },
    // Excel export (returns raw Response, not parsed JSON)
    async exportExcel(assignmentId) {
        const token = AuthModule?.getToken?.() || localStorage.getItem('auth_token');
        const resp = await fetch(`/api/assignments/teacher/${assignmentId}/export-excel`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        if (!resp.ok) throw new Error('匯出失敗');
        return resp;
    },
    async getTargets() {
        return this._call('/api/assignments/teacher/targets');
    },

    // Exam Paper OCR APIs
    async uploadExamPaper(files) {
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        const resp = await fetch('/api/assignments/teacher/upload-exam-paper', {
            method: 'POST',
            headers: this._authHeaders(),
            body: formData
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        return resp.json();
    },
    async getExamPaperStatus(batchId) {
        return this._call(`/api/assignments/teacher/upload-exam-paper/${batchId}/status`);
    },
    async getAssignmentQuestions(assignmentId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/questions`);
    },
    async saveAssignmentQuestions(assignmentId, questions) {
        return this._call(`/api/assignments/teacher/${assignmentId}/questions`, {
            method: 'PUT', body: JSON.stringify({ questions })
        });
    },

    // Student APIs
    async listMyAssignments(status = '') {
        let url = '/api/assignments';
        if (status) url += `?status=${status}`;
        return this._call(url);
    },
    async getMyAssignment(id) {
        return this._call(`/api/assignments/${id}`);
    },
    async submitAssignment(assignmentId, content, files) {
        const formData = new FormData();
        formData.append('content', content);
        if (files) { for (const f of files) formData.append('files', f); }
        const resp = await fetch(`/api/assignments/${assignmentId}/submit`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: formData
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        return resp.json();
    },
    async teacherSubmitForStudent(assignmentId, studentUsername, files, content = '') {
        const formData = new FormData();
        formData.append('student_username', studentUsername);
        formData.append('content', content);
        if (files) { for (const f of files) formData.append('files', f); }
        const resp = await fetch(`/api/assignments/teacher/${assignmentId}/submit-for-student`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: formData
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        return resp.json();
    },

    // Form APIs
    async submitForm(assignmentId, answersJson, filesByQuestion) {
        const formData = new FormData();
        formData.append('answers', answersJson);
        if (filesByQuestion) {
            for (const [qId, files] of Object.entries(filesByQuestion)) {
                for (const f of files) formData.append(`files_${qId}`, f);
            }
        }
        const resp = await fetch(`/api/assignments/${assignmentId}/submit-form`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: formData
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        return resp.json();
    },
    async submitExam(assignmentId, answers) {
        return this._call(`/api/assignments/${assignmentId}/submit-exam`, {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });
    },
    async aiGradeForm(submissionId) {
        return this._call(`/api/assignments/teacher/submissions/${submissionId}/ai-grade-form`, { method: 'POST' });
    },
    async gradeFormAnswer(submissionId, answerId, data) {
        return this._call(`/api/assignments/teacher/submissions/${submissionId}/answers/${answerId}/grade`, {
            method: 'PUT', body: JSON.stringify(data)
        });
    },

    // Attachments
    async uploadAttachments(assignmentId, files) {
        const formData = new FormData();
        for (const f of files) formData.append('files', f);
        const resp = await fetch(`/api/assignments/teacher/${assignmentId}/attachments`, {
            method: 'POST',
            headers: this._authHeaders(),
            body: formData
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        return resp.json();
    },
    async deleteAttachment(assignmentId, fileId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/attachments/${fileId}`, { method: 'DELETE' });
    },

    // Swift
    async runSwift(code) {
        return this._call('/api/assignments/run-swift', {
            method: 'POST', body: JSON.stringify({ code })
        });
    },

    // Plagiarism Detection
    async startPlagiarismCheck(assignmentId, { threshold = 60, subject = '', detect_mode = 'mixed' } = {}) {
        return this._call(`/api/assignments/teacher/${assignmentId}/plagiarism-check`, {
            method: 'POST', body: JSON.stringify({ threshold, subject, detect_mode }),
        });
    },
    async getPlagiarismPresets() {
        return this._call('/api/assignments/teacher/plagiarism-presets');
    },
    async getPlagiarismStatus(assignmentId) {
        return this._call(`/api/assignments/teacher/${assignmentId}/plagiarism-check/status`);
    },
    async getPlagiarismReport(assignmentId, flaggedOnly = false) {
        let url = `/api/assignments/teacher/${assignmentId}/plagiarism-report`;
        if (flaggedOnly) url += '?flagged_only=true';
        return this._call(url);
    },
    async getPlagiarismPairDetail(pairId) {
        return this._call(`/api/assignments/teacher/plagiarism-pairs/${pairId}`);
    }
};

/* ============================================================
   UI — DOM 渲染
   ============================================================ */
const AssignmentUI = {

    // SVG inline icons (consistent stroke style)
    _svg(d, size=16) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;">${d}</svg>`;
    },
    get ICON() {
        const s = this._svg.bind(this);
        return {
            file:     s('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>'),
            clock:    s('<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>'),
            user:     s('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>'),
            check:    s('<polyline points="20 6 9 17 4 12"/>'),
            upload:   s('<polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>'),
            folder:   s('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>'),
            inbox:    s('<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>'),
            chart:    s('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>'),
            edit:     s('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>'),
            clip:     s('<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>'),
            ai:       s('<circle cx="12" cy="12" r="10"/><path d="M9 9h.01"/><path d="M15 9h.01"/><path d="M8 13a4 4 0 0 0 8 0"/>', 18),
            play:     s('<polygon points="5 3 19 12 5 21 5 3"/>'),
        };
    },

    FILE_ICONS: {
        pdf: '<span style="color:#e74c3c;font-weight:600">PDF</span>',
        document: '<span style="color:#2980b9;font-weight:600">DOC</span>',
        doc: '<span style="color:#2980b9;font-weight:600">DOC</span>',
        ppt: '<span style="color:#e67e22;font-weight:600">PPT</span>',
        image: '<span style="color:#27ae60;font-weight:600">IMG</span>',
        video: '<span style="color:#8e44ad;font-weight:600">VID</span>',
        code: '<span style="color:#2c3e50;font-weight:600">&lt;/&gt;</span>',
        archive: '<span style="color:#7f8c8d;font-weight:600">ZIP</span>'
    },

    STATUS_LABELS: {
        draft: '草稿', published: '已發布', closed: '已關閉',
        submitted: '已提交', graded: '已批改', returned: '已退回',
        not_submitted: '未提交'
    },

    // ---- Sidebar Rendering ----
    renderSidebarNav(items, activeKey) {
        return items.map(item =>
            `<button class="sidebar-nav-item ${activeKey === item.key ? 'active' : ''}"
                onclick="${item.action}">
                <span>${item.label}</span>
                <span class="sidebar-nav-count">${item.count}</span>
            </button>`
        ).join('');
    },

    renderSidebarStats(stats) {
        return stats.map(s =>
            `<div class="sidebar-stat-item">
                <span class="sidebar-stat-label">${s.label}</span>
                <span class="sidebar-stat-value">${s.value}</span>
            </div>`
        ).join('');
    },

    renderWorkspaceHeader(title, subtitle = '', actionsHtml = '') {
        return `<div class="workspace-header">
            <div>
                <h2 class="workspace-title">${title}</h2>
                ${subtitle ? `<p class="workspace-subtitle">${subtitle}</p>` : ''}
            </div>
            <div class="workspace-header-actions">${actionsHtml}</div>
        </div>`;
    },

    // Skeleton loading placeholders
    skeletonCards(count = 3) {
        return Array.from({ length: count }, () => `
            <div class="skeleton-card">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px">
                    <div style="flex:1">
                        <div class="skeleton skeleton-heading"></div>
                        <div class="skeleton skeleton-text long"></div>
                    </div>
                    <div class="skeleton skeleton-badge" style="margin-left:12px"></div>
                </div>
                <div style="display:flex;gap:16px">
                    <div class="skeleton skeleton-text short"></div>
                    <div class="skeleton skeleton-text short"></div>
                </div>
            </div>
        `).join('');
    },

    skeletonDetail() {
        return `
            <div class="skeleton-card" style="margin-bottom:16px">
                <div class="skeleton skeleton-heading" style="width:60%"></div>
                <div style="display:flex;gap:12px;margin-top:12px">
                    <div class="skeleton skeleton-badge"></div>
                    <div class="skeleton skeleton-badge" style="width:80px"></div>
                    <div class="skeleton skeleton-badge" style="width:100px"></div>
                </div>
            </div>
            <div style="display:grid;gap:12px">
                ${Array.from({ length: 3 }, () => `
                    <div class="skeleton-card" style="display:flex;align-items:center;gap:12px">
                        <div class="skeleton skeleton-avatar"></div>
                        <div style="flex:1">
                            <div class="skeleton skeleton-text medium"></div>
                            <div class="skeleton skeleton-text short"></div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    },

    skeletonSubmission() {
        return `
            <div style="display:grid;grid-template-columns:1fr 380px;gap:24px">
                <div>
                    <div class="skeleton-card" style="margin-bottom:16px">
                        <div class="skeleton skeleton-heading"></div>
                        <div class="skeleton skeleton-text long"></div>
                        <div class="skeleton skeleton-text long"></div>
                        <div class="skeleton skeleton-text medium"></div>
                    </div>
                </div>
                <div class="skeleton-card">
                    <div class="skeleton skeleton-heading" style="width:30%"></div>
                    <div style="display:grid;gap:12px;margin-top:16px">
                        <div class="skeleton skeleton-text long"></div>
                        <div class="skeleton skeleton-text long"></div>
                        <div class="skeleton skeleton-text long"></div>
                    </div>
                </div>
            </div>
        `;
    },

    formatDate(d) {
        if (!d) return '—';
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    },

    formatFileSize(bytes) {
        if (!bytes) return '0B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + sizes[i];
    },

    progressRing(pct, size = 44) {
        const r = (size - 6) / 2;
        const c = 2 * Math.PI * r;
        const offset = c * (1 - pct / 100);
        const color = pct >= 80 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--border-strong)';
        return `<div class="progress-ring" style="width:${size}px;height:${size}px">
            <svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}"
                fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="3"/>
            <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}"
                stroke-width="3" stroke-dasharray="${c}" stroke-dashoffset="${offset}"
                stroke-linecap="round"/></svg>
            <span class="progress-ring-text">${Math.round(pct)}%</span></div>`;
    },

    badge(status) {
        return `<span class="badge badge-${status}">${this.STATUS_LABELS[status] || status}</span>`;
    },

    // ---- Teacher List View ----
    renderTeacherListView(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${this.ICON.inbox}</div>
            <div class="empty-state-text">尚無作業</div>
            <div class="empty-state-hint">點擊左側「+ 新增作業」開始</div></div>`;
        return `<div class="assignment-table"><table>
            <thead><tr><th>標題</th><th>教師</th><th>目標</th><th>截止日</th><th>提交</th><th>狀態</th></tr></thead>
            <tbody>${assignments.map(a => {
                const target = a.target_type === 'all' ? '所有人' :
                    a.target_type === 'class' ? a.target_value : '指定學生';
                return `<tr onclick="AssignmentApp.viewAssignment(${a.id})">
                    <td class="title-cell">${a.title}</td>
                    <td>${a.created_by_name || ''}</td>
                    <td>${target}</td>
                    <td>${this.formatDate(a.deadline)}</td>
                    <td>${a.submission_count||0} 份</td>
                    <td>${this.badge(a.status)}</td></tr>`;
            }).join('')}</tbody></table></div>`;
    },

    // ---- Teacher Grid View (SaaS redesign) ----
    renderTeacherGridView(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">尚無作業</div>
            <div class="empty-state-hint">點擊左側「+ 新增作業」開始</div></div>`;
        return `<div class="assignment-grid">${assignments.map(a => {
            const pct = a.submission_count > 0 ? Math.round((a.graded_count||0)/(a.submission_count)*100) : 0;
            const desc = a.description ? a.description.slice(0, 60) : '';
            const target = a.target_type === 'all' ? '所有人' :
                a.target_type === 'class' ? a.target_value : '指定學生';
            return `<div class="grid-card" data-status="${a.status}" tabindex="0" onclick="AssignmentApp.viewAssignment(${a.id})" onkeydown="event.key==='Enter'&&this.click()">
                <div class="grid-card-header">
                    <div class="grid-card-title">${a.title}</div>
                    ${this.badge(a.status)}
                </div>
                ${desc ? `<div class="grid-card-desc">${desc}</div>` : ''}
                <div class="grid-card-meta">
                    <span>截止：${this.formatDate(a.deadline)}</span>
                    <span class="meta-dot">·</span>
                    <span>${a.submission_count||0}份提交</span>
                    <span class="meta-dot">·</span>
                    <span>${target}</span>
                </div>
                <div class="grid-card-footer">
                    <span class="grid-card-teacher">${a.created_by_name || ''}</span>
                    <div class="grid-card-progress-wrap">
                        <div class="grid-card-progress">
                            <div class="grid-card-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="grid-card-progress-text">${pct}%</span>
                    </div>
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Student List View ----
    deadlineWarning(deadline) {
        if (!deadline) return '';
        const diff = new Date(deadline) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        if (days < 0) return `<span class="deadline-warn overdue">已逾期</span>`;
        if (days <= 1) return `<span class="deadline-warn urgent">今天截止</span>`;
        if (days <= 3) return `<span class="deadline-warn soon">還剩 ${days} 天</span>`;
        return '';
    },

    renderStudentAssignments(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">暫無作業</div></div>`;
        return `<div class="assignment-grid">${assignments.map(a => {
            const st = a.submission_status || 'not_submitted';
            const warn = st === 'not_submitted' ? this.deadlineWarning(a.deadline) : '';
            const pct = st === 'graded' ? 100 : st === 'submitted' ? 50 : 0;
            const desc = a.description ? a.description.slice(0, 60) : '';
            return `<div class="grid-card" data-status="${st}" tabindex="0" onclick="AssignmentApp.viewStudentAssignment(${a.id})" onkeydown="event.key==='Enter'&&this.click()">
                <div class="grid-card-header">
                    <div class="grid-card-title">${a.title}</div>
                    ${this.badge(st)}
                </div>
                ${desc ? `<div class="grid-card-desc">${desc}</div>` : ''}
                <div class="grid-card-meta">
                    <span>截止：${this.formatDate(a.deadline)}</span>
                    <span class="meta-dot">·</span>
                    <span>${a.created_by_name||''}</span>
                    ${warn ? `<span class="meta-dot">·</span>${warn}` : ''}
                </div>
                <div class="grid-card-footer">
                    ${a.my_score !== null && a.my_score !== undefined ?
                        `<span class="submission-score">${a.my_score}/${a.max_score}</span>` :
                        '<span style="color:var(--text-tertiary);font-size:13px;">未評分</span>'}
                    <div class="grid-card-progress-wrap">
                        <div class="grid-card-progress">
                            <div class="grid-card-progress-fill" style="width:${pct}%"></div>
                        </div>
                        <span class="grid-card-progress-text">${pct}%</span>
                    </div>
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Submission List ----
    renderSubmissionsList(submissions) {
        if (!submissions.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">尚無學生提交</div></div>`;
        return `<div class="assignment-grid">${submissions.map(s => {
            const initial = (s.student_name || s.username || '?')[0].toUpperCase();
            return `<div class="submission-card" tabindex="0" onclick="AssignmentApp.viewSubmission(${s.id})" onkeydown="event.key==='Enter'&&this.click()">
                <div class="student-avatar">${initial}</div>
                <div class="submission-info">
                    <h4>${s.student_name || s.username}</h4>
                    <p>${s.class_name || ''} · ${this.formatDate(s.submitted_at)}
                    ${s.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}</p>
                </div>
                <div>
                    ${s.score !== null && s.score !== undefined ?
                        `<span class="submission-score">${s.score}</span>` :
                        this.badge(s.status)}
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Proxy Submit List (Teacher drag-drop) ----
    renderProxySubmitList(notSubmitted, submissions) {
        // Group: not submitted first, then already submitted
        const allCards = [];

        // Not submitted students — show drag-drop zones
        notSubmitted.forEach(s => {
            const initial = (s.display_name || s.username || '?')[0].toUpperCase();
            allCards.push(`<div class="proxy-drop-card" data-username="${s.username}"
                ondragover="AssignmentApp._proxyDragOver(event)"
                ondragleave="AssignmentApp._proxyDragLeave(event)"
                ondrop="AssignmentApp._proxyDrop(event, '${s.username}')">
                <div class="student-avatar">${initial}</div>
                <div class="submission-info">
                    <h4>${s.display_name || s.username}</h4>
                    <p>${s.class_name || ''}</p>
                </div>
                <div class="proxy-drop-hint">
                    <span class="badge badge-not_submitted">未提交</span>
                    <span class="proxy-drop-text">拖拽文件到此處</span>
                </div>
                <div class="proxy-files-area" id="proxyFiles_${s.username}" style="display:none;"></div>
            </div>`);
        });

        // Already submitted students — show status
        submissions.forEach(s => {
            const initial = (s.student_name || s.username || '?')[0].toUpperCase();
            allCards.push(`<div class="proxy-drop-card proxy-submitted"
                data-username="${s.username}"
                ondragover="AssignmentApp._proxyDragOver(event)"
                ondragleave="AssignmentApp._proxyDragLeave(event)"
                ondrop="AssignmentApp._proxyDrop(event, '${s.username}')">
                <div class="student-avatar">${initial}</div>
                <div class="submission-info">
                    <h4>${s.student_name || s.username}</h4>
                    <p>${s.class_name || ''} · ${this.formatDate(s.submitted_at)}</p>
                </div>
                <div class="proxy-drop-hint">
                    ${s.score !== null && s.score !== undefined ?
                        `<span class="submission-score">${s.score}</span>` :
                        this.badge(s.status)}
                    <span class="proxy-drop-text">拖拽可重新提交</span>
                </div>
                <div class="proxy-files-area" id="proxyFiles_${s.username}" style="display:none;"></div>
            </div>`);
        });

        if (!allCards.length) return `<div class="empty-state">
            <div class="empty-state-icon">${this.ICON.inbox}</div>
            <div class="empty-state-text">沒有可代提交的學生</div></div>`;

        return `<div class="proxy-submit-hint" style="margin-bottom:12px;padding:12px 16px;background:var(--brand-lighter);border-radius:var(--radius-card);font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;">
            ${this.ICON.upload} 將文件拖拽到學生卡片上即可代為提交作業
        </div>
        <div class="assignment-grid">${allCards.join('')}</div>`;
    },

    // ---- File List ----
    renderFiles(files, opts = {}) {
        if (!files || !files.length) return '<p style="color:var(--text-tertiary);font-size:14px;">無文件</p>';
        // 如果是 inline 預覽模式（老師查看提交詳情），用文件預覽塊
        if (opts.inlinePreview) {
            return `<div class="file-preview-list">${files.map((f, idx) => {
                const icon = this.FILE_ICONS[f.file_type] || this.ICON.clip;
                const ext = (f.original_name || '').split('.').pop().toLowerCase();
                const isSwift = ext === 'swift';
                const isHtml = ext === 'html' || ext === 'htm';
                return `<div class="file-preview-block" data-file-id="${f.id}" data-file-type="${f.file_type}" data-file-ext="${ext}" data-file-path="/${f.file_path}" data-idx="${idx}">
                    <div class="file-preview-header">
                        <span class="file-item-icon">${icon}</span>
                        <span class="file-preview-name">${this._escapeHtml ? this._escapeHtml(f.original_name) : f.original_name}</span>
                        <span class="file-preview-size">${this.formatFileSize(f.file_size)}</span>
                        ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${f.file_path}')">▶ 運行</button>` : ''}
                        ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${f.file_path}','${AssignmentUI._escapeHtml(f.original_name)}')">▶ 運行預覽</button>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="this.closest('.file-preview-block').classList.toggle('collapsed')">收起</button>
                        <a class="btn btn-sm btn-outline" href="/${f.file_path}" download="${AssignmentUI._escapeHtml(f.original_name)}">下載</a>
                    </div>
                    <div class="file-preview-content" data-loaded="false">
                        <div class="file-preview-loading"><div class="loading-spinner"></div> 載入預覽中...</div>
                    </div>
                </div>`;
            }).join('')}</div>`;
        }
        // 原始列表模式（其他場景）
        return `<div class="file-list">${files.map(f => {
            const icon = this.FILE_ICONS[f.file_type] || this.ICON.clip;
            const isCode = f.file_type === 'code';
            const ext = f.original_name.split('.').pop().toLowerCase();
            const isSwift = ext === 'swift';
            const isHtml = ext === 'html' || ext === 'htm';
            return `<div class="file-item">
                <span class="file-item-icon">${icon}</span>
                <div class="file-item-info">
                    <div class="name">${f.original_name}</div>
                    <div class="size">${this.formatFileSize(f.file_size)}</div>
                </div>
                <div class="file-item-actions">
                    ${f.file_type === 'image' ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.previewImage('/${f.file_path}')">預覽</button>` : ''}
                    ${f.file_type === 'pdf' ? `<button class="btn btn-sm btn-outline" onclick="window.open('/${f.file_path}','_blank')">查看</button>` : ''}
                    ${isCode ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.viewCode(${f.id},'${f.file_path}','${f.original_name}')">查看代碼</button>` : ''}
                    ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${f.file_path}')">▶ 運行</button>` : ''}
                    ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${f.file_path}','${f.original_name}')">▶ 預覽</button>` : ''}
                    ${f.file_type === 'video' ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewVideo('/${f.file_path}','${f.original_name}')">▶ 播放</button>` : ''}
                    <a class="btn btn-sm btn-outline" href="/${f.file_path}" download="${f.original_name}">下載</a>
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Grading Panel (type-aware) ----
    renderGradingPanel(rubricItems, existingScores = [], feedback = '', rubricType = 'points', rubricConfig = null) {
        const scoreMap = {};
        const reasonMap = {};
        const levelMap = {};
        if (existingScores) {
            existingScores.forEach(s => {
                scoreMap[s.rubric_item_id] = s.points;
                if (s.reason) reasonMap[s.rubric_item_id] = s.reason;
                if (s.selected_level) levelMap[s.rubric_item_id] = s.selected_level;
            });
        }
        const typeObj = AssignmentApp.RUBRIC_TYPES?.find(t => t.id === rubricType);
        const typeBadge = typeObj ? `<span class="badge" style="background:var(--brand-light);color:var(--brand);font-size:11px;">${typeObj.icon} ${typeObj.name}</span>` : '';
        let html = `<div class="grading-panel" data-rubric-type="${rubricType}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">
                <h3 style="margin:0;">${AssignmentUI.ICON.inbox} 批改面板</h3>
                ${typeBadge}
            </div>
            <button class="btn btn-ai" style="width:100%;margin-bottom:16px;" onclick="AssignmentApp.doAiGrade()">
                ${AssignmentUI.ICON.ai} AI 自動批改
            </button>
            <div id="aiGradeStatus"></div>`;

        if (rubricType === 'holistic') {
            // Holistic: select one level
            const levels = (rubricConfig?.levels) || [];
            levels.forEach(lv => {
                const sel = existingScores.length && existingScores[0]?.selected_level === lv.label ? 'selected' : '';
                html += `<div class="holistic-option ${sel}" data-label="${lv.label}" data-min="${lv.min}" data-max="${lv.max}"
                    onclick="AssignmentApp._selectHolisticLevel(this)">
                    <div class="holistic-option-header">
                        <span>${lv.label}</span><span>${lv.min}-${lv.max} 分</span>
                    </div>
                    <div class="holistic-option-desc">${lv.description || ''}</div>
                </div>`;
            });
            html += `<div class="form-group" style="margin-top:12px;">
                <label>分數 (在所選等級範圍內)</label>
                <input type="number" id="holisticScore" class="rubric-input" value="${existingScores[0]?.points || ''}"
                    style="width:100px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
            </div>`;
            html += `<div id="aiReason_holistic" class="ai-reason">${reasonMap[0] || ''}</div>`;

        } else if (rubricType === 'checklist') {
            rubricItems.forEach(item => {
                const passed = (scoreMap[item.id] || 0) > 0;
                const reason = reasonMap[item.id] || '';
                html += `<div class="rubric-score-item">
                    <div class="rubric-score-row" style="justify-content:space-between;">
                        <label>${item.title}</label>
                        <span class="check-toggle ${passed ? 'passed' : 'failed'}" data-id="${item.id}"
                            onclick="AssignmentApp._toggleCheck(this)">
                            ${passed ? '● 通過' : '✗ 不通過'}
                        </span>
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            const maxScore = rubricConfig?.max_score || 100;
            html += `<div class="grade-total">
                <span>得分</span>
                <span><span id="gradeTotal">0</span> / ${maxScore}</span>
            </div>`;

        } else if (rubricType === 'competency') {
            const levelLabels = rubricConfig?.level_labels || ['Not Yet', 'Approaching', 'Meeting', 'Exceeding'];
            rubricItems.forEach(item => {
                const sel = levelMap[item.id] || '';
                const reason = reasonMap[item.id] || '';
                html += `<div class="rubric-score-item">
                    <label style="font-weight:500;margin-bottom:4px;">${item.title}</label>
                    <div class="level-btn-group">
                        ${levelLabels.map(l => `<button class="level-btn ${sel === l ? 'selected' : ''}"
                            data-id="${item.id}" data-level="${l}"
                            onclick="AssignmentApp._selectLevel(this)">${l}</button>`).join('')}
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });

        } else if (rubricType === 'analytic_levels') {
            rubricItems.forEach(item => {
                const val = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '';
                const sel = levelMap[item.id] || '';
                const reason = reasonMap[item.id] || '';
                const levels = item.level_definitions || [];
                html += `<div class="rubric-score-item">
                    <div class="rubric-score-row">
                        <label>${item.title}</label>
                        <span class="max-pts">/ ${item.max_points}</span>
                        <input type="number" class="rubric-input" data-id="${item.id}" data-max="${item.max_points}"
                            value="${val}" min="0" max="${item.max_points}" step="0.5"
                            oninput="AssignmentApp.updateGradeTotal()">
                    </div>
                    <div class="level-btn-group">
                        ${levels.map(l => `<button class="level-btn ${sel === l.level ? 'selected' : ''}"
                            data-id="${item.id}" data-level="${l.level}" data-points="${l.points}"
                            onclick="AssignmentApp._selectAnalyticLevel(this)"
                            title="${l.description || ''}">${l.level} (${l.points})</button>`).join('')}
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            html += `<div class="grade-total">
                <span>總分</span>
                <span><span id="gradeTotal">0</span> / ${rubricItems.reduce((s,i)=>s+parseFloat(i.max_points||0),0)}</span>
            </div>`;

        } else if (rubricType === 'weighted_pct') {
            const totalScore = rubricConfig?.total_score || 100;
            rubricItems.forEach(item => {
                const val = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '';
                const reason = reasonMap[item.id] || '';
                html += `<div class="rubric-score-item">
                    <div class="rubric-score-row">
                        <label>${item.title} <span style="color:var(--text-tertiary);font-size:12px;">(${item.weight||0}%)</span></label>
                        <span class="max-pts">/ ${totalScore}</span>
                        <input type="number" class="rubric-input" data-id="${item.id}" data-max="${totalScore}" data-weight="${item.weight||0}"
                            value="${val}" min="0" max="${totalScore}" step="0.5"
                            oninput="AssignmentApp.updateGradeTotal()">
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            html += `<div class="grade-total">
                <span>加權總分</span>
                <span><span id="gradeTotal">0</span></span>
            </div>`;

        } else if (rubricType === 'dse_criterion') {
            rubricItems.forEach(item => {
                const val = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '';
                const reason = reasonMap[item.id] || '';
                const levels = item.level_definitions || [];
                html += `<div class="rubric-score-item">
                    <div class="rubric-score-row">
                        <label>${item.title}</label>
                        <span class="max-pts">/ ${item.max_points}</span>
                        <input type="number" class="rubric-input" data-id="${item.id}" data-max="${item.max_points}"
                            value="${val}" min="0" max="${item.max_points}" step="1"
                            oninput="AssignmentApp.updateGradeTotal()">
                    </div>
                    ${levels.length ? `<div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">
                        ${levels.filter(l=>l.description).map(l=>`<div><strong>${l.level}:</strong> ${l.description}</div>`).join('')}
                    </div>` : ''}
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            html += `<div class="grade-total">
                <span>總分</span>
                <span><span id="gradeTotal">0</span> / ${rubricItems.reduce((s,i)=>s+parseFloat(i.max_points||0),0)}</span>
            </div>`;

        } else {
            // Default: points
            rubricItems.forEach(item => {
                const val = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '';
                const reason = reasonMap[item.id] || '';
                html += `<div class="rubric-score-item">
                    <div class="rubric-score-row">
                        <label>${item.title}</label>
                        <span class="max-pts">/ ${item.max_points}</span>
                        <input type="number" class="rubric-input" data-id="${item.id}" data-max="${item.max_points}"
                            value="${val}" min="0" max="${item.max_points}" step="0.5"
                            oninput="AssignmentApp.updateGradeTotal()">
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            html += `<div class="grade-total">
                <span>總分</span>
                <span><span id="gradeTotal">0</span> / ${rubricItems.reduce((s,i)=>s+parseFloat(i.max_points||0),0)}</span>
            </div>`;
        }

        // Feedback + submit (always present except pure competency keeps submit)
        html += `<div class="form-group" style="margin-top:16px;">
            <label>教師評語</label>
            <textarea id="gradeFeedback" rows="3" placeholder="輸入評語...">${feedback}</textarea>
        </div>
        <button class="btn btn-primary" style="width:100%;" onclick="AssignmentApp.doGrade()">提交批改</button>
        </div>`;
        return html;
    },

    // ---- Plagiarism Detection UI ----

    renderPlagiarismReport(report, pairs, clusters, hubStudents) {
        if (!report) return '<div class="empty-state"><div class="empty-state-text">尚未執行過抄袭檢測</div></div>';

        clusters = clusters || [];
        hubStudents = hubStudents || [];
        const statusMap = { completed: '已完成', running: '檢測中', failed: '失敗', pending: '等待中' };
        const statusClass = { completed: 'badge-graded', running: 'badge-submitted', failed: 'badge-late', pending: 'badge-not_submitted' };
        const flaggedPairs = (pairs || []).filter(p => p.is_flagged);
        const totalStudents = new Set();
        (pairs || []).forEach(p => {
            if (p.student_a_name) totalStudents.add(p.student_a_name);
            if (p.student_b_name) totalStudents.add(p.student_b_name);
        });

        // 風險等級判定
        const riskLevel = report.flagged_pairs === 0 ? 'low' : (report.flagged_pairs <= 3 ? 'medium' : 'high');
        const riskLabel = { low: '低風險', medium: '中等風險', high: '高風險' };
        const riskColor = { low: 'var(--color-success, #248A3D)', medium: 'var(--text-secondary)', high: 'var(--text-primary)' };

        // ---- Dashboard Header (Action buttons + Title) ----
        let html = `<div class="plagiarism-report fade-in">
            <div class="plag-dashboard-header">
                <div class="plag-dashboard-top">
                    <button class="btn btn-outline btn-sm" onclick="AssignmentApp.closePlagiarismReport()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        返回作業
                    </button>
                    <div class="plag-dashboard-actions">
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.showAlgorithmModal()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                            算法原理
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.exportPlagiarismExcel()" id="plagExportBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            匯出 Excel
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.startPlagiarismCheck()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                            重新檢測
                        </button>
                    </div>
                </div>
                <div class="plag-dashboard-title">
                    <div>
                        <h2>抄袭檢測報告</h2>
                        <p class="plag-dashboard-meta">
                            <span class="badge ${statusClass[report.status] || ''}">${statusMap[report.status] || report.status}</span>
                            ${report.subject ? `<span class="badge badge-graded">${report.subject}</span>` : ''}
                            ${report.detect_mode ? `<span class="badge badge-submitted">${({code:'代碼',text:'文字',mixed:'混合',chinese_essay:'中文作文',english_essay:'English Essay'})[report.detect_mode] || report.detect_mode}</span>` : ''}
                            檢測時間 ${report.created_at || '-'} · 閾值 ${report.threshold}%${report.completed_at ? ` · 完成 ${report.completed_at}` : ''}
                        </p>
                    </div>
                </div>
            </div>`;

        // ---- Dashboard Summary (Risk + Metrics) ----
        html += `<div class="plag-dashboard-summary">
            <div class="plag-risk-card">
                <div class="plag-risk-indicator ${riskLevel}">
                    <svg width="32" height="32" viewBox="0 0 40 40">
                        <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(0,0,0,0.06)" stroke-width="3"/>
                        <circle cx="20" cy="20" r="17" fill="none" stroke="${riskColor[riskLevel]}" stroke-width="3"
                            stroke-dasharray="${2 * Math.PI * 17}" stroke-dashoffset="${2 * Math.PI * 17 * (1 - (riskLevel === 'low' ? 0.15 : riskLevel === 'medium' ? 0.5 : 0.9))}"
                            stroke-linecap="round" transform="rotate(-90 20 20)"/>
                    </svg>
                    <span class="plag-risk-label" style="color:${riskColor[riskLevel]}">${riskLabel[riskLevel]}</span>
                </div>
                <div class="plag-risk-detail">
                    ${report.flagged_pairs === 0
                        ? '<span>未發現可疑抄襲行為</span>'
                        : `<span>發現 <b>${report.flagged_pairs}</b> 對可疑配對${clusters.length > 0 ? `，形成 <b>${clusters.length}</b> 個群組` : ''}</span>`
                    }
                </div>
            </div>
            <div class="plag-metrics">
                <div class="plag-metric">
                    <div class="plag-metric-value">${totalStudents.size}</div>
                    <div class="plag-metric-label">參與學生</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value">${report.total_pairs}</div>
                    <div class="plag-metric-label">對比總數</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${report.flagged_pairs > 0 ? ' has-issue' : ''}">${report.flagged_pairs}</div>
                    <div class="plag-metric-label">可疑配對</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${clusters.length > 0 ? ' has-issue' : ''}">${clusters.length}</div>
                    <div class="plag-metric-label">抄襲群組</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${hubStudents.length > 0 ? ' has-issue' : ''}">${hubStudents.length}</div>
                    <div class="plag-metric-label">疑似源頭</div>
                </div>
            </div>
        </div>`;

        // ---- Hub Students ----
        if (hubStudents.length > 0) {
            html += `<div class="plag-hub-section">
                <div class="plag-section-title">疑似抄襲源頭 <span class="count">${hubStudents.length}</span></div>
                <p class="plag-hub-desc">以下學生與 3 人以上高度相似，可能是抄襲的源頭</p>
                <div class="hub-student-list">
                    ${hubStudents.map(h => `<div class="hub-student-card">
                        <div class="hub-avatar">${(h.name || '?')[0].toUpperCase()}</div>
                        <div class="hub-info">
                            <strong>${h.name}</strong>
                            <span class="hub-meta">與 ${h.degree} 人相似 · 平均 ${h.avg_score}%</span>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        }

        // ---- Cluster Tree Graph ----
        if (clusters.length > 0) {
            html += `<div class="plag-graph-section">
                <div class="plag-section-title">抄襲傳播樹 <span class="count">${clusters.length} 個群組</span></div>
                ${this._renderPlagiarismTree(clusters)}
            </div>`;
        }

        // ---- Filter + Pair List ----
        html += `<div class="plag-action-bar">
            <div class="plag-action-bar-left">
                <h3>配對明細</h3>
            </div>
            <div class="filter-tabs" style="margin:0;">
                <button class="filter-tab active" onclick="AssignmentApp._filterPlagPairs('flagged', this)">可疑 <span class="count">${flaggedPairs.length}</span></button>
                <button class="filter-tab" onclick="AssignmentApp._filterPlagPairs('all', this)">全部 <span class="count">${(pairs || []).length}</span></button>
            </div>
        </div>`;

        // ---- Pair List ----
        if (!pairs || !pairs.length) {
            html += '<div class="empty-state"><div class="empty-state-text">無對比數據</div></div>';
        } else {
            html += `<div id="plagPairsArea">${this.renderPlagiarismPairs(flaggedPairs.length ? flaggedPairs : pairs)}</div>`;
        }

        html += '</div>';
        return html;
    },

    // ---- Tree View: 統一的 SVG 傳播樹 ----
    _renderPlagiarismTree(clusters) {
        if (!clusters || !clusters.length) return '';
        return clusters.map(cluster => this._renderTreeCard(cluster)).join('');
    },

    _renderTreeCard(cluster) {
        const members = cluster.members || [];
        const edges = cluster.edges || [];
        const source = members.find(m => m.role === 'source');
        if (!source) return '';
        const N = members.length;

        // 構建有向鄰接表（from → to）; 如果後端有 from_id/to_id 就用，否則退回無向 BFS
        const childMap = {};   // parentId → [{childId, score}]
        const hasDirection = edges.length > 0 && edges[0].from_id !== undefined;

        if (hasDirection) {
            edges.forEach(e => {
                const pid = e.from_id, cid = e.to_id;
                if (!childMap[pid]) childMap[pid] = [];
                childMap[pid].push({ id: cid, score: e.score });
            });
        } else {
            // 退回無向 BFS（兼容舊數據）
            const adj = {};
            edges.forEach(e => {
                if (!adj[e.a_id]) adj[e.a_id] = [];
                if (!adj[e.b_id]) adj[e.b_id] = [];
                adj[e.a_id].push({ id: e.b_id, score: e.score });
                adj[e.b_id].push({ id: e.a_id, score: e.score });
            });
            // BFS 建 childMap
            const visited = new Set([source.sub_id]);
            let frontier = [source.sub_id];
            while (frontier.length) {
                const next = [];
                for (const pid of frontier) {
                    for (const nb of (adj[pid] || [])) {
                        if (!visited.has(nb.id)) {
                            visited.add(nb.id);
                            if (!childMap[pid]) childMap[pid] = [];
                            childMap[pid].push(nb);
                            next.push(nb.id);
                        }
                    }
                }
                frontier = next;
            }
        }

        // BFS 從源頭展開，收集帶深度的節點列表
        const memberById = {};
        members.forEach(m => { memberById[m.sub_id] = m; });

        const treeNodes = [];
        const visited = new Set([source.sub_id]);
        let frontier = [{ id: source.sub_id, depth: 0, parentName: null, parentId: null, score: 0 }];

        while (frontier.length) {
            const next = [];
            for (const cur of frontier) {
                const m = memberById[cur.id] || { name: String(cur.id), sub_id: cur.id };
                treeNodes.push({
                    id: cur.id,
                    name: m.name || String(cur.id),
                    depth: cur.depth,
                    parentName: cur.parentName,
                    parentId: cur.parentId,
                    score: cur.score,
                    isSource: cur.depth === 0,
                    degree: m.degree || 0,
                    text_len: m.text_len || 0,
                    submitted_at: m.submitted_at || null,
                });
                const children = (childMap[cur.id] || []).sort((a, b) => (b.score || 0) - (a.score || 0));
                for (const ch of children) {
                    if (!visited.has(ch.id)) {
                        visited.add(ch.id);
                        next.push({
                            id: ch.id,
                            depth: cur.depth + 1,
                            parentName: m.name || '',
                            parentId: cur.id,
                            score: ch.score,
                        });
                    }
                }
            }
            frontier = next;
        }

        // 加入未被樹覆蓋的節點（孤立但在 cluster 中）
        members.forEach(m => {
            if (!visited.has(m.sub_id)) {
                treeNodes.push({
                    id: m.sub_id, name: m.name, depth: 1,
                    parentName: source.name, parentId: source.sub_id,
                    score: 0, isSource: false, degree: m.degree || 0,
                    text_len: m.text_len || 0, submitted_at: m.submitted_at || null,
                });
            }
        });

        // === SVG 樹狀圖 ===
        const levels = [];
        treeNodes.forEach(n => {
            while (levels.length <= n.depth) levels.push([]);
            levels[n.depth].push(n);
        });

        const nodeW = N > 12 ? 80 : N > 6 ? 100 : 120;
        const levelH = N > 12 ? 90 : 100;
        const maxPerLevel = Math.max(...levels.map(l => l.length), 1);
        const W = Math.max(380, maxPerLevel * nodeW + 60);
        const H = levels.length * levelH + 50;
        const nodeR = N > 12 ? 14 : N > 6 ? 16 : 18;
        const sourceR = nodeR + 4;
        const fontSize = N > 12 ? 9 : N > 6 ? 10 : 11;

        const nodePos = {};  // id → {x, y}

        // 先計算每個節點位置
        levels.forEach((level, li) => {
            const y = 30 + li * levelH;
            const spacing = W / (level.length + 1);
            level.forEach((node, ni) => {
                nodePos[node.id] = { x: spacing * (ni + 1), y };
            });
        });

        // 畫箭頭和連線
        let svgContent = '';
        // 定義箭頭 marker
        svgContent += `<defs>
            <marker id="arrowhead-${cluster.id}" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" fill="var(--text-tertiary)">
                <polygon points="0 0, 8 3, 0 6"/>
            </marker>
        </defs>`;

        // 畫邊: 帶箭頭
        treeNodes.forEach(node => {
            if (node.isSource || !node.parentId) return;
            const parent = nodePos[node.parentId];
            const child = nodePos[node.id];
            if (!parent || !child) return;

            const pct = node.score || 0;
            const sw = Math.max(1.5, (pct / 100) * 3.5);
            const opacity = 0.25 + (pct / 100) * 0.55;

            // 計算線段起止（避免穿過圓圈）
            const dx = child.x - parent.x, dy = child.y - parent.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const parentR = (memberById[node.parentId]?.role === 'source') ? sourceR : nodeR;
            const x1 = parent.x + (dx / dist) * parentR;
            const y1 = parent.y + (dy / dist) * parentR;
            const x2 = child.x - (dx / dist) * (nodeR + 6);
            const y2 = child.y - (dy / dist) * (nodeR + 6);

            svgContent += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"
                stroke="var(--text-tertiary)" stroke-width="${sw}" opacity="${opacity}"
                marker-end="url(#arrowhead-${cluster.id})"/>`;

            // 分數標籤
            if (pct > 0) {
                const mx = (parent.x + child.x) / 2;
                const my = (parent.y + child.y) / 2;
                const offsetX = dx === 0 ? 12 : (dx > 0 ? 10 : -10);
                svgContent += `<text x="${mx + offsetX}" y="${my - 2}" text-anchor="middle"
                    font-size="${fontSize - 1}" font-weight="600" fill="var(--text-tertiary)">${Math.round(pct)}%</text>`;
            }
        });

        // 畫節點
        treeNodes.forEach(node => {
            const pos = nodePos[node.id];
            if (!pos) return;
            const isSource = node.isSource;
            const r = isSource ? sourceR : nodeR;
            const fill = isSource ? 'var(--text-primary)' : 'var(--bg-card)';
            const stroke = isSource ? 'var(--text-primary)' : 'var(--border-default)';
            const textFill = isSource ? 'var(--bg-card)' : 'var(--text-primary)';

            svgContent += `<circle cx="${pos.x}" cy="${pos.y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
            // 圓內首字
            svgContent += `<text x="${pos.x}" y="${pos.y + 1}" text-anchor="middle" dominant-baseline="central"
                font-size="${isSource ? fontSize + 2 : fontSize}" font-weight="${isSource ? 700 : 500}" fill="${textFill}">${(node.name || '?')[0]}</text>`;

            // 名字（圓下方）
            svgContent += `<text x="${pos.x}" y="${pos.y + r + 13}" text-anchor="middle"
                font-size="${fontSize}" font-weight="${isSource ? 600 : 400}" fill="var(--text-primary)">${node.name || '?'}</text>`;

            // 源頭標記
            if (isSource) {
                svgContent += `<text x="${pos.x}" y="${pos.y + r + 24}" text-anchor="middle"
                    font-size="${fontSize - 2}" fill="var(--text-tertiary)">疑似源頭</text>`;
            }

            // 提交時間提示（非源頭，有時間的）
            if (!isSource && node.submitted_at) {
                const t = new Date(node.submitted_at);
                const timeStr = `${String(t.getMonth()+1).padStart(2,'0')}/${String(t.getDate()).padStart(2,'0')} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')}`;
                svgContent += `<text x="${pos.x}" y="${pos.y + r + 24}" text-anchor="middle"
                    font-size="${fontSize - 2}" fill="var(--text-tertiary)">${timeStr}</text>`;
            }
        });

        // 源頭信息摘要
        const sourceTime = source.submitted_at ? (() => {
            const t = new Date(source.submitted_at);
            return `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')} 提交`;
        })() : '';
        const sourceLen = source.text_len ? `${source.text_len} 字元` : '';
        const sourceDetail = [sourceTime, sourceLen].filter(Boolean).join(' · ');

        return `<div class="plag-tree-card">
            <div class="plag-network-header">
                <span class="cluster-title">群組 ${cluster.id} <span class="count">${N} 人</span></span>
                <span class="cluster-score">最高 <b>${cluster.max_score}%</b></span>
            </div>
            <svg class="plag-tree-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
                ${svgContent}
            </svg>
            <div class="cluster-source" style="margin-top:var(--space-2);">
                <span class="cluster-source-badge">疑似源頭</span>
                <strong>${source.name}</strong>
                <span style="color:var(--text-tertiary);font-size:var(--type-badge);">與 ${source.degree} 人匹配, 平均 ${source.avg_score}%${sourceDetail ? ' · ' + sourceDetail : ''}</span>
            </div>
        </div>`;
    },

    renderPlagiarismPairs(pairs) {
        if (!pairs || !pairs.length) return '<div class="empty-state"><div class="empty-state-text">無配對數據</div></div>';

        const mkScoreRing = (pct) => {
            const r = 16, c = 2 * Math.PI * r;
            const offset = c - (pct / 100) * c;
            // monochrome: darker for higher scores
            const strokeColor = pct >= 80 ? 'var(--text-primary)' : pct >= 60 ? 'var(--text-secondary)' : 'var(--text-tertiary)';
            return `<div class="pair-score-ring">
                <svg viewBox="0 0 40 40"><circle class="ring-bg" cx="20" cy="20" r="${r}"/><circle class="ring-fill" cx="20" cy="20" r="${r}" stroke="${strokeColor}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"/></svg>
                <span class="pair-score-pct">${Math.round(pct)}</span>
            </div>`;
        };

        const listDetectMode = (AssignmentApp._currentPlagReport || {}).detect_mode || '';
        const isEngList = listDetectMode === 'english_essay';

        return `<div class="plagiarism-pairs-list">${pairs.map(p => {
            const pct = parseFloat(p.similarity_score) || 0;
            const dims = this._extractDimensions(p.matched_fragments);
            const td = dims ? (dims.totalDims || 9) : 9;
            let dimHtml = '';
            if (dims && isEngList) {
                // English essay compact dimension tags
                const risk = dims.riskType || {};
                const riskLabels = { direct_copy: 'Copy', paraphrase: 'Paraphrase', imitation: 'Imitation' };
                const primaryRisk = risk.primary_risk || '';
                const fs = p.final_status || '';
                const fsLabels = { high_risk: '高風險', review_needed: '需複核', low_risk: '低風險' };
                dimHtml = `<div class="pair-dimensions">
                    <span class="dim-tag">Lexical ${Math.round(dims.verbatim)}%</span>
                    <span class="dim-tag">Align ${Math.round(dims.comment)}%</span>
                    <span class="dim-tag">Semantic ${Math.round(dims.identifier)}%</span>
                    ${dims.openingSim >= 50 ? `<span class="dim-tag">Opening ${Math.round(dims.openingSim)}%</span>` : ''}
                    ${dims.rarePhraseScore >= 30 ? `<span class="dim-tag evidence-hit">Rare ${Math.round(dims.rarePhraseScore)}%</span>` : ''}
                    ${primaryRisk && primaryRisk !== 'normal' ? `<span class="dim-tag">${riskLabels[primaryRisk] || primaryRisk}</span>` : ''}
                    ${fs ? `<span class="dim-tag${fs === 'high_risk' ? ' evidence-hit' : ''}" style="${fs === 'review_needed' ? 'color:var(--warning-color,#d69e2e)' : ''}">${fsLabels[fs] || fs}</span>` : ''}
                </div>`;
            } else if (dims) {
                dimHtml = `<div class="pair-dimensions">
                    ${dims.logicScore ? `<span class="dim-tag">邏輯 ${Math.round(dims.logicScore)}%</span>` : ''}
                    ${dims.styleScore ? `<span class="dim-tag">風格 ${Math.round(dims.styleScore)}%</span>` : ''}
                    ${dims.winnow ? `<span class="dim-tag">指紋 ${Math.round(dims.winnow)}%</span>` : ''}
                    ${dims.dataFlow ? `<span class="dim-tag">數據流 ${Math.round(dims.dataFlow)}%</span>` : ''}
                    <span class="dim-tag">命名 ${Math.round(dims.identifier)}%</span>
                    <span class="dim-tag">逐字 ${Math.round(dims.verbatim)}%</span>
                    ${dims.typo > 0 ? `<span class="dim-tag evidence-hit">拼錯 ${Math.round(dims.typo)}%</span>` : ''}
                    ${dims.deadCode > 0 ? `<span class="dim-tag evidence-hit">死代碼 ${Math.round(dims.deadCode)}%</span>` : ''}
                    ${dims.aiSuspicion >= 20 ? `<span class="dim-tag" style="color:var(--text-tertiary)">AI嫌疑 ${Math.round(dims.aiSuspicion)}%</span>` : ''}
                    ${dims.evidenceHits >= 2 ? `<span class="dim-tag evidence-hit">證據 ${dims.evidenceHits}/${td}</span>` : ''}
                </div>`;
            }
            return `<div class="plagiarism-pair-card${p.is_flagged ? ' flagged' : ''}" onclick="AssignmentApp.viewPlagiarismPair(${p.id})">
                <div class="pair-card-left">
                    <div class="pair-students">
                        <span>${p.student_a_name || '學生A'}</span>
                        <span class="pair-vs">vs</span>
                        <span>${p.student_b_name || '學生B'}</span>
                    </div>
                    ${dimHtml}
                    ${p.ai_analysis ? `<div class="pair-ai-hint">${p.ai_analysis.substring(0, 100)}${p.ai_analysis.length > 100 ? '...' : ''}</div>` : ''}
                </div>
                <div class="pair-card-right">
                    ${mkScoreRing(pct)}
                    <span class="pair-arrow">›</span>
                </div>
            </div>`;
        }).join('')}</div>`;
    },

    /**
     * 判定風險等級（前端推斷）
     * @returns {{ level: string, color: string, label: string, type: string, summary: string }}
     */
    _determineRiskLevel(pct, dims, aiAnalysis) {
        const ai = (aiAnalysis || '').toLowerCase();
        const aiHigh = /直接抄[襲袭]|直接複製|直接复制|大面積抄|highly suspicious|direct copy/.test(ai);
        const hits = dims ? (dims.softEvidenceHits || dims.evidenceHits || 0) : 0;

        // 風險等級（克制色系：暗磚紅/暖橙/灰綠）
        let level = 'low', color = '#4a7c59', label = '低風險';
        if (pct >= 60 || (aiHigh && pct >= 40) || hits >= 4) {
            level = 'high'; color = '#9b2c2c'; label = '高風險';
        } else if (pct >= 40 || hits >= 2 || aiAnalysis) {
            level = 'review'; color = '#b7791f'; label = '需複核';
        }

        // 主要類型
        let type = '正常';
        if (dims) {
            if (dims.verbatim > 60) type = '直接複製';
            else if (dims.comment > 60 && dims.verbatim < 40 && dims.identifier > 50) type = '改寫抄襲';
            else if (dims.structure > 60 && dims.verbatim < 30) type = '結構仿寫';
            else if ((dims.cohortSuppressedCount || 0) > 5) type = '模板化相似';
            else if (pct >= 40) type = '疑似抄襲';
        }

        // 一句話摘要：取最重要的 2-3 條 signals
        let summary = '';
        if (dims && dims.signals && dims.signals.length) {
            summary = dims.signals.slice(0, 3).join('；');
        }

        return { level, color, label, type, summary };
    },

    renderPlagiarismPairDetail(pair) {
        const pct = parseFloat(pair.similarity_score) || 0;
        const dims = this._extractDimensions(pair.matched_fragments);
        const detectMode = (AssignmentApp._currentPlagReport || {}).detect_mode || '';
        const risk = this._determineRiskLevel(pct, dims, pair.ai_analysis);

        let html = `<div class="plagiarism-detail fade-in">`;

        // ====== 第 1 塊：結論頭部 ======
        html += `<div class="verdict-header verdict-${risk.level}">
            <div class="verdict-top-row">
                <h3 class="verdict-title">
                    ${this._escapeHtml(pair.student_a_name || '學生A')}
                    <span class="verdict-vs">vs</span>
                    ${this._escapeHtml(pair.student_b_name || '學生B')}
                </h3>
                <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closePlagiarismPairDetail()">← 返回報告</button>
            </div>
            <div class="verdict-body">
                <div class="verdict-badge-row">
                    <span class="verdict-badge" style="background:${risk.color};">${risk.label}</span>
                    ${risk.type !== '正常' ? `<span class="verdict-type">${risk.type}</span>` : ''}
                    <span class="verdict-score">算法總分 ${pct.toFixed(1)}%</span>
                </div>
                ${risk.summary ? `<p class="verdict-summary">${this._escapeHtml(risk.summary)}</p>` : ''}
                ${dims && dims.cohortSize > 0 ? `<p class="verdict-cohort">已在 ${dims.cohortSize} 份同批次作品中降權模板句${dims.cohortSuppressedCount > 0 ? `（${dims.cohortSuppressedCount} 個短語被降權）` : ''}</p>` : ''}
            </div>
        </div>`;

        // ====== 第 2 塊：關鍵證據摘要 ======
        const blocks = (dims && dims.evidenceBlocks) ? dims.evidenceBlocks.filter(b => b && b.rank) : [];
        if (blocks.length) {
            const topBlocks = blocks.slice(0, 3);
            const strengthDot = s => `<span class="status-dot dot-${s}"></span>`;
            html += `<div class="evidence-summary">
                <h4 class="evidence-summary-title">關鍵證據</h4>
                ${topBlocks.map((b, i) => `<div class="evidence-card evidence-${b.strength}">
                    <div class="evidence-card-header">
                        <span class="evidence-rank">${strengthDot(b.strength)} ${i + 1}.</span>
                        <span class="evidence-desc">${this._escapeHtml(b.description || '')}</span>
                    </div>
                    ${b.snippet_a ? `<div class="evidence-snippets">
                        <div class="evidence-snippet"><span class="snippet-label">A:</span> ${this._escapeHtml(b.snippet_a)}</div>
                        <div class="evidence-snippet"><span class="snippet-label">B:</span> ${this._escapeHtml(b.snippet_b || '')}</div>
                    </div>` : ''}
                    <button class="btn-evidence-jump" onclick="AssignmentApp._scrollToEvidence(${i})">查看原文對照 ↓</button>
                </div>`).join('')}
            </div>`;
        }

        // ====== 第 3 塊：AI 分析（可折疊）======
        if (pair.ai_analysis) {
            const fullHtml = this._renderMd(pair.ai_analysis);
            // 取第一段作為摘要
            const firstPara = (pair.ai_analysis || '').split('\n').filter(l => l.trim()).slice(0, 2).join('\n');
            const previewHtml = this._renderMd(firstPara);
            html += `<div class="ai-analysis-card">
                <h4 class="ai-card-title" onclick="this.parentElement.classList.toggle('ai-expanded')">
                    系統判讀
                    <span class="ai-toggle-icon">▼</span>
                </h4>
                <div class="ai-preview">${previewHtml}</div>
                <div class="ai-full-content">${fullHtml}</div>
            </div>`;
        }

        // ====== 第 4 塊：維度面板（教師友好標籤 + tooltip）======
        if (dims) {
            const mkBarT = (label, val, tooltip) => {
                const v = parseFloat(val) || 0;
                const barColor = v > 70 ? '#9b2c2c' : v > 40 ? '#b7791f' : '#718096';
                return `<div class="dim-teacher-row" ${tooltip ? `title="${tooltip}"` : ''}>
                    <span class="dim-teacher-label">${label}${tooltip ? ' <span class="dim-info-icon">ⓘ</span>' : ''}</span>
                    <div class="dim-detail-bar-track">
                        <div class="dim-detail-bar-fill" style="width:${v}%;background:${barColor};"></div>
                    </div>
                    <span class="dim-detail-val">${v.toFixed(0)}%</span>
                </div>`;
            };

            html += `<div class="dimension-panel">`;

            if (detectMode === 'chinese_essay') {
                // ---- 中文作文：教師友好 ----
                html += `<h4 class="dim-group-title">主要證據</h4>
                    ${mkBarT('直接文字重合', dims.verbatim, 'verbatim_score: 逐字重疊率 + 低頻短語加權覆蓋')}
                    ${mkBarT('句子順序相似', dims.comment, 'comment_score: 匈牙利匹配 × 0.75 + 句子鏈連續度 × 0.25')}
                    ${mkBarT('語義內容接近', dims.identifier, 'identifier_score: text2vec 語義嵌入余弦相似度')}
                    ${mkBarT('寫作風格接近', dims.indent, 'indent_score: 54 維風格指紋（標點/高頻字/關聯詞/情感動詞/成語/句式）')}
                    <h4 class="dim-group-title">輔助信號</h4>
                    ${mkBarT('篇章結構相似', dims.structure, 'structure_score: 功能段落結構 × 0.7 + 段落長度比 × 0.3')}
                    ${mkBarT('開頭/結尾相似', Math.max(dims.openingSim || 0, dims.endingSim || 0), 'boundary: max(opening_sim, ending_sim)')}
                    ${mkBarT('多維證據一致', dims.softEvidenceScore || dims.evidence, `soft_evidence: sigmoid 平滑加權，${dims.softEvidenceHits || dims.evidenceHits || 0}/${dims.softEvidenceDims || dims.totalDims} 維命中`)}`;

                // Cohort 抑制提示
                if (dims.cohortSuppressedCount > 0) {
                    html += `<div class="dim-cohort-note">${dims.cohortSuppressedCount} 個常見短語被降權（平均權重 ${(dims.cohortAvgWeight || 1).toFixed(2)}）</div>`;
                }

                // 罕見短語列表
                if (dims.rarePhrases && dims.rarePhrases.length) {
                    html += `<div class="dim-rare-phrases">共享罕見短語: ${dims.rarePhrases.slice(0, 5).map(p => `<span class="rare-phrase-tag">${this._escapeHtml(p)}</span>`).join(' ')}</div>`;
                }

            } else if (detectMode === 'english_essay') {
                // ---- 英文作文：保留原有結構但用教師標籤 ----
                const risk2 = dims.riskType || {};
                const primaryRisk = risk2.primary_risk || 'normal';
                const riskLabels = { direct_copy: 'Direct Copy', paraphrase: 'Paraphrase', imitation: 'Imitation', normal: 'Normal' };
                const finalStatus = pair.final_status || '';
                if (finalStatus) {
                    const statusLabels = { high_risk: '高風險', review_needed: '需人工複核', low_risk: '低風險' };
                    const statusColors = { high_risk: '#9b2c2c', review_needed: '#b7791f', low_risk: '#4a7c59' };
                    html += `<div style="margin-bottom:var(--space-3)">
                        <span class="verdict-badge" style="background:${statusColors[finalStatus] || '#888'};">${statusLabels[finalStatus] || finalStatus}</span>
                        ${primaryRisk !== 'normal' ? `<span class="verdict-type">${riskLabels[primaryRisk]}</span>` : ''}
                    </div>`;
                }
                html += `<h4 class="dim-group-title">主要證據</h4>
                    ${mkBarT('逐字重疊', dims.verbatim, 'Lexical Overlap: 詞級重合率')}
                    ${mkBarT('句子對齊', dims.comment, 'Sentence Alignment: 匈牙利匹配')}
                    ${mkBarT('語義改寫', dims.identifier, 'Semantic Paraphrase: 嵌入向量相似度')}
                    ${mkBarT('論述結構', dims.structure, 'Discourse Structure: 段落功能序列比較')}
                    ${mkBarT('文體特徵', dims.indent, 'Stylometry: 風格計量特徵向量')}
                    <h4 class="dim-group-title">輔助信號</h4>
                    ${mkBarT('開頭相似', dims.openingSim, 'Opening: 前 120 字 SequenceMatcher')}
                    ${mkBarT('結尾相似', dims.endingSim, 'Ending: 後 120 字 SequenceMatcher')}
                    ${dims.rarePhraseScore > 0 ? mkBarT('罕見短語', dims.rarePhraseScore, 'Rare Phrase: 低頻 n-gram 加權覆蓋') : ''}
                    ${mkBarT('多維證據', dims.evidence, `Evidence: ${dims.evidenceHits}/${dims.totalDims} 維命中`)}`;
                if (risk2 && primaryRisk !== 'normal') {
                    html += `<h4 class="dim-group-title">風險評估</h4>
                        ${mkBarT('Direct Copy', risk2.risk_direct_copy || 0, '')}
                        ${mkBarT('Paraphrase', risk2.risk_paraphrase || 0, '')}
                        ${mkBarT('Imitation', risk2.risk_imitation || 0, '')}`;
                }
            } else {
                // ---- 代碼/文本模式：保留原結構但用教師標籤 ----
                const logicPct = Math.round(dims.logicScore || 0);
                const stylePct = Math.round(dims.styleScore || 0);
                html += `<div class="plag-dual-scores">
                    <div class="plag-dual-card"><div class="plag-dual-label">邏輯相似度</div><div class="plag-dual-value">${logicPct}%</div></div>
                    <div class="plag-dual-card"><div class="plag-dual-label">風格一致性</div><div class="plag-dual-value">${stylePct}%</div></div>
                </div>
                ${logicPct > 70 && stylePct < 40 ? '<div class="dim-code-badge">邏輯高但風格不同 → 簡單作業巧合的可能性較高</div>' : ''}
                ${logicPct > 70 && stylePct > 60 ? '<div class="dim-code-badge" style="color:var(--text-primary);font-weight:600;">邏輯+風格同時高 → 高度可疑</div>' : ''}
                <h4 class="dim-group-title">邏輯維度</h4>
                ${dims.winnow ? mkBarT('程序指紋', dims.winnow, 'Winnowing: MOSS 風格指紋比對') : ''}
                ${mkBarT('代碼骨架', dims.structure, 'Token 結構相似度')}
                ${dims.dataFlow ? mkBarT('數據流', dims.dataFlow, '數據流圖相似度') : ''}
                ${mkBarT('逐字複製', dims.verbatim, '字符級重疊率')}
                <h4 class="dim-group-title">風格維度</h4>
                ${mkBarT('變量命名', dims.identifier, '標識符指紋相似度')}
                ${mkBarT('縮排風格', dims.indent, '縮排/空白模式指紋')}
                ${mkBarT('注釋/字串', dims.comment, '注釋文本與字串常量')}
                ${dims.typo > 0 ? mkBarT('共享拼錯', dims.typo, '共同拼寫錯誤（強物證）') : ''}
                ${dims.deadCode > 0 ? mkBarT('死代碼', dims.deadCode, '共同未使用代碼（強物證）') : ''}
                <h4 class="dim-group-title">綜合</h4>
                ${mkBarT('多維證據', dims.evidence, `${dims.evidenceHits || 0}/${dims.totalDims} 維命中`)}
                ${dims.aiSuspicion >= 20 ? mkBarT('AI 生成嫌疑', dims.aiSuspicion, '') : ''}`;
            }

            // 分析信號（所有模式共用）
            if (dims.signals && dims.signals.length) {
                html += `<div class="dim-signals">${dims.signals.map(s => `<span class="dim-signal-tag">${this._escapeHtml(s)}</span>`).join('')}</div>`;
            }
            if (dims.warnings && dims.warnings.length) {
                html += `<div class="dim-signals">${dims.warnings.map(w => `<span class="dim-signal-tag dim-warning-tag">${this._escapeHtml(w)}</span>`).join('')}</div>`;
            }

            html += `</div>`;  // end .dimension-panel
        }

        // ====== 第 5 塊：證據列表（可篩選）======
        if (blocks.length) {
            const strengthDot5 = s => `<span class="status-dot dot-${s}"></span>`;
            html += `<div class="evidence-list-section">
                <div class="evidence-list-header">
                    <h4>全部證據 <span class="count">${blocks.length}</span></h4>
                    <div class="evidence-filters">
                        <button class="btn-filter active" onclick="AssignmentApp._filterEvidence('all', this)">全部</button>
                        <button class="btn-filter" onclick="AssignmentApp._filterEvidence('strong', this)">只看強證據</button>
                    </div>
                </div>
                <div class="evidence-list" id="evidenceList">
                    ${blocks.map((b, i) => `<div class="evidence-list-card" data-strength="${b.strength || 'weak'}">
                        <div class="evidence-list-card-header">
                            <span>${strengthDot5(b.strength)} <strong>#${b.rank || (i+1)}</strong> ${this._escapeHtml(b.description || '')}</span>
                            <div class="evidence-list-actions">
                                <button class="btn-copy-evidence" onclick="AssignmentApp._copyEvidence(${i})" title="複製摘要">複製</button>
                                <button class="btn-evidence-jump" onclick="AssignmentApp._scrollToEvidence(${i})">定位 ↓</button>
                            </div>
                        </div>
                        ${b.snippet_a ? `<div class="evidence-snippets-full">
                            <div class="evidence-snippet"><span class="snippet-label">A:</span> ${this._escapeHtml(b.snippet_a)}</div>
                            <div class="evidence-snippet"><span class="snippet-label">B:</span> ${this._escapeHtml(b.snippet_b || '')}</div>
                        </div>` : ''}
                    </div>`).join('')}
                </div>
            </div>`;
        }

        // Matched Fragments（舊格式 fallback，中文作文通常走 evidence_blocks）
        const fragments = (pair.matched_fragments || []).filter(f => f.type !== 'dimension_breakdown');
        if (fragments.length && !blocks.length) {
            html += `<div class="plagiarism-fragments">
                <div class="plag-section-title">匹配片段 <span class="count">${fragments.length}</span></div>
                ${fragments.map((f, i) => `<div class="fragment-item">
                    <span class="fragment-label">片段 ${i + 1} · ${f.length || 0} 字元</span>
                    <pre class="fragment-text">${this._escapeHtml(f.text || '')}</pre>
                </div>`).join('')}
            </div>`;
        }

        // ====== 第 6 塊：全文同步對照區 ======
        const textA = pair.text_a || '（無內容）';
        const textB = pair.text_b || '（無內容）';
        const diff = this._diffTexts(textA, textB);

        html += `<div class="sync-compare-section">
            <h4 class="sync-compare-title">全文對照</h4>
            <div class="sync-compare" id="syncCompare">
                <div class="compare-col">
                    <div class="compare-header">${this._escapeHtml(pair.student_a_name || '學生A')}</div>
                    <pre class="compare-text" id="compareTextA">${diff.htmlA}</pre>
                </div>
                <div class="compare-col">
                    <div class="compare-header">${this._escapeHtml(pair.student_b_name || '學生B')}</div>
                    <pre class="compare-text" id="compareTextB">${diff.htmlB}</pre>
                </div>
            </div>
            <div class="compare-legend">
                <span class="legend-item"><span class="legend-swatch hl-identical"></span>完全相同</span>
                <span class="legend-item"><span class="legend-swatch hl-similar"></span>高度相似</span>
                <span class="legend-item"><span class="legend-swatch hl-unique"></span>僅此份有</span>
            </div>
        </div>`;

        html += '</div>';

        // 延遲綁定滾動同步
        setTimeout(() => {
            const colA = document.getElementById('compareTextA');
            const colB = document.getElementById('compareTextB');
            if (colA && colB) {
                let syncing = false;
                colA.addEventListener('scroll', () => {
                    if (syncing) return;
                    syncing = true;
                    colB.scrollTop = colA.scrollTop;
                    requestAnimationFrame(() => syncing = false);
                });
                colB.addEventListener('scroll', () => {
                    if (syncing) return;
                    syncing = true;
                    colA.scrollTop = colB.scrollTop;
                    requestAnimationFrame(() => syncing = false);
                });
            }
        }, 100);

        return html;
    },

    /**
     * 行級 diff 對比: 將兩段文本逐行對比，分為「完全相同」「高度相似」「僅此份有」三種 highlight。
     * 使用 LCS（最長公共子序列）做行匹配，再對相似行做字符級標記。
     */
    _diffTexts(textA, textB) {
        const linesA = textA.split('\n');
        const linesB = textB.split('\n');

        // 提交元數據模式：不參與相似度比對
        const metaRe = /^[（(]由.{1,20}代為提交[)）]$/;
        const isMeta = l => metaRe.test(l);

        // 正規化行（去除前後空白）用於比對
        const normA = linesA.map(l => l.trim());
        const normB = linesB.map(l => l.trim());

        // 構建 B 行 → 索引映射（快速查找）
        const bMap = {};
        normB.forEach((line, i) => {
            if (!bMap[line]) bMap[line] = [];
            bMap[line].push(i);
        });

        // 標記每行狀態: 'identical' | 'similar' | 'unique'
        const statusA = new Array(linesA.length).fill('unique');
        const statusB = new Array(linesB.length).fill('unique');
        const matchedB = new Set();

        // Pass 1: 完全相同行（正規化後），跳過元數據行
        const usedBIndices = new Set();
        for (let i = 0; i < normA.length; i++) {
            if (!normA[i] || isMeta(normA[i])) continue;  // 跳過空行和元數據
            const candidates = bMap[normA[i]] || [];
            for (const j of candidates) {
                if (!usedBIndices.has(j)) {
                    statusA[i] = 'identical';
                    statusB[j] = 'identical';
                    usedBIndices.add(j);
                    matchedB.add(j);
                    break;
                }
            }
        }

        // Pass 2: 相似行（編輯距離比 < 40% 行長），跳過元數據行
        for (let i = 0; i < normA.length; i++) {
            if (statusA[i] !== 'unique' || !normA[i] || isMeta(normA[i])) continue;
            let bestJ = -1, bestRatio = 0;
            for (let j = 0; j < normB.length; j++) {
                if (statusB[j] !== 'unique' || !normB[j] || isMeta(normB[j])) continue;
                const ratio = this._similarityRatio(normA[i], normB[j]);
                if (ratio > 0.6 && ratio > bestRatio) {
                    bestRatio = ratio;
                    bestJ = j;
                }
            }
            if (bestJ >= 0) {
                statusA[i] = 'similar';
                statusB[bestJ] = 'similar';
                matchedB.add(bestJ);
            }
        }

        // 空行不高亮
        for (let i = 0; i < normA.length; i++) {
            if (!normA[i].trim()) statusA[i] = '';
        }
        for (let j = 0; j < normB.length; j++) {
            if (!normB[j].trim()) statusB[j] = '';
        }

        // 元數據行標記為灰色小字
        for (let i = 0; i < normA.length; i++) {
            if (isMeta(normA[i])) statusA[i] = 'meta';
        }
        for (let j = 0; j < normB.length; j++) {
            if (isMeta(normB[j])) statusB[j] = 'meta';
        }

        // 生成帶 <span> 的 HTML
        const wrapLine = (line, status) => {
            const escaped = this._escapeHtml(line);
            if (!status) return escaped;
            if (status === 'meta') return `<span class="submission-meta">${escaped}</span>`;
            return `<span class="hl-${status}">${escaped}</span>`;
        };

        return {
            htmlA: linesA.map((l, i) => wrapLine(l, statusA[i])).join('\n'),
            htmlB: linesB.map((l, i) => wrapLine(l, statusB[i])).join('\n'),
        };
    },

    /** 兩個字串的相似度比率 (0~1)，基於最長公共子序列長度 */
    _similarityRatio(a, b) {
        if (a === b) return 1;
        if (!a || !b) return 0;
        const lenA = a.length, lenB = b.length;
        // 短字串快捷判斷
        if (Math.abs(lenA - lenB) > Math.max(lenA, lenB) * 0.5) return 0;
        // 簡化 LCS: 只保留兩行（節省記憶體）
        let prev = new Array(lenB + 1).fill(0);
        let curr = new Array(lenB + 1).fill(0);
        for (let i = 1; i <= lenA; i++) {
            for (let j = 1; j <= lenB; j++) {
                if (a[i - 1] === b[j - 1]) {
                    curr[j] = prev[j - 1] + 1;
                } else {
                    curr[j] = Math.max(prev[j], curr[j - 1]);
                }
            }
            [prev, curr] = [curr, prev];
            curr.fill(0);
        }
        const lcs = prev[lenB];
        return (2 * lcs) / (lenA + lenB);
    },

    _extractDimensions(fragments) {
        if (!fragments || !Array.isArray(fragments)) return null;
        const dim = fragments.find(f => f.type === 'dimension_breakdown');
        if (!dim) return null;
        return {
            structure: dim.structure_score || 0,
            identifier: dim.identifier_score || 0,
            verbatim: dim.verbatim_score || 0,
            indent: dim.indent_score || 0,
            comment: dim.comment_score || 0,
            evidence: dim.evidence_score || 0,
            evidenceHits: dim.evidence_hits || 0,
            totalDims: dim.total_dims || 9,
            logicScore: dim.logic_score || 0,
            styleScore: dim.style_score || 0,
            winnow: dim.winnow_score || 0,
            dataFlow: dim.data_flow_score || 0,
            typo: dim.typo_score || 0,
            deadCode: dim.dead_code_score || 0,
            aiSuspicion: dim.ai_suspicion || 0,
            isCode: dim.is_code || false,
            codeLength: dim.code_length || 0,
            signals: dim.signals || [],
            // English essay intermediates
            openingSim: dim._opening_sim || 0,
            endingSim: dim._ending_sim || 0,
            rarePhraseScore: dim._rare_phrase_score || 0,
            rarePhrases: dim._rare_phrases || [],
            riskType: dim._risk_type || null,
            warnings: dim._warnings || [],
            // Chinese essay evidence blocks + new fields
            evidenceBlocks: dim._evidence_blocks || [],
            funcStructureScore: dim._func_structure_score || 0,
            essayTypeA: dim._essay_type_a || '',
            essayTypeB: dim._essay_type_b || '',
            funcSeqA: dim._func_seq_a || [],
            funcSeqB: dim._func_seq_b || [],
            chainScore: dim._sentence_chain_score || 0,
            chainCount: dim._chain_count || 0,
            maxChainLen: dim._max_chain_len || 0,
            softEvidenceScore: dim._soft_evidence_score || 0,
            softEvidenceHits: dim._soft_evidence_hits || 0,
            softEvidenceDims: dim._soft_evidence_total_dims || 7,
            softEvidenceDetail: dim._soft_evidence_detail || {},
            rarePhraseScoreRaw: dim._rare_phrase_score_raw || 0,
            cohortSize: dim._cohort_size || 0,
            cohortSuppressedCount: dim._cohort_rare_phrase_suppressed_count || 0,
            cohortAvgWeight: dim._cohort_rare_phrase_avg_weight || 1.0,
        };
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /** 輕量 Markdown → HTML（不依賴外部庫） */
    _renderMd(text) {
        if (!text) return '';
        let html = this._escapeHtml(text);
        // 粗體 **text** 或 __text__
        html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/__(.+?)__/g, '<strong>$1</strong>');
        // 斜體 *text* 或 _text_（但不匹配已處理的 ** 裡的）
        html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
        // 行內代碼 `code`
        html = html.replace(/`([^`]+)`/g, '<code style="background:var(--bg-main);padding:1px 4px;border-radius:3px;font-size:0.9em;">$1</code>');
        // 標題 ## / ###
        html = html.replace(/^### (.+)$/gm, '<strong style="display:block;margin-top:0.5em;">$1</strong>');
        html = html.replace(/^## (.+)$/gm, '<strong style="display:block;font-size:1.05em;margin-top:0.6em;">$1</strong>');
        // 無序列表 - item / * item
        html = html.replace(/^[\-\*] (.+)$/gm, '<li>$1</li>');
        html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul style="margin:0.3em 0;padding-left:1.2em;">$&</ul>');
        // 有序列表 1. item
        html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        // 換行
        html = html.replace(/\n/g, '<br>');
        // 清理多餘 <br> (在 </li><br><li> 之間)
        html = html.replace(/<\/li><br>/g, '</li>');
        html = html.replace(/<br><li>/g, '<li>');
        html = html.replace(/<br><\/ul>/g, '</ul>');
        html = html.replace(/<br><ul/g, '<ul');
        return html;
    }
};

/* ============================================================
   App — 主控制器
   ============================================================ */
const AssignmentApp = {

    state: {
        role: 'student',
        view: 'list',  // list | grid
        phase: 'list', // list | detail | submissions | submission-detail | student-detail
        currentAssignment: null,
        currentSubmission: null,
        editingId: null,
        selectedFiles: [],
        targets: null,
        aiReasons: {},
        sidebarFilter: 'all',
        // Attachment state for create/edit modal
        pendingAttachments: [],    // new File objects to upload
        existingAttachments: [],   // already uploaded (from server)
        deletedAttachmentIds: [],  // IDs to delete on save
        // Assignment type: 'file' (normal) or 'exam' (questionnaire/exam)
        assignmentType: 'file',
        // Exam upload (OCR) state
        examBatchId: null,
        examFiles: [],
        recognizedQuestions: [],
        ocrPollingTimer: null,
        // AI 問答助教
        asgAiSubject: null,
        asgAiConversationId: null,
        asgAiWindowVisible: false,
        asgAiSending: false,
    },

    async init() {
        const auth = window.AuthModule;
        if (!auth || !auth.isAuthenticated()) {
            window.location.href = '/login';
            return;
        }
        // Try token refresh if expiring soon
        if (auth.isTokenExpiringSoon()) {
            await auth.silentRefresh();
        }
        const role = auth.getUserRole() || 'student';
        this.state.role = role;
        this.state.view = localStorage.getItem('asg_view') || 'list';

        // Restore sidebar collapsed state
        if (localStorage.getItem('asg_sidebar_collapsed') === '1') {
            const sidebar = document.getElementById('sidebar');
            if (sidebar) sidebar.classList.add('collapsed');
        }

        if (role === 'teacher' || role === 'admin') {
            this.showTeacherList();
        } else {
            this.showStudentList();
        }
    },

    // ---- Navigation ----
    setBreadcrumb(items) {
        const bc = document.getElementById('breadcrumb');
        bc.innerHTML = items.map((item, i) => {
            if (i < items.length - 1) {
                return `<a onclick="${item.action}">${item.label}</a> <span>/</span>`;
            }
            return `<span style="color:var(--text-primary);font-weight:500;">${item.label}</span>`;
        }).join('');
    },

    setHeaderActions(html) {
        document.getElementById('headerActions').innerHTML = html;
    },

    // ---- Teacher: Assignment List ----
    async showTeacherList() {
        this.state.phase = 'list';
        this.setBreadcrumb([{ label: '作業列表' }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="assignment-grid">${AssignmentUI.skeletonCards(4)}</div>`;

        const resp = await AssignmentAPI.listTeacherAssignments();
        if (!resp || !resp.success) { main.innerHTML = '<div class="empty-state"><div class="empty-state-text">載入失敗</div></div>'; return; }

        this._teacherAssignments = resp.data || [];
        this.renderSidebar();
        this._sidebarFilter('all');
    },

    // ---- Sidebar ----
    renderSidebar() {
        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';

        // Action button (teacher only)
        const actionEl = document.getElementById('sidebarAction');
        if (actionEl) {
            actionEl.innerHTML = isTeacher
                ? `<button class="btn btn-primary" style="width:100%;" onclick="AssignmentApp.openCreateModal()">+ 新增作業</button>`
                : '';
        }

        this._updateSidebarNav();
        this._updateSidebarStats();
    },

    _updateSidebarNav() {
        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';
        const navEl = document.getElementById('sidebarNav');
        if (!navEl) return;

        let items;
        if (isTeacher) {
            const data = this._teacherAssignments || [];
            const counts = { all: data.length, draft: 0, published: 0, closed: 0 };
            data.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });
            items = [
                { key: 'all', label: '全部', count: counts.all, action: "AssignmentApp._sidebarFilter('all')" },
                { key: 'draft', label: '草稿', count: counts.draft, action: "AssignmentApp._sidebarFilter('draft')" },
                { key: 'published', label: '已發布', count: counts.published, action: "AssignmentApp._sidebarFilter('published')" },
                { key: 'closed', label: '已關閉', count: counts.closed, action: "AssignmentApp._sidebarFilter('closed')" },
            ];
        } else {
            const data = this._studentAssignments || [];
            const counts = { all: data.length, not_submitted: 0, submitted: 0, graded: 0 };
            data.forEach(a => {
                const st = a.submission_status || 'not_submitted';
                if (counts[st] !== undefined) counts[st]++;
            });
            items = [
                { key: 'all', label: '全部', count: counts.all, action: "AssignmentApp._sidebarFilter('all')" },
                { key: 'not_submitted', label: '待提交', count: counts.not_submitted, action: "AssignmentApp._sidebarFilter('not_submitted')" },
                { key: 'submitted', label: '已提交', count: counts.submitted, action: "AssignmentApp._sidebarFilter('submitted')" },
                { key: 'graded', label: '已批改', count: counts.graded, action: "AssignmentApp._sidebarFilter('graded')" },
            ];
        }

        navEl.innerHTML = AssignmentUI.renderSidebarNav(items, this.state.sidebarFilter);
    },

    _updateSidebarStats() {
        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';
        const statsEl = document.getElementById('sidebarStats');
        if (!statsEl) return;

        let stats;
        if (isTeacher) {
            const data = this._teacherAssignments || [];
            const totalSubs = data.reduce((s, a) => s + (a.submission_count || 0), 0);
            const totalGraded = data.reduce((s, a) => s + (a.graded_count || 0), 0);
            stats = [
                { label: '作業總數', value: data.length },
                { label: '總提交', value: totalSubs },
                { label: '待批改', value: totalSubs - totalGraded },
            ];
        } else {
            const data = this._studentAssignments || [];
            const pending = data.filter(a => (a.submission_status || 'not_submitted') === 'not_submitted').length;
            const graded = data.filter(a => a.submission_status === 'graded').length;
            stats = [
                { label: '作業總數', value: data.length },
                { label: '待提交', value: pending },
                { label: '已批改', value: graded },
            ];
        }

        statsEl.innerHTML = AssignmentUI.renderSidebarStats(stats);
    },

    _sidebarFilter(key) {
        this.state.sidebarFilter = key;
        this.state.phase = 'list';
        this._updateSidebarNav();

        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';

        // Reset to list context
        this.setBreadcrumb([{ label: isTeacher ? '作業列表' : '我的作業' }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');

        if (isTeacher) {
            const items = this._teacherAssignments || [];
            const filtered = key === 'all' ? items : items.filter(a => a.status === key);

            const viewToggle = `<div class="view-toggle">
                <button onclick="AssignmentApp.setView('list')" class="${this.state.view === 'list' ? 'active' : ''}" title="列表模式">☰</button>
                <button onclick="AssignmentApp.setView('grid')" class="${this.state.view === 'grid' ? 'active' : ''}" title="網格模式">⊞</button>
            </div>`;

            const header = AssignmentUI.renderWorkspaceHeader(
                '作業列表',
                `${filtered.length} 項作業`,
                viewToggle
            );

            const content = this.state.view === 'grid'
                ? AssignmentUI.renderTeacherGridView(filtered)
                : AssignmentUI.renderTeacherListView(filtered);

            main.innerHTML = header + content;
        } else {
            const items = this._studentAssignments || [];
            const filtered = key === 'all' ? items
                : items.filter(a => (a.submission_status || 'not_submitted') === key);

            const header = AssignmentUI.renderWorkspaceHeader(
                '我的作業',
                `${filtered.length} 項作業`
            );

            main.innerHTML = header + AssignmentUI.renderStudentAssignments(filtered);
        }
    },

    toggleSidebar() {
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');
        const isMobile = window.innerWidth <= 768;
        if (isMobile) {
            const isOpen = sidebar.classList.contains('open');
            sidebar.classList.toggle('open', !isOpen);
            overlay.classList.toggle('active', !isOpen);
        } else {
            sidebar.classList.toggle('collapsed');
            localStorage.setItem('asg_sidebar_collapsed', sidebar.classList.contains('collapsed') ? '1' : '');
        }
    },

    setView(v) {
        this.state.view = v;
        localStorage.setItem('asg_view', v);
        this._sidebarFilter(this.state.sidebarFilter);
    },

    // ---- Teacher: View Assignment (Submissions) ----
    async viewAssignment(id) {
        this.state.phase = 'submissions';
        this.state.currentAssignment = id;

        const main = document.getElementById('mainContent');
        main.innerHTML = AssignmentUI.skeletonDetail();

        const [asgResp, subResp, targetResp] = await Promise.all([
            AssignmentAPI.getTeacherAssignment(id),
            AssignmentAPI.listSubmissions(id),
            AssignmentAPI.getTargets(),
        ]);

        if (!asgResp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }
        const asg = asgResp.data;
        const subs = subResp?.data || [];
        this._currentAsg = asg;

        // Filter students based on assignment target
        const allStudents = targetResp?.data?.students || [];
        let targetStudents = allStudents;
        if (asg.target_type === 'class' && asg.target_value) {
            const targetClasses = asg.target_value.split(',').map(c => c.trim());
            targetStudents = allStudents.filter(s => targetClasses.includes(s.class_name));
        } else if (asg.target_type === 'student' && asg.target_value) {
            const targetUsernames = asg.target_value.split(',').map(u => u.trim());
            targetStudents = allStudents.filter(s => targetUsernames.includes(s.username));
        }
        this._targetStudents = targetStudents;

        // Identify students who haven't submitted
        const submittedUsernames = new Set(subs.map(s => s.username));
        const notSubmitted = targetStudents.filter(s => !submittedUsernames.has(s.username));
        this._notSubmittedStudents = notSubmitted;

        this.setBreadcrumb([
            { label: '作業列表', action: 'AssignmentApp.showTeacherList()' },
            { label: asg.title }
        ]);
        this.setHeaderActions(`
            ${asg.status === 'draft' ? `<button class="btn btn-success" onclick="AssignmentApp.publishAssignment(${id})">發布</button>` : ''}
            ${asg.status === 'published' ? `<button class="btn btn-warning" onclick="AssignmentApp.closeAssignment(${id})">關閉提交</button>` : ''}
            ${asg.status !== 'closed' ? `<button class="btn btn-outline" onclick="AssignmentApp.editAssignment(${id})">編輯</button>` : ''}
            <button class="btn btn-outline btn-danger" onclick="AssignmentApp.deleteAssignment(${id})">刪除作業</button>
        `);

        // Assignment detail + submissions
        const target = asg.target_type === 'all' ? '所有人' :
            asg.target_type === 'class' ? `班級: ${asg.target_value}` : `學生: ${asg.target_value}`;
        const typeLabel = (AssignmentApp.RUBRIC_TYPES.find(t => t.id === (asg.rubric_type || 'points')) || {}).name || '簡單計分';
        const gradedCount = asg.graded_count || 0;
        const subCount = asg.submission_count || 0;

        // Stat cards
        const stats = [
            { icon: AssignmentUI.ICON.clock, label: '截止日', value: AssignmentUI.formatDate(asg.deadline) },
            { icon: AssignmentUI.ICON.folder, label: '已提交', value: `${subCount} 份` },
            { icon: AssignmentUI.ICON.check, label: '已批改', value: `${gradedCount} / ${subCount}` },
        ];
        if (asg.avg_score) stats.push({ icon: AssignmentUI.ICON.chart, label: '平均分', value: Number(asg.avg_score).toFixed(1) });

        // Rubric pills
        const rubricPills = (asg.rubric_items || []).map(r =>
            `<span class="badge" style="margin:2px;background:rgba(0,0,0,0.04);color:var(--text-secondary);">${r.title}${r.max_points ? ' ('+r.max_points+'分)' : r.weight ? ' ('+r.weight+'%)' : ''}</span>`
        ).join('');

        // Submission filter tabs
        const ungradedCount = subs.filter(s => s.status === 'submitted').length;
        const gradedSubCount = subs.filter(s => s.status === 'graded').length;
        this._currentSubs = subs;

        main.innerHTML = `
            <div class="detail-hero fade-in">
                <div class="detail-hero-header">
                    <div>
                        <h3 style="margin:0;display:flex;align-items:center;gap:8px;">${asg.title} ${AssignmentUI.badge(asg.status)}</h3>
                        ${asg.description ? `<p style="color:var(--text-secondary);margin-top:6px;font-size:14px;">${asg.description}</p>` : ''}
                        <div style="margin-top:8px;font-size:13px;color:var(--text-tertiary);">${AssignmentUI.ICON.user} ${target}</div>
                        ${(asg.attachments && asg.attachments.length) ? `<div style="margin-top:12px;">
                            <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;">${AssignmentUI.ICON.clip} 附件</div>
                            ${AssignmentUI.renderFiles(asg.attachments)}
                        </div>` : ''}
                    </div>
                </div>
                <div class="detail-stats">
                    ${stats.map(s => `<div class="stat-card">
                        <div class="stat-icon">${s.icon}</div>
                        <div><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>
                    </div>`).join('')}
                </div>
                ${rubricPills ? `<div style="margin-top:12px;display:flex;flex-wrap:wrap;align-items:center;gap:4px;">
                    <span class="badge" style="background:var(--brand-light);color:var(--brand);">${typeLabel}</span>
                    ${rubricPills}
                    ${asg.max_score != null ? `<span style="font-weight:600;font-size:13px;margin-left:4px;">滿分: ${asg.max_score}</span>` : ''}
                </div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px;flex-wrap:wrap;gap:8px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <h3 style="margin:0;">學生提交</h3>
                    ${(ungradedCount + gradedSubCount) > 0 ? `<button class="btn btn-sm btn-ai" onclick="AssignmentApp.batchAiGrade()" id="batchAiBtn">
                        ${AssignmentUI.ICON.ai} 一鍵AI批改
                    </button>` : ''}
                    ${subs.length > 0 ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.exportGradeExcel()" id="exportExcelBtn">
                        匯出成績
                    </button>` : ''}
                    ${subs.length >= 2 ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.openPlagiarism()" id="plagiarismBtn" style="border-color:#f59e0b;color:#f59e0b;">
                        抄袭檢測
                    </button>` : ''}
                </div>
                <div class="filter-tabs" style="margin:0;">
                    <button class="filter-tab active" onclick="AssignmentApp._filterSubs('all', this)">全部 <span class="count">${subs.length}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('submitted', this)">待批改 <span class="count">${ungradedCount}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('graded', this)">已批改 <span class="count">${gradedSubCount}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('proxy', this)">代提交 <span class="count">${notSubmitted.length}</span></button>
                </div>
            </div>
            <div id="batchAiProgress" style="display:none;"></div>
            <div id="plagiarismProgress" style="display:none;"></div>
            <div id="submissionsArea">${AssignmentUI.renderSubmissionsList(subs)}</div>
        `;

        // Check if there's an active batch AI grading job
        this._stopBatchPolling();
        this._checkBatchAiStatus(id);

        // Check if there's an active plagiarism check
        this._stopPlagiarismPolling();
        this._checkPlagiarismStatus(id);
    },

    async _checkBatchAiStatus(assignmentId) {
        try {
            const resp = await AssignmentAPI.getBatchAiStatus(assignmentId);
            if (resp?.success && resp.data?.status === 'running') {
                this._startBatchPolling(assignmentId);
            }
        } catch (e) { /* ignore */ }
    },

    _filterSubs(status, btn) {
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        if (status === 'proxy') {
            document.getElementById('submissionsArea').innerHTML =
                AssignmentUI.renderProxySubmitList(this._notSubmittedStudents || [], this._currentSubs || []);
            return;
        }
        const filtered = status === 'all' ? this._currentSubs : this._currentSubs.filter(s => s.status === status);
        document.getElementById('submissionsArea').innerHTML = AssignmentUI.renderSubmissionsList(filtered);
    },

    // ---- Teacher: View Single Submission (Grading) ----
    async viewSubmission(subId) {
        this.state.phase = 'submission-detail';
        this.state.currentSubmission = subId;

        const main = document.getElementById('mainContent');
        main.innerHTML = AssignmentUI.skeletonSubmission();

        const resp = await AssignmentAPI.getSubmission(subId);
        if (!resp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }
        const sub = resp.data;
        const asg = sub.assignment || {};
        const rubricItems = sub.rubric_items || [];

        this.setBreadcrumb([
            { label: '作業列表', action: 'AssignmentApp.showTeacherList()' },
            { label: asg.title || '作業', action: `AssignmentApp.viewAssignment(${sub.assignment_id})` },
            { label: sub.student_name || sub.username }
        ]);
        this.setHeaderActions('');

        // ---- Form type: teacher grading view ----
        if (asg.assignment_type === 'form') {
            const questions = sub.questions || [];
            const answers = sub.answers || [];
            const answerFiles = sub.answer_files || [];
            main.innerHTML = `
                <div class="form-section">
                    <h3>${sub.student_name || sub.username} 的作答</h3>
                    <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                        提交時間: ${AssignmentUI.formatDate(sub.submitted_at)}
                        ${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}
                    </div>
                </div>
                <div class="form-section">
                    ${FormGradingView.renderGradingPanel(questions, answers, answerFiles, subId)}
                </div>`;
            return;
        }

        // ---- File upload type (original flow) ----
        // Build existing scores with AI reasons
        const existingScores = (sub.rubric_scores || []).map(s => ({
            ...s,
            reason: this.state.aiReasons[s.rubric_item_id] || ''
        }));
        const rubricType = asg.rubric_type || 'points';
        const rubricConfig = asg.rubric_config || null;

        main.innerHTML = `
            <div class="two-col">
                <div>
                    <div class="form-section">
                        <h3>${AssignmentUI.ICON.clip} 提交內容</h3>
                        <p style="margin-bottom:12px;color:var(--text-secondary);">${sub.content || '無文字備註'}</p>
                        <div style="margin-bottom:8px;font-size:13px;color:var(--text-tertiary);">
                            提交時間: ${AssignmentUI.formatDate(sub.submitted_at)}
                            ${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}
                        </div>
                    </div>
                    <div class="form-section">
                        <h3>${AssignmentUI.ICON.folder} 提交文件</h3>
                        ${AssignmentUI.renderFiles(sub.files, { inlinePreview: true })}
                    </div>
                    <div id="swiftOutputArea"></div>
                    <div id="htmlPreviewArea"></div>
                </div>
                <div>
                    ${(rubricItems.length || rubricType === 'holistic') ?
                        AssignmentUI.renderGradingPanel(rubricItems, existingScores, sub.feedback || '', rubricType, rubricConfig) : `
                    <div class="grading-panel">
                        <h3>${AssignmentUI.ICON.inbox} 快速評分</h3>
                        <p style="color:var(--text-tertiary);font-size:14px;">此作業未設定評分標準</p>
                    </div>`}
                </div>
            </div>
        `;

        // 觸發文件懶加載預覽
        this._initPreviewObserver(sub.files);

        // Update total
        this.updateGradeTotal();
    },

    // Grading helpers
    _selectLevel(btn) {
        const id = btn.dataset.id;
        btn.closest('.level-btn-group').querySelectorAll('.level-btn').forEach(b => {
            if (b.dataset.id === id) b.classList.remove('selected');
        });
        btn.classList.add('selected');
    },

    _selectAnalyticLevel(btn) {
        const id = btn.dataset.id;
        btn.closest('.level-btn-group').querySelectorAll('.level-btn').forEach(b => {
            if (b.dataset.id === id) b.classList.remove('selected');
        });
        btn.classList.add('selected');
        // Fill in points
        const inp = document.querySelector(`.rubric-input[data-id="${id}"]`);
        if (inp) {
            inp.value = btn.dataset.points;
            this.updateGradeTotal();
        }
    },

    _toggleCheck(el) {
        const isPassed = el.classList.contains('passed');
        el.classList.toggle('passed', !isPassed);
        el.classList.toggle('failed', isPassed);
        el.innerHTML = !isPassed ? '● 通過' : '✗ 不通過';
        this.updateGradeTotal();
    },

    _selectHolisticLevel(el) {
        document.querySelectorAll('.holistic-option').forEach(o => o.classList.remove('selected'));
        el.classList.add('selected');
        const min = parseFloat(el.dataset.min) || 0;
        const max = parseFloat(el.dataset.max) || 100;
        const scoreInput = document.getElementById('holisticScore');
        if (scoreInput && !scoreInput.value) {
            scoreInput.value = Math.round((min + max) / 2);
        }
    },

    updateGradeTotal() {
        const panel = document.querySelector('.grading-panel');
        const rubricType = panel?.dataset.rubricType || 'points';

        if (rubricType === 'checklist') {
            const toggles = document.querySelectorAll('.check-toggle');
            let passed = 0;
            toggles.forEach(t => { if (t.classList.contains('passed')) passed++; });
            const total = toggles.length || 1;
            const maxScore = 100; // Will be computed on server
            const score = Math.round(passed / total * maxScore * 10) / 10;
            const el = document.getElementById('gradeTotal');
            if (el) el.textContent = score.toFixed(1);
            return;
        }

        if (rubricType === 'weighted_pct') {
            const inputs = document.querySelectorAll('.rubric-input');
            let total = 0;
            inputs.forEach(inp => {
                const v = parseFloat(inp.value) || 0;
                const w = parseFloat(inp.dataset.weight) || 0;
                total += v * w / 100;
            });
            const el = document.getElementById('gradeTotal');
            if (el) el.textContent = total.toFixed(1);
            return;
        }

        // Default for points, analytic_levels, dse_criterion
        const inputs = document.querySelectorAll('.rubric-input');
        let total = 0;
        inputs.forEach(inp => {
            const v = parseFloat(inp.value) || 0;
            const max = parseFloat(inp.dataset.max) || 0;
            if (v > max) inp.value = max;
            total += Math.min(v, max);
        });
        const el = document.getElementById('gradeTotal');
        if (el) el.textContent = total.toFixed(1);
    },

    async doGrade() {
        const panel = document.querySelector('.grading-panel');
        const rubricType = panel?.dataset.rubricType || 'points';
        const scores = [];

        if (rubricType === 'holistic') {
            const selected = document.querySelector('.holistic-option.selected');
            const pts = parseFloat(document.getElementById('holisticScore')?.value) || 0;
            scores.push({
                rubric_item_id: 0,
                points: pts,
                selected_level: selected?.dataset.label || '',
            });
        } else if (rubricType === 'checklist') {
            document.querySelectorAll('.check-toggle').forEach(t => {
                scores.push({
                    rubric_item_id: parseInt(t.dataset.id),
                    points: t.classList.contains('passed') ? 1 : 0,
                });
            });
        } else if (rubricType === 'competency') {
            document.querySelectorAll('.level-btn.selected').forEach(btn => {
                scores.push({
                    rubric_item_id: parseInt(btn.dataset.id),
                    points: null,
                    selected_level: btn.dataset.level,
                });
            });
        } else if (rubricType === 'analytic_levels') {
            document.querySelectorAll('.rubric-input').forEach(inp => {
                const id = parseInt(inp.dataset.id);
                const selectedBtn = document.querySelector(`.level-btn.selected[data-id="${id}"]`);
                scores.push({
                    rubric_item_id: id,
                    points: parseFloat(inp.value) || 0,
                    selected_level: selectedBtn?.dataset.level || '',
                });
            });
        } else {
            // points, weighted_pct, dse_criterion
            document.querySelectorAll('.rubric-input').forEach(inp => {
                scores.push({
                    rubric_item_id: parseInt(inp.dataset.id),
                    points: parseFloat(inp.value) || 0,
                });
            });
        }

        const feedback = document.getElementById('gradeFeedback')?.value || '';
        const resp = await AssignmentAPI.gradeSubmission(this.state.currentSubmission, {
            rubric_scores: scores,
            feedback: feedback
        });
        if (resp?.success) {
            UIModule.toast('批改完成', 'success');
            this.viewAssignment(this.state.currentAssignment);
        } else {
            UIModule.toast('批改失敗: ' + (resp?.message || resp?.detail || '未知錯誤'), 'error');
        }
    },

    async doAiGrade() {
        const statusEl = document.getElementById('aiGradeStatus');
        if (statusEl) statusEl.innerHTML = '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><div class="loading-spinner"></div><span style="font-size:14px;">AI 正在分析中...</span></div>';

        const resp = await AssignmentAPI.aiGrade(this.state.currentSubmission);
        if (!resp?.success || resp.data?.error) {
            if (statusEl) statusEl.innerHTML = `<div style="color:var(--color-error);font-size:14px;margin-bottom:12px;">AI 批改失敗: ${resp?.data?.overall_feedback || '未知錯誤'}</div>`;
            return;
        }

        const result = resp.data;
        const panel = document.querySelector('.grading-panel');
        const rubricType = panel?.dataset.rubricType || 'points';
        if (statusEl) statusEl.innerHTML = `<div style="color:var(--color-success);font-size:14px;margin-bottom:12px;">${AssignmentUI.ICON.check} AI 批改完成，結果已填入</div>`;

        if (rubricType === 'holistic') {
            // Select the level
            document.querySelectorAll('.holistic-option').forEach(o => {
                o.classList.toggle('selected', o.dataset.label === result.selected_level);
            });
            const scoreInput = document.getElementById('holisticScore');
            if (scoreInput && result.points != null) scoreInput.value = result.points;
            const reasonEl = document.getElementById('aiReason_holistic');
            if (reasonEl) reasonEl.textContent = `AI: ${result.reason || ''}`;
        } else {
            (result.items || []).forEach(item => {
                if (rubricType === 'checklist') {
                    const toggle = document.querySelector(`.check-toggle[data-id="${item.rubric_item_id}"]`);
                    if (toggle) {
                        const passed = item.passed || (item.points > 0);
                        toggle.classList.toggle('passed', passed);
                        toggle.classList.toggle('failed', !passed);
                        toggle.innerHTML = passed ? '● 通過' : '✗ 不通過';
                    }
                } else if (rubricType === 'competency') {
                    const btn = document.querySelector(`.level-btn[data-id="${item.rubric_item_id}"][data-level="${item.selected_level}"]`);
                    if (btn) {
                        btn.closest('.level-btn-group').querySelectorAll(`.level-btn[data-id="${item.rubric_item_id}"]`).forEach(b => b.classList.remove('selected'));
                        btn.classList.add('selected');
                    }
                } else if (rubricType === 'analytic_levels') {
                    const inp = document.querySelector(`.rubric-input[data-id="${item.rubric_item_id}"]`);
                    if (inp) inp.value = item.points;
                    if (item.selected_level) {
                        const btn = document.querySelector(`.level-btn[data-id="${item.rubric_item_id}"][data-level="${item.selected_level}"]`);
                        if (btn) {
                            btn.closest('.level-btn-group').querySelectorAll(`.level-btn[data-id="${item.rubric_item_id}"]`).forEach(b => b.classList.remove('selected'));
                            btn.classList.add('selected');
                        }
                    }
                } else {
                    const inp = document.querySelector(`.rubric-input[data-id="${item.rubric_item_id}"]`);
                    if (inp) inp.value = item.points;
                }

                const reasonEl = document.getElementById(`aiReason_${item.rubric_item_id}`);
                if (reasonEl) reasonEl.textContent = `AI: ${item.reason || ''}`;
                this.state.aiReasons[item.rubric_item_id] = item.reason || '';
            });
        }

        if (result.overall_feedback) {
            const fb = document.getElementById('gradeFeedback');
            if (fb) fb.value = result.overall_feedback;
        }

        this.updateGradeTotal();
    },

    // ---- Batch AI Grade ----
    batchAiGrade() {
        const allSubs = (this._currentSubs || []).filter(s => s.status === 'submitted' || s.status === 'graded');
        const ungraded = allSubs.filter(s => s.status === 'submitted');
        const graded = allSubs.filter(s => s.status === 'graded');

        if (!allSubs.length) {
            UIModule.toast('沒有可批改的提交', 'info');
            return;
        }

        // Default mode: if there are ungraded, default to "remaining"; otherwise "all"
        const defaultMode = ungraded.length > 0 ? 'remaining' : 'all';
        const defaultCount = defaultMode === 'remaining' ? ungraded.length : allSubs.length;

        // Remove old modal if exists to ensure fresh counts
        const oldModal = document.getElementById('batchAiModal');
        if (oldModal) oldModal.remove();

        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal-overlay" id="batchAiModal">
            <div class="batch-ai-modal">
                <div class="batch-ai-modal-header">
                    <h3>${AssignmentUI.ICON.ai} 一鍵 AI 批改</h3>
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closeBatchAiModal()">✕</button>
                </div>
                <div class="batch-ai-modal-body">
                    <label class="batch-ai-label">批改範圍</label>
                    <div class="batch-ai-mode-select">
                        <label class="batch-ai-mode-option${defaultMode === 'remaining' ? ' selected' : ''}${!ungraded.length ? ' disabled' : ''}">
                            <input type="radio" name="batchAiMode" value="remaining"
                                ${defaultMode === 'remaining' ? 'checked' : ''} ${!ungraded.length ? 'disabled' : ''}
                                onchange="AssignmentApp._updateBatchMode()">
                            <div class="batch-ai-mode-content">
                                <span class="batch-ai-mode-title">📝 批改剩餘</span>
                                <span class="batch-ai-mode-desc">僅批改尚未評分的提交 (<strong>${ungraded.length}</strong> 份)</span>
                            </div>
                        </label>
                        <label class="batch-ai-mode-option${defaultMode === 'all' ? ' selected' : ''}">
                            <input type="radio" name="batchAiMode" value="all"
                                ${defaultMode === 'all' ? 'checked' : ''}
                                onchange="AssignmentApp._updateBatchMode()">
                            <div class="batch-ai-mode-content">
                                <span class="batch-ai-mode-title">🔄 全部重新批改</span>
                                <span class="batch-ai-mode-desc">重新批改所有提交，覆蓋已有評分 (<strong>${allSubs.length}</strong> 份)</span>
                            </div>
                        </label>
                    </div>
                    <label class="batch-ai-label">額外提示（選填）</label>
                    <textarea id="batchAiExtraPrompt" class="batch-ai-textarea" rows="4"
                        placeholder="例如：&#10;• 評分寬鬆一些，鼓勵為主&#10;• 嚴格按照標準扣分&#10;• 重點關注代碼的可讀性&#10;• 如果有部分完成也給相應分數"></textarea>
                    <div class="batch-ai-modal-tips">
                        <span style="font-weight:500;">💡 提示範例：</span>
                        <div class="batch-ai-tip-chips">
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('評分寬鬆一些，以鼓勵學生為主')">寬鬆評分</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('嚴格按照評分標準，不符合要求的必須扣分')">嚴格評分</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('重點關注代碼是否能正確運行，功能是否完整')">重功能</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('注重代碼風格和可讀性，命名規範、縮進、註釋等')">重代碼風格</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('部分完成的也酌情給分，不要全部扣掉')">部分給分</button>
                        </div>
                    </div>
                </div>
                <div class="batch-ai-modal-footer">
                    <button class="btn btn-outline" onclick="AssignmentApp.closeBatchAiModal()">取消</button>
                    <button class="btn btn-ai" id="batchAiStartBtn" onclick="AssignmentApp._startBatchAiGrade()">
                        ${AssignmentUI.ICON.ai} 開始批改 (${defaultCount} 份)
                    </button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
        document.body.style.overflow = 'hidden';
    },

    _updateBatchMode() {
        const selected = document.querySelector('input[name="batchAiMode"]:checked')?.value || 'remaining';
        const allSubs = (this._currentSubs || []).filter(s => s.status === 'submitted' || s.status === 'graded');
        const ungraded = allSubs.filter(s => s.status === 'submitted');
        const count = selected === 'remaining' ? ungraded.length : allSubs.length;

        // Update selected styling
        document.querySelectorAll('.batch-ai-mode-option').forEach(el => el.classList.remove('selected'));
        const checkedRadio = document.querySelector('input[name="batchAiMode"]:checked');
        if (checkedRadio) checkedRadio.closest('.batch-ai-mode-option')?.classList.add('selected');

        // Update button text
        const btn = document.getElementById('batchAiStartBtn');
        if (btn) btn.innerHTML = `${AssignmentUI.ICON.ai} 開始批改 (${count} 份)`;
    },

    _insertAiTip(text) {
        const ta = document.getElementById('batchAiExtraPrompt');
        if (!ta) return;
        ta.value = ta.value ? ta.value + '\n' + text : text;
        ta.focus();
    },

    closeBatchAiModal() {
        const modal = document.getElementById('batchAiModal');
        if (modal) { modal.remove(); }
        document.body.style.overflow = '';
    },

    // ---- Excel Export ----
    async exportGradeExcel() {
        const assignmentId = this.state.currentAssignment;
        if (!assignmentId) return;

        const btn = document.getElementById('exportExcelBtn');
        if (btn) { btn.disabled = true; btn.textContent = '匯出中...'; }

        try {
            const resp = await AssignmentAPI.exportExcel(assignmentId);
            if (!resp) return;

            // Extract filename from Content-Disposition header
            const cd = resp.headers.get('content-disposition');
            let filename = '成績.xlsx';
            if (cd) {
                const match = cd.match(/filename\*?=['"]?(?:UTF-8'')?([^;\r\n"']*)['"]?/i);
                if (match) filename = decodeURIComponent(match[1]);
            }

            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            UIModule.toast('成績匯出成功', 'success');
        } catch (e) {
            console.error('匯出失敗:', e);
            UIModule.toast('匯出失敗: ' + (e.message || ''), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '匯出成績'; }
        }
    },

    // ================================================================
    // 抄袭檢測
    // ================================================================

    _hasPlagReport: false,

    async openPlagiarism() {
        // 如果已有報告，直接查看；否則啟動檢測
        if (this._hasPlagReport) {
            this.showPlagiarismReport();
        } else {
            this.showPlagiarismConfigModal();
        }
    },

    // ICT 科目的 code 列表（包含這些關鍵字的科目才顯示代碼檢測選項）
    _ictKeywords: ['ict', 'program', 'code', 'python', 'java', 'swift', 'web', 'app',
        '程式', '編程', '编程', '計算機', '计算机', '資訊', '资讯', 'software', 'ios', 'android'],
    // 中文科目關鍵字
    _chineseKeywords: ['chinese', '中文', '語文', '语文', '作文'],
    // 英文科目關鍵字
    _englishKeywords: ['english', '英文', '英語', '英语', 'eng', 'essay', 'writing', 'composition', 'language arts'],

    _isIctSubject(code) {
        if (!code) return false;
        const lower = code.toLowerCase();
        return this._ictKeywords.some(kw => lower.includes(kw));
    },

    _isChineseSubject(code) {
        if (!code) return false;
        const lower = code.toLowerCase();
        return this._chineseKeywords.some(kw => lower.includes(kw));
    },

    _isEnglishSubject(code) {
        if (!code) return false;
        const lower = code.toLowerCase();
        return this._englishKeywords.some(kw => lower.includes(kw));
    },

    async showPlagiarismConfigModal() {
        const old = document.getElementById('plagConfigModal');
        if (old) old.remove();

        // 載入科目列表
        let subjectsHtml = '';
        try {
            const data = await AssignmentAPI._call('/api/subjects');
            if (data?.subjects) {
                for (const [code, info] of Object.entries(data.subjects)) {
                    subjectsHtml += `<option value="${code}">${info.icon || '📚'} ${info.name}</option>`;
                }
            }
        } catch (e) { /* ignore */ }

        const div = document.createElement('div');
        div.innerHTML = `
        <div class="modal-overlay" id="plagConfigModal">
            <div class="plag-config-modal">
                <div class="plag-config-header">
                    <h3>抄袭檢測配置</h3>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('plagConfigModal').remove()">✕</button>
                </div>
                <div class="plag-config-body">
                    <label class="plag-config-label">科目</label>
                    <select id="plagSubjectSelect" class="plag-config-select"
                        onchange="AssignmentApp._onPlagSubjectChange()">
                        ${subjectsHtml}
                    </select>

                    <div id="plagModeSection">
                        <label class="plag-config-label" style="margin-top:var(--space-4)">作業類型</label>
                        <div class="plag-mode-options" id="plagModeOptions"></div>
                    </div>

                    <label class="plag-config-label" style="margin-top:var(--space-4)">檢測嚴格度</label>
                    <div class="plag-mode-options">
                        <label class="plag-mode-option">
                            <input type="radio" name="plagStrictness" value="loose"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">寬鬆</span>
                                <span class="plag-mode-desc">只標記高度相似</span>
                            </div>
                        </label>
                        <label class="plag-mode-option selected">
                            <input type="radio" name="plagStrictness" value="normal" checked
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">標準</span>
                                <span class="plag-mode-desc">推薦，平衡準確與覆蓋</span>
                            </div>
                        </label>
                        <label class="plag-mode-option">
                            <input type="radio" name="plagStrictness" value="strict"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">嚴格</span>
                                <span class="plag-mode-desc">輕微相似也會標記</span>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="plag-config-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('plagConfigModal').remove()">取消</button>
                    <button class="btn btn-primary" onclick="AssignmentApp._confirmStartPlagiarism()">開始檢測</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);

        // 初始化: 檢查預設選中的科目是否為 ICT
        this._onPlagSubjectChange();
    },

    _onPlagSubjectChange() {
        const code = document.getElementById('plagSubjectSelect')?.value || '';
        const container = document.getElementById('plagModeOptions');
        if (!container) return;

        const isIct = this._isIctSubject(code);
        const isChinese = this._isChineseSubject(code);
        const isEnglish = this._isEnglishSubject(code);

        // 根據科目動態生成模式選項
        let modes = [];
        if (isChinese) {
            modes = [
                { value: 'chinese_essay', title: '中文作文', desc: '抄襲、套用、仿寫三級檢測', selected: true },
                { value: 'text', title: '文字', desc: '段落複製、文字相似' },
                { value: 'mixed', title: '混合', desc: '自動識別類型' },
            ];
        } else if (isEnglish) {
            modes = [
                { value: 'english_essay', title: 'English Essay', desc: '直接抄襲、改寫、結構模仿三級檢測', selected: true },
                { value: 'text', title: '文字', desc: '段落複製、文字相似' },
                { value: 'mixed', title: '混合', desc: '自動識別類型' },
            ];
        } else if (isIct) {
            modes = [
                { value: 'code', title: '代碼', desc: '變量名、縮排、逐字複製' },
                { value: 'text', title: '文字', desc: '段落複製、文字相似' },
                { value: 'mixed', title: '混合', desc: '自動識別類型', selected: true },
            ];
        } else {
            modes = [
                { value: 'text', title: '文字', desc: '段落複製、文字相似' },
                { value: 'mixed', title: '混合', desc: '自動識別類型', selected: true },
            ];
            // 建議根據作文語言選擇模式
            const hint = document.getElementById('plagModeHint');
            if (hint) hint.textContent = '建議根據作文語言選擇模式';
        }

        container.innerHTML = modes.map(m => `
            <label class="plag-mode-option${m.selected ? ' selected' : ''}">
                <input type="radio" name="plagDetectMode" value="${m.value}"
                    ${m.selected ? 'checked' : ''}
                    onchange="AssignmentApp._onPlagModeChange(this)">
                <div class="plag-mode-content">
                    <span class="plag-mode-title">${m.title}</span>
                    <span class="plag-mode-desc">${m.desc}</span>
                </div>
            </label>
        `).join('');
    },

    _onPlagModeChange(radio) {
        const group = radio.closest('.plag-mode-options');
        group.querySelectorAll('.plag-mode-option').forEach(el => el.classList.remove('selected'));
        radio.closest('.plag-mode-option').classList.add('selected');
    },

    async _confirmStartPlagiarism() {
        const subject = document.getElementById('plagSubjectSelect')?.value || '';
        const detect_mode = document.querySelector('input[name="plagDetectMode"]:checked')?.value || 'mixed';
        const strictness = document.querySelector('input[name="plagStrictness"]:checked')?.value || 'normal';
        const thresholdMap = { loose: 75, normal: 60, strict: 45 };
        const threshold = thresholdMap[strictness] || 60;

        const modal = document.getElementById('plagConfigModal');
        if (modal) modal.remove();

        this._doStartPlagiarismCheck(subject, detect_mode, threshold);
    },

    async _doStartPlagiarismCheck(subject = '', detect_mode = 'mixed', threshold = 60) {
        const assignmentId = this.state.currentAssignment;
        if (!assignmentId) return;

        const btn = document.getElementById('plagiarismBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner"></div> 啟動中...'; }

        const resp = await AssignmentAPI.startPlagiarismCheck(assignmentId, { threshold, subject, detect_mode });
        if (!resp?.success) {
            UIModule.toast('啟動抄袭檢測失敗: ' + (resp?.message || ''), 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '抄袭檢測'; }
            return;
        }

        UIModule.toast('抄袭檢測已在後台啟動', 'success');
        this._startPlagiarismPolling(assignmentId);
    },

    async startPlagiarismCheck() {
        // 從報告頁「重新檢測」按鈕觸發 → 彈出配置窗口
        this.showPlagiarismConfigModal();
    },

    // ---- 算法原理 Modal ----
    showAlgorithmModal() {
        const old = document.getElementById('algorithmModal');
        if (old) old.remove();

        const mode = (this._currentPlagReport || {}).detect_mode || 'mixed';

        // ---- 維度說明（按 detect_mode 切換）----
        const dimSections = {
            chinese_essay: `
                <h4 class="algo-section-title">評分維度（中文作文模式）</h4>
                <table class="algo-dim-table">
                    <thead><tr><th>維度</th><th>權重</th><th>說明</th></tr></thead>
                    <tbody>
                        <tr><td>直接文字重合</td><td>30%</td><td>逐字比對兩篇文章的重疊率，並對班級中罕見的共有短語加權</td></tr>
                        <tr><td>句子順序相似</td><td>25%</td><td>用最優配對算法比對句子，檢查是否存在連續多句相同的情況</td></tr>
                        <tr><td>語義內容接近</td><td>15%</td><td>用 AI 理解文章含義，即使換了說法也能發現內容雷同</td></tr>
                        <tr><td>寫作風格接近</td><td>10%</td><td>從標點習慣、高頻用字、關聯詞、句式等 54 個特徵判斷寫作風格是否異常相似</td></tr>
                        <tr><td>篇章結構相似</td><td>10%</td><td>比對文章的段落功能布局（開頭、論述、舉例、結尾）和段落長度分布</td></tr>
                        <tr><td>多維證據一致</td><td>10%</td><td>當多個維度同時命中時額外加權，避免單一維度誤判</td></tr>
                    </tbody>
                </table>`,
            english_essay: `
                <h4 class="algo-section-title">Scoring Dimensions (English Essay)</h4>
                <table class="algo-dim-table">
                    <thead><tr><th>Dimension</th><th>Weight</th><th>Description</th></tr></thead>
                    <tbody>
                        <tr><td>Lexical Overlap</td><td>18%</td><td>Word-level and character n-gram overlap between submissions</td></tr>
                        <tr><td>Sentence Alignment</td><td>28%</td><td>Optimal sentence-level matching and alignment coverage</td></tr>
                        <tr><td>Semantic Similarity</td><td>22%</td><td>AI-powered meaning comparison — detects paraphrasing</td></tr>
                        <tr><td>Stylometry</td><td>10%</td><td>Writing style fingerprint: punctuation, sentence length, discourse markers</td></tr>
                        <tr><td>Discourse Structure</td><td>12%</td><td>Compares essay organization: intro, body, conclusion patterns</td></tr>
                        <tr><td>Evidence Consensus</td><td>10%</td><td>Bonus when multiple dimensions flag the same pair</td></tr>
                    </tbody>
                </table>`,
            code: `
                <h4 class="algo-section-title">評分維度（代碼模式）</h4>
                <table class="algo-dim-table">
                    <thead><tr><th>維度</th><th>說明</th></tr></thead>
                    <tbody>
                        <tr><td>程序指紋 (Winnowing)</td><td>將代碼轉為 token 序列，用 MOSS 風格指紋比對結構</td></tr>
                        <tr><td>代碼骨架</td><td>忽略變量名，只看程序邏輯結構是否相似</td></tr>
                        <tr><td>逐字複製</td><td>字符級直接比對</td></tr>
                        <tr><td>變量命名</td><td>自定義變量/函數名是否異常相似</td></tr>
                        <tr><td>縮排風格</td><td>Tab/空格偏好、縮排寬度、大括號位置等習慣</td></tr>
                        <tr><td>注釋/字串</td><td>注釋文本與字串常量是否雷同</td></tr>
                        <tr><td>共享拼錯</td><td>兩份代碼出現相同的拼寫錯誤（強物證）</td></tr>
                        <tr><td>死代碼</td><td>共同存在的未使用代碼或調試代碼（強物證）</td></tr>
                        <tr><td>多維證據</td><td>多維度同時命中時的交叉驗證加權</td></tr>
                    </tbody>
                </table>`
        };

        const dimHtml = dimSections[mode] || dimSections.code || `
            <h4 class="algo-section-title">評分維度</h4>
            <p class="algo-text">系統從多個維度（文字重合、語義相似、結構對比等）綜合評分，各維度加權合計得到最終相似度。</p>`;

        const modeLabel = ({chinese_essay:'中文作文',english_essay:'English Essay',code:'代碼',text:'文字',mixed:'混合'})[mode] || mode;

        const html = `
        <div class="modal-overlay active" id="algorithmModal" onclick="if(event.target===this)this.remove()">
            <div class="algorithm-modal">
                <div class="algorithm-modal-header">
                    <h3>算法原理</h3>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('algorithmModal').remove()">✕</button>
                </div>
                <div class="algorithm-modal-body">

                    <div class="algo-section">
                        <h4 class="algo-section-title">檢測流程</h4>
                        <div class="algo-flow">
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">1</div>
                                <div class="algo-flow-label">文本提取</div>
                                <div class="algo-flow-desc">從每位學生的提交中提取文本內容</div>
                            </div>
                            <div class="algo-flow-arrow">&rarr;</div>
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">2</div>
                                <div class="algo-flow-label">兩兩比對</div>
                                <div class="algo-flow-desc">每對作品從多個維度計算相似度</div>
                            </div>
                            <div class="algo-flow-arrow">&rarr;</div>
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">3</div>
                                <div class="algo-flow-label">AI 複核</div>
                                <div class="algo-flow-desc">對高相似度的配對進行語義分析</div>
                            </div>
                        </div>
                    </div>

                    <div class="algo-section">
                        <div class="algo-mode-badge">當前模式：${modeLabel}</div>
                        ${dimHtml}
                    </div>

                    <div class="algo-section">
                        <h4 class="algo-section-title">防誤判機制</h4>
                        <ul class="algo-list">
                            <li><strong>同批次模板降權</strong>：如果某段文字在全班多份作品中出現（如題目要求、範文片段），系統會自動降低該段的權重</li>
                            <li><strong>多維度交叉驗證</strong>：只有多個維度同時超過閾值才會判定為高風險，避免單一維度的偶然高分造成誤判</li>
                            ${mode === 'code' ? '<li><strong>短作業閾值自適應</strong>：代碼量少的作業自然相似度較高，系統會自動提高判定閾值</li>' : ''}
                            ${mode === 'chinese_essay' || mode === 'english_essay' ? '<li><strong>開頭/結尾降權</strong>：如果全班多篇作文開頭或結尾相似（可能是老師給了範例），系統會降低這部分的影響</li>' : ''}
                        </ul>
                    </div>

                    <div class="algo-section">
                        <h4 class="algo-section-title">風險等級說明</h4>
                        <table class="algo-dim-table algo-risk-table">
                            <tbody>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#9b2c2c;color:#fff;">高風險</span></td>
                                    <td>總分 &ge; 60%，或 AI 判定為抄襲且總分 &ge; 40%，或 4 個以上維度同時命中</td>
                                </tr>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#b7791f;color:#fff;">需複核</span></td>
                                    <td>總分 &ge; 40%，或 2 個以上維度命中，或有 AI 分析結果</td>
                                </tr>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#4a7c59;color:#fff;">低風險</span></td>
                                    <td>不符合以上條件</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>
                <div class="algorithm-modal-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('algorithmModal').remove()">關閉</button>
                </div>
            </div>
        </div>`;

        const div = document.createElement('div');
        div.innerHTML = html;
        document.body.appendChild(div.firstElementChild);
    },

    _plagPollTimer: null,

    // ---- 全局抄袭檢測進度條（切換頁面不消失）----

    _plagiarismRunningFor: null,  // 正在檢測的 assignmentId

    _ensureGlobalPlagBar() {
        if (document.getElementById('globalPlagBar')) return;
        const bar = document.createElement('div');
        bar.id = 'globalPlagBar';
        bar.className = 'global-plag-bar';
        bar.style.display = 'none';
        bar.innerHTML = `
            <div class="global-plag-inner">
                <div class="global-plag-info">
                    <div class="loading-spinner" style="width:14px;height:14px;border-width:2px;"></div>
                    <span id="globalPlagText">抄袭檢測中...</span>
                </div>
                <div class="global-plag-track">
                    <div class="global-plag-fill" id="globalPlagFill" style="width:0%"></div>
                </div>
                <span id="globalPlagPct" class="global-plag-pct">0%</span>
            </div>
        `;
        document.body.appendChild(bar);
    },

    _showGlobalPlagBar(progress, detail) {
        this._ensureGlobalPlagBar();
        const bar = document.getElementById('globalPlagBar');
        const fill = document.getElementById('globalPlagFill');
        const text = document.getElementById('globalPlagText');
        const pct = document.getElementById('globalPlagPct');
        if (bar) bar.style.display = 'block';
        if (fill) fill.style.width = `${progress}%`;
        if (text) text.textContent = detail || '抄袭檢測中...';
        if (pct) pct.textContent = `${progress}%`;
    },

    _hideGlobalPlagBar() {
        const bar = document.getElementById('globalPlagBar');
        if (bar) bar.style.display = 'none';
        this._plagiarismRunningFor = null;
    },

    _startPlagiarismPolling(assignmentId) {
        if (this._plagPollTimer) clearInterval(this._plagPollTimer);
        this._plagiarismRunningFor = assignmentId;
        this._pollPlagiarismStatus(assignmentId);
        this._plagPollTimer = setInterval(() => this._pollPlagiarismStatus(assignmentId), 2000);
    },

    _stopPlagiarismPolling() {
        if (this._plagPollTimer) {
            clearInterval(this._plagPollTimer);
            this._plagPollTimer = null;
        }
    },

    async _pollPlagiarismStatus(assignmentId) {
        const resp = await AssignmentAPI.getPlagiarismStatus(assignmentId);
        if (!resp?.success) return;
        const job = resp.data;

        const btn = document.getElementById('plagiarismBtn');
        const progressEl = document.getElementById('plagiarismProgress');

        if (job.status === 'idle' || job.status === 'completed' || job.status === 'failed') {
            this._stopPlagiarismPolling();
            this._hideGlobalPlagBar();
            if (progressEl) progressEl.style.display = 'none';

            if (job.status === 'completed') {
                this._hasPlagReport = true;
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '查看報告';
                    btn.style.borderColor = 'var(--brand)';
                    btn.style.color = 'var(--brand)';
                }
                if (job.flagged_pairs > 0) {
                    UIModule.toast(`檢測完成！發現 ${job.flagged_pairs} 對可疑抄襲`, 'warning');
                } else {
                    UIModule.toast('檢測完成，未發現可疑抄襲', 'success');
                }
                // 如果當前正在看這個作業，自動打開報告
                if (this.state.currentAssignment === assignmentId) {
                    this.showPlagiarismReport();
                }
            } else if (job.status === 'failed') {
                if (btn) { btn.disabled = false; btn.innerHTML = '抄袭檢測'; }
                UIModule.toast('抄袭檢測失敗', 'error');
            } else {
                if (btn) { btn.disabled = false; btn.innerHTML = '抄袭檢測'; }
            }
            return;
        }

        if (job.status === 'running') {
            const progress = job.progress || 0;
            const detail = job.detail || '正在分析學生提交內容...';

            // 更新全局浮動進度條（始終可見）
            this._showGlobalPlagBar(progress, detail);

            // 更新頁面內元素（如果還在當前頁面）
            if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> ${progress}%`; }
            if (progressEl) {
                progressEl.style.display = 'block';
                const phaseLabels = { extract: '讀取提交', compare: '比對分析', ai: 'AI 分析', save: '儲存結果' };
                const phaseLabel = phaseLabels[job.phase] || job.phase || '';
                progressEl.innerHTML = `
                    <div class="plag-progress-box">
                        <div class="plag-progress-header">
                            <span>${phaseLabel}</span>
                            <span>${progress}%</span>
                        </div>
                        <div class="plag-progress-track">
                            <div class="plag-progress-fill" style="width:${progress}%"></div>
                        </div>
                        <div class="plag-progress-detail">${detail}</div>
                    </div>`;
            }
        }
    },

    async showPlagiarismReport() {
        const assignmentId = this.state.currentAssignment;
        if (!assignmentId) return;

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div class="workspace-loading"><div class="loading-spinner"></div><p>載入報告中...</p></div>';

        // 清空頂部動作列（返回按鈕已整合到報告儀表盤頂部）
        this.setHeaderActions('');

        const resp = await AssignmentAPI.getPlagiarismReport(assignmentId);
        if (!resp?.success) {
            main.innerHTML = '<div class="empty-state"><div class="empty-state-text">尚未執行過抄袭檢測</div></div>';
            return;
        }

        this._currentPlagReport = resp.data.report;
        this._currentPlagPairs = resp.data.pairs;
        this._currentPlagClusters = resp.data.clusters || [];
        this._currentPlagHubs = resp.data.hub_students || [];
        main.innerHTML = AssignmentUI.renderPlagiarismReport(
            resp.data.report, resp.data.pairs, resp.data.clusters, resp.data.hub_students
        );
    },

    _switchGraphView() { /* removed – tree-only view */ },

    _filterPlagPairs(mode, btn) {
        document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const pairs = this._currentPlagPairs || [];
        const filtered = mode === 'flagged' ? pairs.filter(p => p.is_flagged) : pairs;
        const area = document.getElementById('plagPairsArea');
        if (area) area.innerHTML = AssignmentUI.renderPlagiarismPairs(filtered);
    },

    async viewPlagiarismPair(pairId) {
        const main = document.getElementById('mainContent');
        main.innerHTML = '<div class="workspace-loading"><div class="loading-spinner"></div><p>載入詳情中...</p></div>';

        const resp = await AssignmentAPI.getPlagiarismPairDetail(pairId);
        if (!resp?.success || !resp.data) {
            UIModule.toast('載入配對詳情失敗', 'error');
            this.showPlagiarismReport();
            return;
        }

        this._lastPairDetail = resp.data;
        main.innerHTML = AssignmentUI.renderPlagiarismPairDetail(resp.data);
    },

    closePlagiarismReport() {
        this._stopPlagiarismPolling();
        this.viewAssignment(this.state.currentAssignment);
    },

    closePlagiarismPairDetail() {
        this.showPlagiarismReport();
    },

    /** 證據列表篩選 */
    _filterEvidence(mode, btn) {
        document.querySelectorAll('.evidence-filters .btn-filter').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');
        const cards = document.querySelectorAll('#evidenceList .evidence-list-card');
        cards.forEach(c => {
            if (mode === 'all') { c.style.display = ''; }
            else { c.style.display = c.dataset.strength === mode ? '' : 'none'; }
        });
    },

    /** 複製證據摘要到剪貼板 */
    _copyEvidence(idx) {
        const dims = this._extractDimensions(this._lastPairDetail?.matched_fragments);
        if (!dims || !dims.evidenceBlocks || !dims.evidenceBlocks[idx]) return;
        const b = dims.evidenceBlocks[idx];
        const text = `#${b.rank || idx+1} [${b.strength}] ${b.description}\nA: ${b.snippet_a || ''}\nB: ${b.snippet_b || ''}`;
        navigator.clipboard.writeText(text).then(() => {
            UIModule.toast('已複製證據摘要', 'success');
        }).catch(() => {
            UIModule.toast('複製失敗', 'error');
        });
    },

    /** 點擊證據 → 滾動到全文對照區的對應位置 + 高亮閃爍 */
    _scrollToEvidence(idx) {
        const compareSection = document.getElementById('syncCompare');
        if (!compareSection) return;
        compareSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // 從存儲的配對數據中取 snippet
        let snippet = '';
        if (this._lastPairDetail) {
            const dims = AssignmentUI._extractDimensions(this._lastPairDetail.matched_fragments);
            const blocks = (dims && dims.evidenceBlocks) || [];
            if (blocks[idx] && blocks[idx].snippet_a) {
                snippet = blocks[idx].snippet_a.substring(0, 40);
            }
        }

        // 嘗試在文本中定位對應 snippet 並高亮閃爍
        if (snippet && snippet.length > 4) {
            setTimeout(() => {
                const textEls = [document.getElementById('compareTextA'), document.getElementById('compareTextB')];
                textEls.forEach(el => {
                    if (!el) return;
                    const text = el.textContent || '';
                    const pos = text.indexOf(snippet);
                    if (pos >= 0) {
                        // 滾動到對應位置
                        const ratio = pos / Math.max(text.length, 1);
                        el.scrollTop = ratio * el.scrollHeight;

                        // 在對應位置找到最近的 <span> 高亮元素並閃爍
                        const spans = el.querySelectorAll('span[class^="hl-"]');
                        let bestSpan = null, bestDist = Infinity;
                        for (const sp of spans) {
                            if (sp.textContent.includes(snippet.substring(0, 8))) {
                                bestSpan = sp;
                                break;
                            }
                            // 嘗試按文本位置找最近的
                            const spText = sp.textContent.substring(0, 10);
                            const spPos = text.indexOf(spText);
                            if (spPos >= 0 && Math.abs(spPos - pos) < bestDist) {
                                bestDist = Math.abs(spPos - pos);
                                bestSpan = sp;
                            }
                        }
                        if (bestSpan) {
                            bestSpan.classList.add('hl-flash');
                            setTimeout(() => bestSpan.classList.remove('hl-flash'), 2000);
                        }
                    }
                });
            }, 500);
        }
    },

    async exportPlagiarismExcel() {
        const assignmentId = this.state.currentAssignment;
        if (!assignmentId) return;

        const btn = document.getElementById('plagExportBtn');
        if (btn) { btn.disabled = true; btn.textContent = '匯出中...'; }

        try {
            const resp = await AssignmentAPI.exportPlagiarismExcel(assignmentId);
            if (!resp) return;

            const cd = resp.headers.get('content-disposition');
            let filename = '抄袭檢測報告.xlsx';
            if (cd) {
                const match = cd.match(/filename\*?=['"]?(?:UTF-8'')?([^;\r\n"']*)['"]?/i);
                if (match) filename = decodeURIComponent(match[1]);
            }

            const blob = await resp.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            a.remove();
            UIModule.toast('報告匯出成功', 'success');
        } catch (e) {
            console.error('匯出失敗:', e);
            UIModule.toast('匯出失敗: ' + (e.message || ''), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = '匯出 Excel'; }
        }
    },

    async _checkPlagiarismStatus(assignmentId) {
        try {
            const resp = await AssignmentAPI.getPlagiarismStatus(assignmentId);
            if (!resp?.success) return;
            const data = resp.data;
            const btn = document.getElementById('plagiarismBtn');
            if (data.status === 'running') {
                this._startPlagiarismPolling(assignmentId);
            } else if (data.status === 'completed' && btn) {
                // 已有報告，按鈕顯示「查看報告」
                btn.innerHTML = '查看報告';
                btn.style.borderColor = 'var(--brand)';
                btn.style.color = 'var(--brand)';
                this._hasPlagReport = true;
            }
        } catch (e) { /* ignore */ }
    },

    async _startBatchAiGrade() {
        const extraPrompt = (document.getElementById('batchAiExtraPrompt')?.value || '').trim();
        const mode = document.querySelector('input[name="batchAiMode"]:checked')?.value || 'remaining';
        this.closeBatchAiModal();

        const assignmentId = this.state.currentAssignment;
        const btn = document.getElementById('batchAiBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> 啟動中...`; }

        // Call backend to start batch grading
        const resp = await AssignmentAPI.startBatchAiGrade(assignmentId, extraPrompt, mode);
        if (!resp?.success) {
            UIModule.toast('啟動批改失敗: ' + (resp?.message || ''), 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = `${AssignmentUI.ICON.ai} 一鍵AI批改`; }
            return;
        }

        UIModule.toast('AI 批改已在後台啟動', 'success');
        // Start polling
        this._startBatchPolling(assignmentId);
    },

    _batchPollTimer: null,

    _startBatchPolling(assignmentId) {
        // Clear any existing poll
        if (this._batchPollTimer) clearInterval(this._batchPollTimer);

        // Update immediately, then poll every 2s
        this._pollBatchStatus(assignmentId);
        this._batchPollTimer = setInterval(() => this._pollBatchStatus(assignmentId), 2000);
    },

    _stopBatchPolling() {
        if (this._batchPollTimer) {
            clearInterval(this._batchPollTimer);
            this._batchPollTimer = null;
        }
    },

    async _pollBatchStatus(assignmentId) {
        const resp = await AssignmentAPI.getBatchAiStatus(assignmentId);
        if (!resp?.success) return;
        const job = resp.data;

        const progressEl = document.getElementById('batchAiProgress');
        const btn = document.getElementById('batchAiBtn');

        if (job.status === 'idle') {
            this._stopBatchPolling();
            if (progressEl) progressEl.style.display = 'none';
            return;
        }

        if (job.status === 'running') {
            if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> 批改中 ${job.done}/${job.total}`; }
            if (progressEl) {
                progressEl.style.display = 'block';
                const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
                progressEl.innerHTML = `
                    <div class="batch-ai-progress">
                        <div class="batch-ai-bar">
                            <div class="batch-ai-bar-fill" style="width:${pct}%"></div>
                        </div>
                        <div class="batch-ai-stats">
                            <span>進度: ${job.done}/${job.total}</span>
                            <span style="color:var(--color-success);">✓ ${job.success}</span>
                            ${job.fail ? `<span style="color:var(--color-error);">✗ ${job.fail}</span>` : ''}
                            <button class="btn btn-sm btn-outline" onclick="AssignmentApp._cancelBatchAiGrade()" style="margin-left:auto;">取消</button>
                        </div>
                    </div>`;
            }
            return;
        }

        // done / cancelled
        this._stopBatchPolling();
        const isDone = job.status === 'done';
        const label = isDone ? '批改完成' : '已取消';
        if (progressEl) {
            progressEl.style.display = 'block';
            progressEl.innerHTML = `
                <div class="batch-ai-progress batch-ai-done">
                    <span>${AssignmentUI.ICON.check} ${label}！成功 ${job.success} 份${job.fail ? `，失敗 ${job.fail} 份` : ''}</span>
                </div>`;
        }
        UIModule.toast(`AI ${label}: ${job.success} 成功, ${job.fail} 失敗`, job.success > 0 ? 'success' : 'warning');
        // Refresh after a short delay
        setTimeout(() => this.viewAssignment(assignmentId), 1500);
    },

    async _cancelBatchAiGrade() {
        const assignmentId = this.state.currentAssignment;
        await AssignmentAPI.cancelBatchAiGrade(assignmentId);
        UIModule.toast('正在取消...', 'info');
    },

    // ---- Rubric Type Definitions ----
    RUBRIC_TYPES: [
        { id: 'points', icon: '📊', name: '簡單計分', desc: '各項設定滿分，直接打分' },
        { id: 'analytic_levels', icon: '📋', name: '分級量規', desc: '每項有等級描述和對應分數' },
        { id: 'weighted_pct', icon: '📐', name: '權重百分比', desc: '各項按權重計算總分' },
        { id: 'checklist', icon: '✅', name: '通過清單', desc: '每項只有通過/不通過' },
        { id: 'competency', icon: '🎯', name: '能力等級', desc: '無分數，按能力等級評估' },
        { id: 'dse_criterion', icon: '🏫', name: 'DSE 標準', desc: '按等級描述打分，適用 DSE 評核' },
        { id: 'holistic', icon: '📝', name: '整體評分', desc: '整體選擇一個等級' },
    ],

    // ---- Teacher: Create/Edit ----
    async openCreateModal(editId = null) {
        this.state.editingId = editId;
        this.state.currentStep = 1;
        this.state.selectedRubricType = 'points';
        this.state.assignmentType = 'file';
        this.state.pendingAttachments = [];
        this.state.existingAttachments = [];
        this.state.deletedAttachmentIds = [];
        // Reset exam state
        this.state.examBatchId = null;
        this.state.examFiles = [];
        this.state.recognizedQuestions = [];
        if (this.state.ocrPollingTimer) { clearInterval(this.state.ocrPollingTimer); this.state.ocrPollingTimer = null; }

        document.getElementById('createModalTitle').textContent = editId ? '編輯作業' : '創建作業';

        // Load targets
        if (!this.state.targets) {
            const resp = await AssignmentAPI.getTargets();
            if (resp?.success) this.state.targets = resp.data;
        }

        // Render rubric type selector
        this._renderRubricTypeGrid();

        // Reset form
        if (!editId) {
            document.getElementById('asgTitle').value = '';
            document.getElementById('asgDesc').value = '';
            document.getElementById('asgTargetType').value = 'all';
            document.getElementById('asgDeadline').value = '';
            document.getElementById('asgMaxFiles').value = '5';
            document.getElementById('asgAllowLate').checked = false;
            this.state.selectedRubricType = 'points';
            this._selectRubricType('points');
            this.onTargetTypeChange();
            this.selectAssignmentType('file_upload');
            FormBuilder.reset();
        } else {
            const resp = await AssignmentAPI.getTeacherAssignment(editId);
            if (resp?.success) {
                const a = resp.data;
                document.getElementById('asgTitle').value = a.title;
                document.getElementById('asgDesc').value = a.description || '';
                document.getElementById('asgTargetType').value = a.target_type;
                if (a.deadline) {
                    const d = new Date(a.deadline);
                    document.getElementById('asgDeadline').value = d.toISOString().slice(0, 16);
                }
                document.getElementById('asgMaxFiles').value = a.max_files || 5;
                document.getElementById('asgAllowLate').checked = !!a.allow_late;
                this.onTargetTypeChange();
                if (a.target_value) {
                    document.getElementById('asgTargetValue').value = a.target_value;
                }
                // Set rubric type and hydrate editor
                const rType = a.rubric_type || 'points';
                this.state.selectedRubricType = rType;
                this._selectRubricType(rType);
                this._hydrateRubricEditor(rType, a.rubric_items || [], a.rubric_config);
                // Load existing attachments
                this.state.existingAttachments = a.attachments || [];
                // Set assignment type and load questions
                const aType = a.assignment_type || 'file_upload';
                this.selectAssignmentType(aType);
                if (aType === 'form' && a.questions) {
                    FormBuilder.loadQuestions(a.questions);
                }
            }
        }

        // Render attachment lists
        this._renderAttachmentLists();
        this._setupAttachmentZone();

        // Reset assignment type selector UI
        this.selectAssignmentType(editId ? (/* TODO: load from server */ 'file') : 'file');

        // Reset exam upload panel in step 2
        const uploadPanel = document.getElementById('examUploadPanel');
        if (uploadPanel) uploadPanel.style.display = 'none';
        const ocrStatus = document.getElementById('examOcrStatus');
        if (ocrStatus) ocrStatus.style.display = 'none';
        const qEditor = document.getElementById('examQuestionEditor');
        if (qEditor) qEditor.innerHTML = '';

        this.goToStep(1);
        document.getElementById('createModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        setTimeout(() => document.getElementById('asgTitle')?.focus(), 300);
    },

    closeCreateModal() {
        if (this.state.ocrPollingTimer) { clearInterval(this.state.ocrPollingTimer); this.state.ocrPollingTimer = null; }
        document.getElementById('createModal').classList.remove('active');
        document.body.style.overflow = '';
    },

    selectAssignmentType(type) {
        this.state.selectedAssignmentType = type;
        // Update card selection
        document.querySelectorAll('#assignmentTypeCards .asg-type-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.type === type);
        });
        const isForm = type === 'form';
        // Toggle visibility of file_upload-specific fields
        const maxFilesGroup = document.getElementById('maxFilesGroup');
        if (maxFilesGroup) maxFilesGroup.style.display = isForm ? 'none' : '';
        // Toggle step 2 sections
        const rubricSection = document.getElementById('rubricSection');
        const formBuilderSection = document.getElementById('formBuilderSection');
        if (rubricSection) rubricSection.style.display = isForm ? 'none' : '';
        if (formBuilderSection) formBuilderSection.style.display = isForm ? '' : 'none';
    },

    goToStep(n) {
        this.state.currentStep = n;
        const isExam = this.state.assignmentType === 'exam';
        document.getElementById('step1').style.display = n === 1 ? '' : 'none';
        document.getElementById('step2Rubric').style.display = (n === 2 && !isExam) ? '' : 'none';
        document.getElementById('step2Exam').style.display = (n === 2 && isExam) ? '' : 'none';
        document.getElementById('stepItem1').className = `step-item ${n === 1 ? 'active' : 'completed'}`;
        document.getElementById('stepItem2').className = `step-item ${n === 2 ? 'active' : ''}`;
        // Update step 2 label based on assignment type
        const step2Label = document.querySelector('#stepItem2 span');
        if (step2Label) step2Label.textContent = isExam ? '題目管理' : '評分標準';
        // Animated progress line
        const line = document.querySelector('.step-line');
        if (line) line.classList.toggle('filled', n >= 2);
        // Checkmark for completed step
        const circle1 = document.querySelector('#stepItem1 .step-circle');
        if (circle1) circle1.textContent = n >= 2 ? '✓' : '1';
        // Setup exam upload zone when entering step 2 exam
        if (n === 2 && isExam) this._setupExamUploadZone();
    },

    selectAssignmentType(type) {
        this.state.assignmentType = type;
        document.querySelectorAll('.asg-type-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.type === type);
        });
    },

    _renderRubricTypeGrid() {
        const grid = document.getElementById('rubricTypeGrid');
        grid.innerHTML = this.RUBRIC_TYPES.map(t =>
            `<div class="rubric-type-card ${t.id === this.state.selectedRubricType ? 'selected' : ''}"
                  data-type="${t.id}" onclick="AssignmentApp._selectRubricType('${t.id}')">
                <div class="type-icon">${t.icon}</div>
                <div class="type-name">${t.name}</div>
                <div class="type-desc">${t.desc}</div>
            </div>`
        ).join('');
    },

    _selectRubricType(type) {
        this.state.selectedRubricType = type;
        // Update card selection
        document.querySelectorAll('.rubric-type-card').forEach(c => {
            c.classList.toggle('selected', c.dataset.type === type);
        });
        // Render editor with defaults (hydrate with empty data adds default items)
        this._hydrateRubricEditor(type, [], null);
    },

    _renderRubricEditor(type) {
        const area = document.getElementById('rubricEditorArea');
        switch (type) {
            case 'points': area.innerHTML = this._editorPoints(); break;
            case 'analytic_levels': area.innerHTML = this._editorAnalyticLevels(); break;
            case 'weighted_pct': area.innerHTML = this._editorWeightedPct(); break;
            case 'checklist': area.innerHTML = this._editorChecklist(); break;
            case 'competency': area.innerHTML = this._editorCompetency(); break;
            case 'dse_criterion': area.innerHTML = this._editorDSECriterion(); break;
            case 'holistic': area.innerHTML = this._editorHolistic(); break;
        }
    },

    // ---- Type Editors ----
    _editorPoints() {
        return `<div class="form-group">
            <label>評分項目</label>
            <div class="rubric-editor">
                <div class="rubric-header"><span>項目名稱</span><span>滿分</span><span></span></div>
                <div id="rubricRows"></div>
                <div class="rubric-total"><span>合計</span><span id="rubricTotal">0</span><span></span></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp.addRubricRow()">+ 添加項目</button>
        </div>`;
    },

    _editorAnalyticLevels() {
        return `<div class="form-group">
            <label>分級評分標準</label>
            <div id="analyticCriteria"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addAnalyticCriterion()">+ 添加標準</button>
        </div>`;
    },

    _addAnalyticCriterion(title = '', maxPts = 10, levels = null) {
        const container = document.getElementById('analyticCriteria');
        const card = document.createElement('div');
        card.className = 'criterion-card';
        const defaultLevels = levels || [
            { level: '優秀', points: maxPts, description: '' },
            { level: '良好', points: Math.round(maxPts * 0.7), description: '' },
            { level: '及格', points: Math.round(maxPts * 0.4), description: '' },
            { level: '不及格', points: 0, description: '' },
        ];
        card.innerHTML = `
            <div class="criterion-card-header">
                <input type="text" class="criterion-title" placeholder="標準名稱" value="${title}">
                <span style="font-size:13px;color:var(--text-tertiary);white-space:nowrap;">滿分:</span>
                <input type="number" class="criterion-max" style="width:70px;" value="${maxPts}" min="0" step="0.5">
                <button class="remove-btn" onclick="this.closest('.criterion-card').remove()">✕</button>
            </div>
            <div class="criterion-card-body">
                <div class="level-rows">
                    ${defaultLevels.map(l => `<div class="level-row">
                        <input type="text" class="lv-label" placeholder="等級" value="${l.level}">
                        <input type="number" class="lv-points" placeholder="分數" value="${l.points}" min="0" step="0.5">
                        <textarea class="lv-desc" placeholder="描述..." rows="1">${l.description || ''}</textarea>
                        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                    </div>`).join('')}
                </div>
                <button style="width:100%;padding:4px;border:1px dashed var(--border-strong);background:none;color:var(--brand);cursor:pointer;border-radius:4px;margin-top:4px;font-size:13px;"
                    onclick="AssignmentApp._addLevelRow(this)">+ 添加等級</button>
            </div>`;
        container.appendChild(card);
    },

    _addLevelRow(btn) {
        const rows = btn.previousElementSibling;
        const row = document.createElement('div');
        row.className = 'level-row';
        row.innerHTML = `
            <input type="text" class="lv-label" placeholder="等級" value="">
            <input type="number" class="lv-points" placeholder="分數" value="0" min="0" step="0.5">
            <textarea class="lv-desc" placeholder="描述..." rows="1"></textarea>
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        rows.appendChild(row);
    },

    _editorWeightedPct() {
        return `<div class="form-group">
            <label>總分設定</label>
            <input type="number" id="weightTotalScore" value="100" min="1" style="width:120px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>評分項目 (權重需合計 100%)</label>
            <div class="rubric-editor">
                <div class="rubric-header"><span>項目名稱</span><span>權重 %</span><span></span></div>
                <div id="weightRows"></div>
            </div>
            <div id="weightValidation" class="weight-validation valid">合計: 0%</div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addWeightRow()">+ 添加項目</button>
        </div>`;
    },

    _addWeightRow(title = '', weight = '') {
        const rows = document.getElementById('weightRows');
        const row = document.createElement('div');
        row.className = 'rubric-row';
        row.innerHTML = `
            <input type="text" class="wt-title" placeholder="項目名稱" value="${title}">
            <input type="number" class="wt-weight" placeholder="%" value="${weight}" min="0" max="100" step="1"
                oninput="AssignmentApp._updateWeightTotal()">
            <button class="remove-btn" onclick="this.parentElement.remove();AssignmentApp._updateWeightTotal();">✕</button>`;
        rows.appendChild(row);
        this._updateWeightTotal();
    },

    _updateWeightTotal() {
        const inputs = document.querySelectorAll('.wt-weight');
        let total = 0;
        inputs.forEach(inp => total += parseFloat(inp.value) || 0);
        const el = document.getElementById('weightValidation');
        if (el) {
            el.textContent = `合計: ${total}%`;
            el.className = `weight-validation ${Math.abs(total - 100) < 0.01 ? 'valid' : 'invalid'}`;
        }
    },

    _editorChecklist() {
        return `<div class="form-group">
            <label>滿分設定</label>
            <input type="number" id="checklistMaxScore" value="100" min="1" style="width:120px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>檢查項目 (通過/不通過)</label>
            <div class="rubric-editor" style="border-bottom:none;">
                <div id="checklistItems"></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addChecklistItem()">+ 添加項目</button>
        </div>`;
    },

    _addChecklistItem(title = '') {
        const container = document.getElementById('checklistItems');
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.innerHTML = `
            <span style="color:var(--text-tertiary);">☐</span>
            <input type="text" class="cl-title" placeholder="檢查項目" value="${title}">
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(item);
    },

    _editorCompetency() {
        return `<div class="form-group">
            <label>能力等級標籤 (可自定義)</label>
            <div id="competencyLevels" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;"></div>
            <button class="add-rubric-btn" style="border-top:1px dashed var(--border-strong);" onclick="AssignmentApp._addCompetencyLevel()">+ 添加等級</button>
        </div>
        <div class="form-group">
            <label>評估標準</label>
            <div class="rubric-editor" style="border-bottom:none;">
                <div id="competencyItems"></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addCompetencyItem()">+ 添加標準</button>
        </div>
        <div style="padding:8px 12px;background:rgba(0,122,255,0.08);border-radius:8px;font-size:13px;color:var(--color-info);">
            此類型無數字分數，老師為每項選擇一個能力等級。
        </div>`;
    },

    _initCompetencyLevels(labels = null) {
        const defaults = labels || ['Not Yet', 'Approaching', 'Meeting', 'Exceeding'];
        const container = document.getElementById('competencyLevels');
        container.innerHTML = '';
        defaults.forEach(l => this._addCompetencyLevelTag(l));
    },

    _addCompetencyLevel() {
        const name = prompt('輸入等級名稱:');
        if (name && name.trim()) this._addCompetencyLevelTag(name.trim());
    },

    _addCompetencyLevelTag(name) {
        const container = document.getElementById('competencyLevels');
        const tag = document.createElement('span');
        tag.className = 'badge';
        tag.style.cssText = 'background:var(--brand-light);color:var(--brand);padding:4px 12px;cursor:pointer;';
        tag.innerHTML = `${name} <span onclick="event.stopPropagation();this.parentElement.remove();" style="margin-left:4px;cursor:pointer;">✕</span>`;
        tag.dataset.label = name;
        container.appendChild(tag);
    },

    _addCompetencyItem(title = '') {
        const container = document.getElementById('competencyItems');
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.innerHTML = `
            <input type="text" class="comp-title" placeholder="評估標準名稱" value="${title}">
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(item);
    },

    _editorDSECriterion() {
        return `<div class="form-group">
            <label>每項最高等級</label>
            <input type="number" id="dseMaxLevel" value="7" min="1" max="20" style="width:80px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>DSE 評分標準</label>
            <div id="dseCriteria"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addDSECriterion()">+ 添加標準</button>
        </div>`;
    },

    _addDSECriterion(title = '', maxPts = null, levels = null) {
        const container = document.getElementById('dseCriteria');
        const maxLevel = maxPts || parseInt(document.getElementById('dseMaxLevel')?.value) || 7;
        const card = document.createElement('div');
        card.className = 'criterion-card';
        const defaultLevels = levels || [
            { level: '1', description: '' },
            { level: '2', description: '' },
            { level: '3', description: '' },
            { level: '4', description: '' },
            { level: '5', description: '' },
            { level: '6', description: '' },
            { level: '7', description: '' },
        ];
        card.innerHTML = `
            <div class="criterion-card-header">
                <input type="text" class="dse-title" placeholder="評核準則名稱" value="${title}">
                <span style="font-size:13px;color:var(--text-tertiary);white-space:nowrap;">滿分:</span>
                <input type="number" class="dse-max" style="width:60px;" value="${maxLevel}" min="1">
                <button class="remove-btn" onclick="this.closest('.criterion-card').remove()">✕</button>
            </div>
            <div class="criterion-card-body">
                <div class="level-rows">
                    ${defaultLevels.map(l => `<div class="level-row" style="grid-template-columns:80px 1fr 36px;">
                        <input type="text" class="dse-lv-label" placeholder="等級" value="${l.level}">
                        <textarea class="dse-lv-desc" placeholder="等級描述..." rows="1">${l.description || ''}</textarea>
                        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                    </div>`).join('')}
                </div>
                <button style="width:100%;padding:4px;border:1px dashed var(--border-strong);background:none;color:var(--brand);cursor:pointer;border-radius:4px;margin-top:4px;font-size:13px;"
                    onclick="AssignmentApp._addDSELevelRow(this)">+ 添加等級</button>
            </div>`;
        container.appendChild(card);
    },

    _addDSELevelRow(btn) {
        const rows = btn.previousElementSibling;
        const row = document.createElement('div');
        row.className = 'level-row';
        row.style.gridTemplateColumns = '80px 1fr 36px';
        row.innerHTML = `
            <input type="text" class="dse-lv-label" placeholder="等級" value="">
            <textarea class="dse-lv-desc" placeholder="等級描述..." rows="1"></textarea>
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        rows.appendChild(row);
    },

    _editorHolistic() {
        return `<div class="form-group">
            <label>整體評分等級</label>
            <div id="holisticLevels"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addHolisticLevel()">+ 添加等級</button>
        </div>
        <div style="padding:8px 12px;background:rgba(0,122,255,0.08);border-radius:8px;font-size:13px;color:var(--color-info);">
            無細項拆分，老師直接選擇一個整體等級。
        </div>`;
    },

    _addHolisticLevel(label = '', min = '', max = '', desc = '') {
        const container = document.getElementById('holisticLevels');
        const div = document.createElement('div');
        div.className = 'holistic-level';
        div.innerHTML = `
            <div class="holistic-level-header">
                <input type="text" class="hl-label" placeholder="等級" value="${label}">
                <input type="number" class="hl-min" placeholder="最低" value="${min}" min="0">
                <input type="number" class="hl-max" placeholder="最高" value="${max}" min="0">
                <span style="font-size:12px;color:var(--text-tertiary);">分</span>
                <button class="remove-btn" onclick="this.closest('.holistic-level').remove()">✕</button>
            </div>
            <textarea class="hl-desc" placeholder="等級描述..." rows="2">${desc}</textarea>`;
        container.appendChild(div);
    },

    // Hydrate editor with existing data when editing
    _hydrateRubricEditor(type, items, config) {
        const area = document.getElementById('rubricEditorArea');
        this._renderRubricEditor(type);

        switch (type) {
            case 'points':
                items.forEach(item => this.addRubricRow(item.title, item.max_points));
                if (!items.length) this.addRubricRow();
                break;
            case 'analytic_levels':
                items.forEach(item => {
                    this._addAnalyticCriterion(item.title, item.max_points || 10, item.level_definitions);
                });
                if (!items.length) this._addAnalyticCriterion();
                break;
            case 'weighted_pct':
                if (config?.total_score) document.getElementById('weightTotalScore').value = config.total_score;
                items.forEach(item => this._addWeightRow(item.title, item.weight));
                if (!items.length) this._addWeightRow();
                break;
            case 'checklist':
                if (config?.max_score) document.getElementById('checklistMaxScore').value = config.max_score;
                items.forEach(item => this._addChecklistItem(item.title));
                if (!items.length) this._addChecklistItem();
                break;
            case 'competency':
                this._initCompetencyLevels(config?.level_labels);
                items.forEach(item => this._addCompetencyItem(item.title));
                if (!items.length) this._addCompetencyItem();
                break;
            case 'dse_criterion':
                if (config?.max_level) document.getElementById('dseMaxLevel').value = config.max_level;
                items.forEach(item => {
                    this._addDSECriterion(item.title, item.max_points, item.level_definitions);
                });
                if (!items.length) this._addDSECriterion();
                break;
            case 'holistic':
                if (config?.levels) {
                    config.levels.forEach(lv => this._addHolisticLevel(lv.label, lv.min, lv.max, lv.description || ''));
                } else {
                    this._addHolisticLevel('A', 90, 100, '');
                    this._addHolisticLevel('B', 80, 89, '');
                    this._addHolisticLevel('C', 70, 79, '');
                    this._addHolisticLevel('D', 60, 69, '');
                    this._addHolisticLevel('F', 0, 59, '');
                }
                break;
        }
    },

    onTargetTypeChange() {
        const type = document.getElementById('asgTargetType').value;
        const group = document.getElementById('targetValueGroup');
        const label = document.getElementById('targetValueLabel');
        const select = document.getElementById('asgTargetValue');

        if (type === 'all') { group.style.display = 'none'; return; }
        group.style.display = '';
        select.innerHTML = '';

        if (type === 'class') {
            label.textContent = '選擇班級';
            (this.state.targets?.classes || []).forEach(c => {
                select.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else if (type === 'student') {
            label.textContent = '選擇學生';
            (this.state.targets?.students || []).forEach(s => {
                select.innerHTML += `<option value="${s.username}">${s.display_name || s.username} (${s.class_name || ''})</option>`;
            });
        }
    },

    addRubricRow(title = '', maxPoints = '') {
        const rows = document.getElementById('rubricRows');
        if (!rows) return;
        const row = document.createElement('div');
        row.className = 'rubric-row';
        row.innerHTML = `
            <input type="text" class="rubric-title" placeholder="評分項目名稱" value="${title}">
            <input type="number" class="rubric-points" placeholder="滿分" value="${maxPoints}" min="0" step="0.5"
                oninput="AssignmentApp.updateRubricTotal()">
            <button class="remove-btn" onclick="this.parentElement.remove();AssignmentApp.updateRubricTotal();">✕</button>`;
        rows.appendChild(row);
        this.updateRubricTotal();
    },

    updateRubricTotal() {
        const inputs = document.querySelectorAll('.rubric-points');
        let total = 0;
        inputs.forEach(inp => total += parseFloat(inp.value) || 0);
        const el = document.getElementById('rubricTotal');
        if (el) el.textContent = total;
    },

    _getFormData() {
        const assignmentType = this.state.selectedAssignmentType || 'file_upload';
        const rubricType = this.state.selectedRubricType || 'points';
        const targetType = document.getElementById('asgTargetType').value;
        let targetValue = null;
        if (targetType !== 'all') targetValue = document.getElementById('asgTargetValue').value;
        const isExam = this.state.assignmentType === 'exam';

        const base = {
            title: document.getElementById('asgTitle').value.trim(),
            description: document.getElementById('asgDesc').value.trim(),
            assignment_type: this.state.assignmentType,
            target_type: targetType,
            target_value: targetValue,
            deadline: document.getElementById('asgDeadline').value || null,
            max_files: parseInt(document.getElementById('asgMaxFiles').value) || 5,
            allow_late: document.getElementById('asgAllowLate').checked,
            rubric_type: isExam ? 'points' : rubricType,
            rubric_config: null,
            rubric_items: [],
            questions: [],
        };

        // For exam type, collect questions and skip rubric
        if (isExam) {
            if (this.state.recognizedQuestions?.length > 0) {
                base.questions = this._collectQuestions();
            }
            return base;
        }

        switch (rubricType) {
            case 'points': {
                const rows = document.querySelectorAll('#rubricRows .rubric-row');
                rows.forEach(row => {
                    const title = row.querySelector('.rubric-title').value.trim();
                    const pts = parseFloat(row.querySelector('.rubric-points').value) || 0;
                    if (title && pts > 0) base.rubric_items.push({ title, max_points: pts });
                });
                break;
            }
            case 'analytic_levels': {
                document.querySelectorAll('#analyticCriteria .criterion-card').forEach(card => {
                    const title = card.querySelector('.criterion-title').value.trim();
                    const maxPts = parseFloat(card.querySelector('.criterion-max').value) || 10;
                    const levels = [];
                    card.querySelectorAll('.level-row').forEach(lr => {
                        levels.push({
                            level: lr.querySelector('.lv-label').value.trim(),
                            points: parseFloat(lr.querySelector('.lv-points').value) || 0,
                            description: lr.querySelector('.lv-desc').value.trim(),
                        });
                    });
                    if (title) base.rubric_items.push({ title, max_points: maxPts, level_definitions: levels });
                });
                break;
            }
            case 'weighted_pct': {
                base.rubric_config = { total_score: parseFloat(document.getElementById('weightTotalScore')?.value) || 100 };
                document.querySelectorAll('#weightRows .rubric-row').forEach(row => {
                    const title = row.querySelector('.wt-title').value.trim();
                    const weight = parseFloat(row.querySelector('.wt-weight').value) || 0;
                    if (title) base.rubric_items.push({ title, max_points: base.rubric_config.total_score, weight });
                });
                break;
            }
            case 'checklist': {
                base.rubric_config = { max_score: parseFloat(document.getElementById('checklistMaxScore')?.value) || 100 };
                document.querySelectorAll('#checklistItems .checklist-item').forEach(item => {
                    const title = item.querySelector('.cl-title').value.trim();
                    if (title) base.rubric_items.push({ title, max_points: 1 });
                });
                break;
            }
            case 'competency': {
                const labels = [];
                document.querySelectorAll('#competencyLevels .badge').forEach(tag => {
                    if (tag.dataset.label) labels.push(tag.dataset.label);
                });
                base.rubric_config = { level_labels: labels };
                document.querySelectorAll('#competencyItems .checklist-item').forEach(item => {
                    const title = item.querySelector('.comp-title').value.trim();
                    if (title) base.rubric_items.push({ title, max_points: 0 });
                });
                break;
            }
            case 'dse_criterion': {
                const maxLevel = parseInt(document.getElementById('dseMaxLevel')?.value) || 7;
                base.rubric_config = { max_level: maxLevel };
                document.querySelectorAll('#dseCriteria .criterion-card').forEach(card => {
                    const title = card.querySelector('.dse-title').value.trim();
                    const maxPts = parseFloat(card.querySelector('.dse-max').value) || maxLevel;
                    const levels = [];
                    card.querySelectorAll('.level-row').forEach(lr => {
                        levels.push({
                            level: lr.querySelector('.dse-lv-label').value.trim(),
                            description: lr.querySelector('.dse-lv-desc').value.trim(),
                        });
                    });
                    if (title) base.rubric_items.push({ title, max_points: maxPts, level_definitions: levels });
                });
                break;
            }
            case 'holistic': {
                const levels = [];
                document.querySelectorAll('#holisticLevels .holistic-level').forEach(lv => {
                    levels.push({
                        label: lv.querySelector('.hl-label').value.trim(),
                        min: parseFloat(lv.querySelector('.hl-min').value) || 0,
                        max: parseFloat(lv.querySelector('.hl-max').value) || 100,
                        description: lv.querySelector('.hl-desc').value.trim(),
                    });
                });
                base.rubric_config = { levels };
                break;
            }
        }
        return base;
    },

    // ---- Exam Upload / OCR Methods ----

    toggleExamUpload() {
        const panel = document.getElementById('examUploadPanel');
        if (!panel) return;
        const isVisible = panel.style.display !== 'none';
        if (isVisible) {
            panel.style.display = 'none';
        } else {
            panel.style.display = '';
            // Reset upload state
            this.state.examFiles = [];
            document.getElementById('examFilePreview').innerHTML = '';
            document.getElementById('startOcrBtn').disabled = true;
            document.getElementById('startOcrBtn').textContent = '開始識別';
            document.getElementById('examUploadZone').style.display = '';
            this._setupExamUploadZone();
        }
    },

    _setupExamUploadZone() {
        const zone = document.getElementById('examUploadZone');
        const input = document.getElementById('examFileInput');
        if (!zone || !input) return;
        zone.onclick = () => input.click();
        input.onchange = (e) => { this._addExamFiles(e.target.files); input.value = ''; };
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => {
            e.preventDefault(); zone.classList.remove('dragover');
            this._addExamFiles(e.dataTransfer.files);
        };
    },

    _addExamFiles(fileList) {
        const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
        for (const f of fileList) {
            if (!allowed.includes(f.type) && !f.name.match(/\.(jpg|jpeg|png|heic|heif|pdf)$/i)) {
                UIModule.toast(`不支持的文件類型: ${f.name}`, 'warning');
                continue;
            }
            if (f.size > 10 * 1024 * 1024) {
                UIModule.toast(`文件過大 (>10MB): ${f.name}`, 'warning');
                continue;
            }
            this.state.examFiles.push(f);
        }
        this._renderExamFilePreview();
        document.getElementById('startOcrBtn').disabled = this.state.examFiles.length === 0;
    },

    _renderExamFilePreview() {
        const container = document.getElementById('examFilePreview');
        if (!container) return;
        if (this.state.examFiles.length === 0) { container.innerHTML = ''; return; }
        container.innerHTML = this.state.examFiles.map((f, i) => {
            const sizeStr = f.size < 1024 * 1024
                ? (f.size / 1024).toFixed(1) + ' KB'
                : (f.size / 1024 / 1024).toFixed(1) + ' MB';
            const icon = f.type === 'application/pdf' || f.name.endsWith('.pdf')
                ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
                : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>';
            return `<div class="exam-file-item">
                <span class="exam-file-icon">${icon}</span>
                <span class="exam-file-name">${this._escapeHtml(f.name)}</span>
                <span class="exam-file-size">${sizeStr}</span>
                <button class="exam-file-remove" onclick="AssignmentApp._removeExamFile(${i})">&times;</button>
            </div>`;
        }).join('');
    },

    _removeExamFile(index) {
        this.state.examFiles.splice(index, 1);
        this._renderExamFilePreview();
        document.getElementById('startOcrBtn').disabled = this.state.examFiles.length === 0;
    },

    async startExamOcr() {
        if (this.state.examFiles.length === 0) return;
        const btn = document.getElementById('startOcrBtn');
        btn.disabled = true;
        btn.textContent = '上傳中...';

        const resp = await AssignmentAPI.uploadExamPaper(this.state.examFiles);
        if (!resp?.success) {
            UIModule.toast('上傳失敗: ' + (resp?.message || resp?.detail || ''), 'error');
            btn.disabled = false;
            btn.textContent = '開始識別';
            return;
        }

        this.state.examBatchId = resp.data.batch_id;
        // Show OCR status, hide upload panel
        document.getElementById('examOcrStatus').style.display = '';
        document.getElementById('examUploadPanel').style.display = 'none';

        this._renderOcrStatus({ status: 'processing', total_files: resp.data.total_files, completed_files: 0, failed_files: 0 });

        // Start polling
        this.state.ocrPollingTimer = setInterval(() => this._pollOcrStatus(), 3000);
    },

    async _pollOcrStatus() {
        if (!this.state.examBatchId) return;
        const resp = await AssignmentAPI.getExamPaperStatus(this.state.examBatchId);
        if (!resp?.success) return;

        const data = resp.data;
        this._renderOcrStatus(data);

        if (data.status === 'completed' || data.status === 'partial_failed' || data.status === 'failed') {
            clearInterval(this.state.ocrPollingTimer);
            this.state.ocrPollingTimer = null;

            if (data.status === 'failed') {
                UIModule.toast('識別失敗，請重新上傳', 'error');
                return;
            }

            if (data.questions && data.questions.length > 0) {
                this.state.recognizedQuestions = data.questions;
                this._renderQuestionEditor();
            } else {
                UIModule.toast('未識別到任何題目', 'warning');
            }
        }
    },

    _renderOcrStatus(data) {
        const container = document.getElementById('examOcrStatus');
        if (!container) return;
        container.style.display = '';
        const statusMap = {
            uploading: '上傳中...',
            processing: '識別中...',
            completed: '識別完成',
            partial_failed: '部分完成',
            failed: '識別失敗',
        };
        const statusClass = data.status === 'completed' ? 'success'
            : data.status === 'partial_failed' ? 'warning'
            : data.status === 'failed' ? 'error' : 'processing';

        let html = `<div class="ocr-status-bar ocr-status--${statusClass}">
            <div class="ocr-status-summary">
                <span class="ocr-status-label">${statusMap[data.status] || data.status}</span>
                <span class="ocr-status-counts">共 ${data.total_files} 個文件，已完成 ${data.completed_files || 0} 個${data.failed_files ? '，失敗 ' + data.failed_files + ' 個' : ''}</span>
                ${data.total_questions ? `<span class="ocr-status-questions">| 共識別 ${data.total_questions} 題${data.low_confidence_count ? '，' + data.low_confidence_count + ' 題低置信度' : ''}</span>` : ''}
            </div>`;
        if (data.status === 'processing') {
            html += `<div class="ocr-progress-bar"><div class="ocr-progress-fill" style="width:${data.total_files ? ((data.completed_files||0) / data.total_files * 100) : 0}%"></div></div>`;
        }
        html += `</div>`;

        // File status rows
        if (data.files && data.files.length > 0) {
            html += `<div class="ocr-file-list">`;
            for (const f of data.files) {
                const fStatus = f.status || f.ocr_status || 'pending';
                const fIcon = fStatus === 'completed' ? '✓' : fStatus === 'failed' ? '✗' : fStatus === 'processing' ? '⟳' : '○';
                const fClass = fStatus === 'completed' ? 'success' : fStatus === 'failed' ? 'error' : fStatus === 'processing' ? 'processing' : 'pending';
                html += `<div class="ocr-file-status ocr-file--${fClass}">
                    <span class="ocr-file-icon">${fIcon}</span>
                    <span class="ocr-file-name">${this._escapeHtml(f.original_filename || f.filename || '')}</span>
                    ${f.question_count != null ? `<span class="ocr-file-count">${f.question_count} 題</span>` : ''}
                    ${f.error ? `<span class="ocr-file-error">${this._escapeHtml(f.error)}</span>` : ''}
                </div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;
    },

    _renderQuestionEditor() {
        const container = document.getElementById('examQuestionEditor');
        if (!container) return;

        const questions = this.state.recognizedQuestions;
        const totalPoints = questions.reduce((sum, q) => q.question_type !== 'passage' ? sum + (parseFloat(q.points) || 0) : sum, 0);

        const passageCount = questions.filter(q => q.question_type === 'passage').length;
        const questionCount = questions.length - passageCount;
        let html = `<div class="question-editor-toolbar">
            <span class="question-editor-count">${passageCount > 0 ? `${passageCount} 段資料 + ` : ''}共 ${questionCount} 題，總分 ${totalPoints} 分</span>
            <label class="question-filter-toggle">
                <input type="checkbox" id="showLowConfidence" onchange="AssignmentApp._filterQuestions()"> 只看低置信度
            </label>
            <button class="btn btn-outline btn-sm" onclick="AssignmentApp._addQuestion()">+ 添加題目</button>
        </div>`;

        // Group by source_page
        const groups = {};
        questions.forEach((q, i) => {
            const key = q.source_page ? `第 ${q.source_page} 頁` : '未分頁';
            if (!groups[key]) groups[key] = [];
            groups[key].push({ ...q, _index: i });
        });

        for (const [groupName, items] of Object.entries(groups)) {
            html += `<div class="question-group">
                <div class="question-group-title">${groupName}</div>`;
            for (const q of items) {
                const i = q._index;
                const isPassage = q.question_type === 'passage';
                const isFillBlank = q.question_type === 'fill_blank';
                const confClass = q.ocr_confidence != null && q.ocr_confidence < 0.7 ? 'low-confidence' : '';
                const passageClass = isPassage ? 'passage-card' : '';
                const sourceHints = [];
                if (q.source_page) sourceHints.push(`第 ${q.source_page} 頁`);
                if (q.ocr_confidence != null) sourceHints.push(`置信度 ${(q.ocr_confidence * 100).toFixed(0)}%`);
                if (q.metadata?.has_math_formula || q.has_math_formula) sourceHints.push('含公式');

                const pointsReadonly = isFillBlank ? 'readonly class="q-points q-points-readonly" title="總分由填空項自動匯總"' : 'class="q-points" title="分值"';

                html += `<div class="question-card ${confClass} ${passageClass}" data-index="${i}" id="qcard_${i}">
                    <div class="question-card-header">
                        <div class="question-card-row1">
                            <input type="text" class="q-number" value="${this._escapeAttr(q.question_number || '')}" placeholder="${isPassage ? '資料編號' : '題號'}" title="${isPassage ? '資料編號' : '題號'}">
                            ${isPassage ? '<span class="passage-badge">資料</span>' : `<input type="number" ${pointsReadonly} value="${q.points != null ? q.points : ''}" placeholder="分值" min="0" step="0.5">`}
                            <select class="q-type" title="題型" onchange="AssignmentApp._onQuestionTypeChange(${i}, this.value)">
                                <option value="passage" ${q.question_type === 'passage' ? 'selected' : ''}>資料段落</option>
                                <option value="open" ${q.question_type === 'open' ? 'selected' : ''}>開放題</option>
                                <option value="multiple_choice" ${q.question_type === 'multiple_choice' ? 'selected' : ''}>選擇題</option>
                                <option value="fill_blank" ${q.question_type === 'fill_blank' ? 'selected' : ''}>填空題</option>
                                <option value="true_false" ${q.question_type === 'true_false' ? 'selected' : ''}>判斷題</option>
                            </select>
                            <button class="question-delete-btn" onclick="AssignmentApp._removeQuestion(${i})" title="刪除">&times;</button>
                        </div>
                        ${sourceHints.length > 0 ? `<div class="question-source-hints">${sourceHints.join(' | ')}</div>` : ''}
                    </div>
                    <div class="question-card-body">
                        <label>${isPassage ? '資料內容' : '題目'}</label>
                        <textarea class="q-text" rows="${isPassage ? 5 : 3}" placeholder="${isPassage ? '資料/段落內容 (表格、文字等)' : '題目內容'}">${this._escapeHtml(q.question_text || '')}</textarea>
                        ${isPassage ? '' : `<div class="question-answer-row">
                            <div class="question-answer-field">
                                <label>答案</label>
                                <textarea class="q-answer" rows="2" placeholder="參考答案">${this._escapeHtml(q.answer_text || '')}</textarea>
                            </div>
                            <div class="question-answer-source">
                                <span class="answer-source-badge source-${q.answer_source || 'missing'}">${
                                    { extracted: '已識別', inferred: '推斷', missing: '無答案', manual: '手動' }[q.answer_source || 'missing'] || '未知'
                                }</span>
                            </div>
                        </div>`}
                        ${isFillBlank ? this._renderBlanksEditor(q, i) : ''}
                    </div>
                </div>`;
            }
            html += `</div>`;
        }

        container.innerHTML = html;
    },

    _filterQuestions() {
        const showLow = document.getElementById('showLowConfidence')?.checked;
        document.querySelectorAll('.question-card').forEach(card => {
            if (showLow) {
                card.style.display = card.classList.contains('low-confidence') ? '' : 'none';
            } else {
                card.style.display = '';
            }
        });
    },

    _addQuestion(type = 'open') {
        const newQ = {
            question_number: '',
            question_text: '',
            answer_text: '',
            answer_source: 'manual',
            points: null,
            question_type: type,
            is_ai_extracted: false,
            ocr_confidence: null,
            metadata: null,
        };
        if (type === 'fill_blank') {
            newQ.metadata = { blank_mode: 'inline', blanks: [] };
        }
        this.state.recognizedQuestions.push(newQ);
        this._renderQuestionEditor();
        const container = document.getElementById('examQuestionEditor');
        if (container) container.scrollTop = container.scrollHeight;
    },

    _addPassage() {
        this._addQuestion('passage');
    },

    _removeQuestion(index) {
        this.state.recognizedQuestions.splice(index, 1);
        this._renderQuestionEditor();
    },

    // ── State sync: DOM → state before mutations ──
    _syncQuestionFromDOM(qi) {
        const card = document.getElementById(`qcard_${qi}`);
        if (!card) return;
        const q = this.state.recognizedQuestions[qi];
        if (!q) return;
        q.question_number = card.querySelector('.q-number')?.value?.trim() || '';
        q.question_text = card.querySelector('.q-text')?.value?.trim() || '';
        const answerEl = card.querySelector('.q-answer');
        if (answerEl) q.answer_text = answerEl.value?.trim() || '';
        // points: only sync if NOT fill_blank (fill_blank auto-sums)
        if (q.question_type !== 'fill_blank') {
            const ptsEl = card.querySelector('.q-points');
            if (ptsEl && ptsEl.value) q.points = parseFloat(ptsEl.value);
        }
    },

    // ── Blanks editor ──
    _renderBlanksEditor(q, qi) {
        const blanks = q.metadata?.blanks || [];
        const blankMode = q.metadata?.blank_mode || 'inline';
        const templateText = q.metadata?.template_text || '';
        const totalPts = blanks.reduce((s, b) => s + (parseFloat(b.points) || 0), 0);

        let html = `<div class="blanks-editor" data-qi="${qi}">
            <div class="blanks-editor-header">
                <label>填空項目 (共 ${blanks.length} 項，合計 ${totalPts} 分)</label>
                <button class="btn btn-outline btn-xs" onclick="AssignmentApp._addBlank(${qi})">+ 添加空格</button>
            </div>
            <select class="blank-mode-select" onchange="AssignmentApp._onBlankModeChange(${qi}, this.value)">
                <option value="inline" ${blankMode === 'inline' ? 'selected' : ''}>行內填空</option>
                <option value="section" ${blankMode === 'section' ? 'selected' : ''}>分項答題</option>
                <option value="mixed" ${blankMode === 'mixed' ? 'selected' : ''}>混合模式</option>
            </select>`;

        // 模板文字編輯區
        html += `<div class="template-text-editor">
            <label>模板文字 <span style="font-weight:normal;color:#888;">（用 <code>{{b1}}</code> 標記空格位置，學生將在原文中作答）</span></label>
            <textarea class="template-text-input" rows="4" placeholder="例：製造業的平均工時為 {{b1}} 小時，建造業為 {{b2}} 小時。"
                oninput="AssignmentApp._onTemplateTextChange(${qi}, this.value)">${this._escapeHtml(templateText)}</textarea>
            <button class="btn btn-outline btn-xs" style="margin-top:4px;" onclick="AssignmentApp._syncBlanksFromTemplate(${qi})">同步空格</button>
        </div>`;

        blanks.forEach((b, bi) => {
            const inputType = b.input_type || 'short_text';
            html += `<div class="blank-item" data-bi="${bi}">
                <span class="blank-id-badge">${b.id || `b${bi+1}`}</span>
                <input type="text" class="blank-label" value="${this._escapeAttr(b.label || '')}"
                    placeholder="標籤（可選）"
                    oninput="AssignmentApp._onBlankInput(${qi}, ${bi}, 'label', this.value)">
                <select class="blank-input-type" onchange="AssignmentApp._onBlankInput(${qi}, ${bi}, 'input_type', this.value)">
                    <option value="short_text" ${inputType === 'short_text' ? 'selected' : ''}>短文字</option>
                    <option value="long_text" ${inputType === 'long_text' ? 'selected' : ''}>長文字</option>
                </select>
                <input type="number" class="blank-points" value="${b.points != null ? b.points : ''}"
                    placeholder="分值" min="0" step="0.5"
                    oninput="AssignmentApp._onBlankInput(${qi}, ${bi}, 'points', this.value)">
                <input type="text" class="blank-answer" value="${this._escapeAttr(b.answer || '')}"
                    placeholder="預期答案"
                    oninput="AssignmentApp._onBlankInput(${qi}, ${bi}, 'answer', this.value)">
                <button class="blank-delete-btn" onclick="AssignmentApp._removeBlank(${qi}, ${bi})" title="刪除">&times;</button>
            </div>`;
        });

        html += `<div class="blanks-editor-hint">題目總分將自動等於所有子項分值之和</div>
        </div>`;
        return html;
    },

    _onBlankInput(qi, bi, field, value) {
        const q = this.state.recognizedQuestions[qi];
        if (!q?.metadata?.blanks?.[bi]) return;
        if (field === 'points') {
            q.metadata.blanks[bi].points = value ? parseFloat(value) : null;
            // Auto-sum and update display
            const totalPts = q.metadata.blanks.reduce((s, b) => s + (parseFloat(b.points) || 0), 0);
            q.points = totalPts;
            // Update points display in header
            const ptsEl = document.querySelector(`#qcard_${qi} .q-points`);
            if (ptsEl) ptsEl.value = totalPts;
            // Update blanks header count
            const headerLabel = document.querySelector(`#qcard_${qi} .blanks-editor-header label`);
            if (headerLabel) headerLabel.textContent = `填空項目 (共 ${q.metadata.blanks.length} 項，合計 ${totalPts} 分)`;
        } else if (field === 'input_type') {
            q.metadata.blanks[bi].input_type = value || 'short_text';
        } else {
            q.metadata.blanks[bi][field] = value?.trim() || '';
        }
    },

    _onBlankModeChange(qi, mode) {
        const q = this.state.recognizedQuestions[qi];
        if (!q?.metadata) return;
        q.metadata.blank_mode = mode;
    },

    _onTemplateTextChange(qi, value) {
        const q = this.state.recognizedQuestions[qi];
        if (!q) return;
        if (!q.metadata) q.metadata = { blank_mode: 'mixed' };
        q.metadata.template_text = value || '';
    },

    _syncBlanksFromTemplate(qi) {
        this._syncQuestionFromDOM(qi);
        const q = this.state.recognizedQuestions[qi];
        if (!q?.metadata) return;
        const tpl = q.metadata.template_text || '';
        // 從模板中提取所有 {{bN}} 佔位符
        const matches = [...tpl.matchAll(/\{\{(b\d+)\}\}/g)];
        const tplIds = [...new Set(matches.map(m => m[1]))];
        // 按數字排序
        tplIds.sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
        // 建立現有 blanks 的 map
        const existingMap = {};
        (q.metadata.blanks || []).forEach(b => { existingMap[b.id] = b; });
        // 同步：保留已存在的 blank，新增缺失的
        const synced = tplIds.map(id => existingMap[id] || { id, label: '', input_type: 'short_text', points: 0, answer: '' });
        q.metadata.blanks = synced;
        // 自動設為 mixed 模式
        if (tpl && q.metadata.blank_mode === 'inline') q.metadata.blank_mode = 'mixed';
        q.points = synced.reduce((s, b) => s + (parseFloat(b.points) || 0), 0);
        this._renderQuestionEditor();
        UIModule.toast(`已從模板同步 ${synced.length} 個空格`, 'success');
    },

    _addBlank(qi) {
        this._syncQuestionFromDOM(qi);
        const q = this.state.recognizedQuestions[qi];
        if (!q) return;
        if (!q.metadata) q.metadata = { blank_mode: 'inline' };
        if (!q.metadata.blanks) q.metadata.blanks = [];
        const nextId = `b${q.metadata.blanks.length + 1}`;
        q.metadata.blanks.push({ id: nextId, label: '', input_type: 'short_text', points: null, answer: '' });
        this._renderQuestionEditor();
    },

    _removeBlank(qi, bi) {
        this._syncQuestionFromDOM(qi);
        const q = this.state.recognizedQuestions[qi];
        if (!q?.metadata?.blanks) return;
        q.metadata.blanks.splice(bi, 1);
        // Recalc points
        q.points = q.metadata.blanks.reduce((s, b) => s + (parseFloat(b.points) || 0), 0);
        this._renderQuestionEditor();
    },

    // ── Question type change ──
    _onQuestionTypeChange(qi, newType) {
        this._syncQuestionFromDOM(qi);
        const q = this.state.recognizedQuestions[qi];
        if (!q) return;
        const oldType = q.question_type;

        // Switching away from fill_blank: confirm and clear blanks
        if (oldType === 'fill_blank' && newType !== 'fill_blank') {
            if (q.metadata?.blanks?.length > 0) {
                if (!confirm('切換題型將清除所有填空項，確定？')) {
                    // Revert select
                    const sel = document.querySelector(`#qcard_${qi} .q-type`);
                    if (sel) sel.value = 'fill_blank';
                    return;
                }
            }
            if (q.metadata) {
                delete q.metadata.blanks;
                delete q.metadata.blank_mode;
                if (Object.keys(q.metadata).length === 0) q.metadata = null;
            }
        }

        q.question_type = newType;

        // Switching to fill_blank: init blanks
        if (newType === 'fill_blank') {
            if (!q.metadata) q.metadata = {};
            if (!q.metadata.blanks) q.metadata.blanks = [];
            q.metadata.blank_mode = q.metadata.blank_mode || 'inline';
        }

        this._renderQuestionEditor();
    },

    _collectQuestions() {
        const cards = document.querySelectorAll('.question-card');
        const questions = [];
        cards.forEach(card => {
            const i = parseInt(card.dataset.index);
            const orig = this.state.recognizedQuestions[i] || {};
            const text = card.querySelector('.q-text')?.value?.trim();
            if (!text) return; // skip empty
            const qType = card.querySelector('.q-type')?.value || 'open';
            const isFillBlank = qType === 'fill_blank';

            // For fill_blank, metadata is state-driven (already updated via oninput)
            const metadata = isFillBlank ? (orig.metadata || null) : (orig.metadata || null);

            const question = {
                question_number: card.querySelector('.q-number')?.value?.trim() || '',
                question_text: text,
                answer_text: card.querySelector('.q-answer')?.value?.trim() || '',
                answer_source: orig.answer_source || 'missing',
                points: card.querySelector('.q-points')?.value ? parseFloat(card.querySelector('.q-points').value) : null,
                question_type: qType,
                is_ai_extracted: orig.is_ai_extracted ?? true,
                source_batch_id: orig.source_batch_id || this.state.examBatchId || null,
                source_page: orig.source_page || null,
                ocr_confidence: orig.ocr_confidence || null,
                metadata: metadata,
            };

            // fill_blank: auto-sum from blanks
            if (isFillBlank && question.metadata?.blanks?.length) {
                question.points = question.metadata.blanks.reduce((s, b) => s + (parseFloat(b.points) || 0), 0);
            }

            questions.push(question);
        });
        return questions;
    },

    _escapeAttr(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },

    // ---- Attachment Helpers ----
    _setupAttachmentZone() {
        const zone = document.getElementById('attachmentZone');
        const input = document.getElementById('attachmentInput');
        if (!zone || !input) return;
        zone.onclick = () => input.click();
        input.onchange = (e) => { this._addPendingAttachments(e.target.files); input.value = ''; };
        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => {
            e.preventDefault(); zone.classList.remove('dragover');
            this._addPendingAttachments(e.dataTransfer.files);
        };
    },

    _addPendingAttachments(fileList) {
        const total = this.state.pendingAttachments.length + this.state.existingAttachments.filter(a => !this.state.deletedAttachmentIds.includes(a.id)).length;
        for (const f of fileList) {
            if (total + this.state.pendingAttachments.length >= 10) { UIModule.toast('附件最多 10 個', 'warning'); break; }
            this.state.pendingAttachments.push(f);
        }
        this._renderAttachmentLists();
    },

    removePendingAttachment(index) {
        this.state.pendingAttachments.splice(index, 1);
        this._renderAttachmentLists();
    },

    markDeleteAttachment(id) {
        this.state.deletedAttachmentIds.push(id);
        this._renderAttachmentLists();
    },

    _renderAttachmentLists() {
        // Existing attachments (from server)
        const existingEl = document.getElementById('existingAttachments');
        if (existingEl) {
            const visible = this.state.existingAttachments.filter(a => !this.state.deletedAttachmentIds.includes(a.id));
            existingEl.innerHTML = visible.map(a =>
                `<div class="file-item">
                    <span class="file-item-icon">${AssignmentUI.ICON.clip}</span>
                    <div class="file-item-info">
                        <div class="name">${a.original_name}</div>
                        <div class="size">${AssignmentUI.formatFileSize(a.file_size)}</div>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.markDeleteAttachment(${a.id})" title="移除">✕</button>
                </div>`
            ).join('');
        }
        // Pending attachments (new files)
        const pendingEl = document.getElementById('pendingAttachments');
        if (pendingEl) {
            pendingEl.innerHTML = this.state.pendingAttachments.map((f, i) =>
                `<div class="file-item">
                    <span class="file-item-icon">${AssignmentUI.ICON.clip}</span>
                    <div class="file-item-info">
                        <div class="name">${f.name}</div>
                        <div class="size">${AssignmentUI.formatFileSize(f.size)}</div>
                    </div>
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.removePendingAttachment(${i})" title="移除">✕</button>
                </div>`
            ).join('');
        }
    },

    async _syncAttachments(assignmentId) {
        // Delete marked attachments
        for (const id of this.state.deletedAttachmentIds) {
            await AssignmentAPI.deleteAttachment(assignmentId, id);
        }
        // Upload new attachments
        if (this.state.pendingAttachments.length > 0) {
            await AssignmentAPI.uploadAttachments(assignmentId, this.state.pendingAttachments);
        }
    },

    async saveAsDraft() {
        const data = this._getFormData();
        if (!data.title) { UIModule.toast('請輸入標題', 'warning'); return; }

        let resp;
        if (this.state.editingId) {
            resp = await AssignmentAPI.updateAssignment(this.state.editingId, data);
        } else {
            resp = await AssignmentAPI.createAssignment(data);
        }

        if (resp?.success) {
            const asgId = this.state.editingId || resp.data?.id;
            if (asgId && (this.state.pendingAttachments.length > 0 || this.state.deletedAttachmentIds.length > 0)) {
                await this._syncAttachments(asgId);
            }
            UIModule.toast('草稿已保存', 'success');
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            UIModule.toast('保存失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },

    async saveAndPublish() {
        const data = this._getFormData();
        if (!data.title) { UIModule.toast('請輸入標題', 'warning'); return; }
        // Validate form questions before publishing
        if (data.assignment_type === 'form') {
            if (!data.questions || data.questions.length === 0) { UIModule.toast('表單作業至少需要 1 道題目', 'warning'); return; }
            const err = FormBuilder.validate();
            if (err) { UIModule.toast(err, 'warning'); return; }
        }

        let resp;
        if (this.state.editingId) {
            resp = await AssignmentAPI.updateAssignment(this.state.editingId, data);
            if (resp?.success) {
                // Sync attachments before publishing
                if (this.state.pendingAttachments.length > 0 || this.state.deletedAttachmentIds.length > 0) {
                    await this._syncAttachments(this.state.editingId);
                }
                resp = await AssignmentAPI.publishAssignment(this.state.editingId);
            }
        } else {
            resp = await AssignmentAPI.createAssignment(data);
            if (resp?.success) {
                const newId = resp.data?.id;
                if (newId) {
                    // Sync attachments before publishing
                    if (this.state.pendingAttachments.length > 0 || this.state.deletedAttachmentIds.length > 0) {
                        await this._syncAttachments(newId);
                    }
                    resp = await AssignmentAPI.publishAssignment(newId);
                }
            }
        }

        if (resp?.success) {
            UIModule.toast('作業已發布', 'success');
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            UIModule.toast('發布失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },

    async editAssignment(id) {
        this.openCreateModal(id);
    },

    async publishAssignment(id) {
        if (!await UIModule.confirm('確定要發布此作業？', '發布作業')) return;
        const resp = await AssignmentAPI.publishAssignment(id);
        if (resp?.success) {
            UIModule.toast('作業已發布', 'success');
            this.viewAssignment(id);
        } else {
            UIModule.toast('發布失敗', 'error');
        }
    },

    async closeAssignment(id) {
        if (!await UIModule.confirm('確定要關閉此作業？關閉後學生將無法提交。', '關閉作業')) return;
        const resp = await AssignmentAPI.closeAssignment(id);
        if (resp?.success) {
            UIModule.toast('作業已關閉', 'success');
            this.viewAssignment(id);
        } else {
            UIModule.toast('關閉失敗', 'error');
        }
    },

    async deleteAssignment(id) {
        if (!await UIModule.confirm('確定要刪除此作業？此操作不可撤銷。', '刪除作業')) return;
        const resp = await AssignmentAPI.deleteAssignment(id);
        if (resp?.success) {
            UIModule.toast('作業已刪除', 'success');
            this.showTeacherList();
        } else {
            UIModule.toast('刪除失敗', 'error');
        }
    },

    // ---- Student ----
    async showStudentList() {
        this.state.phase = 'list';
        this.setBreadcrumb([{ label: '我的作業' }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="assignment-grid">${AssignmentUI.skeletonCards(3)}</div>`;

        const resp = await AssignmentAPI.listMyAssignments();
        if (!resp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }

        this._studentAssignments = resp.data || [];
        this.renderSidebar();
        this._sidebarFilter('all');
    },

    async viewStudentAssignment(id) {
        this.state.phase = 'student-detail';
        this.state.currentAssignment = id;

        const main = document.getElementById('mainContent');
        main.innerHTML = AssignmentUI.skeletonDetail();

        const resp = await AssignmentAPI.getMyAssignment(id);
        if (!resp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }

        const asg = resp.data;
        const sub = asg.my_submission;

        const isForm = asg.assignment_type === 'form';
        const isExam = asg.assignment_type === 'exam';
        const hasQuestions = isForm || isExam;

        this.setBreadcrumb([
            { label: '我的作業', action: 'AssignmentApp.showStudentList()' },
            { label: asg.title }
        ]);

        // For form/exam type, hide file upload button
        if (hasQuestions) {
            this.setHeaderActions('');
        } else {
            this.setHeaderActions(
                !sub ? `<button class="btn btn-primary" onclick="AssignmentApp.openSubmitModal(${id})">${AssignmentUI.ICON.upload} 提交作業</button>` :
                sub.status === 'submitted' ? `<button class="btn btn-warning" onclick="AssignmentApp.openSubmitModal(${id})">重新提交</button>` : ''
            );
        }

        const deadlineWarn = !sub ? AssignmentUI.deadlineWarning(asg.deadline) : '';
        const questionsForCount = (asg.questions || []).filter(q => q.question_type !== 'passage');
        let html = `<div class="detail-hero fade-in">
            <h3 style="margin:0;">${asg.title}</h3>
            ${asg.description ? `<p style="color:var(--text-secondary);margin-top:6px;font-size:14px;">${asg.description}</p>` : ''}
            ${(asg.attachments && asg.attachments.length) ? `<div style="margin-top:12px;">
                <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;">${AssignmentUI.ICON.clip} 附件</div>
                ${AssignmentUI.renderFiles(asg.attachments)}
            </div>` : ''}
            <div class="detail-stats" style="margin-top:12px;">
                <div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.user}</div>
                    <div><div class="stat-value">${asg.created_by_name || ''}</div><div class="stat-label">教師</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.clock}</div>
                    <div><div class="stat-value">${AssignmentUI.formatDate(asg.deadline)} ${deadlineWarn}</div><div class="stat-label">截止日</div></div>
                </div>
                ${!hasQuestions ? `<div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.clip}</div>
                    <div><div class="stat-value">最多 ${asg.max_files || 5} 個</div><div class="stat-label">文件限制</div></div>
                </div>` : `<div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div><div class="stat-value">${questionsForCount.length} 題</div><div class="stat-label">題目數</div></div>
                </div>`}
            </div>
        </div>`;

        // ---- Form type: student form view ----
        if (isForm) {
            const questions = asg.questions || [];
            if (sub) {
                // Already submitted — show read-only results
                html += `<div class="form-section">
                    <h3>我的作答 ${AssignmentUI.badge(sub.status)}</h3>
                    <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                        提交時間: ${AssignmentUI.formatDate(sub.submitted_at)}
                        ${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}
                    </div>
                    ${sub.score != null ? `<div class="student-score-hero"><div class="score-big">${sub.score}</div><div class="score-max">/ ${asg.max_score || '—'}</div></div>` : ''}
                </div>
                <div class="form-section">
                    ${FormStudentView.renderSubmittedView(questions, sub.answers || [], sub.answer_files || [])}
                </div>`;
            } else {
                // Not submitted — render form for answering
                FormStudentView._currentQuestions = questions;
                html += `<div class="form-section">${FormStudentView.renderForm(id, questions)}</div>`;
            }
            main.innerHTML = html;
            if (!sub) FormStudentView._updateProgress();
            return;
        }

        // ---- Exam type: student exam view ----
        if (isExam) {
            const questions = asg.questions || [];
            const deadlineDt = asg.deadline ? new Date(asg.deadline) : null;
            const canEdit = !deadlineDt || deadlineDt > new Date() || asg.allow_late;
            const isGraded = sub && (sub.status === 'graded' || sub.score != null);

            if (sub && !(canEdit && !isGraded && ExamStudentView._editMode)) {
                // Show submitted view
                html += `<div class="form-section">
                    <h3>我的作答 ${AssignmentUI.badge(sub.status)}</h3>
                    <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                        提交時間: ${AssignmentUI.formatDate(sub.submitted_at)}
                        ${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}
                    </div>
                    ${sub.score != null ? `<div class="student-score-hero"><div class="score-big">${sub.score}</div><div class="score-max">/ ${asg.max_score || '—'}</div></div>` : ''}
                    ${canEdit && !isGraded ? `<button class="btn btn-outline" style="margin-top:8px;" onclick="ExamStudentView._editMode=true;AssignmentApp.viewStudentAssignment(${id})">修改作答</button>` : ''}
                </div>
                <div class="form-section">
                    ${ExamStudentView.renderSubmittedView(questions, sub.answers || [])}
                </div>`;
                main.innerHTML = html;
            } else {
                // Render editable form (new or editing existing)
                if (sub && ExamStudentView._editMode) {
                    // Pre-fill drafts from existing answers
                    ExamStudentView._prefillFromAnswers(id, questions, sub.answers || []);
                }
                ExamStudentView._currentQuestions = questions;
                html += `<div class="form-section">${ExamStudentView.renderForm(id, questions)}</div>`;
                main.innerHTML = html;
                ExamStudentView._updateProgress();
                _initAutoGrow(main);
            }
            return;
        }

        // ---- File upload type (original flow) ----
        if (sub) {
            html += `<div class="form-section">
                <h3>我的提交 ${AssignmentUI.badge(sub.status)}</h3>
                <p style="margin:8px 0;color:var(--text-secondary);">${sub.content || '無備註'}</p>
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                    提交時間: ${AssignmentUI.formatDate(sub.submitted_at)}
                    ${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}
                </div>
                ${AssignmentUI.renderFiles(sub.files)}
                <div id="codePreviewArea"></div>
                <div id="swiftOutputArea"></div>
                <div id="htmlPreviewArea"></div>
            </div>`;

            if (sub.status === 'graded') {
                const rubricItems = asg.rubric_items || [];
                const scores = sub.rubric_scores || [];
                const scoreMap = {};
                const levelMap = {};
                scores.forEach(s => {
                    scoreMap[s.rubric_item_id] = s.points;
                    if (s.selected_level) levelMap[s.rubric_item_id] = s.selected_level;
                });
                const rType = asg.rubric_type || 'points';

                html += `<div class="form-section fade-in">
                    <h3>${AssignmentUI.ICON.chart} 成績</h3>`;

                if (rType !== 'competency') {
                    const pctScore = asg.max_score > 0 ? Math.round((sub.score || 0) / asg.max_score * 100) : 0;
                    const scoreColor = pctScore >= 80 ? 'var(--color-success)' : pctScore >= 60 ? 'var(--color-warning)' : 'var(--color-error)';
                    html += `<div class="student-score-hero">
                        <div class="score-big" style="color:${scoreColor}">${sub.score != null ? sub.score : '—'}</div>
                        ${asg.max_score != null ? `<div class="score-max">/ ${asg.max_score}</div>` : ''}
                    </div>`;
                }

                if (rType === 'competency') {
                    html += '<div style="margin-top:12px;">';
                    rubricItems.forEach(item => {
                        const level = levelMap[item.id] || '—';
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                            <span style="flex:1;font-size:14px;">${item.title}</span>
                            <span class="badge" style="background:var(--brand-light);color:var(--brand);">${level}</span>
                        </div>`;
                    });
                    html += '</div>';
                } else if (rType === 'checklist') {
                    html += '<div style="margin-top:12px;">';
                    rubricItems.forEach(item => {
                        const passed = (scoreMap[item.id] || 0) > 0;
                        const icon = passed
                            ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" fill="var(--color-success)" opacity="0.12"/><polyline points="9 12 11.5 14.5 16 9.5"/></svg>'
                            : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="4" fill="var(--color-error)" opacity="0.12"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>';
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                            ${icon}
                            <span style="flex:1;font-size:14px;">${item.title}</span>
                        </div>`;
                    });
                    html += '</div>';
                } else if (rType === 'holistic') {
                    const selLevel = scores[0]?.selected_level || '';
                    if (selLevel) {
                        html += `<div style="margin-top:8px;"><span class="badge" style="background:var(--brand-light);color:var(--brand);padding:4px 12px;font-size:14px;">${selLevel}</span></div>`;
                    }
                } else if (rubricItems.length) {
                    html += '<div style="margin-top:12px;">';
                    rubricItems.forEach(item => {
                        const pts = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '—';
                        const maxPts = item.max_points || 0;
                        const pct = pts !== '—' && maxPts > 0 ? (pts / maxPts * 100) : 0;
                        const color = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-error)';
                        const selLevel = levelMap[item.id];
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                            <span style="flex:1;font-size:14px;">${item.title}${selLevel ? ' <span class="badge" style="background:rgba(0,0,0,0.04);font-size:11px;">'+selLevel+'</span>' : ''}</span>
                            <span style="color:${color};font-weight:600;">${pts}</span>
                            ${maxPts > 0 ? `<span style="color:var(--text-tertiary);font-size:13px;">/ ${maxPts}</span>` : ''}
                            ${rType === 'weighted_pct' && item.weight ? `<span style="color:var(--text-tertiary);font-size:12px;">(${item.weight}%)</span>` : ''}
                        </div>`;
                    });
                    html += '</div>';
                }

                if (sub.feedback) {
                    html += `<div class="teacher-note">
                        <div class="teacher-note-header">${AssignmentUI.ICON.edit} 教師評語</div>
                        <p>${sub.feedback}</p>
                    </div>`;
                }
                html += '</div>';

                // AI 問答助教入口（只在已批改時顯示）
                html += `<div class="form-section fade-in asg-ai-entry">
                    <div class="asg-ai-entry__header">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--brand)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-3 3-3-3c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2"/><path d="M8 21h8"/></svg>
                        <h3 style="margin:0;">AI 問答助教</h3>
                    </div>
                    <p style="color:var(--text-secondary);font-size:14px;margin:8px 0 16px;">
                        對這份作業有疑問？AI 助教可以幫你分析得分、解釋知識點
                    </p>
                    <button class="btn btn-primary" onclick="AssignmentApp.openAsgAiChat()">
                        開始提問
                    </button>
                </div>`;
            }
        }

        main.innerHTML = html;
    },

    // ---- Submit Modal ----
    openSubmitModal(assignmentId) {
        this.state.currentAssignment = assignmentId;
        this.state.selectedFiles = [];
        document.getElementById('submitContent').value = '';
        document.getElementById('selectedFiles').innerHTML = '';
        document.getElementById('submitModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        // Focus first input after animation
        setTimeout(() => document.getElementById('submitContent')?.focus(), 300);

        // Setup upload zone
        const zone = document.getElementById('uploadZone');
        const input = document.getElementById('fileInput');

        zone.onclick = () => input.click();
        input.onchange = (e) => this._addFiles(e.target.files);

        zone.ondragover = (e) => { e.preventDefault(); zone.classList.add('dragover'); };
        zone.ondragleave = () => zone.classList.remove('dragover');
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.classList.remove('dragover');
            this._addFiles(e.dataTransfer.files);
        };
    },

    closeSubmitModal() {
        document.getElementById('submitModal').classList.remove('active');
        document.body.style.overflow = '';
    },

    _addFiles(fileList) {
        for (const f of fileList) {
            if (this.state.selectedFiles.length >= 5) { UIModule.toast('最多 5 個文件', 'warning'); break; }
            this.state.selectedFiles.push(f);
        }
        this._renderSelectedFiles();
    },

    _renderSelectedFiles() {
        const container = document.getElementById('selectedFiles');
        container.innerHTML = this.state.selectedFiles.map((f, i) => {
            return `<div class="file-item">
                <span class="file-item-icon">${AssignmentUI.ICON.clip}</span>
                <div class="file-item-info">
                    <div class="name">${f.name}</div>
                    <div class="size">${AssignmentUI.formatFileSize(f.size)}</div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="AssignmentApp.removeFile(${i})">✕</button>
            </div>`;
        }).join('');
    },

    removeFile(index) {
        this.state.selectedFiles.splice(index, 1);
        this._renderSelectedFiles();
    },

    async doSubmit() {
        const btn = document.getElementById('submitBtn');
        btn.disabled = true;
        btn.innerHTML = '<div class="loading-spinner"></div> 提交中...';

        const content = document.getElementById('submitContent').value;
        const files = this.state.selectedFiles;

        const resp = await AssignmentAPI.submitAssignment(
            this.state.currentAssignment, content, files
        );

        btn.disabled = false;
        btn.textContent = '提交';

        if (resp?.success) {
            this.closeSubmitModal();
            UIModule.toast('提交成功', 'success');
            this.viewStudentAssignment(this.state.currentAssignment);
        } else {
            UIModule.toast('提交失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },

    // ---- Code Preview & Swift Run ----
    async viewCode(fileId, filePath, fileName) {
        const area = document.getElementById('codePreviewArea');
        if (!area) return;
        const ext = fileName.split('.').pop().toLowerCase();
        const isHtml = ext === 'html' || ext === 'htm';
        const isSwift = ext === 'swift';
        try {
            const resp = await fetch('/' + filePath, { headers: AssignmentAPI._authHeaders() });
            const text = await resp.text();
            area.innerHTML = `<div class="form-section">
                <div class="html-preview-header">
                    <h3>💻 ${this._escapeHtml(fileName)}</h3>
                    <div class="html-preview-controls">
                        ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${filePath}')">▶ 運行</button>` : ''}
                        ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${filePath}','${this._escapeHtml(fileName)}')">▶ 運行預覽</button>` : ''}
                    </div>
                </div>
                <div class="code-preview">${this._escapeHtml(text)}</div>
            </div>`;
        } catch (e) {
            area.innerHTML = '<p style="color:var(--color-error);">無法載入文件</p>';
        }
    },

    previewImage(url) {
        // 向下兼容：非 inline 模式仍打開新窗口
        this._showImageLightbox(url);
    },

    // ================================================================
    // 文件內嵌預覽系統
    // ================================================================

    _previewObserver: null,

    _initPreviewObserver(files) {
        const blocks = document.querySelectorAll('.file-preview-content[data-loaded="false"]');
        if (!blocks.length) return;

        // 前 2 個文件立即加載
        blocks.forEach((el, i) => {
            if (i < 2) this._loadPreview(el);
        });

        // 其餘用 IntersectionObserver 懶加載
        if (this._previewObserver) this._previewObserver.disconnect();
        this._previewObserver = new IntersectionObserver((entries) => {
            entries.forEach(e => {
                if (e.isIntersecting && e.target.dataset.loaded === 'false') {
                    this._loadPreview(e.target);
                    this._previewObserver.unobserve(e.target);
                }
            });
        }, { rootMargin: '200px' });

        blocks.forEach((el, i) => {
            if (i >= 2) this._previewObserver.observe(el);
        });
    },

    async _loadPreview(el) {
        if (el.dataset.loaded === 'true') return;
        el.dataset.loaded = 'true';

        const block = el.closest('.file-preview-block');
        const fileType = block.dataset.fileType;
        const filePath = block.dataset.filePath;
        const fileId = block.dataset.fileId;
        const ext = block.dataset.fileExt;
        const fileName = block.querySelector('.file-preview-name')?.textContent || '';

        try {
            if (fileType === 'image') {
                el.innerHTML = `<img src="${filePath}" class="file-preview-img" alt="${AssignmentUI._escapeHtml(fileName)}" onclick="AssignmentApp._showImageLightbox('${filePath}')" loading="lazy">`;
            } else if (fileType === 'pdf') {
                el.innerHTML = `<div class="file-preview-pdf-wrapper">
                    <iframe src="${filePath}" class="file-preview-pdf" title="PDF Preview"></iframe>
                    <div class="pdf-fallback">
                        <p>PDF 預覽載入失敗</p>
                        <a class="btn btn-sm btn-outline" href="${filePath}" target="_blank">在新分頁中打開</a>
                        <a class="btn btn-sm btn-outline" href="${filePath}" download>下載文件</a>
                    </div>
                </div>`;
                // 監聽 iframe 加載錯誤
                const iframe = el.querySelector('iframe');
                const fallback = el.querySelector('.pdf-fallback');
                if (iframe) {
                    iframe.addEventListener('error', () => { fallback.style.display = 'block'; iframe.style.display = 'none'; });
                    // 某些瀏覽器 iframe 加載 PDF 不會觸發 error，設超時兜底
                    setTimeout(() => {
                        try { if (!iframe.contentDocument && !iframe.contentWindow) { fallback.style.display = 'block'; } } catch(e) { /* cross-origin ok */ }
                    }, 5000);
                }
            } else if (fileType === 'video') {
                el.innerHTML = `<div class="video-preview-container">
                    <video controls preload="metadata" class="video-preview-player">
                        <source src="${filePath}">您的瀏覽器不支持視頻播放。
                    </video>
                </div>`;
            } else if (fileType === 'code') {
                if (ext === 'html' || ext === 'htm') {
                    el.innerHTML = `<div class="html-preview-container" id="htmlPrev_${fileId}">
                        <iframe src="${filePath}" sandbox="allow-scripts allow-forms" class="html-preview-iframe" title="HTML Preview"></iframe>
                    </div>`;
                } else {
                    // 代碼文件：fetch 文本 + 語法高亮
                    el.innerHTML = '<div class="file-preview-loading"><div class="loading-spinner"></div> 載入代碼中...</div>';
                    const resp = await fetch(filePath, { headers: AssignmentAPI._authHeaders() });
                    const text = await resp.text();
                    const MAX_CODE_SIZE = 50 * 1024; // 50KB
                    const MAX_CODE_LINES = 500;
                    let displayText = text;
                    let truncated = false;
                    if (text.length > MAX_CODE_SIZE) {
                        displayText = text.substring(0, MAX_CODE_SIZE);
                        truncated = true;
                    }
                    const lines = displayText.split('\n');
                    if (lines.length > MAX_CODE_LINES) {
                        displayText = lines.slice(0, MAX_CODE_LINES).join('\n');
                        truncated = true;
                    }
                    el.innerHTML = `<div class="code-preview">${AssignmentUI._escapeHtml(displayText)}</div>
                        ${truncated ? `<div class="file-preview-truncated">已截斷預覽（前 ${MAX_CODE_LINES} 行），完整內容請下載查看</div>` : ''}`;
                }
            } else if (fileType === 'document' || fileType === 'doc' || fileType === 'ppt') {
                // Office 文件：docx/xlsx/pptx 調用後端 API
                const previewableExts = ['docx', 'xlsx', 'pptx'];
                if (previewableExts.includes(ext)) {
                    el.innerHTML = '<div class="file-preview-loading"><div class="loading-spinner"></div> 轉換文件中...</div>';
                    const resp = await fetch(`/api/assignments/files/${fileId}/preview`, {
                        headers: AssignmentAPI._authHeaders()
                    });
                    const json = await resp.json();
                    if (json.success && json.data && json.data.html) {
                        const d = json.data;
                        el.innerHTML = `<div class="file-preview-doc">${d.html}</div>
                            ${d.truncated ? `<div class="file-preview-truncated">已為預覽效能限制顯示部分內容${d.meta && d.meta.rendered_rows ? `（前 ${d.meta.rendered_rows} 行 × ${d.meta.rendered_cols} 列）` : ''}，完整內容請下載查看</div>` : ''}`;
                    } else {
                        const msg = (json.data && json.data.message) || json.message || '預覽失敗';
                        el.innerHTML = `<div class="file-preview-error"><p>${AssignmentUI._escapeHtml(msg)}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>下載文件</a></div>`;
                    }
                } else {
                    // .doc / .ppt 等舊格式
                    el.innerHTML = `<div class="file-preview-error"><p>此格式暫不支持內嵌預覽（.${ext}）</p><a class="btn btn-sm btn-outline" href="${filePath}" download>下載文件</a></div>`;
                }
            } else {
                // archive 等
                el.innerHTML = `<div class="file-preview-error"><p>此文件類型不支持預覽</p><a class="btn btn-sm btn-outline" href="${filePath}" download>下載文件</a></div>`;
            }
        } catch (e) {
            el.innerHTML = `<div class="file-preview-error"><p>預覽載入失敗: ${AssignmentUI._escapeHtml(e.message || '未知錯誤')}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>下載文件</a></div>`;
        }
    },

    // ================================================================
    // AI 問答助教（學生已批改作業）
    // ================================================================

    openAsgAiChat() {
        // 如果窗口已存在，直接顯示
        if (document.getElementById('asgAiWindow')) {
            document.getElementById('asgAiWindow').classList.add('--visible');
            this.state.asgAiWindowVisible = true;
            return;
        }
        this._renderAsgAiWindow();
        this.state.asgAiWindowVisible = true;

        // 如果已選過科目，直接進入聊天模式
        if (this.state.asgAiSubject) {
            this._asgAiShowChat();
        } else {
            this._asgAiShowSubjectPicker();
        }
    },

    _renderAsgAiWindow() {
        const win = document.createElement('div');
        win.id = 'asgAiWindow';
        win.className = 'asg-ai-window --visible';
        win.innerHTML = `
            <div class="asg-ai-window__header" id="asgAiHeader">
                <span class="asg-ai-window__title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-3 3-3-3c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2"/></svg>
                    AI 問答助教
                </span>
                <div class="asg-ai-window__actions">
                    <button class="asg-ai-window__action-btn" id="asgAiExpandBtn" title="放大">&#9634;</button>
                    <button class="asg-ai-window__action-btn" id="asgAiCloseBtn" title="關閉">&#10005;</button>
                </div>
            </div>
            <div class="asg-ai-window__body" id="asgAiBody"></div>
            <div class="asg-ai-window__input-area" id="asgAiInputArea" style="display:none;">
                <textarea class="asg-ai-window__textarea" id="asgAiInput" placeholder="輸入你的問題..." rows="1"></textarea>
                <button class="asg-ai-window__send-btn" id="asgAiSendBtn">&#10148;</button>
            </div>
        `;
        document.body.appendChild(win);

        // 事件綁定
        document.getElementById('asgAiExpandBtn').addEventListener('click', () => this._asgAiToggleExpand());
        document.getElementById('asgAiCloseBtn').addEventListener('click', () => this._asgAiClose());
        document.getElementById('asgAiSendBtn').addEventListener('click', () => this._asgAiSend());
        document.getElementById('asgAiInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._asgAiSend();
            }
        });

        // 拖拽
        this._asgAiSetupDrag();
    },

    _asgAiSetupDrag() {
        const win = document.getElementById('asgAiWindow');
        const header = document.getElementById('asgAiHeader');
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
            document.body.style.userSelect = '';
        });
    },

    _asgAiToggleExpand() {
        const win = document.getElementById('asgAiWindow');
        if (!win) return;
        const expanded = win.classList.toggle('--expanded');
        const btn = document.getElementById('asgAiExpandBtn');
        if (btn) {
            btn.innerHTML = expanded ? '&#9635;' : '&#9634;';
            btn.title = expanded ? '縮小' : '放大';
        }
    },

    _asgAiClose() {
        const win = document.getElementById('asgAiWindow');
        if (win) win.classList.remove('--visible');
        this.state.asgAiWindowVisible = false;

        // 顯示 FAB 按鈕
        let fab = document.getElementById('asgAiFab');
        if (!fab) {
            fab = document.createElement('button');
            fab.id = 'asgAiFab';
            fab.className = 'asg-ai-fab';
            fab.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a7 7 0 0 1 7 7c0 3-2 5.5-4 7l-3 3-3-3c-2-1.5-4-4-4-7a7 7 0 0 1 7-7z"/><circle cx="12" cy="9" r="2"/></svg>';
            fab.onclick = () => this.openAsgAiChat();
            document.body.appendChild(fab);
        }
        fab.style.display = 'flex';
    },

    async _asgAiShowSubjectPicker() {
        const body = document.getElementById('asgAiBody');
        if (!body) return;
        const inputArea = document.getElementById('asgAiInputArea');
        if (inputArea) inputArea.style.display = 'none';

        body.innerHTML = '<div class="asg-ai-loading"><div class="loading-spinner"></div> 載入科目...</div>';

        try {
            const resp = await fetch('/api/subjects', {
                headers: AssignmentAPI._authHeaders()
            });
            const data = await resp.json();
            const subjects = data.subjects || data.data?.subjects || {};

            let cards = '';
            for (const [code, info] of Object.entries(subjects)) {
                const name = info.name || code;
                const icon = info.icon || '📚';
                cards += `<button class="asg-ai-subject-card" onclick="AssignmentApp._asgAiSelectSubject('${code}')">
                    <span class="asg-ai-subject-icon">${icon}</span>
                    <span class="asg-ai-subject-name">${AssignmentUI._escapeHtml(name)}</span>
                </button>`;
            }

            if (!cards) {
                cards = '<p style="color:var(--text-tertiary);text-align:center;">暫無可用科目</p>';
            }

            body.innerHTML = `
                <div class="asg-ai-subject-picker">
                    <p class="asg-ai-subject-prompt">請選擇這份作業所屬的科目：</p>
                    <div class="asg-ai-subject-grid">${cards}</div>
                </div>
            `;
        } catch (e) {
            body.innerHTML = '<div class="asg-ai-loading" style="color:var(--color-error);">載入科目失敗</div>';
        }
    },

    _asgAiSelectSubject(code) {
        this.state.asgAiSubject = code;
        this._asgAiShowChat();
    },

    _asgAiShowChat() {
        const body = document.getElementById('asgAiBody');
        const inputArea = document.getElementById('asgAiInputArea');
        if (!body) return;

        body.innerHTML = '<div class="asg-ai-messages" id="asgAiMessages"></div>';
        if (inputArea) inputArea.style.display = 'flex';

        // 隱藏 FAB
        const fab = document.getElementById('asgAiFab');
        if (fab) fab.style.display = 'none';

        // 歡迎消息
        this._asgAiRenderMsg('assistant', '你好！我已了解你的作業情況。有什麼想問的嗎？你可以問我關於分數、評語或相關知識點的問題。');

        // 建議問題
        const msgs = document.getElementById('asgAiMessages');
        if (msgs) {
            const suggestions = document.createElement('div');
            suggestions.className = 'asg-ai-suggestions';
            suggestions.innerHTML = `
                <button class="asg-ai-suggested-btn" onclick="AssignmentApp._asgAiAskSuggestion('我哪裡失分最多？為什麼？')">我哪裡失分最多？</button>
                <button class="asg-ai-suggested-btn" onclick="AssignmentApp._asgAiAskSuggestion('請幫我分析這份作業的優點和不足')">分析優缺點</button>
                <button class="asg-ai-suggested-btn" onclick="AssignmentApp._asgAiAskSuggestion('相關知識點我應該怎麼理解？')">解釋知識點</button>
            `;
            msgs.appendChild(suggestions);
        }

        // 聚焦輸入框
        setTimeout(() => document.getElementById('asgAiInput')?.focus(), 200);
    },

    _asgAiAskSuggestion(question) {
        const input = document.getElementById('asgAiInput');
        if (input) input.value = question;
        // 移除建議按鈕
        const suggestions = document.querySelector('.asg-ai-suggestions');
        if (suggestions) suggestions.remove();
        this._asgAiSend();
    },

    _asgAiRenderMsg(role, content) {
        const msgs = document.getElementById('asgAiMessages');
        if (!msgs) return null;

        const isUser = role === 'user';
        const msgEl = document.createElement('div');
        msgEl.className = isUser ? 'asg-ai-msg --user' : 'asg-ai-msg --assistant';

        const avatarEl = document.createElement('div');
        avatarEl.className = 'asg-ai-msg__avatar';
        avatarEl.textContent = isUser ? '🧑' : '🤖';

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'asg-ai-msg__bubble';

        if (!isUser) {
            bubbleEl.innerHTML = this._asgAiMarkdownWithMath(content);
        } else {
            bubbleEl.innerHTML = `<p>${AssignmentUI._escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
        }

        msgEl.appendChild(avatarEl);
        msgEl.appendChild(bubbleEl);
        msgs.appendChild(msgEl);
        msgs.scrollTop = msgs.scrollHeight;

        return bubbleEl;
    },

    async _asgAiSend() {
        if (this.state.asgAiSending) return;
        const input = document.getElementById('asgAiInput');
        const question = input?.value?.trim();
        if (!question) return;

        // 移除建議按鈕
        const suggestions = document.querySelector('.asg-ai-suggestions');
        if (suggestions) suggestions.remove();

        this.state.asgAiSending = true;
        input.value = '';
        input.focus();

        // 渲染用戶消息
        this._asgAiRenderMsg('user', question);

        // 創建 AI 消息氣泡（帶打字動畫）
        const msgs = document.getElementById('asgAiMessages');
        const aiMsgEl = document.createElement('div');
        aiMsgEl.className = 'asg-ai-msg --assistant';
        const avatarEl = document.createElement('div');
        avatarEl.className = 'asg-ai-msg__avatar';
        avatarEl.textContent = '🤖';
        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'asg-ai-msg__bubble';
        bubbleEl.innerHTML = '<div class="asg-ai-typing"><span></span><span></span><span></span></div>';
        aiMsgEl.appendChild(avatarEl);
        aiMsgEl.appendChild(bubbleEl);
        msgs.appendChild(aiMsgEl);
        msgs.scrollTop = msgs.scrollHeight;

        const assignmentId = this.state.currentAssignment;
        const requestBody = {
            question,
            subject: this.state.asgAiSubject || '',
            conversation_id: this.state.asgAiConversationId || null,
        };

        try {
            const response = await fetch(`/api/assignments/${assignmentId}/ai-chat-stream`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...AssignmentAPI._authHeaders(),
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error?.message || errData.message || '請求失敗');
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let fullAnswer = '';
            let sseBuffer = '';

            // 移除打字動畫，開始流式顯示
            bubbleEl.innerHTML = '<span class="asg-ai-streaming-text"></span><span class="asg-ai-streaming-cursor">▍</span>';
            const streamText = bubbleEl.querySelector('.asg-ai-streaming-text');

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const lines = sseBuffer.split('\n');
                sseBuffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const dataStr = line.slice(6).trim();
                    if (!dataStr) continue;

                    try {
                        const event = JSON.parse(dataStr);
                        if (event.type === 'meta') {
                            // 保存 conversation_id
                            if (event.conversation_id) {
                                this.state.asgAiConversationId = event.conversation_id;
                            }
                        } else if (event.type === 'token' || event.type === 'answer') {
                            fullAnswer += event.content || '';
                            streamText.textContent = fullAnswer;
                            msgs.scrollTop = msgs.scrollHeight;
                        } else if (event.type === 'done') {
                            if (event.conversation_id) {
                                this.state.asgAiConversationId = event.conversation_id;
                            }
                        }
                    } catch (_) { /* skip parse errors */ }
                }
            }

            // 流式完成：Markdown 渲染
            const cursor = bubbleEl.querySelector('.asg-ai-streaming-cursor');
            if (cursor) cursor.remove();

            if (fullAnswer) {
                bubbleEl.innerHTML = this._asgAiMarkdownWithMath(fullAnswer);
            } else {
                bubbleEl.innerHTML = '<p>暫無回答</p>';
            }

        } catch (error) {
            bubbleEl.innerHTML = `<p style="color:var(--color-error);">發送失敗：${AssignmentUI._escapeHtml(error.message || '未知錯誤')}</p>`;
            console.error('AI 問答失敗:', error);
        }

        this.state.asgAiSending = false;
        msgs.scrollTop = msgs.scrollHeight;
    },

    /**
     * Markdown + 數學公式一體化渲染
     * 先保護 LaTeX 表達式，再跑 marked + DOMPurify，最後用 KaTeX 渲染數學
     */
    _asgAiMarkdownWithMath(text) {
        if (!text) return '<p>暫無回答</p>';

        // 1) 提取數學表達式，用佔位符保護，避免 marked 破壞 LaTeX
        const mathStore = [];
        const placeholder = (latex, display) => {
            const idx = mathStore.length;
            mathStore.push({ latex, display });
            return `%%MATH_${idx}%%`;
        };

        let safe = text;
        // \begin{env}...\end{env}
        safe = safe.replace(/\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}/g, m => placeholder(m, true));
        // $$...$$
        safe = safe.replace(/\$\$([\s\S]*?)\$\$/g, (_, l) => placeholder(l, true));
        // \[...\]
        safe = safe.replace(/\\\[([\s\S]*?)\\\]/g, (_, l) => placeholder(l, true));
        // \(...\)
        safe = safe.replace(/\\\(([\s\S]*?)\\\)/g, (_, l) => placeholder(l, false));
        // $...$ (inline, no newlines, no nested $)
        safe = safe.replace(/\$([^$\n]+?)\$/g, (_, l) => placeholder(l, false));

        // 2) Markdown → HTML → sanitize
        let html;
        if (typeof marked !== 'undefined') {
            html = DOMPurify ? DOMPurify.sanitize(marked.parse(safe)) : marked.parse(safe);
        } else {
            html = `<p>${AssignmentUI._escapeHtml(safe).replace(/\n/g, '<br>')}</p>`;
        }

        // 3) 把佔位符替換成 KaTeX 渲染結果
        if (typeof katex !== 'undefined') {
            html = html.replace(/%%MATH_(\d+)%%/g, (_, idx) => {
                const m = mathStore[parseInt(idx)];
                try {
                    return katex.renderToString(m.latex.trim(), {
                        throwOnError: false,
                        displayMode: m.display,
                        trust: true,
                    });
                } catch (_e) {
                    return AssignmentUI._escapeHtml(m.latex);
                }
            });
        }
        return html;
    },

    /**
     * 渲染 KaTeX 數學公式（DOM 後處理版，備用）
     * 支持 $$...$$ (display) 和 $...$ (inline)、\begin{}\end{} 環境
     */
    _asgAiRenderMath(el) {
        if (!el || typeof katex === 'undefined') return;

        const renderK = (latex, displayMode) => {
            try {
                return katex.renderToString(latex.trim(), {
                    throwOnError: false,
                    displayMode,
                    trust: true,
                });
            } catch (_) {
                return null;
            }
        };

        // 對 el 內所有文字節點做替換
        const walk = (node) => {
            if (node.nodeType === 3) {          // Text node
                let text = node.textContent;
                if (!text || (!text.includes('$') && !text.includes('\\begin'))) return;

                // 按順序替換：\begin{env}...\end{env}  →  $$...$$  →  $...$
                let changed = false;
                const parts = [];
                let rest = text;

                // 1) \begin{env}...\end{env}
                rest = rest.replace(/\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}/g, (m) => {
                    const r = renderK(m, true);
                    if (r) { changed = true; return '\x00D' + parts.push(r) + '\x00'; }
                    return m;
                });
                // 2) $$...$$
                rest = rest.replace(/\$\$([\s\S]*?)\$\$/g, (_, latex) => {
                    const r = renderK(latex, true);
                    if (r) { changed = true; return '\x00D' + parts.push(r) + '\x00'; }
                    return _;
                });
                // 3) $...$  (inline, single line, no nested $)
                rest = rest.replace(/\$([^$\n]+?)\$/g, (_, latex) => {
                    const r = renderK(latex, false);
                    if (r) { changed = true; return '\x00I' + parts.push(r) + '\x00'; }
                    return _;
                });

                if (!changed) return;

                // 用佔位符拆分後構建 fragment
                const frag = document.createDocumentFragment();
                const segs = rest.split(/\x00[DI](\d+)\x00/);
                for (let i = 0; i < segs.length; i++) {
                    if (i % 2 === 0) {
                        if (segs[i]) frag.appendChild(document.createTextNode(segs[i]));
                    } else {
                        const span = document.createElement('span');
                        span.innerHTML = parts[parseInt(segs[i]) - 1];
                        frag.appendChild(span);
                    }
                }
                node.parentNode.replaceChild(frag, node);
            } else if (node.nodeType === 1 && !/^(SCRIPT|STYLE|CODE|PRE|TEXTAREA)$/i.test(node.tagName)) {
                // 遍歷子元素 (snapshot，因為會改動 DOM)
                Array.from(node.childNodes).forEach(walk);
            }
        };
        walk(el);
    },

    _showImageLightbox(url) {
        const old = document.getElementById('imageLightbox');
        if (old) old.remove();
        const div = document.createElement('div');
        div.innerHTML = `<div class="modal-overlay active image-lightbox" id="imageLightbox" onclick="if(event.target===this)this.remove()">
            <div class="lightbox-content">
                <img src="${url}" alt="Preview">
                <button class="btn btn-sm btn-outline lightbox-close" onclick="document.getElementById('imageLightbox').remove()">✕</button>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
    },

    async runSwiftFile(filePath) {
        const area = document.getElementById('swiftOutputArea');
        if (!area) return;
        area.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:16px;"><div class="loading-spinner"></div> 編譯運行中...</div>';

        try {
            const codeResp = await fetch('/' + filePath, { headers: AssignmentAPI._authHeaders() });
            const code = await codeResp.text();

            const resp = await AssignmentAPI.runSwift(code);
            if (!resp?.success) {
                area.innerHTML = `<div class="form-section"><h3>▶ 運行結果</h3><div class="swift-output error">運行失敗</div></div>`;
                return;
            }
            const result = resp.data;
            area.innerHTML = `<div class="form-section">
                <h3>▶ 運行結果 ${result.success ? '<span style="color:var(--color-success)">成功</span>' : '<span style="color:var(--color-error)">失敗</span>'}</h3>
                ${result.stdout ? `<div class="swift-output">${this._escapeHtml(result.stdout)}</div>` : ''}
                ${result.stderr ? `<div class="swift-output error">${this._escapeHtml(result.stderr)}</div>` : ''}
            </div>`;
        } catch (e) {
            area.innerHTML = `<div class="swift-output error">${e.message}</div>`;
        }
    },

    // ---- HTML iframe preview ----
    previewHtml(filePath, fileName) {
        const area = document.getElementById('htmlPreviewArea');
        if (!area) return;

        // Toggle off if same file already previewing
        if (area.dataset.currentFile === filePath && area.innerHTML !== '') {
            area.innerHTML = '';
            area.dataset.currentFile = '';
            return;
        }

        area.dataset.currentFile = filePath;
        area.innerHTML = `<div class="form-section">
            <div class="html-preview-header">
                <h3>▶ ${this._escapeHtml(fileName)}</h3>
                <div class="html-preview-controls">
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.toggleHtmlPreviewSize()" title="切換大小">⛶</button>
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closeHtmlPreview()" title="關閉預覽">✕</button>
                </div>
            </div>
            <div class="html-preview-container" id="htmlPreviewContainer">
                <iframe
                    src="${filePath}"
                    sandbox="allow-scripts allow-forms"
                    class="html-preview-iframe"
                    title="HTML Preview"
                ></iframe>
            </div>
        </div>`;
    },

    closeHtmlPreview() {
        const area = document.getElementById('htmlPreviewArea');
        if (area) {
            area.innerHTML = '';
            area.dataset.currentFile = '';
        }
    },

    toggleHtmlPreviewSize() {
        const container = document.getElementById('htmlPreviewContainer');
        if (container) {
            container.classList.toggle('html-preview-expanded');
        }
    },

    // ---- Video inline player ----
    previewVideo(filePath, fileName) {
        const area = document.getElementById('htmlPreviewArea');
        if (!area) return;

        if (area.dataset.currentFile === filePath && area.innerHTML !== '') {
            area.innerHTML = '';
            area.dataset.currentFile = '';
            return;
        }

        area.dataset.currentFile = filePath;
        area.innerHTML = `<div class="form-section">
            <div class="html-preview-header">
                <h3>▶ ${this._escapeHtml(fileName)}</h3>
                <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closeVideoPreview()" title="關閉">✕</button>
            </div>
            <div class="video-preview-container">
                <video controls preload="metadata" class="video-preview-player">
                    <source src="${filePath}" />
                    您的瀏覽器不支持視頻播放。
                </video>
            </div>
        </div>`;
    },

    closeVideoPreview() {
        const area = document.getElementById('htmlPreviewArea');
        if (area) {
            area.innerHTML = '';
            area.dataset.currentFile = '';
        }
    },

    // ---- Teacher Proxy Submit (drag-drop) ----
    _proxyPendingFiles: {},

    _proxyDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        const card = e.currentTarget;
        card.classList.add('proxy-drag-over');
    },

    _proxyDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        const card = e.currentTarget;
        card.classList.remove('proxy-drag-over');
    },

    _proxyDrop(e, username) {
        e.preventDefault();
        e.stopPropagation();
        const card = e.currentTarget;
        card.classList.remove('proxy-drag-over');

        const files = Array.from(e.dataTransfer.files);
        if (!files.length) return;

        // Store files for this student
        if (!this._proxyPendingFiles[username]) {
            this._proxyPendingFiles[username] = [];
        }
        this._proxyPendingFiles[username].push(...files);

        // Show the files on the card
        this._renderProxyFiles(username);
    },

    _renderProxyFiles(username) {
        const area = document.getElementById(`proxyFiles_${username}`);
        if (!area) return;

        const files = this._proxyPendingFiles[username] || [];
        if (!files.length) { area.style.display = 'none'; return; }

        area.style.display = 'block';
        area.innerHTML = `
            <div class="proxy-file-list">
                ${files.map((f, i) => `<div class="proxy-file-item">
                    <span class="proxy-file-name">${this._escapeHtml(f.name)}</span>
                    <span class="proxy-file-size">${AssignmentUI.formatFileSize(f.size)}</span>
                    <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();AssignmentApp._removeProxyFile('${username}',${i})" title="移除">✕</button>
                </div>`).join('')}
            </div>
            <div class="proxy-actions">
                <button class="btn btn-sm btn-success" onclick="event.stopPropagation();AssignmentApp._doProxySubmit('${username}')">
                    ${AssignmentUI.ICON.upload} 提交
                </button>
                <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();AssignmentApp._clearProxyFiles('${username}')">清除</button>
            </div>
        `;
    },

    _removeProxyFile(username, index) {
        if (this._proxyPendingFiles[username]) {
            this._proxyPendingFiles[username].splice(index, 1);
            this._renderProxyFiles(username);
        }
    },

    _clearProxyFiles(username) {
        this._proxyPendingFiles[username] = [];
        this._renderProxyFiles(username);
    },

    async _doProxySubmit(username) {
        const files = this._proxyPendingFiles[username];
        if (!files || !files.length) {
            UIModule.toast('沒有文件可提交', 'warning');
            return;
        }

        const assignmentId = this.state.currentAssignment;
        const card = document.querySelector(`.proxy-drop-card[data-username="${username}"]`);
        const filesArea = document.getElementById(`proxyFiles_${username}`);

        // Show loading state
        if (filesArea) {
            const submitBtn = filesArea.querySelector('.btn-success');
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<div class="loading-spinner"></div> 提交中...';
            }
        }

        try {
            const resp = await AssignmentAPI.teacherSubmitForStudent(assignmentId, username, files);
            if (resp?.success) {
                UIModule.toast(`已代 ${username} 提交成功`, 'success');
                this._proxyPendingFiles[username] = [];
                // Refresh the assignment view
                this.viewAssignment(assignmentId);
            } else {
                UIModule.toast('代提交失敗: ' + (resp?.message || resp?.detail || ''), 'error');
                if (filesArea) {
                    const submitBtn = filesArea.querySelector('.btn-success');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${AssignmentUI.ICON.upload} 提交`; }
                }
            }
        } catch (e) {
            UIModule.toast('代提交失敗: ' + e.message, 'error');
            if (filesArea) {
                const submitBtn = filesArea.querySelector('.btn-success');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${AssignmentUI.ICON.upload} 提交`; }
            }
        }
    },

    _escapeHtml(str) {
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
};

/* ============================================================
   FormBuilder — 老師建題模組
   ============================================================ */
const FormBuilder = {
    questions: [], // [{question_type, question_text, max_points, grading_notes, correct_answer, reference_answer, options:[{option_key, option_text}]}]

    reset() {
        this.questions = [];
        this._render();
    },

    loadQuestions(questionsData) {
        this.questions = questionsData.map(q => ({
            question_type: q.question_type || 'mc',
            question_text: q.question_text || '',
            max_points: q.max_points || 0,
            grading_notes: q.grading_notes || '',
            correct_answer: q.correct_answer || '',
            reference_answer: q.reference_answer || '',
            options: (q.options || []).map(o => ({ option_key: o.option_key, option_text: o.option_text }))
        }));
        this._render();
    },

    addQuestion() {
        this.questions.push({
            question_type: 'mc',
            question_text: '',
            max_points: 10,
            grading_notes: '',
            correct_answer: '',
            reference_answer: '',
            options: [{ option_key: 'A', option_text: '' }, { option_key: 'B', option_text: '' }]
        });
        this._render();
        // Scroll to new question
        const container = document.getElementById('formQuestionsContainer');
        if (container) setTimeout(() => container.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    },

    removeQuestion(index) {
        this.questions.splice(index, 1);
        this._render();
    },

    duplicateQuestion(index) {
        const copy = JSON.parse(JSON.stringify(this.questions[index]));
        this.questions.splice(index + 1, 0, copy);
        this._render();
    },

    moveQuestion(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.questions.length) return;
        const temp = this.questions[index];
        this.questions[index] = this.questions[newIndex];
        this.questions[newIndex] = temp;
        this._render();
    },

    changeQuestionType(index, newType) {
        const q = this.questions[index];
        if (q.question_type === newType) return;
        const oldType = q.question_type;
        // Warn if switching from MC (will lose options)
        if (oldType === 'mc' && newType !== 'mc' && q.options.length > 0) {
            if (!confirm('切換題型將清空選項，確定嗎？')) return;
            q.options = [];
            q.correct_answer = '';
        }
        // If switching to MC, add default options
        if (newType === 'mc' && oldType !== 'mc') {
            q.options = [{ option_key: 'A', option_text: '' }, { option_key: 'B', option_text: '' }];
            q.reference_answer = '';
        }
        q.question_type = newType;
        this._render();
    },

    addOption(qIndex) {
        const q = this.questions[qIndex];
        if (q.options.length >= 6) { UIModule.toast('最多 6 個選項', 'warning'); return; }
        const nextKey = String.fromCharCode(65 + q.options.length); // A=65
        q.options.push({ option_key: nextKey, option_text: '' });
        this._render();
    },

    removeOption(qIndex, optIndex) {
        const q = this.questions[qIndex];
        if (q.options.length <= 2) { UIModule.toast('MC 至少需要 2 個選項', 'warning'); return; }
        const removed = q.options.splice(optIndex, 1)[0];
        if (q.correct_answer === removed.option_key) q.correct_answer = '';
        // Re-key options A, B, C...
        q.options.forEach((o, i) => { o.option_key = String.fromCharCode(65 + i); });
        this._render();
    },

    setCorrectAnswer(qIndex, key) {
        this.questions[qIndex].correct_answer = key;
        // Update radio UI
        document.querySelectorAll(`.fb-q[data-index="${qIndex}"] .fb-option-correct`).forEach(r => {
            r.classList.toggle('active', r.dataset.key === key);
        });
    },

    _syncFromDOM() {
        document.querySelectorAll('.fb-q').forEach(card => {
            const idx = parseInt(card.dataset.index);
            const q = this.questions[idx];
            if (!q) return;
            q.question_text = card.querySelector('.fb-question-text')?.value || '';
            q.max_points = parseFloat(card.querySelector('.fb-max-points')?.value) || 0;
            q.grading_notes = card.querySelector('.fb-grading-notes')?.value || '';
            if (q.question_type === 'mc') {
                card.querySelectorAll('.fb-option-row').forEach((row, oi) => {
                    if (q.options[oi]) q.options[oi].option_text = row.querySelector('.fb-option-text')?.value || '';
                });
            } else {
                q.reference_answer = card.querySelector('.fb-reference-answer')?.value || '';
            }
        });
    },

    collectQuestions() {
        this._syncFromDOM();
        return this.questions.map((q, i) => {
            const out = {
                question_type: q.question_type,
                question_text: q.question_text,
                max_points: q.max_points,
                grading_notes: q.grading_notes,
                correct_answer: q.question_type === 'mc' ? q.correct_answer : '',
                reference_answer: q.question_type !== 'mc' ? q.reference_answer : '',
                options: q.question_type === 'mc' ? q.options.map(o => ({ option_key: o.option_key, option_text: o.option_text })) : []
            };
            return out;
        });
    },

    validate() {
        this._syncFromDOM();
        for (let i = 0; i < this.questions.length; i++) {
            const q = this.questions[i];
            if (!q.question_text.trim()) return `第 ${i + 1} 題題目內容不能為空`;
            if (!q.max_points || q.max_points <= 0) return `第 ${i + 1} 題分數必須大於 0`;
            if (q.question_type === 'mc') {
                if (q.options.length < 2) return `第 ${i + 1} 題至少需要 2 個選項`;
                for (let j = 0; j < q.options.length; j++) {
                    if (!q.options[j].option_text.trim()) return `第 ${i + 1} 題選項 ${q.options[j].option_key} 內容不能為空`;
                }
                if (!q.correct_answer) return `第 ${i + 1} 題必須選擇正確答案`;
            }
        }
        return null;
    },

    _updateTotalScore() {
        this._syncFromDOM();
        const total = this.questions.reduce((s, q) => s + (parseFloat(q.max_points) || 0), 0);
        const el = document.getElementById('formTotalScore');
        if (el) el.textContent = `總分: ${total}`;
    },

    _render() {
        const container = document.getElementById('formQuestionsContainer');
        if (!container) return;
        // Sync before re-render to preserve edits
        if (container.children.length > 0) this._syncFromDOM();

        const typeLabels = { mc: '選擇題', short_answer: '短答題', long_answer: '長答題' };

        container.innerHTML = this.questions.map((q, i) => {
            const typeSelect = `<select class="fb-type-select" onchange="FormBuilder.changeQuestionType(${i}, this.value)">
                <option value="mc" ${q.question_type === 'mc' ? 'selected' : ''}>選擇題</option>
                <option value="short_answer" ${q.question_type === 'short_answer' ? 'selected' : ''}>短答題</option>
                <option value="long_answer" ${q.question_type === 'long_answer' ? 'selected' : ''}>長答題</option>
            </select>`;

            let body = '';
            if (q.question_type === 'mc') {
                body = q.options.map((o, oi) => `
                    <div class="fb-option-row">
                        <span class="fb-option-correct ${q.correct_answer === o.option_key ? 'active' : ''}"
                              data-key="${o.option_key}"
                              onclick="FormBuilder.setCorrectAnswer(${i}, '${o.option_key}')"
                              title="設為正確答案">
                            ${q.correct_answer === o.option_key ? '●' : '○'}
                        </span>
                        <span class="fb-option-key">${o.option_key}</span>
                        <input type="text" class="fb-option-text" value="${AssignmentApp._escapeHtml(o.option_text)}" placeholder="選項內容">
                        <button class="fb-option-remove" onclick="FormBuilder.removeOption(${i}, ${oi})" title="刪除選項">✕</button>
                    </div>`).join('');
                body += `<button class="btn btn-sm btn-outline fb-add-option" onclick="FormBuilder.addOption(${i})">+ 新增選項</button>`;
            } else {
                body = `<div class="form-group" style="margin-top:8px;">
                    <label style="font-size:13px;color:var(--text-secondary);">參考答案 <span style="font-weight:400;color:var(--text-tertiary);">(可選，設定後 AI 批改會參照此答案)</span></label>
                    <textarea class="fb-reference-answer" rows="${q.question_type === 'long_answer' ? 4 : 2}" placeholder="輸入參考答案...">${AssignmentApp._escapeHtml(q.reference_answer)}</textarea>
                </div>`;
            }

            return `<div class="fb-q" data-index="${i}">
                <div class="fb-q-header">
                    <span class="fb-q-number">第 ${i + 1} 題</span>
                    ${typeSelect}
                    <div class="fb-q-points">
                        <input type="number" class="fb-max-points" value="${q.max_points}" min="0.5" step="0.5" placeholder="分數" oninput="FormBuilder._updateTotalScore()">
                        <span>分</span>
                    </div>
                    <div class="fb-q-actions">
                        <button onclick="FormBuilder.moveQuestion(${i}, -1)" title="上移" ${i === 0 ? 'disabled' : ''}>▲</button>
                        <button onclick="FormBuilder.moveQuestion(${i}, 1)" title="下移" ${i === this.questions.length - 1 ? 'disabled' : ''}>▼</button>
                        <button onclick="FormBuilder.duplicateQuestion(${i})" title="複製">⧉</button>
                        <button onclick="FormBuilder.removeQuestion(${i})" title="刪除">✕</button>
                    </div>
                </div>
                <textarea class="fb-question-text" rows="2" placeholder="輸入題目內容...">${AssignmentApp._escapeHtml(q.question_text)}</textarea>
                <div class="fb-q-body">${body}</div>
                <div class="form-group" style="margin-top:8px;">
                    <label style="font-size:13px;color:var(--text-secondary);">批改注意事項 <span style="font-weight:400;color:var(--text-tertiary);">(可選)</span></label>
                    <input type="text" class="fb-grading-notes" value="${AssignmentApp._escapeHtml(q.grading_notes)}" placeholder="AI/教師批改時的注意要點">
                </div>
            </div>`;
        }).join('');

        this._updateTotalScore();
    }
};

/* ============================================================
   FormStudentView — 學生答題模組
   ============================================================ */
const FormStudentView = {
    _draftKey(assignmentId) {
        const user = window.AuthModule?.getUser?.()?.username || '';
        return `form_draft_${assignmentId}_${user}`;
    },

    _saveDraft(assignmentId, questions) {
        try {
            const data = { questionCount: questions.length, answers: {} };
            questions.forEach(q => {
                const el = document.getElementById(`fq_answer_${q.id}`);
                if (el) data.answers[q.id] = el.value || '';
            });
            localStorage.setItem(this._draftKey(assignmentId), JSON.stringify(data));
        } catch (e) { /* ignore */ }
    },

    _loadDraft(assignmentId, questionCount) {
        try {
            const raw = localStorage.getItem(this._draftKey(assignmentId));
            if (!raw) return null;
            const data = JSON.parse(raw);
            if (data.questionCount !== questionCount) {
                localStorage.removeItem(this._draftKey(assignmentId));
                return null;
            }
            return data.answers || {};
        } catch (e) { return null; }
    },

    _clearDraft(assignmentId) {
        try { localStorage.removeItem(this._draftKey(assignmentId)); } catch (e) { /* ignore */ }
    },

    // Files pending upload keyed by question_id
    _pendingFiles: {},

    renderForm(assignmentId, questions) {
        this._pendingFiles = {};
        const drafts = this._loadDraft(assignmentId, questions.length) || {};
        const totalQuestions = questions.length;

        let html = `<div class="fsv-progress-bar">
            <div class="fsv-progress-fill" id="fsvProgressFill" style="width:0%"></div>
        </div>
        <div class="fsv-progress-text" id="fsvProgressText">已填 0 / ${totalQuestions} 題</div>`;

        questions.forEach((q, i) => {
            const typeLabel = q.question_type === 'mc' ? '選擇題' : q.question_type === 'short_answer' ? '短答題' : '長答題';
            let inputHtml = '';

            if (q.question_type === 'mc') {
                inputHtml = '<div class="fsv-mc-options">' + (q.options || []).map(o =>
                    `<label class="fsv-mc-option" onclick="FormStudentView._onMcSelect(${q.id}, '${o.option_key}')">
                        <span class="fsv-mc-radio" id="fq_radio_${q.id}_${o.option_key}">○</span>
                        <span class="fsv-mc-key">${o.option_key}</span>
                        <span class="fsv-mc-text">${AssignmentApp._escapeHtml(o.option_text)}</span>
                    </label>`
                ).join('') + `<input type="hidden" id="fq_answer_${q.id}" value="${drafts[q.id] || ''}"></div>`;
                // Restore draft selection
                if (drafts[q.id]) {
                    setTimeout(() => this._onMcSelect(q.id, drafts[q.id], true), 50);
                }
            } else {
                const rows = q.question_type === 'long_answer' ? 6 : 2;
                inputHtml = `<textarea id="fq_answer_${q.id}" class="fsv-text-input" rows="${rows}"
                    placeholder="${q.question_type === 'short_answer' ? '輸入你的答案...' : '詳細作答...'}"
                    oninput="FormStudentView._onInputChange(${assignmentId})">${drafts[q.id] || ''}</textarea>
                    <div class="fsv-file-upload">
                        <button class="btn btn-sm btn-outline" onclick="FormStudentView._triggerFileUpload(${q.id})">
                            📎 上傳文件
                        </button>
                        <input type="file" id="fq_file_${q.id}" multiple style="display:none" onchange="FormStudentView._onFileSelected(${q.id})">
                        <div class="fsv-file-list" id="fq_files_${q.id}"></div>
                    </div>`;
            }

            html += `<div class="fsv-question ${q.question_type === 'mc' ? 'fsv-mc' : ''}" id="fsvQ_${q.id}">
                <div class="fsv-q-header">
                    <span class="fsv-q-number">${i + 1}</span>
                    <span class="fsv-q-type">${typeLabel}</span>
                    <span class="fsv-q-points">${q.max_points} 分</span>
                </div>
                <div class="fsv-q-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                ${inputHtml}
            </div>`;
        });

        html += `<div class="fsv-submit-area">
            <button class="btn btn-primary btn-lg" id="fsvSubmitBtn" onclick="FormStudentView._submitForm(${assignmentId})">
                提交作業
            </button>
        </div>`;

        return html;
    },

    _onMcSelect(questionId, key, silent) {
        // Update hidden input
        const hidden = document.getElementById(`fq_answer_${questionId}`);
        if (hidden) hidden.value = key;
        // Update radio UI
        document.querySelectorAll(`#fsvQ_${questionId} .fsv-mc-radio`).forEach(r => {
            r.textContent = '○';
            r.classList.remove('active');
        });
        const selected = document.getElementById(`fq_radio_${questionId}_${key}`);
        if (selected) { selected.textContent = '●'; selected.classList.add('active'); }
        document.querySelectorAll(`#fsvQ_${questionId} .fsv-mc-option`).forEach(o => o.classList.remove('selected'));
        const option = selected?.closest('.fsv-mc-option');
        if (option) option.classList.add('selected');
        if (!silent) this._updateProgress();
    },

    _onInputChange(assignmentId) {
        this._updateProgress();
        // Debounce draft saving
        clearTimeout(this._draftTimer);
        this._draftTimer = setTimeout(() => {
            const questions = this._currentQuestions || [];
            this._saveDraft(assignmentId, questions);
        }, 500);
    },

    _updateProgress() {
        const questions = this._currentQuestions || [];
        let filled = 0;
        questions.forEach(q => {
            const el = document.getElementById(`fq_answer_${q.id}`);
            if (el && el.value.trim()) filled++;
        });
        const pct = questions.length > 0 ? Math.round(filled / questions.length * 100) : 0;
        const fill = document.getElementById('fsvProgressFill');
        const text = document.getElementById('fsvProgressText');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `已填 ${filled} / ${questions.length} 題`;
    },

    _triggerFileUpload(questionId) {
        document.getElementById(`fq_file_${questionId}`)?.click();
    },

    _onFileSelected(questionId) {
        const input = document.getElementById(`fq_file_${questionId}`);
        if (!input || !input.files.length) return;
        if (!this._pendingFiles[questionId]) this._pendingFiles[questionId] = [];
        for (const f of input.files) {
            if (this._pendingFiles[questionId].length >= 5) { UIModule.toast('每題最多 5 個文件', 'warning'); break; }
            this._pendingFiles[questionId].push(f);
        }
        input.value = '';
        this._renderFileList(questionId);
    },

    _removeFile(questionId, fileIndex) {
        if (this._pendingFiles[questionId]) {
            this._pendingFiles[questionId].splice(fileIndex, 1);
            this._renderFileList(questionId);
        }
    },

    _renderFileList(questionId) {
        const container = document.getElementById(`fq_files_${questionId}`);
        if (!container) return;
        const files = this._pendingFiles[questionId] || [];
        container.innerHTML = files.map((f, i) =>
            `<div class="fsv-file-item">
                <span>${AssignmentApp._escapeHtml(f.name)}</span>
                <span style="color:var(--text-tertiary);font-size:12px;">${AssignmentUI.formatFileSize(f.size)}</span>
                <button class="btn btn-sm" onclick="FormStudentView._removeFile(${questionId}, ${i})">✕</button>
            </div>`
        ).join('');
    },

    async _submitForm(assignmentId) {
        const questions = this._currentQuestions || [];
        // Check for unanswered questions
        const unanswered = [];
        const answers = [];
        questions.forEach((q, i) => {
            const el = document.getElementById(`fq_answer_${q.id}`);
            const val = el ? el.value.trim() : '';
            if (!val) unanswered.push(i + 1);
            answers.push({ question_id: q.id, answer_text: val });
        });

        if (unanswered.length > 0) {
            // Highlight unanswered
            unanswered.forEach(n => {
                const qEl = document.querySelector(`.fsv-question:nth-child(${n + 1})`); // +1 for progress bar
                if (qEl) qEl.classList.add('fsv-unanswered');
            });
            const first = document.getElementById(`fsvQ_${questions[unanswered[0] - 1]?.id}`);
            if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });

            if (!confirm(`有 ${unanswered.length} 題未作答（題 ${unanswered.join(', ')}），確定提交嗎？\n\n提交後不可修改。`)) return;
        } else {
            if (!confirm('確定提交？提交後不可修改。')) return;
        }

        const btn = document.getElementById('fsvSubmitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner"></div> 提交中...'; }

        const resp = await AssignmentAPI.submitForm(assignmentId, JSON.stringify(answers), this._pendingFiles);

        if (resp?.success) {
            this._clearDraft(assignmentId);
            UIModule.toast('提交成功', 'success');
            AssignmentApp.viewStudentAssignment(assignmentId);
        } else {
            UIModule.toast('提交失敗: ' + (resp?.message || resp?.detail || ''), 'error');
            if (btn) { btn.disabled = false; btn.textContent = '提交作業'; }
        }
    },

    renderSubmittedView(questions, answers, files) {
        const answerMap = {};
        (answers || []).forEach(a => { answerMap[a.question_id] = a; });
        const fileMap = {};
        (files || []).forEach(f => {
            if (!fileMap[f.answer_id]) fileMap[f.answer_id] = [];
            fileMap[f.answer_id].push(f);
        });

        let html = '';
        questions.forEach((q, i) => {
            const a = answerMap[q.id] || {};
            const answerFiles = fileMap[a.id] || [];
            const typeLabel = q.question_type === 'mc' ? '選擇題' : q.question_type === 'short_answer' ? '短答題' : '長答題';

            let answerHtml = '';
            if (q.question_type === 'mc') {
                answerHtml = '<div class="fsv-mc-results">' + (q.options || []).map(o => {
                    const isSelected = a.answer_text === o.option_key;
                    const isCorrect = q.correct_answer === o.option_key;
                    let cls = 'fsv-mc-result';
                    if (isSelected && isCorrect) cls += ' correct';
                    else if (isSelected && !isCorrect) cls += ' incorrect';
                    else if (isCorrect) cls += ' correct-answer';
                    return `<div class="${cls}">
                        <span class="fsv-mc-key">${o.option_key}</span>
                        <span>${AssignmentApp._escapeHtml(o.option_text)}</span>
                        ${isSelected ? '<span class="fsv-mc-mark">' + (isCorrect ? '✓' : '✗') + '</span>' : ''}
                        ${isCorrect && !isSelected ? '<span class="fsv-mc-mark correct-mark">✓</span>' : ''}
                    </div>`;
                }).join('') + '</div>';
            } else {
                answerHtml = `<div class="fsv-submitted-answer">${AssignmentApp._escapeHtml(a.answer_text || '(未作答)')}</div>`;
                if (answerFiles.length) {
                    answerHtml += '<div class="fsv-answer-files">' + answerFiles.map(f =>
                        `<div class="fsv-file-item"><a href="${f.file_path}" target="_blank">${AssignmentApp._escapeHtml(f.original_name)}</a></div>`
                    ).join('') + '</div>';
                }
            }

            // Score display
            let scoreHtml = '';
            if (q.question_type === 'mc') {
                scoreHtml = `<div class="fsv-q-score ${a.is_correct ? 'correct' : 'incorrect'}">${a.points != null ? a.points : '—'} / ${q.max_points}</div>`;
            } else if (a.score_source) {
                const srcLabel = a.score_source === 'auto' ? '自動' : a.score_source === 'ai' ? 'AI' : '老師';
                scoreHtml = `<div class="fsv-q-score">${a.points != null ? a.points : '—'} / ${q.max_points} <span class="fsv-score-source">${srcLabel}</span></div>`;
                if (a.ai_feedback || a.teacher_feedback) {
                    scoreHtml += `<div class="fsv-feedback">${AssignmentApp._escapeHtml(a.teacher_feedback || a.ai_feedback || '')}</div>`;
                }
            } else {
                scoreHtml = '<div class="fsv-q-score pending">待批改</div>';
            }

            html += `<div class="fsv-question fsv-submitted">
                <div class="fsv-q-header">
                    <span class="fsv-q-number">${i + 1}</span>
                    <span class="fsv-q-type">${typeLabel}</span>
                    <span class="fsv-q-points">${q.max_points} 分</span>
                </div>
                <div class="fsv-q-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                ${answerHtml}
                ${scoreHtml}
            </div>`;
        });

        return html;
    }
};

/* ============================================================
   ExamStudentView — 學生試卷作答視圖
   ============================================================ */
function _autoGrowTextarea(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
}
function _initAutoGrow(container) {
    (container || document).querySelectorAll('textarea[data-autogrow]').forEach(el => {
        _autoGrowTextarea(el);
        el._agBound || (el.addEventListener('input', () => _autoGrowTextarea(el)), el._agBound = true);
    });
}

const ExamStudentView = {
    _currentQuestions: [],
    _draftTimer: null,
    _editMode: false,

    _draftKey(assignmentId) {
        const user = window.AuthModule?.getUser?.()?.username || '';
        return `exam_draft_${assignmentId}_${user}`;
    },
    _saveDraft(assignmentId) {
        try {
            const questions = this._currentQuestions || [];
            const data = {};
            questions.forEach(q => {
                if (q.question_type === 'passage') return;
                if (q.question_type === 'fill_blank') {
                    const blanks = q.metadata?.blanks || [];
                    const vals = {};
                    blanks.forEach(b => {
                        const el = document.getElementById(`esv_blank_${q.id}_${b.id}`);
                        if (el) vals[b.id] = el.value || '';
                    });
                    data[q.id] = JSON.stringify(vals);
                } else {
                    const el = document.getElementById(`esv_answer_${q.id}`);
                    data[q.id] = el ? el.value : '';
                }
            });
            localStorage.setItem(this._draftKey(assignmentId), JSON.stringify(data));
        } catch (e) { /* ignore */ }
    },
    _loadDraft(assignmentId) {
        try {
            const raw = localStorage.getItem(this._draftKey(assignmentId));
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    },
    _clearDraft(assignmentId) {
        try { localStorage.removeItem(this._draftKey(assignmentId)); } catch (e) {}
    },
    _prefillFromAnswers(assignmentId, questions, answers) {
        // Convert existing answers into draft format so the form pre-fills
        const answerMap = {};
        (answers || []).forEach(a => { answerMap[a.question_id] = a; });
        const data = {};
        questions.forEach(q => {
            if (q.question_type === 'passage') return;
            const a = answerMap[q.id];
            data[q.id] = a ? (a.answer_text || '') : '';
        });
        localStorage.setItem(this._draftKey(assignmentId), JSON.stringify(data));
    },

    renderForm(assignmentId, questions) {
        const drafts = this._loadDraft(assignmentId) || {};
        const answerable = questions.filter(q => q.question_type !== 'passage');
        let questionIdx = 0;

        let html = `<div class="fsv-progress-bar">
            <div class="fsv-progress-fill" id="esvProgressFill" style="width:0%"></div>
        </div>
        <div class="fsv-progress-text" id="esvProgressText">已填 0 / ${answerable.length} 題</div>`;

        questions.forEach((q) => {
            if (q.question_type === 'passage') {
                // Passage: read-only reference material
                html += `<div class="esv-passage">
                    <div class="esv-passage-badge">資料</div>
                    <div class="esv-passage-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                </div>`;
                return;
            }

            questionIdx++;
            const typeLabels = {
                'open': '問答題', 'fill_blank': '填空題',
                'multiple_choice': '選擇題', 'true_false': '是非題'
            };
            const typeLabel = typeLabels[q.question_type] || '題目';

            let inputHtml = '';
            if (q.question_type === 'fill_blank') {
                const blanks = q.metadata?.blanks || [];
                const mode = q.metadata?.blank_mode || 'inline';
                const templateText = q.metadata?.template_text || '';
                let draftVals = {};
                try { draftVals = JSON.parse(drafts[q.id] || '{}'); } catch (e) {}

                if (templateText) {
                    // 模板驅動渲染：在原題文字中嵌入輸入框
                    const blanksMap = {};
                    blanks.forEach(b => { blanksMap[b.id] = b; });
                    const parts = templateText.split(/(\{\{b\d+\}\})/g);
                    let tplHtml = '';
                    parts.forEach(part => {
                        const m = part.match(/^\{\{(b\d+)\}\}$/);
                        if (m) {
                            const bid = m[1];
                            const b = blanksMap[bid];
                            if (b) {
                                const dv = AssignmentApp._escapeHtml(draftVals[bid] || '');
                                if (b.input_type === 'long_text') {
                                    tplHtml += `<div class="esv-tpl-longtext-wrap">
                                        ${b.label ? `<span class="esv-tpl-lt-label">${AssignmentApp._escapeHtml(b.label)}</span>` : ''}
                                        <textarea id="esv_blank_${q.id}_${bid}" class="esv-tpl-textarea"
                                            rows="3" data-autogrow placeholder="作答..."
                                            oninput="ExamStudentView._onInput(${assignmentId}, event)">${dv}</textarea>
                                        <span class="esv-tpl-inline-pts">${b.points}分</span>
                                    </div>`;
                                } else {
                                    tplHtml += `<input type="text" id="esv_blank_${q.id}_${bid}"
                                        class="esv-tpl-inline-input" placeholder="______"
                                        value="${dv}"
                                        oninput="ExamStudentView._onInput(${assignmentId}, event)">`;
                                    tplHtml += `<span class="esv-tpl-inline-pts">${b.points}分</span>`;
                                }
                            } else {
                                tplHtml += AssignmentApp._escapeHtml(part);
                            }
                        } else {
                            tplHtml += AssignmentApp._escapeHtml(part);
                        }
                    });
                    inputHtml = `<div class="esv-template-fill">${tplHtml}</div>`;
                } else {
                    // Fallback: 傳統 label+input 列表
                    inputHtml = `<div class="esv-blanks ${mode === 'section' ? 'esv-blanks-section' : ''}">`;
                    blanks.forEach(b => {
                        inputHtml += `<div class="esv-blank-item">
                            <label class="esv-blank-label">${AssignmentApp._escapeHtml(b.label)}</label>
                            <span class="esv-blank-pts">${b.points} 分</span>
                            ${mode === 'section' || b.input_type === 'long_text'
                                ? `<textarea id="esv_blank_${q.id}_${b.id}" class="esv-blank-input esv-blank-textarea"
                                    rows="2" data-autogrow placeholder="作答..."
                                    oninput="ExamStudentView._onInput(${assignmentId}, event)">${draftVals[b.id] || ''}</textarea>`
                                : `<input type="text" id="esv_blank_${q.id}_${b.id}" class="esv-blank-input"
                                    placeholder="填寫答案" value="${AssignmentApp._escapeHtml(draftVals[b.id] || '')}"
                                    oninput="ExamStudentView._onInput(${assignmentId}, event)">`
                            }
                        </div>`;
                    });
                    inputHtml += '</div>';
                }
            } else {
                // open / other types
                const draft = drafts[q.id] || '';
                inputHtml = `<textarea id="esv_answer_${q.id}" class="fsv-text-input" rows="3" data-autogrow
                    placeholder="詳細作答..."
                    oninput="ExamStudentView._onInput(${assignmentId}, event)">${draft}</textarea>`;
            }

            html += `<div class="fsv-question" id="esvQ_${q.id}">
                <div class="fsv-q-header">
                    <span class="fsv-q-number">${questionIdx}</span>
                    <span class="fsv-q-type">${typeLabel}</span>
                    <span class="fsv-q-points">${q.points || 0} 分</span>
                </div>
                <div class="fsv-q-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                ${inputHtml}
            </div>`;
        });

        html += `<div class="fsv-submit-area">
            <button class="btn btn-primary btn-lg" id="esvSubmitBtn" onclick="ExamStudentView._submit(${assignmentId})">
                提交作業
            </button>
        </div>`;
        return html;
    },

    _onInput(assignmentId, evt) {
        if (evt?.target?.hasAttribute('data-autogrow')) _autoGrowTextarea(evt.target);
        this._updateProgress();
        clearTimeout(this._draftTimer);
        this._draftTimer = setTimeout(() => this._saveDraft(assignmentId), 500);
    },

    _updateProgress() {
        const questions = this._currentQuestions || [];
        const answerable = questions.filter(q => q.question_type !== 'passage');
        let filled = 0;
        answerable.forEach(q => {
            if (q.question_type === 'fill_blank') {
                const blanks = q.metadata?.blanks || [];
                const anyFilled = blanks.some(b => {
                    const el = document.getElementById(`esv_blank_${q.id}_${b.id}`);
                    return el && el.value.trim();
                });
                if (anyFilled) filled++;
            } else {
                const el = document.getElementById(`esv_answer_${q.id}`);
                if (el && el.value.trim()) filled++;
            }
        });
        const pct = answerable.length > 0 ? Math.round(filled / answerable.length * 100) : 0;
        const fill = document.getElementById('esvProgressFill');
        const text = document.getElementById('esvProgressText');
        if (fill) fill.style.width = pct + '%';
        if (text) text.textContent = `已填 ${filled} / ${answerable.length} 題`;
    },

    async _submit(assignmentId) {
        const questions = this._currentQuestions || [];
        const answerable = questions.filter(q => q.question_type !== 'passage');
        const unanswered = [];
        const answers = [];

        answerable.forEach((q, i) => {
            let answerText = '';
            if (q.question_type === 'fill_blank') {
                const blanks = q.metadata?.blanks || [];
                const vals = {};
                blanks.forEach(b => {
                    const el = document.getElementById(`esv_blank_${q.id}_${b.id}`);
                    vals[b.id] = el ? el.value.trim() : '';
                });
                answerText = JSON.stringify(vals);
                const anyFilled = Object.values(vals).some(v => v);
                if (!anyFilled) unanswered.push(i + 1);
            } else {
                const el = document.getElementById(`esv_answer_${q.id}`);
                answerText = el ? el.value.trim() : '';
                if (!answerText) unanswered.push(i + 1);
            }
            answers.push({ question_id: q.id, answer_text: answerText });
        });

        if (unanswered.length > 0) {
            if (!confirm(`有 ${unanswered.length} 題未作答（題 ${unanswered.join(', ')}），確定提交嗎？\n\n截止前可重新修改。`)) return;
        } else {
            if (!confirm('確定提交？截止前可重新修改。')) return;
        }

        const btn = document.getElementById('esvSubmitBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<div class="loading-spinner"></div> 提交中...'; }

        const resp = await AssignmentAPI.submitExam(assignmentId, answers);
        if (resp?.success) {
            this._clearDraft(assignmentId);
            this._editMode = false;
            UIModule.toast('提交成功', 'success');
            AssignmentApp.viewStudentAssignment(assignmentId);
        } else {
            UIModule.toast('提交失敗: ' + (resp?.message || resp?.detail || ''), 'error');
            if (btn) { btn.disabled = false; btn.textContent = '提交作業'; }
        }
    },

    renderSubmittedView(questions, answers) {
        const answerMap = {};
        (answers || []).forEach(a => { answerMap[a.question_id] = a; });

        let html = '';
        let questionIdx = 0;
        questions.forEach((q) => {
            if (q.question_type === 'passage') {
                html += `<div class="esv-passage esv-passage-submitted">
                    <div class="esv-passage-badge">資料</div>
                    <div class="esv-passage-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                </div>`;
                return;
            }

            questionIdx++;
            const a = answerMap[q.id] || {};
            const typeLabels = {
                'open': '問答題', 'fill_blank': '填空題',
                'multiple_choice': '選擇題', 'true_false': '是非題'
            };
            const typeLabel = typeLabels[q.question_type] || '題目';

            let answerHtml = '';
            if (q.question_type === 'fill_blank') {
                const blanks = q.metadata?.blanks || [];
                const templateText = q.metadata?.template_text || '';
                let vals = {};
                try { vals = JSON.parse(a.answer_text || '{}'); } catch (e) {}

                if (templateText) {
                    // 模板驅動顯示：在原題文字中嵌入答案
                    const blanksMap = {};
                    blanks.forEach(b => { blanksMap[b.id] = b; });
                    const parts = templateText.split(/(\{\{b\d+\}\})/g);
                    let tplHtml = '';
                    parts.forEach(part => {
                        const m = part.match(/^\{\{(b\d+)\}\}$/);
                        if (m) {
                            const bid = m[1];
                            const b = blanksMap[bid];
                            const v = vals[bid] || '(未作答)';
                            if (b) {
                                if (b.input_type === 'long_text') {
                                    tplHtml += `<div class="esv-tpl-longtext-wrap esv-tpl-submitted">
                                        ${b.label ? `<span class="esv-tpl-lt-label">${AssignmentApp._escapeHtml(b.label)}</span>` : ''}
                                        <div class="fsv-submitted-answer">${AssignmentApp._escapeHtml(v)}</div>
                                        <span class="esv-tpl-inline-pts">${b.points}分</span>
                                    </div>`;
                                } else {
                                    tplHtml += `<span class="esv-tpl-inline-answer">${AssignmentApp._escapeHtml(v)}</span>`;
                                    tplHtml += `<span class="esv-tpl-inline-pts">${b.points}分</span>`;
                                }
                            } else {
                                tplHtml += AssignmentApp._escapeHtml(v);
                            }
                        } else {
                            tplHtml += AssignmentApp._escapeHtml(part);
                        }
                    });
                    answerHtml = `<div class="esv-template-fill esv-template-submitted">${tplHtml}</div>`;
                } else {
                    // Fallback: 傳統列表顯示
                    answerHtml = '<div class="esv-blanks-submitted">';
                    blanks.forEach(b => {
                        const v = vals[b.id] || '(未作答)';
                        answerHtml += `<div class="esv-blank-submitted-item">
                            <span class="esv-blank-label">${AssignmentApp._escapeHtml(b.label)}</span>
                            <span class="esv-blank-pts">${b.points} 分</span>
                            <div class="fsv-submitted-answer">${AssignmentApp._escapeHtml(v)}</div>
                        </div>`;
                    });
                    answerHtml += '</div>';
                }
            } else {
                answerHtml = `<div class="fsv-submitted-answer">${AssignmentApp._escapeHtml(a.answer_text || '(未作答)')}</div>`;
            }

            let scoreHtml = '';
            if (a.score_source) {
                const srcLabel = a.score_source === 'auto' ? '自動' : a.score_source === 'ai' ? 'AI' : '老師';
                scoreHtml = `<div class="fsv-q-score">${a.points != null ? a.points : '—'} / ${q.points || 0} <span class="fsv-score-source">${srcLabel}</span></div>`;
                if (a.ai_feedback || a.teacher_feedback) {
                    scoreHtml += `<div class="fsv-feedback">${AssignmentApp._escapeHtml(a.teacher_feedback || a.ai_feedback || '')}</div>`;
                }
            } else {
                scoreHtml = '<div class="fsv-q-score pending">待批改</div>';
            }

            html += `<div class="fsv-question fsv-submitted">
                <div class="fsv-q-header">
                    <span class="fsv-q-number">${questionIdx}</span>
                    <span class="fsv-q-type">${typeLabel}</span>
                    <span class="fsv-q-points">${q.points || 0} 分</span>
                </div>
                <div class="fsv-q-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                ${answerHtml}
                ${scoreHtml}
            </div>`;
        });
        return html;
    }
};

/* ============================================================
   FormGradingView — 老師批改模組
   ============================================================ */
const FormGradingView = {
    renderGradingPanel(questions, answers, answerFiles, submissionId) {
        const answerMap = {};
        (answers || []).forEach(a => { answerMap[a.question_id] = a; });
        const fileMap = {};
        (answerFiles || []).forEach(f => {
            if (!fileMap[f.answer_id]) fileMap[f.answer_id] = [];
            fileMap[f.answer_id].push(f);
        });

        let html = `<div class="fgv-toolbar">
            <button class="btn btn-outline btn-sm" onclick="FormGradingView._toggleAll(true)">全部展開</button>
            <button class="btn btn-outline btn-sm" onclick="FormGradingView._toggleAll(false)">全部收起</button>
            <button class="btn btn-outline btn-sm" onclick="FormGradingView._filterTextOnly()">只顯示文字題</button>
            <button class="btn btn-outline btn-sm" onclick="FormGradingView._filterUnreviewed()">只顯示未覆核</button>
            <button class="btn btn-primary btn-sm" onclick="FormGradingView._aiGradeAll(${submissionId})">AI 批改全部文字題</button>
        </div>
        <div class="fgv-total" id="fgvTotal"></div>`;

        questions.forEach((q, i) => {
            const a = answerMap[q.id] || {};
            const files = fileMap[a.id] || [];
            const typeLabel = q.question_type === 'mc' ? '選擇題' : q.question_type === 'short_answer' ? '短答題' : '長答題';
            const isMc = q.question_type === 'mc';
            const reviewed = !!a.reviewed_at;
            const srcLabel = a.score_source === 'auto' ? '自動' : a.score_source === 'ai' ? 'AI' : a.score_source === 'teacher' ? '老師' : '—';

            let answerHtml = '';
            if (isMc) {
                const correct = a.is_correct;
                answerHtml = `<div class="fgv-mc-answer">
                    學生答案: <strong>${a.answer_text || '—'}</strong>
                    ${correct ? '<span class="fgv-correct">✓ 正確</span>' : '<span class="fgv-incorrect">✗ 錯誤</span>'}
                    （正確答案: ${q.correct_answer}）
                </div>`;
            } else {
                answerHtml = `<div class="fgv-text-answer">
                    <div class="fgv-label">學生答案:</div>
                    <div class="fgv-answer-content">${AssignmentApp._escapeHtml(a.answer_text || '(未作答)')}</div>
                </div>`;
                if (files.length) {
                    answerHtml += '<div class="fgv-answer-files">' + files.map(f => {
                        const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.original_name);
                        return isImg
                            ? `<div class="fgv-file-preview"><img src="${f.file_path}" alt="${AssignmentApp._escapeHtml(f.original_name)}" style="max-width:300px;max-height:200px;border-radius:8px;"></div>`
                            : `<div class="fgv-file-item"><a href="${f.file_path}" target="_blank">${AssignmentApp._escapeHtml(f.original_name)}</a></div>`;
                    }).join('') + '</div>';
                }
                if (q.reference_answer) {
                    answerHtml += `<div class="fgv-reference"><div class="fgv-label">參考答案:</div><div>${AssignmentApp._escapeHtml(q.reference_answer)}</div></div>`;
                }
                if (q.grading_notes) {
                    answerHtml += `<div class="fgv-notes"><div class="fgv-label">批改注意事項:</div><div>${AssignmentApp._escapeHtml(q.grading_notes)}</div></div>`;
                }
            }

            // Grading controls (for text questions)
            let gradingHtml = '';
            if (isMc) {
                gradingHtml = `<div class="fgv-auto-score">得分: ${a.points != null ? a.points : '—'} / ${q.max_points} <span class="fgv-source-tag auto">自動</span></div>`;
            } else {
                gradingHtml = `<div class="fgv-grading-area" data-answer-id="${a.id}" data-submission-id="${submissionId}">
                    ${a.ai_points != null ? `<div class="fgv-ai-result">
                        <span class="fgv-source-tag ai">AI 建議</span> ${a.ai_points} / ${q.max_points}
                        ${a.ai_feedback ? `<div class="fgv-ai-feedback">${AssignmentApp._escapeHtml(a.ai_feedback)}</div>` : ''}
                    </div>` : ''}
                    <div class="fgv-manual-grade">
                        <label>給分:</label>
                        <input type="number" class="fgv-points-input" id="fgv_pts_${a.id}" value="${a.points != null ? a.points : ''}"
                            min="0" max="${q.max_points}" step="0.5" placeholder="0 - ${q.max_points}">
                        <span>/ ${q.max_points}</span>
                    </div>
                    <div class="fgv-manual-grade">
                        <label>反饋:</label>
                        <textarea class="fgv-feedback-input" id="fgv_fb_${a.id}" rows="2" placeholder="輸入反饋...">${AssignmentApp._escapeHtml(a.teacher_feedback || '')}</textarea>
                    </div>
                    <div class="fgv-grade-actions">
                        <button class="btn btn-sm btn-primary" onclick="FormGradingView._saveGrade(${submissionId}, ${a.id}, ${q.max_points})">確認評分</button>
                        ${a.ai_points != null && !reviewed ? `<button class="btn btn-sm btn-outline" onclick="FormGradingView._acceptAiScore(${submissionId}, ${a.id}, ${a.ai_points})">接受 AI 建議分</button>` : ''}
                        <span class="fgv-source-tag ${a.score_source || ''}">${srcLabel}</span>
                        ${reviewed ? '<span class="fgv-reviewed">✓ 已覆核</span>' : ''}
                    </div>
                </div>`;
            }

            html += `<div class="fgv-question ${isMc ? 'fgv-mc' : 'fgv-text'}" data-type="${q.question_type}" data-reviewed="${reviewed ? '1' : '0'}">
                <div class="fgv-q-header" onclick="FormGradingView._toggleQuestion(this)">
                    <span class="fgv-q-number">${i + 1}</span>
                    <span class="fgv-q-type">${typeLabel}</span>
                    <span class="fgv-q-points">${q.max_points} 分</span>
                    <span class="fgv-q-status">${isMc ? (a.is_correct ? '✓' : '✗') : (a.score_source ? `${a.points}/${q.max_points}` : '待批改')}</span>
                    <span class="fgv-toggle-icon">▼</span>
                </div>
                <div class="fgv-q-body">
                    <div class="fgv-q-text">${AssignmentApp._escapeHtml(q.question_text)}</div>
                    ${answerHtml}
                    ${gradingHtml}
                </div>
            </div>`;
        });

        this._updateTotal(questions, answers);
        return html;
    },

    _toggleQuestion(header) {
        const q = header.closest('.fgv-question');
        if (q) q.classList.toggle('collapsed');
    },

    _toggleAll(expand) {
        document.querySelectorAll('.fgv-question').forEach(q => {
            q.classList.toggle('collapsed', !expand);
        });
    },

    _filterTextOnly() {
        document.querySelectorAll('.fgv-question').forEach(q => {
            if (q.dataset.type === 'mc') q.style.display = q.style.display === 'none' ? '' : 'none';
        });
    },

    _filterUnreviewed() {
        document.querySelectorAll('.fgv-question').forEach(q => {
            if (q.dataset.type === 'mc') { q.style.display = 'none'; return; }
            if (q.dataset.reviewed === '1') q.style.display = q.style.display === 'none' ? '' : 'none';
        });
    },

    async _saveGrade(submissionId, answerId, maxPoints) {
        const pts = parseFloat(document.getElementById(`fgv_pts_${answerId}`)?.value);
        const fb = document.getElementById(`fgv_fb_${answerId}`)?.value || '';
        if (isNaN(pts) || pts < 0) { UIModule.toast('請輸入有效分數', 'warning'); return; }
        if (pts > maxPoints) { UIModule.toast(`分數不能超過 ${maxPoints}`, 'warning'); return; }

        const resp = await AssignmentAPI.gradeFormAnswer(submissionId, answerId, { points: pts, feedback: fb });
        if (resp?.success) {
            UIModule.toast('評分已保存', 'success');
            // Refresh the submission view
            AssignmentApp.viewSubmission(submissionId);
        } else {
            UIModule.toast('評分失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },

    async _acceptAiScore(submissionId, answerId, aiPoints) {
        const resp = await AssignmentAPI.gradeFormAnswer(submissionId, answerId, { points: aiPoints, feedback: '' });
        if (resp?.success) {
            UIModule.toast('已接受 AI 建議分', 'success');
            AssignmentApp.viewSubmission(submissionId);
        } else {
            UIModule.toast('操作失敗', 'error');
        }
    },

    async _aiGradeAll(submissionId) {
        if (!confirm('確定要對所有文字題進行 AI 批改？')) return;
        UIModule.toast('AI 批改中...', 'info');
        const resp = await AssignmentAPI.aiGradeForm(submissionId);
        if (resp?.success) {
            UIModule.toast('AI 批改完成', 'success');
            AssignmentApp.viewSubmission(submissionId);
        } else {
            UIModule.toast('AI 批改失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },

    _updateTotal(questions, answers) {
        const answerMap = {};
        (answers || []).forEach(a => { answerMap[a.question_id] = a; });
        let scored = 0, maxTotal = 0;
        questions.forEach(q => {
            maxTotal += q.max_points || 0;
            const a = answerMap[q.id];
            if (a && a.points != null) scored += a.points;
        });
        setTimeout(() => {
            const el = document.getElementById('fgvTotal');
            if (el) el.innerHTML = `<strong>總分: ${scored} / ${maxTotal}</strong>`;
        }, 0);
    }
};

/* ============================================================
   Init
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // AuthModule 由 shared/auth.js 自動掛載，無需 init
    // 短暫延遲確保 token 讀取完成
    setTimeout(() => AssignmentApp.init(), 50);

    // Click overlay to close modals
    ['createModal', 'submitModal'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('click', (e) => {
            if (e.target === el) {
                if (id === 'createModal') AssignmentApp.closeCreateModal();
                else AssignmentApp.closeSubmitModal();
            }
        });
    });

    // ESC key closes modals
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const createModal = document.getElementById('createModal');
            const submitModal = document.getElementById('submitModal');
            if (createModal?.classList.contains('active')) {
                AssignmentApp.closeCreateModal();
            } else if (submitModal?.classList.contains('active')) {
                AssignmentApp.closeSubmitModal();
            }
        }
    });
});
