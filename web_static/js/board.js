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
            me: null,
            sort: 'order_index',
            query: '',
            tagFilter: '',
            expanded: new Set(),  // post id 展開狀態
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
    const _myDragging = new Set();
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
                if (_myDragging.has(np.id)) return;  // 自己正在拖,不要被 echo 打擾
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
            // 跳過自己正在拖拽的 post,否則 echo 回來的 transition 會拖慢本機滑鼠
            if (_myDragging.has(payload.id)) return;
            const el = document.querySelector(`.cb-post[data-id="${payload.id}"]`);
            if (el) {
                el.style.transition = 'left 0.12s linear, top 0.12s linear';
                el.style.left = payload.x + 'px';
                el.style.top = payload.y + 'px';
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

    // ── Inline SVG icons (stroke: currentColor) ──
    const ICON = {
        like:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
        comment:  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        link:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
        pin:      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/></svg>',
        edit:     '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>',
        trash:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>',
        check:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
        cross:    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    };

    const REACTIONS = [
        { kind: 'like',   label: '讚' },
        { kind: 'heart',  label: '愛心' },
        { kind: 'thumb',  label: '讚好' },
        { kind: 'star',   label: '星' },
        { kind: 'clap',   label: '鼓掌' },
        { kind: 'laugh',  label: '哈' },
    ];

    function renderPostInner(p) {
        const pending = p.status === 'pending' ? `<span class="cb-badge-pending">${i18n.t('cb.pendingBadge')}</span>` : '';
        const pin = p.pinned ? `<span class="cb-badge-pin">📌 ${i18n.t('cb.pinned')}</span>` : '';
        const author = esc(p.author_name || i18n.t('cb.anonymous'));

        const media = _renderMedia(p);
        const title = p.title ? `<div class="cb-post__title">${esc(p.title)}</div>` : '';
        const expanded = store.state.expanded.has(p.id);
        const longBody = (p.body || '').length > 280;
        const bodyClass = (longBody && !expanded) ? 'cb-post__body collapsed' : 'cb-post__body';
        const body = p.body
            ? `<div class="${bodyClass}">${mdRender(p.body)}</div>` +
              (longBody ? `<button class="cb-post__expand" data-action="toggle-expand">${expanded ? i18n.t('cb.collapse') : i18n.t('cb.expand')}</button>` : '')
            : '';

        const tags = (p.tags && p.tags.length)
            ? `<div class="cb-post__tags">${p.tags.map(t => `<span class="cb-post__tag">#${esc(t)}</span>`).join('')}</div>`
            : '';

        const moderateBtns = (p.status === 'pending')
            ? `<button data-action="approve">${ICON.check}<span>${i18n.t('cb.approve')}</span></button>`
            + `<button data-action="reject">${ICON.cross}<span>${i18n.t('cb.reject')}</span></button>`
            : '';

        const likeCount = p.like_count || 0;
        const likedClass = p.liked_by_me ? 'liked' : '';
        const pickerBtns = REACTIONS.map(r =>
            `<button data-reaction="${r.kind}">${esc(r.label)}</button>`
        ).join('');

        const comments = (p.comments || []);
        const commentCount = comments.length;
        const commentBody = _renderComments(comments);

        return `
            <div class="cb-post__head">
                <span class="cb-post__author">${author}</span>
                ${pin}${pending}
            </div>
            ${title}
            ${body}
            ${media}
            ${tags}
            <div class="cb-post__actions">
                <div class="cb-react-wrap">
                    <button data-action="like" class="${likedClass}" title="${esc(i18n.t('cb.like'))}">
                        ${ICON.like}<span>${likeCount}</span>
                    </button>
                    <div class="cb-react-picker">${pickerBtns}</div>
                </div>
                <button data-action="toggle-comments" title="${esc(i18n.t('cb.comment'))}">
                    ${ICON.comment}<span>${commentCount}</span>
                </button>
                <button data-action="copy-link" title="${esc(i18n.t('cb.copyLink'))}">
                    ${ICON.link}
                </button>
                <span class="spacer"></span>
                ${moderateBtns}
                <button data-action="edit" title="${esc(i18n.t('cb.edit'))}">${ICON.edit}</button>
                <button data-action="pin" title="${esc(p.pinned ? i18n.t('cb.unpin') : i18n.t('cb.pin'))}" class="${p.pinned ? 'active' : ''}">${ICON.pin}</button>
                <button data-action="delete" class="cb-btn--danger" title="${esc(i18n.t('cb.delete'))}">${ICON.trash}</button>
            </div>
            <div class="cb-comments">
                ${commentBody}
                <div class="cb-comments__form">
                    <input type="text" data-comment-input placeholder="${esc(i18n.t('cb.commentPh'))}">
                    <button class="cb-btn cb-btn--sm cb-btn--primary" data-action="send-comment">${esc(i18n.t('cb.send'))}</button>
                </div>
            </div>`;
    }

    function _renderMedia(p) {
        // 優先多媒體陣列
        if (p.media && p.media.length) {
            const imgs = p.media.filter(m => (m.mime || '').startsWith('image/'));
            if (imgs.length) {
                const n = imgs.length;
                const shown = imgs.slice(0, 4);
                const clsN = Math.min(n, 4);
                const moreAttr = n > 4 ? `data-more="+${n - 4}"` : '';
                const moreClass = n > 4 ? ' cb-post__album--more' : '';
                return `<div class="cb-post__album cb-post__album--${clsN}${moreClass}" ${moreAttr}>` +
                    shown.map(m => `<img src="${esc(m.url)}" loading="lazy">`).join('') +
                    `</div>`;
            }
            // 檔案列表
            return shown_files(p.media);
        }
        if (p.kind === 'youtube' && p.link_meta && p.link_meta.embed_url) {
            return `<div class="cb-post__embed"><iframe src="${esc(p.link_meta.embed_url)}" allowfullscreen loading="lazy"></iframe></div>`;
        }
        if (p.kind === 'image' && p.media_url) {
            return `<div class="cb-post__media"><img src="${esc(p.media_url)}" loading="lazy"></div>`;
        }
        if (p.kind === 'video' && p.media_url) {
            return `<video src="${esc(p.media_url)}" controls style="width:100%;border-radius:8px"></video>`;
        }
        if (p.kind === 'file' && p.media_url) {
            return `<a class="cb-post__file" href="${esc(p.media_url)}" target="_blank">📎 ${esc(p.title || 'file')}</a>`;
        }
        if (p.kind === 'link' && p.link_url) {
            const m = p.link_meta || {};
            const thumb = m.image ? `<img class="cb-post__link-thumb" src="${esc(m.image)}">` : '';
            return `
                <a class="cb-post__link" href="${esc(p.link_url)}" target="_blank" rel="noopener">
                    ${thumb}
                    <div class="cb-post__link-meta">
                        <div class="cb-post__link-title">${esc(m.title || p.link_url)}</div>
                        <div class="cb-post__link-desc">${esc(m.description || '')}</div>
                    </div>
                </a>`;
        }
        return '';
    }
    function shown_files(media) {
        return media.map(m => `<a class="cb-post__file" href="${esc(m.url)}" target="_blank">📎 ${esc(m.original_name || m.url)}</a>`).join('');
    }

    // 嵌套評論 (parent_id)
    function _renderComments(comments) {
        if (!comments.length) return '';
        const byParent = new Map();
        for (const c of comments) {
            const key = c.parent_id || 0;
            if (!byParent.has(key)) byParent.set(key, []);
            byParent.get(key).push(c);
        }
        const renderOne = (c, depth) => {
            const cls = 'cb-comment' + (depth > 0 ? ' cb-comment--reply' : '');
            const children = (byParent.get(c.id) || []).map(ch => renderOne(ch, depth + 1)).join('');
            return `
                <div class="${cls}" data-cid="${c.id}">
                    <span class="cb-comment__author">${esc(c.author_name || '')}:</span>
                    <span class="cb-comment__body">${esc(c.body)}</span>
                    <button class="cb-post__expand" data-action="reply" data-cid="${c.id}">${esc(i18n.t('cb.reply'))}</button>
                </div>
                ${children}`;
        };
        return (byParent.get(0) || []).map(c => renderOne(c, 0)).join('');
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
        // 點讚長按 → 顯示 reaction picker
        const likeBtn = el.querySelector('button[data-action="like"]');
        const picker = el.querySelector('.cb-react-picker');
        let longPressTimer;
        if (likeBtn && picker) {
            const openPicker = () => picker.classList.add('open');
            const closePicker = () => picker.classList.remove('open');
            likeBtn.addEventListener('pointerdown', () => {
                longPressTimer = setTimeout(openPicker, 400);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
                likeBtn.addEventListener(evt, () => clearTimeout(longPressTimer))
            );
            picker.addEventListener('pointerleave', closePicker);
            picker.querySelectorAll('button[data-reaction]').forEach(b => {
                b.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    closePicker();
                    try {
                        const r = await api(`/posts/${p.id}/reaction`, {
                            method: 'POST', body: JSON.stringify({ kind: b.dataset.reaction }),
                        });
                        if (r) {
                            p.like_count = r.count;
                            p.liked_by_me = r.added;
                            store._emit();
                        }
                    } catch (err) { alert(err.message); }
                });
            });
        }

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
                    const parent_id = input.dataset.parent ? parseInt(input.dataset.parent, 10) : undefined;
                    const payload = parent_id ? { body, parent_id } : { body };
                    const c = await api(`/posts/${p.id}/comments`, { method: 'POST', body: JSON.stringify(payload) });
                    if (c) {
                        p.comments = (p.comments || []).concat([c]);
                        store._emit();
                    }
                    input.value = '';
                    delete input.dataset.parent;
                    input.placeholder = i18n.t('cb.commentPh');
                } else if (action === 'reply') {
                    const input = el.querySelector('[data-comment-input]');
                    input.dataset.parent = btn.dataset.cid;
                    input.placeholder = '↳ ' + i18n.t('cb.reply');
                    input.focus();
                    el.querySelector('.cb-comments').classList.add('open');
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
                } else if (action === 'pin') {
                    const updated = await api(`/posts/${p.id}/pin`, {
                        method: 'POST', body: JSON.stringify({ pinned: !p.pinned }),
                    });
                    if (updated) store.upsertPost(updated);
                } else if (action === 'copy-link') {
                    const url = `${location.origin}${location.pathname}#post=${p.id}`;
                    try {
                        await navigator.clipboard.writeText(url);
                        btn.textContent = '✓';
                        setTimeout(() => btn.textContent = '🔗', 1500);
                    } catch {
                        prompt(i18n.t('cb.copyLink'), url);
                    }
                } else if (action === 'toggle-expand') {
                    if (store.state.expanded.has(p.id)) store.state.expanded.delete(p.id);
                    else store.state.expanded.add(p.id);
                    store._emit();
                } else if (action === 'edit') {
                    openEditPost(p);
                }
            } catch (err) { alert(err.message); }
        });
    }

    // ── 編輯貼文 modal (重用 postModal) ──
    let _editingPostId = null;
    function openEditPost(p) {
        _editingPostId = p.id;
        $('#pTitle').value = p.title || '';
        $('#pBody').value = p.body || '';
        $('#pLink').value = p.link_url || '';
        $('#pAnonymous').checked = !!p.is_anonymous;
        // restore tags chips
        _currentTags = [...(p.tags || [])];
        renderTagChips();
        // kind tabs: 定位到對應 type (text/image/link/file)
        const targetKind = (p.kind === 'youtube') ? 'link' : p.kind;
        $$('#typeTabs .cb-type-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.kind === targetKind);
        });
        currentKind = targetKind;
        $('#pBodyWrap').style.display = (currentKind === 'text') ? '' : 'none';
        $('#pLinkWrap').style.display = (currentKind === 'link') ? '' : 'none';
        $('#pFileWrap').style.display = (currentKind === 'image' || currentKind === 'file') ? '' : 'none';
        $('#postModal').classList.add('open');
    }

    // ── Grid ──
    function renderGrid(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        body.innerHTML = '<div class="cb-grid" id="cbGrid"></div>';
        const grid = $('#cbGrid');
        const posts = viewedPosts(state);
        if (!posts.length) {
            body.innerHTML = `<div class="cb-empty"><div class="cb-empty__icon">📭</div><div class="cb-empty__title">${i18n.t('cb.noPosts')}</div></div>`;
            return;
        }
        posts.forEach(p => grid.appendChild(makePostEl(p)));
        scrollToDeepLink();
    }

    // ── Shelf ──
    function renderShelf(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        const sections = (state.sections.length ? state.sections : [{ id: 0, name: '#', kind: 'column' }]);
        body.innerHTML = `<div class="cb-shelf" id="cbShelf"></div>`;
        const shelf = $('#cbShelf');
        const posts = viewedPosts(state);
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
            posts
                .filter(p => (p.section_id || 0) === sec.id)
                .forEach(p => bodyEl.appendChild(makePostEl(p)));
            shelf.appendChild(col);
        });
        scrollToDeepLink();
    }

    // ── Canvas ──
    let _zoom = 1;
    function renderCanvas(state) {
        const body = $('#boardBody');
        body.className = 'cb-workspace__body';
        const isTouch = matchMedia('(hover: none)').matches;
        const hintText = isTouch
            ? '拖曳空白處平移　·　雙指縮放'
            : '拖曳空白處平移　·　⌘/Ctrl+滾輪縮放';
        body.innerHTML = `
            <div class="cb-canvas-viewport" id="cbViewport">
                <div class="cb-canvas" id="cbCanvas"></div>
                <div class="cb-canvas-hint">${hintText}</div>
                <div class="cb-zoom-indicator" id="cbZoom">100%</div>
            </div>`;
        const canvas = $('#cbCanvas');
        const viewport = $('#cbViewport');
        canvas.style.transform = `scale(${_zoom})`;
        $('#cbZoom').textContent = Math.round(_zoom * 100) + '%';

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

        attachPanHandlers(viewport);
        attachZoomHandlers(viewport, canvas);
    }

    function _setZoom(viewport, canvas, newZoom, cx, cy) {
        const rect = viewport.getBoundingClientRect();
        const mx = cx - rect.left + viewport.scrollLeft;
        const my = cy - rect.top + viewport.scrollTop;
        const prev = _zoom;
        _zoom = Math.max(0.25, Math.min(2, newZoom));
        canvas.style.transform = `scale(${_zoom})`;
        const ratio = _zoom / prev;
        viewport.scrollLeft = mx * ratio - (cx - rect.left);
        viewport.scrollTop = my * ratio - (cy - rect.top);
        const ind = $('#cbZoom');
        if (ind) ind.textContent = Math.round(_zoom * 100) + '%';
    }

    function attachPanHandlers(viewport) {
        // 多指追蹤: 單指拖空白 → 平移;雙指 → pinch 縮放
        const pointers = new Map();
        let panning = false;
        let sx = 0, sy = 0, sl = 0, st = 0;
        let pinchDist = 0, pinchCx = 0, pinchCy = 0, pinchBaseZoom = 1;
        const canvas = viewport.querySelector('.cb-canvas');

        const midPoint = () => {
            const arr = Array.from(pointers.values());
            return {
                x: (arr[0].x + arr[1].x) / 2,
                y: (arr[0].y + arr[1].y) / 2,
                d: Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y),
            };
        };

        viewport.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.cb-post')) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            viewport.setPointerCapture(e.pointerId);

            if (pointers.size === 1) {
                panning = true;
                viewport.classList.add('panning');
                sx = e.clientX; sy = e.clientY;
                sl = viewport.scrollLeft; st = viewport.scrollTop;
            } else if (pointers.size === 2) {
                panning = false;  // pinch 時暫停 pan
                const m = midPoint();
                pinchDist = m.d;
                pinchCx = m.x; pinchCy = m.y;
                pinchBaseZoom = _zoom;
            }
            e.preventDefault();
        });

        viewport.addEventListener('pointermove', (e) => {
            if (!pointers.has(e.pointerId)) return;
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

            if (pointers.size === 2) {
                const m = midPoint();
                if (pinchDist > 0) {
                    const nz = pinchBaseZoom * (m.d / pinchDist);
                    _setZoom(viewport, canvas, nz, m.x, m.y);
                }
                return;
            }
            if (panning && pointers.size === 1) {
                viewport.scrollLeft = sl - (e.clientX - sx);
                viewport.scrollTop = st - (e.clientY - sy);
            }
        });

        const end = (e) => {
            pointers.delete(e.pointerId);
            if (pointers.size < 2) pinchDist = 0;
            if (pointers.size === 0) {
                panning = false;
                viewport.classList.remove('panning');
            } else if (pointers.size === 1) {
                // 雙指放開剩一指 → 恢復 pan
                const only = Array.from(pointers.values())[0];
                sx = only.x; sy = only.y;
                sl = viewport.scrollLeft; st = viewport.scrollTop;
                panning = true;
            }
        };
        viewport.addEventListener('pointerup', end);
        viewport.addEventListener('pointercancel', end);
        viewport.addEventListener('pointerleave', end);
    }

    function attachZoomHandlers(viewport, canvas) {
        // Mac trackpad 捏合會產生 ctrlKey + wheel;一般滾輪需 Ctrl/Cmd
        viewport.addEventListener('wheel', (e) => {
            if (!(e.ctrlKey || e.metaKey)) return;
            e.preventDefault();
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            _setZoom(viewport, canvas, _zoom * factor, e.clientX, e.clientY);
        }, { passive: false });
    }

    function attachDragHandlers(el, p) {
        let startX, startY, origX, origY, dragging = false;
        let lastSend = 0;
        const THROTTLE = 40; // ~25 fps

        el.addEventListener('pointerdown', (e) => {
            if (e.target.closest('button, input, a')) return;
            dragging = true;
            _myDragging.add(p.id);
            el.classList.add('dragging');
            el.style.transition = 'none';  // 自己拖拽無延遲
            el.setPointerCapture(e.pointerId);
            startX = e.clientX; startY = e.clientY;
            origX = parseFloat(el.style.left) || 0;
            origY = parseFloat(el.style.top) || 0;
        });
        el.addEventListener('pointermove', (e) => {
            if (!dragging) return;
            el.style.transition = 'none';  // 每幀冪等重置,抵擋任何 echo 造成的 stale transition
            const nx = origX + (e.clientX - startX) / _zoom;
            const ny = origY + (e.clientY - startY) / _zoom;
            el.style.left = nx + 'px';
            el.style.top = ny + 'px';
            // throttled WS 廣播 — 他人即時滑動
            const now = Date.now();
            if (now - lastSend >= THROTTLE) {
                lastSend = now;
                wsSend({ type: 'post.dragging', payload: { id: p.id, x: Math.round(nx), y: Math.round(ny) } });
            }
        });
        const endDrag = async (e) => {
            if (!dragging) return;
            dragging = false;
            _myDragging.delete(p.id);
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
        };
        el.addEventListener('pointerup', endDrag);
        el.addEventListener('pointercancel', endDrag);
    }

    function sortedPosts(posts) {
        return [...posts].sort((a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id);
    }

    // Apply sort / search / tag filter (frontend pure, mirrors backend sort_filter.py)
    function viewedPosts(state) {
        let out = [...state.posts];
        // search
        const q = (state.query || '').trim().toLowerCase();
        if (q) {
            out = out.filter(p => {
                const hay = ((p.title || '') + ' ' + (p.body || '') + ' ' + (p.author_name || '')).toLowerCase();
                return hay.includes(q);
            });
        }
        // tag
        if (state.tagFilter) {
            const tf = state.tagFilter.toLowerCase();
            out = out.filter(p => (p.tags || []).some(t => (t || '').toLowerCase() === tf));
        }
        // sort
        const pinned = out.filter(p => p.pinned);
        const normal = out.filter(p => !p.pinned);
        const cmp = _cmpBySort(state.sort);
        pinned.sort(cmp);
        normal.sort(cmp);
        return pinned.concat(normal);
    }
    function _cmpBySort(mode) {
        switch (mode) {
            case 'latest':
                return (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || ''));
            case 'oldest':
                return (a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''));
            case 'most_liked':
                return (a, b) => (b.like_count || 0) - (a.like_count || 0);
            case 'author':
                return (a, b) => (a.author_name || '').localeCompare(b.author_name || '');
            case 'order_index':
            default:
                return (a, b) => (a.order_index || 0) - (b.order_index || 0) || a.id - b.id;
        }
    }

    // 深連結: URL hash #post=123 → 滾到並高亮
    function scrollToDeepLink() {
        const m = (location.hash || '').match(/post=(\d+)/);
        if (!m) return;
        const id = parseInt(m[1], 10);
        setTimeout(() => {
            const el = document.querySelector(`.cb-post[data-id="${id}"]`);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.style.transition = 'box-shadow 0.4s';
                el.style.boxShadow = '0 0 0 3px var(--cb-brand)';
                setTimeout(() => { el.style.boxShadow = ''; }, 2000);
            }
        }, 100);
    }

    function render(state) {
        renderHeader(state);
        refreshTagFilterOptions(state);
        if (!state.board) return;
        const layout = state.layout;
        if (layout === 'grid') renderGrid(state);
        else if (layout === 'shelf') renderShelf(state);
        else if (layout === 'canvas') renderCanvas(state);
        // 套用 theme 背景到 workspace body
        applyThemeBackground(state);
    }

    async function applyThemeBackground(state) {
        const themeId = state.board && state.board.theme;
        if (!themeId) return;
        if (!applyThemeBackground._cache) applyThemeBackground._cache = {};
        let list = applyThemeBackground._cache.list;
        if (!list) {
            try {
                const res = await fetch('/api/boards/themes/list', {
                    headers: { 'Authorization': 'Bearer ' + token() },
                });
                const body = await res.json();
                list = (body && body.data) || [];
            } catch { list = []; }
            applyThemeBackground._cache.list = list;
        }
        const t = list.find(x => x.id === themeId);
        if (!t) return;
        const wrap = $('#boardBody');
        if (wrap) wrap.style.background = t.background;
    }

    // ────────────────────────────────────────────────
    //  Post editor modal
    // ────────────────────────────────────────────────
    let currentKind = 'text';
    let uploadedUrl = '';
    let uploadedMedia = [];  // 多圖: [{url, mime, original_name}]
    let _currentTags = [];
    window.closePostModal = () => {
        $('#postModal').classList.remove('open');
        _editingPostId = null;
    };
    window.closeSectionModal = () => $('#sectionModal').classList.remove('open');
    window.closeActivity = () => $('#activityDrawer').classList.remove('open');

    function renderTagChips() {
        const wrap = $('#pTagsWrap');
        if (!wrap) return;
        wrap.querySelectorAll('.cb-tag-chip').forEach(n => n.remove());
        const input = $('#pTagInput');
        _currentTags.forEach((t, i) => {
            const chip = document.createElement('span');
            chip.className = 'cb-tag-chip';
            chip.innerHTML = `${esc(t)} <button type="button" data-idx="${i}">×</button>`;
            chip.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                _currentTags.splice(parseInt(e.target.dataset.idx, 10), 1);
                renderTagChips();
            });
            wrap.insertBefore(chip, input);
        });
    }

    function initPostModal() {
        $('#btnNewPost').addEventListener('click', () => {
            _editingPostId = null;
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
            uploadedMedia = [];
            _currentTags = [];
            renderTagChips();
            $('#pFileStatus').textContent = '';
            $('#pTitle').value = '';
            $('#pBody').value = '';
            $('#pLink').value = '';
            $('#pFile').value = '';
            $('#pAnonymous').checked = false;
            $('#postModal').classList.add('open');
        });

        // Tag input: Enter 新增
        $('#pTagInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                const v = e.target.value.trim().replace(/,/g, '');
                if (v && !_currentTags.includes(v) && _currentTags.length < 8) {
                    _currentTags.push(v);
                    renderTagChips();
                }
                e.target.value = '';
            } else if (e.key === 'Backspace' && !e.target.value && _currentTags.length) {
                _currentTags.pop();
                renderTagChips();
            }
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
        // multi-file support via repeated upload calls
        $('#pFile').multiple = true;
        $('#pFile').addEventListener('change', async (e) => {
            const files = Array.from(e.target.files || []);
            if (!files.length) return;
            $('#pFileStatus').textContent = '⏳ ' + files.map(f => f.name).join(', ');
            uploadedMedia = [];
            uploadedUrl = '';
            try {
                for (const file of files) {
                    const fd = new FormData();
                    fd.append('file', file);
                    const r = await api('/uploads', { method: 'POST', body: fd });
                    uploadedMedia.push({
                        url: r.url,
                        mime: r.mime || '',
                        original_name: r.original_name || file.name,
                        size: r.size || 0,
                    });
                }
                if (uploadedMedia.length === 1) uploadedUrl = uploadedMedia[0].url;
                $('#pFileStatus').textContent = `✓ ${uploadedMedia.length} ${files.length > 1 ? 'files' : ''}`;
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
                tags: [..._currentTags],
                is_anonymous: $('#pAnonymous').checked,
            };
            if ((currentKind === 'image' || currentKind === 'file') && uploadedMedia.length > 1) {
                payload.media = uploadedMedia;
            }
            const sid = $('#pSection').value;
            if (sid) payload.section_id = parseInt(sid, 10);
            if (currentKind === 'text' && !payload.body && !payload.title) {
                alert(i18n.t('cb.postBodyPh')); return;
            }
            if (currentKind === 'link' && !payload.link_url) {
                alert(i18n.t('cb.postLinkPh')); return;
            }
            if ((currentKind === 'image' || currentKind === 'file') && !payload.media_url && !payload.media && !_editingPostId) {
                alert(i18n.t('cb.postFileBtn')); return;
            }
            $('#pSubmit').disabled = true;
            $('#pSubmit').textContent = i18n.t('cb.publishing');
            try {
                if (_editingPostId) {
                    const updates = {
                        title: payload.title,
                        body: payload.body,
                        link_url: payload.link_url,
                        tags: payload.tags,
                        is_anonymous: payload.is_anonymous,
                    };
                    if (payload.media_url) updates.media_url = payload.media_url;
                    if (payload.media) updates.media = payload.media;
                    const updated = await api(`/posts/${_editingPostId}`, { method: 'PATCH', body: JSON.stringify(updates) });
                    if (updated) store.upsertPost(updated);
                } else {
                    const post = await api('/posts', { method: 'POST', body: JSON.stringify(payload) });
                    if (post) store.upsertPost(post);
                }
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
    //  Toolbar: search / sort / tag filter / menu / activity
    // ────────────────────────────────────────────────
    function initToolbar() {
        // search
        const searchInput = $('#searchInput');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                store.set({ query: e.target.value });
            });
        }
        // sort
        const sortSelect = $('#sortSelect');
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                store.set({ sort: e.target.value });
            });
        }
        // tag filter
        const tagFilter = $('#tagFilter');
        if (tagFilter) {
            tagFilter.addEventListener('change', (e) => {
                store.set({ tagFilter: e.target.value });
            });
        }

        // menu (⋯)
        const menu = $('#btnMenu');
        const dropdown = $('#menuDropdown');
        if (menu && dropdown) {
            menu.addEventListener('click', (e) => {
                e.stopPropagation();
                menu.parentElement.classList.toggle('open');
            });
            document.addEventListener('click', () => {
                menu.parentElement.classList.remove('open');
            });
            dropdown.addEventListener('click', async (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                const action = btn.dataset.action;
                try {
                    if (action.startsWith('export-')) {
                        const fmt = action.split('-')[1];
                        downloadExport(fmt);
                    } else if (action === 'print') {
                        window.print();
                    } else if (action === 'remake') {
                        const newBoard = await api('/clone', { method: 'POST', body: '{}' });
                        if (newBoard && newBoard.uuid) {
                            location.href = '/boards/' + newBoard.uuid;
                        }
                    } else if (action === 'clear-all') {
                        if (!confirm(i18n.t('cb.clearAllConfirm'))) return;
                        await api('/clear', { method: 'POST' });
                        store.set({ posts: [] });
                    }
                } catch (err) { alert(err.message); }
                menu.parentElement.classList.remove('open');
            });
        }

        // activity drawer
        const actBtn = $('#btnActivity');
        if (actBtn) {
            actBtn.addEventListener('click', async () => {
                $('#activityDrawer').classList.add('open');
                try {
                    const rows = await api('/activity?limit=100');
                    $('#activityList').innerHTML = (rows || []).map(r => `
                        <div class="cb-activity-item">
                            <div><span class="actor">${esc(r.actor_name || '')}</span> · ${esc(r.event_type)}</div>
                            <div class="time">${esc(String(r.created_at || ''))}</div>
                        </div>`).join('') || '<div class="cb-empty">—</div>';
                } catch (e) {
                    $('#activityList').innerHTML = '<div class="cb-empty">' + esc(e.message) + '</div>';
                }
            });
        }

        // hash change → re-scroll
        window.addEventListener('hashchange', scrollToDeepLink);
    }

    async function downloadExport(fmt) {
        const url = `/api/boards/${BOARD_UUID}/export?fmt=${fmt}`;
        try {
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token() } });
            if (!res.ok) throw new Error('export failed');
            const blob = await res.blob();
            const a = document.createElement('a');
            const dlUrl = URL.createObjectURL(blob);
            a.href = dlUrl;
            a.download = (store.state.board?.title || 'board') + '.' + fmt;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(dlUrl), 1000);
        } catch (err) { alert(err.message); }
    }

    function refreshTagFilterOptions(state) {
        const sel = $('#tagFilter');
        if (!sel) return;
        const allTags = new Set();
        state.posts.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));
        const current = sel.value;
        const opts = [`<option value="">${esc(i18n.t('cb.tagFilterAll'))}</option>`]
            .concat([...allTags].sort().map(t => `<option value="${esc(t)}">${esc(t)}</option>`));
        sel.innerHTML = opts.join('');
        if ([...allTags].includes(current)) sel.value = current;
    }

    // ────────────────────────────────────────────────
    //  鍵盤快捷鍵 (Mac)
    // ────────────────────────────────────────────────
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            // Esc 關閉任何開著的 modal
            if (e.key === 'Escape') {
                document.querySelectorAll('.cb-modal.open').forEach(m => m.classList.remove('open'));
            }
            // N 新貼文 (無 modifier)
            if (e.key === 'n' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                const active = document.activeElement;
                if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
                const btn = $('#btnNewPost');
                if (btn) btn.click();
            }
            // Cmd/Ctrl + 0 重置縮放
            if ((e.metaKey || e.ctrlKey) && e.key === '0' && store.state.layout === 'canvas') {
                e.preventDefault();
                const viewport = $('#cbViewport');
                const canvas = $('#cbCanvas');
                if (viewport && canvas) {
                    const rect = viewport.getBoundingClientRect();
                    _setZoom(viewport, canvas, 1, rect.left + rect.width / 2, rect.top + rect.height / 2);
                }
            }
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
        initToolbar();
        initKeyboard();
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
