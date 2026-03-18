/**
 * 互動活動即時預覽模組
 * ============================================
 * 職責: 管理課案編輯器中互動活動的即時預覽生命週期
 *
 * 依賴方向:
 *   interactive_editor.js → interactive_preview.js → interactive_renderers.js
 *   本模組不知道 editor 內部結構，透過 callback 取得 editor + templateId
 *
 * 約束: 同一時間只存在一個 preview 實例 (renderer 是全域單例)
 */
'use strict';

(function () {

    // ── 常量 ──────────────────────────────────────────────
    const DEBOUNCE_MS = 500;

    const MOCK_STUDENTS = [
        { username: 'Student_A', progress: 100 },
        { username: 'Student_B', progress: 75 },
        { username: 'Student_C', progress: 40 },
        { username: 'Student_D', progress: 0 },
    ];

    // ── 模組狀態 ──────────────────────────────────────────
    let _activeTab = 'student';
    let _container = null;      // 預覽區容器 (center panel)
    let _viewport = null;       // 渲染目標區
    let _slide = null;          // 當前 slide 引用 (mutable)
    let _getEditorAndConfig = null; // () => { editor, templateId }
    let _configRoot = null;     // 配置面板根元素 (用於綁/解 listener)
    let _debounceTimer = null;

    // ═══════════════════════════════════════════════════════
    // 純函數: editorConfig → student slideData
    // ═══════════════════════════════════════════════════════

    function buildStudentSlideData(editorConfig) {
        const template = editorConfig.template;
        const templateData = editorConfig[template] || {};

        // 後端 serialize_for_student 把模板特定欄位扁平化到 config 裡
        // 前端 collectConfig 返回的是嵌套格式: { template, drag_sort: {...} }
        // 這裡做同樣的扁平化，並修正欄位名映射差異
        const flatConfig = { ...templateData };

        // 欄位名映射: editor → renderer
        if (flatConfig.background_url !== undefined) {
            flatConfig.background_image = flatConfig.background_url;
            delete flatConfig.background_url;
        }
        if (flatConfig.enabled_tools !== undefined) {
            flatConfig.tools = flatConfig.enabled_tools;
            delete flatConfig.enabled_tools;
        }

        return {
            slide_id: '__preview__',
            slide_type: 'interactive',
            template: template,
            time_limit: editorConfig.time_limit || 0,
            config: flatConfig,
            locked: false,
        };
    }

    // ═══════════════════════════════════════════════════════
    // 生命週期: create / refresh / destroy
    // ═══════════════════════════════════════════════════════

    function create(previewContainer, slide, getEditorAndConfig, configRoot) {
        // 先清理上一個實例 (防重複綁定)
        destroy();

        _container = previewContainer;
        _slide = slide;
        _getEditorAndConfig = getEditorAndConfig;
        _configRoot = configRoot;
        _activeTab = 'student';

        // 構建 tab bar + viewport
        _container.innerHTML = `
            <div class="interactive-preview-tabs">
                <button class="ipreview-tab active" data-tab="student">Student Preview</button>
                <button class="ipreview-tab" data-tab="teacher">Teacher Preview</button>
            </div>
            <div class="interactive-preview-viewport"></div>
        `;

        _viewport = _container.querySelector('.interactive-preview-viewport');

        // Tab 切換 (事件委派在 tab bar 上)
        _container.querySelector('.interactive-preview-tabs').addEventListener('click', _onTabClick);

        // 綁定配置面板的變更監聽 (named handlers，destroy 可解綁)
        if (_configRoot) {
            _configRoot.addEventListener('input', _onConfigInput);
            _configRoot.addEventListener('change', _onConfigChange);
        }

        // 首次渲染
        refresh();
    }

    function refresh() {
        if (!_viewport || !_getEditorAndConfig) return;

        const renderer = window.LessonSlideRenderers?.get('interactive');
        if (!renderer) {
            _renderError('Runtime renderer not loaded');
            return;
        }

        const info = _getEditorAndConfig();
        if (!info || !info.editor?.collectConfig) {
            _renderError('No config editor for: ' + (info?.templateId || 'unknown'));
            return;
        }

        const editorConfig = info.editor.collectConfig(_slide);
        if (!editorConfig) {
            _renderError('Unable to collect config');
            return;
        }

        // 重置引擎 (全域單例 — 確保無殘留狀態)
        try { renderer.reset(); } catch (e) { /* ignore */ }
        _viewport.innerHTML = '';

        try {
            if (_activeTab === 'student') {
                const slideData = buildStudentSlideData(editorConfig);
                renderer.renderStudent(_viewport, slideData, {
                    onSubmit: function () {},   // noop — 預覽不提交
                    onProgress: function () {}, // noop
                    locked: false,
                });
            } else {
                renderer.renderTeacher(_viewport, _slide, editorConfig, { locked: false });
                // 注入 mock 學生進度，讓 teacher tab 不是空殼
                _injectMockStudentProgress(renderer);
            }
        } catch (err) {
            console.error('[interactive_preview] render error:', err);
            _renderError('Preview render failed');
        }
    }

    function destroy() {
        clearTimeout(_debounceTimer);
        _debounceTimer = null;

        // 解綁配置面板監聽
        if (_configRoot) {
            _configRoot.removeEventListener('input', _onConfigInput);
            _configRoot.removeEventListener('change', _onConfigChange);
        }

        // 重置 renderer 引擎
        const renderer = window.LessonSlideRenderers?.get('interactive');
        if (renderer) {
            try { renderer.reset(); } catch (e) { /* ignore */ }
        }

        _container = null;
        _viewport = null;
        _slide = null;
        _getEditorAndConfig = null;
        _configRoot = null;
        _activeTab = 'student';
    }

    // ═══════════════════════════════════════════════════════
    // 配置變更處理 (named handlers — 可 removeEventListener)
    // ═══════════════════════════════════════════════════════

    /** 文字輸入 → debounce 500ms */
    function _onConfigInput() {
        clearTimeout(_debounceTimer);
        _debounceTimer = setTimeout(refresh, DEBOUNCE_MS);
    }

    /** 結構性變更 (checkbox / select) → 立即刷新 */
    function _onConfigChange() {
        clearTimeout(_debounceTimer);
        refresh();
    }

    // ═══════════════════════════════════════════════════════
    // Tab 切換
    // ═══════════════════════════════════════════════════════

    function _onTabClick(e) {
        const btn = e.target.closest('.ipreview-tab');
        if (!btn || !btn.dataset.tab) return;

        const tabId = btn.dataset.tab;
        if (tabId === _activeTab) return;

        _activeTab = tabId;

        // 更新 tab 樣式
        const tabs = _container.querySelectorAll('.ipreview-tab');
        tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));

        refresh();
    }

    // ═══════════════════════════════════════════════════════
    // Mock 教師端學生進度注入
    // ═══════════════════════════════════════════════════════

    function _injectMockStudentProgress(renderer) {
        if (!renderer.updateStudentProgress) return;
        MOCK_STUDENTS.forEach(s => {
            try {
                renderer.updateStudentProgress(s.username, s.progress);
            } catch (e) { /* ignore */ }
        });
    }

    // ═══════════════════════════════════════════════════════
    // 錯誤降級卡片
    // ═══════════════════════════════════════════════════════

    function _renderError(msg) {
        if (!_viewport) return;
        _viewport.innerHTML = `
            <div class="interactive-preview-error">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5" style="margin-bottom:8px;">
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                <div>${msg}</div>
            </div>
        `;
    }

    // ═══════════════════════════════════════════════════════
    // 公開 API
    // ═══════════════════════════════════════════════════════

    window._interactivePreview = { create, refresh, destroy };

})();
