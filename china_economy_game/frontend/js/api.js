/**
 * 中国经济发展桌游 - API 模块
 * 负责与后端通信，不包含任何游戏规则逻辑
 */

const API = {
    baseUrl: '',  // 同源，使用相对路径

    // 通用请求方法
    async request(method, endpoint, data = null) {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (data && (method === 'POST' || method === 'PUT')) {
            options.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(`${this.baseUrl}${endpoint}`, options);
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

    // GET 请求
    get(endpoint) {
        return this.request('GET', endpoint);
    },

    // POST 请求
    post(endpoint, data) {
        return this.request('POST', endpoint, data);
    },

    // ==================== 大厅 API ====================

    lobby: {
        // 获取房间列表
        async getRooms(waitingOnly = false) {
            return API.get(`/lobby/rooms?waiting_only=${waitingOnly}`);
        },

        // 创建房间
        async createRoom(playerId, playerName, maxPlayers = 4) {
            return API.post('/lobby/rooms', {
                player_id: playerId,
                player_name: playerName,
                max_players: maxPlayers
            });
        },

        // 获取房间详情
        async getRoom(roomId) {
            return API.get(`/lobby/rooms/${roomId}`);
        },

        // 加入房间
        async joinRoom(roomId, playerId, playerName) {
            return API.post(`/lobby/rooms/${roomId}/join`, {
                player_id: playerId,
                player_name: playerName
            });
        },

        // 离开房间
        async leaveRoom(roomId, playerId) {
            return API.post(`/lobby/rooms/${roomId}/leave`, {
                player_id: playerId
            });
        },

        // 开始游戏
        async startGame(roomId, playerId) {
            return API.post(`/lobby/rooms/${roomId}/start`, {
                player_id: playerId
            });
        },

        // 获取大厅统计
        async getStats() {
            return API.get('/lobby/stats');
        },

        // 获取玩家所在房间
        async getPlayerRoom(playerId) {
            return API.get(`/lobby/player/${playerId}/room`);
        }
    },

    // ==================== 游戏 API ====================

    game: {
        // 获取游戏状态
        async getState(roomId) {
            return API.get(`/game/${roomId}/state`);
        },

        // 获取棋盘信息
        async getBoard(roomId) {
            return API.get(`/game/${roomId}/board`);
        },

        // 获取玩家信息
        async getPlayer(roomId, playerId) {
            return API.get(`/game/${roomId}/player/${playerId}`);
        },

        // 获取可执行行动
        async getActions(roomId, playerId) {
            return API.get(`/game/${roomId}/player/${playerId}/actions`);
        },

        // 获取回合信息
        async getTurnInfo(roomId) {
            return API.get(`/game/${roomId}/turn`);
        },

        // 开始新回合
        async startRound(roomId) {
            return API.post(`/game/${roomId}/turn/start`);
        },

        // 抽取事件卡
        async drawEvent(roomId) {
            return API.post(`/game/${roomId}/turn/draw-event`);
        },

        // 结束回合
        async endRound(roomId) {
            return API.post(`/game/${roomId}/turn/end`);
        },

        // 玩家移动
        async move(roomId, playerId, steps = 1) {
            return API.post(`/game/${roomId}/action/move`, {
                player_id: playerId,
                steps
            });
        },

        // 玩家建厂
        async build(roomId, playerId, industryId) {
            return API.post(`/game/${roomId}/action/build`, {
                player_id: playerId,
                industry_id: industryId
            });
        },

        // 玩家使用运输
        async transport(roomId, playerId, destinationIndex) {
            return API.post(`/game/${roomId}/action/transport`, {
                player_id: playerId,
                destination_index: destinationIndex
            });
        },

        // 玩家结束回合
        async endTurn(roomId, playerId) {
            return API.post(`/game/${roomId}/action/end-turn`, {
                player_id: playerId
            });
        },

        // 执行行动（通用）
        async executeAction(roomId, playerId, actionType, params = {}) {
            return API.post(`/game/${roomId}/action/execute`, {
                player_id: playerId,
                action_type: actionType,
                params
            });
        },

        // 获取产业信息
        async getIndustries(roomId) {
            return API.get(`/game/${roomId}/industries`);
        },

        // 获取活跃事件
        async getActiveEvents(roomId) {
            return API.get(`/game/${roomId}/events`);
        },

        // 获取排行榜
        async getLeaderboard(roomId) {
            return API.get(`/game/${roomId}/leaderboard`);
        }
    }
};

// 导出
window.API = API;
