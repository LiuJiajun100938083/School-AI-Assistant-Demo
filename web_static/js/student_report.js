/**
 * 學習分析報告 — 前端核心模組
 * =============================
 *
 * 架構：
 *   ReportAPI  — API 請求封裝
 *   ReportUI   — DOM 渲染工具
 *   ReportApp  — 主控制器
 *
 * 依賴共享模組: AuthModule, APIClient, UIModule, Utils
 * 加載順序: shared/* → student_report.js
 */
'use strict';

/* ============================================================
   API — 後端 API 封裝
   ============================================================ */

const ReportAPI = {

    /**
     * 獲取分析報告
     * @param {string} subject - 學科代碼 ('all' 表示全部)
     * @param {AbortSignal} signal - 可選取消信號
     */
    async getAnalysis(subject, signal) {
        const url = subject === 'all'
            ? '/api/student/overall-analysis'
            : `/api/student/analysis/${encodeURIComponent(subject)}`;

        const resp = await fetch(url, {
            method: 'GET',
            headers: AuthModule.getAuthHeaders(),
            signal
        });

        if (!resp.ok) {
            const errorData = await resp.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${resp.status}`);
        }

        return resp.json();
    },

    /**
     * 取消分析
     */
    async cancelAnalysis(subject) {
        try {
            await fetch('/api/student/analysis/cancel', {
                method: 'POST',
                headers: {
                    ...AuthModule.getAuthHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    subject: subject === 'all' ? 'all' : subject
                })
            });
        } catch (e) {
            console.warn('取消後端任務失敗:', e);
        }
    }
};

/* ============================================================
   UI — DOM 渲染工具
   ============================================================ */

const ReportUI = {

    elements: {},

    cacheElements() {
        this.elements = {
            subjectSelect: document.getElementById('subjectSelect'),
            startBtn: document.getElementById('startAnalysisBtn'),
            cancelBtn: document.getElementById('cancelAnalysisBtn'),
            statusMessage: document.getElementById('statusMessage'),
            analyzingStatus: document.getElementById('analyzingStatus'),
            welcomeState: document.getElementById('welcomeState'),
            reportContent: document.getElementById('reportContent')
        };
    },

    /** 學科信息映射 */
    subjectInfo: {
        'ict':       { name: 'ICT',  icon: '💻' },
        'ces':       { name: 'CES',  icon: '🏛️' },
        'history':   { name: '歷史', icon: '📜' },
        'chinese':   { name: '中文', icon: '📖' },
        'english':   { name: '英文', icon: '🔤' },
        'math':      { name: '數學', icon: '🔢' },
        'physics':   { name: '物理', icon: '⚛️' },
        'chemistry': { name: '化學', icon: '🧪' },
        'biology':   { name: '生物', icon: '🧬' }
    },

    showAnalyzing() {
        this.elements.startBtn.disabled = true;
        this.elements.cancelBtn.style.display = 'inline-flex';
        this.elements.welcomeState.style.display = 'none';
        this.elements.analyzingStatus.style.display = 'flex';
        this.elements.reportContent.classList.remove('show');
    },

    showResult() {
        this.elements.analyzingStatus.style.display = 'none';
        this.elements.reportContent.classList.add('show');
    },

    showWelcome() {
        this.elements.analyzingStatus.style.display = 'none';
        this.elements.welcomeState.style.display = 'block';
    },

    resetButtons() {
        this.elements.startBtn.disabled = false;
        this.elements.cancelBtn.style.display = 'none';
    },

    /**
     * 渲染全部學科報告
     */
    renderOverallReport(data) {
        this.elements.reportContent.innerHTML = `
            <div class="report-section">
                <h3>📊 總體學習概覽</h3>
                <p>${data.overview_summary || '暫無總體概覽'}</p>
            </div>
            <div class="report-section">
                <h3>📈 整體評估</h3>
                <p>${data.overall_assessment || '暫無整體評估'}</p>
            </div>
            <div class="subject-grid">
                ${this._generateSubjectCards(data.subjects || {})}
            </div>
        `;
    },

    /**
     * 渲染單科詳細報告
     */
    renderSubjectReport(data) {
        this.elements.reportContent.innerHTML = `
            <div class="report-section">
                <h3>📚 知識掌握情況</h3>
                <p>${data.knowledge_mastery_report || '暫無數據'}</p>
            </div>
            <div class="report-section">
                <h3>🎨 學習風格分析</h3>
                <p>${data.learning_style_report || '暫無數據'}</p>
            </div>
            <div class="report-section">
                <h3>⚠️ 學習困難分析</h3>
                <p>${data.difficulty_report || '暫無數據'}</p>
            </div>
            <div class="report-section">
                <h3>💭 情感狀態分析</h3>
                <p>${data.emotion_report || '暫無數據'}</p>
            </div>
            <div class="report-section">
                <h3>📈 學習進度評估</h3>
                <p>${data.progress_report || '暫無數據'}</p>
            </div>
            <div class="report-section">
                <h3>💡 個性化學習建議</h3>
                <p>${data.suggestion_report || '暫無數據'}</p>
            </div>
        `;
    },

    _generateSubjectCards(subjects) {
        return Object.entries(subjects).map(([key, data]) => {
            const info = this.subjectInfo[key] || { name: key, icon: '📚' };
            return `
                <div class="subject-card" data-subject="${key}">
                    <div class="subject-icon">${info.icon}</div>
                    <div class="subject-name">${info.name}</div>
                    <div class="subject-hint">
                        ${data.has_data ? '點擊查看詳情' : '暫無數據'}
                    </div>
                </div>
            `;
        }).join('');
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const ReportApp = {

    state: {
        isAnalyzing: false,
        abortController: null
    },

    init() {
        ReportUI.cacheElements();
        this._bindEvents();
    },

    _bindEvents() {
        // 開始分析
        ReportUI.elements.startBtn.addEventListener('click', () => {
            this.startAnalysis();
        });

        // 取消分析
        ReportUI.elements.cancelBtn.addEventListener('click', () => {
            this.cancelAnalysis();
        });

        // 返回按鈕
        document.querySelector('.back-btn')?.addEventListener('click', () => {
            window.location.href = '/';
        });

        // 學科卡片點擊（事件委託）
        ReportUI.elements.reportContent.addEventListener('click', (e) => {
            const card = e.target.closest('.subject-card');
            if (!card) return;
            const subject = card.dataset.subject;
            if (subject) {
                ReportUI.elements.subjectSelect.value = subject;
                this.startAnalysis();
            }
        });
    },

    async startAnalysis() {
        if (this.state.isAnalyzing) {
            UIModule.toast('分析正在進行中，請稍候...', 'warning');
            return;
        }

        const subject = ReportUI.elements.subjectSelect.value;
        const subjectName = ReportUI.elements.subjectSelect.selectedOptions[0].text;

        this.state.isAnalyzing = true;
        this.state.abortController = new AbortController();

        ReportUI.showAnalyzing();
        UIModule.toast(`正在生成${subjectName}的學習報告...`, 'info');

        try {
            const data = await ReportAPI.getAnalysis(
                subject,
                this.state.abortController.signal
            );

            if (subject === 'all') {
                ReportUI.renderOverallReport(data);
            } else {
                ReportUI.renderSubjectReport(data);
            }

            ReportUI.showResult();
            UIModule.toast('分析報告生成成功！', 'success');

        } catch (error) {
            if (error.name === 'AbortError') {
                UIModule.toast('分析已中斷', 'info');
            } else {
                console.error('分析失敗:', error);
                UIModule.toast(`分析失敗：${error.message || '請稍後重試'}`, 'error');
            }
            ReportUI.showWelcome();
        } finally {
            this.state.isAnalyzing = false;
            this.state.abortController = null;
            ReportUI.resetButtons();
        }
    },

    async cancelAnalysis() {
        if (!this.state.isAnalyzing || !this.state.abortController) return;

        this.state.abortController.abort();

        const subject = ReportUI.elements.subjectSelect.value;
        await ReportAPI.cancelAnalysis(subject);

        this.state.isAnalyzing = false;
        this.state.abortController = null;

        ReportUI.resetButtons();
        ReportUI.showWelcome();
        UIModule.toast('分析已中斷', 'info');
    }
};

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    ReportApp.init();
});
