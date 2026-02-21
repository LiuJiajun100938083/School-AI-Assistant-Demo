# models.py - 学习模式数据模型
"""
学习模式数据模型：LearningModeConfig, TaskResult
"""

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Any


@dataclass
class LearningModeConfig:
    """学习模式配置"""
    mode_id: str
    name: str
    name_en: str
    icon: str
    description: str
    description_en: str
    subjects: List[str]
    levels: List[str]
    enabled: bool = True
    order: int = 0
    settings: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskResult:
    """任务生成结果"""
    success: bool
    task_id: str
    mode_id: str
    content: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
