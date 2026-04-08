"""
協作佈告板 — Repository 層
============================
只負責 SQL，不含任何業務判斷（權限、狀態機、廣播由上層處理）。

包含的表：
  collab_boards / collab_board_sections / collab_board_posts
  collab_board_reactions / collab_board_comments
"""

import json
import logging
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


def _dumps(v: Any) -> str:
    return json.dumps(v, ensure_ascii=False)


def _loads(v: Any) -> Any:
    if v is None or v == "":
        return None
    if isinstance(v, (dict, list)):
        return v
    try:
        return json.loads(v)
    except Exception:
        return None


class CollabBoardRepository(BaseRepository):
    """協作佈告板 Repository (5 tables)"""

    TABLE = "collab_boards"  # 主表，基類通用方法會用到

    # ============================================================
    # 表初始化
    # ============================================================

    def init_table(self) -> None:
        """初始化 5 張表（幂等）"""
        boards_sql = """
        CREATE TABLE IF NOT EXISTS collab_boards (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36) NOT NULL UNIQUE,
            title VARCHAR(200) NOT NULL,
            description TEXT,
            icon VARCHAR(16) DEFAULT '📌',
            layout ENUM('grid','shelf','canvas') DEFAULT 'grid',
            background VARCHAR(200) DEFAULT '',
            visibility ENUM('private','class','public') DEFAULT 'class',
            moderation BOOLEAN DEFAULT FALSE,
            class_name VARCHAR(50) DEFAULT '',
            owner_id INT NOT NULL,
            is_archived BOOLEAN DEFAULT FALSE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_owner (owner_id),
            INDEX idx_class_vis (class_name, visibility),
            INDEX idx_archived (is_archived)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='協作佈告板'
        """

        sections_sql = """
        CREATE TABLE IF NOT EXISTS collab_board_sections (
            id INT AUTO_INCREMENT PRIMARY KEY,
            board_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            kind ENUM('column','group') DEFAULT 'column',
            group_members JSON,
            order_index INT DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_board (board_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """

        posts_sql = """
        CREATE TABLE IF NOT EXISTS collab_board_posts (
            id INT AUTO_INCREMENT PRIMARY KEY,
            uuid VARCHAR(36) NOT NULL UNIQUE,
            board_id INT NOT NULL,
            section_id INT NULL,
            author_id INT NOT NULL,
            kind ENUM('text','image','link','file') DEFAULT 'text',
            title VARCHAR(200) DEFAULT '',
            body TEXT,
            media_url VARCHAR(500) DEFAULT '',
            link_url VARCHAR(500) DEFAULT '',
            link_meta JSON,
            color VARCHAR(20) DEFAULT '',
            canvas_x INT NULL,
            canvas_y INT NULL,
            canvas_w INT NULL,
            canvas_h INT NULL,
            z_order INT DEFAULT 0,
            order_index INT DEFAULT 0,
            status ENUM('draft','pending','approved','rejected','archived') DEFAULT 'approved',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_board_status (board_id, status),
            INDEX idx_author (author_id),
            INDEX idx_section (section_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """

        reactions_sql = """
        CREATE TABLE IF NOT EXISTS collab_board_reactions (
            post_id INT NOT NULL,
            user_id INT NOT NULL,
            kind VARCHAR(16) DEFAULT 'like',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (post_id, user_id, kind),
            INDEX idx_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """

        comments_sql = """
        CREATE TABLE IF NOT EXISTS collab_board_comments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            post_id INT NOT NULL,
            author_id INT NOT NULL,
            body TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_post (post_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """

        with self.transaction() as conn:
            cursor = conn.cursor()
            for sql in (boards_sql, sections_sql, posts_sql, reactions_sql, comments_sql):
                cursor.execute(sql)
        logger.info("collab_board 5 張表初始化成功")

    # ============================================================
    # Board
    # ============================================================

    def create_board(self, data: Dict[str, Any]) -> int:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cols = ", ".join(data.keys())
            ph = ", ".join(["%s"] * len(data))
            cursor.execute(
                f"INSERT INTO collab_boards ({cols}) VALUES ({ph})",
                tuple(data.values()),
            )
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            row = cursor.fetchone()
            return row["id"] if row else 0

    def get_board_by_uuid(self, uuid: str) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_boards WHERE uuid=%s LIMIT 1", (uuid,)
        )
        return rows[0] if rows else None

    def get_board_by_id(self, board_id: int) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_boards WHERE id=%s LIMIT 1", (board_id,)
        )
        return rows[0] if rows else None

    def list_boards_for_user(
        self,
        user_id: int,
        user_role: str,
        user_class: str,
        include_archived: bool = False,
    ) -> List[Dict[str, Any]]:
        """根據使用者可見性列表板

        規則與 policy.can_view 對齊（staff 看全部；學生看 public + 同班 class + 自建 private）
        """
        clauses = []
        params: List[Any] = []

        if user_role in ("teacher", "admin"):
            # 全部
            pass
        else:
            clauses.append(
                "(visibility='public' "
                "OR (visibility='class' AND class_name=%s) "
                "OR (visibility='private' AND owner_id=%s))"
            )
            params.extend([user_class or "", user_id])

        if not include_archived:
            clauses.append("is_archived=FALSE")

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        sql = f"SELECT * FROM collab_boards{where} ORDER BY updated_at DESC LIMIT 200"
        return self.pool.execute(sql, tuple(params)) or []

    def update_board(self, board_id: int, updates: Dict[str, Any]) -> int:
        if not updates:
            return 0
        set_clause = ", ".join(f"{k}=%s" for k in updates.keys())
        values = list(updates.values()) + [board_id]
        return self.pool.execute_write(
            f"UPDATE collab_boards SET {set_clause} WHERE id=%s",
            tuple(values),
        )

    def archive_board(self, board_id: int) -> int:
        return self.pool.execute_write(
            "UPDATE collab_boards SET is_archived=TRUE WHERE id=%s", (board_id,)
        )

    # ============================================================
    # Section
    # ============================================================

    def create_section(self, board_id: int, data: Dict[str, Any]) -> int:
        payload = {
            "board_id": board_id,
            "name": data["name"],
            "kind": data.get("kind", "column"),
            "group_members": _dumps(data.get("group_members") or []),
            "order_index": data.get("order_index", 0),
        }
        with self.transaction() as conn:
            cursor = conn.cursor()
            cols = ", ".join(payload.keys())
            ph = ", ".join(["%s"] * len(payload))
            cursor.execute(
                f"INSERT INTO collab_board_sections ({cols}) VALUES ({ph})",
                tuple(payload.values()),
            )
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            row = cursor.fetchone()
            return row["id"] if row else 0

    def list_sections(self, board_id: int) -> List[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_board_sections WHERE board_id=%s ORDER BY order_index ASC, id ASC",
            (board_id,),
        ) or []
        for r in rows:
            r["group_members"] = _loads(r.get("group_members")) or []
        return rows

    def get_section(self, section_id: int) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_board_sections WHERE id=%s LIMIT 1", (section_id,)
        )
        if not rows:
            return None
        row = rows[0]
        row["group_members"] = _loads(row.get("group_members")) or []
        return row

    def update_section(self, section_id: int, updates: Dict[str, Any]) -> int:
        if not updates:
            return 0
        data = dict(updates)
        if "group_members" in data:
            data["group_members"] = _dumps(data["group_members"] or [])
        set_clause = ", ".join(f"{k}=%s" for k in data.keys())
        values = list(data.values()) + [section_id]
        return self.pool.execute_write(
            f"UPDATE collab_board_sections SET {set_clause} WHERE id=%s",
            tuple(values),
        )

    def delete_section(self, section_id: int) -> int:
        return self.pool.execute_write(
            "DELETE FROM collab_board_sections WHERE id=%s", (section_id,)
        )

    # ============================================================
    # Post
    # ============================================================

    def create_post(self, data: Dict[str, Any]) -> int:
        payload = dict(data)
        if "link_meta" in payload and payload["link_meta"] is not None:
            payload["link_meta"] = _dumps(payload["link_meta"])
        with self.transaction() as conn:
            cursor = conn.cursor()
            cols = ", ".join(payload.keys())
            ph = ", ".join(["%s"] * len(payload))
            cursor.execute(
                f"INSERT INTO collab_board_posts ({cols}) VALUES ({ph})",
                tuple(payload.values()),
            )
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            row = cursor.fetchone()
            return row["id"] if row else 0

    def get_post(self, post_id: int) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_board_posts WHERE id=%s LIMIT 1", (post_id,)
        )
        if not rows:
            return None
        r = rows[0]
        r["link_meta"] = _loads(r.get("link_meta"))
        return r

    def get_post_by_uuid(self, uuid: str) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_board_posts WHERE uuid=%s LIMIT 1", (uuid,)
        )
        if not rows:
            return None
        r = rows[0]
        r["link_meta"] = _loads(r.get("link_meta"))
        return r

    def list_posts(
        self,
        board_id: int,
        include_non_approved_for_user: Optional[int] = None,
        include_all_pending: bool = False,
    ) -> List[Dict[str, Any]]:
        """
        預設只返回 status='approved'。
        - include_non_approved_for_user: 該使用者自己的 pending/rejected 也回
        - include_all_pending: moderator 額外看所有 pending
        """
        clauses = ["board_id=%s"]
        params: List[Any] = [board_id]

        status_clauses = ["status='approved'"]
        if include_all_pending:
            status_clauses.append("status='pending'")
        if include_non_approved_for_user is not None:
            status_clauses.append("(author_id=%s AND status IN ('pending','rejected','draft'))")
            params.append(include_non_approved_for_user)

        clauses.append("(" + " OR ".join(status_clauses) + ")")
        sql = (
            "SELECT * FROM collab_board_posts "
            f"WHERE {' AND '.join(clauses)} "
            "ORDER BY order_index ASC, id ASC LIMIT 2000"
        )
        rows = self.pool.execute(sql, tuple(params)) or []
        for r in rows:
            r["link_meta"] = _loads(r.get("link_meta"))
        return rows

    def update_post(self, post_id: int, updates: Dict[str, Any]) -> int:
        if not updates:
            return 0
        data = dict(updates)
        if "link_meta" in data:
            data["link_meta"] = _dumps(data["link_meta"]) if data["link_meta"] is not None else None
        set_clause = ", ".join(f"{k}=%s" for k in data.keys())
        values = list(data.values()) + [post_id]
        return self.pool.execute_write(
            f"UPDATE collab_board_posts SET {set_clause} WHERE id=%s",
            tuple(values),
        )

    def delete_post(self, post_id: int) -> int:
        # 硬刪 + 聯動刪 reaction/comment
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM collab_board_comments WHERE post_id=%s", (post_id,))
            cursor.execute("DELETE FROM collab_board_reactions WHERE post_id=%s", (post_id,))
            cursor.execute("DELETE FROM collab_board_posts WHERE id=%s", (post_id,))
            return cursor.rowcount

    # ============================================================
    # Reaction
    # ============================================================

    def toggle_reaction(self, post_id: int, user_id: int, kind: str = "like") -> bool:
        """回傳 True 表示加了，False 表示取消"""
        existing = self.pool.execute(
            "SELECT 1 FROM collab_board_reactions WHERE post_id=%s AND user_id=%s AND kind=%s",
            (post_id, user_id, kind),
        )
        if existing:
            self.pool.execute_write(
                "DELETE FROM collab_board_reactions WHERE post_id=%s AND user_id=%s AND kind=%s",
                (post_id, user_id, kind),
            )
            return False
        self.pool.execute_write(
            "INSERT INTO collab_board_reactions (post_id, user_id, kind) VALUES (%s, %s, %s)",
            (post_id, user_id, kind),
        )
        return True

    def count_reactions(self, post_id: int, kind: str = "like") -> int:
        rows = self.pool.execute(
            "SELECT COUNT(*) as cnt FROM collab_board_reactions WHERE post_id=%s AND kind=%s",
            (post_id, kind),
        )
        return rows[0]["cnt"] if rows else 0

    def user_reacted(self, post_id: int, user_id: int, kind: str = "like") -> bool:
        rows = self.pool.execute(
            "SELECT 1 FROM collab_board_reactions WHERE post_id=%s AND user_id=%s AND kind=%s",
            (post_id, user_id, kind),
        )
        return bool(rows)

    def reactions_for_board(self, board_id: int) -> Dict[int, Dict[str, Any]]:
        """批量載入某板所有 post 的反應統計 → {post_id: {count, user_reacted_ids:[]}}"""
        rows = self.pool.execute(
            """
            SELECT r.post_id, r.user_id, r.kind
            FROM collab_board_reactions r
            JOIN collab_board_posts p ON p.id = r.post_id
            WHERE p.board_id = %s
            """,
            (board_id,),
        ) or []
        result: Dict[int, Dict[str, Any]] = {}
        for r in rows:
            pid = r["post_id"]
            entry = result.setdefault(pid, {"count": 0, "user_ids": []})
            entry["count"] += 1
            entry["user_ids"].append(r["user_id"])
        return result

    # ============================================================
    # Comment
    # ============================================================

    def add_comment(self, post_id: int, author_id: int, body: str) -> int:
        with self.transaction() as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO collab_board_comments (post_id, author_id, body) VALUES (%s, %s, %s)",
                (post_id, author_id, body),
            )
            cursor.execute("SELECT LAST_INSERT_ID() as id")
            row = cursor.fetchone()
            return row["id"] if row else 0

    def list_comments(self, post_id: int) -> List[Dict[str, Any]]:
        return self.pool.execute(
            "SELECT * FROM collab_board_comments WHERE post_id=%s ORDER BY created_at ASC",
            (post_id,),
        ) or []

    def get_comment(self, comment_id: int) -> Optional[Dict[str, Any]]:
        rows = self.pool.execute(
            "SELECT * FROM collab_board_comments WHERE id=%s LIMIT 1", (comment_id,)
        )
        return rows[0] if rows else None

    def delete_comment(self, comment_id: int) -> int:
        return self.pool.execute_write(
            "DELETE FROM collab_board_comments WHERE id=%s", (comment_id,)
        )

    def comments_for_board(self, board_id: int) -> Dict[int, List[Dict[str, Any]]]:
        rows = self.pool.execute(
            """
            SELECT c.*, COALESCE(u.display_name, u.username) as author_name
            FROM collab_board_comments c
            JOIN collab_board_posts p ON p.id = c.post_id
            LEFT JOIN users u ON u.id = c.author_id
            WHERE p.board_id = %s
            ORDER BY c.created_at ASC
            """,
            (board_id,),
        ) or []
        result: Dict[int, List[Dict[str, Any]]] = {}
        for r in rows:
            result.setdefault(r["post_id"], []).append(r)
        return result

    # ============================================================
    # Author name batch lookup
    # ============================================================

    def author_names(self, user_ids: List[int]) -> Dict[int, str]:
        """回傳 {id: 顯示名}。優先 display_name,無則 fallback username。"""
        if not user_ids:
            return {}
        placeholders = ", ".join(["%s"] * len(user_ids))
        rows = self.pool.execute(
            f"SELECT id, username, display_name FROM users WHERE id IN ({placeholders})",
            tuple(user_ids),
        ) or []
        return {
            r["id"]: (r.get("display_name") or r.get("username") or "")
            for r in rows
        }
