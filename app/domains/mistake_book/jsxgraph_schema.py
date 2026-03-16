"""
JSXGraph 受限 DSL — Schema 定義 + 校驗
======================================
純函數模組，無外部依賴，易測試。

Phase 1 支援：point, circle, pointOnCircle, segment, intersection, textLabel
"""

import re
from typing import Dict, List, Tuple

# ================================================================
# 常量
# ================================================================

ALLOWED_ELEMENT_TYPES = frozenset({
    "point", "circle", "pointOnCircle", "segment", "intersection", "textLabel",
})

# 每個 type 的必要欄位 + 可選欄位
ELEMENT_SCHEMAS: Dict[str, Dict[str, List[str]]] = {
    "point":         {"required": ["coords"],            "optional": ["label"]},
    "circle":        {"required": ["center", "radius"],  "optional": ["label"]},
    "pointOnCircle": {"required": ["circle", "angle"],   "optional": ["label"]},
    "segment":       {"required": ["endpoints"],         "optional": ["label"]},
    "intersection":  {"required": ["of", "index"],       "optional": ["label"]},
    "textLabel":     {"required": ["text"],              "optional": ["at", "coords"]},
}

# 引用欄位 → 指向的 element type 白名單（None = 任意）
_REF_FIELDS: Dict[str, Dict[str, object]] = {
    "pointOnCircle": {"circle": {"circle"}},
    "segment":       {"endpoints": None},   # list of point-like ids
    "intersection":  {"of": None},          # list of segment/circle ids
}

# label / text 允許的字符集（中英數 + 常用數學符號）
_SAFE_TEXT_PATTERN = re.compile(
    r'^[\u4e00-\u9fff\u3000-\u303fA-Za-z0-9'
    r' °′″∠⊥∥△⊙≅≡≈≠≤≥±×÷√∞πθαβγδ'
    r'()（）\[\]{}=+\-*/.,;:!?\''
    r']+$'
)


# ================================================================
# 公開 API
# ================================================================

def validate_jsxgraph_config(config: dict) -> Tuple[bool, List[str]]:
    """
    校驗 JSXGraph config JSON。

    兩段式校驗：
      Pass 1: 收集所有 id、查重、查必要欄位
      Pass 2: 驗證引用完整性

    Returns: (is_valid, errors)
    """
    errors: List[str] = []

    # ---- 頂層結構 ----
    bbox = config.get("boundingBox")
    if not isinstance(bbox, list) or len(bbox) != 4:
        errors.append("boundingBox must be a list of 4 numbers")
    elif not all(isinstance(v, (int, float)) for v in bbox):
        errors.append("boundingBox values must be numbers")

    elements = config.get("elements")
    if not isinstance(elements, list):
        errors.append("elements must be a list")
        return (False, errors)

    # ---- Pass 1: 收集 id、查重、查欄位 ----
    all_ids: Dict[str, str] = {}  # id → element type
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            errors.append(f"[{i}] element must be a dict")
            continue

        etype = el.get("type")
        if etype not in ALLOWED_ELEMENT_TYPES:
            errors.append(f"[{i}] unknown type: {etype}")
            continue

        # id 唯一性（textLabel 可無 id）
        eid = el.get("id")
        if eid:
            if eid in all_ids:
                errors.append(f"[{i}] duplicate id: {eid}")
            else:
                all_ids[eid] = etype
        elif etype != "textLabel":
            errors.append(f"[{i}] {etype} must have an id")

        # 必要欄位
        schema = ELEMENT_SCHEMAS.get(etype, {})
        for field in schema.get("required", []):
            if field not in el:
                errors.append(f"[{i}] {etype} missing '{field}'")

        # 數值型欄位校驗
        if etype == "point":
            coords = el.get("coords")
            if coords is not None and (
                not isinstance(coords, list) or len(coords) != 2
                or not all(isinstance(v, (int, float)) for v in coords)
            ):
                errors.append(f"[{i}] point.coords must be [x, y] numbers")

        elif etype == "circle":
            r = el.get("radius")
            if r is not None and (not isinstance(r, (int, float)) or r <= 0):
                errors.append(f"[{i}] circle.radius must be a positive number")

        elif etype == "pointOnCircle":
            angle = el.get("angle")
            if angle is not None and not isinstance(angle, (int, float)):
                errors.append(f"[{i}] pointOnCircle.angle must be a number (degrees)")

        elif etype == "segment":
            eps = el.get("endpoints")
            if eps is not None and (not isinstance(eps, list) or len(eps) != 2):
                errors.append(f"[{i}] segment.endpoints must be [id1, id2]")

        elif etype == "intersection":
            of = el.get("of")
            if of is not None and (not isinstance(of, list) or len(of) != 2):
                errors.append(f"[{i}] intersection.of must be [id1, id2]")
            idx = el.get("index")
            if idx is not None and not isinstance(idx, int):
                errors.append(f"[{i}] intersection.index must be an integer")

        # text 安全（label 屬性 + textLabel.text）
        _check_text_field(el.get("label"), f"[{i}] label", errors)
        if etype == "textLabel":
            _check_text_field(el.get("text"), f"[{i}] text", errors)

    # ---- Pass 2: 引用完整性 ----
    for i, el in enumerate(elements):
        if not isinstance(el, dict):
            continue
        etype = el.get("type")
        if etype == "pointOnCircle":
            ref = el.get("circle")
            if ref and ref not in all_ids:
                errors.append(f"[{i}] pointOnCircle.circle refs undefined id: {ref}")
            elif ref and all_ids.get(ref) != "circle":
                errors.append(f"[{i}] pointOnCircle.circle must ref a circle, got {all_ids.get(ref)}")

        elif etype == "segment":
            for ref in (el.get("endpoints") or []):
                if ref and ref not in all_ids:
                    errors.append(f"[{i}] segment.endpoints refs undefined id: {ref}")

        elif etype == "intersection":
            for ref in (el.get("of") or []):
                if ref and ref not in all_ids:
                    errors.append(f"[{i}] intersection.of refs undefined id: {ref}")

        elif etype == "textLabel":
            at_ref = el.get("at")
            if at_ref and at_ref not in all_ids:
                errors.append(f"[{i}] textLabel.at refs undefined id: {at_ref}")

    return (len(errors) == 0, errors)


def sanitize_label_text(text: str) -> str:
    """
    純文本淨化 — 後端嚴格層。

    只允許安全字符集（中英數 + 常用數學符號）。
    不安全的字符直接移除。
    """
    if not text or not isinstance(text, str):
        return ""
    # 移除 HTML tag
    text = re.sub(r'<[^>]+>', '', text)
    # 只保留安全字符
    result = []
    for ch in text:
        if _SAFE_TEXT_PATTERN.match(ch):
            result.append(ch)
    return ''.join(result).strip()


# ================================================================
# 內部工具
# ================================================================

def _check_text_field(value, prefix: str, errors: List[str]) -> None:
    """檢查 label/text 欄位安全性。"""
    if value is None:
        return
    if not isinstance(value, str):
        errors.append(f"{prefix} must be a string")
        return
    if '<' in value or '>' in value:
        errors.append(f"{prefix} contains HTML tags (forbidden)")
    if len(value) > 50:
        errors.append(f"{prefix} too long (max 50 chars)")
