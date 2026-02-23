# 更新日志 (CHANGELOG)

> **每次重大修改后请在此文件顶部添加新条目。**
>
> 格式：
> ```
> ## [版本号] [日期] 简要标题
> ### 新增 / 修改 / 删除 / 修复
> - 具体内容
> ```

---

## [v2.4.0] [2026-02-23] 知识图谱 Radial Tree 布局重构

### 修改

- **布局引擎替换** — 从 D3 force simulation（力导向）替换为 D3 Radial Tree（径向树），彻底消除节点重叠、随机抖动、每次刷新位置不同的问题
- **虚拟 super-root** — 自动创建不可见的超级根节点连接 5 个 KG 文件的真实根节点，统一为单棵径向树布局
- **固定环形半径** — depth 0-4 分别映射到 ringRadii `[0, 180, 340, 470, 570]px` 同心环，层次清晰
- **默认收起至 L1** — 初始只显示根节点 + 一级节点（约 30 个），双击展开查看子节点
- **"+N" 后代数量 badge** — 收起的节点显示后代总数（如 `+12`），替代旧的 `▶`/`▼` 指示器
- **环形辅助线** — 浅色虚线同心圆标识各层深度，增强空间层次感
- **hierarchy 边改为曲线 path** — 从 `<line>` 改为 `<path>` 二次贝塞尔曲线，沿径向弯曲
- **cross-links 改为直线** — 从曲线 `<path>` 改为 `<line>`，减少视觉噪音
- **Overview/Explore 模式切换** — 新增模式切换按钮，一键全展开（Explore）或全收起（Overview）
- **搜索自动展开祖先路径** — 搜索时如果匹配节点被收起，自动沿父链展开使其可见
- **TIER_CONFIG 扩展** — 新增 depth 3（L3: r=16），支持更深层次的节点尺寸区分
- **移除 drag 行为** — 确定性布局无需拖拽，避免破坏树形结构
- **移除 force simulation** — 不再使用 `forceLink`、`forceManyBody`、`forceCenter`、`forceRadial`、`forceCollide`

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | 核心重构：`TIER_CONFIG` 扩展 + `LAYOUT_CONFIG` + `buildRadialTree()` + `renderKnowledgeMap()` 重写 + `toggleCollapse()` 重写 + `searchNodes()` 自动展开 |
| `web_static/css/ai_learning_center.css` | 新增 `.kg-ring-guide` `.kg-hier-edge` `.kg-descendant-badge` `.alc-mode-toggle.active` 样式 |
| `web_static/ai_learning_center.html` | 新增 `#mapModeToggle` 模式切换按钮 |

---

## [v2.3.0] [2026-02-23] 知识图谱节点详情面板修复 + 重新设计

### 修复

- **节点详情面板不可见** — CSS 使用 `transform: translateX(100%)` 隐藏面板，但 JS 只切换 `display` 而从未添加 `--active` class，导致面板渲染了但始终推在屏幕外。现在改为正确的 `classList.add/remove('alc-node-detail-panel--active')` 配合 `display: flex` 切换，带滑入/滑出 CSS transition 动画。
- **「打开并定位」按钮完全失效** — `escapeHtml()`（`div.textContent` → `div.innerHTML`）不转义双引号 `"`。Anchor JSON 如 `{"type":"page","value":28}` 中的 `"` 在 `onclick="..."` 属性内提前截断了属性值，导致 onclick handler 被浏览器解析为无效 JS。改为 `data-content-id` + `data-anchor` 属性 + `addEventListener` 事件委托，彻底消除 HTML 属性转义问题。
- **关联节点按钮** — 同样移除 inline `onclick`，改用 `data-node-id` + 事件委托。
- **关闭按钮** — 改用 `addEventListener` 绑定，不再依赖 inline `onclick`。
- **`hideNodeDetail` 动画** — 新增 `transitionend` 监听 + 400ms fallback，确保面板滑出动画完成后再隐藏。

### 修改（UI 重新设计）

- **面板容器** — 宽度 320px → 340px，增加 `box-shadow: -4px 0 24px`，`overflow: hidden`
- **彩色渐变头部** — 使用节点自身颜色做 `linear-gradient(135deg)` 背景 + 半透明暗角叠加层，白色标题带 `text-shadow`
- **毛玻璃关闭按钮** — 圆形 `backdrop-filter: blur(8px)` + 半透明白底，hover 放大 `scale(1.1)`
- **可滚动内容区** — 超细 4px 滚动条 `scrollbar-width: thin`
- **区块标签** — 改用 `uppercase + letter-spacing: 0.04em` 小标签 + 圆形数量徽标 pill
- **关联教程** — 整行可点击卡片（36px 图标方块 + 标题/锚点 + `›` 箭头），hover 绿色边框 + 阴影 + 箭头微移
- **关联节点** — 胶囊 chip 标签 + `flex-wrap` 自动换行，hover 品牌绿高亮
- **分隔线** — `<hr>` 配 `var(--border-light)` 替代硬边框
- **CSS 类名体系** — 全面重构为 BEM 风格 `alc-nd__*`（21 个新类），移除所有无样式的旧类名

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | `showNodeDetail()` 重写 HTML 模板 + 事件委托；`hideNodeDetail()` 增加 CSS transition 动画 |
| `web_static/css/ai_learning_center.css` | 节点详情面板 CSS 完全重写（21 个 `alc-nd__*` 类 + 响应式 + 交互状态） |

---

## [v2.2.1] [2026-02-23] 一键部署脚本 deploy_learning_center.py

> **⚠️ 另一台电脑部署步骤**：
> ```bash
> git pull
> # 确保 Downloads 文件夹里有 3 份 PDF 原件（见下方列表）
> python scripts/deploy_learning_center.py
> ```
> 脚本会自动完成：数据库迁移 → 搜索并上传 PDF → 启动服务器 → 批量导入知识图谱 + 内容关联 + 页码锚点。

### 新增

- **`scripts/deploy_learning_center.py`** — 一键部署脚本，功能：
  1. 检查/执行数据库迁移（`lc_node_contents` 添加 `anchor` 列）
  2. 自动在 Downloads / Desktop / Documents 等目录搜索 3 份 PDF：
     - `ULearning AI Agent System and AI Bench User Manual (Teacher).pdf`
     - `utest_guide_teachers_en.pdf`
     - `ulearning_guide_students_en_web_browser.pdf`
  3. 复制 PDF 到 `uploads/learning_center/documents/` 并插入 `lc_contents` 记录
  4. 自动启动 FastAPI 服务器（如未运行）
  5. 自动获取 JWT token 并调用批量导入 API
  6. 自动映射 content_id（开发机 → 当前机器，不同数据库分配 ID 可能不同）
  7. 导入 3 份知识图谱 JSON（87 节点 + 101 边 + 87 内容关联）
  8. 输出最终统计：节点数、边数、教学内容数、内容关联数
  - 幂等安全：重复运行不会创建重复 PDF 记录（检查已存在则跳过）
  - 备用方案：API 不可用时自动降级为数据库直连导入 content_links
  - Windows 兼容：处理了 cp1252 终端编码问题

---

## [v2.2.0] [2026-02-23] 批量导入支持 content_links + 3 份 PDF 锚点数据

> **⚠️ 数据操作**：此版本已上传 2 份新 PDF 到 `lc_contents` 并批量导入了 AI Agent System 知识图谱（含内容关联）。
> 如需在另一台电脑同步，需：
> 1. 确保 `add_anchor_to_node_contents.sql` 迁移已执行（v2.1.0）
> 2. 将 `Downloads` 中的 `utest_guide_teachers_en.pdf` 和 `ulearning_guide_students_en_web_browser.pdf` 上传到教学资料
> 3. 记下新创建的 content_id，更新 JSON 文件中 `content_links` 的 `content_id` 值
> 4. 通过批量导入 API 重新导入 3 份 JSON（需 `clear_existing: true`）

### 新增

- **批量导入支持 `content_links`** — 在 KG JSON 中直接定义节点→内容关联（含锚点）
  - 新增 `BatchContentLinkInput` Pydantic 模型（`router.py`）
  - `BatchImportKnowledgeGraphRequest` 新增 `content_links` 字段
  - `batch_import_knowledge_graph()` 服务方法新增第三阶段：批量创建节点-内容关联
  - `NodeContentRepository.link_with_anchor()` 支持 anchor JSON 的单条插入（INSERT IGNORE 防重复）
  - 返回值新增 `created_links` 和 `skipped_links` 计数

- **JSON 格式扩展** — 三份 KG JSON 均已添加 `content_links` 数组：
  ```json
  "content_links": [
    { "node": "ut_root", "content_id": 4, "anchor": { "type": "page", "value": 1 } },
    { "node": "ut_q_manual", "content_id": 4, "anchor": { "type": "page_range", "from": 8, "to": 10 } }
  ]
  ```

- **2 份新 PDF 上传到系统**
  - `content_id=4`: UTest Teacher Guide (99页) — `utest_guide_teachers_en.pdf`
  - `content_id=5`: ULearning Student Guide (60页) — `ulearning_guide_students_en_web_browser.pdf`
  - 通过 pymupdf 自动提取 PDF 目录，精确匹配每个 KG 节点到对应 PDF 页码

- **AI Agent System KG 已导入** — 31 节点 + 35 边 + 31 内容关联，全部含页码锚点

### 修改

- **`app/routers/ai_learning_center.py`**
  - 新增 `BatchContentLinkInput` 模型
  - `BatchImportKnowledgeGraphRequest` 新增 `content_links` 字段
  - 路由传递 `content_links` 到 service

- **`app/domains/ai_learning_center/service.py`**
  - `batch_import_knowledge_graph()` 新增 `content_links` 参数和处理逻辑

- **`app/domains/ai_learning_center/repository.py`**
  - 新增 `NodeContentRepository.link_with_anchor()` 方法

- **`data/kg_ai_agent_system.json`** — 新增 31 条 content_links（content_id=1, 页码 1-44）
- **`data/kg_utest_teacher_guide.json`** — 新增 36 条 content_links（content_id=4, 页码 1-99）
- **`data/kg_ulearning_student_guide.json`** — 新增 20 条 content_links（content_id=5, 页码 1-60）

---

## [v2.1.0] [2026-02-23] 知识图谱可视化大改 + 节点→文件定位导航系统

> **⚠️ 数据库迁移**：在另一台电脑上部署时，必须先执行以下 SQL：
> ```
> mysql -u root -p school_ai_assistant < database_migration/add_anchor_to_node_contents.sql
> ```
> 该迁移为 `lc_node_contents` 表新增 `anchor` JSON 列，用于存储知识节点到内容的定位锚点。

### 新增

- **知识图谱可视化 — 全面重写 `renderKnowledgeMap()`**
  - 层级检测：BFS 从零入度节点出发，自动计算 `_depth` 并分为 Root / L1 / L2 三级
  - 分级渲染 (`TIER_CONFIG`)：Root 节点 r=55 带呼吸光环，L1 r=38，L2 r=26
  - 边分层：`hierLinks`（包含关系）默认显示，`crossLinks`（其他关系边）默认隐藏
  - 力布局：`forceRadial` 按层级分圈 + `forceCollide` 防重叠
  - 缩放语义 (LOD)：`applyLOD()` 3 级缩放阈值，远看只显示大节点，近看显示全部标签
  - 聚焦高亮：`handleNodeHover()` 高亮邻居 opacity 1，其余 0.15
  - 展开/折叠：`toggleCollapse()` 双击收起子树
  - 图例面板：`renderMapLegend()` 毛玻璃图例说明节点大小和边颜色含义

- **节点→文件定位导航系统 (Phase 1 + Phase 2)**
  - `navigateToContent(contentId, anchorJson)`：点击节点关联内容→自动切换到"教学资料"Tab→打开内容→定位到锚点
  - `applyAnchor(anchor)`：支持 4 种锚点类型
    - `page`：PDF 页码跳转（`#page=N`，浏览器原生支持）
    - `heading`：Article 标题定位（`scrollIntoView`）
    - `timestamp`：视频时间戳跳转（`video.currentTime`）
    - `keyword`：关键词搜索 fallback（`TreeWalker` 文本扫描 + 高亮）

- **Hover 信息卡片 (Tooltip)**
  - `showNodeTooltip(node, event)` / `hideNodeTooltip()` / `keepTooltipOpen()`
  - 300ms debounce 延迟显示，鼠标移入 tooltip 保持显示
  - 内容：标题 + 描述（前80字）+ 关联内容数 + 邻居节点数
  - "进入教程" 一键跳转 + "查看详情" 打开右侧面板

- **节点内容数量徽标 (Badge)**
  - 有关联内容的节点右上角显示小圆徽标 + 内容数量
  - 仅在 `node.contents.length > 0` 时显示

- **节点搜索高亮**
  - `searchNodes(keyword)` + `initMapSearch()`
  - 搜索范围：`node.title` + `node.description`
  - 匹配节点脉冲动画（`.kg-search-ring`），非匹配节点淡化至 0.12
  - 自动平移居中到第一个匹配节点
  - Escape 键清空搜索恢复默认

- **数据库迁移文件**
  - `database_migration/add_anchor_to_node_contents.sql` — `lc_node_contents` 新增 `anchor JSON` 列
  - anchor JSON 示例：`{"type":"page","value":5}`, `{"type":"heading","value":"Creating Exam"}`, `{"type":"timestamp","value":120}`, `{"type":"keyword","value":"exam proctoring"}`

### 修改

- **`app/domains/ai_learning_center/repository.py`**
  - `NodeContentRepository.find_by_node()` 重写为 JOIN 查询，返回 `content_title`, `content_type`, `file_path`, `file_name`, `external_url`, `anchor` 完整信息（原先只返回关联 ID）

- **`web_static/js/ai_learning_center.js`** — 主要改动文件
  - `renderKnowledgeMap()` 完全重写（层级布局 + 分级渲染 + LOD + 力布局）
  - `showNodeDetail(node)` 重写：新增关联内容列表 + "打开并定位"按钮 + 方向性关系箭头
  - 新增函数：`navigateToContent()`, `applyAnchor()`, `formatAnchorHint()`, `showNodeTooltip()`, `hideNodeTooltip()`, `keepTooltipOpen()`, `searchNodes()`, `initMapSearch()`, `computeHierarchy()`, `applyLOD()`, `handleNodeHover()`, `toggleCollapse()`, `renderMapLegend()`
  - 新增 state 字段：`lastSelectedNodeId`, `lastZoomTransform`
  - 公共 API 扩展：`window.lcLearningCenter` 新增 `navigateToContent`, `searchNodes`

- **`web_static/ai_learning_center.html`**
  - 新增搜索输入框 `<div class="alc-map-search">` 在地图控制栏
  - 新增 tooltip 容器 `<div id="kgTooltip">`
  - 新增图例容器 `<div class="alc-map-legend" id="mapLegend">`

- **`web_static/css/ai_learning_center.css`**
  - 新增样式：`.kg-tooltip` 系列（毛玻璃浮动信息卡片）
  - 新增样式：`.alc-map-search` 系列（搜索框 + 聚焦绿色边框）
  - 新增样式：`.kg-search-ring` + `@keyframes searchPulse`（搜索脉冲动画）
  - 新增样式：`.alc-content-link-*` 系列（详情面板内容链接卡片）
  - 新增样式：`.alc-node-section`（详情面板分区标题）
  - 新增样式：`.alc-map-legend` 系列（图例面板）
  - 新增样式：`.kg-glow-ring` + `@keyframes rootGlow`（根节点呼吸光环）

### 修复

- **D3.js 崩溃 bug** — 删除节点后残留悬空边引用导致 `renderKnowledgeMap()` 报错
  - 在渲染前过滤掉 `source` 或 `target` 不存在于节点集合中的边

---

## [v2.0.0] [2026-02-22] 根目录遗留文件完全迁移 — 零代码异味

### 删除
- **7 个根目录遗留 Python 文件全部删除**，所有功能迁移至分层架构：
  - `subject_manager.py` — 功能已由 `app/domains/subject/service.py` 完全覆盖
  - `file_processor.py` → `llm/rag/file_processor.py`
  - `deepseek_api.py` — 已弃用，所有 AI 调用统一切换到 Ollama
  - `vector_store.py` → `llm/rag/vector_store.py`
  - `learning_modes.py` → `app/domains/learning_modes/`（拆分为 9 个文件）
  - `enhanced_analytics.py` + `enhanced_analytics_llm.py` → `app/domains/analytics/` + `app/domains/teacher_class/`

### 新增
- **`app/domains/learning_modes/`** — 学习模式领域模块
  - `models.py`: `LearningModeConfig`, `TaskResult` 数据类
  - `constants.py`: 中文游戏、类别、话题领域常量
  - `modes/base.py`: `BaseLearningMode` 抽象基类
  - `modes/qa.py`: QA 问答模式
  - `modes/english_writing.py`: 英语写作模式
  - `modes/chinese_training.py`: 中文训练模式
  - `service.py`: `LearningModeManager` + 10 个便捷函数
- **`app/domains/teacher_class/`** — 教师班级管理领域模块
  - `repository.py`: `TeacherClassRepository(BaseRepository)` — 13 个数据查询方法
  - `service.py`: `TeacherClassService` — 教师分配、班级学生、排名比较、预警等
- **`app/domains/analytics/models.py`** — 分析领域数据模型
  - `ConversationMetrics`, `StudentProfile`, `LLMAnalysisReport` 数据类
  - `KNOWLEDGE_PATTERNS`, `DIFFICULTY_KEYWORDS`, `EMOTION_INDICATORS` 常量
- **`app/domains/analytics/repository.py`** — 新增 25 个数据查询方法
  - 分析报告查询、对话分析、学生学习模式、概览与进度曲线等

### 修改
- **`llm/services/qa_service.py`** — `from subject_manager` 改为 `SubjectService().get_system_prompt()`
- **`llm/services/streaming.py`** — 同上，含静态模板 fallback
- **`app/routers/system.py`** — import 改为 `from llm.rag.file_processor import FileProcessor`
- **`app/routers/chinese_learning.py`** — DeepSeek API 调用全部替换为 `OllamaProvider`，修复原代码中 `await` 同步方法和 `.get()` 调用元组的 bug
- **`llm/rag/retrieval.py`** — 消除重复定义，`get_embedding()` / `get_vector_db()` 统一从 `vector_store` 导入
- **`llm/rag/vector_store.py`** — 重写为懒初始化模式，去除 9 个硬编码科目函数，去除模块级 eager 加载
- **`app/routers/learning_modes.py`** — 15 个 import 路径更新到新领域模块
- **`app/routers/teacher_class.py`** — 完全重写，`enhanced_analytics_llm` 替换为 `TeacherClassService` + `AnalyticsService`，删除约 70 行直接 DB 查询 fallback 代码
- **`app/domains/analytics/service.py`** — 新增 `get_latest_student_analysis()` 方法

### 修复
- **`app/domains/subject/service.py`** — `get_system_prompt()` 始终返回空字符串的 bug
  - 原因: `get_subject_config()` 返回的是已解析的 config dict，但 service 层错误地在其中查找嵌套 `config` 键
  - 同时修复 `update_subject()` 和 `update_system_prompt()` 中的相同问题
- **`app/domains/chat/repository.py`** — 创建对话时缺少 `user_id` 外键导致 500 错误
  - 现在会先查询 `users.id` 再插入 `conversations` 记录
- **`llm/services/streaming.py`** — 流式生成错误日志缺少 traceback，增加 `traceback.format_exc()`
- **`llm/rag/context.py`** — `extract_temp_docs_from_history()` 对 `content: null` 的防御
- **`llm/providers/ollama.py`** — `async_stream()` 对 Ollama 返回 `content: null` 的防御
- **`llm/prompts/templates.py`** — `load_prompts_from_yaml()` 当 YAML 的 `prompts` 值为 `null`（仅注释）时返回 `None`，导致 `in None` 崩溃

---

## [v1.9.0] [2026-02-21] Ollama 上下文窗口配置 + 知识图谱视觉升级

### 新增
- **Ollama num_ctx 支持**：`BaseLLMProvider` 新增 `num_ctx` 参数（默认 8192），`OllamaProvider` 初始化和 raw API 调用均传递该参数，支持自定义上下文窗口大小
- **知识图谱节点图标**：节点内显示 emoji 图标（`d.icon`），默认为 📌
- **知识图谱节点完整标题**：节点下方显示完整标题文字，圆内显示截断标题（6 字 + …）
- **节点阴影效果**：节点添加 `drop-shadow` 滤镜，增强视觉层次感
- `init_local_db.sql`：本地数据库初始化脚本
- `docs/` 目录：AI学习中心功能介绍文档
- `data/app_modules.json`：应用模块配置

### 修改
- **知识图谱节点增大**：半径从 25 → 45，边框从 2 → 3，碰撞半径从 50 → 80
- **知识图谱布局调整**：连线距离 100 → 200，斥力 -300 → -500，箭头 refX 25 → 48
- **课程默认状态**：创建课程时 `status` 从 `"draft"` 改为 `"published"`
- `requirements.txt`：注释从中文改为英文

### 删除
- 移除 `PLAN_AI_LEARNING_CENTER.md` 计划文件

---

## [v1.8.1] [2026-02-21] PDF 页码跳转修复

### 修复
- **AI 问答响应解包错误**：`sendAiQuestion()` 取 `resp.data` 层解包，修复 `marked.parse(undefined)` 报错
- **旧 PDF 索引自动重建**：新增 `has_page_metadata()` 检测旧索引缺少 `page_numbers` 字段，首次提问时自动删除旧索引并重建，确保页码跳转对历史上传的 PDF 也生效
- **页码引用精简**：连续页码（如 42,43,44）合并为起始页（42）；AI prompt 改为只标注实际引用的页码
- **页码引用分数不兼容**：`similarity_search_with_relevance_scores` 在 HuggingFace Embeddings + ChromaDB 下返回非归一化负数分数（如 -431），导致阈值过滤逻辑失效、`page_refs=0`。改用 `similarity_search` + 位置排序策略
- **页码引用精度优化**：top_n 从 3 降为 2，避免低相关性 chunk 引入无关页码；用 `_pick_start_pages()`（per-chunk 连续页合并）+ `_deduplicate_page_refs()`（跨 chunk 去重）替代原有的全局合并逻辑
- **AI 回答过于简短**：system prompt 中"不要罗列"的措辞导致 LLM 缩减回答内容，改为鼓励"详细且完整地回答"并提供有条理的步骤、要点
- **PDF 跳转闪烁**：点击页码时 `iframe.src` 赋值会重新加载整个 PDF 文件导致白屏闪烁，改用 `contentWindow.location.replace()` 利用浏览器缓存实现无闪烁跳转
- **繁体中文页码不可点击**：LLM 输出可能使用繁体「頁」而正则仅匹配简体「页」，正则更新为 `/【第([\d,、\-–]+)[页頁]】/g` 兼容两种写法
- **PDF 跳转无效（hash 方式）**：Chrome PDF 阅读器仅在初始加载时读取 `#page=N`，后续 `location.hash` 修改不触发跳转。改用 `location.replace(url#page=N)` 触发 PDF 阅读器重新初始化

### 新增
- **AI 回答表格样式**：为 `.alc-message-content table` 添加完整的表格 CSS（边框、表头背景、内边距、斑马纹、悬浮高亮、横向滚动）

---

## [v1.8.0] [2026-02-21] AI 回答 PDF 页码跳转

### 新增
- **PDF 页码感知索引**：PDF 文本提取改为逐页处理，chunk metadata 新增 `page_numbers` 字段记录覆盖的页码范围
- **页码感知检索**：新增 `get_context_for_content_with_pages()` 函数，检索时同时返回页码引用信息
- **AI 回答页码引用**：当阅读 PDF 内容时，AI 的 system prompt 指导 LLM 用【第X页】标注引用来源
- **行内页码点击跳转**：AI 回答中的【第X页】标记自动转为可点击链接，点击后 PDF 阅读器跳转到对应页
- **页码快捷导航栏**：AI 回答底部显示相关页码按钮，一键跳转到参考页面
- 前端新增 `linkifyPageReferences()` / `navigatePdfToPage()` 工具函数
- CSS 新增 `.alc-page-ref`（行内页码标记）和 `.alc-page-ref-btn`（快捷按钮）样式

### 修改
- `ContentTextExtractor` 新增 `extract_with_pages()` 方法，按页返回文本段
- `ContentIndexer.index()` 改为页码感知的索引流程（向后兼容旧数据）
- `_ai_ask_with_content()` 使用页码感知检索，返回值新增 `page_references` 字段

---

## [v1.7.1] [2026-02-21] 回退流式输出 + 目录默认展开 + 编辑模式排序

### 修改
- **回退 AI 流式输出**：`sendAiQuestion()` 改回使用 `apiPost` 调用 `/ai-ask`，移除 SSE 流式前端逻辑（后端流式端点保留但前端不再调用）
- **目录默认展开**：进入学习中心时，左侧目录栏自动展开，用户无需手动点击箭头

### 新增
- **编辑模式目录排序**：切换到「编辑」模式后，目录每个项目右侧显示上移/下移按钮，点击即可调整顺序
- `PUT /api/admin/learning-center/contents/reorder` 端点：接收 `content_ids` 数组，批量更新 `sort_order`
- `lc_contents` 表新增 `sort_order` 列（迁移文件 `add_sort_order_to_lc_contents.sql`）
- 内容列表改为按 `sort_order ASC, created_at DESC` 排序

### 修复
- **排序保存 422 错误**：`ReorderContentsRequest` 的 `min_items` 改为 `min_length`（Pydantic v2 兼容）
- **上传缺少分类**：后端 `/upload` 端点新增 `category_ids` 参数，前端拖拽上传和外部视频上传均发送分类
- **内容编辑改用弹窗表单**：从 `prompt()` 改为模态弹窗，支持修改标题、描述、内容类型和分类

---

## [v1.7.0] [2026-02-21] AI 助教流式输出 + 小窗/大窗切换

### 新增
- **SSE 流式输出**：新增 `POST /api/learning-center/ai-ask-stream` 端点，AI 回答逐 token 推送到前端
- `LearningCenterService.ai_ask_stream()` 异步生成器：RAG 检索后调用 `provider.async_stream()` + `StreamingThinkingParser` 实时过滤 thinking，只输出 answer
- 前端 `sendAiQuestion()` 改用 `fetch` + `ReadableStream` 读取 SSE，AI 回复逐字渲染 Markdown
- **小窗/大窗切换按钮**：标题栏新增放大/缩小按钮（&#9634; / &#9635;），点击在 380×520 和 680×75vh 之间切换

### 删除
- 移除右下角拖拽缩放手柄（resize handle），以按钮切换替代

---

## [v1.6.1] [2026-02-21] AI 助教改为浮动窗口（可拖拽、可缩放）

### 修改
- AI 助教从独立 Tab 面板改为**浮动弹窗**，用户阅读教材时可同时使用 AI 问答，无需切换页面
- 浮动窗口支持**自由拖拽**（拖动标题栏）和**自由缩放**（拖动右下角手柄）
- 顶部导航 AI 助教按钮改为切换浮动窗口开关，不再参与 Tab 切换逻辑
- 从 `TAB_PANEL_MAP` 和 `switchTab()` 中移除 `ai` 分支，保持 Tab 系统整洁
- 浮动窗口默认隐藏，点击按钮显示/隐藏，位于页面右下角
- 消息渲染改用气泡对话框样式（头像 + 圆角气泡），新增打字动画
- 拖拽/缩放改用 `requestAnimationFrame` 节流 + `getBoundingClientRect` 精确定位
- 移除「总结要点 / 解释概念 / 练习题」建议问题按钮

### 修复
- 缩放卡顿：rAF 改为始终记录最新鼠标坐标（不丢帧）；交互中降级 `box-shadow` 减少重绘开销

---

## [v1.6.0] [2026-02-21] AI 助教支持内容感知问答（RAG）

### 新增
- **内容索引器** `llm/rag/content_indexer.py`：自动提取 PDF/DOCX/PPTX/文章的文本，分割为 chunk 后存入 ChromaDB 向量库
- **内容级 RAG 检索**：`get_context_for_content()` 按 `content_id` 过滤 ChromaDB，检索当前阅读内容的相关片段
- **上传自动索引**：管理员上传文件后在后台线程异步建立向量索引
- **懒索引**：对未索引的旧内容，在用户首次提问时自动触发索引
- **内容上下文指示条**：AI 助教 Tab 顶部显示当前阅读内容标题，支持一键清除
- AI 回复改用 `marked.js` 渲染完整 Markdown 格式

### 修改
- `AIAskRequest` 新增 `content_id` 可选字段
- `LearningCenterService.ai_ask()` 支持内容感知分支（有 content_id 走 RAG，无则走通用问答）
- AI 助教推荐问题更新为内容相关的通用提问（总结要点、解释概念、生成练习题）

---

## [v1.5.1] [2026-02-21] 修复学习中心按分类筛选内容报错（Unknown column 'category_id'）

### 修复
- `GET /api/learning-center/contents?category_id=X` 返回 500，MySQL 报 `Unknown column 'category_id' in 'where clause'`
- 原因：`lc_contents` 表没有 `category_id` 列，内容与分类是多对多关系，通过 `lc_content_categories` 中间表关联
- `LCContentRepository.find_published()` 错误地在 `lc_contents` 表上直接过滤 `category_id = %s`
- 修复为子查询：`id IN (SELECT content_id FROM lc_content_categories WHERE category_id = %s)`

---

## [v1.5.0] [2026-02-21] AI学习中心重构为 Content-First 阅读模式 UI

### 新增
- **三模式切换器**：阅读模式 / 编辑模式 / 管理模式，默认进入阅读模式
  - 阅读模式：隐藏侧栏、标签文字只留图标、最大化内容区
  - 编辑模式：自动展开侧栏
  - 管理模式：展开侧栏、显示管理按钮，侧栏加宽
- **侧栏折叠按钮**：左侧半圆箭头按钮，点击展开/收起目录
- **侧栏关闭按钮**：目录头部 ✕ 按钮，点击收起

### 修改
- **顶部导航压缩 50%**：高度从 ~64px 降至 42px（阅读模式 36px），标题 18px→14px，按钮图标化，搜索框缩小
- **标签导航压缩**：字号 15px→13px，间距缩减，阅读模式下只显示图标隐藏文字
- **左侧目录默认折叠**：宽度从固定 280px 改为默认 0（收起），展开时 240px，带 0.25s 平滑动画
- **内容区最大化**：外边距/内边距清零，PDF iframe 高度 `calc(100vh - 160px)`（阅读模式 `calc(100vh - 120px)`）
- **标题栏改为浮动毛玻璃**：半透明背景 + backdrop-filter，标题和描述水平排列，字号 20px→15px
- **视觉层级重排**：内容(PDF) > 当前标题 > 辅助工具 > 导航栏
- **下载按钮紧凑化**：右对齐，字号 12px
- **ebook 容器去除圆角边框**：改为无边框 + 浅灰背景 `#fafafa`
- **欢迎页弱化**：图标缩小、透明度降低、提示文案更新
- 响应式适配更新（768px / 480px 断点）

---

## [v1.4.0] [2026-02-20] 管理面板新增「内容管理」Tab（编辑 / 删除已上传内容）

### 新增
- 管理面板新增「内容管理」选项卡，列出所有已上传内容
- 每条内容显示类型图标、标题、所属分类
- 支持「编辑」按钮：弹窗修改标题和描述（调用 `PUT /api/admin/learning-center/contents/{id}`）
- 支持「删除」按钮：确认后删除内容（调用 `DELETE /api/admin/learning-center/contents/{id}`）
- 操作完成后自动刷新管理列表和电子教科书目录
- CSS 新增 `.alc-admin-list-item` 和 `.alc-btn--small` 样式

---

## [v1.3.0] [2026-02-20] 移除 Hero 区域，统计数据移入顶部标题栏

### 修改
- 删除 Hero 区域（"多維度AI知識探索平台" + 副标题 + 统计卡片），释放垂直空间
- 统计数据（课程/视频/文件数量）移到顶部标题栏 "AI 學習中心" 右侧，显示为紧凑的 inline 文字
- 删除 Hero 相关全部 CSS（含 768px / 480px 响应式规则）
- 768px 以下自动隐藏统计数据，保持移动端简洁

---

## [v1.2.0] [2026-02-20] 教学资料改为电子教科书风格（左侧目录 + 右侧内容）

### 修改
- 教学资料 Tab 从章节目录列表改为**电子教科书**双栏布局
  - 左侧：目录树，按分类分组显示所有资源（视频、文件、图片、文章），支持折叠/展开
  - 右侧：内容查看区，点击目录项直接在右侧显示内容（视频播放、图片预览、文件查看、文章阅读）
  - 不再使用弹窗（Modal），内容直接内嵌显示
- 移除顶部筛选按钮栏（全部/视频/文件/图片/文章）和分类标签栏
- 移除分页，改为一次加载所有内容到目录
- 响应式：768px 以下目录栏改为横向堆叠（上目录下内容）

---

## [v1.1.2] [2026-02-20] 修复视频播放及文件 URL 问题

### 修复
- 视频弹窗无法播放：`openVideoModal()` 使用不存在的 `file_url` 字段，改为从 `file_path` 构建 URL
- 新增 `getFileUrl()` 工具函数：统一从 `file_path`（如 `uploads/learning_center/video_locals/xxx.mp4`）生成可访问的 URL
- 外部视频（YouTube/Bilibili）iframe 添加 `allow` 属性以支持自动播放
- 修复视频弹窗关闭后残留：`closeAllModals()` 现在正确清理注入的 `<video>` 元素
- 修复图片预览 `openImageModal()` 和文件预览 `openDocModal()` 同样使用不存在的 `file_url`
- 修复资源下载 `downloadResource()` 使用不存在的 `file_url`

---

## [v1.1.1] [2026-02-20] 媒体资料库改为教材章节目录风格

### 修改
- 媒体资料库从卡片网格布局改为**教科书章节目录**风格
  - 内容按分类分组，显示为「第 1 章 / 第 2 章…」的层级结构
  - 每个内容项带序号（1.1, 1.2…）、类型图标、标题、描述、类型标签
  - 章节可折叠/展开
  - 未归类内容显示在「其他资料」章节
- Tab 标签从「🎬 媒體資料庫」改为「📖 教學資料」，更符合教材定位
- CSS 从 `.alc-media-grid` 网格布局改为 `.alc-toc` 垂直列表布局
- 响应式适配：移动端隐藏章节编号、内容描述，480px 以下隐藏类型标签

---

## [v1.1.0] [2026-02-20] 修复媒体卡片样式 + 默认显示媒体资料库

### 修复
- 媒体卡片 CSS class 不匹配：JS 生成 `alc-content-card` 但 CSS 定义的是 `alc-media-card`，导致卡片无样式
- 外部视频卡片无缩略图：现自动提取 YouTube 视频缩略图
- 默认 tab 从「知识地图」改为「媒体资料库」，进入页面直接看到教学内容

---

## [v1.0.3] [2026-02-20] 修复上传内容不显示问题

### 修复
- 管理员上传内容后默认 `status="draft"`，媒体库只显示 `published` 内容，导致上传后看不到
- 3 个创建内容的调用（文件上传、外部视频、JSON 创建）全部改为上传后自动发布

---

## [v1.0.2] [2026-02-20] AI 学习中心页面视觉层级优化

### 修改
- **Hero 区域重构**: 从纵向大标题布局改为横向紧凑信息栏（标题 + 副标题 + 统计数据并排一行）
  - 标题字号 48px → 20px，副标题透明度降至 60%
  - 统计卡片从纵向大卡片改为横向紧凑标签
  - 整体高度减少约 60%
- **间距压缩**: 内容区顶部 padding、Tab 导航上下间距均缩减，确保首屏直接展示学习内容
- **响应式适配**: 移动端 Hero 改为堆叠布局，480px 以下隐藏副标题

---

## [v1.0.1] [2026-02-20] 修复 AI 学习中心视频连结上传功能

### 修复
- 前端表单缺少视频连结输入框，导致无法上传 YouTube / Bilibili 视频链接
- `submitUploadContent()` 未调用 `/upload` 端点，外部视频数据无法传递给后端
- `openContent()` 和 `renderMediaGrid()` 不识别 `video_local` / `video_external` 类型
- `openVideoModal()` 字段名与后端不匹配（`video_type` → `content_type`，`video_url` → `external_url`）

### 修改
- `web_static/ai_learning_center.html` — 内容类型下拉改为「本地視頻」/「視頻連結」，新增 URL 输入框和平台选择器
- `web_static/js/ai_learning_center.js` — 4 处逻辑修复：类型切换显隐、提交逻辑、内容卡片渲染、视频播放弹窗

---

## [v1.0.0] [2026-02-20] 项目架构重构与清理

### 删除
- 删除根目录 46 个冗余 Python 文件（32,845 行 → 6,387 行）
  - 18 个废弃启动/测试脚本 (simple_start.py, test.py 等)
  - 6 个已执行的数据库迁移脚本 (run_migration.py 等)
  - 3 个部署脚本 (deploy_mac.py, deploy_ubantu.py, gunicorn_config.py)
  - 巨型入口文件 secure_web_main.py (6,225 行) 及其依赖生态
  - 兼容包装器 (rag_chain.py, llm_config.py, improved_chat_endpoint.py 等)

### 修改
- **路由系统重构**: 6 个可选路由 API 迁移到 `app/routers/` 成为核心路由
  - attendance_api.py → app/routers/attendance.py
  - teacher_class_api.py → app/routers/teacher_class.py
  - china_game_api.py → app/routers/china_game.py
  - game_upload_api.py → app/routers/game_upload.py
  - learning_modes_api.py → app/routers/learning_modes.py
  - chinese_learning_api.py → app/routers/chinese_learning.py
- **依赖迁移**: 所有模块的 import 从旧模块迁移到新架构
  - `from auth_dependencies import` → `from app.core.dependencies import`
  - `from secure_database import get_db` → `from app.bridge import get_db`
  - `from mysql_database_manager import` → `from app.bridge import`
- **论坛系统**: forum_system/ 全部改用 app.bridge 和 app.core.dependencies
- **app/routers/__init__.py**: 从 13 核心 + 6 可选路由 → 19 核心 + 1 可选路由

### 新增
- README.md — 项目说明文档
- CHANGELOG.md — 更新日志
- .gitignore — 完整的 Git 忽略规则
- Git 仓库初始化，SSH 密钥认证配置

---

## [v0.9.0] [2026-02-20] 前端页面重构 (Phase 1-3)

### 修改
- 12 个 HTML 页面统一重构
  - 导航栏统一化
  - 响应式布局优化
  - UI 风格一致性调整
  - 页面间跳转逻辑修复
