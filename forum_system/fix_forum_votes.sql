-- ============================================================
-- 修复 forum_votes 表创建问题
-- MySQL不允许在外键列上同时使用CHECK约束
-- ============================================================

SET NAMES utf8mb4;

-- 如果表存在则先删除
DROP TABLE IF EXISTS forum_votes;

-- 重新创建 forum_votes 表（移除CHECK约束，改用触发器验证）
CREATE TABLE forum_votes (
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

    -- 索引
    INDEX idx_vote_voter (voter_username),
    INDEX idx_vote_created (created_at DESC)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='论坛投票表';

-- 创建触发器确保投票目标二选一
DELIMITER //

CREATE TRIGGER trg_vote_target_check_insert
BEFORE INSERT ON forum_votes
FOR EACH ROW
BEGIN
    IF NOT ((NEW.post_id IS NOT NULL AND NEW.reply_id IS NULL) OR
            (NEW.post_id IS NULL AND NEW.reply_id IS NOT NULL)) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Vote must target either a post OR a reply, not both or neither';
    END IF;
END//

CREATE TRIGGER trg_vote_target_check_update
BEFORE UPDATE ON forum_votes
FOR EACH ROW
BEGIN
    IF NOT ((NEW.post_id IS NOT NULL AND NEW.reply_id IS NULL) OR
            (NEW.post_id IS NULL AND NEW.reply_id IS NOT NULL)) THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Vote must target either a post OR a reply, not both or neither';
    END IF;
END//

DELIMITER ;

SELECT '✅ forum_votes 表创建成功!' AS status;
