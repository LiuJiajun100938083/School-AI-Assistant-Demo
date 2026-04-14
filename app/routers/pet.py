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
- POST   /api/pet/chat                - 宠物聊天（SSE 流式）
"""

import asyncio
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

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


@pet_router.get("/coin-sources")
async def get_coin_sources(current_user: Dict = Depends(get_current_user)):
    """获取当前角色的金币来源列表"""
    from app.domains.pet.constants import (
        STUDENT_COIN_SOURCES, TEACHER_COIN_SOURCES,
        DAILY_EARN_CAP_STUDENT, DAILY_EARN_CAP_TEACHER,
    )
    user = _extract_user(current_user)
    if user["role"] in ("teacher", "admin"):
        sources = [
            {"source_type": k, "amount": v["amount"], "label": v["label"]}
            for k, v in TEACHER_COIN_SOURCES.items()
        ]
        daily_cap = DAILY_EARN_CAP_TEACHER
    else:
        sources = [
            {"source_type": k, "amount": v["amount"], "label": v["label"]}
            for k, v in STUDENT_COIN_SOURCES.items()
        ]
        daily_cap = DAILY_EARN_CAP_STUDENT
    return {"sources": sources, "daily_cap": daily_cap, "role": user["role"]}


@pet_router.post("/create")
async def create_pet(data: CreatePetRequest, current_user: Dict = Depends(get_current_user)):
    """创建宠物"""
    user = _extract_user(current_user)
    _require_access(user)
    loop = asyncio.get_event_loop()
    svc = _get_service()

    # ── 宠物名字审核（关键词 + AI 语义双重检查）──
    keyword_err = svc.validate_pet_name_keywords(data.pet_name)
    if keyword_err:
        raise HTTPException(400, keyword_err)
    ai_err = await svc.validate_pet_name_ai(data.pet_name, user["username"])
    if ai_err:
        raise HTTPException(400, ai_err)

    try:
        pet = await loop.run_in_executor(
            None,
            lambda: svc.create_pet(
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
    svc = _get_service()

    # ── 如果改了名字，需要审核 ──
    if data.pet_name:
        keyword_err = svc.validate_pet_name_keywords(data.pet_name)
        if keyword_err:
            raise HTTPException(400, keyword_err)
        ai_err = await svc.validate_pet_name_ai(data.pet_name, user["username"])
        if ai_err:
            raise HTTPException(400, ai_err)

    fields = data.model_dump(exclude_none=True)
    try:
        pet = await loop.run_in_executor(
            None, lambda: svc.customize_pet(user["id"], **fields)
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
# 教师面板
# ============================================================

@pet_router.get("/teacher/classes-summary")
async def teacher_classes_summary(current_user: Dict = Depends(get_current_user)):
    """教师查看所属班级宠物汇总"""
    user = _extract_user(current_user)
    _require_teacher(user)
    loop = asyncio.get_event_loop()
    svc = _get_service()

    # 教师和管理员均可查看所有班级
    from app.domains.user.repository import UserRepository
    rows = UserRepository().raw_query(
        "SELECT DISTINCT class_name FROM users WHERE role='student' AND is_active=1 AND class_name IS NOT NULL AND class_name != '' ORDER BY class_name"
    )
    class_names = [r["class_name"] for r in rows]

    if not class_names:
        return {"classes": []}

    data = await loop.run_in_executor(None, lambda: svc.get_teacher_classes_summary(class_names))
    return {"classes": data}


@pet_router.get("/teacher/ranking")
async def teacher_pet_ranking(
    limit: int = Query(50, ge=1, le=200),
    current_user: Dict = Depends(get_current_user),
):
    """教师宠物排行榜"""
    user = _extract_user(current_user)
    _require_teacher(user)
    loop = asyncio.get_event_loop()
    svc = _get_service()

    data = await loop.run_in_executor(
        None, lambda: svc.get_leaderboard("growth", "teacher,admin", None, limit)
    )
    return {"leaderboard": data}


@pet_router.get("/teacher/class-pets")
async def teacher_class_pets(
    class_name: str = Query(..., alias="class"),
    current_user: Dict = Depends(get_current_user),
):
    """教师查看某班所有学生宠物详细"""
    user = _extract_user(current_user)
    _require_teacher(user)
    loop = asyncio.get_event_loop()
    svc = _get_service()

    # 教师和管理员均可查看任意班级
    students = await loop.run_in_executor(None, lambda: svc.get_class_pets(class_name))
    return {"class_name": class_name, "students": students}


# ============================================================
# 宠物聊天（SSE 流式）
# ============================================================

@pet_router.post("/chat")
async def pet_chat(request: Request, current_user: Dict = Depends(get_current_user)):
    """宠物聊天 — SSE 流式响应"""
    user = _extract_user(current_user)
    _require_access(user)
    svc = _get_service()

    body = await request.json()
    message = (body.get("message") or "").strip()
    if not message:
        raise HTTPException(400, "消息不能为空")
    if len(message) > 500:
        raise HTTPException(400, "消息过长")

    history = body.get("history", [])

    async def event_generator():
        async for event in svc.chat_stream(user["id"], message, history):
            yield event

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# ============================================================
# 管理员：历史数据补发金币
# ============================================================

@pet_router.post("/admin/backfill-coins")
async def admin_backfill_coins(current_user: Dict = Depends(get_current_user)):
    """一次性补发历史数据金币（幂等，可重复执行不会重复发放）"""
    user = _extract_user(current_user)
    if user["role"] != "admin":
        raise HTTPException(403, "仅管理员可执行")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, lambda: _get_service().backfill_teacher_coins())
    return result


# ============================================================
# 初始化
# ============================================================

def init_pet_system():
    """初始化宠物系统（建表 + 种子数据）"""
    _get_service().init_system()


__all__ = ["pet_router", "init_pet_system"]
