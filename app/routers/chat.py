"""
对话路由 - ChatRouter
======================
处理所有 AI 对话相关的 HTTP/WebSocket 端点：
- GET  /api/conversations                          - 对话列表
- GET  /api/conversations/{username}                - 用户对话列表
- POST /api/conversations/{username}                - 创建对话
- GET  /api/conversations/{username}/{conv_id}      - 对话详情
- DELETE /api/conversations/{username}/{conv_id}    - 删除对话
- POST /api/chat                                    - 非流式对话
- POST /api/chat/{username}                         - 指定用户对话
- POST /api/chat/stream                             - SSE 流式对话
- POST /api/chat/batch                              - 批量对话
- POST /api/summary                                 - 生成学习总结
- WS   /ws/chat                                     - WebSocket 对话
- WS   /ws/{username}                               - WebSocket 用户连接
"""

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse, StreamingResponse

from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["AI 对话"])


# ====================================================================== #
#  对话管理                                                               #
# ====================================================================== #

@router.get("/api/conversations")
async def get_conversations(request: Request):
    """获取当前用户的对话列表"""
    try:
        username, _ = _verify_request(request)
        convs = get_services().chat.get_conversations(username)
        # 前端期望 {conversations: [...]} 格式
        return {"conversations": convs}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取对话列表失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/conversations/{username}")
async def get_conversations_by_username(username: str, request: Request):
    """获取指定用户的对话列表"""
    try:
        req_user, role = _verify_request(request)
        # 权限检查：只能查看自己的，或者管理员/教师可查看他人的
        if req_user != username and role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("无权查看其他用户的对话")

        convs = get_services().chat.get_conversations(username)
        # 前端期望 {conversations: [...]} 格式
        return {"conversations": convs}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/conversations/{username}")
async def create_conversation(username: str, request: Request):
    """创建新对话"""
    try:
        req_user, _ = _verify_request(request)
        body = await request.json()

        conv = get_services().chat.create_conversation(
            username=username,
            title=body.get("title", ""),
            subject=body.get("subject", ""),
        )
        # 前端直接读取 result.conversation_id，返回扁平格式
        return conv

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/conversations/{username}/{conversation_id}")
async def get_conversation(username: str, conversation_id: str, request: Request):
    """获取对话详情（含消息）"""
    try:
        _verify_request(request)
        conv = get_services().chat.get_conversation(username, conversation_id)
        # 前端直接读取 conversation.subject / .messages，返回扁平格式
        return conv

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/conversations/{username}/{conversation_id}")
async def delete_conversation(username: str, conversation_id: str, request: Request):
    """删除对话"""
    try:
        _verify_request(request)
        get_services().chat.delete_conversation(username, conversation_id, soft=True)
        return success_response(None, "对话已删除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  AI 对话 - 非流式                                                       #
# ====================================================================== #

@router.post("/api/chat")
async def chat_endpoint(request: Request):
    """非流式 AI 对话（当前用户）"""
    try:
        username, _ = _verify_request(request)
        body = await request.json()

        question = body.get("message") or body.get("question", "")
        if not question:
            return error_response("VALIDATION_ERROR", "消息不能为空", status_code=400)

        result = get_services().chat.chat(
            username=username,
            question=question,
            conversation_id=body.get("conversation_id"),
            subject=body.get("subject", ""),
            model=body.get("model"),
            use_api=body.get("use_api", False),
        )
        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("AI 对话失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  AI 对话 - SSE 流式 (注意：必须在 /api/chat/{username} 之前注册)          #
# ====================================================================== #

@router.post("/api/chat/stream")
async def chat_stream(request: Request):
    """SSE 流式 AI 对话"""
    try:
        username, _ = _verify_request(request)
        body = await request.json()

        question = body.get("message") or body.get("question", "")
        if not question:
            return JSONResponse(
                status_code=400,
                content={"success": False, "error": {"message": "消息不能为空"}},
            )

        async def event_generator():
            async for event in get_services().chat.chat_stream(
                username=username,
                question=question,
                conversation_id=body.get("conversation_id"),
                subject=body.get("subject", ""),
                model=body.get("model"),
                use_api=body.get("use_api", False),
                enable_thinking=body.get("enable_thinking", True),
            ):
                yield event

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except AppException as e:
        return JSONResponse(
            status_code=e.status_code,
            content={"success": False, "error": {"code": e.code, "message": e.message}},
        )
    except Exception as e:
        logger.error("流式对话失败: %s", e)
        return JSONResponse(
            status_code=500,
            content={"success": False, "error": {"message": "服务器内部错误"}},
        )


@router.post("/api/chat/batch")
async def chat_batch(request: Request):
    """批量 AI 对话"""
    try:
        _verify_request(request)
        body = await request.json()
        requests_data = body.get("requests", [])

        if not requests_data:
            return error_response("VALIDATION_ERROR", "请求列表不能为空", status_code=400)

        if len(requests_data) > 40:
            return error_response("VALIDATION_ERROR", "单次最多 40 个请求", status_code=400)

        # 并发处理
        results = []
        for req in requests_data:
            try:
                result = get_services().chat.chat(
                    username=req.get("username", ""),
                    question=req.get("question", ""),
                    conversation_id=req.get("conversation_id"),
                    subject=req.get("subject", ""),
                )
                results.append({"status": "success", "data": result})
            except Exception as e:
                results.append({"status": "error", "message": str(e)})

        return success_response(results)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  AI 对话 - 指定用户 (带路径参数，必须在 stream/batch 之后注册)             #
# ====================================================================== #

@router.post("/api/chat/{username}")
async def chat_endpoint_user(username: str, request: Request):
    """非流式 AI 对话（指定用户）"""
    try:
        _verify_request(request)
        body = await request.json()

        question = body.get("message") or body.get("question", "")
        if not question:
            return error_response("VALIDATION_ERROR", "消息不能为空", status_code=400)

        result = get_services().chat.chat(
            username=username,
            question=question,
            conversation_id=body.get("conversation_id"),
            subject=body.get("subject", ""),
            model=body.get("model"),
            use_api=body.get("use_api", False),
        )
        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  学习总结                                                               #
# ====================================================================== #

@router.post("/api/summary")
async def generate_summary(request: Request):
    """生成对话学习总结 + 思维导图"""
    try:
        username, _ = _verify_request(request)
        body = await request.json()

        conversation_id = body.get("conversation_id", "")
        if not conversation_id:
            return error_response("VALIDATION_ERROR", "请指定对话 ID", status_code=400)

        result = get_services().chat.generate_summary(
            username=username,
            conversation_id=conversation_id,
            subject=body.get("subject", ""),
        )
        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("生成总结失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  WebSocket 端点                                                         #
# ====================================================================== #

@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket):
    """WebSocket 实时对话"""
    await websocket.accept()
    username = None

    try:
        # 等待认证消息
        auth_msg = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        token = auth_msg.get("token", "")

        try:
            payload = get_services().auth.verify_token(token)
            username = payload["username"]
        except Exception:
            await websocket.send_json({"type": "error", "message": "认证失败"})
            await websocket.close()
            return

        await websocket.send_json({
            "type": "auth_success",
            "username": username,
        })

        # 消息循环
        while True:
            data = await asyncio.wait_for(websocket.receive_json(), timeout=300)
            msg_type = data.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if msg_type == "chat":
                question = data.get("message", "")
                subject = data.get("subject", "")
                conv_id = data.get("conversation_id")

                if not question:
                    continue

                # 流式回复
                await websocket.send_json({"type": "stream_start"})

                try:
                    async for event in get_services().chat.chat_stream(
                        username=username,
                        question=question,
                        conversation_id=conv_id,
                        subject=subject,
                    ):
                        # 解析 SSE 事件并转发
                        if event.startswith("event:"):
                            lines = event.strip().split('\n')
                            evt_type = lines[0].replace("event: ", "")
                            evt_data = json.loads(lines[1].replace("data: ", ""))
                            await websocket.send_json({
                                "type": evt_type,
                                **evt_data,
                            })
                except Exception as e:
                    await websocket.send_json({
                        "type": "error",
                        "message": str(e),
                    })

                await websocket.send_json({"type": "stream_complete"})

    except WebSocketDisconnect:
        logger.info("WebSocket 断开: %s", username or "unknown")
    except asyncio.TimeoutError:
        logger.info("WebSocket 超时: %s", username or "unknown")
        try:
            await websocket.close()
        except Exception:
            pass
    except Exception as e:
        logger.error("WebSocket 错误: %s", e)
        try:
            await websocket.close()
        except Exception:
            pass


@router.websocket("/ws/{username}")
async def websocket_user(websocket: WebSocket, username: str):
    """用户专属 WebSocket 连接"""
    await websocket.accept()

    try:
        # 认证验证
        auth_data = await asyncio.wait_for(websocket.receive_json(), timeout=30)
        token = auth_data.get("token", "")

        try:
            payload = get_services().auth.verify_token(token)
            if payload["username"] != username:
                await websocket.send_json({"type": "error", "message": "用户名不匹配"})
                await websocket.close()
                return
        except Exception:
            await websocket.send_json({"type": "error", "message": "认证失败"})
            await websocket.close()
            return

        await websocket.send_json({"type": "connected", "username": username})

        # 消息循环
        while True:
            data = await asyncio.wait_for(websocket.receive_json(), timeout=300)

            if data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if data.get("type") == "chat":
                question = data.get("message", "")
                if question:
                    try:
                        result = get_services().chat.chat(
                            username=username,
                            question=question,
                            conversation_id=data.get("conversation_id"),
                            subject=data.get("subject", ""),
                        )
                        await websocket.send_json({
                            "type": "response",
                            **result,
                        })
                    except Exception as e:
                        await websocket.send_json({
                            "type": "error",
                            "message": str(e),
                        })

    except WebSocketDisconnect:
        logger.info("WebSocket 断开: %s", username)
    except asyncio.TimeoutError:
        try:
            await websocket.close()
        except Exception:
            pass
    except Exception as e:
        logger.error("WebSocket 错误 (%s): %s", username, e)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _verify_request(request: Request):
    """验证请求并返回 (username, role)"""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供认证令牌")
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]
