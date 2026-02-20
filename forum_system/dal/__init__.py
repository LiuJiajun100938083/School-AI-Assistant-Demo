"""
数据访问层 (Data Access Layer)
============================

负责所有数据库CRUD操作，与业务逻辑分离。
使用参数化查询防止SQL注入。
"""

from .base_dal import BaseDAL
from .post_dal import PostDAL, post_dal
from .reply_dal import ReplyDAL, reply_dal
from .vote_dal import VoteDAL, vote_dal
from .notification_dal import NotificationDAL, notification_dal
from .attachment_dal import AttachmentDAL, attachment_dal

__all__ = [
    "BaseDAL",
    "PostDAL",
    "post_dal",
    "ReplyDAL",
    "reply_dal",
    "VoteDAL",
    "vote_dal",
    "NotificationDAL",
    "notification_dal",
    "AttachmentDAL",
    "attachment_dal",
]
