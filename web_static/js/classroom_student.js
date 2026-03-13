'use strict';

/**
 * classroom_student.js
 * ====================
 * Student classroom view — receives teacher page pushes via WebSocket
 * and renders PPT pages with annotations.
 *
 * Dependencies (loaded before this file):
 *   - fabric.js (CDN)
 *   - shared/utils.js   → Utils
 *   - shared/auth.js    → AuthModule
 *   - shared/ui.js      → UIModule
 *   - shared/api.js     → APIClient
 */

// ============================================================
//  API Calls
// ============================================================

const ClassroomStudentAPI = {

    /**
     * Join a classroom room.
     * @param {string} roomId
     * @returns {Promise<Object>}
     */
    async joinRoom(roomId) {
        return APIClient.post(`/api/classroom/rooms/${roomId}/join`);
    },

    /**
     * Leave a classroom room (fire-and-forget).
     * @param {string} roomId
     */
    async leaveRoom(roomId) {
        try {
            const token = AuthModule.getToken();
            // Use raw fetch for leave — we don't want APIClient error toasts
            // on page unload since the page is already navigating away.
            await fetch(`/api/classroom/rooms/${roomId}/leave`, {
                method: 'POST',
                headers: {
                    ...AuthModule.getAuthHeaders(),
                    'Content-Type': 'application/json'
                }
            });
        } catch (error) {
            console.error('Leave room error:', error);
        }
    },

    /**
     * Load room details (title, teacher name, etc.).
     * @param {string} roomId
     * @returns {Promise<Object>}
     */
    async loadRoomDetails(roomId) {
        return APIClient.get(`/api/classroom/rooms/${roomId}`);
    },

    /**
     * Request the latest push via HTTP (fallback when WS not connected).
     * @param {string} roomId
     * @returns {Promise<Object>}
     */
    async getLatestPush(roomId) {
        return APIClient.get(`/api/classroom/rooms/${roomId}/push/latest`);
    },

    /**
     * Load a PPT page image as a blob URL.
     * @param {string} fileId
     * @param {number} pageNumber
     * @returns {Promise<string>} blob URL
     */
    async loadPageImage(fileId, pageNumber) {
        const response = await fetch(
            `/api/classroom/ppt/${fileId}/page/${pageNumber}`,
            { headers: AuthModule.getAuthHeaders() }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        return URL.createObjectURL(blob);
    },

    /**
     * Classroom AI streaming chat (returns raw Response for SSE parsing).
     * @param {string} roomId
     * @param {string} message
     * @param {string} fileId
     * @param {number} pageNumber
     * @param {string|null} conversationId
     * @returns {Promise<Response>}
     */
    async classroomAIStream(roomId, message, fileId, pageNumber, conversationId) {
        return fetch(`/api/classroom/rooms/${roomId}/ai/stream`, {
            method: 'POST',
            headers: {
                ...AuthModule.getAuthHeaders(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message,
                file_id: fileId,
                page_number: pageNumber,
                conversation_id: conversationId || undefined
            })
        });
    }
};


// ============================================================
//  UI Rendering
// ============================================================

const ClassroomStudentUI = {

    /**
     * Update room info in the top bar.
     */
    updateRoomInfo(data) {
        if (data.title) {
            document.getElementById('roomTitle').textContent = data.title;
        }
        const teacherName = data.teacher_display_name || data.teacher_name || '';
        if (teacherName) {
            document.getElementById('teacherName').textContent = `教師: ${teacherName}`;
        }
    },

    /**
     * Update the page number display.
     */
    updatePageNumber(pageNumber) {
        document.getElementById('pageNumber').textContent = `第 ${pageNumber} 頁`;
    },

    /**
     * Update the online count badge.
     */
    updateOnlineCount(count) {
        document.getElementById('onlineCount').textContent = count;
    },

    /**
     * Set the connection status indicator.
     */
    setConnectionStatus(connected) {
        const indicator = document.getElementById('statusIndicator');
        const label = document.getElementById('statusLabel');

        if (connected) {
            indicator.classList.remove('disconnected');
            label.textContent = '已連接';
        } else {
            indicator.classList.add('disconnected');
            label.textContent = '已斷開';
        }
    },

    showLoadingSpinner() {
        document.getElementById('loadingSpinner').style.display = 'flex';
        document.getElementById('pageImage').classList.remove('loaded');
        document.getElementById('noPageMessage').style.display = 'none';
    },

    hideLoadingSpinner() {
        document.getElementById('loadingSpinner').style.display = 'none';
    },

    showNoPageMessage() {
        document.getElementById('noPageMessage').style.display = 'block';
        document.getElementById('loadingSpinner').style.display = 'none';
        document.getElementById('pageImage').classList.remove('loaded');
    },

    showRoomEndedOverlay() {
        const overlay = document.getElementById('statusOverlay');
        document.getElementById('overlayTitle').textContent = '課堂已結束';
        document.getElementById('overlayText').textContent = '本課堂已由老師結束，請返回課堂列表。';
        overlay.classList.add('visible');
    },

    showRoomClosedOverlay() {
        const overlay = document.getElementById('statusOverlay');
        document.getElementById('overlayTitle').textContent = '房間已關閉';
        document.getElementById('overlayText').textContent = '課堂房間已關閉，頁面將在 3 秒後跳轉。';
        overlay.classList.add('visible');

        setTimeout(() => {
            window.location.href = '/classroom';
        }, 3000);
    },

    showSlideContent(html) {
        const wrapper = document.querySelector('.canvas-wrapper');
        const placeholder = document.getElementById('canvasPlaceholder');
        if (placeholder) placeholder.style.display = 'none';
        if (wrapper) {
            wrapper.style.display = 'flex';
            wrapper.innerHTML = html;
        }
    },

    showLessonEnded() {
        const wrapper = document.querySelector('.canvas-wrapper');
        if (wrapper) {
            wrapper.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#6E6E73;">
                    <h2>課案已結束</h2>
                    <p>等待老師下一步指示</p>
                </div>
            `;
        }
    },

    /**
     * Display the page image on the canvas area.
     * Returns a Promise that resolves after the image loads and canvas resizes.
     * Does NOT call fabricCanvas.renderAll() — the caller should render
     * after loading annotations to avoid clearing freshly-loaded objects.
     */
    displayPageImage(blobUrl, fabricCanvas) {
        return new Promise((resolve) => {
            const img = document.getElementById('pageImage');
            img.src = blobUrl;
            img.onload = () => {
                img.classList.add('loaded');
                this.hideLoadingSpinner();

                // Update canvas size to match image — but do NOT renderAll here.
                // renderAll() is deferred to after annotations are loaded, so we
                // don't accidentally display a blank canvas that later gets populated.
                fabricCanvas.setWidth(img.offsetWidth);
                fabricCanvas.setHeight(img.offsetHeight);
                resolve();
            };
            img.onerror = () => {
                this.hideLoadingSpinner();
                resolve();
            };
        });
    },

    /**
     * Render annotation JSON onto the Fabric canvas.
     * Returns a Promise that resolves after loadFromJSON finishes.
     */
    renderAnnotations(annotationsJson, fabricCanvas) {
        return new Promise((resolve) => {
            try {
                if (annotationsJson) {
                    fabricCanvas.loadFromJSON(annotationsJson, () => {
                        fabricCanvas.renderAll();
                        document.getElementById('annotationCanvas').style.display = 'block';
                        resolve();
                    });
                } else {
                    this.clearAnnotations(fabricCanvas);
                    resolve();
                }
            } catch (error) {
                console.error('Error rendering annotations:', error);
                resolve();
            }
        });
    },

    /**
     * Clear all annotations from the canvas.
     */
    clearAnnotations(fabricCanvas) {
        fabricCanvas.clear();
        fabricCanvas.renderAll();
        document.getElementById('annotationCanvas').style.display = 'none';
    }
};


// ============================================================
//  App Controller
// ============================================================

const ClassroomStudentApp = {

    // ---- Configuration ----
    CONFIG: {
        RECONNECT_INTERVAL: 5000,
        HEARTBEAT_INTERVAL: 60000,
        PING_INTERVAL: 30000,
        SPLASH_DURATION: 1000
    },

    // ---- State ----
    state: {
        roomId: null,
        token: null,
        userInfo: {},
        ws: null,
        isConnected: false,
        currentPageNumber: 0,
        currentFileId: null,
        currentAnnotations: null,
        fabricCanvas: null,
        onlineCount: 0,
        roomStatus: 'active',   // active, paused, ended
        reconnectAttempts: 0,
        fatalError: false,
        heartbeatTimer: null,
        pingTimer: null,
        reconnectTimer: null,
        // Push version guard — incremented each time _handlePagePushed starts,
        // so stale async callbacks (image onload, loadFromJSON) can bail out.
        pushVersion: 0,
        // AI Chat state
        aiConversationId: null,
        aiIsStreaming: false,
        aiCurrentPageText: null,
        // Lesson Plan mode
        lessonMode: false,
        lessonSessionId: null,
        lessonLifecycle: 'prepared',
        lessonAccepting: false,
        currentLessonSlide: null
    },

    // ---- Initialization ----

    async init() {
        try {
            // Extract room ID from URL
            const pathParts = window.location.pathname.split('/');
            this.state.roomId = pathParts[pathParts.length - 1];

            // Get auth token via shared module
            this.state.token = AuthModule.getToken();

            // Verify user and get user info via AuthModule
            try {
                const userData = await AuthModule.verify();
                if (userData) {
                    this.state.userInfo = userData;
                    this.state.userInfo.name = userData.display_name || userData.username;
                }
            } catch (e) {
                console.warn('獲取用戶資訊失敗:', e);
            }

            if (!this.state.roomId || !this.state.token) {
                UIModule.toast('缺少必要資訊，請重新登錄', 'error');
                setTimeout(() => {
                    window.location.href = '/';
                }, 2000);
                return;
            }

            // Initialize Fabric canvas
            const canvas = new fabric.Canvas('annotationCanvas', {
                isDrawingMode: false,
                selectable: false,
                evented: false,
                renderOnAddRemove: false
            });
            this.state.fabricCanvas = canvas;

            // Join the room
            await this._joinRoom();

            // Load room details (title, teacher name, etc.)
            await this._loadRoomDetails();

            // Show waiting message
            document.getElementById('noPageMessage').style.display = 'block';

            // Hide splash screen
            setTimeout(() => {
                document.getElementById('splashScreen').classList.add('hidden');
            }, this.CONFIG.SPLASH_DURATION);

            // Show classroom
            document.getElementById('classroomContainer').style.display = 'flex';
            document.getElementById('aiCircleButton').style.display = 'flex';

            // Connect WebSocket
            this._connectWebSocket();

            // Setup event listeners
            this._setupEventListeners();

            // NOTE: The WS 'connected' handler already sends get_latest_push,
            // so we only need the HTTP fallback for cases where WS hasn't
            // connected within a reasonable time.
            setTimeout(() => {
                if (!this.state.isConnected) {
                    this._requestLatestPushViaHTTP();
                }
            }, 2000);

        } catch (error) {
            console.error('Init error:', error);
            UIModule.toast('初始化失敗: ' + error.message, 'error');
        }
    },

    // ---- Room Management ----

    async _joinRoom() {
        try {
            const result = await ClassroomStudentAPI.joinRoom(this.state.roomId);
            if (result.success) {
                console.log('Joined room:', result.data);
                ClassroomStudentUI.updateRoomInfo(result.data);
                return true;
            } else {
                UIModule.toast(result.message || '加入課堂失敗', 'error');
                return false;
            }
        } catch (error) {
            console.error('Join room error:', error);
            UIModule.toast('加入課堂失敗: ' + error.message, 'error');
            return false;
        }
    },

    async _loadRoomDetails() {
        try {
            const result = await ClassroomStudentAPI.loadRoomDetails(this.state.roomId);
            if (result.success && result.data) {
                ClassroomStudentUI.updateRoomInfo(result.data);
            }
        } catch (error) {
            console.error('獲取房間資訊失敗:', error);
        }
    },

    // ---- WebSocket Management ----

    _connectWebSocket() {
        try {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/ws/classroom/${this.state.roomId}?token=${this.state.token}`;

            this.state.ws = new WebSocket(wsUrl);

            this.state.ws.onopen = () => {
                console.log('WebSocket connected');
                this.state.isConnected = true;
                ClassroomStudentUI.setConnectionStatus(true);
                this.state.reconnectAttempts = 0;
                this._startHeartbeat();
                this._startPing();
            };

            this.state.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                // Fatal error from server (room not found / no permission) — stop reconnecting
                if (msg.type === 'error') {
                    this.state.fatalError = true;
                    UIModule.toast('錯誤: ' + msg.message, 'error');
                    setTimeout(() => { window.location.href = '/classroom'; }, 3000);
                    return;
                }
                this._handleWSMessage(event.data);
            };

            this.state.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.state.isConnected = false;
                ClassroomStudentUI.setConnectionStatus(false);
            };

            this.state.ws.onclose = () => {
                console.log('WebSocket closed');
                this.state.isConnected = false;
                ClassroomStudentUI.setConnectionStatus(false);
                this._stopHeartbeat();
                this._stopPing();
                this._scheduleReconnect();
            };

        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.state.isConnected = false;
            ClassroomStudentUI.setConnectionStatus(false);
            this._scheduleReconnect();
        }
    },

    _handleWSMessage(rawData) {
        try {
            const message = JSON.parse(rawData);
            console.log('WebSocket message:', message.type);

            switch (message.type) {
                case 'connected':
                    console.log('Connected to WebSocket server');
                    // Request latest push after (re)connect
                    this._sendWSMessage({ type: 'get_latest_push' });
                    // Also check for lesson state
                    this._sendWSMessage({ type: 'get_lesson_state' });
                    break;

                case 'page_pushed':
                    this._handlePagePushed(message);
                    break;

                case 'room_status_changed':
                    this._handleRoomStatusChanged(message);
                    break;

                case 'student_joined':
                    this.state.onlineCount = message.online_count || message.active_count;
                    ClassroomStudentUI.updateOnlineCount(this.state.onlineCount);
                    break;

                case 'student_left':
                    this.state.onlineCount = message.online_count || message.active_count;
                    ClassroomStudentUI.updateOnlineCount(this.state.onlineCount);
                    break;

                case 'no_push':
                    console.log('暫無推送');
                    break;

                case 'pong':
                    // Heartbeat response — no-op
                    break;

                case 'room_closed':
                    ClassroomStudentUI.showRoomClosedOverlay();
                    break;

                case 'error':
                    UIModule.toast(message.message || '伺服器錯誤', 'error');
                    break;

                // ===== Lesson Plan Mode =====
                case 'lesson_state':
                    this._handleLessonState(message);
                    break;
                case 'lesson_session_started':
                    UIModule.toast('課案已開始', 'info');
                    this._sendWSMessage({ type: 'get_lesson_state' });
                    break;
                case 'lesson_session_ended':
                    this.state.lessonMode = false;
                    ClassroomStudentUI.showLessonEnded();
                    break;
                case 'lesson_slide_pushed':
                    this._handleLessonSlidePushed(message);
                    break;
                case 'lesson_slide_lifecycle':
                    this._handleLessonLifecycle(message);
                    break;
                case 'response_ack':
                    UIModule.toast('回應已提交', 'success');
                    break;

                default:
                    console.log('Unknown message type:', message.type);
            }
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    },

    _sendWSMessage(message) {
        if (this.state.ws && this.state.ws.readyState === WebSocket.OPEN) {
            this.state.ws.send(JSON.stringify(message));
        }
    },

    _scheduleReconnect() {
        if (this.state.fatalError) return;
        if (this.state.reconnectTimer) clearTimeout(this.state.reconnectTimer);

        this.state.reconnectAttempts++;
        if (this.state.reconnectAttempts > 5) {
            UIModule.toast('無法連接到課室，請返回房間列表', 'error');
            return;
        }
        const delay = Math.min(
            this.CONFIG.RECONNECT_INTERVAL * this.state.reconnectAttempts,
            30000
        );

        console.log(`Reconnecting in ${delay}ms (attempt ${this.state.reconnectAttempts})`);

        this.state.reconnectTimer = setTimeout(() => {
            this._connectWebSocket();
        }, delay);
    },

    _startHeartbeat() {
        this._stopHeartbeat();
        this.state.heartbeatTimer = setInterval(() => {
            this._sendWSMessage({ type: 'heartbeat' });
        }, this.CONFIG.HEARTBEAT_INTERVAL);
    },

    _stopHeartbeat() {
        if (this.state.heartbeatTimer) {
            clearInterval(this.state.heartbeatTimer);
            this.state.heartbeatTimer = null;
        }
    },

    _startPing() {
        this._stopPing();
        this.state.pingTimer = setInterval(() => {
            this._sendWSMessage({ type: 'ping' });
        }, this.CONFIG.PING_INTERVAL);
    },

    _stopPing() {
        if (this.state.pingTimer) {
            clearInterval(this.state.pingTimer);
            this.state.pingTimer = null;
        }
    },

    // ---- Page Push Handling ----

    async _handlePagePushed(data) {
        // Increment push version — any prior in-flight _handlePagePushed whose
        // async steps haven't finished yet will detect version mismatch and bail.
        const myVersion = ++this.state.pushVersion;

        try {
            const { page_id, page_number, annotations_json, text_content } = data;
            // page_id is the file_id (teacher sends currentFileId as page_id)
            const file_id = page_id;

            this.state.currentPageNumber = page_number;
            this.state.currentFileId = file_id;
            this.state.currentAnnotations = annotations_json;

            // Cache page text content for AI context
            this.state.aiCurrentPageText = text_content || null;

            // Update page number display
            ClassroomStudentUI.updatePageNumber(page_number);

            // Show loading
            ClassroomStudentUI.showLoadingSpinner();

            // Load page image blob
            const blobUrl = await ClassroomStudentAPI.loadPageImage(file_id, page_number);

            // Stale check — a newer push may have started while we were fetching
            if (this.state.pushVersion !== myVersion) {
                console.log(`[push] Skipping stale push v${myVersion}, current is v${this.state.pushVersion}`);
                URL.revokeObjectURL(blobUrl);
                return;
            }

            // Display image — waits for img.onload + canvas resize
            await ClassroomStudentUI.displayPageImage(blobUrl, this.state.fabricCanvas);

            // Stale check again after image load
            if (this.state.pushVersion !== myVersion) {
                console.log(`[push] Skipping stale push v${myVersion} after image load`);
                return;
            }

            // Render annotations AFTER canvas is correctly sized
            if (annotations_json) {
                await ClassroomStudentUI.renderAnnotations(annotations_json, this.state.fabricCanvas);
            } else {
                ClassroomStudentUI.clearAnnotations(this.state.fabricCanvas);
            }

            // Final stale check — don't show toast / system message if superseded
            if (this.state.pushVersion !== myVersion) return;

            // Notify AI panel about page change
            this._renderAISystemMessage(`老師已翻到第 ${page_number} 頁`);

            UIModule.toast(`已接收到第 ${page_number} 頁`, 'success');

        } catch (error) {
            console.error('Error handling page push:', error);
            UIModule.toast('加載頁面失敗: ' + error.message, 'error');
        }
    },

    async _requestLatestPushViaHTTP() {
        try {
            const result = await ClassroomStudentAPI.getLatestPush(this.state.roomId);
            if (result.success && result.data) {
                this._handlePagePushed(result.data);
            }
        } catch (error) {
            console.error('Error requesting latest push:', error);
        }
    },

    // ---- Lesson Plan Mode Handlers ----

    _handleLessonState(message) {
        if (message.session_id) {
            this.state.lessonMode = true;
            this.state.lessonSessionId = message.session_id;
            this.state.lessonLifecycle = message.slide_lifecycle || 'prepared';
            this.state.lessonAccepting = message.accepting_responses || false;
            if (message.slide) {
                this._renderLessonSlide(message.slide);
            }
        }
    },

    _handleLessonSlidePushed(message) {
        this.state.lessonMode = true;
        this.state.lessonSessionId = message.session_id;
        if (message.data) {
            this._renderLessonSlide(message.data);
        }
    },

    _handleLessonLifecycle(message) {
        if (message.data) {
            this.state.lessonLifecycle = message.data.lifecycle;
            this.state.lessonAccepting = message.data.accepting_responses;
            // Update response UI
            this._updateLessonResponseUI();
        }
    },

    _renderLessonSlide(slideData) {
        const type = slideData.slide_type;
        this.state.currentLessonSlide = slideData;

        if (type === 'ppt') {
            // Use static image path (lesson PPT files may not be room-bound)
            const fileId = slideData.file_id || slideData.page_id;
            const pageNum = slideData.page_number || 1;
            const imgUrl = `/uploads/ppt/${fileId}/page_${pageNum}.png`;
            this._renderLessonPPTDirect(imgUrl, slideData.annotations_json, pageNum);
        } else if (type === 'game') {
            // Render game in iframe
            this._renderGameSlide(slideData);
        } else {
            // Generic slide
            ClassroomStudentUI.showSlideContent(
                `<div style="text-align:center;padding:40px;">
                    <h2>${slideData.title || type}</h2>
                    <p>Slide type: ${type}</p>
                </div>`
            );
        }
    },

    async _renderLessonPPTDirect(imgUrl, annotationsJson, pageNumber) {
        try {
            ClassroomStudentUI.showLoadingSpinner();

            // displayPageImage accepts any URL (blob or static)
            await ClassroomStudentUI.displayPageImage(imgUrl, this.state.fabricCanvas);

            if (annotationsJson) {
                await ClassroomStudentUI.renderAnnotations(annotationsJson, this.state.fabricCanvas);
            } else {
                ClassroomStudentUI.clearAnnotations(this.state.fabricCanvas);
            }

            ClassroomStudentUI.updatePageNumber(pageNumber);
            UIModule.toast(`已接收到第 ${pageNumber} 頁`, 'success');
        } catch (error) {
            console.error('Error rendering lesson PPT:', error);
            UIModule.toast('加載頁面失敗: ' + error.message, 'error');
        }
    },

    _renderGameSlide(slideData) {
        const gameUrl = slideData.game_url || '';
        const gameName = slideData.game_name || 'Game';
        const timeLimit = slideData.time_limit || 0;

        // Show game in an iframe (sandboxed)
        const contentArea = document.getElementById('contentArea') || document.querySelector('.canvas-wrapper');
        if (contentArea) {
            const placeholder = document.getElementById('canvasPlaceholder');
            if (placeholder) placeholder.style.display = 'none';
            const noPage = document.getElementById('noPageMessage');
            if (noPage) noPage.style.display = 'none';
            const spinner = document.getElementById('loadingSpinner');
            if (spinner) spinner.style.display = 'none';

            // Make wrapper fill the container for game display
            contentArea.style.display = 'flex';
            contentArea.style.width = '100%';
            contentArea.style.height = '100%';
            contentArea.innerHTML = `
                <div style="width:100%;height:100%;display:flex;flex-direction:column;">
                    <div style="padding:8px 16px;background:#f5f5f7;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center;">
                        <span style="font-weight:600;">${Utils.escapeHtml(gameName)}</span>
                        ${timeLimit > 0 ? `<span style="color:#6E6E73;font-size:13px;">${timeLimit} 秒</span>` : ''}
                    </div>
                    <iframe
                        src="${Utils.escapeHtml(gameUrl)}"
                        style="flex:1;border:none;width:100%;min-height:0;"
                        sandbox="allow-scripts allow-same-origin"
                        id="gameIframe"
                    ></iframe>
                </div>
            `;

            // Listen for game score messages
            window.addEventListener('message', this._handleGameMessage.bind(this));
        }
    },

    _handleGameMessage(event) {
        // Accept score from game iframe
        if (event.data && event.data.type === 'game_score') {
            const score = event.data.score || 0;
            const slideId = this.state.currentLessonSlide?.slide_id;
            if (slideId && this.state.lessonAccepting) {
                this._sendWSMessage({
                    type: 'submit_response',
                    slide_id: slideId,
                    response_type: 'game_score',
                    response_data: { score },
                });
            }
        }
    },

    _updateLessonResponseUI() {
        // Update response-related UI based on lifecycle
        const lifecycle = this.state.lessonLifecycle;
        const accepting = this.state.lessonAccepting;
        console.log(`Lesson lifecycle: ${lifecycle}, accepting: ${accepting}`);
    },

    // ---- Room Status Handling ----

    _handleRoomStatusChanged(data) {
        const status = data.status || 'draft';
        this.state.roomStatus = status;

        switch (status) {
            case 'paused':
                UIModule.toast('課堂已暫停', 'warning');
                break;
            case 'ended':
                ClassroomStudentUI.showRoomEndedOverlay();
                break;
            default:
                break;
        }
    },

    // ---- AI Floating Window ----

    _setupAIChatPanel() {
        const circleBtn = document.getElementById('aiCircleButton');
        const win = document.getElementById('aiFloatingWindow');
        const closeBtn = document.getElementById('aiFloatCloseBtn');
        const expandBtn = document.getElementById('aiFloatExpandBtn');
        const sendBtn = document.getElementById('aiChatSendButton');
        const input = document.getElementById('aiChatInput');

        // Toggle floating window
        circleBtn.addEventListener('click', () => {
            const visible = win.style.display === 'none';
            win.style.display = visible ? 'flex' : 'none';
            if (visible) setTimeout(() => input.focus(), 100);
        });

        // Close
        closeBtn.addEventListener('click', () => {
            win.style.display = 'none';
        });

        // Expand / collapse
        expandBtn.addEventListener('click', () => {
            const isExpanded = win.classList.toggle('ai-float--expanded');
            expandBtn.innerHTML = isExpanded ? '&#9635;' : '&#9634;';
            expandBtn.title = isExpanded ? '縮小' : '放大';
        });

        // Send button
        sendBtn.addEventListener('click', () => this._sendAIMessage());

        // Enter to send
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendAIMessage();
            }
        });

        // ---- Drag logic (header as handle) ----
        this._setupDrag();
    },

    _setupDrag() {
        const win = document.getElementById('aiFloatingWindow');
        const header = document.getElementById('aiFloatHeader');
        let dragState = null;
        let lastX = 0, lastY = 0, rafPending = false;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return; // Don't drag from buttons
            e.preventDefault();

            const rect = win.getBoundingClientRect();
            // Convert from right/bottom positioning to left/top
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
            win.style.right = 'auto';
            win.style.bottom = 'auto';

            dragState = {
                offsetX: e.clientX - rect.left,
                offsetY: e.clientY - rect.top,
            };
            win.style.transition = 'none';
            win.classList.add('ai-float--dragging');
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!dragState) return;
            lastX = e.clientX;
            lastY = e.clientY;
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
            win.classList.remove('ai-float--dragging');
            document.body.style.userSelect = '';
        });

        // ---- Touch drag support (mobile) ----
        header.addEventListener('touchstart', (e) => {
            if (e.target.closest('button')) return;
            const touch = e.touches[0];
            const rect = win.getBoundingClientRect();
            win.style.left = rect.left + 'px';
            win.style.top = rect.top + 'px';
            win.style.right = 'auto';
            win.style.bottom = 'auto';
            dragState = {
                offsetX: touch.clientX - rect.left,
                offsetY: touch.clientY - rect.top,
            };
            win.style.transition = 'none';
            win.classList.add('ai-float--dragging');
        }, { passive: true });

        document.addEventListener('touchmove', (e) => {
            if (!dragState) return;
            const touch = e.touches[0];
            win.style.left = Math.max(0, Math.min(touch.clientX - dragState.offsetX, window.innerWidth - win.offsetWidth)) + 'px';
            win.style.top = Math.max(0, Math.min(touch.clientY - dragState.offsetY, window.innerHeight - win.offsetHeight)) + 'px';
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (!dragState) return;
            dragState = null;
            win.style.transition = '';
            win.classList.remove('ai-float--dragging');
        });
    },

    /**
     * Send a message to the classroom AI assistant.
     */
    async _sendAIMessage() {
        const input = document.getElementById('aiChatInput');
        const sendBtn = document.getElementById('aiChatSendButton');
        const text = (input.value || '').trim();

        if (!text || this.state.aiIsStreaming) return;

        // Check if there is a current page
        if (!this.state.currentFileId || !this.state.currentPageNumber) {
            UIModule.toast('等待老師推送頁面後再提問', 'warning');
            return;
        }

        // Hide welcome message
        const welcome = document.getElementById('aiChatWelcome');
        if (welcome) welcome.style.display = 'none';

        // Clear input
        input.value = '';

        // Render user message
        this._renderAIUserMessage(text);

        // Disable input during streaming
        this.state.aiIsStreaming = true;
        input.disabled = true;
        sendBtn.disabled = true;

        // Show typing indicator
        this._showAITypingIndicator();

        // Accumulate raw text for final markdown rendering
        let rawText = '';

        try {
            const response = await ClassroomStudentAPI.classroomAIStream(
                this.state.roomId,
                text,
                this.state.currentFileId,
                this.state.currentPageNumber,
                this.state.aiConversationId
            );

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            // Remove typing indicator and create AI bubble
            this._removeAITypingIndicator();
            const aiBubbleContent = this._createAIMessageBubble();

            // Parse SSE stream
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE events
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                let eventType = '';
                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        eventType = line.slice(7).trim();
                    } else if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6);
                        try {
                            const data = JSON.parse(dataStr);
                            if (eventType === 'meta' && data.conversation_id) {
                                this.state.aiConversationId = data.conversation_id;
                            } else if (eventType === 'answer' && data.content) {
                                rawText += data.content;
                                // Show plain text during streaming
                                aiBubbleContent.textContent = rawText;
                                this._scrollAIChatToBottom();
                            } else if (eventType === 'done') {
                                // Stream complete — render markdown
                                this._renderMarkdown(aiBubbleContent, rawText);
                                this._scrollAIChatToBottom();
                            } else if (eventType === 'error') {
                                aiBubbleContent.textContent = data.message || 'AI 回覆出錯';
                                aiBubbleContent.style.color = 'var(--color-danger)';
                            }
                        } catch (e) {
                            // Ignore parse errors for incomplete chunks
                        }
                    }
                }
            }

            // Fallback: if done event was missed, render markdown from accumulated text
            if (rawText && aiBubbleContent.dataset.rendered !== 'true') {
                this._renderMarkdown(aiBubbleContent, rawText);
            }

        } catch (error) {
            console.error('AI stream error:', error);
            this._removeAITypingIndicator();
            this._renderAIErrorMessage('AI 服務暫時不可用，請稍後再試');
        } finally {
            this.state.aiIsStreaming = false;
            input.disabled = false;
            sendBtn.disabled = false;
            input.focus();
        }
    },

    /**
     * Render markdown content into an element using marked + DOMPurify.
     */
    _renderMarkdown(el, text) {
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            el.innerHTML = DOMPurify.sanitize(marked.parse(text));
        } else {
            // Fallback: plain text with line breaks
            el.innerHTML = text.replace(/&/g, '&amp;').replace(/</g, '&lt;')
                               .replace(/>/g, '&gt;').replace(/\n/g, '<br>');
        }
        el.dataset.rendered = 'true';
    },

    // ---- AI Chat UI Helpers ----

    _renderAIUserMessage(text) {
        const container = document.getElementById('aiChatContent');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-msg user';

        const content = document.createElement('div');
        content.className = 'ai-chat-msg-content';
        content.textContent = text;

        msgDiv.appendChild(content);
        container.appendChild(msgDiv);
        this._scrollAIChatToBottom();
    },

    _createAIMessageBubble() {
        const container = document.getElementById('aiChatContent');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-msg ai';

        const content = document.createElement('div');
        content.className = 'ai-chat-msg-content';
        content.textContent = '';

        msgDiv.appendChild(content);
        container.appendChild(msgDiv);
        this._scrollAIChatToBottom();
        return content;
    },

    _renderAIErrorMessage(text) {
        const container = document.getElementById('aiChatContent');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-msg ai';

        const content = document.createElement('div');
        content.className = 'ai-chat-msg-content';
        content.textContent = text;
        content.style.color = 'var(--color-danger)';

        msgDiv.appendChild(content);
        container.appendChild(msgDiv);
        this._scrollAIChatToBottom();
    },

    _renderAISystemMessage(text) {
        const container = document.getElementById('aiChatContent');
        if (!container) return;

        const welcome = document.getElementById('aiChatWelcome');
        if (welcome && welcome.style.display !== 'none') return;

        const msgDiv = document.createElement('div');
        msgDiv.className = 'ai-chat-system-msg';
        msgDiv.textContent = text;

        container.appendChild(msgDiv);
        this._scrollAIChatToBottom();
    },

    _showAITypingIndicator() {
        const container = document.getElementById('aiChatContent');
        const indicator = document.createElement('div');
        indicator.className = 'ai-typing-indicator';
        indicator.id = 'aiTypingIndicator';
        indicator.innerHTML = '<div class="dot"></div><div class="dot"></div><div class="dot"></div>';
        container.appendChild(indicator);
        this._scrollAIChatToBottom();
    },

    _removeAITypingIndicator() {
        const indicator = document.getElementById('aiTypingIndicator');
        if (indicator) indicator.remove();
    },

    _scrollAIChatToBottom() {
        const container = document.getElementById('aiChatContent');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    },

    // ---- Event Listeners ----

    _setupEventListeners() {
        // Back button
        document.getElementById('backButton').addEventListener('click', () => {
            ClassroomStudentAPI.leaveRoom(this.state.roomId);
            window.location.href = '/classroom';
        });

        // AI Chat
        this._setupAIChatPanel();

        // Page unload
        window.addEventListener('beforeunload', () => {
            ClassroomStudentAPI.leaveRoom(this.state.roomId);
            if (this.state.ws) {
                this.state.ws.close();
            }
        });

        // Handle visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this._stopHeartbeat();
                this._stopPing();
            } else {
                if (this.state.isConnected) {
                    this._startHeartbeat();
                    this._startPing();
                }
            }
        });
    }
};


// ============================================================
//  Entry Point
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    ClassroomStudentApp.init();
});
