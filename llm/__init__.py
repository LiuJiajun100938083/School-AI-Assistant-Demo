# llm/__init__.py
"""
LLM 模組 - 統一的大語言模型服務層

模組結構:
- config: LLM 配置管理
- providers: LLM 提供者抽象層 (Ollama, OpenAI-compatible)
- prompts: 提示詞模板管理
- rag: RAG 檢索增強功能
- parsers: 響應解析器
- services: 高級問答服務
"""

from .config import (
    LLMConfig,
    get_llm_config,
    get_current_model,
    get_base_url,
    is_using_api,
    llm_config_manager
)

from .services.qa_service import (
    ask_ai_subject,
    ask_ai_local,
    ask_ai_api,
    ask_ai_generic
)

from .services.streaming import (
    stream_ai_subject,
    ask_ai_subject_stream,
    ask_ai_api_stream
)

from .parsers.thinking_parser import StreamEvent

# 學科便捷函數
from .services.subject_shortcuts import (
    ask_ai_ict,
    ask_ai_ces,
    ask_ai_history,
    ask_ai_chinese,
    ask_ai_english,
    ask_ai_math,
    ask_ai_physics,
    ask_ai_chemistry,
    ask_ai_biology,
    ask_ai_science,
    ask_ai_economics,
    ask_ai_geography,
    ask_ai_visual_arts,
    # 流式版本
    ask_ai_ict_stream,
    ask_ai_ces_stream,
    ask_ai_history_stream,
    ask_ai_chinese_stream,
    ask_ai_english_stream,
    ask_ai_math_stream,
    # 兼容舊版本
    ask_ai,
    # 學科別名
    SUBJECT_ALIASES,
    normalize_subject_code
)

__all__ = [
    # 配置
    'LLMConfig',
    'get_llm_config',
    'get_current_model',
    'get_base_url',
    'is_using_api',
    'llm_config_manager',
    # 核心問答
    'ask_ai_subject',
    'ask_ai_local',
    'ask_ai_api',
    'ask_ai_generic',
    # 流式問答（新）
    'stream_ai_subject',
    'StreamEvent',
    # 流式問答（已棄用，向後兼容）
    'ask_ai_subject_stream',
    'ask_ai_api_stream',
    # 學科便捷函數
    'ask_ai_ict',
    'ask_ai_ces',
    'ask_ai_history',
    'ask_ai_chinese',
    'ask_ai_english',
    'ask_ai_math',
    'ask_ai_physics',
    'ask_ai_chemistry',
    'ask_ai_biology',
    'ask_ai_science',
    'ask_ai_economics',
    'ask_ai_geography',
    'ask_ai_visual_arts',
    'ask_ai_ict_stream',
    'ask_ai_ces_stream',
    'ask_ai_history_stream',
    'ask_ai_chinese_stream',
    'ask_ai_english_stream',
    'ask_ai_math_stream',
    'ask_ai',
    'SUBJECT_ALIASES',
    'normalize_subject_code',
]
