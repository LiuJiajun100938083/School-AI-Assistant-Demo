/**
 * 課室日誌 — Review 頁面
 * 需登入 + reviewer/admin 權限
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
};

/** 儀表板全量 entries（供彈窗使用） */
let dashboardEntries = [];

/* ============================================================
   初始化
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
    // 檢查登入
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

    // 先載入報告（設定 isRecipient），再載入數據（儀表板需知道是否渲染到報告區）
    await loadDailyReport();
    await loadSummary();
});


/* ============================================================
   權限檢查
   ============================================================ */
async function checkAccess(token) {
    try {
        const resp = await fetch('/api/class-diary/review/check-access', {
            headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await resp.json();
        return data.success && data.data && data.data.has_access;
    } catch (e) {
        return false;
    }
}


/* ============================================================
   載入匯總
   ============================================================ */
async function loadSummary() {
    const dateVal = document.getElementById('filterDate').value;
    reviewState.currentDate = dateVal;

    try {
        const data = await APIClient.get(`/api/class-diary/review/classes?entry_date=${dateVal}`);

        if (data.success && data.data) {
            renderSummaryCards(data.data);

            // 更新班級下拉
            updateClassFilter(data.data);

            // 載入儀表板
            loadDashboard();

            // 如果有選中的班級，載入詳細記錄
            const classFilter = document.getElementById('filterClass').value;
            if (classFilter) {
                await loadEntries(classFilter);
            } else if (data.data.length > 0) {
                // 默認顯示第一個班的記錄
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
    reviewState.currentClass = classCode || '';

    // 高亮對應卡片
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

    // 動態添加操作列表頭
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

        // 顯示匯出按鈕（reviewer 或 admin）
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn && is_reviewer) {
            exportBtn.style.display = '';
        }

        // AI 報告區塊（在儀表板內）
        const block = document.getElementById('aiReportBlock');
        if (!block) return;

        // 非接收人/reviewer → 隱藏報告區塊
        if (!is_recipient && !is_reviewer) {
            block.style.display = 'none';
            return;
        }

        const statusEl = document.getElementById('dailyReportStatus');
        const contentEl = document.getElementById('dailyReportContent');
        const anomaliesEl = document.getElementById('dailyAnomalies');

        if (status === 'none') {
            block.style.display = '';
            statusEl.innerHTML = '<p class="ai-report-status muted">該日期尚未生成 AI 報告。</p>';
            contentEl.innerHTML = '';
            anomaliesEl.innerHTML = '';
            return;
        }

        if (status === 'generating') {
            block.style.display = '';
            statusEl.innerHTML = '<p class="ai-report-status generating">報告生成中，請稍候刷新...</p>';
            contentEl.innerHTML = '';
            anomaliesEl.innerHTML = '';
            return;
        }

        if (status === 'failed') {
            block.style.display = '';
            statusEl.innerHTML = '<p class="ai-report-status failed">報告生成失敗</p>';
            contentEl.innerHTML = report_text ? `<p style="color:var(--text-secondary);font-size:0.85rem;">${escapeHtml(report_text)}</p>` : '';
            anomaliesEl.innerHTML = '';
            return;
        }

        // status === 'done'
        block.style.display = '';
        statusEl.innerHTML = '';

        // 渲染 AI 報告文本（保留換行）
        contentEl.innerHTML = `<div class="report-text">${escapeHtml(report_text || '').replace(/\n/g, '<br>')}</div>`;

        // 渲染異常列表
        if (anomalies && anomalies.length > 0) {
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
        } else {
            anomaliesEl.innerHTML = '';
        }

    } catch (e) {
        console.error('載入每日報告失敗:', e);
    }
}


/* ============================================================
   匯出 CSV
   ============================================================ */
function exportCSV() {
    const dateVal = document.getElementById('filterDate').value;
    const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
    // 直接觸發下載
    const url = `/api/class-diary/review/export?entry_date=${dateVal}`;
    const a = document.createElement('a');
    a.href = url;
    // 使用 fetch 帶 token 下載
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(resp => {
            if (!resp.ok) throw new Error('匯出失敗');
            return resp.blob();
        })
        .then(blob => {
            const blobUrl = URL.createObjectURL(blob);
            const dl = document.createElement('a');
            dl.href = blobUrl;
            dl.download = `class_diary_${dateVal}.csv`;
            document.body.appendChild(dl);
            dl.click();
            document.body.removeChild(dl);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        })
        .catch(err => alert('匯出失敗: ' + err.message));
}


/* ============================================================
   篩選事件
   ============================================================ */
function onFilterChange() {
    loadDailyReport();
    loadSummary();
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


/**
 * Format a behavior field (commended/violations/medical) for display.
 * Handles both new JSON format and legacy plain-text format.
 */
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
    } catch (e) {
        // Not JSON — legacy format
    }
    return escapeHtml(value);
}


/* ============================================================
   可展開文字
   ============================================================ */
let _cellId = 0;

/**
 * 渲染普通文字欄位（缺席/遲到等），支持展開/收起
 */
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

/**
 * 渲染行為欄位（JSON 格式結構化展開，舊格式純文字展開）
 * 支持多個 value 用 ||| 連接（如違規+儀表合併）
 */
function renderBehaviorCell(value) {
    if (!value || !value.trim()) return '—';

    // 處理可能的多字段合併
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

    if (shortText.length <= 20 && parts.length <= 1) {
        return escapeHtml(shortText);
    }

    const id = 'cell-' + (++_cellId);
    return `<div class="cell-expandable" id="${id}" onclick="toggleCellExpand('${id}')">
        <span class="cell-truncated">${escapeHtml(shortText)}<span class="expand-icon">▸</span></span>
        <span class="cell-full">${fullHtml}</span>
    </div>`;
}

/**
 * 切換展開/收起
 */
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
            // 重新載入
            onFilterChange();
        } else {
            alert('刪除失敗：' + (data.error?.message || data.detail || '未知錯誤'));
        }
    } catch (err) {
        alert('刪除失敗：' + err.message);
    }
}


/* ============================================================
   儀表板
   ============================================================ */

async function loadDashboard() {
    const dateVal = document.getElementById('filterDate').value;
    try {
        // 載入全量數據（不帶 class_code 篩選）
        const data = await APIClient.get(`/api/class-diary/review?entry_date=${dateVal}`);
        if (!data.success || !data.data || data.data.length === 0) {
            // 即使沒有記錄，報告接收人/reviewer 仍需看到概覽（含 AI 報告）
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
        renderClassComparison(entries);
        renderBehaviorBreakdown(entries);
    } catch (e) {
        console.error('載入儀表板失敗:', e);
        document.getElementById('dashboardSection').style.display = 'none';
    }
}

function toggleDashboard() {
    document.getElementById('dashboardSection').classList.toggle('collapsed');
}

/**
 * 渲染 6 張概覽卡片
 */
function renderDashCards(entries) {
    const container = document.getElementById('dashCards');
    const totalEntries = entries.length;
    const classSet = new Set(entries.map(e => e.class_code));
    const totalClasses = classSet.size;

    // 平均紀律/整潔
    const avgDisc = (entries.reduce((s, e) => s + (e.discipline_rating || 0), 0) / totalEntries).toFixed(1);
    const avgClean = (entries.reduce((s, e) => s + (e.cleanliness_rating || 0), 0) / totalEntries).toFixed(1);

    // 缺席/遲到人次
    const absentCount = entries.reduce((s, e) => s + countStudents(e.absent_students), 0);
    const lateCount = entries.reduce((s, e) => s + countStudents(e.late_students), 0);

    // 違規事件人次
    const violationCount = entries.reduce((s, e) =>
        s + countBehaviorStudents(e.rule_violations) + countBehaviorStudents(e.appearance_issues), 0);

    // 醫務室人次
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

/**
 * 渲染班級紀律/整潔排名條形圖
 */
function renderClassComparison(entries) {
    const container = document.getElementById('dashClassChart');

    // 按班級聚合
    const classMap = {};
    entries.forEach(e => {
        if (!classMap[e.class_code]) {
            classMap[e.class_code] = { disc: [], clean: [] };
        }
        classMap[e.class_code].disc.push(e.discipline_rating || 0);
        classMap[e.class_code].clean.push(e.cleanliness_rating || 0);
    });

    // 計算平均值並按紀律排名
    const classStats = Object.entries(classMap).map(([code, data]) => ({
        code,
        avgDisc: (data.disc.reduce((a, b) => a + b, 0) / data.disc.length).toFixed(1),
        avgClean: (data.clean.reduce((a, b) => a + b, 0) / data.clean.length).toFixed(1),
    })).sort((a, b) => b.avgDisc - a.avgDisc);

    if (classStats.length === 0) {
        container.innerHTML = '';
        return;
    }

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

    html += `
        <div class="dash-bar-legend">
            <span><span class="legend-dot discipline"></span>紀律</span>
            <span><span class="legend-dot cleanliness"></span>整潔</span>
        </div>
    `;

    container.innerHTML = html;
}

/**
 * 渲染行為原因 Top 5 分析
 */
function renderBehaviorBreakdown(entries) {
    const container = document.getElementById('dashBehavior');

    const praiseAcc = {};
    const violationAcc = {};
    const medicalAcc = {};

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

    if (violationTop.length > 0) {
        html += renderBehaviorGroup('違規原因', violationTop, 'violation');
    }
    if (praiseTop.length > 0) {
        html += renderBehaviorGroup('嘉許原因', praiseTop, 'praise');
    }
    if (medicalTop.length > 0) {
        html += renderBehaviorGroup('醫務室原因', medicalTop, 'medical');
    }

    container.innerHTML = html;
}

function renderBehaviorGroup(title, items, cssClass) {
    const maxCount = Math.max(...items.map(i => i.count), 1);
    return `
        <div class="dash-behavior-group">
            <div class="dash-behavior-title">${title}</div>
            ${items.map(item => {
                const pct = (item.count / maxCount * 100).toFixed(0);
                return `
                    <div class="dash-behavior-item">
                        <span class="dash-behavior-name">${escapeHtml(item.reason)}</span>
                        <div class="dash-mini-bar-track">
                            <div class="dash-mini-bar ${cssClass}" style="width:${pct}%"></div>
                        </div>
                        <span class="dash-behavior-count">${item.count}人</span>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}


/* ============================================================
   儀表板輔助函數
   ============================================================ */

/** 計數逗號/頓號分隔的學生人次 */
function countStudents(value) {
    if (!value || !value.trim()) return 0;
    return value.split(/[、，,；;／/\n]+/).filter(s => s.trim()).length;
}

/** 計數行為欄位的學生人次（JSON 或舊格式） */
function countBehaviorStudents(value) {
    if (!value || !value.trim()) return 0;
    try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) {
            return parsed.reduce((sum, item) =>
                sum + (item.students ? item.students.length : 0), 0);
        }
    } catch (e) { /* not JSON */ }
    // 舊格式：算 1
    return 1;
}

/** 聚合行為原因到累加器（{reason: count}） */
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
    // 舊格式不參與原因排名
}

/** 從累加器取 Top N 原因 */
function getTopReasons(acc, n) {
    return Object.entries(acc)
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, n);
}

/** 根據評分返回顏色 */
function ratingColor(rating) {
    const r = parseFloat(rating);
    if (r >= 4) return 'var(--brand)';
    if (r >= 3) return 'var(--warning)';
    return 'var(--danger)';
}


/* ============================================================
   儀表板卡片點擊 — 學生明細彈窗
   ============================================================ */

/** 分割姓名字串 */
function parseStudentNames(value) {
    if (!value || !value.trim()) return [];
    return value.split(/[、，,；;／/\n]+/).map(s => s.trim()).filter(Boolean);
}

/** 按班級分組提取考勤學生 {classCode: [name]} */
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

/** 按班級+原因分組行為學生 {classCode: [{reason, students:[]}]} */
function groupBehaviorByClass(entries, fields) {
    const map = {}; // classCode → {reason → Set(students)}
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
            // 舊格式純文字
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
        const absentMap = groupAttendanceByClass(dashboardEntries, 'absent_students');
        const lateMap = groupAttendanceByClass(dashboardEntries, 'late_students');
        html += renderAttendanceSection('缺席學生', absentMap);
        html += renderAttendanceSection('遲到學生', lateMap);
    } else if (type === 'violation') {
        titleEl.textContent = '違規事件';
        const map = groupBehaviorByClass(dashboardEntries, ['rule_violations', 'appearance_issues']);
        html = renderBehaviorDetail(map);
    } else if (type === 'medical') {
        titleEl.textContent = '醫務室';
        const map = groupBehaviorByClass(dashboardEntries, 'medical_room_students');
        html = renderBehaviorDetail(map);
    }

    if (!html.trim()) {
        html = '<p class="detail-empty">無記錄</p>';
    }

    bodyEl.innerHTML = html;
    modal.classList.add('show');
}

function renderAttendanceSection(title, map) {
    const classes = Object.keys(map).sort();
    if (classes.length === 0) return '';
    const total = classes.reduce((s, c) => s + map[c].length, 0);
    let html = `<div class="detail-section">
        <div class="detail-section-title">${escapeHtml(title)} (${total}人)</div>`;
    classes.forEach(code => {
        html += `<div class="detail-class-row">
            <span class="detail-class-label">${escapeHtml(code)}</span>
            <span class="detail-student-names">${map[code].map(n => escapeHtml(n)).join('、')}</span>
        </div>`;
    });
    html += '</div>';
    return html;
}

function renderBehaviorDetail(map) {
    const classes = Object.keys(map).sort();
    if (classes.length === 0) return '';
    let html = '';
    classes.forEach(code => {
        const reasons = map[code];
        html += `<div class="detail-class-group">
            <div class="detail-class-label">${escapeHtml(code)}</div>`;
        Object.entries(reasons).forEach(([reason, studentsSet]) => {
            const students = [...studentsSet];
            html += `<div class="detail-reason-row">
                <span class="detail-reason">${escapeHtml(reason)}：</span>
                <span class="detail-student-names">${students.map(s => escapeHtml(s)).join('、')}</span>
            </div>`;
        });
        html += '</div>';
    });
    return html;
}

function closeDetailModal() {
    document.getElementById('detailModal').classList.remove('show');
}
