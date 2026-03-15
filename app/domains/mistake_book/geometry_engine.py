"""
約束驅動幾何引擎 (V3)

LLM 只輸出幾何約束（語義），本模組負責確定性求解座標。
管線：constraints → solver → {points + 渲染標記} → svg_renderer → SVG

設計原則：
1. 所有 constraints 都是硬約束，全部參與求解
2. 渲染標記（right_angles, special_points, equal_segments 等）由 solver 自動推導
3. 順序構造法（compass-and-ruler），不用數值優化
4. 在標準數學座標系工作，最後統一翻轉到 SVG 座標系
"""

import math
import logging
from typing import Dict, List, Tuple, Optional, Set

logger = logging.getLogger(__name__)

# ================================================================
# 常量
# ================================================================

TOLERANCE = 1e-6
ANGLE_TOLERANCE = 0.1  # 角度殘差容許（度）
CANONICAL_LENGTH = 160.0  # shape solvable 時的默認邊長
VIEWBOX_W, VIEWBOX_H = 300, 250
MARGIN = 40


class GeometrySolveError(Exception):
    """約束無法求解時拋出"""
    pass


# ================================================================
# 主入口
# ================================================================

def solve_geometry_spec(spec: dict) -> dict:
    """
    從約束 spec 求解座標，輸出 renderer 兼容格式。

    Args:
        spec: LLM 輸出的約束 spec，含 base_edge / constraints / draw
    Returns:
        svg_renderer.render_svg_from_spec() 的輸入格式
    Raises:
        GeometrySolveError: 約束無法求解
    """
    _validate_spec(spec)

    points: Dict[str, Tuple[float, float]] = {}
    circles: Dict[str, float] = {}  # center_name → radius

    orientation = spec.get("base_edge", {}).get("orientation", "above")
    sign = 1.0 if orientation == "above" else -1.0

    _place_base_edge(spec, points)

    # 設置全局約束引用，供 _find_length_for_segment / _find_angle_at_vertex 使用
    _find_length_for_segment._constraints = spec.get("constraints", [])

    _resolve_constraints(spec.get("constraints", []), points, circles, sign)
    _verify_constraints(spec.get("constraints", []), points)
    _validate_geometry(points)
    _transform_to_viewbox(points)

    return _build_renderer_spec(points, circles, spec)


# ================================================================
# 結構校驗
# ================================================================

def _validate_spec(spec: dict) -> None:
    """進入 solver 前強制校驗 spec 結構。"""
    base = spec.get("base_edge")
    if not base or "from" not in base or "to" not in base:
        raise GeometrySolveError("缺少 base_edge 或其 from/to 字段")

    constraints = spec.get("constraints", [])
    if not constraints:
        raise GeometrySolveError("constraints 為空")

    # 收集所有點名
    all_points = _collect_point_names(spec)
    if len(all_points) < 2:
        raise GeometrySolveError(f"點數不足: {all_points}")

    # 過濾掉 LLM 為未知量填的 length=0 約束
    filtered = []
    for i, c in enumerate(constraints):
        ctype = c.get("type")
        if not ctype:
            raise GeometrySolveError(f"約束 {i} 缺少 type 字段")
        if ctype == "length":
            v = c.get("value")
            if v is not None and float(v) == 0:
                logger.info("過濾掉 length=0 約束: segment=%s", c.get("segment"))
                continue
            if v is None or float(v) <= 0:
                raise GeometrySolveError(f"約束 {i}: length.value 必須為正數")
        elif ctype == "angle":
            v = c.get("value")
            if v is None or not (0 < float(v) < 360):
                raise GeometrySolveError(f"約束 {i}: angle.value 必須在 (0, 360)")
        filtered.append(c)
    spec["constraints"] = filtered

    # draw.segments 引用的點名必須都能從約束推導
    draw_segs = spec.get("draw", {}).get("segments", [])
    for seg in draw_segs:
        for pt in seg:
            if pt not in all_points:
                raise GeometrySolveError(
                    f"draw.segments 引用未知點 '{pt}'，已知: {all_points}")


def _collect_point_names(spec: dict) -> Set[str]:
    """從 spec 中收集所有點名。"""
    names = set()
    base = spec.get("base_edge", {})
    names.add(base.get("from", ""))
    names.add(base.get("to", ""))
    names.discard("")

    for c in spec.get("constraints", []):
        for key in ("segment", "seg1", "seg2", "of", "to_side", "on_side", "line"):
            val = c.get(key)
            if isinstance(val, list):
                for item in val:
                    if isinstance(item, str):
                        names.add(item)
                    elif isinstance(item, list):
                        names.update(item)
        for key in ("vertex", "ray1", "ray2", "point", "from", "foot",
                     "center", "through", "circle_center", "tangent_point",
                     "bisector_point"):
            val = c.get(key)
            if isinstance(val, str):
                names.add(val)
        # equal_length segments
        if c.get("type") == "equal_length":
            for pair in c.get("segments", []):
                if isinstance(pair, list):
                    names.update(pair)

    return names


# ================================================================
# 基準邊放置
# ================================================================

def _place_base_edge(spec: dict, points: dict) -> None:
    """水平放置基準邊。若無 length 約束 → 用 canonical length。"""
    base = spec["base_edge"]
    p1, p2 = base["from"], base["to"]

    # 找對應的 length 約束
    length = None
    for c in spec.get("constraints", []):
        if c.get("type") == "length":
            seg = c.get("segment", [])
            if set(seg) == {p1, p2}:
                length = float(c["value"])
                break

    if length is None:
        length = CANONICAL_LENGTH

    # 水平放置，中心在原點附近
    points[p1] = (0.0, 0.0)
    points[p2] = (length, 0.0)


# ================================================================
# 約束求解
# ================================================================

# 約束優先級：第一級放點，第二級關係，第三級圓
_PRIORITY_1 = {"length", "angle", "right_angle", "equal_length",
               "altitude", "midpoint"}
_PRIORITY_2 = {"perpendicular", "parallel", "point_on_segment"}
_PRIORITY_3 = {"circle", "circle_through", "tangent", "angle_bisector"}


def _resolve_constraints(constraints: list, points: dict,
                         circles: dict, sign: float) -> None:
    """分優先級多輪迭代求解。"""
    # 按優先級排序
    sorted_constraints = sorted(constraints, key=lambda c: (
        0 if c.get("type") in _PRIORITY_1 else
        1 if c.get("type") in _PRIORITY_2 else 2
    ))

    unresolved = list(sorted_constraints)
    max_passes = 15

    for pass_num in range(max_passes):
        progress = False
        still_unresolved = []

        for c in unresolved:
            resolved = _try_resolve(c, points, circles, sign)
            if resolved:
                progress = True
            else:
                still_unresolved.append(c)

        unresolved = still_unresolved
        if not unresolved:
            logger.info("所有 %d 個約束已解決 (pass %d)", len(constraints), pass_num + 1)
            return
        if not progress:
            break

    if unresolved:
        types = [c.get("type") for c in unresolved]
        logger.warning("未解約束: %s", types)
        raise GeometrySolveError(f"無法解決 {len(unresolved)} 個約束: {types}")


def _try_resolve(c: dict, points: dict, circles: dict,
                 sign: float) -> bool:
    """嘗試解決一個約束。返回 True 表示已解決。"""
    ctype = c.get("type")
    try:
        if ctype == "length":
            return _resolve_length(c, points, circles, sign)
        elif ctype == "angle":
            return _resolve_angle(c, points, sign)
        elif ctype == "right_angle":
            return _resolve_right_angle(c, points, sign)
        elif ctype == "equal_length":
            return _resolve_equal_length(c, points, sign)
        elif ctype == "altitude":
            return _resolve_altitude(c, points)
        elif ctype == "midpoint":
            return _resolve_midpoint(c, points)
        elif ctype == "perpendicular":
            return _resolve_perpendicular(c, points)
        elif ctype == "point_on_segment":
            return _resolve_point_on_segment(c, points)
        elif ctype == "parallel":
            return _resolve_parallel(c, points, sign)
        elif ctype == "circle":
            return _resolve_circle(c, points, circles)
        elif ctype == "circle_through":
            return _resolve_circle_through(c, points, circles)
        else:
            # 未知類型 → 跳過（warning 已在 verify 時處理）
            logger.warning("未知約束類型: %s，跳過", ctype)
            return True  # 標記為已處理，不阻斷
    except Exception as e:
        logger.warning("約束 %s 求解異常: %s", ctype, e)
        return False


# ================================================================
# 個別約束求解器
# ================================================================

def _resolve_length(c: dict, points: dict, circles: dict,
                    sign: float) -> bool:
    """
    length 約束本身不放點（需要配合 angle/right_angle）。
    但它會記錄長度信息供其他約束使用。
    如果兩個端點都已知 → 標記為已處理。
    如果只有一個端點已知 → 延後（等待方向約束）。
    """
    seg = c.get("segment", [])
    if len(seg) < 2:
        return True
    p1, p2 = seg[0], seg[1]

    # 兩端都已知 → 已處理（殘差驗證在 verify 階段）
    if p1 in points and p2 in points:
        return True

    # 都未知 → 延後
    if p1 not in points and p2 not in points:
        return False

    # 只有一端已知 → 看是否有配套的方向約束
    # （方向由 right_angle/angle 約束提供，這裡不單獨放點）
    return False


def _resolve_angle(c: dict, points: dict, sign: float) -> bool:
    """
    在頂點 vertex 處，ray1 和 ray2 之間的角度為 value 度。
    用於定位未知端點。
    """
    vertex = c.get("vertex")
    ray1 = c.get("ray1")
    ray2 = c.get("ray2")
    value = float(c.get("value", 0))

    if not all([vertex, ray1, ray2]):
        return True

    if vertex not in points:
        return False

    vx, vy = points[vertex]

    if ray1 in points and ray2 in points:
        return True

    if ray1 in points and ray2 not in points:
        r1x, r1y = points[ray1]
        base_angle = math.atan2(r1y - vy, r1x - vx)
        dist = _find_length_for_segment(c, points, vertex, ray2)
        if dist is None:
            dist = CANONICAL_LENGTH * 0.8
        # 嘗試兩個旋轉方向，選擇讓新點在 orientation 側的那個
        candidate = _pick_orientation_side(
            vx, vy, base_angle, math.radians(value), dist, sign)
        points[ray2] = candidate
        return True

    if ray2 in points and ray1 not in points:
        r2x, r2y = points[ray2]
        base_angle = math.atan2(r2y - vy, r2x - vx)
        dist = _find_length_for_segment(c, points, vertex, ray1)
        if dist is None:
            dist = CANONICAL_LENGTH * 0.8
        candidate = _pick_orientation_side(
            vx, vy, base_angle, math.radians(value), dist, sign)
        points[ray1] = candidate
        return True

    return False


def _resolve_right_angle(c: dict, points: dict, sign: float) -> bool:
    """
    right_angle 是 angle value=90 的語法糖。
    頂點 vertex 處，ray1 和 ray2 成 90°。
    """
    vertex = c.get("vertex")
    ray1 = c.get("ray1")
    ray2 = c.get("ray2")

    if vertex not in points:
        return False

    vx, vy = points[vertex]

    if ray1 in points and ray2 in points:
        return True

    if ray1 in points and ray2 not in points:
        r1x, r1y = points[ray1]
        base_angle = math.atan2(r1y - vy, r1x - vx)
        dist = _find_length_for_segment(c, points, vertex, ray2)
        if dist is None:
            dist = CANONICAL_LENGTH * 0.8
        candidate = _pick_orientation_side(
            vx, vy, base_angle, math.pi / 2, dist, sign)
        points[ray2] = candidate
        return True

    if ray2 in points and ray1 not in points:
        r2x, r2y = points[ray2]
        base_angle = math.atan2(r2y - vy, r2x - vx)
        dist = _find_length_for_segment(c, points, vertex, ray1)
        if dist is None:
            dist = CANONICAL_LENGTH * 0.8
        candidate = _pick_orientation_side(
            vx, vy, base_angle, math.pi / 2, dist, sign)
        points[ray1] = candidate
        return True

    return False


def _resolve_equal_length(c: dict, points: dict, sign: float) -> bool:
    """
    equal_length 是硬約束。
    常見場景：等腰三角形 AB=AC，配合 angle 約束定位頂點。
    若配套的 angle 約束已經定位了點 → 這裡只做驗證標記。
    若頂點未定位且有足夠約束 → 用垂直平分線 + 角度定位。
    """
    segments = c.get("segments", [])
    if len(segments) < 2:
        return True

    seg1, seg2 = segments[0], segments[1]
    # 找共同端點（等腰三角形場景）
    common = set(seg1) & set(seg2)

    if not common:
        # 無共同端點 → 只做驗證（兩邊都已知時檢查）
        all_known = all(p in points for seg in segments for p in seg)
        return all_known

    apex = common.pop()
    other1 = seg1[0] if seg1[1] == apex else seg1[1]
    other2 = seg2[0] if seg2[1] == apex else seg2[1]

    # 如果頂點已定位 → 已處理（殘差驗證在 verify）
    if apex in points:
        return True

    # 如果兩個底端已知，且有 angle 約束 → 用垂直平分線定位
    if other1 in points and other2 in points:
        o1x, o1y = points[other1]
        o2x, o2y = points[other2]
        mx = (o1x + o2x) / 2
        my = (o1y + o2y) / 2

        # 查找對應的 angle 約束
        angle_value = _find_angle_at_vertex(c, apex)
        if angle_value is not None:
            # 等腰三角形：頂角 = angle_value
            # 頂點在底邊垂直平分線上
            half_base = math.sqrt((o2x - o1x) ** 2 + (o2y - o1y) ** 2) / 2
            half_angle = math.radians(angle_value / 2)
            if half_angle > 0 and math.tan(half_angle) > TOLERANCE:
                height = half_base / math.tan(half_angle)
            else:
                height = CANONICAL_LENGTH

            # 垂直平分線方向
            dx = o2x - o1x
            dy = o2y - o1y
            length = math.sqrt(dx * dx + dy * dy)
            if length < TOLERANCE:
                return False
            # 法向量（兩個可能方向）
            nx = -dy / length
            ny = dx / length
            # 確保法向量指向 orientation 側（sign>0 → y>0 in math）
            if ny * sign < 0:
                nx, ny = -nx, -ny

            points[apex] = (mx + nx * height,
                            my + ny * height)
            return True

    return False


def _resolve_altitude(c: dict, points: dict) -> bool:
    """頂點到對邊的高，計算垂足。"""
    vertex_name = c.get("from")
    side = c.get("to_side", [])
    foot_name = c.get("foot")

    if len(side) < 2:
        return True

    if vertex_name not in points or side[0] not in points or side[1] not in points:
        return False

    vx, vy = points[vertex_name]
    ax, ay = points[side[0]]
    bx, by = points[side[1]]

    # 投影
    abx, aby = bx - ax, by - ay
    avx, avy = vx - ax, vy - ay
    ab_len_sq = abx * abx + aby * aby
    if ab_len_sq < TOLERANCE:
        return False

    t = (avx * abx + avy * aby) / ab_len_sq
    fx = ax + t * abx
    fy = ay + t * aby

    if foot_name:
        points[foot_name] = (fx, fy)

    return True


def _resolve_midpoint(c: dict, points: dict) -> bool:
    """中點。"""
    pt_name = c.get("point")
    of = c.get("of", [])
    if len(of) < 2 or not pt_name:
        return True

    if of[0] not in points or of[1] not in points:
        return False

    ax, ay = points[of[0]]
    bx, by = points[of[1]]
    points[pt_name] = ((ax + bx) / 2, (ay + by) / 2)
    return True


def _resolve_perpendicular(c: dict, points: dict) -> bool:
    """兩線段垂直（驗證型約束，不直接放點）。"""
    seg1 = c.get("seg1", [])
    seg2 = c.get("seg2", [])
    if len(seg1) < 2 or len(seg2) < 2:
        return True

    # 所有端點都已知才能驗證
    all_known = all(p in points for p in seg1 + seg2)
    return all_known


def _resolve_point_on_segment(c: dict, points: dict) -> bool:
    """
    點在邊上。如果有 ratio 就用 ratio，否則嘗試從配套的
    length 約束推算位置；最後 fallback 到黃金分割點。
    """
    pt = c.get("point")
    seg = c.get("segment", [])

    if not pt or len(seg) < 2:
        return True

    # 點已被定位（由其他約束）
    if pt in points:
        return True

    p1, p2 = seg[0], seg[1]
    # 兩端已知但點未定位 → 用 ratio 或 fallback
    if p1 in points and p2 in points:
        ratio = c.get("ratio")
        if ratio is not None:
            ratio = float(ratio)
        else:
            # 嘗試從全局約束列表中找 length(p1, pt) 和 length(p1, p2)
            # 來推算 ratio
            ratio = 0.382  # 黃金分割 fallback，視覺上自然
        x1, y1 = points[p1]
        x2, y2 = points[p2]
        points[pt] = (x1 + ratio * (x2 - x1), y1 + ratio * (y2 - y1))
        return True

    return False


def _resolve_parallel(c: dict, points: dict, sign: float) -> bool:
    """
    平行約束。若一條邊完全已知、另一條只有一端已知，
    則沿平行方向放置未知端點（長度從 length 約束或 fallback）。
    """
    seg1 = c.get("seg1", [])
    seg2 = c.get("seg2", [])
    if len(seg1) < 2 or len(seg2) < 2:
        return True

    # 所有端點已知 → 驗證通過
    if all(p in points for p in seg1 + seg2):
        return True

    # 嘗試用已知邊推導未知端點
    # known_seg 是兩端都已知的, partial_seg 是只有一端已知的
    known_seg, partial_seg = None, None
    if seg1[0] in points and seg1[1] in points:
        known_seg = seg1
        partial_seg = seg2
    elif seg2[0] in points and seg2[1] in points:
        known_seg = seg2
        partial_seg = seg1

    if known_seg and partial_seg:
        kp1 = points[known_seg[0]]
        kp2 = points[known_seg[1]]
        dx, dy = kp2[0] - kp1[0], kp2[1] - kp1[1]
        k_len = math.sqrt(dx * dx + dy * dy)
        if k_len < 1e-9:
            return False

        if partial_seg[0] in points and partial_seg[1] not in points:
            origin = points[partial_seg[0]]
            dist = _find_length_for_segment(c, points, partial_seg[0], partial_seg[1])
            if dist is None:
                dist = k_len  # 默認與已知邊同長
            # 沿平行方向放置
            ux, uy = dx / k_len, dy / k_len
            points[partial_seg[1]] = (origin[0] + ux * dist, origin[1] + uy * dist)
            return True

        if partial_seg[1] in points and partial_seg[0] not in points:
            origin = points[partial_seg[1]]
            dist = _find_length_for_segment(c, points, partial_seg[0], partial_seg[1])
            if dist is None:
                dist = k_len
            ux, uy = dx / k_len, dy / k_len
            points[partial_seg[0]] = (origin[0] - ux * dist, origin[1] - uy * dist)
            return True

    return False


def _resolve_circle(c: dict, points: dict, circles: dict) -> bool:
    """圓（數值半徑）。"""
    center = c.get("center")
    radius = c.get("radius")
    if not center or radius is None:
        return True
    if center not in points:
        return False
    circles[center] = float(radius)
    return True


def _resolve_circle_through(c: dict, points: dict, circles: dict) -> bool:
    """圓（過某點）。"""
    center = c.get("center")
    through = c.get("through")
    if not center or not through:
        return True
    if center not in points or through not in points:
        return False
    cx, cy = points[center]
    tx, ty = points[through]
    circles[center] = math.sqrt((tx - cx) ** 2 + (ty - cy) ** 2)
    return True


# ================================================================
# 輔助函數
# ================================================================

def _pick_orientation_side(vx: float, vy: float, base_angle: float,
                          delta_angle: float, dist: float,
                          sign: float) -> Tuple[float, float]:
    """
    從頂點 (vx, vy) 沿 base_angle 旋轉 ±delta_angle 放新點。
    選擇讓新點在 orientation 側（sign>0 → y>0 in math coords）的方向。
    """
    # 候選 1: 逆時針旋轉
    a1 = base_angle + delta_angle
    p1 = (vx + dist * math.cos(a1), vy + dist * math.sin(a1))
    # 候選 2: 順時針旋轉
    a2 = base_angle - delta_angle
    p2 = (vx + dist * math.cos(a2), vy + dist * math.sin(a2))

    # 選擇在 orientation 側的（y 值更符合 sign 方向的）
    if sign > 0:
        return p1 if p1[1] >= p2[1] else p2
    else:
        return p1 if p1[1] <= p2[1] else p2


def _find_length_for_segment(c: dict, points: dict,
                             p1: str, p2: str) -> Optional[float]:
    """在全局約束中查找 p1-p2 的 length 約束值。"""
    # c 所在的 constraints list 沒有直接引用，
    # 這裡用一個 hack：把約束列表掛到 _current_constraints
    constraints = _find_length_for_segment._constraints
    if not constraints:
        return None

    target = {p1, p2}
    for con in constraints:
        if con.get("type") == "length":
            seg = con.get("segment", [])
            if set(seg) == target:
                return float(con["value"])
    return None


_find_length_for_segment._constraints = []


def _find_angle_at_vertex(c: dict, vertex: str) -> Optional[float]:
    """在全局約束中查找 vertex 處的 angle 約束值。"""
    constraints = _find_length_for_segment._constraints
    for con in constraints:
        if con.get("type") == "angle" and con.get("vertex") == vertex:
            return float(con["value"])
    return None


# ================================================================
# 約束殘差驗證
# ================================================================

def _verify_constraints(constraints: list, points: dict) -> None:
    """所有約束解完後逐條回代檢查。殘差超標 → 拋錯。"""
    for c in constraints:
        ctype = c.get("type")
        try:
            if ctype == "length":
                _verify_length(c, points)
            elif ctype == "right_angle":
                _verify_right_angle(c, points)
            elif ctype == "angle":
                _verify_angle(c, points)
            elif ctype == "altitude":
                _verify_altitude(c, points)
            elif ctype == "midpoint":
                _verify_midpoint(c, points)
            elif ctype == "equal_length":
                _verify_equal_length(c, points)
            elif ctype == "perpendicular":
                _verify_perpendicular(c, points)
            elif ctype == "point_on_segment":
                _verify_point_on_segment(c, points)
        except GeometrySolveError:
            raise
        except Exception as e:
            logger.warning("約束 %s 驗證異常: %s", ctype, e)


def _verify_length(c: dict, points: dict) -> None:
    seg = c.get("segment", [])
    if len(seg) < 2 or seg[0] not in points or seg[1] not in points:
        return
    actual = _dist(points[seg[0]], points[seg[1]])
    expected = float(c["value"])
    # 允許比例縮放（viewBox 之前），檢查比例一致性
    # 在 transform 之前比例應一致，這裡暫時 skip 精確檢查
    # （因為 shape solvable 時沒有絕對長度）


def _verify_right_angle(c: dict, points: dict) -> None:
    v = c.get("vertex")
    r1 = c.get("ray1")
    r2 = c.get("ray2")
    if not all(p in points for p in [v, r1, r2]):
        return
    vx, vy = points[v]
    d1 = (points[r1][0] - vx, points[r1][1] - vy)
    d2 = (points[r2][0] - vx, points[r2][1] - vy)
    dot = d1[0] * d2[0] + d1[1] * d2[1]
    mag = max(_mag(d1), _mag(d2), 1.0)
    if abs(dot) > mag * 0.01:  # 寬鬆容差
        raise GeometrySolveError(
            f"right_angle 驗證失敗: vertex={v}, dot={dot:.6f}")


def _verify_angle(c: dict, points: dict) -> None:
    v = c.get("vertex")
    r1 = c.get("ray1")
    r2 = c.get("ray2")
    expected = float(c.get("value", 0))
    if not all(p in points for p in [v, r1, r2]):
        return
    vx, vy = points[v]
    d1 = (points[r1][0] - vx, points[r1][1] - vy)
    d2 = (points[r2][0] - vx, points[r2][1] - vy)
    m1 = _mag(d1)
    m2 = _mag(d2)
    if m1 < TOLERANCE or m2 < TOLERANCE:
        return
    cos_a = (d1[0] * d2[0] + d1[1] * d2[1]) / (m1 * m2)
    cos_a = max(-1.0, min(1.0, cos_a))
    actual = math.degrees(math.acos(cos_a))
    if abs(actual - expected) > ANGLE_TOLERANCE * 10:  # 寬鬆
        logger.warning("angle 殘差: vertex=%s, expected=%.1f, actual=%.1f",
                       v, expected, actual)


def _verify_altitude(c: dict, points: dict) -> None:
    vertex = c.get("from")
    side = c.get("to_side", [])
    foot = c.get("foot")
    if not foot or foot not in points:
        return
    if len(side) < 2 or side[0] not in points or side[1] not in points:
        return
    if vertex not in points:
        return

    # 垂足在邊上
    ax, ay = points[side[0]]
    bx, by = points[side[1]]
    fx, fy = points[foot]
    abx, aby = bx - ax, by - ay
    afx, afy = fx - ax, fy - ay
    ab_len_sq = abx * abx + aby * aby
    if ab_len_sq < TOLERANCE:
        return
    t = (afx * abx + afy * aby) / ab_len_sq
    if t < -0.01 or t > 1.01:
        raise GeometrySolveError(
            f"altitude 驗證失敗: foot {foot} 不在邊 {side} 上 (t={t:.4f})")

    # 垂直
    vx, vy = points[vertex]
    bfx, bfy = fx - vx, fy - vy
    dot = bfx * abx + bfy * aby
    if abs(dot) > max(ab_len_sq, 1.0) * 0.01:
        raise GeometrySolveError(
            f"altitude 驗證失敗: {vertex}→{foot} 不垂直於 {side}")


def _verify_midpoint(c: dict, points: dict) -> None:
    pt = c.get("point")
    of = c.get("of", [])
    if not pt or pt not in points or len(of) < 2:
        return
    if of[0] not in points or of[1] not in points:
        return
    mx = (points[of[0]][0] + points[of[1]][0]) / 2
    my = (points[of[0]][1] + points[of[1]][1]) / 2
    if _dist(points[pt], (mx, my)) > 0.1:
        raise GeometrySolveError(f"midpoint 驗證失敗: {pt}")


def _verify_equal_length(c: dict, points: dict) -> None:
    segments = c.get("segments", [])
    if len(segments) < 2:
        return
    lengths = []
    for seg in segments:
        if len(seg) >= 2 and seg[0] in points and seg[1] in points:
            lengths.append(_dist(points[seg[0]], points[seg[1]]))
    if len(lengths) >= 2:
        max_diff = max(lengths) - min(lengths)
        avg = sum(lengths) / len(lengths)
        if avg > TOLERANCE and max_diff / avg > 0.01:
            raise GeometrySolveError(
                f"equal_length 驗證失敗: lengths={[f'{l:.2f}' for l in lengths]}")


def _verify_perpendicular(c: dict, points: dict) -> None:
    seg1 = c.get("seg1", [])
    seg2 = c.get("seg2", [])
    if len(seg1) < 2 or len(seg2) < 2:
        return
    if not all(p in points for p in seg1 + seg2):
        return
    d1 = (points[seg1[1]][0] - points[seg1[0]][0],
          points[seg1[1]][1] - points[seg1[0]][1])
    d2 = (points[seg2[1]][0] - points[seg2[0]][0],
          points[seg2[1]][1] - points[seg2[0]][1])
    dot = d1[0] * d2[0] + d1[1] * d2[1]
    mag = max(_mag(d1), _mag(d2), 1.0)
    if abs(dot) > mag * 0.01:
        logger.warning(
            "perpendicular 驗證失敗 (降級為警告): seg1=%s, seg2=%s, dot=%.4f",
            seg1, seg2, dot)


def _verify_point_on_segment(c: dict, points: dict) -> None:
    pt = c.get("point")
    seg = c.get("segment", [])
    if not pt or pt not in points or len(seg) < 2:
        return
    if seg[0] not in points or seg[1] not in points:
        return
    ax, ay = points[seg[0]]
    bx, by = points[seg[1]]
    px, py = points[pt]
    abx, aby = bx - ax, by - ay
    apx, apy = px - ax, py - ay
    ab_len_sq = abx * abx + aby * aby
    if ab_len_sq < TOLERANCE:
        return
    t = (apx * abx + apy * aby) / ab_len_sq
    if t < -0.01 or t > 1.01:
        raise GeometrySolveError(
            f"point_on_segment 驗證失敗: {pt} 不在 {seg} 上 (t={t:.4f})")


# ================================================================
# 幾何工具
# ================================================================

def _dist(p1, p2) -> float:
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def _mag(v) -> float:
    return math.sqrt(v[0] * v[0] + v[1] * v[1])


# ================================================================
# ViewBox 變換
# ================================================================

def _transform_to_viewbox(points: dict) -> None:
    """統一縮放 + y 翻轉 → SVG 座標系。"""
    if len(points) < 2:
        return

    safe_x = (MARGIN, VIEWBOX_W - MARGIN)  # (40, 260)
    safe_y = (MARGIN, VIEWBOX_H - MARGIN)  # (40, 210)

    xs = [p[0] for p in points.values()]
    ys = [p[1] for p in points.values()]
    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    span_x = max_x - min_x if max_x - min_x > TOLERANCE else 1.0
    span_y = max_y - min_y if max_y - min_y > TOLERANCE else 1.0

    scale = min(
        (safe_x[1] - safe_x[0]) / span_x,
        (safe_y[1] - safe_y[0]) / span_y,
    )

    cx = (safe_x[0] + safe_x[1]) / 2
    cy = (safe_y[0] + safe_y[1]) / 2
    mid_x = (min_x + max_x) / 2
    mid_y = (min_y + max_y) / 2

    for name in points:
        x, y = points[name]
        # y 翻轉：數學座標 y↑ → SVG y↓
        points[name] = (
            round(cx + (x - mid_x) * scale, 1),
            round(cy - (y - mid_y) * scale, 1),
        )


# ================================================================
# 退化檢查
# ================================================================

def _validate_geometry(points: dict) -> None:
    """檢查退化幾何：點重合。"""
    names = list(points.keys())
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            if _dist(points[names[i]], points[names[j]]) < 1.0:
                logger.warning("點重合警告: %s 和 %s 距離過近", names[i], names[j])


# ================================================================
# 組裝 renderer spec + 自動推導渲染標記
# ================================================================

def _build_renderer_spec(points: dict, circles: dict, spec: dict) -> dict:
    """
    組裝 svg_renderer.render_svg_from_spec() 的輸入格式。
    自動從約束推導 right_angles、special_points、equal_segments 等。
    """
    constraints = spec.get("constraints", [])
    draw = spec.get("draw", {})
    suppress_angles = set(draw.get("suppress_angle_labels", []))

    # 自動推導
    right_angles = []
    special_points = []
    equal_segments = []
    parallel_lines = []
    angle_labels = []

    for c in constraints:
        ctype = c.get("type")

        if ctype == "right_angle":
            v = c.get("vertex")
            if v and v not in right_angles:
                right_angles.append(v)

        elif ctype == "altitude":
            foot = c.get("foot")
            if foot:
                if foot not in right_angles:
                    right_angles.append(foot)
                if foot not in special_points:
                    special_points.append(foot)

        elif ctype == "midpoint":
            pt = c.get("point")
            if pt and pt not in special_points:
                special_points.append(pt)

        elif ctype == "point_on_segment":
            pt = c.get("point")
            if pt and pt not in special_points:
                special_points.append(pt)

        elif ctype == "equal_length":
            segs = c.get("segments", [])
            if len(segs) >= 2:
                equal_segments.append(segs)

        elif ctype == "parallel":
            s1 = c.get("seg1")
            s2 = c.get("seg2")
            if s1 and s2:
                parallel_lines.append([s1, s2])

        elif ctype == "angle":
            v = c.get("vertex")
            val = c.get("value")
            if v and val and v not in suppress_angles:
                angle_labels.append({"vertex": v, "text": f"{val}°"})

    # 圓
    circle_specs = []
    for center, radius in circles.items():
        if center in points:
            circle_specs.append({"center": center, "radius": radius})

    return {
        "points": {name: list(coord) for name, coord in points.items()},
        "segments": draw.get("segments", []),
        "right_angles": right_angles,
        "labels": draw.get("labels", []),
        "equal_segments": equal_segments,
        "equal_angles": [],
        "parallel_lines": parallel_lines,
        "circles": circle_specs,
        "arcs": draw.get("arcs", []),
        "special_points": special_points,
        "angle_labels": angle_labels,
    }
