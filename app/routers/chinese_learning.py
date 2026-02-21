# chinese_learning_api.py - 中文语文学习游戏API路由
"""
中文语文学习游戏API:

阶段1 - 生成任务:
- GET  /api/chinese/games - 获取所有游戏列表
- GET  /api/chinese/games/categories - 获取游戏类别
- GET  /api/chinese/games/{game_id} - 获取单个游戏信息
- POST /api/chinese/task/generate - 生成游戏任务

阶段2 - 引导学生:
- POST /api/chinese/task/scaffold - 获取引导问题（学生卡住时）

阶段3 - 反馈评价:
- POST /api/chinese/task/feedback - 获取反思性反馈

工具端点:
- GET  /api/chinese/topics - 获取话题领域
- GET  /api/chinese/levels - 获取年级列表
"""

import json
import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import APIRouter, HTTPException, Depends, Query, Body
from pydantic import BaseModel, Field

from app.core.dependencies import verify_token

# 导入游戏模块
from chinese_learning_games import (
    chinese_game_manager,
    get_all_chinese_games,
    get_chinese_games_by_category,
    get_chinese_game_categories,
    generate_chinese_task,
    get_chinese_scaffold,
    get_chinese_feedback,
    get_topic_domains,
    TOPIC_DOMAINS
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chinese", tags=["Chinese Learning Games"])


# ==================== 请求模型 ====================

class GenerateTaskRequest(BaseModel):
    """生成任务请求"""
    game_id: str = Field(..., description="游戏ID", example="MEANING_BUILDER")
    level: str = Field(..., description="学生年级 S1-S6", example="S3")
    difficulty: int = Field(1, ge=1, le=3, description="难度 1-3")
    topic_domain: str = Field("daily_life", description="话题领域")


class ScaffoldRequest(BaseModel):
    """引导请求（阶段2）"""
    game_id: str = Field(..., description="游戏ID")
    level: str = Field(..., description="学生年级")
    student_text: str = Field(..., description="学生当前输入", min_length=1)
    task_materials: Dict[str, Any] = Field(..., description="任务材料")


class FeedbackRequest(BaseModel):
    """反馈请求（阶段3）"""
    game_id: str = Field(..., description="游戏ID")
    level: str = Field(..., description="学生年级")
    student_text: str = Field(..., description="学生完整答案", min_length=1)
    task_materials: Dict[str, Any] = Field(..., description="任务材料")


class AICallRequest(BaseModel):
    """AI调用请求（用于实际调用Ollama）"""
    system_prompt: str = Field(..., description="系统提示词")
    user_prompt: str = Field(..., description="用户提示词")
    game_id: str = Field(..., description="游戏ID")
    level: str = Field(..., description="年级")
    phase: str = Field(..., description="阶段: generate/scaffold/feedback")


# ==================== 响应模型 ====================

class GameInfo(BaseModel):
    """游戏信息"""
    game_id: str
    name_zh: str
    name_en: str
    category: str
    target_skill: str
    icon: str
    description_zh: str
    description_en: str
    levels: List[str]
    difficulty_range: List[int]
    enabled: bool


class CategoryInfo(BaseModel):
    """类别信息"""
    id: str
    name_zh: str
    name_en: str
    icon: str


# ==================== 基础端点 ====================

@router.get("/games", response_model=List[GameInfo])
async def get_games(
        category: Optional[str] = Query(None, description="按类别筛选"),
        user_info=Depends(verify_token)
):
    """
    获取所有中文语文学习游戏

    可选参数:
    - category: 按类别筛选（理解/表达/结构/思维/元认知）
    """
    if category:
        games = get_chinese_games_by_category(category)
    else:
        games = get_all_chinese_games()

    return games


@router.get("/games/categories", response_model=List[CategoryInfo])
async def get_categories(user_info=Depends(verify_token)):
    """获取所有游戏类别"""
    return get_chinese_game_categories()


@router.get("/games/{game_id}")
async def get_game_detail(
        game_id: str,
        user_info=Depends(verify_token)
):
    """获取单个游戏详情"""
    game = chinese_game_manager.get_game(game_id)
    if not game:
        raise HTTPException(status_code=404, detail=f"游戏不存在: {game_id}")

    return game.get_info()


@router.get("/topics")
async def get_topics(user_info=Depends(verify_token)):
    """获取所有话题领域"""
    return {
        "topics": [
            {"id": key, "name_zh": val["zh"], "name_en": val["en"]}
            for key, val in TOPIC_DOMAINS.items()
        ]
    }


@router.get("/levels")
async def get_levels(user_info=Depends(verify_token)):
    """获取支持的学生年级"""
    return {
        "levels": [
            {"id": "S1", "name": "Secondary 1", "name_zh": "中一", "age": "12-13"},
            {"id": "S2", "name": "Secondary 2", "name_zh": "中二", "age": "13-14"},
            {"id": "S3", "name": "Secondary 3", "name_zh": "中三", "age": "14-15"},
            {"id": "S4", "name": "Secondary 4", "name_zh": "中四", "age": "15-16"},
            {"id": "S5", "name": "Secondary 5", "name_zh": "中五", "age": "16-17"},
            {"id": "S6", "name": "Secondary 6", "name_zh": "中六", "age": "17-18"}
        ]
    }


# ==================== 阶段1: 生成任务 ====================

@router.post("/task/generate")
async def generate_task(
        request: GenerateTaskRequest,
        user_info=Depends(verify_token)
):
    """
    阶段1: 生成游戏任务

    返回系统提示词和用户提示词，需要前端调用AI生成具体任务内容

    响应包含:
    - system_prompt: 系统提示词
    - user_prompt: 用户提示词
    - requires_ai_call: true（需要前端调用AI）
    """
    username, role = user_info

    # 验证年级
    valid_levels = ["S1", "S2", "S3", "S4", "S5", "S6"]
    if request.level not in valid_levels:
        raise HTTPException(
            status_code=400,
            detail=f"无效的年级: {request.level}，有效值: {valid_levels}"
        )

    # 验证话题领域
    if request.topic_domain not in TOPIC_DOMAINS:
        raise HTTPException(
            status_code=400,
            detail=f"无效的话题领域: {request.topic_domain}"
        )

    # 生成任务提示词
    result = generate_chinese_task(
        game_id=request.game_id,
        level=request.level,
        difficulty=request.difficulty,
        topic_domain=request.topic_domain
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "生成失败"))

    # 记录日志
    logger.info(f"📝 生成中文任务: {request.game_id} | 用户: {username} | 年级: {request.level}")

    return {
        "success": True,
        "phase": "generate",
        "game_id": request.game_id,
        "level": request.level,
        "difficulty": request.difficulty,
        "topic_domain": request.topic_domain,
        "topic_name_zh": TOPIC_DOMAINS[request.topic_domain]["zh"],
        "system_prompt": result["system_prompt"],
        "user_prompt": result["user_prompt"],
        "requires_ai_call": True,
        "timestamp": datetime.now().isoformat()
    }


# ==================== 阶段2: 引导学生 ====================

@router.post("/task/scaffold")
async def get_scaffold(
        request: ScaffoldRequest,
        user_info=Depends(verify_token)
):
    """
    阶段2: 获取引导问题（当学生卡住时）

    苏格拉底式引导，不直接给出答案

    返回:
    - system_prompt: 系统提示词
    - user_prompt: 用户提示词（包含学生输入和任务材料）
    - requires_ai_call: true
    """
    username, role = user_info

    result = get_chinese_scaffold(
        game_id=request.game_id,
        level=request.level,
        student_text=request.student_text,
        task_materials=request.task_materials
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "生成引导失败"))

    logger.info(f"🆘 生成引导: {request.game_id} | 用户: {username}")

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


# ==================== 阶段3: 反馈评价 ====================

@router.post("/task/feedback")
async def get_feedback(
        request: FeedbackRequest,
        user_info=Depends(verify_token)
):
    """
    阶段3: 获取反思性反馈

    非侵入式反馈，包含:
    - 一个优点
    - 一个改进建议
    - 一个反思问题

    不打分、不提供范文
    """
    username, role = user_info

    result = get_chinese_feedback(
        game_id=request.game_id,
        level=request.level,
        student_text=request.student_text,
        task_materials=request.task_materials
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("error", "生成反馈失败"))

    logger.info(f"💬 生成反馈: {request.game_id} | 用户: {username}")

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


# ==================== AI调用端点 ====================

@router.post("/ai/call")
async def call_ai(
        request: AICallRequest,
        user_info=Depends(verify_token)
):
    """
    调用AI生成内容

    这个端点接收提示词，调用本地Ollama，返回AI生成的JSON
    """
    username, role = user_info

    try:
        from llm.providers.ollama import get_ollama_provider

        provider = get_ollama_provider()
        messages = [
            {"role": "system", "content": request.system_prompt},
            {"role": "user", "content": request.user_prompt}
        ]
        ai_text = provider.invoke_with_messages(messages)

        # 尝试解析为JSON
        try:
            clean_text = ai_text.strip()
            if clean_text.startswith("```json"):
                clean_text = clean_text[7:]
            if clean_text.startswith("```"):
                clean_text = clean_text[3:]
            if clean_text.endswith("```"):
                clean_text = clean_text[:-3]
            clean_text = clean_text.strip()

            ai_json = json.loads(clean_text)

            return {
                "success": True,
                "phase": request.phase,
                "game_id": request.game_id,
                "level": request.level,
                "data": ai_json,
                "raw_response": ai_text,
                "timestamp": datetime.now().isoformat()
            }
        except json.JSONDecodeError:
            return {
                "success": True,
                "phase": request.phase,
                "game_id": request.game_id,
                "level": request.level,
                "data": None,
                "raw_response": ai_text,
                "parse_error": "无法解析为JSON",
                "timestamp": datetime.now().isoformat()
            }

    except Exception as e:
        logger.error(f"AI调用错误: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI调用失败: {str(e)}"
        )


# ==================== 完整流程端点（可选） ====================

@router.post("/task/complete")
async def complete_task_flow(
        request: GenerateTaskRequest,
        user_info=Depends(verify_token)
):
    """
    完整任务流程（直接返回AI生成的任务）

    这是一个便捷端点，直接调用AI生成完整任务
    适用于不需要前端单独管理AI调用的场景
    """
    username, role = user_info

    # 先获取提示词
    prompts = generate_chinese_task(
        game_id=request.game_id,
        level=request.level,
        difficulty=request.difficulty,
        topic_domain=request.topic_domain
    )

    if not prompts.get("success"):
        raise HTTPException(status_code=400, detail=prompts.get("error"))

    try:
        from llm.providers.ollama import get_ollama_provider

        provider = get_ollama_provider()
        messages = [
            {"role": "system", "content": prompts["system_prompt"]},
            {"role": "user", "content": prompts["user_prompt"]}
        ]
        ai_text = provider.invoke_with_messages(messages)

        # 解析JSON
        clean_text = ai_text.strip()
        if clean_text.startswith("```json"):
            clean_text = clean_text[7:]
        if clean_text.startswith("```"):
            clean_text = clean_text[3:]
        if clean_text.endswith("```"):
            clean_text = clean_text[:-3]
        clean_text = clean_text.strip()

        try:
            task_data = json.loads(clean_text)
        except json.JSONDecodeError:
            task_data = {"raw_response": ai_text}

        return {
            "success": True,
            "game_id": request.game_id,
            "level": request.level,
            "difficulty": request.difficulty,
            "topic_domain": request.topic_domain,
            "task": task_data,
            "timestamp": datetime.now().isoformat()
        }

    except Exception as e:
        logger.error(f"AI调用错误: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"AI调用失败: {str(e)}"
        )


# ==================== 统计端点 ====================

@router.get("/stats")
async def get_stats(user_info=Depends(verify_token)):
    """获取中文语文学习系统统计"""
    games = get_all_chinese_games()
    categories = get_chinese_game_categories()

    return {
        "total_games": len(games),
        "categories": len(categories),
        "games_by_category": {
            cat["id"]: len(get_chinese_games_by_category(cat["id"]))
            for cat in categories
        },
        "supported_levels": ["S1", "S2", "S3", "S4", "S5", "S6"],
        "topic_domains": len(TOPIC_DOMAINS),
        "version": "1.0.0"
    }


# ==================== 健康检查 ====================

@router.get("/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "chinese_learning_games",
        "games_loaded": len(get_all_chinese_games()),
        "timestamp": datetime.now().isoformat()
    }