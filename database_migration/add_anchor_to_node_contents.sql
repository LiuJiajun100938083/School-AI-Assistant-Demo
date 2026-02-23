-- 迁移：为 lc_node_contents 表新增 anchor JSON 列
-- 用于存储知识节点到内容的定位锚点
-- 锚点类型示例：
--   {"type":"page","value":5}           — PDF 页码
--   {"type":"page_range","from":8,"to":10} — PDF 页码范围
--   {"type":"heading","value":"Creating Exam"} — 标题定位
--   {"type":"timestamp","value":120}    — 视频时间戳（秒）
--   {"type":"keyword","value":"exam proctoring"} — 关键词搜索

ALTER TABLE lc_node_contents
    ADD COLUMN anchor JSON DEFAULT NULL COMMENT '定位锚点 JSON'
    AFTER sort_order;
