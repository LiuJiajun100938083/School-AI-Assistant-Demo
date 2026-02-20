/**
 * 中国经济发展桌游 - 主应用模块
 * 负责界面切换、大厅管理、房间管理
 */

const App = {
    // 当前玩家信息
    playerId: null,
    playerName: null,

    // 当前房间信息
    currentRoom: null,

    // 轮询定时器
    roomPollTimer: null,

    // 初始化应用
    init() {
        // 从本地存储恢复玩家信息
        this.playerId = localStorage.getItem('playerId') || this.generatePlayerId();
        this.playerName = localStorage.getItem('playerName') || '';

        // 显示玩家ID（调试用）
        console.log('Player ID:', this.playerId);

        // 检查是否需要设置名称
        if (!this.playerName) {
            this.showNameModal();
        } else {
            this.updatePlayerDisplay();
            this.showLobby();
        }

        // 绑定事件
        this.bindEvents();
    },

    // 生成玩家ID
    generatePlayerId() {
        const id = 'player_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('playerId', id);
        return id;
    },

    // 绑定事件
    bindEvents() {
        // 模态框关闭按钮
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });

        // 点击模态框外部关闭
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    },

    // 更新玩家显示
    updatePlayerDisplay() {
        const nameEl = document.getElementById('current-player-name');
        if (nameEl) {
            nameEl.textContent = this.playerName;
        }
    },

    // 显示设置名称模态框
    showNameModal() {
        const modal = document.getElementById('name-modal');
        modal.classList.add('active');
    },

    // 设置玩家名称
    setPlayerName() {
        const input = document.getElementById('player-name-input');
        const name = input.value.trim();

        if (!name) {
            this.showToast('请输入玩家名称', 'error');
            return;
        }

        this.playerName = name;
        localStorage.setItem('playerName', name);

        document.getElementById('name-modal').classList.remove('active');
        this.updatePlayerDisplay();
        this.showLobby();
    },

    // ==================== 视图切换 ====================

    showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
        document.getElementById(viewId)?.classList.remove('hidden');
    },

    // ==================== 大厅 ====================

    async showLobby() {
        this.showView('lobby-view');
        this.stopRoomPolling();
        await this.refreshRooms();
    },

    async refreshRooms() {
        const container = document.getElementById('room-list');
        container.innerHTML = '<div class="loading"></div>';

        try {
            const response = await API.lobby.getRooms(false);
            const rooms = response.data.rooms;

            if (rooms.length === 0) {
                container.innerHTML = `
                    <div style="text-align: center; padding: 50px; color: var(--text-secondary);">
                        <p>暂无房间</p>
                        <p>点击"创建房间"开始游戏</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = rooms.map(room => `
                <div class="room-card" data-room-id="${room.room_id}">
                    <div class="room-id">房间 #${room.room_id}</div>
                    <div class="room-host">房主: ${room.player_names[room.host_player_id] || '未知'}</div>
                    <div class="room-players">
                        <span class="player-count">${room.player_count}/${room.max_players}</span>
                        <span>玩家</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="room-status ${room.status.toLowerCase()}">${room.status === 'WAITING' ? '等待中' : '游戏中'}</span>
                        ${room.can_join ? `
                            <button class="btn btn-primary" onclick="App.joinRoom('${room.room_id}')">
                                加入
                            </button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        } catch (error) {
            container.innerHTML = `
                <div style="text-align: center; padding: 50px; color: var(--danger-color);">
                    <p>加载失败</p>
                    <button class="btn btn-secondary" onclick="App.refreshRooms()">重试</button>
                </div>
            `;
        }
    },

    // 显示创建房间模态框
    showCreateRoomModal() {
        const modal = document.getElementById('create-room-modal');
        modal.classList.add('active');
    },

    // 创建房间
    async createRoom() {
        const maxPlayers = parseInt(document.getElementById('max-players-select').value) || 4;

        try {
            const response = await API.lobby.createRoom(this.playerId, this.playerName, maxPlayers);
            this.currentRoom = response.data;
            document.getElementById('create-room-modal').classList.remove('active');
            this.showToast('房间创建成功', 'success');
            this.showRoom();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // 加入房间
    async joinRoom(roomId) {
        try {
            const response = await API.lobby.joinRoom(roomId, this.playerId, this.playerName);
            this.currentRoom = response.data;
            this.showToast('成功加入房间', 'success');
            this.showRoom();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // ==================== 房间等待界面 ====================

    showRoom() {
        this.showView('room-view');
        this.renderRoom();
        this.startRoomPolling();
    },

    renderRoom() {
        if (!this.currentRoom) return;

        const room = this.currentRoom;
        const isHost = room.host_player_id === this.playerId;

        // 房间信息
        document.getElementById('room-title').textContent = `房间 #${room.room_id}`;

        // 玩家列表
        const playerList = document.getElementById('room-player-list');
        playerList.innerHTML = room.players.map(pid => {
            const name = room.player_names[pid] || pid;
            const isHostPlayer = pid === room.host_player_id;
            return `
                <li>
                    <span>${name}</span>
                    ${isHostPlayer ? '<span class="host-badge">房主</span>' : ''}
                </li>
            `;
        }).join('');

        // 按钮
        const startBtn = document.getElementById('start-game-btn');
        const leaveBtn = document.getElementById('leave-room-btn');

        startBtn.classList.toggle('hidden', !isHost);
        startBtn.disabled = !room.can_start;

        // 检查游戏是否已开始
        if (room.status === 'IN_GAME') {
            this.enterGame();
        }
    },

    // 开始轮询房间状态
    startRoomPolling() {
        this.stopRoomPolling();
        this.roomPollTimer = setInterval(() => this.refreshRoom(), 2000);
    },

    // 停止轮询
    stopRoomPolling() {
        if (this.roomPollTimer) {
            clearInterval(this.roomPollTimer);
            this.roomPollTimer = null;
        }
    },

    // 刷新房间状态
    async refreshRoom() {
        if (!this.currentRoom) return;

        try {
            const response = await API.lobby.getRoom(this.currentRoom.room_id);
            if (response.data) {
                this.currentRoom = response.data;
                this.renderRoom();
            } else {
                // 房间不存在了
                this.showToast('房间已解散', 'info');
                this.showLobby();
            }
        } catch (error) {
            console.error('刷新房间失败:', error);
        }
    },

    // 离开房间
    async leaveRoom() {
        if (!this.currentRoom) return;

        try {
            await API.lobby.leaveRoom(this.currentRoom.room_id, this.playerId);
            this.currentRoom = null;
            this.stopRoomPolling();
            this.showToast('已离开房间', 'info');
            this.showLobby();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // 开始游戏
    async startGame() {
        if (!this.currentRoom) return;

        try {
            await API.lobby.startGame(this.currentRoom.room_id, this.playerId);
            this.enterGame();
        } catch (error) {
            this.showToast(error.message, 'error');
        }
    },

    // 进入游戏
    async enterGame() {
        this.stopRoomPolling();
        this.showView('game-view');

        // 初始化游戏模块
        await Game.init(this.currentRoom.room_id, this.playerId, this.playerName);
    },

    // ==================== 工具方法 ====================

    // 显示提示消息
    showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.remove();
        }, 3000);
    },

    // 修改玩家名称
    changePlayerName() {
        const newName = prompt('请输入新的玩家名称:', this.playerName);
        if (newName && newName.trim()) {
            this.playerName = newName.trim();
            localStorage.setItem('playerName', this.playerName);
            this.updatePlayerDisplay();
            this.showToast('名称已更新', 'success');
        }
    }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// 导出
window.App = App;
