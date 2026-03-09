"""
GeometryDescriptor — 統一的幾何描述中間層
==========================================
將原始 figure_description JSON 解析為分類結構，
供 readable 生成、前端渲染、編輯器、測試統一使用。

輸出分類：
  collinear_groups, parallel_groups, perpendicular_pairs,
  other_relationships, measurements, ratios,
  known_conditions, goals, primary_objects, secondary_objects, inferred_items
"""

from typing import Dict, List, Any, Optional


class GeometryDescriptor:
    """幾何 figure_description JSON 的中間表示層。"""

    def __init__(self, fig: dict):
        self.raw = fig
        self.objects: List[dict] = fig.get("objects", [])
        self.measurements_raw: List[dict] = fig.get("measurements", [])
        self.relationships_raw: List[dict] = fig.get("relationships", [])
        self.task: dict = fig.get("task", {})

        # 收集所有被引用的 object IDs
        self._referenced_ids = self._collect_referenced_ids()

        # 分類後的輸出
        self.collinear_groups: List[dict] = []
        self.parallel_groups: List[dict] = []
        self.perpendicular_pairs: List[dict] = []
        self.other_relationships: List[dict] = []
        self.measurements: List[dict] = []
        self.ratios: List[dict] = []
        self.known_conditions: List[str] = []
        self.goals: List[str] = []
        self.primary_objects: List[dict] = []
        self.secondary_objects: List[dict] = []
        self.inferred_items: List[dict] = []

        self._categorize()

    # ------------------------------------------------------------------
    # 公用工具
    # ------------------------------------------------------------------

    @staticmethod
    def strip_prefix(token: str) -> str:
        """
        去除工程前綴，轉為教學展示標籤。
        S_AB → AB, P_A → A, Tri_ABC → △ABC, Ang_ABC → ∠ABC, Cir_O → ⊙O
        """
        if not token:
            return token
        for prefix, replacement in [
            ("S_", ""), ("P_", ""), ("Tri_", "△"),
            ("Ang_", "∠"), ("Cir_", "⊙"), ("Poly_", ""),
            ("L_", ""), ("Ray_", ""),
        ]:
            if token.startswith(prefix):
                return replacement + token[len(prefix):]
        return token

    # ------------------------------------------------------------------
    # 內部：收集引用
    # ------------------------------------------------------------------

    def _collect_referenced_ids(self) -> set:
        """收集在 measurements、relationships 中被引用的所有 object IDs。"""
        refs: set = set()
        for m in self.measurements_raw:
            refs.add(m.get("target", ""))
        for r in self.relationships_raw:
            for e in r.get("entities", []):
                refs.add(e)
            for p in r.get("points", []):
                refs.add(p)
            for k in ("subject", "of", "target", "at"):
                if r.get(k):
                    refs.add(r[k])
            for item in r.get("items", []):
                if item.get("ref"):
                    refs.add(item["ref"])
        refs.discard("")
        return refs

    # ------------------------------------------------------------------
    # 內部：分類
    # ------------------------------------------------------------------

    def _categorize(self) -> None:
        """將原始 schema 解析為分類欄位。"""
        # --- Objects: 拆分為 primary / secondary ---
        for obj in self.objects:
            oid = obj.get("id", "")
            otype = obj.get("type", "")
            if otype == "point" or otype == "circle":
                self.primary_objects.append(obj)
            elif oid in self._referenced_ids:
                self.primary_objects.append(obj)
            else:
                self.secondary_objects.append(obj)

        # --- Relationships ---
        for rel in self.relationships_raw:
            rtype = rel.get("type", "")
            source = rel.get("source", "")

            if rtype == "collinear":
                pts = [self.strip_prefix(p) for p in rel.get("points", [])]
                entry = {"points": pts, "source": source}
                self.collinear_groups.append(entry)
                if source == "inferred":
                    self.inferred_items.append(entry)

            elif rtype == "parallel":
                entities = [self.strip_prefix(e) for e in rel.get("entities", [])]
                entry = {"entities": entities, "source": source}
                self.parallel_groups.append(entry)
                if source == "inferred":
                    self.inferred_items.append(entry)

            elif rtype == "perpendicular":
                entities = [self.strip_prefix(e) for e in rel.get("entities", [])]
                entry = {
                    "entities": entities,
                    "source": source,
                    "at": self.strip_prefix(rel.get("at", "")),
                }
                self.perpendicular_pairs.append(entry)
                if source == "inferred":
                    self.inferred_items.append(entry)

            elif rtype == "ratio":
                items = rel.get("items", [])
                value = rel.get("value", {})
                # 支持結構化 {"left":3,"right":2} 和字串 "3:2"
                if isinstance(value, dict):
                    display_val = f"{value.get('left', '')} : {value.get('right', '')}"
                else:
                    display_val = str(value)
                if len(items) >= 2:
                    left_label = self.strip_prefix(items[0].get("ref", ""))
                    right_label = self.strip_prefix(items[1].get("ref", ""))
                    entry = {
                        "display": f"{left_label} : {right_label} = {display_val}",
                        "source": source,
                        "raw": rel,
                    }
                    self.ratios.append(entry)
                    if source == "inferred":
                        self.inferred_items.append(entry)
            else:
                entry = {"type": rtype, "raw": rel, "source": source}
                self.other_relationships.append(entry)
                if source == "inferred":
                    self.inferred_items.append(entry)

        # --- Measurements ---
        for m in self.measurements_raw:
            target = self.strip_prefix(m.get("target", ""))
            prop = m.get("property", "")
            value = m.get("value", "")
            source = m.get("source", "")

            if prop == "degrees":
                val_str = str(value)
                if not val_str.endswith("°"):
                    display = f"∠{target} = {value}°"
                else:
                    display = f"∠{target} = {value}"
            elif prop == "length":
                display = f"{target} = {value}"
            else:
                display = f"{target} {prop} = {value}"

            entry = {
                "label": target,
                "property": prop,
                "value": value,
                "display": display,
                "source": source,
            }
            self.measurements.append(entry)
            if source == "inferred":
                self.inferred_items.append(entry)

        # --- Task ---
        self.known_conditions = self.task.get("known_conditions", [])
        self.goals = self.task.get("goals", [])

    # ------------------------------------------------------------------
    # 統一關係格式化
    # ------------------------------------------------------------------

    def describe_relationship(self, rel: dict) -> str:
        """將任意 relationship dict 轉為中文自然語言。"""
        rtype = rel.get("type", "")
        source = rel.get("source", "")
        suffix = "（推斷）" if source == "inferred" else ""

        formatters = {
            "parallel": lambda r: " ∥ ".join(
                self.strip_prefix(e) for e in r.get("entities", [])
            ),
            "perpendicular": lambda r: " ⊥ ".join(
                self.strip_prefix(e) for e in r.get("entities", [])
            ) + (
                f"，交於 {self.strip_prefix(r.get('at', ''))}"
                if r.get("at") else ""
            ),
            "collinear": lambda r: "、".join(
                self.strip_prefix(p) for p in r.get("points", [])
            ) + " 共線",
            "midpoint": lambda r: (
                f"{self.strip_prefix(r.get('subject', '?'))} 是 "
                f"{self.strip_prefix(r.get('of', '?'))} 中點"
            ),
            "on_segment": lambda r: (
                f"{self.strip_prefix(r.get('subject', '?'))} 在 "
                f"{self.strip_prefix(r.get('target', '?'))} 上"
            ),
            "bisector": lambda r: (
                f"{self.strip_prefix(r.get('subject', '?'))} 平分 "
                f"{self.strip_prefix(r.get('target', '?'))}"
            ),
            "congruent": lambda r: " ≅ ".join(
                self.strip_prefix(e) for e in r.get("entities", [])
            ),
            "similar": lambda r: " ∼ ".join(
                self.strip_prefix(e) for e in r.get("entities", [])
            ),
            "tangent": lambda r: self._format_tangent(r),
            "equal": lambda r: self._format_equal(r),
            "ratio": lambda r: self._format_ratio(r),
        }

        formatter = formatters.get(rtype)
        if formatter:
            try:
                return formatter(rel) + suffix
            except (IndexError, KeyError):
                pass

        entities = rel.get("entities", [])
        if entities:
            return (
                f"{rtype}: {', '.join(self.strip_prefix(e) for e in entities)}"
                + suffix
            )
        return rtype + suffix

    def _format_tangent(self, rel: dict) -> str:
        entities = rel.get("entities", [])
        if len(entities) >= 2:
            a = self.strip_prefix(entities[0])
            b = self.strip_prefix(entities[1])
            at = rel.get("at", "")
            at_str = f"，切點 {self.strip_prefix(at)}" if at else ""
            return f"{a} 切 {b}{at_str}"
        return "tangent"

    def _format_equal(self, rel: dict) -> str:
        items = rel.get("items", [])
        if len(items) >= 2:
            a = self.strip_prefix(items[0].get("ref", ""))
            b = self.strip_prefix(items[1].get("ref", ""))
            return f"{a} = {b}"
        return "equal"

    def _format_ratio(self, rel: dict) -> str:
        items = rel.get("items", [])
        value = rel.get("value", {})
        if isinstance(value, dict):
            display_val = f"{value.get('left', '')} : {value.get('right', '')}"
        else:
            display_val = str(value)
        if len(items) >= 2:
            a = self.strip_prefix(items[0].get("ref", ""))
            b = self.strip_prefix(items[1].get("ref", ""))
            return f"{a} : {b} = {display_val}"
        return f"ratio = {display_val}"

    # ------------------------------------------------------------------
    # 輸出
    # ------------------------------------------------------------------

    def to_readable_text(self) -> str:
        """
        生成約束優先的可讀文字（取代 _readable_v2）。

        輸出順序：
        1. 共線 → 2. 平行 → 3. 垂直 → 4. 其他關係
        → 5. 量測 → 6. 比例 → 7. 已知 → 8. 待求
        → 9. 點（僅在無共線時顯示）
        """
        sections: List[str] = []

        # 1. 共線
        for g in self.collinear_groups:
            suffix = "（推斷）" if g["source"] == "inferred" else ""
            sections.append(f"{'、'.join(g['points'])} 共線{suffix}")

        # 2. 平行（多實體鏈）
        for g in self.parallel_groups:
            suffix = "（推斷）" if g["source"] == "inferred" else ""
            sections.append(f"{' ∥ '.join(g['entities'])}{suffix}")

        # 3. 垂直
        for g in self.perpendicular_pairs:
            suffix = "（推斷）" if g["source"] == "inferred" else ""
            at_str = f"，交於 {g['at']}" if g.get("at") else ""
            sections.append(f"{' ⊥ '.join(g['entities'])}{at_str}{suffix}")

        # 4. 其他關係（midpoint, bisector, equal, similar, congruent 等）
        for g in self.other_relationships:
            sections.append(self.describe_relationship(g["raw"]))

        # 5. 量測
        for m in self.measurements:
            suffix = "（推斷）" if m["source"] == "inferred" else ""
            sections.append(f"{m['display']}{suffix}")

        # 6. 比例
        for r in self.ratios:
            suffix = "（推斷）" if r["source"] == "inferred" else ""
            sections.append(f"{r['display']}{suffix}")

        # 7. 已知條件
        if self.known_conditions:
            sections.append(f"已知：{'；'.join(self.known_conditions)}")

        # 8. 待求目標
        if self.goals:
            sections.append(f"求：{'；'.join(self.goals)}")

        # 9. 點（僅在沒有共線組時才單獨列出）
        if not self.collinear_groups:
            points = [
                self.strip_prefix(o.get("label", o.get("id", "")))
                for o in self.objects
                if o.get("type") == "point"
            ]
            if points:
                sections.append(f"點：{'、'.join(points)}")

        if not sections:
            overall = self.raw.get("overall_description", "")
            return overall if overall else "含幾何圖形"

        return "；".join(sections)

    def to_display_dict(self) -> dict:
        """生成結構化字典，供前端渲染。"""
        return {
            "collinear": [
                {"points": g["points"], "source": g["source"]}
                for g in self.collinear_groups
            ],
            "parallel": [
                {"entities": g["entities"], "source": g["source"]}
                for g in self.parallel_groups
            ],
            "perpendicular": [
                {
                    "entities": g["entities"],
                    "at": g.get("at", ""),
                    "source": g["source"],
                }
                for g in self.perpendicular_pairs
            ],
            "other_relationships": [
                {
                    "display": self.describe_relationship(g["raw"]),
                    "source": g["source"],
                }
                for g in self.other_relationships
            ],
            "measurements": [
                {"display": m["display"], "source": m["source"]}
                for m in self.measurements
            ],
            "ratios": [
                {"display": r["display"], "source": r["source"]}
                for r in self.ratios
            ],
            "known_conditions": self.known_conditions,
            "goals": self.goals,
            "primary_objects": [
                {
                    "id": o.get("id", ""),
                    "type": o.get("type", ""),
                    "label": self.strip_prefix(o.get("label", o.get("id", ""))),
                }
                for o in self.primary_objects
            ],
            "secondary_objects": [
                {
                    "id": o.get("id", ""),
                    "type": o.get("type", ""),
                    "label": self.strip_prefix(o.get("label", o.get("id", ""))),
                }
                for o in self.secondary_objects
            ],
        }
