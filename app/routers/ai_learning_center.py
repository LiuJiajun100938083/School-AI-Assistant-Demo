#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
AI 學習中心路由
==============
提供學習內容管理、知識圖譜、學習路徑、AI 問答等功能。

管理員端點 (/api/admin/learning-center):
    - 內容管理、知識節點、邊、路徑管理
    - 文件上傳、發布控制

用戶端點 (/api/learning-center):
    - 查看內容、知識圖譜、學習路徑
    - AI 問答、搜索、統計查詢
"""

import logging
import os
import uuid
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user, require_teacher_or_admin
from app.core.exceptions import AppException
from app.core.responses import error_response, paginated_response, success_response
from app.services.container import get_services

logger = logging.getLogger(__name__)
router = APIRouter()


# ================================================================
# 請求模型
# ================================================================

class CategoryInput(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    slug: Optional[str] = ""
    icon: Optional[str] = "📁"
    parent_id: Optional[int] = None
    sort_order: int = 0


class CreateContentRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    content_type: str = "article"
    tags: Optional[List[str]] = None
    external_url: Optional[str] = None
    video_platform: Optional[str] = None
    category_ids: Optional[List[int]] = None


class UpdateContentRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    content_type: Optional[str] = None
    tags: Optional[List[str]] = None
    external_url: Optional[str] = None
    video_platform: Optional[str] = None
    category_ids: Optional[List[int]] = None


class CreateKnowledgeNodeRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    icon: Optional[str] = "📌"
    color: Optional[str] = "#006633"
    category_id: Optional[int] = None


class UpdateKnowledgeNodeRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    category_id: Optional[int] = None


class UpdateNodePositionRequest(BaseModel):
    x: float
    y: float


class LinkContentToNodeRequest(BaseModel):
    content_ids: List[int]


class CreateKnowledgeEdgeRequest(BaseModel):
    source_node_id: int
    target_node_id: int
    relation_type: str = "related"
    label: str = ""
    weight: float = 1.0


class CreatePathRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = ""
    icon: Optional[str] = "🎯"
    difficulty: str = "beginner"
    estimated_hours: float = 1.0
    tags: Optional[List[str]] = None


class UpdatePathRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    difficulty: Optional[str] = None
    estimated_hours: Optional[float] = None
    tags: Optional[List[str]] = None


class PathStepInput(BaseModel):
    content_id: int
    step_order: int
    description: str = ""


class UpdatePathStepsRequest(BaseModel):
    steps: List[PathStepInput]


class AIAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)
    context_filter: Optional[str] = None


# ================================================================
# 公開端點 - 統計和分類
# ================================================================

@router.get("/api/learning-center/stats")
async def get_statistics(
    current_user: dict = Depends(get_current_user),
):
    """獲取學習中心統計數據"""
    try:
        service = get_services().learning_center
        stats = service.get_stats()
        return success_response(data=stats)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error fetching statistics")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/learning-center/categories")
async def get_categories(
    current_user: dict = Depends(get_current_user),
):
    """獲取所有分類"""
    try:
        service = get_services().learning_center
        categories = service.get_categories()
        return success_response(data=categories)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error fetching categories")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公開端點 - 內容
# ================================================================

@router.get("/api/learning-center/contents")
async def list_contents(
    content_type: Optional[str] = Query(None, description="內容類型過濾"),
    category_id: Optional[int] = Query(None, description="分類 ID 過濾"),
    tag: Optional[str] = Query(None, description="標籤過濾"),
    search: Optional[str] = Query(None, description="搜尋內容"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
):
    """列出已發布內容"""
    try:
        service = get_services().learning_center
        result = service.get_contents(
            content_type=content_type,
            category_id=category_id,
            tags=tag,
            search=search,
            page=page,
            page_size=page_size,
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
        logger.exception("Error listing contents")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/learning-center/contents/{content_id}")
async def get_content_detail(
    content_id: int,
    current_user: dict = Depends(get_current_user),
):
    """獲取內容詳情"""
    try:
        service = get_services().learning_center
        content = service.get_content_detail(content_id)
        return success_response(data=content)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error fetching content detail")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公開端點 - 知識圖譜和學習路徑
# ================================================================

@router.get("/api/learning-center/knowledge-map")
async def get_knowledge_map(
    current_user: dict = Depends(get_current_user),
):
    """獲取知識圖譜"""
    try:
        service = get_services().learning_center
        map_data = service.get_knowledge_map()
        return success_response(data=map_data)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error fetching knowledge map")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/learning-center/paths")
async def list_paths(
    current_user: dict = Depends(get_current_user),
):
    """列出已發布的學習路徑"""
    try:
        service = get_services().learning_center
        paths = service.get_paths()
        return success_response(data=paths)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error listing paths")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/learning-center/paths/{path_id}")
async def get_path_detail(
    path_id: int,
    current_user: dict = Depends(get_current_user),
):
    """獲取學習路徑詳情"""
    try:
        service = get_services().learning_center
        path_data = service.get_path_detail(path_id)
        return success_response(data=path_data)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error fetching path detail")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 公開端點 - 搜尋和 AI
# ================================================================

@router.get("/api/learning-center/search")
async def global_search(
    keyword: str = Query(..., min_length=1),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=1000),
    current_user: dict = Depends(get_current_user),
):
    """全域搜尋"""
    try:
        service = get_services().learning_center
        result = service.search_contents(keyword=keyword, page=page, page_size=page_size)
        return paginated_response(
            data=result.get("items", []),
            total=result.get("total", 0),
            page=result.get("page", page),
            page_size=result.get("page_size", page_size),
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error performing search")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/learning-center/ai-ask")
async def ai_ask(
    request: AIAskRequest,
    current_user: dict = Depends(get_current_user),
):
    """AI 問答"""
    try:
        service = get_services().learning_center
        result = await service.ai_ask(
            username=current_user.get("username", "unknown"),
            question=request.question,
            context_filter=request.context_filter,
        )
        return success_response(data=result)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error processing AI question")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理員端點 - 分類管理
# ================================================================

@router.post("/api/admin/learning-center/categories")
async def create_category(
    request: CategoryInput,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建分類"""
    try:
        service = get_services().learning_center
        category = service.create_category(
            admin=admin_info,
            name=request.name,
            description=request.description or "",
            slug=request.slug or "",
            icon=request.icon or "📁",
            parent_id=request.parent_id,
            sort_order=request.sort_order,
        )
        return success_response(data=category, message="分類創建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error creating category")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/categories/{category_id}")
async def update_category(
    category_id: int,
    request: CategoryInput,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新分類"""
    try:
        service = get_services().learning_center
        data = request.dict(exclude_unset=True)
        category = service.update_category(
            admin=admin_info,
            category_id=category_id,
            data=data,
        )
        return success_response(data=category, message="分類更新成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating category")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/learning-center/categories/{category_id}")
async def delete_category(
    category_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """刪除分類"""
    try:
        service = get_services().learning_center
        service.delete_category(admin=admin_info, category_id=category_id)
        return success_response(message="分類已刪除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error deleting category")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理員端點 - 內容管理
# ================================================================

@router.post("/api/admin/learning-center/contents")
async def create_content(
    request: CreateContentRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建內容"""
    try:
        service = get_services().learning_center
        content = service.create_content(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            content_type=request.content_type,
            tags=request.tags or [],
            external_url=request.external_url,
            video_platform=request.video_platform,
            category_ids=request.category_ids,
        )
        return success_response(data=content, message="內容創建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error creating content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/contents/{content_id}")
async def update_content(
    content_id: int,
    request: UpdateContentRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新內容"""
    try:
        service = get_services().learning_center
        data = request.dict(exclude_unset=True)
        content = service.update_content(
            admin=admin_info,
            content_id=content_id,
            data=data,
        )
        return success_response(data=content, message="內容更新成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/learning-center/contents/{content_id}")
async def delete_content(
    content_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """刪除內容"""
    try:
        service = get_services().learning_center
        service.delete_content(admin=admin_info, content_id=content_id)
        return success_response(message="內容已刪除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error deleting content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/learning-center/contents/{content_id}/publish")
async def publish_content(
    content_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """發布內容"""
    try:
        service = get_services().learning_center
        content = service.publish_content(admin=admin_info, content_id=content_id)
        return success_response(data=content, message="內容已發布")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error publishing content")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/learning-center/upload")
async def upload_file(
    file: Optional[UploadFile] = File(None),
    content_type: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    tags: str = Form(""),
    external_url: Optional[str] = Form(None),
    video_platform: Optional[str] = Form(None),
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """上傳文件並創建內容"""
    try:
        service = get_services().learning_center

        # 解析標籤
        tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []

        # 外部視頻
        if content_type == "video_external":
            if not external_url:
                return error_response("INVALID_INPUT", "外部視頻需要提供 URL", status_code=400)

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
            )
            return success_response(data=content, message="外部視頻已創建")

        # 本地文件上傳
        if not file:
            return error_response("INVALID_INPUT", "需要提供文件", status_code=400)

        upload_dir = f"uploads/learning_center/{content_type}s"
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
        )

        return success_response(data=content, message=f"文件已上傳")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error uploading file")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理員端點 - 知識節點管理
# ================================================================

@router.post("/api/admin/learning-center/knowledge-nodes")
async def create_knowledge_node(
    request: CreateKnowledgeNodeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建知識節點"""
    try:
        service = get_services().learning_center
        node = service.create_node(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            icon=request.icon or "📌",
            color=request.color or "#006633",
            category_id=request.category_id,
        )
        return success_response(data=node, message="知識節點創建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error creating knowledge node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/knowledge-nodes/{node_id}")
async def update_knowledge_node(
    node_id: int,
    request: UpdateKnowledgeNodeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新知識節點"""
    try:
        service = get_services().learning_center
        data = request.dict(exclude_unset=True)
        node = service.update_node(admin=admin_info, node_id=node_id, data=data)
        return success_response(data=node, message="知識節點更新成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating knowledge node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/learning-center/knowledge-nodes/{node_id}")
async def delete_knowledge_node(
    node_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """刪除知識節點"""
    try:
        service = get_services().learning_center
        service.delete_node(admin=admin_info, node_id=node_id)
        return success_response(message="知識節點已刪除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error deleting knowledge node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/knowledge-nodes/{node_id}/position")
async def update_node_position(
    node_id: int,
    request: UpdateNodePositionRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新節點位置"""
    try:
        service = get_services().learning_center
        node = service.update_node_position(
            admin=admin_info,
            node_id=node_id,
            x=request.x,
            y=request.y,
        )
        return success_response(data=node, message="位置已更新")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating node position")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/learning-center/knowledge-nodes/{node_id}/contents")
async def link_contents_to_node(
    node_id: int,
    request: LinkContentToNodeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """關聯內容到節點"""
    try:
        service = get_services().learning_center
        result = service.link_node_contents(
            admin=admin_info,
            node_id=node_id,
            content_ids=request.content_ids,
        )
        return success_response(data=result, message="內容關聯成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error linking contents to node")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理員端點 - 知識邊管理
# ================================================================

@router.post("/api/admin/learning-center/knowledge-edges")
async def create_knowledge_edge(
    request: CreateKnowledgeEdgeRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建知識邊"""
    try:
        service = get_services().learning_center
        edge = service.create_edge(
            admin=admin_info,
            source_node_id=request.source_node_id,
            target_node_id=request.target_node_id,
            relation_type=request.relation_type,
            label=request.label,
            weight=request.weight,
        )
        return success_response(data=edge, message="知識邊創建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error creating knowledge edge")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/learning-center/knowledge-edges/{edge_id}")
async def delete_knowledge_edge(
    edge_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """刪除知識邊"""
    try:
        service = get_services().learning_center
        service.delete_edge(admin=admin_info, edge_id=edge_id)
        return success_response(message="知識邊已刪除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error deleting knowledge edge")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ================================================================
# 管理員端點 - 學習路徑管理
# ================================================================

@router.post("/api/admin/learning-center/paths")
async def create_path(
    request: CreatePathRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """創建學習路徑"""
    try:
        service = get_services().learning_center
        path = service.create_path(
            admin=admin_info,
            title=request.title,
            description=request.description or "",
            icon=request.icon or "🎯",
            difficulty=request.difficulty,
            estimated_hours=request.estimated_hours,
            tags=request.tags,
        )
        return success_response(data=path, message="學習路徑創建成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error creating learning path")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/paths/{path_id}")
async def update_path(
    path_id: int,
    request: UpdatePathRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新學習路徑"""
    try:
        service = get_services().learning_center
        data = request.dict(exclude_unset=True)
        path = service.update_path(admin=admin_info, path_id=path_id, data=data)
        return success_response(data=path, message="學習路徑更新成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating learning path")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/admin/learning-center/paths/{path_id}")
async def delete_path(
    path_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """刪除學習路徑"""
    try:
        service = get_services().learning_center
        service.delete_path(admin=admin_info, path_id=path_id)
        return success_response(message="學習路徑已刪除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error deleting learning path")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/admin/learning-center/paths/{path_id}/steps")
async def update_path_steps(
    path_id: int,
    request: UpdatePathStepsRequest,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """更新路徑步驟"""
    try:
        service = get_services().learning_center
        steps = [step.dict() for step in request.steps]
        result = service.update_path_steps(admin=admin_info, path_id=path_id, steps=steps)
        return success_response(data=result, message="路徑步驟已更新")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error updating path steps")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/learning-center/paths/{path_id}/publish")
async def publish_path(
    path_id: int,
    admin_info: Tuple[str, str] = Depends(require_teacher_or_admin),
):
    """發布學習路徑"""
    try:
        service = get_services().learning_center
        path = service.publish_path(admin=admin_info, path_id=path_id)
        return success_response(data=path, message="學習路徑已發布")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Error publishing learning path")
        return error_response("SERVER_ERROR", str(e), status_code=500)
