'use strict';

/**
 * classroom_teacher.js - 教师课堂课件演示系统
 *
 * 依赖:
 *   - fabric.js (全局 fabric 对象)
 *   - shared/utils.js
 *   - shared/auth.js   → AuthModule
 *   - shared/ui.js     → UIModule
 *   - shared/api.js    → APIClient
 */

// ==================== CONFIGURATION ====================
const API_BASE = '/api';
const roomId = window.location.pathname.split('/').pop();
let userInfo = {};

// ==================== STATE ====================
const state = {
    canvas: null,
    isDrawing: false,
    currentTool: 'pen',
    currentColor: '#000000',
    currentLineWidth: 2,
    pptFiles: [],
    currentFileId: null,
    currentPage: 0,
    totalPages: 0,
    canvasHistory: [],
    historyIndex: -1,
    students: new Map(),
    roomStatus: 'draft',
    annotationsByPage: new Map(),
    isTextMode: false,
    ws: null,
    wsConnected: false,
};

// ==================== INITIALIZATION ====================
async function initialize() {
    if (!AuthModule.isAuthenticated()) {
        window.location.href = '/';
        return;
    }

    // 通过 AuthModule.verify() 获取用户信息
    try {
        const data = await AuthModule.verify();
        if (data) {
            userInfo = data;
            userInfo.name = userInfo.display_name || userInfo.username;
        } else {
            window.location.href = '/';
            return;
        }
    } catch (e) {
        window.location.href = '/';
        return;
    }

    setupDOM();
    // 注意：Fabric.js canvas 延迟到 PPT 第一页加载成功后才初始化
    // 避免在 display:none 的元素上创建 canvas 导致尺寸为 0
    setupEventListeners();
    connectWebSocket();
    loadUserInfo();
}

function setupDOM() {
    document.getElementById('roomId').textContent = roomId;
    if (userInfo.name) {
        document.getElementById('teacherName').textContent = userInfo.name;
    }
}

function initializeCanvas() {
    const canvas = document.getElementById('fabricCanvas');
    state.canvas = new fabric.Canvas(canvas, {
        isDrawingMode: true,
        backgroundColor: 'rgba(255,255,255,0)',
    });

    // Initialize pen brush
    state.canvas.freeDrawingBrush = new fabric.PencilBrush(state.canvas);
    state.canvas.freeDrawingBrush.width = state.currentLineWidth;
    state.canvas.freeDrawingBrush.color = state.currentColor;

    // Canvas events
    state.canvas.on('object:added', () => {
        if (!state.isTextMode) {
            addHistorySnapshot();
        }
    });

    state.canvas.on('object:removed', () => {
        if (!state.isTextMode) {
            addHistorySnapshot();
        }
    });

    addHistorySnapshot();
    console.log('[Canvas] Fabric.js initialized, canvas size:', canvas.width, canvas.height);
}

function setupEventListeners() {
    // Tool buttons
    document.getElementById('penBtn').addEventListener('click', () => selectTool('pen'));
    document.getElementById('highlighterBtn').addEventListener('click', () => selectTool('highlighter'));
    document.getElementById('eraserBtn').addEventListener('click', () => selectTool('eraser'));
    document.getElementById('textBtn').addEventListener('click', () => selectTool('text'));
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);

    // Color picker
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            state.currentColor = e.target.dataset.color;
            updateBrush();
        });
    });

    // Line width slider
    document.getElementById('lineWidthSlider').addEventListener('change', (e) => {
        state.currentLineWidth = parseInt(e.target.value);
        updateBrush();
    });

    // History
    document.getElementById('undoBtn').addEventListener('click', undo);
    document.getElementById('redoBtn').addEventListener('click', redo);

    // Push
    document.getElementById('pushBtn').addEventListener('click', pushToStudents);

    // Page navigation
    document.getElementById('prevBtn').addEventListener('click', previousPage);
    document.getElementById('nextBtn').addEventListener('click', nextPage);

    // Upload
    document.getElementById('uploadBtn').addEventListener('click', () => {
        document.getElementById('pptFile').click();
    });
    document.getElementById('pptFile').addEventListener('change', handleFileUpload);

    // Room controls
    document.getElementById('startClassBtn').addEventListener('click', () => changeRoomStatus('active'));
    document.getElementById('pauseBtn').addEventListener('click', () => changeRoomStatus('paused'));
    document.getElementById('resumeBtn').addEventListener('click', () => changeRoomStatus('active'));
    document.getElementById('endClassBtn').addEventListener('click', () => changeRoomStatus('ended'));

    // Confirm modal
    document.getElementById('confirmCancel').addEventListener('click', closeConfirmModal);
    document.getElementById('confirmOk').addEventListener('click', executeConfirmAction);
}

// ==================== TOOL SELECTION ====================
function selectTool(tool) {
    if (!state.canvas) return;
    state.currentTool = tool;
    state.isTextMode = false;

    // Update button states
    document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
    if (tool === 'pen') {
        document.getElementById('penBtn').classList.add('active');
        state.canvas.isDrawingMode = true;
        state.canvas.freeDrawingBrush = new fabric.PencilBrush(state.canvas);
    } else if (tool === 'highlighter') {
        document.getElementById('highlighterBtn').classList.add('active');
        state.canvas.isDrawingMode = true;
        state.canvas.freeDrawingBrush = new fabric.PencilBrush(state.canvas);
    } else if (tool === 'eraser') {
        document.getElementById('eraserBtn').classList.add('active');
        state.canvas.isDrawingMode = true;
        state.canvas.freeDrawingBrush = new fabric.PencilBrush(state.canvas);
    } else if (tool === 'text') {
        document.getElementById('textBtn').classList.add('active');
        state.canvas.isDrawingMode = false;
        state.isTextMode = true;
        state.canvas.defaultCursor = 'text';
    }

    updateBrush();
    document.getElementById('fabricCanvas').style.cursor = tool === 'text' ? 'text' : 'crosshair';
}

function updateBrush() {
    if (!state.canvas || !state.canvas.isDrawingMode) return;

    const brush = state.canvas.freeDrawingBrush;
    brush.color = state.currentColor;
    brush.width = state.currentLineWidth;

    if (state.currentTool === 'highlighter') {
        brush.color = changeOpacity(state.currentColor, 0.3);
        brush.width = state.currentLineWidth * 3;
    } else if (state.currentTool === 'eraser') {
        brush.globalCompositeOperation = 'destination-out';
        brush.color = 'rgba(0,0,0,1)';
    } else {
        brush.globalCompositeOperation = 'source-over';
    }
}

function changeOpacity(color, opacity) {
    const hex = color.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ==================== CANVAS OPERATIONS ====================
function clearCanvas() {
    if (state.roomStatus === 'ended') {
        UIModule.toast('课程已结束，无法清除', 'error');
        return;
    }

    showConfirmModal(
        '清除所有标注',
        '确定要清除当前页面的所有标注吗？此操作无法撤销。',
        () => {
            state.canvas.clear();
            addHistorySnapshot();
        }
    );
}

function addHistorySnapshot() {
    if (!state.canvas) return;
    state.historyIndex++;
    state.canvasHistory = state.canvasHistory.slice(0, state.historyIndex);
    const snapshot = JSON.stringify(state.canvas.toJSON());
    state.canvasHistory.push(snapshot);

    updateHistoryButtons();
}

function undo() {
    if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreFromHistory();
    }
}

function redo() {
    if (state.historyIndex < state.canvasHistory.length - 1) {
        state.historyIndex++;
        restoreFromHistory();
    }
}

function restoreFromHistory() {
    const snapshot = state.canvasHistory[state.historyIndex];
    state.canvas.loadFromJSON(snapshot, () => {
        state.canvas.renderAll();
        updateHistoryButtons();
    });
}

function updateHistoryButtons() {
    document.getElementById('undoBtn').disabled = state.historyIndex === 0;
    document.getElementById('redoBtn').disabled = state.historyIndex === state.canvasHistory.length - 1;
}

// ==================== PAGE NAVIGATION ====================
function previousPage() {
    if (state.currentPage > 0) {
        loadPage(state.currentPage - 1);
    }
}

function nextPage() {
    if (state.currentPage < state.totalPages - 1) {
        loadPage(state.currentPage + 1);
    }
}

async function loadPage(pageNumber) {
    if (pageNumber < 0 || pageNumber >= state.totalPages || !state.currentFileId) return;

    // Save current page annotations
    savePageAnnotations();

    state.currentPage = pageNumber;
    updatePageNavigation();

    // Load image with Authorization header (img src 无法带 header)
    // 后端页码从 1 开始，前端内部从 0 开始，API 调用时 +1
    try {
        const apiPageNum = pageNumber + 1;
        const imageUrl = `${API_BASE}/classroom/ppt/${state.currentFileId}/page/${apiPageNum}`;
        const response = await fetch(imageUrl, {
            headers: AuthModule.getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const img = document.getElementById('pptImage');
        // 释放上一次的 blob URL
        if (img.src && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
        img.onload = () => {
            resizeCanvasToImage();
            loadPageAnnotations();
            // 重新确保 drawing mode 和 brush 正确设置
            ensureDrawingReady();
        };
        img.src = blobUrl;
    } catch (error) {
        UIModule.toast(`加载页面失败: ${error.message}`, 'error');
    }
}

/**
 * 在每次 canvas 尺寸变化后，重新确保 Fabric.js drawing 就绪
 * Fabric.js 在 display:none 或尺寸为 0 时初始化会导致内部偏移量错误
 */
function ensureDrawingReady() {
    if (!state.canvas) return;

    // 强制重新计算 canvas 偏移量（鼠标坐标修正）
    state.canvas.calcOffset();

    // 确保 upper-canvas 尺寸与 lower-canvas 一致
    const upperCanvas = state.canvas.upperCanvasEl;
    const lowerCanvas = state.canvas.lowerCanvasEl;
    if (upperCanvas && lowerCanvas) {
        upperCanvas.width = lowerCanvas.width;
        upperCanvas.height = lowerCanvas.height;
        upperCanvas.style.width = lowerCanvas.style.width;
        upperCanvas.style.height = lowerCanvas.style.height;
    }

    // 重新设置当前工具的 brush
    if (state.canvas.isDrawingMode) {
        state.canvas.freeDrawingBrush = new fabric.PencilBrush(state.canvas);
        updateBrush();
    }

    state.canvas.renderAll();

    console.log('[Canvas] ensureDrawingReady:', {
        canvasW: state.canvas.width,
        canvasH: state.canvas.height,
        upperW: upperCanvas?.width,
        upperH: upperCanvas?.height,
        isDrawingMode: state.canvas.isDrawingMode,
        hasBrush: !!state.canvas.freeDrawingBrush,
    });
}

function resizeCanvasToImage() {
    if (!state.canvas) return;
    const img = document.getElementById('pptImage');
    const wrapper = document.querySelector('.canvas-wrapper');

    if (img.complete && img.naturalWidth && wrapper) {
        const imgRect = img.getBoundingClientRect();
        const wrapperRect = wrapper.getBoundingClientRect();

        // 使用图片的显示尺寸（不是原始像素尺寸）
        const displayWidth = imgRect.width;
        const displayHeight = imgRect.height;

        // 图片在 wrapper 内的相对位置
        const relLeft = imgRect.left - wrapperRect.left;
        const relTop = imgRect.top - wrapperRect.top;

        state.canvas.setWidth(displayWidth);
        state.canvas.setHeight(displayHeight);

        // 定位 Fabric.js 的 .canvas-container（它包裹了实际的 canvas）
        const canvasContainer = wrapper.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.style.left = relLeft + 'px';
            canvasContainer.style.top = relTop + 'px';
        }

        // 重新计算画布偏移，否则鼠标/触摸坐标会偏移
        state.canvas.calcOffset();
        state.canvas.renderAll();
    }
}

function updatePageNavigation() {
    document.getElementById('currentPage').textContent = state.currentPage + 1;
    document.getElementById('totalPages').textContent = state.totalPages;
    document.getElementById('prevBtn').disabled = state.currentPage === 0;
    document.getElementById('nextBtn').disabled = state.currentPage === state.totalPages - 1;

    // Update active thumbnail
    document.querySelectorAll('.thumbnail').forEach((thumb, index) => {
        thumb.classList.toggle('active', index === state.currentPage);
    });
}

function savePageAnnotations() {
    if (!state.canvas) return;
    const key = `page_${state.currentFileId}_${state.currentPage}`;
    state.annotationsByPage.set(key, JSON.stringify(state.canvas.toJSON()));
}

function loadPageAnnotations() {
    if (!state.canvas) return;
    const key = `page_${state.currentFileId}_${state.currentPage}`;
    const annotations = state.annotationsByPage.get(key);

    if (annotations) {
        state.canvas.loadFromJSON(JSON.parse(annotations), () => {
            state.canvas.renderAll();
        });
    } else {
        state.canvas.clear();
    }

    state.canvasHistory = [];
    state.historyIndex = -1;
    addHistorySnapshot();
}

// ==================== PPT UPLOAD & DISPLAY ====================
async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    document.getElementById('uploadBtn').disabled = true;
    UIModule.toast('正在上传课件...', 'info');

    try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}/ppt`, {
            method: 'POST',
            headers: AuthModule.getAuthHeaders(),
            body: formData,
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '上传失败');
        }

        UIModule.toast('课件上传成功', 'success');
        loadPPTFiles();
    } catch (error) {
        UIModule.toast(`上传失败: ${error.message}`, 'error');
    } finally {
        document.getElementById('uploadBtn').disabled = false;
        document.getElementById('pptFile').value = '';
    }
}

let pptPollTimer = null;

async function loadPPTFiles() {
    try {
        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}/ppt`, {
            headers: AuthModule.getAuthHeaders(),
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '获取课件列表失败');
        }

        // data.data = { room_id, total, files: [...] }
        const result = data.data || {};
        state.pptFiles = result.files || [];

        if (state.pptFiles.length > 0) {
            const firstFile = state.pptFiles[0];
            state.currentFileId = firstFile.file_id;
            state.totalPages = firstFile.total_pages || 0;

            if (firstFile.process_status === 'completed' && state.totalPages > 0) {
                // 处理完成，显示课件
                if (pptPollTimer) { clearTimeout(pptPollTimer); pptPollTimer = null; }

                // 1) 切换显示：隐藏 placeholder，显示 canvas 区域
                document.getElementById('canvasPlaceholder').style.display = 'none';
                document.getElementById('canvasArea').style.display = 'flex';

                // 2) 在元素可见后初始化 Fabric.js canvas（仅首次）
                if (!state.canvas) {
                    initializeCanvas();
                }

                // 3) 加载缩略图（不阻塞主页面）
                loadThumbnails();

                // 4) 加载第一页（img.onload 中会 resize canvas + ensureDrawingReady）
                await loadPage(0);

                updatePageNavigation();
            } else if (firstFile.process_status === 'pending' || firstFile.process_status === 'processing') {
                // 正在处理，轮询等待
                document.getElementById('canvasPlaceholder').innerHTML =
                    '⏳ 课件正在处理中，请稍候...';
                UIModule.toast('课件正在处理中，请稍候...', 'info');
                pptPollTimer = setTimeout(loadPPTFiles, 3000);
            } else if (firstFile.process_status === 'failed') {
                document.getElementById('canvasPlaceholder').innerHTML =
                    '❌ 课件处理失败，请重新上传';
                UIModule.toast('课件处理失败，请重新上传', 'error');
            }
        }
    } catch (error) {
        UIModule.toast(`获取课件列表失败: ${error.message}`, 'error');
    }
}

async function loadThumbnails() {
    if (!state.currentFileId) return;

    const container = document.getElementById('thumbnailsContainer');
    container.innerHTML = '';

    // 先创建所有 DOM 元素
    const thumbElements = [];
    for (let i = 0; i < state.totalPages; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail' + (i === 0 ? ' active' : '');
        const imgEl = document.createElement('img');
        imgEl.alt = `页面 ${i + 1}`;
        thumb.appendChild(imgEl);
        thumb.addEventListener('click', () => loadPage(i));
        container.appendChild(thumb);
        thumbElements.push({ imgEl, pageNumber: i });
    }

    // 并发控制：每批最多 3 个缩略图同时加载
    const BATCH_SIZE = 3;
    for (let i = 0; i < thumbElements.length; i += BATCH_SIZE) {
        const batch = thumbElements.slice(i, i + BATCH_SIZE);
        await Promise.all(batch.map(({ imgEl, pageNumber }) =>
            loadThumbnailImage(imgEl, pageNumber)
        ));
    }
}

async function loadThumbnailImage(imgEl, pageNumber) {
    try {
        const apiPageNum = pageNumber + 1;
        // 使用缩略图接口而非全尺寸图片
        const url = `${API_BASE}/classroom/ppt/${state.currentFileId}/thumb/${apiPageNum}`;
        const response = await fetch(url, {
            headers: AuthModule.getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        imgEl.src = URL.createObjectURL(blob);
    } catch (error) {
        console.error(`缩略图 ${pageNumber} 加载失败:`, error);
    }
}

// ==================== PUSH TO STUDENTS ====================
async function pushToStudents() {
    if (state.roomStatus === 'ended') {
        UIModule.toast('课程已结束，无法推送', 'error');
        return;
    }

    if (state.roomStatus === 'paused') {
        UIModule.toast('课程已暂停，请先继续', 'error');
        return;
    }

    try {
        const annotationsJson = JSON.stringify(state.canvas.toJSON());

        const payload = {
            page_id: state.currentFileId,
            page_number: state.currentPage + 1,  // 后端页码从 1 开始
            annotations_json: annotationsJson,
        };

        // REST API push
        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}/push`, {
            method: 'POST',
            headers: {
                ...AuthModule.getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '推送失败');
        }

        // WebSocket push
        if (state.ws && state.wsConnected) {
            state.ws.send(JSON.stringify({
                type: 'push_page',
                ...payload,
            }));
        }

        UIModule.toast('已推送给学生', 'success');
    } catch (error) {
        UIModule.toast(`推送失败: ${error.message}`, 'error');
    }
}

// ==================== ROOM STATUS ====================
async function changeRoomStatus(newStatus) {
    if (newStatus === state.roomStatus) return;

    try {
        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}/status`, {
            method: 'PATCH',
            headers: {
                ...AuthModule.getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ status: newStatus }),
        });

        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '状态更新失败');
        }

        state.roomStatus = newStatus;
        updateRoomStatusUI();

        if (newStatus === 'ended') {
            document.getElementById('pushBtn').disabled = true;
            document.getElementById('clearBtn').disabled = true;
        }

        UIModule.toast(`课室状态已更新为: ${getStatusLabel(newStatus)}`, 'success');
    } catch (error) {
        UIModule.toast(`状态更新失败: ${error.message}`, 'error');
    }
}

function updateRoomStatusUI() {
    const statusEl = document.getElementById('roomStatus');
    statusEl.textContent = getStatusLabel(state.roomStatus);
    statusEl.className = `room-status ${state.roomStatus}`;

    const startBtn = document.getElementById('startClassBtn');
    const pauseBtn = document.getElementById('pauseBtn');
    const resumeBtn = document.getElementById('resumeBtn');

    startBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';

    if (state.roomStatus === 'draft') {
        startBtn.style.display = 'block';
    } else if (state.roomStatus === 'active') {
        pauseBtn.style.display = 'block';
    } else if (state.roomStatus === 'paused') {
        resumeBtn.style.display = 'block';
    }

    document.getElementById('pushBtn').disabled = state.roomStatus !== 'active';
}

function getStatusLabel(status) {
    const labels = {
        'draft': '草稿',
        'active': '进行中',
        'paused': '已暂停',
        'ended': '已结束',
    };
    return labels[status] || status;
}

// ==================== WEBSOCKET ====================
let wsRetryCount = 0;
const WS_MAX_RETRIES = 5;
let wsFatalError = false;

function connectWebSocket() {
    if (wsFatalError) return;

    const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
    const wsUrl = `${wsProtocol}://${location.host}/ws/classroom/${roomId}?token=${AuthModule.getToken()}`;

    state.ws = new WebSocket(wsUrl);

    state.ws.onopen = () => {
        state.wsConnected = true;
        wsRetryCount = 0;
        UIModule.toast('已连接到课室', 'info');
        startHeartbeat();
    };

    state.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // 如果服务器返回错误 (房间不存在/无权限)，停止重连
        if (msg.type === 'error') {
            wsFatalError = true;
            UIModule.toast('错误: ' + msg.message, 'error');
            setTimeout(() => { window.location.href = '/classroom'; }, 3000);
            return;
        }
        handleWebSocketMessage(msg);
    };

    state.ws.onclose = () => {
        state.wsConnected = false;
        if (wsFatalError) return;

        wsRetryCount++;
        if (wsRetryCount > WS_MAX_RETRIES) {
            UIModule.toast('无法连接到课室，请返回房间列表', 'error');
            return;
        }
        UIModule.toast(`连接已断开，${wsRetryCount}/${WS_MAX_RETRIES} 次重试...`, 'error');
        setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'connected':
            // 连接成功后从 API 获取房间详情（含 status）
            loadRoomInfo();
            break;
        case 'student_joined':
            addStudent({
                student_username: message.student_username,
                display_name: message.display_name || message.student_username,
            });
            if (message.online_count != null || message.active_count != null) {
                document.getElementById('studentCount').textContent =
                    message.online_count ?? message.active_count ?? state.students.size;
            }
            UIModule.toast(`学生 ${message.display_name || message.student_username} 已加入`, 'info');
            break;
        case 'student_left':
            removeStudent(message.student_username);
            if (message.online_count != null || message.active_count != null) {
                document.getElementById('studentCount').textContent =
                    message.online_count ?? message.active_count ?? state.students.size;
            }
            UIModule.toast(`学生 ${message.student_username} 已离开`, 'info');
            break;
        case 'room_status_changed':
            state.roomStatus = message.status || 'draft';
            updateRoomStatusUI();
            break;
        case 'push_ack':
            console.log('Push acknowledged:', message.push_id);
            break;
        case 'pong':
            break;
    }
}

function startHeartbeat() {
    setInterval(() => {
        if (state.wsConnected && state.ws && state.ws.readyState === WebSocket.OPEN) {
            state.ws.send(JSON.stringify({ type: 'ping' }));
        }
    }, 30000);
}

// ==================== STUDENT MANAGEMENT ====================
function addStudent(studentData) {
    const key = studentData.student_username;
    state.students.set(key, {
        student_username: key,
        name: studentData.display_name || key,
    });
    renderStudents();
}

function removeStudent(studentUsername) {
    if (studentUsername) {
        state.students.delete(studentUsername);
    }
    renderStudents();
}

function renderStudents() {
    const container = document.getElementById('studentsList');
    const count = state.students.size;

    document.getElementById('studentCount').textContent = count;

    if (count === 0) {
        container.innerHTML = `
            <div style="color: #999; font-size: 12px; text-align: center; padding: 20px;">
                暂无学生连接
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    state.students.forEach((student) => {
        const studentEl = document.createElement('div');
        studentEl.className = 'student-item';
        const initials = (student.name || '学').substring(0, 1).toUpperCase();
        studentEl.innerHTML = `
            <div class="status-indicator"></div>
            <div class="student-avatar">${initials}</div>
            <div class="student-info">
                <div class="student-name">${student.name || '未命名'}</div>
                <div class="student-status">在线</div>
            </div>
        `;
        container.appendChild(studentEl);
    });
}

// ==================== ROOM INFO ====================
async function loadRoomInfo() {
    try {
        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}`, {
            headers: AuthModule.getAuthHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data) {
            const room = data.data;
            state.roomStatus = room.room_status || 'draft';
            updateRoomStatusUI();

            // 更新课室信息显示
            if (room.title) {
                document.getElementById('roomId').textContent = room.title;
            }
            if (room.teacher_display_name) {
                document.getElementById('teacherName').textContent = room.teacher_display_name;
            }

            // 加载已有的 PPT 文件
            loadPPTFiles();

            // 加载已有的学生列表
            loadExistingStudents();
        }
    } catch (error) {
        console.error('获取房间信息失败:', error);
    }
}

async function loadExistingStudents() {
    try {
        const response = await fetch(`${API_BASE}/classroom/rooms/${roomId}/students`, {
            headers: AuthModule.getAuthHeaders(),
        });
        const data = await response.json();
        if (data.success && data.data) {
            const students = Array.isArray(data.data) ? data.data : (data.data.students || []);
            students.forEach(s => {
                addStudent({
                    student_username: s.student_username,
                    display_name: s.display_name || s.student_username,
                });
            });
        }
    } catch (error) {
        console.error('获取学生列表失败:', error);
    }
}

// ==================== UTILITIES ====================
function loadUserInfo() {
    if (userInfo.name) {
        document.getElementById('teacherName').textContent = userInfo.name;
    }
}

function showConfirmModal(title, body, onConfirm) {
    const modal = document.getElementById('confirmModal');
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmBody').textContent = body;

    window.confirmAction = onConfirm;

    modal.classList.add('show');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.remove('show');
    window.confirmAction = null;
}

function executeConfirmAction() {
    if (window.confirmAction) {
        window.confirmAction();
    }
    closeConfirmModal();
}

// ==================== WINDOW EVENTS ====================
window.addEventListener('resize', () => {
    resizeCanvasToImage();
    ensureDrawingReady();
});
document.getElementById('fabricCanvas').addEventListener('click', (e) => {
    if (state.isTextMode) {
        const rect = document.getElementById('fabricCanvas').getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const text = prompt('输入文字:');
        if (text) {
            const fabricText = new fabric.Text(text, {
                left: x,
                top: y,
                fontSize: 16,
                fill: state.currentColor,
                fontFamily: 'Arial',
            });
            state.canvas.add(fabricText);
            state.canvas.renderAll();
            addHistorySnapshot();
        }
    }
});

// ==================== START ====================
initialize();
