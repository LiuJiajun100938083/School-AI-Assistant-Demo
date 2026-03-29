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
    let _progressTimer = null;
    let _progressValue = 0;
    let _streamBuffer = '';  // 串流累積文字（用於進度條代碼預覽）
    let _progressEl = null;  // 進度條 DOM 元素（掛在 chatMessages 內）

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

    function _showProgress() {
        _progressValue = 5;
        _progressEl = document.createElement('div');
        _progressEl.className = 'gs-msg gs-msg--ai';
        _progressEl.id = 'genProgress';
        _progressEl.innerHTML = `
            <span class="gs-msg__label">AI</span>
            <div class="gs-msg__body">
                <div class="gs-progress__label">
                    <span>正在生成遊戲...</span>
                    <span>預計約 20 秒</span>
                </div>
                <div class="gs-progress__bar-track">
                    <div class="gs-progress__bar-fill" id="progressFill" style="width:5%"></div>
                </div>
                <div class="gs-progress__hint">AI 正在構建遊戲邏輯與介面</div>
                <div class="gs-progress__code"><pre id="progressCodePre"></pre></div>
            </div>`;
        const container = document.getElementById('chatMessages');
        if (container) {
            container.appendChild(_progressEl);
            container.scrollTop = container.scrollHeight;
        }
        clearInterval(_progressTimer);
        _progressTimer = setInterval(() => {
            _progressValue = Math.min(_progressValue + 2, 92);
            const fill = document.getElementById('progressFill');
            if (fill) fill.style.width = _progressValue + '%';
        }, 1000);
    }

    function _hideProgress(success = true) {
        clearInterval(_progressTimer);
        _progressTimer = null;
        if (!_progressEl) return;
        if (success) {
            const fill = _progressEl.querySelector('#progressFill');
            if (fill) fill.style.width = '100%';
            setTimeout(() => { _progressEl?.remove(); _progressEl = null; }, 500);
        } else {
            _progressEl.remove();
            _progressEl = null;
        }
    }

    function _updateProgressCode(text) {
        if (!_progressEl) return;
        const pre = _progressEl.querySelector('#progressCodePre');
        if (!pre) return;
        // 只顯示最後 18 行，讓底部永遠是最新的
        const lines = text.split('\n');
        pre.textContent = lines.slice(-18).join('\n');
    }

    async function sendToAI(prompt) {
        if (!prompt.trim()) return;

        // 並發保護：取消舊請求
        if (state.generating && _abortController) {
            _abortController.abort();
        }

        _abortController = new AbortController();
        state.generating = true;
        state._gotInstructions = false;
        _streamBuffer = '';
        _updateUI();
        _showProgress();

        addMessage('user', prompt);

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
            if (e.name === 'AbortError') {
                _hideProgress(false);
                return;
            }
            _hideProgress(false);
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
                // chunk event — 更新進度條中的代碼預覽（不再單獨顯示 AI 氣泡）
                _streamBuffer += data.content;
                _updateProgressCode(_streamBuffer);
            }
            if (data.html !== undefined) {
                // code event — 提取到的 HTML，更新預覽
                setCode(data.html);
            }
            if (data.text !== undefined) {
                // instructions event — 生成完成，顯示玩法介紹氣泡
                state._gotInstructions = true;
                _hideProgress(true);
                addMessage('assistant', data.text);
            }
            if (data.message !== undefined && !data.content && !data.html && !data.phase && !data.text) {
                // error event
                _hideProgress(false);
                addMessage('system', data.message);
            }
            // done event — 空對象 {}
            if (Object.keys(data).length === 0) {
                _hideProgress(true);
                if (!state._gotInstructions && state.code) {
                    addMessage('assistant', '遊戲已生成！請在右側查看預覽，滿意後點擊下方按鈕填寫資料並上傳。');
                }
            }
        } catch {
            // 非 JSON，忽略
        }
    }

    function _buildHistory() {
        // 只取 user/assistant 消息，跳過 system
        const history = state.messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .filter(m => m.content.trim())
            .slice(-12);  // 最近 6 輪

        // 如果已有生成代碼，注入為 system 上下文，讓 AI 基於此代碼修改
        if (state.code) {
            return [
                {
                    role: 'system',
                    content: `當前遊戲代碼（請根據用戶要求修改此代碼，輸出完整修改後代碼 + 玩法介紹）：\n\`\`\`html\n${state.code}\n\`\`\``
                },
                ...history
            ];
        }
        return history;
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
        container.innerHTML = state.messages.map(m => {
            const cls = m.role === 'user' ? 'gs-msg--user'
                      : m.role === 'assistant' ? 'gs-msg--ai'
                      : 'gs-msg--system';
            const label = m.role === 'user' ? '你' : m.role === 'assistant' ? 'AI' : '系統';
            const body = _formatMessageContent(m.content);
            return `<div class="gs-msg ${cls}">
                <span class="gs-msg__label">${label}</span>
                <div class="gs-msg__body">${body}</div>
            </div>`;
        }).join('');
        // 如果正在生成，把進度條氣泡重新掛到末尾（innerHTML 會清掉它）
        if (_progressEl) container.appendChild(_progressEl);
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

        // 可見性（分段按鈕 + 班級選擇）
        const visValue = modal.querySelector('.gs-visibility__btn--active')?.dataset.value || 'private';
        formData.append('is_public', (visValue === 'public').toString());
        formData.append('teacher_only', (visValue === 'teacher').toString());
        const visibleTo = [];
        modal.querySelectorAll('input[name="visible_to"]:checked').forEach(cb => visibleTo.push(cb.value));
        formData.append('visible_to', JSON.stringify(visibleTo));

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

    /** 從數據庫加載班級列表並生成 checkbox */
    async function _generateClassCheckboxes() {
        const container = document.getElementById('classCheckboxes');
        const section = document.getElementById('classSelectSection');
        if (!container || !section) return;

        try {
            const token = localStorage.getItem('auth_token');
            const resp = await fetch('/api/classroom/classes', {
                headers: { 'Authorization': `Bearer ${token}` },
            });
            if (!resp.ok) return;
            const data = await resp.json();

            // API 返回 {success, data: {grades: {"中一": [{class_code, class_name}, ...], ...}}}
            const grades = data.data?.grades || data.grades || {};
            const allClasses = [];
            for (const [grade, classList] of Object.entries(grades)) {
                for (const cls of classList) {
                    const name = typeof cls === 'string' ? cls : (cls.class_name || cls.class_code || '');
                    if (name) allClasses.push(name);
                }
            }

            if (allClasses.length === 0) {
                // 數據庫沒有班級，隱藏班級選擇區
                section.dataset.noClasses = 'true';
                return;
            }

            container.innerHTML = allClasses.map(c =>
                `<label><input type="checkbox" name="visible_to" value="${c}"> ${c}</label>`
            ).join('');
        } catch {
            // 靜默失敗，班級選擇不可用
        }
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

        // 可見性分段按鈕 + 班級選擇聯動
        const visControl = document.getElementById('visibilityControl');
        const visHint = document.getElementById('visibilityHint');
        const classSection = document.getElementById('classSelectSection');
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
                // 公開時顯示班級選擇（僅數據庫有班級時）
                if (classSection && classSection.dataset.noClasses !== 'true') {
                    classSection.style.display = btn.dataset.value === 'public' ? 'block' : 'none';
                }
            });
        }
        // 生成班級 checkbox（中一到中六 × A-D）
        _generateClassCheckboxes();

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
