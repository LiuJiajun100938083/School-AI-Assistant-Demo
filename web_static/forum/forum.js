/**
 * 討論區系統前端
 * ============
 */

class ForumApp {
    constructor() {
        this.authToken = localStorage.getItem('auth_token');
        this.currentUser = null;
        this.userRole = null;

        // 狀態
        this.currentPage = 1;
        this.pageSize = 20;
        this.currentSort = 'newest';
        this.currentType = 'all';
        this.currentTag = null;

        this.init();
    }

    async init() {
        if (!this.authToken) {
            window.location.href = '/';
            return;
        }

        // 獲取用戶資訊
        await this.loadUserInfo();

        // 載入數據
        await Promise.all([
            this.loadPosts(),
            this.loadTags(),
            this.loadTrending(),
            this.loadNotificationCount()
        ]);

        // 綁定事件
        this.bindEvents();
    }

    // ========== 用戶資訊 ==========

    async loadUserInfo() {
        try {
            // 從localStorage獲取用戶資訊
            const username = localStorage.getItem('username') || '用戶';
            const role = localStorage.getItem('user_role') || 'student';

            this.currentUser = username;
            this.userRole = role;

            // 更新UI
            document.getElementById('currentUser').textContent = username;
            const roleBadge = document.getElementById('userRole');
            roleBadge.textContent = role === 'teacher' ? '老師' : role === 'admin' ? '管理員' : '學生';
            if (role === 'teacher' || role === 'admin') {
                roleBadge.classList.add('teacher');
            }

            // 顯示教師專屬選項
            if (role === 'teacher' || role === 'admin') {
                document.getElementById('announcementOption').style.display = 'block';
                document.getElementById('visibilityGroup').style.display = 'block';
            } else {
                document.getElementById('visibilityGroup').style.display = 'none';
            }
        } catch (error) {
            console.error('載入用戶資訊失敗:', error);
        }
    }

    // ========== API調用 ==========

    async apiCall(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Authorization': `Bearer ${this.authToken}`,
                'Content-Type': 'application/json'
            }
        };

        const finalOptions = {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        };

        const response = await fetch(url, finalOptions);

        if (response.status === 401) {
            localStorage.removeItem('auth_token');
            window.location.href = '/';
            throw new Error('認證失效');
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ detail: '請求失敗' }));
            throw new Error(error.detail || '請求失敗');
        }

        return response.json();
    }

    // ========== 載入主題列表 ==========

    async loadPosts() {
        try {
            this.showLoading(true);

            const params = new URLSearchParams({
                page: this.currentPage,
                page_size: this.pageSize,
                sort: this.currentSort
            });

            if (this.currentType !== 'all') {
                params.append('post_type', this.currentType);
            }

            if (this.currentTag) {
                params.append('tag', this.currentTag);
            }

            const result = await this.apiCall(`/api/forum/posts?${params}`);

            this.renderPosts(result.items);
            this.renderPagination(result.pagination);

            this.showLoading(false);
        } catch (error) {
            console.error('載入主題失敗:', error);
            this.showLoading(false);
            this.showError('載入失敗: ' + error.message);
        }
    }

    renderPosts(posts) {
        const container = document.getElementById('postsList');
        const emptyState = document.getElementById('emptyState');

        if (!posts || posts.length === 0) {
            container.innerHTML = '';
            emptyState.style.display = 'block';
            return;
        }

        emptyState.style.display = 'none';

        container.innerHTML = posts.map(post => this.renderPostCard(post)).join('');
    }

    renderPostCard(post) {
        const typeLabels = {
            'discussion': '💬 討論',
            'question': '❓ 問題',
            'announcement': '📢 公告'
        };

        const badges = [];

        // 置頂標記
        if (post.is_pinned) {
            badges.push('<span class="badge badge-pinned">📌 置頂</span>');
        }

        // 私有標記
        if (post.visibility === 'private') {
            badges.push('<span class="badge badge-private">🔒 僅教師</span>');
        }

        // 類型標記
        badges.push(`<span class="badge badge-type ${post.post_type}">${typeLabels[post.post_type] || post.post_type}</span>`);

        // 已解決標記
        if (post.is_resolved) {
            badges.push('<span class="badge badge-resolved">✓ 已解決</span>');
        }

        // 教師回覆標記
        if (post.has_instructor_response) {
            badges.push('<span class="badge badge-instructor">👨‍🏫 教師已回覆</span>');
        }

        // 作者顯示
        const authorClass = post.author.role === 'teacher' || post.author.role === 'admin' ? 'teacher' : '';
        const authorBadge = post.author.role === 'teacher' ? '<span class="badge badge-teacher">老師</span>' : '';

        // 標籤
        const tagsHtml = post.tags.map(tag =>
            `<span class="post-tag" onclick="event.stopPropagation(); forumApp.filterByTag('${tag}')">${tag}</span>`
        ).join('');

        return `
            <div class="post-card ${post.is_pinned ? 'pinned' : ''} ${post.visibility === 'private' ? 'private' : ''}"
                 onclick="forumApp.showPostDetail(${post.post_id})">
                <div class="post-card-header">
                    <div class="post-meta">
                        <span class="post-author ${authorClass}">${post.author.display_name}</span>
                        ${authorBadge}
                        ${badges.join('')}
                    </div>
                    <span class="post-time">${this.formatTime(post.created_at)}</span>
                </div>

                <div class="post-title">${this.escapeHtml(post.title)}</div>
                <div class="post-preview">${this.escapeHtml(post.content_preview)}</div>

                <div class="post-footer">
                    <div class="post-stats">
                        <span class="post-stat">👁 ${post.view_count}</span>
                        <span class="post-stat">💬 ${post.reply_count}</span>
                        <span class="post-stat">👍 ${post.upvote_count}</span>
                    </div>
                    <div class="post-tags">${tagsHtml}</div>
                </div>
            </div>
        `;
    }

    renderPagination(pagination) {
        const container = document.getElementById('pagination');

        if (!pagination || pagination.total_pages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';

        // 上一頁
        html += `<button class="pagination-btn" ${pagination.has_prev ? '' : 'disabled'}
                         onclick="forumApp.goToPage(${pagination.page - 1})">上一頁</button>`;

        // 頁碼
        const maxPages = 5;
        let startPage = Math.max(1, pagination.page - Math.floor(maxPages / 2));
        let endPage = Math.min(pagination.total_pages, startPage + maxPages - 1);

        if (endPage - startPage < maxPages - 1) {
            startPage = Math.max(1, endPage - maxPages + 1);
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="pagination-btn ${i === pagination.page ? 'active' : ''}"
                             onclick="forumApp.goToPage(${i})">${i}</button>`;
        }

        // 下一頁
        html += `<button class="pagination-btn" ${pagination.has_next ? '' : 'disabled'}
                         onclick="forumApp.goToPage(${pagination.page + 1})">下一頁</button>`;

        // 資訊
        html += `<span class="pagination-info">共 ${pagination.total_items} 條</span>`;

        container.innerHTML = html;
    }

    // ========== 載入標籤 ==========

    async loadTags() {
        try {
            const result = await this.apiCall('/api/forum/tags?limit=20');
            this.renderTags(result.items);
        } catch (error) {
            console.error('載入標籤失敗:', error);
        }
    }

    renderTags(tags) {
        const container = document.getElementById('tagsList');

        if (!tags || tags.length === 0) {
            container.innerHTML = '<span class="text-muted">暫無標籤</span>';
            return;
        }

        container.innerHTML = tags.slice(0, 15).map(tag =>
            `<span class="tag-item" onclick="forumApp.filterByTag('${tag.tag_name}')">${tag.tag_name} (${tag.usage_count})</span>`
        ).join('');
    }

    // ========== 載入熱門 ==========

    async loadTrending() {
        try {
            const result = await this.apiCall('/api/forum/trending?days=7&limit=5');
            this.renderTrending(result);
        } catch (error) {
            console.error('載入熱門失敗:', error);
        }
    }

    renderTrending(posts) {
        const container = document.getElementById('trendingList');

        if (!posts || posts.length === 0) {
            container.innerHTML = '<div class="text-muted">暫無熱門討論</div>';
            return;
        }

        container.innerHTML = posts.map(post => `
            <div class="trending-item" onclick="forumApp.showPostDetail(${post.post_id})">
                <div class="trending-title">${this.escapeHtml(post.title)}</div>
                <div class="trending-stats">👍 ${post.upvote_count} · 💬 ${post.reply_count}</div>
            </div>
        `).join('');
    }

    // ========== 通知 ==========

    async loadNotificationCount() {
        try {
            const result = await this.apiCall('/api/forum/notifications/unread-count');
            const count = result.unread_count;
            const badge = document.getElementById('notificationCount');

            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        } catch (error) {
            console.error('載入通知數失敗:', error);
        }
    }

    async showNotifications() {
        const panel = document.getElementById('notificationPanel');

        if (panel.style.display === 'block') {
            panel.style.display = 'none';
            return;
        }

        try {
            const result = await this.apiCall('/api/forum/notifications?page_size=20');

            const list = document.getElementById('notificationList');

            if (!result.items || result.items.length === 0) {
                list.innerHTML = '<div class="notification-item">暫無通知</div>';
            } else {
                list.innerHTML = result.items.map(n => `
                    <div class="notification-item ${n.is_read ? '' : 'unread'}"
                         onclick="forumApp.handleNotificationClick(${n.notification_id}, ${n.post_id})">
                        <div class="notification-title">${this.escapeHtml(n.title)}</div>
                        ${n.message ? `<div class="notification-message">${this.escapeHtml(n.message)}</div>` : ''}
                        <div class="notification-time">${this.formatTime(n.created_at)}</div>
                    </div>
                `).join('');
            }

            panel.style.display = 'block';
        } catch (error) {
            console.error('載入通知失敗:', error);
        }
    }

    async handleNotificationClick(notificationId, postId) {
        // 標記為已讀
        await this.apiCall(`/api/forum/notifications/${notificationId}/read`, { method: 'POST' });

        // 隱藏面板
        document.getElementById('notificationPanel').style.display = 'none';

        // 顯示主題
        if (postId) {
            this.showPostDetail(postId);
        }

        // 更新計數
        this.loadNotificationCount();
    }

    async markAllNotificationsRead() {
        try {
            await this.apiCall('/api/forum/notifications/mark-all-read', { method: 'POST' });
            document.getElementById('notificationPanel').style.display = 'none';
            this.loadNotificationCount();
        } catch (error) {
            console.error('標記已讀失敗:', error);
        }
    }

    // ========== 篩選和排序 ==========

    filterByType(type, element) {
        this.currentType = type;
        this.currentPage = 1;

        // 更新UI
        document.querySelectorAll('.category-item').forEach(el => el.classList.remove('active'));
        if (element) element.classList.add('active');

        this.loadPosts();
    }

    filterByTag(tag) {
        this.currentTag = tag;
        this.currentPage = 1;
        this.loadPosts();
    }

    changeSort(sort) {
        this.currentSort = sort;
        this.currentPage = 1;
        this.loadPosts();
    }

    goToPage(page) {
        this.currentPage = page;
        this.loadPosts();
    }

    // ========== 搜尋 ==========

    async search() {
        const query = document.getElementById('searchInput').value.trim();

        if (query.length < 2) {
            this.showError('請輸入至少2個字元');
            return;
        }

        try {
            this.showLoading(true);

            const params = new URLSearchParams({
                q: query,
                page: 1,
                page_size: this.pageSize
            });

            const result = await this.apiCall(`/api/forum/search?${params}`);

            this.renderPosts(result.items);
            this.renderPagination(result.pagination);

            this.showLoading(false);
        } catch (error) {
            console.error('搜尋失敗:', error);
            this.showLoading(false);
            this.showError('搜尋失敗: ' + error.message);
        }
    }

    // ========== 新建主題 ==========

    showNewPostModal() {
        document.getElementById('newPostModal').style.display = 'flex';
        document.getElementById('postTitle').focus();
    }

    hideNewPostModal() {
        document.getElementById('newPostModal').style.display = 'none';
        document.getElementById('newPostForm').reset();
    }

    async submitNewPost(event) {
        event.preventDefault();

        const title = document.getElementById('postTitle').value.trim();
        const content = document.getElementById('postContent').value.trim();
        const postType = document.querySelector('input[name="postType"]:checked').value;
        const visibility = document.getElementById('postVisibility').value;
        const tagsInput = document.getElementById('postTags').value;
        const isAnonymous = document.getElementById('anonymousCheck').checked;

        // 解析標籤
        const tags = tagsInput.split(',')
            .map(t => t.trim())
            .filter(t => t.length > 0);

        try {
            await this.apiCall('/api/forum/posts', {
                method: 'POST',
                body: JSON.stringify({
                    title,
                    content,
                    post_type: postType,
                    visibility,
                    is_anonymous: isAnonymous,
                    tags
                })
            });

            this.hideNewPostModal();
            this.loadPosts();
            this.showSuccess('發佈成功！');
        } catch (error) {
            console.error('發佈失敗:', error);
            this.showError('發佈失敗: ' + error.message);
        }
    }

    // ========== 主題詳情 ==========

    async showPostDetail(postId) {
        try {
            const post = await this.apiCall(`/api/forum/posts/${postId}`);

            document.getElementById('detailTitle').textContent = post.title;
            // 儲存當前帖子數據供編輯使用
            this.currentPostData = post;
            document.getElementById('postDetailContent').innerHTML = this.renderPostDetail(post);
            document.getElementById('postDetailModal').style.display = 'flex';

            // 存儲當前主題ID
            this.currentPostId = postId;
        } catch (error) {
            console.error('載入主題詳情失敗:', error);
            this.showError('載入失敗: ' + error.message);
        }
    }

    renderPostDetail(post) {
        const typeLabels = {
            'discussion': '💬 討論',
            'question': '❓ 問題',
            'announcement': '📢 公告'
        };

        // 元數據
        const metaItems = [
            `<span>${post.author.is_anonymous ? '匿名用戶' : post.author.display_name}</span>`,
            post.author.role === 'teacher' ? '<span class="badge badge-teacher">老師</span>' : '',
            `<span>${this.formatTime(post.created_at)}</span>`,
            `<span class="badge badge-type ${post.post_type}">${typeLabels[post.post_type]}</span>`
        ];

        if (post.visibility === 'private') {
            metaItems.push('<span class="badge badge-private">🔒 僅教師可見</span>');
        }

        if (post.is_resolved) {
            metaItems.push('<span class="badge badge-resolved">✓ 已解決</span>');
        }

        // 回覆列表
        const repliesHtml = post.replies.map(reply => this.renderReplyItem(reply)).join('');

        // 回覆表單（如果未鎖定）
        const replyFormHtml = post.can_reply ? `
            <div class="reply-form">
                <textarea id="replyContent" placeholder="寫下您的回覆... (支援Markdown)"></textarea>
                <div class="reply-form-actions">
                    <label class="checkbox-label">
                        <input type="checkbox" id="replyAnonymous">
                        <span>匿名回覆</span>
                    </label>
                    <button class="btn-primary" onclick="forumApp.submitReply()">發表回覆</button>
                </div>
            </div>
        ` : '<p class="text-muted">該主題已被鎖定，無法回覆</p>';

        return `
            <div class="post-detail-header">
                <h1 class="post-detail-title">${this.escapeHtml(post.title)}</h1>
                <div class="post-detail-meta">
                    ${metaItems.filter(Boolean).join(' · ')}
                </div>
            </div>

            <div class="post-detail-body">
                ${post.content_html || this.escapeHtml(post.content).replace(/\n/g, '<br>')}
            </div>

            ${post.tags.length > 0 ? `
                <div class="post-tags" style="margin-bottom: var(--space-4)">
                    ${post.tags.map(tag => `<span class="post-tag">${tag}</span>`).join('')}
                </div>
            ` : ''}

            <div class="post-detail-actions">
                <button class="action-btn ${post.user_vote === 'upvote' ? 'active' : ''}"
                        onclick="forumApp.votePost(${post.post_id}, 'upvote')">
                    👍 ${post.upvote_count}
                </button>
                <span class="post-stat">👁 ${post.view_count}</span>
                <span class="post-stat">💬 ${post.reply_count}</span>

                ${this.canEditPost(post) ? `
                    <button class="action-btn edit-btn" onclick="forumApp.editPost(${post.post_id})">
                        ✏️ 編輯
                    </button>
                ` : ''}
                ${this.canDeletePost(post) ? `
                    <button class="action-btn delete-btn" onclick="forumApp.deletePost(${post.post_id})">
                        🗑️ 刪除
                    </button>
                ` : ''}
            </div>

            <div class="replies-section">
                <div class="replies-header">
                    <h3>回覆 (${post.reply_count})</h3>
                </div>

                ${replyFormHtml}

                <div class="replies-list">
                    ${repliesHtml || '<p class="text-muted">暫無回覆</p>'}
                </div>
            </div>
        `;
    }

    renderReplyItem(reply) {
        const authorClass = reply.author.role === 'teacher' || reply.author.role === 'admin' ? 'teacher' : '';

        const badges = [];
        if (reply.is_instructor_response) {
            badges.push('<span class="badge badge-teacher">老師</span>');
        }
        if (reply.is_accepted_answer) {
            badges.push('<span class="badge badge-resolved">✓ 採納答案</span>');
        }

        return `
            <div class="reply-item ${reply.is_instructor_response ? 'instructor' : ''} ${reply.is_accepted_answer ? 'accepted' : ''}">
                <div class="reply-header">
                    <div class="reply-author">
                        <span class="${authorClass}">${reply.author.is_anonymous ? '匿名用戶' : reply.author.display_name}</span>
                        ${badges.join('')}
                    </div>
                    <span class="post-time">${this.formatTime(reply.created_at)}</span>
                </div>
                <div class="reply-content">
                    ${reply.content_html || this.escapeHtml(reply.content).replace(/\n/g, '<br>')}
                </div>
                <div class="reply-footer">
                    <button class="action-btn ${reply.user_vote === 'upvote' ? 'active' : ''}"
                            onclick="forumApp.voteReply(${reply.reply_id}, 'upvote')">
                        👍 ${reply.upvote_count}
                    </button>

                    ${this.canEditReply(reply) ? `
                        <button class="action-btn edit-btn" onclick="forumApp.editReply(${reply.reply_id})">
                            ✏️ 編輯
                        </button>
                    ` : ''}
                    ${this.canDeleteReply(reply) ? `
                        <button class="action-btn delete-btn" onclick="forumApp.deleteReply(${reply.reply_id})">
                            🗑️ 刪除
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    hidePostDetail() {
        document.getElementById('postDetailModal').style.display = 'none';
        this.currentPostId = null;
    }

    // ========== 投票 ==========

    async votePost(postId, voteType) {
        try {
            await this.apiCall(`/api/forum/posts/${postId}/vote`, {
                method: 'POST',
                body: JSON.stringify({ vote_type: voteType })
            });

            // 刷新詳情
            this.showPostDetail(postId);
        } catch (error) {
            console.error('投票失敗:', error);
            this.showError('投票失敗: ' + error.message);
        }
    }

    async voteReply(replyId, voteType) {
        try {
            await this.apiCall(`/api/forum/replies/${replyId}/vote`, {
                method: 'POST',
                body: JSON.stringify({ vote_type: voteType })
            });

            // 刷新詳情
            if (this.currentPostId) {
                this.showPostDetail(this.currentPostId);
            }
        } catch (error) {
            console.error('投票失敗:', error);
            this.showError('投票失敗: ' + error.message);
        }
    }

    // ========== 回覆 ==========

    async submitReply() {
        const content = document.getElementById('replyContent').value.trim();
        const isAnonymous = document.getElementById('replyAnonymous').checked;

        if (!content) {
            this.showError('請輸入回覆內容');
            return;
        }

        try {
            await this.apiCall(`/api/forum/posts/${this.currentPostId}/replies`, {
                method: 'POST',
                body: JSON.stringify({
                    content,
                    is_anonymous: isAnonymous
                })
            });

            // 刷新詳情
            this.showPostDetail(this.currentPostId);

            // 清空輸入
            document.getElementById('replyContent').value = '';
            document.getElementById('replyAnonymous').checked = false;

            this.showSuccess('回覆成功！');
        } catch (error) {
            console.error('回覆失敗:', error);
            this.showError('回覆失敗: ' + error.message);
        }
    }

    // ========== 事件綁定 ==========

    bindEvents() {
        // 搜尋回車
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.search();
            }
        });

        // 點擊外部關閉通知面板
        document.addEventListener('click', (e) => {
            const panel = document.getElementById('notificationPanel');
            const badge = document.querySelector('.notification-badge');

            if (panel.style.display === 'block' &&
                !panel.contains(e.target) &&
                !badge.contains(e.target)) {
                panel.style.display = 'none';
            }
        });

        // ESC關閉模態框
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideNewPostModal();
                this.hidePostDetail();
            }
        });

        // 點擊模態框背景關閉
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        });
    }

    // ========== 權限檢查 ==========

    /**
     * 檢查是否可以編輯帖子
     * - 管理員可以編輯任何帖子
     * - 其他用戶只能編輯自己的帖子
     */
    canEditPost(post) {
        if (this.userRole === 'admin') return true;
        return post.author.username === this.currentUser;
    }

    /**
     * 檢查是否可以編輯評論
     * - 管理員可以編輯任何評論
     * - 老師可以編輯任何評論（版主權限）
     * - 學生只能編輯自己的評論
     */
    canEditReply(reply) {
        if (this.userRole === 'admin' || this.userRole === 'teacher') return true;
        return reply.author.username === this.currentUser;
    }

    /**
     * 檢查是否可以刪除帖子
     */
    canDeletePost(post) {
        if (this.userRole === 'admin') return true;
        return post.author.username === this.currentUser;
    }

    /**
     * 檢查是否可以刪除評論
     */
    canDeleteReply(reply) {
        if (this.userRole === 'admin' || this.userRole === 'teacher') return true;
        return reply.author.username === this.currentUser;
    }

    // ========== 編輯帖子 ==========

    editPost(postId) {
        // 獲取當前帖子數據
        const post = this.currentPostData;
        if (!post) {
            this.showError('無法獲取帖子數據');
            return;
        }

        // 填充編輯表單
        document.getElementById('editPostId').value = postId;
        document.getElementById('editPostTitle').value = post.title;
        document.getElementById('editPostContent').value = post.content;
        document.getElementById('editPostTags').value = post.tags.join(', ');

        // 顯示可見性選項（僅教師/管理員）
        const visibilityGroup = document.getElementById('editVisibilityGroup');
        if (this.userRole === 'teacher' || this.userRole === 'admin') {
            visibilityGroup.style.display = 'block';
            document.getElementById('editVisibility').value = post.visibility;
        } else {
            visibilityGroup.style.display = 'none';
        }

        // 顯示編輯模態框
        document.getElementById('editPostModal').style.display = 'flex';
    }

    hideEditPostModal() {
        document.getElementById('editPostModal').style.display = 'none';
    }

    async submitEditPost() {
        const postId = document.getElementById('editPostId').value;
        const title = document.getElementById('editPostTitle').value.trim();
        const content = document.getElementById('editPostContent').value.trim();
        const tagsStr = document.getElementById('editPostTags').value.trim();
        const visibility = document.getElementById('editVisibility')?.value || 'public';

        if (!title) {
            this.showError('請輸入標題');
            return;
        }

        if (!content) {
            this.showError('請輸入內容');
            return;
        }

        const tags = tagsStr ? tagsStr.split(/[,，]/).map(t => t.trim()).filter(Boolean) : [];

        try {
            const data = { title, content, tags };
            if (this.userRole === 'teacher' || this.userRole === 'admin') {
                data.visibility = visibility;
            }

            await this.apiCall(`/api/forum/posts/${postId}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });

            this.hideEditPostModal();
            this.showPostDetail(postId);
            this.showSuccess('帖子更新成功！');
        } catch (error) {
            console.error('更新失敗:', error);
            this.showError('更新失敗: ' + error.message);
        }
    }

    async deletePost(postId) {
        if (!confirm('確定要刪除這個帖子嗎？此操作不可撤銷。')) {
            return;
        }

        try {
            await this.apiCall(`/api/forum/posts/${postId}`, {
                method: 'DELETE'
            });

            this.hidePostDetail();
            this.loadPosts();
            this.showSuccess('帖子已刪除');
        } catch (error) {
            console.error('刪除失敗:', error);
            this.showError('刪除失敗: ' + error.message);
        }
    }

    // ========== 編輯評論 ==========

    editReply(replyId) {
        // 查找評論數據
        const reply = this.currentPostData?.replies?.find(r => r.reply_id === replyId);
        if (!reply) {
            this.showError('無法獲取評論數據');
            return;
        }

        // 填充編輯表單
        document.getElementById('editReplyId').value = replyId;
        document.getElementById('editReplyContent').value = reply.content;

        // 顯示編輯模態框
        document.getElementById('editReplyModal').style.display = 'flex';
    }

    hideEditReplyModal() {
        document.getElementById('editReplyModal').style.display = 'none';
    }

    async submitEditReply() {
        const replyId = document.getElementById('editReplyId').value;
        const content = document.getElementById('editReplyContent').value.trim();

        if (!content) {
            this.showError('請輸入內容');
            return;
        }

        try {
            await this.apiCall(`/api/forum/replies/${replyId}`, {
                method: 'PUT',
                body: JSON.stringify({ content })
            });

            this.hideEditReplyModal();
            if (this.currentPostId) {
                this.showPostDetail(this.currentPostId);
            }
            this.showSuccess('評論更新成功！');
        } catch (error) {
            console.error('更新失敗:', error);
            this.showError('更新失敗: ' + error.message);
        }
    }

    async deleteReply(replyId) {
        if (!confirm('確定要刪除這條評論嗎？此操作不可撤銷。')) {
            return;
        }

        try {
            await this.apiCall(`/api/forum/replies/${replyId}`, {
                method: 'DELETE'
            });

            if (this.currentPostId) {
                this.showPostDetail(this.currentPostId);
            }
            this.showSuccess('評論已刪除');
        } catch (error) {
            console.error('刪除失敗:', error);
            this.showError('刪除失敗: ' + error.message);
        }
    }

    // ========== 工具方法 ==========

    showLoading(show) {
        document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
    }

    showError(message) {
        alert('錯誤: ' + message);
    }

    showSuccess(message) {
        alert(message);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(dateString) {
        if (!dateString) return '';

        const date = new Date(dateString);
        const now = new Date();
        const diff = Math.floor((now - date) / 1000);

        if (diff < 60) return '剛剛';
        if (diff < 3600) return Math.floor(diff / 60) + ' 分鐘前';
        if (diff < 86400) return Math.floor(diff / 3600) + ' 小時前';
        if (diff < 604800) return Math.floor(diff / 86400) + ' 天前';

        return date.toLocaleDateString('zh-TW', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }
}

// 初始化
const forumApp = new ForumApp();
