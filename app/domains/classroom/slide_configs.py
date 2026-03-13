"""
课案幻灯片 — 类型专属配置 (Typed Config Schemas)

每种 slide_type 有严格的 Pydantic 模型校验，
不允许存储未经校验的 JSON。

同时定义 runtime_meta 类型（运行时临时状态）。
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field


# ============================================================
# Slide Config Models (静态配置，存入 lesson_slides.config)
# ============================================================

class PPTSlideConfig(BaseModel):
    """PPT 幻灯片配置"""
    file_id: str = Field(..., description="PPT 文件 ID")
    page_number: int = Field(..., ge=1, description="页码 (从 1 开始)")
    page_id: Optional[str] = Field(default=None, description="PPT 页面 ID")


class GameSlideConfig(BaseModel):
    """游戏幻灯片配置"""
    game_uuid: str = Field(..., description="游戏 UUID")
    game_name: str = Field(..., description="游戏名称")
    game_url: str = Field(..., description="游戏页面 URL")
    time_limit: int = Field(default=0, ge=0, description="时间限制 (秒, 0=无限)")
    collect_scores: bool = Field(default=True, description="是否收集分数")


class QuizQuestion(BaseModel):
    """单道 Quiz 题目"""
    id: str = Field(..., description="题目 ID (slide 内唯一)")
    type: Literal["mc", "fill", "tf"] = Field(..., description="题型: 选择/填空/判断")
    text: str = Field(..., min_length=1, description="题目文本")
    options: Optional[list[str]] = Field(default=None, description="选项列表 (mc/tf 用)")
    correct_answer: str = Field(..., description="正确答案")
    points: int = Field(default=10, ge=0, description="分值")


class QuizSlideConfig(BaseModel):
    """Quiz 幻灯片配置"""
    questions: list[QuizQuestion] = Field(..., min_length=1, description="题目列表")
    time_limit: int = Field(default=60, ge=0, description="答题时限 (秒, 0=无限)")
    show_results_live: bool = Field(default=True, description="是否实时显示结果")
    allow_retry: bool = Field(default=False, description="是否允许重答")


class QuickAnswerSlideConfig(BaseModel):
    """抢答幻灯片配置"""
    question_text: str = Field(..., min_length=1, description="问题文本")
    answer_type: Literal["text", "mc"] = Field(default="text", description="回答类型")
    options: Optional[list[str]] = Field(default=None, description="选项 (mc 用)")
    correct_answer: str = Field(..., description="正确答案")
    time_limit: int = Field(default=30, ge=0, description="抢答时限 (秒)")
    points: int = Field(default=10, ge=0, description="分值")


class RaiseHandSlideConfig(BaseModel):
    """举手幻灯片配置"""
    prompt_text: str = Field(..., min_length=1, description="提示文本")
    max_hands: int = Field(default=0, ge=0, description="最大举手数 (0=无限)")


class PollSlideConfig(BaseModel):
    """投票幻灯片配置"""
    question_text: str = Field(..., min_length=1, description="问题文本")
    options: list[str] = Field(..., min_length=2, description="选项列表")
    allow_multiple: bool = Field(default=False, description="是否允许多选")
    anonymous: bool = Field(default=False, description="是否匿名")
    show_results_live: bool = Field(default=True, description="是否实时显示结果")


# ============================================================
# Runtime Meta Models (短期运行态，存入 lesson_sessions.runtime_meta)
# ============================================================

class QuickAnswerRuntime(BaseModel):
    """抢答运行态"""
    winner_username: Optional[str] = None
    winner_display_name: Optional[str] = None
    winner_time_ms: Optional[int] = None
    answered_usernames: list[str] = Field(default_factory=list)


class RaiseHandRuntime(BaseModel):
    """举手运行态"""

    class HandEntry(BaseModel):
        username: str
        display_name: str = ""
        order: int
        raised_at: str  # ISO format

    hand_queue: list[HandEntry] = Field(default_factory=list)


class GameRuntime(BaseModel):
    """游戏运行态"""
    scores_received: int = 0


# ============================================================
# Registry — 按 slide_type 查找对应 model
# ============================================================

SLIDE_CONFIG_REGISTRY: dict[str, type[BaseModel]] = {
    "ppt": PPTSlideConfig,
    "game": GameSlideConfig,
    "quiz": QuizSlideConfig,
    "quick_answer": QuickAnswerSlideConfig,
    "raise_hand": RaiseHandSlideConfig,
    "poll": PollSlideConfig,
}

RUNTIME_META_REGISTRY: dict[str, type[BaseModel]] = {
    "quick_answer": QuickAnswerRuntime,
    "raise_hand": RaiseHandRuntime,
    "game": GameRuntime,
}


def validate_slide_config(slide_type: str, config: dict) -> BaseModel:
    """
    按 slide_type 校验 config，返回 typed model。
    无效则抛出 Pydantic ValidationError。
    """
    model_cls = SLIDE_CONFIG_REGISTRY.get(slide_type)
    if model_cls is None:
        raise ValueError(f"Unknown slide_type: {slide_type}")
    return model_cls(**config)


def parse_runtime_meta(slide_type: str, meta: dict | None) -> BaseModel | None:
    """按 slide_type 解析 runtime_meta，返回 typed model 或 None。"""
    if meta is None:
        return None
    model_cls = RUNTIME_META_REGISTRY.get(slide_type)
    if model_cls is None:
        return None
    return model_cls(**meta)
