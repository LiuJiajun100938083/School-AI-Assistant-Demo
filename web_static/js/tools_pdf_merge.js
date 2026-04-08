/**
 * 多圖合併 PDF — 前端 controller
 * 拖放/選擇多張圖 → 縮圖可拖拽排序 → FormData 上傳 → 下載 PDF
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const MAX = 30;

    // state: ordered list of {file, dataUrl}
    let items = [];

    function renderThumbs() {
        const grid = $('#thumbGrid');
        grid.innerHTML = items.map((it, i) => `
            <div class="tools-thumb" draggable="true" data-idx="${i}">
                <span class="tools-thumb__idx">${i + 1}</span>
                <button class="tools-thumb__del" data-del="${i}">×</button>
                <img src="${it.dataUrl}" alt="">
                <div class="tools-thumb__name">${escapeHtml(it.file.name)}</div>
            </div>
        `).join('');

        // delete handlers
        grid.querySelectorAll('.tools-thumb__del').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                items.splice(parseInt(btn.dataset.del, 10), 1);
                renderThumbs();
                updateState();
            });
        });

        // drag-sort
        let dragFrom = null;
        grid.querySelectorAll('.tools-thumb').forEach(el => {
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
                renderThumbs();
            });
        });
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    function updateState() {
        const n = items.length;
        $('#pdfCount').textContent = n
            ? i18n.t('tools.pdf.count').replace('{n}', n)
            : i18n.t('tools.pdf.noFiles');
        $('#mergeBtn').disabled = n === 0;
        $('#clearBtn').disabled = n === 0;
    }

    async function addFiles(fileList) {
        const arr = Array.from(fileList).filter(f => f.type.startsWith('image/'));
        const slots = Math.max(0, MAX - items.length);
        for (const f of arr.slice(0, slots)) {
            const dataUrl = await readAsDataUrl(f);
            items.push({ file: f, dataUrl });
        }
        renderThumbs();
        updateState();
    }

    function readAsDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    }

    async function merge() {
        if (!items.length) return;
        $('#mergeBtn').disabled = true;
        $('#mergeBtn').textContent = i18n.t('tools.pdf.merging');
        try {
            const fd = new FormData();
            items.forEach(it => fd.append('files', it.file, it.file.name));
            const res = await ToolsCommon.api('/api/tools/images-to-pdf', {
                method: 'POST', body: fd,
            });
            await ToolsCommon.downloadBlob(res, 'merged.pdf');
        } catch (err) {
            alert(err.message);
        } finally {
            $('#mergeBtn').disabled = false;
            $('#mergeBtn').textContent = i18n.t('tools.pdf.merge');
        }
    }

    function init() {
        ToolsCommon.applyI18n();

        $('#fileInput').addEventListener('change', (e) => addFiles(e.target.files));

        const dz = $('#dropZone');
        ['dragenter', 'dragover'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); dz.classList.add('drag-over');
        }));
        ['dragleave', 'drop'].forEach(evt => dz.addEventListener(evt, (e) => {
            e.preventDefault(); dz.classList.remove('drag-over');
        }));
        dz.addEventListener('drop', (e) => addFiles(e.dataTransfer.files));

        $('#mergeBtn').addEventListener('click', merge);
        $('#clearBtn').addEventListener('click', () => {
            items = [];
            renderThumbs();
            updateState();
        });

        updateState();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
