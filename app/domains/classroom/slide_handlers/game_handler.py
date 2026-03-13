"""
游戏幻灯片处理器

学生端通过 sandboxed iframe 加载游戏，
通过 postMessage 上报分数。

生命周期：PREPARED → ACTIVATED → RESPONDING → CLOSED → COMPLETED
"""

from typing import Optional

from pydantic import BaseModel

from app.domains.classroom.slide_configs import GameRuntime, GameSlideConfig

from .base import SlideHandler


class GameSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return GameSlideConfig(**config)

    # ── Lifecycle ─────────────────────────────────────────

    def get_allowed_lifecycle(self) -> list[str]:
        return ["prepared", "activated", "responding", "closed", "completed"]

    def get_allowed_transitions(self) -> dict[str, list[str]]:
        return {
            "activate": ["prepared"],
            "open_responses": ["activated"],
            "close_responses": ["responding"],
            "complete": ["closed"],
        }

    def get_auto_transitions(self) -> dict[str, str]:
        # 激活后自动进入 responding（游戏即开始）
        return {"activated": "responding"}

    # ── Payload ───────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        config = GameSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "game",
            "title": slide.get("title", "") or config.game_name,
            "game_uuid": config.game_uuid,
            "game_name": config.game_name,
            "game_url": config.game_url,
            "time_limit": config.time_limit,
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        config = GameSlideConfig(**slide["config"])
        runtime = self.parse_runtime_meta(session.get("runtime_meta"))
        scores_received = runtime.scores_received if runtime else 0
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "game",
            "game_name": config.game_name,
            "time_limit": config.time_limit,
            "scores_received": scores_received,
            "total_responses": len(responses),
            "responses": [
                {
                    "student_username": r["student_username"],
                    "score": r.get("score"),
                    "responded_at": r.get("responded_at"),
                }
                for r in responses
            ],
        }

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        score = data.get("score", 0)
        return {
            "is_correct": None,  # 游戏无正确/错误概念
            "score": float(score) if score is not None else None,
        }

    def aggregate_results(self, responses: list[dict]) -> dict:
        scores = [r.get("score", 0) or 0 for r in responses]
        return {
            "total_responses": len(responses),
            "avg_score": sum(scores) / len(scores) if scores else 0,
            "max_score": max(scores) if scores else 0,
        }

    # ── Runtime Meta ──────────────────────────────────────

    def parse_runtime_meta(self, meta: Optional[dict]) -> Optional[GameRuntime]:
        if meta is None:
            return None
        return GameRuntime(**meta)

    def get_initial_runtime_meta(self) -> Optional[dict]:
        return GameRuntime().model_dump()
