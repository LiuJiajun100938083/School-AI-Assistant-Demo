"""
PPT 幻灯片处理器

PPT 是最简单的类型：只展示图片+标注，无响应、无结果。
生命周期：PREPARED → ACTIVATED → COMPLETED
"""

from pydantic import BaseModel

from app.domains.classroom.slide_configs import PPTSlideConfig

from .base import SlideHandler


class PPTSlideHandler(SlideHandler):

    def validate_config(self, config: dict) -> BaseModel:
        return PPTSlideConfig(**config)

    # ── Lifecycle ─────────────────────────────────────────

    def get_allowed_lifecycle(self) -> list[str]:
        return ["prepared", "activated", "completed"]

    def get_allowed_transitions(self) -> dict[str, list[str]]:
        return {
            "activate": ["prepared"],
            "complete": ["activated"],
        }

    def get_auto_transitions(self) -> dict[str, str]:
        # PPT: activate 后自动 complete (教师一键推就好)
        return {"activated": "completed"}

    # ── Payload ───────────────────────────────────────────

    def build_student_payload(self, slide: dict, session: dict) -> dict:
        config = PPTSlideConfig(**slide["config"])
        return {
            "slide_id": slide["slide_id"],
            "slide_order": slide["slide_order"],
            "slide_type": "ppt",
            "title": slide.get("title", ""),
            "page_id": config.page_id or config.file_id,
            "page_number": config.page_number,
            "file_id": config.file_id,
            "annotations_json": session.get("annotations_json"),
        }

    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        payload = self.build_student_payload(slide, session)
        payload["_teacher"] = True
        return payload
