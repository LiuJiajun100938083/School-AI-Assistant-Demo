'use strict';

/**
 * 登入頁面 — 前端核心模組
 * ========================
 *
 * 獨立負責：登入表單、名言輪播。
 * 登入成功後跳轉至主頁 (/)。
 *
 * 架構：
 *   LoginAPI  — API 請求封裝
 *   LoginUI   — DOM 渲染 / 介面操作
 *   LoginApp  — 主控制器（狀態、事件、業務流程）
 *
 * 依賴共享模組: AuthModule
 */

/* ============================================================
   API — 登入相關請求
   ============================================================ */

const LoginAPI = {
    async login(username, password) {
        return fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
    }
};

/* ============================================================
   UI — DOM 渲染 / 介面操作
   ============================================================ */

const LoginUI = {
    elements: {},

    cacheElements() {
        this.elements = {
            loginContainer:  document.getElementById('loginContainer'),
            loginForm:       document.getElementById('loginForm'),
            usernameInput:   document.getElementById('usernameInput'),
            passwordInput:   document.getElementById('passwordInput'),
            loginButton:     document.getElementById('loginButton'),
            loginError:      document.getElementById('loginError'),
            loginLoading:    document.getElementById('loginLoading')
        };
    },

    showLoginError(message) {
        const el = this.elements;
        el.loginError.textContent = message;
        el.loginError.style.display = 'block';
    },

    hideLoginError() {
        this.elements.loginError.style.display = 'none';
    },

    showLoginLoading(show) {
        const el = this.elements;
        el.loginLoading.style.display = show ? 'block' : 'none';
        el.loginButton.disabled = show;
        if (show) {
            el.loginButton.classList.add('is-loading');
        } else {
            el.loginButton.classList.remove('is-loading');
        }
    }
};

/* ============================================================
   APP — 主控制器
   ============================================================ */

const LoginApp = {

    async init() {
        LoginUI.cacheElements();
        this._bindEvents();

        // 自動聚焦用戶名輸入框
        LoginUI.elements.usernameInput?.focus();
    },

    _bindEvents() {
        const el = LoginUI.elements;

        el.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            this._login();
        });
    },

    async _login() {
        const el = LoginUI.elements;
        const username = el.usernameInput.value.trim();
        const password = el.passwordInput.value;

        if (!username || !password) {
            LoginUI.showLoginError('請輸入用戶名和密碼');
            return;
        }

        LoginUI.showLoginLoading(true);
        LoginUI.hideLoginError();

        try {
            const response = await LoginAPI.login(username, password);
            const result = await response.json();

            if (response.ok && result.success) {
                AuthModule.setToken(result.access_token);
                if (result.refresh_token) {
                    AuthModule.setRefreshToken(result.refresh_token);
                }
                localStorage.setItem('user_role', result.role);

                // 登入成功，跳轉回原頁面或主頁
                const params = new URLSearchParams(window.location.search);
                const redirect = params.get('redirect');
                window.location.href = redirect || '/';
            } else {
                LoginUI.showLoginError(result.detail || '登入失敗，請檢查用戶名和密碼');
            }
        } catch (error) {
            console.error('登入錯誤:', error);
            LoginUI.showLoginError('網絡錯誤，請稍後重試');
        } finally {
            LoginUI.showLoginLoading(false);
        }
    }
};

/* ============================================================
   名人名言輪播（純 opacity，8 秒間隔）
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    const quotes = [
        { chinese: '「人工智慧是新的電力。」', english: 'AI is the new electricity.', author: 'Andrew Ng（吳恩達）' },
        { chinese: '「AI 是我們這個時代最強大的技術力量。」', english: 'AI is the most powerful technology force of our time.', author: 'Jensen Huang（黃仁勳）' },
        { chinese: '「AI 將改變每一個產業與每一個業務功能。」', english: 'AI will transform every industry and every business function.', author: 'Satya Nadella（微軟 CEO）' },
        { chinese: '「AI 最大的進步將來自讓它更加以人為中心。」', english: 'The greatest advances in AI will come from making it more human-centered.', author: 'Fei-Fei Li（李飛飛）' },
        { chinese: '「機器常常以驚人的方式讓我感到意外。」', english: 'Machines take me by surprise with great frequency.', author: 'Alan Turing（艾倫·圖靈）' },
        { chinese: '「AI 可能是人類迄今為止最重要的研究方向。」', english: 'AI is probably the most important thing humanity has ever worked on.', author: 'Bill Gates（比爾·蓋茲）' },
        { chinese: '「教育不是為生活做準備；教育本身就是生活。」', english: 'Education is not preparation for life; education is life itself.', author: 'John Dewey（約翰·杜威）' },
        { chinese: '「創造力在教育中與讀寫能力同樣重要。」', english: 'Creativity is as important in education as literacy.', author: 'Ken Robinson（肯·羅賓遜爵士）' },
        { chinese: '「教師最大的成功，是能說：孩子們學習時好像不再需要我了。」', english: "The greatest sign of success for a teacher is to be able to say, 'The children are now working as if I did not exist.'", author: 'Maria Montessori（蒙特梭利）' },
        { chinese: '「教育是一個自我組織系統，學習是一種自然湧現的現象。」', english: 'Education is a self-organizing system, where learning is an emergent phenomenon.', author: 'Sugata Mitra（米特拉教授）' }
    ];

    const quoteWrapper    = document.getElementById('quoteWrapper');
    const quoteIndicators = document.getElementById('quoteIndicators');
    if (!quoteWrapper || !quoteIndicators) return;

    let currentIdx = 0;
    let autoTimer  = null;

    quoteWrapper.innerHTML = quotes.map((q, i) =>
        `<div class="quote-item${i === 0 ? ' active' : ''}" data-index="${i}">
            <div class="quote-chinese">${q.chinese}</div>
            <div class="quote-english">${q.english}</div>
            <div class="quote-author">${q.author}</div>
        </div>`
    ).join('');

    quoteIndicators.innerHTML = quotes.map((_, i) =>
        `<div class="quote-indicator${i === 0 ? ' active' : ''}" data-index="${i}"></div>`
    ).join('');

    function switchQuote(next) {
        if (next === currentIdx) return;
        const items = quoteWrapper.querySelectorAll('.quote-item');
        const dots  = quoteIndicators.querySelectorAll('.quote-indicator');
        items[currentIdx].classList.remove('active');
        dots[currentIdx].classList.remove('active');
        currentIdx = next;
        items[currentIdx].classList.add('active');
        dots[currentIdx].classList.add('active');
    }

    function startAutoPlay() {
        if (autoTimer) clearInterval(autoTimer);
        autoTimer = setInterval(() => {
            switchQuote((currentIdx + 1) % quotes.length);
        }, 8000);
    }

    quoteIndicators.addEventListener('click', (e) => {
        const dot = e.target.closest('.quote-indicator');
        if (!dot) return;
        switchQuote(parseInt(dot.dataset.index));
        startAutoPlay();
    });

    startAutoPlay();
});

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    LoginApp.init();
});
