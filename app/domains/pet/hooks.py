#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
宠物金币挂钩 — 轻量工具函数

其他 service（dictation、mistake_book、class_diary 等）在关键操作完成后
调用这里的函数给用户加/减金币。

设计原则：
- 所有异常静默吞掉，绝不影响原有业务
- 用户没有宠物时静默跳过
- 每个函数都是独立的，不需要 import pet service 的其他东西
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


def try_award_coins(user_id: int, source_type: str,
                    source_id: Optional[str] = None,
                    user_role: str = "student") -> None:
    """
    尝试给用户加金币。静默失败，不影响调用方。

    Args:
        user_id: 用户 ID
        source_type: 金币来源（必须在 STUDENT/TEACHER_COIN_SOURCES 中注册）
        source_id: 唯一标识（防重复发放，None 则不防重复）
        user_role: 'student' 或 'teacher'
    """
    try:
        from app.services.container import get_services
        svc = get_services().pet
        pet = svc._pet.get_by_user(user_id)
        if not pet:
            return  # 没有宠物，跳过
        svc.award_coins(
            user_id=user_id,
            user_role=user_role,
            source_type=source_type,
            source_id=source_id,
        )
        # 同时更新 streak
        svc.record_activity(user_id, user_role)
    except Exception as e:
        logger.debug("宠物金币挂钩静默失败 (user=%d, source=%s): %s", user_id, source_type, e)


def try_award_coins_batch(user_ids: list, source_type: str,
                          source_id_prefix: str = "",
                          user_role: str = "student") -> None:
    """批量给多个用户加金币（如课室日志表扬多人）"""
    for uid in user_ids:
        sid = f"{source_id_prefix}_{uid}" if source_id_prefix else None
        try_award_coins(uid, source_type, sid, user_role)


def _resolve_user_id(username: str) -> Optional[int]:
    """从 username 查 user_id，缓存友好"""
    try:
        from app.domains.user.repository import UserRepository
        user = UserRepository().find_by_username(username)
        return user["id"] if user else None
    except Exception:
        return None


def try_award_coins_by_username(username: str, source_type: str,
                                source_id: Optional[str] = None,
                                user_role: str = "student") -> None:
    """根据 username 尝试给金币（某些 service 只有 username 没有 user_id）"""
    uid = _resolve_user_id(username)
    if uid:
        try_award_coins(uid, source_type, source_id, user_role)


def try_award_coins_by_display_names(display_names: list, class_code: str,
                                     source_type: str,
                                     source_id_prefix: str = "") -> None:
    """根据显示名 + 班级查找学生 user_id 并加金币（课室日志用）"""
    if not display_names:
        return
    try:
        from app.domains.user.repository import UserRepository
        repo = UserRepository()
        for name in display_names:
            name = name.strip()
            if not name:
                continue
            # 用 display_name + class_name 精确匹配
            user = repo.find_one(
                "display_name = %s AND class_name = %s AND is_active = TRUE",
                (name, class_code)
            )
            if user:
                sid = f"{source_id_prefix}_{user['id']}" if source_id_prefix else None
                try_award_coins(user["id"], source_type, sid, "student")
    except Exception as e:
        logger.debug("课室日志金币挂钩失败: %s", e)


def try_add_subject_xp(user_id: int, activity_key: str) -> None:
    """尝试给用户增加学科 XP。静默失败。"""
    try:
        from app.services.container import get_services
        get_services().pet.add_subject_xp(user_id, activity_key)
    except Exception as e:
        logger.debug("宠物学科XP挂钩静默失败 (user=%d, key=%s): %s", user_id, activity_key, e)
