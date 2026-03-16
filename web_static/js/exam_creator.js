/**
 * AI 考卷出題 — 前端邏輯
 * ========================
 * 分層：API → UI → Views → State → App
 */

const ExamCreator = (() => {
    'use strict';

    // ================================================================
    // State — 集中管理頁面狀態
    // ================================================================
    const state = {
        token: null,
        username: '',
        sessionId: null,
        questions: [],
        difficulty: 3,
        pollTimer: null,
        editingIndex: -1,
        knowledgePoints: [],
    };

    // ================================================================
    // API — 後端 fetch 封裝
    // ================================================================
    const API = {
        _headers() {
            return {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.token}`,
            };
        },

        async generate(params) {
            const resp = await fetch('/api/exam-creator/generate', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(params),
            });
            return resp.json();
        },

        async getStatus(sessionId) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/status`, {
                headers: this._headers(),
            });
            return resp.json();
        },

        async updateQuestion(sessionId, index, edits) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/questions/${index}`, {
                method: 'PUT',
                headers: this._headers(),
                body: JSON.stringify({ question_index: index, edits }),
            });
            return resp.json();
        },

        async regenerateQuestion(sessionId, index, instruction) {
            const resp = await fetch(`/api/exam-creator/${sessionId}/regenerate`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify({ question_index: index, instruction }),
            });
            return resp.json();
        },

        async getKnowledgePoints(subject) {
            const resp = await fetch(`/api/exam-creator/knowledge-points/${subject}`, {
                headers: this._headers(),
            });
            return resp.json();
        },
    };

    // ================================================================
    // UI — 渲染工具
    // ================================================================
    const UI = {
        renderMath(text) {
            if (!text) return '';
            // 保護 SVG 塊
            const svgBlocks = [];
            text = text.replace(/<svg[\s\S]*?<\/svg>/gi, m => {
                svgBlocks.push(m); return `SVGPH${svgBlocks.length - 1}ENDSVGPH`;
            });
            // KaTeX display: $$...$$
            let html = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, tex) => {
                try {
                    return katex.renderToString(tex.trim(), { throwOnError: false, displayMode: true, strict: 'ignore' });
                } catch { return `$$${tex}$$`; }
            });
            // KaTeX inline: $...$（跳過純中文/CJK 內容）
            html = html.replace(/\$([^$\n]+?)\$/g, (full, tex) => {
                // 如果內容幾乎全是中文/CJK，不當作 LaTeX
                const cjk = tex.replace(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef，。：；！？、]/g, '');
                if (cjk.trim().length < tex.trim().length * 0.3) return full;
                try {
                    return katex.renderToString(tex, { throwOnError: false, strict: 'ignore' });
                } catch { return full; }
            });
            // Markdown (GFM tables supported)
            if (typeof marked !== 'undefined') {
                html = marked.parse(html, { gfm: true, breaks: true });
            }
            // Sanitize
            if (typeof DOMPurify !== 'undefined') {
                html = DOMPurify.sanitize(html, {
                    ADD_TAGS: ['svg', 'path', 'line', 'circle', 'rect', 'text', 'g', 'defs',
                               'marker', 'polygon', 'polyline', 'ellipse', 'use'],
                    ADD_ATTR: ['viewBox', 'fill', 'stroke', 'stroke-width', 'd', 'cx', 'cy',
                               'r', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'width', 'height',
                               'transform', 'font-size', 'text-anchor', 'dominant-baseline',
                               'stroke-linecap', 'stroke-linejoin', 'points', 'rx', 'ry',
                               'markerWidth', 'markerHeight', 'refX', 'refY', 'orient',
                               'stroke-dasharray', 'opacity'],
                });
            }
            // 還原 SVG 塊
            svgBlocks.forEach((svg, i) => {
                html = html.replace(`SVGPH${i}ENDSVGPH`, svg);
            });
            return html;
        },

        $(id) { return document.getElementById(id); },

        show(id) { const el = this.$(id); if (el) el.style.display = ''; },
        hide(id) { const el = this.$(id); if (el) el.style.display = 'none'; },
    };

    // ================================================================
    // Views — 各面板渲染
    // ================================================================
    const Views = {
        renderKnowledgePoints(points) {
            const container = UI.$('pointsList');
            if (!points.length) {
                container.innerHTML = '<div class="loading-text">暫無知識點數據</div>';
                return;
            }

            // Group by category
            const groups = {};
            points.forEach(p => {
                const cat = p.category || '其他';
                if (!groups[cat]) groups[cat] = [];
                groups[cat].push(p);
            });

            let html = '';
            for (const [cat, pts] of Object.entries(groups)) {
                html += `<div class="point-category">${cat}</div>`;
                pts.forEach(p => {
                    html += `
                        <label class="point-item">
                            <input type="checkbox" value="${p.point_code}" data-name="${p.point_name}">
                            <span>${p.point_name}</span>
                        </label>`;
                });
            }
            container.innerHTML = html;
            UI.$('pointsCount').textContent = `(${points.length} 個)`;
        },

        renderQuestions(questions) {
            const container = UI.$('questionsList');
            if (!questions || !questions.length) {
                container.innerHTML = '<div class="loading-text">無題目</div>';
                return;
            }

            let html = '';
            const typeLabels = {
                multiple_choice: '選擇題', short_answer: '簡答題',
                long_answer: '解答題', fill_blank: '填空題',
            };

            const pendingJsx = [];

            questions.forEach((q, i) => {
                const typeLabel = typeLabels[q.question_type] || q.question_type || '題目';
                const points = q.points || 0;

                // JSXGraph 優先，SVG 其次
                let diagramHtml = '';
                if (q.question_jsxgraph) {
                    const cid = `jsxg-exam-q${i}`;
                    diagramHtml = `<div id="${cid}" class="question-svg-container" style="width:300px;height:250px"></div>`;
                    pendingJsx.push({ id: cid, config: q.question_jsxgraph });
                } else if (q.question_svg) {
                    diagramHtml = `<div class="question-svg-container">${q.question_svg}</div>`;
                }

                const questionHtml = UI.renderMath(q.question || '');
                const answerHtml = UI.renderMath(q.correct_answer || '');
                const markingHtml = q.marking_scheme
                    ? `<div class="marking-scheme"><strong>評分準則：</strong>${UI.renderMath(q.marking_scheme)}</div>`
                    : '';

                // Options for MC
                let optionsHtml = '';
                if (q.options && Array.isArray(q.options) && q.options.length) {
                    optionsHtml = '<div class="mc-options" style="margin-top:8px;">';
                    q.options.forEach((opt, j) => {
                        const letter = String.fromCharCode(65 + j);
                        optionsHtml += `<div style="margin:4px 0;font-size:14px;">${letter}. ${UI.renderMath(opt)}</div>`;
                    });
                    optionsHtml += '</div>';
                }

                html += `
                <div class="question-card" id="qcard-${i}">
                    <div class="question-card-header">
                        <div class="question-meta">
                            <span class="question-number">Q${q.index || i + 1}</span>
                            <span class="question-points-badge">${points} 分</span>
                            <span class="question-type-badge">${typeLabel}</span>
                        </div>
                        <div class="question-card-actions">
                            <button class="card-action-btn" title="編輯" onclick="ExamCreator.openEditModal(${i})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                            <button class="card-action-btn" title="重新生成" onclick="ExamCreator.regenerate(${i})">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="question-card-body">
                        <div class="question-text">${questionHtml}</div>
                        ${diagramHtml}
                        ${optionsHtml}
                    </div>
                    <button class="answer-toggle" onclick="this.nextElementSibling.classList.toggle('show')">
                        顯示/隱藏答案
                    </button>
                    <div class="answer-content">
                        <div>${answerHtml}</div>
                        ${markingHtml}
                    </div>
                </div>`;
            });

            container.innerHTML = html;

            // JSXGraph 渲染（DOM 已就緒）
            pendingJsx.forEach(r => {
                if (window.JSXGraphRenderer) {
                    try { JSXGraphRenderer.render(r.id, r.config); }
                    catch (e) { console.warn('JSXGraph render failed:', r.id, e); }
                }
            });
        },

        showState(stateName) {
            ['emptyState', 'generatingState', 'errorState', 'questionsContainer'].forEach(id => UI.hide(id));
            UI.show(stateName);
        },
    };

    // ================================================================
    // App — 初始化 + 事件綁定
    // ================================================================

    function init() {
        // Auth check
        state.token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        state.username = localStorage.getItem('username') || '';
        if (!state.token) {
            window.location.href = '/login';
            return;
        }

        const badge = UI.$('userBadge');
        if (badge) badge.textContent = state.username;

        // Difficulty buttons
        document.querySelectorAll('.diff-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.difficulty = parseInt(btn.dataset.diff);
            });
        });

        // Question count slider
        const slider = UI.$('questionCount');
        const sliderVal = UI.$('questionCountVal');
        if (slider) {
            slider.addEventListener('input', () => {
                sliderVal.textContent = slider.value;
            });
        }

        // Subject change → reload knowledge points
        const subjectSelect = UI.$('subjectSelect');
        if (subjectSelect) {
            subjectSelect.addEventListener('change', () => loadKnowledgePoints(subjectSelect.value));
        }

        // Load initial knowledge points
        loadKnowledgePoints('math');
    }

    async function loadKnowledgePoints(subject) {
        UI.$('pointsList').innerHTML = '<div class="loading-text">載入知識點...</div>';
        try {
            const resp = await API.getKnowledgePoints(subject);
            if (resp.success && resp.data) {
                state.knowledgePoints = resp.data;
                Views.renderKnowledgePoints(resp.data);
            } else {
                UI.$('pointsList').innerHTML = '<div class="loading-text">載入失敗</div>';
            }
        } catch (e) {
            console.error('Failed to load knowledge points:', e);
            UI.$('pointsList').innerHTML = '<div class="loading-text">載入失敗</div>';
        }
    }

    // ================================================================
    // Actions
    // ================================================================

    async function generate() {
        const subject = UI.$('subjectSelect').value;
        const questionCount = parseInt(UI.$('questionCount').value);
        const totalMarks = UI.$('totalMarks').value ? parseInt(UI.$('totalMarks').value) : null;
        const examContext = UI.$('examContext').value.trim();

        // Collect selected points
        const selectedPoints = [];
        document.querySelectorAll('#pointsList input[type="checkbox"]:checked').forEach(cb => {
            selectedPoints.push(cb.value);
        });

        // Collect question types
        const questionTypes = [];
        document.querySelectorAll('.checkbox-group input[type="checkbox"]:checked').forEach(cb => {
            questionTypes.push(cb.value);
        });

        // Disable button
        const btn = UI.$('generateBtn');
        btn.disabled = true;
        btn.textContent = '正在提交...';

        try {
            const resp = await API.generate({
                subject,
                question_count: questionCount,
                difficulty: state.difficulty,
                target_points: selectedPoints.length ? selectedPoints : null,
                question_types: questionTypes.length ? questionTypes : null,
                exam_context: examContext,
                total_marks: totalMarks,
            });

            if (resp.success && resp.data) {
                state.sessionId = resp.data.session_id;
                UI.$('genCount').textContent = questionCount;
                Views.showState('generatingState');
                startPolling();
            } else {
                alert('啟動失敗：' + (resp.message || '未知錯誤'));
            }
        } catch (e) {
            console.error('Generate failed:', e);
            alert('請求失敗，請檢查網路連線');
        } finally {
            btn.disabled = false;
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                AI 生成試卷`;
        }
    }

    function startPolling() {
        let interval = 2000;
        let attempts = 0;

        function poll() {
            attempts++;
            API.getStatus(state.sessionId).then(resp => {
                if (!resp.success || !resp.data) {
                    if (attempts < 60) {
                        state.pollTimer = setTimeout(poll, interval);
                    }
                    return;
                }

                const data = resp.data;
                if (data.status === 'generated') {
                    state.questions = data.questions || [];
                    Views.showState('questionsContainer');
                    Views.renderQuestions(state.questions);
                    UI.$('totalMarksBadge').textContent = `總分 ${data.total_marks || 0} 分`;
                } else if (data.status === 'generation_failed') {
                    UI.$('errorMessage').textContent = data.error_message || '生成過程出錯';
                    Views.showState('errorState');
                } else {
                    // Still generating — backoff
                    if (attempts > 5) interval = 5000;
                    if (attempts > 15) interval = 10000;
                    state.pollTimer = setTimeout(poll, interval);
                }
            }).catch(e => {
                console.error('Poll error:', e);
                if (attempts < 60) {
                    state.pollTimer = setTimeout(poll, interval);
                }
            });
        }

        poll();
    }

    function stopPolling() {
        if (state.pollTimer) {
            clearTimeout(state.pollTimer);
            state.pollTimer = null;
        }
    }

    function retry() {
        stopPolling();
        // 清理 JSXGraph boards
        if (window.JSXGraphRenderer) JSXGraphRenderer.destroyAll();
        Views.showState('emptyState');
    }

    // ---- Edit Modal ----

    function openEditModal(index) {
        const q = state.questions[index];
        if (!q) return;
        state.editingIndex = index;

        UI.$('editQuestion').value = q.question || '';
        UI.$('editAnswer').value = q.correct_answer || '';
        UI.$('editMarking').value = q.marking_scheme || '';
        UI.$('editPoints').value = q.points || 0;
        UI.$('editType').value = q.question_type || 'short_answer';

        UI.show('editModal');
    }

    function closeEditModal() {
        UI.hide('editModal');
        state.editingIndex = -1;
    }

    async function saveEdit() {
        const i = state.editingIndex;
        if (i < 0) return;

        const edits = {
            question: UI.$('editQuestion').value,
            correct_answer: UI.$('editAnswer').value,
            marking_scheme: UI.$('editMarking').value,
            points: parseInt(UI.$('editPoints').value) || 0,
            question_type: UI.$('editType').value,
        };

        try {
            const resp = await API.updateQuestion(state.sessionId, i, edits);
            if (resp.success) {
                // Update local state
                Object.assign(state.questions[i], edits);
                Views.renderQuestions(state.questions);
                const totalMarks = state.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                UI.$('totalMarksBadge').textContent = `總分 ${totalMarks} 分`;
                closeEditModal();
            } else {
                alert('保存失敗：' + (resp.message || ''));
            }
        } catch (e) {
            console.error('Save edit failed:', e);
            alert('保存失敗');
        }
    }

    // ---- Regenerate Single ----

    async function regenerate(index) {
        const card = document.getElementById(`qcard-${index}`);
        if (card) card.classList.add('regenerating');

        try {
            const resp = await API.regenerateQuestion(state.sessionId, index, '');
            if (resp.success && resp.data) {
                state.questions[index] = resp.data;
                Views.renderQuestions(state.questions);
                const totalMarks = state.questions.reduce((sum, q) => sum + (q.points || 0), 0);
                UI.$('totalMarksBadge').textContent = `總分 ${totalMarks} 分`;
            } else {
                alert('重新生成失敗：' + (resp.message || ''));
                if (card) card.classList.remove('regenerating');
            }
        } catch (e) {
            console.error('Regenerate failed:', e);
            alert('重新生成失敗');
            if (card) card.classList.remove('regenerating');
        }
    }

    // ---- Print ----

    function printExam() {
        window.print();
    }

    // ================================================================
    // Bootstrap
    // ================================================================
    document.addEventListener('DOMContentLoaded', init);

    // Public API
    return {
        generate,
        retry,
        openEditModal,
        closeEditModal,
        saveEdit,
        regenerate,
        printExam,
    };
})();
