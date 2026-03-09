-- Phase 1 (P0-1): 幾何信息獨立字段化
-- 為 student_mistakes 表新增三個列，將圖形描述從 tags JSON 拆出為獨立字段
-- 執行前備份: mysqldump -u root school_ai_assistant student_mistakes > backup_student_mistakes.sql

ALTER TABLE student_mistakes
  ADD COLUMN figure_description TEXT NULL
    COMMENT '結構化幾何描述 JSON（Vision 模型原始輸出）'
    AFTER ocr_answer_text,
  ADD COLUMN figure_description_readable TEXT NULL
    COMMENT '人類可讀的幾何描述（後端生成的派生緩存）'
    AFTER figure_description,
  ADD COLUMN figure_schema_version TINYINT UNSIGNED NOT NULL DEFAULT 1
    COMMENT '幾何 schema 版本：1=舊 elements 版, 2=新 4 層約束版'
    AFTER figure_description_readable;
