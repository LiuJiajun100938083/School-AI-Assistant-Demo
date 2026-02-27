#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学校学习中心路由（完全独立于 AI 学习中心）
==========================================
API 前缀:
  公共端点:  /api/school-learning-center/...
  管理端点:  /api/admin/school-learning-center/...
"""

import asyncio
import logging
import os
import uuid
from typing import Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user, require_teacher_or_admin
from app.core.exceptions import AppException
from app.core.responses import error_response, paginated_response, success_response
from app.services.container import get_services

logger = logging.getLogger(__name__)
router = APIRouter()


# ================================================================
# 请求模型
# ================================================================

class SLCCreateNodeRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    icon: Optional[str] = "📌"
    color: Optional[str] = "#006633"
    subject_code: str = Field(..., min_length=1)
    grade_level: Optional[str] = None


class SLCCreateEdgeRequest(BaseModel):
    source_node_id: int
    target_node_id: int
    relation_type: str = "related"
    label: str = ""
    weight: float = 1.0
    subject_code: Optional[str] = None


class SLCBatchNodeInput(BaseModel):
    id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    icon: Optional[str] = "📌"
    color: Optional[str] = "#006633"


class SLCBatchEdgeInput(BaseModel):
    source: str
    target: str
    relation_type: str = "related"
    label: str = ""
    weight: float = 1.0


class SLCBatchContentLinkInput(BaseModel):
    node: str
    content_id: Optional[int] = None
    anchor: Optional[Dict] = None


class SLCBatchImportGraphRequest(BaseModel):
    clear_existing: bool = False
    source_pdf: Optional[str] = None
    subject_code: str = Field(..., min_length=1)
    grade_level: Optional[str] = None
    nodes: List[SLCBatchNodeInput]
    edges: List[SLCBatchEdgeInput] = []
    content_links: List[SLCBatchContentLinkInput] = []


class SLCCreatePathRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    icon: Optional[str] = "🎯"
    difficulty: str = "beginner"
    estimated_hours: float = 1.0
    tags: Optional[List[str]] = None
    subject_code: str = Field(..., min_length=1)
    grade_level: Optional[str] = None


class SLCBatchPathStepInput(BaseModel):
    step_order: int
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    content_id: Optional[int] = None
    node_id: Optional[int] = None
    node_match: Optional[str] = None
    source_pdf: Optional[str] = None


class SLCBatchPathInput(BaseModel):
    id: str
    title: str = Field(..., min_length=1, max_length=255)
    description: str = ""
    difficulty: str = "beginner"
    estimated_hours: float = 1.0
    icon: str = "🎯"
    tags: Optional[List[str]] = None
    steps: List[SLCBatchPathStepInput] = []


class SLCBatchImportPathsRequest(BaseModel):
    clear_existing: bool = False
    subject_code: str = Field(..., min_length=1)
    grade_level: Optional[str] = None
    paths: List[SLCBatchPathInput]


class SLCAIAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    subject_code: Optional[str] = None
    content_id: Optional[int] = None


class SLCCreateContentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    content_type: str = "article"
    tags: Optional[List[str]] = None
    external_url: Optional[str] = None
    video_platform: Optional[str] = None
    article_content: Optional[str] = None
    subject_code: str = Field(..., min_length=1)
    grade_level: Optional[str] = None


# ================================================================
# 公共端点 - 科目列表
# ================================================================

@router.get("/api/school-learning-center/subjects")
async def slc_get_subjects(
    current_user: dict = Depends(get_current_user),
):
    """获取有学习内容的科目列表"""
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        subjects = await loop.run_in_executor(
            None, service.get_subjects_with_content
        )
        return success_response(data=subjects)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error fetching subjects")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - 统计
# ================================================================

@router.get("/api/school-learning-center/stats")
async def slc_get_stats(
    subject_code: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        stats = await loop.run_in_executor(
            None, lambda: service.get_stats(subject_code=subject_code)
        )
        return success_response(data=stats)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error fetching stats")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - 内容
# ================================================================

@router.get("/api/school-learning-center/contents")
async def slc_list_contents(
    subject_code: Optional[str] = Query(None),
    grade_level: Optional[str] = Query(None),
    content_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: service.get_contents(
                subject_code=subject_code,
                grade_level=grade_level,
                content_type=content_type,
                search=search,
                page=page,
                page_size=page_size,
            ),
        )
        return paginated_response(
            data=result.get("items", []),
            total=result.get("total", 0),
            page=result.get("page", page),
            page_size=result.get("page_size", page_size),
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error listing contents")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/school-learning-center/contents/{content_id}")
async def slc_get_content_detail(
    content_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        content = await loop.run_in_executor(
            None, service.get_content_detail, content_id,
        )
        return success_response(data=content)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error fetching content detail")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - 知识图谱
# ================================================================

@router.get("/api/school-learning-center/knowledge-map")
async def slc_get_knowledge_map(
    subject_code: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        map_data = await loop.run_in_executor(
            None, lambda: service.get_knowledge_map(subject_code=subject_code)
        )
        return success_response(data=map_data)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error fetching knowledge map")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - 学习路径
# ================================================================

@router.get("/api/school-learning-center/paths")
async def slc_list_paths(
    subject_code: Optional[str] = Query(None),
    grade_level: Optional[str] = Query(None),
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        paths = await loop.run_in_executor(
            None,
            lambda: service.get_paths(
                subject_code=subject_code, grade_level=grade_level
            ),
        )
        return success_response(data=paths)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error listing paths")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/school-learning-center/paths/{path_id}")
async def slc_get_path_detail(
    path_id: int,
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        path_data = await loop.run_in_executor(
            None, service.get_path_detail, path_id,
        )
        return success_response(data=path_data)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error fetching path detail")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - 搜索
# ================================================================

@router.get("/api/school-learning-center/search")
async def slc_search(
    keyword: str = Query(..., min_length=1),
    subject_code: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
):
    try:
        service = get_services().school_learning_center
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: service.search_contents(
                keyword=keyword, subject_code=subject_code,
                page=page, page_size=page_size,
            ),
        )
        return paginated_response(
            data=result.get("items", []),
            total=result.get("total", 0),
            page=result.get("page", page),
            page_size=result.get("page_size", page_size),
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error performing search")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公共端点 - AI 助手
# ================================================================

@router.post("/api/school-learning-center/ai-ask-stream")
async def slc_ai_ask_stream(
    request: SLCAIAskRequest,
    current_user: dict = Depends(get_current_user),
):
    service = get_services().school_learning_center

    async def event_generator():
        import json as _json
        try:
            async for event in service.ai_ask_stream(
                username=current_user.get("username", "unknown"),
                question=request.question,
                subject_code=request.subject_code,
                content_id=request.content_id,
            ):
                yield f"data: {_json.dumps(event, ensure_ascii=False)}\n\n"
        except Exception as e:
            logger.exception("SLC SSE stream error")
            yield f"data: {_json.dumps({'type': 'done', 'related_nodes': [], 'page_references': []}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ================================================================
# 管理员端点 - 文件上传
# ================================================================

@router.post("/api/admin/school-learning-center/upload")
async def slc_upload_file(
    file: Optional[UploadFile] = File(None),
    content_type: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    tags: str = Form(""),
    external_url: Optional[str] = Form(None),
    video_platform: Optional[str] = Form(None),
    subject_code: str = Form(...),
    grade_level: Optional[str] = Form(None),
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        # 外部视频
        if content_type == "video_external":
            if not external_url:
                return error_response("INVALID_INPUT", "外部视频需要提供 URL", status_code=400)
            if not video_platform:
                if "youtube.com" in external_url or "youtu.be" in external_url:
                    video_platform = "youtube"
                elif "bilibili.com" in external_url:
                    video_platform = "bilibili"

            content = service.create_content(
                admin=admin_info,
                title=title,
                description=description,
                content_type=content_type,
                tags=tag_list,
                external_url=external_url,
                video_platform=video_platform,
                status="published",
                subject_code=subject_code,
                grade_level=grade_level,
            )
            return success_response(data=content, message="外部视频已创建")

        # 本地文件
        if not file:
            return error_response("INVALID_INPUT", "需要提供文件", status_code=400)

        upload_dir = f"uploads/school_learning_center/{content_type}s"
        os.makedirs(upload_dir, exist_ok=True)

        file_ext = os.path.splitext(file.filename or "file")[1]
        unique_filename = f"{uuid.uuid4()}{file_ext}"
        file_path = os.path.join(upload_dir, unique_filename)

        file_content = await file.read()
        with open(file_path, "wb") as f:
            f.write(file_content)

        content = service.create_content(
            admin=admin_info,
            title=title,
            description=description,
            content_type=content_type,
            file_path=file_path,
            file_name=file.filename,
            file_size=len(file_content),
            mime_type=file.content_type,
            tags=tag_list,
            status="published",
            subject_code=subject_code,
            grade_level=grade_level,
        )

        return success_response(data=content, message="文件已上传")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error uploading file")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 内容管理
# ================================================================

@router.post("/api/admin/school-learning-center/contents")
async def slc_create_content(
    request: SLCCreateContentRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        content = service.create_content(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            content_type=request.content_type,
            tags=request.tags or [],
            external_url=request.external_url,
            video_platform=request.video_platform,
            article_content=request.article_content,
            status="published",
            subject_code=request.subject_code,
            grade_level=request.grade_level,
        )
        return success_response(data=content, message="内容创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error creating content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/school-learning-center/contents/{content_id}")
async def slc_delete_content(
    content_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        service.delete_content(admin=admin_info, content_id=content_id)
        return success_response(message="内容已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error deleting content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 知识节点
# ================================================================

@router.post("/api/admin/school-learning-center/knowledge-nodes")
async def slc_create_node(
    request: SLCCreateNodeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        node = service.create_node(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            icon=request.icon or "📌",
            color=request.color or "#006633",
            subject_code=request.subject_code,
            grade_level=request.grade_level,
        )
        return success_response(data=node, message="知识节点创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error creating node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/school-learning-center/knowledge-nodes/{node_id}")
async def slc_delete_node(
    node_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        service.delete_node(admin=admin_info, node_id=node_id)
        return success_response(message="知识节点已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error deleting node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 知识边
# ================================================================

@router.post("/api/admin/school-learning-center/knowledge-edges")
async def slc_create_edge(
    request: SLCCreateEdgeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        edge = service.create_edge(
            admin=admin_info,
            source_node_id=request.source_node_id,
            target_node_id=request.target_node_id,
            relation_type=request.relation_type,
            label=request.label,
            weight=request.weight,
            subject_code=request.subject_code,
        )
        return success_response(data=edge, message="知识边创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error creating edge")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/school-learning-center/knowledge-edges/{edge_id}")
async def slc_delete_edge(
    edge_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        service.delete_edge(admin=admin_info, edge_id=edge_id)
        return success_response(message="知识边已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error deleting edge")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 知识图谱批量导入
# ================================================================

@router.post("/api/admin/school-learning-center/knowledge-graph/batch-import")
async def slc_batch_import_graph(
    request: SLCBatchImportGraphRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        result = service.batch_import_knowledge_graph(
            admin=admin_info,
            nodes=[n.model_dump() for n in request.nodes],
            edges=[e.model_dump() for e in request.edges],
            content_links=[cl.model_dump() for cl in request.content_links],
            source_pdf=request.source_pdf,
            clear_existing=request.clear_existing,
            subject_code=request.subject_code,
            grade_level=request.grade_level,
        )
        return success_response(data=result, message="知识图谱批量导入成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error batch importing graph")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 学习路径
# ================================================================

@router.post("/api/admin/school-learning-center/paths")
async def slc_create_path(
    request: SLCCreatePathRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        path = service.create_path(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            icon=request.icon or "🎯",
            difficulty=request.difficulty,
            estimated_hours=request.estimated_hours,
            tags=request.tags,
            subject_code=request.subject_code,
            grade_level=request.grade_level,
        )
        return success_response(data=path, message="学习路径创建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error creating path")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/school-learning-center/paths/{path_id}")
async def slc_delete_path(
    path_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        service.delete_path(admin=admin_info, path_id=path_id)
        return success_response(message="学习路径已删除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error deleting path")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理员端点 - 学习路径批量导入
# ================================================================

@router.post("/api/admin/school-learning-center/paths/batch-import")
async def slc_batch_import_paths(
    request: SLCBatchImportPathsRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    try:
        service = get_services().school_learning_center
        result = service.batch_import_paths(
            admin=admin_info,
            paths=[p.model_dump() for p in request.paths],
            clear_existing=request.clear_existing,
            subject_code=request.subject_code,
            grade_level=request.grade_level,
        )
        return success_response(data=result, message="学习路径批量导入成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("SLC: Error batch importing paths")
        return error_response("SERVER_ERROR", str(e), status_code=500)
