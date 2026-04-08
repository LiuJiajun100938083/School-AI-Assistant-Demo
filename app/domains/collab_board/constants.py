"""
協作佈告板 — 常數
==================
所有魔術數字 / 枚舉字面量統一於此；服務層禁止自己寫 literal。
"""

from pathlib import Path

# 版式
LAYOUT_GRID = "grid"
LAYOUT_SHELF = "shelf"
LAYOUT_CANVAS = "canvas"
LAYOUT_CHOICES = frozenset({LAYOUT_GRID, LAYOUT_SHELF, LAYOUT_CANVAS})

# 可見性
VISIBILITY_PRIVATE = "private"
VISIBILITY_CLASS = "class"
VISIBILITY_PUBLIC = "public"
VISIBILITY_CHOICES = frozenset({VISIBILITY_PRIVATE, VISIBILITY_CLASS, VISIBILITY_PUBLIC})

# Section kind
SECTION_COLUMN = "column"
SECTION_GROUP = "group"
SECTION_KIND_CHOICES = frozenset({SECTION_COLUMN, SECTION_GROUP})

# Post kind
POST_TEXT = "text"
POST_IMAGE = "image"
POST_LINK = "link"
POST_FILE = "file"
POST_KIND_CHOICES = frozenset({POST_TEXT, POST_IMAGE, POST_LINK, POST_FILE})

# 反應種類
REACTION_LIKE = "like"
REACTION_KINDS = frozenset({REACTION_LIKE})

# 檔案
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
ALLOWED_MIME_PREFIXES = ("image/",)
ALLOWED_MIMES = frozenset({
    "application/pdf",
    "text/plain",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
})

# 檔案路徑
DEFAULT_UPLOAD_DIR = (
    Path(__file__).resolve().parent.parent.parent.parent / "web_static" / "uploaded_boards"
)

# WebSocket
MAX_BOARD_CONNECTIONS = 100

# 欄位長度
MAX_TITLE_LEN = 200
MAX_DESCRIPTION_LEN = 2000
MAX_POST_BODY_LEN = 10000
MAX_COMMENT_LEN = 1000
