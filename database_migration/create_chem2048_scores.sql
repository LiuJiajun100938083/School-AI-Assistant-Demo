-- ============================================================
-- 化學 2048 遊戲成績表
-- 記錄學生遊戲成績（允許多次遊玩，排行榜取最高分）
-- 2026-03-12
-- ============================================================

CREATE TABLE IF NOT EXISTS chem2048_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '用戶ID (users.id)',
    student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱',
    class_name VARCHAR(50) DEFAULT '' COMMENT '班級',
    score INT NOT NULL COMMENT '遊戲分數',
    highest_tile INT NOT NULL COMMENT '最高方塊值 (如 2048)',
    highest_element VARCHAR(10) NOT NULL COMMENT '最高元素符號 (如 Na)',
    highest_element_no INT NOT NULL COMMENT '最高元素序號 (如 11)',
    total_moves INT DEFAULT 0 COMMENT '總移動次數',
    tips_used INT DEFAULT 0 COMMENT '使用提示次數',
    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_student (student_id),
    INDEX idx_class (class_name),
    INDEX idx_played (played_at),
    INDEX idx_score (score DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='化學 2048 遊戲成績';
