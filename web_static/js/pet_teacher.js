/**
 * 教師寵物管理面板 — 班級排序 + 全校班級排行
 */
(function () {
    'use strict';

    var currentClass = '';
    var classesData = [];
    var miniRenderers = [];
    var currentSort = 'growth';
    var cachedStudents = [];
    var viewMode = 'class'; // 'class' | 'school'

    function $(sel) { return document.querySelector(sel); }

    async function api(method, path) {
        var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        var res = await fetch(path, { method: method, headers: { 'Authorization': 'Bearer ' + token } });
        if (res.status === 403) { window.location.replace('/'); return null; }
        if (!res.ok) return null;
        return res.json();
    }

    function randomInt(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }

    async function init() {
        var data = await api('GET', '/api/pet/teacher/classes-summary');
        if (!data || !data.classes || !data.classes.length) {
            $('#ptLoading').innerHTML = '<div class="pt-empty"><div class="pt-empty__icon">📭</div><div class="pt-empty__text">暫無班級數據</div></div>';
            return;
        }
        $('#ptLoading').style.display = 'none';
        $('#ptMain').style.display = '';
        classesData = data.classes;

        $('#ptHeroTitle').textContent = '班級寵物管理';
        $('#ptHeroSub').textContent = classesData.length + ' 個班級 · ' + classesData.reduce(function(s, c) { return s + (c.pet_count || 0); }, 0) + ' 隻寵物';

        // 班级 tabs：全校排行 + 各班级
        var tabsEl = $('#ptClassTabs');
        tabsEl.innerHTML = '';

        // "全校排行"按钮
        var schoolBtn = document.createElement('button');
        schoolBtn.className = 'pt-class-tab';
        schoolBtn.textContent = '🏆 全校排行';
        schoolBtn.onclick = function () { showSchoolRanking(); };
        tabsEl.appendChild(schoolBtn);

        // 各班级按钮
        classesData.forEach(function (cls) {
            var btn = document.createElement('button');
            btn.className = 'pt-class-tab';
            btn.textContent = cls.class_name;
            btn.onclick = function () { selectClass(cls.class_name); };
            tabsEl.appendChild(btn);
        });

        // 排序控件
        var sortEl = $('#ptSortBar');
        if (sortEl) {
            sortEl.innerHTML = '';
            var sorts = [
                { key: 'growth', label: '📈 成長' },
                { key: 'coins', label: '💰 金幣' },
                { key: 'care', label: '❤️ 照顧' },
                { key: 'streak', label: '🔥 連續' },
            ];
            sorts.forEach(function (s) {
                var btn = document.createElement('button');
                btn.className = 'pt-sort-btn' + (currentSort === s.key ? ' pt-sort-btn--active' : '');
                btn.textContent = s.label;
                btn.onclick = function () {
                    currentSort = s.key;
                    sortEl.querySelectorAll('.pt-sort-btn').forEach(function (b) { b.classList.remove('pt-sort-btn--active'); });
                    btn.classList.add('pt-sort-btn--active');
                    if (viewMode === 'school') {
                        renderSchoolRanking();
                    } else {
                        renderStudentList();
                    }
                };
                sortEl.appendChild(btn);
            });
        }

        selectClass(classesData[0].class_name);
    }

    // ── 全校班級排行 ──
    function showSchoolRanking() {
        viewMode = 'school';
        updateTabHighlight('🏆 全校排行');
        $('#ptSummary').style.display = 'none';
        $('#ptListTitle').textContent = '全校班級排行';
        renderSchoolRanking();
    }

    function renderSchoolRanking() {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '';

        // 按当前排序维度排列班级
        var sorted = classesData.slice().sort(function (a, b) {
            var va = a['avg_' + currentSort] || 0;
            var vb = b['avg_' + currentSort] || 0;
            return vb - va;
        });

        var medals = ['🥇', '🥈', '🥉'];

        sorted.forEach(function (cls, idx) {
            var card = document.createElement('div');
            card.className = 'pt-student-card';
            card.style.cursor = 'pointer';

            var rank = idx < 3 ? medals[idx] : (idx + 1);
            var rankStyle = idx < 3 ? 'font-size:28px;' : 'font-size:18px;font-weight:700;color:#8E8E93;min-width:40px;text-align:center;';

            card.innerHTML =
                '<div style="' + rankStyle + 'flex-shrink:0;min-width:40px;text-align:center;">' + rank + '</div>' +
                '<div class="pt-student-card__right">' +
                    '<div class="pt-student-card__row1">' +
                        '<span class="pt-student-card__name" style="font-size:18px;">' + cls.class_name + '</span>' +
                        '<span class="pt-student-card__pet-name">' + (cls.pet_count || 0) + '/' + (cls.total_students || 0) + ' 隻寵物</span>' +
                    '</div>' +
                    '<div class="pt-student-card__bars">' +
                        classBar('📈', '成長', cls.avg_growth || 0) +
                        classBar('💰', '金幣', cls.avg_coins || 0) +
                        classBar('❤️', '照顧', cls.avg_care || 0) +
                    '</div>' +
                '</div>';

            card.onclick = function () { selectClass(cls.class_name); };
            listEl.appendChild(card);
        });
    }

    function classBar(icon, label, value) {
        return '<div class="pt-mini-bar"><span>' + icon + '</span>' +
            '<span style="font-size:11px;color:#8E8E93;">' + label + '</span>' +
            '<span style="font-weight:700;min-width:30px;text-align:right;">' + value + '</span></div>';
    }

    // ── 班级学生列表 ──
    function selectClass(className) {
        viewMode = 'class';
        currentClass = className;
        updateTabHighlight(className);

        var cls = classesData.find(function (c) { return c.class_name === className; });
        if (cls) {
            $('#ptSummary').style.display = '';
            $('#ptPetCount').textContent = cls.pet_count || 0;
            $('#ptStudentCount').textContent = cls.total_students || 0;
            $('#ptAvgGrowth').textContent = cls.avg_growth || 0;
            $('#ptAvgCoins').textContent = cls.avg_coins || 0;
            $('#ptAvgCare').textContent = cls.avg_care || 0;
        }

        $('#ptListTitle').textContent = className + ' · 學生排行';
        loadClassPets(className);
    }

    function updateTabHighlight(activeText) {
        document.querySelectorAll('.pt-class-tab').forEach(function (t) {
            t.classList.toggle('pt-class-tab--active', t.textContent === activeText);
        });
    }

    async function loadClassPets(className) {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '<div style="text-align:center;padding:24px;color:#8E8E93;font-size:14px;">載入中...</div>';

        miniRenderers.forEach(function (r) { if (r && r.destroy) r.destroy(); });
        miniRenderers = [];

        var data = await api('GET', '/api/pet/teacher/class-pets?class=' + encodeURIComponent(className));
        if (!data || !data.students || !data.students.length) {
            listEl.innerHTML = '<div class="pt-empty"><div class="pt-empty__icon">🏫</div><div class="pt-empty__text">該班暫無學生</div></div>';
            cachedStudents = [];
            return;
        }

        cachedStudents = data.students;
        renderStudentList();
    }

    function renderStudentList() {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '';
        miniRenderers.forEach(function (r) { if (r && r.destroy) r.destroy(); });
        miniRenderers = [];

        // 排序：有宠物的在前，无宠物的在后
        var sorted = cachedStudents.slice().sort(function (a, b) {
            if (a.has_pet && !b.has_pet) return -1;
            if (!a.has_pet && b.has_pet) return 1;
            if (!a.has_pet && !b.has_pet) return 0;

            var va, vb;
            if (currentSort === 'growth') { va = a.growth || 0; vb = b.growth || 0; }
            else if (currentSort === 'coins') { va = a.coins || 0; vb = b.coins || 0; }
            else if (currentSort === 'care') { va = ((a.hunger||0)+(a.hygiene||0)+(a.mood||0))/3; vb = ((b.hunger||0)+(b.hygiene||0)+(b.mood||0))/3; }
            else if (currentSort === 'streak') { va = a.streak || 0; vb = b.streak || 0; }
            else { va = a.growth || 0; vb = b.growth || 0; }
            return vb - va;
        });

        var medals = ['🥇', '🥈', '🥉'];
        var petRank = 0;

        sorted.forEach(function (s, idx) {
            var card = document.createElement('div');
            card.className = 'pt-student-card';

            if (!s.has_pet) {
                card.innerHTML =
                    '<div style="width:40px;text-align:center;flex-shrink:0;font-size:14px;color:#AEAEB2;">--</div>' +
                    '<div style="width:56px;height:56px;border-radius:12px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0;color:#AEAEB2;">?</div>' +
                    '<div class="pt-student-card__right">' +
                        '<div class="pt-student-card__row1"><span class="pt-student-card__name">' + (s.display_name || '--') + '</span></div>' +
                        '<div class="pt-student-card__no-pet">尚未創建寵物</div>' +
                    '</div>';
            } else {
                petRank++;
                var rankDisplay = petRank <= 3 ? medals[petRank - 1] : petRank;
                var rankStyle = petRank <= 3 ? 'font-size:24px;' : 'font-size:16px;font-weight:700;color:#8E8E93;';

                var stageMap = { egg: '🥚蛋', young: '🐣幼年', adult: '🐉成年' };
                var stageLabel = stageMap[s.stage] || s.stage;
                var lowAttrs = [];
                if ((s.hunger || 0) < 30) lowAttrs.push('飽食');
                if ((s.hygiene || 0) < 30) lowAttrs.push('清潔');
                if ((s.mood || 0) < 30) lowAttrs.push('心情');
                var warningHtml = lowAttrs.length
                    ? '<span class="pt-student-card__warning">⚠ ' + lowAttrs.join('/') + '過低</span>' : '';

                card.innerHTML =
                    '<div style="' + rankStyle + 'flex-shrink:0;min-width:40px;text-align:center;">' + rankDisplay + '</div>' +
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
                    } catch (e) {}
                }
            }
        });
    }

    function miniBar(icon, value, type) {
        var v = value || 0;
        var color = v < 30 ? '#FF3B30' : '';
        return '<div class="pt-mini-bar"><span>' + icon + '</span>' +
            '<div class="pt-mini-bar__track"><div class="pt-mini-bar__fill pt-mini-bar__fill--' + type + '" style="width:' + v + '%;' + (color ? 'background:' + color : '') + '"></div></div>' +
            '<span style="min-width:24px;text-align:right;' + (v < 30 ? 'color:#FF3B30;' : '') + '">' + v + '</span></div>';
    }

    function personalityLabel(p) {
        var map = { scholar: '學者', active: '活躍', linguist: '語言', disciplined: '自律', leader: '榜樣', creative: '創意' };
        return map[p] || p;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
