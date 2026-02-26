"""
应用模块管理服务
================
管理首页应用卡片的配置，支持按角色过滤、管理员动态控制。
"""

import json
import logging
import os
import threading
from copy import deepcopy
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# 默认应用模块配置
DEFAULT_APP_MODULES: List[Dict[str, Any]] = [
    {
        "id": "ai_chat",
        "name": "AI 學習對話",
        "icon": "💬",
        "description": "一對一AI輔導對話",
        "url": "/chat",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 1,
        "category": "learning",
    },
    {
        "id": "ai_learning_center",
        "name": "AI 學習中心",
        "icon": "🧠",
        "description": "探索AI知識，多維度互動學習體驗",
        "url": "/ai-learning-center",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 2,
        "category": "learning",
    },
    {
        "id": "game_center",
        "name": "遊戲中心",
        "icon": "🎯",
        "description": "按學科分類的教育遊戲",
        "url": "/games",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 2,
        "category": "learning",
    },
    {
        "id": "forum",
        "name": "討論區",
        "icon": "📢",
        "description": "師生互動討論平台",
        "url": "/static/forum/forum.html",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 3,
        "category": "community",
    },
    {
        "id": "student_report",
        "name": "學習分析",
        "icon": "📊",
        "description": "查看學習數據報告",
        "url": "/student-report",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 4,
        "category": "learning",
    },
    {
        "id": "learning_tasks",
        "name": "學習任務",
        "icon": "✅",
        "description": "查看及完成學習任務",
        "url": "/static/learning_tasks.html",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 5,
        "category": "learning",
    },
    {
        "id": "mistake_book",
        "name": "AI 智能錯題本",
        "icon": "📖",
        "description": "拍照上傳錯題、AI分析薄弱點、智能出題練習",
        "url": "/mistake-book",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 6,
        "category": "learning",
    },
    {
        "id": "classroom",
        "name": "課堂教學",
        "icon": "🏫",
        "description": "PPT授課、實時互動課堂",
        "url": "/classroom",
        "roles": ["student", "teacher", "admin"],
        "enabled": True,
        "order": 7,
        "category": "teaching",
    },
    {
        "id": "attendance",
        "name": "早讀/留堂點名",
        "icon": "📋",
        "description": "學生考勤管理系統",
        "url": "/attendance",
        "roles": ["teacher", "admin"],
        "enabled": True,
        "order": 8,
        "category": "teaching",
    },
    {
        "id": "notice",
        "name": "通告生成",
        "icon": "📝",
        "description": "AI智能生成通告文檔",
        "url": "/notice_generator.html",
        "roles": ["teacher", "admin"],
        "enabled": True,
        "order": 9,
        "category": "teaching",
    },
    {
        "id": "mistake_book_teacher",
        "name": "錯題分析(教師)",
        "icon": "📊",
        "description": "查看班級錯題數據與薄弱知識點",
        "url": "/mistake-book/teacher",
        "roles": ["teacher", "admin"],
        "enabled": True,
        "order": 10,
        "category": "teaching",
    },
    {
        "id": "learning_task_admin",
        "name": "任務管理",
        "icon": "📋",
        "description": "創建和管理學習任務",
        "url": "/static/learning_task_admin.html",
        "roles": ["admin"],
        "enabled": True,
        "order": 11,
        "category": "admin",
    },
    {
        "id": "game_upload",
        "name": "上傳遊戲",
        "icon": "📤",
        "description": "上傳自定義HTML遊戲",
        "url": "/game_upload",
        "roles": ["teacher", "admin"],
        "enabled": True,
        "order": 12,
        "category": "teaching",
    },
    {
        "id": "admin_dashboard",
        "name": "管理後台",
        "icon": "⚙️",
        "description": "系統管理與配置",
        "url": "/admin",
        "roles": ["admin"],
        "enabled": True,
        "order": 13,
        "category": "admin",
    },
]


class AppModulesService:
    """应用模块管理服务"""

    def __init__(self, data_dir: str = "data"):
        self._data_dir = data_dir
        self._config_path = os.path.join(data_dir, "app_modules.json")
        self._lock = threading.Lock()
        self._modules: List[Dict[str, Any]] = []
        self._load()

    def _load(self) -> None:
        """从文件加载配置，如不存在则使用默认配置"""
        try:
            if os.path.exists(self._config_path):
                with open(self._config_path, "r", encoding="utf-8") as f:
                    self._modules = json.load(f)
                logger.info("应用模块配置已加载: %s", self._config_path)
            else:
                self._modules = deepcopy(DEFAULT_APP_MODULES)
                self._save()
                logger.info("已创建默认应用模块配置")
        except Exception as e:
            logger.error("加载应用模块配置失败: %s", e)
            self._modules = deepcopy(DEFAULT_APP_MODULES)

    def _save(self) -> None:
        """保存配置到文件"""
        try:
            os.makedirs(self._data_dir, exist_ok=True)
            with open(self._config_path, "w", encoding="utf-8") as f:
                json.dump(self._modules, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.error("保存应用模块配置失败: %s", e)

    def get_modules_for_role(self, role: str) -> List[Dict[str, Any]]:
        """根据用户角色返回可见的应用列表"""
        with self._lock:
            result = []
            for mod in self._modules:
                if mod.get("enabled", True) and role in mod.get("roles", []):
                    result.append(deepcopy(mod))
            result.sort(key=lambda x: x.get("order", 999))
            return result

    def get_all_modules(self) -> List[Dict[str, Any]]:
        """管理员获取全部模块配置"""
        with self._lock:
            modules = deepcopy(self._modules)
            modules.sort(key=lambda x: x.get("order", 999))
            return modules

    def update_modules(self, modules: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """管理员更新模块配置"""
        with self._lock:
            # 验证每个模块的必要字段
            for mod in modules:
                if not mod.get("id") or not mod.get("name"):
                    raise ValueError(f"模块缺少必要字段 id 或 name: {mod}")
                if "roles" not in mod:
                    mod["roles"] = ["student", "teacher", "admin"]
                if "enabled" not in mod:
                    mod["enabled"] = True

            self._modules = deepcopy(modules)
            self._save()
            logger.info("应用模块配置已更新（共 %d 个模块）", len(modules))
            # 直接在锁内返回副本，避免调用 get_all_modules() 导致死锁
            result = deepcopy(self._modules)
            result.sort(key=lambda x: x.get("order", 999))
            return result

    def reset_to_default(self) -> List[Dict[str, Any]]:
        """重置为默认配置"""
        with self._lock:
            self._modules = deepcopy(DEFAULT_APP_MODULES)
            self._save()
            logger.info("应用模块配置已重置为默认值")
            # 直接在锁内返回副本，避免调用 get_all_modules() 导致死锁
            result = deepcopy(self._modules)
            result.sort(key=lambda x: x.get("order", 999))
            return result
