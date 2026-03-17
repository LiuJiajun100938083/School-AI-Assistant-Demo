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

教师 — 独立备课:
  POST   /api/resource-library/plans                      创建独立课件
  GET    /api/resource-library/plans                      独立课件列表
  GET    /api/resource-library/plans/{plan_id}            课件详情 (含 slides)
  PUT    /api/resource-library/plans/{plan_id}            更新课件
  DELETE /api/resource-library/plans/{plan_id}            删除课件 (带分享检测)
  POST   /api/resource-library/plans/{plan_id}/slides             添加 slide
  PUT    /api/resource-library/plans/{plan_id}/slides/{slide_id}  更新 slide
  DELETE /api/resource-library/plans/{plan_id}/slides/{slide_id}  删除 slide
  PUT    /api/resource-library/plans/{plan_id}/slides/reorder     重排 slides
  POST   /api/resource-library/plans/{plan_id}/upload-ppt         上传 PPT
  POST   /api/resource-library/plans/{plan_id}/import-ppt         导入 PPT 为 slides

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
  POST   /api/resource-library/clone                      克隆课案到课堂或个人备课空间
"""

import asyncio
import logging
from typing import Optional, Tuple

from fastapi import APIRouter, BackgroundTasks, Depends, File, Query, UploadFile

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
    CreatePlanFromLibraryRequest,
    SharePlanRequest,
    UpdateGroupRequest,
)
from app.domains.classroom.lesson_schemas import (
    AddSlideRequest,
    ReorderSlidesRequest,
    UpdatePlanRequest,
    UpdateSlideRequest,
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
#  独立备课 — 课件 CRUD (教师)                                                #
# ====================================================================== #

@router.post("/api/resource-library/plans")
async def create_plan(
    body: CreatePlanFromLibraryRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """在资源库中直接创建独立课件 (room_id=NULL)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.create_plan(
                teacher_username=username,
                title=body.title,
                description=body.description,
                room_id=None,
            ),
        )
        return success_response(plan, "课件创建成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/resource-library/plans")
async def list_standalone_plans(
    status: Optional[str] = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """列出教师的独立课件 (room_id=NULL, 分页)"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        None,
        lambda: get_services().resource_library.list_standalone_plans(
            username, status=status, page=page, page_size=page_size,
        ),
    )
    return paginated_response(
        data=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get("/api/resource-library/plans/{plan_id}")
async def get_plan_detail(
    plan_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取课件详情 (含 slides)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_plan_with_slides(plan_id, username),
        )
        return success_response(plan)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/resource-library/plans/{plan_id}")
async def update_plan(
    plan_id: str,
    body: UpdatePlanRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新课件信息 / 状态"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.update_plan(
                plan_id, username, body.model_dump(exclude_none=True),
            ),
        )
        return success_response(plan, "课件更新成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/resource-library/plans/{plan_id}")
async def delete_plan(
    plan_id: str,
    force: bool = Query(default=False, description="是否同时取消所有相关分享"),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    删除课件 (带分享检测)。

    - 无活跃分享 → 直接删除
    - 有活跃分享 + force=false → 返回 PLAN_HAS_ACTIVE_SHARES + 分享列表
    - 有活跃分享 + force=true → 级联取消分享 + 删除
    """
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().resource_library.delete_plan(
                plan_id, username, force=force,
            ),
        )
        # 情况 B: 有活跃分享但未强制删除
        if not result.get("deleted"):
            return error_response(
                code=result["code"],
                message=result["message"],
                details={"active_shares": result["active_shares"]},
                status_code=409,
            )
        return success_response(result, "课件已删除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  独立备课 — Slide CRUD (教师)                                              #
# ====================================================================== #

@router.post("/api/resource-library/plans/{plan_id}/slides")
async def add_slide(
    plan_id: str,
    body: AddSlideRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """添加 slide 到课件"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        slide = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.add_slide(
                plan_id=plan_id,
                teacher_username=username,
                slide_type=body.slide_type,
                config=body.config,
                title=body.title,
                duration_seconds=body.duration_seconds,
                insert_at=body.insert_at,
            ),
        )
        return success_response(slide, "Slide 添加成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/resource-library/plans/{plan_id}/slides/{slide_id}")
async def update_slide(
    plan_id: str,
    slide_id: str,
    body: UpdateSlideRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新 slide"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        slide = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.update_slide(
                plan_id, slide_id, username,
                body.model_dump(exclude_none=True),
            ),
        )
        return success_response(slide, "Slide 更新成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/resource-library/plans/{plan_id}/slides/{slide_id}")
async def delete_slide(
    plan_id: str,
    slide_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """删除 slide"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().lesson.delete_slide(plan_id, slide_id, username),
        )
        return success_response(None, "Slide 已删除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/resource-library/plans/{plan_id}/slides/reorder")
async def reorder_slides(
    plan_id: str,
    body: ReorderSlidesRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """重新排序 slides"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        count = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.reorder_slides(
                plan_id, username, body.slide_ids,
            ),
        )
        return success_response({"updated": count}, "排序更新成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  独立备课 — PPT 上传 / 导入 (教师)                                          #
# ====================================================================== #

@router.post("/api/resource-library/plans/{plan_id}/upload-ppt")
async def upload_ppt_for_plan(
    plan_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    上传 PPT 文件 (不绑定课堂)。

    上传后自动后台处理 (转图片 + 提取文字)。
    前端轮询 GET /api/classroom/ppt/{file_id} 查状态，
    完成后调 POST .../import-ppt?file_id=xxx 导入。
    """
    username, _ = user_info
    try:
        file_bytes = await file.read()
        original_filename = file.filename or "unknown.pptx"

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.upload_ppt_standalone(
                teacher_username=username,
                file_bytes=file_bytes,
                original_filename=original_filename,
            ),
        )

        # 后台处理 PPT
        async def _process_ppt_task():
            try:
                await get_services().classroom.process_ppt(
                    file_id=result["file_id"],
                    teacher_username=username,
                )
            except Exception as e:
                logger.error("后台处理 PPT 失败: %s", e)

        background_tasks.add_task(_process_ppt_task)

        return success_response(result, "PPT 上传成功，正在后台处理")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("资源库 PPT 上传失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "上传 PPT 失败", status_code=500)


@router.post("/api/resource-library/plans/{plan_id}/import-ppt")
async def import_ppt_to_plan(
    plan_id: str,
    file_id: str = Query(..., description="PPT file_id"),
    insert_at: Optional[int] = Query(None, ge=0, description="插入位置 (None=末尾追加)"),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """从已上传的 PPT 文件批量创建 ppt slides (追加模式)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        ppt_info = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_ppt_info(
                file_id, username, role,
            ),
        )
        pages = [
            {"page_id": p.get("page_id", ""), "page_number": p["page_number"]}
            for p in ppt_info.get("pages", [])
        ]
        slides = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.import_ppt_slides(
                plan_id, username, file_id, pages, insert_at=insert_at,
            ),
        )
        return success_response(slides, f"已导入 {len(slides)} 张 PPT 页面")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


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
    """克隆共享课案到自己的课堂或个人备课空间 (target_room_id 可选)"""
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
