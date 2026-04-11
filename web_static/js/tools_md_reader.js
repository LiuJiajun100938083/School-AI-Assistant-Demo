/**
 * tools_md_reader.js — Markdown 閱讀器 控制器
 * =============================================
 * 純前端工具,不需後端 API。
 *
 * 依賴: ToolsCommon, RenderMath, (katex, marked, DOMPurify 由 render_math.js 內部使用)
 *
 * 職責:
 *   1. 檔案上傳 / 拖放 → FileReader.readAsText
 *   2. 貼上模式 → debounced live preview
 *   3. 呼叫 RenderMath.render() 渲染
 *   4. 複製 HTML / 列印
 */
(function () {
    'use strict';

    const $ = s => document.querySelector(s);
    const $$ = s => document.querySelectorAll(s);

    // ── state ────────────────────────────────────────────────

    let mode = 'upload';       // 'upload' | 'paste'
    let hasContent = false;

    // ── DOM refs ─────────────────────────────────────────────

    const els = {};

    function cacheEls() {
        els.modeToggle = $('#mdModeToggle');
        els.inputWrap  = $('#mdInputWrap');
        els.fileInput  = $('#mdFileInput');
        els.dropZone   = $('#mdDropZone');
        els.pasteArea  = $('#mdPasteArea');
        els.output     = $('#mdOutput');
        els.status     = $('#mdStatus');
        els.actions    = $('#mdActions');
        els.copyBtn    = $('#mdCopyHtml');
        els.printBtn   = $('#mdPrint');
    }

    // ── mode toggle ──────────────────────────────────────────

    function setMode(m) {
        mode = m;
        els.inputWrap.dataset.mode = m;
        $$('#mdModeToggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === m);
        });
        // 切換到 paste 時自動 focus
        if (m === 'paste') {
            setTimeout(() => els.pasteArea.focus(), 50);
        }
    }

    // ── render ────────────────────────────────────────────────

    function renderPreview(text) {
        if (!text || !text.trim()) {
            els.output.innerHTML = `<div class="md-reader-empty" data-i18n="tools.md.empty">${i18n.t('tools.md.empty')}</div>`;
            els.actions.style.display = 'none';
            hasContent = false;
            return;
        }
        const html = RenderMath.render(text, { repairOcr: false, repairBareLatex: true });
        els.output.innerHTML = `<div class="md-reader-output">${html}</div>`;
        els.actions.style.display = 'flex';
        hasContent = true;
    }

    // ── file upload ──────────────────────────────────────────

    function handleFiles(fileList) {
        const file = fileList[0];
        if (!file) return;

        // 基本校驗
        const name = file.name || '';
        const ext = name.substring(name.lastIndexOf('.')).toLowerCase();
        const allowed = ['.md', '.markdown', '.txt', '.mdown', '.mkd'];
        if (!allowed.includes(ext)) {
            els.status.textContent = '只支持 .md / .markdown / .txt 檔案';
            els.status.classList.add('tools-status--err');
            return;
        }

        els.status.classList.remove('tools-status--err');
        els.status.textContent = i18n.t('tools.md.filePicked')
            .replace('{name}', name)
            .replace('{size}', ToolsCommon.formatSize(file.size));

        const reader = new FileReader();
        reader.onload = e => renderPreview(e.target.result);
        reader.onerror = () => {
            els.status.textContent = '檔案讀取失敗';
            els.status.classList.add('tools-status--err');
        };
        reader.readAsText(file, 'UTF-8');
    }

    // ── clipboard / print ────────────────────────────────────

    function copyHtml() {
        if (!hasContent) return;
        const html = els.output.innerHTML;
        navigator.clipboard.writeText(html).then(() => {
            const orig = els.copyBtn.textContent;
            els.copyBtn.textContent = i18n.t('tools.copied');
            setTimeout(() => { els.copyBtn.textContent = orig; }, 1500);
        });
    }

    function printPreview() {
        if (!hasContent) return;
        window.print();
    }

    // ── init ─────────────────────────────────────────────────

    function init() {
        cacheEls();
        ToolsCommon.applyI18n();

        // mode toggle
        els.modeToggle.addEventListener('click', e => {
            const btn = e.target.closest('button[data-mode]');
            if (btn) setMode(btn.dataset.mode);
        });

        // file input
        els.fileInput.addEventListener('change', () => handleFiles(els.fileInput.files));

        // drag & drop
        els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('drag-over'); });
        els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
        els.dropZone.addEventListener('drop', e => {
            e.preventDefault();
            els.dropZone.classList.remove('drag-over');
            handleFiles(e.dataTransfer.files);
        });

        // paste textarea — debounced live preview
        const debouncedRender = ToolsCommon.debounce(
            () => renderPreview(els.pasteArea.value),
            400,
        );
        els.pasteArea.addEventListener('input', debouncedRender);

        // action buttons
        els.copyBtn.addEventListener('click', copyHtml);
        els.printBtn.addEventListener('click', printPreview);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
