/**
 * i18n.js - 輕量國際化模組
 *
 * 用法：
 *   i18n.t('login.title')          → 根據當前語言返回對應文字
 *   i18n.t('welcome.back', {name}) → 支援插值 {{name}}
 *   i18n.setLang('en')             → 切換語言並刷新頁面
 *   i18n.lang                      → 當前語言代碼
 */

'use strict';

const i18n = (() => {
    const STORAGE_KEY = 'app-lang';
    const DEFAULT_LANG = 'zh';

    /* ========== 翻譯字典 ========== */

    const messages = {
        zh: {
            // --- 通用 ---
            'app.name': 'AI 學習夥伴',
            'app.school': '培僑中學',
            'app.schoolFull': '培僑中學AI學習系統',
            'common.cancel': '取消',
            'common.confirm': '確定',
            'common.loading': '加載中...',
            'common.networkError': '網絡錯誤，請稍後重試',
            'common.requestFailed': '請求失敗',
            'common.networkFailed': '網絡連接失敗，請檢查網絡',

            // --- 登入頁 ---
            'login.pageTitle': '登入 — 培僑中學 學習夥伴',
            'login.welcome': '歡迎回來',
            'login.title': '登入帳戶',
            'login.subtitle': '請輸入您的用戶名和密碼',
            'login.username': '用戶名',
            'login.usernamePlaceholder': '請輸入用戶名',
            'login.password': '密碼',
            'login.passwordPlaceholder': '請輸入密碼',
            'login.submit': '登入',
            'login.submitting': '驗證中',
            'login.emptyFields': '請輸入用戶名和密碼',
            'login.failed': '登入失敗，請檢查用戶名和密碼',
            'login.error': '登入錯誤',
            'login.qrLabel': '掃碼登入',

            // --- 首頁 ---
            'home.pageTitle': '培僑中學 學習夥伴',
            'home.splashTitle': 'AI 學習夥伴',
            'home.splashSubtitle': '培僑中學',
            'home.welcomeBack': '歡迎回來',
            'home.welcomeUser': '歡迎回來，{{name}}',
            'home.subtitle': '選擇下方應用開始使用',
            'home.defaultUser': '學生',
            'home.defaultClass': '未分班',
            'home.allApps': '全部應用',
            'home.all': '全部',
            'home.apps': '應用',
            'home.categories': '分類',

            // --- 首頁分類 ---
            'category.learning': '學習工具',
            'category.community': '社區',
            'category.teaching': '教學管理',
            'category.system': '系統管理',
            'category.other': '其他',

            // --- 用戶選單 ---
            'menu.changePassword': '修改密碼',
            'menu.admin': '管理後台',
            'menu.logout': '退出登入',

            // --- 修改密碼 ---
            'password.title': '修改密碼',
            'password.current': '當前密碼',
            'password.new': '新密碼（至少4位）',
            'password.confirmNew': '確認新密碼',
            'password.confirmBtn': '確認修改',
            'password.emptyFields': '請填寫所有欄位',
            'password.tooShort': '新密碼至少需要4個字符',
            'password.mismatch': '兩次輸入的新密碼不一致',
            'password.success': '密碼修改成功！',
            'password.failed': '密碼修改失敗',
            'password.error': '修改密碼錯誤',

            // --- 學科 ---
            'subject.ict': '資訊及通訊科技',
            'subject.ict.desc': '資訊與通訊科技',
            'subject.ces': '公民經濟與社會',
            'subject.ces.desc': '公民經濟與社會',
            'subject.history': '歷史',
            'subject.history.desc': '歷史學科',
            'subject.chinese': '中文',
            'subject.chinese.desc': '中文語言文學',
            'subject.english': '英文',
            'subject.english.desc': '英語語言文學',
            'subject.math': '數學',
            'subject.math.desc': '數學學科',
            'subject.physics': '物理',
            'subject.physics.desc': '物理學科',
            'subject.chemistry': '化學',
            'subject.chemistry.desc': '化學學科',
            'subject.biology': '生物',
            'subject.biology.desc': '生物學科',
            'subject.science': '科學',
            'subject.science.desc': '綜合科學',
            'subject.economics': '經濟',
            'subject.economics.desc': '經濟學科',
            'subject.geography': '地理',
            'subject.geography.desc': '地理學科',
            'subject.va': '視覺藝術',
            'subject.va.desc': '視覺藝術',

            // --- Token ---
            'token.verifyFailed': 'Token驗證失敗',
            'token.verifyError': 'Token驗證錯誤',
            'subject.loadFailed': '載入學科失敗',
        },

        en: {
            // --- Common ---
            'app.name': 'AI Learning Buddy',
            'app.school': 'Pui Kiu College',
            'app.schoolFull': 'Pui Kiu College AI Learning System',
            'common.cancel': 'Cancel',
            'common.confirm': 'OK',
            'common.loading': 'Loading...',
            'common.networkError': 'Network error, please try again later',
            'common.requestFailed': 'Request failed',
            'common.networkFailed': 'Network connection failed, please check your connection',

            // --- Login ---
            'login.pageTitle': 'Login — Pui Kiu College Learning Buddy',
            'login.welcome': 'Welcome Back',
            'login.title': 'Sign In',
            'login.subtitle': 'Enter your username and password',
            'login.username': 'Username',
            'login.usernamePlaceholder': 'Enter username',
            'login.password': 'Password',
            'login.passwordPlaceholder': 'Enter password',
            'login.submit': 'Sign In',
            'login.submitting': 'Verifying',
            'login.emptyFields': 'Please enter username and password',
            'login.failed': 'Login failed, please check your credentials',
            'login.error': 'Login error',
            'login.qrLabel': 'Scan to Login',

            // --- Home ---
            'home.pageTitle': 'Pui Kiu College Learning Buddy',
            'home.splashTitle': 'AI Learning Buddy',
            'home.splashSubtitle': 'Pui Kiu College',
            'home.welcomeBack': 'Welcome Back',
            'home.welcomeUser': 'Welcome back, {{name}}',
            'home.subtitle': 'Choose an app below to get started',
            'home.defaultUser': 'Student',
            'home.defaultClass': 'Unassigned',
            'home.allApps': 'All Apps',
            'home.all': 'All',
            'home.apps': 'Apps',
            'home.categories': 'Categories',

            // --- Home categories ---
            'category.learning': 'Learning Tools',
            'category.community': 'Community',
            'category.teaching': 'Teaching Admin',
            'category.system': 'System Admin',
            'category.other': 'Other',

            // --- User menu ---
            'menu.changePassword': 'Change Password',
            'menu.admin': 'Admin Panel',
            'menu.logout': 'Sign Out',

            // --- Change password ---
            'password.title': 'Change Password',
            'password.current': 'Current password',
            'password.new': 'New password (min 4 chars)',
            'password.confirmNew': 'Confirm new password',
            'password.confirmBtn': 'Update',
            'password.emptyFields': 'Please fill in all fields',
            'password.tooShort': 'New password must be at least 4 characters',
            'password.mismatch': 'New passwords do not match',
            'password.success': 'Password changed successfully!',
            'password.failed': 'Failed to change password',
            'password.error': 'Password change error',

            // --- Subjects ---
            'subject.ict': 'ICT',
            'subject.ict.desc': 'Information & Communication Technology',
            'subject.ces': 'Citizenship & Social Development',
            'subject.ces.desc': 'Citizenship & Social Development',
            'subject.history': 'History',
            'subject.history.desc': 'History',
            'subject.chinese': 'Chinese',
            'subject.chinese.desc': 'Chinese Language & Literature',
            'subject.english': 'English',
            'subject.english.desc': 'English Language & Literature',
            'subject.math': 'Mathematics',
            'subject.math.desc': 'Mathematics',
            'subject.physics': 'Physics',
            'subject.physics.desc': 'Physics',
            'subject.chemistry': 'Chemistry',
            'subject.chemistry.desc': 'Chemistry',
            'subject.biology': 'Biology',
            'subject.biology.desc': 'Biology',
            'subject.science': 'Science',
            'subject.science.desc': 'Integrated Science',
            'subject.economics': 'Economics',
            'subject.economics.desc': 'Economics',
            'subject.geography': 'Geography',
            'subject.geography.desc': 'Geography',
            'subject.va': 'Visual Arts',
            'subject.va.desc': 'Visual Arts',

            // --- Token ---
            'token.verifyFailed': 'Token verification failed',
            'token.verifyError': 'Token verification error',
            'subject.loadFailed': 'Failed to load subjects',
        }
    };

    /* ========== 核心函數 ========== */

    let _lang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

    /**
     * 取得翻譯文字
     * @param {string} key - 翻譯鍵，如 'login.title'
     * @param {Object} [params] - 插值參數，如 {name: '小明'}
     * @returns {string}
     */
    function t(key, params) {
        const dict = messages[_lang] || messages[DEFAULT_LANG];
        let text = dict[key] || messages[DEFAULT_LANG][key] || key;
        if (params) {
            Object.keys(params).forEach(k => {
                text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), params[k]);
            });
        }
        return text;
    }

    /**
     * 設定語言並刷新頁面
     * @param {string} lang - 'zh' 或 'en'
     */
    function setLang(lang) {
        if (!messages[lang]) return;
        _lang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        location.reload();
    }

    /**
     * 切換語言（zh ↔ en）
     */
    function toggle() {
        setLang(_lang === 'zh' ? 'en' : 'zh');
    }

    /**
     * 自動翻譯帶有 data-i18n 屬性的 DOM 元素
     * <span data-i18n="login.title"></span>
     * <input data-i18n-placeholder="login.usernamePlaceholder">
     */
    function applyDOM(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = t(el.dataset.i18n);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = t(el.dataset.i18nPlaceholder);
        });
        root.querySelectorAll('[data-i18n-title]').forEach(el => {
            el.title = t(el.dataset.i18nTitle);
        });
    }

    return {
        t,
        setLang,
        toggle,
        applyDOM,
        get lang() { return _lang; },
        get isEn() { return _lang === 'en'; },
        get isZh() { return _lang === 'zh'; },
        messages,
    };
})();
