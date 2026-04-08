/**
 * tools_common.js — 實用工具共用 helper
 * 所有工具頁都會載入這支。
 */
(function (w) {
    'use strict';

    const ToolsCommon = {
        token() {
            if (typeof AuthModule !== 'undefined' && AuthModule.getToken) {
                return AuthModule.getToken() || '';
            }
            return localStorage.getItem('auth_token')
                || localStorage.getItem('token')
                || '';
        },

        /** fetch 並統一處理錯誤格式 {success:false, error:{code,message}} */
        async api(path, opts = {}) {
            const headers = Object.assign(
                { 'Authorization': 'Bearer ' + this.token() },
                opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
                opts.headers || {},
            );
            const res = await fetch(path, { ...opts, headers });
            if (res.ok) return res;
            // 嘗試解析 JSON 錯誤
            let msg = 'Request failed';
            try {
                const body = await res.json();
                msg = (body && body.error && body.error.message) || body.message || msg;
            } catch { /* ignore */ }
            throw new Error(msg);
        },

        /** 呼叫後端並下載 Blob */
        async downloadBlob(res, filename) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return blob;
        },

        /** Blob → objectURL (可直接設到 <img src>) */
        blobUrl(blob) {
            return URL.createObjectURL(blob);
        },

        /** 格式化檔案大小 */
        formatSize(bytes) {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / 1024 / 1024).toFixed(2) + ' MB';
        },

        /** 套用 data-i18n 屬性 */
        applyI18n() {
            document.querySelectorAll('[data-i18n]').forEach(el => {
                el.textContent = i18n.t(el.dataset.i18n);
            });
            document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
                el.placeholder = i18n.t(el.dataset.i18nPlaceholder);
            });
            const titleEl = document.querySelector('title[data-i18n]');
            if (titleEl) document.title = i18n.t(titleEl.dataset.i18n);
        },

        /** debounce helper */
        debounce(fn, ms) {
            let t;
            return function (...args) {
                clearTimeout(t);
                t = setTimeout(() => fn.apply(this, args), ms);
            };
        },
    };

    w.ToolsCommon = ToolsCommon;
})(window);
