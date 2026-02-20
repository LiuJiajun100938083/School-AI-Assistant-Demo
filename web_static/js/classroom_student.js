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
            document.getElementById('teacherName').textContent = `教师: ${teacherName}`;
        }
    },

    /**
     * Update the page number display.
     */
    updatePageNumber(pageNumber) {
        document.getElementById('pageNumber').textContent = `第 ${pageNumber} 页`;
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
            label.textContent = '已连接';
        } else {
            indicator.classList.add('disconnected');
            label.textContent = '已断开';
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
        document.getElementById('overlayTitle').textContent = '课堂已结束';
        document.getElementById('overlayText').textContent = '本课堂已由老师结束，请返回课堂列表。';
        overlay.classList.add('visible');
    },

    showRoomClosedOverlay() {
        const overlay = document.getElementById('statusOverlay');
        document.getElementById('overlayTitle').textContent = '房间已关闭';
        document.getElementById('overlayText').textContent = '课堂房间已关闭，页面将在 3 秒后跳转。';
        overlay.classList.add('visible');

        setTimeout(() => {
            window.location.href = '/classroom';
        }, 3000);
    },

    /**
     * Display the page image on the canvas area.
     */
    displayPageImage(blobUrl, fabricCanvas) {
        const img = document.getElementById('pageImage');
        img.src = blobUrl;
        img.onload = () => {
            img.classList.add('loaded');
            this.hideLoadingSpinner();

            // Update canvas size to match image
            fabricCanvas.setWidth(img.offsetWidth);
            fabricCanvas.setHeight(img.offsetHeight);
            fabricCanvas.renderAll();
        };
    },

    /**
     * Render annotation JSON onto the Fabric canvas.
     */
    renderAnnotations(annotationsJson, fabricCanvas) {
        try {
            if (annotationsJson) {
                fabricCanvas.loadFromJSON(annotationsJson, () => {
                    fabricCanvas.renderAll();
                    document.getElementById('annotationCanvas').style.display = 'block';
                });
            } else {
                this.clearAnnotations(fabricCanvas);
            }
        } catch (error) {
            console.error('Error rendering annotations:', error);
        }
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
        reconnectTimer: null
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
                console.warn('获取用户信息失败:', e);
            }

            if (!this.state.roomId || !this.state.token) {
                UIModule.toast('缺少必要信息，请重新登录', 'error');
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

            // Request latest push on load
            setTimeout(() => {
                if (this.state.isConnected) {
                    this._sendWSMessage({ type: 'get_latest_push' });
                } else {
                    this._requestLatestPushViaHTTP();
                }
            }, 1000);

        } catch (error) {
            console.error('Init error:', error);
            UIModule.toast('初始化失败: ' + error.message, 'error');
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
                UIModule.toast(result.message || '加入课堂失败', 'error');
                return false;
            }
        } catch (error) {
            console.error('Join room error:', error);
            UIModule.toast('加入课堂失败: ' + error.message, 'error');
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
            console.error('获取房间信息失败:', error);
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
                    UIModule.toast('错误: ' + msg.message, 'error');
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
                    console.log('暂无推送');
                    break;

                case 'pong':
                    // Heartbeat response — no-op
                    break;

                case 'room_closed':
                    ClassroomStudentUI.showRoomClosedOverlay();
                    break;

                case 'error':
                    UIModule.toast(message.message || '服务器错误', 'error');
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
            UIModule.toast('无法连接到课室，请返回房间列表', 'error');
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
        try {
            const { page_id, page_number, annotations_json } = data;
            // page_id is the file_id (teacher sends currentFileId as page_id)
            const file_id = page_id;

            this.state.currentPageNumber = page_number;
            this.state.currentFileId = file_id;
            this.state.currentAnnotations = annotations_json;

            // Update page number display
            ClassroomStudentUI.updatePageNumber(page_number);

            // Show loading
            ClassroomStudentUI.showLoadingSpinner();

            // Load and display page image
            const blobUrl = await ClassroomStudentAPI.loadPageImage(file_id, page_number);
            ClassroomStudentUI.displayPageImage(blobUrl, this.state.fabricCanvas);

            // Render annotations
            if (annotations_json) {
                ClassroomStudentUI.renderAnnotations(annotations_json, this.state.fabricCanvas);
            } else {
                ClassroomStudentUI.clearAnnotations(this.state.fabricCanvas);
            }

            UIModule.toast(`已接收到第 ${page_number} 页`, 'success');

        } catch (error) {
            console.error('Error handling page push:', error);
            UIModule.toast('加载页面失败: ' + error.message, 'error');
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

    // ---- Room Status Handling ----

    _handleRoomStatusChanged(data) {
        const status = data.status || 'draft';
        this.state.roomStatus = status;

        switch (status) {
            case 'paused':
                UIModule.toast('课堂已暂停', 'warning');
                break;
            case 'ended':
                ClassroomStudentUI.showRoomEndedOverlay();
                break;
            default:
                break;
        }
    },

    // ---- AI Chat Panel ----

    _setupAIChatPanel() {
        const aiCircleButton = document.getElementById('aiCircleButton');
        const aiChatPanel = document.getElementById('aiChatPanel');
        const aiChatCloseButton = document.getElementById('aiChatCloseButton');
        const aiChatSendButton = document.getElementById('aiChatSendButton');
        const aiChatInput = document.getElementById('aiChatInput');

        aiCircleButton.addEventListener('click', () => {
            aiChatPanel.classList.toggle('open');
        });

        aiChatCloseButton.addEventListener('click', () => {
            aiChatPanel.classList.remove('open');
        });

        // Prevent closing when clicking inside panel
        aiChatPanel.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // Send button (disabled for now)
        aiChatSendButton.addEventListener('click', () => {
            if (aiChatInput.value.trim()) {
                // Future: Send to AI service
                aiChatInput.value = '';
            }
        });

        aiChatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && aiChatInput.value.trim()) {
                // Future: Send to AI service
                aiChatInput.value = '';
            }
        });
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
