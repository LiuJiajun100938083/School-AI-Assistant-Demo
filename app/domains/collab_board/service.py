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

from app.domains.collab_board import mention_parser, policy, post_state, templates_seed
from app.domains.collab_board.board_themes import list_themes
from app.domains.collab_board.broadcaster import BoardBroadcaster
from app.domains.collab_board.constants import (
    LAYOUT_CANVAS,
    MAX_TAGS_PER_POST,
    MAX_TAG_LEN,
    POST_LINK,
    POST_YOUTUBE,
    REACTION_LIKE,
    SECTION_GROUP,
)
from app.domains.collab_board.exporters import SUPPORTED_FORMATS, get_exporter
from app.domains.collab_board.link_parsers import classify_url
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
    BoardCloneRequest,
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

        # 若指定 template,以 template 為預設,使用者輸入覆蓋
        tmpl = None
        if data.template_id:
            tmpl = templates_seed.get_template(data.template_id)

        layout = data.layout or (tmpl.get("layout") if tmpl else "grid")
        theme = data.theme or (tmpl.get("theme") if tmpl else "")

        board_uuid = str(uuid_lib.uuid4())
        self._repo.create_board({
            "uuid": board_uuid,
            "title": data.title,
            "description": data.description,
            "icon": data.icon,
            "layout": layout,
            "background": data.background,
            "theme": theme,
            "visibility": data.visibility,
            "moderation": data.moderation,
            "class_name": data.class_name or user.get("class_name", "") or "",
            "owner_id": user["id"],
        })
        board = self._repo.get_board_by_uuid(board_uuid) or {}

        # seed template 內容
        if tmpl:
            self._seed_from_template(board, tmpl, user)

        self._log(board["id"], user, "board.created", meta={"title": data.title})
        return self._repo.get_board_by_uuid(board_uuid) or {}

    def _seed_from_template(
        self, board: Dict[str, Any], tmpl: Dict[str, Any], user: Dict[str, Any]
    ) -> None:
        """把 template 的 sections / posts 寫入新建板"""
        sec_map: Dict[int, int] = {}  # template idx → real section id
        for idx, s in enumerate(tmpl.get("sections") or []):
            sid = self._repo.create_section(board["id"], {
                "name": s["name"],
                "kind": s.get("kind", "column"),
                "group_members": s.get("group_members") or [],
                "order_index": s.get("order_index", idx),
            })
            sec_map[idx] = sid
        for p in tmpl.get("posts") or []:
            self._repo.create_post({
                "uuid": str(uuid_lib.uuid4()),
                "board_id": board["id"],
                "author_id": user["id"],
                "kind": p.get("kind", "text"),
                "title": p.get("title", ""),
                "body": p.get("body", ""),
                "media_url": p.get("media_url", ""),
                "link_url": p.get("link_url", ""),
                "color": p.get("color", ""),
                "canvas_x": p.get("canvas_x"),
                "canvas_y": p.get("canvas_y"),
                "canvas_w": p.get("canvas_w"),
                "canvas_h": p.get("canvas_h"),
                "status": "approved",
            })

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
        is_mod = policy.can_moderate(board, user)
        for p in posts:
            reac = reactions.get(p["id"], {"count": 0, "user_ids": []})
            p["like_count"] = reac["count"]
            p["liked_by_me"] = user["id"] in reac["user_ids"]
            p["comments"] = comments.get(p["id"], [])
            # 匿名貼文:對非作者/非 moderator 隱藏作者名字
            if p.get("is_anonymous") and p["author_id"] != user["id"] and not is_mod:
                p["author_name"] = "匿名"
                p["author_id"] = 0
            else:
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
        kind = data.kind
        if data.kind == POST_LINK and data.link_url:
            # 先用純函式分類,YouTube/Vimeo 升級為 youtube kind
            classified = classify_url(data.link_url)
            if classified.kind in ("youtube", "vimeo"):
                kind = POST_YOUTUBE
                link_meta = {
                    "url": data.link_url,
                    "embed_url": classified.embed_url,
                    "image": classified.thumbnail,
                    "provider": classified.provider,
                    "title": data.title or classified.provider,
                }
            else:
                link_meta = self._link_meta.fetch(data.link_url).to_dict()

        tags = self._sanitize_tags(data.tags)

        post_uuid = str(uuid_lib.uuid4())
        payload = {
            "uuid": post_uuid,
            "board_id": board["id"],
            "section_id": data.section_id,
            "author_id": user["id"],
            "kind": kind,
            "title": data.title,
            "body": data.body,
            "media_url": data.media_url,
            "media": data.media or None,
            "link_url": data.link_url,
            "link_meta": link_meta,
            "color": data.color,
            "tags": tags,
            "is_anonymous": bool(data.is_anonymous),
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
        mentions = mention_parser.extract_mentions(data.body)
        cid = self._repo.add_comment(
            post_id, user["id"], data.body,
            parent_id=data.parent_id,
            mentions=mentions,
        )
        comment = self._repo.get_comment(cid) or {}
        comment["author_name"] = (user.get("display_name") or user.get("username") or "")
        comment["mentions"] = mentions
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

    # ============================================================
    # Pin / Clone / Clear / Templates / Themes / Export / Activity
    # ============================================================

    def pin_post(
        self, user: Dict[str, Any], board_uuid: str, post_id: int, pinned: bool
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        post = self._require_post(post_id, board["id"])
        self._repo.update_post(post_id, {"pinned": bool(pinned)})
        updated = self._repo.get_post(post_id) or {}
        self._log(board["id"], user, "post.pinned" if pinned else "post.unpinned", target_id=post_id)
        self._publish(board_uuid, "post.updated", {"post": updated})
        return updated

    def clone_board(
        self, user: Dict[str, Any], board_uuid: str, data: BoardCloneRequest
    ) -> Dict[str, Any]:
        src = self._require_board(board_uuid)
        policy.ensure_can_view(src, user)
        if user.get("role") not in ("teacher", "admin"):
            raise BoardAccessDeniedError("僅教師與管理員可複製佈告板")

        new_uuid = str(uuid_lib.uuid4())
        self._repo.create_board({
            "uuid": new_uuid,
            "title": data.title or (src.get("title", "") + " (副本)"),
            "description": src.get("description", ""),
            "icon": src.get("icon", "📌"),
            "layout": src.get("layout", "grid"),
            "background": src.get("background", ""),
            "theme": src.get("theme", ""),
            "visibility": "private",  # 副本預設私人,使用者再改
            "moderation": bool(src.get("moderation")),
            "class_name": user.get("class_name", "") or "",
            "owner_id": user["id"],
        })
        new_board = self._repo.get_board_by_uuid(new_uuid) or {}

        # 複製 sections
        old_sections = self._repo.list_sections(src["id"])
        sec_map: Dict[int, int] = {}
        for s in old_sections:
            nsid = self._repo.create_section(new_board["id"], {
                "name": s["name"],
                "kind": s.get("kind", "column"),
                "group_members": s.get("group_members") or [],
                "order_index": s.get("order_index", 0),
            })
            sec_map[s["id"]] = nsid

        # 複製 posts (僅 approved,不含 reactions/comments)
        old_posts = self._repo.list_posts(src["id"])
        for p in old_posts:
            if p.get("status") != "approved":
                continue
            self._repo.create_post({
                "uuid": str(uuid_lib.uuid4()),
                "board_id": new_board["id"],
                "section_id": sec_map.get(p.get("section_id")) if p.get("section_id") else None,
                "author_id": user["id"],
                "kind": p.get("kind", "text"),
                "title": p.get("title", ""),
                "body": p.get("body", ""),
                "media_url": p.get("media_url", ""),
                "media": p.get("media"),
                "link_url": p.get("link_url", ""),
                "link_meta": p.get("link_meta"),
                "color": p.get("color", ""),
                "tags": p.get("tags"),
                "canvas_x": p.get("canvas_x"),
                "canvas_y": p.get("canvas_y"),
                "canvas_w": p.get("canvas_w"),
                "canvas_h": p.get("canvas_h"),
                "order_index": p.get("order_index", 0),
                "status": "approved",
            })

        self._log(new_board["id"], user, "board.cloned", meta={"source": board_uuid})
        return self._repo.get_board_by_uuid(new_uuid) or {}

    def clear_all_posts(self, user: Dict[str, Any], board_uuid: str) -> int:
        board = self._require_board(board_uuid)
        policy.ensure_can_moderate(board, user)
        n = self._repo.delete_all_posts(board["id"])
        self._log(board["id"], user, "board.cleared", meta={"count": n})
        self._publish(board_uuid, "board.cleared", {"count": n})
        return n

    def list_templates(self) -> List[Dict[str, Any]]:
        return templates_seed.list_templates()

    def list_themes(self) -> List[Dict[str, Any]]:
        return list_themes()

    def list_activity(
        self, user: Dict[str, Any], board_uuid: str, limit: int = 100
    ) -> List[Dict[str, Any]]:
        board = self._require_board(board_uuid)
        policy.ensure_can_view(board, user)
        return self._repo.list_activity(board["id"], limit=limit)

    def export_board(
        self, user: Dict[str, Any], board_uuid: str, fmt: str
    ) -> Dict[str, Any]:
        board = self._require_board(board_uuid)
        policy.ensure_can_view(board, user)
        if fmt not in SUPPORTED_FORMATS:
            raise ValueError(f"unsupported format: {fmt}")
        detail = self.get_board_detail(user, board_uuid)
        exporter = get_exporter(fmt)
        content = exporter.export(detail)
        return {
            "content": content,
            "content_type": exporter.content_type,
            "filename": f"{board.get('title') or 'board'}.{exporter.extension}",
        }

    # ============================================================
    # 內部小工具
    # ============================================================

    def _sanitize_tags(self, tags: Optional[List[str]]) -> List[str]:
        if not tags:
            return []
        out: List[str] = []
        seen = set()
        for t in tags:
            t = (t or "").strip()[:MAX_TAG_LEN]
            if not t or t.lower() in seen:
                continue
            seen.add(t.lower())
            out.append(t)
            if len(out) >= MAX_TAGS_PER_POST:
                break
        return out

    def _log(
        self,
        board_id: int,
        user: Dict[str, Any],
        event_type: str,
        *,
        target_id: Optional[int] = None,
        meta: Optional[Dict[str, Any]] = None,
    ) -> None:
        try:
            self._repo.log_activity(board_id, user["id"], event_type, target_id, meta)
        except Exception as e:  # noqa: BLE001
            logger.warning("activity log 失敗: %s", e)

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
