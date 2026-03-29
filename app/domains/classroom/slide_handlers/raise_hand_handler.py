"""
举手幻灯片处理器

教师发起提示 → 学生举手 → 教师查看举手名单。

生命周期：PREPARED → ACTIVATED → RESPONDING → CLOSED → RESULTS_SHOWN → COMPLETED
"""

import json

from pydantic import BaseModel

from app.domains.classroom.slide_configs import RaiseHandSlideConfig

from .base import SlideHandler


class RaiseHandSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return RaiseHandSlideConfig(**config)

    # ── Lifecycle ─────────────────────────────────────────

    def get_allowed_lifecycle(self) -> list[str]:
        return [
            "prepared", "activated", "responding",
            "closed", "results_shown", "completed",
        ]

    def get_allowed_transitions(self) -> dict[str, list[str]]:
        return {
            "activate": ["prepared"],
            "open_responses": ["activated"],
            "close_responses": ["responding"],
            "show_results": ["closed"],
            "complete": ["results_shown"],
        }

    def get_auto_transitions(self) -> dict[str, str]:
        return {}

    # ── Payload ───────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        config = RaiseHandSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "raise_hand",
            "title": slide.get("title", ""),
            "prompt_text": config.prompt_text,
            "max_hands": config.max_hands,
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        config = RaiseHandSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "raise_hand",
            "prompt_text": config.prompt_text,
            "max_hands": config.max_hands,
            "total_responses": len(responses),
            "results": self.aggregate_results(responses),
        }

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        # 举手无对错之分
        return {"is_correct": None, "score": None}

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        hands = []
        for r in responses:
            hands.append({
                "username": r.get("student_username", ""),
                "raised_at": r.get("created_at", ""),
            })

        return {
            "total_hands": len(hands),
            "students": hands,
        }
