"""sort_filter 純函式測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest
from app.domains.collab_board.sort_filter import (
    SORT_LATEST, SORT_MOST_LIKED, SORT_AUTHOR,
    apply_view, sort_posts, search_posts, filter_by_tags,
)


def _p(id, **kw):
    base = {"id": id, "title": "", "body": "", "author_name": "", "like_count": 0, "tags": [], "order_index": 0, "pinned": False}
    base.update(kw)
    return base


class TestSort:
    def test_pinned_first(self):
        posts = [_p(1), _p(2, pinned=True), _p(3)]
        out = sort_posts(posts)
        assert out[0]["id"] == 2

    def test_most_liked(self):
        posts = [_p(1, like_count=1), _p(2, like_count=10), _p(3, like_count=5)]
        out = sort_posts(posts, SORT_MOST_LIKED)
        assert [p["id"] for p in out] == [2, 3, 1]

    def test_author_alpha(self):
        posts = [_p(1, author_name="Charlie"), _p(2, author_name="alice"), _p(3, author_name="bob")]
        out = sort_posts(posts, SORT_AUTHOR)
        assert [p["id"] for p in out] == [2, 3, 1]


class TestSearch:
    def test_match_title(self):
        posts = [_p(1, title="Hello World"), _p(2, title="Foo")]
        assert [p["id"] for p in search_posts(posts, "hello")] == [1]

    def test_match_body(self):
        posts = [_p(1, body="contains secret"), _p(2, body="nothing")]
        assert [p["id"] for p in search_posts(posts, "SECRET")] == [1]

    def test_empty_query_all(self):
        posts = [_p(1), _p(2)]
        assert len(search_posts(posts, "")) == 2


class TestTagFilter:
    def test_any_match(self):
        posts = [_p(1, tags=["math"]), _p(2, tags=["art", "science"]), _p(3, tags=[])]
        assert [p["id"] for p in filter_by_tags(posts, ["science"])] == [2]

    def test_case_insensitive(self):
        posts = [_p(1, tags=["Math"])]
        assert len(filter_by_tags(posts, ["math"])) == 1

    def test_empty_tags_all(self):
        posts = [_p(1), _p(2)]
        assert len(filter_by_tags(posts, None)) == 2


class TestApplyView:
    def test_combined(self):
        posts = [
            _p(1, title="math homework", tags=["math"], like_count=5),
            _p(2, title="art project", tags=["art"], like_count=10),
            _p(3, title="math quiz", tags=["math"], like_count=1, pinned=True),
        ]
        out = apply_view(posts, sort=SORT_MOST_LIKED, query="math", tags=["math"])
        # pinned first (id=3) → then by likes desc (id=1)
        assert [p["id"] for p in out] == [3, 1]
