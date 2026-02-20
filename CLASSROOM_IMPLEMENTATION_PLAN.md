# 课堂教学功能 - 分阶段实施计划

## 技术决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 前端框架 | Vue 3 (CDN 引入) | iPad 触控友好，组件化管理复杂交互，轻量 |
| PPT 转换 | LibreOffice (免费开源) | 高保真渲染，支持所有 PPT 特效和字体 |
| AI 模型 | Ollama (本地) | 隐私安全，无网络延迟 |
| PPT 上限 | 150MB | 用户需求 |
| Canvas 库 | Fabric.js | 成熟的 Canvas 库，支持触控、撤销、序列化 |
| 实时通信 | WebSocket | 已有基础设施，房间级广播 |

---

## 阶段一：基础架构 - 数据库 + 房间管理

### 1.1 数据库建表（本阶段需要的表）

```sql
-- 教室房间
CREATE TABLE IF NOT EXISTS classroom_rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id VARCHAR(64) UNIQUE NOT NULL,
    teacher_id INT NOT NULL,
    teacher_username VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    allowed_classes JSON NOT NULL COMMENT '允许的班级列表 ["7A","7B"]',
    current_ppt_file_id VARCHAR(64),
    room_status ENUM('draft','active','paused','ended') DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    ended_at DATETIME,
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_teacher (teacher_username),
    INDEX idx_status (room_status),
    INDEX idx_created (created_at DESC),
    FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 学生加入记录
CREATE TABLE IF NOT EXISTS classroom_enrollments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    enrollment_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    student_id INT NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    left_at DATETIME,
    is_active BOOLEAN DEFAULT TRUE,
    last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room (room_id),
    INDEX idx_student (student_username),
    INDEX idx_active (room_id, is_active),
    UNIQUE KEY uk_room_student (room_id, student_username),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 1.2 后端文件结构

```
app/domains/classroom/
├── __init__.py
├── repository.py      # ClassroomRoomRepository, ClassroomEnrollmentRepository
├── service.py         # ClassroomService（房间CRUD + 学生加入/离开 + 权限校验）
└── schemas.py         # Pydantic 请求/响应模型

app/routers/
└── classroom.py       # REST API 端点
```

### 1.3 Repository 层

```python
# ClassroomRoomRepository(BaseRepository)
#   TABLE = "classroom_rooms"
#   - create_room(data) -> room_id
#   - get_room_by_id(room_id) -> dict
#   - list_teacher_rooms(teacher_username, status=None) -> list
#   - list_rooms_for_class(class_name, status='active') -> list
#     ⬆ 关键查询: WHERE JSON_CONTAINS(allowed_classes, '"class_name"') AND room_status = 'active'
#   - update_room(room_id, data) -> int
#   - soft_delete_room(room_id) -> int

# ClassroomEnrollmentRepository(BaseRepository)
#   TABLE = "classroom_enrollments"
#   - enroll(data) -> enrollment_id
#   - get_enrollment(room_id, student_username) -> dict
#   - list_room_students(room_id, active_only=True) -> list
#   - count_active(room_id) -> int
#   - unenroll(room_id, student_username) -> int
#   - update_heartbeat(room_id, student_username) -> int
```

### 1.4 Service 层

```python
# ClassroomService
#   核心职责: 业务逻辑 + 权限校验
#
#   create_room(teacher_username, title, description, allowed_classes)
#     - 校验 teacher 角色
#     - 校验 allowed_classes 非空
#     - 生成 UUID room_id
#     - 返回房间信息
#
#   get_room(room_id, current_user)
#     - 教师: 只能看自己的房间
#     - 学生: 只能看 allowed_classes 包含自己 class_name 的房间
#     - 抛出 AuthorizationError 如果无权限
#
#   list_rooms(current_user)
#     - role=teacher → list_teacher_rooms(username)
#     - role=student → list_rooms_for_class(user.class_name)
#
#   update_room_status(room_id, new_status, teacher_username)
#     - 校验房间归属
#     - 状态机: draft→active, active→paused/ended, paused→active/ended
#
#   join_room(room_id, student_username)
#     - 校验房间存在且 active
#     - 校验学生 class_name 在 allowed_classes 中
#     - 幂等: 已加入则更新 is_active=True
#
#   leave_room(room_id, student_username)
#     - 更新 is_active=False, left_at=now
#
#   get_room_students(room_id, teacher_username)
#     - 校验教师拥有该房间
#     - 返回学生列表 + 在线数
```

### 1.5 Router 层（API 端点）

```
POST   /api/classroom/rooms                    创建房间 (teacher)
GET    /api/classroom/rooms                    房间列表 (teacher看自己的, student看可见的)
GET    /api/classroom/rooms/{room_id}          房间详情
PATCH  /api/classroom/rooms/{room_id}/status   更新状态 (teacher)
DELETE /api/classroom/rooms/{room_id}          删除房间 (teacher, 软删除)
POST   /api/classroom/rooms/{room_id}/join     加入房间 (student)
POST   /api/classroom/rooms/{room_id}/leave    离开房间 (student)
GET    /api/classroom/rooms/{room_id}/students 学生列表 (teacher)
```

### 1.6 Pydantic Schemas

```python
# 请求模型
class CreateRoomRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: str = Field("", max_length=1000)
    allowed_classes: List[str] = Field(..., min_length=1)

class UpdateRoomStatusRequest(BaseModel):
    status: Literal['active', 'paused', 'ended']

# 响应模型
class RoomResponse(BaseModel):
    room_id: str
    title: str
    description: str
    allowed_classes: List[str]
    room_status: str
    teacher_username: str
    created_at: datetime
    student_count: int = 0
```

### 1.7 ServiceContainer 注册

```python
# 在 container.py 中新增:
# self._classroom: Optional[ClassroomService] = None
#
# @property
# def classroom(self) -> ClassroomService:
#     if self._classroom is None:
#         self._classroom = ClassroomService(
#             room_repo=self._get_repo(ClassroomRoomRepository),
#             enrollment_repo=self._get_repo(ClassroomEnrollmentRepository),
#             user_repo=self._get_repo(UserRepository),
#             settings=self._settings,
#         )
#     return self._classroom
```

### 1.8 安全要点
- allowed_classes 用 JSON_CONTAINS 查询，防止 SQL 注入
- room_id 使用 UUID v4，不可猜测
- 所有端点通过 Depends(require_teacher) 或 Depends(get_current_user) 鉴权
- 学生只能看到自己班级的房间（服务层二次校验）

---

## 阶段二：PPT 上传、处理与展示 + 老师画板

### 2.1 新增数据库表

```sql
-- PPT 文件
CREATE TABLE IF NOT EXISTS ppt_files (
    id INT AUTO_INCREMENT PRIMARY KEY,
    file_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    teacher_username VARCHAR(100) NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    stored_path VARCHAR(500) NOT NULL,
    file_size BIGINT NOT NULL,
    total_pages INT DEFAULT 0,
    process_status ENUM('pending','processing','completed','failed') DEFAULT 'pending',
    error_message TEXT,
    uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    processed_at DATETIME,
    is_deleted BOOLEAN DEFAULT FALSE,
    INDEX idx_room (room_id),
    INDEX idx_status (process_status),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- PPT 单页
CREATE TABLE IF NOT EXISTS ppt_pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id VARCHAR(64) UNIQUE NOT NULL,
    file_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    image_path VARCHAR(500) NOT NULL,
    text_content LONGTEXT COMMENT '页面提取的文字(供AI使用)',
    thumbnail_path VARCHAR(500),
    INDEX idx_file_page (file_id, page_number),
    FOREIGN KEY (file_id) REFERENCES ppt_files(file_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 推送快照
CREATE TABLE IF NOT EXISTS classroom_pushes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    push_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    page_number INT NOT NULL,
    annotations_json LONGTEXT COMMENT 'Fabric.js Canvas JSON',
    pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_time (room_id, pushed_at DESC),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2.2 PPT 处理引擎

```
app/services/ppt_processor.py

PPTProcessor:
  __init__(settings)
    - upload_dir: ./uploads/ppt/
    - max_size: 150MB
    - libreoffice_path: 自动检测

  validate_file(file_bytes, filename) -> bool
    - 检查扩展名 .pptx
    - 检查 MIME: application/vnd.openxmlformats-officedocument.presentationml.presentation
    - 检查文件头 (magic bytes: PK zip header)
    - 检查大小 <= 150MB
    - 用 python-pptx 尝试打开验证完整性

  async process_ppt(file_id, stored_path, page_repo) -> dict
    - 创建输出目录: ./uploads/ppt/{file_id}/
    - 调用 LibreOffice 转换:
      soffice --headless --convert-to png --outdir {output_dir} {pptx_path}
    - 用 python-pptx 提取每页文字
    - 生成缩略图 (300px 宽)
    - 逐页写入 ppt_pages 表
    - 更新 ppt_files: status=completed, total_pages=N
    - 返回 {file_id, total_pages, status}

  extract_slide_text(slide) -> str
    - 遍历 slide.shapes
    - 提取 shape.text_frame.text
    - 提取表格内容
    - 拼接返回
```

### 2.3 文件上传安全
- 文件存储在 `./uploads/ppt/` (不在 web_static 下)
- 通过认证 API 端点提供访问，不直接暴露静态路径
- 文件名用 UUID 重命名，防止路径遍历
- 上传时先存临时目录，验证通过后移入正式目录
- 限制并发处理数，防止 LibreOffice 耗尽资源

### 2.4 新增 API 端点

```
POST   /api/classroom/rooms/{room_id}/ppt/upload     上传PPT (teacher, multipart)
GET    /api/classroom/ppt/{file_id}                   PPT信息 + 页面列表
GET    /api/classroom/ppt/{file_id}/page/{page_num}   获取页面图片 (认证后返回图片)
GET    /api/classroom/ppt/{file_id}/status             处理状态轮询
POST   /api/classroom/rooms/{room_id}/push             推送当前页+标注给学生
GET    /api/classroom/rooms/{room_id}/current-push     获取最新推送 (学生断线重连用)
```

### 2.5 WebSocket 教室频道

```
WS /ws/classroom/{room_id}

连接流程:
  1. 客户端带 token 连接
  2. 服务端验证 JWT + 房间权限
  3. 加入房间连接池 (ConnectionManager)

ConnectionManager:
  rooms: Dict[str, Dict[str, WebSocket]]
    {room_id: {username: websocket, ...}}

  async broadcast_to_room(room_id, message, exclude=None)
  async send_to_user(room_id, username, message)

消息类型:
  服务端 → 全体:
    {"type": "page_pushed", "push_id": "...", "page_number": 3, "annotations_json": "..."}
    {"type": "student_joined", "username": "...", "display_name": "...", "count": 25}
    {"type": "student_left", "username": "...", "count": 24}
    {"type": "room_status_changed", "status": "paused"}
    {"type": "ppt_loaded", "file_id": "...", "total_pages": 20}

  客户端 → 服务端:
    {"type": "ping"}  →  {"type": "pong"}
    {"type": "heartbeat"}  → 更新 last_heartbeat
```

### 2.6 前端结构

```
web_static/classroom/
├── index.html                # 入口页 (加载 Vue 3 CDN + Fabric.js CDN)
├── teacher.html              # 教师端页面
├── student.html              # 学生端页面
├── css/
│   └── classroom.css         # 样式
├── js/
│   ├── ws-client.js          # WebSocket 封装 (连接、重连、心跳)
│   ├── teacher-app.js        # 教师端 Vue 应用
│   ├── student-app.js        # 学生端 Vue 应用
│   ├── annotation-canvas.js  # Fabric.js 画板封装
│   └── api.js                # API 调用封装
└── components/
    ├── room-list.js          # 房间列表组件
    ├── ppt-viewer.js         # PPT 页面查看器
    ├── toolbar.js            # 画板工具栏 (笔/橡皮/荧光笔/颜色)
    └── student-panel.js      # 学生列表面板
```

### 2.7 老师端画板工具

```javascript
// annotation-canvas.js - 基于 Fabric.js
//
// AnnotationCanvas:
//   init(canvasElement, backgroundImageUrl)
//   setTool('pen' | 'eraser' | 'highlighter' | 'text')
//   setColor(hexColor)
//   setLineWidth(px)
//   undo()
//   redo()
//   clearAll()
//   toJSON() → Fabric.js 序列化 JSON (用于推送)
//   loadFromJSON(json) → 还原标注 (学生端用)
//   getDataURL() → 导出为图片
//
// 工具栏:
//   🖊 画笔 (自由绘画, 支持触控压感)
//   ⬜ 橡皮擦
//   🟡 荧光笔 (半透明)
//   🔤 文字输入
//   📏 直线/箭头
//   🔲 矩形
//   🔴 颜色选择器
//   ↩️ 撤销 / ↪️ 重做
//   🗑 清空画布
//   📤 传送给学生 (核心按钮)
```

---

## 阶段三：学生举手 + 匿名提问

### 3.1 新增数据库表

```sql
CREATE TABLE IF NOT EXISTS student_interactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    interaction_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    student_id INT NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    interaction_type ENUM('raise_hand','question') NOT NULL,
    content TEXT COMMENT '提问内容 (举手则为空)',
    is_anonymous BOOLEAN DEFAULT FALSE,
    is_resolved BOOLEAN DEFAULT FALSE,
    resolved_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_room_unresolved (room_id, is_resolved, created_at DESC),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 3.2 后端新增

```
Repository:
  StudentInteractionRepository(BaseRepository)
    TABLE = "student_interactions"
    - create_interaction(data) -> interaction_id
    - list_unresolved(room_id) -> list
    - count_unresolved(room_id) -> int
    - resolve(interaction_id) -> int

Service (ClassroomService 新增方法):
    - raise_hand(room_id, student_username) -> dict
    - submit_question(room_id, student_username, content, is_anonymous) -> dict
    - get_interactions(room_id, teacher_username, resolved=False) -> list
    - resolve_interaction(interaction_id, teacher_username) -> None

API 端点:
    POST   /api/classroom/rooms/{room_id}/raise-hand
    POST   /api/classroom/rooms/{room_id}/question
    GET    /api/classroom/rooms/{room_id}/interactions     (teacher)
    PATCH  /api/classroom/interactions/{id}/resolve        (teacher)

WebSocket 新增消息:
    {"type": "hand_raised", "student": "...", "interaction_id": "..."}
    {"type": "new_question", "content": "...", "is_anonymous": true, "interaction_id": "..."}
    {"type": "interaction_resolved", "interaction_id": "..."}
```

### 3.3 前端新增

```
教师端:
  - 侧边栏「互动面板」
    - 举手列表 (带时间、学生姓名)
    - 提问列表 (匿名的显示"匿名同学")
    - 点击「已回答」标记已处理
    - 未读计数 badge

学生端:
  - 底部工具栏新增两个按钮:
    - ✋ 举手 (点击后变为"已举手"，可取消)
    - ❓ 提问 (弹出输入框 + 匿名复选框)
  - 提交后显示 toast 提示
```

---

## 阶段四：AI 助手 + AI 自动出题

### 4.1 新增数据库表

```sql
-- AI 测验
CREATE TABLE IF NOT EXISTS classroom_quizzes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    quiz_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    quiz_data JSON NOT NULL COMMENT '题目数据 {questions: [{question, options, correct, explanation}]}',
    is_ai_generated BOOLEAN DEFAULT TRUE,
    quiz_status ENUM('draft','sent','closed') DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sent_at DATETIME,
    closed_at DATETIME,
    INDEX idx_room (room_id),
    INDEX idx_status (quiz_status),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 学生答题
CREATE TABLE IF NOT EXISTS quiz_answers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    answer_id VARCHAR(64) UNIQUE NOT NULL,
    quiz_id VARCHAR(64) NOT NULL,
    student_id INT NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    answers_data JSON NOT NULL COMMENT '[{question_index, selected, is_correct}]',
    score INT DEFAULT 0,
    total INT DEFAULT 0,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_quiz_student (quiz_id, student_username),
    INDEX idx_quiz (quiz_id),
    FOREIGN KEY (quiz_id) REFERENCES classroom_quizzes(quiz_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.2 AI 集成设计

```
ClassroomAIService (新 Service):
  依赖: ChatService (现有), PPTPageRepository

  generate_quiz(page_id, num_questions=5) -> dict
    1. 从 ppt_pages 获取 text_content
    2. 构造 Prompt:
       "你是出题专家。根据以下教学内容生成{n}道选择题。
        每题4个选项，标注正确答案和解析。
        内容: {text_content}
        以JSON格式返回: {questions: [{question, options: [A,B,C,D], correct: 0, explanation}]}"
    3. 调用 Ollama (通过 ChatService 的 ask_ai)
    4. 解析并校验 JSON
    5. 返回题目数据

  chat_with_context(question, page_id, role) -> str
    1. 获取当前页 text_content 作为上下文
    2. 构造 system prompt:
       老师: "你是教学助手，帮助老师备课和解答教学问题。当前PPT内容: {text}"
       学生: "你是学习助手，帮助学生理解课堂内容。当前PPT内容: {text}"
    3. 调用 Ollama
    4. 返回回答

ClassroomService 新增方法:
  - create_quiz(room_id, page_id, teacher_username) -> quiz 草稿
  - edit_quiz(quiz_id, teacher_username, quiz_data) -> 更新题目
  - send_quiz(quiz_id, room_id, teacher_username) -> WebSocket 广播
  - submit_quiz_answer(quiz_id, student_username, answers) -> 评分
  - get_quiz_results(quiz_id, teacher_username) -> 统计数据
  - close_quiz(quiz_id, teacher_username)
```

### 4.3 API 端点

```
POST   /api/classroom/rooms/{room_id}/quiz/generate     AI生成题目 (teacher)
PUT    /api/classroom/quiz/{quiz_id}                     编辑题目 (teacher)
POST   /api/classroom/quiz/{quiz_id}/send                发送给学生 (teacher)
POST   /api/classroom/quiz/{quiz_id}/answer              学生提交答案
GET    /api/classroom/quiz/{quiz_id}/results             答题统计 (teacher)
PATCH  /api/classroom/quiz/{quiz_id}/close               关闭测验 (teacher)

POST   /api/classroom/ai/chat                            AI助手对话 (teacher/student)
  Body: {room_id, page_id, question}
```

### 4.4 前端

```
教师端:
  - PPT 页面下方新增「AI出题」按钮
  - 点击 → 加载动画 → 显示生成的题目
  - 老师可编辑每道题的题干、选项、答案
  - 确认后点「发送给学生」
  - 答题进行中: 实时显示已提交人数
  - 结束后: 柱状图展示每题选项分布 + 正确率

  - AI助手浮动圆圈 (右下角)
    - 点击展开对话框
    - 输入问题，AI 结合当前页内容回答

学生端:
  - 收到测验: 弹出答题界面
    - 显示题目 + 4个选项
    - 选完所有题后提交
    - 提交后显示正确答案 + 解析

  - AI助手浮动圆圈 (右下角)
    - 点击展开对话框
    - 可以问当前页内容相关问题
    - AI 回答不打断课堂节奏
```

---

## 阶段五：课后回放 + 学生笔记

### 5.1 新增数据库表

```sql
-- 学生笔记
CREATE TABLE IF NOT EXISTS student_notes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    note_id VARCHAR(64) UNIQUE NOT NULL,
    room_id VARCHAR(64) NOT NULL,
    student_id INT NOT NULL,
    student_username VARCHAR(100) NOT NULL,
    page_id VARCHAR(64) NOT NULL,
    annotations_json LONGTEXT COMMENT 'Fabric.js JSON',
    text_note TEXT COMMENT '文字笔记',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE,
    UNIQUE KEY uk_student_page (student_username, room_id, page_id),
    INDEX idx_student_room (student_username, room_id),
    FOREIGN KEY (room_id) REFERENCES classroom_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 5.2 课后回放

```
回放原理:
  - 每次老师 push 时，classroom_pushes 表已经记录了时间戳+快照
  - 回放 = 按时间顺序重放 classroom_pushes 记录
  - 不需要额外的 replay 表 (pushes 本身就是帧序列)

API 端点:
  GET /api/classroom/rooms/{room_id}/replay
    - 返回该房间所有 push 记录 (按 pushed_at 排序)
    - 只允许: 房间的老师 或 该房间已注册的学生
    - 返回: [{push_id, page_number, annotations_json, pushed_at, time_offset_seconds}]

前端回放播放器:
  ReplayPlayer 组件:
    - 进度条 (可拖动)
    - 播放/暂停
    - 上一步/下一步
    - 倍速 (0.5x, 1x, 2x)
    - 当前帧序号 / 总帧数
    - 时间显示
```

### 5.3 学生笔记

```
Repository:
  StudentNoteRepository(BaseRepository)
    TABLE = "student_notes"
    - save_or_update(student_username, room_id, page_id, annotations_json, text_note) -> upsert
    - get_note(student_username, room_id, page_id) -> dict
    - list_notes(student_username, room_id) -> list
    - delete_note(note_id, student_username)

Service:
  - save_note(room_id, student_username, page_id, annotations_json, text_note)
  - get_notes(room_id, student_username) -> list
  - export_notes_pdf(room_id, student_username) -> PDF bytes
    (将每页 PPT 图片 + 老师标注 + 学生笔记合成一张图，汇总成 PDF)

API 端点:
  POST   /api/classroom/rooms/{room_id}/notes          保存笔记 (upsert)
  GET    /api/classroom/rooms/{room_id}/notes          获取笔记列表
  GET    /api/classroom/rooms/{room_id}/notes/{page_id} 获取单页笔记
  POST   /api/classroom/rooms/{room_id}/notes/export    导出 PDF

前端:
  - 学生端页面上方新增「笔记」切换按钮
  - 开启后: 在老师推送的内容上叠加一个可编辑的画布层
  - 画笔工具 (简化版: 笔、橡皮、颜色)
  - 旁边可添加文字笔记
  - 自动保存 (防抖 3 秒)
  - 课后: 在回放页面也能查看笔记
  - 「导出」按钮: 下载 PDF
```

---

## 安全与代码规范 (全阶段通用)

### 网络安全
1. 所有 API 必须 JWT 鉴权，WebSocket 连接时验证 token
2. 文件上传: MIME 验证 + magic bytes 检查 + 大小限制 + 病毒扫描(可选)
3. 存储路径: 上传文件存储在 web root 之外，通过认证 API 访问
4. WebSocket: 消息频率限制 (10条/秒)，连接数限制 (每房间500)
5. SQL 参数化查询 (BaseRepository 已保证)
6. CORS 配置: 限定允许的 origin

### 信息安全
1. 匿名提问: 不在 WebSocket 广播中泄露学生身份
2. 学生笔记: 严格隔离，只有本人可访问
3. 班级权限: 服务层双重校验 (不仅路由层)
4. PPT 内容: 仅房间成员可访问
5. 测验答案: 学生之间不可见

### 代码规范
1. 遵循现有 DDD 分层: Repository → Service → Router
2. 所有输入用 Pydantic schema 校验
3. 统一使用 success_response / error_response
4. 自定义异常: ClassroomNotFoundError, ClassroomAccessDeniedError 等
5. 日志: 关键操作记录 logger.info，异常记录 logger.error
6. 类型标注: 所有函数参数和返回值
7. 文档字符串: 每个公共方法

---

## 完整文件清单

### 后端新增
```
app/domains/classroom/
├── __init__.py
├── repository.py          # 所有 Repository (Room, Enrollment, PPT, Page, Push, Interaction, Quiz, Answer, Note)
├── service.py             # ClassroomService (房间+学生+推送管理)
├── ai_service.py          # ClassroomAIService (AI出题+AI助手)
├── schemas.py             # Pydantic 请求/响应模型
└── exceptions.py          # 领域异常 (RoomNotFound, AccessDenied, PPTProcessError)

app/services/
└── ppt_processor.py       # PPT 处理引擎

app/routers/
└── classroom.py           # 所有 HTTP + WebSocket 端点

app/services/
└── ws_manager.py          # WebSocket 房间连接管理器 (ConnectionManager)
```

### 前端新增
```
web_static/classroom/
├── index.html             # 房间列表入口
├── teacher.html           # 教师端
├── student.html           # 学生端
├── replay.html            # 回放页面
├── css/
│   └── classroom.css
└── js/
    ├── api.js             # API 封装
    ├── ws-client.js       # WebSocket 封装
    ├── teacher-app.js     # 教师端 Vue 应用
    ├── student-app.js     # 学生端 Vue 应用
    ├── annotation-canvas.js  # Fabric.js 画板
    ├── quiz-component.js  # 测验组件
    ├── ai-chat.js         # AI 助手浮窗
    ├── replay-player.js   # 回放播放器
    └── note-manager.js    # 笔记管理
```

### 配置更新
```
app/config/settings.py     # 新增 PPT 相关配置
app/services/container.py  # 注册 ClassroomService, ClassroomAIService
app/main.py                # 注册 classroom router
create_classroom_tables.sql # 建表脚本
```

---

## 实施顺序建议

阶段一 (3-4天): 数据库建表 + 房间 CRUD + 学生加入/离开 + 基础 WebSocket
阶段二 (5-6天): PPT 上传处理 + 画板工具 + 推送机制 + 前端页面
阶段三 (2-3天): 举手/提问 + 教师互动面板
阶段四 (4-5天): AI 出题 + 测验系统 + AI 助手对话
阶段五 (3-4天): 课后回放 + 学生笔记 + 导出 PDF
