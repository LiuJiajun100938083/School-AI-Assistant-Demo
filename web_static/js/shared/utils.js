/**
 * 通用工具模組
 * ============
 * 全局掛載: window.Utils
 *
 * 提供日期格式化、文件大小、URL 參數、防抖等常用工具函數。
 * 不依賴其他共享模組，應最先加載。
 */
'use strict';

const Utils = {

    /* ---------- 日期 / 時間 ---------- */

    /**
     * 格式化日期字串為可讀格式
     * @param {string|Date} dateStr
     * @param {boolean} showTime - 是否顯示時間（預設 true）
     * @returns {string}
     */
    formatDate(dateStr, showTime = true) {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return '-';
        const opts = { year: 'numeric', month: '2-digit', day: '2-digit' };
        if (showTime) {
            opts.hour = '2-digit';
            opts.minute = '2-digit';
        }
        return d.toLocaleDateString('zh-TW', opts);
    },

    /* ---------- 檔案 ---------- */

    /**
     * 格式化檔案大小
     * @param {number} bytes
     * @returns {string}
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    },

    /* ---------- URL ---------- */

    /**
     * 取得 URL 查詢參數
     * @param {string} name
     * @returns {string|null}
     */
    getQueryParam(name) {
        return new URLSearchParams(window.location.search).get(name);
    },

    /**
     * 設置 URL 查詢參數（不刷新頁面）
     */
    setQueryParam(name, value) {
        const url = new URL(window.location);
        url.searchParams.set(name, value);
        window.history.pushState({}, '', url);
    },

    /* ---------- 字串 / 安全 ---------- */

    /**
     * HTML 跳脫，防 XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /* ---------- 值檢測 ---------- */

    /**
     * 判斷值是否為空（null / undefined / 空字串 / 空陣列 / 空物件）
     */
    isEmpty(value) {
        if (value == null) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    },

    /* ---------- 函式工具 ---------- */

    /**
     * 防抖
     */
    debounce(fn, delay = 300) {
        let timer;
        return function (...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    },

    /**
     * 延遲
     * @param {number} ms
     * @returns {Promise<void>}
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * 生成簡易唯一 ID
     */
    generateId() {
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 9);
    }
};

window.Utils = Utils;
