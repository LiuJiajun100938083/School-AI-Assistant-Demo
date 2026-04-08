/**
 * 協作佈告板 — 工作區 Controller
 * ================================
 *
 * 分層:
 *   api     — fetch / upload (所有 HTTP)
 *   ws      — WebSocket 連線 + 事件分派（寫 store）
 *   store   — 純資料 (board/sections/posts/online) + subscribe
 *   render  — 讀 store → DOM (含三種 layout)
 *   editor  — 貼文 modal
 *   canvas  — 拖拽事件
 *
 * 所有 DOM 更新走 store→render；事件觸發只改 store。
 */
(function () {
    'use strict';

    // ────────────────────────────────────────────────
    //  Util
    // ────────────────────────────────────────────────
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
    const mdRender = (text) => {
        if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
            return esc(text).replace(/\n/g, '<br>');
        }
        return DOMPurify.sanitize(marked.parse(text || '', { breaks: true, gfm: true }));
    };
    const applyI18n = () => {
        $$('[data-i18n]').forEach(el => el.textContent = i18n.t(el.dataset.i18n));
        $$('[data-i18n-placeholder]').forEach(el => el.placeholder = i18n.t(el.dataset.i18nPlaceholder));
        document.title = i18n.t('cb.pageTitle');
    };
    const BOARD_UUID = location.pathname.split('/').pop();

    // ────────────────────────────────────────────────
    //  api
    // ────────────────────────────────────────────────
    const token = () => {
        if (typeof AuthModule !== 'undefined' && AuthModule.getToken) return AuthModule.getToken() || '';
        return localStorage.getItem('auth_token')
            || localStorage.getItem('token')
            || '';
    };
    async function api(path, opts = {}) {
        const headers = Object.assign(
            { 'Authorization': 'Bearer ' + token() },
            opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
            opts.headers || {},
        );
        const res = await fetch('/api/boards/' + BOARD_UUID + path, { ...opts, headers });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            throw new Error((body.error && body.error.message) || body.message || 'Request failed');
        }
        return body.data;
    }

    // ────────────────────────────────────────────────
    //  store (pub/sub)
    // ────────────────────────────────────────────────
    const store = {
        state: {
            board: null,
            sections: [],
            posts: [],
            onlineCount: 1,
            layout: 'grid',
            me: null, // filled from posts
        },
        _subs: new Set(),
        subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); },
        set(patch) {
            Object.assign(this.state, patch);
            this._emit();
        },
        upsertPost(p) {
            const idx = this.state.posts.findIndex(x => x.id === p.id);
            if (idx >= 0) this.state.posts[idx] = Object.assign(this.state.posts[idx], p);
            else this.state.posts.push(p);
            this._emit();
        },
        removePost(id) {
            this.state.posts = this.state.posts.filter(x => x.id !== id);
            this._emit();
        },
        upsertSection(s) {
            const idx = this.state.sections.findIndex(x => x.id === s.id);
            if (idx >= 0) this.state.sections[idx] = s;
            else this.state.sections.push(s);
            this._emit();
        },
        removeSection(id) {
            this.state.sections = this.state.sections.filter(s => s.id !== id);
            this._emit();
        },
        _emit() {
            // rAF 合併多事件
            if (this._raf) return;
            this._raf = requestAnimationFrame(() => {
                this._raf = 0;
                this._subs.forEach(fn => fn(this.state));
            });
        },
    };

    // ────────────────────────────────────────────────
    //  ws
    // ────────────────────────────────────────────────
    let _ws = null;
    function connectWs() {
        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}/api/boards/${BOARD_UUID}/ws?token=${encodeURIComponent(token())}`;
        try {
            _ws = new WebSocket(url);
        } catch (e) {
            console.warn('WS init failed', e);
            return;
        }
        _ws.addEventListener('message', (e) => {
            try {
                const ev = JSON.parse(e.data);
                handleWsEvent(ev);
            } catch {}
        });
        _ws.addEventListener('close', () => {
            _ws = null;
            setTimeout(connectWs, 3000);
        });
    }
    function wsSend(obj) {
        if (_ws && _ws.readyState === 1) {
            try { _ws.send(JSON.stringify(obj)); } catch {}
        }
    }
    function handleWsEvent(ev) {
        const { type, payload } = ev || {};
        if (!type) return;
        if (type === 'presence') {
            store.set({ onlineCount: (payload.users || []).length || 1 });
        } else if (type === 'post.moved') {
            // canvas 拖拽落盤後的 post.moved: 直接更新位置,不觸發 full re-render
            // (否則會 teardown 當前 DOM 打斷連續拖拽/transition)
            const np = payload.post;
            const p = store.state.posts.find(x => x.id === np.id);
            if (p) {
                p.canvas_x = np.canvas_x;
                p.canvas_y = np.canvas_y;
                p.canvas_w = np.canvas_w;
                p.canvas_h = np.canvas_h;
                p.section_id = np.section_id;
                p.order_index = np.order_index;
            }
            if (store.state.layout === 'canvas') {
                const el = document.querySelector(`.cb-post[data-id="${np.id}"]`);
                if (el) {
                    el.style.transition = 'left 0.15s linear, top 0.15s linear';
                    if (np.canvas_x != null) el.style.left = np.canvas_x + 'px';
                    if (np.canvas_y != null) el.style.top = np.canvas_y + 'px';
                }
            } else {
                store._emit();
            }
        } else if (type === 'post.created' || type === 'post.updated' || type === 'post.state_changed') {
            store.upsertPost(payload.post);
        } else if (type === 'post.dragging') {
            // 拖拽過程即時滑動 — 直接動 DOM,不走 store,不重繪
            const el = document.querySelector(`.cb-post[data-id="${payload.id}"]`);
            if (el && payload.by !== store.state.me) {
                el.style.transition = 'left 0.12s linear, top 0.12s linear';
                el.style.left = payload.x + 'px';
                el.style.top = payload.y + 'px';
                // 同步進 store,避免下次重繪重置
                const p = store.state.posts.find(x => x.id === payload.id);
                if (p) { p.canvas_x = payload.x; p.canvas_y = payload.y; }
            }
        } else if (type === 'post.deleted') {
            store.removePost(payload.id);
        } else if (type === 'reaction.changed') {
            const p = store.state.posts.find(x => x.id === payload.post_id);
            if (p) {
                p.like_count = payload.count;
                if (payload.user_id === store.state.me) {
                    p.liked_by_me = payload.added;
                }
                store._emit();
            }
        } else if (type === 'comment.added') {
            const p = store.state.posts.find(x => x.id === payload.post_id);
            if (p) {
                p.comments = (p.comments || []).concat([payload.comment]);
                store._emit();
            }
        } else if (type === 'comment.deleted') {
            const p = store.state.posts.find(x => x.id === payload.post_id);
            if (p) {
                p.comments = (p.comments || []).filter(c => c.id !== payload.id);
                store._emit();
            }
        } else if (type === 'section.created' || type === 'section.updated') {
            store.upsertSection(payload.section);
        } else if (type === 'section.deleted') {
            store.removeSection(payload.id);
        } else if (type === 'board.updated') {
            store.set({ board: payload.board });
        }
    }

    // ────────────────────────────────────────────────
    //  render
    // ────────────────────────────────────────────────
    function renderHeader(state) {
        const b = state.board;
        if (!b) return;
        $('#hdrTitle .emoji').textContent = b.icon || '📌';
        $('#hdrTitleText').textContent = b.title;
        $('#presenceCount').textContent = i18n.t('cb.online').replace('{n}', state.onlineCount);

        const info = $('#infoBar');
        const desc = b.description ? `<span>${esc(b.description)}</span>` : '';
        info.innerHTML = desc;

        // layout active
        $$('#layoutSwitch button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.layout === state.layout);
        });

        // show add section button only for shelf
        $('#btnAddSection').style.display = state.layout === 'shelf' ? 'inline-flex' : 'none';
    }

    function renderPostInner(p) {
        const liked = p.liked_by_me ? 'liked' : '';
        const count = p.like_count || 0;
        const pending = p.status === 'pending' ? `<span class="cb-badge-pending">${i18n.t('cb.pendingBadge')}</span>` : '';
        const author = esc(p.author_name || i18n.t('cb.anonymous'));

        let media = '';
        if (p.kind === 'image' && p.media_url) {
            media = `<div class="cb-post__media"><img src="${esc(p.media_url)}" loading="lazy"></div>`;
        } else if (p.kind === 'file' && p.media_url) {
            media = `<a class="cb-post__file" href="${esc(p.media_url)}" target="_blank">📎 ${esc(p.title || 'file')}</a>`;
        } else if (p.kind === 'link' && p.link_url) {
            const m = p.link_meta || {};
            const thumb = m.image ? `<img class="cb-post__link-thumb" src="${esc(m.image)}">` : '';
            media = `
                <a class="cb-post__link" href="${esc(p.link_url)}" target="_blank" rel="noopener">
                    ${thumb}
                    <div class="cb-post__link-meta">
                        <div class="cb-post__link-title">${esc(m.title || p.link_url)}</div>
                        <div class="cb-post__link-desc">${esc(m.description || '')}</div>
                    </div>
                </a>`;
        }

        const title = p.title ? `<div class="cb-post__title">${esc(p.title)}</div>` : '';
        const body = p.body ? `<div class="cb-post__body">${mdRender(p.body)}</div>` : '';
        const moderateBtns = (p.status === 'pending')
            ? `<button data-action="approve">✓ ${i18n.t('cb.approve')}</button><button data-action="reject">✕ ${i18n.t('cb.reject')}</button>`
            : '';
        const commentBody = (p.comments || []).map(c => `
            <div class="cb-comment">
                <span class="cb-comment__author">${esc(c.author_name || '')}:</span>
                <span class="cb-comment__body">${esc(c.body)}</span>
            </div>`).join('');

        return `
            <div class="cb-post__head"><span class="cb-post__author">${author}</span>${pending}</div>
            ${title}
            ${body}
            ${media}
            <div class="cb-post__actions">
                <button data-action="like" class="${liked}">❤ <span>${count}</span></button>
                <button data-action="toggle-comments">💬 ${(p.comments || []).length}</button>
                <span class="spacer"></span>
                ${moderateBtns}
                <button data-action="delete" class="cb-btn--danger">🗑</button>
            </div>
            <div class="cb-comments">
                ${commentBody}
                <div class="cb-comments__form">
                    <input type="text" data-comment-input placeholder="${esc(i18n.t('cb.commentPh'))}">
                    <button class="cb-btn cb-btn--sm cb-btn--primary" data-action="send-comment">${esc(i18n.t('cb.send'))}</button>
                </div>
            </div>`;
    }

    function makePostEl(p) {
        const el = document.createElement('div');
        el.className = 'cb-post' + (p.status === 'pending' ? ' cb-post--pending' : '');
        el.dataset.id = p.id;
        if (p.color) el.style.borderLeft = `4px solid ${p.color}`;
        el.innerHTML = renderPostInner(p);
        attachPostHandlers(el, p);
        return el;
    }

    function attachPostHandlers(el, p) {
        el.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            e.stopPropagation();
            const action = btn.dataset.action;
            try {
                if (action === 'like') {
                    const r = await api(`/posts/${p.id}/reaction`, { method: 'POST', body: '{}' });
                    if (r) {
                        p.like_count = r.count;
                        p.liked_by_me = r.added;
                        store._emit();
                    }
                } else if (action === 'toggle-comments') {
                    el.querySelector('.cb-comments').classList.toggle('open');
                } else if (action === 'send-comment') {
                    const input = el.querySelector('[data-comment-input]');
                    const body = input.value.trim();
                    if (!body) return;
                    const c = await api(`/posts/${p.id}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
                    if (c) {
                        p.comments = (p.comments || []).concat([c]);
                        store._emit();
                    }
                    input.value = '';
                } else if (action === 'approve') {
                    const updated = await api(`/posts/${p.id}/state`, { method: 'POST', body: JSON.stringify({ event: 'approve' }) });
                    if (updated) store.upsertPost(updated);
                } else if (action === 'reject') {
                    const updated = await api(`/posts/${p.id}/state`, { method: 'POST', body: JSON.stringify({ event: 'reject' }) });
                    if (updated) store.upsertPost(updated);
                } else if (action === 'delete') {
                    if (!confirm(i18n.t('cb.confirmDelete'))) return;
                    await api(`/posts/${p.id}`, { method: 'DELETE' });
                    store.removePost(p.id);
                }
            } catch (err) { alert(err.message); }
        });
    }

    // ── Grid ──
    function renderGrid(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        body.innerHTML = '<div class="cb-grid" id="cbGrid"></div>';
        const grid = $('#cbGrid');
        const posts = sortedPosts(state.posts);
        if (!posts.length) {
            body.innerHTML = `<div class="cb-empty"><div class="cb-empty__icon">📭</div><div class="cb-empty__title">${i18n.t('cb.noPosts')}</div></div>`;
            return;
        }
        posts.forEach(p => grid.appendChild(makePostEl(p)));
    }

    // ── Shelf ──
    function renderShelf(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        const sections = (state.sections.length ? state.sections : [{ id: 0, name: '#', kind: 'column' }]);
        body.innerHTML = `<div class="cb-shelf" id="cbShelf"></div>`;
        const shelf = $('#cbShelf');
        sections.forEach(sec => {
            const col = document.createElement('div');
            col.className = 'cb-shelf__col';
            col.innerHTML = `
                <div class="cb-shelf__col-title">
                    <span>${esc(sec.name)}</span>
                    ${sec.kind === 'group' ? '<span class="cb-tag">👥</span>' : ''}
                </div>
                <div class="cb-shelf__col-body" data-sid="${sec.id}"></div>`;
            const bodyEl = col.querySelector('.cb-shelf__col-body');
            sortedPosts(state.posts)
                .filter(p => (p.section_id || 0) === sec.id)
                .forEach(p => bodyEl.appendChild(makePostEl(p)));
            shelf.appendChild(col);
        });
    }

    // ── Canvas ──
    function renderCanvas(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        body.innerHTML = '<div class="cb-canvas" id="cbCanvas"></div>';
        const canvas = $('#cbCanvas');
        sortedPosts(state.posts).forEach((p, i) => {
            const el = makePostEl(p);
            const x = p.canvas_x != null ? p.canvas_x : (40 + (i % 5) * 260);
            const y = p.canvas_y != null ? p.canvas_y : (40 + Math.floor(i / 5) * 240);
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            if (p.canvas_w) el.style.width = p.canvas_w + 'px';
            if (p.canvas_h) el.style.height = p.canvas_h + 'px';
            attachDragHandlers(el, p);
            canvas.appendChild(el);
        });
    }

    function attachDragHandlers(el, p) {
        let startX, startY, origX, origY, dragging = false;
        let lastSend = 0;
        const THROTTLE = 40; // ~25 fps

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button, input, a')) return;
            dragging = true;
            el.classList.add('dragging');
            el.style.transition = 'none';  // 自己拖拽無延遲
            el.setPointerCapture(e.pointerId);
            startX = e.clientX; startY = e.clientY;
            origX = parseFloat(el.style.left) || 0;
            origY = parseFloat(el.style.top) || 0;
        });
        el.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            const nx = origX + e.clientX - startX;
            const ny = origY + e.clientY - startY;
            el.style.left = nx + 'px';
            el.style.top = ny + 'px';
            // throttled WS 廣播 — 他人即時滑動
            const now = Date.now();
            if (now - lastSend >= THROTTLE) {
                lastSend = now;
                wsSend({ type: 'post.dragging', payload: { id: p.id, x: Math.round(nx), y: Math.round(ny) } });
            }
        });
        el.addEventListener('pointerup', async (e) => {
            if (!dragging) return;
            dragging = false;
            el.classList.remove('dragging');
            const nx = parseInt(el.style.left, 10);
            const ny = parseInt(el.style.top, 10);
            // 最後一幀確保同步
            wsSend({ type: 'post.dragging', payload: { id: p.id, x: nx, y: ny } });
            try {
                await api(`/posts/${p.id}/move`, {
                    method: 'POST',
                    body: JSON.stringify({ canvas_x: nx, canvas_y: ny }),
                });
            } catch (err) { console.warn(err); }
        });
    }

    function sortedPosts(posts) {
        return [...posts].sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
    }

    function render(state) {
        renderHeader(state);
        if (!state.board) return;
        const layout = state.layout;
        if (layout === 'grid') renderGrid(state);
        else if (layout === 'shelf') renderShelf(state);
        else if (layout === 'canvas') renderCanvas(state);
    }

    // ────────────────────────────────────────────────
    //  Post editor modal
    // ────────────────────────────────────────────────
    let currentKind = 'text';
    let uploadedUrl = '';
    window.closePostModal = () => $('#postModal').classList.remove('open');
    window.closeSectionModal = () => $('#sectionModal').classList.remove('open');

    function initPostModal() {
        $('#btnNewPost').addEventListener('click', () => {
            // fill sections dropdown
            const sel = $('#pSection');
            const secs = store.state.sections;
            if (secs.length) {
                sel.innerHTML = '<option value="">—</option>' +
                    secs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('');
                $('#pSectionWrap').style.display = '';
            } else {
                $('#pSectionWrap').style.display = 'none';
            }
            uploadedUrl = '';
            $('#pFileStatus').textContent = '';
            $('#pTitle').value = '';
            $('#pBody').value = '';
            $('#pLink').value = '';
            $('#pFile').value = '';
            $('#postModal').classList.add('open');
        });
        $$('#typeTabs .cb-type-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('#typeTabs .cb-type-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentKind = btn.dataset.kind;
                $('#pBodyWrap').style.display = (currentKind === 'text') ? '' : 'none';
                $('#pLinkWrap').style.display = (currentKind === 'link') ? '' : 'none';
                $('#pFileWrap').style.display = (currentKind === 'image' || currentKind === 'file') ? '' : 'none';
            });
        });
        $('#pFile').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            $('#pFileStatus').textContent = '⏳ ' + file.name;
            try {
                const fd = new FormData();
                fd.append('file', file);
                const result = await api('/uploads', { method: 'POST', body: fd });
                uploadedUrl = result.url;
                $('#pFileStatus').textContent = '✓ ' + file.name;
            } catch (err) {
                $('#pFileStatus').textContent = '✕ ' + err.message;
            }
        });
        $('#pSubmit').addEventListener('click', async () => {
            const payload = {
                kind: currentKind,
                title: $('#pTitle').value.trim(),
                body: $('#pBody').value.trim(),
                link_url: currentKind === 'link' ? $('#pLink').value.trim() : '',
                media_url: (currentKind === 'image' || currentKind === 'file') ? uploadedUrl : '',
            };
            const sid = $('#pSection').value;
            if (sid) payload.section_id = parseInt(sid, 10);
            if (currentKind === 'text' && !payload.body && !payload.title) {
                alert(i18n.t('cb.postBodyPh')); return;
            }
            if (currentKind === 'link' && !payload.link_url) {
                alert(i18n.t('cb.postLinkPh')); return;
            }
            if ((currentKind === 'image' || currentKind === 'file') && !payload.media_url) {
                alert(i18n.t('cb.postFileBtn')); return;
            }
            $('#pSubmit').disabled = true;
            $('#pSubmit').textContent = i18n.t('cb.publishing');
            try {
                const post = await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
                if (post) store.upsertPost(post);
                closePostModal();
            } catch (err) { alert(err.message); }
            finally {
                $('#pSubmit').disabled = false;
                $('#pSubmit').textContent = i18n.t('cb.publish');
            }
        });
    }

    function initSectionModal() {
        $('#btnAddSection').addEventListener('click', () => {
            $('#sName').value = '';
            $('#sKind').value = 'column';
            $('#sGroupMembers').value = '';
            $('#sGroupWrap').style.display = 'none';
            $('#sectionModal').classList.add('open');
        });
        $('#sKind').addEventListener('change', (e) => {
            $('#sGroupWrap').style.display = e.target.value === 'group' ? '' : 'none';
        });
        $('#sSubmit').addEventListener('click', async () => {
            const kind = $('#sKind').value;
            const name = $('#sName').value.trim();
            if (!name) { alert(i18n.t('cb.sectionNamePh')); return; }
            const payload = { name, kind, order_index: store.state.sections.length };
            if (kind === 'group') {
                payload.group_members = $('#sGroupMembers').value
                    .split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
            }
            try {
                const sec = await api('/sections', { method: 'POST', body: JSON.stringify(payload) });
                if (sec) store.upsertSection(sec);
                closeSectionModal();
            } catch (err) { alert(err.message); }
        });
    }

    // ────────────────────────────────────────────────
    //  Layout switch
    // ────────────────────────────────────────────────
    function initLayoutSwitch() {
        $$('#layoutSwitch button').forEach(btn => {
            btn.addEventListener('click', async () => {
                const lay = btn.dataset.layout;
                store.set({ layout: lay });
                // 同步後端（僅 owner 可改）— 失敗忽略
                try {
                    await api('', { method: 'PUT', body: JSON.stringify({ layout: lay }) });
                } catch {}
            });
        });
    }

    // ────────────────────────────────────────────────
    //  init
    // ────────────────────────────────────────────────
    async function init() {
        applyI18n();
        initPostModal();
        initSectionModal();
        initLayoutSwitch();
        store.subscribe(render);

        try {
            const data = await api('');
            store.set({
                board: data.board,
                sections: data.sections || [],
                posts: data.posts || [],
                layout: data.board.layout,
            });
            // 簡單判斷「我」的 id：用 posts 中的 liked_by_me 反推或從 token 解
            // 暫用 posts 裡的作者資訊做近似
        } catch (e) {
            $('#boardBody').innerHTML =
                `<div class="cb-empty"><div class="cb-empty__icon">⚠️</div><div class="cb-empty__title">${i18n.t('cb.loadFailed')}</div><div class="cb-empty__desc">${esc(e.message)}</div></div>`;
            return;
        }
        connectWs();
    }

    document.addEventListener('DOMContentLoaded', init);
})();
