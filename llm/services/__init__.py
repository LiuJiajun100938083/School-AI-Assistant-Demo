# llm/services/__init__.py
"""
高級問答服務層
提供統一的問答接口
"""

from .qa_service import (
    ask_ai_subject,
    ask_ai_local,
    ask_ai_api,
    ask_ai_generic
)

from .streaming import (
    stream_ai_subject,
    ask_ai_subject_stream,
    ask_ai_api_stream
)

from .subject_shortcuts import (
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
    ask_ai_ict_stream,
    ask_ai_ces_stream,
    ask_ai_history_stream,
    ask_ai_chinese_stream,
    ask_ai_english_stream,
    ask_ai_math_stream,
    ask_ai,
    SUBJECT_ALIASES,
    normalize_subject_code
)

__all__ = [
    # 核心服務
    'ask_ai_subject',
    'ask_ai_local',
    'ask_ai_api',
    'ask_ai_generic',
    # 流式服務（新）
    'stream_ai_subject',
    # 流式服務（已棄用，向後兼容）
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
