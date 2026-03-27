# llm/services/qa_service.py
"""
核心問答服務
提供統一的 LLM 問答接口
"""

import logging
from typing import List, Dict, Tuple, Optional

from ..config import get_llm_config, get_current_model, get_base_url
from ..providers import get_provider
from ..prompts.templates import apply_thinking_mode
from ..rag.retrieval import get_context_from_knowledge_base
from ..rag.context import (
    extract_temp_docs_from_history,
    build_prompt_context
)
from ..parsers.thinking_parser import parse_llm_response

logger = logging.getLogger(__name__)


def ask_ai_local(
    question: str,
    subject: str,
    system_prompt: str,
    conversation_history: List[Dict] = None,
    task_type: str = "qa"
) -> Tuple[str, str]:
    """
    本地模型問答 - 使用 Ollama

    Args:
        question: 用戶問題
        subject: 學科代碼
        system_prompt: 系統提示詞
        conversation_history: 對話歷史
        task_type: 任務類型（"qa" 問答開啟思考，"summary" 總結關閉思考）

    Returns:
        (answer, thinking) 元組
    """
    if conversation_history is None:
        conversation_history = []

    config = get_llm_config()
    logger.info(f"🤖 使用本地模型: {config.local_model}, 任務類型: {task_type}")

    # 獲取知識庫上下文
    kb_context = get_context_from_knowledge_base(question, subject)

    # 檢查臨時文檔
    temp_docs = extract_temp_docs_from_history(conversation_history) if conversation_history else ""

    # 構建 prompt
    prompt = build_prompt_context(
        question=question,
        system_prompt=system_prompt,
        kb_context=kb_context,
        temp_docs=temp_docs,
        conversation_history=conversation_history
    )

    try:
        # 獲取 LLM 提供者
        provider = get_provider()

        # summary 模式（如抄襲分析）用低 temperature 提高一致性
        original_temp = None
        if task_type == "summary":
            original_temp = provider.temperature
            provider.temperature = 0.1

        # 應用思考模式（根據任務類型決定是否思考）
        thinking_prompt = apply_thinking_mode(prompt, task_type=task_type)
        response = provider.invoke(thinking_prompt)

        # 恢復 temperature
        if original_temp is not None:
            provider.temperature = original_temp

        # 解析響應
        answer, thinking = parse_llm_response(response)

        # 構建完整 thinking
        thinking_parts = []
        if thinking:
            thinking_parts.append(f"【🧠 深度推理】\n{thinking}")
        if temp_docs:
            thinking_parts.append(f"【📎 臨時文檔】\n{temp_docs[:500]}...")
        if kb_context:
            thinking_parts.append(f"【📚 知識庫】\n{kb_context}")

        full_thinking = "\n\n".join(thinking_parts) if thinking_parts else kb_context

        return answer, full_thinking

    except Exception as e:
        error_msg = f"❌ 本地模型處理失敗: {str(e)}"
        logger.error(error_msg)
        return error_msg, kb_context


def ask_ai_api(
    question: str,
    subject: str,
    system_prompt: str,
    conversation_history: List[Dict] = None,
    model: str = None
) -> Tuple[str, str]:
    """
    API 模式問答 - 預留接口

    當前實現轉發到本地模型，將來可接入網絡 API。

    Args:
        question: 用戶問題
        subject: 學科代碼
        system_prompt: 系統提示詞
        conversation_history: 對話歷史
        model: 指定模型（預留參數）

    Returns:
        (answer, thinking) 元組
    """
    # TODO: 將來在此處實現真正的 API 調用
    logger.info("📡 API 模式暫未啟用，使用本地模型")
    return ask_ai_local(question, subject, system_prompt, conversation_history)


def ask_ai_subject(
    question: str,
    subject_code: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None,
    task_type: str = "qa"
) -> Tuple[str, str]:
    """
    統一學科問答入口

    Args:
        question: 用戶問題
        subject_code: 學科代碼
        use_api: 是否使用 API 模式（預留參數）
        conversation_history: 對話歷史
        model: 指定模型（預留參數）
        task_type: 任務類型（"qa" 問答開啟思考，"summary" 總結關閉思考）

    Returns:
        (answer, thinking) 元組
    """
    # 獲取學科提示詞（優先從數據庫，回退到靜態模板）
    try:
        from app.domains.subject.service import SubjectService
        system_prompt = SubjectService().get_system_prompt(subject_code)
    except Exception:
        from ..prompts.templates import get_subject_system_prompt
        system_prompt = get_subject_system_prompt(subject_code)

    # 根據配置決定使用 API 還是本地
    config = get_llm_config()
    if config.use_api and use_api:
        return ask_ai_api(question, subject_code, system_prompt, conversation_history, model)
    else:
        return ask_ai_local(question, subject_code, system_prompt, conversation_history, task_type=task_type)


def ask_ai_generic(
    question: str,
    subject: str,
    system_prompt: str,
    use_api: bool = False,
    conversation_history: List[Dict] = None,
    model: str = None,
    task_type: str = "qa"
) -> Tuple[str, str]:
    """
    通用問答函數（兼容舊接口）

    Args:
        question: 用戶問題
        subject: 學科代碼
        system_prompt: 系統提示詞
        use_api: 是否使用 API 模式
        conversation_history: 對話歷史
        model: 指定模型
        task_type: 任務類型（"qa" 問答開啟思考，"summary" 總結關閉思考）

    Returns:
        (answer, thinking) 元組
    """
    logger.info(f"🤖 處理問答請求: 科目={subject}, 模式={'API' if use_api else '本地'}, 任務類型={task_type}")

    config = get_llm_config()
    if use_api and config.use_api:
        return ask_ai_api(question, subject, system_prompt, conversation_history, model)
    else:
        return ask_ai_local(question, subject, system_prompt, conversation_history, task_type=task_type)
