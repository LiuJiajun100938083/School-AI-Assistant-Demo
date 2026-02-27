/**
 * 學校 AI 學習中心 — school_learning_center.js
 * ============================================================
 * 架構: SLC 命名空間 + API / UI / App 三物件模式
 */

window.slc = (() => {
    'use strict';

    // ── 狀態 ──
    const state = {
        subjects: [],
        currentSubject: null,
        currentGrade: null,
        currentTab: 'resources',
        contentTypeFilter: null,
        contents: [],
        knowledgeMap: { nodes: [], edges: [] },
        paths: [],
        aiMessages: [],
        aiStreaming: false,
        // 當前查看的內容（用於 AI 助教內容感知問答）
        currentContentId: null,
        currentContentTitle: null,
        pdfGoToPage: null,  // PDF.js goToPage 函數引用
        // Admin
        isAdmin: false,
        userRole: 'student',
        adminPanelOpen: false,
        adminTab: 'upload',
        adminNodes: [],
        uploadFile: null,
    };

    const GRADES = ['中一', '中二', '中三', '中四', '中五', '中六'];
    const ADMIN_API = '/api/admin/school-learning-center';

    // ── 獲取 Token ──
    function _getToken() {
        return localStorage.getItem('auth_token') || localStorage.getItem('token') || '';
    }

    // ── API ──
    const API = {
        _headers() {
            return {
                'Authorization': `Bearer ${_getToken()}`,
                'Content-Type': 'application/json',
            };
        },

        async getSubjects() {
            const r = await fetch('/api/school-learning-center/subjects', { headers: this._headers() });
            const j = await r.json();
            if (!r.ok) console.error('getSubjects error:', r.status, j);
            return j.data || [];
        },

        async getContents(subjectCode, gradeLevel, contentType, page = 1, pageSize = 50) {
            const params = new URLSearchParams({ page, page_size: pageSize });
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            if (contentType) params.set('content_type', contentType);
            const r = await fetch(`/api/school-learning-center/contents?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getKnowledgeMap(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/school-learning-center/knowledge-map${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || { nodes: [], edges: [] };
        },

        async getPaths(subjectCode, gradeLevel) {
            const params = new URLSearchParams();
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            const qs = params.toString();
            const r = await fetch(`/api/school-learning-center/paths${qs ? '?' + qs : ''}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getPathDetail(pathId) {
            const r = await fetch(`/api/school-learning-center/paths/${pathId}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || null;
        },

        async getStats(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/school-learning-center/stats${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || {};
        },

        async searchContents(keyword, subjectCode) {
            const params = new URLSearchParams({ keyword });
            if (subjectCode) params.set('subject_code', subjectCode);
            const r = await fetch(`/api/school-learning-center/search?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        aiAskStream(question, subjectCode, contentId) {
            const body = { question };
            if (subjectCode) body.subject_code = subjectCode;
            if (contentId) body.content_id = contentId;
            return fetch('/api/school-learning-center/ai-ask-stream', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
        },

        // ── Admin APIs ──
        async adminUpload(formData) {
            const r = await fetch(`${ADMIN_API}/upload`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${_getToken()}` },
                body: formData,
            });
            return r.json();
        },

        async adminCreateContent(body) {
            const r = await fetch(`${ADMIN_API}/contents`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeleteContent(id) {
            const r = await fetch(`${ADMIN_API}/contents/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminCreateNode(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-nodes`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeleteNode(id) {
            const r = await fetch(`${ADMIN_API}/knowledge-nodes/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminCreateEdge(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-edges`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminBatchImportGraph(body) {
            const r = await fetch(`${ADMIN_API}/knowledge-graph/batch-import`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminCreatePath(body) {
            const r = await fetch(`${ADMIN_API}/paths`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },

        async adminDeletePath(id) {
            const r = await fetch(`${ADMIN_API}/paths/${id}`, {
                method: 'DELETE',
                headers: this._headers(),
            });
            return r.json();
        },

        async adminBatchImportPaths(body) {
            const r = await fetch(`${ADMIN_API}/paths/batch-import`, {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
            return r.json();
        },
    };

    // ── UI ──
    const UI = {
        // --- 側邊欄 ---
        renderSubjects(subjects) {
            const list = document.getElementById('subjectList');
            if (!list) return;
            if (!subjects.length) {
                list.innerHTML = '<div class="slc-empty-state"><div class="slc-empty-state__icon">📚</div><div>暫無科目資源</div></div>';
                return;
            }
            list.innerHTML = subjects.map(s => `
                <div class="slc-subject-item ${state.currentSubject?.subject_code === s.subject_code ? '--active' : ''}"
                     data-code="${s.subject_code}" onclick="slc.selectSubject('${s.subject_code}')">
                    <span class="slc-subject-item__icon">${s.icon || '📚'}</span>
                    <span class="slc-subject-item__name">${s.subject_name}</span>
                    <span class="slc-subject-item__count">${s.content_count || 0}</span>
                </div>
            `).join('');
        },

        // --- 年級欄 ---
        renderGradeBar() {
            const bar = document.getElementById('gradeBar');
            if (!bar) return;
            const chips = ['全部', ...GRADES].map(g => {
                const isAll = g === '全部';
                const active = isAll ? !state.currentGrade : state.currentGrade === g;
                return `<button class="slc-grade-chip ${active ? '--active' : ''}"
                            onclick="slc.selectGrade(${isAll ? 'null' : `'${g}'`})">${g}</button>`;
            }).join('');
            bar.innerHTML = `<span class="slc-grade-bar__label">年級：</span>${chips}`;
        },

        // --- Tab ---
        setActiveTab(tab) {
            document.querySelectorAll('.slc-tab-btn').forEach(btn => {
                btn.classList.toggle('--active', btn.dataset.tab === tab);
            });
            document.querySelectorAll('.slc-tab-panel').forEach(panel => {
                panel.classList.toggle('--active', panel.id === `tab-${tab}`);
            });
        },

        // --- 教學資源（電子教科書目錄） ---
        renderEbookDirectory(items) {
            const nav = document.getElementById('slcEbookDirectory');
            if (!nav) return;
            if (!items || !items.length) {
                nav.innerHTML = '<p class="slc-ebook-nav-empty">該科目暫無教學資源</p>';
                return;
            }

            const typeIcon = { document: '📄', video_local: '🎬', video_external: '🔗', article: '📝', image: '🖼️' };
            const typeLabel = { document: '文檔', video_local: '本地視頻', video_external: '外部視頻', article: '文章', image: '圖片' };

            // 按類型分組
            const grouped = {};
            items.forEach(item => {
                const t = item.content_type || 'document';
                if (!grouped[t]) grouped[t] = [];
                grouped[t].push(item);
            });

            const typeOrder = ['document', 'video_local', 'video_external', 'article', 'image'];
            let html = '';

            typeOrder.forEach(t => {
                if (!grouped[t] || !grouped[t].length) return;
                const icon = typeIcon[t] || '📎';
                const label = typeLabel[t] || t;
                html += `<div class="slc-ebook-folder">
                    <div class="slc-ebook-folder-header">
                        <span class="slc-ebook-folder-arrow">▾</span>
                        <span class="slc-ebook-folder-icon">${icon}</span>
                        <span class="slc-ebook-folder-name">${label} (${grouped[t].length})</span>
                    </div>
                    <ul class="slc-ebook-folder-items">`;
                grouped[t].forEach(item => {
                    html += `<li class="slc-ebook-item" data-id="${item.id}" data-type="${t}">
                        <span class="slc-ebook-item-icon">${icon}</span>
                        <span class="slc-ebook-item-title">${_escHtml(item.title)}</span>
                    </li>`;
                });
                html += `</ul></div>`;
            });

            nav.innerHTML = html;

            // 文件夾摺疊
            nav.querySelectorAll('.slc-ebook-folder-header').forEach(header => {
                header.addEventListener('click', () => {
                    header.closest('.slc-ebook-folder').classList.toggle('slc-ebook-folder--collapsed');
                });
            });

            // 點擊內容項 → 右側內嵌顯示
            nav.querySelectorAll('.slc-ebook-item').forEach(item => {
                item.addEventListener('click', () => {
                    nav.querySelectorAll('.slc-ebook-item').forEach(i => i.classList.remove('slc-ebook-item--active'));
                    item.classList.add('slc-ebook-item--active');
                    const contentId = item.getAttribute('data-id');
                    App.openContent(parseInt(contentId));
                });
            });
        },

        showResourceLoading() {
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) nav.innerHTML = '<p class="slc-ebook-nav-empty">加載中...</p>';
        },

        // --- 知識圖譜 ---
        renderKnowledgeMap(mapData) {
            const container = document.getElementById('knowledgeMapContainer');
            if (!container) return;

            container.innerHTML = '';
            const detail = document.createElement('div');
            detail.className = 'slc-node-detail';
            detail.id = 'nodeDetail';
            container.appendChild(detail);

            if (!mapData.nodes || !mapData.nodes.length) {
                container.innerHTML = '<div class="slc-map-empty"><div class="slc-map-empty__icon">🗺️</div><div>該科目暫無知識圖譜</div></div>';
                return;
            }

            const width = container.clientWidth;
            const height = container.clientHeight || 500;

            const svg = d3.select(container).insert('svg', ':first-child')
                .attr('width', width).attr('height', height);

            const g = svg.append('g');

            // Zoom
            const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', (e) => g.attr('transform', e.transform));
            svg.call(zoom);

            // Force simulation
            const nodes = mapData.nodes.map(n => ({ ...n }));
            const nodeMap = {};
            nodes.forEach(n => { nodeMap[n.id] = n; });

            const edges = (mapData.edges || []).filter(e =>
                nodeMap[e.source_node_id] && nodeMap[e.target_node_id]
            ).map(e => ({ source: e.source_node_id, target: e.target_node_id, ...e }));

            const simulation = d3.forceSimulation(nodes)
                .force('link', d3.forceLink(edges).id(d => d.id).distance(120))
                .force('charge', d3.forceManyBody().strength(-300))
                .force('center', d3.forceCenter(width / 2, height / 2))
                .force('collision', d3.forceCollide().radius(40));

            // Links
            const link = g.selectAll('.link')
                .data(edges).enter().append('line')
                .attr('class', 'link')
                .attr('stroke', '#ccc').attr('stroke-width', 1.5)
                .attr('stroke-opacity', 0.6);

            // Node groups
            const nodeGroup = g.selectAll('.node')
                .data(nodes).enter().append('g')
                .attr('class', 'node')
                .style('cursor', 'pointer')
                .call(d3.drag()
                    .on('start', (e, d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                    .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
                    .on('end', (e, d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
                );

            nodeGroup.append('circle')
                .attr('r', d => (d.node_size || 40) / 2 + 8)
                .attr('fill', d => d.color || '#006633')
                .attr('opacity', 0.85);

            nodeGroup.append('text')
                .text(d => d.icon || '💡')
                .attr('text-anchor', 'middle')
                .attr('dominant-baseline', 'central')
                .attr('font-size', '16px');

            nodeGroup.append('text')
                .text(d => d.title.length > 8 ? d.title.slice(0, 8) + '…' : d.title)
                .attr('text-anchor', 'middle')
                .attr('dy', d => (d.node_size || 40) / 2 + 18)
                .attr('font-size', '12px')
                .attr('fill', '#333');

            nodeGroup.on('click', (e, d) => UI.showNodeDetail(d));

            simulation.on('tick', () => {
                link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                    .attr('x2', d => d.target.x).attr('y2', d => d.target.y);
                nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
            });
        },

        showNodeDetail(node) {
            const panel = document.getElementById('nodeDetail');
            if (!panel) return;

            const contents = (node.contents || []);
            const resourcesHtml = contents.length
                ? contents.map(c => {
                    const pg = c.anchor?.type === 'page' ? c.anchor.value : 0;
                    return `
                    <div class="slc-node-resource-item" onclick="slc.openContent(${c.content_id}, '${c.content_type || 'document'}', ${pg})">
                        📎 ${_escHtml(c.content_title || '資源')}
                        ${pg ? `<span style="color:var(--slc-primary);font-size:12px">第${pg}頁</span>` : ''}
                    </div>`;
                }).join('')
                : '<div style="font-size:13px;color:var(--slc-text-secondary)">暫無關聯資源</div>';

            panel.innerHTML = `
                <div class="slc-node-detail__header">
                    <span>${node.icon || '💡'}</span>
                    <span class="slc-node-detail__title">${_escHtml(node.title)}</span>
                    <button class="slc-node-detail__close" onclick="document.getElementById('nodeDetail').classList.remove('--visible')">✕</button>
                </div>
                <div class="slc-node-detail__body">
                    <div class="slc-node-detail__desc">${_escHtml(node.description || '暫無描述')}</div>
                    <div class="slc-node-detail__resources">
                        <h4>📎 關聯資源</h4>
                        ${resourcesHtml}
                    </div>
                </div>
            `;
            panel.classList.add('--visible');
        },

        showMapLoading() {
            const container = document.getElementById('knowledgeMapContainer');
            if (container) container.innerHTML = '<div class="slc-loading"><div class="slc-loading__spinner"></div><div>加載知識圖譜...</div></div>';
        },

        // --- 學習路徑 ---
        renderPaths(paths) {
            const list = document.getElementById('pathList');
            if (!list) return;
            if (!paths.length) {
                list.innerHTML = '<div class="slc-empty-state"><div class="slc-empty-state__icon">🗺️</div><div class="slc-empty-state__text">該科目暫無學習路徑</div></div>';
                return;
            }
            list.innerHTML = paths.map(p => {
                const diffLabel = { beginner: '入門', intermediate: '進階', advanced: '高級' };
                const stepsCount = (p.steps || []).length;
                return `
                <div class="slc-path-card" data-path-id="${p.id}">
                    <div class="slc-path-card__header" onclick="slc.togglePathSteps(${p.id})">
                        <span class="slc-path-card__icon">${p.icon || '🎯'}</span>
                        <div class="slc-path-card__info">
                            <div class="slc-path-card__title">${_escHtml(p.title)}</div>
                            <div class="slc-path-card__desc">${_escHtml(p.description || '')}</div>
                        </div>
                        <div class="slc-path-card__meta">
                            <span class="slc-difficulty --${p.difficulty || 'beginner'}">${diffLabel[p.difficulty] || p.difficulty}</span>
                            <span class="slc-path-meta-item">⏱ ${p.estimated_hours || 1}h</span>
                            <span class="slc-path-meta-item">📋 ${stepsCount} 步</span>
                        </div>
                        <button class="slc-path-card__toggle" id="toggleBtn-${p.id}">▼</button>
                    </div>
                    <div class="slc-path-card__steps" id="pathSteps-${p.id}"></div>
                </div>`;
            }).join('');
        },

        renderPathSteps(pathId, steps) {
            const container = document.getElementById(`pathSteps-${pathId}`);
            if (!container) return;

            if (!steps.length) {
                container.innerHTML = '<div style="padding:16px;color:var(--slc-text-secondary)">暫無步驟</div>';
                return;
            }

            container.innerHTML = `<div class="slc-step-timeline">${steps.map(s => {
                const link = s.content_id
                    ? `<a class="slc-step-item__link" onclick="event.stopPropagation(); slc.openContent(${s.content_id}, '${s.content_type || 'document'}', ${s.anchor?.type === 'page' ? s.anchor.value : 0})">
                        📎 ${_escHtml(s.content_title || '查看資源')}
                        ${s.anchor?.type === 'page' ? ` (第${s.anchor.value}頁)` : ''}
                       </a>`
                    : '';
                return `
                <div class="slc-step-item">
                    <div class="slc-step-item__title">${s.step_order + 1}. ${_escHtml(s.title)}</div>
                    <div class="slc-step-item__desc">${_escHtml(s.description || '')}</div>
                    ${link}
                </div>`;
            }).join('')}</div>`;
        },

        showPathLoading() {
            const list = document.getElementById('pathList');
            if (list) list.innerHTML = '<div class="slc-loading"><div class="slc-loading__spinner"></div><div>加載學習路徑...</div></div>';
        },

        // --- AI 聊天 ---
        addAIMessage(role, content) {
            const container = document.getElementById('aiMessages');
            if (!container) return;
            const msg = document.createElement('div');
            msg.className = `slc-ai-msg --${role}`;
            msg.innerHTML = `<div class="slc-ai-msg__bubble">${
                role === 'assistant' ? _renderMarkdown(content) : _escHtml(content)
            }</div>`;
            container.appendChild(msg);
            container.scrollTop = container.scrollHeight;
            return msg;
        },

        updateLastAIMessage(content) {
            const container = document.getElementById('aiMessages');
            if (!container) return;
            const msgs = container.querySelectorAll('.slc-ai-msg.--assistant');
            if (msgs.length) {
                const last = msgs[msgs.length - 1];
                last.querySelector('.slc-ai-msg__bubble').innerHTML = _renderMarkdown(content);
                container.scrollTop = container.scrollHeight;
            }
        },

        // --- 內容查看器（內嵌版） ---
        closeEbookViewer() {
            const welcome = document.getElementById('slcEbookWelcome');
            const viewer = document.getElementById('slcEbookViewer');
            const bodyEl = document.getElementById('slcViewerBody');
            if (welcome) welcome.style.display = '';
            if (viewer) viewer.style.display = 'none';
            if (bodyEl) bodyEl.innerHTML = '';
            // 清除當前內容上下文
            state.currentContentId = null;
            state.currentContentTitle = null;
            state.pdfGoToPage = null;
            _updateAIContentContext();
            // 取消目錄高亮
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) nav.querySelectorAll('.slc-ebook-item').forEach(i => i.classList.remove('slc-ebook-item--active'));
        },

        // --- Header stats ---
        updateHeaderStats(stats) {
            const el = document.getElementById('headerStats');
            if (!el) return;
            const total = stats.total_contents || 0;
            const nodes = stats.total_nodes || 0;
            const paths = stats.total_paths || 0;
            el.textContent = `${total} 資源 · ${nodes} 知識點 · ${paths} 路徑`;
        },
    };

    // ── Admin UI ──
    const AdminUI = {
        showToast(message, type = 'info') {
            let toast = document.querySelector('.slc-toast');
            if (!toast) {
                toast = document.createElement('div');
                toast.className = 'slc-toast';
                document.body.appendChild(toast);
            }
            toast.textContent = message;
            toast.className = `slc-toast --${type}`;
            // Trigger reflow
            toast.offsetHeight;
            toast.classList.add('--visible');
            setTimeout(() => toast.classList.remove('--visible'), 2500);
        },

        updateSubjectLabel() {
            const label = document.getElementById('adminSubjectLabel');
            if (label) {
                label.textContent = state.currentSubject
                    ? `${state.currentSubject.icon || '📚'} ${state.currentSubject.subject_name}`
                    : '— 未選科目 —';
            }
        },

        renderAdminContents(items) {
            const el = document.getElementById('slcContentsList');
            if (!el) return;
            if (!items || !items.length) {
                el.innerHTML = '<div style="padding:16px;color:var(--slc-text-secondary);text-align:center;">該科目暫無內容</div>';
                return;
            }
            const typeLabel = { document: '📄', video_local: '🎬', video_external: '🔗', article: '📝', image: '🖼️' };
            el.innerHTML = items.map(c => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${typeLabel[c.content_type] || '📄'} ${_escHtml(c.title)}</div>
                        <div class="slc-admin-list-item__meta">${c.grade_level || '通用'} · ${c.content_type} · 👁️${c.view_count || 0}</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger" style="margin-top:0;padding:4px 8px;font-size:11px;" onclick="slc.deleteContent(${c.id}, '${_escHtml(c.title).replace(/'/g, "\\'")}')">刪除</button>
                    </div>
                </div>
            `).join('');
        },

        renderAdminNodes(nodes) {
            const el = document.getElementById('slcNodesList');
            if (!el) return;
            if (!nodes || !nodes.length) {
                el.innerHTML = '<div style="padding:16px;color:var(--slc-text-secondary);text-align:center;">暫無知識節點</div>';
                return;
            }
            el.innerHTML = nodes.map(n => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${n.icon || '📌'} ${_escHtml(n.title)}</div>
                        <div class="slc-admin-list-item__meta">${_escHtml(n.description || '').substring(0, 50)}</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger" style="margin-top:0;padding:4px 8px;font-size:11px;" onclick="slc.deleteNode(${n.id})">刪除</button>
                    </div>
                </div>
            `).join('');

            // 更新邊的下拉選項
            AdminUI.populateEdgeDropdowns(nodes);
        },

        populateEdgeDropdowns(nodes) {
            const source = document.getElementById('slcEdgeSource');
            const target = document.getElementById('slcEdgeTarget');
            [source, target].forEach(sel => {
                if (!sel) return;
                const val = sel.value;
                sel.innerHTML = '<option value="">選擇知識點</option>';
                nodes.forEach(n => {
                    sel.innerHTML += `<option value="${n.id}">${_escHtml(n.title)}</option>`;
                });
                sel.value = val;
            });
        },

        renderAdminPaths(paths) {
            const el = document.getElementById('slcPathsList');
            if (!el) return;
            if (!paths || !paths.length) {
                el.innerHTML = '<div style="padding:16px;color:var(--slc-text-secondary);text-align:center;">暫無學習路徑</div>';
                return;
            }
            const diffLabel = { beginner: '入門', intermediate: '進階', advanced: '高級' };
            el.innerHTML = paths.map(p => `
                <div class="slc-admin-list-item">
                    <div class="slc-admin-list-item__info">
                        <div class="slc-admin-list-item__title">${p.icon || '🎯'} ${_escHtml(p.title)}</div>
                        <div class="slc-admin-list-item__meta">${diffLabel[p.difficulty] || p.difficulty} · ${p.estimated_hours || 1}h · ${(p.steps || []).length} 步</div>
                    </div>
                    <div class="slc-admin-list-item__actions">
                        <button class="slc-admin-btn --danger" style="margin-top:0;padding:4px 8px;font-size:11px;" onclick="slc.deletePath(${p.id})">刪除</button>
                    </div>
                </div>
            `).join('');
        },
    };

    // ── App 邏輯 ──
    const App = {
        async init() {
            console.log('🏫 學校學習中心初始化...');

            // 檢查登入
            if (!_getToken()) {
                window.location.href = '/login';
                return;
            }

            // 檢查角色 — 解碼 JWT
            App._detectRole();

            // 載入科目
            try {
                state.subjects = await API.getSubjects();
                UI.renderSubjects(state.subjects);

                // 嘗試從 URL 中讀取科目
                const urlParams = new URLSearchParams(window.location.search);
                const urlSubject = urlParams.get('subject');
                if (urlSubject && state.subjects.find(s => s.subject_code === urlSubject)) {
                    await App.selectSubject(urlSubject);
                } else if (state.subjects.length > 0) {
                    await App.selectSubject(state.subjects[0].subject_code);
                }
            } catch (e) {
                console.error('載入科目失敗:', e);
            }

            UI.renderGradeBar();

            // Admin 初始化
            if (state.isAdmin) {
                App._setupAdmin();
            }

            // Tab 切換
            document.querySelectorAll('.slc-tab-btn').forEach(btn => {
                btn.addEventListener('click', () => App.switchTab(btn.dataset.tab));
            });

            // 搜索
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') App.doSearch();
                });
            }

            // 電子書側邊欄開關
            const sidebarToggle = document.getElementById('slcSidebarToggle');
            if (sidebarToggle) sidebarToggle.addEventListener('click', App.toggleEbookSidebar);
            const sidebarClose = document.getElementById('slcSidebarClose');
            if (sidebarClose) sidebarClose.addEventListener('click', App.closeEbookSidebar);

            // AI FAB
            const fab = document.getElementById('aiFab');
            if (fab) fab.addEventListener('click', App.toggleAIWindow);

            // AI 發送
            const aiSendBtn = document.getElementById('aiSendBtn');
            if (aiSendBtn) aiSendBtn.addEventListener('click', App.sendAIMessage);

            const aiInput = document.getElementById('aiInput');
            if (aiInput) {
                aiInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        App.sendAIMessage();
                    }
                });
            }

            console.log('🏫 學校學習中心初始化完成');
        },

        async selectSubject(subjectCode) {
            state.currentSubject = state.subjects.find(s => s.subject_code === subjectCode) || null;
            UI.renderSubjects(state.subjects);

            // 更新管理面板科目標籤
            if (state.isAdmin) AdminUI.updateSubjectLabel();

            // 更新 URL
            const url = new URL(window.location);
            url.searchParams.set('subject', subjectCode);
            window.history.replaceState({}, '', url);

            // 刷新當前 Tab 數據
            await App.loadCurrentTab();

            // 如果管理面板打開，刷新管理面板數據
            if (state.adminPanelOpen) {
                App.switchAdminTab(state.adminTab);
            }

            // 更新統計
            try {
                const stats = await API.getStats(subjectCode);
                UI.updateHeaderStats(stats);
            } catch (e) { /* ignore */ }
        },

        async selectGrade(grade) {
            state.currentGrade = grade;
            UI.renderGradeBar();
            await App.loadCurrentTab();
        },

        async switchTab(tab) {
            state.currentTab = tab;
            UI.setActiveTab(tab);
            await App.loadCurrentTab();
        },

        async loadCurrentTab() {
            const subjectCode = state.currentSubject?.subject_code;
            const grade = state.currentGrade;

            switch (state.currentTab) {
                case 'resources':
                    UI.showResourceLoading();
                    try {
                        state.contents = await API.getContents(subjectCode, grade, state.contentTypeFilter);
                        UI.renderEbookDirectory(state.contents);
                        // 自動展開側邊欄
                        App.openEbookSidebar();
                    } catch (e) {
                        console.error('載入資源失敗:', e);
                        UI.renderEbookDirectory([]);
                    }
                    break;
                case 'map':
                    UI.showMapLoading();
                    try {
                        state.knowledgeMap = await API.getKnowledgeMap(subjectCode);
                        UI.renderKnowledgeMap(state.knowledgeMap);
                    } catch (e) {
                        console.error('載入知識圖譜失敗:', e);
                    }
                    break;
                case 'paths':
                    UI.showPathLoading();
                    try {
                        state.paths = await API.getPaths(subjectCode, grade);
                        UI.renderPaths(state.paths);
                    } catch (e) {
                        console.error('載入學習路徑失敗:', e);
                        UI.renderPaths([]);
                    }
                    break;
            }
        },

        async filterByType(type) {
            state.contentTypeFilter = type === state.contentTypeFilter ? null : type;
            // Update type filter UI
            document.querySelectorAll('.slc-type-chip').forEach(chip => {
                chip.classList.toggle('--active', chip.dataset.type === state.contentTypeFilter);
            });
            if (state.currentTab === 'resources') {
                await App.loadCurrentTab();
            }
        },

        async doSearch() {
            const input = document.getElementById('searchInput');
            if (!input || !input.value.trim()) return;

            const keyword = input.value.trim();
            UI.showResourceLoading();
            try {
                const result = await API.searchContents(keyword, state.currentSubject?.subject_code);
                UI.renderEbookDirectory(result);
            } catch (e) {
                console.error('搜索失敗:', e);
            }
        },

        async togglePathSteps(pathId) {
            const stepsEl = document.getElementById(`pathSteps-${pathId}`);
            const toggleBtn = document.getElementById(`toggleBtn-${pathId}`);
            if (!stepsEl) return;

            const isExpanded = stepsEl.classList.contains('--expanded');
            if (isExpanded) {
                stepsEl.classList.remove('--expanded');
                if (toggleBtn) toggleBtn.classList.remove('--expanded');
            } else {
                // 載入步驟詳情
                try {
                    const detail = await API.getPathDetail(pathId);
                    if (detail && detail.steps) {
                        UI.renderPathSteps(pathId, detail.steps);
                    }
                } catch (e) {
                    console.error('載入路徑步驟失敗:', e);
                }
                stepsEl.classList.add('--expanded');
                if (toggleBtn) toggleBtn.classList.add('--expanded');
            }
        },

        async openContent(contentId, contentType, startPage) {
            const welcome = document.getElementById('slcEbookWelcome');
            const viewer = document.getElementById('slcEbookViewer');
            const titleEl = document.getElementById('slcViewerTitle');
            const descEl = document.getElementById('slcViewerDesc');
            const bodyEl = document.getElementById('slcViewerBody');

            if (!viewer || !bodyEl) return;

            // 確保在教學資源 Tab
            if (state.currentTab !== 'resources') {
                await App.switchTab('resources');
            }

            // 統一先拿內容詳情
            let data;
            try {
                const r = await fetch(`/api/school-learning-center/contents/${contentId}`, { headers: API._headers() });
                const j = await r.json();
                data = j.data;
            } catch (e) {
                console.error('載入內容失敗:', e);
                return;
            }
            if (!data) return;

            // 記錄當前查看的內容（供 AI 助教使用）
            state.currentContentId = contentId;
            state.currentContentTitle = data.title || '';
            state.pdfGoToPage = null;  // 重置，PDF 渲染後會重新設置
            _updateAIContentContext();

            // 隱藏歡迎頁，顯示查看器
            if (welcome) welcome.style.display = 'none';
            viewer.style.display = 'flex';

            // 設置標題 / 描述
            if (titleEl) titleEl.textContent = data.title || '';
            if (descEl) descEl.textContent = data.description || '';

            // 清空舊內容
            bodyEl.innerHTML = '';

            // 高亮目錄中的活躍項
            const nav = document.getElementById('slcEbookDirectory');
            if (nav) {
                nav.querySelectorAll('.slc-ebook-item').forEach(i => {
                    i.classList.toggle('slc-ebook-item--active', i.getAttribute('data-id') == contentId);
                });
            }

            const _type = contentType || data.content_type || '';

            switch (_type) {
                case 'document': {
                    const fileUrl = _getFileUrl(data);
                    if (!fileUrl) {
                        bodyEl.innerHTML = '<p class="slc-ebook-error" style="padding:20px;">無法載入文件</p>';
                        break;
                    }
                    const isPdf = (data.mime_type || '').includes('pdf')
                        || (data.file_name || data.file_path || '').toLowerCase().endsWith('.pdf');

                    if (isPdf && window.pdfjsLib) {
                        // PDF.js — iPad/Safari 兼容
                        _renderPdfViewer(bodyEl, fileUrl, startPage || 1, data);
                    } else {
                        bodyEl.innerHTML = `
                            <iframe src="${_escHtml(fileUrl)}" style="width:100%;height:80vh;border:none;"></iframe>
                            <div style="text-align:center;margin-top:8px;">
                                <a href="${_escHtml(fileUrl)}" download="${_escHtml(data.title || 'download')}" style="color:var(--slc-primary);">下載文件</a>
                            </div>`;
                    }
                    break;
                }
                case 'video_external': {
                    const embedUrl = _parseVideoEmbed(data.external_url);
                    if (embedUrl) {
                        bodyEl.innerHTML = `<div class="slc-ebook-video-wrap">
                            <iframe class="slc-ebook-iframe" src="${_escHtml(embedUrl)}"
                                frameborder="0" allowfullscreen
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
                            </iframe>
                        </div>`;
                    } else {
                        bodyEl.innerHTML = `<p>外部視頻連結：<a href="${_escHtml(data.external_url || '')}" target="_blank" rel="noopener">${_escHtml(data.external_url || '無連結')}</a></p>`;
                    }
                    break;
                }
                case 'video_local': {
                    const fileUrl = _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<video class="slc-ebook-video" controls>
                            <source src="${_escHtml(fileUrl)}" type="${data.mime_type || 'video/mp4'}">
                            瀏覽器不支持視頻播放
                        </video>`;
                    } else {
                        bodyEl.innerHTML = '<p class="slc-ebook-error">無法載入視頻</p>';
                    }
                    break;
                }
                case 'article': {
                    const articleContent = data.article_content || data.description || '';
                    if (typeof marked !== 'undefined' && articleContent) {
                        const html = marked.parse(articleContent);
                        const clean = typeof DOMPurify !== 'undefined' ? DOMPurify.sanitize(html) : html;
                        bodyEl.innerHTML = `<div class="slc-ebook-article">${clean}</div>`;
                    } else {
                        bodyEl.innerHTML = `<div class="slc-ebook-article">${_escHtml(articleContent) || '<p>暫無內容</p>'}</div>`;
                    }
                    break;
                }
                case 'image': {
                    const fileUrl = data.image_url || _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<img class="slc-ebook-image" src="${_escHtml(fileUrl)}" alt="${_escHtml(data.title || '')}" />`;
                    } else {
                        bodyEl.innerHTML = '<p class="slc-ebook-error">無法載入圖片</p>';
                    }
                    break;
                }
                default: {
                    const fileUrl = _getFileUrl(data);
                    if (fileUrl) {
                        bodyEl.innerHTML = `<p>檔案：<a href="${_escHtml(fileUrl)}" target="_blank" rel="noopener">${_escHtml(data.title || '下載')}</a></p>`;
                    } else {
                        bodyEl.innerHTML = `<div style="padding:20px;">${_escHtml(data.description || '暫無描述')}</div>`;
                    }
                }
            }
        },

        // --- 電子書側邊欄 ---
        openEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.add('slc-ebook--sidebar-open');
        },

        closeEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.remove('slc-ebook--sidebar-open');
        },

        toggleEbookSidebar() {
            const container = document.getElementById('slcEbookContainer');
            if (container) container.classList.toggle('slc-ebook--sidebar-open');
        },

        // --- AI 聊天 ---
        toggleAIWindow() {
            const win = document.getElementById('aiWindow');
            if (!win) return;
            win.classList.toggle('--visible');
            if (win.classList.contains('--visible')) {
                const subjectName = state.currentSubject?.subject_name || '學習';
                if (!state.aiMessages.length) {
                    UI.addAIMessage('assistant', `你好！我是 ${subjectName} 科目的 AI 助教，有什麼可以幫你的嗎？`);
                }
                document.getElementById('aiInput')?.focus();
            }
        },

        async sendAIMessage() {
            if (state.aiStreaming) return;
            const input = document.getElementById('aiInput');
            if (!input || !input.value.trim()) return;

            const question = input.value.trim();
            input.value = '';
            state.aiStreaming = true;

            UI.addAIMessage('user', question);
            const assistantMsg = UI.addAIMessage('assistant', '⏳ 思考中...');

            try {
                const response = await API.aiAskStream(
                    question,
                    state.currentSubject?.subject_code,
                    state.currentContentId,  // 傳遞當前查看的內容 ID
                );

                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let buffer = '';
                let answerParts = [];
                let thinkingParts = [];

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (!line.startsWith('data: ')) continue;
                        try {
                            const event = JSON.parse(line.slice(6));
                            if (event.type === 'thinking') {
                                thinkingParts.push(event.content);
                            } else if (event.type === 'token') {
                                answerParts.push(event.content);
                                const display = answerParts.join('');
                                if (assistantMsg) {
                                    assistantMsg.querySelector('.slc-ai-msg__bubble').innerHTML = _renderMarkdown(display);
                                }
                            } else if (event.type === 'done') {
                                // 渲染頁碼引用按鈕
                                if (event.page_references && event.page_references.length > 0) {
                                    _renderPageReferences(assistantMsg, event.page_references);
                                }
                                // 渲染相關知識節點
                                if (event.related_nodes && event.related_nodes.length > 0) {
                                    _renderRelatedNodes(assistantMsg, event.related_nodes);
                                }
                            }
                        } catch (e) { /* skip */ }
                    }
                }

                // 如果沒有任何 answer，顯示提示
                if (!answerParts.length) {
                    if (assistantMsg) {
                        assistantMsg.querySelector('.slc-ai-msg__bubble').innerHTML = '抱歉，暫時無法回答此問題。';
                    }
                }
            } catch (e) {
                console.error('AI 回答錯誤:', e);
                if (assistantMsg) {
                    assistantMsg.querySelector('.slc-ai-msg__bubble').innerHTML = 'AI 助教暫時無法回答，請稍後再試。';
                }
            }

            state.aiStreaming = false;
            // Scroll
            const container = document.getElementById('aiMessages');
            if (container) container.scrollTop = container.scrollHeight;
        },

        toggleMobileSidebar() {
            const sidebar = document.querySelector('.slc-sidebar');
            if (sidebar) sidebar.classList.toggle('--mobile-open');
        },

        // ── Admin ──
        _detectRole() {
            const token = _getToken();
            if (!token) return;
            try {
                const parts = token.split('.');
                if (parts.length !== 3) return;
                const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
                state.userRole = payload.role || 'student';
                state.isAdmin = ['teacher', 'admin'].includes(state.userRole);
            } catch (e) {
                console.warn('Token decode failed:', e);
            }
        },

        _setupAdmin() {
            // 顯示管理按鈕
            const btn = document.getElementById('slcAdminToggle');
            if (btn) btn.style.display = 'flex';

            // 文件上傳區事件
            const dropZone = document.getElementById('slcFileDropZone');
            const fileInput = document.getElementById('slcFileInput');
            if (dropZone && fileInput) {
                dropZone.addEventListener('click', () => fileInput.click());
                dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('--dragover'); });
                dropZone.addEventListener('dragleave', () => dropZone.classList.remove('--dragover'));
                dropZone.addEventListener('drop', e => {
                    e.preventDefault();
                    dropZone.classList.remove('--dragover');
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                        state.uploadFile = e.dataTransfer.files[0];
                        const nameEl = document.getElementById('slcFileName');
                        if (nameEl) {
                            nameEl.textContent = `📎 ${state.uploadFile.name} (${(state.uploadFile.size / 1024).toFixed(1)} KB)`;
                            nameEl.style.display = 'block';
                        }
                    }
                });
                fileInput.addEventListener('change', () => {
                    if (fileInput.files && fileInput.files[0]) {
                        state.uploadFile = fileInput.files[0];
                        const nameEl = document.getElementById('slcFileName');
                        if (nameEl) {
                            nameEl.textContent = `📎 ${state.uploadFile.name} (${(state.uploadFile.size / 1024).toFixed(1)} KB)`;
                            nameEl.style.display = 'block';
                        }
                    }
                });
            }
        },

        toggleAdminPanel() {
            state.adminPanelOpen = !state.adminPanelOpen;
            const panel = document.getElementById('slcAdminPanel');
            const overlay = document.getElementById('slcAdminOverlay');
            if (panel) panel.classList.toggle('--visible', state.adminPanelOpen);
            if (overlay) overlay.classList.toggle('--visible', state.adminPanelOpen);
            if (state.adminPanelOpen) {
                AdminUI.updateSubjectLabel();
                // 加載當前 admin tab 數據
                App.switchAdminTab(state.adminTab);
            }
        },

        switchAdminTab(tab) {
            state.adminTab = tab;
            // Update tab buttons
            document.querySelectorAll('.slc-admin-tab').forEach(btn => {
                btn.classList.toggle('--active', btn.dataset.adminTab === tab);
            });
            // Update panels
            document.querySelectorAll('.slc-admin-tab-panel').forEach(panel => {
                panel.classList.toggle('--active', panel.id === `adminTab-${tab}`);
            });

            // Load data
            if (tab === 'contents') App._loadAdminContents();
            if (tab === 'nodes') App._loadAdminNodes();
            if (tab === 'paths') App._loadAdminPaths();
        },

        onContentTypeChange() {
            const typeSelect = document.getElementById('slcContentType');
            const dropZone = document.getElementById('slcFileDropZone');
            const externalSection = document.getElementById('slcExternalVideoSection');
            const articleSection = document.getElementById('slcArticleSection');
            const type = typeSelect ? typeSelect.value : 'document';

            if (dropZone) dropZone.style.display = type === 'video_external' || type === 'article' ? 'none' : '';
            if (externalSection) externalSection.style.display = type === 'video_external' ? 'block' : 'none';
            if (articleSection) articleSection.style.display = type === 'article' ? 'block' : 'none';
        },

        async submitContent() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) {
                AdminUI.showToast('請先選擇一個科目', 'error');
                return;
            }

            const title = document.getElementById('slcContentTitle')?.value.trim();
            const desc = document.getElementById('slcContentDesc')?.value.trim() || '';
            const contentType = document.getElementById('slcContentType')?.value || 'document';
            const grade = document.getElementById('slcContentGrade')?.value || '';

            if (!title) {
                AdminUI.showToast('請輸入標題', 'error');
                return;
            }

            try {
                if (contentType === 'video_external') {
                    const extUrl = document.getElementById('slcExternalUrl')?.value.trim();
                    const platform = document.getElementById('slcVideoPlatform')?.value || '';
                    if (!extUrl) {
                        AdminUI.showToast('請輸入視頻連結', 'error');
                        return;
                    }
                    const formData = new FormData();
                    formData.append('title', title);
                    formData.append('description', desc);
                    formData.append('content_type', 'video_external');
                    formData.append('external_url', extUrl);
                    formData.append('tags', '');
                    formData.append('subject_code', subjectCode);
                    if (grade) formData.append('grade_level', grade);
                    if (platform) formData.append('video_platform', platform);

                    const r = await API.adminUpload(formData);
                    if (r.success) {
                        AdminUI.showToast('視頻連結上傳成功', 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '上傳失敗', 'error');
                    }
                } else if (contentType === 'article') {
                    const articleContent = document.getElementById('slcArticleContent')?.value.trim() || '';
                    const body = {
                        title, description: desc, content_type: 'article',
                        subject_code: subjectCode, article_content: articleContent,
                    };
                    if (grade) body.grade_level = grade;

                    const r = await API.adminCreateContent(body);
                    if (r.success) {
                        AdminUI.showToast('文章創建成功', 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '創建失敗', 'error');
                    }
                } else {
                    // 文件上傳
                    if (!state.uploadFile) {
                        AdminUI.showToast('請選擇文件', 'error');
                        return;
                    }
                    const formData = new FormData();
                    formData.append('file', state.uploadFile);
                    formData.append('title', title);
                    formData.append('description', desc);
                    formData.append('content_type', contentType);
                    formData.append('tags', '');
                    formData.append('subject_code', subjectCode);
                    if (grade) formData.append('grade_level', grade);

                    const r = await API.adminUpload(formData);
                    if (r.success) {
                        AdminUI.showToast(`${state.uploadFile.name} 上傳成功`, 'success');
                        App._resetUploadForm();
                        App.loadCurrentTab();
                    } else {
                        AdminUI.showToast(r.message || '上傳失敗', 'error');
                    }
                }
            } catch (e) {
                console.error('上傳失敗:', e);
                AdminUI.showToast('上傳失敗', 'error');
            }
        },

        _resetUploadForm() {
            const fields = ['slcContentTitle', 'slcContentDesc', 'slcExternalUrl', 'slcArticleContent'];
            fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            state.uploadFile = null;
            const nameEl = document.getElementById('slcFileName');
            if (nameEl) { nameEl.style.display = 'none'; nameEl.textContent = ''; }
            const fileInput = document.getElementById('slcFileInput');
            if (fileInput) fileInput.value = '';
        },

        async _loadAdminContents() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const items = await API.getContents(subjectCode, null, null, 1, 200);
                AdminUI.renderAdminContents(items);
            } catch (e) {
                console.error('載入管理內容失敗:', e);
            }
        },

        async deleteContent(id, title) {
            if (!confirm(`確定要刪除「${title}」嗎？`)) return;
            try {
                const r = await API.adminDeleteContent(id);
                if (r.success) {
                    AdminUI.showToast('已刪除', 'success');
                    App._loadAdminContents();
                    App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        // ── Knowledge Nodes ──
        async _loadAdminNodes() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const mapData = await API.getKnowledgeMap(subjectCode);
                state.adminNodes = mapData.nodes || [];
                AdminUI.renderAdminNodes(state.adminNodes);
            } catch (e) {
                console.error('載入節點失敗:', e);
            }
        },

        async submitNode() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const title = document.getElementById('slcNodeTitle')?.value.trim();
            const desc = document.getElementById('slcNodeDesc')?.value.trim() || '';
            const grade = document.getElementById('slcNodeGrade')?.value || '';

            if (!title) { AdminUI.showToast('請輸入知識點名稱', 'error'); return; }

            try {
                const body = { title, description: desc, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminCreateNode(body);
                if (r.success) {
                    AdminUI.showToast('知識節點已創建', 'success');
                    document.getElementById('slcNodeTitle').value = '';
                    document.getElementById('slcNodeDesc').value = '';
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '創建失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('創建失敗', 'error');
            }
        },

        async submitEdge() {
            const sourceId = document.getElementById('slcEdgeSource')?.value;
            const targetId = document.getElementById('slcEdgeTarget')?.value;
            const relType = document.getElementById('slcEdgeType')?.value.trim() || 'related';

            if (!sourceId || !targetId) { AdminUI.showToast('請選擇來源和目標節點', 'error'); return; }

            try {
                const body = {
                    source_node_id: parseInt(sourceId),
                    target_node_id: parseInt(targetId),
                    relation_type: relType,
                    label: relType,
                };
                const sourceNode = state.adminNodes.find(n => n.id == sourceId);
                if (sourceNode && sourceNode.subject_code) body.subject_code = sourceNode.subject_code;

                const r = await API.adminCreateEdge(body);
                if (r.success) {
                    AdminUI.showToast('連接已建立', 'success');
                    document.getElementById('slcEdgeType').value = 'related';
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '建立連接失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('建立連接失敗', 'error');
            }
        },

        async deleteNode(id) {
            if (!confirm('確定要刪除此知識節點嗎？')) return;
            try {
                const r = await API.adminDeleteNode(id);
                if (r.success) {
                    AdminUI.showToast('節點已刪除', 'success');
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        async submitBatchNodes() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const jsonStr = document.getElementById('slcBatchNodeJson')?.value.trim();
            const grade = document.getElementById('slcBatchNodeGrade')?.value || '';
            const clearExisting = document.getElementById('slcBatchClear')?.checked || false;
            const resultEl = document.getElementById('slcBatchNodeResult');

            if (!jsonStr) { AdminUI.showToast('請輸入 JSON 數據', 'error'); return; }

            let payload;
            try { payload = JSON.parse(jsonStr); } catch (e) {
                AdminUI.showToast('JSON 格式無效', 'error');
                if (resultEl) { resultEl.style.display = 'block'; resultEl.style.background = '#fce4ec'; resultEl.textContent = `JSON 解析失敗: ${e.message}`; }
                return;
            }

            if (!payload.nodes || !Array.isArray(payload.nodes) || !payload.nodes.length) {
                AdminUI.showToast('JSON 中必須包含 nodes 陣列', 'error');
                return;
            }

            if (clearExisting && !confirm('⚠️ 確定清空該科目所有知識點嗎？')) return;

            payload.clear_existing = clearExisting;
            if (!payload.edges) payload.edges = [];
            payload.subject_code = subjectCode;
            if (grade) payload.grade_level = grade;

            try {
                const r = await API.adminBatchImportGraph(payload);
                if (r.success) {
                    const d = r.data || {};
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.style.background = '#e8f5e9';
                        resultEl.innerHTML = `<strong>✅ 導入完成</strong><br>建立 ${d.created_nodes || 0} 節點、${d.created_edges || 0} 連接`;
                    }
                    AdminUI.showToast('批量導入成功', 'success');
                    App._loadAdminNodes();
                    if (state.currentTab === 'map') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '導入失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('導入失敗', 'error');
            }
        },

        // ── Learning Paths ──
        async _loadAdminPaths() {
            const subjectCode = state.currentSubject?.subject_code;
            try {
                const paths = await API.getPaths(subjectCode, null);
                AdminUI.renderAdminPaths(paths);
            } catch (e) {
                console.error('載入路徑失敗:', e);
            }
        },

        async submitPath() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const title = document.getElementById('slcPathTitle')?.value.trim();
            const desc = document.getElementById('slcPathDesc')?.value.trim() || '';
            const difficulty = document.getElementById('slcPathDifficulty')?.value || 'beginner';
            const hours = parseFloat(document.getElementById('slcPathHours')?.value) || 1;
            const grade = document.getElementById('slcPathGrade')?.value || '';

            if (!title) { AdminUI.showToast('請輸入路徑標題', 'error'); return; }

            try {
                const body = { title, description: desc, difficulty, estimated_hours: hours, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminCreatePath(body);
                if (r.success) {
                    AdminUI.showToast('學習路徑已創建', 'success');
                    document.getElementById('slcPathTitle').value = '';
                    document.getElementById('slcPathDesc').value = '';
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '創建失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('創建失敗', 'error');
            }
        },

        async deletePath(id) {
            if (!confirm('確定要刪除此學習路徑嗎？')) return;
            try {
                const r = await API.adminDeletePath(id);
                if (r.success) {
                    AdminUI.showToast('路徑已刪除', 'success');
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '刪除失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('刪除失敗', 'error');
            }
        },

        async submitBatchPaths() {
            const subjectCode = state.currentSubject?.subject_code;
            if (!subjectCode) { AdminUI.showToast('請先選科目', 'error'); return; }

            const jsonStr = document.getElementById('slcBatchPathJson')?.value.trim();
            const grade = document.getElementById('slcBatchPathGrade')?.value || '';
            const resultEl = document.getElementById('slcBatchPathResult');

            if (!jsonStr) { AdminUI.showToast('請輸入 JSON 數據', 'error'); return; }

            let paths;
            try { paths = JSON.parse(jsonStr); } catch (e) {
                AdminUI.showToast('JSON 格式無效', 'error');
                if (resultEl) { resultEl.style.display = 'block'; resultEl.style.background = '#fce4ec'; resultEl.textContent = `JSON 解析失敗: ${e.message}`; }
                return;
            }

            if (!Array.isArray(paths) || !paths.length) {
                AdminUI.showToast('JSON 必須是路徑陣列', 'error');
                return;
            }

            try {
                const body = { paths, subject_code: subjectCode };
                if (grade) body.grade_level = grade;

                const r = await API.adminBatchImportPaths(body);
                if (r.success) {
                    const d = r.data || {};
                    if (resultEl) {
                        resultEl.style.display = 'block';
                        resultEl.style.background = '#e8f5e9';
                        resultEl.innerHTML = `<strong>✅ 導入完成</strong><br>建立 ${d.created_paths || d.created || 0} 條路徑`;
                    }
                    AdminUI.showToast('批量導入成功', 'success');
                    App._loadAdminPaths();
                    if (state.currentTab === 'paths') App.loadCurrentTab();
                } else {
                    AdminUI.showToast(r.message || '導入失敗', 'error');
                }
            } catch (e) {
                AdminUI.showToast('導入失敗', 'error');
            }
        },
    };

    // ── 工具函數 ──

    /** 從內容數據中獲取文件 URL */
    function _getFileUrl(content) {
        if (!content) return '';
        if (content.file_path) {
            return content.file_path.replace(/^uploads\//, '/uploads/');
        }
        return '';
    }

    /** 解析視頻外鏈為嵌入 URL */
    function _parseVideoEmbed(url) {
        if (!url) return '';
        // YouTube
        let m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/);
        if (m) return `https://www.youtube.com/embed/${m[1]}`;
        // Bilibili
        m = url.match(/bilibili\.com\/video\/(BV[\w]+)/);
        if (m) return `https://player.bilibili.com/player.html?bvid=${m[1]}&high_quality=1`;
        return url; // fallback: 直接用原始 URL
    }

    /** PDF.js 渲染器 — iPad/Safari 兼容 */
    async function _renderPdfViewer(container, fileUrl, startPage, content) {
        if (window.pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        }

        container.innerHTML = `
            <div class="slc-pdf-viewer">
                <div class="slc-pdf-toolbar">
                    <button class="slc-pdf-btn" data-action="prev" title="上一頁">◀</button>
                    <span class="slc-pdf-page-info">
                        <input class="slc-pdf-page-input" type="number" min="1" value="1" />
                        <span>/ <span class="slc-pdf-total">-</span></span>
                    </span>
                    <button class="slc-pdf-btn" data-action="next" title="下一頁">▶</button>
                    <span class="slc-pdf-separator"></span>
                    <button class="slc-pdf-btn" data-action="zoomout" title="縮小">−</button>
                    <span class="slc-pdf-zoom-label">100%</span>
                    <button class="slc-pdf-btn" data-action="zoomin" title="放大">+</button>
                    <span class="slc-pdf-separator"></span>
                    <a href="${_escHtml(fileUrl)}" class="slc-pdf-btn" download="${_escHtml((content && content.title) || 'download')}" title="下載">⬇</a>
                </div>
                <div class="slc-pdf-scroll-area">
                    <div class="slc-pdf-pages"></div>
                </div>
                <div class="slc-pdf-loading">載入 PDF 中...</div>
            </div>`;

        const viewer = container.querySelector('.slc-pdf-viewer');
        const pagesContainer = viewer.querySelector('.slc-pdf-pages');
        const scrollArea = viewer.querySelector('.slc-pdf-scroll-area');
        const loadingEl = viewer.querySelector('.slc-pdf-loading');
        const pageInput = viewer.querySelector('.slc-pdf-page-input');
        const totalEl = viewer.querySelector('.slc-pdf-total');
        const zoomLabel = viewer.querySelector('.slc-pdf-zoom-label');

        let pdfDoc = null;
        let scale = 1.5;
        let currentPage = startPage || 1;
        const renderedPages = new Map();

        try {
            pdfDoc = await pdfjsLib.getDocument(fileUrl).promise;
        } catch (err) {
            console.error('[PDF.js] Failed to load:', err);
            loadingEl.textContent = 'PDF 載入失敗';
            return;
        }

        const numPages = pdfDoc.numPages;
        totalEl.textContent = numPages;
        pageInput.max = numPages;
        pageInput.value = currentPage;
        loadingEl.style.display = 'none';

        for (let i = 1; i <= numPages; i++) {
            const pageDiv = document.createElement('div');
            pageDiv.className = 'slc-pdf-page';
            pageDiv.dataset.page = i;
            pagesContainer.appendChild(pageDiv);
        }

        async function renderPage(pageNum) {
            if (renderedPages.has(pageNum) || !pdfDoc) return;
            renderedPages.set(pageNum, true);
            try {
                const page = await pdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale });
                const pageDiv = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
                if (!pageDiv) return;
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.style.width = '100%';
                canvas.style.height = 'auto';
                pageDiv.style.minHeight = '';
                pageDiv.innerHTML = '';
                pageDiv.appendChild(canvas);
                const ctx = canvas.getContext('2d');
                await page.render({ canvasContext: ctx, viewport }).promise;
                renderedPages.set(pageNum, canvas);
            } catch (err) {
                console.error(`[PDF.js] Error rendering page ${pageNum}:`, err);
            }
        }

        function renderVisiblePages() {
            const scrollTop = scrollArea.scrollTop;
            const scrollBottom = scrollTop + scrollArea.clientHeight;
            const pageDivs = pagesContainer.querySelectorAll('.slc-pdf-page');
            pageDivs.forEach(div => {
                const top = div.offsetTop;
                const bottom = top + (div.offsetHeight || 200);
                const pageNum = parseInt(div.dataset.page);
                if (bottom >= scrollTop - 500 && top <= scrollBottom + 500) {
                    renderPage(pageNum);
                }
            });
            const centerY = scrollTop + scrollArea.clientHeight / 2;
            for (const div of pageDivs) {
                const top = div.offsetTop;
                const bottom = top + (div.offsetHeight || 200);
                if (centerY >= top && centerY <= bottom) {
                    const p = parseInt(div.dataset.page);
                    if (p !== currentPage) {
                        currentPage = p;
                        pageInput.value = p;
                    }
                    break;
                }
            }
        }

        async function goToPage(pageNum) {
            pageNum = Math.max(1, Math.min(numPages, pageNum));
            currentPage = pageNum;
            pageInput.value = pageNum;
            await renderPage(pageNum);
            const target = pagesContainer.querySelector(`[data-page="${pageNum}"]`);
            if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }

        // 暴露 goToPage 到 state，供 AI 助教頁碼跳轉使用
        state.pdfGoToPage = goToPage;

        async function rerender() {
            renderedPages.clear();
            pagesContainer.querySelectorAll('.slc-pdf-page').forEach(div => {
                div.innerHTML = '';
                div.style.minHeight = '200px';
            });
            zoomLabel.textContent = Math.round(scale / 1.5 * 100) + '%';
            await renderPage(currentPage);
            renderVisiblePages();
        }

        viewer.querySelector('.slc-pdf-toolbar').addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;
            const action = btn.dataset.action;
            if (action === 'prev') goToPage(currentPage - 1);
            else if (action === 'next') goToPage(currentPage + 1);
            else if (action === 'zoomin') { scale = Math.min(4, scale + 0.3); rerender(); }
            else if (action === 'zoomout') { scale = Math.max(0.5, scale - 0.3); rerender(); }
        });

        pageInput.addEventListener('change', () => {
            const p = parseInt(pageInput.value);
            if (p >= 1 && p <= numPages) goToPage(p);
        });
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const p = parseInt(pageInput.value);
                if (p >= 1 && p <= numPages) goToPage(p);
            }
        });

        let _scrollTimer = null;
        scrollArea.addEventListener('scroll', () => {
            if (_scrollTimer) clearTimeout(_scrollTimer);
            _scrollTimer = setTimeout(renderVisiblePages, 80);
        }, { passive: true });

        for (let i = 1; i <= Math.min(3, numPages); i++) {
            await renderPage(i);
        }
        if (startPage > 1) {
            setTimeout(() => goToPage(startPage), 100);
        }
    }

    /** 更新 AI 聊天窗口中的內容上下文指示器 */
    function _updateAIContentContext() {
        let indicator = document.getElementById('slcAiContentContext');
        if (!indicator) {
            // 動態創建指示器（插到 AI 輸入框上方）
            const inputArea = document.querySelector('.slc-ai-input-area');
            if (!inputArea) return;
            indicator = document.createElement('div');
            indicator.id = 'slcAiContentContext';
            indicator.className = 'slc-ai-content-context';
            inputArea.parentNode.insertBefore(indicator, inputArea);
        }
        if (state.currentContentId && state.currentContentTitle) {
            indicator.innerHTML = `
                <span class="slc-ai-content-context__label">📄 正在查看：</span>
                <span class="slc-ai-content-context__title">${_escHtml(state.currentContentTitle)}</span>
                <button class="slc-ai-content-context__clear" onclick="slc.clearContentContext()" title="取消關聯">✕</button>
            `;
            indicator.style.display = 'flex';
        } else {
            indicator.style.display = 'none';
        }
    }

    /** 渲染 AI 回覆中的頁碼引用按鈕 */
    function _renderPageReferences(msgElement, pageRefs) {
        if (!msgElement || !pageRefs || !pageRefs.length) return;
        const bubble = msgElement.querySelector('.slc-ai-msg__bubble');
        if (!bubble) return;

        // 去重頁碼
        const seen = new Set();
        const uniqueRefs = [];
        for (const ref of pageRefs) {
            const page = ref.page || ref.page_number;
            if (page && !seen.has(page)) {
                seen.add(page);
                uniqueRefs.push(ref);
            }
        }
        if (!uniqueRefs.length) return;

        const refsDiv = document.createElement('div');
        refsDiv.className = 'slc-ai-page-refs';
        refsDiv.innerHTML = `
            <div class="slc-ai-page-refs__label">📖 相關頁面：</div>
            <div class="slc-ai-page-refs__buttons">
                ${uniqueRefs.map(ref => {
                    const page = ref.page || ref.page_number;
                    return `<button class="slc-ai-page-ref-btn" onclick="slc.navigatePdfToPage(${page})" title="${_escHtml(ref.snippet || '')}">第 ${page} 頁</button>`;
                }).join('')}
            </div>
        `;
        bubble.appendChild(refsDiv);
    }

    /** 渲染 AI 回覆中的相關知識節點 */
    function _renderRelatedNodes(msgElement, nodes) {
        if (!msgElement || !nodes || !nodes.length) return;
        const bubble = msgElement.querySelector('.slc-ai-msg__bubble');
        if (!bubble) return;

        const nodesDiv = document.createElement('div');
        nodesDiv.className = 'slc-ai-related-nodes';
        nodesDiv.innerHTML = `
            <div class="slc-ai-related-nodes__label">🔗 相關知識點：</div>
            <div class="slc-ai-related-nodes__list">
                ${nodes.map(n => `<span class="slc-ai-node-tag" style="border-color:${n.color || '#006633'}">${n.icon || '📌'} ${_escHtml(n.title)}</span>`).join('')}
            </div>
        `;
        bubble.appendChild(nodesDiv);
    }

    /** 跳轉到 PDF 指定頁碼 */
    function _navigatePdfToPage(pageNum) {
        if (state.pdfGoToPage) {
            state.pdfGoToPage(pageNum);
            AdminUI.showToast(`已跳轉到第 ${pageNum} 頁`, 'info');
            return;
        }
        // Fallback: 嘗試找到 PDF 容器中的頁面元素（內嵌查看器）
        const container = document.getElementById('slcViewerBody');
        if (container) {
            const target = container.querySelector(`[data-page="${pageNum}"]`);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                AdminUI.showToast(`已跳轉到第 ${pageNum} 頁`, 'info');
                return;
            }
        }
        AdminUI.showToast('請先打開 PDF 文檔', 'info');
    }

    function _escHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            const d = new Date(dateStr);
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        } catch {
            return dateStr;
        }
    }

    function _renderMarkdown(text) {
        if (!text) return '';
        if (typeof marked !== 'undefined') {
            try {
                const html = marked.parse(text);
                if (typeof DOMPurify !== 'undefined') {
                    return DOMPurify.sanitize(html);
                }
                return html;
            } catch {
                return _escHtml(text);
            }
        }
        return _escHtml(text).replace(/\n/g, '<br>');
    }

    // ── 公開 API ──
    return {
        state,
        _init: () => App.init(),
        selectSubject: (code) => App.selectSubject(code),
        selectGrade: (grade) => App.selectGrade(grade),
        switchTab: (tab) => App.switchTab(tab),
        filterByType: (type) => App.filterByType(type),
        doSearch: () => App.doSearch(),
        togglePathSteps: (id) => App.togglePathSteps(id),
        openContent: (id, type, page) => App.openContent(id, type, page),
        toggleAIWindow: () => App.toggleAIWindow(),
        sendAIMessage: () => App.sendAIMessage(),
        closeModal: () => UI.closeEbookViewer(),
        toggleMobileSidebar: () => App.toggleMobileSidebar(),
        toggleEbookSidebar: () => App.toggleEbookSidebar(),
        // AI 內容感知
        navigatePdfToPage: (page) => _navigatePdfToPage(page),
        clearContentContext: () => {
            state.currentContentId = null;
            state.currentContentTitle = null;
            state.pdfGoToPage = null;
            _updateAIContentContext();
        },
        // Admin
        toggleAdminPanel: () => App.toggleAdminPanel(),
        switchAdminTab: (tab) => App.switchAdminTab(tab),
        onContentTypeChange: () => App.onContentTypeChange(),
        submitContent: () => App.submitContent(),
        deleteContent: (id, title) => App.deleteContent(id, title),
        submitNode: () => App.submitNode(),
        submitEdge: () => App.submitEdge(),
        deleteNode: (id) => App.deleteNode(id),
        submitBatchNodes: () => App.submitBatchNodes(),
        submitPath: () => App.submitPath(),
        deletePath: (id) => App.deletePath(id),
        submitBatchPaths: () => App.submitBatchPaths(),
    };
})();
