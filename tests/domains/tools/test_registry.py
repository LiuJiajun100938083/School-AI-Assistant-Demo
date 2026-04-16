"""registry 完整性測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.tools.registry import TOOLS, get_tool
from app.domains.tools.base import ToolSpec


class TestRegistry:
    def test_not_empty(self):
        assert len(TOOLS) >= 3

    def test_all_ids_unique(self):
        ids = [t.id for t in TOOLS]
        assert len(ids) == len(set(ids))

    def test_all_required_fields(self):
        for t in TOOLS:
            assert isinstance(t, ToolSpec)
            assert t.id.startswith("tool_")
            assert t.name_zh and t.name_en
            assert t.description_zh and t.description_en
            assert t.page_url.startswith("/tools/")
            assert isinstance(t.needs_backend, bool)

    def test_get_tool_found(self):
        t = get_tool("tool_qrcode")
        assert t.id == "tool_qrcode"

    def test_get_tool_not_found(self):
        with pytest.raises(KeyError):
            get_tool("tool_nonexistent")

    def test_to_module_entry(self):
        t = TOOLS[0]
        entry = t.to_module_entry(order=17)
        assert entry["id"] == t.id
        assert entry["category"] == "utilities"
        assert entry["order"] == 17
        assert entry["url"] == t.page_url
        assert entry["enabled"] is True
        assert "student" in entry["roles"]
