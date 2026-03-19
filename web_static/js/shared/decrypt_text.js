'use strict';

/**
 * DecryptText — 文字解密/亂碼動畫效果
 * ====================================
 *
 * 純 Vanilla JS 實作，無任何依賴。
 * 將目標文字以「亂碼 → 逐步解密」的方式展示。
 *
 * 用法:
 *   DecryptText.animate(element, '歡迎回來，小明', { speed: 50, sequential: true });
 *
 * 或掛載到元素上自動觸發:
 *   DecryptText.mount(element, { animateOn: 'view', sequential: true });
 */
const DecryptText = (() => {

    // 預設亂碼字元集（混合中英日韓符號，增加視覺效果）
    const DEFAULT_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*<>[]{}';
    const CJK_CHARS = '電腦科技數據網絡智能學習計算程式';

    /**
     * 判斷字元是否為 CJK（中日韓）字元
     */
    function isCJK(ch) {
        const code = ch.charCodeAt(0);
        return (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified
               (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Extension A
               (code >= 0xF900 && code <= 0xFAFF);     // CJK Compat
    }

    /**
     * 取得隨機亂碼字元
     */
    function randomChar(original, useOriginalCharsOnly, originalChars) {
        if (useOriginalCharsOnly && originalChars.length > 0) {
            return originalChars[Math.floor(Math.random() * originalChars.length)];
        }
        // CJK 字元用 CJK 亂碼，ASCII 字元用 ASCII 亂碼
        if (isCJK(original)) {
            return CJK_CHARS[Math.floor(Math.random() * CJK_CHARS.length)];
        }
        return DEFAULT_CHARS[Math.floor(Math.random() * DEFAULT_CHARS.length)];
    }

    /**
     * 根據 revealDirection 計算揭示順序
     */
    function getRevealOrder(length, direction) {
        const indices = Array.from({ length }, (_, i) => i);
        switch (direction) {
            case 'end':
                return indices.reverse();
            case 'center': {
                const mid = Math.floor(length / 2);
                const result = [];
                for (let d = 0; d <= mid; d++) {
                    if (mid - d >= 0) result.push(mid - d);
                    if (mid + d < length && d !== 0) result.push(mid + d);
                }
                return result;
            }
            case 'start':
            default:
                return indices;
        }
    }

    /**
     * 核心動畫函式
     *
     * @param {HTMLElement} el - 目標 DOM 元素
     * @param {string} text - 要展示的文字
     * @param {Object} options - 動畫選項
     * @returns {Promise<void>}
     */
    function animate(el, text, options = {}) {
        const {
            speed = 50,
            maxIterations = 10,
            sequential = false,
            revealDirection = 'start',
            useOriginalCharsOnly = false,
            className = '',
            encryptedClassName = '',
            parentClassName = '',
        } = options;

        // 如果已在動畫中，取消前一次
        if (el._decryptRafId) {
            cancelAnimationFrame(el._decryptRafId);
            el._decryptRafId = null;
        }

        return new Promise((resolve) => {
            const chars = [...text]; // 正確處理 emoji & CJK
            const len = chars.length;

            if (len === 0) {
                el.textContent = '';
                resolve();
                return;
            }

            // 收集原文字元集（去重）
            const originalChars = [...new Set(chars.filter(c => c.trim()))];

            // 初始化每個位置的狀態
            const revealed = new Array(len).fill(false);
            const iterCount = new Array(len).fill(0);

            // 順序模式下的揭示序列
            const revealOrder = sequential ? getRevealOrder(len, revealDirection) : null;
            let revealIndex = 0;

            if (parentClassName) el.classList.add(parentClassName);

            let lastTime = 0;

            function renderFrame() {
                // 構建帶 span 的 HTML
                let html = '';
                for (let i = 0; i < len; i++) {
                    if (chars[i] === ' ') {
                        html += ' ';
                    } else if (revealed[i]) {
                        html += className
                            ? `<span class="${className}">${escapeHtml(chars[i])}</span>`
                            : escapeHtml(chars[i]);
                    } else {
                        const rChar = randomChar(chars[i], useOriginalCharsOnly, originalChars);
                        html += encryptedClassName
                            ? `<span class="${encryptedClassName}">${escapeHtml(rChar)}</span>`
                            : `<span style="opacity:0.6">${escapeHtml(rChar)}</span>`;
                    }
                }
                el.innerHTML = html;
            }

            function tick(timestamp) {
                if (timestamp - lastTime < speed) {
                    el._decryptRafId = requestAnimationFrame(tick);
                    return;
                }
                lastTime = timestamp;

                if (sequential) {
                    // 每 tick 揭示下一個字元
                    if (revealIndex < len) {
                        const idx = revealOrder[revealIndex];
                        // 空白直接揭示
                        if (chars[idx] === ' ') {
                            revealed[idx] = true;
                            revealIndex++;
                            // 不消耗 tick，繼續下一個
                            el._decryptRafId = requestAnimationFrame(tick);
                            return;
                        }
                        iterCount[idx]++;
                        if (iterCount[idx] >= maxIterations) {
                            revealed[idx] = true;
                            revealIndex++;
                        }
                    }
                } else {
                    // 非順序模式：所有未揭示的同時迭代
                    for (let i = 0; i < len; i++) {
                        if (!revealed[i] && chars[i] !== ' ') {
                            iterCount[i]++;
                            if (iterCount[i] >= maxIterations) {
                                revealed[i] = true;
                            }
                        } else if (chars[i] === ' ') {
                            revealed[i] = true;
                        }
                    }
                }

                renderFrame();

                // 檢查是否全部揭示完成
                if (revealed.every(Boolean)) {
                    el._decryptRafId = null;
                    resolve();
                } else {
                    el._decryptRafId = requestAnimationFrame(tick);
                }
            }

            // 先渲染初始亂碼幀
            renderFrame();
            el._decryptRafId = requestAnimationFrame(tick);
        });
    }

    /**
     * HTML 轉義
     */
    function escapeHtml(str) {
        const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return str.replace(/[&<>"']/g, c => map[c]);
    }

    /**
     * 掛載到元素，根據 animateOn 自動觸發
     *
     * @param {HTMLElement} el
     * @param {Object} options
     */
    function mount(el, options = {}) {
        const {
            text = el.textContent || '',
            animateOn = 'view',
            clickMode = 'once',
            ...animOpts
        } = options;

        // 先清空，等待觸發
        el.textContent = '';
        let hasPlayed = false;
        let isDecrypted = false;

        const play = () => animate(el, text, animOpts);

        switch (animateOn) {
            case 'view': {
                const observer = new IntersectionObserver((entries) => {
                    if (entries[0].isIntersecting && !hasPlayed) {
                        hasPlayed = true;
                        observer.disconnect();
                        play();
                    }
                }, { threshold: 0.1 });
                observer.observe(el);
                break;
            }
            case 'hover':
                el.addEventListener('mouseenter', () => play());
                // 初始顯示亂碼靜態
                animate(el, text, { ...animOpts, maxIterations: 0 });
                break;
            case 'click':
                el.style.cursor = 'pointer';
                el.addEventListener('click', () => {
                    if (clickMode === 'once' && hasPlayed) return;
                    if (clickMode === 'toggle') {
                        if (isDecrypted) {
                            el.textContent = '';
                            animate(el, text, { ...animOpts, maxIterations: 0 });
                            isDecrypted = false;
                            return;
                        }
                    }
                    hasPlayed = true;
                    isDecrypted = true;
                    play();
                });
                animate(el, text, { ...animOpts, maxIterations: 0 });
                break;
            case 'inViewHover': {
                let inView = false;
                const observer = new IntersectionObserver((entries) => {
                    inView = entries[0].isIntersecting;
                }, { threshold: 0.1 });
                observer.observe(el);
                el.addEventListener('mouseenter', () => { if (inView) play(); });
                animate(el, text, { ...animOpts, maxIterations: 0 });
                break;
            }
        }
    }

    // Public API
    return { animate, mount };
})();

// 若使用 ES Module 環境
if (typeof window !== 'undefined') {
    window.DecryptText = DecryptText;
}
