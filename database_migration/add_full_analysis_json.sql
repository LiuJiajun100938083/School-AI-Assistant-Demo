-- 為 student_analysis_reports 表添加 full_analysis_json 欄位
-- 用於存儲完整的 AI 分析報告 JSON 數據

ALTER TABLE student_analysis_reports
ADD COLUMN IF NOT EXISTS full_analysis_json LONGTEXT NULL
COMMENT '完整分析報告 JSON'
AFTER risk_level;
