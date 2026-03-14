"""
投票幻灯片处理器

教师发起投票 → 学生选择选项 → 实时/结束后显示统计。

生命周期：PREPARED → ACTIVATED → RESPONDING → CLOSED → RESULTS_SHOWN → COMPLETED
"""

import json

from pydantic import BaseModel

from app.domains.classroom.slide_configs import PollSlideConfig

from .base import SlideHandler


class PollSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return PollSlideConfig(**config)

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
        config = PollSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "poll",
            "title": slide.get("title", ""),
            "question_text": config.question_text,
            "options": config.options,
            "allow_multiple": config.allow_multiple,
            "anonymous": config.anonymous,
            "show_results_live": config.show_results_live,
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        config = PollSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "poll",
            "question_text": config.question_text,
            "options": config.options,
            "total_responses": len(responses),
            "results": self.aggregate_results(responses),
        }

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        config = PollSlideConfig(**slide["config"])
        selected = data.get("selected_options", [])

        # 单选模式下只保留第一个
        if not config.allow_multiple and len(selected) > 1:
            selected = selected[:1]

        # 校验选项索引范围
        max_idx = len(config.options) - 1
        selected = [i for i in selected if isinstance(i, int) and 0 <= i <= max_idx]

        return {"is_correct": None, "score": None}

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        vote_counts: dict[str, int] = {}

        for r in responses:
            rd = r.get("response_data", {})
            if isinstance(rd, str):
                rd = json.loads(rd)
            selected = rd.get("selected_options", [])
            for idx in selected:
                key = str(idx)
                vote_counts[key] = vote_counts.get(key, 0) + 1

        total_votes = sum(vote_counts.values()) or 1
        percentages = {
            k: round(v / total_votes * 100, 1)
            for k, v in vote_counts.items()
        }

        return {
            "total_responses": len(responses),
            "vote_counts": vote_counts,
            "percentages": percentages,
        }
