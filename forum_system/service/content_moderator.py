"""
AI 内容审核服务
===============

在学生发布帖子或回复前，调用本地 Ollama LLM 判断内容是否与 AI 相关。
仅允许与 AI、人工智能、机器学习、AI 教育等相关的内容通过审核。
教师和管理员发布内容不受审核限制。
"""

import asyncio
import json
import logging
from typing import Tuple

import httpx

logger = logging.getLogger(__name__)

# 审核提示词
MODERATION_PROMPT = """你是一个学校讨论区的内容审核员。这个讨论区专门用于讨论与 AI（人工智能）相关的话题。

请判断以下内容是否与 AI 相关。AI 相关的话题包括但不限于：
- 人工智能、机器学习、深度学习、神经网络
- AI 工具和应用（如 ChatGPT、Copilot、Midjourney 等）
- AI 在学校和教育中的应用
- 编程和计算机科学（与 AI 相关的）
- 数据科学、自然语言处理、计算机视觉
- AI 伦理和社会影响
- 任何与 AI 技术学习和使用相关的内容

标题：{title}
内容：{content}

请只回答一个词：
- 如果内容与 AI 相关，回答 "APPROVED"
- 如果内容与 AI 无关，回答 "REJECTED"
"""


async def check_content_ai_related(
    title: str,
    content: str,
    timeout: float = 30.0,
) -> Tuple[bool, str]:
    """
    使用 Ollama LLM 判断内容是否与 AI 相关。

    Args:
        title: 帖子标题（帖子审核时提供，回复审核时为空字符串）
        content: 帖子或回复内容

    Returns:
        (approved, reason): approved=True 表示通过, reason 为拒绝原因
    """
    from app.core.ai_gate import ai_gate, Priority, Weight
    from app.config.settings import get_settings

    settings = get_settings()

    # 构建提示词
    prompt = MODERATION_PROMPT.format(
        title=title or "(无标题)",
        content=content[:1000],  # 截取前1000字符，避免过长
    )

    payload = {
        "model": settings.llm_local_model,
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "options": {
            "temperature": 0.1,
            "num_predict": 20,
        },
    }

    try:
        async with ai_gate("forum_moderation", Priority.INTERACTIVE, Weight.CHAT) as client:
            response = await client.post(
                "/api/chat",
                json=payload,
                timeout=timeout,
            )
            response.raise_for_status()
            data = response.json()

        # 解析回复
        reply = data.get("message", {}).get("content", "").strip().upper()

        if "APPROVED" in reply:
            logger.info("内容审核通过: title=%s", title[:50] if title else "(reply)")
            return True, ""
        else:
            reason = "你的内容与 AI 话题无关。本讨论区仅允许发布与人工智能（AI）相关的内容，包括 AI 工具、机器学习、AI 教育等话题。请修改内容后重试。"
            logger.info(
                "内容审核拒绝: title=%s, ai_reply=%s",
                title[:50] if title else "(reply)",
                reply[:100],
            )
            return False, reason

    except httpx.TimeoutException:
        # 审核超时时放行，避免阻塞用户
        logger.warning("内容审核超时，默认放行: title=%s", title[:50] if title else "(reply)")
        return True, ""
    except Exception as e:
        # 审核服务异常时放行
        logger.error("内容审核异常，默认放行: %s", e)
        return True, ""
