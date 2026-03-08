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
