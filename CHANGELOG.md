# 更新日志 (CHANGELOG)

> **每次重大修改后请在此文件顶部添加新条目。**
>
> 格式：
> ```
> ## [日期] 简要标题
> ### 新增 / 修改 / 删除 / 修复
> - 具体内容
> ```

---

## [2026-02-20] 教学资料改为电子教科书风格（左侧目录 + 右侧内容）

### 修改
- 教学资料 Tab 从章节目录列表改为**电子教科书**双栏布局
  - 左侧：目录树，按分类分组显示所有资源（视频、文件、图片、文章），支持折叠/展开
  - 右侧：内容查看区，点击目录项直接在右侧显示内容（视频播放、图片预览、文件查看、文章阅读）
  - 不再使用弹窗（Modal），内容直接内嵌显示
- 移除顶部筛选按钮栏（全部/视频/文件/图片/文章）和分类标签栏
- 移除分页，改为一次加载所有内容到目录
- 响应式：768px 以下目录栏改为横向堆叠（上目录下内容）

---

## [2026-02-20] 修复视频播放及文件 URL 问题

### 修复
- 视频弹窗无法播放：`openVideoModal()` 使用不存在的 `file_url` 字段，改为从 `file_path` 构建 URL
- 新增 `getFileUrl()` 工具函数：统一从 `file_path`（如 `uploads/learning_center/video_locals/xxx.mp4`）生成可访问的 URL
- 外部视频（YouTube/Bilibili）iframe 添加 `allow` 属性以支持自动播放
- 修复视频弹窗关闭后残留：`closeAllModals()` 现在正确清理注入的 `<video>` 元素
- 修复图片预览 `openImageModal()` 和文件预览 `openDocModal()` 同样使用不存在的 `file_url`
- 修复资源下载 `downloadResource()` 使用不存在的 `file_url`

---

## [2026-02-20] 媒体资料库改为教材章节目录风格

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

## [2026-02-20] 修复媒体卡片样式 + 默认显示媒体资料库

### 修复
- 媒体卡片 CSS class 不匹配：JS 生成 `alc-content-card` 但 CSS 定义的是 `alc-media-card`，导致卡片无样式
- 外部视频卡片无缩略图：现自动提取 YouTube 视频缩略图
- 默认 tab 从「知识地图」改为「媒体资料库」，进入页面直接看到教学内容

---

## [2026-02-20] 修复上传内容不显示问题

### 修复
- 管理员上传内容后默认 `status="draft"`，媒体库只显示 `published` 内容，导致上传后看不到
- 3 个创建内容的调用（文件上传、外部视频、JSON 创建）全部改为上传后自动发布

---

## [2026-02-20] AI 学习中心页面视觉层级优化

### 修改
- **Hero 区域重构**: 从纵向大标题布局改为横向紧凑信息栏（标题 + 副标题 + 统计数据并排一行）
  - 标题字号 48px → 20px，副标题透明度降至 60%
  - 统计卡片从纵向大卡片改为横向紧凑标签
  - 整体高度减少约 60%
- **间距压缩**: 内容区顶部 padding、Tab 导航上下间距均缩减，确保首屏直接展示学习内容
- **响应式适配**: 移动端 Hero 改为堆叠布局，480px 以下隐藏副标题

---

## [2026-02-20] 修复 AI 学习中心视频连结上传功能

### 修复
- 前端表单缺少视频连结输入框，导致无法上传 YouTube / Bilibili 视频链接
- `submitUploadContent()` 未调用 `/upload` 端点，外部视频数据无法传递给后端
- `openContent()` 和 `renderMediaGrid()` 不识别 `video_local` / `video_external` 类型
- `openVideoModal()` 字段名与后端不匹配（`video_type` → `content_type`，`video_url` → `external_url`）

### 修改
- `web_static/ai_learning_center.html` — 内容类型下拉改为「本地視頻」/「視頻連結」，新增 URL 输入框和平台选择器
- `web_static/js/ai_learning_center.js` — 4 处逻辑修复：类型切换显隐、提交逻辑、内容卡片渲染、视频播放弹窗

---

## [2026-02-20] 项目架构重构与清理

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

## [2026-02-20] 前端页面重构 (Phase 1-3)

### 修改
- 12 个 HTML 页面统一重构
  - 导航栏统一化
  - 响应式布局优化
  - UI 风格一致性调整
  - 页面间跳转逻辑修复
