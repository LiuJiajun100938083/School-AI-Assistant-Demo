"""
LinkMeta 單元測試
==================
測試 `parse_og_meta(html, url)` 純函式 — 零網路。
HttpLinkMetaProvider 本身 IO，用 monkeypatch 隔離。
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.collab_board.link_meta import (
    parse_og_meta,
    HttpLinkMetaProvider,
    LinkMeta,
)


# ============================================================
# parse_og_meta — 純函式
# ============================================================

class TestParseOgMeta:
    def test_full_og_tags(self):
        html = """
        <html><head>
          <meta property="og:title" content="Hello World">
          <meta property="og:description" content="一段描述">
          <meta property="og:image" content="https://x.com/img.png">
          <meta property="og:site_name" content="X Site">
        </head></html>
        """
        meta = parse_og_meta(html, "https://x.com/page")
        assert meta.title == "Hello World"
        assert meta.description == "一段描述"
        assert meta.image == "https://x.com/img.png"
        assert meta.site_name == "X Site"
        assert meta.url == "https://x.com/page"

    def test_fallback_to_title_tag(self):
        html = "<html><head><title>Fallback Title</title></head></html>"
        meta = parse_og_meta(html, "https://x.com")
        assert meta.title == "Fallback Title"
        assert meta.description is None

    def test_fallback_to_meta_description(self):
        html = """
        <html><head>
          <title>T</title>
          <meta name="description" content="普通描述">
        </head></html>
        """
        meta = parse_og_meta(html, "https://x.com")
        assert meta.title == "T"
        assert meta.description == "普通描述"

    def test_empty_html(self):
        meta = parse_og_meta("", "https://x.com/page")
        assert meta.title is None
        assert meta.description is None
        assert meta.image is None
        assert meta.url == "https://x.com/page"

    def test_relative_image_resolved(self):
        html = '<meta property="og:image" content="/img.png">'
        meta = parse_og_meta(html, "https://x.com/page")
        assert meta.image == "https://x.com/img.png"

    def test_og_title_prefered_over_title_tag(self):
        html = """
        <title>Old Title</title>
        <meta property="og:title" content="OG Title">
        """
        meta = parse_og_meta(html, "https://x.com")
        assert meta.title == "OG Title"


# ============================================================
# HttpLinkMetaProvider — 注入假 fetcher
# ============================================================

class TestHttpLinkMetaProvider:
    def test_fetch_uses_fetcher(self):
        def fake_fetch(url, timeout):
            assert url == "https://a.com"
            return '<meta property="og:title" content="A">'
        provider = HttpLinkMetaProvider(fetcher=fake_fetch)
        meta = provider.fetch("https://a.com")
        assert meta.title == "A"
        assert meta.url == "https://a.com"

    def test_fetch_failure_returns_minimal(self):
        def fake_fetch(url, timeout):
            raise ConnectionError("boom")
        provider = HttpLinkMetaProvider(fetcher=fake_fetch)
        meta = provider.fetch("https://x.com")
        # 失敗時仍返回 LinkMeta，只有 url 有值，不 raise
        assert meta.url == "https://x.com"
        assert meta.title is None
        assert meta.description is None

    def test_to_dict_roundtrip(self):
        meta = LinkMeta(
            url="https://x.com",
            title="T",
            description="D",
            image="https://x.com/img.png",
            site_name="S",
        )
        d = meta.to_dict()
        assert d == {
            "url": "https://x.com",
            "title": "T",
            "description": "D",
            "image": "https://x.com/img.png",
            "site_name": "S",
        }
