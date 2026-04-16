#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
虚拟宠物系统 — Pydantic Schema

定义所有 API 请求/响应的数据格式与校验规则。
"""

from typing import List, Optional

from pydantic import BaseModel, Field, field_validator

from app.domains.pet.constants import (
    BODY_TYPE_COUNT,
    COLOR_COUNT,
    EARS_COUNT,
    EYES_COUNT,
    PATTERN_COUNT,
    PRESET_MESSAGES,
    SHOP_CATEGORIES,
    TAIL_COUNT,
)


# ============================================================
# 宠物创建 & 自定义
# ============================================================

class CreatePetRequest(BaseModel):
    """创建/自定义宠物"""
    pet_name: str = Field(..., min_length=1, max_length=20, description="宠物名字")
    body_type: int = Field(..., ge=0, lt=BODY_TYPE_COUNT)
    color_id: int = Field(..., ge=0, lt=COLOR_COUNT)
    pattern_id: int = Field(..., ge=0, lt=PATTERN_COUNT)
    eyes_id: int = Field(..., ge=0, lt=EYES_COUNT)
    ears_id: int = Field(..., ge=0, lt=EARS_COUNT)
    tail_id: int = Field(..., ge=0, lt=TAIL_COUNT)


class CustomizePetRequest(BaseModel):
    """重新自定义宠物外观（换装）"""
    pet_name: Optional[str] = Field(None, min_length=1, max_length=20)
    body_type: Optional[int] = Field(None, ge=0, lt=BODY_TYPE_COUNT)
    color_id: Optional[int] = Field(None, ge=0, lt=COLOR_COUNT)
    pattern_id: Optional[int] = Field(None, ge=0, lt=PATTERN_COUNT)
    eyes_id: Optional[int] = Field(None, ge=0, lt=EYES_COUNT)
    ears_id: Optional[int] = Field(None, ge=0, lt=EARS_COUNT)
    tail_id: Optional[int] = Field(None, ge=0, lt=TAIL_COUNT)


# ============================================================
# 商店
# ============================================================

class UseItemRequest(BaseModel):
    """使用/购买商品"""
    item_id: int = Field(..., ge=1)


# ============================================================
# 手动加减金币（教师/管理员）
# ============================================================

class AwardCoinsRequest(BaseModel):
    """手动给学生加/减金币"""
    target_type: str = Field(..., description="'class' 或 'students'")
    class_code: Optional[str] = Field(None, description="班级代码（target_type=class 时必填）")
    student_ids: Optional[List[int]] = Field(None, description="学生 ID 列表（target_type=students 时必填）")
    amount: int = Field(..., description="金额（正=奖励 负=扣除）")
    reason: str = Field(..., min_length=1, max_length=200, description="原因说明")

    @field_validator("target_type")
    @classmethod
    def validate_target_type(cls, v: str) -> str:
        if v not in ("class", "students"):
            raise ValueError("target_type 必须为 'class' 或 'students'")
        return v


# ============================================================
# 点赞/社交
# ============================================================

class LikePetRequest(BaseModel):
    """给别人点赞"""
    to_user_id: int = Field(..., ge=1)
    message_code: int = Field(0, ge=0, lt=len(PRESET_MESSAGES))


# ============================================================
# 商品管理（管理员）
# ============================================================

class CreateShopItemRequest(BaseModel):
    """创建商品"""
    name: str = Field(..., min_length=1, max_length=50)
    category: str = Field(...)
    price: int = Field(..., ge=1, le=9999)
    effect_type: str = Field(..., description="hunger / hygiene / mood / growth")
    effect_value: int = Field(..., ge=1, le=200)
    icon: str = Field("default", max_length=50)
    sort_order: int = Field(0, ge=0)

    @field_validator("category")
    @classmethod
    def validate_category(cls, v: str) -> str:
        if v not in SHOP_CATEGORIES:
            raise ValueError(f"category 必须为 {SHOP_CATEGORIES} 之一")
        return v

    @field_validator("effect_type")
    @classmethod
    def validate_effect_type(cls, v: str) -> str:
        if v not in ("hunger", "hygiene", "mood", "growth"):
            raise ValueError("effect_type 必须为 hunger/hygiene/mood/growth")
        return v
