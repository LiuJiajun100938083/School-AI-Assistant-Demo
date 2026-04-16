"""
協作佈告板 — 貼文狀態機
========================
純函式模組，零副作用、零 I/O。

狀態機:

    [DRAFT] --submit--> [PENDING] --approve--> [APPROVED] --archive--> [ARCHIVED]
                             \\--reject---> [REJECTED] --resubmit--> [PENDING]

`initial_status(moderation, user_role)`:
    - 未開審核 → APPROVED
    - 開審核 + 學生 → PENDING
    - 開審核 + 教師/管理員 → APPROVED（自己發文不受審核限制）

`transition(current, event)`:
    - 按上表轉換
    - 非法轉換 raise PostStateError
"""

from enum import Enum
from typing import Dict, Tuple

from app.domains.collab_board.exceptions import PostStateError


class PostStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    ARCHIVED = "archived"


# (current, event) -> next
# 只列出合法轉換，其他一律非法。
_LEGAL_TRANSITIONS: Dict[Tuple[PostStatus, str], PostStatus] = {
    (PostStatus.DRAFT,    "submit"):   PostStatus.PENDING,
    (PostStatus.PENDING,  "approve"):  PostStatus.APPROVED,
    (PostStatus.PENDING,  "reject"):   PostStatus.REJECTED,
    (PostStatus.APPROVED, "archive"):  PostStatus.ARCHIVED,
    (PostStatus.REJECTED, "resubmit"): PostStatus.PENDING,
}

# 教師/管理員角色集合 — 發文不受審核限制
_STAFF_ROLES = frozenset({"teacher", "admin"})


def initial_status(moderation: bool, user_role: str) -> PostStatus:
    """決定新貼文的初始狀態

    Args:
        moderation: 該板是否開啟審核模式
        user_role: 作者角色（'student' / 'teacher' / 'admin' / ...）

    Returns:
        PENDING 若 moderation 且作者為學生；否則 APPROVED
    """
    if moderation and user_role not in _STAFF_ROLES:
        return PostStatus.PENDING
    return PostStatus.APPROVED


def transition(current: PostStatus, event: str) -> PostStatus:
    """推進狀態

    Args:
        current: 當前狀態
        event:   'submit' / 'approve' / 'reject' / 'archive' / 'resubmit'

    Returns:
        新狀態

    Raises:
        PostStateError: 非法轉換或未知事件
    """
    key = (current, event)
    if key not in _LEGAL_TRANSITIONS:
        raise PostStateError(current=current.value, event=event)
    return _LEGAL_TRANSITIONS[key]
