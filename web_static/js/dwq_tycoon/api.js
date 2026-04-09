/**
 * 大灣區大亨 — REST API 客戶端封裝
 *
 * 設計原則:
 *   - 統一錯誤格式 (從後端 detail 解析 code/message)
 *   - 自動帶 JWT (從 localStorage)
 *   - 不依賴任何 UI 框架,可獨立測試
 *
 * 對外介面: window.DwqApp.api
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};

    const API_BASE = '/api/dwq_game';

    function getAuthToken() {
        return localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token') || '';
    }

    async function request(method, path, body) {
        const opts = {
            method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
        };
        const token = getAuthToken();
        if (token) {
            opts.headers['Authorization'] = 'Bearer ' + token;
        }
        if (body !== undefined) {
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(API_BASE + path, opts);
        let data;
        try {
            data = await res.json();
        } catch (e) {
            throw { code: 'parse_error', message: '響應解析失敗', status: res.status };
        }

        if (!res.ok) {
            const detail = data.detail || {};
            throw {
                code: detail.code || 'http_error',
                message: detail.message || data.message || ('HTTP ' + res.status),
                status: res.status,
            };
        }
        return data.data;
    }

    window.DwqApp.api = {
        listRooms() {
            return request('GET', '/rooms');
        },
        createRoom(roomName, maxPlayers, isPublic) {
            return request('POST', '/rooms', {
                room_name: roomName,
                max_players: maxPlayers,
                is_public: isPublic,
            });
        },
        getRoom(code) {
            return request('GET', '/rooms/' + encodeURIComponent(code));
        },
        joinRoom(code) {
            return request('POST', '/rooms/' + encodeURIComponent(code) + '/join');
        },
        joinByCode(roomCode) {
            return request('POST', '/join_by_code', { room_code: roomCode });
        },
        leaveRoom(code) {
            return request('POST', '/rooms/' + encodeURIComponent(code) + '/leave');
        },
        getActiveRoom() {
            return request('GET', '/me/active_room');
        },
        getAuthToken,
    };
})();
