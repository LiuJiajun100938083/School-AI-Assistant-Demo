/**
 * English Dictation — Frontend Controller
 * =========================================
 * Thin UI layer. All business logic is on the server.
 *
 * Architecture:
 *   DictationAPI — all HTTP calls, wraps APIClient
 *   DictationApp — state + render + event handlers
 *
 * i18n: dict.* namespace (see web_static/js/shared/i18n/dictation.js)
 */
'use strict';

// ──────────────────────────────────────────────────────────
//  API client
// ──────────────────────────────────────────────────────────
const DictationAPI = {
    // Teacher
    createDictation:  (body)        => APIClient.post('/api/dictation/teacher', body),
    listTeacher:      (params)      => APIClient.get('/api/dictation/teacher', params || {}),
    getTargets:       ()            => APIClient.get('/api/dictation/teacher/targets'),
    extractText:      (formData)    => APIClient.upload('/api/dictation/teacher/extract-text', formData),
    getTeacher:       (id)          => APIClient.get(`/api/dictation/teacher/${id}`),
    updateDictation:  (id, body)    => APIClient.put(`/api/dictation/teacher/${id}`, body),
    publish:          (id)          => APIClient.post(`/api/dictation/teacher/${id}/publish`, {}),
    close:            (id)          => APIClient.post(`/api/dictation/teacher/${id}/close`, {}),
    deleteDict:       (id)          => APIClient.delete(`/api/dictation/teacher/${id}`),
    listSubmissions:  (id)          => APIClient.get(`/api/dictation/teacher/${id}/submissions`),
    getSubmission:    (sid)         => APIClient.get(`/api/dictation/teacher/submissions/${sid}`),
    overrideSubmission:(sid, body)  => APIClient.post(`/api/dictation/teacher/submissions/${sid}/override`, body),
    reOcr:            (sid)         => APIClient.post(`/api/dictation/teacher/submissions/${sid}/re-ocr`, {}),

    // Student
    listStudent:      ()            => APIClient.get('/api/dictation'),
    getStudent:       (id)          => APIClient.get(`/api/dictation/${id}`),
    submit:           (id, formData)=> APIClient.upload(`/api/dictation/${id}/submit`, formData),
    getMySubmission:  (sid)         => APIClient.get(`/api/dictation/submissions/me/${sid}`),
};

// ──────────────────────────────────────────────────────────
//  App controller
// ──────────────────────────────────────────────────────────
class DictationApp {

    constructor() {
        this.role            = 'student';
        this.username        = '';
        this.currentStatus   = '';
        this.currentDictId   = null;     // when viewing detail
        this.currentSubmitId = null;     // when modal open for submission
        this.pendingFiles    = [];
        this.editingId       = null;
        this._pollTimers     = new Set();
        this._targets        = null;           // { classes: [], students: [] }
        this._selectedClass  = '';
        this._selectedStudents = new Set();
        this._selectedType   = 'en_paragraph'; // en_paragraph | en_word_list | zh_paragraph
    }

    // Map UI type → backend (language, mode)
    _typeToLM(t) {
        if (t === 'en_word_list') return { language: 'en', mode: 'word_list' };
        if (t === 'zh_paragraph') return { language: 'zh', mode: 'paragraph' };
        return { language: 'en', mode: 'paragraph' };
    }
    _lmToType(language, mode) {
        if (language === 'zh') return 'zh_paragraph';
        if (mode === 'word_list') return 'en_word_list';
        return 'en_paragraph';
    }

    // ── init ──────────────────────────────────────────
    async init() {
        this.role     = AuthModule.getUserRole();
        this.username = AuthModule.getUsername();

        // Body class drives teacher-only / student-only visibility
        document.body.classList.add(this.role === 'student' ? 'role-student' : 'role-teacher');

        // User info
        const ui = document.getElementById('userInfo');
        if (ui) ui.textContent = this.username;

        // Language switch
        const ls = document.getElementById('langSwitch');
        if (ls) {
            ls.value = i18n.getLang ? i18n.getLang() : (localStorage.getItem('app-lang') || 'zh');
            ls.onchange = () => {
                if (i18n.setLang) i18n.setLang(ls.value);
                else { localStorage.setItem('app-lang', ls.value); location.reload(); }
                this._applyI18n();
                this.reload();
            };
        }

        // Filter tabs
        document.querySelectorAll('.filter-item').forEach(el => {
            el.onclick = () => {
                document.querySelectorAll('.filter-item').forEach(x => x.classList.remove('active'));
                el.classList.add('active');
                this.currentStatus = el.dataset.status || '';
                this.reload();
            };
        });

        this._applyI18n();
        await this.reload();
    }

    _applyI18n() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            el.textContent = i18n.t(el.dataset.i18n);
        });
        document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
            el.placeholder = i18n.t(el.dataset.i18nPlaceholder);
        });
    }

    // ── list load ─────────────────────────────────────
    async reload() {
        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="loading">${i18n.t('dict.page.loading')}</div>`;
        try {
            if (this.role === 'student') {
                const resp = await DictationAPI.listStudent();
                this._renderStudentList(resp.data || []);
            } else {
                const resp = await DictationAPI.listTeacher({ status: this.currentStatus });
                const items = (resp.data && resp.data.items) || [];
                this._renderTeacherList(items);
            }
        } catch (e) {
            main.innerHTML = `<div class="error-box">${i18n.t('dict.page.loadFail')}: ${e.message}</div>`;
        }
    }

    // ── teacher list ──────────────────────────────────
    _renderTeacherList(items) {
        const main = document.getElementById('mainContent');
        if (!items.length) {
            main.innerHTML = `<div class="empty-state">${i18n.t('dict.list.empty')}</div>`;
            return;
        }
        main.innerHTML = `
            <div class="list-grid">
                ${items.map(it => `
                    <div class="list-card" data-id="${it.id}">
                        <div class="card-top">
                            <div class="card-title">${this._esc(it.title)}</div>
                            <span class="status-tag status-${it.status}">${i18n.t('dict.status.' + it.status)}</span>
                        </div>
                        <div class="card-meta">
                            <span>${i18n.t('dict.list.submissions')}: ${it.submission_total || 0}</span>
                            <span>${i18n.t('dict.list.graded')}: ${it.submission_graded || 0}</span>
                        </div>
                        <div class="card-desc">${this._esc(it.description || '')}</div>
                        <div class="card-bottom">
                            <span class="card-deadline">${i18n.t('dict.list.deadline')}: ${it.deadline ? this._fmtDate(it.deadline) : i18n.t('dict.list.noDeadline')}</span>
                        </div>
                    </div>`).join('')}
            </div>`;
        main.querySelectorAll('.list-card').forEach(card => {
            card.onclick = () => this.openTeacherDetail(+card.dataset.id);
        });
    }

    // ── teacher detail ────────────────────────────────
    async openTeacherDetail(id) {
        this.currentDictId = id;
        const main = document.getElementById('mainContent');
        main.innerHTML = `<div class="loading">${i18n.t('dict.page.loading')}</div>`;
        try {
            const [detailResp, subsResp] = await Promise.all([
                DictationAPI.getTeacher(id),
                DictationAPI.listSubmissions(id),
            ]);
            const d = detailResp.data;
            const subs = subsResp.data || [];

            main.innerHTML = `
                <div class="detail-view">
                    <button class="link-btn" onclick="app.reload()">${i18n.t('dict.detail.backToList')}</button>
                    <div class="detail-header">
                        <h2>${this._esc(d.title)}</h2>
                        <span class="status-tag status-${d.status}">${i18n.t('dict.status.' + d.status)}</span>
                    </div>
                    <div class="detail-actions">
                        ${d.status === 'draft' ? `<button class="primary-btn" onclick="app.doPublish(${d.id})">${i18n.t('dict.detail.publish')}</button>` : ''}
                        ${d.status === 'published' ? `<button class="secondary-btn" onclick="app.doClose(${d.id})">${i18n.t('dict.detail.close')}</button>` : ''}
                        <button class="secondary-btn" onclick="app.openEditModal(${d.id})">${i18n.t('dict.detail.edit')}</button>
                        <button class="danger-btn" onclick="app.doDelete(${d.id})">${i18n.t('dict.detail.delete')}</button>
                    </div>
                    <div class="detail-section">
                        <h3>${i18n.t('dict.detail.reference')}</h3>
                        <pre class="reference-box">${this._esc(d.reference_text)}</pre>
                    </div>
                    <div class="detail-section">
                        <h3>${i18n.t('dict.detail.submissions')} (${subs.length})</h3>
                        ${subs.length === 0
                            ? `<div class="empty-state">${i18n.t('dict.detail.noSubmissions')}</div>`
                            : `<table class="subs-table">
                                <thead><tr>
                                    <th>Class</th><th>Name</th>
                                    <th>${i18n.t('dict.result.accuracy')}</th>
                                    <th>${i18n.t('dict.result.correct')}</th>
                                    <th>${i18n.t('dict.result.wrong')}</th>
                                    <th>${i18n.t('dict.result.missing')}</th>
                                    <th>${i18n.t('dict.result.extra')}</th>
                                    <th>Status</th><th></th>
                                </tr></thead>
                                <tbody>
                                ${subs.map(s => `
                                    <tr>
                                        <td>${this._esc(s.class_name || '')}</td>
                                        <td>${this._esc(s.student_name || s.username || '')}</td>
                                        <td>${s.score != null ? s.score + '%' : '-'}</td>
                                        <td>${s.correct_count ?? '-'}</td>
                                        <td class="c-wrong">${s.wrong_count ?? '-'}</td>
                                        <td class="c-missing">${s.missing_count ?? '-'}</td>
                                        <td class="c-extra">${s.extra_count ?? '-'}</td>
                                        <td><span class="status-tag status-${s.status}">${i18n.t('dict.sub.' + this._subKey(s.status))}</span></td>
                                        <td><button class="link-btn" onclick="app.openSubmissionDetail(${s.id}, false)">→</button></td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>`}
                    </div>
                </div>`;
        } catch (e) {
            main.innerHTML = `<div class="error-box">${i18n.t('dict.page.loadFail')}: ${e.message}</div>`;
        }
    }

    // ── student list ──────────────────────────────────
    _renderStudentList(items) {
        const main = document.getElementById('mainContent');
        if (!items.length) {
            main.innerHTML = `<div class="empty-state">${i18n.t('dict.student.emptyList')}</div>`;
            return;
        }
        main.innerHTML = `
            <div class="list-grid">
                ${items.map(it => {
                    const sub = it.my_submission;
                    const statusKey = sub ? this._subKey(sub.status) : 'notSubmitted';
                    return `
                    <div class="list-card">
                        <div class="card-top">
                            <div class="card-title">${this._esc(it.title)}</div>
                            <span class="status-tag status-${sub ? sub.status : 'notsub'}">${i18n.t('dict.sub.' + statusKey)}</span>
                        </div>
                        <div class="card-desc">${this._esc(it.description || '')}</div>
                        <div class="card-bottom">
                            <span class="card-deadline">${i18n.t('dict.list.deadline')}: ${it.deadline ? this._fmtDate(it.deadline) : i18n.t('dict.list.noDeadline')}</span>
                            ${sub && sub.status === 'graded'
                                ? `<span class="score-chip">${sub.score}%</span>` : ''}
                        </div>
                        <div class="card-actions">
                            ${sub && sub.status === 'graded'
                                ? `<button class="secondary-btn" onclick="app.openSubmissionDetail(${sub.id}, true)">${i18n.t('dict.student.viewResult')}</button>
                                   <button class="primary-btn" onclick="app.openSubmitModal(${it.id})">${i18n.t('dict.student.reSubmit')}</button>`
                                : sub && sub.status === 'ocr_processing'
                                    ? `<button class="secondary-btn" disabled>${i18n.t('dict.student.waitGrading')}</button>`
                                    : `<button class="primary-btn" onclick="app.openSubmitModal(${it.id})">${i18n.t('dict.student.openSubmit')}</button>`}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    }

    // ── create / edit ─────────────────────────────────
    async openCreateModal() {
        this.editingId = null;
        this._clearCreateForm();
        document.getElementById('createModalTitle').textContent = i18n.t('dict.sidebar.createTitle');
        document.getElementById('createModal').style.display = 'flex';
        await this._ensureTargets();
        this.onTargetTypeChange();
    }

    async openEditModal(id) {
        const resp = await DictationAPI.getTeacher(id);
        const d = resp.data;
        this.editingId = id;
        document.getElementById('f_title').value        = d.title || '';
        document.getElementById('f_description').value  = d.description || '';
        document.getElementById('f_reference').value    = d.reference_text || '';
        document.getElementById('f_target_type').value  = d.target_type || 'all';
        document.getElementById('f_deadline').value     = d.deadline ? d.deadline.substring(0, 16) : '';
        document.getElementById('f_allow_late').checked = !!d.allow_late;
        this._selectedType = this._lmToType(d.language || 'en', d.mode || 'paragraph');
        this._applyTypeUI();
        document.getElementById('createModalTitle').textContent = i18n.t('dict.detail.edit');
        document.getElementById('createModal').style.display = 'flex';

        await this._ensureTargets();

        // Pre-populate picker state from saved target_value
        this._selectedClass = '';
        this._selectedStudents = new Set();
        if (d.target_type === 'class') {
            this._selectedClass = (d.target_value || '').trim();
        } else if (d.target_type === 'student') {
            (d.target_value || '').split(',').map(s => s.trim()).filter(Boolean)
                .forEach(s => this._selectedStudents.add(s));
        }
        this.onTargetTypeChange();
    }

    closeCreateModal() {
        document.getElementById('createModal').style.display = 'none';
    }

    _clearCreateForm() {
        ['f_title','f_description','f_reference','f_deadline']
            .forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('f_target_type').value = 'all';
        document.getElementById('f_allow_late').checked = false;
        document.getElementById('refExtractHint').textContent = '';
        this._selectedClass = '';
        this._selectedStudents = new Set();
        this._selectedType = 'en_paragraph';
        this._applyTypeUI();
    }

    selectType(t) {
        this._selectedType = t;
        this._applyTypeUI();
    }

    _applyTypeUI() {
        const t = this._selectedType;
        document.querySelectorAll('#f_type_picker .type-card').forEach(el => {
            el.classList.toggle('active', el.dataset.type === t);
        });
        const hint = document.getElementById('f_type_hint');
        if (hint) {
            hint.textContent = (t === 'en_word_list')
                ? i18n.t('dict.create.wordHint')
                : i18n.t('dict.create.paraHint');
        }
        // Update reference textarea placeholder accordingly
        const ta = document.getElementById('f_reference');
        if (ta) {
            ta.placeholder = (t === 'en_word_list')
                ? 'apple\nbanana\ncherry'
                : i18n.t('dict.create.referencePh');
        }
    }

    // ── targets picker ───────────────────────────────
    async _ensureTargets() {
        if (this._targets) return;
        try {
            const resp = await DictationAPI.getTargets();
            this._targets = resp.data || { classes: [], students: [] };
        } catch (e) {
            this._targets = { classes: [], students: [] };
        }
    }

    onTargetTypeChange() {
        const type = document.getElementById('f_target_type').value;
        const box  = document.getElementById('f_target_picker');
        if (type === 'all' || !this._targets) {
            box.innerHTML = '';
            box.style.display = 'none';
            return;
        }
        box.style.display = 'block';
        if (type === 'class') {
            const classes = this._targets.classes || [];
            if (!classes.length) {
                box.innerHTML = `<div class="picker-empty">${i18n.t('dict.create.noClass')}</div>`;
                return;
            }
            box.innerHTML = classes.map(c =>
                `<button type="button" class="class-chip ${this._selectedClass === c ? 'active' : ''}"
                         onclick="app.selectClass('${this._esc(c)}')">${this._esc(c)}</button>`
            ).join('');
        } else if (type === 'student') {
            const students = this._targets.students || [];
            if (!students.length) {
                box.innerHTML = `<div class="picker-empty">${i18n.t('dict.create.noStudent')}</div>`;
                return;
            }
            box.innerHTML = `
                <div class="student-picker">
                    ${students.map(s => {
                        const checked = this._selectedStudents.has(s.username) ? 'checked' : '';
                        const cls = s.class_name ? ` · ${this._esc(s.class_name)}` : '';
                        return `<label class="student-row">
                            <input type="checkbox" value="${this._esc(s.username)}" ${checked}
                                   onchange="app.toggleStudent('${this._esc(s.username)}', this.checked)">
                            <span>${this._esc(s.display_name || s.username)}${cls}</span>
                        </label>`;
                    }).join('')}
                </div>
                <div class="picker-footer">${i18n.t('dict.create.selectedCount')}: <b id="studentCount">${this._selectedStudents.size}</b></div>
            `;
        }
    }

    selectClass(name) {
        this._selectedClass = name;
        this.onTargetTypeChange();
    }

    toggleStudent(username, on) {
        if (on) this._selectedStudents.add(username);
        else    this._selectedStudents.delete(username);
        const el = document.getElementById('studentCount');
        if (el) el.textContent = this._selectedStudents.size;
    }

    // ── reference text extraction ───────────────────
    async extractReferenceFromFile(file) {
        if (!file) return;
        const hint = document.getElementById('refExtractHint');
        hint.textContent = '⏳ ' + i18n.t('dict.create.extracting');
        try {
            const fd = new FormData();
            fd.append('file', file);
            const resp = await DictationAPI.extractText(fd);
            const text = resp.data && resp.data.text || '';
            if (!text) {
                hint.textContent = '⚠ ' + i18n.t('dict.create.extractFail');
                return;
            }
            const ta = document.getElementById('f_reference');
            // 若已有內容,追加;否則直接填入
            ta.value = ta.value ? (ta.value + '\n' + text) : text;
            hint.textContent = `✓ ${resp.data.length} ${i18n.t('dict.create.charsExtracted')}`;
        } catch (e) {
            hint.textContent = '⚠ ' + (e.message || i18n.t('dict.create.extractFail'));
        } finally {
            // reset inputs so same file can be re-selected later
            document.getElementById('refFileInput').value = '';
            document.getElementById('refPhotoInput').value = '';
        }
    }

    async doCreate() {
        const targetType = document.getElementById('f_target_type').value;
        let targetValue = '';
        if (targetType === 'class')   targetValue = this._selectedClass;
        if (targetType === 'student') targetValue = Array.from(this._selectedStudents).join(',');

        const lm = this._typeToLM(this._selectedType);
        const body = {
            title:          document.getElementById('f_title').value.trim(),
            description:    document.getElementById('f_description').value.trim(),
            reference_text: document.getElementById('f_reference').value.trim(),
            language:       lm.language,
            mode:           lm.mode,
            target_type:    targetType,
            target_value:   targetValue,
            deadline:       document.getElementById('f_deadline').value || null,
            allow_late:     document.getElementById('f_allow_late').checked,
        };
        if (targetType === 'class' && !targetValue) {
            UIModule.toast(i18n.t('dict.create.classRequired'), 'error');
            return;
        }
        if (targetType === 'student' && !targetValue) {
            UIModule.toast(i18n.t('dict.create.studentRequired'), 'error');
            return;
        }
        if (!body.title || !body.reference_text) {
            UIModule.toast(i18n.t('dict.common.error'), 'error');
            return;
        }
        try {
            if (this.editingId) {
                await DictationAPI.updateDictation(this.editingId, body);
            } else {
                await DictationAPI.createDictation(body);
            }
            this.closeCreateModal();
            await this.reload();
            UIModule.toast(i18n.t('dict.common.success'), 'success');
        } catch (e) { /* APIClient already toasts */ }
    }

    // ── teacher actions ──────────────────────────────
    async doPublish(id) {
        await DictationAPI.publish(id);
        await this.openTeacherDetail(id);
    }
    async doClose(id) {
        await DictationAPI.close(id);
        await this.openTeacherDetail(id);
    }
    async doDelete(id) {
        if (!confirm(i18n.t('dict.common.confirmDelete'))) return;
        await DictationAPI.deleteDict(id);
        await this.reload();
    }

    // ── student submit ───────────────────────────────
    openSubmitModal(dictId) {
        this.currentSubmitId = dictId;
        this.pendingFiles = [];
        document.getElementById('submitPreview').innerHTML = '';
        const input = document.getElementById('submitFiles');
        input.value = '';
        input.onchange = e => {
            this.pendingFiles = Array.from(e.target.files || []);
            this._renderPending();
        };
        document.getElementById('submitModal').style.display = 'flex';
    }
    closeSubmitModal() {
        document.getElementById('submitModal').style.display = 'none';
    }
    _renderPending() {
        const box = document.getElementById('submitPreview');
        box.innerHTML = this.pendingFiles.map((f, i) => {
            const url = URL.createObjectURL(f);
            return `<div class="preview-thumb"><img src="${url}" alt=""><span>${i + 1}</span></div>`;
        }).join('');
    }
    async doSubmit() {
        if (!this.pendingFiles.length) {
            UIModule.toast(i18n.t('dict.submit.noFile'), 'error');
            return;
        }
        const fd = new FormData();
        this.pendingFiles.forEach(f => fd.append('files', f));
        try {
            const resp = await DictationAPI.submit(this.currentSubmitId, fd);
            this.closeSubmitModal();
            UIModule.toast(i18n.t('dict.submit.success'), 'success');
            // Open result modal and poll
            const subId = resp.data && resp.data.id;
            if (subId) this.openSubmissionDetail(subId, true, true);
        } catch (e) { /* toasted */ }
    }

    // ── submission detail modal ──────────────────────
    async openSubmissionDetail(submissionId, asStudent, startPolling = false) {
        const modal = document.getElementById('resultModal');
        const body  = document.getElementById('resultBody');
        modal.style.display = 'flex';
        body.innerHTML = `<div class="loading">${i18n.t('dict.page.loading')}</div>`;

        const loadOnce = async () => {
            const resp = asStudent
                ? await DictationAPI.getMySubmission(submissionId)
                : await DictationAPI.getSubmission(submissionId);
            return resp.data;
        };

        const render = (s) => {
            if (s.status === 'ocr_processing' || s.status === 'submitted') {
                body.innerHTML = `<div class="loading">${i18n.t('dict.result.processing')}</div>`;
                return false;
            }
            if (s.status === 'ocr_failed') {
                body.innerHTML = `<div class="error-box">${i18n.t('dict.result.failed')}${this._esc(s.teacher_feedback || '')}</div>
                    ${!asStudent ? `<button class="primary-btn" onclick="app.reOcr(${s.id})">${i18n.t('dict.result.reocr')}</button>` : ''}`;
                return true;
            }
            // graded
            const diff = s.diff_result || {};
            const isWordList = diff.mode === 'word_list';

            // Render diff: word_list = cards, paragraph = inline
            let diffHtml;
            if (isWordList) {
                diffHtml = `<div class="word-grid">${(diff.items || []).map(it => {
                    if (it.status === 'correct')
                        return `<div class="word-card correct"><span class="word-status">✓</span><span class="word-text">${this._esc(it.ref)}</span></div>`;
                    if (it.status === 'wrong')
                        return `<div class="word-card wrong"><span class="word-status">✗</span><span class="word-text">${this._esc(it.ref)}</span><span class="word-ocr">${this._esc(it.ocr)}</span></div>`;
                    if (it.status === 'missing')
                        return `<div class="word-card missing"><span class="word-status">—</span><span class="word-text">${this._esc(it.ref)}</span></div>`;
                    if (it.status === 'extra')
                        return `<div class="word-card extra"><span class="word-status">+</span><span class="word-text">${this._esc(it.ocr)}</span></div>`;
                    return '';
                }).join('')}</div>`;
            } else {
                diffHtml = `<div class="diff-view">${(diff.items || []).map(it => {
                    if (it.status === 'correct')  return `<span class="w-correct">${this._esc(it.ref)}</span>`;
                    if (it.status === 'wrong')    return `<span class="w-wrong" title="${this._esc(it.ocr)}">${this._esc(it.ref)}</span>`;
                    if (it.status === 'missing')  return `<span class="w-missing">${this._esc(it.ref)}</span>`;
                    if (it.status === 'extra')    return `<span class="w-extra">${this._esc(it.ocr)}</span>`;
                    return '';
                }).join(' ')}</div>`;
            }

            const filesHtml = (s.files || []).map(f =>
                `<img class="photo-thumb" src="/api/dictation/files/${f.id}/preview" alt="">`
            ).join('');

            const overrideHtml = asStudent ? '' : `
                <details class="override-panel">
                    <summary>${i18n.t('dict.result.override')}</summary>
                    <label>${i18n.t('dict.result.overrideOcrLabel')}</label>
                    <textarea id="ovOcr" rows="4">${this._esc(s.ocr_text || '')}</textarea>
                    <label>${i18n.t('dict.result.overrideScoreLabel')}</label>
                    <input type="number" id="ovScore" min="0" max="100" step="0.1" value="${s.score ?? ''}">
                    <label>${i18n.t('dict.result.overrideFeedbackLabel')}</label>
                    <textarea id="ovFeedback" rows="2">${this._esc(s.teacher_feedback || '')}</textarea>
                    <button class="primary-btn" onclick="app.saveOverride(${s.id})">${i18n.t('dict.result.save')}</button>
                    <button class="secondary-btn" onclick="app.reOcr(${s.id})">${i18n.t('dict.result.reocr')}</button>
                </details>
            `;

            body.innerHTML = `
                <div class="result-summary">
                    <div class="stat-card accuracy"><div class="stat-label">${i18n.t('dict.result.accuracy')}</div><div class="stat-val">${diff.accuracy ?? 0}%</div></div>
                    <div class="stat-card correct"><div class="stat-label">${i18n.t('dict.result.correct')}</div><div class="stat-val">${diff.correct_count ?? 0}</div></div>
                    <div class="stat-card wrong"><div class="stat-label">${i18n.t('dict.result.wrong')}</div><div class="stat-val">${diff.wrong_count ?? 0}</div></div>
                    <div class="stat-card missing"><div class="stat-label">${i18n.t('dict.result.missing')}</div><div class="stat-val">${diff.missing_count ?? 0}</div></div>
                    <div class="stat-card extra"><div class="stat-label">${i18n.t('dict.result.extra')}</div><div class="stat-val">${diff.extra_count ?? 0}</div></div>
                </div>

                <h4>${i18n.t('dict.result.diffView')}</h4>
                ${diffHtml}

                ${s.reference_text ? `<h4>${i18n.t('dict.result.refView')}</h4><pre class="reference-box">${this._esc(s.reference_text)}</pre>` : ''}

                <h4>${i18n.t('dict.result.ocrView')}</h4>
                <pre class="ocr-box">${this._esc(s.ocr_text || '')}</pre>

                <h4>${i18n.t('dict.result.myPhotos')}</h4>
                <div class="photo-grid">${filesHtml}</div>

                ${s.teacher_feedback ? `<h4>${i18n.t('dict.result.teacherFeedback')}</h4><div class="feedback-box">${this._esc(s.teacher_feedback)}</div>` : ''}

                ${overrideHtml}
            `;
            return true;
        };

        try {
            let s = await loadOnce();
            let done = render(s);
            if (!done && startPolling) {
                // poll every 2s, up to 60 attempts (~2 min)
                let attempts = 0;
                const timer = setInterval(async () => {
                    attempts++;
                    try {
                        s = await loadOnce();
                        if (render(s) || attempts >= 60) {
                            clearInterval(timer);
                            this._pollTimers.delete(timer);
                        }
                    } catch (_) {
                        clearInterval(timer);
                        this._pollTimers.delete(timer);
                    }
                }, 2000);
                this._pollTimers.add(timer);
            }
        } catch (e) {
            body.innerHTML = `<div class="error-box">${e.message}</div>`;
        }
    }

    closeResultModal() {
        document.getElementById('resultModal').style.display = 'none';
        this._pollTimers.forEach(t => clearInterval(t));
        this._pollTimers.clear();
    }

    async reOcr(sid) {
        try {
            await DictationAPI.reOcr(sid);
            UIModule.toast(i18n.t('dict.sub.ocrProcessing'), 'info');
            this.openSubmissionDetail(sid, false, true);
        } catch (e) { /* toasted */ }
    }

    async saveOverride(sid) {
        const body = {
            manual_ocr_text:  document.getElementById('ovOcr').value,
            score:            parseFloat(document.getElementById('ovScore').value) || null,
            teacher_feedback: document.getElementById('ovFeedback').value,
        };
        try {
            await DictationAPI.overrideSubmission(sid, body);
            UIModule.toast(i18n.t('dict.common.success'), 'success');
            this.openSubmissionDetail(sid, false);
        } catch (e) { /* toasted */ }
    }

    // ── helpers ──────────────────────────────────────
    _esc(s) {
        if (s == null) return '';
        return String(s).replace(/[&<>"']/g, c => ({
            '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
        }[c]));
    }
    _fmtDate(s) {
        try { return new Date(s).toLocaleString(); } catch { return s; }
    }
    _subKey(status) {
        return {
            submitted:       'submitted',
            ocr_processing:  'ocrProcessing',
            graded:          'graded',
            ocr_failed:      'ocrFailed',
        }[status] || 'submitted';
    }
}

// ──────────────────────────────────────────────────────────
//  bootstrap
// ──────────────────────────────────────────────────────────
const app = new DictationApp();
window.app = app;
document.addEventListener('DOMContentLoaded', () => {
    if (!AuthModule.getToken()) {
        window.location.href = '/';
        return;
    }
    app.init();
});
