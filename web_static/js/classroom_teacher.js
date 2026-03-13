'use strict';

/**
 * classroom_teacher.js - 教師課堂課件演示系統
 *
 * 依賴:
 *   - fabric.js (全局 fabric 對象)
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
    // Lesson plan mode
    lessonMode: false,
    lessonSessionId: null,
    lessonSession: null,
    lessonSlide: null,
    lessonSlides: [],
    lessonPlanId: null,
};

// ==================== INITIALIZATION ====================
async function initialize() {
    if (!AuthModule.isAuthenticated()) {
        window.location.href = '/';
        return;
    }

    // 通過 AuthModule.verify() 獲取用戶資訊
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
    // 注意：Fabric.js canvas 延遲到 PPT 第一頁加載成功後才初始化
    // 避免在 display:none 的元素上創建 canvas 導致尺寸為 0
    setupEventListeners();
    connectWebSocket();
    loadUserInfo();
    // Check if there's an active lesson session
    checkLessonState();
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
    // Back to classroom list
    document.getElementById('backToListBtn').addEventListener('click', () => {
        window.location.href = '/classroom';
    });

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
        UIModule.toast('課程已結束，無法清除', 'error');
        return;
    }

    showConfirmModal(
        '清除所有標註',
        '確定要清除當前頁面的所有標註嗎？此操作無法撤銷。',
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
    if (state.lessonMode) {
        lessonNavigate('prev');
        return;
    }
    if (state.currentPage > 0) {
        loadPage(state.currentPage - 1);
    }
}

function nextPage() {
    if (state.lessonMode) {
        lessonNavigate('next');
        return;
    }
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

    // Load image with Authorization header (img src 無法帶 header)
    // 後端頁碼從 1 開始，前端內部從 0 開始，API 調用時 +1
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
        // 釋放上一次的 blob URL
        if (img.src && img.src.startsWith('blob:')) {
            URL.revokeObjectURL(img.src);
        }
        img.onload = () => {
            resizeCanvasToImage();
            loadPageAnnotations();
            // 重新確保 drawing mode 和 brush 正確設置
            ensureDrawingReady();
        };
        img.src = blobUrl;
    } catch (error) {
        UIModule.toast(`加載頁面失敗: ${error.message}`, 'error');
    }
}

/**
 * 在每次 canvas 尺寸變化後，重新確保 Fabric.js drawing 就緒
 * Fabric.js 在 display:none 或尺寸為 0 時初始化會導致內部偏移量錯誤
 */
function ensureDrawingReady() {
    if (!state.canvas) return;

    // 強制重新計算 canvas 偏移量（滑鼠座標修正）
    state.canvas.calcOffset();

    // 確保 upper-canvas 尺寸與 lower-canvas 一致
    const upperCanvas = state.canvas.upperCanvasEl;
    const lowerCanvas = state.canvas.lowerCanvasEl;
    if (upperCanvas && lowerCanvas) {
        upperCanvas.width = lowerCanvas.width;
        upperCanvas.height = lowerCanvas.height;
        upperCanvas.style.width = lowerCanvas.style.width;
        upperCanvas.style.height = lowerCanvas.style.height;
    }

    // 重新設置當前工具的 brush
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

        const newWidth = imgRect.width;
        const newHeight = imgRect.height;
        const oldWidth = state.canvas.getWidth();
        const oldHeight = state.canvas.getHeight();

        // 圖片在 wrapper 內的相對位置
        const relLeft = imgRect.left - wrapperRect.left;
        const relTop = imgRect.top - wrapperRect.top;

        state.canvas.setWidth(newWidth);
        state.canvas.setHeight(newHeight);

        // 定位 Fabric.js 的 .canvas-container（它包裹了實際的 canvas）
        const canvasContainer = wrapper.querySelector('.canvas-container');
        if (canvasContainer) {
            canvasContainer.style.left = relLeft + 'px';
            canvasContainer.style.top = relTop + 'px';
        }

        // 按比例縮放已有標註對象，避免 resize 後位置偏移
        if (oldWidth > 0 && oldHeight > 0 &&
            (Math.abs(oldWidth - newWidth) > 1 || Math.abs(oldHeight - newHeight) > 1)) {
            AnnotationUtils.scaleObjects(state.canvas, newWidth / oldWidth, newHeight / oldHeight);
        }

        // 重新計算畫布偏移，否則滑鼠/觸摸座標會偏移
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
    UIModule.toast('正在上傳課件...', 'info');

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
            throw new Error(data.message || '上傳失敗');
        }

        UIModule.toast('課件上傳成功', 'success');
        loadPPTFiles();
    } catch (error) {
        UIModule.toast(`上傳失敗: ${error.message}`, 'error');
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
            throw new Error(data.message || '獲取課件列表失敗');
        }

        // data.data = { room_id, total, files: [...] }
        const result = data.data || {};
        state.pptFiles = result.files || [];

        if (state.pptFiles.length > 0) {
            const firstFile = state.pptFiles[0];
            state.currentFileId = firstFile.file_id;
            state.totalPages = firstFile.total_pages || 0;

            if (firstFile.process_status === 'completed' && state.totalPages > 0) {
                // 處理完成，顯示課件
                if (pptPollTimer) { clearTimeout(pptPollTimer); pptPollTimer = null; }

                // 1) 切換顯示：隱藏 placeholder，顯示 canvas 區域
                document.getElementById('canvasPlaceholder').style.display = 'none';
                document.getElementById('canvasArea').style.display = 'flex';

                // 2) 在元素可見後初始化 Fabric.js canvas（僅首次）
                if (!state.canvas) {
                    initializeCanvas();
                }

                // 3) 加載縮略圖（不阻塞主頁面）
                loadThumbnails();

                // 4) 加載第一頁（img.onload 中會 resize canvas + ensureDrawingReady）
                await loadPage(0);

                updatePageNavigation();
            } else if (firstFile.process_status === 'pending' || firstFile.process_status === 'processing') {
                // 正在處理，輪詢等待
                document.getElementById('canvasPlaceholder').innerHTML =
                    '⏳ 課件正在處理中，請稍候...';
                UIModule.toast('課件正在處理中，請稍候...', 'info');
                pptPollTimer = setTimeout(loadPPTFiles, 3000);
            } else if (firstFile.process_status === 'failed') {
                document.getElementById('canvasPlaceholder').innerHTML =
                    '❌ 課件處理失敗，請重新上傳';
                UIModule.toast('課件處理失敗，請重新上傳', 'error');
            }
        }
    } catch (error) {
        UIModule.toast(`獲取課件列表失敗: ${error.message}`, 'error');
    }
}

async function loadThumbnails() {
    if (!state.currentFileId) return;

    const container = document.getElementById('thumbnailsContainer');
    container.innerHTML = '';

    // 先創建所有 DOM 元素
    const thumbElements = [];
    for (let i = 0; i < state.totalPages; i++) {
        const thumb = document.createElement('div');
        thumb.className = 'thumbnail' + (i === 0 ? ' active' : '');
        const imgEl = document.createElement('img');
        imgEl.alt = `頁面 ${i + 1}`;
        thumb.appendChild(imgEl);
        thumb.addEventListener('click', () => loadPage(i));
        container.appendChild(thumb);
        thumbElements.push({ imgEl, pageNumber: i });
    }

    // 並發控制：每批最多 3 個縮略圖同時加載
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
        // 使用縮略圖接口而非全尺寸圖片
        const url = `${API_BASE}/classroom/ppt/${state.currentFileId}/thumb/${apiPageNum}`;
        const response = await fetch(url, {
            headers: AuthModule.getAuthHeaders(),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        imgEl.src = URL.createObjectURL(blob);
    } catch (error) {
        console.error(`縮略圖 ${pageNumber} 加載失敗:`, error);
    }
}

// ==================== PUSH TO STUDENTS ====================
async function pushToStudents() {
    if (state.roomStatus === 'ended') {
        UIModule.toast('課程已結束，無法推送', 'error');
        return;
    }

    if (state.roomStatus === 'paused') {
        UIModule.toast('課程已暫停，請先繼續', 'error');
        return;
    }

    // Lesson mode: activate or re-push annotations
    if (state.lessonMode) {
        const slide = state.lessonSlide;
        const lifecycle = (state.lessonSession || {}).slide_lifecycle || 'prepared';
        if (slide && slide.slide_type === 'ppt') {
            if (lifecycle === 'prepared') {
                await lessonSlideAction('activate');
            } else {
                await pushLessonAnnotations();
            }
        } else if (lifecycle === 'prepared') {
            await lessonSlideAction('activate');
        } else {
            UIModule.toast('此幻燈片已推送', 'info');
        }
        return;
    }

    try {
        const canvasJSON = AnnotationUtils.embedCanvasRef(state.canvas);
        const annotationsJson = JSON.stringify(canvasJSON);

        const payload = {
            page_id: state.currentFileId,
            page_number: state.currentPage + 1,  // 後端頁碼從 1 開始
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
            throw new Error(data.message || '推送失敗');
        }

        // WebSocket push
        if (state.ws && state.wsConnected) {
            state.ws.send(JSON.stringify({
                type: 'push_page',
                ...payload,
            }));
        }

        UIModule.toast('已推送給學生', 'success');
    } catch (error) {
        UIModule.toast(`推送失敗: ${error.message}`, 'error');
    }
}

/**
 * Push current annotations to students (for already-activated PPT slides).
 * Bypasses lifecycle — just saves & broadcasts annotation data.
 */
async function pushLessonAnnotations() {
    if (!state.canvas || !state.lessonSlide) {
        UIModule.toast('無法推送標註', 'error');
        return;
    }
    try {
        const canvasJSON = AnnotationUtils.embedCanvasRef(state.canvas);
        const annotationsJson = JSON.stringify(canvasJSON);
        const response = await fetch(`/api/classroom/rooms/${roomId}/lesson/push-annotations`, {
            method: 'POST',
            headers: {
                ...AuthModule.getAuthHeaders(),
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                slide_id: state.lessonSlide.slide_id,
                annotations_json: annotationsJson,
            }),
        });
        const data = await response.json();
        if (!data.success) {
            throw new Error(data.message || '推送失敗');
        }
        UIModule.toast('標註已推送給學生', 'success');
    } catch (error) {
        UIModule.toast(`推送標註失敗: ${error.message}`, 'error');
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
            throw new Error(data.message || '狀態更新失敗');
        }

        state.roomStatus = newStatus;
        updateRoomStatusUI();

        if (newStatus === 'ended') {
            document.getElementById('pushBtn').disabled = true;
            document.getElementById('clearBtn').disabled = true;
        }

        UIModule.toast(`課室狀態已更新為: ${getStatusLabel(newStatus)}`, 'success');
    } catch (error) {
        UIModule.toast(`狀態更新失敗: ${error.message}`, 'error');
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
        'active': '進行中',
        'paused': '已暫停',
        'ended': '已結束',
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
        UIModule.toast('已連接到課室', 'info');
        startHeartbeat();
    };

    state.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        // 如果伺服器返回錯誤 (房間不存在/無權限)，停止重連
        if (msg.type === 'error') {
            wsFatalError = true;
            UIModule.toast('錯誤: ' + msg.message, 'error');
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
            UIModule.toast('無法連接到課室，請返回房間列表', 'error');
            return;
        }
        UIModule.toast(`連接已斷開，${wsRetryCount}/${WS_MAX_RETRIES} 次重試...`, 'error');
        setTimeout(connectWebSocket, 3000);
    };

    state.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(message) {
    switch (message.type) {
        case 'connected':
            // 連接成功後從 API 獲取房間詳情（含 status）
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
            UIModule.toast(`學生 ${message.display_name || message.student_username} 已加入`, 'info');
            break;
        case 'student_left':
            removeStudent(message.student_username);
            if (message.online_count != null || message.active_count != null) {
                document.getElementById('studentCount').textContent =
                    message.online_count ?? message.active_count ?? state.students.size;
            }
            UIModule.toast(`學生 ${message.student_username} 已離開`, 'info');
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

        // ===== Lesson Plan Mode =====
        case 'lesson_session_started':
            state.lessonSessionId = message.session_id;
            state.lessonMode = true;
            UIModule.toast('課案已啟動', 'info');
            // Reload lesson state to get full session + slides
            checkLessonState();
            break;
        case 'lesson_session_ended':
            state.lessonMode = false;
            state.lessonSessionId = null;
            state.lessonSlides = [];
            state.lessonSlide = null;
            state.lessonSession = null;
            state.lessonPlanId = null;
            // Restore upload section
            const uploadSection = document.querySelector('.upload-section');
            if (uploadSection) uploadSection.style.display = '';
            const $startBar = document.getElementById('lessonStartBar');
            if ($startBar) $startBar.style.display = '';
            UIModule.toast('課案已結束', 'info');
            updateLessonUI();
            break;
        case 'student_responded':
            if (message.data) {
                UIModule.toast(`學生 ${message.data.student_username} 已回應 (${message.data.total_responses} 人)`, 'info');
            }
            break;
    }
}

// ==================== LESSON PLAN MODE ====================
async function checkLessonState() {
    try {
        const token = AuthModule.getToken();
        const res = await fetch(`/api/classroom/rooms/${roomId}/lesson/state`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success && json.data && json.data.session) {
            // Active session found → enter lesson mode
            const session = json.data.session;
            state.lessonMode = true;
            state.lessonSessionId = session.session_id;
            state.lessonSlide = json.data.slide;
            state.lessonSession = session;
            state.lessonPlanId = session.plan_id;
            await enterLessonMode(session.plan_id);
        } else {
            // No active session → auto-prompt lesson picker after brief delay
            setTimeout(() => autoPromptLesson(), 600);
        }
    } catch (e) {
        console.error('Check lesson state error:', e);
    }
}

/**
 * 自动检查是否有课案可用，有则弹出选择器
 */
async function autoPromptLesson() {
    try {
        const token = AuthModule.getToken();
        const res = await fetch('/api/classroom/lesson-plans', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        const plans = (json.success && json.data) ? json.data : [];
        if (plans.length > 0) {
            // Has lesson plans → show picker
            promptStartLesson();
        }
        // else: no plans → keep the original upload UI as fallback
    } catch (e) {
        console.log('Auto-prompt lesson: no plans available');
    }
}

/**
 * 进入课案模式 — 加载课案幻灯片列表，渲染左侧时间线
 */
async function enterLessonMode(planId) {
    try {
        const token = AuthModule.getToken();
        const res = await fetch(`/api/classroom/lesson-plans/${planId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        if (json.success && json.data) {
            const plan = json.data;
            state.lessonSlides = plan.slides || [];
            state.lessonPlanId = planId;

            // Hide upload section, show lesson timeline
            const uploadSection = document.querySelector('.upload-section');
            if (uploadSection) uploadSection.style.display = 'none';

            // Show lesson plan header in sidebar
            renderLessonTimeline(plan.title);

            // Show lesson control bar, hide start bar
            const $controlBar = document.getElementById('lessonControlBar');
            const $startBar = document.getElementById('lessonStartBar');
            if ($controlBar) $controlBar.style.display = 'flex';
            if ($startBar) $startBar.style.display = 'none';

            // Update placeholder
            document.getElementById('canvasPlaceholder').textContent = '選擇左側幻燈片開始';

            // Render current slide if exists
            updateLessonUI();
        }
    } catch (e) {
        console.error('Enter lesson mode error:', e);
    }
}

/**
 * 渲染左侧课案幻灯片时间线
 */
function renderLessonTimeline(planTitle) {
    const container = document.getElementById('thumbnailsContainer');
    container.innerHTML = '';

    // Plan title header
    if (planTitle) {
        const header = document.createElement('div');
        header.className = 'lesson-timeline-header';
        header.innerHTML = `<span class="lesson-timeline-icon">📋</span> ${planTitle}`;
        container.appendChild(header);
    }

    const typeIcons = {
        ppt: '📄', game: '🎮', quiz: '❓',
        quick_answer: '⚡', raise_hand: '✋', poll: '📊'
    };

    state.lessonSlides.forEach((slide, i) => {
        const el = document.createElement('div');
        el.className = 'lesson-slide-thumb';
        el.dataset.slideId = slide.slide_id;

        const isActive = state.lessonSlide && state.lessonSlide.slide_id === slide.slide_id;
        if (isActive) el.classList.add('active');

        const icon = typeIcons[slide.slide_type] || '📄';
        const cfg = typeof slide.config === 'string' ? JSON.parse(slide.config) : (slide.config || {});

        if (slide.slide_type === 'ppt' && cfg.file_id) {
            const imgUrl = `/uploads/ppt/${cfg.file_id}/page_${cfg.page_number}.png`;
            el.innerHTML = `
                <div class="slide-thumb-header">
                    <span class="slide-thumb-number">${i + 1}</span>
                    <span class="slide-thumb-type">${icon} PPT</span>
                </div>
                <img src="${imgUrl}" class="slide-thumb-img" onerror="this.style.display='none'" />
            `;
        } else {
            const label = slide.title || cfg.game_name || cfg.question_text || slide.slide_type;
            el.innerHTML = `
                <div class="slide-thumb-header">
                    <span class="slide-thumb-number">${i + 1}</span>
                    <span class="slide-thumb-type">${icon} ${slide.slide_type}</span>
                </div>
                <div class="slide-thumb-content">
                    <div class="slide-thumb-icon-large">${icon}</div>
                    <div class="slide-thumb-label">${label}</div>
                </div>
            `;
        }

        el.addEventListener('click', () => lessonNavigate('goto', slide.slide_id));
        container.appendChild(el);
    });
}

/**
 * 更新课案模式页码显示
 */
function updateLessonPageCounter() {
    if (!state.lessonMode || !state.lessonSlides.length) return;
    const currentIndex = state.lessonSlides.findIndex(s =>
        state.lessonSlide && s.slide_id === state.lessonSlide.slide_id
    );
    document.getElementById('currentPage').textContent = currentIndex >= 0 ? currentIndex + 1 : '-';
    document.getElementById('totalPages').textContent = state.lessonSlides.length;
    document.getElementById('prevBtn').disabled = currentIndex <= 0;
    document.getElementById('nextBtn').disabled = currentIndex >= state.lessonSlides.length - 1;
}

async function startLesson(planId) {
    try {
        const token = AuthModule.getToken();
        const res = await fetch(`/api/classroom/rooms/${roomId}/lesson/start`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ plan_id: planId }),
        });
        const json = await res.json();
        if (json.success) {
            state.lessonMode = true;
            state.lessonSessionId = json.data.session_id;
            state.lessonPlanId = planId;

            // Enter lesson mode (load slides, render timeline)
            await enterLessonMode(planId);

            // Navigate to first slide
            await lessonNavigate('next');

            UIModule.toast('課案已啟動', 'success');
        } else {
            UIModule.toast(json.message || '啟動失敗', 'error');
        }
    } catch (e) {
        UIModule.toast('啟動課案失敗', 'error');
    }
}

async function endLesson() {
    try {
        const token = AuthModule.getToken();
        await fetch(`/api/classroom/rooms/${roomId}/lesson/end`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        // Reset lesson state
        state.lessonMode = false;
        state.lessonSessionId = null;
        state.lessonSlides = [];
        state.lessonSlide = null;
        state.lessonSession = null;
        state.lessonPlanId = null;

        // Restore upload section + start bar
        const uploadSection = document.querySelector('.upload-section');
        if (uploadSection) uploadSection.style.display = '';
        const $startBar = document.getElementById('lessonStartBar');
        if ($startBar) $startBar.style.display = '';

        // Reset main area
        document.getElementById('canvasArea').style.display = 'none';
        document.getElementById('canvasPlaceholder').style.display = 'block';
        document.getElementById('canvasPlaceholder').textContent = '選擇課案開始上課';
        document.getElementById('thumbnailsContainer').innerHTML = '';

        updateLessonUI();
        UIModule.toast('課案已結束', 'success');
    } catch (e) {
        UIModule.toast('結束課案失敗', 'error');
    }
}

async function lessonNavigate(action, slideId) {
    try {
        const token = AuthModule.getToken();
        const body = { action };
        if (slideId) body.slide_id = slideId;
        // save current slide annotations with _canvasRef
        if (state.canvas) {
            const canvasJSON = AnnotationUtils.embedCanvasRef(state.canvas);
            body.annotations_json = JSON.stringify(canvasJSON);
        }
        const res = await fetch(`/api/classroom/rooms/${roomId}/lesson/navigate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success && json.data) {
            state.lessonSession = json.data.session;
            state.lessonSlide = json.data.slide;
            // Store target slide's saved annotations for renderLessonPPTSlide to use
            state.lessonSlideAnnotations = json.data.slide_annotations || null;
            updateLessonUI();
        } else {
            UIModule.toast(json.message || '導航失敗', 'error');
        }
    } catch (e) {
        UIModule.toast('導航失敗', 'error');
    }
}

async function lessonSlideAction(action) {
    try {
        const token = AuthModule.getToken();
        const body = { action };
        if (state.canvas && action === 'activate') {
            const canvasJSON = AnnotationUtils.embedCanvasRef(state.canvas);
            body.annotations_json = JSON.stringify(canvasJSON);
        }
        const res = await fetch(`/api/classroom/rooms/${roomId}/lesson/slide-action`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (json.success && json.data) {
            state.lessonSession = json.data.session;
            updateLessonUI();
        } else {
            UIModule.toast(json.message || '操作失敗', 'error');
        }
    } catch (e) {
        UIModule.toast('操作失敗', 'error');
    }
}

function updateLessonUI() {
    const $bar = document.getElementById('lessonControlBar');
    if (!$bar) return;

    if (!state.lessonMode) {
        $bar.style.display = 'none';
        return;
    }
    $bar.style.display = 'flex';

    const sess = state.lessonSession || {};
    const slide = state.lessonSlide;
    const lifecycle = sess.slide_lifecycle || 'prepared';

    // update lesson info text
    const $info = document.getElementById('lessonInfo');
    if ($info && slide) {
        const lifecycleLabels = {
            prepared: '準備中', activated: '已激活', responding: '回應中',
            closed: '已關閉', results_shown: '顯示結果', completed: '已完成',
        };
        $info.textContent = `第 ${(slide.slide_order || 0) + 1} 張: ${slide.title || slide.slide_type} [${lifecycleLabels[lifecycle] || lifecycle}]`;
    }

    // Render current slide in main area
    if (slide) {
        const cfg = typeof slide.config === 'string' ? JSON.parse(slide.config) : (slide.config || {});
        if (slide.slide_type === 'ppt' && cfg.file_id) {
            renderLessonPPTSlide(slide, cfg);
        } else if (slide.slide_type === 'game') {
            renderLessonGameSlide(slide, cfg, lifecycle);
        } else {
            renderLessonGenericSlide(slide, cfg, lifecycle);
        }
    }

    // Button management: push button label + sidebar activate visibility
    const pushBtn = document.getElementById('pushBtn');
    const activateBtn = document.getElementById('lessonActivateBtn');
    if (pushBtn) {
        if (slide && slide.slide_type === 'ppt') {
            pushBtn.style.display = '';
            pushBtn.innerHTML = lifecycle === 'prepared'
                ? '📤 推送給學生'
                : '📤 推送標註';
        } else {
            // Non-PPT: hide push button (lifecycle controls handle it)
            pushBtn.style.display = lifecycle === 'prepared' ? '' : 'none';
            pushBtn.innerHTML = '📤 推送給學生';
        }
    }
    if (activateBtn) {
        activateBtn.style.display = lifecycle === 'prepared' ? '' : 'none';
    }

    // Update timeline active state
    document.querySelectorAll('.lesson-slide-thumb').forEach(el => {
        el.classList.toggle('active', slide && el.dataset.slideId === slide.slide_id);
    });

    // Update page counter
    updateLessonPageCounter();
}

/**
 * 渲染 PPT 类型幻灯片到主区域 (使用静态图片路径 + Fabric.js 画布)
 */
function renderLessonPPTSlide(slide, cfg) {
    const imgUrl = `/uploads/ppt/${cfg.file_id}/page_${cfg.page_number}.png`;

    document.getElementById('canvasPlaceholder').style.display = 'none';
    document.getElementById('canvasArea').style.display = 'flex';

    if (!state.canvas) initializeCanvas();

    const img = document.getElementById('pptImage');
    if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src);

    img.onload = async () => {
        resizeCanvasToImage();
        // Clear canvas for new slide & reset history
        if (state.canvas) {
            state.canvas.clear();
            state.canvasHistory = [];
            state.historyIndex = -1;

            // Load per-slide saved annotations (from navigate response)
            const annJson = state.lessonSlideAnnotations || null;
            if (annJson) {
                await AnnotationUtils.loadAndScale(state.canvas, annJson);
            }
            addHistorySnapshot();
            state.lessonSlideAnnotations = null; // consumed
        }
        ensureDrawingReady();
    };
    img.src = imgUrl;
}

/**
 * 渲染游戏类型幻灯片
 */
function renderLessonGameSlide(slide, cfg, lifecycle) {
    document.getElementById('canvasArea').style.display = 'none';
    const placeholder = document.getElementById('canvasPlaceholder');
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.flexDirection = 'column';
    const lifecycleLabels = {
        prepared: '點擊「Activate」推送給學生',
        activated: '遊戲進行中...',
        responding: '等待學生完成...',
        completed: '已完成',
    };
    placeholder.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:64px;margin-bottom:16px;">🎮</div>
            <h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">${cfg.game_name || slide.title || 'Game'}</h3>
            <p style="color:var(--text-secondary);font-size:14px;">${lifecycleLabels[lifecycle] || lifecycle}</p>
        </div>
    `;
}

/**
 * 渲染其他类型幻灯片 (quiz/poll/quick_answer/raise_hand)
 */
function renderLessonGenericSlide(slide, cfg, lifecycle) {
    const typeLabels = {
        quiz: '測驗', poll: '投票', quick_answer: '搶答', raise_hand: '舉手',
    };
    const typeIcons = {
        quiz: '❓', poll: '📊', quick_answer: '⚡', raise_hand: '✋',
    };
    document.getElementById('canvasArea').style.display = 'none';
    const placeholder = document.getElementById('canvasPlaceholder');
    placeholder.style.display = 'flex';
    placeholder.style.alignItems = 'center';
    placeholder.style.justifyContent = 'center';
    placeholder.style.flexDirection = 'column';
    placeholder.innerHTML = `
        <div style="text-align:center;">
            <div style="font-size:64px;margin-bottom:16px;">${typeIcons[slide.slide_type] || '📄'}</div>
            <h3 style="font-size:18px;font-weight:600;margin-bottom:8px;">
                ${slide.title || typeLabels[slide.slide_type] || slide.slide_type}
            </h3>
            <p style="color:var(--text-secondary);font-size:14px;max-width:300px;">
                ${cfg.question_text || cfg.prompt_text || '使用右側控制按鈕管理此幻燈片'}
            </p>
        </div>
    `;
}

async function promptStartLesson() {
    try {
        const token = AuthModule.getToken();
        const res = await fetch('/api/classroom/lesson-plans', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const json = await res.json();
        const plans = (json.success && json.data) ? json.data : [];
        if (plans.length === 0) {
            UIModule.toast('沒有可用課案，請先在課案編輯器中創建', 'error');
            return;
        }

        // Build a picker dialog
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;z-index:9999;';
        const modal = document.createElement('div');
        modal.style.cssText = 'background:#fff;border-radius:12px;padding:20px;width:400px;max-height:70vh;display:flex;flex-direction:column;box-shadow:0 8px 32px rgba(0,0,0,0.12);';
        modal.innerHTML = '<h3 style="margin:0 0 16px;font-size:16px;">選擇課案</h3>';
        const list = document.createElement('div');
        list.style.cssText = 'flex:1;overflow-y:auto;';
        plans.forEach(p => {
            const item = document.createElement('div');
            item.style.cssText = 'padding:12px;border:1px solid #e0e0e0;border-radius:8px;margin-bottom:8px;cursor:pointer;transition:all 0.15s;';
            item.onmouseover = () => { item.style.borderColor = '#006633'; item.style.background = '#E8F5EC'; };
            item.onmouseout = () => { item.style.borderColor = '#e0e0e0'; item.style.background = ''; };
            const statusLabel = p.status === 'ready' ? ' (就緒)' : p.status === 'draft' ? ' (草稿)' : '';
            const slideCount = p.total_slides || 0;
            item.innerHTML = `<div style="font-weight:600;font-size:14px;">${p.title}${statusLabel}</div><div style="font-size:12px;color:#888;margin-top:4px;">${slideCount} 張幻燈片</div>`;
            item.addEventListener('click', async () => {
                document.body.removeChild(overlay);
                await startLesson(p.plan_id);
            });
            list.appendChild(item);
        });
        modal.appendChild(list);
        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = '取消';
        cancelBtn.style.cssText = 'margin-top:12px;padding:8px 16px;border:1px solid #ccc;border-radius:8px;background:#fff;cursor:pointer;font-size:13px;';
        cancelBtn.addEventListener('click', () => document.body.removeChild(overlay));
        modal.appendChild(cancelBtn);
        overlay.appendChild(modal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) document.body.removeChild(overlay); });
        document.body.appendChild(overlay);
    } catch (e) {
        UIModule.toast('載入課案列表失敗', 'error');
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
                暫無學生連接
            </div>
        `;
        return;
    }

    container.innerHTML = '';
    state.students.forEach((student) => {
        const studentEl = document.createElement('div');
        studentEl.className = 'student-item';
        const initials = (student.name || '學').substring(0, 1).toUpperCase();
        studentEl.innerHTML = `
            <div class="status-indicator"></div>
            <div class="student-avatar">${initials}</div>
            <div class="student-info">
                <div class="student-name">${student.name || '未命名'}</div>
                <div class="student-status">在線</div>
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

            // 更新課室資訊顯示
            if (room.title) {
                document.getElementById('roomId').textContent = room.title;
            }
            if (room.teacher_display_name) {
                document.getElementById('teacherName').textContent = room.teacher_display_name;
            }

            // 加載已有的 PPT 文件
            loadPPTFiles();

            // 加載已有的學生列表
            loadExistingStudents();
        }
    } catch (error) {
        console.error('獲取房間資訊失敗:', error);
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
        console.error('獲取學生列表失敗:', error);
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

        const text = prompt('輸入文字:');
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
