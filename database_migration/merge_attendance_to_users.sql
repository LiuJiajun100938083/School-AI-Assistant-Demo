-- ============================================================
-- 合併 attendance_students 到 users 表
-- 執行時機：部署後手動執行一次
-- ============================================================

-- 1. users 表新增欄位（IF NOT EXISTS 語義由 ALTER IGNORE 模擬）
ALTER TABLE users ADD COLUMN english_name VARCHAR(100) DEFAULT '' COMMENT '英文名' AFTER display_name;
ALTER TABLE users ADD COLUMN card_id VARCHAR(50) DEFAULT NULL COMMENT '學生證 CardID' AFTER english_name;
ALTER TABLE users ADD INDEX idx_card_id (card_id);

-- 2. 已有 users 的學生：回填 english_name, card_id, class_name, class_number
UPDATE users u
JOIN attendance_students s ON u.username = s.user_login
SET u.english_name = s.english_name,
    u.card_id = s.card_id,
    u.class_name = CASE WHEN u.class_name = '' OR u.class_name IS NULL THEN s.class_name ELSE u.class_name END,
    u.class_number = CASE WHEN u.class_number IS NULL THEN s.class_number ELSE u.class_number END;

-- 3. attendance_students 中有、但 users 中沒有的學生
--    需在 Python 中處理（因為需要 bcrypt 哈希密碼），見 upsert_student() 自動建帳邏輯
--    此處僅作記錄：
-- SELECT s.user_login FROM attendance_students s
-- LEFT JOIN users u ON u.username = s.user_login
-- WHERE u.id IS NULL;

-- 4. 標記 attendance_students 為已棄用（不 DROP，保留作備份）
-- ALTER TABLE attendance_students COMMENT = 'DEPRECATED: 已合併至 users 表，保留作備份';
