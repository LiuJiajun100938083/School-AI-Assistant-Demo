/**
 * 上傳遊戲 — 前端核心模組
 * ========================
 *
 * 架構：
 *   GameUploadPage — 主控制器類（包含所有邏輯）
 *
 * 依賴共享模組: AuthModule, APIClient, UIModule, Utils
 * 加載順序: shared/* → game_upload.js
 */
'use strict';

class GameUploadPage {
    constructor() {
        this.selectedFile = null;
        this.selectedIcon = '🎮';
        this.uploadMode = 'file'; // 'file' or 'code'
        this.editMode = false;
        this.editUuid = null;

        this.initElements();
        this.bindEvents();
        this.checkAuth();
        this.loadSubjects().then(() => this.checkEditMode());
    }

    async checkEditMode() {
        const editUuid = Utils.getQueryParam('edit');
        if (editUuid) {
            this.editMode = true;
            this.editUuid = editUuid;
            await this.loadGameForEdit(editUuid);
        }
    }

    async loadGameForEdit(uuid) {
        try {
            const data = await APIClient.get(
                `/api/games/${uuid}`
            );

            if (data.success && data.data) {
                const game = data.data;

                // 更新頁面標題
                document.querySelector('.page-title').textContent = '✏️ 編輯遊戲';
                this.submitBtn.textContent = '更新遊戲';

                // 填充表單
                document.getElementById('gameName').value = game.name || '';
                document.getElementById('gameNameEn').value = game.name_en || '';
                document.getElementById('gameDesc').value = game.description || '';
                document.getElementById('gameSubject').value = game.subject || 'ict';
                document.getElementById('gameTags').value = (game.tags || []).join(', ');

                // 設置圖標
                this.selectedIcon = game.icon || '🎮';
                document.querySelectorAll('.icon-option').forEach(opt => {
                    opt.classList.toggle('selected', opt.dataset.icon === this.selectedIcon);
                });

                // 設置年級
                const difficulty = game.difficulty || [];
                document.querySelectorAll('#difficultyGroup input').forEach(cb => {
                    const isChecked = difficulty.includes(cb.value);
                    cb.checked = isChecked;
                    cb.closest('.checkbox-label').classList.toggle('checked', isChecked);
                });

                // 設置可見性
                this.isPublicCheckbox.checked = game.is_public;
                this.visibilityLabel.textContent = game.is_public ? '學生可見' : '僅自己可見';
                this.visibilityLabel.classList.toggle('public', game.is_public);

                // 設置僅教師可見
                const teacherOnlyCb = document.getElementById('teacherOnly');
                if (teacherOnlyCb) {
                    teacherOnlyCb.checked = game.teacher_only || false;
                    this.updateTeacherOnlyUI();
                }

                // 設置班級可見性
                const visibleTo = game.visible_to || [];
                if (visibleTo.length > 0) {
                    document.querySelectorAll('#classGroup input').forEach(cb => {
                        cb.checked = visibleTo.includes(cb.value);
                        cb.closest('.checkbox-label')?.classList.toggle('checked', cb.checked);
                    });
                }
                if (game.is_public && !game.teacher_only) {
                    document.getElementById('classRestrictionSection').style.display = '';
                }

                // 切換到代碼模式
                this.switchUploadMode('code');

                // 嘗試加載現有代碼
                try {
                    const codeResponse = await fetch(`/uploaded_games/${uuid}?raw=1`);
                    if (codeResponse.ok) {
                        document.getElementById('htmlCode').value = await codeResponse.text();
                    }
                } catch {
                    console.log('無法加載現有代碼');
                }

                UIModule.toast('已載入遊戲資料，可以開始編輯', 'success');
            } else {
                throw new Error(data.message || '無法載入遊戲');
            }
        } catch (error) {
            console.error('加載遊戲失敗:', error);
            UIModule.toast('無法載入遊戲資料: ' + error.message, 'error');
        }
    }

    initElements() {
        this.form = document.getElementById('uploadForm');
        this.messageBox = document.getElementById('messageBox');
        this.submitBtn = document.getElementById('submitBtn');
        this.dropZone = document.getElementById('dropZone');
        this.fileInput = document.getElementById('fileInput');
        this.fileSelected = document.getElementById('fileSelected');
        this.isPublicCheckbox = document.getElementById('isPublic');
        this.visibilityLabel = document.getElementById('visibilityLabel');
        this.teacherOnlyCheckbox = document.getElementById('teacherOnly');
        this.teacherOnlyLabel = document.getElementById('teacherOnlyLabel');
        this.studentVisibilitySection = document.getElementById('studentVisibilitySection');
        this.classRestrictionSection = document.getElementById('classRestrictionSection');
        this.classGroup = document.getElementById('classGroup');

        this.generateClassCheckboxes();
    }

    bindEvents() {
        // 表單提交
        this.form.addEventListener('submit', (e) => this.handleSubmit(e));

        // 上傳方式切換
        document.querySelectorAll('.upload-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchUploadMode(tab.dataset.tab));
        });

        // 文件拖曳
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.dropZone.classList.add('dragover');
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.classList.remove('dragover');
        });
        this.dropZone.addEventListener('drop', (e) => this.handleFileDrop(e));
        this.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        document.getElementById('removeFile').addEventListener('click', () => this.removeFile());

        // 圖標選擇
        document.getElementById('iconSelector').addEventListener('click', (e) => {
            const option = e.target.closest('.icon-option');
            if (option) this.selectIcon(option);
        });

        // 年級複選框
        document.getElementById('difficultyGroup').addEventListener('click', (e) => {
            const label = e.target.closest('.checkbox-label');
            if (label) {
                const checkbox = label.querySelector('input');
                checkbox.checked = !checkbox.checked;
                label.classList.toggle('checked', checkbox.checked);
            }
        });

        // 僅教師可見切換
        this.teacherOnlyCheckbox.addEventListener('change', () => {
            this.updateTeacherOnlyUI();
        });

        // 學生可見性切換
        this.isPublicCheckbox.addEventListener('change', () => {
            const isPublic = this.isPublicCheckbox.checked;
            this.visibilityLabel.textContent = isPublic ? '學生可見' : '僅自己可見';
            this.visibilityLabel.classList.toggle('public', isPublic);
            this.classRestrictionSection.style.display = isPublic ? '' : 'none';
        });

        // 班級複選框
        this.classGroup.addEventListener('click', (e) => {
            const label = e.target.closest('.checkbox-label');
            if (label) {
                const checkbox = label.querySelector('input');
                checkbox.checked = !checkbox.checked;
                label.classList.toggle('checked', checkbox.checked);
            }
        });

        // 複製 AI 提示詞
        const copyBtn = document.getElementById('copyPromptBtn');
        const promptText = document.getElementById('aiPrompt');
        if (copyBtn && promptText) {
            copyBtn.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(promptText.textContent);
                    copyBtn.classList.add('copied');
                    copyBtn.querySelector('.copy-text').textContent = '已複製';
                    copyBtn.querySelector('.copy-icon').textContent = '✓';
                    setTimeout(() => {
                        copyBtn.classList.remove('copied');
                        copyBtn.querySelector('.copy-text').textContent = '複製';
                        copyBtn.querySelector('.copy-icon').textContent = '📋';
                    }, 2000);
                } catch (err) {
                    console.error('複製失敗:', err);
                    UIModule.toast('複製失敗，請手動選擇文字複製', 'error');
                }
            });
        }

        // 取消按鈕
        document.querySelector('.btn-secondary')?.addEventListener('click', () => {
            window.history.back();
        });
    }

    checkAuth() {
        if (!AuthModule.isAuthenticated() || !AuthModule.isAdminOrTeacher()) {
            UIModule.toast('只有教師和管理員可以上傳遊戲', 'error');
            this.submitBtn.disabled = true;
        }
    }

    async loadSubjects() {
        const select = document.getElementById('gameSubject');
        if (!select) return;

        try {
            const result = await APIClient.get('/api/games/subjects/list');

            if (result.success && result.data && Object.keys(result.data).length > 0) {
                const currentValue = select.value;

                while (select.options.length > 1) {
                    select.remove(1);
                }

                // <option> 無法塞 SVG，只用純文字名稱（圖示在其他地方統一呈現）
                for (const [code, info] of Object.entries(result.data)) {
                    const option = document.createElement('option');
                    option.value = code;
                    const name = (typeof info === 'object') ? (info.name || code) : info;
                    option.textContent = name;
                    select.appendChild(option);
                }

                if (currentValue) select.value = currentValue;
            }
        } catch (error) {
            console.warn('動態加載學科列表失敗，使用默認選項:', error.message);
        }
    }

    switchUploadMode(mode) {
        this.uploadMode = mode;
        document.querySelectorAll('.upload-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === mode);
        });
        document.getElementById('fileUpload').classList.toggle('active', mode === 'file');
        document.getElementById('codeUpload').classList.toggle('active', mode === 'code');
    }

    handleFileDrop(e) {
        e.preventDefault();
        this.dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            this.processFile(e.dataTransfer.files[0]);
        }
    }

    handleFileSelect(e) {
        if (e.target.files.length > 0) {
            this.processFile(e.target.files[0]);
        }
    }

    processFile(file) {
        if (!file.name.match(/\.html?$/i)) {
            UIModule.toast('請選擇 HTML 檔案', 'error');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            UIModule.toast('檔案大小不能超過 5MB', 'error');
            return;
        }

        this.selectedFile = file;
        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = Utils.formatFileSize(file.size);
        this.fileSelected.style.display = 'flex';
        this.dropZone.style.display = 'none';
    }

    removeFile() {
        this.selectedFile = null;
        this.fileInput.value = '';
        this.fileSelected.style.display = 'none';
        this.dropZone.style.display = 'block';
    }

    selectIcon(option) {
        document.querySelectorAll('.icon-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        this.selectedIcon = option.dataset.icon;
    }

    getSelectedDifficulty() {
        return Array.from(document.querySelectorAll('#difficultyGroup input:checked'))
            .map(cb => cb.value);
    }

    getTags() {
        const tagsInput = document.getElementById('gameTags').value.trim();
        if (!tagsInput) return [];
        return tagsInput.split(/[,，]/).map(t => t.trim()).filter(Boolean);
    }

    generateClassCheckboxes() {
        const forms = ['A', 'B', 'C', 'D', 'S'];
        const grades = [1, 2, 3, 4, 5, 6];
        let html = '';
        for (const grade of grades) {
            for (const form of forms) {
                const cls = `${grade}${form}`;
                html += `<label class="checkbox-label">
                    <input type="checkbox" name="visible_class" value="${cls}">
                    ${cls}
                </label>`;
            }
        }
        this.classGroup.innerHTML = html;
    }

    updateTeacherOnlyUI() {
        const isTeacherOnly = this.teacherOnlyCheckbox.checked;
        this.studentVisibilitySection.style.display = isTeacherOnly ? 'none' : '';
        this.teacherOnlyLabel.style.color = isTeacherOnly ? 'var(--brand)' : '';
        this.teacherOnlyLabel.style.fontWeight = isTeacherOnly ? '500' : '';
    }

    getSelectedClasses() {
        return Array.from(document.querySelectorAll('#classGroup input:checked'))
            .map(cb => cb.value);
    }

    async handleSubmit(e) {
        e.preventDefault();

        if (this.uploadMode === 'file' && !this.selectedFile) {
            UIModule.toast('請選擇要上傳的 HTML 檔案', 'error');
            return;
        }

        const htmlCode = document.getElementById('htmlCode').value.trim();
        if (this.uploadMode === 'code' && !htmlCode) {
            UIModule.toast('請輸入 HTML 代碼', 'error');
            return;
        }

        this.submitBtn.disabled = true;
        this.submitBtn.textContent = this.editMode ? '更新中...' : '上傳中...';

        try {
            if (this.editMode && this.editUuid) {
                // 更新模式
                const updateData = {
                    name: document.getElementById('gameName').value.trim(),
                    name_en: document.getElementById('gameNameEn').value.trim(),
                    description: document.getElementById('gameDesc').value.trim(),
                    subject: document.getElementById('gameSubject').value,
                    icon: this.selectedIcon,
                    difficulty: this.getSelectedDifficulty(),
                    tags: this.getTags(),
                    is_public: this.isPublicCheckbox.checked,
                    teacher_only: this.teacherOnlyCheckbox.checked,
                    visible_to: this.getSelectedClasses()
                };

                if (this.uploadMode === 'code') {
                    updateData.html_content = document.getElementById('htmlCode').value;
                }

                const result = await APIClient.put(
                    `/api/games/${this.editUuid}`,
                    updateData
                );

                if (result.success) {
                    UIModule.toast('遊戲更新成功！', 'success');
                    setTimeout(() => { window.location.href = '/my_games'; }, 1500);
                } else {
                    throw new Error(result.message || '更新失敗');
                }

            } else {
                // 創建模式
                const formData = new FormData();
                formData.append('name', document.getElementById('gameName').value.trim());
                formData.append('name_en', document.getElementById('gameNameEn').value.trim());
                formData.append('description', document.getElementById('gameDesc').value.trim());
                formData.append('subject', document.getElementById('gameSubject').value);
                formData.append('icon', this.selectedIcon);
                formData.append('difficulty', JSON.stringify(this.getSelectedDifficulty()));
                formData.append('tags', JSON.stringify(this.getTags()));
                formData.append('is_public', this.isPublicCheckbox.checked);
                formData.append('teacher_only', this.teacherOnlyCheckbox.checked);
                formData.append('visible_to', JSON.stringify(this.getSelectedClasses()));
                if (this.uploadMode === 'file') {
                    formData.append('file', this.selectedFile);
                } else {
                    formData.append('html_content', htmlCode);
                }

                const result = await APIClient.upload('/api/games/upload', formData);

                if (result.success) {
                    UIModule.toast('遊戲上傳成功！', 'success');
                    setTimeout(() => { window.location.href = '/my_games'; }, 1500);
                } else {
                    throw new Error(result.message || '上傳失敗');
                }
            }

        } catch (error) {
            UIModule.toast(error.message, 'error');
        } finally {
            this.submitBtn.disabled = false;
            this.submitBtn.textContent = this.editMode ? '更新遊戲' : '上傳遊戲';
        }
    }

    async getUserInfo() {
        const info = await AuthModule.getUserInfo();
        if (info) {
            return { id: info.id, role: info.role };
        }
        throw new Error('無法獲取用戶信息');
    }
}

/* ============================================================
   入口
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
    new GameUploadPage();
});
