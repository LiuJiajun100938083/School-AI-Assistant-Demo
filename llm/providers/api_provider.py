# llm/providers/api_provider.py
"""
Qwen (DashScope) / OpenAI-compatible API 提供者
支持同步調用和異步流式輸出，用於雲端部署
"""

import json
import logging
from typing import List, Dict, Optional, AsyncGenerator

import httpx
from .base import BaseLLMProvider

logger = logging.getLogger(__name__)


class ApiProvider(BaseLLMProvider):
    """OpenAI-compatible API 提供者 (Qwen/DashScope, etc.)"""

    def __init__(self, model: str, base_url: str, api_key: str = "", **kwargs):
        super().__init__(model, base_url, **kwargs)
        self.api_key = api_key
        logger.info(f"✅ API 提供者初始化完成: model={self.model}, base_url={self.base_url}")

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _build_messages(self, prompt: str, system: str = "") -> List[Dict]:
        msgs = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        return msgs

    def invoke(self, prompt: str) -> str:
        """同步調用 API（非流式）"""
        messages = self._build_messages(prompt)
        return self._call_api_sync(messages)

    def invoke_with_messages(self, messages: List[Dict]) -> str:
        """使用消息列表格式調用 API"""
        return self._call_api_sync(messages)

    def _call_api_sync(self, messages: List[Dict]) -> str:
        """同步 API 調用"""
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": False,
        }
        try:
            with httpx.Client(timeout=self.timeout) as client:
                resp = client.post(url, json=payload, headers=self._headers())
                resp.raise_for_status()
                data = resp.json()
                return data["choices"][0]["message"]["content"]
        except Exception as e:
            logger.error(f"API 調用失敗: {e}")
            return f"[API Error] {e}"

    async def async_stream(self, prompt: str, enable_thinking: bool = True) -> AsyncGenerator[tuple, None]:
        """
        異步流式調用 API — 逐 token yield

        Yields:
            tuple[str, str]:
                ("thinking", str)  — 思考 token (reasoning_content)
                ("answer", str)    — 回答 token
        """
        messages = self._build_messages(prompt)
        url = f"{self.base_url}/chat/completions"
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "stream": True,
        }

        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(self.timeout)) as client:
                async with client.stream(
                    "POST", url, json=payload, headers=self._headers()
                ) as resp:
                    resp.raise_for_status()
                    async for line in resp.aiter_lines():
                        if not line.startswith("data: "):
                            continue
                        data_str = line[6:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            delta = chunk.get("choices", [{}])[0].get("delta", {})

                            # Regular content (answer)
                            content = delta.get("content", "")
                            if content:
                                yield ("answer", content)
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            logger.error(f"API 流式調用失敗: {e}")
            yield ("answer", f"\n[API Error] {e}")
