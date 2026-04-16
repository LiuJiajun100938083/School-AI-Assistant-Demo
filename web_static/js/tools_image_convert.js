/**
 * 圖片格式轉換 — 混合模式
 * 瀏覽器可解碼的格式 (PNG/JPG/WebP) → 純前端 Canvas toBlob (零網路)
 * 瀏覽器無法解碼的格式 (HEIC 等)   → 上傳伺服器轉換,轉完即丟
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    const IMAGE_EXTS = ['heic', 'heif', 'bmp', 'tiff', 'tif',
        'png', 'jpg', 'jpeg', 'webp', 'gif'];

    let srcImg = null;       // HTMLImageElement (null in server mode)
    let srcFile = null;      // original File
    let serverMode = false;  // true when browser cannot decode the file
    let targetMime = 'image/png';
    let lastOutBlob = null;
    let lastOutUrl = null;
    let converting = false;  // prevent concurrent server requests

    // ── helpers ──

    function fileExt(name) {
        return (name || '').split('.').pop().toLowerCase();
    }

    function isImageFile(f) {
        if (f.type && f.type.startsWith('image/')) return true;
        return IMAGE_EXTS.includes(fileExt(f.name));
    }

    function targetKey() {
        // "image/png" → "png", "image/jpeg" → "jpeg"
        return targetMime.split('/')[1];
    }

    function showLoading(show) {
        const el = $('#convertLoading');
        const empty = $('#outPreview .tools-preview__empty');
        if (el) el.style.display = show ? '' : 'none';
        if (empty) empty.style.display = show ? 'none' : '';
    }

    function clearOutput() {
        if (lastOutUrl) URL.revokeObjectURL(lastOutUrl);
        lastOutBlob = null;
        lastOutUrl = null;
        $('#outPreview').innerHTML =
            '<div class="tools-preview__empty">\u2014</div>' +
            '<div id="convertLoading" style="display:none;text-align:center">' +
            '<div style="font-size:24px;margin-bottom:8px">\u23F3</div>' +
            '<div style="color:var(--tools-text-2);font-size:13px">' +
            i18n.t('tools.img.uploading') + '</div></div>';
        $('#outMeta').innerHTML = '';
        $('#downloadBtn').disabled = true;
    }

    // ── show original ──

    function showOrig(file) {
        srcFile = file;
        srcImg = null;
        serverMode = false;
        clearOutput();

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                // browser can decode → client mode
                srcImg = img;
                serverMode = false;
                renderOrigPreview(img, file);
                hideServerHint();
                convert();
            };
            img.onerror = () => {
                // browser cannot decode (HEIC on Chrome/Firefox)
                serverMode = true;
                renderOrigNoPreview(file);
                showServerHint();
                convert();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function renderOrigPreview(img, file) {
        $('#origPreview').innerHTML = '';
        $('#origPreview').appendChild(img.cloneNode());
        $('#origMeta').innerHTML =
            '<span>' + i18n.t('tools.img.size') + ': ' + ToolsCommon.formatSize(file.size) + '</span>' +
            '<span>' + i18n.t('tools.img.dims') + ': ' + img.naturalWidth + '\u00d7' + img.naturalHeight + '</span>' +
            '<span>' + (file.type || fileExt(file.name).toUpperCase()) + '</span>';
    }

    function renderOrigNoPreview(file) {
        var ext = fileExt(file.name).toUpperCase();
        $('#origPreview').innerHTML =
            '<div class="tools-preview__empty" style="text-align:center">' +
            '<div style="font-size:36px;margin-bottom:8px">\uD83D\uDDBC\uFE0F</div>' +
            '<div>' + ext + ' \u00b7 ' + ToolsCommon.formatSize(file.size) + '</div>' +
            '<div style="font-size:11px;margin-top:4px;color:var(--tools-text-3)">' +
            i18n.t('tools.img.cannotPreview') + '</div></div>';
        $('#origMeta').innerHTML =
            '<span>' + i18n.t('tools.img.size') + ': ' + ToolsCommon.formatSize(file.size) + '</span>' +
            '<span>' + (ext || 'unknown') + '</span>';
    }

    function showServerHint() {
        var el = $('#serverHint');
        if (el) {
            el.textContent = i18n.t('tools.img.serverHint');
            el.style.display = '';
        }
    }

    function hideServerHint() {
        var el = $('#serverHint');
        if (el) el.style.display = 'none';
    }

    // ── convert dispatcher ──

    function convert() {
        if (!srcFile) return;
        if (serverMode) {
            convertViaServer();
        } else {
            convertLocal();
        }
    }

    // ── client-side (Canvas) ──

    function convertLocal() {
        if (!srcImg) return;
        var canvas = document.createElement('canvas');
        canvas.width = srcImg.naturalWidth;
        canvas.height = srcImg.naturalHeight;
        var ctx = canvas.getContext('2d');
        if (targetMime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(srcImg, 0, 0);
        var quality = parseFloat($('#quality').value);
        canvas.toBlob(function (blob) {
            if (!blob) {
                $('#outMeta').innerHTML = '<span style="color:#b91c1c">' + i18n.t('tools.error') + '</span>';
                return;
            }
            showResult(blob);
        }, targetMime, quality);
    }

    // ── server-side (HEIC etc.) ──

    async function convertViaServer() {
        if (converting) return;
        converting = true;
        showLoading(true);
        $('#downloadBtn').disabled = true;

        var fmt = targetKey();
        if (fmt === 'jpg') fmt = 'jpeg';
        var qualityInt = Math.round(parseFloat($('#quality').value) * 100);

        var form = new FormData();
        form.append('file', srcFile);
        form.append('target_format', fmt);
        form.append('quality', String(qualityInt));

        try {
            var res = await ToolsCommon.api('/api/tools/image/convert', {
                method: 'POST',
                body: form,
            });
            var blob = await res.blob();
            showLoading(false);
            showResult(blob);
        } catch (err) {
            showLoading(false);
            $('#outMeta').innerHTML =
                '<span style="color:#b91c1c">' + i18n.t('tools.img.serverError') +
                ': ' + (err.message || err) + '</span>';
        } finally {
            converting = false;
        }
    }

    // ── shared result display ──

    function showResult(blob) {
        if (lastOutUrl) URL.revokeObjectURL(lastOutUrl);
        lastOutBlob = blob;
        lastOutUrl = URL.createObjectURL(blob);

        var img = new Image();
        img.src = lastOutUrl;
        var preview = $('#outPreview');
        // keep loading div but hide it
        preview.innerHTML = '';
        preview.appendChild(img);

        $('#outMeta').innerHTML =
            '<span>' + i18n.t('tools.img.size') + ': ' + ToolsCommon.formatSize(blob.size) + '</span>' +
            '<span>' + targetMime + '</span>';
        $('#downloadBtn').disabled = false;
    }

    // ── download ──

    function download() {
        if (!lastOutBlob) return;
        var a = document.createElement('a');
        a.href = lastOutUrl;
        var base = (srcFile ? srcFile.name.replace(/\.[^.]+$/, '') : 'converted');
        var ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[targetMime] || 'png';
        a.download = base + '.' + ext;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // ── init ──

    function init() {
        ToolsCommon.applyI18n();

        // file input
        $('#fileInput').addEventListener('change', function (e) {
            var f = e.target.files[0];
            if (f && isImageFile(f)) showOrig(f);
        });

        // drag & drop
        var dz = $('#dropZone');
        ['dragenter', 'dragover'].forEach(function (evt) {
            dz.addEventListener(evt, function (e) {
                e.preventDefault();
                dz.classList.add('drag-over');
            });
        });
        ['dragleave', 'drop'].forEach(function (evt) {
            dz.addEventListener(evt, function (e) {
                e.preventDefault();
                dz.classList.remove('drag-over');
            });
        });
        dz.addEventListener('drop', function (e) {
            var f = e.dataTransfer.files[0];
            if (f && isImageFile(f)) showOrig(f);
        });

        // format selector
        document.querySelectorAll('#fmtSel button').forEach(function (b) {
            b.addEventListener('click', function () {
                document.querySelectorAll('#fmtSel button').forEach(function (x) {
                    x.classList.remove('active');
                });
                b.classList.add('active');
                targetMime = b.dataset.fmt;
                $('#qualityWrap').style.display =
                    (targetMime === 'image/jpeg' || targetMime === 'image/webp') ? '' : 'none';
                convert();
            });
        });

        // quality slider
        $('#quality').addEventListener('input', function (e) {
            $('#qualityLabel').textContent = Math.round(e.target.value * 100);
            convert();
        });

        $('#downloadBtn').addEventListener('click', download);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
