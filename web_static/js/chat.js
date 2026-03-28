'use strict';

/**
 * AI 學習夥伴 — 聊天頁面前端核心模組 (chat.html)
 * ====================================
 *
 * 架構：
 *   ChatAPI  — API 請求封裝
 *   ChatUI   — DOM 渲染 / 介面操作
 *   ChatApp  — 主控制器（狀態、事件、業務流程）
 *
 * 從 index.js 抽取聊天相關功能，移除登入/首頁/啟動動畫邏輯。
 * 401 或無 token 一律 redirect 到 '/'。
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 * 外部依賴:     PrismJS, MathJax, LearningSummaryManager（可選）
 */

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const ChatAPI = {

    /**
     * 通用請求封裝（附帶 JWT，自動處理 401）
     * 401 時 redirect 到首頁（登入頁）
     */
    async _fetch(url, options = {}) {
        const defaults = { headers: {} };
        const token = AuthModule.getToken();
        if (token) {
            defaults.headers['Authorization'] = `Bearer ${token}`;
        }
        // 非 FormData 時設置 Content-Type
        if (!(options.body instanceof FormData)) {
            defaults.headers['Content-Type'] = 'application/json';
        }
        const merged = {
            ...defaults,
            ...options,
            headers: { ...defaults.headers, ...options.headers }
        };
        const resp = await fetch(url, merged);
        if (resp.status === 401) {
            AuthModule.removeToken();
            ChatApp._clearAuth();
            window.location.href = '/';
            throw new Error(i18n.t('chat.errorAuth'));
        }
        return resp;
    },

    async verify() {
        return this._fetch('/api/verify');
    },

    async changePassword(oldPassword, newPassword) {
        return this._fetch('/api/change-password', {
            method: 'POST',
            body: JSON.stringify({ old_password: oldPassword, new_password: newPassword })
        });
    },

    async fetchSubjects() {
        const token = AuthModule.getToken();
        const headers = { 'Authorization': `Bearer ${token}` };
        let resp = await fetch('/api/subjects', { headers });
        if (!resp.ok) {
            resp = await fetch('/api/admin/subjects', { headers });
        }
        return resp;
    },

    async fetchConversations(username) {
        return this._fetch(`/api/conversations/${username}`);
    },

    async fetchConversation(username, conversationId) {
        return this._fetch(`/api/conversations/${username}/${conversationId}`);
    },

    async createConversation(username, title, subject) {
        return this._fetch(`/api/conversations/${username}`, {
            method: 'POST',
            body: JSON.stringify({ title, subject })
        });
    },

    async deleteConversation(username, conversationId) {
        return this._fetch(`/api/conversations/${username}/${conversationId}`, {
            method: 'DELETE'
        });
    },

    async sendStreamMessage(requestBody) {
        return this._fetch('/api/chat/stream', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });
    },

    async processTempFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this._fetch('/api/process-temp-file', {
            method: 'POST',
            body: formData
        });
    }
};

/* ============================================================
   UI — DOM 渲染 / 介面操作
   ============================================================ */

const ChatUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            // 用户信息
            userInfo:            document.getElementById('userInfo'),
            userAvatar:          document.getElementById('userAvatar'),
            userName:            document.getElementById('userName'),
            userClass:           document.getElementById('userClass'),
            userMenu:            document.getElementById('userMenu'),
            viewProfile:         document.getElementById('viewProfile'),
            viewReport:          document.getElementById('viewReport'),
            changePassword:      document.getElementById('changePassword'),
            logoutButton:        document.getElementById('logoutButton'),
            adminPanel:          document.getElementById('adminPanel'),
            adminSeparator:      document.getElementById('adminSeparator'),
            adminButton:         document.getElementById('adminButton'),

            // 密码修改
            changePasswordModal: document.getElementById('changePasswordModal'),
            changePasswordForm:  document.getElementById('changePasswordForm'),
            oldPasswordInput:    document.getElementById('oldPasswordInput'),
            newPasswordInput:    document.getElementById('newPasswordInput'),
            confirmPasswordInput:document.getElementById('confirmPasswordInput'),
            passwordError:       document.getElementById('passwordError'),
            cancelPasswordChange:document.getElementById('cancelPasswordChange'),
            confirmPasswordChange:document.getElementById('confirmPasswordChange'),

            // 确认删除
            confirmDialog:        document.getElementById('confirmDialog'),
            confirmDialogMessage: document.getElementById('confirmDialogMessage'),
            confirmCancel:        document.getElementById('confirmCancel'),
            confirmDelete:        document.getElementById('confirmDelete'),

            // 主界面
            mainContainer:       document.getElementById('mainContainer'),
            headerTitle:         document.getElementById('headerTitle'),
            subjectSelector:     document.getElementById('subjectSelector'),
            modeSelector:        document.getElementById('modeSelector'),
            statusIndicator:     document.getElementById('statusIndicator'),
            sidebar:             document.getElementById('sidebar'),
            sidebarToggle:       document.getElementById('sidebarToggle'),
            sidebarMobileToggle: document.getElementById('sidebarMobileToggle'),
            sidebarOverlay:      document.getElementById('sidebarOverlay'),
            sidebarCloseBtn:     document.getElementById('sidebarCloseBtn'),
            newChatButton:       document.getElementById('newChatButton'),
            conversationsList:   document.getElementById('conversationsList'),
            messagesContainer:   document.getElementById('messagesContainer'),
            messageInput:        document.getElementById('messageInput'),
            sendButton:          document.getElementById('sendButton'),
            featureList:         document.getElementById('featureList'),
            thinkingToggle:      document.getElementById('thinkingToggle'),
            thinkingToggleText:  document.getElementById('thinkingToggleText'),
            backToHomeBtn:       document.getElementById('backToHomeBtn'),

            // 新建对话科目弹窗
            newChatModal:        document.getElementById('newChatModal'),
            newChatModalClose:   document.getElementById('newChatModalClose'),
            subjectGrid:         document.getElementById('subjectGrid'),
            newChatNameSection:  document.getElementById('newChatNameSection'),
            newChatNameInput:    document.getElementById('newChatNameInput'),
            newChatConfirmBtn:   document.getElementById('newChatConfirmBtn'),

            // 文件上传
            conversationFiles:   document.getElementById('conversationFiles'),
            fileUploadBtn:       document.getElementById('fileUploadBtn'),
            fileUploadInput:     document.getElementById('fileUploadInput'),
            inputContainer:      document.getElementById('inputContainer')
        };
    },

    /* ---------- 用户信息 ---------- */

    updateUserDisplay(userProfile) {
        const el = this.elements;
        el.userName.textContent = userProfile.display_name || userProfile.username;
        el.userClass.textContent = userProfile.class_name || i18n.t('home.defaultClass');
        const firstChar = (userProfile.display_name || userProfile.username).charAt(0).toUpperCase();
        el.userAvatar.textContent = firstChar;
    },

    toggleUserMenu() {
        const menu = this.elements.userMenu;
        const isVisible = menu.style.display === 'block';
        menu.style.display = isVisible ? 'none' : 'block';
    },

    hideUserMenu() {
        this.elements.userMenu.style.display = 'none';
    },

    showAdminFeatures(isTeacher) {
        const el = this.elements;
        if (el.adminButton) {
            el.adminButton.style.display = 'flex';
            el.adminButton.innerHTML = isTeacher
                ? '<span>⚙️</span>' + i18n.t('menu.admin')
                : '<span>⚙️</span>' + i18n.t('menu.admin');
        }
        if (el.adminPanel) el.adminPanel.style.display = 'flex';
        if (el.adminSeparator) el.adminSeparator.style.display = 'block';
    },

    /* ---------- 状态 ---------- */

    updateStatusIndicator(online) {
        const el = this.elements.statusIndicator;
        if (online) {
            el.className = 'status-indicator status-online';
            el.textContent = i18n.t('chat.statusOnline');
        } else {
            el.className = 'status-indicator status-offline';
            el.textContent = i18n.t('chat.statusOffline');
        }
    },

    /* ---------- 密码修改模态框 ---------- */

    showChangePasswordModal() {
        this.hideUserMenu();
        this.elements.changePasswordModal.style.display = 'flex';
        this.elements.oldPasswordInput.focus();
    },

    hideChangePasswordModal() {
        const el = this.elements;
        el.changePasswordModal.style.display = 'none';
        el.changePasswordForm.reset();
        el.passwordError.textContent = '';
    },

    /* ---------- 确认删除对话框 ---------- */

    showConfirmDialog(message) {
        this.elements.confirmDialogMessage.textContent = message;
        this.elements.confirmDialog.style.display = 'flex';
    },

    hideConfirmDialog() {
        this.elements.confirmDialog.style.display = 'none';
    },

    /* ---------- 侧边栏 ---------- */

    toggleSidebar() {
        const el = this.elements;
        if (window.innerWidth >= 834) {
            // 桌面/iPad：切換 collapsed 狀態，絲滑寬度動畫
            el.sidebar.classList.toggle('collapsed');
            try { localStorage.setItem('sidebar-collapsed', el.sidebar.classList.contains('collapsed')); } catch {}
        } else {
            // 移動：原有抽屜行為
            const isOpen = el.sidebar.classList.toggle('open');
            el.sidebarOverlay.classList.toggle('active', isOpen);
            document.body.style.overflow = isOpen ? 'hidden' : '';
        }
    },

    /** 初始化時恢復側邊欄收起狀態 */
    restoreSidebarState() {
        try {
            if (localStorage.getItem('sidebar-collapsed') === 'true' && window.innerWidth >= 834) {
                this.elements.sidebar.classList.add('collapsed');
            }
        } catch {}
    },

    closeSidebar() {
        const el = this.elements;
        el.sidebar.classList.remove('open');
        el.sidebarOverlay.classList.remove('active');
        document.body.style.overflow = '';
    },

    handleResize() {
        if (window.innerWidth > 833) {
            this.closeSidebar();
        }
    },

    /* ---------- 新建对话弹窗 ---------- */

    showNewChatModal(allSubjects, onSubjectCardClick) {
        const el = this.elements;
        if (el.subjectGrid) {
            el.subjectGrid.innerHTML = '';
            const subjectOrder = [
                'ict', 'ces', 'history',
                'chinese', 'english',
                'math', 'physics', 'chemistry', 'biology', 'science',
                'economics', 'geography', 'visual_arts'
            ];

            const renderSubject = (code) => {
                const info = ChatApp._getSubjectInfo(code);
                const card = document.createElement('div');
                card.className = 'subject-card';
                card.innerHTML = `
                    <div class="subject-card-icon">${info.icon}</div>
                    <div class="subject-card-name">${info.name}</div>
                `;
                card.addEventListener('click', (e) => onSubjectCardClick(code, info, e));
                el.subjectGrid.appendChild(card);
            };

            for (const code of subjectOrder) {
                if (allSubjects[code]) renderSubject(code);
            }
            for (const code of Object.keys(allSubjects)) {
                if (!subjectOrder.includes(code)) renderSubject(code);
            }
        }

        // 重置
        ChatApp._selectedSubjectCode = null;
        ChatApp._selectedSubjectInfo = null;
        if (el.newChatNameSection) el.newChatNameSection.style.display = 'none';
        if (el.newChatNameInput) el.newChatNameInput.value = '';

        el.newChatModal.style.display = 'flex';
    },

    hideNewChatModal() {
        this.elements.newChatModal.style.display = 'none';
    },

    /* ---------- 对话列表 ---------- */

    renderConversations(conversations, currentConversationId) {
        const list = this.elements.conversationsList;
        list.innerHTML = '';

        const seenIds = new Set();
        const unique = conversations.filter(conv => {
            if (seenIds.has(conv.id)) return false;
            seenIds.add(conv.id);
            return true;
        });

        unique.forEach(conv => {
            const item = document.createElement('div');
            item.className = 'conversation-item';
            if (conv.id === currentConversationId) {
                item.classList.add('active');
            }
            const subjectInfo = ChatApp._getSubjectInfo(conv.subject);
            item.innerHTML = `
                <div class="conversation-title">${subjectInfo.icon} ${conv.title}</div>
                <div class="conversation-meta">${conv.message_count || 0} ${i18n.t('chat.msgCount')} · ${ChatApp._formatDate(conv.updated_at)}</div>
                <button class="delete-conversation-btn" title="${i18n.t('chat.deleteChat')}">×</button>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-conversation-btn')) {
                    ChatApp.loadConversation(conv.id);
                }
            });

            const deleteBtn = item.querySelector('.delete-conversation-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                ChatApp._showConfirmDelete(conv);
            });

            list.appendChild(item);
        });
    },

    /* ---------- 学科选择器 ---------- */

    updateSubjectSelector(allSubjects, currentSubject) {
        const sel = this.elements.subjectSelector;
        if (!sel) return;
        sel.innerHTML = '';

        const subjectOrder = [
            'ict', 'ces', 'history',
            'chinese', 'english',
            'math', 'physics', 'chemistry', 'biology', 'science',
            'economics', 'geography', 'visual_arts'
        ];

        const addOption = (code, subject) => {
            let icon = subject.icon;
            if (!icon && subject.config) icon = subject.config.icon;
            icon = icon || '📚';
            const option = document.createElement('option');
            option.value = code;
            option.textContent = `${icon} ${subject.name}`;
            sel.appendChild(option);
        };

        for (const code of subjectOrder) {
            if (allSubjects[code]) addOption(code, allSubjects[code]);
        }
        for (const [code, subject] of Object.entries(allSubjects)) {
            if (!subjectOrder.includes(code)) addOption(code, subject);
        }

        if (currentSubject && allSubjects[currentSubject]) {
            sel.value = currentSubject;
        } else if (Object.keys(allSubjects).length > 0) {
            sel.value = Object.keys(allSubjects)[0];
        }
    },

    updateSubjectTitle(subjectInfo) {
        this.elements.headerTitle.textContent = `${subjectInfo.icon} ${subjectInfo.name} ${i18n.t('chat.headerTitle')}`;
    },

    /* ---------- 功能列表 ---------- */

    updateFeatureList(allSubjects) {
        const el = this.elements.featureList;
        if (!el) return;

        const count = Object.keys(allSubjects).length;
        el.innerHTML = `
            <div class="feature-item">
                <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                <span>${i18n.t('chat.featureSubjects', {count})}</span>
            </div>
            <div class="feature-item">
                <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a8 8 0 0 0-8 8c0 3.4 2.1 6.3 5 7.5V20a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.5c2.9-1.2 5-4.1 5-7.5a8 8 0 0 0-8-8z"/><line x1="10" y1="22" x2="14" y2="22"/>
                </svg>
                <span>${i18n.t('chat.featureThinking')}</span>
            </div>
            <div class="feature-item">
                <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 8v4l3 3"/><circle cx="12" cy="12" r="10"/>
                </svg>
                <span>${i18n.t('chat.featureMemory')}</span>
            </div>
            <div class="feature-item">
                <svg class="feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                </svg>
                <span>${i18n.t('chat.featureUpload')}</span>
            </div>
        `;
    },

    /* ---------- 消息区域 ---------- */

    clearMessages() {
        this.elements.messagesContainer.innerHTML = '';
    },

    addWelcomeMessage(currentSubject, currentUser, userInfo) {
        const subjectInfo = ChatApp._getSubjectInfo(currentSubject);
        this.elements.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-title">${i18n.t('chat.welcomeUser', {name: userInfo?.display_name || currentUser})}</div>
                <div class="welcome-subtitle">${i18n.t('chat.welcomeUseSubject', {subject: subjectInfo.name})}</div>
                <div class="feature-list" id="welcomeFeatureList">
                    <div class="feature-item">${i18n.t('chat.featureLocal')}</div>
                    <div class="feature-item">${i18n.t('chat.featureUploadDetail')}</div>
                </div>
            </div>
        `;
    },

    scrollToBottom(force = false) {
        const container = this.elements.messagesContainer;
        const threshold = 150;
        const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < threshold;
        if (isNearBottom || force) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight;
            });
        }
    },

    autoResizeTextarea() {
        const input = this.elements.messageInput;
        input.style.height = 'auto';
        input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    },

    /* ---------- 文件相关 ---------- */

    addFileProcessingIndicator(file, sanitizeId) {
        const filesDiv = this.elements.conversationFiles;
        if (!filesDiv) return;

        const processingItem = document.createElement('div');
        processingItem.className = 'file-processing-item';
        processingItem.id = `processing-${sanitizeId(file.name)}`;
        processingItem.innerHTML = `
            <div class="file-processing-spinner"></div>
            <span>${i18n.t('chat.processing', {name: file.name})}</span>
        `;
        filesDiv.appendChild(processingItem);
        filesDiv.style.display = 'block';
    },

    removeFileProcessingIndicator(fileName, sanitizeId) {
        const item = document.getElementById(`processing-${sanitizeId(fileName)}`);
        if (item) item.remove();
    },

    addConversationFileItem(fileData, getFileIcon, formatFileSize) {
        const filesDiv = this.elements.conversationFiles;
        if (!filesDiv) return;

        const processingInfo = fileData.processedLocally
            ? i18n.t('chat.processedFrontend')
            : fileData.processedByBackend ? i18n.t('chat.processedBackend') : '';

        const fileItem = document.createElement('div');
        fileItem.className = 'conversation-file-item';
        fileItem.innerHTML = `
            <span class="conversation-file-icon">${getFileIcon(fileData.name)}</span>
            <div class="conversation-file-info">
                <div class="conversation-file-name">${fileData.name} ${processingInfo}</div>
                <div class="conversation-file-size">${formatFileSize(fileData.size)}</div>
            </div>
            <button class="conversation-file-remove" data-filename="${fileData.name}">×</button>
        `;

        // Bind remove button
        fileItem.querySelector('.conversation-file-remove').addEventListener('click', () => {
            ChatApp.removeConversationFile(fileData.name);
        });

        filesDiv.appendChild(fileItem);
        filesDiv.style.display = 'block';
    },

    clearConversationFiles() {
        const filesDiv = this.elements.conversationFiles;
        if (filesDiv) {
            filesDiv.innerHTML = '';
            filesDiv.style.display = 'none';
        }
    },

    /* ---------- Toast / Status ---------- */

    showStatusMessage(message, duration = 3000) {
        const statusDiv = document.createElement('div');
        statusDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            padding: 12px 16px;
            border-radius: 8px;
            border: 1px solid var(--border-color);
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            z-index: 9999;
            font-size: 14px;
            max-width: 300px;
            word-wrap: break-word;
        `;
        statusDiv.textContent = message;
        document.body.appendChild(statusDiv);
        setTimeout(() => {
            if (document.body.contains(statusDiv)) {
                document.body.removeChild(statusDiv);
            }
        }, duration);
    },

    /* ---------- 打字指示器 ---------- */

    addTypingIndicator(currentSubject) {
        const subjectInfo = ChatApp._getSubjectInfo(currentSubject);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.id = 'typing-indicator';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = `
            <div class="subject-badge">${subjectInfo.icon} ${subjectInfo.name}</div>
            <div class="typing-indicator">
                ${i18n.t('chat.submitting')}
                <div class="typing-dots">
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                    <div class="typing-dot"></div>
                </div>
            </div>
        `;

        messageDiv.appendChild(bubbleDiv);
        this.elements.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom(true);
        return messageDiv;
    },

    removeTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        if (indicator) indicator.remove();
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([this.elements.messagesContainer]);
        }
    },

    /* ---------- 流式消息 ---------- */

    createStreamingMessage(currentSubject) {
        const subjectInfo = ChatApp._getSubjectInfo(currentSubject);

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        // 学科标签
        const badgeDiv = document.createElement('div');
        badgeDiv.className = 'subject-badge';
        badgeDiv.textContent = `${subjectInfo.icon} ${subjectInfo.name}`;
        bubbleDiv.appendChild(badgeDiv);

        // Thinking 区域（初始隐藏）
        const thinkingSection = document.createElement('div');
        thinkingSection.className = 'reasoning-section';
        thinkingSection.style.display = 'none';
        thinkingSection.innerHTML = `
            <div class="section-header section-header-toggle">
                <span>${i18n.t('chat.thinking')}</span>
                <span class="collapse-indicator expanded">▾</span>
            </div>
            <div class="section-content">
                <span class="streaming-text-thinking"></span>
                <span class="streaming-cursor"></span>
            </div>
        `;
        bubbleDiv.appendChild(thinkingSection);

        // 绑定 thinking section toggle
        thinkingSection.querySelector('.section-header-toggle').addEventListener('click', function () {
            this.nextElementSibling.classList.toggle('collapsed');
            this.querySelector('.collapse-indicator').classList.toggle('expanded');
        });

        // Answer 区域
        const answerDiv = document.createElement('div');
        answerDiv.className = 'answer-content';
        answerDiv.innerHTML = '<span class="streaming-text-answer"></span><span class="streaming-cursor"></span>';
        answerDiv.style.display = 'none';
        bubbleDiv.appendChild(answerDiv);

        messageDiv.appendChild(bubbleDiv);
        this.elements.messagesContainer.appendChild(messageDiv);
        this.scrollToBottom(true);

        return {
            messageDiv,
            bubbleDiv,
            thinkingSection,
            thinkingText: thinkingSection.querySelector('.streaming-text-thinking'),
            thinkingCursor: thinkingSection.querySelector('.streaming-cursor'),
            answerDiv,
            answerText: answerDiv.querySelector('.streaming-text-answer'),
            answerCursor: answerDiv.querySelector('.streaming-cursor'),
            fullThinking: '',
            fullAnswer: '',
            phase: 'init'
        };
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const ChatApp = {

    /* ---------- 狀態 ---------- */

    state: {
        authToken: null,
        currentUser: null,
        userInfo: null,
        userRole: 'student',
        isAdmin: false,
        isTeacher: false,

        currentConversationId: null,
        currentSubject: 'ict',
        currentMode: 'local',
        websocket: null,
        conversations: [],
        isStreaming: false,
        allSubjects: {},

        enableThinking: true,

        // 文件上传
        conversationFiles: [],
        processingFiles: new Set()
    },

    // 新建对话弹窗临时状态
    _selectedSubjectCode: null,
    _selectedSubjectInfo: null,
    _newChatResolve: null,
    _pendingDeleteAction: null,

    /* ---------- 初始化 ---------- */

    async init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();
        ChatUI.cacheElements();
        ChatUI.restoreSidebarState();

        this.state.authToken = AuthModule.getToken();

        // 无 token 直接跳转登入页
        if (!this.state.authToken) {
            window.location.href = '/';
            return;
        }

        this._bindEvents();

        // 验证 token
        await this._verifyToken();

        // 延迟绑定文件上传事件
        setTimeout(() => this._bindFileUploadEvents(), 100);
    },

    /* ---------- 事件绑定 ---------- */

    _bindEvents() {
        const el = ChatUI.elements;

        // 用户菜单
        el.userInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            ChatUI.toggleUserMenu();
        });
        document.addEventListener('click', () => {
            ChatUI.hideUserMenu();
        });
        el.viewProfile.addEventListener('click', () => this._showProfile());

        if (el.viewReport) {
            el.viewReport.addEventListener('click', () => {
                ChatUI.hideUserMenu();
                window.location.href = '/student-report';
            });
        }

        el.changePassword.addEventListener('click', () => ChatUI.showChangePasswordModal());
        el.logoutButton.addEventListener('click', () => this.logout());

        if (el.adminPanel) {
            el.adminPanel.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 密码修改
        el.changePasswordForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._handleChangePassword();
        });
        el.cancelPasswordChange.addEventListener('click', () => ChatUI.hideChangePasswordModal());

        // 确认删除
        el.confirmCancel.addEventListener('click', () => {
            ChatUI.hideConfirmDialog();
            this._pendingDeleteAction = null;
        });
        el.confirmDelete.addEventListener('click', () => {
            if (this._pendingDeleteAction) {
                this._pendingDeleteAction();
            }
            ChatUI.hideConfirmDialog();
            this._pendingDeleteAction = null;
        });

        // 学科/模式选择
        el.subjectSelector.addEventListener('change', (e) => this._changeSubject(e.target.value));
        el.modeSelector.addEventListener('change', () => this._changeMode());

        // 侧边栏
        el.sidebarToggle.addEventListener('click', () => ChatUI.toggleSidebar());
        if (el.sidebarMobileToggle) el.sidebarMobileToggle.addEventListener('click', () => ChatUI.toggleSidebar());
        el.sidebarOverlay.addEventListener('click', () => ChatUI.closeSidebar());
        el.sidebarCloseBtn.addEventListener('click', () => ChatUI.closeSidebar());

        // 新建对话
        el.newChatButton.addEventListener('click', () => this.createNewConversation());

        // 发送消息
        el.sendButton.addEventListener('click', () => this.sendMessage());
        el.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 思考模式
        if (el.thinkingToggle) {
            el.thinkingToggle.addEventListener('change', (e) => {
                this.state.enableThinking = e.target.checked;
            });
        }

        // 新建对话弹窗
        if (el.newChatModalClose) {
            el.newChatModalClose.addEventListener('click', () => this._hideNewChatModal());
        }
        if (el.newChatModal) {
            el.newChatModal.addEventListener('click', (e) => {
                if (e.target === el.newChatModal) this._hideNewChatModal();
            });
        }
        if (el.newChatConfirmBtn) {
            el.newChatConfirmBtn.addEventListener('click', () => this._confirmNewChat());
        }
        if (el.newChatNameInput) {
            el.newChatNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this._confirmNewChat();
            });
        }

        // 自动调整输入框高度
        el.messageInput.addEventListener('input', () => ChatUI.autoResizeTextarea());

        // 返回首页 — redirect to '/'
        if (el.backToHomeBtn) {
            el.backToHomeBtn.addEventListener('click', () => {
                window.location.href = '/';
            });
        }

        // 管理后台按钮
        if (el.adminButton) {
            el.adminButton.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 窗口大小改变
        window.addEventListener('resize', () => ChatUI.handleResize());
    },

    _bindFileUploadEvents() {
        const el = ChatUI.elements;
        if (!el.fileUploadBtn || !el.fileUploadInput) return;

        el.fileUploadBtn.addEventListener('click', () => {
            el.fileUploadInput.click();
        });

        el.fileUploadInput.addEventListener('change', (e) => {
            this._handleConversationFileSelect(Array.from(e.target.files));
            e.target.value = '';
        });

        if (el.inputContainer) {
            el.inputContainer.addEventListener('dragover', (e) => {
                e.preventDefault();
                el.inputContainer.classList.add('drag-over');
            });
            el.inputContainer.addEventListener('dragleave', (e) => {
                e.preventDefault();
                el.inputContainer.classList.remove('drag-over');
            });
            el.inputContainer.addEventListener('drop', (e) => {
                e.preventDefault();
                el.inputContainer.classList.remove('drag-over');
                this._handleConversationFileSelect(Array.from(e.dataTransfer.files));
            });
        }
    },

    /* ---------- 认证 ---------- */

    async _verifyToken() {
        try {
            const response = await ChatAPI.verify();
            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error(i18n.t('token.verifyFailed'));
                const userProfile = result.data;
                this.state.currentUser = userProfile.username;
                this.state.userRole = userProfile.role || 'student';
                this.state.isAdmin = (this.state.userRole === 'admin');
                this.state.isTeacher = (this.state.userRole === 'teacher');
                ChatUI.updateUserDisplay(userProfile);

                await this._loadSubjectOptions();
                await this._loadConversations();
                this._setupWebSocket();
                this._checkSystemStatus();

                if (this.state.isAdmin || this.state.isTeacher) {
                    ChatUI.showAdminFeatures(this.state.isTeacher);
                }

                this.state.userInfo = userProfile;
            } else {
                throw new Error(i18n.t('token.verifyFailed'));
            }
        } catch (error) {
            console.error('Token verify error:', error);
            this._clearAuth();
            window.location.href = '/';
        }
    },

    logout() {
        this._clearAuth();
        if (this.state.websocket) {
            this.state.websocket.close();
        }
        window.location.href = '/';
    },

    _clearAuth() {
        this.state.authToken = null;
        this.state.currentUser = null;
        this.state.userInfo = null;
        this.state.isAdmin = false;
        AuthModule.clearAll();
    },

    /* ---------- 用户操作 ---------- */

    _showProfile() {
        ChatUI.hideUserMenu();
        const info = this.state.userInfo;
        if (info) {
            const lines = [
                `${i18n.t('chat.labelUsername')}: ${info.username}`,
                `${i18n.t('chat.labelDisplayName')}: ${info.display_name || i18n.t('home.defaultUser')}`,
                `${i18n.t('chat.labelClass')}: ${info.class_name || i18n.t('home.defaultClass')}`,
                `${i18n.t('chat.labelLoginCount')}: ${info.login_count || 0}`,
                `${i18n.t('chat.labelLastLogin')}: ${info.last_login ? new Date(info.last_login).toLocaleString() : 'N/A'}`
            ];
            if (this.state.isAdmin) {
                lines.push(i18n.t('chat.labelPermission') + ': Admin');
            }
            alert(i18n.t('chat.profileTitle') + '\n\n' + lines.join('\n'));
        }
    },

    async _handleChangePassword() {
        const el = ChatUI.elements;
        const oldPassword = el.oldPasswordInput.value;
        const newPassword = el.newPasswordInput.value;
        const confirmPassword = el.confirmPasswordInput.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            el.passwordError.textContent = i18n.t('password.emptyFields');
            return;
        }
        if (newPassword.length < 4) {
            el.passwordError.textContent = i18n.t('password.tooShort');
            return;
        }
        if (newPassword !== confirmPassword) {
            el.passwordError.textContent = i18n.t('password.mismatch');
            return;
        }

        try {
            const response = await ChatAPI.changePassword(oldPassword, newPassword);
            const result = await response.json();
            if (response.ok && result.success) {
                alert(i18n.t('password.success'));
                ChatUI.hideChangePasswordModal();
            } else {
                el.passwordError.textContent = result.detail || i18n.t('password.failed');
            }
        } catch (error) {
            console.error('Change password error:', error);
            el.passwordError.textContent = i18n.t('common.networkError');
        }
    },

    /* ---------- 学科管理 ---------- */

    async _loadSubjectOptions() {
        try {
            const response = await ChatAPI.fetchSubjects();
            if (response.ok) {
                const data = await response.json();
                let subjectsMap = {};

                if (data && data.subjects && typeof data.subjects === 'object' && !Array.isArray(data.subjects)) {
                    for (const [code, subjectData] of Object.entries(data.subjects)) {
                        let icon = subjectData?.icon;
                        if (!icon && subjectData?.config) icon = subjectData.config.icon;
                        subjectsMap[code] = {
                            code,
                            name: subjectData?.name || code,
                            icon: icon || '📚',
                            description: subjectData?.description || subjectData?.config?.description || ''
                        };
                    }
                } else if (Array.isArray(data)) {
                    data.forEach(sd => {
                        if (!sd || !sd.code) return;
                        let icon = sd?.icon;
                        if (!icon && sd?.config) icon = sd.config.icon;
                        subjectsMap[sd.code] = {
                            code: sd.code,
                            name: sd?.name || sd.code,
                            icon: icon || '📚',
                            description: sd?.description || sd?.config?.description || ''
                        };
                    });
                } else if (Array.isArray(data?.subjects)) {
                    data.subjects.forEach(sd => {
                        if (!sd || !sd.code) return;
                        let icon = sd?.icon;
                        if (!icon && sd?.config) icon = sd.config.icon;
                        subjectsMap[sd.code] = {
                            code: sd.code,
                            name: sd?.name || sd.code,
                            icon: icon || '📚',
                            description: sd?.description || sd?.config?.description || ''
                        };
                    });
                }

                this.state.allSubjects = subjectsMap;
                ChatUI.updateSubjectSelector(this.state.allSubjects, this.state.currentSubject);
                ChatUI.updateFeatureList(this.state.allSubjects);

                if (Object.keys(this.state.allSubjects).length === 0) {
                    this._useDefaultSubjects();
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('Failed to load subjects:', error);
            this._useDefaultSubjects();
        }
    },

    _useDefaultSubjects() {
        const subjects = ['ict','ces','history','chinese','english','math','physics','chemistry','biology','science','economics','geography','visual_arts'];
        this.state.allSubjects = {};
        for (const code of subjects) {
            const key = code === 'visual_arts' ? 'va' : code;
            this.state.allSubjects[code] = {
                code,
                name: i18n.t(`subject.${key}`),
                icon: '📚',
                description: i18n.t(`subject.${key}.desc`)
            };
        }
        ChatUI.updateSubjectSelector(this.state.allSubjects, this.state.currentSubject);
        ChatUI.updateFeatureList(this.state.allSubjects);
    },

    _getSubjectInfo(subjectCode) {
        const subject = this.state.allSubjects[subjectCode];
        if (subject) {
            let icon = subject.icon;
            if (!icon && subject.config) icon = subject.config.icon;
            return {
                code: subjectCode,
                name: subject.name || subjectCode,
                icon: icon || '📚'
            };
        }
        return { code: subjectCode, name: subjectCode, icon: '📚' };
    },

    _changeSubject(subject) {
        this.state.currentSubject = subject;
        this._updateSubjectTitle();
    },

    _changeMode() {
        this.state.currentMode = 'local';
        this._updateSubjectTitle();
    },

    _updateSubjectTitle() {
        const info = this._getSubjectInfo(this.state.currentSubject);
        ChatUI.updateSubjectTitle(info);
    },

    /* ---------- 系统状态 ---------- */

    async _checkSystemStatus() {
        try {
            const response = await ChatAPI.verify();
            ChatUI.updateStatusIndicator(response.ok);
        } catch (error) {
            console.error('Failed to check system status:', error);
            ChatUI.updateStatusIndicator(false);
        }
    },

    _setupWebSocket() {
        // WebSocket 逻辑（如果需要的话）
    },

    /* ---------- 对话管理 ---------- */

    async _loadConversations() {
        try {
            const response = await ChatAPI.fetchConversations(this.state.currentUser);
            const result = await response.json();
            this.state.conversations = result.conversations;
            ChatUI.renderConversations(this.state.conversations, this.state.currentConversationId);
        } catch (error) {
            console.error('Failed to load conversations:', error);
        }
    },

    _formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (messageDate.getTime() === today.getTime()) {
            return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
        }
    },

    async loadConversation(conversationId) {
        try {
            if (!this.state.currentUser) {
                console.warn('currentUser not set, cannot load conversation');
                return;
            }
            const response = await ChatAPI.fetchConversation(this.state.currentUser, conversationId);
            if (!response.ok) {
                console.error('Failed to load conversation:', response.status);
                return;
            }
            const conversation = await response.json();

            this.state.currentConversationId = conversationId;
            this.state.currentSubject = conversation.subject || '';
            const sel = ChatUI.elements.subjectSelector;
            if (sel) sel.value = conversation.subject || '';
            this._updateSubjectTitle();

            ChatUI.clearMessages();
            this._clearConversationFiles();

            const messages = conversation.messages || [];
            if (messages.length === 0) {
                ChatUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
            } else {
                messages.forEach(msg => {
                    this._addMessage(msg.role, msg.content, msg.thinking);
                });
            }

            ChatUI.renderConversations(this.state.conversations, this.state.currentConversationId);
            ChatUI.scrollToBottom(true);
        } catch (error) {
            console.error('Failed to load conversation:', error);
        }
    },

    async createNewConversation() {
        return new Promise((resolve) => {
            this._newChatResolve = resolve;
            ChatUI.showNewChatModal(
                this.state.allSubjects,
                (code, info, e) => this._onSubjectCardClick(code, info, e)
            );
        });
    },

    _onSubjectCardClick(subjectCode, subjectInfo, e) {
        this._selectedSubjectCode = subjectCode;
        this._selectedSubjectInfo = subjectInfo;

        const el = ChatUI.elements;
        el.subjectGrid.querySelectorAll('.subject-card').forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');

        el.newChatNameSection.style.display = '';
        el.newChatNameInput.value = `${subjectInfo.name} ${i18n.t('chat.conversation')}`;
        el.newChatNameInput.focus();
        el.newChatNameInput.select();
    },

    async _confirmNewChat() {
        const subjectCode = this._selectedSubjectCode;
        const subjectInfo = this._selectedSubjectInfo;
        if (!subjectCode) return;

        const el = ChatUI.elements;
        const title = el.newChatNameInput.value.trim() || `${subjectInfo.icon} ${subjectInfo.name} ${i18n.t('chat.conversation')}`;

        this._hideNewChatModal();

        this.state.currentSubject = subjectCode;
        if (el.subjectSelector) el.subjectSelector.value = subjectCode;
        this._updateSubjectTitle();

        try {
            const response = await ChatAPI.createConversation(this.state.currentUser, title, subjectCode);
            const result = await response.json();
            this.state.currentConversationId = result.conversation_id;
            ChatUI.clearMessages();
            ChatUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
            this._clearConversationFiles();
            this._loadConversations();
        } catch (error) {
            console.error('Failed to create conversation:', error);
            ChatUI.showStatusMessage(i18n.t('chat.errorCreateConvRetry'), 3000);
        }

        if (this._newChatResolve) {
            const resolve = this._newChatResolve;
            this._newChatResolve = null;
            resolve();
        }
    },

    _hideNewChatModal() {
        ChatUI.hideNewChatModal();
        if (this._newChatResolve) {
            const resolve = this._newChatResolve;
            this._newChatResolve = null;
            resolve();
        }
    },

    _showConfirmDelete(conv) {
        this._pendingDeleteAction = () => this._deleteConversation(conv.id, conv.title);
        ChatUI.showConfirmDialog(i18n.t('chat.confirmDeleteMsg', {title: conv.title}));
    },

    async _deleteConversation(conversationId, title) {
        try {
            const response = await ChatAPI.deleteConversation(this.state.currentUser, conversationId);
            if (response.ok) {
                await response.json();
                if (conversationId === this.state.currentConversationId) {
                    this.state.currentConversationId = null;
                    ChatUI.clearMessages();
                    ChatUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
                    this._clearConversationFiles();
                }
                this.state.conversations = this.state.conversations.filter(c => c.id !== conversationId);
                ChatUI.renderConversations(this.state.conversations, this.state.currentConversationId);
                ChatUI.showStatusMessage(i18n.t('chat.convDeleted', {title}), 3000);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || i18n.t('chat.errorDeleteFailed'));
            }
        } catch (error) {
            console.error('Failed to delete conversation:', error);
            alert(`${i18n.t('chat.errorDeleteFailed')}: ${error.message}`);
        }
    },

    /* ---------- 文件上传 ---------- */

    async _handleConversationFileSelect(files) {
        for (const file of files) {
            if (this.state.processingFiles.has(file.name)) continue;
            if (!this._validateFile(file)) continue;

            ChatUI.addFileProcessingIndicator(file, this._sanitizeId);

            try {
                let fileData;
                const fileName = file.name.toLowerCase();

                if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
                    const content = await this._processFileLocally(file);
                    fileData = {
                        name: file.name,
                        size: file.size,
                        content,
                        uploadTime: new Date().toISOString(),
                        processedLocally: true
                    };
                } else {
                    fileData = await this._processFileViaBackend(file);
                }

                ChatUI.removeFileProcessingIndicator(file.name, this._sanitizeId);
                this._addConversationFile(fileData);
            } catch (error) {
                console.error('File processing failed:', error);
                ChatUI.removeFileProcessingIndicator(file.name, this._sanitizeId);
                ChatUI.showStatusMessage(`${i18n.t('chat.errorBackendProcess')}: ${file.name} - ${error.message}`, 5000);
            }
        }
    },

    _validateFile(file) {
        if (file.size > 100 * 1024 * 1024) {
            ChatUI.showStatusMessage(i18n.t('chat.errorFileSize'), 5000);
            return false;
        }
        const supportedExts = ['.txt', '.md', '.docx', '.pdf', '.pptx'];
        const fileName = file.name.toLowerCase();
        const isSupported = supportedExts.some(ext => fileName.endsWith(ext));
        if (!isSupported) {
            ChatUI.showStatusMessage(i18n.t('chat.errorFileFormat') + ' ' + supportedExts.join(', '), 5000);
            return false;
        }
        if (this.state.conversationFiles.some(f => f.name === file.name)) {
            ChatUI.showStatusMessage(i18n.t('chat.errorFileDuplicate', {name: file.name}), 3000);
            return false;
        }
        return true;
    },

    async _processFileLocally(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error(i18n.t('chat.errorFileRead')));
            reader.readAsText(file, 'utf-8');
        });
    },

    async _processFileViaBackend(file) {
        try {
            const response = await ChatAPI.processTempFile(file);
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(errorData.detail || errorData.message || i18n.t('chat.errorBackendProcess'));
                } catch (parseError) {
                    if (parseError.message.includes('detail') || parseError.message.includes('Backend')) {
                        throw parseError;
                    }
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || i18n.t('chat.errorBackendProcess'));
            }
            const data = result.data || result;
            return {
                name: file.name,
                size: file.size,
                type: file.type,
                content: data.content,
                uploadTime: new Date().toISOString(),
                tempFileId: data.temp_file_id,
                processedByBackend: true
            };
        } catch (error) {
            if (error.message.includes('Failed to fetch') || error.message.includes('network')) {
                throw new Error(i18n.t('chat.errorBackendProcess') + ': ' + file.name);
            }
            throw error;
        }
    },

    _addConversationFile(fileData) {
        this.state.conversationFiles.push(fileData);
        ChatUI.addConversationFileItem(fileData, this._getFileIcon, this._formatFileSize);

        const msg = `${fileData.name} ${i18n.t('chat.fileAdded')} ${fileData.processedLocally ? i18n.t('chat.processedFrontend') : i18n.t('chat.processedBackend')}`;
        ChatUI.showStatusMessage(msg, 3000);
    },

    removeConversationFile(fileName) {
        this.state.conversationFiles = this.state.conversationFiles.filter(f => f.name !== fileName);
        const filesDiv = ChatUI.elements.conversationFiles;
        if (filesDiv) {
            const items = filesDiv.querySelectorAll('.conversation-file-item');
            items.forEach(item => {
                const nameEl = item.querySelector('.conversation-file-name');
                if (nameEl && nameEl.textContent.includes(fileName)) {
                    item.remove();
                }
            });
            if (this.state.conversationFiles.length === 0) {
                filesDiv.style.display = 'none';
            }
        }
    },

    _clearConversationFiles() {
        this.state.conversationFiles = [];
        this.state.processingFiles.clear();
        ChatUI.clearConversationFiles();
    },

    _getFileIcon(filename) {
        const ext = filename.toLowerCase().split('.').pop();
        const icons = { txt: '📄', md: '📝', docx: '📘', pdf: '📕', pptx: '📊' };
        return icons[ext] || '📄';
    },

    _formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
        return Math.round(bytes / (1024 * 1024)) + ' MB';
    },

    _sanitizeId(str) {
        return str.replace(/[^a-zA-Z0-9]/g, '_');
    },

    /* ---------- 消息发送 ---------- */

    async sendMessage() {
        const el = ChatUI.elements;
        const message = el.messageInput.value.trim();

        if (!message && this.state.conversationFiles.length === 0) return;
        if (!message && this.state.conversationFiles.length > 0) {
            ChatUI.showStatusMessage(i18n.t('chat.errorEnterQuestion'), 3000);
            el.messageInput.focus();
            return;
        }
        if (this.state.isStreaming) return;

        this.state.isStreaming = true;
        el.sendButton.disabled = true;
        el.messageInput.disabled = true;
        el.messageInput.value = '';
        ChatUI.autoResizeTextarea();

        if (!this.state.currentConversationId) {
            await this.createNewConversation();
            if (!this.state.currentConversationId) {
                this.state.isStreaming = false;
                el.sendButton.disabled = false;
                el.messageInput.disabled = false;
                el.messageInput.value = message;
                return;
            }
        }

        const enhancedMessage = this._buildMessageWithFileContent(message);
        this._addUserMessageWithFiles(message);
        ChatUI.addTypingIndicator(this.state.currentSubject);

        try {
            const requestBody = {
                question: enhancedMessage,
                subject: this.state.currentSubject,
                use_api: false,
                model: 'deepseek-chat',
                conversation_id: this.state.currentConversationId,
                enable_thinking: this.state.enableThinking
            };

            const response = await ChatAPI.sendStreamMessage(requestBody);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // 不立刻移除 typing indicator — 排隊期間繼續顯示，
            // 等收到第一個 thinking/answer 事件時再替換為流式消息。
            // 使用 holder 讓 _handleStreamEvent 可以懶初始化 streamCtx。
            const ctxHolder = { ctx: null };

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let sseBuffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                sseBuffer += decoder.decode(value, { stream: true });
                const parts = sseBuffer.split('\n\n');
                sseBuffer = parts.pop() || '';

                for (const part of parts) {
                    this._processSSEPart(part, ctxHolder);
                }
            }

            if (sseBuffer.trim()) {
                this._processSSEPart(sseBuffer, ctxHolder);
            }

            // 清理：如果整個流只有 queue/meta 事件（沒有 thinking/answer），需要移除 indicator
            ChatUI.removeTypingIndicator();
            if (ctxHolder.ctx) {
                this._finalizeStreamingMessage(ctxHolder.ctx);
            }
            this._clearConversationFiles();
            await this._loadConversations();

        } catch (error) {
            console.error('Failed to send message:', error);
            ChatUI.removeTypingIndicator();
            const errorMessage = error.message === 'Failed to fetch'
                ? i18n.t('common.networkFailed')
                : i18n.t('chat.errorSendFailed') + ': ' + error.message;
            ChatUI.showStatusMessage(errorMessage, 5000);
            el.messageInput.value = message;
        } finally {
            this.state.isStreaming = false;
            el.sendButton.disabled = false;
            el.messageInput.disabled = false;
            el.messageInput.focus();
        }
    },

    _processSSEPart(partRaw, ctxHolder) {
        const partText = partRaw.trim();
        if (!partText) return;

        let eventType = null;
        let dataStr = null;
        for (const sLine of partText.split('\n')) {
            const sl = sLine.trim();
            if (sl.startsWith('event: ')) {
                eventType = sl.slice(7).trim();
            } else if (sl.startsWith('data: ')) {
                dataStr = sl.slice(6);
            }
        }

        if (dataStr) {
            try {
                const eventData = JSON.parse(dataStr);
                if (eventType) eventData.type = eventType;
                this._handleStreamEvent(eventData, ctxHolder);
            } catch (parseErr) {
                console.warn('SSE parse skipped:', partText.slice(0, 100));
            }
        }
    },

    /**
     * 確保 streamCtx 已創建（懶初始化）。
     * 在收到第一個 thinking/answer 事件時移除 typing indicator 並創建流式消息。
     */
    _ensureStreamCtx(ctxHolder) {
        if (!ctxHolder.ctx) {
            ChatUI.removeTypingIndicator();
            ctxHolder.ctx = ChatUI.createStreamingMessage(this.state.currentSubject);
        }
        return ctxHolder.ctx;
    },

    _handleStreamEvent(eventData, ctxHolder) {
        switch (eventData.type) {
            case 'meta':
                if (eventData.conversation_id) {
                    this.state.currentConversationId = eventData.conversation_id;
                }
                break;

            case 'queue': {
                // 排隊位置更新 — 更新 typing indicator 文案
                const pos = eventData.position;
                const total = eventData.total;
                const indicator = document.getElementById('typing-indicator');
                if (indicator) {
                    const bubble = indicator.querySelector('.typing-indicator');
                    if (bubble) {
                        bubble.childNodes[0].textContent = i18n.t('chat.queuePosition', {pos, total});
                        // 淡入效果讓學生感知隊列在動
                        bubble.style.transition = 'opacity 0.3s';
                        bubble.style.opacity = '0.7';
                        requestAnimationFrame(() => { bubble.style.opacity = '1'; });
                    }
                }
                break;
            }

            case 'thinking': {
                // 硬性規則：收到 thinking 立刻清空排隊提示，創建流式消息
                const ctx = this._ensureStreamCtx(ctxHolder);
                if (ctx.phase === 'init') {
                    ctx.phase = 'thinking';
                    ctx.thinkingSection.style.display = '';
                }
                ctx.fullThinking += (eventData.content || eventData.token || '');
                ctx.thinkingText.textContent = ctx.fullThinking;
                const thinkingSectionContent = ctx.thinkingSection.querySelector('.section-content');
                if (thinkingSectionContent) {
                    requestAnimationFrame(() => {
                        thinkingSectionContent.scrollTop = thinkingSectionContent.scrollHeight;
                    });
                }
                ChatUI.scrollToBottom();
                break;
            }

            case 'answer': {
                const ctx = this._ensureStreamCtx(ctxHolder);
                if (ctx.phase !== 'answer') {
                    ctx.phase = 'answer';
                    if (ctx.thinkingCursor) ctx.thinkingCursor.remove();
                    const contentEl = ctx.thinkingSection.querySelector('.section-content');
                    if (contentEl) contentEl.classList.add('collapsed');
                    const collapseIndicator = ctx.thinkingSection.querySelector('.collapse-indicator');
                    if (collapseIndicator) collapseIndicator.classList.remove('expanded');
                    ctx.answerDiv.style.display = '';
                }
                ctx.fullAnswer += (eventData.content || eventData.token || '');
                ctx.answerText.textContent = ctx.fullAnswer;
                ChatUI.scrollToBottom();
                break;
            }

            case 'done': {
                const ctx = this._ensureStreamCtx(ctxHolder);
                ctx.phase = 'done';
                if (eventData.full_answer) ctx.fullAnswer = eventData.full_answer;
                if (eventData.full_thinking || eventData.thinking) ctx.fullThinking = eventData.full_thinking || eventData.thinking;
                if (eventData.conversation_id) {
                    this.state.currentConversationId = eventData.conversation_id;
                }
                break;
            }

            case 'error':
                ChatUI.removeTypingIndicator();
                ChatUI.showStatusMessage(eventData.message || i18n.t('chat.aiBusy'), 5000);
                break;
        }
    },

    _finalizeStreamingMessage(ctx) {
        ctx.bubbleDiv.querySelectorAll('.streaming-cursor').forEach(el => el.remove());

        if (ctx.fullThinking) {
            const sections = this._parseThinkingContent(ctx.fullThinking);
            let thinkingHtml = '';

            if (sections.knowledge) {
                thinkingHtml += this._buildSectionHtml('knowledge-section', i18n.t('chat.knowledge'), sections.knowledge);
            }
            if (sections.reasoning) {
                thinkingHtml += this._buildSectionHtml('reasoning-section', i18n.t('chat.reasoning'), sections.reasoning);
            }
            if (sections.thinking) {
                thinkingHtml += this._buildSectionHtml('thinking-section', i18n.t('chat.thinkingNotes'), sections.thinking);
            }
            if (!thinkingHtml && ctx.fullThinking.trim()) {
                thinkingHtml = this._buildSectionHtml('reasoning-section', i18n.t('chat.thinking'), ctx.fullThinking);
            }

            ctx.thinkingSection.outerHTML = thinkingHtml;
        } else {
            ctx.thinkingSection.remove();
        }

        ctx.answerDiv.innerHTML = `<div class="answer-content">${this._formatTextWithMath(ctx.fullAnswer)}</div>`;

        this._renderMath(ctx.messageDiv);
        if (typeof Prism !== 'undefined' && Prism && typeof Prism.highlightAll === 'function') {
            Prism.highlightAll();
        }

        // Bind section-header-toggle events for the finalized sections
        ctx.bubbleDiv.querySelectorAll('.section-header').forEach(header => {
            if (!header._bound) {
                header._bound = true;
                header.addEventListener('click', function () {
                    this.nextElementSibling.classList.toggle('collapsed');
                    this.querySelector('.collapse-indicator').classList.toggle('expanded');
                });
            }
        });

        ChatUI.scrollToBottom(true);
    },

    _buildSectionHtml(sectionClass, title, content) {
        return `
            <div class="${sectionClass}">
                <div class="section-header">
                    <span>${title}</span>
                    <span class="collapse-indicator">▾</span>
                </div>
                <div class="section-content collapsed">${this._formatTextWithMath(content)}</div>
            </div>
        `;
    },

    /* ---------- 消息显示 ---------- */

    _addMessage(role, content, thinking) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}`;

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';

        if (role === 'assistant') {
            const subjectInfo = this._getSubjectInfo(this.state.currentSubject);
            let html = `<div class="subject-badge">${subjectInfo.icon} ${subjectInfo.name}</div>`;

            if (thinking) {
                const sections = this._parseThinkingContent(thinking);
                let hasSection = false;
                if (sections.knowledge) {
                    html += this._buildSectionHtml('knowledge-section', i18n.t('chat.knowledge'), sections.knowledge);
                    hasSection = true;
                }
                if (sections.reasoning) {
                    html += this._buildSectionHtml('reasoning-section', i18n.t('chat.reasoning'), sections.reasoning);
                    hasSection = true;
                }
                if (sections.thinking) {
                    html += this._buildSectionHtml('thinking-section', i18n.t('chat.thinkingNotes'), sections.thinking);
                    hasSection = true;
                }
                if (!hasSection && thinking.trim()) {
                    html += this._buildSectionHtml('reasoning-section', i18n.t('chat.thinking'), thinking);
                }
            }

            html += `<div class="answer-content">${this._formatTextWithMath(content)}</div>`;
            bubbleDiv.innerHTML = html;

            // Bind section toggle
            bubbleDiv.querySelectorAll('.section-header').forEach(header => {
                header.addEventListener('click', function () {
                    this.nextElementSibling.classList.toggle('collapsed');
                    this.querySelector('.collapse-indicator').classList.toggle('expanded');
                });
            });
        } else {
            bubbleDiv.innerHTML = this._formatTextWithMath(content);
        }

        messageDiv.appendChild(bubbleDiv);
        ChatUI.elements.messagesContainer.appendChild(messageDiv);
        this._renderMath(messageDiv);
        ChatUI.scrollToBottom(true);
        if (typeof Prism !== 'undefined' && Prism && typeof Prism.highlightAll === 'function') {
            Prism.highlightAll();
        }
    },

    _addUserMessageWithFiles(message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message user';

        let content = '<div class="message-bubble">';
        if (this.state.conversationFiles.length > 0) {
            content += '<div style="margin-bottom: 8px;">';
            this.state.conversationFiles.forEach(file => {
                content += `<span style="background: rgba(0,122,255,0.1); padding: 4px 8px; margin-right: 4px; border-radius: 12px; font-size: 12px;">📄 ${file.name}</span>`;
            });
            content += '</div>';
        }
        content += `<div>${this._escapeHtml(message)}</div></div>`;
        messageDiv.innerHTML = content;

        ChatUI.elements.messagesContainer.appendChild(messageDiv);
        ChatUI.scrollToBottom(true);
    },

    _buildMessageWithFileContent(userMessage) {
        let enhanced = '';
        if (this.state.conversationFiles.length > 0) {
            enhanced += i18n.t('chat.filesUploaded') + '\n\n';
            this.state.conversationFiles.forEach((file, index) => {
                enhanced += `${i18n.t('chat.fileContent')} ${index + 1}: ${file.name}\n`;
                enhanced += file.content;
                enhanced += '\n\n---\n\n';
            });
            enhanced += i18n.t('chat.questionAboutFiles') + '\n';
        }
        enhanced += userMessage;
        return enhanced;
    },

    /* ---------- 文本格式化 ---------- */

    _formatTextWithMath(text) {
        if (!text) return '';

        // 1. 提取并保护代码块
        const codeBlocks = {};
        let blockCounter = 0;

        // 1a. 正常闭合的代码块
        let processedText = text.replace(/```(\w+)?[ \t]*\n?([\s\S]*?)```/g,
            (match, language, code) => {
                const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                codeBlocks[placeholder] = { language, code };
                blockCounter++;
                return placeholder;
            }
        );

        // 1b. 未闭合的代码块
        processedText = processedText.replace(/```(\w+)?[ \t]*\n?([\s\S]+)$/g,
            (match, language, code) => {
                if (code.trim().length > 50) {
                    const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                    codeBlocks[placeholder] = { language: language || 'plaintext', code: code.trim() };
                    blockCounter++;
                    return placeholder;
                }
                return match;
            }
        );

        // 2. 检测未被代码块包裹的 HTML 内容
        processedText = processedText.replace(
            /((?:^|\n)\s*)(<!DOCTYPE[\s\S]*?<\/html\s*>)/gi,
            (match, prefix, htmlBlock) => {
                const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                codeBlocks[placeholder] = { language: 'html', code: htmlBlock };
                blockCounter++;
                return prefix + placeholder;
            }
        );
        processedText = processedText.replace(
            /((?:^|\n)\s*)(<html[\s\S]*?<\/html\s*>)/gi,
            (match, prefix, htmlBlock) => {
                const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                codeBlocks[placeholder] = { language: 'html', code: htmlBlock };
                blockCounter++;
                return prefix + placeholder;
            }
        );

        // 2b. 截断的 HTML 文档
        processedText = processedText.replace(
            /((?:^|\n)\s*)(<!DOCTYPE[\s\S]{100,})$/gi,
            (match, prefix, htmlBlock) => {
                const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                codeBlocks[placeholder] = { language: 'html', code: htmlBlock.trim() };
                blockCounter++;
                return prefix + placeholder;
            }
        );
        processedText = processedText.replace(
            /((?:^|\n)\s*)(<html[\s\S]{100,})$/gi,
            (match, prefix, htmlBlock) => {
                const placeholder = `%%CODE_BLOCK_${blockCounter}%%`;
                codeBlocks[placeholder] = { language: 'html', code: htmlBlock.trim() };
                blockCounter++;
                return prefix + placeholder;
            }
        );

        // 转义散落的 HTML 标签
        processedText = processedText
            .replace(/<(!DOCTYPE[^>]*)>/gi, '&lt;$1&gt;')
            .replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/</g, '&lt;').replace(/>/g, '&gt;'))
            .replace(/<(\/?(?:html|head|body|div|span|style|script|link|meta|title|form|input|button|table|tr|td|th|ul|ol|li|p|h[1-6]|img|a|iframe|canvas|svg|section|header|footer|nav|main|article|aside)(?:\s[^>]*)?)\/?\s*>/gi, '&lt;$1&gt;');

        // 3. 处理表格
        processedText = this._processMarkdownTables(processedText);

        // 4. 处理 Markdown 标题
        processedText = processedText.replace(/^#####\s+(.+?)[\r]?$/gm, '<h6 class="md-h6">$1</h6>');
        processedText = processedText.replace(/^####\s+(.+?)[\r]?$/gm, '<h5 class="md-h5">$1</h5>');
        processedText = processedText.replace(/^###\s+(.+?)[\r]?$/gm, '<h4 class="md-h4">$1</h4>');
        processedText = processedText.replace(/^##\s+(.+?)[\r]?$/gm, '<h3 class="md-h3">$1</h3>');
        processedText = processedText.replace(/^#\s+(.+?)[\r]?$/gm, '<h2 class="md-h2">$1</h2>');

        // 4b. 处理列表
        processedText = processedText.replace(/^-\s+(.+?)[\r]?$/gm,
            '<li style="margin-left: 20px; list-style-type: disc;">$1</li>');
        processedText = processedText.replace(/^\d+\.\s+(.+?)[\r]?$/gm,
            '<li style="margin-left: 20px; list-style-type: decimal;">$1</li>');

        // 5. 引用块
        processedText = processedText.replace(/^>\s+(.+?)[\r]?$/gm,
            '<blockquote class="md-blockquote">$1</blockquote>');

        // 6. 水平分割线
        processedText = processedText.replace(/^---+[\r]?$/gm, '<hr class="md-hr">');

        // 7. 其他格式
        processedText = processedText
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>');

        // 8. 清理多余 <br>
        processedText = processedText.replace(/(<\/h[2-6]>)<br>/g, '$1');
        processedText = processedText.replace(/<br>(<h[2-6])/g, '$1');
        processedText = processedText.replace(/(<\/li>)<br>/g, '$1');
        processedText = processedText.replace(/<br>(<li)/g, '$1');
        processedText = processedText.replace(/(<\/blockquote>)<br>/g, '$1');
        processedText = processedText.replace(/<br>(<blockquote)/g, '$1');
        processedText = processedText.replace(/(<hr class="md-hr">)<br>/g, '$1');
        processedText = processedText.replace(/<br>(<hr class="md-hr">)/g, '$1');
        processedText = processedText.replace(/<br>(<div class="table-)/g, '$1');
        processedText = processedText.replace(/(<\/table><\/div>)<br>/g, '$1');
        processedText = processedText.replace(/(<\/div>)<br>(<div class="table-)/g, '$1$2');

        // 9. 恢复代码块
        for (const [placeholder, block] of Object.entries(codeBlocks)) {
            const codeHtml = this._createCodeBlockHtml(block.code, block.language);
            processedText = processedText.replace(placeholder, codeHtml);
        }

        return processedText;
    },

    _detectCodeLanguage(code) {
        if (/^(import |from |def |class |print\(|if __name__)/m.test(code)) return 'python';
        if (/^(const |let |var |function |=>|console\.)/m.test(code)) return 'javascript';
        if (/^(public class |System\.out|private |protected )/m.test(code)) return 'java';
        if (/^(#include|int main|void |printf|scanf)/m.test(code)) return 'c';
        if (/^(std::|cout|cin|#include <iostream>)/m.test(code)) return 'cpp';
        if (/^(\$|#!\/bin\/(bash|sh)|apt |sudo |npm |pip |cd |ls |mkdir )/m.test(code)) return 'bash';
        if (/^\s*[\{\[]\s*"/.test(code)) return 'json';
        if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)/im.test(code)) return 'sql';
        if (/^[.#@][\w-]+\s*\{|^[\w-]+\s*:\s*[\w#]/m.test(code)) return 'css';
        if (/<[a-z][\s\S]*>/i.test(code)) return 'html';
        return 'plaintext';
    },

    _createCodeBlockHtml(code, language) {
        const blockId = `code-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        language = language || this._detectCodeLanguage(code);

        const escapedCode = code
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');

        const isHtml = (language || '').toLowerCase() === 'html';
        const previewBtnHtml = isHtml
            ? `<button class="preview-html-button" data-preview-id="${blockId}">${i18n.t('chat.preview')}</button>`
            : '';

        return `
            <div class="code-block-wrapper">
                <div class="code-block-header">
                    <span class="code-language">${(language || 'plaintext').toUpperCase()}</span>
                    <div class="code-block-actions">
                        ${previewBtnHtml}
                        <button class="copy-button" data-copy-id="${blockId}">${i18n.t('chat.copy')}</button>
                    </div>
                </div>
                <div class="code-block-content">
                    <pre id="${blockId}"><code class="language-${language || 'plaintext'}">${escapedCode}</code></pre>
                </div>
                ${isHtml ? `<div class="html-preview-container" id="preview-${blockId}" style="display:none;">
                    <div class="html-preview-header">
                        <span>${i18n.t('chat.htmlPreview')}</span>
                        <button class="preview-close-btn" data-close-preview-id="${blockId}">${i18n.t('chat.close')}</button>
                    </div>
                    <iframe class="html-preview-iframe" sandbox="allow-scripts allow-same-origin" title="HTML Preview"></iframe>
                </div>` : ''}
            </div>
        `;
    },

    _renderMath(element) {
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([element]);
        }
    },

    _parseThinkingContent(thinking) {
        const sections = { knowledge: null, reasoning: null, thinking: null };
        if (!thinking || typeof thinking !== 'string') return sections;

        const pairRegex = /【\s*([^】]+)\s*】([\s\S]*?)(?=【|$)/g;
        let m;
        while ((m = pairRegex.exec(thinking)) !== null) {
            const header = (m[1] || '').trim();
            const body = (m[2] || '').trim();
            if (!body) continue;

            const isKnowledge = /📚|知识库|检索|来源|引用|参考|sources?|reference|retrieval|embeddings?|向量|文档|文件|chunk|資料|資料來源/i.test(header);
            const isReasoning = /🧠|深度推理|推理过程|reasoning|analysis|chain|演绎|归纳/i.test(header);
            const isThinking = /💭|思考过程|思考|思维|思路|draft|plan|cot/i.test(header);

            if (isKnowledge) {
                const cleaned = body.replace(/^\s*(无|暂无|未找到)[^\n]*\n?/gmi, '').trim();
                if (cleaned && cleaned.length > 10) sections.knowledge = cleaned;
                continue;
            }
            if (isReasoning) { sections.reasoning = body; continue; }
            if (isThinking) { sections.thinking = body; continue; }

            if (/知识|检索|来源|参考/i.test(header)) {
                sections.knowledge = body;
            } else if (/推理|思考|思路/i.test(header)) {
                sections.thinking = body;
            }
        }

        if (sections.thinking && !sections.knowledge) {
            const t = sections.thinking;
            const kbScore =
                ((t.match(/https?:\/\//g) || []).length >= 1 ? 1 : 0) +
                (/来源|Source|Doc(?:ument)?|文档|文件|chunk|向量|embedding|检索|reference/i.test(t) ? 1 : 0) +
                ((t.match(/\[[0-9]+\]/g) || []).length >= 2 ? 1 : 0);
            if (kbScore >= 2) {
                sections.knowledge = sections.thinking;
                sections.thinking = null;
            }
        }

        return sections;
    },

    _processMarkdownTables(text) {
        const tableWithTitleRegex = /^(###?\s*\*?\*?([^*\n]+)\*?\*?)\s*\n\s*(\|[^\n]+\|)\s*\n\s*(\|[-:\s|]+\|)\s*\n((?:\s*\|[^\n]+\|\s*\n?)+)/gm;
        text = text.replace(tableWithTitleRegex, (match, titleLine, title, headerRow, separatorRow, dataRows) => {
            return this._renderMarkdownTable(headerRow.trim(), separatorRow.trim(), dataRows.trim(), title.trim());
        });

        const tableRegex = /^\s*(\|[^\n]+\|)\s*\n\s*(\|[-:\s|]+\|)\s*\n((?:\s*\|[^\n]+\|\s*\n?)+)/gm;
        text = text.replace(tableRegex, (match, headerRow, separatorRow, dataRows) => {
            if (!/-/.test(separatorRow)) return match;
            return this._renderMarkdownTable(headerRow.trim(), separatorRow.trim(), dataRows.trim());
        });

        return text;
    },

    _renderMarkdownTable(headerRow, separatorRow, dataRows, title) {
        try {
            const parseRow = (row) => {
                let cleaned = row.trim();
                if (cleaned.startsWith('|')) cleaned = cleaned.substring(1);
                if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
                return cleaned.split('|').map(cell => cell.trim());
            };

            const headers = parseRow(headerRow).map(h => h.replace(/\*\*/g, ''));
            if (headers.length === 0) {
                return headerRow + '\n' + separatorRow + '\n' + dataRows;
            }

            const rows = dataRows.trim().split('\n')
                .filter(row => row.trim().length > 0 && row.includes('|'))
                .map(row => parseRow(row))
                .filter(row => row.length > 0 && row.some(cell => cell.length > 0));

            if (rows.length === 0) {
                return headerRow + '\n' + separatorRow + '\n' + dataRows;
            }

            let tableHtml = '';
            if (title) tableHtml += `<div class="table-title">${title}</div>`;
            tableHtml += '<div class="table-container"><table class="ai-table"><thead><tr>';
            headers.forEach(header => {
                tableHtml += `<th>${this._escapeHtml(header)}</th>`;
            });
            tableHtml += '</tr></thead><tbody>';
            rows.forEach(row => {
                tableHtml += '<tr>';
                for (let i = 0; i < headers.length; i++) {
                    tableHtml += `<td>${this._escapeHtml(row[i] || '')}</td>`;
                }
                tableHtml += '</tr>';
            });
            tableHtml += '</tbody></table></div>';
            return tableHtml;

        } catch (error) {
            console.warn('Table parse failed:', error);
            return headerRow + '\n' + separatorRow + '\n' + dataRows;
        }
    },

    _escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/* ============================================================
   全局函數（代碼塊複製 / HTML 預覽）
   ============================================================ */

function copyCodeBlock(blockId, btn) {
    const codeBlock = document.getElementById(blockId);
    if (!codeBlock) return;
    navigator.clipboard.writeText(codeBlock.textContent).then(() => {
        if (btn) {
            btn.textContent = i18n.t('chat.copied');
            btn.style.background = '#4caf50';
            setTimeout(() => {
                btn.textContent = i18n.t('chat.copy');
                btn.style.background = '';
            }, 2000);
        }
    });
}

function previewHtmlCode(blockId) {
    const codeBlock = document.getElementById(blockId);
    const previewContainer = document.getElementById('preview-' + blockId);
    if (!codeBlock || !previewContainer) return;

    const htmlCode = codeBlock.textContent;
    const iframe = previewContainer.querySelector('.html-preview-iframe');

    previewContainer.style.display = 'block';

    let fullHtml = htmlCode.trim();
    if (!fullHtml.toLowerCase().startsWith('<!doctype') && !fullHtml.toLowerCase().startsWith('<html')) {
        fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; margin: 0; color: #333; }
        * { box-sizing: border-box; }
    </style>
</head>
<body>${fullHtml}</body>
</html>`;
    }

    iframe.srcdoc = fullHtml;

    iframe.onload = function () {
        try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            const height = Math.min(doc.body.scrollHeight + 32, 600);
            iframe.style.height = height + 'px';
        } catch (e) {
            iframe.style.height = '300px';
        }
    };
}

function closeHtmlPreview(blockId) {
    const previewContainer = document.getElementById('preview-' + blockId);
    if (previewContainer) {
        previewContainer.style.display = 'none';
        const iframe = previewContainer.querySelector('.html-preview-iframe');
        if (iframe) iframe.srcdoc = '';
    }
}

/* ============================================================
   事件委派：代碼塊按鈕（複製 / 預覽 / 關閉預覽）
   ============================================================ */

document.addEventListener('click', (e) => {
    // 複製按鈕
    const copyBtn = e.target.closest('[data-copy-id]');
    if (copyBtn) {
        copyCodeBlock(copyBtn.dataset.copyId, copyBtn);
        return;
    }
    // 預覽按鈕
    const previewBtn = e.target.closest('[data-preview-id]');
    if (previewBtn) {
        previewHtmlCode(previewBtn.dataset.previewId);
        return;
    }
    // 關閉預覽按鈕
    const closeBtn = e.target.closest('[data-close-preview-id]');
    if (closeBtn) {
        closeHtmlPreview(closeBtn.dataset.closePreviewId);
        return;
    }
});

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    ChatApp.init();

    // 初始化學習總結功能
    if (typeof LearningSummaryManager !== 'undefined') {
        window.learningSummaryManager = new LearningSummaryManager(ChatApp);
    }
});

// 全局引用（向後兼容 HTML 中的 window.app 引用）
window.app = ChatApp;
