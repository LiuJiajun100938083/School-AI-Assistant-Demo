"""
回复业务逻辑层
=============

处理回复相关的所有业务逻辑。
"""

import logging
import random
import string
from typing import Dict, List, Optional

from fastapi import HTTPException

from ..models.schemas import (
    VoteType,
    CreateReplyRequest, UpdateReplyRequest,
    ReplyResponse, AuthorInfo, VoteResponse
)
from ..dal.post_dal import post_dal
from ..dal.reply_dal import reply_dal
from ..dal.vote_dal import vote_dal
from ..dal.notification_dal import notification_dal
from ..dal.attachment_dal import attachment_dal
from ..utils.sanitizers import ContentSanitizer
from ..utils.markdown_parser import render_markdown
from ..config import forum_config

logger = logging.getLogger(__name__)


class ReplyService:
    """回复业务服务"""

    # ========== 创建回复 ==========

    def create_reply(
        self,
        post_id: int,
        username: str,
        role: str,
        request: CreateReplyRequest
    ) -> ReplyResponse:
        """
        创建回复

        Args:
            post_id: 主题ID
            username: 用户名
            role: 用户角色
            request: 创建请求

        Returns:
            创建的回复

        Raises:
            HTTPException: 主题不存在、已锁定或无权访问
        """
        # 检查主题
        post = post_dal.get_by_id_with_permission(post_id, role)
        if not post:
            raise HTTPException(status_code=404, detail="主题不存在或无权访问")

        # 检查是否锁定
        if post['is_locked']:
            raise HTTPException(status_code=403, detail="该主题已被锁定，无法回复")

        # 处理匿名
        anonymous_name = None
        if request.is_anonymous:
            anonymous_name = self._generate_anonymous_name()

        # 渲染Markdown
        content_html = render_markdown(request.content)

        # 判断是否为教师回复
        is_instructor = role in ('teacher', 'admin')

        # 创建回复
        reply_id = reply_dal.create_reply(
            post_id=post_id,
            author_username=username,
            content=request.content,
            content_html=content_html,
            is_anonymous=request.is_anonymous,
            anonymous_name=anonymous_name,
            is_instructor_response=is_instructor,
            parent_reply_id=request.parent_reply_id
        )

        # 更新主题的回复数
        post_dal.increment_reply_count(post_id)

        logger.info(f"用户 {username} 在主题 {post_id} 创建了回复 {reply_id}")

        # 发送通知
        self._send_notifications(post_id, reply_id, username, request.content, is_instructor)

        # 获取并返回创建的回复
        return self.get_reply(reply_id, username)

    # ========== 获取回复 ==========

    def get_reply(self, reply_id: int, username: str) -> ReplyResponse:
        """获取单个回复"""
        reply = reply_dal.get_by_id(reply_id)
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")

        # 获取投票状态
        user_vote = vote_dal.get_user_vote_for_reply(reply_id, username)

        # 获取附件
        attachments_data = attachment_dal.get_reply_attachments(reply_id)

        return self._build_reply_response(reply, user_vote, attachments_data)

    def get_post_replies(
        self,
        post_id: int,
        username: str,
        role: str
    ) -> List[ReplyResponse]:
        """获取主题的所有回复"""
        # 检查主题权限
        post = post_dal.get_by_id_with_permission(post_id, role)
        if not post:
            raise HTTPException(status_code=404, detail="主题不存在或无权访问")

        # 获取回复
        replies_data = reply_dal.get_replies_by_post(post_id)

        # 批量获取投票状态
        reply_ids = [r['reply_id'] for r in replies_data]
        reply_votes = vote_dal.get_user_votes_for_replies(reply_ids, username)

        # 构建响应
        replies = []
        for reply in replies_data:
            attachments_data = attachment_dal.get_reply_attachments(reply['reply_id'])
            replies.append(self._build_reply_response(
                reply,
                reply_votes.get(reply['reply_id']),
                attachments_data
            ))

        return replies

    # ========== 更新回复 ==========

    def update_reply(
        self,
        reply_id: int,
        username: str,
        role: str,
        request: UpdateReplyRequest
    ) -> ReplyResponse:
        """
        更新回复

        Raises:
            HTTPException: 无权限
        """
        reply = reply_dal.get_by_id(reply_id)
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")

        # 权限检查
        # - 管理员可以编辑任何评论
        # - 老师可以编辑任何评论（版主权限）
        # - 学生只能编辑自己的评论
        is_author = reply['author_username'] == username
        is_moderator = role in ('teacher', 'admin')

        if not (is_author or is_moderator):
            raise HTTPException(status_code=403, detail="无权编辑此回复")

        # 准备更新数据
        content_html = None
        if request.content:
            content_html = render_markdown(request.content)

        # 采纳答案只有主题作者可以设置
        if request.is_accepted_answer is not None:
            post_id = reply['post_id']
            post_author = post_dal.get_author(post_id)
            if post_author != username and role not in ('teacher', 'admin'):
                raise HTTPException(status_code=403, detail="只有主题作者可以采纳答案")

            if request.is_accepted_answer:
                reply_dal.set_accepted_answer(reply_id, post_id)
        else:
            reply_dal.update_reply(
                reply_id=reply_id,
                content=request.content,
                content_html=content_html
            )

        logger.info(f"用户 {username} 更新了回复 {reply_id}")

        return self.get_reply(reply_id, username)

    # ========== 删除回复 ==========

    def delete_reply(
        self,
        reply_id: int,
        username: str,
        role: str
    ) -> bool:
        """
        删除回复（软删除）

        Raises:
            HTTPException: 无权限
        """
        reply = reply_dal.get_by_id(reply_id)
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")

        # 权限检查
        # - 管理员可以删除任何评论
        # - 老师可以删除任何评论（版主权限）
        # - 学生只能删除自己的评论
        is_author = reply['author_username'] == username
        is_moderator = role in ('teacher', 'admin')

        if not (is_author or is_moderator):
            raise HTTPException(status_code=403, detail="无权删除此回复")

        # 获取主题ID
        post_id = reply['post_id']

        # 软删除
        reply_dal.delete(reply_id, soft=True)

        # 更新主题的回复数
        post_dal.decrement_reply_count(post_id)

        logger.info(f"用户 {username} 删除了回复 {reply_id}")

        return True

    # ========== 投票 ==========

    def vote_reply(
        self,
        reply_id: int,
        username: str,
        vote_type: VoteType
    ) -> VoteResponse:
        """对回复投票"""
        # 检查回复存在
        reply = reply_dal.get_by_id(reply_id)
        if not reply:
            raise HTTPException(status_code=404, detail="回复不存在")

        # 执行投票
        result = vote_dal.vote_reply(reply_id, username, vote_type)

        # 更新计数
        if vote_type == VoteType.UPVOTE:
            if result == 'created':
                reply_dal.increment_upvote_count(reply_id)
            elif result == 'removed':
                reply_dal.decrement_upvote_count(reply_id)

        # 获取最新状态
        current_vote = vote_dal.get_user_vote_for_reply(reply_id, username)
        vote_counts = vote_dal.count_reply_votes(reply_id)

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

    def _build_reply_response(
        self,
        reply: Dict,
        user_vote: Optional[VoteType],
        attachments_data: List[Dict] = None
    ) -> ReplyResponse:
        """构建回复响应"""
        from ..models.schemas import FileType, AttachmentResponse

        # 作者信息
        author = AuthorInfo(
            username=reply.get('anonymous_name') or reply['author_username'],
            display_name=reply.get('anonymous_name') or reply['author_username'],
            role=self._get_user_role(reply['author_username']),
            is_anonymous=reply['is_anonymous']
        )

        # 附件
        attachments = []
        if attachments_data:
            for a in attachments_data:
                attachments.append(AttachmentResponse(
                    attachment_id=a['attachment_id'],
                    file_name=a['file_name'],
                    file_path=a['file_path'],
                    file_size=a['file_size'],
                    file_type=FileType(a['file_type']),
                    mime_type=a['mime_type'],
                    created_at=a['created_at']
                ))

        return ReplyResponse(
            reply_id=reply['reply_id'],
            post_id=reply['post_id'],
            parent_reply_id=reply.get('parent_reply_id'),
            author=author,
            content=reply['content'],
            content_html=reply['content_html'] or '',
            is_instructor_response=reply['is_instructor_response'],
            is_accepted_answer=reply['is_accepted_answer'],
            upvote_count=reply['upvote_count'],
            user_vote=user_vote,
            created_at=reply['created_at'],
            updated_at=reply['updated_at'],
            attachments=attachments,
            replies=[]
        )

    def _send_notifications(
        self,
        post_id: int,
        reply_id: int,
        replier_username: str,
        content: str,
        is_instructor: bool
    ):
        """发送回复通知"""
        try:
            # 通知主题作者
            notification_dal.notify_post_author(
                post_id=post_id,
                reply_id=reply_id,
                replier_username=replier_username,
                is_instructor=is_instructor
            )

            # 提取@提及并通知
            mentions = ContentSanitizer.extract_mentions(content)
            if mentions:
                notification_dal.notify_mentioned_users(
                    usernames=mentions,
                    post_id=post_id,
                    reply_id=reply_id,
                    mentioner_username=replier_username
                )
        except Exception as e:
            logger.error(f"发送通知失败: {e}")


# 单例实例
reply_service = ReplyService()
