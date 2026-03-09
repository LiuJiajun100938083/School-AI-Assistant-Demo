-- Phase 1 (P0-1): 歷史數據遷移 — Step 1 (SQL 批量)
-- 從 tags JSON 提取 figure_description 到獨立列
-- 注意：此 SQL 處理「tags 裡有 figure_description」的記錄
-- 手動清除 manual_question_text 中 [圖形描述：...] 前綴的部分由 Python 腳本處理（正則不可靠）

-- Step 1: 從 tags JSON 提取 figure_description 到獨立列
UPDATE student_mistakes
SET figure_description = JSON_UNQUOTE(JSON_EXTRACT(tags, '$.figure_description')),
    figure_schema_version = 1
WHERE tags IS NOT NULL
  AND JSON_EXTRACT(tags, '$.figure_description') IS NOT NULL
  AND (figure_description IS NULL OR figure_description = '');

-- Step 2: 驗證遷移結果
-- SELECT
--   COUNT(*) AS total,
--   SUM(CASE WHEN figure_description IS NOT NULL AND figure_description != '' THEN 1 ELSE 0 END) AS migrated,
--   SUM(CASE WHEN tags IS NOT NULL AND JSON_EXTRACT(tags, '$.figure_description') IS NOT NULL
--             AND (figure_description IS NULL OR figure_description = '') THEN 1 ELSE 0 END) AS failed,
--   SUM(CASE WHEN manual_question_text LIKE '[圖形描述%' THEN 1 ELSE 0 END) AS has_old_prefix
-- FROM student_mistakes WHERE is_deleted = 0;
