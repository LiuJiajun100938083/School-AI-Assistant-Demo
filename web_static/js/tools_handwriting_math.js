/**
 * tools_handwriting_math.js — 手寫公式轉換 控制器
 * =================================================
 * 依賴: ToolsCommon, RenderMath, html2canvas (vendor)
 *
 * 職責:
 *   1. 照片上傳模式 — 拖放 / 選擇圖片
 *   2. 手寫畫板模式 — Canvas 2D 畫筆 (含橡皮擦)
 *   3. 呼叫後端 OCR: POST /api/tools/handwriting/math-ocr
 *   4. KaTeX 預覽 + 複製 LaTeX + 匯出 PNG
 *
 * 資料流: getImageBlob() → FormData → API → displayResult() → RenderMath
 */
(function () {
    'use strict';

    const $ = s => document.querySelector(s);

    // ── state ────────────────────────────────────────────────

    let mode         = 'photo';   // 'photo' | 'canvas'
    let uploadedFile = null;
    let recognizing  = false;
    let latexResult  = '';

    // ── Canvas 繪圖狀態 ──────────────────────────────────────

    let canvas, ctx;
    let isDrawing   = false;
    let isEraser    = false;
    let penWidth    = 3;
    let lastX       = 0;
    let lastY       = 0;
    let canvasDirty = false;   // 是否有筆劃

    // ── DOM refs ─────────────────────────────────────────────

    const els = {};

    function cacheEls() {
        els.modeToggle    = $('#hwModeToggle');
        els.panels        = $('#hwPanels');
        els.fileInput     = $('#hwFileInput');
        els.dropZone      = $('#hwDropZone');
        els.photoPreview  = $('#hwPhotoPreview');
        els.photoImg      = $('#hwPhotoImg');
        els.penWidthRange = $('#hwPenWidth');
        els.penWidthLabel = $('#hwPenWidthLabel');
        els.eraserBtn     = $('#hwEraserBtn');
        els.clearBtn      = $('#hwClearBtn');
        els.status        = $('#hwStatus');
        els.recognizeBtn  = $('#hwRecognizeBtn');
        els.latexOutput   = $('#hwLatexOutput');
        els.formulaPreview= $('#hwFormulaPreview');
        els.warning       = $('#hwWarning');
        els.copyBtn       = $('#hwCopyBtn');
        els.exportBtn     = $('#hwExportBtn');
    }

    // ══════════════════════════════════════════════════════════
    //  模式切換
    // ══════════════════════════════════════════════════════════

    function setMode(m) {
        mode = m;
        els.panels.dataset.mode = m;
        document.querySelectorAll('#hwModeToggle button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === m);
        });
        if (m === 'canvas') resizeCanvas();
    }

    // ══════════════════════════════════════════════════════════
    //  Canvas 畫板
    // ══════════════════════════════════════════════════════════

    function initCanvas() {
        canvas = $('#hwCanvas');
        ctx = canvas.getContext('2d');
        resizeCanvas();

        // Mouse 事件
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDraw);
        canvas.addEventListener('mouseleave', stopDraw);

        // Touch 事件 (行動端)
        canvas.addEventListener('touchstart', e => { e.preventDefault(); startDraw(e); }, { passive: false });
        canvas.addEventListener('touchmove',  e => { e.preventDefault(); draw(e); },      { passive: false });
        canvas.addEventListener('touchend',   e => { e.preventDefault(); stopDraw(e); },   { passive: false });

        // 視窗 resize
        window.addEventListener('resize', ToolsCommon.debounce(resizeCanvas, 200));
    }

    function resizeCanvas() {
        if (!canvas) return;
        const wrap = canvas.parentElement;
        const rect = wrap.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        clearCanvas();
    }

    function clearCanvas() {
        const wrap = canvas.parentElement;
        const rect = wrap.getBoundingClientRect();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, rect.width, rect.height);
        canvasDirty = false;
    }

    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: touch.clientX - rect.left,
            y: touch.clientY - rect.top,
        };
    }

    function startDraw(e) {
        isDrawing = true;
        const pos = getCanvasPos(e);
        lastX = pos.x;
        lastY = pos.y;
    }

    function draw(e) {
        if (!isDrawing) return;
        const pos = getCanvasPos(e);
        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(pos.x, pos.y);
        ctx.strokeStyle = isEraser ? '#ffffff' : '#000000';
        ctx.lineWidth = isEraser ? penWidth * 3 : penWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
        ctx.stroke();
        lastX = pos.x;
        lastY = pos.y;
        canvasDirty = true;
    }

    function stopDraw() {
        isDrawing = false;
    }

    function canvasToBlob() {
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }

    // ══════════════════════════════════════════════════════════
    //  照片上傳
    // ══════════════════════════════════════════════════════════

    function handlePhotoFiles(fileList) {
        const file = fileList[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showStatus('只支持圖片檔案', true);
            return;
        }
        uploadedFile = file;
        showStatus(ToolsCommon.formatSize(file.size));

        // 預覽
        const url = URL.createObjectURL(file);
        els.photoImg.src = url;
        els.photoPreview.style.display = 'block';
    }

    // ══════════════════════════════════════════════════════════
    //  OCR 識別
    // ══════════════════════════════════════════════════════════

    async function recognize() {
        if (recognizing) return;

        // 取得圖片 blob
        let imageBlob;
        if (mode === 'canvas') {
            if (!canvasDirty) {
                showStatus(i18n.t('tools.hw.noInput'), true);
                return;
            }
            imageBlob = await canvasToBlob();
        } else {
            if (!uploadedFile) {
                showStatus(i18n.t('tools.hw.noInput'), true);
                return;
            }
            imageBlob = uploadedFile;
        }

        recognizing = true;
        els.recognizeBtn.disabled = true;
        els.recognizeBtn.innerHTML = `<span class="hw-spinner"></span>${i18n.t('tools.hw.recognizing')}`;
        showStatus('');

        const form = new FormData();
        form.append('image', imageBlob, 'handwriting.png');

        try {
            const res = await ToolsCommon.api('/api/tools/handwriting/math-ocr', {
                method: 'POST',
                body: form,
            });
            const json = await res.json();
            if (json.success && json.data) {
                displayResult(json.data);
            } else {
                const msg = (json.error && json.error.message) || '識別失敗';
                showStatus(msg, true);
            }
        } catch (err) {
            showStatus(err.message || '識別失敗', true);
        } finally {
            recognizing = false;
            els.recognizeBtn.disabled = false;
            els.recognizeBtn.textContent = i18n.t('tools.hw.recognize');
        }
    }

    // ══════════════════════════════════════════════════════════
    //  結果顯示
    // ══════════════════════════════════════════════════════════

    function displayResult(data) {
        const text = data.text || '';
        latexResult = text;

        // LaTeX 代碼框
        els.latexOutput.textContent = text;
        els.copyBtn.disabled = !text;

        // 公式預覽 — 使用 RenderMath.renderMixed (處理 $...$ 包裹的混合文字)
        if (text) {
            const html = RenderMath.renderMixed(text);
            els.formulaPreview.innerHTML = html;
            els.exportBtn.disabled = false;
        } else {
            els.formulaPreview.innerHTML = `<span class="hw-formula-empty">${i18n.t('tools.hw.empty')}</span>`;
            els.exportBtn.disabled = true;
        }

        // 信心度警告
        if (data.low_confidence) {
            els.warning.textContent = i18n.t('tools.hw.lowConfidence');
            els.warning.style.display = 'block';
        } else {
            els.warning.style.display = 'none';
        }
    }

    // ══════════════════════════════════════════════════════════
    //  複製 / 匯出
    // ══════════════════════════════════════════════════════════

    function copyLatex() {
        if (!latexResult) return;
        navigator.clipboard.writeText(latexResult).then(() => {
            const orig = els.copyBtn.textContent;
            els.copyBtn.textContent = i18n.t('tools.copied');
            setTimeout(() => { els.copyBtn.textContent = orig; }, 1500);
        });
    }

    async function exportPng() {
        if (!latexResult || typeof html2canvas === 'undefined') return;
        try {
            els.exportBtn.disabled = true;
            els.exportBtn.textContent = i18n.t('tools.processing');

            const c = await html2canvas(els.formulaPreview, {
                scale: 2,
                backgroundColor: '#ffffff',
                useCORS: true,
            });
            c.toBlob(blob => {
                if (!blob) return;
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'formula.png';
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');
        } catch (err) {
            showStatus('導出失敗: ' + err.message, true);
        } finally {
            els.exportBtn.disabled = false;
            els.exportBtn.textContent = i18n.t('tools.hw.exportPng');
        }
    }

    // ── helpers ──────────────────────────────────────────────

    function showStatus(msg, isErr) {
        els.status.textContent = msg;
        els.status.classList.toggle('tools-status--err', !!isErr);
    }

    // ══════════════════════════════════════════════════════════
    //  初始化
    // ══════════════════════════════════════════════════════════

    function init() {
        cacheEls();
        ToolsCommon.applyI18n();
        initCanvas();

        // 模式切換
        els.modeToggle.addEventListener('click', e => {
            const btn = e.target.closest('button[data-mode]');
            if (btn) setMode(btn.dataset.mode);
        });

        // 照片上傳
        els.fileInput.addEventListener('change', () => handlePhotoFiles(els.fileInput.files));
        els.dropZone.addEventListener('dragover', e => { e.preventDefault(); els.dropZone.classList.add('drag-over'); });
        els.dropZone.addEventListener('dragleave', () => els.dropZone.classList.remove('drag-over'));
        els.dropZone.addEventListener('drop', e => {
            e.preventDefault();
            els.dropZone.classList.remove('drag-over');
            handlePhotoFiles(e.dataTransfer.files);
        });

        // 畫板工具列
        els.penWidthRange.addEventListener('input', () => {
            penWidth = parseInt(els.penWidthRange.value, 10);
            els.penWidthLabel.textContent = penWidth;
        });
        els.eraserBtn.addEventListener('click', () => {
            isEraser = !isEraser;
            els.eraserBtn.classList.toggle('active', isEraser);
        });
        els.clearBtn.addEventListener('click', clearCanvas);

        // 識別
        els.recognizeBtn.addEventListener('click', recognize);

        // 複製 / 匯出
        els.copyBtn.addEventListener('click', copyLatex);
        els.exportBtn.addEventListener('click', exportPng);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
