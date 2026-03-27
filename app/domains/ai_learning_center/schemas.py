"""
AI 学习中心 — Schema / DTO 定义

定义 AI 内容分析相关的请求/响应模型，
以及 AI 输出的结构化验证模型。
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, validator


# ================================================================
# AI 分析状态常量
# ================================================================

class AnalysisStatus:
    """AI 分析状态机常量"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

    ALL = {PENDING, PROCESSING, COMPLETED, FAILED}


# ================================================================
# AI 输出验证模型 — 用于解析和校验 LLM 返回的 JSON
# ================================================================

class AnalysisNodeSchema(BaseModel):
    """AI 生成的知识节点"""
    id: str = Field(..., description="临时 ID，如 n1, n2，供 edges 引用")
    title: str = Field(..., min_length=1, max_length=255, description="节点标题")
    description: str = Field(default="", description="节点描述")
    icon: str = Field(default="📌", description="节点图标 emoji")
    color: str = Field(default="#006633", description="节点颜色 hex")


class AnalysisEdgeSchema(BaseModel):
    """AI 生成的知识关系边"""
    source: str = Field(..., description="源节点临时 ID")
    target: str = Field(..., description="目标节点临时 ID")
    relation_type: str = Field(
        default="related",
        description="关系类型: prerequisite, related, extends",
    )
    label: str = Field(default="", description="关系标签说明")

    @validator("relation_type")
    def validate_relation_type(cls, v):
        valid = {"prerequisite", "related", "extends", "includes", "包含", "contains"}
        if v not in valid:
            return "related"  # 降级为 related 而非报错
        return v


class AnalysisContentLinkSchema(BaseModel):
    """AI 生成的节点-内容关联（含页面锚点）"""
    node: str = Field(..., description="节点临时 ID")
    anchor: Optional[Dict[str, Any]] = Field(
        default=None,
        description="页面锚点，如 {type: page, page: 3}",
    )


class AnalysisPathStepSchema(BaseModel):
    """AI 生成的学习路径步骤"""
    title: str = Field(..., min_length=1, max_length=255, description="步骤标题")
    description: str = Field(default="", description="步骤描述")
    node_match: str = Field(default="", description="对应知识节点的标题，用于自动匹配")
    sort_order: int = Field(default=0, description="排序序号")


class AnalysisPathSchema(BaseModel):
    """AI 生成的学习路径"""
    title: str = Field(..., min_length=1, max_length=255, description="路径标题")
    description: str = Field(default="", description="路径描述")
    difficulty: str = Field(default="beginner", description="难度: beginner, intermediate, advanced")
    estimated_hours: float = Field(default=1.0, ge=0.1, le=100.0, description="预计学习时长（小时）")
    steps: List[AnalysisPathStepSchema] = Field(default_factory=list, description="路径步骤")

    @validator("difficulty")
    def validate_difficulty(cls, v):
        valid = {"beginner", "intermediate", "advanced"}
        if v not in valid:
            return "beginner"
        return v


class AIAnalysisResult(BaseModel):
    """
    AI 返回的完整分析结果。

    此模型用于验证 LLM 输出的 JSON 结构，
    字段设计与 batch_import_knowledge_graph() / batch_import_paths() 对齐。
    """
    nodes: List[AnalysisNodeSchema] = Field(
        ..., min_items=1, description="知识节点列表（至少 1 个）"
    )
    edges: List[AnalysisEdgeSchema] = Field(
        default_factory=list, description="知识关系边"
    )
    content_links: List[AnalysisContentLinkSchema] = Field(
        default_factory=list, description="节点-内容关联"
    )
    path: Optional[AnalysisPathSchema] = Field(
        default=None, description="学习路径"
    )


# ================================================================
# API 响应 DTO
# ================================================================

class AnalysisStatusResponse(BaseModel):
    """GET /contents/{id}/analysis-status 响应"""
    content_id: int
    ai_analysis_status: Optional[str] = None
    ai_analysis_error: Optional[str] = None
    ai_analysis_at: Optional[datetime] = None
