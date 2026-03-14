"""
共享资源库路由 — ResourceLibraryRouter
======================================
处理共享资源库相关的 HTTP 端点:

管理员 — 分组管理:
  POST   /api/resource-library/groups                     创建分组
  GET    /api/resource-library/groups                     分组列表
  GET    /api/resource-library/groups/{group_id}          分组详情 (含成员)
  PUT    /api/resource-library/groups/{group_id}          更新分组
  DELETE /api/resource-library/groups/{group_id}          删除分组
  POST   /api/resource-library/groups/{group_id}/members  添加成员
  DELETE /api/resource-library/groups/{group_id}/members/{username}  移除成员

教师 — 个人课案:
  GET    /api/resource-library/personal-plans             个人课案列表 (跨课堂)

教师 — 分享:
  POST   /api/resource-library/shares                     分享课案
  GET    /api/resource-library/shares/my                  我的分享
  GET    /api/resource-library/shares/{share_id}          共享资源详情
  DELETE /api/resource-library/shares/{share_id}          取消分享

教师 — 浏览:
  GET    /api/resource-library/shares/group/{group_id}    组内共享资源
  GET    /api/resource-library/shares/school              全校共享资源
  GET    /api/resource-library/my-groups                  我的分组

教师 — 克隆:
  POST   /api/resource-library/clone                      克隆课案到课堂
"""

import asyncio
import logging
from typing import Tuple

from fastapi import APIRouter, Depends, Query

from app.core.dependencies import (
    get_current_user,
    require_admin,
    require_teacher,
)
from app.core.exceptions import AppException
from app.core.responses import error_response, paginated_response, success_response
from app.domains.resource_library.schemas import (
    AddMemberRequest,
    ClonePlanRequest,
    CreateGroupRequest,
    SharePlanRequest,
    UpdateGroupRequest,
)
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["共享资源库"])


# ====================================================================== #
#  分组管理 (管理员)                                                        #
# ====================================================================== #

@router.post("/api/resource-library/groups")
async def create_group(
    body: CreateGroupRequest,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """创建教师分组"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        group = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.create_group(
                group_name=body.group_name,
                description=body.description,
                admin_username=username,
            ),
        )
        return success_response(group, "分组创建成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/resource-library/groups")
async def list_groups(
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """列出所有分组"""
    loop = asyncio.get_event_loop()
    groups = await loop.run_in_executor(
        None, lambda: get_services().resource_library.list_groups(),
    )
    return success_response(groups)


@router.get("/api/resource-library/groups/{group_id}")
async def get_group_detail(
    group_id: str,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """获取分组详情 (含成员列表)"""
    try:
        loop = asyncio.get_event_loop()
        detail = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.get_group_detail(group_id),
        )
        return success_response(detail)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/resource-library/groups/{group_id}")
async def update_group(
    group_id: str,
    body: UpdateGroupRequest,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """更新分组信息"""
    try:
        loop = asyncio.get_event_loop()
        group = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.update_group(
                group_id, body.model_dump(exclude_none=True),
            ),
        )
        return success_response(group, "分组更新成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/resource-library/groups/{group_id}")
async def delete_group(
    group_id: str,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """删除分组"""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.delete_group(group_id),
        )
        return success_response(None, "分组已删除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.post("/api/resource-library/groups/{group_id}/members")
async def add_member(
    group_id: str,
    body: AddMemberRequest,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """添加教师到分组"""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.add_member(
                group_id, body.teacher_username,
            ),
        )
        return success_response(result, "成员添加成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/resource-library/groups/{group_id}/members/{username}")
async def remove_member(
    group_id: str,
    username: str,
    user_info: Tuple[str, str] = Depends(require_admin),
):
    """从分组移除教师"""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.remove_member(
                group_id, username,
            ),
        )
        return success_response(None, "成员已移除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  个人课案 (教师)                                                          #
# ====================================================================== #

@router.get("/api/resource-library/personal-plans")
async def list_personal_plans(
    status: str = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """列出教师个人所有课案 (跨课堂, 分页)"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_services().resource_library.list_personal_plans(
            username, status=status, page=page, page_size=page_size,
        ),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


# ====================================================================== #
#  分享 (教师)                                                              #
# ====================================================================== #

@router.post("/api/resource-library/shares")
async def share_plan(
    body: SharePlanRequest,
    user: dict = Depends(get_current_user),
):
    """分享课案到组别或全校"""
    try:
        username = user["username"]
        display_name = user.get("display_name", username)
        loop = asyncio.get_event_loop()
        share = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.share_plan(
                plan_id=body.plan_id,
                teacher_username=username,
                teacher_display_name=display_name,
                scope=body.share_scope,
                group_id=body.group_id,
                subject_tag=body.subject_tag,
            ),
        )
        return success_response(share, "分享成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/resource-library/shares/my")
async def list_my_shares(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """我的分享列表"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_services().resource_library.list_my_shares(
            username, page=page, page_size=page_size,
        ),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/api/resource-library/shares/school")
async def list_school_shares(
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """全校共享资源"""
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_services().resource_library.list_school_shares(
            page=page, page_size=page_size,
        ),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/api/resource-library/shares/group/{group_id}")
async def list_group_shares(
    group_id: str,
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """组内共享资源"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.list_group_shares(
                group_id, username, page=page, page_size=page_size,
            ),
        )
        return paginated_response(
            data=result["items"],
            total=result["total"],
            page=result["page"],
            page_size=result["page_size"],
        )
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/resource-library/shares/{share_id}")
async def get_share_detail(
    share_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取共享资源详情 (含 slides)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        detail = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.get_share_detail(
                share_id, username,
            ),
        )
        return success_response(detail)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/resource-library/shares/{share_id}")
async def unshare(
    share_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """取消分享"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.unshare(share_id, username),
        )
        return success_response(None, "已取消分享")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  浏览 (教师)                                                              #
# ====================================================================== #

@router.get("/api/resource-library/my-groups")
async def list_my_groups(
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """教师所属的分组列表"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    groups = await loop.run_in_executor(
        None,
        lambda: get_services().resource_library.list_my_groups(username),
    )
    return success_response(groups)


# ====================================================================== #
#  克隆 (教师)                                                              #
# ====================================================================== #

@router.post("/api/resource-library/clone")
async def clone_plan(
    body: ClonePlanRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """克隆共享课案到自己的课堂"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.clone_plan(
                share_id=body.share_id,
                target_room_id=body.target_room_id,
                teacher_username=username,
            ),
        )
        return success_response(result, "克隆成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  初始化                                                                   #
# ====================================================================== #

def init_resource_library_system():
    """初始化共享资源库系统 (建表)"""
    try:
        svc = get_services().resource_library
        svc.init_tables()
        logger.info("共享资源库系统初始化完成")
    except Exception as e:
        logger.error("共享资源库系统初始化失败: %s", e)
        raise
