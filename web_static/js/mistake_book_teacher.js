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
 *   - 使用繁體中文作為界面語言
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
        selectedSubject: 'chinese',
        classReport: null,
        studentDetail: null,
        classes: [],
    },

    async init() {
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
                '🔒', '此頁面僅限教師和管理員使用'
            );
            return;
        }

        this._bindEvents();
        await this._loadClasses();
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
                main.innerHTML = TeacherUI.empty('📊', '請選擇班級和科目，然後點擊「查看報告」');
            }
        } else if (tab === 'student-detail') {
            if (this.state.studentDetail) {
                StudentView.render(main, this.state.studentDetail);
            } else {
                main.innerHTML = TeacherUI.empty('👤', '請從班級概況中點擊學生查看詳情');
            }
        }
    },

    async loadClassReport() {
        const className = document.getElementById('classSelect').value;
        const subject = document.getElementById('subjectSelect').value;

        if (!className) {
            TeacherUI.toast('請先選擇班級', 'error');
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
            main.innerHTML = TeacherUI.empty('❌', '載入失敗，請重試');
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
            main.innerHTML = TeacherUI.empty('❌', '載入學生數據失敗');
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
        return '<div class="mb-loading"><div class="mb-loading__spinner"></div>載入中...</div>';
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
        const map = { chinese: '中文', math: '數學', english: '英文' };
        return map[subject] || subject;
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
                    <div class="mbt-report-card__title">班級人數</div>
                    <div class="mbt-report-card__value">${totalStudents}</div>
                    <div class="mbt-report-card__sub">${className}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">平均掌握度</div>
                    <div class="mbt-report-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${Math.round(avgMastery)}%</div>
                    <div class="mbt-report-card__sub">${TeacherUI.subjectLabel(subject)}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">總錯題數</div>
                    <div class="mbt-report-card__value">${totalMistakes}</div>
                    <div class="mbt-report-card__sub">班級合計</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">需關注學生</div>
                    <div class="mbt-report-card__value ${atRiskCount > 0 ? 'mbt-report-card__value--danger' : 'mbt-report-card__value--success'}">${atRiskCount}</div>
                    <div class="mbt-report-card__sub">掌握度 &lt; 40%</div>
                </div>
            </div>
        `;

        // 班級共同薄弱知識點
        if (weakPoints.length) {
            html += `<div class="mbt-section-title">🎯 班級共同薄弱知識點</div>`;
            html += '<div class="mbt-weakness-list">';

            weakPoints.slice(0, 10).forEach((wp, i) => {
                const rankClass = i < 3 ? 'mbt-weakness-item__rank--top3' : '';
                html += `
                    <div class="mbt-weakness-item">
                        <div class="mbt-weakness-item__rank ${rankClass}">${i + 1}</div>
                        <div class="mbt-weakness-item__info">
                            <div class="mbt-weakness-item__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                            <div class="mbt-weakness-item__stats">
                                ${wp.affected_students || 0} 位學生出錯 · 共 ${wp.total_mistakes || 0} 題
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
            html += `<div class="mbt-section-title">👥 學生列表（按掌握度排序）</div>`;
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
                                錯題 ${s.mistake_count || 0} 題 · 已複習 ${s.review_count || 0} 次
                            </div>
                        </div>
                        <div class="mbt-student-item__mastery">
                            <div class="mbt-student-item__mastery-value" style="color:${TeacherUI.masteryColor(mastery)}">
                                ${mastery}%
                            </div>
                            <div class="mbt-student-item__mastery-label">掌握度</div>
                        </div>
                    </div>
                `;
            });

            html += '</div>';
        } else if (!weakPoints.length) {
            html += TeacherUI.empty('📭', '該班級暫無錯題數據');
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
                ← 返回班級概況
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
                    <div class="mbt-report-card__title">錯題數</div>
                    <div class="mbt-report-card__value">${totalMistakes}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">掌握度</div>
                    <div class="mbt-report-card__value" style="color:${TeacherUI.masteryColor(avgMastery)}">${avgMastery}%</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">複習次數</div>
                    <div class="mbt-report-card__value">${reviewCount}</div>
                </div>
                <div class="mbt-report-card">
                    <div class="mbt-report-card__title">已掌握</div>
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
                            <div class="mb-detail-section__title">🤖 AI 分析摘要</div>
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
                            <div class="mb-detail-section__title">💡 教學建議</div>
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
                html += `<div class="mbt-section-title">🎯 薄弱知識點</div>`;
                html += '<div class="mbt-weakness-list">';

                weakPoints.slice(0, 10).forEach((wp, i) => {
                    const rankClass = i < 3 ? 'mbt-weakness-item__rank--top3' : '';
                    html += `
                        <div class="mbt-weakness-item">
                            <div class="mbt-weakness-item__rank ${rankClass}">${i + 1}</div>
                            <div class="mbt-weakness-item__info">
                                <div class="mbt-weakness-item__name">${TeacherUI.escapeHtml(wp.point_name)}</div>
                                <div class="mbt-weakness-item__stats">
                                    錯 ${wp.mistake_count || 0} 題
                                    ${wp.trend === 'declining' ? ' · ⬇ 下降趨勢' : ''}
                                    ${wp.trend === 'improving' ? ' · ⬆ 上升趨勢' : ''}
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
            html += `<div class="mbt-section-title">📝 最近錯題</div>`;
            html += '<div style="padding:0 16px 16px">';

            mistakes.forEach(m => {
                const question = m.manual_question_text || m.ocr_question_text || '（未識別）';
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
                            <span>掌握 ${m.mastery_level || 0}%</span>
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
            pending_ocr: '待識別',
            pending_review: '待確認',
            analyzed: '已分析',
            practicing: '練習中',
            mastered: '已掌握',
        };
        return map[status] || status;
    },

    _errorTypeLabel(type) {
        const map = {
            concept_error: '概念錯誤',
            calculation_error: '計算錯誤',
            comprehension_gap: '理解偏差',
            careless: '粗心大意',
            expression_weak: '表達不足',
            memory_error: '記憶錯誤',
            logic_error: '邏輯錯誤',
            method_error: '方法錯誤',
        };
        return map[type] || type || '';
    },
};


/* ============================================================
   啟動
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => TeacherApp.init());
