"""
AI 圖片生成服務
================
負責所有圖片生成相關業務邏輯：
- Prompt 校驗
- Per-user 限流（同時只允許一個生成任務）
- GPU 排程（透過 scheduler 低層 API，推送排隊位置）
- 調用 Ollama 圖片生成模型
- 流式返回排隊位置、生成進度與結果
"""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator

import httpx

from app.config.settings import Settings
from app.core.ai_gate import (
    get_scheduler, get_shared_ollama_client, Priority, Weight
)
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)


class ImageGenService:
    """
    AI 圖片生成服務

    職責:
    1. Prompt 校驗（長度、空值）
    2. Per-user 限流（同用戶同時只允許一個生成任務）
    3. GPU 排程（透過 scheduler 低層 API）
    4. 排隊等待期間推送真實排隊位置
    5. 調用 Ollama /api/generate 生成圖片
    6. 流式返回結構化狀態
    """

    def __init__(self, settings: Settings):
        self._settings = settings
        self._active_users: set[str] = set()
        self._active_users_lock = asyncio.Lock()

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
        流式生成圖片，帶排隊可觀測性和 per-user 限流。

        透過 scheduler 低層 API 排程 GPU，在排隊等待期間推送真實位置。
        調用 Ollama POST /api/generate。逐步 yield 結構化狀態字典。

        Yields:
            {"type": "queue",    "position": int, "total": int, "est_wait": str}
            {"type": "status",   "message": str}
            {"type": "progress", "step": int, "total": int}
            {"type": "complete", "image": str}   # base64 PNG
            {"type": "error",    "message": str}
        """
        # Per-user 限流（原子 check + add）
        async with self._active_users_lock:
            if username in self._active_users:
                yield {
                    "type": "error",
                    "message": "您已有一個圖片正在生成，請稍候完成後再提交",
                }
                return
            self._active_users.add(username)

        try:
            async for msg in self._do_generate(prompt, username):
                yield msg
        finally:
            # 最外層 finally — 任何路徑都會執行，保證不會永久鎖用戶
            async with self._active_users_lock:
                self._active_users.discard(username)

    async def _do_generate(
        self, prompt: str, username: str
    ) -> AsyncGenerator[dict, None]:
        """內部生成邏輯（per-user lock 已在外層處理）"""
        t_start = time.monotonic()
        model = self._settings.image_gen_model
        timeout_sec = self._settings.image_gen_timeout

        scheduler = get_scheduler()
        entry = await scheduler.enqueue(
            "image_gen", Priority.INTERACTIVE, Weight.VISION_MULTI
        )

        try:
            # ── Phase 1: 排隊等待 — yield queue events ──
            last_pos = None
            last_push_time = 0.0

            while not entry.event.is_set():
                pos, total = await scheduler.get_queue_position(entry)
                if pos == 0:
                    break  # 已離開隊列

                now = time.monotonic()
                changed = (pos, total) != last_pos
                stale = (now - last_push_time) >= 10.0
                if changed or stale:
                    last_pos = (pos, total)
                    last_push_time = now
                    est = self._estimate_wait(pos)
                    yield {
                        "type": "queue",
                        "position": pos,
                        "total": total,
                        "est_wait": est,
                    }

                try:
                    await asyncio.wait_for(
                        asyncio.shield(entry.event.wait()), timeout=3.0
                    )
                except asyncio.TimeoutError:
                    continue

            # Phase 1 → Phase 2 邊界守衛
            if not entry.event.is_set():
                cancelled = await scheduler.cancel(entry)
                if not cancelled:
                    await scheduler.release_entry(entry, failed=True)
                return

            # ── Phase 2: 生成 ──
            t_gate = time.monotonic()
            logger.info(
                "image_gen dispatched user=%s model=%s gate_wait=%.1fs",
                username, model, t_gate - t_start,
            )
            yield {"type": "status", "message": "正在生成圖片..."}

            payload = {
                "model": model,
                "prompt": prompt,
                "stream": True,
            }
            timeout = httpx.Timeout(timeout_sec, connect=30.0)
            client = get_shared_ollama_client()

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
                            username, t_done - t_start,
                        )
                        yield {"type": "complete", "image": chunk["image"]}
                        return

                # 流結束但未收到圖片
                yield {
                    "type": "error",
                    "message": "圖片生成未返回結果，請重試",
                }

        except asyncio.CancelledError:
            cancelled = await scheduler.cancel(entry)
            if not cancelled:
                await scheduler.release_entry(entry, failed=True)
            raise
        except httpx.TimeoutException:
            logger.warning("image_gen timeout user=%s", username)
            cancelled = await scheduler.cancel(entry)
            if not cancelled:
                await scheduler.release_entry(entry, failed=True)
            yield {"type": "error", "message": "生成超時，請稍後重試"}
        except Exception as e:
            logger.error("image_gen error: %s", e, exc_info=True)
            cancelled = await scheduler.cancel(entry)
            if not cancelled:
                await scheduler.release_entry(entry, failed=True)
            yield {"type": "error", "message": "生成失敗，請稍後重試"}
        else:
            await scheduler.release_entry(entry, failed=False)

    # ------------------------------------------------------------------ #
    #  輔助
    # ------------------------------------------------------------------ #

    @staticmethod
    def _estimate_wait(position: int) -> str:
        """根據排隊位置粗略估算等待時間（保守區間）"""
        # image_gen 是重任務（Weight=3），單任務約 60-120 秒
        # 保守估算：每個位置 ~90 秒
        minutes = (position * 90) / 60
        if minutes <= 1:
            return "約 1 分鐘內"
        elif minutes <= 2:
            return "約 1-2 分鐘"
        elif minutes <= 5:
            return f"約 {int(minutes)}-{int(minutes)+1} 分鐘"
        else:
            return f"約 {int(minutes)} 分鐘以上"
