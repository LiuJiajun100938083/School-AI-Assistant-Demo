-- 為 student_mistakes.status 添加 cancelled 狀態（取消識別功能）
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
        'analysis_failed',
        'cancelled'
    ) DEFAULT 'pending_ocr' COMMENT '錯題狀態';
