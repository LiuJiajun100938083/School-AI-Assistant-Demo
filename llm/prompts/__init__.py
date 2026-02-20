# llm/prompts/__init__.py
"""
提示詞模板管理
支持從配置文件或數據庫加載提示詞
"""

from .templates import (
    get_subject_system_prompt,
    get_thinking_prefix,
    apply_thinking_mode,
    DEFAULT_PROMPTS
)

__all__ = [
    'get_subject_system_prompt',
    'get_thinking_prefix',
    'apply_thinking_mode',
    'DEFAULT_PROMPTS'
]
