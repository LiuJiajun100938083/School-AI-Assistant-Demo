"""
批量 AI 批改 — 背景任務管理器

管理批量批改的 job 生命周期:
  pending → running → done / cancelled / failed

限制: 單實例內存型，重啟後 in-flight jobs 丟失。
"""

import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class BatchJob:
    """批量批改任務狀態"""

    assignment_id: int
    status: str = "pending"        # pending / running / done / cancelled / failed
    total: int = 0
    done: int = 0
    success: int = 0
    fail: int = 0
    cancelled: bool = False
    extra_prompt: str = ""

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "total": self.total,
            "done": self.done,
            "success": self.success,
            "fail": self.fail,
        }


class BatchGradingManager:
    """批量 AI 批改任務管理器"""

    def __init__(self):
        self._jobs: Dict[int, BatchJob] = {}
        self._lock = threading.Lock()

    def start_batch(
        self,
        assignment_id: int,
        submission_ids: List[int],
        teacher_id: int,
        extra_prompt: str = "",
        grade_fn: Callable = None,
        save_fn: Callable = None,
    ) -> BatchJob:
        """
        啟動批量批改。

        Parameters
        ----------
        grade_fn : callable(sub_id, extra_prompt) -> dict
            AI 批改函式 (AssignmentService.ai_grade_submission)
        save_fn : callable(sub_id, teacher_id, rubric_scores, feedback) -> None
            保存批改結果函式 (AssignmentService.grade_submission)
        """
        with self._lock:
            existing = self._jobs.get(assignment_id)
            if existing and existing.status == "running":
                return existing

            job = BatchJob(
                assignment_id=assignment_id,
                status="running",
                total=len(submission_ids),
                extra_prompt=extra_prompt,
            )
            self._jobs[assignment_id] = job

        t = threading.Thread(
            target=self._worker,
            args=(job, submission_ids, teacher_id, grade_fn, save_fn),
            daemon=True,
        )
        t.start()
        return job

    def get_status(self, assignment_id: int) -> Optional[BatchJob]:
        return self._jobs.get(assignment_id)

    def cancel(self, assignment_id: int) -> bool:
        job = self._jobs.get(assignment_id)
        if not job or job.status != "running":
            return False
        job.cancelled = True
        return True

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _worker(
        self,
        job: BatchJob,
        submission_ids: List[int],
        teacher_id: int,
        grade_fn: Callable,
        save_fn: Callable,
    ) -> None:
        """背景線程: 逐份 AI 批改 + 自動保存"""
        for sub_id in submission_ids:
            if job.cancelled:
                job.status = "cancelled"
                return

            try:
                result = grade_fn(sub_id, extra_prompt=job.extra_prompt)
                if result.get("error"):
                    job.fail += 1
                    job.done += 1
                    continue

                scores = self._extract_scores(result)
                save_fn(
                    submission_id=sub_id,
                    teacher_id=teacher_id,
                    rubric_scores=scores,
                    feedback=result.get("overall_feedback", "AI 自動批改"),
                )
                job.success += 1

            except Exception as e:
                logger.error("批量 AI 批改 submission #%d 失敗: %s", sub_id, e)
                job.fail += 1

            job.done += 1

        job.status = "done"

    @staticmethod
    def _extract_scores(result: dict) -> List[dict]:
        """從 AI 批改結果中提取分數列表"""
        scores = []
        if result.get("selected_level") is not None:
            scores.append({
                "rubric_item_id": 0,
                "points": result.get("points", 0),
                "selected_level": result.get("selected_level", ""),
            })
        else:
            for item in result.get("items", []):
                entry: dict = {"rubric_item_id": item["rubric_item_id"]}
                if item.get("points") is not None:
                    entry["points"] = item["points"]
                if item.get("passed") is not None:
                    entry["points"] = 1 if item["passed"] else 0
                if item.get("selected_level"):
                    entry["selected_level"] = item["selected_level"]
                scores.append(entry)
        return scores


@dataclass
class PlagiarismJob:
    """抄袭檢測任務狀態"""

    assignment_id: int
    report_id: int = 0
    status: str = "pending"
    total_pairs: int = 0
    flagged_pairs: int = 0
    # 即時進度
    progress: int = 0
    phase: str = "extract"
    phase_done: int = 0
    phase_total: int = 0
    detail: str = ""
    error: str = ""

    def to_dict(self) -> dict:
        return {
            "status": self.status,
            "report_id": self.report_id,
            "progress": self.progress,
            "phase": self.phase,
            "phase_done": self.phase_done,
            "phase_total": self.phase_total,
            "detail": self.detail,
            "total_pairs": self.total_pairs,
            "flagged_pairs": self.flagged_pairs,
        }


class PlagiarismJobManager:
    """抄袭檢測背景任務管理器"""

    _PHASE_WEIGHTS = {"extract": 5, "compare": 60, "ai": 30, "save": 5}
    _PHASE_ORDER = ["extract", "compare", "ai", "save"]

    def __init__(self):
        self._jobs: Dict[int, PlagiarismJob] = {}
        self._lock = threading.Lock()

    def start_check(
        self,
        assignment_id: int,
        report_id: int,
        run_check_fn: Callable,
        get_report_fn: Callable,
    ) -> PlagiarismJob:
        with self._lock:
            existing = self._jobs.get(assignment_id)
            if existing and existing.status == "running":
                return existing

            job = PlagiarismJob(
                assignment_id=assignment_id,
                report_id=report_id,
                status="running",
            )
            self._jobs[assignment_id] = job

        t = threading.Thread(
            target=self._worker,
            args=(job, run_check_fn, get_report_fn),
            daemon=True,
        )
        t.start()
        return job

    def get_status(self, assignment_id: int) -> Optional[PlagiarismJob]:
        return self._jobs.get(assignment_id)

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _worker(
        self,
        job: PlagiarismJob,
        run_check_fn: Callable,
        get_report_fn: Callable,
    ) -> None:
        def _on_progress(phase: str, done: int, total: int, detail: str = ""):
            job.phase = phase
            job.phase_done = done
            job.phase_total = total
            job.detail = detail

            weight = self._PHASE_WEIGHTS.get(phase, 0)
            phase_pct = (done / max(total, 1)) * weight
            completed_pct = sum(
                self._PHASE_WEIGHTS[p]
                for p in self._PHASE_ORDER
                if self._PHASE_ORDER.index(p) < self._PHASE_ORDER.index(phase)
            ) if phase in self._PHASE_ORDER else 0
            job.progress = min(round(completed_pct + phase_pct), 100)

        try:
            run_check_fn(job.report_id, progress_callback=_on_progress)
            report = get_report_fn(job.report_id)
            if report:
                job.status = report.get("status", "completed")
                job.total_pairs = report.get("total_pairs", 0)
                job.flagged_pairs = report.get("flagged_pairs", 0)
            else:
                job.status = "completed"
            job.progress = 100
        except Exception as e:
            logger.error("抄袭檢測失敗 (assignment #%d): %s", job.assignment_id, e)
            job.status = "failed"
            job.error = str(e)
