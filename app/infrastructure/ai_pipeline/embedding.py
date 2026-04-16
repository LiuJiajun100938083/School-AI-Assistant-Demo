"""
Embedding Provider 抽象層
==========================
職責：封裝文本向量化 API 調用，對外提供統一接口。
目前實現：Qwen text-embedding-v4（OpenAI 兼容格式）。
未來換模型只需新增 Provider 子類，業務代碼不需改動。
"""

import logging
from abc import ABC, abstractmethod

import httpx

logger = logging.getLogger(__name__)


class EmbeddingProvider(ABC):
    """向量化 Provider 抽象基類"""

    @abstractmethod
    async def embed(self, text: str) -> list[float]:
        """將單個文本轉為向量"""
        ...

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量向量化。子類可覆蓋以使用原生批量 API（更高效）。"""
        results = []
        for text in texts:
            results.append(await self.embed(text))
        return results


class QwenEmbeddingProvider(EmbeddingProvider):
    """
    阿里雲 Qwen text-embedding-v4
    - 端點：{llm_api_base_url}/embeddings（OpenAI 兼容）
    - 向量維度：1024（默認）
    - 每文本限：2048 tokens
    - 支持批量輸入
    """

    MODEL = "text-embedding-v4"
    DIMENSIONS = 1024

    async def embed(self, text: str) -> list[float]:
        results = await self.embed_batch([text])
        return results[0]

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """批量調用，一次請求處理多個文本"""
        from llm.config import get_llm_config

        cfg = get_llm_config()
        if not cfg.api_key:
            raise RuntimeError("LLM_API_KEY 未配置，無法調用 Embedding API")

        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{cfg.api_base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.MODEL,
                    "input": texts,
                    "dimensions": self.DIMENSIONS,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        # 按 index 排序，確保返回順序與輸入一致
        items = sorted(data["data"], key=lambda x: x["index"])
        return [item["embedding"] for item in items]


# 單例：業務代碼直接 import 使用，不需要手動實例化
default_embedding_provider: EmbeddingProvider = QwenEmbeddingProvider()


# ==================== LangChain 兼容包裝 ====================

class QwenLangChainEmbeddings:
    """
    LangChain Embeddings 接口的同步實現，供 ChromaDB 使用。

    LangChain 的 Chroma 在索引和查詢時都會調用此類：
    - embed_documents(): 索引文檔 chunk 時批量調用
    - embed_query(): 查詢時單個調用

    使用同步 httpx（非 async），避免在 LangChain 內部出現 event loop 衝突。
    """

    MODEL = "text-embedding-v4"
    DIMENSIONS = 1024

    def _call_api(self, texts: list) -> list:
        import httpx
        from llm.config import get_llm_config

        cfg = get_llm_config()
        if not cfg.api_key:
            raise RuntimeError("LLM_API_KEY 未配置，無法調用 Embedding API")

        with httpx.Client(timeout=60) as client:
            resp = client.post(
                f"{cfg.api_base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {cfg.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.MODEL,
                    "input": texts,
                    "dimensions": self.DIMENSIONS,
                },
            )
            resp.raise_for_status()
            items = sorted(resp.json()["data"], key=lambda x: x["index"])
            return [item["embedding"] for item in items]

    def embed_documents(self, texts: list) -> list:
        """批量向量化文檔（LangChain 索引時調用）"""
        return self._call_api(texts)

    def embed_query(self, text: str) -> list:
        """單個查詢向量化（LangChain 檢索時調用）"""
        return self._call_api([text])[0]
