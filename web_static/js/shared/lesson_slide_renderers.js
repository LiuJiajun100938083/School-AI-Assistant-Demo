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
            container.innerHTML = '<div class="quiz-tv"><div class="quiz-tv-empty">測驗無題目</div></div>';
            return;
        }

        const qId = currentQ.id || `q${qIndex}`;
        const answered = answerCounts[qId] || 0;
        const isRevealed = phase === 'reveal';
        const optLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
        const optColors = ['#E74C3C', '#3498DB', '#F39C12', '#2ECC71', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];
        // Total for percentage calculation
        const totalAns = isRevealed
            ? Object.values(optionCounts).reduce((s, v) => s + v, 0) || 1
            : 1;

        let html = '<div class="quiz-tv">';

        // ── Header: progress + phase badge
        html += `<div class="quiz-tv-header">
            <span class="quiz-tv-progress">第 ${qIndex + 1} 題 / 共 ${qs.length} 題</span>
            <span class="quiz-tv-phase ${isRevealed ? 'revealed' : 'live'}">
                ${isRevealed ? '答案揭示' : '答題中'}
                ${isRevealed ? '' : '<span class="quiz-tv-pulse"></span>'}
            </span>
        </div>`;

        // ── Question area
        html += '<div class="quiz-tv-question">';
        if (currentQ.image_url) {
            html += `<img class="quiz-tv-q-img" src="${Utils.escapeHtml(currentQ.image_url)}" alt="">`;
        }
        html += `<div class="quiz-tv-q-text">${Utils.escapeHtml(currentQ.text)}</div>`;
        html += '</div>';

        // ── Options area
        if (currentQ.type === 'mc' && currentQ.options) {
            html += '<div class="quiz-tv-options">';
            currentQ.options.forEach((opt, i) => {
                const val = optLabels[i] || String.fromCharCode(65 + i);
                const color = optColors[i % optColors.length];
                // Compare by option text (normalized format)
                const isCorrect = opt.trim().toLowerCase() === String(currentQ.correct_answer).trim().toLowerCase();
                const count = optionCounts[opt] || 0;
                const pct = isRevealed ? Math.round((count / totalAns) * 100) : 0;

                let cls = 'quiz-tv-opt';
                if (isRevealed) cls += isCorrect ? ' correct' : ' dimmed';

                html += `<div class="${cls}">
                    <span class="quiz-tv-opt-label" style="background:${color}">${val}</span>
                    <span class="quiz-tv-opt-text">${Utils.escapeHtml(opt)}</span>
                    ${isRevealed ? `
                        <div class="quiz-tv-bar-wrap">
                            <div class="quiz-tv-bar" style="width:${pct}%;background:${isCorrect ? '#34C759' : '#D1D1D6'}"></div>
                        </div>
                        <span class="quiz-tv-opt-stat">${count}人 (${pct}%)</span>
                        ${isCorrect ? '<span class="quiz-tv-check">&#10003;</span>' : ''}
                    ` : ''}
                </div>`;
            });
            html += '</div>';
        } else if (currentQ.type === 'tf') {
            html += '<div class="quiz-tv-options">';
            ['对', '错'].forEach((label, i) => {
                const color = i === 0 ? '#3498DB' : '#E74C3C';
                const tfVal = label === '对' ? 'true' : 'false';
                const isCorrect = tfVal === String(currentQ.correct_answer).trim().toLowerCase();
                const count = optionCounts[tfVal] || 0;
                const pct = isRevealed ? Math.round((count / totalAns) * 100) : 0;
                let cls = 'quiz-tv-opt';
                if (isRevealed) cls += isCorrect ? ' correct' : ' dimmed';
                html += `<div class="${cls}">
                    <span class="quiz-tv-opt-label" style="background:${color}">${label}</span>
                    <span class="quiz-tv-opt-text">${label === '对' ? '正確' : '錯誤'}</span>
                    ${isRevealed ? `
                        <div class="quiz-tv-bar-wrap">
                            <div class="quiz-tv-bar" style="width:${pct}%;background:${isCorrect ? '#34C759' : '#D1D1D6'}"></div>
                        </div>
                        <span class="quiz-tv-opt-stat">${count}人 (${pct}%)</span>
                        ${isCorrect ? '<span class="quiz-tv-check">&#10003;</span>' : ''}
                    ` : ''}
                </div>`;
            });
            html += '</div>';
        } else if (currentQ.type === 'fill') {
            // Fill-in: just show correct answer on reveal
            if (isRevealed) {
                html += `<div class="quiz-tv-fill-reveal">
                    <span class="quiz-tv-fill-label">正確答案</span>
                    <span class="quiz-tv-fill-answer">${Utils.escapeHtml(currentQ.correct_answer)}</span>
                </div>`;
            }
        }

        // ── Counter
        html += `<div class="quiz-tv-counter">
            <span class="quiz-tv-counter-num">${answered}</span>
            <span class="quiz-tv-counter-label">人${isRevealed ? '作答' : '已作答'}</span>
        </div>`;

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
                    self._submitAnswer(container, question, val);
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
                self._submitAnswer(container, question, val);
            });
        });
    },

    _submitAnswer(container, question, answer) {
        this._state.answered = true;
        this._state.selectedAnswer = answer;

        // Visual feedback (uses raw answer for DOM matching)
        container.querySelectorAll('.quiz-opt').forEach(opt => {
            if (opt.dataset.val === answer) {
                opt.classList.add('selected');
            } else {
                opt.classList.add('disabled');
            }
        });

        // Disable fill input area
        const fillInput = container.querySelector('#quizFillInput');
        const fillConfirm = container.querySelector('#quizFillConfirm');
        if (fillInput) fillInput.disabled = true;
        if (fillConfirm) fillConfirm.disabled = true;

        // Show waiting text
        const waiting = container.querySelector('#quizWaiting');
        if (waiting) waiting.style.display = '';

        // Normalize answer to match backend correct_answer format:
        //   MC:  letter "A" → option text (e.g. "香蕉")
        //   TF:  "对"/"错"  → "true"/"false"
        //   fill: kept as-is
        let normalized = answer;
        const questionId = question.id;
        if (question.type === 'mc' && question.options) {
            const idx = answer.charCodeAt(0) - 65;
            if (idx >= 0 && idx < question.options.length) {
                normalized = question.options[idx];
            }
        } else if (question.type === 'tf') {
            normalized = (answer === '对') ? 'true' : 'false';
        }

        // Send normalized answer via callback
        if (this._state.onAnswerCallback) {
            this._state.onAnswerCallback(questionId, normalized);
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
                    this._submitAnswer(container, question, '');
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
                // Compare by option text (normalized format)
                const isCorrect = opt.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                const isMyAnswer = myAnswer && opt.trim().toLowerCase() === myAnswer.trim().toLowerCase();
                const count = optionCounts[opt] || 0;

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
            ['对', '错'].forEach((label, i) => {
                const tfVal = label === '对' ? 'true' : 'false';
                const isCorrect = tfVal === correctAnswer;
                const isMyAnswer = myAnswer && tfVal === myAnswer;
                const count = optionCounts[tfVal] || 0;

                let cls = 'quiz-opt reveal';
                if (isCorrect) cls += ' correct';
                else if (isMyAnswer && !isCorrect) cls += ' wrong';

                html += `<div class="${cls}">
                    <span>${label}</span>
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


/* ================================================================
   Poll (投票) 渲染器
   ================================================================ */

LessonSlideRenderers.register('poll', {

    // ── 学生端：投票界面 ──
    renderStudent(container, slideData, opts) {
        const options = slideData.options || [];
        const allowMultiple = slideData.allow_multiple || false;
        const onVote = opts?.onVote;
        const accepting = opts?.accepting !== false;

        let html = '<div class="quiz-student">';

        // Question
        html += '<div class="quiz-question-area">';
        html += `<div class="quiz-q-text">${Utils.escapeHtml(slideData.question_text || slideData.title || '投票')}</div>`;
        html += '</div>';

        if (accepting) {
            html += `<div class="quiz-options" id="pollOptions">`;
            options.forEach((opt, i) => {
                html += `<div class="quiz-opt" data-idx="${i}">
                    <span class="quiz-opt-label">${i + 1}.</span>
                    <span>${Utils.escapeHtml(opt)}</span>
                </div>`;
            });
            html += '</div>';

            if (allowMultiple) {
                html += `<button class="quiz-fill-confirm" id="pollSubmitBtn" style="margin-top:8px;">提交投票</button>`;
            }

            html += '<div class="quiz-waiting-text" id="pollWaiting" style="display:none;">已投票，等待結果...</div>';
        } else {
            html += '<div class="quiz-waiting-text" style="margin-top:24px;">等待老師開放投票...</div>';
        }

        html += '</div>';
        container.innerHTML = html;

        if (!accepting) return;

        // Bind events
        const selected = new Set();
        let submitted = false;

        container.querySelectorAll('.quiz-opt').forEach(optEl => {
            optEl.addEventListener('click', () => {
                if (submitted) return;
                const idx = parseInt(optEl.dataset.idx);

                if (allowMultiple) {
                    // Toggle selection
                    if (selected.has(idx)) {
                        selected.delete(idx);
                        optEl.classList.remove('selected');
                    } else {
                        selected.add(idx);
                        optEl.classList.add('selected');
                    }
                } else {
                    // Single select → submit immediately
                    submitted = true;
                    optEl.classList.add('selected');
                    container.querySelectorAll('.quiz-opt').forEach(o => {
                        if (o !== optEl) o.classList.add('disabled');
                    });
                    const waiting = container.querySelector('#pollWaiting');
                    if (waiting) waiting.style.display = '';
                    if (onVote) onVote([idx]);
                }
            });
        });

        // Multi-select submit button
        if (allowMultiple) {
            const submitBtn = container.querySelector('#pollSubmitBtn');
            if (submitBtn) {
                submitBtn.addEventListener('click', () => {
                    if (submitted || selected.size === 0) return;
                    submitted = true;
                    submitBtn.disabled = true;
                    container.querySelectorAll('.quiz-opt').forEach(o => {
                        if (!selected.has(parseInt(o.dataset.idx))) {
                            o.classList.add('disabled');
                        }
                    });
                    const waiting = container.querySelector('#pollWaiting');
                    if (waiting) waiting.style.display = '';
                    if (onVote) onVote([...selected]);
                });
            }
        }
    },

    // ── 学生端：投票结果 ──
    renderResults(container, slideData, results) {
        const options = slideData.options || [];
        const voteCounts = results?.vote_counts || {};
        const totalVotes = Object.values(voteCounts).reduce((s, v) => s + v, 0) || 1;

        let html = '<div class="quiz-student">';
        html += '<div class="quiz-question-area">';
        html += `<div class="quiz-q-text">${Utils.escapeHtml(slideData.question_text || '投票結果')}</div>`;
        html += '</div>';

        html += '<div class="quiz-options">';
        options.forEach((opt, i) => {
            const count = voteCounts[String(i)] || 0;
            const pct = Math.round((count / totalVotes) * 100);

            html += `<div class="quiz-opt reveal">
                <span class="quiz-opt-label">${i + 1}.</span>
                <span>${Utils.escapeHtml(opt)}</span>
                <span class="quiz-opt-count">${count} 票 (${pct}%)</span>
            </div>`;
        });
        html += '</div>';

        html += `<div class="quiz-waiting-text">共 ${Object.values(voteCounts).reduce((s, v) => s + v, 0)} 人投票</div>`;
        html += '</div>';
        container.innerHTML = html;
    },

    // ── 教师端：投票统计 ──
    renderTeacher(container, slide) {
        const options = slide.options || [];
        const results = slide.results || {};
        const voteCounts = results.vote_counts || {};
        const totalResponses = results.total_responses || 0;
        const totalVotes = Object.values(voteCounts).reduce((s, v) => s + v, 0) || 1;

        const optColors = ['#E74C3C', '#3498DB', '#F39C12', '#2ECC71', '#9B59B6', '#1ABC9C', '#E67E22', '#34495E'];

        let html = '<div class="quiz-tv">';

        html += `<div class="quiz-tv-header">
            <span class="quiz-tv-progress">投票</span>
            <span class="quiz-tv-phase live">
                ${totalResponses > 0 ? '投票中' : '等待投票'}
                <span class="quiz-tv-pulse"></span>
            </span>
        </div>`;

        html += '<div class="quiz-tv-question">';
        html += `<div class="quiz-tv-q-text">${Utils.escapeHtml(slide.question_text || '')}</div>`;
        html += '</div>';

        html += '<div class="quiz-tv-options">';
        options.forEach((opt, i) => {
            const color = optColors[i % optColors.length];
            const count = voteCounts[String(i)] || 0;
            const pct = Math.round((count / totalVotes) * 100);

            html += `<div class="quiz-tv-opt">
                <span class="quiz-tv-opt-label" style="background:${color}">${i + 1}</span>
                <span class="quiz-tv-opt-text">${Utils.escapeHtml(opt)}</span>
                <div class="quiz-tv-bar-wrap">
                    <div class="quiz-tv-bar" style="width:${pct}%;background:${color}"></div>
                </div>
                <span class="quiz-tv-opt-stat">${count}票 (${pct}%)</span>
            </div>`;
        });
        html += '</div>';

        html += `<div class="quiz-tv-counter">
            <span class="quiz-tv-counter-num">${totalResponses}</span>
            <span class="quiz-tv-counter-label">人已投票</span>
        </div>`;

        html += '</div>';
        container.innerHTML = html;
    },
});
