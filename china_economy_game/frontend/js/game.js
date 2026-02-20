/**
 * 中国经济发展桌游 - 游戏模块
 * 负责游戏界面渲染和用户交互
 * 注意：不包含任何游戏规则计算，所有规则由后端处理
 */

const Game = {
    // 游戏状态（从后端获取）
    state: null,
    roomId: null,
    playerId: null,
    playerName: null,

    // 轮询定时器
    pollTimer: null,

    // 初始化游戏
    async init(roomId, playerId, playerName) {
        this.roomId = roomId;
        this.playerId = playerId;
        this.playerName = playerName;

        try {
            await this.refreshState();
            this.renderBoard();
            this.renderSidebar();
            this.startPolling();
        } catch (error) {
            App.showToast('初始化游戏失败: ' + error.message, 'error');
        }
    },

    // 刷新游戏状态
    async refreshState() {
        try {
            const response = await API.game.getState(this.roomId);
            this.state = response.data;
            this.updateUI();
        } catch (error) {
            console.error('刷新状态失败:', error);
        }
    },

    // 开始轮询
    startPolling() {
        this.stopPolling();
        this.pollTimer = setInterval(() => this.refreshState(), 2000);
    },

    // 停止轮询
    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    },

    // 更新所有UI
    updateUI() {
        this.renderPlayerStatus();
        this.renderTurnInfo();
        this.renderPlayerPositions();
        this.renderFactories();
        this.updateActions();
    },

    // 渲染棋盘
    renderBoard() {
        const boardContainer = document.getElementById('game-board');
        if (!boardContainer || !this.state) return;

        const tiles = this.state.board.tiles;
        boardContainer.innerHTML = '';

        // 棋盘布局：环形排列
        // 创建7x5网格，按环形顺序放置格子
        const gridPositions = this.getGridPositions(tiles.length);

        tiles.forEach((tile, index) => {
            const tileEl = document.createElement('div');
            tileEl.className = `tile ${tile.tile_type.toLowerCase()}`;
            tileEl.dataset.index = index;

            // 设置网格位置
            const pos = gridPositions[index];
            tileEl.style.gridColumn = pos.col;
            tileEl.style.gridRow = pos.row;

            tileEl.innerHTML = `
                <div class="tile-name">${tile.name}</div>
                <div class="tile-city">${tile.city}</div>
            `;

            // 点击事件
            tileEl.addEventListener('click', () => this.onTileClick(tile, index));

            boardContainer.appendChild(tileEl);
        });
    },

    // 获取棋盘网格位置（环形布局）
    getGridPositions(tileCount) {
        // 24格棋盘的环形布局
        const positions = [];

        // 顶部一行 (0-6): col 1-7, row 1
        for (let i = 0; i < 7; i++) {
            positions.push({ col: i + 1, row: 1 });
        }
        // 右侧列 (7-9): col 7, row 2-4
        for (let i = 0; i < 3; i++) {
            positions.push({ col: 7, row: i + 2 });
        }
        // 底部一行反向 (10-16): col 7-1, row 5
        for (let i = 0; i < 7; i++) {
            positions.push({ col: 7 - i, row: 5 });
        }
        // 左侧列 (17-19): col 1, row 4-2
        for (let i = 0; i < 3; i++) {
            positions.push({ col: 1, row: 4 - i });
        }
        // 中间区域（如果有更多格子）
        for (let i = 20; i < tileCount; i++) {
            positions.push({ col: (i % 5) + 2, row: Math.floor(i / 5) + 2 });
        }

        return positions;
    },

    // 渲染玩家位置
    renderPlayerPositions() {
        // 清除所有玩家标记
        document.querySelectorAll('.player-token').forEach(el => el.remove());

        if (!this.state) return;

        const players = Object.values(this.state.players);
        const playerColors = ['p1', 'p2', 'p3', 'p4'];

        players.forEach((player, index) => {
            const tile = document.querySelector(`.tile[data-index="${player.position}"]`);
            if (tile) {
                const token = document.createElement('div');
                token.className = `player-token ${playerColors[index]}`;
                token.title = player.name;
                tile.appendChild(token);
            }
        });
    },

    // 渲染工厂标记
    renderFactories() {
        // 清除所有工厂标记
        document.querySelectorAll('.factory-marker').forEach(el => el.remove());

        if (!this.state || !this.state.factories) return;

        const factories = Object.values(this.state.factories);
        const playerColors = {
            [Object.keys(this.state.players)[0]]: '#e74c3c',
            [Object.keys(this.state.players)[1]]: '#3498db',
            [Object.keys(this.state.players)[2]]: '#2ecc71',
            [Object.keys(this.state.players)[3]]: '#f39c12',
        };

        factories.forEach(factory => {
            const tile = document.querySelector(`.tile[data-index="${factory.tile_index}"]`);
            if (tile) {
                const marker = document.createElement('div');
                marker.className = 'factory-marker';
                marker.style.backgroundColor = playerColors[factory.owner_player_id] || '#fff';
                marker.title = factory.industry_name;
                marker.innerHTML = '🏭';
                tile.appendChild(marker);
            }
        });
    },

    // 渲染侧边栏
    renderSidebar() {
        this.renderPlayerStatus();
        this.renderTurnInfo();
        this.renderEventCard();
    },

    // 渲染玩家状态
    renderPlayerStatus() {
        const container = document.getElementById('player-status-list');
        if (!container || !this.state) return;

        const players = Object.values(this.state.players);
        const currentPlayerId = this.state.turn?.current_player;

        container.innerHTML = players.map(player => `
            <div class="player-status-item ${player.player_id === currentPlayerId ? 'current' : ''}">
                <div>
                    <div class="player-name">${player.name}</div>
                    <div style="font-size: 12px; color: var(--text-secondary);">
                        行动力: ${player.action_points} | 工厂: ${player.factory_count}
                    </div>
                </div>
                <div class="player-money">¥${player.money}</div>
            </div>
        `).join('');
    },

    // 渲染回合信息
    renderTurnInfo() {
        const container = document.getElementById('turn-info');
        if (!container || !this.state) return;

        const turn = this.state.turn;
        const stage = this.state.stage;

        container.innerHTML = `
            <div class="turn-info">
                <div class="round-number">第 ${turn.current_round} 回合</div>
                <div style="margin-top: 5px;">阶段: ${stage.stage_info.name}</div>
                <div style="margin-top: 5px; color: var(--text-secondary);">
                    ${turn.current_phase}
                </div>
            </div>
        `;
    },

    // 渲染事件卡
    renderEventCard() {
        const container = document.getElementById('event-card');
        if (!container) return;

        const eventDeck = this.state?.event_deck;
        if (!eventDeck || !eventDeck.current_event) {
            container.innerHTML = `
                <div class="event-card-display">
                    <div style="color: var(--text-secondary);">等待抽取事件卡</div>
                </div>
            `;
            return;
        }

        const event = eventDeck.current_event;
        container.innerHTML = `
            <div class="event-card-display">
                <div class="event-year">${event.year}</div>
                <div class="event-name">${event.name}</div>
                <div class="event-description">${event.description}</div>
            </div>
        `;
    },

    // 更新可用行动
    async updateActions() {
        const container = document.getElementById('action-panel');
        if (!container) return;

        // 检查是否是当前玩家的回合
        const isMyTurn = this.state?.turn?.current_player === this.playerId;
        const currentPlayer = this.state?.players?.[this.playerId];

        if (!isMyTurn || !currentPlayer) {
            container.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary);">
                    ${isMyTurn ? '加载中...' : '等待其他玩家...'}
                </div>
            `;
            return;
        }

        try {
            const response = await API.game.getActions(this.roomId, this.playerId);
            const actions = response.data.actions;

            if (actions.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center;">
                        <div style="color: var(--text-secondary); margin-bottom: 15px;">
                            没有可用的行动
                        </div>
                        <button class="btn btn-secondary" onclick="Game.endTurn()">
                            结束回合
                        </button>
                    </div>
                `;
                return;
            }

            container.innerHTML = actions.map(action => {
                const icon = this.getActionIcon(action.action);
                return `
                    <button class="btn action-btn" onclick="Game.executeAction('${action.action}', ${JSON.stringify(action)})">
                        <span class="action-icon">${icon}</span>
                        <span>${action.description}</span>
                    </button>
                `;
            }).join('') + `
                <button class="btn btn-secondary action-btn" onclick="Game.endTurn()">
                    <span class="action-icon">⏹</span>
                    <span>结束回合</span>
                </button>
            `;
        } catch (error) {
            console.error('获取行动失败:', error);
        }
    },

    // 获取行动图标
    getActionIcon(actionType) {
        const icons = {
            'MOVE': '👣',
            'BUILD_FACTORY': '🏭',
            'USE_TRANSPORT': '🚂'
        };
        return icons[actionType] || '▶';
    },

    // 执行行动
    async executeAction(actionType, actionData) {
        try {
            switch (actionType) {
                case 'MOVE':
                    await this.doMove();
                    break;
                case 'BUILD_FACTORY':
                    this.showBuildModal(actionData.available_industries);
                    break;
                case 'USE_TRANSPORT':
                    this.showTransportModal(actionData.destinations);
                    break;
            }
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 移动
    async doMove() {
        try {
            const result = await API.game.move(this.roomId, this.playerId);
            App.showToast(`移动到 ${result.data.tile?.name || '新位置'}`, 'success');
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 显示建厂模态框
    showBuildModal(industries) {
        const modal = document.getElementById('build-modal');
        const list = document.getElementById('industry-list');

        list.innerHTML = industries.map(ind => `
            <div class="industry-item ${!ind.can_build ? 'disabled' : ''}"
                 data-industry-id="${ind.industry_id}"
                 onclick="${ind.can_build ? `Game.selectIndustry('${ind.industry_id}')` : ''}">
                <div class="industry-name">${ind.name}</div>
                <div class="industry-stats">
                    ${ind.can_build ? '可以建设' : ind.reason}
                </div>
            </div>
        `).join('');

        modal.classList.add('active');
    },

    // 选择产业
    async selectIndustry(industryId) {
        try {
            const result = await API.game.build(this.roomId, this.playerId, industryId);
            App.showToast(`成功建设 ${result.data.industry?.name}`, 'success');
            document.getElementById('build-modal').classList.remove('active');
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 显示运输模态框
    showTransportModal(destinations) {
        const modal = document.getElementById('transport-modal');
        const list = document.getElementById('transport-list');

        list.innerHTML = destinations.map(dest => `
            <div class="transport-item" onclick="Game.selectTransport(${dest.index})">
                <div class="transport-name">${dest.name}</div>
                <div class="transport-type">${dest.transport_type === 'RAILWAY' ? '🚂 铁路' : '🚢 海运'}</div>
            </div>
        `).join('');

        modal.classList.add('active');
    },

    // 选择运输目的地
    async selectTransport(destinationIndex) {
        try {
            const result = await API.game.transport(this.roomId, this.playerId, destinationIndex);
            App.showToast(`到达 ${result.data.to_tile}`, 'success');
            document.getElementById('transport-modal').classList.remove('active');
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 结束回合
    async endTurn() {
        try {
            await API.game.endTurn(this.roomId, this.playerId);
            App.showToast('回合结束', 'info');
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 抽取事件卡
    async drawEventCard() {
        try {
            const result = await API.game.drawEvent(this.roomId);
            const event = result.data.event;
            if (event) {
                App.showToast(`事件: ${event.name}`, 'info');
            }
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 开始新回合
    async startNewRound() {
        try {
            await API.game.startRound(this.roomId);
            await this.refreshState();
        } catch (error) {
            App.showToast(error.message, 'error');
        }
    },

    // 格子点击事件
    onTileClick(tile, index) {
        console.log('点击格子:', tile, index);
        // 可以显示格子详情
    },

    // 清理
    destroy() {
        this.stopPolling();
        this.state = null;
        this.roomId = null;
    }
};

// 导出
window.Game = Game;
