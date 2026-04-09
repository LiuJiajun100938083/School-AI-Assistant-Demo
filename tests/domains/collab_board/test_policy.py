"""
Policy 權限判定單元測試
========================
純函式測試 — 用 dict 模擬 board / section / post / user，零 DB。

覆蓋矩陣:
  visibility × user_role × ownership × group membership × moderation
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.collab_board import policy
from app.domains.collab_board.exceptions import BoardAccessDeniedError


# ============================================================
# Test helpers
# ============================================================

def make_board(
    *,
    owner_id=1,
    visibility="class",
    class_name="2A",
    moderation=False,
    is_archived=False,
    section_edit_open=False,
):
    return {
        "id": 100,
        "uuid": "b-uuid",
        "owner_id": owner_id,
        "visibility": visibility,
        "class_name": class_name,
        "moderation": moderation,
        "is_archived": is_archived,
        "section_edit_open": section_edit_open,
    }


def make_user(*, id=2, role="student", class_name="2A"):
    return {"id": id, "role": role, "class_name": class_name}


def make_section(*, id=10, kind="column", group_members=None):
    return {"id": id, "kind": kind, "group_members": group_members or []}


def make_post(*, id=50, author_id=2, status="approved"):
    return {"id": id, "author_id": author_id, "status": status}


# ============================================================
# can_view — 誰能看見這個板
# ============================================================

class TestCanView:

    # -------- private --------
    def test_private_owner_yes(self):
        board = make_board(owner_id=1, visibility="private")
        assert policy.can_view(board, make_user(id=1, role="teacher")) is True

    def test_private_other_student_no(self):
        board = make_board(owner_id=1, visibility="private")
        assert policy.can_view(board, make_user(id=9, role="student")) is False

    def test_private_other_teacher_no(self):
        board = make_board(owner_id=1, visibility="private")
        assert policy.can_view(board, make_user(id=9, role="teacher")) is False

    def test_private_admin_yes(self):
        # admin 可看一切
        board = make_board(owner_id=1, visibility="private")
        assert policy.can_view(board, make_user(id=9, role="admin")) is True

    # -------- class --------
    def test_class_same_class_student_yes(self):
        board = make_board(visibility="class", class_name="2A")
        assert policy.can_view(board, make_user(class_name="2A")) is True

    def test_class_different_class_student_no(self):
        board = make_board(visibility="class", class_name="2A")
        assert policy.can_view(board, make_user(class_name="2B")) is False

    def test_class_any_teacher_yes(self):
        board = make_board(visibility="class", class_name="2A")
        assert policy.can_view(board, make_user(role="teacher", class_name="")) is True

    # -------- public --------
    def test_public_anyone_yes(self):
        board = make_board(visibility="public")
        assert policy.can_view(board, make_user(class_name="9Z")) is True

    # -------- archived --------
    def test_archived_owner_yes(self):
        board = make_board(owner_id=1, visibility="class", is_archived=True)
        assert policy.can_view(board, make_user(id=1, role="teacher")) is True

    def test_archived_student_no(self):
        # 歸檔後學生看不到
        board = make_board(visibility="class", is_archived=True)
        assert policy.can_view(board, make_user(role="student")) is False


# ============================================================
# can_post — 誰能在這個 section 發貼文
# ============================================================

class TestCanPost:
    def test_viewer_must_exist(self):
        # 無法查看就無法發
        board = make_board(visibility="private", owner_id=1)
        assert policy.can_post(board, None, make_user(id=9, role="student")) is False

    def test_class_student_column_yes(self):
        board = make_board(visibility="class", class_name="2A")
        assert policy.can_post(board, make_section(kind="column"), make_user(class_name="2A")) is True

    def test_class_student_different_class_no(self):
        board = make_board(visibility="class", class_name="2A")
        assert policy.can_post(board, make_section(kind="column"), make_user(class_name="2B")) is False

    def test_group_section_member_yes(self):
        board = make_board(visibility="class", class_name="2A")
        sec = make_section(kind="group", group_members=[2, 3])
        assert policy.can_post(board, sec, make_user(id=2, class_name="2A")) is True

    def test_group_section_non_member_student_no(self):
        board = make_board(visibility="class", class_name="2A")
        sec = make_section(kind="group", group_members=[2, 3])
        assert policy.can_post(board, sec, make_user(id=99, class_name="2A")) is False

    def test_group_section_teacher_bypass(self):
        # 老師可貼到任何 group
        board = make_board(visibility="class", class_name="2A")
        sec = make_section(kind="group", group_members=[2, 3])
        assert policy.can_post(board, sec, make_user(id=999, role="teacher")) is True

    def test_archived_board_no_post(self):
        board = make_board(visibility="class", class_name="2A", is_archived=True)
        assert policy.can_post(board, make_section(), make_user(class_name="2A")) is False


# ============================================================
# can_moderate — 誰能審核/刪除他人內容
# ============================================================

class TestCanModerate:
    def test_owner_yes(self):
        board = make_board(owner_id=5)
        assert policy.can_moderate(board, make_user(id=5, role="teacher")) is True

    def test_teacher_yes(self):
        board = make_board(owner_id=1)
        assert policy.can_moderate(board, make_user(id=9, role="teacher")) is True

    def test_admin_yes(self):
        board = make_board(owner_id=1)
        assert policy.can_moderate(board, make_user(id=9, role="admin")) is True

    def test_student_no(self):
        board = make_board(owner_id=1)
        assert policy.can_moderate(board, make_user(id=2, role="student")) is False


# ============================================================
# can_edit_post — 編輯自己的帖 / 教師可編輯任何
# ============================================================

class TestCanEditPost:
    def test_author_yes(self):
        post = make_post(author_id=2)
        board = make_board()
        assert policy.can_edit_post(board, post, make_user(id=2, role="student")) is True

    def test_other_student_no(self):
        post = make_post(author_id=2)
        board = make_board()
        assert policy.can_edit_post(board, post, make_user(id=3, role="student")) is False

    def test_teacher_yes(self):
        post = make_post(author_id=2)
        board = make_board()
        assert policy.can_edit_post(board, post, make_user(id=9, role="teacher")) is True


# ============================================================
# can_delete_comment — 作者 or moderator
# ============================================================

class TestCanDeleteComment:
    def test_comment_author_yes(self):
        board = make_board()
        comment = {"id": 1, "author_id": 2}
        assert policy.can_delete_comment(board, comment, make_user(id=2, role="student")) is True

    def test_other_student_no(self):
        board = make_board()
        comment = {"id": 1, "author_id": 2}
        assert policy.can_delete_comment(board, comment, make_user(id=3, role="student")) is False

    def test_teacher_yes(self):
        board = make_board()
        comment = {"id": 1, "author_id": 2}
        assert policy.can_delete_comment(board, comment, make_user(id=9, role="teacher")) is True


# ============================================================
# can_manage_sections — 誰能 CRUD section 標題
# ============================================================

class TestCanManageSections:
    def test_owner_always(self):
        # 板主(role=teacher) 永遠可以
        board = make_board(owner_id=1)
        assert policy.can_manage_sections(board, make_user(id=1, role="teacher")) is True

    def test_teacher_not_owner_always(self):
        # 非板主但是 teacher 也可以
        board = make_board(owner_id=99)
        assert policy.can_manage_sections(board, make_user(id=1, role="teacher")) is True

    def test_admin_always(self):
        board = make_board(owner_id=99)
        assert policy.can_manage_sections(board, make_user(id=1, role="admin")) is True

    def test_student_closed_denied(self):
        # 預設 section_edit_open=False → 學生拒絕
        board = make_board(owner_id=1, visibility="class", class_name="2A")
        assert policy.can_manage_sections(
            board, make_user(id=2, role="student", class_name="2A")
        ) is False

    def test_student_opened_and_can_view_allowed(self):
        # 開啟開關 + 同班 → 允許
        board = make_board(
            owner_id=1, visibility="class", class_name="2A", section_edit_open=True
        )
        assert policy.can_manage_sections(
            board, make_user(id=2, role="student", class_name="2A")
        ) is True

    def test_student_opened_but_cannot_view_denied(self):
        # 開關開了但看不到板 → 拒絕
        board = make_board(
            owner_id=1, visibility="private", section_edit_open=True
        )
        assert policy.can_manage_sections(
            board, make_user(id=9, role="student", class_name="2A")
        ) is False

    def test_student_opened_different_class_denied(self):
        # 開關開了但不同班 → 看不到 → 拒絕
        board = make_board(
            owner_id=1, visibility="class", class_name="2A", section_edit_open=True
        )
        assert policy.can_manage_sections(
            board, make_user(id=2, role="student", class_name="2B")
        ) is False

    def test_archived_denied_even_for_teacher(self):
        # 歸檔板 → 連老師都拒絕(避免學期後誤改)
        board = make_board(owner_id=1, is_archived=True, section_edit_open=True)
        assert policy.can_manage_sections(
            board, make_user(id=1, role="teacher")
        ) is False


# ============================================================
# ensure_* helpers — raise 版
# ============================================================

class TestEnsureHelpers:
    def test_ensure_can_view_raises(self):
        board = make_board(visibility="private", owner_id=1)
        with pytest.raises(BoardAccessDeniedError):
            policy.ensure_can_view(board, make_user(id=9, role="student"))

    def test_ensure_can_view_ok(self):
        board = make_board(visibility="public")
        # 不 raise
        policy.ensure_can_view(board, make_user())

    def test_ensure_can_post_raises(self):
        board = make_board(visibility="class", class_name="2A", is_archived=True)
        with pytest.raises(BoardAccessDeniedError):
            policy.ensure_can_post(board, make_section(), make_user(class_name="2A"))

    def test_ensure_can_moderate_raises(self):
        board = make_board()
        with pytest.raises(BoardAccessDeniedError):
            policy.ensure_can_moderate(board, make_user(role="student"))

    def test_ensure_can_manage_sections_raises(self):
        # 預設關閉 → 學生拋
        board = make_board(owner_id=1, visibility="class", class_name="2A")
        with pytest.raises(BoardAccessDeniedError):
            policy.ensure_can_manage_sections(
                board, make_user(id=2, role="student", class_name="2A")
            )

    def test_ensure_can_manage_sections_ok_for_teacher(self):
        board = make_board(owner_id=1)
        # 不 raise
        policy.ensure_can_manage_sections(board, make_user(id=1, role="teacher"))


# ============================================================
# Schema validation — layout ENUM 接受 stream
# ============================================================

class TestLayoutSchema:
    def test_stream_layout_accepted(self):
        from app.domains.collab_board.schemas import BoardCreate
        b = BoardCreate(title="T", layout="stream")
        assert b.layout == "stream"

    def test_known_layouts_accepted(self):
        from app.domains.collab_board.schemas import BoardCreate
        for lay in ("grid", "shelf", "canvas", "stream"):
            assert BoardCreate(title="T", layout=lay).layout == lay

    def test_unknown_layout_rejected(self):
        from pydantic import ValidationError
        from app.domains.collab_board.schemas import BoardCreate
        with pytest.raises(ValidationError):
            BoardCreate(title="T", layout="timeline")  # 故意錯

    def test_section_edit_open_default_false(self):
        from app.domains.collab_board.schemas import BoardCreate
        b = BoardCreate(title="T")
        assert b.section_edit_open is False

    def test_section_edit_open_can_be_true(self):
        from app.domains.collab_board.schemas import BoardCreate
        b = BoardCreate(title="T", section_edit_open=True)
        assert b.section_edit_open is True
