"""
互动活动幻灯片处理器

支持多种模板 (drag_sort / drag_match / drag_place / free_canvas / html_sandbox)，
通过策略模式分派评分、学生序列化、揭晓 payload。

生命周期：PREPARED → ACTIVATED (auto→) RESPONDING → CLOSED → RESULTS_SHOWN → COMPLETED
activate 后自动进入 responding，减少老师操作步骤。
"""

from typing import Optional

from pydantic import BaseModel

from app.domains.classroom.slide_configs import InteractiveRuntime, InteractiveSlideConfig

from .base import SlideHandler
from .interactive_strategies import (
    REVEAL_BUILDERS,
    SCORING_STRATEGIES,
    STUDENT_SERIALIZERS,
)


class InteractiveSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        cfg = InteractiveSlideConfig(**config)
        template_cfg = getattr(cfg, cfg.template, None)
        if template_cfg is None:
            raise ValueError(f"Missing config for template: {cfg.template}")
        return cfg

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
        # activate 后自动进 responding，学生立刻可操作
        return {"activated": "responding"}

    # ── Runtime Meta ─────────────────────────────────────

    def get_initial_runtime_meta(self) -> Optional[dict]:
        return InteractiveRuntime().model_dump()

    def parse_runtime_meta(self, meta: Optional[dict]) -> Optional[InteractiveRuntime]:
        if meta is None:
            return None
        return InteractiveRuntime(**meta)

    # ── Payload ──────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        cfg = InteractiveSlideConfig(**slide["config"])
        template_cfg = getattr(cfg, cfg.template)
        serializer = STUDENT_SERIALIZERS[cfg.template]
        runtime = self.parse_runtime_meta(session.get("runtime_meta"))
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "interactive",
            "title": slide.get("title", ""),
            "template": cfg.template,
            "time_limit": cfg.time_limit,
            "config": serializer(template_cfg),
            "locked": runtime.locked if runtime else False,
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        cfg = InteractiveSlideConfig(**slide["config"])
        runtime = self.parse_runtime_meta(session.get("runtime_meta"))
        results = self.aggregate_results(responses)
        # 排行榜根据配置决定是否返回给前端
        if not cfg.show_leaderboard:
            results.pop("leaderboard", None)
        elif cfg.show_top_n > 0 and "leaderboard" in results:
            results["leaderboard"] = results["leaderboard"][:cfg.show_top_n]
        return {
            "slide_id": slide["slide_id"],
            "slide_type": "interactive",
            "template": cfg.template,
            "locked": runtime.locked if runtime else False,
            "total_responses": len(responses),
            "results": results,
        }

    def build_reveal_payload(self, slide: dict) -> dict:
        """构建模板化揭晓数据，由 router 附到 WS broadcast 中"""
        cfg = InteractiveSlideConfig(**slide["config"])
        template_cfg = getattr(cfg, cfg.template)
        builder = REVEAL_BUILDERS[cfg.template]
        return {"template": cfg.template, "reveal": builder(template_cfg)}

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self, slide: dict, student_username: str, data: dict, session: dict
    ) -> dict:
        cfg = InteractiveSlideConfig(**slide["config"])
        template_cfg = getattr(cfg, cfg.template)
        scorer = SCORING_STRATEGIES.get(cfg.template)
        if not scorer:
            return {"is_correct": None, "score": 0.0}
        score, is_correct = scorer(template_cfg, data)
        return {"is_correct": is_correct, "score": score}

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        if not responses:
            return {"total_responses": 0, "avg_score": 0, "leaderboard": []}

        scores = [float(r.get("score", 0) or 0) for r in responses]

        leaderboard = sorted(
            [
                {
                    "username": r.get("student_username", ""),
                    "score": float(r.get("score", 0) or 0),
                }
                for r in responses
            ],
            key=lambda x: -x["score"],
        )
        for i, entry in enumerate(leaderboard):
            entry["rank"] = i + 1

        return {
            "total_responses": len(responses),
            "avg_score": round(sum(scores) / len(scores), 1),
            "perfect_count": sum(1 for s in scores if s >= 100),
            "leaderboard": leaderboard,
        }
