#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一响应格式模块

标准化所有 API 响应格式，确保前后端接口一致性。

成功响应:
    {"success": true, "data": {...}, "message": "操作成功"}

错误响应:
    {"success": false, "error": {"code": "NOT_FOUND", "message": "用户不存在"}}
"""

from typing import Any, Dict, Optional, Union
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field


class ErrorDetail(BaseModel):
    """错误详情"""
    code: str = Field(description="错误代码")
    message: str = Field(description="错误消息")
    details: Optional[Dict[str, Any]] = Field(default=None, description="附加详情")


class ApiResponse(BaseModel):
    """统一 API 响应格式"""
    success: bool = Field(description="是否成功")
    data: Optional[Any] = Field(default=None, description="响应数据")
    message: Optional[str] = Field(default=None, description="消息")
    error: Optional[ErrorDetail] = Field(default=None, description="错误信息")


def success_response(
    data: Any = None,
    message: str = "操作成功",
) -> Dict[str, Any]:
    """
    构造成功响应

    Args:
        data: 响应数据
        message: 成功消息

    Returns:
        标准化成功响应字典
    """
    response = {"success": True, "message": message}
    if data is not None:
        response["data"] = data
    return response


def error_response(
    code: str = "ERROR",
    message: str = "操作失败",
    details: Optional[Dict[str, Any]] = None,
    status_code: Optional[int] = None,
) -> Union[Dict[str, Any], JSONResponse]:
    """
    构造错误响应

    Args:
        code: 错误代码
        message: 错误消息
        details: 附加详情
        status_code: HTTP 状态码（提供时返回 JSONResponse）

    Returns:
        标准化错误响应（带正确 HTTP 状态码）
    """
    error = {"code": code, "message": message}
    if details:
        error["details"] = details
    # 兼容前端：同时提供 detail 字段供前端读取
    content = {"success": False, "error": error, "detail": message}
    if status_code is not None:
        return JSONResponse(status_code=status_code, content=content)
    return content


def paginated_response(
    data: list,
    total: int,
    page: int = 1,
    page_size: int = 20,
    message: str = "查询成功",
) -> Dict[str, Any]:
    """
    构造分页响应

    Args:
        data: 当前页数据
        total: 总记录数
        page: 当前页码
        page_size: 每页大小
        message: 消息

    Returns:
        标准化分页响应字典
    """
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 0
    return {
        "success": True,
        "message": message,
        "data": data,
        "pagination": {
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "has_next": page < total_pages,
            "has_prev": page > 1,
        },
    }
