# 校園AI助手 - Campus AI Assistant

基於 FastAPI 的綜合教育平台，整合 AI 大語言模型能力，為師生提供個人化學習體驗。

---

## 技術棧

| 層級 | 技術 |
|------|------|
| **後端框架** | FastAPI + Uvicorn |
| **資料庫** | MySQL + 連線池 (DBUtils) |
| **認證** | JWT (PyJWT) + bcrypt |
| **AI/LLM** | LangChain + Ollama (Qwen) / DeepSeek API |
| **RAG** | ChromaDB + sentence-transformers |
| **文件處理** | python-docx, PyPDF2, openpyxl, python-pptx |
| **知識圖譜** | D3.js 力導向模擬 (自訂多圓心佈局) |
| **前端** | HTML/CSS/JS (Jinja2 模板) |

## 專案結構

```
├── app/                          # 主應用 (DDD 架構)
│   ├── main.py                   # 入口 - create_app() 工廠函式
│   ├── config/settings.py        # 統一設定管理
│   ├── core/                     # 核心模組 (認證、中介軟體、日誌)
│   ├── domains/                  # 業務領域模型 (含作業管理 + 抄襲檢測子系統)
│   ├── infrastructure/           # 資料庫、外部整合
│   ├── routers/                  # API 路由 (19 個核心模組)
│   └── services/                 # 業務邏輯層
├── llm/                          # LLM 模組
│   ├── providers/                # 模型供應商 (Ollama, DeepSeek)
│   ├── rag/                      # RAG 檢索增強生成
│   ├── services/                 # AI 問答服務
│   └── prompts/                  # 提示詞管理
├── forum_system/                 # 論壇子系統
│   ├── api/                      # 論壇 API
│   ├── service/                  # 論壇業務邏輯
│   └── dal/                      # 資料存取層
├── web_static/                   # 前端靜態資源
│   ├── js/ai_learning_center.js  # 學習中心核心 JS（知識圖譜 D3.js 渲染、AI 助教、路徑管理）
│   ├── css/ai_learning_center.css # 學習中心樣式（設計系統 CSS 變數）
│   └── ai_learning_center.html   # 學習中心頁面模板
├── data/                         # 知識圖譜 & 學習路徑 JSON 資料
│   ├── kg_*.json                 # 5 份知識圖譜（UTest、AI Agent、AI Bench、混合課堂、Zoom LTI）
│   └── learning_paths.json       # 8 條學習路徑
├── Knowledge_base/               # 知識庫文件
└── requirements.txt              # Python 依賴
```

## 功能模組

### 核心功能
- **使用者認證** — 註冊、登入、JWT Token、角色權限 (admin/teacher/student)
- **課堂管理** — 建立班級、學生加入、教師管理
- **AI 智慧問答** — 基於 RAG 的多學科 AI 對話，支援串流輸出
- **AI 學習中心** — 個人化 AI 學習助手，電子教科書閱讀 + PDF 頁碼跳轉

### AI 學習中心（重點模組）
- **知識圖譜視覺化** — D3.js 多圓心輻射佈局，每個根節點獨立成簇，支援展開/摺疊、搜尋高亮、自由拖拽
- **AI 助教 × 知識圖譜聯動** — AI 回答自動關聯知識節點，點擊 chip 標籤跳轉圖譜定位
- **學習路徑系統** — 8 條預設學習路徑，步驟可跳轉到文件或知識節點，支援 JSON 批次匯入
- **內容感知 RAG** — 閱讀 PDF 時 AI 基於當前文件內容回答，引用頁碼可點擊跳轉
- **節點→文件導航** — 知識節點關聯教程文件，支援 page/heading/timestamp/keyword 四種錨點定位

### 學習功能
- **學習任務** — 教師佈置、學生完成、進度追蹤
- **錯題本** — 錯題記錄、圖片上傳、AI 分析
- **學習模式** — 多種互動學習方式
- **中文學習** — 中文專項學習與遊戲
- **中國經濟遊戲** — 歷史經濟模擬教育遊戲

### 作業管理
- **作業 CRUD** — 教師創建作業（草稿→發布→關閉）、編輯、刪除、按班級/學生分配
- **7 種評分類型** — 簡單計分、分級量規、權重百分比、通過清單、能力等級、DSE 標準、整體評分
- **文件上傳與 AI 批改** — 學生多文件上傳，AI 按評分標準逐項打分
- **抄襲檢測引擎** — 多維度相似度分析，支持 4 種作業類型：
  - **代碼模式** — Token 結構、Winnowing（MOSS）、標識符指紋、縮排風格、數據流分析、拼錯/死代碼強物證、Cohort Suppression 批次降權
  - **中文作文模式** — 逐字重疊、句子級匈牙利匹配、語義嵌入（text2vec）、功能段落結構（叙事/議論自動識別）、54 維深層風格指紋、低頻短語連續加權、Sigmoid 多維證據、片段級證據輸出
  - **英文作文模式** — 句子對齊、語義改寫檢測、Discourse 結構、Stylometry 風格計量、罕見短語 DF 降權
  - **混合模式** — 自動識別代碼/文字，動態選擇最佳權重
- **圖聚類分析** — BFS 連通分量識別抄襲群組，智慧源頭識別（多信號綜合評分）

### 管理功能
- **簽到系統** — 簽到、統計、匯出
- **學習分析** — 資料統計、AI 學情報告
- **學科管理** — 多學科知識庫設定
- **通知系統** — AI 生成課堂通知
- **論壇系統** — 師生社群討論

## 快速開始

### 1. 安裝依賴

```bash
pip install -r requirements.txt
```

### 2. 設定環境變數

建立 `.env` 檔案：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pkms
JWT_SECRET=your_jwt_secret
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. 初始化資料庫

```bash
mysql -u root -p < create_tables.sql
mysql -u root -p < create_classroom_tables.sql
mysql -u root -p < create_classroom_tables_phase2.sql
mysql -u root -p < create_mistake_book_tables.sql
```

### 4. 啟動服務

```bash
python -m app.main
```

服務預設運行於 `http://localhost:8000`

## API 文件

啟動後存取：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Git 工作流程

### 本機開發提交

```bash
git add .
git commit -m "描述修改內容"
git push
```

### 另一台電腦同步

```bash
git pull
```

## 更新日誌

> **重要：每次重大修改後請更新 [CHANGELOG.md](./CHANGELOG.md)**

詳細更新紀錄請查看 [CHANGELOG.md](./CHANGELOG.md)

## License

Private Project - All Rights Reserved
