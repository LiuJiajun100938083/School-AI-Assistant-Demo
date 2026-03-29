/**
 * 教師錯題分析面板 — 前端核心模組
 *
 * 架構：
 *   TeacherApp  — 全局狀態管理與導航
 *   TeacherAPI  — 後端 API 封裝
 *   TeacherUI   — DOM 渲染工具
 *   ClassView   — 班級概況視圖
 *   StudentView — 學生詳情視圖
 *
 * 代碼規範：
 *   - 嚴格模組分離，避免全局污染
 *   - 所有 DOM 操作集中在渲染層
 *   - 所有 API 調用集中在 API 層
 *   - 使用 i18n 國際化
 */

'use strict';


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
        subjects: [],  // 動態從 API 加載
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

        // 權限檢查：僅教師和管理員可用
        const role = this.state.user?.role || '';
        if (role !== 'teacher' && role !== 'admin') {
            document.getElementById('mainContent').innerHTML = TeacherUI.empty(
                '🔒', i18n.t('mbt.accessDenied')
            );
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
                main.innerHTML = TeacherUI.empty('📊', i18n.t('mbt.selectPrompt'));
            }
        } else if (tab === 'student-detail') {
            if (this.state.studentDetail) {
                StudentView.render(main, this.state.studentDetail);
            } else {
                main.innerHTML = TeacherUI.empty('👤', i18n.t('mbt.studentPrompt'));
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
            main.innerHTML = TeacherUI.empty('❌', i18n.t('mbt.loadFailed'));
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
            main.innerHTML = TeacherUI.empty('❌', i18n.t('mbt.loadStudentFailed'));
        }
    },

    async _loadClasses() {
        const res = await TeacherAPI.getClasses();
        if (res && res.data) {
            const classes = res.data;
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
            // 降級
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
        // 標籤切換
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
        return this._fetch('/api/users/classes');
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
   TeacherUI — DOM 工具函數
   ============================================================ */

const TeacherUI = {
    loading() {
        return `<div class="mb-loading"><div class="mb-loading__spinner"></div>${i18n.t('mbt.loading')}</div>`;
    },

    empty(icon, text) {
        return `<div class="mb-empty"><div class="mb-empty__icon">${icon}</div><div class="mb-empty__text">${text}</div></div>`;
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
   ClassView — 班級概況視圖
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

        // 概覽統計卡片
        html += `
            <div class="mbt-report-grid">
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.classSize')}</div>
                    <div class="mbt-report-card__value">${totalStudents}</div>
                    <div class="mbt-report-card__sub">${className}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.avgMastery')}</div>
                    <div class="mbt-report-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${Math.round(avgMastery)}%</div>
                    <div class="mbt-report-card__sub">${TeacherUI.subjectLabel(subject)}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.totalMistakes')}</div>
                    <div class="mbt-report-card__value">${totalMistakes}</div>
                    <div class="mbt-report-card__sub">${i18n.t('mbt.classTotal')}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.atRisk')}</div>
                    <div class="mbt-report-card__value ${atRiskCount > 0 ? 'mbt-report-card__value--danger' : 'mbt-report-card__value--success'}">${atRiskCount}</div>
                    <div class="mbt-report-card__sub">${i18n.t('mbt.atRiskThreshold')}</div>
                </div>
            </div>
        `;

        // 班級共同薄弱知識點
        if (weakPoints.length) {
            html += `<div class="mbt-section-title">${i18n.t('mbt.commonWeakPoints')}</div>`;
            html += '<div class="mbt-weakness-list">';

            weakPoints.slice(0, 10).forEach((wp, i) => {
                const rankClass = i < 3 ? 'mbt-weakness-item__rank--top3' : '';
                html += `
                    <div class="mbt-weakness-item">
                        <div class="mbt-weakness-item__rank ${rankClass}">${i + 1}</div>
                        <div class="mbt-weakness-item__info">
                            <div class="mbt-weakness-item__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                            <div class="mbt-weakness-item__stats">
                                ${i18n.t('mbt.studentsAffected', {count: wp.affected_students || 0, total: wp.total_mistakes || 0})}
                            </div>
                        </div>
                        <div class="mbt-weakness-item__bar">
                            <div style="font-size:12px;text-align:right;margin-bottom:2px;color:${TeacherUI.masteryColor(wp.avg_mastery || 0)}">
                                ${Math.round(wp.avg_mastery || 0)}%
                            </div>
                            <div class="mb-mastery-bar">
                                <div class="mb-mastery-bar__fill mb-mastery-bar__fill--${TeacherUI.masteryClass(wp.avg_mastery || 0)}"
                                     style="width:${wp.avg_mastery || 0}%"></div>
                            </div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        }

        // 學生列表
        if (students.length) {
            html += `<div class="mbt-section-title">${i18n.t('mbt.studentList')}</div>`;
            html += '<div class="mbt-student-list">';

            // 按掌握度升序排列（薄弱學生在前）
            const sorted = [...students].sort((a, b) =>
                (a.avg_mastery || 0) - (b.avg_mastery || 0)
            );

            sorted.forEach(s => {
                const mastery = Math.round(s.avg_mastery || 0);
                html += `
                    <div class="mbt-student-item" onclick="TeacherApp.viewStudent('${TeacherUI.escapeHtml(s.username)}')">
                        <div class="mbt-student-item__avatar">${TeacherUI.avatarLetter(s.display_name || s.username)}</div>
                        <div class="mbt-student-item__info">
                            <div class="mbt-student-item__name">${TeacherUI.escapeHtml(s.display_name || s.username)}</div>
                            <div class="mbt-student-item__meta">
                                ${i18n.t('mbt.mistakes', {count: s.mistake_count || 0, review: s.review_count || 0})}
                            </div>
                        </div>
                        <div class="mbt-student-item__mastery">
                            <div class="mbt-student-item__mastery-value" style="color:${TeacherUI.masteryColor(mastery)}">
                                ${mastery}%
                            </div>
                            <div class="mbt-student-item__mastery-label">${i18n.t('mbt.masteryLabel')}</div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        } else if (!weakPoints.length) {
            html += TeacherUI.empty('📭', i18n.t('mbt.noData'));
        }

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
                ${i18n.t('mbt.backToClass')}
            </div>
        `;

        // 學生頭部
        html += `
            <div class="mbt-student-header">
                <div class="mbt-student-header__avatar">${TeacherUI.avatarLetter(displayName)}</div>
                <div>
                    <div class="mbt-student-header__name">${TeacherUI.escapeHtml(displayName)}</div>
                    <div class="mbt-student-header__class">
                        ${TeacherUI.escapeHtml(overview.class_name || '')} · ${TeacherUI.subjectLabel(subject)}
                    </div>
                </div>
            </div>
        `;

        // 統計概覽
        const stats = overview.subject_stats || {};
        const subjectStat = stats[subject] || {};
        const totalMistakes = subjectStat.total_mistakes || overview.total_mistakes || 0;
        const avgMastery = Math.round(subjectStat.avg_mastery || overview.avg_mastery || 0);
        const reviewCount = subjectStat.review_count || overview.review_count || 0;
        const masteredCount = subjectStat.mastered_count || overview.mastered_count || 0;

        html += `
            <div class="mbt-report-grid">
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.mistakeCount')}</div>
                    <div class="mbt-report-card__value">${totalMistakes}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.masteryLabel')}</div>
                    <div class="mbt-report-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${avgMastery}%</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.reviewCount')}</div>
                    <div class="mbt-report-card__value">${reviewCount}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">${i18n.t('mbt.masteredCount')}</div>
                    <div class="mbt-report-card__value mbt-report-card__value--success">${masteredCount}</div>
                </div>
            </div>
        `;

        // AI 薄弱分析
        const weakness = overview.weakness_report;
        if (weakness) {
            if (weakness.ai_summary) {
                html += `
                    <div style="padding:0 16px">
                        <div class="mb-detail-section">
                            <div class="mb-detail-section__title">${i18n.t('mbt.aiSummary')}</div>
                            <div class="mb-detail-section__body">${TeacherUI.escapeHtml(weakness.ai_summary)}</div>
                            ${weakness.encouragement ? `<div style="margin-top:8px;font-style:italic;color:var(--mb-primary)">${TeacherUI.escapeHtml(weakness.encouragement)}</div>` : ''}
                        </div>
                    </div>
                `;
            }

            if (weakness.recommendations && weakness.recommendations.length) {
                html += `
                    <div style="padding:0 16px">
                        <div class="mb-detail-section">
                            <div class="mb-detail-section__title">${i18n.t('mbt.teachingSuggestions')}</div>
                            <div class="mb-detail-section__body">
                                ${weakness.recommendations.map(r =>
                                    `<div style="padding:4px 0">• ${TeacherUI.escapeHtml(r)}</div>`
                                ).join('')}
                            </div>
                        </div>
                    </div>
                `;
            }

            // 薄弱知識點
            const weakPoints = weakness.weak_points || [];
            if (weakPoints.length) {
                html += `<div class="mbt-section-title">${i18n.t('mbt.weakPoints')}</div>`;
                html += '<div class="mbt-weakness-list">';

                weakPoints.slice(0, 10).forEach((wp, i) => {
                    const rankClass = i < 3 ? 'mbt-weakness-item__rank--top3' : '';
                    html += `
                        <div class="mbt-weakness-item">
                            <div class="mbt-weakness-item__rank ${rankClass}">${i + 1}</div>
                            <div class="mbt-weakness-item__info">
                                <div class="mbt-weakness-item__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                                <div class="mbt-weakness-item__stats">
                                    ${i18n.t('mbt.mistakeN', {count: wp.mistake_count || 0})}
                                    ${wp.trend === 'declining' ? i18n.t('mbt.trendDecline') : ''}
                                    ${wp.trend === 'improving' ? i18n.t('mbt.trendImprove') : ''}
                                </div>
                            </div>
                            <div class="mbt-weakness-item__bar">
                                <div style="font-size:12px;text-align:right;margin-bottom:2px;color:${TeacherUI.masteryColor(wp.mastery_level || 0)}">
                                    ${Math.round(wp.mastery_level || 0)}%
                                </div>
                                <div class="mb-mastery-bar">
                                    <div class="mb-mastery-bar__fill mb-mastery-bar__fill--${TeacherUI.masteryClass(wp.mastery_level || 0)}"
                                         style="width:${wp.mastery_level || 0}%"></div>
                                </div>
                            </div>
                        </div>
                    `;
                });

                html += '</div>';
            }
        }

        // 錯題列表
        const mistakes = overview.recent_mistakes || [];
        if (mistakes.length) {
            html += `<div class="mbt-section-title">${i18n.t('mbt.recentMistakes')}</div>`;
            html += '<div style="padding:0 16px 16px">';

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
