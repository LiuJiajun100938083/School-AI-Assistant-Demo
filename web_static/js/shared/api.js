/**
 * API 客戶端模組
 * ==============
 * 全局掛載: window.APIClient
 *
 * 統一的 HTTP 請求封裝：自動附帶 JWT Token、統一錯誤處理、
 * 401 自動跳轉登入。
 *
 * 依賴: AuthModule（取 Token）、UIModule（可選，顯示錯誤 Toast）
 * 加載順序: utils.js → auth.js → ui.js → api.js
 */
'use strict';

const APIClient = {

    /* ---------- 內部工具 ---------- */

    /**
     * 組合請求頭
     * @param {Object} extra - 額外的 headers
     * @param {boolean} json - 是否設置 Content-Type: application/json
     */
    _headers(extra = {}, json = true) {
        const h = {};
        const token = window.AuthModule?.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        if (json) h['Content-Type'] = 'application/json';
        return { ...h, ...extra };
    },

    /**
     * 核心 fetch 封裝
     */
    async _fetch(url, options = {}) {
        try {
            const resp = await fetch(url, options);

            // 401 → 嘗試自動續期，再失敗才跳轉
            if (resp.status === 401 && window.AuthModule) {
                const refreshed = await window.AuthModule.refresh();
                if (refreshed) {
                    // 用新 token 重試一次
                    const newHeaders = { ...options.headers, ...window.AuthModule.getAuthHeaders() };
                    const retryResp = await fetch(url, { ...options, headers: newHeaders });
                    if (retryResp.ok) return await retryResp.json();
                }
                window.AuthModule.clearAll();
                window.location.href = '/';
                return;
            }

            const data = await resp.json();

            if (!resp.ok) {
                const msg = data.detail || data.message || `請求失敗 (${resp.status})`;
                throw new Error(msg);
            }

            return data;
        } catch (err) {
            // 網絡錯誤 or 上面拋出的錯誤
            if (err.name !== 'Error') {
                // fetch 本身的網絡錯誤
                err = new Error('網絡連接失敗，請檢查網絡');
            }
            console.error(`API Error [${url}]:`, err.message);
            // 如果 UIModule 可用，顯示 toast
            if (window.UIModule?.toast) {
                window.UIModule.toast(err.message, 'error');
            }
            throw err;
        }
    },

    /* ---------- 公開方法 ---------- */

    /**
     * GET 請求
     * @param {string} url
     * @param {Object} params - 查詢參數（自動拼接到 URL）
     */
    async get(url, params = {}) {
        const qs = new URLSearchParams(params).toString();
        const fullUrl = qs ? `${url}?${qs}` : url;
        return this._fetch(fullUrl, {
            method: 'GET',
            headers: this._headers()
        });
    },

    /**
     * POST 請求（JSON）
     */
    async post(url, body = {}) {
        return this._fetch(url, {
            method: 'POST',
            headers: this._headers(),
            body: JSON.stringify(body)
        });
    },

    /**
     * PUT 請求（JSON）
     */
    async put(url, body = {}) {
        return this._fetch(url, {
            method: 'PUT',
            headers: this._headers(),
            body: JSON.stringify(body)
        });
    },

    /**
     * DELETE 請求
     */
    async delete(url) {
        return this._fetch(url, {
            method: 'DELETE',
            headers: this._headers()
        });
    },

    /**
     * 文件上傳（FormData）
     * 注意：不設 Content-Type，讓瀏覽器自動設置 multipart boundary
     */
    async upload(url, formData) {
        return this._fetch(url, {
            method: 'POST',
            headers: this._headers({}, false),   // json = false
            body: formData
        });
    }
};

window.APIClient = APIClient;
