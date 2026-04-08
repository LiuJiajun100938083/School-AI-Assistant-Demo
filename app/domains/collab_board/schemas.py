"""
協作佈告板 — Pydantic Schemas
==============================
Request / Response 模型。Service 僅接收已驗證的 schema 物件。
"""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator

from app.domains.collab_board.constants import (
    LAYOUT_CHOICES,
    LAYOUT_GRID,
    MAX_COMMENT_LEN,
    MAX_DESCRIPTION_LEN,
    MAX_POST_BODY_LEN,
    MAX_TITLE_LEN,
    POST_KIND_CHOICES,
    REACTION_KINDS,
    REACTION_LIKE,
    SECTION_COLUMN,
    SECTION_KIND_CHOICES,
    VISIBILITY_CHOICES,
    VISIBILITY_CLASS,
)


# ============================================================
# Board
# ============================================================

class BoardCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=MAX_TITLE_LEN)
    description: str = Field("", max_length=MAX_DESCRIPTION_LEN)
    icon: str = Field("📌", max_length=8)
    layout: str = Field(LAYOUT_GRID)
    background: str = Field("", max_length=200)
    visibility: str = Field(VISIBILITY_CLASS)
    moderation: bool = False
    class_name: str = Field("", max_length=50)

    @field_validator("layout")
    @classmethod
    def _layout_valid(cls, v: str) -> str:
        if v not in LAYOUT_CHOICES:
            raise ValueError(f"layout must be one of {sorted(LAYOUT_CHOICES)}")
        return v

    @field_validator("visibility")
    @classmethod
    def _visibility_valid(cls, v: str) -> str:
        if v not in VISIBILITY_CHOICES:
            raise ValueError(f"visibility must be one of {sorted(VISIBILITY_CHOICES)}")
        return v


class BoardUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=MAX_TITLE_LEN)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LEN)
    icon: Optional[str] = Field(None, max_length=8)
    layout: Optional[str] = None
    background: Optional[str] = Field(None, max_length=200)
    visibility: Optional[str] = None
    moderation: Optional[bool] = None

    @field_validator("layout")
    @classmethod
    def _layout_valid(cls, v):
        if v is not None and v not in LAYOUT_CHOICES:
            raise ValueError(f"layout must be one of {sorted(LAYOUT_CHOICES)}")
        return v

    @field_validator("visibility")
    @classmethod
    def _visibility_valid(cls, v):
        if v is not None and v not in VISIBILITY_CHOICES:
            raise ValueError(f"visibility must be one of {sorted(VISIBILITY_CHOICES)}")
        return v


# ============================================================
# Section
# ============================================================

class SectionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    kind: str = Field(SECTION_COLUMN)
    group_members: List[int] = Field(default_factory=list)
    order_index: int = 0

    @field_validator("kind")
    @classmethod
    def _kind_valid(cls, v: str) -> str:
        if v not in SECTION_KIND_CHOICES:
            raise ValueError(f"kind must be one of {sorted(SECTION_KIND_CHOICES)}")
        return v


class SectionUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    kind: Optional[str] = None
    group_members: Optional[List[int]] = None
    order_index: Optional[int] = None

    @field_validator("kind")
    @classmethod
    def _kind_valid(cls, v):
        if v is not None and v not in SECTION_KIND_CHOICES:
            raise ValueError(f"kind must be one of {sorted(SECTION_KIND_CHOICES)}")
        return v


# ============================================================
# Post
# ============================================================

class PostCreate(BaseModel):
    section_id: Optional[int] = None
    kind: str = "text"
    title: str = Field("", max_length=MAX_TITLE_LEN)
    body: str = Field("", max_length=MAX_POST_BODY_LEN)
    media_url: str = Field("", max_length=500)
    link_url: str = Field("", max_length=500)
    color: str = Field("", max_length=20)
    # canvas only
    canvas_x: Optional[int] = None
    canvas_y: Optional[int] = None
    canvas_w: Optional[int] = None
    canvas_h: Optional[int] = None

    @field_validator("kind")
    @classmethod
    def _kind_valid(cls, v: str) -> str:
        if v not in POST_KIND_CHOICES:
            raise ValueError(f"kind must be one of {sorted(POST_KIND_CHOICES)}")
        return v


class PostUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=MAX_TITLE_LEN)
    body: Optional[str] = Field(None, max_length=MAX_POST_BODY_LEN)
    media_url: Optional[str] = Field(None, max_length=500)
    link_url: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=20)


class PostMove(BaseModel):
    section_id: Optional[int] = None
    order_index: Optional[int] = None
    canvas_x: Optional[int] = None
    canvas_y: Optional[int] = None
    canvas_w: Optional[int] = None
    canvas_h: Optional[int] = None
    z_order: Optional[int] = None


class PostStateEvent(BaseModel):
    event: str  # approve / reject / archive / submit / resubmit


# ============================================================
# Reaction / Comment
# ============================================================

class ReactionToggle(BaseModel):
    kind: str = Field(REACTION_LIKE)

    @field_validator("kind")
    @classmethod
    def _kind_valid(cls, v: str) -> str:
        if v not in REACTION_KINDS:
            raise ValueError(f"reaction kind must be one of {sorted(REACTION_KINDS)}")
        return v


class CommentCreate(BaseModel):
    body: str = Field(..., min_length=1, max_length=MAX_COMMENT_LEN)


# ============================================================
# WS 事件（type hinting only — 實際運行時是 dict）
# ============================================================

class WsEvent(BaseModel):
    type: str
    payload: Dict[str, Any] = Field(default_factory=dict)
