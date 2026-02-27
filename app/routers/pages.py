"""
页面路由 - PageRouter
======================
处理所有 HTML 静态页面的路由：
- GET  /                     - 主页（登录 + 应用导航）
- GET  /chat                 - AI 学习对话
- GET  /student-report       - 学生分析报告
- GET  /attendance           - 考勤系统
- GET  /admin                - 管理员面板
- GET  /analytics            - 分析仪表板
- GET  /notice_generator.html - 通知生成器
- GET  /mistake-book         - 学生AI智能错题本
- GET  /mistake-book/teacher - 教师错题分析面板
- GET  /games                - 游戏中心
- GET  /games/math_word_cards - 数学词卡
- GET  /china_economy_game   - 经济发展游戏
- GET  /game_upload          - 游戏上传
- GET  /my_games             - 我的游戏
- GET  /play/{token}          - 分享游戏（无需登入）
- GET  /uploaded_games/{uuid} - 用户上传游戏
"""

import logging
import os
import re
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse, HTMLResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["页面"])

# 静态文件根目录 (使用绝对路径，避免依赖工作目录)
STATIC_DIR = str(Path(__file__).resolve().parent.parent.parent / "web_static")


def _serve_page(filename: str):
    """通用页面服务函数（禁止浏览器缓存 HTML，确保每次获取最新版本）"""
    file_path = os.path.join(STATIC_DIR, filename)
    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )
    return HTMLResponse(
        content=f"<h1>页面未找到: {filename}</h1>",
        status_code=404,
    )


# ====================================================================== #
#  主要页面                                                               #
# ====================================================================== #

@router.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """浏览器自动请求的 favicon"""
    from fastapi.responses import Response
    # 返回空的 ICO 避免 404
    return Response(content=b"", media_type="image/x-icon")


@router.get("/")
async def index():
    """主页（应用导航）"""
    return _serve_page("index.html")


@router.get("/login")
async def login_page():
    """登入页面"""
    return _serve_page("login.html")


@router.get("/chat")
async def chat_page():
    """AI 學習對話（獨立頁面）"""
    return _serve_page("chat.html")


@router.get("/student-report")
async def student_report():
    """学生分析报告页"""
    return _serve_page("student_report.html")


@router.get("/attendance")
async def attendance_page():
    """考勤系统页"""
    return _serve_page("attendance.html")


@router.get("/admin")
async def admin_dashboard():
    """管理员面板"""
    return _serve_page("admin_dashboard.html")


@router.get("/analytics")
async def analytics_dashboard():
    """分析仪表板"""
    return _serve_page("analytics_dashboard.html")


@router.get("/notice_generator.html")
async def notice_generator():
    """通知生成器"""
    return _serve_page("notice_generator.html")


# ====================================================================== #
#  錯題本頁面                                                               #
# ====================================================================== #

@router.get("/mistake-book")
async def mistake_book():
    """學生 AI 智能錯題本"""
    return _serve_page("mistake_book.html")


@router.get("/mistake-book/teacher")
async def mistake_book_teacher():
    """教師錯題分析面板"""
    return _serve_page("mistake_book_teacher.html")


# ====================================================================== #
#  AI 學習中心頁面                                                          #
# ====================================================================== #

@router.get("/ai-learning-center")
async def ai_learning_center():
    """AI 教師學習中心"""
    return _serve_page("ai_learning_center.html")


@router.get("/school-learning-center")
async def school_learning_center():
    """學校學習中心（按科目和年級組織）"""
    return _serve_page("school_learning_center.html")


# ====================================================================== #
#  课堂教学页面                                                             #
# ====================================================================== #

@router.get("/classroom")
async def classroom_list():
    """课堂房间列表"""
    return _serve_page("classroom_list.html")


@router.get("/classroom/teacher/{room_id}")
async def classroom_teacher(room_id: str):
    """教师课堂页面 (含 PPT 展示 + 画板 + 推送)"""
    return _serve_page("classroom_teacher.html")


@router.get("/classroom/student/{room_id}")
async def classroom_student(room_id: str):
    """学生课堂页面 (接收推送 + AI 助手)"""
    return _serve_page("classroom_student.html")


# ====================================================================== #
#  游戏相关页面                                                            #
# ====================================================================== #

@router.get("/games")
async def game_center():
    """游戏中心"""
    return _serve_page("game_center.html")


@router.get("/games/math_word_cards")
async def math_word_cards():
    """数学词卡游戏"""
    return _serve_page("math_word_cards.html")


@router.get("/china_economy_game")
async def china_economy_game():
    """中国经济发展游戏"""
    return _serve_page("china_economy_game.html")


@router.get("/game_upload")
async def game_upload():
    """游戏上传页"""
    return _serve_page("game_upload.html")


@router.get("/my_games")
async def my_games():
    """我的游戏"""
    return _serve_page("my_games.html")


@router.get("/play/{token}")
async def play_shared_game(token: str):
    """通过分享 token 访问游戏（无需登入）"""
    return _serve_page("game_play_shared.html")


@router.get("/uploaded_games/{game_uuid}")
async def serve_uploaded_game(game_uuid: str, raw: str = None):
    """提供用户上传的游戏（沙盒运行），自动注入返回游戏中心按钮。raw=1 时返回原始内容（编辑用）"""
    # 安全检查：防止路径遍历
    safe_uuid = game_uuid.replace("/", "").replace("\\", "").replace("..", "")
    file_path = os.path.join(STATIC_DIR, "uploaded_games", f"{safe_uuid}.html")

    if os.path.exists(file_path):
        # raw 模式：返回原始文件（编辑器加载用）
        if raw:
            return FileResponse(file_path, media_type="text/html")

        with open(file_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # 注入浮动返回按钮（固定在左上角）
        back_button_html = """
<!-- 返回游戏中心按钮（自动注入） -->
<div id="__gc_back_btn__" style="
    position:fixed; top:12px; left:12px; z-index:999999;
    display:flex; align-items:center; gap:6px;
    padding:8px 14px; border-radius:999px;
    background:rgba(0,0,0,0.55); backdrop-filter:blur(12px);
    border:1px solid rgba(255,255,255,0.18);
    color:#fff; font-size:13px; font-weight:600;
    cursor:pointer; user-select:none;
    font-family:system-ui,-apple-system,sans-serif;
    box-shadow:0 4px 16px rgba(0,0,0,0.3);
    transition:opacity .2s,transform .2s;
" onclick="window.location.href='/games'"
   onmouseenter="this.style.opacity='1';this.style.transform='scale(1.05)'"
   onmouseleave="this.style.opacity='0.85';this.style.transform='scale(1)'">
    <span style="font-size:16px">←</span>
    <span>返回遊戲中心</span>
</div>
"""
        # 在 <body> 标签后注入
        if "<body" in html_content:
            # 找到 <body...> 的闭合 >
            html_content = re.sub(
                r"(<body[^>]*>)",
                r"\1" + back_button_html,
                html_content,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            # 没有 body 标签则直接在开头插入
            html_content = back_button_html + html_content

        return HTMLResponse(content=html_content, media_type="text/html")

    logger.warning(f"上传游戏文件不存在: {file_path}")
    return HTMLResponse(content="<h1>游戏未找到</h1>", status_code=404)
