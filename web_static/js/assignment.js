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
    async aiGrade(subId) {
        return this._call(`/api/assignments/teacher/submissions/${subId}/ai-grade`, { method: 'POST' });
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

    // Swift
    async runSwift(code) {
        return this._call('/api/assignments/run-swift', {
            method: 'POST', body: JSON.stringify({ code })
        });
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
            <div class="empty-state-hint">點擊右上角「+ 新增作業」開始</div></div>`;
        return `<div class="assignment-table"><table>
            <thead><tr><th>標題</th><th>目標</th><th>截止日</th><th>提交</th><th>狀態</th></tr></thead>
            <tbody>${assignments.map(a => {
                const pct = a.submission_count > 0 ? Math.round((a.graded_count||0)/(a.submission_count)*100) : 0;
                const target = a.target_type === 'all' ? '所有人' :
                    a.target_type === 'class' ? `班級: ${a.target_value}` : `學生: ${a.target_value}`;
                return `<tr onclick="AssignmentApp.viewAssignment(${a.id})">
                    <td class="title-cell">${a.title}</td>
                    <td>${target}</td>
                    <td>${this.formatDate(a.deadline)}</td>
                    <td>${a.submission_count||0} 份</td>
                    <td>${this.badge(a.status)}</td></tr>`;
            }).join('')}</tbody></table></div>`;
    },

    // ---- Teacher Grid View ----
    renderTeacherGridView(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">尚無作業</div></div>`;
        return `<div class="assignment-grid">${assignments.map(a => {
            const pct = a.submission_count > 0 ? Math.round((a.graded_count||0)/(a.submission_count)*100) : 0;
            return `<div class="grid-card" onclick="AssignmentApp.viewAssignment(${a.id})">
                <div class="grid-card-header">
                    <div class="grid-card-icon">${AssignmentUI.ICON.file}</div>
                    ${this.badge(a.status)}
                </div>
                <div class="grid-card-title">${a.title}</div>
                <div class="grid-card-meta">
                    <span>${AssignmentUI.ICON.clock} 截止: ${this.formatDate(a.deadline)}</span>
                    <span>${AssignmentUI.ICON.folder} ${a.submission_count||0} 份提交</span>
                </div>
                <div class="grid-card-footer">
                    <span style="font-size:13px;color:var(--text-secondary)">
                        ${a.target_type === 'all' ? '所有人' :
                          a.target_type === 'class' ? a.target_value : '指定學生'}
                    </span>
                    ${this.progressRing(pct)}
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Student List View ----
    renderStudentAssignments(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">暫無作業</div></div>`;
        return `<div class="assignment-grid">${assignments.map(a => {
            const st = a.submission_status || 'not_submitted';
            return `<div class="grid-card" onclick="AssignmentApp.viewStudentAssignment(${a.id})">
                <div class="grid-card-header">
                    <div class="grid-card-icon">${AssignmentUI.ICON.file}</div>
                    ${this.badge(st)}
                </div>
                <div class="grid-card-title">${a.title}</div>
                <div class="grid-card-meta">
                    <span>${AssignmentUI.ICON.user} ${a.created_by_name||''}</span>
                    <span>${AssignmentUI.ICON.clock} 截止: ${this.formatDate(a.deadline)}</span>
                </div>
                <div class="grid-card-footer">
                    ${a.my_score !== null && a.my_score !== undefined ?
                        `<span class="submission-score">${a.my_score}/${a.max_score}</span>` :
                        '<span style="color:var(--text-tertiary)">未評分</span>'}
                    ${st === 'graded' ? this.progressRing(100) :
                      st === 'submitted' ? this.progressRing(50) :
                      this.progressRing(0)}
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
            return `<div class="submission-card" onclick="AssignmentApp.viewSubmission(${s.id})">
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

    // ---- File List ----
    renderFiles(files, opts = {}) {
        if (!files || !files.length) return '<p style="color:var(--text-tertiary);font-size:14px;">無文件</p>';
        return `<div class="file-list">${files.map(f => {
            const icon = this.FILE_ICONS[f.file_type] || this.ICON.clip;
            const isCode = f.file_type === 'code';
            const ext = f.original_name.split('.').pop().toLowerCase();
            const isSwift = ext === 'swift';
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
                    <a class="btn btn-sm btn-outline" href="/${f.file_path}" download="${f.original_name}">下載</a>
                </div></div>`;
        }).join('')}</div>`;
    },

    // ---- Grading Panel ----
    renderGradingPanel(rubricItems, existingScores = [], feedback = '') {
        const scoreMap = {};
        const reasonMap = {};
        if (existingScores) {
            existingScores.forEach(s => {
                scoreMap[s.rubric_item_id] = s.points;
                if (s.reason) reasonMap[s.rubric_item_id] = s.reason;
            });
        }
        let html = `<div class="grading-panel">
            <h3>${AssignmentUI.ICON.inbox} 批改面板</h3>
            <button class="btn btn-ai" style="width:100%;margin-bottom:16px;" onclick="AssignmentApp.doAiGrade()">
                ${AssignmentUI.ICON.ai} AI 自動批改
            </button>
            <div id="aiGradeStatus"></div>`;

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
            <span><span id="gradeTotal">0</span> / ${rubricItems.reduce((s,i)=>s+parseFloat(i.max_points),0)}</span>
        </div>
        <div class="form-group" style="margin-top:16px;">
            <label>教師評語</label>
            <textarea id="gradeFeedback" rows="3" placeholder="輸入評語...">${feedback}</textarea>
        </div>
        <button class="btn btn-primary" style="width:100%;" onclick="AssignmentApp.doGrade()">提交批改</button>
        </div>`;
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
        this.setHeaderActions(`
            <div class="view-toggle">
                <button onclick="AssignmentApp.setView('list')" class="${this.state.view === 'list' ? 'active' : ''}" title="列表模式">☰</button>
                <button onclick="AssignmentApp.setView('grid')" class="${this.state.view === 'grid' ? 'active' : ''}" title="網格模式">⊞</button>
            </div>
            <button class="btn btn-primary" onclick="AssignmentApp.openCreateModal()">+ 新增作業</button>
        `);

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

        const resp = await AssignmentAPI.listTeacherAssignments();
        if (!resp || !resp.success) { main.innerHTML = '<div class="empty-state"><div class="empty-state-text">載入失敗</div></div>'; return; }

        const items = resp.data || [];
        main.innerHTML = this.state.view === 'grid'
            ? AssignmentUI.renderTeacherGridView(items)
            : AssignmentUI.renderTeacherListView(items);
    },

    setView(v) {
        this.state.view = v;
        localStorage.setItem('asg_view', v);
        if (this.state.role === 'teacher' || this.state.role === 'admin') {
            this.showTeacherList();
        }
    },

    // ---- Teacher: View Assignment (Submissions) ----
    async viewAssignment(id) {
        this.state.phase = 'submissions';
        this.state.currentAssignment = id;

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

        const [asgResp, subResp] = await Promise.all([
            AssignmentAPI.getTeacherAssignment(id),
            AssignmentAPI.listSubmissions(id),
        ]);

        if (!asgResp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }
        const asg = asgResp.data;
        const subs = subResp?.data || [];

        this.setBreadcrumb([
            { label: '作業列表', action: 'AssignmentApp.showTeacherList()' },
            { label: asg.title }
        ]);
        this.setHeaderActions(`
            ${asg.status === 'draft' ? `<button class="btn btn-success" onclick="AssignmentApp.publishAssignment(${id})">發布</button>` : ''}
            ${asg.status === 'published' ? `<button class="btn btn-warning" onclick="AssignmentApp.closeAssignment(${id})">關閉</button>` : ''}
            ${asg.status === 'draft' ? `<button class="btn btn-outline" onclick="AssignmentApp.editAssignment(${id})">編輯</button>` : ''}
            <button class="btn btn-outline btn-danger" onclick="AssignmentApp.deleteAssignment(${id})">刪除</button>
        `);

        // Assignment detail + submissions
        const target = asg.target_type === 'all' ? '所有人' :
            asg.target_type === 'class' ? `班級: ${asg.target_value}` : `學生: ${asg.target_value}`;
        const rubricHtml = asg.rubric_items?.length ?
            `<div style="margin-top:12px;"><strong>評分標準:</strong>
            ${asg.rubric_items.map(r => `<span class="badge" style="margin:2px;background:var(--brand-light);color:var(--brand);">${r.title} (${r.max_points}分)</span>`).join('')}
            <span style="font-weight:600;margin-left:8px;">滿分: ${asg.max_score}</span></div>` : '';

        main.innerHTML = `
            <div class="form-section">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                    <div>
                        <h3>${asg.title} ${AssignmentUI.badge(asg.status)}</h3>
                        <p style="color:var(--text-secondary);margin-top:8px;">${asg.description || '無描述'}</p>
                        <div style="margin-top:12px;font-size:13px;color:var(--text-secondary);display:flex;gap:16px;">
                            <span>${AssignmentUI.ICON.user} ${target}</span>
                            <span>${AssignmentUI.ICON.clock} 截止: ${AssignmentUI.formatDate(asg.deadline)}</span>
                            <span>${AssignmentUI.ICON.folder} ${asg.submission_count||0} 份提交</span>
                            <span>${AssignmentUI.ICON.check} ${asg.graded_count||0} 已批改</span>
                            ${asg.avg_score ? `<span>${AssignmentUI.ICON.chart} 平均: ${Number(asg.avg_score).toFixed(1)}</span>` : ''}
                        </div>
                        ${rubricHtml}
                    </div>
                </div>
            </div>
            <h3 style="margin-bottom:16px;">學生提交</h3>
            ${AssignmentUI.renderSubmissionsList(subs)}
        `;
    },

    // ---- Teacher: View Single Submission (Grading) ----
    async viewSubmission(subId) {
        this.state.phase = 'submission-detail';
        this.state.currentSubmission = subId;

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

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
                </div>
                <div>
                    ${rubricItems.length ? AssignmentUI.renderGradingPanel(rubricItems, existingScores, sub.feedback || '') : `
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

    updateGradeTotal() {
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
        const inputs = document.querySelectorAll('.rubric-input');
        const scores = [];
        inputs.forEach(inp => {
            scores.push({
                rubric_item_id: parseInt(inp.dataset.id),
                points: parseFloat(inp.value) || 0
            });
        });
        const feedback = document.getElementById('gradeFeedback')?.value || '';

        const resp = await AssignmentAPI.gradeSubmission(this.state.currentSubmission, {
            rubric_scores: scores,
            feedback: feedback
        });
        if (resp?.success) {
            alert('批改完成！');
            this.viewAssignment(this.state.currentAssignment);
        } else {
            alert('批改失敗: ' + (resp?.message || resp?.detail || '未知錯誤'));
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
        if (statusEl) statusEl.innerHTML = `<div style="color:var(--color-success);font-size:14px;margin-bottom:12px;">${AssignmentUI.ICON.check} AI 批改完成，分數已填入</div>`;

        // Fill in scores
        (result.items || []).forEach(item => {
            const inp = document.querySelector(`.rubric-input[data-id="${item.rubric_item_id}"]`);
            if (inp) inp.value = item.points;
            const reasonEl = document.getElementById(`aiReason_${item.rubric_item_id}`);
            if (reasonEl) reasonEl.textContent = `AI: ${item.reason || ''}`;
            this.state.aiReasons[item.rubric_item_id] = item.reason || '';
        });

        // Fill in feedback
        if (result.overall_feedback) {
            const fb = document.getElementById('gradeFeedback');
            if (fb) fb.value = result.overall_feedback;
        }

        this.updateGradeTotal();
    },

    // ---- Teacher: Create/Edit ----
    async openCreateModal(editId = null) {
        this.state.editingId = editId;
        document.getElementById('createModalTitle').textContent = editId ? '編輯作業' : '創建作業';

        // Load targets
        if (!this.state.targets) {
            const resp = await AssignmentAPI.getTargets();
            if (resp?.success) this.state.targets = resp.data;
        }

        // Reset form
        if (!editId) {
            document.getElementById('asgTitle').value = '';
            document.getElementById('asgDesc').value = '';
            document.getElementById('asgTargetType').value = 'all';
            document.getElementById('asgDeadline').value = '';
            document.getElementById('asgMaxFiles').value = '5';
            document.getElementById('asgAllowLate').checked = false;
            document.getElementById('rubricRows').innerHTML = '';
            this.addRubricRow();
            this.onTargetTypeChange();
        } else {
            // Load assignment for editing
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

                // Load rubric items
                const rows = document.getElementById('rubricRows');
                rows.innerHTML = '';
                (a.rubric_items || []).forEach(item => {
                    this.addRubricRow(item.title, item.max_points);
                });
                if (!a.rubric_items?.length) this.addRubricRow();

                this.onTargetTypeChange();
                if (a.target_value) {
                    document.getElementById('asgTargetValue').value = a.target_value;
                }
            }
        }

        document.getElementById('createModal').classList.add('active');
    },

    closeCreateModal() {
        document.getElementById('createModal').classList.remove('active');
    },

    onTargetTypeChange() {
        const type = document.getElementById('asgTargetType').value;
        const group = document.getElementById('targetValueGroup');
        const label = document.getElementById('targetValueLabel');
        const select = document.getElementById('asgTargetValue');

        if (type === 'all') {
            group.style.display = 'none';
            return;
        }

        group.style.display = '';
        select.innerHTML = '';

        if (type === 'class') {
            label.textContent = '選擇班級';
            const classes = this.state.targets?.classes || [];
            classes.forEach(c => {
                select.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else if (type === 'student') {
            label.textContent = '選擇學生';
            const students = this.state.targets?.students || [];
            students.forEach(s => {
                select.innerHTML += `<option value="${s.username}">${s.display_name || s.username} (${s.class_name || ''})</option>`;
            });
        }
    },

    addRubricRow(title = '', maxPoints = '') {
        const rows = document.getElementById('rubricRows');
        const row = document.createElement('div');
        row.className = 'rubric-row';
        row.innerHTML = `
            <input type="text" class="rubric-title" placeholder="評分項目名稱" value="${title}">
            <input type="number" class="rubric-points" placeholder="滿分" value="${maxPoints}" min="0" step="0.5"
                oninput="AssignmentApp.updateRubricTotal()">
            <button class="remove-btn" onclick="this.parentElement.remove();AssignmentApp.updateRubricTotal();">✕</button>
        `;
        rows.appendChild(row);
        this.updateRubricTotal();
    },

    updateRubricTotal() {
        const inputs = document.querySelectorAll('.rubric-points');
        let total = 0;
        inputs.forEach(inp => total += parseFloat(inp.value) || 0);
        document.getElementById('rubricTotal').textContent = total;
    },

    _getFormData() {
        const rubricRows = document.querySelectorAll('#rubricRows .rubric-row');
        const rubric_items = [];
        rubricRows.forEach(row => {
            const title = row.querySelector('.rubric-title').value.trim();
            const points = parseFloat(row.querySelector('.rubric-points').value) || 0;
            if (title && points > 0) rubric_items.push({ title, max_points: points });
        });

        const targetType = document.getElementById('asgTargetType').value;
        let targetValue = null;
        if (targetType !== 'all') {
            targetValue = document.getElementById('asgTargetValue').value;
        }

        return {
            title: document.getElementById('asgTitle').value.trim(),
            description: document.getElementById('asgDesc').value.trim(),
            target_type: targetType,
            target_value: targetValue,
            deadline: document.getElementById('asgDeadline').value || null,
            max_files: parseInt(document.getElementById('asgMaxFiles').value) || 5,
            allow_late: document.getElementById('asgAllowLate').checked,
            rubric_items
        };
    },

    async saveAsDraft() {
        const data = this._getFormData();
        if (!data.title) { alert('請輸入標題'); return; }

        let resp;
        if (this.state.editingId) {
            resp = await AssignmentAPI.updateAssignment(this.state.editingId, data);
        } else {
            resp = await AssignmentAPI.createAssignment(data);
        }

        if (resp?.success) {
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            alert('保存失敗: ' + (resp?.message || resp?.detail || ''));
        }
    },

    async saveAndPublish() {
        const data = this._getFormData();
        if (!data.title) { alert('請輸入標題'); return; }

        let resp;
        if (this.state.editingId) {
            resp = await AssignmentAPI.updateAssignment(this.state.editingId, data);
            if (resp?.success) {
                resp = await AssignmentAPI.publishAssignment(this.state.editingId);
            }
        } else {
            resp = await AssignmentAPI.createAssignment(data);
            if (resp?.success) {
                const newId = resp.data?.id;
                if (newId) resp = await AssignmentAPI.publishAssignment(newId);
            }
        }

        if (resp?.success) {
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            alert('發布失敗: ' + (resp?.message || resp?.detail || ''));
        }
    },

    async editAssignment(id) {
        this.openCreateModal(id);
    },

    async publishAssignment(id) {
        if (!confirm('確定要發布此作業？')) return;
        const resp = await AssignmentAPI.publishAssignment(id);
        if (resp?.success) this.viewAssignment(id);
        else alert('發布失敗');
    },

    async closeAssignment(id) {
        if (!confirm('確定要關閉此作業？關閉後學生將無法提交。')) return;
        const resp = await AssignmentAPI.closeAssignment(id);
        if (resp?.success) this.viewAssignment(id);
        else alert('關閉失敗');
    },

    async deleteAssignment(id) {
        if (!confirm('確定要刪除此作業？此操作不可撤銷。')) return;
        const resp = await AssignmentAPI.deleteAssignment(id);
        if (resp?.success) this.showTeacherList();
        else alert('刪除失敗');
    },

    // ---- Student ----
    async showStudentList() {
        this.state.phase = 'list';
        this.setBreadcrumb([{ label: '我的作業' }]);

        const tabs = ['', 'not_submitted', 'submitted', 'graded'];
        const tabLabels = ['全部', '待提交', '已提交', '已批改'];
        this.setHeaderActions(`<div class="tabs" style="border:none;">
            ${tabs.map((t, i) => `<button class="tab-btn ${i === 0 ? 'active' : ''}"
                onclick="AssignmentApp.filterStudentAssignments('${t}', this)">${tabLabels[i]}</button>`).join('')}
        </div>`);

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

        const resp = await AssignmentAPI.listMyAssignments();
        if (!resp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }

        this._studentAssignments = resp.data || [];
        main.innerHTML = AssignmentUI.renderStudentAssignments(this._studentAssignments);
    },

    async filterStudentAssignments(status, btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if (btn) btn.classList.add('active');

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

        const resp = await AssignmentAPI.listMyAssignments(status);
        if (!resp?.success) { main.innerHTML = '<p>載入失敗</p>'; return; }

        main.innerHTML = AssignmentUI.renderStudentAssignments(resp.data || []);
    },

    async viewStudentAssignment(id) {
        this.state.phase = 'student-detail';
        this.state.currentAssignment = id;

        const main = document.getElementById('mainContent');
        main.innerHTML = '<div style="text-align:center;padding:40px"><div class="loading-spinner"></div></div>';

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

        let html = `<div class="form-section">
            <h3>${asg.title}</h3>
            <p style="color:var(--text-secondary);margin-top:8px;">${asg.description || '無描述'}</p>
            <div style="margin-top:12px;font-size:13px;color:var(--text-secondary);display:flex;gap:16px;flex-wrap:wrap;">
                <span>${AssignmentUI.ICON.user} ${asg.created_by_name || ''}</span>
                <span>${AssignmentUI.ICON.clock} 截止: ${AssignmentUI.formatDate(asg.deadline)}</span>
                <span>${AssignmentUI.ICON.clip} 最多 ${asg.max_files || 5} 個文件</span>
                ${asg.allow_late ? '<span>${AssignmentUI.ICON.clock} 允許逾期</span>' : ''}
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
            </div>`;

            if (sub.status === 'graded') {
                const rubricItems = asg.rubric_items || [];
                const scores = sub.rubric_scores || [];
                const scoreMap = {};
                scores.forEach(s => scoreMap[s.rubric_item_id] = s.points);

                html += `<div class="form-section">
                    <h3>${AssignmentUI.ICON.chart} 成績</h3>
                    <div class="grade-total" style="border-top:none;padding-top:0;">
                        <span>總分</span>
                        <span style="color:var(--brand);font-size:24px;">${sub.score} / ${asg.max_score}</span>
                    </div>`;

                if (rubricItems.length) {
                    html += '<div style="margin-top:12px;">';
                    rubricItems.forEach(item => {
                        const pts = scoreMap[item.id] !== undefined ? scoreMap[item.id] : '—';
                        const pct = pts !== '—' ? (pts / item.max_points * 100) : 0;
                        const color = pct >= 80 ? 'var(--color-success)' : pct >= 60 ? 'var(--color-warning)' : 'var(--color-error)';
                        html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border-light);">
                            <span style="flex:1;font-size:14px;">${item.title}</span>
                            <span style="color:${color};font-weight:600;">${pts}</span>
                            <span style="color:var(--text-tertiary);font-size:13px;">/ ${item.max_points}</span>
                        </div>`;
                    });
                    html += '</div>';
                }

                if (sub.feedback) {
                    html += `<div style="margin-top:16px;padding:12px;background:var(--brand-light);border-radius:8px;">
                        <div style="font-size:13px;font-weight:600;color:var(--brand);margin-bottom:4px;">教師評語</div>
                        <p style="font-size:14px;color:var(--text-primary);">${sub.feedback}</p>
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
    },

    _addFiles(fileList) {
        for (const f of fileList) {
            if (this.state.selectedFiles.length >= 5) { alert('最多 5 個文件'); break; }
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
            alert('提交成功！');
            this.viewStudentAssignment(this.state.currentAssignment);
        } else {
            alert('提交失敗: ' + (resp?.message || resp?.detail || ''));
        }
    },

    // ---- Code Preview & Swift Run ----
    async viewCode(fileId, filePath, fileName) {
        const area = document.getElementById('codePreviewArea');
        if (!area) return;
        try {
            const resp = await fetch('/' + filePath, { headers: AssignmentAPI._authHeaders() });
            const text = await resp.text();
            area.innerHTML = `<div class="form-section">
                <h3>💻 ${fileName}</h3>
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
});
