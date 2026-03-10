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
            throw new Error(err.detail || err.error?.message || `請求失敗 (${resp.status})`);
        }
        return resp.json();
    },

    /* ---------- 學科 ---------- */
    async fetchSubjects() {
        const resp = await fetch('/api/admin/subjects', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入學科失敗');
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
            throw new Error(err.detail || '添加失敗');
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
            throw new Error(err.detail || '更新失敗');
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
            throw new Error(err.detail || '刪除失敗');
        }
        return resp.json();
    },

    /* ---------- 統計 ---------- */
    async fetchStatistics() {
        const resp = await fetch('/api/admin/statistics', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入統計失敗');
        return resp.json();
    },

    /* ---------- 知識庫 ---------- */
    async fetchKnowledgeStats() {
        const resp = await fetch('/api/admin/knowledge-stats', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入知識庫統計失敗');
        return resp.json();
    },

    async fetchDocuments(subject) {
        const resp = await fetch(`/api/admin/documents/${subject}`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入文檔失敗');
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
        if (!resp.ok) throw new Error('刪除文檔失敗');
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
            throw new Error(err.detail || '保存失敗');
        }
        return resp.json();
    },

    /* ---------- 封禁管理 ---------- */
    async fetchBlockedAccounts() {
        const resp = await fetch('/api/admin/blocked-accounts', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入封鎖列表失敗');
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
            throw new Error(err.message || '解除封鎖失敗');
        }
        return resp.json();
    },

    /* ---------- 用戶 ---------- */
    async fetchUsers() {
        const resp = await fetch('/api/admin/users', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入用戶失敗');
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
            throw new Error(err.detail || '添加失敗');
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
            throw new Error(err.detail || '更新失敗');
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
            throw new Error(err.detail || '刪除失敗');
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
            throw new Error(err.detail || '重置失敗');
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
            throw new Error(err.detail || '批量添加失敗');
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
        if (!resp.ok) throw new Error('下載模板失敗');
        return resp.blob();
    },

    /* ---------- 學生分析 ---------- */
    async fetchStudentOverview(studentId) {
        const resp = await fetch(`/api/teacher/student/${studentId}/overview`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('获取學生概览失敗');
        return resp.json();
    },

    async fetchStudentAnalysis(studentId, subject) {
        const resp = await fetch(`/api/teacher/student/${studentId}/analysis/${subject}`, {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('获取分析失敗');
        return resp.json();
    },

    async fetchStudentsSummary() {
        const resp = await fetch('/api/teacher/students/summary', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('網絡錯誤');
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
        if (!resp.ok) throw new Error('匯出失敗');
        return resp.blob();
    },

    /* ---------- 通告範本 ---------- */
    async fetchNoticeTemplates() {
        const resp = await fetch('/api/admin/notice/templates', {
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('載入範本失敗');
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
        if (!resp.ok) throw new Error('載入失敗');
        return resp.json();
    },

    async saveApps(modules) {
        const resp = await fetch('/api/admin/apps', {
            method: 'PUT',
            headers: { ...AuthModule.getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ modules })
        });
        if (!resp.ok) throw new Error('保存失敗');
        return resp.json();
    },

    async resetApps() {
        const resp = await fetch('/api/admin/apps/reset', {
            method: 'POST',
            headers: AuthModule.getAuthHeaders()
        });
        if (!resp.ok) throw new Error('重置失敗');
        return resp.json();
    }
};


/* ============================================================
   UI — DOM 渲染 / 通知
   ============================================================ */

const AdminUI = {

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
            'low': '低风险',
            'medium': '中风险',
            'high': '高风险',
            'unknown': '未评估'
        };
        return riskTexts[riskLevel] || '未知';
    },

    getRiskDescription(riskLevel) {
        const descriptions = {
            'low': '學生學習狀態良好，保持当前學習节奏即可',
            'medium': '學生需要适当关注，建议增加互动和辅导',
            'high': '學生需要重点关注，建议进行个别辅导和家长沟通'
        };
        return descriptions[riskLevel] || '评估中...';
    },

    /* ---------- 學科名稱 ---------- */
    getSubjectName(code) {
        return AdminApp.state.subjects[code]?.name || code;
    },

    /* ---------- 範本類型 ---------- */
    getTemplateTypeName(type) {
        const names = { 'activity': '活动通告范本', 'exam': '考试通告范本', 'meeting': '会议通告范本', 'general': '一般通告范本' };
        return names[type] || type;
    },

    getTemplateTypeIcon(type) {
        const icons = { 'activity': '🎪', 'exam': '📝', 'meeting': '👥', 'general': '📢' };
        return icons[type] || '📄';
    },

    getTemplateTypeColor(type) {
        const colors = { 'activity': '#006633', 'exam': '#FF9500', 'meeting': '#007AFF', 'general': '#34C759' };
        return colors[type] || 'var(--primary)';
    },

    /* ---------- 成功通知 ---------- */
    showSuccessNotification(message) {
        const notification = document.createElement('div');
        notification.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 15px 25px; background: var(--success); color: white; border-radius: 8px; box-shadow: var(--shadow); z-index: 9999; animation: slideIn 0.3s ease;';
        notification.textContent = '✅ ' + message;
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
            grid.innerHTML = '<div class="empty-state">暫無學科，請先添加</div>';
            const ts = document.getElementById('totalSubjects');
            if (ts) ts.textContent = 0;
            return;
        }

        for (const [code, subject] of entries) {
            const icon = (subject && (subject.icon || subject?.config?.icon)) || '📚';
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
                    <button class="icon-btn" title="編輯" data-action="editSubject" data-code="${code}">
                        ✏️
                    </button>
                    <button class="icon-btn btn-danger" title="刪除" data-action="deleteSubject" data-code="${code}">
                        🗑️
                    </button>
                </div>
                <div class="subject-icon">${icon}</div>
                <div class="subject-name">${name}</div>
                <div class="subject-code" style="color:#666; font-size:12px; margin-top:4px;">
                    代码: ${code}
                </div>
                ${desc ? `<div style="margin-top:8px; color:#777; font-size:13px; line-height:1.4;">${desc}</div>` : ''}
                <div style="margin-top:10px; padding-top:10px; border-top:1px solid var(--border); font-size:12px; color:var(--text-secondary);">
                    📄 ${docCount} 个文檔
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
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                    <p>该學科暫無文檔</p>
                </div>
            `;
            return;
        }

        let html = '<div style="display: grid; gap: 1rem;">';
        documents.forEach(doc => {
            const icon = { 'pdf': '📕', 'docx': '📘', 'txt': '📄', 'pptx': '📊', 'md': '📝' }[doc.type] || '📄';
            const size = this.formatFileSize(doc.size);
            const date = new Date(doc.modified).toLocaleDateString('zh-CN');

            html += `
                <div style="display: flex; align-items: center; padding: 1rem; background: var(--bg); border-radius: 8px; gap: 1rem;">
                    <div style="font-size: 2rem;">${icon}</div>
                    <div style="flex: 1;">
                        <div style="font-weight: bold; margin-bottom: 4px;">${doc.name}</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            ${size} • 上传于 ${date}
                        </div>
                    </div>
                    <button data-action="deleteDoc" data-subject="${subject}" data-name="${doc.name}"
                            style="padding: 8px 12px; background: var(--danger); color: white; border: none; border-radius: 6px; cursor: pointer;">
                        刪除
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

    /* ---------- 用戶表格渲染 ---------- */
    renderUsersTable(users) {
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            const roleDisplay = {
                'admin': '<span style="background: var(--color-error); color: white; padding: 2px 8px; border-radius: 12px;">管理员</span>',
                'teacher': '<span style="background: var(--color-warning); color: white; padding: 2px 8px; border-radius: 12px;">教師</span>',
                'student': '<span style="background: var(--color-success); color: white; padding: 2px 8px; border-radius: 12px;">學生</span>'
            }[user.role] || user.role;
            const statusDisplay = user.status === 'active' ? '<span style="color: green;">✓ 活躍</span>' : '<span style="color: red;">✗ 禁用</span>';
            let lastLogin = user.last_login || '从未登录';
            if (lastLogin !== '从未登录') {
                try { lastLogin = new Date(lastLogin).toLocaleString('zh-CN'); } catch (e) {}
            }
            tr.innerHTML = `
                <td style="padding: 12px;">${user.username}</td>
                <td style="padding: 12px;">${user.display_name || '-'}</td>
                <td style="padding: 12px;">${roleDisplay}</td>
                <td style="padding: 12px;">${user.class_name || '-'}</td>
                <td style="padding: 12px;">${statusDisplay}</td>
                <td style="padding: 12px;">${user.login_count || 0}</td>
                <td style="padding: 12px;">${lastLogin}</td>
                <td style="padding: 12px;">
                    <button data-action="editUser" data-username="${user.username}" style="padding: 4px 8px; background: var(--primary); color: white; border: none; border-radius: 4px; margin-right: 5px; cursor: pointer;">編輯</button>
                    <button data-action="resetPwd" data-username="${user.username}" style="padding: 4px 8px; background: var(--warning); color: white; border: none; border-radius: 4px; margin-right: 5px; cursor: pointer;">重置密碼</button>
                    <button data-action="deleteUser" data-username="${user.username}" style="padding: 4px 8px; background: var(--danger); color: white; border: none; border-radius: 4px; cursor: pointer;">刪除</button>
                </td>
            `;
            // bind action buttons
            tr.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const action = btn.dataset.action;
                    const uname = btn.dataset.username;
                    if (action === 'editUser') AdminApp.editUser(uname);
                    else if (action === 'resetPwd') AdminApp.resetUserPassword(uname);
                    else if (action === 'deleteUser') AdminApp.deleteUser(uname);
                });
            });
            tbody.appendChild(tr);
        });
    },

    /* ---------- 封禁列表渲染 ---------- */
    renderBlockedAccounts(data) {
        const container = document.getElementById('blockedAccountsContainer');
        if (!container) return;

        const blocked = data.data || data;
        const allEntries = [];

        (blocked.blocked_users || []).forEach(entry => {
            allEntries.push({
                type: 'user', typeLabel: '用戶', key: entry.username,
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
                type: 'ip_user', typeLabel: 'IP+用戶', key: entry.key,
                display: `${entry.ip} + ${entry.username}`, remaining: entry.remaining_seconds,
                blockedUntil: entry.blocked_until,
            });
        });

        if (allEntries.length === 0) {
            container.innerHTML = `
                <div style="text-align:center;padding:3rem;color:var(--text-secondary);background:white;border-radius:10px;">
                    <div style="font-size:3rem;margin-bottom:1rem;">🟢</div>
                    <p style="font-size:1.05rem;margin-bottom:0.5rem;">目前沒有活躍的臨時封鎖</p>
                    <p style="font-size:0.9rem;">此處僅顯示因登錄失敗觸發的臨時限制，已過期的封鎖不會顯示。</p>
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
            const timeStr = minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`;
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
                        解鎖
                    </button>
                </td>
            </tr>`;
        }).join('');

        container.innerHTML = `
            <div style="overflow-x:auto;">
            <table style="width:100%;background:white;border-radius:10px;border-collapse:collapse;">
                <thead style="background:var(--light, #f8f9fa);">
                    <tr>
                        <th style="padding:12px;text-align:left;">類型</th>
                        <th style="padding:12px;text-align:left;">封鎖對象</th>
                        <th style="padding:12px;text-align:left;">剩餘時間</th>
                        <th style="padding:12px;text-align:left;">到期時間</th>
                        <th style="padding:12px;text-align:left;">操作</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
            </div>
            <p style="margin-top:12px;font-size:0.85em;color:var(--text-secondary);">
                共 ${allEntries.length} 條活躍封鎖
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
            studentList.innerHTML = '<div class="empty-state"><p>沒有找到學生</p></div>';
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
                    <div class="student-class">${student.class_name || '未分班'}</div>
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
            container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">暫無摘要數據</div>';
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
                    <div class="preview-status">📖 预习狀態: ${student.preview_status || '—'}</div>
                    <div class="summary-footer">
                        <span class="class-info">班级: ${student.class_name || '—'}</span>
                        <span class="update-time">更新: ${this.formatDate(student.last_updated)}</span>
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
            container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; color: #999;">暫無學生數據</div>';
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
                            ${this.formatMarkdownText(student.overall_summary || '暫無摘要')}
                        </div>
                    </div>
                    <div class="preview-status">📖 预习狀態: ${student.preview_status || '—'}</div>
                    <div class="summary-footer">
                        <span class="class-info">班级: ${student.class_name || '—'}</span>
                        <span class="update-time">更新: ${this.formatDate(student.last_updated)}</span>
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
                    📚 ${this.getSubjectName(subject)} 科目詳細分析
                </h4>

                <div class="risk-badge risk-${report.risk_level}" style="margin-bottom: 15px;">
                    风险等级: ${this.getRiskText(report.risk_level)}
                </div>

                <div class="report-section">
                    <h4><span>📚</span> 知识掌握情况</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.knowledge_mastery_report || '暫無數據')}</div>
                </div>

                <div class="report-section">
                    <h4><span>🎨</span> 學習风格分析</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.learning_style_report || '暫無數據')}</div>
                </div>

                <div class="report-section">
                    <h4><span>⚠️</span> 學習困难分析</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.difficulty_report || '暫無數據')}</div>
                </div>

                <div class="report-section">
                    <h4><span>💭</span> 情感狀態分析</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.emotion_report || '暫無數據')}</div>
                </div>

                <div class="report-section">
                    <h4><span>📈</span> 學習进度评估</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.progress_report || '暫無數據')}</div>
                </div>

                <div class="report-section">
                    <h4><span>💡</span> 个性化學習建议</h4>
                    <div class="report-content formatted-text">${this.formatReportText(report.suggestion_report || '暫無數據')}</div>
                </div>

                ${report.teacher_attention_points ? `
                <div class="teacher-attention">
                    <h5>⚠️ 教師关注点</h5>
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
                <h3>${student.display_name || student.username} - 學習分析報告</h3>
                <div class="analysis-meta">
                    <span>🎓 班级：${student.class_name || '未分班'}</span>
                    <span>📅 分析日期：${new Date(report.analysis_date).toLocaleDateString('zh-CN')}</span>
                </div>
            </div>

            <div class="risk-assessment-card">
                <h4>⚠️ 风险等级评估</h4>
                <div class="risk-level-display ${riskClass}">
                    <span class="risk-badge">${riskLevelText}</span>
                    <div class="risk-description">${this.getRiskDescription(report.risk_level)}</div>
                </div>
            </div>

            <div class="ai-assessment">
                <h4>🎯 總体评估</h4>
                <div class="formatted-content">${this.formatMarkdownText(report.overall_assessment || '暫無评估')}</div>
            </div>

            <div class="report-section">
                <h4><span>📚</span> 知识掌握情况</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.knowledge_mastery_report || '暫無數據')}</div>
            </div>

            <div class="report-section">
                <h4><span>🎨</span> 學習风格分析</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.learning_style_report || '暫無數據')}</div>
            </div>

            <div class="report-section">
                <h4><span>🔧</span> 难点与挑战</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.difficulty_report || '暫無數據')}</div>
            </div>

            <div class="report-section">
                <h4><span>💭</span> 情感狀態</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.emotion_report || '暫無數據')}</div>
            </div>

            <div class="report-section">
                <h4><span>💡</span> 改进建议</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.suggestion_report || '暫無數據')}</div>
            </div>

            <div class="report-section">
                <h4><span>📈</span> 进步情况</h4>
                <div class="report-content formatted-text">${this.formatMarkdownText(report.progress_report || '暫無數據')}</div>
            </div>

            ${report.teacher_attention_points ? `
            <div class="teacher-attention">
                <h5>⚠️ 教師关注点</h5>
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
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📭</div>
                    <p>暫無${filterType === 'all' ? '' : this.getTemplateTypeName(filterType)}范本</p>
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
                                刪除
                            </button>
                        </div>
                        <div style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 0.75rem;">📅 上传時間：${uploadTime}</div>
                        <div style="color: var(--text); font-size: 0.9rem; line-height: 1.6; padding: 1rem; background: white; border-radius: 6px; border: 1px solid var(--border);">
                            <strong>內容预览：</strong><br>${template.content_preview || ''}
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
    _categoryLabels: { learning: '學習工具', community: '社區', teaching: '教學管理', admin: '系統管理', other: '其他' },

    renderAppsConfig() {
        const container = document.getElementById('appmgrList');
        if (!container) return;
        const apps = AdminApp.state.appsConfig;
        const roleLabels = { student: '學生', teacher: '教師', admin: '管理員' };
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
                        <span style="font-size:28px;flex-shrink:0;">${app.icon || '📦'}</span>
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
                                <button data-action="moveApp" data-index="${index}" data-dir="-1" style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px;" title="上移" ${index === 0 ? 'disabled' : ''}>▲</button>
                                <button data-action="moveApp" data-index="${index}" data-dir="1" style="border:none;background:none;cursor:pointer;font-size:14px;padding:2px;" title="下移" ${index === apps.length - 1 ? 'disabled' : ''}>▼</button>
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
        promptTemplates: {
            basic: '你是一個{subject_name}學科的AI助教。\n請用簡單易懂的語言回答學生的問題。\n始終保持友好、耐心的態度。',
            interactive: '你是{subject_name}學科的互動學習助手。\n通過提問引導學生思考，而不是直接給出答案。\n鼓勵學生自主探索和學習。',
            exam: '你是{subject_name}學科的考試輔導專家。\n幫助學生準備考試，提供練習題和詳細解答。\n重點關注易錯點和考試技巧。',
            creative: '你是{subject_name}學科的創意思維導師。\n鼓勵學生跳出框架思考，培養創新能力。\n通過實例和項目激發學習興趣。'
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
        aiMonitorFetching: false
    },

    /* ---------- 初始化 ---------- */
    init() {
        this.loadAdminInfo();
        this.loadSubjects();
        this.loadStatistics();
        this.loadStudentsSummary();
        if (window.location.hash === '#knowledge') {
            this.loadNoticeTemplates();
        }
        setTimeout(() => this.initDragDropUpload(), 200);
        setTimeout(() => this.enhanceNoticeChat(), 200);
        this._bindEvents();
    },

    /* ---------- 事件綁定 ---------- */
    _bindEvents() {
        // Tab buttons
        document.querySelectorAll('[data-action="switchTab"]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(btn.dataset.tab, e);
            });
        });

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

        // Blocked accounts
        document.querySelectorAll('[data-action="refreshBlocked"]').forEach(btn => {
            btn.addEventListener('click', () => this.loadBlockedAccounts());
        });

        // Filters
        const classFilter = document.getElementById('classFilter');
        if (classFilter) classFilter.addEventListener('change', () => this.filterStudents());
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
        if (userSearchInput) userSearchInput.addEventListener('keyup', () => this.filterUsers());

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

        // Tab button click listener for knowledge tab auto-load
        document.querySelectorAll('[data-action="switchTab"]').forEach(btn => {
            btn.addEventListener('click', () => {
                if ((btn.textContent || '').includes('知識庫管理')) {
                    setTimeout(() => this.loadNoticeTemplates(), 100);
                }
            });
        });
    },

    /* ---------- 管理員/教師信息 ---------- */
    loadAdminInfo() {
        const adminName = localStorage.getItem('admin_name') || '管理员';
        const role = (typeof AuthModule !== 'undefined' && AuthModule.getUserRole)
            ? AuthModule.getUserRole() : (localStorage.getItem('user_role') || 'admin');

        document.getElementById('adminName').textContent = adminName;
        document.getElementById('adminAvatar').textContent = adminName[0].toUpperCase();

        // 角色徽章
        const badge = document.getElementById('roleBadge');
        if (badge) {
            if (role === 'admin') {
                badge.textContent = '管理員';
                badge.className = 'role-badge role-admin';
            } else {
                badge.textContent = '教師';
                badge.className = 'role-badge role-teacher';
            }
        }

        // 教師：隱藏管理員專屬標籤
        if (role !== 'admin') {
            document.querySelectorAll('.tab-button.admin-only').forEach(btn => {
                btn.style.display = 'none';
            });
            // 同時隱藏對應的 tab-pane
            ['users', 'settings', 'notice', 'appmgr', 'classdiary', 'blocked', 'aimonitor'].forEach(tab => {
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

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        if (ev && ev.currentTarget) {
            ev.currentTarget.classList.add('active');
        } else {
            const btns = Array.from(document.querySelectorAll('.tab-button'));
            const match = btns.find(b => b.dataset.tab === tabName);
            if (match) match.classList.add('active');
        }

        document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
        document.getElementById(`${tabName}-tab`).classList.add('active');

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
        }
    },

    /* ---------- 返回主系統 ---------- */
    backToMain() {
        window.location.href = '/';
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
                container.innerHTML = `<p style="color:var(--color-error);">載入封鎖列表失敗: ${error.message}</p>`;
            }
        }
    },

    async unblockAccount(blockType, key, typeLabel, display) {
        const msg = `確定要解除封鎖嗎？\n\n類型：${typeLabel || blockType}\n對象：${display || key}\n\n注意：如果該對象同時存在多條封鎖，解除此條不代表完全恢復登錄。`;
        if (!confirm(msg)) return;
        try {
            await AdminAPI.unblockAccount(blockType, key);
            alert('已解除該條封鎖');
            this.loadBlockedAccounts();
        } catch (error) {
            alert('解除封鎖失敗: ' + error.message);
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
        subjectFilter.innerHTML = '<option value="">所有學科</option>';
        for (const [code, subject] of Object.entries(this.state.subjects)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${subject.icon || '📚'} ${subject.name || code}`;
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
            icon: document.getElementById('subjectIcon').value.trim() || '📚',
            description: document.getElementById('subjectDescription').value.trim()
        };
        try {
            await AdminAPI.createSubject(subjectData);
            alert('學科添加成功！');
            this.closeAddSubjectModal();
            this.loadSubjects();
        } catch (error) {
            alert('添加失敗：' + error.message);
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
            icon: document.getElementById('editSubjectIcon').value || '📚',
            description: document.getElementById('editSubjectDescription').value
        };
        try {
            await AdminAPI.updateSubject(code, subjectData);
            alert('學科更新成功！');
            this.closeEditSubjectModal();
            await this.loadSubjects();
        } catch (error) {
            console.error('更新學科失敗:', error);
            alert('更新失敗: ' + error.message);
        }
    },

    async deleteSubject(code) {
        const subject = this.state.subjects[code];
        if (!subject) return;
        const confirmMsg = `确定要刪除學科 "${subject.name}" (${code}) 吗？\n\n注意：如果该學科下有文檔，需要先刪除所有文檔。`;
        if (!confirm(confirmMsg)) return;
        try {
            await AdminAPI.deleteSubject(code);
            alert('學科刪除成功！');
            await this.loadSubjects();
            await this.loadStatistics();
        } catch (error) {
            console.error('刪除學科失敗:', error);
            alert('刪除失敗: ' + error.message);
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
        select.innerHTML = '<option value="">選擇學科</option>';
        for (const [code, subject] of Object.entries(this.state.subjects)) {
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${subject.icon || '📚'} ${subject.name || code}`;
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
                    <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                    <p>請選擇學科查看文檔</p>
                </div>
            `;
            return;
        }
        try {
            const data = await AdminAPI.fetchDocuments(subject);
            AdminUI.renderDocuments(data.documents, subject);
        } catch (error) {
            console.error('載入文檔出错:', error);
            document.getElementById('documentsList').innerHTML = '<div style="text-align: center; padding: 3rem; color: var(--danger);"><p>載入失敗，請重试</p></div>';
        }
    },

    async uploadDocuments(input) {
        const files = input.files;
        const subject = document.getElementById('knowledgeSubjectSelect').value;
        if (!subject) { alert('請先選擇學科'); input.value = ''; return; }
        if (files.length === 0) return;

        const container = document.getElementById('documentsList');
        container.innerHTML = '<div style="text-align: center; padding: 2rem;"><div class="spinner"></div><p>正在上传文檔...</p></div>';

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
            alert(`上传完成！\n成功: ${successCount} 个\n失敗: ${failCount} 个`);
            await this.loadSubjects();
            await this.loadDocuments(subject);
            await this.loadKnowledgeStats();
            await this.loadStatistics();
        } else {
            alert('所有文件上传失敗，請检查文件格式');
        }
        input.value = '';
    },

    async deleteDocument(subject, filename) {
        if (!confirm(`确定要刪除文檔 "${filename}" 吗？`)) return;
        try {
            await AdminAPI.deleteDocument(subject, filename);
            alert('文檔刪除成功');
            await this.loadDocuments(subject);
        } catch (error) {
            console.error('刪除文檔出错:', error);
            alert('刪除失敗');
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
            item.innerHTML = `<span style="font-size:20px;">${subject.icon || '📚'}</span><span>${subject.name || code}</span>`;
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
        document.getElementById('promptSubjectTitle').textContent = `${subject.icon || '📚'} ${subject.name || code} - 提示詞配置`;
        await this.loadPrompt(code);
    },

    async loadPrompt(subjectCode) {
        try {
            const response = await AdminAPI.fetchPrompt(subjectCode);
            if (response.ok) {
                const data = await response.json();
                document.getElementById('promptContent').value = data.prompt || '';
            } else {
                const defaultPrompt = `你是${this.state.subjects[subjectCode]?.name || subjectCode}學科的AI學習助手。\n請根據學生的問題提供準確、易懂的解答。`;
                document.getElementById('promptContent').value = defaultPrompt;
            }
        } catch (error) {
            console.error('載入提示詞失敗:', error);
            const defaultPrompt = `你是${this.state.subjects[subjectCode]?.name || subjectCode}學科的AI學習助手。\n請根據學生的問題提供準確、易懂的解答。`;
            document.getElementById('promptContent').value = defaultPrompt;
        }
        this.updateCharCount();
    },

    updateCharCount() {
        const content = document.getElementById('promptContent').value;
        document.getElementById('promptCharCount').textContent = `${content.length} 字符`;
    },

    applyPromptTemplate(templateName) {
        if (!this.state.currentPromptSubject) { alert('請先選擇學科'); return; }
        const template = this.state.promptTemplates[templateName];
        const subject = this.state.subjects[this.state.currentPromptSubject];
        const prompt = template.replace('{subject_name}', subject?.name || this.state.currentPromptSubject);
        document.getElementById('promptContent').value = prompt;
        this.updateCharCount();
    },

    async savePrompt() {
        if (!this.state.currentPromptSubject) { alert('請選擇學科'); return; }
        const textarea = document.getElementById('promptContent');
        const prompt = textarea.value;
        try {
            await AdminAPI.savePrompt(this.state.currentPromptSubject, prompt);
            const status = document.getElementById('promptSaveStatus');
            status.style.display = 'inline';
            status.textContent = '✓ 已保存';
            status.style.color = 'var(--success)';
            textarea.style.border = '2px solid var(--success)';
            setTimeout(() => {
                status.style.display = 'none';
                textarea.style.border = '2px solid var(--border)';
            }, 3000);
            this.updateCharCount();
        } catch (error) {
            alert('保存失敗: ' + error.message);
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
        alert('提示詞預覽：\n\n' + content);
    },

    resetPrompt() {
        if (confirm('確定要重置提示詞嗎？')) {
            document.getElementById('promptContent').value = '';
            this.updateCharCount();
        }
    },

    /* ---------- 學生分析 ---------- */
    async loadStudentAnalysis() {
        console.log('📊 開始載入學生分析數據...');
        document.getElementById('studentList').innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>載入學生列表...</p></div>';
        try {
            const data = await AdminAPI.fetchUsers();
            this.state.allStudents = (data.users || []).filter(user => user.role === 'student');
            this.updateClassFilter();
            AdminUI.renderStudentList(this.state.allStudents);
            this.updateStudentStats(this.state.allStudents);
        } catch (error) {
            console.error('❌ 載入學生數據失敗:', error);
            document.getElementById('studentList').innerHTML = '<div class="empty-state"><p>載入失敗，請重试</p></div>';
        }
    },

    updateClassFilter() {
        const classFilter = document.getElementById('classFilter');
        const classes = [...new Set(this.state.allStudents.map(s => s.class_name).filter(c => c))];
        classFilter.innerHTML = '<option value="">所有班级</option>';
        classes.forEach(className => {
            const option = document.createElement('option');
            option.value = className;
            option.textContent = className;
            classFilter.appendChild(option);
        });
    },

    async selectStudent(student) {
        document.getElementById('analysisContent').innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>正在生成學生學習分析...</p><p style="font-size: 12px; color: #999;">这可能需要10-30秒，請耐心等待</p></div>';
        this.state.currentStudent = student;

        document.querySelectorAll('.student-item').forEach(item => item.classList.remove('active'));
        document.querySelector(`[data-student-id="${student.username}"]`)?.classList.add('active');

        try {
            const overviewData = await AdminAPI.fetchStudentOverview(student.username);
            let analysisHTML = `
                <div class="overall-card" style="background: var(--brand); color: white; padding: 25px; border-radius: 15px; margin-bottom: 20px;">
                    <h3 style="color: white; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 10px; margin-bottom: 15px;">
                        📊 ${student.display_name || student.username} - 整体學習概览
                    </h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; margin-bottom: 20px;">
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${overviewData.total_conversations || 0}</div>
                            <div style="font-size: 12px; opacity: 0.9;">總對話数</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${overviewData.total_hours || 0}h</div>
                            <div style="font-size: 12px; opacity: 0.9;">學習时长</div>
                        </div>
                        <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 8px;">
                            <div style="font-size: 24px; font-weight: bold;">${(overviewData.active_subjects && overviewData.active_subjects.length) || 0}</div>
                            <div style="font-size: 12px; opacity: 0.9;">活躍科目</div>
                        </div>
                    </div>
                    <div style="margin-top: 15px;">
                        <p style="margin-bottom: 8px;"><strong>📚 活躍科目：</strong> ${(overviewData.active_subjects && overviewData.active_subjects.join(', ')) || '暫無'}</p>
                        <p style="margin-bottom: 8px;"><strong>⏰ 最近活躍：</strong> ${overviewData.last_active || '暫無記錄'}</p>
                        <div style="background: rgba(255,255,255,0.15); padding: 15px; border-radius: 10px; margin-top: 15px;">
                            <h4 style="color: white; margin-bottom: 10px;">🤖 AI智能評價</h4>
                            <p style="line-height: 1.6; font-size: 14px;">${overviewData.overall_assessment || '需要更多數據生成評價'}</p>
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
                            <h4 style="color: var(--primary);">📚 ${AdminUI.getSubjectName(subject)} 科目分析</h4>
                            <p style="color: #999; text-align: center; padding: 20px;">该學生在 ${AdminUI.getSubjectName(subject)} 科目暫無學習記錄</p>
                        </div>
                    `;
                }
            } catch (e) {
                // subject analysis failed, just show overview
            }

            document.getElementById('analysisContent').innerHTML = analysisHTML;
        } catch (error) {
            console.error('❌ 获取學生分析失敗:', error);
            document.getElementById('analysisContent').innerHTML = '<div class="empty-state"><h4>載入失敗</h4><p>无法获取學生分析報告，請重试</p></div>';
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
            alert('請先選擇一个學生');
            return;
        }
        const report = this.state.studentReports[this.state.currentStudent.username];
        const content = `
學生學習分析報告
================
學生姓名：${this.state.currentStudent.display_name || this.state.currentStudent.username}
班级：${this.state.currentStudent.class_name || '未分班'}
科目：${AdminUI.getSubjectName(report.subject)}
分析日期：${new Date(report.analysis_date).toLocaleDateString('zh-CN')}
风险等级：${AdminUI.getRiskText(report.risk_level)}

總体评估
--------
${report.overall_assessment || '暫無评估'}

知识掌握情况
------------
${report.knowledge_mastery_report || '暫無數據'}

學習风格分析
------------
${report.learning_style_report || '暫無數據'}

學習困难分析
------------
${report.difficulty_report || '暫無數據'}

情感狀態分析
------------
${report.emotion_report || '暫無數據'}

學習进度评估
------------
${report.progress_report || '暫無數據'}

个性化學習建议
--------------
${report.suggestion_report || '暫無數據'}

教師关注点
----------
${report.teacher_attention_points || '暫無'}
        `;
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${this.state.currentStudent.username}_學習分析報告_${new Date().toISOString().split('T')[0]}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    /* ---------- 學生摘要 ---------- */
    async loadStudentsSummary() {
        const container = document.getElementById('studentsSummaryList');
        if (!container) return;
        container.innerHTML = '<div class="loading-spinner" style="grid-column: 1 / -1;"><div class="spinner"></div><p>載入學生摘要...</p></div>';
        try {
            const data = await AdminAPI.fetchStudentsSummary();
            AdminUI.displayStudentsSummary(data.students || []);
        } catch (error) {
            console.error('載入學生摘要失敗:', error);
            container.innerHTML = '<div class="empty-state" style="grid-column: 1 / -1;">載入失敗，請稍后重试</div>';
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
                    <h3>${pseudoStudent.display_name} - 學習分析報告</h3>
                    <div class="analysis-meta">
                        <span>🎓 班级：${pseudoStudent.class_name || '未分班'}</span>
                        <span>📚 科目：${AdminUI.getSubjectName('ict')}</span>
                        <span>📅 分析日期：${report.analysis_date ? new Date(report.analysis_date).toLocaleDateString('zh-CN') : '-'}</span>
                    </div>
                </div>
                ${AdminUI.generateDetailedReport(pseudoStudent, { ...report, has_data: true }, 'ict')}
            `;
            document.getElementById('analysisContent').innerHTML = html;
        } catch (e) {
            console.error('載入詳細報告失敗', e);
            document.getElementById('analysisContent').innerHTML = '<div class="empty-state">无法載入该學生的詳細報告</div>';
        }
    },

    _showDetailLoading() {
        const el = document.getElementById('analysisContent');
        if (el) el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div><p>正在載入詳細報告...</p></div>';
    },

    /* ---------- 用戶管理 ---------- */
    async loadUsers() {
        try {
            const data = await AdminAPI.fetchUsers();
            this.state.allUsers = data.users || [];
            this.updateUserClassFilter();
            AdminUI.renderUsersTable(this.state.allUsers);
        } catch (error) {
            console.error('載入用戶失敗:', error);
            alert('載入用戶列表失敗');
        }
    },

    updateUserClassFilter() {
        const classFilter = document.getElementById('userClassFilter');
        const classes = [...new Set(this.state.allUsers.map(u => u.class_name).filter(c => c))];
        classFilter.innerHTML = '<option value="">所有班级</option>';
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
                (u.display_name && u.display_name.toLowerCase().includes(searchText))
            );
        }
        AdminUI.renderUsersTable(filteredUsers);
    },

    showAddUserModal() {
        document.getElementById('userModalTitle').textContent = '添加用戶';
        document.getElementById('userForm').reset();
        document.getElementById('editUserId').value = '';
        document.getElementById('userUsername').disabled = false;
        document.getElementById('userPassword').required = true;
        document.getElementById('userModal').style.display = 'flex';
    },

    editUser(username) {
        const user = this.state.allUsers.find(u => u.username === username);
        if (!user) return;
        document.getElementById('userModalTitle').textContent = '編輯用戶';
        document.getElementById('editUserId').value = username;
        document.getElementById('userUsername').value = username;
        document.getElementById('userUsername').disabled = true;
        document.getElementById('userPassword').required = false;
        document.getElementById('userPassword').value = '';
        document.getElementById('userDisplayName').value = user.display_name || '';
        document.getElementById('userRole').value = user.role || 'student';
        document.getElementById('userClass').value = user.class_name || '';
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
        const userData = {
            username: document.getElementById('userUsername').value,
            display_name: document.getElementById('userDisplayName').value,
            role: document.getElementById('userRole').value,
            class_name: document.getElementById('userClass').value,
            notes: document.getElementById('userNotes').value
        };
        if (!isEdit) {
            userData.password = document.getElementById('userPassword').value;
            if (!userData.password) { alert('請輸入密碼'); return; }
        } else if (document.getElementById('userPassword').value) {
            userData.password = document.getElementById('userPassword').value;
        }
        try {
            if (isEdit) {
                await AdminAPI.updateUser(editUserId, userData);
                alert('用戶更新成功！');
            } else {
                await AdminAPI.createUser(userData);
                alert('用戶添加成功！');
            }
            this.closeUserModal();
            this.loadUsers();
        } catch (error) {
            alert('操作失敗：' + error.message);
        }
    },

    async resetUserPassword(username) {
        const newPassword = prompt(`为用戶 ${username} 輸入新密碼：`);
        if (!newPassword) return;
        try {
            await AdminAPI.resetUserPassword(username, newPassword);
            alert('密碼重置成功！');
        } catch (error) {
            alert('重置失敗：' + error.message);
        }
    },

    deleteUser(username) {
        this.state.userToDelete = username;
        document.getElementById('deleteConfirmMessage').textContent = `确定要刪除用戶 "${username}" 吗？此操作不可恢复。`;
        document.getElementById('deleteConfirmModal').style.display = 'flex';
    },

    async confirmDelete() {
        if (!this.state.userToDelete) return;
        try {
            await AdminAPI.deleteUser(this.state.userToDelete);
            alert('用戶刪除成功！');
            this.closeDeleteConfirm();
            this.loadUsers();
        } catch (error) {
            alert('刪除失敗：' + error.message);
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
            a.download = '用戶批量導入模板.xlsx';
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            alert('下載失敗：' + error.message);
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
        btn.textContent = '⏳ 導入中...';
        try {
            if (this.state.currentBatchTab === 'excel') {
                await this._processExcelUpload();
            } else {
                await this._processTextBatchAdd();
            }
        } finally {
            btn.disabled = false;
            btn.textContent = '🚀 開始導入';
        }
    },

    async _processExcelUpload() {
        if (!this.state.selectedExcelFile) { alert('請先選擇 Excel 文件'); return; }
        const formData = new FormData();
        formData.append('file', this.state.selectedExcelFile);
        try {
            const response_data = await AdminAPI.uploadExcelUsers(formData);
            const result = response_data.data || response_data;
            const resultsDiv = document.getElementById('importResults');
            const resultsList = document.getElementById('importResultsList');
            resultsDiv.style.display = 'block';
            let html = `<p style="margin-bottom: 10px;"><strong>成功：${result.success_count || 0}</strong> | <strong style="color: var(--danger);">失敗：${result.failed_count || 0}</strong></p>`;
            if (result.failed_details && result.failed_details.length > 0) {
                html += '<ul style="list-style: none; padding: 0; margin: 0; font-size: 13px;">';
                result.failed_details.forEach(f => {
                    html += `<li style="padding: 4px 0; color: var(--danger);">❌ ${f.username || f.row || ''}: ${f.error}</li>`;
                });
                html += '</ul>';
            }
            resultsList.innerHTML = html;
            if (result.success_count > 0) this.loadUsers();
            if (result.failed_count === 0 && result.success_count > 0) {
                alert(`導入完成！成功添加 ${result.success_count} 個用戶`);
            }
        } catch (error) {
            alert('導入失敗：' + error.message);
        }
    },

    async _processTextBatchAdd() {
        const role = document.getElementById('batchRole').value;
        const userData = document.getElementById('batchUserData').value.trim();
        if (!userData) { alert('請輸入用戶數據'); return; }
        const lines = userData.split('\n').filter(line => line.trim());
        const users = [];
        for (const line of lines) {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length < 2) { alert(`格式錯誤：${line}`); return; }
            users.push({
                username: parts[0], password: parts[1], display_name: parts[2] || '',
                class_name: parts[3] || '', notes: parts[4] || '', role
            });
        }
        try {
            const response_data = await AdminAPI.batchAddUsers(users);
            const result = response_data.data || response_data;
            alert(`批量添加完成！\n成功：${result.success_count || 0}\n失敗：${result.failed_count || 0}`);
            this.closeBatchAddModal();
            this.loadUsers();
        } catch (error) {
            alert('批量添加失敗：' + error.message);
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
            this._addNoticeAIMessage('抱歉，連線出現問題。請刷新頁面重試。');
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
            this._addNoticeAIMessage('抱歉，處理您的訊息時出現問題。');
        }
    },

    _addNoticeAIMessage(message) {
        const container = document.getElementById('noticeChatMessages');
        const messageDiv = document.createElement('div');
        messageDiv.className = 'notice-message ai';
        messageDiv.innerHTML = `
            <div style="width: 35px; height: 35px; background: var(--primary); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">🤖</div>
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
            <div style="width: 35px; height: 35px; background: var(--brand-lighter); border-radius: 50%; display: flex; align-items: center; justify-content: center;">👤</div>
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
        if (stage === 'select_type') actions = ['活動通告', '考試通告', '會議通告', '一般通告'];
        else if (stage === 'confirming') actions = ['確認', '修改'];
        else if (stage === 'completed') actions = ['新建通告'];
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
        if (!this.state.noticeCanExport) { alert('請先完成通告產生'); return; }
        try {
            const blob = await AdminAPI.exportNotice(this.state.noticeSessionId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `通告_${new Date().toISOString().split('T')[0]}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);
            this._addNoticeAIMessage('✅ Word 文件已成功匯出！');
        } catch (error) {
            alert('匯出時發生錯誤：' + error.message);
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
                <div style="font-size: 40px;">📁</div>
                <div class="ddz-title">拖拽通告/范本文件到这里</div>
                <div class="ddz-sub">支持批量上传 · 自动分类 · 智能识别</div>
                <button type="button" class="ddz-btn" id="ddzPickerBtn">或点击選擇文件</button>
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
            formData.append('description', '批量上传');
            try {
                const resp = await AdminAPI.uploadNoticeTemplate(formData);
                if (resp.ok) ok++; else fail++;
            } catch (_) { fail++; }
        }
        AdminUI.showSuccessNotification(`批量上传完成：成功 ${ok} 个，失敗 ${fail} 个`);
        await this.loadNoticeTemplates();
    },

    /* ---------- 通告聊天增強 ---------- */
    enhanceNoticeChat() {
        const qa = document.getElementById('noticeQuickActions');
        if (qa && !qa.dataset.enhanced) {
            const bar = document.createElement('div');
            bar.style.cssText = 'display:flex; gap:8px; flex-wrap: wrap; margin: 8px 0 10px;';
            const quickTemplates = [
                { icon: '🎯', text: '使用去年同期通告作为参考' },
                { icon: '📋', text: '复制上次的活动通告格式' },
                { icon: '✨', text: 'AI自动填充常用資訊' }
            ];
            quickTemplates.forEach(q => {
                const btn = document.createElement('button');
                btn.className = 'quick-action';
                btn.textContent = `${q.icon} ${q.text}`;
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
                    <h4>📝 实时预览</h4>
                    <div id="noticePreviewBody" class="notice-preview-empty">生成的通告內容将实时顯示在这里。</div>
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
            alert('請選擇要上传的范本文件');
            return;
        }

        if (uploadBtn) { uploadBtn.disabled = true; uploadBtn.innerHTML = '<span>⏳</span> 上传中...'; }

        const formData = new FormData();
        formData.append('file', fileInput.files[0]);
        formData.append('template_type', templateType);
        formData.append('description', description);

        try {
            const response = await AdminAPI.uploadNoticeTemplate(formData);
            if (response.ok) {
                await response.json().catch(() => ({}));
                AdminUI.showSuccessNotification('范本上传成功！');
                this.clearTemplateForm();
                await this.loadNoticeTemplates();
                this.updateTemplateStats();
            } else {
                const error = await response.json().catch(() => ({}));
                alert('上传失敗：' + (error.detail || '未知錯誤'));
            }
        } catch (error) {
            alert('上传失敗：' + (error.message || '網絡錯誤'));
        } finally {
            if (uploadBtn) { uploadBtn.disabled = false; uploadBtn.innerHTML = '<span>📤</span> 上传范本'; }
        }
    },

    async loadNoticeTemplates() {
        const list = document.getElementById('noticeTemplatesList');
        if (list) {
            list.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-secondary);"><div class="spinner"></div><p>載入范本列表...</p></div>';
        }
        try {
            const data = await AdminAPI.fetchNoticeTemplates();
            this.state.noticeTemplatesData = data.templates || {};
            this.updateTemplateStats();
            AdminUI.renderTemplatesList(this.state.currentTemplateFilter);
            setTimeout(() => this.initDragDropUpload(), 60);
        } catch (e) {
            console.error('載入范本列表失敗:', e);
            if (list) list.innerHTML = '<p style="text-align:center; color: var(--danger);">載入失敗，請检查網絡</p>';
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
        if (!confirm(`确定要刪除范本 "${filename}" 吗？`)) return;
        alert('刪除功能待实现');
    },

    /* ---------- 應用管理 ---------- */
    async loadAppsConfig() {
        try {
            const data = await AdminAPI.fetchApps();
            this.state.appsConfig = data.apps || [];
            AdminUI.renderAppsConfig();
        } catch (error) {
            console.error('載入應用配置失敗:', error);
            document.getElementById('appmgrList').innerHTML = '<p style="color:red;">載入失敗: ' + error.message + '</p>';
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
            alert('應用配置已保存！');
        } catch (error) {
            console.error('保存應用配置失敗:', error);
            alert('保存失敗: ' + error.message);
        }
    },

    async resetAppsToDefault() {
        if (!confirm('確定要重置為預設配置嗎？所有自定義更改將會丟失。')) return;
        try {
            const data = await AdminAPI.resetApps();
            this.state.appsConfig = data.apps || [];
            AdminUI.renderAppsConfig();
            alert('已重置為預設配置！');
        } catch (error) {
            console.error('重置失敗:', error);
            alert('重置失敗: ' + error.message);
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
        if (!classCode) { alert('請輸入班級代碼'); return; }

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
            alert('添加班級失敗: ' + error.message);
        }
    },

    async deleteClass(classCode) {
        if (!confirm(`確定刪除班級 ${classCode}？`)) return;
        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/classes/${encodeURIComponent(classCode)}`, {
                method: 'DELETE',
            });
            this.loadClassDiaryQRGrid();
        } catch (error) {
            alert('刪除班級失敗: ' + error.message);
        }
    },

    async loadClassDiaryTab() {
        await Promise.all([
            this.loadClassDiaryQRGrid(),
            this.loadReviewers(),
            this.loadTeachersForReviewer(),
        ]);
    },

    async loadClassDiaryQRGrid() {
        const grid = document.getElementById('classDiaryQRGrid');
        try {
            const data = await AdminAPI.fetchWithAuth('/api/class-diary/admin/classes');
            const classes = data.data || [];

            if (classes.length === 0) {
                grid.innerHTML = '<p style="color:var(--text-secondary);">尚無班級記錄。請先在數據庫中添加班級。</p>';
                return;
            }

            grid.innerHTML = classes.map(c => `
                <div style="background:#fff;border:1px solid var(--border);border-radius:12px;padding:1rem;text-align:center;position:relative;">
                    <button onclick="AdminApp.deleteClass('${c.class_code}')"
                        style="position:absolute;top:8px;right:8px;width:24px;height:24px;border:none;background:none;color:var(--text-secondary);cursor:pointer;font-size:1rem;line-height:1;border-radius:4px;"
                        title="刪除班級">✕</button>
                    <div style="font-size:1.1rem;font-weight:700;margin-bottom:0.25rem;">${c.class_code}</div>
                    <div style="font-size:0.8rem;color:var(--text-secondary);margin-bottom:0.5rem;">${c.class_name || ''} ${c.grade ? '(' + c.grade + ')' : ''}</div>
                    <div id="qr-wrap-${c.class_code}" style="min-height:140px;display:flex;align-items:center;justify-content:center;">
                        <div class="spinner-small" id="qr-loading-${c.class_code}"></div>
                    </div>
                    <img id="qr-${c.class_code}" style="width:160px;height:160px;border:1px solid #eee;border-radius:8px;margin-bottom:0.5rem;display:none;" alt="QR">
                    <div id="qr-actions-${c.class_code}" style="display:none;gap:0.5rem;justify-content:center;">
                        <button onclick="AdminApp.downloadQR('${c.class_code}')"
                            style="padding:6px 12px;border:1px solid var(--primary);border-radius:6px;background:var(--primary);color:#fff;font-size:0.8rem;cursor:pointer;">
                            ⬇️ 下載 PNG
                        </button>
                    </div>
                </div>
            `).join('');

            // 自動載入所有 QR 碼
            for (const c of classes) {
                this.showQR(c.class_code);
            }
        } catch (error) {
            grid.innerHTML = '<p style="color:red;">載入班級失敗: ' + error.message + '</p>';
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
            if (!resp.ok) throw new Error('生成失敗');
            const blob = await resp.blob();
            // 存儲 blob 供下載用
            img._qrBlob = blob;
            img.src = URL.createObjectURL(blob);
            img.style.display = 'block';
            if (loading) loading.style.display = 'none';
            if (actions) actions.style.display = 'flex';
        } catch (error) {
            if (loading) loading.innerHTML = '<span style="color:red;font-size:0.8rem;">生成失敗</span>';
        }
    },

    downloadQR(classCode) {
        const img = document.getElementById(`qr-${classCode}`);
        if (!img || !img._qrBlob) {
            alert('請先生成 QR 碼');
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
                throw new Error(err.detail || '下載失敗');
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
            alert('批量下載失敗: ' + error.message);
        }
    },

    async loadTeachersForReviewer() {
        try {
            const data = await AdminAPI.fetchWithAuth('/api/admin/users?role=teacher');
            const users = data.data || data.users || [];
            const select = document.getElementById('reviewerSelect');
            select.innerHTML = '<option value="">選擇教師帳戶...</option>';
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
                container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.9rem;">尚未添加任何 Reviewer。</p>';
                return;
            }

            container.innerHTML = reviewers.map(r => `
                <div style="display:flex;align-items:center;justify-content:space-between;background:#fff;border:1px solid var(--border);border-radius:8px;padding:10px 16px;">
                    <div>
                        <span style="font-weight:600;">${r.username}</span>
                        <span style="color:var(--text-secondary);font-size:0.8rem;margin-left:8px;">由 ${r.granted_by} 授權</span>
                    </div>
                    <button onclick="AdminApp.removeReviewer('${r.username}')"
                        style="padding:4px 10px;border:1px solid #EF4444;border-radius:6px;background:#fff;color:#EF4444;font-size:0.8rem;cursor:pointer;">
                        移除
                    </button>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = '<p style="color:red;">載入失敗: ' + error.message + '</p>';
        }
    },

    async addReviewer() {
        const select = document.getElementById('reviewerSelect');
        const username = select.value;
        if (!username) {
            alert('請選擇教師帳戶');
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
            alert('添加失敗: ' + error.message);
        }
    },

    async removeReviewer(username) {
        if (!confirm(`確定移除 ${username} 的 Review 權限？`)) return;
        try {
            await AdminAPI.fetchWithAuth(`/api/class-diary/admin/reviewers/${username}`, {
                method: 'DELETE',
            });
            await this.loadReviewers();
        } catch (error) {
            alert('移除失敗: ' + error.message);
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
        if (ts) ts.textContent = '更新: ' + new Date().toLocaleTimeString();

        // If no data at all
        if (!data && apiError) {
            this._setAiCongestion('DEGRADED', 'API 無法連線', errorMsg);
            return;
        }
        if (!data) return;

        const gate = data.ai_gate || {};
        const ollama = data.ollama || {};
        const server = data.server || {};
        const config = data.config || {};

        // --- Congestion level ---
        if (apiError) {
            this._setAiCongestion('DEGRADED', 'API 無法連線', errorMsg);
        } else if (!ollama.connected) {
            this._setAiCongestion('DEGRADED', 'Ollama 無法連線', ollama.last_error || '');
        } else {
            const queued = gate.queued || 0;
            const used = gate.capacity_used || 0;
            const total = gate.capacity_total || 1;
            const pct = used / total * 100;

            if (queued >= 10 || pct >= 90) {
                this._setAiCongestion('CONGESTED', `容量 ${Math.round(pct)}%, 排隊 ${queued}`);
            } else if (queued >= 5 || pct >= 60) {
                this._setAiCongestion('BUSY', `容量 ${Math.round(pct)}%, 排隊 ${queued}`);
            } else if ((gate.running || 0) > 0) {
                this._setAiCongestion('NORMAL', `容量 ${Math.round(pct)}%, 排隊 ${queued}`);
            } else {
                this._setAiCongestion('IDLE', '系統空閒');
            }
        }

        // --- Ollama status ---
        const connEl = document.getElementById('aiOllamaConn');
        const rtEl = document.getElementById('aiOllamaRuntime');
        if (connEl) {
            if (ollama.connected) {
                connEl.innerHTML = '<span style="color:var(--success);">已連線</span>';
            } else {
                connEl.innerHTML = '<span style="color:var(--danger);">斷線</span>';
            }
        }
        if (rtEl) {
            if (ollama.runtime_available) {
                const models = (ollama.running_models || []).map(m => m.name).join(', ') || '無';
                rtEl.innerHTML = `<span style="color:var(--success);">${models}</span>`;
            } else {
                rtEl.innerHTML = '<span style="color:var(--text-secondary);">不可用</span>';
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
                qdEl.textContent = '無排隊任務';
            } else {
                let html = '';
                keys.forEach(pri => {
                    const layer = qd[pri];
                    if (layer.depth > 0) {
                        html += `<div style="margin-bottom:8px;"><strong>${pri}</strong> (${layer.depth})</div>`;
                        (layer.entries || []).forEach(e => {
                            html += `<div style="padding:2px 0 2px 12px;">${e.task_name} <span style="color:var(--text-secondary);">w=${e.weight}, 等待 ${e.wait_seconds}s</span></div>`;
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
                rdEl.textContent = '無運行中任務';
            } else {
                let html = '<table style="width:100%;border-collapse:collapse;"><thead><tr style="border-bottom:1px solid var(--border);"><th style="text-align:left;padding:4px 0;font-weight:600;">任務</th><th style="text-align:center;padding:4px;font-weight:600;">優先級</th><th style="text-align:center;padding:4px;font-weight:600;">權重</th><th style="text-align:right;padding:4px 0;font-weight:600;">時長</th></tr></thead><tbody>';
                rd.forEach(t => {
                    const dur = t.running_seconds || 0;
                    const durColor = dur > 30 ? 'var(--danger)' : dur > 10 ? 'var(--warning)' : 'inherit';
                    html += `<tr><td style="padding:4px 0;">${t.task_name}</td><td style="text-align:center;padding:4px;">${t.priority}</td><td style="text-align:center;padding:4px;">${t.weight}</td><td style="text-align:right;padding:4px 0;color:${durColor};font-weight:600;">${dur}s</td></tr>`;
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

    _setAiCongestion(level, text, sub) {
        const banner = document.getElementById('aiCongestionBanner');
        if (!banner) return;
        const styles = {
            IDLE:      { bg: '#E8F5EC', color: '#006633', label: '空閒' },
            NORMAL:    { bg: '#E3F2FD', color: '#1565C0', label: '正常' },
            BUSY:      { bg: '#FFF3E0', color: '#E65100', label: '繁忙' },
            CONGESTED: { bg: '#FFEBEE', color: '#C62828', label: '擁堵' },
            DEGRADED:  { bg: '#F5F5F5', color: '#616161', label: '異常' },
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
