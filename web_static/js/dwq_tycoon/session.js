/**
 * 大灣區大亨 — 客戶端 Session 快取
 *
 * 用途:
 *   - 頁面刷新後快速回到當前房間/遊戲 (UI 暖啟動)
 *   - **不**作為操作判斷依據,所有動作仍需經 WebSocket 確認
 *   - 第一條 server 推送的 room_state 會完全覆蓋 cache
 *
 * 對外介面: window.DwqApp.session
 */
(function () {
    'use strict';

    window.DwqApp = window.DwqApp || {};
    const STORAGE_KEY = 'dwq_tycoon:session';

    window.DwqApp.session = {
        save(data) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.assign({}, data, {
                    updated_at: Date.now(),
                })));
            } catch (e) {
                console.warn('[DwqSession] save failed:', e);
            }
        },

        load() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) return null;
                return JSON.parse(raw);
            } catch (e) {
                return null;
            }
        },

        clear() {
            try {
                localStorage.removeItem(STORAGE_KEY);
            } catch (e) {}
        },

        updateSnapshot(roomCode, snapshot) {
            const cur = this.load() || {};
            this.save(Object.assign({}, cur, {
                room_code: roomCode,
                last_state_version: snapshot ? snapshot.version : null,
                last_state_snapshot: snapshot,
            }));
        },
    };
})();
