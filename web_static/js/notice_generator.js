/**
 * 智能通告助手 — 前端核心模組
 * =============================
 *
 * 架構：
 *   NoticeAPI  — API 請求封裝
 *   NoticeUI   — DOM 渲染工具
 *   NoticeApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, UIModule
 * 加載順序: shared/* → notice_generator.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const NoticeAPI = {

    async startConversation(sessionId, initialText = null) {
        const resp = await fetch('/api/admin/notice/dialogue/start', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AuthModule.getToken()}`
            },
            body: JSON.stringify({
                session_id: sessionId,
                initial_info: initialText
            })
        });
        return resp.json();
    },

    async continueConversation(sessionId, userInput) {
        const resp = await fetch('/api/admin/notice/dialogue/continue', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AuthModule.getToken()}`
            },
            body: JSON.stringify({
                session_id: sessionId,
                user_input: userInput
            })
        });
        return resp.json();
    },

    async exportWord(sessionId) {
        const resp = await fetch('/api/admin/notice/dialogue/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${AuthModule.getToken()}`
            },
            body: JSON.stringify({ session_id: sessionId })
        });
        if (!resp.ok) throw new Error(i18n.t('ng.exportFailedApi'));
        return resp.blob();
    }
};

/* ============================================================
   UI — DOM 渲染工具
   ============================================================ */

const NoticeUI = {

    elements: {},

    cacheElements() {
        this.elements = {
            chatMessages: document.getElementById('chatMessages'),
            chatInput: document.getElementById('chatInput'),
            sendButton: document.getElementById('sendButton'),
            quickActions: document.getElementById('quickActions'),
            progressBar: document.getElementById('progressBar'),
            exportButton: document.getElementById('exportButton')
        };
    },

    addAIMessage(message) {
        const container = this.elements.chatMessages;

        let messageHTML = message;
        if (message.includes('=====')) {
            const parts = message.split('=====');
            if (parts.length >= 3) {
                messageHTML = parts[0] + '<div class="notice-preview">' +
                    parts[1] + '</div>' + parts[2];
            }
        }

        const div = document.createElement('div');
        div.className = 'message ai';
        div.innerHTML = `
            <div class="message-avatar">🤖</div>
            <div class="message-content">${messageHTML}</div>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    addUserMessage(message) {
        const container = this.elements.chatMessages;

        const div = document.createElement('div');
        div.className = 'message user';
        div.innerHTML = `
            <div class="message-avatar">👤</div>
            <div class="message-content">${Utils.escapeHtml(message)}</div>
        `;

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    },

    showTypingIndicator() {
        const container = this.elements.chatMessages;

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

    hideTypingIndicator() {
        document.getElementById('typingIndicator')?.remove();
    },

    updateProgress(progress) {
        this.elements.progressBar.style.width = progress + '%';
    },

    updateQuickActions(stage, onAction) {
        const container = this.elements.quickActions;
        container.innerHTML = '';

        let actions = [];
        if (stage === 'select_type') {
            actions = [
                i18n.t('ng.typeActivity'),
                i18n.t('ng.typeExam'),
                i18n.t('ng.typeMeeting'),
                i18n.t('ng.typeGeneral')
            ];
        } else if (stage === 'confirming') {
            actions = [
                i18n.t('ng.actionConfirm'),
                i18n.t('ng.actionModify'),
                i18n.t('ng.actionRegenerate')
            ];
        } else if (stage === 'completed') {
            actions = [
                i18n.t('ng.actionNew'),
                i18n.t('ng.actionEnd')
            ];
        }

        actions.forEach(action => {
            const button = document.createElement('button');
            button.className = 'quick-action';
            button.textContent = action;
            button.addEventListener('click', () => onAction(action));
            container.appendChild(button);
        });
    },

    showExportButton() {
        this.elements.exportButton.classList.add('show');
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const NoticeApp = {

    state: {
        sessionId: '',
        canExport: false,
        currentNoticeContent: ''
    },

    async init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();

        this.state.sessionId = 'session_' + Date.now() + '_' +
            Math.random().toString(36).substr(2, 9);

        NoticeUI.cacheElements();
        this._bindEvents();
        await this._startConversation();
    },

    _bindEvents() {
        NoticeUI.elements.sendButton.addEventListener('click', () => {
            this._sendMessage();
        });

        NoticeUI.elements.chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        NoticeUI.elements.exportButton.addEventListener('click', () => {
            this._exportNotice();
        });
    },

    async _startConversation(initialText = null) {
        try {
            const data = await NoticeAPI.startConversation(
                this.state.sessionId, initialText
            );
            NoticeUI.addAIMessage(data.message);

            if (data.progress !== undefined) {
                NoticeUI.updateProgress(data.progress);
            }
            if (data.can_export) {
                this._enableExport(data.notice_content);
            }
        } catch {
            NoticeUI.addAIMessage(i18n.t('ng.errorConnection'));
        }
    },

    async _sendMessage() {
        const input = NoticeUI.elements.chatInput;
        const message = input.value.trim();
        if (!message) return;

        NoticeUI.addUserMessage(message);
        input.value = '';
        NoticeUI.showTypingIndicator();

        try {
            const data = await NoticeAPI.continueConversation(
                this.state.sessionId, message
            );

            NoticeUI.hideTypingIndicator();
            NoticeUI.addAIMessage(data.message);

            if (data.progress !== undefined) {
                NoticeUI.updateProgress(data.progress);
            }
            if (data.can_export) {
                this._enableExport(data.notice_content);
            }

            NoticeUI.updateQuickActions(data.stage, (action) => {
                NoticeUI.elements.chatInput.value = action;
                this._sendMessage();
            });

        } catch {
            NoticeUI.hideTypingIndicator();
            NoticeUI.addAIMessage(i18n.t('ng.errorProcess'));
        }
    },

    _enableExport(content) {
        this.state.canExport = true;
        this.state.currentNoticeContent = content;
        NoticeUI.showExportButton();
    },

    async _exportNotice() {
        if (!this.state.canExport) {
            UIModule.toast(i18n.t('ng.toastCompleteFirst'), 'warning');
            return;
        }

        try {
            const blob = await NoticeAPI.exportWord(this.state.sessionId);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${i18n.t('ng.filePrefix')}_${new Date().toISOString().split('T')[0]}.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(url);

            NoticeUI.addAIMessage(i18n.t('ng.exportSuccess'));
        } catch (error) {
            UIModule.toast(i18n.t('ng.exportFailed') + ': ' + error.message, 'error');
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    NoticeApp.init();
});
