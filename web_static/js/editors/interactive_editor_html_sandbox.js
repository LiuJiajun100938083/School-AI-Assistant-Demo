/**
 * 互动活动编辑器 — 代碼動畫 (html_sandbox) 模板
 *
 * 依赖: interactive_editor.js (提供 _registerInteractiveTemplateEditor + _interactiveEditorHelpers)
 */
'use strict';

(function () {
    const helpers = window._interactiveEditorHelpers;
    const escapeHtml = helpers?.escapeHtml || (s => s || '');
    if (!helpers) return;

    const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
    .box { width: 100px; height: 100px; background: #34C759; border-radius: 12px; }
  </style>
</head>
<body>
  <div class="box"></div>
</body>
</html>`;

    function getDefaultConfig() {
        return {
            template: 'html_sandbox',
            time_limit: 0,
            show_leaderboard: false,
            html_sandbox: {
                instruction: '查看互動內容',
                html_content: DEFAULT_HTML,
                allow_student_edit: false,
                sandbox_type: 'html',
            },
        };
    }

    function render(container, onCreate) {
        const cfg = getDefaultConfig();
        const hs = cfg.html_sandbox;

        container.innerHTML = `
            <div id="hsCommonFields"></div>
            <div class="config-section">
                <label class="config-label">HTML 內容</label>
                <textarea id="hsHtmlContent" class="config-input" style="min-height:180px;font-family:monospace;font-size:12px;tab-size:2;line-height:1.5;background:#1E1E1E;color:#D4D4D4;border-radius:8px;padding:12px;">${escapeHtml(DEFAULT_HTML)}</textarea>
            </div>
            <div class="config-section" style="display:flex;gap:12px;">
                <button id="hsPreviewBtn" class="ppt-upload-btn" style="flex:1;padding:8px;">預覽 HTML</button>
            </div>
            <div id="hsPreviewFrame" style="display:none;border:1px solid var(--border);border-radius:8px;overflow:hidden;height:200px;margin-bottom:12px;"></div>
            <div class="config-section">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <input type="checkbox" id="hsAllowEdit"> 允許學生編輯代碼 (Beta)
                </label>
            </div>
            <button id="hsCreateBtn" class="ppt-upload-btn" style="width:100%;margin-top:12px;background:var(--brand,#34C759);color:#fff;font-weight:600;">
                建立代碼動畫活動
            </button>
        `;

        helpers.renderCommonFields(container.querySelector('#hsCommonFields'), hs, { hideLeaderboard: true });

        // Tab key inserts spaces
        const textarea = container.querySelector('#hsHtmlContent');
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = textarea.selectionStart;
                const end = textarea.selectionEnd;
                textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
                textarea.selectionStart = textarea.selectionEnd = start + 2;
            }
        });

        // Preview
        container.querySelector('#hsPreviewBtn').addEventListener('click', () => {
            const frame = container.querySelector('#hsPreviewFrame');
            frame.style.display = 'block';
            frame.innerHTML = '';
            const iframe = document.createElement('iframe');
            iframe.sandbox = 'allow-scripts';
            iframe.style.cssText = 'width:100%;height:100%;border:none;';
            frame.appendChild(iframe);
            iframe.srcdoc = textarea.value;
        });

        container.querySelector('#hsCreateBtn').addEventListener('click', () => {
            const htmlContent = textarea.value.trim();
            if (!htmlContent) return alert('請輸入 HTML 內容');

            const common = helpers.collectCommonFields(container.querySelector('#hsCommonFields'));
            onCreate({
                template: 'html_sandbox',
                time_limit: common.time_limit || 0,
                show_leaderboard: false,
                html_sandbox: {
                    instruction: common.instruction || '查看互動內容',
                    html_content: htmlContent,
                    allow_student_edit: container.querySelector('#hsAllowEdit').checked,
                    sandbox_type: 'html',
                },
            });
        });
    }

    function renderConfig(slide, $el) {
        const cfg = slide.config || {};
        const hs = cfg.html_sandbox || {};

        $el.innerHTML = `
            <div class="config-section">
                <label class="config-label">指令文本</label>
                <input type="text" class="config-input" id="cfgHsInstruction" value="${escapeHtml(hs.instruction || '')}">
            </div>
            <div class="config-section">
                <label class="config-label">HTML 內容</label>
                <textarea id="cfgHsHtml" class="config-input" style="min-height:150px;font-family:monospace;font-size:12px;tab-size:2;background:#1E1E1E;color:#D4D4D4;border-radius:8px;padding:12px;">${escapeHtml(hs.html_content || '')}</textarea>
            </div>
            <div class="config-section">
                <label style="display:flex;align-items:center;gap:6px;font-size:13px;">
                    <input type="checkbox" id="cfgHsAllowEdit" ${hs.allow_student_edit ? 'checked' : ''}> 允許學生編輯代碼 (Beta)
                </label>
            </div>
            <div class="config-section">
                <label class="config-label">時間限制 (秒, 0=無限)</label>
                <input type="number" class="config-input" id="cfgHsTimeLimit" value="${cfg.time_limit || 0}" min="0" step="10">
            </div>
        `;

        // Tab key
        const textarea = $el.querySelector('#cfgHsHtml');
        if (textarea) {
            textarea.addEventListener('keydown', (e) => {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    const s = textarea.selectionStart, end = textarea.selectionEnd;
                    textarea.value = textarea.value.substring(0, s) + '  ' + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = s + 2;
                }
            });
        }
    }

    function collectConfig(slide) {
        return {
            template: 'html_sandbox',
            time_limit: parseInt(document.getElementById('cfgHsTimeLimit')?.value) || 0,
            show_leaderboard: false,
            html_sandbox: {
                instruction: document.getElementById('cfgHsInstruction')?.value?.trim() || '查看互動內容',
                html_content: document.getElementById('cfgHsHtml')?.value || '',
                allow_student_edit: document.getElementById('cfgHsAllowEdit')?.checked ?? false,
                sandbox_type: 'html',
            },
        };
    }

    const editor = { render, renderConfig, collectConfig, getDefaultConfig };
    if (window._registerInteractiveTemplateEditor) {
        window._registerInteractiveTemplateEditor('html_sandbox', editor);
    }
})();
