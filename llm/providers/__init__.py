# llm/providers/__init__.py
"""
LLM 提供者抽象層
支持多種 LLM 後端：Ollama、OpenAI-compatible API 等
"""

from .base import BaseLLMProvider
from .ollama import OllamaProvider

__all__ = ['BaseLLMProvider', 'OllamaProvider']
