#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
虚拟宠物系统 API 路由
========================
MVP 阶段：仅管理员可用，管理员金币无限。

端点：
- GET    /api/pet/me                  - 获取我的宠物
- POST   /api/pet/create              - 创建宠物
- PUT    /api/pet/customize           - 重新自定义外观
- GET    /api/pet/shop                - 获取商店物品
- POST   /api/pet/shop/purchase       - 购买物品
- GET    /api/pet/streak              - 获取 streak 信息
- POST   /api/pet/streak/freeze       - 购买 streak 保护卡
- GET    /api/pet/achievements        - 获取成就列表
- GET    /api/pet/coins/history       - 金币流水记录
- POST   /api/pet/like                - 给别人点赞
- GET    /api/pet/visit/{user_id}     - 访问别人的宠物
- GET    /api/pet/leaderboard         - 排行榜
- POST   /api/pet/admin/award-coins   - 手动加减金币
- GET    /api/pet/preset-messages     - 获取预设短语
"""

import asyncio
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_current_user
from app.domains.pet.schemas import (
    AwardCoinsRequest,
    CreatePetRequest,
    CustomizePetRequest,
    LikePetRequest,
    UseItemRequest,
)
from app.services.container import get_services

logger = logging.getLogger(__name__)

pet_router = APIRouter(prefix="/api/pet", tags=["Virtual Pet"])


def _get_service():
    return get_services().pet


def _extract_user(current_user: Dict) -> Dict:
    return {
        "id": current_user.get("id", 0),
        "role": current_user.get("role", "guest"),
        "username": current_user.get("username", ""),
        "display_name": current_user.get("display_name", ""),
        "class_name": current_user.get("class_name", ""),
    }


def _require_access(user: Dict) -> None:
    """检查宠物系统访问权限"""
    if not _get_service().check_access(user["role"]):
        raise HTTPException(403, "功能内测中，仅管理员可用")


def _require_teacher(user: Dict) -> None:
    if user["role"] not in ("teacher", "admin"):
        raise HTTPException(403, "只有教师和管理员可以执行此操作")


# ============================================================
# 宠物 CRUD
# ============================================================

@pet_router.get("/me")
async def get_my_pet(current_user: Dict = Depends(get_current_user)):
    """获取我的宠物信息"""
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    pet = await loop.run_in_executor(None, lambda: _get_service().get_pet(user["id"]))
    if not pet:
        return {"has_pet": False}

    message = _get_service().get_pet_message(pet)
    streak = await loop.run_in_executor(None, lambda: _get_service().get_streak(user["id"]))

    return {"has_pet": True, "pet": pet, "message": message, "streak": streak}


@pet_router.post("/create")
async def create_pet(data: CreatePetRequest, current_user: Dict = Depends(get_current_user)):
    """创建宠物"""
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    try:
        pet = await loop.run_in_executor(
            None,
            lambda: _get_service().create_pet(
                user_id=user["id"],
                user_role=user["role"],
                pet_name=data.pet_name,
                body_type=data.body_type,
                color_id=data.color_id,
                pattern_id=data.pattern_id,
                eyes_id=data.eyes_id,
                ears_id=data.ears_id,
                tail_id=data.tail_id,
            ),
        )
        return {"success": True, "pet": pet}
    except ValueError as e:
        raise HTTPException(400, str(e))


@pet_router.put("/customize")
async def customize_pet(data: CustomizePetRequest, current_user: Dict = Depends(get_current_user)):
    """重新自定义外观"""
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    fields = data.model_dump(exclude_none=True)
    try:
        pet = await loop.run_in_executor(
            None, lambda: _get_service().customize_pet(user["id"], **fields)
        )
        return {"success": True, "pet": pet}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ============================================================
# 商店
# ============================================================

@pet_router.get("/shop")
async def get_shop(
    category: Optional[str] = Query(None),
    current_user: Dict = Depends(get_current_user),
):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    items = await loop.run_in_executor(None, lambda: _get_service().get_shop_items(category))
    return {"items": items}


@pet_router.post("/shop/purchase")
async def purchase_item(data: UseItemRequest, current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            None, lambda: _get_service().purchase_item(user["id"], user["role"], data.item_id)
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ============================================================
# Streak
# ============================================================

@pet_router.get("/streak")
async def get_streak(current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    streak = await loop.run_in_executor(None, lambda: _get_service().get_streak(user["id"]))
    return streak


@pet_router.post("/streak/freeze")
async def buy_streak_freeze(current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            None, lambda: _get_service().buy_streak_freeze(user["id"], user["role"])
        )
        return {"success": True, **result}
    except ValueError as e:
        raise HTTPException(400, str(e))


# ============================================================
# 成就 & 金币
# ============================================================

@pet_router.get("/achievements")
async def get_achievements(current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    achievements = await loop.run_in_executor(
        None, lambda: _get_service().get_achievements(user["id"])
    )
    return {"achievements": achievements}


@pet_router.get("/coins/history")
async def get_coin_history(
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict = Depends(get_current_user),
):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    history = await loop.run_in_executor(
        None, lambda: _get_service().get_coin_history(user["id"], limit)
    )
    return {"history": history}


# ============================================================
# 社交
# ============================================================

@pet_router.post("/like")
async def like_pet(data: LikePetRequest, current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    try:
        result = await loop.run_in_executor(
            None,
            lambda: _get_service().like_pet(
                user["id"], user["role"], data.to_user_id, data.message_code
            ),
        )
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))


@pet_router.get("/visit/{user_id}")
async def visit_pet(user_id: int, current_user: Dict = Depends(get_current_user)):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    pet = await loop.run_in_executor(
        None, lambda: _get_service().get_pet_for_visit(user_id, user["id"])
    )
    if not pet:
        raise HTTPException(404, "该用户没有宠物")
    return {"pet": pet}


@pet_router.get("/preset-messages")
async def get_preset_messages(current_user: Dict = Depends(get_current_user)):
    from app.domains.pet.constants import PRESET_MESSAGES
    return {"messages": PRESET_MESSAGES}


# ============================================================
# 排行榜
# ============================================================

@pet_router.get("/leaderboard")
async def get_leaderboard(
    type: str = Query("growth", description="growth / coins_earned / care"),
    role: Optional[str] = Query(None),
    class_name: Optional[str] = Query(None, alias="class"),
    limit: int = Query(20, ge=1, le=100),
    current_user: Dict = Depends(get_current_user),
):
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()

    data = await loop.run_in_executor(
        None, lambda: _get_service().get_leaderboard(type, role, class_name, limit)
    )
    return {"leaderboard": data}


# ============================================================
# 教师/管理员：手动加减金币
# ============================================================

@pet_router.post("/admin/award-coins")
async def admin_award_coins(data: AwardCoinsRequest, current_user: Dict = Depends(get_current_user)):
    """手动给学生加/减金币"""
    user = _extract_user(current_user)
    _require_access(user)
    _require_teacher(user)
    loop = asyncio.get_event_loop()

    # 解析目标学生列表
    if data.target_type == "class":
        if not data.class_code:
            raise HTTPException(400, "按班级操作时必须提供 class_code")
        # 查询该班所有学生（有宠物的）
        pets = await loop.run_in_executor(
            None,
            lambda: _get_service()._pet.find_all(
                where="user_role = 'student'",
            ),
        )
        # 需要 join 查班级，这里简化：通过排行榜接口获取
        lb = await loop.run_in_executor(
            None,
            lambda: _get_service().get_leaderboard("growth", "student", data.class_code, 999),
        )
        target_ids = [row["user_id"] for row in lb]
    elif data.target_type == "students":
        if not data.student_ids:
            raise HTTPException(400, "按学生操作时必须提供 student_ids")
        target_ids = data.student_ids
    else:
        raise HTTPException(400, "无效的 target_type")

    if not target_ids:
        raise HTTPException(400, "未找到目标学生")

    result = await loop.run_in_executor(
        None,
        lambda: _get_service().manual_award_coins(
            operator_id=user["id"],
            operator_role=user["role"],
            target_user_ids=target_ids,
            amount=data.amount,
            reason=data.reason,
        ),
    )
    return result


# ============================================================
# 初始化
# ============================================================

def init_pet_system():
    """初始化宠物系统（建表 + 种子数据）"""
    _get_service().init_system()


__all__ = ["pet_router", "init_pet_system"]
