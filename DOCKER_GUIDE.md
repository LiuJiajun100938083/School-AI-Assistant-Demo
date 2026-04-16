# Docker 运维指南 - 策问 QUAERO

## 架构概览

```
Mac Studio (macOS, 512GB RAM)
├── Docker 容器: demo-ai-buddy (port 8002)
│   └── FastAPI + Uvicorn + ChromaDB + Embeddings
├── 原生运行: MySQL (port 3306)
├── 原生运行: Ollama (port 11434, Metal GPU)
└── 手动启动: Ngrok (外网隧道)
```

---

## 日常操作

### 更新代码（最常用）

```bash
cd ~/FastAPIProject1_test
git pull
docker compose restart
```

> `restart` 适用于 Python / HTML / JS / CSS 代码变更。
> 不需要重新构建镜像。

### 更新代码 + 新增了 Python 依赖

如果修改了 `requirements-docker.txt`（新增/删除 pip 包）：

```bash
cd ~/FastAPIProject1_test
git pull
docker compose up -d --build
```

> `--build` 会重新构建镜像，安装新依赖。耗时较长。

### 修改环境变量

编辑 `.env.docker` 后：

```bash
docker compose up -d
```

> 注意：`docker compose restart` 不会重新读取 `.env.docker`，必须用 `up -d`。

---

## 维护模式

### 开启维护（用户看到"系统维护中"页面）

```bash
nano .env.docker
# 改为 MAINTENANCE_MODE=true
docker compose up -d
```

### 关闭维护

```bash
nano .env.docker
# 改为 MAINTENANCE_MODE=false
docker compose up -d
```

---

## 查看日志

```bash
# 实时日志（Ctrl+C 退出）
docker compose logs -f app

# 最近 100 行
docker compose logs --tail=100 app

# 只看错误
docker compose logs -f app 2>&1 | grep ERROR
```

---

## 启动 / 停止 / 重启

```bash
# 启动（如果容器已停止）
docker compose up -d

# 停止
docker compose down

# 重启
docker compose restart

# 强制重建并启动
docker compose up -d --build
```

---

## 监控

```bash
# 查看容器状态
docker ps

# 实时资源监控（CPU / 内存）
docker stats demo-ai-buddy

# 健康检查
curl http://localhost:8002/health
```

---

## Ngrok（外网访问）

```bash
ngrok http 8002 --domain=你的域名.ngrok-free.app
```

> Ngrok 不在 Docker 里，每次需要手动启动。

---

## 故障排查

### 容器启动失败

```bash
# 查看完整日志
docker compose logs app

# 查看容器状态
docker ps -a
```

### 数据库连不上

```bash
# 确认 MySQL 在运行
brew services list | grep mysql

# 如果没运行，启动它
brew services start mysql
```

### Ollama 连不上

```bash
# 确认 Ollama 在运行
curl http://localhost:11434/api/tags

# 如果没运行，启动它
ollama serve
```

### 容器内存超限被杀

```bash
# 查看容器是否被 OOM 杀掉
docker inspect demo-ai-buddy | grep OOMKilled

# 如果是，可以增大内存限制（编辑 docker-compose.yml）
```

### 端口被占用

```bash
# 查看 8002 端口占用
lsof -i :8002

# 如果旧进程还在，杀掉它
kill -9 <PID>
```

---

## 完整更新流程示例

```bash
# 1. 开启维护模式
nano .env.docker    # MAINTENANCE_MODE=true
docker compose up -d

# 2. 拉取新代码
git pull

# 3. 重启容器加载新代码
docker compose restart

# 4. 确认日志无报错
docker compose logs --tail=50 app

# 5. 测试健康检查
curl http://localhost:8002/health

# 6. 关闭维护模式
nano .env.docker    # MAINTENANCE_MODE=false
docker compose up -d
```

---

## Mac Studio 开机后启动清单

Docker Desktop 会随系统自动启动，容器设置了 `restart: unless-stopped` 也会自动启动。
你只需要确认：

1. **MySQL** — `brew services list` 查看是否在运行
2. **Ollama** — 打开 Ollama 应用或 `ollama serve`
3. **Ngrok**（如需要）— `ngrok http 8002 --domain=你的域名.ngrok-free.app`

---

## 重要文件位置

| 文件 | 用途 |
|------|------|
| `.env.docker` | Docker 环境变量（密码、开关等） |
| `docker-compose.yml` | 容器配置（端口、内存、挂载） |
| `Dockerfile` | 镜像构建配置 |
| `requirements-docker.txt` | Python 依赖（Docker 专用） |
| `web_static/maintenance.html` | 维护页面 |
