-- ============================================================
-- 神州菜園經營家遊戲成績表
-- 記錄學生遊戲成績與行為分析數據
-- 允許多次遊玩，排行榜取最高分
-- 2026-03-11
-- ============================================================

CREATE TABLE IF NOT EXISTS farm_game_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '用戶ID (users.id)',
    student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱',
    class_name VARCHAR(50) DEFAULT '' COMMENT '班級',
    result ENUM('completed', 'bankrupt', 'redline') NOT NULL,
    score INT NOT NULL COMMENT '總分 (資金 + 科技×25 + 耕地×100)',
    final_money INT NOT NULL COMMENT '最終資金',
    final_tech INT NOT NULL DEFAULT 0 COMMENT '科技等級',
    final_land INT NOT NULL DEFAULT 6 COMMENT '剩餘耕地數',
    turns_played INT NOT NULL DEFAULT 30 COMMENT '實際回合數',
    reserve_policy TINYINT(1) DEFAULT 0 COMMENT '是否啟動國家收儲計畫',
    feedback_tags JSON COMMENT '學習反饋標籤',

    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_student (student_id),
    INDEX idx_class (class_name),
    INDEX idx_played (played_at),
    INDEX idx_score (score)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='神州菜園經營家遊戲成績';
