# llm/providers/base.py
"""
LLM 提供者基類
定義統一的 LLM 調用接口，包括同步和異步流式調用
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Callable, AsyncGenerator
from dataclasses import dataclass


@dataclass
class LLMResponse:
    """LLM 響應數據類"""
    content: str
    thinking: str = ""
    raw_response: str = ""
    model: str = ""
    usage: Optional[Dict] = None


class BaseLLMProvider(ABC):
    """LLM 提供者基類"""

    def __init__(self, model: str, base_url: str, **kwargs):
        self.model = model
        self.base_url = base_url
        self.temperature = kwargs.get('temperature', 0.6)
        self.top_p = kwargs.get('top_p', 0.95)
        self.timeout = kwargs.get('timeout', 120)
        self.max_tokens = kwargs.get('max_tokens', 81920)
        self.stop_tokens = kwargs.get('stop_tokens', [])
        self.num_ctx = kwargs.get('num_ctx', 131072)
        self.num_gpu = kwargs.get('num_gpu', None)

    @abstractmethod
    def invoke(self, prompt: str) -> str:
        """同步調用 LLM"""
        pass

    @abstractmethod
    def invoke_with_messages(self, messages: List[Dict]) -> str:
        """使用消息列表格式調用 LLM"""
        pass

    def stream(
        self,
        prompt: str,
        on_chunk: Optional[Callable[[str], None]] = None
    ) -> str:
        """流式調用 LLM（默認實現為非流式，已棄用）"""
        result = self.invoke(prompt)
        if on_chunk:
            on_chunk(result)
        return result

    async def async_stream(self, prompt: str, enable_thinking: bool = True) -> AsyncGenerator[tuple, None]:
        """
        異步流式調用 LLM — 逐 token yield

        子類應覆寫此方法以實現真正的流式輸出。
        默認實現回退到同步 invoke()，一次性返回完整結果。

        Yields:
            tuple[str, str]: (type, content) — type 為 "thinking" 或 "answer"
        """
        result = self.invoke(prompt)
        yield ("answer", result)

    def get_model_info(self) -> Dict:
        """獲取模型信息"""
        return {
            "model": self.model,
            "base_url": self.base_url,
            "provider": self.__class__.__name__
        }
