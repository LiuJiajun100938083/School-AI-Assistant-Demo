"""
游戏上传 API 路由
=================
提供教师上传、管理自定义 HTML 游戏的 RESTful 端点。

所有业务逻辑委托给 GameUploadService (app.domains.game_upload.service)，
本模块只负责：
1. 解析 HTTP 请求参数
2. 调用 Service 方法
3. 返回标准化 JSON 响应
"""

import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile

from app.core.dependencies import get_current_user
from app.domains.game_upload.schemas import GameCreateRequest, GameUpdateRequest
from app.services.container import get_services

logger = logging.getLogger(__name__)

# ==================================================================================
#                                   路由器
# ==================================================================================

game_router = APIRouter(prefix="/api/games", tags=["Games"])


def _extract_user(current_user: Dict) -> Dict:
    """从 get_current_user 依赖中提取 id 和 role"""
    return {
        'id': current_user.get('id', 0),
        'role': current_user.get('role', 'guest'),
        'username': current_user.get('username', ''),
    }


def _get_service():
    """获取 GameUploadService 实例"""
    return get_services().game_upload


# ==================================================================================
#                                   端点
# ==================================================================================

@game_router.post("/upload")
async def upload_game(
    name: str = Form(...),
    description: str = Form(...),
    subject: str = Form(...),
    name_en: Optional[str] = Form(None),
    icon: str = Form("🎮"),
    difficulty: str = Form('["中一", "中二", "中三"]'),
    tags: str = Form('[]'),
    is_public: bool = Form(False),
    visible_to: str = Form('[]'),
    teacher_only: bool = Form(False),
    html_content: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    current_user: Dict = Depends(get_current_user),
):
    """
    上传新游戏

    支持两种方式：
    1. 文件上传：通过 file 参数上传 .html 文件
    2. 代码粘贴：通过 html_content 参数提交 HTML 代码
    """
    user = _extract_user(current_user)
    if user['role'] not in ('teacher', 'admin'):
        raise HTTPException(403, "只有教师和管理员可以上传游戏")

    data = GameCreateRequest(
        name=name,
        name_en=name_en,
        description=description,
        subject=subject,
        icon=icon,
        difficulty=json.loads(difficulty),
        tags=json.loads(tags),
        is_public=is_public,
        visible_to=json.loads(visible_to),
        teacher_only=teacher_only,
        html_content=html_content,
    )

    result = await _get_service().create_game(user['id'], data, file)
    return {"success": True, "message": "游戏上传成功", "data": result}


@game_router.get("/subjects/list")
async def get_subjects():
    """获取学科列表（动态从数据库读取，兜底使用默认配置）"""
    return {
        "success": True,
        "data": _get_service().get_subjects_with_icons(),
    }


@game_router.get("/list")
async def list_games(
    subject: Optional[str] = Query(None),
    only_mine: bool = Query(False),
    user_class: Optional[str] = Query(None, description="用户班级，如2A"),
    current_user: Dict = Depends(get_current_user),
):
    """获取游戏列表"""
    user = _extract_user(current_user)
    games = _get_service().get_games(
        user['id'], user['role'], subject, only_mine, user_class,
    )
    return {"success": True, "data": games, "count": len(games)}


@game_router.get("/{game_uuid}")
async def get_game(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """获取单个游戏详情"""
    user = _extract_user(current_user)
    game = _get_service().get_game(game_uuid, user['id'], user['role'])
    return {"success": True, "data": game}


@game_router.put("/{game_uuid}")
async def update_game(
    game_uuid: str,
    data: GameUpdateRequest,
    current_user: Dict = Depends(get_current_user),
):
    """更新游戏信息"""
    user = _extract_user(current_user)
    if user['role'] not in ('teacher', 'admin'):
        raise HTTPException(403, "只有教师和管理员可以修改游戏")

    result = await _get_service().update_game(
        game_uuid, user['id'], user['role'], data,
    )
    return {"success": True, "message": "游戏更新成功", "data": result}


@game_router.delete("/{game_uuid}")
async def delete_game(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """删除游戏"""
    user = _extract_user(current_user)
    if user['role'] not in ('teacher', 'admin'):
        raise HTTPException(403, "只有教师和管理员可以删除游戏")

    _get_service().delete_game(game_uuid, user['id'], user['role'])
    return {"success": True, "message": "游戏删除成功"}


@game_router.patch("/{game_uuid}/visibility")
async def toggle_game_visibility(
    game_uuid: str,
    current_user: Dict = Depends(get_current_user),
):
    """切换游戏可见性"""
    user = _extract_user(current_user)
    if user['role'] not in ('teacher', 'admin'):
        raise HTTPException(403, "只有教师和管理员可以修改可见性")

    result = _get_service().toggle_visibility(game_uuid, user['id'], user['role'])
    return {
        "success": True,
        "message": f"游戏已{'公开' if result['is_public'] else '设为私有'}",
        "data": result,
    }


# ==================================================================================
#                                   初始化
# ==================================================================================

def init_game_upload_system():
    """初始化游戏上传系统（建表 + 创建上传目录）"""
    _get_service().init_system()


# 导出
__all__ = ['game_router', 'init_game_upload_system']
