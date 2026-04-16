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
    function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

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
        // 跳过蛋孵化，直接进入捏脸（孵化流程已移至主页 sidebar）
        openCustomize(true);
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

        // personality data rendered on demand via openPersonality()

        // 渲染宠物 canvas
        if (renderer) renderer.destroy();
        renderer = PetRenderer.create($('#petCanvas'), petData);

        // 绑定按钮
        $('#btnShop').onclick = openShop;
        $('#btnLeaderboard').onclick = openLeaderboard;
        $('#btnAchievements').onclick = openAchievements;
        $('#btnCustomize').onclick = function () { openCustomize(false); };
        $('#btnCoinGuide').onclick = openCoinGuide;
        $('#btnPersonality').onclick = openPersonality;

        // 聊天 FAB + Panel
        $('#chatFab').onclick = toggleChatPanel;
        $('#chatPanelClose').onclick = function () { $('#chatPanel').style.display = 'none'; };
        initChat();
    }

    function updateBar(name, value) {
        var bar = $('#bar' + name);
        var val = $('#val' + name);
        if (bar) bar.style.width = value + '%';
        if (val) val.textContent = value;
    }

    // ── 性格 Sheet ──
    function openPersonality() {
        if (!petData) return;
        var total = Math.max(1, (petData.science_xp || 0) + (petData.humanities_xp || 0) + (petData.business_xp || 0) + (petData.tech_xp || 0));
        var pct = function (v) { return Math.round((v || 0) / total * 100); };
        var personality = petData.personality ? i18n.t('pet.personality.' + petData.personality) : '';
        var html = '';
        if (personality) {
            html += '<div style="text-align:center;margin-bottom:20px;"><span style="display:inline-block;padding:6px 16px;background:rgba(175,82,222,0.1);border-radius:20px;font-weight:600;color:#AF52DE;">' + esc(personality) + '</span></div>';
        }
        var subjects = [
            { label: i18n.t('pet.subject.science'), value: pct(petData.science_xp), color: 'var(--pet-red)' },
            { label: i18n.t('pet.subject.humanities'), value: pct(petData.humanities_xp), color: 'var(--pet-primary)' },
            { label: i18n.t('pet.subject.business'), value: pct(petData.business_xp), color: 'var(--pet-orange)' },
            { label: i18n.t('pet.subject.tech'), value: pct(petData.tech_xp), color: 'var(--pet-green)' },
        ];
        subjects.forEach(function (s) {
            html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">' +
                '<span style="width:36px;font-size:13px;font-weight:600;text-align:right;color:#8E8E93;">' + s.label + '</span>' +
                '<div style="flex:1;height:8px;background:rgba(0,0,0,0.06);border-radius:4px;overflow:hidden;">' +
                    '<div style="height:100%;width:' + s.value + '%;background:' + s.color + ';border-radius:4px;transition:width 0.5s;"></div>' +
                '</div>' +
                '<span style="width:30px;font-size:13px;font-weight:600;text-align:right;">' + s.value + '%</span>' +
            '</div>';
        });
        showSheet(i18n.t('pet.personality'), html);
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
            container.innerHTML = '<input type="text" id="petNameInput" placeholder="' + i18n.t('pet.namePlaceholder') + '" value="' + esc(petData ? petData.pet_name : '') + '" maxlength="20" style="width:100%;padding:12px;font-size:16px;border:2px solid #2c2c2c;border-radius:8px;font-family:inherit;background:#1e293b;color:#e2e8f0;">';
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
        // 捏脸关闭按钮
        var closeBtn = $('#customizeClose');
        if (closeBtn) closeBtn.onclick = function () { $('#customizeOverlay').style.display = 'none'; if (customizeRenderer) customizeRenderer.destroy(); };

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
                // 设置待孵化标记，回到主页进行破壳仪式
                localStorage.setItem('pet_needs_hatch', '1');
                $('#customizeOverlay').style.display = 'none';
                if (customizeRenderer) customizeRenderer.destroy();
                window.location.href = '/';
                return;
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
    // iOS Bottom Sheet Helper
    // ============================================================
    function showSheet(title, contentHTML) {
        // 移除旧的 sheet
        var old = document.querySelector('.pet-sheet-overlay');
        if (old) old.remove();

        var overlay = document.createElement('div');
        overlay.className = 'pet-sheet-overlay';
        overlay.innerHTML =
            '<div class="pet-sheet">' +
                '<div class="pet-sheet__handle"></div>' +
                '<div class="pet-sheet__header">' +
                    '<span class="pet-sheet__title">' + title + '</span>' +
                    '<button class="pet-sheet__close">&times;</button>' +
                '</div>' +
                '<div class="pet-sheet__body" id="sheetBody">' + contentHTML + '</div>' +
            '</div>';

        document.body.appendChild(overlay);

        // 关闭
        overlay.querySelector('.pet-sheet__close').onclick = function () { overlay.remove(); };
        overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

        return overlay.querySelector('#sheetBody');
    }

    // ============================================================
    // 商店
    // ============================================================
    var SHOP_CAT_ICONS = {
        food: '<svg style="width:32px;height:32px;color:var(--pet-green);" viewBox="0 0 20 20"><path d="M6 3v14m0-8c-1.5 0-3-1-3-3V3m6 0v3c0 2-1.5 3-3 3m8-6v14m0-14c-1.7 0-3 1.3-3 3v2h3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        hygiene: '<svg style="width:32px;height:32px;color:var(--pet-teal);" viewBox="0 0 20 20"><path d="M10 2l4.5 5.5a6 6 0 11-9 0z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
        toy: '<svg style="width:32px;height:32px;color:var(--pet-orange);" viewBox="0 0 20 20"><path d="M10 2l2.2 4.6L17 7.3l-3.5 3.4.8 4.9L10 13.3 5.7 15.6l.8-4.9L3 7.3l4.8-.7z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>',
    };

    async function openShop() {
        var data = await api('GET', '/api/pet/shop');
        if (!data) return;

        var body = showSheet(i18n.t('pet.shop'), '<div id="shopTabs"></div><div id="shopGrid"></div>');
        var tabsEl = body.querySelector('#shopTabs');
        var gridEl = body.querySelector('#shopGrid');
        tabsEl.className = 'pet-shop-tabs';
        gridEl.className = 'pet-shop-grid';

        var categories = [
            { key: 'food', label: i18n.t('pet.shop.food') },
            { key: 'hygiene', label: i18n.t('pet.shop.hygiene') },
            { key: 'toy', label: i18n.t('pet.shop.toy') }
        ];
        var activeCategory = 'food';

        function renderGrid() {
            gridEl.innerHTML = '';
            data.items.filter(function (i) { return i.category === activeCategory; }).forEach(function (item) {
                var card = document.createElement('div');
                card.className = 'pet-shop-item';
                card.innerHTML =
                    '<div class="pet-shop-item__icon">' + (SHOP_CAT_ICONS[item.category] || SHOP_CAT_ICONS.food) + '</div>' +
                    '<div class="pet-shop-item__name">' + item.name + '</div>' +
                    '<div class="pet-shop-item__effect">' + item.effect_type + ' +' + item.effect_value + '</div>' +
                    '<button class="pet-shop-item__buy"><svg style="width:14px;height:14px;vertical-align:-2px;" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1"/></svg> ' + item.price + '</button>';
                card.querySelector('.pet-shop-item__buy').onclick = function () { purchaseItem(item.id); };
                gridEl.appendChild(card);
            });
        }

        categories.forEach(function (cat) {
            var tab = document.createElement('button');
            tab.className = 'pet-shop-tab' + (cat.key === activeCategory ? ' pet-shop-tab--active' : '');
            tab.textContent = cat.label;
            tab.onclick = function () {
                activeCategory = cat.key;
                tabsEl.querySelectorAll('.pet-shop-tab').forEach(function (t) { t.classList.remove('pet-shop-tab--active'); });
                tab.classList.add('pet-shop-tab--active');
                renderGrid();
            };
            tabsEl.appendChild(tab);
        });
        renderGrid();
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
                // 根据商品类别播放不同动画
                var item = data.item;
                var animMap = {
                    food:    { anim: 'eat',   text: '\u5403\u5403\u5403...' },
                    hygiene: { anim: 'bath',  text: '\u6413\u6413\u6413~' },
                    toy:     { anim: 'dance', text: '\u597D\u5F00\u5FC3\uFF01' },
                };
                var a = (item && animMap[item.category]) || animMap.food;
                if (renderer) renderer.setState(a.anim, 2500, a.text);
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

        var html = '';
        var medalColors = ['#C98A07', '#6B7280', '#A16B34'];
        var medalBgs = ['rgba(255,193,7,0.12)', 'rgba(156,163,175,0.12)', 'rgba(180,120,60,0.12)'];
        (data.leaderboard || []).forEach(function (entry, idx) {
            var rank = idx < 3
                ? '<span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:' + medalBgs[idx] + ';color:' + medalColors[idx] + ';font-weight:700;font-size:13px;">' + (idx + 1) + '</span>'
                : '<span style="display:inline-flex;align-items:center;justify-content:center;min-width:28px;font-size:15px;color:#8E8E93;">' + (idx + 1) + '</span>';
            html += '<div class="pet-grouped__row">' +
                rank +
                '<span style="flex:1;font-size:17px;font-weight:500;">' + esc(entry.display_name || entry.pet_name || 'Unknown') + '</span>' +
                '<span style="font-size:17px;font-weight:600;color:#007AFF;">' + entry.growth + '</span>' +
            '</div>';
        });
        if (!html) html = '<div style="padding:40px;text-align:center;color:#8E8E93;">' + i18n.t('common.noData') + '</div>';

        showSheet(i18n.t('pet.leaderboard'), '<div class="pet-grouped" style="margin:0;">' + html + '</div>');
    }

    // ============================================================
    // 成就
    // ============================================================
    async function openAchievements() {
        var data = await api('GET', '/api/pet/achievements');
        if (!data) return;

        var html = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">';
        (data.achievements || []).forEach(function (a) {
            var unlocked = !!a.unlocked_at;
            html += '<div style="padding:16px 12px;background:' + (unlocked ? 'rgba(52,199,89,0.08)' : 'rgba(0,0,0,0.02)') +
                ';border-radius:14px;text-align:center;opacity:' + (unlocked ? 1 : 0.5) + ';">' +
                '<div style="margin-bottom:6px;">' + (unlocked
                    ? '<svg style="width:32px;height:32px;color:#34C759;" viewBox="0 0 20 20"><path d="M10 2l2.2 4.6L17 7.3l-3.5 3.4.8 4.9L10 13.3 5.7 15.6l.8-4.9L3 7.3l4.8-.7z" fill="currentColor"/></svg>'
                    : '<svg style="width:32px;height:32px;color:#AEAEB2;" viewBox="0 0 20 20"><rect x="4.5" y="9" width="11" height="7.5" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 9V6.5a3 3 0 016 0V9" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>'
                ) + '</div>' +
                '<div style="font-weight:600;font-size:15px;">' + a.name + '</div>' +
                '<div style="font-size:13px;color:#8E8E93;margin-top:3px;">' + a.description + '</div>' +
                (a.reward_coins > 0 ? '<div style="font-size:13px;color:#FF9F0A;margin-top:4px;font-weight:600;"><svg style="width:13px;height:13px;vertical-align:-1px;" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="10" cy="10" r="4" fill="none" stroke="currentColor" stroke-width="1"/></svg> +' + a.reward_coins + '</div>' : '') +
            '</div>';
        });
        html += '</div>';

        showSheet(i18n.t('pet.achievements'), html);
    }

    // ============================================================
    // 金币攻略
    // ============================================================
    async function openCoinGuide() {
        var data = await api('GET', '/api/pet/coin-sources');
        if (!data) return;

        var sources = data.sources || [];
        var dailyCap = data.daily_cap || 0;

        // 分为正收益和扣分
        var earn = sources.filter(function (s) { return s.amount > 0; });
        var lose = sources.filter(function (s) { return s.amount < 0; });

        // 按金额降序排列
        earn.sort(function (a, b) { return b.amount - a.amount; });

        var html = '<div style="margin-bottom:16px;padding:14px 16px;background:linear-gradient(135deg,rgba(255,159,10,0.1),rgba(255,204,0,0.08));border-radius:14px;">' +
            '<div style="font-size:15px;font-weight:700;color:#FF9F0A;">\u6BCF\u65E5\u4E0A\u9650: ' + dailyCap + ' \u5E01</div>' +
            '<div style="font-size:13px;color:#8E8E93;margin-top:4px;">\u8FDE\u7EED\u767B\u5F55\u53EF\u83B7\u5F97\u500D\u7387\u52A0\u6210</div>' +
        '</div>';

        // 赚取金币
        html += '<div style="font-size:15px;font-weight:700;margin-bottom:10px;">\u8D5A\u53D6\u91D1\u5E01</div>';
        earn.forEach(function (s) {
            html += '<div class="pet-grouped__row" style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.04);">' +
                '<span style="flex:1;font-size:15px;">' + esc(s.label) + '</span>' +
                '<span style="font-size:15px;font-weight:700;color:#34C759;">+' + s.amount + '</span>' +
            '</div>';
        });

        // 扣分
        if (lose.length) {
            html += '<div style="font-size:15px;font-weight:700;margin:16px 0 10px;">\u6263\u5206\u9879</div>';
            lose.forEach(function (s) {
                html += '<div class="pet-grouped__row" style="padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.04);">' +
                    '<span style="flex:1;font-size:15px;">' + esc(s.label) + '</span>' +
                    '<span style="font-size:15px;font-weight:700;color:#FF3B30;">' + s.amount + '</span>' +
                '</div>';
            });
        }

        showSheet('\u91D1\u5E01\u653B\u7565', '<div class="pet-grouped" style="margin:0;">' + html + '</div>');
    }

    // ============================================================
    // Chat Panel Toggle
    // ============================================================
    function toggleChatPanel() {
        var panel = $('#chatPanel');
        if (panel.style.display === 'none') {
            panel.style.display = 'flex';
            var input = $('#petChatInput');
            if (input) setTimeout(function () { input.focus(); }, 100);
        } else {
            panel.style.display = 'none';
        }
    }

    // ============================================================
    // 宠物聊天
    // ============================================================
    var chatHistory = [];
    var isChatting = false;

    function initChat() {
        var sendBtn = $('#petChatSend');
        var input = $('#petChatInput');
        if (!sendBtn || !input) return;

        // 欢迎消息
        var welcome = $('#petChatWelcome');
        if (welcome && petData) {
            welcome.textContent = (petData.pet_name || '') + ' ' + i18n.t('pet.chat.welcomeMsg');
        }

        sendBtn.onclick = sendChatMessage;
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    async function sendChatMessage() {
        var input = $('#petChatInput');
        var msg = input ? input.value.trim() : '';
        if (!msg || isChatting) return;

        isChatting = true;
        input.value = '';
        var sendBtn = $('#petChatSend');
        if (sendBtn) sendBtn.disabled = true;

        // 添加用户消息气泡
        addChatBubble(msg, 'user');

        // 添加宠物回复气泡（流式）
        var petBubble = addChatBubble('', 'pet');
        petBubble.classList.add('pet-chat__msg--streaming');

        // 加入 history
        chatHistory.push({ role: 'user', content: msg });

        try {
            var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            var response = await fetch('/api/pet/chat', {
                method: 'POST',
                headers: {
                    'Authorization': 'Bearer ' + token,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: msg,
                    history: chatHistory.slice(-20)
                })
            });

            if (!response.ok) {
                throw new Error('API error ' + response.status);
            }

            var reader = response.body.getReader();
            var decoder = new TextDecoder();
            var fullAnswer = '';

            while (true) {
                var result = await reader.read();
                if (result.done) break;

                var text = decoder.decode(result.value, { stream: true });
                var events = text.split('\n\n');

                for (var i = 0; i < events.length; i++) {
                    var evt = events[i].trim();
                    if (!evt) continue;

                    var lines = evt.split('\n');
                    var eventType = '';
                    var eventData = '';

                    for (var j = 0; j < lines.length; j++) {
                        if (lines[j].startsWith('event: ')) eventType = lines[j].substring(7);
                        if (lines[j].startsWith('data: ')) eventData = lines[j].substring(6);
                    }

                    if (!eventType || !eventData) continue;

                    try {
                        var data = JSON.parse(eventData);

                        if (eventType === 'token') {
                            fullAnswer += data.content || '';
                            petBubble.textContent = fullAnswer;
                            scrollChatToBottom();
                        } else if (eventType === 'done') {
                            fullAnswer = data.full_answer || fullAnswer;
                            petBubble.textContent = fullAnswer;
                            petBubble.classList.remove('pet-chat__msg--streaming');
                            chatHistory.push({ role: 'assistant', content: fullAnswer });
                            // 宠物开心动画
                            if (renderer) renderer.setState('happy', 1500);
                        } else if (eventType === 'error') {
                            petBubble.textContent = data.message || i18n.t('pet.chat.replyFailed');
                            petBubble.className = 'pet-chat__msg pet-chat__msg--error';
                        }
                    } catch (e) {
                        // 解析失败跳过
                    }
                }
            }
        } catch (e) {
            petBubble.textContent = i18n.t('pet.chat.networkError');
            petBubble.className = 'pet-chat__msg pet-chat__msg--error';
        }

        petBubble.classList.remove('pet-chat__msg--streaming');
        isChatting = false;
        if (sendBtn) sendBtn.disabled = false;
        if (input) input.focus();
    }

    function addChatBubble(text, type) {
        var messages = $('#petChatMessages');
        // 隐藏欢迎消息
        var welcome = $('#petChatWelcome');
        if (welcome) welcome.style.display = 'none';

        var bubble = document.createElement('div');
        bubble.className = 'pet-chat__msg pet-chat__msg--' + type;
        bubble.textContent = text;
        messages.appendChild(bubble);
        scrollChatToBottom();
        return bubble;
    }

    function scrollChatToBottom() {
        var messages = $('#petChatMessages');
        if (messages) messages.scrollTop = messages.scrollHeight;
    }

    // ── Bootstrap ──
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
