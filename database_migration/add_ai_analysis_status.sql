-- ============================================================
-- AI 内容分析状态字段
-- 用于追踪上传文件后的 AI 自动分析流程
-- 状态机: NULL → pending → processing → completed / failed
-- ============================================================

ALTER TABLE lc_contents
  ADD COLUMN ai_analysis_status VARCHAR(20) DEFAULT NULL
    COMMENT 'AI 分析状态: pending, processing, completed, failed',
  ADD COLUMN ai_analysis_error TEXT DEFAULT NULL
    COMMENT '分析失败时的错误信息',
  ADD COLUMN ai_analysis_at DATETIME DEFAULT NULL
    COMMENT '最后一次分析时间戳';
