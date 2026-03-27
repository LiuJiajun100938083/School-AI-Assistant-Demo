-- 为 lc_contents 添加 PDF 预览文件路径
-- 用于存储 DOCX/PPTX 等非 PDF 文档转换后的 PDF 预览版本
ALTER TABLE lc_contents
  ADD COLUMN preview_path VARCHAR(500) DEFAULT NULL COMMENT 'PDF 预览文件路径';
