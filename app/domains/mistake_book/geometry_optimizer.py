"""
幾何約束數值優化器 — Phase 3

架構角色：
- 舊 solver (geometry_engine._resolve_constraints) 生成初始佈局
- 本模組作為後處理層，用 scipy.optimize.least_squares 做全局一致性修正
- 所有約束轉為統一 IR → residual vector → 非線性最小二乘求解

設計原則：
- 統一約束 IR，不再逐類型寫 resolver
- L_ref 歸一化，消除尺度依賴
- hard/soft/reg cost 分離，acceptance 以 hard_cost 為準
- 近重合點排斥（free-free + free-fixed），防止點重疊
- Multi-restart with 多檔擾動，逃離局部極小
- DOF 啟發式估計（diagnostics only）
- 診斷系統輸出每條約束殘差，支持 debug

IR 點順序約定：
- angle:   [ray1, vertex, ray2]  → ∠ray1-vertex-ray2
- midpoint: [M, A, B]           → M 是 AB 中點
- collinear/on_segment: [P, A, B] → P 在 AB 直線/線段上
- distance: [A, B]              → |AB|
- parallel: [A, B, C, D]        → AB ∥ CD
- perpendicular: [A, B, C, D]   → AB ⊥ CD
- equal_distance: [A, B, C, D]  → |AB| = |CD|
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy.optimize import least_squares

logger = logging.getLogger(__name__)

EPS = 1e-12  # 分母保護

# Multi-restart 參數
_N_RESTARTS = 3
_RESTART_SCALES = [0.02, 0.05, 0.10]  # 多檔擾動：精修 / 跳盆地 / 兜底
_RESTART_RMS_THRESHOLD = 1e-3  # hard RMS 低於此值跳過重啟

# ================================================================
# 1. 統一約束 IR
# ================================================================


@dataclass
class ConstraintIR:
    """統一約束中間表示。"""
    type: str               # distance, angle, midpoint, collinear, on_segment,
                            # perpendicular, parallel, equal_distance,
                            # on_circle_radius, on_circle_through
    points: list[str]       # 涉及的點名，順序見 spec_to_ir 映射表
    value: Optional[float] = None   # 目標值（距離/角度度數），None 表示純幾何關係
    weight: float = 1.0
    hard: bool = True       # hard constraint vs soft regularization
    source_type: Optional[str] = None    # 原始 spec type
    source_index: Optional[int] = None   # 第幾條原始 constraint


# ================================================================
# 2. spec_to_ir — 約束映射
# ================================================================


def spec_to_ir(constraints: list[dict]) -> list[ConstraintIR]:
    """將 LLM spec 約束列表轉為統一 IR。"""
    ir_list: list[ConstraintIR] = []

    for idx, c in enumerate(constraints):
        ctype = c.get("type", "")
        src_kw = dict(source_type=ctype, source_index=idx)

        if ctype == "length":
            seg = c.get("segment", [])
            if len(seg) >= 2:
                ir_list.append(ConstraintIR(
                    type="distance", points=[seg[0], seg[1]],
                    value=float(c["value"]), **src_kw))

        elif ctype == "angle":
            v, r1, r2 = c.get("vertex"), c.get("ray1"), c.get("ray2")
            val = float(c.get("value", 0))
            if v and r1 and r2:
                # ∠r1-v-r2 順序（幾何慣例）
                ir_list.append(ConstraintIR(
                    type="angle", points=[r1, v, r2],
                    value=val, **src_kw))

        elif ctype == "right_angle":
            v, r1, r2 = c.get("vertex"), c.get("ray1"), c.get("ray2")
            if v and r1 and r2:
                ir_list.append(ConstraintIR(
                    type="angle", points=[r1, v, r2],
                    value=90.0, **src_kw))

        elif ctype == "midpoint":
            pt = c.get("point")
            of = c.get("of", [])
            if pt and len(of) >= 2:
                ir_list.append(ConstraintIR(
                    type="midpoint", points=[pt, of[0], of[1]],
                    **src_kw))

        elif ctype == "point_on_segment":
            pt = c.get("point")
            seg = c.get("segment", [])
            if pt and len(seg) >= 2:
                # 拆為：共線 + segment 邊界
                ir_list.append(ConstraintIR(
                    type="collinear", points=[pt, seg[0], seg[1]],
                    **src_kw))
                ir_list.append(ConstraintIR(
                    type="on_segment", points=[pt, seg[0], seg[1]],
                    weight=5.0, **src_kw))

        elif ctype == "altitude":
            frm = c.get("from")
            to_side = c.get("to_side", [])
            foot = c.get("foot")
            if frm and len(to_side) >= 2:
                # 垂直：from→foot ⊥ to_side
                if foot:
                    ir_list.append(ConstraintIR(
                        type="perpendicular",
                        points=[frm, foot, to_side[0], to_side[1]],
                        **src_kw))
                    # 垂足在底邊直線上（line 語義，不強制 segment 內）
                    ir_list.append(ConstraintIR(
                        type="collinear",
                        points=[foot, to_side[0], to_side[1]],
                        **src_kw))

        elif ctype == "parallel":
            s1 = c.get("seg1", [])
            s2 = c.get("seg2", [])
            if len(s1) >= 2 and len(s2) >= 2:
                ir_list.append(ConstraintIR(
                    type="parallel",
                    points=[s1[0], s1[1], s2[0], s2[1]],
                    **src_kw))

        elif ctype == "perpendicular":
            s1 = c.get("seg1", [])
            s2 = c.get("seg2", [])
            if len(s1) >= 2 and len(s2) >= 2:
                ir_list.append(ConstraintIR(
                    type="perpendicular",
                    points=[s1[0], s1[1], s2[0], s2[1]],
                    **src_kw))

        elif ctype == "equal_length":
            segs = c.get("segments", [])
            # 相鄰對做 equal_distance
            for i in range(len(segs) - 1):
                if len(segs[i]) >= 2 and len(segs[i + 1]) >= 2:
                    ir_list.append(ConstraintIR(
                        type="equal_distance",
                        points=[segs[i][0], segs[i][1],
                                segs[i + 1][0], segs[i + 1][1]],
                        **src_kw))

        elif ctype == "circle":
            center = c.get("center")
            radius = c.get("radius")
            if center and radius is not None:
                ir_list.append(ConstraintIR(
                    type="on_circle_radius",
                    points=[center],
                    value=float(radius), **src_kw))

        elif ctype == "circle_through":
            center = c.get("center")
            through = c.get("through")
            if center and through:
                ir_list.append(ConstraintIR(
                    type="on_circle_through",
                    points=[center, through],
                    **src_kw))

    return ir_list


# ================================================================
# 3. Residual 構建
# ================================================================


def _get_pt(pts: dict, name: str) -> np.ndarray:
    """取點座標為 numpy array。"""
    return np.array(pts[name], dtype=float)


def _dist(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.linalg.norm(a - b))


def _angle_wrap(diff: float) -> float:
    """將角度差 wrap 到 [-π, π]。"""
    return (diff + math.pi) % (2 * math.pi) - math.pi


def _compute_residuals(ir: ConstraintIR, pts: dict,
                       L_ref: float) -> list[float]:
    """計算單條約束的 residual 向量。"""
    t = ir.type
    p = ir.points

    if t == "distance":
        a, b = _get_pt(pts, p[0]), _get_pt(pts, p[1])
        d = _dist(a, b)
        return [(d - ir.value) / L_ref]

    elif t == "angle":
        # points = [ray1, vertex, ray2]，∠ray1-vertex-ray2
        r1 = _get_pt(pts, p[0])
        v = _get_pt(pts, p[1])
        r2 = _get_pt(pts, p[2])
        v1 = r1 - v
        v2 = r2 - v
        mag1, mag2 = np.linalg.norm(v1), np.linalg.norm(v2)
        if mag1 < EPS or mag2 < EPS:
            return [0.0]
        cos_val = np.clip(np.dot(v1, v2) / (mag1 * mag2), -1.0, 1.0)
        actual_rad = math.acos(cos_val)
        target_rad = math.radians(ir.value)
        diff = _angle_wrap(actual_rad - target_rad)
        # 角度 residual 量級：弧度 × 權重因子使其與距離類可比
        # 使用固定 scale factor（不依賴 L_ref，因為弧度本身 ~O(1)）
        return [diff * 10.0]  # scale factor 使 ~0.1 rad ≈ ~1.0 distance residual

    elif t == "midpoint":
        # points = [M, A, B]
        m = _get_pt(pts, p[0])
        a = _get_pt(pts, p[1])
        b = _get_pt(pts, p[2])
        mid = (a + b) / 2
        diff = m - mid
        return [diff[0] / L_ref, diff[1] / L_ref]

    elif t == "collinear":
        # points = [P, A, B]
        pt = _get_pt(pts, p[0])
        a = _get_pt(pts, p[1])
        b = _get_pt(pts, p[2])
        ab = b - a
        ab_len = np.linalg.norm(ab)
        if ab_len < EPS:
            return [0.0]
        # 叉積 / ||AB|| → 點到直線距離
        cross = float((pt[0] - a[0]) * ab[1] - (pt[1] - a[1]) * ab[0])
        return [cross / (ab_len * L_ref)]

    elif t == "on_segment":
        # points = [P, A, B]，hinge penalty 保證 t ∈ [0,1]
        pt = _get_pt(pts, p[0])
        a = _get_pt(pts, p[1])
        b = _get_pt(pts, p[2])
        ab = b - a
        ab_sq = float(np.dot(ab, ab))
        if ab_sq < EPS:
            return [0.0]
        t_val = float(np.dot(pt - a, ab)) / ab_sq
        # 無量綱 hinge penalty
        penalty = max(0.0, -t_val) + max(0.0, t_val - 1.0)
        return [penalty]

    elif t == "perpendicular":
        # points = [A, B, C, D]，AB ⊥ CD
        a, b = _get_pt(pts, p[0]), _get_pt(pts, p[1])
        c, d = _get_pt(pts, p[2]), _get_pt(pts, p[3])
        ab, cd = b - a, d - c
        mag_ab, mag_cd = np.linalg.norm(ab), np.linalg.norm(cd)
        denom = mag_ab * mag_cd
        if denom < EPS:
            return [0.0]
        return [float(np.dot(ab, cd)) / denom]

    elif t == "parallel":
        # points = [A, B, C, D]，AB ∥ CD
        a, b = _get_pt(pts, p[0]), _get_pt(pts, p[1])
        c, d = _get_pt(pts, p[2]), _get_pt(pts, p[3])
        ab, cd = b - a, d - c
        mag_ab, mag_cd = np.linalg.norm(ab), np.linalg.norm(cd)
        denom = mag_ab * mag_cd
        if denom < EPS:
            return [0.0]
        cross = float(ab[0] * cd[1] - ab[1] * cd[0])
        return [cross / denom]

    elif t == "equal_distance":
        # points = [A, B, C, D]，||AB|| = ||CD||
        a, b = _get_pt(pts, p[0]), _get_pt(pts, p[1])
        c, d = _get_pt(pts, p[2]), _get_pt(pts, p[3])
        return [(_dist(a, b) - _dist(c, d)) / L_ref]

    elif t == "on_circle_radius":
        # points = [center]，value = radius
        # 這類約束在 Phase 1 不直接優化圓心位置
        return [0.0]

    elif t == "on_circle_through":
        # points = [center, through_point]
        return [0.0]

    return [0.0]


# ================================================================
# 3b. 約束相關點對（排斥豁免）
# ================================================================


def _build_related_pairs(ir_constraints: list[ConstraintIR]) -> set[frozenset]:
    """按約束語義構建直接相關的點對集合，這些點對不應被排斥。"""
    pairs: set[frozenset] = set()
    for ir in ir_constraints:
        p = ir.points
        t = ir.type

        if t == "distance" and len(p) >= 2:
            pairs.add(frozenset([p[0], p[1]]))

        elif t == "midpoint" and len(p) >= 3:
            # M 與 A, B 相關，但 A-B 不豁免
            pairs.add(frozenset([p[0], p[1]]))
            pairs.add(frozenset([p[0], p[2]]))

        elif t in ("collinear", "on_segment") and len(p) >= 3:
            pairs.add(frozenset([p[0], p[1]]))
            pairs.add(frozenset([p[0], p[2]]))

        elif t == "angle" and len(p) >= 3:
            # [ray1, vertex, ray2] → {V,A}, {V,B}
            pairs.add(frozenset([p[1], p[0]]))
            pairs.add(frozenset([p[1], p[2]]))

        elif t in ("parallel", "perpendicular", "equal_distance") and len(p) >= 4:
            # 只豁免同線段對，不跨線
            pairs.add(frozenset([p[0], p[1]]))
            pairs.add(frozenset([p[2], p[3]]))

    return pairs


# ================================================================
# 3c. 求解輔助函數
# ================================================================


def _run_solve(residual_fn, x_init):
    """單次 least_squares 求解。返回 result 或 None。"""
    try:
        result = least_squares(
            residual_fn, x_init,
            method='trf', loss='soft_l1',
            ftol=1e-10, xtol=1e-10, max_nfev=500,
        )
        if not np.all(np.isfinite(result.x)):
            return None
        if not np.all(np.isfinite(result.fun)):
            return None
        if not np.isfinite(result.cost):
            return None
        return result
    except Exception:
        return None


def _count_dof_estimate(free_names, ir_constraints):
    """啟發式 DOF 估計（非嚴格數學自由度，不考慮約束依賴/冗餘）。"""
    _EQ_COUNT = {
        "distance": 1, "angle": 1, "midpoint": 2,
        "collinear": 1, "on_segment": 0,
        "perpendicular": 1, "parallel": 1, "equal_distance": 1,
        "on_circle_radius": 0, "on_circle_through": 0,
    }
    n_dof = 2 * len(free_names)
    n_eqs = sum(_EQ_COUNT.get(ir.type, 0) for ir in ir_constraints if ir.hard)
    return n_dof, n_eqs, n_dof - n_eqs


def _count_hard_residual_scalars(hard_irs):
    """計算 hard residual 的 scalar 數量（用於 RMS 計算）。"""
    # 每種約束的 residual scalar 數
    _SCALAR_COUNT = {
        "distance": 1, "angle": 1, "midpoint": 2,
        "collinear": 1, "on_segment": 1,
        "perpendicular": 1, "parallel": 1, "equal_distance": 1,
        "on_circle_radius": 1, "on_circle_through": 1,
    }
    return max(sum(_SCALAR_COUNT.get(ir.type, 1) for ir in hard_irs), 1)


# ================================================================
# 4. 主求解函數
# ================================================================


def optimize_layout(
    points0: dict[str, tuple[float, float]],
    ir_constraints: list[ConstraintIR],
    base_edge: tuple[str, str],
) -> tuple[dict[str, tuple[float, float]], dict]:
    """
    用 scipy.optimize.least_squares 全局優化所有點位。

    Args:
        points0: 初始位置（來自舊 solver）
        ir_constraints: 統一 IR 約束列表
        base_edge: (from_name, to_name) 固定不動的基準邊

    Returns:
        (optimized_points, diagnostics)
    """
    if not ir_constraints:
        return dict(points0), _empty_diagnostics()

    # 過濾：只優化約束中實際涉及且已被放置的點
    constrained_points = set()
    for ir in ir_constraints:
        constrained_points.update(ir.points)
    constrained_points &= set(points0.keys())

    # 自由變量：排除 base_edge 端點
    fixed = set(base_edge)
    free_names = sorted(constrained_points - fixed)

    if not free_names:
        return dict(points0), _empty_diagnostics()

    # L_ref：base edge 長度
    b0 = np.array(points0[base_edge[0]], dtype=float)
    b1 = np.array(points0[base_edge[1]], dtype=float)
    L_ref = max(float(np.linalg.norm(b1 - b0)), 1.0)

    # 初始變量向量 x0 = [x0, y0, x1, y1, ...]
    x0 = np.array([c for name in free_names
                    for c in points0[name]], dtype=float)

    # 重建 points dict from x vector
    def _reconstruct(x: np.ndarray) -> dict[str, tuple[float, float]]:
        pts = dict(points0)  # 包含 fixed 點
        for i, name in enumerate(free_names):
            pts[name] = (float(x[2 * i]), float(x[2 * i + 1]))
        return pts

    # 分類約束
    hard_irs = [ir for ir in ir_constraints if ir.hard]
    soft_irs = [ir for ir in ir_constraints if not ir.hard]

    # 構建排斥豁免點對
    related_pairs = _build_related_pairs(ir_constraints)

    # 預算 free-free 和 free-fixed 非相關點對索引
    free_free_repel = []
    for i in range(len(free_names)):
        for j in range(i + 1, len(free_names)):
            if frozenset([free_names[i], free_names[j]]) not in related_pairs:
                free_free_repel.append((i, j))

    fixed_names = sorted(fixed & set(points0.keys()))
    free_fixed_repel = []
    for i, fname in enumerate(free_names):
        for fxname in fixed_names:
            if frozenset([fname, fxname]) not in related_pairs:
                free_fixed_repel.append((i, fxname))

    min_sep = 0.05 * L_ref

    # 構建完整 residual 函數
    def _full_residual(x: np.ndarray) -> np.ndarray:
        pts = _reconstruct(x)
        res = []

        # Hard constraints
        for ir in hard_irs:
            r = _compute_residuals(ir, pts, L_ref)
            res.extend([v * ir.weight for v in r])

        # Soft constraints
        for ir in soft_irs:
            r = _compute_residuals(ir, pts, L_ref)
            res.extend([v * ir.weight for v in r])

        # 審美正則：偏離初始位置（微弱）
        for i, name in enumerate(free_names):
            dx = (x[2 * i] - points0[name][0]) / L_ref * 0.01
            dy = (x[2 * i + 1] - points0[name][1]) / L_ref * 0.01
            res.extend([dx, dy])

        # 近重合點排斥：free-free
        for i, j in free_free_repel:
            d = math.hypot(x[2*i] - x[2*j], x[2*i+1] - x[2*j+1]) + EPS
            if d < min_sep:
                res.append((min_sep - d) / L_ref * 0.3)

        # 近重合點排斥：free-fixed
        for fi, fxname in free_fixed_repel:
            fx_pt = points0[fxname]
            d = math.hypot(x[2*fi] - fx_pt[0], x[2*fi+1] - fx_pt[1]) + EPS
            if d < min_sep:
                res.append((min_sep - d) / L_ref * 0.3)

        return np.array(res, dtype=float)

    # 構建只計算 hard residual 的函數（用於 acceptance 判定）
    def _hard_residual(x: np.ndarray) -> float:
        pts = _reconstruct(x)
        cost = 0.0
        for ir in hard_irs:
            r = _compute_residuals(ir, pts, L_ref)
            cost += sum(v * v * ir.weight * ir.weight for v in r)
        return cost

    # DOF 估計
    dof_est, eq_est, excess_dof = _count_dof_estimate(free_names, ir_constraints)

    # 計算初始 hard cost
    initial_hard_cost = _hard_residual(x0)
    initial_full = _full_residual(x0)
    initial_total_cost = float(np.sum(initial_full ** 2))

    # Hard residual scalar 數（用於 RMS 計算）
    n_hard_scalars = _count_hard_residual_scalars(hard_irs)

    # === 首次求解 ===
    result = _run_solve(_full_residual, x0)
    if result is None:
        logger.warning("首次 least_squares 求解失敗，fallback")
        return dict(points0), _error_diagnostics("solve failed")

    best_result = result
    best_hard_cost = _hard_residual(result.x)
    n_restarts_tried = 0
    restart_improved = False

    # === Multi-restart ===
    hard_rms = math.sqrt(best_hard_cost / n_hard_scalars)
    if hard_rms > _RESTART_RMS_THRESHOLD:
        rng = np.random.default_rng(42)
        best_x = result.x.copy()

        for k, scale in enumerate(_RESTART_SCALES):
            x_perturbed = best_x + rng.normal(0, scale * L_ref, size=best_x.shape)
            res_k = _run_solve(_full_residual, x_perturbed)
            n_restarts_tried += 1

            if res_k is None:
                continue

            hc_k = _hard_residual(res_k.x)
            if hc_k < best_hard_cost:
                best_result = res_k
                best_hard_cost = hc_k
                best_x = res_k.x.copy()
                restart_improved = True

        if restart_improved:
            logger.info(
                "Multi-restart 改善: hard_cost %.6f → %.6f (%d restarts)",
                _hard_residual(result.x), best_hard_cost, n_restarts_tried)

    # === 最終結果 ===
    final_hard_cost = best_hard_cost
    final_pts = _reconstruct(best_result.x)

    # 診斷
    diagnostics = _build_diagnostics(
        best_result, ir_constraints, final_pts, L_ref,
        initial_hard_cost, final_hard_cost,
        initial_total_cost, float(best_result.cost),
        dof_estimate=dof_est,
        constraint_eq_estimate=eq_est,
        excess_dof_estimate=excess_dof,
        n_restarts_tried=n_restarts_tried,
        restart_improved=restart_improved,
    )

    # Acceptance 以 hard_cost 為準
    if final_hard_cost > initial_hard_cost * 1.02:
        logger.warning(
            "優化後 hard_cost 劣化: %.4f → %.4f，保留舊 solver",
            initial_hard_cost, final_hard_cost)
        diagnostics["accepted"] = False
        return dict(points0), diagnostics

    if not best_result.success:
        if final_hard_cost <= initial_hard_cost:
            logger.info(
                "優化未完全收斂但殘差改善: %.4f → %.4f，接受結果",
                initial_hard_cost, final_hard_cost)
        else:
            logger.warning("優化未收斂且無改善，fallback")
            diagnostics["accepted"] = False
            return dict(points0), diagnostics

    diagnostics["accepted"] = True
    return final_pts, diagnostics


# ================================================================
# 5. 診斷系統
# ================================================================


def _build_diagnostics(
    result, ir_constraints, pts, L_ref,
    initial_hard_cost, final_hard_cost,
    initial_total_cost, final_total_cost,
    *,
    dof_estimate=0, constraint_eq_estimate=0, excess_dof_estimate=0,
    n_restarts_tried=0, restart_improved=False,
) -> dict:
    """構建詳細診斷輸出。"""
    renderer_only_types = {"on_circle_radius", "on_circle_through"}

    per_constraint = []
    for ir in ir_constraints:
        if ir.type in renderer_only_types:
            per_constraint.append({
                "source_type": ir.source_type,
                "source_index": ir.source_index,
                "ir_type": ir.type,
                "points": ir.points,
                "residual_norm": 0.0,
                "weighted_norm": 0.0,
                "hard": ir.hard,
                "participates_in_optimization": False,
                "status": "renderer_only",
            })
            continue

        r = _compute_residuals(ir, pts, L_ref)
        r_norm = math.sqrt(sum(v * v for v in r))
        w_norm = r_norm * ir.weight
        per_constraint.append({
            "source_type": ir.source_type,
            "source_index": ir.source_index,
            "ir_type": ir.type,
            "points": ir.points,
            "residual_norm": round(r_norm, 6),
            "weighted_norm": round(w_norm, 6),
            "hard": ir.hard,
        })

    # Top violations
    top = sorted(per_constraint, key=lambda x: -x["weighted_norm"])[:5]

    # 近重合點
    near_coincident = []
    names = list(pts.keys())
    threshold = 0.03 * L_ref
    for i in range(len(names)):
        for j in range(i + 1, len(names)):
            d = math.hypot(pts[names[i]][0] - pts[names[j]][0],
                           pts[names[i]][1] - pts[names[j]][1])
            if d < threshold:
                near_coincident.append((names[i], names[j], round(d, 2)))

    return {
        "converged": result.success,
        "message": result.message,
        "initial_hard_cost": round(initial_hard_cost, 6),
        "final_hard_cost": round(final_hard_cost, 6),
        "initial_total_cost": round(initial_total_cost, 6),
        "final_total_cost": round(final_total_cost, 6),
        "hard_cost_improved": final_hard_cost <= initial_hard_cost,
        "per_constraint": per_constraint,
        "top_violations": top,
        "near_coincident_points": near_coincident,
        "n_function_evals": result.nfev,
        "accepted": None,  # 由 caller 設定
        # Phase 3: DOF 估計
        "dof_estimate": dof_estimate,
        "constraint_eq_estimate": constraint_eq_estimate,
        "excess_dof_estimate": excess_dof_estimate,
        "under_constrained_estimate": excess_dof_estimate > 0,
        "over_constrained_estimate": excess_dof_estimate < 0,
        # Phase 3: Multi-restart
        "n_restarts_tried": n_restarts_tried,
        "restart_improved": restart_improved,
    }


def _empty_diagnostics() -> dict:
    return {
        "converged": True, "message": "no constraints",
        "initial_hard_cost": 0.0, "final_hard_cost": 0.0,
        "initial_total_cost": 0.0, "final_total_cost": 0.0,
        "hard_cost_improved": False,
        "per_constraint": [], "top_violations": [],
        "near_coincident_points": [], "n_function_evals": 0,
        "accepted": True,
        "dof_estimate": 0, "constraint_eq_estimate": 0,
        "excess_dof_estimate": 0,
        "under_constrained_estimate": False,
        "over_constrained_estimate": False,
        "n_restarts_tried": 0, "restart_improved": False,
    }


def _error_diagnostics(msg: str) -> dict:
    d = _empty_diagnostics()
    d["converged"] = False
    d["message"] = msg
    d["accepted"] = False
    return d
