# llm/rag/context.py
"""
對話上下文構建功能
"""

import logging
from typing import List, Dict, Optional

logger = logging.getLogger(__name__)


def extract_temp_docs_from_history(conversation_history: List[Dict]) -> str:
    """從對話歷史中提取臨時文檔內容"""
    if not conversation_history:
        return ""

    for msg in conversation_history:
        content = msg.get('content') or ''
        if msg.get('role') == 'system' and '【當前對話中的臨時文檔】' in content:
            logger.debug(f"📎 發現臨時文檔上下文，長度: {len(content)} 字符")
            return content
    return ""


def format_conversation_history(
    conversation_history: List[Dict],
    max_turns: int = 6
) -> str:
    """
    將對話歷史格式化為本地 LLM 能理解的文本格式

    Args:
        conversation_history: 對話歷史列表
        max_turns: 最大對話輪數

    Returns:
        格式化的對話歷史字符串
    """
    if not conversation_history:
        return ""

    history_text = "\n\n【對話歷史】\n"
    for i, msg in enumerate(conversation_history[-max_turns:], 1):
        role = msg.get('role', '')
        content = msg.get('content', '')

        if role == 'user':
            history_text += f"學生問題{i}: {content}\n"
        elif role == 'assistant':
            history_text += f"AI回答{i}: {content}\n"

    history_text += "\n基於以上對話歷史，請回答新的問題："
    return history_text


def build_prompt_context(
    question: str,
    system_prompt: str,
    kb_context: str = "",
    temp_docs: str = "",
    conversation_history: List[Dict] = None,
    max_context_length: int = 3000
) -> str:
    """
    構建完整的提示詞上下文

    Args:
        question: 用戶問題
        system_prompt: 系統提示詞
        kb_context: 知識庫上下文
        temp_docs: 臨時文檔內容
        conversation_history: 對話歷史
        max_context_length: 最大上下文長度

    Returns:
        完整的提示詞
    """
    prompt_parts = []

    # 系統提示
    if system_prompt:
        prompt_parts.append(f"【系統提示】\n{system_prompt}")

    # 臨時文檔
    if temp_docs:
        truncated_docs = temp_docs[:max_context_length]
        prompt_parts.append(f"【臨時文檔】\n{truncated_docs}")

    # 知識庫上下文
    if kb_context and not kb_context.startswith("[知識庫"):
        truncated_kb = kb_context[:max_context_length]
        prompt_parts.append(f"【知識庫】\n{truncated_kb}")

    # 對話歷史
    if conversation_history:
        history_text = format_conversation_history(conversation_history)
        if history_text:
            prompt_parts.append(history_text)

    # 當前問題
    prompt_parts.append(f"【當前問題】\n{question}")
    prompt_parts.append(
        "\n請基於以上信息回答。"
        "回答要簡潔清晰，不要重複對話歷史中已說過的內容。"
        "如果學生說「繼續」，請接著上一條回答的內容繼續。"
    )

    return "\n\n".join(prompt_parts)


def convert_to_api_messages(
    conversation_history: List[Dict],
    system_prompt: str,
    current_question: str,
    kb_context: str = "",
    temp_docs: str = ""
) -> List[Dict]:
    """
    將對話歷史轉換為 API 格式的消息列表

    Args:
        conversation_history: 對話歷史
        system_prompt: 系統提示詞
        current_question: 當前問題
        kb_context: 知識庫上下文
        temp_docs: 臨時文檔內容

    Returns:
        API 格式的消息列表
    """
    messages = [{"role": "system", "content": system_prompt}]

    # 添加對話歷史
    if conversation_history:
        for msg in conversation_history:
            role = msg.get('role', '')
            content = msg.get('content', '')

            if role == 'user':
                messages.append({"role": "user", "content": content})
            elif role == 'assistant':
                messages.append({"role": "assistant", "content": content})

    # 構建當前問題（包含上下文）
    context_parts = []
    if temp_docs:
        context_parts.append(f"【臨時上傳的文檔內容】\n{temp_docs}")
    if kb_context and not kb_context.startswith("[知識庫"):
        context_parts.append(f"【知識庫相關資料】\n{kb_context}")

    if context_parts:
        current_content = (
            "\n\n".join(context_parts) +
            f"\n\n【用戶問題】\n{current_question}\n\n請根據以上資料回答問題。"
        )
    else:
        current_content = (
            f"【用戶問題】\n{current_question}\n\n"
            "注意：知識庫中暫無相關資料，請基於你的通用知識回答。"
        )

    messages.append({"role": "user", "content": current_content})
    return messages
