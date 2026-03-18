/**
 * 課案「模擬上課」預覽模組
 * ============================================
 * 職責: 全屏左右分屏預覽 — 學生端 vs 教師端
 *
 * 依賴:
 *   window.LessonSlideRenderers  (lesson_slide_renderers.js)
 *   window.Utils.escapeHtml      (shared/ui.js 或同級)
 *
 * 公開 API:
 *   window.LessonPreview = { open(slides), close() }
 */
'use strict';

(function () {

    // ── 常量 ──────────────────────────────────────────────
    const OVERLAY_ID = 'lessonPreviewOverlay';

    const TYPE_LABELS = {
        ppt: 'PPT', quiz: '測驗', poll: '投票',
        interactive: '互動活動', game: '遊戲', link: '連結',
    };

    // Mock 數據 — 教師端需要模擬學生回答
    const MOCK_QUIZ_STATE = {
        phase: 'answering',
        current_question_index: 0,
        answer_counts: {},
        _reveal_data: {},
    };

    const MOCK_STUDENTS = [
        { username: 'Student_A', progress: 100 },
        { username: 'Student_B', progress: 75 },
        { username: 'Student_C', progress: 40 },
        { username: 'Student_D', progress: 0 },
    ];

    // ── 模組狀態 ──────────────────────────────────────────
    let _slides = [];
    let _currentIndex = 0;
    let _overlay = null;
    let _studentPane = null;
    let _teacherPane = null;
    let _navLabel = null;
    let _typeLabel = null;
    let _titleLabel = null;

    // ═══════════════════════════════════════════════════════
    // 公開 API
    // ═══════════════════════════════════════════════════════

    function open(slides) {
        if (!slides || slides.length === 0) {
            console.warn('[LessonPreview] No slides to preview');
            return;
        }
        _slides = slides.map(function (s) {
            // 確保 config 是 object（防止 JSON string 殘留）
            if (typeof s.config === 'string') {
                try { s = Object.assign({}, s, { config: JSON.parse(s.config) }); } catch (e) { }
            }
            return s;
        });
        _currentIndex = 0;
        _buildDOM();
        _renderCurrentSlide();
    }

    function close() {
        _resetRenderers();
        if (_overlay) {
            _overlay.style.display = 'none';
            _overlay.innerHTML = '';
        }
        _slides = [];
        _currentIndex = 0;
        _studentPane = null;
        _teacherPane = null;
        _navLabel = null;
        _typeLabel = null;
        _titleLabel = null;
    }

    // ═══════════════════════════════════════════════════════
    // DOM 構建
    // ═══════════════════════════════════════════════════════

    function _buildDOM() {
        _overlay = document.getElementById(OVERLAY_ID);
        if (!_overlay) return;

        _overlay.innerHTML = `
            <div class="lesson-preview-overlay">
                <div class="lesson-preview-toolbar">
                    <button class="lesson-preview-back" id="lpClose">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                        返回編輯
                    </button>
                    <div class="lesson-preview-nav">
                        <button class="lesson-preview-nav-btn" id="lpPrev" title="上一頁">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
                        </button>
                        <span class="lesson-preview-nav-label" id="lpNavLabel">1 / ${_slides.length}</span>
                        <button class="lesson-preview-nav-btn" id="lpNext" title="下一頁">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                        </button>
                    </div>
                    <div class="lesson-preview-meta">
                        <span class="lesson-preview-type-badge" id="lpTypeBadge"></span>
                        <span class="lesson-preview-title" id="lpTitleLabel"></span>
                    </div>
                </div>
                <div class="lesson-preview-split">
                    <div class="lesson-preview-pane">
                        <div class="lesson-preview-pane-header">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            學生端
                        </div>
                        <div class="lesson-preview-pane-body" id="lpStudentPane"></div>
                    </div>
                    <div class="lesson-preview-pane">
                        <div class="lesson-preview-pane-header teacher">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                            教師端
                        </div>
                        <div class="lesson-preview-pane-body" id="lpTeacherPane"></div>
                    </div>
                </div>
            </div>
        `;

        _overlay.style.display = '';

        // 取得 DOM 引用
        _studentPane = document.getElementById('lpStudentPane');
        _teacherPane = document.getElementById('lpTeacherPane');
        _navLabel = document.getElementById('lpNavLabel');
        _typeLabel = document.getElementById('lpTypeBadge');
        _titleLabel = document.getElementById('lpTitleLabel');

        // 綁定事件
        document.getElementById('lpClose').addEventListener('click', close);
        document.getElementById('lpPrev').addEventListener('click', () => _navigate(-1));
        document.getElementById('lpNext').addEventListener('click', () => _navigate(1));

        // 鍵盤快捷鍵
        document.addEventListener('keydown', _onKeyDown);
    }

    // ═══════════════════════════════════════════════════════
    // 導航
    // ═══════════════════════════════════════════════════════

    function _navigate(delta) {
        const newIdx = _currentIndex + delta;
        if (newIdx < 0 || newIdx >= _slides.length) return;
        _currentIndex = newIdx;
        _renderCurrentSlide();
    }

    function _onKeyDown(e) {
        if (!_overlay || _overlay.style.display === 'none') return;
        if (e.key === 'Escape') { close(); return; }
        if (e.key === 'ArrowLeft') _navigate(-1);
        if (e.key === 'ArrowRight') _navigate(1);
    }

    // ═══════════════════════════════════════════════════════
    // 渲染核心
    // ═══════════════════════════════════════════════════════

    function _renderCurrentSlide() {
        if (!_studentPane || !_teacherPane) return;

        const slide = _slides[_currentIndex];
        if (!slide) return;

        // 更新導航 UI
        _navLabel.textContent = `${_currentIndex + 1} / ${_slides.length}`;
        _typeLabel.textContent = TYPE_LABELS[slide.slide_type] || slide.slide_type;
        _titleLabel.textContent = slide.title || '';

        // 清理上一次的 renderer 狀態
        _resetRenderers();

        // 清空容器
        _studentPane.innerHTML = '';
        _teacherPane.innerHTML = '';

        const cfg = slide.config || {};
        const type = slide.slide_type;

        // 分派到對應類型的渲染函數
        const renderFn = _RENDER_MAP[type];
        if (renderFn) {
            renderFn(slide, cfg);
        } else {
            _renderFallback(type);
        }
    }

    // ═══════════════════════════════════════════════════════
    // 各類型渲染 Provider
    // ═══════════════════════════════════════════════════════

    const _RENDER_MAP = {
        ppt: _renderPPT,
        quiz: _renderQuiz,
        poll: _renderPoll,
        interactive: _renderInteractive,
        game: _renderGame,
        link: _renderLink,
    };

    function _renderPPT(slide, cfg) {
        const imgUrl = `/uploads/ppt/${cfg.file_id}/page_${cfg.page_number}.png`;
        const imgHtml = `<img src="${imgUrl}" alt="PPT Page ${cfg.page_number}"
            style="max-width:100%;max-height:100%;object-fit:contain;"
            onerror="this.alt='圖片載入失敗';this.style.opacity=0.3;">`;
        _studentPane.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">${imgHtml}</div>`;
        _teacherPane.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;">${imgHtml}</div>`;
    }

    function _renderQuiz(slide, cfg) {
        const renderer = window.LessonSlideRenderers?.get('quiz');
        if (!renderer) { _renderFallback('quiz'); return; }

        const questions = cfg.questions || [];
        if (questions.length === 0) {
            _studentPane.innerHTML = _emptyCard('無測驗題目');
            _teacherPane.innerHTML = _emptyCard('無測驗題目');
            return;
        }

        const q = questions[0];

        // 學生端: 顯示第一題
        renderer.reset();
        renderer.renderStudentQuestion(_studentPane, q, 0, questions.length, {
            timeLimit: q.time_limit || 0,
            accepting: true,
            onAnswer: function () { /* noop — 預覽不發送 */ },
        });

        // 教師端: TV 視角
        const mockState = {
            phase: 'answering',
            current_question_index: 0,
            answer_counts: {},
            _reveal_data: {},
        };
        // renderTeacher 需要一個新的 renderer 實例或直接調用
        // 因為 quiz renderer 是全域單例，學生端已佔用 _state
        // 所以教師端用 renderTeacher（它不依賴 _state）
        renderer.renderTeacher(_teacherPane, slide, cfg, mockState);
    }

    function _renderPoll(slide, cfg) {
        const renderer = window.LessonSlideRenderers?.get('poll');
        if (!renderer) { _renderFallback('poll'); return; }

        // 構造學生端需要的 slideData 格式
        const slideData = {
            options: cfg.options || [],
            question_text: cfg.question_text || slide.title || '投票',
            allow_multiple: cfg.allow_multiple || false,
        };

        // 學生端
        renderer.renderStudent(_studentPane, slideData, {
            accepting: true,
            onVote: function () { /* noop */ },
        });

        // 教師端 — 帶 mock 空數據
        const teacherSlide = Object.assign({}, slide, {
            results: { vote_counts: {}, total_responses: 0 },
        });
        renderer.renderTeacher(_teacherPane, teacherSlide, cfg);
    }

    function _renderInteractive(slide, cfg) {
        const renderer = window.LessonSlideRenderers?.get('interactive');
        if (!renderer) { _renderFallback('interactive'); return; }

        // 構造學生端需要的 slideData
        const template = cfg.template || 'drag_sort';
        const templateData = cfg[template] || {};

        // 扁平化 config（同 interactive_preview.js 邏輯）
        const flatConfig = { ...templateData };
        if (flatConfig.background_url !== undefined) {
            flatConfig.background_image = flatConfig.background_url;
            delete flatConfig.background_url;
        }
        if (flatConfig.enabled_tools !== undefined) {
            flatConfig.tools = flatConfig.enabled_tools;
            delete flatConfig.enabled_tools;
        }

        const studentSlideData = {
            slide_id: '__preview__',
            slide_type: 'interactive',
            template: template,
            time_limit: cfg.time_limit || 0,
            config: flatConfig,
            locked: false,
        };

        // 學生端
        renderer.renderStudent(_studentPane, studentSlideData, {
            onSubmit: function () { },
            onProgress: function () { },
            locked: false,
        });

        // 教師端
        renderer.renderTeacher(_teacherPane, slide, cfg, { locked: false });

        // 注入 mock 學生進度
        if (renderer.updateStudentProgress) {
            MOCK_STUDENTS.forEach(function (s) {
                try { renderer.updateStudentProgress(s.username, s.progress); } catch (e) { }
            });
        }
    }

    function _renderGame(slide, cfg) {
        const name = cfg.game_name || cfg.name || slide.title || '遊戲';
        const url = cfg.game_url || cfg.url || '';
        const timeLimit = cfg.time_limit || slide.duration_seconds || 0;

        const card = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="6" width="20" height="12" rx="2"/>
                    <line x1="6" y1="12" x2="10" y2="12"/><line x1="8" y1="10" x2="8" y2="14"/>
                    <circle cx="15" cy="11" r="1"/><circle cx="18" cy="13" r="1"/>
                </svg>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${_esc(name)}</div>
                ${url ? '<div style="font-size:12px;word-break:break-all;">' + _esc(url) + '</div>' : ''}
                ${timeLimit > 0 ? '<div style="font-size:12px;">時限: ' + timeLimit + ' 秒</div>' : ''}
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;">預覽模式不載入遊戲</div>
            </div>
        `;

        _studentPane.innerHTML = card;
        _teacherPane.innerHTML = card;
    }

    function _renderLink(slide, cfg) {
        const url = cfg.url || '';
        const desc = cfg.description || slide.title || '';

        const card = `
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:var(--text-secondary);">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                    <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
                <div style="font-size:16px;font-weight:600;color:var(--text-primary);">${_esc(desc || '連結')}</div>
                ${url ? '<div style="font-size:13px;color:var(--brand);word-break:break-all;">' + _esc(url) + '</div>' : ''}
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:8px;">學生端會顯示 QR Code + 連結</div>
            </div>
        `;

        _studentPane.innerHTML = card;
        _teacherPane.innerHTML = card;
    }

    // ═══════════════════════════════════════════════════════
    // 工具函數
    // ═══════════════════════════════════════════════════════

    function _renderFallback(type) {
        const label = TYPE_LABELS[type] || type;
        _studentPane.innerHTML = _emptyCard(label + ' — 渲染器未載入');
        _teacherPane.innerHTML = _emptyCard(label + ' — 渲染器未載入');
    }

    function _emptyCard(msg) {
        return '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-tertiary);font-size:14px;">' + msg + '</div>';
    }

    function _resetRenderers() {
        ['quiz', 'interactive'].forEach(function (type) {
            var r = window.LessonSlideRenderers?.get(type);
            if (r && r.reset) { try { r.reset(); } catch (e) { } }
        });
    }

    function _esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ═══════════════════════════════════════════════════════
    // 公開 API
    // ═══════════════════════════════════════════════════════

    window.LessonPreview = { open: open, close: close };

})();
