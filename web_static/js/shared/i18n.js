/**
 * i18n.js - Modular i18n core engine
 *
 * Architecture:
 *   i18n.js        — Core engine: t(), addMessages(), setLang(), toggle(), applyDOM()
 *   i18n/*.js      — Per-module translation packs, loaded only by pages that need them
 *
 * Usage:
 *   <script src="/static/js/shared/i18n.js"></script>
 *   <script src="/static/js/shared/i18n/common.js"></script>
 *   <script src="/static/js/shared/i18n/chat.js"></script>
 *
 *   i18n.t('chat.welcome')
 *   i18n.t('chat.greeting', {name: 'Alice'})
 *   i18n.setLang('en')
 */
'use strict';

const i18n = (() => {
    const STORAGE_KEY = 'app-lang';
    const DEFAULT_LANG = 'zh';
    const messages = { zh: {}, en: {} };

    let _lang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;

    /**
     * Register translation keys for a module.
     * Called by each i18n/*.js pack file.
     * @param {Object} pack - { zh: { key: value }, en: { key: value } }
     */
    function addMessages(pack) {
        for (const lang of Object.keys(pack)) {
            if (!messages[lang]) messages[lang] = {};
            Object.assign(messages[lang], pack[lang]);
        }
    }

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

    function setLang(lang) {
        if (lang !== 'zh' && lang !== 'en') return;
        _lang = lang;
        localStorage.setItem(STORAGE_KEY, lang);
        location.reload();
    }

    function toggle() {
        setLang(_lang === 'zh' ? 'en' : 'zh');
    }

    function applyDOM(root = document) {
        root.querySelectorAll('[data-i18n]').forEach(el => {
            if (el.hasAttribute('data-i18n-html')) {
                el.innerHTML = t(el.dataset.i18n);
            } else {
                el.textContent = t(el.dataset.i18n);
            }
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
        addMessages,
        setLang,
        toggle,
        applyDOM,
        get lang() { return _lang; },
        get isEn() { return _lang === 'en'; },
        get isZh() { return _lang === 'zh'; },
        messages,   // exposed for backward compatibility
    };
})();
