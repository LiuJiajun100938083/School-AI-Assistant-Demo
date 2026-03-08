-- 為 conversations 表新增 assignment_id 欄位
-- 用於將作業 AI 問答的對話綁定到特定作業，防止跨作業串話

ALTER TABLE conversations ADD COLUMN assignment_id INT NULL AFTER subject;
ALTER TABLE conversations ADD INDEX idx_assignment (assignment_id);
