/**
 * 虚拟宠物系统 — 页面控制器
 *
 * 使用字符网格 sprite 渲染引擎，支持捏脸、商店、排行、成就
 */
(function () {
    'use strict';

    var petData = null;
    var renderer = null;
    var streakData = null;

    var $ = function (sel) { return document.querySelector(sel); };

    // ── API ──
    async function api(method, path, body) {
        var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
        var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (token) opts.headers['Authorization'] = 'Bearer ' + token;
        if (body) opts.body = JSON.stringify(body);
        var res = await fetch(path, opts);
        if (res.status === 403) { window.location.replace('/'); return null; }
        if (!res.ok) { var err = await res.json().catch(function () { return {}; }); throw new Error(err.detail || err.message || 'API error'); }
        return res.json();
    }

    // ── 部件名称（用于 UI 展示）──
    var BODY_LABELS = ['凝胶史莱姆', '圆团子兽', '重装方块', '装甲核心', '幽灵数据体', '棱彩晶体', '蓬松云朵', '飞碟底座'];
    var EYES_LABELS = ['经典呆萌', '像素墨镜', '战斗模式', '星星眼', '赛博面罩', '单眼探测器', '休眠模式', '开心笑眼', '故障暈厥'];
    var EARS_LABELS = ['垂耳', '猫耳感应器', '机械天线', '恶魔角', '电竞耳机', '全息光环', '王者皇冠', '头顶小花', '无'];
    var TAIL_LABELS = ['毛球', '剑龙装甲刺', '高压闪电', '火箭推进器', '能量光翼', '异星触手', '机械插头', '无'];

    // ── 颜色（匹配 renderer）──
    var COLORS = PetRenderer.COLORS;

    // ── 初始化 ──
    async function init() {
        try {
            var data = await api('GET', '/api/pet/me');
            if (!data) return;
            $('#petLoading').style.display = 'none';
            if (!data.has_pet) { showNoPet(); return; }
            renderPetView(data);
        } catch (e) {
            console.error('Pet init error:', e);
            $('#petLoading').textContent = i18n.t('common.error') + ': ' + e.message;
        }
    }

    function showNoPet() {
        $('#petNoPet').style.display = 'flex';
        $('#btnAdoptPet').onclick = function () { openCustomize(true); };
    }

    // ── 渲染宠物主视图 ──
    function renderPetView(data) {
        $('#petView').style.display = '';
        $('#petNoPet').style.display = 'none';
        petData = data.pet;
        streakData = data.streak;

        $('#petCoinsDisplay').textContent = petData.coins;
        $('#petNameTag').textContent = petData.pet_name;

        var badge = $('#petStageBadge');
        badge.textContent = i18n.t('pet.stage.' + petData.stage);
        badge.className = 'pet-stage-badge pet-stage-badge--' + petData.stage;

        updateBar('Hunger', petData.hunger);
        updateBar('Hygiene', petData.hygiene);
        updateBar('Mood', petData.mood);

        if (data.message) {
            var bubble = $('#petBubble');
            bubble.textContent = data.message;
            bubble.style.display = '';
            setTimeout(function () { bubble.style.display = 'none'; }, 5000);
        }

        if (data.streak) {
            $('#petStreakCount').textContent = data.streak.current_streak || 0;
            var mult = data.streak.multiplier || 1;
            $('#petStreakMult').textContent = mult > 1 ? ('x' + mult) : '';
        }

        if (petData.league) {
            var lb = $('#petLeagueBadge');
            lb.textContent = i18n.t('pet.league.' + petData.league.name);
            lb.className = 'pet-league-badge pet-league-badge--' + petData.league.name;
        }

        updateSubjectBars(petData);
        if (petData.personality) {
            $('#petPersonalityLabel').textContent = i18n.t('pet.personality.' + petData.personality);
        }

        // 渲染宠物 canvas
        if (renderer) renderer.destroy();
        renderer = PetRenderer.create($('#petCanvas'), petData);

        // 绑定按钮
        $('#btnShop').onclick = openShop;
        $('#btnLeaderboard').onclick = openLeaderboard;
        $('#btnAchievements').onclick = openAchievements;
        $('#btnCustomize').onclick = function () { openCustomize(false); };
    }

    function updateBar(name, value) {
        var bar = $('#bar' + name);
        var val = $('#val' + name);
        if (bar) bar.style.width = value + '%';
        if (val) val.textContent = value;
    }

    function updateSubjectBars(pet) {
        var total = Math.max(1, (pet.science_xp || 0) + (pet.humanities_xp || 0) + (pet.business_xp || 0) + (pet.tech_xp || 0));
        var pct = function (v) { return Math.round((v || 0) / total * 100); };
        $('#barScience').style.width = pct(pet.science_xp) + '%';
        $('#barHumanities').style.width = pct(pet.humanities_xp) + '%';
        $('#barBusiness').style.width = pct(pet.business_xp) + '%';
        $('#barTech').style.width = pct(pet.tech_xp) + '%';
    }

    // ============================================================
    // 捏脸 / 自定义
    // ============================================================
    var customizeState = { body_type: 0, color_id: 0, pattern_id: 0, eyes_id: 0, ears_id: 0, tail_id: 0 };
    var customizeStep = 0;
    var customizeRenderer = null;
    var isNewPet = false;

    var STEPS = [
        { key: 'body_type', guide: 'pet.step.body', labels: BODY_LABELS },
        { key: 'color_id',  guide: 'pet.step.color', type: 'color' },
        { key: 'eyes_id',   guide: 'pet.step.eyes',  labels: EYES_LABELS },
        { key: 'ears_id',   guide: 'pet.step.ears',   labels: EARS_LABELS },
        { key: 'tail_id',   guide: 'pet.step.tail',   labels: TAIL_LABELS },
        // step 5: name input (isNameStep = customizeStep >= STEPS.length)
    ];

    function openCustomize(creating) {
        isNewPet = creating;
        if (creating) {
            customizeState = { body_type: 0, color_id: 0, pattern_id: 0, eyes_id: 0, ears_id: 0, tail_id: 0 };
        } else if (petData) {
            customizeState = {
                body_type: petData.body_type, color_id: petData.color_id,
                pattern_id: petData.pattern_id || 0, eyes_id: petData.eyes_id,
                ears_id: petData.ears_id, tail_id: petData.tail_id
            };
        }
        customizeStep = 0;
        $('#customizeOverlay').style.display = 'flex';
        renderStep();
    }

    function renderStep() {
        var isNameStep = customizeStep >= STEPS.length;
        var totalSteps = STEPS.length + 1;

        // 进度
        var progress = $('#customizeProgress');
        progress.innerHTML = '';
        for (var i = 0; i < totalSteps; i++) {
            var dot = document.createElement('div');
            dot.className = 'pet-customize-dot';
            if (i < customizeStep) dot.classList.add('pet-customize-dot--done');
            if (i === customizeStep) dot.classList.add('pet-customize-dot--active');
            progress.appendChild(dot);
        }

        var container = $('#customizeOptions');

        if (isNameStep) {
            $('#customizeGuide').textContent = i18n.t('pet.step.name');
            container.innerHTML = '<input type="text" id="petNameInput" placeholder="' + i18n.t('pet.namePlaceholder') + '" value="' + (petData ? petData.pet_name : '') + '" maxlength="20" style="width:100%;padding:12px;font-size:16px;border:2px solid #2c2c2c;border-radius:8px;font-family:inherit;background:#1e293b;color:#e2e8f0;">';
            $('#customizeNext').textContent = i18n.t('pet.step.confirm');
            $('#customizeRandom').style.display = 'none';
        } else {
            var step = STEPS[customizeStep];
            $('#customizeGuide').textContent = i18n.t(step.guide);
            $('#customizeNext').textContent = i18n.t('pet.step.next');
            $('#customizeRandom').style.display = '';

            container.innerHTML = '';
            var count = step.type === 'color' ? COLORS.length : (step.labels ? step.labels.length : 8);

            for (var j = 0; j < count; j++) {
                var opt = document.createElement('div');
                opt.className = 'pet-customize-option';
                if (customizeState[step.key] === j) opt.classList.add('pet-customize-option--selected');

                if (step.type === 'color') {
                    opt.style.background = COLORS[j];
                    opt.style.border = customizeState[step.key] === j ? '3px solid #4f46e5' : '2px solid #475569';
                } else {
                    opt.textContent = step.labels ? step.labels[j] : j;
                    opt.style.fontSize = '11px';
                    opt.style.width = 'auto';
                    opt.style.minWidth = '64px';
                    opt.style.padding = '6px 8px';
                }

                (function (idx) {
                    opt.onclick = function () {
                        customizeState[step.key] = idx;
                        renderStep();
                    };
                })(j);
                container.appendChild(opt);
            }
        }

        // 实时预览
        if (customizeRenderer) customizeRenderer.destroy();
        var previewData = Object.assign({}, customizeState, { stage: 'adult', hunger: 100, hygiene: 100, mood: 100, growth: 500 });
        customizeRenderer = PetRenderer.create($('#customizeCanvas'), previewData, { mini: true });

        $('#customizePrev').style.display = customizeStep > 0 ? '' : 'none';
    }

    // Nav
    document.addEventListener('DOMContentLoaded', function () {
        $('#customizePrev').onclick = function () { customizeStep--; renderStep(); };
        $('#customizeRandom').onclick = function () {
            if (customizeStep < STEPS.length) {
                var step = STEPS[customizeStep];
                var count = step.type === 'color' ? COLORS.length : (step.labels ? step.labels.length : 8);
                customizeState[step.key] = Math.floor(Math.random() * count);
                renderStep();
            }
        };
        $('#customizeNext').onclick = async function () {
            if (customizeStep < STEPS.length) { customizeStep++; renderStep(); return; }
            var nameInput = $('#petNameInput');
            var name = nameInput ? nameInput.value.trim() : '';
            if (!name) { if (nameInput) nameInput.focus(); return; }
            await savePet(name);
        };
    });

    async function savePet(name) {
        try {
            var body = Object.assign({ pet_name: name }, customizeState);
            if (isNewPet) {
                await api('POST', '/api/pet/create', body);
            } else {
                await api('PUT', '/api/pet/customize', body);
            }
            $('#customizeOverlay').style.display = 'none';
            if (customizeRenderer) customizeRenderer.destroy();
            var full = await api('GET', '/api/pet/me');
            if (full && full.has_pet) renderPetView(full);
        } catch (e) { alert(e.message); }
    }

    // ============================================================
    // 商店
    // ============================================================
    var ITEM_ICONS = {
        bread: '\uD83C\uDF5E', steak: '\uD83E\uDD69', feast: '\uD83C\uDF7D\uFE0F',
        soap: '\uD83E\uDDFC', shampoo: '\uD83E\uDDF4', bathtub: '\uD83D\uDEC1',
        ball: '\u26BD', plush: '\uD83E\uDDF8', playground: '\uD83C\uDFA0'
    };

    async function openShop() {
        var data = await api('GET', '/api/pet/shop');
        if (!data) return;
        var container = $('#petSectionContainer');
        container.innerHTML = '';

        var section = document.createElement('div');
        section.className = 'pet-section pet-section--active';

        var tabs = document.createElement('div');
        tabs.className = 'pet-shop-tabs';
        var categories = [
            { key: 'food', label: i18n.t('pet.shop.food'), icon: '\uD83C\uDF5E' },
            { key: 'hygiene', label: i18n.t('pet.shop.hygiene'), icon: '\uD83E\uDDFC' },
            { key: 'toy', label: i18n.t('pet.shop.toy'), icon: '\uD83C\uDFBE' }
        ];
        var activeCategory = 'food';

        function renderGrid() {
            var grid = section.querySelector('.pet-shop-grid');
            if (!grid) { grid = document.createElement('div'); grid.className = 'pet-shop-grid'; section.appendChild(grid); }
            grid.innerHTML = '';
            data.items.filter(function (i) { return i.category === activeCategory; }).forEach(function (item) {
                var card = document.createElement('div');
                card.className = 'pet-shop-item';
                card.innerHTML =
                    '<div class="pet-shop-item__icon">' + (ITEM_ICONS[item.icon] || '\uD83C\uDF81') + '</div>' +
                    '<div class="pet-shop-item__name">' + item.name + '</div>' +
                    '<div class="pet-shop-item__effect">' + item.effect_type + ' +' + item.effect_value + '</div>' +
                    '<button class="pet-shop-item__buy">\uD83D\uDCB0 ' + item.price + '</button>';
                card.querySelector('.pet-shop-item__buy').onclick = function () { purchaseItem(item.id); };
                grid.appendChild(card);
            });
        }

        categories.forEach(function (cat) {
            var tab = document.createElement('button');
            tab.className = 'pet-shop-tab' + (cat.key === activeCategory ? ' pet-shop-tab--active' : '');
            tab.textContent = cat.icon + ' ' + cat.label;
            tab.onclick = function () {
                activeCategory = cat.key;
                tabs.querySelectorAll('.pet-shop-tab').forEach(function (t) { t.classList.remove('pet-shop-tab--active'); });
                tab.classList.add('pet-shop-tab--active');
                renderGrid();
            };
            tabs.appendChild(tab);
        });

        section.appendChild(tabs);
        renderGrid();
        container.appendChild(section);
    }

    async function purchaseItem(itemId) {
        try {
            var data = await api('POST', '/api/pet/shop/purchase', { item_id: itemId });
            if (data && data.pet) {
                petData = data.pet;
                $('#petCoinsDisplay').textContent = petData.coins;
                updateBar('Hunger', petData.hunger);
                updateBar('Hygiene', petData.hygiene);
                updateBar('Mood', petData.mood);
                if (renderer) renderer.setState('eat', 2000, '\uD83C\uDF56 \u5403\u5403\u5403...');
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
        var data = await api('GET', '/api/pet/leaderboard?type=growth&limit=20');
        if (!data) return;
        var container = $('#petSectionContainer');
        container.innerHTML = '';
        var section = document.createElement('div');
        section.className = 'pet-section pet-section--active';
        var title = document.createElement('div');
        title.className = 'pet-section-title';
        title.textContent = i18n.t('pet.leaderboard.growth');
        section.appendChild(title);

        var list = document.createElement('div');
        list.style.cssText = 'display:flex;flex-direction:column;gap:8px;';
        var medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];
        (data.leaderboard || []).forEach(function (entry, idx) {
            var row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px 12px;background:white;border:2px solid #2c2c2c;border-radius:8px;';
            row.innerHTML = '<span style="font-size:20px;min-width:30px;text-align:center;">' + (idx < 3 ? medals[idx] : (idx + 1)) + '</span>' +
                '<span style="flex:1;font-weight:600;">' + (entry.display_name || entry.pet_name || 'Unknown') + '</span>' +
                '<span style="font-weight:700;color:#4a90d9;">' + entry.growth + '</span>';
            list.appendChild(row);
        });
        section.appendChild(list);
        container.appendChild(section);
    }

    // ============================================================
    // 成就
    // ============================================================
    async function openAchievements() {
        var data = await api('GET', '/api/pet/achievements');
        if (!data) return;
        var container = $('#petSectionContainer');
        container.innerHTML = '';
        var section = document.createElement('div');
        section.className = 'pet-section pet-section--active';
        var title = document.createElement('div');
        title.className = 'pet-section-title';
        title.textContent = i18n.t('pet.achievements');
        section.appendChild(title);
        var grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px;';
        (data.achievements || []).forEach(function (a) {
            var unlocked = !!a.unlocked_at;
            var card = document.createElement('div');
            card.style.cssText = 'padding:12px;background:' + (unlocked ? '#e8f5e9' : '#f5f5f5') + ';border:2px solid ' + (unlocked ? '#27ae60' : '#ccc') + ';border-radius:8px;text-align:center;opacity:' + (unlocked ? 1 : 0.6) + ';';
            card.innerHTML = '<div style="font-size:28px;margin-bottom:4px;">' + (unlocked ? '\uD83C\uDFC5' : '\uD83D\uDD12') + '</div>' +
                '<div style="font-weight:700;font-size:13px;">' + a.name + '</div>' +
                '<div style="font-size:11px;color:#666;margin-top:2px;">' + a.description + '</div>' +
                (a.reward_coins > 0 ? '<div style="font-size:12px;color:#b8860b;margin-top:4px;">\uD83D\uDCB0 +' + a.reward_coins + '</div>' : '');
            grid.appendChild(card);
        });
        section.appendChild(grid);
        container.appendChild(section);
    }

    // ── Bootstrap ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
