# learning_modes_api.py - 学习模式API路由（整合版）
"""
学习模式API:

英文写作三阶段:
- /api/learning/writing/task - 获取写作任务
- /api/learning/writing/guidance - 获取写作引导
- /api/learning/writing/feedback - 获取完成后反馈

中文语文训练:
- /api/learning/chinese/games - 获取所有游戏
- /api/learning/chinese/categories - 获取游戏类别
- /api/learning/chinese/task - 生成游戏任务
- /api/learning/chinese/scaffold - 获取引导问题
- /api/learning/chinese/feedback - 获取反馈
"""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel, Field

from app.core.dependencies import verify_token
from app.domains.learning_modes.service import (
    learning_mode_manager,
    get_available_modes,
    generate_writing_task,
    get_all_writing_tasks,
    get_writing_guidance,
    get_writing_feedback,
    get_chinese_games,
    get_chinese_categories,
    generate_chinese_task,
    get_chinese_scaffold,
    get_chinese_feedback,
    EnglishWritingMode,
    ChineseTrainingMode,
)
from app.domains.learning_modes.constants import CHINESE_GAMES, TOPIC_DOMAINS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/learning", tags=["Learning Modes"])


# ==================== 请求模型 ====================

class GenerateTaskRequest(BaseModel):
    level: str = Field(..., description="学生年级 S1-S6")
    task_type: Optional[str] = Field(None, description="任务类型")


class GuidanceRequest(BaseModel):
    student_text: str = Field(..., description="学生当前写作内容", min_length=1)
    level: str = Field(..., description="学生年级")
    guidance_type: Optional[str] = Field("general", description="引导类型")
    task_context: Optional[str] = Field(None, description="写作任务说明")


class FeedbackRequest(BaseModel):
    student_text: str = Field(..., description="学生完整写作", min_length=10)
    level: str = Field(..., description="学生年级")
    task_topic: Optional[str] = Field(None, description="写作题目")
    task_instructions: Optional[str] = Field(None, description="写作要求")


# 中文训练请求模型
class ChineseTaskRequest(BaseModel):
    game_id: str = Field(..., description="游戏ID", example="MEANING_BUILDER")
    level: str = Field(..., description="学生年级 S1-S6", example="S3")
    difficulty: int = Field(1, ge=1, le=3, description="难度 1-3")
    topic_domain: str = Field("daily_life", description="话题领域")


class ChineseScaffoldRequest(BaseModel):
    game_id: str = Field(..., description="游戏ID")
    level: str = Field(..., description="学生年级")
    student_text: str = Field(..., description="学生当前输入", min_length=1)
    task_materials: Dict[str, Any] = Field(default_factory=dict, description="任务材料")


class ChineseFeedbackRequest(BaseModel):
    game_id: str = Field(..., description="游戏ID")
    level: str = Field(..., description="学生年级")
    student_text: str = Field(..., description="学生完整答案", min_length=1)
    task_materials: Dict[str, Any] = Field(default_factory=dict, description="任务材料")


# ==================== 基础端点 ====================

@router.get("/modes")
async def get_learning_modes(user_info=Depends(verify_token)):
    """获取所有可用学习模式"""
    return learning_mode_manager.get_all_modes()


@router.get("/levels")
async def get_student_levels(user_info=Depends(verify_token)):
    """获取支持的学生年级"""
    return {
        "levels": [
            {"id": "S1", "name": "Secondary 1", "name_zh": "中一"},
            {"id": "S2", "name": "Secondary 2", "name_zh": "中二"},
            {"id": "S3", "name": "Secondary 3", "name_zh": "中三"},
            {"id": "S4", "name": "Secondary 4", "name_zh": "中四"},
            {"id": "S5", "name": "Secondary 5", "name_zh": "中五"},
            {"id": "S6", "name": "Secondary 6", "name_zh": "中六"}
        ]
    }


# ==================== 英文写作 - 阶段1: 获取任务 ====================

@router.post("/writing/task")
async def generate_writing_task_endpoint(
        request: GenerateTaskRequest,
        user_info=Depends(verify_token)
):
    """阶段1: 生成写作任务"""
    username, role = user_info

    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if request.level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid level. Must be one of {valid_levels}")

    try:
        result = generate_writing_task(request.level, request.task_type)

        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)

        logger.info(f"Writing task generated: {result.task_id} for {username}")

        return {
            "success": True,
            "task_id": result.task_id,
            "task": result.content,
            "generated_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/writing/tasks/{level}")
async def get_writing_tasks_for_level(
        level: str,
        task_type: Optional[str] = None,
        user_info=Depends(verify_token)
):
    """获取某年级的所有写作任务"""
    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid level")

    tasks = get_all_writing_tasks(level)
    if task_type:
        tasks = [t for t in tasks if t.get("type") == task_type]

    return {"level": level, "count": len(tasks), "tasks": tasks}


@router.get("/writing/types")
async def get_writing_task_types(user_info=Depends(verify_token)):
    """获取写作任务类型"""
    mode = learning_mode_manager.get_mode("english_writing")
    if isinstance(mode, EnglishWritingMode):
        return {"types": mode.get_writing_types()}
    return {"types": []}


# ==================== 英文写作 - 阶段2: 获取引导 ====================

@router.post("/writing/guidance")
async def get_guidance_endpoint(
        request: GuidanceRequest,
        user_info=Depends(verify_token)
):
    """阶段2: 获取写作引导"""
    username, role = user_info

    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if request.level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid level")

    try:
        result = get_writing_guidance(
            student_text=request.student_text,
            level=request.level,
            guidance_type=request.guidance_type or "general",
            task_context=request.task_context
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        logger.info(f"Writing guidance requested by {username}")

        return {
            "success": True,
            "phase": "guidance",
            "requires_ai_call": True,
            "system_prompt": result["system_prompt"],
            "user_message": result["user_message"],
            "level": request.level,
            "guidance_type": request.guidance_type
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get guidance: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/writing/guidance-types")
async def get_guidance_types(user_info=Depends(verify_token)):
    """获取引导类型列表"""
    mode = learning_mode_manager.get_mode("english_writing")
    if isinstance(mode, EnglishWritingMode):
        return {"types": mode.get_guidance_types()}
    return {"types": []}


# ==================== 英文写作 - 阶段3: 获取反馈 ====================

@router.post("/writing/feedback")
async def get_feedback_endpoint(
        request: FeedbackRequest,
        user_info=Depends(verify_token)
):
    """阶段3: 获取完成后反馈"""
    username, role = user_info

    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if request.level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid level")

    try:
        result = get_writing_feedback(
            student_text=request.student_text,
            level=request.level,
            task_topic=request.task_topic,
            task_instructions=request.task_instructions
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error"))

        logger.info(f"Writing feedback requested by {username}")

        return {
            "success": True,
            "phase": "feedback",
            "requires_ai_call": True,
            "system_prompt": result["system_prompt"],
            "user_message": result["user_message"],
            "level": request.level,
            "word_count": result["word_count"]
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 中文语文训练 API ====================

@router.get("/chinese/games")
async def get_chinese_games_endpoint(
        category: Optional[str] = Query(None, description="按类别筛选"),
        user_info=Depends(verify_token)
):
    """获取所有中文语文训练游戏"""
    games = get_chinese_games()

    if category:
        games = [g for g in games if g.get("category") == category]

    return {"games": games, "count": len(games)}


@router.get("/chinese/categories")
async def get_chinese_categories_endpoint(user_info=Depends(verify_token)):
    """获取中文游戏类别"""
    return {"categories": get_chinese_categories()}


@router.get("/chinese/topics")
async def get_chinese_topics(user_info=Depends(verify_token)):
    """获取话题领域"""
    return {
        "topics": [
            {"id": key, "name_zh": val["zh"], "name_en": val["en"]}
            for key, val in TOPIC_DOMAINS.items()
        ]
    }


@router.get("/chinese/games/{game_id}")
async def get_chinese_game_detail(
        game_id: str,
        user_info=Depends(verify_token)
):
    """获取单个游戏详情"""
    game = CHINESE_GAMES.get(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"Game not found: {game_id}")

    return {"game_id": game_id, **game}


# ==================== 中文训练 - 阶段1: 生成任务 ====================

@router.post("/chinese/task")
async def generate_chinese_task_endpoint(
        request: ChineseTaskRequest,
        user_info=Depends(verify_token)
):
    """
    阶段1: 生成中文游戏任务

    返回系统提示词和用户提示词，需要前端调用AI生成具体任务内容
    """
    username, role = user_info

    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if request.level not in valid_levels:
        raise HTTPException(status_code=400, detail=f"Invalid level: {request.level}")

    if request.game_id not in CHINESE_GAMES:
        raise HTTPException(status_code=400, detail=f"Invalid game_id: {request.game_id}")

    if request.topic_domain not in TOPIC_DOMAINS:
        raise HTTPException(status_code=400, detail=f"Invalid topic_domain: {request.topic_domain}")

    try:
        result = generate_chinese_task(
            game_id=request.game_id,
            level=request.level,
            difficulty=request.difficulty,
            topic_domain=request.topic_domain
        )

        if not result.success:
            raise HTTPException(status_code=400, detail=result.error)

        logger.info(f"Chinese task generated: {result.task_id} for {username}")

        return {
            "success": True,
            "task_id": result.task_id,
            "game_id": request.game_id,
            "level": request.level,
            "difficulty": request.difficulty,
            "topic_domain": request.topic_domain,
            "topic_name_zh": TOPIC_DOMAINS[request.topic_domain]["zh"],
            "game_info": result.content.get("game_info"),
            "system_prompt": result.content.get("system_prompt"),
            "user_prompt": result.content.get("user_prompt"),
            "requires_ai_call": True,
            "generated_at": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to generate Chinese task: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 中文训练 - 阶段2: 引导 ====================

@router.post("/chinese/scaffold")
async def get_chinese_scaffold_endpoint(
        request: ChineseScaffoldRequest,
        user_info=Depends(verify_token)
):
    """
    阶段2: 获取引导问题（苏格拉底式）

    当学生卡住时，提供1-3个引导问题，不直接给出答案
    """
    username, role = user_info

    if request.game_id not in CHINESE_GAMES:
        raise HTTPException(status_code=400, detail=f"Invalid game_id: {request.game_id}")

    try:
        result = get_chinese_scaffold(
            game_id=request.game_id,
            level=request.level,
            student_text=request.student_text,
            task_materials=request.task_materials
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to get scaffold"))

        logger.info(f"Chinese scaffold requested by {username} for game {request.game_id}")

        return {
            "success": True,
            "phase": "scaffold",
            "game_id": request.game_id,
            "level": request.level,
            "system_prompt": result["system_prompt"],
            "user_prompt": result["user_prompt"],
            "requires_ai_call": True,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Chinese scaffold: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 中文训练 - 阶段3: 反馈 ====================

@router.post("/chinese/feedback")
async def get_chinese_feedback_endpoint(
        request: ChineseFeedbackRequest,
        user_info=Depends(verify_token)
):
    """
    阶段3: 获取反思性反馈

    非侵入式反馈：
    - 一个优点
    - 一个改进建议
    - 一个反思问题

    不打分、不提供范文
    """
    username, role = user_info

    if request.game_id not in CHINESE_GAMES:
        raise HTTPException(status_code=400, detail=f"Invalid game_id: {request.game_id}")

    try:
        result = get_chinese_feedback(
            game_id=request.game_id,
            level=request.level,
            student_text=request.student_text,
            task_materials=request.task_materials
        )

        if not result.get("success"):
            raise HTTPException(status_code=400, detail=result.get("error", "Failed to get feedback"))

        logger.info(f"Chinese feedback requested by {username} for game {request.game_id}")

        return {
            "success": True,
            "phase": "feedback",
            "game_id": request.game_id,
            "level": request.level,
            "system_prompt": result["system_prompt"],
            "user_prompt": result["user_prompt"],
            "requires_ai_call": True,
            "timestamp": datetime.now().isoformat()
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get Chinese feedback: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ==================== 统计端点 ====================

@router.get("/stats")
async def get_learning_stats(user_info=Depends(verify_token)):
    """获取学习模式统计"""
    modes = learning_mode_manager.get_all_modes(True)
    chinese_games = get_chinese_games()
    chinese_categories = get_chinese_categories()

    return {
        "total_modes": len(modes),
        "enabled_modes": len([m for m in modes if m["enabled"]]),
        "modes": [{"id": m["mode_id"], "name": m["name"], "enabled": m["enabled"]} for m in modes],
        "chinese_training": {
            "total_games": len(chinese_games),
            "categories": len(chinese_categories),
            "games_by_category": {
                cat["id"]: len([g for g in chinese_games if g.get("category") == cat["id"]])
                for cat in chinese_categories
            }
        }
    }