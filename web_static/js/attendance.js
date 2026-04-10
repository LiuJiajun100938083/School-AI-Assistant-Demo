// ============ SVG 圖標常量 ============
const ATT = {
    check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    target: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>',
    note: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    users: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    edit: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
    trash: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>',
    folder: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
    sun: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>',
    download: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    settings: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    clipboard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>',
    book: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    save: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
    timer: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    idcard: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><line x1="7" y1="15" x2="13" y2="15"/></svg>',
    close: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    grad: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 1.1 2.7 3 6 3s6-1.9 6-3v-5"/></svg>',
    card: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>',
    checkin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
};

// ============ 即時時鐘功能 ============
let clockInterval = null;

// 啟動即時時鐘
function startLiveClock() {
    updateClock(); // 立即更新一次
    clockInterval = setInterval(updateClock, 1000);
}

// 停止即時時鐘
function stopLiveClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

// 更新時鐘顯示
function updateClock() {
    const now = new Date();
    const clockEl = document.getElementById('liveClock');
    const dateEl = document.getElementById('liveDate');

    if (clockEl) {
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        clockEl.textContent = `${hours}:${minutes}:${seconds}`;
    }

    if (dateEl) {
        const weekdays_zh = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const weekdays_en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        if (typeof i18n !== 'undefined' && i18n.isEn) {
            dateEl.textContent = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')} ${weekdays_en[now.getDay()]}`;
        } else {
            dateEl.textContent = `${year}年${month}月${day}日 ${weekdays_zh[now.getDay()]}`;
        }
    }
}


// ============ 晨讀紀錄排序功能 ============
let currentMorningRecords = [];
let morningSortField = 'class';  // 預設按班級排序
let morningSortOrder = 'asc';    // 預設升序
// 留堂原因選擇
let selectedDetentionReason = null;      // 拍卡簽到時選擇的原因
let selectedManualDetentionReason = null; // 手動簽到時選擇的原因

// 留堂原因映射
function getDetentionReasons() {
    return {
        'homework': i18n.t('att.reasonHomework'),
        'morning': i18n.t('att.reasonMorning'),
        'both': i18n.t('att.reasonBothFull')
    };
}

// 排序晨讀紀錄（點擊表頭方式）
function sortMorningRecords(field) {
    if (!currentMorningRecords.length) return;

    // 如果點擊同一列，切換排序順序
    if (field && morningSortField === field) {
        morningSortOrder = morningSortOrder === 'asc' ? 'desc' : 'asc';
    } else if (field) {
        morningSortField = field;
        morningSortOrder = 'asc';
    }

    let sortedRecords = [...currentMorningRecords];

    switch (morningSortField) {
        case 'time':
            sortedRecords.sort((a, b) => {
                const timeA = a.scan_time ? new Date(a.scan_time).getTime() : (morningSortOrder === 'asc' ? Infinity : -Infinity);
                const timeB = b.scan_time ? new Date(b.scan_time).getTime() : (morningSortOrder === 'asc' ? Infinity : -Infinity);
                return morningSortOrder === 'asc' ? timeA - timeB : timeB - timeA;
            });
            break;

        case 'status': {
            const statusOrder = {'present': 1, 'late': 2, 'very_late': 3, 'absent': 4};
            sortedRecords.sort((a, b) => {
                const statusA = a.attendance_status || 'absent';
                const statusB = b.attendance_status || 'absent';
                const orderA = statusOrder[statusA] || 5;
                const orderB = statusOrder[statusB] || 5;
                return morningSortOrder === 'asc' ? orderA - orderB : orderB - orderA;
            });
            break;
        }

        case 'class':
        default:
            sortedRecords.sort((a, b) => {
                const classCompare = a.class_name.localeCompare(b.class_name);
                if (classCompare !== 0) {
                    return morningSortOrder === 'asc' ? classCompare : -classCompare;
                }
                const numCompare = (a.class_number || 0) - (b.class_number || 0);
                return morningSortOrder === 'asc' ? numCompare : -numCompare;
            });
            break;
    }

    renderSortedRecords(sortedRecords);
    updateMorningSortIndicators();
}

// 更新晨讀表頭排序指示器
function updateMorningSortIndicators() {
    const headers = document.querySelectorAll('#morningRecordsTable th.sortable');
    headers.forEach(th => {
        th.classList.remove('asc', 'desc');
    });

    if (morningSortField) {
        let count = 0;
        document.querySelectorAll('#morningRecordsTable th').forEach((th) => {
            if (th.classList.contains('sortable')) {
                if ((morningSortField === 'class' && count === 0) ||
                    (morningSortField === 'time' && count === 1) ||
                    (morningSortField === 'status' && count === 2)) {
                    th.classList.add(morningSortOrder);
                }
                count++;
            }
        });
    }
}

// 格式化遲到時間（晨讀用）
function formatLateTime(minutes, seconds) {
    if (minutes === 0 && seconds > 0) {
        return seconds + i18n.t('att.seconds');
    }
    return (minutes || 0) + i18n.t('att.minutesUnit');
}

// 渲染排序後的紀錄
function renderSortedRecords(students) {
    const tbody = document.getElementById('recordsBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => {
        const status = s.attendance_status || 'absent';
        const isRegistered = s.is_registered !== false;

        let statusText = {
            'present': i18n.t('att.statusOnTime'),
            'late': i18n.t('att.statusLate'),
            'very_late': i18n.t('att.statusVeryLate'),
            'absent': i18n.t('att.statusAbsent')
        }[status];

        const registeredTag = isRegistered ? '' : `<span class="unregistered-tag">${i18n.t('att.unregistered')}</span>`;
        const rowClass = isRegistered ? '' : 'unregistered-row';

        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : '-';

        return `
            <tr class="${rowClass}">
                <td>${s.class_name}-${s.class_number} ${registeredTag}</td>
                <td>${s.chinese_name}</td>
                <td>${scanTime}</td>
                <td><span class="status-badge ${status.replace('_', '-')}">${statusText}</span></td>
                <td class="hide-compact">${formatLateTime(s.late_minutes, s.late_seconds)}</td>
                <td class="hide-compact">${s.makeup_minutes || 0}${i18n.t('att.minutesUnit')}</td>
            </tr>
        `;
    }).join('');
}


// ============ 緊湊模式功能 ============
let isCompactMode = false;

// 切換緊湊模式
function toggleCompactMode() {
    isCompactMode = !isCompactMode;

    const recordsSection = document.querySelector('.records-section');
    const toggleBtn = document.getElementById('compactToggleBtn');

    if (recordsSection) {
        recordsSection.classList.toggle('compact-mode', isCompactMode);
    }

    if (toggleBtn) {
        toggleBtn.classList.toggle('active', isCompactMode);
        const textEl = toggleBtn.querySelector('.compact-text');
        if (textEl) {
            textEl.textContent = isCompactMode ? i18n.t('att.standard') : i18n.t('att.compact');
        }
    }

    // 儲存使用者偏好
    localStorage.setItem('attendance_compact_mode', isCompactMode);
}

// 恢復緊湊模式狀態
function restoreCompactMode() {
    const savedMode = localStorage.getItem('attendance_compact_mode') === 'true';
    if (savedMode) {
        isCompactMode = true;
        const recordsSection = document.querySelector('.records-section');
        const toggleBtn = document.getElementById('compactToggleBtn');

        if (recordsSection) {
            recordsSection.classList.add('compact-mode');
        }
        if (toggleBtn) {
            toggleBtn.classList.add('active');
            const textEl = toggleBtn.querySelector('.compact-text');
            if (textEl) {
                textEl.textContent = i18n.t('att.standard');
            }
        }
    }
}


// ========== Apple 風格左側面板切換功能 ==========
function toggleLeftPanel() {
    const panel = document.getElementById('leftPanel');
    const toggleBtn = document.getElementById('panelToggleBtn');

    if (!panel || !toggleBtn) return;

    // 添加觸覺反饋（如果支持）
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }

    // 切換狀態
    const isCollapsing = !panel.classList.contains('collapsed');

    // 添加過渡狀態 class
    panel.classList.add('transitioning');
    toggleBtn.classList.add('transitioning');

    // 執行切換
    panel.classList.toggle('collapsed');
    toggleBtn.classList.toggle('collapsed');

    // 動畫完成後移除過渡狀態
    setTimeout(() => {
        panel.classList.remove('transitioning');
        toggleBtn.classList.remove('transitioning');
    }, 500);

    // 儲存狀態到 localStorage
    localStorage.setItem('leftPanelCollapsed', panel.classList.contains('collapsed'));
}

// ========== Apple 風格簽到通知卡片 ==========

// 顯示簽到通知卡片
function showScanNotification(data) {
    const overlay = document.getElementById('scanNotificationOverlay');
    const card = document.getElementById('scanNotificationCard');

    if (!overlay || !card) return;

    // 清除之前的狀態類
    card.className = 'scan-notification-card';

    // 取得各元素
    const iconEl = document.getElementById('notificationIcon');
    const nameEl = document.getElementById('notificationName');
    const englishNameEl = document.getElementById('notificationEnglishName');
    const classTextEl = document.getElementById('notificationClassText');
    const statusEl = document.getElementById('notificationStatus');
    const timeEl = document.getElementById('notificationTime');
    const extraEl = document.getElementById('notificationExtra');

    if (data.success) {
        const student = data.student;
        const record = data.record;

        // 設定學生資訊
        nameEl.textContent = student.chinese_name;
        englishNameEl.textContent = student.english_name;
        classTextEl.textContent = `${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')}`;

        // 根據會話類型和狀態設定樣式
        if (currentSessionType === 'morning') {
            timeEl.textContent = i18n.t('att.checkInTimeValue', {time: record.scan_time});

            if (record.status === 'present') {
                iconEl.innerHTML = ATT.check;
                card.classList.add('status-present');
                statusEl.className = 'notification-status present';
                statusEl.textContent = i18n.t('att.onTimeCheckIn');
                extraEl.style.display = 'none';
            } else if (record.status === 'late') {
                iconEl.innerHTML = ATT.warning;
                card.classList.add('status-late');
                statusEl.className = 'notification-status late';
                statusEl.textContent = i18n.t('att.statusLate');
                extraEl.style.display = 'block';
                extraEl.innerHTML = i18n.t('att.lateNeedMakeup', {late: record.late_minutes, makeup: record.makeup_minutes});
            } else if (record.status === 'very_late') {
                iconEl.innerHTML = ATT.alert;
                card.classList.add('status-very-late');
                statusEl.className = 'notification-status very-late';
                statusEl.textContent = i18n.t('att.statusVeryLate');
                extraEl.style.display = 'block';
                extraEl.innerHTML = i18n.t('att.needMakeup', {makeup: record.makeup_minutes});
            }
        } else if (currentSessionType === 'activity') {
            // 課外活動模式
            card.classList.add('status-activity');
            statusEl.className = 'notification-status activity';

            if (data.action === 'checkout') {
                iconEl.innerHTML = ATT.logout;
                timeEl.textContent = i18n.t('att.checkOutTimeValue', {time: data.time || record.checkout_time});

                if (data.is_early) {
                    statusEl.textContent = i18n.t('att.statEarlyLeave');
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    extraEl.innerHTML = i18n.t('att.earlyLeaveMinutes', {minutes: data.early_minutes});
                } else {
                    statusEl.textContent = i18n.t('att.statNormalLeave');
                    extraEl.style.display = 'none';
                }
            } else {
                iconEl.innerHTML = ATT.target;
                timeEl.textContent = i18n.t('att.checkInTimeValue', {time: data.time || record.scan_time});

                if (data.is_late) {
                    statusEl.textContent = i18n.t('att.statusLate');
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    extraEl.innerHTML = i18n.t('att.lateMinutes', {minutes: data.late_minutes});
                } else {
                    statusEl.textContent = i18n.t('att.onTimeCheckIn');
                    extraEl.style.display = 'none';
                }
            }

        } else {
            // 留堂模式
            card.classList.add('status-detention');
            statusEl.className = 'notification-status detention';

            if (data.action === 'checkout') {
                iconEl.innerHTML = ATT.logout;
                timeEl.textContent = i18n.t('att.checkOutTimeValue', {time: record.checkout_time});

// 根據是否使用分鐘模式判斷完成狀態
                let isCompleted = false;
                if (record.planned_minutes != null) {
                    isCompleted = record.actual_minutes >= record.planned_minutes;
                } else {
                    isCompleted = record.actual_periods >= record.planned_periods;
                }

                if (isCompleted) {
                    statusEl.textContent = i18n.t('att.detentionCompleted');
                    extraEl.style.display = 'block';
                    if (record.planned_minutes != null) {
                        extraEl.innerHTML = i18n.t('att.completedMinutes', {minutes: record.actual_minutes});
                    } else {
                        extraEl.innerHTML = i18n.t('att.completedPeriods', {periods: record.actual_periods});
                    }
                } else {
                    statusEl.textContent = i18n.t('att.leftEarly');
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    if (record.planned_minutes != null) {
                        extraEl.innerHTML = i18n.t('att.plannedVsActualMin', {planned: record.planned_minutes, actual: record.actual_minutes});
                    } else {
                        extraEl.innerHTML = i18n.t('att.plannedVsActualPeriods', {planned: record.planned_periods, actual: record.actual_periods});
                    }
                }
            } else {
                iconEl.innerHTML = ATT.note;
                timeEl.textContent = i18n.t('att.checkInTimeValue', {time: record.scan_time});
                statusEl.textContent = i18n.t('att.detentionCheckIn');
                extraEl.style.display = 'block';
                extraEl.innerHTML = i18n.t('att.planPeriodsTill', {periods: record.planned_periods, time: record.planned_end_time});
            }
        }
    } else {
        // 錯誤狀態
        iconEl.innerHTML = ATT.error;
        nameEl.textContent = i18n.t('att.checkInFailed');
        englishNameEl.textContent = data.message || data.detail || i18n.t('att.unknownError');
        classTextEl.textContent = data.card_id ? i18n.t('att.cardNo', {id: data.card_id}) : i18n.t('att.unknownCard');
        card.classList.add('status-error');
        statusEl.className = 'notification-status error';
        statusEl.textContent = i18n.t('att.error');
        timeEl.textContent = '';
        extraEl.style.display = 'none';
    }

    // 觸發顯示動畫
    requestAnimationFrame(() => {
        card.classList.add('show');
    });

    // 播放音效反馈（如果支持）
    playNotificationSound(data.success ? (data.record?.status || 'present') : 'error');

    // 觸覺反饋
    if (navigator.vibrate) {
        if (data.success) {
            navigator.vibrate(data.record?.status === 'present' ? [50] : [50, 30, 50]);
        } else {
            navigator.vibrate([100, 50, 100]);
        }
    }

    // 自動隱藏
    const hideDelay = currentSessionType === 'detention' ? 500 : 500;

    setTimeout(() => {
        hideScanNotification();
    }, hideDelay);
}

// 隱藏簽到通知卡片
function hideScanNotification() {
    const card = document.getElementById('scanNotificationCard');
    if (!card) return;

    card.classList.remove('show');
    card.classList.add('hide');

    // 動畫完成後重置
    setTimeout(() => {
        card.classList.remove('hide');
    }, 400);
}

// 播放通知音效（可選）
function playNotificationSound(status) {
    // 如果需要音效，可以在這裡添加
    // 示例：使用 Web Audio API 或預載入的音頻檔案
    /*
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    if (status === 'present') {
        oscillator.frequency.value = 880; // A5
        oscillator.type = 'sine';
    } else if (status === 'late' || status === 'very_late') {
        oscillator.frequency.value = 440; // A4
        oscillator.type = 'triangle';
    } else {
        oscillator.frequency.value = 220; // A3
        oscillator.type = 'sawtooth';
    }

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
    */
}

// 頁面載入時恢復面板狀態
function restoreLeftPanelState() {
    const panel = document.getElementById('leftPanel');
    const toggleBtn = document.getElementById('panelToggleBtn');

    if (!panel || !toggleBtn) return;

    const wasCollapsed = localStorage.getItem('leftPanelCollapsed') === 'true';

    if (wasCollapsed) {
        // 跳過動畫直接設定狀態
        panel.style.transition = 'none';
        toggleBtn.style.transition = 'none';

        panel.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');

        // 強制重繪後恢復動畫
        panel.offsetHeight;

        requestAnimationFrame(() => {
            panel.style.transition = '';
            toggleBtn.style.transition = '';
        });
    }
}

// ========== 選擇學生彈窗功能 ==========
let modalFilteredStudents = [];
let isOpenMode = false;  // 是否为開放點名模式

function openStudentSelectModal() {
    const modal = document.getElementById('studentSelectModal');
    if (!modal) return;
    modal.classList.add('active');

    // 複製班級選項到彈窗
    const mainSelect = document.getElementById('classFilter');
    const modalSelect = document.getElementById('modalClassFilter');
    if (mainSelect && modalSelect) {
        modalSelect.innerHTML = mainSelect.innerHTML;
    }

    // 渲染學生列表
    modalFilteredStudents = [...allStudents];
    renderModalStudentList(modalFilteredStudents);
    updateModalSelectedCount();
}

function closeStudentSelectModal() {
    const modal = document.getElementById('studentSelectModal');
    if (!modal) return;
    modal.classList.remove('active');

    const searchEl = document.getElementById('modalSearchInput');
    const classEl = document.getElementById('modalClassFilter');
    if (searchEl) searchEl.value = '';
    if (classEl) classEl.value = '';
}

function renderModalStudentList(students) {
    const container = document.getElementById('modalStudentList');
    if (!container) return;

    if (!students || students.length === 0) {
        container.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-secondary);">${i18n.t('att.noStudentsFound')}</div>`;
        return;
    }

    container.innerHTML = students.map(student => `
          <div class="student-item ${selectedStudents.has(student.user_login) ? 'selected' : ''}"
               onclick="toggleStudentInModal('${student.user_login}')">
              <input type="checkbox" class="student-checkbox"
                     ${selectedStudents.has(student.user_login) ? 'checked' : ''}
                     onclick="event.stopPropagation(); toggleStudentInModal('${student.user_login}')">
              <div class="student-info-text">
                  <div class="student-name">${student.chinese_name} (${student.english_name})</div>
                  <div class="student-class">${student.class_name} - ${student.class_number}${i18n.t('att.numberSuffix')} | ${student.user_login}</div>
              </div>
          </div>
      `).join('');
}

function toggleStudentInModal(userLogin) {
    if (selectedStudents.has(userLogin)) {
        selectedStudents.delete(userLogin);
    } else {
        selectedStudents.add(userLogin);
    }
    renderModalStudentList(modalFilteredStudents);
    updateModalSelectedCount();
}

function updateModalSelectedCount() {
    const el = document.getElementById('modalSelectedCount');
    if (!el) return;
    el.textContent = selectedStudents.size;
}

function filterStudentsInModal() {
    const classFilterEl = document.getElementById('modalClassFilter');
    const searchEl = document.getElementById('modalSearchInput');
    const classFilter = classFilterEl ? classFilterEl.value : '';
    const searchText = (searchEl ? searchEl.value : '').toLowerCase();

    modalFilteredStudents = allStudents.filter(s => {
        const matchClass = !classFilter || s.class_name === classFilter;
        const matchSearch = !searchText ||
            (s.chinese_name || '').toLowerCase().includes(searchText) ||
            (s.english_name || '').toLowerCase().includes(searchText) ||
            (s.user_login || '').toLowerCase().includes(searchText);
        return matchClass && matchSearch;
    });

    renderModalStudentList(modalFilteredStudents);
}

function modalShowAll() {
    const classEl = document.getElementById('modalClassFilter');
    const searchEl = document.getElementById('modalSearchInput');
    if (classEl) classEl.value = '';
    if (searchEl) searchEl.value = '';
    modalFilteredStudents = [...allStudents];
    renderModalStudentList(modalFilteredStudents);
}

function modalSelectAll() {
    modalFilteredStudents.forEach(s => selectedStudents.add(s.user_login));
    renderModalStudentList(modalFilteredStudents);
    updateModalSelectedCount();
}

function modalSelectNone() {
    selectedStudents.clear();
    renderModalStudentList(modalFilteredStudents);
    updateModalSelectedCount();
}

function modalFilterByGrade(grade) {
    const classEl = document.getElementById('modalClassFilter');
    const searchEl = document.getElementById('modalSearchInput');
    if (classEl) classEl.value = '';
    if (searchEl) searchEl.value = '';
    modalFilteredStudents = allStudents.filter(s => (s.class_name || '').startsWith(grade.toString()));
    renderModalStudentList(modalFilteredStudents);
}

function confirmStudentSelection() {
    closeStudentSelectModal();
    updateSelectedCount();
    updateSelectStudentBtn();

    // 如果是課外活動模式，同步更新
    if (currentSessionType === 'activity') {
        updateActivitySelectBtn();
    }
}

function updateSelectStudentBtn() {
    const btn = document.getElementById('selectStudentBtn');
    if (!btn) return;
    const count = selectedStudents.size;

    if (count > 0) {
        btn.classList.add('has-selection');
        btn.innerHTML = ATT.users + ' ' + i18n.t('att.selectedStudentsEdit', {count: count});
    } else {
        btn.classList.remove('has-selection');
        btn.innerHTML = ATT.users + ' ' + i18n.t('att.clickSelectStudentOptional');
    }
}

// 狀態變數
let authToken = localStorage.getItem('auth_token');
let currentSessionType = localStorage.getItem('attendance_session_type') || 'morning';
let currentSessionId = localStorage.getItem('attendance_session_id') ?
    parseInt(localStorage.getItem('attendance_session_id')) : null;
let allStudents = [];
let selectedStudents = new Set();
let fixedLists = [];


// ========== 手動簽到功能 ==========
let manualSelectedStudent = null;

// 留堂紀錄排序狀態
let detentionSortField = null;  // 'class', 'scanTime', 'remaining'
let detentionSortOrder = 'asc'; // 'asc' 或 'desc'
let detentionStudentsData = []; // 儲存原始數據用於排序

// 儲存會話狀態到 localStorage
function saveSessionState() {
    if (currentSessionId) {
        localStorage.setItem('attendance_session_id', currentSessionId);
        localStorage.setItem('attendance_session_type', currentSessionType);
    } else {
        localStorage.removeItem('attendance_session_id');
        localStorage.removeItem('attendance_session_type');
    }
}

// 頁面重新整理/關閉警告
window.addEventListener('beforeunload', function (e) {
    if (currentSessionId) {
        e.preventDefault();
        e.returnValue = i18n.t('att.leaveWarning');
        return e.returnValue;
    }
});

// 留堂暫時狀態（選擇節數用）
let pendingCardId = null;
let pendingStudent = null;
let pendingOptions = null;

// 倒計時定时器
let countdownInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 應用國際化
    if (typeof i18n !== 'undefined') i18n.applyDOM();

    // 檢查認證
    if (!authToken) {
        window.location.href = '/';
        return;
    }

    // 验证token
    try {
        const response = await fetch('/api/verify', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (!data.success || (data.data.role !== 'teacher' && data.data.role !== 'admin')) {
            showToast(i18n.t('att.teacherAdminOnly'));
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }

        document.getElementById('userInfo').textContent = data.data.display_name || data.data.username;
        // 恢復左側面板狀態
        restoreLeftPanelState();
    } catch (error) {
        console.error('验证失敗:', error);
        window.location.href = '/';
        return;
    }

    // 設定今天的日期
    document.getElementById('sessionDate').value = new Date().toISOString().split('T')[0];
    // 恢復左側面板狀態（Apple 風格動畫）
    restoreLeftPanelState();

    // 載入數據
    await loadClasses();
    await loadStudents();
    await loadFixedLists();
    if (currentSessionId) {
        await restoreSession();
    }

    // 綁定卡號輸入事件
    document.getElementById('cardInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processCard();
        }
    });

    // 初始化表
    initTables();

    // 🆕 啟動即時時鐘
    startLiveClock();

    // 🆕 恢復緊湊模式狀態
    restoreCompactMode();
});

// 初始化資料庫表
async function initTables() {
    try {
        await fetch('/api/attendance/init-tables', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${authToken}`}
        });
    } catch (error) {
        console.error('初始化表失敗:', error);
    }
}

// 恢復之前的會話
async function restoreSession() {
    try {
        // 根據會話類型取得會話資訊
        const url = currentSessionType === 'morning'
            ? `/api/attendance/sessions/${currentSessionId}`
            : `/api/attendance/detention/sessions/${currentSessionId}`;

        const response = await fetch(url, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        if (!response.ok) {
            // 會話不存在或已結束，清除本機儲存
            currentSessionId = null;
            saveSessionState();
            return;
        }

        const data = await response.json();

        // 相容不同返回結構：優先使用 data.session，否則回退到 data
        const session = data.session || null;

        // 如果接口没有返回 session 結構，但返回 success，則認為會話可用
        const isSuccess = data.success === true;
        const status = session && session.status ? session.status : (isSuccess ? 'active' : null);

        // 檢查會話是否仍在進行中
        if (status === 'active') {
            showToast(i18n.t('att.sessionRestored', {type: currentSessionType === 'morning' ? i18n.t('att.typeMorning') : i18n.t('att.typeDetention')}));

            // 更新 UI 顯示：日期
            if (session && session.session_date) {
                document.getElementById('sessionDate').value = session.session_date;
            }

            // 切換到正確的類型標籤（使用現有函數）
            selectType(currentSessionType);

            // 顯示會話面板並載入紀錄
            showSessionPanel();
            await loadSessionDetail();
        } else {
            // 會話已結束，清除
            currentSessionId = null;
            saveSessionState();
        }
    } catch (error) {
        console.error('恢復會話失敗:', error);
        currentSessionId = null;
        saveSessionState();
    }
}

// 載入班級列表
async function loadClasses() {
    try {
        const response = await fetch('/api/attendance/classes', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        // 檢查 HTTP 狀態
        if (!response.ok) {
            if (response.status === 401) {
                console.error('認證失敗，請重新登入');
                showToast(i18n.t('att.loginExpired'), 'error');
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('classFilter');
            const modalSelect = document.getElementById('modalClassFilter');
            const options = `<option value="">${i18n.t('att.allClasses')}</option>` + data.classes.map(cls => `<option value="${cls}">${cls}</option>`).join('');
            if (select) select.innerHTML = options;
            if (modalSelect) modalSelect.innerHTML = options;
        }
    } catch (error) {
        console.error('載入班級失敗:', error);
    }
}

// 載入學生列表
async function loadStudents() {
    try {
        const response = await fetch('/api/attendance/students', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            allStudents = data.students;
            // 不再渲染 studentList
        } else {
            showToast(i18n.t('att.noStudentData'));
        }
    } catch (error) {
        console.error('載入學生失敗:', error);
        showToast(i18n.t('att.loadStudentsFailed') + ': ' + (error && error.message ? error.message : i18n.t('att.unknownError')));
    }
}

// 載入固定名單
async function loadFixedLists() {
    try {
        const response = await fetch(`/api/attendance/fixed-lists?list_type=${currentSessionType}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            fixedLists = data.lists;
            renderFixedLists();
        }
    } catch (error) {
        console.error('載入固定名單失敗:', error);
    }
}

// 渲染固定名單
function renderFixedLists() {
    const container = document.getElementById('fixedListItems');
    // 添加空值檢查
    if (!container) {
        console.warn('fixedListItems 元素不存在');
        return;
    }
    if (fixedLists.length === 0) {
        container.innerHTML = `<span style="color: var(--text-secondary); font-size: 13px;">${i18n.t('att.noFixedList')}</span>`;
        return;
    }

    container.innerHTML = fixedLists.map(list => `
                <div class="fixed-list-item">
                    <div class="fixed-list-item-content">
                        <span class="fixed-list-item-name" onclick="loadFixedList(${list.id})">
                            ${list.list_name} (${list.student_count}${i18n.t('att.people')})
                        </span>
                        <div class="fixed-list-item-actions">
                            <button class="fixed-list-btn edit" onclick="event.stopPropagation(); editFixedList(${list.id}, '${list.list_name}')" title="${i18n.t('att.editBtn')}">${ATT.edit}</button>
                            <button class="fixed-list-btn delete" onclick="event.stopPropagation(); deleteFixedList(${list.id}, '${list.list_name}')" title="${i18n.t('att.deleteBtn')}">${ATT.trash}</button>
                        </div>
                    </div>
                </div>
            `).join('');
}

// 載入固定名單中的學生
async function loadFixedList(listId) {
    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            selectedStudents.clear();
            data.students.forEach(s => selectedStudents.add(s.user_login));
            updateSelectedCount();
            updateSelectStudentBtn();  // 新增
            showToast(i18n.t('att.listLoaded', {name: data.list.list_name, count: data.students.length}));
        }
    } catch (error) {
        showToast(i18n.t('att.loadListFailed'));
    }
}

// 編輯名單用的暫時數據
let editingListStudents = [];
let editingListType = '';

// 編輯固定名單
async function editFixedList(listId, listName) {
    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            // 儲存編輯數據
            document.getElementById('editListId').value = listId;
            document.getElementById('editListName').value = data.list.list_name;
            editingListStudents = data.students.map(s => s.user_login);
            editingListType = data.list.list_type;

            // 渲染學生列表
            renderEditListStudents();

            // 填充可添加的學生下拉框
            populateAddStudentSelect();

            // 顯示模態框
            document.getElementById('editListModal').classList.add('active');
        }
    } catch (error) {
        console.error('載入名單失敗:', error);
        showToast(i18n.t('att.loadListFailed'));
    }
}

// 渲染編輯列表中的學生
function renderEditListStudents() {
    const container = document.getElementById('editListStudents');
    document.getElementById('editListCount').textContent = editingListStudents.length;

    if (editingListStudents.length === 0) {
        container.innerHTML = `<div style="color: var(--text-secondary); text-align: center; padding: 20px;">${i18n.t('att.noStudents')}</div>`;
        return;
    }

    container.innerHTML = editingListStudents.map(userLogin => {
        const student = allStudents.find(s => s.user_login === userLogin);
        if (!student) return '';
        return `
                    <div class="edit-list-student">
                        <div class="edit-list-student-info">
                            <div class="edit-list-student-name">${student.chinese_name} (${student.english_name})</div>
                            <div class="edit-list-student-class">${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')} | ${student.user_login}</div>
                        </div>
                        <button class="edit-list-remove-btn" onclick="removeStudentFromEditList('${userLogin}')">${i18n.t('att.remove')}</button>
                    </div>
                `;
    }).join('');
}

// 填充可添加學生的下拉框
function populateAddStudentSelect() {
    const select = document.getElementById('addStudentSelect');
    const availableStudents = allStudents.filter(s => !editingListStudents.includes(s.user_login));

    select.innerHTML = `<option value="">${i18n.t('att.selectStudentToAdd')}</option>`;
    availableStudents.forEach(s => {
        select.innerHTML += `<option value="${s.user_login}">${s.class_name}-${s.class_number} ${s.chinese_name} (${s.english_name})</option>`;
    });
}

// 從編輯列表移除學生
function removeStudentFromEditList(userLogin) {
    editingListStudents = editingListStudents.filter(id => id !== userLogin);
    renderEditListStudents();
    populateAddStudentSelect();
}

// 添加學生到編輯列表
function addStudentToEditList() {
    const select = document.getElementById('addStudentSelect');
    const userLogin = select.value;

    if (!userLogin) {
        showToast(i18n.t('att.pleaseSelectStudent'));
        return;
    }

    if (!editingListStudents.includes(userLogin)) {
        editingListStudents.push(userLogin);
        renderEditListStudents();
        populateAddStudentSelect();
    }

    select.value = '';
}

// 關閉編輯模態框
function closeEditListModal() {
    document.getElementById('editListModal').classList.remove('active');
    editingListStudents = [];
}

// 儲存編輯後的名單
async function saveEditedList() {
    const listId = document.getElementById('editListId').value;
    const listName = document.getElementById('editListName').value.trim();

    if (!listName) {
        showToast(i18n.t('att.enterListName'));
        return;
    }

    if (editingListStudents.length === 0) {
        showToast(i18n.t('att.listNeedOneStudent'));
        return;
    }

    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                list_name: listName,
                list_type: editingListType,
                student_ids: editingListStudents
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.listUpdated', {name: listName}));
            closeEditListModal();
            loadFixedLists();
        } else {
            showToast(data.detail || i18n.t('att.updateFailed'));
        }
    } catch (error) {
        console.error('儲存名單失敗:', error);
        showToast(i18n.t('att.saveListFailed'));
    }
}

// 刪除固定名單
async function deleteFixedList(listId, listName) {
    if (!confirm(i18n.t('att.confirmDeleteList', {name: listName}))) {
        return;
    }

    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.listDeleted', {name: listName}));
            loadFixedLists();
        } else {
            showToast(data.detail || i18n.t('att.deleteFailed'));
        }
    } catch (error) {
        console.error('刪除名單失敗:', error);
        showToast(i18n.t('att.deleteListFailed'));
    }
}

// 渲染學生列表
function renderStudentList(students) {
    const container = document.getElementById('studentList');
    if (!container) {
        // 左側已改為“選擇學生彈窗”模式，不再渲染旧 studentList
        return;
    }

    if (students.length === 0) {
        container.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                        ${i18n.t('att.noStudentsFound')}
                    </div>
                `;
        return;
    }

    container.innerHTML = students.map(student => `
<div class="student-item ${selectedStudents.has(student.user_login) ? 'selected' : ''}"                   onclick="toggleStudent('${student.user_login}')">
                    <input type="checkbox" class="student-checkbox"
                           ${selectedStudents.has(student.user_login) ? 'checked' : ''}
                           onclick="event.stopPropagation(); toggleStudent('${student.user_login}')">
                    <div class="student-info-text">
                        <div class="student-name">${student.chinese_name} (${student.english_name})</div>
                        <div class="student-class">${student.class_name} - ${student.class_number}${i18n.t('att.numberSuffix')} | ${student.user_login}</div>
                    </div>
                </div>
            `).join('');
}

// 篩選學生（已迁移到彈窗選擇模式）
function filterStudents() {
    // 相容舊按鈕/舊事件：改為打開選擇學生彈窗
    openStudentSelectModal();
}

// 切換學生選擇（已迁移到彈窗選擇模式）
function toggleStudent(userLogin) {
    // 相容舊点击：在彈窗選擇集合中切换
    if (selectedStudents.has(userLogin)) {
        selectedStudents.delete(userLogin);
    } else {
        selectedStudents.add(userLogin);
    }
    updateSelectedCount();
    updateSelectStudentBtn();
}

// 取得當前篩選後的學生（已棄用，保留空實現以相容舊呼叫）
function getFilteredStudents() {
    return allStudents;
}

// 更新選擇計數
function updateSelectedCount() {
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = selectedStudents.size;
    // 同步更新“選擇學生”按鈕狀態
    updateSelectStudentBtn();
}

// 選擇類型
function selectType(type) {
    currentSessionType = type;
    saveSessionState();  // 切换模式时儲存會話類型

    // 更新按鈕狀態
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.type-btn.${type}`).classList.add('active');

    // 根據類型控制 UI 顯示
    const activityConfigSection = document.getElementById('activityConfigSection');
    const studentSelectSection = document.getElementById('studentSelectSection');
    const selectedCountSection = document.getElementById('selectedCountSection');

    if (type === 'activity') {
        // 活動模式：顯示活動配置
        if (activityConfigSection) activityConfigSection.style.display = 'block';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        loadActivityGroups(); // 載入活動組別
    } else {
        // 晨讀/留堂模式：隱藏活動配置（自動全班開放模式）
        if (activityConfigSection) activityConfigSection.style.display = 'none';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        // 清空學生選擇（晨讀/留堂不需要預選學生）
        selectedStudents.clear();
        updateSelectedCount();
    }

    loadFixedLists();
}

// 載入活動組別
async function loadActivityGroups() {
    const container = document.getElementById('activityGroupsList');
    if (!container) return;

    try {
        const response = await fetch('/api/attendance/activity-groups', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success && data.groups && data.groups.length > 0) {
            container.innerHTML = data.groups.map(g =>
                `<button class="activity-group-btn" onclick="loadActivityGroup(${g.id})">${g.name} (${g.student_count}${i18n.t('att.people')})</button>`
            ).join('');
        } else {
            container.innerHTML = `<span class="no-groups-hint">${i18n.t('att.noGroups')}</span>`;
        }
    } catch (error) {
        console.log('載入活動組別失敗:', error);
        container.innerHTML = `<span class="no-groups-hint">${i18n.t('att.noGroups')}</span>`;
    }
}

// 載入指定活動組別的學生
async function loadActivityGroup(groupId) {
    try {
        const response = await fetch(`/api/attendance/activity-groups/${groupId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success && data.students) {
            selectedStudents.clear();
            data.students.forEach(s => selectedStudents.add(s.user_login));
            updateActivitySelectedCount();
            showToast(i18n.t('att.loadedStudents', {count: data.students.length}));
        }
    } catch (error) {
        console.log('載入組別學生失敗:', error);
        showToast(i18n.t('att.loadFailed'));
    }
}

// 更新活動模式的已選學生數
function updateActivitySelectedCount() {
    const countEl = document.getElementById('activityStudentCount');
    if (countEl) {
        countEl.textContent = selectedStudents.size;
    }
    const btn = document.getElementById('activitySelectStudentBtn');
    if (btn) {
        if (selectedStudents.size > 0) {
            btn.classList.add('has-selection');
            btn.innerHTML = ATT.users + ' ' + i18n.t('att.selectedStudentsEdit', {count: selectedStudents.size});
        } else {
            btn.classList.remove('has-selection');
            btn.innerHTML = ATT.users + ' ' + i18n.t('att.clickSelectStudents');
        }
    }
}

// 全選
function selectAll() {
    allStudents.forEach(s => selectedStudents.add(s.user_login));
    updateSelectedCount();
    updateSelectStudentBtn();
    showToast(i18n.t('att.allSelected'));
}

// 清空選擇
function selectNone() {
    selectedStudents.clear();
    updateSelectedCount();
    updateSelectStudentBtn();
    showToast(i18n.t('att.selectionCleared'));
}

// 按年級篩選（打開彈窗並篩選）
function filterByGrade(grade) {
    openStudentSelectModal();
    setTimeout(() => {
        modalFilterByGrade(grade);
    }, 100);
}

// 顯示全部學生（打開彈窗）
function showAllStudents() {
    openStudentSelectModal();
}

// 儲存固定名單
function saveFixedList() {
    if (selectedStudents.size === 0) {
        showToast(i18n.t('att.pleaseSelectStudentsFirst'));
        return;
    }
    document.getElementById('saveListModal').classList.add('active');
}

function closeSaveListModal() {
    document.getElementById('saveListModal').classList.remove('active');
    document.getElementById('listNameInput').value = '';
}

async function confirmSaveList() {
    const listName = document.getElementById('listNameInput').value.trim();
    if (!listName) {
        showToast(i18n.t('att.enterListName'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/fixed-lists', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                list_name: listName,
                list_type: currentSessionType,
                student_ids: Array.from(selectedStudents)
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.listSaved'));
            closeSaveListModal();
            loadFixedLists();
        } else {
            showToast(i18n.t('att.saveFailed') + ': ' + data.detail);
        }
    } catch (error) {
        showToast(i18n.t('att.saveFailed'));
    }
}

// 開始點名會話
// 開始點名會話
async function startSession() {
    // 課外活動使用專門的函數
    if (currentSessionType === 'activity') {
        return startActivitySession();
    }
    const sessionDate = document.getElementById('sessionDate').value;
    if (!sessionDate) {
        showToast(i18n.t('att.pleaseSelectDate'));
        return;
    }

    // 晨讀/留堂模式始終使用開放模式（任何學生都可簽到）
    // 預留選擇學生功能給課外活動點名
    isOpenMode = (currentSessionType === 'morning' || currentSessionType === 'detention')
        ? true  // 早讀/留堂始終開放模式
        : selectedStudents.size === 0;  // 課外活動可選擇學生

    try {
        const response = await fetch('/api/attendance/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_type: currentSessionType,
                session_date: sessionDate,
                student_ids: Array.from(selectedStudents),
                open_mode: isOpenMode  // 預留參數
            })
        });

        const data = await response.json();
        if (data.success) {
            currentSessionId = data.session_id;
            saveSessionState();
            showToast(data.message);
            showSessionPanel();
            loadSessionDetail();
        } else {
            showToast(i18n.t('att.createFailed') + ': ' + data.detail);
        }
    } catch (error) {
        showToast(i18n.t('att.createSessionFailed'));
    }
}

// 顯示會話面板
function showSessionPanel() {
    document.getElementById('noSessionHint').style.display = 'none';
    document.getElementById('sessionPanel').style.display = 'flex';

    // 根據類型設定標題
    let typeText = i18n.t('att.typeMorning');
    if (currentSessionType === 'detention') {
        typeText = i18n.t('att.typeDetention');
    } else if (currentSessionType === 'activity') {
        const activityNameEl = document.getElementById('activityName');
        typeText = activityNameEl && activityNameEl.value ? activityNameEl.value : i18n.t('att.typeActivity');
    }
    document.getElementById('sessionTitle').textContent = typeText + ' ' + i18n.t('att.sessionInProgress');

    // 開放模式下隱藏未到統計
    const absentStatSpan = document.getElementById('statAbsent');
    if (absentStatSpan && absentStatSpan.parentElement) {
        absentStatSpan.parentElement.style.display = isOpenMode ? 'none' : '';
    }

    // 停止倒計時
    stopCountdownRefresh();

    // 取得所有容器（用容器控制顯示，而不是表格）
    const containers = document.querySelectorAll('.records-table-container');

    // 根據類型顯示對應的容器
    if (currentSessionType === 'morning') {
        // 晨讀：顯示第一个容器（晨讀表格），隱藏其他
        containers.forEach((c, i) => {
            c.style.display = i === 0 ? 'block' : 'none';
        });
        document.getElementById('morningRecordsTable').style.display = 'table';
        document.getElementById('morningStats').style.display = 'flex';
        document.getElementById('detentionStats').style.display = 'none';
        const activityStats = document.getElementById('activityStats');
        if (activityStats) activityStats.style.display = 'none';

    } else if (currentSessionType === 'detention') {
        // 留堂：顯示第二个容器（留堂表格），隱藏其他
        containers.forEach((c, i) => {
            c.style.display = i === 1 ? 'block' : 'none';
        });
        document.getElementById('detentionRecordsTable').style.display = 'table';
        document.getElementById('morningStats').style.display = 'none';
        document.getElementById('detentionStats').style.display = 'flex';
        const activityStats = document.getElementById('activityStats');
        if (activityStats) activityStats.style.display = 'none';
        startCountdownRefresh();

    } else if (currentSessionType === 'activity') {
        // 活動：顯示第三个容器（活動表格），隱藏其他
        containers.forEach((c, i) => {
            c.style.display = i === 2 ? 'block' : 'none';
        });
        const activityTable = document.getElementById('activityRecordsTable');
        if (activityTable) activityTable.style.display = 'table';
        document.getElementById('morningStats').style.display = 'none';
        document.getElementById('detentionStats').style.display = 'none';
        const activityStats = document.getElementById('activityStats');
        if (activityStats) activityStats.style.display = 'flex';
    }

    startLiveClock();
    document.getElementById('cardInput').focus();
}

// 載入會話详情
async function loadSessionDetail() {
    if (!currentSessionId) return;

    try {
        // 根據會話類型選擇API
        let apiUrl;
        if (currentSessionType === 'morning') {
            apiUrl = `/api/attendance/sessions/${currentSessionId}`;
        } else if (currentSessionType === 'detention') {
            apiUrl = `/api/attendance/detention/sessions/${currentSessionId}`;
        } else if (currentSessionType === 'activity') {
            apiUrl = `/api/attendance/activity/sessions/${currentSessionId}`;
        } else {
            console.error('未知會話類型:', currentSessionType);
            return;
        }

        const response = await fetch(apiUrl, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            if (currentSessionType === 'morning') {
                updateStats(data.stats);
                renderRecords(data.students);
            } else if (currentSessionType === 'detention') {
                updateDetentionStats(data.stats);
                renderDetentionRecords(data.students);
            } else if (currentSessionType === 'activity') {
                // 活動類型的處理
                if (typeof updateActivityStats === 'function') {
                    updateActivityStats(data.stats);
                }
                if (typeof renderActivityRecords === 'function') {
                    renderActivityRecords(data.students);
                }
            }
        }
    } catch (error) {
        console.error('載入會話详情失敗:', error);
    }
}

// 更新統計（早讀）
function updateStats(stats) {
    document.getElementById('statPresent').textContent = stats.on_time;
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statVeryLate').textContent = stats.very_late;
    document.getElementById('statAbsent').textContent = stats.absent;

    // 相容舊版本：如果頁面仍存在“非登記”統計則寫入
    const unregEl = document.getElementById('statUnregistered');
    if (unregEl) {
        unregEl.textContent = stats.unregistered || 0;
    }
}

// 渲染簽到紀錄
function renderRecords(students) {
    // 🆕 儲存數據用於排序
    currentMorningRecords = students;

    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = students.map(s => {
        const status = s.attendance_status || 'absent';
        const isRegistered = s.is_registered !== false;

        let statusText = {
            'present': i18n.t('att.onTime'),
            'late': i18n.t('att.late'),
            'very_late': i18n.t('att.veryLate'),
            'absent': i18n.t('att.absent')
        }[status];

        // 非登記學生標記
        const registeredTag = isRegistered ? '' : `<span class="unregistered-tag">${i18n.t('att.unregistered')}</span>`;
        const rowClass = isRegistered ? '' : 'unregistered-row';

        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }) : '-';

        return `
            <tr class="${rowClass}">
                <td>${s.class_name}-${s.class_number} ${registeredTag}</td>
                <td>${s.chinese_name}</td>
                <td>${scanTime}</td>
                <td><span class="status-badge ${status.replace('_', '-')}">${statusText}</span></td>
                <td class="hide-compact">${s.late_minutes || 0}${i18n.t('att.minutesUnit')}</td>
                <td class="hide-compact">${s.makeup_minutes || 0}${i18n.t('att.minutesUnit')}</td>
            </tr>
        `;
    }).join('');

    // 🆕 应用當前排序
    if (morningSortField !== 'class' || morningSortOrder !== 'asc') {
        sortMorningRecords();
    }
    // 更新排序指示器
    updateMorningSortIndicators();
}

// 處理拍卡
async function processCard() {
    const cardInput = document.getElementById('cardInput');
    const cardId = cardInput.value.trim();

    if (!cardId) {
        showToast(i18n.t('att.pleaseInputCard'));
        return;
    }

    if (!currentSessionId) {
        showToast(i18n.t('att.pleaseStartSession'));
        return;
    }

    try {
        // 根據會話類型選擇不同的API
        let apiUrl;
        if (currentSessionType === 'morning') {
            apiUrl = '/api/attendance/scan';
        } else if (currentSessionType === 'detention') {
            apiUrl = '/api/attendance/detention/scan';
        } else if (currentSessionType === 'activity') {
            apiUrl = '/api/attendance/activity/scan';
        }

        // ... 後續代码保持不变

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                card_id: cardId
            })
        });

        const data = await response.json();

        // 留堂模式需要特殊處理
        if (currentSessionType === 'detention' && data.action === 'need_select_periods') {
            // 需要選擇節數
            pendingCardId = cardId;
            pendingStudent = data.student;
            pendingOptions = data.options;
            showPeriodsModal(data.student, data.options);
        } else {
            showScanResult(data);

            // 刷新紀錄
            if (data.success) {
                loadSessionDetail();
            }
        }

        // 清空輸入并重新聚焦
        cardInput.value = '';
        cardInput.focus();

    } catch (error) {
        showToast(i18n.t('att.checkinFailed'));
        console.error(error);
    }
}

// 顯示簽到結果
function showScanResult(data) {
    // 🆕 添加這一行：顯示 Apple 風格通知卡片
    showScanNotification(data);
    const resultDiv = document.getElementById('scanResult');
    const nameDiv = document.getElementById('resultName');
    const timeDiv = document.getElementById('resultTime');
    const statusDiv = document.getElementById('resultStatus');

    resultDiv.style.display = 'block';
    resultDiv.className = 'scan-result';

    if (data.success) {
        const student = data.student;
        const record = data.record;

        nameDiv.textContent = `${student.chinese_name} (${student.english_name})`;

        // 根據會話類型顯示不同資訊
        if (currentSessionType === 'morning') {
            timeDiv.textContent = `${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')} | ${record.scan_time}`;

            if (record.status === 'present') {
                resultDiv.classList.add('success');
                statusDiv.innerHTML = ATT.check + ' ' + i18n.t('att.onTimeCheckin');
                statusDiv.style.background = 'var(--accent-green)';
            } else if (record.status === 'late') {
                resultDiv.classList.add('late');
                statusDiv.innerHTML = ATT.warning + ' ' + i18n.t('att.lateBy', {minutes: record.late_minutes, makeup: record.makeup_minutes});
                statusDiv.style.background = 'var(--accent-orange)';
            } else if (record.status === 'very_late') {
                resultDiv.classList.add('very-late');
                statusDiv.innerHTML = ATT.alert + ' ' + i18n.t('att.veryLateNeedMakeup', {makeup: record.makeup_minutes});
                statusDiv.style.background = 'var(--accent-red)';
            }
        } else {
            // 留堂模式
            if (data.action === 'checkout') {
                // 簽退
                timeDiv.textContent = `${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')} | ${i18n.t('att.checkout')}: ${record.checkout_time}`;
                statusDiv.textContent = record.status_msg;

// 根據是否使用分鐘模式判斷完成狀態
                let isCompleted = false;
                if (record.planned_minutes != null) {
                    isCompleted = record.actual_minutes >= record.planned_minutes;
                } else {
                    isCompleted = record.actual_periods >= record.planned_periods;
                }

                if (isCompleted) {
                    resultDiv.classList.add('success');
                    statusDiv.style.background = 'var(--accent-green)';
                } else if (record.actual_minutes > 0 || record.actual_periods > 0) {
                    resultDiv.classList.add('late');
                    statusDiv.style.background = 'var(--accent-orange)';
                } else {
                    resultDiv.classList.add('very-late');
                    statusDiv.style.background = 'var(--accent-red)';
                }
            } else {
                // 簽到
                timeDiv.textContent = `${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')} | ${i18n.t('att.checkin')}: ${record.scan_time}`;
                resultDiv.classList.add('success');
                statusDiv.innerHTML = ATT.check + ' ' + i18n.t('att.checkinSuccessDetention', {periods: record.planned_periods, endTime: record.planned_end_time});
                statusDiv.style.background = 'var(--accent-purple)';
            }
        }
    } else {
        resultDiv.classList.add('error');
        nameDiv.innerHTML = ATT.error + ' ' + (data.message || data.detail || i18n.t('att.unknownError'));
        timeDiv.textContent = data.card_id ? `${i18n.t('att.cardNumber')}: ${data.card_id}` : '';
        statusDiv.textContent = '';
        statusDiv.style.background = 'transparent';
    }

    // 5秒後隱藏（留堂給多點時間看）
    const hideDelay = currentSessionType === 'detention' ? 5000 : 3000;
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, hideDelay);
}

// 匯出Excel
async function exportExcel() {
    if (!currentSessionId) {
        showToast(i18n.t('att.noActiveSession'));
        return;
    }

    try {
        // 根據會話類型選擇匯出API
        let exportUrl;
        if (currentSessionType === 'morning') {
            exportUrl = `/api/attendance/export/${currentSessionId}`;
        } else if (currentSessionType === 'detention') {
            exportUrl = `/api/attendance/detention/export/${currentSessionId}`;
        } else if (currentSessionType === 'activity') {
            exportUrl = `/api/attendance/activity/export/${currentSessionId}`;
        } else {
            showToast(i18n.t('att.unknownSessionType'));
            return;
        }

        window.open(`${exportUrl}?token=${authToken}`, '_blank');
    } catch (error) {
        showToast(i18n.t('att.exportFailed'));
    }
}

// ========== 點名紀錄管理功能 ==========

let exportsCurrentPage = 1;
let exportsPageSize = 10;
let exportsFilter = {type: '', startDate: '', endDate: ''};

// 結束會話 - 顯示確認彈窗
function endSession() {
    if (!currentSessionId) return;
    showEndSessionModal();
}

// 顯示結束點名確認彈窗
function showEndSessionModal() {
    // 根據當前會話類型讀取對應的統計數據
    let present = '0', late = '0', absent = '0';
    let presentLabel = '', lateLabel = '', absentLabel = '';

    if (currentSessionType === 'detention') {
        const completedEl = document.getElementById('statCompleted');
        const activeEl = document.getElementById('statActive');
        const notCheckedInEl = document.getElementById('statNotCheckedIn');
        present = completedEl ? completedEl.textContent : '0';
        late = activeEl ? activeEl.textContent : '0';
        absent = notCheckedInEl ? notCheckedInEl.textContent : '0';
        presentLabel = i18n.t('att.statCompleted');
        lateLabel = i18n.t('att.statActive');
        absentLabel = i18n.t('att.statNotCheckedIn');
    } else if (currentSessionType === 'activity') {
        const onTimeEl = document.getElementById('activityStatOnTime');
        const lateEl = document.getElementById('activityStatLate');
        const absentEl = document.getElementById('activityStatAbsent');
        present = onTimeEl ? onTimeEl.textContent : '0';
        late = lateEl ? lateEl.textContent : '0';
        absent = absentEl ? absentEl.textContent : '0';
        presentLabel = i18n.t('att.statOnTime');
        lateLabel = i18n.t('att.statLate');
        absentLabel = i18n.t('att.statAbsent');
    } else {
        // 早讀 morning
        const presentEl = document.getElementById('statPresent');
        const lateEl = document.getElementById('statLate');
        const absentEl = document.getElementById('statAbsent');
        present = presentEl ? presentEl.textContent : '0';
        late = lateEl ? lateEl.textContent : '0';
        absent = absentEl ? absentEl.textContent : '0';
        presentLabel = i18n.t('att.statOnTime');
        lateLabel = i18n.t('att.statLate');
        absentLabel = i18n.t('att.statAbsent');
    }

    document.getElementById('endStatPresent').textContent = present;
    document.getElementById('endStatLate').textContent = late;
    document.getElementById('endStatAbsent').textContent = absent;

    // 更新標籤文字
    const presentLabelEl = document.getElementById('endStatPresent')?.nextElementSibling;
    const lateLabelEl = document.getElementById('endStatLate')?.nextElementSibling;
    const absentLabelEl = document.getElementById('endStatAbsent')?.nextElementSibling;
    if (presentLabelEl && presentLabel) presentLabelEl.textContent = presentLabel;
    if (lateLabelEl && lateLabel) lateLabelEl.textContent = lateLabel;
    if (absentLabelEl && absentLabel) absentLabelEl.textContent = absentLabel;

    document.getElementById('exportNotes').value = '';
    document.getElementById('saveToServerCheckbox').checked = true;
    document.getElementById('endSessionModal').classList.add('active');
}

function closeEndSessionModal() {
    document.getElementById('endSessionModal').classList.remove('active');
}

// 確認結束點名
async function confirmEndSession() {
    const saveToServer = document.getElementById('saveToServerCheckbox').checked;
    const notes = document.getElementById('exportNotes').value.trim();

    if (saveToServer) {
        try {
            const response = await fetch('/api/attendance/exports/save', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({session_id: currentSessionId, notes: notes || null})
            });
            const data = await response.json();
            if (data.success) {
                showToast(ATT.check + ' ' + i18n.t('att.recordSaved', {name: data.file_name}));
            } else {
                showToast(ATT.warning + ' ' + i18n.t('att.saveFailed') + ': ' + data.message);
            }
        } catch (error) {
            console.error('儲存失敗:', error);
            showToast(i18n.t('att.saveFailedRetry'));
        }
    }

    closeEndSessionModal();
    await doEndSession();
}

// 僅下載不儲存
async function downloadOnlyEndSession() {
    await exportExcel();
    closeEndSessionModal();
    await doEndSession();
}

// 執行實際的結束會話操作
async function doEndSession() {
    try {
        const response = await fetch(`/api/attendance/sessions/${currentSessionId}/complete`, {
            method: 'PUT',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.sessionEnded'));
            currentSessionId = null;
            saveSessionState();
            stopCountdownRefresh();
            stopLiveClock();  // 🆕 新增：停止時鐘
            document.getElementById('sessionPanel').style.display = 'none';
            document.getElementById('noSessionHint').style.display = 'flex';
        }
    } catch (error) {
        showToast(i18n.t('att.endFailed'));
    }
}

// ========== 歷史紀錄面板 ==========

function openExportsPanel() {
    document.getElementById('exportsPanel').classList.add('active');
    loadExportsList();
}

function closeExportsPanel() {
    document.getElementById('exportsPanel').classList.remove('active');
}

async function loadExportsList() {
    const container = document.getElementById('exportsList');
    container.innerHTML = `<div class="exports-loading">${i18n.t('att.loading')}</div>`;

    try {
        let url = `/api/attendance/exports/list?page=${exportsCurrentPage}&page_size=${exportsPageSize}`;
        if (exportsFilter.type) url += `&session_type=${exportsFilter.type}`;
        if (exportsFilter.startDate) url += `&start_date=${exportsFilter.startDate}`;
        if (exportsFilter.endDate) url += `&end_date=${exportsFilter.endDate}`;

        const response = await fetch(url, {headers: {'Authorization': `Bearer ${authToken}`}});
        const data = await response.json();

        if (data.success && data.records.length > 0) {
            renderExportsList(data.records);
            renderExportsPagination(data.total, data.page, data.total_pages);
        } else {
            container.innerHTML = `
                <div class="exports-empty">
                    <span class="exports-empty-icon">${ATT.folder}</span>
                    <p>${i18n.t('att.noRecords')}</p>
                    <p class="exports-empty-hint">${i18n.t('att.noRecordsHint')}</p>
                </div>`;
            document.getElementById('exportsPagination').innerHTML = '';
        }
    } catch (error) {
        console.error('載入歷史紀錄失敗:', error);
        container.innerHTML = `<div class="exports-error">${i18n.t('att.loadFailedRetry')}</div>`;
    }
}

function renderExportsList(records) {
    const container = document.getElementById('exportsList');
    const html = records.map(r => {
        const typeIcon = r.session_type === 'morning' ? ATT.sun : ATT.note;
        const typeText = r.session_type === 'morning' ? i18n.t('att.typeMorning') : i18n.t('att.typeDetention');
        const fileSizeKB = Math.round(r.file_size / 1024);
        const attendanceRate = r.student_count > 0 ? Math.round(r.present_count / r.student_count * 100) : 0;

        return `
            <div class="export-item">
                <div class="export-item-header">
                    <span class="export-item-icon">${typeIcon}</span>
                    <div class="export-item-info">
                        <div class="export-item-title">${typeText} ${i18n.t('att.attendance')} ${r.session_date}</div>
                        <div class="export-item-meta">${r.present_count}/${r.student_count}${i18n.t('att.people')} (${attendanceRate}%) · ${fileSizeKB}KB · ${r.created_at}</div>
                    </div>
                </div>
                ${r.notes ? `<div class="export-item-notes">${ATT.pin} ${r.notes}</div>` : ''}
                <div class="export-item-stats">
                    <span class="stat-tag present">${i18n.t('att.present')} ${r.present_count}</span>
                    <span class="stat-tag late">${i18n.t('att.late')} ${r.late_count}</span>
                    <span class="stat-tag absent">${i18n.t('att.absentExport')} ${r.absent_count}</span>
                </div>
                <div class="export-item-actions">
                    <button class="export-btn download" onclick="downloadExport(${r.id})">${ATT.download} ${i18n.t('att.download')}</button>
                    <button class="export-btn delete" onclick="confirmDeleteExport(${r.id}, '${r.file_name}')">${ATT.trash} ${i18n.t('att.delete')}</button>
                </div>
            </div>`;
    }).join('');
    container.innerHTML = html;
}

function renderExportsPagination(total, currentPage, totalPages) {
    const container = document.getElementById('exportsPagination');
    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '<div class="exports-pagination">';
    if (currentPage > 1) html += `<button class="page-btn" onclick="goToExportsPage(${currentPage - 1})">‹</button>`;
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) html += `<button class="page-btn active">${i}</button>`;
        else if (i === 1 || i === totalPages || Math.abs(i - currentPage) <= 2) html += `<button class="page-btn" onclick="goToExportsPage(${i})">${i}</button>`;
        else if (Math.abs(i - currentPage) === 3) html += `<span class="page-dots">...</span>`;
    }
    if (currentPage < totalPages) html += `<button class="page-btn" onclick="goToExportsPage(${currentPage + 1})">›</button>`;
    html += '</div>';
    container.innerHTML = html;
}

function goToExportsPage(page) {
    exportsCurrentPage = page;
    loadExportsList();
}

function filterExports() {
    exportsFilter.type = document.getElementById('exportsTypeFilter').value;
    exportsFilter.startDate = document.getElementById('exportsStartDate').value;
    exportsFilter.endDate = document.getElementById('exportsEndDate').value;
    exportsCurrentPage = 1;
    loadExportsList();
}

function resetExportsFilter() {
    document.getElementById('exportsTypeFilter').value = '';
    document.getElementById('exportsStartDate').value = '';
    document.getElementById('exportsEndDate').value = '';
    exportsFilter = {type: '', startDate: '', endDate: ''};
    exportsCurrentPage = 1;
    loadExportsList();
}

async function downloadExport(exportId) {
    try {
        const response = await fetch(`/api/attendance/exports/download/${exportId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        if (!response.ok) {
            const err = await response.json().catch(() => null);
            const detail = err?.detail || err?.message || 'Download failed';
            throw new Error(detail);
        }

        const contentDisposition = response.headers.get('content-disposition');
        let fileName = 'attendance_export.xlsx';
        if (contentDisposition) {
            const match = contentDisposition.match(/filename\*?=['"]?(?:UTF-8'')?([^;\r\n"']*)['"]?/i);
            if (match) fileName = decodeURIComponent(match[1]);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        a.remove();
        showToast(ATT.check + ' ' + i18n.t('att.downloadSuccess'));
    } catch (error) {
        console.error('下載失敗:', error);
        showToast(error.message || i18n.t('att.downloadFailedRetry'));
    }
}

function confirmDeleteExport(exportId, fileName) {
    if (confirm(i18n.t('att.confirmDeleteRecord', {name: fileName}))) deleteExport(exportId);
}

async function deleteExport(exportId) {
    try {
        const response = await fetch(`/api/attendance/exports/${exportId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();
        if (data.success) {
            showToast(ATT.check + ' ' + i18n.t('att.recordDeleted'));
            loadExportsList();
        } else showToast(i18n.t('att.deleteFailed') + ': ' + data.message);
    } catch (error) {
        console.error('刪除失敗:', error);
        showToast(i18n.t('att.deleteFailedRetry'));
    }
}

// 上傳學生數據
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

async function uploadStudents() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast(i18n.t('att.pleaseSelectFile'));
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/attendance/upload-students', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${authToken}`},
            body: formData
        });

        const data = await response.json();
        if (data.success) {
            showToast(data.message);
            closeUploadModal();
            loadStudents();
            loadClasses();
        } else {
            showToast(i18n.t('att.uploadFailed') + ': ' + data.detail);
        }
    } catch (error) {
        showToast(i18n.t('att.uploadFailed'));
    }
}

// Toast提示
function showToast(message) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}


// ========== 手動簽到功能 ==========

// 顯示手動簽到模態框
function showManualScanModal() {
    if (!currentSessionId) {
        showToast(i18n.t('att.pleaseStartSession'));
        return;
    }

    // 確保學生數據已載入
    if (!allStudents || allStudents.length === 0) {
        showToast(i18n.t('att.studentsNotLoaded'));
        return;
    }

    // 填充班級下拉框
    const classSelect = document.getElementById('manualClassSelect');
    const existingClasses = new Set();

    classSelect.innerHTML = `<option value="">-- ${i18n.t('att.pleaseSelectClass')} --</option>`;
    allStudents.forEach(s => {
        if (s.class_name && !existingClasses.has(s.class_name)) {
            existingClasses.add(s.class_name);
        }
    });

    // 排序班級
    const sortedClasses = Array.from(existingClasses).sort();
    sortedClasses.forEach(cls => {
        classSelect.innerHTML += `<option value="${cls}">${cls}</option>`;
    });

    // 重置表单
    document.getElementById('manualClassNumber').value = '';
    document.getElementById('manualStudentPreview').classList.remove('show');
    document.getElementById('previewNotFound').style.display = 'none';

    const confirmBtn = document.getElementById('confirmManualScan');
    confirmBtn.disabled = true;
    confirmBtn.textContent = i18n.t('att.confirmCheckin');

    manualSelectedStudent = null;

    // 顯示模態框
    document.getElementById('manualScanModal').classList.add('active');
}

// 隱藏手動簽到模態框
function hideManualScanModal() {
    document.getElementById('manualScanModal').classList.remove('active');
    manualSelectedStudent = null;

    // 回到扫码輸入框
    const cardInput = document.getElementById('cardInput');
    if (cardInput) cardInput.focus();
}

// 更新學生預覽
function updateManualStudentPreview() {
    const className = document.getElementById('manualClassSelect').value;
    const classNumberRaw = document.getElementById('manualClassNumber').value;
    const classNumber = classNumberRaw ? parseInt(classNumberRaw, 10) : null;

    const preview = document.getElementById('manualStudentPreview');
    const notFound = document.getElementById('previewNotFound');
    const confirmBtn = document.getElementById('confirmManualScan');

    // 重置
    preview.classList.remove('show');
    notFound.style.display = 'none';
    confirmBtn.disabled = true;
    manualSelectedStudent = null;

    if (!className || !classNumber || Number.isNaN(classNumber)) {
        return;
    }

    // 查找學生（class_number 可能是數字或字串，做寬鬆匹配）
    const student = allStudents.find(s =>
        s.class_name === className && parseInt(s.class_number, 10) === classNumber
    );

    if (student) {
        // 顯示學生資訊
        document.getElementById('previewName').textContent = student.chinese_name || '';
        document.getElementById('previewEnglish').textContent = student.english_name || '';
        document.getElementById('previewClass').textContent = `${student.class_name} - ${student.class_number}${i18n.t('att.numberSuffix')}`;

        preview.classList.add('show');
        notFound.style.display = 'none';
        confirmBtn.disabled = false;
        manualSelectedStudent = student;
    } else {
        // 未找到學生
        preview.classList.remove('show');
        notFound.style.display = 'block';
        confirmBtn.disabled = true;
    }
}

// 確認手動簽到
async function confirmManualScan() {
    if (!manualSelectedStudent || !currentSessionId) {
        return;
    }

    // 留堂模式需要先選擇節數
    if (currentSessionType === 'detention') {
        // 儲存學生資訊，顯示節數選擇
        pendingManualStudent = manualSelectedStudent;
        hideManualScanModal();
        showManualPeriodsModal();
        return;
    }

    // 早讀模式直接簽到
    const confirmBtn = document.getElementById('confirmManualScan');
    confirmBtn.disabled = true;
    confirmBtn.textContent = i18n.t('att.checkingIn');

    try {
        const response = await fetch('/api/attendance/manual-scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: manualSelectedStudent.user_login
            })
        });

        const data = await response.json();

        if (data.success) {
            hideManualScanModal();
            if (typeof showScanResult === 'function') {
                showScanResult(data);
            } else {
                showToast(data.message || i18n.t('att.manualCheckinSuccess'));
            }
            await loadSessionDetail();
            const cardInput = document.getElementById('cardInput');
            if (cardInput) {
                cardInput.value = '';
                cardInput.focus();
            }
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkinFailed'));
        }
    } catch (error) {
        console.error('手動簽到失敗:', error);
        showToast(i18n.t('att.checkinFailedRetry'));
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = i18n.t('att.confirmCheckin');
    }
}

// 留堂手動簽到 - 待處理的學生
let pendingManualStudent = null;

// 顯示留堂手動簽到節數選擇
function showManualPeriodsModal() {
    if (!pendingManualStudent) return;

    document.getElementById('manualPeriodsModalStudent').textContent =
        `${pendingManualStudent.chinese_name} (${pendingManualStudent.class_name}-${pendingManualStudent.class_number}${i18n.t('att.numberSuffix')})`;

    // 重置原因選擇
    selectedManualDetentionReason = null;

    // 隱藏節數選擇区域，顯示原因選擇
    const reasonArea = document.getElementById('manualReasonSelectionArea');
    const periodsArea = document.getElementById('manualPeriodsSelectionArea');

    if (reasonArea) {
        reasonArea.style.display = 'block';
        // 重置原因按鈕狀態
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }
    if (periodsArea) {
        periodsArea.style.display = 'none';
    }

    // 隱藏分鐘輸入区域
    const minutesSection = document.getElementById('manualMinutesInputSection');
    if (minutesSection) {
        minutesSection.style.display = 'none';
        document.getElementById('manualMinutesInput').value = '';
    }

    const now = new Date();
    const optionsHtml = [1, 2, 3].map(periods => {
        const endTime = new Date(now.getTime() + periods * 35 * 60000);
        const endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        return `
            <div class="period-option" onclick="confirmManualDetentionCheckin(${periods})">
                <div class="period-option-left">
                    <div class="period-option-title">${periods}${i18n.t('att.periodsUnit')}</div>
                    <div class="period-option-duration">${periods * 35}${i18n.t('att.minutesUnit')}</div>
                </div>
                <div class="period-option-time">${i18n.t('att.until')} ${endTimeStr}</div>
            </div>
        `;
    }).join('');

    document.getElementById('manualPeriodsOptions').innerHTML = optionsHtml;
    document.getElementById('manualPeriodsModal').classList.add('active');
}

// 關閉留堂手動簽到節數選擇
function closeManualPeriodsModal() {
    document.getElementById('manualPeriodsModal').classList.remove('active');
    pendingManualStudent = null;
    document.getElementById('cardInput').focus();
}

// 確認留堂手動簽到
async function confirmManualDetentionCheckin(periods) {
    if (!pendingManualStudent || !currentSessionId) {
        closeManualPeriodsModal();
        return;
    }

    // 验证是否選擇了原因
    if (!selectedManualDetentionReason) {
        showToast(i18n.t('att.pleaseSelectReason'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/detention/manual-checkin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: pendingManualStudent.user_login,
                planned_periods: periods,
                detention_reason: selectedManualDetentionReason
            })
        });

        const data = await response.json();
        closeManualPeriodsModal();

        if (data.success) {
            showScanResult(data);
            await loadSessionDetail();
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkinFailed'));
        }
    } catch (error) {
        console.error('手動簽到失敗:', error);
        showToast(i18n.t('att.checkinFailedRetry'));
        closeManualPeriodsModal();
    }
}

// 綁定：点击模態框外部關閉（等 DOM 就緒后綁定，避免取不到元素報錯）
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('manualScanModal');
    if (modal) {
        modal.addEventListener('click', function (e) {
            if (e.target === this) {
                hideManualScanModal();
            }
        });
    }
});


// 手動簽退（學生忘带卡时使用）
async function manualCheckout(userLogin, studentName) {
    if (!currentSessionId) {
        showToast(i18n.t('att.sessionNotStarted'));
        return;
    }

    // 確認對話框
    if (!confirm(i18n.t('att.confirmManualCheckout', {name: studentName}))) {
        return;
    }

    try {
        const response = await fetch('/api/attendance/detention/manual-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: userLogin
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(i18n.t('att.manualCheckoutSuccess', {name: studentName}) + '\n' + data.record.status_msg);
            await loadSessionDetail();  // 刷新列表
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkoutFailed'));
        }
    } catch (error) {
        console.error('手動簽退失敗:', error);
        showToast(i18n.t('att.checkoutFailedRetry'));
    }
}

// ========== 留堂专用函數 ==========

// 當前修改對象（用於“指定時間”修改）
let currentModifyUserLogin = null;
let currentModifyScanTimeStr = null;

// 顯示選擇節數模態框
function showPeriodsModal(student, options) {
    document.getElementById('periodsModalStudent').textContent =
        `${student.chinese_name} (${student.class_name}-${student.class_number}${i18n.t('att.numberSuffix')})`;

    // 重置原因選擇
    selectedDetentionReason = null;

    // 隱藏節數選擇区域，顯示原因選擇
    const reasonArea = document.getElementById('reasonSelectionArea');
    const periodsArea = document.getElementById('periodsSelectionArea');

    if (reasonArea) {
        reasonArea.style.display = 'block';
        // 重置原因按鈕狀態
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }
    if (periodsArea) {
        periodsArea.style.display = 'none';
    }

    // 隱藏分鐘輸入区域
    const minutesSection = document.getElementById('minutesInputSection');
    if (minutesSection) {
        minutesSection.style.display = 'none';
        document.getElementById('periodsMinutesInput').value = '';
    }

    const optionsHtml = options.map(opt => `
                <div class="period-option" onclick="selectPeriods(${opt.periods})">
                    <div class="period-option-left">
                        <div class="period-option-title">${opt.periods}${i18n.t('att.periodsUnit')}</div>
                        <div class="period-option-duration">${opt.duration_minutes}${i18n.t('att.minutesUnit')}</div>
                    </div>
                    <div class="period-option-time">${i18n.t('att.until')} ${opt.end_time}</div>
                </div>
            `).join('');

    document.getElementById('periodsOptions').innerHTML = optionsHtml;
    document.getElementById('periodsModal').classList.add('active');
}

// 關閉選擇節數模態框
function closePeriodsModal() {
    document.getElementById('periodsModal').classList.remove('active');
    pendingCardId = null;
    pendingStudent = null;
    pendingOptions = null;
    document.getElementById('cardInput').focus();
}

// 選擇節數并簽到
async function selectPeriods(periods) {
    if (!pendingCardId || !currentSessionId) {
        closePeriodsModal();
        return;
    }

    // 验证是否選擇了原因
    if (!selectedDetentionReason) {
        showToast(i18n.t('att.pleaseSelectReason'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/detention/checkin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                card_id: pendingCardId,
                planned_periods: periods,
                detention_reason: selectedDetentionReason
            })
        });

        const data = await response.json();
        closePeriodsModal();
        showScanResult(data);

        if (data.success) {
            loadSessionDetail();
        }
    } catch (error) {
        showToast(i18n.t('att.checkinFailed'));
        closePeriodsModal();
    }
}

// 顯示修改留堂設定模態框（節數 / 指定結束時間）
function showModifyModal(userLogin, studentName, currentPeriods, scanTimeStr) {
    // 儲存當前正在修改的學生
    currentModifyUserLogin = userLogin;
    currentModifyScanTimeStr = scanTimeStr || null;

    document.getElementById('modifyModalStudent').textContent = studentName;

    // 初始化 Tab 狀態
    switchModifyTab('periods');

    // 寫入簽到時間顯示
    if (scanTimeStr) {
        const dt = new Date(scanTimeStr);
        const st = dt.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        document.getElementById('modifyScanTime').textContent = st;

        // 預設給結束時間一个建議值：按當前節數推算
        const endTime = new Date(dt.getTime() + (currentPeriods || 1) * 35 * 60000);
        const hh = String(endTime.getHours()).padStart(2, '0');
        const mm = String(endTime.getMinutes()).padStart(2, '0');
        document.getElementById('modifyEndTimeInput').value = `${hh}:${mm}`;
    } else {
        document.getElementById('modifyScanTime').textContent = '--:--';
        document.getElementById('modifyEndTimeInput').value = '';
    }

    // 生成節數選項（与原邏輯一致）
    const now = new Date();
    const optionsHtml = [1, 2, 3].map(periods => {
        const endTime = new Date(now.getTime() + periods * 35 * 60000);
        const endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        const isCurrent = periods === currentPeriods;
        return `
                    <div class="period-option ${isCurrent ? 'current' : ''}"
                         onclick="modifyPeriods('${userLogin}', ${periods})">
                        <div class="period-option-left">
                            <div class="period-option-title">${periods}${i18n.t('att.periodsUnit')} ${isCurrent ? `(${i18n.t('att.current')})` : ''}</div>
                            <div class="period-option-duration">${periods * 35}${i18n.t('att.minutesUnit')}</div>
                        </div>
                        <div class="period-option-time">${i18n.t('att.until')} ${endTimeStr}</div>
                    </div>
                `;
    }).join('');

    document.getElementById('modifyOptions').innerHTML = optionsHtml;
    // 打開模態框
    document.getElementById('modifyModal').classList.add('active');

    // 更新一次時間預覽
    updateTimePreview();
}

// 關閉修改留堂設定模態框
function closeModifyModal() {
    document.getElementById('modifyModal').classList.remove('active');
    currentModifyUserLogin = null;
    currentModifyScanTimeStr = null;
}

// 修改節數
async function modifyPeriods(userLogin, newPeriods) {
    try {
        const response = await fetch('/api/attendance/detention/modify-periods', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: userLogin,
                new_periods: newPeriods
            })
        });

        const data = await response.json();
        closeModifyModal();

        if (data.success) {
            showToast(i18n.t('att.modifiedToPeriods', {periods: newPeriods}));
            loadSessionDetail();
        } else {
            showToast(i18n.t('att.modifyFailed') + ': ' + data.detail);
        }
    } catch (error) {
        showToast(i18n.t('att.modifyFailed'));
        closeModifyModal();
    }
}

function switchModifyTab(tab) {
    const tabs = document.querySelectorAll('#modifyModal .modify-tab');
    tabs.forEach(t => t.classList.remove('active'));

    const periodsPanel = document.getElementById('modifyPeriodsPanel');
    const timePanel = document.getElementById('modifyEndTimePanel');

    // 使用 display 控制顯示/隱藏
    if (tab === 'endTime') {
        tabs[1].classList.add('active');
        periodsPanel.style.display = 'none';
        timePanel.style.display = 'block';
    } else {
        tabs[0].classList.add('active');
        periodsPanel.style.display = 'block';
        timePanel.style.display = 'none';
    }
}

// 更新“預計留堂时长”預覽
function updateTimePreview() {
    const previewEl = document.getElementById('timePreviewValue');
    const btn = document.getElementById('confirmTimeBtn');
    const endTimeInput = document.getElementById('modifyEndTimeInput');

    // Safety check: exit if elements don't exist
    if (!previewEl || !btn || !endTimeInput) {
        console.warn('updateTimePreview: Missing required DOM elements');
        return;
    }

    const endTimeVal = endTimeInput.value;

    if (!currentModifyScanTimeStr || !endTimeVal) {
        previewEl.textContent = '-- ' + i18n.t('att.minutesUnit');
        btn.disabled = true;
        return;
    }

    const scanDt = new Date(currentModifyScanTimeStr);
    const [hh, mm] = endTimeVal.split(':').map(v => parseInt(v, 10));
    const endDt = new Date(scanDt);
    endDt.setHours(hh, mm, 0, 0);

    const diffMin = Math.round((endDt.getTime() - scanDt.getTime()) / 60000);

    if (diffMin <= 0) {
        previewEl.textContent = i18n.t('att.endTimeMustBeLater');
        btn.disabled = true;
        return;
    }

    previewEl.textContent = `${diffMin} ${i18n.t('att.minutesUnit')}`;
    btn.disabled = false;
}

// 確認修改結束時間（呼叫後端 /detention/modify-end-time）
async function confirmModifyEndTime() {
    if (!currentSessionId || !currentModifyUserLogin) {
        showToast(i18n.t('att.cannotModifyMissingInfo'));
        return;
    }

    const endTimeVal = document.getElementById('modifyEndTimeInput').value;
    if (!endTimeVal) {
        showToast(i18n.t('att.pleaseSelectEndTime'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/detention/modify-end-time', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: currentModifyUserLogin,
                new_end_time: endTimeVal
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(i18n.t('att.endTimeModified', {time: data.new_end_time}));
            closeModifyModal();
            loadSessionDetail();
        } else {
            showToast(data.detail || i18n.t('att.modifyFailed'));
        }
    } catch (error) {
        console.error('修改結束時間失敗:', error);
        showToast(i18n.t('att.modifyFailed'));
    }
}

// 啟動倒計時刷新
function startCountdownRefresh() {
    // 清除旧的定时器
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    // 每秒更新倒計時顯示
    countdownInterval = setInterval(() => {
        updateCountdowns();
    }, 1000);
}

// 停止倒計時刷新
function stopCountdownRefresh() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// 更新所有倒計時顯示
function updateCountdowns() {
    const countdownCells = document.querySelectorAll('.countdown-cell[data-end-time]');
    const now = new Date().getTime();

    countdownCells.forEach(cell => {
        const endTime = parseInt(cell.dataset.endTime);
        const remaining = endTime - now;

        if (remaining > 0) {
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            cell.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

            // 根據剩餘時間設定顏色
            cell.classList.remove('overtime', 'warning', 'normal');
            if (minutes < 1) {
                cell.classList.add('warning');
            } else {
                cell.classList.add('normal');
            }
        } else {
            cell.textContent = i18n.t('att.timeUp');
            cell.classList.remove('warning', 'normal');
            cell.classList.add('overtime');
        }
    });
}

// 渲染留堂紀錄
function renderDetentionRecords(students) {
    // 儲存原始數據
    detentionStudentsData = students;

    // 如果有排序設定，進行排序
    let sortedStudents = [...students];
    if (detentionSortField) {
        sortedStudents = sortDetentionData(sortedStudents, detentionSortField, detentionSortOrder);
    }
    // 将真正完成留堂的學生放到列表最後
    sortedStudents = sortedStudents.sort((a, b) => {
        // 判断是否真正完成留堂
        const isReallyCompletedA = a.status === 'detention_completed' &&
            ((a.planned_minutes != null && (a.actual_minutes || 0) >= a.planned_minutes) ||
                (a.planned_minutes == null && (a.actual_periods || 0) >= (a.planned_periods || 0)));
        const isReallyCompletedB = b.status === 'detention_completed' &&
            ((b.planned_minutes != null && (b.actual_minutes || 0) >= b.planned_minutes) ||
                (b.planned_minutes == null && (b.actual_periods || 0) >= (b.planned_periods || 0)));

        if (isReallyCompletedA && !isReallyCompletedB) return 1;  // 已完成的排后面
        if (!isReallyCompletedA && isReallyCompletedB) return -1; // 未完成的排前面
        return 0; // 同狀態保持原有顺序
    });
    const tbody = document.getElementById('detentionRecordsBody');

    tbody.innerHTML = sortedStudents.map(s => {
        const status = s.status || 'absent';
        let statusText, statusClass;

        if (status === 'detention_active') {
            statusText = i18n.t('att.inProgress');
            statusClass = 'detention_active';
        } else if (status === 'detention_completed') {
            // 根據是否使用分鐘模式来判断完成狀態
            let isCompleted = false;
            if (s.planned_minutes !== null && s.planned_minutes !== undefined) {
                // 分鐘模式：按分鐘數判断
                isCompleted = (s.actual_minutes || 0) >= s.planned_minutes;
            } else {
                // 節數模式：按節數判断
                isCompleted = (s.actual_periods || 0) >= (s.planned_periods || 0);
            }

            if (isCompleted) {
                statusText = i18n.t('att.completed');
                statusClass = 'detention_completed';
            } else {
                statusText = i18n.t('att.incomplete');
                statusClass = 'incomplete';
            }
        } else {
            statusText = i18n.t('att.notCheckedIn');
            statusClass = 'absent';
        }

        // 簽到時間
        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false
        }) : '-';

        // 簽退時間
        const checkoutTime = s.checkout_time ? new Date(s.checkout_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false
        }) : '-';

        // 計劃結束時間（僅用於傳參）
        const plannedEndTime = s.planned_end_time
            ? new Date(s.planned_end_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
                hour: '2-digit', minute: '2-digit', hour12: false
            })
            : '';

        // 剩餘時間或實際時間
        let timeDisplay = '-';
        let countdownAttr = '';
        if (status === 'detention_active' && s.planned_end_time) {
            const endTime = new Date(s.planned_end_time).getTime();
            countdownAttr = `data-end-time="${endTime}"`;
            timeDisplay = i18n.t('att.calculating');
        } else if (status === 'detention_completed') {
            timeDisplay = `${s.actual_minutes || 0}${i18n.t('att.minShort')}/${s.actual_periods || 0}${i18n.t('att.periodsUnit')}`;
        }

// 操作按鈕
        let actionHtml = '-';
        if (status === 'detention_active') {
            const escapedName = (s.chinese_name || '').replace(/'/g, "\\'");
            const scanTimeStr = s.scan_time || '';
            const plannedEndStr = s.planned_end_time || '';
            actionHtml = `
                <button class="modify-btn"
                    onclick="showModifyModal(
                        '${s.user_login}',
                        '${escapedName}',
                        ${s.planned_periods || 0},
                        '${scanTimeStr}'
                    )">
                    ${i18n.t('att.modify')}
                </button>
<button class="leave-btn"
                    onclick="showLeaveConfirmModal(
                        '${s.user_login}',
                        '${escapedName}',
                        '${scanTimeStr}',
                        '${plannedEndStr}',
                        ${s.planned_periods || 0},
                        ${s.planned_minutes != null ? s.planned_minutes : 'null'}
                    )">
                    ${i18n.t('att.leave')}
                </button>
            `;
        }

        return `
            <tr>
                <td>${s.class_name}-${s.class_number}</td>
                <td>${s.chinese_name}</td>
                <td>${getReasonTagHtml(s.detention_reason)}</td>
                <td>${scanTime}</td>
                <td>${checkoutTime}</td>
                <td>${s.planned_minutes != null && s.planned_minutes > 0 ? s.planned_minutes + i18n.t('att.minutesUnit') : (s.planned_periods || 0) + i18n.t('att.periodsUnit')}</td>
                <td>${plannedEndTime || '-'}</td>
                <td class="countdown-cell" ${countdownAttr}>${timeDisplay}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');

    // 立即更新一次倒計時
    updateCountdowns();

    // 更新表头排序指示器
    updateSortIndicators();
}

// 排序留堂紀錄
function sortDetentionRecords(field) {
    // 如果點擊同一列，切換排序順序
    if (detentionSortField === field) {
        detentionSortOrder = detentionSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        detentionSortField = field;
        detentionSortOrder = 'asc';
    }

    // 重新渲染
    renderDetentionRecords(detentionStudentsData);
}

// 排序數據
function sortDetentionData(students, field, order) {
    return students.sort((a, b) => {
        // 【修復】首先：已簽退的學生始終排在最後（不管當前是什麼排序方式）
        const aCompleted = a.status === 'detention_completed';
        const bCompleted = b.status === 'detention_completed';

        if (aCompleted && !bCompleted) return 1;  // a已完成，排后面
        if (!aCompleted && bCompleted) return -1; // b已完成，排后面

        // 如果都是已完成或都未完成，按正常字段排序
        let valueA, valueB;

        switch (field) {
            case 'class':
                // 按班級排序：先按班級名，再按班號
                valueA = `${a.class_name}-${String(a.class_number).padStart(2, '0')}`;
                valueB = `${b.class_name}-${String(b.class_number).padStart(2, '0')}`;
                break;

            case 'scanTime':
                // 按簽到時間排序，未簽到的排在最後
                valueA = a.scan_time ? new Date(a.scan_time).getTime() : (order === 'asc' ? Infinity : -Infinity);
                valueB = b.scan_time ? new Date(b.scan_time).getTime() : (order === 'asc' ? Infinity : -Infinity);
                break;

            case 'remaining': {
                // 按剩餘時間排序
                // 進行中的按剩餘時間，已完成的按實際時間，未簽到的排最後
                const now = Date.now();
                if (a.status === 'detention_active' && a.planned_end_time) {
                    valueA = new Date(a.planned_end_time).getTime() - now;
                } else if (a.status === 'detention_completed') {
                    valueA = -(a.actual_minutes || 0);
                } else {
                    valueA = order === 'asc' ? Infinity : -Infinity;
                }

                if (b.status === 'detention_active' && b.planned_end_time) {
                    valueB = new Date(b.planned_end_time).getTime() - now;
                } else if (b.status === 'detention_completed') {
                    valueB = -(b.actual_minutes || 0);
                } else {
                    valueB = order === 'asc' ? Infinity : -Infinity;
                }
                break;
            }

            default:
                return 0;
        }

        // 比较
        if (valueA < valueB) return order === 'asc' ? -1 : 1;
        if (valueA > valueB) return order === 'asc' ? 1 : -1;
        return 0;
    });
}

// 更新表头排序指示器
function updateSortIndicators() {
    const headers = document.querySelectorAll('#detentionRecordsTable th.sortable');
    headers.forEach(th => {
        th.classList.remove('asc', 'desc');
    });

    if (detentionSortField) {
        const fieldMap = {
            'class': 0,
            'scanTime': 2,
            'remaining': 5
        };
        const index = fieldMap[detentionSortField];
        if (index !== undefined) {
            const sortableThs = document.querySelectorAll('#detentionRecordsTable th.sortable');
            // 找到對應的th
            let count = 0;
            document.querySelectorAll('#detentionRecordsTable th').forEach((th, i) => {
                if (th.classList.contains('sortable')) {
                    if ((detentionSortField === 'class' && count === 0) ||
                        (detentionSortField === 'scanTime' && count === 1) ||
                        (detentionSortField === 'remaining' && count === 2)) {
                        th.classList.add(detentionSortOrder);
                    }
                    count++;
                }
            });
        }
    }
}

// 更新留堂統計
function updateDetentionStats(stats) {
    document.getElementById('statActive').textContent = stats.active || 0;
    document.getElementById('statCompleted').textContent = stats.completed || 0;
    document.getElementById('statIncomplete').textContent = stats.incomplete || 0;
    document.getElementById('statNotCheckedIn').textContent = stats.not_checked_in || 0;
}

// ========== 離開確認功能 ==========

var pendingLeaveUserLogin = null;
var pendingLeaveStudentName = null;

// 顯示離開確認彈窗
function showLeaveConfirmModal(userLogin, studentName, scanTimeStr, plannedEndStr, plannedPeriods, plannedMinutesParam) {
    pendingLeaveUserLogin = userLogin;
    pendingLeaveStudentName = studentName;

    document.getElementById('leaveConfirmStudent').textContent = studentName;

    // 解析時間
    var scanTime = scanTimeStr ? new Date(scanTimeStr) : null;
    var plannedEnd = plannedEndStr ? new Date(plannedEndStr) : null;
    var now = new Date();

    // 顯示簽到時間
    if (scanTime) {
        document.getElementById('leaveConfirmScanTime').textContent =
            scanTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
    } else {
        document.getElementById('leaveConfirmScanTime').textContent = '--:--';
    }

    // 顯示計劃結束時間
    if (plannedEnd) {
        document.getElementById('leaveConfirmPlannedEnd').textContent =
            plannedEnd.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
    } else {
        document.getElementById('leaveConfirmPlannedEnd').textContent = '--:--';
    }

    // 計算已留時間
    if (scanTime) {
        var actualMinutes = Math.floor((now.getTime() - scanTime.getTime()) / 60000);
        document.getElementById('leaveConfirmActualTime').textContent = actualMinutes + ' ' + i18n.t('att.minutesUnit');

        // 檢查是否完成計劃时长（優先使用分鐘模式）
        var plannedMinutes;
        if (plannedMinutesParam != null) {
            // 分鐘模式
            plannedMinutes = plannedMinutesParam;
        } else {
            // 節數模式
            plannedMinutes = plannedPeriods * 35;
        }

        var warningRow = document.getElementById('leaveWarningRow');
        if (actualMinutes < plannedMinutes) {
            warningRow.style.display = 'flex';
        } else {
            warningRow.style.display = 'none';
        }
    } else {
        document.getElementById('leaveConfirmActualTime').textContent = '-- ' + i18n.t('att.minutesUnit');
        document.getElementById('leaveWarningRow').style.display = 'none';
    }

    document.getElementById('leaveConfirmModal').classList.add('active');
}

// 關閉離開確認彈窗
function closeLeaveConfirmModal() {
    document.getElementById('leaveConfirmModal').classList.remove('active');
    pendingLeaveUserLogin = null;
    pendingLeaveStudentName = null;
}

// 確認離開（執行簽退）
async function confirmLeave() {
    if (!pendingLeaveUserLogin || !currentSessionId) {
        closeLeaveConfirmModal();
        return;
    }

    try {
        var response = await fetch('/api/attendance/detention/manual-checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: pendingLeaveUserLogin
            })
        });

        var data = await response.json();
        closeLeaveConfirmModal();

        if (data.success) {
            showToast(i18n.t('att.studentCheckedOut', {name: pendingLeaveStudentName}));
            await loadSessionDetail();
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkoutFailed'));
        }
    } catch (error) {
        console.error('簽退失敗:', error);
        showToast(i18n.t('att.checkoutFailedRetry'));
        closeLeaveConfirmModal();
    }
}

// ========== 分鐘數簽到功能 ==========

// 更新拍卡簽到的分鐘數預覽
function updatePeriodsMinutesPreview() {
    var input = document.getElementById('periodsMinutesInput');
    var preview = document.getElementById('periodsMinutesPreview');
    var btn = document.getElementById('periodsMinutesConfirmBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    var now = new Date();
    var endTime = new Date(now.getTime() + minutes * 60000);
    var endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});

    preview.textContent = i18n.t('att.estimatedUntil') + ' ' + endTimeStr;
    preview.className = 'minutes-preview valid';
    btn.disabled = false;
}

// 確認使用分鐘數簽到（拍卡）
async function confirmPeriodsWithMinutes() {
    var minutes = parseInt(document.getElementById('periodsMinutesInput').value);
    if (!minutes || !pendingCardId || !currentSessionId) {
        closePeriodsModal();
        return;
    }

    // 验证是否選擇了原因
    if (!selectedDetentionReason) {
        showToast(i18n.t('att.pleaseSelectReason'));
        return;
    }

    try {
        var response = await fetch('/api/attendance/detention/checkin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                card_id: pendingCardId,
                planned_minutes: minutes,
                detention_reason: selectedDetentionReason
            })
        });

        var data = await response.json();
        closePeriodsModal();
        showScanResult(data);

        if (data.success) {
            loadSessionDetail();
        }
    } catch (error) {
        showToast(i18n.t('att.checkinFailed'));
        closePeriodsModal();
    }
}

// 更新手動簽到的分鐘數預覽
function updateManualMinutesPreview() {
    var input = document.getElementById('manualMinutesInput');
    var preview = document.getElementById('manualMinutesPreview');
    var btn = document.getElementById('manualMinutesConfirmBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    var now = new Date();
    var endTime = new Date(now.getTime() + minutes * 60000);
    var endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});

    preview.textContent = i18n.t('att.estimatedUntil') + ' ' + endTimeStr;
    preview.className = 'minutes-preview valid';
    btn.disabled = false;
}

// 確認使用分鐘數手動簽到
async function confirmManualDetentionWithMinutes() {
    var minutes = parseInt(document.getElementById('manualMinutesInput').value);
    if (!minutes || !pendingManualStudent || !currentSessionId) {
        closeManualPeriodsModal();
        return;
    }

    // 验证是否選擇了原因
    if (!selectedManualDetentionReason) {
        showToast(i18n.t('att.pleaseSelectReason'));
        return;
    }

    try {
        var response = await fetch('/api/attendance/detention/manual-checkin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: pendingManualStudent.user_login,
                planned_minutes: minutes,
                detention_reason: selectedManualDetentionReason
            })
        });

        var data = await response.json();
        closeManualPeriodsModal();

        if (data.success) {
            showScanResult(data);
            await loadSessionDetail();
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkinFailed'));
        }
    } catch (error) {
        console.error('手動簽到失敗:', error);
        showToast(i18n.t('att.checkinFailedRetry'));
        closeManualPeriodsModal();
    }
}

// ========== 修改功能增強（支持分鐘數 Tab） ==========

// 重写 switchModifyTab 函數支持新的 minutes Tab
function switchModifyTab(tab) {
    var tabs = document.querySelectorAll('#modifyModal .modify-tab');
    tabs.forEach(function (t) {
        t.classList.remove('active');
    });

    var periodsPanel = document.getElementById('modifyPeriodsPanel');
    var minutesPanel = document.getElementById('modifyMinutesPanel');
    var timePanel = document.getElementById('modifyEndTimePanel');

    // 隱藏所有面板
    if (periodsPanel) periodsPanel.style.display = 'none';
    if (minutesPanel) minutesPanel.style.display = 'none';
    if (timePanel) timePanel.style.display = 'none';

    // 顯示對應面板
    if (tab === 'minutes') {
        var tabBtn = document.getElementById('tabMinutes');
        if (tabBtn) tabBtn.classList.add('active');
        if (minutesPanel) minutesPanel.style.display = 'block';
        // 同步簽到時間顯示
        var scanTimeEl = document.getElementById('modifyScanTime');
        var minutesScanTimeEl = document.getElementById('modifyMinutesScanTime');
        if (scanTimeEl && minutesScanTimeEl) {
            minutesScanTimeEl.textContent = scanTimeEl.textContent;
        }
    } else if (tab === 'endTime') {
        var tabBtn2 = document.getElementById('tabEndTime');
        if (tabBtn2) tabBtn2.classList.add('active');
        if (timePanel) timePanel.style.display = 'block';
    } else {
        var tabBtn3 = document.getElementById('tabPeriods');
        if (tabBtn3) tabBtn3.classList.add('active');
        if (periodsPanel) periodsPanel.style.display = 'block';
    }
}

// 更新修改分鐘數預覽
function updateModifyMinutesPreview() {
    var input = document.getElementById('modifyMinutesInput');
    var preview = document.getElementById('modifyMinutesPreview');
    var btn = document.getElementById('confirmMinutesBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    if (currentModifyScanTimeStr) {
        var scanTime = new Date(currentModifyScanTimeStr);
        var endTime = new Date(scanTime.getTime() + minutes * 60000);
        var endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        preview.textContent = i18n.t('att.estimatedUntil') + ' ' + endTimeStr;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    } else {
        preview.textContent = '';
        btn.disabled = true;
    }
}

// 確認按分鐘數修改
async function confirmModifyMinutes() {
    var minutes = parseInt(document.getElementById('modifyMinutesInput').value);
    if (!minutes || !currentModifyUserLogin || !currentSessionId) {
        showToast(i18n.t('att.cannotModifyMissingInfo'));
        return;
    }

    try {
        var response = await fetch('/api/attendance/detention/modify-periods', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authToken
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: currentModifyUserLogin,
                new_minutes: minutes
            })
        });

        var data = await response.json();

        if (data.success) {
            showToast(data.message || i18n.t('att.modifiedToMinutes', {minutes: minutes}));
            closeModifyModal();
            loadSessionDetail();
        } else {
            showToast(data.detail || i18n.t('att.modifyFailed'));
        }
    } catch (error) {
        console.error('修改分鐘數失敗:', error);
        showToast(i18n.t('att.modifyFailed'));
    }
}

// ========== Apple 風格動畫效果（確保DOM已就緒） ==========
document.addEventListener('DOMContentLoaded', () => {

    // ========== Apple 風格平滑磁吸效果 ==========

    document.querySelectorAll('.type-btn, .action-btn, .toolbar-btn, .scan-btn').forEach(btn => {
        // 儲存目標位置和當前位置
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let animationId = null;

        // 平滑插值係數 (越小越平滑，0.08-0.15較理想)
        const smoothing = 0.12;
        // 磁吸强度 (越小越微妙)
        const magnetStrength = 0.15;

        // 動畫循环
        function animate() {
            // 平滑插值
            currentX += (targetX - currentX) * smoothing;
            currentY += (targetY - currentY) * smoothing;

            // 应用变换
            btn.style.transform = `translate(${currentX}px, ${currentY}px)`;

            // 如果還沒到達目標，繼續動畫
            if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
                animationId = requestAnimationFrame(animate);
            }
        }

        btn.addEventListener('mousemove', function (e) {
            const rect = this.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // 計算滑鼠相對於按鈕中心的偏移
            const deltaX = e.clientX - centerX;
            const deltaY = e.clientY - centerY;

            // 設定目標位置
            targetX = deltaX * magnetStrength;
            targetY = deltaY * magnetStrength;

            // 開始動畫（如果還沒開始）
            if (!animationId) {
                animationId = requestAnimationFrame(animate);
            }
        });

        btn.addEventListener('mouseleave', function () {
            // 回到原位
            targetX = 0;
            targetY = 0;

            // 確保動畫繼續直到回到原位
            if (!animationId) {
                animationId = requestAnimationFrame(animate);
            }

            // 清理動畫ID的監聽
            const checkReset = () => {
                if (Math.abs(currentX) < 0.1 && Math.abs(currentY) < 0.1) {
                    cancelAnimationFrame(animationId);
                    animationId = null;
                    btn.style.transform = '';
                }
            };

            setTimeout(checkReset, 300);
        });

        // 点击时的微妙缩放
        btn.addEventListener('mousedown', function () {
            this.style.transition = 'transform 0.1s ease';
            this.style.transform = `translate(${currentX}px, ${currentY}px) scale(0.97)`;
        });

        btn.addEventListener('mouseup', function () {
            this.style.transition = 'transform 0.2s ease';
            this.style.transform = `translate(${currentX}px, ${currentY}px) scale(1)`;
            setTimeout(() => {
                this.style.transition = '';
            }, 200);
        });
    });


    // ========== 更自然的涟漪效果 ==========

    function createRipple(event) {
        const button = event.currentTarget;

        // 移除旧的涟漪
        const existingRipple = button.querySelector('.ripple');
        if (existingRipple) {
            existingRipple.remove();
        }

        const rect = button.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height) * 2;
        const x = event.clientX - rect.left - size / 2;
        const y = event.clientY - rect.top - size / 2;

        const ripple = document.createElement('span');
        ripple.className = 'ripple';
        ripple.style.cssText = `
                position: absolute;
                width: ${size}px;
                height: ${size}px;
                left: ${x}px;
                top: ${y}px;
                background: radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%);
                border-radius: 50%;
                transform: scale(0);
                opacity: 1;
                pointer-events: none;
            `;

        button.appendChild(ripple);

        // 使用 Web Animations API 實現更平滑的動畫
        ripple.animate([
            {transform: 'scale(0)', opacity: 0.5},
            {transform: 'scale(1)', opacity: 0}
        ], {
            duration: 600,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            fill: 'forwards'
        }).onfinish = () => ripple.remove();
    }

    // 添加涟漪效果到按鈕
    document.querySelectorAll('.type-btn, .action-btn, .toolbar-btn, .scan-btn, .quick-btn').forEach(btn => {
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        btn.addEventListener('click', createRipple);
    });


    // ========== 學生卡片悬停效果 ==========
    document.addEventListener('DOMContentLoaded', () => {
        // 为學生卡片添加平滑的悬停效果
        const studentList = document.getElementById('studentList');
        if (studentList) {
            studentList.addEventListener('mouseover', (e) => {
                const card = e.target.closest('.student-item');
                if (card) {
                    card.style.transition = 'all 0.2s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
                }
            });
        }
    });


    // ========== 輸入框聚焦光环效果 ==========

    document.querySelectorAll('.scan-input, .filter-input, .filter-select, .date-input').forEach(input => {
        input.addEventListener('focus', function () {
            this.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        });
        input.addEventListener('blur', function () {
            this.style.transition = 'all 0.2s ease';
        });
    });

    // ========== GSAP 啟動動畫（深綠系統喚醒，與 Login 一致） ==========
    window.addEventListener('load', () => {
        if (typeof gsap === 'undefined') return;

        const splashScreen = document.getElementById('splashScreen');
        const glassPanel   = document.getElementById('glassPanel');
        const header       = document.querySelector('.header');
        const leftPanel    = document.querySelector('.left-panel');
        const rightPanel   = document.querySelector('.right-panel');
        if (!splashScreen) return;

        const splashIcon   = splashScreen.querySelector('.splash-icon');
        const splashTitle  = splashScreen.querySelector('.splash-title');
        const splashSub    = splashScreen.querySelector('.splash-subtitle');
        const splashLoader = splashScreen.querySelector('.splash-loader');

        const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

        // 隱藏主界面元素，等動畫結束再顯示
        gsap.set([header, leftPanel, rightPanel].filter(Boolean), { opacity: 0 });

        /* ═══ 第一幕：系統喚醒 ≈ 2.5s ═══ */
        const tl = gsap.timeline();

        tl
            // emoji 點亮：blur → clear
            .to(splashIcon, {
                opacity: 1, filter: 'blur(0px)',
                duration: 1.0, ease: EASE
            }, 0.3)

            // 標題依序出現
            .to(splashTitle, {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.6, ease: 'power2.out'
            }, 0.8)
            .to(splashSub, {
                opacity: 1, filter: 'blur(0px)',
                duration: 0.6, ease: 'power2.out'
            }, 1.0)

            // 骨牌 loader 淡入 → 淡出
            .to(splashLoader, { opacity: 1, duration: 0.5, ease: 'power2.out' }, 1.1)
            .to(splashLoader, { opacity: 0, duration: 0.4, ease: 'power2.in' }, 1.9)

        /* ═══ 第二幕：過渡到主界面 ═══ */

            // 深綠遮罩升起
            .to(glassPanel, { opacity: 1, duration: 0.5, ease: EASE }, 2.3)

            // splash 藏在遮罩後移除
            .add(() => { splashScreen.style.display = 'none'; }, 2.7)

            // 準備主界面元素
            .add(() => {
                if (header)     gsap.set(header, { opacity: 0, y: -30 });
                if (leftPanel)  gsap.set(leftPanel, { opacity: 0, x: -50 });
                if (rightPanel) gsap.set(rightPanel, { opacity: 0, x: 50 });
            }, 2.75)

            // 遮罩淡去，露出主界面
            .to(glassPanel, {
                opacity: 0, duration: 0.6, ease: EASE,
                onComplete() { glassPanel.style.display = 'none'; }
            }, 2.8)

        /* ═══ 第三幕：界面元素進入 ═══ */

            // Header 從上方滑入
            .to(header, {
                opacity: 1, y: 0,
                duration: 0.6, ease: 'power2.out'
            }, 2.9)

            // 左側面板從左側滑入
            .to(leftPanel, {
                opacity: 1, x: 0,
                duration: 0.7, ease: 'power2.out'
            }, 3.05)

            // 右側面板從右側滑入
            .to(rightPanel, {
                opacity: 1, x: 0,
                duration: 0.7, ease: 'power2.out'
            }, 3.15);
    });
    // ========== 滑鼠聚光燈效果 ==========
    const spotlight = document.getElementById('spotlight');
    let spotlightX = 0, spotlightY = 0;
    let currentSpotX = 0, currentSpotY = 0;
    let isMouseInWindow = false;

    document.addEventListener('mouseenter', () => {
        isMouseInWindow = true;
        if (spotlight) spotlight.classList.add('active');
    });

    document.addEventListener('mouseleave', () => {
        isMouseInWindow = false;
        if (spotlight) spotlight.classList.remove('active');
    });

    document.addEventListener('mousemove', (e) => {
        spotlightX = e.clientX;
        spotlightY = e.clientY;
        if (!isMouseInWindow) {
            isMouseInWindow = true;
            if (spotlight) spotlight.classList.add('active');
        }
    });

    function animateSpotlight() {
        currentSpotX += (spotlightX - currentSpotX) * 0.08;
        currentSpotY += (spotlightY - currentSpotY) * 0.08;

        if (spotlight) {
            spotlight.style.left = currentSpotX + 'px';
            spotlight.style.top = currentSpotY + 'px';
        }
        requestAnimationFrame(animateSpotlight);
    }

    animateSpotlight();

    // ========== 卡片3D倾斜效果 ==========
    function init3DCards() {
        // 🆕 檢查是否有滑鼠
        if (!document.body.classList.contains('has-mouse')) {
            console.log('[3D] 觸摸模式，跳過 3D 效果');
            return;
        }
        // 原有代码...
    }

    // 🆕 監聽滑鼠連接/斷開
    matchMedia('(pointer: fine)').addEventListener('change', (e) => {
        if (e.matches) {
            init3DCards();  // 連接滑鼠 - 啟用 3D
            document.getElementById('spotlight').style.display = '';
        } else {
            // 斷開滑鼠 - 禁用效果
            document.getElementById('spotlight').style.display = 'none';
            document.querySelectorAll('.student-card').forEach(c => c.style.transform = '');
        }
    });

    // 初始化3D卡片效果（需要在學生列表渲染后呼叫）
    const originalRenderStudentList = renderStudentList;
    renderStudentList = function (students) {
        originalRenderStudentList(students);
        // 延遲一点確保DOM已更新
        setTimeout(init3DCards, 50);
    };

    // 頁面載入后也初始化一次
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init3DCards, 1000);
    });
// ========== 離開確認功能 ==========

    let pendingLeaveUserLogin = null;
    let pendingLeaveStudentName = null;

// 顯示離開確認彈窗
    function showLeaveConfirmModal(userLogin, studentName, scanTimeStr, plannedEndStr, plannedPeriods) {
        pendingLeaveUserLogin = userLogin;
        pendingLeaveStudentName = studentName;

        document.getElementById('leaveConfirmStudent').textContent = studentName;

        // 解析時間
        const scanTime = scanTimeStr ? new Date(scanTimeStr) : null;
        const plannedEnd = plannedEndStr ? new Date(plannedEndStr) : null;
        const now = new Date();

        // 顯示簽到時間
        if (scanTime) {
            document.getElementById('leaveConfirmScanTime').textContent =
                scanTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        } else {
            document.getElementById('leaveConfirmScanTime').textContent = '--:--';
        }

        // 顯示計劃結束時間
        if (plannedEnd) {
            document.getElementById('leaveConfirmPlannedEnd').textContent =
                plannedEnd.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
        } else {
            document.getElementById('leaveConfirmPlannedEnd').textContent = '--:--';
        }

        // 計算已留時間
        if (scanTime) {
            const actualMinutes = Math.floor((now.getTime() - scanTime.getTime()) / 60000);
            document.getElementById('leaveConfirmActualTime').textContent = `${actualMinutes} ${i18n.t('att.minutesUnit')}`;

            // 檢查是否完成計劃时长
            const plannedMinutes = plannedPeriods * 35;
            const warningRow = document.getElementById('leaveWarningRow');
            if (actualMinutes < plannedMinutes) {
                warningRow.style.display = 'flex';
            } else {
                warningRow.style.display = 'none';
            }
        } else {
            document.getElementById('leaveConfirmActualTime').textContent = '-- ' + i18n.t('att.minutesUnit');
            document.getElementById('leaveWarningRow').style.display = 'none';
        }

        document.getElementById('leaveConfirmModal').classList.add('active');
    }

// 關閉離開確認彈窗
    function closeLeaveConfirmModal() {
        document.getElementById('leaveConfirmModal').classList.remove('active');
        pendingLeaveUserLogin = null;
        pendingLeaveStudentName = null;
    }

// 確認離開（執行簽退）
    async function confirmLeave() {
        if (!pendingLeaveUserLogin || !currentSessionId) {
            closeLeaveConfirmModal();
            return;
        }

        try {
            const response = await fetch('/api/attendance/detention/manual-checkout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    user_login: pendingLeaveUserLogin
                })
            });

            const data = await response.json();
            closeLeaveConfirmModal();

            if (data.success) {
                showToast(i18n.t('att.studentCheckedOut', {name: pendingLeaveStudentName}));
                await loadSessionDetail();
            } else {
                showToast(data.message || data.detail || i18n.t('att.checkoutFailed'));
            }
        } catch (error) {
            console.error('簽退失敗:', error);
            showToast(i18n.t('att.checkoutFailedRetry'));
            closeLeaveConfirmModal();
        }
    }

// ========== 分鐘數簽到功能 ==========

// 更新拍卡簽到的分鐘數預覽
    function updatePeriodsMinutesPreview() {
        const input = document.getElementById('periodsMinutesInput');
        const preview = document.getElementById('periodsMinutesPreview');
        const btn = document.getElementById('periodsMinutesConfirmBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        const now = new Date();
        const endTime = new Date(now.getTime() + minutes * 60000);
        const endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});

        preview.textContent = `${i18n.t('att.estimatedUntil')} ${endTimeStr}`;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    }

// 確認使用分鐘數簽到（拍卡）
    async function confirmPeriodsWithMinutes() {
        const minutes = parseInt(document.getElementById('periodsMinutesInput').value);
        if (!minutes || !pendingCardId || !currentSessionId) {
            closePeriodsModal();
            return;
        }

        // 验证是否選擇了原因
        if (!selectedDetentionReason) {
            showToast(i18n.t('att.pleaseSelectReason'));
            return;
        }

        try {
            const response = await fetch('/api/attendance/detention/checkin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    card_id: pendingCardId,
                    planned_minutes: minutes,
                    detention_reason: selectedDetentionReason
                })
            });

            const data = await response.json();
            closePeriodsModal();
            showScanResult(data);

            if (data.success) {
                loadSessionDetail();
            }
        } catch (error) {
            showToast(i18n.t('att.checkinFailed'));
            closePeriodsModal();
        }
    }

// 更新手動簽到的分鐘數預覽
    function updateManualMinutesPreview() {
        const input = document.getElementById('manualMinutesInput');
        const preview = document.getElementById('manualMinutesPreview');
        const btn = document.getElementById('manualMinutesConfirmBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        const now = new Date();
        const endTime = new Date(now.getTime() + minutes * 60000);
        const endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});

        preview.textContent = `${i18n.t('att.estimatedUntil')} ${endTimeStr}`;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    }

// 確認使用分鐘數手動簽到
    async function confirmManualDetentionWithMinutes() {
        const minutes = parseInt(document.getElementById('manualMinutesInput').value);
        if (!minutes || !pendingManualStudent || !currentSessionId) {
            closeManualPeriodsModal();
            return;
        }

        // 验证是否選擇了原因
        if (!selectedManualDetentionReason) {
            showToast(i18n.t('att.pleaseSelectReason'));
            return;
        }

        try {
            const response = await fetch('/api/attendance/detention/manual-checkin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    user_login: pendingManualStudent.user_login,
                    planned_minutes: minutes,
                    detention_reason: selectedManualDetentionReason
                })
            });

            const data = await response.json();
            closeManualPeriodsModal();

            if (data.success) {
                showScanResult(data);
                await loadSessionDetail();
            } else {
                showToast(data.message || data.detail || i18n.t('att.checkinFailed'));
            }
        } catch (error) {
            console.error('手動簽到失敗:', error);
            showToast(i18n.t('att.checkinFailedRetry'));
            closeManualPeriodsModal();
        }
    }

// ========== 修改功能增強（支持分鐘數 Tab） ==========

// 重写 switchModifyTab 函數支持新的 minutes Tab
    function switchModifyTab(tab) {
        const tabs = document.querySelectorAll('#modifyModal .modify-tab');
        tabs.forEach(t => t.classList.remove('active'));

        const periodsPanel = document.getElementById('modifyPeriodsPanel');
        const minutesPanel = document.getElementById('modifyMinutesPanel');
        const timePanel = document.getElementById('modifyEndTimePanel');

        // 隱藏所有面板
        if (periodsPanel) periodsPanel.style.display = 'none';
        if (minutesPanel) minutesPanel.style.display = 'none';
        if (timePanel) timePanel.style.display = 'none';

        // 顯示對應面板
        if (tab === 'minutes') {
            document.getElementById('tabMinutes').classList.add('active');
            if (minutesPanel) minutesPanel.style.display = 'block';
            // 同步簽到時間顯示
            const scanTimeEl = document.getElementById('modifyScanTime');
            const minutesScanTimeEl = document.getElementById('modifyMinutesScanTime');
            if (scanTimeEl && minutesScanTimeEl) {
                minutesScanTimeEl.textContent = scanTimeEl.textContent;
            }
        } else if (tab === 'endTime') {
            document.getElementById('tabEndTime').classList.add('active');
            if (timePanel) timePanel.style.display = 'block';
        } else {
            document.getElementById('tabPeriods').classList.add('active');
            if (periodsPanel) periodsPanel.style.display = 'block';
        }
    }

// 更新修改分鐘數預覽
    function updateModifyMinutesPreview() {
        const input = document.getElementById('modifyMinutesInput');
        const preview = document.getElementById('modifyMinutesPreview');
        const btn = document.getElementById('confirmMinutesBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? i18n.t('att.minutesRange') : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        if (currentModifyScanTimeStr) {
            const scanTime = new Date(currentModifyScanTimeStr);
            const endTime = new Date(scanTime.getTime() + minutes * 60000);
            const endTimeStr = endTime.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});
            preview.textContent = `${i18n.t('att.estimatedUntil')} ${endTimeStr}`;
            preview.className = 'minutes-preview valid';
            btn.disabled = false;
        } else {
            preview.textContent = '';
            btn.disabled = true;
        }
    }

// 確認按分鐘數修改
    async function confirmModifyMinutes() {
        const minutes = parseInt(document.getElementById('modifyMinutesInput').value);
        if (!minutes || !currentModifyUserLogin || !currentSessionId) {
            showToast(i18n.t('att.cannotModifyMissingInfo'));
            return;
        }

        try {
            const response = await fetch('/api/attendance/detention/modify-periods', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`
                },
                body: JSON.stringify({
                    session_id: currentSessionId,
                    user_login: currentModifyUserLogin,
                    new_minutes: minutes
                })
            });

            const data = await response.json();

            if (data.success) {
                showToast(data.message || i18n.t('att.modifiedToMinutes', {minutes: minutes}));
                closeModifyModal();
                loadSessionDetail();
            } else {
                showToast(data.detail || i18n.t('att.modifyFailed'));
            }
        } catch (error) {
            console.error('修改分鐘數失敗:', error);
            showToast(i18n.t('att.modifyFailed'));
        }
    }

}); // 結束 Apple 風格動畫效果 DOMContentLoaded 包裹

// ========== 留堂原因選擇功能 ==========

// 選擇留堂原因（拍卡簽到用）
function selectDetentionReason(reason) {
    selectedDetentionReason = reason;

    // 更新按鈕狀態
    const modal = document.getElementById('periodsModal');
    if (modal) {
        modal.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        // 用 id 精確匹配
        const btnId = reason === 'homework' ? 'reasonHomework' : reason === 'morning' ? 'reasonMorning' : 'reasonBoth';
        const targetBtn = document.getElementById(btnId);
        if (targetBtn) targetBtn.classList.add('selected');
    }

    // 顯示節數選擇区域
    const periodsArea = document.getElementById('periodsSelectionArea');
    if (periodsArea) {
        periodsArea.style.display = 'block';
    }

    // 「功課+晨讀」默認自動選擇 2 節
    if (reason === 'both') {
        setTimeout(() => {
            const periodOptions = document.querySelectorAll('#periodsOptions .period-option');
            periodOptions.forEach(opt => opt.classList.remove('highlighted'));
            if (periodOptions.length >= 2) {
                periodOptions[1].classList.add('highlighted');
            }
        }, 50);
    } else {
        // 清除高亮
        document.querySelectorAll('#periodsOptions .period-option').forEach(opt => {
            opt.classList.remove('highlighted');
        });
    }
}

// 選擇留堂原因（手動簽到用）
function selectManualDetentionReason(reason) {
    selectedManualDetentionReason = reason;

    // 更新按鈕狀態
    const modal = document.getElementById('manualPeriodsModal');
    if (modal) {
        modal.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
        const btnId = reason === 'homework' ? 'manualReasonHomework' : reason === 'morning' ? 'manualReasonMorning' : 'manualReasonBoth';
        const targetBtn = document.getElementById(btnId);
        if (targetBtn) targetBtn.classList.add('selected');
    }

    // 顯示節數選擇区域
    const periodsArea = document.getElementById('manualPeriodsSelectionArea');
    if (periodsArea) {
        periodsArea.style.display = 'block';
    }

    // 「功課+晨讀」默認自動選擇 2 節
    if (reason === 'both') {
        setTimeout(() => {
            const periodOptions = document.querySelectorAll('#manualPeriodsOptions .period-option');
            periodOptions.forEach(opt => opt.classList.remove('highlighted'));
            if (periodOptions.length >= 2) {
                periodOptions[1].classList.add('highlighted');
            }
        }, 50);
    } else {
        document.querySelectorAll('#manualPeriodsOptions .period-option').forEach(opt => {
            opt.classList.remove('highlighted');
        });
    }
}

// 切换分鐘數輸入顯示（拍卡簽到用）
function toggleMinutesInput() {
    const section = document.getElementById('minutesInputSection');
    if (section) {
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            document.getElementById('periodsMinutesInput').focus();
        }
    }
}

// 切换分鐘數輸入顯示（手動簽到用）
function toggleManualMinutesInput() {
    const section = document.getElementById('manualMinutesInputSection');
    if (section) {
        const isHidden = section.style.display === 'none';
        section.style.display = isHidden ? 'block' : 'none';
        if (isHidden) {
            document.getElementById('manualMinutesInput').focus();
        }
    }
}

// 取得原因標籤HTML
function getReasonTagHtml(reason) {
    if (!reason) {
        return `<span class="reason-tag unknown">${i18n.t('att.reasonUnknown')}</span>`;
    }
    if (reason === 'homework') {
        return `<span class="reason-tag homework">${i18n.t('att.reasonHomework')}</span>`;
    }
    if (reason === 'morning') {
        return `<span class="reason-tag morning">${i18n.t('att.reasonMorning')}</span>`;
    }
    if (reason === 'both') {
        return `<span class="reason-tag both">${i18n.t('att.reasonBoth')}</span>`;
    }
    return '<span class="reason-tag unknown">' + reason + '</span>';
}

// ============ 課外活動功能 ============

// 課外活動狀態变量
let activityGroups = [];
let currentActivityConfig = {
    name: '',
    startTime: '16:00',
    endTime: '17:30',
    lateThreshold: 10,
    earlyThreshold: 10
};
let activityStudentsData = [];
let activitySortField = 'class';
let activitySortOrder = 'asc';
let pendingCheckoutStudent = null;

// 修改 selectType 函數以支持課外活動
const originalSelectType = selectType;
selectType = function (type) {
    currentSessionType = type;
    saveSessionState();

    // 更新按鈕狀態
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const typeBtn = document.querySelector(`.type-btn.${type}`);
    if (typeBtn) typeBtn.classList.add('active');

    // 顯示/隱藏課外活動配置区域
    const activityConfig = document.getElementById('activityConfigSection');
    const studentSelectSection = document.getElementById('studentSelectSection');
    const selectedCountSection = document.getElementById('selectedCountSection');
    const saveListBtn = document.getElementById('saveListBtn');

    if (type === 'activity') {
        // 課外活動模式
        if (activityConfig) activityConfig.style.display = 'block';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        if (saveListBtn) saveListBtn.style.display = 'none';
        loadActivityGroups();
    } else {
        // 晨讀/留堂模式
        if (activityConfig) activityConfig.style.display = 'none';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        if (saveListBtn) saveListBtn.style.display = 'none';
    }

    loadFixedLists();
};

// 載入固定組別
async function loadActivityGroups() {
    try {
        const response = await fetch('/api/attendance/activity-groups', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            activityGroups = data.groups || [];
            renderActivityGroups();
        }
    } catch (error) {
        console.error('載入組別失敗:', error);
        activityGroups = [];
        renderActivityGroups();
    }
}

// 渲染固定組別按鈕
function renderActivityGroups() {
    const container = document.getElementById('activityGroupsList');
    if (!container) return;

    if (activityGroups.length === 0) {
        container.innerHTML = `
            <span class="no-groups-hint">${i18n.t('att.noGroups')}</span>
            <button class="manage-groups-btn" onclick="openActivityGroupModal()">
                ${ATT.settings} ${i18n.t('att.manageGroups')}
            </button>
        `;
        return;
    }

    container.innerHTML = activityGroups.map(group => `
        <button class="activity-group-btn" 
                onclick="loadActivityGroup(${group.id})"
                data-group-id="${group.id}">
            ${group.name}
            <span class="group-count">${group.student_count}${i18n.t('att.people')}</span>
        </button>
    `).join('') + `
        <button class="manage-groups-btn" onclick="openActivityGroupModal()">
            ${ATT.settings} ${i18n.t('att.manageGroups')}
        </button>
    `;
}

// 載入某个組別的學生
async function loadActivityGroup(groupId) {
    try {
        const response = await fetch(`/api/attendance/activity-groups/${groupId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            selectedStudents.clear();
            data.students.forEach(s => selectedStudents.add(s.user_login));

            updateActivitySelectedCount();
            updateActivitySelectBtn();

            document.querySelectorAll('.activity-group-btn').forEach(btn => {
                btn.classList.remove('selected');
                if (parseInt(btn.dataset.groupId) === groupId) {
                    btn.classList.add('selected');
                }
            });

            showToast(i18n.t('att.groupLoaded', {name: data.group.name}));
        }
    } catch (error) {
        console.error('載入組別失敗:', error);
        showToast(i18n.t('att.loadGroupFailed'));
    }
}

// 更新課外活動已選人數
function updateActivitySelectedCount() {
    const countEl = document.getElementById('activityStudentCount');
    if (countEl) countEl.textContent = selectedStudents.size;
}

// 更新課外活動選擇按鈕狀態
function updateActivitySelectBtn() {
    const btn = document.getElementById('activitySelectStudentBtn');
    if (!btn) return;

    const count = selectedStudents.size;
    if (count > 0) {
        btn.classList.add('has-selection');
        btn.innerHTML = ATT.users + ' ' + i18n.t('att.selectedStudentsEdit', {count: count});
    } else {
        btn.classList.remove('has-selection');
        btn.innerHTML = ATT.users + ' ' + i18n.t('att.clickSelectStudents');
    }

    updateActivitySelectedCount();
}

// 打開組別管理模態框
function openActivityGroupModal() {
    document.getElementById('activityGroupModal').classList.add('active');
    renderActivityGroupsManageList();
}

// 關閉組別管理模態框
function closeActivityGroupModal() {
    document.getElementById('activityGroupModal').classList.remove('active');
}

// 渲染組別管理列表
function renderActivityGroupsManageList() {
    const container = document.getElementById('activityGroupsManageList');
    if (!container) return;

    if (activityGroups.length === 0) {
        container.innerHTML = `<div class="no-groups-hint">${i18n.t('att.noGroupsSelectFirst')}</div>`;
        return;
    }

    container.innerHTML = activityGroups.map(group => `
    <div class="group-manage-item">
        <div class="group-info">
            <span class="group-name">${group.name}</span>
            <span class="group-count">${group.student_count}${i18n.t('att.people')}</span>
        </div>
        <div class="group-actions">
            <button class="group-action-btn edit" onclick="editActivityGroup(${group.id})">${i18n.t('att.load')}</button>
            <button class="group-action-btn save" onclick="updateActivityGroup(${group.id}, '${group.name}')">${i18n.t('att.saveChanges')}</button>
            <button class="group-action-btn delete" onclick="deleteActivityGroup(${group.id}, '${group.name}')">${i18n.t('att.delete')}</button>
        </div>
    </div>
`).join('');
}

// 建立新組別
async function createActivityGroup() {
    const nameInput = document.getElementById('newGroupName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast(i18n.t('att.pleaseEnterGroupName'));
        return;
    }

    if (selectedStudents.size === 0) {
        showToast(i18n.t('att.pleaseSelectStudentsFirst'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/activity-groups', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: name,
                student_ids: Array.from(selectedStudents)
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.groupCreated', {name: name}));
            nameInput.value = '';
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || i18n.t('att.createFailed'));
        }
    } catch (error) {
        console.error('建立組別失敗:', error);
        showToast(i18n.t('att.createGroupFailed'));
    }
}

// 刪除組別
async function deleteActivityGroup(groupId, groupName) {
    if (!confirm(i18n.t('att.confirmDeleteGroup', {name: groupName}))) {
        return;
    }

    try {
        const response = await fetch(`/api/attendance/activity-groups/${groupId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.groupDeleted', {name: groupName}));
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || i18n.t('att.deleteFailed'));
        }
    } catch (error) {
        console.error('刪除組別失敗:', error);
        showToast(i18n.t('att.deleteGroupFailed'));
    }
}

// 編輯組別
async function editActivityGroup(groupId) {
    await loadActivityGroup(groupId);
    closeActivityGroupModal();
    openStudentSelectModal();
    showToast(i18n.t('att.editGroupHint'));
}

// 更新活動組別
async function updateActivityGroup(groupId, newName) {
    if (selectedStudents.size === 0) {
        showToast(i18n.t('att.pleaseSelectStudentsFirst'));
        return;
    }

    const name = newName || prompt(i18n.t('att.pleaseEnterGroupName'));
    if (!name) return;

    try {
        const response = await fetch(`/api/attendance/activity-groups/${groupId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                name: name,
                student_ids: Array.from(selectedStudents)
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast(i18n.t('att.groupUpdated', {name: name}));
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || i18n.t('att.updateFailed'));
        }
    } catch (error) {
        console.error('更新組別失敗:', error);
        showToast(i18n.t('att.updateGroupFailed'));
    }
}

// 修改 startSession 以支持課外活動
const originalStartSession = startSession;
startSession = async function () {
    if (currentSessionType === 'activity') {
        return startActivitySession();
    }
    return originalStartSession();
};

// 開始課外活動會話
async function startActivitySession() {
    const sessionDate = document.getElementById('sessionDate').value;
    const activityName = document.getElementById('activityName').value.trim();
    const startTime = document.getElementById('activityStartTime').value;
    const endTime = document.getElementById('activityEndTime').value;
    const lateThreshold = parseInt(document.getElementById('activityLateThreshold').value) || 10;
    const earlyThreshold = parseInt(document.getElementById('activityEarlyThreshold').value) || 10;

    if (!sessionDate) {
        showToast(i18n.t('att.pleaseSelectDate'));
        return;
    }

    if (!activityName) {
        showToast(i18n.t('att.pleaseEnterActivityName'));
        return;
    }

    if (selectedStudents.size === 0) {
        showToast(i18n.t('att.pleaseSelectActivityStudents'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/activity/sessions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_date: sessionDate,
                activity_name: activityName,
                start_time: startTime,
                end_time: endTime,
                late_threshold: lateThreshold,
                early_threshold: earlyThreshold,
                student_ids: Array.from(selectedStudents)
            })
        });

        const data = await response.json();
        if (data.success) {
            currentSessionId = data.session_id;
            currentActivityConfig = {
                name: activityName,
                startTime,
                endTime,
                lateThreshold,
                earlyThreshold
            };
            saveSessionState();
            showToast(data.message);
            showActivitySessionPanel();
            loadActivitySessionDetail();
        } else {
            showToast(i18n.t('att.createFailed') + ': ' + (data.detail || i18n.t('att.unknownError')));
        }
    } catch (error) {
        console.error('建立活動會話失敗:', error);
        showToast(i18n.t('att.createSessionFailed'));
    }
}

// 顯示課外活動會話面板
function showActivitySessionPanel() {
    document.getElementById('noSessionHint').style.display = 'none';
    document.getElementById('sessionPanel').style.display = 'flex';

    document.getElementById('sessionTitle').textContent =
        `${currentActivityConfig.name} - ${i18n.t('att.activitySessionInProgress')}`;

// 取得所有容器，只顯示第三个（活動表格）
    const containers = document.querySelectorAll('.records-table-container');
    containers.forEach((c, i) => {
        c.style.display = i === 2 ? 'block' : 'none';
    });
    const activityTable = document.getElementById('activityRecordsTable');
    if (activityTable) activityTable.style.display = 'table';

    document.getElementById('morningStats').style.display = 'none';
    document.getElementById('detentionStats').style.display = 'none';
    const activityStats = document.getElementById('activityStats');
    if (activityStats) activityStats.style.display = 'flex';

    document.getElementById('cardInput').focus();
}

// 載入課外活動會話详情
async function loadActivitySessionDetail() {
    if (!currentSessionId) return;

    try {
        const response = await fetch(`/api/attendance/activity/sessions/${currentSessionId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            if (data.session) {
                currentActivityConfig = {
                    name: data.session.activity_name,
                    startTime: data.session.start_time,
                    endTime: data.session.end_time,
                    lateThreshold: data.session.late_threshold,
                    earlyThreshold: data.session.early_threshold
                };
            }
            updateActivityStats(data.stats);
            renderActivityRecords(data.students);
        }
    } catch (error) {
        console.error('載入活動详情失敗:', error);
    }
}

// 更新課外活動統計
function updateActivityStats(stats) {
    const onTime = document.getElementById('activityStatOnTime');
    const late = document.getElementById('activityStatLate');
    const absent = document.getElementById('activityStatAbsent');
    const normal = document.getElementById('activityStatNormal');
    const early = document.getElementById('activityStatEarly');
    const stillHere = document.getElementById('activityStatStillHere');

    if (onTime) onTime.textContent = stats.on_time || 0;
    if (late) late.textContent = stats.late || 0;
    if (absent) absent.textContent = stats.absent || 0;
    if (normal) normal.textContent = stats.normal_leave || 0;
    if (early) early.textContent = stats.early_leave || 0;
    if (stillHere) stillHere.textContent = stats.still_here || 0;
}

// 渲染課外活動紀錄
function renderActivityRecords(students) {
    activityStudentsData = students;
    const tbody = document.getElementById('activityRecordsBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => {
        const checkInStatus = s.check_in_status || 'not_arrived';
        const checkOutStatus = s.check_out_status || 'not_arrived';

        const checkInStatusText = {
            'on_time': i18n.t('att.onTime'),
            'late': i18n.t('att.late'),
            'not_arrived': i18n.t('att.notArrived')
        }[checkInStatus] || i18n.t('att.notArrived');

        const checkOutStatusText = {
            'normal': i18n.t('att.normal'),
            'early': i18n.t('att.earlyLeave'),
            'not_arrived': '-',
            'still_here': i18n.t('att.stillHere')
        }[checkOutStatus] || '-';

        const checkInTime = s.check_in_time ?
            new Date(s.check_in_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) : '-';

        const checkOutTime = s.check_out_time ?
            new Date(s.check_out_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) : '-';

        const canCheckout = checkInStatus !== 'not_arrived' && !s.check_out_time;

        let checkOutStatusClass = 'not-arrived';
        if (checkOutStatus === 'early') checkOutStatusClass = 'early-leave';
        else if (checkOutStatus === 'normal') checkOutStatusClass = 'normal-leave';
        else if (checkOutStatus === 'still_here') checkOutStatusClass = 'still-here';

        return `
            <tr>
                <td>${s.class_name}-${s.class_number}</td>
                <td>${s.chinese_name}</td>
                <td>${checkInTime}</td>
                <td>${checkOutTime}</td>
                <td><span class="status-badge ${checkInStatus}">${checkInStatusText}</span></td>
                <td><span class="status-badge ${checkOutStatusClass}">${checkOutStatusText}</span></td>
                <td class="hide-compact">
                    <button class="checkout-btn" 
                            onclick="openCheckoutConfirm('${s.user_login}')"
                            ${canCheckout ? '' : 'disabled'}>
                        ${i18n.t('att.checkout')}
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 打開簽退確認彈窗
function openCheckoutConfirm(userLogin) {
    const student = activityStudentsData.find(s => s.user_login === userLogin);
    if (!student) return;

    pendingCheckoutStudent = student;

    document.getElementById('checkoutStudentName').textContent =
        `${student.chinese_name} (${student.class_name}-${student.class_number})`;

    const checkInTime = student.check_in_time ?
        new Date(student.check_in_time).toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'}) : '--:--';
    document.getElementById('checkoutScanTime').textContent = checkInTime;

    // 修復：将秒數轉換为時間字串
    let endTimeStr;
    if (typeof currentActivityConfig.endTime === 'number') {
        const hours = Math.floor(currentActivityConfig.endTime / 3600);
        const mins = Math.floor((currentActivityConfig.endTime % 3600) / 60);
        endTimeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    } else {
        endTimeStr = currentActivityConfig.endTime;
    }

    document.getElementById('checkoutPlannedEnd').textContent = endTimeStr;

    const now = new Date();
    document.getElementById('checkoutCurrentTime').textContent =
        now.toLocaleTimeString(i18n.isEn ? 'en-US' : 'zh-CN', {hour: '2-digit', minute: '2-digit'});

    const [endHour, endMin] = endTimeStr.split(':').map(Number);
    const endTimeDate = new Date();
    endTimeDate.setHours(endHour, endMin - currentActivityConfig.earlyThreshold, 0);

    const warningEl = document.getElementById('earlyLeaveWarning');
    if (warningEl) {
        warningEl.style.display = now < endTimeDate ? 'flex' : 'none';
    }

    document.getElementById('checkoutConfirmModal').classList.add('active');
}

// 關閉簽退確認彈窗
function closeCheckoutConfirmModal() {
    document.getElementById('checkoutConfirmModal').classList.remove('active');
    pendingCheckoutStudent = null;
}

// 確認簽退
async function confirmActivityCheckout() {
    if (!pendingCheckoutStudent || !currentSessionId) {
        closeCheckoutConfirmModal();
        return;
    }

    try {
        const response = await fetch('/api/attendance/activity/checkout', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                user_login: pendingCheckoutStudent.user_login
            })
        });

        const data = await response.json();
        closeCheckoutConfirmModal();

        if (data.success) {
            showActivityScanResult(data);
            loadActivitySessionDetail();
        } else {
            showToast(data.message || data.detail || i18n.t('att.checkoutFailed'));
        }
    } catch (error) {
        console.error('簽退失敗:', error);
        showToast(i18n.t('att.checkoutFailed'));
        closeCheckoutConfirmModal();
    }
}

// 顯示課外活動掃描結果
function showActivityScanResult(data) {
    // 顯示通知卡片
    showScanNotification(data);

    const resultName = document.getElementById('resultName');
    const resultTime = document.getElementById('resultTime');
    const resultStatus = document.getElementById('resultStatus');
    const scanResult = document.getElementById('scanResult');

    scanResult.style.display = 'block';  // 添加這行
    scanResult.className = 'scan-result';  // 重置類名

    if (data.student) {
        resultName.textContent = `${data.student.chinese_name} (${data.student.class_name}-${data.student.class_number})`;
        resultTime.textContent = data.time || new Date().toLocaleTimeString();

        if (data.action === 'checkout') {
            if (data.is_early) {
                resultStatus.innerHTML = ATT.warning + ' ' + i18n.t('att.earlyLeave');
                resultStatus.className = 'result-status late';
                scanResult.classList.add('late');
            } else {
                resultStatus.innerHTML = ATT.check + ' ' + i18n.t('att.normalLeave');
                resultStatus.className = 'result-status present';
                scanResult.classList.add('success');
            }
        } else {
            if (data.is_late) {
                resultStatus.innerHTML = ATT.warning + ' ' + i18n.t('att.late');
                resultStatus.className = 'result-status late';
                scanResult.classList.add('late');
            } else {
                resultStatus.innerHTML = ATT.check + ' ' + i18n.t('att.onTimeCheckin');
                resultStatus.className = 'result-status present';
                scanResult.classList.add('success');
            }
        }
    } else {
        scanResult.classList.add('error');
        resultName.innerHTML = ATT.error + ' ' + (data.message || data.detail || i18n.t('att.checkinFailed'));
        resultTime.textContent = '';
        resultStatus.textContent = '';
    }

    setTimeout(() => {
        scanResult.style.display = 'none';
    }, 3000);
}

// 排序課外活動紀錄
function sortActivityRecords(field) {
    if (!activityStudentsData.length) return;

    if (activitySortField === field) {
        activitySortOrder = activitySortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        activitySortField = field;
        activitySortOrder = 'asc';
    }

    let sorted = [...activityStudentsData];

    switch (field) {
        case 'class':
            sorted.sort((a, b) => {
                const cmp = a.class_name.localeCompare(b.class_name);
                if (cmp !== 0) return activitySortOrder === 'asc' ? cmp : -cmp;
                return activitySortOrder === 'asc' ?
                    a.class_number - b.class_number :
                    b.class_number - a.class_number;
            });
            break;
        case 'checkIn':
            sorted.sort((a, b) => {
                const timeA = a.check_in_time ? new Date(a.check_in_time).getTime() : Infinity;
                const timeB = b.check_in_time ? new Date(b.check_in_time).getTime() : Infinity;
                return activitySortOrder === 'asc' ? timeA - timeB : timeB - timeA;
            });
            break;
        case 'checkOut':
            sorted.sort((a, b) => {
                const timeA = a.check_out_time ? new Date(a.check_out_time).getTime() : Infinity;
                const timeB = b.check_out_time ? new Date(b.check_out_time).getTime() : Infinity;
                return activitySortOrder === 'asc' ? timeA - timeB : timeB - timeA;
            });
            break;
    }

    renderActivityRecords(sorted);
}

// 修改 processCard 以支持課外活動
const originalProcessCard = processCard;
processCard = async function () {
    if (currentSessionType === 'activity') {
        return processActivityCard();
    }
    return originalProcessCard();
};

// 課外活動拍卡處理
async function processActivityCard() {
    const cardInput = document.getElementById('cardInput');
    const cardId = cardInput.value.trim();

    if (!cardId) {
        showToast(i18n.t('att.pleaseInputCard'));
        return;
    }

    if (!currentSessionId) {
        showToast(i18n.t('att.pleaseStartSession'));
        return;
    }

    try {
        const response = await fetch('/api/attendance/activity/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify({
                session_id: currentSessionId,
                card_id: cardId
            })
        });

        const data = await response.json();
        cardInput.value = '';
        cardInput.focus();

        if (data.success) {
            showActivityScanResult(data);
            loadActivitySessionDetail();
        } else {
            showToast(data.message || data.detail || i18n.t('att.scanFailed'));
        }
    } catch (error) {
        console.error('掃描失敗:', error);
        showToast(i18n.t('att.scanFailedRetry'));
    }
}

// 修改 loadSessionDetail 以支持課外活動
const originalLoadSessionDetail = loadSessionDetail;
loadSessionDetail = async function () {
    if (currentSessionType === 'activity') {
        return loadActivitySessionDetail();
    }
    return originalLoadSessionDetail();
};

// 修改showSessionPanel以支持課外活動
const originalShowSessionPanel = showSessionPanel;
showSessionPanel = function () {
    if (currentSessionType === 'activity') {
        return showActivitySessionPanel();
    }
    return originalShowSessionPanel();
};

// 修改confirmStudentSelection以更新課外活動UI
const originalConfirmStudentSelection = confirmStudentSelection;
confirmStudentSelection = function () {
    originalConfirmStudentSelection();

    if (currentSessionType === 'activity') {
        updateActivitySelectBtn();
    }
};

console.log('[ATT] 課外活動功能已載入');