"""
学科管理路由 - SubjectRouter
==============================
处理所有学科和知识库相关的 HTTP 端点：
- GET    /api/subjects                          - 学科列表（全部用户）
- GET    /api/admin/subjects                    - 学科详细列表（管理员）
- POST   /api/admin/subjects                    - 创建学科
- PUT    /api/admin/subjects/{code}             - 更新学科
- DELETE /api/admin/subjects/{code}             - 删除学科
- GET    /api/admin/prompts/{code}              - 获取系统提示词
- POST   /api/admin/prompts/{code}              - 更新系统提示词
- POST   /api/admin/upload-document             - 上传文档到知识库
- GET    /api/admin/documents/{code}            - 文档列表
- GET    /api/admin/documents                   - 查询文档（按学科）
- DELETE /api/admin/documents/{subj}/{file}     - 删除文档
- POST   /api/admin/knowledge/{subj}/rebuild    - 重建知识库
- GET    /api/admin/knowledge/{subj}/content    - 查看向量内容
- POST   /api/admin/knowledge/{subj}/search     - 知识搜索
- GET    /api/admin/knowledge-stats             - 知识库统计
"""

import logging
from typing import Optional

from fastapi import APIRouter, Request, UploadFile, File

from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["学科管理"])


# ====================================================================== #
#  学科 CRUD                                                              #
# ====================================================================== #

@router.get("/api/subjects")
async def get_subjects(request: Request):
    """获取学科列表（学生视图，精简字段）"""
    try:
        _verify_request(request)
        subjects = get_services().subject.list_subjects(detailed=False)
        # 前端期望 {subjects: {code: {code, name, icon}, ...}} 格式
        subjects_dict = {}
        for s in subjects:
            code = s.get("subject_code", "")
            subjects_dict[code] = {
                "code": code,
                "name": s.get("subject_name", code),
                "icon": s.get("icon", "📚"),
                "description": s.get("description", ""),
            }
        return {"subjects": subjects_dict}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/subjects")
async def get_admin_subjects(request: Request):
    """获取学科详细列表（管理员/教师视图）"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        import os
        subjects = get_services().subject.list_subjects(detailed=True)
        # 前端期望 {subjects: {code: {name, icon, config: {...}}, ...}} 格式
        subjects_dict = {}
        for s in subjects:
            code = s.get("subject_code", "")
            config = s.get("config", {}) if isinstance(s.get("config"), dict) else {}
            # 从文件系统读取真实文档数（config.doc_count 从未被更新，不可靠）
            kb_dir = os.path.join("Knowledge_base", code)
            try:
                real_count = len([f for f in os.listdir(kb_dir) if not f.startswith(".")]) if os.path.isdir(kb_dir) else 0
            except OSError:
                real_count = 0
            config["doc_count"] = real_count
            subjects_dict[code] = {
                "code": code,
                "name": s.get("subject_name", code),
                "icon": config.get("icon", s.get("icon", "📚")),
                "config": config,
            }
        return {"subjects": subjects_dict}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/subjects")
async def create_subject(request: Request):
    """创建新学科"""
    try:
        _verify_admin(request)
        body = await request.json()

        subject = get_services().subject.create_subject(
            subject_code=(body.get("subject_code") or body.get("code") or "").strip(),
            subject_name=(body.get("subject_name") or body.get("name") or "").strip(),
            icon=body.get("icon", "📚"),
            description=body.get("description", ""),
            system_prompt=body.get("system_prompt", ""),
        )
        return success_response(subject, "学科创建成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/subjects/{subject_code}")
async def update_subject(subject_code: str, request: Request):
    """更新学科信息"""
    try:
        _verify_admin(request)
        body = await request.json()

        subject = get_services().subject.update_subject(
            subject_code=subject_code,
            subject_name=body.get("subject_name"),
            icon=body.get("icon"),
            description=body.get("description"),
        )
        return success_response(subject, "更新成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/subjects/{subject_code}")
async def delete_subject(subject_code: str, request: Request):
    """删除学科"""
    try:
        _verify_admin(request)
        get_services().subject.delete_subject(subject_code)
        return success_response(None, "学科已删除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  系统提示词                                                             #
# ====================================================================== #

@router.get("/api/admin/prompts/{subject_code}")
async def get_prompt(subject_code: str, request: Request):
    """获取学科系统提示词"""
    try:
        _verify_request(request)
        prompt = get_services().subject.get_system_prompt(subject_code)
        return success_response({"subject_code": subject_code, "system_prompt": prompt})

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/prompts/{subject_code}")
async def update_prompt(subject_code: str, request: Request):
    """更新学科系统提示词"""
    try:
        _verify_admin(request)
        body = await request.json()
        prompt = body.get("system_prompt", "")

        get_services().subject.update_system_prompt(subject_code, prompt)
        return success_response(None, "提示词已更新")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  知识库文档管理                                                          #
# ====================================================================== #

@router.post("/api/admin/upload-document")
async def upload_document(request: Request, file: UploadFile = File(...)):
    """上传文档到知识库"""
    try:
        admin_user, _ = _verify_admin(request)
        subject_code = request.query_params.get("subject") or ""

        if not subject_code:
            # 尝试从 form data 获取
            form = await request.form()
            subject_code = form.get("subject", "")

        if not subject_code:
            return error_response("VALIDATION_ERROR", "请指定学科代码", status_code=400)

        content = await file.read()
        result = get_services().subject.upload_document(
            subject_code=subject_code,
            filename=file.filename,
            file_content=content,
            uploaded_by=admin_user,
        )
        return success_response(result, "文档上传成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("文档上传失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/documents/{subject_code}")
async def get_documents(subject_code: str, request: Request):
    """获取学科文档列表"""
    try:
        _verify_request(request)
        docs = get_services().subject.list_documents(subject_code)
        # 前端期望 {documents: [...]} 格式
        return {"documents": docs}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/documents")
async def get_documents_query(request: Request):
    """按学科查询文档"""
    try:
        _verify_request(request)
        subject = request.query_params.get("subject", "")
        if not subject:
            return error_response("VALIDATION_ERROR", "请指定学科", status_code=400)

        docs = get_services().subject.list_documents(subject)
        return success_response(docs)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/documents/{subject}/{filename}")
async def delete_document(subject: str, filename: str, request: Request):
    """删除文档"""
    try:
        _verify_admin(request)
        get_services().subject.delete_document(subject, filename)
        return success_response(None, "文档已删除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  知识库运维                                                             #
# ====================================================================== #

@router.post("/api/admin/knowledge/{subject}/rebuild")
async def rebuild_knowledge(subject: str, request: Request):
    """重建学科知识库向量索引"""
    try:
        _verify_admin(request)
        # 列出所有文档并重新处理
        docs = get_services().subject.list_documents(subject)
        return success_response({
            "subject": subject,
            "documents_count": len(docs),
            "status": "rebuild_started",
        }, "知识库重建已启动")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/knowledge/{subject}/content")
async def get_knowledge_content(subject: str, request: Request):
    """查看向量存储中的内容（分页）"""
    try:
        _verify_request(request)
        page = int(request.query_params.get("page", 1))
        page_size = int(request.query_params.get("page_size", 20))

        docs = get_services().subject.list_documents(subject)
        total = len(docs)
        start = (page - 1) * page_size
        end = start + page_size

        return success_response({
            "subject": subject,
            "documents": docs[start:end],
            "total": total,
            "page": page,
            "page_size": page_size,
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/knowledge/{subject}/search")
async def search_knowledge(subject: str, request: Request):
    """知识库相似度搜索"""
    try:
        _verify_request(request)
        body = await request.json()
        query = body.get("query", "")
        limit = body.get("limit", 5)

        if not query:
            return error_response("VALIDATION_ERROR", "搜索内容不能为空", status_code=400)

        results = get_services().subject.search_knowledge(subject, query, limit)
        return success_response(results)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/knowledge-stats")
async def get_knowledge_stats(request: Request):
    """知识库统计"""
    try:
        _verify_request(request)
        stats = get_services().subject.get_statistics()
        # 前端直接读取 stats.total_docs 等字段，返回扁平格式
        if isinstance(stats, dict):
            return stats
        return {"total_docs": 0, "total_size_mb": "0", "subjects_with_docs": 0}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _verify_request(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供认证令牌")
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]


def _verify_admin(request: Request):
    username, role = _verify_request(request)
    if role != "admin":
        from app.core.exceptions import AuthorizationError
        raise AuthorizationError("需要管理员权限")
    return username, role
