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

实时通信:
  WS     /ws/classroom/{room_id}                 课堂 WebSocket
"""

import asyncio
import json
import logging
import os
from typing import Tuple

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Query,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import FileResponse

from app.core.dependencies import get_current_user, require_teacher, verify_token
from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.domains.classroom.schemas import (
    CreateRoomRequest,
    PushPageRequest,
    UpdateRoomInfoRequest,
    UpdateRoomStatusRequest,
)
from app.services import get_services
from app.services.ws_manager import get_classroom_ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["课堂教学"])


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
        room = get_services().classroom.create_room(
            teacher_username=username,
            title=body.title,
            description=body.description,
            allowed_classes=body.allowed_classes,
        )
        return success_response(room, "房间创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("创建房间失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "创建房间失败", status_code=500)


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
        rooms = get_services().classroom.list_rooms(
            current_username=user["username"],
            current_role=user["role"],
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
        room = get_services().classroom.get_room(
            room_id=room_id,
            current_username=user["username"],
            current_role=user["role"],
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
        updated = get_services().classroom.update_room_info(
            room_id=room_id,
            teacher_username=username,
            update_data=body.model_dump(exclude_none=True),
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
        updated = get_services().classroom.update_room_status(
            room_id=room_id,
            new_status=body.status,
            teacher_username=username,
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
        # 先关闭 WS 连接
        ws_manager = get_classroom_ws_manager()
        await ws_manager.close_room(room_id)

        get_services().classroom.delete_room(
            room_id=room_id,
            teacher_username=username,
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
        enrollment = get_services().classroom.join_room(
            room_id=room_id,
            student_username=user["username"],
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
        get_services().classroom.leave_room(
            room_id=room_id,
            student_username=user["username"],
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
        result = get_services().classroom.get_room_students(
            room_id=room_id,
            teacher_username=username,
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取学生列表失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取学生列表失败", status_code=500)


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
        result = get_services().classroom.upload_ppt(
            room_id=room_id,
            teacher_username=username,
            file_bytes=file_bytes,
            original_filename=original_filename,
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
        result = get_services().classroom.list_room_ppts(
            room_id=room_id,
            current_username=user["username"],
            current_role=user["role"],
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
        result = get_services().classroom.get_ppt_info(
            file_id=file_id,
            current_username=user["username"],
            current_role=user["role"],
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
        image_path = get_services().classroom.get_page_image_path(
            file_id=file_id,
            page_number=page_number,
            current_username=user["username"],
            current_role=user["role"],
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
    file_id: str,
    page_number: int,
    user: dict = Depends(get_current_user),
):
    """获取 PPT 页面缩略图"""
    try:
        thumb_path = get_services().classroom.get_page_thumbnail_path(
            file_id=file_id,
            page_number=page_number,
            current_username=user["username"],
            current_role=user["role"],
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
        text = get_services().classroom.get_page_text(
            file_id=file_id,
            page_number=page_number,
            current_username=user["username"],
            current_role=user["role"],
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
        get_services().classroom.delete_ppt(
            file_id=file_id,
            teacher_username=username,
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
        result = get_services().classroom.push_page(
            room_id=room_id,
            teacher_username=username,
            page_id=body.page_id,
            page_number=body.page_number,
            annotations_json=body.annotations_json,
        )

        # 通过 WebSocket 广播推送给所有学生
        ws_manager = get_classroom_ws_manager()
        await ws_manager.broadcast_to_students(room_id, {
            "type": "page_pushed",
            "push_id": result["push_id"],
            "page_id": result["page_id"],
            "page_number": result["page_number"],
            "annotations_json": result.get("annotations_json", ""),
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
        result = get_services().classroom.get_latest_push(
            room_id=room_id,
            current_username=user["username"],
            current_role=user["role"],
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
        result = get_services().classroom.list_push_history(
            room_id=room_id,
            teacher_username=username,
            limit=limit,
        )
        return success_response(result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取推送历史失败: %s", e, exc_info=True)
        return error_response("SERVER_ERROR", "获取推送历史失败", status_code=500)


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

        # 验证 JWT
        try:
            payload = get_services().auth.verify_token(auth_token)
            username = payload["username"]
            role = payload.get("role", "student")
        except Exception:
            await websocket.send_json({
                "type": "error",
                "message": "认证失败",
            })
            await websocket.close(code=4001, reason="认证失败")
            return

        # ===== 房间权限校验 =====
        try:
            get_services().classroom.get_room(
                room_id=room_id,
                current_username=username,
                current_role=role,
            )
        except AppException as e:
            await websocket.send_json({
                "type": "error",
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

        # 广播通知 (学生加入时)
        if role == "student":
            await ws_manager.broadcast_to_room(
                room_id,
                {
                    "type": "student_joined",
                    "student_username": username,
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
                    get_services().classroom.update_heartbeat(
                        room_id, username,
                    )

            elif msg_type == "push_page" and role == "teacher":
                # 教师通过 WS 推送页面 (替代 HTTP POST)
                try:
                    push_result = get_services().classroom.push_page(
                        room_id=room_id,
                        teacher_username=username,
                        page_id=data.get("page_id", ""),
                        page_number=data.get("page_number", 0),
                        annotations_json=data.get("annotations_json"),
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
                    push = get_services().classroom.get_latest_push(
                        room_id=room_id,
                        current_username=username,
                        current_role=role,
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

            # 后续阶段会在这里扩展更多消息类型
            # elif msg_type == "raise_hand": ...

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
