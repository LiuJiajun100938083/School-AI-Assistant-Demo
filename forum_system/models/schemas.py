"""
Pydantic数据模型
===============

定义所有请求和响应的数据结构，提供自动验证和序列化。
遵循项目现有的模型定义规范。
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field, field_validator, ConfigDict


# ============================================================
# 枚举类型定义
# ============================================================

class PostType(str, Enum):
    """主题类型"""
    DISCUSSION = "discussion"  # 讨论
    QUESTION = "question"      # 问题
    ANNOUNCEMENT = "announcement"  # 公告


class Visibility(str, Enum):
    """可见性"""
    PUBLIC = "public"    # 公开 - 学生可见
    PRIVATE = "private"  # 私有 - 仅教师可见


class VoteType(str, Enum):
    """投票类型"""
    UPVOTE = "upvote"      # 点赞
    DOWNVOTE = "downvote"  # 踩


class NotificationType(str, Enum):
    """通知类型"""
    NEW_REPLY = "new_reply"                  # 新回复
    NEW_POST = "new_post"                    # 关注标签有新主题
    MENTION = "mention"                      # @提及
    INSTRUCTOR_RESPONSE = "instructor_response"  # 教师回复
    ANSWER_ACCEPTED = "answer_accepted"      # 答案被采纳
    UPVOTE = "upvote"                        # 收到点赞


class FileType(str, Enum):
    """文件类型"""
    IMAGE = "image"
    DOCUMENT = "document"
    VIDEO = "video"
    AUDIO = "audio"
    OTHER = "other"


class SortOrder(str, Enum):
    """排序方式"""
    NEWEST = "newest"           # 最新
    OLDEST = "oldest"           # 最旧
    MOST_UPVOTED = "most_upvoted"   # 最多点赞
    MOST_REPLIED = "most_replied"   # 最多回复
    MOST_VIEWED = "most_viewed"     # 最多浏览


# ============================================================
# 分页模型
# ============================================================

class PaginationMeta(BaseModel):
    """分页元数据"""
    page: int = Field(..., ge=1, description="当前页码")
    page_size: int = Field(..., ge=1, le=100, description="每页数量")
    total_items: int = Field(..., ge=0, description="总条数")
    total_pages: int = Field(..., ge=0, description="总页数")
    has_next: bool = Field(..., description="是否有下一页")
    has_prev: bool = Field(..., description="是否有上一页")


# ============================================================
# 请求模型 - 主题
# ============================================================

class CreatePostRequest(BaseModel):
    """创建主题请求"""
    title: str = Field(
        ...,
        min_length=5,
        max_length=255,
        description="主题标题"
    )
    content: str = Field(
        ...,
        min_length=10,
        max_length=50000,
        description="主题内容(Markdown格式)"
    )
    post_type: PostType = Field(
        default=PostType.DISCUSSION,
        description="主题类型"
    )
    visibility: Visibility = Field(
        default=Visibility.PUBLIC,
        description="可见性: public=学生可见, private=仅教师可见"
    )
    is_anonymous: bool = Field(
        default=False,
        description="是否匿名发布"
    )
    tags: List[str] = Field(
        default_factory=list,
        max_length=10,
        description="标签列表"
    )

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        """验证标题"""
        v = v.strip()
        if not v:
            raise ValueError('标题不能为空')
        # 防止XSS - 基础检查
        if '<script' in v.lower():
            raise ValueError('标题包含非法内容')
        return v

    @field_validator('content')
    @classmethod
    def validate_content(cls, v: str) -> str:
        """验证内容"""
        v = v.strip()
        if not v:
            raise ValueError('内容不能为空')
        return v

    @field_validator('tags')
    @classmethod
    def validate_tags(cls, v: List[str]) -> List[str]:
        """验证标签"""
        # 清理并去重
        cleaned = []
        seen = set()
        for tag in v:
            tag = tag.strip()[:50]  # 限制长度
            if tag and tag.lower() not in seen:
                cleaned.append(tag)
                seen.add(tag.lower())
        return cleaned[:10]  # 最多10个标签


class UpdatePostRequest(BaseModel):
    """更新主题请求"""
    title: Optional[str] = Field(
        None,
        min_length=5,
        max_length=255,
        description="主题标题"
    )
    content: Optional[str] = Field(
        None,
        min_length=10,
        max_length=50000,
        description="主题内容"
    )
    visibility: Optional[Visibility] = Field(
        None,
        description="可见性"
    )
    tags: Optional[List[str]] = Field(
        None,
        max_length=10,
        description="标签列表"
    )
    is_pinned: Optional[bool] = Field(
        None,
        description="是否置顶(仅教师)"
    )
    is_locked: Optional[bool] = Field(
        None,
        description="是否锁定(仅教师)"
    )
    is_resolved: Optional[bool] = Field(
        None,
        description="问题是否已解决"
    )


# ============================================================
# 请求模型 - 回复
# ============================================================

class CreateReplyRequest(BaseModel):
    """创建回复请求"""
    content: str = Field(
        ...,
        min_length=1,
        max_length=50000,
        description="回复内容(Markdown格式)"
    )
    is_anonymous: bool = Field(
        default=False,
        description="是否匿名回复"
    )
    parent_reply_id: Optional[int] = Field(
        None,
        description="父回复ID(用于嵌套回复)"
    )

    @field_validator('content')
    @classmethod
    def validate_content(cls, v: str) -> str:
        """验证内容"""
        v = v.strip()
        if not v:
            raise ValueError('回复内容不能为空')
        return v


class UpdateReplyRequest(BaseModel):
    """更新回复请求"""
    content: Optional[str] = Field(
        None,
        min_length=1,
        max_length=50000,
        description="回复内容"
    )
    is_accepted_answer: Optional[bool] = Field(
        None,
        description="是否为采纳答案(仅问题作者可设置)"
    )


# ============================================================
# 请求模型 - 投票
# ============================================================

class VoteRequest(BaseModel):
    """投票请求"""
    vote_type: VoteType = Field(
        ...,
        description="投票类型: upvote=点赞, downvote=踩"
    )


# ============================================================
# 请求模型 - 搜索
# ============================================================

class SearchRequest(BaseModel):
    """搜索请求"""
    query: str = Field(
        ...,
        min_length=2,
        max_length=100,
        description="搜索关键词"
    )
    post_type: Optional[PostType] = Field(
        None,
        description="筛选主题类型"
    )
    tag: Optional[str] = Field(
        None,
        description="筛选标签"
    )
    author: Optional[str] = Field(
        None,
        description="筛选作者"
    )
    date_from: Optional[datetime] = Field(
        None,
        description="起始日期"
    )
    date_to: Optional[datetime] = Field(
        None,
        description="结束日期"
    )
    sort: SortOrder = Field(
        default=SortOrder.NEWEST,
        description="排序方式"
    )
    page: int = Field(
        default=1,
        ge=1,
        description="页码"
    )
    page_size: int = Field(
        default=20,
        ge=1,
        le=100,
        description="每页数量"
    )


# ============================================================
# 响应模型 - 附件
# ============================================================

class AttachmentResponse(BaseModel):
    """附件响应"""
    model_config = ConfigDict(from_attributes=True)

    attachment_id: int = Field(..., description="附件ID")
    file_name: str = Field(..., description="文件名")
    file_path: str = Field(..., description="文件路径")
    file_size: int = Field(..., description="文件大小(字节)")
    file_type: FileType = Field(..., description="文件类型")
    mime_type: str = Field(..., description="MIME类型")
    created_at: datetime = Field(..., description="上传时间")


# ============================================================
# 响应模型 - 作者信息
# ============================================================

class AuthorInfo(BaseModel):
    """作者信息"""
    username: str = Field(..., description="用户名(匿名时为匿名名称)")
    display_name: str = Field(..., description="显示名称")
    role: str = Field(..., description="角色: student/teacher/admin")
    is_anonymous: bool = Field(..., description="是否匿名")


# ============================================================
# 响应模型 - 回复
# ============================================================

class ReplyResponse(BaseModel):
    """回复响应"""
    model_config = ConfigDict(from_attributes=True)

    reply_id: int = Field(..., description="回复ID")
    post_id: int = Field(..., description="关联主题ID")
    parent_reply_id: Optional[int] = Field(None, description="父回复ID")

    # 作者信息
    author: AuthorInfo = Field(..., description="作者信息")

    # 内容
    content: str = Field(..., description="原始内容")
    content_html: str = Field(..., description="渲染后HTML")

    # 特殊标记
    is_instructor_response: bool = Field(..., description="是否为教师回复")
    is_accepted_answer: bool = Field(..., description="是否为采纳答案")

    # 统计
    upvote_count: int = Field(..., description="点赞数")
    user_vote: Optional[VoteType] = Field(None, description="当前用户的投票状态")

    # 时间
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    # 附件
    attachments: List[AttachmentResponse] = Field(
        default_factory=list,
        description="附件列表"
    )

    # 子回复(嵌套)
    replies: List["ReplyResponse"] = Field(
        default_factory=list,
        description="子回复列表"
    )


# ============================================================
# 响应模型 - 主题
# ============================================================

class PostResponse(BaseModel):
    """主题响应(列表项)"""
    model_config = ConfigDict(from_attributes=True)

    post_id: int = Field(..., description="主题ID")

    # 作者信息
    author: AuthorInfo = Field(..., description="作者信息")

    # 基本信息
    title: str = Field(..., description="标题")
    content_preview: str = Field(..., description="内容预览(前200字)")
    post_type: PostType = Field(..., description="主题类型")
    visibility: Visibility = Field(..., description="可见性")

    # 状态
    is_pinned: bool = Field(..., description="是否置顶")
    is_locked: bool = Field(..., description="是否锁定")
    is_resolved: bool = Field(..., description="是否已解决")

    # 统计
    view_count: int = Field(..., description="浏览数")
    reply_count: int = Field(..., description="回复数")
    upvote_count: int = Field(..., description="点赞数")
    user_vote: Optional[VoteType] = Field(None, description="当前用户的投票状态")

    # 标签
    tags: List[str] = Field(default_factory=list, description="标签列表")

    # 时间
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    # 是否有教师回复
    has_instructor_response: bool = Field(
        default=False,
        description="是否有教师回复"
    )


class PostDetailResponse(BaseModel):
    """主题详情响应"""
    model_config = ConfigDict(from_attributes=True)

    post_id: int = Field(..., description="主题ID")

    # 作者信息
    author: AuthorInfo = Field(..., description="作者信息")

    # 完整内容
    title: str = Field(..., description="标题")
    content: str = Field(..., description="原始内容")
    content_html: str = Field(..., description="渲染后HTML")
    post_type: PostType = Field(..., description="主题类型")
    visibility: Visibility = Field(..., description="可见性")

    # 状态
    is_pinned: bool = Field(..., description="是否置顶")
    is_locked: bool = Field(..., description="是否锁定")
    is_resolved: bool = Field(..., description="是否已解决")

    # 统计
    view_count: int = Field(..., description="浏览数")
    reply_count: int = Field(..., description="回复数")
    upvote_count: int = Field(..., description="点赞数")
    user_vote: Optional[VoteType] = Field(None, description="当前用户的投票状态")

    # 标签
    tags: List[str] = Field(default_factory=list, description="标签列表")

    # 时间
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")

    # 附件
    attachments: List[AttachmentResponse] = Field(
        default_factory=list,
        description="附件列表"
    )

    # 回复列表
    replies: List[ReplyResponse] = Field(
        default_factory=list,
        description="回复列表"
    )

    # 权限标记
    can_edit: bool = Field(default=False, description="当前用户是否可编辑")
    can_delete: bool = Field(default=False, description="当前用户是否可删除")
    can_reply: bool = Field(default=True, description="当前用户是否可回复")


class PostListResponse(BaseModel):
    """主题列表响应"""
    items: List[PostResponse] = Field(..., description="主题列表")
    pagination: PaginationMeta = Field(..., description="分页信息")


# ============================================================
# 响应模型 - 投票
# ============================================================

class VoteResponse(BaseModel):
    """投票响应"""
    success: bool = Field(..., description="是否成功")
    vote_type: Optional[VoteType] = Field(None, description="当前投票状态")
    upvote_count: int = Field(..., description="当前点赞数")
    downvote_count: int = Field(default=0, description="当前踩数")
    message: str = Field(default="", description="提示信息")


# ============================================================
# 响应模型 - 通知
# ============================================================

class NotificationResponse(BaseModel):
    """通知响应"""
    model_config = ConfigDict(from_attributes=True)

    notification_id: int = Field(..., description="通知ID")
    notification_type: NotificationType = Field(..., description="通知类型")
    title: str = Field(..., description="通知标题")
    message: Optional[str] = Field(None, description="通知内容")

    # 关联信息
    post_id: Optional[int] = Field(None, description="关联主题ID")
    post_title: Optional[str] = Field(None, description="关联主题标题")
    reply_id: Optional[int] = Field(None, description="关联回复ID")
    related_user: Optional[str] = Field(None, description="触发者用户名")

    # 状态
    is_read: bool = Field(..., description="是否已读")
    read_at: Optional[datetime] = Field(None, description="阅读时间")

    # 时间
    created_at: datetime = Field(..., description="创建时间")


class NotificationListResponse(BaseModel):
    """通知列表响应"""
    items: List[NotificationResponse] = Field(..., description="通知列表")
    unread_count: int = Field(..., description="未读数量")
    pagination: PaginationMeta = Field(..., description="分页信息")


# ============================================================
# 响应模型 - 标签
# ============================================================

class TagResponse(BaseModel):
    """标签响应"""
    model_config = ConfigDict(from_attributes=True)

    tag_id: int = Field(..., description="标签ID")
    tag_name: str = Field(..., description="标签名称")
    tag_description: Optional[str] = Field(None, description="标签描述")
    tag_color: str = Field(..., description="标签颜色")
    usage_count: int = Field(..., description="使用次数")


class TagListResponse(BaseModel):
    """标签列表响应"""
    items: List[TagResponse] = Field(..., description="标签列表")


# ============================================================
# 响应模型 - 搜索
# ============================================================

class SearchResponse(BaseModel):
    """搜索响应"""
    items: List[PostResponse] = Field(..., description="搜索结果")
    query: str = Field(..., description="搜索词")
    total_results: int = Field(..., description="结果总数")
    pagination: PaginationMeta = Field(..., description="分页信息")


# ============================================================
# 通用响应
# ============================================================

class SuccessResponse(BaseModel):
    """通用成功响应"""
    success: bool = Field(default=True, description="是否成功")
    message: str = Field(default="操作成功", description="提示信息")
    data: Optional[Dict[str, Any]] = Field(None, description="额外数据")


class ErrorResponse(BaseModel):
    """通用错误响应"""
    success: bool = Field(default=False, description="是否成功")
    error: str = Field(..., description="错误信息")
    error_code: Optional[str] = Field(None, description="错误代码")
    details: Optional[Dict[str, Any]] = Field(None, description="错误详情")


# 解决循环引用
ReplyResponse.model_rebuild()
