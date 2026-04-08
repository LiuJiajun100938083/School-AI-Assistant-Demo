/**
 * 圖片格式轉換 — 純前端 Canvas toBlob
 * 零網路,零上傳,使用者檔案永遠不離開瀏覽器。
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);

    let srcImg = null;       // HTMLImageElement
    let srcFile = null;      // 原始 File
    let targetMime = 'image/png';
    let lastOutBlob = null;
    let lastOutUrl = null;

    function showOrig(file) {
        srcFile = file;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                srcImg = img;
                $('#origPreview').innerHTML = '';
                $('#origPreview').appendChild(img.cloneNode());
                $('#origMeta').innerHTML =
                    `<span>${i18n.t('tools.img.size')}: ${ToolsCommon.formatSize(file.size)}</span>` +
                    `<span>${i18n.t('tools.img.dims')}: ${img.naturalWidth}×${img.naturalHeight}</span>` +
                    `<span>${file.type || ''}</span>`;
                convert();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    function convert() {
        if (!srcImg) return;
        const canvas = document.createElement('canvas');
        canvas.width = srcImg.naturalWidth;
        canvas.height = srcImg.naturalHeight;
        const ctx = canvas.getContext('2d');
        // 透明底 → 白 (JPG 不支援透明)
        if (targetMime === 'image/jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        ctx.drawImage(srcImg, 0, 0);
        const quality = parseFloat($('#quality').value);
        canvas.toBlob((blob) => {
            if (!blob) {
                $('#outMeta').innerHTML = `<span style="color:#b91c1c">${i18n.t('tools.error')}</span>`;
                return;
            }
            if (lastOutUrl) URL.revokeObjectURL(lastOutUrl);
            lastOutBlob = blob;
            lastOutUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.src = lastOutUrl;
            $('#outPreview').innerHTML = '';
            $('#outPreview').appendChild(img);
            $('#outMeta').innerHTML =
                `<span>${i18n.t('tools.img.size')}: ${ToolsCommon.formatSize(blob.size)}</span>` +
                `<span>${targetMime}</span>`;
            $('#downloadBtn').disabled = false;
        }, targetMime, quality);
    }

    function download() {
        if (!lastOutBlob) return;
        const a = document.createElement('a');
        a.href = lastOutUrl;
        const base = (srcFile ? srcFile.name.replace(/\.[^.]+$/, '') : 'converted');
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[targetMime] || 'png';
        a.download = `${base}.${ext}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    function init() {
        ToolsCommon.applyI18n();

        // 檔案輸入
        $('#fileInput').addEventListener('change', (e) => {
            const f = e.target.files[0];
            if (f) showOrig(f);
        });
        // 拖放
        const dz = $('#dropZone');
        ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); dz.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); dz.classList.remove('drag-over');
        }));
        dz.addEventListener('drop', (e) => {
            const f = e.dataTransfer.files[0];
            if (f && f.type.startsWith('image/')) showOrig(f);
        });

        // 格式切換
        document.querySelectorAll('#fmtSel button').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#fmtSel button').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                targetMime = b.dataset.fmt;
                $('#qualityWrap').style.display = (targetMime === 'image/jpeg' || targetMime === 'image/webp') ? '' : 'none';
                convert();
            });
        });

        // 品質
        $('#quality').addEventListener('input', (e) => {
            $('#qualityLabel').textContent = Math.round(e.target.value * 100);
            convert();
        });

        $('#downloadBtn').addEventListener('click', download);
    }

    document.addEventListener('DOMContentLoaded', init);
})();
