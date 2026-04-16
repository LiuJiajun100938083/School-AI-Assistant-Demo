/**
 * PDF 多功能工具 — 前端 controller
 *
 * 5 個 pane 共用一個檔案,每個 pane 內部自己的 state + handlers。
 * 每個 mode 以 IIFE 封裝,只暴露 init() 對外。
 */
(function () {
    'use strict';

    const $ = (s, root = document) => root.querySelector(s);
    const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

    const MAX_IMAGES = 30;
    const MAX_MERGE = 20;

    // ─────────────────────────────────────────────────────────
    // common helpers
    // ─────────────────────────────────────────────────────────
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / 1024 / 1024).toFixed(2) + ' MB';
    }

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    async function uploadAndDownload(url, formData, outName, statusEl, submitBtn, loadingText) {
        const origInner = submitBtn.innerHTML;
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<div class="loading-spinner"></div> ${escapeHtml(loadingText || '...')}`;
        if (statusEl) { statusEl.textContent = ''; statusEl.classList.remove('pdft-error--show'); }
        try {
            const res = await ToolsCommon.api(url, { method: 'POST', body: formData });
            await ToolsCommon.downloadBlob(res, outName);
            return true;
        } catch (err) {
            if (statusEl) {
                statusEl.textContent = err.message || String(err);
                statusEl.classList.add('pdft-error--show');
            }
            return false;
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origInner;
        }
    }

    // reusable dropzone wiring
    function bindDropzone(zoneEl, inputEl, onFiles) {
        inputEl.addEventListener('change', (e) => onFiles(Array.from(e.target.files || [])));
        ['dragenter', 'dragover'].forEach(evt => zoneEl.addEventListener(evt, (e) => {
            e.preventDefault();
            zoneEl.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach(evt => zoneEl.addEventListener(evt, (e) => {
            e.preventDefault();
            zoneEl.classList.remove('drag-over');
        }));
        zoneEl.addEventListener('drop', (e) => onFiles(Array.from(e.dataTransfer.files || [])));
    }

    // ─────────────────────────────────────────────────────────
    // Tab switcher
    // ─────────────────────────────────────────────────────────
    function initTabs() {
        const tabs = $$('.pdft-tab');
        const panes = $$('.pdft-pane');
        tabs.forEach(t => {
            t.addEventListener('click', () => {
                const mode = t.dataset.mode;
                tabs.forEach(x => {
                    const on = x === t;
                    x.classList.toggle('active', on);
                    x.setAttribute('aria-selected', on ? 'true' : 'false');
                });
                panes.forEach(p => {
                    p.hidden = p.dataset.pane !== mode;
                });
            });
        });
    }

    // ─────────────────────────────────────────────────────────
    // Mode 1: 圖片 → PDF (with thumbnail + drag-sort)
    // ─────────────────────────────────────────────────────────
    const imagesMode = (function () {
        let items = [];  // [{file, dataUrl}]

        function render() {
            const grid = $('#imgThumbs');
            grid.innerHTML = items.map((it, i) => `
                <div class="pdft-thumb" draggable="true" data-idx="${i}">
                    <span class="pdft-thumb__idx">${i + 1}</span>
                    <button class="pdft-thumb__del" data-del="${i}" aria-label="delete">×</button>
                    <img src="${it.dataUrl}" alt="">
                    <div class="pdft-thumb__name">${escapeHtml(it.file.name)}</div>
                </div>`).join('');

            grid.querySelectorAll('.pdft-thumb__del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    items.splice(parseInt(btn.dataset.del, 10), 1);
                    render();
                    updateState();
                });
            });

            let dragFrom = null;
            grid.querySelectorAll('.pdft-thumb').forEach(el => {
                el.addEventListener('dragstart', (e) => {
                    dragFrom = parseInt(el.dataset.idx, 10);
                    el.classList.add('dragging');
                    e.dataTransfer.effectAllowed = 'move';
                });
                el.addEventListener('dragend', () => el.classList.remove('dragging'));
                el.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    el.classList.add('drag-over');
                });
                el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
                el.addEventListener('drop', (e) => {
                    e.preventDefault();
                    el.classList.remove('drag-over');
                    const to = parseInt(el.dataset.idx, 10);
                    if (dragFrom === null || dragFrom === to) return;
                    const moved = items.splice(dragFrom, 1)[0];
                    items.splice(to, 0, moved);
                    dragFrom = null;
                    render();
                });
            });
        }

        function updateState() {
            const n = items.length;
            $('#imgCount').textContent = n
                ? `${n} / ${MAX_IMAGES}`
                : i18n.t('tools.pdft.imgEmpty');
            $('#imgSubmit').disabled = n === 0;
            $('#imgClear').disabled = n === 0;
        }

        async function addFiles(fileList) {
            const arr = fileList.filter(f => f.type && f.type.startsWith('image/'));
            const slots = Math.max(0, MAX_IMAGES - items.length);
            for (const f of arr.slice(0, slots)) {
                try {
                    const dataUrl = await readAsDataUrl(f);
                    items.push({ file: f, dataUrl });
                } catch (e) {
                    console.warn('read image failed:', f.name, e);
                }
            }
            render();
            updateState();
        }

        async function submit() {
            if (!items.length) return;
            const fd = new FormData();
            items.forEach(it => fd.append('files', it.file, it.file.name));
            await uploadAndDownload(
                '/api/tools/pdf/images-to-pdf',
                fd,
                'merged.pdf',
                $('#imgStatus'),
                $('#imgSubmit'),
                i18n.t('tools.pdft.loading'),
            );
        }

        function init() {
            bindDropzone($('#imgDrop'), $('#imgInput'), addFiles);
            $('#imgSubmit').addEventListener('click', submit);
            $('#imgClear').addEventListener('click', () => {
                items = [];
                render();
                updateState();
            });
            updateState();
        }

        return { init };
    })();

    // ─────────────────────────────────────────────────────────
    // Mode 2: Merge PDFs
    // ─────────────────────────────────────────────────────────
    const mergeMode = (function () {
        let files = [];

        function render() {
            const ul = $('#mergeList');
            ul.innerHTML = files.map((f, i) => `
                <li class="pdft-file-item" data-idx="${i}">
                    <span class="pdft-file-idx">${i + 1}</span>
                    <span class="pdft-file-name">${escapeHtml(f.name)}</span>
                    <span class="pdft-file-size">${formatSize(f.size)}</span>
                    <button class="pdft-file-del" data-del="${i}" aria-label="delete">×</button>
                </li>`).join('');
            ul.querySelectorAll('.pdft-file-del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    files.splice(parseInt(btn.dataset.del, 10), 1);
                    render();
                    updateState();
                });
            });
        }

        function updateState() {
            const n = files.length;
            $('#mergeCount').textContent = n
                ? `${n} / ${MAX_MERGE}`
                : i18n.t('tools.pdft.mergeEmpty');
            $('#mergeSubmit').disabled = n < 1;
            $('#mergeClear').disabled = n === 0;
        }

        function isPdf(f) {
            const t = (f.type || '').toLowerCase();
            const n = (f.name || '').toLowerCase();
            return t === 'application/pdf' || n.endsWith('.pdf');
        }

        function addFiles(fileList) {
            const pdfs = fileList.filter(isPdf);
            const slots = Math.max(0, MAX_MERGE - files.length);
            files.push(...pdfs.slice(0, slots));
            render();
            updateState();
        }

        async function submit() {
            if (!files.length) return;
            const fd = new FormData();
            files.forEach(f => fd.append('files', f, f.name));
            await uploadAndDownload(
                '/api/tools/pdf/merge',
                fd,
                'merged.pdf',
                $('#mergeStatus'),
                $('#mergeSubmit'),
                i18n.t('tools.pdft.loading'),
            );
        }

        function init() {
            bindDropzone($('#mergeDrop'), $('#mergeInput'), addFiles);
            $('#mergeSubmit').addEventListener('click', submit);
            $('#mergeClear').addEventListener('click', () => {
                files = [];
                render();
                updateState();
            });
            updateState();
        }

        return { init };
    })();

    // ─────────────────────────────────────────────────────────
    // Mode 3: Extract pages
    // ─────────────────────────────────────────────────────────
    function isPdfFile(f) {
        const t = (f && f.type || '').toLowerCase();
        const n = (f && f.name || '').toLowerCase();
        return t === 'application/pdf' || n.endsWith('.pdf');
    }

    const extractMode = (function () {
        let file = null;

        function updateState() {
            const hasFile = !!file;
            const hasRanges = ($('#extractRanges').value || '').trim().length > 0;
            $('#extractSubmit').disabled = !(hasFile && hasRanges);
            $('#extractClear').disabled = !hasFile;
            $('#extractInfo').textContent = file
                ? `${file.name} (${formatSize(file.size)})`
                : '';
        }

        async function submit() {
            if (!file) return;
            const ranges = ($('#extractRanges').value || '').trim();
            if (!ranges) return;
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('ranges', ranges);
            await uploadAndDownload(
                '/api/tools/pdf/extract',
                fd,
                `extracted-${file.name}`,
                $('#extractStatus'),
                $('#extractSubmit'),
                i18n.t('tools.pdft.loading'),
            );
        }

        function init() {
            bindDropzone($('#extractDrop'), $('#extractInput'), (fs) => {
                const pdf = fs.find(isPdfFile);
                if (pdf) { file = pdf; updateState(); }
            });
            $('#extractRanges').addEventListener('input', updateState);
            $('#extractSubmit').addEventListener('click', submit);
            $('#extractClear').addEventListener('click', () => {
                file = null;
                $('#extractInput').value = '';
                $('#extractRanges').value = '';
                updateState();
            });
            updateState();
        }

        return { init };
    })();

    // ─────────────────────────────────────────────────────────
    // Mode 4: Compress
    // ─────────────────────────────────────────────────────────
    const compressMode = (function () {
        let file = null;
        let level = 'medium';

        function updateState() {
            $('#compressSubmit').disabled = !file;
            $('#compressClear').disabled = !file;
            $('#compressInfo').textContent = file
                ? `${file.name} (${formatSize(file.size)})`
                : '';
        }

        async function submit() {
            if (!file) return;
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('level', level);
            await uploadAndDownload(
                '/api/tools/pdf/compress',
                fd,
                `compressed-${file.name}`,
                $('#compressStatus'),
                $('#compressSubmit'),
                i18n.t('tools.pdft.loading'),
            );
        }

        function init() {
            bindDropzone($('#compressDrop'), $('#compressInput'), (fs) => {
                const pdf = fs.find(isPdfFile);
                if (pdf) { file = pdf; updateState(); }
            });
            $$('#compressLevelSeg button').forEach(b => {
                b.addEventListener('click', () => {
                    level = b.dataset.level;
                    $$('#compressLevelSeg button').forEach(x => {
                        const on = x === b;
                        x.classList.toggle('active', on);
                        x.setAttribute('aria-checked', on ? 'true' : 'false');
                    });
                });
            });
            $('#compressSubmit').addEventListener('click', submit);
            $('#compressClear').addEventListener('click', () => {
                file = null;
                $('#compressInput').value = '';
                updateState();
            });
            updateState();
        }

        return { init };
    })();

    // ─────────────────────────────────────────────────────────
    // Mode 5: Watermark
    // ─────────────────────────────────────────────────────────
    const watermarkMode = (function () {
        let file = null;
        let angle = 45;

        function updateState() {
            const hasFile = !!file;
            const hasText = ($('#wmText').value || '').trim().length > 0;
            $('#wmSubmit').disabled = !(hasFile && hasText);
            $('#wmClear').disabled = !hasFile && !hasText;
            $('#wmInfo').textContent = file
                ? `${file.name} (${formatSize(file.size)})`
                : '';
        }

        async function submit() {
            if (!file) return;
            const text = ($('#wmText').value || '').trim();
            if (!text) return;
            const opacity = parseInt($('#wmOpacity').value, 10) / 100;
            const fontSize = parseInt($('#wmFontSize').value, 10);
            const fd = new FormData();
            fd.append('file', file, file.name);
            fd.append('text', text);
            fd.append('opacity', String(opacity));
            fd.append('angle', String(angle));
            fd.append('font_size', String(fontSize));
            await uploadAndDownload(
                '/api/tools/pdf/watermark',
                fd,
                `watermarked-${file.name}`,
                $('#wmStatus'),
                $('#wmSubmit'),
                i18n.t('tools.pdft.loading'),
            );
        }

        function init() {
            bindDropzone($('#wmDrop'), $('#wmInput'), (fs) => {
                const pdf = fs.find(isPdfFile);
                if (pdf) { file = pdf; updateState(); }
            });
            $('#wmText').addEventListener('input', updateState);

            const opacitySlider = $('#wmOpacity');
            const opacityVal = $('#wmOpacityVal');
            opacitySlider.addEventListener('input', () => {
                opacityVal.textContent = opacitySlider.value;
            });

            const fontSlider = $('#wmFontSize');
            const fontVal = $('#wmFontSizeVal');
            fontSlider.addEventListener('input', () => {
                fontVal.textContent = fontSlider.value;
            });

            $$('#wmAngleSeg button').forEach(b => {
                b.addEventListener('click', () => {
                    angle = parseInt(b.dataset.angle, 10);
                    $$('#wmAngleSeg button').forEach(x => {
                        const on = x === b;
                        x.classList.toggle('active', on);
                        x.setAttribute('aria-checked', on ? 'true' : 'false');
                    });
                });
            });

            $('#wmSubmit').addEventListener('click', submit);
            $('#wmClear').addEventListener('click', () => {
                file = null;
                $('#wmInput').value = '';
                $('#wmText').value = '';
                updateState();
            });
            updateState();
        }

        return { init };
    })();

    // ─────────────────────────────────────────────────────────
    // boot
    // ─────────────────────────────────────────────────────────
    function init() {
        ToolsCommon.applyI18n();
        initTabs();
        imagesMode.init();
        mergeMode.init();
        extractMode.init();
        compressMode.init();
        watermarkMode.init();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
