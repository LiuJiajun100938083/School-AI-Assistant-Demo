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

    def invoke(self, prompt: str) -> str:
        """同步調用 Ollama"""
        if self._llm is None:
            raise RuntimeError("Ollama LLM 未初始化")
        return self._llm.invoke(prompt)

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
        """流式調用（已棄用，請使用 async_stream）"""
        result = self.invoke(prompt)
        if on_chunk:
            on_chunk(result)
        return result

    async def async_stream(self, prompt: str, enable_thinking: bool = True) -> AsyncGenerator[str, None]:
        """
        異步流式調用 Ollama — 逐 token yield

        使用 /api/chat 端點（而非 /api/generate），確保：
        - 模型的 chat template 被正確應用
        - Qwen3 /think 思考模式能正確觸發 <think>...</think> 標籤
        - StreamingThinkingParser 可以正確分離 thinking 和 answer

        Args:
            prompt: 完整的提示詞（已包含 /think 或 /no_think 前綴）
            enable_thinking: 是否開啟思考模式（Ollama think 參數硬開關）

        Yields:
            str: 每次生成的文本片段
        """
        # --- 動態 num_ctx：根據 prompt 長度自適應 ---
        # 中文約 1.5 字符/token，預留 max_tokens 給生成 + 1024 安全邊距
        # 下限 8192（短對話極速響應），上限為配置值（長對話完整支持）
        estimated_tokens = int(len(prompt) / 1.5)
        dynamic_num_ctx = min(
            max(estimated_tokens + self.max_tokens + 1024, 8192),
            self.num_ctx
        )

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
        async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout, connect=10.0)) as client:
            async with client.stream("POST", url, json=payload) as response:
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

                    # /api/chat 返回格式：{"message": {"role": "assistant", "content": "token"}, "done": false}
                    # 注意: content 可能為 null（Ollama 思考階段），需用 `or` 防禦
                    msg = chunk.get("message") or {}
                    token = msg.get("content") or ""
                    if token:
                        yield token

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
