/**
 * 大灣區大亨 — React 入口
 *
 * 載入順序 (由 dwq_tycoon.html 控制):
 *   1. React/ReactDOM/Babel CDN
 *   2. shared/auth.js, shared/api.js (共用 token 管理)
 *   3. constants.js, api.js, ws.js, session.js (純 JS 模組)
 *   4. store.js, components/*.jsx, pages/*.jsx (Babel JSX,共享 window.DwqApp)
 *   5. main.js (本檔,最後執行 mount)
 *
 * 對外:無 (純 IIFE,直接 mount)
 */
(function () {
    'use strict';

    const { useEffect } = React;
    const App = window.DwqApp;
    const { DwqProvider, useDwq, LobbyPage, WaitingRoomPage, GamePage, GameOverPage } = App;

    // 認證檢查 - 沿用全域 AuthModule (shared/auth.js)
    function checkAuth() {
        const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
        if (!token) {
            // 未登入,導向登入頁
            window.location.href = '/login.html?redirect=' + encodeURIComponent(window.location.pathname);
            return null;
        }
        // 解析 token 拿 user 資訊 (簡化版,生產環境應該呼叫 /api/users/me)
        return { token };
    }

    function Router() {
        const ctx = useDwq();
        if (!ctx) return null;
        const { state, dispatch } = ctx;

        // 啟動時:檢查 active room → 自動恢復
        useEffect(function () {
            (async function () {
                try {
                    // 先嘗試取得用戶資訊
                    const meRes = await fetch('/api/profile', {
                        headers: { 'Authorization': 'Bearer ' + App.api.getAuthToken() },
                    });
                    if (meRes.ok) {
                        const data = await meRes.json();
                        const user = data.data || data;
                        dispatch({
                            type: 'SET_ME',
                            me: {
                                user_id: user.id || user.user_id,
                                username: user.username,
                                display_name: user.display_name || user.username,
                                role: user.role,
                            },
                        });
                    }
                } catch (e) {
                    console.warn('[main] fetch /me failed:', e);
                }

                // 然後嘗試恢復 active room
                try {
                    const active = await App.api.getActiveRoom();
                    if (active && active.room_code) {
                        dispatch({ type: 'SET_ROOM_CODE', roomCode: active.room_code });
                        if (active.snapshot) {
                            dispatch({ type: 'SET_GAME_STATE', state: active.snapshot });
                            const status = active.snapshot.status;
                            if (status === 'running' || status === 'finished') {
                                dispatch({ type: 'SET_VIEW', view: 'game' });
                            } else {
                                dispatch({ type: 'SET_VIEW', view: 'waiting' });
                            }
                        }
                    }
                } catch (e) {
                    // 沒有 active room 是正常情況
                }
            })();
        }, []);

        switch (state.view) {
            case 'lobby':    return React.createElement(LobbyPage);
            case 'waiting':  return React.createElement(WaitingRoomPage);
            case 'game':     return React.createElement(GamePage);
            case 'gameover': return React.createElement(GameOverPage);
            default:         return React.createElement(LobbyPage);
        }
    }

    function App_root() {
        return React.createElement(
            DwqProvider,
            null,
            React.createElement(Router)
        );
    }

    // 啟動 — 注意:本檔以 <script type="text/babel"> 載入,
    // Babel-standalone 是在 DOMContentLoaded 之後才異步編譯執行的,
    // 所以不能用 DOMContentLoaded 事件 (永遠不會觸發)。直接執行即可。
    function bootstrap() {
        if (!checkAuth()) return;
        const rootEl = document.getElementById('dwq-root');
        if (!rootEl) {
            console.error('[main] #dwq-root not found');
            return;
        }
        const root = ReactDOM.createRoot(rootEl);
        root.render(React.createElement(App_root));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap);
    } else {
        bootstrap();
    }
})();
