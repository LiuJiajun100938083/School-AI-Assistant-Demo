/**
 * 認證工具模組
 * ============
 * 全局掛載: window.AuthModule
 *
 * 集中管理 JWT Token 的存取、解碼、驗證、角色判斷。
 * 支援 Refresh Token 自動續期 — 教師登入一次可維持整個學期。
 *
 * 依賴: 無（但建議在 utils.js 之後加載）
 */
'use strict';

const AuthModule = {

    /* ---------- Access Token 存取 ---------- */

    getToken() {
        return localStorage.getItem('auth_token') || localStorage.getItem('token');
    },

    setToken(token) {
        localStorage.setItem('auth_token', token);
    },

    removeToken() {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('token');
        localStorage.removeItem('user_role');
    },

    /* ---------- Refresh Token 存取 ---------- */

    getRefreshToken() {
        return localStorage.getItem('refresh_token');
    },

    setRefreshToken(token) {
        localStorage.setItem('refresh_token', token);
    },

    removeRefreshToken() {
        localStorage.removeItem('refresh_token');
    },

    /* ---------- 完整清除 ---------- */

    clearAll() {
        this.removeToken();
        this.removeRefreshToken();
    },

    isAuthenticated() {
        return !!this.getToken();
    },

    /* ---------- Token 解碼 ---------- */

    /**
     * 解碼 JWT payload（不驗簽，僅取欄位）
     * @returns {Object|null}
     */
    decodeToken() {
        const token = this.getToken();
        if (!token) return null;
        try {
            return JSON.parse(atob(token.split('.')[1]));
        } catch {
            return null;
        }
    },

    /**
     * 檢查 access token 是否即將過期（< 30 分鐘）
     */
    isTokenExpiringSoon() {
        const payload = this.decodeToken();
        if (!payload?.exp) return true;
        const remaining = payload.exp - Date.now() / 1000;
        return remaining < 1800; // 30 分鐘
    },

    /**
     * 取得當前使用者角色
     * @returns {string} 'admin' | 'teacher' | 'student' | 'guest'
     */
    getUserRole() {
        const payload = this.decodeToken();
        return payload?.role || localStorage.getItem('user_role') || 'guest';
    },

    /**
     * 取得當前使用者名稱
     */
    getUsername() {
        const payload = this.decodeToken();
        return payload?.username || payload?.sub || '';
    },

    /**
     * 是否為管理員或教師
     */
    isAdminOrTeacher() {
        return ['admin', 'teacher'].includes(this.getUserRole());
    },

    /* ---------- 自動續期 ---------- */

    /**
     * 使用 refresh_token 換取新的 access_token
     * @returns {Promise<boolean>} 是否成功
     */
    async refresh() {
        const refreshToken = this.getRefreshToken();
        if (!refreshToken) return false;

        try {
            const resp = await fetch('/api/refresh-token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: refreshToken })
            });
            if (!resp.ok) {
                // refresh token 也過期了，徹底清除
                if (resp.status === 401 || resp.status === 403) {
                    this.clearAll();
                }
                return false;
            }
            const data = await resp.json();
            if (data.success && data.data?.access_token) {
                this.setToken(data.data.access_token);
                return true;
            }
            return false;
        } catch {
            return false;
        }
    },

    /**
     * 靜默續期：若 access token 快過期，自動刷新
     * 頁面載入時呼叫一次即可
     */
    async silentRefresh() {
        if (!this.getRefreshToken()) return;
        if (this.isTokenExpiringSoon()) {
            await this.refresh();
        }
    },

    /* ---------- 權限驗證 ---------- */

    /**
     * 返回帶 Authorization 的請求頭
     */
    getAuthHeaders() {
        const token = this.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    /**
     * 向後端驗證 Token 有效性（附帶自動續期）
     * @returns {Promise<Object|null>} 成功返回用戶資料，失敗返回 null
     */
    async verify() {
        let token = this.getToken();

        // 沒有 access token 但有 refresh token → 先嘗試續期
        if (!token && this.getRefreshToken()) {
            const refreshed = await this.refresh();
            if (refreshed) token = this.getToken();
        }

        if (!token) return null;

        try {
            let resp = await fetch('/api/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            // access token 過期 → 嘗試自動續期
            if (!resp.ok && this.getRefreshToken()) {
                const refreshed = await this.refresh();
                if (refreshed) {
                    resp = await fetch('/api/verify', {
                        headers: {
                            'Authorization': `Bearer ${this.getToken()}`,
                            'Content-Type': 'application/json'
                        }
                    });
                }
            }

            if (!resp.ok) return null;
            const data = await resp.json();
            return data.success ? (data.data || data) : null;
        } catch {
            return null;
        }
    },

    /**
     * 要求登入：未認證或驗證失敗則跳轉（含自動續期）
     * @param {string} redirectUrl - 跳轉地址（預設 '/login'）
     * @returns {Promise<Object|false>} 成功返回用戶資料，失敗返回 false（已跳轉）
     */
    async requireAuth(redirectUrl = '/login') {
        if (!this.isAuthenticated() && !this.getRefreshToken()) {
            window.location.href = redirectUrl;
            return false;
        }

        // 若 access token 無效但有 refresh token → 先嘗試續期
        if (!this.isAuthenticated() && this.getRefreshToken()) {
            const refreshed = await this.refresh();
            if (!refreshed) {
                this.clearAll();
                window.location.href = redirectUrl;
                return false;
            }
        }

        const user = await this.verify();
        if (!user) {
            this.clearAll();
            window.location.href = redirectUrl;
            return false;
        }

        return user;
    },

    /**
     * 取得使用者詳細資料（/api/user/info）
     * @returns {Promise<Object|null>}
     */
    async getUserInfo() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const resp = await fetch('/api/user/info', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.success ? data.data : null;
        } catch {
            return null;
        }
    }
};

window.AuthModule = AuthModule;
