/**
 * AI 圖片生成頁面
 * ================
 * 全局掛載: window.ImageGenApp
 *
 * 職責:
 * 1. 認證檢查
 * 2. Prompt 輸入管理（字數、快捷鍵）
 * 3. SSE 流式消費（status → progress → complete / error）
 * 4. 結果展示與下載
 */
'use strict';

const ImageGenApp = {
    _els: {},
    _isGenerating: false,
    _lastImage: null,

    /* ---------- 初始化 ---------- */

    init() {
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
            this._els.resultArea.style.display = 'none';
            this._els.prompt.focus();
        });
    },

    /* ---------- 生成流程 ---------- */

    async _generate() {
        if (this._isGenerating) return;

        const prompt = this._els.prompt.value.trim();
        if (!prompt) {
            this._showError('請輸入圖片描述');
            return;
        }

        this._isGenerating = true;
        this._setLoading(true);
        this._hideError();
        this._els.resultArea.style.display = 'none';

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
                let msg = '請求失敗';
                try {
                    const err = await resp.json();
                    msg = err.error?.message || err.detail || msg;
                } catch (_) { /* ignore parse error */ }
                throw new Error(msg);
            }

            // 消費 SSE 流
            await this._consumeSSE(resp);
        } catch (err) {
            this._showError(err.message || '生成失敗');
        } finally {
            this._isGenerating = false;
            this._setLoading(false);
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
            case 'status':
                this._els.statusText.textContent = data.message;
                break;
            case 'progress': {
                const step = data.step || 0;
                const total = data.total || 0;
                const pct = total > 0 ? Math.round((step / total) * 100) : 0;
                this._els.statusText.textContent =
                    total > 0 ? `生成中... ${pct}% (${step}/${total})` : '生成中...';
                break;
            }
            case 'complete':
                this._showImage(data.image);
                break;
            case 'error':
                this._showError(data.message);
                break;
        }
    },

    /* ---------- UI 更新 ---------- */

    _showImage(base64) {
        this._lastImage = base64;
        this._els.resultImg.src = `data:image/png;base64,${base64}`;
        this._els.resultArea.style.display = 'block';
        this._els.statusArea.style.display = 'none';
    },

    _download() {
        if (!this._lastImage) return;
        const a = document.createElement('a');
        a.href = `data:image/png;base64,${this._lastImage}`;
        a.download = `ai-image-${Date.now()}.png`;
        a.click();
    },

    _setLoading(on) {
        this._els.genBtn.disabled = on;
        this._els.prompt.disabled = on;
        this._els.genBtn.textContent = on ? '生成中...' : '生成圖片';
        this._els.statusArea.style.display = on ? 'flex' : 'none';
    },

    _showError(msg) {
        this._els.errorText.textContent = msg;
        this._els.errorArea.style.display = 'block';
        this._els.statusArea.style.display = 'none';
    },

    _hideError() {
        this._els.errorArea.style.display = 'none';
    },
};

document.addEventListener('DOMContentLoaded', () => ImageGenApp.init());
