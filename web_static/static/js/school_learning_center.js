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
    };

    const GRADES = ['中一', '中二', '中三', '中四', '中五', '中六'];

    // ── API ──
    const API = {
        _headers() {
            const token = localStorage.getItem('token') || '';
            return {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            };
        },

        async getSubjects() {
            const r = await fetch('/api/learning-center/subjects', { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getContents(subjectCode, gradeLevel, contentType, page = 1, pageSize = 50) {
            const params = new URLSearchParams({ page, page_size: pageSize });
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            if (contentType) params.set('content_type', contentType);
            const r = await fetch(`/api/learning-center/contents?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getKnowledgeMap(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/learning-center/knowledge-map${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || { nodes: [], edges: [] };
        },

        async getPaths(subjectCode, gradeLevel) {
            const params = new URLSearchParams();
            if (subjectCode) params.set('subject_code', subjectCode);
            if (gradeLevel) params.set('grade_level', gradeLevel);
            const qs = params.toString();
            const r = await fetch(`/api/learning-center/paths${qs ? '?' + qs : ''}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        async getPathDetail(pathId) {
            const r = await fetch(`/api/learning-center/paths/${pathId}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || null;
        },

        async getStats(subjectCode) {
            const params = subjectCode ? `?subject_code=${subjectCode}` : '';
            const r = await fetch(`/api/learning-center/stats${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || {};
        },

        async searchContents(keyword, subjectCode) {
            const params = new URLSearchParams({ keyword });
            if (subjectCode) params.set('subject_code', subjectCode);
            const r = await fetch(`/api/learning-center/search?${params}`, { headers: this._headers() });
            const j = await r.json();
            return j.data || [];
        },

        aiAskStream(question, subjectCode, contentId) {
            const body = { question };
            if (subjectCode) body.subject_code = subjectCode;
            if (contentId) body.content_id = contentId;
            return fetch('/api/learning-center/ai-ask-stream', {
                method: 'POST',
                headers: this._headers(),
                body: JSON.stringify(body),
            });
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

        // --- 教學資源 ---
        renderResources(items) {
            const grid = document.getElementById('resourceGrid');
            if (!grid) return;
            if (!items.length) {
                grid.innerHTML = '<div class="slc-empty-state"><div class="slc-empty-state__icon">📄</div><div class="slc-empty-state__text">該科目暫無教學資源</div></div>';
                return;
            }
            grid.innerHTML = items.map(item => {
                const typeLabel = { document: '📄 文檔', video_local: '🎬 視頻', video_external: '🎬 視頻', article: '📝 文章', image: '🖼️ 圖片' };
                const typeClass = item.content_type || 'document';
                const grade = item.grade_level ? `<span class="slc-resource-card__grade">${item.grade_level}</span>` : '';
                return `
                <div class="slc-resource-card" onclick="slc.openContent(${item.id}, '${item.content_type}')">
                    <div class="slc-resource-card__body">
                        <span class="slc-resource-card__type-badge --${typeClass}">${typeLabel[item.content_type] || item.content_type}</span>
                        <div class="slc-resource-card__title">${_escHtml(item.title)}</div>
                        <div class="slc-resource-card__desc">${_escHtml(item.description || '')}</div>
                    </div>
                    <div class="slc-resource-card__meta">
                        ${grade}
                        <span>👁️ ${item.view_count || 0}</span>
                        <span style="margin-left:auto">${_formatDate(item.created_at)}</span>
                    </div>
                </div>`;
            }).join('');
        },

        showResourceLoading() {
            const grid = document.getElementById('resourceGrid');
            if (grid) grid.innerHTML = '<div class="slc-loading"><div class="slc-loading__spinner"></div><div>加載中...</div></div>';
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
                ? contents.map(c => `
                    <div class="slc-node-resource-item" onclick="slc.openContent(${c.content_id}, '${c.content_type || 'document'}')">
                        📎 ${_escHtml(c.content_title || '資源')}
                        ${c.anchor?.type === 'page' ? `<span style="color:var(--slc-primary);font-size:12px">第${c.anchor.value}頁</span>` : ''}
                    </div>
                `).join('')
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
                    ? `<a class="slc-step-item__link" onclick="event.stopPropagation(); slc.openContent(${s.content_id}, '${s.content_type || 'document'}')">
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

        // --- 內容查看器 ---
        openContentModal(title, html) {
            const overlay = document.getElementById('contentModal');
            if (!overlay) return;
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalBody').innerHTML = html;
            overlay.classList.add('--visible');
        },

        closeContentModal() {
            const overlay = document.getElementById('contentModal');
            if (overlay) overlay.classList.remove('--visible');
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

    // ── App 邏輯 ──
    const App = {
        async init() {
            console.log('🏫 學校學習中心初始化...');

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

            // 更新 URL
            const url = new URL(window.location);
            url.searchParams.set('subject', subjectCode);
            window.history.replaceState({}, '', url);

            // 刷新當前 Tab 數據
            await App.loadCurrentTab();

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
                        UI.renderResources(state.contents);
                    } catch (e) {
                        console.error('載入資源失敗:', e);
                        UI.renderResources([]);
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
                UI.renderResources(result);
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

        openContent(contentId, contentType) {
            // 根據內容類型決定如何打開
            if (contentType === 'document') {
                // PDF 用 iframe 打開
                UI.openContentModal('文檔查看', `<iframe src="/api/learning-center/contents/${contentId}/file" style="width:100%;height:70vh;border:none;"></iframe>`);
                // 實際上需要根據文件路徑構建 URL
                // 這裡先使用簡化版
                fetch(`/api/learning-center/contents/${contentId}`, {
                    headers: API._headers(),
                }).then(r => r.json()).then(j => {
                    const data = j.data;
                    if (data && data.file_path) {
                        const filePath = data.file_path.replace(/^uploads\//, '/uploads/');
                        UI.openContentModal(
                            data.title || '文檔',
                            `<iframe src="${filePath}" style="width:100%;height:70vh;border:none;"></iframe>`
                        );
                    }
                }).catch(() => {});
            } else if (contentType === 'video_external') {
                fetch(`/api/learning-center/contents/${contentId}`, {
                    headers: API._headers(),
                }).then(r => r.json()).then(j => {
                    const data = j.data;
                    if (data && data.external_url) {
                        UI.openContentModal(
                            data.title || '視頻',
                            `<iframe src="${data.embed_url || data.external_url}" style="width:100%;height:70vh;border:none;" allowfullscreen></iframe>`
                        );
                    }
                }).catch(() => {});
            } else if (contentType === 'article') {
                fetch(`/api/learning-center/contents/${contentId}`, {
                    headers: API._headers(),
                }).then(r => r.json()).then(j => {
                    const data = j.data;
                    if (data) {
                        const html = data.article_content
                            ? _renderMarkdown(data.article_content)
                            : `<p>${_escHtml(data.description || '暫無內容')}</p>`;
                        UI.openContentModal(data.title || '文章', `<div style="max-width:800px;margin:0 auto;line-height:1.8;font-size:15px;">${html}</div>`);
                    }
                }).catch(() => {});
            } else if (contentType === 'video_local') {
                fetch(`/api/learning-center/contents/${contentId}`, {
                    headers: API._headers(),
                }).then(r => r.json()).then(j => {
                    const data = j.data;
                    if (data && data.file_path) {
                        const filePath = data.file_path.replace(/^uploads\//, '/uploads/');
                        UI.openContentModal(
                            data.title || '視頻',
                            `<video controls style="width:100%;max-height:70vh;"><source src="${filePath}" type="${data.mime_type || 'video/mp4'}">瀏覽器不支持視頻播放</video>`
                        );
                    }
                }).catch(() => {});
            } else {
                // Fallback: 打開內容詳情
                fetch(`/api/learning-center/contents/${contentId}`, {
                    headers: API._headers(),
                }).then(r => r.json()).then(j => {
                    const data = j.data;
                    if (data) {
                        UI.openContentModal(data.title || '資源', `<div style="padding:20px;">${_escHtml(data.description || '暫無描述')}</div>`);
                    }
                }).catch(() => {});
            }
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
                                // 完成
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
    };

    // ── 工具函數 ──
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
        openContent: (id, type) => App.openContent(id, type),
        toggleAIWindow: () => App.toggleAIWindow(),
        sendAIMessage: () => App.sendAIMessage(),
        closeModal: () => UI.closeContentModal(),
        toggleMobileSidebar: () => App.toggleMobileSidebar(),
    };
})();
