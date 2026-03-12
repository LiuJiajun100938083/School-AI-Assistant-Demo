-- ============================================================
-- 課室日誌測試數據：模擬一天 (2026-03-12) 的課堂記錄
-- 班級：1A, 1B, 1C, 1D, 1S
-- 每班 9 節課 (period 1-9)，共 45 條記錄
-- ============================================================

-- 先確保班級存在
INSERT IGNORE INTO classes (class_code, class_name, grade) VALUES
('1A', '1A', 'S1'),
('1B', '1B', 'S1'),
('1C', '1C', 'S1'),
('1D', '1D', 'S1'),
('1S', '1S', 'S1');

-- 清除當天已有記錄（方便重複執行）
DELETE FROM class_diary_entries WHERE entry_date = '2026-03-12' AND class_code IN ('1A','1B','1C','1D','1S');

-- ============================================================
-- 1A 班 — 整體紀律良好，有少量表揚
-- ============================================================
INSERT INTO class_diary_entries
(class_code, entry_date, period_start, period_end, subject, discipline_rating, cleanliness_rating,
 absent_students, late_students, commended_students, rule_violations, appearance_issues, medical_room_students,
 submitted_by, submitted_from) VALUES

-- 1A 第1節 中文
('1A','2026-03-12',1,1,'中文',5,5,
 '','',
 '[{"reason_code":"ATTENTIVE","reason_text":"認真聽講","students":["陳大文","李小明"]}]',
 '','','',
 'teacher_wong','web'),

-- 1A 第2節 英文
('1A','2026-03-12',2,2,'英文',4,5,
 '張家豪','',
 '[{"reason_code":"ANSWER","reason_text":"勇於回答問題","students":["王美玲"]}]',
 '','','',
 'teacher_chan','web'),

-- 1A 第3節 數學
('1A','2026-03-12',3,3,'數學',5,4,
 '張家豪','',
 '','','','',
 'teacher_lee','web'),

-- 1A 第4節 歷史
('1A','2026-03-12',4,4,'歷史',4,4,
 '張家豪','林志偉',
 '',
 '[{"reason_code":"CHAT","reason_text":"聊天","students":["黃偉強"]}]',
 '','',
 'teacher_lam','web'),

-- 1A 第5節 物理
('1A','2026-03-12',5,5,'物理',5,5,
 '','',
 '[{"reason_code":"OUTSTANDING","reason_text":"表現出色","students":["陳大文"]}]',
 '','','',
 'teacher_ho','web'),

-- 1A 第6節 中文
('1A','2026-03-12',6,6,'中文',4,5,
 '','',
 '','','','',
 'teacher_wong','web'),

-- 1A 第7節 ICT
('1A','2026-03-12',7,7,'ICT',5,4,
 '','',
 '[{"reason_code":"ACTIVE","reason_text":"上課積極","students":["李小明","王美玲","何嘉欣"]}]',
 '','','',
 'teacher_yip','web'),

-- 1A 第8節 地理
('1A','2026-03-12',8,8,'地理',4,4,
 '','陳志強',
 '','','','',
 'teacher_ng','web'),

-- 1A 第9節 數學
('1A','2026-03-12',9,9,'數學',5,5,
 '','',
 '','','','',
 'teacher_lee','web'),

-- ============================================================
-- 1B 班 — 紀律一般，有課堂違規
-- ============================================================

-- 1B 第1節 英文
('1B','2026-03-12',1,1,'英文',3,4,
 '','',
 '',
 '[{"reason_code":"CHAT","reason_text":"聊天","students":["劉國華","鄭志明"]},{"reason_code":"INATTENTIVE","reason_text":"不認真","students":["周家明"]}]',
 '','',
 'teacher_chan','web'),

-- 1B 第2節 中文
('1B','2026-03-12',2,2,'中文',4,4,
 '吳嘉琪','',
 '','','','',
 'teacher_wong','web'),

-- 1B 第3節 公民與社會發展
('1B','2026-03-12',3,3,'公民與社會發展',3,3,
 '吳嘉琪','',
 '',
 '[{"reason_code":"PHONE","reason_text":"使用手機","students":["劉國華"]}]',
 '','',
 'teacher_lam','web'),

-- 1B 第4節 數學
('1B','2026-03-12',4,4,'數學',4,4,
 '吳嘉琪','鄭志明',
 '[{"reason_code":"ANSWER","reason_text":"勇於回答問題","students":["林嘉敏"]}]',
 '','','',
 'teacher_lee','web'),

-- 1B 第5節 化學
('1B','2026-03-12',5,5,'化學',3,3,
 '','',
 '',
 '[{"reason_code":"HORSEPLAY","reason_text":"嬉戲打鬧","students":["劉國華","周家明"]}]',
 '','',
 'teacher_ho','web'),

-- 1B 第6節 英文
('1B','2026-03-12',6,6,'英文',4,4,
 '','',
 '','','','',
 'teacher_chan','web'),

-- 1B 第7節 中史
('1B','2026-03-12',7,7,'中史',3,4,
 '','',
 '',
 '[{"reason_code":"SLEEP","reason_text":"睡覺","students":["鄭志明"]}]',
 '','',
 'teacher_ng','web'),

-- 1B 第8節 數學
('1B','2026-03-12',8,8,'數學',4,4,
 '','',
 '','','','',
 'teacher_lee','web'),

-- 1B 第9節 生物
('1B','2026-03-12',9,9,'生物',4,3,
 '','',
 '',
 '',
 '[{"reason_code":"UNIFORM","reason_text":"未穿整齊校服","students":["劉國華"]}]',
 '',
 'teacher_yip','web'),

-- ============================================================
-- 1C 班 — 紀律較差，多項問題
-- ============================================================

-- 1C 第1節 數學
('1C','2026-03-12',1,1,'數學',2,3,
 '蔡明志、謝家欣','',
 '',
 '[{"reason_code":"DISRUPT","reason_text":"擾亂課堂秩序","students":["趙偉傑"]},{"reason_code":"CHAT","reason_text":"聊天","students":["孫文軒","馮嘉慧"]}]',
 '','',
 'teacher_lee','web'),

-- 1C 第2節 英文
('1C','2026-03-12',2,2,'英文',3,3,
 '蔡明志、謝家欣','趙偉傑',
 '',
 '[{"reason_code":"INATTENTIVE","reason_text":"不認真","students":["孫文軒"]}]',
 '[{"reason_code":"TIE","reason_text":"領帶不整","students":["馮嘉慧"]}]',
 '',
 'teacher_chan','web'),

-- 1C 第3節 中文
('1C','2026-03-12',3,3,'中文',3,3,
 '蔡明志','',
 '[{"reason_code":"ACTIVE","reason_text":"上課積極","students":["鄧美詩"]}]',
 '','','',
 'teacher_wong','web'),

-- 1C 第4節 經濟
('1C','2026-03-12',4,4,'經濟',2,2,
 '蔡明志','',
 '',
 '[{"reason_code":"IPAD","reason_text":"違規使用iPad","students":["趙偉傑","孫文軒"]},{"reason_code":"CHAT","reason_text":"聊天","students":["馮嘉慧","潘子晴"]}]',
 '','',
 'teacher_lam','web'),

-- 1C 第5節 物理
('1C','2026-03-12',5,5,'物理',3,3,
 '','',
 '',
 '[{"reason_code":"PHONE","reason_text":"使用手機","students":["趙偉傑"]}]',
 '',
 '[{"reason_code":"HEADACHE","reason_text":"頭痛","students":["潘子晴"]}]',
 'teacher_ho','web'),

-- 1C 第6節 數學
('1C','2026-03-12',6,6,'數學',3,3,
 '潘子晴','',
 '','','','',
 'teacher_lee','web'),

-- 1C 第7節 英文
('1C','2026-03-12',7,7,'英文',2,3,
 '潘子晴','',
 '',
 '[{"reason_code":"DISRUPT","reason_text":"擾亂課堂秩序","students":["趙偉傑"]},{"reason_code":"SLEEP","reason_text":"睡覺","students":["孫文軒"]}]',
 '','',
 'teacher_chan','web'),

-- 1C 第8節 B1
('1C','2026-03-12',8,8,'B1',3,4,
 '','',
 '','','','',
 'teacher_yip','web'),

-- 1C 第9節 地理
('1C','2026-03-12',9,9,'地理',3,3,
 '','',
 '',
 '[{"reason_code":"CHAT","reason_text":"聊天","students":["馮嘉慧"]}]',
 '[{"reason_code":"SHOES","reason_text":"未穿校鞋","students":["趙偉傑"]}]',
 '',
 'teacher_ng','web'),

-- ============================================================
-- 1D 班 — 整體優良，多項表揚
-- ============================================================

-- 1D 第1節 中文
('1D','2026-03-12',1,1,'中文',5,5,
 '','',
 '[{"reason_code":"ATTENTIVE","reason_text":"認真聽講","students":["梁嘉怡","鍾浩然","葉曉琳"]}]',
 '','','',
 'teacher_wong','web'),

-- 1D 第2節 數學
('1D','2026-03-12',2,2,'數學',5,5,
 '','',
 '[{"reason_code":"OUTSTANDING","reason_text":"表現出色","students":["梁嘉怡"]},{"reason_code":"ANSWER","reason_text":"勇於回答問題","students":["鍾浩然"]}]',
 '','','',
 'teacher_lee','web'),

-- 1D 第3節 英文
('1D','2026-03-12',3,3,'英文',4,5,
 '何俊傑','',
 '','','','',
 'teacher_chan','web'),

-- 1D 第4節 化學
('1D','2026-03-12',4,4,'化學',5,5,
 '何俊傑','',
 '[{"reason_code":"SELF_STUDY","reason_text":"主動學習","students":["葉曉琳"]}]',
 '','','',
 'teacher_ho','web'),

-- 1D 第5節 中史
('1D','2026-03-12',5,5,'中史',5,4,
 '','',
 '[{"reason_code":"ACTIVE","reason_text":"上課積極","students":["梁嘉怡","鍾浩然"]}]',
 '','','',
 'teacher_ng','web'),

-- 1D 第6節 數學
('1D','2026-03-12',6,6,'數學',4,5,
 '','',
 '','','','',
 'teacher_lee','web'),

-- 1D 第7節 生物
('1D','2026-03-12',7,7,'生物',5,5,
 '','',
 '[{"reason_code":"HELPFUL","reason_text":"樂於助人","students":["葉曉琳"]}]',
 '','','',
 'teacher_yip','web'),

-- 1D 第8節 英文
('1D','2026-03-12',8,8,'英文',4,4,
 '','鍾浩然',
 '','',
 '',
 '',
 'teacher_chan','web'),

-- 1D 第9節 ICT
('1D','2026-03-12',9,9,'ICT',5,5,
 '','',
 '[{"reason_code":"OUTSTANDING","reason_text":"表現出色","students":["梁嘉怡","葉曉琳"]}]',
 '','','',
 'teacher_yip','web'),

-- ============================================================
-- 1S 班 — 中等水平，有儀表及醫務室記錄
-- ============================================================

-- 1S 第1節 英文
('1S','2026-03-12',1,1,'英文',4,3,
 '','許文龍',
 '',
 '',
 '[{"reason_code":"HAIR","reason_text":"頭髮過長/染髮","students":["許文龍"]},{"reason_code":"SHIRT","reason_text":"未將恤衫塞入西褲","students":["蘇子健"]}]',
 '',
 'teacher_chan','web'),

-- 1S 第2節 中文
('1S','2026-03-12',2,2,'中文',4,4,
 '','',
 '[{"reason_code":"ATTENTIVE","reason_text":"認真聽講","students":["朱嘉慧"]}]',
 '','','',
 'teacher_wong','web'),

-- 1S 第3節 數學
('1S','2026-03-12',3,3,'數學',3,4,
 '','',
 '',
 '[{"reason_code":"CHAT","reason_text":"聊天","students":["蘇子健","許文龍"]}]',
 '','',
 'teacher_lee','web'),

-- 1S 第4節 公民與社會發展
('1S','2026-03-12',4,4,'公民與社會發展',4,4,
 '','',
 '','','',
 '[{"reason_code":"STOMACH","reason_text":"肚痛","students":["朱嘉慧"]}]',
 'teacher_lam','web'),

-- 1S 第5節 地理
('1S','2026-03-12',5,5,'地理',3,3,
 '朱嘉慧','',
 '',
 '[{"reason_code":"INATTENTIVE","reason_text":"不認真","students":["蘇子健"]}]',
 '',
 '',
 'teacher_ng','web'),

-- 1S 第6節 英文
('1S','2026-03-12',6,6,'英文',4,4,
 '朱嘉慧','',
 '','','','',
 'teacher_chan','web'),

-- 1S 第7節 中文
('1S','2026-03-12',7,7,'中文',4,4,
 '朱嘉慧','',
 '[{"reason_code":"ANSWER","reason_text":"勇於回答問題","students":["馬凱琳"]}]',
 '','','',
 'teacher_wong','web'),

-- 1S 第8節 B2
('1S','2026-03-12',8,8,'B2',3,3,
 '','',
 '',
 '[{"reason_code":"HORSEPLAY","reason_text":"嬉戲打鬧","students":["蘇子健","許文龍"]}]',
 '[{"reason_code":"JACKET","reason_text":"校褸不整","students":["許文龍"]}]',
 '',
 'teacher_yip','web'),

-- 1S 第9節 歷史
('1S','2026-03-12',9,9,'歷史',4,4,
 '','',
 '',
 '',
 '',
 '[{"reason_code":"UNWELL","reason_text":"身體不適","students":["馬凱琳"]}]',
 'teacher_lam','web');

-- ============================================================
-- 驗證
-- ============================================================
SELECT class_code,
       COUNT(*) AS total_records,
       ROUND(AVG(discipline_rating),1) AS avg_discipline,
       ROUND(AVG(cleanliness_rating),1) AS avg_cleanliness
FROM class_diary_entries
WHERE entry_date = '2026-03-12' AND class_code IN ('1A','1B','1C','1D','1S')
GROUP BY class_code
ORDER BY class_code;
