"""LLM-based dictation grader.

Single responsibility: take (reference, OCR text, mechanical diff) and
ask an LLM to return a refined judgement.

What this module does NOT do:
  - touch the DB
  - touch images
  - decide submission status (the service does that)
  - build prompts (that's grader_prompts.py)
  - parse LLM output (that's grader_prompts.py)

The grader is constructed with an `ask_ai` callable, so it doesn't know
or care which LLM provider is behind it.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Optional

from app.domains.dictation.grader_prompts import (
    build_grading_prompt,
    normalize_grading_payload,
    parse_grading_response,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GradingResult:
    """Frozen DTO returned by DictationGrader.grade().

    Service layer is the only consumer; it decides how to persist + how
    to flip submission status based on the `confidence` field.
    """
    score: float = 0.0
    confirmed_items: tuple = ()
    overall_feedback: str = ""
    notable_errors: tuple = ()
    minor_issues: tuple = ()
    confidence: float = 0.0
    success: bool = True
    error: Optional[str] = None


class DictationGrader:
    """LLM judge for dictation submissions.

    Args:
        ask_ai: callable returning a string (sync or async). Whatever
                LLM provider is configured at app startup will be wired
                in via container.inject_ai_functions().
        timeout_sec: hard timeout for the LLM call (defaults to 30s).
    """

    def __init__(
        self,
        ask_ai: Callable[..., Any],
        timeout_sec: int = 30,
    ):
        self._ask_ai = ask_ai
        self._timeout_sec = timeout_sec

    async def grade(
        self,
        *,
        reference: str,
        student_text: str,
        diff: Dict[str, Any],
        language: str,
        mode: str,
    ) -> GradingResult:
        fallback_score = float(diff.get("accuracy", 0.0))

        if not self._ask_ai:
            return GradingResult(
                score=fallback_score, success=False, error="no ask_ai callable",
            )

        prompt = build_grading_prompt(
            reference=reference,
            student_text=student_text,
            diff=diff,
            language=language,
            mode=mode,
        )

        try:
            raw_response = await asyncio.wait_for(
                self._call_ask_ai(prompt), timeout=self._timeout_sec,
            )
        except asyncio.TimeoutError:
            logger.warning("LLM grader timed out after %ds", self._timeout_sec)
            return GradingResult(
                score=fallback_score, success=False, error="grader_timeout",
            )
        except Exception as e:
            logger.exception("LLM grader call failed")
            return GradingResult(
                score=fallback_score, success=False, error=f"grader_call_failed: {e}",
            )

        parsed = parse_grading_response(raw_response or "")
        if parsed is None:
            logger.warning("LLM grader returned non-JSON response")
            return GradingResult(
                score=fallback_score, success=False, error="grader_parse_failed",
            )

        clean = normalize_grading_payload(parsed, fallback_score=fallback_score)
        return GradingResult(
            score=clean["score"],
            confirmed_items=tuple(clean["confirmed_items"]),
            overall_feedback=clean["overall_feedback"],
            notable_errors=tuple(clean["notable_errors"]),
            minor_issues=tuple(clean["minor_issues"]),
            confidence=clean["confidence"],
            success=True,
        )

    async def _call_ask_ai(self, prompt: str) -> str:
        """Call ask_ai with whatever signature it has.

        ask_ai may be sync or async; existing project conventions vary.
        We support both and run sync calls in a thread executor.
        """
        result = self._ask_ai(prompt)
        if inspect.isawaitable(result):
            return str(await result)
        # Sync function — push to executor so we don't block the loop
        return str(
            await asyncio.get_event_loop().run_in_executor(
                None, lambda: self._ask_ai(prompt),
            )
        )

    @staticmethod
    def grading_to_dict(grading: Optional["GradingResult"]) -> Optional[Dict[str, Any]]:
        """Convert a GradingResult into a JSON-friendly dict for storage.

        Returns None if grading is None or failed.
        """
        if grading is None or not grading.success:
            return None
        return {
            "score": grading.score,
            "confirmed_items": list(grading.confirmed_items),
            "overall_feedback": grading.overall_feedback,
            "notable_errors": list(grading.notable_errors),
            "minor_issues": list(grading.minor_issues),
            "confidence": grading.confidence,
        }
