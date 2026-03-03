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
};

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
            document.getElementById('userBadge').textContent =
                `${profile.data.display_name || profile.data.username} (${profile.data.role})`;
        }
    } catch (e) { /* 忽略 */ }

    // 綁定篩選事件
    document.getElementById('filterDate').addEventListener('change', onFilterChange);
    document.getElementById('filterClass').addEventListener('change', onFilterChange);

    // 載入數據
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

    body.innerHTML = entries.map(e => {
        const periodText = e.period_start === e.period_end
            ? periodLabels[e.period_start] || `${e.period_start}`
            : `${periodLabels[e.period_start]} → ${periodLabels[e.period_end]}`;

        const discStars = renderMiniStars(e.discipline_rating);
        const cleanStars = renderMiniStars(e.cleanliness_rating);

        const sigHtml = e.signature && typeof e.signature === 'string' && e.signature.startsWith('data:')
            ? `<img class="sig-thumb" src="${e.signature}" onclick="showSignature('${e.id}')" title="點擊查看">`
            : (e.signature ? '<span style="color:var(--success)">✅</span>' : '<span style="color:var(--gray-300)">—</span>');

        return `
            <tr>
                <td><span class="period-badge">${periodText}</span></td>
                <td><strong>${escapeHtml(e.subject)}</strong></td>
                <td><span class="mini-stars">${discStars}</span></td>
                <td><span class="mini-stars">${cleanStars}</span></td>
                <td class="cell-text" title="${escapeHtml(e.absent_students || '')}">${escapeHtml(e.absent_students || '') || '—'}</td>
                <td class="cell-text" title="${escapeHtml(e.late_students || '')}">${escapeHtml(e.late_students || '') || '—'}</td>
                <td class="cell-text" title="${escapeHtml(e.commended_students || '')}">${escapeHtml(e.commended_students || '') || '—'}</td>
                <td class="cell-text" title="${escapeHtml((e.appearance_issues || '') + ' ' + (e.rule_violations || ''))}">${escapeHtml(e.appearance_issues || e.rule_violations || '') || '—'}</td>
                <td>${sigHtml}</td>
            </tr>
        `;
    }).join('');
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
   篩選事件
   ============================================================ */
function onFilterChange() {
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
