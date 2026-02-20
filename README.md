# PKMS AI Learning Buddy - AI 智能学习伙伴

基于 FastAPI 的综合教育平台，集成 AI 大语言模型能力，为师生提供个性化学习体验。

---

## 技术栈

| 层级 | 技术 |
|------|------|
| **后端框架** | FastAPI + Uvicorn |
| **数据库** | MySQL + 连接池 (DBUtils) |
| **认证** | JWT (PyJWT) + bcrypt |
| **AI/LLM** | LangChain + Ollama (Qwen) / DeepSeek API |
| **RAG** | ChromaDB + sentence-transformers |
| **文档处理** | python-docx, PyPDF2, openpyxl, python-pptx |
| **前端** | HTML/CSS/JS (Jinja2 模板) |

## 项目结构

```
├── app/                          # 主应用 (DDD 架构)
│   ├── main.py                   # 入口 - create_app() 工厂函数
│   ├── config/settings.py        # 统一配置管理
│   ├── core/                     # 核心模块 (认证、中间件、日志)
│   ├── domains/                  # 业务领域模型
│   ├── infrastructure/           # 数据库、外部集成
│   ├── routers/                  # API 路由 (19 个核心模块)
│   └── services/                 # 业务逻辑层
├── llm/                          # LLM 模块
│   ├── providers/                # 模型提供商 (Ollama, DeepSeek)
│   ├── rag/                      # RAG 检索增强生成
│   ├── services/                 # AI 问答服务
│   └── prompts/                  # 提示词管理
├── forum_system/                 # 论坛子系统
│   ├── api/                      # 论坛 API
│   ├── service/                  # 论坛业务逻辑
│   └── dal/                      # 数据访问层
├── web_static/                   # 前端静态资源
├── Knowledge_base/               # 知识库文档
└── requirements.txt              # Python 依赖
```

## 功能模块

### 核心功能
- **用户认证** — 注册、登录、JWT Token、角色权限 (admin/teacher/student)
- **课堂管理** — 创建班级、学生加入、教师管理
- **AI 智能问答** — 基于 RAG 的多学科 AI 对话，支持流式输出
- **AI 学习中心** — 个性化 AI 学习助手

### 学习功能
- **学习任务** — 教师布置、学生完成、进度跟踪
- **错题本** — 错题记录、图片上传、AI 分析
- **学习模式** — 多种互动学习方式
- **中文学习** — 中文专项学习与游戏
- **中国经济游戏** — 历史经济模拟教育游戏

### 管理功能
- **考勤系统** — 签到、统计、导出
- **学习分析** — 数据统计、AI 学情报告
- **学科管理** — 多学科知识库配置
- **通知系统** — AI 生成课堂通知
- **论坛系统** — 师生社区讨论

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置环境变量

创建 `.env` 文件：

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=pkms
JWT_SECRET=your_jwt_secret
OLLAMA_BASE_URL=http://localhost:11434
```

### 3. 初始化数据库

```bash
mysql -u root -p < create_tables.sql
mysql -u root -p < create_classroom_tables.sql
mysql -u root -p < create_classroom_tables_phase2.sql
mysql -u root -p < create_mistake_book_tables.sql
```

### 4. 启动服务

```bash
python -m app.main
```

服务默认运行在 `http://localhost:8000`

## API 文档

启动后访问：
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Git 工作流

### 本地开发提交

```bash
git add .
git commit -m "描述修改内容"
git push
```

### 另一台电脑同步

```bash
git pull
```

## 更新日志

> **重要：每次重大修改后请更新 [CHANGELOG.md](./CHANGELOG.md)**

详细更新记录请查看 [CHANGELOG.md](./CHANGELOG.md)

## License

Private Project - All Rights Reserved
