"""
Geometry Spec JSON → SVG 確定性渲染器

將結構化幾何規格轉換為 SVG 圖形，不依賴 LLM。
DSE 考試風格：黑白簡潔，無陰影無漸變。
"""

import math
import logging
from typing import Dict, List, Tuple, Optional

logger = logging.getLogger(__name__)

# SVG 常量
VIEWBOX_W, VIEWBOX_H = 300, 250
STROKE_W = 2
FONT_LABEL = 14
FONT_VALUE = 13
RIGHT_ANGLE_SIZE = 8
TICK_LEN = 6
POINT_RADIUS = 2


def render_svg_from_spec(spec: dict) -> str:
    """
    從 geometry spec JSON 生成 SVG 字符串。

    spec 格式見 MathHandler.build_geometry_spec_prompt() 的輸出說明。
    確定性：相同 spec 永遠生成相同 SVG。
    """
    points = spec.get("points", {})
    if not points:
        return ""

    parts: List[str] = []
    parts.append(f'<svg viewBox="0 0 {VIEWBOX_W} {VIEWBOX_H}" '
                 f'width="{VIEWBOX_W}" height="{VIEWBOX_H}" '
                 f'xmlns="http://www.w3.org/2000/svg">')

    # 1. 線段
    for seg in spec.get("segments", []):
        if len(seg) >= 2 and seg[0] in points and seg[1] in points:
            x1, y1 = points[seg[0]]
            x2, y2 = points[seg[1]]
            parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" '
                         f'stroke="black" stroke-width="{STROKE_W}" />')

    # 2. 圓
    for circ in spec.get("circles", []):
        center_name = circ.get("center", "")
        if center_name not in points:
            continue
        cx, cy = points[center_name]
        # 半徑可以用 radius_to（到某個點的距離）或 radius（數值）
        if "radius_to" in circ and circ["radius_to"] in points:
            rx, ry = points[circ["radius_to"]]
            r = math.sqrt((rx - cx) ** 2 + (ry - cy) ** 2)
        elif "radius" in circ:
            r = float(circ["radius"])
        else:
            continue
        parts.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" '
                     f'stroke="black" stroke-width="{STROKE_W}" fill="none" />')

    # 3. 弧
    for arc in spec.get("arcs", []):
        svg_arc = _render_arc(arc, points)
        if svg_arc:
            parts.append(svg_arc)

    # 4. 直角標記
    for vertex_name in spec.get("right_angles", []):
        marker = _render_right_angle(vertex_name, points, spec.get("segments", []))
        if marker:
            parts.append(marker)

    # 5. 相等線段刻痕
    for group_idx, group in enumerate(spec.get("equal_segments", [])):
        tick_count = group_idx + 1
        for seg_pair in group:
            if len(seg_pair) >= 2 and seg_pair[0] in points and seg_pair[1] in points:
                parts.append(_render_tick_marks(
                    points[seg_pair[0]], points[seg_pair[1]], tick_count))

    # 6. 平行線箭頭
    for group in spec.get("parallel_lines", []):
        for seg_pair in group:
            if len(seg_pair) >= 2 and seg_pair[0] in points and seg_pair[1] in points:
                parts.append(_render_parallel_mark(
                    points[seg_pair[0]], points[seg_pair[1]]))

    # 7. 特殊點（交點、切點等）
    for pt_name in spec.get("special_points", []):
        if pt_name in points:
            px, py = points[pt_name]
            parts.append(f'<circle cx="{px}" cy="{py}" r="{POINT_RADIUS}" fill="black" />')

    # 8. 邊長標注
    for label in spec.get("labels", []):
        seg = label.get("segment", [])
        text = label.get("text", "")
        if len(seg) >= 2 and seg[0] in points and seg[1] in points and text:
            parts.append(_render_edge_label(
                points[seg[0]], points[seg[1]], text, points))

    # 9. 角度標注
    for alabel in spec.get("angle_labels", []):
        svg_angle = _render_angle_label(alabel, points, spec.get("segments", []))
        if svg_angle:
            parts.append(svg_angle)

    # 10. 頂點名（最後畫，確保在最上層）
    centroid = _centroid(points)
    for name, (px, py) in points.items():
        lx, ly = _label_position(px, py, centroid)
        parts.append(f'<text x="{lx}" y="{ly}" font-size="{FONT_LABEL}" '
                     f'font-weight="bold" text-anchor="middle" '
                     f'dominant-baseline="middle">{name}</text>')

    parts.append('</svg>')
    return "\n".join(parts)


# ================================================================
# 內部渲染函數
# ================================================================

def _centroid(points: Dict[str, List]) -> Tuple[float, float]:
    """計算所有頂點的重心"""
    if not points:
        return (VIEWBOX_W / 2, VIEWBOX_H / 2)
    xs = [p[0] for p in points.values()]
    ys = [p[1] for p in points.values()]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _label_position(px: float, py: float, centroid: Tuple[float, float],
                    offset: float = 18) -> Tuple[float, float]:
    """將頂點名推到圖形外側"""
    dx = px - centroid[0]
    dy = py - centroid[1]
    dist = math.sqrt(dx * dx + dy * dy)
    if dist < 1:
        return (px, py - offset)
    scale = offset / dist
    lx = px + dx * scale
    ly = py + dy * scale
    # 確保不超出 viewBox
    lx = max(10, min(VIEWBOX_W - 10, lx))
    ly = max(12, min(VIEWBOX_H - 5, ly))
    return (round(lx, 1), round(ly, 1))


def _render_right_angle(vertex_name: str, points: dict,
                        segments: list) -> Optional[str]:
    """在指定頂點渲染直角標記（小方塊）"""
    if vertex_name not in points:
        return None
    vx, vy = points[vertex_name]

    # 找到連接到這個頂點的兩條邊
    neighbors = []
    for seg in segments:
        if len(seg) < 2:
            continue
        if seg[0] == vertex_name and seg[1] in points:
            neighbors.append(points[seg[1]])
        elif seg[1] == vertex_name and seg[0] in points:
            neighbors.append(points[seg[0]])
    if len(neighbors) < 2:
        return None

    # 取前兩個鄰居，計算方向向量
    n1, n2 = neighbors[0], neighbors[1]
    d1 = _unit_vec(vx, vy, n1[0], n1[1])
    d2 = _unit_vec(vx, vy, n2[0], n2[1])
    if d1 is None or d2 is None:
        return None

    s = RIGHT_ANGLE_SIZE
    # 直角標記的三個額外頂點
    p1x = vx + d1[0] * s
    p1y = vy + d1[1] * s
    p2x = vx + d1[0] * s + d2[0] * s
    p2y = vy + d1[1] * s + d2[1] * s
    p3x = vx + d2[0] * s
    p3y = vy + d2[1] * s

    return (f'<polyline points="{p1x:.1f},{p1y:.1f} {p2x:.1f},{p2y:.1f} '
            f'{p3x:.1f},{p3y:.1f}" stroke="black" stroke-width="1" fill="none" />')


def _unit_vec(x1, y1, x2, y2) -> Optional[Tuple[float, float]]:
    """從 (x1,y1) 到 (x2,y2) 的單位向量"""
    dx = x2 - x1
    dy = y2 - y1
    dist = math.sqrt(dx * dx + dy * dy)
    if dist < 0.01:
        return None
    return (dx / dist, dy / dist)


def _render_edge_label(p1: list, p2: list, text: str,
                       all_points: dict) -> str:
    """在邊中點附近標注文字，偏移到圖形外側"""
    mx = (p1[0] + p2[0]) / 2
    my = (p1[1] + p2[1]) / 2

    # 計算邊的法向量（用於偏移標注）
    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length < 0.01:
        return f'<text x="{mx}" y="{my}" font-size="{FONT_VALUE}" text-anchor="middle">{text}</text>'

    # 法向量（兩個方向）
    nx, ny = -dy / length, dx / length

    # 選擇遠離重心的方向
    centroid = _centroid(all_points)
    test_x = mx + nx * 12
    test_y = my + ny * 12
    dist_to_center = math.sqrt((test_x - centroid[0]) ** 2 + (test_y - centroid[1]) ** 2)
    test_x2 = mx - nx * 12
    test_y2 = my - ny * 12
    dist_to_center2 = math.sqrt((test_x2 - centroid[0]) ** 2 + (test_y2 - centroid[1]) ** 2)

    if dist_to_center >= dist_to_center2:
        lx, ly = mx + nx * 12, my + ny * 12
    else:
        lx, ly = mx - nx * 12, my - ny * 12

    return (f'<text x="{lx:.1f}" y="{ly:.1f}" font-size="{FONT_VALUE}" '
            f'text-anchor="middle" dominant-baseline="middle">{text}</text>')


def _render_tick_marks(p1: list, p2: list, count: int) -> str:
    """在線段中點畫等長刻痕"""
    mx = (p1[0] + p2[0]) / 2
    my = (p1[1] + p2[1]) / 2

    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length < 0.01:
        return ""

    # 法向量
    nx, ny = -dy / length, dx / length
    # 沿邊方向的單位向量
    tx, ty = dx / length, dy / length

    parts = []
    spacing = 4
    start_offset = -(count - 1) * spacing / 2

    for i in range(count):
        offset = start_offset + i * spacing
        cx = mx + tx * offset
        cy = my + ty * offset
        x1 = cx + nx * TICK_LEN / 2
        y1 = cy + ny * TICK_LEN / 2
        x2 = cx - nx * TICK_LEN / 2
        y2 = cy - ny * TICK_LEN / 2
        parts.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" '
                     f'x2="{x2:.1f}" y2="{y2:.1f}" '
                     f'stroke="black" stroke-width="1" />')

    return "\n".join(parts)


def _render_parallel_mark(p1: list, p2: list) -> str:
    """在線段中點畫平行線箭頭標記"""
    mx = (p1[0] + p2[0]) / 2
    my = (p1[1] + p2[1]) / 2

    dx = p2[0] - p1[0]
    dy = p2[1] - p1[1]
    length = math.sqrt(dx * dx + dy * dy)
    if length < 0.01:
        return ""

    tx, ty = dx / length, dy / length
    # 小三角形箭頭
    arrow_len = 6
    arrow_w = 3
    nx, ny = -ty, tx  # 法向量

    tip_x = mx + tx * arrow_len / 2
    tip_y = my + ty * arrow_len / 2
    b1x = mx - tx * arrow_len / 2 + nx * arrow_w
    b1y = my - ty * arrow_len / 2 + ny * arrow_w
    b2x = mx - tx * arrow_len / 2 - nx * arrow_w
    b2y = my - ty * arrow_len / 2 - ny * arrow_w

    return (f'<polygon points="{tip_x:.1f},{tip_y:.1f} '
            f'{b1x:.1f},{b1y:.1f} {b2x:.1f},{b2y:.1f}" fill="black" />')


def _render_arc(arc: dict, points: dict) -> Optional[str]:
    """渲染弧線"""
    center = arc.get("center", "")
    if center not in points:
        return None
    cx, cy = points[center]

    from_pt = arc.get("from", "")
    to_pt = arc.get("to", "")
    if from_pt not in points or to_pt not in points:
        return None

    fx, fy = points[from_pt]
    tx, ty = points[to_pt]

    r = math.sqrt((fx - cx) ** 2 + (fy - cy) ** 2)
    if r < 0.01:
        return None

    # SVG arc path
    # 判斷大弧還是小弧（默認小弧）
    angle_from = math.atan2(fy - cy, fx - cx)
    angle_to = math.atan2(ty - cy, tx - cx)
    diff = (angle_to - angle_from) % (2 * math.pi)
    large_arc = 1 if diff > math.pi else 0
    sweep = 1  # 順時針

    return (f'<path d="M {fx:.1f} {fy:.1f} A {r:.1f} {r:.1f} 0 '
            f'{large_arc} {sweep} {tx:.1f} {ty:.1f}" '
            f'stroke="black" stroke-width="1" fill="none" />')


def _render_angle_label(alabel: dict, points: dict,
                        segments: list) -> Optional[str]:
    """在角頂點附近標注角度"""
    vertex = alabel.get("vertex", "")
    text = alabel.get("text", "")
    if vertex not in points or not text:
        return None

    vx, vy = points[vertex]

    # 找到連接到這個頂點的鄰居
    neighbors = []
    for seg in segments:
        if len(seg) < 2:
            continue
        if seg[0] == vertex and seg[1] in points:
            neighbors.append(points[seg[1]])
        elif seg[1] == vertex and seg[0] in points:
            neighbors.append(points[seg[0]])

    if len(neighbors) < 2:
        # 沒有足夠的邊信息，放在頂點附近
        return (f'<text x="{vx + 10}" y="{vy - 5}" font-size="{FONT_VALUE}" '
                f'text-anchor="start">{text}</text>')

    # 計算角平分線方向，標注放在角內部
    n1, n2 = neighbors[0], neighbors[1]
    d1 = _unit_vec(vx, vy, n1[0], n1[1])
    d2 = _unit_vec(vx, vy, n2[0], n2[1])
    if d1 is None or d2 is None:
        return (f'<text x="{vx + 10}" y="{vy - 5}" font-size="{FONT_VALUE}" '
                f'text-anchor="start">{text}</text>')

    # 角平分線方向
    bx = d1[0] + d2[0]
    by = d1[1] + d2[1]
    bl = math.sqrt(bx * bx + by * by)
    if bl < 0.01:
        bx, by = d1[1], -d1[0]  # 取法向量
        bl = 1.0

    offset = 22
    lx = vx + bx / bl * offset
    ly = vy + by / bl * offset

    # 畫角弧線
    arc_r = 15
    a1x = vx + d1[0] * arc_r
    a1y = vy + d1[1] * arc_r
    a2x = vx + d2[0] * arc_r
    a2y = vy + d2[1] * arc_r

    # 判斷掃掠方向
    cross = d1[0] * d2[1] - d1[1] * d2[0]
    sweep = 1 if cross > 0 else 0

    arc_svg = (f'<path d="M {a1x:.1f} {a1y:.1f} A {arc_r} {arc_r} 0 0 '
               f'{sweep} {a2x:.1f} {a2y:.1f}" '
               f'stroke="black" stroke-width="1" fill="none" />')

    text_svg = (f'<text x="{lx:.1f}" y="{ly:.1f}" font-size="{FONT_VALUE}" '
                f'text-anchor="middle" dominant-baseline="middle">{text}</text>')

    return arc_svg + "\n" + text_svg
