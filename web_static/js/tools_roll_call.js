/**
 * 課堂點名 / 隨機分組 — 前端 controller
 *
 * 設計重點:
 *  - 隨機全部在後端做,前端只負責 UI 狀態與動畫
 *  - 抽籤時有 slot-machine 風格滾動動畫 (~0.9s),尊重 prefers-reduced-motion
 *  - state.pickedIds 負責 exclude_ids (allow_repeat=true 時後端忽略)
 *  - 點 × 放回池子,或整批「全部放回」
 */
(function () {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ROLL_DURATION_MS = 850;      // slot machine 滾動時間
    const ROLL_STAGGER_MS = 90;        // 多卡片時每張依次停止

    // ── State ──
    const state = {
        classes: [],
        currentClass: '',
        studentsCache: [],             // 班級所有學生(用於 slot-machine 名字池)
        studentCount: 0,
        mode: 'pick',
        pickedIds: new Set(),
        pickedList: [],
        groupMode: 'by_size',
    };

    // ── API helpers ──
    async function apiGet(path) {
        const res = await ToolsCommon.api('/api/tools' + path);
        const body = await res.json();
        return body.data;
    }
    async function apiPost(path, payload) {
        const res = await ToolsCommon.api('/api/tools' + path, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        const body = await res.json();
        return body.data;
    }

    function esc(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    // ── 載入班級 ──
    async function loadClasses() {
        try {
            const classes = await apiGet('/roll-call/classes');
            state.classes = classes || [];
            const sel = $('#rcClass');
            const ph = sel.querySelector('option[value=""]');
            sel.innerHTML = '';
            if (ph) sel.appendChild(ph);
            state.classes.forEach(cn => {
                const opt = document.createElement('option');
                opt.value = cn;
                opt.textContent = cn;
                sel.appendChild(opt);
            });
            if (!state.classes.length && ph) {
                ph.textContent = i18n.t('tools.rc.noClass');
            }
        } catch (err) {
            showStatus('pick', err.message, true);
        }
    }

    // ── 選班 ──
    async function onClassChange(e) {
        const cn = e.target.value;
        state.currentClass = cn;
        state.pickedIds.clear();
        state.pickedList = [];
        state.studentsCache = [];
        renderPickedList(false);
        clearStage();

        const counter = $('#rcCount');
        if (!cn) {
            counter.textContent = '';
            state.studentCount = 0;
            updateButtons();
            return;
        }
        counter.textContent = i18n.t('tools.rc.loading');
        try {
            const students = await apiGet(`/roll-call/classes/${encodeURIComponent(cn)}/students`);
            state.studentsCache = students || [];
            state.studentCount = state.studentsCache.length;
            counter.textContent = i18n.t('tools.rc.totalStudents').replace('{n}', state.studentCount);
        } catch (err) {
            counter.textContent = '';
            showStatus('pick', err.message, true);
        }
        updateButtons();
    }

    function updateButtons() {
        const hasClass = !!state.currentClass && state.studentCount > 0;
        $('#rcPickBtn').disabled = !hasClass;
        $('#rcGroupBtn').disabled = !hasClass;
    }

    function showStatus(pane, msg, isError) {
        const el = pane === 'pick' ? $('#rcPickStatus') : $('#rcGroupStatus');
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('rc-status--error', !!isError);
    }

    // ── Tab 切換 ──
    function switchMode(mode) {
        state.mode = mode;
        $$('.rc-tab').forEach(t => {
            const on = t.dataset.mode === mode;
            t.classList.toggle('active', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        $('#rcPanePick').hidden = (mode !== 'pick');
        $('#rcPaneGroup').hidden = (mode !== 'group');
    }

    // ── 抽人 ──
    async function doPick() {
        const btn = $('#rcPickBtn');
        if (btn.disabled) return;
        showStatus('pick', '', false);
        btn.disabled = true;
        try {
            const n = Math.max(1, parseInt($('#rcPickN').value, 10) || 1);
            const allowRepeat = $('#rcAllowRepeat').checked;
            const data = await apiPost('/roll-call/pick', {
                class_name: state.currentClass,
                n,
                exclude_ids: Array.from(state.pickedIds),
                allow_repeat: allowRepeat,
            });
            const picked = data.picked || [];
            await renderStageWithRoll(picked);
            // 累積到「已抽過」
            picked.forEach(s => {
                if (!state.pickedIds.has(s.id)) {
                    state.pickedIds.add(s.id);
                    state.pickedList.push(s);
                }
            });
            renderPickedList(true);
        } catch (err) {
            showStatus('pick', err.message, true);
        } finally {
            updateButtons();
        }
    }

    /**
     * 把舞台切換成 slot-machine 滾動狀態,持續 ROLL_DURATION_MS,
     * 然後把每張卡片依次停在實際抽中的學生。
     * 若 prefers-reduced-motion,跳過動畫直接顯示結果。
     */
    async function renderStageWithRoll(picked) {
        const stage = $('.rc-stage');
        const empty = $('#rcStageEmpty');
        const wrap = $('#rcStageCards');

        empty.style.display = 'none';
        stage.classList.add('has-draw');
        wrap.innerHTML = '';

        // 建立卡片
        const cards = picked.map((s, i) => {
            const card = document.createElement('div');
            card.className = 'rc-card' + (prefersReducedMotion ? '' : ' is-rolling');
            card.innerHTML = `
                <div class="rc-card__badge"></div>
                <div class="rc-card__name">…</div>`;
            card.style.animationDelay = (i * 0.06) + 's';
            wrap.appendChild(card);
            return card;
        });

        if (prefersReducedMotion || !state.studentsCache.length) {
            // 直接顯示最終結果
            picked.forEach((s, i) => settleCard(cards[i], s));
            return;
        }

        // slot-machine 滾動 — 每 70ms 換一個隨機名字
        const pool = state.studentsCache;
        const rollInterval = setInterval(() => {
            cards.forEach(card => {
                if (!card.classList.contains('is-rolling')) return;
                const rnd = pool[Math.floor(Math.random() * pool.length)];
                card.querySelector('.rc-card__name').textContent = rnd.display_name || rnd.username || '';
                const badge = card.querySelector('.rc-card__badge');
                badge.textContent = rnd.class_number != null ? String(rnd.class_number) : '';
            });
        }, 70);

        // 依次停卡
        for (let i = 0; i < cards.length; i++) {
            await delay(i === 0 ? ROLL_DURATION_MS : ROLL_STAGGER_MS);
            settleCard(cards[i], picked[i]);
        }
        clearInterval(rollInterval);
    }

    function settleCard(card, student) {
        card.classList.remove('is-rolling');
        const badge = card.querySelector('.rc-card__badge');
        const name = card.querySelector('.rc-card__name');
        badge.textContent = student.class_number != null ? String(student.class_number) : '';
        name.textContent = student.display_name || student.username || '';
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function clearStage() {
        const stage = $('.rc-stage');
        stage.classList.remove('has-draw');
        $('#rcStageCards').innerHTML = '';
        const empty = $('#rcStageEmpty');
        empty.style.display = '';
    }

    function renderPickedList(animate) {
        const wrap = $('#rcPickedList');
        const count = state.pickedList.length;
        const countEl = $('#rcPickedCount');
        countEl.textContent = String(count);
        if (animate) {
            countEl.classList.remove('is-updating');
            // force reflow
            void countEl.offsetWidth;
            countEl.classList.add('is-updating');
            setTimeout(() => countEl.classList.remove('is-updating'), 220);
        }
        $('#rcClearPicked').style.display = count ? '' : 'none';
        if (!count) {
            wrap.innerHTML = `
                <div class="rc-sidepanel__empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <span>${esc(i18n.t('tools.rc.pickedListEmpty'))}</span>
                </div>`;
            return;
        }
        wrap.innerHTML = '';
        [...state.pickedList].reverse().forEach(s => {
            const chip = document.createElement('div');
            chip.className = 'rc-chip';
            chip.innerHTML = `
                <span class="rc-chip__num">${esc(s.class_number != null ? String(s.class_number) : '')}</span>
                <span class="rc-chip__name">${esc(s.display_name || s.username || '')}</span>
                <button type="button" class="rc-chip__close" data-id="${s.id}" aria-label="${esc(i18n.t('tools.rc.putBack'))}" title="${esc(i18n.t('tools.rc.putBack'))}">×</button>`;
            wrap.appendChild(chip);
        });
    }

    function putBack(id) {
        state.pickedIds.delete(id);
        state.pickedList = state.pickedList.filter(s => s.id !== id);
        renderPickedList(true);
    }

    function clearPicked() {
        state.pickedIds.clear();
        state.pickedList = [];
        renderPickedList(true);
    }

    // ── Stepper (+ / -) ──
    function initSteppers() {
        $$('.rc-step').forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target || (btn.closest('.rc-numwrap').querySelector('.rc-num').id);
                const input = document.getElementById(targetId);
                if (!input) return;
                const step = parseInt(btn.dataset.step, 10);
                const cur = parseInt(input.value, 10) || 0;
                const min = parseInt(input.min, 10) || 1;
                const max = parseInt(input.max, 10) || 200;
                const next = Math.max(min, Math.min(max, cur + step));
                input.value = String(next);
                input.dispatchEvent(new Event('input', { bubbles: true }));
            });
        });
    }

    // ── 分組 ──
    function switchGroupMode(mode) {
        state.groupMode = mode;
        $$('#rcGroupMode button').forEach(b => {
            const on = b.dataset.mode === mode;
            b.classList.toggle('active', on);
            b.setAttribute('aria-checked', on ? 'true' : 'false');
        });
        const label = $('#rcGroupValueLabel');
        const input = $('#rcGroupValue');
        if (mode === 'by_size') {
            label.textContent = i18n.t('tools.rc.sizeLabel');
            input.value = '4';
        } else {
            label.textContent = i18n.t('tools.rc.countLabel');
            input.value = '5';
        }
    }

    async function doGroup() {
        const btn = $('#rcGroupBtn');
        if (btn.disabled) return;
        showStatus('group', i18n.t('tools.rc.grouping'), false);
        btn.disabled = true;
        try {
            const value = Math.max(1, parseInt($('#rcGroupValue').value, 10) || 1);
            const data = await apiPost('/roll-call/group', {
                class_name: state.currentClass,
                mode: state.groupMode,
                value,
            });
            renderGroups(data.groups || []);
            showStatus('group', '', false);
        } catch (err) {
            showStatus('group', err.message, true);
        } finally {
            updateButtons();
        }
    }

    function renderGroups(groups) {
        const wrap = $('#rcGroups');
        if (!groups.length) {
            wrap.innerHTML = `
                <div class="rc-groups__empty">
                    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                    <span>${esc(i18n.t('tools.rc.noGroups'))}</span>
                </div>`;
            return;
        }
        wrap.innerHTML = '';
        groups.forEach((members, gi) => {
            const group = document.createElement('div');
            group.className = 'rc-group';
            group.style.animationDelay = (gi * 0.06) + 's';
            const title = i18n.t('tools.rc.groupPrefix').replace('{n}', gi + 1);
            const countTxt = i18n.t('tools.rc.groupMembers').replace('{n}', members.length);
            const memberHtml = members.map((s, i) => `
                <div class="rc-member">
                    <span class="rc-member__num">${esc(s.class_number != null ? String(s.class_number) : (i + 1))}</span>
                    <span class="rc-member__name">${esc(s.display_name || s.username || '')}</span>
                </div>`).join('');
            group.innerHTML = `
                <div class="rc-group__head">
                    <span class="rc-group__title">${esc(title)}</span>
                    <span class="rc-group__count">${esc(countTxt)}</span>
                </div>
                <div class="rc-group__body">${memberHtml}</div>`;
            wrap.appendChild(group);
        });
    }

    // ── Keyboard shortcut ──
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Space 觸發抽籤,但排除輸入框
            if (e.code === 'Space' && state.mode === 'pick'
                && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
                e.preventDefault();
                const btn = $('#rcPickBtn');
                if (!btn.disabled) btn.click();
            }
        });
    }

    // ── init ──
    async function init() {
        ToolsCommon.applyI18n();
        await loadClasses();

        $('#rcClass').addEventListener('change', onClassChange);
        $$('.rc-tab').forEach(t => {
            t.addEventListener('click', () => switchMode(t.dataset.mode));
        });
        $('#rcPickBtn').addEventListener('click', doPick);
        $('#rcClearPicked').addEventListener('click', clearPicked);
        $('#rcPickedList').addEventListener('click', (e) => {
            const btn = e.target.closest('.rc-chip__close');
            if (!btn) return;
            const id = parseInt(btn.dataset.id, 10);
            if (Number.isFinite(id)) putBack(id);
        });
        $$('#rcGroupMode button').forEach(b => {
            b.addEventListener('click', () => switchGroupMode(b.dataset.mode));
        });
        $('#rcGroupBtn').addEventListener('click', doGroup);
        initSteppers();
        initKeyboard();

        updateButtons();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
