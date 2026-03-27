# 部署指南 — 校园 AI 助手

本文档覆盖三种部署方式：**本地开发**、**本地服务器**、**云端服务器**。

---

## 目录

1. [系统架构总览](#1-系统架构总览)
2. [硬件要求](#2-硬件要求)
3. [方式一：本地开发环境](#3-方式一本地开发环境)
4. [方式二：本地服务器部署](#4-方式二本地服务器部署)
5. [方式三：云端服务器部署](#5-方式三云端服务器部署)
6. [环境变量参考](#6-环境变量参考)
7. [数据库初始化](#7-数据库初始化)
8. [常见问题](#8-常见问题)

---

## 1. 系统架构总览

```
用户浏览器
    │
    ▼
┌─────────────┐
│  Nginx/反向代理  │  ← 生产环境需要，本地开发可跳过
└──────┬──────┘
       ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  FastAPI     │────▶│  MySQL 8.0  │     │  Ollama     │
│  (端口 8002) │     │  (端口 3306) │     │  (端口 11434)│
└──────┬──────┘     └─────────────┘     └─────────────┘
       │
       ├──▶ Qwen API（云端 LLM，可选）
       ├──▶ ChromaDB（本地向量数据库，./vector_db/）
       └──▶ LibreOffice（文档转换，可选）
```

**核心依赖（必须）：**
- Python 3.9+
- MySQL 8.0+
- 至少一个 LLM 后端（Ollama 本地 或 Qwen API 云端）

**增强依赖（推荐）：**
- Ollama（本地 AI，需要 GPU）
- LibreOffice（DOCX/PPTX 转 PDF 预览）
- Nginx（生产环境反向代理）

---

## 2. 硬件要求

### 最低配置（仅用云端 API）
| 项目 | 要求 |
|------|------|
| CPU | 2 核 |
| 内存 | 4 GB |
| 硬盘 | 20 GB |
| GPU | 不需要 |
| 网络 | 需要访问 Qwen API |

### 推荐配置（本地 AI + 云端 API）
| 项目 | 要求 |
|------|------|
| CPU | 8 核+ |
| 内存 | 16 GB+ |
| 硬盘 | 50 GB+ |
| GPU | NVIDIA 8GB+ VRAM（RTX 3060 / RTX 4060 以上） |
| 网络 | 校园内网即可 |

---

## 3. 方式一：本地开发环境

> 适合在自己电脑上跑，开发调试用。

### 步骤 1：安装基础软件

**Windows：**
```bash
# Python 3.10+
winget install Python.Python.3.10

# MySQL 8.0
winget install Oracle.MySQL

# Git
winget install Git.Git

# LibreOffice（可选，用于文档预览）
winget install TheDocumentFoundation.LibreOffice
```

**macOS：**
```bash
brew install python@3.10 mysql git
brew install --cask libreoffice  # 可选
```

**Linux (Ubuntu)：**
```bash
sudo apt update
sudo apt install python3.10 python3.10-venv python3-pip mysql-server git
sudo apt install libreoffice-core  # 可选
```

### 步骤 2：安装 Ollama（可选，本地 AI）

```bash
# Windows / macOS: 从 https://ollama.com 下载安装
# Linux:
curl -fsSL https://ollama.com/install.sh | sh

# 拉取模型（需要 GPU）
ollama pull qwen3.5:35b      # 主模型（约 20GB）
ollama pull qwen3.5:4b       # 内容审核（约 2.5GB）
```

> 如果没有 GPU，跳过 Ollama，改用云端 API（见步骤 5）。

### 步骤 3：初始化数据库

```bash
# 登录 MySQL
mysql -u root -p

# 创建数据库和用户
CREATE DATABASE school_ai_demo CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'ai_demo'@'localhost' IDENTIFIED BY 'DemoPass123!';
GRANT ALL PRIVILEGES ON school_ai_demo.* TO 'ai_demo'@'localhost';
FLUSH PRIVILEGES;
EXIT;

# 导入完整表结构（100 张表）
mysql -u ai_demo -p school_ai_demo < database_migration/full_schema.sql

# 导入初始数据（科目、管理员账号等）
mysql -u ai_demo -p school_ai_demo < init_local_db.sql
```

### 步骤 4：安装 Python 依赖

```bash
cd School-AI-Assistant-Demo

# 建议使用虚拟环境
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
pip install fpdf2  # DOCX 转 PDF 降级方案
```

### 步骤 5：配置环境变量

创建 `.env` 文件（项目根目录）：

```bash
# ===== 数据库 =====
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=ai_demo
DB_PASSWORD=DemoPass123!
DB_NAME=school_ai_demo

# ===== LLM 配置 =====
# 方式 A: 仅用云端 API（不需要 GPU）
LLM_USE_API=true
LLM_API_KEY=你的阿里云百炼API密钥
LLM_API_MODEL=qwen-plus
LLM_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# 方式 B: 仅用本地 Ollama（需要 GPU）
# LLM_USE_API=false
# LLM_LOCAL_MODEL=qwen3.5:35b
# OLLAMA_BASE_URL=http://localhost:11434

# ===== 安全 =====
# 生产环境必须设置！至少 32 个字符的随机字符串
JWT_SECRET=your-random-secret-string-at-least-32-chars-long

# ===== 服务器 =====
SERVER_PORT=8002
ENVIRONMENT=development
```

### 步骤 6：启动

```bash
# 确保 MySQL 已启动
# 确保 Ollama 已启动（如果使用本地模型）

python -m app.main
```

访问 http://localhost:8002 即可。

---

## 4. 方式二：本地服务器部署

> 适合部署到学校机房的一台服务器上，校园内网访问。

### 与本地开发的区别

| 项目 | 开发环境 | 服务器部署 |
|------|---------|-----------|
| 环境 | ENVIRONMENT=development | ENVIRONMENT=production |
| 进程管理 | 手动启动 | systemd 守护进程 |
| 反向代理 | 不需要 | Nginx |
| HTTPS | 不需要 | 推荐（自签证书即可） |
| JWT_SECRET | 临时密钥 | **必须设置** |

### 步骤 1-5：同上

### 步骤 6：创建 systemd 服务（Linux）

```bash
sudo nano /etc/systemd/system/school-ai.service
```

写入：
```ini
[Unit]
Description=School AI Assistant
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/school-ai
ExecStart=/opt/school-ai/venv/bin/python -m app.main
Restart=always
RestartSec=5
Environment=ENVIRONMENT=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable school-ai
sudo systemctl start school-ai
sudo systemctl status school-ai  # 检查状态
```

### 步骤 7：配置 Nginx 反向代理

```bash
sudo nano /etc/nginx/sites-available/school-ai
```

```nginx
server {
    listen 80;
    server_name your-school-server.local;  # 改为你的域名或 IP

    client_max_body_size 200M;  # 允许大文件上传

    location / {
        proxy_pass http://127.0.0.1:8002;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

        # SSE 流式响应支持
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }

    # WebSocket 支持（课堂互动需要）
    location /ws {
        proxy_pass http://127.0.0.1:8002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/school-ai /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 步骤 8：Windows 服务器

如果是 Windows Server，用 NSSM 注册为服务：
```bash
# 下载 NSSM: https://nssm.cc/download
nssm install SchoolAI "C:\path\to\venv\Scripts\python.exe" "-m" "app.main"
nssm set SchoolAI AppDirectory "C:\path\to\School-AI-Assistant-Demo"
nssm start SchoolAI
```

---

## 5. 方式三：云端服务器部署

> 适合部署到阿里云/腾讯云/AWS 等。

### 推荐云服务商配置

**仅用云端 API（最省钱）：**
- 阿里云 ECS 2核4G → 约 ¥100/月
- 腾讯云轻量 2核4G → 约 ¥60/月
- 数据库用云 MySQL（RDS）或自建

**本地 AI + 云端 API：**
- 带 GPU 的实例（如阿里云 GN6i）→ 约 ¥2000+/月
- 或使用竞价实例省钱

### 步骤 1：购买服务器

选择 Ubuntu 22.04 LTS，登录后：
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install python3.10 python3.10-venv python3-pip mysql-server nginx git
```

### 步骤 2：部署代码

```bash
cd /opt
sudo git clone https://github.com/LiuJiajun100938083/School-AI-Assistant-Demo.git school-ai
sudo chown -R www-data:www-data /opt/school-ai
cd /opt/school-ai

python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
pip install fpdf2
```

### 步骤 3：配置数据库

```bash
# 如果用云 MySQL（RDS），改 .env 中的 DB_HOST
# 如果自建，同方式一步骤 3

mysql -u root -p < database_migration/full_schema.sql
mysql -u root -p < init_local_db.sql
```

### 步骤 4：配置 .env

```bash
nano /opt/school-ai/.env
```

```bash
# ===== 数据库 =====
DB_HOST=你的RDS地址或127.0.0.1
DB_PORT=3306
DB_USER=ai_demo
DB_PASSWORD=强密码！不要用默认的
DB_NAME=school_ai_demo

# ===== LLM =====
LLM_USE_API=true
LLM_API_KEY=你的API密钥
LLM_API_MODEL=qwen-plus
LLM_API_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# ===== 安全（生产环境必须修改！）=====
JWT_SECRET=用 openssl rand -hex 32 生成
ENVIRONMENT=production

# ===== 服务器 =====
SERVER_PORT=8002
```

### 步骤 5：systemd + Nginx

同方式二的步骤 6 和步骤 7。

### 步骤 6：HTTPS（推荐）

```bash
# 用 Let's Encrypt 免费证书
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 步骤 7：防火墙

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

---

## 6. 环境变量参考

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DB_HOST` | 127.0.0.1 | MySQL 地址 |
| `DB_PORT` | 3306 | MySQL 端口 |
| `DB_USER` | ai_demo | MySQL 用户名 |
| `DB_PASSWORD` | DemoPass123! | MySQL 密码（**生产必改**） |
| `DB_NAME` | school_ai_demo | 数据库名 |
| `JWT_SECRET` | 临时生成 | JWT 签名密钥（**生产必设**，>=32字符） |
| `SERVER_PORT` | 8002 | 应用端口 |
| `ENVIRONMENT` | development | 环境：development / production |
| `LLM_USE_API` | false | true=用云端API, false=用本地Ollama |
| `LLM_API_KEY` | - | 阿里云百炼 API Key |
| `LLM_API_MODEL` | qwen-plus | 云端模型名 |
| `LLM_API_BASE_URL` | dashscope... | API 端点 URL |
| `LLM_LOCAL_MODEL` | qwen3.5:35b | 本地 Ollama 模型 |
| `OLLAMA_BASE_URL` | http://localhost:11434 | Ollama 地址 |
| `LLM_TEMPERATURE` | 0.6 | AI 温度参数 |
| `LLM_MAX_TOKENS` | 16384 | 最大输出 token |
| `CONTENT_MODERATION_ENABLED` | true | 是否开启内容审核 |

---

## 7. 数据库初始化

```bash
# 一次性创建所有 100 张表
mysql -u ai_demo -p school_ai_demo < database_migration/full_schema.sql

# 导入初始数据（管理员账号等）
mysql -u ai_demo -p school_ai_demo < init_local_db.sql
```

表结构说明见 `database_migration/TABLE_REFERENCE.md`。

---

## 8. 常见问题

### Q: 没有 GPU 能跑吗？
可以。设置 `LLM_USE_API=true`，用阿里云 Qwen API。所有 AI 功能都走云端，不需要本地 GPU。

### Q: 第一次启动很慢？
正常。首次启动会下载 Embedding 模型（约 500MB），后续启动会快很多。

### Q: 数据库报错 "Table doesn't exist"？
执行 `mysql -u ai_demo -p school_ai_demo < database_migration/full_schema.sql`

### Q: 文档预览空白？
检查 LibreOffice 是否安装。没安装的话 DOCX 会用纯文本降级方案。

### Q: 多人同时使用会卡吗？
- 云端 API 模式：支持较高并发（取决于 API 限额）
- 本地 Ollama：默认限制 4 个并发 AI 请求，排队处理

### Q: 怎么备份？
```bash
# 备份数据库
mysqldump -u ai_demo -p school_ai_demo > backup.sql

# 备份上传文件
tar -czf uploads_backup.tar.gz uploads/

# 备份向量数据库
tar -czf vector_db_backup.tar.gz vector_db/
```

### Q: 怎么更新代码？
```bash
cd /opt/school-ai
git pull origin main
pip install -r requirements.txt  # 如果有新依赖
sudo systemctl restart school-ai
```
