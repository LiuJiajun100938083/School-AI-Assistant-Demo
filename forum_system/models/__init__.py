"""
数据模型层 - Pydantic请求/响应模型
"""

from .schemas import (
    # 枚举类型
    PostType,
    Visibility,
    VoteType,
    NotificationType,
    FileType,
    SortOrder,

    # 请求模型
    CreatePostRequest,
    UpdatePostRequest,
    CreateReplyRequest,
    UpdateReplyRequest,
    VoteRequest,
    SearchRequest,

    # 响应模型
    PostResponse,
    PostListResponse,
    PostDetailResponse,
    ReplyResponse,
    VoteResponse,
    NotificationResponse,
    AttachmentResponse,
    TagResponse,
    SearchResponse,

    # 分页
    PaginationMeta,
)

__all__ = [
    # 枚举
    "PostType",
    "Visibility",
    "VoteType",
    "NotificationType",
    "FileType",
    "SortOrder",

    # 请求
    "CreatePostRequest",
    "UpdatePostRequest",
    "CreateReplyRequest",
    "UpdateReplyRequest",
    "VoteRequest",
    "SearchRequest",

    # 响应
    "PostResponse",
    "PostListResponse",
    "PostDetailResponse",
    "ReplyResponse",
    "VoteResponse",
    "NotificationResponse",
    "AttachmentResponse",
    "TagResponse",
    "SearchResponse",

    # 分页
    "PaginationMeta",
]
