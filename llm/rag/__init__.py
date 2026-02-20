# llm/rag/__init__.py
"""
RAG (Retrieval-Augmented Generation) 模組
處理知識庫檢索和上下文構建
"""

from .retrieval import (
    get_context_from_knowledge_base,
    filter_docs_by_subject,
    fetch_with_neighbors
)

from .context import (
    extract_temp_docs_from_history,
    format_conversation_history,
    build_prompt_context
)

__all__ = [
    'get_context_from_knowledge_base',
    'filter_docs_by_subject',
    'fetch_with_neighbors',
    'extract_temp_docs_from_history',
    'format_conversation_history',
    'build_prompt_context'
]
