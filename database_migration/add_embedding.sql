-- 為錯題表添加 Qwen Embedding 向量欄位
-- 執行時機：首次部署此功能時手動執行，或通過 startup migration 自動執行
-- 使用 IF NOT EXISTS 保護，重複執行安全

ALTER TABLE student_mistakes
  ADD COLUMN IF NOT EXISTS embedding_vector JSON        NULL    COMMENT 'Qwen text-embedding-v4 1024維向量',
  ADD COLUMN IF NOT EXISTS embedding_model  VARCHAR(50) NULL    COMMENT '生成向量所用的模型名稱',
  ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    COMMENT 'pending=未生成 | done=已生成 | failed=生成失敗';
