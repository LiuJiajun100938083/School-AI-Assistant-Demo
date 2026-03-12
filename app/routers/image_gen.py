"""
AI 圖片生成路由
================
處理 AI 圖片生成的 HTTP 端點：
- POST /api/image-gen/generate  - SSE 流式圖片生成

路由職責僅限：認證、參數解析、委派 Service、格式化響應。
業務邏輯全部在 ImageGenService 中。
"""

import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

from app.core.exceptions import AppException
from app.core.responses import error_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/image-gen", tags=["AI 圖片生成"])


@router.post("/generate")
async def generate_image(request: Request):
    """SSE 流式 AI 圖片生成"""
    try:
        username, _role = _verify_request(request)
        body = await request.json()
        prompt_raw = body.get("prompt", "")

        # 委派 Service 校驗
        service = get_services().image_gen
        prompt = service.validate_prompt(prompt_raw)

        # 將 Service 的 async generator 包裝為 SSE
        async def sse_wrapper():
            async for msg in service.generate_stream(prompt, username):
                yield f"data: {json.dumps(msg, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            sse_wrapper(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("generate_image error: %s", e)
        return error_response("SERVER_ERROR", "伺服器錯誤", status_code=500)


def _verify_request(request: Request):
    """驗證請求並返回 (username, role)"""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供認證令牌")
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]
