-- 為錯題本增加多張照片支持
-- extra_image_paths 存放 JSON 陣列，紀錄除第一張以外的額外圖片路徑
-- 例如: ["uploads/mistakes/alice/math/abc123_p2.jpg", "uploads/mistakes/alice/math/abc123_p3.jpg"]

ALTER TABLE student_mistakes
    ADD COLUMN extra_image_paths TEXT DEFAULT NULL
    COMMENT '額外圖片路徑（JSON 陣列）'
    AFTER original_image_path;
