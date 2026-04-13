/**
 * 教師寵物管理面板 — 畫廊 + 排行雙視圖
 */
(function () {
    'use strict';

    var currentClass = '';
    var classesData = [];
    var miniRenderers = [];
    var cachedStudents = [];
    var currentView = 'gallery'; // 'gallery' | 'rank'

    var $ = function (sel) { return document.querySelector(sel); };

    async function api(path) {
        var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        var res = await fetch(path, { headers: { 'Authorization': 'Bearer ' + token } });
        if (res.status === 403) { window.location.replace('/'); return null; }
        if (!res.ok) return null;
        return res.json();
    }

    async function init() {
        var data = await api('/api/pet/teacher/classes-summary');
        if (!data || !data.classes || !data.classes.length) {
            $('#ptLoading').innerHTML = '<div class="pt-empty"><div class="pt-empty__icon">📭</div><div>暫無班級數據</div></div>';
            return;
        }
        $('#ptLoading').style.display = 'none';
        $('#ptMain').style.display = '';
        classesData = data.classes;

        var totalPets = classesData.reduce(function (s, c) { return s + (c.pet_count || 0); }, 0);
        $('#ptHeroTitle').textContent = '班級寵物管理';
        $('#ptHeroSub').textContent = classesData.length + ' 個班級 · ' + totalPets + ' 隻寵物';

        // Tabs: 全校 + 各班
        var tabsEl = $('#ptClassTabs');
        tabsEl.innerHTML = '';
        var schoolBtn = document.createElement('button');
        schoolBtn.className = 'pt-class-tab';
        schoolBtn.textContent = '🏆 全校排行';
        schoolBtn.onclick = function () { showSchoolRank(); };
        tabsEl.appendChild(schoolBtn);

        classesData.forEach(function (cls) {
            var btn = document.createElement('button');
            btn.className = 'pt-class-tab';
            btn.textContent = cls.class_name;
            btn.onclick = function () { selectClass(cls.class_name); };
            tabsEl.appendChild(btn);
        });

        selectClass(classesData[0].class_name);
    }

    // ── 视图切换 ──
    window.setView = function (v) {
        currentView = v;
        $('#ptViewGallery').classList.toggle('pt-view-btn--active', v === 'gallery');
        $('#ptViewRank').classList.toggle('pt-view-btn--active', v === 'rank');
        renderStudents();
    };

    function highlightTab(text) {
        document.querySelectorAll('.pt-class-tab').forEach(function (t) {
            t.classList.toggle('pt-class-tab--active', t.textContent === text);
        });
    }

    // ── 全校班級排行 ──
    function showSchoolRank() {
        highlightTab('🏆 全校排行');
        $('#ptSummary').style.display = 'none';
        document.querySelector('.pt-view-toggle').style.display = 'none';

        var listEl = $('#ptStudentList');
        listEl.innerHTML = '';
        var sorted = classesData.slice().sort(function (a, b) { return (b.avg_growth || 0) - (a.avg_growth || 0); });
        var medals = ['🥇', '🥈', '🥉'];

        sorted.forEach(function (cls, idx) {
            var card = document.createElement('div');
            card.className = 'pt-rank-card';
            card.style.animationDelay = (idx * 60) + 'ms';
            card.style.cursor = 'pointer';
            card.innerHTML =
                '<div class="pt-rank__num" style="' + (idx < 3 ? 'font-size:28px;' : 'font-weight:700;color:#8E8E93;') + '">' + (idx < 3 ? medals[idx] : (idx + 1)) + '</div>' +
                '<div style="flex:1;">' +
                    '<div style="font-size:17px;font-weight:700;margin-bottom:4px;">' + cls.class_name + '</div>' +
                    '<div style="display:flex;gap:12px;font-size:13px;color:#64748B;">' +
                        '<span>🐾 ' + (cls.pet_count || 0) + '/' + (cls.total_students || 0) + '</span>' +
                        '<span>📈 ' + (cls.avg_growth || 0) + '</span>' +
                        '<span>💰 ' + (cls.avg_coins || 0) + '</span>' +
                        '<span>❤️ ' + (cls.avg_care || 0) + '</span>' +
                    '</div>' +
                '</div>';
            card.onclick = function () { selectClass(cls.class_name); };
            listEl.appendChild(card);
        });
    }

    // ── 班級學生 ──
    function selectClass(className) {
        currentClass = className;
        highlightTab(className);
        $('#ptSummary').style.display = '';
        document.querySelector('.pt-view-toggle').style.display = '';

        var cls = classesData.find(function (c) { return c.class_name === className; });
        if (cls) {
            $('#ptPetCount').textContent = cls.pet_count || 0;
            $('#ptStudentCount').textContent = cls.total_students || 0;
            $('#ptAvgGrowth').textContent = cls.avg_growth || 0;
            $('#ptAvgCoins').textContent = cls.avg_coins || 0;
            $('#ptAvgCare').textContent = cls.avg_care || 0;
        }
        loadClassPets(className);
    }

    async function loadClassPets(className) {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '<div style="text-align:center;padding:40px;color:#8E8E93;">載入中...</div>';
        destroyRenderers();

        var data = await api('/api/pet/teacher/class-pets?class=' + encodeURIComponent(className));
        if (!data || !data.students || !data.students.length) {
            listEl.innerHTML = '<div class="pt-empty"><div class="pt-empty__icon">🏫</div><div>該班暫無學生</div></div>';
            cachedStudents = [];
            return;
        }
        cachedStudents = data.students;
        renderStudents();
    }

    function renderStudents() {
        if (currentView === 'gallery') renderGallery();
        else renderRankList();
    }

    // ── 畫廊視圖 ──
    function renderGallery() {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '';
        listEl.className = 'pt-gallery';
        destroyRenderers();

        cachedStudents.forEach(function (s, idx) {
            var card = document.createElement('div');
            card.className = 'pt-pet-card' + (s.has_pet ? '' : ' pt-pet-card--no-pet');
            card.style.animationDelay = (idx * 50) + 'ms';

            if (!s.has_pet) {
                card.innerHTML =
                    '<div class="pt-pet-card__canvas-wrap"><div class="pt-pet-card__placeholder">?</div></div>' +
                    '<div class="pt-pet-card__name">' + (s.display_name || '--') + '</div>' +
                    '<div style="font-size:12px;color:#AEAEB2;margin-top:4px;">尚未創建寵物</div>';
            } else {
                var stageMap = { egg: '🥚', young: '🐣', adult: '🐉' };
                var low = (s.hunger < 30 || s.hygiene < 30 || s.mood < 30);

                card.innerHTML =
                    '<div class="pt-pet-card__canvas-wrap"><canvas id="ptGC' + idx + '" width="256" height="256"></canvas></div>' +
                    '<div class="pt-pet-card__name">' + (s.display_name || '--') + '</div>' +
                    '<div class="pt-pet-card__pet-name">' + (stageMap[s.stage] || '') + ' ' + (s.pet_name || '') + '</div>' +
                    '<div class="pt-pet-card__stats">' +
                        '<span>🍖' + (s.hunger || 0) + '</span>' +
                        '<span>🧼' + (s.hygiene || 0) + '</span>' +
                        '<span>😊' + (s.mood || 0) + '</span>' +
                    '</div>' +
                    '<div class="pt-pet-card__meta">' +
                        '<span>💰' + (s.coins || 0) + '</span>' +
                        '<span>🔥' + (s.streak || 0) + '天</span>' +
                        '<span>📈' + (s.growth || 0) + '</span>' +
                    '</div>' +
                    (low ? '<div class="pt-pet-card__warning">⚠ 需要照顧</div>' : '');
            }

            if (s.has_pet) {
                card.style.cursor = 'pointer';
                card.onclick = (function (student) { return function () { openCoinModal(student); }; })(s);
            }

            listEl.appendChild(card);

            if (s.has_pet) {
                var c = document.getElementById('ptGC' + idx);
                if (c && window.PetRenderer) {
                    try { miniRenderers.push(PetRenderer.create(c, s, { mini: true })); } catch (e) {}
                }
            }
        });
    }

    // ── 排行榜視圖 ──
    function renderRankList() {
        var listEl = $('#ptStudentList');
        listEl.innerHTML = '';
        listEl.className = '';
        destroyRenderers();

        var sorted = cachedStudents.slice().sort(function (a, b) {
            if (a.has_pet && !b.has_pet) return -1;
            if (!a.has_pet && b.has_pet) return 1;
            return (b.growth || 0) - (a.growth || 0);
        });

        var medals = ['🥇', '🥈', '🥉'];
        var petRank = 0;

        sorted.forEach(function (s, idx) {
            var card = document.createElement('div');
            card.className = 'pt-rank-card';
            card.style.animationDelay = (idx * 40) + 'ms';

            if (!s.has_pet) {
                card.innerHTML =
                    '<div class="pt-rank__num" style="color:#AEAEB2;">--</div>' +
                    '<div style="width:48px;height:48px;border-radius:14px;background:#F1F5F9;display:flex;align-items:center;justify-content:center;font-size:20px;color:#AEAEB2;flex-shrink:0;">?</div>' +
                    '<div class="pt-rank__info"><div class="pt-rank__name">' + (s.display_name || '--') + '</div><div style="font-size:12px;color:#AEAEB2;">尚未創建寵物</div></div>';
            } else {
                petRank++;
                var rankDisplay = petRank <= 3 ? medals[petRank - 1] : petRank;

                card.innerHTML =
                    '<div class="pt-rank__num" style="' + (petRank <= 3 ? 'font-size:26px;' : 'font-weight:700;color:#8E8E93;') + '">' + rankDisplay + '</div>' +
                    '<canvas id="ptRC' + idx + '" width="256" height="256" class="pt-rank__canvas"></canvas>' +
                    '<div class="pt-rank__info">' +
                        '<div class="pt-rank__row1">' +
                            '<span class="pt-rank__name">' + (s.display_name || '--') + '</span>' +
                            '<span class="pt-rank__pet">' + (s.pet_name || '') + '</span>' +
                        '</div>' +
                        '<div class="pt-rank__bars">' +
                            '<span>🍖' + (s.hunger || 0) + '</span>' +
                            '<span>🧼' + (s.hygiene || 0) + '</span>' +
                            '<span>😊' + (s.mood || 0) + '</span>' +
                        '</div>' +
                        '<div class="pt-rank__meta">' +
                            '<span>💰' + (s.coins || 0) + '</span>' +
                            '<span>🔥' + (s.streak || 0) + '天</span>' +
                            '<span>📈' + (s.growth || 0) + '</span>' +
                        '</div>' +
                    '</div>';
            }

            if (s.has_pet) {
                card.style.cursor = 'pointer';
                card.onclick = (function (student) { return function () { openCoinModal(student); }; })(s);
            }

            listEl.appendChild(card);

            if (s.has_pet) {
                var c = document.getElementById('ptRC' + idx);
                if (c && window.PetRenderer) {
                    try { miniRenderers.push(PetRenderer.create(c, s, { mini: true })); } catch (e) {}
                }
            }
        });
    }

    function destroyRenderers() {
        miniRenderers.forEach(function (r) { if (r && r.destroy) r.destroy(); });
        miniRenderers = [];
    }

    // ── 金币加减模态框 ──
    var coinModalTarget = null;

    function openCoinModal(student) {
        coinModalTarget = student;
        var modal = document.getElementById('ptCoinModal');
        var target = document.getElementById('ptCoinTarget');
        target.innerHTML = '<strong>' + (student.display_name || '--') + '</strong>' +
            (student.pet_name ? ' (' + student.pet_name + ')' : '') +
            '<br><span style="font-size:13px;">当前金币: 💰 ' + (student.coins || 0) + '</span>';

        // 重置状态
        document.getElementById('ptCoinAmount').value = '';
        document.getElementById('ptCoinReason').value = '';
        document.querySelectorAll('.pt-modal__preset').forEach(function (b) { b.classList.remove('active'); });
        document.getElementById('ptCoinConfirm').disabled = false;

        modal.style.display = '';
    }

    function closeCoinModal() {
        document.getElementById('ptCoinModal').style.display = 'none';
        coinModalTarget = null;
    }

    function initCoinModal() {
        var modal = document.getElementById('ptCoinModal');
        if (!modal) return;

        // 关闭
        document.getElementById('ptCoinCancel').onclick = closeCoinModal;
        modal.addEventListener('click', function (e) { if (e.target === modal) closeCoinModal(); });

        // 预设按钮
        document.getElementById('ptCoinPresets').addEventListener('click', function (e) {
            var btn = e.target.closest('.pt-modal__preset');
            if (!btn) return;
            document.querySelectorAll('.pt-modal__preset').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.getElementById('ptCoinAmount').value = btn.getAttribute('data-val');
        });

        // 自定义输入清除预设高亮
        document.getElementById('ptCoinAmount').addEventListener('input', function () {
            document.querySelectorAll('.pt-modal__preset').forEach(function (b) { b.classList.remove('active'); });
        });

        // 确认
        document.getElementById('ptCoinConfirm').onclick = async function () {
            var amount = parseInt(document.getElementById('ptCoinAmount').value, 10);
            var reason = document.getElementById('ptCoinReason').value.trim();

            if (!amount || amount === 0) { alert('请输入金额'); return; }
            if (!reason) { alert('请输入原因'); return; }
            if (!coinModalTarget) return;

            var confirmBtn = document.getElementById('ptCoinConfirm');
            confirmBtn.disabled = true;
            confirmBtn.textContent = '处理中...';

            try {
                var token = localStorage.getItem('auth_token') || localStorage.getItem('token');
                var res = await fetch('/api/pet/admin/award-coins', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({
                        target_type: 'students',
                        student_ids: [coinModalTarget.user_id],
                        amount: amount,
                        reason: reason
                    })
                });
                var data = await res.json();
                if (res.ok && data.success > 0) {
                    closeCoinModal();
                    // 刷新当前班级数据
                    if (currentClass) loadClassPets(currentClass);
                } else {
                    alert('操作失败: ' + (data.detail || data.message || JSON.stringify(data.details || [])));
                    confirmBtn.disabled = false;
                }
            } catch (err) {
                alert('请求失败: ' + err.message);
                confirmBtn.disabled = false;
            }
            confirmBtn.textContent = '确认';
        };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { init(); initCoinModal(); });
    } else {
        init();
        initCoinModal();
    }
})();
