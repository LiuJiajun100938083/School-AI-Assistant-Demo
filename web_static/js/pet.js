/**
 * 虚拟宠物系统 — 页面控制器
 *
 * 负责：API 调用、UI 状态管理、捏脸流程、商店交互
 */
(function () {
    'use strict';

    // ── 状态 ──
    let petData = null;
    let renderer = null;
    let streakData = null;
    let customizeStep = 0;
    let customizeChoices = { body_type: 0, color_id: 0, pattern_id: 0, eyes_id: 0, ears_id: 0, tail_id: 0 };
    let customizeRenderer = null;

    // ── DOM refs ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ── API helpers ──
    async function api(method, path, body) {
        const opts = {
            method: method,
            headers: { 'Content-Type': 'application/json' },
        };
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        if (body) opts.body = JSON.stringify(body);

        const res = await fetch(path, opts);
        if (res.status === 403) {
            window.location.replace('/');
            return null;
        }
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || err.message || 'API error');
        }
        return res.json();
    }

    // ── 初始化 ──
    async function init() {
        try {
            const data = await api('GET', '/api/pet/me');
            if (!data) return;

            $('#petLoading').style.display = 'none';

            if (!data.has_pet) {
                showNoPet();
                return;
            }

            petData = data.pet;
            streakData = data.streak;
            renderPetView(data);
        } catch (e) {
            console.error('Pet init error:', e);
            $('#petLoading').textContent = '载入失败: ' + e.message;
        }
    }

    // ── 未创建宠物 ──
    function showNoPet() {
        $('#petNoPet').style.display = 'flex';
        $('#btnAdoptPet').onclick = () => openCustomize(true);
    }

    // ── 渲染宠物视图 ──
    function renderPetView(data) {
        $('#petView').style.display = '';
        petData = data.pet;

        // 金币
        $('#petCoinsDisplay').textContent = petData.coins;

        // 名字 & 阶段
        $('#petNameTag').textContent = petData.pet_name;
        const badge = $('#petStageBadge');
        badge.textContent = i18n.t('pet.stage.' + petData.stage);
        badge.className = 'pet-stage-badge pet-stage-badge--' + petData.stage;

        // 属性条
        updateBar('Hunger', petData.hunger);
        updateBar('Hygiene', petData.hygiene);
        updateBar('Mood', petData.mood);

        // 消息气泡
        if (data.message) {
            const bubble = $('#petBubble');
            bubble.textContent = data.message;
            bubble.style.display = '';
            setTimeout(() => bubble.style.display = 'none', 5000);
        }

        // Streak
        if (data.streak) {
            $('#petStreakCount').textContent = data.streak.current_streak || 0;
            const mult = data.streak.multiplier || 1;
            $('#petStreakMult').textContent = mult > 1 ? ('x' + mult + ' ' + i18n.t('pet.streak.multiplier')) : '';
        }

        // League
        if (petData.league) {
            const lb = $('#petLeagueBadge');
            lb.textContent = i18n.t('pet.league.' + petData.league.name);
            lb.className = 'pet-league-badge pet-league-badge--' + petData.league.name;
        }

        // 学科倾向
        updateSubjectBars(petData);

        // 性格
        if (petData.personality) {
            $('#petPersonalityLabel').textContent = i18n.t('pet.personality.' + petData.personality);
        }

        // Canvas 渲染
        if (renderer) renderer.destroy();
        renderer = PetRenderer.create($('#petCanvas'), petData);

        // 绑定按钮
        $('#btnShop').onclick = openShop;
        $('#btnLeaderboard').onclick = openLeaderboard;
        $('#btnAchievements').onclick = openAchievements;
        $('#btnCustomize').onclick = () => openCustomize(false);
    }

    function updateBar(name, value) {
        const bar = $('#bar' + name);
        const val = $('#val' + name);
        if (bar) bar.style.width = value + '%';
        if (val) val.textContent = value;
    }

    function updateSubjectBars(pet) {
        const total = Math.max(1, (pet.science_xp || 0) + (pet.humanities_xp || 0) + (pet.business_xp || 0) + (pet.tech_xp || 0));
        const pct = (v) => Math.round((v || 0) / total * 100);
        $('#barScience').style.width = pct(pet.science_xp) + '%';
        $('#barHumanities').style.width = pct(pet.humanities_xp) + '%';
        $('#barBusiness').style.width = pct(pet.business_xp) + '%';
        $('#barTech').style.width = pct(pet.tech_xp) + '%';
    }

    // ============================================================
    // 捏脸/自定义
    // ============================================================

    const CUSTOMIZE_STEPS = [
        { key: 'body_type', guide: 'pet.step.body', count: 8, icons: ['O', 'D', '|', '=', 'V', '~', '@', 'I'] },
        { key: 'color_id', guide: 'pet.step.color', count: 15, type: 'color' },
        { key: 'pattern_id', guide: 'pet.step.pattern', count: 8, icons: ['-', '=', '.', '*', '/', '#', '~', '<>'] },
        { key: 'eyes_id', guide: 'pet.step.eyes', count: 6, icons: ['O', 'o', '-', '*', '<3', 'B'] },
        { key: 'ears_id', guide: 'pet.step.ears', count: 6, icons: ['/\\', '()', 'vv', '||', '/\\', 'x'] },
        // tail included with ears step
    ];

    const COLORS_HEX = [
        '#FF6B6B', '#FFA07A', '#FFD93D', '#6BCB77', '#4D96FF',
        '#9B59B6', '#FF85B3', '#00D2FF', '#A8E6CF', '#F8B500',
        '#E17055', '#00CEC9', '#6C5CE7', '#FDCB6E', '#E84393',
    ];

    function openCustomize(isNew) {
        if (isNew) {
            customizeChoices = { body_type: 0, color_id: 0, pattern_id: 0, eyes_id: 0, ears_id: 0, tail_id: 0 };
        } else if (petData) {
            customizeChoices = {
                body_type: petData.body_type,
                color_id: petData.color_id,
                pattern_id: petData.pattern_id,
                eyes_id: petData.eyes_id,
                ears_id: petData.ears_id,
                tail_id: petData.tail_id,
            };
        }
        customizeStep = 0;
        $('#customizeOverlay').style.display = 'flex';
        renderCustomizeStep();
    }

    function renderCustomizeStep() {
        const isNameStep = customizeStep >= CUSTOMIZE_STEPS.length;
        const overlay = $('#customizeOverlay');

        // Progress dots
        const progress = $('#customizeProgress');
        progress.innerHTML = '';
        const totalSteps = CUSTOMIZE_STEPS.length + 1;
        for (let i = 0; i < totalSteps; i++) {
            const dot = document.createElement('div');
            dot.className = 'pet-customize-dot';
            if (i < customizeStep) dot.classList.add('pet-customize-dot--done');
            if (i === customizeStep) dot.classList.add('pet-customize-dot--active');
            progress.appendChild(dot);
        }

        // Guide text
        if (isNameStep) {
            $('#customizeGuide').textContent = i18n.t('pet.step.name');
            $('#customizeOptions').innerHTML = `
                <input type="text" id="petNameInput" placeholder="${i18n.t('pet.namePlaceholder')}"
                    value="${petData ? petData.pet_name : ''}"
                    maxlength="20"
                    style="width:100%;padding:12px;font-size:16px;border:2px solid #2c2c2c;border-radius:8px;font-family:inherit;">
            `;
            $('#customizeNext').textContent = i18n.t('pet.step.confirm');
            $('#customizeRandom').style.display = 'none';
        } else {
            const step = CUSTOMIZE_STEPS[customizeStep];
            $('#customizeGuide').textContent = i18n.t(step.guide);
            $('#customizeNext').textContent = i18n.t('pet.step.next');
            $('#customizeRandom').style.display = '';

            const container = $('#customizeOptions');
            container.innerHTML = '';
            for (let i = 0; i < step.count; i++) {
                const opt = document.createElement('div');
                opt.className = 'pet-customize-option';
                if (customizeChoices[step.key] === i) opt.classList.add('pet-customize-option--selected');

                if (step.type === 'color') {
                    opt.style.background = COLORS_HEX[i];
                } else {
                    opt.textContent = step.icons ? step.icons[i] : i;
                }

                opt.onclick = () => {
                    customizeChoices[step.key] = i;
                    // Also set tail to match ears step
                    if (step.key === 'ears_id') customizeChoices.tail_id = i;
                    renderCustomizeStep();
                };
                container.appendChild(opt);
            }
        }

        // Preview
        if (customizeRenderer) customizeRenderer.destroy();
        const previewData = { ...customizeChoices, stage: 'adult', hunger: 100, hygiene: 100, mood: 100, growth: 500 };
        customizeRenderer = PetRenderer.create($('#customizeCanvas'), previewData, { mini: true });

        // Nav buttons
        $('#customizePrev').style.display = customizeStep > 0 ? '' : 'none';
    }

    // Nav handlers
    document.addEventListener('DOMContentLoaded', function () {
        $('#customizePrev').onclick = () => { customizeStep--; renderCustomizeStep(); };
        $('#customizeRandom').onclick = () => {
            const step = CUSTOMIZE_STEPS[customizeStep];
            if (step) {
                customizeChoices[step.key] = Math.floor(Math.random() * step.count);
                if (step.key === 'ears_id') customizeChoices.tail_id = Math.floor(Math.random() * 6);
                renderCustomizeStep();
            }
        };
        $('#customizeNext').onclick = async () => {
            if (customizeStep < CUSTOMIZE_STEPS.length) {
                customizeStep++;
                renderCustomizeStep();
                return;
            }
            // Final step: save
            const nameInput = $('#petNameInput');
            const name = nameInput ? nameInput.value.trim() : '';
            if (!name) {
                if (nameInput) nameInput.focus();
                return;
            }
            await savePet(name);
        };
    });

    async function savePet(name) {
        try {
            const body = { pet_name: name, ...customizeChoices };
            let data;
            if (!petData) {
                data = await api('POST', '/api/pet/create', body);
            } else {
                body.pet_name = name;
                data = await api('PUT', '/api/pet/customize', body);
            }
            if (data && data.pet) {
                $('#customizeOverlay').style.display = 'none';
                if (customizeRenderer) customizeRenderer.destroy();
                $('#petNoPet').style.display = 'none';
                // Reload full state
                const full = await api('GET', '/api/pet/me');
                if (full && full.has_pet) renderPetView(full);
            }
        } catch (e) {
            alert(e.message);
        }
    }

    // ============================================================
    // 商店
    // ============================================================

    async function openShop() {
        try {
            const data = await api('GET', '/api/pet/shop');
            if (!data) return;

            const container = $('#petSectionContainer');
            container.innerHTML = '';

            const section = document.createElement('div');
            section.className = 'pet-section pet-section--active';

            // Tabs
            const tabs = document.createElement('div');
            tabs.className = 'pet-shop-tabs';
            const categories = [
                { key: 'food', label: i18n.t('pet.shop.food'), icon: '\uD83C\uDF5E' },
                { key: 'hygiene', label: i18n.t('pet.shop.hygiene'), icon: '\uD83E\uDDFC' },
                { key: 'toy', label: i18n.t('pet.shop.toy'), icon: '\uD83C\uDFBE' },
            ];

            let activeCategory = 'food';
            function renderShopGrid() {
                const grid = section.querySelector('.pet-shop-grid') || document.createElement('div');
                grid.className = 'pet-shop-grid';
                grid.innerHTML = '';

                const items = data.items.filter(i => i.category === activeCategory);
                items.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'pet-shop-item';

                    const ITEM_ICONS = {
                        bread: '\uD83C\uDF5E', steak: '\uD83E\uDD69', feast: '\uD83C\uDF7D',
                        soap: '\uD83E\uDDFC', shampoo: '\uD83E\uDDF4', bathtub: '\uD83D\uDEC1',
                        ball: '\u26BD', plush: '\uD83E\uDDF8', playground: '\uD83C\uDFA0',
                    };
                    const icon = ITEM_ICONS[item.icon] || '\uD83C\uDF81';

                    card.innerHTML = `
                        <div class="pet-shop-item__icon">${icon}</div>
                        <div class="pet-shop-item__name">${item.name}</div>
                        <div class="pet-shop-item__effect">${item.effect_type} +${item.effect_value}</div>
                        <button class="pet-shop-item__buy">\uD83D\uDCB0 ${item.price}</button>
                    `;
                    card.querySelector('.pet-shop-item__buy').onclick = () => purchaseItem(item.id);
                    grid.appendChild(card);
                });

                if (!section.querySelector('.pet-shop-grid')) section.appendChild(grid);
            }

            categories.forEach(cat => {
                const tab = document.createElement('button');
                tab.className = 'pet-shop-tab' + (cat.key === activeCategory ? ' pet-shop-tab--active' : '');
                tab.textContent = cat.icon + ' ' + cat.label;
                tab.onclick = () => {
                    activeCategory = cat.key;
                    tabs.querySelectorAll('.pet-shop-tab').forEach(t => t.classList.remove('pet-shop-tab--active'));
                    tab.classList.add('pet-shop-tab--active');
                    renderShopGrid();
                };
                tabs.appendChild(tab);
            });

            section.appendChild(tabs);
            renderShopGrid();
            container.appendChild(section);
        } catch (e) {
            alert(e.message);
        }
    }

    async function purchaseItem(itemId) {
        try {
            const data = await api('POST', '/api/pet/shop/purchase', { item_id: itemId });
            if (data && data.pet) {
                petData = data.pet;
                $('#petCoinsDisplay').textContent = petData.coins;
                updateBar('Hunger', petData.hunger);
                updateBar('Hygiene', petData.hygiene);
                updateBar('Mood', petData.mood);
                if (renderer) renderer.setState('eat');
                if (window.UIModule) UIModule.toast(i18n.t('pet.shop.bought') + '!', 'success');
            }
        } catch (e) {
            if (window.UIModule) UIModule.toast(e.message, 'error');
            else alert(e.message);
        }
    }

    // ============================================================
    // 排行榜
    // ============================================================

    async function openLeaderboard() {
        try {
            const data = await api('GET', '/api/pet/leaderboard?type=growth&limit=20');
            if (!data) return;

            const container = $('#petSectionContainer');
            container.innerHTML = '';

            const section = document.createElement('div');
            section.className = 'pet-section pet-section--active';

            const title = document.createElement('div');
            title.className = 'pet-section-title';
            title.textContent = i18n.t('pet.leaderboard.growth');
            section.appendChild(title);

            const list = document.createElement('div');
            list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

            (data.leaderboard || []).forEach((entry, idx) => {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;background:white;border:2px solid #2c2c2c;border-radius:8px;';
                const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
                const rank = idx < 3 ? medals[idx] : (idx + 1);
                row.innerHTML = `
                    <span style="font-size:20px;min-width:30px;text-align:center;">${rank}</span>
                    <span style="flex:1;font-weight:600;">${entry.display_name || entry.pet_name || 'Unknown'}</span>
                    <span style="font-weight:700;color:#4a90d9;">${entry.growth}</span>
                `;
                list.appendChild(row);
            });

            section.appendChild(list);
            container.appendChild(section);
        } catch (e) {
            alert(e.message);
        }
    }

    // ============================================================
    // 成就
    // ============================================================

    async function openAchievements() {
        try {
            const data = await api('GET', '/api/pet/achievements');
            if (!data) return;

            const container = $('#petSectionContainer');
            container.innerHTML = '';

            const section = document.createElement('div');
            section.className = 'pet-section pet-section--active';

            const title = document.createElement('div');
            title.className = 'pet-section-title';
            title.textContent = i18n.t('pet.achievements');
            section.appendChild(title);

            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';

            (data.achievements || []).forEach(a => {
                const card = document.createElement('div');
                const unlocked = !!a.unlocked_at;
                card.style.cssText = `padding:12px;background:${unlocked ? '#e8f5e9' : '#f5f5f5'};border:2px solid ${unlocked ? '#27ae60' : '#ccc'};border-radius:8px;text-align:center;opacity:${unlocked ? 1 : 0.6};`;
                card.innerHTML = `
                    <div style="font-size:28px;margin-bottom:4px;">${unlocked ? '\uD83C\uDFC5' : '\uD83D\uDD12'}</div>
                    <div style="font-weight:700;font-size:13px;">${a.name}</div>
                    <div style="font-size:11px;color:#666;margin-top:2px;">${a.description}</div>
                    ${a.reward_coins > 0 ? `<div style="font-size:12px;color:#b8860b;margin-top:4px;">\uD83D\uDCB0 +${a.reward_coins}</div>` : ''}
                `;
                grid.appendChild(card);
            });

            section.appendChild(grid);
            container.appendChild(section);
        } catch (e) {
            alert(e.message);
        }
    }

    // ── Bootstrap ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
