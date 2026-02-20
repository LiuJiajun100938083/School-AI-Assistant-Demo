"""
中国经济发展桌游 - FastAPI 主入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from .api import lobby_router, game_router

# 创建应用
app = FastAPI(
    title="中国经济发展桌游",
    description="""
    一个基于中国改革开放历程的回合制桌游。

    ## 游戏特色
    - 体验中国经济发展的关键历史节点
    - 产业投资与同业优势策略
    - 事件卡系统模拟历史重大事件

    ## API 分类
    - **大厅**: 房间管理、玩家匹配
    - **游戏**: 回合流程、玩家行动

    ## 技术架构
    - 后端: Python + FastAPI
    - 前端: HTML + CSS + JavaScript
    - 架构: Domain-Driven Design
    """,
    version="1.0.0"
)

# 配置 CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 开发环境允许所有来源
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 注册路由
app.include_router(lobby_router)
app.include_router(game_router)

# 静态文件服务
frontend_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")


@app.get("/")
async def root():
    """根路径 - 返回前端页面"""
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": "欢迎来到中国经济发展桌游！",
        "docs": "/docs",
        "redoc": "/redoc"
    }


@app.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "healthy", "message": "服务运行正常"}


@app.get("/api/info")
async def api_info():
    """API 信息"""
    return {
        "name": "中国经济发展桌游 API",
        "version": "1.0.0",
        "endpoints": {
            "lobby": {
                "get_rooms": "GET /lobby/rooms",
                "create_room": "POST /lobby/rooms",
                "join_room": "POST /lobby/rooms/{room_id}/join",
                "leave_room": "POST /lobby/rooms/{room_id}/leave",
                "start_game": "POST /lobby/rooms/{room_id}/start"
            },
            "game": {
                "get_state": "GET /game/{room_id}/state",
                "get_board": "GET /game/{room_id}/board",
                "start_round": "POST /game/{room_id}/turn/start",
                "draw_event": "POST /game/{room_id}/turn/draw-event",
                "move": "POST /game/{room_id}/action/move",
                "build": "POST /game/{room_id}/action/build",
                "transport": "POST /game/{room_id}/action/transport",
                "end_turn": "POST /game/{room_id}/action/end-turn"
            }
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
