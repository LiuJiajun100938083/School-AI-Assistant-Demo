-- 為 student_mistakes.status 欄位添加新的背景處理狀態值
-- 新增: processing, ocr_failed, needs_review, analysis_failed
-- 執行前請確認當前資料庫中的 ENUM 值

ALTER TABLE student_mistakes
    MODIFY COLUMN status ENUM(
        'pending_ocr',
        'pending_review',
        'analyzed',
        'practicing',
        'mastered',
        'processing',
        'ocr_failed',
        'needs_review',
        'analysis_failed'
    ) DEFAULT 'pending_ocr' COMMENT '錯題狀態';
