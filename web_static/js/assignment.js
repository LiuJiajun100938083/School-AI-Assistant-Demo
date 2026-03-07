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
                            ${passed ? '✅ 通過' : '❌ 不通過'}
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
                            ${report.detect_mode ? `<span class="badge badge-submitted">${({code:'代碼',text:'文字',mixed:'混合'})[report.detect_mode] || report.detect_mode}</span>` : ''}
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

        // ---- Cluster Groups ----
        if (clusters.length > 0) {
            html += `<div class="plagiarism-clusters">
                <div class="plag-section-title">群組分析 <span class="count">${clusters.length}</span></div>
                ${clusters.map(c => {
                    const source = c.members.find(m => m.role === 'source');
                    return `<div class="cluster-card">
                        <div class="cluster-header">
                            <span class="cluster-title">群組 ${c.id} <span class="count">${c.size} 人</span></span>
                            <span class="cluster-score">最高 <b>${c.max_score}%</b></span>
                        </div>
                        ${source ? `<div class="cluster-source">
                            <span class="cluster-source-badge">疑似源頭</span>
                            <strong>${source.name}</strong>
                            <span style="color:var(--text-tertiary);font-size:var(--type-badge);">與 ${source.degree} 人匹配, 平均 ${source.avg_score}%</span>
                        </div>` : ''}
                        <div class="cluster-members">
                            ${c.members.map(m => `<span class="cluster-member ${m.role === 'source' ? 'is-source' : ''}">
                                ${m.name}
                                <span class="cluster-member-deg">${m.degree}</span>
                            </span>`).join('')}
                        </div>
                        <div class="cluster-edges">
                            ${c.edges.slice(0, 6).map(e => `<div class="cluster-edge">
                                ${e.a_name} ↔ ${e.b_name}: <b>${e.score.toFixed(1)}%</b>
                            </div>`).join('')}
                            ${c.edges.length > 6 ? `<div class="cluster-edge" style="color:var(--text-tertiary);">共 ${c.edges.length} 條關聯</div>` : ''}
                        </div>
                    </div>`;
                }).join('')}
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

        return `<div class="plagiarism-pairs-list">${pairs.map(p => {
            const pct = parseFloat(p.similarity_score) || 0;
            const dims = this._extractDimensions(p.matched_fragments);
            const dimHtml = dims ? `<div class="pair-dimensions">
                <span class="dim-tag">命名 ${dims.identifier}%</span>
                <span class="dim-tag">逐字 ${dims.verbatim}%</span>
                <span class="dim-tag">縮排 ${dims.indent}%</span>
                ${dims.evidenceHits ? `<span class="dim-tag${dims.evidenceHits >= 2 ? ' evidence-hit' : ''}">證據 ${dims.evidenceHits}/5</span>` : ''}
            </div>` : '';
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

    renderPlagiarismPairDetail(pair) {
        const pct = parseFloat(pair.similarity_score) || 0;
        const dims = this._extractDimensions(pair.matched_fragments);

        let html = `<div class="plagiarism-detail fade-in">
            <div class="plag-detail-header">
                <div>
                    <h3 class="plag-detail-title">
                        ${pair.student_a_name || '學生A'} <span style="color:var(--text-tertiary);font-weight:400;">vs</span> ${pair.student_b_name || '學生B'}
                    </h3>
                    <div class="plag-detail-score">
                        <div class="plag-score-bar-track">
                            <div class="plag-score-bar-fill" style="width:${pct}%;background:var(--text-primary);"></div>
                        </div>
                        <span class="plag-score-value">${pct.toFixed(1)}%</span>
                    </div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closePlagiarismPairDetail()">返回報告</button>
            </div>`;

        // Dimension Analysis
        if (dims) {
            const mkBar = (label, val) => {
                const v = parseFloat(val) || 0;
                return `<div class="dim-detail-row">
                    <span class="dim-detail-label">${label}</span>
                    <div class="dim-detail-bar-track">
                        <div class="dim-detail-bar-fill" style="width:${v}%;"></div>
                    </div>
                    <span class="dim-detail-val">${v.toFixed(1)}%</span>
                </div>`;
            };
            html += `<div class="plagiarism-dimension-box">
                <h4>多維度分析</h4>
                ${mkBar('結構相似', dims.structure)}
                ${mkBar('變量命名', dims.identifier)}
                ${mkBar('逐字複製', dims.verbatim)}
                ${mkBar('縮排指紋', dims.indent)}
                ${mkBar('注釋/字串', dims.comment)}
                ${dims.evidenceHits !== undefined ? mkBar('多重證據', dims.evidence) : ''}
                ${dims.isCode ? `<div class="dim-code-badge">代碼文件 · ${dims.codeLength} 字元 · 證據命中 ${dims.evidenceHits || 0}/5 維</div>` : ''}
                ${dims.signals && dims.signals.length ? `<div class="dim-signals">${dims.signals.map(s => `<span class="dim-signal-tag">${s}</span>`).join('')}</div>` : ''}
            </div>`;
        }

        // AI Analysis
        if (pair.ai_analysis) {
            html += `<div class="plagiarism-ai-box">
                <h4>AI 分析</h4>
                <p style="margin:0;white-space:pre-wrap;">${pair.ai_analysis}</p>
            </div>`;
        }

        // Matched Fragments
        const fragments = (pair.matched_fragments || []).filter(f => f.type !== 'dimension_breakdown');
        if (fragments.length) {
            html += `<div class="plagiarism-fragments">
                <div class="plag-section-title">匹配片段 <span class="count">${fragments.length}</span></div>
                ${fragments.map((f, i) => `<div class="fragment-item">
                    <span class="fragment-label">片段 ${i + 1} · ${f.length} 字元</span>
                    <pre class="fragment-text">${this._escapeHtml(f.text || '')}</pre>
                </div>`).join('')}
            </div>`;
        }

        // Side-by-side comparison
        html += `<div class="plagiarism-compare">
            <div class="compare-col">
                <h4 class="compare-header">${pair.student_a_name || '學生A'}</h4>
                <pre class="compare-text">${this._escapeHtml(pair.text_a || '（無內容）')}</pre>
            </div>
            <div class="compare-col">
                <h4 class="compare-header">${pair.student_b_name || '學生B'}</h4>
                <pre class="compare-text">${this._escapeHtml(pair.text_b || '（無內容）')}</pre>
            </div>
        </div>`;

        html += '</div>';
        return html;
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
            isCode: dim.is_code || false,
            codeLength: dim.code_length || 0,
            signals: dim.signals || [],
        };
    },

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
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
        const isOpen = sidebar.classList.contains('open');
        sidebar.classList.toggle('open', !isOpen);
        overlay.classList.toggle('active', !isOpen);
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
                        ${AssignmentUI.renderFiles(sub.files)}
                    </div>
                    <div id="codePreviewArea"></div>
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
        el.innerHTML = !isPassed ? '✅ 通過' : '❌ 不通過';
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
                        toggle.innerHTML = passed ? '✅ 通過' : '❌ 不通過';
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
                    <select id="plagSubjectSelect" class="plag-config-select">
                        ${subjectsHtml}
                    </select>

                    <label class="plag-config-label" style="margin-top:var(--space-4)">作業類型</label>
                    <div class="plag-mode-options">
                        <label class="plag-mode-option selected">
                            <input type="radio" name="plagDetectMode" value="code" checked
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">代碼</span>
                                <span class="plag-mode-desc">重視變量名、縮排、逐字複製</span>
                            </div>
                        </label>
                        <label class="plag-mode-option">
                            <input type="radio" name="plagDetectMode" value="text"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">文字</span>
                                <span class="plag-mode-desc">重視段落複製、文字相似</span>
                            </div>
                        </label>
                        <label class="plag-mode-option">
                            <input type="radio" name="plagDetectMode" value="mixed"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">混合</span>
                                <span class="plag-mode-desc">自動識別每份作業的類型</span>
                            </div>
                        </label>
                    </div>

                    <label class="plag-config-label" style="margin-top:var(--space-4)">相似度閾值</label>
                    <div class="plag-threshold-row">
                        <input type="range" id="plagThresholdSlider" min="30" max="95" value="60" step="5"
                            oninput="document.getElementById('plagThresholdVal').textContent=this.value+'%'">
                        <span id="plagThresholdVal" class="plag-threshold-val">60%</span>
                    </div>
                    <p class="plag-config-hint">閾值越低檢出越多（可能有誤報），越高越嚴格</p>
                </div>
                <div class="plag-config-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('plagConfigModal').remove()">取消</button>
                    <button class="btn btn-primary" onclick="AssignmentApp._confirmStartPlagiarism()">開始檢測</button>
                </div>
            </div>
        </div>`;
        document.body.appendChild(div.firstElementChild);
    },

    _onPlagModeChange(radio) {
        document.querySelectorAll('.plag-mode-option').forEach(el => el.classList.remove('selected'));
        radio.closest('.plag-mode-option').classList.add('selected');
        // 根據類型建議閾值
        const suggested = { code: 60, text: 50, mixed: 60 };
        const slider = document.getElementById('plagThresholdSlider');
        const val = document.getElementById('plagThresholdVal');
        if (slider && val) {
            slider.value = suggested[radio.value] || 60;
            val.textContent = slider.value + '%';
        }
    },

    async _confirmStartPlagiarism() {
        const subject = document.getElementById('plagSubjectSelect')?.value || '';
        const detect_mode = document.querySelector('input[name="plagDetectMode"]:checked')?.value || 'mixed';
        const threshold = parseInt(document.getElementById('plagThresholdSlider')?.value || '60', 10);
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

        main.innerHTML = AssignmentUI.renderPlagiarismPairDetail(resp.data);
    },

    closePlagiarismReport() {
        this._stopPlagiarismPolling();
        this.viewAssignment(this.state.currentAssignment);
    },

    closePlagiarismPairDetail() {
        this.showPlagiarismReport();
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
        this.state.pendingAttachments = [];
        this.state.existingAttachments = [];
        this.state.deletedAttachmentIds = [];
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
            }
        }

        // Render attachment lists
        this._renderAttachmentLists();
        this._setupAttachmentZone();

        this.goToStep(1);
        document.getElementById('createModal').classList.add('active');
        document.body.style.overflow = 'hidden';
        // Focus first input after animation
        setTimeout(() => document.getElementById('asgTitle')?.focus(), 300);
    },

    closeCreateModal() {
        document.getElementById('createModal').classList.remove('active');
        document.body.style.overflow = '';
    },

    goToStep(n) {
        this.state.currentStep = n;
        document.getElementById('step1').style.display = n === 1 ? '' : 'none';
        document.getElementById('step2').style.display = n === 2 ? '' : 'none';
        document.getElementById('stepItem1').className = `step-item ${n === 1 ? 'active' : 'completed'}`;
        document.getElementById('stepItem2').className = `step-item ${n === 2 ? 'active' : ''}`;
        // Animated progress line
        const line = document.querySelector('.step-line');
        if (line) line.classList.toggle('filled', n >= 2);
        // Checkmark for completed step
        const circle1 = document.querySelector('#stepItem1 .step-circle');
        if (circle1) circle1.textContent = n >= 2 ? '✓' : '1';
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
        const rubricType = this.state.selectedRubricType || 'points';
        const targetType = document.getElementById('asgTargetType').value;
        let targetValue = null;
        if (targetType !== 'all') targetValue = document.getElementById('asgTargetValue').value;

        const base = {
            title: document.getElementById('asgTitle').value.trim(),
            description: document.getElementById('asgDesc').value.trim(),
            target_type: targetType,
            target_value: targetValue,
            deadline: document.getElementById('asgDeadline').value || null,
            max_files: parseInt(document.getElementById('asgMaxFiles').value) || 5,
            allow_late: document.getElementById('asgAllowLate').checked,
            rubric_type: rubricType,
            rubric_config: null,
            rubric_items: [],
        };

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

        this.setBreadcrumb([
            { label: '我的作業', action: 'AssignmentApp.showStudentList()' },
            { label: asg.title }
        ]);
        this.setHeaderActions(
            !sub ? `<button class="btn btn-primary" onclick="AssignmentApp.openSubmitModal(${id})">${AssignmentUI.ICON.upload} 提交作業</button>` :
            sub.status === 'submitted' ? `<button class="btn btn-warning" onclick="AssignmentApp.openSubmitModal(${id})">重新提交</button>` : ''
        );

        const deadlineWarn = !sub ? AssignmentUI.deadlineWarning(asg.deadline) : '';
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
                <div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.clip}</div>
                    <div><div class="stat-value">最多 ${asg.max_files || 5} 個</div><div class="stat-label">文件限制</div></div>
                </div>
            </div>
        </div>`;

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
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                            <span>${passed ? '✅' : '❌'}</span>
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
        window.open(url, '_blank');
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
