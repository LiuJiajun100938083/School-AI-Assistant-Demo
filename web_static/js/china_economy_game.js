/**
 * 粤港澳大湾区经济桌游 - 前端应用
 * 所有游戏规则由后端处理，前端只负责显示和交互
 *
 * 地图画布: 100x60单位
 * 城市坐标: 按规格文档定义，不允许修改
 *
 * 移动系统: 玩家只能移动到相邻城市（通过路线连接）
 */

const GameApp = {
    // 配置
    API_BASE: '/api/china_game',

    // 状态
    playerId: null,
    playerName: '',
    playerColor: '#e74c3c',
    roomId: null,
    gameState: null,
    pollTimer: null,

    // 城市坐标映射（粤港澳大湾区 - 100x60单位画布）
    // 坐标来自规格文档，不允许修改
    cityCoords: {
        'zhaoqing': { x: 15, y: 15 },    // 肇庆 - 西北内陆
        'jiangmen': { x: 20, y: 35 },    // 江门 - 内陆偏南
        'foshan': { x: 30, y: 20 },      // 佛山 - 中部偏西
        'guangzhou': { x: 45, y: 15 },   // 广州 - 中枢节点
        'zhongshan': { x: 35, y: 40 },   // 中山 - 中部偏南
        'dongguan': { x: 55, y: 25 },    // 东莞 - 中东部
        'huizhou': { x: 65, y: 15 },     // 惠州 - 东北
        'shenzhen': { x: 70, y: 30 },    // 深圳 - 东南
        'zhuhai': { x: 35, y: 50 },      // 珠海 - 南部沿海
        'macau': { x: 45, y: 52 },       // 澳门 - 海域节点
        'hongkong': { x: 75, y: 45 }     // 香港 - 东南沿海
    },

    // 城市中文名映射
    cityNames: {
        'zhaoqing': '肇庆',
        'jiangmen': '江门',
        'foshan': '佛山',
        'guangzhou': '广州',
        'zhongshan': '中山',
        'dongguan': '东莞',
        'huizhou': '惠州',
        'shenzhen': '深圳',
        'zhuhai': '珠海',
        'macau': '澳门',
        'hongkong': '香港'
    },

    // ==================== 初始化 ====================

    async init() {
        // 要求登录才能使用游戏
        const authToken = localStorage.getItem('auth_token');

        if (authToken) {
            try {
                const response = await fetch('/api/profile', {
                    headers: { 'Authorization': `Bearer ${authToken}` }
                });
                if (response.ok) {
                    const userInfo = await response.json();
                    this.playerId = 'user_' + userInfo.username;
                    this.playerName = userInfo.nickname || userInfo.real_name || userInfo.username;
                    console.log('已登录用户:', this.playerId, '显示名称:', this.playerName);
                } else {
                    console.warn('Token验证失败，请重新登录');
                    alert('登录已过期，请重新登录');
                    window.location.href = '/';
                    return;
                }
            } catch (error) {
                console.error('获取用户信息失败:', error);
                alert('获取用户信息失败，请重新登录');
                window.location.href = '/';
                return;
            }
        } else {
            alert('请先登录');
            window.location.href = '/';
            return;
        }

        // 初始化UI
        this.initUI();

        // 隐藏加载画面
        setTimeout(() => {
            const loading = document.getElementById('loadingScreen');
            loading.classList.add('fade-out');
            setTimeout(() => loading.style.display = 'none', 500);
        }, 2000);
    },

    // 访客模式：生成一个基于浏览器的唯一ID
    useGuestMode() {
        // 使用 sessionStorage 确保同一标签页保持同一ID，不同标签页/窗口有不同ID
        let guestId = sessionStorage.getItem('game_guest_id');
        if (!guestId) {
            guestId = 'guest_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
            sessionStorage.setItem('game_guest_id', guestId);
        }
        this.playerId = guestId;
        this.playerName = '访客' + guestId.substr(-4);
        console.log('访客模式:', this.playerId);
    },

    initUI() {
        // 设置玩家名称输入
        const nameInput = document.getElementById('playerNameInput');
        if (nameInput && this.playerName) {
            nameInput.value = this.playerName;
        }

        // 头像选择
        document.querySelectorAll('.avatar-option').forEach(opt => {
            opt.addEventListener('click', (e) => {
                document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
                this.playerColor = e.target.dataset.color;
            });
        });

        // 绑定游戏按钮事件（确保iPad触摸兼容）
        this.bindGameButtons();

        // 显示大厅
        this.showView('lobbyView');
        this.refreshRooms();

        // 检查是否需要显示教程
        if (!localStorage.getItem('game_tutorial_completed')) {
            // 首次进入，可以选择稍后显示教程
        }
    },

    // 绑定游戏操作按钮事件
    bindGameButtons() {
        const self = this;

        // 结束回合按钮 - 使用事件监听器确保iPad兼容性
        const btnEndTurn = document.getElementById('btnEndTurn');
        if (btnEndTurn) {
            // 移除可能存在的旧监听器
            btnEndTurn.replaceWith(btnEndTurn.cloneNode(true));
            const newBtnEndTurn = document.getElementById('btnEndTurn');
            newBtnEndTurn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                console.log('结束回合按钮被点击 (事件监听器)');
                self.endTurn();
            });
            // 添加触摸事件支持
            newBtnEndTurn.addEventListener('touchend', function(e) {
                if (!this.disabled) {
                    e.preventDefault();
                    console.log('结束回合按钮被触摸 (touchend)');
                    self.endTurn();
                }
            });
        }

        // 移动按钮
        const btnMove = document.getElementById('btnMove');
        if (btnMove) {
            btnMove.replaceWith(btnMove.cloneNode(true));
            const newBtnMove = document.getElementById('btnMove');
            newBtnMove.addEventListener('click', function(e) {
                e.preventDefault();
                if (!this.disabled) self.rollDice();
            });
        }

        // 建厂按钮
        const btnBuild = document.getElementById('btnBuild');
        if (btnBuild) {
            btnBuild.replaceWith(btnBuild.cloneNode(true));
            const newBtnBuild = document.getElementById('btnBuild');
            newBtnBuild.addEventListener('click', function(e) {
                e.preventDefault();
                if (!this.disabled) self.showBuildPanel();
            });
        }

        // 运输按钮
        const btnTransport = document.getElementById('btnTransport');
        if (btnTransport) {
            btnTransport.replaceWith(btnTransport.cloneNode(true));
            const newBtnTransport = document.getElementById('btnTransport');
            newBtnTransport.addEventListener('click', function(e) {
                e.preventDefault();
                if (!this.disabled) self.showTransportPanel();
            });
        }

        // 退出游戏按钮
        const btnQuitGame = document.getElementById('btnQuitGame');
        if (btnQuitGame) {
            btnQuitGame.replaceWith(btnQuitGame.cloneNode(true));
            const newBtnQuitGame = document.getElementById('btnQuitGame');
            newBtnQuitGame.addEventListener('click', function(e) {
                e.preventDefault();
                self.quitGame();
            });
        }

        console.log('游戏按钮事件已绑定');
    },

    // ==================== 教程系统 ====================

    tutorialStep: 0,
    tutorialTotalSteps: 6,

    showTutorial() {
        this.tutorialStep = 0;
        this.updateTutorialUI();
        document.getElementById('tutorialModal').classList.remove('hidden');
    },

    updateTutorialUI() {
        // 更新步骤点
        document.querySelectorAll('.step-dot').forEach((dot, index) => {
            dot.classList.remove('active', 'completed');
            if (index < this.tutorialStep) {
                dot.classList.add('completed');
            } else if (index === this.tutorialStep) {
                dot.classList.add('active');
            }
        });

        // 更新页面显示
        document.querySelectorAll('.tutorial-page').forEach((page, index) => {
            page.classList.toggle('active', index === this.tutorialStep);
        });

        // 更新按钮
        const prevBtn = document.getElementById('tutorialPrevBtn');
        const nextBtn = document.getElementById('tutorialNextBtn');
        const startBtn = document.getElementById('tutorialStartBtn');

        prevBtn.style.display = this.tutorialStep > 0 ? 'block' : 'none';
        nextBtn.style.display = this.tutorialStep < this.tutorialTotalSteps - 1 ? 'block' : 'none';
        startBtn.style.display = this.tutorialStep === this.tutorialTotalSteps - 1 ? 'block' : 'none';
    },

    nextTutorialStep() {
        if (this.tutorialStep < this.tutorialTotalSteps - 1) {
            this.tutorialStep++;
            this.updateTutorialUI();
        }
    },

    prevTutorialStep() {
        if (this.tutorialStep > 0) {
            this.tutorialStep--;
            this.updateTutorialUI();
        }
    },

    skipTutorial() {
        this.saveTutorialPreference();
        document.getElementById('tutorialModal').classList.add('hidden');
    },

    finishTutorial() {
        this.saveTutorialPreference();
        document.getElementById('tutorialModal').classList.add('hidden');
        this.showToast('教程完成！祝你游戏愉快！', 'success');
    },

    saveTutorialPreference() {
        if (document.getElementById('dontShowTutorial').checked) {
            localStorage.setItem('game_tutorial_completed', 'true');
        }
    },

    // ==================== 视图管理 ====================

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        const view = document.getElementById(viewId);
        if (view) {
            view.classList.remove('hidden');
        }
    },

    // ==================== API 调用 ====================

    async api(method, endpoint, data = null) {
        const headers = { 'Content-Type': 'application/json' };
        const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const options = {
            method,
            headers
        };
        if (data) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(this.API_BASE + endpoint, options);
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.detail || '请求失败');
            }
            return result;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // ==================== 大厅功能 ====================

    async refreshRooms() {
        const container = document.getElementById('roomList');
        container.innerHTML = '<div class="empty-rooms"><p>加载中...</p></div>';

        try {
            const result = await this.api('GET', '/lobby/rooms');
            const rooms = result.data?.rooms || [];

            if (rooms.length === 0) {
                container.innerHTML = '<div class="empty-rooms"><p>暂无房间，创建一个开始游戏吧！</p></div>';
                return;
            }

            container.innerHTML = rooms.map(room => {
                const isHost = room.host_player_id === this.playerId;
                const isInRoom = room.players.includes(this.playerId);
                const statusText = room.status === 'WAITING' ? '等待中' : '游戏中';

                let buttons = '';
                if (room.can_join) {
                    buttons += `<button class="btn-primary" onclick="GameApp.joinRoom('${room.room_id}')">加入</button>`;
                }
                if (isInRoom && room.status === 'IN_GAME') {
                    buttons += `<button class="btn-success" onclick="GameApp.rejoinGame('${room.room_id}')">重新进入</button>`;
                }
                if (isHost) {
                    buttons += `<button class="btn-danger" onclick="GameApp.deleteRoomFromLobby('${room.room_id}')">删除</button>`;
                }

                return `
                    <div class="room-item ${isInRoom ? 'my-room' : ''}">
                        <div class="room-info">
                            <h4>房间 #${room.room_id} ${isHost ? '👑' : ''}</h4>
                            <span>${room.player_count}/${room.max_players} 玩家 | ${statusText}</span>
                        </div>
                        <div class="room-buttons">${buttons}</div>
                    </div>
                `;
            }).join('');
        } catch (error) {
            container.innerHTML = '<div class="empty-rooms"><p>加载失败，请重试</p></div>';
            this.showToast(error.message, 'error');
        }
    },

    async createRoom() {
        this.savePlayerName();

        try {
            const result = await this.api('POST', '/lobby/rooms', {
                player_id: this.playerId,
                player_name: this.playerName,
                max_players: 4
            });

            this.roomId = result.data.room_id;
            this.showToast('房间创建成功！', 'success');
            this.showRoom(result.data);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async joinRoom(roomId) {
        this.savePlayerName();

        try {
            const result = await this.api('POST', `/lobby/rooms/${roomId}/join`, {
                player_id: this.playerId,
                player_name: this.playerName
            });

            this.roomId = roomId;
            this.showToast('成功加入房间！', 'success');
            this.showRoom(result.data);
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    savePlayerName() {
        const input = document.getElementById('playerNameInput');
        if (input && input.value.trim()) {
            // 允许用户自定义显示名称，但保持playerId不变
            this.playerName = input.value.trim();
        }
        // playerName 已在 init() 中从用户资料获取
    },

    // ==================== 房间功能 ====================

    showRoom(roomData) {
        this.showView('roomView');
        this.updateRoom(roomData);
        this.startRoomPolling();
    },

    updateRoom(room) {
        document.getElementById('roomIdDisplay').textContent = '#' + room.room_id;

        const isHost = room.host_player_id === this.playerId;

        // 显示/隐藏房主按钮
        const startBtn = document.getElementById('startGameBtn');
        const deleteBtn = document.getElementById('deleteRoomBtn');

        startBtn.style.display = isHost ? 'block' : 'none';
        startBtn.disabled = !room.can_start;

        if (deleteBtn) {
            deleteBtn.style.display = isHost ? 'block' : 'none';
        }

        // 渲染玩家
        const grid = document.getElementById('playersGrid');
        grid.innerHTML = room.players.map(pid => {
            const name = room.player_names[pid] || pid;
            const isHostPlayer = pid === room.host_player_id;
            return `
                <div class="player-card ${isHostPlayer ? 'host' : ''}">
                    <div class="player-avatar">👤</div>
                    <div class="player-name">${name}</div>
                    ${isHostPlayer ? '<span class="host-badge">房主</span>' : ''}
                </div>
            `;
        }).join('');

        // 检查游戏是否开始
        if (room.status === 'IN_GAME') {
            this.stopRoomPolling();
            this.enterGame();
        }
    },

    startRoomPolling() {
        this.stopRoomPolling();
        this.pollTimer = setInterval(() => this.pollRoom(), 2000);
    },

    stopRoomPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    },

    async pollRoom() {
        if (!this.roomId) return;

        try {
            const result = await this.api('GET', `/lobby/rooms/${this.roomId}`);
            if (result.data) {
                this.updateRoom(result.data);
            }
        } catch (error) {
            console.error('Poll room error:', error);
        }
    },

    async leaveRoom() {
        if (!this.roomId) return;

        try {
            await this.api('POST', `/lobby/rooms/${this.roomId}/leave`, {
                player_id: this.playerId
            });
            this.roomId = null;
            this.stopRoomPolling();
            this.showView('lobbyView');
            this.refreshRooms();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async deleteRoom() {
        if (!this.roomId) return;

        if (!confirm('确定要删除这个房间吗？所有玩家都会被移出。')) {
            return;
        }

        try {
            await this.api('POST', `/lobby/rooms/${this.roomId}/delete`, {
                player_id: this.playerId
            });
            this.showToast('房间已删除', 'success');
            this.roomId = null;
            this.stopRoomPolling();
            this.showView('lobbyView');
            this.refreshRooms();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async quitGame() {
        if (!this.roomId) return;

        if (!confirm('确定要退出游戏吗？')) {
            return;
        }

        try {
            const result = await this.api('POST', `/lobby/rooms/${this.roomId}/quit`, {
                player_id: this.playerId
            });
            this.showToast('已退出游戏', 'info');
            this.roomId = null;
            this.gameState = null;
            this.stopRoomPolling();
            this.showView('lobbyView');
            this.refreshRooms();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // 从大厅重新进入游戏
    async rejoinGame(roomId) {
        this.roomId = roomId;
        this.enterGame();
    },

    // 从大厅删除房间
    async deleteRoomFromLobby(roomId) {
        if (!confirm('确定要删除这个房间吗？')) {
            return;
        }

        try {
            await this.api('POST', `/lobby/rooms/${roomId}/delete`, {
                player_id: this.playerId
            });
            this.showToast('房间已删除', 'success');
            this.refreshRooms();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async startGame() {
        if (!this.roomId) return;

        try {
            await this.api('POST', `/lobby/rooms/${this.roomId}/start`, {
                player_id: this.playerId
            });
            this.enterGame();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // ==================== 游戏功能 ====================

    async enterGame() {
        this.stopRoomPolling();
        this.showView('gameView');
        await this.refreshGameState();
        this.startGamePolling();
    },

    startGamePolling() {
        this.stopRoomPolling();
        this.pollTimer = setInterval(() => this.refreshGameState(), 2000);
    },

    async refreshGameState() {
        if (!this.roomId) return;

        try {
            const result = await this.api('GET', `/game/${this.roomId}/state`);
            this.gameState = result.data;
            this.renderGame();
        } catch (error) {
            console.error('Refresh game error:', error);
        }
    },

    renderGame() {
        if (!this.gameState) return;

        this.renderTimeline();
        this.renderEventCard();
        this.renderTurnInfo();
        this.renderPlayerTokens();
        this.renderFactories();
        this.renderPlayerRanking();
        this.renderMyStatus();
        this.updateStageSlots();
        this.updateActionButtons();
    },

    renderTimeline() {
        // 根据事件年份更新时间轴
        const eventDeck = this.gameState.event_deck;
        if (eventDeck?.current_event) {
            const year = eventDeck.current_event.year;
            document.querySelectorAll('.timeline-item').forEach(item => {
                const itemYear = parseInt(item.dataset.year);
                item.classList.remove('active', 'passed');
                if (itemYear === year) {
                    item.classList.add('active');
                } else if (itemYear > year) {
                    item.classList.add('passed');
                }
            });
        }
    },

    renderEventCard() {
        const card = document.getElementById('currentEventCard');
        const event = this.gameState.event_deck?.current_event;

        if (event) {
            card.innerHTML = `
                <div class="event-year">${event.year}</div>
                <div class="event-title">${event.name}</div>
                <div class="event-desc">${event.description}</div>
            `;
        } else {
            card.innerHTML = `
                <div class="event-year">?</div>
                <div class="event-title">游戏开始</div>
                <div class="event-desc">等待事件卡...</div>
            `;
        }
    },

    renderTurnInfo() {
        const turn = this.gameState.turn;
        const stage = this.gameState.stage;

        document.getElementById('currentRound').textContent = `第 ${turn.current_round} 回合`;
        document.getElementById('currentStage').textContent = stage.stage_info?.name || '第一阶段';

        const currentPlayerId = turn.current_player;
        const currentPlayer = this.gameState.players[currentPlayerId];
        document.getElementById('currentPlayer').textContent = currentPlayer?.name || '-';
    },

    renderPlayerTokens() {
        const container = document.getElementById('playerTokens');
        container.innerHTML = '';

        const players = Object.values(this.gameState.players);
        const defaultColors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12'];

        // 统计每个城市的玩家数量，用于偏移
        const cityPlayerCounts = {};

        players.forEach((player, index) => {
            // 玩家位置现在直接是城市ID（字符串）
            const cityId = player.position;
            const coords = this.cityCoords[cityId];

            if (coords) {
                // 计算同一城市的玩家偏移
                if (!cityPlayerCounts[cityId]) {
                    cityPlayerCounts[cityId] = 0;
                }
                const playerIndexInCity = cityPlayerCounts[cityId];
                cityPlayerCounts[cityId]++;

                // 调整偏移量适应100x60画布（每个玩家棋子稍微分开）
                const offsetX = (playerIndexInCity % 2) * 3 - 1.5;
                const offsetY = Math.floor(playerIndexInCity / 2) * 3 - 1.5;

                const x = coords.x + offsetX;
                const y = coords.y + offsetY;
                const color = player.color || defaultColors[index % defaultColors.length];
                const darkerColor = this.darkenColor(color, 30);

                // 创建大富翁风格的棋子
                const pawn = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                pawn.classList.add('player-pawn');
                pawn.setAttribute('data-player', player.player_id);

                // 棋子由底座、身体、头部组成
                pawn.innerHTML = `
                    <!-- 阴影 -->
                    <ellipse cx="${x}" cy="${y + 1.8}" rx="1.2" ry="0.4" fill="rgba(0,0,0,0.3)"/>
                    <!-- 底座 -->
                    <ellipse cx="${x}" cy="${y + 1.5}" rx="1.3" ry="0.5" fill="${darkerColor}"/>
                    <!-- 身体（圆锥形） -->
                    <path d="M${x - 1},${y + 1.5} Q${x - 1.2},${y} ${x},${y - 1} Q${x + 1.2},${y} ${x + 1},${y + 1.5} Z" fill="${color}" class="pawn-body"/>
                    <!-- 身体高光 -->
                    <path d="M${x - 0.3},${y + 1} Q${x - 0.5},${y} ${x},${y - 0.5} Q${x + 0.2},${y + 0.3} ${x - 0.3},${y + 1} Z" fill="rgba(255,255,255,0.3)"/>
                    <!-- 头部 -->
                    <circle cx="${x}" cy="${y - 1.5}" r="0.8" fill="${color}" class="pawn-head"/>
                    <!-- 头部高光 -->
                    <circle cx="${x - 0.2}" cy="${y - 1.7}" r="0.25" fill="rgba(255,255,255,0.4)"/>
                    <!-- 边框 -->
                    <circle cx="${x}" cy="${y - 1.5}" r="0.8" fill="none" stroke="${darkerColor}" stroke-width="0.1"/>
                    <!-- 玩家名字 -->
                    <text x="${x}" y="${y - 3}" class="pawn-name" fill="white" stroke="black" stroke-width="0.3" paint-order="stroke">${player.name}</text>
                `;

                container.appendChild(pawn);
            }
        });
    },

    // 颜色加深函数
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max((num >> 16) - amt, 0);
        const G = Math.max((num >> 8 & 0x00FF) - amt, 0);
        const B = Math.max((num & 0x0000FF) - amt, 0);
        return '#' + (0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1);
    },

    renderFactories() {
        const container = document.getElementById('factoryMarkers');
        container.innerHTML = '';

        const factories = Object.values(this.gameState.factories || {});
        const players = this.gameState.players;

        // 统计每个城市的工厂数量，用于偏移
        const cityFactoryCounts = {};

        factories.forEach((factory, fIndex) => {
            // 工厂位置现在直接是城市ID
            const cityId = factory.city;
            const coords = this.cityCoords[cityId];

            if (coords) {
                // 计算同一城市的工厂偏移
                if (!cityFactoryCounts[cityId]) {
                    cityFactoryCounts[cityId] = 0;
                }
                const factoryIndexInCity = cityFactoryCounts[cityId];
                cityFactoryCounts[cityId]++;

                // 工厂标记放在城市节点旁边，多个工厂依次排列
                const offsetX = 3 + (factoryIndexInCity % 3) * 1.5;
                const offsetY = -2 + Math.floor(factoryIndexInCity / 3) * 2;

                const ownerPlayer = players[factory.owner_player_id];
                const color = ownerPlayer?.color || '#666';

                const marker = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                marker.classList.add('factory-marker');
                marker.setAttribute('x', coords.x + offsetX);
                marker.setAttribute('y', coords.y + offsetY);
                marker.setAttribute('fill', color);
                marker.setAttribute('font-size', '2');
                marker.textContent = '🏭';
                container.appendChild(marker);
            }
        });
    },

    renderPlayerRanking() {
        const container = document.getElementById('playerRanking');
        const players = Object.values(this.gameState.players)
            .sort((a, b) => b.money - a.money);

        container.innerHTML = players.map((player, index) => `
            <div class="ranking-item ${player.player_id === this.playerId ? 'me' : ''}">
                <span class="rank-num">${index + 1}</span>
                <span style="flex:1">${player.name}</span>
                <span style="color:var(--gold)">¥${player.money}</span>
            </div>
        `).join('');
    },

    renderMyStatus() {
        const me = this.gameState.players[this.playerId];
        if (!me) return;

        document.getElementById('myMoney').textContent = `¥${me.money}`;
        document.getElementById('myActionPoints').textContent = `${me.action_points}/2`;
        document.getElementById('myFactories').textContent = me.factory_count || 0;

        // 显示当前位置
        const currentCity = this.cityNames[me.position] || me.position;
        const positionEl = document.getElementById('myPosition');
        if (positionEl) {
            positionEl.textContent = currentCity;
        }
    },

    updateStageSlots() {
        const currentStage = this.gameState.stage?.current_stage || 1;

        document.querySelectorAll('.stage-slot').forEach(slot => {
            const stage = parseInt(slot.dataset.stage);
            slot.classList.remove('active', 'locked');

            if (stage <= currentStage) {
                if (stage === currentStage) {
                    slot.classList.add('active');
                }
                const lock = slot.querySelector('.lock-overlay');
                if (lock) lock.style.display = 'none';
            } else {
                slot.classList.add('locked');
            }
        });
    },

    updateActionButtons() {
        const turn = this.gameState.turn;
        const isMyTurn = turn.current_player === this.playerId;
        const me = this.gameState.players[this.playerId];
        const hasActions = me && me.action_points > 0;

        // 更新页面上的调试信息
        const debugMyId = document.getElementById('debugMyId');
        const debugCurrentPlayer = document.getElementById('debugCurrentPlayer');
        const debugIsMyTurn = document.getElementById('debugIsMyTurn');
        const debugMyActions = document.getElementById('debugMyActions');

        if (debugMyId) debugMyId.textContent = this.playerId;
        if (debugCurrentPlayer) debugCurrentPlayer.textContent = turn.current_player + ' (' + (turn.current_player_name || '未知') + ')';
        if (debugIsMyTurn) {
            debugIsMyTurn.textContent = isMyTurn ? '✅ 是' : '❌ 否';
            debugIsMyTurn.style.color = isMyTurn ? '#2ecc71' : '#e74c3c';
        }
        if (debugMyActions) debugMyActions.textContent = me ? me.action_points : '找不到玩家数据!';

        // 获取各个按钮
        const btnMove = document.getElementById('btnMove');
        const btnBuild = document.getElementById('btnBuild');
        const btnTransport = document.getElementById('btnTransport');
        const btnEndTurn = document.getElementById('btnEndTurn');
        const btnQuitGame = document.getElementById('btnQuitGame');

        // 需要行动点的按钮
        if (btnMove) btnMove.disabled = !isMyTurn || !hasActions;
        if (btnBuild) btnBuild.disabled = !isMyTurn || !hasActions;
        if (btnTransport) btnTransport.disabled = !isMyTurn || !hasActions;

        // 结束回合按钮 - 只要是我的回合就可用
        if (btnEndTurn) {
            btnEndTurn.disabled = !isMyTurn;
            console.log('结束回合按钮状态:', isMyTurn ? '启用' : '禁用', 'disabled=', btnEndTurn.disabled);
        }

        // 退出游戏按钮始终可用
        if (btnQuitGame) btnQuitGame.disabled = false;
    },

    // ==================== 游戏行动 ====================

    // 移动按钮 - 显示可移动的目的地
    async rollDice() {
        await this.showMovePanel();
    },

    // 显示移动面板（选择目的地）
    async showMovePanel() {
        if (!this.roomId) return;

        try {
            const result = await this.api('GET', `/game/${this.roomId}/player/${this.playerId}/actions`);
            const actions = result.data?.actions || [];
            const moveAction = actions.find(a => a.action === 'MOVE');

            if (!moveAction || !moveAction.destinations || moveAction.destinations.length === 0) {
                this.showToast('当前无法移动', 'warning');
                return;
            }

            // 显示移动选项
            const list = document.getElementById('moveOptions');
            if (!list) {
                // 如果没有移动面板，使用transportOptions作为替代
                this.showMoveInTransportPanel(moveAction.destinations);
                return;
            }

            list.innerHTML = moveAction.destinations.map(dest => `
                <div class="move-item" onclick="GameApp.doMove('${dest.city_id}')">
                    <span class="city-name">🏙️ ${dest.city_name}</span>
                    <span class="route-type">${dest.route_type}</span>
                </div>
            `).join('');

            document.getElementById('movePanel').classList.remove('hidden');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // 使用运输面板显示移动选项（备用方案）
    showMoveInTransportPanel(destinations) {
        const list = document.getElementById('transportOptions');
        list.innerHTML = destinations.map(dest => `
            <div class="transport-item" onclick="GameApp.doMove('${dest.city_id}')">
                <span>🚗 ${dest.city_name}</span>
                <span style="color:var(--text-secondary)">${dest.route_type}</span>
            </div>
        `).join('');

        document.getElementById('transportPanel').classList.remove('hidden');
    },

    closeMovePanel() {
        const panel = document.getElementById('movePanel');
        if (panel) {
            panel.classList.add('hidden');
        }
        // 也关闭运输面板（如果用于移动）
        document.getElementById('transportPanel').classList.add('hidden');
    },

    // 执行移动到指定城市
    async doMove(destinationCity) {
        if (!this.roomId) return;

        try {
            const result = await this.api('POST', `/game/${this.roomId}/action/move`, {
                player_id: this.playerId,
                destination: destinationCity
            });
            const toName = result.data?.to_name || this.cityNames[destinationCity] || destinationCity;
            this.showToast(`移动到 ${toName}`, 'success');
            this.closeMovePanel();
            await this.refreshGameState();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async showBuildPanel() {
        if (!this.roomId) return;

        try {
            const result = await this.api('GET', `/game/${this.roomId}/player/${this.playerId}/actions`);
            const actions = result.data?.actions || [];
            const buildAction = actions.find(a => a.action === 'BUILD_FACTORY');

            if (!buildAction) {
                this.showToast('当前位置不能建厂', 'warning');
                return;
            }

            const list = document.getElementById('industryOptions');
            list.innerHTML = buildAction.available_industries.map(ind => `
                <div class="industry-item ${!ind.can_build ? 'disabled' : ''}"
                     onclick="${ind.can_build ? `GameApp.doBuild('${ind.industry_id}')` : ''}">
                    <div class="industry-header">
                        <span class="industry-name">
                            ${this.getIndustryIcon(ind.name)} ${ind.name}
                        </span>
                        <span class="industry-category">${ind.can_build ? (ind.free_build ? '免费建造' : '可建') : ind.reason}</span>
                    </div>
                    <div class="industry-stats">
                        <span>收入: ¥${ind.base_income || '?'}</span>
                        <span>同业: +${ind.synergy_bonus || '?'}</span>
                    </div>
                </div>
            `).join('');

            // 显示当前城市名称
            const cityName = buildAction.city || '';
            const panelTitle = document.querySelector('#buildPanel h3');
            if (panelTitle) {
                panelTitle.textContent = `建立工厂 - ${cityName}`;
            }

            document.getElementById('buildPanel').classList.remove('hidden');
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    getIndustryIcon(name) {
        const icons = {
            '食品': '🍞', '家具': '🪑', '纺织及成衣': '👕',
            '家电及电器': '📺', '重工': '⚙️', '石油化工': '🛢️',
            '医药': '💊', '旅游及文化': '🎭', '金融': '🏦', '高新技术': '💻'
        };
        return icons[name] || '🏭';
    },

    closeBuildPanel() {
        document.getElementById('buildPanel').classList.add('hidden');
    },

    async doBuild(industryId) {
        if (!this.roomId) return;

        try {
            const result = await this.api('POST', `/game/${this.roomId}/action/build`, {
                player_id: this.playerId,
                industry_id: industryId
            });
            const msg = result.data?.free_build
                ? `免费建设 ${result.data?.industry?.name}（特区优惠）`
                : `成功建设 ${result.data?.industry?.name}`;
            this.showToast(msg, 'success');
            this.closeBuildPanel();
            await this.refreshGameState();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async showTransportPanel() {
        // 现在移动统一使用 showMovePanel
        await this.showMovePanel();
    },

    closeTransportPanel() {
        document.getElementById('transportPanel').classList.add('hidden');
    },

    async endTurn() {
        console.log('=== endTurn 被调用 ===');

        // 立即显示反馈，让用户知道按钮被点击了
        this.showToast('正在结束回合...', 'info');

        if (!this.roomId) {
            console.log('没有 roomId，返回');
            this.showToast('游戏尚未开始', 'error');
            return;
        }

        // 禁用按钮防止重复点击
        const btnEndTurn = document.getElementById('btnEndTurn');
        if (btnEndTurn) btnEndTurn.disabled = true;

        try {
            console.log('发送结束回合请求...');
            const result = await this.api('POST', `/game/${this.roomId}/action/end-turn`, {
                player_id: this.playerId
            });
            console.log('结束回合结果:', result);

            if (result.data?.round_ended) {
                // 显示收入结算信息
                const report = result.data.income_report;
                if (report) {
                    const myReport = report[this.playerId];
                    if (myReport && myReport.total_income > 0) {
                        this.showToast(`回合结算: 收入 ¥${myReport.total_income}，余额 ¥${myReport.new_money}`, 'success');
                    } else {
                        this.showToast('回合结束，等待下一回合', 'info');
                    }
                }
            } else {
                this.showToast(`轮到 ${result.data?.next_player_name || '下一位玩家'}`, 'info');
            }

            await this.refreshGameState();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    async startNewRound() {
        if (!this.roomId) return;

        try {
            const result = await this.api('POST', `/game/${this.roomId}/turn/next`);
            const event = result.data?.event;
            if (event) {
                this.showToast(`${event.year}年: ${event.name}`, 'info');
            }
            await this.refreshGameState();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    showLeaderboard() {
        // 已经在右侧面板显示了
        this.showToast('排行榜在右侧面板', 'info');
    },

    exitGame() {
        if (confirm('确定要退出游戏吗？')) {
            this.stopRoomPolling();
            this.roomId = null;
            this.gameState = null;
            this.showView('lobbyView');
            this.refreshRooms();
        }
    },

    // ==================== 工具方法 ====================

    showToast(message, type = 'info') {
        const toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = `toast ${type}`;
        toast.classList.remove('hidden');

        setTimeout(() => {
            toast.classList.add('hidden');
        }, 3000);
    }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    GameApp.init();
});

// 导出
window.GameApp = GameApp;
