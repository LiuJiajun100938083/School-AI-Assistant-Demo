"""實用工具集合模組（Tools Hub）

提供小型工具(QR 碼生成、圖片轉換、PDF 合併等)。每個工具都是一個
獨立的葉節點 service（純函式,無 DB,無外部 domain 依賴）,透過
registry.TOOLS 集中註冊,首頁和 router 都讀這一份註冊表。
"""
