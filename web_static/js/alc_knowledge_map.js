/**
 * AI Learning Center - Knowledge Map Module
 * D3.js force-directed knowledge graph rendering
 */
(function() {
    'use strict';

    // Get shared state & utilities from main module
    const $ = window.alc;

    // ==================== KNOWLEDGE MAP (D3.js) ====================

    async function loadKnowledgeMap() {
        try {
            const response = await $.api(`${$.API_BASE}/knowledge-map`);
            if (response.success) {
                $.state.nodes = response.data.nodes || [];
                $.state.edges = response.data.edges || [];
                renderKnowledgeMap();
            }
        } catch (error) {
            console.error('Failed to load knowledge map:', error);
        }
    }

    // ---- Hierarchy helpers ----

    /** Node tier configuration by depth */
    const TIER_CONFIG = {
        0: { radius: 50, border: 4, fontSize: 15, iconSize: 28, shadow: 12, label: 'root' },
        1: { radius: 34, border: 3, fontSize: 12, iconSize: 20, shadow: 6,  label: 'L1' },
        2: { radius: 22, border: 2, fontSize: 10, iconSize: 14, shadow: 3,  label: 'L2' },
        3: { radius: 16, border: 1.5, fontSize: 9, iconSize: 12, shadow: 2, label: 'L3' },
    };

    /** Force simulation layout configuration */
    const LAYOUT_CONFIG = {
        defaultCollapseDepth: 2,              // 默认展示 root + L1 + L2
        animationDuration: 600,               // 展开/收起动画时长 ms
        lodLabelThreshold: 0.85,              // zoom < this → hide L2+ labels
        lodCrossLinkThreshold: 1.5,           // zoom > this → show cross-links
        // Force parameters (auto-tuned by node count in buildForceSimulation)
        collisionPadding: 16,                 // forceCollide: radius + padding
        collisionIterations: 6,               // collision iterations
        chargeStrength: -380,                 // forceManyBody base strength
        radialStrengths: [0, 0.35, 0.25, 0.18],  // per-cluster radial constraint per depth
        radialRadii: [0, 180, 320, 440],      // per-cluster ring radii per depth
        linkDistance: 110,                    // forceLink base distance
        linkStrength: 0.3,                    // forceLink strength
        velocityDecay: 0.45,                  // higher = faster settle (0-1)
        alphaDecay: 0.03,                     // how fast simulation cools
        clusterOrbitRadius: 70,               // child orbit radius around parent
        clusterStrength: 0.08,                // forceX/Y pull toward parent (tighter clusters)
        clusterMinDistance: 400,              // minimum distance between root nodes
    };

    /** Edge color palette by relation_type */
    const EDGE_COLORS = {
        '包含': '#999',
        '前置': '#006633',
        '關聯': '#0066cc',
        '关联': '#0066cc',
        '影響': '#e67e22',
        '影响': '#e67e22',
        '備選': '#8e44ad',
        '备选': '#8e44ad',
        '延伸': '#0066cc',
    };
    const EDGE_COLOR_DEFAULT = '#aaa';

    /**
     * Detect hierarchy via BFS from zero-in-degree root nodes.
     * Attaches `_depth`, `_tierCfg`, `_children` to each node in-place.
     * Returns { childrenMap, adjacencyMap, hierarchyEdges, crossEdges }.
     */
    function computeHierarchy(nodes, edges) {
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const inDegree = new Map(nodes.map(n => [n.id, 0]));
        const childrenMap = new Map(nodes.map(n => [n.id, []]));
        const adjacencyMap = new Map(nodes.map(n => [n.id, new Set()]));

        // Separate hierarchy (包含) edges from cross-link edges
        const hierarchyEdges = [];
        const crossEdges = [];

        edges.forEach(e => {
            const sId = e.source_node_id ?? (typeof e.source === 'object' ? e.source.id : e.source);
            const tId = e.target_node_id ?? (typeof e.target === 'object' ? e.target.id : e.target);
            if (!nodeMap.has(sId) || !nodeMap.has(tId)) return;

            adjacencyMap.get(sId).add(tId);
            adjacencyMap.get(tId).add(sId);

            const relType = e.relation_type || e.relationship_type || e.label || '';
            if (relType === '包含') {
                inDegree.set(tId, (inDegree.get(tId) || 0) + 1);
                childrenMap.get(sId).push(tId);
                hierarchyEdges.push(e);
            } else {
                crossEdges.push(e);
            }
        });

        // Find roots = nodes with 0 in-degree within hierarchy edges
        const roots = nodes.filter(n => (inDegree.get(n.id) || 0) === 0);

        // BFS to assign depth
        nodes.forEach(n => { n._depth = Infinity; });
        const queue = [];
        roots.forEach(r => { r._depth = 0; r._rootId = r.id; queue.push(r); });

        while (queue.length > 0) {
            const current = queue.shift();
            const kids = childrenMap.get(current.id) || [];
            kids.forEach(kidId => {
                const kid = nodeMap.get(kidId);
                if (kid && kid._depth > current._depth + 1) {
                    kid._depth = current._depth + 1;
                    kid._rootId = current._rootId;
                    queue.push(kid);
                }
            });
        }

        // Assign tier config: depth 0 → root, 1 → L1, 2 → L2, 3+ → L3
        const maxTier = Math.max(...Object.keys(TIER_CONFIG).map(Number));
        nodes.forEach(n => {
            if (n._depth === Infinity) { n._depth = 2; n._rootId = n.id; } // orphans treated as L2
            const tierKey = Math.min(n._depth, maxTier);
            n._tierCfg = TIER_CONFIG[tierKey];
            n._children = childrenMap.get(n.id) || [];
            n._collapsed = false;
            n._visible = true;
        });

        return { childrenMap, adjacencyMap, hierarchyEdges, crossEdges };
    }

    /**
     * Collect all descendant IDs of a node via BFS over childrenMap.
     */
    function getDescendants(nodeId, childrenMap) {
        const result = new Set();
        const stack = [...(childrenMap.get(nodeId) || [])];
        while (stack.length > 0) {
            const id = stack.pop();
            if (result.has(id)) continue;
            result.add(id);
            (childrenMap.get(id) || []).forEach(c => stack.push(c));
        }
        return result;
    }

    /**
     * Truncate text with ellipsis; handles CJK and Latin.
     */
    function truncateLabel(text, maxLen) {
        if (!text) return '';
        return text.length > maxLen ? text.substring(0, maxLen) + '...' : text;
    }

    /**
     * Build and return a D3 force simulation configured for the knowledge graph.
     *
     * Forces:
     *  - forceLink:      hierarchy edges hold structure
     *  - forceManyBody:   repulsion prevents overlap
     *  - forceCollide:    hard collision boundary (radius + padding)
     *  - forceRadial:     soft depth-ring constraint (keeps layers separated)
     *  - forceCenter:     keeps graph centered
     *  - clusterForce:    custom force pushing children toward parent orbit
     *
     * @param {Array} visibleNodes - nodes with _visible === true
     * @param {Array} visibleHierEdges - hierarchy edges where both ends visible
     * @param {Map} nodeMap - id → node
     * @param {Map} parentMap - childId → parentId
     * @returns {d3.forceSimulation}
     */
    function buildForceSimulation(visibleNodes, visibleHierEdges, nodeMap, parentMap) {
        const N = visibleNodes.length || 1;

        // Auto-tune parameters by node count
        const chargeStrength = Math.max(-500, Math.min(-180, LAYOUT_CONFIG.chargeStrength * (60 / N)));
        const linkDist = LAYOUT_CONFIG.linkDistance + Math.max(0, (N - 40) * 0.8);

        // Build root lookup for per-cluster radial force
        const rootNodesMap = new Map();
        visibleNodes.forEach(n => { if (n._depth === 0) rootNodesMap.set(n.id, n); });

        const simulation = d3.forceSimulation(visibleNodes)
            .velocityDecay(LAYOUT_CONFIG.velocityDecay)
            .alphaDecay(LAYOUT_CONFIG.alphaDecay)
            // ── Link force (hierarchy edges) ──
            .force('link', d3.forceLink(visibleHierEdges)
                .id(d => d.id)
                .distance(d => {
                    const s = typeof d.source === 'object' ? d.source : nodeMap.get(d.source);
                    const t = typeof d.target === 'object' ? d.target : nodeMap.get(d.target);
                    const sR = s ? s._tierCfg.radius : 30;
                    const tR = t ? t._tierCfg.radius : 30;
                    return linkDist + sR + tR;
                })
                .strength(LAYOUT_CONFIG.linkStrength)
            )
            // ── Charge force (repulsion) ──
            .force('charge', d3.forceManyBody()
                .strength(chargeStrength)
                .distanceMax(500)
            )
            // ── Collision force (hard boundary) ──
            .force('collide', d3.forceCollide()
                .radius(d => d._tierCfg.radius + LAYOUT_CONFIG.collisionPadding)
                .iterations(LAYOUT_CONFIG.collisionIterations)
                .strength(0.9)
            );
            // NOTE: forceCenter and forceRadial removed — replaced by custom per-cluster forces below

        // ── Per-cluster radial force: each node orbits its OWN root's live position ──
        simulation.force('clusterRadial', () => {
            const alpha = simulation.alpha();
            visibleNodes.forEach(n => {
                if (n._depth === 0) return; // roots are free
                const root = rootNodesMap.get(n._rootId);
                if (!root) return;

                const cx = root.x || root._clusterCx || 0;
                const cy = root.y || root._clusterCy || 0;
                const depthIdx = Math.min(n._depth, LAYOUT_CONFIG.radialRadii.length - 1);
                const targetR = LAYOUT_CONFIG.radialRadii[depthIdx];
                const str = LAYOUT_CONFIG.radialStrengths[depthIdx] || 0.15;

                const dx = (n.x || 0) - cx;
                const dy = (n.y || 0) - cy;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const delta = (dist - targetR) / dist;

                n.vx -= dx * delta * str * alpha;
                n.vy -= dy * delta * str * alpha;
            });
        });

        // ── Cluster pull: children toward parent ──
        simulation.force('cluster', () => {
            const alpha = simulation.alpha();
            const str = LAYOUT_CONFIG.clusterStrength * alpha;
            visibleNodes.forEach(n => {
                if (n._depth === 0) return;
                const pId = parentMap.get(n.id);
                if (!pId) return;
                const parent = nodeMap.get(pId);
                if (!parent || !parent._visible) return;

                const dx = (parent.x || 0) - (n.x || 0);
                const dy = (parent.y || 0) - (n.y || 0);
                n.vx += dx * str;
                n.vy += dy * str;
            });
        });

        // ── Root repulsion: keep clusters apart ──
        simulation.force('rootRepel', () => {
            const alpha = simulation.alpha();
            const rootList = visibleNodes.filter(n => n._depth === 0);
            const minDist = LAYOUT_CONFIG.clusterMinDistance;

            for (let i = 0; i < rootList.length; i++) {
                for (let j = i + 1; j < rootList.length; j++) {
                    const a = rootList[i], b = rootList[j];
                    let dx = (b.x || 0) - (a.x || 0);
                    let dy = (b.y || 0) - (a.y || 0);
                    let dist = Math.sqrt(dx * dx + dy * dy) || 1;

                    if (dist < minDist) {
                        const f = (minDist - dist) / dist * 0.05 * alpha;
                        a.vx -= dx * f; a.vy -= dy * f;
                        b.vx += dx * f; b.vy += dy * f;
                    }
                }
            }
        });

        // ── Weak gravity: prevent clusters from drifting off-screen ──
        simulation.force('gravity', () => {
            const alpha = simulation.alpha();
            const str = 0.01 * alpha;
            visibleNodes.forEach(n => {
                if (n._depth === 0) {
                    n.vx -= (n.x || 0) * str;
                    n.vy -= (n.y || 0) * str;
                }
            });
        });

        return simulation;
    }

    /**
     * Find ancestor path from a node up to a root node via parent mapping.
     * Returns array of node IDs from root down to (but not including) the target.
     */
    function getAncestorPath(nodeId, parentMap) {
        const path = [];
        let current = parentMap.get(nodeId);
        while (current) {
            path.unshift(current);
            current = parentMap.get(current);
        }
        return path;
    }

    // ---- Sub-functions for renderKnowledgeMap ----

    /**
     * Render SVG defs (arrow markers + glow filter).
     * @param {d3.Selection} svg - Root SVG selection
     */
    function renderSvgDefs(svg) {
        const defs = svg.append('defs');

        const markerColors = { hierarchy: '#ccc', prerequisite: '#006633', relation: '#0066cc', fallback: '#aaa' };
        Object.entries(markerColors).forEach(([key, color]) => {
            defs.append('marker')
                .attr('id', `arrow-${key}`)
                .attr('markerWidth', 8).attr('markerHeight', 8)
                .attr('refX', 6).attr('refY', 3)
                .attr('orient', 'auto')
                .append('polygon')
                .attr('points', '0 0, 8 3, 0 6')
                .attr('fill', color);
        });

        const glowFilter = defs.append('filter')
            .attr('id', 'rootGlow')
            .attr('x', '-50%').attr('y', '-50%')
            .attr('width', '200%').attr('height', '200%');
        glowFilter.append('feGaussianBlur')
            .attr('stdDeviation', 6).attr('result', 'blur');
        glowFilter.append('feMerge')
            .selectAll('feMergeNode')
            .data(['blur', 'SourceGraphic'])
            .enter().append('feMergeNode')
            .attr('in', d => d);
    }

    /**
     * Render edge SVG elements (hierarchy lines + cross-links).
     * @param {object} ctx - Render context with hierLinkGroup, crossLinkGroup, etc.
     * @returns {{ hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels }}
     */
    function renderEdges(ctx) {
        const { hierLinkGroup, crossLinkGroup, d3HierarchyEdges, d3CrossEdges, edgeBothVisible } = ctx;

        const hierLinks = hierLinkGroup.selectAll('line.kg-hier-edge')
            .data(d3HierarchyEdges)
            .enter().append('line')
            .attr('class', 'kg-hier-edge')
            .attr('stroke', '#ccc')
            .attr('stroke-width', 1.2)
            .attr('stroke-opacity', d => edgeBothVisible(d) ? 0.5 : 0);

        const hierEdgeLabels = hierLinkGroup.selectAll('text.kg-hier-label')
            .data(d3HierarchyEdges)
            .enter().append('text')
            .attr('class', 'kg-hier-label')
            .attr('text-anchor', 'middle')
            .attr('font-size', '9px')
            .attr('fill', '#999')
            .attr('pointer-events', 'none')
            .attr('opacity', d => edgeBothVisible(d) ? 0.7 : 0)
            .text(d => d.label || '');

        const crossLinks = crossLinkGroup.selectAll('line.kg-cross-edge')
            .data(d3CrossEdges)
            .enter().append('line')
            .attr('class', 'kg-cross-edge')
            .attr('stroke', d => {
                const rel = d.relation_type || d.relationship_type || '';
                return EDGE_COLORS[rel] || EDGE_COLOR_DEFAULT;
            })
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '6 3')
            .attr('stroke-opacity', 0);

        const crossEdgeLabels = crossLinkGroup.selectAll('text.kg-cross-label')
            .data(d3CrossEdges)
            .enter().append('text')
            .attr('class', 'kg-cross-label')
            .attr('text-anchor', 'middle')
            .attr('font-size', '10px')
            .attr('fill', '#666')
            .attr('opacity', 0)
            .text(d => d.label || '');

        return { hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels };
    }

    /**
     * Render node groups with circles, icons, labels, and badges.
     * @param {d3.Selection} nodeGroupEl - Parent <g> for nodes
     * @param {object} ctx - Render context
     * @returns {{ nodeGroups, updateDescendantBadges }}
     */
    function renderNodes(nodeGroupEl, ctx) {
        const { childrenMap, toggleCollapse, handleNodeHover } = ctx;

        const nodeGroups = nodeGroupEl.selectAll('g.kg-node')
            .data($.state.nodes)
            .enter().append('g')
            .attr('class', d => `kg-node kg-depth-${Math.min(d._depth, 3)}`)
            .attr('cursor', 'grab')
            .attr('opacity', d => d._visible ? 1 : 0)
            .attr('pointer-events', d => d._visible ? 'all' : 'none')
            .on('click', (event, d) => {
                event.stopPropagation();
                showNodeDetail(d);
            })
            .on('dblclick', (event, d) => {
                event.stopPropagation();
                toggleCollapse(d);
            })
            .on('mouseenter', (event, d) => {
                handleNodeHover(d, true);
                $._tooltipTimer = setTimeout(() => showNodeTooltip(d, event), 300);
            })
            .on('mouseleave', () => {
                handleNodeHover(null, false);
                hideNodeTooltip();
            });

        // Glow ring for root nodes
        nodeGroups.filter(d => d._depth === 0)
            .append('circle')
            .attr('class', 'kg-glow-ring')
            .attr('r', d => d._tierCfg.radius + 8)
            .attr('fill', 'none')
            .attr('stroke', d => d.color || '#006633')
            .attr('stroke-width', 3)
            .attr('stroke-opacity', 0.4)
            .attr('filter', 'url(#rootGlow)');

        // Main circle
        nodeGroups.append('circle')
            .attr('class', 'kg-node-circle')
            .attr('r', d => d._tierCfg.radius)
            .attr('fill', d => d.color || '#4CAF50')
            .attr('stroke', '#fff')
            .attr('stroke-width', d => d._tierCfg.border)
            .style('filter', d => `drop-shadow(0 2px ${d._tierCfg.shadow}px rgba(0,0,0,0.25))`);

        // Icon
        nodeGroups.append('text')
            .attr('class', 'kg-node-icon')
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .attr('dy', d => d._depth === 0 ? '-0.25em' : '-0.15em')
            .attr('font-size', d => d._tierCfg.iconSize + 'px')
            .attr('pointer-events', 'none')
            .text(d => d.icon || '\uD83D\uDCCC');

        // In-circle label (root + L1 only)
        nodeGroups.filter(d => d._depth <= 1)
            .append('text')
            .attr('class', 'kg-node-label')
            .attr('text-anchor', 'middle')
            .attr('dy', d => d._depth === 0 ? '1.6em' : '1.5em')
            .attr('font-size', d => d._tierCfg.fontSize + 'px')
            .attr('font-weight', '600')
            .attr('fill', '#fff')
            .attr('pointer-events', 'none')
            .text(d => {
                const maxLen = d._depth === 0 ? 12 : 8;
                return truncateLabel(d.title, maxLen);
            });

        // Below-node title
        nodeGroups.append('text')
            .attr('class', 'kg-node-title')
            .attr('text-anchor', 'middle')
            .attr('dy', d => (d._tierCfg.radius + 16) + 'px')
            .attr('font-size', d => (d._depth === 0 ? 13 : 11) + 'px')
            .attr('font-weight', '500')
            .attr('fill', '#333')
            .attr('pointer-events', 'none')
            .attr('opacity', d => d._depth <= 1 ? 1 : 0)
            .text(d => d.title);

        // Descendant count badge
        function updateDescendantBadges() {
            nodeGroups.selectAll('.kg-descendant-badge').remove();
            const collapsedWithKids = nodeGroups.filter(d =>
                d._children.length > 0 && d._collapsed && d._visible
            );
            const badge = collapsedWithKids.append('g').attr('class', 'kg-descendant-badge');
            badge.append('circle')
                .attr('cx', d => d._tierCfg.radius * 0.7)
                .attr('cy', d => -(d._tierCfg.radius * 0.7))
                .attr('r', 11)
                .attr('fill', 'var(--brand, #006633)')
                .attr('stroke', '#fff').attr('stroke-width', 1.5);
            badge.append('text')
                .attr('x', d => d._tierCfg.radius * 0.7)
                .attr('y', d => -(d._tierCfg.radius * 0.7))
                .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
                .attr('font-size', '9px').attr('font-weight', '700')
                .attr('fill', '#fff').attr('pointer-events', 'none')
                .text(d => '+' + getDescendants(d.id, childrenMap).size);
        }

        // Content count badge
        const badgeGroups = nodeGroups.filter(d => d.contents && d.contents.length > 0);
        badgeGroups.append('circle')
            .attr('class', 'kg-badge-bg')
            .attr('cx', d => d._depth === 0 ? d._tierCfg.radius * 0.65 : d._tierCfg.radius * 0.55)
            .attr('cy', d => d._depth === 0 ? -d._tierCfg.radius * 0.65 : -d._tierCfg.radius * 0.55)
            .attr('r', 8).attr('fill', '#e67e22').attr('stroke', '#fff').attr('stroke-width', 1.5);
        badgeGroups.append('text')
            .attr('class', 'kg-badge-text')
            .attr('x', d => d._depth === 0 ? d._tierCfg.radius * 0.65 : d._tierCfg.radius * 0.55)
            .attr('y', d => d._depth === 0 ? -d._tierCfg.radius * 0.65 : -d._tierCfg.radius * 0.55)
            .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
            .attr('font-size', '8px').attr('font-weight', '700')
            .attr('fill', '#fff').attr('pointer-events', 'none')
            .text(d => d.contents.length);

        updateDescendantBadges();

        return { nodeGroups, updateDescendantBadges };
    }

    /**
     * Apply level-of-detail visibility based on zoom scale.
     * @param {number} scale - Current zoom scale
     * @param {object} ctx - Render context with D3 selections
     */
    function applyLOD(scale, ctx) {
        const { nodeGroups, hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels, edgeBothVisible } = ctx;
        const lblThreshold = LAYOUT_CONFIG.lodLabelThreshold;
        const clThreshold = LAYOUT_CONFIG.lodCrossLinkThreshold;

        nodeGroups.attr('opacity', d => {
            if (!d._visible) return 0;
            if (scale < 0.4 && d._depth > 0) return 0.1;
            return 1;
        });

        hierLinks.attr('stroke-opacity', d => {
            if (!edgeBothVisible(d)) return 0;
            return scale < 0.4 ? 0.1 : 0.5;
        });

        hierEdgeLabels.attr('opacity', d => {
            if (!edgeBothVisible(d)) return 0;
            return scale >= 0.7 ? 0.7 : 0;
        });

        crossLinks.attr('stroke-opacity', d => {
            if (scale < clThreshold) return 0;
            return edgeBothVisible(d) ? 0.6 : 0;
        });
        crossEdgeLabels.attr('opacity', d => {
            if (scale < clThreshold) return 0;
            return edgeBothVisible(d) ? 0.8 : 0;
        });

        nodeGroups.selectAll('.kg-node-title')
            .attr('opacity', d => {
                if (!d._visible) return 0;
                if (d._depth <= 1) return 1;
                return scale >= lblThreshold ? 0.85 : 0;
            });

        nodeGroups.selectAll('.kg-node-label')
            .attr('opacity', d => {
                if (!d._visible) return 0;
                if (d._depth === 0) return 1;
                return scale >= 0.6 ? 1 : 0;
            });
    }

    /**
     * Setup zoom behavior with LOD updates.
     * @param {d3.Selection} svg - Root SVG selection
     * @param {d3.Selection} g - Root transform group
     * @param {object} ctx - Render context
     * @returns {{ zoom, currentScale }} mutable zoom state
     */
    function setupZoomBehavior(svg, g, ctx) {
        const { numRoots, cx, cy } = ctx;
        const zoomState = { currentScale: 1 };

        const zoom = d3.zoom()
            .scaleExtent([0.2, 5])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
                $.state.lastZoomTransform = event.transform;
                const newScale = event.transform.k;
                if (Math.abs(newScale - zoomState.currentScale) > 0.05) {
                    zoomState.currentScale = newScale;
                    applyLOD(newScale, ctx);
                }
            });

        svg.call(zoom);

        const initialScale = numRoots > 1 ? 0.45 : 0.65;
        const initialTransform = d3.zoomIdentity.translate(cx, cy).scale(initialScale);
        svg.call(zoom.transform, initialTransform);

        return { zoom, zoomState };
    }

    /**
     * Setup hover interaction: highlight neighbors, dim others, show cross-links.
     * @param {object} ctx - Render context with D3 selections and adjacencyMap
     * @returns {Function} handleNodeHover(hoveredNode, isEntering)
     */
    function setupNodeHoverInteraction(ctx) {
        const {
            nodeGroups, hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels,
            edgeBothVisible, adjacencyMap, zoomState,
        } = ctx;

        function edgeConnectsNode(d, nodeId) {
            const sId = typeof d.source === 'object' ? d.source.id : d.source;
            const tId = typeof d.target === 'object' ? d.target.id : d.target;
            return sId === nodeId || tId === nodeId;
        }

        return function handleNodeHover(hoveredNode, isEntering) {
            if (!isEntering || !hoveredNode) {
                nodeGroups.transition().duration(200)
                    .attr('opacity', d => d._visible ? 1 : 0);
                hierLinks.transition().duration(200)
                    .attr('stroke-opacity', d => edgeBothVisible(d) ? 0.5 : 0)
                    .attr('stroke-width', 1.2);
                hierEdgeLabels.transition().duration(200)
                    .attr('opacity', d => edgeBothVisible(d) ? 0.7 : 0);
                crossLinks.transition().duration(200).attr('stroke-opacity', 0);
                crossEdgeLabels.transition().duration(200).attr('opacity', 0);
                applyLOD(zoomState.currentScale, ctx);
                return;
            }

            const neighbors = adjacencyMap.get(hoveredNode.id) || new Set();

            nodeGroups.transition().duration(200)
                .attr('opacity', d => {
                    if (!d._visible) return 0;
                    if (d.id === hoveredNode.id || neighbors.has(d.id)) return 1;
                    return 0.15;
                });

            nodeGroups.selectAll('.kg-node-title')
                .transition().duration(200)
                .attr('opacity', d => {
                    if (d.id === hoveredNode.id || neighbors.has(d.id)) return 1;
                    if (d._depth <= 1) return 0.15;
                    return 0;
                });

            hierLinks.transition().duration(200)
                .attr('stroke-opacity', d => {
                    if (!edgeBothVisible(d)) return 0;
                    return edgeConnectsNode(d, hoveredNode.id) ? 0.9 : 0.08;
                })
                .attr('stroke-width', d => edgeConnectsNode(d, hoveredNode.id) ? 2.5 : 1.2);
            hierEdgeLabels.transition().duration(200)
                .attr('opacity', d => {
                    if (!edgeBothVisible(d)) return 0;
                    return edgeConnectsNode(d, hoveredNode.id) ? 1 : 0.15;
                })
                .attr('font-weight', d => edgeConnectsNode(d, hoveredNode.id) ? '600' : '400');

            crossLinks.transition().duration(200)
                .attr('stroke-opacity', d => edgeConnectsNode(d, hoveredNode.id) ? 0.7 : 0);
            crossEdgeLabels.transition().duration(200)
                .attr('opacity', d => edgeConnectsNode(d, hoveredNode.id) ? 0.9 : 0);
        };
    }

    /**
     * Setup expand/collapse and overview/explore mode toggle.
     * @param {object} ctx - Render context
     * @returns {{ toggleCollapse, rebuildSimulation }}
     */
    function setupCollapseAndExplore(ctx) {
        const {
            nodeGroups, hierLinks, hierEdgeLabels, nodeMap, parentMap,
            d3HierarchyEdges, childrenMap, edgeBothVisible,
            getVisibleNodes, getVisibleHierEdges, updateDescendantBadges,
            tickHandler, zoomState,
        } = ctx;
        let simulation = ctx.simulation;

        function rebuildSimulation() {
            if (simulation) simulation.stop();
            d3HierarchyEdges.forEach(e => {
                if (typeof e.source === 'object') e.source = e.source.id;
                if (typeof e.target === 'object') e.target = e.target.id;
            });
            const vn = getVisibleNodes();
            const ve = getVisibleHierEdges();
            simulation = buildForceSimulation(vn, ve, nodeMap, parentMap);
            ctx.simulation = simulation;  // update shared reference
            simulation.on('tick', tickHandler);
            nodeGroups
                .attr('opacity', d => d._visible ? 1 : 0)
                .attr('pointer-events', d => d._visible ? 'all' : 'none');
            hierLinks.attr('stroke-opacity', d => edgeBothVisible(d) ? 0.5 : 0);
            hierEdgeLabels.attr('opacity', d => edgeBothVisible(d) ? 0.7 : 0);
            updateDescendantBadges();
            applyLOD(zoomState.currentScale, ctx);
        }

        function toggleCollapse(node) {
            if (!node._children || node._children.length === 0) return;
            node._collapsed = !node._collapsed;
            const descendants = getDescendants(node.id, childrenMap);

            if (node._collapsed) {
                descendants.forEach(id => {
                    const n = $.state.nodes.find(nd => nd.id === id);
                    if (n) { n._visible = false; n.fx = null; n.fy = null; }
                });
            } else {
                const revealQueue = [...(childrenMap.get(node.id) || [])];
                while (revealQueue.length > 0) {
                    const id = revealQueue.shift();
                    const n = $.state.nodes.find(nd => nd.id === id);
                    if (n) {
                        n._visible = true;
                        if (n.x == null || Math.abs(n.x) < 1) {
                            n.x = (node.x || 0) + (Math.random() - 0.5) * 80;
                            n.y = (node.y || 0) + (Math.random() - 0.5) * 80;
                        }
                        if (!n._collapsed) {
                            (childrenMap.get(id) || []).forEach(c => revealQueue.push(c));
                        }
                    }
                }
            }
            rebuildSimulation();
        }

        // Overview / Explore mode
        let _exploreMode = false;
        function setExploreMode(explore) {
            _exploreMode = explore;
            if (explore) {
                $.state.nodes.forEach(n => { n._collapsed = false; n._visible = true; });
            } else {
                $.state.nodes.forEach(n => {
                    if (n._depth > 0 && n._children.length > 0) {
                        n._collapsed = (n._depth >= LAYOUT_CONFIG.defaultCollapseDepth);
                    }
                    n._visible = (n._depth <= LAYOUT_CONFIG.defaultCollapseDepth);
                    if (!n._visible) { n.fx = null; n.fy = null; }
                });
            }
            rebuildSimulation();
            const toggleBtn = $.getElement('mapModeToggle');
            if (toggleBtn) {
                toggleBtn.classList.toggle('active', explore);
                toggleBtn.title = explore ? '切换概览模式' : '切换探索模式';
            }
        }

        const modeToggleBtn = $.getElement('mapModeToggle');
        if (modeToggleBtn) {
            modeToggleBtn.addEventListener('click', () => setExploreMode(!_exploreMode));
        }

        return { toggleCollapse, rebuildSimulation };
    }

    // ---- Main render function (orchestrator) ----

    function renderKnowledgeMap() {
        const svgElement = $.getElement('knowledgeMapSvg');
        if (!svgElement || !window.d3) {
            console.warn('D3.js not loaded or SVG element not found');
            return;
        }

        // Hide loading, show empty state if no data
        const loadingEl = $.getElement('mapLoadingState');
        const emptyEl = $.getElement('mapEmptyState');
        if (loadingEl) loadingEl.style.display = 'none';

        if ($.state.nodes.length === 0) {
            if (emptyEl) emptyEl.style.display = 'block';
            return;
        }
        if (emptyEl) emptyEl.style.display = 'none';

        d3.select(svgElement).selectAll('*').remove();

        // ── A. Hierarchy detection ──
        const { childrenMap, adjacencyMap, hierarchyEdges, crossEdges } =
            computeHierarchy($.state.nodes, $.state.edges);

        const parentMap = new Map();
        hierarchyEdges.forEach(e => {
            const sId = e.source_node_id ?? (typeof e.source === 'object' ? e.source.id : e.source);
            const tId = e.target_node_id ?? (typeof e.target === 'object' ? e.target.id : e.target);
            parentMap.set(tId, sId);
        });

        const nodeMap = new Map($.state.nodes.map(n => [n.id, n]));
        const toD3Edge = (e, isHierarchy) => ({
            ...e,
            source: e.source_node_id,
            target: e.target_node_id,
            label: e.relationship_type || e.label || '',
            _isHierarchy: isHierarchy,
        });
        const d3HierarchyEdges = hierarchyEdges.map(e => toD3Edge(e, true));
        const d3CrossEdges = crossEdges.map(e => toD3Edge(e, false));

        // ── B. Multi-center layout ──
        const roots = $.state.nodes.filter(n => n._depth === 0);
        const numRoots = roots.length;
        const clusterSpread = 200 + numRoots * 80;

        roots.forEach((root, i) => {
            if (numRoots === 1) {
                root._clusterCx = 0;
                root._clusterCy = 0;
            } else {
                const angle = (2 * Math.PI * i) / numRoots - Math.PI / 2;
                root._clusterCx = Math.cos(angle) * clusterSpread;
                root._clusterCy = Math.sin(angle) * clusterSpread;
            }
        });

        const rootNodeMap = new Map(roots.map(r => [r.id, r]));

        $.state.nodes.forEach(n => {
            if (n._depth > 0 && n._children.length > 0) {
                n._collapsed = (n._depth >= LAYOUT_CONFIG.defaultCollapseDepth);
            }
            n._visible = (n._depth <= LAYOUT_CONFIG.defaultCollapseDepth);

            const rootNode = rootNodeMap.get(n._rootId);
            const rcx = rootNode ? rootNode._clusterCx : 0;
            const rcy = rootNode ? rootNode._clusterCy : 0;

            if (n._depth === 0) {
                n.x = rcx;
                n.y = rcy;
            } else {
                const depthR = LAYOUT_CONFIG.radialRadii[Math.min(n._depth, 3)] || 200;
                const a = Math.random() * 2 * Math.PI;
                n.x = rcx + Math.cos(a) * depthR * (0.3 + Math.random() * 0.7);
                n.y = rcy + Math.sin(a) * depthR * (0.3 + Math.random() * 0.7);
            }
        });

        // ── C. Visibility helpers ──
        function getVisibleNodes() { return $.state.nodes.filter(n => n._visible); }
        function getVisibleHierEdges() {
            return d3HierarchyEdges.filter(e => {
                const sId = typeof e.source === 'object' ? e.source.id : e.source;
                const tId = typeof e.target === 'object' ? e.target.id : e.target;
                const s = nodeMap.get(sId), t = nodeMap.get(tId);
                return s && s._visible && t && t._visible;
            });
        }

        // ── D. SVG setup ──
        const width = svgElement.clientWidth || 800;
        const height = svgElement.clientHeight || 600;
        const cx = width / 2;
        const cy = height / 2;

        const svg = d3.select(svgElement)
            .attr('width', width)
            .attr('height', height);

        renderSvgDefs(svg);

        const g = svg.append('g').attr('class', 'kg-root-group');

        // Ring guides
        const ringGuideGroup = g.append('g').attr('class', 'kg-ring-guides');
        roots.forEach(root => {
            LAYOUT_CONFIG.radialRadii.forEach((r, i) => {
                if (i === 0 || r === 0) return;
                ringGuideGroup.append('circle')
                    .attr('cx', root._clusterCx).attr('cy', root._clusterCy)
                    .attr('r', r)
                    .attr('class', 'kg-ring-guide')
                    .attr('fill', 'none').attr('stroke', '#eee')
                    .attr('stroke-width', 0.5).attr('stroke-dasharray', '4 4')
                    .attr('pointer-events', 'none');
            });
        });

        const crossLinkGroup = g.append('g').attr('class', 'kg-cross-links');
        const hierLinkGroup  = g.append('g').attr('class', 'kg-hier-links');
        const nodeGroupEl    = g.append('g').attr('class', 'kg-nodes');

        // ── Edge helpers ──
        function edgeBothVisible(d) {
            const sId = typeof d.source === 'object' ? d.source.id : d.source;
            const tId = typeof d.target === 'object' ? d.target.id : d.target;
            const s = nodeMap.get(sId), t = nodeMap.get(tId);
            return s && s._visible && t && t._visible;
        }
        function edgeSourceNode(d) {
            if (typeof d.source === 'object') return d.source;
            return nodeMap.get(d.source);
        }
        function edgeTargetNode(d) {
            if (typeof d.target === 'object') return d.target;
            return nodeMap.get(d.target);
        }

        // ── E. Render edges ──
        const { hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels } = renderEdges({
            hierLinkGroup, crossLinkGroup, d3HierarchyEdges, d3CrossEdges, edgeBothVisible,
        });

        // ── F. Collapse/Expand + Hover (create before nodes, needed by event handlers) ──
        // Build shared context object used by sub-functions
        const ctx = {
            nodeGroups: null, // set after renderNodes
            hierLinks, hierEdgeLabels, crossLinks, crossEdgeLabels,
            edgeBothVisible, nodeMap, parentMap, adjacencyMap,
            d3HierarchyEdges, childrenMap,
            getVisibleNodes, getVisibleHierEdges,
            updateDescendantBadges: null, // set after renderNodes
            tickHandler: null, // set after simulation
            simulation: null,
            zoomState: null, // set after zoom setup
            numRoots, cx, cy,
        };

        // Pre-create collapse/hover handlers (they use ctx which gets populated below)
        const handleNodeHover = setupNodeHoverInteraction(ctx);

        // Placeholder toggleCollapse — will be replaced after setupCollapseAndExplore
        let collapseApi = { toggleCollapse: () => {}, rebuildSimulation: () => {} };

        // ── G. Render nodes ──
        const { nodeGroups, updateDescendantBadges } = renderNodes(nodeGroupEl, {
            childrenMap,
            toggleCollapse: (node) => collapseApi.toggleCollapse(node),
            handleNodeHover,
        });
        ctx.nodeGroups = nodeGroups;
        ctx.updateDescendantBadges = updateDescendantBadges;

        // ── H. Force Simulation ──
        let simulation = buildForceSimulation(getVisibleNodes(), getVisibleHierEdges(), nodeMap, parentMap);
        ctx.simulation = simulation;

        function tickHandler() {
            nodeGroups.attr('transform', d => `translate(${d.x || 0},${d.y || 0})`);

            hierLinks
                .attr('x1', d => { const s = edgeSourceNode(d); return s ? (s.x || 0) : 0; })
                .attr('y1', d => { const s = edgeSourceNode(d); return s ? (s.y || 0) : 0; })
                .attr('x2', d => { const t = edgeTargetNode(d); return t ? (t.x || 0) : 0; })
                .attr('y2', d => { const t = edgeTargetNode(d); return t ? (t.y || 0) : 0; });

            hierEdgeLabels
                .attr('x', d => { const s = edgeSourceNode(d), t = edgeTargetNode(d); return s && t ? ((s.x || 0) + (t.x || 0)) / 2 : 0; })
                .attr('y', d => { const s = edgeSourceNode(d), t = edgeTargetNode(d); return s && t ? ((s.y || 0) + (t.y || 0)) / 2 - 4 : 0; });

            crossLinks
                .attr('x1', d => { const s = edgeSourceNode(d); return s ? (s.x || 0) : 0; })
                .attr('y1', d => { const s = edgeSourceNode(d); return s ? (s.y || 0) : 0; })
                .attr('x2', d => { const t = edgeTargetNode(d); return t ? (t.x || 0) : 0; })
                .attr('y2', d => { const t = edgeTargetNode(d); return t ? (t.y || 0) : 0; });

            crossEdgeLabels
                .attr('x', d => { const s = edgeSourceNode(d), t = edgeTargetNode(d); return s && t ? ((s.x || 0) + (t.x || 0)) / 2 : 0; })
                .attr('y', d => { const s = edgeSourceNode(d), t = edgeTargetNode(d); return s && t ? ((s.y || 0) + (t.y || 0)) / 2 - 6 : 0; });
        }
        ctx.tickHandler = tickHandler;
        simulation.on('tick', tickHandler);

        // ── I. Drag behavior ──
        const drag = d3.drag()
            .on('start', (event, d) => {
                if (!event.active) ctx.simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (event, d) => {
                d.fx = event.x; d.fy = event.y;
            })
            .on('end', (event, d) => {
                if (!event.active) ctx.simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            });
        nodeGroups.call(drag);

        // ── J. Zoom with LOD ──
        const { zoom, zoomState } = setupZoomBehavior(svg, g, ctx);
        ctx.zoomState = zoomState;

        // ── K. Collapse/Expand + Explore mode ──
        collapseApi = setupCollapseAndExplore(ctx);

        // ── L. Legend + Search + Tooltip ──
        renderMapLegend();
        initMapSearch(childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, collapseApi.rebuildSimulation);

        const tooltipEl = $.getElement('kgTooltip');
        if (tooltipEl) {
            tooltipEl.addEventListener('mouseenter', keepTooltipOpen);
            tooltipEl.addEventListener('mouseleave', hideNodeTooltip);
        }

        setupKnowledgeMapControls(svg, zoom);
    }

    /**
     * Render the map legend in the #mapLegend container.
     */
    function renderMapLegend() {
        const container = $.getElement('mapLegend');
        if (!container) return;

        container.innerHTML = `
            <div class="alc-map-legend-title">图例</div>
            <div class="alc-map-legend-section">
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:16px;height:16px;background:#6200EA;"></span>
                    <span>根节点</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:11px;height:11px;background:#7C4DFF;"></span>
                    <span>一级节点</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-dot" style="width:7px;height:7px;background:#B388FF;"></span>
                    <span>二级节点</span>
                </div>
            </div>
            <div class="alc-map-legend-section">
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#ccc;"></span>
                    <span>包含</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#006633;border-style:dashed;"></span>
                    <span>前置</span>
                </div>
                <div class="alc-map-legend-item">
                    <span class="alc-map-legend-line" style="background:#0066cc;border-style:dashed;"></span>
                    <span>关联</span>
                </div>
            </div>
            <div class="alc-map-legend-hint">双击展开/收起 · 默认展示一级结构</div>
        `;
    }

    // ── Tooltip ──

    $._tooltipTimer = null;

    function showNodeTooltip(node, event) {
        clearTimeout($._tooltipTimer);
        const tooltip = $.getElement('kgTooltip');
        if (!tooltip) return;

        const contents = node.contents || [];
        const neighbors = $.state.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id
        );

        const contentCount = contents.length;
        const neighborCount = neighbors.length;
        const desc = (node.description || '').substring(0, 80);

        // Build quick-jump button if content exists
        const quickJumpHtml = contentCount > 0
            ? `<button class="kg-tooltip-btn"
                 onclick="window.lcLearningCenter.navigateToContent('${contents[0].content_id}', ${contents[0].anchor ? "'" + $.escapeHtml(JSON.stringify(contents[0].anchor)) + "'" : 'null'})">
                 进入教程
               </button>`
            : '';

        tooltip.innerHTML = `
            <div class="kg-tooltip-title">${node.icon || '\uD83D\uDCCC'} ${$.escapeHtml(node.title)}</div>
            ${desc ? `<div class="kg-tooltip-desc">${$.escapeHtml(desc)}${node.description && node.description.length > 80 ? '...' : ''}</div>` : ''}
            <div class="kg-tooltip-meta">
                ${contentCount > 0 ? `<span>\uD83D\uDCC4 ${contentCount} 份教程</span>` : ''}
                <span>\u2197 ${neighborCount} 个相关节点</span>
            </div>
            <div class="kg-tooltip-actions">
                ${quickJumpHtml}
                <button class="kg-tooltip-btn kg-tooltip-btn--secondary"
                    onclick="window.lcLearningCenter.showNodeDetail(window.lcLearningCenter.getNode('${node.id}'))">
                    查看详情
                </button>
            </div>
        `;

        // Position tooltip near the node
        const container = tooltip.closest('.alc-map-container');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const mouseX = event.clientX - rect.left;
        const mouseY = event.clientY - rect.top;

        // Auto-position: prefer right side, fall back to left
        const tooltipWidth = 240;
        const tooltipHeight = tooltip.offsetHeight || 160;
        let left = mouseX + 16;
        let top = mouseY - 10;

        if (left + tooltipWidth > rect.width) left = mouseX - tooltipWidth - 16;
        if (top + tooltipHeight > rect.height) top = rect.height - tooltipHeight - 8;
        if (top < 8) top = 8;

        tooltip.style.left = left + 'px';
        tooltip.style.top = top + 'px';
        tooltip.style.opacity = '1';
        tooltip.style.pointerEvents = 'auto';
    }

    function hideNodeTooltip() {
        $._tooltipTimer = setTimeout(() => {
            const tooltip = $.getElement('kgTooltip');
            if (tooltip) {
                tooltip.style.opacity = '0';
                tooltip.style.pointerEvents = 'none';
            }
        }, 200);
    }

    function keepTooltipOpen() {
        clearTimeout($._tooltipTimer);
    }

    // ── Node Search ──

    /**
     * Search nodes and auto-expand collapsed ancestors if needed.
     * Accepts render context for layout updates.
     */
    function searchNodes(keyword, ctx) {
        const allNodeGroups = d3.selectAll('.kg-node');

        if (!keyword || !keyword.trim()) {
            // Reset: restore all nodes to default
            allNodeGroups.transition().duration(300)
                .attr('opacity', d => d._visible ? 1 : 0);
            d3.selectAll('.kg-search-ring').remove();
            return;
        }

        const term = keyword.trim().toLowerCase();
        const matches = $.state.nodes.filter(n =>
            (n.title && n.title.toLowerCase().includes(term)) ||
            (n.description && n.description.toLowerCase().includes(term))
        );

        if (matches.length === 0) {
            $.showToast('未找到匹配的节点', 'warning');
            return;
        }

        // Auto-expand collapsed ancestors so matches become visible
        if (ctx && ctx.childrenMap && ctx.nodeMap) {
            let needsRelayout = false;
            matches.forEach(m => {
                if (!m._visible) {
                    // Walk up parent chain and expand
                    const ancestors = getAncestorPath(m.id, ctx.parentMap || new Map());
                    ancestors.forEach(aId => {
                        const ancestor = ctx.nodeMap.get(aId);
                        if (ancestor && ancestor._collapsed) {
                            ancestor._collapsed = false;
                            needsRelayout = true;
                            // Reveal direct children
                            const revealQueue = [...(ctx.childrenMap.get(aId) || [])];
                            while (revealQueue.length > 0) {
                                const id = revealQueue.shift();
                                const n = $.state.nodes.find(nd => nd.id === id);
                                if (n) {
                                    n._visible = true;
                                    if (!n._collapsed) {
                                        (ctx.childrenMap.get(id) || []).forEach(c => revealQueue.push(c));
                                    }
                                }
                            }
                        }
                    });
                    m._visible = true;
                }
            });

            if (needsRelayout && ctx.rebuildSimulationFn) {
                // Force simulation will handle positions via tick; just rebuild
                ctx.rebuildSimulationFn();
            }
        }

        const matchIds = new Set(matches.map(n => n.id));

        // Dim non-matches, highlight matches
        const nodeGroupsNow = d3.selectAll('.kg-node');
        nodeGroupsNow.transition().duration(300)
            .attr('opacity', d => matchIds.has(d.id) ? 1 : 0.12);

        // Add pulsing ring to matches
        d3.selectAll('.kg-search-ring').remove();
        nodeGroupsNow.filter(d => matchIds.has(d.id))
            .append('circle')
            .attr('class', 'kg-search-ring')
            .attr('r', d => d._tierCfg.radius + 10)
            .attr('fill', 'none')
            .attr('stroke', 'var(--brand, #006633)')
            .attr('stroke-width', 3)
            .attr('stroke-opacity', 0.8);

        // Auto-pan to first match
        const first = matches[0];
        if (first && first.x != null && first.y != null && ctx && ctx.zoom && ctx.svg) {
            const svgElement = $.getElement('knowledgeMapSvg');
            if (svgElement) {
                const width = svgElement.clientWidth || 800;
                const height = svgElement.clientHeight || 600;
                ctx.svg.transition().duration(750).call(
                    ctx.zoom.transform,
                    d3.zoomIdentity
                        .translate(width / 2, height / 2)
                        .scale(1.2)
                        .translate(-first.x, -first.y)
                );
            }
        }

        $.showToast(`找到 ${matches.length} 个匹配节点`, 'success');
    }

    function initMapSearch(childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, rebuildSimulationFn) {
        const input = $.getElement('mapSearchInput');
        if (!input) return;

        // Build parent map for ancestor lookups
        const parentMap = new Map();
        $.state.edges.forEach(e => {
            const relType = e.relation_type || e.relationship_type || e.label || '';
            if (relType === '包含') {
                parentMap.set(e.target_node_id, e.source_node_id);
            }
        });

        const ctx = { childrenMap, nodeMap, nodeGroups, hierLinks, crossLinks, crossEdgeLabels, zoom, svg, updateDescendantBadges, rebuildSimulationFn, parentMap };

        let searchTimer = null;
        input.addEventListener('input', () => {
            clearTimeout(searchTimer);
            searchTimer = setTimeout(() => {
                searchNodes(input.value, ctx);
            }, $.SEARCH_DEBOUNCE_DELAY);
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                input.value = '';
                searchNodes('', ctx);
                input.blur();
            }
        });
    }

    function setupKnowledgeMapControls(svg, zoom) {
        const zoomInBtn = $.getElement('mapZoomInBtn');
        const zoomOutBtn = $.getElement('mapZoomOutBtn');
        const resetZoomBtn = $.getElement('mapResetBtn');

        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', () => {
                svg.transition().duration(750).call(zoom.scaleBy, 1.3);
            });
        }

        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', () => {
                svg.transition().duration(750).call(zoom.scaleBy, 0.7);
            });
        }

        if (resetZoomBtn) {
            resetZoomBtn.addEventListener('click', () => {
                const svgElement = $.getElement('knowledgeMapSvg');
                const w = svgElement ? svgElement.clientWidth || 800 : 800;
                const h = svgElement ? svgElement.clientHeight || 600 : 600;
                svg.transition().duration(750).call(
                    zoom.transform,
                    d3.zoomIdentity.translate(w / 2, h / 2).scale(initialScale)
                );
            });
        }
    }

    function showNodeDetail(node) {
        const panel = $.getElement('nodeDetailPanel');
        if (!panel) return;

        $.state.lastSelectedNodeId = node.id;

        // Find related edges
        const relatedEdges = $.state.edges.filter(
            e => e.source_node_id === node.id || e.target_node_id === node.id
        );

        // Build content links HTML
        const contents = node.contents || [];
        const contentLinksHtml = contents.length > 0
            ? contents.map(c => {
                const icon = $.getContentTypeIcon(c.content_type);
                const anchorHint = formatAnchorHint(c.anchor);
                const anchorAttr = c.anchor
                    ? ` data-anchor="${JSON.stringify(c.anchor).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}"`
                    : '';
                return `
                    <div class="alc-nd__content-card" data-content-id="${c.content_id}"${anchorAttr} role="button" tabindex="0">
                        <span class="alc-nd__content-icon">${icon}</span>
                        <div class="alc-nd__content-meta">
                            <span class="alc-nd__content-name">${$.escapeHtml(c.content_title || '未命名内容')}</span>
                            ${anchorHint ? `<span class="alc-nd__content-hint">${anchorHint}</span>` : ''}
                        </div>
                        <span class="alc-nd__content-arrow">&rsaquo;</span>
                    </div>`;
            }).join('')
            : '<p class="alc-nd__empty">暂无关联教程</p>';

        // Build related nodes HTML
        const relatedNodesHtml = relatedEdges.length > 0
            ? relatedEdges.map(edge => {
                const relatedNode = $.state.nodes.find(n =>
                    (edge.source_node_id === node.id ? edge.target_node_id : edge.source_node_id) === n.id
                );
                if (!relatedNode) return '';
                const direction = edge.source_node_id === node.id ? '>' : '<';
                return `
                    <button class="alc-nd__rel-chip" data-node-id="${relatedNode.id}">
                        <span class="alc-nd__rel-dir">${direction}</span>
                        ${$.escapeHtml(relatedNode.title)}
                    </button>`;
            }).join('')
            : '<p class="alc-nd__empty">暂无相关节点</p>';

        // Render panel
        const nodeColor = node.color || '#006633';
        panel.innerHTML = `
            <button class="alc-nd__close">&times;</button>
            <div class="alc-nd">
                <div class="alc-nd__header" style="background: linear-gradient(135deg, ${nodeColor}, ${nodeColor}dd)">
                    <div class="alc-nd__icon">${node.icon || '\uD83D\uDCCC'}</div>
                    <h2 class="alc-nd__title">${$.escapeHtml(node.title)}</h2>
                </div>
                <div class="alc-nd__body">
                    <div class="alc-nd__section">
                        <p class="alc-nd__desc">${$.escapeHtml(node.description || '暂无描述')}</p>
                    </div>

                    <hr class="alc-nd__divider">

                    <div class="alc-nd__section">
                        <h4 class="alc-nd__section-label">
                            关联教程
                            ${contents.length > 0 ? `<span class="alc-nd__count">${contents.length}</span>` : ''}
                        </h4>
                        <div class="alc-nd__content-list">${contentLinksHtml}</div>
                    </div>

                    <hr class="alc-nd__divider">

                    <div class="alc-nd__section">
                        <h4 class="alc-nd__section-label">
                            关联节点
                            ${relatedEdges.length > 0 ? `<span class="alc-nd__count">${relatedEdges.length}</span>` : ''}
                        </h4>
                        <div class="alc-nd__rel-list">${relatedNodesHtml}</div>
                    </div>
                </div>
            </div>
        `;

        // Show panel with slide-in animation
        panel.style.display = 'flex';
        requestAnimationFrame(() => {
            panel.classList.add('alc-node-detail-panel--active');
        });

        // Event delegation: close button
        panel.querySelector('.alc-nd__close').addEventListener('click', hideNodeDetail);

        // Event delegation: content cards (navigate to content)
        panel.querySelectorAll('.alc-nd__content-card[data-content-id]').forEach(card => {
            card.addEventListener('click', () => {
                const contentId = card.getAttribute('data-content-id');
                const anchorStr = card.getAttribute('data-anchor');
                let anchor = null;
                if (anchorStr) {
                    try { anchor = JSON.parse(anchorStr); }
                    catch (e) { console.warn('[KG] anchor parse error:', e); }
                }
                navigateToContent(contentId, anchor);
            });
        });

        // Event delegation: related node chips
        panel.querySelectorAll('.alc-nd__rel-chip[data-node-id]').forEach(chip => {
            chip.addEventListener('click', () => {
                const nodeId = chip.getAttribute('data-node-id');
                const targetNode = $.state.nodes.find(n => n.id == nodeId);
                if (targetNode) showNodeDetail(targetNode);
            });
        });
    }

    /** Format anchor hint text for display */
    function formatAnchorHint(anchor) {
        if (!anchor) return '';
        switch (anchor.type) {
            case 'page': return `\u2192 第 ${anchor.value} 页`;
            case 'page_range': return `\u2192 第 ${anchor.from}-${anchor.to} 页`;
            case 'heading': return `\u2192 ${anchor.value}`;
            case 'timestamp': {
                const min = Math.floor(anchor.value / 60);
                const sec = anchor.value % 60;
                return `\u2192 ${min}:${String(sec).padStart(2, '0')}`;
            }
            case 'keyword': return `\u2192 搜索: ${anchor.value}`;
            default: return '';
        }
    }

    /**
     * Navigate from knowledge map to content viewer with anchor positioning.
     * @param {string|number} contentId - Content ID to open
     * @param {string|null} anchorJson - JSON string of anchor object (escaped)
     */
    async function navigateToContent(contentId, anchorJson) {
        console.log('[KG Navigate] contentId:', contentId, 'anchorJson:', anchorJson);

        // Parse anchor - handle both string JSON and pre-parsed objects
        let anchor = null;
        if (anchorJson) {
            try {
                anchor = typeof anchorJson === 'string' ? JSON.parse(anchorJson) : anchorJson;
                // If JSON.parse returned a string (double-encoded), parse again
                if (typeof anchor === 'string') {
                    anchor = JSON.parse(anchor);
                }
            } catch (e) {
                console.warn('[KG Navigate] Failed to parse anchor:', anchorJson, e);
            }
        }
        console.log('[KG Navigate] Parsed anchor:', anchor);

        // Hide node detail panel to avoid overlap
        hideNodeDetail();

        // Switch to media tab
        await $.switchTab('media');

        // Small delay to ensure tab is visible
        await new Promise(resolve => setTimeout(resolve, 150));

        // Open content in ebook viewer
        try {
            await $.showEbookContent(contentId);
            console.log('[KG Navigate] Content loaded successfully');
        } catch (e) {
            console.error('[KG Navigate] Failed to load content:', e);
            return;
        }

        // Apply anchor positioning after content loads
        if (anchor) {
            // For PDF, apply anchor directly in the iframe src (more reliable than waiting)
            if (anchor.type === 'page' || anchor.type === 'page_range') {
                const bodyEl = document.getElementById('ebookViewerBody');
                if (bodyEl) {
                    const iframe = bodyEl.querySelector('iframe');
                    if (iframe && iframe.src) {
                        const page = anchor.type === 'page' ? anchor.value : anchor.from;
                        const baseUrl = iframe.src.split('#')[0];
                        const newSrc = baseUrl + '#page=' + page;
                        console.log('[KG Navigate] Setting PDF page:', page, 'URL:', newSrc);
                        iframe.src = newSrc;
                    } else {
                        console.warn('[KG Navigate] No iframe found for PDF navigation');
                    }
                }
            }
            // Wait for content to render, then apply anchor (for non-PDF or as fallback)
            await new Promise(resolve => setTimeout(resolve, 800));
            applyAnchor(anchor);
        }
    }

    /**
     * Apply anchor positioning to the currently loaded content.
     */
    function applyAnchor(anchor) {
        const bodyEl = document.getElementById('ebookViewerBody');
        if (!bodyEl || !anchor) return;

        switch (anchor.type) {
            case 'page':
            case 'page_range': {
                // PDF: reload iframe with #page=N
                const iframe = bodyEl.querySelector('iframe');
                if (iframe && iframe.src) {
                    const page = anchor.type === 'page' ? anchor.value : anchor.from;
                    const baseUrl = iframe.src.split('#')[0];
                    iframe.src = baseUrl + '#page=' + page;
                }
                break;
            }
            case 'heading': {
                // Article: scroll to heading
                const headingId = anchor.value.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, '-');
                const el = bodyEl.querySelector(`#${CSS.escape(headingId)}`)
                        || bodyEl.querySelector(`h1, h2, h3, h4`);
                // Try text match if id not found
                if (!el) {
                    const allHeadings = bodyEl.querySelectorAll('h1, h2, h3, h4');
                    for (const h of allHeadings) {
                        if (h.textContent.includes(anchor.value)) {
                            h.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            h.style.outline = '3px solid var(--brand, #006633)';
                            setTimeout(() => { h.style.outline = ''; }, 3000);
                            return;
                        }
                    }
                }
                if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
                break;
            }
            case 'timestamp': {
                // Video: set currentTime
                const video = bodyEl.querySelector('video');
                if (video) {
                    video.currentTime = anchor.value;
                } else {
                    // YouTube/external: reload with start param
                    const iframe = bodyEl.querySelector('iframe');
                    if (iframe && iframe.src) {
                        const url = new URL(iframe.src);
                        url.searchParams.set('start', anchor.value);
                        iframe.src = url.toString();
                    }
                }
                break;
            }
            case 'keyword': {
                // Fallback: search text in content
                const text = bodyEl.innerText;
                const idx = text.indexOf(anchor.value);
                if (idx >= 0) {
                    // Find the nearest block element containing the keyword
                    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_TEXT);
                    while (walker.nextNode()) {
                        if (walker.currentNode.textContent.includes(anchor.value)) {
                            const parent = walker.currentNode.parentElement;
                            if (parent) {
                                parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                parent.style.backgroundColor = 'rgba(255, 235, 59, 0.4)';
                                setTimeout(() => { parent.style.backgroundColor = ''; }, 4000);
                            }
                            break;
                        }
                    }
                }
                break;
            }
        }
    }

    function hideNodeDetail() {
        const panel = $.getElement('nodeDetailPanel');
        if (panel) {
            panel.classList.remove('alc-node-detail-panel--active');
            // Wait for CSS transition to finish before hiding
            const onTransitionEnd = () => {
                panel.style.display = 'none';
                panel.removeEventListener('transitionend', onTransitionEnd);
            };
            panel.addEventListener('transitionend', onTransitionEnd);
            // Fallback: hide after 400ms in case transitionend doesn't fire
            setTimeout(() => {
                panel.style.display = 'none';
            }, 400);
        }
    }

    // Register module functions
    $.modules.knowledgeMap = {
        loadKnowledgeMap,
        renderKnowledgeMap,
        showNodeDetail,
        hideNodeDetail,
        navigateToContent,
        searchNodes,
    };
})();
