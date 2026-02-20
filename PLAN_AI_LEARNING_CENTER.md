# AI 教師學習中心 - 實現方案

## 一、整體架構設計

### 核心理念
不做傳統的「課程列表 → 章節 → 播放」線性結構，而是打造一個 **多維度知識探索平台**，融合以下五種知識呈現方式：

```
┌─────────────────────────────────────────────────────┐
│              AI 教師學習中心 (主頁面)                  │
├─────────┬──────────┬──────────┬──────────┬──────────┤
│ 🗺️ 知識  │ 📚 學習   │ 🎬 媒體   │ 🤖 AI    │ 📋 資源  │
│ 地圖     │ 路徑     │ 資料庫    │ 助教     │ 庫      │
│ (探索)   │ (系統)   │ (瀏覽)    │ (問答)   │ (下載)  │
└─────────┴──────────┴──────────┴──────────┴──────────┘
```

### 五大知識展現模式

| 模式 | 說明 | 適用場景 |
|------|------|----------|
| **知識地圖** | 可視化的知識節點網絡圖，點擊節點展開學習內容，節點間連線展示知識關聯 | 探索型學習，理解知識結構 |
| **學習路徑** | 線性的步驟引導，類似遊戲關卡解鎖，逐步推進 | 系統學習，從入門到進階 |
| **媒體資料庫** | 瀑布流/分類網格展示所有視頻、文檔、圖片，支持標籤篩選 | 快速查找特定教學資源 |
| **AI 助教** | 嵌入 RAG 系統的即時問答，能引用已上傳的教學資料回答問題 | 學習過程中即時答疑 |
| **資源庫** | 分類整理的文檔下載區，支持預覽 | 教學文件管理、共享 |

---

## 二、頁面設計（前端）

### 2.1 入口：首頁應用卡片
在 `DEFAULT_APP_MODULES` 中新增一個卡片：
```python
{
    "id": "ai_learning_center",
    "name": "AI 學習中心",
    "icon": "🧠",
    "description": "探索AI知識，多維度學習體驗",
    "url": "/ai-learning-center",
    "roles": ["student", "teacher", "admin"],
    "enabled": True,
    "order": 2,  # 排在前面
    "category": "learning",
}
```

### 2.2 學習中心主頁 (`ai_learning_center.html`)
Apple 風格設計，遵循現有 `index.css` 設計語言：

**頂部 Hero 區域：**
- 大標題「AI 學習中心」+ 動態副標題
- 搜索框（全局搜索所有內容）
- 統計數據（課程數、視頻數、文檔數）

**Tab 導航（5個模式切換）：**
- 知識地圖 | 學習路徑 | 媒體資料庫 | AI 助教 | 資源庫
- 使用現有 `.tab-nav` 設計風格

**核心視圖區域（根據 Tab 切換）：**

#### 視圖 1：知識地圖（使用 D3.js 力導向圖）
- 每個知識點是一個圓形節點
- 節點大小 = 內容豐富程度
- 連線 = 知識點關聯
- 點擊節點 → 側邊面板展開該知識點的內容（文檔、視頻、圖片）
- 可縮放、拖拽

#### 視圖 2：學習路徑
- 時間線/路線圖設計
- 管理員可創建多條學習路徑
- 每條路徑包含多個步驟
- 每個步驟包含：標題 + 描述 + 附帶的學習資源（視頻/文檔/圖片）
- 卡片式展示，水平滾動或垂直時間線

#### 視圖 3：媒體資料庫
- 頂部：分類標籤篩選 + 內容類型篩選（視頻/文檔/圖片/全部）
- 內容區：響應式網格 / 瀑布流
- 視頻卡片：縮略圖 + 時長 + 標題
- 文檔卡片：圖標 + 標題 + 摘要
- 圖片卡片：預覽圖 + 標題
- 點擊 → 模態框內播放/預覽

#### 視圖 4：AI 助教
- 類似現有 AI Chat 界面風格
- 但上下文限定在學習中心已上傳的教學資料
- 支持「引用來源」：AI 回答時標註是從哪個文檔/視頻引用的
- 可以在學習任何內容時，側邊浮出 AI 助教面板

#### 視圖 5：資源庫
- 樹形分類目錄
- 文件列表（名稱、大小、類型、上傳時間）
- 預覽 + 下載

### 2.3 管理員後台（教學內容管理）
在現有 Admin Dashboard 中新增一個 Tab，或者在學習中心頁面內集成管理面板（僅管理員/教師可見）：

**內容管理功能：**
1. **分類管理** - 創建/編輯/刪除知識分類（標籤系統）
2. **內容上傳** - 拖拽上傳文檔（PDF/DOCX/PPTX）、視頻（MP4 + 外部鏈接）、圖片
3. **知識點管理** - 創建知識點節點，設定關聯關係
4. **學習路徑編輯** - 拖拽排列路徑步驟，關聯資源
5. **內容預覽** - 上傳後即時預覽效果

---

## 三、後端架構（遵循現有 DDD 模式）

### 3.1 新增 Domain：`ai_learning_center`

```
app/domains/ai_learning_center/
├── __init__.py
├── repository.py    # 5 個 Repository 類
└── service.py       # 1 個 Service 類
```

### 3.2 數據庫表設計（6 張表）

```sql
-- 1. 分類表
CREATE TABLE lc_categories (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    slug VARCHAR(100) NOT NULL UNIQUE,
    icon VARCHAR(10) DEFAULT '📁',
    description TEXT,
    parent_id INT DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 2. 內容/資源表（核心表）
CREATE TABLE lc_contents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_type ENUM('video_local', 'video_external', 'document', 'image', 'article') NOT NULL,

    -- 文件相關
    file_path VARCHAR(500),           -- 本地文件路徑
    file_name VARCHAR(255),
    file_size BIGINT DEFAULT 0,
    mime_type VARCHAR(100),

    -- 外部視頻
    external_url VARCHAR(500),        -- YouTube/Bilibili 鏈接
    video_platform VARCHAR(50),       -- youtube/bilibili/other

    -- 富文本文章
    article_content LONGTEXT,         -- Markdown/HTML 內容

    -- 元數據
    thumbnail_path VARCHAR(500),      -- 縮略圖
    duration INT DEFAULT 0,           -- 視頻時長（秒）
    tags JSON,                        -- ["AI基礎", "機器學習"]
    metadata JSON,                    -- 擴展字段

    -- 狀態
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    view_count INT DEFAULT 0,

    -- 審計
    created_by VARCHAR(100) NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,

    INDEX idx_type (content_type),
    INDEX idx_status (status),
    INDEX idx_created (created_at),
    FULLTEXT idx_search (title, description)
);

-- 3. 內容-分類關聯表（多對多）
CREATE TABLE lc_content_categories (
    content_id INT NOT NULL,
    category_id INT NOT NULL,
    PRIMARY KEY (content_id, category_id),
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE,
    FOREIGN KEY (category_id) REFERENCES lc_categories(id) ON DELETE CASCADE
);

-- 4. 知識點表（知識地圖節點）
CREATE TABLE lc_knowledge_nodes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '💡',
    color VARCHAR(20) DEFAULT '#006633',

    -- 位置（地圖佈局）
    position_x FLOAT DEFAULT 0,
    position_y FLOAT DEFAULT 0,

    category_id INT,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0,

    FOREIGN KEY (category_id) REFERENCES lc_categories(id)
);

-- 5. 知識點連線表
CREATE TABLE lc_knowledge_edges (
    id INT AUTO_INCREMENT PRIMARY KEY,
    source_node_id INT NOT NULL,
    target_node_id INT NOT NULL,
    relation_type VARCHAR(50) DEFAULT 'related',  -- prerequisite/related/extends
    label VARCHAR(100),

    FOREIGN KEY (source_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (target_node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    UNIQUE KEY uk_edge (source_node_id, target_node_id)
);

-- 6. 知識點-內容關聯
CREATE TABLE lc_node_contents (
    node_id INT NOT NULL,
    content_id INT NOT NULL,
    sort_order INT DEFAULT 0,
    PRIMARY KEY (node_id, content_id),
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id) ON DELETE CASCADE
);

-- 7. 學習路徑表
CREATE TABLE lc_learning_paths (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(10) DEFAULT '🗺️',
    cover_image VARCHAR(500),
    difficulty ENUM('beginner', 'intermediate', 'advanced') DEFAULT 'beginner',
    estimated_hours FLOAT DEFAULT 0,
    status ENUM('draft', 'published', 'archived') DEFAULT 'draft',
    sort_order INT DEFAULT 0,
    created_by VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted TINYINT(1) DEFAULT 0
);

-- 8. 學習路徑步驟表
CREATE TABLE lc_path_steps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    path_id INT NOT NULL,
    step_order INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_id INT,                   -- 關聯的內容
    node_id INT,                      -- 關聯的知識點

    FOREIGN KEY (path_id) REFERENCES lc_learning_paths(id) ON DELETE CASCADE,
    FOREIGN KEY (content_id) REFERENCES lc_contents(id),
    FOREIGN KEY (node_id) REFERENCES lc_knowledge_nodes(id),
    INDEX idx_path_order (path_id, step_order)
);
```

### 3.3 Router 端點設計

```
# ============ 公開端點（學生/教師/管理員） ============
GET  /api/learning-center/categories          # 獲取分類列表
GET  /api/learning-center/contents            # 獲取內容列表（分頁、篩選）
GET  /api/learning-center/contents/{id}       # 獲取內容詳情
GET  /api/learning-center/knowledge-map       # 獲取知識地圖（節點+連線）
GET  /api/learning-center/paths               # 獲取學習路徑列表
GET  /api/learning-center/paths/{id}          # 獲取路徑詳情（含步驟）
GET  /api/learning-center/search              # 全局搜索
POST /api/learning-center/ai-ask              # AI 助教問答（接入 RAG）

# ============ 管理端點（教師/管理員） ============
POST   /api/admin/learning-center/categories         # 創建分類
PUT    /api/admin/learning-center/categories/{id}    # 編輯分類
DELETE /api/admin/learning-center/categories/{id}    # 刪除分類

POST   /api/admin/learning-center/contents           # 創建內容（含文件上傳）
PUT    /api/admin/learning-center/contents/{id}      # 編輯內容
DELETE /api/admin/learning-center/contents/{id}      # 刪除內容
POST   /api/admin/learning-center/upload             # 文件上傳（視頻/文檔/圖片）

POST   /api/admin/learning-center/knowledge-nodes           # 創建知識點
PUT    /api/admin/learning-center/knowledge-nodes/{id}      # 編輯知識點
DELETE /api/admin/learning-center/knowledge-nodes/{id}      # 刪除知識點
POST   /api/admin/learning-center/knowledge-edges           # 創建連線
DELETE /api/admin/learning-center/knowledge-edges/{id}      # 刪除連線
PUT    /api/admin/learning-center/knowledge-nodes/{id}/position  # 更新節點位置

POST   /api/admin/learning-center/paths              # 創建路徑
PUT    /api/admin/learning-center/paths/{id}         # 編輯路徑
DELETE /api/admin/learning-center/paths/{id}         # 刪除路徑
PUT    /api/admin/learning-center/paths/{id}/steps   # 更新路徑步驟
```

### 3.4 AI 助教整合
復用現有 `/llm/` 子系統：
- 上傳的教學文檔自動進入 ChromaDB 向量庫（獨立 collection）
- AI 問答時限定檢索範圍為學習中心的 collection
- 回答附帶引用來源（文件名 + 段落）

### 3.5 文件存儲
```
uploads/
└── learning_center/
    ├── videos/        # 本地上傳的視頻
    ├── documents/     # PDF/DOCX/PPTX
    ├── images/        # 圖片
    └── thumbnails/    # 自動生成的縮略圖
```

---

## 四、實施順序（建議分 3 期）

### 第一期：核心骨架（本次實現）
1. ✅ 數據庫表創建
2. ✅ Domain 層（Repository + Service）
3. ✅ Router 層（所有 API 端點）
4. ✅ 學習中心前端主頁 + 5 個 Tab 視圖基本框架
5. ✅ 管理員內容上傳功能（文檔/視頻/圖片）
6. ✅ 媒體資料庫視圖（最核心的瀏覽體驗）
7. ✅ 資源庫視圖
8. ✅ 知識地圖基礎版（D3.js 力導向圖）
9. ✅ 學習路徑基礎版
10. ✅ AI 助教整合（RAG 問答）
11. ✅ 在首頁新增入口卡片
12. ✅ 在 Admin Dashboard 新增內容管理 Tab

### 第二期：體驗優化（後續迭代）
- 視頻自動生成縮略圖
- 文檔在線預覽（PDF Viewer）
- 知識地圖動畫效果
- 移動端適配
- 批量上傳

### 第三期：智能增強（遠期）
- AI 自動生成知識點關聯
- 學習進度追蹤
- 個性化推薦
- AI 自動摘要

---

## 五、技術選擇

| 需求 | 方案 |
|------|------|
| 知識地圖可視化 | D3.js 力導向圖（CDN 引入） |
| 視頻播放器 | HTML5 Video + iframe（外部） |
| 文件上傳 | FastAPI UploadFile + 分塊上傳 |
| 富文本編輯 | Markdown 輸入 + 渲染 |
| AI 問答 | 現有 LangChain + ChromaDB + SSE 流式 |
| 搜索 | MySQL FULLTEXT + 標籤篩選 |
| 外部視頻嵌入 | YouTube/Bilibili iframe embed |

---

## 六、涉及的文件變更清單

### 新增文件
```
database_migration/create_learning_center_tables.sql     # 數據庫 Schema
app/domains/ai_learning_center/__init__.py               # Domain 模塊
app/domains/ai_learning_center/repository.py             # 數據訪問層
app/domains/ai_learning_center/service.py                # 業務邏輯層
app/routers/ai_learning_center.py                        # API 路由
web_static/ai_learning_center.html                       # 前端主頁面
web_static/css/ai_learning_center.css                    # 樣式文件
web_static/js/ai_learning_center.js                      # 前端邏輯
```

### 修改文件
```
app/domains/app_modules/service.py                       # 新增入口卡片
app/services/container.py                                # 註冊新 Service
app/routers/__init__.py                                  # 註冊新 Router
app/main.py                                              # 新增靜態文件路由 + 頁面路由
```
