-- ============================================================
-- 论坛系统数据库表 - DDL脚本
-- 版本: 1.0.0
-- 创建时间: 2025-02-05
-- 说明: Piazza类论坛系统的核心数据表
-- ============================================================

-- 设置字符集
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================================
-- 1. 论坛主题表 (forum_posts)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_posts (
    -- 主键
    post_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主题ID',

    -- 作者信息
    author_username VARCHAR(100) NOT NULL COMMENT '作者用户名',

    -- 内容字段
    title VARCHAR(255) NOT NULL COMMENT '标题',
    content LONGTEXT NOT NULL COMMENT '内容(Markdown格式)',
    content_html LONGTEXT COMMENT '渲染后的HTML内容',

    -- 主题类型和可见性
    post_type ENUM('discussion', 'question', 'announcement') NOT NULL DEFAULT 'discussion' COMMENT '主题类型: discussion=讨论, question=问题, announcement=公告',
    visibility ENUM('public', 'private') NOT NULL DEFAULT 'public' COMMENT '可见性: public=学生可见, private=仅教师可见',

    -- 匿名设置
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否匿名发布',
    anonymous_name VARCHAR(50) DEFAULT NULL COMMENT '匿名显示名称',

    -- 状态标记
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否置顶',
    is_locked BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否锁定(锁定后不能回复)',
    is_resolved BOOLEAN NOT NULL DEFAULT FALSE COMMENT '问题是否已解决(仅question类型)',

    -- 统计字段
    view_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '浏览次数',
    reply_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '回复数量',
    upvote_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数量',

    -- 标签(JSON数组)
    tags JSON DEFAULT NULL COMMENT '标签数组,如["作业","第一章"]',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 软删除
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已删除',
    deleted_at DATETIME DEFAULT NULL COMMENT '删除时间',
    deleted_by VARCHAR(100) DEFAULT NULL COMMENT '删除操作者',

    -- 扩展字段
    metadata JSON DEFAULT NULL COMMENT '扩展元数据',

    -- 外键约束
    CONSTRAINT fk_post_author FOREIGN KEY (author_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 索引
    INDEX idx_post_author (author_username),
    INDEX idx_post_visibility_deleted (visibility, is_deleted),
    INDEX idx_post_type (post_type),
    INDEX idx_post_created (created_at DESC),
    INDEX idx_post_pinned (is_pinned DESC, created_at DESC),
    INDEX idx_post_upvote (upvote_count DESC),

    -- 全文索引(用于搜索)
    FULLTEXT INDEX ft_post_search (title, content)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛主题表';


-- ============================================================
-- 2. 论坛回复表 (forum_replies)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_replies (
    -- 主键
    reply_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '回复ID',

    -- 关联主题
    post_id INT NOT NULL COMMENT '关联的主题ID',

    -- 父回复(支持嵌套回复)
    parent_reply_id INT DEFAULT NULL COMMENT '父回复ID(NULL表示一级回复)',

    -- 作者信息
    author_username VARCHAR(100) NOT NULL COMMENT '作者用户名',

    -- 内容字段
    content LONGTEXT NOT NULL COMMENT '回复内容(Markdown格式)',
    content_html LONGTEXT COMMENT '渲染后的HTML内容',

    -- 匿名设置
    is_anonymous BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否匿名回复',
    anonymous_name VARCHAR(50) DEFAULT NULL COMMENT '匿名显示名称',

    -- 特殊标记
    is_instructor_response BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否为教师回复',
    is_accepted_answer BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否为采纳的答案(仅question类型)',

    -- 统计字段
    upvote_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '点赞数量',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 软删除
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已删除',
    deleted_at DATETIME DEFAULT NULL COMMENT '删除时间',
    deleted_by VARCHAR(100) DEFAULT NULL COMMENT '删除操作者',

    -- 扩展字段
    metadata JSON DEFAULT NULL COMMENT '扩展元数据',

    -- 外键约束
    CONSTRAINT fk_reply_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reply_author FOREIGN KEY (author_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_reply_parent FOREIGN KEY (parent_reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 索引
    INDEX idx_reply_post (post_id, created_at ASC),
    INDEX idx_reply_author (author_username),
    INDEX idx_reply_parent (parent_reply_id),
    INDEX idx_reply_instructor (is_instructor_response),
    INDEX idx_reply_accepted (is_accepted_answer)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛回复表';


-- ============================================================
-- 3. 论坛投票表 (forum_votes)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_votes (
    -- 主键
    vote_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '投票ID',

    -- 投票目标(二选一)
    post_id INT DEFAULT NULL COMMENT '投票的主题ID',
    reply_id INT DEFAULT NULL COMMENT '投票的回复ID',

    -- 投票者
    voter_username VARCHAR(100) NOT NULL COMMENT '投票者用户名',

    -- 投票类型
    vote_type ENUM('upvote', 'downvote') NOT NULL COMMENT '投票类型: upvote=点赞, downvote=踩',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',

    -- 外键约束
    CONSTRAINT fk_vote_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_vote_voter FOREIGN KEY (voter_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 唯一约束(每用户对每个目标只能投一票)
    UNIQUE KEY uk_post_vote (post_id, voter_username),
    UNIQUE KEY uk_reply_vote (reply_id, voter_username),

    -- 检查约束(必须投给主题或回复之一)
    CONSTRAINT chk_vote_target CHECK (
        (post_id IS NOT NULL AND reply_id IS NULL) OR
        (post_id IS NULL AND reply_id IS NOT NULL)
    ),

    -- 索引
    INDEX idx_vote_voter (voter_username),
    INDEX idx_vote_created (created_at DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛投票表';


-- ============================================================
-- 4. 论坛通知表 (forum_notifications)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_notifications (
    -- 主键
    notification_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '通知ID',

    -- 接收者
    user_username VARCHAR(100) NOT NULL COMMENT '通知接收者用户名',

    -- 关联内容
    post_id INT DEFAULT NULL COMMENT '关联的主题ID',
    reply_id INT DEFAULT NULL COMMENT '关联的回复ID',

    -- 通知类型
    notification_type ENUM(
        'new_reply',           -- 新回复
        'new_post',            -- 关注标签有新主题
        'mention',             -- @提及
        'instructor_response', -- 教师回复
        'answer_accepted',     -- 答案被采纳
        'upvote'               -- 收到点赞
    ) NOT NULL COMMENT '通知类型',

    -- 触发者
    related_username VARCHAR(100) DEFAULT NULL COMMENT '触发通知的用户名',

    -- 通知内容
    title VARCHAR(255) NOT NULL COMMENT '通知标题',
    message TEXT COMMENT '通知详细内容',

    -- 状态
    is_read BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已读',
    read_at DATETIME DEFAULT NULL COMMENT '阅读时间',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    -- 外键约束
    CONSTRAINT fk_notification_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_notification_related FOREIGN KEY (related_username)
        REFERENCES users(username) ON DELETE SET NULL ON UPDATE CASCADE,

    -- 索引
    INDEX idx_notification_user_unread (user_username, is_read, created_at DESC),
    INDEX idx_notification_created (created_at DESC),
    INDEX idx_notification_type (notification_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛通知表';


-- ============================================================
-- 5. 论坛附件表 (forum_attachments)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_attachments (
    -- 主键
    attachment_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '附件ID',

    -- 关联内容(二选一)
    post_id INT DEFAULT NULL COMMENT '关联的主题ID',
    reply_id INT DEFAULT NULL COMMENT '关联的回复ID',

    -- 文件信息
    file_name VARCHAR(255) NOT NULL COMMENT '原始文件名',
    file_path VARCHAR(500) NOT NULL COMMENT '存储路径',
    file_size INT UNSIGNED NOT NULL COMMENT '文件大小(字节)',
    file_type ENUM('image', 'document', 'video', 'audio', 'other') NOT NULL DEFAULT 'other' COMMENT '文件类型分类',
    mime_type VARCHAR(100) NOT NULL COMMENT 'MIME类型',

    -- 上传者
    upload_username VARCHAR(100) NOT NULL COMMENT '上传者用户名',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',

    -- 软删除
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE COMMENT '是否已删除',
    deleted_at DATETIME DEFAULT NULL COMMENT '删除时间',

    -- 外键约束
    CONSTRAINT fk_attachment_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attachment_reply FOREIGN KEY (reply_id)
        REFERENCES forum_replies(reply_id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_attachment_uploader FOREIGN KEY (upload_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 索引
    INDEX idx_attachment_post (post_id),
    INDEX idx_attachment_reply (reply_id),
    INDEX idx_attachment_type (file_type)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛附件表';


-- ============================================================
-- 6. 论坛标签表 (forum_tags)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_tags (
    -- 主键
    tag_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '标签ID',

    -- 标签信息
    tag_name VARCHAR(50) NOT NULL COMMENT '标签名称',
    tag_description VARCHAR(255) DEFAULT NULL COMMENT '标签描述',
    tag_color VARCHAR(7) DEFAULT '#006633' COMMENT '标签颜色(十六进制)',

    -- 统计
    usage_count INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '使用次数',

    -- 创建者
    created_by VARCHAR(100) NOT NULL COMMENT '创建者用户名',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',

    -- 外键约束
    CONSTRAINT fk_tag_creator FOREIGN KEY (created_by)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 唯一约束
    UNIQUE KEY uk_tag_name (tag_name),

    -- 索引
    INDEX idx_tag_usage (usage_count DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛标签表';


-- ============================================================
-- 7. 用户订阅表 (forum_subscriptions)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_subscriptions (
    -- 主键
    subscription_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '订阅ID',

    -- 订阅者
    user_username VARCHAR(100) NOT NULL COMMENT '订阅者用户名',

    -- 订阅目标
    post_id INT DEFAULT NULL COMMENT '订阅的主题ID',
    tag_name VARCHAR(50) DEFAULT NULL COMMENT '订阅的标签名',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '订阅时间',

    -- 外键约束
    CONSTRAINT fk_subscription_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_subscription_post FOREIGN KEY (post_id)
        REFERENCES forum_posts(post_id) ON DELETE CASCADE ON UPDATE CASCADE,

    -- 唯一约束
    UNIQUE KEY uk_user_post (user_username, post_id),
    UNIQUE KEY uk_user_tag (user_username, tag_name),

    -- 索引
    INDEX idx_subscription_user (user_username),
    INDEX idx_subscription_post (post_id),
    INDEX idx_subscription_tag (tag_name)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户订阅表';


-- ============================================================
-- 8. 论坛用户偏好表 (forum_user_preferences)
-- ============================================================
CREATE TABLE IF NOT EXISTS forum_user_preferences (
    -- 主键
    preference_id INT AUTO_INCREMENT PRIMARY KEY COMMENT '偏好ID',

    -- 用户
    user_username VARCHAR(100) NOT NULL UNIQUE COMMENT '用户名',

    -- 通知偏好
    notify_new_reply BOOLEAN NOT NULL DEFAULT TRUE COMMENT '收到回复时通知',
    notify_mention BOOLEAN NOT NULL DEFAULT TRUE COMMENT '被@提及时通知',
    notify_instructor_response BOOLEAN NOT NULL DEFAULT TRUE COMMENT '教师回复时通知',
    notify_upvote BOOLEAN NOT NULL DEFAULT FALSE COMMENT '收到点赞时通知',

    -- 邮件通知
    email_digest ENUM('none', 'daily', 'weekly') NOT NULL DEFAULT 'none' COMMENT '邮件摘要频率',

    -- 显示偏好
    default_sort ENUM('newest', 'oldest', 'most_upvoted', 'most_replied') NOT NULL DEFAULT 'newest' COMMENT '默认排序方式',
    posts_per_page INT UNSIGNED NOT NULL DEFAULT 20 COMMENT '每页显示数量',

    -- 时间戳
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',

    -- 外键约束
    CONSTRAINT fk_preference_user FOREIGN KEY (user_username)
        REFERENCES users(username) ON DELETE CASCADE ON UPDATE CASCADE

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛用户偏好表';


-- ============================================================
-- 初始标签数据
-- ============================================================
-- 注意: 需要在users表中存在一个admin用户才能插入
-- INSERT INTO forum_tags (tag_name, tag_description, tag_color, created_by) VALUES
-- ('作业', '作业相关讨论', '#FF6B6B', 'admin'),
-- ('考试', '考试相关讨论', '#4ECDC4', 'admin'),
-- ('课程内容', '课程内容疑问', '#45B7D1', 'admin'),
-- ('技术问题', '技术操作问题', '#96CEB4', 'admin'),
-- ('资源分享', '学习资源分享', '#FFEAA7', 'admin'),
-- ('公告', '重要公告', '#E74C3C', 'admin');


-- ============================================================
-- 完成提示
-- ============================================================
SELECT '论坛系统数据库表创建完成!' AS status;
