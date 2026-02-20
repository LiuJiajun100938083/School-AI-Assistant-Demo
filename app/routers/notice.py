"""
通知生成路由 - NoticeRouter
=============================
处理所有通知/通告生成相关的 HTTP 端点：
- POST /api/admin/notice/dialogue/start     - 开始通知对话
- POST /api/admin/notice/dialogue/continue  - 继续通知对话
- POST /api/admin/notice/dialogue/export    - 导出通知为 DOCX
- POST /api/admin/notice/dialogue/export-legacy - 传统导出
- POST /api/admin/notice/upload-template    - 上传空白模板
- POST /api/admin/notice/upload-template-sample - 上传示例模板
- POST /api/admin/notice/batch-upload-templates  - 批量上传模板
- GET  /api/admin/notice/templates          - 模板列表
- GET  /api/admin/notices/recent            - 最近通知
"""

import logging
import os
from typing import Optional

from fastapi import APIRouter, Request, UploadFile, File
from fastapi.responses import FileResponse

from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/notice", tags=["通知生成"])


# ====================================================================== #
#  对话式通知生成                                                          #
# ====================================================================== #

@router.post("/dialogue/start")
async def start_notice_dialogue(request: Request):
    """开始通知生成对话"""
    try:
        username, _ = _verify_teacher_or_admin(request)
        body = await request.json()

        result = get_services().notice.start_conversation(
            notice_type=body.get("notice_type"),
            user=username,
        )
        return success_response(result, "对话已开始")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("开始通知对话失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/dialogue/continue")
async def continue_notice_dialogue(request: Request):
    """继续通知对话"""
    try:
        _verify_teacher_or_admin(request)
        body = await request.json()

        session_id = body.get("session_id", "")
        user_input = body.get("message", "")

        if not session_id:
            return error_response("VALIDATION_ERROR", "请提供 session_id", status_code=400)
        if not user_input:
            return error_response("VALIDATION_ERROR", "请输入内容", status_code=400)

        result = get_services().notice.continue_conversation(session_id, user_input)
        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("继续通知对话失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/dialogue/export")
async def export_notice_docx(request: Request):
    """导出通知为 DOCX 文件"""
    try:
        _verify_teacher_or_admin(request)
        body = await request.json()

        session_id = body.get("session_id", "")
        if not session_id:
            return error_response("VALIDATION_ERROR", "请提供 session_id", status_code=400)

        result = get_services().notice.export_to_docx(
            session_id=session_id,
            title=body.get("title"),
            ref_no=body.get("ref_no"),
        )

        file_path = result.get("file_path", "")
        if file_path and os.path.exists(file_path):
            return FileResponse(
                path=file_path,
                filename=result.get("filename", "notice.docx"),
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )

        return success_response(result, "导出完成")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("导出通知失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/dialogue/export-legacy")
async def export_notice_legacy(request: Request):
    """传统方式导出通知（兼容旧前端）"""
    try:
        _verify_teacher_or_admin(request)
        body = await request.json()

        session_id = body.get("session_id", "")
        content = body.get("content", "")
        title = body.get("title", "通知")

        if not content and not session_id:
            return error_response("VALIDATION_ERROR", "请提供内容或 session_id", status_code=400)

        if session_id:
            result = get_services().notice.export_to_docx(
                session_id=session_id, title=title,
            )
        else:
            # 直接内容导出（无需会话）
            result = {"content": content, "title": title}

        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  模板管理                                                               #
# ====================================================================== #

@router.post("/upload-template")
async def upload_template(request: Request, file: UploadFile = File(...)):
    """上传空白模板 (blank_template.docx)"""
    try:
        _verify_teacher_or_admin(request)

        if not file.filename.endswith(".docx"):
            return error_response("VALIDATION_ERROR", "请上传 .docx 文件", status_code=400)

        # 保存模板（带备份）
        template_dir = "notice_templates"
        os.makedirs(template_dir, exist_ok=True)

        target = os.path.join(template_dir, "blank_template.docx")
        if os.path.exists(target):
            from datetime import datetime
            backup = os.path.join(
                template_dir,
                f"blank_template_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.docx",
            )
            os.rename(target, backup)

        content = await file.read()
        with open(target, "wb") as f:
            f.write(content)

        return success_response({"filename": "blank_template.docx"}, "模板上传成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/upload-template-sample")
async def upload_template_sample(request: Request, file: UploadFile = File(...)):
    """上传通知示例到向量存储"""
    try:
        _verify_teacher_or_admin(request)
        body_content = await file.read()

        # 分类并添加到向量存储
        text = body_content.decode("utf-8", errors="ignore")
        classification = get_services().notice.classify_notice(text)

        return success_response({
            "filename": file.filename,
            "classified_type": classification.get("notice_type"),
            "confidence": classification.get("confidence"),
        }, "示例已上传")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/batch-upload-templates")
async def batch_upload_templates(request: Request):
    """批量上传模板并分类"""
    try:
        _verify_teacher_or_admin(request)
        form = await request.form()
        files = form.getlist("files")

        results = []
        for f in files:
            try:
                content = await f.read()
                text = content.decode("utf-8", errors="ignore")
                classification = get_services().notice.classify_notice(text)
                results.append({
                    "filename": f.filename,
                    "type": classification.get("notice_type"),
                    "confidence": classification.get("confidence"),
                    "status": "success",
                })
            except Exception as e:
                results.append({
                    "filename": getattr(f, "filename", "unknown"),
                    "status": "error",
                    "error": str(e),
                })

        return success_response(results, f"处理了 {len(results)} 个文件")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/templates")
async def list_templates(request: Request):
    """获取模板列表"""
    try:
        _verify_teacher_or_admin(request)
        notice_type = request.query_params.get("type")
        templates = get_services().notice.list_templates(notice_type)
        return success_response(templates)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  查询                                                                   #
# ====================================================================== #

@router.get("/recent", name="get_recent_notices")
async def get_recent_notices(request: Request):
    """获取最近生成的通知"""
    try:
        _verify_teacher_or_admin(request)

        # 从缓存目录读取最近的通知
        import json
        cache_dir = "generated_notices"
        notices = []

        if os.path.exists(cache_dir):
            files = sorted(
                [f for f in os.listdir(cache_dir) if f.endswith(".json")],
                reverse=True,
            )[:20]
            for fname in files:
                try:
                    with open(os.path.join(cache_dir, fname), "r", encoding="utf-8") as f:
                        data = json.load(f)
                        notices.append({
                            "session_id": data.get("session_id"),
                            "notice_type": data.get("notice_type"),
                            "created_at": data.get("created_at"),
                            "stage": data.get("stage"),
                        })
                except Exception:
                    continue

        return success_response(notices)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _verify_teacher_or_admin(request: Request):
    """验证教师或管理员权限"""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供认证令牌")
    payload = get_services().auth.verify_token(token)
    username = payload["username"]
    role = payload["role"]
    if role not in ("admin", "teacher"):
        from app.core.exceptions import AuthorizationError
        raise AuthorizationError("需要教师或管理员权限")
    return username, role
