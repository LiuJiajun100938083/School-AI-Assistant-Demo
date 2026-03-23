/**
 * UI 工具模組
 * ===========
 * 全局掛載: window.UIModule
 *
 * 提供 Toast 通知、全局 Loading、確認彈窗等通用 UI 元件。
 * 依賴: 無（獨立運行）
 *
 * 自帶必要的最小化 CSS（透過 JS 注入），無需額外加載樣式檔。
 */
'use strict';

const UIModule = {

    _styleInjected: false,

    /**
     * 注入最小化 CSS（只執行一次）
     */
    _injectStyles() {
        if (this._styleInjected) return;
        this._styleInjected = true;

        const style = document.createElement('style');
        style.textContent = `
            /* ===== Toast ===== */
            .shared-toast {
                position: fixed;
                top: 20px;
                left: 50%;
                transform: translateX(-50%) translateY(-30px);
                padding: 12px 24px;
                border-radius: 8px;
                color: #fff;
                font-size: 14px;
                z-index: 99999;
                opacity: 0;
                transition: opacity .3s, transform .3s;
                pointer-events: none;
                max-width: 90vw;
                text-align: center;
                box-shadow: 0 4px 12px rgba(0,0,0,.15);
            }
            .shared-toast.show {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
            .shared-toast.success { background: #16a34a; }
            .shared-toast.error   { background: #dc2626; }
            .shared-toast.warning { background: #d97706; }
            .shared-toast.info    { background: #2563eb; }

            /* ===== Loading Overlay ===== */
            .shared-loading-overlay {
                position: fixed; inset: 0;
                background: rgba(255,255,255,.6);
                display: flex; align-items: center; justify-content: center;
                z-index: 99998;
            }
            .shared-loading-overlay .spinner {
                width: 36px; height: 36px;
                border: 3px solid #e5e7eb;
                border-top-color: #2563eb;
                border-radius: 50%;
                animation: shared-spin .7s linear infinite;
            }
            .shared-loading-overlay .loading-text {
                margin-top: 12px; font-size: 14px; color: #6b7280;
            }
            @keyframes shared-spin { to { transform: rotate(360deg); } }

            /* ===== Confirm Modal ===== */
            .shared-confirm-overlay {
                position: fixed; inset: 0;
                background: rgba(0,0,0,.4);
                display: flex; align-items: center; justify-content: center;
                z-index: 99999;
            }
            .shared-confirm-box {
                background: #fff; border-radius: 12px; padding: 24px;
                max-width: 400px; width: 90vw;
                box-shadow: 0 8px 30px rgba(0,0,0,.12);
            }
            .shared-confirm-box h3 {
                margin: 0 0 12px; font-size: 16px; color: #111;
            }
            .shared-confirm-box p {
                margin: 0 0 20px; font-size: 14px; color: #555; line-height: 1.5;
            }
            .shared-confirm-box .btn-row {
                display: flex; justify-content: flex-end; gap: 10px;
            }
            .shared-confirm-box button {
                padding: 8px 20px; border-radius: 6px; border: none;
                font-size: 14px; cursor: pointer; transition: background .2s;
            }
            .shared-confirm-box .btn-cancel {
                background: #f3f4f6; color: #374151;
            }
            .shared-confirm-box .btn-cancel:hover { background: #e5e7eb; }
            .shared-confirm-box .btn-ok {
                background: #2563eb; color: #fff;
            }
            .shared-confirm-box .btn-ok:hover { background: #1d4ed8; }
        `;
        document.head.appendChild(style);
    },

    /* ---------- Toast ---------- */

    /**
     * 顯示 Toast 通知
     * @param {string} message - 訊息文字
     * @param {'success'|'error'|'warning'|'info'} type - 類型
     * @param {number} duration - 顯示時長（毫秒，預設 3000）
     */
    toast(message, type = 'info', duration = 3000) {
        this._injectStyles();

        const el = document.createElement('div');
        el.className = `shared-toast ${type}`;
        el.textContent = message;
        document.body.appendChild(el);

        // 觸發動畫
        requestAnimationFrame(() => el.classList.add('show'));

        setTimeout(() => {
            el.classList.remove('show');
            setTimeout(() => el.remove(), 300);
        }, duration);
    },

    /* ---------- Loading ---------- */

    /**
     * 顯示全局加載遮罩
     * @param {string} text - 提示文字
     */
    showLoading(text) {
        if (!text) text = (typeof i18n !== 'undefined') ? i18n.t('common.loading') : '加載中...';
        this._injectStyles();
        if (document.getElementById('sharedLoadingOverlay')) return;

        const el = document.createElement('div');
        el.id = 'sharedLoadingOverlay';
        el.className = 'shared-loading-overlay';
        el.innerHTML = `
            <div style="text-align:center">
                <div class="spinner"></div>
                <div class="loading-text">${text}</div>
            </div>
        `;
        document.body.appendChild(el);
    },

    /**
     * 隱藏全局加載遮罩
     */
    hideLoading() {
        document.getElementById('sharedLoadingOverlay')?.remove();
    },

    /* ---------- Confirm ---------- */

    /**
     * 確認彈窗（替代 window.confirm）
     * @param {string} message - 確認訊息
     * @param {string} title - 標題（預設「確認」）
     * @returns {Promise<boolean>}
     */
    confirm(message, title) {
        if (!title) title = (typeof i18n !== 'undefined') ? i18n.t('common.confirm') : '確認';
        this._injectStyles();

        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.className = 'shared-confirm-overlay';
            overlay.innerHTML = `
                <div class="shared-confirm-box">
                    <h3>${title}</h3>
                    <p>${message}</p>
                    <div class="btn-row">
                        <button class="btn-cancel">${(typeof i18n !== 'undefined') ? i18n.t('common.cancel') : '取消'}</button>
                        <button class="btn-ok">${(typeof i18n !== 'undefined') ? i18n.t('common.confirm') : '確定'}</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);

            const close = (result) => {
                overlay.remove();
                resolve(result);
            };

            overlay.querySelector('.btn-ok').addEventListener('click', () => close(true));
            overlay.querySelector('.btn-cancel').addEventListener('click', () => close(false));
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close(false);
            });
        });
    },

    /* ---------- 輔助 ---------- */

    /**
     * 返回一段 loading HTML（用於內容區佔位）
     */
    loadingHTML(text) {
        if (!text) text = (typeof i18n !== 'undefined') ? i18n.t('common.loading') : '加載中...';
        return `<div style="text-align:center;padding:60px 20px;color:#9ca3af">
            <div style="font-size:24px;margin-bottom:8px">⏳</div>${text}
        </div>`;
    }
};

window.UIModule = UIModule;
