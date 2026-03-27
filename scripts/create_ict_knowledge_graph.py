#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""为ICT学科创建知识图谱"""

import pymysql

conn = pymysql.connect(
    host='localhost', user='root', password='12321',
    database='school_ai_assistant', charset='utf8mb4'
)
cur = conn.cursor()

# Clear existing nodes/edges for ICT
cur.execute("DELETE FROM slc_knowledge_edges WHERE subject_code = 'ICT'")
cur.execute("DELETE FROM slc_knowledge_nodes WHERE subject_code = 'ICT'")
conn.commit()

# (title, description, icon, color, node_size)
nodes = [
    # Central node
    ("ICT必修A 資訊處理", "中五ICT必修部分A課程核心知識", "💻", "#1a237e", 60),

    # Chapter 1
    ("1. 資訊系統", "資訊系統的組成、數據與資訊、資訊處理步驟", "🖥️", "#1565c0", 50),
    ("資訊系統組成部分", "系統功能、數據、科技、流程、從業員", "🔧", "#42a5f5", 35),
    ("數據與資訊", "數據是未經處理的原始事實，經處理成為有意義的資訊", "📊", "#42a5f5", 35),
    ("資訊處理步驟", "收集、組織、儲存、處理、分析、傳輸、演示七個階段", "🔄", "#42a5f5", 35),
    ("資訊素養", "確認、檢索、評估、使用及創造資訊的能力", "📖", "#42a5f5", 35),

    # Chapter 2
    ("2. 數據控制和數據組織", "數據輸入控制、有效性檢驗、數據驗證", "🛡️", "#2e7d32", 50),
    ("GIGO原則", "無用輸入無用輸出，錯誤數據產生不準確資訊", "⚠️", "#66bb6a", 35),
    ("數據有效性檢驗", "由電腦自動檢查數據是否合理(類型/範圍/格式等)", "✅", "#66bb6a", 35),
    ("檢查數位", "利用數學公式計算校驗碼，如奇偶檢測、身份證號碼", "🔢", "#66bb6a", 30),
    ("數據驗證(校驗)", "由人手檢查輸入數據是否與源文件吻合", "👁️", "#66bb6a", 35),

    # Chapter 3A
    ("3A. 數據表示", "資訊數位化、數據單位、數系轉換", "🔣", "#e65100", 50),
    ("資訊數位化", "使用離散符號(0和1)表示資訊，提高儲存效率和準確性", "🔀", "#ff9800", 35),
    ("數據單位", "位元(bit)、字節(Byte)、KB/MB/GB/TB的換算", "📏", "#ff9800", 35),
    ("數系轉換", "十進制、二進制、十六進制之間的相互轉換", "🔄", "#ff9800", 35),

    # Chapter 3B
    ("3B. 數字系統", "二進制反碼、補碼、溢出誤差", "🔢", "#e65100", 50),
    ("二進制反碼", "正數不變，負數各位取反", "➕", "#ff9800", 30),
    ("二進制補碼", "反碼加1，最常用的有符號整數表示法", "➖", "#ff9800", 30),
    ("溢出誤差", "運算結果超出位元能表示的範圍時產生", "💥", "#ff9800", 30),

    # Chapter 3C
    ("3C. 字符編碼系統", "ASCII、Big5、GB碼、Unicode的特點與比較", "🔤", "#e65100", 50),
    ("ASCII", "7位元/128字符，表示英文字母、數字及符號", "🅰️", "#ff9800", 30),
    ("Big5大五碼", "16位元，主要表達繁體中文", "🇹🇼", "#ff9800", 30),
    ("GB國標碼", "16位元，主要表達簡體中文", "🇨🇳", "#ff9800", 30),
    ("Unicode統一碼", "8-32位元，綜合世界各地文字，UTF-8是常用編碼方式", "🌍", "#ff9800", 35),

    # Chapter 3D
    ("3D. 多媒體檔案", "數碼化過程、檔案管理、資料壓縮", "📁", "#6a1b9a", 50),
    ("數碼化過程", "離散化(取樣)和量化(數值化)兩個步驟", "🎛️", "#ab47bc", 35),
    ("檔案管理", "檔案路徑、目錄結構、副檔名", "📂", "#ab47bc", 30),
    ("無損耗壓縮", "資訊不受損失，可完全恢復原樣(ZIP/RAR/PNG)", "📦", "#ab47bc", 30),
    ("有損耗壓縮", "捨棄次要資訊以大幅減少資料量(JPEG/MP3)", "🗜️", "#ab47bc", 30),

    # Chapter 3E
    ("3E. 多媒體：文本", "純文字、格式化文本、OCR、PDF", "📝", "#6a1b9a", 45),
    ("OCR光符識別", "將掃描圖像中的文字轉換為可編輯文本", "🔍", "#ab47bc", 30),

    # Chapter 3F
    ("3F. 多媒體：圖像", "點陣圖、向量圖、色彩模型、圖像格式", "🖼️", "#6a1b9a", 50),
    ("點陣圖", "以像素矩陣表示，特點：解像度、色深、檔案大小", "🟦", "#ab47bc", 35),
    ("向量圖", "以數學公式定義，縮放不失真，適合線條圖形", "📐", "#ab47bc", 35),
    ("RGB色彩模型", "加色法，紅綠藍光混合，用於屏幕顯示", "🌈", "#ab47bc", 30),
    ("CMYK色彩模型", "減色法，青洋紅黃黑油墨混合，用於印刷", "🖨️", "#ab47bc", 30),

    # Chapter 3G
    ("3G. 多媒體：音頻", "WAV類型和MIDI類型音頻的特點與比較", "🎵", "#6a1b9a", 50),
    ("WAV類型音頻", "記錄聲波震動，屬性：取樣頻率、位元深度、聲道", "🔊", "#ab47bc", 35),
    ("MIDI類型音頻", "記錄樂譜指令，檔案小但不能記錄人聲", "🎹", "#ab47bc", 35),
    ("取樣頻率與位元深度", "取樣頻率(Hz)決定音質，位元深度決定振幅精度", "📶", "#ab47bc", 30),

    # Chapter 3H
    ("3H. 多媒體：視頻", "視頻屬性、編碼解碼器、串流技術", "🎬", "#6a1b9a", 50),
    ("視頻屬性", "解像度、色深、幀速率、位元率", "📹", "#ab47bc", 35),
    ("串流技術", "邊下載邊播放，減少等候時間", "📡", "#ab47bc", 30),
    ("編碼解碼器Codec", "壓縮和解壓視像數據，缺少則無法播放", "⚙️", "#ab47bc", 30),

    # Chapter 4A
    ("4A. 試算表簡介", "檔案格式、資料輸入、列印功能", "📊", "#00695c", 50),
    ("儲存格格式", "通用/數值/文字/日期等格式，自動填滿功能", "📋", "#26a69a", 35),

    # Chapter 4B
    ("4B. 試算表函數", "儲存格參照、運算符號、常用函數", "🧮", "#00695c", 50),
    ("儲存格參照", "相對參照、絕對參照($)、混合參照", "🔗", "#26a69a", 35),
    ("基本函數", "SUM、AVERAGE、COUNT、MAX、MIN、RANK", "📈", "#26a69a", 35),
    ("IF與巢狀IF", "條件判斷函數，可配合AND/OR/NOT使用", "🔀", "#26a69a", 35),
    ("CountIF與SumIF", "按條件計數和求和", "🔢", "#26a69a", 30),
    ("XLookup", "查表函數，在範圍中尋找值並返回對應結果", "🔎", "#26a69a", 30),

    # Chapter 4C
    ("4C. 試算表演示和分析", "統計圖、樞紐分析、排序篩選、假設分析", "📉", "#00695c", 50),
    ("統計圖", "棒形圖、折線圖、圓形圖的建立步驟", "📊", "#26a69a", 35),
    ("樞紐分析表", "將資料按分組進行摘要計算(總和/平均數等)", "🔄", "#26a69a", 35),
    ("排序與篩選", "單/多準則排序，條件篩選顯示特定記錄", "🔽", "#26a69a", 30),
    ("假設分析", "分析藍本管理員和目標搜尋功能", "🎯", "#26a69a", 30),

    # Chapter 5A
    ("5A. 數據庫簡介", "數據庫概念、設計流程、數據類型", "🗄️", "#b71c1c", 50),
    ("數據層次結構", "數據庫→數據表→記錄→欄位", "🏗️", "#e53935", 35),
    ("主關鍵碼與外鍵碼", "主鍵唯一標識記錄，外鍵建立表間關聯", "🔑", "#e53935", 35),
    ("資料冗餘", "數據重覆造成空間浪費，需正規化解決", "♻️", "#e53935", 30),

    # Chapter 5B
    ("5B. SQL基礎", "SELECT查詢、WHERE條件、ORDER BY排序", "💾", "#b71c1c", 50),
    ("SELECT查詢", "基本查詢、DISTINCT去重、AS改名、計算欄位", "📋", "#e53935", 35),
    ("WHERE條件查詢", "AND/OR/NOT、IN、BETWEEN、LIKE模糊查詢", "🔍", "#e53935", 35),

    # Chapter 5C
    ("5C. SQL進階", "統計函數、GROUP BY分組、HAVING篩選", "💾", "#b71c1c", 50),
    ("SQL統計函數", "COUNT、SUM、AVG、MAX、MIN", "📊", "#e53935", 35),
    ("GROUP BY與HAVING", "GROUP BY分組統計，HAVING篩選統計結果", "📦", "#e53935", 35),
]

node_ids = {}
for title, desc, icon, color, size in nodes:
    cur.execute(
        "INSERT INTO slc_knowledge_nodes "
        "(title, description, icon, color, node_size, subject_code, created_by, created_at, updated_at) "
        "VALUES (%s, %s, %s, %s, %s, 'ICT', 'admin', NOW(), NOW())",
        (title, desc, icon, color, size)
    )
    node_ids[title] = cur.lastrowid

conn.commit()
print(f"Inserted {len(nodes)} nodes")

# (source_title, target_title, relation_type, label)
edges = [
    # Central -> Chapters
    ("ICT必修A 資訊處理", "1. 資訊系統", "contains", "包含"),
    ("ICT必修A 資訊處理", "2. 數據控制和數據組織", "contains", "包含"),
    ("ICT必修A 資訊處理", "3A. 數據表示", "contains", "包含"),
    ("ICT必修A 資訊處理", "3B. 數字系統", "contains", "包含"),
    ("ICT必修A 資訊處理", "3C. 字符編碼系統", "contains", "包含"),
    ("ICT必修A 資訊處理", "3D. 多媒體檔案", "contains", "包含"),
    ("ICT必修A 資訊處理", "3E. 多媒體：文本", "contains", "包含"),
    ("ICT必修A 資訊處理", "3F. 多媒體：圖像", "contains", "包含"),
    ("ICT必修A 資訊處理", "3G. 多媒體：音頻", "contains", "包含"),
    ("ICT必修A 資訊處理", "3H. 多媒體：視頻", "contains", "包含"),
    ("ICT必修A 資訊處理", "4A. 試算表簡介", "contains", "包含"),
    ("ICT必修A 資訊處理", "4B. 試算表函數", "contains", "包含"),
    ("ICT必修A 資訊處理", "4C. 試算表演示和分析", "contains", "包含"),
    ("ICT必修A 資訊處理", "5A. 數據庫簡介", "contains", "包含"),
    ("ICT必修A 資訊處理", "5B. SQL基礎", "contains", "包含"),
    ("ICT必修A 資訊處理", "5C. SQL進階", "contains", "包含"),

    # Chapter 1 -> Sub-topics
    ("1. 資訊系統", "資訊系統組成部分", "contains", "包含"),
    ("1. 資訊系統", "數據與資訊", "contains", "包含"),
    ("1. 資訊系統", "資訊處理步驟", "contains", "包含"),
    ("1. 資訊系統", "資訊素養", "contains", "包含"),

    # Chapter 2 -> Sub-topics
    ("2. 數據控制和數據組織", "GIGO原則", "contains", "包含"),
    ("2. 數據控制和數據組織", "數據有效性檢驗", "contains", "包含"),
    ("2. 數據控制和數據組織", "檢查數位", "contains", "包含"),
    ("2. 數據控制和數據組織", "數據驗證(校驗)", "contains", "包含"),
    ("數據有效性檢驗", "檢查數位", "contains", "方法之一"),

    # Chapter 3A -> Sub-topics
    ("3A. 數據表示", "資訊數位化", "contains", "包含"),
    ("3A. 數據表示", "數據單位", "contains", "包含"),
    ("3A. 數據表示", "數系轉換", "contains", "包含"),

    # Chapter 3B -> Sub-topics
    ("3B. 數字系統", "二進制反碼", "contains", "包含"),
    ("3B. 數字系統", "二進制補碼", "contains", "包含"),
    ("3B. 數字系統", "溢出誤差", "contains", "包含"),
    ("二進制反碼", "二進制補碼", "related", "反碼+1"),
    ("二進制補碼", "溢出誤差", "related", "可能導致"),

    # Chapter 3C -> Sub-topics
    ("3C. 字符編碼系統", "ASCII", "contains", "包含"),
    ("3C. 字符編碼系統", "Big5大五碼", "contains", "包含"),
    ("3C. 字符編碼系統", "GB國標碼", "contains", "包含"),
    ("3C. 字符編碼系統", "Unicode統一碼", "contains", "包含"),
    ("Unicode統一碼", "ASCII", "related", "完全兼容"),

    # Chapter 3D -> Sub-topics
    ("3D. 多媒體檔案", "數碼化過程", "contains", "包含"),
    ("3D. 多媒體檔案", "檔案管理", "contains", "包含"),
    ("3D. 多媒體檔案", "無損耗壓縮", "contains", "包含"),
    ("3D. 多媒體檔案", "有損耗壓縮", "contains", "包含"),

    # Chapter 3E -> Sub-topics
    ("3E. 多媒體：文本", "OCR光符識別", "contains", "包含"),

    # Chapter 3F -> Sub-topics
    ("3F. 多媒體：圖像", "點陣圖", "contains", "包含"),
    ("3F. 多媒體：圖像", "向量圖", "contains", "包含"),
    ("3F. 多媒體：圖像", "RGB色彩模型", "contains", "包含"),
    ("3F. 多媒體：圖像", "CMYK色彩模型", "contains", "包含"),
    ("點陣圖", "向量圖", "related", "對比"),
    ("RGB色彩模型", "CMYK色彩模型", "related", "對比"),

    # Chapter 3G -> Sub-topics
    ("3G. 多媒體：音頻", "WAV類型音頻", "contains", "包含"),
    ("3G. 多媒體：音頻", "MIDI類型音頻", "contains", "包含"),
    ("3G. 多媒體：音頻", "取樣頻率與位元深度", "contains", "包含"),
    ("WAV類型音頻", "MIDI類型音頻", "related", "對比"),
    ("WAV類型音頻", "取樣頻率與位元深度", "related", "屬性"),

    # Chapter 3H -> Sub-topics
    ("3H. 多媒體：視頻", "視頻屬性", "contains", "包含"),
    ("3H. 多媒體：視頻", "串流技術", "contains", "包含"),
    ("3H. 多媒體：視頻", "編碼解碼器Codec", "contains", "包含"),

    # Chapter 4A -> Sub-topics
    ("4A. 試算表簡介", "儲存格格式", "contains", "包含"),

    # Chapter 4B -> Sub-topics
    ("4B. 試算表函數", "儲存格參照", "contains", "包含"),
    ("4B. 試算表函數", "基本函數", "contains", "包含"),
    ("4B. 試算表函數", "IF與巢狀IF", "contains", "包含"),
    ("4B. 試算表函數", "CountIF與SumIF", "contains", "包含"),
    ("4B. 試算表函數", "XLookup", "contains", "包含"),
    ("IF與巢狀IF", "CountIF與SumIF", "related", "延伸"),

    # Chapter 4C -> Sub-topics
    ("4C. 試算表演示和分析", "統計圖", "contains", "包含"),
    ("4C. 試算表演示和分析", "樞紐分析表", "contains", "包含"),
    ("4C. 試算表演示和分析", "排序與篩選", "contains", "包含"),
    ("4C. 試算表演示和分析", "假設分析", "contains", "包含"),

    # Chapter 5A -> Sub-topics
    ("5A. 數據庫簡介", "數據層次結構", "contains", "包含"),
    ("5A. 數據庫簡介", "主關鍵碼與外鍵碼", "contains", "包含"),
    ("5A. 數據庫簡介", "資料冗餘", "contains", "包含"),

    # Chapter 5B -> Sub-topics
    ("5B. SQL基礎", "SELECT查詢", "contains", "包含"),
    ("5B. SQL基礎", "WHERE條件查詢", "contains", "包含"),

    # Chapter 5C -> Sub-topics
    ("5C. SQL進階", "SQL統計函數", "contains", "包含"),
    ("5C. SQL進階", "GROUP BY與HAVING", "contains", "包含"),
    ("SQL統計函數", "GROUP BY與HAVING", "related", "配合使用"),

    # Cross-chapter relationships
    ("數據與資訊", "GIGO原則", "related", "數據質量"),
    ("資訊數位化", "數碼化過程", "related", "相同概念"),
    ("數據單位", "點陣圖", "related", "計算檔案大小"),
    ("數據單位", "WAV類型音頻", "related", "計算檔案大小"),
    ("數據單位", "視頻屬性", "related", "計算檔案大小"),
    ("數系轉換", "3B. 數字系統", "related", "基礎"),
    ("數系轉換", "3C. 字符編碼系統", "related", "應用"),
    ("資訊處理步驟", "4A. 試算表簡介", "related", "工具應用"),
    ("資訊處理步驟", "5A. 數據庫簡介", "related", "工具應用"),
    ("無損耗壓縮", "有損耗壓縮", "related", "對比"),
    ("基本函數", "SQL統計函數", "related", "對應函數"),
    ("排序與篩選", "WHERE條件查詢", "related", "對應功能"),
    ("樞紐分析表", "GROUP BY與HAVING", "related", "對應功能"),

    # Prerequisite chains
    ("4A. 試算表簡介", "4B. 試算表函數", "prerequisite", "先修"),
    ("4B. 試算表函數", "4C. 試算表演示和分析", "prerequisite", "先修"),
    ("5A. 數據庫簡介", "5B. SQL基礎", "prerequisite", "先修"),
    ("5B. SQL基礎", "5C. SQL進階", "prerequisite", "先修"),
    ("3A. 數據表示", "3B. 數字系統", "prerequisite", "先修"),
    ("3A. 數據表示", "3C. 字符編碼系統", "prerequisite", "先修"),
    ("3D. 多媒體檔案", "3E. 多媒體：文本", "prerequisite", "先修"),
    ("3D. 多媒體檔案", "3F. 多媒體：圖像", "prerequisite", "先修"),
    ("3D. 多媒體檔案", "3G. 多媒體：音頻", "prerequisite", "先修"),
    ("3D. 多媒體檔案", "3H. 多媒體：視頻", "prerequisite", "先修"),
]

edge_count = 0
for src, tgt, rel_type, label in edges:
    src_id = node_ids.get(src)
    tgt_id = node_ids.get(tgt)
    if src_id and tgt_id:
        cur.execute(
            "INSERT INTO slc_knowledge_edges "
            "(source_node_id, target_node_id, relation_type, label, weight, subject_code) "
            "VALUES (%s, %s, %s, %s, 1.0, 'ICT')",
            (src_id, tgt_id, rel_type, label)
        )
        edge_count += 1
    else:
        missing = src if not src_id else tgt
        print(f"WARNING: Missing node: {missing}")

conn.commit()
print(f"Inserted {edge_count} edges")

# Verify
cur.execute("SELECT COUNT(*) FROM slc_knowledge_nodes WHERE subject_code = 'ICT' AND is_deleted = 0")
print(f"Total nodes: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM slc_knowledge_edges WHERE subject_code = 'ICT' AND is_deleted = 0")
print(f"Total edges: {cur.fetchone()[0]}")

cur.close()
conn.close()
print("Done!")
