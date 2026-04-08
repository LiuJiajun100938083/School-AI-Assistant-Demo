/**
 * 協作佈告板 — 列表頁 Controller
 * 薄層：fetch → render → handle click
 */
(function () {
    'use strict';

    const token = () => {
        if (typeof AuthModule !== 'undefined' && AuthModule.getToken) return AuthModule.getToken() || '';
        return localStorage.getItem('auth_token')
            || localStorage.getItem('token')
            || '';
    };

    async function api(path, opts = {}) {
        const headers = Object.assign(
            { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token() },
            opts.headers || {},
        );
        const res = await fetch('/api/boards' + path, { ...opts, headers });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            throw new Error((body.error && body.error.message) || body.message || '請求失敗');
        }
        return body.data;
    }

    // ------ i18n apply ------
    function applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = i18n.t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = i18n.t(el.dataset.i18nPlaceholder);
        });
        document.title = i18n.t('cb.pageTitle');
    }

    // ------ render ------
    function render(boards) {
        const grid = document.getElementById('boardsGrid');
        if (!boards.length) {
            grid.innerHTML = `
                <div class="cb-empty">
                    <div class="cb-empty__icon">📭</div>
                    <div class="cb-empty__title">${i18n.t('cb.emptyTitle')}</div>
                    <div class="cb-empty__desc">${i18n.t('cb.emptyDesc')}</div>
                </div>`;
            return;
        }
        grid.innerHTML = boards.map(b => {
            const visKey = 'cb.vis' + b.visibility.charAt(0).toUpperCase() + b.visibility.slice(1);
            const layoutKey = 'cb.layout' + b.layout.charAt(0).toUpperCase() + b.layout.slice(1);
            const mod = b.moderation ? `<span class="cb-tag cb-tag--warn">${i18n.t('cb.moderation')}</span>` : '';
            const cls = b.class_name ? `<span class="cb-tag cb-tag--gray">${escapeHtml(b.class_name)}</span>` : '';
            return `
                <div class="cb-card" data-uuid="${b.uuid}">
                    <div class="cb-card__head">
                        <div class="cb-card__icon">${b.icon || '📌'}</div>
                        <div class="cb-card__title">${escapeHtml(b.title)}</div>
                    </div>
                    <div class="cb-card__desc">${escapeHtml(b.description || '')}</div>
                    <div class="cb-card__meta">
                        <span class="cb-tag">${i18n.t(layoutKey)}</span>
                        <span class="cb-tag cb-tag--gray">${i18n.t(visKey)}</span>
                        ${cls}${mod}
                    </div>
                </div>`;
        }).join('');
        grid.querySelectorAll('.cb-card').forEach(el => {
            el.addEventListener('click', () => {
                location.href = '/boards/' + el.dataset.uuid;
            });
        });
    }

    function escapeHtml(s) {
        return String(s || '').replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
        }[c]));
    }

    // ------ modal ------
    window.closeModal = () => document.getElementById('createModal').classList.remove('open');
    function openModal() { document.getElementById('createModal').classList.add('open'); }

    async function save() {
        const payload = {
            title: document.getElementById('fTitle').value.trim(),
            description: document.getElementById('fDesc').value.trim(),
            icon: document.getElementById('fIcon').value.trim() || '📌',
            layout: document.getElementById('fLayout').value,
            visibility: document.getElementById('fVisibility').value,
            class_name: document.getElementById('fClassName').value.trim(),
            moderation: document.getElementById('fModeration').checked,
        };
        if (!payload.title) { alert(i18n.t('cb.formTitlePh')); return; }
        try {
            const board = await api('', { method: 'POST', body: JSON.stringify(payload) });
            closeModal();
            location.href = '/boards/' + board.uuid;
        } catch (e) {
            alert(e.message);
        }
    }

    async function load() {
        try {
            const boards = await api('');
            render(boards);
        } catch (e) {
            document.getElementById('boardsGrid').innerHTML =
                `<div class="cb-empty"><div class="cb-empty__icon">⚠️</div><div class="cb-empty__title">${i18n.t('cb.loadFailed')}</div><div class="cb-empty__desc">${escapeHtml(e.message)}</div></div>`;
        }
    }

    // ------ init ------
    document.addEventListener('DOMContentLoaded', () => {
        applyI18n();
        document.getElementById('btnCreate').addEventListener('click', openModal);
        document.getElementById('btnSave').addEventListener('click', save);
        load();
    });
})();
