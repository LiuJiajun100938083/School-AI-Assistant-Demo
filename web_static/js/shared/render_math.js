/**
 * render_math.js — 共用 LaTeX + Markdown 渲染模組
 * ================================================
 * 全局掛載: window.RenderMath
 *
 * 核心管線: 提取 LaTeX → 占位符 → marked.parse → DOMPurify → 還原 KaTeX
 *
 * 依賴 (graceful fallback):
 *   - katex     → 缺少時退回純 Markdown
 *   - marked    → 缺少時退回 escapeHtml + <br>
 *   - DOMPurify → 缺少時退回 escapeHtml
 *
 * opts:
 *   repairOcr      (default false)  修復 JSON 解析損壞的 LaTeX (\times→TAB+"imes")
 *   repairBareLatex (default true)  包裹裸露 LaTeX 如 \frac、x^2
 */
'use strict';

const RenderMath = (() => {

    // ── helpers ───────────────────────────────────────────────

    function escapeHtml(text) {
        const d = document.createElement('div');
        d.textContent = text;
        return d.innerHTML;
    }

    /** marked + DOMPurify 渲染 Markdown, 無可用時退回 escapeHtml */
    function renderMarkdown(text) {
        if (typeof marked !== 'undefined' && typeof DOMPurify !== 'undefined') {
            const html = marked.parse(text, { breaks: true });
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['svg', 'g', 'line', 'circle', 'rect', 'polygon',
                           'polyline', 'path', 'text', 'span', 'div'],
                ADD_ATTR: ['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1',
                           'x2', 'y2', 'cx', 'cy', 'r', 'points', 'd', 'fill',
                           'stroke', 'stroke-width', 'stroke-dasharray', 'transform',
                           'font-size', 'font-weight', 'text-anchor',
                           'dominant-baseline', 'opacity', 'xmlns', 'class', 'style'],
            });
        }
        return escapeHtml(text).replace(/\n/g, '<br>');
    }

    // ── plain-text table → Markdown table ─────────────────────

    function convertPlainTextTable(text) {
        const lines = text.split('\n');
        const result = [];
        let i = 0;

        while (i < lines.length) {
            const line = lines[i].trim();
            if (line) {
                const cols = line.split(/\s{2,}/).filter(c => c.trim());
                if (cols.length >= 3 && i + 1 < lines.length) {
                    const nextLine = lines[i + 1].trim();
                    const nextCols = nextLine
                        ? nextLine.split(/\s{2,}/).filter(c => c.trim())
                        : [];
                    if (nextCols.length >= 3 && Math.abs(cols.length - nextCols.length) <= 1) {
                        const maxCols = Math.max(cols.length, nextCols.length);
                        const pad = arr => { while (arr.length < maxCols) arr.push(''); return arr; };
                        const mkRow = arr => '| ' + pad([...arr]).join(' | ') + ' |';
                        const sep = '|' + Array(maxCols).fill('---').join('|') + '|';
                        const tableRows = [cols];
                        let j = i + 1;
                        while (j < lines.length) {
                            const tl = lines[j].trim();
                            if (!tl) break;
                            const tc = tl.split(/\s{2,}/).filter(c => c.trim());
                            if (tc.length >= 3 && Math.abs(tc.length - maxCols) <= 1) {
                                tableRows.push(tc);
                                j++;
                            } else {
                                break;
                            }
                        }
                        result.push(mkRow(tableRows[0]));
                        result.push(sep);
                        for (let k = 1; k < tableRows.length; k++) result.push(mkRow(tableRows[k]));
                        i = j;
                        continue;
                    }
                }
            }
            result.push(lines[i]);
            i++;
        }
        return result.join('\n');
    }

    // ── bare-LaTeX wrapper ───────────────────────────────────

    function wrapBareLatex(plainText) {
        // Pass 1: 含 \ 命令的片段
        plainText = plainText.replace(
            /([A-Za-z_]\s*=\s*)?(\d[\d.,]*\s*)?\\(text|frac|sqrt|Delta|Omega|theta|alpha|beta|gamma|omega|mu|pi|times|cdot|vec|hat|bar|neq|leq|geq|pm|mp|approx|equiv|sim|le|ge|ne|lt|gt|infty|sum|prod|int|lim|log|ln|sin|cos|tan|left|right|quad|qquad|over|not|in|forall|exists|subset|cup|cap|to|rightarrow|leftarrow)\b[^$\n,，。；]*/g,
            match => `$${match.trim()}$`,
        );
        // Pass 2: 含上標 ^ 的數學片段 (x^2, 6x^2, (-1)^2)
        plainText = plainText.replace(
            /[(\d\-]*[a-zA-Z)]+\s*\^\s*(?:\{[^}]+\}|\d+)/g,
            match => match.includes('$') ? match : `$${match.trim()}$`,
        );
        return plainText;
    }

    // ── KaTeX render helper ──────────────────────────────────

    function renderKatex(latex, displayMode) {
        try {
            let fixed = latex.trim()
                .replace(/\\begin\{tabular\}/g, '\\begin{array}')
                .replace(/\\end\{tabular\}/g, '\\end{array}');
            return katex.renderToString(fixed, {
                throwOnError: false,
                displayMode,
                trust: true,
            });
        } catch {
            return escapeHtml(latex);
        }
    }

    // ── SVG DOMPurify config ─────────────────────────────────

    const SVG_PURIFY = {
        ADD_TAGS: ['svg', 'g', 'line', 'circle', 'rect', 'polygon', 'polyline', 'path', 'text'],
        ADD_ATTR: ['viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
                   'cx', 'cy', 'r', 'points', 'd', 'fill', 'stroke', 'stroke-width',
                   'stroke-dasharray', 'transform', 'font-size', 'font-weight',
                   'text-anchor', 'dominant-baseline', 'opacity', 'xmlns'],
        FORBID_TAGS: ['script', 'style', 'foreignObject', 'image', 'img', 'iframe', 'object', 'embed', 'a'],
    };

    // ── LaTeX region patterns (order matters: env → $$ → $) ──

    const LATEX_PATTERNS = [
        { re: /\\begin\{([^}]+)\}([\s\S]*?)\\end\{\1\}/g, display: true, extract: m => m[0] },
        { re: /\$\$([\s\S]*?)\$\$/g, display: true, extract: m => m[1] },
        { re: /\$([^$]+?)\$/g, display: false, extract: m => m[1] },
    ];

    // ══════════════════════════════════════════════════════════
    // Public API
    // ══════════════════════════════════════════════════════════

    return {
        /**
         * 渲染含 LaTeX 的 Markdown 文字為安全 HTML
         *
         * @param {string} text     - 原始文字 (Markdown + LaTeX)
         * @param {Object} [opts]
         * @param {boolean} opts.repairOcr       - 修復 OCR/JSON 損壞 (default false)
         * @param {boolean} opts.repairBareLatex  - 包裹裸露 LaTeX (default true)
         * @returns {string} sanitized HTML
         */
        render(text, opts = {}) {
            if (!text) return '';

            const repairOcr = opts.repairOcr === true;
            const repairBareLatex = opts.repairBareLatex !== false;

            // ── 1. OCR 修復 (可選) ──
            if (repairOcr) {
                text = text.replace(/\t([a-zA-Z]{2,})/g, '\\t$1');
                text = text.replace(/\x08([a-zA-Z]{2,})/g, '\\b$1');
                text = text.replace(/\f([a-zA-Z]{2,})/g, '\\f$1');
                text = text.replace(/\r([a-zA-Z]{2,})/g, '\\r$1');
            }

            // ── 2. 清理 AI 思考標籤 ──
            text = text.replace(/<think>[\s\S]*?<\/think>/gi, '')
                       .replace(/<\/?think>/gi, '')
                       .trim();

            // ── 3. 保護 SVG 塊 ──
            const svgBlocks = [];
            text = text.replace(/<svg[\s\S]*?<\/svg>/gi, match => {
                svgBlocks.push(match);
                return `SVGPH${svgBlocks.length - 1}ENDSVGPH`;
            });

            // ── 4. 純文字表格 → Markdown 表格 ──
            text = convertPlainTextTable(text);

            // ── 5. 字面 \n → 換行 (保護 LaTeX \n* 命令) ──
            text = text.replace(/\\n(?!abla|e[gq]|ew|ot|otin|u(?![a-z])|i(?![a-z]))/g, '\n');

            // ── 6. 修復無效 LaTeX: \text{^\circ C} → °C ──
            text = text.replace(/\\text\{\s*\^?\s*\\circ\s*([^}]*)\}/g, '°$1');
            text = text.replace(/\^\\circ(?![a-zA-Z])/g, '°');

            // ── 7. 裸露 LaTeX 包裹 (可選) ──
            if (repairBareLatex) {
                const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+?\$)/);
                text = parts.map(part => part.startsWith('$') ? part : wrapBareLatex(part)).join('');
            }

            // ── 8. KaTeX 不可用 → 退回 Markdown ──
            if (typeof katex === 'undefined') {
                return renderMarkdown(text);
            }

            // ── 9. 提取 LaTeX 區段 ──
            const matches = [];
            for (const p of LATEX_PATTERNS) {
                const re = new RegExp(p.re.source, p.re.flags);
                let m;
                while ((m = re.exec(text)) !== null) {
                    matches.push({
                        start: m.index,
                        end: m.index + m[0].length,
                        latex: p.extract(m),
                        display: p.display,
                    });
                }
            }

            // ── 10. 排序 + 去重疊 ──
            matches.sort((a, b) => a.start - b.start);
            const filtered = [];
            let lastEnd = 0;
            for (const m of matches) {
                if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
            }

            // ── 11. 占位符替換 → Markdown → 還原 ──
            const placeholders = [];
            let mdText = '';
            let pos = 0;
            for (const m of filtered) {
                if (m.start > pos) mdText += text.substring(pos, m.start);
                const ph = `KATEXPH${placeholders.length}ENDPH`;
                placeholders.push(renderKatex(m.latex, m.display));
                mdText += ph;
                pos = m.end;
            }
            if (pos < text.length) mdText += text.substring(pos);

            let result = renderMarkdown(mdText);
            placeholders.forEach((html, i) => {
                result = result.replace(`KATEXPH${i}ENDPH`, html);
            });

            // ── 12. 還原 SVG 塊 ──
            svgBlocks.forEach((svg, i) => {
                const safe = typeof DOMPurify !== 'undefined'
                    ? DOMPurify.sanitize(svg, SVG_PURIFY)
                    : escapeHtml(svg);
                result = result.replace(`SVGPH${i}ENDSVGPH`, safe);
            });

            return result;
        },

        /**
         * 單獨渲染一段 LaTeX 為 KaTeX HTML
         * 適用於只需渲染公式、不需 Markdown 的場景
         *
         * @param {string} latex       - 原始 LaTeX (不含 $ 分隔符)
         * @param {boolean} displayMode - 行間模式 (true) 或行內 (false)
         * @returns {string} HTML 或 escaped fallback
         */
        renderLatex(latex, displayMode = true) {
            if (!latex) return '';
            if (typeof katex === 'undefined') return escapeHtml(latex);
            return renderKatex(latex, displayMode);
        },

        /**
         * 從可能含 $...$ 包裹的文字中提取並渲染所有 LaTeX
         * 適用於 OCR 輸出的混合文字
         *
         * @param {string} text - 含 $...$/$$..$$ 的文字
         * @returns {string} HTML
         */
        renderMixed(text) {
            if (!text) return '';
            if (typeof katex === 'undefined') return escapeHtml(text);

            const matches = [];
            for (const p of LATEX_PATTERNS) {
                const re = new RegExp(p.re.source, p.re.flags);
                let m;
                while ((m = re.exec(text)) !== null) {
                    matches.push({
                        start: m.index,
                        end: m.index + m[0].length,
                        latex: p.extract(m),
                        display: p.display,
                    });
                }
            }
            matches.sort((a, b) => a.start - b.start);
            const filtered = [];
            let lastEnd = 0;
            for (const m of matches) {
                if (m.start >= lastEnd) { filtered.push(m); lastEnd = m.end; }
            }

            let result = '';
            let pos = 0;
            for (const m of filtered) {
                if (m.start > pos) result += escapeHtml(text.substring(pos, m.start));
                result += renderKatex(m.latex, m.display);
                pos = m.end;
            }
            if (pos < text.length) result += escapeHtml(text.substring(pos));
            return result;
        },

        /** 工具: HTML 轉義 */
        escapeHtml,
    };
})();

window.RenderMath = RenderMath;
