# service.py - 学习模式管理服务
"""
LearningModeManager（单例）和所有便捷函数

便捷函数:
- get_available_modes()
- generate_writing_task()
- get_all_writing_tasks()
- get_writing_guidance()
- get_writing_feedback()
- get_chinese_games()
- get_chinese_categories()
- generate_chinese_task()
- get_chinese_scaffold()
- get_chinese_feedback()
"""

import logging
from typing import Dict, List, Optional, Any

from .models import LearningModeConfig, TaskResult
from .modes.base import BaseLearningMode
from .modes.qa import QAMode
from .modes.english_writing import EnglishWritingMode
from .modes.chinese_training import ChineseTrainingMode

logger = logging.getLogger(__name__)


# ==================== 学习模式管理器 ====================

class LearningModeManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._modes: Dict[str, BaseLearningMode] = {}
        self._initialized = True
        self._register_default_modes()
        logger.info(f"✅ LearningModeManager initialized with {len(self._modes)} modes")

    def _register_default_modes(self):
        for mode in [QAMode(), EnglishWritingMode(), ChineseTrainingMode()]:
            self.register_mode(mode)

    def register_mode(self, mode: BaseLearningMode) -> bool:
        self._modes[mode.config.mode_id] = mode
        return True

    def get_mode(self, mode_id: str) -> Optional[BaseLearningMode]:
        return self._modes.get(mode_id)

    def get_all_modes(self, include_disabled: bool = False) -> List[Dict]:
        modes = [m.get_info() for m in self._modes.values() if include_disabled or m.config.enabled]
        return sorted(modes, key=lambda x: x.get("order", 999))

    def get_enabled_modes(self) -> List[Dict]:
        return self.get_all_modes(False)

    def generate_task(self, mode_id: str, level: str, **kwargs) -> TaskResult:
        mode = self.get_mode(mode_id)
        if not mode:
            return TaskResult(success=False, task_id="", mode_id=mode_id, content={}, error="Mode not found")
        return mode.generate_task(level, **kwargs)


# 全局实例
learning_mode_manager = LearningModeManager()


# ==================== 便捷函数 ====================

def get_available_modes() -> List[Dict]:
    return learning_mode_manager.get_enabled_modes()


def generate_writing_task(level: str, task_type: str = None) -> TaskResult:
    return learning_mode_manager.generate_task("english_writing", level, task_type=task_type)


def get_all_writing_tasks(level: str) -> List[Dict]:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_all_tasks_for_level(level) if isinstance(mode, EnglishWritingMode) else []


def get_writing_guidance(student_text: str, level: str, guidance_type: str = "general",
                         task_context: str = None) -> Dict:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_guidance(student_text, level, guidance_type, task_context) if isinstance(mode,
                                                                                             EnglishWritingMode) else {
        "success": False}


def get_writing_feedback(student_text: str, level: str, task_topic: str = None, task_instructions: str = None) -> Dict:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_feedback(student_text, level, task_topic, task_instructions) if isinstance(mode,
                                                                                               EnglishWritingMode) else {
        "success": False}


# ==================== 中文训练便捷函数 ====================

def get_chinese_games() -> List[Dict]:
    """获取所有中文游戏"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_all_games() if isinstance(mode, ChineseTrainingMode) else []


def get_chinese_categories() -> List[Dict]:
    """获取中文游戏类别"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_categories() if isinstance(mode, ChineseTrainingMode) else []


def generate_chinese_task(game_id: str, level: str, difficulty: int = 1,
                          topic_domain: str = "daily_life") -> TaskResult:
    """生成中文游戏任务"""
    return learning_mode_manager.generate_task(
        "chinese_training", level,
        game_id=game_id, difficulty=difficulty, topic_domain=topic_domain
    )


def get_chinese_scaffold(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict:
    """获取中文训练引导"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_scaffold(game_id, level, student_text, task_materials) if isinstance(mode,
                                                                                         ChineseTrainingMode) else {
        "success": False}


def get_chinese_feedback(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict:
    """获取中文训练反馈"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_feedback(game_id, level, student_text, task_materials) if isinstance(mode,
                                                                                         ChineseTrainingMode) else {
        "success": False}
