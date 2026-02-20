// ============ 实时时钟功能 ============
let clockInterval = null;

// 启动实时时钟
function startLiveClock() {
    updateClock(); // 立即更新一次
    clockInterval = setInterval(updateClock, 1000);
}

// 停止实时时钟
function stopLiveClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
        clockInterval = null;
    }
}

// 更新时钟显示
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
        const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const weekday = weekdays[now.getDay()];
        dateEl.textContent = `${year}年${month}月${day}日 ${weekday}`;
    }
}


// ============ 早读记录排序功能 ============
let currentMorningRecords = [];
let morningSortField = 'class';  // 默认按班级排序
let morningSortOrder = 'asc';    // 默认升序
// 留堂原因选择
let selectedDetentionReason = null;      // 拍卡签到时选择的原因
let selectedManualDetentionReason = null; // 手动签到时选择的原因

// 留堂原因映射
const DETENTION_REASONS = {
    'homework': '功课留堂',
    'morning': '晨读留堂'
};

// 排序早读记录（点击表头方式）
function sortMorningRecords(field) {
    if (!currentMorningRecords.length) return;

    // 如果点击同一列，切换排序顺序
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

// 更新早读表头排序指示器
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

// 格式化迟到时间（晨读用）
function formatLateTime(minutes, seconds) {
    if (minutes === 0 && seconds > 0) {
        return seconds + '秒';
    }
    return (minutes || 0) + '分钟';
}

// 渲染排序后的记录
function renderSortedRecords(students) {
    const tbody = document.getElementById('recordsBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => {
        const status = s.attendance_status || 'absent';
        const isRegistered = s.is_registered !== false;

        let statusText = {
            'present': '准时',
            'late': '迟到',
            'very_late': '严重迟到',
            'absent': '未到'
        }[status];

        const registeredTag = isRegistered ? '' : '<span class="unregistered-tag">非登记</span>';
        const rowClass = isRegistered ? '' : 'unregistered-row';

        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString('zh-CN', {
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
                <td class="hide-compact">${s.makeup_minutes || 0}分钟</td>
            </tr>
        `;
    }).join('');
}


// ============ 紧凑模式功能 ============
let isCompactMode = false;

// 切换紧凑模式
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
            textEl.textContent = isCompactMode ? '标准' : '紧凑';
        }
    }

    // 保存用户偏好
    localStorage.setItem('attendance_compact_mode', isCompactMode);
}

// 恢复紧凑模式状态
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
                textEl.textContent = '标准';
            }
        }
    }
}


// ========== Apple 风格左侧面板切换功能 ==========
function toggleLeftPanel() {
    const panel = document.getElementById('leftPanel');
    const toggleBtn = document.getElementById('panelToggleBtn');

    if (!panel || !toggleBtn) return;

    // 添加触觉反馈（如果支持）
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }

    // 切换状态
    const isCollapsing = !panel.classList.contains('collapsed');

    // 添加过渡状态class
    panel.classList.add('transitioning');
    toggleBtn.classList.add('transitioning');

    // 执行切换
    panel.classList.toggle('collapsed');
    toggleBtn.classList.toggle('collapsed');

    // 动画完成后移除过渡状态
    setTimeout(() => {
        panel.classList.remove('transitioning');
        toggleBtn.classList.remove('transitioning');
    }, 500);

    // 保存状态到 localStorage
    localStorage.setItem('leftPanelCollapsed', panel.classList.contains('collapsed'));
}

// ========== Apple 风格签到通知卡片 ==========

// 显示签到通知卡片
function showScanNotification(data) {
    const overlay = document.getElementById('scanNotificationOverlay');
    const card = document.getElementById('scanNotificationCard');

    if (!overlay || !card) return;

    // 清除之前的状态类
    card.className = 'scan-notification-card';

    // 获取各元素
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

        // 设置学生信息
        nameEl.textContent = student.chinese_name;
        englishNameEl.textContent = student.english_name;
        classTextEl.textContent = `${student.class_name}-${student.class_number}号`;

        // 根据会话类型和状态设置样式
        if (currentSessionType === 'morning') {
            timeEl.textContent = `签到时间: ${record.scan_time}`;

            if (record.status === 'present') {
                iconEl.textContent = '✅';
                card.classList.add('status-present');
                statusEl.className = 'notification-status present';
                statusEl.textContent = '准时签到';
                extraEl.style.display = 'none';
            } else if (record.status === 'late') {
                iconEl.textContent = '⚠️';
                card.classList.add('status-late');
                statusEl.className = 'notification-status late';
                statusEl.textContent = '迟到';
                extraEl.style.display = 'block';
                extraEl.innerHTML = `迟到 <strong>${record.late_minutes}</strong> 分钟，需补时 <strong>${record.makeup_minutes}</strong> 分钟`;
            } else if (record.status === 'very_late') {
                iconEl.textContent = '🔴';
                card.classList.add('status-very-late');
                statusEl.className = 'notification-status very-late';
                statusEl.textContent = '严重迟到';
                extraEl.style.display = 'block';
                extraEl.innerHTML = `需补时 <strong>${record.makeup_minutes}</strong> 分钟`;
            }
        } else if (currentSessionType === 'activity') {
            // 课外活动模式
            card.classList.add('status-activity');
            statusEl.className = 'notification-status activity';

            if (data.action === 'checkout') {
                iconEl.textContent = '👋';
                timeEl.textContent = `签退时间: ${data.time || record.checkout_time}`;

                if (data.is_early) {
                    statusEl.textContent = '早退';
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    extraEl.innerHTML = `提前 <strong>${data.early_minutes}</strong> 分钟离开`;
                } else {
                    statusEl.textContent = '正常离开';
                    extraEl.style.display = 'none';
                }
            } else {
                iconEl.textContent = '🎯';
                timeEl.textContent = `签到时间: ${data.time || record.scan_time}`;

                if (data.is_late) {
                    statusEl.textContent = '迟到';
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    extraEl.innerHTML = `迟到 <strong>${data.late_minutes}</strong> 分钟`;
                } else {
                    statusEl.textContent = '准时签到';
                    extraEl.style.display = 'none';
                }
            }

        } else {
            // 留堂模式
            card.classList.add('status-detention');
            statusEl.className = 'notification-status detention';

            if (data.action === 'checkout') {
                iconEl.textContent = '👋';
                timeEl.textContent = `签退时间: ${record.checkout_time}`;

// 根据是否使用分钟模式判断完成状态
                let isCompleted = false;
                if (record.planned_minutes != null) {
                    isCompleted = record.actual_minutes >= record.planned_minutes;
                } else {
                    isCompleted = record.actual_periods >= record.planned_periods;
                }

                if (isCompleted) {
                    statusEl.textContent = '留堂完成';
                    extraEl.style.display = 'block';
                    if (record.planned_minutes != null) {
                        extraEl.innerHTML = `已完成 <strong>${record.actual_minutes}</strong> 分钟留堂`;
                    } else {
                        extraEl.innerHTML = `已完成 <strong>${record.actual_periods}</strong> 节留堂`;
                    }
                } else {
                    statusEl.textContent = '提前离开';
                    statusEl.className = 'notification-status late';
                    extraEl.style.display = 'block';
                    if (record.planned_minutes != null) {
                        extraEl.innerHTML = `计划 ${record.planned_minutes} 分钟，实际 ${record.actual_minutes} 分钟`;
                    } else {
                        extraEl.innerHTML = `计划 ${record.planned_periods} 节，实际 ${record.actual_periods} 节`;
                    }
                }
            } else {
                iconEl.textContent = '📝';
                timeEl.textContent = `签到时间: ${record.scan_time}`;
                statusEl.textContent = '留堂签到';
                extraEl.style.display = 'block';
                extraEl.innerHTML = `计划留 <strong>${record.planned_periods}</strong> 节，至 ${record.planned_end_time}`;
            }
        }
    } else {
        // 错误状态
        iconEl.textContent = '❌';
        nameEl.textContent = '签到失败';
        englishNameEl.textContent = data.message || '未知错误';
        classTextEl.textContent = data.card_id ? `卡号: ${data.card_id}` : '未知卡号';
        card.classList.add('status-error');
        statusEl.className = 'notification-status error';
        statusEl.textContent = '错误';
        timeEl.textContent = '';
        extraEl.style.display = 'none';
    }

    // 触发显示动画
    requestAnimationFrame(() => {
        card.classList.add('show');
    });

    // 播放音效反馈（如果支持）
    playNotificationSound(data.success ? (data.record?.status || 'present') : 'error');

    // 触觉反馈
    if (navigator.vibrate) {
        if (data.success) {
            navigator.vibrate(data.record?.status === 'present' ? [50] : [50, 30, 50]);
        } else {
            navigator.vibrate([100, 50, 100]);
        }
    }

    // 自动隐藏
    const hideDelay = currentSessionType === 'detention' ? 500 : 500;

    setTimeout(() => {
        hideScanNotification();
    }, hideDelay);
}

// 隐藏签到通知卡片
function hideScanNotification() {
    const card = document.getElementById('scanNotificationCard');
    if (!card) return;

    card.classList.remove('show');
    card.classList.add('hide');

    // 动画完成后重置
    setTimeout(() => {
        card.classList.remove('hide');
    }, 400);
}

// 播放通知音效（可选）
function playNotificationSound(status) {
    // 如果需要音效，可以在这里添加
    // 示例：使用 Web Audio API 或预加载的音频文件
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

// 页面加载时恢复面板状态
function restoreLeftPanelState() {
    const panel = document.getElementById('leftPanel');
    const toggleBtn = document.getElementById('panelToggleBtn');

    if (!panel || !toggleBtn) return;

    const wasCollapsed = localStorage.getItem('leftPanelCollapsed') === 'true';

    if (wasCollapsed) {
        // 跳过动画直接设置状态
        panel.style.transition = 'none';
        toggleBtn.style.transition = 'none';

        panel.classList.add('collapsed');
        toggleBtn.classList.add('collapsed');

        // 强制重绘后恢复动画
        panel.offsetHeight;

        requestAnimationFrame(() => {
            panel.style.transition = '';
            toggleBtn.style.transition = '';
        });
    }
}

// ========== 选择学生弹窗功能 ==========
let modalFilteredStudents = [];
let isOpenMode = false;  // 是否为开放点名模式

function openStudentSelectModal() {
    const modal = document.getElementById('studentSelectModal');
    if (!modal) return;
    modal.classList.add('active');

    // 复制班级选项到弹窗
    const mainSelect = document.getElementById('classFilter');
    const modalSelect = document.getElementById('modalClassFilter');
    if (mainSelect && modalSelect) {
        modalSelect.innerHTML = mainSelect.innerHTML;
    }

    // 渲染学生列表
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
        container.innerHTML = '<div style="text-align: center; padding: 30px; color: var(--text-secondary);">没有找到学生</div>';
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
                  <div class="student-class">${student.class_name} - ${student.class_number}号 | ${student.user_login}</div>
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

    // 如果是课外活动模式，同步更新
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
        btn.innerHTML = '👥 已选择 ' + count + ' 名学生 (点击修改)';
    } else {
        btn.classList.remove('has-selection');
        btn.innerHTML = '👥 点击选择学生（可选）';
    }
}

// 状态变量
let authToken = localStorage.getItem('auth_token');
let currentSessionType = localStorage.getItem('attendance_session_type') || 'morning';
let currentSessionId = localStorage.getItem('attendance_session_id') ?
    parseInt(localStorage.getItem('attendance_session_id')) : null;
let allStudents = [];
let selectedStudents = new Set();
let fixedLists = [];


// ========== 手动签到功能 ==========
let manualSelectedStudent = null;

// 留堂记录排序状态
let detentionSortField = null;  // 'class', 'scanTime', 'remaining'
let detentionSortOrder = 'asc'; // 'asc' 或 'desc'
let detentionStudentsData = []; // 保存原始数据用于排序

// 保存会话状态到localStorage
function saveSessionState() {
    if (currentSessionId) {
        localStorage.setItem('attendance_session_id', currentSessionId);
        localStorage.setItem('attendance_session_type', currentSessionType);
    } else {
        localStorage.removeItem('attendance_session_id');
        localStorage.removeItem('attendance_session_type');
    }
}

// 页面刷新/关闭警告
window.addEventListener('beforeunload', function (e) {
    if (currentSessionId) {
        e.preventDefault();
        e.returnValue = '点名会话正在进行中，确定要离开吗？';
        return e.returnValue;
    }
});

// 留堂临时状态（选择节数用）
let pendingCardId = null;
let pendingStudent = null;
let pendingOptions = null;

// 倒计时定时器
let countdownInterval = null;

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
    // 检查认证
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
            showToast('只有教師和管理員可以使用點名系統');
            setTimeout(() => window.location.href = '/', 2000);
            return;
        }

        document.getElementById('userInfo').textContent = data.data.display_name || data.data.username;
        // 恢复左侧面板状态
        restoreLeftPanelState();
    } catch (error) {
        console.error('验证失败:', error);
        window.location.href = '/';
        return;
    }

    // 设置今天的日期
    document.getElementById('sessionDate').value = new Date().toISOString().split('T')[0];
    // 恢复左侧面板状态（Apple风格动画）
    restoreLeftPanelState();

    // 加载数据
    await loadClasses();
    await loadStudents();
    await loadFixedLists();
    if (currentSessionId) {
        await restoreSession();
    }

    // 绑定卡号输入事件
    document.getElementById('cardInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            processCard();
        }
    });

    // 初始化表
    initTables();

    // 🆕 启动实时时钟
    startLiveClock();

    // 🆕 恢复紧凑模式状态
    restoreCompactMode();
});

// 初始化数据库表
async function initTables() {
    try {
        await fetch('/api/attendance/init-tables', {
            method: 'POST',
            headers: {'Authorization': `Bearer ${authToken}`}
        });
    } catch (error) {
        console.error('初始化表失败:', error);
    }
}

// 恢复之前的会话
async function restoreSession() {
    try {
        // 根据会话类型获取会话信息
        const url = currentSessionType === 'morning'
            ? `/api/attendance/sessions/${currentSessionId}`
            : `/api/attendance/detention/sessions/${currentSessionId}`;

        const response = await fetch(url, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        if (!response.ok) {
            // 会话不存在或已结束，清除本地存储
            currentSessionId = null;
            saveSessionState();
            return;
        }

        const data = await response.json();

        // 兼容不同返回结构：优先使用 data.session，否则回退到 data
        const session = data.session || null;

        // 如果接口没有返回 session 结构，但返回 success，则认为会话可用
        const isSuccess = data.success === true;
        const status = session && session.status ? session.status : (isSuccess ? 'active' : null);

        // 检查会话是否仍在进行中
        if (status === 'active') {
            showToast(`已恢复${currentSessionType === 'morning' ? '早读' : '留堂'}会话`);

            // 更新UI显示：日期
            if (session && session.session_date) {
                document.getElementById('sessionDate').value = session.session_date;
            }

            // 切换到正确的类型标签（使用现有函数）
            selectType(currentSessionType);

            // 显示会话面板并加载记录
            showSessionPanel();
            await loadSessionDetail();
        } else {
            // 会话已结束，清除
            currentSessionId = null;
            saveSessionState();
        }
    } catch (error) {
        console.error('恢复会话失败:', error);
        currentSessionId = null;
        saveSessionState();
    }
}

// 加载班级列表
async function loadClasses() {
    try {
        const response = await fetch('/api/attendance/classes', {
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        // 检查HTTP状态
        if (!response.ok) {
            if (response.status === 401) {
                console.error('认证失败，请重新登录');
                showToast('登录已过期，请重新登录', 'error');
                setTimeout(() => window.location.href = '/', 2000);
                return;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        if (data.success) {
            const select = document.getElementById('classFilter');
            const modalSelect = document.getElementById('modalClassFilter');
            const options = '<option value="">全部班级</option>' + data.classes.map(cls => `<option value="${cls}">${cls}</option>`).join('');
            if (select) select.innerHTML = options;
            if (modalSelect) modalSelect.innerHTML = options;
        }
    } catch (error) {
        console.error('加载班级失败:', error);
    }
}

// 加载学生列表
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
            showToast('暂无学生数据');
        }
    } catch (error) {
        console.error('加载学生失败:', error);
        showToast('加载学生失败: ' + (error && error.message ? error.message : '未知错误'));
    }
}

// 加载固定名单
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
        console.error('加载固定名单失败:', error);
    }
}

// 渲染固定名单
function renderFixedLists() {
    const container = document.getElementById('fixedListItems');
    // 添加空值检查
    if (!container) {
        console.warn('fixedListItems 元素不存在');
        return;
    }
    if (fixedLists.length === 0) {
        container.innerHTML = '<span style="color: var(--text-secondary); font-size: 13px;">暂无固定名单</span>';
        return;
    }

    container.innerHTML = fixedLists.map(list => `
                <div class="fixed-list-item">
                    <div class="fixed-list-item-content">
                        <span class="fixed-list-item-name" onclick="loadFixedList(${list.id})">
                            ${list.list_name} (${list.student_count}人)
                        </span>
                        <div class="fixed-list-item-actions">
                            <button class="fixed-list-btn edit" onclick="event.stopPropagation(); editFixedList(${list.id}, '${list.list_name}')" title="编辑">✏️</button>
                            <button class="fixed-list-btn delete" onclick="event.stopPropagation(); deleteFixedList(${list.id}, '${list.list_name}')" title="删除">🗑️</button>
                        </div>
                    </div>
                </div>
            `).join('');
}

// 加载固定名单中的学生
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
            showToast(`已加载名单: ${data.list.list_name} (${data.students.length}人)`);
        }
    } catch (error) {
        showToast('加载名单失败');
    }
}

// 编辑名单用的临时数据
let editingListStudents = [];
let editingListType = '';

// 编辑固定名单
async function editFixedList(listId, listName) {
    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();

        if (data.success) {
            // 保存编辑数据
            document.getElementById('editListId').value = listId;
            document.getElementById('editListName').value = data.list.list_name;
            editingListStudents = data.students.map(s => s.user_login);
            editingListType = data.list.list_type;

            // 渲染学生列表
            renderEditListStudents();

            // 填充可添加的学生下拉框
            populateAddStudentSelect();

            // 显示模态框
            document.getElementById('editListModal').classList.add('active');
        }
    } catch (error) {
        console.error('加载名单失败:', error);
        showToast('加载名单失败');
    }
}

// 渲染编辑列表中的学生
function renderEditListStudents() {
    const container = document.getElementById('editListStudents');
    document.getElementById('editListCount').textContent = editingListStudents.length;

    if (editingListStudents.length === 0) {
        container.innerHTML = '<div style="color: var(--text-secondary); text-align: center; padding: 20px;">暂无学生</div>';
        return;
    }

    container.innerHTML = editingListStudents.map(userLogin => {
        const student = allStudents.find(s => s.user_login === userLogin);
        if (!student) return '';
        return `
                    <div class="edit-list-student">
                        <div class="edit-list-student-info">
                            <div class="edit-list-student-name">${student.chinese_name} (${student.english_name})</div>
                            <div class="edit-list-student-class">${student.class_name}-${student.class_number}号 | ${student.user_login}</div>
                        </div>
                        <button class="edit-list-remove-btn" onclick="removeStudentFromEditList('${userLogin}')">移除</button>
                    </div>
                `;
    }).join('');
}

// 填充可添加学生的下拉框
function populateAddStudentSelect() {
    const select = document.getElementById('addStudentSelect');
    const availableStudents = allStudents.filter(s => !editingListStudents.includes(s.user_login));

    select.innerHTML = '<option value="">-- 选择学生添加 --</option>';
    availableStudents.forEach(s => {
        select.innerHTML += `<option value="${s.user_login}">${s.class_name}-${s.class_number} ${s.chinese_name} (${s.english_name})</option>`;
    });
}

// 从编辑列表移除学生
function removeStudentFromEditList(userLogin) {
    editingListStudents = editingListStudents.filter(id => id !== userLogin);
    renderEditListStudents();
    populateAddStudentSelect();
}

// 添加学生到编辑列表
function addStudentToEditList() {
    const select = document.getElementById('addStudentSelect');
    const userLogin = select.value;

    if (!userLogin) {
        showToast('请选择要添加的学生');
        return;
    }

    if (!editingListStudents.includes(userLogin)) {
        editingListStudents.push(userLogin);
        renderEditListStudents();
        populateAddStudentSelect();
    }

    select.value = '';
}

// 关闭编辑模态框
function closeEditListModal() {
    document.getElementById('editListModal').classList.remove('active');
    editingListStudents = [];
}

// 保存编辑后的名单
async function saveEditedList() {
    const listId = document.getElementById('editListId').value;
    const listName = document.getElementById('editListName').value.trim();

    if (!listName) {
        showToast('请输入名单名称');
        return;
    }

    if (editingListStudents.length === 0) {
        showToast('名单中至少需要一名学生');
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
            showToast(`名单 "${listName}" 已更新`);
            closeEditListModal();
            loadFixedLists();
        } else {
            showToast(data.detail || '更新失败');
        }
    } catch (error) {
        console.error('保存名单失败:', error);
        showToast('保存名单失败');
    }
}

// 删除固定名单
async function deleteFixedList(listId, listName) {
    if (!confirm(`确定要删除名单 "${listName}" 吗？此操作不可恢复。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/attendance/fixed-lists/${listId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast(`名单 "${listName}" 已删除`);
            loadFixedLists();
        } else {
            showToast(data.detail || '删除失败');
        }
    } catch (error) {
        console.error('删除名单失败:', error);
        showToast('删除名单失败');
    }
}

// 渲染学生列表
function renderStudentList(students) {
    const container = document.getElementById('studentList');
    if (!container) {
        // 左侧已改为“选择学生弹窗”模式，不再渲染旧 studentList
        return;
    }

    if (students.length === 0) {
        container.innerHTML = `
                    <div style="text-align: center; padding: 30px; color: var(--text-secondary);">
                        没有找到学生
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
                        <div class="student-class">${student.class_name} - ${student.class_number}号 | ${student.user_login}</div>
                    </div>
                </div>
            `).join('');
}

// 筛选学生（已迁移到弹窗选择模式）
function filterStudents() {
    // 兼容旧按钮/旧事件：改为打开选择学生弹窗
    openStudentSelectModal();
}

// 切换学生选择（已迁移到弹窗选择模式）
function toggleStudent(userLogin) {
    // 兼容旧点击：在弹窗选择集合中切换
    if (selectedStudents.has(userLogin)) {
        selectedStudents.delete(userLogin);
    } else {
        selectedStudents.add(userLogin);
    }
    updateSelectedCount();
    updateSelectStudentBtn();
}

// 获取当前筛选后的学生（已弃用，保留空实现以兼容旧调用）
function getFilteredStudents() {
    return allStudents;
}

// 更新选择计数
function updateSelectedCount() {
    const el = document.getElementById('selectedCount');
    if (el) el.textContent = selectedStudents.size;
    // 同步更新“选择学生”按钮状态
    updateSelectStudentBtn();
}

// 选择类型
function selectType(type) {
    currentSessionType = type;
    saveSessionState();  // 切换模式时保存会话类型

    // 更新按钮状态
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`.type-btn.${type}`).classList.add('active');

    // 根据类型控制UI显示
    const activityConfigSection = document.getElementById('activityConfigSection');
    const studentSelectSection = document.getElementById('studentSelectSection');
    const selectedCountSection = document.getElementById('selectedCountSection');

    if (type === 'activity') {
        // 活动模式：显示活动配置
        if (activityConfigSection) activityConfigSection.style.display = 'block';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        loadActivityGroups(); // 加载活动组别
    } else {
        // 晨读/留堂模式：隐藏活动配置（自动全班开放模式）
        if (activityConfigSection) activityConfigSection.style.display = 'none';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        // 清空学生选择（晨读/留堂不需要预选学生）
        selectedStudents.clear();
        updateSelectedCount();
    }

    loadFixedLists();
}

// 加载活动组别
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
                `<button class="activity-group-btn" onclick="loadActivityGroup(${g.id})">${g.name} (${g.student_count}人)</button>`
            ).join('');
        } else {
            container.innerHTML = '<span class="no-groups-hint">暂无组别</span>';
        }
    } catch (error) {
        console.log('加载活动组别失败:', error);
        container.innerHTML = '<span class="no-groups-hint">暂无组别</span>';
    }
}

// 加载指定活动组别的学生
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
            showToast(`已加载 ${data.students.length} 名学生`);
        }
    } catch (error) {
        console.log('加载组别学生失败:', error);
        showToast('加载失败');
    }
}

// 更新活动模式的已选学生数
function updateActivitySelectedCount() {
    const countEl = document.getElementById('activityStudentCount');
    if (countEl) {
        countEl.textContent = selectedStudents.size;
    }
    const btn = document.getElementById('activitySelectStudentBtn');
    if (btn) {
        if (selectedStudents.size > 0) {
            btn.classList.add('has-selection');
            btn.innerHTML = '👥 已选择 ' + selectedStudents.size + ' 名学生 (点击修改)';
        } else {
            btn.classList.remove('has-selection');
            btn.innerHTML = '👥 点击选择学生 (必选)';
        }
    }
}

// 全选
function selectAll() {
    allStudents.forEach(s => selectedStudents.add(s.user_login));
    updateSelectedCount();
    updateSelectStudentBtn();
    showToast('已全选所有学生');
}

// 清空选择
function selectNone() {
    selectedStudents.clear();
    updateSelectedCount();
    updateSelectStudentBtn();
    showToast('已清空选择');
}

// 按年级筛选（打开弹窗并筛选）
function filterByGrade(grade) {
    openStudentSelectModal();
    setTimeout(() => {
        modalFilterByGrade(grade);
    }, 100);
}

// 显示全部学生（打开弹窗）
function showAllStudents() {
    openStudentSelectModal();
}

// 保存固定名单
function saveFixedList() {
    if (selectedStudents.size === 0) {
        showToast('请先选择学生');
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
        showToast('请输入名单名称');
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
            showToast('名单保存成功');
            closeSaveListModal();
            loadFixedLists();
        } else {
            showToast('保存失败: ' + data.detail);
        }
    } catch (error) {
        showToast('保存失败');
    }
}

// 开始点名会话
// 开始点名会话
async function startSession() {
    // 课外活动使用专门的函数
    if (currentSessionType === 'activity') {
        return startActivitySession();
    }
    const sessionDate = document.getElementById('sessionDate').value;
    if (!sessionDate) {
        showToast('请选择日期');
        return;
    }

    // 早读/留堂模式始终使用开放模式（任何学生都可签到）
    // 预留选择学生功能给课外活动点名
    isOpenMode = (currentSessionType === 'morning' || currentSessionType === 'detention')
        ? true  // 早读/留堂始终开放模式
        : selectedStudents.size === 0;  // 课外活动可选择学生

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
                open_mode: isOpenMode  // 预留参数
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
            showToast('创建失败: ' + data.detail);
        }
    } catch (error) {
        showToast('创建会话失败');
    }
}

// 显示会话面板
function showSessionPanel() {
    document.getElementById('noSessionHint').style.display = 'none';
    document.getElementById('sessionPanel').style.display = 'flex';

    // 根据类型设置标题
    let typeText = '晨读';
    if (currentSessionType === 'detention') {
        typeText = '留堂';
    } else if (currentSessionType === 'activity') {
        const activityNameEl = document.getElementById('activityName');
        typeText = activityNameEl && activityNameEl.value ? activityNameEl.value : '课外活动';
    }
    document.getElementById('sessionTitle').textContent = typeText + '点名进行中';

    // 开放模式下隐藏未到统计
    const absentStatSpan = document.getElementById('statAbsent');
    if (absentStatSpan && absentStatSpan.parentElement) {
        absentStatSpan.parentElement.style.display = isOpenMode ? 'none' : '';
    }

    // 停止倒计时
    stopCountdownRefresh();

    // 获取所有容器（用容器控制显示，而不是表格）
    const containers = document.querySelectorAll('.records-table-container');

    // 根据类型显示对应的容器
    if (currentSessionType === 'morning') {
        // 晨读：显示第一个容器（晨读表格），隐藏其他
        containers.forEach((c, i) => {
            c.style.display = i === 0 ? 'block' : 'none';
        });
        document.getElementById('morningRecordsTable').style.display = 'table';
        document.getElementById('morningStats').style.display = 'flex';
        document.getElementById('detentionStats').style.display = 'none';
        const activityStats = document.getElementById('activityStats');
        if (activityStats) activityStats.style.display = 'none';

    } else if (currentSessionType === 'detention') {
        // 留堂：显示第二个容器（留堂表格），隐藏其他
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
        // 活动：显示第三个容器（活动表格），隐藏其他
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

// 加载会话详情
async function loadSessionDetail() {
    if (!currentSessionId) return;

    try {
        // 根据会话类型选择API
        let apiUrl;
        if (currentSessionType === 'morning') {
            apiUrl = `/api/attendance/sessions/${currentSessionId}`;
        } else if (currentSessionType === 'detention') {
            apiUrl = `/api/attendance/detention/sessions/${currentSessionId}`;
        } else if (currentSessionType === 'activity') {
            apiUrl = `/api/attendance/activity/sessions/${currentSessionId}`;
        } else {
            console.error('未知会话类型:', currentSessionType);
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
                // 活动类型的处理
                if (typeof updateActivityStats === 'function') {
                    updateActivityStats(data.stats);
                }
                if (typeof renderActivityRecords === 'function') {
                    renderActivityRecords(data.students);
                }
            }
        }
    } catch (error) {
        console.error('加载会话详情失败:', error);
    }
}

// 更新统计（早读）
function updateStats(stats) {
    document.getElementById('statPresent').textContent = stats.on_time;
    document.getElementById('statLate').textContent = stats.late;
    document.getElementById('statVeryLate').textContent = stats.very_late;
    document.getElementById('statAbsent').textContent = stats.absent;

    // 兼容旧版本：如果页面仍存在“非登记”统计则写入
    const unregEl = document.getElementById('statUnregistered');
    if (unregEl) {
        unregEl.textContent = stats.unregistered || 0;
    }
}

// 渲染签到记录
function renderRecords(students) {
    // 🆕 保存数据用于排序
    currentMorningRecords = students;

    const tbody = document.getElementById('recordsBody');
    tbody.innerHTML = students.map(s => {
        const status = s.attendance_status || 'absent';
        const isRegistered = s.is_registered !== false;

        let statusText = {
            'present': '准时',
            'late': '迟到',
            'very_late': '严重迟到',
            'absent': '未到'
        }[status];

        // 非登记学生标记
        const registeredTag = isRegistered ? '' : '<span class="unregistered-tag">非登记</span>';
        const rowClass = isRegistered ? '' : 'unregistered-row';

        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString('zh-CN', {
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
                <td class="hide-compact">${s.late_minutes || 0}分钟</td>
                <td class="hide-compact">${s.makeup_minutes || 0}分钟</td>
            </tr>
        `;
    }).join('');

    // 🆕 应用当前排序
    if (morningSortField !== 'class' || morningSortOrder !== 'asc') {
        sortMorningRecords();
    }
    // 更新排序指示器
    updateMorningSortIndicators();
}

// 处理拍卡
async function processCard() {
    const cardInput = document.getElementById('cardInput');
    const cardId = cardInput.value.trim();

    if (!cardId) {
        showToast('请输入或扫描卡号');
        return;
    }

    if (!currentSessionId) {
        showToast('请先开始点名会话');
        return;
    }

    try {
        // 根据会话类型选择不同的API
        let apiUrl;
        if (currentSessionType === 'morning') {
            apiUrl = '/api/attendance/scan';
        } else if (currentSessionType === 'detention') {
            apiUrl = '/api/attendance/detention/scan';
        } else if (currentSessionType === 'activity') {
            apiUrl = '/api/attendance/activity/scan';
        }

        // ... 后续代码保持不变

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

        // 留堂模式需要特殊处理
        if (currentSessionType === 'detention' && data.action === 'need_select_periods') {
            // 需要选择节数
            pendingCardId = cardId;
            pendingStudent = data.student;
            pendingOptions = data.options;
            showPeriodsModal(data.student, data.options);
        } else {
            showScanResult(data);

            // 刷新记录
            if (data.success) {
                loadSessionDetail();
            }
        }

        // 清空输入并重新聚焦
        cardInput.value = '';
        cardInput.focus();

    } catch (error) {
        showToast('签到失败');
        console.error(error);
    }
}

// 显示签到结果
function showScanResult(data) {
    // 🆕 添加这一行：显示 Apple 风格通知卡片
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

        // 根据会话类型显示不同信息
        if (currentSessionType === 'morning') {
            timeDiv.textContent = `${student.class_name}-${student.class_number}号 | ${record.scan_time}`;

            if (record.status === 'present') {
                resultDiv.classList.add('success');
                statusDiv.textContent = '✅ 准时签到';
                statusDiv.style.background = 'var(--accent-green)';
            } else if (record.status === 'late') {
                resultDiv.classList.add('late');
                statusDiv.textContent = `⚠️ 迟到 ${record.late_minutes} 分钟，需补时 ${record.makeup_minutes} 分钟`;
                statusDiv.style.background = 'var(--accent-orange)';
            } else if (record.status === 'very_late') {
                resultDiv.classList.add('very-late');
                statusDiv.textContent = `🔴 严重迟到，需补时 ${record.makeup_minutes} 分钟`;
                statusDiv.style.background = 'var(--accent-red)';
            }
        } else {
            // 留堂模式
            if (data.action === 'checkout') {
                // 签退
                timeDiv.textContent = `${student.class_name}-${student.class_number}号 | 签退: ${record.checkout_time}`;
                statusDiv.textContent = record.status_msg;

// 根据是否使用分钟模式判断完成状态
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
                // 签到
                timeDiv.textContent = `${student.class_name}-${student.class_number}号 | 签到: ${record.scan_time}`;
                resultDiv.classList.add('success');
                statusDiv.textContent = `✅ 签到成功，计划留${record.planned_periods}节，到${record.planned_end_time}`;
                statusDiv.style.background = 'var(--accent-purple)';
            }
        }
    } else {
        resultDiv.classList.add('error');
        nameDiv.textContent = '❌ ' + data.message;
        timeDiv.textContent = data.card_id ? `卡号: ${data.card_id}` : '';
        statusDiv.textContent = '';
        statusDiv.style.background = 'transparent';
    }

    // 5秒后隐藏（留堂给多点时间看）
    const hideDelay = currentSessionType === 'detention' ? 5000 : 3000;
    setTimeout(() => {
        resultDiv.style.display = 'none';
    }, hideDelay);
}

// 导出Excel
async function exportExcel() {
    if (!currentSessionId) {
        showToast('没有进行中的会话');
        return;
    }

    try {
        // 根据会话类型选择导出API
        let exportUrl;
        if (currentSessionType === 'morning') {
            exportUrl = `/api/attendance/export/${currentSessionId}`;
        } else if (currentSessionType === 'detention') {
            exportUrl = `/api/attendance/detention/export/${currentSessionId}`;
        } else if (currentSessionType === 'activity') {
            exportUrl = `/api/attendance/activity/export/${currentSessionId}`;
        } else {
            showToast('未知会话类型');
            return;
        }

        window.open(`${exportUrl}?token=${authToken}`, '_blank');
    } catch (error) {
        showToast('导出失败');
    }
}

// ========== 点名记录管理功能 ==========

let exportsCurrentPage = 1;
let exportsPageSize = 10;
let exportsFilter = {type: '', startDate: '', endDate: ''};

// 结束会话 - 显示确认弹窗
function endSession() {
    if (!currentSessionId) return;
    showEndSessionModal();
}

// 显示结束点名确认弹窗
function showEndSessionModal() {
    // 更新统计
    const presentEl = document.getElementById('statPresent');
    const lateEl = document.getElementById('statLate');
    const absentEl = document.getElementById('statAbsent');

    document.getElementById('endStatPresent').textContent = presentEl ? presentEl.textContent : '0';
    document.getElementById('endStatLate').textContent = lateEl ? lateEl.textContent : '0';
    document.getElementById('endStatAbsent').textContent = absentEl ? absentEl.textContent : '0';

    document.getElementById('exportNotes').value = '';
    document.getElementById('saveToServerCheckbox').checked = true;
    document.getElementById('endSessionModal').classList.add('active');
}

function closeEndSessionModal() {
    document.getElementById('endSessionModal').classList.remove('active');
}

// 确认结束点名
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
                showToast(`✅ 记录已保存: ${data.file_name}`);
            } else {
                showToast('⚠️ 保存失败: ' + data.message);
            }
        } catch (error) {
            console.error('保存失败:', error);
            showToast('保存失败，请重试');
        }
    }

    closeEndSessionModal();
    await doEndSession();
}

// 仅下载不保存
async function downloadOnlyEndSession() {
    await exportExcel();
    closeEndSessionModal();
    await doEndSession();
}

// 执行实际的结束会话操作
async function doEndSession() {
    try {
        const response = await fetch(`/api/attendance/sessions/${currentSessionId}/complete`, {
            method: 'PUT',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast('点名已结束');
            currentSessionId = null;
            saveSessionState();
            stopCountdownRefresh();
            stopLiveClock();  // 🆕 新增：停止时钟
            document.getElementById('sessionPanel').style.display = 'none';
            document.getElementById('noSessionHint').style.display = 'flex';
        }
    } catch (error) {
        showToast('结束失败');
    }
}

// ========== 历史记录面板 ==========

function openExportsPanel() {
    document.getElementById('exportsPanel').classList.add('active');
    loadExportsList();
}

function closeExportsPanel() {
    document.getElementById('exportsPanel').classList.remove('active');
}

async function loadExportsList() {
    const container = document.getElementById('exportsList');
    container.innerHTML = '<div class="exports-loading">加载中...</div>';

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
                    <span class="exports-empty-icon">📁</span>
                    <p>暂无点名记录</p>
                    <p class="exports-empty-hint">结束点名时选择"保存到服务器"即可在此查看</p>
                </div>`;
            document.getElementById('exportsPagination').innerHTML = '';
        }
    } catch (error) {
        console.error('加载历史记录失败:', error);
        container.innerHTML = '<div class="exports-error">加载失败，请重试</div>';
    }
}

function renderExportsList(records) {
    const container = document.getElementById('exportsList');
    const html = records.map(r => {
        const typeIcon = r.session_type === 'morning' ? '🌅' : '📝';
        const typeText = r.session_type === 'morning' ? '早读' : '留堂';
        const fileSizeKB = Math.round(r.file_size / 1024);
        const attendanceRate = r.student_count > 0 ? Math.round(r.present_count / r.student_count * 100) : 0;

        return `
            <div class="export-item">
                <div class="export-item-header">
                    <span class="export-item-icon">${typeIcon}</span>
                    <div class="export-item-info">
                        <div class="export-item-title">${typeText}点名 ${r.session_date}</div>
                        <div class="export-item-meta">${r.present_count}/${r.student_count}人 (${attendanceRate}%) · ${fileSizeKB}KB · ${r.created_at}</div>
                    </div>
                </div>
                ${r.notes ? `<div class="export-item-notes">📌 ${r.notes}</div>` : ''}
                <div class="export-item-stats">
                    <span class="stat-tag present">到场 ${r.present_count}</span>
                    <span class="stat-tag late">迟到 ${r.late_count}</span>
                    <span class="stat-tag absent">缺席 ${r.absent_count}</span>
                </div>
                <div class="export-item-actions">
                    <button class="export-btn download" onclick="downloadExport(${r.id})">⬇️ 下载</button>
                    <button class="export-btn delete" onclick="confirmDeleteExport(${r.id}, '${r.file_name}')">🗑️ 删除</button>
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
        if (!response.ok) throw new Error('下载失败');

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
        showToast('✅ 下载成功');
    } catch (error) {
        console.error('下载失败:', error);
        showToast('下载失败，请重试');
    }
}

function confirmDeleteExport(exportId, fileName) {
    if (confirm(`确定要删除记录 "${fileName}" 吗？`)) deleteExport(exportId);
}

async function deleteExport(exportId) {
    try {
        const response = await fetch(`/api/attendance/exports/${exportId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });
        const data = await response.json();
        if (data.success) {
            showToast('✅ 记录已删除');
            loadExportsList();
        } else showToast('删除失败: ' + data.message);
    } catch (error) {
        console.error('删除失败:', error);
        showToast('删除失败，请重试');
    }
}

// 上传学生数据
function closeUploadModal() {
    document.getElementById('uploadModal').classList.remove('active');
}

async function uploadStudents() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('请选择文件');
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
            showToast('上传失败: ' + data.detail);
        }
    } catch (error) {
        showToast('上传失败');
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


// ========== 手动签到功能 ==========

// 显示手动签到模态框
function showManualScanModal() {
    if (!currentSessionId) {
        showToast('请先开始点名会话');
        return;
    }

    // 确保学生数据已加载
    if (!allStudents || allStudents.length === 0) {
        showToast('学生数据尚未加载完成');
        return;
    }

    // 填充班级下拉框
    const classSelect = document.getElementById('manualClassSelect');
    const existingClasses = new Set();

    classSelect.innerHTML = '<option value="">-- 请选择班级 --</option>';
    allStudents.forEach(s => {
        if (s.class_name && !existingClasses.has(s.class_name)) {
            existingClasses.add(s.class_name);
        }
    });

    // 排序班级
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
    confirmBtn.textContent = '确认签到';

    manualSelectedStudent = null;

    // 显示模态框
    document.getElementById('manualScanModal').classList.add('active');
}

// 隐藏手动签到模态框
function hideManualScanModal() {
    document.getElementById('manualScanModal').classList.remove('active');
    manualSelectedStudent = null;

    // 回到扫码输入框
    const cardInput = document.getElementById('cardInput');
    if (cardInput) cardInput.focus();
}

// 更新学生预览
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

    // 查找学生（class_number 可能是数字或字符串，做宽松匹配）
    const student = allStudents.find(s =>
        s.class_name === className && parseInt(s.class_number, 10) === classNumber
    );

    if (student) {
        // 显示学生信息
        document.getElementById('previewName').textContent = student.chinese_name || '';
        document.getElementById('previewEnglish').textContent = student.english_name || '';
        document.getElementById('previewClass').textContent = `${student.class_name} - ${student.class_number}号`;

        preview.classList.add('show');
        notFound.style.display = 'none';
        confirmBtn.disabled = false;
        manualSelectedStudent = student;
    } else {
        // 未找到学生
        preview.classList.remove('show');
        notFound.style.display = 'block';
        confirmBtn.disabled = true;
    }
}

// 确认手动签到
async function confirmManualScan() {
    if (!manualSelectedStudent || !currentSessionId) {
        return;
    }

    // 留堂模式需要先选择节数
    if (currentSessionType === 'detention') {
        // 保存学生信息，显示节数选择
        pendingManualStudent = manualSelectedStudent;
        hideManualScanModal();
        showManualPeriodsModal();
        return;
    }

    // 早读模式直接签到
    const confirmBtn = document.getElementById('confirmManualScan');
    confirmBtn.disabled = true;
    confirmBtn.textContent = '签到中...';

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
                showToast(data.message || '手动签到成功');
            }
            await loadSessionDetail();
            const cardInput = document.getElementById('cardInput');
            if (cardInput) {
                cardInput.value = '';
                cardInput.focus();
            }
        } else {
            showToast(data.message || '签到失败');
        }
    } catch (error) {
        console.error('手动签到失败:', error);
        showToast('签到失败，请重试');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = '确认签到';
    }
}

// 留堂手动签到 - 待处理的学生
let pendingManualStudent = null;

// 显示留堂手动签到节数选择
function showManualPeriodsModal() {
    if (!pendingManualStudent) return;

    document.getElementById('manualPeriodsModalStudent').textContent =
        `${pendingManualStudent.chinese_name} (${pendingManualStudent.class_name}-${pendingManualStudent.class_number}号)`;

    // 重置原因选择
    selectedManualDetentionReason = null;

    // 隐藏节数选择区域，显示原因选择
    const reasonArea = document.getElementById('manualReasonSelectionArea');
    const periodsArea = document.getElementById('manualPeriodsSelectionArea');

    if (reasonArea) {
        reasonArea.style.display = 'block';
        // 重置原因按钮状态
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }
    if (periodsArea) {
        periodsArea.style.display = 'none';
    }

    // 隐藏分钟输入区域
    const minutesSection = document.getElementById('manualMinutesInputSection');
    if (minutesSection) {
        minutesSection.style.display = 'none';
        document.getElementById('manualMinutesInput').value = '';
    }

    const now = new Date();
    const optionsHtml = [1, 2, 3].map(periods => {
        const endTime = new Date(now.getTime() + periods * 35 * 60000);
        const endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        return `
            <div class="period-option" onclick="confirmManualDetentionCheckin(${periods})">
                <div class="period-option-left">
                    <div class="period-option-title">${periods}节</div>
                    <div class="period-option-duration">${periods * 35}分钟</div>
                </div>
                <div class="period-option-time">到 ${endTimeStr}</div>
            </div>
        `;
    }).join('');

    document.getElementById('manualPeriodsOptions').innerHTML = optionsHtml;
    document.getElementById('manualPeriodsModal').classList.add('active');
}

// 关闭留堂手动签到节数选择
function closeManualPeriodsModal() {
    document.getElementById('manualPeriodsModal').classList.remove('active');
    pendingManualStudent = null;
    document.getElementById('cardInput').focus();
}

// 确认留堂手动签到
async function confirmManualDetentionCheckin(periods) {
    if (!pendingManualStudent || !currentSessionId) {
        closeManualPeriodsModal();
        return;
    }

    // 验证是否选择了原因
    if (!selectedManualDetentionReason) {
        showToast('请先选择留堂原因');
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
            showToast(data.message || '签到失败');
        }
    } catch (error) {
        console.error('手动签到失败:', error);
        showToast('签到失败，请重试');
        closeManualPeriodsModal();
    }
}

// 绑定：点击模态框外部关闭（等 DOM 就绪后绑定，避免取不到元素报错）
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


// 手动签退（学生忘带卡时使用）
async function manualCheckout(userLogin, studentName) {
    if (!currentSessionId) {
        showToast('会话未开始');
        return;
    }

    // 确认对话框
    if (!confirm(`确定要为 ${studentName} 手动签退吗？`)) {
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
            showToast(`${studentName} 手动签退成功\n${data.record.status_msg}`);
            await loadSessionDetail();  // 刷新列表
        } else {
            showToast(data.message || '签退失败');
        }
    } catch (error) {
        console.error('手动签退失败:', error);
        showToast('签退失败，请重试');
    }
}

// ========== 留堂专用函数 ==========

// 当前修改对象（用于“指定时间”修改）
let currentModifyUserLogin = null;
let currentModifyScanTimeStr = null;

// 显示选择节数模态框
function showPeriodsModal(student, options) {
    document.getElementById('periodsModalStudent').textContent =
        `${student.chinese_name} (${student.class_name}-${student.class_number}号)`;

    // 重置原因选择
    selectedDetentionReason = null;

    // 隐藏节数选择区域，显示原因选择
    const reasonArea = document.getElementById('reasonSelectionArea');
    const periodsArea = document.getElementById('periodsSelectionArea');

    if (reasonArea) {
        reasonArea.style.display = 'block';
        // 重置原因按钮状态
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
        });
    }
    if (periodsArea) {
        periodsArea.style.display = 'none';
    }

    // 隐藏分钟输入区域
    const minutesSection = document.getElementById('minutesInputSection');
    if (minutesSection) {
        minutesSection.style.display = 'none';
        document.getElementById('periodsMinutesInput').value = '';
    }

    const optionsHtml = options.map(opt => `
                <div class="period-option" onclick="selectPeriods(${opt.periods})">
                    <div class="period-option-left">
                        <div class="period-option-title">${opt.periods}节</div>
                        <div class="period-option-duration">${opt.duration_minutes}分钟</div>
                    </div>
                    <div class="period-option-time">到 ${opt.end_time}</div>
                </div>
            `).join('');

    document.getElementById('periodsOptions').innerHTML = optionsHtml;
    document.getElementById('periodsModal').classList.add('active');
}

// 关闭选择节数模态框
function closePeriodsModal() {
    document.getElementById('periodsModal').classList.remove('active');
    pendingCardId = null;
    pendingStudent = null;
    pendingOptions = null;
    document.getElementById('cardInput').focus();
}

// 选择节数并签到
async function selectPeriods(periods) {
    if (!pendingCardId || !currentSessionId) {
        closePeriodsModal();
        return;
    }

    // 验证是否选择了原因
    if (!selectedDetentionReason) {
        showToast('请先选择留堂原因');
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
        showToast('签到失败');
        closePeriodsModal();
    }
}

// 显示修改留堂设置模态框（节数 / 指定结束时间）
function showModifyModal(userLogin, studentName, currentPeriods, scanTimeStr) {
    // 保存当前正在修改的学生
    currentModifyUserLogin = userLogin;
    currentModifyScanTimeStr = scanTimeStr || null;

    document.getElementById('modifyModalStudent').textContent = studentName;

    // 初始化 Tab 状态
    switchModifyTab('periods');

    // 写入签到时间显示
    if (scanTimeStr) {
        const dt = new Date(scanTimeStr);
        const st = dt.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        document.getElementById('modifyScanTime').textContent = st;

        // 默认给结束时间一个建议值：按当前节数推算
        const endTime = new Date(dt.getTime() + (currentPeriods || 1) * 35 * 60000);
        const hh = String(endTime.getHours()).padStart(2, '0');
        const mm = String(endTime.getMinutes()).padStart(2, '0');
        document.getElementById('modifyEndTimeInput').value = `${hh}:${mm}`;
    } else {
        document.getElementById('modifyScanTime').textContent = '--:--';
        document.getElementById('modifyEndTimeInput').value = '';
    }

    // 生成节数选项（与原逻辑一致）
    const now = new Date();
    const optionsHtml = [1, 2, 3].map(periods => {
        const endTime = new Date(now.getTime() + periods * 35 * 60000);
        const endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        const isCurrent = periods === currentPeriods;
        return `
                    <div class="period-option ${isCurrent ? 'current' : ''}"
                         onclick="modifyPeriods('${userLogin}', ${periods})">
                        <div class="period-option-left">
                            <div class="period-option-title">${periods}节 ${isCurrent ? '(当前)' : ''}</div>
                            <div class="period-option-duration">${periods * 35}分钟</div>
                        </div>
                        <div class="period-option-time">到 ${endTimeStr}</div>
                    </div>
                `;
    }).join('');

    document.getElementById('modifyOptions').innerHTML = optionsHtml;
    // 打开模态框
    document.getElementById('modifyModal').classList.add('active');

    // 更新一次时间预览
    updateTimePreview();
}

// 关闭修改留堂设置模态框
function closeModifyModal() {
    document.getElementById('modifyModal').classList.remove('active');
    currentModifyUserLogin = null;
    currentModifyScanTimeStr = null;
}

// 修改节数
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
            showToast(`已修改为${newPeriods}节`);
            loadSessionDetail();
        } else {
            showToast('修改失败: ' + data.detail);
        }
    } catch (error) {
        showToast('修改失败');
        closeModifyModal();
    }
}

function switchModifyTab(tab) {
    const tabs = document.querySelectorAll('#modifyModal .modify-tab');
    tabs.forEach(t => t.classList.remove('active'));

    const periodsPanel = document.getElementById('modifyPeriodsPanel');
    const timePanel = document.getElementById('modifyEndTimePanel');

    // 使用 display 控制显示/隐藏
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

// 更新“预计留堂时长”预览
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
        previewEl.textContent = '-- 分钟';
        btn.disabled = true;
        return;
    }

    const scanDt = new Date(currentModifyScanTimeStr);
    const [hh, mm] = endTimeVal.split(':').map(v => parseInt(v, 10));
    const endDt = new Date(scanDt);
    endDt.setHours(hh, mm, 0, 0);

    const diffMin = Math.round((endDt.getTime() - scanDt.getTime()) / 60000);

    if (diffMin <= 0) {
        previewEl.textContent = '结束时间必须晚于签到';
        btn.disabled = true;
        return;
    }

    previewEl.textContent = `${diffMin} 分钟`;
    btn.disabled = false;
}

// 确认修改结束时间（调用后端 /detention/modify-end-time）
async function confirmModifyEndTime() {
    if (!currentSessionId || !currentModifyUserLogin) {
        showToast('无法修改：缺少会话或学生信息');
        return;
    }

    const endTimeVal = document.getElementById('modifyEndTimeInput').value;
    if (!endTimeVal) {
        showToast('请选择结束时间');
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
            showToast(`已修改结束时间为 ${data.new_end_time}`);
            closeModifyModal();
            loadSessionDetail();
        } else {
            showToast(data.detail || '修改失败');
        }
    } catch (error) {
        console.error('修改结束时间失败:', error);
        showToast('修改失败');
    }
}

// 启动倒计时刷新
function startCountdownRefresh() {
    // 清除旧的定时器
    if (countdownInterval) {
        clearInterval(countdownInterval);
    }

    // 每秒更新倒计时显示
    countdownInterval = setInterval(() => {
        updateCountdowns();
    }, 1000);
}

// 停止倒计时刷新
function stopCountdownRefresh() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
}

// 更新所有倒计时显示
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

            // 根据剩余时间设置颜色
            cell.classList.remove('overtime', 'warning', 'normal');
            if (minutes < 1) {
                cell.classList.add('warning');
            } else {
                cell.classList.add('normal');
            }
        } else {
            cell.textContent = '已到時間';
            cell.classList.remove('warning', 'normal');
            cell.classList.add('overtime');
        }
    });
}

// 渲染留堂记录
function renderDetentionRecords(students) {
    // 保存原始数据
    detentionStudentsData = students;

    // 如果有排序设置，进行排序
    let sortedStudents = [...students];
    if (detentionSortField) {
        sortedStudents = sortDetentionData(sortedStudents, detentionSortField, detentionSortOrder);
    }
    // 将真正完成留堂的学生放到列表最后
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
        return 0; // 同状态保持原有顺序
    });
    const tbody = document.getElementById('detentionRecordsBody');

    tbody.innerHTML = sortedStudents.map(s => {
        const status = s.status || 'absent';
        let statusText, statusClass;

        if (status === 'detention_active') {
            statusText = '进行中';
            statusClass = 'detention_active';
        } else if (status === 'detention_completed') {
            // 根据是否使用分钟模式来判断完成状态
            let isCompleted = false;
            if (s.planned_minutes !== null && s.planned_minutes !== undefined) {
                // 分钟模式：按分钟数判断
                isCompleted = (s.actual_minutes || 0) >= s.planned_minutes;
            } else {
                // 节数模式：按节数判断
                isCompleted = (s.actual_periods || 0) >= (s.planned_periods || 0);
            }

            if (isCompleted) {
                statusText = '已完成';
                statusClass = 'detention_completed';
            } else {
                statusText = '未完成';
                statusClass = 'incomplete';
            }
        } else {
            statusText = '未签到';
            statusClass = 'absent';
        }

        // 签到时间
        const scanTime = s.scan_time ? new Date(s.scan_time).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false
        }) : '-';

        // 签退时间
        const checkoutTime = s.checkout_time ? new Date(s.checkout_time).toLocaleTimeString('zh-CN', {
            hour: '2-digit', minute: '2-digit', hour12: false
        }) : '-';

        // 计划结束时间（仅用于传参）
        const plannedEndTime = s.planned_end_time
            ? new Date(s.planned_end_time).toLocaleTimeString('zh-CN', {
                hour: '2-digit', minute: '2-digit', hour12: false
            })
            : '';

        // 剩余时间或实际时间
        let timeDisplay = '-';
        let countdownAttr = '';
        if (status === 'detention_active' && s.planned_end_time) {
            const endTime = new Date(s.planned_end_time).getTime();
            countdownAttr = `data-end-time="${endTime}"`;
            timeDisplay = '计算中...';
        } else if (status === 'detention_completed') {
            timeDisplay = `${s.actual_minutes || 0}分/${s.actual_periods || 0}节`;
        }

// 操作按钮
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
                    修改
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
                    离开
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
                <td>${s.planned_minutes != null && s.planned_minutes > 0 ? s.planned_minutes + '分钟' : (s.planned_periods || 0) + '节'}</td>
                <td>${plannedEndTime || '-'}</td>
                <td class="countdown-cell" ${countdownAttr}>${timeDisplay}</td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                <td>${actionHtml}</td>
            </tr>
        `;
    }).join('');

    // 立即更新一次倒计时
    updateCountdowns();

    // 更新表头排序指示器
    updateSortIndicators();
}

// 排序留堂记录
function sortDetentionRecords(field) {
    // 如果点击同一列，切换排序顺序
    if (detentionSortField === field) {
        detentionSortOrder = detentionSortOrder === 'asc' ? 'desc' : 'asc';
    } else {
        detentionSortField = field;
        detentionSortOrder = 'asc';
    }

    // 重新渲染
    renderDetentionRecords(detentionStudentsData);
}

// 排序数据
function sortDetentionData(students, field, order) {
    return students.sort((a, b) => {
        // 【修复】首先：已签退的学生始终排在最后（不管当前是什么排序方式）
        const aCompleted = a.status === 'detention_completed';
        const bCompleted = b.status === 'detention_completed';

        if (aCompleted && !bCompleted) return 1;  // a已完成，排后面
        if (!aCompleted && bCompleted) return -1; // b已完成，排后面

        // 如果都是已完成或都未完成，按正常字段排序
        let valueA, valueB;

        switch (field) {
            case 'class':
                // 按班级排序：先按班级名，再按班号
                valueA = `${a.class_name}-${String(a.class_number).padStart(2, '0')}`;
                valueB = `${b.class_name}-${String(b.class_number).padStart(2, '0')}`;
                break;

            case 'scanTime':
                // 按签到时间排序，未签到的排在最后
                valueA = a.scan_time ? new Date(a.scan_time).getTime() : (order === 'asc' ? Infinity : -Infinity);
                valueB = b.scan_time ? new Date(b.scan_time).getTime() : (order === 'asc' ? Infinity : -Infinity);
                break;

            case 'remaining': {
                // 按剩余时间排序
                // 进行中的按剩余时间，已完成的按实际时间，未签到的排最后
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
            // 找到对应的th
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

// 更新留堂统计
function updateDetentionStats(stats) {
    document.getElementById('statActive').textContent = stats.active || 0;
    document.getElementById('statCompleted').textContent = stats.completed || 0;
    document.getElementById('statIncomplete').textContent = stats.incomplete || 0;
    document.getElementById('statNotCheckedIn').textContent = stats.not_checked_in || 0;
}

// ========== 离开确认功能 ==========

var pendingLeaveUserLogin = null;
var pendingLeaveStudentName = null;

// 显示离开确认弹窗
function showLeaveConfirmModal(userLogin, studentName, scanTimeStr, plannedEndStr, plannedPeriods, plannedMinutesParam) {
    pendingLeaveUserLogin = userLogin;
    pendingLeaveStudentName = studentName;

    document.getElementById('leaveConfirmStudent').textContent = studentName;

    // 解析时间
    var scanTime = scanTimeStr ? new Date(scanTimeStr) : null;
    var plannedEnd = plannedEndStr ? new Date(plannedEndStr) : null;
    var now = new Date();

    // 显示签到时间
    if (scanTime) {
        document.getElementById('leaveConfirmScanTime').textContent =
            scanTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    } else {
        document.getElementById('leaveConfirmScanTime').textContent = '--:--';
    }

    // 显示计划结束时间
    if (plannedEnd) {
        document.getElementById('leaveConfirmPlannedEnd').textContent =
            plannedEnd.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
    } else {
        document.getElementById('leaveConfirmPlannedEnd').textContent = '--:--';
    }

    // 计算已留时间
    if (scanTime) {
        var actualMinutes = Math.floor((now.getTime() - scanTime.getTime()) / 60000);
        document.getElementById('leaveConfirmActualTime').textContent = actualMinutes + ' 分钟';

        // 检查是否完成计划时长（优先使用分钟模式）
        var plannedMinutes;
        if (plannedMinutesParam != null) {
            // 分钟模式
            plannedMinutes = plannedMinutesParam;
        } else {
            // 节数模式
            plannedMinutes = plannedPeriods * 35;
        }

        var warningRow = document.getElementById('leaveWarningRow');
        if (actualMinutes < plannedMinutes) {
            warningRow.style.display = 'flex';
        } else {
            warningRow.style.display = 'none';
        }
    } else {
        document.getElementById('leaveConfirmActualTime').textContent = '-- 分钟';
        document.getElementById('leaveWarningRow').style.display = 'none';
    }

    document.getElementById('leaveConfirmModal').classList.add('active');
}

// 关闭离开确认弹窗
function closeLeaveConfirmModal() {
    document.getElementById('leaveConfirmModal').classList.remove('active');
    pendingLeaveUserLogin = null;
    pendingLeaveStudentName = null;
}

// 确认离开（执行签退）
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
            showToast(pendingLeaveStudentName + ' 已签退');
            await loadSessionDetail();
        } else {
            showToast(data.message || '签退失败');
        }
    } catch (error) {
        console.error('签退失败:', error);
        showToast('签退失败，请重试');
        closeLeaveConfirmModal();
    }
}

// ========== 分钟数签到功能 ==========

// 更新拍卡签到的分钟数预览
function updatePeriodsMinutesPreview() {
    var input = document.getElementById('periodsMinutesInput');
    var preview = document.getElementById('periodsMinutesPreview');
    var btn = document.getElementById('periodsMinutesConfirmBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? '分钟数需在1-180之间' : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    var now = new Date();
    var endTime = new Date(now.getTime() + minutes * 60000);
    var endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});

    preview.textContent = '预计到 ' + endTimeStr;
    preview.className = 'minutes-preview valid';
    btn.disabled = false;
}

// 确认使用分钟数签到（拍卡）
async function confirmPeriodsWithMinutes() {
    var minutes = parseInt(document.getElementById('periodsMinutesInput').value);
    if (!minutes || !pendingCardId || !currentSessionId) {
        closePeriodsModal();
        return;
    }

    // 验证是否选择了原因
    if (!selectedDetentionReason) {
        showToast('请先选择留堂原因');
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
        showToast('签到失败');
        closePeriodsModal();
    }
}

// 更新手动签到的分钟数预览
function updateManualMinutesPreview() {
    var input = document.getElementById('manualMinutesInput');
    var preview = document.getElementById('manualMinutesPreview');
    var btn = document.getElementById('manualMinutesConfirmBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? '分钟数需在1-180之间' : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    var now = new Date();
    var endTime = new Date(now.getTime() + minutes * 60000);
    var endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});

    preview.textContent = '预计到 ' + endTimeStr;
    preview.className = 'minutes-preview valid';
    btn.disabled = false;
}

// 确认使用分钟数手动签到
async function confirmManualDetentionWithMinutes() {
    var minutes = parseInt(document.getElementById('manualMinutesInput').value);
    if (!minutes || !pendingManualStudent || !currentSessionId) {
        closeManualPeriodsModal();
        return;
    }

    // 验证是否选择了原因
    if (!selectedManualDetentionReason) {
        showToast('请先选择留堂原因');
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
            showToast(data.message || '签到失败');
        }
    } catch (error) {
        console.error('手动签到失败:', error);
        showToast('签到失败，请重试');
        closeManualPeriodsModal();
    }
}

// ========== 修改功能增强（支持分钟数Tab） ==========

// 重写 switchModifyTab 函数支持新的 minutes Tab
function switchModifyTab(tab) {
    var tabs = document.querySelectorAll('#modifyModal .modify-tab');
    tabs.forEach(function (t) {
        t.classList.remove('active');
    });

    var periodsPanel = document.getElementById('modifyPeriodsPanel');
    var minutesPanel = document.getElementById('modifyMinutesPanel');
    var timePanel = document.getElementById('modifyEndTimePanel');

    // 隐藏所有面板
    if (periodsPanel) periodsPanel.style.display = 'none';
    if (minutesPanel) minutesPanel.style.display = 'none';
    if (timePanel) timePanel.style.display = 'none';

    // 显示对应面板
    if (tab === 'minutes') {
        var tabBtn = document.getElementById('tabMinutes');
        if (tabBtn) tabBtn.classList.add('active');
        if (minutesPanel) minutesPanel.style.display = 'block';
        // 同步签到时间显示
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

// 更新修改分钟数预览
function updateModifyMinutesPreview() {
    var input = document.getElementById('modifyMinutesInput');
    var preview = document.getElementById('modifyMinutesPreview');
    var btn = document.getElementById('confirmMinutesBtn');
    var minutes = parseInt(input.value);

    if (!minutes || minutes < 1 || minutes > 180) {
        preview.textContent = minutes ? '分钟数需在1-180之间' : '';
        preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
        btn.disabled = true;
        return;
    }

    if (currentModifyScanTimeStr) {
        var scanTime = new Date(currentModifyScanTimeStr);
        var endTime = new Date(scanTime.getTime() + minutes * 60000);
        var endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        preview.textContent = '预计到 ' + endTimeStr;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    } else {
        preview.textContent = '';
        btn.disabled = true;
    }
}

// 确认按分钟数修改
async function confirmModifyMinutes() {
    var minutes = parseInt(document.getElementById('modifyMinutesInput').value);
    if (!minutes || !currentModifyUserLogin || !currentSessionId) {
        showToast('无法修改：缺少必要信息');
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
            showToast(data.message || '已修改为' + minutes + '分钟');
            closeModifyModal();
            loadSessionDetail();
        } else {
            showToast(data.detail || '修改失败');
        }
    } catch (error) {
        console.error('修改分钟数失败:', error);
        showToast('修改失败');
    }
}

// ========== Apple风格动画效果（确保DOM已就绪） ==========
document.addEventListener('DOMContentLoaded', () => {

    // ========== Apple 风格平滑磁吸效果 ==========

    document.querySelectorAll('.type-btn, .action-btn, .toolbar-btn, .scan-btn').forEach(btn => {
        // 存储目标位置和当前位置
        let targetX = 0;
        let targetY = 0;
        let currentX = 0;
        let currentY = 0;
        let animationId = null;

        // 平滑插值系数 (越小越平滑，0.08-0.15较理想)
        const smoothing = 0.12;
        // 磁吸强度 (越小越微妙)
        const magnetStrength = 0.15;

        // 动画循环
        function animate() {
            // 平滑插值
            currentX += (targetX - currentX) * smoothing;
            currentY += (targetY - currentY) * smoothing;

            // 应用变换
            btn.style.transform = `translate(${currentX}px, ${currentY}px)`;

            // 如果还没到达目标，继续动画
            if (Math.abs(targetX - currentX) > 0.1 || Math.abs(targetY - currentY) > 0.1) {
                animationId = requestAnimationFrame(animate);
            }
        }

        btn.addEventListener('mousemove', function (e) {
            const rect = this.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            // 计算鼠标相对于按钮中心的偏移
            const deltaX = e.clientX - centerX;
            const deltaY = e.clientY - centerY;

            // 设置目标位置
            targetX = deltaX * magnetStrength;
            targetY = deltaY * magnetStrength;

            // 开始动画（如果还没开始）
            if (!animationId) {
                animationId = requestAnimationFrame(animate);
            }
        });

        btn.addEventListener('mouseleave', function () {
            // 回到原位
            targetX = 0;
            targetY = 0;

            // 确保动画继续直到回到原位
            if (!animationId) {
                animationId = requestAnimationFrame(animate);
            }

            // 清理动画ID的监听
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

        // 使用 Web Animations API 实现更平滑的动画
        ripple.animate([
            {transform: 'scale(0)', opacity: 0.5},
            {transform: 'scale(1)', opacity: 0}
        ], {
            duration: 600,
            easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
            fill: 'forwards'
        }).onfinish = () => ripple.remove();
    }

    // 添加涟漪效果到按钮
    document.querySelectorAll('.type-btn, .action-btn, .toolbar-btn, .scan-btn, .quick-btn').forEach(btn => {
        btn.style.position = 'relative';
        btn.style.overflow = 'hidden';
        btn.addEventListener('click', createRipple);
    });


    // ========== 学生卡片悬停效果 ==========
    document.addEventListener('DOMContentLoaded', () => {
        // 为学生卡片添加平滑的悬停效果
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


    // ========== 输入框聚焦光环效果 ==========

    document.querySelectorAll('.scan-input, .filter-input, .filter-select, .date-input').forEach(input => {
        input.addEventListener('focus', function () {
            this.style.transition = 'all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
        });
        input.addEventListener('blur', function () {
            this.style.transition = 'all 0.2s ease';
        });
    });

    // ========== Apple风格启动动画控制 (纯JS动画版本) ==========
    function showMainInterface() {
        const splash = document.getElementById('splashScreen');
        const header = document.querySelector('.header');
        const leftPanel = document.querySelector('.left-panel');
        const rightPanel = document.querySelector('.right-panel');

        // 淡出启动画面
        if (splash) {
            splash.classList.add('fade-out');
        }

        // 纯 JavaScript 动画函数 - 兼容所有浏览器
        function animateIn(element, fromX, fromY, delay) {
            if (!element) return;

            setTimeout(() => {
                // 1. 先移除 CSS 中的 !important 影响，用 inline style 覆盖
                element.style.cssText = `
                        opacity: 0 !important;
                        transform: translate(${fromX}px, ${fromY}px) !important;
                        transition: none !important;
                        visibility: visible !important;
                    `;

                // 2. 强制浏览器重绘
                void element.offsetWidth;

                // 3. 设置过渡动画并改变到最终状态
                element.style.cssText = `
                        opacity: 1 !important;
                        transform: translate(0, 0) !important;
                        transition: opacity 0.7s cubic-bezier(0.16, 1, 0.3, 1),
                                    transform 0.7s cubic-bezier(0.16, 1, 0.3, 1) !important;
                        visibility: visible !important;
                    `;
            }, delay);
        }

        // Header 从上方滑入 (200ms 延迟)
        animateIn(header, 0, -30, 200);

        // 左侧面板从左侧滑入 (400ms 延迟)
        animateIn(leftPanel, -50, 0, 400);

        // 右侧面板从右侧滑入 (600ms 延迟)
        animateIn(rightPanel, 50, 0, 600);

        // 移除启动画面
        setTimeout(() => {
            if (splash) {
                splash.style.display = 'none';
            }
        }, 1500);
    }

    // 页面完全加载后开始动画
    window.addEventListener('load', () => {
        setTimeout(() => {
            showMainInterface();
        }, 1200);
    });
    // ========== 鼠标聚光灯效果 ==========
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
        // 🆕 检查是否有鼠标
        if (!document.body.classList.contains('has-mouse')) {
            console.log('[3D] 触摸模式，跳过 3D 效果');
            return;
        }
        // 原有代码...
    }

    // 🆕 监听鼠标连接/断开
    matchMedia('(pointer: fine)').addEventListener('change', (e) => {
        if (e.matches) {
            init3DCards();  // 连接鼠标 - 启用 3D
            document.getElementById('spotlight').style.display = '';
        } else {
            // 断开鼠标 - 禁用效果
            document.getElementById('spotlight').style.display = 'none';
            document.querySelectorAll('.student-card').forEach(c => c.style.transform = '');
        }
    });

    // 初始化3D卡片效果（需要在学生列表渲染后调用）
    const originalRenderStudentList = renderStudentList;
    renderStudentList = function (students) {
        originalRenderStudentList(students);
        // 延迟一点确保DOM已更新
        setTimeout(init3DCards, 50);
    };

    // 页面加载后也初始化一次
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(init3DCards, 1000);
    });
// ========== 离开确认功能 ==========

    let pendingLeaveUserLogin = null;
    let pendingLeaveStudentName = null;

// 显示离开确认弹窗
    function showLeaveConfirmModal(userLogin, studentName, scanTimeStr, plannedEndStr, plannedPeriods) {
        pendingLeaveUserLogin = userLogin;
        pendingLeaveStudentName = studentName;

        document.getElementById('leaveConfirmStudent').textContent = studentName;

        // 解析时间
        const scanTime = scanTimeStr ? new Date(scanTimeStr) : null;
        const plannedEnd = plannedEndStr ? new Date(plannedEndStr) : null;
        const now = new Date();

        // 显示签到时间
        if (scanTime) {
            document.getElementById('leaveConfirmScanTime').textContent =
                scanTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        } else {
            document.getElementById('leaveConfirmScanTime').textContent = '--:--';
        }

        // 显示计划结束时间
        if (plannedEnd) {
            document.getElementById('leaveConfirmPlannedEnd').textContent =
                plannedEnd.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
        } else {
            document.getElementById('leaveConfirmPlannedEnd').textContent = '--:--';
        }

        // 计算已留时间
        if (scanTime) {
            const actualMinutes = Math.floor((now.getTime() - scanTime.getTime()) / 60000);
            document.getElementById('leaveConfirmActualTime').textContent = `${actualMinutes} 分钟`;

            // 检查是否完成计划时长
            const plannedMinutes = plannedPeriods * 35;
            const warningRow = document.getElementById('leaveWarningRow');
            if (actualMinutes < plannedMinutes) {
                warningRow.style.display = 'flex';
            } else {
                warningRow.style.display = 'none';
            }
        } else {
            document.getElementById('leaveConfirmActualTime').textContent = '-- 分钟';
            document.getElementById('leaveWarningRow').style.display = 'none';
        }

        document.getElementById('leaveConfirmModal').classList.add('active');
    }

// 关闭离开确认弹窗
    function closeLeaveConfirmModal() {
        document.getElementById('leaveConfirmModal').classList.remove('active');
        pendingLeaveUserLogin = null;
        pendingLeaveStudentName = null;
    }

// 确认离开（执行签退）
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
                showToast(`${pendingLeaveStudentName} 已签退`);
                await loadSessionDetail();
            } else {
                showToast(data.message || '签退失败');
            }
        } catch (error) {
            console.error('签退失败:', error);
            showToast('签退失败，请重试');
            closeLeaveConfirmModal();
        }
    }

// ========== 分钟数签到功能 ==========

// 更新拍卡签到的分钟数预览
    function updatePeriodsMinutesPreview() {
        const input = document.getElementById('periodsMinutesInput');
        const preview = document.getElementById('periodsMinutesPreview');
        const btn = document.getElementById('periodsMinutesConfirmBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? '分钟数需在1-180之间' : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        const now = new Date();
        const endTime = new Date(now.getTime() + minutes * 60000);
        const endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});

        preview.textContent = `预计到 ${endTimeStr}`;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    }

// 确认使用分钟数签到（拍卡）
    async function confirmPeriodsWithMinutes() {
        const minutes = parseInt(document.getElementById('periodsMinutesInput').value);
        if (!minutes || !pendingCardId || !currentSessionId) {
            closePeriodsModal();
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
                    planned_minutes: minutes
                })
            });

            const data = await response.json();
            closePeriodsModal();
            showScanResult(data);

            if (data.success) {
                loadSessionDetail();
            }
        } catch (error) {
            showToast('签到失败');
            closePeriodsModal();
        }
    }

// 更新手动签到的分钟数预览
    function updateManualMinutesPreview() {
        const input = document.getElementById('manualMinutesInput');
        const preview = document.getElementById('manualMinutesPreview');
        const btn = document.getElementById('manualMinutesConfirmBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? '分钟数需在1-180之间' : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        const now = new Date();
        const endTime = new Date(now.getTime() + minutes * 60000);
        const endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});

        preview.textContent = `预计到 ${endTimeStr}`;
        preview.className = 'minutes-preview valid';
        btn.disabled = false;
    }

// 确认使用分钟数手动签到
    async function confirmManualDetentionWithMinutes() {
        const minutes = parseInt(document.getElementById('manualMinutesInput').value);
        if (!minutes || !pendingManualStudent || !currentSessionId) {
            closeManualPeriodsModal();
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
                    planned_minutes: minutes
                })
            });

            const data = await response.json();
            closeManualPeriodsModal();

            if (data.success) {
                showScanResult(data);
                await loadSessionDetail();
            } else {
                showToast(data.message || '签到失败');
            }
        } catch (error) {
            console.error('手动签到失败:', error);
            showToast('签到失败，请重试');
            closeManualPeriodsModal();
        }
    }

// ========== 修改功能增强（支持分钟数Tab） ==========

// 重写 switchModifyTab 函数支持新的 minutes Tab
    function switchModifyTab(tab) {
        const tabs = document.querySelectorAll('#modifyModal .modify-tab');
        tabs.forEach(t => t.classList.remove('active'));

        const periodsPanel = document.getElementById('modifyPeriodsPanel');
        const minutesPanel = document.getElementById('modifyMinutesPanel');
        const timePanel = document.getElementById('modifyEndTimePanel');

        // 隐藏所有面板
        if (periodsPanel) periodsPanel.style.display = 'none';
        if (minutesPanel) minutesPanel.style.display = 'none';
        if (timePanel) timePanel.style.display = 'none';

        // 显示对应面板
        if (tab === 'minutes') {
            document.getElementById('tabMinutes').classList.add('active');
            if (minutesPanel) minutesPanel.style.display = 'block';
            // 同步签到时间显示
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

// 更新修改分钟数预览
    function updateModifyMinutesPreview() {
        const input = document.getElementById('modifyMinutesInput');
        const preview = document.getElementById('modifyMinutesPreview');
        const btn = document.getElementById('confirmMinutesBtn');
        const minutes = parseInt(input.value);

        if (!minutes || minutes < 1 || minutes > 180) {
            preview.textContent = minutes ? '分钟数需在1-180之间' : '';
            preview.className = 'minutes-preview' + (minutes ? ' invalid' : '');
            btn.disabled = true;
            return;
        }

        if (currentModifyScanTimeStr) {
            const scanTime = new Date(currentModifyScanTimeStr);
            const endTime = new Date(scanTime.getTime() + minutes * 60000);
            const endTimeStr = endTime.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});
            preview.textContent = `预计到 ${endTimeStr}`;
            preview.className = 'minutes-preview valid';
            btn.disabled = false;
        } else {
            preview.textContent = '';
            btn.disabled = true;
        }
    }

// 确认按分钟数修改
    async function confirmModifyMinutes() {
        const minutes = parseInt(document.getElementById('modifyMinutesInput').value);
        if (!minutes || !currentModifyUserLogin || !currentSessionId) {
            showToast('无法修改：缺少必要信息');
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
                showToast(data.message || `已修改为${minutes}分钟`);
                closeModifyModal();
                loadSessionDetail();
            } else {
                showToast(data.detail || '修改失败');
            }
        } catch (error) {
            console.error('修改分钟数失败:', error);
            showToast('修改失败');
        }
    }

}); // 结束 Apple风格动画效果 DOMContentLoaded 包裹

// ========== 留堂原因选择功能 ==========

// 选择留堂原因（拍卡签到用）
function selectDetentionReason(reason) {
    selectedDetentionReason = reason;

    // 更新按钮状态
    const reasonArea = document.getElementById('reasonSelectionArea');
    if (reasonArea) {
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.reason === reason) {
                btn.classList.add('selected');
            }
        });
    }

    // 显示节数选择区域
    const periodsArea = document.getElementById('periodsSelectionArea');
    if (periodsArea) {
        periodsArea.style.display = 'block';
    }
}

// 选择留堂原因（手动签到用）
function selectManualDetentionReason(reason) {
    selectedManualDetentionReason = reason;

    // 更新按钮状态
    const reasonArea = document.getElementById('manualReasonSelectionArea');
    if (reasonArea) {
        reasonArea.querySelectorAll('.reason-option-btn').forEach(btn => {
            btn.classList.remove('selected');
            if (btn.dataset.reason === reason) {
                btn.classList.add('selected');
            }
        });
    }

    // 显示节数选择区域
    const periodsArea = document.getElementById('manualPeriodsSelectionArea');
    if (periodsArea) {
        periodsArea.style.display = 'block';
    }
}

// 切换分钟数输入显示（拍卡签到用）
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

// 切换分钟数输入显示（手动签到用）
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

// 获取原因标签HTML
function getReasonTagHtml(reason) {
    if (!reason) {
        return '<span class="reason-tag unknown">未知</span>';
    }
    if (reason === 'homework') {
        return '<span class="reason-tag homework">功课</span>';
    }
    if (reason === 'morning') {
        return '<span class="reason-tag morning">晨读</span>';
    }
    return '<span class="reason-tag unknown">' + reason + '</span>';
}

// ============ 课外活动功能 ============

// 课外活动状态变量
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

// 修改selectType函数以支持课外活动
const originalSelectType = selectType;
selectType = function (type) {
    currentSessionType = type;
    saveSessionState();

    // 更新按钮状态
    document.querySelectorAll('.type-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const typeBtn = document.querySelector(`.type-btn.${type}`);
    if (typeBtn) typeBtn.classList.add('active');

    // 显示/隐藏课外活动配置区域
    const activityConfig = document.getElementById('activityConfigSection');
    const studentSelectSection = document.getElementById('studentSelectSection');
    const selectedCountSection = document.getElementById('selectedCountSection');
    const saveListBtn = document.getElementById('saveListBtn');

    if (type === 'activity') {
        // 课外活动模式
        if (activityConfig) activityConfig.style.display = 'block';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        if (saveListBtn) saveListBtn.style.display = 'none';
        loadActivityGroups();
    } else {
        // 晨读/留堂模式
        if (activityConfig) activityConfig.style.display = 'none';
        if (studentSelectSection) studentSelectSection.style.display = 'none';
        if (selectedCountSection) selectedCountSection.style.display = 'none';
        if (saveListBtn) saveListBtn.style.display = 'none';
    }

    loadFixedLists();
};

// 加载固定组别
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
        console.error('加载组别失败:', error);
        activityGroups = [];
        renderActivityGroups();
    }
}

// 渲染固定组别按钮
function renderActivityGroups() {
    const container = document.getElementById('activityGroupsList');
    if (!container) return;

    if (activityGroups.length === 0) {
        container.innerHTML = `
            <span class="no-groups-hint">暂无组别</span>
            <button class="manage-groups-btn" onclick="openActivityGroupModal()">
                ⚙️ 管理组别
            </button>
        `;
        return;
    }

    container.innerHTML = activityGroups.map(group => `
        <button class="activity-group-btn" 
                onclick="loadActivityGroup(${group.id})"
                data-group-id="${group.id}">
            ${group.name}
            <span class="group-count">${group.student_count}人</span>
        </button>
    `).join('') + `
        <button class="manage-groups-btn" onclick="openActivityGroupModal()">
            ⚙️ 管理组别
        </button>
    `;
}

// 加载某个组别的学生
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

            showToast(`已加载组别: ${data.group.name}`);
        }
    } catch (error) {
        console.error('加载组别失败:', error);
        showToast('加载组别失败');
    }
}

// 更新课外活动已选人数
function updateActivitySelectedCount() {
    const countEl = document.getElementById('activityStudentCount');
    if (countEl) countEl.textContent = selectedStudents.size;
}

// 更新课外活动选择按钮状态
function updateActivitySelectBtn() {
    const btn = document.getElementById('activitySelectStudentBtn');
    if (!btn) return;

    const count = selectedStudents.size;
    if (count > 0) {
        btn.classList.add('has-selection');
        btn.innerHTML = `👥 已选择 ${count} 名学生 (点击修改)`;
    } else {
        btn.classList.remove('has-selection');
        btn.innerHTML = '👥 点击选择学生 (必选)';
    }

    updateActivitySelectedCount();
}

// 打开组别管理模态框
function openActivityGroupModal() {
    document.getElementById('activityGroupModal').classList.add('active');
    renderActivityGroupsManageList();
}

// 关闭组别管理模态框
function closeActivityGroupModal() {
    document.getElementById('activityGroupModal').classList.remove('active');
}

// 渲染组别管理列表
function renderActivityGroupsManageList() {
    const container = document.getElementById('activityGroupsManageList');
    if (!container) return;

    if (activityGroups.length === 0) {
        container.innerHTML = '<div class="no-groups-hint">暂无组别，请先选择学生后创建</div>';
        return;
    }

    container.innerHTML = activityGroups.map(group => `
    <div class="group-manage-item">
        <div class="group-info">
            <span class="group-name">${group.name}</span>
            <span class="group-count">${group.student_count}人</span>
        </div>
        <div class="group-actions">
            <button class="group-action-btn edit" onclick="editActivityGroup(${group.id})">加载</button>
            <button class="group-action-btn save" onclick="updateActivityGroup(${group.id}, '${group.name}')">保存修改</button>
            <button class="group-action-btn delete" onclick="deleteActivityGroup(${group.id}, '${group.name}')">删除</button>
        </div>
    </div>
`).join('');
}

// 创建新组别
async function createActivityGroup() {
    const nameInput = document.getElementById('newGroupName');
    const name = nameInput.value.trim();

    if (!name) {
        showToast('请输入组别名称');
        return;
    }

    if (selectedStudents.size === 0) {
        showToast('请先选择学生');
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
            showToast(`组别 "${name}" 创建成功`);
            nameInput.value = '';
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || '创建失败');
        }
    } catch (error) {
        console.error('创建组别失败:', error);
        showToast('创建组别失败');
    }
}

// 删除组别
async function deleteActivityGroup(groupId, groupName) {
    if (!confirm(`确定要删除组别 "${groupName}" 吗？此操作不可恢复。`)) {
        return;
    }

    try {
        const response = await fetch(`/api/attendance/activity-groups/${groupId}`, {
            method: 'DELETE',
            headers: {'Authorization': `Bearer ${authToken}`}
        });

        const data = await response.json();
        if (data.success) {
            showToast(`组别 "${groupName}" 已删除`);
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || '删除失败');
        }
    } catch (error) {
        console.error('删除组别失败:', error);
        showToast('删除组别失败');
    }
}

// 编辑组别
async function editActivityGroup(groupId) {
    await loadActivityGroup(groupId);
    closeActivityGroupModal();
    openStudentSelectModal();
    showToast('修改学生后可创建新组别或继续点名');
}

// 更新活动组别
async function updateActivityGroup(groupId, newName) {
    if (selectedStudents.size === 0) {
        showToast('请先选择学生');
        return;
    }

    const name = newName || prompt('请输入组别名称');
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
            showToast(`组别 "${name}" 已更新`);
            await loadActivityGroups();
            renderActivityGroupsManageList();
        } else {
            showToast(data.detail || '更新失败');
        }
    } catch (error) {
        console.error('更新组别失败:', error);
        showToast('更新组别失败');
    }
}

// 修改startSession以支持课外活动
const originalStartSession = startSession;
startSession = async function () {
    if (currentSessionType === 'activity') {
        return startActivitySession();
    }
    return originalStartSession();
};

// 开始课外活动会话
async function startActivitySession() {
    const sessionDate = document.getElementById('sessionDate').value;
    const activityName = document.getElementById('activityName').value.trim();
    const startTime = document.getElementById('activityStartTime').value;
    const endTime = document.getElementById('activityEndTime').value;
    const lateThreshold = parseInt(document.getElementById('activityLateThreshold').value) || 10;
    const earlyThreshold = parseInt(document.getElementById('activityEarlyThreshold').value) || 10;

    if (!sessionDate) {
        showToast('请选择日期');
        return;
    }

    if (!activityName) {
        showToast('请输入活动名称');
        return;
    }

    if (selectedStudents.size === 0) {
        showToast('请选择参加活动的学生');
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
            showToast('创建失败: ' + (data.detail || '未知错误'));
        }
    } catch (error) {
        console.error('创建活动会话失败:', error);
        showToast('创建会话失败');
    }
}

// 显示课外活动会话面板
function showActivitySessionPanel() {
    document.getElementById('noSessionHint').style.display = 'none';
    document.getElementById('sessionPanel').style.display = 'flex';

    document.getElementById('sessionTitle').textContent =
        `${currentActivityConfig.name} - 活动点名进行中`;

// 获取所有容器，只显示第三个（活动表格）
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

// 加载课外活动会话详情
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
        console.error('加载活动详情失败:', error);
    }
}

// 更新课外活动统计
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

// 渲染课外活动记录
function renderActivityRecords(students) {
    activityStudentsData = students;
    const tbody = document.getElementById('activityRecordsBody');
    if (!tbody) return;

    tbody.innerHTML = students.map(s => {
        const checkInStatus = s.check_in_status || 'not_arrived';
        const checkOutStatus = s.check_out_status || 'not_arrived';

        const checkInStatusText = {
            'on_time': '准时',
            'late': '迟到',
            'not_arrived': '未到'
        }[checkInStatus] || '未到';

        const checkOutStatusText = {
            'normal': '正常',
            'early': '早退',
            'not_arrived': '-',
            'still_here': '仍在'
        }[checkOutStatus] || '-';

        const checkInTime = s.check_in_time ?
            new Date(s.check_in_time).toLocaleTimeString('zh-CN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }) : '-';

        const checkOutTime = s.check_out_time ?
            new Date(s.check_out_time).toLocaleTimeString('zh-CN', {
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
                        签退
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// 打开签退确认弹窗
function openCheckoutConfirm(userLogin) {
    const student = activityStudentsData.find(s => s.user_login === userLogin);
    if (!student) return;

    pendingCheckoutStudent = student;

    document.getElementById('checkoutStudentName').textContent =
        `${student.chinese_name} (${student.class_name}-${student.class_number})`;

    const checkInTime = student.check_in_time ?
        new Date(student.check_in_time).toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'}) : '--:--';
    document.getElementById('checkoutScanTime').textContent = checkInTime;

    // 修复：将秒数转换为时间字符串
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
        now.toLocaleTimeString('zh-CN', {hour: '2-digit', minute: '2-digit'});

    const [endHour, endMin] = endTimeStr.split(':').map(Number);
    const endTimeDate = new Date();
    endTimeDate.setHours(endHour, endMin - currentActivityConfig.earlyThreshold, 0);

    const warningEl = document.getElementById('earlyLeaveWarning');
    if (warningEl) {
        warningEl.style.display = now < endTimeDate ? 'flex' : 'none';
    }

    document.getElementById('checkoutConfirmModal').classList.add('active');
}

// 关闭签退确认弹窗
function closeCheckoutConfirmModal() {
    document.getElementById('checkoutConfirmModal').classList.remove('active');
    pendingCheckoutStudent = null;
}

// 确认签退
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
            showToast(data.message || '签退失败');
        }
    } catch (error) {
        console.error('签退失败:', error);
        showToast('签退失败');
        closeCheckoutConfirmModal();
    }
}

// 显示课外活动扫描结果
function showActivityScanResult(data) {
    // 显示通知卡片
    showScanNotification(data);

    const resultName = document.getElementById('resultName');
    const resultTime = document.getElementById('resultTime');
    const resultStatus = document.getElementById('resultStatus');
    const scanResult = document.getElementById('scanResult');

    scanResult.style.display = 'block';  // 添加这行
    scanResult.className = 'scan-result';  // 重置类名

    if (data.student) {
        resultName.textContent = `${data.student.chinese_name} (${data.student.class_name}-${data.student.class_number})`;
        resultTime.textContent = data.time || new Date().toLocaleTimeString();

        if (data.action === 'checkout') {
            if (data.is_early) {
                resultStatus.textContent = '⚠️ 早退';
                resultStatus.className = 'result-status late';
                scanResult.classList.add('late');
            } else {
                resultStatus.textContent = '✅ 正常离开';
                resultStatus.className = 'result-status present';
                scanResult.classList.add('success');
            }
        } else {
            if (data.is_late) {
                resultStatus.textContent = '⚠️ 迟到';
                resultStatus.className = 'result-status late';
                scanResult.classList.add('late');
            } else {
                resultStatus.textContent = '✅ 准时签到';
                resultStatus.className = 'result-status present';
                scanResult.classList.add('success');
            }
        }
    } else {
        scanResult.classList.add('error');
        resultName.textContent = '❌ ' + (data.message || '签到失败');
        resultTime.textContent = '';
        resultStatus.textContent = '';
    }

    setTimeout(() => {
        scanResult.style.display = 'none';
    }, 3000);
}

// 排序课外活动记录
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

// 修改processCard以支持课外活动
const originalProcessCard = processCard;
processCard = async function () {
    if (currentSessionType === 'activity') {
        return processActivityCard();
    }
    return originalProcessCard();
};

// 课外活动拍卡处理
async function processActivityCard() {
    const cardInput = document.getElementById('cardInput');
    const cardId = cardInput.value.trim();

    if (!cardId) {
        showToast('请输入或扫描卡号');
        return;
    }

    if (!currentSessionId) {
        showToast('请先开始点名会话');
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
            showToast(data.message || '扫描失败');
        }
    } catch (error) {
        console.error('扫描失败:', error);
        showToast('扫描失败，请重试');
    }
}

// 修改loadSessionDetail以支持课外活动
const originalLoadSessionDetail = loadSessionDetail;
loadSessionDetail = async function () {
    if (currentSessionType === 'activity') {
        return loadActivitySessionDetail();
    }
    return originalLoadSessionDetail();
};

// 修改showSessionPanel以支持课外活动
const originalShowSessionPanel = showSessionPanel;
showSessionPanel = function () {
    if (currentSessionType === 'activity') {
        return showActivitySessionPanel();
    }
    return originalShowSessionPanel();
};

// 修改confirmStudentSelection以更新课外活动UI
const originalConfirmStudentSelection = confirmStudentSelection;
confirmStudentSelection = function () {
    originalConfirmStudentSelection();

    if (currentSessionType === 'activity') {
        updateActivitySelectBtn();
    }
};

console.log('✅ 课外活动功能已加载');