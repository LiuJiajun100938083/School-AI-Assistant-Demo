-- ============================================================
-- 全球貿易大亨遊戲成績表
-- 記錄學生遊戲成績與行為分析數據
-- 每位學生只能有一條記錄（UNIQUE INDEX uk_student）
-- 2026-03-02
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_game_scores (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL COMMENT '用戶ID (users.id)',
    student_name VARCHAR(100) NOT NULL COMMENT '顯示名稱',
    class_name VARCHAR(50) DEFAULT '' COMMENT '班級',
    difficulty VARCHAR(10) NOT NULL COMMENT 'EASY/NORMAL/HARD',
    player_spec VARCHAR(10) NOT NULL COMMENT 'AGRI/IND/TECH',
    ai_spec VARCHAR(10) NOT NULL COMMENT 'AGRI/IND/TECH',
    result ENUM('win', 'lose', 'bankrupt') NOT NULL,
    player_score INT NOT NULL COMMENT '綜合國力分 (資金 + 安全指數×20)',
    ai_score INT NOT NULL,
    turns_played INT NOT NULL DEFAULT 20,
    final_money INT NOT NULL,
    final_security INT NOT NULL,
    final_inventory JSON,

    -- 行為分析（教育評估用）
    total_trades INT DEFAULT 0,
    good_trades INT DEFAULT 0,
    bad_trades INT DEFAULT 0,
    security_invests INT DEFAULT 0,
    sanctions_used INT DEFAULT 0,
    tips_read INT DEFAULT 0,
    bankrupt_reason VARCHAR(20) DEFAULT NULL COMMENT 'money/security/null',
    feedback_tags JSON COMMENT '學習反饋標籤',

    played_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- 索引
    INDEX idx_student (student_id),
    INDEX idx_class (class_name),
    INDEX idx_played (played_at),
    INDEX idx_difficulty (difficulty),
    UNIQUE INDEX uk_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
COMMENT='全球貿易大亨遊戲成績';
