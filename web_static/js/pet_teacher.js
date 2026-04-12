/**
 * 教师宠物管理面板 — 精致版
 */
(function () {
    'use strict';

    var currentClass = '';
    var classesData = [];
    var miniRenderers = [];

    function $(sel) { return document.querySelector(sel); }

    async function api(method, path) {
        var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        var res = await fetch(path, {
            method: method,
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (res.status === 403) { window.location.replace('/'); return null; }
        if (!res.ok) return null;
        return res.json();
    }

    async function init() {
        var data = await api('GET', '/api/pet/teacher/classes-summary');
        if (!data || !data.classes || !data.classes.length) {
            $('#ptLoading').innerHTML =
                '<div class="pt-empty"><div class="pt-empty__icon">📭</div>' +
                '<div class="pt-empty__text">暂无班级数据</div></div>';
            return;
        }
        $('#ptLoading').style.display = 'none';
        $('#ptMain').style.display = '';
        classesData = data.classes;

        // Hero 更新
        $('#ptHeroTitle').textContent = '班级宠物管理';
        $('#ptHeroSub').textContent = classesData.length + ' 个班级 · 点击班级查看详情';

        // 班级 tabs
        var tabsEl = $('#ptClassTabs');
        tabsEl.innerHTML = '';
        classesData.forEach(function (cls) {
            var btn = document.createElement('button');
            btn.className = 'pt-class-tab';
            btn.textContent = cls.class_name;
            btn.onclick = function () { selectClass(cls.class_name); };
            tabsEl.appendChild(btn);
        });

        selectClass(classesData[0].class_name);
    }

    function selectClass(className) {
        currentClass = className;

        document.querySelectorAll('.pt-class-tab').forEach(function (t) {
            t.classList.toggle('pt-class-tab--active', t.textContent === className);
        });

        var cls = classesData.find(function (c) { return c.class_name === className; });
        if (cls) {
            $('#ptPetCount').textContent = cls.pet_count || 0;
            $('#ptStudentCount').textContent = cls.total_students || 0;
            $('#ptAvgGrowth').textContent = cls.avg_growth || 0;
            $('#ptAvgCoins').textContent = cls.avg_coins || 0;
            $('#ptAvgCare').textContent = cls.avg_care || 0;
        }

        $('#ptListTitle').textContent = className + ' · 学生列表';
        loadClassPets(className);
    }

    async function loadClassPets(className) {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#8E8E93;font-size:14px;">载入中...</div>';

        miniRenderers.forEach(function (r) { if (r && r.destroy) r.destroy(); });
        miniRenderers = [];

        var data = await api('GET', '/api/pet/teacher/class-pets?class=' + encodeURIComponent(className));
        if (!data || !data.students || !data.students.length) {
            listEl.innerHTML = '<div class="pt-empty"><div class="pt-empty__icon">🏫</div><div class="pt-empty__text">该班暂无学生</div></div>';
            return;
        }

        listEl.innerHTML = '';

        data.students.forEach(function (s, idx) {
            var card = document.createElement('div');
            card.className = 'pt-student-card';

            if (!s.has_pet) {
                card.innerHTML =
                    '<div style="width:56px;height:56px;border-radius:12px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;color:#AEAEB2;">?</div>' +
                    '<div class="pt-student-card__right">' +
                        '<div class="pt-student-card__row1">' +
                            '<span class="pt-student-card__name">' + (s.display_name || '--') + '</span>' +
                        '</div>' +
                        '<div class="pt-student-card__no-pet">尚未创建宠物</div>' +
                    '</div>';
            } else {
                var stageMap = { egg: '🥚 蛋', young: '🐣 幼年', adult: '🐉 成年' };
                var stageLabel = stageMap[s.stage] || s.stage;
                var lowAttrs = [];
                if ((s.hunger || 0) < 30) lowAttrs.push('饱食');
                if ((s.hygiene || 0) < 30) lowAttrs.push('清洁');
                if ((s.mood || 0) < 30) lowAttrs.push('心情');
                var warningHtml = lowAttrs.length
                    ? '<span class="pt-student-card__warning">⚠ ' + lowAttrs.join('/') + '过低</span>'
                    : '';

                card.innerHTML =
                    '<canvas id="ptCanvas' + idx + '" width="256" height="256" class="pt-student-card__canvas"></canvas>' +
                    '<div class="pt-student-card__right">' +
                        '<div class="pt-student-card__row1">' +
                            '<span class="pt-student-card__name">' + (s.display_name || '--') + '</span>' +
                            '<span class="pt-student-card__pet-name">' + (s.pet_name || '') + '</span>' +
                            '<span class="pt-student-card__stage">' + stageLabel + '</span>' +
                            warningHtml +
                        '</div>' +
                        '<div class="pt-student-card__bars">' +
                            miniBar('🍖', s.hunger, 'hunger') +
                            miniBar('🧼', s.hygiene, 'hygiene') +
                            miniBar('😊', s.mood, 'mood') +
                        '</div>' +
                        '<div class="pt-student-card__meta">' +
                            '<span>💰 ' + (s.coins || 0) + '</span>' +
                            '<span>🔥 ' + (s.streak || 0) + '天</span>' +
                            '<span>📈 ' + (s.growth || 0) + '</span>' +
                            (s.personality ? '<span>🧬 ' + personalityLabel(s.personality) + '</span>' : '') +
                        '</div>' +
                    '</div>';
            }

            listEl.appendChild(card);

            if (s.has_pet) {
                var canvas = document.getElementById('ptCanvas' + idx);
                if (canvas && window.PetRenderer) {
                    try {
                        var r = PetRenderer.create(canvas, s, { mini: true });
                        miniRenderers.push(r);
                    } catch (e) { /* ignore render errors */ }
                }
            }
        });
    }

    function miniBar(icon, value, type) {
        var v = value || 0;
        var color = v < 30 ? '#FF3B30' : '';
        return '<div class="pt-mini-bar">' +
            '<span>' + icon + '</span>' +
            '<div class="pt-mini-bar__track">' +
                '<div class="pt-mini-bar__fill pt-mini-bar__fill--' + type + '" style="width:' + v + '%;' + (color ? 'background:' + color : '') + '"></div>' +
            '</div>' +
            '<span style="min-width:24px;text-align:right;' + (v < 30 ? 'color:#FF3B30;' : '') + '">' + v + '</span>' +
        '</div>';
    }

    function personalityLabel(p) {
        var map = {
            scholar: '学者', active: '活跃', linguist: '语言',
            disciplined: '自律', leader: '榜样', creative: '创意'
        };
        return map[p] || p;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
