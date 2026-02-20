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
