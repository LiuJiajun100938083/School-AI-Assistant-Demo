"""
AI 圖片生成服務
================
負責所有圖片生成相關業務邏輯：
- Prompt 校驗
- 調用 Ollama 圖片生成模型
- 流式返回生成進度與結果
"""

import json
import logging
import time
from typing import AsyncGenerator

import httpx

from app.config.settings import Settings
from app.core.ai_gate import ai_gate, Priority, Weight
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class ImageGenService:
    """
    AI 圖片生成服務

    職責:
    1. Prompt 校驗（長度、空值）
    2. GPU 排程（透過 ai_gate）
    3. 調用 Ollama /api/generate 生成圖片
    4. 流式返回結構化狀態
    """

    def __init__(self, settings: Settings):
        self._settings = settings

    # ------------------------------------------------------------------ #
    #  校驗
    # ------------------------------------------------------------------ #

    def validate_prompt(self, prompt: str) -> str:
        """
        校驗並清理 prompt。

        Returns:
            清理後的 prompt 字串

        Raises:
            ValidationError: prompt 為空或超過長度限制
        """
        cleaned = (prompt or "").strip()
        if not cleaned:
            raise ValidationError("請輸入圖片描述")
        max_len = self._settings.image_gen_max_prompt_length
        if len(cleaned) > max_len:
            raise ValidationError(f"描述不能超過 {max_len} 字")
        return cleaned

    # ------------------------------------------------------------------ #
    #  核心業務：流式生成圖片
    # ------------------------------------------------------------------ #

    async def generate_stream(
        self, prompt: str, username: str
    ) -> AsyncGenerator[dict, None]:
        """
        流式生成圖片。

        透過 ai_gate 排程 GPU，調用 Ollama POST /api/generate。
        逐步 yield 結構化狀態字典。

        Yields:
            {"type": "status",   "message": str}
            {"type": "progress", "step": int, "total": int}
            {"type": "complete", "image": str}   # base64 PNG
            {"type": "error",    "message": str}
        """
        t_start = time.monotonic()
        model = self._settings.image_gen_model
        timeout_sec = self._settings.image_gen_timeout

        yield {"type": "status", "message": "排隊中，等待 GPU 資源..."}

        try:
            payload = {
                "model": model,
                "prompt": prompt,
                "stream": True,
            }
            timeout = httpx.Timeout(timeout_sec, connect=30.0)

            async with ai_gate(
                "image_gen", Priority.INTERACTIVE, Weight.VISION_MULTI
            ) as client:
                t_gate = time.monotonic()
                logger.info(
                    "image_gen dispatched user=%s model=%s gate_wait=%.1fs",
                    username,
                    model,
                    t_gate - t_start,
                )
                yield {"type": "status", "message": "正在生成圖片..."}

                async with client.stream(
                    "POST", "/api/generate", json=payload, timeout=timeout
                ) as response:
                    if response.status_code != 200:
                        body = await response.aread()
                        err = body.decode("utf-8", errors="replace")[:500]
                        logger.error(
                            "image_gen Ollama %d: %s", response.status_code, err
                        )
                        yield {
                            "type": "error",
                            "message": "圖片生成服務錯誤，請稍後重試",
                        }
                        return

                    async for line in response.aiter_lines():
                        if not line.strip():
                            continue
                        try:
                            chunk = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        # 進度更新
                        if "total" in chunk and not chunk.get("done"):
                            yield {
                                "type": "progress",
                                "step": chunk.get("completed", 0),
                                "total": chunk["total"],
                            }

                        # 最終結果
                        if chunk.get("done") and chunk.get("image"):
                            t_done = time.monotonic()
                            logger.info(
                                "image_gen complete user=%s total=%.1fs",
                                username,
                                t_done - t_start,
                            )
                            yield {"type": "complete", "image": chunk["image"]}
                            return

                # 流結束但未收到圖片
                yield {
                    "type": "error",
                    "message": "圖片生成未返回結果，請重試",
                }

        except httpx.TimeoutException:
            logger.warning("image_gen timeout user=%s", username)
            yield {"type": "error", "message": "生成超時，請稍後重試"}
        except Exception as e:
            logger.error("image_gen error: %s", e, exc_info=True)
            yield {"type": "error", "message": "生成失敗，請稍後重試"}
