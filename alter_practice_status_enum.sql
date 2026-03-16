-- Fix: Add 'generating' and 'generation_failed' to practice_sessions.status ENUM
-- Error: (1265, "Data truncated for column 'status' at row 1")
-- The code inserts status='generating' but the ENUM only had: generated, in_progress, completed, expired

ALTER TABLE practice_sessions
  MODIFY COLUMN status ENUM('generating','generated','in_progress','completed','expired','generation_failed') DEFAULT 'generated';

-- Add error tracking columns if they don't exist
ALTER TABLE practice_sessions
  ADD COLUMN IF NOT EXISTS error_code VARCHAR(50) NULL COMMENT '錯誤代碼' AFTER weak_points_identified,
  ADD COLUMN IF NOT EXISTS error_message TEXT NULL COMMENT '錯誤訊息' AFTER error_code;
