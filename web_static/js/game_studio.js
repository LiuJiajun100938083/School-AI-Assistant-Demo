/**
 * GameStudio — 遊戲創作工作室狀態機
 *
 * 架構：
 *   狀態層（本文件）— 單一數據源，驅動所有 UI 更新
 *   組件層 — ChatPanel / CodeEditor / PreviewFrame / UploadModal
 *   API 層 — 復用 shared/api.js + SSE fetch
 *
 * 狀態流：idle → generating → preview → editing → submitting → done
 */
'use strict';

const GameStudio = (() => {
    // ════════════════════════════════════════════════════
    // State（唯一真相源）
    // ════════════════════════════════════════════════════

    const state = {
        mode: 'chat',           // 'chat' | 'code'
        code: '',               // 當前 HTML 代碼
        originalCode: '',       // 編輯模式：初始代碼（dirty check 用）
        messages: [],           // AI 對話歷史 [{role, content}]
        generating: false,      // AI 是否正在生成
        editUUID: null,         // 編輯模式 game UUID
        dirty: false,           // 代碼是否被修改
    };

    let _abortController = null;

    // ════════════════════════════════════════════════════
    // 狀態修改方法（所有 UI 變更都走這裡）
    // ════════════════════════════════════════════════════

    function setMode(mode) {
        state.mode = mode;
        document.querySelectorAll('.gs-tab').forEach(t =>
            t.classList.toggle('gs-tab--active', t.dataset.mode === mode)
        );
        document.getElementById('chatPanel').style.display = mode === 'chat' ? 'flex' : 'none';
        document.getElementById('editorPanel').style.display = mode === 'code' ? 'flex' : 'none';
        if (mode === 'code') {
            document.getElementById('codeEditor').value = state.code;
        }
    }

    function setCode(code) {
        state.code = code;
        state.dirty = code !== state.originalCode;
        _updatePreview();
        // 如果在代碼模式，同步到編輯器
        if (state.mode === 'code') {
            document.getElementById('codeEditor').value = code;
        }
        _updateFooter();
    }

    function addMessage(role, content) {
        state.messages.push({ role, content });
        _renderMessages();
    }

    // ════════════════════════════════════════════════════
    // 核心業務：AI 生成
    // ════════════════════════════════════════════════════

    async function sendToAI(prompt) {
        if (!prompt.trim()) return;

        // 並發保護：取消舊請求
        if (state.generating && _abortController) {
            _abortController.abort();
        }

        _abortController = new AbortController();
        state.generating = true;
        _updateUI();

        addMessage('user', prompt);
        addMessage('assistant', '');  // 佔位，流式填充

        const token = localStorage.getItem('auth_token');
        const history = _buildHistory();

        try {
            const resp = await fetch('/api/games/ai/stream', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ prompt, history }),
                signal: _abortController.signal,
            });

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({ detail: resp.statusText }));
                throw new Error(err.detail || err.message || '請求失敗');
            }

            const reader = resp.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('event: ')) {
                        // 解析下一行的 data
                        continue;
                    }
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') continue;
                        _handleSSEData(line, lines);
                    }
                }
            }

        } catch (e) {
            if (e.name === 'AbortError') return;
            addMessage('system', `生成失敗：${e.message}`);
        } finally {
            state.generating = false;
            _abortController = null;
            _updateUI();
        }
    }

    function _handleSSEData(line, allLines) {
        // 找到對應的 event 類型
        const dataStr = line.slice(6).trim();
        try {
            const data = JSON.parse(dataStr);

            if (data.phase) {
                // status event
                return;
            }
            if (data.content !== undefined) {
                // chunk event — 追加到最後一條 assistant 消息
                const lastMsg = state.messages[state.messages.length - 1];
                if (lastMsg && lastMsg.role === 'assistant') {
                    lastMsg.content += data.content;
                    _renderLastMessage();
                }
            }
            if (data.html !== undefined) {
                // code event — 提取到的 HTML
                setCode(data.html);
            }
            if (data.message !== undefined && !data.content && !data.html && !data.phase) {
                // error event
                addMessage('system', data.message);
            }
        } catch {
            // 非 JSON，忽略
        }
    }

    function _buildHistory() {
        // 只取 user/assistant 消息，跳過 system
        return state.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .filter(m => m.content.trim())
            .slice(-12);  // 最近 6 輪
    }

    function stopGeneration() {
        if (_abortController) {
            _abortController.abort();
            state.generating = false;
            _updateUI();
        }
    }

    // ════════════════════════════════════════════════════
    // 組件：PreviewFrame
    // ════════════════════════════════════════════════════

    function _updatePreview() {
        const frame = document.getElementById('previewFrame');
        const empty = document.getElementById('previewEmpty');
        if (!state.code.trim()) {
            frame.style.display = 'none';
            if (empty) empty.style.display = 'flex';
            return;
        }
        frame.style.display = 'block';
        if (empty) empty.style.display = 'none';
        frame.srcdoc = state.code;
    }

    // ════════════════════════════════════════════════════
    // 組件：ChatPanel 渲染
    // ════════════════════════════════════════════════════

    /**
     * 格式化聊天消息內容：
     * - 檢測 ```html ... ``` 代碼塊 → 深色背景 + 語法高亮
     * - 普通文本 → 換行處理
     */
    function _formatMessageContent(text) {
        if (!text) return '';
        // 分割代碼塊和普通文本
        const parts = text.split(/(```[\s\S]*?```)/g);
        return parts.map(part => {
            if (part.startsWith('```')) {
                // 提取語言和代碼
                const match = part.match(/^```(\w*)\n?([\s\S]*?)```$/);
                if (match) {
                    const lang = match[1] || 'html';
                    const code = match[2].trim();
                    // 用 highlight.js 高亮
                    let highlighted;
                    if (typeof hljs !== 'undefined') {
                        try {
                            highlighted = hljs.highlight(code, { language: lang }).value;
                        } catch {
                            highlighted = _escapeHtml(code);
                        }
                    } else {
                        highlighted = _escapeHtml(code);
                    }
                    return `<div class="gs-code-block">
                        <div class="gs-code-block__header">
                            <span class="gs-code-block__lang">${lang.toUpperCase()}</span>
                            <button class="gs-code-block__copy" onclick="navigator.clipboard.writeText(this.closest('.gs-code-block').querySelector('code').textContent)"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-1px"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> 複製</button>
                        </div>
                        <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
                    </div>`;
                }
            }
            // 普通文本
            return _escapeHtml(part).replace(/\n/g, '<br>');
        }).join('');
    }

    function _renderMessages() {
        const container = document.getElementById('chatMessages');
        container.innerHTML = state.messages.map((m, i) => {
            const cls = m.role === 'user' ? 'gs-msg--user'
                      : m.role === 'assistant' ? 'gs-msg--ai'
                      : 'gs-msg--system';
            const label = m.role === 'user' ? '你' : m.role === 'assistant' ? 'AI' : '系統';
            const body = _formatMessageContent(m.content) || (state.generating && i === state.messages.length - 1 ? '<span class="gs-typing">思考中...</span>' : '');
            return `<div class="gs-msg ${cls}">
                <span class="gs-msg__label">${label}</span>
                <div class="gs-msg__body">${body}</div>
            </div>`;
        }).join('');
        container.scrollTop = container.scrollHeight;
    }

    function _renderLastMessage() {
        const msgs = document.querySelectorAll('#chatMessages .gs-msg');
        const last = msgs[msgs.length - 1];
        if (last) {
            const body = last.querySelector('.gs-msg__body');
            const lastMsg = state.messages[state.messages.length - 1];
            body.innerHTML = _formatMessageContent(lastMsg.content);
        }
        document.getElementById('chatMessages').scrollTop = 999999;
    }

    // ════════════════════════════════════════════════════
    // 組件：UploadModal
    // ════════════════════════════════════════════════════

    function openUploadModal() {
        const errors = _validateBeforeUpload();
        if (errors.length) {
            alert(errors.join('\n'));
            return;
        }
        document.getElementById('uploadModal').classList.add('gs-modal--open');
    }

    function closeUploadModal() {
        document.getElementById('uploadModal').classList.remove('gs-modal--open');
    }

    async function submitGame() {
        const modal = document.getElementById('uploadModal');
        const name = modal.querySelector('#modalGameName').value.trim();
        const desc = modal.querySelector('#modalGameDesc').value.trim();
        const subject = modal.querySelector('#modalGameSubject').value;

        if (!name || !desc || !subject) {
            _showModalError('請填寫遊戲名稱、描述和學科');
            return;
        }

        const token = localStorage.getItem('auth_token');
        const formData = new FormData();
        formData.append('name', name);
        formData.append('description', desc);
        formData.append('subject', subject);
        formData.append('html_content', state.code);
        formData.append('icon', modal.querySelector('.icon-option.selected')?.dataset.icon || 'gamepad');

        // 收集年級
        const grades = [];
        modal.querySelectorAll('input[name="difficulty"]:checked').forEach(cb => grades.push(cb.value));
        formData.append('difficulty', JSON.stringify(grades));

        // 標籤
        const tagsRaw = (modal.querySelector('#modalGameTags')?.value || '').trim();
        const tags = tagsRaw ? tagsRaw.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];
        formData.append('tags', JSON.stringify(tags));

        // 可見性（分段按鈕）
        const visValue = modal.querySelector('.gs-visibility__btn--active')?.dataset.value || 'private';
        formData.append('is_public', (visValue === 'public').toString());
        formData.append('teacher_only', (visValue === 'teacher').toString());
        formData.append('visible_to', '[]');

        try {
            const url = state.editUUID ? `/api/games/${state.editUUID}` : '/api/games/upload';
            const method = state.editUUID ? 'PUT' : 'POST';
            const headers = { 'Authorization': `Bearer ${token}` };

            let resp;
            if (state.editUUID) {
                // PUT uses JSON
                const body = { name, description: desc, subject, html_content: state.code };
                resp = await fetch(url, {
                    method, headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                });
            } else {
                resp = await fetch(url, { method, headers, body: formData });
            }

            if (!resp.ok) {
                const err = await resp.json().catch(() => ({}));
                throw new Error(err.detail || err.message || '提交失敗');
            }

            state.dirty = false;
            window.location.href = '/static/my_games.html';
        } catch (e) {
            _showModalError(e.message);
        }
    }

    function _showModalError(msg) {
        const el = document.getElementById('modalError');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
    }

    // ════════════════════════════════════════════════════
    // 校驗
    // ════════════════════════════════════════════════════

    function _validateBeforeUpload() {
        const errors = [];
        if (!state.code.trim()) errors.push('尚未生成或編輯遊戲代碼');
        if (state.code.length > 5 * 1024 * 1024)
            errors.push(`代碼超過 5MB 限制（當前 ${(state.code.length/1024/1024).toFixed(1)}MB）`);
        if (!state.code.includes('<html') && !state.code.includes('<!DOCTYPE'))
            errors.push('代碼不包含有效的 HTML 結構');
        return errors;
    }

    // ════════════════════════════════════════════════════
    // UI 更新輔助
    // ════════════════════════════════════════════════════

    function _updateUI() {
        const sendBtn = document.getElementById('chatSendBtn');
        const stopBtn = document.getElementById('chatStopBtn');
        const input = document.getElementById('chatInput');
        if (sendBtn) sendBtn.style.display = state.generating ? 'none' : 'flex';
        if (stopBtn) stopBtn.style.display = state.generating ? 'flex' : 'none';
        if (input) input.disabled = state.generating;
        _updateFooter();
    }

    function _updateFooter() {
        const btn = document.getElementById('applyBtn');
        if (btn) btn.disabled = !state.code.trim();
    }

    function _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ════════════════════════════════════════════════════
    // 初始化
    // ════════════════════════════════════════════════════

    function init() {
        // Tab 切換
        document.querySelectorAll('.gs-tab').forEach(tab => {
            tab.addEventListener('click', () => setMode(tab.dataset.mode));
        });

        // 聊天發送
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSendBtn');
        const stopBtn = document.getElementById('chatStopBtn');

        if (sendBtn) sendBtn.addEventListener('click', () => {
            sendToAI(chatInput.value);
            chatInput.value = '';
        });
        if (stopBtn) stopBtn.addEventListener('click', stopGeneration);
        if (chatInput) chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendToAI(chatInput.value);
                chatInput.value = '';
            }
        });

        // 代碼編輯器 → debounce 預覽
        const codeEditor = document.getElementById('codeEditor');
        let debounceTimer;
        if (codeEditor) codeEditor.addEventListener('input', () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                setCode(codeEditor.value);
            }, 500);
        });

        // 上傳 Modal
        document.getElementById('applyBtn')?.addEventListener('click', openUploadModal);
        document.getElementById('modalCancelBtn')?.addEventListener('click', closeUploadModal);
        document.getElementById('modalSubmitBtn')?.addEventListener('click', submitGame);

        // Icon 選擇器
        document.querySelectorAll('#uploadModal .icon-option').forEach(opt => {
            opt.addEventListener('click', () => {
                document.querySelectorAll('#uploadModal .icon-option').forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
            });
        });

        // 可見性分段按鈕
        const visControl = document.getElementById('visibilityControl');
        const visHint = document.getElementById('visibilityHint');
        const VIS_HINTS = {
            private: '只有你自己能看到這個遊戲',
            public: '所有學生可以在遊戲中心看到並遊玩',
            teacher: '只有教師和管理員可以看到',
        };
        if (visControl) {
            visControl.addEventListener('click', (e) => {
                const btn = e.target.closest('.gs-visibility__btn');
                if (!btn) return;
                visControl.querySelectorAll('.gs-visibility__btn').forEach(b => b.classList.remove('gs-visibility__btn--active'));
                btn.classList.add('gs-visibility__btn--active');
                if (visHint) visHint.textContent = VIS_HINTS[btn.dataset.value] || '';
            });
        }

        // Dirty check — 離開提示
        window.addEventListener('beforeunload', (e) => {
            if (state.dirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });

        // 編輯模式
        const params = new URLSearchParams(window.location.search);
        const editUUID = params.get('edit');
        if (editUUID) {
            _loadEditMode(editUUID);
        } else {
            addMessage('system', '歡迎使用遊戲工作室！描述你想做的教育遊戲，AI 會幫你生成。');
        }
    }

    async function _loadEditMode(uuid) {
        state.editUUID = uuid;
        addMessage('system', '正在加載現有遊戲...');

        try {
            const token = localStorage.getItem('auth_token');
            const headers = { 'Authorization': `Bearer ${token}` };

            // 加載遊戲元信息
            const infoResp = await fetch(`/api/games/${uuid}`, { headers });
            const info = await infoResp.json();

            // 加載 HTML 代碼
            const codeResp = await fetch(`/uploaded_games/${uuid}?raw=1`, { headers });
            const html = await codeResp.text();

            state.originalCode = html;
            setCode(html);

            // 預填 Modal
            const modal = document.getElementById('uploadModal');
            const game = info.game || info;
            if (modal.querySelector('#modalGameName')) modal.querySelector('#modalGameName').value = game.name || '';
            if (modal.querySelector('#modalGameDesc')) modal.querySelector('#modalGameDesc').value = game.description || '';
            if (modal.querySelector('#modalGameSubject')) modal.querySelector('#modalGameSubject').value = game.subject || '';

            state.messages = [{ role: 'system', content: `已加載遊戲「${game.name}」，可以繼續用 AI 對話修改，或切換到代碼模式手動編輯。` }];
            _renderMessages();

        } catch (e) {
            addMessage('system', `加載失敗：${e.message}`);
        }
    }

    // ════════════════════════════════════════════════════
    // 公開 API
    // ════════════════════════════════════════════════════

    return {
        init,
        setMode,
        setCode,
        sendToAI,
        stopGeneration,
        openUploadModal,
        closeUploadModal,
        submitGame,
        get state() { return state; },
    };
})();

// 頁面加載後初始化
document.addEventListener('DOMContentLoaded', GameStudio.init);
