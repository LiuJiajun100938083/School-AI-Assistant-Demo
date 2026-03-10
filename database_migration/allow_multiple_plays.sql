-- 允許學生多次遊玩全球貿易大亨
-- 刪除 student_id 的唯一約束，改為普通索引

-- 檢查並刪除唯一約束
SET @constraint_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'trade_game_scores'
    AND INDEX_NAME = 'uk_student'
);

-- 如果存在則刪除
-- 注意：MySQL 不支持 IF EXISTS 刪除索引，需要手動檢查
-- 直接執行，如果不存在會報錯但不影響
ALTER TABLE trade_game_scores DROP INDEX uk_student;
