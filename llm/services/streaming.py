# llm/services/streaming.py
"""
流式問答服務

提供基於異步生成器的流式問答接口，支持：
- 逐 token 流式輸出
- thinking / answer 實時分離
- 知識庫 RAG 上下文增強
- 完整的錯誤處理

核心函數：
    stream_ai_subject() — 異步生成器，yield StreamEvent
"""

import asyncio
import logging
import traceback
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Callable, AsyncGenerator
from functools import partial

from ..config import get_llm_config, get_current_model
from ..providers.ollama import get_ollama_provider
from ..prompts.templates import apply_thinking_mode
from ..rag.retrieval import get_context_from_knowledge_base
from ..rag.context import (
    extract_temp_docs_from_history,
    build_prompt_context
)
from ..parsers.thinking_parser import (
    StreamEvent,
    clean_special_markers
)

logger = logging.getLogger(__name__)

# RAG 檢索專用線程池
# ChromaDB/SQLite 有單寫鎖，但多個讀取可以並行；
# 獨立線程池避免佔用 asyncio 默認執行器，確保事件循環不被阻塞。
_rag_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="rag")


# ==================== 核心流式接口 ====================


async def stream_ai_subject(
    question: str,
    subject_code: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    task_type: str = "qa",
    enable_thinking: bool = True,
) -> AsyncGenerator[StreamEvent, None]:
    """
    統一學科流式問答入口 — 異步生成器

    完整流程：
    1. 獲取學科 system prompt
    2. RAG 檢索知識庫上下文（在線程池中執行）
    3. 構建完整 prompt + 應用思考模式
    4. 調用 OllamaProvider.async_stream() 逐 token 流式輸出
    5. 逐 token yield StreamEvent（answer 事件）
    6. Ollama /api/chat 自動分離 thinking，content 只含 answer

    Args:
        question: 用戶問題
        subject_code: 學科代碼
        conversation_history: 對話歷史
        model: 指定模型（預留參數）
        task_type: 任務類型（"qa" 問答開啟思考，"summary" 總結關閉思考）
        enable_thinking: 是否開啟深度思考模式（由前端用戶控制）

    Yields:
        StreamEvent: 流式事件（type = "thinking" | "answer" | "done" | "error"）
    """
    if conversation_history is None:
        conversation_history = []

    try:
        # 1. 獲取學科提示詞
        system_prompt = _get_subject_prompt(subject_code)

        # 2. RAG 檢索（同步阻塞操作，放到專用線程池中執行）
        loop = asyncio.get_running_loop()

        kb_context = await loop.run_in_executor(
            _rag_executor,
            partial(get_context_from_knowledge_base, question, subject_code)
        )

        # 3. 提取臨時文檔
        temp_docs = extract_temp_docs_from_history(conversation_history) if conversation_history else ""

        # 防禦性: 確保 RAG 結果不為 None
        kb_context = kb_context or ""
        temp_docs = temp_docs or ""

        # 4. 構建 prompt
        prompt = build_prompt_context(
            question=question,
            system_prompt=system_prompt,
            kb_context=kb_context,
            temp_docs=temp_docs,
            conversation_history=conversation_history
        )

        # 5. 應用思考模式（根據用戶選擇和任務類型決定是否思考）
        if enable_thinking:
            thinking_prompt = apply_thinking_mode(prompt, task_type=task_type)
        else:
            thinking_prompt = apply_thinking_mode(prompt, task_type="no_think")

        # 6. 獲取 LLM 提供者並開始流式生成
        #    async_stream 使用 /api/chat + think 參數，Ollama 自動分離 thinking/answer，
        #    content 中只有 answer，無需 StreamingThinkingParser。
        provider = get_ollama_provider()
        answer_parts = []

        logger.info(f"🔄 開始流式生成: 科目={subject_code}, 思考模式={'開' if enable_thinking else '關'}, 問題={question[:50]}...")

        async for token in provider.async_stream(thinking_prompt, enable_thinking=enable_thinking):
            if token:
                answer_parts.append(token)
                yield StreamEvent(type="answer", content=token)

        raw_answer = "".join(answer_parts)

        # 7. 構建完整的 thinking 元數據（包含知識庫、臨時文檔等）
        full_thinking = _build_full_thinking(
            raw_thinking="",
            temp_docs=temp_docs,
            kb_context=kb_context
        )

        full_answer = clean_special_markers(raw_answer)

        logger.info(
            f"✅ 流式生成完成: thinking={len(full_thinking)}字, answer={len(full_answer)}字"
        )

        # 9. yield 完成事件（攜帶完整內容，用於持久化）
        yield StreamEvent(
            type="done",
            content=f'{{"full_answer": {_json_escape(full_answer)}, '
                    f'"full_thinking": {_json_escape(full_thinking)}}}'
        )

    except Exception as e:
        error_msg = f"流式生成失敗: {str(e)}"
        logger.error(f"❌ {error_msg}\n{traceback.format_exc()}")
        yield StreamEvent(type="error", content=error_msg)


# ==================== 輔助函數 ====================


def _get_subject_prompt(subject_code: str) -> str:
    """獲取學科系統提示詞（優先從數據庫，回退到靜態模板）"""
    try:
        from app.domains.subject.service import SubjectService
        return SubjectService().get_system_prompt(subject_code)
    except Exception:
        from ..prompts.templates import get_subject_system_prompt
        return get_subject_system_prompt(subject_code)


def _build_full_thinking(
    raw_thinking: str,
    temp_docs: str,
    kb_context: str
) -> str:
    """構建完整的 thinking 內容（包含知識庫引用等元數據）"""
    parts = []

    if raw_thinking:
        parts.append(f"【🧠 深度推理】\n{raw_thinking}")
    if temp_docs:
        parts.append(f"【📎 臨時文檔】\n{temp_docs[:500]}...")
    if kb_context:
        parts.append(f"【📚 知識庫】\n{kb_context}")

    return "\n\n".join(parts) if parts else (kb_context or "")


def _json_escape(text: str) -> str:
    """將文本轉義為 JSON 字符串格式"""
    import json
    return json.dumps(text, ensure_ascii=False)


# ==================== 向後兼容（已棄用） ====================


def ask_ai_api_stream(
    question: str,
    subject: str,
    system_prompt: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """
    流式問答 — 回調風格（已棄用）

    保留此函數以向後兼容，新代碼請使用 stream_ai_subject()。
    """
    from .qa_service import ask_ai_local

    try:
        answer, thinking = ask_ai_local(
            question, subject, system_prompt, conversation_history
        )

        if on_reasoning_chunk and thinking:
            on_reasoning_chunk(thinking)

        if on_content_chunk:
            on_content_chunk(answer)

        if on_complete:
            on_complete(answer, thinking)

    except Exception as e:
        logger.error(f"流式問答失敗: {e}")
        if on_error:
            on_error(str(e))


def ask_ai_subject_stream(
    question: str,
    subject_code: str,
    conversation_history: List[Dict] = None,
    model: str = None,
    on_reasoning_chunk: Optional[Callable[[str], None]] = None,
    on_content_chunk: Optional[Callable[[str], None]] = None,
    on_complete: Optional[Callable[[str, str], None]] = None,
    on_error: Optional[Callable[[str], None]] = None
) -> None:
    """
    通用學科流式問答函數（已棄用）

    保留此函數以向後兼容，新代碼請使用 stream_ai_subject()。
    """
    system_prompt = _get_subject_prompt(subject_code)

    ask_ai_api_stream(
        question=question,
        subject=subject_code,
        system_prompt=system_prompt,
        conversation_history=conversation_history,
        model=model,
        on_reasoning_chunk=on_reasoning_chunk,
        on_content_chunk=on_content_chunk,
        on_complete=on_complete,
        on_error=on_error
    )
