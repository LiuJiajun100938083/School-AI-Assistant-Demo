"""
CollabBoardService 整合測試
=============================
使用 in-memory fake repo + fake broadcaster + fake link_meta 隔離 IO。
"""

import sys
import os
import uuid as uuid_lib

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))

import pytest

from app.domains.collab_board.exceptions import (
    BoardAccessDeniedError,
    BoardNotFoundError,
)
from app.domains.collab_board.link_meta import LinkMeta
from app.domains.collab_board.schemas import (
    BoardCreate,
    CommentCreate,
    PostCreate,
    SectionCreate,
)
from app.domains.collab_board.service import CollabBoardService


# ============================================================
# Fakes
# ============================================================

class FakeRepo:
    def __init__(self):
        self.boards = {}
        self.board_id = 0
        self.sections = {}
        self.sid = 0
        self.posts = {}
        self.pid = 0
        self.reactions = set()  # (post_id, user_id, kind)
        self.comments = {}
        self.cid = 0

    # ---- Board ----
    def init_table(self): pass

    def create_board(self, data):
        self.board_id += 1
        row = dict(data)
        row["id"] = self.board_id
        row.setdefault("is_archived", False)
        self.boards[data["uuid"]] = row
        return self.board_id

    def get_board_by_uuid(self, u):
        return self.boards.get(u)

    def get_board_by_id(self, id):
        for b in self.boards.values():
            if b["id"] == id:
                return b
        return None

    def list_boards_for_user(self, user_id, user_role, user_class, include_archived=False):
        out = []
        for b in self.boards.values():
            if not include_archived and b.get("is_archived"):
                continue
            if user_role in ("teacher", "admin"):
                out.append(b)
                continue
            if b["visibility"] == "public":
                out.append(b)
            elif b["visibility"] == "class" and b.get("class_name") == user_class:
                out.append(b)
            elif b["visibility"] == "private" and b.get("owner_id") == user_id:
                out.append(b)
        return out

    def update_board(self, id, updates):
        b = self.get_board_by_id(id)
        if b:
            b.update(updates)
        return 1

    def archive_board(self, id):
        b = self.get_board_by_id(id)
        if b:
            b["is_archived"] = True
        return 1

    # ---- Section ----
    def create_section(self, board_id, data):
        self.sid += 1
        row = {"id": self.sid, "board_id": board_id, **data}
        row["group_members"] = row.get("group_members") or []
        self.sections[self.sid] = row
        return self.sid

    def get_section(self, sid):
        return self.sections.get(sid)

    def list_sections(self, board_id):
        return [s for s in self.sections.values() if s["board_id"] == board_id]

    def update_section(self, sid, updates):
        s = self.sections.get(sid)
        if s:
            s.update(updates)
        return 1

    def delete_section(self, sid):
        return self.sections.pop(sid, None) and 1

    # ---- Post ----
    def create_post(self, data):
        self.pid += 1
        row = dict(data)
        row["id"] = self.pid
        self.posts[self.pid] = row
        return self.pid

    def get_post(self, pid):
        return self.posts.get(pid)

    def get_post_by_uuid(self, u):
        for p in self.posts.values():
            if p.get("uuid") == u:
                return p
        return None

    def list_posts(self, board_id, include_non_approved_for_user=None, include_all_pending=False):
        out = []
        for p in self.posts.values():
            if p["board_id"] != board_id:
                continue
            if p["status"] == "approved":
                out.append(p)
            elif include_all_pending and p["status"] == "pending":
                out.append(p)
            elif include_non_approved_for_user and p["author_id"] == include_non_approved_for_user and p["status"] in ("pending", "rejected", "draft"):
                out.append(p)
        return out

    def update_post(self, pid, updates):
        p = self.posts.get(pid)
        if p:
            p.update(updates)
        return 1

    def delete_post(self, pid):
        return self.posts.pop(pid, None) and 1

    # ---- Reaction ----
    def toggle_reaction(self, pid, uid, kind="like"):
        key = (pid, uid, kind)
        if key in self.reactions:
            self.reactions.discard(key)
            return False
        self.reactions.add(key)
        return True

    def count_reactions(self, pid, kind="like"):
        return sum(1 for (p, u, k) in self.reactions if p == pid and k == kind)

    def user_reacted(self, pid, uid, kind="like"):
        return (pid, uid, kind) in self.reactions

    def reactions_for_board(self, board_id):
        out = {}
        for (pid, uid, kind) in self.reactions:
            p = self.posts.get(pid)
            if p and p["board_id"] == board_id:
                out.setdefault(pid, {"count": 0, "user_ids": []})
                out[pid]["count"] += 1
                out[pid]["user_ids"].append(uid)
        return out

    # ---- Comment ----
    def add_comment(self, pid, author_id, body, parent_id=None, mentions=None):
        self.cid += 1
        self.comments[self.cid] = {
            "id": self.cid, "post_id": pid, "author_id": author_id,
            "parent_id": parent_id, "body": body, "mentions": mentions or [],
        }
        return self.cid

    def log_activity(self, board_id, actor_id, event_type, target_id=None, meta=None):
        return 1

    def list_activity(self, board_id, limit=100):
        return []

    def delete_all_posts(self, board_id):
        before = len(self.posts)
        self.posts = {k: v for k, v in self.posts.items() if v["board_id"] != board_id}
        return before - len(self.posts)

    def list_comments(self, pid):
        return [c for c in self.comments.values() if c["post_id"] == pid]

    def get_comment(self, cid):
        return self.comments.get(cid)

    def delete_comment(self, cid):
        return self.comments.pop(cid, None) and 1

    def comments_for_board(self, board_id):
        out = {}
        for c in self.comments.values():
            p = self.posts.get(c["post_id"])
            if p and p["board_id"] == board_id:
                out.setdefault(c["post_id"], []).append(c)
        return out

    def author_names(self, ids):
        return {i: f"user{i}" for i in ids}


class FakeBroadcaster:
    def __init__(self):
        self.events = []

    async def publish(self, board_uuid, event):
        self.events.append((board_uuid, event))

    def publish_threadsafe(self, board_uuid, event):
        self.events.append((board_uuid, event))


class FakeLinkMeta:
    def fetch(self, url):
        return LinkMeta(url=url, title="Fake Title")


class FakeUploader:
    async def save(self, board_uuid, file):
        return {"url": f"/u/{board_uuid}/f", "size": 1}


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def service():
    return CollabBoardService(
        repo=FakeRepo(),
        broadcaster=FakeBroadcaster(),
        link_meta=FakeLinkMeta(),
        uploader=FakeUploader(),
    )


def _teacher(id=1, cls="2A"):
    return {"id": id, "role": "teacher", "class_name": cls, "username": "T"}


def _student(id=2, cls="2A"):
    return {"id": id, "role": "student", "class_name": cls, "username": "S"}


def _make_board(service, owner=_teacher(), **overrides):
    data = BoardCreate(title="T", description="D", layout="grid", visibility="class")
    for k, v in overrides.items():
        setattr(data, k, v)
    return service.create_board(owner, data)


# ============================================================
# Tests
# ============================================================

class TestBoardLifecycle:
    def test_teacher_can_create(self, service):
        b = _make_board(service, _teacher())
        assert b["title"] == "T"
        assert b["owner_id"] == 1

    def test_student_cannot_create(self, service):
        with pytest.raises(BoardAccessDeniedError):
            service.create_board(_student(), BoardCreate(title="X"))

    def test_list_returns_class_board_to_same_class_student(self, service):
        _make_board(service, _teacher())
        boards = service.list_boards(_student(id=5, cls="2A"))
        assert len(boards) == 1

    def test_list_hides_other_class(self, service):
        _make_board(service, _teacher())
        assert service.list_boards(_student(id=5, cls="2B")) == []

    def test_archive_removes_from_list(self, service):
        b = _make_board(service, _teacher())
        service.archive_board(_teacher(), b["uuid"])
        assert service.list_boards(_student(id=5, cls="2A")) == []

    def test_get_nonexistent_raises(self, service):
        with pytest.raises(BoardNotFoundError):
            service.get_board_detail(_teacher(), "no-such")


class TestPostCreate:
    def test_student_create_no_moderation_approved(self, service):
        b = _make_board(service, _teacher())
        post = service.create_post(_student(), b["uuid"], PostCreate(kind="text", body="hi"))
        assert post["status"] == "approved"

    def test_student_create_with_moderation_pending(self, service):
        b = _make_board(service, _teacher(), moderation=True)
        post = service.create_post(_student(), b["uuid"], PostCreate(kind="text", body="hi"))
        assert post["status"] == "pending"

    def test_teacher_create_with_moderation_still_approved(self, service):
        b = _make_board(service, _teacher(), moderation=True)
        post = service.create_post(_teacher(), b["uuid"], PostCreate(kind="text", body="hi"))
        assert post["status"] == "approved"

    def test_link_post_fetches_meta(self, service):
        b = _make_board(service, _teacher())
        post = service.create_post(
            _teacher(), b["uuid"],
            PostCreate(kind="link", link_url="https://x.com"),
        )
        assert post["link_meta"]["title"] == "Fake Title"

    def test_other_class_student_cannot_post(self, service):
        b = _make_board(service, _teacher())
        with pytest.raises(BoardAccessDeniedError):
            service.create_post(
                _student(id=9, cls="2B"), b["uuid"], PostCreate(kind="text", body="x"),
            )


class TestGroupSection:
    def test_group_member_can_post(self, service):
        b = _make_board(service, _teacher())
        sec = service.create_section(
            _teacher(), b["uuid"],
            SectionCreate(name="A", kind="group", group_members=[2]),
        )
        post = service.create_post(
            _student(id=2), b["uuid"],
            PostCreate(kind="text", body="x", section_id=sec["id"]),
        )
        assert post["section_id"] == sec["id"]

    def test_non_member_student_rejected(self, service):
        b = _make_board(service, _teacher())
        sec = service.create_section(
            _teacher(), b["uuid"],
            SectionCreate(name="A", kind="group", group_members=[99]),
        )
        with pytest.raises(BoardAccessDeniedError):
            service.create_post(
                _student(id=2), b["uuid"],
                PostCreate(kind="text", body="x", section_id=sec["id"]),
            )


class TestReactionAndComment:
    def test_reaction_toggle(self, service):
        b = _make_board(service, _teacher())
        post = service.create_post(_teacher(), b["uuid"], PostCreate(kind="text", body="hi"))
        r1 = service.toggle_reaction(_student(), b["uuid"], post["id"])
        assert r1["added"] is True and r1["count"] == 1
        r2 = service.toggle_reaction(_student(), b["uuid"], post["id"])
        assert r2["added"] is False and r2["count"] == 0

    def test_comment_author_can_delete(self, service):
        b = _make_board(service, _teacher())
        post = service.create_post(_teacher(), b["uuid"], PostCreate(kind="text", body="hi"))
        c = service.add_comment(_student(), b["uuid"], post["id"], CommentCreate(body="nice"))
        service.delete_comment(_student(), b["uuid"], post["id"], c["id"])

    def test_comment_other_student_cannot_delete(self, service):
        b = _make_board(service, _teacher())
        post = service.create_post(_teacher(), b["uuid"], PostCreate(kind="text", body="hi"))
        c = service.add_comment(_student(id=2), b["uuid"], post["id"], CommentCreate(body="x"))
        with pytest.raises(BoardAccessDeniedError):
            service.delete_comment(_student(id=3), b["uuid"], post["id"], c["id"])


class TestModeration:
    def test_teacher_approve_pending(self, service):
        b = _make_board(service, _teacher(), moderation=True)
        post = service.create_post(_student(), b["uuid"], PostCreate(kind="text", body="hi"))
        assert post["status"] == "pending"
        updated = service.transition_post_state(_teacher(), b["uuid"], post["id"], "approve")
        assert updated["status"] == "approved"

    def test_student_cannot_approve(self, service):
        b = _make_board(service, _teacher(), moderation=True)
        post = service.create_post(_student(), b["uuid"], PostCreate(kind="text", body="hi"))
        with pytest.raises(BoardAccessDeniedError):
            service.transition_post_state(_student(id=9), b["uuid"], post["id"], "approve")


# ============================================================
# TestStreamLayoutAndSectionEditOpen — 新版式 + 開放編輯開關
# ============================================================

class TestStreamLayoutAndSectionEditOpen:
    def test_stream_board_create_roundtrip(self, service):
        b = service.create_board(
            _teacher(),
            BoardCreate(title="Stream", layout="stream", visibility="class", class_name="2A"),
        )
        assert b["layout"] == "stream"
        # get_board_detail 應回傳同樣 layout
        detail = service.get_board_detail(_teacher(), b["uuid"])
        assert detail["board"]["layout"] == "stream"

    def test_get_board_detail_me_block(self, service):
        b = _make_board(service, _teacher())
        detail = service.get_board_detail(_teacher(), b["uuid"])
        # Teacher/owner: 有 me block
        assert "me" in detail
        assert detail["me"]["id"] == 1
        assert detail["me"]["role"] == "teacher"
        assert detail["me"]["can_moderate"] is True
        assert detail["me"]["can_manage_sections"] is True

    def test_get_board_detail_me_block_for_student(self, service):
        b = _make_board(service, _teacher())
        detail = service.get_board_detail(_student(), b["uuid"])
        # 同班學生:能看、能發,但預設不能管 section
        assert detail["me"]["can_moderate"] is False
        assert detail["me"]["can_manage_sections"] is False

    def test_student_cannot_create_section_by_default(self, service):
        b = _make_board(service, _teacher())
        # 預設 section_edit_open=False,學生不能建 section
        with pytest.raises(BoardAccessDeniedError):
            service.create_section(
                _student(), b["uuid"],
                SectionCreate(name="by student", kind="column"),
            )

    def test_student_can_create_section_when_edit_open(self, service):
        from app.domains.collab_board.schemas import BoardUpdate
        b = _make_board(service, _teacher())
        # 老師開啟開關
        service.update_board(
            _teacher(), b["uuid"], BoardUpdate(section_edit_open=True)
        )
        # 學生現在可建 section
        sec = service.create_section(
            _student(), b["uuid"],
            SectionCreate(name="by student", kind="column"),
        )
        assert sec["name"] == "by student"
        assert sec["kind"] == "column"

    def test_student_can_update_section_when_edit_open(self, service):
        from app.domains.collab_board.schemas import BoardUpdate, SectionUpdate
        b = _make_board(service, _teacher())
        sec = service.create_section(
            _teacher(), b["uuid"],
            SectionCreate(name="original", kind="column"),
        )
        # 開啟開關
        service.update_board(
            _teacher(), b["uuid"], BoardUpdate(section_edit_open=True)
        )
        # 學生改名
        updated = service.update_section(
            _student(), b["uuid"], sec["id"],
            SectionUpdate(name="renamed by student"),
        )
        assert updated["name"] == "renamed by student"

    def test_student_can_delete_section_when_edit_open(self, service):
        from app.domains.collab_board.schemas import BoardUpdate
        b = _make_board(service, _teacher())
        sec = service.create_section(
            _teacher(), b["uuid"],
            SectionCreate(name="x", kind="column"),
        )
        service.update_board(
            _teacher(), b["uuid"], BoardUpdate(section_edit_open=True)
        )
        # 學生刪得掉
        service.delete_section(_student(), b["uuid"], sec["id"])
        # 確認真的被刪
        detail = service.get_board_detail(_teacher(), b["uuid"])
        assert not any(s["id"] == sec["id"] for s in detail["sections"])

    def test_student_cannot_manage_section_even_if_open_when_not_in_class(self, service):
        from app.domains.collab_board.schemas import BoardUpdate
        b = _make_board(service, _teacher())
        service.update_board(
            _teacher(), b["uuid"], BoardUpdate(section_edit_open=True)
        )
        # 其他班學生仍被拒(can_view 回 False)
        with pytest.raises(BoardAccessDeniedError):
            service.create_section(
                _student(id=9, cls="2B"), b["uuid"],
                SectionCreate(name="sneaky", kind="column"),
            )

    def test_toggle_edit_open_broadcasts_board_updated(self, service):
        from app.domains.collab_board.schemas import BoardUpdate
        b = _make_board(service, _teacher())
        broadcaster = service._broadcaster  # noqa: SLF001
        before = len(broadcaster.events)
        service.update_board(
            _teacher(), b["uuid"], BoardUpdate(section_edit_open=True)
        )
        # 至少有一個 board.updated 事件被廣播
        new_events = broadcaster.events[before:]
        assert any(
            ev[0] == b["uuid"] and ev[1].get("type") == "board.updated"
            for ev in new_events
        )
