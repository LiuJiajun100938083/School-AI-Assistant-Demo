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


class OptionItem(BaseModel):
    """选项（带可选图片）— 兼容纯字符串，前端可传 string 或 object"""
    text: str = ""
    image_url: Optional[str] = None


class QuizQuestion(BaseModel):
    """单道 Quiz 题目"""
    id: str = Field(..., description="题目 ID (slide 内唯一)")
    type: Literal["mc", "fill", "tf"] = Field(..., description="题型: 选择/填空/判断")
    text: str = Field(..., min_length=1, description="题目文本")
    options: Optional[list] = Field(default=None, description="选项列表 (str 或 {text, image_url})")
    image_url: Optional[str] = Field(default=None, description="题目图片 URL")
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
    options: list = Field(..., min_length=2, description="选项列表 (str 或 {text, image_url})")
    allow_multiple: bool = Field(default=False, description="是否允许多选")
    anonymous: bool = Field(default=False, description="是否匿名")
    show_results_live: bool = Field(default=True, description="是否实时显示结果")


class LinkSlideConfig(BaseModel):
    """链接+二维码幻灯片配置"""
    url: str = Field(..., min_length=1, description="链接 URL")
    description: str = Field(default="", max_length=500, description="链接描述")


# ============================================================
# Interactive Activity — 互动活动配置
# ============================================================

class InteractiveItem(BaseModel):
    """可拖拽项目"""
    id: str = Field(..., description="项目唯一 ID")
    content: str = Field(..., min_length=1, description="显示文本 / 图片URL / LaTeX")
    content_type: Literal["text", "image", "math"] = "text"


class InteractiveZone(BaseModel):
    """放置区域 — 全部相对坐标 (百分比), 基于背景图尺寸"""
    id: str = Field(..., description="区域唯一 ID")
    label: str = Field(default="", description="区域标签")
    x_pct: float = Field(default=0, ge=0, le=100, description="X 位置 (%)")
    y_pct: float = Field(default=0, ge=0, le=100, description="Y 位置 (%)")
    width_pct: float = Field(default=20, gt=0, le=100, description="宽度 (%)")
    height_pct: float = Field(default=10, gt=0, le=100, description="高度 (%)")


class DragSortConfig(BaseModel):
    """拖拽排序配置"""
    items: list[InteractiveItem] = Field(..., min_length=2, description="待排序项目")
    correct_order: list[str] = Field(..., min_length=2, description="正确顺序 (item id 列表)")
    instruction: str = Field(default="將以下項目排列為正確順序", description="指令文本")


class DragMatchConfig(BaseModel):
    """拖拽配对配置"""
    left_items: list[InteractiveItem] = Field(..., min_length=2, description="左栏项目")
    right_items: list[InteractiveItem] = Field(..., min_length=2, description="右栏项目")
    correct_pairs: dict[str, str] = Field(..., description="正确配对 (left_id → right_id)")
    instruction: str = Field(default="將左右兩側配對連線", description="指令文本")


class DragPlaceConfig(BaseModel):
    """拖拽放置配置"""
    items: list[InteractiveItem] = Field(..., min_length=1, description="待放置项目")
    zones: list[InteractiveZone] = Field(..., min_length=1, description="放置区域")
    correct_placement: dict[str, str] = Field(..., description="正确放置 (item_id → zone_id)")
    background_image: Optional[str] = Field(default=None, description="背景图 URL")
    instruction: str = Field(default="將項目放置到正確位置", description="指令文本")


class FreeCanvasConfig(BaseModel):
    """自由画布配置"""
    background_image: Optional[str] = Field(default=None, description="背景图 URL")
    tools: list[str] = Field(default=["pen", "circle", "arrow", "text"], description="可用工具")
    instruction: str = Field(default="在畫布上標記或繪圖", description="指令文本")


class HtmlSandboxConfig(BaseModel):
    """代码动画沙盒配置"""
    html_content: str = Field(..., min_length=1, description="HTML 内容")
    sandbox_type: Literal["html", "iframe"] = Field(default="iframe", description="渲染方式")
    instruction: str = Field(default="與下方互動內容進行操作", description="指令文本")
    allow_student_edit: bool = Field(default=False, description="是否允许学生修改代码")


class InteractiveSlideConfig(BaseModel):
    """互动活动配置 — 通过 template 字段分派到具体模板"""
    template: Literal["drag_sort", "drag_match", "drag_place", "free_canvas", "html_sandbox"] = Field(
        ..., description="活动模板类型"
    )
    time_limit: int = Field(default=120, ge=0, description="时间限制 (秒, 0=无限)")
    show_correct_on_submit: bool = Field(default=False, description="提交后立刻显示正确答案")
    show_leaderboard: bool = Field(default=False, description="是否公开排行榜 (默认不公开)")
    show_top_n: int = Field(default=3, ge=0, description="排行榜只显示前 N 名 (0=全部)")
    # 模板子配置 — 只需填写对应 template 的字段
    drag_sort: Optional[DragSortConfig] = None
    drag_match: Optional[DragMatchConfig] = None
    drag_place: Optional[DragPlaceConfig] = None
    free_canvas: Optional[FreeCanvasConfig] = None
    html_sandbox: Optional[HtmlSandboxConfig] = None


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


class QuizRuntime(BaseModel):
    """Quiz 逐题运行态 — 追踪当前题号、每人每题答案"""
    current_question_index: int = 0
    phase: str = "answering"  # "answering" | "reveal"
    answers: dict = Field(default_factory=dict)       # {username: {q_id: answer}} — 唯一真实来源
    answer_counts: dict = Field(default_factory=dict)  # {q_id: int} — 快取，须与 answers 同步


class InteractiveRuntime(BaseModel):
    """互动活动运行态"""
    locked: bool = False
    # submitted_usernames 仅做 UI 缓存，真相源是 lesson_slide_responses 表
    submitted_usernames: list[str] = Field(default_factory=list)


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
    "link": LinkSlideConfig,
    "interactive": InteractiveSlideConfig,
}

RUNTIME_META_REGISTRY: dict[str, type[BaseModel]] = {
    "quick_answer": QuickAnswerRuntime,
    "raise_hand": RaiseHandRuntime,
    "game": GameRuntime,
    "quiz": QuizRuntime,
    "interactive": InteractiveRuntime,
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
