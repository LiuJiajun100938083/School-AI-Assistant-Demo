"""
对话服务层 - ChatService
========================
负责所有 AI 对话相关业务逻辑：
- 对话管理（创建、加载、删除）
- AI 问答（RAG 检索 + LLM 生成）
- 流式响应（SSE token-by-token 输出）
- 学习总结生成（思维导图）
- 消息持久化
"""

import asyncio
import json
import logging
import uuid
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    LLMServiceError,
    NotFoundError,
    ValidationError,
)
from app.domains.chat.repository import ConversationRepository, MessageRepository

logger = logging.getLogger(__name__)

# 默认历史消息数量限制（用于 LLM 上下文）
DEFAULT_HISTORY_LIMIT = 20
# 最小消息数才可生成总结
MIN_MESSAGES_FOR_SUMMARY = 2


class ChatService:
    """
    对话服务 - 管理 AI 对话的完整生命周期

    职责:
    1. 对话 CRUD（创建、加载、列表、删除）
    2. 消息管理（保存、加载、去重）
    3. AI 对话（调用 RAG 链 + LLM，非流式 / 流式）
    4. 学习总结（LLM 生成摘要 + 思维导图）
    5. 对话统计（按学科、按用户统计）
    """

    def __init__(
        self,
        conversation_repo: Optional[ConversationRepository] = None,
        message_repo: Optional[MessageRepository] = None,
        settings: Optional[Settings] = None,
    ):
        self._conv_repo = conversation_repo or ConversationRepository()
        self._msg_repo = message_repo or MessageRepository()
        self._settings = settings or get_settings()

        # LLM/RAG 相关依赖 - 通过方法延迟加载，避免循环导入
        self._ask_ai_func = None
        self._ask_ai_stream_func = None
        self._vector_search_func = None

    # ------------------------------------------------------------------ #
    #                     外部依赖注入                                     #
    # ------------------------------------------------------------------ #

    def set_ai_functions(
        self,
        ask_ai: Callable = None,
        ask_ai_stream: Callable = None,
        vector_search: Callable = None,
    ):
        """
        注入 AI 相关函数（避免循环导入）

        调用方式:
            chat_service.set_ai_functions(
                ask_ai=rag_chain.ask_ai_subject,
                ask_ai_stream=rag_chain.ask_ai_subject_stream,
                vector_search=vector_store.search_documents,
            )
        """
        if ask_ai:
            self._ask_ai_func = ask_ai
        if ask_ai_stream:
            self._ask_ai_stream_func = ask_ai_stream
        if vector_search:
            self._vector_search_func = vector_search

    # ------------------------------------------------------------------ #
    #                     对话管理                                         #
    # ------------------------------------------------------------------ #

    def get_conversations(
        self,
        username: str,
        include_deleted: bool = False,
    ) -> List[Dict[str, Any]]:
        """获取用户的对话列表"""
        return self._conv_repo.get_user_conversations(username, include_deleted)

    def get_conversation(
        self,
        username: str,
        conversation_id: str,
    ) -> Dict[str, Any]:
        """
        获取单个对话及其消息

        Raises:
            NotFoundError: 对话不存在
        """
        conv = self._conv_repo.get_conversation(username, conversation_id)
        if not conv:
            raise NotFoundError("对话", conversation_id)

        messages = self._msg_repo.get_conversation_messages(conversation_id)
        conv["messages"] = messages
        return conv

    def create_conversation(
        self,
        username: str,
        title: str = "",
        subject: str = "",
        conversation_id: str = None,
        assignment_id: int = None,
    ) -> Dict[str, Any]:
        """
        创建新对话

        Args:
            username: 用户名
            title: 对话标题（空则自动生成）
            subject: 学科代码
            conversation_id: 可选自定义 ID
            assignment_id: 可选作业 ID（作业 AI 问答时绑定）

        Returns:
            dict: 新对话信息
        """
        if not conversation_id:
            conversation_id = str(uuid.uuid4())

        if not title:
            now = datetime.now().strftime("%Y-%m-%d %H:%M")
            title = f"新对话 {now}"

        self._conv_repo.create_conversation(
            username=username,
            conversation_id=conversation_id,
            title=title,
            subject=subject,
            assignment_id=assignment_id,
        )

        return {
            "conversation_id": conversation_id,
            "title": title,
            "subject": subject,
            "created_at": datetime.now().isoformat(),
        }

    def delete_conversation(
        self,
        username: str,
        conversation_id: str,
        soft: bool = True,
    ) -> bool:
        """
        删除对话

        Args:
            soft: True 为软删除（标记 is_deleted），False 为物理删除

        Raises:
            NotFoundError: 对话不存在
        """
        conv = self._conv_repo.get_conversation(username, conversation_id)
        if not conv:
            raise NotFoundError("对话", conversation_id)

        self._conv_repo.delete_conversation(username, conversation_id, soft)
        logger.info("对话已删除: %s (user=%s, soft=%s)",
                     conversation_id, username, soft)
        return True

    def get_conversation_stats(self, username: str) -> Dict[str, Any]:
        """
        获取用户的对话统计

        Returns:
            dict: {total, subjects, messages, ...}
        """
        return self._conv_repo.get_conversation_stats(username)

    def get_subject_distribution(self, username: str) -> List[Dict[str, Any]]:
        """获取学科分布统计"""
        return self._conv_repo.get_subject_distribution(username)

    # ------------------------------------------------------------------ #
    #                     AI 对话（非流式）                                 #
    # ------------------------------------------------------------------ #

    def chat(
        self,
        username: str,
        question: str,
        conversation_id: str = None,
        subject: str = "",
        model: str = None,
        use_api: bool = False,
    ) -> Dict[str, Any]:
        """
        非流式 AI 对话

        Args:
            username: 用户名
            question: 用户问题
            conversation_id: 对话 ID（None 则自动创建）
            subject: 学科代码
            model: 指定模型（None 使用默认）
            use_api: 是否使用远程 API

        Returns:
            dict: {
                "answer": str,
                "thinking": str,
                "conversation_id": str,
                "model_used": str,
                "timestamp": str,
            }

        Raises:
            LLMServiceError: AI 服务调用失败
        """
        if not self._ask_ai_func:
            raise LLMServiceError("AI 服务未初始化，请调用 set_ai_functions()")

        # 1) 自动创建对话
        if not conversation_id:
            conv = self.create_conversation(username, subject=subject)
            conversation_id = conv["conversation_id"]
        else:
            # 对话已存在，仅更新 updated_at（不覆盖用户设定的标题）
            self._conv_repo.update(
                {"updated_at": datetime.now()},
                "conversation_id = %s",
                (conversation_id,),
            )

        # 2) 保存用户消息
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._msg_repo.save_message(
            conversation_id=conversation_id,
            role="user",
            content=question,
            timestamp=timestamp,
        )

        # 3) 加载对话历史
        history = self._msg_repo.get_conversation_history(
            conversation_id, limit=DEFAULT_HISTORY_LIMIT,
        )
        conversation_history = self._format_history_for_llm(history)

        # 4) 调用 AI（RAG + LLM）
        try:
            model_used = model or self._settings.llm_local_model
            answer, thinking = self._ask_ai_func(
                question=question,
                subject_code=subject,
                use_api=use_api,
                conversation_history=conversation_history,
                model=model_used,
            )
        except Exception as e:
            logger.error("AI 服务调用失败: %s", e)
            raise LLMServiceError(f"AI 服务调用失败: {e}") from e

        # 5) 保存 AI 回复
        ai_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        self._msg_repo.save_message_and_update_conversation(
            conversation_id=conversation_id,
            role="assistant",
            content=answer,
            thinking=thinking or "",
            model_used=model_used,
            timestamp=ai_timestamp,
        )

        return {
            "answer": answer,
            "thinking": thinking or "",
            "conversation_id": conversation_id,
            "model_used": model_used,
            "timestamp": ai_timestamp,
        }

    # ------------------------------------------------------------------ #
    #                     AI 对话（流式 SSE）                               #
    # ------------------------------------------------------------------ #

    async def chat_stream(
        self,
        username: str,
        question: str,
        conversation_id: str = None,
        subject: str = "",
        model: str = None,
        use_api: bool = False,
        enable_thinking: bool = True,
        assignment_id: int = None,
    ) -> AsyncGenerator[str, None]:
        """
        流式 AI 对话 - 返回 SSE 事件流

        Yields:
            str: SSE 格式的事件字符串
                 event: meta      data: {"conversation_id": ..., "model": ...}
                 event: thinking  data: {"content": "..."}
                 event: answer    data: {"content": "..."}
                 event: done      data: {"full_answer": "...", "thinking": "..."}
                 event: error     data: {"message": "..."}
        """
        if not self._ask_ai_stream_func:
            yield self._sse_event("error", {"message": "AI 流式服务未初始化"})
            return

        # 1) 自动创建对话
        if not conversation_id:
            conv = self.create_conversation(
                username, subject=subject, assignment_id=assignment_id
            )
            conversation_id = conv["conversation_id"]
        else:
            # 对话已存在，仅更新 updated_at（不覆盖用户设定的标题）
            self._conv_repo.update(
                {"updated_at": datetime.now()},
                "conversation_id = %s",
                (conversation_id,),
            )

        model_used = model or self._settings.llm_local_model

        # 2) 发送 meta 事件
        yield self._sse_event("meta", {
            "conversation_id": conversation_id,
            "model": model_used,
        })

        # 3) 保存用户消息（异步执行，不阻塞流）
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            self._msg_repo.save_message,
            conversation_id, "user", question, None, None, timestamp,
        )

        # 4) 加载历史
        history = await loop.run_in_executor(
            None,
            self._msg_repo.get_conversation_history,
            conversation_id, DEFAULT_HISTORY_LIMIT,
        )
        conversation_history = self._format_history_for_llm(history)

        # 5) 流式调用 AI
        full_answer = []
        full_thinking = []

        try:
            stream = self._ask_ai_stream_func(
                question=question,
                subject_code=subject,
                conversation_history=conversation_history,
                model=model_used,
                enable_thinking=enable_thinking,
            )

            # 支持 async generator (stream_ai_subject) 和 sync generator
            if hasattr(stream, '__aiter__'):
                async for event in stream:
                    # 支持 StreamEvent 对象（有 .type/.content 属性）和元组
                    if hasattr(event, 'type'):
                        chunk_type, chunk_content = event.type, event.content
                    else:
                        chunk_type, chunk_content = event

                    if chunk_type == "queue":
                        # 排队事件：content 为 JSON 字符串，解析后透传
                        import json as _json
                        yield self._sse_event("queue", _json.loads(chunk_content))
                    elif chunk_type == "thinking":
                        full_thinking.append(chunk_content)
                        yield self._sse_event("thinking", {"content": chunk_content})
                    elif chunk_type == "answer":
                        full_answer.append(chunk_content)
                        yield self._sse_event("answer", {"content": chunk_content})
                    elif chunk_type == "error":
                        yield self._sse_event("error", {"message": chunk_content})
                        return
                    # "done" 事件由 stream_ai_subject 发送，这里忽略（我们自己构建 done）
            else:
                for event in stream:
                    if hasattr(event, 'type'):
                        chunk_type, chunk_content = event.type, event.content
                    else:
                        chunk_type, chunk_content = event

                    if chunk_type == "thinking":
                        full_thinking.append(chunk_content)
                        yield self._sse_event("thinking", {"content": chunk_content})
                    elif chunk_type == "answer":
                        full_answer.append(chunk_content)
                        yield self._sse_event("answer", {"content": chunk_content})
                    elif chunk_type == "error":
                        yield self._sse_event("error", {"message": chunk_content})
                        return

        except Exception as e:
            logger.error("流式 AI 调用失败: %s", e)
            yield self._sse_event("error", {"message": f"AI 服务错误: {e}"})
            return

        # 6) 保存 AI 回复
        answer_text = "".join(full_answer)
        thinking_text = "".join(full_thinking)
        ai_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        await loop.run_in_executor(
            None,
            self._msg_repo.save_message_and_update_conversation,
            conversation_id, "assistant", answer_text,
            thinking_text, model_used, ai_timestamp,
        )

        # 7) 发送完成事件
        yield self._sse_event("done", {
            "full_answer": answer_text,
            "thinking": thinking_text,
            "conversation_id": conversation_id,
        })

    # ------------------------------------------------------------------ #
    #                     学习总结                                         #
    # ------------------------------------------------------------------ #

    def generate_summary(
        self,
        username: str,
        conversation_id: str,
        subject: str = "",
    ) -> Dict[str, Any]:
        """
        生成对话学习总结 + 思维导图

        Args:
            username: 用户名
            conversation_id: 对话 ID
            subject: 学科代码

        Returns:
            dict: {"summary": str, "mindmap": str}

        Raises:
            NotFoundError: 对话不存在
            ValidationError: 消息数不足
            LLMServiceError: AI 服务失败
        """
        if not self._ask_ai_func:
            raise LLMServiceError("AI 服务未初始化")

        # 1) 加载消息
        messages = self._msg_repo.get_conversation_messages(conversation_id)
        if not messages:
            raise NotFoundError("对话", conversation_id)

        if len(messages) < MIN_MESSAGES_FOR_SUMMARY:
            raise ValidationError(
                f"对话消息数不足（至少需要 {MIN_MESSAGES_FOR_SUMMARY} 条），"
                "无法生成有意义的总结"
            )

        # 2) 格式化消息
        formatted = self._format_messages_for_summary(messages)

        # 3) 构建总结提示词
        prompt = (
            "请根据以下对话内容，生成两部分内容：\n\n"
            "**第一部分：学习总结**\n"
            "用简洁的中文总结对话中涉及的主要知识点和学习收获。\n\n"
            "**第二部分：思维导图**\n"
            "用 Markdown 层级列表格式展示知识结构。\n\n"
            "[SUMMARY_START]\n你的学习总结\n[SUMMARY_END]\n"
            "[MINDMAP_START]\n你的思维导图\n[MINDMAP_END]\n\n"
            f"=== 对话内容 ===\n{formatted}"
        )

        # 4) 调用 LLM
        try:
            response, _ = self._ask_ai_func(
                question=prompt,
                subject_code=subject,
                use_api=False,
                conversation_history=[],
                model=self._settings.llm_local_model,
                task_type="summary",
            )
        except Exception as e:
            logger.error("生成总结失败: %s", e)
            raise LLMServiceError(f"生成总结失败: {e}") from e

        # 5) 解析响应
        summary, mindmap = self._parse_summary_response(response)

        return {"summary": summary, "mindmap": mindmap}

    # ------------------------------------------------------------------ #
    #                     消息操作                                         #
    # ------------------------------------------------------------------ #

    def get_recent_messages(
        self,
        username: str,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        """获取用户最近的消息（跨对话）"""
        return self._msg_repo.get_recent_user_messages(username, limit)

    # ------------------------------------------------------------------ #
    #                     内部辅助方法                                      #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _format_history_for_llm(
        messages: List[Dict[str, Any]],
    ) -> List[Dict[str, str]]:
        """
        将数据库消息格式转换为 LLM 对话历史格式

        Returns:
            [{"role": "user"/"assistant", "content": "..."}]
        """
        history = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role in ("user", "assistant") and content:
                history.append({"role": role, "content": content})
        return history

    @staticmethod
    def _format_messages_for_summary(
        messages: List[Dict[str, Any]],
    ) -> str:
        """将消息列表格式化为用于总结的文本"""
        lines = []
        for msg in messages:
            role = msg.get("role", "user")
            content = msg.get("content", "")
            if role == "user":
                lines.append(f"学生提问：{content}")
            elif role == "assistant":
                lines.append(f"AI 回答：{content}")
        return "\n\n".join(lines)

    @staticmethod
    def _parse_summary_response(response: str) -> Tuple[str, str]:
        """
        解析 LLM 返回的总结响应

        支持多种格式:
        1. [SUMMARY_START]...[SUMMARY_END] + [MINDMAP_START]...[MINDMAP_END]
        2. ===SUMMARY=== / ===MINDMAP=== 分隔
        3. 直接文本（前半为总结，后半为思维导图）

        Returns:
            (summary, mindmap)
        """
        import re

        summary = ""
        mindmap = ""

        # 策略 1：标签格式（支持缺少 END 标签的情况）
        summary_match = re.search(
            r'\[SUMMARY_START\](.*?)(?:\[SUMMARY_END\]|\[MINDMAP_START\]|$)',
            response, re.DOTALL,
        )
        mindmap_match = re.search(
            r'\[MINDMAP_START\](.*?)(?:\[MINDMAP_END\]|$)',
            response, re.DOTALL,
        )

        if summary_match:
            summary = summary_match.group(1).strip()
        if mindmap_match:
            mindmap = mindmap_match.group(1).strip()

        if summary and mindmap:
            return summary, mindmap
        # 只有 summary 但有标记，也返回
        if summary_match and summary:
            return summary, mindmap

        # 策略 2：分隔符格式
        if "===SUMMARY===" in response:
            parts = response.split("===SUMMARY===")
            if len(parts) >= 2:
                rest = parts[1]
                if "===MINDMAP===" in rest:
                    summary_part, mindmap_part = rest.split("===MINDMAP===", 1)
                    summary = summary_part.strip()
                    mindmap = mindmap_part.strip()
                else:
                    summary = rest.strip()

        if summary:
            return summary, mindmap

        # 策略 3：按 "思维导图" 关键词分割
        for keyword in ["思维导图", "Mindmap", "mindmap", "## 知识结构"]:
            if keyword in response:
                idx = response.index(keyword)
                summary = response[:idx].strip()
                mindmap = response[idx:].strip()
                # 清理标题行
                lines = summary.split('\n')
                summary = '\n'.join(
                    l for l in lines
                    if not l.strip().startswith(('# ', '## ', '**第'))
                    or '总结' not in l
                ).strip()
                return summary, mindmap

        # 策略 4：回退 - 全部当总结
        return response.strip(), ""

    @staticmethod
    def _sse_event(event_type: str, data: dict) -> str:
        """构建 SSE 事件字符串"""
        return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"
