"""
抢答幻灯片处理器

教师发起问题 → 学生抢答提交 → 判断对错 + 显示结果。

生命周期：PREPARED → ACTIVATED → RESPONDING → CLOSED → RESULTS_SHOWN → COMPLETED
"""

import json

from pydantic import BaseModel

from app.domains.classroom.slide_configs import QuickAnswerSlideConfig

from .base import SlideHandler


class QuickAnswerSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return QuickAnswerSlideConfig(**config)

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
        config = QuickAnswerSlideConfig(**slide["config"])
        payload = {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "quick_answer",
            "title": slide.get("title", ""),
            "question_text": config.question_text,
            "answer_type": config.answer_type,
            "time_limit": config.time_limit,
            "points": config.points,
        }
        if config.answer_type == "mc" and config.options:
            payload["options"] = config.options
        return payload

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        config = QuickAnswerSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "quick_answer",
            "question_text": config.question_text,
            "correct_answer": config.correct_answer,
            "total_responses": len(responses),
            "results": self.aggregate_results(responses),
        }

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        config = QuickAnswerSlideConfig(**slide["config"])
        answer = str(data.get("answer", "")).strip()
        correct = config.correct_answer.strip()

        is_correct = answer.lower() == correct.lower()
        score = config.points if is_correct else 0

        return {"is_correct": is_correct, "score": score}

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        correct_count = 0
        answers: list[dict] = []

        for r in responses:
            rd = r.get("response_data", {})
            if isinstance(rd, str):
                rd = json.loads(rd)
            answers.append({
                "username": r.get("student_username", ""),
                "answer": rd.get("answer", ""),
                "is_correct": r.get("is_correct"),
            })
            if r.get("is_correct"):
                correct_count += 1

        return {
            "total_responses": len(responses),
            "correct_count": correct_count,
            "accuracy": round(correct_count / len(responses) * 100, 1) if responses else 0,
            "answers": answers,
        }
