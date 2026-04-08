"""
PostStatus 狀態機單元測試
=========================
純函式測試 — 零依賴、零 fixture。
測試兩個公開函式：
- initial_status(moderation, user_role) → PostStatus
- transition(current, event) → PostStatus；非法轉換 raise PostStateError
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.collab_board.post_state import (
    PostStatus,
    initial_status,
    transition,
)
from app.domains.collab_board.exceptions import PostStateError


# ============================================================
# initial_status — 建帖時決定初始狀態
# ============================================================

class TestInitialStatus:
    def test_no_moderation_student_approved(self):
        assert initial_status(moderation=False, user_role="student") == PostStatus.APPROVED

    def test_no_moderation_teacher_approved(self):
        assert initial_status(moderation=False, user_role="teacher") == PostStatus.APPROVED

    def test_no_moderation_admin_approved(self):
        assert initial_status(moderation=False, user_role="admin") == PostStatus.APPROVED

    def test_moderation_student_pending(self):
        assert initial_status(moderation=True, user_role="student") == PostStatus.PENDING

    def test_moderation_teacher_still_approved(self):
        # 老師自己發文不受審核限制
        assert initial_status(moderation=True, user_role="teacher") == PostStatus.APPROVED

    def test_moderation_admin_still_approved(self):
        assert initial_status(moderation=True, user_role="admin") == PostStatus.APPROVED


# ============================================================
# transition — 事件驅動狀態轉換
# ============================================================

class TestTransitionLegal:
    def test_pending_approve(self):
        assert transition(PostStatus.PENDING, "approve") == PostStatus.APPROVED

    def test_pending_reject(self):
        assert transition(PostStatus.PENDING, "reject") == PostStatus.REJECTED

    def test_approved_archive(self):
        assert transition(PostStatus.APPROVED, "archive") == PostStatus.ARCHIVED

    def test_rejected_resubmit(self):
        assert transition(PostStatus.REJECTED, "resubmit") == PostStatus.PENDING

    def test_draft_submit(self):
        # draft → pending（等待審核）
        assert transition(PostStatus.DRAFT, "submit") == PostStatus.PENDING


class TestTransitionIllegal:
    @pytest.mark.parametrize("current,event", [
        (PostStatus.APPROVED, "approve"),    # 已通過不能再通過
        (PostStatus.APPROVED, "reject"),     # 已通過不能拒絕
        (PostStatus.REJECTED, "approve"),    # 已拒絕不能直接通過
        (PostStatus.REJECTED, "archive"),    # 已拒絕不能歸檔
        (PostStatus.ARCHIVED, "approve"),    # 已歸檔終態
        (PostStatus.ARCHIVED, "reject"),
        (PostStatus.ARCHIVED, "archive"),
        (PostStatus.PENDING, "archive"),     # 待審不能歸檔
        (PostStatus.DRAFT, "approve"),       # 草稿不能直接通過
    ])
    def test_illegal_transition_raises(self, current, event):
        with pytest.raises(PostStateError):
            transition(current, event)

    def test_unknown_event_raises(self):
        with pytest.raises(PostStateError):
            transition(PostStatus.PENDING, "nuke")


# ============================================================
# PostStatus 枚舉值穩定性（序列化到 DB 用）
# ============================================================

class TestPostStatusEnumValues:
    def test_values_match_db_enum(self):
        assert PostStatus.DRAFT.value == "draft"
        assert PostStatus.PENDING.value == "pending"
        assert PostStatus.APPROVED.value == "approved"
        assert PostStatus.REJECTED.value == "rejected"
        assert PostStatus.ARCHIVED.value == "archived"
