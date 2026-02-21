-- 为 lc_contents 表添加 sort_order 列，支持内容排序
ALTER TABLE lc_contents
    ADD COLUMN sort_order INT DEFAULT 0 COMMENT '排序权重（越小越靠前）'
    AFTER status;

-- 添加索引以加速排序查询
ALTER TABLE lc_contents
    ADD INDEX idx_sort_order (sort_order);
