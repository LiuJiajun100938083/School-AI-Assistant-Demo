# llm/providers/__init__.py
"""
LLM 提供者抽象層
支持多種 LLM 後端：Ollama、OpenAI-compatible API 等
"""

from .base import BaseLLMProvider
from .ollama import OllamaProvider
from .api_provider import ApiProvider


def get_provider() -> BaseLLMProvider:
    """
    根據配置返回對應的 LLM 提供者。
    use_api=True → ApiProvider (Qwen/DashScope 雲端)
    use_api=False → OllamaProvider (本地)
    """
    from llm.config import LLMConfigManager
    config = LLMConfigManager().config

    if config.use_api:
        return ApiProvider(
            model=config.api_model,
            base_url=config.api_base_url,
            api_key=config.api_key or "",
            temperature=config.temperature,
            top_p=config.top_p,
            timeout=config.timeout,
            max_tokens=config.max_tokens,
        )
    else:
        return OllamaProvider(
            model=config.local_model,
            base_url=config.local_base_url,
            temperature=config.temperature,
            top_p=config.top_p,
            timeout=config.timeout,
            max_tokens=config.max_tokens,
            num_ctx=config.num_ctx,
            num_gpu=config.num_gpu,
            stop_tokens=config.stop_tokens,
        )


__all__ = ['BaseLLMProvider', 'OllamaProvider', 'ApiProvider', 'get_provider']
