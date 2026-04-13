#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
课堂教学路由 - ClassroomRouter
================================
处理所有课堂教学相关的 HTTP / WebSocket 端点:

房间管理 (教师):
  POST   /api/classroom/rooms                    创建房间
  GET    /api/classroom/rooms                    房间列表
  GET    /api/classroom/rooms/{room_id}          房间详情
  PUT    /api/classroom/rooms/{room_id}          更新房间信息
  PATCH  /api/classroom/rooms/{room_id}/status   更新房间状态
  DELETE /api/classroom/rooms/{room_id}          删除房间

学生管理:
  POST   /api/classroom/rooms/{room_id}/join     加入房间
  POST   /api/classroom/rooms/{room_id}/leave    离开房间
  GET    /api/classroom/rooms/{room_id}/students 学生列表 (教师)

PPT 管理 (教师):
  POST   /api/classroom/rooms/{room_id}/ppt      上传 PPT
  GET    /api/classroom/rooms/{room_id}/ppt      PPT 文件列表
  GET    /api/classroom/ppt/{file_id}            PPT 详情
  GET    /api/classroom/ppt/{file_id}/page/{n}   页面图片
  GET    /api/classroom/ppt/{file_id}/thumb/{n}  页面缩略图
  GET    /api/classroom/ppt/{file_id}/text/{n}   页面文字
  DELETE /api/classroom/ppt/{file_id}            删除 PPT

推送管理:
  POST   /api/classroom/rooms/{room_id}/push     教师推送页面
  GET    /api/classroom/rooms/{room_id}/push/latest  最新推送
  GET    /api/classroom/rooms/{room_id}/push/history 推送历史

AI 助手:
  POST   /api/classroom/rooms/{room_id}/ai/stream  课堂 AI 流式问答

实时通信:
  WS     /ws/classroom/{room_id}                 课堂 WebSocket
"""

import asyncio
import json
import logging
import os
from typing import Optional, Tuple

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Query,
    Request,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse, JSONResponse, Response

from app.core.dependencies import get_current_user, require_teacher, verify_token
from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.domains.classroom.schemas import (
    CreateRoomRequest,
    PushPageRequest,
    UpdateRoomInfoRequest,
    UpdateRoomStatusRequest,
)
from app.domains.classroom.lesson_schemas import (
    AddSlideRequest,
    CreatePlanRequest,
    NavigateRequest,
    PushAnnotationsRequest,
    ReorderSlidesRequest,
    SlideActionRequest,
    StartSessionRequest,
    SubmitResponseRequest,
    UpdatePlanRequest,
    UpdateSlideRequest,
)
from app.services import get_services
from app.services.ws_manager import get_classroom_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["课堂教学"])


async def _extract_bearer(request: Request):
    """从 Request 的 Authorization header 手动提取 Bearer credentials"""
    from fastapi.security import HTTPAuthorizationCredentials
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth[7:])
    raise ValueError("No Bearer token")


# ====================================================================== #
#  房间管理 (教师)                                                         #
# ====================================================================== #

@router.post("/api/classroom/rooms")
async def create_room(
    body: CreateRoomRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """创建教室房间 (仅教师)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        room = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.create_room(
                teacher_username=username,
                title=body.title,
                description=body.description,
                allowed_classes=body.allowed_classes,
            ),
        )
        return success_response(room, "房间创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("创建房间失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "创建房间失败", status_code=500)


@router.get("/api/classroom/classes")
async def list_classes_for_room(
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """返回班级列表按年级分组，供创建课堂时选择允许的班级"""
    try:
        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()
        rows = pool.execute(
            "SELECT class_code, class_name, grade FROM classes ORDER BY grade, class_code"
        )
        grouped: dict = {}
        for r in (rows or []):
            grade = r.get("grade") or "未分類"
            grouped.setdefault(grade, []).append({
                "class_code": r["class_code"],
                "class_name": r["class_name"],
            })
        return success_response({"grades": grouped})
    except Exception as e:
        logger.exception("获取班级列表失败")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/classroom/rooms")
async def list_rooms(
    user: dict = Depends(get_current_user),
):
    """
    获取房间列表

    教师 → 自己创建的所有房间
    学生 → 自己班级可见的活跃房间
    """
    try:
        loop = asyncio.get_event_loop()
        rooms = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.list_rooms(
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        return success_response(rooms)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取房间列表失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取房间列表失败", status_code=500)


@router.get("/api/classroom/rooms/{room_id}")
async def get_room(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """获取房间详情"""
    try:
        loop = asyncio.get_event_loop()
        room = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_room(
                room_id=room_id,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        return success_response(room)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取房间详情失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取房间详情失败", status_code=500)


@router.put("/api/classroom/rooms/{room_id}")
async def update_room_info(
    room_id: str,
    body: UpdateRoomInfoRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新房间基本信息 (仅教师)"""
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        update_data = body.model_dump(exclude_none=True)
        updated = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.update_room_info(
                room_id=room_id,
                teacher_username=username,
                update_data=update_data,
            ),
        )
        return success_response(updated, "房间信息已更新")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("更新房间信息失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "更新房间信息失败", status_code=500)


@router.patch("/api/classroom/rooms/{room_id}/status")
async def update_room_status(
    room_id: str,
    body: UpdateRoomStatusRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    更新房间状态 (仅教师)

    状态流转: draft→active, active→paused/ended, paused→active/ended
    """
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        updated = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.update_room_status(
                room_id=room_id,
                new_status=body.status,
                teacher_username=username,
            ),
        )

        # 通过 WebSocket 通知房间内所有用户
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_room(room_id, {
            "type": "room_status_changed",
            "status": body.status,
            "room_id": room_id,
        })

        # 如果结束，关闭所有 WS 连接
        if body.status == "ended":
            await ws_manager.close_room(room_id)

        return success_response(updated, f"房间状态已更新为 {body.status}")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("更新房间状态失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "更新房间状态失败", status_code=500)


@router.delete("/api/classroom/rooms/{room_id}")
async def delete_room(
    room_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """删除房间 (软删除, 仅教师)"""
    username, _ = user_info
    try:
        # 先通知所有在线用户房间即将删除，再关闭 WS 连接
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_room(room_id, {
            "type": "room_closed",
            "reason": "deleted",
            "message": "教師已刪除此課室",
        })
        await ws_manager.close_room(room_id)

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().classroom.delete_room(
                room_id=room_id,
                teacher_username=username,
            ),
        )
        return success_response(None, "房间已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("删除房间失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "删除房间失败", status_code=500)


# ====================================================================== #
#  学生管理                                                                #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/join")
async def join_room(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """学生加入房间"""
    try:
        loop = asyncio.get_event_loop()
        enrollment = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.join_room(
                room_id=room_id,
                student_username=user["username"],
            ),
        )

        # 通知房间内其他人 (教师 + 已有学生)
        ws_manager = get_classroom_ws_manager()
        active_count = ws_manager.get_room_user_count(room_id)
        await ws_manager.broadcast_to_room(
            room_id,
            {
                "type": "student_joined",
                "student_username": user["username"],
                "display_name": user.get("display_name", ""),
                "active_count": active_count,
            },
            exclude=user["username"],
        )

        return success_response(enrollment, "已加入房间")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("加入房间失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "加入房间失败", status_code=500)


@router.post("/api/classroom/rooms/{room_id}/leave")
async def leave_room(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """学生离开房间"""
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().classroom.leave_room(
                room_id=room_id,
                student_username=user["username"],
            ),
        )

        # 通知房间
        ws_manager = get_classroom_ws_manager()
        await ws_manager.disconnect(room_id, user["username"])
        active_count = ws_manager.get_room_user_count(room_id)
        await ws_manager.broadcast_to_room(room_id, {
            "type": "student_left",
            "student_username": user["username"],
            "active_count": active_count,
        })

        return success_response(None, "已离开房间")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("离开房间失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "离开房间失败", status_code=500)


@router.get("/api/classroom/rooms/{room_id}/students")
async def get_room_students(
    room_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取房间学生列表 (仅教师)"""
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_room_students(
                room_id=room_id,
                teacher_username=username,
            ),
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取学生列表失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取学生列表失败", status_code=500)


# ====================================================================== #
#  课堂快捷加分                                                             #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/award-coin")
async def classroom_award_coin(
    room_id: str,
    request: Request,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """课堂内快捷给学生加/减金币"""
    teacher_username, teacher_role = user_info
    try:
        body = await request.json()
        student_username = body.get("student_username", "").strip()
        amount = int(body.get("amount", 0))
        reason = body.get("reason", "课堂加分").strip() or "课堂加分"

        if not student_username:
            return error_response("BAD_REQUEST", "缺少 student_username", status_code=400)
        if amount == 0:
            return error_response("BAD_REQUEST", "金额不能为 0", status_code=400)

        # 查找学生 user_id
        from app.domains.user.repository import UserRepository
        user_repo = UserRepository()
        student = user_repo.find_one("username = %s", (student_username,))
        if not student:
            return error_response("NOT_FOUND", "学生不存在", status_code=404)

        # 查找老师 user_id
        teacher = user_repo.find_one("username = %s", (teacher_username,))
        teacher_id = teacher["id"] if teacher else 0

        # 调用宠物金币服务
        loop = asyncio.get_event_loop()
        from app.services import get_services
        pet_svc = get_services().pet
        result = await loop.run_in_executor(
            None,
            lambda: pet_svc.manual_award_coins(
                operator_id=teacher_id,
                operator_role=teacher_role,
                target_user_ids=[student["id"]],
                amount=amount,
                reason=reason,
            ),
        )
        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("课堂加分失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "加分失败", status_code=500)


# ====================================================================== #
#  PPT 管理                                                                #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/ppt")
async def upload_ppt(
    room_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    上传 PPT 文件 (仅教师)

    上传后自动在后台处理 (转图片 + 提取文字)。
    可通过 GET /api/classroom/ppt/{file_id} 查询处理状态。
    """
    username, _ = user_info
    try:
        # 读取文件内容
        file_bytes = await file.read()
        original_filename = file.filename or "unknown.pptx"

        # 上传 (验证 + 保存 + 入库)
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.upload_ppt(
                room_id=room_id,
                teacher_username=username,
                file_bytes=file_bytes,
                original_filename=original_filename,
            ),
        )

        # 后台处理 PPT (转图片 + 提取文字)
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
        logger.error("上传 PPT 失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "上传 PPT 失败", status_code=500)


@router.get("/api/classroom/rooms/{room_id}/ppt")
async def list_room_ppts(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """获取房间的 PPT 文件列表"""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.list_room_ppts(
                room_id=room_id,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取 PPT 列表失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取 PPT 列表失败", status_code=500)


@router.get("/api/classroom/ppt/{file_id}")
async def get_ppt_info(
    file_id: str,
    user: dict = Depends(get_current_user),
):
    """获取 PPT 文件详情 (含页面列表)"""
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_ppt_info(
                file_id=file_id,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取 PPT 详情失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取 PPT 详情失败", status_code=500)


@router.get("/api/classroom/ppt/{file_id}/page/{page_number}")
async def get_page_image(
    file_id: str,
    page_number: int,
    user: dict = Depends(get_current_user),
):
    """
    获取 PPT 页面图片

    返回 PNG 图片文件流，用于前端 <img> 标签显示。
    """
    try:
        loop = asyncio.get_event_loop()
        image_path = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_page_image_path(
                file_id=file_id,
                page_number=page_number,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )

        if not image_path or not os.path.isfile(image_path):
            return error_response(
                "FILE_NOT_FOUND", "页面图片文件不存在", status_code=404,
            )

        return FileResponse(
            path=image_path,
            media_type="image/png",
            filename=f"page_{page_number}.png",
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取页面图片失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取页面图片失败", status_code=500)


@router.get("/api/classroom/ppt/{file_id}/thumb/{page_number}")
async def get_page_thumbnail(
    request: Request,
    file_id: str,
    page_number: int,
    token: str = Query(None, alias="token"),
):
    """获取 PPT 页面缩略图

    支持两种认证方式：
    1. Authorization: Bearer <token> (标准 API 调用)
    2. ?token=<token> (用于 <img src> 标签，无法发送 Authorization header)
    """
    # 尝试从 query param 或 Authorization header 获取用户信息
    user = None
    if token:
        # query param token
        try:
            from app.core.dependencies import _jwt_manager
            payload = _jwt_manager.decode_token(token)
            username = payload.get("username")
            role = payload.get("role", "student")
            if username:
                user = {"username": username, "role": role}
        except Exception:
            pass

    if not user:
        # fallback 到标准 Bearer auth
        try:
            user = await get_current_user(
                await _extract_bearer(request),
            )
        except Exception:
            return error_response("AUTH_REQUIRED", "请先登录", status_code=401)

    try:
        loop = asyncio.get_event_loop()
        thumb_path = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_page_thumbnail_path(
                file_id=file_id,
                page_number=page_number,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )

        if not thumb_path or not os.path.isfile(thumb_path):
            return error_response(
                "FILE_NOT_FOUND", "缩略图文件不存在", status_code=404,
            )

        return FileResponse(
            path=thumb_path,
            media_type="image/png",
            filename=f"thumb_{page_number}.png",
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取缩略图失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取缩略图失败", status_code=500)


@router.get("/api/classroom/ppt/{file_id}/text/{page_number}")
async def get_page_text(
    file_id: str,
    page_number: int,
    user: dict = Depends(get_current_user),
):
    """获取 PPT 页面的文字内容 (供 AI 上下文使用)"""
    try:
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_page_text(
                file_id=file_id,
                page_number=page_number,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        return success_response({"text_content": text})
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取页面文字失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取页面文字失败", status_code=500)


@router.delete("/api/classroom/ppt/{file_id}")
async def delete_ppt(
    file_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """删除 PPT 文件 (仅教师)"""
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().classroom.delete_ppt(
                file_id=file_id,
                teacher_username=username,
            ),
        )
        return success_response(None, "PPT 已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("删除 PPT 失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "删除 PPT 失败", status_code=500)


# ====================================================================== #
#  教师推送                                                                 #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/push")
async def push_page(
    room_id: str,
    body: PushPageRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    教师推送当前页面 + 标注给所有学生

    推送后通过 WebSocket 实时通知房间内所有学生。
    """
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.push_page(
                room_id=room_id,
                teacher_username=username,
                page_id=body.page_id,
                page_number=body.page_number,
                annotations_json=body.annotations_json,
            ),
        )

        # 通过 WebSocket 广播推送给所有学生
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_students(room_id, {
            "type": "page_pushed",
            "push_id": result["push_id"],
            "page_id": result["page_id"],
            "page_number": result["page_number"],
            "annotations_json": result.get("annotations_json", ""),
            "text_content": result.get("text_content", ""),
            "pushed_at": result["pushed_at"].isoformat()
            if result.get("pushed_at") else "",
        })

        return success_response(result, "已推送给学生")
    except AppException as e:
        logger.warning(
            "推送失败 (AppException): code=%s, msg=%s, page_id=%s, page_number=%s",
            e.code, e.message, body.page_id, body.page_number,
        )
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("推送失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "推送失败", status_code=500)


@router.get("/api/classroom/rooms/{room_id}/push/latest")
async def get_latest_push(
    room_id: str,
    user: dict = Depends(get_current_user),
):
    """
    获取房间最新推送

    学生断线重连后调用此接口恢复到最新状态。
    """
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.get_latest_push(
                room_id=room_id,
                current_username=user["username"],
                current_role=user["role"],
            ),
        )
        if result is None:
            return success_response(None, "暂无推送")
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取最新推送失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取最新推送失败", status_code=500)


@router.get("/api/classroom/rooms/{room_id}/push/history")
async def get_push_history(
    room_id: str,
    limit: int = Query(default=0, ge=0, description="限制返回数量 (0=全部)"),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取推送历史 (仅教师, 用于课后回放)"""
    username, _ = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().classroom.list_push_history(
                room_id=room_id,
                teacher_username=username,
                limit=limit,
            ),
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取推送历史失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取推送历史失败", status_code=500)


# ====================================================================== #
#  课堂 AI 助手                                                             #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/ai/stream")
async def classroom_ai_stream(
    room_id: str,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """
    课堂 AI 助手 — 基于 PPT 内容的流式问答 (SSE)

    学生在课堂中向 AI 提问，AI 严格基于当前 PPT 课件内容回答。

    Request body:
        message: str          — 学生提问
        file_id: str          — 当前 PPT 文件 ID
        page_number: int      — 当前页码
        conversation_id: str? — 对话 ID (可选, 首次留空自动创建)

    SSE 事件格式 (与 /api/chat/stream 一致):
        event: meta    data: {"conversation_id": ..., "model": ...}
        event: answer  data: {"content": "..."}
        event: done    data: {"full_answer": ..., "conversation_id": ...}
        event: error   data: {"message": "..."}
    """
    from datetime import datetime
    from uuid import uuid4

    from fastapi.responses import StreamingResponse

    from llm.providers.ollama import get_ollama_provider
    from llm.rag.context import build_prompt_context
    from llm.prompts.templates import apply_thinking_mode

    def sse_event(event_type: str, data: dict) -> str:
        return f"event: {event_type}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"

    try:
        body = await request.json()
        message = (body.get("message") or "").strip()
        file_id = body.get("file_id", "")
        page_number = body.get("page_number", 0)
        conversation_id = body.get("conversation_id")

        if not message:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": {"message": "消息不能为空"}},
            )

        username = user["username"]
        role = user["role"]

        # ---- 1. 验证房间访问权限 ----
        loop = asyncio.get_event_loop()
        room = await loop.run_in_executor(
            None,
            lambda: get_services().classroom._room_repo.get_by_room_id(room_id),
        )
        if not room:
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": {"message": "课室不存在"}},
            )

        # ---- 2. 提取整个 PPT 全部页面文字内容 ----
        ppt_context_parts = []
        if file_id:
            try:
                pages = await loop.run_in_executor(
                    None,
                    lambda: get_services().classroom._page_repo.list_file_pages(file_id),
                )
                for page in pages:
                    text = (page.get("text_content") or "").strip()
                    if text:
                        pn = page.get("page_number", 0)
                        if pn == page_number:
                            ppt_context_parts.append(f"【第{pn}页 - 当前页】\n{text}")
                        else:
                            ppt_context_parts.append(f"【第{pn}页】\n{text}")
            except Exception as e:
                logger.warning("提取 PPT 全文失败: %s", e)

        ppt_context = "\n\n".join(ppt_context_parts) if ppt_context_parts else ""

        # ---- 3. 构建限定 system prompt ----
        system_prompt = (
            "你是课堂 AI 助手。学生正在观看老师上课的 PPT 演示。\n"
            f"学生当前正在看第 {page_number} 页。\n"
            "以下是这份 PPT 课件的完整文字内容，请以此为核心来回答学生的问题。\n"
            "你可以基于课件内容进行适当的拓展和补充说明，帮助学生更深入地理解知识点。\n"
            "如果学生的问题与课件主题相关，可以结合你的知识进行延伸解答。\n"
            "回答要清晰易懂，适合课堂学习场景。"
        )

        # ---- 4. 加载对话历史 (如有) ----
        conversation_history = []
        if conversation_id:
            try:
                from app.domains.chat.repository import MessageRepository
                msg_repo = MessageRepository()
                history_rows = msg_repo.get_conversation_history(
                    conversation_id, limit=10,
                )
                for row in history_rows:
                    r = row.get("role", "")
                    c = row.get("content", "")
                    if r in ("user", "assistant") and c:
                        conversation_history.append({"role": r, "content": c})
            except Exception as e:
                logger.warning("加载对话历史失败: %s", e)

        # ---- 5. 构建完整 prompt ----
        prompt = build_prompt_context(
            question=message,
            system_prompt=system_prompt,
            kb_context=ppt_context,
            conversation_history=conversation_history,
        )
        thinking_prompt = apply_thinking_mode(prompt, task_type="no_think")

        # ---- 6. 生成对话 ID ----
        if not conversation_id:
            conversation_id = str(uuid4())

        # ---- 7. 保存用户消息 ----
        try:
            from app.domains.chat.repository import (
                ConversationRepository,
                MessageRepository,
            )
            conv_repo = ConversationRepository()
            msg_repo = MessageRepository()
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            # 确保对话存在
            conv_repo.create_conversation(
                username=username,
                conversation_id=conversation_id,
                title=message[:50],
                subject="classroom_ai",
            )
            msg_repo.save_message(
                conversation_id, "user", message, None, None, timestamp,
            )
        except Exception as e:
            logger.warning("保存用户消息失败: %s", e)

        # ---- 8. 流式生成 ----
        from llm.config import get_llm_config

        llm_config = get_llm_config()
        model_used = llm_config.local_model

        async def event_generator():
            yield sse_event("meta", {
                "conversation_id": conversation_id,
                "model": model_used,
            })

            full_answer = []
            try:
                provider = get_ollama_provider()

                # async_stream yield 元組 (type, content)
                # 課堂模式關閉思考，但仍需解構元組
                async for token_type, token_content in provider.async_stream(
                    thinking_prompt, enable_thinking=False,
                ):
                    if token_content:
                        full_answer.append(token_content)
                        yield sse_event("answer", {"content": token_content})

            except Exception as e:
                logger.error("课堂 AI 流式生成失败: %s", e)
                yield sse_event("error", {"message": f"AI 服务暂时不可用: {e}"})
                return

            # 保存 AI 回复
            answer_text = "".join(full_answer)
            try:
                ai_timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                msg_repo_save = MessageRepository()
                msg_repo_save.save_message(
                    conversation_id, "assistant", answer_text,
                    None, model_used, ai_timestamp,
                )
            except Exception as e:
                logger.warning("保存 AI 回复失败: %s", e)

            yield sse_event("done", {
                "full_answer": answer_text,
                "conversation_id": conversation_id,
            })

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except Exception as e:
        logger.error("课堂 AI 端点异常: %s", e, exc_info=True)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": {"message": "AI 服务暂时不可用"}},
        )


# ====================================================================== #
#  课案计划 CRUD (教师)                                                      #
# ====================================================================== #

@router.post("/api/classroom/lesson-plans")
async def create_lesson_plan(
    body: CreatePlanRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """创建课案模板"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.create_plan(
                teacher_username=username,
                title=body.title,
                description=body.description,
                room_id=body.room_id,
            ),
        )
        return success_response(plan, "课案创建成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/classroom/lesson-plans")
async def list_lesson_plans(
    status: str = Query(default=None),
    room_id: str = Query(default=None),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """列出教师的课案 (可按 room_id 过滤)"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    plans = await loop.run_in_executor(
        None,
        lambda: get_services().lesson.list_plans(
            username, status=status, room_id=room_id,
        ),
    )
    return success_response(plans)


@router.get("/api/classroom/lesson-plans/{plan_id}")
async def get_lesson_plan(
    plan_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取课案详情 (含 slides)"""
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


@router.put("/api/classroom/lesson-plans/{plan_id}")
async def update_lesson_plan(
    plan_id: str,
    body: UpdatePlanRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新课案元信息"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        plan = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.update_plan(
                plan_id, username, body.model_dump(exclude_none=True),
            ),
        )
        return success_response(plan, "课案更新成功")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/classroom/lesson-plans/{plan_id}")
async def delete_lesson_plan(
    plan_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """软删除课案"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().lesson.delete_plan(plan_id, username),
        )
        return success_response(None, "课案已删除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  幻灯片管理 (教师)                                                        #
# ====================================================================== #

@router.post("/api/classroom/lesson-plans/{plan_id}/slides")
async def add_slide(
    plan_id: str,
    body: AddSlideRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """添加幻灯片"""
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
        return success_response(slide, "幻灯片已添加")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/classroom/lesson-plans/{plan_id}/slides/reorder")
async def reorder_slides(
    plan_id: str,
    body: ReorderSlidesRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """重排幻灯片顺序"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        count = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.reorder_slides(
                plan_id, username, body.slide_ids,
            ),
        )
        return success_response({"updated": count}, "排序已更新")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.put("/api/classroom/lesson-plans/{plan_id}/slides/{slide_id}")
async def update_slide(
    plan_id: str,
    slide_id: str,
    body: UpdateSlideRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """更新幻灯片"""
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
        return success_response(slide, "幻灯片已更新")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.delete("/api/classroom/lesson-plans/{plan_id}/slides/{slide_id}")
async def delete_slide(
    plan_id: str,
    slide_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """删除幻灯片"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: get_services().lesson.delete_slide(plan_id, slide_id, username),
        )
        return success_response(None, "幻灯片已删除")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/classroom/qr")
async def generate_qr_code(url: str = Query(..., description="URL to encode")):
    """生成 QR 码 PNG 图片"""
    import io

    import qrcode
    from fastapi.responses import Response

    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=4,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)

    return Response(
        content=buf.getvalue(),
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.post("/api/classroom/quiz-images")
async def upload_quiz_image(
    file: UploadFile = File(...),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """上传测验题目图片"""
    import uuid
    from pathlib import Path

    if not file.content_type or not file.content_type.startswith("image/"):
        return error_response("仅支援图片文件", "INVALID_FILE_TYPE", 400)

    quiz_img_dir = Path(__file__).resolve().parent.parent.parent / "uploads" / "quiz_images"
    quiz_img_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename or "img").suffix or ".png"
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = quiz_img_dir / stored_name

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return success_response({"url": f"/uploads/quiz_images/{stored_name}"})


@router.post("/api/classroom/lesson-plans/{plan_id}/import-ppt")
async def import_ppt_to_plan(
    plan_id: str,
    file_id: str = Query(..., description="PPT file_id"),
    insert_at: Optional[int] = Query(None, ge=0, description="插入位置 (None=末尾)"),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """从已上传的 PPT 文件批量创建 ppt slides"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        # get PPT pages from existing service
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


@router.post("/api/classroom/lesson-plans/{plan_id}/upload-ppt")
async def upload_ppt_for_plan(
    plan_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """
    在课案编辑器中直接上传 PPT 文件 (不绑定房间)

    上传后自动在后台处理 (转图片 + 提取文字)。
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
        logger.error("课案 PPT 上传失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "上传 PPT 失败", status_code=500)


# ====================================================================== #
#  课案 Session 控制 (教师)                                                  #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/lesson/start")
async def start_lesson_session(
    room_id: str,
    body: StartSessionRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """在房间中启动课案 session"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.start_session(
                room_id, body.plan_id, username,
            ),
        )
        # broadcast to room
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_room(room_id, {
            "type": "lesson_session_started",
            "session_id": result["session_id"],
            "plan_id": result["plan_id"],
        })
        return success_response(result, "课案已启动")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.post("/api/classroom/rooms/{room_id}/lesson/navigate")
async def navigate_lesson(
    room_id: str,
    body: NavigateRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """导航到指定 slide"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        # get active session
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        result = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.navigate(
                room_id, session_id, body.action,
                slide_id=body.slide_id,
                annotations_json=body.annotations_json,
            ),
        )

        # build student payload and broadcast
        slide = result["slide"]
        student_payload = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.build_student_payload(
                slide["slide_id"], session_id,
            ),
        )
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_students(room_id, {
            "type": "lesson_slide_pushed",
            "room_id": room_id,
            "session_id": session_id,
            "data": student_payload,
        })

        return success_response({
            "session": result["session"],
            "slide": result["slide"],
            "slide_annotations": result.get("slide_annotations"),
        })
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.post("/api/classroom/rooms/{room_id}/lesson/slide-action")
async def lesson_slide_action(
    room_id: str,
    body: SlideActionRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """执行 slide 生命周期动作"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        ws_manager = get_classroom_ws_manager()

        # ── Quiz-specific actions (bypass normal lifecycle) ──
        if body.action == "quiz_reveal":
            reveal_data = await loop.run_in_executor(
                None,
                lambda: get_services().lesson.quiz_reveal(room_id, session_id),
            )
            await ws_manager.broadcast_to_room(room_id, {
                "type": "quiz_reveal",
                "data": reveal_data,
            })
            return success_response(reveal_data)

        if body.action == "quiz_next":
            next_data = await loop.run_in_executor(
                None,
                lambda: get_services().lesson.quiz_next_question(room_id, session_id),
            )
            await ws_manager.broadcast_to_room(room_id, {
                "type": "quiz_question",
                "data": next_data,
            })
            return success_response(next_data)

        # ── Interactive-specific actions (bypass normal lifecycle) ──
        if body.action in ("interactive_lock", "interactive_unlock"):
            locked = body.action == "interactive_lock"
            lock_result = await loop.run_in_executor(
                None,
                lambda: get_services().lesson.interactive_set_lock(
                    room_id, session_id, locked=locked
                ),
            )
            await ws_manager.broadcast_to_room(room_id, {
                "type": "interactive_lock",
                "data": {"locked": locked},
            })
            return success_response(lock_result)

        if body.action == "show_results":
            # Check if current slide is quiz — if so, use quiz_finalize
            current_slide = state.get("slide")
            if current_slide and current_slide.get("slide_type") == "quiz":
                final_results = await loop.run_in_executor(
                    None,
                    lambda: get_services().lesson.quiz_finalize(room_id, session_id),
                )
                await ws_manager.broadcast_to_room(room_id, {
                    "type": "quiz_results",
                    "data": final_results,
                })
                return success_response(final_results)

        # ── Standard lifecycle actions ──
        result = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.slide_action(
                room_id, session_id, body.action,
                annotations_json=body.annotations_json,
            ),
        )

        # broadcast lifecycle change to all
        broadcast_lc_data = {
            "slide_id": result["slide"]["slide_id"],
            "lifecycle": result["new_lifecycle"],
            "accepting_responses": result["accepting_responses"],
            "slide_ends_at": result["session"].get("slide_ends_at").isoformat()
            if result["session"].get("slide_ends_at") else None,
        }

        # For poll show_results, include aggregated results so students can display them
        if (
            result["slide"].get("slide_type") == "poll"
            and result["new_lifecycle"] == "results_shown"
        ):
            poll_results = await loop.run_in_executor(
                None,
                lambda: get_services().lesson.get_slide_results(
                    session_id, result["slide"]["slide_id"]
                ),
            )
            broadcast_lc_data["poll_results"] = poll_results

        # For interactive show_results, include template-specific reveal payload
        if (
            result["slide"].get("slide_type") == "interactive"
            and result["new_lifecycle"] == "results_shown"
        ):
            from app.domains.classroom.slide_handlers import get_slide_handler
            handler = get_slide_handler("interactive")
            reveal_payload = handler.build_reveal_payload(result["slide"])
            broadcast_lc_data["interactive_reveal"] = reveal_payload

        await ws_manager.broadcast_to_room(room_id, {
            "type": "lesson_slide_lifecycle",
            "room_id": room_id,
            "session_id": session_id,
            "data": broadcast_lc_data,
        })

        return success_response({
            "session": result["session"],
            "new_lifecycle": result["new_lifecycle"],
            "accepting_responses": result["accepting_responses"],
            "auto_transition": result.get("auto_transition"),
        })
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)
    except ValueError as e:
        return error_response(str(e), "QUIZ_ERROR", 400)


@router.post("/api/classroom/rooms/{room_id}/lesson/push-annotations")
async def push_lesson_annotations(
    room_id: str,
    body: PushAnnotationsRequest,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """推送教师标注给学生 — 不改变 slide lifecycle，仅同步标注数据"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]

        result = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.push_annotations(
                room_id, session_id, body.slide_id, body.annotations_json,
            ),
        )

        # Broadcast to students only (not back to teacher)
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_students(room_id, {
            "type": "lesson_annotations_update",
            "room_id": room_id,
            "session_id": session_id,
            "slide_id": body.slide_id,
            "data": {
                "annotations_json": body.annotations_json,
            },
        })

        return success_response(result, "標註已推送")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/classroom/rooms/{room_id}/lesson/state")
async def get_lesson_state(
    room_id: str,
    user_info: Tuple[str, str] = Depends(verify_token),
):
    """获取当前课案状态 (重连恢复用)"""
    username, role = user_info
    loop = asyncio.get_event_loop()
    state = await loop.run_in_executor(
        None,
        lambda: get_services().lesson.get_session_state(room_id),
    )
    if not state:
        return success_response(None, "当前没有活跃的课案")
    return success_response(state)


@router.post("/api/classroom/rooms/{room_id}/lesson/end")
async def end_lesson_session(
    room_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """结束课案 session"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        await loop.run_in_executor(
            None,
            lambda: get_services().lesson.end_session(room_id, session_id),
        )

        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_room(room_id, {
            "type": "lesson_session_ended",
            "room_id": room_id,
            "session_id": session_id,
        })
        return success_response(None, "课案已结束")
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  Quiz 成绩导出                                                            #
# ====================================================================== #

@router.get("/api/classroom/rooms/{room_id}/lesson/{session_id}/export-quiz-results")
async def export_quiz_results(
    room_id: str,
    session_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """导出测验成绩为 Excel 文件"""
    try:
        loop = asyncio.get_event_loop()
        xlsx_bytes = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.export_quiz_results(room_id, session_id),
        )
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f'attachment; filename="quiz_results_{session_id[:8]}.xlsx"'
            },
        )
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)
    except ValueError as e:
        return error_response(str(e), "NO_QUIZ_DATA", 400)
    except Exception as e:
        logger.error("Export quiz results error: %s", e, exc_info=True)
        return error_response("导出失败", "EXPORT_ERROR", 500)


# ====================================================================== #
#  学生响应                                                                 #
# ====================================================================== #

@router.post("/api/classroom/rooms/{room_id}/lesson/slide/{slide_id}/respond")
async def submit_response(
    room_id: str,
    slide_id: str,
    body: SubmitResponseRequest,
    user_info: Tuple[str, str] = Depends(verify_token),
):
    """学生提交响应"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        result = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.submit_response(
                room_id, session_id, slide_id,
                username, body.response_type, body.response_data,
            ),
        )

        # notify teacher
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_room(room_id, {
            "type": "student_responded",
            "room_id": room_id,
            "session_id": session_id,
            "data": {
                "slide_id": slide_id,
                "student_username": username,
                "response_type": body.response_type,
                "is_correct": result.get("is_correct"),
                "total_responses": result["total_responses"],
            },
        }, exclude=username)

        return success_response(result)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/classroom/rooms/{room_id}/lesson/slide/{slide_id}/results")
async def get_slide_results(
    room_id: str,
    slide_id: str,
    user_info: Tuple[str, str] = Depends(require_teacher),
):
    """获取 slide 聚合结果 (教师)"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        results = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_slide_results(session_id, slide_id),
        )
        return success_response(results)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


@router.get("/api/classroom/rooms/{room_id}/lesson/slide/{slide_id}/my-response")
async def get_my_response(
    room_id: str,
    slide_id: str,
    response_type: str = Query(...),
    user_info: Tuple[str, str] = Depends(verify_token),
):
    """获取学生自己的响应"""
    username, role = user_info
    try:
        loop = asyncio.get_event_loop()
        state = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_session_state(room_id),
        )
        if not state or not state.get("session"):
            return error_response("当前房间没有活跃的课案", "SESSION_NOT_FOUND", 404)

        session_id = state["session"]["session_id"]
        resp = await loop.run_in_executor(
            None,
            lambda: get_services().lesson.get_my_response(
                session_id, slide_id, username, response_type,
            ),
        )
        return success_response(resp)
    except AppException as e:
        return error_response(e.message, e.code, e.status_code)


# ====================================================================== #
#  WebSocket 课堂实时通信                                                   #
# ====================================================================== #

@router.websocket("/ws/classroom/{room_id}")
async def websocket_classroom(
    websocket: WebSocket,
    room_id: str,
    token: str = Query(default=""),
):
    """
    课堂 WebSocket 端点

    连接流程:
    1. 通过 query param token 或首条消息中的 token 验证身份
    2. 验证房间访问权限
    3. 加入连接池
    4. 消息循环: 心跳 / 业务消息

    消息类型 (客户端→服务端):
      {"type": "ping"}                        → 心跳
      {"type": "heartbeat"}                   → 更新在线状态

    消息类型 (服务端→客户端):
      {"type": "connected", "username": "...", "role": "...", "online_count": N}
      {"type": "pong"}
      {"type": "student_joined", ...}
      {"type": "student_left", ...}
      {"type": "room_status_changed", ...}
      {"type": "room_closed", ...}
      {"type": "error", "message": "..."}
    """
    ws_manager = get_classroom_ws_manager()
    username = None
    role = None

    try:
        # 接受连接
        await websocket.accept()

        # ===== 认证 =====
        # 优先使用 URL query param 中的 token
        auth_token = token

        # 如果 URL 没带 token，等待首条消息
        if not auth_token:
            try:
                auth_msg = await asyncio.wait_for(
                    websocket.receive_json(), timeout=15,
                )
                auth_token = auth_msg.get("token", "")
            except asyncio.TimeoutError:
                await websocket.send_json({
                    "type": "error",
                    "message": "认证超时",
                })
                await websocket.close(code=4000, reason="认证超时")
                return

        if not auth_token:
            await websocket.send_json({
                "type": "error",
                "message": "缺少认证令牌",
            })
            await websocket.close(code=4001, reason="缺少认证令牌")
            return

        # 验证 JWT（线程池执行，避免阻塞事件循环）
        try:
            loop = asyncio.get_event_loop()
            payload = await loop.run_in_executor(
                None, get_services().auth.verify_token, auth_token,
            )
            username = payload["username"]
            role = payload.get("role", "student")
        except Exception:
            await websocket.send_json({
                "type": "error",
                "message": "认证失败",
            })
            await websocket.close(code=4001, reason="认证失败")
            return

        # ===== 房间权限校验（线程池执行）=====
        try:
            await loop.run_in_executor(
                None,
                lambda: get_services().classroom.get_room(
                    room_id=room_id,
                    current_username=username,
                    current_role=role,
                ),
            )
        except AppException as e:
            await websocket.send_json({
                "type": "error",
                "code": e.code,
                "message": e.message,
            })
            await websocket.close(code=4003, reason=e.message)
            return

        # ===== 加入连接池 =====
        connected = await ws_manager.connect(
            room_id, username, role, websocket,
        )
        if not connected:
            await websocket.send_json({
                "type": "error",
                "message": "房间连接数已达上限",
            })
            await websocket.close(code=4029, reason="房间已满")
            return

        # 发送连接成功消息
        online_count = ws_manager.get_room_user_count(room_id)
        await websocket.send_json({
            "type": "connected",
            "username": username,
            "role": role,
            "room_id": room_id,
            "online_count": online_count,
        })

        # 广播通知 (学生加入时) — 查 display_name 供教师端显示
        if role == "student":
            display_name = username
            try:
                dn = await loop.run_in_executor(
                    None,
                    lambda: get_services().classroom.get_student_display_name(
                        room_id, username,
                    ),
                )
                if dn:
                    display_name = dn
            except Exception:
                pass
            await ws_manager.broadcast_to_room(
                room_id,
                {
                    "type": "student_joined",
                    "student_username": username,
                    "display_name": display_name,
                    "online_count": online_count,
                },
                exclude=username,
            )

        # ===== 消息循环 =====
        while True:
            data = await asyncio.wait_for(
                websocket.receive_json(),
                timeout=300,  # 5 分钟无消息则超时
            )

            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "heartbeat":
                if role == "student":
                    # 心跳 DB 更新放线程池，不阻塞事件循环
                    loop.run_in_executor(
                        None,
                        get_services().classroom.update_heartbeat,
                        room_id, username,
                    )

            elif msg_type == "tab_visibility" and role == "student":
                # 学生切屏状态 → 转发给教师（和其他人）
                await ws_manager.broadcast_to_room(
                    room_id,
                    {
                        "type": "student_tab_status",
                        "student_username": username,
                        "hidden": bool(data.get("hidden", False)),
                    },
                    exclude=username,
                )

            elif msg_type == "push_page" and role == "teacher":
                # 教师通过 WS 推送页面 (替代 HTTP POST)
                try:
                    push_result = await loop.run_in_executor(
                        None,
                        lambda: get_services().classroom.push_page(
                            room_id=room_id,
                            teacher_username=username,
                            page_id=data.get("page_id", ""),
                            page_number=data.get("page_number", 0),
                            annotations_json=data.get("annotations_json"),
                        ),
                    )
                    # 广播给所有学生
                    await ws_manager.broadcast_to_students(room_id, {
                        "type": "page_pushed",
                        "push_id": push_result["push_id"],
                        "page_id": push_result["page_id"],
                        "page_number": push_result["page_number"],
                        "annotations_json": push_result.get(
                            "annotations_json", "",
                        ),
                        "text_content": push_result.get("text_content", ""),
                        "pushed_at": push_result["pushed_at"].isoformat()
                        if push_result.get("pushed_at") else "",
                    })
                    # 确认推送成功
                    await websocket.send_json({
                        "type": "push_ack",
                        "push_id": push_result["push_id"],
                    })
                except AppException as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": e.message,
                    })
                except Exception as e:
                    logger.error("WS 推送失败: %s", e)
                    await websocket.send_json({
                        "type": "error",
                        "message": "推送失败",
                    })

            elif msg_type == "get_latest_push":
                # 学生请求最新推送 (断线重连)
                try:
                    push = await loop.run_in_executor(
                        None,
                        lambda: get_services().classroom.get_latest_push(
                            room_id=room_id,
                            current_username=username,
                            current_role=role,
                        ),
                    )
                    if push:
                        await websocket.send_json({
                            "type": "page_pushed",
                            "push_id": push.get("push_id", ""),
                            "page_id": push.get("page_id", ""),
                            "page_number": push.get("page_number", 0),
                            "annotations_json": push.get(
                                "annotations_json", "",
                            ),
                            "text_content": push.get("text_content", ""),
                            "pushed_at": push["pushed_at"].isoformat()
                            if push.get("pushed_at") else "",
                        })
                    else:
                        await websocket.send_json({
                            "type": "no_push",
                            "message": "暂无推送",
                        })
                except Exception as e:
                    logger.error("获取最新推送失败: %s", e)

            elif msg_type == "get_lesson_state":
                # 学生重连时获取当前课案状态
                try:
                    state = await loop.run_in_executor(
                        None,
                        lambda: get_services().lesson.get_session_state(room_id),
                    )
                    if state and state.get("session"):
                        sess = state["session"]
                        slide_payload = None
                        if state.get("slide"):
                            slide_payload = await loop.run_in_executor(
                                None,
                                lambda: get_services().lesson.build_student_payload(
                                    sess["current_slide_id"], sess["session_id"],
                                ),
                            )
                        await websocket.send_json({
                            "type": "lesson_state",
                            "session_id": sess["session_id"],
                            "status": sess["status"],
                            "slide_lifecycle": sess.get("slide_lifecycle", "prepared"),
                            "accepting_responses": sess.get("accepting_responses", False),
                            "slide": slide_payload,
                        })
                    else:
                        await websocket.send_json({
                            "type": "lesson_state",
                            "session_id": None,
                        })
                except Exception as e:
                    logger.error("获取课案状态失败: %s", e)

            elif msg_type == "quiz_answer" and role == "student":
                # 学生逐题提交 quiz 答案 → 存入 runtime_meta
                try:
                    state = await loop.run_in_executor(
                        None,
                        lambda: get_services().lesson.get_session_state(room_id),
                    )
                    if not state or not state.get("session"):
                        await websocket.send_json({"type": "error", "message": "当前没有活跃的课案"})
                        continue

                    session_id = state["session"]["session_id"]
                    result = await loop.run_in_executor(
                        None,
                        lambda: get_services().lesson.quiz_record_answer(
                            room_id, session_id,
                            data.get("slide_id", ""),
                            username,
                            data.get("question_id", ""),
                            data.get("answer", ""),
                        ),
                    )

                    # ack to student
                    await websocket.send_json({
                        "type": "quiz_answer_ack",
                        "data": {"recorded": True, "question_id": data.get("question_id")},
                    })

                    # broadcast count to all (teacher sees progress)
                    await ws_manager.broadcast_to_room(room_id, {
                        "type": "quiz_answer_count",
                        "data": {
                            "question_id": data.get("question_id"),
                            "count": result.get("answer_count", 0),
                        },
                    })
                except Exception as e:
                    from app.domains.classroom.lesson_exceptions import SlideNotAcceptingResponsesError
                    if isinstance(e, SlideNotAcceptingResponsesError):
                        # Not fatal: just tell student answer was not recorded
                        await websocket.send_json({
                            "type": "quiz_answer_ack",
                            "data": {"recorded": False, "question_id": data.get("question_id"), "reason": "closed"},
                        })
                    else:
                        logger.error("WS quiz_answer 失败: %s", e)
                        await websocket.send_json({
                            "type": "quiz_answer_ack",
                            "data": {"recorded": False, "question_id": data.get("question_id")},
                        })

            elif msg_type == "submit_response" and role == "student":
                # 学生通过 WS 提交响应
                try:
                    state = await loop.run_in_executor(
                        None,
                        lambda: get_services().lesson.get_session_state(room_id),
                    )
                    if not state or not state.get("session"):
                        await websocket.send_json({
                            "type": "error",
                            "message": "当前没有活跃的课案",
                        })
                        continue

                    session_id = state["session"]["session_id"]
                    result = await loop.run_in_executor(
                        None,
                        lambda: get_services().lesson.submit_response(
                            room_id, session_id,
                            data.get("slide_id", ""),
                            username,
                            data.get("response_type", ""),
                            data.get("response_data", {}),
                        ),
                    )

                    # ack to student
                    await websocket.send_json({
                        "type": "response_ack",
                        "slide_id": data.get("slide_id"),
                        "is_correct": result.get("is_correct"),
                        "score": result.get("score"),
                    })

                    # notify teacher
                    broadcast_data = {
                        "slide_id": data.get("slide_id"),
                        "student_username": username,
                        "response_type": data.get("response_type"),
                        "is_correct": result.get("is_correct"),
                        "total_responses": result["total_responses"],
                    }
                    if result.get("poll_results"):
                        broadcast_data["poll_results"] = result["poll_results"]
                    await ws_manager.broadcast_to_room(room_id, {
                        "type": "student_responded",
                        "data": broadcast_data,
                    }, exclude=username)
                except AppException as e:
                    await websocket.send_json({
                        "type": "error",
                        "code": e.code,
                        "message": e.message,
                    })
                except Exception as e:
                    logger.error("WS 响应提交失败: %s", e)
                    await websocket.send_json({
                        "type": "error",
                        "message": "响应提交失败",
                    })

            elif msg_type == "interactive_progress" and role == "student":
                # 学生进度上报 — 只通过 WS 转发给老师，不落 DB
                await ws_manager.broadcast_to_room(room_id, {
                    "type": "interactive_progress",
                    "data": {
                        "student_username": username,
                        "pct": data.get("pct", 0),
                    },
                }, exclude=username)

    except WebSocketDisconnect:
        logger.info("WS 正常断开: %s (房间 %s)", username or "unknown", room_id)
    except asyncio.TimeoutError:
        logger.info("WS 超时断开: %s (房间 %s)", username or "unknown", room_id)
        try:
            await websocket.close(code=4008, reason="连接超时")
        except Exception:
            pass
    except Exception as e:
        logger.error(
            "WS 异常: %s (房间 %s): %s",
            username or "unknown", room_id, e,
        )
        try:
            await websocket.close(code=4500, reason="服务器内部错误")
        except Exception:
            pass
    finally:
        # 清理连接
        if username:
            await ws_manager.disconnect(room_id, username)

            # 广播离开通知
            if role == "student":
                online_count = ws_manager.get_room_user_count(room_id)
                await ws_manager.broadcast_to_room(room_id, {
                    "type": "student_left",
                    "student_username": username,
                    "online_count": online_count,
                })


# ==================================================================================
#                                   初始化
# ==================================================================================

def init_lesson_system():
    """初始化课案系统（幂等建表）"""
    get_services().lesson.init_tables()
