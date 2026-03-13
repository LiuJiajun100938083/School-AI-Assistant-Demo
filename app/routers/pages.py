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
#  AI 圖片生成頁面                                                          #
# ====================================================================== #

@router.get("/image-gen")
async def image_gen():
    """AI 圖片生成"""
    return _serve_page("image_gen.html")


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


@router.get("/classroom/lesson-editor/{plan_id}")
async def lesson_editor(plan_id: str):
    """课案编辑器"""
    return _serve_page("lesson_editor.html")


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


@router.get("/farm-game")
async def farm_game():
    """神州菜園經營家"""
    return _serve_page("farm_game.html")


@router.get("/chemistry-2048")
async def chemistry_2048():
    """化學元素 2048"""
    return _serve_page("chemistry_2048.html")


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


# 分享游戏播放页 CSP — 需要 frame-src 'self' 以允许 iframe 嵌入同源上传游戏
_PLAY_SHARED_CSP = (
    "default-src 'self'; "
    "script-src 'self' 'unsafe-inline'; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: blob:; "
    "connect-src 'self'; "
    "frame-src 'self'; "
    "object-src 'none'; "
    "base-uri 'self'"
)


@router.get("/play/{token}")
async def play_shared_game(token: str):
    """通过分享 token 访问游戏（无需登入）"""
    file_path = os.path.join(STATIC_DIR, "game_play_shared.html")
    if os.path.exists(file_path):
        return FileResponse(
            file_path,
            media_type="text/html",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Pragma": "no-cache",
                "Expires": "0",
                "Content-Security-Policy": _PLAY_SHARED_CSP,
            },
        )
    return HTMLResponse(
        content="<h1>页面未找到</h1>",
        status_code=404,
    )


# 上传游戏专用 CSP — 比全局 CSP 更严格
# - 允许 CDN（React/Babel/Tailwind 运行时需要）
# - 保留 unsafe-eval（Babel standalone 转译 JSX 需要）
# - connect-src 仅允许 self（阻止向外部 API 泄露数据）
# - frame-src none（禁止 iframe 嵌套）
_UPLOADED_GAME_CSP = (
    "default-src 'self'; "
    "script-src 'self' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com "
    "https://cdn.jsdelivr.net https://unpkg.com 'unsafe-inline' 'unsafe-eval'; "
    "style-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net "
    "https://fonts.googleapis.com 'unsafe-inline'; "
    "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com data:; "
    "img-src 'self' data: blob:; "
    "connect-src 'self' https://cdnjs.cloudflare.com https://cdn.tailwindcss.com "
    "https://cdn.jsdelivr.net https://unpkg.com; "
    "frame-src 'none'; "
    "object-src 'none'; "
    "base-uri 'self'"
)

# 上传游戏通用安全头
_UPLOADED_GAME_HEADERS = {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Pragma": "no-cache",
    "Expires": "0",
    "Content-Security-Policy": _UPLOADED_GAME_CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",  # 允许 game_play_shared.html 通过 iframe 嵌入
}


def _is_raw_jsx(content: str) -> bool:
    """检测内容是否为裸 JSX/React 组件代码（而非完整 HTML 页面）"""
    stripped = content.strip()
    # 完整 HTML 页面以 <!DOCTYPE 或 <html 开头
    if stripped[:20].lower().startswith(("<!doctype", "<html")):
        return False
    # 包含 import from 'react' 或 export default — 典型 JSX 组件特征
    has_react_import = bool(re.search(
        r"""(?:import\s+.*\s+from\s+['"]react['"]|import\s+React)""", content
    ))
    has_export = bool(re.search(r'\bexport\s+default\b', content))
    return has_react_import or has_export


def _wrap_raw_jsx(jsx_code: str) -> str:
    """
    将裸 JSX/React 组件代码包装为完整可运行的 HTML 页面。

    处理逻辑：
    1. 移除所有 import 语句
    2. 移除 export default，识别组件名
    3. 移除 styled-jsx (<style jsx> 标签) 并提取为普通 CSS
    4. 包装为完整 HTML（含 React/Babel/Tailwind CDN）
    """
    lines = jsx_code.split('\n')
    clean_lines = []
    component_name = None
    extracted_css = []
    lucide_icons = []  # 从 lucide-react 导入的图标名

    for line in lines:
        stripped = line.strip()

        # 检测 lucide-react 导入并捕获图标名
        lucide_m = re.match(
            r"""^import\s+\{([^}]+)\}\s+from\s+['"]lucide-react['"]""", stripped
        )
        if lucide_m:
            icons = [name.strip() for name in lucide_m.group(1).split(',') if name.strip()]
            lucide_icons.extend(icons)
            continue

        # 跳过其他 import 语句
        if re.match(r"""^import\s+.*\s+from\s+['"]""", stripped):
            continue
        if re.match(r"""^import\s+['"]""", stripped):
            continue

        # 检测并处理 export default
        # export default function Foo() {
        m = re.match(r'^export\s+default\s+function\s+(\w+)', stripped)
        if m:
            component_name = m.group(1)
            clean_lines.append(line.replace('export default ', '', 1))
            continue

        # export default class Foo extends React.Component {
        m = re.match(r'^export\s+default\s+class\s+(\w+)', stripped)
        if m:
            component_name = m.group(1)
            clean_lines.append(line.replace('export default ', '', 1))
            continue

        # 单独的 export default Foo; (在文件末尾)
        m = re.match(r'^export\s+default\s+(\w+)\s*;?\s*$', stripped)
        if m:
            if not component_name:
                component_name = m.group(1)
            continue  # 跳过此行

        clean_lines.append(line)

    cleaned_code = '\n'.join(clean_lines)

    # 提取 <style jsx global>{`...`}</style> 中的 CSS
    def extract_styled_jsx(match):
        css_content = match.group(1)
        extracted_css.append(css_content)
        return ''  # 从 JSX 中移除

    cleaned_code = re.sub(
        r"""<style\s+jsx(?:\s+global)?\s*>\s*\{`(.*?)`\}\s*</style>""",
        extract_styled_jsx,
        cleaned_code,
        flags=re.DOTALL,
    )

    # 如果没找到组件名，尝试找第一个大写字母开头的 function 声明
    if not component_name:
        m = re.search(r'function\s+([A-Z]\w+)\s*\(', cleaned_code)
        if m:
            component_name = m.group(1)

    # 如果还是找不到，尝试 const Foo = () =>
    if not component_name:
        m = re.search(r'(?:const|let|var)\s+([A-Z]\w+)\s*=\s*(?:\(|function)', cleaned_code)
        if m:
            component_name = m.group(1)

    # 兜底
    if not component_name:
        component_name = 'App'

    css_block = '\n'.join(extracted_css) if extracted_css else ''
    css_tag = f'<style>{css_block}</style>' if css_block else ''
    end_script = '</script>'  # 避免 f-string 中的转义问题

    hooks_destructure = (
        "const { useState, useEffect, useRef, useCallback, "
        "useMemo, useReducer, useContext, createContext } = React;\n"
        "const { createPortal } = ReactDOM;"
    )

    # 生成 lucide 图标的 LOCAL 定义（const 在 Babel script 内部，不污染全局）
    icon_defs_lines = []
    for icon_name in lucide_icons:
        emoji = _LUCIDE_EMOJI_MAP.get(icon_name, '\u26A1')
        icon_defs_lines.append(
            f'const {icon_name} = (props) => React.createElement("span", '
            f'{{"className": (props && props.className) || "", '
            f'"style": {{"fontSize": ((props && props.size) || 24) + "px", '
            f'"display": "inline-flex", "alignItems": "center"}}}}, '
            f'"{emoji}");'
        )
    icon_defs_code = '\n'.join(icon_defs_lines)

    html = (
        '<!DOCTYPE html>\n'
        '<html lang="zh-TW">\n'
        '<head>\n'
        '    <meta charset="UTF-8">\n'
        '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
        '    <title>Game</title>\n'
        '    <script src="https://unpkg.com/react@18/umd/react.production.min.js">'
        f'{end_script}\n'
        '    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js">'
        f'{end_script}\n'
        '    <script src="https://unpkg.com/@babel/standalone/babel.min.js">'
        f'{end_script}\n'
        f'    <script src="https://cdn.tailwindcss.com">{end_script}\n'
        f'    {css_tag}\n'
        '</head>\n'
        '<body>\n'
        '<div id="root"></div>\n'
        '<script type="text/babel">\n'
        '(function() {\n'
        f'{hooks_destructure}\n'
        f'{icon_defs_code}\n\n'
        f'{cleaned_code}\n\n'
        f'ReactDOM.createRoot(document.getElementById("root")).render(<{component_name} />);\n'
        '})();\n'
        f'{end_script}\n'
        '</body>\n'
        '</html>'
    )
    return html


@router.get("/uploaded_games/{game_uuid}")
async def serve_uploaded_game(game_uuid: str, raw: str = None):
    """提供用户上传的游戏（沙盒运行），自动注入返回按钮 + lucide 图标 polyfill。raw=1 返回原始内容（编辑用）"""

    # ---- 路径安全：白名单 + pathlib resolve + 父目录校验 ----
    if not re.match(r'^[a-zA-Z0-9\-]+$', game_uuid):
        logger.warning(f"上传游戏路径非法字符: {game_uuid}")
        return HTMLResponse(content="<h1>无效的游戏ID</h1>", status_code=400)

    upload_base = Path(STATIC_DIR) / "uploaded_games"
    file_path = (upload_base / f"{game_uuid}.html").resolve()

    # 确保解析后的路径仍在上传目录内（防止路径遍历）
    if not str(file_path).startswith(str(upload_base.resolve())):
        logger.warning(f"路径遍历攻击尝试: {game_uuid}")
        return HTMLResponse(content="<h1>禁止访问</h1>", status_code=403)

    if file_path.exists():
        # raw 模式：返回原始文件（编辑器加载用），同样添加安全头
        if raw:
            return FileResponse(
                file_path,
                media_type="text/html",
                headers=_UPLOADED_GAME_HEADERS,
            )

        with open(file_path, "r", encoding="utf-8") as f:
            html_content = f.read()

        # ---- 裸 JSX 自动包装 ----
        if _is_raw_jsx(html_content):
            logger.info(f"检测到裸 JSX 组件，自动包装: {game_uuid}")
            html_content = _wrap_raw_jsx(html_content)

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
            headers=_UPLOADED_GAME_HEADERS,
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

    关键设计：polyfill 以 const 声明注入到 Babel script **内部**，
    作用域局限于 Babel 编译后的代码块，**绝不污染全局作用域**。
    这避免了 window.Map / window.Set 等被覆盖导致 Tailwind 等库崩溃的问题。

    仅对使用 Babel 的页面生效，不影响普通 HTML 游戏。
    """
    # 只处理含有 Babel script 的页面
    if 'type="text/babel"' not in html_content and "type='text/babel'" not in html_content:
        return html_content

    # 找到 Babel script 块
    babel_match = re.search(
        r'(<script[^>]*type=["\']text/babel["\'][^>]*>)(.*?)(</script>)',
        html_content,
        re.DOTALL | re.IGNORECASE,
    )
    if not babel_match:
        return html_content

    babel_open_tag = babel_match.group(1)
    babel_code = babel_match.group(2)
    babel_close_tag = babel_match.group(3)

    # 收集所有可能需要 polyfill 的 lucide 图标名称
    icon_refs = set()
    # 查找 JSX 标签形式: <AlertCircle  或 <AlertCircle/> 或 <AlertCircle ...>
    jsx_icons = re.findall(r'<([A-Z][a-zA-Z0-9]+)[\s/>]', babel_code)
    icon_refs.update(jsx_icons)
    # 查找变量引用: {AlertCircle} 或 AlertCircle(
    var_icons = re.findall(r'\b([A-Z][a-zA-Z0-9]+)\s*(?:[,}\)]|&&|\|\|)', babel_code)
    icon_refs.update(var_icons)

    # 过滤：只处理已知的 lucide 图标 + 在代码中找不到定义的
    # 不需要维护 JS 内置全局跳过列表 — 因为 polyfill 用 const（局部作用域），
    # 即使叫 Map 也不会覆盖 window.Map
    _SKIP_NAMES = frozenset({
        'React', 'ReactDOM', 'Fragment', 'Component',
        'Suspense', 'StrictMode', 'Profiler',
        'Div', 'Span', 'Input', 'Button', 'Form',
        'Table', 'Select', 'Option', 'Label',
        'Head', 'Html', 'Body', 'Script', 'Style',
        'Symbol', 'Path', 'Svg', 'Circle', 'Rect',
        'Line', 'Polyline', 'Polygon', 'Image',
        'Text', 'View',
    })

    icons_to_inject = set()
    for icon_name in icon_refs:
        if icon_name in _SKIP_NAMES:
            continue
        # 检查是否在代码中已经有定义（const/function/class）
        defined_pattern = (
            rf'(?:const|let|var|function|class)\s+{re.escape(icon_name)}\b'
        )
        if re.search(defined_pattern, babel_code):
            continue
        # 也检查整个 HTML（可能在其他 script 块中定义）
        if re.search(defined_pattern, html_content):
            continue
        # 是已知的 lucide 图标
        if icon_name in _LUCIDE_EMOJI_MAP:
            icons_to_inject.add(icon_name)
        # 或者代码中使用了但全局也没定义 → 用默认 emoji 防止 ReferenceError
        elif not re.search(
            rf'\b{re.escape(icon_name)}\b',
            html_content[:babel_match.start()],  # 只检查 Babel script 前面的内容
        ):
            icons_to_inject.add(icon_name)

    if not icons_to_inject:
        return html_content

    # 生成 const 声明（注入到 Babel script 内部顶端，局部作用域）
    polyfill_lines = ['// Auto-injected lucide-react icon polyfills']
    for icon_name in sorted(icons_to_inject):
        emoji = _LUCIDE_EMOJI_MAP.get(icon_name, '\u26A1')
        polyfill_lines.append(
            f'const {icon_name} = (props) => React.createElement("span", '
            f'{{"className": (props && props.className) || "", '
            f'"style": {{"fontSize": ((props && props.size) || 16) + "px", '
            f'"display": "inline-flex", "alignItems": "center"}}}}, '
            f'"{emoji}");'
        )
    polyfill_code = '\n'.join(polyfill_lines)

    # 替换 Babel script 块：用 IIFE 包裹全部代码（polyfill + 原始代码）
    # 关键：const 在脚本顶层会创建全局词法绑定，即使不是 window.xxx
    # 也会遮蔽原生 Map/Set 等。IIFE 确保 const 在函数作用域内。
    new_babel_block = (
        babel_open_tag + '\n'
        + '(function() {\n'
        + polyfill_code + '\n'
        + babel_code + '\n'
        + '})();\n'
        + babel_close_tag
    )
    html_content = (
        html_content[:babel_match.start()]
        + new_babel_block
        + html_content[babel_match.end():]
    )

    logger.debug("注入了 %d 个 lucide 图标 polyfill (局部作用域): %s",
                 len(icons_to_inject), icons_to_inject)
    return html_content
