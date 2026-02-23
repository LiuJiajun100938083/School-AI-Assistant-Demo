'use strict';

/**
 * 首頁（AI 學習夥伴）— 前端核心模組
 * ====================================
 *
 * 架構：
 *   IndexAPI  — API 請求封裝
 *   IndexUI   — DOM 渲染 / 介面操作
 *   IndexApp  — 主控制器（狀態、事件、業務流程）
 *
 * 依賴共享模組: AuthModule, UIModule, Utils, APIClient
 * 外部依賴:     PrismJS, MathJax, LearningSummaryManager（可選）
 * 加載順序: shared/* -> learning_modes_frontend.js -> learning_summary.js -> index.js
 */

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const IndexAPI = {

    /**
     * 通用請求封裝（附帶 JWT，自動處理 401）
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
            IndexApp._clearAuth();
            IndexUI.showLoginInterface();
            throw new Error('认证失效，请重新登录');
        }
        return resp;
    },

    async verify() {
        return this._fetch('/api/verify');
    },

    async login(username, password) {
        return this._fetch('/api/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });
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
    },

    async fetchApps() {
        return this._fetch('/api/apps');
    }
};

/* ============================================================
   UI — DOM 渲染 / 介面操作
   ============================================================ */

const IndexUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            // 登录
            loginContainer:      document.getElementById('loginContainer'),
            mainContainer:       document.getElementById('mainContainer'),
            homeContainer:       document.getElementById('homeContainer'),
            loginForm:           document.getElementById('loginForm'),
            usernameInput:       document.getElementById('usernameInput'),
            passwordInput:       document.getElementById('passwordInput'),
            loginButton:         document.getElementById('loginButton'),
            loginError:          document.getElementById('loginError'),
            loginLoading:        document.getElementById('loginLoading'),

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
            headerTitle:         document.getElementById('headerTitle'),
            subjectSelector:     document.getElementById('subjectSelector'),
            modeSelector:        document.getElementById('modeSelector'),
            statusIndicator:     document.getElementById('statusIndicator'),
            sidebar:             document.getElementById('sidebar'),
            sidebarToggle:       document.getElementById('sidebarToggle'),
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
            inputContainer:      document.getElementById('inputContainer'),

            // 首页
            homeAppsGrid:        document.getElementById('homeAppsGrid'),
            homeUserInfo:        document.getElementById('homeUserInfo'),
            homeUserAvatar:      document.getElementById('homeUserAvatar'),
            homeUserName:        document.getElementById('homeUserName'),
            homeUserClass:       document.getElementById('homeUserClass'),
            homeUserMenu:        document.getElementById('homeUserMenu'),
            homeAdminPanel:      document.getElementById('homeAdminPanel'),
            homeAdminSeparator:  document.getElementById('homeAdminSeparator'),

            // 启动画面
            splashScreen:        document.getElementById('splashScreen')
        };
    },

    /* ---------- 登录界面 ---------- */

    showLoginInterface() {
        const el = this.elements;
        el.loginContainer.style.display = 'flex';
        el.mainContainer.style.display = 'none';
        el.homeContainer.style.display = 'none';
        el.usernameInput.focus();
        if (typeof HudController !== 'undefined') HudController.reset();
    },

    showLoginError(message) {
        const el = this.elements;
        el.loginError.textContent = message;
        el.loginError.style.display = 'block';
    },

    hideLoginError() {
        this.elements.loginError.style.display = 'none';
    },

    showLoginLoading(show) {
        const el = this.elements;
        el.loginLoading.style.display = show ? 'block' : 'none';
        el.loginButton.disabled = show;
        el.loginButton.textContent = show ? '登录中...' : '登录';
    },

    /* ---------- 主界面 ---------- */

    showMainInterface() {
        const el = this.elements;
        el.loginContainer.style.display = 'none';
        el.homeContainer.style.display = 'flex';
        el.mainContainer.style.display = 'none';
    },

    showHome() {
        const el = this.elements;
        el.mainContainer.style.display = 'none';
        el.homeContainer.style.display = 'flex';
    },

    showChat() {
        const el = this.elements;
        el.homeContainer.style.display = 'none';
        el.mainContainer.style.display = 'flex';
    },

    /* ---------- 用户信息 ---------- */

    updateUserDisplay(userProfile) {
        const el = this.elements;
        el.userName.textContent = userProfile.display_name || userProfile.username;
        el.userClass.textContent = userProfile.class_name || '未分班';
        const firstChar = (userProfile.display_name || userProfile.username).charAt(0).toUpperCase();
        el.userAvatar.textContent = firstChar;
    },

    updateHomeUserInfo(info) {
        if (!info) return;
        const avatar = info.display_name ? info.display_name.charAt(0).toUpperCase() : 'A';
        const map = {
            homeUserAvatar: avatar,
            homeUserName: info.display_name || info.username || '學生',
            homeUserClass: info.class_name || '未分班'
        };
        for (const [id, val] of Object.entries(map)) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        }
        // 管理员面板
        if (info.role === 'admin' || info.role === 'teacher') {
            const ap = this.elements.homeAdminPanel;
            const as = this.elements.homeAdminSeparator;
            if (ap) ap.style.display = '';
            if (as) as.style.display = '';
        }
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
                ? '<span>⚙️</span>教學管理'
                : '<span>⚙️</span>管理后台';
        }
        if (el.adminPanel) el.adminPanel.style.display = 'flex';
        if (el.adminSeparator) el.adminSeparator.style.display = 'block';
    },

    /* ---------- 状态 ---------- */

    updateStatusIndicator(online) {
        const el = this.elements.statusIndicator;
        if (online) {
            el.className = 'status-indicator status-online';
            el.textContent = '● 連接正常';
        } else {
            el.className = 'status-indicator status-offline';
            el.textContent = '● 連接異常';
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
        const isOpen = el.sidebar.classList.toggle('open');
        el.sidebarOverlay.classList.toggle('active', isOpen);
        if (window.innerWidth <= 833) {
            document.body.style.overflow = isOpen ? 'hidden' : '';
        }
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
                const info = IndexApp._getSubjectInfo(code);
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
        IndexApp._selectedSubjectCode = null;
        IndexApp._selectedSubjectInfo = null;
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
            const subjectInfo = IndexApp._getSubjectInfo(conv.subject);
            item.innerHTML = `
                <div class="conversation-title">${subjectInfo.icon} ${conv.title}</div>
                <div class="conversation-meta">${conv.message_count || 0} 條訊息 · ${IndexApp._formatDate(conv.updated_at)}</div>
                <button class="delete-conversation-btn" title="刪除對話">×</button>
            `;

            item.addEventListener('click', (e) => {
                if (!e.target.classList.contains('delete-conversation-btn')) {
                    IndexApp.loadConversation(conv.id);
                }
            });

            const deleteBtn = item.querySelector('.delete-conversation-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                IndexApp._showConfirmDelete(conv);
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
        this.elements.headerTitle.textContent = `${subjectInfo.icon} ${subjectInfo.name} AI 學習夥伴`;
    },

    /* ---------- 功能列表 ---------- */

    updateFeatureList(allSubjects) {
        const el = this.elements.featureList;
        if (!el) return;

        let html = '';
        const codes = Object.keys(allSubjects).slice(0, 6);
        codes.forEach(code => {
            const s = allSubjects[code];
            html += `<div class="feature-item">${s.icon} <strong>${s.name}</strong>：${s.description || '學科知識輔導'}</div>`;
        });
        if (Object.keys(allSubjects).length > 6) {
            html += `<div class="feature-item">➕ 以及其他 ${Object.keys(allSubjects).length - 6} 個學科...</div>`;
        }
        html += `
            <div class="feature-item">🧠 <strong>推理模式</strong>：顯示AI完整思考過程</div>
            <div class="feature-item">💾 <strong>記憶功能</strong>：保存你的學習對話</div>
            <div class="feature-item">📎 <strong>文檔上傳</strong>：直接拖曳檔案到輸入框進行智能問答</div>
        `;
        el.innerHTML = html;
    },

    /* ---------- 首页应用卡片 ---------- */

    renderHomeApps(apps) {
        const grid = this.elements.homeAppsGrid;
        if (!grid) return;
        grid.innerHTML = apps.map(app => `
            <div class="home-app-card" data-app-id="${app.id}" data-app-url="${app.url}">
                <div class="tool-icon">${app.icon}</div>
                <div class="tool-name">${app.name}</div>
                <div class="tool-desc">${app.description}</div>
            </div>
        `).join('');
    },

    /* ---------- 消息区域 ---------- */

    clearMessages() {
        this.elements.messagesContainer.innerHTML = '';
    },

    addWelcomeMessage(currentSubject, currentUser, userInfo) {
        const subjectInfo = IndexApp._getSubjectInfo(currentSubject);
        this.elements.messagesContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-title">👋 欢迎，${userInfo?.display_name || currentUser}！</div>
                <div class="welcome-subtitle">开始使用 ${subjectInfo.name} AI 学习伙伴</div>
                <div class="feature-list" id="welcomeFeatureList">
                    <div class="feature-item">🖥️ <strong>本地模式</strong>：快速响应，精准问答</div>
                    <div class="feature-item">📎 <strong>文档上传</strong>：直接拖拽文件到输入框进行智能问答</div>
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
            <span>正在處理 "${file.name}"...</span>
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
            ? '(前端處理)'
            : fileData.processedByBackend ? '(後端處理)' : '';

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
            IndexApp.removeConversationFile(fileData.name);
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
        const subjectInfo = IndexApp._getSubjectInfo(currentSubject);
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message assistant';
        messageDiv.id = 'typing-indicator';

        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'message-bubble';
        bubbleDiv.innerHTML = `
            <div class="subject-badge">${subjectInfo.icon} ${subjectInfo.name}</div>
            <div class="typing-indicator">
                正在思考中
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
        const subjectInfo = IndexApp._getSubjectInfo(currentSubject);

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
                <span>思考過程</span>
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

const IndexApp = {

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
        IndexUI.cacheElements();

        this.state.authToken = AuthModule.getToken();

        this._bindEvents();

        // 检查认证状态
        if (this.state.authToken) {
            await this._verifyToken();
        } else {
            IndexUI.showLoginInterface();
        }

        // 延迟绑定文件上传事件
        setTimeout(() => this._bindFileUploadEvents(), 100);
    },

    /* ---------- 事件绑定 ---------- */

    _bindEvents() {
        const el = IndexUI.elements;

        // 登录
        el.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._login();
        });

        // 用户菜单
        el.userInfo.addEventListener('click', (e) => {
            e.stopPropagation();
            IndexUI.toggleUserMenu();
        });
        document.addEventListener('click', () => {
            IndexUI.hideUserMenu();
        });
        el.viewProfile.addEventListener('click', () => this._showProfile());

        if (el.viewReport) {
            el.viewReport.addEventListener('click', () => {
                IndexUI.hideUserMenu();
                window.location.href = '/student-report';
            });
        }

        el.changePassword.addEventListener('click', () => IndexUI.showChangePasswordModal());
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
        el.cancelPasswordChange.addEventListener('click', () => IndexUI.hideChangePasswordModal());

        // 确认删除
        el.confirmCancel.addEventListener('click', () => {
            IndexUI.hideConfirmDialog();
            this._pendingDeleteAction = null;
        });
        el.confirmDelete.addEventListener('click', () => {
            if (this._pendingDeleteAction) {
                this._pendingDeleteAction();
            }
            IndexUI.hideConfirmDialog();
            this._pendingDeleteAction = null;
        });

        // 学科/模式选择
        el.subjectSelector.addEventListener('change', (e) => this._changeSubject(e.target.value));
        el.modeSelector.addEventListener('change', () => this._changeMode());

        // 侧边栏
        el.sidebarToggle.addEventListener('click', () => IndexUI.toggleSidebar());
        el.sidebarOverlay.addEventListener('click', () => IndexUI.closeSidebar());
        el.sidebarCloseBtn.addEventListener('click', () => IndexUI.closeSidebar());

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
        el.messageInput.addEventListener('input', () => IndexUI.autoResizeTextarea());

        // 返回首页
        if (el.backToHomeBtn) {
            el.backToHomeBtn.addEventListener('click', () => this.showHome());
        }

        // 管理后台按钮
        if (el.adminButton) {
            el.adminButton.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 窗口大小改变
        window.addEventListener('resize', () => IndexUI.handleResize());

        // 首页用户头像菜单
        if (el.homeUserInfo) {
            el.homeUserInfo.addEventListener('click', (e) => {
                const menu = el.homeUserMenu;
                if (menu) {
                    menu.classList.toggle('active');
                    e.stopPropagation();
                }
            });
        }

        // 首页密码修改
        const homeChangePasswordBtn = document.getElementById('homeChangePassword');
        if (homeChangePasswordBtn) {
            homeChangePasswordBtn.addEventListener('click', () => {
                el.changePasswordModal.style.display = 'flex';
            });
        }

        // 首页管理后台
        if (el.homeAdminPanel) {
            el.homeAdminPanel.addEventListener('click', () => {
                window.location.href = '/admin';
            });
        }

        // 首页退出登录
        const homeLogoutBtn = document.getElementById('homeLogout');
        if (homeLogoutBtn) {
            homeLogoutBtn.addEventListener('click', () => this.logout());
        }

        // 点击页面空白处关闭首页用户菜单
        document.addEventListener('click', () => {
            const menu = document.getElementById('homeUserMenu');
            if (menu) menu.classList.remove('active');
        });

        // 首页应用卡片点击（事件委托）
        if (el.homeAppsGrid) {
            el.homeAppsGrid.addEventListener('click', (e) => {
                const card = e.target.closest('.home-app-card');
                if (!card) return;
                const appId = card.dataset.appId;
                const url = card.dataset.appUrl;
                this._openApp(appId, url);
            });
        }
    },

    _bindFileUploadEvents() {
        const el = IndexUI.elements;
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
            const response = await IndexAPI.verify();
            if (response.ok) {
                const result = await response.json();
                if (!result.success) throw new Error('Token验证失败');
                const userProfile = result.data;
                this.state.currentUser = userProfile.username;
                this.state.userRole = userProfile.role || 'student';
                this.state.isAdmin = (this.state.userRole === 'admin');
                this.state.isTeacher = (this.state.userRole === 'teacher');
                IndexUI.updateUserDisplay(userProfile);
                IndexUI.showMainInterface();

                await this._loadSubjectOptions();
                await this._loadConversations();
                this._setupWebSocket();
                this._checkSystemStatus();

                if (this.state.isAdmin || this.state.isTeacher) {
                    IndexUI.showAdminFeatures(this.state.isTeacher);
                }

                this.state.userInfo = userProfile;
                this._loadHomeApps();
                IndexUI.updateHomeUserInfo(userProfile);
            } else {
                throw new Error('Token验证失败');
            }
        } catch (error) {
            console.error('Token验证错误:', error);
            this._clearAuth();
            IndexUI.showLoginInterface();
        }
    },

    async _login() {
        const el = IndexUI.elements;
        const username = el.usernameInput.value.trim();
        const password = el.passwordInput.value;

        if (!username || !password) {
            IndexUI.showLoginError('請輸入用戶名和密碼');
            return;
        }

        IndexUI.showLoginLoading(true);
        IndexUI.hideLoginError();
        HudController.onLoginStart();

        try {
            const response = await IndexAPI.login(username, password);
            const result = await response.json();

            if (response.ok && result.success) {
                HudController.onLoginSuccess();

                this.state.authToken = result.access_token;
                this.state.currentUser = result.username;
                this.state.userRole = result.role;
                this.state.isAdmin = (result.role === 'admin');
                this.state.isTeacher = (result.role === 'teacher');

                AuthModule.setToken(this.state.authToken);
                localStorage.setItem('user_role', result.role);

                IndexUI.updateUserDisplay(result.user_info);
                IndexUI.showMainInterface();

                await this._loadSubjectOptions();
                await this._loadConversations();
                this._setupWebSocket();
                this._checkSystemStatus();

                if (this.state.isAdmin || this.state.isTeacher) {
                    IndexUI.showAdminFeatures(this.state.isTeacher);
                }

                this.state.userInfo = result.user_info;
                this._loadHomeApps();
                IndexUI.updateHomeUserInfo(result.user_info);
            } else {
                HudController.onLoginError();
                IndexUI.showLoginError(result.detail || '登入失敗，請檢查用戶名和密碼');
            }
        } catch (error) {
            console.error('登录错误:', error);
            HudController.onLoginError();
            IndexUI.showLoginError('網絡錯誤，請稍後重試');
        } finally {
            IndexUI.showLoginLoading(false);
        }
    },

    logout() {
        this._clearAuth();
        if (this.state.websocket) {
            this.state.websocket.close();
        }
        IndexUI.showLoginInterface();
    },

    _clearAuth() {
        this.state.authToken = null;
        this.state.currentUser = null;
        this.state.userInfo = null;
        this.state.isAdmin = false;
        AuthModule.removeToken();
    },

    /* ---------- 用户操作 ---------- */

    _showProfile() {
        IndexUI.hideUserMenu();
        const info = this.state.userInfo;
        if (info) {
            const lines = [
                `用户名: ${info.username}`,
                `显示名称: ${info.display_name || '未设置'}`,
                `班级: ${info.class_name || '未分班'}`,
                `登录次数: ${info.login_count || 0}`,
                `最后登录: ${info.last_login ? new Date(info.last_login).toLocaleString() : '首次登录'}`
            ];
            if (this.state.isAdmin) {
                lines.push('权限: 管理员');
            }
            alert('个人资料\n\n' + lines.join('\n'));
        }
    },

    async _handleChangePassword() {
        const el = IndexUI.elements;
        const oldPassword = el.oldPasswordInput.value;
        const newPassword = el.newPasswordInput.value;
        const confirmPassword = el.confirmPasswordInput.value;

        if (!oldPassword || !newPassword || !confirmPassword) {
            el.passwordError.textContent = '请填写所有字段';
            return;
        }
        if (newPassword.length < 4) {
            el.passwordError.textContent = '新密码至少需要4个字符';
            return;
        }
        if (newPassword !== confirmPassword) {
            el.passwordError.textContent = '兩次輸入的新密碼不一致';
            return;
        }

        try {
            const response = await IndexAPI.changePassword(oldPassword, newPassword);
            const result = await response.json();
            if (response.ok && result.success) {
                alert('密碼修改成功！');
                IndexUI.hideChangePasswordModal();
            } else {
                el.passwordError.textContent = result.detail || '密碼修改失敗';
            }
        } catch (error) {
            console.error('修改密碼錯誤:', error);
            el.passwordError.textContent = '網絡錯誤，請稍後重試';
        }
    },

    /* ---------- 学科管理 ---------- */

    async _loadSubjectOptions() {
        try {
            const response = await IndexAPI.fetchSubjects();
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
                IndexUI.updateSubjectSelector(this.state.allSubjects, this.state.currentSubject);
                IndexUI.updateFeatureList(this.state.allSubjects);

                if (Object.keys(this.state.allSubjects).length === 0) {
                    this._useDefaultSubjects();
                }
            } else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            console.error('載入學科失敗:', error);
            this._useDefaultSubjects();
        }
    },

    _useDefaultSubjects() {
        this.state.allSubjects = {
            'ict':         { code: 'ict',         name: 'ICT (資訊及通訊科技)', icon: '💻', description: '資訊與通訊科技' },
            'ces':         { code: 'ces',         name: 'CES (公民經濟與社會)', icon: '🏛️', description: '公民经济与社会' },
            'history':     { code: 'history',     name: '歷史 (History)',       icon: '📚', description: '歷史學科' },
            'chinese':     { code: 'chinese',     name: '中文',               icon: '📖', description: '中文語言文學' },
            'english':     { code: 'english',     name: '英文',               icon: '🔤', description: '英語語言文學' },
            'math':        { code: 'math',        name: '數學',               icon: '🔢', description: '數學學科' },
            'physics':     { code: 'physics',     name: '物理',               icon: '⚛️', description: '物理學科' },
            'chemistry':   { code: 'chemistry',   name: '化學',               icon: '🧪', description: '化學學科' },
            'biology':     { code: 'biology',     name: '生物',               icon: '🧬', description: '生物學科' },
            'science':     { code: 'science',     name: '科學',               icon: '🔬', description: '綜合科學' },
            'economics':   { code: 'economics',   name: '經濟',               icon: '💹', description: '經濟學科' },
            'geography':   { code: 'geography',   name: '地理',               icon: '🌍', description: '地理學科' },
            'visual_arts': { code: 'visual_arts', name: '視覺藝術',           icon: '🎨', description: '視覺藝術' }
        };
        IndexUI.updateSubjectSelector(this.state.allSubjects, this.state.currentSubject);
        IndexUI.updateFeatureList(this.state.allSubjects);
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
        IndexUI.updateSubjectTitle(info);
    },

    /* ---------- 系统状态 ---------- */

    async _checkSystemStatus() {
        try {
            const response = await IndexAPI.verify();
            IndexUI.updateStatusIndicator(response.ok);
        } catch (error) {
            console.error('检查系统状态失败:', error);
            IndexUI.updateStatusIndicator(false);
        }
    },

    _setupWebSocket() {
        // WebSocket 逻辑（如果需要的话）
    },

    /* ---------- 首页应用 ---------- */

    async _loadHomeApps() {
        try {
            const response = await IndexAPI.fetchApps();
            if (!response.ok) return;
            const data = await response.json();
            IndexUI.renderHomeApps(data.apps || []);
        } catch (error) {
            console.error('加载应用列表失败:', error);
        }
    },

    _openApp(appId, url) {
        if (url === '__internal_chat__') {
            this.showChat();
        } else {
            window.location.href = url;
        }
    },

    showHome() {
        IndexUI.showHome();
    },

    showChat() {
        IndexUI.showChat();
    },

    /* ---------- 对话管理 ---------- */

    async _loadConversations() {
        try {
            const response = await IndexAPI.fetchConversations(this.state.currentUser);
            const result = await response.json();
            this.state.conversations = result.conversations;
            IndexUI.renderConversations(this.state.conversations, this.state.currentConversationId);
        } catch (error) {
            console.error('加载对话失败:', error);
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
                console.warn('currentUser 未设置，无法加载对话');
                return;
            }
            const response = await IndexAPI.fetchConversation(this.state.currentUser, conversationId);
            if (!response.ok) {
                console.error('加载对话失败:', response.status);
                return;
            }
            const conversation = await response.json();

            this.state.currentConversationId = conversationId;
            this.state.currentSubject = conversation.subject || '';
            const sel = IndexUI.elements.subjectSelector;
            if (sel) sel.value = conversation.subject || '';
            this._updateSubjectTitle();

            IndexUI.clearMessages();
            this._clearConversationFiles();

            const messages = conversation.messages || [];
            if (messages.length === 0) {
                IndexUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
            } else {
                messages.forEach(msg => {
                    this._addMessage(msg.role, msg.content, msg.thinking);
                });
            }

            IndexUI.renderConversations(this.state.conversations, this.state.currentConversationId);
            IndexUI.scrollToBottom(true);
        } catch (error) {
            console.error('加载对话失败:', error);
        }
    },

    async createNewConversation() {
        return new Promise((resolve) => {
            this._newChatResolve = resolve;
            IndexUI.showNewChatModal(
                this.state.allSubjects,
                (code, info, e) => this._onSubjectCardClick(code, info, e)
            );
        });
    },

    _onSubjectCardClick(subjectCode, subjectInfo, e) {
        this._selectedSubjectCode = subjectCode;
        this._selectedSubjectInfo = subjectInfo;

        const el = IndexUI.elements;
        el.subjectGrid.querySelectorAll('.subject-card').forEach(c => c.classList.remove('selected'));
        e.currentTarget.classList.add('selected');

        el.newChatNameSection.style.display = '';
        el.newChatNameInput.value = `${subjectInfo.name} 對話`;
        el.newChatNameInput.focus();
        el.newChatNameInput.select();
    },

    async _confirmNewChat() {
        const subjectCode = this._selectedSubjectCode;
        const subjectInfo = this._selectedSubjectInfo;
        if (!subjectCode) return;

        const el = IndexUI.elements;
        const title = el.newChatNameInput.value.trim() || `${subjectInfo.icon} ${subjectInfo.name} 對話`;

        this._hideNewChatModal();

        this.state.currentSubject = subjectCode;
        if (el.subjectSelector) el.subjectSelector.value = subjectCode;
        this._updateSubjectTitle();

        try {
            const response = await IndexAPI.createConversation(this.state.currentUser, title, subjectCode);
            const result = await response.json();
            this.state.currentConversationId = result.conversation_id;
            IndexUI.clearMessages();
            IndexUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
            this._clearConversationFiles();
            this._loadConversations();
        } catch (error) {
            console.error('創建對話失敗:', error);
            IndexUI.showStatusMessage('創建對話失敗，請稍後重試', 3000);
        }

        if (this._newChatResolve) {
            const resolve = this._newChatResolve;
            this._newChatResolve = null;
            resolve();
        }
    },

    _hideNewChatModal() {
        IndexUI.hideNewChatModal();
        if (this._newChatResolve) {
            const resolve = this._newChatResolve;
            this._newChatResolve = null;
            resolve();
        }
    },

    _showConfirmDelete(conv) {
        this._pendingDeleteAction = () => this._deleteConversation(conv.id, conv.title);
        IndexUI.showConfirmDialog(`確定要刪除對話「${conv.title}」嗎？此操作無法撤銷。`);
    },

    async _deleteConversation(conversationId, title) {
        try {
            const response = await IndexAPI.deleteConversation(this.state.currentUser, conversationId);
            if (response.ok) {
                await response.json();
                if (conversationId === this.state.currentConversationId) {
                    this.state.currentConversationId = null;
                    IndexUI.clearMessages();
                    IndexUI.addWelcomeMessage(this.state.currentSubject, this.state.currentUser, this.state.userInfo);
                    this._clearConversationFiles();
                }
                this.state.conversations = this.state.conversations.filter(c => c.id !== conversationId);
                IndexUI.renderConversations(this.state.conversations, this.state.currentConversationId);
                IndexUI.showStatusMessage(`對話「${title}」刪除成功`, 3000);
            } else {
                const errorData = await response.json();
                throw new Error(errorData.detail || '刪除失敗');
            }
        } catch (error) {
            console.error('刪除對話失敗:', error);
            alert(`刪除對話失敗: ${error.message}\n請稍後重試`);
        }
    },

    /* ---------- 文件上传 ---------- */

    async _handleConversationFileSelect(files) {
        for (const file of files) {
            if (this.state.processingFiles.has(file.name)) continue;
            if (!this._validateFile(file)) continue;

            IndexUI.addFileProcessingIndicator(file, this._sanitizeId);

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

                IndexUI.removeFileProcessingIndicator(file.name, this._sanitizeId);
                this._addConversationFile(fileData);
            } catch (error) {
                console.error('檔案處理失敗:', error);
                IndexUI.removeFileProcessingIndicator(file.name, this._sanitizeId);
                IndexUI.showStatusMessage(`檔案「${file.name}」處理失敗: ${error.message}`, 5000);
            }
        }
    },

    _validateFile(file) {
        if (file.size > 100 * 1024 * 1024) {
            IndexUI.showStatusMessage('檔案超過10MB限制', 5000);
            return false;
        }
        const supportedExts = ['.txt', '.md', '.docx', '.pdf', '.pptx'];
        const fileName = file.name.toLowerCase();
        const isSupported = supportedExts.some(ext => fileName.endsWith(ext));
        if (!isSupported) {
            IndexUI.showStatusMessage(`不支援的檔案格式，支援: ${supportedExts.join(', ')}`, 5000);
            return false;
        }
        if (this.state.conversationFiles.some(f => f.name === file.name)) {
            IndexUI.showStatusMessage(`檔案「${file.name}」已在當前對話中`, 3000);
            return false;
        }
        return true;
    },

    async _processFileLocally(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = () => reject(new Error('檔案讀取失敗'));
            reader.readAsText(file, 'utf-8');
        });
    },

    async _processFileViaBackend(file) {
        try {
            const response = await IndexAPI.processTempFile(file);
            if (!response.ok) {
                const errorText = await response.text();
                try {
                    const errorData = JSON.parse(errorText);
                    throw new Error(errorData.detail || errorData.message || '後端處理失敗');
                } catch (parseError) {
                    if (parseError.message.includes('後端處理失敗') || parseError.message.includes('detail')) {
                        throw parseError;
                    }
                    throw new Error(`HTTP ${response.status}: ${errorText}`);
                }
            }
            const result = await response.json();
            if (!result.success) {
                throw new Error(result.message || '后端文件处理失败');
            }
            return {
                name: file.name,
                size: file.size,
                type: file.type,
                content: result.content,
                uploadTime: new Date().toISOString(),
                tempFileId: result.temp_file_id,
                processedByBackend: true
            };
        } catch (error) {
            if (error.message.includes('Failed to fetch') || error.message.includes('网络错误')) {
                throw new Error(`後端服務不可用，${file.name} 需要伺服器處理`);
            }
            throw error;
        }
    },

    _addConversationFile(fileData) {
        this.state.conversationFiles.push(fileData);
        IndexUI.addConversationFileItem(fileData, this._getFileIcon, this._formatFileSize);

        const msg = fileData.processedLocally
            ? `${fileData.name} 已添加到對話（前端處理）`
            : `${fileData.name} 已添加到對話（后端解析完成）`;
        IndexUI.showStatusMessage(msg, 3000);
    },

    removeConversationFile(fileName) {
        this.state.conversationFiles = this.state.conversationFiles.filter(f => f.name !== fileName);
        const filesDiv = IndexUI.elements.conversationFiles;
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
        IndexUI.clearConversationFiles();
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
        const el = IndexUI.elements;
        const message = el.messageInput.value.trim();

        if (!message && this.state.conversationFiles.length === 0) return;
        if (!message && this.state.conversationFiles.length > 0) {
            IndexUI.showStatusMessage('請輸入針對檔案的問題...', 3000);
            el.messageInput.focus();
            return;
        }
        if (this.state.isStreaming) return;

        this.state.isStreaming = true;
        el.sendButton.disabled = true;
        el.messageInput.disabled = true;
        el.messageInput.value = '';
        IndexUI.autoResizeTextarea();

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
        IndexUI.addTypingIndicator(this.state.currentSubject);

        try {
            const requestBody = {
                question: enhancedMessage,
                subject: this.state.currentSubject,
                use_api: false,
                model: 'deepseek-chat',
                conversation_id: this.state.currentConversationId,
                enable_thinking: this.state.enableThinking
            };

            const response = await IndexAPI.sendStreamMessage(requestBody);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            IndexUI.removeTypingIndicator();
            const streamCtx = IndexUI.createStreamingMessage(this.state.currentSubject);

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
                    this._processSSEPart(part, streamCtx);
                }
            }

            if (sseBuffer.trim()) {
                this._processSSEPart(sseBuffer, streamCtx);
            }

            this._finalizeStreamingMessage(streamCtx);
            this._clearConversationFiles();
            await this._loadConversations();

        } catch (error) {
            console.error('發送訊息失敗:', error);
            IndexUI.removeTypingIndicator();
            const errorMessage = error.message === 'Failed to fetch'
                ? '網絡連接失敗，請檢查網絡'
                : `發送失敗: ${error.message}`;
            IndexUI.showStatusMessage(errorMessage, 5000);
            el.messageInput.value = message;
        } finally {
            this.state.isStreaming = false;
            el.sendButton.disabled = false;
            el.messageInput.disabled = false;
            el.messageInput.focus();
        }
    },

    _processSSEPart(partRaw, streamCtx) {
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
                this._handleStreamEvent(eventData, streamCtx);
            } catch (parseErr) {
                console.warn('SSE 解析跳过:', partText.slice(0, 100));
            }
        }
    },

    _handleStreamEvent(eventData, ctx) {
        switch (eventData.type) {
            case 'meta':
                if (eventData.conversation_id) {
                    this.state.currentConversationId = eventData.conversation_id;
                }
                break;

            case 'thinking':
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
                IndexUI.scrollToBottom();
                break;

            case 'answer':
                if (ctx.phase !== 'answer') {
                    ctx.phase = 'answer';
                    if (ctx.thinkingCursor) ctx.thinkingCursor.remove();
                    const contentEl = ctx.thinkingSection.querySelector('.section-content');
                    if (contentEl) contentEl.classList.add('collapsed');
                    const indicator = ctx.thinkingSection.querySelector('.collapse-indicator');
                    if (indicator) indicator.classList.remove('expanded');
                    ctx.answerDiv.style.display = '';
                }
                ctx.fullAnswer += (eventData.content || eventData.token || '');
                ctx.answerText.textContent = ctx.fullAnswer;
                IndexUI.scrollToBottom();
                break;

            case 'done':
                ctx.phase = 'done';
                if (eventData.full_answer) ctx.fullAnswer = eventData.full_answer;
                if (eventData.full_thinking) ctx.fullThinking = eventData.full_thinking;
                if (eventData.conversation_id) {
                    this.state.currentConversationId = eventData.conversation_id;
                }
                break;

            case 'error':
                IndexUI.showStatusMessage(eventData.message, 5000);
                break;
        }
    },

    _finalizeStreamingMessage(ctx) {
        ctx.bubbleDiv.querySelectorAll('.streaming-cursor').forEach(el => el.remove());

        if (ctx.fullThinking) {
            const sections = this._parseThinkingContent(ctx.fullThinking);
            let thinkingHtml = '';

            if (sections.knowledge) {
                thinkingHtml += this._buildSectionHtml('knowledge-section', '參考資料', sections.knowledge);
            }
            if (sections.reasoning) {
                thinkingHtml += this._buildSectionHtml('reasoning-section', '分析過程', sections.reasoning);
            }
            if (sections.thinking) {
                thinkingHtml += this._buildSectionHtml('thinking-section', '思考筆記', sections.thinking);
            }
            if (!thinkingHtml && ctx.fullThinking.trim()) {
                thinkingHtml = this._buildSectionHtml('reasoning-section', '思考過程', ctx.fullThinking);
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

        IndexUI.scrollToBottom(true);
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
                if (sections.knowledge) {
                    html += this._buildSectionHtml('knowledge-section', '參考資料', sections.knowledge);
                }
                if (sections.reasoning) {
                    html += this._buildSectionHtml('reasoning-section', '分析過程', sections.reasoning);
                }
                if (sections.thinking) {
                    html += this._buildSectionHtml('thinking-section', '思考筆記', sections.thinking);
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
        IndexUI.elements.messagesContainer.appendChild(messageDiv);
        this._renderMath(messageDiv);
        IndexUI.scrollToBottom(true);
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

        IndexUI.elements.messagesContainer.appendChild(messageDiv);
        IndexUI.scrollToBottom(true);
    },

    _buildMessageWithFileContent(userMessage) {
        let enhanced = '';
        if (this.state.conversationFiles.length > 0) {
            enhanced += '【用户在此对话中上传的文件内容】\n\n';
            this.state.conversationFiles.forEach((file, index) => {
                enhanced += `文件 ${index + 1}: ${file.name}\n`;
                enhanced += '文件内容:\n';
                enhanced += file.content;
                enhanced += '\n\n---\n\n';
            });
            enhanced += '【用户基于以上文件内容的问题】\n';
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
            ? `<button class="preview-html-button" data-preview-id="${blockId}">▶ 預覽</button>`
            : '';

        return `
            <div class="code-block-wrapper">
                <div class="code-block-header">
                    <span class="code-language">${(language || 'plaintext').toUpperCase()}</span>
                    <div class="code-block-actions">
                        ${previewBtnHtml}
                        <button class="copy-button" data-copy-id="${blockId}">複製</button>
                    </div>
                </div>
                <div class="code-block-content">
                    <pre id="${blockId}"><code class="language-${language || 'plaintext'}">${escapedCode}</code></pre>
                </div>
                ${isHtml ? `<div class="html-preview-container" id="preview-${blockId}" style="display:none;">
                    <div class="html-preview-header">
                        <span>HTML 預覽</span>
                        <button class="preview-close-btn" data-close-preview-id="${blockId}">✕ 關閉</button>
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
            console.warn('表格解析失敗:', error);
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
            btn.textContent = '已複製！';
            btn.style.background = '#4caf50';
            setTimeout(() => {
                btn.textContent = '複製';
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
   ToolboxManager 空殼（向後兼容）
   ============================================================ */

class ToolboxManager {
    constructor(userRole) { this.userRole = userRole; }
    open() {}
    close() {}
    render() {}
    renderDock() {}
    navigateTo(url) { window.location.href = url; }
    hasAccess(roles) { return roles.includes(this.userRole); }
}
window.toolboxManager = null;

/* ============================================================
   啟動畫面 + 名言輪播 + 聚光燈
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    // 启动画面淡出
    const splashScreen = document.getElementById('splashScreen');
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.classList.add('fade-out');
            setTimeout(() => { splashScreen.style.display = 'none'; }, 600);
        }
    }, 1500);

    // 鼠标聚光灯
    const spotlight = document.getElementById('spotlight');
    const loginContainer = document.getElementById('loginContainer');
    if (spotlight && loginContainer) {
        loginContainer.addEventListener('mousemove', (e) => {
            spotlight.style.left = e.clientX + 'px';
            spotlight.style.top = e.clientY + 'px';
        });
        loginContainer.addEventListener('mouseleave', () => { spotlight.style.opacity = '0'; });
        loginContainer.addEventListener('mouseenter', () => { spotlight.style.opacity = '1'; });
    }

    // 名人名言滚动
    const quotes = [
        { chinese: "\u300C\u4EBA\u5DE5\u667A\u6167\u662F\u65B0\u7684\u96FB\u529B\u3002\u300D", english: "AI is the new electricity.", author: "Andrew Ng\uFF08\u5433\u6069\u9054\uFF09" },
        { chinese: "\u300CAI \u662F\u6211\u5011\u9019\u500B\u6642\u4EE3\u6700\u5F37\u5927\u7684\u6280\u8853\u529B\u91CF\u3002\u300D", english: "AI is the most powerful technology force of our time.", author: "Jensen Huang\uFF08\u9EC3\u4EC1\u52F3\uFF09" },
        { chinese: "\u300CAI \u5C07\u6539\u8B8A\u6BCF\u4E00\u500B\u7522\u696D\u8207\u6BCF\u4E00\u500B\u696D\u52D9\u529F\u80FD\u3002\u300D", english: "AI will transform every industry and every business function.", author: "Satya Nadella\uFF08\u5FAE\u8EDF CEO\uFF09" },
        { chinese: "\u300CAI \u6700\u5927\u7684\u9032\u6B65\u5C07\u4F86\u81EA\u8B93\u5B83\u66F4\u52A0\u4EE5\u4EBA\u70BA\u4E2D\u5FC3\u3002\u300D", english: "The greatest advances in AI will come from making it more human-centered.", author: "Fei-Fei Li\uFF08\u674E\u98DB\u98DB\uFF09" },
        { chinese: "\u300C\u6A5F\u5668\u5E38\u5E38\u4EE5\u9A5A\u4EBA\u7684\u65B9\u5F0F\u8B93\u6211\u611F\u5230\u610F\u5916\u3002\u300D", english: "Machines take me by surprise with great frequency.", author: "Alan Turing\uFF08\u827E\u502B\u30FB\u5716\u9748\uFF09" },
        { chinese: "\u300CAI \u5C0D\u4EBA\u985E\u6587\u660E\u7684\u5B58\u5728\u69CB\u6210\u6839\u672C\u6027\u98A8\u96AA\u3002\u300D", english: "AI is a fundamental risk to the existence of human civilization.", author: "Elon Musk\uFF08\u4F0A\u9686\u30FB\u99AC\u65AF\u514B\uFF09" },
        { chinese: "\u300C\u5B8C\u5168\u4EBA\u5DE5\u667A\u6167\u7684\u767C\u5C55\u53EF\u80FD\u610F\u5473\u8457\u4EBA\u985E\u7684\u7D42\u7D50\u3002\u300D", english: "The development of full artificial intelligence could spell the end of the human race.", author: "Stephen Hawking\uFF08\u53F2\u8482\u82AC\u30FB\u970D\u91D1\uFF09" },
        { chinese: "\u300CAI \u53EF\u80FD\u662F\u4EBA\u985E\u8FC4\u4ECA\u70BA\u6B62\u6700\u91CD\u8981\u7684\u7814\u7A76\u65B9\u5411\u3002\u300D", english: "AI is probably the most important thing humanity has ever worked on.", author: "Bill Gates\uFF08\u6BD4\u723E\u00B7\u84CB\u8332\uFF09" },
        { chinese: "\u300C21 \u4E16\u7D00\u7684\u6587\u76F2\u4E0D\u662F\u4E0D\u6703\u8B80\u5BEB\u7684\u4EBA\uFF0C\u800C\u662F\u4E0D\u6703\u5B78\u7FD2\u3001\u653E\u4E0B\u820A\u77E5\u8B58\u4E26\u91CD\u65B0\u5B78\u7FD2\u7684\u4EBA\u3002\u300D", english: "The illiterate of the 21st century will not be those who cannot read and write, but those who cannot learn, unlearn, and relearn.", author: "Alvin Toffler\uFF08\u963F\u723E\u6587\u00B7\u6258\u592B\u52D2\uFF09" },
        { chinese: "\u300C\u6559\u80B2\u4E0D\u662F\u70BA\u751F\u6D3B\u505A\u6E96\u5099\uFF1B\u6559\u80B2\u672C\u8EAB\u5C31\u662F\u751F\u6D3B\u3002\u300D", english: "Education is not preparation for life; education is life itself.", author: "John Dewey\uFF08\u7D04\u7FF0\u00B7\u675C\u5A01\uFF09" },
        { chinese: "\u300C\u6559\u5E2B\u6700\u5927\u7684\u6210\u529F\uFF0C\u662F\u80FD\u8AAA\uFF1A\u5B69\u5B50\u5011\u5B78\u7FD2\u6642\u597D\u50CF\u4E0D\u518D\u9700\u8981\u6211\u4E86\u3002\u300D", english: "The greatest sign of success for a teacher is to be able to say, 'The children are now working as if I did not exist.'", author: "Maria Montessori\uFF08\u8499\u7279\u68AD\u5229\uFF09" },
        { chinese: "\u300C\u5275\u9020\u529B\u5728\u6559\u80B2\u4E2D\u8207\u8B80\u5BEB\u80FD\u529B\u540C\u6A23\u91CD\u8981\u3002\u300D", english: "Creativity is as important in education as literacy.", author: "Ken Robinson\uFF08\u80AF\u00B7\u7F85\u8CD3\u905C\u7235\u58EB\uFF09" },
        { chinese: "\u300C\u6559\u80B2\u662F\u4E00\u500B\u81EA\u6211\u7D44\u7E54\u7CFB\u7D71\uFF0C\u5B78\u7FD2\u662F\u4E00\u7A2E\u81EA\u7136\u6E67\u73FE\u7684\u73FE\u8C61\u3002\u300D", english: "Education is a self-organizing system, where learning is an emergent phenomenon.", author: "Sugata Mitra\uFF08\u7C73\u7279\u62C9\u6559\u6388\uFF09" }
    ];

    const quoteWrapper = document.getElementById('quoteWrapper');
    const quoteIndicators = document.getElementById('quoteIndicators');
    if (!quoteWrapper || !quoteIndicators) return;

    let currentIndex = 0;
    let intervalId = null;

    function generateQuotesHTML() {
        quoteWrapper.innerHTML = quotes.map((quote, index) => `
            <div class="quote-item ${index === 0 ? 'active' : ''}" data-index="${index}">
                <div class="quote-chinese">${quote.chinese}</div>
                <div class="quote-english">${quote.english}</div>
                <div class="quote-author">${quote.author}</div>
            </div>
        `).join('');

        quoteIndicators.innerHTML = quotes.map((_, index) => `
            <div class="quote-indicator ${index === 0 ? 'active' : ''}" data-index="${index}">
                <div class="quote-indicator-progress"></div>
            </div>
        `).join('');
    }

    function showQuote(index) {
        const items = quoteWrapper.querySelectorAll('.quote-item');
        const indicators = quoteIndicators.querySelectorAll('.quote-indicator');

        items.forEach((item, i) => {
            item.classList.remove('active', 'exit');
            if (i === currentIndex) item.classList.add('exit');
        });
        indicators.forEach(ind => ind.classList.remove('active'));

        currentIndex = index;

        setTimeout(() => {
            items.forEach((item, i) => {
                item.classList.remove('exit');
                if (i === currentIndex) item.classList.add('active');
            });
            indicators[currentIndex].classList.add('active');
        }, 100);
    }

    function nextQuote() {
        showQuote((currentIndex + 1) % quotes.length);
    }

    function startAutoPlay() {
        if (intervalId) clearInterval(intervalId);
        intervalId = setInterval(nextQuote, 5000);
    }

    function handleIndicatorClick(e) {
        const indicator = e.target.closest('.quote-indicator');
        if (!indicator) return;
        const index = parseInt(indicator.dataset.index);
        if (index === currentIndex) return;
        showQuote(index);
        startAutoPlay();
    }

    generateQuotesHTML();
    quoteIndicators.addEventListener('click', handleIndicatorClick);
    setTimeout(() => startAutoPlay(), 2000);
});

/* ============================================================
   HUD 狀態環 + Token 流 — AI 微交互控制器
   ============================================================ */

const HudController = (() => {
    // ─── 可調參數 ───
    const CONF = {
        // HUD 環
        TICK_COUNT: 72,           // 刻度數量
        TICK_INNER_R: 218,        // 刻度內半徑
        TICK_OUTER_R: 228,        // 刻度外半徑（長刻度）
        TICK_OUTER_R_SHORT: 224,  // 刻度外半徑（短刻度）
        RING_CENTER: 250,         // SVG viewBox 中心
        BASE_ROTATE_S: 22,        // 默認旋轉週期（秒）
        FOCUS_ROTATE_S: 18.3,     // 聚焦時旋轉週期（秒）
        // Token 流
        TOKEN_FADE_DELAY: 800,    // 停止輸入後消失延遲（ms）
    };

    let wrapper, ringGroup, progressRing;
    let tokenTimers = new Map();
    let reducedMotion = false;

    function init() {
        reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reducedMotion) return;

        wrapper = document.getElementById('hudRingWrapper');
        ringGroup = document.getElementById('hudRingGroup');
        progressRing = document.getElementById('hudProgressRing');
        if (!wrapper || !ringGroup) return;

        _generateTicks();
        _bindInputEvents();
    }

    // ─── 生成 SVG 刻度線 ───
    function _generateTicks() {
        const cx = CONF.RING_CENTER;
        const cy = CONF.RING_CENTER;
        let svg = '';
        for (let i = 0; i < CONF.TICK_COUNT; i++) {
            const angle = (i / CONF.TICK_COUNT) * 360;
            const rad = (angle * Math.PI) / 180;
            const isLong = i % 6 === 0;
            const r1 = CONF.TICK_INNER_R;
            const r2 = isLong ? CONF.TICK_OUTER_R : CONF.TICK_OUTER_R_SHORT;
            const x1 = cx + r1 * Math.cos(rad);
            const y1 = cy + r1 * Math.sin(rad);
            const x2 = cx + r2 * Math.cos(rad);
            const y2 = cy + r2 * Math.sin(rad);
            svg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
        }
        ringGroup.innerHTML = svg;
    }

    // ─── 輸入事件綁定 ───
    function _bindInputEvents() {
        const inputs = wrapper.querySelectorAll('.login-input');
        inputs.forEach(input => {
            const flow = input.parentElement.querySelector('.token-flow');

            input.addEventListener('focus', () => {
                wrapper.classList.add('hud-focus');
                ringGroup.style.animationDuration = CONF.FOCUS_ROTATE_S + 's';
            });

            input.addEventListener('blur', () => {
                wrapper.classList.remove('hud-focus');
                ringGroup.style.animationDuration = CONF.BASE_ROTATE_S + 's';
            });

            input.addEventListener('input', () => {
                // HUD pulse
                wrapper.classList.remove('hud-typing');
                void wrapper.offsetWidth; // force reflow
                wrapper.classList.add('hud-typing');

                // Token 流
                if (flow) {
                    flow.classList.add('active');
                    const id = input.id;
                    if (tokenTimers.has(id)) clearTimeout(tokenTimers.get(id));
                    tokenTimers.set(id, setTimeout(() => {
                        flow.classList.remove('active');
                        tokenTimers.delete(id);
                    }, CONF.TOKEN_FADE_DELAY));
                }
            });
        });
    }

    // ─── 外部接口：登錄開始 ───
    function onLoginStart() {
        if (reducedMotion || !wrapper) return;
        wrapper.classList.remove('hud-focus', 'hud-typing', 'hud-success', 'hud-error');
        wrapper.classList.add('hud-loading');
    }

    // ─── 外部接口：登錄成功 ───
    function onLoginSuccess() {
        if (reducedMotion || !wrapper) return;
        wrapper.classList.remove('hud-loading');
        wrapper.classList.add('hud-success');
        setTimeout(() => {
            wrapper.style.transition = 'opacity 0.6s var(--ease-out)';
            wrapper.style.opacity = '0';
        }, 600);
    }

    // ─── 外部接口：登錄失敗 ───
    function onLoginError() {
        if (reducedMotion || !wrapper) return;
        wrapper.classList.remove('hud-loading');
        wrapper.classList.add('hud-error');
        setTimeout(() => {
            wrapper.classList.remove('hud-error');
        }, 400);
    }

    // ─── 外部接口：重置（返回登錄頁時） ───
    function reset() {
        if (!wrapper) return;
        wrapper.classList.remove('hud-loading', 'hud-success', 'hud-error', 'hud-focus', 'hud-typing');
        wrapper.style.opacity = '';
        wrapper.style.transition = '';
        if (ringGroup) ringGroup.style.animationDuration = CONF.BASE_ROTATE_S + 's';
    }

    return { init, onLoginStart, onLoginSuccess, onLoginError, reset, CONF };
})();

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    IndexApp.init();
    HudController.init();

    // 初始化學習總結功能
    if (typeof LearningSummaryManager !== 'undefined') {
        window.learningSummaryManager = new LearningSummaryManager(IndexApp);
    }
});

// 全局引用（向後兼容 HTML 中的 window.app 引用）
window.app = IndexApp;
