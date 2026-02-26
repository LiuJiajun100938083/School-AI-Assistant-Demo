'use strict';

/**
 * 登入頁面 — 前端核心模組
 * ========================
 *
 * 獨立負責：Splash 開屏動畫、登入表單、名言輪播。
 * 登入成功後跳轉至主頁 (/)。
 *
 * 架構：
 *   LoginAPI  — API 請求封裝
 *   LoginUI   — DOM 渲染 / 介面操作
 *   LoginApp  — 主控制器（狀態、事件、業務流程）
 *
 * 依賴共享模組: AuthModule
 * 外部依賴:     GSAP（啟動動畫）
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
            loginLoading:    document.getElementById('loginLoading'),
            splashScreen:    document.getElementById('splashScreen')
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
    },

    /**
     * 登出回到登入頁時的淡入效果
     */
    showLoginInterface() {
        const el = this.elements;
        el.loginContainer.style.display = 'flex';

        if (typeof gsap !== 'undefined') {
            const bp = el.loginContainer.querySelector('.login-brand-panel');
            const fp = el.loginContainer.querySelector('.login-form-panel');
            gsap.set([bp, fp], { opacity: 1, x: 0 });
            gsap.fromTo(el.loginContainer, { opacity: 0 }, {
                opacity: 1, duration: 0.5, ease: 'cubic-bezier(0.4, 0, 0.2, 1)',
                onComplete() { el.usernameInput.focus(); }
            });
        } else {
            el.usernameInput.focus();
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
                localStorage.setItem('user_role', result.role);

                // 登入成功，跳轉主頁
                window.location.href = '/';
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
   企業級啟動動畫 + 名言輪播
   System Wake -> Interface Deployment -> Content Enter
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
    const splashScreen   = document.getElementById('splashScreen');
    const glassPanel     = document.getElementById('glassPanel');
    const loginContainer = document.getElementById('loginContainer');
    if (!splashScreen || !loginContainer) return;

    const EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';

    // 已登入用戶：跳過動畫（理論上不會到這裡，但做防禦性處理）
    const hasToken = AuthModule && AuthModule.getToken && AuthModule.getToken();
    if (hasToken) {
        splashScreen.style.display = 'none';
        if (glassPanel) glassPanel.style.display = 'none';
        loginContainer.style.display = 'none';
        return;
    }

    // DOM 引用
    const splashContent = splashScreen.querySelector('.splash-content');
    const splashMascot  = splashScreen.querySelector('.splash-mascot');
    const splashTitle   = splashScreen.querySelector('.splash-title');
    const splashSub     = splashScreen.querySelector('.splash-subtitle');
    const loaderBar     = splashScreen.querySelector('.splash-loader-bar');
    const brandPanel    = loginContainer.querySelector('.login-brand-panel');
    const formPanel     = loginContainer.querySelector('.login-form-panel');
    const brandMascot   = loginContainer.querySelector('.brand-mascot');
    const brandWelcome  = loginContainer.querySelector('.brand-welcome');
    const brandAppName  = loginContainer.querySelector('.brand-app-name');
    const brandSchool   = loginContainer.querySelector('.brand-school');
    const brandQuote    = loginContainer.querySelector('.brand-quote');
    const loginCard     = loginContainer.querySelector('.login-card');
    const loginHeader   = loginContainer.querySelector('.login-header');
    const inputGroups   = loginContainer.querySelectorAll('.input-group');
    const loginButton   = loginContainer.querySelector('.login-button');

    /* ====================================================
       第一幕：系統喚醒（System Wake）~ 2.5s
       ==================================================== */
    const tl = gsap.timeline();

    tl
        .to(splashMascot, {
            opacity: 1, filter: 'blur(0px)',
            duration: 1.2, ease: EASE
        }, 0.3)

        .to(splashTitle, {
            opacity: 1, filter: 'blur(0px)',
            duration: 0.6, ease: 'power2.out'
        }, 0.9)
        .to(splashSub, {
            opacity: 1, filter: 'blur(0px)',
            duration: 0.6, ease: 'power2.out'
        }, 1.1)

        .to(loaderBar, { x: '200%', duration: 1.0, ease: 'power2.inOut' }, 1.2)
        .to(loaderBar, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 2.0)

    /* ====================================================
       第二幕：空間展開（Interface Deployment）
       ==================================================== */

        .add(() => {
            const r = splashMascot.getBoundingClientRect();
            Object.assign(splashMascot.style, {
                position: 'fixed',
                left: r.left + 'px',
                top: r.top + 'px',
                width: r.width + 'px',
                height: 'auto',
                zIndex: '10001',
                pointerEvents: 'none',
                margin: '0',
                filter: 'blur(0px)'
            });
            document.body.appendChild(splashMascot);
        }, 2.5)

        .to(glassPanel, { opacity: 1, duration: 0.5, ease: EASE }, 2.5)

        .add(() => { splashScreen.style.display = 'none'; }, 2.9)

        .add(() => {
            loginContainer.style.display = 'flex';
            gsap.set(loginContainer, { opacity: 1 });
            gsap.set(brandPanel, { opacity: 0 });
            gsap.set(formPanel, { opacity: 0 });
            gsap.set(brandMascot, { opacity: 0 });
            gsap.set([brandWelcome, brandAppName, brandSchool], { opacity: 0, y: 16, filter: 'blur(6px)' });
            gsap.set(brandQuote, { opacity: 0, y: 16 });
            gsap.set(loginHeader, { opacity: 0, y: 20 });
            gsap.set(inputGroups, { opacity: 0, y: 20 });
            gsap.set(loginButton, { opacity: 0, y: 20, scale: 0.98 });
        }, 2.95)

        .to(glassPanel, {
            opacity: 0, duration: 0.6, ease: EASE,
            onComplete() { glassPanel.style.display = 'none'; }
        }, 3.0)
        .to(brandPanel, { opacity: 1, duration: 0.6, ease: EASE }, 3.05)
        .to(formPanel, { opacity: 1, duration: 0.6, ease: EASE }, 3.1)

    /* ====================================================
       第三幕：內容進入（Content Enter）
       ==================================================== */

        .add(() => {
            const target = brandMascot.getBoundingClientRect();
            const source = splashMascot.getBoundingClientRect();
            const dx = target.left + target.width / 2 - (source.left + source.width / 2);
            const dy = target.top + target.height / 2 - (source.top + source.height / 2);
            const s = target.width / source.width;

            gsap.to(splashMascot, {
                x: dx, y: dy, scale: s,
                duration: 0.7, ease: 'power3.inOut',
                onComplete() {
                    splashMascot.style.display = 'none';
                    gsap.set(brandMascot, { opacity: 1 });
                }
            });
        }, 3.2)

        .to(brandWelcome, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out'
        }, 3.4)
        .to(brandAppName, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.4, ease: 'power2.out'
        }, 3.52)
        .to(brandSchool, {
            opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.35, ease: 'power2.out'
        }, 3.64)
        .to(brandQuote, {
            opacity: 1, y: 0, duration: 0.4, ease: 'power2.out'
        }, 3.76)

        .to(loginHeader, {
            opacity: 1, y: 0, duration: 0.5, ease: 'power2.out'
        }, 3.4)
        .to(inputGroups, {
            opacity: 1, y: 0, duration: 0.5,
            stagger: 0.12, ease: 'power2.out'
        }, 3.55)
        .to(loginButton, {
            opacity: 1, y: 0, scale: 1, duration: 0.5, ease: EASE,
            onComplete() {
                document.getElementById('usernameInput')?.focus();
            }
        }, 3.8);

    /* ====================================================
       名人名言輪播（純 opacity，8 秒間隔）
       ==================================================== */
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

    setTimeout(startAutoPlay, 5000);
});

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    LoginApp.init();
});
