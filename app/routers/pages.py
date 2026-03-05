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
#  課室日誌頁面                                                             #
# ====================================================================== #

@router.get("/class-diary/rate/{class_code}")
async def class_diary_rate(class_code: str):
    """教師掃碼評級表單（移動端）"""
    return _serve_page("class_diary_rate.html")


@router.get("/class-diary/review")
async def class_diary_review():
    """課室日誌 Review 頁面"""
    return _serve_page("class_diary_review.html")


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


@router.get("/trade-game")
async def trade_game():
    """全球貿易大亨"""
    return _serve_page("trade_game.html")


@router.get("/swift-code-game")
async def swift_code_game():
    """SwiftUI 代碼學堂"""
    return _serve_page("swift_code_game.html")


@router.get("/assignment")
async def assignment_page():
    """作業管理頁"""
    return _serve_page("assignment.html")


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
    """提供用户上传的游戏（沙盒运行），自动注入返回按钮 + lucide 图标 polyfill。raw=1 返回原始内容（编辑用）"""
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
            html_content = re.sub(
                r"(<body[^>]*>)",
                r"\1" + back_button_html,
                html_content,
                count=1,
                flags=re.IGNORECASE,
            )
        else:
            html_content = back_button_html + html_content

        # 注入 lucide-react 图标 polyfill（修复缺失图标导致的 ReferenceError）
        html_content = _inject_lucide_polyfills(html_content)

        return HTMLResponse(
            content=html_content,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
            },
        )

    logger.warning(f"上传游戏文件不存在: {file_path}")
    return HTMLResponse(content="<h1>游戏未找到</h1>", status_code=404)


# lucide-react icon → emoji 映射（在 serve 时动态注入，修复已上传游戏的缺失图标）
_LUCIDE_EMOJI_MAP = {
    "AlertCircle": "⚠️", "AlertTriangle": "⚠️", "AlertOctagon": "🛑",
    "CheckCircle": "✅", "CheckCircle2": "✅", "XCircle": "❌",
    "HelpCircle": "❓", "Info": "ℹ️", "Ban": "🚫",
    "ShieldAlert": "🛡️", "ShieldCheck": "🛡️", "ShieldX": "🛡️",
    "Check": "✓", "X": "✕", "Plus": "+", "Minus": "−",
    "Play": "▶️", "Pause": "⏸️", "Square": "⏹️",
    "RefreshCw": "🔄", "RefreshCcw": "🔄", "RotateCw": "🔄",
    "Undo": "↩️", "Redo": "↪️", "Repeat": "🔁",
    "Download": "📥", "Upload": "📤", "Share": "📤", "Share2": "📤",
    "Copy": "📋", "Clipboard": "📋", "Save": "💾",
    "Edit": "✏️", "Edit2": "✏️", "Edit3": "✏️",
    "Trash": "🗑️", "Trash2": "🗑️",
    "Send": "📨", "Mail": "📧", "ExternalLink": "🔗", "Link": "🔗",
    "ArrowRight": "→", "ArrowLeft": "←", "ArrowUp": "↑", "ArrowDown": "↓",
    "ArrowUpRight": "↗️", "ArrowDownRight": "↘️",
    "ChevronRight": "›", "ChevronLeft": "‹",
    "ChevronDown": "▼", "ChevronUp": "▲",
    "ChevronsRight": "»", "ChevronsLeft": "«",
    "Menu": "☰", "MoreHorizontal": "⋯", "MoreVertical": "⋮",
    "Maximize": "⬜", "Minimize": "▬", "Filter": "🔽",
    "SlidersHorizontal": "⚙️", "Settings": "⚙️",
    "Search": "🔍", "ZoomIn": "🔍", "ZoomOut": "🔍",
    "Eye": "👁️", "EyeOff": "🙈",
    "Home": "🏠", "Building": "🏢", "School": "🏫", "Landmark": "🏛️",
    "Briefcase": "💼", "Wallet": "👛",
    "BookOpen": "📖", "Book": "📕", "BookMarked": "📑",
    "FileText": "📄", "File": "📁", "Folder": "📂",
    "Image": "🖼️", "Camera": "📷", "Video": "🎥",
    "Music": "🎵", "Mic": "🎤", "Volume2": "🔊", "VolumeX": "🔇",
    "Phone": "📱", "Monitor": "🖥️", "Laptop": "💻",
    "Clock": "🕐", "Timer": "⏱️", "Hourglass": "⏳",
    "Calendar": "📅", "Bell": "🔔", "BellOff": "🔕",
    "Lock": "🔒", "Unlock": "🔓", "Key": "🔑",
    "Shield": "🛡️", "Flag": "🚩", "Bookmark": "🔖",
    "Tag": "🏷️", "Gift": "🎁", "Package": "📦",
    "ShoppingCart": "🛒", "CreditCard": "💳", "Banknote": "💵",
    "Gem": "💎", "Crown": "👑",
    "User": "👤", "Users": "👥", "UserPlus": "👤",
    "BarChart": "📊", "BarChart2": "📊", "BarChart3": "📊",
    "LineChart": "📈", "PieChart": "🥧",
    "TrendingUp": "📈", "TrendingDown": "📉", "Activity": "📈",
    "Database": "🗄️", "Server": "🖥️",
    "Sun": "☀️", "Moon": "🌙", "Cloud": "☁️",
    "Star": "⭐", "Heart": "❤️", "HeartOff": "💔",
    "ThumbsUp": "👍", "ThumbsDown": "👎",
    "Smile": "😊", "Frown": "☹️", "Meh": "😐", "Laugh": "😄",
    "Trophy": "🏆", "Award": "🎖️", "Medal": "🏅",
    "Target": "🎯", "Zap": "⚡", "Power": "⏻",
    "Lightbulb": "💡", "Rocket": "🚀", "Globe": "🌍",
    "MapPin": "📍", "Compass": "🧭",
    "Gavel": "⚖️", "Scale": "⚖️", "Hammer": "🔨", "Wrench": "🔧",
    "Code": "💻", "Terminal": "💻",
    "DollarSign": "💲", "CircleDollarSign": "💰", "Coins": "🪙",
    "MessageCircle": "💬", "MessageSquare": "💬",
    "GraduationCap": "🎓", "ScrollText": "📜",
    "Sparkles": "✨", "Wand2": "🪄", "PartyPopper": "🎉",
    "Puzzle": "🧩", "Dices": "🎲", "Gamepad2": "🎮",
    "Flame": "🔥", "Droplet": "💧", "Snowflake": "❄️",
    "Mountain": "⛰️", "Leaf": "🍃",
    "LifeBuoy": "🆘", "Megaphone": "📢",
}


def _inject_lucide_polyfills(html_content: str) -> str:
    """
    在已上传游戏的 Babel script 中注入 lucide-react 图标 polyfill。

    扫描 <script type="text/babel"> 块，检测所有大写开头的未定义标识符
    （可能是 lucide-react 图标引用），自动注入 emoji 替代组件。
    仅对使用 Babel 的页面生效，不影响普通 HTML 游戏。
    """
    # 只处理含有 Babel script 的页面
    if 'type="text/babel"' not in html_content and "type='text/babel'" not in html_content:
        return html_content

    # 收集所有可能需要 polyfill 的 lucide 图标名称
    # 策略：在 Babel 脚本中查找形如 <IconName 或 {IconName} 的引用
    # 这些是 JSX 中使用组件的典型模式
    icon_refs = set()
    babel_match = re.search(
        r'<script[^>]*type=["\']text/babel["\'][^>]*>(.*?)</script>',
        html_content,
        re.DOTALL | re.IGNORECASE,
    )
    if babel_match:
        babel_code = babel_match.group(1)
        # 查找 JSX 标签形式: <AlertCircle  或 <AlertCircle/> 或 <AlertCircle ...>
        jsx_icons = re.findall(r'<([A-Z][a-zA-Z0-9]+)[\s/>]', babel_code)
        icon_refs.update(jsx_icons)
        # 查找变量引用: {AlertCircle} 或 AlertCircle(
        var_icons = re.findall(r'\b([A-Z][a-zA-Z0-9]+)\s*(?:[,}\)]|&&|\|\|)', babel_code)
        icon_refs.update(var_icons)

    # 过滤：只处理已知的 lucide 图标 + 在代码中找不到定义的
    icons_to_inject = set()
    for icon_name in icon_refs:
        # 跳过 React 内置组件和 HTML 标签
        if icon_name in ('React', 'ReactDOM', 'Fragment', 'Component',
                         'Suspense', 'StrictMode', 'Profiler',
                         'Div', 'Span', 'Input', 'Button', 'Form',
                         'Table', 'Select', 'Option', 'Label',
                         'Head', 'Html', 'Body', 'Script', 'Style',
                         'Symbol', 'Path', 'Svg', 'Circle', 'Rect',
                         'Line', 'Polyline', 'Polygon', 'Image',
                         'Text', 'View'):
            continue
        # 检查是否在代码中已经有定义（const/function/class）
        if babel_match:
            babel_code = babel_match.group(1)
            defined_pattern = (
                rf'(?:const|let|var|function|class)\s+{re.escape(icon_name)}\b'
            )
            if re.search(defined_pattern, babel_code):
                continue
        # 是已知的 lucide 图标，或代码中使用了但未定义的组件
        if icon_name in _LUCIDE_EMOJI_MAP:
            icons_to_inject.add(icon_name)
        elif not re.search(
            rf'(?:const|let|var|function|class)\s+{re.escape(icon_name)}\b',
            html_content,
        ):
            # 未知图标但代码中未定义 → 用默认 emoji
            icons_to_inject.add(icon_name)

    if not icons_to_inject:
        return html_content

    # 生成 polyfill script（普通 JS，不需要 Babel）
    polyfill_lines = [
        '<script>',
        '// Auto-injected lucide-react icon polyfills',
    ]
    for icon_name in sorted(icons_to_inject):
        emoji = _LUCIDE_EMOJI_MAP.get(icon_name, '⚡')
        polyfill_lines.append(
            f'window.{icon_name} = function(props) {{'
            f' return React.createElement("span", '
            f'{{ className: props && props.className || "", '
            f'style: {{ fontSize: (props && props.size || 16) + "px" }} }}, '
            f'"{emoji}"); }};'
        )
    polyfill_lines.append('</script>')
    polyfill_snippet = '\n'.join(polyfill_lines)

    # 在 Babel script 之前注入（确保组件在 Babel 编译后的代码中可用）
    html_content = re.sub(
        r'(<script[^>]*type=["\']text/babel["\'])',
        polyfill_snippet + r'\n\1',
        html_content,
        count=1,
        flags=re.IGNORECASE,
    )

    logger.debug("注入了 %d 个 lucide 图标 polyfill: %s", len(icons_to_inject), icons_to_inject)
    return html_content
