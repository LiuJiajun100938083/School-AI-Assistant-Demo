/**
 * AI Learning Center - AI Chat Assistant Module
 * AI question answering, floating chat window, and context management
 */
(function() {
    'use strict';

    const $ = window.alc;

    // ==================== AI ASSISTANT ====================

    function setupAiAssistant() {
        const inputBox = $.getElement('aiInputBox');
        const sendBtn = $.getElement('aiSendBtn');

        if (sendBtn) {
            sendBtn.addEventListener('click', sendAiQuestion);
        }

        if (inputBox) {
            inputBox.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendAiQuestion();
                }
            });
        }

        // Setup suggested questions
        const suggestedQuestions = document.querySelectorAll('[data-question]');
        suggestedQuestions.forEach(btn => {
            btn.addEventListener('click', () => {
                const question = btn.getAttribute('data-question');
                const inputBox = $.getElement('aiInputBox');
                if (inputBox) {
                    inputBox.value = question;
                    sendAiQuestion();
                }
            });
        });

        // 页码跳转事件委托（点击 AI 消息中的页码引用或快捷按钮）
        const messagesEl = $.getElement('aiMessages');
        if (messagesEl) {
            messagesEl.addEventListener('click', (e) => {
                // 页码跳转
                const pageRef = e.target.closest('.alc-page-ref, .alc-page-ref-btn');
                if (pageRef) {
                    const page = parseInt(pageRef.dataset.page, 10);
                    if (!isNaN(page)) {
                        navigatePdfToPage(page);
                    }
                    return;
                }
                // 知识图谱节点芯片点击
                const kgChip = e.target.closest('.alc-kg-node-chip');
                if (kgChip) {
                    const nodeId = parseInt(kgChip.dataset.nodeId, 10);
                    if (!isNaN(nodeId)) {
                        navigateToKnowledgeNode(nodeId);
                    }
                }
            });
        }

        // 初始化上下文指示条
        updateAiContextIndicator();
    }

    /**
     * 更新 AI 助教上下文指示条，显示当前阅读的内容标题。
     */
    function updateAiContextIndicator() {
        const indicator = document.getElementById('aiContextIndicator');
        if (!indicator) return;

        if ($.state.currentContentId && $.state.currentContentTitle) {
            indicator.style.display = 'flex';
            indicator.innerHTML = `
                <span class="alc-ai-context-icon">&#128214;</span>
                <span class="alc-ai-context-text">
                    当前阅读：<strong>${$.escapeHtml($.state.currentContentTitle)}</strong>
                </span>
                <button class="alc-ai-context-clear"
                        onclick="window.lcLearningCenter.clearAiContext()"
                        title="清除上下文">&#10005;</button>
            `;
        } else {
            indicator.style.display = 'none';
            indicator.innerHTML = '';
        }
    }

    /**
     * 清除当前内容上下文关联（恢复通用问答模式）。
     */
    function clearAiContext() {
        $.state.currentContentId = null;
        $.state.currentContentTitle = null;
        updateAiContextIndicator();
    }

    // ==================== AI 浮动窗口 ====================

    /**
     * 切换 AI 助教浮动窗口的显示/隐藏状态。
     */
    function toggleAiWindow() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        const isVisible = win.style.display === 'flex';
        win.style.display = isVisible ? 'none' : 'flex';

        // 首次打开时聚焦输入框
        if (!isVisible) {
            const input = $.getElement('aiInputBox');
            if (input) input.focus();
        }
    }

    /**
     * 在小窗口和大窗口之间切换。
     */
    function toggleAiWindowSize() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        const isExpanded = win.classList.toggle('alc-ai-float--expanded');
        const btn = document.getElementById('aiFloatExpandBtn');
        if (btn) {
            btn.innerHTML = isExpanded ? '&#9635;' : '&#9634;';
            btn.title = isExpanded ? '缩小' : '放大';
        }
    }

    /**
     * 初始化浮动窗口的拖拽行为。
     * 在 init() 中调用一次即可。
     */
    function setupAiFloatingWindow() {
        const win = document.getElementById('aiFloatingWindow');
        if (!win) return;

        // Bind AI window toggle/resize buttons (replaced inline onclick)
        const aiToggleBtn = document.getElementById('aiFloatingToggleBtn');
        if (aiToggleBtn) aiToggleBtn.addEventListener('click', toggleAiWindow);
        const aiExpandBtn = document.getElementById('aiFloatExpandBtn');
        if (aiExpandBtn) aiExpandBtn.addEventListener('click', toggleAiWindowSize);
        const aiCloseBtn = document.getElementById('aiFloatCloseBtn');
        if (aiCloseBtn) aiCloseBtn.addEventListener('click', toggleAiWindow);

        const header = document.getElementById('aiFloatHeader');

        let dragState = null;
        let lastX = 0;
        let lastY = 0;
        let rafPending = false;

        // ---- 拖拽 ----
        if (header) {
            header.addEventListener('mousedown', (e) => {
                if (e.target.closest('button')) return;
                e.preventDefault();

                const rect = win.getBoundingClientRect();
                win.style.left = rect.left + 'px';
                win.style.top = rect.top + 'px';
                win.style.right = 'auto';
                win.style.bottom = 'auto';

                dragState = {
                    offsetX: e.clientX - rect.left,
                    offsetY: e.clientY - rect.top,
                };
                win.style.transition = 'none';
                win.classList.add('alc-ai-float--interacting');
                document.body.style.userSelect = 'none';
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!dragState) return;
            lastX = e.clientX;
            lastY = e.clientY;

            if (rafPending) return;
            rafPending = true;
            requestAnimationFrame(() => {
                rafPending = false;
                if (dragState) {
                    win.style.left = Math.max(0, Math.min(lastX - dragState.offsetX, window.innerWidth - win.offsetWidth)) + 'px';
                    win.style.top = Math.max(0, Math.min(lastY - dragState.offsetY, window.innerHeight - win.offsetHeight)) + 'px';
                }
            });
        });

        document.addEventListener('mouseup', () => {
            if (!dragState) return;
            dragState = null;
            win.style.transition = '';
            win.classList.remove('alc-ai-float--interacting');
            document.body.style.userSelect = '';
        });
    }

    /**
     * 从 AI 回答中点击知识节点芯片 → 导航到知识图谱并高亮该节点。
     */
    async function navigateToKnowledgeNode(nodeId) {
        // 1. 确保知识图谱 tab 已加载
        if ($.currentTab !== 'map') {
            await $.switchTab('map');
            await new Promise(r => setTimeout(r, 600));
        }

        // 2. 在 state.nodes 中找到该节点
        const node = $.state.nodes.find(n => n.id === nodeId || n.id == nodeId);
        if (!node) {
            $.showToast('未找到该知识节点', 'warning');
            return;
        }

        // 3. 精确搜索：用完整标题搜索以精确定位
        const mapSearchInput = $.getElement('mapSearchInput');
        if (mapSearchInput) {
            mapSearchInput.value = node.title;
            mapSearchInput.dispatchEvent(new Event('input'));
        }

        // 4. 弹出详情面板 + 清除搜索状态（保留高亮短暂显示后恢复）
        setTimeout(() => {
            $.showNodeDetail(node);
            // 2秒后清除搜索高亮，恢复正常显示
            setTimeout(() => {
                if (mapSearchInput) {
                    mapSearchInput.value = '';
                    mapSearchInput.dispatchEvent(new Event('input'));
                }
            }, 2000);
        }, 800);
    }

    async function sendAiQuestion() {
        const inputBox = $.getElement('aiInputBox');
        if (!inputBox || !inputBox.value.trim()) {
            $.showToast('请输入问题', 'warning');
            return;
        }

        const question = inputBox.value.trim();
        const messagesEl = $.getElement('aiMessages');
        if (!messagesEl) return;

        renderAiMessage('user', question);
        inputBox.value = '';
        inputBox.focus();

        // 显示打字动画
        const loadingEl = document.createElement('div');
        loadingEl.className = 'alc-message alc-message--ai';
        loadingEl.innerHTML = '<div class="alc-message-avatar">🤖</div><div class="alc-message-content"><div class="alc-typing-indicator"><span></span><span></span><span></span></div></div>';
        messagesEl.appendChild(loadingEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;

        const requestBody = { question };
        if ($.state.currentContentId) {
            requestBody.content_id = $.state.currentContentId;
        }

        try {
            const resp = await $.apiPost(`${$.API_BASE}/ai-ask`, requestBody);
            const result = resp.data || resp;
            loadingEl.remove();
            renderAiMessage('assistant', result.answer || '暂无回答', result.sources, result.page_references, result.related_nodes);
        } catch (error) {
            loadingEl.remove();
            renderAiMessage('assistant', '发送失败，请重试');
            console.error('AI ask error:', error);
        }

        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function renderAiMessage(role, content, sources = null, pageReferences = null, relatedNodes = null) {
        const messagesEl = $.getElement('aiMessages');
        if (!messagesEl) return;

        const isUser = role === 'user';
        const messageEl = document.createElement('div');
        messageEl.className = isUser ? 'alc-message user' : 'alc-message alc-message--ai';

        // 头像
        const avatarEl = document.createElement('div');
        avatarEl.className = 'alc-message-avatar';
        avatarEl.textContent = isUser ? '🧑' : '🤖';
        messageEl.appendChild(avatarEl);

        // 气泡内容
        const contentEl = document.createElement('div');
        contentEl.className = 'alc-message-content';

        if (!isUser && typeof marked !== 'undefined') {
            let html = DOMPurify.sanitize(marked.parse(content));
            // 将 AI 回答中的【第X页】标记转换为可点击链接
            html = linkifyPageReferences(html);
            contentEl.innerHTML = html;
        } else {
            contentEl.innerHTML = `<p>${$.escapeHtml(content).replace(/\n/g, '<br>')}</p>`;
        }

        if (sources && sources.length > 0) {
            const sourcesHtml = sources.map(s =>
                `<a href="${$.escapeHtml(s.url)}" target="_blank" class="alc-source-link">${$.escapeHtml(s.title)}</a>`
            ).join('');
            contentEl.insertAdjacentHTML('beforeend', `<div class="alc-ai-sources"><p>参考资料：</p>${sourcesHtml}</div>`);
        }

        // 页码快捷导航按钮
        if (pageReferences && pageReferences.length > 0) {
            const allPages = new Set();
            pageReferences.forEach(ref => {
                ref.page_numbers.forEach(p => allPages.add(p));
            });
            const sortedPages = Array.from(allPages).sort((a, b) => a - b);

            const btnsHtml = sortedPages.map(p =>
                `<button class="alc-page-ref-btn" data-page="${p}" title="跳转到第${p}页">第${p}页</button>`
            ).join('');
            contentEl.insertAdjacentHTML('beforeend',
                `<div class="alc-page-refs-bar"><span class="alc-page-refs-label">相关页码：</span>${btnsHtml}</div>`
            );
        }

        // 知识图谱相关节点芯片
        if (relatedNodes && relatedNodes.length > 0) {
            const chipsHtml = relatedNodes.map(n =>
                `<button class="alc-kg-node-chip" data-node-id="${n.id}" title="${$.escapeHtml(n.title)}">` +
                `<span class="alc-kg-node-chip__icon">${n.icon || '📌'}</span>` +
                `<span class="alc-kg-node-chip__title">${$.escapeHtml(n.title)}</span>` +
                `</button>`
            ).join('');
            contentEl.insertAdjacentHTML('beforeend',
                `<div class="alc-kg-nodes-bar">` +
                `<span class="alc-kg-nodes-label">📍 相关知识点：</span>${chipsHtml}</div>`
            );
        }

        messageEl.appendChild(contentEl);
        messagesEl.appendChild(messageEl);
        messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    /**
     * 将 AI 回答中的【第X页】标记转换为可点击的页码链接。
     * 支持格式：【第3页】、【第3,4页】、【第3、4页】
     */
    function linkifyPageReferences(html) {
        // 同时匹配简体「页」和繁体「頁」，以及 page/p. 等英文格式
        // 支持：【第42页】【第42頁】【第42-44页】【第42,43页】
        return html.replace(
            /【第([\d,、\u2013\-]+)[页頁]】/g,
            (match, pages) => {
                // 取第一个页码作为跳转目标
                const firstPage = parseInt(pages.replace(/[、\u2013\-]/g, ',').split(',')[0], 10);
                if (isNaN(firstPage)) return match;
                return `<span class="alc-page-ref" data-page="${firstPage}" title="跳转到第${firstPage}页">${match}</span>`;
            }
        );
    }

    /**
     * 跳转 PDF iframe 到指定页码。
     * 利用 PDF Open Parameters 标准：在 URL 后添加 #page=N。
     */
    function navigatePdfToPage(page) {
        const iframe = document.querySelector('.alc-ebook-doc-iframe');
        if (!iframe) {
            console.warn('未找到 PDF iframe，无法跳转页码');
            return;
        }

        const currentSrc = iframe.src || '';
        const baseSrc = currentSrc.replace(/#.*$/, '');
        const newSrc = `${baseSrc}#page=${page}`;

        // 使用 contentWindow.location.replace() 导航到带页码的 URL
        // Chrome PDF viewer 只在加载时读取 #page=N，hash 变化不会触发跳页
        // replace() 会利用浏览器缓存，PDF 文件不重新下载，减少闪烁
        try {
            iframe.contentWindow.location.replace(newSrc);
        } catch (e) {
            // 跨域 iframe fallback
            iframe.src = newSrc;
        }

        $.showToast(`已跳转到第 ${page} 页`, 'info');
    }

    // Register module functions
    $.modules.aiChat = {
        setupAiAssistant,
        setupAiFloatingWindow,
        sendAiQuestion,
        clearAiContext,
        toggleAiWindow,
        toggleAiWindowSize,
        updateAiContextIndicator,
        navigateToKnowledgeNode,
    };
})();
