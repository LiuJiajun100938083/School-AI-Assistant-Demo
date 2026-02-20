"""
主题业务逻辑层
=============

处理主题相关的所有业务逻辑，包括权限验证、数据转换、通知触发等。
"""

import logging
import random
import string
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from fastapi import HTTPException

from ..models.schemas import (
    PostType, Visibility, VoteType, SortOrder,
    CreatePostRequest, UpdatePostRequest,
    PostResponse, PostDetailResponse, PostListResponse,
    AuthorInfo, AttachmentResponse, ReplyResponse,
    PaginationMeta, VoteResponse
)
from ..dal.post_dal import post_dal
from ..dal.reply_dal import reply_dal
from ..dal.vote_dal import vote_dal
from ..dal.attachment_dal import attachment_dal
from ..dal.notification_dal import notification_dal
from ..utils.sanitizers import sanitize_html, ContentSanitizer
from ..utils.markdown_parser import render_markdown
from ..utils.pagination import Paginator
from ..config import forum_config

logger = logging.getLogger(__name__)


class PostService:
    """主题业务服务"""

    # ========== 创建主题 ==========

    def create_post(
        self,
        username: str,
        role: str,
        request: CreatePostRequest
    ) -> PostDetailResponse:
        """
        创建主题

        Args:
            username: 用户名
            role: 用户角色
            request: 创建请求

        Returns:
            创建的主题详情

        Raises:
            HTTPException: 权限不足
        """
        # 权限检查：学生不能发布公告
        if request.post_type == PostType.ANNOUNCEMENT and role not in forum_config.ANNOUNCEMENT_ROLES:
            raise HTTPException(
                status_code=403,
                detail="学生不能发布公告"
            )

        # 权限检查：学生不能设置private
        if request.visibility == Visibility.PRIVATE and role not in forum_config.PRIVATE_POST_ROLES:
            raise HTTPException(
                status_code=403,
                detail="学生不能创建仅教师可见的讨论"
            )

        # 处理匿名
        anonymous_name = None
        if request.is_anonymous:
            anonymous_name = self._generate_anonymous_name()

        # 渲染Markdown
        content_html = render_markdown(request.content)

        # 创建主题
        post_id = post_dal.create_post(
            author_username=username,
            title=request.title,
            content=request.content,
            content_html=content_html,
            post_type=request.post_type,
            visibility=request.visibility,
            is_anonymous=request.is_anonymous,
            anonymous_name=anonymous_name,
            tags=request.tags
        )

        logger.info(f"用户 {username} 创建了主题 {post_id}")

        # 返回创建的主题
        return self.get_post_detail(post_id, username, role)

    # ========== 获取主题 ==========

    def get_post_detail(
        self,
        post_id: int,
        username: str,
        role: str
    ) -> PostDetailResponse:
        """
        获取主题详情

        Args:
            post_id: 主题ID
            username: 当前用户名
            role: 当前用户角色

        Returns:
            主题详情

        Raises:
            HTTPException: 主题不存在或无权访问
        """
        # 获取主题（带权限检查）
        post = post_dal.get_by_id_with_permission(post_id, role)

        if not post:
            raise HTTPException(
                status_code=404,
                detail="主题不存在或无权访问"
            )

        # 增加浏览次数
        post_dal.increment_view_count(post_id)

        # 获取回复
        replies_data = reply_dal.get_replies_by_post(post_id)

        # 获取附件
        attachments_data = attachment_dal.get_post_attachments(post_id)

        # 获取用户的投票状态
        user_vote = vote_dal.get_user_vote_for_post(post_id, username)

        # 批量获取回复的投票状态
        reply_ids = [r['reply_id'] for r in replies_data]
        reply_votes = vote_dal.get_user_votes_for_replies(reply_ids, username)

        # 构建作者信息
        author = self._build_author_info(
            post['author_username'],
            post['is_anonymous'],
            post.get('anonymous_name'),
            self._get_user_role(post['author_username'])
        )

        # 构建回复列表
        replies = self._build_reply_list(replies_data, reply_votes, username)

        # 构建附件列表
        attachments = [self._build_attachment_response(a) for a in attachments_data]

        # 权限标记
        is_author = post['author_username'] == username
        is_privileged = role in ('teacher', 'admin')
        can_edit = is_author or is_privileged
        can_delete = is_author or is_privileged
        can_reply = not post['is_locked']

        return PostDetailResponse(
            post_id=post['post_id'],
            author=author,
            title=post['title'],
            content=post['content'],
            content_html=post['content_html'] or '',
            post_type=PostType(post['post_type']),
            visibility=Visibility(post['visibility']),
            is_pinned=post['is_pinned'],
            is_locked=post['is_locked'],
            is_resolved=post['is_resolved'],
            view_count=post['view_count'] + 1,  # 包含本次浏览
            reply_count=post['reply_count'],
            upvote_count=post['upvote_count'],
            user_vote=user_vote,
            tags=self._parse_tags(post.get('tags')),
            created_at=post['created_at'],
            updated_at=post['updated_at'],
            attachments=attachments,
            replies=replies,
            can_edit=can_edit,
            can_delete=can_delete,
            can_reply=can_reply
        )

    def list_posts(
        self,
        username: str,
        role: str,
        post_type: Optional[PostType] = None,
        visibility: Optional[Visibility] = None,
        tag: Optional[str] = None,
        author: Optional[str] = None,
        sort: SortOrder = SortOrder.NEWEST,
        page: int = 1,
        page_size: int = 20
    ) -> PostListResponse:
        """
        获取主题列表

        Returns:
            主题列表响应
        """
        # 获取数据
        posts, total = post_dal.list_posts(
            user_role=role,
            post_type=post_type,
            visibility=visibility,
            tag=tag,
            author=author,
            sort=sort,
            page=page,
            page_size=page_size
        )

        # 批量获取投票状态
        post_ids = [p['post_id'] for p in posts]
        user_votes = vote_dal.get_user_votes_for_posts(post_ids, username)

        # 构建响应
        items = []
        for post in posts:
            items.append(self._build_post_response(post, user_votes.get(post['post_id'])))

        # 分页信息
        pagination = Paginator.create_meta(page, page_size, total)

        return PostListResponse(items=items, pagination=pagination)

    # ========== 更新主题 ==========

    def update_post(
        self,
        post_id: int,
        username: str,
        role: str,
        request: UpdatePostRequest
    ) -> PostDetailResponse:
        """
        更新主题

        Raises:
            HTTPException: 无权限或主题不存在
        """
        # 获取主题
        post = post_dal.get_by_id_with_permission(post_id, role)
        if not post:
            raise HTTPException(status_code=404, detail="主题不存在")

        # 权限检查
        # - 管理员可以编辑任何主题
        # - 老师只能编辑自己的主题
        # - 学生只能编辑自己的主题
        is_author = post['author_username'] == username
        is_admin = role == 'admin'

        if not (is_author or is_admin):
            raise HTTPException(status_code=403, detail="无权编辑此主题")

        # 准备更新数据
        content_html = None
        if request.content:
            content_html = render_markdown(request.content)

        # 权限检查：置顶和锁定只有教师可以操作
        if request.is_pinned is not None and role not in forum_config.PIN_POST_ROLES:
            raise HTTPException(status_code=403, detail="无权置顶主题")

        if request.is_locked is not None and role not in forum_config.LOCK_POST_ROLES:
            raise HTTPException(status_code=403, detail="无权锁定主题")

        # 更新
        post_dal.update_post(
            post_id=post_id,
            title=request.title,
            content=request.content,
            content_html=content_html,
            visibility=request.visibility,
            tags=request.tags,
            is_pinned=request.is_pinned,
            is_locked=request.is_locked,
            is_resolved=request.is_resolved
        )

        logger.info(f"用户 {username} 更新了主题 {post_id}")

        return self.get_post_detail(post_id, username, role)

    # ========== 删除主题 ==========

    def delete_post(
        self,
        post_id: int,
        username: str,
        role: str
    ) -> bool:
        """
        删除主题（软删除）

        Raises:
            HTTPException: 无权限
        """
        # 获取作者
        author = post_dal.get_author(post_id)
        if not author:
            raise HTTPException(status_code=404, detail="主题不存在")

        # 权限检查
        # - 管理员可以删除任何主题
        # - 老师只能删除自己的主题
        # - 学生只能删除自己的主题
        is_author = author == username
        is_admin = role == 'admin'

        if not (is_author or is_admin):
            raise HTTPException(status_code=403, detail="无权删除此主题")

        # 软删除
        post_dal.delete(post_id, soft=True)
        logger.info(f"用户 {username} 删除了主题 {post_id}")

        return True

    # ========== 投票 ==========

    def vote_post(
        self,
        post_id: int,
        username: str,
        role: str,
        vote_type: VoteType
    ) -> VoteResponse:
        """
        对主题投票

        Returns:
            投票结果
        """
        # 检查主题存在
        post = post_dal.get_by_id_with_permission(post_id, role)
        if not post:
            raise HTTPException(status_code=404, detail="主题不存在")

        # 执行投票
        result = vote_dal.vote_post(post_id, username, vote_type)

        # 更新计数
        if vote_type == VoteType.UPVOTE:
            if result == 'created':
                post_dal.increment_upvote_count(post_id)
            elif result == 'removed':
                post_dal.decrement_upvote_count(post_id)

        # 获取最新状态
        current_vote = vote_dal.get_user_vote_for_post(post_id, username)
        vote_counts = vote_dal.count_post_votes(post_id)

        # 消息
        messages = {
            'created': '投票成功',
            'updated': '投票已更改',
            'removed': '已取消投票'
        }

        return VoteResponse(
            success=True,
            vote_type=current_vote,
            upvote_count=vote_counts['upvote'],
            downvote_count=vote_counts['downvote'],
            message=messages.get(result, '')
        )

    # ========== 搜索 ==========

    def search_posts(
        self,
        query: str,
        username: str,
        role: str,
        post_type: Optional[PostType] = None,
        tag: Optional[str] = None,
        sort: SortOrder = SortOrder.NEWEST,
        page: int = 1,
        page_size: int = 20
    ) -> PostListResponse:
        """搜索主题"""
        posts, total = post_dal.search(
            query=query,
            user_role=role,
            post_type=post_type,
            tag=tag,
            sort=sort,
            page=page,
            page_size=page_size
        )

        # 批量获取投票状态
        post_ids = [p['post_id'] for p in posts]
        user_votes = vote_dal.get_user_votes_for_posts(post_ids, username)

        # 构建响应
        items = [
            self._build_post_response(post, user_votes.get(post['post_id']))
            for post in posts
        ]

        pagination = Paginator.create_meta(page, page_size, total)

        return PostListResponse(items=items, pagination=pagination)

    def get_trending_posts(
        self,
        username: str,
        role: str,
        days: int = 7,
        limit: int = 10
    ) -> List[PostResponse]:
        """获取热门主题"""
        posts = post_dal.get_trending(role, days, limit)

        post_ids = [p['post_id'] for p in posts]
        user_votes = vote_dal.get_user_votes_for_posts(post_ids, username)

        return [
            self._build_post_response(post, user_votes.get(post['post_id']))
            for post in posts
        ]

    # ========== 辅助方法 ==========

    def _generate_anonymous_name(self) -> str:
        """生成匿名名称"""
        suffix = ''.join(random.choices(string.ascii_uppercase + string.digits, k=3))
        return f"{forum_config.ANONYMOUS_PREFIX}{suffix}"

    def _get_user_role(self, username: str) -> str:
        """获取用户角色"""
        try:
            from app.bridge import get_db
            with get_db() as conn:
                cursor = conn.cursor()
                cursor.execute("SELECT role FROM users WHERE username = %s", (username,))
                row = cursor.fetchone()
                if row:
                    return row.get('role', 'student') if isinstance(row, dict) else row[0]
        except Exception:
            pass
        return 'student'

    def _build_author_info(
        self,
        username: str,
        is_anonymous: bool,
        anonymous_name: Optional[str],
        role: str
    ) -> AuthorInfo:
        """构建作者信息"""
        if is_anonymous:
            return AuthorInfo(
                username=anonymous_name or forum_config.ANONYMOUS_PREFIX,
                display_name=anonymous_name or forum_config.ANONYMOUS_PREFIX,
                role=role,
                is_anonymous=True
            )
        else:
            return AuthorInfo(
                username=username,
                display_name=username,
                role=role,
                is_anonymous=False
            )

    def _build_post_response(
        self,
        post: Dict,
        user_vote: Optional[VoteType]
    ) -> PostResponse:
        """构建主题列表项响应"""
        author = self._build_author_info(
            post['author_username'],
            post['is_anonymous'],
            post.get('anonymous_name'),
            self._get_user_role(post['author_username'])
        )

        # 内容预览
        content_preview = ContentSanitizer.create_content_preview(post['content'], 200)

        # 检查是否有教师回复
        has_instructor = post_dal.has_instructor_response(post['post_id'])

        return PostResponse(
            post_id=post['post_id'],
            author=author,
            title=post['title'],
            content_preview=content_preview,
            post_type=PostType(post['post_type']),
            visibility=Visibility(post['visibility']),
            is_pinned=post['is_pinned'],
            is_locked=post['is_locked'],
            is_resolved=post['is_resolved'],
            view_count=post['view_count'],
            reply_count=post['reply_count'],
            upvote_count=post['upvote_count'],
            user_vote=user_vote,
            tags=self._parse_tags(post.get('tags')),
            created_at=post['created_at'],
            updated_at=post['updated_at'],
            has_instructor_response=has_instructor
        )

    def _build_reply_list(
        self,
        replies_data: List[Dict],
        reply_votes: Dict[int, VoteType],
        username: str
    ) -> List[ReplyResponse]:
        """构建回复列表"""
        replies = []
        for reply in replies_data:
            author = self._build_author_info(
                reply['author_username'],
                reply['is_anonymous'],
                reply.get('anonymous_name'),
                self._get_user_role(reply['author_username'])
            )

            # 获取回复的附件
            attachments_data = attachment_dal.get_reply_attachments(reply['reply_id'])
            attachments = [self._build_attachment_response(a) for a in attachments_data]

            replies.append(ReplyResponse(
                reply_id=reply['reply_id'],
                post_id=reply['post_id'],
                parent_reply_id=reply.get('parent_reply_id'),
                author=author,
                content=reply['content'],
                content_html=reply['content_html'] or '',
                is_instructor_response=reply['is_instructor_response'],
                is_accepted_answer=reply['is_accepted_answer'],
                upvote_count=reply['upvote_count'],
                user_vote=reply_votes.get(reply['reply_id']),
                created_at=reply['created_at'],
                updated_at=reply['updated_at'],
                attachments=attachments,
                replies=[]  # 嵌套回复暂不处理
            ))

        return replies

    def _build_attachment_response(self, attachment: Dict) -> AttachmentResponse:
        """构建附件响应"""
        from ..models.schemas import FileType
        return AttachmentResponse(
            attachment_id=attachment['attachment_id'],
            file_name=attachment['file_name'],
            file_path=attachment['file_path'],
            file_size=attachment['file_size'],
            file_type=FileType(attachment['file_type']),
            mime_type=attachment['mime_type'],
            created_at=attachment['created_at']
        )

    def _parse_tags(self, tags) -> List[str]:
        """解析标签"""
        if not tags:
            return []
        if isinstance(tags, str):
            import json
            try:
                return json.loads(tags)
            except:
                return []
        if isinstance(tags, list):
            return tags
        return []


# 单例实例
post_service = PostService()
