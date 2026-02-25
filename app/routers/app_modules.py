"""
应用模块管理路由
================
提供首页应用列表的查询和管理接口。
"""

import asyncio
import logging
from typing import List, Tuple

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.dependencies import get_current_user, require_admin
from app.domains.app_modules.service import AppModulesService

logger = logging.getLogger(__name__)
router = APIRouter()

# 全局服务实例
_service: AppModulesService = None


def _get_service() -> AppModulesService:
    global _service
    if _service is None:
        _service = AppModulesService()
    return _service


# ---- 请求/响应模型 ---- #

class AppModuleUpdate(BaseModel):
    id: str
    name: str
    icon: str = ""
    description: str = ""
    url: str = ""
    roles: List[str] = ["student", "teacher", "admin"]
    enabled: bool = True
    order: int = 999
    category: str = "other"


class AppModulesUpdateRequest(BaseModel):
    modules: List[AppModuleUpdate]


# ---- 公共接口 ---- #

@router.get("/api/apps")
async def get_apps_for_user(current_user: dict = Depends(get_current_user)):
    """
    获取当前用户可见的应用列表

    根据用户角色自动过滤。
    """
    role = current_user.get("role", "student")
    service = _get_service()
    loop = asyncio.get_event_loop()
    modules = await loop.run_in_executor(
        None, service.get_modules_for_role, role,
    )
    return {"apps": modules}


# ---- 管理接口 ---- #

@router.get("/api/admin/apps")
async def get_all_apps(
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """管理员获取全部应用模块配置"""
    service = _get_service()
    loop = asyncio.get_event_loop()
    modules = await loop.run_in_executor(None, service.get_all_modules)
    return {"apps": modules}


@router.put("/api/admin/apps")
async def update_apps(
    request: AppModulesUpdateRequest,
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """管理员更新应用模块配置"""
    service = _get_service()
    try:
        loop = asyncio.get_event_loop()
        modules_data = [m.dict() for m in request.modules]
        modules = await loop.run_in_executor(
            None, service.update_modules, modules_data,
        )
        return {"message": "應用模組配置已更新", "apps": modules}
    except ValueError as e:
        return JSONResponse(status_code=400, content={"detail": str(e)})


@router.post("/api/admin/apps/reset")
async def reset_apps(
    admin_info: Tuple[str, str] = Depends(require_admin),
):
    """重置为默认应用模块配置"""
    service = _get_service()
    loop = asyncio.get_event_loop()
    modules = await loop.run_in_executor(None, service.reset_to_default)
    return {"message": "已重置為默認配置", "apps": modules}
