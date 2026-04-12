/**
 * 教師管理後台 — 前端核心模組
 * ==============================
 *
 * 架構：
 *   AdminAPI  — API 請求封裝
 *   AdminUI   — DOM 渲染 / 通知
 *   AdminApp  — 主控制器（狀態 + 事件綁定 + 業務邏輯）
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 * 加載順序: shared/* → admin_dashboard.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const AdminAPI = {

    /* ---------- 通用 ---------- */
    async fetchWithAuth(url, options = {}) {
        const headers = { ...AuthModule.getAuthHeaders(), ...(options.headers || {}) };
        const resp = await fetch(url, { ...options, headers });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || err.error?.message || i18n.t('adm.api.requestFailed', {status: resp.status}));
        }
        return resp.json();
    },

    /* ---------- 學科 ---------- */
    async fetchSubjects() {
        const resp = await fetch('/api/admin/subjects', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadSubjectsFailed'));
        return resp.json();
    },

    async createSubject(data) {
        const resp = await fetch('/api/admin/subjects', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.addFailed'));
        }
        return resp.json();
    },

    async updateSubject(code, data) {
        const resp = await fetch(`/api/admin/subjects/${code}`, {
            method: 'PUT',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.updateFailed'));
        }
        return resp.json();
    },

    async deleteSubject(code) {
        const resp = await fetch(`/api/admin/subjects/${code}`, {
            method: 'DELETE',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.deleteFailed'));
        }
        return resp.json();
    },

    /* ---------- 統計 ---------- */
    async fetchStatistics() {
        const resp = await fetch('/api/admin/statistics', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadStatsFailed'));
        return resp.json();
    },

    /* ---------- 知識庫 ---------- */
    async fetchKnowledgeStats() {
        const resp = await fetch('/api/admin/knowledge-stats', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadKnowledgeStatsFailed'));
        return resp.json();
    },

    async fetchDocuments(subject) {
        const resp = await fetch(`/api/admin/documents/${subject}`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadDocsFailed'));
        return resp.json();
    },

    async uploadDocument(formData) {
        const resp = await fetch('/api/admin/upload-document', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders(),
            body: formData
        });
        return resp;
    },

    async deleteDocument(subject, filename) {
        const resp = await fetch(`/api/admin/documents/${subject}/${encodeURIComponent(filename)}`, {
            method: 'DELETE',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.deleteDocFailed'));
        return resp.json();
    },

    /* ---------- 提示詞 ---------- */
    async fetchPrompt(subjectCode) {
        const resp = await fetch(`/api/admin/prompts/${subjectCode}`, {
            headers: AuthModule.getAuthHeaders()
        });
        return resp;
    },

    async savePrompt(subjectCode, prompt) {
        const resp = await fetch(`/api/admin/prompts/${subjectCode}`, {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.saveFailed'));
        }
        return resp.json();
    },

    /* ---------- 封禁管理 ---------- */
    async fetchBlockedAccounts() {
        const resp = await fetch('/api/admin/blocked-accounts', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadBlockedFailed'));
        return resp.json();
    },

    async unblockAccount(blockType, key) {
        const resp = await fetch('/api/admin/unblock', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ block_type: blockType, key: key })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.message || i18n.t('adm.api.unblockFailed'));
        }
        return resp.json();
    },

    /* ---------- 系統日誌 ---------- */
    async fetchSystemLogs(params = {}) {
        const qs = new URLSearchParams({
            log_type: params.log_type || 'app_file',
            limit: params.limit || '100',
            search: params.search || '',
            level: params.level || '',
        }).toString();
        const resp = await fetch(`/api/admin/system-logs?${qs}`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadSyslogsFailed'));
        return resp.json();
    },

    /* ---------- 用戶 ---------- */
    async fetchUsers() {
        const resp = await fetch('/api/admin/users', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadUsersFailed'));
        return resp.json();
    },

    async createUser(data) {
        const resp = await fetch('/api/admin/users', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.addFailed'));
        }
        return resp.json();
    },

    async updateUser(username, data) {
        const resp = await fetch(`/api/admin/users/${username}`, {
            method: 'PUT',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.updateFailed'));
        }
        return resp.json();
    },

    async deleteUser(username) {
        const resp = await fetch(`/api/admin/users/${username}`, {
            method: 'DELETE',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.deleteFailed'));
        }
        return resp.json();
    },

    async resetUserPassword(username, newPassword) {
        const resp = await fetch(`/api/admin/users/${username}/reset-password`, {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_password: newPassword })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.resetFailed'));
        }
        return resp.json();
    },

    async batchAddUsers(users) {
        const resp = await fetch('/api/admin/users/batch', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ users })
        });
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || i18n.t('adm.api.batchAddFailed'));
        }
        return resp.json();
    },

    async uploadExcelUsers(formData) {
        const resp = await fetch('/api/admin/users/upload-excel', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders(),
            body: formData
        });
        return resp.json();
    },

    async downloadUserTemplate() {
        const resp = await fetch('/api/admin/users/template', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.downloadTemplateFailed'));
        return resp.blob();
    },

    /* ---------- 學生分析 ---------- */
    async fetchStudentOverview(studentId) {
        const resp = await fetch(`/api/teacher/student/${studentId}/overview`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadStudentOverviewFailed'));
        return resp.json();
    },

    async fetchStudentAnalysis(studentId, subject) {
        const resp = await fetch(`/api/teacher/student/${studentId}/analysis/${subject}`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadAnalysisFailed'));
        return resp.json();
    },

    async fetchStudentsSummary(className) {
        // class_name optional — backend reads from student_risk_cache
        const url = className
            ? '/api/teacher/students/summary?class_name=' + encodeURIComponent(className)
            : '/api/teacher/students/summary';
        const resp = await fetch(url, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.networkError'));
        return resp.json();
    },

    async fetchTopAtRisk(limit) {
        const resp = await fetch('/api/teacher/students/at_risk?limit=' + (limit || 10), {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.networkError'));
        return resp.json();
    },

    async forceRefreshRisk() {
        const resp = await fetch('/api/teacher/students/risk/refresh', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) {
            const text = await resp.text();
            throw new Error(text || i18n.t('adm.api.networkError'));
        }
        return resp.json();
    },

    /* ---------- 通告 ---------- */
    async startNoticeDialogue(sessionId) {
        const resp = await fetch('/api/admin/notice/dialogue/start', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, initial_info: null })
        });
        return resp.json();
    },

    async continueNoticeDialogue(sessionId, userInput) {
        const resp = await fetch('/api/admin/notice/dialogue/continue', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId, user_input: userInput })
        });
        return resp.json();
    },

    async exportNotice(sessionId) {
        const resp = await fetch('/api/admin/notice/dialogue/export', {
            method: 'POST',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sessionId })
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.exportFailed'));
        return resp.blob();
    },

    /* ---------- 通告範本 ---------- */
    async fetchNoticeTemplates() {
        const resp = await fetch('/api/admin/notice/templates', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadTemplatesFailed'));
        return resp.json();
    },

    async uploadNoticeTemplate(formData) {
        const resp = await fetch('/api/admin/notice/upload-template-sample', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders(),
            body: formData
        });
        return resp;
    },

    /* ---------- 應用管理 ---------- */
    async fetchApps() {
        const resp = await fetch('/api/admin/apps', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.loadAppsFailed'));
        return resp.json();
    },

    async saveApps(modules) {
        const resp = await fetch('/api/admin/apps', {
            method: 'PUT',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ modules })
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.saveFailed'));
        return resp.json();
    },

    async resetApps() {
        const resp = await fetch('/api/admin/apps/reset', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error(i18n.t('adm.api.resetFailed'));
        return resp.json();
    }
};


/* ============================================================
   UI — DOM 渲染 / 通知
   ============================================================ */

const AdminUI = {

    /* ---------- SVG Icon Helper ---------- */
    /** Returns an inline <svg> referencing the sprite symbol.
     *  @param {string} id   — symbol ID without '#' (e.g. 'books')
     *  @param {string} [cls] — extra CSS classes (e.g. 'icon-lg icon-white')
     *  @param {string} [style] — inline style string
     */
    icon(id, cls, style) {
        const c = 'icon' + (cls ? ' ' + cls : '');
        const s = style ? ` style="${style}"` : '';
        return `<svg class="${c}"${s}><use href="#i-${id}"/></svg>`;
    },

    /* ---------- Markdown 格式化 ---------- */
    formatMarkdownText(text) {
        if (!text) return '';
        try {
            marked.setOptions({ breaks: true, gfm: true, sanitize: false });
            return DOMPurify.sanitize(marked.parse(text));
        } catch (error) {
            console.error('Markdown 解析錯誤:', error);
            return text
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.*?)\*/g, '<em>$1</em>')
                .replace(/\n/g, '<br>');
        }
    },

    formatReportText(text) {
        if (!text) return '';
        return DOMPurify.sanitize(marked.parse(text));
    },

    /* ---------- 日期/文件工具 ---------- */
    formatDate(dtStr) {
        try { return new Date(dtStr).toLocaleString('zh-CN'); } catch { return dtStr || '-'; }
    },

    formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    },

    /* ---------- 風險等級 ---------- */
    getRiskText(riskLevel) {
        const riskTexts = {
            'low': i18n.t('adm.risk.low'),
            'medium': i18n.t('adm.risk.medium'),
            'high': i18n.t('adm.risk.high'),
            'unknown': i18n.t('adm.risk.unknown')
        };
        return riskTexts[riskLevel] || i18n.t('adm.risk.default');
    },

    getRiskDescription(riskLevel) {
        const descriptions = {
            'low': i18n.t('adm.risk.descLow'),
            'medium': i18n.t('adm.risk.descMedium'),
            'high': i18n.t('adm.risk.descHigh')
        };
        return descriptions[riskLevel] || i18n.t('adm.risk.descDefault');
    },

    /* ---------- 學科名稱 ---------- */
    getSubjectName(code) {
        return AdminApp.state.subjects[code]?.name || code;
    },

    /* ---------- 範本類型 ---------- */
    getTemplateTypeName(type) {
        const names = { 'activity': i18n.t('adm.tplType.activity'), 'exam': i18n.t('adm.tplType.exam'), 'meeting': i18n.t('adm.tplType.meeting'), 'general': i18n.t('adm.tplType.general') };
        return names[type] || type;
    },

    getTemplateTypeIcon(type) {
        const ids = { 'activity': 'ticket', 'exam': 'pencil', 'meeting': 'users', 'general': 'megaphone' };
        return this.icon(ids[type] || 'document', 'icon-sm');
    },

    getTemplateTypeColor(type) {
        const colors = { 'activity': '#006633', 'exam': '#FF9500', 'meeting': '#007AFF', 'general': '#34C759' };
        return colors[type] || 'var(--primary)';
    },

    /* ---------- 成功通知 ---------- */
    showSuccessNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 15px 25px; background: var(--success); color: white; border-radius: 8px; box-shadow: var(--shadow); z-index: 9999; animation: slideIn 0.3s ease;';
        notification.innerHTML = this.icon('check-circle', 'icon-sm icon-white') + ' ' + message;
        document.body.appendChild(notification);
        setTimeout(() => {
            notification.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => document.body.removeChild(notification), 300);
        }, 3000);
    },

    /* ---------- 學科渲染 ---------- */
    renderSubjects() {
        const grid = document.getElementById('subjectGrid');
        if (!grid) return;
        grid.innerHTML = '';

        const entries = Object.entries(AdminApp.state.subjects || {});
        if (!entries.length) {
            grid.innerHTML = '<div class="empty-state">' + i18n.t('adm.subject.noSubjects') + '</div>';
            const ts = document.getElementById('totalSubjects');
            if (ts) ts.textContent = 0;
            return;
        }

        for (const [code, subject] of entries) {
            const icon = (subject && (subject.icon || subject?.config?.icon)) || this.icon('books', 'icon-2xl', 'stroke:var(--brand)');
            const name = (subject && (subject.name || code)) || code;
            const desc = subject?.config?.description || '';
            const docCount = subject?.config?.doc_count || 0;

            const card = document.createElement('div');
            card.className = 'subject-card';
            card.setAttribute('data-subject', code);

            card.addEventListener('click', () => {
                try { AdminApp.state.currentSubject = code; } catch (e) {}
                AdminApp.switchTab('knowledge');
                const sel = document.getElementById('knowledgeSubjectSelect');
                if (sel) sel.value = code;
                try { AdminApp.refreshDocuments(); } catch (e) {}
            });

            card.innerHTML = `
                <div class="subject-actions">
                    <button class="icon-btn" title="${i18n.t('adm.subject.edit')}" data-action="editSubject" data-code="${code}">
                        ${this.icon('pencil-sm', 'icon-sm')}
                    </button>
                    <button class="icon-btn btn-danger" title="${i18n.t('adm.subject.delete')}" data-action="deleteSubject" data-code="${code}">
                        ${this.icon('trash', 'icon-sm')}
                    </button>
                </div>
                <div class="subject-icon">${icon}</div>
                <div class="subject-name">${name}</div>
                <div class="subject-code" style="color:#666; font-size:12px; margin-top:4px;">
                    ${i18n.t('adm.subject.code', {code})}
                </div>
                ${desc ? `<div style="margin-top:8px; color:#777; font-size:13px; line-height:1.4;">${desc}</div>` : ''}
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border); font-size:12px; color:var(--text-secondary);">
                    ${this.icon('document', 'icon-sm')} ${i18n.t('adm.subject.docCount', {count: docCount})}
                </div>
            `;

            // stop propagation for action buttons
            card.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const action = btn.dataset.action;
                    const c = btn.dataset.code;
                    if (action === 'editSubject') AdminApp.showEditSubjectModal(c);
                    else if (action === 'deleteSubject') AdminApp.deleteSubject(c);
                });
            });

            grid.appendChild(card);
        }

        const ts = document.getElementById('totalSubjects');
        if (ts) ts.textContent = entries.length;
    },

    /* ---------- 文檔列表渲染 ---------- */
    renderDocuments(documents, subject) {
        const container = document.getElementById('documentsList');

        if (!documents || documents.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <div style="margin-bottom: 1rem;">${this.icon('inbox', '', 'width:48px;height:48px;stroke:var(--text-secondary)')}</div>
                    <p>${i18n.t('adm.docs.empty')}</p>
                </div>
            `;
            return;
        }

        let html = '<div style="display: grid; gap: 1rem;">';
        documents.forEach(doc => {
            const icon = AdminUI.icon('document', 'icon-lg', `stroke:${{ 'pdf': '#E53935', 'docx': '#1565C0', 'txt': '#616161', 'pptx': '#E65100', 'md': '#2E7D32' }[doc.type] || 'var(--text-secondary)'}`);
            const size = this.formatFileSize(doc.size);
            const date = new Date(doc.modified).toLocaleDateString('zh-CN');

            html += `
                <div style="display: flex; align-items: center; padding: 1rem; background: var(--bg); border-radius: 8px; gap: 1rem;">
                    <div style="font-size: 2rem;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; margin-bottom: 4px;">${doc.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${size} • ${i18n.t('adm.docs.uploadedAt', {date})}
                        </div>
                    </div>
                    <button data-action="deleteDoc" data-subject="${subject}" data-name="${doc.name}"
                            style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 6px; cursor: pointer;">
                        ${i18n.t('adm.docs.deleteBtn')}
                    </button>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        // bind delete buttons
        container.querySelectorAll('[data-action="deleteDoc"]').forEach(btn => {
            btn.addEventListener('click', () => {
                AdminApp.deleteDocument(btn.dataset.subject, btn.dataset.name);
            });
        });
    },

    /* ---------- 用戶表格渲染（性能優化版） ---------- */
    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');

        // 使用事件委派（只綁一次，不再逐行綁定）
        if (!tbody._delegated) {
            tbody._delegated = true;
            tbody.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                const uname = btn.dataset.username;
                if (action === 'editUser') AdminApp.editUser(uname);
                else if (action === 'resetPwd') AdminApp.resetUserPassword(uname);
                else if (action === 'deleteUser') AdminApp.deleteUser(uname);
            });
        }

        // 使用 innerHTML 一次寫入，避免逐行 DOM 操作
        const roleMap = {
            'admin': `<span style="background: var(--color-error); color: white; padding: 2px 8px; border-radius: 12px;">${i18n.t('adm.user.roleAdmin')}</span>`,
            'teacher': `<span style="background: var(--color-warning); color: white; padding: 2px 8px; border-radius: 12px;">${i18n.t('adm.user.roleTeacher')}</span>`,
            'student': `<span style="background: var(--color-success); color: white; padding: 2px 8px; border-radius: 12px;">${i18n.t('adm.user.roleStudent')}</span>`
        };

        const rows = [];
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            const roleDisplay = roleMap[user.role] || user.role;
            const statusDisplay = user.status === 'active' ? `<span style="color: green;">${i18n.t('adm.user.statusActive')}</span>` : `<span style="color: red;">${i18n.t('adm.user.statusDisabled')}</span>`;
            let lastLogin = user.last_login || i18n.t('adm.user.neverLogin');
            if (lastLogin !== i18n.t('adm.user.neverLogin')) {
                try { lastLogin = new Date(lastLogin).toLocaleString('zh-CN'); } catch (e) {}
            }
            rows.push(`<tr>
                <td style="padding: 12px;">${user.username}</td>
                <td style="padding: 12px;">${user.display_name || '-'}</td>
                <td style="padding: 12px;">${user.english_name || '-'}</td>
                <td style="padding: 12px;">${roleDisplay}</td>
                <td style="padding: 12px;">${user.class_name || '-'}</td>
                <td style="padding: 12px;">${user.card_id || '-'}</td>
                <td style="padding: 12px;">${statusDisplay}</td>
                <td style="padding: 12px;">${user.login_count || 0}</td>
                <td style="padding: 12px;">${lastLogin}</td>
                <td style="padding: 12px;">
                    <button data-action="editUser" data-username="${user.username}" style="padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; margin-right: 5px; cursor: pointer;">${i18n.t('adm.user.editBtn')}</button>
                    <button data-action="resetPwd" data-username="${user.username}" style="padding: 4px 8px; background: var(--warning); color: white; border: none; border-radius: 4px; margin-right: 5px; cursor: pointer;">${i18n.t('adm.user.resetPwdBtn')}</button>
                    <button data-action="deleteUser" data-username="${user.username}" style="padding: 4px 8px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;">${i18n.t('adm.user.deleteBtn')}</button>
                </td>
            </tr>`);
        }
        tbody.innerHTML = rows.join('');
    },

    /* ---------- 系統日誌渲染 ---------- */
    renderSystemLogs(data) {
        const container = document.getElementById('syslogsContainer');
        if (!container) return;

        const entries = data?.data?.entries || [];
        if (entries.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);text-align:center;padding:2rem;">' + i18n.t('adm.logs.empty') + '</p>';
            return;
        }

        const levelBadge = (lv) => {
            const colors = {
                ERROR:   'background:#FEE2E2;color:#DC2626;',
                WARNING: 'background:#FEF3C7;color:#D97706;',
                INFO:    'background:#E8F5EC;color:#006633;',
                DEBUG:   'background:#F3F4F6;color:#6B7280;',
            };
            const style = colors[lv] || colors.INFO;
            return `<span style="${style}padding:2px 8px;border-radius:4px;font-size:0.75em;font-weight:600;">${lv}</span>`;
        };

        const formatTime = (ts) => {
            if (!ts) return '-';
            try {
                const d = new Date(ts);
                if (isNaN(d.getTime())) return ts;
                return d.toLocaleString('zh-TW', { hour12: false });
            } catch { return ts; }
        };

        const escHtml = (s) => {
            if (!s) return '';
            const d = document.createElement('div');
            d.textContent = String(s);
            return d.innerHTML;
        };

        let html = `
            <table style="width:100%;border-collapse:collapse;font-size:0.85em;">
                <thead>
                    <tr style="background:var(--light);text-align:left;">
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap;">${i18n.t('adm.logs.thTime')}</th>
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap;">${i18n.t('adm.logs.thLevel')}</th>
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap;">${i18n.t('adm.logs.thEvent')}</th>
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap;">${i18n.t('adm.logs.thUser')}</th>
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);white-space:nowrap;">${i18n.t('adm.logs.thIP')}</th>
                        <th style="padding:10px 12px;border-bottom:2px solid var(--border);">${i18n.t('adm.logs.thDetails')}</th>
                    </tr>
                </thead>
                <tbody>`;

        for (const e of entries) {
            const detailStr = e.details && Object.keys(e.details).length > 0
                ? escHtml(JSON.stringify(e.details)).substring(0, 120)
                : '-';
            html += `
                <tr style="border-bottom:1px solid var(--border);">
                    <td style="padding:8px 12px;white-space:nowrap;color:var(--text-secondary);font-family:monospace;font-size:0.9em;">${escHtml(formatTime(e.timestamp))}</td>
                    <td style="padding:8px 12px;">${levelBadge(e.level)}</td>
                    <td style="padding:8px 12px;font-weight:500;">${escHtml(e.event)}</td>
                    <td style="padding:8px 12px;">${escHtml(e.username) || '-'}</td>
                    <td style="padding:8px 12px;font-family:monospace;font-size:0.9em;">${escHtml(e.ip) || '-'}</td>
                    <td style="padding:8px 12px;color:var(--text-secondary);max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                        title="${escHtml(JSON.stringify(e.details || {}))}">${detailStr}</td>
                </tr>`;
        }

        html += '</tbody></table>';
        html += `<p style="text-align:center;color:var(--text-secondary);font-size:0.8em;margin-top:12px;">${i18n.t('adm.logs.totalRecords', {count: entries.length})}</p>`;
        container.innerHTML = html;
    },

    /* ---------- 封禁列表渲染 ---------- */
    renderBlockedAccounts(data) {
        const container = document.getElementById('blockedAccountsContainer');
        if (!container) return;

        const blocked = data.data || data;
        const allEntries = [];

        (blocked.blocked_users || []).forEach(entry => {
            allEntries.push({
                type: 'user', typeLabel: i18n.t('adm.blocked.typeUser'), key: entry.username,
                display: entry.username, remaining: entry.remaining_seconds,
                blockedUntil: entry.blocked_until,
            });
        });
        (blocked.blocked_ips || []).forEach(entry => {
            allEntries.push({
                type: 'ip', typeLabel: 'IP', key: entry.ip,
                display: entry.ip, remaining: entry.remaining_seconds,
                blockedUntil: entry.blocked_until,
            });
        });
        (blocked.blocked_ip_users || []).forEach(entry => {
            allEntries.push({
                type: 'ip_user', typeLabel: i18n.t('adm.blocked.typeIPUser'), key: entry.key,
                display: `${entry.ip} + ${entry.username}`, remaining: entry.remaining_seconds,
                blockedUntil: entry.blocked_until,
            });
        });

        if (allEntries.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem;color:var(--text-secondary);background:white;border-radius:10px;">
                    <div style="margin-bottom:1rem;">${AdminUI.icon('check-circle', '', 'width:48px;height:48px;stroke:var(--success)')}</div>
                    <p style="font-size:1.05rem;margin-bottom:0.5rem;">${i18n.t('adm.blocked.noBlocks')}</p>
                    <p style="font-size:0.9rem;">${i18n.t('adm.blocked.noBlocksDesc')}</p>
                </div>`;
            return;
        }

        const badgeColors = {
            'user': 'var(--color-warning, #f0ad4e)',
            'ip': 'var(--color-error, #d9534f)',
            'ip_user': 'var(--color-info, #5bc0de)',
        };

        const rows = allEntries.map(entry => {
            const minutes = Math.floor(entry.remaining / 60);
            const seconds = entry.remaining % 60;
            const timeStr = minutes > 0 ? i18n.t('adm.blocked.timeMinSec', {minutes, seconds}) : i18n.t('adm.blocked.timeSec', {seconds});
            const expiryDate = new Date(entry.blockedUntil * 1000).toLocaleString('zh-TW');

            return `<tr>
                <td style="padding:12px;">
                    <span style="background:${badgeColors[entry.type]};color:white;padding:2px 10px;border-radius:12px;font-size:0.85em;white-space:nowrap;">${entry.typeLabel}</span>
                </td>
                <td style="padding:12px;font-family:monospace;word-break:break-all;">${entry.display}</td>
                <td style="padding:12px;white-space:nowrap;">${timeStr}</td>
                <td style="padding:12px;font-size:0.9em;color:var(--text-secondary);white-space:nowrap;">${expiryDate}</td>
                <td style="padding:12px;">
                    <button data-action="unblock" data-type="${entry.type}" data-key="${entry.key}" data-label="${entry.typeLabel}" data-display="${entry.display}"
                        style="padding:4px 14px;background:var(--color-success, #5cb85c);color:white;border:none;border-radius:4px;cursor:pointer;white-space:nowrap;">
                        ${i18n.t('adm.blocked.unlockBtn')}
                    </button>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
            <table style="width:100%;background:white;border-radius:10px;border-collapse:collapse;">
                <thead style="background:var(--light, #f8f9fa);">
                    <tr>
                        <th style="padding:12px;text-align:left;">${i18n.t('adm.blocked.thType')}</th>
                        <th style="padding:12px;text-align:left;">${i18n.t('adm.blocked.thTarget')}</th>
                        <th style="padding:12px;text-align:left;">${i18n.t('adm.blocked.thRemaining')}</th>
                        <th style="padding:12px;text-align:left;">${i18n.t('adm.blocked.thExpiry')}</th>
                        <th style="padding:12px;text-align:left;">${i18n.t('adm.blocked.thAction')}</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
            <p style="margin-top:12px;font-size:0.85em;color:var(--text-secondary);">
                ${i18n.t('adm.blocked.totalActive', {count: allEntries.length})}
            </p>`;

        container.querySelectorAll('[data-action="unblock"]').forEach(btn => {
            btn.addEventListener('click', () => {
                AdminApp.unblockAccount(btn.dataset.type, btn.dataset.key, btn.dataset.label, btn.dataset.display);
            });
        });
    },

    /* ---------- 學生列表渲染 ---------- */
    renderStudentList(students) {
        const studentList = document.getElementById('studentList');

        if (students.length === 0) {
            studentList.innerHTML = '<div class="empty-state"><p>' + i18n.t('adm.student.noStudents') + '</p></div>';
            return;
        }

        studentList.innerHTML = '';
        students.forEach(student => {
            const item = document.createElement('div');
            item.className = 'student-item';
            item.dataset.studentId = student.username;
            const riskLevel = AdminApp.state.studentReports[student.username]?.risk_level || 'unknown';
            item.innerHTML = `
                <div class="student-info">
                    <div class="student-name">${student.display_name || student.username}</div>
                    <div class="student-class">${student.class_name || i18n.t('adm.student.noClass')}</div>
                </div>
                <div class="risk-indicator risk-${riskLevel}" title="${this.getRiskText(riskLevel)}"></div>
            `;
            item.addEventListener('click', () => AdminApp.selectStudent(student));
            studentList.appendChild(item);
        });
    },

    /* ---------- 學生摘要渲染 ---------- */
    displayStudentsSummary(students) {
        const container = document.getElementById('studentsSummaryList');
        if (!container) return;

        if (!students || students.length === 0) {
            container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">' + i18n.t('adm.student.noSummary') + '</div>';
            return;
        }

        let html = '';
        students.forEach(student => {
            const riskColor = ({ low: '#4CAF50', medium: '#FF9800', high: '#F44336', unknown: '#999' })[student.risk_level] || '#999';
            html += `
                <div class="student-summary-card" data-action="viewStudent" data-student-id="${student.student_id}" data-display-name="${student.display_name || ''}">
                    <div class="student-header">
                        <span class="student-name">${student.display_name || student.student_id}</span>
                        <span class="risk-badge" style="background: ${riskColor}">${this.getRiskText(student.risk_level)}</span>
                    </div>
                    <div class="summary-content">${student.overall_summary || '—'}</div>
                    <div class="preview-status">${AdminUI.icon('book', 'icon-sm')} ${i18n.t('adm.student.previewStatus', {status: student.preview_status || '—'})}</div>
                    <div class="summary-footer">
                        <span class="class-info">${i18n.t('adm.student.classLabel', {name: student.class_name || '—'})}</span>
                        <span class="update-time">${i18n.t('adm.student.updateLabel', {time: this.formatDate(student.last_updated)})}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // bind click events on summary cards
        container.querySelectorAll('[data-action="viewStudent"]').forEach(card => {
            card.addEventListener('click', () => {
                AdminApp.viewStudentDetail(card.dataset.studentId, card.dataset.displayName);
            });
        });
    },

    /* ---------- 學生摘要渲染（另一版本） ---------- */
    renderStudentsSummary(students) {
        const container = document.getElementById('studentsSummaryList');
        if (!students || students.length === 0) {
            container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999;">' + i18n.t('adm.student.noData') + '</div>';
            return;
        }

        let html = '';
        students.forEach(student => {
            const riskClass = `risk-${student.risk_level || 'unknown'}`;
            const riskText = this.getRiskText(student.risk_level);

            html += `
                <div class="summary-card ${riskClass}" data-action="viewStudent" data-student-id="${student.student_id}" data-display-name="${student.display_name || ''}">
                    <div class="summary-header">
                        <span class="student-name">${student.display_name || student.student_id}</span>
                        <span class="risk-badge ${riskClass}">${riskText}</span>
                    </div>
                    <div class="ai-evaluation">
                        <div class="ai-evaluation-content">
                            ${this.formatMarkdownText(student.overall_summary || i18n.t('adm.student.noSummaryText'))}
                        </div>
                    </div>
                    <div class="preview-status">${AdminUI.icon('book', 'icon-sm')} ${i18n.t('adm.student.previewStatus', {status: student.preview_status || '—'})}</div>
                    <div class="summary-footer">
                        <span class="class-info">${i18n.t('adm.student.classLabel', {name: student.class_name || '—'})}</span>
                        <span class="update-time">${i18n.t('adm.student.updateLabel', {time: this.formatDate(student.last_updated)})}</span>
                    </div>
                </div>
            `;
        });
        container.innerHTML = html;

        // bind click events
        container.querySelectorAll('[data-action="viewStudent"]').forEach(card => {
            card.addEventListener('click', () => {
                AdminApp.viewStudentDetail(card.dataset.studentId, card.dataset.displayName);
            });
        });
    },

    /* ---------- 詳細報告生成 ---------- */
    generateDetailedReport(student, report, subject) {
        return `
            <div class="report-section">
                <h4 style="color: var(--primary); margin-bottom: 15px;">
                    ${this.icon('books', 'icon-lg', 'stroke:var(--primary)')} ${i18n.t('adm.report.subjectAnalysis', {subject: this.getSubjectName(subject)})}
                </h4>

                <div class="risk-badge risk-${report.risk_level}" style="margin-bottom: 15px;">
                    ${i18n.t('adm.report.riskLevel', {level: this.getRiskText(report.risk_level)})}
                </div>

                <div class="report-section">
                    <h4>${this.icon('books')} ${i18n.t('adm.report.knowledgeMastery')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.knowledge_mastery_report || i18n.t('adm.report.noData'))}</div>
                </div>

                <div class="report-section">
                    <h4>${this.icon('palette')} ${i18n.t('adm.report.learningStyle')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.learning_style_report || i18n.t('adm.report.noData'))}</div>
                </div>

                <div class="report-section">
                    <h4>${this.icon('warning')} ${i18n.t('adm.report.difficulty')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.difficulty_report || i18n.t('adm.report.noData'))}</div>
                </div>

                <div class="report-section">
                    <h4>${this.icon('chat-bubble')} ${i18n.t('adm.report.emotion')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.emotion_report || i18n.t('adm.report.noData'))}</div>
                </div>

                <div class="report-section">
                    <h4>${this.icon('trending-up')} ${i18n.t('adm.report.progress')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.progress_report || i18n.t('adm.report.noData'))}</div>
                </div>

                <div class="report-section">
                    <h4>${this.icon('lightbulb')} ${i18n.t('adm.report.suggestion')}</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.suggestion_report || i18n.t('adm.report.noData'))}</div>
                </div>

                ${report.teacher_attention_points ? `
                <div class="teacher-attention">
                    <h5>${this.icon('warning', 'icon-sm', 'stroke:var(--color-warning)')} ${i18n.t('adm.report.teacherAttention')}</h5>
                    <div class="formatted-text">${this.formatReportText(report.teacher_attention_points)}</div>
                </div>
                ` : ''}
            </div>
        `;
    },

    /* ---------- 完整學生報告渲染 ---------- */
    displayStudentReport(student, report) {
        const content = document.getElementById('analysisContent');
        const riskLevelText = this.getRiskText(report.risk_level);
        const riskClass = `risk-${report.risk_level}`;

        content.innerHTML = `
            <div class="analysis-header">
                <h3>${i18n.t('adm.report.title', {name: student.display_name || student.username})}</h3>
                <div class="analysis-meta">
                    <span>${this.icon('graduation', 'icon-sm')} ${i18n.t('adm.report.classLabel', {name: student.class_name || i18n.t('adm.student.noClass')})}</span>
                    <span>${this.icon('calendar', 'icon-sm')} ${i18n.t('adm.report.analysisDate', {date: new Date(report.analysis_date).toLocaleDateString('zh-CN')})}</span>
                </div>
            </div>

            <div class="risk-assessment-card">
                <h4>${this.icon('warning')} ${i18n.t('adm.report.riskAssessment')}</h4>
                <div class="risk-level-display ${riskClass}">
                    <span class="risk-badge">${riskLevelText}</span>
                    <div class="risk-description">${this.getRiskDescription(report.risk_level)}</div>
                </div>
            </div>

            <div class="ai-assessment">
                <h4>${this.icon('target', 'icon-white')} ${i18n.t('adm.report.overallAssessment')}</h4>
                <div class="formatted-content">${this.formatMarkdownText(report.overall_assessment || i18n.t('adm.report.noAssessment'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('books')} ${i18n.t('adm.report.knowledgeMastery')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.knowledge_mastery_report || i18n.t('adm.report.noData'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('palette')} ${i18n.t('adm.report.learningStyle')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.learning_style_report || i18n.t('adm.report.noData'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('wrench')} ${i18n.t('adm.report.difficultyChallenge')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.difficulty_report || i18n.t('adm.report.noData'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('chat-bubble')} ${i18n.t('adm.report.emotionStatus')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.emotion_report || i18n.t('adm.report.noData'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('lightbulb')} ${i18n.t('adm.report.improveSuggestion')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.suggestion_report || i18n.t('adm.report.noData'))}</div>
            </div>

            <div class="report-section">
                <h4>${this.icon('trending-up')} ${i18n.t('adm.report.progressStatus')}</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.progress_report || i18n.t('adm.report.noData'))}</div>
            </div>

            ${report.teacher_attention_points ? `
            <div class="teacher-attention">
                <h5>${this.icon('warning', 'icon-sm', 'stroke:var(--color-warning)')} ${i18n.t('adm.report.teacherAttention')}</h5>
                <div class="formatted-text">${this.formatMarkdownText(report.teacher_attention_points)}</div>
            </div>
            ` : ''}
        `;
    },

    /* ---------- 範本列表渲染 ---------- */
    renderTemplatesList(filterType) {
        const container = document.getElementById('noticeTemplatesList');
        if (!container) return;
        const data = AdminApp.state.noticeTemplatesData;
        let templatesToShow = {};
        if (filterType === 'all') {
            templatesToShow = data;
        } else if (data[filterType]) {
            templatesToShow[filterType] = data[filterType];
        }
        const totalCount = Object.values(templatesToShow).reduce((sum, arr) => sum + (arr ? arr.length : 0), 0);
        if (totalCount === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <div style="margin-bottom: 1rem;">${this.icon('inbox', '', 'width:48px;height:48px;stroke:var(--text-secondary)')}</div>
                    <p>${i18n.t('adm.tpl.noTemplates', {type: filterType === 'all' ? '' : this.getTemplateTypeName(filterType)})}</p>
                </div>`;
            return;
        }
        let html = '';
        for (const [type, templates] of Object.entries(templatesToShow)) {
            html += `
                <div style="margin-bottom: 2rem;">
                    <h5 style="color: var(--primary); margin-bottom: 1rem; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                        ${this.getTemplateTypeIcon(type)} ${this.getTemplateTypeName(type)}
                    </h5>
                    <div style="display: grid; gap: 1rem;">`;
            (templates || []).forEach(template => {
                const uploadTime = template.upload_time ? new Date(template.upload_time).toLocaleString('zh-CN') : '';
                html += `
                    <div style="padding: 1.5rem; background: var(--bg); border-radius: 10px; border-left: 4px solid ${this.getTemplateTypeColor(type)};">
                        <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 0.5rem;">
                            <div>
                                <strong style="font-size: 1.1rem; color: var(--text);">${template.filename || ''}</strong>
                                ${template.description ? `<span style="color: var(--text-secondary); margin-left: 1rem;">${template.description}</span>` : ''}
                            </div>
                            <button data-action="deleteTemplate" data-type="${type}" data-filename="${(template.filename || '').replace(/'/g, "\\'")}"
                                    style="padding: 6px 12px; background: var(--danger); color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85rem;">
                                ${i18n.t('adm.tpl.deleteBtn')}
                            </button>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem;">${AdminUI.icon('calendar', 'icon-sm')} ${i18n.t('adm.tpl.uploadTime', {time: uploadTime})}</div>
                        <div style="color: var(--text); font-size: 0.9rem; line-height: 1.6; padding: 1rem; background: white; border-radius: 6px; border: 1px solid var(--border);">
                            <strong>${i18n.t('adm.tpl.contentPreview')}</strong><br>${template.content_preview || ''}
                        </div>
                    </div>`;
            });
            html += '</div></div>';
        }
        container.innerHTML = html;

        // bind delete template buttons
        container.querySelectorAll('[data-action="deleteTemplate"]').forEach(btn => {
            btn.addEventListener('click', () => {
                AdminApp.deleteTemplate(btn.dataset.type, btn.dataset.filename);
            });
        });
    },

    /* ---------- 應用管理渲染 ---------- */

    // 分類配置
    get _categoryLabels() { return { learning: i18n.t('adm.app.catLearning'), community: i18n.t('adm.app.catCommunity'), teaching: i18n.t('adm.app.catTeaching'), admin: i18n.t('adm.app.catAdmin'), other: i18n.t('adm.app.catOther') }; },

    renderAppsConfig() {
        const container = document.getElementById('appmgrList');
        if (!container) return;
        const apps = AdminApp.state.appsConfig;
        const roleLabels = { student: i18n.t('adm.app.roleStudent'), teacher: i18n.t('adm.app.roleTeacher'), admin: i18n.t('adm.app.roleAdmin') };
        const catLabels = this._categoryLabels;

        // 按 category 分組渲染
        const groups = {};
        apps.forEach((app, index) => {
            const cat = app.category || 'other';
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push({ app, index });
        });

        const catOrder = ['learning', 'community', 'teaching', 'admin', 'other'];
        const sortedCats = Object.keys(groups).sort((a, b) =>
            (catOrder.indexOf(a) === -1 ? 99 : catOrder.indexOf(a)) -
            (catOrder.indexOf(b) === -1 ? 99 : catOrder.indexOf(b))
        );

        container.innerHTML = sortedCats.map(cat => {
            const items = groups[cat];
            return `
            <div style="margin-bottom:20px;">
                <div style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px;padding-left:4px;text-transform:uppercase;letter-spacing:0.02em;">
                    ${catLabels[cat] || cat}
                    <span style="font-size:11px;color:var(--text-tertiary);font-weight:500;margin-left:6px;">${items.length}</span>
                </div>
                ${items.map(({ app, index }) => {
                    const rolesHtml = ['student', 'teacher', 'admin'].map(role => {
                        const checked = (app.roles || []).includes(role) ? 'checked' : '';
                        return `<label style="display:inline-flex;align-items:center;gap:4px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" data-index="${index}" data-role="${role}" ${checked}
                                   style="accent-color:var(--primary);">
                            ${roleLabels[role]}
                        </label>`;
                    }).join(' ');

                    const catSelectHtml = Object.entries(catLabels).map(([val, label]) =>
                        `<option value="${val}" ${(app.category || 'other') === val ? 'selected' : ''}>${label}</option>`
                    ).join('');

                    return `
                    <div style="background:white;border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px;margin-bottom:8px;${app.enabled ? '' : 'opacity:0.5;'}">
                        <span style="font-size:28px;flex-shrink:0;">${app.icon || AdminUI.icon('box', 'icon-xl')}</span>
                        <div style="flex:1;min-width:0;">
                            <div style="font-weight:600;font-size:15px;color:var(--text-primary);">${app.name}</div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${app.description || ''}</div>
                            <div style="margin-top:6px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;">
                                ${rolesHtml}
                                <select data-action="changeCategory" data-index="${index}"
                                        style="font-size:12px;padding:2px 6px;border:1px solid var(--border);border-radius:6px;background:white;color:var(--text-secondary);cursor:pointer;">
                                    ${catSelectHtml}
                                </select>
                            </div>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                            <div style="display:flex;flex-direction:column;gap:4px;">
                                <button data-action="moveApp" data-index="${index}" data-dir="-1" style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px;" title="${i18n.t('adm.app.moveUp')}" ${index === 0 ? 'disabled' : ''}>▲</button>
                                <button data-action="moveApp" data-index="${index}" data-dir="1" style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px;" title="${i18n.t('adm.app.moveDown')}" ${index === apps.length - 1 ? 'disabled' : ''}>▼</button>
                            </div>
                            <label style="position:relative;display:inline-block;width:44px;height:24px;cursor:pointer;">
                                <input type="checkbox" data-action="toggleEnabled" data-index="${index}" ${app.enabled ? 'checked' : ''}
                                       style="opacity:0;width:0;height:0;">
                                <span style="position:absolute;inset:0;background:${app.enabled ? 'var(--primary)' : '#ccc'};border-radius:12px;transition:.3s;">
                                    <span style="position:absolute;top:2px;left:${app.enabled ? '22px' : '2px'};width:20px;height:20px;background:white;border-radius:50%;transition:.3s;box-shadow:0 1px 3px rgba(0,0,0,0.2);"></span>
                                </span>
                            </label>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        }).join('');

        // bind events
        container.querySelectorAll('[data-action="moveApp"]').forEach(btn => {
            btn.addEventListener('click', () => {
                AdminApp.moveApp(parseInt(btn.dataset.index), parseInt(btn.dataset.dir));
            });
        });
        container.querySelectorAll('[data-action="toggleEnabled"]').forEach(chk => {
            chk.addEventListener('change', () => {
                AdminApp.toggleAppEnabled(parseInt(chk.dataset.index), chk.checked);
            });
        });
        container.querySelectorAll('input[data-role]').forEach(chk => {
            chk.addEventListener('change', () => {
                AdminApp.toggleAppRole(parseInt(chk.dataset.index), chk.dataset.role, chk.checked);
            });
        });
        container.querySelectorAll('[data-action="changeCategory"]').forEach(sel => {
            sel.addEventListener('change', () => {
                AdminApp.changeAppCategory(parseInt(sel.dataset.index), sel.value);
            });
        });
    }
};


/* ============================================================
   APP — 主控制器
   ============================================================ */

const AdminApp = {

    /* ---------- 狀態 ---------- */
    state: {
        currentStudent: null,
        currentSubject: 'ict',
        allStudents: [],
        studentReports: {},
        subjects: {},
        allUsers: [],
        userToDelete: null,
        // 通告
        noticeSessionId: null,
        noticeCanExport: false,
        // 提示詞
        currentPromptSubject: null,
        get promptTemplates() {
            return {
                basic: i18n.t('adm.promptTpl.basic'),
                interactive: i18n.t('adm.promptTpl.interactive'),
                exam: i18n.t('adm.promptTpl.exam'),
                creative: i18n.t('adm.promptTpl.creative')
            };
        },
        // 知識庫
        currentDocuments: [],
        // 範本
        noticeTemplatesData: {},
        currentTemplateFilter: 'all',
        // 批量添加
        currentBatchTab: 'excel',
        selectedExcelFile: null,
        // 應用管理
        appsConfig: [],
        // 封禁管理
        blockedRefreshTimer: null,
        // AI 監控
        aiMonitorTimer: null,
        aiMonitorReqSeq: 0,
        aiMonitorLastData: null,
        aiMonitorFetching: false,
        // Tab 緩存：已載入過的 tab 不重複請求
        _tabLoaded: {}
    },

    /* ---------- 初始化 ---------- */
    init() {
        // 並行載入初始數據（不互相依賴）
        Promise.all([
            this.loadAdminInfo(),
            this.loadSubjects(),
            this.loadStatistics(),
        ]).catch(e => console.error('Init load error:', e));
        // StudentsSummary 較慢，延遲到切 tab 時再載入
        if (window.location.hash === '#knowledge') {
            this.loadNoticeTemplates();
        }
        setTimeout(() => this.initDragDropUpload(), 200);
        setTimeout(() => this.enhanceNoticeChat(), 200);
        this._bindEvents();
    },

    /* ---------- 事件綁定 ---------- */
    _bindEvents() {
        // Sidebar navigation
        const sidebarNav = document.querySelector('.admin-sidebar__nav');
        if (sidebarNav) {
            sidebarNav.addEventListener('click', (e) => {
                const item = e.target.closest('.admin-sidebar__item');
                if (!item) return;
                this.switchTab(item.dataset.tab, e);
            });
        }

        // Back to main
        document.querySelectorAll('[data-action="backToMain"]').forEach(btn => {
            btn.addEventListener('click', () => this.backToMain());
        });

        // Add subject modal
        const addSubjectBtn = document.querySelector('[data-action="showAddSubjectModal"]');
        if (addSubjectBtn) addSubjectBtn.addEventListener('click', () => this.showAddSubjectModal());

        // Add subject form
        const addSubjectForm = document.getElementById('addSubjectForm');
        if (addSubjectForm) {
            addSubjectForm.addEventListener('submit', (e) => this._handleAddSubjectSubmit(e));
        }

        // Edit subject form
        const editSubjectForm = document.getElementById('editSubjectForm');
        if (editSubjectForm) {
            editSubjectForm.addEventListener('submit', (e) => this._handleEditSubjectSubmit(e));
        }

        // Close modals
        document.querySelectorAll('[data-action="closeAddSubjectModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeAddSubjectModal());
        });
        document.querySelectorAll('[data-action="closeEditSubjectModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeEditSubjectModal());
        });

        // Knowledge tab - upload
        const docUploadBtn = document.querySelector('[data-action="triggerDocUpload"]');
        if (docUploadBtn) {
            docUploadBtn.addEventListener('click', () => {
                document.getElementById('documentUpload').click();
            });
        }

        const docUploadInput = document.getElementById('documentUpload');
        if (docUploadInput) {
            docUploadInput.addEventListener('change', () => this.uploadDocuments(docUploadInput));
        }

        const refreshDocsBtn = document.querySelector('[data-action="refreshDocuments"]');
        if (refreshDocsBtn) refreshDocsBtn.addEventListener('click', () => this.refreshDocuments());

        // Prompt templates
        document.querySelectorAll('[data-action="applyTemplate"]').forEach(btn => {
            btn.addEventListener('click', () => this.applyPromptTemplate(btn.dataset.template));
        });

        const promptContent = document.getElementById('promptContent');
        if (promptContent) promptContent.addEventListener('input', () => this.updateCharCount());

        document.querySelectorAll('[data-action="formatPrompt"]').forEach(btn => {
            btn.addEventListener('click', () => this.formatPrompt());
        });
        document.querySelectorAll('[data-action="previewPrompt"]').forEach(btn => {
            btn.addEventListener('click', () => this.previewPrompt());
        });
        document.querySelectorAll('[data-action="resetPrompt"]').forEach(btn => {
            btn.addEventListener('click', () => this.resetPrompt());
        });
        document.querySelectorAll('[data-action="savePrompt"]').forEach(btn => {
            btn.addEventListener('click', () => this.savePrompt());
        });

        // Analysis
        document.querySelectorAll('[data-action="refreshAnalysis"]').forEach(btn => {
            btn.addEventListener('click', () => this.refreshAnalysis());
        });
        document.querySelectorAll('[data-action="exportAnalysis"]').forEach(btn => {
            btn.addEventListener('click', () => this.exportAnalysis());
        });
        document.querySelectorAll('[data-action="loadStudentsSummary"]').forEach(btn => {
            btn.addEventListener('click', () => this.loadStudentsSummary());
        });
        document.querySelectorAll('[data-action="forceRefreshRisk"]').forEach(btn => {
            btn.addEventListener('click', () => this.forceRefreshRisk());
        });

        // Blocked accounts
        document.querySelectorAll('[data-action="refreshBlocked"]').forEach(btn => {
            btn.addEventListener('click', () => this.loadBlockedAccounts());
        });
        document.querySelectorAll('[data-action="refreshSyslogs"]').forEach(btn => {
            btn.addEventListener('click', () => this.loadSystemLogs());
        });

        // Filters
        const classFilter = document.getElementById('classFilter');
        if (classFilter) {
            // Class change → load that class from cache (the new flow)
            classFilter.addEventListener('change', (e) => {
                const cls = e.target.value;
                if (cls) {
                    this.loadClassStudents(cls);
                } else {
                    document.getElementById('studentList').innerHTML =
                        '<div class="empty-state"><p>' + i18n.t('adm.analysis.pickClassFirst') + '</p></div>';
                    this.state.allStudents = [];
                    this.updateStudentStats([]);
                }
            });
        }
        const subjectFilter = document.getElementById('subjectFilter');
        if (subjectFilter) subjectFilter.addEventListener('change', () => this.filterStudents());
        const studentSearch = document.getElementById('studentSearch');
        if (studentSearch) studentSearch.addEventListener('keyup', () => this.filterStudents());

        // User management
        document.querySelectorAll('[data-action="showAddUserModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.showAddUserModal());
        });
        document.querySelectorAll('[data-action="showBatchAddModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.showBatchAddModal());
        });

        const userRoleFilter = document.getElementById('userRoleFilter');
        if (userRoleFilter) userRoleFilter.addEventListener('change', () => this.filterUsers());
        const userClassFilter = document.getElementById('userClassFilter');
        if (userClassFilter) userClassFilter.addEventListener('change', () => this.filterUsers());
        const userSearchInput = document.getElementById('userSearchInput');
        if (userSearchInput) {
            let _searchTimer = null;
            userSearchInput.addEventListener('keyup', () => {
                clearTimeout(_searchTimer);
                _searchTimer = setTimeout(() => this.filterUsers(), 250);
            });
        }

        // User form
        const userForm = document.getElementById('userForm');
        if (userForm) userForm.addEventListener('submit', (e) => this._handleUserFormSubmit(e));

        document.querySelectorAll('[data-action="closeUserModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeUserModal());
        });
        document.querySelectorAll('[data-action="closeDeleteConfirm"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeDeleteConfirm());
        });
        document.querySelectorAll('[data-action="confirmDelete"]').forEach(btn => {
            btn.addEventListener('click', () => this.confirmDelete());
        });

        // Batch add
        document.querySelectorAll('[data-action="switchBatchTab"]').forEach(btn => {
            btn.addEventListener('click', () => this.switchBatchTab(btn.dataset.tab));
        });
        document.querySelectorAll('[data-action="closeBatchAddModal"]').forEach(btn => {
            btn.addEventListener('click', () => this.closeBatchAddModal());
        });
        document.querySelectorAll('[data-action="processBatchAdd"]').forEach(btn => {
            btn.addEventListener('click', () => this.processBatchAddNew());
        });
        document.querySelectorAll('[data-action="downloadTemplate"]').forEach(btn => {
            btn.addEventListener('click', () => this.downloadTemplate());
        });

        const excelFileInput = document.getElementById('excelFileInput');
        if (excelFileInput) excelFileInput.addEventListener('change', (e) => this.handleExcelSelect(e));

        document.querySelectorAll('[data-action="triggerExcelPicker"]').forEach(btn => {
            btn.addEventListener('click', () => document.getElementById('excelFileInput').click());
        });
        document.querySelectorAll('[data-action="clearSelectedFile"]').forEach(btn => {
            btn.addEventListener('click', () => this.clearSelectedFile());
        });

        // Notice chat
        const noticeChatInput = document.getElementById('noticeChatInput');
        if (noticeChatInput) {
            noticeChatInput.addEventListener('keypress', (e) => this.handleNoticeKeyPress(e));
        }
        document.querySelectorAll('[data-action="sendNoticeMessage"]').forEach(btn => {
            btn.addEventListener('click', () => this.sendNoticeMessage());
        });
        document.querySelectorAll('[data-action="exportNotice"]').forEach(btn => {
            btn.addEventListener('click', () => this.exportNotice());
        });

        // Notice templates
        const noticeTemplateFile = document.getElementById('noticeTemplateFile');
        if (noticeTemplateFile) {
            noticeTemplateFile.addEventListener('change', () => this.previewTemplateFile(noticeTemplateFile));
        }
        document.querySelectorAll('[data-action="clearTemplateForm"]').forEach(btn => {
            btn.addEventListener('click', () => this.clearTemplateForm());
        });
        document.querySelectorAll('[data-action="uploadNoticeTemplate"]').forEach(btn => {
            btn.addEventListener('click', () => this.uploadNoticeTemplate());
        });

        // Template filter buttons
        document.querySelectorAll('[data-action="filterTemplates"]').forEach(btn => {
            btn.addEventListener('click', () => this.filterTemplates(btn.dataset.type, btn));
        });

        // Apps management
        document.querySelectorAll('[data-action="resetAppsToDefault"]').forEach(btn => {
            btn.addEventListener('click', () => this.resetAppsToDefault());
        });
        document.querySelectorAll('[data-action="saveAppsConfig"]').forEach(btn => {
            btn.addEventListener('click', () => this.saveAppsConfig());
        });

        // 課室日誌管理按鈕
        document.querySelectorAll('[data-action="addClass"]').forEach(btn => {
            btn.addEventListener('click', () => this.addClass());
        });
        document.querySelectorAll('[data-action="batchDownloadQR"]').forEach(btn => {
            btn.addEventListener('click', () => this.batchDownloadQR());
        });
        document.querySelectorAll('[data-action="addReviewer"]').forEach(btn => {
            btn.addEventListener('click', () => this.addReviewer());
        });
        document.querySelectorAll('[data-action="addReportRecipient"]').forEach(btn => {
            btn.addEventListener('click', () => this.addReportRecipient());
        });
        document.querySelectorAll('[data-action="manualGenerateReport"]').forEach(btn => {
            btn.addEventListener('click', () => this.manualGenerateReport());
        });

        // (knowledge tab auto-load is handled in switchTab)
    },

    /* ---------- 管理員/教師信息 ---------- */
    loadAdminInfo() {
        const adminName = localStorage.getItem('admin_name') || i18n.t('adm.info.defaultName');
        const role = (typeof AuthModule !== 'undefined' && AuthModule.getUserRole)
            ? AuthModule.getUserRole() : (localStorage.getItem('user_role') || 'admin');

        document.getElementById('adminName').textContent = adminName;
        document.getElementById('adminAvatar').textContent = adminName[0].toUpperCase();

        // 角色徽章
        const badge = document.getElementById('roleBadge');
        if (badge) {
            if (role === 'admin') {
                badge.textContent = i18n.t('adm.info.badgeAdmin');
                badge.className = 'role-badge role-admin';
            } else {
                badge.textContent = i18n.t('adm.info.badgeTeacher');
                badge.className = 'role-badge role-teacher';
            }
        }

        // 教師：隱藏管理員專屬標籤
        if (role !== 'admin') {
            document.querySelectorAll('.admin-sidebar .admin-only').forEach(el => {
                el.style.display = 'none';
            });
            // 同時隱藏對應的 tab-pane
            ['users', 'settings', 'notice', 'appmgr', 'classdiary', 'blocked', 'aimonitor', 'syslogs'].forEach(tab => {
                const pane = document.getElementById(tab + '-tab');
                if (pane) pane.style.display = 'none';
            });
        }
    },

    /* ---------- 切換標籤頁 ---------- */
    switchTab(tabName, ev) {
        // 離開封禁管理 tab 時停止自動刷新
        if (this.state.blockedRefreshTimer) {
            clearInterval(this.state.blockedRefreshTimer);
            this.state.blockedRefreshTimer = null;
        }
        // 離開 AI 監控 tab 時停止輪詢
        if (this.state.aiMonitorTimer) {
            clearInterval(this.state.aiMonitorTimer);
            this.state.aiMonitorTimer = null;
        }
        // 離開系統日誌 tab 時停止自動刷新
        if (this.state.syslogsRefreshTimer) {
            clearInterval(this.state.syslogsRefreshTimer);
            this.state.syslogsRefreshTimer = null;
        }

        document.querySelectorAll('.admin-sidebar__item').forEach(
            el => el.classList.remove('admin-sidebar__item--active')
        );
        const clickedItem = ev?.target?.closest('.admin-sidebar__item');
        if (clickedItem) {
            clickedItem.classList.add('admin-sidebar__item--active');
        } else {
            const match = document.querySelector(`.admin-sidebar__item[data-tab="${tabName}"]`);
            if (match) match.classList.add('admin-sidebar__item--active');
        }

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // 需要每次刷新的 tab（實時數據）
        const alwaysRefresh = ['aimonitor', 'syslogs', 'blocked'];
        const cached = this.state._tabLoaded[tabName] && !alwaysRefresh.includes(tabName);

        if (!cached) {
            if (tabName === 'analysis') {
                this.loadStudentAnalysis();
                this.loadStudentsSummary();
            } else if (tabName === 'knowledge') {
                this.loadKnowledgeTab();
                setTimeout(() => this.initDragDropUpload(), 120);
                setTimeout(() => this.enhanceNoticeChat(), 120);
            } else if (tabName === 'prompts') {
                this.loadPromptsTab();
            } else if (tabName === 'users') {
                this.loadUsers();
            } else if (tabName === 'notice') {
                if (!this.state.noticeSessionId) {
                    this.initNoticeGenerator();
                }
            } else if (tabName === 'appmgr') {
                this.loadAppsConfig();
            } else if (tabName === 'classdiary') {
                this.loadClassDiaryTab();
            } else if (tabName === 'blocked') {
                this.loadBlockedAccounts();
            } else if (tabName === 'aimonitor') {
                this.startAiMonitor();
                loadAiUsageStats();
            } else if (tabName === 'settings') {
                loadCloudStatus();
            } else if (tabName === 'syslogs') {
                this.loadSystemLogs();
            }
            this.state._tabLoaded[tabName] = true;
        } else if (tabName === 'aimonitor') {
            // AI 監控需要重啟輪詢
            this.startAiMonitor();
        }
    },

    /* ---------- 返回主系統 ---------- */
    backToMain() {
        window.location.href = '/';
    },

    /* ---------- 系統日誌 ---------- */
    async loadSystemLogs() {
        // 停止舊的自動刷新
        if (this.state.syslogsRefreshTimer) {
            clearInterval(this.state.syslogsRefreshTimer);
            this.state.syslogsRefreshTimer = null;
        }

        const doLoad = async () => {
            try {
                const params = {
                    log_type: document.getElementById('syslogsType')?.value || 'app_file',
                    limit: document.getElementById('syslogsLimit')?.value || '100',
                    search: document.getElementById('syslogsSearch')?.value || '',
                    level: document.getElementById('syslogsLevel')?.value || '',
                };
                const data = await AdminAPI.fetchSystemLogs(params);
                AdminUI.renderSystemLogs(data);
            } catch (e) {
                console.error('載入系統日誌失敗:', e);
                const c = document.getElementById('syslogsContainer');
                if (c) c.innerHTML = `<p style="color:#DC2626;text-align:center;padding:2rem;">${i18n.t('adm.syslogs.loadFailedPrefix')}${e.message}</p>`;
            }
        };

        await doLoad();

        // 綁定篩選變更事件（只綁定一次）
        if (!this.state._syslogsEventsSet) {
            this.state._syslogsEventsSet = true;
            for (const id of ['syslogsType', 'syslogsLevel', 'syslogsLimit']) {
                document.getElementById(id)?.addEventListener('change', () => doLoad());
            }
            // 搜尋框 debounce
            let searchTimer;
            document.getElementById('syslogsSearch')?.addEventListener('input', () => {
                clearTimeout(searchTimer);
                searchTimer = setTimeout(() => doLoad(), 300);
            });
            // 自動刷新 checkbox
            document.getElementById('syslogsAutoRefresh')?.addEventListener('change', (e) => {
                if (e.target.checked) {
                    this.state.syslogsRefreshTimer = setInterval(() => doLoad(), 10000);
                } else if (this.state.syslogsRefreshTimer) {
                    clearInterval(this.state.syslogsRefreshTimer);
                    this.state.syslogsRefreshTimer = null;
                }
            });
        }
    },

    /* ---------- 封禁管理 ---------- */
    async loadBlockedAccounts() {
        try {
            const data = await AdminAPI.fetchBlockedAccounts();
            AdminUI.renderBlockedAccounts(data);

            // 啟動 10 秒自動刷新（先清除舊的，避免重複）
            if (this.state.blockedRefreshTimer) {
                clearInterval(this.state.blockedRefreshTimer);
            }
            this.state.blockedRefreshTimer = setInterval(async () => {
                try {
                    const refreshData = await AdminAPI.fetchBlockedAccounts();
                    AdminUI.renderBlockedAccounts(refreshData);
                } catch (e) {
                    console.error('自動刷新封鎖列表失敗:', e);
                }
            }, 10000);
        } catch (error) {
            console.error('載入封鎖列表失敗:', error);
            const container = document.getElementById('blockedAccountsContainer');
            if (container) {
                container.innerHTML = `<p style="color:var(--color-error);">${i18n.t('adm.syslogs.loadBlockedFailed', {msg: error.message})}</p>`;
            }
        }
    },

    async unblockAccount(blockType, key, typeLabel, display) {
        const msg = i18n.t('adm.unblock.confirmMsg', {typeLabel: typeLabel || blockType, display: display || key});
        if (!confirm(msg)) return;
        try {
            await AdminAPI.unblockAccount(blockType, key);
            alert(i18n.t('adm.unblock.success'));
            this.loadBlockedAccounts();
        } catch (error) {
            alert(i18n.t('adm.unblock.failed', {msg: error.message}));
        }
    },

    /* ---------- 載入學科 ---------- */
    async loadSubjects() {
        try {
            const data = await AdminAPI.fetchSubjects();
            this.state.subjects = data.subjects || {};
            this.updateSubjectSelectors();
            AdminUI.renderSubjects();
        } catch (error) {
            console.error('載入學科失敗:', error);
        }
    },

    updateSubjectSelectors() {
        const subjectFilter = document.getElementById('subjectFilter');
        if (!subjectFilter) return;
        subjectFilter.innerHTML = `<option value="">${i18n.t('adm.filter.allSubjects')}</option>`;
        for (const [code, subject] of Object.entries(this.state.subjects)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${subject.name || code}`;
            subjectFilter.appendChild(option);
        }
    },

    /* ---------- 統計 ---------- */
    async loadStatistics() {
        try {
            const stats = await AdminAPI.fetchStatistics();
            document.getElementById('totalDocuments').textContent = stats.total_documents || 0;
            document.getElementById('totalStudents').textContent = stats.total_students || 0;
            document.getElementById('totalConversations').textContent = stats.total_conversations || 0;
        } catch (error) {
            console.error('載入統計失敗:', error);
        }
    },

    /* ---------- 學科增刪改 ---------- */
    showAddSubjectModal() {
        document.getElementById('addSubjectModal').style.display = 'flex';
        document.getElementById('subjectCode').focus();
    },

    closeAddSubjectModal() {
        document.getElementById('addSubjectModal').style.display = 'none';
        document.getElementById('addSubjectForm').reset();
    },

    async _handleAddSubjectSubmit(e) {
        e.preventDefault();
        const subjectData = {
            code: document.getElementById('subjectCode').value.trim(),
            name: document.getElementById('subjectName').value.trim(),
            icon: document.getElementById('subjectIcon').value.trim() || '',
            description: document.getElementById('subjectDescription').value.trim()
        };
        try {
            await AdminAPI.createSubject(subjectData);
            alert(i18n.t('adm.subject.addSuccess'));
            this.closeAddSubjectModal();
            this.loadSubjects();
        } catch (error) {
            alert(i18n.t('adm.subject.addFailedPrefix') + error.message);
        }
    },

    showEditSubjectModal(code) {
        const subj = this.state.subjects[code] || {};
        const name = subj.name || code;
        const icon = subj.icon || subj?.config?.icon || '';
        const description = subj?.config?.description || '';

        document.getElementById('editSubjectCode').value = code;
        document.getElementById('editSubjectCodeDisplay').value = code;
        document.getElementById('editSubjectName').value = name;
        document.getElementById('editSubjectIcon').value = icon;
        document.getElementById('editSubjectDescription').value = description;
        document.getElementById('editSubjectModal').style.display = 'flex';
    },

    closeEditSubjectModal() {
        const modal = document.getElementById('editSubjectModal');
        if (modal) modal.style.display = 'none';
        const form = document.getElementById('editSubjectForm');
        if (form) form.reset();
    },

    async _handleEditSubjectSubmit(e) {
        e.preventDefault();
        const code = document.getElementById('editSubjectCode').value;
        const subjectData = {
            subject_name: document.getElementById('editSubjectName').value,
            icon: document.getElementById('editSubjectIcon').value || '',
            description: document.getElementById('editSubjectDescription').value
        };
        try {
            await AdminAPI.updateSubject(code, subjectData);
            alert(i18n.t('adm.subject.updateSuccess'));
            this.closeEditSubjectModal();
            await this.loadSubjects();
        } catch (error) {
            console.error('更新學科失敗:', error);
            alert(i18n.t('adm.subject.updateFailedPrefix') + error.message);
        }
    },

    async deleteSubject(code) {
        const subject = this.state.subjects[code];
        if (!subject) return;
        const confirmMsg = i18n.t('adm.subject.deleteConfirm', {name: subject.name, code});
        if (!confirm(confirmMsg)) return;
        try {
            await AdminAPI.deleteSubject(code);
            alert(i18n.t('adm.subject.deleteSuccess'));
            await this.loadSubjects();
            await this.loadStatistics();
        } catch (error) {
            console.error('刪除學科失敗:', error);
            alert(i18n.t('adm.subject.deleteFailedPrefix') + error.message);
        }
    },

    /* ---------- 知識庫 ---------- */
    loadKnowledgeTab() {
        this.loadKnowledgeSubjects();
        this.loadKnowledgeStats();
    },

    async loadKnowledgeSubjects() {
        const select = document.getElementById('knowledgeSubjectSelect');
        if (!select) return;
        select.innerHTML = `<option value="">${i18n.t('adm.filter.selectSubject')}</option>`;
        for (const [code, subject] of Object.entries(this.state.subjects)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${subject.name || code}`;
            select.appendChild(option);
        }
        select.onchange = () => this.loadDocuments(select.value);
    },

    async loadKnowledgeStats() {
        try {
            const stats = await AdminAPI.fetchKnowledgeStats();
            document.getElementById('totalDocsCount').textContent = stats.total_docs;
            document.getElementById('totalSizeCount').textContent = stats.total_size_mb + ' MB';
            document.getElementById('subjectsWithDocs').textContent = stats.subjects_with_docs;
        } catch (error) {
            console.error('載入統計資訊失敗:', error);
        }
    },

    refreshDocuments() {
        const subject = document.getElementById('knowledgeSubjectSelect').value;
        if (subject) this.loadDocuments(subject);
        this.loadKnowledgeStats();
    },

    async loadDocuments(subject) {
        if (!subject) {
            document.getElementById('documentsList').innerHTML = `
                <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                    <div style="margin-bottom: 1rem;">${AdminUI.icon('folder', '', 'width:48px;height:48px;stroke:var(--text-secondary)')}</div>
                    <p>${i18n.t('adm.kb.selectSubjectHint')}</p>
                </div>
            `;
            return;
        }
        try {
            const data = await AdminAPI.fetchDocuments(subject);
            AdminUI.renderDocuments(data.documents, subject);
        } catch (error) {
            console.error('載入文檔出错:', error);
            document.getElementById('documentsList').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--danger);"><p>' + i18n.t('adm.kb.loadFailed') + '</p></div>';
        }
    },

    async uploadDocuments(input) {
        const files = input.files;
        const subject = document.getElementById('knowledgeSubjectSelect').value;
        if (!subject) { alert(i18n.t('adm.kb.selectSubjectFirst')); input.value = ''; return; }
        if (files.length === 0) return;

        const container = document.getElementById('documentsList');
        container.innerHTML = '<div style="text-align: center; padding: 2rem;"><div class="spinner"></div><p>' + i18n.t('adm.kb.uploading') + '</p></div>';

        let successCount = 0;
        let failCount = 0;
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('subject', subject);
            try {
                const response = await AdminAPI.uploadDocument(formData);
                if (response.ok) { successCount++; } else { failCount++; }
            } catch (error) { failCount++; }
        }

        if (successCount > 0) {
            alert(i18n.t('adm.kb.uploadComplete', {success: successCount, fail: failCount}));
            await this.loadSubjects();
            await this.loadDocuments(subject);
            await this.loadKnowledgeStats();
            await this.loadStatistics();
        } else {
            alert(i18n.t('adm.kb.allUploadFailed'));
        }
        input.value = '';
    },

    async deleteDocument(subject, filename) {
        if (!confirm(i18n.t('adm.kb.deleteConfirm', {name: filename}))) return;
        try {
            await AdminAPI.deleteDocument(subject, filename);
            alert(i18n.t('adm.kb.deleteSuccess'));
            await this.loadDocuments(subject);
        } catch (error) {
            console.error('刪除文檔出错:', error);
            alert(i18n.t('adm.kb.deleteFailedShort'));
        }
    },

    /* ---------- 提示詞配置 ---------- */
    loadPromptsTab() {
        this.loadPromptSubjects();
    },

    loadPromptSubjects() {
        const container = document.getElementById('promptSubjectList');
        if (!container) return;
        container.innerHTML = '';
        for (const [code, subject] of Object.entries(this.state.subjects)) {
            const item = document.createElement('div');
            item.style.cssText = 'padding:12px;background:var(--bg);border-radius:8px;cursor:pointer;transition:all .3s;display:flex;align-items:center;gap:8px;';
            item.innerHTML = `<span>${subject.icon || AdminUI.icon('books', 'icon-lg')}</span><span>${subject.name || code}</span>`;
            item.addEventListener('click', (event) => this.selectPromptSubject(code, subject, event));
            container.appendChild(item);
        }
    },

    async selectPromptSubject(code, subject, event) {
        this.state.currentPromptSubject = code;
        document.querySelectorAll('#promptSubjectList > div').forEach(item => {
            item.style.background = 'var(--bg)';
            item.style.color = '';
        });
        if (event?.currentTarget) {
            event.currentTarget.style.background = 'var(--primary)';
            event.currentTarget.style.color = 'white';
        }
        document.getElementById('promptEditor').style.display = 'block';
        document.getElementById('promptPlaceholder').style.display = 'none';
        document.getElementById('promptSubjectTitle').textContent = i18n.t('adm.prompt.title', {name: subject.name || code});
        await this.loadPrompt(code);
    },

    async loadPrompt(subjectCode) {
        try {
            const response = await AdminAPI.fetchPrompt(subjectCode);
            if (response.ok) {
                const data = await response.json();
                document.getElementById('promptContent').value = data.prompt || '';
            } else {
                const defaultPrompt = i18n.t('adm.prompt.defaultPrompt', {name: this.state.subjects[subjectCode]?.name || subjectCode});
                document.getElementById('promptContent').value = defaultPrompt;
            }
        } catch (error) {
            console.error('載入提示詞失敗:', error);
            const defaultPrompt = i18n.t('adm.prompt.defaultPrompt', {name: this.state.subjects[subjectCode]?.name || subjectCode});
            document.getElementById('promptContent').value = defaultPrompt;
        }
        this.updateCharCount();
    },

    updateCharCount() {
        const content = document.getElementById('promptContent').value;
        document.getElementById('promptCharCount').textContent = i18n.t('adm.prompt.charCount', {count: content.length});
    },

    applyPromptTemplate(templateName) {
        if (!this.state.currentPromptSubject) { alert(i18n.t('adm.prompt.selectSubjectFirst')); return; }
        const template = this.state.promptTemplates[templateName];
        const subject = this.state.subjects[this.state.currentPromptSubject];
        const prompt = template.replace('{subject_name}', subject?.name || this.state.currentPromptSubject);
        document.getElementById('promptContent').value = prompt;
        this.updateCharCount();
    },

    async savePrompt() {
        if (!this.state.currentPromptSubject) { alert(i18n.t('adm.prompt.selectSubject')); return; }
        const textarea = document.getElementById('promptContent');
        const prompt = textarea.value;
        try {
            await AdminAPI.savePrompt(this.state.currentPromptSubject, prompt);
            const status = document.getElementById('promptSaveStatus');
            status.style.display = 'inline';
            status.textContent = i18n.t('adm.prompt.saved');
            status.style.color = 'var(--success)';
            textarea.style.border = '2px solid var(--success)';
            setTimeout(() => {
                status.style.display = 'none';
                textarea.style.border = '2px solid var(--border)';
            }, 3000);
            this.updateCharCount();
        } catch (error) {
            alert(i18n.t('adm.prompt.saveFailedPrefix') + error.message);
        }
    },

    formatPrompt() {
        const textarea = document.getElementById('promptContent');
        const lines = textarea.value.split('\n');
        const formatted = lines.map(l => l.trim()).filter(Boolean).join('\n\n');
        textarea.value = formatted;
        this.updateCharCount();
    },

    previewPrompt() {
        const content = document.getElementById('promptContent').value;
        alert(i18n.t('adm.prompt.previewTitle') + content);
    },

    resetPrompt() {
        if (confirm(i18n.t('adm.prompt.resetConfirm'))) {
            document.getElementById('promptContent').value = '';
            this.updateCharCount();
        }
    },

    /* ---------- 學生分析 ----------
       新流程（風險快取版）：
       1. 上方「全校高風險 Top 10」立即從快取讀（<10ms）
       2. 為了讓班級下拉有選項，仍然 fetch user list（一次性，不跑風險計算）
       3. 預設選教師自己的班；若沒有，提示「請先選擇班級」
       4. 選班級後，從 cache 拉該班學生（瞬間）
       「立即重算」按鈕呼叫 forceRefreshRisk，跑 ~5-10 秒。
    */
    async loadStudentAnalysis() {
        console.log('[Analysis] 開始載入學生分析數據...');

        // ① 載入「全校高風險 Top 10」（從快取，瞬間）
        this.loadStudentsSummary();  // 即 fetchTopAtRisk + render

        // ② 為了班級下拉，仍需要拿一次用戶列表（不再跑風險）
        document.getElementById('studentList').innerHTML =
            '<div class="loading-spinner"><div class="spinner"></div><p>' + i18n.t('adm.analysis.loadingList') + '</p></div>';
        try {
            const data = await AdminAPI.fetchUsers();
            this.state.allStudents = (data.users || []).filter(user => user.role === 'student');
            this.updateClassFilter();

            // ③ 預設選教師自己的班（如果有）
            const myClass = (this.state.currentUser && this.state.currentUser.class_name) || '';
            const classFilter = document.getElementById('classFilter');
            if (myClass && [...classFilter.options].some(o => o.value === myClass)) {
                classFilter.value = myClass;
                await this.loadClassStudents(myClass);
            } else {
                // 沒有預設班 → 顯示「請先選擇班級」
                document.getElementById('studentList').innerHTML =
                    '<div class="empty-state"><p>' + i18n.t('adm.analysis.pickClassFirst') + '</p></div>';
                this.updateStudentStats([]);
            }
        } catch (error) {
            console.error('[Analysis] 載入學生數據失敗:', error);
            document.getElementById('studentList').innerHTML =
                '<div class="empty-state"><p>' + i18n.t('adm.analysis.loadFailed') + '</p></div>';
        }
    },

    // 從風險快取讀某班學生並渲染左側列表
    async loadClassStudents(className) {
        document.getElementById('studentList').innerHTML =
            '<div class="loading-spinner"><div class="spinner"></div><p>' + i18n.t('adm.analysis.loadingList') + '</p></div>';
        try {
            const data = await AdminAPI.fetchStudentsSummary(className);
            // 把 cache 回應接到既有的 state.allStudents 結構
            // cache row 已含 risk_level / risk_score / overall_summary
            this.state.allStudents = (data.students || []).map(s => ({
                username: s.student_id,
                display_name: s.display_name,
                class_name: s.class_name,
                role: 'student',
                risk_level: s.risk_level,
                risk_score: s.risk_score,
                overall_summary: s.overall_summary,
                last_active: s.last_active,
            }));
            // 把 risk_level 注入 studentReports state，讓 renderStudentList 能著色
            this.state.allStudents.forEach(s => {
                if (!this.state.studentReports) this.state.studentReports = {};
                this.state.studentReports[s.username] = { risk_level: s.risk_level || 'unknown' };
            });
            AdminUI.renderStudentList(this.state.allStudents);
            this.updateStudentStats(this.state.allStudents);
        } catch (error) {
            console.error('[Analysis] 載入該班學生失敗:', error);
            document.getElementById('studentList').innerHTML =
                '<div class="empty-state"><p>' + i18n.t('adm.analysis.loadFailed') + '</p></div>';
        }
    },

    // 強制重算所有學生風險（耗時 5-10 秒，但給按鈕的人用）
    async forceRefreshRisk() {
        const btns = document.querySelectorAll('[data-action="forceRefreshRisk"]');
        btns.forEach(b => { b.disabled = true; });
        try {
            await AdminAPI.forceRefreshRisk();
            // 重新載入兩個區塊
            await this.loadStudentsSummary();
            const cls = (document.getElementById('classFilter') || {}).value || '';
            if (cls) await this.loadClassStudents(cls);
            if (typeof showToast === 'function') {
                showToast(i18n.t('adm.atRisk.refreshSuccess'), 'success');
            }
        } catch (e) {
            console.error('forceRefreshRisk failed:', e);
            if (typeof showToast === 'function') {
                showToast(i18n.t('adm.atRisk.refreshFailed'), 'error');
            }
        } finally {
            btns.forEach(b => { b.disabled = false; });
        }
    },

    updateClassFilter() {
        const classFilter = document.getElementById('classFilter');
        const classes = [...new Set(this.state.allStudents.map(s => s.class_name).filter(c => c))];
        classFilter.innerHTML = `<option value="">${i18n.t('adm.filter.allClasses')}</option>`;
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });
    },

    async selectStudent(student) {
        document.getElementById('analysisContent').innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>' + i18n.t('adm.overview.loadingAnalysis') + '</p><p style="font-size: 12px; color: #999;">' + i18n.t('adm.overview.loadingHint') + '</p></div>';
        this.state.currentStudent = student;

        document.querySelectorAll('.student-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`[data-student-id="${student.username}"]`)?.classList.add('active');

        try {
            const overviewData = await AdminAPI.fetchStudentOverview(student.username);
            let analysisHTML = `
                <div class="overall-card" style="background: var(--brand); color: white; padding: 25px; border-radius: 15px; margin-bottom: 20px;">
                    <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 10px; margin-bottom: 15px;">
                        ${AdminUI.icon('chart', 'icon-white')} ${i18n.t('adm.overview.title', {name: student.display_name || student.username})}
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${overviewData.total_conversations || 0}</div>
                            <div style="font-size: 12px; opacity: 0.9;">${i18n.t('adm.overview.totalConversations')}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${overviewData.total_hours || 0}h</div>
                            <div style="font-size: 12px; opacity: 0.9;">${i18n.t('adm.overview.studyHours')}</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${(overviewData.active_subjects && overviewData.active_subjects.length) || 0}</div>
                            <div style="font-size: 12px; opacity: 0.9;">${i18n.t('adm.overview.activeSubjects')}</div>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <p style="margin-bottom: 8px;"><strong>${AdminUI.icon('books', 'icon-sm icon-white')} ${i18n.t('adm.overview.activeSubjectsList')}</strong> ${(overviewData.active_subjects && overviewData.active_subjects.join(', ')) || i18n.t('adm.overview.none')}</p>
                        <p style="margin-bottom: 8px;"><strong>${AdminUI.icon('calendar', 'icon-sm icon-white')} ${i18n.t('adm.overview.lastActive')}</strong> ${overviewData.last_active || i18n.t('adm.overview.noRecord')}</p>
                        <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 10px; margin-top: 15px;">
                            <h4 style="color: white; margin-bottom: 10px;">${AdminUI.icon('cpu', 'icon-sm icon-white')} ${i18n.t('adm.overview.aiEval')}</h4>
                            <p style="line-height: 1.6; font-size: 14px;">${overviewData.overall_assessment || i18n.t('adm.overview.needMoreData')}</p>
                        </div>
                    </div>
                </div>
            `;

            const subject = document.getElementById('subjectFilter').value || 'ict';
            try {
                const report = await AdminAPI.fetchStudentAnalysis(student.username, subject);
                if (report.has_data) {
                    analysisHTML += AdminUI.generateDetailedReport(student, report, subject);
                } else {
                    analysisHTML += `
                        <div class="report-card" style="background: white; padding: 20px; border-radius: 15px;">
                            <h4 style="color: var(--primary);">${AdminUI.icon('books', 'icon-sm', 'stroke:var(--primary)')} ${i18n.t('adm.overview.subjectAnalysis', {subject: AdminUI.getSubjectName(subject)})}</h4>
                            <p style="color: #999; text-align: center; padding: 20px;">${i18n.t('adm.overview.noSubjectRecord', {subject: AdminUI.getSubjectName(subject)})}</p>
                        </div>
                    `;
                }
            } catch (e) {
                // subject analysis failed, just show overview
            }

            document.getElementById('analysisContent').innerHTML = analysisHTML;
        } catch (error) {
            console.error('[Analysis] 获取學生分析失敗:', error);
            document.getElementById('analysisContent').innerHTML = '<div class="empty-state"><h4>' + i18n.t('adm.overview.loadFailed') + '</h4><p>' + i18n.t('adm.overview.cannotLoad') + '</p></div>';
        }
    },

    filterStudents() {
        const classFilter = document.getElementById('classFilter').value;
        const subjectFilter = document.getElementById('subjectFilter').value;
        const searchText = document.getElementById('studentSearch').value.toLowerCase();
        let filteredStudents = this.state.allStudents;
        if (classFilter) filteredStudents = filteredStudents.filter(s => s.class_name === classFilter);
        if (searchText) filteredStudents = filteredStudents.filter(s => (s.display_name || s.username).toLowerCase().includes(searchText));
        AdminUI.renderStudentList(filteredStudents);
        this.updateStudentStats(filteredStudents);
        if (subjectFilter && this.state.currentStudent) {
            this.selectStudent(this.state.currentStudent);
        }
    },

    updateStudentStats(students) {
        document.getElementById('totalStudentCount').textContent = students.length;
        let highRisk = 0, mediumRisk = 0, lowRisk = 0;
        students.forEach(student => {
            const report = this.state.studentReports[student.username];
            if (report) {
                switch (report.risk_level) {
                    case 'high': highRisk++; break;
                    case 'medium': mediumRisk++; break;
                    case 'low': lowRisk++; break;
                }
            }
        });
        document.getElementById('highRiskCount').textContent = highRisk;
        document.getElementById('mediumRiskCount').textContent = mediumRisk;
        document.getElementById('lowRiskCount').textContent = lowRisk;
    },

    async refreshAnalysis() {
        if (this.state.currentStudent) {
            await this.selectStudent(this.state.currentStudent);
        } else {
            await this.loadStudentAnalysis();
        }
    },

    exportAnalysis() {
        if (!this.state.currentStudent || !this.state.studentReports[this.state.currentStudent.username]) {
            alert(i18n.t('adm.analysis.selectStudent'));
            return;
        }
        const report = this.state.studentReports[this.state.currentStudent.username];
        const content = `
${i18n.t('adm.export.title')}
================
${i18n.t('adm.export.studentName', {name: this.state.currentStudent.display_name || this.state.currentStudent.username})}
${i18n.t('adm.export.classLabel', {name: this.state.currentStudent.class_name || i18n.t('adm.student.noClass')})}
${i18n.t('adm.export.subjectLabel', {name: AdminUI.getSubjectName(report.subject)})}
${i18n.t('adm.export.dateLabel', {date: new Date(report.analysis_date).toLocaleDateString('zh-CN')})}
${i18n.t('adm.export.riskLabel', {level: AdminUI.getRiskText(report.risk_level)})}

${i18n.t('adm.export.overallSection')}
--------
${report.overall_assessment || i18n.t('adm.export.noAssessment')}

${i18n.t('adm.export.knowledgeSection')}
------------
${report.knowledge_mastery_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.styleSection')}
------------
${report.learning_style_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.difficultySection')}
------------
${report.difficulty_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.emotionSection')}
------------
${report.emotion_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.progressSection')}
------------
${report.progress_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.suggestionSection')}
--------------
${report.suggestion_report || i18n.t('adm.export.noData')}

${i18n.t('adm.export.teacherSection')}
----------
${report.teacher_attention_points || i18n.t('adm.export.none')}
        `;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = i18n.t('adm.export.filename', {name: this.state.currentStudent.username, date: new Date().toISOString().split('T')[0]});
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /* ---------- 全校高風險 Top 10（從快取讀） ---------- */
    async loadStudentsSummary() {
        const container = document.getElementById('studentsSummaryList');
        if (!container) return;
        container.innerHTML = '<div class="loading-spinner" style="grid-column: 1 / -1;"><div class="spinner"></div><p>' + i18n.t('adm.atRisk.loading') + '</p></div>';
        try {
            const data = await AdminAPI.fetchTopAtRisk(10);
            AdminUI.displayStudentsSummary(data.students || []);
            // 更新「最後刷新時間」標籤
            const stamp = document.getElementById('riskLastRefresh');
            if (stamp) {
                if (data.last_refresh) {
                    stamp.textContent = i18n.t('adm.atRisk.lastRefresh', {time: data.last_refresh});
                } else {
                    stamp.textContent = i18n.t('adm.atRisk.refreshNote');
                }
            }
        } catch (error) {
            console.error('載入高風險清單失敗:', error);
            container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">' + i18n.t('adm.summary.loadFailed') + '</div>';
        }
    },

    async viewStudentDetail(studentId, displayName) {
        this.switchTab('analysis');
        const target = (this.state.allStudents || []).find(s => s.username === studentId);
        if (target) { this.selectStudent(target); return; }

        this._showDetailLoading();
        try {
            const detailResponse = await AdminAPI.fetchStudentAnalysis(studentId, 'ict');
            const report = detailResponse;
            const pseudoStudent = { username: studentId, display_name: displayName || studentId, class_name: report.class_name || '' };

            const html = `
                <div class="analysis-header">
                    <h3>${i18n.t('adm.report.title', {name: pseudoStudent.display_name})}</h3>
                    <div class="analysis-meta">
                        <span>${AdminUI.icon('graduation', 'icon-sm')} ${i18n.t('adm.report.classLabel', {name: pseudoStudent.class_name || i18n.t('adm.student.noClass')})}</span>
                        <span>${AdminUI.icon('books', 'icon-sm')} ${i18n.t('adm.analysis.subjectLabel', {name: AdminUI.getSubjectName('ict')})}</span>
                        <span>${AdminUI.icon('calendar', 'icon-sm')} ${i18n.t('adm.report.analysisDate', {date: report.analysis_date ? new Date(report.analysis_date).toLocaleDateString('zh-CN') : '-'})}</span>
                    </div>
                </div>
                ${AdminUI.generateDetailedReport(pseudoStudent, { ...report, has_data: true }, 'ict')}
            `;
            document.getElementById('analysisContent').innerHTML = html;
        } catch (e) {
            console.error('載入詳細報告失敗', e);
            document.getElementById('analysisContent').innerHTML = '<div class="empty-state">' + i18n.t('adm.summary.cannotLoad') + '</div>';
        }
    },

    _showDetailLoading() {
        const el = document.getElementById('analysisContent');
        if (el) el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>' + i18n.t('adm.summary.loadingDetail') + '</p></div>';
    },

    /* ---------- 用戶管理 ---------- */
    async loadUsers(forceRefresh = false) {
        try {
            // 有緩存且非強制刷新時直接渲染，避免重複請求
            if (!forceRefresh && this.state.allUsers && this.state.allUsers.length > 0) {
                AdminUI.renderUsersTable(this.state.allUsers);
                return;
            }
            const data = await AdminAPI.fetchUsers();
            this.state.allUsers = data.users || [];
            this.updateUserClassFilter();
            AdminUI.renderUsersTable(this.state.allUsers);
        } catch (error) {
            console.error('載入用戶失敗:', error);
            alert(i18n.t('adm.user.loadFail'));
        }
    },

    updateUserClassFilter() {
        const classFilter = document.getElementById('userClassFilter');
        const classes = [...new Set(this.state.allUsers.map(u => u.class_name).filter(c => c))];
        classFilter.innerHTML = `<option value="">${i18n.t('adm.filter.allClasses')}</option>`;
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });
    },

    filterUsers() {
        const roleFilter = document.getElementById('userRoleFilter').value;
        const classFilter = document.getElementById('userClassFilter').value;
        const searchText = document.getElementById('userSearchInput').value.toLowerCase();
        let filteredUsers = this.state.allUsers;
        if (roleFilter) filteredUsers = filteredUsers.filter(u => u.role === roleFilter);
        if (classFilter) filteredUsers = filteredUsers.filter(u => u.class_name === classFilter);
        if (searchText) {
            filteredUsers = filteredUsers.filter(u =>
                u.username.toLowerCase().includes(searchText) ||
                (u.display_name && u.display_name.toLowerCase().includes(searchText)) ||
                (u.english_name && u.english_name.toLowerCase().includes(searchText)) ||
                (u.card_id && u.card_id.toLowerCase().includes(searchText))
            );
        }
        AdminUI.renderUsersTable(filteredUsers);
    },

    showAddUserModal() {
        document.getElementById('userModalTitle').textContent = i18n.t('adm.modal.addUserTitle');
        document.getElementById('userForm').reset();
        document.getElementById('editUserId').value = '';
        document.getElementById('userUsername').disabled = false;
        document.getElementById('userPassword').required = true;
        document.getElementById('userModal').style.display = 'flex';
    },

    editUser(username) {
        const user = this.state.allUsers.find(u => u.username === username);
        if (!user) return;
        document.getElementById('userModalTitle').textContent = i18n.t('adm.modal.editUserTitle');
        document.getElementById('editUserId').value = username;
        document.getElementById('userUsername').value = username;
        document.getElementById('userUsername').disabled = true;
        document.getElementById('userPassword').required = false;
        document.getElementById('userPassword').value = '';
        document.getElementById('userDisplayName').value = user.display_name || '';
        document.getElementById('userEnglishName').value = user.english_name || '';
        document.getElementById('userCardId').value = user.card_id || '';
        document.getElementById('userRole').value = user.role || 'student';
        document.getElementById('userClass').value = user.class_name || '';
        document.getElementById('userClassNumber').value = user.class_number || '';
        document.getElementById('userNotes').value = user.notes || '';
        document.getElementById('userModal').style.display = 'flex';
    },

    closeUserModal() {
        document.getElementById('userModal').style.display = 'none';
    },

    async _handleUserFormSubmit(e) {
        e.preventDefault();
        const editUserId = document.getElementById('editUserId').value;
        const isEdit = !!editUserId;
        const classNumberVal = document.getElementById('userClassNumber').value;
        const userData = {
            username: document.getElementById('userUsername').value,
            display_name: document.getElementById('userDisplayName').value,
            english_name: document.getElementById('userEnglishName').value,
            card_id: document.getElementById('userCardId').value || null,
            role: document.getElementById('userRole').value,
            class_name: document.getElementById('userClass').value,
            class_number: classNumberVal ? parseInt(classNumberVal) : null,
            notes: document.getElementById('userNotes').value
        };
        if (!isEdit) {
            userData.password = document.getElementById('userPassword').value;
            if (!userData.password) { alert(i18n.t('adm.modal.enterPassword')); return; }
        } else if (document.getElementById('userPassword').value) {
            userData.password = document.getElementById('userPassword').value;
        }
        try {
            if (isEdit) {
                await AdminAPI.updateUser(editUserId, userData);
                alert(i18n.t('adm.modal.userUpdateSuccess'));
            } else {
                await AdminAPI.createUser(userData);
                alert(i18n.t('adm.modal.userAddSuccess'));
            }
            this.closeUserModal();
            this.loadUsers(true);
        } catch (error) {
            alert(i18n.t('adm.modal.operationFail', {msg: error.message}));
        }
    },

    async resetUserPassword(username) {
        const newPassword = prompt(i18n.t('adm.user.resetPwdPrompt', {username}));
        if (!newPassword) return;
        try {
            await AdminAPI.resetUserPassword(username, newPassword);
            alert(i18n.t('adm.user.resetPwdSuccess'));
        } catch (error) {
            alert(i18n.t('adm.user.resetPwdFail', {msg: error.message}));
        }
    },

    deleteUser(username) {
        this.state.userToDelete = username;
        document.getElementById('deleteConfirmMessage').textContent = i18n.t('adm.modal.deleteMessage', {username});
        document.getElementById('deleteConfirmModal').style.display = 'flex';
    },

    async confirmDelete() {
        if (!this.state.userToDelete) return;
        try {
            await AdminAPI.deleteUser(this.state.userToDelete);
            alert(i18n.t('adm.modal.userDeleteSuccess'));
            this.closeDeleteConfirm();
            this.loadUsers(true);
        } catch (error) {
            alert(i18n.t('adm.modal.userDeleteFail', {msg: error.message}));
        }
    },

    closeDeleteConfirm() {
        document.getElementById('deleteConfirmModal').style.display = 'none';
        this.state.userToDelete = null;
    },

    /* ---------- 批量添加 ---------- */
    showBatchAddModal() {
        document.getElementById('batchAddModal').style.display = 'flex';
    },

    closeBatchAddModal() {
        document.getElementById('batchAddModal').style.display = 'none';
        document.getElementById('batchUserData').value = '';
        document.getElementById('importResults').style.display = 'none';
        document.getElementById('selectedFileInfo').style.display = 'none';
        this.clearSelectedFile();
        this.switchBatchTab('excel');
    },

    switchBatchTab(tab) {
        this.state.currentBatchTab = tab;
        document.getElementById('tabExcel').style.background = tab === 'excel' ? 'var(--primary)' : '#eee';
        document.getElementById('tabExcel').style.color = tab === 'excel' ? 'white' : '#666';
        document.getElementById('tabText').style.background = tab === 'text' ? 'var(--primary)' : '#eee';
        document.getElementById('tabText').style.color = tab === 'text' ? 'white' : '#666';
        document.getElementById('excelUploadSection').style.display = tab === 'excel' ? 'block' : 'none';
        document.getElementById('textInputSection').style.display = tab === 'text' ? 'block' : 'none';
    },

    async downloadTemplate() {
        try {
            const blob = await AdminAPI.downloadUserTemplate();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = i18n.t('adm.batch.templateFilename');
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert(i18n.t('adm.batch.downloadFailed', {msg: error.message}));
        }
    },

    handleExcelSelect(event) {
        const file = event.target.files[0];
        if (file) {
            this.state.selectedExcelFile = file;
            document.getElementById('selectedFileName').textContent = file.name;
            document.getElementById('selectedFileInfo').style.display = 'block';
        }
    },

    clearSelectedFile() {
        this.state.selectedExcelFile = null;
        document.getElementById('excelFileInput').value = '';
        document.getElementById('selectedFileInfo').style.display = 'none';
    },

    async processBatchAddNew() {
        const btn = document.getElementById('batchSubmitBtn');
        btn.disabled = true;
        btn.innerHTML = AdminUI.icon('refresh', 'icon-sm') + ' ' + i18n.t('adm.batch.importing');
        try {
            if (this.state.currentBatchTab === 'excel') {
                await this._processExcelUpload();
            } else {
                await this._processTextBatchAdd();
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = AdminUI.icon('rocket', 'icon-sm icon-white') + ' ' + i18n.t('adm.batch.startImport');
        }
    },

    async _processExcelUpload() {
        if (!this.state.selectedExcelFile) { alert(i18n.t('adm.batch.selectExcel')); return; }
        const formData = new FormData();
        formData.append('file', this.state.selectedExcelFile);
        try {
            const response_data = await AdminAPI.uploadExcelUsers(formData);
            const result = response_data.data || response_data;
            const resultsDiv = document.getElementById('importResults');
            const resultsList = document.getElementById('importResultsList');
            resultsDiv.style.display = 'block';
            let html = `<p style="margin-bottom: 10px;"><strong>${i18n.t('adm.batch.successCount', {count: result.success_count || 0})}</strong> | <strong style="color: var(--danger);">${i18n.t('adm.batch.failedCount', {count: result.failed_count || 0})}</strong></p>`;
            if (result.failed_details && result.failed_details.length > 0) {
                html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 13px;">';
                result.failed_details.forEach(f => {
                    html += `<li style="padding: 4px 0; color: var(--danger);">${AdminUI.icon('warning', 'icon-sm', 'stroke:var(--danger)')} ${f.username || f.row || ''}: ${f.error}</li>`;
                });
                html += '</ul>';
            }
            resultsList.innerHTML = html;
            if (result.success_count > 0) this.loadUsers(true);
            if (result.failed_count === 0 && result.success_count > 0) {
                alert(i18n.t('adm.batch.importComplete', {count: result.success_count}));
            }
        } catch (error) {
            alert(i18n.t('adm.batch.importFailed', {msg: error.message}));
        }
    },

    async _processTextBatchAdd() {
        const role = document.getElementById('batchRole').value;
        const userData = document.getElementById('batchUserData').value.trim();
        if (!userData) { alert(i18n.t('adm.batch.enterData')); return; }
        const lines = userData.split('\n').filter(line => line.trim());
        const users = [];
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 2) { alert(i18n.t('adm.batch.formatError', {line})); return; }
            users.push({
                username: parts[0], password: parts[1], display_name: parts[2] || '',
                class_name: parts[3] || '', notes: parts[4] || '', role
            });
        }
        try {
            const response_data = await AdminAPI.batchAddUsers(users);
            const result = response_data.data || response_data;
            alert(i18n.t('adm.batch.batchComplete', {success: result.success_count || 0, fail: result.failed_count || 0}));
            this.closeBatchAddModal();
            this.loadUsers(true);
        } catch (error) {
            alert(i18n.t('adm.batch.batchFailed', {msg: error.message}));
        }
    },

    /* ---------- 通告助手 ---------- */
    async initNoticeGenerator() {
        this.state.noticeSessionId = 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        try {
            const data = await AdminAPI.startNoticeDialogue(this.state.noticeSessionId);
            this._addNoticeAIMessage(data.message);
            if (data.progress !== undefined) this._updateNoticeProgress(data.progress);
        } catch (error) {
            this._addNoticeAIMessage(i18n.t('adm.notice.connectionError'));
        }
    },

    async sendNoticeMessage() {
        const input = document.getElementById('noticeChatInput');
        const message = input.value.trim();
        if (!message) return;
        this._addNoticeUserMessage(message);
        input.value = '';
        try {
            const data = await AdminAPI.continueNoticeDialogue(this.state.noticeSessionId, message);
            this._addNoticeAIMessage(data.message);
            if (data.progress !== undefined) this._updateNoticeProgress(data.progress);
            if (data.can_export) this._enableNoticeExport();
            this._updateNoticeQuickActions(data.stage);
        } catch (error) {
            this._addNoticeAIMessage(i18n.t('adm.notice.processingError'));
        }
    },

    _addNoticeAIMessage(message) {
        const container = document.getElementById('noticeChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'notice-message ai';
        messageDiv.innerHTML = `
            <div style="width: 35px; height: 35px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">${AdminUI.icon('cpu', 'icon-sm icon-white')}</div>
            <div class="notice-message-content">${(message || '').replace(/\n/g, '<br>')}</div>
        `;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
        this._updateRealTimePreview(message);
    },

    _addNoticeUserMessage(message) {
        const container = document.getElementById('noticeChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'notice-message user';
        messageDiv.innerHTML = `
            <div style="width: 35px; height: 35px; background: var(--brand-lighter); border-radius: 50%; display: flex; align-items: center; justify-content: center;">${AdminUI.icon('users', 'icon-sm', 'stroke:var(--brand)')}</div>
            <div class="notice-message-content">${message}</div>
        `;
        container.appendChild(messageDiv);
        container.scrollTop = container.scrollHeight;
    },

    _updateNoticeProgress(progress) {
        const progressBar = document.getElementById('noticeProgressBar');
        if (progressBar) progressBar.style.width = progress + '%';
    },

    _updateNoticeQuickActions(stage) {
        const container = document.getElementById('noticeQuickActions');
        if (!container) return;
        container.innerHTML = '';
        let actions = [];
        if (stage === 'select_type') actions = [i18n.t('adm.notice.activityNotice'), i18n.t('adm.notice.examNotice'), i18n.t('adm.notice.meetingNotice'), i18n.t('adm.notice.generalNotice')];
        else if (stage === 'confirming') actions = [i18n.t('adm.notice.confirm'), i18n.t('adm.notice.modify')];
        else if (stage === 'completed') actions = [i18n.t('adm.notice.newNotice')];
        actions.forEach(action => {
            const button = document.createElement('button');
            button.className = 'quick-action';
            button.textContent = action;
            button.addEventListener('click', () => {
                document.getElementById('noticeChatInput').value = action;
                this.sendNoticeMessage();
            });
            container.appendChild(button);
        });
    },

    _enableNoticeExport() {
        this.state.noticeCanExport = true;
        const exportBtn = document.getElementById('noticeExportButton');
        if (exportBtn) exportBtn.style.display = 'block';
    },

    async exportNotice() {
        if (!this.state.noticeCanExport) { alert(i18n.t('adm.notice.completeFirst')); return; }
        try {
            const blob = await AdminAPI.exportNotice(this.state.noticeSessionId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = i18n.t('adm.notice.filename', {date: new Date().toISOString().split('T')[0]});
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            this._addNoticeAIMessage(AdminUI.icon('check-circle', 'icon-sm', 'stroke:var(--success)') + i18n.t('adm.notice.exportSuccess'));
        } catch (error) {
            alert(i18n.t('adm.notice.exportError', {msg: error.message}));
        }
    },

    handleNoticeKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendNoticeMessage();
        }
    },

    /* ---------- 拖拽上傳 ---------- */
    initDragDropUpload() {
        const mountTargets = [
            document.getElementById('noticeTemplatesList'),
            document.getElementById('documentsList')
        ].filter(Boolean);
        if (mountTargets.length === 0) return;
        if (document.querySelector('.drag-drop-zone')) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'drag-drop-zone';
        wrapper.innerHTML = `
            <div class="ddz-inner">
                <div>${AdminUI.icon('folder', '', 'width:40px;height:40px;stroke:var(--text-secondary)')}</div>
                <div class="ddz-title">${i18n.t('adm.dnd.title')}</div>
                <div class="ddz-sub">${i18n.t('adm.dnd.subtitle')}</div>
                <button type="button" class="ddz-btn" id="ddzPickerBtn">${i18n.t('adm.dnd.pickFile')}</button>
            </div>
        `;

        const picker = document.createElement('input');
        picker.type = 'file';
        picker.multiple = true;
        picker.style.display = 'none';
        document.body.appendChild(picker);

        picker.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (files.length) await this._batchUploadTemplates(files);
            picker.value = '';
        });

        const inner = wrapper.querySelector('.ddz-inner');
        inner.addEventListener('dragover', (e) => { e.preventDefault(); inner.classList.add('is-dragover'); });
        inner.addEventListener('dragleave', () => inner.classList.remove('is-dragover'));
        inner.addEventListener('drop', async (e) => {
            e.preventDefault();
            inner.classList.remove('is-dragover');
            const files = Array.from(e.dataTransfer.files || []);
            if (files.length) await this._batchUploadTemplates(files);
        });

        inner.querySelector('#ddzPickerBtn').addEventListener('click', () => picker.click());

        const target = mountTargets[0];
        target.parentNode.insertBefore(wrapper, target);
    },

    async _batchUploadTemplates(files) {
        if (!files || files.length === 0) return;
        const guessTypeByName = (name) => {
            const n = (name || '').toLowerCase();
            if (n.includes('考') || n.includes('exam')) return 'exam';
            if (n.includes('會') || n.includes('会') || n.includes('meeting')) return 'meeting';
            if (n.includes('活') || n.includes('activity')) return 'activity';
            return 'general';
        };
        let ok = 0, fail = 0;
        for (const file of files) {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('template_type', guessTypeByName(file.name));
            formData.append('description', i18n.t('adm.dnd.batchUploadDesc'));
            try {
                const resp = await AdminAPI.uploadNoticeTemplate(formData);
                if (resp.ok) ok++; else fail++;
            } catch (_) { fail++; }
        }
        AdminUI.showSuccessNotification(i18n.t('adm.dnd.batchResult', {ok, fail}));
        await this.loadNoticeTemplates();
    },

    /* ---------- 通告聊天增強 ---------- */
    enhanceNoticeChat() {
        const qa = document.getElementById('noticeQuickActions');
        if (qa && !qa.dataset.enhanced) {
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex; gap:8px; flex-wrap: wrap; margin: 8px 0 10px;';
            const quickTemplates = [
                { icon: AdminUI.icon('target', 'icon-sm'), text: i18n.t('adm.noticeChat.refLastYear') },
                { icon: AdminUI.icon('clipboard', 'icon-sm'), text: i18n.t('adm.noticeChat.copyLastFormat') },
                { icon: AdminUI.icon('bolt', 'icon-sm'), text: i18n.t('adm.noticeChat.autoFill') }
            ];
            quickTemplates.forEach(q => {
                const btn = document.createElement('button');
                btn.className = 'quick-action';
                btn.innerHTML = `${q.icon} ${q.text}`;
                btn.addEventListener('click', () => {
                    document.getElementById('noticeChatInput').value = q.text;
                    this.sendNoticeMessage();
                });
                bar.appendChild(btn);
            });
            qa.parentNode.insertBefore(bar, qa.nextSibling);
            qa.dataset.enhanced = '1';
        }

        if (!document.getElementById('noticePreviewPane')) {
            const rightMount = document.getElementById('analysisContent') || document.getElementById('noticeChatMessages')?.parentNode;
            if (rightMount) {
                const pane = document.createElement('div');
                pane.id = 'noticePreviewPane';
                pane.className = 'notice-preview-pane';
                pane.innerHTML = `
                    <h4>${AdminUI.icon('pencil', 'icon-sm', 'stroke:var(--primary)')} ${i18n.t('adm.noticeChat.realtimePreview')}</h4>
                    <div id="noticePreviewBody" class="notice-preview-empty">${i18n.t('adm.noticeChat.previewPlaceholder')}</div>
                `;
                rightMount.parentNode.insertBefore(pane, rightMount.nextSibling);
            }
        }
    },

    _updateRealTimePreview(message) {
        const pane = document.getElementById('noticePreviewBody');
        if (!pane) return;
        const msg = (message || '').trim();
        if (!msg) return;
        const looksLikeNotice = /【[^】]{2,}】/.test(msg) || /此致[\s\S]{0,10}貴家長/.test(msg) || /校長啟/.test(msg);
        if (!looksLikeNotice) return;
        const html = msg.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        pane.classList.remove('notice-preview-empty');
        pane.innerHTML = html;
    },

    /* ---------- 通告範本管理 ---------- */
    previewTemplateFile(input) {
        const file = input.files[0];
        if (file) {
            document.getElementById('previewFileName').textContent = file.name;
            document.getElementById('previewFileSize').textContent = AdminUI.formatFileSize(file.size);
            document.getElementById('templateFilePreview').style.display = 'block';
        }
    },

    clearTemplateForm() {
        const f = document.getElementById('noticeTemplateFile');
        if (f) f.value = '';
        const d = document.getElementById('noticeTemplateDescription');
        if (d) d.value = '';
        const pv = document.getElementById('templateFilePreview');
        if (pv) pv.style.display = 'none';
    },

    async uploadNoticeTemplate() {
        const fileInput = document.getElementById('noticeTemplateFile');
        const templateType = document.getElementById('noticeTemplateType')?.value || 'general';
        const description = document.getElementById('noticeTemplateDescription')?.value || '';
        const uploadBtn = document.getElementById('uploadTemplateBtn');

        if (!fileInput || !fileInput.files || !fileInput.files[0]) {
            alert(i18n.t('adm.noticeTpl.selectFile'));
            return;
        }

        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = AdminUI.icon('refresh', 'icon-sm') + ' ' + i18n.t('adm.noticeTpl.uploading'); }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('template_type', templateType);
        formData.append('description', description);

        try {
            const response = await AdminAPI.uploadNoticeTemplate(formData);
            if (response.ok) {
                await response.json().catch(() => ({}));
                AdminUI.showSuccessNotification(i18n.t('adm.noticeTpl.uploadSuccess'));
                this.clearTemplateForm();
                await this.loadNoticeTemplates();
                this.updateTemplateStats();
            } else {
                const error = await response.json().catch(() => ({}));
                alert(i18n.t('adm.noticeTpl.uploadFailed', {msg: error.detail || i18n.t('adm.noticeTpl.unknownError')}));
            }
        } catch (error) {
            alert(i18n.t('adm.noticeTpl.uploadFailed', {msg: error.message || i18n.t('adm.noticeTpl.networkError')}));
        } finally {
            if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = AdminUI.icon('upload', 'icon-sm icon-white') + ' ' + i18n.t('adm.noticeTpl.uploadBtn'); }
        }
    },

    async loadNoticeTemplates() {
        const list = document.getElementById('noticeTemplatesList');
        if (list) {
            list.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);"><div class="spinner"></div><p>' + i18n.t('adm.noticeTpl.loading') + '</p></div>';
        }
        try {
            const data = await AdminAPI.fetchNoticeTemplates();
            this.state.noticeTemplatesData = data.templates || {};
            this.updateTemplateStats();
            AdminUI.renderTemplatesList(this.state.currentTemplateFilter);
            setTimeout(() => this.initDragDropUpload(), 60);
        } catch (e) {
            console.error('載入范本列表失敗:', e);
            if (list) list.innerHTML = '<p style="text-align:center; color: var(--danger);">' + i18n.t('adm.noticeTpl.loadFailed') + '</p>';
        }
    },

    updateTemplateStats() {
        let total = 0, activity = 0, exam = 0, meeting = 0;
        for (const [type, templates] of Object.entries(this.state.noticeTemplatesData)) {
            const count = (templates || []).length;
            total += count;
            if (type === 'activity') activity = count;
            if (type === 'exam') exam = count;
            if (type === 'meeting') meeting = count;
        }
        const totalEl = document.getElementById('totalTemplatesCount'); if (totalEl) totalEl.textContent = total;
        const actEl = document.getElementById('activityTemplatesCount'); if (actEl) actEl.textContent = activity;
        const exEl = document.getElementById('examTemplatesCount'); if (exEl) exEl.textContent = exam;
        const mtEl = document.getElementById('meetingTemplatesCount'); if (mtEl) mtEl.textContent = meeting;
    },

    filterTemplates(type, btn) {
        this.state.currentTemplateFilter = type;
        document.querySelectorAll('.template-filter-btn').forEach(b => {
            b.classList.remove('active');
            b.style.background = 'var(--light)';
            b.style.color = 'var(--text)';
        });
        if (btn) {
            btn.classList.add('active');
            btn.style.background = 'var(--primary)';
            btn.style.color = 'white';
        }
        AdminUI.renderTemplatesList(type);
    },

    async deleteTemplate(type, filename) {
        if (!confirm(i18n.t('adm.tplDel.confirm', {name: filename}))) return;
        alert(i18n.t('adm.tplDel.notImpl'));
    },

    /* ---------- 應用管理 ---------- */
    async loadAppsConfig() {
        try {
            const data = await AdminAPI.fetchApps();
            this.state.appsConfig = data.apps || [];
            AdminUI.renderAppsConfig();
        } catch (error) {
            console.error('載入應用配置失敗:', error);
            document.getElementById('appmgrList').innerHTML = '<p style="color:red;">' + i18n.t('adm.appCfg.loadFailedPrefix') + error.message + '</p>';
        }
    },

    toggleAppEnabled(index, enabled) {
        this.state.appsConfig[index].enabled = enabled;
        AdminUI.renderAppsConfig();
    },

    toggleAppRole(index, role, checked) {
        const roles = this.state.appsConfig[index].roles || [];
        if (checked && !roles.includes(role)) {
            roles.push(role);
        } else if (!checked) {
            this.state.appsConfig[index].roles = roles.filter(r => r !== role);
        }
    },

    moveApp(index, direction) {
        const newIndex = index + direction;
        if (newIndex < 0 || newIndex >= this.state.appsConfig.length) return;
        const temp = this.state.appsConfig[index];
        this.state.appsConfig[index] = this.state.appsConfig[newIndex];
        this.state.appsConfig[newIndex] = temp;
        this.state.appsConfig.forEach((app, i) => app.order = i + 1);
        AdminUI.renderAppsConfig();
    },

    changeAppCategory(index, category) {
        this.state.appsConfig[index].category = category;
        AdminUI.renderAppsConfig();
    },

    async saveAppsConfig() {
        try {
            this.state.appsConfig.forEach((app, i) => app.order = i + 1);
            const data = await AdminAPI.saveApps(this.state.appsConfig);
            this.state.appsConfig = data.apps || this.state.appsConfig;
            AdminUI.renderAppsConfig();
            alert(i18n.t('adm.appCfg.saveSuccess'));
        } catch (error) {
            console.error('保存應用配置失敗:', error);
            alert(i18n.t('adm.appCfg.saveFailedPrefix') + error.message);
        }
    },

    async resetAppsToDefault() {
        if (!confirm(i18n.t('adm.appCfg.resetConfirm'))) return;
        try {
            const data = await AdminAPI.resetApps();
            this.state.appsConfig = data.apps || [];
            AdminUI.renderAppsConfig();
            alert(i18n.t('adm.appCfg.resetSuccess'));
        } catch (error) {
            console.error('重置失敗:', error);
            alert(i18n.t('adm.appCfg.resetFailedPrefix') + error.message);
        }
    },

    /* ============================================================
       課室日誌管理
       ============================================================ */

    async addClass() {
        const codeEl = document.getElementById('newClassCode');
        const nameEl = document.getElementById('newClassName');
        const gradeEl = document.getElementById('newClassGrade');

        const classCode = codeEl.value.trim();
        if (!classCode) { alert(i18n.t('adm.classDiary.enterCode')); return; }

        try {
            await AdminAPI.fetchWithAuth('/api/class-diary/admin/classes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    class_code: classCode,
                    class_name: nameEl.value.trim() || classCode,
                    grade: gradeEl.value.trim(),
                }),
            });
            codeEl.value = '';
            nameEl.value = '';
            gradeEl.value = '';
            this.loadClassDiaryQRGrid();
        } catch (error) {
            alert(i18n.t('adm.classDiary.addFailed', {msg: error.message}));
        }
    },

    async deleteClass(classCode) {
        if (!confirm(i18n.t('adm.classDiary.deleteConfirm', {code: classCode}))) return;
        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/classes/${encodeURIComponent(classCode)}`, {
                method: 'DELETE',
            });
            this.loadClassDiaryQRGrid();
        } catch (error) {
            alert(i18n.t('adm.classDiary.deleteFailed', {msg: error.message}));
        }
    },

    _teacherList: [],  // 緩存教師列表供班主任下拉使用

    async loadClassDiaryTab() {
        // 先載入教師列表（班主任下拉和 Reviewer/接收人 下拉共用）
        await this._loadTeacherList();
        await Promise.all([
            this.loadClassDiaryQRGrid(),
            this.loadReviewers(),
            this.loadTeachersForReviewer(),
            this.loadReportRecipients(),
            this.loadTeachersForReportRecipient(),
        ]);
    },

    async _loadTeacherList() {
        try {
            const data = await AdminAPI.fetchWithAuth('/api/admin/users?role=teacher');
            this._teacherList = data.data || data.users || [];
        } catch (e) {
            console.error('載入教師列表失敗:', e);
        }
    },

    _buildTeacherOptions(selectedUsername) {
        let html = `<option value="">${i18n.t('adm.classDiary.notSet')}</option>`;
        this._teacherList.forEach(u => {
            const sel = u.username === selectedUsername ? ' selected' : '';
            html += `<option value="${u.username}"${sel}>${u.display_name || u.username}</option>`;
        });
        return html;
    },

    async loadClassDiaryQRGrid() {
        const grid = document.getElementById('classDiaryQRGrid');
        try {
            const data = await AdminAPI.fetchWithAuth('/api/class-diary/admin/classes');
            const classes = data.data || [];

            if (classes.length === 0) {
                grid.innerHTML = '<p style="color:var(--text-secondary);">' + i18n.t('adm.classDiary.noClasses') + '</p>';
                return;
            }

            grid.innerHTML = classes.map(c => `
                <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center;position:relative;">
                    <button onclick="AdminApp.deleteClass('${c.class_code}')"
                        style="position:absolute;top:8px;right:8px;width:24px;height:24px;border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:1rem;line-height:1;border-radius:4px;"
                        title="${i18n.t('adm.classDiary.deleteClass')}">✕</button>
                    <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.25rem;">${c.class_code}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem;">${c.class_name || ''} ${c.grade ? '(' + c.grade + ')' : ''}</div>

                    <div style="text-align:left;margin-bottom:0.5rem;font-size:0.8rem;">
                        <label style="color:var(--text-secondary);display:block;margin-bottom:2px;">${i18n.t('adm.classDiary.classTeacher')}</label>
                        <select id="teacher-${c.class_code}" onchange="AdminApp.saveClassTeachers('${c.class_code}')"
                            style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">
                            ${this._buildTeacherOptions(c.teacher_username)}
                        </select>
                        <label style="color:var(--text-secondary);display:block;margin:4px 0 2px;">${i18n.t('adm.classDiary.viceTeacher')}</label>
                        <select id="vice-teacher-${c.class_code}" onchange="AdminApp.saveClassTeachers('${c.class_code}')"
                            style="width:100%;padding:4px 6px;border:1px solid var(--border);border-radius:6px;font-size:0.8rem;">
                            ${this._buildTeacherOptions(c.vice_teacher_username)}
                        </select>
                    </div>

                    <div id="qr-wrap-${c.class_code}" style="min-height:140px;display:flex;align-items:center;justify-content:center;">
                        <div class="spinner-small" id="qr-loading-${c.class_code}"></div>
                    </div>
                    <img id="qr-${c.class_code}" style="width:160px;height:160px;border:1px solid #eee;border-radius:8px;margin-bottom:0.5rem;display:none;" alt="QR">
                    <div id="qr-actions-${c.class_code}" style="display:none;gap:0.5rem;justify-content:center;">
                        <button onclick="AdminApp.downloadQR('${c.class_code}')"
                            style="padding:6px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--primary);color:#fff;font-size:0.8rem;cursor:pointer;">
                            ${AdminUI.icon('download', 'icon-sm icon-white')} ${i18n.t('adm.classDiary.downloadPNG')}
                        </button>
                    </div>
                </div>
            `).join('');

            // 自動載入所有 QR 碼
            for (const c of classes) {
                this.showQR(c.class_code);
            }
        } catch (error) {
            grid.innerHTML = '<p style="color:red;">' + i18n.t('adm.classDiary.loadFailed', {msg: error.message}) + '</p>';
        }
    },

    async saveClassTeachers(classCode) {
        const teacherEl = document.getElementById(`teacher-${classCode}`);
        const viceEl = document.getElementById(`vice-teacher-${classCode}`);
        if (!teacherEl || !viceEl) return;

        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/classes/${encodeURIComponent(classCode)}/teachers`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    teacher_username: teacherEl.value || null,
                    vice_teacher_username: viceEl.value || null,
                }),
            });
            // 短暫顯示已保存提示
            const card = teacherEl.closest('div[style*="background:#fff"]');
            if (card) {
                const old = card.style.borderColor;
                card.style.borderColor = '#22c55e';
                setTimeout(() => { card.style.borderColor = old; }, 1000);
            }
        } catch (error) {
            alert(i18n.t('adm.classDiary.saveTeacherFailed', {msg: error.message}));
        }
    },

    async showQR(classCode) {
        const img = document.getElementById(`qr-${classCode}`);
        const loading = document.getElementById(`qr-loading-${classCode}`);
        const actions = document.getElementById(`qr-actions-${classCode}`);
        try {
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const resp = await fetch(`/api/class-diary/admin/qr/${encodeURIComponent(classCode)}`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!resp.ok) throw new Error(i18n.t('adm.classDiary.qrLoadFailed'));
            const blob = await resp.blob();
            // 存儲 blob 供下載用
            img._qrBlob = blob;
            img.src = URL.createObjectURL(blob);
            img.style.display = 'block';
            if (loading) loading.style.display = 'none';
            if (actions) actions.style.display = 'flex';
        } catch (error) {
            if (loading) loading.innerHTML = '<span style="color:red;font-size:0.8rem;">' + i18n.t('adm.classDiary.generateFailed') + '</span>';
        }
    },

    downloadQR(classCode) {
        const img = document.getElementById(`qr-${classCode}`);
        if (!img || !img._qrBlob) {
            alert(i18n.t('adm.classDiary.generateQRFirst'));
            return;
        }
        const url = URL.createObjectURL(img._qrBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR_${classCode}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },

    async batchDownloadQR() {
        try {
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const resp = await fetch('/api/class-diary/admin/qr/batch', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || i18n.t('adm.classDiary.downloadFailed'));
            }
            const blob = new Blob([await resp.arrayBuffer()], { type: 'application/zip' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'class_diary_qrcodes.zip';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
            alert(i18n.t('adm.classDiary.batchDownloadFailed', {msg: error.message}));
        }
    },

    async loadTeachersForReviewer() {
        try {
            const data = await AdminAPI.fetchWithAuth('/api/admin/users?role=teacher');
            const users = data.data || data.users || [];
            const select = document.getElementById('reviewerSelect');
            select.innerHTML = `<option value="">${i18n.t('adm.classDiary.selectTeacher')}</option>`;
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.username;
                opt.textContent = `${u.display_name || u.username} (${u.username})`;
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('載入教師列表失敗:', error);
        }
    },

    async loadReviewers() {
        const container = document.getElementById('reviewersList');
        try {
            const data = await AdminAPI.fetchWithAuth('/api/class-diary/admin/reviewers');
            const reviewers = data.data || [];

            if (reviewers.length === 0) {
                container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;">' + i18n.t('adm.classDiary.noReviewers') + '</p>';
                return;
            }

            container.innerHTML = reviewers.map(r => `
                <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px;">
                    <div>
                        <span style="font-weight:600;">${r.username}</span>
                        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:8px;">${i18n.t('adm.classDiary.grantedBy', {name: r.granted_by})}</span>
                    </div>
                    <button onclick="AdminApp.removeReviewer('${r.username}')"
                        style="padding:4px 10px;border:1px solid #EF4444;border-radius:6px;background:#fff;color:#EF4444;font-size:0.8rem;cursor:pointer;">
                        ${i18n.t('adm.classDiary.removeBtn')}
                    </button>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<p style="color:red;">' + i18n.t('adm.appCfg.loadFailedPrefix') + error.message + '</p>';
        }
    },

    async addReviewer() {
        const select = document.getElementById('reviewerSelect');
        const username = select.value;
        if (!username) {
            alert(i18n.t('adm.classDiary.selectTeacherFirst'));
            return;
        }
        try {
            await AdminAPI.fetchWithAuth('/api/class-diary/admin/reviewers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            select.value = '';
            await this.loadReviewers();
        } catch (error) {
            alert(i18n.t('adm.classDiary.addFailed2', {msg: error.message}));
        }
    },

    async removeReviewer(username) {
        if (!confirm(i18n.t('adm.classDiary.removeConfirm', {name: username}))) return;
        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/reviewers/${username}`, {
                method: 'DELETE',
            });
            await this.loadReviewers();
        } catch (error) {
            alert(i18n.t('adm.classDiary.removeFailed', {msg: error.message}));
        }
    },

    /* ============================================================
       每日報告接收人管理
       ============================================================ */

    async loadTeachersForReportRecipient() {
        try {
            const select = document.getElementById('reportRecipientSelect');
            if (!select) return;
            select.innerHTML = `<option value="">${i18n.t('adm.classDiary.selectTeacher')}</option>`;
            this._teacherList.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.username;
                opt.textContent = `${u.display_name || u.username} (${u.username})`;
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('載入教師列表失敗:', error);
        }
    },

    async loadReportRecipients() {
        const container = document.getElementById('reportRecipientsList');
        if (!container) return;
        try {
            const data = await AdminAPI.fetchWithAuth('/api/class-diary/admin/report-recipients');
            const recipients = data.data || [];

            if (recipients.length === 0) {
                container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;">' + i18n.t('adm.classDiary.noRecipients') + '</p>';
                return;
            }

            container.innerHTML = recipients.map(r => `
                <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px;">
                    <div>
                        <span style="font-weight:600;">${r.username}</span>
                        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:8px;">${i18n.t('adm.classDiary.grantedBy', {name: r.granted_by})}</span>
                    </div>
                    <button onclick="AdminApp.removeReportRecipient('${r.username}')"
                        style="padding:4px 10px;border:1px solid #EF4444;border-radius:6px;background:#fff;color:#EF4444;font-size:0.8rem;cursor:pointer;">
                        ${i18n.t('adm.classDiary.removeBtn')}
                    </button>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<p style="color:red;">' + i18n.t('adm.appCfg.loadFailedPrefix') + error.message + '</p>';
        }
    },

    async addReportRecipient() {
        const select = document.getElementById('reportRecipientSelect');
        const username = select.value;
        if (!username) {
            alert(i18n.t('adm.classDiary.selectTeacherFirst'));
            return;
        }
        try {
            await AdminAPI.fetchWithAuth('/api/class-diary/admin/report-recipients', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username }),
            });
            select.value = '';
            await this.loadReportRecipients();
        } catch (error) {
            alert(i18n.t('adm.classDiary.addFailed2', {msg: error.message}));
        }
    },

    async removeReportRecipient(username) {
        if (!confirm(i18n.t('adm.classDiary.removeRecipientConfirm', {name: username}))) return;
        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/report-recipients/${username}`, {
                method: 'DELETE',
            });
            await this.loadReportRecipients();
        } catch (error) {
            alert(i18n.t('adm.classDiary.removeFailed', {msg: error.message}));
        }
    },

    async manualGenerateReport() {
        const statusEl = document.getElementById('reportGenStatus');
        if (statusEl) statusEl.innerHTML = AdminUI.icon('refresh', 'icon-sm', 'animation:spin 0.8s linear infinite') + ' ' + i18n.t('adm.classDiary.reportGenerating');

        try {
            const today = new Date().toISOString().split('T')[0];
            await AdminAPI.fetchWithAuth('/api/class-diary/admin/generate-report', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ report_date: today }),
            });
            if (statusEl) statusEl.innerHTML = AdminUI.icon('check-circle', 'icon-sm', 'stroke:var(--success)') + ' ' + i18n.t('adm.classDiary.reportStarted');
            // 10 秒後清除狀態提示
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 10000);
        } catch (error) {
            if (statusEl) statusEl.innerHTML = AdminUI.icon('warning', 'icon-sm', 'stroke:var(--danger)') + ' ' + i18n.t('adm.classDiary.reportFailed', {msg: error.message});
        }
    },

    /* ============================================================
       AI 調度監控
       ============================================================ */

    startAiMonitor() {
        if (this.state.aiMonitorTimer) clearInterval(this.state.aiMonitorTimer);
        this.refreshAiMonitor();
        this.state.aiMonitorTimer = setInterval(() => this.refreshAiMonitor(), 3000);
    },

    async refreshAiMonitor() {
        if (this.state.aiMonitorFetching) return;
        this.state.aiMonitorFetching = true;
        const seq = ++this.state.aiMonitorReqSeq;

        try {
            const resp = await AdminAPI.fetchWithAuth('/api/admin/ai-monitor');
            if (seq !== this.state.aiMonitorReqSeq) return;
            const d = resp.data || resp;
            this.state.aiMonitorLastData = d;
            this.renderAiMonitor(d, false);
        } catch (e) {
            if (seq !== this.state.aiMonitorReqSeq) return;
            this.renderAiMonitor(this.state.aiMonitorLastData, true, e.message);
        } finally {
            this.state.aiMonitorFetching = false;
        }
    },

    renderAiMonitor(data, apiError, errorMsg) {
        // Timestamp
        const ts = document.getElementById('aiMonitorTimestamp');
        if (ts) ts.textContent = i18n.t('adm.aiMon.updateTime') + new Date().toLocaleTimeString();

        // If no data at all
        if (!data && apiError) {
            this._setAiCongestion('DEGRADED', i18n.t('adm.aiMon.apiDisconnected'), errorMsg);
            return;
        }
        if (!data) return;

        const gate = data.ai_gate || {};
        const ollama = data.ollama || {};
        const server = data.server || {};
        const config = data.config || {};

        // --- Congestion level ---
        if (apiError) {
            this._setAiCongestion('DEGRADED', i18n.t('adm.aiMon.apiDisconnected'), errorMsg);
        } else if (!ollama.connected) {
            this._setAiCongestion('DEGRADED', i18n.t('adm.aiMon.ollamaDisconnected'), ollama.last_error || '');
        } else {
            const queued = gate.queued || 0;
            const used = gate.capacity_used || 0;
            const total = gate.capacity_total || 1;
            const pct = used / total * 100;

            if (queued >= 10 || pct >= 90) {
                this._setAiCongestion('CONGESTED', i18n.t('adm.aiMon.capacityQueued', {pct: Math.round(pct), queued}));
            } else if (queued >= 5 || pct >= 60) {
                this._setAiCongestion('BUSY', i18n.t('adm.aiMon.capacityQueued', {pct: Math.round(pct), queued}));
            } else if ((gate.running || 0) > 0) {
                this._setAiCongestion('NORMAL', i18n.t('adm.aiMon.capacityQueued', {pct: Math.round(pct), queued}));
            } else {
                this._setAiCongestion('IDLE', i18n.t('adm.aiMon.idle'));
            }
        }

        // --- Ollama status ---
        const connEl = document.getElementById('aiOllamaConn');
        const rtEl = document.getElementById('aiOllamaRuntime');
        if (connEl) {
            if (ollama.connected) {
                connEl.innerHTML = `<span style="color:var(--success);">${i18n.t('adm.aiMon.connected')}</span>`;
            } else {
                connEl.innerHTML = `<span style="color:var(--danger);">${i18n.t('adm.aiMon.disconnected')}</span>`;
            }
        }
        if (rtEl) {
            if (ollama.runtime_available) {
                const models = (ollama.running_models || []).map(m => m.name).join(', ') || i18n.t('adm.aiMon.noModel');
                rtEl.innerHTML = `<span style="color:var(--success);">${models}</span>`;
            } else {
                rtEl.innerHTML = `<span style="color:var(--text-secondary);">${i18n.t('adm.aiMon.unavailable')}</span>`;
            }
        }

        // --- Capacity ---
        const used = gate.capacity_used || 0;
        const total = gate.capacity_total || 1;
        const pct = Math.round(used / total * 100);
        const capText = document.getElementById('aiCapacityText');
        const capBar = document.getElementById('aiCapacityBar');
        if (capText) capText.textContent = `${used} / ${total}`;
        if (capBar) {
            capBar.style.width = pct + '%';
            capBar.style.background = pct >= 90 ? 'var(--danger)' : pct >= 60 ? 'var(--warning)' : 'var(--success)';
        }

        // --- Queued ---
        const qEl = document.getElementById('aiQueuedCount');
        if (qEl) {
            const q = gate.queued || 0;
            qEl.textContent = q;
            qEl.style.color = q >= 10 ? 'var(--danger)' : q >= 5 ? 'var(--warning)' : 'var(--text)';
        }

        // --- Completed ---
        const cEl = document.getElementById('aiCompletedCount');
        if (cEl) cEl.textContent = gate.completed || 0;

        // --- Queue details ---
        const qdEl = document.getElementById('aiQueueDetails');
        if (qdEl) {
            const qd = gate.queue_details || {};
            const keys = Object.keys(qd);
            if (keys.length === 0 || keys.every(k => (qd[k].depth || 0) === 0)) {
                qdEl.textContent = i18n.t('adm.aiMon.noQueueTasks');
            } else {
                let html = '';
                keys.forEach(pri => {
                    const layer = qd[pri];
                    if (layer.depth > 0) {
                        html += `<div style="margin-bottom:8px;"><strong>${pri}</strong> (${layer.depth})</div>`;
                        (layer.entries || []).forEach(e => {
                            html += `<div style="padding:2px 0 2px 12px;">${e.task_name} <span style="color:var(--text-secondary);">w=${e.weight}, ${i18n.t('adm.aiMon.waitSeconds', {sec: e.wait_seconds})}</span></div>`;
                        });
                    }
                });
                qdEl.innerHTML = html;
            }
        }

        // --- Running details ---
        const rdEl = document.getElementById('aiRunningDetails');
        if (rdEl) {
            const rd = gate.running_details || [];
            if (rd.length === 0) {
                rdEl.textContent = i18n.t('adm.aiMon.noRunningTasks');
            } else {
                let html = `<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:4px 0;font-weight:600;">${i18n.t('adm.aiMon.thTask')}</th><th style="text-align:center;padding:4px;font-weight:600;">${i18n.t('adm.aiMon.thPriority')}</th><th style="text-align:center;padding:4px;font-weight:600;">${i18n.t('adm.aiMon.thWeight')}</th><th style="text-align:right;padding:4px;font-weight:600;">${i18n.t('adm.aiMon.thDuration')}</th><th style="text-align:center;padding:4px;font-weight:600;">${i18n.t('adm.aiMon.thAction')}</th></tr></thead><tbody>`;
                rd.forEach(t => {
                    const dur = t.running_seconds || 0;
                    const durColor = dur > 30 ? 'var(--danger)' : dur > 10 ? 'var(--warning)' : 'inherit';
                    const staleWarning = dur > 1800 ? ' background:rgba(220,53,69,0.08);' : '';
                    html += `<tr style="${staleWarning}"><td style="padding:4px 0;">${t.task_name}</td><td style="text-align:center;padding:4px;">${t.priority}</td><td style="text-align:center;padding:4px;">${t.weight}</td><td style="text-align:right;padding:4px;color:${durColor};font-weight:600;">${dur}s</td><td style="text-align:center;padding:4px;"><button onclick="AdminApp._forceReleaseTask(${t.id},'${t.task_name}')" title="${i18n.t('adm.aiMon.releaseTitle')}" style="padding:2px 8px;font-size:0.78em;border:1px solid var(--danger);color:var(--danger);background:transparent;border-radius:4px;cursor:pointer;">${i18n.t('adm.aiMon.releaseTask')}</button></td></tr>`;
                });
                html += '</tbody></table>';
                rdEl.innerHTML = html;
            }
        }

        // --- Server resources ---
        if (server && !server.error) {
            const cpuBar = document.getElementById('aiCpuBar');
            const cpuText = document.getElementById('aiCpuText');
            const memBar = document.getElementById('aiMemBar');
            const memText = document.getElementById('aiMemText');
            if (cpuBar) cpuBar.style.width = (server.cpu_percent || 0) + '%';
            if (cpuText) cpuText.textContent = (server.cpu_percent || 0).toFixed(1) + '%';
            if (memBar) memBar.style.width = (server.memory_percent || 0) + '%';
            if (memText) memText.textContent = `${server.memory_used_gb || 0}/${server.memory_total_gb || 0} GB (${(server.memory_percent || 0).toFixed(0)}%)`;
        }
        const modelEl = document.getElementById('aiModelName');
        const urlEl = document.getElementById('aiBaseUrl');
        const latEl = document.getElementById('aiOllamaLatency');
        if (modelEl) modelEl.textContent = config.llm_local_model || '--';
        if (urlEl) urlEl.textContent = config.llm_local_base_url || '--';
        if (latEl) latEl.textContent = ollama.latency_ms != null ? ollama.latency_ms + ' ms' : '--';

        // --- History stats ---
        const el = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        el('aiStatCompleted', gate.completed || 0);
        el('aiStatFailed', gate.failed || 0);
        el('aiStatRejected', gate.rejected || 0);
        const up = gate.uptime_seconds || 0;
        const h = Math.floor(up / 3600);
        const m = Math.floor((up % 3600) / 60);
        el('aiStatUptime', h > 0 ? `${h}h ${m}m` : `${m}m`);
    },

    async _forceReleaseTask(taskId, taskName) {
        if (!confirm(i18n.t('adm.aiMon.releaseConfirm', {name: taskName}))) return;
        try {
            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            const resp = await fetch('/api/admin/ai-task/force-release', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + (token || ''),
                },
                body: JSON.stringify({ task_id: taskId }),
            });
            const data = await resp.json();
            if (data.success) {
                if (typeof showToast === 'function') showToast(i18n.t('adm.aiMon.releaseSuccess', {name: taskName}), 'success');
                AdminApp.refreshAiMonitor();
            } else {
                if (typeof showToast === 'function') showToast(i18n.t('adm.aiMon.releaseFailed', {msg: data.message || i18n.t('adm.aiMon.unknownError')}), 'error');
            }
        } catch (e) {
            if (typeof showToast === 'function') showToast(i18n.t('adm.aiMon.requestFailed', {msg: e.message}), 'error');
        }
    },

    _setAiCongestion(level, text, sub) {
        const banner = document.getElementById('aiCongestionBanner');
        if (!banner) return;
        const styles = {
            IDLE:      { bg: '#E8F5EC', color: '#006633', label: i18n.t('adm.aiMon.congestionIdle') },
            NORMAL:    { bg: '#E3F2FD', color: '#1565C0', label: i18n.t('adm.aiMon.congestionNormal') },
            BUSY:      { bg: '#FFF3E0', color: '#E65100', label: i18n.t('adm.aiMon.congestionBusy') },
            CONGESTED: { bg: '#FFEBEE', color: '#C62828', label: i18n.t('adm.aiMon.congestionCongested') },
            DEGRADED:  { bg: '#F5F5F5', color: '#616161', label: i18n.t('adm.aiMon.congestionDegraded') },
        };
        const s = styles[level] || styles.DEGRADED;
        banner.style.background = s.bg;
        banner.style.color = s.color;
        let html = `${s.label}`;
        if (text) html += ` — ${text}`;
        if (sub) html += `<div style="font-size:0.8em;font-weight:400;margin-top:4px;">${sub}</div>`;
        banner.innerHTML = html;
    }
};

/* ============================================================
   API Token 使用量監控
   ============================================================ */

let _aiUsageChartInstance = null;

async function loadAiUsageStats() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        // 並行載入 summary + daily + recent + by-user
        const [summaryRes, dailyRes, recentRes] = await Promise.all([
            fetch('/api/admin/ai-usage/summary', { headers }).then(r => r.json()),
            fetch('/api/admin/ai-usage/daily?days=30', { headers }).then(r => r.json()),
            fetch('/api/admin/ai-usage/recent?limit=30', { headers }).then(r => r.json()),
        ]);
        // 同時觸發用戶排行 + 本地模型使用量（不阻塞主流程）
        loadAiUsageByUser();
        loadLocalUsageStats();

        // 渲染 summary 卡片
        if (summaryRes.success) {
            const d = summaryRes.data;
            document.getElementById('aiUsageTotalTokens').textContent = (d.total_tokens || 0).toLocaleString();
            document.getElementById('aiUsagePromptTokens').textContent = (d.prompt_tokens || 0).toLocaleString();
            document.getElementById('aiUsageCompletionTokens').textContent = (d.completion_tokens || 0).toLocaleString();
            document.getElementById('aiUsageCallCount').textContent = (d.call_count || 0).toLocaleString();
            document.getElementById('aiUsageCost').textContent = '$' + (d.estimated_cost_usd || 0).toFixed(4);
        }

        // 渲染 Chart.js 折線圖
        if (dailyRes.success && dailyRes.data) {
            renderAiUsageChart(dailyRes.data);
        }

        // 渲染最近調用記錄
        if (recentRes.success && recentRes.data) {
            renderAiUsageRecent(recentRes.data);
        }
    } catch (err) {
        console.error('載入 AI usage 失敗:', err);
    }
}

function renderAiUsageChart(dailyData) {
    const canvas = document.getElementById('aiUsageChart');
    if (!canvas) return;

    // 銷毀舊圖表
    if (_aiUsageChartInstance) {
        _aiUsageChartInstance.destroy();
        _aiUsageChartInstance = null;
    }

    if (!dailyData.length) {
        canvas.parentElement.querySelector('h4').textContent = i18n.t('adm.aiUsage.noChartData');
        return;
    }

    const labels = dailyData.map(d => d.date);
    const totals = dailyData.map(d => d.total_tokens || 0);
    const prompts = dailyData.map(d => d.prompt_tokens || 0);
    const completions = dailyData.map(d => d.completion_tokens || 0);

    _aiUsageChartInstance = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: i18n.t('adm.aiUsage.totalTokensLabel'),
                    data: totals,
                    borderColor: '#006633',
                    backgroundColor: 'rgba(0, 102, 51, 0.1)',
                    fill: true,
                    tension: 0.3,
                    borderWidth: 2,
                    pointRadius: 2,
                },
                {
                    label: 'Input',
                    data: prompts,
                    borderColor: '#4facfe',
                    borderWidth: 1.5,
                    tension: 0.3,
                    pointRadius: 1,
                    borderDash: [4, 2],
                },
                {
                    label: 'Output',
                    data: completions,
                    borderColor: '#f093fb',
                    borderWidth: 1.5,
                    tension: 0.3,
                    pointRadius: 1,
                    borderDash: [4, 2],
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { grid: { display: false } },
                y: {
                    beginAtZero: true,
                    ticks: { callback: v => v >= 1000 ? (v / 1000).toFixed(0) + 'K' : v },
                },
            },
            plugins: {
                legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
                tooltip: {
                    callbacks: {
                        label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} tokens`,
                    },
                },
            },
        },
    });
}

async function loadAiUsageByUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };
    const days = document.getElementById('aiUsageByUserDays')?.value || 7;
    try {
        const res = await fetch(`/api/admin/ai-usage/by-user?days=${days}`, { headers }).then(r => r.json());
        if (res.success && res.data) {
            renderAiUsageByUser(res.data);
        }
    } catch (err) {
        console.error('載入用戶使用量排行失敗:', err);
    }
}

function renderAiUsageByUser(records) {
    const container = document.getElementById('aiUsageByUser');
    if (!container) return;
    if (!records.length) {
        container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);">' + i18n.t('adm.aiUsage.noData') + '</div>';
        return;
    }

    const ROLE_LABELS = { student: i18n.t('adm.app.roleStudent'), teacher: i18n.t('adm.app.roleTeacher'), admin: i18n.t('adm.app.roleAdmin') };
    const maxTokens = records[0]?.total_tokens || 1;

    let html = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);font-size:0.85em;color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:6px 4px;width:8%;">#</th>';
    html += `<th style="text-align:left;padding:6px 4px;width:22%;">${i18n.t('adm.aiUsage.userCol')}</th>`;
    html += `<th style="text-align:left;padding:6px 4px;width:12%;">${i18n.t('adm.aiUsage.roleCol')}</th>`;
    html += '<th style="text-align:right;padding:6px 4px;width:18%;">Tokens</th>';
    html += `<th style="text-align:right;padding:6px 4px;width:12%;">${i18n.t('adm.aiUsage.callsCol')}</th>`;
    html += `<th style="text-align:right;padding:6px 4px;width:13%;">${i18n.t('adm.aiUsage.costCol')}</th>`;
    html += '<th style="text-align:left;padding:6px 4px;width:15%;"></th>';
    html += '</tr></thead><tbody>';

    records.forEach((r, i) => {
        const name = r.display_name || r.username || i18n.t('adm.aiUsage.unknown');
        const role = ROLE_LABELS[r.role] || r.role || '--';
        const tokens = (r.total_tokens || 0).toLocaleString();
        const calls = (r.call_count || 0).toLocaleString();
        const cost = '$' + (r.estimated_cost_usd || 0).toFixed(4);
        const pct = Math.round((r.total_tokens || 0) / maxTokens * 100);
        const barColor = i === 0 ? 'var(--brand)' : i < 3 ? '#4facfe' : 'var(--border)';

        html += `<tr style="border-bottom:1px solid var(--border-light);">`;
        html += `<td style="padding:6px 4px;font-weight:600;color:${i < 3 ? 'var(--brand)' : 'var(--text-tertiary)'};">${i + 1}</td>`;
        html += `<td style="padding:6px 4px;font-weight:500;">${name}</td>`;
        html += `<td style="padding:6px 4px;">${role}</td>`;
        html += `<td style="padding:6px 4px;text-align:right;font-weight:600;">${tokens}</td>`;
        html += `<td style="padding:6px 4px;text-align:right;">${calls}</td>`;
        html += `<td style="padding:6px 4px;text-align:right;">${cost}</td>`;
        html += `<td style="padding:6px 4px;"><div style="height:6px;border-radius:3px;background:var(--bg-page);"><div style="height:100%;width:${pct}%;border-radius:3px;background:${barColor};"></div></div></td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}

function renderAiUsageRecent(records) {
    const container = document.getElementById('aiUsageRecent');
    if (!records.length) {
        container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);">' + i18n.t('adm.aiUsage.noRecent') + '</div>';
        return;
    }

    const PURPOSE_LABELS = {
        game_gen: i18n.t('adm.aiUsage.purposeGameGen'),
        exam_gen: i18n.t('adm.aiUsage.purposeExamGen'),
        practice_gen: i18n.t('adm.aiUsage.purposePracticeGen'),
        analysis: i18n.t('adm.aiUsage.purposeAnalysis'),
        chat: i18n.t('adm.aiUsage.purposeChat'),
    };

    let html = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);font-size:0.85em;color:var(--text-secondary);">';
    html += `<th style="text-align:left;padding:6px 4px;width:20%;">${i18n.t('adm.aiUsage.thTime')}</th>`;
    html += `<th style="text-align:left;padding:6px 4px;width:16%;">${i18n.t('adm.aiUsage.thUser')}</th>`;
    html += `<th style="text-align:left;padding:6px 4px;width:18%;">${i18n.t('adm.aiUsage.thPurpose')}</th>`;
    html += `<th style="text-align:left;padding:6px 4px;width:16%;">${i18n.t('adm.aiUsage.thModel')}</th>`;
    html += '<th style="text-align:right;padding:6px 4px;width:16%;">Tokens</th>';
    html += `<th style="text-align:right;padding:6px 4px;width:12%;">${i18n.t('adm.aiUsage.thDuration')}</th>`;
    html += '</tr></thead><tbody>';

    records.forEach(r => {
        const time = r.created_at ? r.created_at.replace('T', ' ').substring(5, 16) : '--';
        const user = r.display_name || r.username || '--';
        const purpose = PURPOSE_LABELS[r.purpose] || r.purpose || '--';
        const model = (r.model || '--').replace('deepseek-', '');
        const tokens = (r.total_tokens || 0).toLocaleString();
        const duration = r.duration_ms ? (r.duration_ms / 1000).toFixed(1) + 's' : '--';

        html += `<tr style="border-bottom:1px solid var(--border-light);">`;
        html += `<td style="padding:6px 4px;">${time}</td>`;
        html += `<td style="padding:6px 4px;">${user}</td>`;
        html += `<td style="padding:6px 4px;">${purpose}</td>`;
        html += `<td style="padding:6px 4px;">${model}</td>`;
        html += `<td style="padding:6px 4px;text-align:right;font-weight:600;">${tokens}</td>`;
        html += `<td style="padding:6px 4px;text-align:right;">${duration}</td>`;
        html += `</tr>`;
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}


/* ============================================================
   本地模型（Ollama）使用量
   ============================================================ */

async function loadLocalUsageStats() {
    const token = localStorage.getItem('auth_token');
    if (!token) return;
    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        const [summaryRes, recentRes] = await Promise.all([
            fetch('/api/admin/ai-usage/local/summary', { headers }).then(r => r.json()),
            fetch('/api/admin/ai-usage/local/recent?limit=30', { headers }).then(r => r.json()),
        ]);

        // 渲染汇总卡片
        if (summaryRes.success) {
            const d = summaryRes.data;
            const el = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
            el('localUsageCallCount', (d.call_count || 0).toLocaleString());
            el('localUsageTotalTokens', (d.total_tokens || 0).toLocaleString());
            const avgMs = d.avg_duration_ms || 0;
            el('localUsageAvgDuration', avgMs > 1000 ? (avgMs / 1000).toFixed(1) + 's' : avgMs + 'ms');
        }

        // 渲染最近调用表
        if (recentRes.success && recentRes.data) {
            renderLocalUsageRecent(recentRes.data);
        }
    } catch (err) {
        console.error('载入本地模型使用量失败:', err);
    }
}

function renderLocalUsageRecent(records) {
    const container = document.getElementById('localUsageRecent');
    if (!container) return;
    if (!records.length) {
        container.innerHTML = '<div style="text-align:center;padding:16px;color:var(--text-tertiary);">暂无本地模型调用记录</div>';
        return;
    }

    const PURPOSE_LABELS = {
        chat: 'AI 问答',
        pet_chat: '宠物聊天',
        moderation: '内容审核',
        practice_gen: '练习生成',
        exam_gen: '试卷生成',
    };

    let html = '<table style="width:100%;border-collapse:collapse;table-layout:fixed;">';
    html += '<thead><tr style="border-bottom:1px solid var(--border);font-size:0.85em;color:var(--text-secondary);">';
    html += '<th style="text-align:left;padding:6px 4px;width:18%;">时间</th>';
    html += '<th style="text-align:left;padding:6px 4px;width:16%;">用户</th>';
    html += '<th style="text-align:left;padding:6px 4px;width:16%;">用途</th>';
    html += '<th style="text-align:left;padding:6px 4px;width:16%;">模型</th>';
    html += '<th style="text-align:right;padding:6px 4px;width:14%;">Tokens</th>';
    html += '<th style="text-align:right;padding:6px 4px;width:10%;">输入</th>';
    html += '<th style="text-align:right;padding:6px 4px;width:10%;">输出</th>';
    html += '</tr></thead><tbody>';

    records.forEach(function(r) {
        var time = r.created_at || '--';
        var user = r.display_name || r.username || '--';
        var purpose = PURPOSE_LABELS[r.purpose] || r.purpose || '--';
        var model = (r.model || '--');
        var tokens = (r.total_tokens || 0).toLocaleString();
        var input = (r.prompt_tokens || 0).toLocaleString();
        var output = (r.completion_tokens || 0).toLocaleString();

        html += '<tr style="border-bottom:1px solid var(--border-light);">';
        html += '<td style="padding:6px 4px;">' + time + '</td>';
        html += '<td style="padding:6px 4px;">' + user + '</td>';
        html += '<td style="padding:6px 4px;">' + purpose + '</td>';
        html += '<td style="padding:6px 4px;">' + model + '</td>';
        html += '<td style="padding:6px 4px;text-align:right;font-weight:600;">' + tokens + '</td>';
        html += '<td style="padding:6px 4px;text-align:right;color:var(--text-secondary);">' + input + '</td>';
        html += '<td style="padding:6px 4px;text-align:right;color:var(--text-secondary);">' + output + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;
}


/* ============================================================
   BOOTSTRAP
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => AdminApp.init());

// AI 監控：頁面可見性管理
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        if (AdminApp.state.aiMonitorTimer) {
            clearInterval(AdminApp.state.aiMonitorTimer);
            AdminApp.state.aiMonitorTimer = null;
        }
    } else {
        // 可見時：若仍在 aimonitor tab，立即刷新 + 恢復輪詢
        const pane = document.getElementById('aimonitor-tab');
        if (pane && pane.classList.contains('active')) {
            AdminApp.refreshAiMonitor();
            AdminApp.state.aiMonitorTimer = setInterval(() => AdminApp.refreshAiMonitor(), 3000);
        }
    }
});
window.addEventListener('beforeunload', () => {
    if (AdminApp.state.aiMonitorTimer) clearInterval(AdminApp.state.aiMonitorTimer);
});


/* ============================================================
   LLM 雲端配置 — 系統設定 Tab
   ============================================================ */

async function loadCloudStatus() {
    const statusEl = document.getElementById('cloudConfigStatus');
    const modelEl = document.getElementById('cloudApiModel');
    try {
        const data = await AdminAPI.fetchWithAuth('/api/exam-creator/cloud-status');
        const info = data.data || data;
        if (modelEl) modelEl.value = info.model || 'deepseek-reasoner';
        if (statusEl) {
            if (info.available) {
                statusEl.textContent = i18n.t('adm.cloud.apiKeyConfigured');
                statusEl.style.color = 'var(--success, #22c55e)';
            } else {
                const reasons = {
                    missing_api_key: i18n.t('adm.cloud.missingApiKey'),
                    config_error: i18n.t('adm.cloud.configError'),
                };
                statusEl.textContent = reasons[info.reason] || i18n.t('adm.cloud.unavailable');
                statusEl.style.color = 'var(--warning, #f59e0b)';
            }
        }
    } catch (e) {
        if (statusEl) {
            statusEl.textContent = i18n.t('adm.cloud.loadFailed');
            statusEl.style.color = 'var(--danger, #ef4444)';
        }
    }
}

function toggleApiKeyVisibility() {
    const input = document.getElementById('cloudApiKey');
    if (!input) return;
    input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveCloudConfig() {
    const msgEl = document.getElementById('cloudConfigMsg');
    const keyInput = document.getElementById('cloudApiKey');
    const modelSelect = document.getElementById('cloudApiModel');
    const apiKey = keyInput ? keyInput.value.trim() : '';
    const apiModel = modelSelect ? modelSelect.value : '';

    const payload = {};
    if (apiKey) payload.api_key = apiKey;
    if (apiModel) payload.api_model = apiModel;

    if (!apiKey && !apiModel) {
        showCloudMsg(i18n.t('adm.cloud.enterKeyOrModel'), 'warning');
        return;
    }

    try {
        const data = await AdminAPI.fetchWithAuth('/api/exam-creator/cloud-config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });
        showCloudMsg(i18n.t('adm.cloud.saved'), 'success');
        if (keyInput) keyInput.value = '';
        loadCloudStatus();
    } catch (e) {
        showCloudMsg(i18n.t('adm.cloud.saveFailedPrefix') + e.message, 'error');
    }
}

async function testCloudConnection() {
    showCloudMsg(i18n.t('adm.cloud.testing'), 'info');
    try {
        const data = await AdminAPI.fetchWithAuth('/api/exam-creator/cloud-status');
        const info = data.data || data;
        if (info.available) {
            showCloudMsg(i18n.t('adm.cloud.testOK'), 'success');
        } else {
            showCloudMsg(info.reason === 'missing_api_key' ? i18n.t('adm.cloud.testFailedNoKey') : i18n.t('adm.cloud.testFailedPrefix') + info.reason, 'warning');
        }
    } catch (e) {
        showCloudMsg(i18n.t('adm.cloud.testError', {msg: e.message}), 'error');
    }
}

function showCloudMsg(text, type) {
    const el = document.getElementById('cloudConfigMsg');
    if (!el) return;
    const colors = {
        success: 'var(--success, #22c55e)',
        warning: 'var(--warning, #f59e0b)',
        error: 'var(--danger, #ef4444)',
        info: 'var(--text-secondary, #64748b)',
    };
    el.textContent = text;
    el.style.color = colors[type] || colors.info;
    el.style.display = 'block';
    if (type !== 'info') {
        setTimeout(() => { el.style.display = 'none'; }, 5000);
    }
}
