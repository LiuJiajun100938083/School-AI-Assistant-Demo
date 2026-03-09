-- Phase 2 (P1-3): OCR 置信度拆分
-- 為 student_mistakes 表新增分項置信度列
-- 數學題：{"question": 0.9, "answer": 0.7, "figure": 0.8}
-- 非數學題：NULL（不拆分）

ALTER TABLE student_mistakes
  ADD COLUMN confidence_breakdown JSON NULL
    COMMENT '分項置信度 {"question": 0.9, "answer": 0.7, "figure": 0.8}，非數學科為 NULL'
    AFTER confidence_score;
