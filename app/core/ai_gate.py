"""
AI Gate — 加權優先級調度器 + 共享連接池
========================================
所有 Ollama 調用（Vision OCR、AI 聊天、錯題分析、圖片生成）必須經過此調度器。
避免高並發直打 GPU → 超時 → 雪崩。

核心設計：
- WeightedPriorityScheduler：分層 deque，按 (priority, FIFO) 調度，weight 控制 GPU 容量
- 共享 httpx.AsyncClient：連接池複用，避免每次請求建立 TCP
- ai_gate() context manager：一行整合調度 + 連接池（高層 API，其他功能繼續使用）
- enqueue/release_entry/cancel：低層顯式生命周期 API（用於需要排隊可觀測性的功能）
"""

import asyncio
import dataclasses
import logging
import time
from collections import deque
from contextlib import asynccontextmanager
from enum import IntEnum
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


# ================================================================
#  常量 — 集中管理，不散落 magic number
# ================================================================

class Priority(IntEnum):
    """AI 任務優先級（數字越小越高）"""
    URGENT = 1        # 老師即時操作（試卷 OCR）
    INTERACTIVE = 2   # 學生即時操作（聊天、錯題上傳）
    BATCH = 3         # 後台批量任務


class Weight(IntEnum):
    """AI 任務 GPU 容量消耗權重"""
    CHAT = 1           # 文字 AI 聊天
    VISION_SINGLE = 2  # 單圖 OCR
    ANALYSIS = 2       # AI 分析（錯題、批改）
    VISION_MULTI = 3   # 多圖/PDF OCR / 圖片生成


# ================================================================
#  Entry 狀態機
# ================================================================

class _EntryState(IntEnum):
    """
    調度 entry 的顯式生命周期狀態。

    狀態轉換（全部在 scheduler._lock 下原子完成）：
        QUEUED → DISPATCHED  （只由 _try_dispatch 觸發）
        QUEUED → CANCELLED   （由 cancel / release_entry 觸發）
        DISPATCHED → RELEASED（由 release_entry 觸發）
    """
    QUEUED = 1       # 在隊列中等待
    DISPATCHED = 2   # 已分配 GPU，正在執行
    CANCELLED = 3    # 已取消（終態）
    RELEASED = 4     # 已釋放（終態）


# ================================================================
#  內部數據結構
# ================================================================

@dataclasses.dataclass(order=False)
class _QueueEntry:
    """調度隊列中的一個等待任務"""
    priority: int
    created_at: float       # time.monotonic()
    sequence: int           # 全局遞增序號，確保穩定排序
    weight: int
    task_name: str
    event: asyncio.Event = dataclasses.field(compare=False)
    state: int = dataclasses.field(default=_EntryState.QUEUED, compare=False)

    def __lt__(self, other: "_QueueEntry") -> bool:
        return (self.priority, self.created_at, self.sequence) < \
               (other.priority, other.created_at, other.sequence)


# ================================================================
#  WeightedPriorityScheduler
# ================================================================

class WeightedPriorityScheduler:
    """
    加權優先級調度器。

    調度規則：
    1. 先按 priority 排序（小 = 高）
    2. 同 priority 按入隊先後 FIFO
    3. 只有 剩餘容量 >= weight 時才允許執行
    4. 避免隊頭阻塞：如果隊頭太重放不下，繼續往後找同層更輕的任務

    使用分層 deque（priority → deque[_QueueEntry]），而非 heapq。

    提供兩套 API：
    - acquire() / ai_gate()：高層封裝，隱藏排隊等待（適合不需要觀測排隊的功能）
    - enqueue() / release_entry() / cancel()：低層顯式生命周期（適合需要推送排隊位置的功能）
    """

    # 優先級名稱映射（用於監控面板）
    _PRI_NAMES = {1: "URGENT", 2: "INTERACTIVE", 3: "BATCH"}

    def __init__(self, total_capacity: int):
        if total_capacity <= 0:
            raise ValueError(f"total_capacity must be > 0, got {total_capacity}")
        self._total_capacity = total_capacity
        self._used_capacity = 0
        self._lock = asyncio.Lock()
        self._layers: dict[int, deque[_QueueEntry]] = {}
        self._seq = 0
        self._created_at = time.monotonic()
        self._running_tasks: list[dict] = []  # 受 _lock 保護
        self._stats = {
            "queued": 0,
            "running": 0,
            "completed": 0,
            "failed": 0,
            "rejected": 0,
        }
        # 滑動窗口：最近 N 次完成任務的耗時（秒）
        self._recent_durations: deque[float] = deque(maxlen=20)

    # ================================================================
    #  低層公開 API — 顯式生命周期管理
    # ================================================================

    async def enqueue(self, task_name: str, priority: int, weight: int) -> _QueueEntry:
        """
        將任務加入調度隊列，立即返回 entry（不等待 dispatch）。

        調用端通過 entry.event.wait() 或輪詢 entry.event.is_set() 等待 dispatch。
        dispatch 後必須調用 release_entry() 釋放資源。
        如需取消排隊中的任務，調用 cancel()。

        Raises:
            ValueError: weight 超過總容量或 <= 0
        """
        if weight > self._total_capacity:
            self._stats["rejected"] += 1
            logger.error(
                "AI gate REJECTED: %s weight=%d exceeds total_capacity=%d",
                task_name, weight, self._total_capacity,
            )
            raise ValueError(
                f"Task '{task_name}' weight={weight} exceeds "
                f"total capacity={self._total_capacity}"
            )
        if weight <= 0:
            raise ValueError(f"Task '{task_name}' weight must be > 0, got {weight}")

        async with self._lock:
            self._seq += 1
            entry = _QueueEntry(
                priority=priority,
                created_at=time.monotonic(),
                sequence=self._seq,
                weight=weight,
                task_name=task_name,
                event=asyncio.Event(),
                state=_EntryState.QUEUED,
            )
            layer = self._layers.setdefault(priority, deque())
            layer.append(entry)
            self._stats["queued"] += 1
            logger.debug(
                "AI gate enqueue: %s (pri=%d w=%d seq=%d) queued=%d",
                task_name, priority, weight, self._seq, self._stats["queued"],
            )
            self._try_dispatch()

        return entry

    async def get_queue_position(self, entry: _QueueEntry) -> tuple[int, int]:
        """
        獲取 entry 在全局調度隊列中的真實等待位置。

        語義定義（鎖死）：
        - position = 全局隊列中的真實等待排位（1-indexed），按 scheduler
          實際 dispatch 規則排序（priority 高的先 dispatch，同 priority FIFO）
        - total = 當前所有 priority 層中等待任務的總數
        - (0, 0) = entry 已不在等待隊列中（已 dispatch / 已取消 / 已釋放）

        Service 層規則：pos > 0 才發 queue event，(0, 0) 直接退出 queue loop。

        Returns:
            (position, total) — position 為 1-indexed，total 為全局等待數
        """
        async with self._lock:
            if entry.state != _EntryState.QUEUED:
                return (0, 0)
            return self._compute_position_locked(entry)

    async def release_entry(self, entry: _QueueEntry, failed: bool = False):
        """
        Safe finalizer for an entry. If still queued, degrades to cancellation. Idempotent.

        不管 entry 當前在什麼狀態，都安全地將其帶入終態。
        可以安全地重複調用，不會重複記賬。

        Args:
            entry: 要釋放的 entry
            failed: True 表示任務失敗（記入 failed 統計），False 表示成功完成
        """
        async with self._lock:
            if entry.state == _EntryState.RELEASED:
                return  # 已釋放，no-op
            if entry.state == _EntryState.CANCELLED:
                return  # 已取消，no-op
            if entry.state == _EntryState.QUEUED:
                # 還在排隊中，未被 dispatch — 降級為 cancel
                self._remove_from_queue_locked(entry)
                entry.state = _EntryState.CANCELLED
                logger.debug(
                    "AI gate release→cancel: %s (seq=%d) — still queued",
                    entry.task_name, entry.sequence,
                )
                return
            # state == DISPATCHED — 正式釋放
            entry.state = _EntryState.RELEASED
            self._used_capacity -= entry.weight
            self._stats["running"] -= 1
            if failed:
                self._stats["failed"] += 1
            else:
                self._stats["completed"] += 1
            # 記錄完成耗時，移除 running task
            for t in self._running_tasks:
                if t["id"] == entry.sequence:
                    self._recent_durations.append(
                        time.monotonic() - t["started_at"]
                    )
                    break
            self._running_tasks = [
                t for t in self._running_tasks if t["id"] != entry.sequence
            ]
            logger.info(
                "AI gate release: %s (w=%d seq=%d failed=%s) capacity=%d/%d",
                entry.task_name, entry.weight, entry.sequence, failed,
                self._used_capacity, self._total_capacity,
            )
            self._try_dispatch()

    async def cancel(self, entry: _QueueEntry) -> bool:
        """
        取消一個排隊中的任務。

        只能取消 QUEUED 狀態的 entry。如果 entry 已被 dispatch 或已終態，
        返回 False — 調用端應改用 release_entry()。

        典型用法（處理斷開/取消）：
            cancelled = await scheduler.cancel(entry)
            if not cancelled:
                await scheduler.release_entry(entry, failed=True)

        Returns:
            True = 成功取消（從隊列移除）
            False = entry 已非 QUEUED 狀態，需要走 release_entry
        """
        async with self._lock:
            if entry.state != _EntryState.QUEUED:
                return False
            self._remove_from_queue_locked(entry)
            entry.state = _EntryState.CANCELLED
            logger.info(
                "AI gate cancel: %s (seq=%d) removed from queue",
                entry.task_name, entry.sequence,
            )
            return True

    # ================================================================
    #  高層 API — 隱藏式排隊（向後兼容）
    # ================================================================

    @asynccontextmanager
    async def acquire(self, task_name: str, priority: int, weight: int):
        """
        獲取 GPU 容量槽位（高層封裝）。

        隱藏排隊等待過程，適合不需要觀測排隊位置的功能。
        需要排隊可觀測性的功能請使用 enqueue() + release_entry()。

        用法::

            async with scheduler.acquire("vision_ocr", Priority.INTERACTIVE, Weight.VISION_SINGLE):
                # 在此區間內佔用 weight 個容量單位
                response = await client.post(...)
        """
        # 使用 enqueue 入隊（共用同一套狀態機）
        entry = await self.enqueue(task_name, priority, weight)

        # 等待被調度
        await entry.event.wait()

        logger.info(
            "AI gate dispatch: %s (pri=%d w=%d) running=%d capacity=%d/%d",
            task_name, priority, weight,
            self._stats["running"],
            self._used_capacity, self._total_capacity,
        )

        # 執行區：分離 completed / failed
        try:
            yield
        except Exception:
            await self.release_entry(entry, failed=True)
            raise
        else:
            await self.release_entry(entry, failed=False)

    # ================================================================
    #  內部方法
    # ================================================================

    def _try_dispatch(self):
        """
        從最高優先級層開始，掃描可調度任務。

        避免隊頭阻塞：如果 deque 頭太重放不下，繼續往後找同層更輕的任務。
        dispatch 成功後繼續嘗試填更多任務，直到容量用盡。

        dispatch 時原子完成所有狀態轉換：
        - 從隊列移除
        - state = DISPATCHED
        - 增加 used_capacity
        - 更新 running stats
        - 註冊 running task
        - entry.event.set()

        注意：此方法必須在持有 self._lock 的情況下調用。
        """
        remaining = self._total_capacity - self._used_capacity
        if remaining <= 0:
            return

        # 按優先級從高到低遍歷各層
        empty_pris = []
        for pri in sorted(self._layers.keys()):
            layer = self._layers[pri]
            i = 0
            while i < len(layer):
                entry = layer[i]
                if entry.weight <= remaining:
                    # 可調度！從 deque 中移除
                    del layer[i]  # O(n) 但 deque 通常極短（< 30）
                    # ---- 原子完成所有 dispatch 狀態轉換 ----
                    entry.state = _EntryState.DISPATCHED
                    self._used_capacity += entry.weight
                    self._stats["queued"] -= 1
                    self._stats["running"] += 1
                    self._running_tasks.append({
                        "id": entry.sequence,
                        "task_name": entry.task_name,
                        "weight": entry.weight,
                        "priority": entry.priority,
                        "started_at": time.monotonic(),
                    })
                    remaining -= entry.weight
                    entry.event.set()  # 喚醒等待的協程（最後執行）
                    # 不 break — 繼續嘗試填更多任務
                    if remaining <= 0:
                        # 清理空層後返回
                        if not layer:
                            empty_pris.append(pri)
                        for p in empty_pris:
                            self._layers.pop(p, None)
                        return
                else:
                    i += 1
            if not layer:
                empty_pris.append(pri)

        # 清理空層
        for p in empty_pris:
            self._layers.pop(p, None)

    def _compute_position_locked(self, entry: _QueueEntry) -> tuple[int, int]:
        """
        計算 entry 在全局隊列中的位置。必須持有 _lock。

        遍歷所有 priority 層，統計會在此 entry 之前被 dispatch 的任務數。
        """
        position = 0
        for pri in sorted(self._layers.keys()):
            layer = self._layers.get(pri, deque())
            if pri < entry.priority:
                # 更高優先級的任務全部排在前面
                position += len(layer)
            elif pri == entry.priority:
                # 同優先級，FIFO 排在前面的
                for e in layer:
                    if e.sequence == entry.sequence:
                        break
                    position += 1
                break
            else:
                break  # 更低優先級不會排在前面
        total = sum(len(l) for l in self._layers.values())
        return (position + 1, total)  # 1-indexed

    def _remove_from_queue_locked(self, entry: _QueueEntry):
        """從 _layers 中按 sequence 精準移除 entry。必須持有 _lock。"""
        layer = self._layers.get(entry.priority)
        if layer:
            for i, e in enumerate(layer):
                if e.sequence == entry.sequence:
                    del layer[i]
                    self._stats["queued"] -= 1
                    if not layer:
                        self._layers.pop(entry.priority, None)
                    return

    # ================================================================
    #  統計
    # ================================================================

    @property
    def stats(self) -> dict:
        """返回調度器統計信息（用於 /health 端點）"""
        avg = (sum(self._recent_durations) / len(self._recent_durations)
               if self._recent_durations else 90.0)  # 默認 90 秒
        return {
            **self._stats,
            "capacity": f"{self._used_capacity}/{self._total_capacity}",
            "avg_duration": round(avg, 1),
            "concurrency": self._total_capacity,
        }

    async def get_detailed_stats(self) -> dict:
        """
        返回詳細調度器統計（用於 AI 監控面板）。

        在鎖內原子快照所有狀態，出鎖後計算派生值。
        """
        now = time.monotonic()

        # ---- 鎖內：原子快照 ----
        async with self._lock:
            stats_snap = dict(self._stats)
            used = self._used_capacity
            total = self._total_capacity
            created_at = self._created_at
            running_snap = [dict(t) for t in self._running_tasks]
            layer_snap: dict[int, list[dict]] = {}
            for pri, layer in self._layers.items():
                layer_snap[pri] = [
                    {
                        "task_name": e.task_name,
                        "weight": e.weight,
                        "created_at": e.created_at,
                    }
                    for e in layer
                ]

        # ---- 鎖外：計算派生值 ----
        queue_details = {}
        for pri in sorted(layer_snap.keys()):
            entries = layer_snap[pri]
            items = []
            for e in entries:
                items.append({
                    "task_name": e["task_name"],
                    "weight": e["weight"],
                    "wait_seconds": round(now - e["created_at"], 1),
                })
            # 按最長等待優先排序
            items.sort(key=lambda x: x["wait_seconds"], reverse=True)
            pri_name = self._PRI_NAMES.get(pri, str(pri))
            queue_details[pri_name] = {
                "depth": len(items),
                "entries": items,
            }

        running_details = []
        for t in running_snap:
            running_details.append({
                "id": t["id"],
                "task_name": t["task_name"],
                "weight": t["weight"],
                "priority": self._PRI_NAMES.get(t["priority"], str(t["priority"])),
                "running_seconds": round(now - t["started_at"], 1),
            })

        return {
            **stats_snap,
            "capacity_used": used,
            "capacity_total": total,
            "capacity": f"{used}/{total}",
            "uptime_seconds": round(now - created_at, 1),
            "queue_details": queue_details,
            "running_details": running_details,
        }


# ================================================================
#  全局單例：調度器
# ================================================================

_scheduler: Optional[WeightedPriorityScheduler] = None


def get_scheduler() -> WeightedPriorityScheduler:
    """獲取全局 AI 調度器單例"""
    global _scheduler
    if _scheduler is None:
        from app.config.settings import get_settings
        settings = get_settings()
        cap = settings.ai_concurrent_limit
        _scheduler = WeightedPriorityScheduler(total_capacity=cap)
        logger.info("AI 調度器初始化 (capacity=%d)", cap)
    return _scheduler


def get_ai_gate_stats() -> dict:
    """獲取 AI 調度器統計（用於健康檢查）"""
    return get_scheduler().stats


async def get_ai_gate_detailed_stats() -> dict:
    """獲取 AI 調度器詳細統計（用於監控面板）"""
    return await get_scheduler().get_detailed_stats()


# ================================================================
#  全局單例：共享 AsyncClient（連接池複用）
# ================================================================

_shared_client: Optional[httpx.AsyncClient] = None


def get_shared_ollama_client() -> httpx.AsyncClient:
    """
    獲取共享的 Ollama httpx.AsyncClient。

    相比每次請求建新連接：
    - 複用 TCP 連接（keep-alive）
    - 減少 connect 延遲
    - 避免端口耗盡
    """
    global _shared_client
    if _shared_client is None:
        from app.config.settings import get_settings
        settings = get_settings()
        base_url = settings.llm_local_base_url
        _shared_client = httpx.AsyncClient(
            base_url=base_url,
            limits=httpx.Limits(
                max_connections=20,
                max_keepalive_connections=10,
            ),
            # 默認超時：單個請求可以覆蓋
            timeout=httpx.Timeout(1200.0, connect=30.0),
        )
        logger.info("共享 Ollama AsyncClient 初始化 (base_url=%s)", base_url)
    return _shared_client


async def close_shared_client():
    """關閉共享 AsyncClient（在 app shutdown 時調用）"""
    global _shared_client
    if _shared_client is not None:
        await _shared_client.aclose()
        _shared_client = None
        logger.info("共享 Ollama 連接已關閉")


# ================================================================
#  便利 API：ai_gate() context manager
# ================================================================

@asynccontextmanager
async def ai_gate(
    task_name: str,
    priority: int = Priority.INTERACTIVE,
    weight: int = Weight.CHAT,
):
    """
    一行整合 調度器 + 共享連接池。

    高層封裝，隱藏排隊等待。適合不需要排隊可觀測性的功能。
    需要推送排隊位置的功能，請使用 scheduler.enqueue() + release_entry()。

    用法::

        from app.core.ai_gate import ai_gate, Priority, Weight

        async with ai_gate("vision_ocr", Priority.INTERACTIVE, Weight.VISION_SINGLE) as client:
            response = await client.post("/api/chat", json=payload, timeout=...)
    """
    scheduler = get_scheduler()
    async with scheduler.acquire(task_name, priority, weight):
        yield get_shared_ollama_client()
