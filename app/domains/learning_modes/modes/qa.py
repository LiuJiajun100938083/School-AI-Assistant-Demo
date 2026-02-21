# qa.py - 问答学习模式
"""
QAMode - AI问答学习模式
"""

from datetime import datetime
from typing import Dict, Any

from ..models import LearningModeConfig, TaskResult
from .base import BaseLearningMode


class QAMode(BaseLearningMode):
    """问答学习模式"""

    def _get_config(self) -> LearningModeConfig:
        return LearningModeConfig(
            mode_id="qa",
            name="AI 問答",
            name_en="AI Q&A",
            icon="💬",
            description="向AI提問，獲取學科知識解答",
            description_en="Ask AI questions about your subjects",
            subjects=["all"],
            levels=["S1", "S2", "S3", "S4", "S5", "S6"],
            enabled=True,
            order=1
        )

    def generate_task(self, level: str, subject: str = None, **kwargs) -> TaskResult:
        return TaskResult(
            success=True,
            task_id=f"qa_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            mode_id="qa",
            content={"type": "welcome", "message": "歡迎使用AI問答！"}
        )

    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        return {"evaluated": False}
