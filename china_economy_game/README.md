# 中国经济发展桌游 🇨🇳

一个基于中国改革开放历程的回合制网页桌游（类大富翁）。

## 游戏特色

- 🏭 **产业投资系统**: 建设工厂，发展产业
- 📜 **历史事件卡**: 体验1977-2025年的重大历史节点
- 🚂 **运输网络**: 利用铁路和海运快速移动
- 📈 **同业优势**: 同一产业多家工厂可获得额外收益
- 👥 **多人对战**: 2-4人同时游戏

## 技术架构

```
Backend (Python + FastAPI)
├─ api/            # HTTP 接口（只做参数校验）
├─ application/    # 回合流程、行动顺序、大厅系统
├─ domain/         # 所有游戏规则（核心逻辑）
└─ infrastructure/ # 数据存储（内存存储）

Frontend (HTML + CSS + JavaScript)
├─ css/            # 样式文件
├─ js/             # JavaScript 模块
│   ├─ api.js      # API 调用
│   ├─ game.js     # 游戏界面
│   └─ app.js      # 主应用
└─ index.html      # 主页面
```

## 快速开始

### 1. 安装依赖

```bash
cd china_economy_game
pip install -r requirements.txt
```

### 2. 启动服务器

```bash
python run.py
```

### 3. 访问游戏

打开浏览器访问: http://localhost:8000

## 游戏规则

### 基础设定
- 游戏类型：回合制、顺时针、环形路径桌游
- 玩家数：2-4人
- 每位玩家每回合有 **2点行动力**

### 回合流程
1. 回合开始
2. 翻开并执行事件卡
3. 从起始玩家开始，顺时针执行玩家回合
4. 所有玩家完成后，回合结束
5. 起始玩家标记顺移一位

### 玩家行动（每次消耗1行动力）
- **移动**: 顺时针移动1格
- **建厂**: 在产业格建立工厂
- **运输**: 使用铁路/海运快速移动

### 产业系统
- **第一阶段**: 食品、家具、纺织、家电、重工
- **第二阶段**: 解锁石化、医药、旅游、金融、高新技术

### 同业优势
玩家在同一产业拥有多家工厂时，每家工厂额外获得同业优势收入。

## API 端点

### 大厅
- `GET /lobby/rooms` - 获取房间列表
- `POST /lobby/rooms` - 创建房间
- `POST /lobby/rooms/{room_id}/join` - 加入房间
- `POST /lobby/rooms/{room_id}/start` - 开始游戏

### 游戏
- `GET /game/{room_id}/state` - 获取游戏状态
- `POST /game/{room_id}/turn/start` - 开始新回合
- `POST /game/{room_id}/turn/draw-event` - 抽取事件卡
- `POST /game/{room_id}/action/move` - 移动
- `POST /game/{room_id}/action/build` - 建厂
- `POST /game/{room_id}/action/transport` - 使用运输

完整API文档: http://localhost:8000/docs

## 项目结构

```
china_economy_game/
├── backend/
│   ├── api/
│   │   ├── __init__.py
│   │   ├── schemas.py          # 请求/响应模型
│   │   ├── lobby_routes.py     # 大厅路由
│   │   └── game_routes.py      # 游戏路由
│   ├── application/
│   │   ├── __init__.py
│   │   ├── lobby_service.py    # 大厅服务
│   │   └── game_service.py     # 游戏服务
│   ├── domain/
│   │   ├── __init__.py
│   │   ├── enums.py            # 枚举定义
│   │   ├── player.py           # 玩家
│   │   ├── board.py            # 棋盘
│   │   ├── industry.py         # 产业卡
│   │   ├── event_card.py       # 事件卡
│   │   ├── calculators.py      # 计算器
│   │   ├── stage_manager.py    # 阶段管理
│   │   ├── turn_manager.py     # 回合管理
│   │   └── game_state.py       # 游戏状态
│   ├── infrastructure/
│   │   ├── __init__.py
│   │   └── memory_store.py     # 内存存储
│   ├── __init__.py
│   └── main.py                 # FastAPI 入口
├── frontend/
│   ├── css/
│   │   └── style.css
│   ├── js/
│   │   ├── api.js
│   │   ├── game.js
│   │   └── app.js
│   └── index.html
├── requirements.txt
├── run.py
└── README.md
```

## 设计原则

1. **规则集中**: 所有游戏规则在 Domain 层实现
2. **前端轻量**: 前端只负责显示和交互，不计算规则
3. **分层清晰**: API → Application → Domain → Infrastructure
4. **大厅独立**: 大厅系统不参与游戏规则

## License

MIT
