/**
 * 智能通告助手 — 前端核心模組（分屏版）
 * ==========================================
 *
 * 四層架構：
 *   NoticeAPI   — HTTP 請求封裝（統一 auth / 錯誤 / 解包）
 *   NoticeState — 狀態管理（stage 驅動的狀態機）
 *   NoticeUI    — 純 DOM 渲染（對話面板 + 預覽面板 + 移動端 Tab）
 *   NoticeApp   — 流程控制器（事件 → API → State → UI）
 *
 * 數據流：API Response → State.update() → UI render
 * 依賴共享模組: AuthModule, UIModule, Utils, i18n
 */
'use strict';

/* ============================================================
   API — 統一 HTTP 封裝
   ============================================================ */

const NoticeAPI = {

    /**
     * 統一請求：auth header + 401 重定向 + success_response 解包 + 錯誤拋出
     * @returns {Promise<Object>} 解包後的 data（即 success_response.data）
     */
    async _fetch(url, options = {}) {
        const resp = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AuthModule.getToken()}`,
                ...(options.headers || {}),
            },
        });

        if (resp.status === 401) {
            AuthModule.removeToken();
            window.location.href = '/';
            throw new Error(i18n.t('ng.errorAuth'));
        }

        // 導出端點返回二進制文件
        if (resp.headers.get('content-type')?.includes('officedocument')) {
            return resp.blob();
        }

        const json = await resp.json();
        if (!resp.ok || json.success === false) {
            throw new Error(json.data?.detail || json.message || i18n.t('ng.errorRequestFailed'));
        }

        // 解包 success_response 的 data 層
        return json.data || json;
    },

    async startConversation(noticeType = null) {
        return this._fetch('/api/admin/notice/dialogue/start', {
            method: 'POST',
            body: JSON.stringify({ notice_type: noticeType }),
        });
    },

    async continueConversation(sessionId, userInput) {
        return this._fetch('/api/admin/notice/dialogue/continue', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId, user_input: userInput }),
        });
    },

    async exportWord(sessionId) {
        return this._fetch('/api/admin/notice/dialogue/export', {
            method: 'POST',
            body: JSON.stringify({ session_id: sessionId }),
        });
    },
};

/* ============================================================
   STATE — Stage 驅動的狀態機
   ============================================================ */

const NoticeState = {
    sessionId: '',
    stage: 'idle',          // idle | select_type | collecting_info | confirming | completed
    progress: 0,
    noticeContent: '',      // AI 生成的通告原文

    /** 根據 API 響應統一更新狀態 */
    update(data) {
        if (data.session_id) this.sessionId = data.session_id;
        if (data.stage)      this.stage = data.stage;
        if (data.progress !== undefined) this.progress = data.progress;
        if (data.content)    this.noticeContent = data.content;
    },

    /** stage 計算屬性：是否可導出 */
    get isExportable() {
        return this.stage === 'confirming' || this.stage === 'completed';
    },

    reset() {
        this.sessionId = '';
        this.stage = 'idle';
        this.progress = 0;
        this.noticeContent = '';
    },
};

/* ============================================================
   UI — 純 DOM 渲染
   ============================================================ */

const NoticeUI = {
    els: {},

    cacheElements() {
        this.els = {
            // 對話面板
            chatMessages:  document.getElementById('chatMessages'),
            chatInput:     document.getElementById('chatInput'),
            sendButton:    document.getElementById('sendButton'),
            quickActions:  document.getElementById('quickActions'),
            // 預覽面板
            previewEmpty:  document.getElementById('previewEmpty'),
            previewEditor: document.getElementById('previewEditor'),
            exportButton:  document.getElementById('exportButton'),
            // Header
            progressBar:   document.getElementById('progressBar'),
            // 移動端 Tab
            mobileTabs:    document.getElementById('mobileTabs'),
            panelChat:     document.getElementById('panelChat'),
            panelPreview:  document.getElementById('panelPreview'),
        };
    },

    /* ---------- 對話面板 ---------- */

    addAIMessage(text) {
        const container = this.els.chatMessages;
        let html = text;
        // 如果後端在 message 中嵌入了通告預覽（===== 分隔）
        if (text.includes('=====')) {
            const parts = text.split('=====');
            if (parts.length >= 3) {
                html = parts[0] + '<div class="notice-preview">' + parts[1] + '</div>' + parts[2];
            }
        }
        const div = document.createElement('div');
        div.className = 'message ai';
        div.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">${html}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    addUserMessage(text) {
        const container = this.els.chatMessages;
        const div = document.createElement('div');
        div.className = 'message user';
        div.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">${Utils.escapeHtml(text)}</div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    showTyping() {
        const container = this.els.chatMessages;
        const div = document.createElement('div');
        div.className = 'message ai';
        div.id = 'typingIndicator';
        div.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">
                <div class="typing-indicator">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    hideTyping() {
        document.getElementById('typingIndicator')?.remove();
    },

    updateQuickActions(stage, onAction) {
        const container = this.els.quickActions;
        container.innerHTML = '';

        const actionMap = {
            select_type: [
                i18n.t('ng.typeActivity'), i18n.t('ng.typeExam'),
                i18n.t('ng.typeMeeting'), i18n.t('ng.typeGeneral'),
            ],
            confirming: [
                i18n.t('ng.actionConfirm'), i18n.t('ng.actionModify'),
                i18n.t('ng.actionRegenerate'),
            ],
            completed: [
                i18n.t('ng.actionNew'), i18n.t('ng.actionEnd'),
            ],
        };

        const actions = actionMap[stage] || [];
        actions.forEach(label => {
            const btn = document.createElement('button');
            btn.className = 'quick-action';
            btn.textContent = label;
            btn.addEventListener('click', () => onAction(label));
            container.appendChild(btn);
        });
    },

    /* ---------- 預覽面板 ---------- */

    updatePreview(content) {
        this.els.previewEmpty.style.display = 'none';
        this.els.previewEditor.style.display = 'block';
        this.els.previewEditor.innerText = content;

        // 移動端自動切換到預覽 Tab
        if (window.innerWidth <= 768) {
            this.switchTab('preview');
        }
    },

    showPreviewEmpty() {
        this.els.previewEmpty.style.display = 'flex';
        this.els.previewEditor.style.display = 'none';
    },

    getPreviewContent() {
        return this.els.previewEditor.innerText || '';
    },

    /* ---------- 共用 ---------- */

    updateProgress(pct) {
        this.els.progressBar.style.width = pct + '%';
    },

    setExportEnabled(enabled) {
        this.els.exportButton.disabled = !enabled;
    },

    /* ---------- 移動端 Tab ---------- */

    switchTab(tabName) {
        if (!this.els.mobileTabs) return;

        this.els.mobileTabs.querySelectorAll('button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panel === tabName);
        });
        this.els.panelChat.classList.toggle('ng-panel--hidden', tabName !== 'chat');
        this.els.panelPreview.classList.toggle('ng-panel--hidden', tabName !== 'preview');
    },
};

/* ============================================================
   APP — 流程控制器
   ============================================================ */

const NoticeApp = {

    async init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();

        NoticeUI.cacheElements();
        this._bindEvents();

        NoticeState.sessionId = 'session_' + Date.now() + '_' +
            Math.random().toString(36).substr(2, 9);

        await this._startConversation();
    },

    _bindEvents() {
        const { sendButton, chatInput, exportButton, mobileTabs } = NoticeUI.els;

        sendButton.addEventListener('click', () => this._sendMessage());

        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        exportButton.addEventListener('click', () => this._exportNotice());

        // 移動端 Tab 切換
        if (mobileTabs) {
            mobileTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-panel]');
                if (btn) NoticeUI.switchTab(btn.dataset.panel);
            });
        }
    },

    /* ---------- 對話流程 ---------- */

    async _startConversation() {
        try {
            const data = await NoticeAPI.startConversation();
            NoticeState.update(data);
            NoticeUI.addAIMessage(data.message);
            NoticeUI.updateQuickActions(data.stage, (a) => this._handleQuickAction(a));
            NoticeUI.updateProgress(NoticeState.progress);
        } catch (err) {
            NoticeUI.addAIMessage(i18n.t('ng.errorConnection'));
        }
    },

    async _sendMessage() {
        const input = NoticeUI.els.chatInput;
        const text = input.value.trim();
        if (!text) return;

        NoticeUI.addUserMessage(text);
        input.value = '';
        NoticeUI.showTyping();

        try {
            const data = await NoticeAPI.continueConversation(NoticeState.sessionId, text);
            NoticeUI.hideTyping();
            NoticeState.update(data);

            NoticeUI.addAIMessage(data.message);
            NoticeUI.updateProgress(NoticeState.progress);
            NoticeUI.updateQuickActions(data.stage, (a) => this._handleQuickAction(a));

            // 當有通告內容時同步到右側預覽
            if (data.content) {
                NoticeUI.updatePreview(data.content);
            }
            NoticeUI.setExportEnabled(NoticeState.isExportable);

        } catch (err) {
            NoticeUI.hideTyping();
            NoticeUI.addAIMessage(i18n.t('ng.errorProcess'));
        }
    },

    _handleQuickAction(label) {
        NoticeUI.els.chatInput.value = label;
        this._sendMessage();
    },

    /* ---------- 導出 ---------- */

    async _exportNotice() {
        if (!NoticeState.isExportable) {
            UIModule.toast(i18n.t('ng.toastCompleteFirst'), 'warning');
            return;
        }

        try {
            const blob = await NoticeAPI.exportWord(NoticeState.sessionId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${i18n.t('ng.filePrefix')}_${new Date().toISOString().split('T')[0]}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            UIModule.toast(i18n.t('ng.exportSuccess'), 'success');
        } catch (err) {
            UIModule.toast(i18n.t('ng.exportFailed') + ': ' + err.message, 'error');
        }
    },
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => NoticeApp.init());
