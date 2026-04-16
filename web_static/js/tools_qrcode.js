/**
 * QR 碼生成器 — 前端 controller
 * 呼叫 POST /api/tools/qrcode,debounce 400ms 自動刷新預覽。
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    let currentEc = 'M';
    let lastBlobUrl = null;

    const generate = ToolsCommon.debounce(async function () {
        const text = $('#qrText').value.trim();
        const size = parseInt($('#qrSize').value, 10);

        if (!text) {
            $('#qrPreview').innerHTML = `<div class="tools-preview__empty">${i18n.t('tools.qr.empty')}</div>`;
            $('#qrDownload').disabled = true;
            $('#qrStatus').textContent = '';
            return;
        }
        if (text.length > 2000) {
            $('#qrStatus').className = 'tools-status tools-status--err';
            $('#qrStatus').textContent = i18n.t('tools.qr.tooLong');
            return;
        }

        $('#qrStatus').className = 'tools-status';
        $('#qrStatus').textContent = i18n.t('tools.processing');
        try {
            const res = await ToolsCommon.api('/api/tools/qrcode', {
                method: 'POST',
                body: JSON.stringify({ text, size, error_correction: currentEc, border: 2 }),
            });
            const blob = await res.blob();
            if (lastBlobUrl) URL.revokeObjectURL(lastBlobUrl);
            lastBlobUrl = URL.createObjectURL(blob);
            $('#qrPreview').innerHTML = `<img src="${lastBlobUrl}" alt="QR">`;
            $('#qrDownload').disabled = false;
            $('#qrStatus').textContent = ToolsCommon.formatSize(blob.size);
        } catch (err) {
            $('#qrStatus').className = 'tools-status tools-status--err';
            $('#qrStatus').textContent = err.message;
            $('#qrDownload').disabled = true;
        }
    }, 400);

    function init() {
        ToolsCommon.applyI18n();

        $('#qrText').addEventListener('input', generate);
        $('#qrSize').addEventListener('input', (e) => {
            $('#qrSizeLabel').textContent = e.target.value;
            $('#qrSizeLabel2').textContent = e.target.value;
            generate();
        });
        document.querySelectorAll('#qrEc button').forEach(b => {
            b.addEventListener('click', () => {
                document.querySelectorAll('#qrEc button').forEach(x => x.classList.remove('active'));
                b.classList.add('active');
                currentEc = b.dataset.ec;
                generate();
            });
        });

        $('#qrDownload').addEventListener('click', () => {
            if (!lastBlobUrl) return;
            const a = document.createElement('a');
            a.href = lastBlobUrl;
            const text = ($('#qrText').value.trim().slice(0, 20) || 'qrcode').replace(/[^\w\-]/g, '_');
            a.download = `qrcode_${text}.png`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        });
    }

    document.addEventListener('DOMContentLoaded', init);
})();
