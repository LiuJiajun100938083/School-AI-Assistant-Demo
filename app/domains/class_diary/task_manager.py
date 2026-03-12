"""
課室日誌 — 任務管理器
======================
管理後台長時間運行任務（AI 報告生成、XLSX 匯出等）。

使用 threading.Thread 在後台執行，記憶體中追蹤狀態。
服務器重啟後任務記錄丟失（正常，因報告結果已入庫）。
"""

import logging
import threading
import time
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


class ClassDiaryTaskManager:
    """單例任務管理器"""

    _instance: Optional["ClassDiaryTaskManager"] = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._tasks: Dict[str, Dict[str, Any]] = {}
                    cls._instance._tasks_lock = threading.Lock()
        return cls._instance

    def submit(
        self,
        task_type: str,
        func: Callable,
        requested_by: str,
        description: str = "",
        **kwargs,
    ) -> str:
        """提交一個後台任務，返回 task_id"""
        task_id = str(uuid.uuid4())[:8]
        task = {
            "task_id": task_id,
            "task_type": task_type,
            "description": description,
            "requested_by": requested_by,
            "status": "running",
            "progress": None,
            "result": None,
            "error": None,
            "created_at": datetime.now().isoformat(),
            "completed_at": None,
        }

        with self._tasks_lock:
            self._tasks[task_id] = task

        def _run():
            try:
                result = func(**kwargs)
                with self._tasks_lock:
                    self._tasks[task_id]["status"] = "done"
                    self._tasks[task_id]["result"] = result
                    self._tasks[task_id]["completed_at"] = datetime.now().isoformat()
                logger.info("任務完成: %s (%s)", task_id, task_type)
            except Exception as e:
                with self._tasks_lock:
                    self._tasks[task_id]["status"] = "failed"
                    self._tasks[task_id]["error"] = str(e)[:500]
                    self._tasks[task_id]["completed_at"] = datetime.now().isoformat()
                logger.exception("任務失敗: %s (%s)", task_id, task_type)

        t = threading.Thread(target=_run, daemon=True, name=f"cd-task-{task_id}")
        t.start()
        return task_id

    def get_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """查詢任務狀態"""
        with self._tasks_lock:
            task = self._tasks.get(task_id)
            return dict(task) if task else None

    def list_tasks(
        self, requested_by: Optional[str] = None, limit: int = 20
    ) -> List[Dict[str, Any]]:
        """列出任務（最近的在前）"""
        with self._tasks_lock:
            tasks = list(self._tasks.values())
        if requested_by:
            tasks = [t for t in tasks if t["requested_by"] == requested_by]
        tasks.sort(key=lambda t: t["created_at"], reverse=True)
        return tasks[:limit]

    def cleanup_old(self, max_age_seconds: int = 3600):
        """清理超過 max_age 的已完成任務"""
        now = time.time()
        with self._tasks_lock:
            to_remove = []
            for tid, t in self._tasks.items():
                if t["status"] in ("done", "failed") and t.get("completed_at"):
                    try:
                        completed = datetime.fromisoformat(t["completed_at"])
                        age = now - completed.timestamp()
                        if age > max_age_seconds:
                            to_remove.append(tid)
                    except (ValueError, TypeError):
                        pass
            for tid in to_remove:
                del self._tasks[tid]


# 全局單例
task_manager = ClassDiaryTaskManager()
