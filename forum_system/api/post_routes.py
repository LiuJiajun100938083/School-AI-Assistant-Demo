"""
主题API端点
==========

处理主题相关的所有HTTP请求。
"""

from typing import Optional, Tuple
from fastapi import APIRouter, Depends, Query, HTTPException

# 导入现有的认证依赖
from app.core.dependencies import verify_token

from ..models.schemas import (
    PostType, Visibility, SortOrder, VoteType,
    CreatePostRequest, UpdatePostRequest, VoteRequest,
    PostResponse, PostDetailResponse, PostListResponse,
    VoteResponse, SuccessResponse,
    TagListResponse, SearchResponse
)
from ..service.post_service import post_service
from ..service.search_service import search_service
from ..service.notification_service import notification_service

router = APIRouter()


# ========== 主题CRUD ==========

@router.post("/posts", response_model=PostDetailResponse, summary="创建主题")
async def create_post(
    request: CreatePostRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    创建新主题

    - **title**: 标题 (5-255字符)
    - **content**: 内容 (Markdown格式)
    - **post_type**: 类型 (discussion/question/announcement)
    - **visibility**: 可见性 (public/private)
    - **is_anonymous**: 是否匿名
    - **tags**: 标签列表

    权限：
    - 学生不能创建announcement
    - 学生不能创建private可见性的主题
    - 学生发布内容需通过 AI 审核（必须与 AI 相关）
    """
    username, role = user_info

    # AI 内容审核：学生发布需要审核，教师/管理员跳过
    if role not in ("teacher", "admin"):
        from ..service.content_moderator import check_content_ai_related
        approved, reason = await check_content_ai_related(
            title=request.title,
            content=request.content,
        )
        if not approved:
            raise HTTPException(status_code=403, detail=reason)

    return post_service.create_post(username, role, request)


@router.get("/posts", response_model=PostListResponse, summary="获取主题列表")
async def list_posts(
    post_type: Optional[PostType] = Query(None, description="筛选类型"),
    visibility: Optional[Visibility] = Query(None, description="筛选可见性(仅教师)"),
    tag: Optional[str] = Query(None, description="筛选标签"),
    author: Optional[str] = Query(None, description="筛选作者"),
    sort: SortOrder = Query(SortOrder.NEWEST, description="排序方式"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取主题列表

    支持筛选和排序：
    - 按类型筛选 (discussion/question/announcement)
    - 按标签筛选
    - 按作者筛选
    - 排序方式 (newest/oldest/most_upvoted/most_replied/most_viewed)

    权限：
    - 学生只能看到public可见性的主题
    - 教师/管理员可以看到所有主题
    """
    username, role = user_info
    return post_service.list_posts(
        username=username,
        role=role,
        post_type=post_type,
        visibility=visibility,
        tag=tag,
        author=author,
        sort=sort,
        page=page,
        page_size=page_size
    )


@router.get("/posts/{post_id}", response_model=PostDetailResponse, summary="获取主题详情")
async def get_post(
    post_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取主题详情

    返回：
    - 完整的主题内容
    - 所有回复
    - 附件列表
    - 当前用户的投票状态
    - 权限标记 (can_edit, can_delete, can_reply)
    """
    username, role = user_info
    return post_service.get_post_detail(post_id, username, role)


@router.put("/posts/{post_id}", response_model=PostDetailResponse, summary="更新主题")
async def update_post(
    post_id: int,
    request: UpdatePostRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    更新主题

    可更新字段：
    - title, content, visibility, tags
    - is_pinned (仅教师)
    - is_locked (仅教师)
    - is_resolved

    权限：
    - 作者可以编辑自己的主题
    - 教师/管理员可以编辑任何主题
    """
    username, role = user_info
    return post_service.update_post(post_id, username, role, request)


@router.delete("/posts/{post_id}", response_model=SuccessResponse, summary="删除主题")
async def delete_post(
    post_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    删除主题（软删除）

    权限：
    - 作者可以删除自己的主题
    - 教师/管理员可以删除任何主题
    """
    username, role = user_info
    post_service.delete_post(post_id, username, role)
    return SuccessResponse(message="主题已删除")


# ========== 投票 ==========

@router.post("/posts/{post_id}/vote", response_model=VoteResponse, summary="投票主题")
async def vote_post(
    post_id: int,
    request: VoteRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    对主题投票

    - 重复投票相同类型会取消投票
    - 投票不同类型会更改投票
    """
    username, role = user_info
    return post_service.vote_post(post_id, username, role, request.vote_type)


# ========== 搜索 ==========

@router.get("/search", response_model=SearchResponse, summary="搜索主题")
async def search_posts(
    q: str = Query(..., min_length=2, description="搜索关键词"),
    post_type: Optional[PostType] = Query(None, description="筛选类型"),
    tag: Optional[str] = Query(None, description="筛选标签"),
    sort: SortOrder = Query(SortOrder.NEWEST, description="排序方式"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    全文搜索主题

    搜索范围包括标题和内容。
    支持筛选类型和标签。
    """
    username, role = user_info
    return search_service.search(
        query=q,
        username=username,
        role=role,
        post_type=post_type,
        tag=tag,
        sort=sort,
        page=page,
        page_size=page_size
    )


@router.get("/trending", response_model=list[PostResponse], summary="热门主题")
async def get_trending_posts(
    days: int = Query(7, ge=1, le=30, description="时间范围(天)"),
    limit: int = Query(10, ge=1, le=50, description="数量限制"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取热门主题

    根据浏览数、回复数、点赞数综合计算热度。
    """
    username, role = user_info
    return search_service.get_trending(username, role, days, limit)


# ========== 标签 ==========

@router.get("/tags", response_model=TagListResponse, summary="获取标签列表")
async def get_tags(
    limit: int = Query(50, ge=1, le=100, description="数量限制"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取标签列表

    按使用次数排序。
    """
    return search_service.get_tags(limit)


@router.get("/tags/suggest", response_model=list[str], summary="标签建议")
async def suggest_tags(
    prefix: str = Query(..., min_length=1, description="输入前缀"),
    limit: int = Query(10, ge=1, le=20, description="建议数量"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    标签自动完成建议
    """
    return search_service.suggest_tags(prefix, limit)


# ========== 通知 ==========

@router.get("/notifications", summary="获取通知列表")
async def get_notifications(
    unread_only: bool = Query(False, description="只获取未读"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取用户的通知列表
    """
    username, role = user_info
    return notification_service.get_notifications(
        username=username,
        unread_only=unread_only,
        page=page,
        page_size=page_size
    )


@router.get("/notifications/unread-count", summary="获取未读通知数")
async def get_unread_count(
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取未读通知数量
    """
    username, role = user_info
    count = notification_service.get_unread_count(username)
    return {"unread_count": count}


@router.post("/notifications/{notification_id}/read", response_model=SuccessResponse, summary="标记通知已读")
async def mark_notification_read(
    notification_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    标记通知为已读
    """
    username, role = user_info
    notification_service.mark_as_read(notification_id, username)
    return SuccessResponse(message="已标记为已读")


@router.post("/notifications/mark-all-read", response_model=SuccessResponse, summary="标记所有已读")
async def mark_all_notifications_read(
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    标记所有通知为已读
    """
    username, role = user_info
    count = notification_service.mark_all_as_read(username)
    return SuccessResponse(message=f"已标记 {count} 条通知为已读")


@router.delete("/notifications/{notification_id}", response_model=SuccessResponse, summary="删除通知")
async def delete_notification(
    notification_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    删除通知
    """
    username, role = user_info
    notification_service.delete_notification(notification_id, username)
    return SuccessResponse(message="通知已删除")
