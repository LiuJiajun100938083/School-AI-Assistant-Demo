#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
游戏上传 - 数据模型

请求/响应的 Pydantic 模型，从 game_upload router 中提取。
"""

from typing import Optional, List

from pydantic import BaseModel, Field


# ==================================================================================
#                                   请求模型
# ==================================================================================

class GameCreateRequest(BaseModel):
    """创建游戏请求"""
    name: str = Field(..., min_length=1, max_length=100, description="游戏名称")
    name_en: Optional[str] = Field(None, max_length=100, description="英文名称")
    description: str = Field(..., min_length=1, max_length=500, description="游戏描述")
    subject: str = Field(..., description="学科分类")
    icon: str = Field(default="🎮", max_length=10, description="显示图标")
    difficulty: List[str] = Field(default=["中一", "中二", "中三"], description="适用年级")
    tags: List[str] = Field(default=[], description="搜索标签")
    is_public: bool = Field(default=False, description="是否学生可见")
    html_content: Optional[str] = Field(None, description="HTML代码内容")
    visible_to: List[str] = Field(default=[], description="可见班级列表，如['2A','3B']，空=所有班级")
    teacher_only: bool = Field(default=False, description="是否仅教师/管理员可见")


class GameUpdateRequest(BaseModel):
    """更新游戏请求"""
    name: Optional[str] = Field(None, max_length=100)
    name_en: Optional[str] = Field(None, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    subject: Optional[str] = None
    icon: Optional[str] = Field(None, max_length=10)
    difficulty: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    is_public: Optional[bool] = None
    html_content: Optional[str] = None
    visible_to: Optional[List[str]] = None
    teacher_only: Optional[bool] = None


# ==================================================================================
#                                   响应模型
# ==================================================================================

class GameResponse(BaseModel):
    """游戏响应模型"""
    uuid: str
    name: str
    name_en: Optional[str]
    description: str
    subject: str
    icon: str
    difficulty: List[str]
    tags: List[str]
    is_public: bool
    uploader_id: int
    uploader_name: Optional[str] = None
    file_size: int
    url: str
    created_at: str
    updated_at: str
