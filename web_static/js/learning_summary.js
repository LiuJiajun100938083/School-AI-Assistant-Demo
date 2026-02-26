/**
 * learning_summary.js - 学习总结功能模块
 *
 * 职责：管理对话总结和思维导图生成功能
 *
 * 架构说明：
 * - LearningSummaryManager: 主管理类，协调各组件
 * - SummaryRenderer: 负责知识点总结的渲染
 * - MindmapRenderer: 负责思维导图的渲染
 *
 * @version 1.0.0
 * @author AI Learning Partner Team
 */

'use strict';

/* ========== 常量定义 ========== */

const SUMMARY_CONFIG = {
    API_ENDPOINT: '/api/summary',
    MIN_MESSAGES_FOR_SUMMARY: 2,
    MARKMAP_CDN: 'https://cdn.jsdelivr.net/npm/markmap-autoloader@0.15',
    TABS: {
        SUMMARY: 'summary',
        MINDMAP: 'mindmap'
    },
    LOADING_TIMEOUT: 60000 // 60秒超时
};

const SUMMARY_MESSAGES = {
    NO_CONVERSATION: '请先开始一个对话后再生成学习总结',
    NO_MESSAGES: '当前对话消息太少，至少需要2条消息才能生成总结',
    LOADING: '正在分析对话内容，生成学习总结...',
    ERROR: '生成总结时出错，请稍后重试',
    SUCCESS: '总结生成成功！'
};

/* ========== 工具函数 ========== */

/**
 * 安全地获取DOM元素
 * @param {string} selector - CSS选择器
 * @returns {Element|null}
 */
function $(selector) {
    return document.querySelector(selector);
}

/**
 * 创建DOM元素
 * @param {string} tag - 标签名
 * @param {Object} attrs - 属性对象
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

/* ========== SummaryRenderer 类 ========== */

/**
 * 知识点总结渲染器
 * 负责将Markdown格式的总结渲染为HTML
 */
class SummaryRenderer {
    constructor() {
        this.container = null;
    }

    /**
     * 设置渲染容器
     * @param {Element} container - DOM容器元素
     */
    setContainer(container) {
        this.container = container;
    }

    /**
     * 渲染Markdown内容
     * @param {string} markdown - Markdown格式的总结内容
     */
    render(markdown) {
        if (!this.container) {
            console.error('SummaryRenderer: 容器未设置');
            return;
        }

        // 先处理表格，再进行其他格式化
        let html = this.parseMarkdownTables(markdown);
        html = this.formatMarkdown(html);

        this.container.innerHTML = html;

        // 渲染数学公式（如果主应用支持）
        if (window.app && typeof window.app.renderMath === 'function') {
            window.app.renderMath(this.container);
        }

        // 高亮代码块
        this.highlightCode();
    }

    /**
     * 解析Markdown表格
     * @param {string} markdown - Markdown文本
     * @returns {string} 处理后的文本
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
                    // 结束表格，转换为HTML
                    result.push(this.convertTableToHtml(tableLines));
                    tableLines = [];
                    inTable = false;
                }
                result.push(line);
            }
        }

        // 处理末尾的表格
        if (inTable && tableLines.length > 0) {
            result.push(this.convertTableToHtml(tableLines));
        }

        return result.join('\n');
    }

    /**
     * 将Markdown表格转换为HTML
     * @param {Array} lines - 表格行数组
     * @returns {string} HTML表格
     */
    convertTableToHtml(lines) {
        if (lines.length < 2) return lines.join('\n');

        let html = '<div class="summary-table-wrapper"><table class="summary-table">';

        lines.forEach((line, index) => {
            // 跳过分隔行
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
     * 格式化Markdown为HTML
     * @param {string} markdown - Markdown文本
     * @returns {string} HTML字符串
     */
    formatMarkdown(markdown) {
        // 使用主应用的方法（如果存在且可用）
        if (window.app && typeof window.app.formatTextWithMath === 'function') {
            try {
                return window.app.formatTextWithMath(markdown);
            } catch (e) {
                console.warn('formatTextWithMath失败，使用后备方案');
            }
        }

        // 后备方案
        return this.simpleMarkdownToHtml(markdown);
    }

    /**
     * 简单的Markdown转HTML（后备方案）
     * @param {string} markdown - Markdown文本
     * @returns {string} HTML字符串
     */
    simpleMarkdownToHtml(markdown) {
        let html = markdown
            // 标题
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^## (.*$)/gm, '<h2>$1</h2>')
            .replace(/^# (.*$)/gm, '<h1>$1</h1>')
            // 粗体和斜体
            .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            // 代码
            .replace(/`([^`]+)`/g, '<code>$1</code>');

        // 处理列表
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
                // 段落处理
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
     * 高亮代码块
     */
    highlightCode() {
        if (typeof Prism !== 'undefined') {
            this.container.querySelectorAll('pre code').forEach(block => {
                Prism.highlightElement(block);
            });
        }
    }

    /**
     * 显示加载状态
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
     * 显示错误信息
     * @param {string} message - 错误信息
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
     * 清空内容
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
    }
}

/* ========== MindmapRenderer 类 ========== */

/**
 * 思维导图渲染器
 * 使用Markmap库渲染交互式思维导图
 */
class MindmapRenderer {
    constructor() {
        this.container = null;
        this.markmapLoaded = false;
        this.currentMindmap = null;
    }

    /**
     * 设置渲染容器
     * @param {Element} container - DOM容器元素
     */
    setContainer(container) {
        this.container = container;
    }

    /**
     * 渲染思维导图
     * @param {string} markmapData - Markdown格式的思维导图数据
     */
    async render(markmapData) {
        if (!this.container) {
            console.error('MindmapRenderer: 容器未设置');
            return;
        }

        console.log('MindmapRenderer: 开始渲染思维导图');

        // 清空容器
        this.container.innerHTML = '';

        try {
            // 尝试加载Markmap库
            const loaded = await this.loadMarkmapLibs();

            if (loaded && window.markmap) {
                // 使用Markmap渲染
                await this.renderWithMarkmap(markmapData);
            } else {
                // 使用后备方案
                console.log('MindmapRenderer: 使用后备渲染方案');
                this.renderFallback(markmapData);
            }
        } catch (error) {
            console.error('MindmapRenderer: 渲染失败', error);
            // 出错时使用后备方案
            this.renderFallback(markmapData);
        }
    }

    /**
     * 加载Markmap相关库（需要同时加载d3、markmap-lib、markmap-view）
     * @returns {Promise<boolean>}
     */
    async loadMarkmapLibs() {
        // 检查是否已加载
        if (window.markmap && window.markmap.Markmap && window.markmap.Transformer) {
            return true;
        }

        // 需要按顺序加载的脚本
        const scripts = [
            'https://cdn.jsdelivr.net/npm/d3@7',
            'https://cdn.jsdelivr.net/npm/markmap-lib@0.15.4',
            'https://cdn.jsdelivr.net/npm/markmap-view@0.15.4'
        ];

        for (const src of scripts) {
            const loaded = await this.loadScript(src);
            if (!loaded) {
                console.warn(`MindmapRenderer: 加载失败 - ${src}`);
                return false;
            }
        }

        console.log('MindmapRenderer: 所有Markmap库加载成功');
        return true;
    }

    /**
     * 加载单个脚本
     * @param {string} src - 脚本URL
     * @returns {Promise<boolean>}
     */
    loadScript(src) {
        return new Promise((resolve) => {
            // 检查是否已存在
            if (document.querySelector(`script[src="${src}"]`)) {
                resolve(true);
                return;
            }

            const script = document.createElement('script');
            script.src = src;
            script.onload = () => resolve(true);
            script.onerror = () => resolve(false);
            document.head.appendChild(script);
        });
    }

    /**
     * 使用Markmap渲染
     * @param {string} markmapData - Markdown数据
     */
    async renderWithMarkmap(markmapData) {
        // 使用固定尺寸避免隐藏面板时获取不到尺寸的问题
        const FIXED_WIDTH = 800;
        const FIXED_HEIGHT = 500;

        // 创建包装容器
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `width: 100%; height: 100%; min-height: ${FIXED_HEIGHT}px; position: relative; background: #fff; border-radius: 12px; overflow: visible; touch-action: none;`;
        this.container.appendChild(wrapper);

        // 创建SVG元素，使用固定尺寸和viewBox
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('id', 'mindmap-svg-' + Date.now());
        svg.setAttribute('width', FIXED_WIDTH);
        svg.setAttribute('height', FIXED_HEIGHT);
        svg.setAttribute('viewBox', `0 0 ${FIXED_WIDTH} ${FIXED_HEIGHT}`);
        svg.style.cssText = 'width: 100%; height: 100%; display: block; touch-action: none; cursor: grab;';
        wrapper.appendChild(svg);

        // 阻止父容器的滚动事件干扰拖拽
        wrapper.addEventListener('wheel', (e) => e.stopPropagation(), { passive: false });
        wrapper.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: false });

        try {
            const { Transformer } = window.markmap;
            const { Markmap } = window.markmap;
            const d3 = window.d3;

            // 创建transformer并转换数据
            const transformer = new Transformer();
            const { root, features } = transformer.transform(markmapData);

            console.log('MindmapRenderer: 使用固定尺寸', { width: FIXED_WIDTH, height: FIXED_HEIGHT });

            // 在创建markmap之前，先用D3选择SVG并设置初始zoom状态
            const svgSelection = d3.select(svg);
            const initialTransform = d3.zoomIdentity
                .translate(FIXED_WIDTH / 4, FIXED_HEIGHT / 2)
                .scale(0.8);

            // 预先设置__zoom属性，防止markmap在创建时读取到undefined
            svgSelection.property('__zoom', initialTransform);

            // 创建思维导图
            // 关键：duration设为0禁用初始动画，避免NaN问题
            const mm = Markmap.create(svg, {
                autoFit: false,  // 禁用自动适配
                duration: 0,     // 禁用初始动画，防止NaN
                maxWidth: 200,
                paddingX: 50,
                spacingHorizontal: 60,
                spacingVertical: 6,
                zoom: true,
                pan: true,
                initialExpandLevel: 3
            }, root);

            // 保存实例引用
            this.currentMindmap = mm;
            this.pendingFit = false;

            // 获取g元素并应用保护和初始变换
            const g = svgSelection.select('g');
            if (g && g.node()) {
                // 先应用transform保护
                this.patchTransformProtection(g);

                // 设置初始变换
                g.attr('transform', initialTransform.toString());

                // 再次确保__zoom状态同步
                svgSelection.property('__zoom', initialTransform);

                console.log('MindmapRenderer: 初始变换设置成功', initialTransform.toString());

                // 重新绑定zoom行为，确保它使用正确的初始状态
                this.setupZoomBehavior(svgSelection, g, FIXED_WIDTH, FIXED_HEIGHT);
            }

            // 稍后启用动画效果
            setTimeout(() => {
                if (this.currentMindmap && this.currentMindmap.options) {
                    this.currentMindmap.options.duration = 500;
                    console.log('MindmapRenderer: 动画已启用');
                }
            }, 200);

            console.log('MindmapRenderer: Markmap渲染成功');
        } catch (error) {
            console.error('MindmapRenderer: Markmap渲染出错', error);
            // 清空并使用后备方案
            this.container.innerHTML = '';
            this.renderFallback(markmapData);
        }
    }

    /**
     * 设置自定义的zoom行为
     * @param {d3.Selection} svgSelection - SVG的D3选择器
     * @param {d3.Selection} g - g元素的D3选择器
     * @param {number} width - SVG宽度
     * @param {number} height - SVG高度
     */
    setupZoomBehavior(svgSelection, g, width, height) {
        const d3 = window.d3;
        if (!d3 || !d3.zoom) {
            console.warn('MindmapRenderer: D3 zoom不可用');
            return;
        }

        // 获取当前的transform状态
        const currentTransform = svgSelection.property('__zoom') || d3.zoomIdentity;

        // 创建新的zoom行为
        const zoom = d3.zoom()
            .scaleExtent([0.1, 4])  // 限制缩放范围
            .on('zoom', (event) => {
                // 验证transform是否有效
                const t = event.transform;
                if (t && isFinite(t.x) && isFinite(t.y) && isFinite(t.k) && t.k > 0) {
                    g.attr('transform', t.toString());
                } else {
                    console.warn('MindmapRenderer: 阻止无效zoom事件', t);
                }
            });

        // 移除旧的zoom监听器，添加新的
        svgSelection
            .on('.zoom', null)  // 移除旧的zoom事件
            .call(zoom)
            .call(zoom.transform, currentTransform);  // 应用当前transform

        console.log('MindmapRenderer: 自定义zoom行为已设置');
    }

    /**
     * 当面板变为可见时调用fit
     */
    fitWhenVisible() {
        if (this.currentMindmap && this.pendingFit) {
            // 使用requestAnimationFrame确保DOM已渲染
            requestAnimationFrame(() => {
                // 额外延迟确保容器完全可见
                setTimeout(() => {
                    try {
                        if (!this.currentMindmap || !this.currentMindmap.svg) {
                            console.warn('MindmapRenderer: mindmap实例无效');
                            return;
                        }

                        const svgNode = this.currentMindmap.svg.node();
                        if (!svgNode) {
                            console.warn('MindmapRenderer: SVG节点不存在');
                            return;
                        }

                        // 检查SVG是否有有效尺寸
                        const rect = svgNode.getBoundingClientRect();
                        if (rect.width <= 0 || rect.height <= 0) {
                            console.warn('MindmapRenderer: SVG容器尺寸无效，跳过fit', rect);
                            // 保持pendingFit为true，下次再试
                            return;
                        }

                        // 检查是否可见（不在隐藏的父元素中）
                        if (rect.width < 10 || rect.height < 10) {
                            console.warn('MindmapRenderer: SVG容器太小，可能未完全可见');
                            return;
                        }

                        // 安全调用fit
                        if (this.currentMindmap.fit) {
                            this.currentMindmap.fit();
                            this.pendingFit = false;
                            console.log('MindmapRenderer: fit完成', { width: rect.width, height: rect.height });
                        }
                    } catch (e) {
                        console.warn('MindmapRenderer: fit失败', e);
                        // 出错时标记为已完成，避免重复尝试
                        this.pendingFit = false;
                    }
                }, 200);  // 增加延迟到200ms
            });
        }
    }

    /**
     * 为g元素添加transform保护，防止NaN值被设置
     * @param {d3.Selection} gSelection - D3选择器
     */
    patchTransformProtection(gSelection) {
        if (!gSelection || !gSelection.node()) return;

        const gNode = gSelection.node();
        const originalSetAttribute = gNode.setAttribute.bind(gNode);
        let lastValidTransform = gNode.getAttribute('transform') || 'translate(0,0) scale(1)';

        // 包装setAttribute方法，验证transform值
        gNode.setAttribute = function(name, value) {
            if (name === 'transform') {
                // 确保value是字符串类型
                let strValue;
                if (typeof value === 'string') {
                    strValue = value;
                } else if (value && typeof value.toString === 'function') {
                    // D3 transform对象有toString方法
                    strValue = value.toString();
                } else {
                    // 无法转换，使用上次有效值
                    console.warn('MindmapRenderer: transform值类型无效:', typeof value);
                    return originalSetAttribute.call(this, name, lastValidTransform);
                }

                // 检查是否包含NaN或Infinity
                if (strValue.includes('NaN') || strValue.includes('Infinity')) {
                    console.warn('MindmapRenderer: 阻止无效transform值:', strValue);
                    return originalSetAttribute.call(this, name, lastValidTransform);
                }

                // 验证translate和scale的值
                const translateMatch = strValue.match(/translate\(([-\d.e]+),\s*([-\d.e]+)\)/);
                const scaleMatch = strValue.match(/scale\(([-\d.e]+)\)/);

                if (translateMatch) {
                    const x = parseFloat(translateMatch[1]);
                    const y = parseFloat(translateMatch[2]);
                    if (!isFinite(x) || !isFinite(y)) {
                        console.warn('MindmapRenderer: 检测到无效translate坐标:', { x, y });
                        return originalSetAttribute.call(this, name, lastValidTransform);
                    }
                }

                if (scaleMatch) {
                    const s = parseFloat(scaleMatch[1]);
                    if (!isFinite(s) || s <= 0) {
                        console.warn('MindmapRenderer: 检测到无效scale值:', s);
                        return originalSetAttribute.call(this, name, lastValidTransform);
                    }
                }

                // 值有效，保存并应用
                lastValidTransform = strValue;
                // 使用字符串值设置属性
                return originalSetAttribute.call(this, name, strValue);
            }
            return originalSetAttribute.call(this, name, value);
        };

        console.log('MindmapRenderer: transform保护已启用');
    }

    /**
     * 后备渲染方案（纯CSS树形结构）
     * @param {string} markmapData - Markdown格式数据
     */
    renderFallback(markmapData) {
        if (!this.container) return;

        console.log('MindmapRenderer: 使用后备树形渲染');

        // 解析Markdown为层级结构
        const lines = markmapData.split('\n').filter(line => line.trim());
        let html = '<div class="mindmap-fallback"><div class="mindmap-tree">';

        // 颜色配置
        const levelColors = ['#006633', '#2E7D32', '#43A047', '#66BB6A', '#81C784'];
        const levelIcons = ['🎯', '📌', '📍', '•', '◦'];

        lines.forEach(line => {
            // 计算层级
            const hashMatch = line.match(/^#+/);
            const listMatch = line.match(/^(\s*)([-*])/);

            let level = 0;
            if (hashMatch) {
                level = hashMatch[0].length - 1; // # = 0, ## = 1, etc.
            } else if (listMatch) {
                level = Math.floor(listMatch[1].length / 2) + 2; // 缩进决定层级
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
    }

    /**
     * HTML转义
     * @param {string} text - 原始文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 显示加载状态
     */
    showLoading() {
        if (this.container) {
            this.container.innerHTML = `
                <div class="mindmap-loading">
                    <div class="summary-loading-spinner"></div>
                    <p>正在生成思维导图...</p>
                </div>
            `;
        }
    }

    /**
     * 显示错误信息
     * @param {string} message - 错误信息
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
     * 清空内容
     */
    clear() {
        if (this.container) {
            this.container.innerHTML = '';
        }
        this.currentMindmap = null;
        this.pendingFit = false;
    }
}

/* ========== LearningSummaryManager 类 ========== */

/**
 * 学习总结管理器
 * 主类，协调UI、渲染器和API调用
 */
class LearningSummaryManager {
    /**
     * @param {Object} app - 主应用实例引用
     */
    constructor(app) {
        this.app = app;
        this.modal = null;
        this.summaryBtn = null;
        this.currentTab = SUMMARY_CONFIG.TABS.SUMMARY;
        this.summaryData = null;

        // 渲染器实例
        this.summaryRenderer = new SummaryRenderer();
        this.mindmapRenderer = new MindmapRenderer();

        // 初始化
        this.init();
    }

    /**
     * 初始化组件
     */
    init() {
        this.createButton();
        this.createModal();
        this.bindEvents();
    }

    /**
     * 创建总结按钮
     */
    createButton() {
        const inputRow = $('.input-row');
        if (!inputRow) {
            console.error('找不到 .input-row 元素');
            return;
        }

        // 创建总结按钮
        this.summaryBtn = createElement('button', {
            id: 'summaryButton',
            className: 'summary-button',
            title: '生成学习总结和思维导图'
        }, '📚');

        // 插入到发送按钮之后
        const sendButton = $('#sendButton');
        if (sendButton && sendButton.nextSibling) {
            inputRow.insertBefore(this.summaryBtn, sendButton.nextSibling);
        } else {
            inputRow.appendChild(this.summaryBtn);
        }
    }

    /**
     * 创建模态框
     */
    createModal() {
        // 创建模态框overlay
        this.modal = createElement('div', {
            id: 'summaryModal',
            className: 'summary-modal-overlay'
        });

        // 模态框内容
        const modalContent = `
            <div class="summary-modal">
                <div class="summary-modal-header">
                    <h2 class="summary-modal-title">📚 学习总结</h2>
                    <button class="summary-modal-close" id="closeSummaryModal">&times;</button>
                </div>

                <div class="summary-tabs">
                    <button class="summary-tab active" data-tab="${SUMMARY_CONFIG.TABS.SUMMARY}">
                        📝 知识点总结
                    </button>
                    <button class="summary-tab" data-tab="${SUMMARY_CONFIG.TABS.MINDMAP}">
                        🗺️ 思维导图
                    </button>
                </div>

                <div class="summary-content">
                    <div class="summary-panel active" id="summaryPanel">
                        <div class="summary-panel-content" id="summaryContent">
                            <div class="summary-placeholder">
                                <p>点击下方按钮生成学习总结</p>
                            </div>
                        </div>
                    </div>
                    <div class="summary-panel" id="mindmapPanel">
                        <div class="summary-panel-content mindmap-container" id="mindmapContent">
                            <div class="summary-placeholder">
                                <p>点击下方按钮生成思维导图</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="summary-modal-footer">
                    <button class="summary-action-btn secondary" id="copySummaryBtn">
                        📋 复制内容
                    </button>
                    <button class="summary-action-btn primary" id="generateSummaryBtn">
                        ✨ 生成总结
                    </button>
                </div>
            </div>
        `;

        this.modal.innerHTML = modalContent;
        document.body.appendChild(this.modal);

        // 设置渲染器容器
        this.summaryRenderer.setContainer($('#summaryContent'));
        this.mindmapRenderer.setContainer($('#mindmapContent'));
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 打开模态框
        if (this.summaryBtn) {
            this.summaryBtn.addEventListener('click', () => this.show());
        }

        // 关闭模态框
        const closeBtn = $('#closeSummaryModal');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.hide());
        }

        // 点击overlay关闭
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) {
                    this.hide();
                }
            });
        }

        // Tab切换
        const tabs = this.modal?.querySelectorAll('.summary-tab');
        tabs?.forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });

        // 生成按钮
        const generateBtn = $('#generateSummaryBtn');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateSummary());
        }

        // 复制按钮
        const copyBtn = $('#copySummaryBtn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => this.copySummary());
        }

        // ESC键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isVisible()) {
                this.hide();
            }
        });
    }

    /**
     * 切换Tab
     * @param {string} tabName - Tab名称
     */
    switchTab(tabName) {
        this.currentTab = tabName;

        // 更新Tab样式
        const tabs = this.modal?.querySelectorAll('.summary-tab');
        tabs?.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // 更新面板显示
        const panels = this.modal?.querySelectorAll('.summary-panel');
        panels?.forEach(panel => {
            const panelTab = panel.id === 'summaryPanel' ?
                SUMMARY_CONFIG.TABS.SUMMARY : SUMMARY_CONFIG.TABS.MINDMAP;
            panel.classList.toggle('active', panelTab === tabName);
        });

        // 切换到思维导图面板时，执行fit操作
        if (tabName === SUMMARY_CONFIG.TABS.MINDMAP) {
            this.mindmapRenderer.fitWhenVisible();
        }
    }

    /**
     * 收集当前对话的消息
     * @returns {Array} 消息数组
     */
    collectMessages() {
        const messages = [];
        const container = $('#messagesContainer');

        if (!container) {
            console.warn('collectMessages: 找不到消息容器');
            return messages;
        }

        // 遍历消息元素
        // 实际DOM结构:
        // - .message.user > .message-bubble (用户消息内容直接在bubble中)
        // - .message.assistant > .message-bubble > .answer-content (AI回复内容)
        const messageElements = container.querySelectorAll('.message.user, .message.assistant');

        messageElements.forEach(msgEl => {
            const isUser = msgEl.classList.contains('user');
            let content = '';

            if (isUser) {
                // 用户消息：内容在 .message-bubble 中
                const bubbleEl = msgEl.querySelector('.message-bubble');
                if (bubbleEl) {
                    content = bubbleEl.textContent || bubbleEl.innerText;
                }
            } else {
                // AI消息：内容在 .answer-content 中
                const answerEl = msgEl.querySelector('.answer-content');
                if (answerEl) {
                    content = answerEl.textContent || answerEl.innerText;
                }
            }

            // 清理内容（去除多余空白）
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
        // 收集消息（優先檢查DOM中的消息）
        const messages = this.collectMessages();
        if (messages.length < SUMMARY_CONFIG.MIN_MESSAGES_FOR_SUMMARY) {
            return { valid: false, message: SUMMARY_MESSAGES.NO_MESSAGES };
        }

        return { valid: true, messages };
    }

    /**
     * 生成学习总结
     */
    async generateSummary() {
        // 验证
        const validation = this.validateForSummary();
        if (!validation.valid) {
            this.showToast(validation.message, 'warning');
            return;
        }

        const generateBtn = $('#generateSummaryBtn');

        try {
            // 禁用按钮，显示加载状态
            if (generateBtn) {
                generateBtn.disabled = true;
                generateBtn.textContent = '⏳ 生成中...';
            }

            // 显示加载状态
            this.summaryRenderer.showLoading();
            this.mindmapRenderer.showLoading();

            // 调用API
            const response = await this.requestSummary(validation.messages);

            const data = response.data || response;
            if (response.success !== false) {
                this.summaryData = data;

                // 渲染总结
                if (data.summary) {
                    this.summaryRenderer.render(data.summary);
                }

                // 渲染思维导图
                if (data.mindmap) {
                    await this.mindmapRenderer.render(data.mindmap);
                }

                this.showToast(SUMMARY_MESSAGES.SUCCESS, 'success');
            } else {
                throw new Error(response.message || SUMMARY_MESSAGES.ERROR);
            }

        } catch (error) {
            console.error('生成总结失败:', error);
            this.summaryRenderer.showError(error.message || SUMMARY_MESSAGES.ERROR);
            this.mindmapRenderer.showError(error.message || SUMMARY_MESSAGES.ERROR);
            this.showToast(error.message || SUMMARY_MESSAGES.ERROR, 'error');

        } finally {
            // 恢复按钮状态
            if (generateBtn) {
                generateBtn.disabled = false;
                generateBtn.textContent = '✨ 生成总结';
            }
        }
    }

    /**
     * 请求生成总结API
     * @param {Array} messages - 消息数组
     * @returns {Promise<Object>}
     */
    async requestSummary(messages) {
        const requestBody = {
            conversation_id: this.app?.state?.currentConversationId,
            messages: messages,
            subject: this.app?.state?.currentSubject || 'general',
            include_mindmap: true
        };

        // 使用主应用的apiCall方法（如果存在）
        let response;
        if (this.app && typeof this.app.apiCall === 'function') {
            response = await this.app.apiCall(SUMMARY_CONFIG.API_ENDPOINT, {
                method: 'POST',
                body: JSON.stringify(requestBody)
            });
        } else {
            // 后备方案：直接fetch
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

    /**
     * 复制总结内容
     */
    async copySummary() {
        if (!this.summaryData) {
            this.showToast('没有可复制的内容', 'warning');
            return;
        }

        try {
            let textToCopy = '';

            if (this.currentTab === SUMMARY_CONFIG.TABS.SUMMARY && this.summaryData.summary) {
                textToCopy = this.summaryData.summary;
            } else if (this.currentTab === SUMMARY_CONFIG.TABS.MINDMAP && this.summaryData.mindmap) {
                textToCopy = this.summaryData.mindmap;
            }

            if (textToCopy) {
                await navigator.clipboard.writeText(textToCopy);
                this.showToast('已复制到剪贴板', 'success');
            } else {
                this.showToast('没有可复制的内容', 'warning');
            }
        } catch (error) {
            console.error('复制失败:', error);
            this.showToast('复制失败，请手动选择复制', 'error');
        }
    }

    /**
     * 显示Toast提示
     * @param {string} message - 提示信息
     * @param {string} type - 类型：success/warning/error
     */
    showToast(message, type = 'info') {
        // 使用主应用的showToast方法（如果存在）
        if (this.app && typeof this.app.showToast === 'function') {
            this.app.showToast(message, type);
            return;
        }

        // 后备方案：简单的alert
        console.log(`[${type.toUpperCase()}] ${message}`);

        // 创建简单的toast
        const existingToast = $('.summary-toast');
        if (existingToast) {
            existingToast.remove();
        }

        const toast = createElement('div', {
            className: `summary-toast summary-toast-${type}`
        }, message);

        document.body.appendChild(toast);

        // 自动移除
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * 显示模态框
     */
    show() {
        if (this.modal) {
            this.modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';

            // 添加显示动画类
            setTimeout(() => {
                this.modal.classList.add('show');
            }, 10);
        }
    }

    /**
     * 隐藏模态框
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
     * 检查模态框是否可见
     * @returns {boolean}
     */
    isVisible() {
        return this.modal?.style.display === 'flex';
    }

    /**
     * 重置状态
     */
    reset() {
        this.summaryData = null;
        this.summaryRenderer.clear();
        this.mindmapRenderer.clear();
        this.currentTab = SUMMARY_CONFIG.TABS.SUMMARY;
        this.switchTab(this.currentTab);
    }

    /**
     * 销毁组件
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

/* ========== 导出 ========== */

// 将类暴露到全局作用域
window.LearningSummaryManager = LearningSummaryManager;
window.SummaryRenderer = SummaryRenderer;
window.MindmapRenderer = MindmapRenderer;
