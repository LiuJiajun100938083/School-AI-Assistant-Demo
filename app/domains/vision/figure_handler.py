"""
幾何圖形描述 + Schema 驗證
============================
從 VisionService 拆出。處理 figure_description 的
正規化、可讀描述生成、前端展示字典、schema 校驗。
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def normalize_figure_description(raw) -> str:
    """
    將 figure_description 統一轉為字符串。

    Vision 模型可能返回：
    1. 結構化 JSON 對象 → 序列化為 JSON 字符串保存
    2. 純文字字符串 → 直接使用
    3. "none" / null / 空 → 返回 ""
    """
    if not raw:
        return ""

    if isinstance(raw, dict):
        if not raw.get("has_figure", True):
            return ""
        try:
            return json.dumps(raw, ensure_ascii=False)
        except (TypeError, ValueError):
            return str(raw)

    if isinstance(raw, str):
        stripped = raw.strip().lower()
        if stripped in ("none", "null", "n/a", "無", "", "{}"):
            return ""
        if raw.strip().startswith("{"):
            try:
                obj = json.loads(raw)
                if isinstance(obj, dict) and not obj.get("has_figure", True):
                    return ""
                return raw.strip()
            except (json.JSONDecodeError, ValueError):
                from app.domains.vision.json_utils import repair_truncated_json
                repaired = repair_truncated_json(raw)
                if repaired is not None:
                    if isinstance(repaired, dict) and not repaired.get("has_figure", True):
                        return ""
                    return json.dumps(repaired, ensure_ascii=False)
        return raw.strip()

    return str(raw) if raw else ""


def generate_readable_description(fig_json_str: str, schema_version: int = 1) -> str:
    """
    將 figure_description JSON 轉為人類可讀文字。

    - v1（舊 elements 版）
    - v2（新 4 層約束版）
    """
    if not fig_json_str or not fig_json_str.strip():
        return ""

    try:
        fig = json.loads(fig_json_str) if isinstance(fig_json_str, str) else fig_json_str
    except (json.JSONDecodeError, TypeError):
        return "含幾何圖形"

    if not isinstance(fig, dict):
        return "含幾何圖形"

    if not fig.get("has_figure", True):
        return ""

    if schema_version >= 2:
        return _readable_v2(fig)
    return _readable_v1(fig)


def _readable_v1(fig: dict) -> str:
    """v1 schema (舊 elements 版) 的可讀描述"""
    parts = []

    elements = fig.get("elements", [])
    if elements:
        points = []
        segments = []
        others = []
        for el in elements:
            el_type = el.get("type", "")
            label = el.get("label", el.get("name", ""))
            if el_type == "point" and label:
                points.append(label)
            elif el_type in ("line_segment", "segment", "line") and label:
                segments.append(label)
            elif label:
                others.append(f"{el_type}: {label}")

        if points:
            parts.append(f"點：{'、'.join(points)}")
        if segments:
            parts.append(f"線段：{'、'.join(segments)}")
        if others:
            parts.extend(others)

    rels = fig.get("relationships", [])
    if rels:
        for rel in rels:
            rel_type = rel.get("type", "")
            desc = rel.get("description", "")
            if desc:
                parts.append(desc)
            elif rel_type:
                entities = rel.get("entities", [])
                parts.append(f"{rel_type}: {', '.join(str(e) for e in entities)}")

    measurements = fig.get("measurements", [])
    if measurements:
        for m in measurements:
            target = m.get("target", "")
            prop = m.get("property", "")
            value = m.get("value", "")
            if target and value:
                parts.append(f"{target} {prop} = {value}")

    fig_type = fig.get("figure_type", "")
    if fig_type and not parts:
        parts.append(f"圖形類型：{fig_type}")

    if not parts:
        overall = fig.get("overall_description", "")
        if overall:
            return overall
        return "含幾何圖形"

    return "；".join(parts)


def _readable_v2(fig: dict) -> str:
    """v2 schema (新 4 層約束版) 的可讀描述"""
    from app.domains.vision.geometry_descriptor import GeometryDescriptor
    desc = GeometryDescriptor(fig)
    return desc.to_readable_text()


def generate_display_descriptor(fig_json_str: str) -> "dict | None":
    """生成結構化展示字典，供前端渲染。"""
    from app.domains.vision.geometry_descriptor import GeometryDescriptor
    if not fig_json_str:
        return None
    try:
        fig = json.loads(fig_json_str) if isinstance(fig_json_str, str) else fig_json_str
    except (json.JSONDecodeError, TypeError):
        return None
    if not isinstance(fig, dict) or not fig.get("has_figure", True):
        return None
    desc = GeometryDescriptor(fig)
    return desc.to_display_dict()


def validate_figure_schema(fig_json: dict, version: int = 2) -> list:
    """
    輕量校驗器，返回警告列表（非阻塞）。
    """
    warnings = []

    if not isinstance(fig_json, dict):
        warnings.append("figure_description 不是有效的字典")
        return warnings

    if not fig_json.get("has_figure", True):
        return []

    if version < 2:
        return []

    objects = fig_json.get("objects", [])
    if not objects:
        warnings.append("has_figure=true 但 objects 層為空")

    known_ids = set()
    for obj in objects:
        oid = obj.get("id", "")
        if not oid:
            warnings.append(f"object 缺少 id: {obj}")
        else:
            known_ids.add(oid)

    # ── 3D 對象欄位校驗 ──
    allowed_rendered_as = {"ellipse", "parallelogram", "trapezoid"}
    allowed_roles = {
        "apex", "base_center", "base_edge", "lateral_edge",
        "height", "slant_height", "base_vertex", "top_vertex",
        "base", "cross_section", "net_face",
    }
    allowed_line_styles = {"solid", "dashed"}

    for obj in objects:
        oid = obj.get("id", "")
        otype = obj.get("type", "")

        # Sol_ 對象需要特定欄位
        if oid.startswith("Sol_"):
            if otype == "cone" and not obj.get("apex"):
                warnings.append(f"cone '{oid}' 缺少 'apex' 欄位")
            if otype == "cylinder" and not obj.get("top_center"):
                warnings.append(f"cylinder '{oid}' 缺少 'top_center' 欄位")
            if otype == "pyramid" and not obj.get("apex"):
                warnings.append(f"pyramid '{oid}' 缺少 'apex' 欄位")
            if otype == "prism" and not obj.get("top_vertices"):
                warnings.append(f"prism '{oid}' 缺少 'top_vertices' 欄位")

        # 可選欄位值校驗
        parent = obj.get("parent", "")
        if parent and parent not in known_ids:
            warnings.append(f"object '{oid}' parent '{parent}' 不在 objects 中")

        rendered_as = obj.get("rendered_as", "")
        if rendered_as and rendered_as not in allowed_rendered_as:
            warnings.append(f"object '{oid}' rendered_as '{rendered_as}' 不在允許值中")

        role = obj.get("role", "")
        if role and role not in allowed_roles:
            warnings.append(f"object '{oid}' role '{role}' 不在允許值中")

        line_style = obj.get("line_style", "")
        if line_style and line_style not in allowed_line_styles:
            warnings.append(f"object '{oid}' line_style '{line_style}' 不在允許值中")

    # ── markers 層校驗 ──
    allowed_marker_types = {
        "length_tick", "right_angle_box", "angle_arc",
        "parallel_arrow", "dashed_line", "tangent_touch", "center_mark",
    }
    marker_ids = set()
    for mk in fig_json.get("markers", []):
        mk_id = mk.get("id", "")
        if mk_id:
            marker_ids.add(mk_id)
        mk_type = mk.get("type", "")
        if mk_type and mk_type not in allowed_marker_types:
            warnings.append(f"marker type '{mk_type}' 不在允許值中")
        attached = mk.get("attached_to", "")
        if attached and attached not in known_ids:
            warnings.append(f"marker attached_to '{attached}' 不在 objects 中")

    allowed_sources = {"figure", "question_text", "inferred"}

    # ── measurements 層校驗 ──
    allowed_properties = {
        "length", "degrees", "radius", "area", "perimeter",
        "slant_height", "surface_area", "volume", "lateral_area",
    }
    for m in fig_json.get("measurements", []):
        target = m.get("target", "")
        if target and target not in known_ids:
            warnings.append(f"measurement target '{target}' 不在 objects 中")
        source = m.get("source", "")
        if source and source not in allowed_sources:
            warnings.append(f"measurement source '{source}' 不在允許值中")
        prop = m.get("property", "")
        if prop and prop not in allowed_properties:
            warnings.append(f"measurement property '{prop}' 不在允許值中")

    allowed_rel_types = {
        # 平面幾何
        "parallel", "perpendicular", "midpoint", "collinear",
        "congruent", "similar", "tangent", "on_segment",
        "bisector", "equal", "ratio", "intersection",
        "angle_bisector",
        # 圓幾何
        "equal_tangent_length", "same_segment_angle",
        "angle_in_semicircle", "cyclic_quadrilateral",
        "alternate_segment", "equal_chord_equal_arc",
        # 3D 立體幾何
        "perpendicular_to_plane", "line_plane_angle",
        "plane_plane_angle", "face_of",
    }

    for rel in fig_json.get("relationships", []):
        source = rel.get("source", "")
        if source and source not in allowed_sources:
            warnings.append(f"relationship source '{source}' 不在允許值中")

        rel_type = rel.get("type", "")
        if rel_type and rel_type not in allowed_rel_types:
            warnings.append(f"relationship type '{rel_type}' 不在已知類型中")

        if rel_type == "ratio":
            items = rel.get("items", [])
            if len(items) < 2:
                warnings.append("ratio relationship 需要至少 2 個 items")
            for item in items:
                if not item.get("ref"):
                    warnings.append(f"ratio item 缺少 ref: {item}")
                if item.get("ref") and item["ref"] not in known_ids:
                    warnings.append(
                        f"ratio item ref '{item['ref']}' 不在 objects 中"
                    )

        if rel_type in ("parallel", "perpendicular"):
            for entity in rel.get("entities", []):
                if entity and entity.startswith("P_"):
                    warnings.append(
                        f"{rel_type} 引用了點 '{entity}'，應引用線段/直線"
                    )
        if rel_type == "collinear":
            for pt in rel.get("points", []):
                if pt and not pt.startswith("P_"):
                    warnings.append(
                        f"collinear 引用 '{pt}'，應為點（P_ 前綴）"
                    )
        if rel_type == "perpendicular_to_plane":
            subj = rel.get("subject", "")
            tgt = rel.get("target", "")
            if subj and not (subj.startswith("S_") or subj.startswith("L_")):
                warnings.append(
                    f"perpendicular_to_plane subject '{subj}' 應為線段/直線"
                )
            if tgt and not (tgt.startswith("Poly_") or tgt.startswith("Tri_")):
                warnings.append(
                    f"perpendicular_to_plane target '{tgt}' 應為多邊形/三角形（面）"
                )

        for entity in rel.get("entities", []):
            if entity and entity not in known_ids:
                warnings.append(
                    f"relationship entities 引用 '{entity}' 不在 objects 中"
                )
        for ref_key in ("subject", "of", "target", "at"):
            ref_val = rel.get(ref_key, "")
            if ref_val and ref_val not in known_ids:
                warnings.append(
                    f"relationship.{ref_key} 引用 '{ref_val}' 不在 objects 中"
                )
        for pt in rel.get("points", []):
            if pt and pt not in known_ids:
                warnings.append(
                    f"relationship points 引用 '{pt}' 不在 objects 中"
                )

    if warnings:
        logger.info(
            "figure schema 校驗發現 %d 個警告: %s",
            len(warnings), "; ".join(warnings[:5]),
        )

    return warnings
