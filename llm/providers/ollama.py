# llm/providers/ollama.py
"""
Ollama LLM 提供者
支持本地 Ollama 服務，包括同步調用和異步流式輸出
"""

import json
import logging
from typing import List, Dict, Optional, Callable, AsyncGenerator

import httpx
from langchain_ollama import OllamaLLM
from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class OllamaProvider(BaseLLMProvider):
    """Ollama LLM 提供者"""

    def __init__(self, model: str, base_url: str, **kwargs):
        super().__init__(model, base_url, **kwargs)
        self._llm = None
        self._init_llm()

    def _init_llm(self):
        """初始化 Ollama LLM 實例"""
        try:
            self._llm = OllamaLLM(
                base_url=self.base_url,
                model=self.model,
                temperature=self.temperature,
                top_p=self.top_p,
                stop=self.stop_tokens if self.stop_tokens else None,
                timeout=self.timeout,
                num_ctx=self.num_ctx,
            )
            logger.info(f"✅ Ollama 提供者初始化完成: model={self.model}, base_url={self.base_url}")
        except Exception as e:
            logger.error(f"❌ Ollama 提供者初始化失敗: {e}")
            raise

    def _calc_dynamic_num_ctx(self, prompt: str) -> int:
        """根據 prompt 長度動態計算 num_ctx（所有調用路徑共用）"""
        estimated_tokens = int(len(prompt) / 1.5)
        return min(
            max(estimated_tokens + self.max_tokens + 1024, 8192),
            self.num_ctx
        )

    def invoke(self, prompt: str) -> str:
        """
        同步調用 Ollama（使用 httpx + 動態 num_ctx）

        ⚠️ DEPRECATED: 此方法為同步調用，不受 AI 調度器 (WeightedPriorityScheduler) 保護。
        所有新代碼必須走 async_stream()。此方法僅供舊版兼容使用。
        """
        # WARNING: sync method — NOT protected by WeightedPriorityScheduler
        # Do not use in new code. Use async_stream() instead.
        dynamic_num_ctx = self._calc_dynamic_num_ctx(prompt)

        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "think": False,
            "options": {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "num_predict": self.max_tokens,
                "num_ctx": dynamic_num_ctx,
                **({"num_gpu": self.num_gpu} if self.num_gpu is not None else {}),
            }
        }

        if self.stop_tokens:
            payload["options"]["stop"] = self.stop_tokens

        estimated_tokens = int(len(prompt) / 1.5)
        logger.info(f"🔗 Ollama invoke: model={self.model}, num_ctx={dynamic_num_ctx}(prompt≈{estimated_tokens}tok)")

        with httpx.Client(timeout=httpx.Timeout(self.timeout, connect=10.0)) as client:
            response = client.post(url, json=payload)
            if response.status_code != 200:
                error_text = response.text[:500]
                logger.error(f"❌ Ollama API 錯誤 {response.status_code}: {error_text}")
                response.raise_for_status()

            data = response.json()
            msg = data.get("message") or {}
            return msg.get("content") or ""

    def invoke_with_messages(self, messages: List[Dict]) -> str:
        """使用消息列表格式調用（轉換為單一 prompt）"""
        prompt_parts = []
        for msg in messages:
            role = msg.get('role', '')
            content = msg.get('content', '')
            if role == 'system':
                prompt_parts.append(f"【系統提示】\n{content}")
            elif role == 'user':
                prompt_parts.append(f"【用戶】\n{content}")
            elif role == 'assistant':
                prompt_parts.append(f"【助手】\n{content}")

        prompt = "\n\n".join(prompt_parts)
        return self.invoke(prompt)

    def stream(
        self,
        prompt: str,
        on_chunk: Optional[Callable[[str], None]] = None
    ) -> str:
        """
        流式調用（已棄用，請使用 async_stream）

        ⚠️ DEPRECATED: 內部調用 invoke()，不受 AI 調度器保護。
        """
        # WARNING: deprecated — calls sync invoke(), not scheduler-protected
        result = self.invoke(prompt)
        if on_chunk:
            on_chunk(result)
        return result

    async def async_stream(self, prompt: str, enable_thinking: bool = True) -> AsyncGenerator[tuple, None]:
        """
        異步流式調用 Ollama — 逐 token yield

        使用 /api/chat 端點，確保：
        - 模型的 chat template 被正確應用
        - Qwen3 /think 思考模式能正確觸發
        - Ollama 的 think 參數自動分離 thinking 和 answer

        Args:
            prompt: 完整的提示詞（已包含 /think 或 /no_think 前綴）
            enable_thinking: 是否開啟思考模式（Ollama think 參數硬開關）

        Yields:
            tuple[str, str]: (type, content) — type 為 "thinking" 或 "answer"
        """
        # --- 動態 num_ctx：根據 prompt 長度自適應 ---
        dynamic_num_ctx = self._calc_dynamic_num_ctx(prompt)
        estimated_tokens = int(len(prompt) / 1.5)

        url = f"{self.base_url}/api/chat"
        payload = {
            "model": self.model,
            "messages": [
                {"role": "user", "content": prompt}
            ],
            "stream": True,
            "think": enable_thinking,
            "options": {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "num_predict": self.max_tokens,
                "num_ctx": dynamic_num_ctx,
                **({"num_gpu": self.num_gpu} if self.num_gpu is not None else {}),
            }
        }

        if self.stop_tokens:
            payload["options"]["stop"] = self.stop_tokens

        gpu_info = f", num_gpu={self.num_gpu}" if self.num_gpu is not None else ""
        logger.info(f"🔗 Ollama 請求: model={self.model}, num_ctx={dynamic_num_ctx}(prompt≈{estimated_tokens}tok), num_predict={self.max_tokens}{gpu_info}")
        from app.core.ai_gate import ai_gate, Priority, Weight
        async with ai_gate("llm_stream", Priority.INTERACTIVE, Weight.CHAT) as client:
            async with client.stream("POST", "/api/chat", json=payload,
                                     timeout=httpx.Timeout(self.timeout, connect=10.0)) as response:
                if response.status_code != 200:
                    # 讀取 Ollama 錯誤詳情
                    error_body = await response.aread()
                    error_text = error_body.decode("utf-8", errors="replace")[:500]
                    logger.error(f"❌ Ollama API 錯誤 {response.status_code}: {error_text}")
                    response.raise_for_status()

                async for line in response.aiter_lines():
                    if not line:
                        continue

                    try:
                        chunk = json.loads(line)
                    except json.JSONDecodeError:
                        logger.warning(f"跳過無效 JSON 行: {line[:100]}")
                        continue

                    # Ollama /api/chat + think:true 返回格式：
                    #   思考階段: {"message": {"role":"assistant", "thinking":"...", "content":""}}
                    #   回答階段: {"message": {"role":"assistant", "thinking":"",  "content":"..."}}
                    msg = chunk.get("message") or {}

                    thinking_token = msg.get("thinking") or ""
                    answer_token = msg.get("content") or ""

                    if thinking_token:
                        yield ("thinking", thinking_token)
                    if answer_token:
                        yield ("answer", answer_token)

                    if chunk.get("done", False):
                        return

    def reload(self):
        """重新初始化 LLM"""
        self._init_llm()


# 創建全局實例的工廠函數
_global_provider: Optional[OllamaProvider] = None


def get_ollama_provider() -> OllamaProvider:
    """獲取全局 Ollama 提供者實例"""
    global _global_provider
    if _global_provider is None:
        from ..config import get_llm_config
        config = get_llm_config()
        _global_provider = OllamaProvider(
            model=config.local_model,
            base_url=config.local_base_url,
            temperature=config.temperature,
            top_p=config.top_p,
            timeout=config.timeout,
            max_tokens=config.max_tokens,
            stop_tokens=config.stop_tokens,
            num_ctx=config.num_ctx,
            num_gpu=config.num_gpu
        )
    return _global_provider


def reset_ollama_provider():
    """重置全局提供者（用於配置更改後）"""
    global _global_provider
    _global_provider = None
