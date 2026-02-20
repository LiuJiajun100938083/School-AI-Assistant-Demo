/**
 * 學習分析儀表板 — 前端核心模組
 * ================================
 *
 * 架構：
 *   AnalyticsAPI  — API 請求封裝
 *   AnalyticsUI   — DOM 渲染與圖表
 *   AnalyticsApp  — 主控制器
 *
 * 外部依賴: Chart.js, Axios
 * 依賴共享模組: AuthModule, UIModule
 * 加載順序: Chart.js → Axios → shared/* → analytics_dashboard.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const AnalyticsAPI = {

    _headers() {
        return { 'Authorization': `Bearer ${AuthModule.getToken()}` };
    },

    async getOverview(params) {
        const resp = await axios.get('/api/analytics/overview', {
            params, headers: this._headers()
        });
        return resp.data;
    },

    async getClasses() {
        const resp = await axios.get('/api/teacher/classes', {
            headers: this._headers()
        });
        return resp.data;
    },

    async getSubjects() {
        const resp = await axios.get('/api/admin/subjects', {
            headers: this._headers()
        });
        return resp.data;
    },

    async getStudents(classId) {
        const resp = await axios.get(`/api/teacher/class/${classId || 'all'}/students`, {
            headers: this._headers()
        });
        return resp.data;
    },

    async getKnowledge(params) {
        const resp = await axios.get('/api/analytics/knowledge', {
            params, headers: this._headers()
        });
        return resp.data;
    },

    async getWarnings() {
        const resp = await axios.get('/api/teacher/analytics/warnings', {
            headers: this._headers()
        });
        return resp.data;
    },

    async getTeacherDistribution() {
        const resp = await axios.get('/api/teacher/subjects/distribution', {
            headers: this._headers()
        });
        return resp.data;
    },

    async getProgress(params) {
        const resp = await axios.get('/api/analytics/progress', {
            params, headers: this._headers()
        });
        return resp.data;
    }
};

/* ============================================================
   UI — DOM 渲染與圖表
   ============================================================ */

const AnalyticsUI = {

    elements: {},
    charts: {},

    cacheElements() {
        this.elements = {
            classFilter: document.getElementById('classFilter'),
            subjectFilter: document.getElementById('subjectFilter'),
            timeFilter: document.getElementById('timeFilter'),
            avgMastery: document.getElementById('avgMastery'),
            masteryProgress: document.getElementById('masteryProgress'),
            riskCount: document.getElementById('riskCount'),
            highRisk: document.getElementById('highRisk'),
            mediumRisk: document.getElementById('mediumRisk'),
            activityScore: document.getElementById('activityScore'),
            questionQuality: document.getElementById('questionQuality'),
            studentList: document.getElementById('studentList'),
            knowledgeMap: document.getElementById('knowledgeMap'),
            warningList: document.getElementById('warningList'),
            teacherAssignment: document.getElementById('teacherAssignment')
        };
    },

    /* ---------- 總覽統計 ---------- */

    updateOverviewStats(data) {
        this.elements.avgMastery.textContent = `${(data.avg_mastery * 100).toFixed(1)}%`;
        this.elements.masteryProgress.style.width = `${data.avg_mastery * 100}%`;
        this.elements.riskCount.textContent = data.risk_count;
        this.elements.highRisk.textContent = `高風險: ${data.high_risk}`;
        this.elements.mediumRisk.textContent = `中風險: ${data.medium_risk}`;
        this.elements.activityScore.textContent = data.activity_score.toFixed(1);
        this.elements.questionQuality.textContent = `${(data.question_quality * 100).toFixed(1)}%`;
    },

    /* ---------- 圖表繪製 ---------- */

    drawActivityChart(data) {
        const ctx = document.getElementById('activityChart').getContext('2d');
        if (this.charts.activity) this.charts.activity.destroy();

        this.charts.activity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: '活躍度',
                    data: data.values,
                    borderColor: '#4A90E2',
                    backgroundColor: 'rgba(74, 144, 226, 0.1)',
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            }
        });
    },

    drawQualityChart(data) {
        const ctx = document.getElementById('qualityChart').getContext('2d');
        if (this.charts.quality) this.charts.quality.destroy();

        this.charts.quality = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['深度', '複雜度', '創新性', '清晰度', '相關性'],
                datasets: [{
                    label: '問題質量',
                    data: data.scores,
                    backgroundColor: 'rgba(123, 104, 238, 0.2)',
                    borderColor: '#7B68EE',
                    pointBackgroundColor: '#7B68EE'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { r: { beginAtZero: true, max: 1 } }
            }
        });
    },

    drawKnowledgeChart(data) {
        const ctx = document.getElementById('knowledgeChart').getContext('2d');
        if (this.charts.knowledge) this.charts.knowledge.destroy();

        this.charts.knowledge = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.points.map(p => p.name),
                datasets: [{
                    label: '掌握度',
                    data: data.points.map(p => p.mastery * 100),
                    backgroundColor: data.points.map(p =>
                        p.mastery > 0.7 ? '#5CB85C' :
                        p.mastery > 0.4 ? '#F0AD4E' : '#D9534F'
                    )
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    },

    drawProgressChart(data) {
        const ctx = document.getElementById('progressChart').getContext('2d');
        if (this.charts.progress) this.charts.progress.destroy();

        this.charts.progress = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [
                    {
                        label: '掌握度',
                        data: data.mastery,
                        borderColor: '#4A90E2',
                        backgroundColor: 'rgba(74, 144, 226, 0.1)'
                    },
                    {
                        label: '活躍度',
                        data: data.activity,
                        borderColor: '#5CB85C',
                        backgroundColor: 'rgba(92, 184, 92, 0.1)'
                    },
                    {
                        label: '質量分',
                        data: data.quality,
                        borderColor: '#7B68EE',
                        backgroundColor: 'rgba(123, 104, 238, 0.1)'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { y: { beginAtZero: true, max: 100 } }
            }
        });
    },

    /* ---------- 列表渲染 ---------- */

    renderStudentList(students) {
        this.elements.studentList.innerHTML = '';

        students.forEach(student => {
            const riskClass = student.risk_level === 'high' ? 'risk-high' :
                student.risk_level === 'medium' ? 'risk-medium' : 'risk-low';

            const item = document.createElement('div');
            item.className = 'student-item';
            item.dataset.studentId = student.id;
            item.innerHTML = `
                <div>
                    <div class="student-name">${Utils.escapeHtml(student.name)}</div>
                    <div style="font-size: 12px; color: #999;">
                        掌握度: ${(student.mastery * 100).toFixed(1)}% |
                        活躍度: ${student.activity.toFixed(1)}
                    </div>
                </div>
                <span class="risk-badge ${riskClass}">${student.risk_level}</span>
            `;
            this.elements.studentList.appendChild(item);
        });
    },

    renderKnowledgeMap(points) {
        this.elements.knowledgeMap.innerHTML = '';

        points.forEach(point => {
            const cls = point.mastery > 0.7 ? 'mastery-high' :
                point.mastery > 0.4 ? 'mastery-medium' : 'mastery-low';

            const div = document.createElement('div');
            div.className = `knowledge-point ${cls}`;
            div.innerHTML = `
                <div>${Utils.escapeHtml(point.name)}</div>
                <div style="font-size: 20px; margin-top: 5px;">
                    ${(point.mastery * 100).toFixed(0)}%
                </div>
            `;
            this.elements.knowledgeMap.appendChild(div);
        });
    },

    renderWarnings(warnings) {
        this.elements.warningList.innerHTML = '';

        warnings.forEach(warning => {
            const div = document.createElement('div');
            div.className = `warning-item ${warning.severity}`;
            div.innerHTML = `
                <div style="font-weight: bold; margin-bottom: 5px;">
                    ${Utils.escapeHtml(warning.student_name)} - ${Utils.escapeHtml(warning.subject)}
                </div>
                <div>${Utils.escapeHtml(warning.description)}</div>
                <div style="font-size: 12px; color: #666; margin-top: 5px;">
                    ${new Date(warning.detected_at).toLocaleString()}
                </div>
            `;
            this.elements.warningList.appendChild(div);
        });
    },

    renderTeachers(distribution) {
        this.elements.teacherAssignment.innerHTML = '';

        Object.entries(distribution).forEach(([subject, data]) => {
            data.teachers.forEach(teacher => {
                const div = document.createElement('div');
                div.className = 'teacher-card';
                div.innerHTML = `
                    <div class="teacher-name">${Utils.escapeHtml(teacher.name)}</div>
                    <div class="teacher-subjects">${Utils.escapeHtml(subject)}</div>
                    <div style="margin-top: 8px;">
                        ${teacher.classes.map(cls =>
                            `<span class="class-badge">${Utils.escapeHtml(cls)}</span>`
                        ).join('')}
                    </div>
                `;
                this.elements.teacherAssignment.appendChild(div);
            });
        });
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const AnalyticsApp = {

    state: {
        currentClass: '',
        currentSubject: '',
        currentDays: 30,
        activeTab: 'overview'
    },

    async init() {
        AnalyticsUI.cacheElements();
        await this._initializeFilters();
        this._bindEvents();
        this._loadTabData('overview');
    },

    async _initializeFilters() {
        try {
            const [classData, subjectData] = await Promise.all([
                AnalyticsAPI.getClasses(),
                AnalyticsAPI.getSubjects()
            ]);

            classData.classes.forEach(cls => {
                const opt = document.createElement('option');
                opt.value = cls.id;
                opt.textContent = cls.name;
                AnalyticsUI.elements.classFilter.appendChild(opt);
            });

            Object.entries(subjectData.subjects).forEach(([code, subject]) => {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = subject.name;
                AnalyticsUI.elements.subjectFilter.appendChild(opt);
            });
        } catch (error) {
            console.error('加載過濾器失敗:', error);
        }
    },

    _bindEvents() {
        // Tab 切換
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                const tabName = tab.dataset.tab;
                if (!tabName) return;

                // 更新 UI 狀態
                document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.getElementById(`${tabName}-content`).style.display = 'block';
                tab.classList.add('active');

                this.state.activeTab = tabName;
                this._loadTabData(tabName);
            });
        });

        // 刷新按鈕
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this._refreshData();
        });

        // 學生列表點擊
        AnalyticsUI.elements.studentList.addEventListener('click', (e) => {
            const item = e.target.closest('.student-item');
            if (item?.dataset.studentId) {
                window.location.href = `/student-report?id=${item.dataset.studentId}`;
            }
        });
    },

    _refreshData() {
        this.state.currentClass = AnalyticsUI.elements.classFilter.value;
        this.state.currentSubject = AnalyticsUI.elements.subjectFilter.value;
        this.state.currentDays = parseInt(AnalyticsUI.elements.timeFilter.value);
        this._loadTabData(this.state.activeTab);
    },

    async _loadTabData(tabName) {
        const params = {
            class_id: this.state.currentClass,
            subject: this.state.currentSubject,
            days: this.state.currentDays
        };

        try {
            switch (tabName) {
                case 'overview':
                    const overview = await AnalyticsAPI.getOverview(params);
                    AnalyticsUI.updateOverviewStats(overview);
                    AnalyticsUI.drawActivityChart(overview.activity_data);
                    AnalyticsUI.drawQualityChart(overview.quality_data);
                    break;

                case 'students':
                    const studentData = await AnalyticsAPI.getStudents(this.state.currentClass);
                    AnalyticsUI.renderStudentList(studentData.students);
                    break;

                case 'knowledge':
                    const knowledgeData = await AnalyticsAPI.getKnowledge(params);
                    AnalyticsUI.renderKnowledgeMap(knowledgeData.points);
                    AnalyticsUI.drawKnowledgeChart(knowledgeData);
                    break;

                case 'warnings':
                    const warningData = await AnalyticsAPI.getWarnings();
                    AnalyticsUI.renderWarnings(warningData.warnings);
                    break;

                case 'teachers':
                    const teacherData = await AnalyticsAPI.getTeacherDistribution();
                    AnalyticsUI.renderTeachers(teacherData.subjects);
                    break;

                case 'progress':
                    const progressData = await AnalyticsAPI.getProgress(params);
                    AnalyticsUI.drawProgressChart(progressData);
                    break;
            }
        } catch (error) {
            console.error(`加載${tabName}數據失敗:`, error);
        }
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    AnalyticsApp.init();
});
