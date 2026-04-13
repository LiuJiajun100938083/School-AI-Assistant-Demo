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
    scope: null,                // 新權限表的 scope 對象
    canViewRawData: false,
    canExport: false,
    canViewAiReport: false,
    canViewCharts: false,
    charts: {},                 // Chart.js 實例
};

/** 儀表板全量 entries（供彈窗使用） */
let dashboardEntries = [];

/** 節次標籤（i18n） */
function getPeriodLabels() {
    return [
        i18n.t('cdv.periodMorning'),
        i18n.t('cdv.period1'), i18n.t('cdv.period2'), i18n.t('cdv.period3'),
        i18n.t('cdv.period4'), i18n.t('cdv.period5'), i18n.t('cdv.period6'),
        i18n.t('cdv.period7'), i18n.t('cdv.period8'), i18n.t('cdv.period9'),
    ];
}

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
    loadSubmissionGaps();
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
            scope: d.scope || null,
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

    // 班主任 或 scoped reviewer：班級下拉只顯示授權班級
    const hasScopedClasses = reviewState.ownClasses.length > 0;
    if (hasScopedClasses && tier !== 'admin') {
        const select = document.getElementById('filterClass');
        select.innerHTML = '';
        if (reviewState.ownClasses.length > 1) {
            select.innerHTML = `<option value="">${i18n.t('cdv.allClasses')}</option>`;
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
    if (!start || !end) { alert(i18n.t('cdv.selectStartEnd')); return; }
    if (start > end) { alert(i18n.t('cdv.startAfterEnd')); return; }

    const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
    if (days > 62 && !confirm(i18n.t('cdv.confirmLargeRange', { days }))) return;

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
                <p>${i18n.t('cdv.noClassRecords')}</p>
            </div>`;
        return;
    }

    grid.innerHTML = classes.map(c => `
        <div class="summary-card ${reviewState.currentClass === c.class_code ? 'active' : ''}"
             onclick="selectClass('${escapeHtml(c.class_code)}')">
            <div class="summary-class">${escapeHtml(c.class_code)}</div>
            <div class="summary-meta">
                <span>${i18n.t('cdv.entryCount', { count: c.entry_count })}</span>
                <span class="rating">${i18n.t('cdv.ratingDisc', { val: c.avg_discipline || '-' })}</span>
                <span class="rating">${i18n.t('cdv.ratingClean', { val: c.avg_cleanliness || '-' })}</span>
            </div>
        </div>
    `).join('');
}

function updateClassFilter(classes) {
    if (reviewState.permissionTier === 'class_teacher') return; // 班主任的下拉已固定
    const select = document.getElementById('filterClass');
    const currentVal = select.value;
    select.innerHTML = `<option value="">${i18n.t('cdv.allClasses')}</option>`;
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

    title.textContent = classCode
        ? i18n.t('cdv.classRecordsTitle', { classCode })
        : i18n.t('cdv.allRecordsTitle');
    count.textContent = i18n.t('cdv.nEntries', { count: entries.length });

    const periodLabels = getPeriodLabels();
    const isAdminOrTeacher = ['admin', 'teacher'].includes(reviewState.userRole);

    body.innerHTML = entries.map(e => {
        const periodText = e.period_start === e.period_end
            ? periodLabels[e.period_start] || `${e.period_start}`
            : `${periodLabels[e.period_start]} → ${periodLabels[e.period_end]}`;

        const discStars = renderMiniStars(e.discipline_rating);
        const cleanStars = renderMiniStars(e.cleanliness_rating);

        const deleteBtn = isAdminOrTeacher
            ? `<td><button class="btn-delete-entry" onclick="deleteEntryFromReview(${e.id})">${i18n.t('cdv.delete')}</button></td>`
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
                ${deleteBtn}
            </tr>
        `;
    }).join('');

    const thead = document.querySelector('.entries-table thead tr');
    const existingActionTh = thead.querySelector('.th-action');
    if (isAdminOrTeacher && !existingActionTh) {
        const th = document.createElement('th');
        th.className = 'th-action';
        th.textContent = i18n.t('cdv.action');
        thead.appendChild(th);
    } else if (!isAdminOrTeacher && existingActionTh) {
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
    document.getElementById('entriesCount').textContent = i18n.t('cdv.zeroEntries');
}



/* ============================================================
   每日 AI 報告
   ============================================================ */
async function loadDailyReport() {
    const dateVal = document.getElementById('filterDate').value;
    try {
        const data = await APIClient.get(`/api/class-diary/review/daily-report?entry_date=${dateVal}`);
        if (!data.success || !data.data) return;

        const { report_text, anomalies, findings, status, is_recipient, is_reviewer } = data.data;
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
            status, report_text, anomalies, findings || [], reviewState.isReviewer);

    } catch (e) {
        console.error('載入每日報告失敗:', e);
    }
}

function renderAiReport(block, statusId, contentId, anomaliesId, status, reportText, anomalies, findings, showAnomalies) {
    const statusEl = document.getElementById(statusId);
    const contentEl = document.getElementById(contentId);
    const anomaliesEl = document.getElementById(anomaliesId);

    // findings 容器（在 anomalies 下方）
    let findingsEl = block.querySelector('.findings-section-wrap');
    if (!findingsEl) {
        findingsEl = document.createElement('div');
        findingsEl.className = 'findings-section-wrap';
        block.appendChild(findingsEl);
    }

    if (status === 'none') {
        block.style.display = '';
        statusEl.innerHTML = `<p class="ai-report-status muted">${i18n.t('cdv.reportNotGenerated')}</p>`;
        contentEl.innerHTML = '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        findingsEl.innerHTML = '';
        return;
    }
    if (status === 'generating') {
        block.style.display = '';
        statusEl.innerHTML = `<p class="ai-report-status generating">${i18n.t('cdv.reportGenerating')}</p>`;
        contentEl.innerHTML = '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        findingsEl.innerHTML = '';
        return;
    }
    if (status === 'failed') {
        block.style.display = '';
        statusEl.innerHTML = `<p class="ai-report-status failed">${i18n.t('cdv.reportFailed')}</p>`;
        contentEl.innerHTML = reportText ? `<p style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(reportText)}</p>` : '';
        if (anomaliesEl) anomaliesEl.innerHTML = '';
        findingsEl.innerHTML = '';
        return;
    }

    // status === 'done'
    block.style.display = '';
    statusEl.innerHTML = '';
    // 移除 report_text 末尾可能殘留的 JSON 陣列（AI 未正確分離時的安全網）
    let cleanText = (reportText || '').replace(/\n\s*\[\s*\{[\s\S]*\}\s*\]\s*$/, '').trim();
    contentEl.innerHTML = `<div class="report-text">${escapeHtml(cleanText).replace(/\n/g, '<br>')}</div>`;

    if (anomaliesEl && showAnomalies && anomalies && anomalies.length > 0) {
        const periodLabels = getPeriodLabels();
        anomaliesEl.innerHTML = `
            <div class="anomalies-section">
                <h4 class="anomalies-title">${i18n.t('cdv.anomalyCount', { count: anomalies.length })}</h4>
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

    // Findings（AI 證據鏈）
    if (showAnomalies && findings && findings.length > 0) {
        findingsEl.innerHTML = renderFindings(findings);
    } else {
        findingsEl.innerHTML = '';
    }
}

/** 渲染 AI findings 證據鏈卡片 */
function renderFindings(findings) {
    const severityColors = { high: '#FF3B30', medium: '#FF9500', low: '#34C759' };
    const severityLabels = {
        high: i18n.t('cdv.severityHigh'),
        medium: i18n.t('cdv.severityMedium'),
        low: i18n.t('cdv.severityLow'),
    };
    const typeLabels = {
        anomaly: i18n.t('cdv.typeAnomaly'),
        trend: i18n.t('cdv.typeTrend'),
        praise: i18n.t('cdv.typePraise'),
    };
    const typeIcons = { anomaly: '⚠️', trend: '📈', praise: '🌟' };

    const cards = findings.map((f, i) => {
        const sev = f.severity || 'medium';
        const ftype = f.finding_type || 'anomaly';
        const evidenceHtml = (f.evidence || []).map(ev => {
            const entryLink = ev.entry_id
                ? `<a href="#" class="evidence-link" onclick="showEvidenceEntry(${ev.entry_id});return false;">[#${ev.entry_id}]</a>`
                : '';
            return `<div class="evidence-item">
                ${entryLink}
                <span>${escapeHtml(ev.class_code || '')} ${escapeHtml(ev.date || '')} ${escapeHtml(ev.field || '')}: ${escapeHtml(String(ev.value || ''))}</span>
            </div>`;
        }).join('');

        return `
        <div class="finding-card" data-severity="${sev}">
            <div class="finding-header">
                <span class="finding-type">${typeIcons[ftype] || '📋'} ${typeLabels[ftype] || ftype}</span>
                <span class="finding-severity" style="background:${severityColors[sev] || '#999'}">${severityLabels[sev] || sev}</span>
            </div>
            <div class="finding-desc">${escapeHtml(f.description || '')}</div>
            ${evidenceHtml ? `<div class="finding-evidence">${evidenceHtml}</div>` : ''}
            ${f.recommendation ? `<div class="finding-recommendation">💡 ${escapeHtml(f.recommendation)}</div>` : ''}
        </div>`;
    }).join('');

    return `
        <div class="findings-section">
            <h4 class="findings-title">${i18n.t('cdv.findingsCount', { count: findings.length })}</h4>
            <div class="findings-grid">${cards}</div>
        </div>`;
}

/** 顯示證據記錄詳情（從 dashboardEntries 中查找） */
function showEvidenceEntry(entryId) {
    const entry = (dashboardEntries || []).find(e => e.id === entryId);
    if (!entry) {
        alert(i18n.t('cdv.evidenceEntryNotFound', { id: entryId }));
        return;
    }
    // 復用現有的 detail modal
    const periodLabels = getPeriodLabels();
    const psLabel = periodLabels[entry.period_start] || entry.period_start;
    const peLabel = periodLabels[entry.period_end] || entry.period_end;
    const title = `${entry.class_code} ${psLabel}-${peLabel} ${entry.subject}`;
    const body = document.getElementById('detailModalBody');
    body.innerHTML = `
        <table class="entries-table" style="width:100%;">
            <tr><th>${i18n.t('cdv.thDiscipline')}</th><td>${'★'.repeat(entry.discipline_rating || 0)}${'☆'.repeat(5-(entry.discipline_rating||0))}</td></tr>
            <tr><th>${i18n.t('cdv.thCleanliness')}</th><td>${'★'.repeat(entry.cleanliness_rating || 0)}${'☆'.repeat(5-(entry.cleanliness_rating||0))}</td></tr>
            <tr><th>${i18n.t('cdv.thAbsent')}</th><td>${escapeHtml(entry.absent_students || '-')}</td></tr>
            <tr><th>${i18n.t('cdv.thLate')}</th><td>${escapeHtml(entry.late_students || '-')}</td></tr>
            <tr><th>${i18n.t('cdv.thPraise')}</th><td>${escapeHtml(entry.commended_students || '-')}</td></tr>
            <tr><th>${i18n.t('cdv.thViolation')}</th><td>${escapeHtml(entry.rule_violations || '-')}</td></tr>
            <tr><th>${i18n.t('cdv.thMedical')}</th><td>${escapeHtml(entry.medical_room_students || '-')}</td></tr>
        </table>`;
    document.getElementById('detailModalTitle').textContent = title;
    document.getElementById('detailModal').classList.add('show');
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
            if (!resp.ok) throw new Error(i18n.t('cdv.exportFail'));
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
        `${i18n.t('cdv.diaryExportPrefix')}_${dateVal}.xlsx`
    ).catch(err => alert(i18n.t('cdv.exportFail') + ': ' + err.message));
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
    if (!startDate || !endDate) { alert(i18n.t('cdv.selectStartEnd')); return; }
    if (startDate > endDate) { alert(i18n.t('cdv.startAfterEnd')); return; }

    const btn = document.getElementById('rangeConfirmBtn');
    btn.textContent = i18n.t('cdv.exporting');
    btn.disabled = true;

    _downloadBlob(
        `/api/class-diary/review/export-range?start_date=${startDate}&end_date=${endDate}`,
        `${i18n.t('cdv.diaryExportPrefix')}_${startDate}_${i18n.t('cdv.diaryExportRangeSuffix')}_${endDate}.xlsx`
    )
        .then(() => closeRangeModal())
        .catch(err => alert(i18n.t('cdv.exportFail') + ': ' + err.message))
        .finally(() => { btn.textContent = i18n.t('cdv.export'); btn.disabled = false; });
}


/* ============================================================
   篩選事件
   ============================================================ */
function onFilterChange() {
    if (reviewState.dateMode === 'single') {
        loadDailyReport();
        loadSummary();
        loadSubmissionGaps();
    }
}


/* ============================================================
   提交狀況監控
   ============================================================ */
async function loadSubmissionGaps() {
    const section = document.getElementById('submissionGapsSection');
    if (!section) return;

    // 僅 reviewer/admin 可見
    if (reviewState.permissionTier !== 'admin' && reviewState.permissionTier !== 'reviewer') {
        section.style.display = 'none';
        return;
    }

    const dateVal = document.getElementById('filterDate').value;
    try {
        const data = await APIClient.get(`/api/class-diary/review/submission-gaps?entry_date=${dateVal}`);
        if (data.success && data.data) {
            section.style.display = '';
            renderSubmissionGaps(data.data);
        }
    } catch (e) {
        console.warn('載入提交狀況失敗:', e);
        section.style.display = 'none';
    }
}

function renderSubmissionGaps(data) {
    const cardsEl = document.getElementById('gapsCards');
    const gridEl = document.getElementById('gapsGrid');

    // 概覽卡片
    const pct = data.total_classes > 0
        ? Math.round(data.fully_submitted / data.total_classes * 100)
        : 0;
    const pctColor = pct >= 80 ? 'var(--brand)' : pct >= 50 ? 'var(--warning)' : 'var(--danger)';
    cardsEl.innerHTML = `
        <div class="dash-card"><div class="dash-card-value" style="color:${pctColor}">${pct}%</div><div class="dash-card-label">${i18n.t('cdv.completionRate')}</div></div>
        <div class="dash-card"><div class="dash-card-value">${data.fully_submitted}</div><div class="dash-card-label">${i18n.t('cdv.fullySubmitted')}</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${data.partially_submitted > 0 ? 'var(--warning)' : ''}">${data.partially_submitted}</div><div class="dash-card-label">${i18n.t('cdv.partiallySubmitted')}</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${data.not_submitted > 0 ? 'var(--danger)' : ''}">${data.not_submitted}</div><div class="dash-card-label">${i18n.t('cdv.notSubmitted')}</div></div>
    `;

    // 班級×節次網格
    if (!data.gaps || data.gaps.length === 0) {
        gridEl.innerHTML = '';
        return;
    }

    const periodLabels = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
    let html = `<table class="gaps-table"><thead><tr><th>${i18n.t('cdv.gapsClass')}</th>`;
    periodLabels.forEach((p, i) => { html += `<th>${p}</th>`; });
    html += `<th>${i18n.t('cdv.gapsSubmitted')}</th></tr></thead><tbody>`;

    data.gaps.forEach(g => {
        const submitted = new Set(g.submitted_periods);
        const total = g.total_expected;
        html += `<tr><td><strong>${escapeHtml(g.class_code)}</strong></td>`;
        for (let p = 1; p <= total; p++) {
            if (submitted.has(p)) {
                html += '<td class="gap-ok">✓</td>';
            } else {
                html += '<td class="gap-missing">✗</td>';
            }
        }
        html += `<td>${g.submitted_count}/${total}</td></tr>`;
    });

    html += '</tbody></table>';
    gridEl.innerHTML = html;
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
    if (!confirm(i18n.t('cdv.confirmDelete'))) return;
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
            alert(i18n.t('cdv.deleteFail') + (data.error?.message || data.detail || i18n.t('cdv.unknownError')));
        }
    } catch (err) {
        alert(i18n.t('cdv.deleteFail') + err.message);
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
            <div class="dash-card-label">${i18n.t('cdv.recordsSlashClasses')}</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-value" style="color:${ratingColor(avgDisc)}">${avgDisc}</div>
            <div class="dash-card-label">${i18n.t('cdv.avgDiscipline')}</div>
        </div>
        <div class="dash-card">
            <div class="dash-card-value" style="color:${ratingColor(avgClean)}">${avgClean}</div>
            <div class="dash-card-label">${i18n.t('cdv.avgCleanliness')}</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('attendance')">
            <div class="dash-card-value">${absentCount} / ${lateCount}</div>
            <div class="dash-card-label">${i18n.t('cdv.absentSlashLate')}</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('violation')">
            <div class="dash-card-value" style="color:${violationCount > 0 ? 'var(--warning)' : ''}">${violationCount}</div>
            <div class="dash-card-label">${i18n.t('cdv.violationEvents')}</div>
        </div>
        <div class="dash-card clickable" onclick="showStudentDetail('medical')">
            <div class="dash-card-value" style="color:${medicalCount > 0 ? 'var(--info)' : ''}">${medicalCount}</div>
            <div class="dash-card-label">${i18n.t('cdv.medicalRoom')}</div>
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

    let html = `<div class="dash-chart-title">${i18n.t('cdv.classRanking')}</div>`;
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
    html += `<div class="dash-bar-legend"><span><span class="legend-dot discipline"></span>${i18n.t('cdv.legendDiscipline')}</span><span><span class="legend-dot cleanliness"></span>${i18n.t('cdv.legendCleanliness')}</span></div>`;
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
    if (violationTop.length > 0) html += renderBehaviorGroup(i18n.t('cdv.violationReasons'), violationTop, 'violation');
    if (praiseTop.length > 0) html += renderBehaviorGroup(i18n.t('cdv.praiseReasons'), praiseTop, 'praise');
    if (medicalTop.length > 0) html += renderBehaviorGroup(i18n.t('cdv.medicalReasons'), medicalTop, 'medical');
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
                    <span class="dash-behavior-count">${i18n.t('cdv.personCount', { count: item.count })}</span>
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
            const otherKey = i18n.t('cdv.other');
            if (!map[code][otherKey]) map[code][otherKey] = new Set();
            map[code][otherKey].add(val.trim());
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
        titleEl.textContent = i18n.t('cdv.attendanceTitle');
        html += renderAttendanceSection(i18n.t('cdv.absentStudents'), groupAttendanceByClass(dashboardEntries, 'absent_students'));
        html += renderAttendanceSection(i18n.t('cdv.lateStudents'), groupAttendanceByClass(dashboardEntries, 'late_students'));
    } else if (type === 'violation') {
        titleEl.textContent = i18n.t('cdv.violationTitle');
        html = renderBehaviorDetail(groupBehaviorByClass(dashboardEntries, ['rule_violations', 'appearance_issues']));
    } else if (type === 'medical') {
        titleEl.textContent = i18n.t('cdv.medicalTitle');
        html = renderBehaviorDetail(groupBehaviorByClass(dashboardEntries, 'medical_room_students'));
    }

    bodyEl.innerHTML = html.trim() || `<p class="detail-empty">${i18n.t('cdv.noDetail')}</p>`;
    modal.classList.add('show');
}

function renderAttendanceSection(title, map) {
    const classes = Object.keys(map).sort();
    if (classes.length === 0) return '';
    const total = classes.reduce((s, c) => s + map[c].length, 0);
    let html = `<div class="detail-section"><div class="detail-section-title">${escapeHtml(title)} (${i18n.t('cdv.personTotal', { count: total })})</div>`;
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
    document.getElementById('rangeCards').innerHTML = `<div class="loading-text">${i18n.t('cdv.loading')}</div>`;

    try {
        const data = await APIClient.get(
            `/api/class-diary/review/dashboard-data?mode=date_range&start_date=${startDate}&end_date=${endDate}`
        );
        if (!data.success || !data.data) {
            document.getElementById('rangeCards').innerHTML = `<div class="chart-empty">${i18n.t('cdv.loadFail')}</div>`;
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
        document.getElementById('rangeCards').innerHTML = `<div class="chart-empty">${i18n.t('cdv.loadFail')}</div>`;
    }
}

function renderRangeOverviewCards(ov) {
    const container = document.getElementById('rangeCards');
    if (!ov || !ov.total_entries) {
        container.innerHTML = `<div class="chart-empty">${i18n.t('cdv.noRangeData')}</div>`;
        return;
    }

    const avgDisc = ov.avg_discipline || '-';
    const avgClean = ov.avg_cleanliness || '-';

    container.innerHTML = `
        <div class="dash-card"><div class="dash-card-value">${ov.total_entries}</div><div class="dash-card-label">${i18n.t('cdv.totalRecords')}</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_dates || '-'}</div><div class="dash-card-label">${i18n.t('cdv.days')}</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_classes || '-'}</div><div class="dash-card-label">${i18n.t('cdv.classCount')}</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${ratingColor(avgDisc)}">${avgDisc}</div><div class="dash-card-label">${i18n.t('cdv.avgDiscipline')}</div></div>
        <div class="dash-card"><div class="dash-card-value" style="color:${ratingColor(avgClean)}">${avgClean}</div><div class="dash-card-label">${i18n.t('cdv.avgCleanliness')}</div></div>
        <div class="dash-card"><div class="dash-card-value">${ov.total_absent || 0} / ${ov.total_late || 0}</div><div class="dash-card-label">${i18n.t('cdv.absentSlashLate')}</div></div>
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
                { label: i18n.t('cdv.labelDiscipline'), data: disc, borderColor: CHART_COLORS.brand, backgroundColor: CHART_COLORS.brandLight, tension: 0.3, yAxisID: 'y' },
                { label: i18n.t('cdv.labelCleanliness'), data: clean, borderColor: CHART_COLORS.blue, backgroundColor: CHART_COLORS.blueLight, tension: 0.3, yAxisID: 'y' },
                { label: i18n.t('cdv.labelDisc7MA'), data: ma7disc, borderColor: CHART_COLORS.brand, borderDash: [5,5], pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: i18n.t('cdv.labelClean7MA'), data: ma7clean, borderColor: CHART_COLORS.blue, borderDash: [5,5], pointRadius: 0, tension: 0.3, yAxisID: 'y' },
                { label: i18n.t('cdv.labelViolations'), data: violations, type: 'bar', backgroundColor: CHART_COLORS.orangeLight, borderColor: CHART_COLORS.orange, yAxisID: 'y1' },
            ],
        },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
                y: { min: 0, max: 5, title: { display: true, text: i18n.t('cdv.chartRating') } },
                y1: { position: 'right', min: 0, grid: { drawOnChartArea: false }, title: { display: true, text: i18n.t('cdv.chartViolations') } },
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

    const plabels = getPeriodLabels();
    const labels = periodAnalysis.map(p => p.period_label || plabels[p.period] || `${p.period}`);
    const disc = periodAnalysis.map(p => p.avg_discipline);
    const colors = disc.map(d => d >= 4 ? CHART_COLORS.brand : d >= 3 ? CHART_COLORS.orange : CHART_COLORS.red);

    reviewState.charts.period = new Chart(canvas, {
        type: 'bar',
        data: {
            labels,
            datasets: [{ label: i18n.t('cdv.chartAvgDiscipline'), data: disc, backgroundColor: colors }],
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
                { label: i18n.t('cdv.labelDiscipline'), data: disc, borderColor: CHART_COLORS.brand, backgroundColor: CHART_COLORS.brandLight },
                { label: i18n.t('cdv.labelCleanliness'), data: clean, borderColor: CHART_COLORS.blue, backgroundColor: CHART_COLORS.blueLight },
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
            datasets: [{ label: i18n.t('cdv.chartRecordCount'), data: counts, backgroundColor: colors }],
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        afterLabel: (ctx) => i18n.t('cdv.chartAvgDisciplineTooltip', { val: disc[ctx.dataIndex] }),
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
        table.innerHTML = `<tr><td colspan="10" class="chart-empty">${i18n.t('cdv.noStudentRecords')}</td></tr>`;
        return;
    }

    let html = `<thead><tr>
        <th>${i18n.t('cdv.thStudent')}</th><th>${i18n.t('cdv.thClass')}</th>
        <th>${i18n.t('cdv.thAbsentCount')}</th><th>${i18n.t('cdv.thAbsentDates')}</th>
        <th>${i18n.t('cdv.thLateCount')}</th><th>${i18n.t('cdv.thLateDates')}</th>
        <th>${i18n.t('cdv.thViolationCount')}</th><th>${i18n.t('cdv.thViolationDates')}</th>
        <th>${i18n.t('cdv.thMedicalCount')}</th><th>${i18n.t('cdv.thMedicalDates')}</th>
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
        table.innerHTML = `<tr><td colspan="11" class="chart-empty">${i18n.t('cdv.noRiskStudents')}</td></tr>`;
        return;
    }

    let html = `<thead><tr>
        <th>${i18n.t('cdv.thStudent')}</th><th>${i18n.t('cdv.thClass')}</th><th>${i18n.t('cdv.thTotalIncidents')}</th>
        <th>${i18n.t('cdv.thViolation')}</th><th>${i18n.t('cdv.thAbsent')}</th><th>${i18n.t('cdv.thLate')}</th><th>${i18n.t('cdv.thMedical')}</th>
        <th>${i18n.t('cdv.thFirstRecord')}</th><th>${i18n.t('cdv.thLastRecord')}</th><th>${i18n.t('cdv.thInvolvedDays')}</th><th>${i18n.t('cdv.thRiskFlags')}</th>
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

        const { report_text, anomalies, findings, status, is_reviewer } = data.data;
        const block = document.getElementById('rangeAiSection');
        renderAiReport(block, 'rangeReportStatus', 'rangeReportContent', 'rangeAnomalies',
            status, report_text, anomalies, findings || [], is_reviewer);
    } catch (e) {
        console.error('載入範圍報告失敗:', e);
    }
}

async function generateRangeReport() {
    const start = reviewState.rangeStart;
    const end = reviewState.rangeEnd;
    if (!start || !end) return;

    const btn = document.getElementById('generateRangeReportBtn');
    btn.textContent = i18n.t('cdv.rangeReportGenerating');
    btn.disabled = true;

    try {
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        const resp = await fetch('/api/class-diary/admin/generate-range-report', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ start_date: start, end_date: end }),
        });
        const result = await resp.json();
        const taskId = result?.data?.task_id;

        document.getElementById('rangeReportStatus').innerHTML =
            `<p class="ai-report-status generating">${i18n.t('cdv.rangeReportGenerating')}</p>`;

        if (taskId) {
            pollTaskAndReload(taskId, () => loadRangeReport(start, end), btn);
        }
    } catch (e) {
        alert(i18n.t('cdv.generateReportFail') + e.message);
        btn.textContent = i18n.t('cdv.generateAiReport');
        btn.disabled = false;
    }
}

/** 輪詢任務狀態，完成後執行 callback */
function pollTaskAndReload(taskId, onDone, btn, interval = 3000, maxTries = 60) {
    let tries = 0;
    const timer = setInterval(async () => {
        tries++;
        try {
            const data = await APIClient.get(`/api/class-diary/tasks/${taskId}`);
            if (!data.success) { clearInterval(timer); return; }

            const task = data.data;
            if (task.status === 'done') {
                clearInterval(timer);
                if (btn) { btn.textContent = i18n.t('cdv.generateAiReport'); btn.disabled = false; }
                if (onDone) onDone();
            } else if (task.status === 'failed') {
                clearInterval(timer);
                if (btn) { btn.textContent = i18n.t('cdv.generateAiReport'); btn.disabled = false; }
                alert(i18n.t('cdv.taskFail') + (task.error || i18n.t('cdv.unknownError')));
            }
        } catch (_) { /* ignore network blip */ }

        if (tries >= maxTries) {
            clearInterval(timer);
            if (btn) { btn.textContent = i18n.t('cdv.generateAiReport'); btn.disabled = false; }
        }
    }, interval);
}
