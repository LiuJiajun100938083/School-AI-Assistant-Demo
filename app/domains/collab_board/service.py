"""
協作佈告板 — Service 層
========================
業務編排：呼 repo + 判 policy + 跑 post_state + 觸發 broadcaster + 檔案。

硬規則:
  - 不直接讀環境變數；所有依賴建構時注入
  - 權限只走 policy.ensure_*
  - 狀態只走 post_state.transition
  - 寫 DB 成功後才廣播；廣播失敗不回滾
"""

import asyncio
import logging
import uuid as uuid_lib
from typing import Any, Dict, List, Optional

from fastapi import UploadFile

from app.domains.collab_board import policy, post_state
from app.domains.collab_board.broadcaster import BoardBroadcaster
from app.domains.collab_board.constants import (
    LAYOUT_CANVAS,
    POST_LINK,
    REACTION_LIKE,
    SECTION_GROUP,
)
from app.domains.collab_board.exceptions import (
    BoardAccessDeniedError,
    BoardNotFoundError,
    InvalidSectionError,
    PostNotFoundError,
    SectionNotFoundError,
)
from app.domains.collab_board.link_meta import LinkMetaProvider
from app.domains.collab_board.post_state import PostStatus
from app.domains.collab_board.repository import CollabBoardRepository
from app.domains.collab_board.schemas import (
    BoardCreate,
    BoardUpdate,
    CommentCreate,
    PostCreate,
    PostMove,
    PostUpdate,
    SectionCreate,
    SectionUpdate,
)
from app.domains.collab_board.uploader import BoardFileUploader

logger = logging.getLogger(__name__)


class CollabBoardService:
    def __init__(
        self,
        repo: CollabBoardRepository,
        broadcaster: BoardBroadcaster,
        link_meta: LinkMetaProvider,
        uploader: BoardFileUploader,
    ):
        self._repo = repo
        self._broadcaster = broadcaster
        self._link_meta = link_meta
        self._uploader = uploader

    # ============================================================
    # 系統初始化
    # ============================================================

    def init_system(self) -> None:
        self._repo.init_table()
        logger.info("CollabBoardService initialized")

    # ============================================================
    # Board
    # ============================================================

    def create_board(self, user: Dict[str, Any], data: BoardCreate) -> Dict[str, Any]:
        if user.get("role") not in ("teacher", "admin"):
            raise BoardAccessDeniedError("僅教師與管理員可建立佈告板")
        board_uuid = str(uuid_lib.uuid4())
        self._repo.create_board({
            "uuid": board_uuid,
            "title": data.title,
            "description": data.description,
            "icon": data.icon,
            "layout": data.layout,
            "background": data.background,
            "visibility": data.visibility,
            "moderation": data.moderation,
            "class_name": data.class_name or user.get("class_name", "") or "",
            "owner_id": user["id"],
        })
        return self._repo.get_board_by_uuid(board_uuid) or {}

    def list_boards(self, user: Dict[str, Any], include_archived: bool = False) -> List[Dict[str, Any]]:
        return self._repo.list_boards_for_user(
            user_id=user["id"],
            user_role=user.get("role", "student"),
            user_class=user.get("class_name", "") or "",
            include_archived=include_archived,
        )

    def get_board_detail(self, user: Dict[str, Any], board_uuid: str) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_view(board, user)

        sections = self._repo.list_sections(board["id"])
        posts = self._repo.list_posts(
            board_id=board["id"],
            include_non_approved_for_user=user["id"],
            include_all_pending=policy.can_moderate(board, user),
        )
        reactions = self._repo.reactions_for_board(board["id"])
        comments = self._repo.comments_for_board(board["id"])
        author_ids = list({p["author_id"] for p in posts})
        for cs in comments.values():
            for c in cs:
                if c.get("author_id") and c["author_id"] not in author_ids:
                    author_ids.append(c["author_id"])
        names = self._repo.author_names(author_ids)

        # 附加計算欄位
        for p in posts:
            reac = reactions.get(p["id"], {"count": 0, "user_ids": []})
            p["like_count"] = reac["count"]
            p["liked_by_me"] = user["id"] in reac["user_ids"]
            p["comments"] = comments.get(p["id"], [])
            p["author_name"] = names.get(p["author_id"], "")

        return {
            "board": board,
            "sections": sections,
            "posts": posts,
        }

    def update_board(self, user: Dict[str, Any], board_uuid: str, data: BoardUpdate) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if updates:
            self._repo.update_board(board["id"], updates)
        updated = self._repo.get_board_by_id(board["id"]) or {}
        self._publish(board_uuid, "board.updated", {"board": updated})
        return updated

    def archive_board(self, user: Dict[str, Any], board_uuid: str) -> None:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        self._repo.archive_board(board["id"])
        self._publish(board_uuid, "board.archived", {"uuid": board_uuid})

    # ============================================================
    # Section
    # ============================================================

    def create_section(
        self, user: Dict[str, Any], board_uuid: str, data: SectionCreate
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        if data.kind == SECTION_GROUP and not data.group_members:
            raise InvalidSectionError("group section 必須指派成員")
        sid = self._repo.create_section(board["id"], {
            "name": data.name,
            "kind": data.kind,
            "group_members": data.group_members,
            "order_index": data.order_index,
        })
        section = self._repo.get_section(sid) or {}
        self._publish(board_uuid, "section.created", {"section": section})
        return section

    def update_section(
        self, user: Dict[str, Any], board_uuid: str, section_id: int, data: SectionUpdate
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        self._repo.update_section(section_id, updates)
        section = self._repo.get_section(section_id)
        if section is None:
            raise SectionNotFoundError(section_id)
        self._publish(board_uuid, "section.updated", {"section": section})
        return section

    def delete_section(self, user: Dict[str, Any], board_uuid: str, section_id: int) -> None:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        self._repo.delete_section(section_id)
        self._publish(board_uuid, "section.deleted", {"id": section_id})

    # ============================================================
    # Post
    # ============================================================

    def create_post(
        self, user: Dict[str, Any], board_uuid: str, data: PostCreate
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        section = None
        if data.section_id is not None:
            section = self._repo.get_section(data.section_id)
            if section is None or section["board_id"] != board["id"]:
                raise SectionNotFoundError(data.section_id)
        policy.ensure_can_post(board, section, user)

        status = post_state.initial_status(
            moderation=bool(board.get("moderation")),
            user_role=user.get("role", "student"),
        )

        link_meta = None
        if data.kind == POST_LINK and data.link_url:
            link_meta = self._link_meta.fetch(data.link_url).to_dict()

        post_uuid = str(uuid_lib.uuid4())
        payload = {
            "uuid": post_uuid,
            "board_id": board["id"],
            "section_id": data.section_id,
            "author_id": user["id"],
            "kind": data.kind,
            "title": data.title,
            "body": data.body,
            "media_url": data.media_url,
            "link_url": data.link_url,
            "link_meta": link_meta,
            "color": data.color,
            "canvas_x": data.canvas_x,
            "canvas_y": data.canvas_y,
            "canvas_w": data.canvas_w,
            "canvas_h": data.canvas_h,
            "status": status.value,
        }
        pid = self._repo.create_post(payload)
        post = self._repo.get_post(pid) or {}
        post["like_count"] = 0
        post["liked_by_me"] = False
        post["comments"] = []
        names = self._repo.author_names([user["id"]])
        post["author_name"] = names.get(user["id"], (user.get("display_name") or user.get("username") or ""))
        self._publish(board_uuid, "post.created", {"post": post})
        return post

    def update_post(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, data: PostUpdate
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        policy.ensure_can_edit_post(board, post, user)
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if updates:
            self._repo.update_post(post_id, updates)
        updated = self._repo.get_post(post_id) or {}
        self._publish(board_uuid, "post.updated", {"post": updated})
        return updated

    def move_post(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, data: PostMove
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        policy.ensure_can_edit_post(board, post, user)
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if updates:
            self._repo.update_post(post_id, updates)
        updated = self._repo.get_post(post_id) or {}
        self._publish(board_uuid, "post.moved", {"post": updated})
        return updated

    def delete_post(self, user: Dict[str, Any], board_uuid: str, post_id: int) -> None:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        policy.ensure_can_edit_post(board, post, user)
        self._repo.delete_post(post_id)
        self._publish(board_uuid, "post.deleted", {"id": post_id})

    def transition_post_state(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, event: str
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        # 作者可 submit/resubmit 自己的；其餘需 moderate
        if event in ("submit", "resubmit"):
            if post["author_id"] != user["id"]:
                policy.ensure_can_moderate(board, user)
        else:
            policy.ensure_can_moderate(board, user)
        new_status = post_state.transition(PostStatus(post["status"]), event)
        self._repo.update_post(post_id, {"status": new_status.value})
        updated = self._repo.get_post(post_id) or {}
        self._publish(board_uuid, "post.state_changed", {"post": updated})
        return updated

    # ============================================================
    # Reaction / Comment
    # ============================================================

    def toggle_reaction(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, kind: str = REACTION_LIKE
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        policy.ensure_can_view(board, user)
        added = self._repo.toggle_reaction(post_id, user["id"], kind)
        count = self._repo.count_reactions(post_id, kind)
        payload = {
            "post_id": post_id,
            "kind": kind,
            "count": count,
            "user_id": user["id"],
            "added": added,
        }
        self._publish(board_uuid, "reaction.changed", payload)
        return payload

    def add_comment(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, data: CommentCreate
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        post = self._require_post(post_id, board["id"])
        policy.ensure_can_view(board, user)
        cid = self._repo.add_comment(post_id, user["id"], data.body)
        comment = self._repo.get_comment(cid) or {}
        comment["author_name"] = (user.get("display_name") or user.get("username") or "")
        self._publish(board_uuid, "comment.added", {"post_id": post_id, "comment": comment})
        return comment

    def delete_comment(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, comment_id: int
    ) -> None:
        board = self._require_board(board_uuid)
        comment = self._repo.get_comment(comment_id)
        if comment is None:
            raise PostNotFoundError(comment_id)
        policy.ensure_can_delete_comment(board, comment, user)
        self._repo.delete_comment(comment_id)
        self._publish(board_uuid, "comment.deleted", {"post_id": post_id, "id": comment_id})

    # ============================================================
    # 檔案
    # ============================================================

    async def upload_file(
        self, user: Dict[str, Any], board_uuid: str, file: UploadFile
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_post(board, None, user)
        return await self._uploader.save(board_uuid, file)

    # ============================================================
    # WS helper
    # ============================================================

    @property
    def broadcaster(self) -> BoardBroadcaster:
        return self._broadcaster

    # ============================================================
    # 私有
    # ============================================================

    def _require_board(self, board_uuid: str) -> Dict[str, Any]:
        board = self._repo.get_board_by_uuid(board_uuid)
        if board is None:
            raise BoardNotFoundError(board_uuid)
        return board

    def _require_post(self, post_id: int, board_id: int) -> Dict[str, Any]:
        post = self._repo.get_post(post_id)
        if post is None or post["board_id"] != board_id:
            raise PostNotFoundError(post_id)
        return post

    def _publish(self, board_uuid: str, event_type: str, payload: Dict[str, Any]) -> None:
        """Fire-and-forget 廣播。

        Service 方法通常經 run_in_executor 執行在 worker thread 中,
        無法直接 create_task。透過 broadcaster.publish_threadsafe 跨線程
        投遞到主 event loop。若主 loop 尚未被捕捉(例如初始化階段),
        靜默忽略。
        """
        event = {"type": event_type, "payload": payload}
        try:
            running = asyncio.get_running_loop()
            running.create_task(self._broadcaster.publish(board_uuid, event))
        except RuntimeError:
            # 當前線程無 running loop — 用線程安全路徑
            self._broadcaster.publish_threadsafe(board_uuid, event)
