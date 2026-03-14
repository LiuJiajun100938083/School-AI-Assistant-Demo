/**
 * 课堂即时运行 — 幻灯片渲染器 Registry
 * ============================================
 * 全局挂载: window.LessonSlideRenderers
 *
 * 与编辑器的 SLIDE_TYPE_HANDLERS 对称。
 * 每种 slide type 注册 renderer，由 teacher/student JS 路由调用。
 * 共享 UI（排名表）封装在此模块内，不重复。
 */
'use strict';

window.LessonSlideRenderers = {
    _registry: {},

    register(type, renderer) { this._registry[type] = renderer; },
    get(type) { return this._registry[type] || null; },

    // ===== 共享 UI: 完整排名表 =====
    renderRankings(container, leaderboard, myUsername) {
        if (!leaderboard || leaderboard.length === 0) {
            container.innerHTML = '<div class="quiz-rankings"><p style="text-align:center;color:#6E6E73;">暂无排名数据</p></div>';
            return;
        }
        let html = '<div class="quiz-rankings">';
        html += '<div class="quiz-rankings-title">测验结果</div>';
        html += '<div class="quiz-rankings-list">';
        leaderboard.forEach(entry => {
            const isMe = entry.username === myUsername;
            const topClass = entry.rank <= 3 ? ` top-${entry.rank}` : '';
            const meClass = isMe ? ' is-me' : '';
            html += `<div class="quiz-rank-row${topClass}${meClass}">
                <span class="quiz-rank-num">${entry.rank}</span>
                <span class="quiz-rank-name">${Utils.escapeHtml(entry.username)}${isMe ? ' (你)' : ''}</span>
                <span class="quiz-rank-score">${entry.score} 分</span>
                ${entry.correct_count != null ? `<span class="quiz-rank-detail">${entry.correct_count}/${entry.total_questions} 题</span>` : ''}
            </div>`;
        });
        html += '</div></div>';
        container.innerHTML = html;
    },
};


// ===== Quiz Renderer =====
LessonSlideRenderers.register('quiz', {

    // ── 内部状态 ──
    _state: {
        answered: false,       // 当前题是否已选答
        selectedAnswer: null,  // 当前选中的答案
        timerInterval: null,
        timeRemaining: 0,
        onAnswerCallback: null,
        slideData: null,
    },

    reset() {
        this._state = {
            answered: false,
            selectedAnswer: null,
            timerInterval: null,
            timeRemaining: 0,
            onAnswerCallback: null,
            slideData: null,
        };
    },

    // ── 老师端渲染 ──
    renderTeacher(container, slide, cfg, quizState) {
        const qs = cfg.questions || [];
        const phase = quizState?.phase || 'answering';
        const qIndex = quizState?.current_question_index || 0;
        const answerCounts = quizState?.answer_counts || {};
        const revealData = quizState?._reveal_data || {};
        const optionCounts = revealData.option_counts || {};
        const currentQ = qs[qIndex];

        if (!currentQ) {
            container.innerHTML = '<div style="text-align:center;padding:40px;"><h3>测验</h3></div>';
            return;
        }

        const qId = currentQ.id || `q${qIndex}`;
        const answered = answerCounts[qId] || 0;

        let html = '<div class="quiz-teacher-view">';
        html += `<div class="quiz-teacher-header">
            <span class="quiz-progress">第 ${qIndex + 1} 题 / 共 ${qs.length} 题</span>
            <span class="quiz-teacher-phase">${phase === 'answering' ? '答题中' : '已揭示'}</span>
        </div>`;

        html += `<div class="quiz-teacher-question">
            <div class="quiz-q-text">${Utils.escapeHtml(currentQ.text)}</div>
        </div>`;

        if (phase === 'answering') {
            html += `<div class="quiz-teacher-status">${answered} 人已作答</div>`;
        } else {
            // reveal phase — show correct answer + per-option counts
            html += '<div class="quiz-teacher-stats">';
            if (currentQ.options) {
                currentQ.options.forEach((opt, i) => {
                    const val = String.fromCharCode(65 + i);
                    const isCorrect = val === currentQ.correct_answer;
                    const count = optionCounts[val] || 0;
                    html += `<div class="quiz-teacher-stat-row ${isCorrect ? 'correct' : ''}">
                        <span>${val}. ${Utils.escapeHtml(opt)}</span>
                        <span style="margin-left:auto;display:flex;align-items:center;gap:8px;">
                            <span class="quiz-opt-count">${count} 人</span>
                            ${isCorrect ? '<span class="quiz-correct-badge">正确</span>' : ''}
                        </span>
                    </div>`;
                });
            }
            html += `<div class="quiz-teacher-status" style="margin-top:8px;">共 ${revealData.total_answered || answered} 人作答</div>`;
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;
    },

    // ── 学生端：渲染当前题目 ──
    renderStudentQuestion(container, question, index, total, state) {
        this._state.answered = false;
        this._state.selectedAnswer = null;
        this._state.onAnswerCallback = state.onAnswer;

        let html = '<div class="quiz-student">';

        // Header: progress + timer
        html += `<div class="quiz-header">
            <span class="quiz-progress">第 ${index + 1} 题 / 共 ${total} 题</span>
            ${state.timeLimit ? `<span class="quiz-timer" id="quizTimer">${state.timeLimit}</span>` : ''}
        </div>`;

        // Question area
        html += '<div class="quiz-question-area">';
        if (question.image_url) {
            html += `<img class="quiz-q-img" src="${Utils.escapeHtml(question.image_url)}" alt="题目图片">`;
        }
        html += `<div class="quiz-q-text">${Utils.escapeHtml(question.text)}</div>`;
        html += '</div>';

        // Options — only shown when accepting responses
        const accepting = state.accepting !== false;
        if (accepting) {
            html += '<div class="quiz-options">';
            if (question.type === 'mc' && question.options) {
                question.options.forEach((opt, i) => {
                    const val = String.fromCharCode(65 + i);
                    html += `<div class="quiz-opt" data-val="${val}" data-qid="${question.id}">
                        <span class="quiz-opt-label">${val}.</span>
                        <span>${Utils.escapeHtml(opt)}</span>
                    </div>`;
                });
            } else if (question.type === 'tf') {
                ['对', '错'].forEach(opt => {
                    html += `<div class="quiz-opt" data-val="${opt}" data-qid="${question.id}">
                        <span>${opt}</span>
                    </div>`;
                });
            } else if (question.type === 'fill') {
                html += `<input type="text" class="quiz-fill-input" id="quizFillInput" placeholder="输入答案..." data-qid="${question.id}">`;
                html += `<button class="quiz-fill-confirm" id="quizFillConfirm">确认</button>`;
            }
            html += '</div>';

            // Waiting text (hidden initially)
            html += '<div class="quiz-waiting-text" id="quizWaiting" style="display:none;">已提交，等待其他同学...</div>';
        } else {
            // Not accepting: show waiting prompt, no options
            html += '<div class="quiz-waiting-text" style="margin-top:24px;">等待老師開放回應...</div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Bind click events only when accepting
        if (accepting) {
            this._bindOptionEvents(container, question);

            // Start timer if applicable
            if (state.timeLimit && state.timeLimit > 0) {
                this._startTimer(state.timeLimit, question, container);
            }
        }
    },

    _bindOptionEvents(container, question) {
        const self = this;

        if (question.type === 'fill') {
            const confirmBtn = container.querySelector('#quizFillConfirm');
            const input = container.querySelector('#quizFillInput');
            if (confirmBtn && input) {
                confirmBtn.addEventListener('click', () => {
                    if (self._state.answered) return;
                    const val = input.value.trim();
                    if (!val) return;
                    self._submitAnswer(container, question.id, val);
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') confirmBtn.click();
                });
            }
            return;
        }

        // mc / tf options
        container.querySelectorAll('.quiz-opt').forEach(opt => {
            opt.addEventListener('click', () => {
                if (self._state.answered) return;
                const val = opt.dataset.val;
                self._submitAnswer(container, question.id, val);
            });
        });
    },

    _submitAnswer(container, questionId, answer) {
        this._state.answered = true;
        this._state.selectedAnswer = answer;

        // Visual feedback
        container.querySelectorAll('.quiz-opt').forEach(opt => {
            if (opt.dataset.val === answer) {
                opt.classList.add('selected');
            } else {
                opt.classList.add('disabled');
            }
        });

        // Hide fill input area
        const fillInput = container.querySelector('#quizFillInput');
        const fillConfirm = container.querySelector('#quizFillConfirm');
        if (fillInput) fillInput.disabled = true;
        if (fillConfirm) fillConfirm.disabled = true;

        // Show waiting text
        const waiting = container.querySelector('#quizWaiting');
        if (waiting) waiting.style.display = '';

        // Send via callback
        if (this._state.onAnswerCallback) {
            this._state.onAnswerCallback(questionId, answer);
        }
    },

    _startTimer(seconds, question, container) {
        this._state.timeRemaining = seconds;
        const timerEl = container.querySelector('#quizTimer');
        if (!timerEl) return;

        if (this._state.timerInterval) clearInterval(this._state.timerInterval);

        this._state.timerInterval = setInterval(() => {
            this._state.timeRemaining--;
            if (timerEl) timerEl.textContent = this._state.timeRemaining;

            if (this._state.timeRemaining <= 0) {
                clearInterval(this._state.timerInterval);
                // Auto-submit empty if not answered
                if (!this._state.answered) {
                    this._submitAnswer(container, question.id, '');
                }
            }
        }, 1000);
    },

    stopTimer() {
        if (this._state.timerInterval) {
            clearInterval(this._state.timerInterval);
            this._state.timerInterval = null;
        }
    },

    // ── 学生端：揭示答案 ──
    renderStudentReveal(container, question, revealData, myAnswer) {
        this.stopTimer();
        const correctAnswer = revealData.correct_answer;
        const optionCounts = revealData.option_counts || {};
        const totalAnswered = revealData.total_answered || 0;
        const qIndex = revealData.question_index != null ? revealData.question_index : 0;

        let html = '<div class="quiz-student">';
        html += `<div class="quiz-header">
            <span class="quiz-progress">第 ${qIndex + 1} 题 — 答案揭示</span>
        </div>`;

        html += '<div class="quiz-question-area">';
        if (question.image_url) {
            html += `<img class="quiz-q-img" src="${Utils.escapeHtml(question.image_url)}" alt="题目图片">`;
        }
        html += `<div class="quiz-q-text">${Utils.escapeHtml(question.text)}</div>`;
        html += '</div>';

        html += '<div class="quiz-options">';
        if (question.type === 'mc' && question.options) {
            question.options.forEach((opt, i) => {
                const val = String.fromCharCode(65 + i);
                const isCorrect = val === correctAnswer;
                const isMyAnswer = val === myAnswer;
                const count = optionCounts[val] || 0;

                let cls = 'quiz-opt reveal';
                if (isCorrect) cls += ' correct';
                else if (isMyAnswer && !isCorrect) cls += ' wrong';

                html += `<div class="${cls}">
                    <span class="quiz-opt-label">${val}.</span>
                    <span>${Utils.escapeHtml(opt)}</span>
                    ${isCorrect ? '<span class="quiz-correct-mark">&#10003;</span>' : ''}
                    ${isMyAnswer && !isCorrect ? '<span class="quiz-wrong-mark">&#10007;</span>' : ''}
                    <span class="quiz-opt-count">${count} 人</span>
                </div>`;
            });
        } else if (question.type === 'tf') {
            ['对', '错'].forEach(opt => {
                const isCorrect = opt === correctAnswer;
                const isMyAnswer = opt === myAnswer;
                const count = optionCounts[opt] || 0;

                let cls = 'quiz-opt reveal';
                if (isCorrect) cls += ' correct';
                else if (isMyAnswer && !isCorrect) cls += ' wrong';

                html += `<div class="${cls}">
                    <span>${opt}</span>
                    ${isCorrect ? '<span class="quiz-correct-mark">&#10003;</span>' : ''}
                    ${isMyAnswer && !isCorrect ? '<span class="quiz-wrong-mark">&#10007;</span>' : ''}
                    <span class="quiz-opt-count">${count} 人</span>
                </div>`;
            });
        } else if (question.type === 'fill') {
            const isCorrect = myAnswer && myAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
            html += `<div class="quiz-fill-reveal">
                <div class="quiz-fill-correct">正确答案: ${Utils.escapeHtml(correctAnswer)}</div>
                ${myAnswer ? `<div class="quiz-fill-my ${isCorrect ? 'correct' : 'wrong'}">你的答案: ${Utils.escapeHtml(myAnswer)} ${isCorrect ? '&#10003;' : '&#10007;'}</div>` : '<div class="quiz-fill-my wrong">未作答</div>'}
            </div>`;
        }
        html += '</div>';

        html += '<div class="quiz-waiting-text">等待老师继续...</div>';
        html += '</div>';
        container.innerHTML = html;
    },

    // ── 学生端：等待中 ──
    renderStudentWaiting(container, message) {
        container.innerHTML = `<div class="quiz-student">
            <div class="quiz-question-area">
                <div class="quiz-waiting-text">${message || '等待老师操作...'}</div>
            </div>
        </div>`;
    },

    // ── 结果：完整排名 (委托共享 renderRankings) ──
    renderResults(container, results, myUsername) {
        const lb = results?.results?.leaderboard || results?.leaderboard || [];
        LessonSlideRenderers.renderRankings(container, lb, myUsername);
    },
});
