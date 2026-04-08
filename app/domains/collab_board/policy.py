"""
協作佈告板 — 權限 Policy
==========================
純函式模組 — 所有可見 / 可寫 / 可審核 / 可編輯判定集中於此。

設計原則:
  - 不碰 DB，只接收 dict 形式的 board/section/post/comment/user
  - 可獨立單元測
  - 同時提供 can_* (回 bool) 與 ensure_* (raise) 兩套 API
  - 其他層一律只用這裡的函式，不得散寫 if user.role == ...
"""

from typing import Any, Dict, Optional

from app.domains.collab_board.exceptions import BoardAccessDeniedError

# ============================================================
# 常數
# ============================================================

STAFF_ROLES = frozenset({"teacher", "admin"})
ADMIN_ROLES = frozenset({"admin"})

Board = Dict[str, Any]
Section = Dict[str, Any]
Post = Dict[str, Any]
Comment = Dict[str, Any]
User = Dict[str, Any]


# ============================================================
# 內部輔助
# ============================================================

def _is_staff(user: User) -> bool:
    return user.get("role") in STAFF_ROLES


def _is_admin(user: User) -> bool:
    return user.get("role") in ADMIN_ROLES


def _is_owner(board: Board, user: User) -> bool:
    return board.get("owner_id") == user.get("id")


def _same_class(board: Board, user: User) -> bool:
    board_class = board.get("class_name") or ""
    user_class = user.get("class_name") or ""
    return bool(board_class) and board_class == user_class


# ============================================================
# can_view — 誰能看板
# ============================================================

def can_view(board: Board, user: User) -> bool:
    """
    規則:
      - admin 永遠可看
      - 歸檔板：僅 owner 與 staff 可看
      - visibility=private: 僅 owner
      - visibility=class:   同班學生 + 任何 teacher/admin + owner
      - visibility=public:  任何登入者
    """
    if _is_admin(user):
        return True

    if board.get("is_archived"):
        return _is_owner(board, user) or _is_staff(user)

    visibility = board.get("visibility")

    if visibility == "private":
        return _is_owner(board, user)

    if visibility == "class":
        return _is_owner(board, user) or _is_staff(user) or _same_class(board, user)

    if visibility == "public":
        return True

    # 未知 visibility 一律拒絕
    return False


# ============================================================
# can_post — 誰能在某 section 下發文
# ============================================================

def can_post(board: Board, section: Optional[Section], user: User) -> bool:
    """
    規則:
      - 無法 view 的板不可發文
      - 歸檔板不可發文
      - 教師/管理員繞過所有 section 限制
      - group section：學生必須在 group_members 內
      - column section 或無 section：可 view 即可發
    """
    if board.get("is_archived"):
        return False

    if not can_view(board, user):
        return False

    if _is_staff(user):
        return True

    if section is None:
        return True

    if section.get("kind") == "group":
        members = section.get("group_members") or []
        return user.get("id") in members

    return True


# ============================================================
# can_moderate — 審核 / 刪他人內容
# ============================================================

def can_moderate(board: Board, user: User) -> bool:
    """
    規則: owner 或 teacher/admin
    """
    return _is_owner(board, user) or _is_staff(user)


# ============================================================
# can_edit_post — 編輯貼文
# ============================================================

def can_edit_post(board: Board, post: Post, user: User) -> bool:
    """
    規則:
      - 作者可編輯
      - moderator（owner/teacher/admin）可編輯
    """
    if post.get("author_id") == user.get("id"):
        return True
    return can_moderate(board, user)


# ============================================================
# can_delete_comment
# ============================================================

def can_delete_comment(board: Board, comment: Comment, user: User) -> bool:
    """
    規則: 評論作者或 moderator
    """
    if comment.get("author_id") == user.get("id"):
        return True
    return can_moderate(board, user)


# ============================================================
# ensure_* — raise 版（service 層用）
# ============================================================

def ensure_can_view(board: Board, user: User) -> None:
    if not can_view(board, user):
        raise BoardAccessDeniedError("無權查看此佈告板")


def ensure_can_post(board: Board, section: Optional[Section], user: User) -> None:
    if not can_post(board, section, user):
        raise BoardAccessDeniedError("無權在此板或分欄發文")


def ensure_can_moderate(board: Board, user: User) -> None:
    if not can_moderate(board, user):
        raise BoardAccessDeniedError("無權審核此佈告板")


def ensure_can_edit_post(board: Board, post: Post, user: User) -> None:
    if not can_edit_post(board, post, user):
        raise BoardAccessDeniedError("無權編輯此貼文")


def ensure_can_delete_comment(board: Board, comment: Comment, user: User) -> None:
    if not can_delete_comment(board, comment, user):
        raise BoardAccessDeniedError("無權刪除此評論")
