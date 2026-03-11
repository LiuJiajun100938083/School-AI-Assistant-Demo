/**
 * 課室日誌 — Review 頁面
 * 需登入 + review 權限
 */

/* ============================================================
   狀態
   ============================================================ */
const reviewState = {
    currentDate: '',
    currentClass: '',
    entries: [],
    hasAccess: false,
    isRecipient: false,
    isReviewer: false,
    userRole: '',
    username: '',
    // 權限 tier
    dateMode: 'single',         // 'single' | 'range'
    rangeStart: '',
    rangeEnd: '',
    permissionTier: 'none',     // admin|reviewer|class_teacher|report_recipient|none
    ownClasses: [],
    canViewRawData: false,
    canExport: false,
    canViewAiReport: false,
    canViewCharts: false,
    charts: {},                 // Chart.js 實例
};

/** 儀表板全量 entries（供彈窗使用） */
let dashboardEntries = [];

/* ============================================================
   初始化
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // 設置今天日期
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    document.getElementById('filterDate').value = dateStr;
    reviewState.currentDate = dateStr;

    // 設置範圍默認值
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    document.getElementById('rangeStart').value = weekAgo.toISOString().split('T')[0];
    document.getElementById('rangeEnd').value = dateStr;

    // 檢查權限
    const hasAccess = await checkAccess(token);
    if (!hasAccess) {
        document.getElementById('noAccess').style.display = '';
        document.getElementById('mainContainer').style.display = 'none';
        return;
    }

    reviewState.hasAccess = true;
    document.getElementById('mainContainer').style.display = '';

    // 顯示用戶信息
    try {
        const profile = await APIClient.get('/api/profile');
        if (profile && profile.data) {
            reviewState.userRole = profile.data.role || '';
            reviewState.username = profile.data.username || '';
            document.getElementById('userBadge').textContent =
                `${profile.data.display_name || profile.data.username} (${profile.data.role})`;
        }
    } catch (e) { /* 忽略 */ }

    // 綁定篩選事件
    document.getElementById('filterDate').addEventListener('change', onFilterChange);
    document.getElementById('filterClass').addEventListener('change', onFilterChange);

    // 應用權限可見性
    applyPermissionVisibility();

    // 載入數據
    await loadDailyReport();
    await loadSummary();
});


/* ============================================================
   權限檢查（返回 tier 資訊）
   ============================================================ */
async function checkAccess(token) {
    try {
        const resp = await fetch('/api/class-diary/review/check-access', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await resp.json();
        if (!data.success || !data.data || !data.data.has_access) return false;

        const d = data.data;
        Object.assign(reviewState, {
            permissionTier: d.tier,
            ownClasses: d.own_classes || [],
            canViewRawData: d.can_view_raw_data,
            canExport: d.can_export,
            canViewAiReport: d.can_view_ai_report,
            canViewCharts: d.can_view_charts,
            isReviewer: d.tier === 'admin' || d.tier === 'reviewer',
            isRecipient: d.can_view_ai_report,
        });
        return true;
    } catch (e) {
        return false;
    }
}


/* ============================================================
   權限可見性控制
   ============================================================ */
function applyPermissionVisibility() {
    const tier = reviewState.permissionTier;

    // 匯出按鈕
    const exportDropdown = document.getElementById('exportDropdown');
    if (exportDropdown) {
        exportDropdown.style.display = reviewState.canExport ? '' : 'none';
    }

    // 班主任：班級下拉只顯示自己的班
    if (tier === 'class_teacher' && reviewState.ownClasses.length > 0) {
        const select = document.getElementById('filterClass');
        select.innerHTML = '';
        if (reviewState.ownClasses.length > 1) {
            select.innerHTML = '<option value="">全部班級</option>';
        }
        reviewState.ownClasses.forEach(cc => {
            const opt = document.createElement('option');
            opt.value = cc;
            opt.textContent = cc;
            select.appendChild(opt);
        });
        if (reviewState.ownClasses.length === 1) {
            select.value = reviewState.ownClasses[0];
        }
    }

    // report_recipient：隱藏不需要的區塊
    if (tier === 'report_recipient') {
        const hide = ['summaryGrid', 'entriesSection', 'dashClassChart', 'dashBehavior'];
        hide.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
    }
}


/* ============================================================
   日期模式切換
   ============================================================ */
function setDateMode(mode) {
    reviewState.dateMode = mode;

    // 切換按鈕激活狀態
    document.querySelectorAll('.mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    const singleGroup = document.getElementById('dateSingleGroup');
    const rangeGroup = document.getElementById('dateRangeGroup');
    const singleView = document.getElementById('singleDayView');
    const rangeView = document.getElementById('rangeView');

    if (mode === 'single') {
        singleGroup.style.display = '';
        rangeGroup.style.display = 'none';
        singleView.style.display = '';
        rangeView.style.display = 'none';
        cleanupRangeState();
        onFilterChange();
    } else {
        singleGroup.style.display = 'none';
        rangeGroup.style.display = '';
        singleView.style.display = 'none';
        rangeView.style.display = '';
    }
}

function cleanupRangeState() {
    Object.values(reviewState.charts).forEach(c => { try { c.destroy(); } catch(_){} });
    reviewState.charts = {};
    ['rangeCards', 'rangeStudentTable', 'rangeRiskTable',
     'rangeReportContent', 'rangeAnomalies', 'rangeReportStatus'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });
}

function applyDateRange() {
    const start = document.getElementById('rangeStart').value;
    const end = document.getElementById('rangeEnd').value;
    if (!start || !end) { alert('請選擇開始和結束日期'); return; }
    if (start > end) { alert('開始日期不能晚於結束日期'); return; }

    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    if (days > 62 && !confirm(`選擇了 ${days} 天，範圍較大可能載入較慢，確定繼續？`)) return;

    reviewState.rangeStart = start;
    reviewState.rangeEnd = end;
    loadDateRangeView(start, end);
}


/* ============================================================
   載入匯總（單日）
   ============================================================ */
async function loadSummary() {
    const dateVal = document.getElementById('filterDate').value;
    reviewState.currentDate = dateVal;

    try {
        const data = await APIClient.get(`/api/class-diary/review/classes?entry_date=${dateVal}`);

        if (data.success && data.data) {
            renderSummaryCards(data.data);
            updateClassFilter(data.data);
            loadDashboard();

            const classFilter = document.getElementById('filterClass').value;
            if (classFilter) {
                await loadEntries(classFilter);
            } else if (data.data.length > 0) {
                await loadEntries(data.data[0].class_code);
            } else {
                showEmptyEntries();
            }
        }
    } catch (e) {
        console.error('載入匯總失敗:', e);
    }
}


/* ============================================================
   渲染匯總卡片
   ============================================================ */
function renderSummaryCards(classes) {
    const grid = document.getElementById('summaryGrid');
    if (reviewState.permissionTier === 'report_recipient') {
        grid.style.display = 'none';
        return;
    }

    if (!classes || classes.length === 0) {
        grid.innerHTML = `
            <div class="summary-empty">
                <div class="icon">📭</div>
                <p>該日期暫無任何班級評級記錄</p>
            </div>`;
        return;
    }

    grid.innerHTML = classes.map(c => `
        <div class="summary-card ${reviewState.currentClass === c.class_code ? 'active' : ''}"
             onclick="selectClass('${escapeHtml(c.class_code)}')">
            <div class="summary-class">${escapeHtml(c.class_code)}</div>
            <div class="summary-meta">
                <span>${c.entry_count} 條記錄</span>
                <span class="rating">紀律 ${c.avg_discipline || '-'}</span>
                <span class="rating">整潔 ${c.avg_cleanliness || '-'}</span>
            </div>
        </div>
    `).join('');
}

function updateClassFilter(classes) {
    if (reviewState.permissionTier === 'class_teacher') return; // 班主任的下拉已固定
    const select = document.getElementById('filterClass');
    const currentVal = select.value;
    select.innerHTML = '<option value="">全部班級</option>';
    (classes || []).forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.class_code;
        opt.textContent = c.class_code;
        select.appendChild(opt);
    });
    if (currentVal) select.value = currentVal;
}


/* ============================================================
   載入詳細記錄
   ============================================================ */
async function loadEntries(classCode) {
    if (reviewState.permissionTier === 'report_recipient') return;

    reviewState.currentClass = classCode || '';
    document.querySelectorAll('.summary-card').forEach(card => {
        card.classList.toggle('active', card.querySelector('.summary-class')?.textContent === classCode);
    });

    const dateVal = document.getElementById('filterDate').value;
    let url = `/api/class-diary/review?entry_date=${dateVal}`;
    if (classCode) url += `&class_code=${encodeURIComponent(classCode)}`;

    try {
        const data = await APIClient.get(url);
        if (data.success && data.data && data.data.length > 0) {
            reviewState.entries = data.data;
            renderEntries(data.data, classCode);
        } else {
            showEmptyEntries();
        }
    } catch (e) {
        console.error('載入記錄失敗:', e);
        showEmptyEntries();
    }
}

function selectClass(classCode) {
    document.getElementById('filterClass').value = classCode;
    loadEntries(classCode);
}


/* ============================================================
   渲染記錄表格
   ============================================================ */
function renderEntries(entries, classCode) {
    const section = document.getElementById('entriesSection');
    const body = document.getElementById('entriesBody');
    const title = document.getElementById('entriesTitle');
    const count = document.getElementById('entriesCount');

    section.style.display = '';
    document.getElementById('emptyState').style.display = 'none';

    title.textContent = classCode ? `${classCode} 班 — 課堂記錄` : '全部課堂記錄';
    count.textContent = `${entries.length} 條`;

    const periodLabels = ['早會', '第一節', '第二節', '第三節', '第四節', '第五節', '第六節', '第七節', '第八節', '第九節'];
    const isAdmin = reviewState.userRole === 'admin';

    body.innerHTML = entries.map(e => {
        const periodText = e.period_start === e.period_end
            ? periodLabels[e.period_start] || `${e.period_start}`
            : `${periodLabels[e.period_start]} → ${periodLabels[e.period_end]}`;

        const discStars = renderMiniStars(e.discipline_rating);
        const cleanStars = renderMiniStars(e.cleanliness_rating);

        const sigHtml = e.signature && typeof e.signature === 'string' && e.signature.startsWith('data:')
            ? `<img class="sig-thumb" src="${e.signature}" onclick="showSignature('${e.id}')" title="點擊查看">`
            : (e.signature ? '<span style="color:var(--success)">✓</span>' : '<span style="color:var(--text-tertiary)">—</span>');

        const deleteBtn = isAdmin
            ? `<td><button class="btn-delete-entry" onclick="deleteEntryFromReview(${e.id})">刪除</button></td>`
            : '';

        return `
            <tr>
                <td><span class="period-badge">${periodText}</span></td>
                <td><strong>${escapeHtml(e.subject)}</strong></td>
                <td><span class="mini-stars">${discStars}</span></td>
                <td><span class="mini-stars">${cleanStars}</span></td>
                <td class="cell-text">${renderCellText(e.absent_students)}</td>
                <td class="cell-text">${renderCellText(e.late_students)}</td>
                <td class="cell-text">${renderBehaviorCell(e.commended_students)}</td>
                <td class="cell-text">${renderBehaviorCell([e.rule_violations, e.appearance_issues].filter(Boolean).join('|||'))}</td>
                <td class="cell-text">${renderBehaviorCell(e.medical_room_students)}</td>
                <td>${sigHtml}</td>
                ${deleteBtn}
            </tr>
        `;
    }).join('');

    const thead = document.querySelector('.entries-table thead tr');
    const existingActionTh = thead.querySelector('.th-action');
    if (isAdmin && !existingActionTh) {
        const th = document.createElement('th');
        th.className = 'th-action';
        th.textContent = '操作';
        thead.appendChild(th);
    } else if (!isAdmin && existingActionTh) {
        existingActionTh.remove();
    }
}

function renderMiniStars(rating) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        html += i <= rating ? '★' : '<span class="empty">☆</span>';
    }
    return html;
}

function showEmptyEntries() {
    const section = document.getElementById('entriesSection');
    section.style.display = '';
    document.getElementById('entriesBody').innerHTML = '';
    document.getElementById('emptyState').style.display = '';
    document.getElementById('entriesCount').textContent = '0 條';
}


/* ============================================================
   簽名模態框
   ============================================================ */
function showSignature(entryId) {
    const entry = reviewState.entries.find(e => String(e.id) === String(entryId));
    if (!entry || !entry.signature) return;
    document.getElementById('sigModalImg').src = entry.signature;
    document.getElementById('sigModal').classList.add('show');
}

function closeSigModal() {
    document.getElementById('sigModal').classList.remove('show');
}


/* ============================================================
   每日 AI 報告
   ============================================================ */
async function loadDailyReport() {
    const dateVal = document.getElementById('filterDate').value;
    try {
        const data = await APIClient.get(`/api/class-diary/review/daily-report?entry_date=${dateVal}`);
        if (!data.success || !data.data) return;

        const { report_text, anomalies, status, is_recipient, is_reviewer } = data.data;
        reviewState.isRecipient = is_recipient;
        reviewState.isReviewer = is_reviewer;

        // 匯出按鈕
        const exportDropdown = document.getElementById('exportDropdown');
        if (exportDropdown && reviewState.canExport) {
            exportDropdown.style.display = '';
        }

        // AI 報告區塊
        const block = document.getElementById('aiReportBlock');
        if (!block) return;

        if (!reviewState.canViewAiReport) {
            block.style.display = 'none';
            return;
        }

        renderAiReport(block, 'dailyReportStatus', 'dailyReportContent', 'dailyAnomalies',
            status, report_text, anomalies, reviewState.isReviewer);

    } catch (e) {
        console.error('載入每日報告失敗:', e);
    }
}

function renderAiReport(block, statusId, contentId, anomaliesId, status, reportText, anomalies, showAnomalies) {
    const statusEl = document.getElementById(statusId);
    const contentEl = document.getElementById(contentId);
    const anomaliesEl = document.getElementById(anomaliesId);

    if (status === 'none') {
        block.style.display = '';
        statusEl.innerHTML = '<p class="ai-report-status muted">該日期尚未生成 AI 報告。</p>';
        contentEl.innerHTML = '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        return;
    }
    if (status === 'generating') {
        block.style.display = '';
        statusEl.innerHTML = '<p class="ai-report-status generating">報告生成中，請稍候刷新...</p>';
        contentEl.innerHTML = '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        return;
    }
    if (status === 'failed') {
        block.style.display = '';
        statusEl.innerHTML = '<p class="ai-report-status failed">報告生成失敗</p>';
        contentEl.innerHTML = reportText ? `<p style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(reportText)}</p>` : '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        return;
    }

    // status === 'done'
    block.style.display = '';
    statusEl.innerHTML = '';
    contentEl.innerHTML = `<div class="report-text">${escapeHtml(reportText || '').replace(/\n/g, '<br>')}</div>`;

    if (anomaliesEl && showAnomalies && anomalies && anomalies.length > 0) {
        const periodLabels = ['早會', '第一節', '第二節', '第三節', '第四節', '第五節', '第六節', '第七節', '第八節', '第九節'];
        anomaliesEl.innerHTML = `
            <div class="anomalies-section">
                <h4 class="anomalies-title">異常記錄 (${anomalies.length} 條)</h4>
                ${anomalies.map(a => {
                    const ps = a.period_start != null ? (periodLabels[a.period_start] || a.period_start) : '?';
                    return `
                    <div class="anomaly-item">
                        <span class="anomaly-badge">${escapeHtml(a.class_code)}</span>
                        <span class="anomaly-period">${ps}</span>
                        <span class="anomaly-subject">${escapeHtml(a.subject)}</span>
                        <span class="anomaly-reasons">${a.reasons.map(r => escapeHtml(r)).join('；')}</span>
                    </div>`;
                }).join('')}
            </div>`;
    } else if (anomaliesEl) {
        anomaliesEl.innerHTML = '';
    }
}


/* ============================================================
   匯出 XLSX
   ============================================================ */
function toggleExportMenu() {
    const menu = document.getElementById('exportMenu');
    menu.classList.toggle('show');
    if (menu.classList.contains('show')) {
        setTimeout(() => {
            document.addEventListener('click', _closeExportMenu, { once: true });
        }, 0);
    }
}

function _closeExportMenu(e) {
    const dropdown = document.getElementById('exportDropdown');
    if (!dropdown.contains(e.target)) {
        document.getElementById('exportMenu').classList.remove('show');
    }
}

function _downloadBlob(url, filename) {
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    return fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(resp => {
            if (!resp.ok) throw new Error('匯出失敗');
            return resp.blob();
        })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const dl = document.createElement('a');
            dl.href = blobUrl;
            dl.download = filename;
            document.body.appendChild(dl);
            dl.click();
            document.body.removeChild(dl);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        });
}

function exportSingleDay() {
    document.getElementById('exportMenu').classList.remove('show');
    const dateVal = document.getElementById('filterDate').value;
    _downloadBlob(
        `/api/class-diary/review/export?entry_date=${dateVal}`,
        `課室日誌_${dateVal}.xlsx`
    ).catch(err => alert('匯出失敗: ' + err.message));
}

function showRangeExportModal() {
    document.getElementById('exportMenu').classList.remove('show');
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 6);
    document.getElementById('rangeEndDate').value = today.toISOString().split('T')[0];
    document.getElementById('rangeStartDate').value = weekAgo.toISOString().split('T')[0];
    document.getElementById('rangeModal').classList.add('show');
}

function closeRangeModal() {
    document.getElementById('rangeModal').classList.remove('show');
}

function exportDateRange() {
    const startDate = document.getElementById('rangeStartDate').value;
    const endDate = document.getElementById('rangeEndDate').value;
    if (!startDate || !endDate) { alert('請選擇開始和結束日期'); return; }
    if (startDate > endDate) { alert('開始日期不能晚於結束日期'); return; }

    const btn = document.getElementById('rangeConfirmBtn');
    btn.textContent = '匯出中...';
    btn.disabled = true;

    _downloadBlob(
        `/api/class-diary/review/export-range?start_date=${startDate}&end_date=${endDate}`,
        `課室日誌_${startDate}_至_${endDate}.xlsx`
    )
        .then(() => closeRangeModal())
        .catch(err => alert('匯出失敗: ' + err.message))
        .finally(() => { btn.textContent = '匯出'; btn.disabled = false; });
}


/* ============================================================
   篩選事件
   ============================================================ */
function onFilterChange() {
    if (reviewState.dateMode === 'single') {
        loadDailyReport();
        loadSummary();
    }
}


/* ============================================================
   工具
   ============================================================ */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function formatBehaviorField(value) {
    if (!value || !value.trim()) return '';
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed
                .filter(item => item.students && item.students.length > 0)
                .map(item => {
                    const studentsStr = item.students.map(s => escapeHtml(s)).join('、');
                    return item.reason
                        ? `${escapeHtml(item.reason)}: ${studentsStr}`
                        : studentsStr;
                })
                .join('；');
        }
    } catch (e) { /* not JSON */ }
    return escapeHtml(value);
}


/* ============================================================
   可展開文字
   ============================================================ */
let _cellId = 0;

function renderCellText(value) {
    if (!value || !value.trim()) return '—';
    const text = escapeHtml(value);
    if (text.length <= 20) return text;
    const id = 'cell-' + (++_cellId);
    return `<div class="cell-expandable" id="${id}" onclick="toggleCellExpand('${id}')">
        <span class="cell-truncated">${text}<span class="expand-icon">▸</span></span>
        <span class="cell-full">${text}</span>
    </div>`;
}

function renderBehaviorCell(value) {
    if (!value || !value.trim()) return '—';
    const parts = value.split('|||').filter(v => v.trim());
    let shortText = '';
    let fullHtml = '';

    parts.forEach(part => {
        try {
            const parsed = JSON.parse(part);
            if (Array.isArray(parsed)) {
                const items = parsed.filter(item => item.students && item.students.length > 0);
                if (items.length === 0) return;
                shortText += items.map(item =>
                    item.reason ? `${item.reason}: ${item.students.join('、')}` : item.students.join('、')
                ).join('；');
                fullHtml += items.map(item =>
                    `<div class="behavior-entry"><span class="behavior-reason">${escapeHtml(item.reason || '')}:</span> <span class="behavior-students">${item.students.map(s => escapeHtml(s)).join('、')}</span></div>`
                ).join('');
                return;
            }
        } catch (e) { /* not JSON */ }
        shortText += escapeHtml(part);
        fullHtml += `<div class="behavior-entry">${escapeHtml(part)}</div>`;
    });

    if (!shortText) return '—';
    if (shortText.length <= 20 && parts.length <= 1) return escapeHtml(shortText);

    const id = 'cell-' + (++_cellId);
    return `<div class="cell-expandable" id="${id}" onclick="toggleCellExpand('${id}')">
        <span class="cell-truncated">${escapeHtml(shortText)}<span class="expand-icon">▸</span></span>
        <span class="cell-full">${fullHtml}</span>
    </div>`;
}

function toggleCellExpand(cellId) {
    const el = document.getElementById(cellId);
    if (el) el.classList.toggle('expanded');
}


/* ============================================================
   Admin 刪除記錄
   ============================================================ */
async function deleteEntryFromReview(entryId) {
    if (!confirm('確定要刪除此記錄嗎？此操作無法撤銷。')) return;
    try {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        const resp = await fetch(`/api/class-diary/entries/${entryId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await resp.json();
        if (data.success) {
            onFilterChange();
        } else {
            alert('刪除失敗：' + (data.error?.message || data.detail || '未知錯誤'));
        }
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
}


/* ============================================================
   儀表板（單日）
   ============================================================ */
async function loadDashboard() {
    const dateVal = document.getElementById('filterDate').value;
    try {
        const data = await APIClient.get(`/api/class-diary/review?entry_date=${dateVal}`);
        if (!data.success || !data.data || data.data.length === 0) {
            if (reviewState.isRecipient || reviewState.isReviewer) {
                document.getElementById('dashboardSection').style.display = '';
                document.getElementById('dashCards').innerHTML = '';
                document.getElementById('dashClassChart').innerHTML = '';
                document.getElementById('dashBehavior').innerHTML = '';
            } else {
                document.getElementById('dashboardSection').style.display = 'none';
            }
            return;
        }

        const entries = data.data;
        dashboardEntries = entries;
        document.getElementById('dashboardSection').style.display = '';
        renderDashCards(entries);

        if (reviewState.permissionTier !== 'report_recipient') {
            renderClassComparison(entries);
            renderBehaviorBreakdown(entries);
        }
    } catch (e) {
        console.error('載入儀表板失敗:', e);
        document.getElementById('dashboardSection').style.display = 'none';
    }
}

function toggleDashboard() {
    document.getElementById('dashboardSection').classList.toggle('collapsed');
}

function renderDashCards(entries) {
    const container = document.getElementById('dashCards');
    const totalEntries = entries.length;
    const classSet = new Set(entries.map(e => e.class_code));
    const totalClasses = classSet.size;

    const avgDisc = (entries.reduce((s, e) => s + (e.discipline_rating || 0), 0) / totalEntries).toFixed(1);
    const avgClean = (entries.reduce((s, e) => s + (e.cleanliness_rating || 0), 0) / totalEntries).toFixed(1);
    const absentCount = entries.reduce((s, e) => s + countStudents(e.absent_students), 0);
    const lateCount = entries.reduce((s, e) => s + countStudents(e.late_students), 0);
    const violationCount = entries.reduce((s, e) =>
        s + countBehaviorStudents(e.rule_violations) + countBehaviorStudents(e.appearance_issues), 0);
    const medicalCount = entries.reduce((s, e) => s + countBehaviorStudents(e.medical_room_students), 0);

    container.innerHTML = `
        <div class="dash-card">
            <div class="dash-card-value">${totalEntries} / ${totalClasses}</div>
            <div class="dash-card-label">記錄 / 班級</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-value" style="color:${ratingColor(avgDisc)}">${avgDisc}</div>
            <div class="dash-card-label">平均紀律</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-value" style="color:${ratingColor(avgClean)}">${avgClean}</div>
            <div class="dash-card-label">平均整潔</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('attendance')">
            <div class="dash-card-value">${absentCount} / ${lateCount}</div>
            <div class="dash-card-label">缺席 / 遲到</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('violation')">
            <div class="dash-card-value" style="color:${violationCount > 0 ? 'var(--warning)' : ''}">${violationCount}</div>
            <div class="dash-card-label">違規事件</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('medical')">
            <div class="dash-card-value" style="color:${medicalCount > 0 ? 'var(--info)' : ''}">${medicalCount}</div>
            <div class="dash-card-label">醫務室</div>
        </div>
    `;
}


/* ============================================================
   班級排名 + 行為分析（單日）
   ============================================================ */
function renderClassComparison(entries) {
    const container = document.getElementById('dashClassChart');
    const classMap = {};
    entries.forEach(e => {
        if (!classMap[e.class_code]) classMap[e.class_code] = { disc: [], clean: [] };
        classMap[e.class_code].disc.push(e.discipline_rating || 0);
        classMap[e.class_code].clean.push(e.cleanliness_rating || 0);
    });

    const classStats = Object.entries(classMap).map(([code, data]) => ({
        code,
        avgDisc: (data.disc.reduce((a, b) => a + b, 0) / data.disc.length).toFixed(1),
        avgClean: (data.clean.reduce((a, b) => a + b, 0) / data.clean.length).toFixed(1),
    })).sort((a, b) => b.avgDisc - a.avgDisc);

    if (classStats.length === 0) { container.innerHTML = ''; return; }

    let html = '<div class="dash-chart-title">班級紀律 / 整潔排名</div>';
    classStats.forEach(c => {
        const discWidth = (c.avgDisc / 5 * 100).toFixed(0);
        const cleanWidth = (c.avgClean / 5 * 100).toFixed(0);
        html += `
            <div class="dash-bar-row">
                <span class="dash-bar-label">${escapeHtml(c.code)}</span>
                <div class="dash-bar-group">
                    <div class="dash-bar-track"><div class="dash-bar-fill discipline" style="width:${discWidth}%"></div></div>
                    <div class="dash-bar-track"><div class="dash-bar-fill cleanliness" style="width:${cleanWidth}%"></div></div>
                </div>
                <span class="dash-bar-value">${c.avgDisc}<br>${c.avgClean}</span>
            </div>
        `;
    });
    html += `<div class="dash-bar-legend"><span><span class="legend-dot discipline"></span>紀律</span><span><span class="legend-dot cleanliness"></span>整潔</span></div>`;
    container.innerHTML = html;
}

function renderBehaviorBreakdown(entries) {
    const container = document.getElementById('dashBehavior');
    const praiseAcc = {}, violationAcc = {}, medicalAcc = {};

    entries.forEach(e => {
        aggregateBehaviorReasons(e.commended_students, praiseAcc);
        aggregateBehaviorReasons(e.rule_violations, violationAcc);
        aggregateBehaviorReasons(e.appearance_issues, violationAcc);
        aggregateBehaviorReasons(e.medical_room_students, medicalAcc);
    });

    const praiseTop = getTopReasons(praiseAcc, 5);
    const violationTop = getTopReasons(violationAcc, 5);
    const medicalTop = getTopReasons(medicalAcc, 5);

    if (praiseTop.length === 0 && violationTop.length === 0 && medicalTop.length === 0) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    if (violationTop.length > 0) html += renderBehaviorGroup('違規原因', violationTop, 'violation');
    if (praiseTop.length > 0) html += renderBehaviorGroup('嘉許原因', praiseTop, 'praise');
    if (medicalTop.length > 0) html += renderBehaviorGroup('醫務室原因', medicalTop, 'medical');
    container.innerHTML = html;
}

function renderBehaviorGroup(title, items, cssClass) {
    const maxCount = Math.max(...items.map(i => i.count), 1);
    return `
        <div class="dash-behavior-group">
            <div class="dash-behavior-title">${title}</div>
            ${items.map(item => {
                const pct = (item.count / maxCount * 100).toFixed(0);
                return `<div class="dash-behavior-item">
                    <span class="dash-behavior-name">${escapeHtml(item.reason)}</span>
                    <div class="dash-mini-bar-track"><div class="dash-mini-bar ${cssClass}" style="width:${pct}%"></div></div>
                    <span class="dash-behavior-count">${item.count}人</span>
                </div>`;
            }).join('')}
        </div>
    `;
}


/* ============================================================
   儀表板輔助函數
   ============================================================ */
function countStudents(value) {
    if (!value || !value.trim()) return 0;
    return value.split(/[、，,；;／/\n]+/).filter(s => s.trim()).length;
}

function countBehaviorStudents(value) {
    if (!value || !value.trim()) return 0;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.reduce((sum, item) => sum + (item.students ? item.students.length : 0), 0);
        }
    } catch (e) { /* not JSON */ }
    return 1;
}

function aggregateBehaviorReasons(value, acc) {
    if (!value || !value.trim()) return;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            parsed.forEach(item => {
                if (item.reason && item.students && item.students.length > 0) {
                    acc[item.reason] = (acc[item.reason] || 0) + item.students.length;
                }
            });
            return;
        }
    } catch (e) { /* not JSON */ }
}

function getTopReasons(acc, n) {
    return Object.entries(acc)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
}

function ratingColor(rating) {
    const r = parseFloat(rating);
    if (r >= 4) return 'var(--brand)';
    if (r >= 3) return 'var(--warning)';
    return 'var(--danger)';
}


/* ============================================================
   儀表板卡片點擊 — 學生明細彈窗
   ============================================================ */
function parseStudentNames(value) {
    if (!value || !value.trim()) return [];
    return value.split(/[、，,；;／/\n]+/).map(s => s.trim()).filter(Boolean);
}

function groupAttendanceByClass(entries, field) {
    const map = {};
    entries.forEach(e => {
        const names = parseStudentNames(e[field]);
        if (names.length === 0) return;
        if (!map[e.class_code]) map[e.class_code] = [];
        names.forEach(n => {
            if (!map[e.class_code].includes(n)) map[e.class_code].push(n);
        });
    });
    return map;
}

function groupBehaviorByClass(entries, fields) {
    const map = {};
    entries.forEach(e => {
        (Array.isArray(fields) ? fields : [fields]).forEach(field => {
            const val = e[field];
            if (!val || !val.trim()) return;
            const code = e.class_code;
            if (!map[code]) map[code] = {};
            try {
                const parsed = JSON.parse(val);
                if (Array.isArray(parsed)) {
                    parsed.forEach(item => {
                        if (!item.reason || !item.students || item.students.length === 0) return;
                        if (!map[code][item.reason]) map[code][item.reason] = new Set();
                        item.students.forEach(s => map[code][item.reason].add(s));
                    });
                    return;
                }
            } catch (_) { /* not JSON */ }
            if (!map[code]['其他']) map[code]['其他'] = new Set();
            map[code]['其他'].add(val.trim());
        });
    });
    return map;
}

function showStudentDetail(type) {
    if (dashboardEntries.length === 0) return;
    const modal = document.getElementById('detailModal');
    const titleEl = document.getElementById('detailModalTitle');
    const bodyEl = document.getElementById('detailModalBody');
    let html = '';

    if (type === 'attendance') {
        titleEl.textContent = '缺席 / 遲到學生';
        html += renderAttendanceSection('缺席學生', groupAttendanceByClass(dashboardEntries, 'absent_students'));
        html += renderAttendanceSection('遲到學生', groupAttendanceByClass(dashboardEntries, 'late_students'));
    } else if (type === 'violation') {
        titleEl.textContent = '違規事件';
        html = renderBehaviorDetail(groupBehaviorByClass(dashboardEntries, ['rule_violations', 'appearance_issues']));
    } else if (type === 'medical') {
        titleEl.textContent = '醫務室';
        html = renderBehaviorDetail(groupBehaviorByClass(dashboardEntries, 'medical_room_students'));
    }

    bodyEl.innerHTML = html.trim() || '<p class="detail-empty">無記錄</p>';
    modal.classList.add('show');
}

function renderAttendanceSection(title, map) {
    const classes = Object.keys(map).sort();
    if (classes.length === 0) return '';
    const total = classes.reduce((s, c) => s + map[c].length, 0);
    let html = `<div class="detail-section"><div class="detail-section-title">${escapeHtml(title)} (${total}人)</div>`;
    classes.forEach(code => {
        html += `<div class="detail-class-row"><span class="detail-class-label">${escapeHtml(code)}</span><span class="detail-student-names">${map[code].map(n => escapeHtml(n)).join('、')}</span></div>`;
    });
    return html + '</div>';
}

function renderBehaviorDetail(map) {
    const classes = Object.keys(map).sort();
    if (classes.length === 0) return '';
    let html = '';
    classes.forEach(code => {
        html += `<div class="detail-class-group"><div class="detail-class-label">${escapeHtml(code)}</div>`;
        Object.entries(map[code]).forEach(([reason, studentsSet]) => {
            const students = [...studentsSet];
            html += `<div class="detail-reason-row"><span class="detail-reason">${escapeHtml(reason)}：</span><span class="detail-student-names">${students.map(s => escapeHtml(s)).join('、')}</span></div>`;
        });
        html += '</div>';
    });
    return html;
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('show');
}


/* ============================================================
   日期範圍視圖
   ============================================================ */
async function loadDateRangeView(startDate, endDate) {
    cleanupRangeState();

    // loading 狀態
    document.getElementById('rangeCards').innerHTML = '<div class="loading-text">載入中...</div>';

    try {
        const data = await APIClient.get(
            `/api/class-diary/review/dashboard-data?mode=date_range&start_date=${startDate}&end_date=${endDate}`
        );
        if (!data.success || !data.data) {
            document.getElementById('rangeCards').innerHTML = '<div class="chart-empty">載入失敗</div>';
            return;
        }

        const { overview, charts, tables } = data.data;

        // 1. 概覽卡片（所有 tier 可見）
        renderRangeOverviewCards(overview);

        // 2. 圖表（charts tier 可見）
        if (reviewState.canViewCharts && charts) {
            document.getElementById('rangeChartSection').style.display = '';
            renderDailyTrendChart(charts.daily_summary || []);
            renderPeriodChart(charts.period_analysis || []);
            renderWeekdayChart(charts.weekday_analysis || []);
            renderSubjectChart(charts.subject_analysis || []);
        }

        // 3. 原始數據表（raw_data tier 可見）
        if (reviewState.canViewRawData && tables) {
            document.getElementById('rangeRawDataSection').style.display = '';
            renderStudentRecordsTable(tables.student_records || []);
            renderRiskStudentsTable(tables.risk_students || []);
        }

        // 4. AI 報告（ai_report tier 可見）
        if (reviewState.canViewAiReport) {
            document.getElementById('rangeAiSection').style.display = '';
            if (reviewState.permissionTier === 'admin') {
                document.getElementById('generateRangeReportBtn').style.display = '';
            }
            loadRangeReport(startDate, endDate);
        }

    } catch (e) {
        console.error('載入日期範圍數據失敗:', e);
        document.getElementById('rangeCards').innerHTML = '<div class="chart-empty">載入失敗</div>';
    }
}

function renderRangeOverviewCards(ov) {
    const container = document.getElementById('rangeCards');
    if (!ov || !ov.total_entries) {
        container.innerHTML = '<div class="chart-empty">指定範圍內沒有記錄</div>';
        return;
    }

    const avgDisc = ov.avg_discipline || '-';
    const avgClean = ov.avg_cleanliness || '-';

    container.innerHTML = `
        <div class="dash-card"><div class="dash-card-value">${ov.total_entries}</div><div class="dash-card-label">總記錄</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_dates || '-'}</div><div class="dash-card-label">天數</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_classes || '-'}</div><div class="dash-card-label">班級數</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${ratingColor(avgDisc)}">${avgDisc}</div><div class="dash-card-label">平均紀律</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${ratingColor(avgClean)}">${avgClean}</div><div class="dash-card-label">平均整潔</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_absent || 0} / ${ov.total_late || 0}</div><div class="dash-card-label">缺席 / 遲到</div></div>
    `;
}


/* ============================================================
   Chart.js 圖表（日期範圍）
   ============================================================ */
const CHART_COLORS = {
    brand: '#006633',
    brandLight: 'rgba(0,102,51,0.2)',
    blue: '#2563EB',
    blueLight: 'rgba(37,99,235,0.2)',
    orange: '#EA580C',
    orangeLight: 'rgba(234,88,12,0.2)',
    red: '#DC2626',
    redLight: 'rgba(220,38,38,0.2)',
    gray: '#6B7280',
};

function _destroyChart(key) {
    if (reviewState.charts[key]) {
        try { reviewState.charts[key].destroy(); } catch(_){}
        delete reviewState.charts[key];
    }
}

function renderDailyTrendChart(dailySummary) {
    _destroyChart('trend');
    const canvas = document.getElementById('dailyTrendChart');
    const empty = document.getElementById('trendChartEmpty');
    if (!dailySummary || dailySummary.length === 0) {
        canvas.style.display = 'none';
        empty.style.display = '';
        return;
    }
    canvas.style.display = '';
    empty.style.display = 'none';

    const labels = dailySummary.map(d => d.date);
    const disc = dailySummary.map(d => d.avg_discipline);
    const clean = dailySummary.map(d => d.avg_cleanliness);
    const ma7disc = dailySummary.map(d => d.ma7_discipline);
    const ma7clean = dailySummary.map(d => d.ma7_cleanliness);
    const violations = dailySummary.map(d => d.violation_count || 0);

    reviewState.charts.trend = new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                { label: '紀律', data: disc, borderColor: CHART_COLORS.brand, backgroundColor: CHART_COLORS.brandLight, tension: 0.3, yAxisID: 'y' },
                { label: '整潔', data: clean, borderColor: CHART_COLORS.blue, backgroundColor: CHART_COLORS.blueLight, tension: 0.3, yAxisID: 'y' },
                { label: '紀律 7日MA', data: ma7disc, borderColor: CHART_COLORS.brand, borderDash: [5,5], pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: '整潔 7日MA', data: ma7clean, borderColor: CHART_COLORS.blue, borderDash: [5,5], pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: '違規人次', data: violations, type: 'bar', backgroundColor: CHART_COLORS.orangeLight, borderColor: CHART_COLORS.orange, yAxisID: 'y1' },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { min: 0, max: 5, title: { display: true, text: '評分' } },
                y1: { position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: '違規人次' } },
            },
            plugins: { legend: { position: 'bottom' } },
        },
    });
}

function renderPeriodChart(periodAnalysis) {
    _destroyChart('period');
    const canvas = document.getElementById('periodChart');
    const empty = document.getElementById('periodChartEmpty');
    if (!periodAnalysis || periodAnalysis.length === 0) {
        canvas.style.display = 'none';
        empty.style.display = '';
        return;
    }
    canvas.style.display = '';
    empty.style.display = 'none';

    const labels = periodAnalysis.map(p => p.period_label || `節${p.period}`);
    const disc = periodAnalysis.map(p => p.avg_discipline);
    const colors = disc.map(d => d >= 4 ? CHART_COLORS.brand : d >= 3 ? CHART_COLORS.orange : CHART_COLORS.red);

    reviewState.charts.period = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: '平均紀律', data: disc, backgroundColor: colors }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            scales: { x: { min: 0, max: 5 } },
            plugins: { legend: { display: false } },
        },
    });
}

function renderWeekdayChart(weekdayAnalysis) {
    _destroyChart('weekday');
    const canvas = document.getElementById('weekdayChart');
    const empty = document.getElementById('weekdayChartEmpty');
    if (!weekdayAnalysis || weekdayAnalysis.length === 0) {
        canvas.style.display = 'none';
        empty.style.display = '';
        return;
    }
    canvas.style.display = '';
    empty.style.display = 'none';

    const labels = weekdayAnalysis.map(w => w.weekday_label);
    const disc = weekdayAnalysis.map(w => w.avg_discipline);
    const clean = weekdayAnalysis.map(w => w.avg_cleanliness);

    reviewState.charts.weekday = new Chart(canvas, {
        type: 'radar',
        data: {
            labels,
            datasets: [
                { label: '紀律', data: disc, borderColor: CHART_COLORS.brand, backgroundColor: CHART_COLORS.brandLight },
                { label: '整潔', data: clean, borderColor: CHART_COLORS.blue, backgroundColor: CHART_COLORS.blueLight },
            ],
        },
        options: {
            responsive: true,
            scales: { r: { min: 0, max: 5 } },
            plugins: { legend: { position: 'bottom' } },
        },
    });
}

function renderSubjectChart(subjectAnalysis) {
    _destroyChart('subject');
    const canvas = document.getElementById('subjectChart');
    const empty = document.getElementById('subjectChartEmpty');
    if (!subjectAnalysis || subjectAnalysis.length === 0) {
        canvas.style.display = 'none';
        empty.style.display = '';
        return;
    }
    canvas.style.display = '';
    empty.style.display = 'none';

    // 按記錄數排序，取 top 15
    const sorted = [...subjectAnalysis].sort((a, b) => b.entry_count - a.entry_count).slice(0, 15);
    const labels = sorted.map(s => s.subject);
    const counts = sorted.map(s => s.entry_count);
    const disc = sorted.map(s => s.avg_discipline);
    const colors = disc.map(d => d >= 4 ? CHART_COLORS.brand : d >= 3 ? CHART_COLORS.orange : CHART_COLORS.red);

    reviewState.charts.subject = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: '記錄數', data: counts, backgroundColor: colors }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => `平均紀律: ${disc[ctx.dataIndex]}`,
                    },
                },
            },
        },
    });
}


/* ============================================================
   學生記錄表 + 風險學生表
   ============================================================ */
function renderStudentRecordsTable(records) {
    const table = document.getElementById('rangeStudentTable');
    if (!records || records.length === 0) {
        table.innerHTML = '<tr><td colspan="10" class="chart-empty">無學生記錄</td></tr>';
        return;
    }

    let html = `<thead><tr>
        <th>學生</th><th>班級</th>
        <th>缺席</th><th>缺席日期</th>
        <th>遲到</th><th>遲到日期</th>
        <th>違規</th><th>違規日期</th>
        <th>醫務室</th><th>醫務室日期</th>
    </tr></thead><tbody>`;

    records.forEach(s => {
        html += `<tr>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.class_code)}</td>
            <td>${s.absent_count || 0}</td>
            <td class="date-cell">${(s.absent_dates || []).join(', ')}</td>
            <td>${s.late_count || 0}</td>
            <td class="date-cell">${(s.late_dates || []).join(', ')}</td>
            <td>${s.violation_count || 0}</td>
            <td class="date-cell">${(s.violation_dates || []).join(', ')}</td>
            <td>${s.medical_count || 0}</td>
            <td class="date-cell">${(s.medical_dates || []).join(', ')}</td>
        </tr>`;
    });

    table.innerHTML = html + '</tbody>';
}

function renderRiskStudentsTable(riskStudents) {
    const table = document.getElementById('rangeRiskTable');
    if (!riskStudents || riskStudents.length === 0) {
        table.innerHTML = '<tr><td colspan="11" class="chart-empty">無高風險學生</td></tr>';
        return;
    }

    let html = `<thead><tr>
        <th>學生</th><th>班級</th><th>總記名</th>
        <th>違規</th><th>缺席</th><th>遲到</th><th>醫務室</th>
        <th>首次記錄</th><th>最近記錄</th><th>涉及天數</th><th>風險標記</th>
    </tr></thead><tbody>`;

    riskStudents.forEach(s => {
        const flags = (s.risk_flags || []).join(', ');
        html += `<tr class="risk-high">
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.class_code)}</td>
            <td><strong>${s.total_incidents || 0}</strong></td>
            <td>${s.violation_count || 0}</td>
            <td>${s.absent_count || 0}</td>
            <td>${s.late_count || 0}</td>
            <td>${s.medical_count || 0}</td>
            <td>${s.first_date || '-'}</td>
            <td>${s.last_date || '-'}</td>
            <td>${s.involved_days || '-'}</td>
            <td>${escapeHtml(flags)}</td>
        </tr>`;
    });

    table.innerHTML = html + '</tbody>';
}


/* ============================================================
   Range AI Report
   ============================================================ */
async function loadRangeReport(startDate, endDate) {
    try {
        const data = await APIClient.get(
            `/api/class-diary/review/range-report?start_date=${startDate}&end_date=${endDate}`
        );
        if (!data.success || !data.data) return;

        const { report_text, anomalies, status, is_reviewer } = data.data;
        const block = document.getElementById('rangeAiSection');
        renderAiReport(block, 'rangeReportStatus', 'rangeReportContent', 'rangeAnomalies',
            status, report_text, anomalies, is_reviewer);
    } catch (e) {
        console.error('載入範圍報告失敗:', e);
    }
}

async function generateRangeReport() {
    const start = reviewState.rangeStart;
    const end = reviewState.rangeEnd;
    if (!start || !end) return;

    const btn = document.getElementById('generateRangeReportBtn');
    btn.textContent = '生成中...';
    btn.disabled = true;

    try {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        await fetch('/api/class-diary/admin/generate-range-report', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ start_date: start, end_date: end }),
        });

        document.getElementById('rangeReportStatus').innerHTML =
            '<p class="ai-report-status generating">報告生成中，請稍候刷新...</p>';
    } catch (e) {
        alert('生成報告失敗: ' + e.message);
    } finally {
        btn.textContent = '生成 AI 報告';
        btn.disabled = false;
    }
}
