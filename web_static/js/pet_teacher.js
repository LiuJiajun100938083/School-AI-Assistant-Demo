/**
 * 教师宠物管理面板 — 按班级查看学生宠物
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
        // 加载班级汇总
        var data = await api('GET', '/api/pet/teacher/classes-summary');
        if (!data || !data.classes || !data.classes.length) {
            $('#ptLoading').textContent = '暂无班级数据';
            return;
        }
        $('#ptLoading').style.display = 'none';
        classesData = data.classes;

        // 渲染班级 tabs
        var tabsEl = $('#ptClassTabs');
        tabsEl.style.display = '';
        tabsEl.innerHTML = '';
        classesData.forEach(function (cls) {
            var btn = document.createElement('button');
            btn.className = 'pt-class-tab';
            btn.textContent = cls.class_name;
            btn.onclick = function () { selectClass(cls.class_name); };
            tabsEl.appendChild(btn);
        });

        // 默认选第一个
        selectClass(classesData[0].class_name);
    }

    function selectClass(className) {
        currentClass = className;

        // 更新 tab 高亮
        var tabs = document.querySelectorAll('.pt-class-tab');
        tabs.forEach(function (t) {
            t.classList.toggle('pt-class-tab--active', t.textContent === className);
        });

        // 更新汇总卡片
        var cls = classesData.find(function (c) { return c.class_name === className; });
        if (cls) {
            $('#ptSummary').style.display = '';
            $('#ptPetCount').textContent = cls.pet_count || 0;
            $('#ptStudentCount').textContent = cls.total_students || 0;
            $('#ptAvgGrowth').textContent = cls.avg_growth || 0;
            $('#ptAvgCoins').textContent = cls.avg_coins || 0;
        }

        // 加载学生列表
        loadClassPets(className);
    }

    async function loadClassPets(className) {
        var listEl = $('#ptStudentList');
        listEl.style.display = '';
        listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#8E8E93;">载入中...</div>';

        // 销毁旧的迷你渲染器
        miniRenderers.forEach(function (r) { r.destroy(); });
        miniRenderers = [];

        var data = await api('GET', '/api/pet/teacher/class-pets?class=' + encodeURIComponent(className));
        if (!data || !data.students) {
            listEl.innerHTML = '<div style="text-align:center;padding:20px;color:#8E8E93;">无数据</div>';
            return;
        }

        listEl.innerHTML = '';
        var students = data.students;

        students.forEach(function (s, idx) {
            var card = document.createElement('div');
            card.className = 'pt-student-card';

            if (!s.has_pet) {
                // 未创建宠物
                card.innerHTML =
                    '<div class="pt-student-card__name">' + (s.display_name || '--') + '</div>' +
                    '<div class="pt-student-card__no-pet">尚未创建宠物</div>';
            } else {
                // 有宠物
                var stageLabel = { egg: '🥚蛋', young: '🐣幼年', adult: '🐉成年' }[s.stage] || s.stage;
                var careAvg = Math.round(((s.hunger || 0) + (s.hygiene || 0) + (s.mood || 0)) / 3);
                var lowWarning = (s.hunger < 30 || s.hygiene < 30 || s.mood < 30);

                card.innerHTML =
                    '<div class="pt-student-card__left">' +
                        '<canvas id="ptPetCanvas' + idx + '" width="256" height="256" class="pt-student-card__canvas"></canvas>' +
                    '</div>' +
                    '<div class="pt-student-card__right">' +
                        '<div class="pt-student-card__header">' +
                            '<span class="pt-student-card__name">' + (s.display_name || '--') + '</span>' +
                            '<span class="pt-student-card__pet-name">' + (s.pet_name || '') + '</span>' +
                            '<span class="pt-student-card__stage">' + stageLabel + '</span>' +
                        '</div>' +
                        '<div class="pt-student-card__stats">' +
                            '<span>🍖 ' + (s.hunger || 0) + '</span>' +
                            '<span>🧼 ' + (s.hygiene || 0) + '</span>' +
                            '<span>😊 ' + (s.mood || 0) + '</span>' +
                            '<span>💰 ' + (s.coins || 0) + '</span>' +
                            '<span>🔥 ' + (s.streak || 0) + '天</span>' +
                            '<span>📈 ' + (s.growth || 0) + '</span>' +
                        '</div>' +
                        (lowWarning ? '<div class="pt-student-card__warning">⚠️ 属性过低，需要照顾！</div>' : '') +
                    '</div>';
            }

            listEl.appendChild(card);

            // 渲染迷你宠物 canvas
            if (s.has_pet) {
                var canvas = document.getElementById('ptPetCanvas' + idx);
                if (canvas && window.PetRenderer) {
                    var r = PetRenderer.create(canvas, s, { mini: true });
                    miniRenderers.push(r);
                }
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
