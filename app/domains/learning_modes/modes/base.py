# base.py - 学习模式基类
"""
BaseLearningMode ABC - 所有学习模式的抽象基类
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any

from ..models import LearningModeConfig, TaskResult


class BaseLearningMode(ABC):
    """学习模式基类"""

    def __init__(self):
        self.config: LearningModeConfig = self._get_config()

    @abstractmethod
    def _get_config(self) -> LearningModeConfig:
        pass

    @abstractmethod
    def generate_task(self, level: str, subject: str = None, **kwargs) -> TaskResult:
        pass

    @abstractmethod
    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        pass

    def get_info(self) -> Dict[str, Any]:
        return {
            "mode_id": self.config.mode_id,
            "name": self.config.name,
            "name_en": self.config.name_en,
            "icon": self.config.icon,
            "description": self.config.description,
            "description_en": self.config.description_en,
            "subjects": self.config.subjects,
            "levels": self.config.levels,
            "enabled": self.config.enabled,
            "order": self.config.order
        }
