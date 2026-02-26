/**
 * 認證工具模組
 * ============
 * 全局掛載: window.AuthModule
 *
 * 集中管理 JWT Token 的存取、解碼、驗證、角色判斷。
 * 依賴: 無（但建議在 utils.js 之後加載）
 */
'use strict';

const AuthModule = {

    /* ---------- Token 存取 ---------- */

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

    /* ---------- 權限驗證 ---------- */

    /**
     * 返回帶 Authorization 的請求頭
     */
    getAuthHeaders() {
        const token = this.getToken();
        return token ? { 'Authorization': `Bearer ${token}` } : {};
    },

    /**
     * 向後端驗證 Token 有效性
     * @returns {Promise<Object|null>} 成功返回用戶資料，失敗返回 null
     */
    async verify() {
        const token = this.getToken();
        if (!token) return null;

        try {
            const resp = await fetch('/api/verify', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!resp.ok) return null;
            const data = await resp.json();
            return data.success ? (data.data || data) : null;
        } catch {
            return null;
        }
    },

    /**
     * 要求登入：未認證或驗證失敗則跳轉
     * @param {string} redirectUrl - 跳轉地址（預設 '/'）
     * @returns {Promise<Object|false>} 成功返回用戶資料，失敗返回 false（已跳轉）
     */
    async requireAuth(redirectUrl = '/login') {
        if (!this.isAuthenticated()) {
            window.location.href = redirectUrl;
            return false;
        }

        const user = await this.verify();
        if (!user) {
            this.removeToken();
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
