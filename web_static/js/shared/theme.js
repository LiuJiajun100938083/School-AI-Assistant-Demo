'use strict';

/**
 * theme.js — 动态主题色切换引擎
 *
 * 用法：
 *   theme.apply('blue')   → 切换到蓝色主题
 *   theme.current          → 当前主题名称
 *   theme.presets           → 所有预设列表
 */

const theme = (() => {
    const STORAGE_KEY = 'app-theme';
    const DEFAULT = 'oldmoney';

    const presets = {
        oldmoney: {
            label: '老錢', labelEn: 'Old Money',
            brand: '#1B2845', brandHover: '#0F1D38', brandActive: '#000818',
            brandLight: '#E7DEC8', brandLighter: '#FAF6EE', brandBorder: 'rgba(176, 141, 87, 0.30)',
            loginGradient: 'linear-gradient(170deg, #0F1D38 0%, #1B2845 50%, #0B1530 100%)',
            splashGradient: 'linear-gradient(160deg, #0F1D38 0%, #1B2845 50%, #0B1530 100%)',
        },
        indigo: {
            label: '靛紫', labelEn: 'Indigo',
            brand: '#6366F1', brandHover: '#4F46E5', brandActive: '#4338CA',
            brandLight: '#EEF2FF', brandLighter: '#F5F7FF', brandBorder: '#C7D2FE',
            loginGradient: 'linear-gradient(170deg, #4338CA 0%, #6366F1 50%, #3730A3 100%)',
            splashGradient: 'linear-gradient(160deg, #0F0A2A 0%, #1A1145 50%, #130D38 100%)',
        },
        blue: {
            label: '科技蓝', labelEn: 'Blue',
            brand: '#2563EB', brandHover: '#1D4ED8', brandActive: '#1E40AF',
            brandLight: '#EFF6FF', brandLighter: '#F5F9FF', brandBorder: '#BFDBFE',
            loginGradient: 'linear-gradient(170deg, #1E40AF 0%, #2563EB 50%, #1E3A8A 100%)',
            splashGradient: 'linear-gradient(160deg, #0A1628 0%, #111D3A 50%, #0C1A30 100%)',
        },
        teal: {
            label: '青绿', labelEn: 'Teal',
            brand: '#0D9488', brandHover: '#0F766E', brandActive: '#115E59',
            brandLight: '#F0FDFA', brandLighter: '#F5FFFE', brandBorder: '#99F6E4',
            loginGradient: 'linear-gradient(170deg, #115E59 0%, #0D9488 50%, #134E4A 100%)',
            splashGradient: 'linear-gradient(160deg, #042F2E 0%, #0A3D3A 50%, #052E2B 100%)',
        },
        rose: {
            label: '玫红', labelEn: 'Rose',
            brand: '#F43F5E', brandHover: '#E11D48', brandActive: '#BE123C',
            brandLight: '#FFF1F2', brandLighter: '#FFF5F6', brandBorder: '#FECDD3',
            loginGradient: 'linear-gradient(170deg, #BE123C 0%, #F43F5E 50%, #9F1239 100%)',
            splashGradient: 'linear-gradient(160deg, #2A0A10 0%, #3D1118 50%, #300C12 100%)',
        },
        amber: {
            label: '琥珀', labelEn: 'Amber',
            brand: '#F59E0B', brandHover: '#D97706', brandActive: '#B45309',
            brandLight: '#FFFBEB', brandLighter: '#FFFDF5', brandBorder: '#FDE68A',
            loginGradient: 'linear-gradient(170deg, #B45309 0%, #F59E0B 50%, #92400E 100%)',
            splashGradient: 'linear-gradient(160deg, #2A1A05 0%, #3D2508 50%, #301E06 100%)',
        },
    };

    let _current = localStorage.getItem(STORAGE_KEY) || DEFAULT;
    if (!presets[_current]) _current = DEFAULT;
    // v5 遷移：舊預設 'indigo' 是 auto-default，非用戶主動選擇 → 升級到 oldmoney
    if (_current === 'indigo' && !localStorage.getItem(STORAGE_KEY + '-manual')) {
        _current = 'oldmoney';
        localStorage.setItem(STORAGE_KEY, 'oldmoney');
    }

    function apply(name) {
        const p = presets[name];
        if (!p) return;
        _current = name;
        localStorage.setItem(STORAGE_KEY, name);

        const root = document.documentElement.style;
        root.setProperty('--brand', p.brand);
        root.setProperty('--brand-hover', p.brandHover);
        root.setProperty('--brand-active', p.brandActive);
        root.setProperty('--brand-light', p.brandLight);
        root.setProperty('--brand-lighter', p.brandLighter);
        root.setProperty('--brand-border', p.brandBorder);
        root.setProperty('--text-link', p.brand);
        root.setProperty('--border-focus', p.brand);
        root.setProperty('--primary', p.brand);
        root.setProperty('--login-gradient', p.loginGradient);
        root.setProperty('--splash-gradient', p.splashGradient);

        // Update active indicator on theme picker dots
        document.querySelectorAll('.theme-dot').forEach(dot => {
            dot.classList.toggle('active', dot.dataset.theme === name);
        });
    }

    // Apply immediately on load
    apply(_current);

    return {
        apply,
        get current() { return _current; },
        presets,
    };
})();
