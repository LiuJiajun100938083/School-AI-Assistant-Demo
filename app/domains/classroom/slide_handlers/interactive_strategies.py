"""
互动活动模板策略 — 评分 / 学生序列化 / 揭晓 payload

全部是纯函数，零外部依赖，可独立单测。
新增模板只需在此文件添加三个函数并注册到对应 dict。
"""

from app.domains.classroom.slide_configs import (
    DragMatchConfig,
    DragPlaceConfig,
    DragSortConfig,
    FreeCanvasConfig,
    HtmlSandboxConfig,
)


# ============================================================
# 评分策略 — (config, data) → (score: float, is_correct: bool|None)
# ============================================================

def score_drag_sort(config: DragSortConfig, data: dict) -> tuple[float, bool]:
    """评分拖拽排序: 计算位置正确率"""
    submitted = data.get("order", [])
    correct = config.correct_order
    if not submitted or len(submitted) != len(correct):
        return 0.0, False
    correct_count = sum(1 for a, b in zip(submitted, correct) if a == b)
    score = round(correct_count / len(correct) * 100, 1)
    return score, correct_count == len(correct)


def score_drag_match(config: DragMatchConfig, data: dict) -> tuple[float, bool]:
    """评分拖拽配对: 计算配对正确率"""
    submitted_pairs = data.get("pairs", {})
    correct = config.correct_pairs
    if not submitted_pairs or not correct:
        return 0.0, False
    correct_count = sum(1 for k, v in submitted_pairs.items() if correct.get(k) == v)
    total = len(correct)
    score = round(correct_count / total * 100, 1)
    return score, correct_count == total


def score_drag_place(config: DragPlaceConfig, data: dict) -> tuple[float, bool]:
    """评分拖拽放置: 计算放置正确率"""
    submitted = data.get("placement", {})
    correct = config.correct_placement
    if not submitted or not correct:
        return 0.0, False
    correct_count = sum(1 for k, v in submitted.items() if correct.get(k) == v)
    total = len(correct)
    score = round(correct_count / total * 100, 1)
    return score, correct_count == total


def _no_score(_config, _data) -> tuple[float, None]:
    """不自动评分的模板"""
    return 0.0, None


SCORING_STRATEGIES: dict[str, callable] = {
    "drag_sort": score_drag_sort,
    "drag_match": score_drag_match,
    "drag_place": score_drag_place,
    "free_canvas": _no_score,
    "html_sandbox": _no_score,
}


# ============================================================
# 学生序列化策略 — 定义"给学生看什么"（去除正确答案）
# ============================================================

def serialize_drag_sort_for_student(config: DragSortConfig) -> dict:
    """只返回 items + instruction，不返回 correct_order"""
    return {
        "items": [item.model_dump() for item in config.items],
        "instruction": config.instruction,
    }


def serialize_drag_match_for_student(config: DragMatchConfig) -> dict:
    """返回左右两栏项目，不返回 correct_pairs"""
    return {
        "left_items": [item.model_dump() for item in config.left_items],
        "right_items": [item.model_dump() for item in config.right_items],
        "instruction": config.instruction,
    }


def serialize_drag_place_for_student(config: DragPlaceConfig) -> dict:
    """返回项目和区域，不返回 correct_placement"""
    return {
        "items": [item.model_dump() for item in config.items],
        "zones": [zone.model_dump() for zone in config.zones],
        "background_image": config.background_image,
        "instruction": config.instruction,
    }


def serialize_free_canvas_for_student(config: FreeCanvasConfig) -> dict:
    """返回画布配置"""
    return {
        "background_image": config.background_image,
        "tools": config.tools,
        "instruction": config.instruction,
    }


def serialize_html_sandbox_for_student(config: HtmlSandboxConfig) -> dict:
    """返回 HTML 内容"""
    return {
        "html_content": config.html_content,
        "sandbox_type": config.sandbox_type,
        "instruction": config.instruction,
        "allow_student_edit": config.allow_student_edit,
    }


STUDENT_SERIALIZERS: dict[str, callable] = {
    "drag_sort": serialize_drag_sort_for_student,
    "drag_match": serialize_drag_match_for_student,
    "drag_place": serialize_drag_place_for_student,
    "free_canvas": serialize_free_canvas_for_student,
    "html_sandbox": serialize_html_sandbox_for_student,
}


# ============================================================
# 揭晓 payload 策略 — 定义 show_results 时给学生的数据
# ============================================================

def build_drag_sort_reveal(config: DragSortConfig) -> dict:
    return {"correct_order": config.correct_order}


def build_drag_match_reveal(config: DragMatchConfig) -> dict:
    return {"correct_pairs": config.correct_pairs}


def build_drag_place_reveal(config: DragPlaceConfig) -> dict:
    return {"correct_placement": config.correct_placement}


def build_free_canvas_reveal(_config: FreeCanvasConfig) -> dict:
    return {}


def build_html_sandbox_reveal(_config: HtmlSandboxConfig) -> dict:
    return {}


REVEAL_BUILDERS: dict[str, callable] = {
    "drag_sort": build_drag_sort_reveal,
    "drag_match": build_drag_match_reveal,
    "drag_place": build_drag_place_reveal,
    "free_canvas": build_free_canvas_reveal,
    "html_sandbox": build_html_sandbox_reveal,
}
