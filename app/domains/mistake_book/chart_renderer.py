"""
統計圖表 chart_spec JSON → SVG 確定性渲染器

將結構化圖表規格轉換為 SVG 圖形，不依賴 LLM。
DSE 考試風格：黑白簡潔，無陰影無漸變。

支持圖表類型：
  - stem_leaf : 茎葉圖
  - bar       : 柱形圖 / 直方圖
"""

import logging
import math
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ================================================================
# 統一 Design Tokens — 所有圖表共用
# ================================================================

CHART_FONT_FAMILY = "sans-serif"
CHART_MONO_FONT = "monospace"
CHART_FONT_SIZE = 14
CHART_TITLE_SIZE = 15
CHART_LABEL_SIZE = 12
CHART_STROKE_W = 2
CHART_AXIS_COLOR = "black"
CHART_BAR_COLOR = "#5b5fc7"
CHART_BAR_STROKE = "#3d3f8f"
CHART_BG = "none"

# 佈局常量
CHART_PADDING_X = 50
CHART_PADDING_Y = 40
CHART_PADDING_BOTTOM = 50
CHART_ROW_H = 26
CHART_LABEL_GAP = 6
CHART_TITLE_GAP = 24


# ================================================================
# Schema 校驗
# ================================================================

class ChartSpecError(Exception):
    """chart_spec 校驗失敗"""
    pass


def _validate_stem_leaf_spec(spec: dict) -> None:
    """校驗茎葉圖 spec，不合法時拋出 ChartSpecError。"""
    if "stems" not in spec:
        raise ChartSpecError("stem_leaf spec 缺少 stems 字段")
    if "leaves" not in spec:
        raise ChartSpecError("stem_leaf spec 缺少 leaves 字段")

    stems = spec["stems"]
    leaves = spec["leaves"]

    if not isinstance(stems, list) or not stems:
        raise ChartSpecError("stems 必須是非空數字列表")
    if not isinstance(leaves, list):
        raise ChartSpecError("leaves 必須是列表的列表")
    if len(stems) != len(leaves):
        raise ChartSpecError(
            f"stems 長度({len(stems)}) 與 leaves 長度({len(leaves)}) 不一致"
        )

    for i, s in enumerate(stems):
        if not isinstance(s, (int, float)):
            raise ChartSpecError(f"stems[{i}] = {s!r} 不是數字")

    for i, leaf_row in enumerate(leaves):
        if not isinstance(leaf_row, list):
            raise ChartSpecError(f"leaves[{i}] 必須是列表，得到 {type(leaf_row).__name__}")
        for j, lv in enumerate(leaf_row):
            if not isinstance(lv, (int, float)):
                raise ChartSpecError(f"leaves[{i}][{j}] = {lv!r} 不是數字")
            if lv < 0 or lv > 9:
                logger.warning("leaves[%d][%d] = %s 不在 0-9 範圍，可能不標準", i, j, lv)

    # stems 最好遞增，否則只記 warning
    for i in range(1, len(stems)):
        if stems[i] < stems[i - 1]:
            logger.warning("stems 非遞增：stems[%d]=%s < stems[%d]=%s", i, stems[i], i - 1, stems[i - 1])
            break


def _validate_bar_spec(spec: dict) -> None:
    """校驗柱形圖 spec。"""
    if "labels" not in spec:
        raise ChartSpecError("bar spec 缺少 labels 字段")
    if "values" not in spec:
        raise ChartSpecError("bar spec 缺少 values 字段")

    labels = spec["labels"]
    values = spec["values"]

    if not isinstance(labels, list) or not labels:
        raise ChartSpecError("labels 必須是非空列表")
    if not isinstance(values, list) or not values:
        raise ChartSpecError("values 必須是非空列表")
    if len(labels) != len(values):
        raise ChartSpecError(
            f"labels 長度({len(labels)}) 與 values 長度({len(values)}) 不一致"
        )

    for i, v in enumerate(values):
        if not isinstance(v, (int, float)):
            raise ChartSpecError(f"values[{i}] = {v!r} 不是數字")
        if v < 0:
            raise ChartSpecError(f"values[{i}] = {v} 為負數")


# ================================================================
# 茎葉圖渲染
# ================================================================

def render_stem_leaf_svg(spec: dict) -> str:
    """
    茎葉圖 spec → SVG。

    spec = {
        "type": "stem_leaf",
        "title": "某班成績",          # 可選
        "stems": [1, 2, 3, 4, 5],
        "leaves": [[2,5,8], [0,1,3,7], [2,4,4,6,9], [0,1,5], [3]],
        "unit": "莖=十位，葉=個位"    # 可選
    }

    渲染規則：
    - 左列 stem 右對齊
    - 中間竖線分隔
    - 右列 leaf 左對齊，等寬字體
    - 空 stem 保留行（葉為空），不跳過
    - DSE 考試風格：黑白簡潔
    """
    try:
        _validate_stem_leaf_spec(spec)
    except ChartSpecError as e:
        logger.warning("茎葉圖 spec 校驗失敗: %s", e)
        return ""

    stems = spec["stems"]
    leaves = spec["leaves"]
    title = spec.get("title", "")
    unit = spec.get("unit", "")

    n_rows = len(stems)

    # 計算 ViewBox 尺寸
    stem_col_w = 40
    divider_x = CHART_PADDING_X + stem_col_w
    leaf_char_w = 14  # monospace 字元寬度
    max_leaves = max((len(row) for row in leaves), default=0)
    leaf_col_w = max(max_leaves * leaf_char_w + 10, 60)

    vb_w = divider_x + leaf_col_w + CHART_PADDING_X
    # 確保最小寬度
    vb_w = max(vb_w, 200)

    y_start = CHART_PADDING_Y
    if title:
        y_start += CHART_TITLE_GAP
    body_h = n_rows * CHART_ROW_H
    y_end = y_start + body_h
    vb_h = y_end + (CHART_ROW_H if unit else 10) + 10

    parts: List[str] = []
    parts.append(
        f'<svg viewBox="0 0 {vb_w} {vb_h}" '
        f'width="{vb_w}" height="{vb_h}" '
        f'xmlns="http://www.w3.org/2000/svg">'
    )

    # 標題
    if title:
        parts.append(
            f'<text x="{vb_w / 2}" y="{CHART_PADDING_Y - 6}" '
            f'text-anchor="middle" font-size="{CHART_TITLE_SIZE}" '
            f'font-weight="bold" font-family="{CHART_FONT_FAMILY}">'
            f'{_escape_xml(title)}</text>'
        )

    # 中間竖線
    parts.append(
        f'<line x1="{divider_x}" y1="{y_start}" '
        f'x2="{divider_x}" y2="{y_end}" '
        f'stroke="{CHART_AXIS_COLOR}" stroke-width="{CHART_STROKE_W}" />'
    )

    # 每一行
    for i, (stem, leaf_row) in enumerate(zip(stems, leaves)):
        row_y = y_start + i * CHART_ROW_H
        text_y = row_y + CHART_ROW_H * 0.7  # 文字基線

        # stem（右對齊，貼近竖線左側）
        stem_str = str(int(stem)) if stem == int(stem) else str(stem)
        parts.append(
            f'<text x="{divider_x - 8}" y="{text_y}" '
            f'text-anchor="end" font-size="{CHART_FONT_SIZE}" '
            f'font-family="{CHART_MONO_FONT}">'
            f'{_escape_xml(stem_str)}</text>'
        )

        # leaves（左對齊，等寬間隔）
        if leaf_row:
            leaf_str = " ".join(str(int(lv)) if lv == int(lv) else str(lv) for lv in leaf_row)
            parts.append(
                f'<text x="{divider_x + 8}" y="{text_y}" '
                f'text-anchor="start" font-size="{CHART_FONT_SIZE}" '
                f'font-family="{CHART_MONO_FONT}">'
                f'{_escape_xml(leaf_str)}</text>'
            )

        # 行分隔線（淡灰色）
        if i < n_rows - 1:
            line_y = row_y + CHART_ROW_H
            parts.append(
                f'<line x1="{CHART_PADDING_X}" y1="{line_y}" '
                f'x2="{divider_x + leaf_col_w}" y2="{line_y}" '
                f'stroke="#ddd" stroke-width="0.5" />'
            )

    # unit 說明
    if unit:
        parts.append(
            f'<text x="{vb_w / 2}" y="{y_end + CHART_ROW_H - 4}" '
            f'text-anchor="middle" font-size="{CHART_LABEL_SIZE}" '
            f'fill="#666" font-family="{CHART_FONT_FAMILY}">'
            f'{_escape_xml(unit)}</text>'
        )

    parts.append("</svg>")
    return "\n".join(parts)


# ================================================================
# 柱形圖 / 直方圖渲染
# ================================================================

def render_bar_chart_svg(spec: dict) -> str:
    """
    柱形圖 spec → SVG。

    spec = {
        "type": "bar",
        "title": "各班學生人數",       # 可選
        "labels": ["1A", "1B", "1C", "1D"],
        "values": [35, 40, 38, 42],
        "x_label": "班別",             # 可選
        "y_label": "人數"              # 可選
    }
    """
    try:
        _validate_bar_spec(spec)
    except ChartSpecError as e:
        logger.warning("柱形圖 spec 校驗失敗: %s", e)
        return ""

    labels = spec["labels"]
    values = spec["values"]
    title = spec.get("title", "")
    x_label = spec.get("x_label", "")
    y_label = spec.get("y_label", "")

    n = len(labels)
    max_val = max(values) if values else 1
    if max_val == 0:
        max_val = 1

    # 計算 y 軸刻度（取整到 nice number）
    y_tick_interval = _nice_interval(max_val)
    y_max = math.ceil(max_val / y_tick_interval) * y_tick_interval
    n_ticks = int(y_max / y_tick_interval)

    # 佈局尺寸
    left_margin = 60  # y 軸標籤空間
    right_margin = 20
    top_margin = CHART_PADDING_Y + (CHART_TITLE_GAP if title else 0)
    bottom_margin = CHART_PADDING_BOTTOM + (20 if x_label else 0)

    bar_group_w = max(40, min(60, 300 // n))  # 每組寬度
    bar_w = int(bar_group_w * 0.7)  # 柱寬
    bar_gap = bar_group_w - bar_w

    chart_w = n * bar_group_w
    chart_h = 180  # 圖表繪製區高度

    vb_w = left_margin + chart_w + right_margin
    vb_h = top_margin + chart_h + bottom_margin

    # 確保最小寬度
    vb_w = max(vb_w, 250)

    parts: List[str] = []
    parts.append(
        f'<svg viewBox="0 0 {vb_w} {vb_h}" '
        f'width="{vb_w}" height="{vb_h}" '
        f'xmlns="http://www.w3.org/2000/svg">'
    )

    # 標題
    if title:
        parts.append(
            f'<text x="{vb_w / 2}" y="{CHART_PADDING_Y - 6}" '
            f'text-anchor="middle" font-size="{CHART_TITLE_SIZE}" '
            f'font-weight="bold" font-family="{CHART_FONT_FAMILY}">'
            f'{_escape_xml(title)}</text>'
        )

    # 座標原點
    ox = left_margin
    oy = top_margin + chart_h  # y 軸零點（底部）

    # Y 軸
    parts.append(
        f'<line x1="{ox}" y1="{top_margin}" x2="{ox}" y2="{oy}" '
        f'stroke="{CHART_AXIS_COLOR}" stroke-width="{CHART_STROKE_W}" />'
    )

    # X 軸
    parts.append(
        f'<line x1="{ox}" y1="{oy}" x2="{ox + chart_w}" y2="{oy}" '
        f'stroke="{CHART_AXIS_COLOR}" stroke-width="{CHART_STROKE_W}" />'
    )

    # Y 軸刻度 + 網格線
    for i in range(n_ticks + 1):
        tick_val = i * y_tick_interval
        tick_y = oy - (tick_val / y_max) * chart_h

        # 刻度線
        parts.append(
            f'<line x1="{ox - 4}" y1="{tick_y}" x2="{ox}" y2="{tick_y}" '
            f'stroke="{CHART_AXIS_COLOR}" stroke-width="1" />'
        )

        # 刻度值
        tick_label = str(int(tick_val)) if tick_val == int(tick_val) else f"{tick_val:.1f}"
        parts.append(
            f'<text x="{ox - 8}" y="{tick_y + 4}" '
            f'text-anchor="end" font-size="{CHART_LABEL_SIZE}" '
            f'font-family="{CHART_FONT_FAMILY}">'
            f'{tick_label}</text>'
        )

        # 水平網格線（除零線外）
        if i > 0:
            parts.append(
                f'<line x1="{ox}" y1="{tick_y}" x2="{ox + chart_w}" y2="{tick_y}" '
                f'stroke="#ddd" stroke-width="0.5" />'
            )

    # 柱形
    for i, (label, val) in enumerate(zip(labels, values)):
        bar_x = ox + i * bar_group_w + bar_gap / 2
        bar_h = (val / y_max) * chart_h if y_max > 0 else 0
        bar_y = oy - bar_h

        # 柱體
        parts.append(
            f'<rect x="{bar_x}" y="{bar_y}" width="{bar_w}" height="{bar_h}" '
            f'fill="{CHART_BAR_COLOR}" stroke="{CHART_BAR_STROKE}" stroke-width="1" />'
        )

        # 柱頂數值
        val_label = str(int(val)) if val == int(val) else f"{val:.1f}"
        parts.append(
            f'<text x="{bar_x + bar_w / 2}" y="{bar_y - 4}" '
            f'text-anchor="middle" font-size="{CHART_LABEL_SIZE}" '
            f'font-family="{CHART_FONT_FAMILY}">'
            f'{val_label}</text>'
        )

        # X 軸標籤
        parts.append(
            f'<text x="{bar_x + bar_w / 2}" y="{oy + 16}" '
            f'text-anchor="middle" font-size="{CHART_LABEL_SIZE}" '
            f'font-family="{CHART_FONT_FAMILY}">'
            f'{_escape_xml(str(label))}</text>'
        )

    # X 軸名稱
    if x_label:
        parts.append(
            f'<text x="{ox + chart_w / 2}" y="{oy + 38}" '
            f'text-anchor="middle" font-size="{CHART_FONT_SIZE}" '
            f'font-family="{CHART_FONT_FAMILY}">'
            f'{_escape_xml(x_label)}</text>'
        )

    # Y 軸名稱（旋轉 90°）
    if y_label:
        parts.append(
            f'<text x="14" y="{top_margin + chart_h / 2}" '
            f'text-anchor="middle" font-size="{CHART_FONT_SIZE}" '
            f'font-family="{CHART_FONT_FAMILY}" '
            f'transform="rotate(-90, 14, {top_margin + chart_h / 2})">'
            f'{_escape_xml(y_label)}</text>'
        )

    parts.append("</svg>")
    return "\n".join(parts)


# ================================================================
# 統一入口
# ================================================================

def render_chart_from_spec(spec: dict) -> str:
    """
    根據 chart_spec.type 分發到對應渲染器。

    返回 SVG 字符串。任何異常返回空字符串（fail-soft）。
    """
    if not spec or not isinstance(spec, dict):
        logger.warning("chart_spec 為空或非 dict")
        return ""

    chart_type = spec.get("type", "")

    renderers = {
        "stem_leaf": render_stem_leaf_svg,
        "bar": render_bar_chart_svg,
    }

    renderer = renderers.get(chart_type)
    if not renderer:
        logger.warning("未知的 chart_type: %s，支持的類型: %s", chart_type, list(renderers.keys()))
        return ""

    try:
        svg = renderer(spec)
        if svg and "<svg" in svg:
            return svg
        logger.warning("chart_type=%s 渲染輸出為空", chart_type)
        return ""
    except Exception as e:
        logger.warning("chart_type=%s 渲染失敗: %s", chart_type, e)
        return ""


# ================================================================
# 工具函數
# ================================================================

def _escape_xml(text: str) -> str:
    """轉義 XML 特殊字元。"""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )


def _nice_interval(max_val: float) -> float:
    """
    計算 y 軸「整數感」的刻度間隔。

    例如 max=42 → interval=10, max=7 → interval=2, max=150 → interval=50
    """
    if max_val <= 0:
        return 1

    magnitude = 10 ** math.floor(math.log10(max_val))
    residual = max_val / magnitude

    if residual <= 1.5:
        return magnitude * 0.5
    elif residual <= 3:
        return magnitude
    elif residual <= 7:
        return magnitude * 2
    else:
        return magnitude * 5
