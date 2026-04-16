/**
 * subject_icons.js
 * ================
 * 策問 · QUAERO — Subject SVG Icon Catalog
 *
 * 統一學科圖示：所有學科從此處查表渲染，不再使用 emoji。
 * 所有 SVG：24×24 viewBox，stroke-width 1.5，stroke-linecap/linejoin round，
 *           currentColor，與整站 editorial engraved 風格一致。
 *
 * Usage:
 *   SubjectIcon.render(iconKeyOrLegacyEmoji, 22)
 *     → returns <svg ...> HTML string
 *   SubjectIcon.catalog()
 *     → returns [{ key, label, svg }] for UI picker
 *
 * 相容舊資料：若資料庫存的是 emoji，透過 EMOJI_MAP 自動映射到 key。
 * 若是自訂 SVG（以 "<svg" 開頭），原樣返回。
 */
(function (global) {
    'use strict';

    // ══════════════════════════════════════════════════════════════
    //  ICON CATALOG — 20 核心學科 + 通用備選
    // ══════════════════════════════════════════════════════════════
    const ICONS = {
        // ── 科技 ──
        ict: {
            label: 'ICT · 電腦 / Computing',
            svg: '<path d="M6 6h12v12H6z"/><path d="M9 9h6v6H9z"/><path d="M3 9h3M3 12h3M3 15h3M18 9h3M18 12h3M18 15h3M9 3v3M12 3v3M15 3v3M9 18v3M12 18v3M15 18v3"/>'
        },
        // ── 數學 / 邏輯 ──
        math: {
            label: '數學 · Mathematics',
            svg: '<path d="M18 4H6l6 8-6 8h12"/>'
        },
        geometry: {
            label: '幾何 · Geometry',
            svg: '<circle cx="7" cy="17" r="4"/><path d="M11 6l6 10H5z"/>'
        },
        // ── 語文 ──
        chinese: {
            label: '中文 · Chinese',
            svg: '<path d="M15 3.5c-1.2 2.6-3 5.8-5.5 9-2.5 3-5.5 5.5-8 7"/><path d="M15 3.5c1.7.7 3 1.8 4 3.3-1.5 1-2.7 2-3.5 3.2"/><circle cx="3.5" cy="19.5" r="1.2" fill="currentColor"/>'
        },
        english: {
            label: 'English · 英語',
            svg: '<path d="M4 5.5c2.7-.9 5.4-.9 8 0v14c-2.6-.9-5.3-.9-8 0z"/><path d="M20 5.5c-2.7-.9-5.4-.9-8 0v14c2.6-.9 5.3-.9 8 0z"/><path d="M5.5 14l1.6-4.2 1.6 4.2M6 12.5h2.2"/><path d="M14 14v-2a1.5 1.5 0 1 1 3 0v2M14 14h3"/>'
        },
        language: {
            label: '語言 · Language',
            svg: '<path d="M4 5.5h14a2 2 0 0 1 2 2V14a2 2 0 0 1-2 2H10l-5 3.5V16a2 2 0 0 1-1-2V7.5a2 2 0 0 1 2-2z"/><path d="M8 9h8M8 12h5"/>'
        },
        literature: {
            label: '文學 · Literature',
            svg: '<path d="M4.5 5.5a2 2 0 1 1 4 0v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-13a2 2 0 1 0-4 0v1h-12"/><path d="M11 10h7M11 13h7M11 16h4"/>'
        },
        // ── 自然科學 ──
        science: {
            label: '科學 · Science',
            svg: '<path d="M8 20h8"/><path d="M10 20v-4M14 20v-4"/><circle cx="12" cy="10" r="3.5"/><path d="M12 6.5V4l3.5-1v2.5"/><path d="M10 15.5h4"/>'
        },
        physics: {
            label: '物理 · Physics',
            svg: '<circle cx="12" cy="12" r="1.5" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.5"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.5" transform="rotate(-60 12 12)"/>'
        },
        chemistry: {
            label: '化學 · Chemistry',
            svg: '<path d="M9 3h6"/><path d="M10 3v6l-5 10a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3L14 9V3"/><circle cx="9" cy="16" r="0.9" fill="currentColor"/><circle cx="14" cy="18" r="0.7" fill="currentColor"/><circle cx="11.5" cy="13.5" r="0.5" fill="currentColor"/>'
        },
        biology: {
            label: '生物 · Biology',
            svg: '<path d="M8 3c4 3 4 9 0 12M16 3c-4 3-4 9 0 12"/><path d="M8 12c4 3 4 9 0 12M16 12c-4 3-4 9 0 12"/><path d="M9 5h6M7.5 9h9M9 15h6M7.5 19h9"/>'
        },
        // ── 人文社會 ──
        history: {
            label: '歷史 · History',
            svg: '<path d="M5 3h14v2H5z"/><path d="M7 5v14M17 5v14"/><path d="M9 19V5M11.5 19V5M14.5 19V5"/><path d="M4 19h16v2H4z"/>'
        },
        geography: {
            label: '地理 · Geography',
            svg: '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4.5" ry="9"/><path d="M3 12h18"/>'
        },
        economics: {
            label: '經濟 · Economics',
            svg: '<path d="M12 3v17"/><line x1="5" y1="20" x2="19" y2="20"/><path d="M2.5 8.5l4-3.5 4 3.5"/><path d="M13.5 8.5l4-3.5 4 3.5"/><path d="M2.5 8.5c0 2.2 1.8 4 4 4s4-1.8 4-4"/><path d="M13.5 8.5c0 2.2 1.8 4 4 4s4-1.8 4-4"/>'
        },
        philosophy: {
            label: '哲學 · Philosophy',
            svg: '<path d="M4 12c0-5 3-8 8-8s8 3 8 8-3 8-8 8-8-3-8-8z"/><path d="M6.5 9c1.5 0 2.5.5 3 2M17.5 9c-1.5 0-2.5.5-3 2"/><path d="M6.5 15c1.5 0 2.5-.5 3-2M17.5 15c-1.5 0-2.5-.5-3-2"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>'
        },
        civics: {
            label: '公民 · Civics / Social',
            svg: '<path d="M4 4.5l8-2 8 2V13c0 5-4 7.5-8 8.5-4-1-8-3.5-8-8.5z"/><path d="M12 8l1.5 3 3.3.4-2.4 2.3.6 3.3-3-1.7-3 1.7.6-3.3-2.4-2.3 3.3-.4z"/>'
        },
        // ── 藝術 / 體育 ──
        art: {
            label: '美術 · Art',
            svg: '<path d="M12 3C7 3 3 7 3 12c0 2.5 1.8 4 3.8 4 1.4 0 1.7-1.3 2.5-1.3 2 0 1 3.3 3.7 3.3 4 0 6-3 6-7 0-5-4-8-9-8z"/><circle cx="7" cy="10" r="1.1" fill="currentColor"/><circle cx="11" cy="7" r="1.1" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.1" fill="currentColor"/><circle cx="17" cy="13" r="1.1" fill="currentColor"/>'
        },
        music: {
            label: '音樂 · Music',
            svg: '<circle cx="9" cy="17" r="2.5"/><path d="M11.5 17V4"/><path d="M11.5 4c2.8.5 5 2.5 5 6-.5.8-1 1.3-2 1.5"/><circle cx="16" cy="15" r="2"/><path d="M18 15V7"/>'
        },
        pe: {
            label: '體育 · Physical Ed',
            svg: '<path d="M4 11c0-5 2.5-8 8-8s8 3 8 8c0 4-3 6.5-8 6.5s-8-2.5-8-6.5z"/><path d="M6 8c1.5 0 2.5 1 3 2.5M18 8c-1.5 0-2.5 1-3 2.5"/><path d="M12 17v4M10 19l2 2 2-2"/>'
        },
        drama: {
            label: '戲劇 · Drama',
            svg: '<path d="M6 4h12v6a6 6 0 0 1-12 0z"/><circle cx="9.5" cy="8" r="0.8" fill="currentColor"/><circle cx="14.5" cy="8" r="0.8" fill="currentColor"/><path d="M9.5 11c.8 1 1.6 1.3 2.5 1.3S13.7 12 14.5 11"/><path d="M12 16v4M9 20h6"/>'
        },
        // ── 通用 ──
        books: {
            label: '書籍 · Books（預設）',
            svg: '<path d="M3 5c3-1 6-1 9 0v14c-3-1-6-1-9 0z"/><path d="M21 5c-3-1-6-1-9 0v14c3-1 6-1 9 0z"/><path d="M6 9h3M6 12h3M15 9h3M15 12h3"/>'
        },
        library: {
            label: '圖書 · Library',
            svg: '<path d="M3.5 4h5v16h-5zM10 4h5v16h-5z"/><path d="M16 5.5l4 1v13l-4 1z"/><path d="M5 8h2M5 12h2M5 16h2M11.5 8h2M11.5 12h2M11.5 16h2"/>'
        },
        compass: {
            label: '羅盤 · Compass',
            svg: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><path d="M12 7l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/>'
        },
        crest: {
            label: '徽章 · Crest',
            svg: '<path d="M4 4.5l8-2 8 2V13c0 5-4 7.5-8 8.5-4-1-8-3.5-8-8.5z"/><path d="M8 10h8M8 13h8M10 16h4"/>'
        },
    };

    // ══════════════════════════════════════════════════════════════
    //  LEGACY EMOJI → ICON KEY（向後相容舊資料）
    // ══════════════════════════════════════════════════════════════
    const EMOJI_MAP = {
        '💻': 'ict', '⌨': 'ict', '⌨️': 'ict',
        '🧮': 'math', '📐': 'geometry', '📏': 'math', '➕': 'math',
        '✏️': 'chinese', '✏': 'chinese', '🖋': 'chinese', '🖋️': 'chinese',
        '📝': 'chinese', '🖌': 'art', '🖌️': 'art',
        '📚': 'books', '📖': 'books', '📕': 'books', '📗': 'books', '📘': 'books',
        '🔬': 'science', '🧪': 'chemistry', '⚗': 'chemistry', '⚗️': 'chemistry',
        '🧬': 'biology', '🌿': 'biology', '🌱': 'biology',
        '🎨': 'art', '🎭': 'drama',
        '🎵': 'music', '🎶': 'music', '🎼': 'music',
        '🏃': 'pe', '🏃‍♂️': 'pe', '🏃‍♀️': 'pe', '⚽': 'pe',
        '🌍': 'geography', '🌐': 'geography', '🌏': 'geography', '🗺': 'geography', '🗺️': 'geography',
        '🏛': 'history', '🏛️': 'history',
        '🔭': 'physics', '⚛': 'physics', '⚛️': 'physics',
        '📜': 'literature', '📃': 'literature',
        '🤔': 'philosophy', '💭': 'philosophy',
        '💬': 'language', '🗣': 'language', '🗣️': 'language',
        '⚖': 'economics', '⚖️': 'economics', '💰': 'economics',
        '🛡': 'crest', '🛡️': 'crest',
        '🧭': 'compass',
    };

    const SVG_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';

    function isCustomSVG(input) {
        return typeof input === 'string' && input.trim().startsWith('<svg');
    }

    function resolveKey(input) {
        if (!input) return 'books';
        if (typeof input !== 'string') return 'books';
        const trimmed = input.trim();
        if (ICONS[trimmed]) return trimmed;
        if (EMOJI_MAP[trimmed] && ICONS[EMOJI_MAP[trimmed]]) return EMOJI_MAP[trimmed];
        // 嘗試 lowercase
        const low = trimmed.toLowerCase();
        if (ICONS[low]) return low;
        return 'books';
    }

    function render(input, size) {
        size = size || 22;
        if (isCustomSVG(input)) {
            // 老資料若存完整 SVG，直接放行
            return input;
        }
        const key = resolveKey(input);
        const spec = ICONS[key];
        return `<svg width="${size}" height="${size}" ${SVG_ATTRS} class="subject-icon-svg" data-icon="${key}">${spec.svg}</svg>`;
    }

    function catalog() {
        return Object.keys(ICONS).map(function (k) {
            return { key: k, label: ICONS[k].label, svg: render(k, 22) };
        });
    }

    function hasKey(k) { return !!ICONS[k]; }

    const api = {
        render: render,
        resolveKey: resolveKey,
        catalog: catalog,
        hasKey: hasKey,
        isCustomSVG: isCustomSVG,
        _icons: ICONS,
        _emojiMap: EMOJI_MAP,
    };

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    if (typeof global !== 'undefined') {
        global.SubjectIcon = api;
    }
})(typeof window !== 'undefined' ? window : this);
