"""
幻灯片处理器 — 抽象基类

每种 slide_type 实现此接口，实现：
- 配置校验
- 生命周期策略
- 推送负载构建
- 响应处理
- 结果聚合
- 运行态解析

Handler 是纯逻辑层：不碰 DB，不碰 WS，方便测试。
"""

from abc import ABC, abstractmethod
from typing import Any, Optional

from pydantic import BaseModel


class SlideHandler(ABC):
    """幻灯片处理器抽象基类"""

    # ── Config ────────────────────────────────────────────

    @abstractmethod
    def validate_config(self, config: dict) -> BaseModel:
        """校验并返回 typed config model，无效则抛 ValidationError。"""
        ...

    # ── Lifecycle Policy ──────────────────────────────────

    @abstractmethod
    def get_allowed_lifecycle(self) -> list[str]:
        """该类型使用的生命周期状态列表。"""
        ...

    @abstractmethod
    def get_allowed_transitions(self) -> dict[str, list[str]]:
        """
        允许的 teacher action → 要求的当前 lifecycle。
        e.g. {"activate": ["prepared"], "open_responses": ["activated"], ...}
        """
        ...

    @abstractmethod
    def get_auto_transitions(self) -> dict[str, str]:
        """
        自动状态转移规则。
        e.g. {"activated": "responding"} 表示进入 activated 后自动进入 responding。
        返回空 dict 表示无自动转移。
        """
        ...

    # ── Push Payload ──────────────────────────────────────

    @abstractmethod
    def build_student_payload(self, slide: dict, session: dict) -> dict:
        """构建推送给学生的 WS 消息 data 部分。"""
        ...

    @abstractmethod
    def build_teacher_view_model(
        self, slide: dict, session: dict, responses: list[dict]
    ) -> dict:
        """构建教师 live view 需要的数据模型。"""
        ...

    # ── Response ──────────────────────────────────────────

    def handle_response(
        self,
        slide: dict,
        student_username: str,
        data: dict,
        session: dict,
    ) -> dict:
        """
        处理学生响应，返回结果 dict。
        默认实现直接返回空（不需要响应的类型如 ppt）。
        子类按需覆写。

        返回值包含:
          - is_correct: bool | None
          - score: float | None
          - extra: dict (可选，如 rank)
        """
        return {"is_correct": None, "score": None}

    # ── Results ───────────────────────────────────────────

    def aggregate_results(self, responses: list[dict]) -> dict:
        """
        聚合所有学生响应，返回统计结果。
        默认返回 total_responses 计数。
        """
        return {"total_responses": len(responses)}

    # ── Runtime Meta ──────────────────────────────────────

    def parse_runtime_meta(self, meta: Optional[dict]) -> Optional[BaseModel]:
        """解析运行态 JSON，返回 typed model。默认 None（无运行态）。"""
        return None

    def get_initial_runtime_meta(self) -> Optional[dict]:
        """新 slide 开始时的初始运行态。默认 None。"""
        return None
