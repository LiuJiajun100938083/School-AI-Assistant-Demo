#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将ICT知识图谱节点关联到PDF具体页码"""

import json
import pymysql

conn = pymysql.connect(
    host='localhost', user='root', password='12321',
    database='school_ai_assistant', charset='utf8mb4'
)
cur = conn.cursor(pymysql.cursors.DictCursor)

# 1. Create content entry for the PDF
cur.execute("""
    INSERT INTO slc_contents
    (title, description, content_type, file_path, file_name, file_size, mime_type,
     tags, status, subject_code, grade_level, created_by, created_at, updated_at)
    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
""", (
    "2025-26中五ICT必修A 資訊處理",
    "中五ICT必修部分A完整教材，涵蓋資訊系統、數據控制、數據表示、多媒體、試算表、數據庫及SQL",
    "document",
    "uploads/school_learning_center/documents/ict_compulsory_a.pdf",
    "2025-26中五ICT必修A.pdf",
    3183155,
    "application/pdf",
    json.dumps(["ICT", "資訊處理", "必修A", "中五", "HKDSE"], ensure_ascii=False),
    "published",
    "ICT",
    "中五",
    "admin",
))
content_id = cur.lastrowid
conn.commit()
print(f"Created content entry: id={content_id}")

# 2. Get all node IDs
cur.execute("SELECT id, title FROM slc_knowledge_nodes WHERE subject_code = 'ICT' AND is_deleted = 0")
nodes = {row['title']: row['id'] for row in cur.fetchall()}
print(f"Found {len(nodes)} nodes")

# 3. Define node -> page mappings
# (node_title, start_page, end_page_or_none)
node_page_map = [
    # Central
    ("ICT必修A 資訊處理", 1, None),

    # Chapter 1: 資訊系統 (pages 3-4)
    ("1. 資訊系統", 3, None),
    ("資訊系統組成部分", 3, None),
    ("數據與資訊", 3, None),
    ("資訊處理步驟", 4, None),
    ("資訊素養", 4, None),

    # Chapter 2: 數據控制 (pages 5-7)
    ("2. 數據控制和數據組織", 5, None),
    ("GIGO原則", 5, None),
    ("數據有效性檢驗", 5, None),
    ("檢查數位", 6, None),
    ("數據驗證(校驗)", 7, None),

    # Chapter 3A: 數據表示 (pages 10-11)
    ("3A. 數據表示", 10, None),
    ("資訊數位化", 10, None),
    ("數據單位", 10, None),
    ("數系轉換", 11, None),

    # Chapter 3B: 數字系統 (pages 12-13)
    ("3B. 數字系統", 12, None),
    ("二進制反碼", 12, None),
    ("二進制補碼", 12, None),
    ("溢出誤差", 13, None),

    # Chapter 3C: 字符編碼 (pages 16-17)
    ("3C. 字符編碼系統", 16, None),
    ("ASCII", 17, None),
    ("Big5大五碼", 17, None),
    ("GB國標碼", 17, None),
    ("Unicode統一碼", 17, None),

    # Chapter 3D: 多媒體檔案 (pages 19-21)
    ("3D. 多媒體檔案", 19, None),
    ("數碼化過程", 19, None),
    ("檔案管理", 20, None),
    ("無損耗壓縮", 21, None),
    ("有損耗壓縮", 21, None),

    # Chapter 3E: 文本 (page 23)
    ("3E. 多媒體：文本", 23, None),
    ("OCR光符識別", 23, None),

    # Chapter 3F: 圖像 (pages 25-27)
    ("3F. 多媒體：圖像", 25, None),
    ("點陣圖", 25, None),
    ("向量圖", 27, None),
    ("RGB色彩模型", 26, None),
    ("CMYK色彩模型", 26, None),

    # Chapter 3G: 音頻 (pages 29-30)
    ("3G. 多媒體：音頻", 29, None),
    ("WAV類型音頻", 29, None),
    ("MIDI類型音頻", 30, None),
    ("取樣頻率與位元深度", 29, None),

    # Chapter 3H: 視頻 (pages 32-34)
    ("3H. 多媒體：視頻", 32, None),
    ("視頻屬性", 32, None),
    ("串流技術", 33, None),
    ("編碼解碼器Codec", 34, None),

    # Chapter 4A: 試算表簡介 (pages 36-38)
    ("4A. 試算表簡介", 36, None),
    ("儲存格格式", 37, None),

    # Chapter 4B: 試算表函數 (pages 41-48)
    ("4B. 試算表函數", 41, None),
    ("儲存格參照", 41, None),
    ("基本函數", 42, None),
    ("IF與巢狀IF", 44, None),
    ("CountIF與SumIF", 44, None),
    ("XLookup", 46, None),

    # Chapter 4C: 試算表分析 (pages 51-55)
    ("4C. 試算表演示和分析", 51, None),
    ("統計圖", 51, None),
    ("樞紐分析表", 52, None),
    ("排序與篩選", 54, None),
    ("假設分析", 55, None),

    # Chapter 5A: 數據庫 (pages 58-60)
    ("5A. 數據庫簡介", 58, None),
    ("數據層次結構", 58, None),
    ("主關鍵碼與外鍵碼", 59, None),
    ("資料冗餘", 60, None),

    # Chapter 5B: SQL-1 (pages 62-66)
    ("5B. SQL基礎", 62, None),
    ("SELECT查詢", 63, None),
    ("WHERE條件查詢", 65, None),

    # Chapter 5C: SQL-2 (pages 69-71)
    ("5C. SQL進階", 69, None),
    ("SQL統計函數", 69, None),
    ("GROUP BY與HAVING", 70, None),
]

# 4. Insert node-content links with page anchors
link_count = 0
for title, page, end_page in node_page_map:
    node_id = nodes.get(title)
    if not node_id:
        print(f"WARNING: Node not found: {title}")
        continue

    anchor = {"type": "page", "value": page}
    if end_page:
        anchor["end"] = end_page

    anchor_json = json.dumps(anchor, ensure_ascii=False)
    cur.execute("""
        INSERT INTO slc_node_contents (node_id, content_id, sort_order, anchor)
        VALUES (%s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE anchor = VALUES(anchor)
    """, (node_id, content_id, 0, anchor_json))
    link_count += 1

conn.commit()
print(f"Linked {link_count} nodes to PDF pages")

# Verify
cur.execute("""
    SELECT COUNT(*) as cnt FROM slc_node_contents nc
    JOIN slc_knowledge_nodes n ON nc.node_id = n.id
    WHERE n.subject_code = 'ICT'
""")
print(f"Total node-content links: {cur.fetchone()['cnt']}")

cur.close()
conn.close()
print("Done!")
