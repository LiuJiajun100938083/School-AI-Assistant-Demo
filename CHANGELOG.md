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

## [v3.0.13] [2026-02-25] 学生端课堂 AI 助手 — 基于 PPT 内容的流式问答

### 新增

- **课堂 AI 流式端点** — `POST /api/classroom/rooms/{room_id}/ai/stream`，SSE 流式输出，严格基于 PPT 课件内容回答学生提问
- **PPT 上下文提取** — AI 提问时自动提取当前页 ± 前后各 1 页的 PPT 文字作为知识上下文
- **限定 system prompt** — AI 只回答课件相关问题，课件中没有的信息明确告知学生
- **对话连续性** — 基于 `conversation_id` 维持多轮对话，历史消息持久化到 `chat_messages` 表
- **学生端 AI 面板** — 浮动 🤖 按钮打开侧边聊天面板，支持实时流式输出
- **消息气泡 UI** — 用户消息（右侧品牌绿）/ AI 消息（左侧浅灰）/ 系统消息（居中）/ 打字指示器（三点脉冲）
- **翻页通知** — 老师翻页时 AI 面板自动插入"老师已翻到第 X 页"系统提示

### 修改

- **page_pushed 广播增加 text_content** — HTTP push / WS push / get_latest_push 三处广播均携带页面文字，学生端缓存避免额外请求

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/routers/classroom.py` | 新增 AI 流式端点 + 3 处广播加 text_content |
| `app/domains/classroom/service.py` | push_page 返回值增加 text_content |
| `web_static/classroom_student.html` | AI 面板 HTML 重构（欢迎信息 + 启用输入框） |
| `web_static/css/classroom_student.css` | 消息气泡 / 打字指示器 / 系统消息样式 |
| `web_static/js/classroom_student.js` | AI API 方法 + SSE 流式解析 + 消息渲染 + 翻页通知 |

---

## [v3.0.12] [2026-02-25] 课堂创建允许空班级 + 缩略图加载优化

### 修复

- **创建课堂不填班级 422 错误** — `allowed_classes` 从必填 `min_length=1` 改为 `default=[]`，空列表表示不限制班级
- **Service 层去掉"至少需要指定一个班级"校验** — 空 `allowed_classes` 放行所有学生加入
- **Repository SQL 查询** — 学生可见房间查询加 `JSON_LENGTH(allowed_classes) = 0 OR ...`，不限制班级的房间对所有学生可见

### 优化

- **缩略图加载从全尺寸改为 thumb 接口** — 从 `/page/{n}`（700KB-2MB/张）改为 `/thumb/{n}`（~30KB/张），总传输量 ~35MB → ~2MB
- **并发控制** — 缩略图加载从 29 个全并发改为每批 3 个，避免打满服务器

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/domains/classroom/schemas.py` | `allowed_classes` default=[] |
| `app/domains/classroom/service.py` | 去掉空班级校验 + 加入房间空列表跳过检查 |
| `app/domains/classroom/repository.py` | SQL 加 JSON_LENGTH=0 条件 |
| `web_static/js/classroom_teacher.js` | 缩略图用 /thumb/ 接口 + 批量并发控制 |

---

## [v3.0.11] [2026-02-25] 课堂页面 UI 统一至主页 Apple-Style 设计系统

### 修改

- **品牌色统一** — 课堂三页面（list / teacher / student）主色从蓝色 `#007AFF` / `#0071e3` 统一为主页品牌绿 `#006633`
- **设计 token 系统引入** — 阴影（5 级）、圆角（7 级）、间距、动画缓动全部对齐主页 `:root` 变量
- **字体栈统一** — 从通用系统字体改为 SF Pro Display 完整 Apple 字体栈
- **Splash Screen 重做** — 紫蓝渐变背景 → 纯白背景 + 品牌绿三点脉冲加载器（与主页一致）
- **卡片交互对齐** — 去掉 `translateY` hover 效果，改为微妙阴影渐变（遵循主页设计规范）
- **AI Circle 统一** — 学生页浮动 AI 按钮从紫蓝渐变 → 品牌绿实色
- **头像颜色统一** — 用户头像 / 学生头像从蓝色渐变 → 品牌绿

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/css/classroom_list.css` | 完全重写 — 品牌色 + token 系统 + splash + 卡片 + modal |
| `web_static/css/classroom_student.css` | 完全重写 — 品牌色 + token 系统 + splash + AI circle/chat |
| `web_static/css/classroom_teacher.css` | 完全重写 — 品牌色 + token 系统 + toolbar + sidebar + modal |
| `web_static/classroom_list.html` | Splash 结构改为三点脉冲加载器 |
| `web_static/classroom_student.html` | Splash 结构改为三点脉冲加载器 |

---

## [v3.0.10] [2026-02-25] 全链路 sync-in-async 修复 — 所有路由同步 DB 调用异步化

### 优化

- **`get_current_user()` 异步化** — 每个认证请求的 `pool.execute_one()` 改为 `run_in_executor`，影响所有使用 `Depends(get_current_user)` 的路由（game_upload / classroom / mistake_book / learning_task / app_modules / ai_learning_center）
- **游戏分享 QR 码扫描** — `get_shared_game()` 公开端点 + 全部 game_upload 路由的同步 service 调用改为 `run_in_executor`
- **课堂 HTTP 路由全面异步化** — create_room / list_rooms / get_room / join_room / leave_room / upload_ppt / push_page / get_latest_push 等 19 个端点全部 `run_in_executor`
- **错题本路由异步化** — get_my_mistakes / get_dashboard / record_review / teacher_class_report 等学生高频端点
- **学习任务路由异步化** — get_my_tasks / get_my_progress / toggle_item_completion 等学生端点
- **教师班级路由异步化** — get_students_summary 中 N+1 查询（for 循环 get_latest_student_analysis）改为逐个 `run_in_executor`，避免 30 个串行 DB 查询阻塞事件循环
- **AI 学习中心学生端异步化** — stats / categories / contents / knowledge-map / paths / search 等学生高频端点
- **应用模块路由异步化** — get_apps / get_all_apps / update_apps / reset_apps

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/core/dependencies.py` | `get_current_user()` DB 查询 `run_in_executor` |
| `app/routers/game_upload.py` | 全部 7 个 sync service 调用 → `run_in_executor` |
| `app/routers/classroom.py` | 全部 19 个 HTTP 路由 sync service 调用 → `run_in_executor` |
| `app/routers/mistake_book.py` | 全部 sync service 调用 → `run_in_executor` |
| `app/routers/learning_task.py` | 全部 sync service 调用 → `run_in_executor` |
| `app/routers/teacher_class.py` | 全部 sync service 调用 → `run_in_executor`（含 N+1 循环） |
| `app/routers/app_modules.py` | 全部 sync service 调用 → `run_in_executor` |
| `app/routers/ai_learning_center.py` | 8 个学生端高频端点 sync → `run_in_executor` |

---

## [v3.0.9] [2026-02-25] 30 人并发优化 — 登录/扫码/课堂全链路异步化 + 共享 IP 防误锁

### 修复

- **学校共享 IP 误锁** — `login_max_attempts_per_ip` 原为 5，同一公网 IP 下 5 个学生各输错 1 次密码即锁全校 15 分钟；调高至 50，仅防暴力攻击
- **LoginAttemptTracker 参数缺失** — `AuthService` 只传了 2 个参数给 `LoginAttemptTracker`，`time_window` / `ip_whitelist` / `block_duration_user` 等均用了硬编码默认值而非 settings 配置；现已完整传递全部 7 个参数
- **多 Worker 导致 WebSocket 广播丢失** — `server_workers=4` 时课堂 PPT 推送只送达同进程学生（约 1/4），其余收不到；改回 `server_workers=1`

### 优化

- **bcrypt 异步化** — `PasswordManager.verify_password_async()` 在线程池中执行 bcrypt，不阻塞事件循环；30 人并发登录从 ~9s 串行降至 ~0.5s 并行
- **登录全链路异步** — `login()` 改为 `async`，`find_by_username` 放入 `run_in_executor`，`update_login_info` 改为 fire-and-forget 线程池
- **登录合并查询** — `login()` 返回值直接包含 `class_name`，移除路由层登录后重复的 `get_user()` 调用（每次登录少 1 次 DB 往返）
- **连接池 SET SESSION 优化** — `SET SESSION sql_mode` 从每次 `connection()` 移到 `setsession` 初始化参数，每次获取连接少 1 次 DB 往返
- **课堂 WebSocket 异步化** — `verify_token` / `get_room` / `heartbeat` / `push_page` / `get_latest_push` 全部通过 `run_in_executor` 在线程池执行，30 人同时进教室不串行阻塞

### 新增配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `login_max_attempts_per_ip` | 50 | 同一 IP 允许失败次数（学校共享 IP 调高） |
| `login_max_attempts_per_user` | 5 | 同一用户允许失败次数 |
| `login_max_attempts_per_ip_user` | 3 | 同一 IP+用户组合允许失败次数 |
| `login_block_duration` | 900 | IP 级别锁定时间（秒） |
| `login_block_duration_user` | 300 | 用户级别锁定时间（秒） |

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/config/settings.py` | IP 阈值 5→50，新增 `login_max_attempts_per_ip_user` / `login_block_duration_user`，`server_workers` 4→1 |
| `app/core/security.py` | 新增 `PasswordManager.verify_password_async()` |
| `app/domains/auth/service.py` | `login()` 改 async，DB 查询 + bcrypt 全部线程池；完整传递 LoginAttemptTracker 参数 |
| `app/routers/auth.py` | 加 `await`，移除登录后重复 `get_user()` |
| `app/routers/classroom.py` | WebSocket 连接流程 + 消息循环中同步 DB 全部 `run_in_executor` |
| `app/infrastructure/database/pool.py` | `setsession` 加入 sql_mode 设置，移除 `connection()` 中逐次 SET SESSION |

---

## [v3.0.8] [2026-02-24] 游戏分享二维码 — 老师生成限时链接，学生扫码免登入直接玩

### 新增

- **游戏分享功能** — 老师可在「我的游戏」或「游戏中心」点击分享按钮，选择有效期（30 分钟 / 1 小时 / 1 天 / 1 周），生成二维码和分享链接
- **无需登入游戏页面** — 学生扫码 / 点击链接后直接打开 `/play/{token}` 轻量页面，iframe 加载游戏，无需登入
- **分享 Token 后端** — 新增 `game_share_tokens` 表；`POST /api/games/{uuid}/share` 创建 token；`GET /api/games/shared/{token}` 公开验证 token 并返回游戏信息
- **前端二维码生成** — 使用 `qrcode.js` CDN 在浏览器端生成二维码，支持复制链接

### 修复

- **分享弹窗 DOM 空指针** — `GameShareHelper.open()` 新增 null 检查，防止浏览器缓存旧 HTML 时 `gcShareTitle` 元素不存在导致 crash
- **`data-name` 属性引号逃逸** — `Utils.escapeHtml()` 不会转义双引号，游戏名含 `"` 时会破坏 HTML 属性；新增 `.replace(/"/g, '&quot;')` 修复
- **`game_share_tokens` 建表失败** — `_init_share_table(conn)` 在 `transaction()` 上下文外调用，`conn` 已关闭导致建表未执行，分享 API 返回 500
- **分享游戏页 iframe 不撑满视口** — `html`/`body` 缺少 `height:100%`，iframe 容器改用 `position:absolute` 撑满 header 下方空间

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/domains/game_upload/repository.py` | 新增 `game_share_tokens` 建表 + `create_share_token` / `find_share_token` / `cleanup_expired_tokens` |
| `app/domains/game_upload/service.py` | 新增 `create_share_token()` / `get_shared_game()` 业务逻辑 |
| `app/routers/game_upload.py` | 新增 `POST /{uuid}/share` + `GET /shared/{token}` 端点 |
| `app/routers/pages.py` | 新增 `GET /play/{token}` 页面路由 |
| `web_static/game_play_shared.html` | **新建** — 无登入游戏播放页 |
| `web_static/my_games.html` | 新增分享按钮 + 二维码弹窗 |
| `web_static/game_center.html` | 新增分享弹窗 HTML + qrcode.js CDN |
| `web_static/js/game_center.js` | 新增 `GameShareHelper` 对象 + 分享按钮渲染 + null 安全修复 |
| `web_static/css/game_center.css` | 新增分享弹窗样式 |

---

## [v3.0.7] [2026-02-24] 集成 PDF.js 解决 iPad/Safari PDF 显示空白

### 新增

- **PDF.js 渲染引擎** — 引入 PDF.js 3.11（CDN），使用 canvas 渲染 PDF，解决 iPad Safari 下 `<iframe>` 无法显示 PDF 的 WebKit 限制
- **滚动式 PDF 阅读器** — `_renderPdfViewer()` 提供工具栏（翻页 / 页码输入 / 缩放 / 下载）、懒加载（仅渲染视口 ±500px 页面）、anchor 页码跳转

### 修复

- **PDF.js 页码跳转完善** — `goToPage` 先渲染目标页再滚动，暴露给外部 anchor 导航使用
- **PDF 页码跳转失效** — anchor 直接拼入 iframe 初始 URL，避免后续跳转丢失
- **学习路径跳转 PDF 页码失效** — `applyAnchor()` 兼容 PDF.js 查看器，查找 `.alc-pdf-page` 元素定位

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/ai_learning_center.html` | 引入 PDF.js CDN script |
| `web_static/js/alc_media.js` | 新增 `_renderPdfViewer()`、修改 `applyAnchor()` 兼容 PDF.js |
| `web_static/js/alc_knowledge_map.js` | tooltip 跳转按钮引号修复 |
| `web_static/css/ai_learning_center.css` | PDF 查看器样式（深色工具栏 + 响应式 + touch 优化） |

---

## [v3.0.6] [2026-02-24] 知识图谱树形布局模式 + 多项修复

### 新增

- **树形布局模式** — 使用 d3 Reingold-Tilford 算法的静态树形布局，无需力模拟，适合移动设备和低性能机器
- **自动检测切换** — `shouldUseTreeLayout()` 检测 iPad/移动设备、低核心/低内存、节点数 >150 时自动启用树形布局
- **手动切换按钮** — 控制面板新增布局切换按钮，点击即切换 force ↔ tree

### 修复

- **知识图谱 tooltip 快捷跳转按钮 SyntaxError** — `onclick` 内 JSON 引号转义错误导致 JS 解析失败
- **学习路径步骤按钮 JSON 引号 SyntaxError** — 同类引号转义问题修复
- **知识图谱高亮缺少关联边虚化** — 高亮节点时关联边未正确虚化
- **`_mapCtx` 补全** — 补全 `crossLinks`/`crossEdgeLabels` 字段，修复 `applyLOD` 报错

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/alc_knowledge_map.js` | 新增 `shouldUseTreeLayout()` / `buildTreeLayout()` + force/tree 双模式 + 多项修复 |
| `web_static/ai_learning_center.html` | 布局切换按钮 HTML |
| `web_static/css/ai_learning_center.css` | 布局切换按钮样式 |
| `web_static/js/alc_media.js` | 步骤按钮 JSON 引号修复 |

---

## [v3.0.5] [2026-02-24] 学习路径步骤显示详细页码 + 精准跳转

### 修改

- **学习路径步骤附带页码信息** — 后端 `get_path_detail` 为每个步骤查询 `lc_node_contents` 中的 anchor（页码定位），并附带 `content_title` 和 `content_type`
- **步骤按钮显示文档标题 + 页码** — "查看文档" 按钮从通用文字改为显示具体文档名和页码提示（如 `📄 AI基础教程 → 第 5-10 页`）
- **点击步骤精准跳转到页码** — 点击"查看文档"从 `openContent` 改为 `navigateToContent`，携带 anchor 参数，PDF 打开后自动定位到关联页码

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/domains/ai_learning_center/service.py` | `get_path_detail()` 为步骤附加 anchor、content_title、content_type |
| `web_static/js/alc_media.js` | 步骤渲染显示 anchorHint + 调用 `navigateToContent` 替代 `openContent` |

---

## [v3.0.4] [2026-02-24] AI 助教知识点导航 — 显示完整路径并突出目标节点

### 新增

- **知识点路径高亮** — 点击 AI 助教回答中的知识点标签，不再只显示单个节点，而是高亮从根节点到目标节点的**完整层级路径**
  - 路径上所有祖先节点显示环形标记，目标节点显示更大更亮的脉冲环
  - 路径上的层级边加粗高亮（stroke-width: 3），非路径节点/边淡化至 0.1 透明度
  - 自动展开路径上被折叠的祖先节点
  - 视口自动平移缩放，以 70% 权重偏向目标节点、30% 权重覆盖整条路径
  - 路径标签强制显示（不受 LOD 缩放级别限制）
  - 8 秒后自动恢复正常显示，重新应用 LOD 规则

### 修改

- **AI 助教节点导航重构** — `navigateToKnowledgeNode()` 从搜索 + 弹面板改为调用 `highlightNodeWithPath()`，代码从 25 行简化为 2 行

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/alc_knowledge_map.js` | 新增 `highlightNodeWithPath()`、`_panToPathNodes()`、`_clearPathHighlight()`；模块级 `_mapCtx` 存储渲染上下文 |
| `web_static/js/ai_learning_center.js` | `alc` 对象和 `window.lcLearningCenter` 增加 `highlightNodeWithPath` 桥接 |
| `web_static/js/alc_ai_chat.js` | `navigateToKnowledgeNode()` 简化为调用 `$.highlightNodeWithPath()` |
| `web_static/css/ai_learning_center.css` | 新增 `.kg-path-ring` 脉冲动画（目标节点 1.5s / 祖先节点 2s） |

---

## [v3.0.3] [2026-02-24] 修复知识地图拖拽卡顿 + 节点不跟随

### 修复

- **拖拽卡顿（hover/tooltip 定时器干扰）** — 鼠标移到节点上开始拖拽时，350ms/500ms 的 hover 高亮和 tooltip 定时器仍在后台运行，触发后大量 `transition` 动画与 simulation tick 冲突，导致拖拽明显卡顿甚至"卡住"
  - `drag start` 时立即清除所有 hover/tooltip 定时器并重置高亮
  - 设置 `_anyNodeDragging` 全局标志，`mouseenter`/`mouseleave` 中检查此标志，拖拽期间完全跳过 hover/tooltip 逻辑
  - 定时器回调内增加二次检查，防止已启动未执行的定时器回调在拖拽中触发

- **拖拽时其他节点不跟随** — `alphaTarget(0.3)` 仅在首次超过 3px 阈值时设置一次，之后 simulation 自然冷却（`alphaDecay: 0.03`），力场衰减导致邻居节点不再响应
  - 拖拽持续期间每次 `drag` 事件都保持 `alphaTarget(0.3)`，确保力场全程活跃

- **拖拽后误触发 click/dblclick** — 拖拽结束时可能误触发节点详情面板或折叠/展开
  - `click`/`dblclick` 事件中增加 `_isDragging` 检查，排除拖拽行为

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/alc_knowledge_map.js` | drag behavior 增加 hover/tooltip 抑制 + simulation 持续加热 + click 防误触 |

---

## [v3.0.2] [2026-02-23] 修复错题本图形描述未显示 + 首页分组 + SVG 图标统一

### 修复

- **错题本图形描述断链** — Vision AI 成功识别几何图形描述并存入 DB，但 `upload_mistake_photo()` 返回前端的 dict 遗漏 `figure_description` 字段，导致前端从未收到图形信息
  - `mistake_book/service.py`: 返回 dict 增加 `figure_description` 字段
  - `mistake_book.js`: 前端收到后自动拼接 `[圖形描述：...]` 到题目 textarea，用户可见可编辑
  - `mistake_book/service.py` `confirm_and_analyze()`: 增加去重逻辑，若题目已含 `[圖形描述：` 前缀则不再重复传 figure_description 给 AI

### 新增

- **首页应用按分类分组** — 应用卡片按 learning / community / teaching / admin 分组折叠显示，教学/管理组默认折叠
- **SVG 图标统一** — 首页 14 个应用 + AI 学习中心 tab/模式切换全部从 emoji 替换为 Lucide 风格 SVG 线性图标
- **管理后台分类管理** — 应用管理面板增加分类分组视图和分类下拉选择器

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/domains/mistake_book/service.py` | `upload` 返回增加 `figure_description`；`confirm` 增加去重判断 |
| `web_static/js/mistake_book.js` | 上传面板显示图形描述，拼接到题目文本 |
| `web_static/js/index.js` | `renderHomeApps()` 分类分组 + SVG 图标映射 |
| `web_static/css/index.css` | 分组 header/grid 样式、折叠动画 |
| `web_static/js/admin_dashboard.js` | 应用管理分类分组 + 分类下拉 |
| `web_static/ai_learning_center.html` | 5 tab + 3 mode emoji → SVG |
| `web_static/css/ai_learning_center.css` | SVG 尺寸样式、tab 标签始终可见 |

---

## [v3.0.1] [2026-02-23] P0 安全漏洞修复 — 认证绕过 + XSS + Token 黑名单持久化

### 修复

- **C2: game_upload.py 认证绕过** — 所有 6 个端点通过 Form/Query 接收客户端传入的 `user_id` 和 `user_role`，攻击者可伪造任意身份
  - 后端：全部改为 `Depends(get_current_user)` 从 JWT Token 提取身份
  - 前端：`game_upload.js` / `game_center.js` / `my_games.html` 移除明文 `user_id`/`user_role` 参数，依赖 `Authorization: Bearer` 头

- **C3: china_game.py 零认证** — 14 个桌游端点无需登录即可访问，任何人可操纵游戏状态
  - 后端：`router` 添加 `dependencies=[Depends(get_current_user)]`，所有端点统一要求 JWT 认证
  - 前端：`china_economy_game.js` 的 `api()` 方法添加 `Authorization` 头，`init()` 强制登录（移除访客模式回退）

- **C4: Token 黑名单内存丢失** — `JWTManager._blacklist` 为 Python `set()`，服务重启后已注销的 Token 重新生效
  - `security.py` 的 `revoke_token()` / `is_revoked()` 改写为：写入 MySQL `token_blacklist` 表 + 内存缓存加速
  - `cleanup_expired_tokens()` 改为按 `expires_at` 清理数据库过期记录
  - 新增迁移文件 `database_migration/create_token_blacklist.sql`

- **C5: XSS 注入 (marked.parse)** — `marked.parse()` 输出直接赋值 `innerHTML`，恶意 Markdown 中的 `<script>` 可执行
  - 引入 DOMPurify CDN 到 `ai_learning_center.html` 和 `admin_dashboard.html`
  - 4 处 `marked.parse()` 调用全部包裹 `DOMPurify.sanitize()`

### 涉及文件

| 文件 | 变更 |
|------|------|
| `app/core/security.py` | `JWTManager` 黑名单从内存 `set()` 迁移到 DB + 缓存双层架构 |
| `app/routers/game_upload.py` | 6 个端点改用 `Depends(get_current_user)`，删除旧 `get_current_user()` |
| `app/routers/china_game.py` | router 级别添加 JWT 认证依赖 |
| `web_static/js/game_upload.js` | 移除 FormData 中的 `user_id`/`user_role`，移除 URL query 参数 |
| `web_static/js/game_center.js` | 移除 API 调用中的 `user_id`/`user_role` 参数 |
| `web_static/my_games.html` | 移除 fetch URL 中的 `user_id`/`user_role` |
| `web_static/js/china_economy_game.js` | `api()` 添加 Auth 头，`init()` 强制登录 |
| `web_static/ai_learning_center.html` | 引入 DOMPurify CDN |
| `web_static/admin_dashboard.html` | 引入 DOMPurify CDN |
| `web_static/js/ai_learning_center.js` | 2 处 `marked.parse()` 包裹 `DOMPurify.sanitize()` |
| `web_static/js/admin_dashboard.js` | 2 处 `marked.parse()` 包裹 `DOMPurify.sanitize()` |
| `database_migration/create_token_blacklist.sql` | 新增 Token 黑名单表迁移脚本 |

---

## [v3.0.0] [2026-02-23] 学习路径系统 + 知识图谱多圆心布局 + AI×KG 联动

### 新增

- **AI 助教 × 知识图谱联动 (v2.6.0)** — AI 回答自动关联知识节点，答案底部显示可点击的节点 chip 标签
  - `ask_ai_func` 注入 `LearningCenterService`，通用路径也使用教学助教 prompt
  - 节点导航时清除搜索状态 + 面板 z-index 调整

- **知识图谱多圆心辐射布局 (Multi-Center Radial Layout)** — 每个根节点作为独立圆心，子节点向外辐射形成独立圆形簇
  - `computeHierarchy()` 添加 `_rootId` 传播，每个节点知道自己属于哪个根
  - `buildForceSimulation()` 完全重写：移除 `forceCenter` + `forceRadial`，改用 4 个自定义力：
    - `clusterRadial`：每个节点以自己根的实时坐标为圆心做径向约束
    - `cluster`：子节点向父节点聚拢
    - `rootRepel`：根节点两两排斥，防止簇重叠（minDist=400）
    - `gravity`：极弱引力防止漂出画布
  - 环形参考线改为每个簇独立绘制
  - 多根时初始缩放 0.45，单根退化为原有布局

- **学习路径批量导入** — JSON 一次性创建多条学习路径和步骤
  - `POST /api/admin/learning-center/paths/batch-import` 后端端点
  - `batch_import_paths()` 服务方法：`node_match` 按标题自动匹配知识节点，`source_pdf` 按文件名自动匹配内容
  - `data/learning_paths.json`：8 条学习路径（UTest 完整/快速、AI Agent、AI Bench、混合课堂、Zoom LTI、虚拟会议室、新教师入职）

- **管理面板学习路径 JSON 上传** — 无需 curl，直接在管理面板上传
  - 「📥 導入學習路徑 JSON」按钮 + 拖放/粘贴模态框
  - `openPathImportModal()` / `readPathImportFile()` / `submitPathImport()` 前端逻辑

- **学习路径步骤跳转** — 步骤详情增加两个导航按钮
  - 📄 查看文档 → `openContent(content_id)`，自动切换到教学资料 tab
  - 🔗 知识节点 → `navigateToKnowledgeNode(node_id)`，跳转到知识图谱并定位

### 修复

- **节点详情面板关闭按钮不可见** — 白色按钮在绿色头部上看不到，改为白底灰边 + hover 变红
- **节点详情面板关闭按钮被顶部导航遮挡** — 面板 z-index:50 < 导航 z-index:100，改为 `position: fixed; z-index: 110; height: 100vh`
- **学习路径卡片 UI 重写** — 原有卡片使用不存在的 CSS 类导致无样式
  - 改用设计系统的 `alc-path-cover` / `alc-path-body` / `alc-difficulty-badge` 等 CSS 类
  - 卡片增加渐变色封面（入门绿/中级橙/高级粉）+ 大图标 + 描述 3 行截断
- **学习路径详情弹窗不显示** — `showPathDetail()` 替换 innerHTML 使用无 CSS 的类名
  - 改为填充预构建的 DOM 元素 + CSS `.active` class 动画 + 背景点击关闭
  - 步骤渲染为 `.alc-timeline` 时间线格式 + `.alc-step-action-btn` 操作按钮
- **从学习路径跳转文档失败** — `openContent()` 未切换 tab 导致 ebook viewer 元素不可见
  - 添加 `await switchTab('media')` 确保先切换到教学资料页面

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | 多圆心布局 + AI×KG 联动 + 路径 JSON 导入 + 路径详情重写 + openContent tab 切换 |
| `web_static/css/ai_learning_center.css` | `.alc-step-actions` / `.alc-step-action-btn` 步骤按钮样式 + 面板 fixed 定位 |
| `web_static/ai_learning_center.html` | 路径 JSON 上传按钮 + `pathImportModal` 模态框 + overlay 改为 CSS class |
| `app/routers/ai_learning_center.py` | `PathStepInput` 添加 title/node_id + 批量导入端点和模型 |
| `app/domains/ai_learning_center/service.py` | `batch_import_paths()` 100 行 — 自动匹配 node/content + 可选清空 |
| `data/learning_paths.json` | 8 条学习路径 JSON 数据 |

---

## [v2.5.2] [2026-02-23] defaultCollapseDepth 改为 2

### 修改

- `LAYOUT_CONFIG.defaultCollapseDepth` 从 1 改为 2，初始显示到 L2 层，看到更多节点

---

## [v2.5.1] [2026-02-23] 知识图谱 Bug 修复 — NaN 位置 + 层级边标签 + 不可见边隐藏

### 修复

- **NaN 位置错误** — 所有节点初始化时设置随机 x/y 坐标，防止不可见节点坐标为 undefined 导致 `<text>` 和 `<line>` 属性出现 NaN
- **层级边全部堆在中心** — 不可见边（两端节点不可见）初始 stroke-opacity 设为 0，`edgeBothVisible()` 辅助函数统一判断可见性
- **rebuildSimulation 边引用错误** — 重建仿真前将 D3 已变异的 source/target 对象引用重置为 ID，避免新仿真无法匹配节点

### 新增

- **层级边标签 (hierEdgeLabels)** — 在层级连线中点显示关系文字（如"管理员配置""第1步"），白色描边增强可读性，zoom ≥ 0.7x 时显示
- **辅助函数重构** — `edgeSourceNode()` / `edgeTargetNode()` / `edgeBothVisible()` 统一边端点解析逻辑，消除重复 typeof 检查
- **tickHandler 提取为命名函数** — 初始仿真和 rebuildSimulation 共享同一 tick 处理器

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | `edgeSourceNode/edgeTargetNode/edgeBothVisible` 辅助函数 + `hierEdgeLabels` 渲染 + 所有节点 x/y 初始化 + `rebuildSimulation` 边重置 + `applyLOD/handleNodeHover` 更新 |
| `web_static/css/ai_learning_center.css` | 新增 `.kg-hier-label` 样式（白色描边防底色干扰） |

---

## [v2.5.0] [2026-02-23] 知识图谱回归 Force Simulation 动态布局 — 可拖拽 + 软径向约束 + 碰撞防重叠

### 修改

- **布局引擎回归** — 从确定性 Radial Tree 回退到 D3 Force Simulation 动态力导向布局，恢复可拖拽、惯性回弹、自动重新排布的动态交互体验
- **buildForceSimulation()** — 新建力仿真配置函数，包含:
  - `forceLink` 层级边弹簧力（distance 100+自适应，strength 0.3）
  - `forceManyBody` 排斥力（-320，按节点数自动缩放 60/N）
  - `forceCollide` 硬碰撞（radius + 16px padding，6 次迭代，strength 0.9）
  - `forceRadial` 软径向约束（按 depth 不同半径 0/220/400/560，strength 0.35/0.25/0.18）
  - 自定义 `cluster` 力（同 L1 子节点向父节点轨道聚拢，strength 0.06）
- **参数自动调优** — chargeStrength、linkDistance 根据可见节点数 N 自动缩放，小图更紧凑、大图更分散
- **拖拽行为恢复** — drag start 固定 fx/fy，drag end 释放并设置 alphaTarget(0.15) 平滑回弹
- **Hover 散射效果** — hover 节点时邻居向外散射 10-20px 高亮，其余节点淡化；hover 结束恢复
- **Cross-links 按需显示** — 默认隐藏跨层虚线，仅在 hover 时显示 1-hop 邻居关系
- **标签 LOD 降噪** — zoom < 1.1 隐藏 L2+ 节点文字标签，hover/选中时始终显示
- **搜索自动展开** — 搜索匹配节点时自动展开其祖先路径，触发 rebuildSimulation 重布局
- **删除 buildRadialTree / countVisibleDescendants** — 移除确定性径向树相关函数
- **层级边改为 `<line>`** — 替代之前的 `<path>`，配合 tick handler 实时更新位置

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | 删除 `buildRadialTree()` / `countVisibleDescendants()` + 新增 `buildForceSimulation()` + `renderKnowledgeMap()` 重写（simulation tick / drag / hover scatter）+ `searchNodes()` 兼容 rebuildSimulation + `initMapSearch()` 签名更新 + reset zoom 0.8 |

---

## [v2.4.1] [2026-02-23] 知识图谱布局密度优化 — 扇区化 + 碰撞检测 + 标签降噪

### 修改

- **环形半径大幅增加** — ringRadii 从 `[0,180,340,470,570]` 调整为 `[0,260,440,640,800]`，L1/L2/L3 层间距更宽敞
- **扇区化角度分配 (Sectorization)** — 每个根节点按子树权重获得独立角度扇区，L1 子节点均匀分布于父扇区内，L2/L3 递归细分，彻底消除跨子树节点混杂
- **后置碰撞检测 (Post-layout Collision Resolution)** — 同环节点按角度排序后迭代推开重叠对（`collisionPadding: 14px`，`iterations: 6`），确保最小间距
- **标签 LOD 降噪** — `zoom < 1.1` 时隐藏 L2+ 节点标题文字，仅显示 root + L1 标签；放大至 1.1x+ 才显示深层标签，hover 时始终显示
- **展开自动居中** — 双击展开分支后，视图自动平移居中到展开的子树 bounding box 中心
- **动态环形辅助线** — 辅助线仅绘制有可见节点的环形半径，展开/收起时实时更新
- **多根节点分散** — 5 个根节点分布在半径 100px 的小环上（而非全部堆叠在原点）
- **初始缩放调整** — 默认缩放从 0.85 降低至 0.75，适配更大的布局范围

### 涉及文件

| 文件 | 变更 |
|------|------|
| `web_static/js/ai_learning_center.js` | `LAYOUT_CONFIG` 参数扩展 + `buildRadialTree()` 完全重写（扇区分配+碰撞检测）+ `applyLOD()` 标签阈值 + `toggleCollapse()` 自动居中 + 动态 `updateRingGuides()` |

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
