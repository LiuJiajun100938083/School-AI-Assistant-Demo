-- 添加 class_number（班號）到 users 表
ALTER TABLE users ADD COLUMN class_number INT DEFAULT NULL COMMENT '班號' AFTER class_name;
