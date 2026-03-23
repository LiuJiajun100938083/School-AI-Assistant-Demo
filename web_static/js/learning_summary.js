/**
 * learning_summary.js - 學習總結功能模組
 *
 * 職責：管理對話總結和思維導圖生成功能
 *
 * 架構說明：
 * - LearningSummaryManager: 主管理類，協調各組件
 * - SummaryRenderer: 負責知識點總結的渲染
 * - MindmapRenderer: 負責思維導圖的渲染
 *
 * @version 1.0.0
 * @author AI Learning Partner Team
 */

'use strict';

/* ========== 常量定義 ========== */

const SUMMARY_CONFIG = {
    API_ENDPOINT: '/api/summary',
    MIN_MESSAGES_FOR_SUMMARY: 2,
    MARKMAP_CDN: 'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.15',
    TABS: {
        SUMMARY: 'summary',
        MINDMAP: 'mindmap'
    },
    LOADING_TIMEOUT: 60000 // 60秒超時
};

const SUMMARY_MESSAGES = {
    NO_CONVERSATION: i18n.t('summary.noConversation'),
    NO_MESSAGES: i18n.t('summary.insufficientMsg'),
    LOADING: i18n.t('summary.generating'),
    ERROR: i18n.t('summary.generationFailed'),
    SUCCESS: i18n.t('summary.generated')
};

/* ========== 工具函數 ========== */

/**
 * 安全地獲取DOM元素
 * @param {string} selector - CSS選擇器
 * @returns {Element|null}
 */
function $(selector) {
    return document.querySelector(selector);
}

/**
 * 建立DOM元素
 * @param {string} tag - 標籤名
 * @param {Object} attrs - 屬性物件
 * @param {string|Element|Array} children - 子元素
 * @returns {Element}
 */
function createElement(tag, attrs = {}, children = null) {
    const element = document.createElement(tag);

    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                element.dataset[dataKey] = dataValue;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            element.addEventListener(key.slice(2).toLowerCase(), value);
        } else {
            element.setAttribute(key, value);
        }
    });

    if (children) {
        if (Array.isArray(children)) {
            children.forEach(child => {
                if (typeof child === 'string') {
                    element.appendChild(document.createTextNode(child));
                } else if (child instanceof Element) {
                    element.appendChild(child);
                }
            });
        } else if (typeof children === 'string') {
            element.innerHTML = children;
        } else if (children instanceof Element) {
            element.appendChild(children);
        }
    }

    return element;
}

/* ========== SummaryRenderer 類 ========== */

/**
 * 知識點總結渲染器
 * 負責將Markdown格式的總結渲染為HTML
 */
class SummaryRenderer {
    constructor() {
        this.container = null;
    }

    /**
     * 設定渲染容器
     * @param {Element} container - DOM容器元素
     */
    setContainer(container) {
        this.container = container;
    }

    /**
     * 渲染Markdown內容
     * @param {string} markdown - Markdown格式的總結內容
     */
    render(markdown) {
        if (!this.container) {
            console.error('SummaryRenderer: container not set');
            return;
        }

        // 先處理表格，再進行其他格式化
        let html = this.parseMarkdownTables(markdown);
        html = this.formatMarkdown(html);

        this.container.innerHTML = html;

        // 渲染數學公式（MathJax）
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([this.container]).catch(() => {});
        }

        // 高亮代碼塊
        this.highlightCode();
    }

    /**
     * 解析Markdown表格
     * @param {string} markdown - Markdown文本
     * @returns {string} 處理後的文本
     */
    parseMarkdownTables(markdown) {
        const lines = markdown.split('\n');
        let result = [];
        let tableLines = [];
        let inTable = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const isTableLine = line.trim().startsWith('|') && line.trim().endsWith('|');
            const isSeparatorLine = /^\|[\s\-:|]+\|$/.test(line.trim());

            if (isTableLine || isSeparatorLine) {
                if (!inTable) {
                    inTable = true;
                    tableLines = [];
                }
                tableLines.push(line);
            } else {
                if (inTable) {
                    // 結束表格，轉換為HTML
                    result.push(this.convertTableToHtml(tableLines));
                    tableLines = [];
                    inTable = false;
                }
                result.push(line);
            }
        }

        // 處理末尾的表格
        if (inTable && tableLines.length > 0) {
            result.push(this.convertTableToHtml(tableLines));
        }

        return result.join('\n');
    }

    /**
     * 將Markdown表格轉換為HTML
     * @param {Array} lines - 表格行陣列
     * @returns {string} HTML表格
     */
    convertTableToHtml(lines) {
        if (lines.length < 2) return lines.join('\n');

        let html = '<div class="summary-table-wrapper"><table class="summary-table">';

        lines.forEach((line, index) => {
            // 跳過分隔行
            if (/^\|[\s\-:|]+\|$/.test(line.trim())) return;

            const cells = line.split('|').filter(cell => cell.trim() !== '');
            const tag = index === 0 ? 'th' : 'td';
            const rowTag = index === 0 ? 'thead' : (index === 1 ? 'tbody' : '');

            if (rowTag === 'thead') html += '<thead>';
            if (rowTag === 'tbody') html += '<tbody>';

            html += '<tr>';
            cells.forEach(cell => {
                html += `<${tag}>${cell.trim()}</${tag}>`;
            });
            html += '</tr>';

            if (index === 0) html += '</thead>';
        });

        html += '</tbody></table></div>';
        return html;
    }

    /**
     * 格式化Markdown為HTML
     * @param {string} markdown - Markdown文本
     * @returns {string} HTML字串
     */
    formatMarkdown(markdown) {
        // 使用主應用的方法（如果存在且可用）
        if (window.app && typeof window.app.formatTextWithMath === 'function') {
            try {
                return window.app.formatTextWithMath(markdown);
            } catch (e) {
                console.warn('formatTextWithMath failed, using fallback');
            }
        }

        // 後備方案
        return this.simpleMarkdownToHtml(markdown);
    }

    /**
     * 簡單的Markdown轉HTML（後備方案）
     * @param {string} markdown - Markdown文本
     * @returns {string} HTML字串
     */
    simpleMarkdownToHtml(markdown) {
        let html = markdown
            // 標題
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // 粗體和斜體
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // 代碼
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        // 處理列表
        const lines = html.split('\n');
        let result = [];
        let inList = false;
        let listType = '';

        for (const line of lines) {
            const ulMatch = line.match(/^\s*[-*]\s+(.*)$/);
            const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);

            if (ulMatch) {
                if (!inList || listType !== 'ul') {
                    if (inList) result.push(`</${listType}>`);
                    result.push('<ul>');
                    inList = true;
                    listType = 'ul';
                }
                result.push(`<li>${ulMatch[1]}</li>`);
            } else if (olMatch) {
                if (!inList || listType !== 'ol') {
                    if (inList) result.push(`</${listType}>`);
                    result.push('<ol>');
                    inList = true;
                    listType = 'ol';
                }
                result.push(`<li>${olMatch[1]}</li>`);
            } else {
                if (inList) {
                    result.push(`</${listType}>`);
                    inList = false;
                    listType = '';
                }
                // 段落處理
                if (line.trim() && !line.startsWith('<')) {
                    result.push(`<p>${line}</p>`);
                } else {
                    result.push(line);
                }
            }
        }
        if (inList) result.push(`</${listType}>`);

        return result.join('\n')
            // 清理空段落
            .replace(/<p>\s*<\/p>/g, '')
            .replace(/<p>(<h\d>)/g, '$1')
            .replace(/(<\/h\d>)<\/p>/g, '$1');
    }

    /**
     * 高亮代碼塊
     */
    highlightCode() {
        if (typeof Prism !== 'undefined') {
            this.container.querySelectorAll('pre code').forEach(block => {
                Prism.highlightElement(block);
            });
        }
    }

    /**
     * 顯示載入狀態
     */
    showLoading() {
        if (this.container) {
            this.container.innerHTML = `
                <div class="summary-loading">
                    <div class="summary-loading-spinner"></div>
                    <p>${SUMMARY_MESSAGES.LOADING}</p>
                </div>
            `;
        }
    }

    /**
     * 顯示錯誤訊息
     * @param {string} message - 錯誤訊息
     */
    showError(message) {
        if (this.container) {
            this.container.innerHTML = `
                <div class="summary-error">
                    <span class="summary-error-icon">⚠️</span>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    /**
     * 清空內容
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

/* ========== MindmapRenderer 類 ========== */

/**
 * 思維導圖渲染器
 * 使用Markmap庫渲染互動式思維導圖
 */
class MindmapRenderer {
    constructor() {
        this.container = null;
        this.markmapLoaded = false;
        this.currentMindmap = null;
    }

    /**
     * 設定渲染容器
     * @param {Element} container - DOM容器元素
     */
    setContainer(container) {
        this.container = container;
    }

    /**
     * 渲染思維導圖
     * @param {string} markmapData - Markdown格式的思維導圖資料
     */
    async render(markmapData) {
        if (!this.container) {
            console.error('MindmapRenderer: container not set');
            return;
        }

        console.log('MindmapRenderer: starting render');

        // 清空容器
        this.container.innerHTML = '';

        try {
            // 嘗試載入Markmap庫
            const loaded = await this.loadMarkmapLibs();

            if (loaded && window.markmap) {
                // 使用Markmap渲染
                await this.renderWithMarkmap(markmapData);
            } else {
                // 使用後備方案
                console.log('MindmapRenderer: using fallback renderer');
                this.renderFallback(markmapData);
            }
        } catch (error) {
            console.error('MindmapRenderer: render failed', error);
            // 出錯時使用後備方案
            this.renderFallback(markmapData);
        }
    }

    /**
     * 載入Markmap相關庫（需要同時載入d3、markmap-lib、markmap-view）
     * @returns {Promise<boolean>}
     */
    async loadMarkmapLibs() {
        // 檢查是否已載入
        if (window.markmap && window.markmap.Markmap && window.markmap.Transformer) {
            return true;
        }

        // 需要按順序載入的腳本
        const scripts = [
            'https://cdn.jsdelivr.net/npm/d3@7',
            'https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4',
            'https://cdn.jsdelivr.net/npm/markmap-view@0.15.4'
        ];

        for (const src of scripts) {
            const loaded = await this.loadScript(src);
            if (!loaded) {
                console.warn(`MindmapRenderer: failed to load - ${src}`);
                return false;
            }
        }

        console.log('MindmapRenderer: all Markmap libs loaded');
        return true;
    }

    /**
     * 載入單個腳本
     * @param {string} src - 腳本URL
     * @returns {Promise<boolean>}
     */
    loadScript(src) {
        return new Promise((resolve) => {
            // 檢查是否已成功載入（標記 data-loaded）
            const existing = document.querySelector(`script[src="${src}"]`);
            if (existing) {
                if (existing.dataset.loaded === 'true') {
                    resolve(true);
                } else if (existing.dataset.loaded === 'false') {
                    // 前一次載入失敗，移除後重試
                    existing.remove();
                } else {
                    // 正在載入中，等待
                    existing.addEventListener('load', () => resolve(true));
                    existing.addEventListener('error', () => resolve(false));
                    return;
                }
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = () => { script.dataset.loaded = 'true'; resolve(true); };
            script.onerror = () => { script.dataset.loaded = 'false'; resolve(false); };
            document.head.appendChild(script);

            // 15 秒超時
            setTimeout(() => {
                if (!script.dataset.loaded) {
                    script.dataset.loaded = 'false';
                    resolve(false);
                }
            }, 15000);
        });
    }

    /**
     * 使用Markmap渲染
     * @param {string} markmapData - Markdown資料
     */
    /**
     * 預處理思維導圖資料：簡化 LaTeX 公式以適合節點顯示
     * 將 $...$ 和 $$...$$ 內的 LaTeX 轉為更可讀的 Unicode 文字
     * @param {string} data - 原始 Markdown 思維導圖資料
     * @returns {string}
     */
    preprocessMindmapData(data) {
        // LaTeX 命令 → Unicode 映射
        const latexToUnicode = {
            '\\alpha': 'α', '\\beta': 'β', '\\gamma': 'γ', '\\delta': 'δ',
            '\\epsilon': 'ε', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ',
            '\\pi': 'π', '\\sigma': 'σ', '\\tau': 'τ', '\\phi': 'φ',
            '\\omega': 'ω', '\\Omega': 'Ω', '\\Delta': 'Δ', '\\Sigma': 'Σ',
            '\\infty': '∞', '\\approx': '≈', '\\neq': '≠', '\\leq': '≤',
            '\\geq': '≥', '\\pm': '±', '\\times': '×', '\\div': '÷',
            '\\cdot': '·', '\\rightarrow': '→', '\\leftarrow': '←',
            '\\Rightarrow': '⇒', '\\sqrt': '√', '\\propto': '∝',
        };

        return data.replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (match, display, inline) => {
            let formula = (display || inline).trim();

            // 替換 \frac{a}{b} → a/b
            formula = formula.replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1/$2)');

            // 替換 \sqrt{x} → √(x)  和  \sqrt[n]{x} → ⁿ√(x)
            formula = formula.replace(/\\sqrt\[([^\]]+)\]\{([^}]+)\}/g, '$1√($2)');
            formula = formula.replace(/\\sqrt\{([^}]+)\}/g, '√($1)');

            // 替換 x^{2} → x²  (常見上標)
            const superscripts = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', 'n': 'ⁿ', '+': '⁺', '-': '⁻' };
            formula = formula.replace(/\^{([^}]+)}/g, (m, exp) => {
                if (exp.length === 1 && superscripts[exp]) return superscripts[exp];
                return '^(' + exp + ')';
            });
            formula = formula.replace(/\^([0-9n])/g, (m, c) => superscripts[c] || ('^' + c));

            // 替換 x_{n} → x_n  (下標簡化)
            const subscripts = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', 'a': 'ₐ', 'c': '꜀', 'e': 'ₑ', 'g': 'ᵍ', 'n': 'ₙ', 'o': 'ₒ' };
            formula = formula.replace(/_{([^}]+)}/g, (m, sub) => {
                if (sub.length === 1 && subscripts[sub]) return subscripts[sub];
                return '_(' + sub + ')';
            });
            formula = formula.replace(/_([0-9a-z])/g, (m, c) => subscripts[c] || ('_' + c));

            // 替換 Greek 字母和符號
            for (const [cmd, char] of Object.entries(latexToUnicode)) {
                // 使用word boundary避免部分匹配
                formula = formula.replace(new RegExp(cmd.replace(/\\/g, '\\\\') + '(?![a-zA-Z])', 'g'), char);
            }

            // 清理剩餘 LaTeX 命令
            formula = formula.replace(/\\(?:text|mathrm|mathbf|textbf)\{([^}]+)\}/g, '$1');
            formula = formula.replace(/\\(?:left|right|,|;|!|quad|qquad)/g, ' ');
            formula = formula.replace(/\{|\}/g, '');
            formula = formula.replace(/\s+/g, ' ').trim();

            return formula;
        });
    }

    async renderWithMarkmap(markmapData) {
        // 使用固定尺寸避免隱藏面板時獲取不到尺寸的問題
        const FIXED_WIDTH = 800;
        const FIXED_HEIGHT = 600;

        // 預處理：將 LaTeX 轉為 Unicode 可讀文字
        markmapData = this.preprocessMindmapData(markmapData);

        // 建立包裝容器
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `width: 100%; height: 100%; min-height: ${FIXED_HEIGHT}px; position: relative; background: #fff; border-radius: 12px; overflow: visible; touch-action: none;`;
        this.container.appendChild(wrapper);

        // 建立SVG元素，使用固定尺寸和viewBox
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'mindmap-svg-' + Date.now());
        svg.setAttribute('width', FIXED_WIDTH);
        svg.setAttribute('height', FIXED_HEIGHT);
        svg.setAttribute('viewBox', `0 0 ${FIXED_WIDTH} ${FIXED_HEIGHT}`);
        svg.style.cssText = 'width: 100%; height: 100%; display: block; touch-action: none; cursor: grab;';
        wrapper.appendChild(svg);

        // 阻止父容器的捲動事件干擾拖曳
        wrapper.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
        wrapper.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });

        try {
            const { Transformer } = window.markmap;
            const { Markmap } = window.markmap;
            const d3 = window.d3;

            // 建立transformer並轉換資料
            const transformer = new Transformer();
            const { root, features } = transformer.transform(markmapData);

            console.log('MindmapRenderer: using fixed dimensions', { width: FIXED_WIDTH, height: FIXED_HEIGHT });

            // 在建立markmap之前，先用D3選擇SVG並設定初始zoom狀態
            const svgSelection = d3.select(svg);
            const initialTransform = d3.zoomIdentity
                .translate(FIXED_WIDTH / 4, FIXED_HEIGHT / 2)
                .scale(0.7);

            // 預先設定__zoom屬性，防止markmap在建立時讀取到undefined
            svgSelection.property('__zoom', initialTransform);

            // 建立思維導圖
            // 關鍵：duration設為0禁用初始動畫，避免NaN問題
            const mm = Markmap.create(svg, {
                autoFit: false,  // 禁用自動適配
                duration: 0,     // 禁用初始動畫，防止NaN
                maxWidth: 280,
                paddingX: 20,
                spacingHorizontal: 80,
                spacingVertical: 10,
                zoom: true,
                pan: true,
                initialExpandLevel: 3
            }, root);

            // 保存實例引用
            this.currentMindmap = mm;
            this.pendingFit = false;

            // 獲取g元素並應用保護和初始變換
            const g = svgSelection.select('g');
            if (g && g.node()) {
                // 先應用transform保護
                this.patchTransformProtection(g);

                // 設定初始變換
                g.attr('transform', initialTransform.toString());

                // 再次確保__zoom狀態同步
                svgSelection.property('__zoom', initialTransform);

                console.log('MindmapRenderer: initial transform set', initialTransform.toString());

                // 重新綁定zoom行為，確保它使用正確的初始狀態
                this.setupZoomBehavior(svgSelection, g, FIXED_WIDTH, FIXED_HEIGHT);
            }

            // 稍後啟用動畫效果
            setTimeout(() => {
                if (this.currentMindmap && this.currentMindmap.options) {
                    this.currentMindmap.options.duration = 500;
                    console.log('MindmapRenderer: animation enabled');
                }
            }, 200);

            console.log('MindmapRenderer: Markmap render success');
        } catch (error) {
            console.error('MindmapRenderer: Markmap render error', error);
            // 清空並使用後備方案
            this.container.innerHTML = '';
            this.renderFallback(markmapData);
        }
    }

    /**
     * 設定自定義的zoom行為
     * @param {d3.Selection} svgSelection - SVG的D3選擇器
     * @param {d3.Selection} g - g元素的D3選擇器
     * @param {number} width - SVG寬度
     * @param {number} height - SVG高度
     */
    setupZoomBehavior(svgSelection, g, width, height) {
        const d3 = window.d3;
        if (!d3 || !d3.zoom) {
            console.warn('MindmapRenderer: D3 zoom unavailable');
            return;
        }

        // 獲取當前的transform狀態
        const currentTransform = svgSelection.property('__zoom') || d3.zoomIdentity;

        // 建立新的zoom行為
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])  // 限制縮放範圍
            .on('zoom', (event) => {
                // 驗證transform是否有效
                const t = event.transform;
                if (t && isFinite(t.x) && isFinite(t.y) && isFinite(t.k) && t.k > 0) {
                    g.attr('transform', t.toString());
                } else {
                    console.warn('MindmapRenderer: blocked invalid zoom event', t);
                }
            });

        // 移除舊的zoom監聽器，添加新的
        svgSelection
            .on('.zoom', null)  // 移除舊的zoom事件
            .call(zoom)
            .call(zoom.transform, currentTransform);  // 應用當前transform

        console.log('MindmapRenderer: custom zoom behavior set');
    }

    /**
     * 當面板變為可見時呼叫fit
     */
    fitWhenVisible() {
        if (this.currentMindmap && this.pendingFit) {
            // 使用requestAnimationFrame確保DOM已渲染
            requestAnimationFrame(() => {
                // 額外延遲確保容器完全可見
                setTimeout(() => {
                    try {
                        if (!this.currentMindmap || !this.currentMindmap.svg) {
                            console.warn('MindmapRenderer: mindmap instance invalid');
                            return;
                        }

                        const svgNode = this.currentMindmap.svg.node();
                        if (!svgNode) {
                            console.warn('MindmapRenderer: SVG node not found');
                            return;
                        }

                        // 檢查SVG是否有有效尺寸
                        const rect = svgNode.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) {
                            console.warn('MindmapRenderer: SVG container size invalid, skipping fit', rect);
                            // 保持pendingFit為true，下次再試
                            return;
                        }

                        // 檢查是否可見（不在隱藏的父元素中）
                        if (rect.width < 10 || rect.height < 10) {
                            console.warn('MindmapRenderer: SVG container too small, may not be fully visible');
                            return;
                        }

                        // 安全呼叫fit
                        if (this.currentMindmap.fit) {
                            this.currentMindmap.fit();
                            this.pendingFit = false;
                            console.log('MindmapRenderer: fit done', { width: rect.width, height: rect.height });
                        }
                    } catch (e) {
                        console.warn('MindmapRenderer: fit failed', e);
                        // 出錯時標記為已完成，避免重複嘗試
                        this.pendingFit = false;
                    }
                }, 200);  // 增加延遲到200ms
            });
        }
    }

    /**
     * 為g元素添加transform保護，防止NaN值被設定
     * @param {d3.Selection} gSelection - D3選擇器
     */
    patchTransformProtection(gSelection) {
        if (!gSelection || !gSelection.node()) return;

        const gNode = gSelection.node();
        const originalSetAttribute = gNode.setAttribute.bind(gNode);
        let lastValidTransform = gNode.getAttribute('transform') || 'translate(0,0) scale(1)';

        // 包裝setAttribute方法，驗證transform值
        gNode.setAttribute = function(name, value) {
            if (name === 'transform') {
                // 確保value是字串類型
                let strValue;
                if (typeof value === 'string') {
                    strValue = value;
                } else if (value && typeof value.toString === 'function') {
                    // D3 transform物件有toString方法
                    strValue = value.toString();
                } else {
                    // 無法轉換，使用上次有效值
                    console.warn('MindmapRenderer: invalid transform value type:', typeof value);
                    return originalSetAttribute.call(this, name, lastValidTransform);
                }

                // 檢查是否包含NaN或Infinity
                if (strValue.includes('NaN') || strValue.includes('Infinity')) {
                    console.warn('MindmapRenderer: blocked invalid transform value:', strValue);
                    return originalSetAttribute.call(this, name, lastValidTransform);
                }

                // 驗證translate和scale的值
                const translateMatch = strValue.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)/);
                const scaleMatch = strValue.match(/scale\(([-\d.e]+)\)/);

                if (translateMatch) {
                    const x = parseFloat(translateMatch[1]);
                    const y = parseFloat(translateMatch[2]);
                    if (!isFinite(x) || !isFinite(y)) {
                        console.warn('MindmapRenderer: detected invalid translate coordinates:', { x, y });
                        return originalSetAttribute.call(this, name, lastValidTransform);
                    }
                }

                if (scaleMatch) {
                    const s = parseFloat(scaleMatch[1]);
                    if (!isFinite(s) || s <= 0) {
                        console.warn('MindmapRenderer: detected invalid scale value:', s);
                        return originalSetAttribute.call(this, name, lastValidTransform);
                    }
                }

                // 值有效，保存並應用
                lastValidTransform = strValue;
                // 使用字串值設定屬性
                return originalSetAttribute.call(this, name, strValue);
            }
            return originalSetAttribute.call(this, name, value);
        };

        console.log('MindmapRenderer: transform protection enabled');
    }

    /**
     * 後備渲染方案（純CSS樹形結構）
     * @param {string} markmapData - Markdown格式資料
     */
    renderFallback(markmapData) {
        if (!this.container) return;

        console.log('MindmapRenderer: using fallback tree render');

        // 解析Markdown為層級結構
        const lines = markmapData.split('\n').filter(line => line.trim());
        let html = '<div class="mindmap-fallback"><div class="mindmap-tree">';

        // 顏色配置
        const levelColors = ['#006633', '#2E7D32', '#43A047', '#66BB6A', '#81C784'];
        const levelIcons = ['●', '◆', '▸', '•', '◦'];

        lines.forEach(line => {
            // 計算層級
            const hashMatch = line.match(/^#+/);
            const listMatch = line.match(/^(\s*)([-*])/);

            let level = 0;
            if (hashMatch) {
                level = hashMatch[0].length - 1; // # = 0, ## = 1, etc.
            } else if (listMatch) {
                level = Math.floor(listMatch[1].length / 2) + 2; // 縮排決定層級
            }

            // 提取文本
            const text = line.replace(/^[#\s*-]+/, '').trim();

            if (text) {
                const color = levelColors[Math.min(level, levelColors.length - 1)];
                const icon = levelIcons[Math.min(level, levelIcons.length - 1)];
                const fontSize = Math.max(14, 18 - level * 2);
                const fontWeight = level === 0 ? '600' : (level === 1 ? '500' : '400');

                html += `
                    <div class="mindmap-tree-node" style="padding-left: ${level * 24}px;">
                        <span class="mindmap-tree-icon" style="color: ${color}">${icon}</span>
                        <span class="mindmap-tree-text" style="font-size: ${fontSize}px; font-weight: ${fontWeight}; color: ${level === 0 ? color : 'inherit'}">
                            ${this.escapeHtml(text)}
                        </span>
                    </div>
                `;
            }
        });

        html += '</div></div>';
        this.container.innerHTML = html;

        // 渲染數學公式（MathJax）
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([this.container]).catch(() => {});
        }
    }

    /**
     * HTML轉義
     * @param {string} text - 原始文本
     * @returns {string} 轉義後的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 顯示載入狀態
     */
    showLoading() {
        if (this.container) {
            this.container.innerHTML = `
                <div class="mindmap-loading">
                    <div class="summary-loading-spinner"></div>
                    <p>${i18n.t('summary.generating')}</p>
                </div>
            `;
        }
    }

    /**
     * 顯示錯誤訊息
     * @param {string} message - 錯誤訊息
     */
    showError(message) {
        if (this.container) {
            this.container.innerHTML = `
                <div class="mindmap-error">
                    <span class="summary-error-icon">⚠️</span>
                    <p>${message}</p>
                </div>
            `;
        }
    }

    /**
     * 清空內容
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.currentMindmap = null;
        this.pendingFit = false;
    }
}

/* ========== LearningSummaryManager 類 ========== */

/**
 * 學習總結管理器
 * 主類，協調UI、渲染器和API呼叫
 */
class LearningSummaryManager {
    /**
     * @param {Object} app - 主應用實例引用
     */
    constructor(app) {
        this.app = app;
        this.modal = null;
        this.summaryBtn = null;
        this.currentTab = SUMMARY_CONFIG.TABS.SUMMARY;
        this.summaryData = null;

        // 渲染器實例
        this.summaryRenderer = new SummaryRenderer();
        this.mindmapRenderer = new MindmapRenderer();

        // 初始化
        this.init();
    }

    /**
     * 初始化組件
     */
    init() {
        this.createButton();
        this.createModal();
        this.bindEvents();
    }

    /**
     * 建立總結按鈕
     */
    createButton() {
        const inputRow = $('.input-toolbar') || $('.input-row');
        if (!inputRow) {
            console.error('Cannot find .input-toolbar element');
            return;
        }

        // 建立總結按鈕（SVG icon + label，與 toolbar-btn 風格統一）
        this.summaryBtn = createElement('button', {
            id: 'summaryButton',
            className: 'toolbar-btn summary-button',
            title: i18n.t('summary.btnTooltip')
        });
        this.summaryBtn.innerHTML =
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
            '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
            '<polyline points="14 2 14 8 20 8"/>' +
            '<line x1="16" y1="13" x2="8" y2="13"/>' +
            '<line x1="16" y1="17" x2="8" y2="17"/>' +
            '<polyline points="10 9 9 9 8 9"/>' +
            '</svg>' +
            '<span class="toolbar-btn-label">' + i18n.t('summary.btnLabel') + '</span>';

        // 插入到發送按鈕之前
        const sendButton = $('#sendButton');
        if (sendButton) {
            inputRow.insertBefore(this.summaryBtn, sendButton);
        } else {
            inputRow.appendChild(this.summaryBtn);
        }
    }

    /**
     * 建立模態框
     */
    createModal() {
        // 建立模態框overlay
        this.modal = createElement('div', {
            id: 'summaryModal',
            className: 'summary-modal-overlay'
        });

        // 模態框內容
        const modalContent = `
            <div class="summary-modal">
                <div class="summary-modal-header">
                    <h2 class="summary-modal-title">
                        <svg class="summary-title-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                        </svg>
                        ${i18n.t('summary.title')}
                    </h2>
                    <button class="summary-modal-close" id="closeSummaryModal">&times;</button>
                </div>

                <div class="summary-tabs">
                    <button class="summary-tab active" data-tab="${SUMMARY_CONFIG.TABS.SUMMARY}">
                        <svg class="summary-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                        </svg>
                        ${i18n.t('summary.tabSummary')}
                    </button>
                    <button class="summary-tab" data-tab="${SUMMARY_CONFIG.TABS.MINDMAP}">
                        <svg class="summary-tab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="12" r="3"/><path d="M12 2v4"/><path d="M12 18v4"/><path d="M4.93 4.93l2.83 2.83"/><path d="M16.24 16.24l2.83 2.83"/><path d="M2 12h4"/><path d="M18 12h4"/><path d="M4.93 19.07l2.83-2.83"/><path d="M16.24 7.76l2.83-2.83"/>
                        </svg>
                        ${i18n.t('summary.tabMindmap')}
                    </button>
                </div>

                <div class="summary-content">
                    <div class="summary-panel active" id="summaryPanel">
                        <div class="summary-panel-content" id="summaryContent">
                            <div class="summary-placeholder">
                                <p>${i18n.t('summary.clickGenSummary')}</p>
                            </div>
                        </div>
                    </div>
                    <div class="summary-panel" id="mindmapPanel">
                        <div class="summary-panel-content mindmap-container" id="mindmapContent">
                            <div class="summary-placeholder">
                                <p>${i18n.t('summary.clickGenMindmap')}</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="summary-modal-footer">
                    <div class="export-dropdown" id="exportDropdown">
                        <button class="summary-action-btn secondary" id="exportSummaryBtn">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <polyline points="7 10 12 15 17 10"/>
                                <line x1="12" y1="15" x2="12" y2="3"/>
                            </svg>
                            ${i18n.t('summary.export')}
                            <svg class="export-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                        </button>
                        <div class="export-menu" id="exportMenu">
                            <button class="export-menu-item" data-export="word">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                                </svg>
                                ${i18n.t('summary.exportWord')}
                            </button>
                            <button class="export-menu-item" data-export="pdf">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="15" x2="15" y2="15"/>
                                </svg>
                                ${i18n.t('summary.exportPdf')}
                            </button>
                            <button class="export-menu-item" data-export="image">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                                </svg>
                                ${i18n.t('summary.exportImage')}
                            </button>
                        </div>
                    </div>
                    <button class="summary-action-btn primary" id="generateSummaryBtn">
                        ${i18n.t('summary.generate')}
                    </button>
                </div>
            </div>
        `;

        this.modal.innerHTML = modalContent;
        this.modal.style.display = 'none';
        document.body.appendChild(this.modal);

        // 設定渲染器容器
        this.summaryRenderer.setContainer($('#summaryContent'));
        this.mindmapRenderer.setContainer($('#mindmapContent'));
    }

    /**
     * 綁定事件
     */
    bindEvents() {
        // 開啟模態框
        if (this.summaryBtn) {
            this.summaryBtn.addEventListener('click', () => this.show());
        }

        // 關閉模態框
        const closeBtn = $('#closeSummaryModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // 點擊overlay關閉
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }

        // Tab切換
        const tabs = this.modal?.querySelectorAll('.summary-tab');
        tabs?.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // 生成按鈕
        const generateBtn = $('#generateSummaryBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateSummary());
        }

        // 導出按鈕下拉選單
        const exportBtn = $('#exportSummaryBtn');
        const exportMenu = $('#exportMenu');
        if (exportBtn && exportMenu) {
            exportBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                exportMenu.classList.toggle('show');
            });
            exportMenu.querySelectorAll('.export-menu-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    exportMenu.classList.remove('show');
                    this.exportSummary(item.dataset.export);
                });
            });
            // 點擊外部關閉
            document.addEventListener('click', () => exportMenu.classList.remove('show'));
        }

        // ESC鍵關閉
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * 切換Tab
     * @param {string} tabName - Tab名稱
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // 更新Tab樣式
        const tabs = this.modal?.querySelectorAll('.summary-tab');
        tabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // 更新面板顯示
        const panels = this.modal?.querySelectorAll('.summary-panel');
        panels?.forEach(panel => {
            const panelTab = panel.id === 'summaryPanel' ?
                SUMMARY_CONFIG.TABS.SUMMARY : SUMMARY_CONFIG.TABS.MINDMAP;
            panel.classList.toggle('active', panelTab === tabName);
        });

        // 切換到思維導圖面板時，執行fit操作
        if (tabName === SUMMARY_CONFIG.TABS.MINDMAP) {
            this.mindmapRenderer.fitWhenVisible();
        }
    }

    /**
     * 收集當前對話的訊息
     * @returns {Array} 訊息陣列
     */
    collectMessages() {
        const messages = [];
        const container = $('#messagesContainer');

        if (!container) {
            console.warn('collectMessages: message container not found');
            return messages;
        }

        // 遍歷訊息元素
        // 實際DOM結構:
        // - .message.user > .message-bubble (使用者訊息內容直接在bubble中)
        // - .message.assistant > .message-bubble > .answer-content (AI回覆內容)
        const messageElements = container.querySelectorAll('.message.user, .message.assistant');

        messageElements.forEach(msgEl => {
            const isUser = msgEl.classList.contains('user');
            let content = '';

            if (isUser) {
                // 使用者訊息：內容在 .message-bubble 中
                const bubbleEl = msgEl.querySelector('.message-bubble');
                if (bubbleEl) {
                    content = bubbleEl.textContent || bubbleEl.innerText;
                }
            } else {
                // AI訊息：內容在 .answer-content 中
                const answerEl = msgEl.querySelector('.answer-content');
                if (answerEl) {
                    content = answerEl.textContent || answerEl.innerText;
                }
            }

            // 清理內容（去除多餘空白）
            content = content.trim().replace(/\s+/g, ' ');

            if (content) {
                messages.push({
                    role: isUser ? 'user' : 'assistant',
                    content: content
                });
            }
        });

        return messages;
    }

    /**
     * 驗證是否可以生成總結
     * @returns {Object} {valid: boolean, message: string, messages: Array}
     */
    validateForSummary() {
        // 收集訊息（優先檢查DOM中的訊息）
        const messages = this.collectMessages();
        if (messages.length < SUMMARY_CONFIG.MIN_MESSAGES_FOR_SUMMARY) {
            return { valid: false, message: SUMMARY_MESSAGES.NO_MESSAGES };
        }

        return { valid: true, messages };
    }

    /**
     * 生成學習總結
     */
    async generateSummary() {
        // 驗證
        const validation = this.validateForSummary();
        if (!validation.valid) {
            this.showToast(validation.message, 'warning');
            return;
        }

        const generateBtn = $('#generateSummaryBtn');

        try {
            // 禁用按鈕，顯示載入狀態
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = i18n.t('summary.generatingBtn');
            }

            // 顯示載入狀態
            this.summaryRenderer.showLoading();
            this.mindmapRenderer.showLoading();

            // 呼叫API
            const response = await this.requestSummary(validation.messages);

            const data = response.data || response;
            if (response.success !== false) {
                // 前端容錯：如果後端解析失敗，summary 中可能包含原始標記
                this._parseSummaryFallback(data);

                this.summaryData = data;

                // 渲染總結
                if (data.summary) {
                    this.summaryRenderer.render(data.summary);
                }

                // 渲染思維導圖
                if (data.mindmap) {
                    await this.mindmapRenderer.render(data.mindmap);
                } else {
                    // 沒有思維導圖資料時，清除載入狀態並顯示提示
                    this.mindmapRenderer.container.innerHTML =
                        '<div style="text-align:center;padding:40px;color:#9ca3af">' + i18n.t('summary.clickGenMindmap') + '</div>';
                }

                this.showToast(SUMMARY_MESSAGES.SUCCESS, 'success');
            } else {
                throw new Error(response.message || SUMMARY_MESSAGES.ERROR);
            }

        } catch (error) {
            console.error('Summary generation failed:', error);
            this.summaryRenderer.showError(error.message || SUMMARY_MESSAGES.ERROR);
            this.mindmapRenderer.showError(error.message || SUMMARY_MESSAGES.ERROR);
            this.showToast(error.message || SUMMARY_MESSAGES.ERROR, 'error');

        } finally {
            // 恢復按鈕狀態
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = i18n.t('summary.generate');
            }
        }
    }

    /**
     * 前端容錯解析：如果後端返回的 summary 中仍包含 [SUMMARY_START] / [MINDMAP_START] 標記，
     * 在前端重新拆分，確保 data.summary 和 data.mindmap 正確分離。
     * @param {Object} data - API 返回的資料物件（會就地修改）
     */
    _parseSummaryFallback(data) {
        if (!data || !data.summary) return;

        const raw = data.summary;

        // 檢查是否包含未解析的標記
        const hasSummaryTag = raw.includes('[SUMMARY_START]');
        const hasMindmapTag = raw.includes('[MINDMAP_START]');

        if (!hasSummaryTag && !hasMindmapTag) return;

        console.log('LearningSummary: frontend fallback parse — detected unsplit markers');

        // 嘗試用正則提取
        const summaryMatch = raw.match(/\[SUMMARY_START\]([\s\S]*?)(?:\[SUMMARY_END\]|$)/);
        const mindmapMatch = raw.match(/\[MINDMAP_START\]([\s\S]*?)(?:\[MINDMAP_END\]|$)/);

        if (summaryMatch) {
            data.summary = summaryMatch[1].trim();
        } else if (hasMindmapTag) {
            // 沒有 [SUMMARY_START] 但有 [MINDMAP_START]，取 [MINDMAP_START] 之前的內容
            data.summary = raw.split('[MINDMAP_START]')[0]
                .replace(/\[SUMMARY_START\]/g, '')
                .replace(/\[SUMMARY_END\]/g, '')
                .trim();
        }

        if (mindmapMatch) {
            data.mindmap = mindmapMatch[1].trim();
        } else if (hasMindmapTag) {
            // [MINDMAP_START] 存在但沒有 [MINDMAP_END]，取到結尾
            data.mindmap = raw.split('[MINDMAP_START]').pop()
                .replace(/\[MINDMAP_END\]/g, '')
                .trim();
        }

        // 清理 summary 中可能殘留的思維導圖標記和內容
        if (data.summary && data.summary.includes('[MINDMAP_START]')) {
            data.summary = data.summary.split('[MINDMAP_START]')[0].trim();
        }
    }

    /**
     * 請求生成總結API
     * @param {Array} messages - 訊息陣列
     * @returns {Promise<Object>}
     */
    async requestSummary(messages) {
        const requestBody = {
            conversation_id: this.app?.state?.currentConversationId,
            messages: messages,
            subject: this.app?.state?.currentSubject || 'general',
            include_mindmap: true
        };

        // 使用主應用的apiCall方法（如果存在）
        let response;
        if (this.app && typeof this.app.apiCall === 'function') {
            response = await this.app.apiCall(SUMMARY_CONFIG.API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });
        } else {
            // 後備方案：直接fetch
            const token = localStorage.getItem('auth_token');
            response = await fetch(SUMMARY_CONFIG.API_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token ? `Bearer ${token}` : ''
                },
                body: JSON.stringify(requestBody)
            });
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        return await response.json();
    }

    /* ---------- 導出功能 ---------- */

    /**
     * 載入 html2canvas 庫
     * @returns {Promise<boolean>}
     */
    async _loadHtml2Canvas() {
        if (window.html2canvas) return true;
        return new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    /**
     * 載入 jsPDF 庫
     * @returns {Promise<boolean>}
     */
    async _loadJsPDF() {
        if (window.jspdf) return true;
        return new Promise(resolve => {
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js';
            s.onload = () => resolve(true);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
    }

    /**
     * 取得當前 tab 的渲染容器
     * @returns {Element|null}
     */
    _getActiveContent() {
        if (this.currentTab === SUMMARY_CONFIG.TABS.SUMMARY) {
            return $('#summaryContent');
        }
        return $('#mindmapContent');
    }

    /**
     * 取得導出檔名前綴
     * @returns {string}
     */
    _getExportFilename() {
        const subject = this.app?.state?.currentSubject || 'general';
        const date = new Date().toISOString().slice(0, 10);
        const tabLabel = this.currentTab === SUMMARY_CONFIG.TABS.SUMMARY ? i18n.t('summary.title') : i18n.t('summary.tabMindmap');
        return `${tabLabel}_${subject}_${date}`;
    }

    /**
     * 導出總結（入口方法）
     * @param {string} format - 'word' | 'pdf' | 'image'
     */
    async exportSummary(format) {
        if (!this.summaryData) {
            this.showToast(i18n.t('summary.noContent'), 'warning');
            return;
        }

        const content = this._getActiveContent();
        if (!content || !content.innerHTML.trim()) {
            this.showToast(i18n.t('summary.pageNoContent'), 'warning');
            return;
        }

        this.showToast(i18n.t('summary.generatingExport'), 'info');

        try {
            switch (format) {
                case 'word':
                    await this._exportWord(content);
                    break;
                case 'pdf':
                    await this._exportPDF(content);
                    break;
                case 'image':
                    await this._exportImage(content);
                    break;
            }
        } catch (error) {
            console.error('Export failed:', error);
            this.showToast(i18n.t('summary.exportFailed') + ': ' + error.message, 'error');
        }
    }

    /**
     * 判斷當前 tab 是否為思維導圖
     */
    _isMindmapTab() {
        return this.currentTab === SUMMARY_CONFIG.TABS.MINDMAP;
    }

    /**
     * 將思維導圖 SVG 渲染為高清 Canvas
     * @param {number} scale - 縮放倍數
     * @returns {Promise<HTMLCanvasElement|null>}
     */
    async _svgToCanvas(scale = 3) {
        const svgEl = document.querySelector('[id^="mindmap-svg"]');
        if (!svgEl) return null;

        // 取得 SVG 的完整 bounding box（包含所有節點）
        const g = svgEl.querySelector('g');
        if (!g) return null;

        const bbox = g.getBBox();
        const padding = 40;
        const fullW = Math.ceil(bbox.width + padding * 2);
        const fullH = Math.ceil(bbox.height + padding * 2);

        // 克隆 SVG 並設定完整 viewBox
        const clone = svgEl.cloneNode(true);
        clone.setAttribute('width', fullW);
        clone.setAttribute('height', fullH);
        clone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${fullW} ${fullH}`);
        // 確保 xmlns 屬性完整（序列化需要）
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

        // 移除 transform（我們用 viewBox 定位）
        const cloneG = clone.querySelector('g');
        if (cloneG) cloneG.removeAttribute('transform');

        // 深度內聯所有 SVG 元素的計算樣式
        // 使用 TreeWalker 遍歷原始 SVG 和克隆 SVG 的所有元素，保證一一對應
        const origWalker = document.createTreeWalker(svgEl, NodeFilter.SHOW_ELEMENT);
        const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT);
        const svgStyleProps = ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap', 'stroke-linejoin', 'opacity', 'fill-opacity', 'stroke-opacity'];

        let origNode = origWalker.nextNode();
        let cloneNode = cloneWalker.nextNode();
        while (origNode && cloneNode) {
            const tag = origNode.tagName?.toLowerCase();
            if (['circle', 'path', 'line', 'rect', 'polyline', 'polygon', 'ellipse'].includes(tag)) {
                const cs = window.getComputedStyle(origNode);
                for (const prop of svgStyleProps) {
                    const val = cs.getPropertyValue(prop);
                    if (!val || val === '' || val === '0') continue;

                    if (prop === 'fill') {
                        // path / line / polyline 是描邊元素，fill 應為 none
                        // 除非原始元素明確有非黑色 fill
                        const isStrokeElement = ['path', 'line', 'polyline'].includes(tag);
                        const isBlack = val === 'rgb(0, 0, 0)' || val === '#000' || val === '#000000' || val === 'black';
                        if (val === 'none') {
                            cloneNode.setAttribute('fill', 'none');
                        } else if (isStrokeElement && isBlack) {
                            // 描邊元素的默認黑色 fill → 改為 none（避免黑色方塊）
                            cloneNode.setAttribute('fill', 'none');
                        } else {
                            cloneNode.setAttribute('fill', val);
                        }
                    } else if (val !== 'none') {
                        cloneNode.setAttribute(prop, val);
                    }
                }
            }
            origNode = origWalker.nextNode();
            cloneNode = cloneWalker.nextNode();
        }

        // 處理 foreignObject 文字樣式：使用系統字體避免外部字體 taint
        clone.querySelectorAll('foreignObject').forEach((fo, idx) => {
            const origFo = svgEl.querySelectorAll('foreignObject')[idx];
            if (!origFo) return;
            fo.querySelectorAll('*').forEach((el, j) => {
                const origEl = origFo.querySelectorAll('*')[j];
                if (!origEl) return;
                const cs = window.getComputedStyle(origEl);
                el.style.fontFamily = '-apple-system, "Segoe UI", sans-serif';
                el.style.fontSize = cs.fontSize;
                el.style.fontWeight = cs.fontWeight;
                el.style.color = cs.color;
                el.style.lineHeight = cs.lineHeight;
                el.style.whiteSpace = cs.whiteSpace;
            });
        });

        // 清理 <style> 中的外部資源引用（@import, @font-face），保留其餘 CSS 規則
        clone.querySelectorAll('style').forEach(styleTag => {
            let css = styleTag.textContent || '';
            // 移除 @import
            css = css.replace(/@import\s+[^;]+;/g, '');
            // 移除 @font-face
            css = css.replace(/@font-face\s*\{[^}]*\}/g, '');
            styleTag.textContent = css;
        });
        // 移除外部 link
        clone.querySelectorAll('link').forEach(l => l.remove());

        // 覆寫字體為系統字體
        const fontOverride = document.createElementNS('http://www.w3.org/2000/svg', 'style');
        fontOverride.textContent = `
            * { font-family: -apple-system, 'Segoe UI', sans-serif !important; }
        `;
        clone.appendChild(fontOverride);

        // 添加白色背景
        const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        bg.setAttribute('x', bbox.x - padding);
        bg.setAttribute('y', bbox.y - padding);
        bg.setAttribute('width', fullW);
        bg.setAttribute('height', fullH);
        bg.setAttribute('fill', '#ffffff');
        clone.insertBefore(bg, clone.firstChild);

        // 序列化 → data URL（避免 Blob URL 的 CORS 問題）
        const svgData = new XMLSerializer().serializeToString(clone);
        const base64 = btoa(unescape(encodeURIComponent(svgData)));
        const dataUrl = 'data:image/svg+xml;base64,' + base64;

        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = fullW * scale;
                canvas.height = fullH * scale;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas);
            };
            img.onerror = () => {
                console.warn('SVG to Canvas failed, trying fallback');
                resolve(null);
            };
            img.src = dataUrl;
        });
    }

    /**
     * 將知識點總結容器的完整內容（包括滾動區域）截圖
     * 建立離屏克隆，展開到完整高度後截圖
     * @param {Element} contentEl
     * @param {number} scale
     * @returns {Promise<HTMLCanvasElement>}
     */
    async _captureFullContent(contentEl, scale = 3) {
        const ok = await this._loadHtml2Canvas();
        if (!ok) throw new Error(i18n.t('summary.screenshotLibFailed'));

        // 建立離屏克隆容器（全展開，無 overflow 限制）
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: fixed; left: -9999px; top: 0;
            width: ${Math.max(contentEl.scrollWidth, 700)}px;
            background: #fff; padding: 24px;
            overflow: visible; z-index: -1;
            font-family: -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
        `;
        const clone = contentEl.cloneNode(true);
        clone.style.cssText = 'overflow: visible; max-height: none; height: auto;';
        wrapper.appendChild(clone);
        document.body.appendChild(wrapper);

        try {
            const canvas = await window.html2canvas(wrapper, {
                scale,
                useCORS: true,
                allowTaint: true,  // 允許 taint（我們自己處理）
                backgroundColor: '#ffffff',
                logging: false,
                width: wrapper.scrollWidth,
                height: wrapper.scrollHeight,
                // 忽略外部字體加載失敗
                onclone: (clonedDoc) => {
                    // 移除可能導致 taint 的外部 link 標籤
                    clonedDoc.querySelectorAll('link[rel="stylesheet"][href*="//"]').forEach(l => l.remove());
                }
            });

            // 嘗試導出，如果被 taint 則降級處理
            try {
                canvas.toDataURL();  // 測試是否可導出
                return canvas;
            } catch (taintErr) {
                console.warn('Canvas tainted, retrying with degraded options');
                // 降級：重新截圖但不載入外部資源
                const canvas2 = await window.html2canvas(wrapper, {
                    scale,
                    useCORS: false,
                    allowTaint: false,
                    foreignObjectRendering: false,
                    backgroundColor: '#ffffff',
                    logging: false,
                    width: wrapper.scrollWidth,
                    height: wrapper.scrollHeight,
                });
                return canvas2;
            }
        } finally {
            document.body.removeChild(wrapper);
        }
    }

    /**
     * 導出為 Word (.doc)
     */
    async _exportWord(contentEl) {
        const filename = this._getExportFilename() + '.doc';
        const isMindmap = this._isMindmapTab();

        const styles = `
            <style>
                body { font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif; font-size: 14px; line-height: 1.8; color: #333; padding: 20px; }
                h1, h2, h3, h4 { color: #006633; margin: 16px 0 8px; }
                h1 { font-size: 22px; } h2 { font-size: 18px; } h3 { font-size: 16px; }
                strong, b { font-weight: 700; }
                ul, ol { padding-left: 24px; }
                li { margin: 4px 0; }
                table { border-collapse: collapse; width: 100%; margin: 12px 0; }
                th, td { border: 1px solid #ccc; padding: 6px 10px; text-align: left; }
                th { background: #f5f5f5; font-weight: 600; }
                .mindmap-tree-node { margin: 4px 0; }
                .mindmap-tree-icon { margin-right: 6px; }
                img { max-width: 100%; }
            </style>
        `;

        let bodyContent;
        if (isMindmap) {
            // 思維導圖：轉為高清圖片嵌入 Word
            const canvas = await this._svgToCanvas(3);
            if (canvas) {
                const imgData = canvas.toDataURL('image/png');
                bodyContent = `<div style="text-align:center"><img src="${imgData}" style="max-width:100%;" /></div>`;
            } else {
                // SVG 轉換失敗，使用 fallback 文字
                const clone = contentEl.cloneNode(true);
                clone.querySelectorAll('svg').forEach(s => s.remove());
                bodyContent = clone.innerHTML;
            }
        } else {
            const clone = contentEl.cloneNode(true);
            clone.querySelectorAll('svg:not([class])').forEach(s => s.remove());
            bodyContent = clone.innerHTML;
        }

        const htmlContent = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office"
                  xmlns:w="urn:schemas-microsoft-com:office:word"
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>${this._getExportFilename()}</title>
                <!--[if gte mso 9]>
                <xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml>
                <![endif]-->
                ${styles}
            </head>
            <body>${bodyContent}</body>
            </html>
        `;

        const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
        this._downloadBlob(blob, filename);
        this.showToast(i18n.t('summary.wordDownloaded'), 'success');
    }

    /**
     * 導出為 PDF
     */
    async _exportPDF(contentEl) {
        const pdfOk = await this._loadJsPDF();
        if (!pdfOk) throw new Error('Failed to load PDF library');

        const filename = this._getExportFilename() + '.pdf';
        const isMindmap = this._isMindmapTab();

        // 取得完整畫布
        let canvas;
        if (isMindmap) {
            canvas = await this._svgToCanvas(3);
            if (!canvas) {
                // fallback 到 html2canvas
                canvas = await this._captureFullContent(contentEl, 3);
            }
        } else {
            canvas = await this._captureFullContent(contentEl, 3);
        }

        const imgWidth = canvas.width;
        const imgHeight = canvas.height;

        // 計算 PDF 頁面尺寸
        const { jsPDF } = window.jspdf;
        const isLandscape = isMindmap && (imgWidth > imgHeight * 1.2);
        const orientation = isLandscape ? 'l' : 'p';
        const pdfPageW = isLandscape ? 297 : 210;
        const pdfPageH = isLandscape ? 210 : 297;
        const margin = 10;
        const pdfContentW = pdfPageW - margin * 2;
        const pdfContentH = pdfPageH - margin * 2;

        const ratio = pdfContentW / imgWidth;
        const totalContentH = imgHeight * ratio;

        const pdf = new jsPDF(orientation, 'mm', 'a4');

        if (totalContentH <= pdfContentH) {
            // 單頁
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', margin, margin, pdfContentW, totalContentH);
        } else {
            // 多頁
            const totalPages = Math.ceil(totalContentH / pdfContentH);
            for (let page = 0; page < totalPages; page++) {
                if (page > 0) pdf.addPage();

                const srcY = page * pdfContentH / ratio;
                const srcH = Math.min(pdfContentH / ratio, imgHeight - srcY);
                if (srcH <= 0) break;

                const pageCanvas = document.createElement('canvas');
                pageCanvas.width = imgWidth;
                pageCanvas.height = Math.ceil(srcH);
                const ctx = pageCanvas.getContext('2d');
                ctx.drawImage(canvas, 0, srcY, imgWidth, srcH, 0, 0, imgWidth, srcH);

                pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', margin, margin, pdfContentW, srcH * ratio);
            }
        }

        pdf.save(filename);
        this.showToast(i18n.t('summary.pdfDownloaded'), 'success');
    }

    /**
     * 導出為圖片 (.png)
     */
    async _exportImage(contentEl) {
        const filename = this._getExportFilename() + '.png';
        const isMindmap = this._isMindmapTab();

        let canvas;
        if (isMindmap) {
            canvas = await this._svgToCanvas(3);
            if (!canvas) {
                canvas = await this._captureFullContent(contentEl, 3);
            }
        } else {
            canvas = await this._captureFullContent(contentEl, 3);
        }

        canvas.toBlob(blob => {
            if (blob) {
                this._downloadBlob(blob, filename);
                this.showToast(i18n.t('summary.imageDownloaded'), 'success');
            }
        }, 'image/png');
    }

    /**
     * 通用下載 Blob
     */
    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * 顯示Toast提示
     * @param {string} message - 提示訊息
     * @param {string} type - 類型：success/warning/error
     */
    showToast(message, type = 'info') {
        // 使用主應用的showToast方法（如果存在）
        if (this.app && typeof this.app.showToast === 'function') {
            this.app.showToast(message, type);
            return;
        }

        // 後備方案：簡單的alert
        console.log(`[${type.toUpperCase()}] ${message}`);

        // 建立簡單的toast
        const existingToast = $('.summary-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = createElement('div', {
            className: `summary-toast summary-toast-${type}`
        }, message);

        document.body.appendChild(toast);

        // 自動移除
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 顯示模態框
     */
    show() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            // 添加顯示動畫類
            setTimeout(() => {
                this.modal.classList.add('show');
            }, 10);
        }
    }

    /**
     * 隱藏模態框
     */
    hide() {
        if (this.modal) {
            this.modal.classList.remove('show');

            setTimeout(() => {
                this.modal.style.display = 'none';
                document.body.style.overflow = '';
            }, 300);
        }
    }

    /**
     * 檢查模態框是否可見
     * @returns {boolean}
     */
    isVisible() {
        return this.modal?.style.display === 'flex';
    }

    /**
     * 重置狀態
     */
    reset() {
        this.summaryData = null;
        this.summaryRenderer.clear();
        this.mindmapRenderer.clear();
        this.currentTab = SUMMARY_CONFIG.TABS.SUMMARY;
        this.switchTab(this.currentTab);
    }

    /**
     * 銷毀組件
     */
    destroy() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
        if (this.summaryBtn) {
            this.summaryBtn.remove();
            this.summaryBtn = null;
        }
    }
}

/* ========== 匯出 ========== */

// 將類暴露到全域作用域
window.LearningSummaryManager = LearningSummaryManager;
window.SummaryRenderer = SummaryRenderer;
window.MindmapRenderer = MindmapRenderer;
