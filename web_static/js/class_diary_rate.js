/**
 * 課室日誌 — 評級表單
 * 需要教師/管理員登入，學生角色無法訪問
 */

/* ============================================================
   可折疊卡片
   ============================================================ */
function toggleCardSection(bodyId) {
    const body = document.getElementById(bodyId);
    const arrowId = bodyId.replace('Body', 'Arrow');
    const arrow = document.getElementById(arrowId);
    if (!body) return;
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? '' : 'none';
    if (arrow) arrow.textContent = isHidden ? '▼' : '▶';
}

/* ============================================================
   全局狀態
   ============================================================ */
const state = {
    classCode: '',
    periodCount: 1,       // 一節或兩節
    disciplineRating: 5,
    cleanlinessRating: 5,
    isSubmitting: false,
    quickMode: true,       // 快速模式（默認開啟）
    lastSubmittedPeriodEnd: null,  // 上次提交的結束節數（用於「繼續下一節」）
};

const LS_KEY_LAST_SESSION = 'cd_last_session';  // localStorage key

// 學生列表（從 API 載入）
let classStudents = [];

// 需要學生選擇器的 textarea 列表（僅考勤用舊模式）
const PICKER_FIELDS = [
    'absentStudents',
    'lateStudents',
];

/* ============================================================
   初始化
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    const loginUrl = '/login?redirect=' + encodeURIComponent(window.location.pathname);

    // ── 身份驗證（含自動續期）──
    // AuthModule.verify() 會在 access token 過期時自動用 refresh token 換新
    // 教師只需登入一次，之後半年內都不用再登入
    const user = await AuthModule.verify();

    if (!user) {
        // 沒有有效登入，跳轉登入頁
        AuthModule.clearAll();
        window.location.replace(loginUrl);
        return;
    }

    const role = user.role || 'student';
    if (role === 'student') {
        // 學生無權訪問
        document.getElementById('noPermission').style.display = 'flex';
        document.getElementById('mainContent').style.display = 'none';
        document.querySelector('.submit-section').style.display = 'none';
        document.querySelector('.page-header').style.display = 'none';
        return;
    }

    // ── 正常初始化（教師/管理員）──
    // 從 URL 取得 class_code（QR 碼掃入的班級）
    const pathParts = window.location.pathname.split('/');
    const urlClass = decodeURIComponent(pathParts[pathParts.length - 1] || '');

    // 設置日期信息
    const today = new Date();
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    const dateStr = `${today.getFullYear()}年${today.getMonth() + 1}月${today.getDate()}日 星期${weekdays[today.getDay()]}`;

    // 載入行為原因代碼（靜默，不阻塞）
    loadReasonCodes();

    // 載入班級列表，並預選 URL 中的班級
    loadClasses(urlClass, dateStr);

    // 班級切換事件
    document.getElementById('classSelect').addEventListener('change', function () {
        state.classCode = this.value;
        updateHeaderInfo(dateStr);
        clearAllPickers();
        loadStudents();
        loadExistingRecords();
        // 更新各欄位班級下拉選單
        populateAllClassSelects();
        Object.values(FIELD_CLASS_SELECTS).forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = '';
        });
        // 重置行為記錄的班級選擇和狀態
        const behaviorClassEl = document.getElementById('behaviorClassSelect');
        if (behaviorClassEl) behaviorClassEl.value = '';
        resetBehaviorState();
    });

    // 各欄位班級切換事件
    Object.entries(FIELD_CLASS_SELECTS).forEach(([fieldId, selectId]) => {
        const el = document.getElementById(selectId);
        if (el) {
            el.addEventListener('change', function () {
                loadFieldStudents(fieldId, this.value || state.classCode);
            });
        }
    });

    // 初始化星級選擇
    initStarRatings();

    // 節數變化時檢查是否有已提交記錄（自動載入編輯模式）
    document.getElementById('periodStart').addEventListener('change', checkAndLoadExisting);
    document.getElementById('periodEnd').addEventListener('change', checkAndLoadExisting);

    // 根據當前時間自動填寫節數
    autoFillPeriod();

    // 初始化行為記錄
    renderReasonChips();
    document.getElementById('behaviorClassSelect')?.addEventListener('change', function () {
        loadBehaviorStudents(this.value || state.classCode);
    });

    // 恢復上次科目偏好和快速模式
    restoreLastSession();
    restoreQuickMode();
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
            allClasses = data.data;
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

    // 初始化各欄位班級選擇器（需要 allClasses + state.classCode 已設定）
    populateAllClassSelects();

    // 載入學生和已有記錄
    if (state.classCode) {
        loadStudents();
        loadExistingRecords();
    }
}

/**
 * 各欄位班級切換 — 支持換班選擇不同班學生
 */
let allClasses = [];  // 所有班級列表（loadClasses 時緩存）

// 各欄位對應的班級選擇器 ID 和獨立學生列表（僅考勤用舊模式）
const FIELD_CLASS_SELECTS = {
    absentStudents:   'absentClassSelect',
    lateStudents:     'lateClassSelect',
};
const fieldStudents = {}; // { fieldId: [student, ...] }

function populateAllClassSelects() {
    if (!state.classCode) return;
    const grade = state.classCode.replace(/[A-Za-z]/g, '');
    const sameGrade = allClasses.filter(c => {
        const g = (c.class_code || '').replace(/[A-Za-z]/g, '');
        return g === grade && c.class_code !== state.classCode;
    });

    Object.values(FIELD_CLASS_SELECTS).forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        select.innerHTML = '<option value="">本班</option>';
        sameGrade.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.class_code;
            opt.textContent = c.class_name || c.class_code;
            select.appendChild(opt);
        });
    });
    // 行為記錄班級選擇器
    const behaviorSelect = document.getElementById('behaviorClassSelect');
    if (behaviorSelect) {
        behaviorSelect.innerHTML = '<option value="">本班</option>';
        sameGrade.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.class_code;
            opt.textContent = c.class_name || c.class_code;
            behaviorSelect.appendChild(opt);
        });
    }
}

async function loadFieldStudents(fieldId, classCode) {
    const targetClass = classCode || state.classCode;
    try {
        const resp = await fetch(`/api/class-diary/students/${encodeURIComponent(targetClass)}`);
        const data = await resp.json();
        if (data.success && data.data) {
            fieldStudents[fieldId] = data.data;
            renderFieldPicker(fieldId);
        }
    } catch (err) {
        console.warn(`載入 ${fieldId} 班級學生失敗:`, err);
    }
}

function renderFieldPicker(fieldId) {
    const picker = document.getElementById('picker-' + fieldId);
    if (!picker) return;

    const students = fieldStudents[fieldId] || [];
    const textarea = document.getElementById(fieldId);
    const selectedNames = parseNames(textarea.value);

    picker.innerHTML = '';
    students.forEach(s => {
        const name = s.display_name;
        const chip = document.createElement('span');
        chip.className = 'student-chip' + (selectedNames.includes(name) ? ' selected' : '');
        chip.textContent = name;
        chip.addEventListener('click', () => toggleStudent(fieldId, name));
        picker.appendChild(chip);
    });
    updateToggleText(fieldId);
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
   節數自動偵測（根據當前時間）
   ============================================================ */
const PERIOD_SCHEDULE = [
    // period 0-9, end time (HH:MM), grace minutes
    { period: 0, end: '08:40', grace: 5  },  // 早會 → 直接接第一節
    { period: 1, end: '09:15', grace: 5  },  // 第一節 → 直接接第二節
    { period: 2, end: '09:50', grace: 10 },  // 第二節 → 小息
    { period: 3, end: '10:40', grace: 5  },  // 第三節 → 直接接第四節
    { period: 4, end: '11:15', grace: 10 },  // 第四節 → 小息
    { period: 5, end: '12:05', grace: 5  },  // 第五節 → 直接接第六節
    { period: 6, end: '12:40', grace: 10 },  // 第六節 → 午飯
    { period: 7, end: '14:15', grace: 5  },  // 第七節 → 直接接第八節
    { period: 8, end: '14:50', grace: 10 },  // 第八節 → 小息
    { period: 9, end: '15:40', grace: 10 },  // 第九節 → 放學
];

/**
 * 根據當前時間偵測剛結束的節數
 * @returns {number|null} 節數 index (0-9) 或 null
 */
function detectCurrentPeriod() {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    let detected = null;
    for (const s of PERIOD_SCHEDULE) {
        const [h, m] = s.end.split(':').map(Number);
        const endMin = h * 60 + m;
        // 在該節結束後 ~ 結束後+grace 分鐘內，視為該節
        if (nowMin >= endMin && nowMin <= endMin + s.grace) {
            detected = s.period;
        }
        // 已經過了 grace 時段，也記錄（取最後一個已結束的）
        else if (nowMin > endMin + s.grace) {
            detected = s.period;
        }
    }
    return detected;
}

/** 自動填寫節數（不鎖定，教師可手動更改） */
function autoFillPeriod() {
    const period = detectCurrentPeriod();
    if (period === null) return;

    const startSelect = document.getElementById('periodStart');

    if (state.periodCount === 1) {
        startSelect.value = period;
    } else {
        // 兩節課：start = period-1, end = period
        const start = Math.max(0, period - 1);
        startSelect.value = start;
        updateEndOptions();
        document.getElementById('periodEnd').value = period;
    }
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

    // 切換節數類型時重新自動填寫
    autoFillPeriod();
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
    // 默認 5 分
    setStarRating('discipline', 5);
    setStarRating('cleanliness', 5);
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
   學生選擇器（折疊式）
   ============================================================ */
async function loadStudents() {
    if (!state.classCode) return;
    try {
        const resp = await fetch(`/api/class-diary/students/${encodeURIComponent(state.classCode)}`);
        const data = await resp.json();
        if (data.success && data.data) {
            classStudents = data.data;
            // 所有欄位默認使用本班學生
            PICKER_FIELDS.forEach(f => { fieldStudents[f] = data.data; });
            renderAllPickers();
            // 行為記錄學生列表
            behaviorState.behaviorStudents = data.data;
            if (behaviorState.selectedReason) renderBehaviorStudents();
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
        renderFieldPicker(fieldId);
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
function showValidationError(fieldId, msg) {
    // 清除之前的錯誤
    clearValidationErrors();
    // 找到目標元素
    const el = document.getElementById(fieldId);
    if (el) {
        el.classList.add('validation-error');
        // 插入錯誤信息
        const msgEl = document.createElement('div');
        msgEl.className = 'validation-msg show';
        msgEl.textContent = msg;
        el.parentElement.appendChild(msgEl);
        // 滾動到欄位
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function clearValidationErrors() {
    document.querySelectorAll('.validation-error').forEach(el => el.classList.remove('validation-error'));
    document.querySelectorAll('.validation-msg').forEach(el => el.remove());
}

async function submitForm() {
    // 超時保護：若 isSubmitting 卡住超過 15 秒，強制重置
    if (state.isSubmitting) {
        if (state._submitStartTime && Date.now() - state._submitStartTime > 15000) {
            state.isSubmitting = false;
            showLoading(false);
            showValidationError('submitBtn', '提交逾時，請重試');
        }
        return;
    }

    clearValidationErrors();

    // 驗證必填
    if (!state.classCode) {
        showValidationError('classSelect', '請選擇班級');
        return;
    }

    const periodStart = document.getElementById('periodStart').value;
    const subject = document.getElementById('subject').value.trim();

    if (!periodStart && periodStart !== '0') {
        showValidationError('periodStart', '請選擇節數');
        return;
    }
    if (!subject) {
        showValidationError('subject', '請選擇科目');
        return;
    }
    if (state.disciplineRating === 0) {
        showValidationError('disciplineStars', '請評選紀律評級');
        return;
    }
    if (state.cleanlinessRating === 0) {
        showValidationError('cleanlinessStars', '請評選整潔評級');
        return;
    }

    // 確定 periodEnd
    let periodEnd;
    if (state.periodCount === 2) {
        periodEnd = parseInt(document.getElementById('periodEnd').value);
        if (isNaN(periodEnd)) {
            showValidationError('periodEnd', '請選擇結束節數');
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
        medical_room_students: document.getElementById('medicalRoomStudents').value.trim(),
    };

    // 客戶端重疊檢查（非編輯模式時）
    if (!state.editingEntryId && state.existingRecords) {
        const newStart = payload.period_start;
        const newEnd = payload.period_end;
        const overlap = state.existingRecords.find(r =>
            r.period_start <= newEnd && r.period_end >= newStart
        );
        if (overlap) {
            const periodLabels = ['早會','第一節','第二節','第三節','第四節','第五節','第六節','第七節','第八節','第九節'];
            const overlapText = overlap.period_start === overlap.period_end
                ? periodLabels[overlap.period_start]
                : `${periodLabels[overlap.period_start]}-${periodLabels[overlap.period_end]}`;
            showValidationError('periodStart', `${overlapText} 已有「${overlap.subject}」的記錄，請選擇其他節數或點擊已提交記錄進行編輯`);
            return;
        }
    }

    state.isSubmitting = true;
    state._submitStartTime = Date.now();
    showLoading(true);

    try {
        const token = AuthModule.getToken();
        const isEditing = !!state.editingEntryId;
        const url = isEditing
            ? `/api/class-diary/entries/${state.editingEntryId}`
            : '/api/class-diary/entries';
        const method = isEditing ? 'PUT' : 'POST';

        const resp = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify(payload),
        });

        const data = await resp.json();

        if (data.success) {
            if (isEditing) {
                cancelEdit();
            }
            // 記住本次提交的班級、科目、結束節數（供「繼續下一節」使用）
            state.lastSubmittedPeriodEnd = periodEnd;
            try {
                localStorage.setItem(LS_KEY_LAST_SESSION, JSON.stringify({
                    class_code: state.classCode,
                    subject: subject,
                    ts: Date.now(),
                }));
            } catch (_) { /* ignore */ }
            showSuccessToast();
            loadExistingRecords();
        } else if (data.error?.code === 'PERIOD_OVERLAP') {
            showValidationError('periodStart', data.error.message || '該時段已有記錄');
        } else if (resp.status === 404 && isEditing) {
            showValidationError('periodStart', '此記錄已不存在，請重新提交');
            cancelEdit();
        } else {
            showValidationError('submitBtn', '提交失敗：' + (data.detail || data.error?.message || '未知錯誤'));
        }
    } catch (err) {
        showValidationError('submitBtn', '網絡錯誤：' + err.message);
    } finally {
        state.isSubmitting = false;
        state._submitStartTime = null;
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

        if (data.success && data.data) {
            state.existingRecords = data.data;
            if (data.data.length > 0) {
                renderExistingRecords(data.data);
            } else {
                document.getElementById('existingRecords').style.display = 'none';
                document.getElementById('recordsList').innerHTML = '';
            }
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
            <div class="record-card" data-entry-id="${r.id}">
                <div class="record-header">
                    <span class="record-period">${periodText}</span>
                    <span class="record-subject">${escapeHtml(r.subject)}</span>
                </div>
                <div class="record-ratings">
                    <span>紀律 ${'★'.repeat(r.discipline_rating)}${'☆'.repeat(5 - r.discipline_rating)}</span>
                    <span>整潔 ${'★'.repeat(r.cleanliness_rating)}${'☆'.repeat(5 - r.cleanliness_rating)}</span>
                </div>
                <div class="record-actions">
                    <button class="btn-record-delete" onclick="deleteRecord(${r.id})">刪除</button>
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

    // 保留班級和科目，自動推進到下一節
    const prevSubject = document.getElementById('subject').value;
    const nextPeriod = (state.lastSubmittedPeriodEnd != null)
        ? state.lastSubmittedPeriodEnd + 1
        : null;

    // 清除考勤和行為
    document.getElementById('absentStudents').value = '';
    document.getElementById('lateStudents').value = '';
    document.getElementById('commendedStudents').value = '';
    document.getElementById('appearanceIssues').value = '';
    document.getElementById('ruleViolations').value = '';
    document.getElementById('medicalRoomStudents').value = '';

    // 重置行為記錄
    resetBehaviorState();

    // 重置評分（默認 5 分）
    setStarRating('discipline', 5);
    setStarRating('cleanliness', 5);

    // 重新渲染學生選擇器（清除選中狀態）並收起面板
    renderAllPickers();
    PICKER_FIELDS.forEach(fieldId => {
        const picker = document.getElementById('picker-' + fieldId);
        if (picker) picker.classList.add('collapsed');
        const wrap = document.getElementById('wrap-' + fieldId);
        if (wrap) wrap.classList.remove('open');
    });

    // 自動帶入下一節
    if (nextPeriod !== null && nextPeriod <= 9) {
        // 確保是單節模式
        setPeriodCount(1);
        document.getElementById('periodStart').value = nextPeriod;
    } else {
        document.getElementById('periodStart').value = '';
        document.getElementById('periodEnd').innerHTML = '<option value="">結束節數</option>';
    }

    // 保留科目
    if (prevSubject) {
        document.getElementById('subject').value = prevSubject;
    }

    // 滾動到頂部
    window.scrollTo({ top: 0, behavior: 'smooth' });
}


/* ============================================================
   快速模式：隱藏考勤 + 行為區塊，只留課堂信息 + 評分
   ============================================================ */
function toggleQuickMode() {
    state.quickMode = !state.quickMode;
    applyQuickModeUI();
    try {
        localStorage.setItem('cd_quick_mode', state.quickMode ? '1' : '0');
    } catch (_) { /* ignore */ }
}

/** 根據 state.quickMode 更新分段控件、提示文字和卡片顯示 */
function applyQuickModeUI() {
    const bg = document.getElementById('modeToggleBg');
    const labelQuick = document.getElementById('modeLabelQuick');
    const labelFull = document.getElementById('modeLabelFull');
    const hint = document.getElementById('quickModeHint');

    // 滑塊位置：快速模式 = 左側，完整模式 = 右側
    if (bg) bg.classList.toggle('right', !state.quickMode);
    if (labelQuick) labelQuick.classList.toggle('active', state.quickMode);
    if (labelFull) labelFull.classList.toggle('active', !state.quickMode);

    if (hint) {
        hint.textContent = state.quickMode
            ? '需要記錄考勤或行為？切換至完整模式'
            : '只需評分？切換至快速模式';
    }
    // 考勤和行為卡片的父元素（第 3、4 張 .card）
    const cards = document.querySelectorAll('#mainContent > .card');
    // cards[0]=課堂信息, cards[1]=評級, cards[2]=考勤, cards[3]=行為
    if (cards[2]) cards[2].style.display = state.quickMode ? 'none' : '';
    if (cards[3]) cards[3].style.display = state.quickMode ? 'none' : '';
}

/** 頁面載入時恢復快速模式偏好（默認開啟） */
function restoreQuickMode() {
    try {
        const saved = localStorage.getItem('cd_quick_mode');
        if (saved === '0') {
            state.quickMode = false;  // 用戶曾手動關閉
        }
        // else: 保持默認 true 或用戶曾手動開啟
    } catch (_) { /* ignore */ }
    // 不管如何都套用一次 UI
    applyQuickModeUI();
}

/** 頁面載入時恢復上次科目 */
function restoreLastSession() {
    try {
        const raw = localStorage.getItem(LS_KEY_LAST_SESSION);
        if (!raw) return;
        const saved = JSON.parse(raw);
        // 只恢復 24 小時內的
        if (Date.now() - saved.ts > 24 * 60 * 60 * 1000) return;
        // 科目自動帶入（若 URL 未預選班級則也帶入班級）
        if (saved.subject) {
            const subjectEl = document.getElementById('subject');
            if (subjectEl && !subjectEl.value) {
                subjectEl.value = saved.subject;
            }
        }
    } catch (_) { /* ignore */ }
}


/* ============================================================
   行為記錄 — Reason-First Flow
   ============================================================ */

// 行為原因（從 API 動態載入，含 code + text）
let BEHAVIOR_REASONS = {
    praise: [{code:'ACTIVE',text:'上課積極'},{code:'ANSWER',text:'勇於回答問題'},{code:'ATTENTIVE',text:'認真聽講'},{code:'HELPFUL',text:'樂於助人'},{code:'OUTSTANDING',text:'表現出色'},{code:'SELF_STUDY',text:'主動學習'}],
    classroom: [{code:'CHAT',text:'聊天'},{code:'INATTENTIVE',text:'不認真'},{code:'HORSEPLAY',text:'嬉戲打鬧'},{code:'DISRUPT',text:'擾亂課堂秩序'},{code:'SLEEP',text:'睡覺'},{code:'PHONE',text:'使用手機'},{code:'IPAD',text:'違規使用iPad'}],
    appearance: [{code:'TIE',text:'領帶不整'},{code:'SHIRT',text:'未將恤衫塞入西褲'},{code:'SHOES',text:'未穿校鞋'},{code:'JACKET',text:'校褸不整'},{code:'HAIR',text:'頭髮過長/染髮'},{code:'UNIFORM',text:'未穿整齊校服'}],
    medical: [{code:'HEADACHE',text:'頭痛'},{code:'STOMACH',text:'肚痛'},{code:'INJURY',text:'受傷'},{code:'UNWELL',text:'身體不適'},{code:'FEVER',text:'發燒'}],
};

// text → code 反查表（初始化時從 BEHAVIOR_REASONS 建立）
let REASON_TEXT_TO_CODE = {};
function _buildReasonLookup() {
    REASON_TEXT_TO_CODE = {};
    for (const reasons of Object.values(BEHAVIOR_REASONS)) {
        for (const r of reasons) {
            REASON_TEXT_TO_CODE[r.text] = r.code;
        }
    }
}
_buildReasonLookup();

// 從 API 載入 reason codes（靜默，失敗則用硬編碼 fallback）
async function loadReasonCodes() {
    try {
        const resp = await fetch('/api/class-diary/reason-codes');
        const data = await resp.json();
        if (data.success && data.data) {
            BEHAVIOR_REASONS = data.data;
            _buildReasonLookup();
        }
    } catch (err) {
        console.warn('載入 reason codes 失敗，使用內建預設:', err);
    }
}

const CATEGORY_FIELD_MAP = {
    praise: 'commendedStudents',
    classroom: 'ruleViolations',
    appearance: 'appearanceIssues',
    medical: 'medicalRoomStudents',
};

const CATEGORY_LABELS = {
    praise: '表揚',
    classroom: '課堂違規',
    appearance: '儀表違規',
    medical: '醫務室',
};

const behaviorState = {
    activeTab: 'praise',
    selectedReason: null,
    assignments: { praise: [], classroom: [], appearance: [], medical: [] },
    behaviorStudents: [],
};

/* ---------- Tab 切換 ---------- */
function switchBehaviorTab(category) {
    behaviorState.activeTab = category;
    behaviorState.selectedReason = null;

    document.querySelectorAll('.behavior-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === category);
    });

    renderReasonChips();
    hideBehaviorStudentPicker();
    updateBehaviorHint();
}

/* ---------- 原因標籤 ---------- */
function renderReasonChips() {
    const container = document.getElementById('reasonChips');
    if (!container) return;
    const category = behaviorState.activeTab;
    const reasons = BEHAVIOR_REASONS[category] || [];

    container.innerHTML = '';
    reasons.forEach(r => {
        const text = typeof r === 'string' ? r : r.text;
        const chip = document.createElement('span');
        chip.className = 'reason-chip';
        chip.dataset.category = category;
        chip.textContent = text;

        const assignment = behaviorState.assignments[category].find(a => a.reason === text);
        if (assignment && assignment.students.length > 0) {
            chip.classList.add('has-students');
        }
        if (behaviorState.selectedReason === text) {
            chip.classList.add('selected-' + category);
        }

        chip.addEventListener('click', () => selectReason(text));
        container.appendChild(chip);
    });
}

/* ---------- 選擇/取消原因 ---------- */
function selectReason(reason) {
    if (behaviorState.selectedReason === reason) {
        cancelReasonSelection();
        return;
    }
    behaviorState.selectedReason = reason;
    renderReasonChips();
    showBehaviorStudentPicker();
    updateBehaviorHint();
}

function cancelReasonSelection() {
    behaviorState.selectedReason = null;
    renderReasonChips();
    hideBehaviorStudentPicker();
    updateBehaviorHint();
}

/* ---------- 學生選擇器 ---------- */
function showBehaviorStudentPicker() {
    const section = document.getElementById('behaviorStudentSection');
    section.classList.remove('collapsed');

    document.getElementById('selectedReasonText').textContent = behaviorState.selectedReason;

    // 設置 bar 顏色
    const bar = document.getElementById('selectedReasonBar');
    bar.className = 'selected-reason-bar bar-' + behaviorState.activeTab;

    renderBehaviorStudents();
}

function hideBehaviorStudentPicker() {
    const section = document.getElementById('behaviorStudentSection');
    section.classList.add('collapsed');
}

function renderBehaviorStudents() {
    const picker = document.getElementById('behaviorStudentPicker');
    if (!picker) return;
    const category = behaviorState.activeTab;
    const reason = behaviorState.selectedReason;
    if (!reason) return;

    const students = behaviorState.behaviorStudents.length > 0
        ? behaviorState.behaviorStudents
        : classStudents;

    const assignment = behaviorState.assignments[category].find(a => a.reason === reason);
    const selectedNames = assignment ? assignment.students : [];

    picker.innerHTML = '';
    students.forEach(s => {
        const name = s.display_name;
        const chip = document.createElement('span');
        chip.className = 'student-chip' + (selectedNames.includes(name) ? ' selected-' + category : '');
        chip.textContent = name;
        chip.addEventListener('click', () => toggleBehaviorStudent(category, reason, name));
        picker.appendChild(chip);
    });
}

/* ---------- 切換學生 ---------- */
function toggleBehaviorStudent(category, reason, studentName) {
    let assignment = behaviorState.assignments[category].find(a => a.reason === reason);

    if (!assignment) {
        assignment = { reason, reason_code: REASON_TEXT_TO_CODE[reason] || '', students: [] };
        behaviorState.assignments[category].push(assignment);
    }

    const idx = assignment.students.indexOf(studentName);
    if (idx >= 0) {
        assignment.students.splice(idx, 1);
    } else {
        // 防重複
        if (!assignment.students.includes(studentName)) {
            assignment.students.push(studentName);
        }
    }

    // 移除空記錄
    if (assignment.students.length === 0) {
        const aIdx = behaviorState.assignments[category].indexOf(assignment);
        behaviorState.assignments[category].splice(aIdx, 1);
    }

    renderBehaviorStudents();
    renderReasonChips();
    updateBehaviorSummary();
    updateBehaviorBadges();
    serializeBehaviorToTextareas();
}

/* ---------- 引導提示 ---------- */
function updateBehaviorHint() {
    const hint = document.getElementById('behaviorHint');
    if (!hint) return;
    const category = behaviorState.activeTab;

    hint.classList.remove('active-praise', 'active-classroom', 'active-appearance', 'active-medical');

    if (behaviorState.selectedReason) {
        hint.classList.add('active-' + category);
        hint.querySelector('.hint-icon').textContent = '→';
        hint.querySelector('.hint-text').textContent =
            `已選原因「${behaviorState.selectedReason}」，請點選相關學生`;
    } else {
        hint.querySelector('.hint-icon').textContent = '→';
        hint.querySelector('.hint-text').textContent = '請先選擇原因，再點選學生姓名';
    }
}

/* ---------- Tab 徽章 ---------- */
function updateBehaviorBadges() {
    ['praise', 'classroom', 'appearance', 'medical'].forEach(cat => {
        const total = behaviorState.assignments[cat].reduce((sum, a) => sum + a.students.length, 0);
        const badge = document.getElementById('badge-' + cat);
        if (!badge) return;
        if (total > 0) {
            badge.textContent = total;
            badge.style.display = '';
        } else {
            badge.style.display = 'none';
        }
    });
}

/* ---------- 摘要區 ---------- */
function updateBehaviorSummary() {
    const container = document.getElementById('behaviorSummary');
    if (!container) return;

    const allEmpty = ['praise', 'classroom', 'appearance', 'medical']
        .every(cat => behaviorState.assignments[cat].length === 0);

    if (allEmpty) {
        container.style.display = 'none';
        return;
    }

    container.style.display = '';
    let html = '';

    ['praise', 'classroom', 'appearance', 'medical'].forEach(cat => {
        const assignments = behaviorState.assignments[cat];
        if (assignments.length === 0) return;

        html += `<div class="summary-category-label ${cat}">${CATEGORY_LABELS[cat]}:</div>`;
        assignments.forEach(a => {
            const studentTags = a.students.map(s =>
                `<span class="summary-student-tag">${escapeHtmlBehavior(s)}<span class="summary-remove" onclick="removeBehaviorStudent('${cat}','${escapeAttr(a.reason)}','${escapeAttr(s)}')">&times;</span></span>`
            ).join('');

            html += `<div class="summary-item">
                <span class="summary-reason" onclick="jumpToReason('${cat}','${escapeAttr(a.reason)}')">${escapeHtmlBehavior(a.reason)}:</span>
                <span class="summary-students">${studentTags}</span>
                <span class="summary-delete-reason" onclick="removeBehaviorReason('${cat}','${escapeAttr(a.reason)}')">[刪除]</span>
            </div>`;
        });
    });

    container.innerHTML = html;
}

/* ---------- 摘要操作 ---------- */
function removeBehaviorStudent(cat, reason, student) {
    const assignment = behaviorState.assignments[cat].find(a => a.reason === reason);
    if (!assignment) return;

    const idx = assignment.students.indexOf(student);
    if (idx >= 0) assignment.students.splice(idx, 1);

    if (assignment.students.length === 0) {
        const aIdx = behaviorState.assignments[cat].indexOf(assignment);
        behaviorState.assignments[cat].splice(aIdx, 1);
    }

    renderReasonChips();
    if (behaviorState.selectedReason === reason && behaviorState.activeTab === cat) {
        renderBehaviorStudents();
    }
    updateBehaviorSummary();
    updateBehaviorBadges();
    serializeBehaviorToTextareas();
}

function removeBehaviorReason(cat, reason) {
    behaviorState.assignments[cat] = behaviorState.assignments[cat].filter(a => a.reason !== reason);

    renderReasonChips();
    if (behaviorState.selectedReason === reason && behaviorState.activeTab === cat) {
        cancelReasonSelection();
    }
    updateBehaviorSummary();
    updateBehaviorBadges();
    serializeBehaviorToTextareas();
}

function jumpToReason(cat, reason) {
    switchBehaviorTab(cat);
    selectReason(reason);
}

/* ---------- 序列化 ---------- */
function serializeBehaviorToTextareas() {
    ['praise', 'classroom', 'appearance', 'medical'].forEach(cat => {
        const fieldId = CATEGORY_FIELD_MAP[cat];
        const textarea = document.getElementById(fieldId);
        if (!textarea) return;

        const data = behaviorState.assignments[cat]
            .filter(a => a.students.length > 0)
            .map(a => ({
                reason_code: a.reason_code || REASON_TEXT_TO_CODE[a.reason] || '',
                reason_text: a.reason,
                students: a.students,
            }));
        textarea.value = data.length === 0 ? '' : JSON.stringify(data);
    });
}

/* ---------- 跨班學生載入 ---------- */
async function loadBehaviorStudents(classCode) {
    try {
        const resp = await fetch(`/api/class-diary/students/${encodeURIComponent(classCode)}`);
        const data = await resp.json();
        if (data.success && data.data) {
            behaviorState.behaviorStudents = data.data;
            if (behaviorState.selectedReason) renderBehaviorStudents();
        }
    } catch (err) {
        console.warn('載入行為學生列表失敗:', err);
    }
}

/* ---------- 重置 ---------- */
function resetBehaviorState() {
    behaviorState.selectedReason = null;
    behaviorState.assignments = { praise: [], classroom: [], appearance: [], medical: [] };
    behaviorState.activeTab = 'praise';

    document.querySelectorAll('.behavior-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.category === 'praise');
    });

    renderReasonChips();
    hideBehaviorStudentPicker();
    updateBehaviorHint();
    updateBehaviorSummary();
    updateBehaviorBadges();
    serializeBehaviorToTextareas();
}

/* ---------- 工具函數 ---------- */
function escapeHtmlBehavior(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}


/* ============================================================
   記錄編輯與刪除
   ============================================================ */

/**
 * 檢查當前選擇的節數是否有已提交記錄，若有則自動載入進編輯模式
 */
function checkAndLoadExisting() {
    if (!state.existingRecords || state.existingRecords.length === 0) return;

    const startVal = document.getElementById('periodStart').value;
    if (startVal === '' && startVal !== '0') return;

    const newStart = parseInt(startVal);
    let newEnd;
    if (state.periodCount === 2) {
        const endVal = document.getElementById('periodEnd').value;
        if (endVal === '') return;
        newEnd = parseInt(endVal);
    } else {
        newEnd = newStart;
    }

    // 查找完全匹配的記錄（相同 period_start 和 period_end）
    const match = state.existingRecords.find(r =>
        r.period_start === newStart && r.period_end === newEnd
    );

    if (match) {
        editRecord(match);
    } else if (state.editingEntryId) {
        // 選擇了不同的節數，退出編輯模式
        cancelEdit();
    }
}

/**
 * 進入編輯模式：將已提交記錄回填到表單
 */
function editRecord(record) {
    state.editingEntryId = record.id;

    // 回填科目
    document.getElementById('subject').value = record.subject || '';

    // 回填考勤
    document.getElementById('absentStudents').value = record.absent_students || '';
    document.getElementById('lateStudents').value = record.late_students || '';
    PICKER_FIELDS.forEach(fieldId => {
        renderFieldPicker(fieldId);
        updateToggleText(fieldId);
    });

    // 回填評級
    setStarRating('discipline', record.discipline_rating || 0);
    setStarRating('cleanliness', record.cleanliness_rating || 0);

    // 回填行為記錄
    restoreBehaviorFromRecord(record);

    // 更新提交按鈕文字
    document.getElementById('submitBtn').textContent = '更新記錄';

    // 顯示編輯模式提示
    const periodLabels = ['早會','第一節','第二節','第三節','第四節','第五節','第六節','第七節','第八節','第九節'];
    const periodText = record.period_start === record.period_end
        ? periodLabels[record.period_start]
        : `${periodLabels[record.period_start]}-${periodLabels[record.period_end]}`;
    const bar = document.getElementById('editModeBar');
    document.getElementById('editModeText').textContent = `正在編輯 ${periodText} - ${record.subject}`;
    bar.classList.add('show');
}

/**
 * 取消編輯模式：完全清除所有編輯狀態
 */
function cancelEdit() {
    state.editingEntryId = null;

    // 重置表單
    document.getElementById('subject').value = '';
    document.getElementById('absentStudents').value = '';
    document.getElementById('lateStudents').value = '';

    // 重置學生選擇器
    PICKER_FIELDS.forEach(fieldId => {
        renderFieldPicker(fieldId);
        updateToggleText(fieldId);
    });

    // 重置評分（默認 5 分）
    setStarRating('discipline', 5);
    setStarRating('cleanliness', 5);

    // 重置行為記錄
    resetBehaviorState();

    // 重置提交按鈕
    document.getElementById('submitBtn').textContent = '提交評級';

    // 隱藏編輯模式提示
    document.getElementById('editModeBar').classList.remove('show');

    // 清除驗證錯誤
    clearValidationErrors();
}

/**
 * 從已提交記錄恢復行為記錄狀態
 */
function restoreBehaviorFromRecord(record) {
    // 先重置
    resetBehaviorState();

    // 嘗試從各個行為欄位解析 JSON
    const fieldMapping = {
        commended_students: 'praise',
        rule_violations: 'classroom',
        appearance_issues: 'appearance',
        medical_room_students: 'medical',
    };

    Object.entries(fieldMapping).forEach(([field, category]) => {
        const value = record[field];
        if (!value) return;

        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
                behaviorState.assignments[category] = parsed.map(item => ({
                    reason: item.reason_text || item.reason || '',
                    reason_code: item.reason_code || REASON_TEXT_TO_CODE[item.reason_text || item.reason || ''] || '',
                    students: Array.isArray(item.students) ? [...item.students] : [],
                })).filter(item => item.reason && item.students.length > 0);
            }
        } catch {
            // 非 JSON 格式（舊格式純文字），直接設入 textarea
            const textarea = document.getElementById(CATEGORY_FIELD_MAP[category]);
            if (textarea) textarea.value = value;
        }
    });

    // 刷新所有行為 UI
    renderReasonChips();
    updateBehaviorSummary();
    updateBehaviorBadges();
    serializeBehaviorToTextareas();
}

/**
 * 刪除記錄
 */
async function deleteRecord(entryId) {
    if (!confirm('確定要刪除此記錄嗎？此操作無法撤銷。')) return;

    try {
        const token = AuthModule.getToken();
        const resp = await fetch(`/api/class-diary/entries/${entryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const data = await resp.json();
        if (data.success) {
            // 若正在編輯被刪除的記錄，退出編輯模式
            if (state.editingEntryId === entryId) {
                cancelEdit();
            }
            loadExistingRecords();
        } else {
            alert('刪除失敗：' + (data.error?.message || data.detail || '未知錯誤'));
        }
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
}
