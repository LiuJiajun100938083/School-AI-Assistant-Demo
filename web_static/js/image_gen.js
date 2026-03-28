/**
 * AI 圖片生成頁面
 * ================
 * 全局掛載: window.ImageGenApp
 *
 * 職責:
 * 1. 認證檢查
 * 2. Prompt 輸入管理（字數、快捷鍵）
 * 3. SSE 流式消費（queue → status → progress → complete / error）
 * 4. 結果展示與下載
 *
 * 前端狀態機:
 *   idle → submitting → queued → generating → progress → completed / error
 */
'use strict';

const ImageGenApp = {
    _els: {},
    _lastImage: null,

    /**
     * 前端狀態機 — 同一時刻只有一個主狀態。
     * 所有 SSE 事件和本地操作都走狀態遷移。
     */
    _state: 'idle',  // idle | submitting | queued | generating | progress | completed | error

    /* ---------- 初始化 ---------- */

    init() {
        if (typeof i18n !== 'undefined') i18n.applyDOM();

        this._els = {
            prompt:     document.getElementById('promptInput'),
            charCount:  document.getElementById('charCount'),
            genBtn:     document.getElementById('generateBtn'),
            statusArea: document.getElementById('statusArea'),
            statusText: document.getElementById('statusText'),
            resultArea: document.getElementById('resultArea'),
            resultImg:  document.getElementById('resultImage'),
            downloadBtn:document.getElementById('downloadBtn'),
            newGenBtn:  document.getElementById('newGenBtn'),
            errorArea:  document.getElementById('errorArea'),
            errorText:  document.getElementById('errorText'),
        };

        if (!AuthModule.getToken()) {
            window.location.href = '/login';
            return;
        }

        this._bindEvents();
    },

    /* ---------- 事件綁定 ---------- */

    _bindEvents() {
        const { prompt, genBtn, downloadBtn, newGenBtn } = this._els;

        // 字數統計
        prompt.addEventListener('input', () => {
            this._els.charCount.textContent = `${prompt.value.length} / 500`;
        });

        // 生成按鈕
        genBtn.addEventListener('click', () => this._generate());

        // Ctrl/Cmd + Enter 快捷鍵
        prompt.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this._generate();
            }
        });

        // 下載
        downloadBtn.addEventListener('click', () => this._download());

        // 重新生成
        newGenBtn.addEventListener('click', () => {
            this._transitionTo('idle');
            this._els.prompt.focus();
        });
    },

    /* ---------- 狀態遷移 ---------- */

    _transitionTo(newState, data) {
        const prev = this._state;
        // 防止不合法遷移（終態 → 排隊）
        if (prev === 'completed' && newState === 'queued') return;
        if (prev === 'error' && newState === 'queued') return;

        this._state = newState;

        switch (newState) {
            case 'idle':
                this._els.genBtn.disabled = false;
                this._els.prompt.disabled = false;
                this._els.genBtn.textContent = i18n.t('ig.generateBtn');
                this._els.statusArea.style.display = 'none';
                this._els.resultArea.style.display = 'none';
                this._els.errorArea.style.display = 'none';
                break;

            case 'submitting':
                this._els.genBtn.disabled = true;
                this._els.prompt.disabled = true;
                this._els.genBtn.textContent = i18n.t('ig.submitting');
                this._els.statusArea.style.display = 'flex';
                this._els.statusText.textContent = i18n.t('ig.submittingStatus');
                this._els.resultArea.style.display = 'none';
                this._els.errorArea.style.display = 'none';
                // 提交超時兜底（30 秒無 SSE → error）
                this._submitTimeout = setTimeout(() => {
                    if (this._state === 'submitting') {
                        this._transitionTo('error', { message: i18n.t('ig.connectionError') });
                    }
                }, 30000);
                break;

            case 'queued': {
                if (this._submitTimeout) { clearTimeout(this._submitTimeout); this._submitTimeout = null; }
                this._els.statusArea.style.display = 'flex';
                const { position: pos, total, est_wait: est } = data || {};
                let text = i18n.t('ig.queueStatus', { pos, total });
                if (est) text += `，${est}`;
                text += ')';
                // 淡入讓學生感知隊列在動
                this._els.statusText.style.transition = 'opacity 0.3s';
                this._els.statusText.style.opacity = '0.7';
                this._els.statusText.textContent = text;
                requestAnimationFrame(() => { this._els.statusText.style.opacity = '1'; });
                break;
            }

            case 'generating':
                if (this._submitTimeout) { clearTimeout(this._submitTimeout); this._submitTimeout = null; }
                this._els.statusArea.style.display = 'flex';
                this._els.statusText.style.transition = '';
                this._els.statusText.textContent = (data && data.message) || i18n.t('ig.generating');
                break;

            case 'progress': {
                const step = data.step || 0;
                const total = data.total || 0;
                const pct = total > 0 ? Math.round((step / total) * 100) : 0;
                this._els.statusText.textContent =
                    total > 0 ? i18n.t('ig.progressPct', { pct, step, total }) : i18n.t('ig.progressFallback');
                break;
            }

            case 'completed':
                if (this._submitTimeout) { clearTimeout(this._submitTimeout); this._submitTimeout = null; }
                this._lastImage = data.image;
                this._els.resultImg.src = `data:image/png;base64,${data.image}`;
                this._els.resultArea.style.display = 'block';
                this._els.statusArea.style.display = 'none';
                this._els.genBtn.disabled = false;
                this._els.prompt.disabled = false;
                this._els.genBtn.textContent = i18n.t('ig.generateBtn');
                break;

            case 'error':
                if (this._submitTimeout) { clearTimeout(this._submitTimeout); this._submitTimeout = null; }
                this._els.errorText.textContent = (data && data.message) || i18n.t('ig.errorDefault');
                this._els.errorArea.style.display = 'block';
                this._els.statusArea.style.display = 'none';
                this._els.genBtn.disabled = false;
                this._els.prompt.disabled = false;
                this._els.genBtn.textContent = i18n.t('ig.generateBtn');
                break;
        }
    },

    /* ---------- 生成流程 ---------- */

    async _generate() {
        // 非 idle/completed/error 狀態下禁止重複提交
        if (!['idle', 'completed', 'error'].includes(this._state)) return;

        const prompt = this._els.prompt.value.trim();
        if (!prompt) {
            this._transitionTo('error', { message: i18n.t('ig.errorEmptyPrompt') });
            return;
        }

        // 200ms 內本地回饋
        this._transitionTo('submitting');

        try {
            const resp = await fetch('/api/image-gen/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AuthModule.getToken()}`,
                },
                body: JSON.stringify({ prompt }),
            });

            if (!resp.ok) {
                let msg = i18n.t('ig.errorRequestFailed');
                try {
                    const err = await resp.json();
                    msg = err.error?.message || err.detail || msg;
                } catch (_) { /* ignore parse error */ }
                throw new Error(msg);
            }

            // 消費 SSE 流
            await this._consumeSSE(resp);
        } catch (err) {
            this._transitionTo('error', { message: err.message || i18n.t('ig.errorGenFailed') });
        }
    },

    async _consumeSSE(resp) {
        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                try {
                    const data = JSON.parse(line.slice(6));
                    this._handleMessage(data);
                } catch (_) { /* skip unparseable */ }
            }
        }
    },

    _handleMessage(data) {
        switch (data.type) {
            case 'queue':
                this._transitionTo('queued', data);
                break;
            case 'status':
                this._transitionTo('generating', data);
                break;
            case 'progress':
                this._transitionTo('progress', data);
                break;
            case 'complete':
                this._transitionTo('completed', data);
                break;
            case 'error':
                this._transitionTo('error', data);
                break;
        }
    },

    /* ---------- UI 輔助 ---------- */

    _download() {
        if (!this._lastImage) return;
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${this._lastImage}`;
        a.download = `ai-image-${Date.now()}.png`;
        a.click();
    },
};

document.addEventListener('DOMContentLoaded', () => ImageGenApp.init());
