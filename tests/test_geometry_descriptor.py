"""
GeometryDescriptor 單元測試
============================
- readable output: 約束優先、無工程 token
- relationship formatting: 多實體 parallel、ratio
- object filtering: primary vs secondary
- validator: ratio 支持、類型相容性
"""

import sys
import os

# 添加項目根目錄
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pytest
from app.domains.vision.geometry_descriptor import GeometryDescriptor

# 來自反饋的幾何題目測試數據
SAMPLE_FIGURE = {
    "has_figure": True,
    "figure_type": "geometry",
    "objects": [
        {"id": "P_A", "type": "point", "label": "A"},
        {"id": "P_B", "type": "point", "label": "B"},
        {"id": "P_C", "type": "point", "label": "C"},
        {"id": "P_D", "type": "point", "label": "D"},
        {"id": "P_E", "type": "point", "label": "E"},
        {"id": "P_F", "type": "point", "label": "F"},
        {"id": "P_G", "type": "point", "label": "G"},
        {"id": "P_H", "type": "point", "label": "H"},
        {"id": "P_I", "type": "point", "label": "I"},
        {"id": "P_J", "type": "point", "label": "J"},
        {"id": "S_BC", "type": "segment", "endpoints": ["P_B", "P_C"]},
        {"id": "S_DE", "type": "segment", "endpoints": ["P_D", "P_E"]},
        {"id": "S_FG", "type": "segment", "endpoints": ["P_F", "P_G"]},
        {"id": "S_FH", "type": "segment", "endpoints": ["P_F", "P_H"]},
        {"id": "S_DI", "type": "segment", "endpoints": ["P_D", "P_I"]},
        {"id": "S_IJ", "type": "segment", "endpoints": ["P_I", "P_J"]},
        # 噪音：未被引用的子線段
        {"id": "S_AB", "type": "segment", "endpoints": ["P_A", "P_B"]},
        {"id": "S_BD", "type": "segment", "endpoints": ["P_B", "P_D"]},
        {"id": "Tri_ABC", "type": "triangle", "vertices": ["P_A", "P_B", "P_C"]},
    ],
    "measurements": [
        {
            "target": "S_FH",
            "property": "length",
            "value": "12 cm",
            "source": "question_text",
        }
    ],
    "relationships": [
        {
            "type": "collinear",
            "points": ["P_A", "P_B", "P_D", "P_F"],
            "source": "question_text",
        },
        {
            "type": "collinear",
            "points": ["P_A", "P_C", "P_E", "P_G"],
            "source": "question_text",
        },
        {
            "type": "collinear",
            "points": ["P_B", "P_I", "P_H"],
            "source": "figure",
        },
        {
            "type": "collinear",
            "points": ["P_C", "P_J", "P_H"],
            "source": "figure",
        },
        {
            "type": "collinear",
            "points": ["P_D", "P_I", "P_J", "P_E"],
            "source": "figure",
        },
        {
            "type": "collinear",
            "points": ["P_F", "P_H", "P_G"],
            "source": "figure",
        },
        {
            "type": "parallel",
            "entities": ["S_BC", "S_DE", "S_FG"],
            "source": "question_text",
        },
        {
            "type": "ratio",
            "items": [
                {"ref": "S_DI", "prop": "length"},
                {"ref": "S_IJ", "prop": "length"},
            ],
            "value": {"left": 3, "right": 2},
            "source": "question_text",
        },
    ],
    "task": {
        "known_conditions": [
            "A、B、D、F 共線",
            "A、C、E、G 共線",
            "BC ∥ DE ∥ FG",
            "FH = 12 cm",
            "DI : IJ = 3 : 2",
        ],
        "goals": ["求 DI", "求 BC", "求 HG"],
    },
}


# ================================================================
# strip_prefix 測試
# ================================================================


class TestStripPrefix:
    def test_segment(self):
        assert GeometryDescriptor.strip_prefix("S_AB") == "AB"

    def test_point(self):
        assert GeometryDescriptor.strip_prefix("P_A") == "A"

    def test_triangle(self):
        assert GeometryDescriptor.strip_prefix("Tri_ABC") == "△ABC"

    def test_angle(self):
        assert GeometryDescriptor.strip_prefix("Ang_ABC") == "∠ABC"

    def test_circle(self):
        assert GeometryDescriptor.strip_prefix("Cir_O") == "⊙O"

    def test_polygon(self):
        assert GeometryDescriptor.strip_prefix("Poly_ABCD") == "ABCD"

    def test_line(self):
        assert GeometryDescriptor.strip_prefix("L_1") == "1"

    def test_ray(self):
        assert GeometryDescriptor.strip_prefix("Ray_1") == "1"

    def test_plain_label(self):
        assert GeometryDescriptor.strip_prefix("ABC") == "ABC"

    def test_empty(self):
        assert GeometryDescriptor.strip_prefix("") == ""

    def test_none(self):
        assert GeometryDescriptor.strip_prefix(None) is None


# ================================================================
# Descriptor 分類測試
# ================================================================


class TestDescriptorCategorization:
    @pytest.fixture
    def desc(self):
        return GeometryDescriptor(SAMPLE_FIGURE)

    def test_collinear_groups_count(self, desc):
        assert len(desc.collinear_groups) == 6

    def test_collinear_first_group(self, desc):
        assert desc.collinear_groups[0]["points"] == ["A", "B", "D", "F"]

    def test_collinear_strips_prefixes(self, desc):
        # 所有共線組的點都應該已經去除 P_ 前綴
        for g in desc.collinear_groups:
            for p in g["points"]:
                assert not p.startswith("P_")

    def test_parallel_multi_entity(self, desc):
        assert len(desc.parallel_groups) == 1
        assert desc.parallel_groups[0]["entities"] == ["BC", "DE", "FG"]

    def test_ratios(self, desc):
        assert len(desc.ratios) == 1
        assert "DI : IJ = 3 : 2" in desc.ratios[0]["display"]

    def test_ratio_string_value(self):
        """字串格式的比例值也應該能正常處理"""
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "ratio",
                    "items": [
                        {"ref": "S_AB", "prop": "length"},
                        {"ref": "S_CD", "prop": "length"},
                    ],
                    "value": "5:3",
                    "source": "question_text",
                }
            ],
            "measurements": [],
        }
        desc = GeometryDescriptor(fig)
        assert len(desc.ratios) == 1
        assert "AB : CD = 5:3" in desc.ratios[0]["display"]

    def test_measurements(self, desc):
        assert len(desc.measurements) == 1
        assert desc.measurements[0]["display"] == "FH = 12 cm"

    def test_known_conditions(self, desc):
        assert len(desc.known_conditions) == 5

    def test_goals(self, desc):
        assert len(desc.goals) == 3
        assert "求 DI" in desc.goals

    def test_primary_objects_include_points(self, desc):
        primary_ids = {o["id"] for o in desc.primary_objects}
        assert "P_A" in primary_ids
        assert "P_B" in primary_ids

    def test_primary_objects_include_referenced_segments(self, desc):
        primary_ids = {o["id"] for o in desc.primary_objects}
        # S_FH 有量測
        assert "S_FH" in primary_ids
        # S_BC 在平行關係中
        assert "S_BC" in primary_ids
        # S_DI 在比例關係中
        assert "S_DI" in primary_ids

    def test_secondary_objects_are_unreferenced(self, desc):
        secondary_ids = {o["id"] for o in desc.secondary_objects}
        assert "S_AB" in secondary_ids
        assert "S_BD" in secondary_ids
        assert "Tri_ABC" in secondary_ids


# ================================================================
# Readable 輸出測試
# ================================================================


class TestReadableOutput:
    @pytest.fixture
    def readable(self):
        return GeometryDescriptor(SAMPLE_FIGURE).to_readable_text()

    def test_no_engineering_tokens(self, readable):
        """輸出中不應包含 S_、P_、Tri_ 等工程前綴"""
        assert "S_" not in readable
        assert "P_" not in readable
        assert "Tri_" not in readable

    def test_collinear_present(self, readable):
        assert "A、B、D、F 共線" in readable

    def test_parallel_complete_with_three_entities(self, readable):
        """三實體平行鏈完整顯示"""
        assert "BC ∥ DE ∥ FG" in readable

    def test_measurement_clean(self, readable):
        assert "FH = 12 cm" in readable

    def test_ratio_present(self, readable):
        assert "DI : IJ = 3 : 2" in readable

    def test_goals_present(self, readable):
        assert "求：" in readable

    def test_known_conditions_present(self, readable):
        assert "已知：" in readable

    def test_parallel_before_collinear(self, readable):
        """解題優先：平行應出現在共線之前"""
        par_pos = readable.find("∥")
        col_pos = readable.find("共線")
        assert par_pos < col_pos

    def test_no_points_section_when_collinear_exists(self, readable):
        """有共線組時不應單獨列出「點：」區"""
        assert "點：" not in readable

    def test_points_shown_when_no_collinear(self):
        """沒有共線時應列出點"""
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "P_A", "type": "point", "label": "A"},
                {"id": "P_B", "type": "point", "label": "B"},
            ],
            "measurements": [],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert "點：A、B" in readable


# ================================================================
# 推斷標記測試
# ================================================================


class TestInferredMarking:
    def test_inferred_parallel_marked(self):
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "parallel",
                    "entities": ["S_AB", "S_CD"],
                    "source": "inferred",
                }
            ],
            "measurements": [],
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert "（推斷）" in readable

    def test_inferred_tracked_in_list(self):
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "similar",
                    "entities": ["S_AB", "S_CD"],
                    "source": "inferred",
                }
            ],
            "measurements": [],
        }
        desc = GeometryDescriptor(fig)
        assert len(desc.inferred_items) == 1

    def test_non_inferred_not_marked(self):
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "parallel",
                    "entities": ["S_AB", "S_CD"],
                    "source": "question_text",
                }
            ],
            "measurements": [],
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert "（推斷）" not in readable


# ================================================================
# Relationship 格式化測試
# ================================================================


class TestRelationshipFormatting:
    @pytest.fixture
    def desc(self):
        return GeometryDescriptor({"has_figure": True, "objects": [], "measurements": [], "relationships": []})

    def test_parallel_multi_entity(self, desc):
        rel = {"type": "parallel", "entities": ["S_BC", "S_DE", "S_FG"], "source": "question_text"}
        result = desc.describe_relationship(rel)
        assert result == "BC ∥ DE ∥ FG"

    def test_parallel_two_entity(self, desc):
        rel = {"type": "parallel", "entities": ["S_AB", "S_CD"], "source": "figure"}
        result = desc.describe_relationship(rel)
        assert result == "AB ∥ CD"

    def test_collinear(self, desc):
        rel = {"type": "collinear", "points": ["P_A", "P_B", "P_C"], "source": "figure"}
        result = desc.describe_relationship(rel)
        assert result == "A、B、C 共線"

    def test_midpoint(self, desc):
        rel = {"type": "midpoint", "subject": "P_O", "of": "S_AB", "source": "question_text"}
        result = desc.describe_relationship(rel)
        assert result == "O 是 AB 中點"

    def test_ratio_structured_value(self, desc):
        rel = {
            "type": "ratio",
            "items": [{"ref": "S_DI", "prop": "length"}, {"ref": "S_IJ", "prop": "length"}],
            "value": {"left": 3, "right": 2},
            "source": "question_text",
        }
        result = desc.describe_relationship(rel)
        assert result == "DI : IJ = 3 : 2"

    def test_ratio_string_value(self, desc):
        rel = {
            "type": "ratio",
            "items": [{"ref": "S_AB", "prop": "length"}, {"ref": "S_CD", "prop": "length"}],
            "value": "5:3",
            "source": "question_text",
        }
        result = desc.describe_relationship(rel)
        assert result == "AB : CD = 5:3"

    def test_equal(self, desc):
        rel = {
            "type": "equal",
            "items": [{"ref": "S_AB", "prop": "length"}, {"ref": "S_CD", "prop": "length"}],
            "source": "question_text",
        }
        result = desc.describe_relationship(rel)
        assert result == "AB = CD"

    def test_tangent(self, desc):
        rel = {"type": "tangent", "entities": ["L_1", "Cir_O"], "at": "P_T", "source": "figure"}
        result = desc.describe_relationship(rel)
        assert result == "1 切 ⊙O，切點 T"

    def test_inferred_suffix(self, desc):
        rel = {"type": "parallel", "entities": ["S_AB", "S_CD"], "source": "inferred"}
        result = desc.describe_relationship(rel)
        assert result.endswith("（推斷）")


# ================================================================
# Display dict 測試
# ================================================================


class TestDisplayDict:
    def test_display_dict_structure(self):
        desc = GeometryDescriptor(SAMPLE_FIGURE)
        d = desc.to_display_dict()
        assert "collinear" in d
        assert "parallel" in d
        assert "measurements" in d
        assert "ratios" in d
        assert "known_conditions" in d
        assert "goals" in d
        assert "primary_objects" in d
        assert "secondary_objects" in d

    def test_display_dict_collinear_count(self):
        desc = GeometryDescriptor(SAMPLE_FIGURE)
        d = desc.to_display_dict()
        assert len(d["collinear"]) == 6

    def test_display_dict_labels_stripped(self):
        desc = GeometryDescriptor(SAMPLE_FIGURE)
        d = desc.to_display_dict()
        for obj in d["primary_objects"]:
            assert not obj["label"].startswith("P_")
            assert not obj["label"].startswith("S_")


# ================================================================
# Measurement 格式化測試
# ================================================================


class TestMeasurementFormatting:
    def test_length_measurement(self):
        fig = {
            "has_figure": True,
            "objects": [{"id": "S_AB", "type": "segment"}],
            "measurements": [{"target": "S_AB", "property": "length", "value": "5cm", "source": "figure"}],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        assert desc.measurements[0]["display"] == "AB = 5cm"

    def test_angle_measurement(self):
        fig = {
            "has_figure": True,
            "objects": [{"id": "Ang_ACB", "type": "angle"}],
            "measurements": [{"target": "Ang_ACB", "property": "degrees", "value": 90, "source": "figure"}],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        assert desc.measurements[0]["display"] == "∠∠ACB = 90°"

    def test_angle_with_degree_symbol(self):
        fig = {
            "has_figure": True,
            "objects": [{"id": "Ang_ACB", "type": "angle"}],
            "measurements": [{"target": "Ang_ACB", "property": "degrees", "value": "90°", "source": "figure"}],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        assert desc.measurements[0]["display"] == "∠∠ACB = 90°"


# ================================================================
# Validator 測試
# ================================================================


class TestValidatorWithRatio:
    def test_ratio_accepted(self):
        from app.domains.vision.service import VisionService

        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_DI", "type": "segment"},
                {"id": "S_IJ", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "ratio",
                    "items": [
                        {"ref": "S_DI", "prop": "length"},
                        {"ref": "S_IJ", "prop": "length"},
                    ],
                    "value": {"left": 3, "right": 2},
                    "source": "question_text",
                }
            ],
        }
        warnings = VisionService.validate_figure_schema(fig, version=2)
        assert not any("不在已知類型中" in w for w in warnings)

    def test_unknown_type_warned(self):
        from app.domains.vision.service import VisionService

        fig = {
            "has_figure": True,
            "objects": [{"id": "S_AB", "type": "segment"}],
            "relationships": [
                {
                    "type": "unknown_relation",
                    "entities": ["S_AB"],
                    "source": "figure",
                }
            ],
        }
        warnings = VisionService.validate_figure_schema(fig, version=2)
        assert any("不在已知類型中" in w for w in warnings)

    def test_parallel_with_point_warned(self):
        from app.domains.vision.service import VisionService

        fig = {
            "has_figure": True,
            "objects": [
                {"id": "P_A", "type": "point"},
                {"id": "P_B", "type": "point"},
            ],
            "relationships": [
                {
                    "type": "parallel",
                    "entities": ["P_A", "P_B"],
                    "source": "figure",
                }
            ],
        }
        warnings = VisionService.validate_figure_schema(fig, version=2)
        assert any("應引用線段/直線" in w for w in warnings)

    def test_collinear_with_segment_warned(self):
        from app.domains.vision.service import VisionService

        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
            ],
            "relationships": [
                {
                    "type": "collinear",
                    "points": ["S_AB", "S_CD"],
                    "source": "figure",
                }
            ],
        }
        warnings = VisionService.validate_figure_schema(fig, version=2)
        assert any("應為點" in w for w in warnings)


# ================================================================
# 邊界情況測試
# ================================================================


class TestEdgeCases:
    def test_empty_figure(self):
        fig = {"has_figure": True, "objects": [], "measurements": [], "relationships": []}
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert readable == "含幾何圖形"

    def test_overall_description_fallback(self):
        fig = {
            "has_figure": True,
            "objects": [],
            "measurements": [],
            "relationships": [],
            "overall_description": "A triangle with vertices at A, B, C",
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert readable == "A triangle with vertices at A, B, C"

    def test_no_has_figure(self):
        fig = {"has_figure": False}
        desc = GeometryDescriptor(fig)
        assert len(desc.objects) == 0
        assert desc.to_readable_text() == "含幾何圖形"

    def test_perpendicular_with_at(self):
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_AB", "type": "segment"},
                {"id": "S_CD", "type": "segment"},
                {"id": "P_E", "type": "point"},
            ],
            "measurements": [],
            "relationships": [
                {
                    "type": "perpendicular",
                    "entities": ["S_AB", "S_CD"],
                    "at": "P_E",
                    "source": "figure",
                }
            ],
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        assert "AB ⊥ CD" in readable
        assert "交於 E" in readable


class TestCleanLatex:
    """LaTeX 清洗測試"""

    def test_parallel_symbol(self):
        assert GeometryDescriptor.clean_latex("BC \\parallel DE") == "BC ∥ DE"

    def test_perp_symbol(self):
        assert GeometryDescriptor.clean_latex("AB \\perp CD") == "AB ⊥ CD"

    def test_text_command(self):
        assert GeometryDescriptor.clean_latex("FH = 12 \\text{ cm}") == "FH = 12  cm"

    def test_angle_symbol(self):
        assert GeometryDescriptor.clean_latex("\\angle ABC = 90°") == "∠ ABC = 90°"

    def test_dollar_signs(self):
        assert GeometryDescriptor.clean_latex("$x + y$") == "x + y"

    def test_empty(self):
        assert GeometryDescriptor.clean_latex("") == ""

    def test_no_latex(self):
        assert GeometryDescriptor.clean_latex("AB = 5 cm") == "AB = 5 cm"


class TestInferredMeasurementSeparation:
    """推斷量測分離測試"""

    def test_inferred_measurements_after_facts(self):
        """推斷量測應出現在非推斷量測之後，且標記（推斷）"""
        fig = {
            "has_figure": True,
            "objects": [
                {"id": "S_FH", "type": "segment"},
                {"id": "S_DI", "type": "segment"},
            ],
            "measurements": [
                {"target": "S_FH", "property": "length", "value": "12 cm", "source": "question_text"},
                {"target": "S_DI", "property": "length", "value": "3k", "source": "inferred"},
            ],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        readable = desc.to_readable_text()
        # 非推斷量測不帶（推斷）
        assert "FH = 12 cm" in readable
        # 推斷量測帶（推斷）
        assert "DI = 3k（推斷）" in readable
        # 非推斷在前，推斷在後
        fact_pos = readable.find("FH = 12 cm")
        inferred_pos = readable.find("DI = 3k（推斷）")
        assert fact_pos < inferred_pos

    def test_display_dict_inferred_flag(self):
        """to_display_dict 應包含 inferred 標記"""
        fig = {
            "has_figure": True,
            "objects": [{"id": "S_AB", "type": "segment"}],
            "measurements": [
                {"target": "S_AB", "property": "length", "value": "5cm", "source": "inferred"},
            ],
            "relationships": [],
        }
        desc = GeometryDescriptor(fig)
        d = desc.to_display_dict()
        assert d["measurements"][0]["inferred"] is True


class TestTaskLatexCleaning:
    """Task 層 LaTeX 清洗測試"""

    def test_known_conditions_cleaned(self):
        fig = {
            "has_figure": True,
            "objects": [],
            "measurements": [],
            "relationships": [],
            "task": {
                "known_conditions": ["BC \\parallel DE \\parallel FG", "FH = 12 \\text{ cm}"],
                "goals": ["求 $DI$"],
            },
        }
        desc = GeometryDescriptor(fig)
        assert desc.known_conditions[0] == "BC ∥ DE ∥ FG"
        assert "\\text" not in desc.known_conditions[1]
        assert "$" not in desc.goals[0]
