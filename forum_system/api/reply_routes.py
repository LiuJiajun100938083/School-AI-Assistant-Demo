"""
回复API端点
==========

处理回复相关的所有HTTP请求。
"""

from typing import List, Tuple
from fastapi import APIRouter, Depends, HTTPException

# 导入现有的认证依赖
from app.core.dependencies import verify_token

from ..models.schemas import (
    VoteType,
    CreateReplyRequest, UpdateReplyRequest, VoteRequest,
    ReplyResponse, VoteResponse, SuccessResponse
)
from ..service.reply_service import reply_service

router = APIRouter()


# ========== 回复CRUD ==========

@router.post("/posts/{post_id}/replies", response_model=ReplyResponse, summary="创建回复")
async def create_reply(
    post_id: int,
    request: CreateReplyRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    回复主题

    - **content**: 回复内容 (Markdown格式)
    - **is_anonymous**: 是否匿名
    - **parent_reply_id**: 父回复ID (用于嵌套回复，可选)

    特性：
    - 教师回复会自动标记为 is_instructor_response
    - 支持@提及其他用户，会自动发送通知
    - 学生回复内容需通过 AI 审核（必须与 AI 相关）
    """
    username, role = user_info

    # AI 内容审核：学生回复需要审核，教师/管理员跳过
    if role not in ("teacher", "admin"):
        from ..service.content_moderator import check_content_ai_related
        approved, reason = await check_content_ai_related(
            title="",
            content=request.content,
        )
        if not approved:
            raise HTTPException(status_code=403, detail=reason)

    return reply_service.create_reply(post_id, username, role, request)


@router.get("/posts/{post_id}/replies", response_model=List[ReplyResponse], summary="获取主题回复")
async def get_post_replies(
    post_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取主题的所有回复

    返回按以下顺序排列的回复：
    1. 教师回复优先
    2. 采纳的答案优先
    3. 按时间顺序
    """
    username, role = user_info
    return reply_service.get_post_replies(post_id, username, role)


@router.get("/replies/{reply_id}", response_model=ReplyResponse, summary="获取单个回复")
async def get_reply(
    reply_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    获取单个回复详情
    """
    username, role = user_info
    return reply_service.get_reply(reply_id, username)


@router.put("/replies/{reply_id}", response_model=ReplyResponse, summary="更新回复")
async def update_reply(
    reply_id: int,
    request: UpdateReplyRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    更新回复

    可更新字段：
    - content: 回复内容
    - is_accepted_answer: 是否采纳为答案 (仅主题作者可设置)

    权限：
    - 作者可以编辑自己的回复
    - 教师/管理员可以编辑任何回复
    """
    username, role = user_info
    return reply_service.update_reply(reply_id, username, role, request)


@router.delete("/replies/{reply_id}", response_model=SuccessResponse, summary="删除回复")
async def delete_reply(
    reply_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    删除回复（软删除）

    权限：
    - 作者可以删除自己的回复
    - 教师/管理员可以删除任何回复
    """
    username, role = user_info
    reply_service.delete_reply(reply_id, username, role)
    return SuccessResponse(message="回复已删除")


# ========== 投票 ==========

@router.post("/replies/{reply_id}/vote", response_model=VoteResponse, summary="投票回复")
async def vote_reply(
    reply_id: int,
    request: VoteRequest,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    对回复投票

    - 重复投票相同类型会取消投票
    - 投票不同类型会更改投票
    """
    username, role = user_info
    return reply_service.vote_reply(reply_id, username, request.vote_type)


# ========== 采纳答案 ==========

@router.post("/replies/{reply_id}/accept", response_model=ReplyResponse, summary="采纳为答案")
async def accept_answer(
    reply_id: int,
    user_info: Tuple[str, str] = Depends(verify_token)
):
    """
    将回复采纳为答案

    权限：
    - 仅主题作者或教师/管理员可以采纳
    """
    username, role = user_info
    request = UpdateReplyRequest(is_accepted_answer=True)
    return reply_service.update_reply(reply_id, username, role, request)
