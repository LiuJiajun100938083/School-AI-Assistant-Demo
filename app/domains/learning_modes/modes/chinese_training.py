# chinese_training.py - 中文语文训练模式
"""
ChineseTrainingMode - 中文语文训练模式（15个非侵入式学习游戏）

核心原则:
- 不监控学生，不推断个人特征
- 不提供范文（除非明确请求）
- 不打分、不排名
- 苏格拉底式引导
- 鼓励性反馈
"""

import json
import random
from datetime import datetime
from typing import Dict, List, Any

from ..models import LearningModeConfig, TaskResult
from ..constants import CHINESE_GAMES, CHINESE_CATEGORIES, TOPIC_DOMAINS
from .base import BaseLearningMode


class ChineseTrainingMode(BaseLearningMode):
    """
    中文语文训练模式 - 15个非侵入式学习游戏

    核心原则:
    - 不监控学生，不推断个人特征
    - 不提供范文（除非明确请求）
    - 不打分、不排名
    - 苏格拉底式引导
    - 鼓励性反馈
    """

    def _get_config(self) -> LearningModeConfig:
        return LearningModeConfig(
            mode_id="chinese_training",
            name="中文訓練",
            name_en="Chinese Training",
            icon="📚",
            description="15個語文訓練遊戲：理解、表達、結構、思維、元認知",
            description_en="15 Chinese language training games across 5 skill areas",
            subjects=["chinese"],
            levels=["S1", "S2", "S3", "S4", "S5", "S6"],
            enabled=True,
            order=3,
            settings={
                "games": CHINESE_GAMES,
                "categories": CHINESE_CATEGORIES,
                "topic_domains": TOPIC_DOMAINS
            }
        )

    def get_all_games(self) -> List[Dict]:
        """获取所有游戏列表"""
        return [
            {
                "game_id": game_id,
                **game_config,
                "enabled": True
            }
            for game_id, game_config in CHINESE_GAMES.items()
        ]

    def get_games_by_category(self, category: str) -> List[Dict]:
        """按类别获取游戏"""
        return [
            {"game_id": gid, **gc}
            for gid, gc in CHINESE_GAMES.items()
            if gc["category"] == category
        ]

    def get_categories(self) -> List[Dict]:
        """获取所有类别"""
        return CHINESE_CATEGORIES

    def generate_task(self, level: str, game_id: str = None, **kwargs) -> TaskResult:
        """阶段1: 生成游戏任务"""
        if not game_id:
            game_id = random.choice(list(CHINESE_GAMES.keys()))

        game = CHINESE_GAMES.get(game_id)
        if not game:
            return TaskResult(
                success=False,
                task_id="",
                mode_id="chinese_training",
                content={},
                error=f"Game not found: {game_id}"
            )

        difficulty = kwargs.get("difficulty", 1)
        topic_domain = kwargs.get("topic_domain", "daily_life")

        # 生成提示词
        prompts = self._build_generation_prompt(game_id, game, level, difficulty, topic_domain)

        task_id = f"chinese_{game_id}_{level}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return TaskResult(
            success=True,
            task_id=task_id,
            mode_id="chinese_training",
            content={
                "game_id": game_id,
                "game_info": game,
                "level": level,
                "difficulty": difficulty,
                "topic_domain": topic_domain,
                "system_prompt": prompts["system_prompt"],
                "user_prompt": prompts["user_prompt"],
                "requires_ai_call": True
            }
        )

    def _build_generation_prompt(self, game_id: str, game: Dict, level: str,
                                 difficulty: int, topic_domain: str) -> Dict[str, str]:
        """构建任务生成提示词 - 根据游戏类型使用不同的materials格式"""
        system_prompt = """You are a Non-Intrusive AI Learning Companion for Chinese Language (语文) training.

Core principles:
- Do NOT monitor the student. Do NOT infer personal traits.
- Use only the student's provided inputs (text answers).
- Do NOT provide model answers unless explicitly requested.
- Do NOT grade, rank, or assign scores.
- Focus on learning evidence: understanding, expression, structure, thinking, reflection.
- Keep guidance short, supportive, and level-appropriate.

You must always output STRICT JSON only, without markdown, without extra commentary.
All strings must be in UTF-8. Do not include trailing commas."""

        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")
        level_rule = game.get("level_rules", {}).get(level_key, "")

        # 根据游戏类型定义不同的materials格式
        materials_format = self._get_materials_format(game_id)

        user_prompt = f"""Create game_id = "{game_id}".
Goal: {game['description_zh']}

Level: {level}
Level rules: {level_rule}
Topic domain: {topic_domain}
Difficulty: {difficulty}

Output JSON with these fields:
- game_id: "{game_id}"
- title_zh: concise and engaging title in Chinese
- target_skill: "{game['target_skill']}"
- level: "{level}"
- instructions_zh: clear instructions for the student in Chinese
- materials: {materials_format}
- student_response_format: {{ "type": "text", "rules_zh": ["rule1", "rule2", "rule3"] }}

IMPORTANT: Output valid JSON only. No markdown. No comments. Chinese content only.

Generate the JSON now."""

        return {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt
        }

    def _get_materials_format(self, game_id: str) -> str:
        """根据游戏类型返回对应的materials格式说明"""
        formats = {
            # 理解类 - 需要阅读段落
            "MEANING_BUILDER": '{ "passage_zh": "一段60-150字的中文段落" }',
            "WHATS_MISSING": '{ "passage_zh": "原始段落", "incomplete_summary_zh": "遗漏关键信息的摘要" }',
            "ONE_SENTENCE_CAPTURE": '{ "passage_zh": "一段需要概括的中文段落" }',

            # 表达类
            "CLARITY_REPAIR": '{ "unclear_sentence_zh": "一个模糊不清的句子" }',
            "ONE_LINE_OPINION": '{ "question_zh": "一个需要表达立场的问题" }',
            "SAY_MORE_WITH_LESS": '{ "redundant_passage_zh": "一段包含冗余表达的段落" }',

            # 结构类 - 需要句子列表
            "LOGIC_SEQUENCER": '{ "sentences": ["句子1", "句子2", "句子3", "句子4", "句子5"] }',
            "PARAGRAPH_ROLE": '{ "passage_zh": "一个段落，学生需要判断其功能" }',
            "OUTLINE_FIRST": '{ "topic_zh": "作文题目", "requirements_zh": "写作要求" }',

            # 思维类
            "PERSPECTIVE_SWITCH": '{ "scenario_zh": "一个情境描述", "perspectives": ["角色A", "角色B"] }',
            "CHOOSE_AND_DEFEND": '{ "question_zh": "争议性问题", "options": ["观点A", "观点B"] }',
            "WHAT_IF": '{ "scenario_zh": "原始情境", "change_zh": "假设的改变" }',

            # 元认知类
            "DIFFICULTY_SPOT": '{ "task_zh": "一个学习任务描述" }',
            "CONFIDENCE_TAG": '{ "question_zh": "一个问题", "options": ["选项A", "选项B", "选项C", "选项D"] }',
            "NEXT_TIME_PLAN": '{ "feedback_zh": "之前任务的简要反馈" }',
        }
        return formats.get(game_id, '{ "passage_zh": "相关材料内容" }')

    def get_scaffold(self, game_id: str, level: str, student_text: str,
                     task_materials: Dict) -> Dict[str, Any]:
        """阶段2: 获取引导问题（苏格拉底式）"""
        system_prompt = f"""You are assisting a student who is stuck in a Chinese language training game.

Rules:
- Do NOT give the answer.
- Do NOT rewrite the student's response.
- Ask 1 to 3 guiding questions only.
- Keep questions aligned with {level} level.
- Encourage the student to use their own words.
- Questions must be in Chinese.

Output STRICT JSON only:
{{
  "type": "scaffold_questions",
  "game_id": "{game_id}",
  "level": "{level}",
  "questions_zh": ["", "", ""]
}}"""

        user_prompt = f"""The student is stuck. Generate guiding questions.

Game: {game_id}
Level: {level}
Student's current text: {student_text}
Task materials: {json.dumps(task_materials, ensure_ascii=False)}

Now produce the JSON with 1-3 guiding questions in Chinese."""

        return {
            "success": True,
            "phase": "scaffold",
            "game_id": game_id,
            "level": level,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "requires_ai_call": True
        }

    def get_feedback(self, game_id: str, level: str, student_text: str,
                     task_materials: Dict) -> Dict[str, Any]:
        """阶段3: 获取反思性反馈（非侵入式）"""
        level_desc = {
            "S1": "中一学生（12-13岁）",
            "S2": "中二学生（13-14岁）",
            "S3": "中三学生（14-15岁）",
            "S4": "中四学生（15-16岁）",
            "S5": "中五学生（16-17岁）",
            "S6": "中六学生（17-18岁）"
        }.get(level, "中学生")

        system_prompt = f"""You are providing non-intrusive reflective feedback for a Chinese language training activity.

Student level: {level_desc}

Rules:
- No scores, no grades.
- Do NOT correct every mistake.
- Do NOT provide a model answer.
- Focus on thinking, clarity, structure, and effort.
- Keep it brief and level-appropriate.
- All feedback must be in Chinese.

Output STRICT JSON only:
{{
  "type": "reflective_feedback",
  "game_id": "{game_id}",
  "level": "{level}",
  "strength_zh": "",
  "one_improvement_zh": "",
  "reflection_question_zh": ""
}}"""

        user_prompt = f"""Provide reflective feedback for this student's work.

Game: {game_id}
Level: {level}
Student's text: {student_text}
Task materials: {json.dumps(task_materials, ensure_ascii=False)}

Produce JSON with:
1. strength_zh: ONE specific strength
2. one_improvement_zh: ONE gentle suggestion
3. reflection_question_zh: ONE thoughtful question"""

        return {
            "success": True,
            "phase": "feedback",
            "game_id": game_id,
            "level": level,
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "requires_ai_call": True
        }

    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        """统一评估接口"""
        return self.get_feedback(
            game_id=kwargs.get("game_id", "MEANING_BUILDER"),
            level=kwargs.get("level", "S3"),
            student_text=response,
            task_materials=kwargs.get("task_materials", {})
        )
