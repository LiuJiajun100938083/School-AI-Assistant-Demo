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

import re

from app.config.settings import Settings
from app.core.ai_gate import (
    get_scheduler, get_shared_ollama_client, Priority, Weight
)
from app.core.exceptions import ValidationError

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------ #
#  內容安全 — 違禁關鍵詞（色情、暴力、毒品、恐怖等）
# ------------------------------------------------------------------ #

_BLOCKED_KEYWORDS: list[str] = [
    # —— 色情 / 裸露 / 性暗示 ——
    "色情", "裸体", "裸露", "裸女", "裸男", "性爱", "性交", "做爱",
    "自慰", "手淫", "阴茎", "阴道", "乳房", "胸部裸露", "生殖器",
    "淫荡", "淫秽", "情色", "成人内容", "AV女优", "黄色图片",
    "交配", "交媾", "口交", "肛交", "颜射", "潮吹", "调教",
    "捆绑", "SM", "露点", "走光", "偷拍", "透视", "内衣秀",
    "勾引", "约炮", "一夜情", "卖淫", "嫖娼", "援交", "陪睡",
    "春药", "催情", "壮阳", "飞机杯", "充气娃娃", "情趣用品",
    "porn", "nude", "naked", "nsfw", "hentai", "erotic",
    "sexual", "genitalia", "xxx", "orgasm", "masturbat",
    "intercourse", "blowjob", "handjob", "bondage", "fetish",
    "stripper", "lingerie", "topless", "buttocks", "crotch",
    "seduct", "provocat", "lewd", "explicit",
    # —— 暴力 / 血腥 ——
    "血腥", "暴力", "杀人", "砍头", "斩首", "肢解", "虐杀",
    "酷刑", "折磨", "虐待", "内脏", "开膛", "割喉", "屠杀",
    "捅刀", "刺杀", "枪杀", "绞刑", "溅血", "碎尸",
    "gore", "dismember", "behead", "mutilat", "torture",
    "bloodbath", "slaughter", "disembowel", "stabbing",
    "decapitat", "execution", "massacre",
    # —— 毒品 / 违禁品 ——
    "吸毒", "制毒", "冰毒", "海洛因", "可卡因", "大麻种植",
    "摇头丸", "致幻剂", "注射毒品",
    "cocaine", "heroin", "meth lab", "drug use", "marijuana",
    "ecstasy", "hallucinogen",
    # —— 恐怖主义 / 极端主义 ——
    "恐怖袭击", "炸弹制作", "爆炸物", "自杀式", "极端主义",
    "terrorist", "bomb making", "extremist", "jihad",
    # —— 儿童相关 ——
    "儿童色情", "恋童", "未成年人色情", "幼女", "萝莉控",
    "child porn", "pedophil", "underage", "loli",
    # —— 歧视 / 仇恨 ——
    "种族歧视", "纳粹", "白人至上", "仇恨",
    "nazi", "white supremac", "hate symbol", "racial slur",
    # —— 自残 / 自杀 ——
    "自杀方法", "割腕", "上吊", "跳楼自杀",
    "suicide method", "self-harm", "cut wrist",
]

# 預編譯正則（忽略大小寫，用 | 連接所有關鍵詞）
_BLOCKED_RE = re.compile(
    "|".join(re.escape(kw) for kw in _BLOCKED_KEYWORDS),
    re.IGNORECASE,
)


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
            ValidationError: prompt 為空、超過長度限制或包含違禁內容
        """
        cleaned = (prompt or "").strip()
        if not cleaned:
            raise ValidationError("請輸入圖片描述")
        max_len = self._settings.image_gen_max_prompt_length
        if len(cleaned) > max_len:
            raise ValidationError(f"描述不能超過 {max_len} 字")

        # 內容安全檢查
        match = _BLOCKED_RE.search(cleaned)
        if match:
            logger.warning(
                "image_gen prompt blocked: keyword='%s'", match.group()
            )
            raise ValidationError(
                "您的描述包含不適當內容（色情、暴力等），請修改後重試"
            )

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
            # ★ LLM 安全審核（在排隊之前，不佔 AI Gate 槽位）
            if self._settings.content_moderation_enabled:
                from forum_system.service.content_moderator import check_content_safety

                result = await check_content_safety(
                    prompt,
                    content_type="image_prompt",
                    route="image_gen",
                    username=username,
                )
                if result.status == "blocked":
                    yield {
                        "type": "error",
                        "message": "您的描述可能包含不適當內容，請修改後重試",
                    }
                    return
                elif result.status == "error":
                    yield {
                        "type": "error",
                        "message": "安全審核服務暫時不可用，請稍後重試",
                    }
                    return

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

        # failed 追蹤任務是否成功完成，用於 finally 統一釋放
        failed = True
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

                # 用 sleep 輪詢（不創建額外 Task，徹底避免孤兒 task 警告）
                await asyncio.sleep(3.0)

            # Phase 1 → Phase 2 邊界守衛
            if not entry.event.is_set():
                return  # finally 會處理釋放

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
                        failed = False
                        return

                # 流結束但未收到圖片
                yield {
                    "type": "error",
                    "message": "圖片生成未返回結果，請重試",
                }

        except asyncio.CancelledError:
            logger.info("image_gen cancelled user=%s", username)
            raise
        except httpx.TimeoutException:
            logger.warning("image_gen timeout user=%s", username)
            yield {"type": "error", "message": "生成超時，請稍後重試"}
        except Exception as e:
            logger.error("image_gen error: %s", e, exc_info=True)
            yield {"type": "error", "message": "生成失敗，請稍後重試"}
        finally:
            # 統一釋放調度器 entry — 覆蓋所有退出路徑：
            # 正常完成、異常、CancelledError、GeneratorExit（客戶端斷開 SSE）
            # release_entry 是冪等的：QUEUED→cancel, DISPATCHED→release, 終態→no-op
            try:
                await scheduler.release_entry(entry, failed=failed)
            except Exception:
                logger.error(
                    "image_gen failed to release entry seq=%d",
                    entry.sequence, exc_info=True,
                )

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
