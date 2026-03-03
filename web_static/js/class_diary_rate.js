/**
 * 課室日誌 — 移動端評級表單
 * 獨立頁面，無需登入，教師掃碼後填寫
 */

/* ============================================================
   全局狀態
   ============================================================ */
const state = {
    classCode: '',
    periodCount: 1,       // 一節或兩節
    disciplineRating: 0,
    cleanlinessRating: 0,
    signatureData: '',    // base64
    isSubmitting: false,
};

// 學生列表（從 API 載入）
let classStudents = [];

// 需要學生選擇器的 textarea 列表
const PICKER_FIELDS = [
    'absentStudents',
    'lateStudents',
    'commendedStudents',
    'appearanceIssues',
    'ruleViolations',
];

/* ============================================================
   初始化
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
    // 從 URL 取得 class_code（QR 碼掃入的班級）
    const pathParts = window.location.pathname.split('/');
    const urlClass = decodeURIComponent(pathParts[pathParts.length - 1] || '');

    // 設置日期信息
    const today = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekdays[today.getDay()]}`;

    // 載入班級列表，並預選 URL 中的班級
    loadClasses(urlClass, dateStr);

    // 班級切換事件
    document.getElementById('classSelect').addEventListener('change', function () {
        state.classCode = this.value;
        updateHeaderInfo(dateStr);
        clearAllPickers();
        loadStudents();
        loadExistingRecords();
    });

    // 初始化星級選擇
    initStarRatings();

    // 初始化簽名板
    initSignaturePad();

    // 移動裝置檢測（寬度 > 1024 認為是桌面）
    checkDevice();
    window.addEventListener('resize', checkDevice);
});


/* ============================================================
   班級選擇
   ============================================================ */
async function loadClasses(urlClass, dateStr) {
    const select = document.getElementById('classSelect');
    try {
        const resp = await fetch('/api/class-diary/classes');
        const data = await resp.json();
        if (data.success && data.data) {
            data.data.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.class_code;
                opt.textContent = c.class_name || c.class_code;
                select.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('載入班級列表失敗:', err);
    }

    // 預選 URL 中的班級（QR 碼掃入）
    if (urlClass && select.querySelector(`option[value="${CSS.escape(urlClass)}"]`)) {
        select.value = urlClass;
    } else if (urlClass) {
        // URL 中的班級不在列表中，手動添加
        const opt = document.createElement('option');
        opt.value = urlClass;
        opt.textContent = urlClass;
        select.appendChild(opt);
        select.value = urlClass;
    }

    state.classCode = select.value;
    updateHeaderInfo(dateStr);

    // 載入學生和已有記錄
    if (state.classCode) {
        loadStudents();
        loadExistingRecords();
    }
}

function updateHeaderInfo(dateStr) {
    const header = document.getElementById('headerInfo');
    if (state.classCode) {
        header.textContent = `${state.classCode} 班 ─ ${dateStr}`;
    } else {
        header.textContent = dateStr;
    }
}

function clearAllPickers() {
    classStudents = [];
    PICKER_FIELDS.forEach(fieldId => {
        const picker = document.getElementById('picker-' + fieldId);
        if (picker) {
            picker.innerHTML = '';
            picker.classList.add('collapsed');
        }
        const wrap = document.getElementById('wrap-' + fieldId);
        if (wrap) wrap.classList.remove('open');
        updateToggleText(fieldId);
    });
}


/* ============================================================
   裝置檢測
   ============================================================ */
function checkDevice() {
    const isDesktop = window.innerWidth > 1024 &&
        !(/Android|iPhone|iPad|iPod|Mobile|webOS/i.test(navigator.userAgent));
    document.getElementById('desktopBlock').style.display = isDesktop ? 'flex' : 'none';
}


/* ============================================================
   節數選擇
   ============================================================ */
function setPeriodCount(count) {
    state.periodCount = count;

    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.count) === count);
    });

    const sep = document.getElementById('periodSeparator');
    const endSelect = document.getElementById('periodEnd');

    if (count === 2) {
        sep.style.display = '';
        endSelect.style.display = '';
        updateEndOptions();
    } else {
        sep.style.display = 'none';
        endSelect.style.display = 'none';
    }
}

// 當 periodStart 改變時更新 periodEnd 的選項
document.getElementById('periodStart').addEventListener('change', () => {
    if (state.periodCount === 2) {
        updateEndOptions();
    }
});

function updateEndOptions() {
    const start = parseInt(document.getElementById('periodStart').value);
    const endSelect = document.getElementById('periodEnd');
    endSelect.innerHTML = '<option value="">結束節數</option>';

    if (isNaN(start)) return;

    const labels = ['早會', '第一節', '第二節', '第三節', '第四節', '第五節', '第六節', '第七節', '第八節', '第九節'];
    // 結束節可以是 start 或 start+1（兩節連堂）
    for (let i = start; i <= Math.min(start + 1, 9); i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = labels[i];
        endSelect.appendChild(opt);
    }

    // 默認選最後
    endSelect.value = Math.min(start + 1, 9);
}


/* ============================================================
   星級評分
   ============================================================ */
function initStarRatings() {
    document.querySelectorAll('.stars').forEach(container => {
        const field = container.dataset.field;
        container.querySelectorAll('.star').forEach(star => {
            star.addEventListener('click', () => {
                const value = parseInt(star.dataset.value);
                setStarRating(field, value);
            });
        });
    });
}

function setStarRating(field, value) {
    const containerId = field === 'discipline' ? 'disciplineStars' : 'cleanlinessStars';
    const valueId = field === 'discipline' ? 'disciplineValue' : 'cleanlinessValue';

    if (field === 'discipline') state.disciplineRating = value;
    else state.cleanlinessRating = value;

    const labels = ['', '1 - 很差', '2 - 較差', '3 - 一般', '4 - 良好', '5 - 優秀'];
    document.getElementById(valueId).textContent = labels[value];

    document.getElementById(containerId).querySelectorAll('.star').forEach(star => {
        const v = parseInt(star.dataset.value);
        star.classList.toggle('filled', v <= value);
    });
}


/* ============================================================
   簽名板
   ============================================================ */
let signatureCanvas, signatureCtx;
let isDrawing = false;
let hasSignature = false;

function initSignaturePad() {
    signatureCanvas = document.getElementById('signatureCanvas');
    signatureCtx = signatureCanvas.getContext('2d');

    // 設定 Canvas 實際尺寸
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // 觸摸事件
    signatureCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
    signatureCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
    signatureCanvas.addEventListener('touchend', onTouchEnd);

    // 滑鼠事件（平板可能用觸控筆）
    signatureCanvas.addEventListener('mousedown', onMouseDown);
    signatureCanvas.addEventListener('mousemove', onMouseMove);
    signatureCanvas.addEventListener('mouseup', onMouseUp);
    signatureCanvas.addEventListener('mouseleave', onMouseUp);
}

function resizeCanvas() {
    const wrap = document.getElementById('signatureWrap');
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    signatureCanvas.width = rect.width * dpr;
    signatureCanvas.height = 150 * dpr;
    signatureCanvas.style.height = '150px';

    signatureCtx.scale(dpr, dpr);
    signatureCtx.strokeStyle = '#1F2937';
    signatureCtx.lineWidth = 2.5;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
}

function getCanvasPos(e) {
    const rect = signatureCanvas.getBoundingClientRect();
    const touch = e.touches ? e.touches[0] : e;
    return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
    };
}

function onTouchStart(e) {
    e.preventDefault();
    isDrawing = true;
    hasSignature = true;
    document.getElementById('sigPlaceholder').classList.add('hidden');
    document.getElementById('signatureWrap').classList.add('signing');
    const pos = getCanvasPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
}

function onTouchMove(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
}

function onTouchEnd() {
    isDrawing = false;
    document.getElementById('signatureWrap').classList.remove('signing');
    state.signatureData = signatureCanvas.toDataURL('image/png');
}

function onMouseDown(e) {
    isDrawing = true;
    hasSignature = true;
    document.getElementById('sigPlaceholder').classList.add('hidden');
    document.getElementById('signatureWrap').classList.add('signing');
    const pos = getCanvasPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(pos.x, pos.y);
}

function onMouseMove(e) {
    if (!isDrawing) return;
    const pos = getCanvasPos(e);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
}

function onMouseUp() {
    if (!isDrawing) return;
    isDrawing = false;
    document.getElementById('signatureWrap').classList.remove('signing');
    state.signatureData = signatureCanvas.toDataURL('image/png');
}

function clearSignature() {
    const dpr = window.devicePixelRatio || 1;
    signatureCtx.clearRect(0, 0, signatureCanvas.width / dpr, signatureCanvas.height / dpr);
    hasSignature = false;
    state.signatureData = '';
    document.getElementById('sigPlaceholder').classList.remove('hidden');
}


/* ============================================================
   學生選擇器（折疊式）
   ============================================================ */
async function loadStudents() {
    if (!state.classCode) return;
    try {
        const resp = await fetch(`/api/class-diary/students/${encodeURIComponent(state.classCode)}`);
        const data = await resp.json();
        if (data.success && data.data) {
            classStudents = data.data;
            renderAllPickers();
        }
    } catch (err) {
        console.warn('載入學生列表失敗:', err);
    }
}

/**
 * 渲染所有學生選擇器
 */
function renderAllPickers() {
    PICKER_FIELDS.forEach(fieldId => {
        renderPicker('picker-' + fieldId, fieldId);
        updateToggleText(fieldId);
    });
}

/**
 * 渲染單個學生選擇器
 */
function renderPicker(pickerId, textareaId) {
    const picker = document.getElementById(pickerId);
    if (!picker || classStudents.length === 0) return;

    const textarea = document.getElementById(textareaId);
    const selectedNames = parseNames(textarea.value);

    picker.innerHTML = '';
    classStudents.forEach(s => {
        const name = s.display_name;
        const chip = document.createElement('span');
        chip.className = 'student-chip' + (selectedNames.includes(name) ? ' selected' : '');
        chip.textContent = name;
        chip.addEventListener('click', () => toggleStudent(textareaId, name));
        picker.appendChild(chip);
    });
}

/**
 * 展開/收起學生選擇器
 */
function togglePicker(fieldId) {
    const wrap = document.getElementById('wrap-' + fieldId);
    const picker = document.getElementById('picker-' + fieldId);
    if (!wrap || !picker) return;

    const isOpen = wrap.classList.contains('open');
    if (isOpen) {
        wrap.classList.remove('open');
        picker.classList.add('collapsed');
    } else {
        wrap.classList.add('open');
        picker.classList.remove('collapsed');
    }
}

/**
 * 更新折疊按鈕文字（顯示已選數量）
 */
function updateToggleText(fieldId) {
    const wrap = document.getElementById('wrap-' + fieldId);
    if (!wrap) return;

    const textarea = document.getElementById(fieldId);
    const selectedNames = parseNames(textarea.value);
    const count = selectedNames.length;
    const textEl = wrap.querySelector('.picker-toggle-text');

    if (count > 0) {
        textEl.innerHTML = `已選 <span class="picker-badge">${count}</span> 位學生`;
    } else {
        textEl.textContent = classStudents.length > 0
            ? `從 ${classStudents.length} 位學生中選擇`
            : '點擊選擇學生';
    }
}

/**
 * 切換學生選中狀態
 */
function toggleStudent(textareaId, name) {
    const textarea = document.getElementById(textareaId);
    const names = parseNames(textarea.value);
    const idx = names.indexOf(name);

    if (idx >= 0) {
        names.splice(idx, 1);
    } else {
        names.push(name);
    }

    textarea.value = names.join('、');
    renderPicker('picker-' + textareaId, textareaId);
    updateToggleText(textareaId);
}

/**
 * 解析 textarea 中的學生姓名列表
 * 支持頓號、逗號、分號等分隔符
 */
function parseNames(text) {
    if (!text || !text.trim()) return [];
    return text.split(/[、，,；;／/\n]+/)
               .map(n => n.trim())
               .filter(n => n.length > 0);
}

/**
 * HTML 轉義（防止 XSS）
 */
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}


/* ============================================================
   表單提交
   ============================================================ */
async function submitForm() {
    if (state.isSubmitting) return;

    // 驗證必填
    if (!state.classCode) {
        alert('請選擇班級');
        return;
    }

    const periodStart = document.getElementById('periodStart').value;
    const subject = document.getElementById('subject').value.trim();

    if (!periodStart && periodStart !== '0') {
        alert('請選擇節數');
        return;
    }
    if (!subject) {
        alert('請輸入科目名稱');
        return;
    }
    if (state.disciplineRating === 0) {
        alert('請評選紀律評級');
        return;
    }
    if (state.cleanlinessRating === 0) {
        alert('請評選整潔評級');
        return;
    }
    if (!state.signatureData) {
        alert('請手寫簽名');
        return;
    }

    // 確定 periodEnd
    let periodEnd;
    if (state.periodCount === 2) {
        periodEnd = parseInt(document.getElementById('periodEnd').value);
        if (isNaN(periodEnd)) {
            alert('請選擇結束節數');
            return;
        }
    } else {
        periodEnd = parseInt(periodStart);
    }

    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const payload = {
        class_code: state.classCode,
        entry_date: dateStr,
        period_start: parseInt(periodStart),
        period_end: periodEnd,
        subject: subject,
        absent_students: document.getElementById('absentStudents').value.trim(),
        late_students: document.getElementById('lateStudents').value.trim(),
        discipline_rating: state.disciplineRating,
        cleanliness_rating: state.cleanlinessRating,
        commended_students: document.getElementById('commendedStudents').value.trim(),
        appearance_issues: document.getElementById('appearanceIssues').value.trim(),
        rule_violations: document.getElementById('ruleViolations').value.trim(),
        signature: state.signatureData,
    };

    state.isSubmitting = true;
    showLoading(true);

    try {
        const resp = await fetch('/api/class-diary/entries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        const data = await resp.json();

        if (data.success) {
            showSuccessToast();
            loadExistingRecords();
        } else {
            alert('提交失敗：' + (data.detail || data.error?.message || '未知錯誤'));
        }
    } catch (err) {
        alert('網絡錯誤：' + err.message);
    } finally {
        state.isSubmitting = false;
        showLoading(false);
    }
}


/* ============================================================
   已提交記錄
   ============================================================ */
async function loadExistingRecords() {
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    try {
        const resp = await fetch(`/api/class-diary/entries/by-class?class_code=${encodeURIComponent(state.classCode)}&entry_date=${dateStr}`);
        const data = await resp.json();

        if (data.success && data.data && data.data.length > 0) {
            renderExistingRecords(data.data);
        }
    } catch (err) {
        console.error('載入記錄失敗:', err);
    }
}

function renderExistingRecords(records) {
    const container = document.getElementById('existingRecords');
    const list = document.getElementById('recordsList');
    container.style.display = '';

    const periodLabels = ['早會', '第一節', '第二節', '第三節', '第四節', '第五節', '第六節', '第七節', '第八節', '第九節'];

    list.innerHTML = records.map(r => {
        const periodText = r.period_start === r.period_end
            ? periodLabels[r.period_start]
            : `${periodLabels[r.period_start]} → ${periodLabels[r.period_end]}`;

        return `
            <div class="record-card">
                <div class="record-header">
                    <span class="record-period">${periodText}</span>
                    <span class="record-subject">${r.subject}</span>
                </div>
                <div class="record-ratings">
                    <span>📏 紀律 ${'★'.repeat(r.discipline_rating)}${'☆'.repeat(5 - r.discipline_rating)}</span>
                    <span>🧹 整潔 ${'★'.repeat(r.cleanliness_rating)}${'☆'.repeat(5 - r.cleanliness_rating)}</span>
                </div>
                <div style="margin-top:0.4rem;">
                    <span class="record-badge">✅ 已提交</span>
                </div>
            </div>
        `;
    }).join('');
}


/* ============================================================
   UI 工具
   ============================================================ */
function showLoading(show) {
    document.getElementById('loadingOverlay').classList.toggle('show', show);
    document.getElementById('submitBtn').disabled = show;
}

function showSuccessToast() {
    document.getElementById('successToast').classList.add('show');
}

function closeToast() {
    document.getElementById('successToast').classList.remove('show');
}

function continueRating() {
    closeToast();

    // 清除表單（保留班級信息）
    document.getElementById('periodStart').value = '';
    document.getElementById('periodEnd').innerHTML = '<option value="">結束節數</option>';
    document.getElementById('subject').value = '';
    document.getElementById('absentStudents').value = '';
    document.getElementById('lateStudents').value = '';
    document.getElementById('commendedStudents').value = '';
    document.getElementById('appearanceIssues').value = '';
    document.getElementById('ruleViolations').value = '';

    // 重置評分
    setStarRating('discipline', 0);
    setStarRating('cleanliness', 0);
    document.getElementById('disciplineValue').textContent = '未評分';
    document.getElementById('cleanlinessValue').textContent = '未評分';
    document.querySelectorAll('.star').forEach(s => s.classList.remove('filled'));

    // 清除簽名
    clearSignature();

    // 重新渲染學生選擇器（清除選中狀態）並收起面板
    renderAllPickers();
    PICKER_FIELDS.forEach(fieldId => {
        const picker = document.getElementById('picker-' + fieldId);
        if (picker) picker.classList.add('collapsed');
        const wrap = document.getElementById('wrap-' + fieldId);
        if (wrap) wrap.classList.remove('open');
    });

    // 滾動到頂部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
