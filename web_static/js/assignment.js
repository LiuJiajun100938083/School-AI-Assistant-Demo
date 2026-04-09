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
    // Submit multipart upload 的預設 timeout (10 分鐘 — 留足空間給大 zip)
    UPLOAD_TIMEOUT_MS: 10 * 60 * 1000,

    _headers() {
        const h = { 'Content-Type': 'application/json' };
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        // ngrok 免費版:跳過 browser warning interstitial
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
    async _call(url, opts = {}) {
        try {
            const resp = await fetch(url, { headers: this._headers(), ...opts });
            if (resp.status === 401) { window.location.href = '/'; return null; }
            return resp.json();
        } catch (e) { console.error('API error:', e); return null; }
    },

    // ── Ngrok workaround ─────────────────────────────────────
    // Ngrok 免費版會掃 POST body 的 magic bytes,看到 zip (PK\x03\x04)
    // 或其他 archive 就擋掉(回 ERR_ACCESS_DENIED,後端 log 完全看不到)。
    // 解法:前端把 archive 檔案每個 byte XOR 0xFF,副檔名加 .xored。
    // ngrok 看到的是亂碼 → 放行;後端偵測 .xored → 用 bytes.translate
    // 快速還原 → 存檔時用去掉 .xored 的原始檔名。
    ARCHIVE_EXTENSIONS: ['.zip', '.swiftpm', '.rar', '.7z', '.tar', '.gz', '.tgz'],

    isArchiveFile(file) {
        const name = (file && file.name || '').toLowerCase();
        return this.ARCHIVE_EXTENSIONS.some(ext => name.endsWith(ext));
    },

    async obfuscateIfArchive(file) {
        if (!this.isArchiveFile(file)) return file;
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) bytes[i] ^= 0xFF;
        // 檔名後加 .xored;後端偵測到會 strip + XOR 還原
        return new File([bytes], file.name + '.xored', {
            type: 'application/octet-stream',
        });
    },

    async appendFiles(formData, fieldName, files) {
        if (!files || !files.length) return;
        for (const f of files) {
            const out = await this.obfuscateIfArchive(f);
            formData.append(fieldName, out);
        }
    },

    /**
     * Multipart submit 共用 helper。永遠不 throw,一律回傳
     * {success, message, data?}
     * shape,這樣呼叫端的 finally block 一定會執行。
     */
    async _submitMultipart(url, formData, timeoutMs) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs || this.UPLOAD_TIMEOUT_MS);
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: this._authHeaders(),
                body: formData,
                signal: controller.signal,
            });
            clearTimeout(timer);

            if (resp.status === 401) { window.location.href = '/'; return { success: false, message: '未登入' }; }

            // 嘗試解析 JSON,若失敗(例如 ngrok interstitial / nginx 413 HTML 頁)回傳友善訊息
            const text = await resp.text();
            let body;
            try { body = text ? JSON.parse(text) : {}; }
            catch (e) {
                return {
                    success: false,
                    message: `伺服器回傳非 JSON 內容 (HTTP ${resp.status}) — 可能被代理/防火牆攔截`,
                };
            }

            if (!resp.ok) {
                return {
                    success: false,
                    message: body.message || body.detail || `HTTP ${resp.status}`,
                    ...body,
                };
            }
            return body;  // 正常情況 {success: true, data, message}
        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                return { success: false, message: `上傳逾時 (超過 ${Math.round((timeoutMs || this.UPLOAD_TIMEOUT_MS) / 1000)} 秒),請檢查網路或檔案大小` };
            }
            // TypeError: Failed to fetch — 網路/瀏覽器/proxy 層擋掉
            if (err instanceof TypeError) {
                return {
                    success: false,
                    message: `連線失敗 (${err.message})。如果透過 ngrok,Chrome Safe Browsing 可能封鎖了此網域;請改用 LAN 直連、Tailscale 或 Cloudflare Tunnel`,
                };
            }
            console.error('Upload error:', err);
            return { success: false, message: err.message || '上傳失敗' };
        }
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
        if (!resp.ok) throw new Error(i18n.t('asg.toast.exportFail'));
        return resp;
    },
    // Excel export (returns raw Response, not parsed JSON)
    async exportExcel(assignmentId) {
        const token = AuthModule?.getToken?.() || localStorage.getItem('auth_token');
        const resp = await fetch(`/api/assignments/teacher/${assignmentId}/export-excel`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        if (resp.status === 401) { window.location.href = '/'; return null; }
        if (!resp.ok) throw new Error(i18n.t('asg.toast.exportFail'));
        return resp;
    },
    async getTargets() {
        return this._call('/api/assignments/teacher/targets');
    },

    // Exam Paper OCR APIs
    async uploadExamPaper(files) {
        const formData = new FormData();
        await this.appendFiles(formData, 'files', files);
        return this._submitMultipart(
            '/api/assignments/teacher/upload-exam-paper',
            formData,
        );
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
        await this.appendFiles(formData, 'files', files);
        return this._submitMultipart(
            `/api/assignments/${assignmentId}/submit`,
            formData,
        );
    },
    async teacherSubmitForStudent(assignmentId, studentUsername, files, content = '') {
        const formData = new FormData();
        formData.append('student_username', studentUsername);
        formData.append('content', content);
        await this.appendFiles(formData, 'files', files);
        return this._submitMultipart(
            `/api/assignments/teacher/${assignmentId}/submit-for-student`,
            formData,
        );
    },

    // Form APIs
    async submitForm(assignmentId, answersJson, filesByQuestion) {
        const formData = new FormData();
        formData.append('answers', answersJson);
        if (filesByQuestion) {
            for (const [qId, files] of Object.entries(filesByQuestion)) {
                await this.appendFiles(formData, `files_${qId}`, files);
            }
        }
        return this._submitMultipart(
            `/api/assignments/${assignmentId}/submit-form`,
            formData,
        );
    },
    async submitExam(assignmentId, answers) {
        return this._call(`/api/assignments/${assignmentId}/submit-exam`, {
            method: 'POST',
            body: JSON.stringify({ answers }),
        });
    },
    async aiGradeForm(submissionId) {
        // AI 批改可能需要較長時間（每題 ~7s），3 分鐘超時
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180000);
        try {
            const resp = await fetch(
                `/api/assignments/teacher/submissions/${submissionId}/ai-grade-form`,
                { method: 'POST', headers: this._headers(), signal: controller.signal }
            );
            if (resp.status === 401) { window.location.href = '/'; return null; }
            return resp.json();
        } catch (e) {
            if (e.name === 'AbortError') {
                console.error('AI 批改超時 (3min)');
                return { success: false, message: i18n.t('asg.ai.gradeTimeout') };
            }
            console.error('API error:', e);
            return null;
        } finally { clearTimeout(timer); }
    },
    async gradeFormAnswer(submissionId, answerId, data) {
        return this._call(`/api/assignments/teacher/submissions/${submissionId}/answers/${answerId}/grade`, {
            method: 'PUT', body: JSON.stringify(data)
        });
    },

    // Attachments
    async uploadAttachments(assignmentId, files) {
        const formData = new FormData();
        await this.appendFiles(formData, 'files', files);
        return this._submitMultipart(
            `/api/assignments/teacher/${assignmentId}/attachments`,
            formData,
        );
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

    get STATUS_LABELS() {
        return {
            draft: i18n.t('asg.status.draft'), published: i18n.t('asg.status.published'), closed: i18n.t('asg.status.closed'),
            submitted: i18n.t('asg.status.submitted'), graded: i18n.t('asg.status.graded'), returned: i18n.t('asg.status.returned'),
            not_submitted: i18n.t('asg.status.notSubmitted')
        };
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
    ocrStatusLabel(a) {
        if (!a.exam_batch_id) return '';
        const st = a.ocr_status;
        if (st === 'processing' || st === 'uploading')
            return `<span class="ocr-status ocr-processing">${i18n.t('asg.ocr.processing')}</span>`;
        if (st === 'completed')
            return `<span class="ocr-status ocr-done">${i18n.t('asg.ocr.completed', {count: a.ocr_question_count||0})}</span>`;
        if (st === 'failed')
            return `<span class="ocr-status ocr-failed">${i18n.t('asg.ocr.failed')}</span>`;
        return '';
    },

    renderTeacherListView(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${this.ICON.inbox}</div>
            <div class="empty-state-text">${i18n.t('asg.list.emptyTeacher')}</div>
            <div class="empty-state-hint">${i18n.t('asg.list.emptyTeacherHint')}</div></div>`;
        return `<div class="assignment-table"><table>
            <thead><tr><th>${i18n.t('asg.list.thTitle')}</th><th>${i18n.t('asg.list.thTeacher')}</th><th>${i18n.t('asg.list.thTarget')}</th><th>${i18n.t('asg.list.thDeadline')}</th><th>${i18n.t('asg.list.thSubmission')}</th><th>${i18n.t('asg.list.thStatus')}</th></tr></thead>
            <tbody>${assignments.map(a => {
                const target = a.target_type === 'all' ? i18n.t('asg.list.targetAll') :
                    a.target_type === 'class' ? a.target_value : i18n.t('asg.list.targetStudent');
                return `<tr onclick="AssignmentApp.viewAssignment(${a.id})">
                    <td class="title-cell">${a.title} ${this.ocrStatusLabel(a)}</td>
                    <td>${a.created_by_name || ''}</td>
                    <td>${target}</td>
                    <td>${this.formatDate(a.deadline)}</td>
                    <td>${i18n.t('asg.list.submissionCount', {count: a.submission_count||0})}</td>
                    <td>${this.badge(a.status)}</td></tr>`;
            }).join('')}</tbody></table></div>`;
    },

    // ---- Teacher Grid View (SaaS redesign) ----
    renderTeacherGridView(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">${i18n.t('asg.list.emptyTeacher')}</div>
            <div class="empty-state-hint">${i18n.t('asg.list.emptyTeacherHint')}</div></div>`;
        return `<div class="assignment-grid">${assignments.map(a => {
            const pct = a.submission_count > 0 ? Math.round((a.graded_count||0)/(a.submission_count)*100) : 0;
            const desc = a.description ? a.description.slice(0, 60) : '';
            const target = a.target_type === 'all' ? i18n.t('asg.list.targetAll') :
                a.target_type === 'class' ? a.target_value : i18n.t('asg.list.targetStudent');
            return `<div class="grid-card" data-status="${a.status}" tabindex="0" onclick="AssignmentApp.viewAssignment(${a.id})" onkeydown="event.key==='Enter'&&this.click()">
                <div class="grid-card-header">
                    <div class="grid-card-title">${a.title}</div>
                    ${this.badge(a.status)}
                </div>
                ${desc ? `<div class="grid-card-desc">${desc}</div>` : ''}
                ${this.ocrStatusLabel(a) ? `<div class="grid-card-ocr">${this.ocrStatusLabel(a)}</div>` : ''}
                <div class="grid-card-meta">
                    <span>${i18n.t('asg.list.deadlinePrefix')}${this.formatDate(a.deadline)}</span>
                    <span class="meta-dot">·</span>
                    <span>${i18n.t('asg.list.submissionCountInline', {count: a.submission_count||0})}</span>
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
        if (days < 0) return `<span class="deadline-warn overdue">${i18n.t('asg.deadline.overdue')}</span>`;
        if (days <= 1) return `<span class="deadline-warn urgent">${i18n.t('asg.deadline.today')}</span>`;
        if (days <= 3) return `<span class="deadline-warn soon">${i18n.t('asg.deadline.daysLeft', {days})}</span>`;
        return '';
    },

    renderStudentAssignments(assignments) {
        if (!assignments.length) return `<div class="empty-state">
            <div class="empty-state-icon">${AssignmentUI.ICON.inbox}</div>
            <div class="empty-state-text">${i18n.t('asg.list.emptyStudent')}</div></div>`;
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
                    <span>${i18n.t('asg.list.deadlinePrefix')}${this.formatDate(a.deadline)}</span>
                    <span class="meta-dot">·</span>
                    <span>${a.created_by_name||''}</span>
                    ${warn ? `<span class="meta-dot">·</span>${warn}` : ''}
                </div>
                <div class="grid-card-footer">
                    ${a.my_score !== null && a.my_score !== undefined ?
                        `<span class="submission-score">${a.my_score}/${a.max_score}</span>` :
                        `<span style="color:var(--text-tertiary);font-size:13px;">${i18n.t('asg.list.notScored')}</span>`}
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
            <div class="empty-state-text">${i18n.t('asg.list.noSubmissions')}</div></div>`;
        return `<div class="assignment-grid">${submissions.map(s => {
            const initial = (s.student_name || s.username || '?')[0].toUpperCase();
            return `<div class="submission-card" tabindex="0" onclick="AssignmentApp.viewSubmission(${s.id})" onkeydown="event.key==='Enter'&&this.click()">
                <div class="student-avatar">${initial}</div>
                <div class="submission-info">
                    <h4>${s.student_name || s.username}</h4>
                    <p>${s.class_name || ''} · ${this.formatDate(s.submitted_at)}
                    ${s.is_late ? ` <span class="badge badge-late">${i18n.t('asg.status.late')}</span>` : ''}</p>
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
                    <span class="badge badge-not_submitted">${i18n.t('asg.status.notSubmitted')}</span>
                    <span class="proxy-drop-text">${i18n.t('asg.proxy.dragHint')}</span>
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
                    <span class="proxy-drop-text">${i18n.t('asg.proxy.resubmitHint')}</span>
                </div>
                <div class="proxy-files-area" id="proxyFiles_${s.username}" style="display:none;"></div>
            </div>`);
        });

        if (!allCards.length) return `<div class="empty-state">
            <div class="empty-state-icon">${this.ICON.inbox}</div>
            <div class="empty-state-text">${i18n.t('asg.list.noProxyStudents')}</div></div>`;

        return `<div class="proxy-submit-hint" style="margin-bottom:12px;padding:12px 16px;background:var(--brand-lighter);border-radius:var(--radius-card);font-size:13px;color:var(--text-secondary);display:flex;align-items:center;gap:8px;">
            ${this.ICON.upload} ${i18n.t('asg.proxy.submitHelp')}
        </div>
        <div class="assignment-grid">${allCards.join('')}</div>`;
    },

    // ---- File List ----
    renderFiles(files, opts = {}) {
        if (!files || !files.length) return `<p style="color:var(--text-tertiary);font-size:14px;">${i18n.t('asg.file.noFiles')}</p>`;
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
                        ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${f.file_path}')">${i18n.t('asg.file.run')}</button>` : ''}
                        ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${f.file_path}','${AssignmentUI._escapeHtml(f.original_name)}')">${i18n.t('asg.file.runPreview')}</button>` : ''}
                        <button class="btn btn-sm btn-outline" onclick="this.closest('.file-preview-block').classList.toggle('collapsed')">${i18n.t('asg.file.collapse')}</button>
                        <a class="btn btn-sm btn-outline" href="/${f.file_path}" download="${AssignmentUI._escapeHtml(f.original_name)}">${i18n.t('asg.file.download')}</a>
                    </div>
                    <div class="file-preview-content" data-loaded="false">
                        <div class="file-preview-loading"><div class="loading-spinner"></div> ${i18n.t('asg.file.loadingPreview')}</div>
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
                    ${f.file_type === 'image' ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.previewImage('/${f.file_path}')">${i18n.t('asg.file.preview')}</button>` : ''}
                    ${f.file_type === 'pdf' ? `<button class="btn btn-sm btn-outline" onclick="window.open('/${f.file_path}','_blank')">${i18n.t('asg.file.view')}</button>` : ''}
                    ${isCode ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.viewCode(${f.id},'${f.file_path}','${f.original_name}')">${i18n.t('asg.file.viewCode')}</button>` : ''}
                    ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${f.file_path}')">${i18n.t('asg.file.run')}</button>` : ''}
                    ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${f.file_path}','${f.original_name}')">${i18n.t('asg.file.runPreview')}</button>` : ''}
                    ${f.file_type === 'video' ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewVideo('/${f.file_path}','${f.original_name}')">${i18n.t('asg.file.play')}</button>` : ''}
                    <a class="btn btn-sm btn-outline" href="/${f.file_path}" download="${f.original_name}">${i18n.t('asg.file.download')}</a>
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
                <h3 style="margin:0;">${AssignmentUI.ICON.inbox} ${i18n.t('asg.grade.panelTitle')}</h3>
                ${typeBadge}
            </div>
            <button class="btn btn-ai" style="width:100%;margin-bottom:16px;" onclick="AssignmentApp.doAiGrade()">
                ${AssignmentUI.ICON.ai} ${i18n.t('asg.grade.aiAutoGrade')}
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
                        <span>${lv.label}</span><span>${lv.min}-${lv.max} ${i18n.t('asg.grade.pts')}</span>
                    </div>
                    <div class="holistic-option-desc">${lv.description || ''}</div>
                </div>`;
            });
            html += `<div class="form-group" style="margin-top:12px;">
                <label>${i18n.t('asg.grade.scoreInRange')}</label>
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
                            ${passed ? i18n.t('asg.grade.passed') : i18n.t('asg.grade.failed')}
                        </span>
                    </div>
                    <div class="ai-reason" id="aiReason_${item.id}">${reason}</div>
                </div>`;
            });
            const maxScore = rubricConfig?.max_score || 100;
            html += `<div class="grade-total">
                <span>${i18n.t('asg.grade.scored')}</span>
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
                <span>${i18n.t('asg.grade.totalScore')}</span>
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
                <span>${i18n.t('asg.grade.weightedTotal')}</span>
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
                <span>${i18n.t('asg.grade.totalScore')}</span>
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
                <span>${i18n.t('asg.grade.totalScore')}</span>
                <span><span id="gradeTotal">0</span> / ${rubricItems.reduce((s,i)=>s+parseFloat(i.max_points||0),0)}</span>
            </div>`;
        }

        // Feedback + submit (always present except pure competency keeps submit)
        html += `<div class="form-group" style="margin-top:16px;">
            <label>${i18n.t('asg.grade.feedback')}</label>
            <textarea id="gradeFeedback" rows="3" placeholder="${i18n.t('asg.grade.feedbackPh')}">${feedback}</textarea>
        </div>
        <button class="btn btn-primary" style="width:100%;" onclick="AssignmentApp.doGrade()">${i18n.t('asg.grade.submit')}</button>
        </div>`;
        return html;
    },

    // ---- Plagiarism Detection UI ----

    renderPlagiarismReport(report, pairs, clusters, hubStudents) {
        if (!report) return `<div class="empty-state"><div class="empty-state-text">${i18n.t('asg.plag.notRun')}</div></div>`;

        clusters = clusters || [];
        hubStudents = hubStudents || [];
        const statusMap = { completed: i18n.t('asg.plag.statusCompleted'), running: i18n.t('asg.plag.statusRunning'), failed: i18n.t('asg.plag.statusFailed'), pending: i18n.t('asg.plag.statusPending') };
        const statusClass = { completed: 'badge-graded', running: 'badge-submitted', failed: 'badge-late', pending: 'badge-not_submitted' };
        const flaggedPairs = (pairs || []).filter(p => p.is_flagged);
        const totalStudents = new Set();
        (pairs || []).forEach(p => {
            if (p.student_a_name) totalStudents.add(p.student_a_name);
            if (p.student_b_name) totalStudents.add(p.student_b_name);
        });

        // 風險等級判定
        const riskLevel = report.flagged_pairs === 0 ? 'low' : (report.flagged_pairs <= 3 ? 'medium' : 'high');
        const riskLabel = { low: i18n.t('asg.plag.riskLow'), medium: i18n.t('asg.plag.riskMedium'), high: i18n.t('asg.plag.riskHigh') };
        const riskColor = { low: 'var(--color-success, #248A3D)', medium: 'var(--text-secondary)', high: 'var(--text-primary)' };

        // ---- Dashboard Header (Action buttons + Title) ----
        let html = `<div class="plagiarism-report fade-in">
            <div class="plag-dashboard-header">
                <div class="plag-dashboard-top">
                    <button class="btn btn-outline btn-sm" onclick="AssignmentApp.closePlagiarismReport()">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        ${i18n.t('asg.plag.backToAssignment')}
                    </button>
                    <div class="plag-dashboard-actions">
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.showAlgorithmModal()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                            ${i18n.t('asg.plag.algorithmBtn')}
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.exportPlagiarismExcel()" id="plagExportBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                            ${i18n.t('asg.export.exportExcel')}
                        </button>
                        <button class="btn btn-sm btn-outline" onclick="AssignmentApp.startPlagiarismCheck()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>
                            ${i18n.t('asg.plag.recheck')}
                        </button>
                    </div>
                </div>
                <div class="plag-dashboard-title">
                    <div>
                        <h2>${i18n.t('asg.plag.reportTitle')}</h2>
                        <p class="plag-dashboard-meta">
                            <span class="badge ${statusClass[report.status] || ''}">${statusMap[report.status] || report.status}</span>
                            ${report.subject ? `<span class="badge badge-graded">${report.subject}</span>` : ''}
                            ${report.detect_mode ? `<span class="badge badge-submitted">${({code:i18n.t('asg.plag.modeCode'),text:i18n.t('asg.plag.modeText'),mixed:i18n.t('asg.plag.modeMixed'),chinese_essay:i18n.t('asg.plag.modeChineseEssay'),english_essay:i18n.t('asg.plag.modeEnglishEssay')})[report.detect_mode] || report.detect_mode}</span>` : ''}
                            ${i18n.t('asg.plag.checkTime')} ${report.created_at || '-'} · ${i18n.t('asg.plag.threshold')} ${report.threshold}%${report.completed_at ? ` · ${i18n.t('asg.plag.completedAt')} ${report.completed_at}` : ''}
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
                        ? `<span>${i18n.t('asg.plag.noSuspicious')}</span>`
                        : `<span>${i18n.t('asg.plag.foundPairs', {count: report.flagged_pairs})}${clusters.length > 0 ? `，${i18n.t('asg.plag.foundClusters', {count: clusters.length})}` : ''}</span>`
                    }
                </div>
            </div>
            <div class="plag-metrics">
                <div class="plag-metric">
                    <div class="plag-metric-value">${totalStudents.size}</div>
                    <div class="plag-metric-label">${i18n.t('asg.plag.participantStudents')}</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value">${report.total_pairs}</div>
                    <div class="plag-metric-label">${i18n.t('asg.plag.totalPairs')}</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${report.flagged_pairs > 0 ? ' has-issue' : ''}">${report.flagged_pairs}</div>
                    <div class="plag-metric-label">${i18n.t('asg.plag.suspiciousPairs')}</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${clusters.length > 0 ? ' has-issue' : ''}">${clusters.length}</div>
                    <div class="plag-metric-label">${i18n.t('asg.plag.plagiarismClusters')}</div>
                </div>
                <div class="plag-metric">
                    <div class="plag-metric-value${hubStudents.length > 0 ? ' has-issue' : ''}">${hubStudents.length}</div>
                    <div class="plag-metric-label">${i18n.t('asg.plag.suspectedSource')}</div>
                </div>
            </div>
        </div>`;

        // ---- Hub Students ----
        if (hubStudents.length > 0) {
            html += `<div class="plag-hub-section">
                <div class="plag-section-title">${i18n.t('asg.plag.hubTitle')} <span class="count">${hubStudents.length}</span></div>
                <p class="plag-hub-desc">${i18n.t('asg.plag.hubDesc')}</p>
                <div class="hub-student-list">
                    ${hubStudents.map(h => `<div class="hub-student-card">
                        <div class="hub-avatar">${(h.name || '?')[0].toUpperCase()}</div>
                        <div class="hub-info">
                            <strong>${h.name}</strong>
                            <span class="hub-meta">${i18n.t('asg.plag.hubMeta', {degree: h.degree, avg: h.avg_score})}</span>
                        </div>
                    </div>`).join('')}
                </div>
            </div>`;
        }

        // ---- Cluster Tree Graph ----
        if (clusters.length > 0) {
            html += `<div class="plag-graph-section">
                <div class="plag-section-title">${i18n.t('asg.plag.treeTitle')} <span class="count">${i18n.t('asg.plag.treeClusters', {count: clusters.length})}</span></div>
                ${this._renderPlagiarismTree(clusters)}
            </div>`;
        }

        // ---- Filter + Pair List ----
        html += `<div class="plag-action-bar">
            <div class="plag-action-bar-left">
                <h3>${i18n.t('asg.plag.pairDetail')}</h3>
            </div>
            <div class="filter-tabs" style="margin:0;">
                <button class="filter-tab active" onclick="AssignmentApp._filterPlagPairs('flagged', this)">${i18n.t('asg.plag.filterSuspicious')} <span class="count">${flaggedPairs.length}</span></button>
                <button class="filter-tab" onclick="AssignmentApp._filterPlagPairs('all', this)">${i18n.t('asg.plag.filterAll')} <span class="count">${(pairs || []).length}</span></button>
            </div>
        </div>`;

        // ---- Pair List ----
        if (!pairs || !pairs.length) {
            html += `<div class="empty-state"><div class="empty-state-text">${i18n.t('asg.plag.noCompareData')}</div></div>`;
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
                    font-size="${fontSize - 2}" fill="var(--text-tertiary)">${i18n.t('asg.plag.suspectedSource')}</text>`;
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
            return `${t.getMonth()+1}/${t.getDate()} ${String(t.getHours()).padStart(2,'0')}:${String(t.getMinutes()).padStart(2,'0')} ${i18n.t('asg.plag.sourceSubmitTime')}`;
        })() : '';
        const sourceLen = source.text_len ? i18n.t('asg.plag.sourceChars', {count: source.text_len}) : '';
        const sourceDetail = [sourceTime, sourceLen].filter(Boolean).join(' · ');

        return `<div class="plag-tree-card">
            <div class="plag-network-header">
                <span class="cluster-title">${i18n.t('asg.plag.clusterTitle', {id: cluster.id})} <span class="count">${i18n.t('asg.plag.clusterMembers', {count: N})}</span></span>
                <span class="cluster-score">${i18n.t('asg.plag.clusterMaxScore', {score: cluster.max_score})}</span>
            </div>
            <svg class="plag-tree-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
                ${svgContent}
            </svg>
            <div class="cluster-source" style="margin-top:var(--space-2);">
                <span class="cluster-source-badge">${i18n.t('asg.plag.sourceLabel')}</span>
                <strong>${source.name}</strong>
                <span style="color:var(--text-tertiary);font-size:var(--type-badge);">${i18n.t('asg.plag.sourceMatchMeta', {degree: source.degree, avg: source.avg_score})}${sourceDetail ? ' · ' + sourceDetail : ''}</span>
            </div>
        </div>`;
    },

    renderPlagiarismPairs(pairs) {
        if (!pairs || !pairs.length) return `<div class="empty-state"><div class="empty-state-text">${i18n.t('asg.plag.noPairData')}</div></div>`;

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
                const fsLabels = { high_risk: i18n.t('asg.risk.high'), review_needed: i18n.t('asg.risk.review'), low_risk: i18n.t('asg.risk.low') };
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
                    ${dims.logicScore ? `<span class="dim-tag">${i18n.t('asg.dim.logic')} ${Math.round(dims.logicScore)}%</span>` : ''}
                    ${dims.styleScore ? `<span class="dim-tag">${i18n.t('asg.dim.style')} ${Math.round(dims.styleScore)}%</span>` : ''}
                    ${dims.winnow ? `<span class="dim-tag">${i18n.t('asg.dim.fingerprint')} ${Math.round(dims.winnow)}%</span>` : ''}
                    ${dims.dataFlow ? `<span class="dim-tag">${i18n.t('asg.dim.dataFlow')} ${Math.round(dims.dataFlow)}%</span>` : ''}
                    <span class="dim-tag">${i18n.t('asg.dim.naming')} ${Math.round(dims.identifier)}%</span>
                    <span class="dim-tag">${i18n.t('asg.dim.verbatimShort')} ${Math.round(dims.verbatim)}%</span>
                    ${dims.typo > 0 ? `<span class="dim-tag evidence-hit">${i18n.t('asg.dim.typo')} ${Math.round(dims.typo)}%</span>` : ''}
                    ${dims.deadCode > 0 ? `<span class="dim-tag evidence-hit">${i18n.t('asg.dim.deadCode')} ${Math.round(dims.deadCode)}%</span>` : ''}
                    ${dims.aiSuspicion >= 20 ? `<span class="dim-tag" style="color:var(--text-tertiary)">${i18n.t('asg.dim.aiSuspicion')} ${Math.round(dims.aiSuspicion)}%</span>` : ''}
                    ${dims.evidenceHits >= 2 ? `<span class="dim-tag evidence-hit">${i18n.t('asg.dim.evidence')} ${dims.evidenceHits}/${td}</span>` : ''}
                </div>`;
            }
            return `<div class="plagiarism-pair-card${p.is_flagged ? ' flagged' : ''}" onclick="AssignmentApp.viewPlagiarismPair(${p.id})">
                <div class="pair-card-left">
                    <div class="pair-students">
                        <span>${p.student_a_name || i18n.t('asg.plag.studentA')}</span>
                        <span class="pair-vs">vs</span>
                        <span>${p.student_b_name || i18n.t('asg.plag.studentB')}</span>
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
        let level = 'low', color = '#4a7c59', label = i18n.t('asg.risk.low');
        if (pct >= 60 || (aiHigh && pct >= 40) || hits >= 4) {
            level = 'high'; color = '#9b2c2c'; label = i18n.t('asg.risk.high');
        } else if (pct >= 40 || hits >= 2 || aiAnalysis) {
            level = 'review'; color = '#b7791f'; label = i18n.t('asg.risk.review');
        }

        // 主要類型
        let type = i18n.t('asg.risk.normal');
        if (dims) {
            if (dims.verbatim > 60) type = i18n.t('asg.risk.directCopy');
            else if (dims.comment > 60 && dims.verbatim < 40 && dims.identifier > 50) type = i18n.t('asg.risk.paraphrase');
            else if (dims.structure > 60 && dims.verbatim < 30) type = i18n.t('asg.risk.structureImitation');
            else if ((dims.cohortSuppressedCount || 0) > 5) type = i18n.t('asg.risk.templateSimilar');
            else if (pct >= 40) type = i18n.t('asg.risk.suspectedPlag');
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
                    ${this._escapeHtml(pair.student_a_name || i18n.t('asg.plag.studentA'))}
                    <span class="verdict-vs">vs</span>
                    ${this._escapeHtml(pair.student_b_name || i18n.t('asg.plag.studentB'))}
                </h3>
                <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closePlagiarismPairDetail()">${i18n.t('asg.plag.backToReport')}</button>
            </div>
            <div class="verdict-body">
                <div class="verdict-badge-row">
                    <span class="verdict-badge" style="background:${risk.color};">${risk.label}</span>
                    ${risk.type !== i18n.t('asg.risk.normal') ? `<span class="verdict-type">${risk.type}</span>` : ''}
                    <span class="verdict-score">${i18n.t('asg.plag.algorithmScore', {score: pct.toFixed(1)})}</span>
                </div>
                ${risk.summary ? `<p class="verdict-summary">${this._escapeHtml(risk.summary)}</p>` : ''}
                ${dims && dims.cohortSize > 0 ? `<p class="verdict-cohort">${i18n.t('asg.plag.cohortSuppressed', {count: dims.cohortSize})}${dims.cohortSuppressedCount > 0 ? i18n.t('asg.plag.phrasesSuppressed', {count: dims.cohortSuppressedCount}) : ''}</p>` : ''}
            </div>
        </div>`;

        // ====== 第 2 塊：關鍵證據摘要 ======
        const blocks = (dims && dims.evidenceBlocks) ? dims.evidenceBlocks.filter(b => b && b.rank) : [];
        if (blocks.length) {
            const topBlocks = blocks.slice(0, 3);
            const strengthDot = s => `<span class="status-dot dot-${s}"></span>`;
            html += `<div class="evidence-summary">
                <h4 class="evidence-summary-title">${i18n.t('asg.plag.keyEvidence')}</h4>
                ${topBlocks.map((b, i) => `<div class="evidence-card evidence-${b.strength}">
                    <div class="evidence-card-header">
                        <span class="evidence-rank">${strengthDot(b.strength)} ${i + 1}.</span>
                        <span class="evidence-desc">${this._escapeHtml(b.description || '')}</span>
                    </div>
                    ${b.snippet_a ? `<div class="evidence-snippets">
                        <div class="evidence-snippet"><span class="snippet-label">A:</span> ${this._escapeHtml(b.snippet_a)}</div>
                        <div class="evidence-snippet"><span class="snippet-label">B:</span> ${this._escapeHtml(b.snippet_b || '')}</div>
                    </div>` : ''}
                    <button class="btn-evidence-jump" onclick="AssignmentApp._scrollToEvidence(${i})">${i18n.t('asg.plag.jumpToOriginal')}</button>
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
                    ${i18n.t('asg.plag.systemAnalysis')}
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
                html += `<h4 class="dim-group-title">${i18n.t('asg.dim.mainEvidence')}</h4>
                    ${mkBarT(i18n.t('asg.dim.verbatim'), dims.verbatim, 'verbatim_score: 逐字重疊率 + 低頻短語加權覆蓋')}
                    ${mkBarT(i18n.t('asg.dim.sentenceOrder'), dims.comment, 'comment_score: 匈牙利匹配 × 0.75 + 句子鏈連續度 × 0.25')}
                    ${mkBarT(i18n.t('asg.dim.semantic'), dims.identifier, 'identifier_score: text2vec 語義嵌入余弦相似度')}
                    ${mkBarT(i18n.t('asg.dim.writingStyle'), dims.indent, 'indent_score: 54 維風格指紋（標點/高頻字/關聯詞/情感動詞/成語/句式）')}
                    <h4 class="dim-group-title">${i18n.t('asg.dim.auxSignals')}</h4>
                    ${mkBarT(i18n.t('asg.dim.essayStructure'), dims.structure, 'structure_score: 功能段落結構 × 0.7 + 段落長度比 × 0.3')}
                    ${mkBarT(i18n.t('asg.dim.openingEnding'), Math.max(dims.openingSim || 0, dims.endingSim || 0), 'boundary: max(opening_sim, ending_sim)')}
                    ${mkBarT(i18n.t('asg.dim.multiDimEvidence'), dims.softEvidenceScore || dims.evidence, `soft_evidence: sigmoid 平滑加權，${dims.softEvidenceHits || dims.evidenceHits || 0}/${dims.softEvidenceDims || dims.totalDims} 維命中`)}`;

                // Cohort 抑制提示
                if (dims.cohortSuppressedCount > 0) {
                    html += `<div class="dim-cohort-note">${i18n.t('asg.plag.suppressedNote', {count: dims.cohortSuppressedCount, weight: (dims.cohortAvgWeight || 1).toFixed(2)})}</div>`;
                }

                // 罕見短語列表
                if (dims.rarePhrases && dims.rarePhrases.length) {
                    html += `<div class="dim-rare-phrases">${i18n.t('asg.plag.rarePhrasesShared')} ${dims.rarePhrases.slice(0, 5).map(p => `<span class="rare-phrase-tag">${this._escapeHtml(p)}</span>`).join(' ')}</div>`;
                }

            } else if (detectMode === 'english_essay') {
                // ---- 英文作文：保留原有結構但用教師標籤 ----
                const risk2 = dims.riskType || {};
                const primaryRisk = risk2.primary_risk || 'normal';
                const riskLabels = { direct_copy: 'Direct Copy', paraphrase: 'Paraphrase', imitation: 'Imitation', normal: 'Normal' };
                const finalStatus = pair.final_status || '';
                if (finalStatus) {
                    const statusLabels = { high_risk: i18n.t('asg.risk.high'), review_needed: i18n.t('asg.risk.reviewManual'), low_risk: i18n.t('asg.risk.low') };
                    const statusColors = { high_risk: '#9b2c2c', review_needed: '#b7791f', low_risk: '#4a7c59' };
                    html += `<div style="margin-bottom:var(--space-3)">
                        <span class="verdict-badge" style="background:${statusColors[finalStatus] || '#888'};">${statusLabels[finalStatus] || finalStatus}</span>
                        ${primaryRisk !== 'normal' ? `<span class="verdict-type">${riskLabels[primaryRisk]}</span>` : ''}
                    </div>`;
                }
                html += `<h4 class="dim-group-title">${i18n.t('asg.dim.mainEvidence')}</h4>
                    ${mkBarT(i18n.t('asg.dim.lexicalOverlap'), dims.verbatim, 'Lexical Overlap: 詞級重合率')}
                    ${mkBarT(i18n.t('asg.dim.sentenceAlignment'), dims.comment, 'Sentence Alignment: 匈牙利匹配')}
                    ${mkBarT(i18n.t('asg.dim.semanticParaphrase'), dims.identifier, 'Semantic Paraphrase: 嵌入向量相似度')}
                    ${mkBarT(i18n.t('asg.dim.discourseStructure'), dims.structure, 'Discourse Structure: 段落功能序列比較')}
                    ${mkBarT(i18n.t('asg.dim.stylometry'), dims.indent, 'Stylometry: 風格計量特徵向量')}
                    <h4 class="dim-group-title">${i18n.t('asg.dim.auxSignals')}</h4>
                    ${mkBarT(i18n.t('asg.dim.openingSim'), dims.openingSim, 'Opening: 前 120 字 SequenceMatcher')}
                    ${mkBarT(i18n.t('asg.dim.endingSim'), dims.endingSim, 'Ending: 後 120 字 SequenceMatcher')}
                    ${dims.rarePhraseScore > 0 ? mkBarT(i18n.t('asg.dim.rarePhrase'), dims.rarePhraseScore, 'Rare Phrase: 低頻 n-gram 加權覆蓋') : ''}
                    ${mkBarT(i18n.t('asg.dim.multiDim'), dims.evidence, `Evidence: ${dims.evidenceHits}/${dims.totalDims} 維命中`)}`;
                if (risk2 && primaryRisk !== 'normal') {
                    html += `<h4 class="dim-group-title">${i18n.t('asg.dim.riskAssessment')}</h4>
                        ${mkBarT('Direct Copy', risk2.risk_direct_copy || 0, '')}
                        ${mkBarT('Paraphrase', risk2.risk_paraphrase || 0, '')}
                        ${mkBarT('Imitation', risk2.risk_imitation || 0, '')}`;
                }
            } else {
                // ---- 代碼/文本模式：保留原結構但用教師標籤 ----
                const logicPct = Math.round(dims.logicScore || 0);
                const stylePct = Math.round(dims.styleScore || 0);
                html += `<div class="plag-dual-scores">
                    <div class="plag-dual-card"><div class="plag-dual-label">${i18n.t('asg.dim.logicSimilarity')}</div><div class="plag-dual-value">${logicPct}%</div></div>
                    <div class="plag-dual-card"><div class="plag-dual-label">${i18n.t('asg.dim.styleConsistency')}</div><div class="plag-dual-value">${stylePct}%</div></div>
                </div>
                ${logicPct > 70 && stylePct < 40 ? `<div class="dim-code-badge">${i18n.t('asg.dim.logicHighStyleLow')}</div>` : ''}
                ${logicPct > 70 && stylePct > 60 ? `<div class="dim-code-badge" style="color:var(--text-primary);font-weight:600;">${i18n.t('asg.dim.logicHighStyleHigh')}</div>` : ''}
                <h4 class="dim-group-title">${i18n.t('asg.dim.logicDimTitle')}</h4>
                ${dims.winnow ? mkBarT(i18n.t('asg.dim.programFingerprint'), dims.winnow, 'Winnowing: MOSS 風格指紋比對') : ''}
                ${mkBarT(i18n.t('asg.dim.codeSkeleton'), dims.structure, 'Token 結構相似度')}
                ${dims.dataFlow ? mkBarT(i18n.t('asg.dim.dataFlow'), dims.dataFlow, '數據流圖相似度') : ''}
                ${mkBarT(i18n.t('asg.dim.verbatimCopy'), dims.verbatim, '字符級重疊率')}
                <h4 class="dim-group-title">${i18n.t('asg.dim.styleDimTitle')}</h4>
                ${mkBarT(i18n.t('asg.dim.variableNaming'), dims.identifier, '標識符指紋相似度')}
                ${mkBarT(i18n.t('asg.dim.indentStyle'), dims.indent, '縮排/空白模式指紋')}
                ${mkBarT(i18n.t('asg.dim.commentString'), dims.comment, '注釋文本與字串常量')}
                ${dims.typo > 0 ? mkBarT(i18n.t('asg.dim.sharedTypo'), dims.typo, '共同拼寫錯誤（強物證）') : ''}
                ${dims.deadCode > 0 ? mkBarT(i18n.t('asg.dim.deadCode'), dims.deadCode, '共同未使用代碼（強物證）') : ''}
                <h4 class="dim-group-title">${i18n.t('asg.dim.synthesisTitle')}</h4>
                ${mkBarT(i18n.t('asg.dim.multiDim'), dims.evidence, `${dims.evidenceHits || 0}/${dims.totalDims} 維命中`)}
                ${dims.aiSuspicion >= 20 ? mkBarT(i18n.t('asg.dim.aiSuspicion'), dims.aiSuspicion, '') : ''}`;
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
                    <h4>${i18n.t('asg.plag.allEvidence')} <span class="count">${blocks.length}</span></h4>
                    <div class="evidence-filters">
                        <button class="btn-filter active" onclick="AssignmentApp._filterEvidence('all', this)">${i18n.t('asg.plag.filterAll')}</button>
                        <button class="btn-filter" onclick="AssignmentApp._filterEvidence('strong', this)">${i18n.t('asg.plag.filterStrongOnly')}</button>
                    </div>
                </div>
                <div class="evidence-list" id="evidenceList">
                    ${blocks.map((b, i) => `<div class="evidence-list-card" data-strength="${b.strength || 'weak'}">
                        <div class="evidence-list-card-header">
                            <span>${strengthDot5(b.strength)} <strong>#${b.rank || (i+1)}</strong> ${this._escapeHtml(b.description || '')}</span>
                            <div class="evidence-list-actions">
                                <button class="btn-copy-evidence" onclick="AssignmentApp._copyEvidence(${i})" title="${i18n.t('asg.plag.copy')}">${i18n.t('asg.plag.copy')}</button>
                                <button class="btn-evidence-jump" onclick="AssignmentApp._scrollToEvidence(${i})">${i18n.t('asg.plag.locateDown')}</button>
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
                <div class="plag-section-title">${i18n.t('asg.plag.matchedFragments')} <span class="count">${fragments.length}</span></div>
                ${fragments.map((f, i) => `<div class="fragment-item">
                    <span class="fragment-label">${i18n.t('asg.plag.fragment', {n: i + 1, len: f.length || 0})}</span>
                    <pre class="fragment-text">${this._escapeHtml(f.text || '')}</pre>
                </div>`).join('')}
            </div>`;
        }

        // ====== 第 6 塊：全文同步對照區 ======
        const textA = pair.text_a || i18n.t('asg.plag.noContent');
        const textB = pair.text_b || i18n.t('asg.plag.noContent');
        const diff = this._diffTexts(textA, textB);

        html += `<div class="sync-compare-section">
            <h4 class="sync-compare-title">${i18n.t('asg.plag.fullCompare')}</h4>
            <div class="sync-compare" id="syncCompare">
                <div class="compare-col">
                    <div class="compare-header">${this._escapeHtml(pair.student_a_name || i18n.t('asg.plag.studentA'))}</div>
                    <pre class="compare-text" id="compareTextA">${diff.htmlA}</pre>
                </div>
                <div class="compare-col">
                    <div class="compare-header">${this._escapeHtml(pair.student_b_name || i18n.t('asg.plag.studentB'))}</div>
                    <pre class="compare-text" id="compareTextB">${diff.htmlB}</pre>
                </div>
            </div>
            <div class="compare-legend">
                <span class="legend-item"><span class="legend-swatch hl-identical"></span>${i18n.t('asg.plag.legendIdentical')}</span>
                <span class="legend-item"><span class="legend-swatch hl-similar"></span>${i18n.t('asg.plag.legendSimilar')}</span>
                <span class="legend-item"><span class="legend-swatch hl-unique"></span>${i18n.t('asg.plag.legendUnique')}</span>
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

    /** 清除 Xcode / Swift Playgrounds 內部佔位標記 */
    _cleanSwiftTokens(code) {
        return code.replace(/\/\*@[A-Z_]+@\*\//g, '');
    },

    /** 輕量 Markdown → HTML（不依賴外部庫） */
    _renderMd(text) {
        if (!text) return '';
        // Normalise literal \n (from OCR / API) into real newlines before processing
        text = text.replace(/\\n/g, '\n');
        let html = this._escapeHtml(text);

        // ---- Markdown 表格 ----
        // 匹配連續的 | ... | 行（至少 2 行：表頭 + 分隔線 + 數據行）
        html = html.replace(/((?:^|\n)\|.+\|(?:\n\|.+\|)+)/g, (block) => {
            const lines = block.trim().split('\n').filter(l => l.trim());
            if (lines.length < 2) return block;
            // 過濾掉分隔線 |---|---|（只含 -、:、空格、| 的行）
            const dataLines = lines.filter(l => !/^\|[\s\-:|]+$/.test(l.trim()));
            if (dataLines.length < 1) return block;
            let table = '<table class="md-table"><thead><tr>';
            // 第一行作為表頭
            const headerCells = dataLines[0].split('|').filter(c => c.trim() !== '');
            headerCells.forEach(c => { table += `<th>${c.trim()}</th>`; });
            table += '</tr></thead><tbody>';
            for (let i = 1; i < dataLines.length; i++) {
                const cells = dataLines[i].split('|').filter(c => c.trim() !== '');
                table += '<tr>';
                cells.forEach(c => { table += `<td>${c.trim()}</td>`; });
                table += '</tr>';
            }
            table += '</tbody></table>';
            return table;
        });

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
        // 清理表格周圍的 <br>
        html = html.replace(/<br><table/g, '<table');
        html = html.replace(/<\/table><br>/g, '</table>');
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
        // Assignment type: 'file_upload' (normal) or 'form' or 'exam'
        assignmentType: 'file_upload',
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
        this.setBreadcrumb([{ label: i18n.t('asg.list.title') }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="assignment-grid">${AssignmentUI.skeletonCards(4)}</div>`;

        const resp = await AssignmentAPI.listTeacherAssignments();
        if (!resp || !resp.success) { main.innerHTML = `<div class="empty-state"><div class="empty-state-text">${i18n.t('asg.page.loadFail')}</div></div>`; return; }

        this._teacherAssignments = resp.data || [];
        this.renderSidebar();
        this._sidebarFilter('all');
        this._startOcrPolling();
    },

    // ---- Sidebar ----
    renderSidebar() {
        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';

        // Action button (teacher only)
        const actionEl = document.getElementById('sidebarAction');
        if (actionEl) {
            actionEl.innerHTML = isTeacher
                ? `<button class="btn btn-primary" style="width:100%;" onclick="AssignmentApp.openCreateModal()">${i18n.t('asg.sidebar.newAssignment')}</button>`
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
                { key: 'all', label: i18n.t('asg.sidebar.all'), count: counts.all, action: "AssignmentApp._sidebarFilter('all')" },
                { key: 'draft', label: i18n.t('asg.sidebar.draft'), count: counts.draft, action: "AssignmentApp._sidebarFilter('draft')" },
                { key: 'published', label: i18n.t('asg.sidebar.published'), count: counts.published, action: "AssignmentApp._sidebarFilter('published')" },
                { key: 'closed', label: i18n.t('asg.sidebar.closed'), count: counts.closed, action: "AssignmentApp._sidebarFilter('closed')" },
            ];
        } else {
            const data = this._studentAssignments || [];
            const counts = { all: data.length, not_submitted: 0, submitted: 0, graded: 0 };
            data.forEach(a => {
                const st = a.submission_status || 'not_submitted';
                if (counts[st] !== undefined) counts[st]++;
            });
            items = [
                { key: 'all', label: i18n.t('asg.sidebar.all'), count: counts.all, action: "AssignmentApp._sidebarFilter('all')" },
                { key: 'not_submitted', label: i18n.t('asg.sidebar.pending'), count: counts.not_submitted, action: "AssignmentApp._sidebarFilter('not_submitted')" },
                { key: 'submitted', label: i18n.t('asg.sidebar.submitted'), count: counts.submitted, action: "AssignmentApp._sidebarFilter('submitted')" },
                { key: 'graded', label: i18n.t('asg.sidebar.graded'), count: counts.graded, action: "AssignmentApp._sidebarFilter('graded')" },
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
                { label: i18n.t('asg.sidebar.totalAssignments'), value: data.length },
                { label: i18n.t('asg.sidebar.totalSubmissions'), value: totalSubs },
                { label: i18n.t('asg.sidebar.pendingGrade'), value: totalSubs - totalGraded },
            ];
        } else {
            const data = this._studentAssignments || [];
            const pending = data.filter(a => (a.submission_status || 'not_submitted') === 'not_submitted').length;
            const graded = data.filter(a => a.submission_status === 'graded').length;
            stats = [
                { label: i18n.t('asg.sidebar.totalAssignments'), value: data.length },
                { label: i18n.t('asg.sidebar.pendingSubmit'), value: pending },
                { label: i18n.t('asg.sidebar.graded'), value: graded },
            ];
        }

        statsEl.innerHTML = AssignmentUI.renderSidebarStats(stats);
    },

    _startOcrPolling() {
        this._stopOcrPolling();
        const hasProcessing = (this._teacherAssignments || []).some(
            a => a.exam_batch_id && (a.ocr_status === 'processing' || a.ocr_status === 'uploading')
        );
        if (!hasProcessing) return;
        this._ocrPollTimer = setInterval(async () => {
            if (this.state.phase !== 'list') { this._stopOcrPolling(); return; }
            const resp = await AssignmentAPI.listTeacherAssignments();
            if (!resp?.success) return;
            this._teacherAssignments = resp.data || [];
            this._sidebarFilter(this.state.sidebarFilter || 'all');
            // Stop polling if no more processing
            const still = this._teacherAssignments.some(
                a => a.exam_batch_id && (a.ocr_status === 'processing' || a.ocr_status === 'uploading')
            );
            if (!still) this._stopOcrPolling();
        }, 5000);
    },

    _stopOcrPolling() {
        if (this._ocrPollTimer) { clearInterval(this._ocrPollTimer); this._ocrPollTimer = null; }
    },

    _sidebarFilter(key) {
        this.state.sidebarFilter = key;
        this.state.phase = 'list';
        this._updateSidebarNav();

        const isTeacher = this.state.role === 'teacher' || this.state.role === 'admin';

        // Reset to list context
        this.setBreadcrumb([{ label: isTeacher ? i18n.t('asg.list.title') : i18n.t('asg.list.myTitle') }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');

        if (isTeacher) {
            const items = this._teacherAssignments || [];
            const filtered = key === 'all' ? items : items.filter(a => a.status === key);

            const viewToggle = `<div class="view-toggle">
                <button onclick="AssignmentApp.setView('list')" class="${this.state.view === 'list' ? 'active' : ''}" title="${i18n.t('asg.page.listMode')}">☰</button>
                <button onclick="AssignmentApp.setView('grid')" class="${this.state.view === 'grid' ? 'active' : ''}" title="${i18n.t('asg.page.gridMode')}">⊞</button>
            </div>`;

            const header = AssignmentUI.renderWorkspaceHeader(
                i18n.t('asg.list.title'),
                i18n.t('asg.list.itemCount', {count: filtered.length}),
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
                i18n.t('asg.list.myTitle'),
                i18n.t('asg.list.itemCount', {count: filtered.length})
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

        if (!asgResp?.success) { main.innerHTML = `<p>${i18n.t('asg.page.loadFail')}</p>`; return; }
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
            { label: i18n.t('asg.list.title'), action: 'AssignmentApp.showTeacherList()' },
            { label: asg.title }
        ]);
        this.setHeaderActions(`
            ${asg.status === 'draft' ? `<button class="btn btn-success" onclick="AssignmentApp.publishAssignment(${id})">${i18n.t('asg.detail.publish')}</button>` : ''}
            ${asg.status === 'published' ? `<button class="btn btn-warning" onclick="AssignmentApp.closeAssignment(${id})">${i18n.t('asg.detail.closeSubmission')}</button>` : ''}
            ${asg.status !== 'closed' ? `<button class="btn btn-outline" onclick="AssignmentApp.editAssignment(${id})">${i18n.t('asg.detail.edit')}</button>` : ''}
            <button class="btn btn-outline btn-danger" onclick="AssignmentApp.deleteAssignment(${id})">${i18n.t('asg.detail.delete')}</button>
        `);

        // Assignment detail + submissions
        const target = asg.target_type === 'all' ? i18n.t('asg.list.targetAll') :
            asg.target_type === 'class' ? i18n.t('asg.list.targetClass', {value: asg.target_value}) : i18n.t('asg.list.targetStudentFull', {value: asg.target_value});
        const typeLabel = (AssignmentApp.RUBRIC_TYPES.find(t => t.id === (asg.rubric_type || 'points')) || {}).name || i18n.t('asg.rubric.points');
        const gradedCount = asg.graded_count || 0;
        const subCount = asg.submission_count || 0;

        // Stat cards
        const stats = [
            { icon: AssignmentUI.ICON.clock, label: i18n.t('asg.detail.deadline'), value: AssignmentUI.formatDate(asg.deadline) },
            { icon: AssignmentUI.ICON.folder, label: i18n.t('asg.detail.submitted'), value: i18n.t('asg.detail.submittedCount', {count: subCount}) },
            { icon: AssignmentUI.ICON.check, label: i18n.t('asg.detail.filterGraded'), value: i18n.t('asg.detail.gradedCount', {graded: gradedCount, total: subCount}) },
        ];
        if (asg.avg_score) stats.push({ icon: AssignmentUI.ICON.chart, label: i18n.t('asg.detail.avgScore'), value: Number(asg.avg_score).toFixed(1) });

        // Rubric pills
        const rubricPills = (asg.rubric_items || []).map(r =>
            `<span class="badge" style="margin:2px;background:rgba(0,0,0,0.04);color:var(--text-secondary);">${r.title}${r.max_points ? ' ('+r.max_points+i18n.t('asg.grade.pts')+')' : r.weight ? ' ('+r.weight+'%)' : ''}</span>`
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
                            <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;">${AssignmentUI.ICON.clip} ${i18n.t('asg.detail.attachments')}</div>
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
                    ${asg.max_score != null ? `<span style="font-weight:600;font-size:13px;margin-left:4px;">${i18n.t('asg.detail.maxScore', {score: asg.max_score})}</span>` : ''}
                </div>` : ''}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin:20px 0 12px;flex-wrap:wrap;gap:8px;">
                <div style="display:flex;align-items:center;gap:12px;">
                    <h3 style="margin:0;">${i18n.t('asg.detail.studentSubmissions')}</h3>
                    ${(ungradedCount + gradedSubCount) > 0 ? `<button class="btn btn-sm btn-ai" onclick="AssignmentApp.batchAiGrade()" id="batchAiBtn">
                        ${AssignmentUI.ICON.ai} ${i18n.t('asg.detail.batchAiGrade')}
                    </button>` : ''}
                    ${subs.length > 0 ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.exportGradeExcel()" id="exportExcelBtn">
                        ${i18n.t('asg.detail.exportGrades')}
                    </button>` : ''}
                    ${subs.length >= 2 ? `<button class="btn btn-sm btn-outline" onclick="AssignmentApp.openPlagiarism()" id="plagiarismBtn" style="border-color:#f59e0b;color:#f59e0b;">
                        ${i18n.t('asg.detail.plagiarismCheck')}
                    </button>` : ''}
                </div>
                <div class="filter-tabs" style="margin:0;">
                    <button class="filter-tab active" onclick="AssignmentApp._filterSubs('all', this)">${i18n.t('asg.detail.filterAll')} <span class="count">${subs.length}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('submitted', this)">${i18n.t('asg.detail.filterPending')} <span class="count">${ungradedCount}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('graded', this)">${i18n.t('asg.detail.filterGraded')} <span class="count">${gradedSubCount}</span></button>
                    <button class="filter-tab" onclick="AssignmentApp._filterSubs('proxy', this)">${i18n.t('asg.detail.filterProxy')} <span class="count">${notSubmitted.length}</span></button>
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
        if (!resp?.success) { main.innerHTML = `<p>${i18n.t('asg.page.loadFail')}</p>`; return; }
        const sub = resp.data;
        const asg = sub.assignment || {};
        const rubricItems = sub.rubric_items || [];

        this.setBreadcrumb([
            { label: i18n.t('asg.list.title'), action: 'AssignmentApp.showTeacherList()' },
            { label: asg.title || '作業', action: `AssignmentApp.viewAssignment(${sub.assignment_id})` },
            { label: sub.student_name || sub.username }
        ]);
        this.setHeaderActions('');

        // ---- Form / Exam type: 3-column grading workstation ----
        if (asg.assignment_type === 'form' || asg.assignment_type === 'exam') {
            FormGradingView.render(sub);
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
                        <h3>${AssignmentUI.ICON.clip} ${i18n.t('asg.grade.submissionContent')}</h3>
                        <p style="margin-bottom:12px;color:var(--text-secondary);">${sub.content || i18n.t('asg.student.noTextNote')}</p>
                        <div style="margin-bottom:8px;font-size:13px;color:var(--text-tertiary);">
                            ${i18n.t('asg.grade.submitTime')} ${AssignmentUI.formatDate(sub.submitted_at)}
                            ${sub.is_late ? ` <span class="badge badge-late">${i18n.t('asg.status.late')}</span>` : ''}
                        </div>
                    </div>
                    <div class="form-section">
                        <h3>${AssignmentUI.ICON.folder} ${i18n.t('asg.grade.submissionFiles')}</h3>
                        ${AssignmentUI.renderFiles(sub.files, { inlinePreview: true })}
                    </div>
                    <div id="swiftOutputArea"></div>
                    <div id="htmlPreviewArea"></div>
                </div>
                <div>
                    ${(rubricItems.length || rubricType === 'holistic') ?
                        AssignmentUI.renderGradingPanel(rubricItems, existingScores, sub.feedback || '', rubricType, rubricConfig) : `
                    <div class="grading-panel">
                        <h3>${AssignmentUI.ICON.inbox} ${i18n.t('asg.grade.quickGrade')}</h3>
                        <p style="color:var(--text-tertiary);font-size:14px;">${i18n.t('asg.grade.noRubric')}</p>
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
        el.innerHTML = !isPassed ? i18n.t('asg.grade.passed') : i18n.t('asg.grade.failed');
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
            UIModule.toast(i18n.t('asg.toast.gradeDone'), 'success');
            this.viewAssignment(this.state.currentAssignment);
        } else {
            UIModule.toast(i18n.t('asg.toast.gradeFail', {msg: resp?.message || resp?.detail || ''}), 'error');
        }
    },

    async doAiGrade() {
        const statusEl = document.getElementById('aiGradeStatus');
        if (statusEl) statusEl.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;"><div class="loading-spinner"></div><span style="font-size:14px;">${i18n.t('asg.ai.analyzing')}</span></div>`;

        const resp = await AssignmentAPI.aiGrade(this.state.currentSubmission);
        if (!resp?.success || resp.data?.error) {
            if (statusEl) statusEl.innerHTML = `<div style="color:var(--color-error);font-size:14px;margin-bottom:12px;">${i18n.t('asg.ai.gradeFail', {msg: resp?.data?.overall_feedback || ''})}</div>`;
            return;
        }

        const result = resp.data;
        const panel = document.querySelector('.grading-panel');
        const rubricType = panel?.dataset.rubricType || 'points';
        if (statusEl) statusEl.innerHTML = `<div style="color:var(--color-success);font-size:14px;margin-bottom:12px;">${AssignmentUI.ICON.check} ${i18n.t('asg.ai.gradeDone')}</div>`;

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
                        toggle.innerHTML = passed ? i18n.t('asg.grade.passed') : i18n.t('asg.grade.failed');
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
            UIModule.toast(i18n.t('asg.toast.noSubmissions'), 'info');
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
                    <h3>${AssignmentUI.ICON.ai} ${i18n.t('asg.ai.batchTitle')}</h3>
                    <button class="btn btn-sm btn-outline" onclick="AssignmentApp.closeBatchAiModal()">✕</button>
                </div>
                <div class="batch-ai-modal-body">
                    <label class="batch-ai-label">${i18n.t('asg.ai.batchScope')}</label>
                    <div class="batch-ai-mode-select">
                        <label class="batch-ai-mode-option${defaultMode === 'remaining' ? ' selected' : ''}${!ungraded.length ? ' disabled' : ''}">
                            <input type="radio" name="batchAiMode" value="remaining"
                                ${defaultMode === 'remaining' ? 'checked' : ''} ${!ungraded.length ? 'disabled' : ''}
                                onchange="AssignmentApp._updateBatchMode()">
                            <div class="batch-ai-mode-content">
                                <span class="batch-ai-mode-title">📝 ${i18n.t('asg.ai.batchRemaining')}</span>
                                <span class="batch-ai-mode-desc">${i18n.t('asg.ai.batchRemainingDesc', {count: ungraded.length})}</span>
                            </div>
                        </label>
                        <label class="batch-ai-mode-option${defaultMode === 'all' ? ' selected' : ''}">
                            <input type="radio" name="batchAiMode" value="all"
                                ${defaultMode === 'all' ? 'checked' : ''}
                                onchange="AssignmentApp._updateBatchMode()">
                            <div class="batch-ai-mode-content">
                                <span class="batch-ai-mode-title">🔄 ${i18n.t('asg.ai.batchAll')}</span>
                                <span class="batch-ai-mode-desc">${i18n.t('asg.ai.batchAllDesc', {count: allSubs.length})}</span>
                            </div>
                        </label>
                    </div>
                    <label class="batch-ai-label">${i18n.t('asg.ai.extraPrompt')}</label>
                    <textarea id="batchAiExtraPrompt" class="batch-ai-textarea" rows="4"
                        placeholder="例如：&#10;• 評分寬鬆一些，鼓勵為主&#10;• 嚴格按照標準扣分&#10;• 重點關注代碼的可讀性&#10;• 如果有部分完成也給相應分數"></textarea>
                    <div class="batch-ai-modal-tips">
                        <span style="font-weight:500;">💡 ${i18n.t('asg.ai.tipHint')}</span>
                        <div class="batch-ai-tip-chips">
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('${i18n.t('asg.ai.tipLenientText')}')">${i18n.t('asg.ai.tipLenient')}</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('${i18n.t('asg.ai.tipStrictText')}')">${i18n.t('asg.ai.tipStrict')}</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('${i18n.t('asg.ai.tipFunctionText')}')">${i18n.t('asg.ai.tipFunction')}</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('${i18n.t('asg.ai.tipStyleText')}')">${i18n.t('asg.ai.tipStyle')}</button>
                            <button class="batch-ai-chip" onclick="AssignmentApp._insertAiTip('${i18n.t('asg.ai.tipPartialText')}')">${i18n.t('asg.ai.tipPartial')}</button>
                        </div>
                    </div>
                </div>
                <div class="batch-ai-modal-footer">
                    <button class="btn btn-outline" onclick="AssignmentApp.closeBatchAiModal()">${i18n.t('asg.ai.cancel')}</button>
                    <button class="btn btn-ai" id="batchAiStartBtn" onclick="AssignmentApp._startBatchAiGrade()">
                        ${AssignmentUI.ICON.ai} ${i18n.t('asg.ai.startGrade', {count: defaultCount})}
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
        if (btn) btn.innerHTML = `${AssignmentUI.ICON.ai} ${i18n.t('asg.ai.startGrade', {count})}`;
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
        if (btn) { btn.disabled = true; btn.textContent = i18n.t('asg.export.exporting'); }

        try {
            const resp = await AssignmentAPI.exportExcel(assignmentId);
            if (!resp) return;

            // Extract filename from Content-Disposition header
            const cd = resp.headers.get('content-disposition');
            let filename = i18n.t('asg.export.gradesFilename');
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
            UIModule.toast(i18n.t('asg.export.gradesSuccess'), 'success');
        } catch (e) {
            console.error('Export failed:', e);
            UIModule.toast(i18n.t('asg.export.gradesFail', {msg: e.message || ''}), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = i18n.t('asg.export.exportGrades'); }
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
                    <h3>${i18n.t('asg.plag.configTitle')}</h3>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('plagConfigModal').remove()">✕</button>
                </div>
                <div class="plag-config-body">
                    <label class="plag-config-label">${i18n.t('asg.plag.configSubject')}</label>
                    <select id="plagSubjectSelect" class="plag-config-select"
                        onchange="AssignmentApp._onPlagSubjectChange()">
                        ${subjectsHtml}
                    </select>

                    <div id="plagModeSection">
                        <label class="plag-config-label" style="margin-top:var(--space-4)">${i18n.t('asg.plag.configType')}</label>
                        <div class="plag-mode-options" id="plagModeOptions"></div>
                    </div>

                    <label class="plag-config-label" style="margin-top:var(--space-4)">${i18n.t('asg.plag.configStrictness')}</label>
                    <div class="plag-mode-options">
                        <label class="plag-mode-option">
                            <input type="radio" name="plagStrictness" value="loose"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">${i18n.t('asg.plag.strictLoose')}</span>
                                <span class="plag-mode-desc">${i18n.t('asg.plag.strictLooseDesc')}</span>
                            </div>
                        </label>
                        <label class="plag-mode-option selected">
                            <input type="radio" name="plagStrictness" value="normal" checked
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">${i18n.t('asg.plag.strictNormal')}</span>
                                <span class="plag-mode-desc">${i18n.t('asg.plag.strictNormalDesc')}</span>
                            </div>
                        </label>
                        <label class="plag-mode-option">
                            <input type="radio" name="plagStrictness" value="strict"
                                onchange="AssignmentApp._onPlagModeChange(this)">
                            <div class="plag-mode-content">
                                <span class="plag-mode-title">${i18n.t('asg.plag.strictStrict')}</span>
                                <span class="plag-mode-desc">${i18n.t('asg.plag.strictStrictDesc')}</span>
                            </div>
                        </label>
                    </div>
                </div>
                <div class="plag-config-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('plagConfigModal').remove()">${i18n.t('asg.ai.cancel')}</button>
                    <button class="btn btn-primary" onclick="AssignmentApp._confirmStartPlagiarism()">${i18n.t('asg.plag.startCheck')}</button>
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
                { value: 'chinese_essay', title: i18n.t('asg.plag.modeChineseEssayOpt'), desc: i18n.t('asg.plag.modeChineseEssayDesc'), selected: true },
                { value: 'text', title: i18n.t('asg.plag.modeTextOpt'), desc: i18n.t('asg.plag.modeTextDesc') },
                { value: 'mixed', title: i18n.t('asg.plag.modeMixedOpt'), desc: i18n.t('asg.plag.modeMixedDesc') },
            ];
        } else if (isEnglish) {
            modes = [
                { value: 'english_essay', title: i18n.t('asg.plag.modeEnglishEssayOpt'), desc: i18n.t('asg.plag.modeEnglishEssayDesc'), selected: true },
                { value: 'text', title: i18n.t('asg.plag.modeTextOpt'), desc: i18n.t('asg.plag.modeTextDesc') },
                { value: 'mixed', title: i18n.t('asg.plag.modeMixedOpt'), desc: i18n.t('asg.plag.modeMixedDesc') },
            ];
        } else if (isIct) {
            modes = [
                { value: 'code', title: i18n.t('asg.plag.modeCodeOpt'), desc: i18n.t('asg.plag.modeCodeDesc') },
                { value: 'text', title: i18n.t('asg.plag.modeTextOpt'), desc: i18n.t('asg.plag.modeTextDesc') },
                { value: 'mixed', title: i18n.t('asg.plag.modeMixedOpt'), desc: i18n.t('asg.plag.modeMixedDesc'), selected: true },
            ];
        } else {
            modes = [
                { value: 'text', title: i18n.t('asg.plag.modeTextOpt'), desc: i18n.t('asg.plag.modeTextDesc') },
                { value: 'mixed', title: i18n.t('asg.plag.modeMixedOpt'), desc: i18n.t('asg.plag.modeMixedDesc'), selected: true },
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
        if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> ${i18n.t('asg.ai.starting')}`; }

        const resp = await AssignmentAPI.startPlagiarismCheck(assignmentId, { threshold, subject, detect_mode });
        if (!resp?.success) {
            UIModule.toast(i18n.t('asg.plag.startFail', {msg: resp?.message || ''}), 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = i18n.t('asg.detail.plagiarismCheck'); }
            return;
        }

        UIModule.toast(i18n.t('asg.plag.startedBg'), 'success');
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
            <h4 class="algo-section-title">${i18n.t('asg.algo.dimTitle')}</h4>
            <p class="algo-text">${i18n.t('asg.algo.dimGenericDesc')}</p>`;

        const modeLabel = ({chinese_essay:i18n.t('asg.plag.modeChineseEssay'),english_essay:i18n.t('asg.plag.modeEnglishEssay'),code:i18n.t('asg.plag.modeCode'),text:i18n.t('asg.plag.modeText'),mixed:i18n.t('asg.plag.modeMixed')})[mode] || mode;

        const html = `
        <div class="modal-overlay active" id="algorithmModal" onclick="if(event.target===this)this.remove()">
            <div class="algorithm-modal">
                <div class="algorithm-modal-header">
                    <h3>${i18n.t('asg.algo.title')}</h3>
                    <button class="btn btn-sm btn-outline" onclick="document.getElementById('algorithmModal').remove()">✕</button>
                </div>
                <div class="algorithm-modal-body">

                    <div class="algo-section">
                        <h4 class="algo-section-title">${i18n.t('asg.algo.flowTitle')}</h4>
                        <div class="algo-flow">
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">1</div>
                                <div class="algo-flow-label">${i18n.t('asg.algo.step1')}</div>
                                <div class="algo-flow-desc">${i18n.t('asg.algo.step1Desc')}</div>
                            </div>
                            <div class="algo-flow-arrow">&rarr;</div>
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">2</div>
                                <div class="algo-flow-label">${i18n.t('asg.algo.step2')}</div>
                                <div class="algo-flow-desc">${i18n.t('asg.algo.step2Desc')}</div>
                            </div>
                            <div class="algo-flow-arrow">&rarr;</div>
                            <div class="algo-flow-step">
                                <div class="algo-flow-num">3</div>
                                <div class="algo-flow-label">${i18n.t('asg.algo.step3')}</div>
                                <div class="algo-flow-desc">${i18n.t('asg.algo.step3Desc')}</div>
                            </div>
                        </div>
                    </div>

                    <div class="algo-section">
                        <div class="algo-mode-badge">${i18n.t('asg.algo.currentMode', {mode: modeLabel})}</div>
                        ${dimHtml}
                    </div>

                    <div class="algo-section">
                        <h4 class="algo-section-title">${i18n.t('asg.algo.antiMisjudge')}</h4>
                        <ul class="algo-list">
                            <li><strong>${i18n.t('asg.algo.templateSuppression')}</strong>：${i18n.t('asg.algo.templateSuppDesc')}</li>
                            <li><strong>${i18n.t('asg.algo.crossValidation')}</strong>：${i18n.t('asg.algo.crossValidDesc')}</li>
                            ${mode === 'code' ? `<li><strong>${i18n.t('asg.algo.shortCodeAdaptive')}</strong>：${i18n.t('asg.algo.shortCodeAdaptDesc')}</li>` : ''}
                            ${mode === 'chinese_essay' || mode === 'english_essay' ? `<li><strong>${i18n.t('asg.algo.boundaryWeight')}</strong>：${i18n.t('asg.algo.boundaryWeightDesc')}</li>` : ''}
                        </ul>
                    </div>

                    <div class="algo-section">
                        <h4 class="algo-section-title">${i18n.t('asg.algo.riskLevelTitle')}</h4>
                        <table class="algo-dim-table algo-risk-table">
                            <tbody>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#9b2c2c;color:#fff;">${i18n.t('asg.risk.high')}</span></td>
                                    <td>${i18n.t('asg.algo.riskHighDesc')}</td>
                                </tr>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#b7791f;color:#fff;">${i18n.t('asg.algo.riskReview')}</span></td>
                                    <td>${i18n.t('asg.algo.riskReviewDesc')}</td>
                                </tr>
                                <tr>
                                    <td><span class="verdict-badge" style="background:#4a7c59;color:#fff;">${i18n.t('asg.risk.low')}</span></td>
                                    <td>${i18n.t('asg.algo.riskLowDesc')}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                </div>
                <div class="algorithm-modal-footer">
                    <button class="btn btn-outline" onclick="document.getElementById('algorithmModal').remove()">${i18n.t('asg.algo.close')}</button>
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
                    <span id="globalPlagText">${i18n.t('asg.plag.checkingProgress')}</span>
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
        if (text) text.textContent = detail || i18n.t('asg.plag.checkingProgress');
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
                    btn.innerHTML = i18n.t('asg.plag.viewReport');
                    btn.style.borderColor = 'var(--brand)';
                    btn.style.color = 'var(--brand)';
                }
                if (job.flagged_pairs > 0) {
                    UIModule.toast(i18n.t('asg.plag.checkDoneSuspicious', {count: job.flagged_pairs}), 'warning');
                } else {
                    UIModule.toast(i18n.t('asg.plag.checkDoneClean'), 'success');
                }
                // 如果當前正在看這個作業，自動打開報告
                if (this.state.currentAssignment === assignmentId) {
                    this.showPlagiarismReport();
                }
            } else if (job.status === 'failed') {
                if (btn) { btn.disabled = false; btn.innerHTML = i18n.t('asg.detail.plagiarismCheck'); }
                UIModule.toast(i18n.t('asg.plag.checkFailed'), 'error');
            } else {
                if (btn) { btn.disabled = false; btn.innerHTML = i18n.t('asg.detail.plagiarismCheck'); }
            }
            return;
        }

        if (job.status === 'running') {
            const progress = job.progress || 0;
            const detail = job.detail || i18n.t('asg.plag.analyzingContent');

            // 更新全局浮動進度條（始終可見）
            this._showGlobalPlagBar(progress, detail);

            // 更新頁面內元素（如果還在當前頁面）
            if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> ${progress}%`; }
            if (progressEl) {
                progressEl.style.display = 'block';
                const phaseLabels = { extract: i18n.t('asg.plag.phaseExtract'), compare: i18n.t('asg.plag.phaseCompare'), ai: i18n.t('asg.plag.phaseAi'), save: i18n.t('asg.plag.phaseSave') };
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
        main.innerHTML = `<div class="workspace-loading"><div class="loading-spinner"></div><p>${i18n.t('asg.plag.loadingReport')}</p></div>`;

        // 清空頂部動作列（返回按鈕已整合到報告儀表盤頂部）
        this.setHeaderActions('');

        const resp = await AssignmentAPI.getPlagiarismReport(assignmentId);
        if (!resp?.success) {
            main.innerHTML = `<div class="empty-state"><div class="empty-state-text">${i18n.t('asg.plag.notRun')}</div></div>`;
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
        main.innerHTML = `<div class="workspace-loading"><div class="loading-spinner"></div><p>${i18n.t('asg.plag.loadingDetail')}</p></div>`;

        const resp = await AssignmentAPI.getPlagiarismPairDetail(pairId);
        if (!resp?.success || !resp.data) {
            UIModule.toast(i18n.t('asg.plag.loadPairFail'), 'error');
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
            UIModule.toast(i18n.t('asg.plag.copiedEvidence'), 'success');
        }).catch(() => {
            UIModule.toast(i18n.t('asg.plag.copyFailed'), 'error');
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
        if (btn) { btn.disabled = true; btn.textContent = i18n.t('asg.export.exporting'); }

        try {
            const resp = await AssignmentAPI.exportPlagiarismExcel(assignmentId);
            if (!resp) return;

            const cd = resp.headers.get('content-disposition');
            let filename = i18n.t('asg.export.plagReportFilename');
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
            UIModule.toast(i18n.t('asg.export.plagReportSuccess'), 'success');
        } catch (e) {
            console.error('Export failed:', e);
            UIModule.toast(i18n.t('asg.export.gradesFail', {msg: e.message || ''}), 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.textContent = i18n.t('asg.export.exportExcel'); }
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
                btn.innerHTML = i18n.t('asg.plag.viewReport');
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
        if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> ${i18n.t('asg.ai.starting')}`; }

        // Call backend to start batch grading
        const resp = await AssignmentAPI.startBatchAiGrade(assignmentId, extraPrompt, mode);
        if (!resp?.success) {
            UIModule.toast(i18n.t('asg.toast.batchStartFail', {msg: resp?.message || ''}), 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = `${AssignmentUI.ICON.ai} ${i18n.t('asg.detail.batchAiGrade')}`; }
            return;
        }

        UIModule.toast(i18n.t('asg.toast.batchStarted'), 'success');
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
            if (btn) { btn.disabled = true; btn.innerHTML = `<div class="loading-spinner"></div> ${i18n.t('asg.ai.grading', {done: job.done, total: job.total})}`; }
            if (progressEl) {
                progressEl.style.display = 'block';
                const pct = job.total > 0 ? Math.round((job.done / job.total) * 100) : 0;
                progressEl.innerHTML = `
                    <div class="batch-ai-progress">
                        <div class="batch-ai-bar">
                            <div class="batch-ai-bar-fill" style="width:${pct}%"></div>
                        </div>
                        <div class="batch-ai-stats">
                            <span>${i18n.t('asg.ai.progress', {done: job.done, total: job.total})}</span>
                            <span style="color:var(--color-success);">✓ ${job.success}</span>
                            ${job.fail ? `<span style="color:var(--color-error);">✗ ${job.fail}</span>` : ''}
                            <button class="btn btn-sm btn-outline" onclick="AssignmentApp._cancelBatchAiGrade()" style="margin-left:auto;">${i18n.t('asg.ai.cancel')}</button>
                        </div>
                    </div>`;
            }
            return;
        }

        // done / cancelled
        this._stopBatchPolling();
        const isDone = job.status === 'done';
        const label = isDone ? i18n.t('asg.toast.batchDone') : i18n.t('asg.toast.batchCancelled');
        if (progressEl) {
            progressEl.style.display = 'block';
            progressEl.innerHTML = `
                <div class="batch-ai-progress batch-ai-done">
                    <span>${AssignmentUI.ICON.check} ${label}！${i18n.t('asg.toast.batchResultDetail', {success: job.success})}${job.fail ? `，${i18n.t('asg.toast.batchResultFail', {fail: job.fail})}` : ''}</span>
                </div>`;
        }
        UIModule.toast(i18n.t('asg.toast.batchResult', {label, success: job.success, fail: job.fail}), job.success > 0 ? 'success' : 'warning');
        // Refresh after a short delay
        setTimeout(() => this.viewAssignment(assignmentId), 1500);
    },

    async _cancelBatchAiGrade() {
        const assignmentId = this.state.currentAssignment;
        await AssignmentAPI.cancelBatchAiGrade(assignmentId);
        UIModule.toast(i18n.t('asg.ai.cancelling'), 'info');
    },

    // ---- Rubric Type Definitions ----
    get RUBRIC_TYPES() {
        return [
            { id: 'points', icon: '📊', name: i18n.t('asg.rubric.points'), desc: i18n.t('asg.rubric.pointsDesc') },
            { id: 'analytic_levels', icon: '📋', name: i18n.t('asg.rubric.analyticLevels'), desc: i18n.t('asg.rubric.analyticLevelsDesc') },
            { id: 'weighted_pct', icon: '📐', name: i18n.t('asg.rubric.weightedPct'), desc: i18n.t('asg.rubric.weightedPctDesc') },
            { id: 'checklist', icon: '✅', name: i18n.t('asg.rubric.checklist'), desc: i18n.t('asg.rubric.checklistDesc') },
            { id: 'competency', icon: '🎯', name: i18n.t('asg.rubric.competency'), desc: i18n.t('asg.rubric.competencyDesc') },
            { id: 'dse_criterion', icon: '🏫', name: i18n.t('asg.rubric.dseCriterion'), desc: i18n.t('asg.rubric.dseCriterionDesc') },
            { id: 'holistic', icon: '📝', name: i18n.t('asg.rubric.holistic'), desc: i18n.t('asg.rubric.holisticDesc') },
        ];
    },

    // ---- Teacher: Create/Edit ----
    async openCreateModal(editId = null) {
        this.state.editingId = editId;
        this.state.currentStep = 1;
        this.state.selectedRubricType = 'points';
        this.state.assignmentType = 'file_upload';
        this.state.pendingAttachments = [];
        this.state.existingAttachments = [];
        this.state.deletedAttachmentIds = [];
        // Reset exam state
        this.state.examBatchId = null;
        this.state.examFiles = [];
        this.state.recognizedQuestions = [];
        if (this.state.ocrPollingTimer) { clearInterval(this.state.ocrPollingTimer); this.state.ocrPollingTimer = null; }

        document.getElementById('createModalTitle').textContent = editId ? i18n.t('asg.create.titleEdit') : i18n.t('asg.create.titleCreate');

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
                // Exam type: load recognized questions and batch ID
                if (aType === 'exam') {
                    this.state.examBatchId = a.exam_batch_id || null;
                    if (a.questions?.length > 0) {
                        this.state.recognizedQuestions = a.questions;
                    } else if (a.exam_batch_id) {
                        // Questions not yet loaded — try fetching from batch
                        try {
                            const batchResp = await AssignmentAPI.getExamPaperStatus(a.exam_batch_id);
                            if (batchResp?.success && batchResp.data?.questions?.length > 0) {
                                this.state.recognizedQuestions = batchResp.data.questions;
                            }
                        } catch (e) { /* ignore */ }
                    }
                }
            }
        }

        // Render attachment lists
        this._renderAttachmentLists();
        this._setupAttachmentZone();

        // Set assignment type selector UI (use loaded type when editing)
        if (!editId) {
            this.selectAssignmentType('file_upload');
        }

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
        this.state.assignmentType = type;
        this.state.selectedAssignmentType = type;
        // Update card selection
        document.querySelectorAll('.asg-type-option').forEach(el => {
            el.classList.toggle('selected', el.dataset.type === type);
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
        if (step2Label) step2Label.textContent = isExam ? i18n.t('asg.create.stepQuestions') : i18n.t('asg.create.stepRubric');
        // Animated progress line
        const line = document.querySelector('.step-line');
        if (line) line.classList.toggle('filled', n >= 2);
        // Checkmark for completed step
        const circle1 = document.querySelector('#stepItem1 .step-circle');
        if (circle1) circle1.textContent = n >= 2 ? '✓' : '1';
        // Setup exam upload zone when entering step 2 exam
        if (n === 2 && isExam) {
            this._setupExamUploadZone();
            // If we already have recognized questions (e.g. editing), render them
            if (this.state.recognizedQuestions?.length > 0) {
                this._renderQuestionEditor();
            }
        }
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
            <label>${i18n.t('asg.rubric.itemsLabel')}</label>
            <div class="rubric-editor">
                <div class="rubric-header"><span>${i18n.t('asg.rubric.itemName')}</span><span>${i18n.t('asg.rubric.maxPoints')}</span><span></span></div>
                <div id="rubricRows"></div>
                <div class="rubric-total"><span>${i18n.t('asg.rubric.total')}</span><span id="rubricTotal">0</span><span></span></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp.addRubricRow()">${i18n.t('asg.rubric.addItem')}</button>
        </div>`;
    },

    _editorAnalyticLevels() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.analyticLabel')}</label>
            <div id="analyticCriteria"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addAnalyticCriterion()">${i18n.t('asg.rubric.addCriterion')}</button>
        </div>`;
    },

    _addAnalyticCriterion(title = '', maxPts = 10, levels = null) {
        const container = document.getElementById('analyticCriteria');
        const card = document.createElement('div');
        card.className = 'criterion-card';
        const defaultLevels = levels || [
            { level: i18n.t('asg.rubric.excellent'), points: maxPts, description: '' },
            { level: i18n.t('asg.rubric.good'), points: Math.round(maxPts * 0.7), description: '' },
            { level: i18n.t('asg.rubric.pass'), points: Math.round(maxPts * 0.4), description: '' },
            { level: i18n.t('asg.rubric.fail'), points: 0, description: '' },
        ];
        card.innerHTML = `
            <div class="criterion-card-header">
                <input type="text" class="criterion-title" placeholder="${i18n.t('asg.rubric.criterionName')}" value="${title}">
                <span style="font-size:13px;color:var(--text-tertiary);white-space:nowrap;">${i18n.t('asg.rubric.maxPoints')}:</span>
                <input type="number" class="criterion-max" style="width:70px;" value="${maxPts}" min="0" step="0.5">
                <button class="remove-btn" onclick="this.closest('.criterion-card').remove()">✕</button>
            </div>
            <div class="criterion-card-body">
                <div class="level-rows">
                    ${defaultLevels.map(l => `<div class="level-row">
                        <input type="text" class="lv-label" placeholder="${i18n.t('asg.rubric.levelLabel')}" value="${l.level}">
                        <input type="number" class="lv-points" placeholder="${i18n.t('asg.grade.score')}" value="${l.points}" min="0" step="0.5">
                        <textarea class="lv-desc" placeholder="${i18n.t('asg.rubric.levelDescPh')}" rows="1">${l.description || ''}</textarea>
                        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                    </div>`).join('')}
                </div>
                <button style="width:100%;padding:4px;border:1px dashed var(--border-strong);background:none;color:var(--brand);cursor:pointer;border-radius:4px;margin-top:4px;font-size:13px;"
                    onclick="AssignmentApp._addLevelRow(this)">${i18n.t('asg.rubric.addLevel')}</button>
            </div>`;
        container.appendChild(card);
    },

    _addLevelRow(btn) {
        const rows = btn.previousElementSibling;
        const row = document.createElement('div');
        row.className = 'level-row';
        row.innerHTML = `
            <input type="text" class="lv-label" placeholder="${i18n.t('asg.rubric.levelLabel')}" value="">
            <input type="number" class="lv-points" placeholder="${i18n.t('asg.grade.score')}" value="0" min="0" step="0.5">
            <textarea class="lv-desc" placeholder="${i18n.t('asg.rubric.levelDescPh')}" rows="1"></textarea>
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        rows.appendChild(row);
    },

    _editorWeightedPct() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.totalScore')}</label>
            <input type="number" id="weightTotalScore" value="100" min="1" style="width:120px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>${i18n.t('asg.rubric.weightItems')}</label>
            <div class="rubric-editor">
                <div class="rubric-header"><span>${i18n.t('asg.rubric.itemName')}</span><span>${i18n.t('asg.rubric.weightPct')}</span><span></span></div>
                <div id="weightRows"></div>
            </div>
            <div id="weightValidation" class="weight-validation valid">${i18n.t('asg.rubric.weightSum', {pct: 0})}</div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addWeightRow()">${i18n.t('asg.rubric.addItem')}</button>
        </div>`;
    },

    _addWeightRow(title = '', weight = '') {
        const rows = document.getElementById('weightRows');
        const row = document.createElement('div');
        row.className = 'rubric-row';
        row.innerHTML = `
            <input type="text" class="wt-title" placeholder="${i18n.t('asg.rubric.itemName')}" value="${title}">
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
            el.textContent = i18n.t('asg.rubric.weightSum', {pct: total});
            el.className = `weight-validation ${Math.abs(total - 100) < 0.01 ? 'valid' : 'invalid'}`;
        }
    },

    _editorChecklist() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.checklistMax')}</label>
            <input type="number" id="checklistMaxScore" value="100" min="1" style="width:120px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>${i18n.t('asg.rubric.checklistItems')}</label>
            <div class="rubric-editor" style="border-bottom:none;">
                <div id="checklistItems"></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addChecklistItem()">${i18n.t('asg.rubric.addItem')}</button>
        </div>`;
    },

    _addChecklistItem(title = '') {
        const container = document.getElementById('checklistItems');
        const item = document.createElement('div');
        item.className = 'checklist-item';
        item.innerHTML = `
            <span style="color:var(--text-tertiary);">☐</span>
            <input type="text" class="cl-title" placeholder="${i18n.t('asg.rubric.checklistItem')}" value="${title}">
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(item);
    },

    _editorCompetency() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.competencyLabels')}</label>
            <div id="competencyLevels" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;"></div>
            <button class="add-rubric-btn" style="border-top:1px dashed var(--border-strong);" onclick="AssignmentApp._addCompetencyLevel()">${i18n.t('asg.rubric.addLevel')}</button>
        </div>
        <div class="form-group">
            <label>${i18n.t('asg.rubric.competencyItems')}</label>
            <div class="rubric-editor" style="border-bottom:none;">
                <div id="competencyItems"></div>
            </div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addCompetencyItem()">${i18n.t('asg.rubric.addCriterion')}</button>
        </div>
        <div style="padding:8px 12px;background:rgba(0,122,255,0.08);border-radius:8px;font-size:13px;color:var(--color-info);">
            ${i18n.t('asg.rubric.competencyNote')}
        </div>`;
    },

    _initCompetencyLevels(labels = null) {
        const defaults = labels || ['Not Yet', 'Approaching', 'Meeting', 'Exceeding'];
        const container = document.getElementById('competencyLevels');
        container.innerHTML = '';
        defaults.forEach(l => this._addCompetencyLevelTag(l));
    },

    _addCompetencyLevel() {
        const name = prompt(i18n.t('asg.rubric.inputLevelName'));
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
            <input type="text" class="comp-title" placeholder="${i18n.t('asg.rubric.competencyItemPh')}" value="${title}">
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        container.appendChild(item);
    },

    _editorDSECriterion() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.dseMaxLevel')}</label>
            <input type="number" id="dseMaxLevel" value="7" min="1" max="20" style="width:80px;padding:8px;border:1px solid var(--border-default);border-radius:6px;">
        </div>
        <div class="form-group">
            <label>${i18n.t('asg.rubric.dseCriteria')}</label>
            <div id="dseCriteria"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addDSECriterion()">${i18n.t('asg.rubric.addCriterion')}</button>
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
                <input type="text" class="dse-title" placeholder="${i18n.t('asg.rubric.dseCriterionName')}" value="${title}">
                <span style="font-size:13px;color:var(--text-tertiary);white-space:nowrap;">${i18n.t('asg.rubric.maxPoints')}:</span>
                <input type="number" class="dse-max" style="width:60px;" value="${maxLevel}" min="1">
                <button class="remove-btn" onclick="this.closest('.criterion-card').remove()">✕</button>
            </div>
            <div class="criterion-card-body">
                <div class="level-rows">
                    ${defaultLevels.map(l => `<div class="level-row" style="grid-template-columns:80px 1fr 36px;">
                        <input type="text" class="dse-lv-label" placeholder="${i18n.t('asg.rubric.levelLabel')}" value="${l.level}">
                        <textarea class="dse-lv-desc" placeholder="${i18n.t('asg.rubric.levelDescPh')}" rows="1">${l.description || ''}</textarea>
                        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                    </div>`).join('')}
                </div>
                <button style="width:100%;padding:4px;border:1px dashed var(--border-strong);background:none;color:var(--brand);cursor:pointer;border-radius:4px;margin-top:4px;font-size:13px;"
                    onclick="AssignmentApp._addDSELevelRow(this)">${i18n.t('asg.rubric.addLevel')}</button>
            </div>`;
        container.appendChild(card);
    },

    _addDSELevelRow(btn) {
        const rows = btn.previousElementSibling;
        const row = document.createElement('div');
        row.className = 'level-row';
        row.style.gridTemplateColumns = '80px 1fr 36px';
        row.innerHTML = `
            <input type="text" class="dse-lv-label" placeholder="${i18n.t('asg.rubric.levelLabel')}" value="">
            <textarea class="dse-lv-desc" placeholder="${i18n.t('asg.rubric.levelDescPh')}" rows="1"></textarea>
            <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>`;
        rows.appendChild(row);
    },

    _editorHolistic() {
        return `<div class="form-group">
            <label>${i18n.t('asg.rubric.holisticLevels')}</label>
            <div id="holisticLevels"></div>
            <button class="add-rubric-btn" onclick="AssignmentApp._addHolisticLevel()">${i18n.t('asg.rubric.addLevel')}</button>
        </div>
        <div style="padding:8px 12px;background:rgba(0,122,255,0.08);border-radius:8px;font-size:13px;color:var(--color-info);">
            ${i18n.t('asg.rubric.holisticNote')}
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
            label.textContent = i18n.t('asg.create.selectClass');
            (this.state.targets?.classes || []).forEach(c => {
                select.innerHTML += `<option value="${c}">${c}</option>`;
            });
        } else if (type === 'student') {
            label.textContent = i18n.t('asg.create.selectStudent');
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
            <input type="text" class="rubric-title" placeholder="${i18n.t('asg.rubric.itemName')}" value="${title}">
            <input type="number" class="rubric-points" placeholder="${i18n.t('asg.rubric.maxPoints')}" value="${maxPoints}" min="0" step="0.5"
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
            if (this.state.examBatchId) {
                base.exam_batch_id = this.state.examBatchId;
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
            document.getElementById('startOcrBtn').textContent = i18n.t('asg.ocr.startRecognize');
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
                UIModule.toast(i18n.t('asg.file.unsupportedType', {name: f.name}), 'warning');
                continue;
            }
            if (f.size > 10 * 1024 * 1024) {
                UIModule.toast(i18n.t('asg.file.tooLarge', {name: f.name}), 'warning');
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
        btn.textContent = i18n.t('asg.ocr.uploading');

        const resp = await AssignmentAPI.uploadExamPaper(this.state.examFiles);
        if (!resp?.success) {
            UIModule.toast(i18n.t('asg.toast.uploadFail', {msg: resp?.message || resp?.detail || ''}), 'error');
            btn.disabled = false;
            btn.textContent = i18n.t('asg.ocr.startRecognize');
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
                UIModule.toast(i18n.t('asg.ocr.failRetry'), 'error');
                return;
            }

            if (data.questions && data.questions.length > 0) {
                this.state.recognizedQuestions = data.questions;
                this._renderQuestionEditor();
            } else {
                UIModule.toast(i18n.t('asg.ocr.noQuestions'), 'warning');
            }
        }
    },

    _renderOcrStatus(data) {
        const container = document.getElementById('examOcrStatus');
        if (!container) return;
        container.style.display = '';
        const statusMap = {
            uploading: i18n.t('asg.ocr.uploading'),
            processing: i18n.t('asg.ocr.processing'),
            completed: i18n.t('asg.ocr.done'),
            partial_failed: i18n.t('asg.ocr.partialFailed'),
            failed: i18n.t('asg.ocr.failed'),
        };
        const statusClass = data.status === 'completed' ? 'success'
            : data.status === 'partial_failed' ? 'warning'
            : data.status === 'failed' ? 'error' : 'processing';

        let html = `<div class="ocr-status-bar ocr-status--${statusClass}">
            <div class="ocr-status-summary">
                <span class="ocr-status-label">${statusMap[data.status] || data.status}</span>
                <span class="ocr-status-counts">${i18n.t('asg.ocr.fileCount', {total: data.total_files, done: data.completed_files || 0})}${data.failed_files ? '，' + i18n.t('asg.ocr.fileFailed', {count: data.failed_files}) : ''}</span>
                ${data.total_questions ? `<span class="ocr-status-questions">| ${i18n.t('asg.ocr.questionCount', {count: data.total_questions})}${data.low_confidence_count ? '，' + i18n.t('asg.ocr.lowConfidence', {count: data.low_confidence_count}) : ''}</span>` : ''}
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
            <span class="question-editor-count">${passageCount > 0 ? i18n.t('asg.question.passageCount', {count: passageCount}) : ''}${i18n.t('asg.question.totalQuestions', {count: questionCount, points: totalPoints})}</span>
            <label class="question-filter-toggle">
                <input type="checkbox" id="showLowConfidence" onchange="AssignmentApp._filterQuestions()"> ${i18n.t('asg.question.showLowConfidence')}
            </label>
            <button class="btn btn-outline btn-sm" onclick="AssignmentApp._addQuestion()">${i18n.t('asg.question.addQuestion')}</button>
        </div>`;

        // Group by source_page
        const groups = {};
        questions.forEach((q, i) => {
            const key = q.source_page ? i18n.t('asg.question.page', {page: q.source_page}) : i18n.t('asg.question.unpaged');
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
                if (q.source_page) sourceHints.push(i18n.t('asg.question.page', {page: q.source_page}));
                if (q.ocr_confidence != null) sourceHints.push(i18n.t('asg.question.confidence', {pct: (q.ocr_confidence * 100).toFixed(0)}));
                if (q.metadata?.has_math_formula || q.has_math_formula) sourceHints.push(i18n.t('asg.question.hasMath'));

                const pointsReadonly = isFillBlank ? 'readonly class="q-points q-points-readonly" title="總分由填空項自動匯總"' : 'class="q-points" title="分值"';

                html += `<div class="question-card ${confClass} ${passageClass}" data-index="${i}" id="qcard_${i}">
                    <div class="question-card-header">
                        <div class="question-card-row1">
                            <input type="text" class="q-number" value="${this._escapeAttr(q.question_number || '')}" placeholder="${isPassage ? i18n.t('asg.question.passageNumber') : i18n.t('asg.question.questionNumber')}" title="${isPassage ? i18n.t('asg.question.passageNumber') : i18n.t('asg.question.questionNumber')}">
                            ${isPassage ? `<span class="passage-badge">${i18n.t('asg.question.passageLabel')}</span>` : `<input type="number" ${pointsReadonly} value="${q.points != null ? q.points : ''}" placeholder="${i18n.t('asg.question.pointsLabel')}" min="0" step="0.5">`}
                            <select class="q-type" title="題型" onchange="AssignmentApp._onQuestionTypeChange(${i}, this.value)">
                                <option value="passage" ${q.question_type === 'passage' ? 'selected' : ''}>${i18n.t('asg.question.typePassage')}</option>
                                <option value="open" ${q.question_type === 'open' ? 'selected' : ''}>${i18n.t('asg.question.typeOpen')}</option>
                                <option value="multiple_choice" ${q.question_type === 'multiple_choice' ? 'selected' : ''}>${i18n.t('asg.question.typeMC')}</option>
                                <option value="fill_blank" ${q.question_type === 'fill_blank' ? 'selected' : ''}>${i18n.t('asg.question.typeFillBlank')}</option>
                                <option value="true_false" ${q.question_type === 'true_false' ? 'selected' : ''}>${i18n.t('asg.question.typeTrueFalse')}</option>
                            </select>
                            <button class="question-delete-btn" onclick="AssignmentApp._removeQuestion(${i})" title="刪除">&times;</button>
                        </div>
                        ${sourceHints.length > 0 ? `<div class="question-source-hints">${sourceHints.join(' | ')}</div>` : ''}
                    </div>
                    <div class="question-card-body">
                        <label>${isPassage ? i18n.t('asg.question.passageContent') : i18n.t('asg.question.questionContent')}</label>
                        <textarea class="q-text" rows="${isPassage ? 5 : 3}" placeholder="${isPassage ? i18n.t('asg.question.passageContentPh') : i18n.t('asg.question.questionContentPh')}">${this._escapeHtml(q.question_text || '')}</textarea>
                        ${isPassage ? '' : `<div class="question-answer-row">
                            <div class="question-answer-field">
                                <label>${i18n.t('asg.question.answer')}</label>
                                <textarea class="q-answer" rows="2" placeholder="${i18n.t('asg.question.answerPh')}">${this._escapeHtml(q.answer_text || '')}</textarea>
                            </div>
                            <div class="question-answer-source">
                                <span class="answer-source-badge source-${q.answer_source || 'missing'}">${
                                    { extracted: i18n.t('asg.question.answerExtracted'), inferred: i18n.t('asg.question.answerInferred'), missing: i18n.t('asg.question.answerMissing'), manual: i18n.t('asg.question.answerManual') }[q.answer_source || 'missing'] || ''
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

        html += `<div class="blanks-editor-hint">${i18n.t('asg.blank.autoSumHint')}</div>
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
            if (headerLabel) headerLabel.textContent = i18n.t('asg.blank.items', {count: q.metadata.blanks.length, points: totalPts});
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
        UIModule.toast(i18n.t('asg.toast.syncBlanks', {count: synced.length}), 'success');
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
                if (!confirm(i18n.t('asg.confirm.switchType'))) {
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
            if (total + this.state.pendingAttachments.length >= 10) { UIModule.toast(i18n.t('asg.create.attachMax'), 'warning'); break; }
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
        if (!data.title) { UIModule.toast(i18n.t('asg.toast.titleRequired'), 'warning'); return; }

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
            UIModule.toast(i18n.t('asg.toast.draftSaved'), 'success');
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            UIModule.toast(i18n.t('asg.toast.saveFail', {msg: resp?.message || resp?.detail || ''}), 'error');
        }
    },

    async saveAndPublish() {
        const data = this._getFormData();
        if (!data.title) { UIModule.toast(i18n.t('asg.toast.titleRequired'), 'warning'); return; }
        // Validate form questions before publishing
        if (data.assignment_type === 'form') {
            if (!data.questions || data.questions.length === 0) { UIModule.toast(i18n.t('asg.toast.formMinQuestions'), 'warning'); return; }
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
            UIModule.toast(i18n.t('asg.toast.published'), 'success');
            this.closeCreateModal();
            this.showTeacherList();
        } else {
            UIModule.toast(i18n.t('asg.toast.publishFail', {msg: resp?.message || resp?.detail || ''}), 'error');
        }
    },

    async editAssignment(id) {
        this.openCreateModal(id);
    },

    async publishAssignment(id) {
        if (!await UIModule.confirm(i18n.t('asg.confirm.publish'), i18n.t('asg.confirm.publishTitle'))) return;
        const resp = await AssignmentAPI.publishAssignment(id);
        if (resp?.success) {
            UIModule.toast(i18n.t('asg.toast.published'), 'success');
            this.viewAssignment(id);
        } else {
            UIModule.toast(i18n.t('asg.toast.publishFailShort'), 'error');
        }
    },

    async closeAssignment(id) {
        if (!await UIModule.confirm(i18n.t('asg.confirm.close'), i18n.t('asg.confirm.closeTitle'))) return;
        const resp = await AssignmentAPI.closeAssignment(id);
        if (resp?.success) {
            UIModule.toast(i18n.t('asg.toast.closed'), 'success');
            this.viewAssignment(id);
        } else {
            UIModule.toast(i18n.t('asg.toast.closeFail'), 'error');
        }
    },

    async deleteAssignment(id) {
        if (!await UIModule.confirm(i18n.t('asg.confirm.delete'), i18n.t('asg.confirm.deleteTitle'))) return;
        const resp = await AssignmentAPI.deleteAssignment(id);
        if (resp?.success) {
            UIModule.toast(i18n.t('asg.toast.deleted'), 'success');
            this.showTeacherList();
        } else {
            UIModule.toast(i18n.t('asg.toast.deleteFail'), 'error');
        }
    },

    // ---- Student ----
    async showStudentList() {
        this.state.phase = 'list';
        this.setBreadcrumb([{ label: i18n.t('asg.list.myTitle') }]);
        this.setHeaderActions('');

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="assignment-grid">${AssignmentUI.skeletonCards(3)}</div>`;

        const resp = await AssignmentAPI.listMyAssignments();
        if (!resp?.success) { main.innerHTML = `<p>${i18n.t('asg.page.loadFail')}</p>`; return; }

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
        if (!resp?.success) { main.innerHTML = `<p>${i18n.t('asg.page.loadFail')}</p>`; return; }

        const asg = resp.data;
        const sub = asg.my_submission;

        const isForm = asg.assignment_type === 'form';
        const isExam = asg.assignment_type === 'exam';
        const hasQuestions = isForm || isExam;

        this.setBreadcrumb([
            { label: i18n.t('asg.list.myTitle'), action: 'AssignmentApp.showStudentList()' },
            { label: asg.title }
        ]);

        // For form/exam type, hide file upload button
        if (hasQuestions) {
            this.setHeaderActions('');
        } else {
            this.setHeaderActions(
                !sub ? `<button class="btn btn-primary" onclick="AssignmentApp.openSubmitModal(${id})">${AssignmentUI.ICON.upload} ${i18n.t('asg.student.submitBtn')}</button>` :
                sub.status === 'submitted' ? `<button class="btn btn-warning" onclick="AssignmentApp.openSubmitModal(${id})">${i18n.t('asg.student.resubmitBtn')}</button>` : ''
            );
        }

        const deadlineWarn = !sub ? AssignmentUI.deadlineWarning(asg.deadline) : '';
        const questionsForCount = (asg.questions || []).filter(q => q.question_type !== 'passage');
        let html = `<div class="detail-hero fade-in">
            <h3 style="margin:0;">${asg.title}</h3>
            ${asg.description ? `<p style="color:var(--text-secondary);margin-top:6px;font-size:14px;">${asg.description}</p>` : ''}
            ${(asg.attachments && asg.attachments.length) ? `<div style="margin-top:12px;">
                <div style="font-size:13px;font-weight:500;color:var(--text-secondary);margin-bottom:6px;">${AssignmentUI.ICON.clip} ${i18n.t('asg.detail.attachments')}</div>
                ${AssignmentUI.renderFiles(asg.attachments)}
            </div>` : ''}
            <div class="detail-stats" style="margin-top:12px;">
                <div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.user}</div>
                    <div><div class="stat-value">${asg.created_by_name || ''}</div><div class="stat-label">${i18n.t('asg.detail.teacher')}</div></div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.clock}</div>
                    <div><div class="stat-value">${AssignmentUI.formatDate(asg.deadline)} ${deadlineWarn}</div><div class="stat-label">${i18n.t('asg.detail.deadline')}</div></div>
                </div>
                ${!hasQuestions ? `<div class="stat-card">
                    <div class="stat-icon">${AssignmentUI.ICON.clip}</div>
                    <div><div class="stat-value">${i18n.t('asg.detail.maxFiles', {count: asg.max_files || 5})}</div><div class="stat-label">${i18n.t('asg.detail.fileLimit')}</div></div>
                </div>` : `<div class="stat-card">
                    <div class="stat-icon">📝</div>
                    <div><div class="stat-value">${i18n.t('asg.detail.questionsN', {count: questionsForCount.length})}</div><div class="stat-label">${i18n.t('asg.detail.questionCount')}</div></div>
                </div>`}
            </div>
        </div>`;

        // ---- Form type: student form view ----
        if (isForm) {
            const questions = asg.questions || [];
            if (sub) {
                // Already submitted — show read-only results
                html += `<div class="form-section">
                    <h3>${i18n.t('asg.student.myAnswers')} ${AssignmentUI.badge(sub.status)}</h3>
                    <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                        ${i18n.t('asg.student.submitTime', {time: AssignmentUI.formatDate(sub.submitted_at)})}
                        ${sub.is_late ? ` <span class="badge badge-late">${i18n.t('asg.status.late')}</span>` : ''}
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
                    <h3>${i18n.t('asg.student.myAnswers')} ${AssignmentUI.badge(sub.status)}</h3>
                    <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                        ${i18n.t('asg.student.submitTime', {time: AssignmentUI.formatDate(sub.submitted_at)})}
                        ${sub.is_late ? ` <span class="badge badge-late">${i18n.t('asg.status.late')}</span>` : ''}
                    </div>
                    ${sub.score != null ? `<div class="student-score-hero"><div class="score-big">${sub.score}</div><div class="score-max">/ ${asg.max_score || '—'}</div></div>` : ''}
                    ${canEdit && !isGraded ? `<button class="btn btn-outline" style="margin-top:8px;" onclick="ExamStudentView._editMode=true;AssignmentApp.viewStudentAssignment(${id})">${i18n.t('asg.student.editAnswer')}</button>` : ''}
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
                <h3>${i18n.t('asg.student.mySubmission')} ${AssignmentUI.badge(sub.status)}</h3>
                <p style="margin:8px 0;color:var(--text-secondary);">${sub.content || i18n.t('asg.student.noNote')}</p>
                <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">
                    ${i18n.t('asg.student.submitTime', {time: AssignmentUI.formatDate(sub.submitted_at)})}
                    ${sub.is_late ? ` <span class="badge badge-late">${i18n.t('asg.status.late')}</span>` : ''}
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
                    <h3>${AssignmentUI.ICON.chart} ${i18n.t('asg.student.score')}</h3>`;

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
                        <div class="teacher-note-header">${AssignmentUI.ICON.edit} ${i18n.t('asg.student.teacherFeedback')}</div>
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
        // Reset code paste section
        const codeSec = document.getElementById('codePasteSection');
        if (codeSec) codeSec.classList.remove('open');
        const codeContent = document.getElementById('codeContent');
        if (codeContent) codeContent.value = '';
        const codeFileName = document.getElementById('codeFileName');
        if (codeFileName) codeFileName.value = 'code.txt';
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
        if (!btn) return;
        btn.disabled = true;
        btn.innerHTML = `<div class="loading-spinner"></div> ${i18n.t('asg.submit.submitting')}`;

        const content = document.getElementById('submitContent').value;
        const files = [...this.state.selectedFiles];

        // Convert pasted code to a File object
        const codeText = (document.getElementById('codeContent')?.value || '').trim();
        if (codeText) {
            const fileName = (document.getElementById('codeFileName')?.value || '').trim() || 'code.txt';
            const codeFile = new File([codeText], fileName, { type: 'text/plain' });
            files.push(codeFile);
        }

        try {
            const resp = await AssignmentAPI.submitAssignment(
                this.state.currentAssignment, content, files
            );
            if (resp?.success) {
                this.closeSubmitModal();
                UIModule.toast(i18n.t('asg.toast.submitSuccess'), 'success');
                this.viewStudentAssignment(this.state.currentAssignment);
            } else {
                UIModule.toast(
                    i18n.t('asg.toast.submitFail', {msg: resp?.message || resp?.detail || ''}),
                    'error',
                );
            }
        } catch (e) {
            // 保險 — _submitMultipart 理論上不會 throw,但萬一有其他 exception
            console.error('doSubmit error:', e);
            UIModule.toast(i18n.t('asg.toast.submitFail', {msg: e.message || '未知錯誤'}), 'error');
        } finally {
            // 不管成功或失敗,按鈕都必須還原,避免「卡在提交中」
            btn.disabled = false;
            btn.textContent = i18n.t('asg.submit.submit');
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
                        ${isSwift ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.runSwiftFile('${filePath}')">${i18n.t('asg.file.run')}</button>` : ''}
                        ${isHtml ? `<button class="btn btn-sm btn-success" onclick="AssignmentApp.previewHtml('/${filePath}','${this._escapeHtml(fileName)}')">${i18n.t('asg.file.runPreview')}</button>` : ''}
                    </div>
                </div>
                <div class="code-preview">${this._escapeHtml(this._cleanSwiftTokens(text))}</div>
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
                    let displayText = AssignmentUI._cleanSwiftTokens(text);
                    let truncated = false;
                    if (displayText.length > MAX_CODE_SIZE) {
                        displayText = displayText.substring(0, MAX_CODE_SIZE);
                        truncated = true;
                    }
                    const lines = displayText.split('\n');
                    if (lines.length > MAX_CODE_LINES) {
                        displayText = lines.slice(0, MAX_CODE_LINES).join('\n');
                        truncated = true;
                    }
                    el.innerHTML = `<div class="code-preview">${AssignmentUI._escapeHtml(displayText)}</div>
                        ${truncated ? `<div class="file-preview-truncated">${i18n.t('asg.file.truncated', {lines: MAX_CODE_LINES})}</div>` : ''}`;
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
                            ${d.truncated ? `<div class="file-preview-truncated">${i18n.t('asg.file.truncatedPartial')}</div>` : ''}`;
                    } else {
                        const msg = (json.data && json.data.message) || json.message || i18n.t('asg.file.previewFail');
                        el.innerHTML = `<div class="file-preview-error"><p>${AssignmentUI._escapeHtml(msg)}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>${i18n.t('asg.file.downloadFile')}</a></div>`;
                    }
                } else {
                    // .doc / .ppt etc
                    el.innerHTML = `<div class="file-preview-error"><p>${i18n.t('asg.file.formatNotSupported', {ext})}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>${i18n.t('asg.file.downloadFile')}</a></div>`;
                }
            } else if (fileType === 'archive' && (ext === 'swiftpm' || ext === 'zip')) {
                // .swiftpm / .zip
                el.innerHTML = `<div class="file-preview-loading"><div class="loading-spinner"></div> ${i18n.t('asg.file.extractingProject')}</div>`;
                const resp = await fetch(`/api/assignments/files/${fileId}/preview`, {
                    headers: AssignmentAPI._authHeaders()
                });
                const json = await resp.json();
                if (json.success && json.data && json.data.html) {
                    const d = json.data;
                    el.innerHTML = `<div class="file-preview-doc">${d.html}</div>
                        ${d.truncated ? `<div class="file-preview-truncated">${i18n.t('asg.file.truncatedCode')}</div>` : ''}`;
                } else {
                    const msg = (json.data && json.data.message) || json.message || i18n.t('asg.file.previewFail');
                    el.innerHTML = `<div class="file-preview-error"><p>${AssignmentUI._escapeHtml(msg)}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>${i18n.t('asg.file.downloadFile')}</a></div>`;
                }
            } else {
                // other archive types
                el.innerHTML = `<div class="file-preview-error"><p>${i18n.t('asg.file.typeNotSupported')}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>${i18n.t('asg.file.downloadFile')}</a></div>`;
            }
        } catch (e) {
            el.innerHTML = `<div class="file-preview-error"><p>${i18n.t('asg.file.previewLoadFail', {msg: AssignmentUI._escapeHtml(e.message || '')})}</p><a class="btn btn-sm btn-outline" href="${filePath}" download>${i18n.t('asg.file.downloadFile')}</a></div>`;
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
                area.innerHTML = `<div class="form-section"><h3>${i18n.t('asg.run.resultTitle')}</h3><div class="swift-output error">${i18n.t('asg.run.runFailed')}</div></div>`;
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
                    ${AssignmentUI.ICON.upload} ${i18n.t('asg.proxy.submit')}
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
            UIModule.toast(i18n.t('asg.toast.noFilesToSubmit'), 'warning');
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
                UIModule.toast(i18n.t('asg.toast.proxySubmitSuccess', {username}), 'success');
                this._proxyPendingFiles[username] = [];
                // Refresh the assignment view
                this.viewAssignment(assignmentId);
            } else {
                UIModule.toast(i18n.t('asg.toast.proxySubmitFail', {msg: resp?.message || resp?.detail || ''}), 'error');
                if (filesArea) {
                    const submitBtn = filesArea.querySelector('.btn-success');
                    if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${AssignmentUI.ICON.upload} ${i18n.t('asg.proxy.submit')}`; }
                }
            }
        } catch (e) {
            UIModule.toast(i18n.t('asg.toast.proxySubmitFail', {msg: e.message}), 'error');
            if (filesArea) {
                const submitBtn = filesArea.querySelector('.btn-success');
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerHTML = `${AssignmentUI.ICON.upload} ${i18n.t('asg.proxy.submit')}`; }
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
            if (!q.question_text.trim()) return i18n.t('asg.form.valEmptyQuestion', {n: i + 1});
            if (!q.max_points || q.max_points <= 0) return i18n.t('asg.form.valZeroScore', {n: i + 1});
            if (q.question_type === 'mc') {
                if (q.options.length < 2) return i18n.t('asg.form.valMinOptions', {n: i + 1});
                for (let j = 0; j < q.options.length; j++) {
                    if (!q.options[j].option_text.trim()) return i18n.t('asg.form.valEmptyOption', {n: i + 1, key: q.options[j].option_key});
                }
                if (!q.correct_answer) return i18n.t('asg.form.valNoCorrect', {n: i + 1});
            }
        }
        return null;
    },

    _updateTotalScore() {
        this._syncFromDOM();
        const total = this.questions.reduce((s, q) => s + (parseFloat(q.max_points) || 0), 0);
        const el = document.getElementById('formTotalScore');
        if (el) el.textContent = i18n.t('asg.form.totalScore', {score: total});
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

        try {
            const resp = await AssignmentAPI.submitForm(assignmentId, JSON.stringify(answers), this._pendingFiles);
            if (resp?.success) {
                this._clearDraft(assignmentId);
                UIModule.toast('提交成功', 'success');
                AssignmentApp.viewStudentAssignment(assignmentId);
                return;  // 成功 → 不還原按鈕(頁面即將切換)
            } else {
                UIModule.toast('提交失敗: ' + (resp?.message || resp?.detail || ''), 'error');
            }
        } catch (e) {
            console.error('submitForm error:', e);
            UIModule.toast('提交失敗: ' + (e.message || '未知錯誤'), 'error');
        }
        // 失敗才會走到這裡 — 還原按鈕避免卡住
        if (btn) { btn.disabled = false; btn.textContent = '提交作業'; }
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
                // Passage: read-only reference material (支持 markdown 表格)
                html += `<div class="esv-passage">
                    <div class="esv-passage-badge">資料</div>
                    <div class="esv-passage-text">${AssignmentUI._renderMd(q.question_text)}</div>
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
                <div class="fsv-q-text">${AssignmentUI._renderMd(q.question_text)}</div>
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
                    <div class="esv-passage-text">${AssignmentUI._renderMd(q.question_text)}</div>
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
                <div class="fsv-q-text">${AssignmentUI._renderMd(q.question_text)}</div>
                ${answerHtml}
                ${scoreHtml}
            </div>`;
        });
        return html;
    }
};

/* ============================================================
   FormGradingView v2 — 三欄批改工作台
   ============================================================ */
const FormGradingView = {
    // ---- State ----
    _state: {
        questions: [], answers: [], answerFiles: [],
        submissionId: null, submission: null,
        answerMap: {}, fileMap: {},
        currentIndex: 0, filter: 'all', navOpen: false,
    },
    _keyHandler: null,

    // ---- Helpers ----
    _isMc(q) {
        return q.question_type === 'mc' || q.question_type === 'multiple_choice' || q.question_type === 'true_false';
    },
    _getQuestionDisplayNumber(index) {
        let num = 0;
        for (let i = 0; i <= index; i++) {
            if (this._state.questions[i].question_type !== 'passage') num++;
        }
        return num;
    },
    _getGradingStats() {
        const s = this._state;
        let total = 0, graded = 0, scored = 0, maxPoints = 0;
        s.questions.forEach(q => {
            if (q.question_type === 'passage') return;
            total++;
            maxPoints += q.max_points || 0;
            const a = s.answerMap[q.id] || {};
            if (a.points != null) scored += a.points;
            if (this._isMc(q) || a.reviewed_at || a.score_source === 'teacher' || a.score_source === 'ai') graded++;
        });
        return { total, graded, scored, maxPoints };
    },
    _isVisibleByFilter(q, a) {
        const f = this._state.filter;
        if (f === 'all') return true;
        if (q.question_type === 'passage') return false;
        if (f === 'text') return !this._isMc(q);
        if (f === 'ungraded') return !this._isMc(q) && !(a.reviewed_at || a.score_source === 'teacher' || a.score_source === 'ai');
        return true;
    },

    // ---- Entry Point ----
    render(submission) {
        const s = this._state;
        s.submission = submission;
        s.questions = submission.questions || [];
        s.answers = submission.answers || [];
        s.answerFiles = submission.answer_files || [];
        s.submissionId = submission.id;
        s.filter = 'all';
        s.answerMap = {};
        s.answers.forEach(a => { s.answerMap[a.question_id] = a; });
        s.fileMap = {};
        s.answerFiles.forEach(f => {
            if (!s.fileMap[f.answer_id]) s.fileMap[f.answer_id] = [];
            s.fileMap[f.answer_id].push(f);
        });
        s.currentIndex = s.questions.findIndex(q => q.question_type !== 'passage');
        if (s.currentIndex < 0) s.currentIndex = 0;

        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="fgv-root">
            ${this._renderSummary()}
            <div class="fgv-body">
                <div class="fgv-nav" id="fgvNav">${this._renderNav()}</div>
                <div class="fgv-content" id="fgvContent">${this._renderContent()}</div>
                <div class="fgv-panel" id="fgvPanel">${this._renderPanel()}</div>
            </div>
        </div>`;
        this._setupKeyboard();
    },

    // ---- Summary Bar ----
    _renderSummary() {
        const s = this._state;
        const sub = s.submission;
        const stats = this._getGradingStats();
        return `<div class="fgv-summary" id="fgvSummary">
            <div class="fgv-summary-left">
                <span class="fgv-summary-student">${AssignmentApp._escapeHtml(sub.student_name || sub.username)}</span>
                <span class="fgv-summary-meta">${AssignmentUI.formatDate(sub.submitted_at)}${sub.is_late ? ' <span class="badge badge-late">逾期</span>' : ''}</span>
                <div class="fgv-summary-progress">
                    <span id="fgvProgressText">${stats.graded}/${stats.total} 已批改</span>
                    <div class="fgv-progress-bar"><div class="fgv-progress-fill" id="fgvProgressFill" style="width:${stats.total ? (stats.graded/stats.total*100) : 0}%"></div></div>
                </div>
                <span class="fgv-summary-score" id="fgvTotalScore">${stats.scored} / ${stats.maxPoints}</span>
            </div>
            <div class="fgv-summary-right">
                <button class="fgv-filter-pill ${s.filter==='all'?'active':''}" onclick="FormGradingView._setFilter('all')">全部</button>
                <button class="fgv-filter-pill ${s.filter==='text'?'active':''}" onclick="FormGradingView._setFilter('text')">文字題</button>
                <button class="fgv-filter-pill ${s.filter==='ungraded'?'active':''}" onclick="FormGradingView._setFilter('ungraded')">未批改</button>
                <button class="btn btn-sm btn-ai" onclick="FormGradingView._aiGradeAll()">AI 批改</button>
                <button class="fgv-nav-toggle btn btn-sm btn-outline" onclick="FormGradingView._toggleMobileNav()">題目</button>
            </div>
        </div>`;
    },

    // ---- Left Nav ----
    _renderNav() {
        const s = this._state;
        let html = '';
        s.questions.forEach((q, i) => {
            const isPassage = q.question_type === 'passage';
            const a = s.answerMap[q.id] || {};
            const isActive = i === s.currentIndex;
            let statusClass = '';
            if (isPassage) { statusClass = ''; }
            else if (this._isMc(q)) { statusClass = 'auto'; }
            else if (a.reviewed_at || a.score_source === 'teacher') { statusClass = 'graded'; }
            else if (a.score_source === 'ai') { statusClass = 'ai-graded'; }
            else if (a.ai_points != null) { statusClass = 'ai-pending'; }
            else { statusClass = 'ungraded'; }
            const typeLabelMap = { passage:'材料', mc:'選擇', multiple_choice:'選擇', true_false:'判斷', short_answer:'短答', fill_blank:'填空', open:'問答' };
            const typeLabel = typeLabelMap[q.question_type] || '題';
            const visible = this._isVisibleByFilter(q, a);
            html += `<div class="fgv-nav-item ${isActive?'active':''} ${isPassage?'passage':''}" data-index="${i}" onclick="FormGradingView.goToQuestion(${i})" ${!visible?'style="display:none"':''}>
                <span class="fgv-nav-num">${isPassage ? '—' : this._getQuestionDisplayNumber(i)}</span>
                <span class="fgv-nav-label">${typeLabel}</span>
                ${statusClass ? `<span class="fgv-nav-status ${statusClass}"></span>` : ''}
            </div>`;
        });
        return html;
    },

    // ---- Center Content ----
    _renderContent() {
        const s = this._state;
        const q = s.questions[s.currentIndex];
        if (!q) return '<div class="fgv-panel-empty">沒有題目</div>';
        let html = '';
        if (q.question_type === 'passage') {
            html += `<div class="fgv-passage-card">
                <div class="fgv-passage-label">閱讀材料</div>
                <div class="fgv-passage-text">${AssignmentUI._renderMd(q.question_text)}</div>
            </div>`;
            return html;
        }
        // Show preceding passage above question
        for (let i = s.currentIndex - 1; i >= 0; i--) {
            if (s.questions[i].question_type === 'passage') {
                html += `<div class="fgv-passage-card">
                    <div class="fgv-passage-label">閱讀材料</div>
                    <div class="fgv-passage-text">${AssignmentUI._renderMd(s.questions[i].question_text)}</div>
                </div>`;
                break;
            } else { break; }
        }
        const typeLabelMap = { mc:'選擇題', multiple_choice:'選擇題', true_false:'判斷題', short_answer:'短答題', fill_blank:'填空題', open:'問答題' };
        const typeLabel = typeLabelMap[q.question_type] || '題目';
        html += `<div class="fgv-question-card">
            <div class="fgv-question-head">
                <span class="fgv-question-number">Q${this._getQuestionDisplayNumber(s.currentIndex)}</span>
                <span class="fgv-type-badge">${typeLabel}</span>
                <span class="fgv-max-points">${q.max_points} 分</span>
            </div>
            <div class="fgv-question-text">${AssignmentUI._renderMd(q.question_text)}</div>`;
        if (this._isMc(q) && q.options && q.options.length) {
            const correctIdx = (q.metadata || {}).correct_index;
            html += '<div class="fgv-mc-options">';
            q.options.forEach((o, oi) => {
                const isCorrect = o.option_key === q.correct_answer || oi === correctIdx;
                html += `<div class="fgv-mc-option ${isCorrect?'correct':''}">
                    <span class="fgv-mc-option-key">${AssignmentApp._escapeHtml(o.option_key)}</span>
                    <span>${AssignmentApp._escapeHtml(o.option_text)}</span>
                </div>`;
            });
            html += '</div>';
        }
        html += '</div>'; // close fgv-question-card

        // ---- Student Answer (inline below question) ----
        const a = s.answerMap[q.id] || {};
        const files = s.fileMap[a.id] || [];
        const isMc = this._isMc(q);

        html += '<div class="fgv-student-answer-card">';
        html += '<div class="fgv-section-label">學生答案</div>';
        if (isMc) {
            let correct = a.is_correct;
            if (correct == null && a.answer_text && q.correct_answer) {
                correct = a.answer_text.trim().toUpperCase() === q.correct_answer.trim().toUpperCase();
            }
            html += `<div class="fgv-mc-result ${correct?'correct':'incorrect'}">
                <div class="fgv-mc-result-icon">${correct?'✓':'✗'}</div>
                <div>
                    <div style="font-weight:600;">${AssignmentApp._escapeHtml(a.answer_text||'—')}</div>
                    <div style="font-size:var(--type-meta);color:var(--text-secondary);">正確答案: ${AssignmentApp._escapeHtml(q.correct_answer||'')}</div>
                </div>
            </div>`;
        } else if (q.question_type === 'fill_blank' && a.answer_text) {
            try {
                const parsed = JSON.parse(a.answer_text);
                if (typeof parsed === 'object' && parsed !== null) {
                    html += '<div class="fgv-blank-fields">';
                    const blanks = Array.isArray(parsed.blanks) ? parsed.blanks
                                 : Array.isArray(parsed) ? parsed : null;
                    if (blanks) {
                        blanks.forEach((b, bi) => {
                            const val = typeof b === 'object' ? (b.value || b.answer || '') : String(b);
                            const label = typeof b === 'object' ? (b.label || `空格${bi+1}`) : `空格${bi+1}`;
                            html += `<div class="fgv-blank-field">
                                <span class="fgv-blank-field-label">${AssignmentApp._escapeHtml(label)}:</span>
                                <span class="fgv-blank-field-value">${AssignmentApp._escapeHtml(String(val))}</span>
                            </div>`;
                        });
                    } else {
                        Object.entries(parsed).forEach(([k, v]) => {
                            html += `<div class="fgv-blank-field">
                                <span class="fgv-blank-field-label">${AssignmentApp._escapeHtml(k)}:</span>
                                <span class="fgv-blank-field-value">${AssignmentApp._escapeHtml(String(v||''))}</span>
                            </div>`;
                        });
                    }
                    html += '</div>';
                } else {
                    html += `<div class="fgv-student-answer-text">${AssignmentApp._escapeHtml(a.answer_text)}</div>`;
                }
            } catch(e) {
                html += `<div class="fgv-student-answer-text">${AssignmentApp._escapeHtml(a.answer_text||'(未作答)')}</div>`;
            }
        } else {
            html += `<div class="fgv-student-answer-text">${AssignmentApp._escapeHtml(a.answer_text||'(未作答)')}</div>`;
        }
        // File attachments
        if (files.length) {
            html += '<div class="fgv-answer-files">';
            files.forEach(f => {
                const isImg = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(f.original_name);
                html += isImg
                    ? `<img class="fgv-answer-file-img" src="${f.file_path}" alt="${AssignmentApp._escapeHtml(f.original_name)}">`
                    : `<a href="${f.file_path}" target="_blank" class="btn btn-sm btn-outline">${AssignmentApp._escapeHtml(f.original_name)}</a>`;
            });
            html += '</div>';
        }
        html += '</div>'; // close fgv-student-answer-card

        // ---- AI Feedback (inline below answer) ----
        if (a.ai_feedback && !isMc) {
            html += `<div class="fgv-ai-feedback-card">
                <div class="fgv-section-label"><span class="fgv-ai-tag">AI</span> 批改反饋</div>
                <div class="fgv-ai-feedback-text">${AssignmentApp._escapeHtml(a.ai_feedback)}</div>
            </div>`;
        }

        // ---- Reference Answer (collapsible) ----
        if (q.reference_answer && !isMc) {
            html += `<div class="fgv-reference-section">
                <button class="fgv-reference-toggle" onclick="FormGradingView._toggleReference()">參考答案 <span id="fgvRefIcon">▶</span></button>
                <div class="fgv-reference-body" id="fgvRefBody">${AssignmentApp._escapeHtml(q.reference_answer)}</div>
            </div>`;
        }
        if (q.grading_notes && !isMc) {
            html += `<div class="fgv-grading-notes"><strong>批改注意:</strong> ${AssignmentApp._escapeHtml(q.grading_notes)}</div>`;
        }

        return html;
    },

    // ---- Right Grading Panel (compact: score + feedback + actions only) ----
    _renderPanel() {
        const s = this._state;
        const q = s.questions[s.currentIndex];
        if (!q) return '';
        if (q.question_type === 'passage') return '<div class="fgv-panel-empty">閱讀材料無需批改</div>';
        const a = s.answerMap[q.id] || {};
        const isMc = this._isMc(q);
        let html = '';

        // MC: auto score + nav only
        if (isMc) {
            html += `<div style="text-align:center;padding:var(--space-2);font-size:var(--type-body);color:var(--text-secondary);">
                得分: <strong>${a.points!=null?a.points:'—'}</strong> / ${q.max_points}
                <span class="badge" style="margin-left:var(--space-2);background:rgba(0,122,255,0.1);color:#007AFF;">自動</span>
            </div>
            <div class="fgv-actions">
                <button class="btn btn-outline" onclick="FormGradingView._goToPrev()">上一題</button>
                <button class="btn btn-primary" onclick="FormGradingView._goToNextUngraded()">下一題</button>
            </div>`;
            return html;
        }

        // AI score badge (compact, no accept button)
        if (a.ai_points != null) {
            html += `<div class="fgv-ai-score-badge">
                <span class="fgv-ai-tag">AI</span>
                <span>${a.ai_points} / ${q.max_points}</span>
            </div>`;
        }
        // Score input (pre-filled with current points, which backend already sets to ai_points)
        html += `<div class="fgv-score-section"><div class="fgv-score-row">
            <span class="fgv-score-label">給分</span>
            <input type="number" class="fgv-score-input" id="fgvScoreInput" value="${a.points!=null?a.points:''}" min="0" max="${q.max_points}" step="0.5" placeholder="0">
            <span class="fgv-score-max">/ ${q.max_points}</span>
        </div></div>`;
        // Feedback (pre-filled with teacher feedback or AI feedback)
        html += `<div class="fgv-feedback-section"><label>反饋</label>
            <textarea id="fgvFeedback" rows="3" placeholder="輸入反饋...">${AssignmentApp._escapeHtml(a.teacher_feedback || a.ai_feedback || '')}</textarea>
        </div>`;
        // Actions
        html += `<div class="fgv-actions">
            <button class="btn btn-primary" onclick="FormGradingView._saveGrade()">確認評分</button>
            <button class="btn btn-outline" onclick="FormGradingView._saveAndNext()">保存並下一題</button>
        </div>
        <div class="fgv-save-status" id="fgvSaveStatus"></div>`;
        return html;
    },

    // ---- Navigation ----
    goToQuestion(index) {
        const s = this._state;
        if (index < 0 || index >= s.questions.length) return;
        document.querySelectorAll('.fgv-nav-item').forEach(el => el.classList.remove('active'));
        const target = document.querySelector(`.fgv-nav-item[data-index="${index}"]`);
        if (target) target.classList.add('active');
        s.currentIndex = index;
        const content = document.getElementById('fgvContent');
        const panel = document.getElementById('fgvPanel');
        if (content) { content.innerHTML = this._renderContent(); content.scrollTop = 0; }
        if (panel) { panel.innerHTML = this._renderPanel(); panel.scrollTop = 0; }
        if (s.navOpen) this._toggleMobileNav();
    },
    _goToNextUngraded() {
        const s = this._state;
        const check = (i) => {
            const q = s.questions[i];
            if (q.question_type === 'passage' || this._isMc(q)) return false;
            const a = s.answerMap[q.id] || {};
            return !(a.reviewed_at || a.score_source === 'teacher' || a.score_source === 'ai');
        };
        for (let i = s.currentIndex + 1; i < s.questions.length; i++) { if (check(i)) { this.goToQuestion(i); return; } }
        for (let i = 0; i < s.currentIndex; i++) { if (check(i)) { this.goToQuestion(i); return; } }
        const next = Math.min(s.currentIndex + 1, s.questions.length - 1);
        this.goToQuestion(next);
        UIModule.toast('所有題目已批改完畢', 'success');
    },
    _goToPrev() {
        if (this._state.currentIndex > 0) this.goToQuestion(this._state.currentIndex - 1);
    },

    // ---- Grading Actions ----
    async _saveGrade() {
        const s = this._state;
        const q = s.questions[s.currentIndex];
        const a = s.answerMap[q.id] || {};
        const pts = parseFloat(document.getElementById('fgvScoreInput')?.value);
        const fb = document.getElementById('fgvFeedback')?.value || '';
        if (isNaN(pts) || pts < 0) { UIModule.toast('請輸入有效分數', 'warning'); return; }
        if (pts > q.max_points) { UIModule.toast(`分數不能超過 ${q.max_points}`, 'warning'); return; }
        const statusEl = document.getElementById('fgvSaveStatus');
        if (statusEl) statusEl.textContent = '保存中...';
        const resp = await AssignmentAPI.gradeFormAnswer(s.submissionId, a.id, { points: pts, feedback: fb });
        if (resp?.success) {
            a.points = pts; a.teacher_feedback = fb;
            a.reviewed_at = new Date().toISOString(); a.score_source = 'teacher';
            if (statusEl) { statusEl.textContent = '✓ 已保存'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
            this._updateSummary(); this._updateNavStatus();
            UIModule.toast('評分已保存', 'success');
        } else {
            if (statusEl) statusEl.textContent = '';
            UIModule.toast('評分失敗: ' + (resp?.message || resp?.detail || ''), 'error');
        }
    },
    async _saveAndNext() {
        await this._saveGrade();
        const a = this._state.answerMap[this._state.questions[this._state.currentIndex]?.id] || {};
        if (a.score_source === 'teacher') this._goToNextUngraded();
    },
    async _aiGradeAll() {
        if (!confirm('確定要對所有文字題進行 AI 批改？')) return;
        UIModule.toast('AI 批改中...', 'info');
        const resp = await AssignmentAPI.aiGradeForm(this._state.submissionId);
        if (resp?.success) {
            UIModule.toast('AI 批改完成，重新載入...', 'success');
            AssignmentApp.viewSubmission(this._state.submissionId);
        } else { UIModule.toast('AI 批改失敗: ' + (resp?.message || resp?.detail || ''), 'error'); }
    },

    // ---- UI Updates ----
    _updateSummary() {
        const stats = this._getGradingStats();
        const txt = document.getElementById('fgvProgressText');
        const fill = document.getElementById('fgvProgressFill');
        const score = document.getElementById('fgvTotalScore');
        if (txt) txt.textContent = `${stats.graded}/${stats.total} 已批改`;
        if (fill) fill.style.width = `${stats.total ? (stats.graded/stats.total*100) : 0}%`;
        if (score) score.textContent = `${stats.scored} / ${stats.maxPoints}`;
    },
    _updateNavStatus() {
        const s = this._state;
        s.questions.forEach((q, i) => {
            const dot = document.querySelector(`.fgv-nav-item[data-index="${i}"] .fgv-nav-status`);
            if (!dot) return;
            const a = s.answerMap[q.id] || {};
            dot.className = 'fgv-nav-status';
            if (this._isMc(q)) dot.classList.add('auto');
            else if (a.reviewed_at || a.score_source === 'teacher') dot.classList.add('graded');
            else if (a.score_source === 'ai') dot.classList.add('ai-graded');
            else if (a.ai_points != null) dot.classList.add('ai-pending');
            else dot.classList.add('ungraded');
        });
    },
    _setFilter(filter) {
        this._state.filter = filter;
        const nav = document.getElementById('fgvNav');
        if (nav) nav.innerHTML = this._renderNav();
        document.querySelectorAll('.fgv-filter-pill').forEach(p => {
            p.classList.toggle('active',
                (filter === 'all' && p.textContent === '全部') ||
                (filter === 'text' && p.textContent === '文字題') ||
                (filter === 'ungraded' && p.textContent === '未批改'));
        });
    },
    _toggleReference() {
        const body = document.getElementById('fgvRefBody');
        const icon = document.getElementById('fgvRefIcon');
        if (body) { body.classList.toggle('open'); if (icon) icon.textContent = body.classList.contains('open') ? '▼' : '▶'; }
    },
    _toggleMobileNav() {
        const nav = document.getElementById('fgvNav');
        this._state.navOpen = !this._state.navOpen;
        if (nav) nav.classList.toggle('open', this._state.navOpen);
    },
    _setupKeyboard() {
        if (this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
        this._keyHandler = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); this.goToQuestion(Math.min(this._state.currentIndex + 1, this._state.questions.length - 1)); }
            else if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); this.goToQuestion(Math.max(this._state.currentIndex - 1, 0)); }
            else if (e.key >= '1' && e.key <= '9') {
                const targetNum = parseInt(e.key); let count = 0;
                for (let i = 0; i < this._state.questions.length; i++) {
                    if (this._state.questions[i].question_type !== 'passage') count++;
                    if (count === targetNum) { this.goToQuestion(i); break; }
                }
            }
        };
        document.addEventListener('keydown', this._keyHandler);
    },
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
