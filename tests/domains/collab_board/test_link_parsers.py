"""link_parsers 純函式測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest
from app.domains.collab_board.link_parsers import classify_url


class TestYouTube:
    @pytest.mark.parametrize("url", [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    ])
    def test_youtube_urls(self, url):
        m = classify_url(url)
        assert m.kind == "youtube"
        assert m.embed_url == "https://www.youtube.com/embed/dQw4w9WgXcQ"
        assert m.thumbnail.endswith("/hqdefault.jpg")
        assert m.provider == "youtube"

    def test_invalid_v_param(self):
        m = classify_url("https://www.youtube.com/watch?v=short")
        assert m.kind == "link"


class TestVimeo:
    def test_vimeo_simple(self):
        m = classify_url("https://vimeo.com/123456789")
        assert m.kind == "vimeo"
        assert m.embed_url == "https://player.vimeo.com/video/123456789"
        assert m.provider == "vimeo"

    def test_vimeo_sub_path(self):
        m = classify_url("https://vimeo.com/channels/staffpicks/987654321")
        assert m.kind == "vimeo"
        assert "987654321" in m.embed_url


class TestGeneric:
    def test_generic_link(self):
        m = classify_url("https://example.com/article/1")
        assert m.kind == "link"
        assert m.embed_url == ""

    def test_empty(self):
        m = classify_url("")
        assert m.kind == "link"
