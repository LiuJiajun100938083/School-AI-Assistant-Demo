#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏上传 - Service 层

封装游戏上传的所有业务逻辑：
- 文件验证与保存
- React/JSX 代码智能包装
- 权限校验
- 学科验证
"""

import json
import logging
import re
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.domains.game_upload.exceptions import (
    GameAccessDeniedError,
    GameFileTooLargeError,
    GameNotFoundError,
    InvalidFileTypeError,
    InvalidSubjectError,
)
from app.domains.game_upload.repository import GameUploadRepository
from app.domains.game_upload.schemas import GameCreateRequest, GameUpdateRequest

logger = logging.getLogger(__name__)

# ==================================================================================
#                                   配置常量
# ==================================================================================

MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_EXTENSIONS = {'.html', '.htm'}
UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent.parent / 'web_static' / 'uploaded_games'


class GameUploadService:
    """游戏上传业务服务"""

    def __init__(
        self,
        game_repo: GameUploadRepository,
    ):
        self._repo = game_repo
        self._upload_dir = UPLOAD_DIR
        self._upload_dir.mkdir(parents=True, exist_ok=True)

    # ==================== 初始化 ====================

    def init_system(self) -> None:
        """初始化游戏上传系统（建表 + 创建目录）"""
        logger.info("初始化游戏上传系统...")
        self._repo.init_table()
        self._upload_dir.mkdir(parents=True, exist_ok=True)
        logger.info("游戏上传系统初始化完成")

    # ==================== 创建游戏 ====================

    async def create_game(
        self,
        user_id: int,
        data: GameCreateRequest,
        file: Optional[UploadFile] = None,
    ) -> Dict[str, Any]:
        """
        创建新游戏

        Args:
            user_id: 上传者 ID
            data: 游戏信息
            file: 上传的 HTML 文件（可选，与 html_content 二选一）

        Returns:
            创建的游戏信息
        """
        # 验证学科
        valid_subjects = self._repo.get_subjects()
        if data.subject not in valid_subjects:
            raise InvalidSubjectError(data.subject)

        # 获取 HTML 内容
        html_content = await self._get_html_content(data.html_content, file)

        # 生成 UUID
        game_uuid = str(uuid.uuid4())

        # 保存 HTML 文件
        file_path = self._upload_dir / f"{game_uuid}.html"
        file_size = self._save_html_file(file_path, html_content)

        # 保存到数据库
        try:
            self._repo.create_game({
                'uuid': game_uuid,
                'name': data.name,
                'name_en': data.name_en,
                'description': data.description,
                'subject': data.subject,
                'icon': data.icon,
                'difficulty': json.dumps(data.difficulty, ensure_ascii=False),
                'tags': json.dumps(data.tags, ensure_ascii=False),
                'uploader_id': user_id,
                'is_public': data.is_public,
                'visible_to': json.dumps(data.visible_to, ensure_ascii=False),
                'teacher_only': data.teacher_only,
                'file_size': file_size,
            })

            game = self._get_formatted_game(game_uuid)
            logger.info("游戏创建成功: %s by user %d", game_uuid, user_id)
            return game

        except Exception as e:
            # 回滚：删除已保存的文件
            if file_path.exists():
                file_path.unlink()
            logger.error("创建游戏失败: %s", e)
            raise

    # ==================== 游戏热度 ====================

    def get_game_popularity(self) -> Dict[str, int]:
        """统计各内置游戏的总游玩次数"""
        game_tables = {
            'farm_game': 'farm_game_scores',
            'trade_game': 'trade_game_scores',
            'chemistry_2048': 'chem2048_scores',
        }
        result = {}
        for game_id, table in game_tables.items():
            try:
                row = self._repo.raw_query_one(
                    f"SELECT COUNT(*) as cnt FROM {table}"
                )
                result[game_id] = row['cnt'] if row else 0
            except Exception:
                result[game_id] = 0
        return result

    # ==================== 查询游戏 ====================

    def get_games(
        self,
        user_id: int,
        user_role: str,
        subject: Optional[str] = None,
        only_mine: bool = False,
        user_class: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """获取游戏列表"""
        games = self._repo.list_games(user_id, user_role, subject, only_mine, user_class)
        formatted = [self._format_game(g) for g in games]

        # 学生端：fail-closed 过滤（teacher_only + visible_to 班级限制）
        if user_role == 'student':
            formatted = [
                g for g in formatted
                if not g.get('teacher_only')
                and (not g.get('visible_to') or (user_class and user_class in g['visible_to']))
            ]

        return formatted

    def get_game(self, game_uuid: str, user_id: int, user_role: str, user_class: str = '') -> Dict[str, Any]:
        """获取单个游戏详情"""
        game = self._get_formatted_game(game_uuid)
        if not game:
            raise GameNotFoundError(game_uuid)

        if not self._can_access_game(game, user_id, user_role, user_class):
            raise GameAccessDeniedError()

        return game

    # ==================== 更新游戏 ====================

    async def update_game(
        self,
        game_uuid: str,
        user_id: int,
        user_role: str,
        data: GameUpdateRequest,
    ) -> Dict[str, Any]:
        """更新游戏信息"""
        game = self._get_formatted_game(game_uuid)
        if not game:
            raise GameNotFoundError(game_uuid)
        if not self._can_modify_game(game, user_id, user_role):
            raise GameAccessDeniedError("无权修改此游戏")

        # 构建更新字段
        updates: Dict[str, Any] = {}

        if data.name is not None:
            updates['name'] = data.name
        if data.name_en is not None:
            updates['name_en'] = data.name_en
        if data.description is not None:
            updates['description'] = data.description
        if data.subject is not None:
            valid_subjects = self._repo.get_subjects()
            if data.subject not in valid_subjects:
                raise InvalidSubjectError(data.subject)
            updates['subject'] = data.subject
        if data.icon is not None:
            updates['icon'] = data.icon
        if data.difficulty is not None:
            updates['difficulty'] = json.dumps(data.difficulty, ensure_ascii=False)
        if data.tags is not None:
            updates['tags'] = json.dumps(data.tags, ensure_ascii=False)
        if data.is_public is not None:
            updates['is_public'] = data.is_public
        if data.visible_to is not None:
            updates['visible_to'] = json.dumps(data.visible_to, ensure_ascii=False)
        if data.teacher_only is not None:
            updates['teacher_only'] = data.teacher_only

        # 更新 HTML 内容
        if data.html_content is not None:
            file_path = self._upload_dir / f"{game_uuid}.html"
            file_size = self._save_html_file(file_path, data.html_content)
            updates['file_size'] = file_size

        if not updates:
            return game

        self._repo.update_game(game_uuid, updates)
        return self._get_formatted_game(game_uuid)

    # ==================== 删除游戏 ====================

    def delete_game(self, game_uuid: str, user_id: int, user_role: str) -> bool:
        """删除游戏（软删除）"""
        game = self._get_formatted_game(game_uuid)
        if not game:
            raise GameNotFoundError(game_uuid)
        if not self._can_modify_game(game, user_id, user_role):
            raise GameAccessDeniedError("无权删除此游戏")

        self._repo.soft_delete_game(game_uuid)
        logger.info("游戏删除成功: %s by user %d", game_uuid, user_id)
        return True

    # ==================== 切换可见性 ====================

    def toggle_visibility(self, game_uuid: str, user_id: int, user_role: str) -> Dict[str, Any]:
        """切换游戏可见性"""
        game = self._get_formatted_game(game_uuid)
        if not game:
            raise GameNotFoundError(game_uuid)
        if not self._can_modify_game(game, user_id, user_role):
            raise GameAccessDeniedError("无权修改此游戏")

        new_visibility = not game['is_public']
        self._repo.toggle_visibility(game_uuid, new_visibility)

        game['is_public'] = new_visibility
        return game

    # ==================== 分享功能 ====================

    SHARE_DURATIONS = {
        '30m': 30 * 60,
        '1h': 60 * 60,
        '1d': 24 * 60 * 60,
        '1w': 7 * 24 * 60 * 60,
    }

    def create_share_token(
        self,
        game_uuid: str,
        user_id: int,
        user_role: str,
        duration: str,
    ) -> Dict[str, Any]:
        """
        创建游戏分享 token

        Args:
            game_uuid: 游戏 UUID
            user_id: 创建者 ID
            user_role: 创建者角色
            duration: 有效期（30m / 1h / 1d / 1w）

        Returns:
            { token, share_url, expires_at }
        """
        from datetime import datetime, timedelta

        # 验证游戏存在
        game = self._get_formatted_game(game_uuid)
        if not game:
            raise GameNotFoundError(game_uuid)

        # 验证权限：必须是游戏上传者或管理员
        if not self._can_modify_game(game, user_id, user_role):
            raise GameAccessDeniedError("无权分享此游戏")

        # 验证 duration
        seconds = self.SHARE_DURATIONS.get(duration)
        if not seconds:
            from app.domains.game_upload.exceptions import GameUploadError
            raise GameUploadError(message=f"无效的有效期: {duration}")

        # 生成 token（UUID 去掉横线，32 字符）
        token = uuid.uuid4().hex

        # 计算过期时间
        expires_at = datetime.now() + timedelta(seconds=seconds)

        # 存入数据库
        self._repo.create_share_token({
            'token': token,
            'game_uuid': game_uuid,
            'creator_id': user_id,
            'expires_at': expires_at,
        })

        logger.info("分享 token 创建成功: game=%s, token=%s, expires=%s",
                     game_uuid, token[:8] + '...', expires_at.isoformat())

        return {
            'token': token,
            'expires_at': expires_at.isoformat(),
            'game_name': game['name'],
            'game_icon': game['icon'],
        }

    def get_shared_game(self, token: str) -> Optional[Dict[str, Any]]:
        """
        通过分享 token 获取游戏信息（无需用户身份）

        Returns:
            游戏信息字典，过期或不存在则返回 None
        """
        from datetime import datetime

        record = self._repo.find_share_token(token)
        if not record:
            return None

        # 检查是否过期
        expires_at = record['expires_at']
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)

        if datetime.now() > expires_at:
            return None

        return {
            'uuid': record['uuid'],
            'name': record['name'],
            'name_en': record.get('name_en'),
            'description': record['description'],
            'subject': record['subject'],
            'icon': record['icon'],
            'url': f"/uploaded_games/{record['uuid']}",
            'uploader_name': record.get('uploader_name'),
            'expires_at': expires_at.isoformat() if hasattr(expires_at, 'isoformat') else str(expires_at),
        }

    # ==================== 学科配置 ====================

    def get_subjects_with_icons(self) -> Dict[str, Dict[str, str]]:
        """获取带图标的学科列表"""
        return self._repo.get_subjects_with_icons()

    # ==================== 私有方法 ====================

    def _get_formatted_game(self, game_uuid: str) -> Optional[Dict[str, Any]]:
        """获取并格式化游戏"""
        raw = self._repo.find_by_uuid(game_uuid)
        return self._format_game(raw) if raw else None

    def _format_game(self, game: Dict) -> Optional[Dict[str, Any]]:
        """格式化游戏数据"""
        if not game:
            return None

        # 解析 visible_to 字段
        visible_to_raw = game.get('visible_to') or '[]'
        if isinstance(visible_to_raw, str):
            try:
                visible_to = json.loads(visible_to_raw)
            except (json.JSONDecodeError, TypeError):
                visible_to = []
        elif isinstance(visible_to_raw, list):
            visible_to = visible_to_raw
        else:
            visible_to = []

        return {
            'uuid': game['uuid'],
            'name': game['name'],
            'name_en': game.get('name_en'),
            'description': game['description'],
            'subject': game['subject'],
            'icon': game['icon'],
            'difficulty': json.loads(game['difficulty']) if isinstance(game['difficulty'], str) else game['difficulty'],
            'tags': json.loads(game['tags']) if isinstance(game['tags'], str) else game['tags'],
            'is_public': bool(game['is_public']),
            'visible_to': visible_to,
            'teacher_only': bool(game.get('teacher_only', False)),
            'uploader_id': game['uploader_id'],
            'uploader_name': game.get('uploader_name'),
            'file_size': game['file_size'],
            'url': f"/uploaded_games/{game['uuid']}",
            'created_at': game['created_at'].isoformat() if hasattr(game['created_at'], 'isoformat') else str(game['created_at']),
            'updated_at': game['updated_at'].isoformat() if hasattr(game['updated_at'], 'isoformat') else str(game['updated_at']),
        }

    def _can_access_game(self, game: Dict, user_id: int, user_role: str, user_class: str = '') -> bool:
        """检查用户是否有权访问游戏（fail-closed 设计）"""
        if user_role == 'admin':
            return True
        if game.get('uploader_id') == user_id:
            return True
        if game.get('teacher_only'):
            return user_role in ('teacher', 'admin')
        if game.get('is_public'):
            if user_role == 'student':
                visible_to = game.get('visible_to') or []
                if visible_to:
                    # fail-closed: 无班级信息时拒绝访问
                    if not user_class or user_class not in visible_to:
                        return False
            return True
        return False

    def _can_modify_game(self, game: Dict, user_id: int, user_role: str) -> bool:
        """检查用户是否有权修改游戏"""
        if user_role == 'admin':
            return True
        return game['uploader_id'] == user_id

    async def _get_html_content(
        self,
        html_content: Optional[str],
        file: Optional[UploadFile],
    ) -> str:
        """获取 HTML 内容"""
        if file:
            ext = Path(file.filename).suffix.lower()
            if ext not in ALLOWED_EXTENSIONS:
                raise InvalidFileTypeError(ext)
            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                raise GameFileTooLargeError(MAX_FILE_SIZE // 1024 // 1024)
            return content.decode('utf-8')

        elif html_content:
            if len(html_content.encode('utf-8')) > MAX_FILE_SIZE:
                raise GameFileTooLargeError(MAX_FILE_SIZE // 1024 // 1024)
            return html_content

        else:
            from app.domains.game_upload.exceptions import GameUploadError
            raise GameUploadError(message="请提供HTML文件或代码内容")

    def _detect_and_wrap_react(self, content: str) -> str:
        """
        智能检测并包装 React/JSX 代码

        检测特征：
        - import React / import { useState }
        - export default function/class
        - JSX 语法 (<div className=)
        - React Hooks (useState, useEffect, useRef)
        """
        content_stripped = content.strip()

        # 如果已经是完整 HTML，直接返回
        if content_stripped.lower().startswith('<!doctype') or content_stripped.lower().startswith('<html'):
            return content

        # 检测 React/JSX 特征
        react_patterns = [
            'import React',
            'import { useState',
            'import { useEffect',
            'import {useState',
            'import {useEffect',
            'from "react"',
            "from 'react'",
            'export default function',
            'export default class',
            'useState(',
            'useEffect(',
            'useRef(',
            'className=',
            'className =',
            '<div className',
            'ReactDOM.render',
            'React.createElement',
        ]

        is_react = any(pattern in content for pattern in react_patterns)

        if not is_react:
            # 不是 React 代码，检查是否是纯 HTML 片段
            if '<' in content and '>' in content:
                return f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>遊戲</title>
    <style>* {{ margin: 0; padding: 0; box-sizing: border-box; }}</style>
</head>
<body>
{content}
</body>
</html>'''
            return content

        # 是 React 代码，进行包装
        logger.info("检测到 React/JSX 代码，自动包装...")

        # 解析 lucide-react 导入，提取使用的图标名称
        lucide_icons_used = set()
        lines = content.split('\n')
        for line in lines:
            if 'from "lucide-react"' in line or "from 'lucide-react'" in line:
                icon_match = re.search(r'import\s*\{([^}]+)\}', line)
                if icon_match:
                    icons = [i.strip() for i in icon_match.group(1).split(',') if i.strip()]
                    lucide_icons_used.update(icons)

        # 清理 import 语句（Babel 不认识 ES Module imports）
        cleaned_lines = []
        for line in lines:
            if 'from "react"' in line or "from 'react'" in line:
                continue
            if 'from "lucide-react"' in line or "from 'lucide-react'" in line:
                continue
            if 'from "react-dom"' in line or "from 'react-dom'" in line:
                continue
            if line.strip().startswith('export default'):
                line = line.replace('export default ', '')
            cleaned_lines.append(line)

        cleaned_content = '\n'.join(cleaned_lines)

        # 检测组件名称
        component_name = 'App'
        match = re.search(r'function\s+([A-Z][a-zA-Z0-9]*)\s*\(', content)
        if match:
            component_name = match.group(1)
        else:
            match = re.search(r'class\s+([A-Z][a-zA-Z0-9]*)\s+extends', content)
            if match:
                component_name = match.group(1)

        # 生成 lucide 图标 polyfill 代码
        lucide_polyfill_code = self._generate_lucide_polyfills(lucide_icons_used)

        # 生成完整 HTML
        wrapped_html = f'''<!DOCTYPE html>
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>遊戲</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }}
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const {{ useState, useEffect, useRef, useCallback, useMemo, useContext, createContext, useReducer, forwardRef, memo, Fragment }} = React;

{lucide_polyfill_code}

{cleaned_content}

        // 渲染組件
        const rootElement = document.getElementById('root');
        ReactDOM.render(<{component_name} />, rootElement);
    </script>
</body>
</html>'''

        return wrapped_html

    # lucide-react 图标 → emoji 映射（涵盖常用图标）
    _LUCIDE_EMOJI_MAP = {
        # Alerts & Status
        "AlertCircle": "⚠️", "AlertTriangle": "⚠️", "AlertOctagon": "🛑",
        "CheckCircle": "✅", "CheckCircle2": "✅", "XCircle": "❌",
        "HelpCircle": "❓", "Info": "ℹ️", "Ban": "🚫",
        "ShieldAlert": "🛡️", "ShieldCheck": "🛡️", "ShieldX": "🛡️",
        # Actions
        "Check": "✓", "X": "✕", "Plus": "+", "Minus": "−",
        "Play": "▶️", "Pause": "⏸️", "Square": "⏹️",
        "SkipForward": "⏭️", "SkipBack": "⏮️",
        "RefreshCw": "🔄", "RefreshCcw": "🔄", "RotateCw": "🔄", "RotateCcw": "🔄",
        "Undo": "↩️", "Redo": "↪️", "Repeat": "🔁",
        "Download": "📥", "Upload": "📤", "Share": "📤", "Share2": "📤",
        "Copy": "📋", "Clipboard": "📋", "ClipboardCheck": "📋",
        "Save": "💾", "Edit": "✏️", "Edit2": "✏️", "Edit3": "✏️",
        "Trash": "🗑️", "Trash2": "🗑️",
        "Send": "📨", "Mail": "📧", "Inbox": "📥",
        "Printer": "🖨️", "ExternalLink": "🔗", "Link": "🔗", "Link2": "🔗",
        # Arrows & Navigation
        "ArrowRight": "→", "ArrowLeft": "←", "ArrowUp": "↑", "ArrowDown": "↓",
        "ArrowUpRight": "↗️", "ArrowDownRight": "↘️",
        "ArrowUpLeft": "↖️", "ArrowDownLeft": "↙️",
        "ChevronRight": "›", "ChevronLeft": "‹",
        "ChevronDown": "▼", "ChevronUp": "▲",
        "ChevronsRight": "»", "ChevronsLeft": "«",
        "ChevronsDown": "⬇️", "ChevronsUp": "⬆️",
        "MoveRight": "➡️", "MoveLeft": "⬅️",
        "CornerDownRight": "↳", "CornerRightDown": "↴",
        # UI
        "Menu": "☰", "MoreHorizontal": "⋯", "MoreVertical": "⋮",
        "Grip": "⠿", "GripVertical": "⠿", "GripHorizontal": "⠿",
        "Maximize": "⬜", "Maximize2": "⬜", "Minimize": "▬", "Minimize2": "▬",
        "Sidebar": "☰", "PanelLeft": "◧", "PanelRight": "◨",
        "Columns": "☷", "Rows": "☰", "LayoutGrid": "⊞",
        "Filter": "🔽", "SlidersHorizontal": "⚙️", "Settings": "⚙️", "Settings2": "⚙️",
        "Search": "🔍", "ZoomIn": "🔍", "ZoomOut": "🔍",
        "Eye": "👁️", "EyeOff": "🙈",
        # Objects
        "Home": "🏠", "Building": "🏢", "Building2": "🏢",
        "School": "🏫", "Landmark": "🏛️", "Castle": "🏰",
        "Store": "🏪", "Hospital": "🏥", "Church": "⛪",
        "Briefcase": "💼", "Wallet": "👛",
        "BookOpen": "📖", "Book": "📕", "BookMarked": "📑",
        "Newspaper": "📰", "FileText": "📄", "File": "📁",
        "Folder": "📂", "FolderOpen": "📂",
        "Image": "🖼️", "Camera": "📷", "Video": "🎥", "Film": "🎬",
        "Music": "🎵", "Mic": "🎤", "Volume2": "🔊", "VolumeX": "🔇",
        "Phone": "📱", "Smartphone": "📱", "Tablet": "📱",
        "Monitor": "🖥️", "Laptop": "💻", "Tv": "📺",
        "Keyboard": "⌨️", "Mouse": "🖱️",
        "Wifi": "📶", "WifiOff": "📶", "Bluetooth": "📶",
        "Battery": "🔋", "BatteryCharging": "🔋",
        "Clock": "🕐", "Timer": "⏱️", "Hourglass": "⏳", "Watch": "⌚",
        "Calendar": "📅", "CalendarDays": "📅",
        "Bell": "🔔", "BellOff": "🔕", "BellRing": "🔔",
        "Lock": "🔒", "Unlock": "🔓", "Key": "🔑",
        "Shield": "🛡️", "Sword": "⚔️",
        "Flag": "🚩", "Bookmark": "🔖",
        "Tag": "🏷️", "Tags": "🏷️", "Hash": "#️⃣",
        "Gift": "🎁", "Package": "📦",
        "ShoppingCart": "🛒", "ShoppingBag": "🛍️",
        "CreditCard": "💳", "Banknote": "💵",
        "Gem": "💎", "Crown": "👑",
        # People
        "User": "👤", "Users": "👥", "UserPlus": "👤",
        "UserMinus": "👤", "UserCheck": "👤", "UserX": "👤",
        # Data & Charts
        "BarChart": "📊", "BarChart2": "📊", "BarChart3": "📊", "BarChart4": "📊",
        "LineChart": "📈", "PieChart": "🥧", "TrendingUp": "📈", "TrendingDown": "📉",
        "Activity": "📈", "Gauge": "🎯",
        "Database": "🗄️", "Server": "🖥️", "HardDrive": "💾",
        "Table": "📊", "Table2": "📊",
        # Nature & Weather
        "Sun": "☀️", "Moon": "🌙", "Cloud": "☁️", "CloudRain": "🌧️",
        "CloudSnow": "🌨️", "CloudLightning": "⛈️", "Wind": "💨",
        "Snowflake": "❄️", "Droplet": "💧", "Flame": "🔥",
        "Thermometer": "🌡️", "Umbrella": "☂️",
        "Mountain": "⛰️", "Trees": "🌲", "Leaf": "🍃", "Flower": "🌸",
        "Bug": "🐛", "Fish": "🐟", "Bird": "🐦",
        # Symbols
        "Star": "⭐", "Heart": "❤️", "HeartOff": "💔",
        "ThumbsUp": "👍", "ThumbsDown": "👎",
        "Smile": "😊", "Frown": "☹️", "Meh": "😐", "Laugh": "😄",
        "Trophy": "🏆", "Award": "🎖️", "Medal": "🏅",
        "Target": "🎯", "Crosshair": "⊕",
        "Zap": "⚡", "ZapOff": "⚡", "Power": "⏻",
        "Lightbulb": "💡", "Lamp": "💡",
        "Rocket": "🚀", "Plane": "✈️", "Car": "🚗", "Truck": "🚚",
        "Ship": "🚢", "Anchor": "⚓", "Compass": "🧭",
        "Globe": "🌍", "Globe2": "🌍", "Map": "🗺️", "MapPin": "📍",
        "Navigation": "🧭", "Signpost": "🪧",
        # Misc
        "Gavel": "⚖️", "Scale": "⚖️", "Hammer": "🔨", "Wrench": "🔧",
        "Scissors": "✂️", "Paintbrush": "🖌️", "Palette": "🎨",
        "Code": "💻", "Terminal": "💻", "Code2": "💻",
        "Binary": "01", "Braces": "{}", "Hash": "#",
        "Percent": "%", "DollarSign": "💲", "Euro": "€",
        "CircleDollarSign": "💰", "Coins": "🪙",
        "MessageCircle": "💬", "MessageSquare": "💬",
        "Quote": "❝", "Type": "🔤",
        "AlignLeft": "☰", "AlignCenter": "☰", "AlignRight": "☰",
        "Bold": "𝐁", "Italic": "𝐼", "Underline": "U̲",
        "List": "☰", "ListOrdered": "☰",
        "Fingerprint": "🔏", "QrCode": "📱", "Scan": "📷",
        "LifeBuoy": "🆘", "Headphones": "🎧", "Speaker": "🔊",
        "Megaphone": "📢",
        "PartyPopper": "🎉", "Sparkles": "✨", "Wand2": "🪄",
        "Puzzle": "🧩", "Dices": "🎲", "Gamepad2": "🎮",
    }

    def _generate_lucide_polyfills(self, icons_used: set) -> str:
        """
        为上传的 React 代码生成 lucide-react 图标 polyfill

        动态解析 import 的图标名称，生成对应的 emoji React 组件。
        对于未知图标名称，使用 ⚡ 作为默认 emoji。

        Args:
            icons_used: 从 import 语句中提取的图标名称集合

        Returns:
            JavaScript 代码字符串，包含所有图标组件的定义
        """
        if not icons_used:
            return "        // No lucide-react icons detected"

        polyfill_lines = [
            "        // Lucide-react icon polyfills (auto-generated emoji replacements)",
        ]

        for icon_name in sorted(icons_used):
            emoji = self._LUCIDE_EMOJI_MAP.get(icon_name, "⚡")
            # 使用 React.createElement 避免 JSX 在 f-string 中转义问题
            polyfill_lines.append(
                f"        const {icon_name} = ({{ className, size, ...props }}) => "
                f"React.createElement('span', {{ className, style: {{ fontSize: size || '1em' }} }}, '{emoji}');"
            )

        return "\n".join(polyfill_lines)

    def _save_html_file(self, file_path: Path, content: str) -> int:
        """保存 HTML 文件并返回文件大小"""
        processed_content = self._detect_and_wrap_react(content)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(processed_content)
        return file_path.stat().st_size
