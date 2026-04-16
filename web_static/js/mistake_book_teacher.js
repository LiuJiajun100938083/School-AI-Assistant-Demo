/**
 * 教師錯題分析面板 — 前端核心模組
 *
 * 架構：
 *   TeacherApp  — 全局狀態管理與導航
 *   TeacherAPI  — 後端 API 封裝
 *   TeacherUI   — DOM 渲染工具（SVG 圖標，無 emoji）
 *   ClassView   — 班級概況視圖（雙欄 Dashboard）
 *   StudentView — 學生詳情視圖
 */

'use strict';

/* ============================================================
   SVG Icon 庫 — 取代所有 emoji
   ============================================================ */
const Icons = {
    chart:     '<svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M18 9l-5 5-2-2-4 4"/></svg>',
    lock:      '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
    user:      '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M6 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/></svg>',
    users:     '<svg viewBox="0 0 24 24"><circle cx="9" cy="7" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="17" cy="8" r="2"/><path d="M21 21v-1.5a3 3 0 0 0-2-2.83"/></svg>',
    alert:     '<svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    target:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>',
    inbox:     '<svg viewBox="0 0 24 24"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
    search:    '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    chevRight: '<svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>',
    bulb:      '<svg viewBox="0 0 24 24"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    crosshair: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>',
    file:      '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    trendDown: '<svg viewBox="0 0 24 24"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>',
    trendUp:   '<svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
};


/* ============================================================
   TeacherApp — 全局狀態與導航
   ============================================================ */

const TeacherApp = {
    state: {
        token: null,
        user: null,
        currentTab: 'class-report',
        selectedClass: '',
        selectedSubject: '',
        classReport: null,
        studentDetail: null,
        classes: [],
        subjects: [],
    },

    async init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();
        this.state.token = localStorage.getItem('auth_token');
        if (!this.state.token) {
            window.location.href = '/';
            return;
        }

        const verified = await TeacherAPI.verify();
        if (!verified) {
            localStorage.removeItem('auth_token');
            window.location.href = '/';
            return;
        }

        const role = this.state.user?.role || '';
        if (role !== 'teacher' && role !== 'admin') {
            document.getElementById('mainContent').innerHTML = TeacherUI.empty('lock', i18n.t('mbt.accessDenied'));
            return;
        }

        this._bindEvents();
        await Promise.all([this._loadClasses(), this._loadSubjects()]);
        this.switchTab('class-report');
    },

    switchTab(tab) {
        this.state.currentTab = tab;

        document.querySelectorAll('.mbt-tabs__item').forEach(el => {
            el.classList.toggle('mbt-tabs__item--active', el.dataset.tab === tab);
        });

        const main = document.getElementById('mainContent');

        if (tab === 'class-report') {
            if (this.state.classReport) {
                ClassView.render(main, this.state.classReport);
            } else {
                main.innerHTML = TeacherUI.empty('chart', i18n.t('mbt.selectPrompt'));
            }
        } else if (tab === 'student-detail') {
            if (this.state.studentDetail) {
                StudentView.render(main, this.state.studentDetail);
            } else {
                main.innerHTML = TeacherUI.empty('user', i18n.t('mbt.studentPrompt'));
            }
        }
    },

    async loadClassReport() {
        const className = document.getElementById('classSelect').value;
        const subject = document.getElementById('subjectSelect').value;

        if (!className) {
            TeacherUI.toast(i18n.t('mbt.selectClassFirst'), 'error');
            return;
        }

        this.state.selectedClass = className;
        this.state.selectedSubject = subject;

        const main = document.getElementById('mainContent');
        main.innerHTML = TeacherUI.loading();

        const res = await TeacherAPI.getClassReport(className, subject);
        if (res && res.data) {
            this.state.classReport = res.data;
            this.switchTab('class-report');
        } else {
            main.innerHTML = TeacherUI.empty('alert', i18n.t('mbt.loadFailed'));
        }
    },

    async viewStudent(username) {
        const subject = this.state.selectedSubject;
        const main = document.getElementById('mainContent');
        main.innerHTML = TeacherUI.loading();

        const res = await TeacherAPI.getStudentMistakes(username, subject);
        if (res && res.data) {
            this.state.studentDetail = { username, ...res.data };
            this.switchTab('student-detail');
        } else {
            main.innerHTML = TeacherUI.empty('alert', i18n.t('mbt.loadStudentFailed'));
        }
    },

    async _loadClasses() {
        const res = await TeacherAPI.getClasses();
        if (res && res.classes) {
            const classes = res.classes;
            this.state.classes = classes;

            const select = document.getElementById('classSelect');
            classes.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls.name || cls;
                opt.textContent = cls.name || cls;
                select.appendChild(opt);
            });
        }
    },

    async _loadSubjects() {
        const res = await TeacherAPI.getSubjects();
        const select = document.getElementById('subjectSelect');
        select.innerHTML = '';

        if (res && res.data && res.data.length > 0) {
            this.state.subjects = res.data;
            res.data.forEach((s, i) => {
                const opt = document.createElement('option');
                opt.value = s.subject_code;
                opt.textContent = s.display_name;
                select.appendChild(opt);
            });
            this.state.selectedSubject = res.data[0].subject_code;
        } else {
            [{ code: 'chinese', name: i18n.t('mbt.subjectChinese') }, { code: 'math', name: i18n.t('mbt.subjectMath') }, { code: 'english', name: i18n.t('mbt.subjectEnglish') }].forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.code;
                opt.textContent = s.name;
                select.appendChild(opt);
            });
            this.state.selectedSubject = 'chinese';
        }
    },

    _bindEvents() {
        document.getElementById('tabsBar').addEventListener('click', e => {
            const item = e.target.closest('.mbt-tabs__item');
            if (item) this.switchTab(item.dataset.tab);
        });
    },
};


/* ============================================================
   TeacherAPI — 後端調用封裝
   ============================================================ */

const TeacherAPI = {
    _headers() {
        return {
            'Authorization': `Bearer ${TeacherApp.state.token}`,
            'Content-Type': 'application/json',
        };
    },

    async _fetch(url, options = {}) {
        try {
            const res = await fetch(url, {
                headers: this._headers(),
                ...options,
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.detail || `HTTP ${res.status}`);
            return data;
        } catch (err) {
            console.error(`API Error [${url}]:`, err);
            TeacherUI.toast(err.message, 'error');
            return null;
        }
    },

    async verify() {
        const res = await this._fetch('/api/verify');
        if (res && res.success) {
            TeacherApp.state.user = res.data;
            return true;
        }
        return false;
    },

    async getSubjects() {
        return this._fetch('/api/mistakes/subjects');
    },

    async getClasses() {
        return this._fetch('/api/teacher/classes');
    },

    async getClassReport(className, subject) {
        const params = new URLSearchParams({ class_name: className, subject });
        return this._fetch(`/api/teacher/mistakes/class-report?${params}`);
    },

    async getStudentMistakes(username, subject) {
        const params = subject ? `?subject=${subject}` : '';
        return this._fetch(`/api/teacher/mistakes/student/${username}${params}`);
    },
};


/* ============================================================
   TeacherUI — DOM 工具函數（SVG 圖標，無 emoji）
   ============================================================ */

const TeacherUI = {
    loading() {
        return `<div class="mb-loading"><div class="mb-loading__spinner"></div>${i18n.t('mbt.loading')}</div>`;
    },

    empty(iconName, text) {
        const svg = Icons[iconName] || Icons.inbox;
        return `<div class="mbt-empty"><div class="mbt-empty__icon">${svg}</div><div class="mbt-empty__text">${text}</div></div>`;
    },

    toast(message, type = 'info') {
        const el = document.createElement('div');
        el.className = `mb-toast mb-toast--${type}`;
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 3000);
    },

    subjectLabel(subject) {
        const s = (TeacherApp.state.subjects || []).find(s => s.subject_code === subject);
        return s ? s.display_name : subject;
    },

    masteryClass(level) {
        if (level < 40) return 'low';
        if (level < 70) return 'medium';
        return 'high';
    },

    masteryColor(level) {
        if (level < 40) return 'var(--mb-danger)';
        if (level < 70) return 'var(--mb-warning)';
        return 'var(--mb-success)';
    },

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    },

    avatarLetter(name) {
        return (name || '?').charAt(0).toUpperCase();
    },
};


/* ============================================================
   ClassView — 班級概況視圖（全寬雙欄 Dashboard）
   ============================================================ */

const ClassView = {
    render(container, data) {
        const className = TeacherApp.state.selectedClass;
        const subject = TeacherApp.state.selectedSubject;

        const summary = data.summary || {};
        const weakPoints = data.common_weak_points || [];
        const students = data.students || [];

        const totalStudents = summary.total_students || students.length || 0;
        const avgMastery = summary.avg_mastery || 0;
        const totalMistakes = summary.total_mistakes || 0;
        const atRiskCount = summary.at_risk_count || 0;

        let html = '';

        // 統計卡片行
        html += `
            <div class="mbt-stats">
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.classSize')}</div>
                    <div class="mbt-stat-card__value">${totalStudents}</div>
                    <div class="mbt-stat-card__sub">${TeacherUI.escapeHtml(className)}</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.avgMastery')}</div>
                    <div class="mbt-stat-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${Math.round(avgMastery)}%</div>
                    <div class="mbt-stat-card__sub">${TeacherUI.subjectLabel(subject)}</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.totalMistakes')}</div>
                    <div class="mbt-stat-card__value">${totalMistakes}</div>
                    <div class="mbt-stat-card__sub">${i18n.t('mbt.classTotal')}</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.atRisk')}</div>
                    <div class="mbt-stat-card__value ${atRiskCount > 0 ? 'mbt-stat-card__value--danger' : 'mbt-stat-card__value--success'}">${atRiskCount}</div>
                    <div class="mbt-stat-card__sub">${i18n.t('mbt.atRiskThreshold')}</div>
                </div>
            </div>
        `;

        // 雙欄：弱點 + 學生
        html += '<div class="mbt-columns">';

        // 左欄：薄弱知識點
        html += '<div class="mbt-panel">';
        html += `
            <div class="mbt-panel__header">
                <div class="mbt-panel__title">${Icons.target} ${i18n.t('mbt.commonWeakPoints')}</div>
                ${weakPoints.length ? `<span class="mbt-panel__count">${weakPoints.length}</span>` : ''}
            </div>
        `;
        html += '<div class="mbt-panel__body">';

        if (weakPoints.length) {
            weakPoints.slice(0, 10).forEach((wp, i) => {
                const rankClass = i < 3 ? 'mbt-weak-row__rank--top' : '';
                const mastery = Math.round(wp.avg_mastery || 0);
                html += `
                    <div class="mbt-weak-row">
                        <div class="mbt-weak-row__rank ${rankClass}">${i + 1}</div>
                        <div class="mbt-weak-row__info">
                            <div class="mbt-weak-row__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                            <div class="mbt-weak-row__meta">
                                ${i18n.t('mbt.studentsAffected', {count: wp.affected_students || wp.student_count || 0, total: wp.total_mistakes || 0})}
                            </div>
                        </div>
                        <div class="mbt-weak-row__bar-wrap">
                            <div class="mbt-weak-row__pct" style="color:${TeacherUI.masteryColor(mastery)}">${mastery}%</div>
                            <div class="mbt-weak-row__bar">
                                <div class="mbt-weak-row__bar-fill" style="width:${mastery}%;background:${TeacherUI.masteryColor(mastery)}"></div>
                            </div>
                        </div>
                    </div>
                `;
            });
        } else {
            html += TeacherUI.empty('inbox', i18n.t('mbt.noWeakPoints'));
        }

        html += '</div></div>';

        // 右欄：學生列表
        html += '<div class="mbt-panel">';
        html += `
            <div class="mbt-panel__header">
                <div class="mbt-panel__title">${Icons.users} ${i18n.t('mbt.studentList')}</div>
                ${students.length ? `<span class="mbt-panel__count">${students.length}</span>` : ''}
            </div>
        `;
        html += '<div class="mbt-panel__body">';

        if (students.length) {
            const sorted = [...students].sort((a, b) =>
                (a.avg_mastery || 0) - (b.avg_mastery || 0)
            );

            sorted.forEach(s => {
                const mastery = Math.round(s.avg_mastery || 0);
                html += `
                    <div class="mbt-stu-row" onclick="TeacherApp.viewStudent('${TeacherUI.escapeHtml(s.username)}')">
                        <div class="mbt-stu-row__avatar">${TeacherUI.avatarLetter(s.display_name || s.username)}</div>
                        <div class="mbt-stu-row__info">
                            <div class="mbt-stu-row__name">${TeacherUI.escapeHtml(s.display_name || s.username)}</div>
                            <div class="mbt-stu-row__meta">
                                ${i18n.t('mbt.mistakes', {count: s.mistake_count || 0, review: s.review_count || 0})}
                            </div>
                        </div>
                        <div class="mbt-stu-row__mastery">
                            <div class="mbt-stu-row__mastery-value" style="color:${TeacherUI.masteryColor(mastery)}">${mastery}%</div>
                            <div class="mbt-stu-row__mastery-label">${i18n.t('mbt.masteryLabel')}</div>
                        </div>
                        <div class="mbt-stu-row__arrow">${Icons.chevRight}</div>
                    </div>
                `;
            });
        } else {
            html += TeacherUI.empty('users', i18n.t('mbt.noStudents'));
        }

        html += '</div></div>';
        html += '</div>'; // close mbt-columns

        container.innerHTML = html;
    },
};


/* ============================================================
   StudentView — 學生詳情視圖
   ============================================================ */

const StudentView = {
    render(container, data) {
        const subject = TeacherApp.state.selectedSubject;
        const username = data.username || '';
        const displayName = data.display_name || username;
        const overview = data;

        let html = '';

        // 返回按鈕
        html += `
            <div class="mbt-detail-back" onclick="TeacherApp.switchTab('class-report')">
                ${Icons.arrowLeft} ${i18n.t('mbt.backToClass')}
            </div>
        `;

        // 學生頭部
        html += `
            <div class="mbt-student-banner">
                <div class="mbt-student-banner__avatar">${TeacherUI.avatarLetter(displayName)}</div>
                <div>
                    <div class="mbt-student-banner__name">${TeacherUI.escapeHtml(displayName)}</div>
                    <div class="mbt-student-banner__class">
                        ${TeacherUI.escapeHtml(overview.class_name || '')} · ${TeacherUI.subjectLabel(subject)}
                    </div>
                </div>
            </div>
        `;

        // 統計卡片
        const stats = overview.subject_stats || {};
        const subjectStat = stats[subject] || {};
        const totalMistakes = subjectStat.total_mistakes || overview.total_mistakes || 0;
        const avgMastery = Math.round(subjectStat.avg_mastery || overview.avg_mastery || 0);
        const reviewCount = subjectStat.review_count || overview.review_count || 0;
        const masteredCount = subjectStat.mastered_count || overview.mastered_count || 0;

        html += `
            <div class="mbt-stats">
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.mistakeCount')}</div>
                    <div class="mbt-stat-card__value">${totalMistakes}</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.masteryLabel')}</div>
                    <div class="mbt-stat-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${avgMastery}%</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.reviewCount')}</div>
                    <div class="mbt-stat-card__value">${reviewCount}</div>
                </div>
                <div class="mbt-stat-card">
                    <div class="mbt-stat-card__label">${i18n.t('mbt.masteredCount')}</div>
                    <div class="mbt-stat-card__value mbt-stat-card__value--success">${masteredCount}</div>
                </div>
            </div>
        `;

        // AI 薄弱分析
        const weakness = overview.weakness_report;
        if (weakness) {
            if (weakness.ai_summary) {
                html += `
                    <div class="mbt-insight">
                        <div class="mbt-insight__title">${Icons.bulb} ${i18n.t('mbt.aiSummary')}</div>
                        <div class="mbt-insight__body">${TeacherUI.escapeHtml(weakness.ai_summary)}</div>
                        ${weakness.encouragement ? `<div class="mbt-insight__encouragement">${TeacherUI.escapeHtml(weakness.encouragement)}</div>` : ''}
                    </div>
                `;
            }

            if (weakness.recommendations && weakness.recommendations.length) {
                html += `
                    <div class="mbt-insight">
                        <div class="mbt-insight__title">${Icons.clipboard} ${i18n.t('mbt.teachingSuggestions')}</div>
                        <ul class="mbt-insight__list">
                            ${weakness.recommendations.map(r =>
                                `<li>${TeacherUI.escapeHtml(r)}</li>`
                            ).join('')}
                        </ul>
                    </div>
                `;
            }

            // 薄弱知識點
            const weakPoints = weakness.weak_points || [];
            if (weakPoints.length) {
                html += `<div class="mbt-section-heading">${Icons.crosshair} ${i18n.t('mbt.weakPoints')}</div>`;
                html += '<div class="mbt-panel"><div class="mbt-panel__body">';

                weakPoints.slice(0, 10).forEach((wp, i) => {
                    const rankClass = i < 3 ? 'mbt-weak-row__rank--top' : '';
                    const mastery = Math.round(wp.mastery_level || 0);
                    let trendHtml = '';
                    if (wp.trend === 'declining') trendHtml = ` · ${i18n.t('mbt.trendDecline')}`;
                    if (wp.trend === 'improving') trendHtml = ` · ${i18n.t('mbt.trendImprove')}`;

                    html += `
                        <div class="mbt-weak-row">
                            <div class="mbt-weak-row__rank ${rankClass}">${i + 1}</div>
                            <div class="mbt-weak-row__info">
                                <div class="mbt-weak-row__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                                <div class="mbt-weak-row__meta">
                                    ${i18n.t('mbt.mistakeN', {count: wp.mistake_count || 0})}${trendHtml}
                                </div>
                            </div>
                            <div class="mbt-weak-row__bar-wrap">
                                <div class="mbt-weak-row__pct" style="color:${TeacherUI.masteryColor(mastery)}">${mastery}%</div>
                                <div class="mbt-weak-row__bar">
                                    <div class="mbt-weak-row__bar-fill" style="width:${mastery}%;background:${TeacherUI.masteryColor(mastery)}"></div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += '</div></div>';
            }
        }

        // 錯題列表
        const mistakes = overview.recent_mistakes || [];
        if (mistakes.length) {
            html += `<div class="mbt-section-heading" style="margin-top:24px">${Icons.file} ${i18n.t('mbt.recentMistakes')}</div>`;
            html += '<div class="mbt-mistakes-grid">';

            mistakes.forEach(m => {
                const question = m.manual_question_text || m.ocr_question_text || i18n.t('mb.unrecognized');
                html += `
                    <div class="mb-mistake-card mb-mistake-card--${m.status}" style="cursor:default">
                        <div class="mb-mistake-card__header">
                            <span class="mb-mistake-card__subject mb-mistake-card__subject--${m.subject}">
                                ${TeacherUI.subjectLabel(m.subject)} · ${TeacherUI.escapeHtml(m.category || '')}
                            </span>
                            <span class="mb-mistake-card__status">${this._statusLabel(m.status)}</span>
                        </div>
                        <div class="mb-mistake-card__question">${TeacherUI.escapeHtml(question)}</div>
                        <div class="mb-mistake-card__meta">
                            <span>${m.error_type ? this._errorTypeLabel(m.error_type) : ''}</span>
                            <span>${i18n.t('mbt.masteryPct', {pct: m.mastery_level || 0})}</span>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }

        container.innerHTML = html;
    },

    _statusLabel(status) {
        const map = {
            pending_ocr: i18n.t('mbt.statusPendingOcr'),
            pending_review: i18n.t('mbt.statusPendingReview'),
            analyzed: i18n.t('mbt.statusAnalyzed'),
            practicing: i18n.t('mbt.statusPracticing'),
            mastered: i18n.t('mbt.statusMastered'),
        };
        return map[status] || status;
    },

    _errorTypeLabel(type) {
        const map = {
            concept_error: i18n.t('mbt.errConcept'),
            calculation_error: i18n.t('mbt.errCalculation'),
            comprehension_gap: i18n.t('mbt.errComprehension'),
            careless: i18n.t('mbt.errCareless'),
            expression_weak: i18n.t('mbt.errExpression'),
            memory_error: i18n.t('mbt.errMemory'),
            logic_error: i18n.t('mbt.errLogic'),
            method_error: i18n.t('mbt.errMethod'),
        };
        return map[type] || type || '';
    },
};


/* ============================================================
   啟動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => TeacherApp.init());
