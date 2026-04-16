"""mention_parser 純函式測試"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest
from app.domains.collab_board.mention_parser import extract_mentions


class TestExtractMentions:
    def test_empty(self):
        assert extract_mentions("") == []
        assert extract_mentions(None) == []

    def test_single(self):
        assert extract_mentions("hi @alice") == ["alice"]

    def test_multiple_dedup(self):
        assert extract_mentions("@alice @bob @alice") == ["alice", "bob"]

    def test_chinese(self):
        assert extract_mentions("你好 @王小明 再見") == ["王小明"]

    def test_start_of_string(self):
        assert extract_mentions("@alice hello") == ["alice"]

    def test_email_not_mention(self):
        # foo@bar.com 的 @ 前是字母,不該被當 mention
        assert extract_mentions("email foo@bar.com ok") == []

    def test_underscore_dash(self):
        assert extract_mentions("@foo_bar @baz-qux") == ["foo_bar", "baz-qux"]
