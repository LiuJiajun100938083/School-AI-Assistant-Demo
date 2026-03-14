"""
链接+二维码幻灯片处理器

展示 URL 和对应 QR 码，让学生扫码/点击访问。
最简单的类型：无响应、无结果。

生命周期：PREPARED → ACTIVATED → COMPLETED
"""

from pydantic import BaseModel

from app.domains.classroom.slide_configs import LinkSlideConfig

from .base import SlideHandler


class LinkSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return LinkSlideConfig(**config)

    # ── Lifecycle ─────────────────────────────────────────

    def get_allowed_lifecycle(self) -> list[str]:
        return ["prepared", "activated", "completed"]

    def get_allowed_transitions(self) -> dict[str, list[str]]:
        return {
            "activate": ["prepared"],
            "complete": ["activated"],
        }

    def get_auto_transitions(self) -> dict[str, str]:
        return {"activated": "completed"}

    # ── Payload ───────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        config = LinkSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "link",
            "title": slide.get("title", ""),
            "url": config.url,
            "description": config.description,
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        payload = self.build_student_payload(slide, session)
        payload["_teacher"] = True
        return payload
