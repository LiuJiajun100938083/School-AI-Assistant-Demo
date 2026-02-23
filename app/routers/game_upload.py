"""
游戏上传API模块
Game Upload API Module

提供教师上传、管理自定义HTML游戏的功能
支持文件上传和代码粘贴两种方式

架构说明：
- GameUploadService: 业务逻辑层
- GameUploadRouter: API路由层
- 数据库表: uploaded_games
- 文件存储: /web_static/uploaded_games/
"""

import os
import uuid
import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import pymysql

from app.core.dependencies import get_current_user

# 配置
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 常量配置
class GameUploadConfig:
    """游戏上传配置"""
    MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB
    ALLOWED_EXTENSIONS = {'.html', '.htm'}
    UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / 'web_static' / 'uploaded_games'

    # 学科配置（硬编码兜底，优先从数据库读取）
    DEFAULT_SUBJECTS = {
        'chinese': '中文',
        'math': '數學',
        'english': '英文',
        'history': '歷史',
        'ict': 'ICT',
        'physics': '物理',
        'chemistry': '化學',
        'biology': '生物',
        'ces': '公民'
    }

    # 保留 SUBJECTS 属性兼容旧代码
    SUBJECTS = DEFAULT_SUBJECTS.copy()

    @classmethod
    def get_subjects(cls) -> Dict[str, str]:
        """
        动态获取学科列表：优先从数据库 subjects 表读取，失败则回退到默认值。
        返回格式: {subject_code: subject_name, ...}
        """
        try:
            conn = DatabaseService.get_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT subject_code, subject_name FROM subjects")
                rows = cursor.fetchall()
            conn.close()

            if rows:
                db_subjects = {r['subject_code']: r['subject_name'] for r in rows if r.get('subject_code')}
                if db_subjects:
                    merged = cls.DEFAULT_SUBJECTS.copy()
                    merged.update(db_subjects)
                    return merged
        except Exception as e:
            logger.warning(f"从数据库加载学科失败，使用默认列表: {e}")
        return cls.DEFAULT_SUBJECTS.copy()

    @classmethod
    def get_subjects_with_icons(cls) -> Dict[str, Dict[str, str]]:
        """
        获取带图标的学科列表，用于前端显示。
        返回格式: {subject_code: {name, icon}, ...}
        """
        default_icons = {
            'chinese': '📖', 'math': '📐', 'english': '🔤',
            'history': '📜', 'ict': '💻', 'physics': '⚡',
            'chemistry': '🧪', 'biology': '🧬', 'ces': '🏛️'
        }
        try:
            conn = DatabaseService.get_connection()
            with conn.cursor() as cursor:
                cursor.execute("SELECT subject_code, subject_name, config FROM subjects")
                rows = cursor.fetchall()
            conn.close()

            if rows:
                result = {}
                for r in rows:
                    code = r.get('subject_code', '')
                    if not code:
                        continue
                    # 从 config JSON 中提取 icon
                    config = r.get('config')
                    if isinstance(config, str):
                        try:
                            config = json.loads(config)
                        except (json.JSONDecodeError, TypeError):
                            config = {}
                    if not isinstance(config, dict):
                        config = {}
                    icon = config.get('icon', default_icons.get(code, '📚'))
                    result[code] = {
                        "name": r.get('subject_name', code),
                        "icon": icon
                    }
                if result:
                    # 合并默认值中有但数据库中没有的
                    for code, name in cls.DEFAULT_SUBJECTS.items():
                        if code not in result:
                            result[code] = {
                                "name": name,
                                "icon": default_icons.get(code, "📚")
                            }
                    return result
        except Exception as e:
            logger.warning(f"从数据库加载学科(含图标)失败，使用默认列表: {e}")
        return {
            code: {"name": name, "icon": default_icons.get(code, "📚")}
            for code, name in cls.DEFAULT_SUBJECTS.items()
        }


# ==================================================================================
#                                   数据模型
# ==================================================================================

class GameCreateRequest(BaseModel):
    """创建游戏请求"""
    name: str = Field(..., min_length=1, max_length=100, description="游戏名称")
    name_en: Optional[str] = Field(None, max_length=100, description="英文名称")
    description: str = Field(..., min_length=1, max_length=500, description="游戏描述")
    subject: str = Field(..., description="学科分类")
    icon: str = Field(default="🎮", max_length=10, description="显示图标")
    difficulty: List[str] = Field(default=["中一", "中二", "中三"], description="适用年级")
    tags: List[str] = Field(default=[], description="搜索标签")
    is_public: bool = Field(default=False, description="是否学生可见")
    html_content: Optional[str] = Field(None, description="HTML代码内容")
    visible_to: List[str] = Field(default=[], description="可见班级列表，如['2A','3B']，空=所有班级")
    teacher_only: bool = Field(default=False, description="是否仅教师/管理员可见")


class GameUpdateRequest(BaseModel):
    """更新游戏请求"""
    name: Optional[str] = Field(None, max_length=100)
    name_en: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    subject: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=10)
    difficulty: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    html_content: Optional[str] = None
    visible_to: Optional[List[str]] = None
    teacher_only: Optional[bool] = None


class GameResponse(BaseModel):
    """游戏响应模型"""
    uuid: str
    name: str
    name_en: Optional[str]
    description: str
    subject: str
    icon: str
    difficulty: List[str]
    tags: List[str]
    is_public: bool
    uploader_id: int
    uploader_name: Optional[str] = None
    file_size: int
    url: str
    created_at: str
    updated_at: str


# ==================================================================================
#                                   数据库服务
# ==================================================================================

# 使用 bridge 获取数据库配置
try:
    from app.bridge import get_db_connection as _get_shared_connection, get_db_config
    DB_CONFIG = get_db_config()
    USE_SHARED_DB = True
    logger.info("✓ 使用统一数据库配置 (app.bridge)")
except ImportError:
    USE_SHARED_DB = False
    logger.warning("⚠ 无法导入 app.bridge，使用本地配置")


class DatabaseService:
    """数据库连接服务"""

    @staticmethod
    def get_connection():
        """获取数据库连接 - 优先使用统一配置"""
        if USE_SHARED_DB:
            return _get_shared_connection()

        # 降级到本地配置
        return pymysql.connect(
            host=os.getenv('DB_HOST', 'localhost'),
            user=os.getenv('DB_USER', 'root'),
            password=os.getenv('DB_PASSWORD', ''),  # 空密码
            database=os.getenv('DB_NAME', 'school_ai_assistant'),
            charset='utf8mb4',
            cursorclass=pymysql.cursors.DictCursor
        )

    @staticmethod
    def init_table():
        """初始化uploaded_games表"""
        create_table_sql = """
        CREATE TABLE IF NOT EXISTS uploaded_games (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36) NOT NULL UNIQUE,
            name VARCHAR(100) NOT NULL,
            name_en VARCHAR(100),
            description TEXT NOT NULL,
            subject VARCHAR(20) NOT NULL,
            icon VARCHAR(10) DEFAULT '🎮',
            difficulty JSON,
            tags JSON,
            uploader_id INT NOT NULL,
            is_public BOOLEAN DEFAULT FALSE,
            visible_to JSON COMMENT '可见班级列表，如["2A","3B"]，空数组=所有班级',
            teacher_only BOOLEAN DEFAULT FALSE COMMENT '仅教师/管理员可见',
            file_size INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            is_deleted BOOLEAN DEFAULT FALSE,

            INDEX idx_subject (subject),
            INDEX idx_uploader (uploader_id),
            INDEX idx_public (is_public),
            INDEX idx_deleted (is_deleted),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='教师上传的游戏'
        """

        # 迁移SQL：为已有表添加新列（兼容所有 MySQL 版本）
        new_columns = {
            'visible_to': "ALTER TABLE uploaded_games ADD COLUMN visible_to JSON COMMENT '可见班级列表' AFTER is_public",
            'teacher_only': "ALTER TABLE uploaded_games ADD COLUMN teacher_only BOOLEAN DEFAULT FALSE COMMENT '仅教师/管理员可见' AFTER visible_to",
        }

        try:
            conn = DatabaseService.get_connection()
            with conn.cursor() as cursor:
                cursor.execute(create_table_sql)

                # 查询已有列，只添加缺失的列
                cursor.execute("SHOW COLUMNS FROM uploaded_games")
                existing_columns = {row['Field'] for row in cursor.fetchall()}

                for col_name, alter_sql in new_columns.items():
                    if col_name not in existing_columns:
                        try:
                            cursor.execute(alter_sql)
                            logger.info(f"✓ 已添加列: {col_name}")
                        except Exception as e:
                            logger.warning(f"添加列 {col_name} 失败: {e}")

            conn.commit()
            conn.close()
            logger.info("✓ uploaded_games 表初始化成功")
        except Exception as e:
            logger.error(f"初始化表失败: {e}")
            raise


# ==================================================================================
#                                   业务逻辑层
# ==================================================================================

class GameUploadService:
    """游戏上传服务"""

    def __init__(self):
        self.upload_dir = GameUploadConfig.UPLOAD_DIR
        self.upload_dir.mkdir(parents=True, exist_ok=True)

    # ==================== 创建游戏 ====================

    async def create_game(
        self,
        user_id: int,
        data: GameCreateRequest,
        file: Optional[UploadFile] = None
    ) -> Dict[str, Any]:
        """
        创建新游戏

        Args:
            user_id: 上传者ID
            data: 游戏信息
            file: 上传的HTML文件（可选，与html_content二选一）

        Returns:
            创建的游戏信息
        """
        # 验证学科（动态从数据库获取）
        valid_subjects = GameUploadConfig.get_subjects()
        if data.subject not in valid_subjects:
            raise HTTPException(400, f"无效的学科: {data.subject}")

        # 获取HTML内容
        html_content = await self._get_html_content(data.html_content, file)

        # 生成UUID
        game_uuid = str(uuid.uuid4())

        # 保存HTML文件
        file_path = self.upload_dir / f"{game_uuid}.html"
        file_size = self._save_html_file(file_path, html_content)

        # 保存到数据库
        try:
            conn = DatabaseService.get_connection()
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO uploaded_games
                    (uuid, name, name_en, description, subject, icon, difficulty, tags, uploader_id, is_public, visible_to, teacher_only, file_size)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    game_uuid,
                    data.name,
                    data.name_en,
                    data.description,
                    data.subject,
                    data.icon,
                    json.dumps(data.difficulty, ensure_ascii=False),
                    json.dumps(data.tags, ensure_ascii=False),
                    user_id,
                    data.is_public,
                    json.dumps(data.visible_to, ensure_ascii=False),
                    data.teacher_only,
                    file_size
                ))
            conn.commit()

            # 获取创建的游戏
            game = self._get_game_by_uuid(conn, game_uuid)
            conn.close()

            logger.info(f"游戏创建成功: {game_uuid} by user {user_id}")
            return game

        except Exception as e:
            # 回滚：删除已保存的文件
            if file_path.exists():
                file_path.unlink()
            logger.error(f"创建游戏失败: {e}")
            raise HTTPException(500, f"创建游戏失败: {str(e)}")

    async def _get_html_content(
        self,
        html_content: Optional[str],
        file: Optional[UploadFile]
    ) -> str:
        """获取HTML内容"""
        if file:
            # 验证文件类型
            ext = Path(file.filename).suffix.lower()
            if ext not in GameUploadConfig.ALLOWED_EXTENSIONS:
                raise HTTPException(400, f"不支持的文件类型: {ext}")

            # 读取文件内容
            content = await file.read()

            # 验证文件大小
            if len(content) > GameUploadConfig.MAX_FILE_SIZE:
                raise HTTPException(400, f"文件大小超过限制 ({GameUploadConfig.MAX_FILE_SIZE // 1024 // 1024}MB)")

            return content.decode('utf-8')

        elif html_content:
            # 验证内容大小
            if len(html_content.encode('utf-8')) > GameUploadConfig.MAX_FILE_SIZE:
                raise HTTPException(400, f"内容大小超过限制 ({GameUploadConfig.MAX_FILE_SIZE // 1024 // 1024}MB)")
            return html_content

        else:
            raise HTTPException(400, "请提供HTML文件或代码内容")

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
            'React.createElement'
        ]

        is_react = any(pattern in content for pattern in react_patterns)

        if not is_react:
            # 不是 React 代码，检查是否是纯 HTML 片段
            if '<' in content and '>' in content:
                # 包装成基本 HTML
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

        # 清理 import 语句（Babel 会处理）
        lines = content.split('\n')
        cleaned_lines = []
        for line in lines:
            # 移除 React/lucide-react 的 import（我们用内联替代）
            if 'from "react"' in line or "from 'react'" in line:
                continue
            if 'from "lucide-react"' in line or "from 'lucide-react'" in line:
                continue
            # 移除 export default 语句（替换为直接渲染）
            if line.strip().startswith('export default'):
                line = line.replace('export default ', '')
            cleaned_lines.append(line)

        cleaned_content = '\n'.join(cleaned_lines)

        # 检测组件名称
        component_name = 'App'
        import re
        match = re.search(r'function\s+([A-Z][a-zA-Z0-9]*)\s*\(', content)
        if match:
            component_name = match.group(1)
        else:
            match = re.search(r'class\s+([A-Z][a-zA-Z0-9]*)\s+extends', content)
            if match:
                component_name = match.group(1)

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
        const {{ useState, useEffect, useRef, useCallback, useMemo, useContext, createContext }} = React;

        // Lucide 圖標替代（使用 Emoji）
        const LucideIcons = {{
            Play: () => <span>▶️</span>,
            Users: () => <span>👥</span>,
            BookOpen: () => <span>📖</span>,
            CheckCircle: () => <span>✅</span>,
            XCircle: () => <span>❌</span>,
            Trophy: () => <span>🏆</span>,
            Gavel: () => <span>⚖️</span>,
            Landmark: () => <span>🏛️</span>,
            Briefcase: () => <span>💼</span>,
            Award: () => <span>🎖️</span>,
            ArrowRight: () => <span>→</span>,
            Timer: () => <span>⏱️</span>,
            Star: () => <span>⭐</span>,
            Heart: () => <span>❤️</span>,
            Settings: () => <span>⚙️</span>,
            Home: () => <span>🏠</span>,
            Search: () => <span>🔍</span>,
            Menu: () => <span>☰</span>,
            X: () => <span>✕</span>,
            Check: () => <span>✓</span>,
            ChevronRight: () => <span>›</span>,
            ChevronLeft: () => <span>‹</span>,
            ChevronDown: () => <span>▼</span>,
            ChevronUp: () => <span>▲</span>,
        }};

        // 讓 lucide-react 的導入可以工作
        const {{ Play, Users, BookOpen, CheckCircle, XCircle, Trophy, Gavel, Landmark, Briefcase, Award, ArrowRight, Timer, Star, Heart, Settings, Home, Search, Menu, X, Check, ChevronRight, ChevronLeft, ChevronDown, ChevronUp }} = LucideIcons;

{cleaned_content}

        // 渲染組件
        const rootElement = document.getElementById('root');
        ReactDOM.render(<{component_name} />, rootElement);
    </script>
</body>
</html>'''

        return wrapped_html

    def _save_html_file(self, file_path: Path, content: str) -> int:
        """保存HTML文件并返回文件大小"""
        # 智能检测并包装 React 代码
        processed_content = self._detect_and_wrap_react(content)

        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(processed_content)
        return file_path.stat().st_size

    # ==================== 查询游戏 ====================

    def get_games(
        self,
        user_id: int,
        user_role: str,
        subject: Optional[str] = None,
        only_mine: bool = False,
        user_class: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        获取游戏列表

        权限规则：
        - 学生：公开 + 非teacher_only + 班级匹配（visible_to 为空则所有班级可见）
        - 教师：公开的 + teacher_only的 + 自己上传的
        - 管理员：全部
        """
        conn = DatabaseService.get_connection()

        try:
            with conn.cursor() as cursor:
                # 构建查询条件
                conditions = ["is_deleted = FALSE"]
                params = []

                # 学科筛选
                if subject and subject != 'all':
                    conditions.append("subject = %s")
                    params.append(subject)

                # 权限筛选
                if user_role == 'student':
                    conditions.append("is_public = TRUE")
                    conditions.append("teacher_only = FALSE")
                elif user_role == 'teacher':
                    if only_mine:
                        conditions.append("uploader_id = %s")
                        params.append(user_id)
                    else:
                        # 教师可以看到：公开的 + teacher_only的 + 自己上传的
                        conditions.append("(is_public = TRUE OR teacher_only = TRUE OR uploader_id = %s)")
                        params.append(user_id)
                # admin 可以看到所有
                elif only_mine:
                    conditions.append("uploader_id = %s")
                    params.append(user_id)

                where_clause = " AND ".join(conditions)

                cursor.execute(f"""
                    SELECT g.*, COALESCE(u.display_name, u.username) as uploader_name
                    FROM uploaded_games g
                    LEFT JOIN users u ON g.uploader_id = u.id
                    WHERE {where_clause}
                    ORDER BY g.created_at DESC
                """, params)

                games = cursor.fetchall()
                formatted = [self._format_game(g) for g in games]

                # 学生端：按班级过滤（在应用层做，因为 visible_to 是 JSON 数组）
                if user_role == 'student' and user_class:
                    formatted = [
                        g for g in formatted
                        if not g.get('visible_to') or user_class in g['visible_to']
                    ]

                return formatted

        finally:
            conn.close()

    def get_game(self, game_uuid: str, user_id: int, user_role: str) -> Dict[str, Any]:
        """获取单个游戏详情"""
        conn = DatabaseService.get_connection()

        try:
            game = self._get_game_by_uuid(conn, game_uuid)

            if not game:
                raise HTTPException(404, "游戏不存在")

            # 权限检查
            if not self._can_access_game(game, user_id, user_role):
                raise HTTPException(403, "无权访问此游戏")

            return game

        finally:
            conn.close()

    def _get_game_by_uuid(self, conn, game_uuid: str) -> Optional[Dict[str, Any]]:
        """根据UUID获取游戏"""
        with conn.cursor() as cursor:
            cursor.execute("""
                SELECT g.*, COALESCE(u.display_name, u.username) as uploader_name
                FROM uploaded_games g
                LEFT JOIN users u ON g.uploader_id = u.id
                WHERE g.uuid = %s AND g.is_deleted = FALSE
            """, (game_uuid,))
            game = cursor.fetchone()
            return self._format_game(game) if game else None

    def _format_game(self, game: Dict) -> Dict[str, Any]:
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
            'updated_at': game['updated_at'].isoformat() if hasattr(game['updated_at'], 'isoformat') else str(game['updated_at'])
        }

    def _can_access_game(self, game: Dict, user_id: int, user_role: str, user_class: Optional[str] = None) -> bool:
        """检查用户是否有权访问游戏"""
        if user_role == 'admin':
            return True
        if game.get('uploader_id') == user_id:
            return True
        # 仅教师可见的游戏
        if game.get('teacher_only'):
            return user_role in ('teacher', 'admin')
        if game.get('is_public'):
            # 学生端需要检查班级限制
            if user_role == 'student':
                visible_to = game.get('visible_to') or []
                if visible_to and user_class and user_class not in visible_to:
                    return False
            return True
        return False

    # ==================== 更新游戏 ====================

    async def update_game(
        self,
        game_uuid: str,
        user_id: int,
        user_role: str,
        data: GameUpdateRequest
    ) -> Dict[str, Any]:
        """更新游戏信息"""
        conn = DatabaseService.get_connection()

        try:
            # 获取原游戏
            game = self._get_game_by_uuid(conn, game_uuid)

            if not game:
                raise HTTPException(404, "游戏不存在")

            # 权限检查：只有上传者或管理员可以修改
            if not self._can_modify_game(game, user_id, user_role):
                raise HTTPException(403, "无权修改此游戏")

            # 构建更新字段
            updates = []
            params = []

            if data.name is not None:
                updates.append("name = %s")
                params.append(data.name)
            if data.name_en is not None:
                updates.append("name_en = %s")
                params.append(data.name_en)
            if data.description is not None:
                updates.append("description = %s")
                params.append(data.description)
            if data.subject is not None:
                valid_subjects = GameUploadConfig.get_subjects()
                if data.subject not in valid_subjects:
                    raise HTTPException(400, f"无效的学科: {data.subject}")
                updates.append("subject = %s")
                params.append(data.subject)
            if data.icon is not None:
                updates.append("icon = %s")
                params.append(data.icon)
            if data.difficulty is not None:
                updates.append("difficulty = %s")
                params.append(json.dumps(data.difficulty, ensure_ascii=False))
            if data.tags is not None:
                updates.append("tags = %s")
                params.append(json.dumps(data.tags, ensure_ascii=False))
            if data.is_public is not None:
                updates.append("is_public = %s")
                params.append(data.is_public)
            if data.visible_to is not None:
                updates.append("visible_to = %s")
                params.append(json.dumps(data.visible_to, ensure_ascii=False))
            if data.teacher_only is not None:
                updates.append("teacher_only = %s")
                params.append(data.teacher_only)

            # 更新HTML内容
            if data.html_content is not None:
                file_path = self.upload_dir / f"{game_uuid}.html"
                file_size = self._save_html_file(file_path, data.html_content)
                updates.append("file_size = %s")
                params.append(file_size)

            if not updates:
                return game

            # 执行更新
            params.append(game_uuid)
            with conn.cursor() as cursor:
                cursor.execute(f"""
                    UPDATE uploaded_games
                    SET {', '.join(updates)}
                    WHERE uuid = %s
                """, params)
            conn.commit()

            # 返回更新后的游戏
            return self._get_game_by_uuid(conn, game_uuid)

        finally:
            conn.close()

    def _can_modify_game(self, game: Dict, user_id: int, user_role: str) -> bool:
        """检查用户是否有权修改游戏"""
        if user_role == 'admin':
            return True
        return game['uploader_id'] == user_id

    # ==================== 删除游戏 ====================

    def delete_game(self, game_uuid: str, user_id: int, user_role: str) -> bool:
        """删除游戏（软删除）"""
        conn = DatabaseService.get_connection()

        try:
            game = self._get_game_by_uuid(conn, game_uuid)

            if not game:
                raise HTTPException(404, "游戏不存在")

            # 权限检查
            if not self._can_modify_game(game, user_id, user_role):
                raise HTTPException(403, "无权删除此游戏")

            # 软删除
            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE uploaded_games
                    SET is_deleted = TRUE
                    WHERE uuid = %s
                """, (game_uuid,))
            conn.commit()

            # 可选：删除文件（这里保留文件，方便恢复）
            # file_path = self.upload_dir / f"{game_uuid}.html"
            # if file_path.exists():
            #     file_path.unlink()

            logger.info(f"游戏删除成功: {game_uuid} by user {user_id}")
            return True

        finally:
            conn.close()

    # ==================== 切换可见性 ====================

    def toggle_visibility(self, game_uuid: str, user_id: int, user_role: str) -> Dict[str, Any]:
        """切换游戏可见性"""
        conn = DatabaseService.get_connection()

        try:
            game = self._get_game_by_uuid(conn, game_uuid)

            if not game:
                raise HTTPException(404, "游戏不存在")

            if not self._can_modify_game(game, user_id, user_role):
                raise HTTPException(403, "无权修改此游戏")

            new_visibility = not game['is_public']

            with conn.cursor() as cursor:
                cursor.execute("""
                    UPDATE uploaded_games
                    SET is_public = %s
                    WHERE uuid = %s
                """, (new_visibility, game_uuid))
            conn.commit()

            game['is_public'] = new_visibility
            return game

        finally:
            conn.close()


# ==================================================================================
#                                   API路由层
# ==================================================================================

# 创建路由器
game_router = APIRouter(prefix="/api/games", tags=["Games"])

# 服务实例
game_service = GameUploadService()


def _extract_user(current_user: Dict) -> Dict:
    """从 get_current_user 依赖中提取 id 和 role"""
    return {
        'id': current_user.get('id', 0),
        'role': current_user.get('role', 'guest'),
        'username': current_user.get('username', '')
    }


@game_router.post("/upload")
async def upload_game(
    name: str = Form(...),
    description: str = Form(...),
    subject: str = Form(...),
    name_en: Optional[str] = Form(None),
    icon: str = Form("🎮"),
    difficulty: str = Form('["中一", "中二", "中三"]'),
    tags: str = Form('[]'),
    is_public: bool = Form(False),
    visible_to: str = Form('[]'),
    teacher_only: bool = Form(False),
    html_content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: Dict = Depends(get_current_user),
):
    """
    上传新游戏

    支持两种方式：
    1. 文件上传：通过 file 参数上传 .html 文件
    2. 代码粘贴：通过 html_content 参数提交 HTML 代码
    """
    user = _extract_user(current_user)
    user_id = user['id']
    user_role = user['role']

    # 权限检查
    if user_role not in ['teacher', 'admin']:
        raise HTTPException(403, "只有教师和管理员可以上传游戏")

    try:
        # 构建请求数据
        data = GameCreateRequest(
            name=name,
            name_en=name_en,
            description=description,
            subject=subject,
            icon=icon,
            difficulty=json.loads(difficulty),
            tags=json.loads(tags),
            is_public=is_public,
            visible_to=json.loads(visible_to),
            teacher_only=teacher_only,
            html_content=html_content
        )

        result = await game_service.create_game(user_id, data, file)

        return {
            "success": True,
            "message": "游戏上传成功",
            "data": result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"上传游戏时发生未捕获的错误: {e}")
        raise HTTPException(500, f"上传失败: {str(e)}")


@game_router.get("/list")
async def list_games(
    subject: Optional[str] = Query(None),
    only_mine: bool = Query(False),
    user_class: Optional[str] = Query(None, description="用户班级，如2A"),
    current_user: Dict = Depends(get_current_user),
):
    """获取游戏列表"""
    user = _extract_user(current_user)
    user_id = user['id']
    user_role = user['role']
    games = game_service.get_games(user_id, user_role, subject, only_mine, user_class)

    return {
        "success": True,
        "data": games,
        "count": len(games)
    }


@game_router.get("/{game_uuid}")
async def get_game(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """获取单个游戏详情"""
    user = _extract_user(current_user)
    game = game_service.get_game(game_uuid, user['id'], user['role'])

    return {
        "success": True,
        "data": game
    }


@game_router.put("/{game_uuid}")
async def update_game(
    game_uuid: str,
    data: GameUpdateRequest,
    current_user: Dict = Depends(get_current_user),
):
    """更新游戏信息"""
    user = _extract_user(current_user)
    if user['role'] not in ['teacher', 'admin']:
        raise HTTPException(403, "只有教师和管理员可以修改游戏")

    result = await game_service.update_game(game_uuid, user['id'], user['role'], data)

    return {
        "success": True,
        "message": "游戏更新成功",
        "data": result
    }


@game_router.delete("/{game_uuid}")
async def delete_game(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """删除游戏"""
    user = _extract_user(current_user)
    if user['role'] not in ['teacher', 'admin']:
        raise HTTPException(403, "只有教师和管理员可以删除游戏")

    game_service.delete_game(game_uuid, user['id'], user['role'])

    return {
        "success": True,
        "message": "游戏删除成功"
    }


@game_router.patch("/{game_uuid}/visibility")
async def toggle_game_visibility(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """切换游戏可见性"""
    user = _extract_user(current_user)
    if user['role'] not in ['teacher', 'admin']:
        raise HTTPException(403, "只有教师和管理员可以修改可见性")

    result = game_service.toggle_visibility(game_uuid, user['id'], user['role'])

    return {
        "success": True,
        "message": f"游戏已{'公开' if result['is_public'] else '设为私有'}",
        "data": result
    }


@game_router.get("/subjects/list")
async def get_subjects():
    """获取学科列表（动态从数据库读取，兜底使用默认配置）"""
    return {
        "success": True,
        "data": GameUploadConfig.get_subjects_with_icons()
    }


# ==================================================================================
#                                   初始化函数
# ==================================================================================

def init_game_upload_system():
    """初始化游戏上传系统"""
    logger.info("初始化游戏上传系统...")

    # 创建数据库表
    DatabaseService.init_table()

    # 确保上传目录存在
    GameUploadConfig.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    logger.info("✓ 游戏上传系统初始化完成")


# 导出
__all__ = ['game_router', 'init_game_upload_system', 'GameUploadService', 'GameUploadConfig']
