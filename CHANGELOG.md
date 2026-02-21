# 更新日志 (CHANGELOG)

> **每次重大修改后请在此文件顶部添加新条目。**
>
> 格式：
> ```
> ## [版本号] [日期 时间] 简要标题
> ### 新增 / 修改 / 删除 / 修复
> - 具体内容
> ```

---

## [v1.7.1] [2026-02-21 15:00] 回退流式输出 + 目录默认展开 + 编辑模式排序

### 修改
- **回退 AI 流式输出**：`sendAiQuestion()` 改回使用 `apiPost` 调用 `/ai-ask`，移除 SSE 流式前端逻辑（后端流式端点保留但前端不再调用）
- **目录默认展开**：进入学习中心时，左侧目录栏自动展开，用户无需手动点击箭头

### 新增
- **编辑模式目录排序**：切换到「编辑」模式后，目录每个项目右侧显示上移/下移按钮，点击即可调整顺序
- `PUT /api/admin/learning-center/contents/reorder` 端点：接收 `content_ids` 数组，批量更新 `sort_order`
- `lc_contents` 表新增 `sort_order` 列（迁移文件 `add_sort_order_to_lc_contents.sql`）
- 内容列表改为按 `sort_order ASC, created_at DESC` 排序

---

## [v1.7.0] [2026-02-21 13:00] AI 助教流式输出 + 小窗/大窗切换

### 新增
- **SSE 流式输出**：新增 `POST /api/learning-center/ai-ask-stream` 端点，AI 回答逐 token 推送到前端
- `LearningCenterService.ai_ask_stream()` 异步生成器：RAG 检索后调用 `provider.async_stream()` + `StreamingThinkingParser` 实时过滤 thinking，只输出 answer
- 前端 `sendAiQuestion()` 改用 `fetch` + `ReadableStream` 读取 SSE，AI 回复逐字渲染 Markdown
- **小窗/大窗切换按钮**：标题栏新增放大/缩小按钮（&#9634; / &#9635;），点击在 380×520 和 680×75vh 之间切换

### 删除
- 移除右下角拖拽缩放手柄（resize handle），以按钮切换替代

---

## [v1.6.1] [2026-02-21 11:30] AI 助教改为浮动窗口（可拖拽、可缩放）

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

## [v1.6.0] [2026-02-21 10:30] AI 助教支持内容感知问答（RAG）

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

## [v1.5.1] [2026-02-21 09:46] 修复学习中心按分类筛选内容报错（Unknown column 'category_id'）

### 修复
- `GET /api/learning-center/contents?category_id=X` 返回 500，MySQL 报 `Unknown column 'category_id' in 'where clause'`
- 原因：`lc_contents` 表没有 `category_id` 列，内容与分类是多对多关系，通过 `lc_content_categories` 中间表关联
- `LCContentRepository.find_published()` 错误地在 `lc_contents` 表上直接过滤 `category_id = %s`
- 修复为子查询：`id IN (SELECT content_id FROM lc_content_categories WHERE category_id = %s)`

---

## [v1.5.0] [2026-02-21 09:41] AI学习中心重构为 Content-First 阅读模式 UI

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

## [v1.4.0] [2026-02-20 23:00] 管理面板新增「内容管理」Tab（编辑 / 删除已上传内容）

### 新增
- 管理面板新增「内容管理」选项卡，列出所有已上传内容
- 每条内容显示类型图标、标题、所属分类
- 支持「编辑」按钮：弹窗修改标题和描述（调用 `PUT /api/admin/learning-center/contents/{id}`）
- 支持「删除」按钮：确认后删除内容（调用 `DELETE /api/admin/learning-center/contents/{id}`）
- 操作完成后自动刷新管理列表和电子教科书目录
- CSS 新增 `.alc-admin-list-item` 和 `.alc-btn--small` 样式

---

## [v1.3.0] [2026-02-20 22:00] 移除 Hero 区域，统计数据移入顶部标题栏

### 修改
- 删除 Hero 区域（"多維度AI知識探索平台" + 副标题 + 统计卡片），释放垂直空间
- 统计数据（课程/视频/文件数量）移到顶部标题栏 "AI 學習中心" 右侧，显示为紧凑的 inline 文字
- 删除 Hero 相关全部 CSS（含 768px / 480px 响应式规则）
- 768px 以下自动隐藏统计数据，保持移动端简洁

---

## [v1.2.0] [2026-02-20 21:00] 教学资料改为电子教科书风格（左侧目录 + 右侧内容）

### 修改
- 教学资料 Tab 从章节目录列表改为**电子教科书**双栏布局
  - 左侧：目录树，按分类分组显示所有资源（视频、文件、图片、文章），支持折叠/展开
  - 右侧：内容查看区，点击目录项直接在右侧显示内容（视频播放、图片预览、文件查看、文章阅读）
  - 不再使用弹窗（Modal），内容直接内嵌显示
- 移除顶部筛选按钮栏（全部/视频/文件/图片/文章）和分类标签栏
- 移除分页，改为一次加载所有内容到目录
- 响应式：768px 以下目录栏改为横向堆叠（上目录下内容）

---

## [v1.1.2] [2026-02-20 20:00] 修复视频播放及文件 URL 问题

### 修复
- 视频弹窗无法播放：`openVideoModal()` 使用不存在的 `file_url` 字段，改为从 `file_path` 构建 URL
- 新增 `getFileUrl()` 工具函数：统一从 `file_path`（如 `uploads/learning_center/video_locals/xxx.mp4`）生成可访问的 URL
- 外部视频（YouTube/Bilibili）iframe 添加 `allow` 属性以支持自动播放
- 修复视频弹窗关闭后残留：`closeAllModals()` 现在正确清理注入的 `<video>` 元素
- 修复图片预览 `openImageModal()` 和文件预览 `openDocModal()` 同样使用不存在的 `file_url`
- 修复资源下载 `downloadResource()` 使用不存在的 `file_url`

---

## [v1.1.1] [2026-02-20 19:00] 媒体资料库改为教材章节目录风格

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

## [v1.1.0] [2026-02-20 18:00] 修复媒体卡片样式 + 默认显示媒体资料库

### 修复
- 媒体卡片 CSS class 不匹配：JS 生成 `alc-content-card` 但 CSS 定义的是 `alc-media-card`，导致卡片无样式
- 外部视频卡片无缩略图：现自动提取 YouTube 视频缩略图
- 默认 tab 从「知识地图」改为「媒体资料库」，进入页面直接看到教学内容

---

## [v1.0.3] [2026-02-20 17:00] 修复上传内容不显示问题

### 修复
- 管理员上传内容后默认 `status="draft"`，媒体库只显示 `published` 内容，导致上传后看不到
- 3 个创建内容的调用（文件上传、外部视频、JSON 创建）全部改为上传后自动发布

---

## [v1.0.2] [2026-02-20 16:00] AI 学习中心页面视觉层级优化

### 修改
- **Hero 区域重构**: 从纵向大标题布局改为横向紧凑信息栏（标题 + 副标题 + 统计数据并排一行）
  - 标题字号 48px → 20px，副标题透明度降至 60%
  - 统计卡片从纵向大卡片改为横向紧凑标签
  - 整体高度减少约 60%
- **间距压缩**: 内容区顶部 padding、Tab 导航上下间距均缩减，确保首屏直接展示学习内容
- **响应式适配**: 移动端 Hero 改为堆叠布局，480px 以下隐藏副标题

---

## [v1.0.1] [2026-02-20 15:00] 修复 AI 学习中心视频连结上传功能

### 修复
- 前端表单缺少视频连结输入框，导致无法上传 YouTube / Bilibili 视频链接
- `submitUploadContent()` 未调用 `/upload` 端点，外部视频数据无法传递给后端
- `openContent()` 和 `renderMediaGrid()` 不识别 `video_local` / `video_external` 类型
- `openVideoModal()` 字段名与后端不匹配（`video_type` → `content_type`，`video_url` → `external_url`）

### 修改
- `web_static/ai_learning_center.html` — 内容类型下拉改为「本地視頻」/「視頻連結」，新增 URL 输入框和平台选择器
- `web_static/js/ai_learning_center.js` — 4 处逻辑修复：类型切换显隐、提交逻辑、内容卡片渲染、视频播放弹窗

---

## [v1.0.0] [2026-02-20 12:00] 项目架构重构与清理

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

## [v0.9.0] [2026-02-20 10:00] 前端页面重构 (Phase 1-3)

### 修改
- 12 个 HTML 页面统一重构
  - 导航栏统一化
  - 响应式布局优化
  - UI 风格一致性调整
  - 页面间跳转逻辑修复
