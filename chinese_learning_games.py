# chinese_learning_games.py - 中文语文学习游戏模块
"""
校园AI助手 - 中文语文非侵入式学习系统

核心原则:
- 不监控学生，不推断个人特征
- 仅使用学生提供的文本输入
- 不提供范文（除非明确请求）
- 不打分、不排名
- 聚焦学习证据：理解、表达、结构、思维、反思
- 保持简短、支持性、适龄的指导

包含15个游戏，覆盖5大技能领域：
- 理解类: MEANING_BUILDER, WHATS_MISSING, ONE_SENTENCE_CAPTURE
- 表达类: CLARITY_REPAIR, ONE_LINE_OPINION, SAY_MORE_WITH_LESS
- 结构类: LOGIC_SEQUENCER, PARAGRAPH_ROLE, OUTLINE_FIRST
- 思维类: PERSPECTIVE_SWITCH, CHOOSE_AND_DEFEND, WHAT_IF
- 元认知: DIFFICULTY_SPOT, CONFIDENCE_TAG, NEXT_TIME_PLAN
"""

import json
import logging
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum

logger = logging.getLogger(__name__)


# ==================== 数据模型 ====================

class GameCategory(Enum):
    """游戏类别"""
    COMPREHENSION = "理解"
    EXPRESSION = "表达"
    STRUCTURE = "结构"
    THINKING = "思维"
    METACOGNITION = "元认知"


@dataclass
class GameConfig:
    """游戏配置"""
    game_id: str
    name_zh: str
    name_en: str
    category: GameCategory
    target_skill: str
    icon: str
    description_zh: str
    description_en: str
    levels: List[str] = field(default_factory=lambda: ["S1", "S2", "S3", "S4", "S5", "S6"])
    difficulty_range: Tuple[int, int] = (1, 3)
    enabled: bool = True


@dataclass
class GameTask:
    """游戏任务输出"""
    game_id: str
    title_zh: str
    target_skill: str
    level: str
    instructions_zh: str
    materials: Dict[str, Any]
    student_response_format: Dict[str, Any]
    ai_behavior: Dict[str, List[str]]
    teacher_note_zh: str
    next_step_prompt_hint: str
    metadata: Dict[str, Any] = field(default_factory=dict)


# ==================== 系统提示词模板 ====================

SYSTEM_PROMPT_BASE = """You are a Non-Intrusive AI Learning Companion for Chinese Language (语文) training.

Core principles:
- Do NOT monitor the student. Do NOT infer personal traits.
- Use only the student's provided inputs (text answers).
- Do NOT provide model answers unless explicitly requested in a "show example" mode.
- Do NOT grade, rank, or assign scores.
- Focus on learning evidence: understanding, expression, structure, thinking, reflection.
- Keep guidance short, supportive, and level-appropriate.

You must always output STRICT JSON only, without markdown, without extra commentary.
All strings must be in UTF-8. Do not include trailing commas."""


# ==================== 游戏基类 ====================

class BaseChineseGame(ABC):
    """中文学习游戏基类"""

    def __init__(self):
        self.config = self._get_config()

    @abstractmethod
    def _get_config(self) -> GameConfig:
        """返回游戏配置"""
        pass

    @abstractmethod
    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        """获取题目生成提示词"""
        pass

    @abstractmethod
    def get_level_rules(self) -> Dict[str, str]:
        """获取各年级的具体规则"""
        pass

    def get_info(self) -> Dict[str, Any]:
        """获取游戏信息"""
        return {
            "game_id": self.config.game_id,
            "name_zh": self.config.name_zh,
            "name_en": self.config.name_en,
            "category": self.config.category.value,
            "target_skill": self.config.target_skill,
            "icon": self.config.icon,
            "description_zh": self.config.description_zh,
            "description_en": self.config.description_en,
            "levels": self.config.levels,
            "difficulty_range": list(self.config.difficulty_range),
            "enabled": self.config.enabled
        }

    def build_input_json(self, level: str, difficulty: int = 1, topic_domain: str = "daily_life") -> Dict:
        """构建输入JSON"""
        return {
            "language": "zh",
            "level": level,
            "game_id": self.config.game_id,
            "topic_domain": topic_domain,
            "difficulty": difficulty,
            "constraints": {
                "no_sample_answer": True,
                "max_text_length_chars": self._get_max_chars_by_level(level)
            }
        }

    def _get_max_chars_by_level(self, level: str) -> int:
        """根据年级返回最大字符数"""
        char_limits = {
            "S1": 150, "S2": 180,
            "S3": 220, "S4": 260,
            "S5": 300, "S6": 350
        }
        return char_limits.get(level, 200)

    def get_full_prompt(self, level: str, difficulty: int = 1, topic_domain: str = "daily_life") -> Dict[str, str]:
        """获取完整的系统提示词和用户提示词"""
        input_json = self.build_input_json(level, difficulty, topic_domain)
        generation_prompt = self.get_generation_prompt(level, difficulty, topic_domain)

        return {
            "system_prompt": SYSTEM_PROMPT_BASE,
            "user_prompt": f"{generation_prompt}\n\nInput:\n{json.dumps(input_json, ensure_ascii=False, indent=2)}\n\nNow generate the JSON.",
            "input_json": input_json
        }


# ==================== 15个游戏实现 ====================

# ---------- 理解类游戏 ----------

class MeaningBuilderGame(BaseChineseGame):
    """Game 1: 意思重建器"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="MEANING_BUILDER",
            name_zh="意思重建器",
            name_en="Meaning Builder",
            category=GameCategory.COMPREHENSION,
            target_skill="理解",
            icon="🔄",
            description_zh="用自己的话重述段落的主要意思",
            description_en="Paraphrase the main meaning in your own words"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "60-120字段落，日常生活话题，具体内容",
            "S3-S4": "120-180字段落，包含1-2个隐含关系",
            "S5-S6": "180-250字段落，包含抽象观点或反思"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""You must output STRICT JSON following the schema.

Create game_id = "MEANING_BUILDER".
Goal: Train comprehension by paraphrasing meaning in the student's own words.

Rules for level {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}
Difficulty: {difficulty}

Output JSON fields:
- title_zh: concise and engaging title
- target_skill: "理解"
- instructions_zh: tell student to restate main meaning using own words; do not copy original sentences
- materials.passage_zh: provide ONE passage following the level rules
- student_response_format.type: "text"
- student_response_format.rules_zh: include "不可照抄原句" and length guidance
- ai_behavior.allowed: ["提出引导问题", "鼓励学生思考"]
- ai_behavior.forbidden: ["提供范文", "逐句改写学生答案", "打分"]
- teacher_note_zh: brief note for teachers
- next_step_prompt_hint: a short prompt instructing the next stage AI to ask 1-3 guiding questions if student is stuck"""


class WhatsMissingGame(BaseChineseGame):
    """Game 2: 关键信息消失挑战"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="WHATS_MISSING",
            name_zh="关键信息消失挑战",
            name_en="What's Missing",
            category=GameCategory.COMPREHENSION,
            target_skill="理解",
            icon="🔍",
            description_zh="找出摘要中遗漏的关键信息并说明原因",
            description_en="Identify missing key information and justify why it matters"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "短段落 + 遗漏一个关键细节的摘要",
            "S3-S4": "段落 + 遗漏因果/条件的不完整摘要",
            "S5-S6": "段落 + 遗漏核心论点/证据的不完整摘要"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "WHATS_MISSING".
Goal: Identify missing key information and justify why it matters.

Level rules for {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}

materials must include:
- passage_zh: the original passage
- items[0].label: "incomplete_summary_zh"
- items[0].content: the incomplete summary with something important missing

instructions_zh must ask:
1) What important info is missing?
2) Why is it important?

ai_behavior.forbidden: ["提供范文", "打分", "直接告诉遗漏内容"]"""


class OneSentenceCaptureGame(BaseChineseGame):
    """Game 3: 一句话抓重点"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="ONE_SENTENCE_CAPTURE",
            name_zh="一句话抓重点",
            name_en="One Sentence Capture",
            category=GameCategory.COMPREHENSION,
            target_skill="理解",
            icon="🎯",
            description_zh="用一句话概括段落的核心要点",
            description_en="Summarize the main point in exactly ONE sentence"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "50-100字段落；允许简单句",
            "S3-S4": "100-160字段落；要求完整意思+关键细节",
            "S5-S6": "160-230字段落；要求抽象主旨+立场/含义"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "ONE_SENTENCE_CAPTURE".
Goal: Summarize the main point in exactly ONE sentence.

Level rules for {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}

instructions_zh must include:
- "只能写一句话"
- "必须包含最重要的信息"
- "不要抄原句"

student_response_format.rules_zh must include a max character limit appropriate for the level.

ai_behavior.forbidden: ["提供范文", "打分", "改写学生答案"]"""


# ---------- 表达类游戏 ----------

class ClarityRepairGame(BaseChineseGame):
    """Game 4: 模糊句修复"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="CLARITY_REPAIR",
            name_zh="模糊句修复",
            name_en="Clarity Repair",
            category=GameCategory.EXPRESSION,
            target_skill="表达",
            icon="🔧",
            description_zh="修改模糊的句子使其更清晰，但不添加新内容",
            description_en="Improve clarity without adding new content"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "短句，日常情境",
            "S3-S4": "包含1-2个因果短语",
            "S5-S6": "包含抽象表达，要求精确"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "CLARITY_REPAIR".
Goal: Improve clarity without adding new content.

Level rules for {level}:
- {level_rules[level_key]}

materials must include:
- items: array with 3 ambiguous-but-grammatical sentences in Chinese
Each item: {{ "label": "sentence", "content": "..." }}

instructions_zh:
- Choose ONE sentence to revise
- Make it clearer (who/what/why) but do NOT add new facts

ai_behavior.forbidden: ["改写成长段落", "提供最佳答案", "打分"]"""


class OneLineOpinionGame(BaseChineseGame):
    """Game 5: 一句话立场"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="ONE_LINE_OPINION",
            name_zh="一句话立场",
            name_en="One Line Opinion",
            category=GameCategory.EXPRESSION,
            target_skill="表达",
            icon="💬",
            description_zh="用一句话表达清晰立场和理由",
            description_en="Express a clear stance + one reason in ONE sentence"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单话题（校规、习惯）",
            "S3-S4": "日常伦理（助人、时间管理）",
            "S5-S6": "社会议题（课堂科技、隐私），保持中立"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "ONE_LINE_OPINION".
Goal: Express a clear stance + one reason in ONE sentence.

Level rules for {level}:
- {level_rules[level_key]}

materials:
- passage_zh OR scenario_zh in items[0]

instructions_zh:
- "只能一句话"
- "必须包含：立场 + 原因"
- "理由要对应立场"

ai_behavior.forbidden: ["提供范文", "打分", "评判立场对错"]"""


class SayMoreWithLessGame(BaseChineseGame):
    """Game 6: 删词挑战"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="SAY_MORE_WITH_LESS",
            name_zh="删词挑战",
            name_en="Say More With Less",
            category=GameCategory.EXPRESSION,
            target_skill="表达",
            icon="✂️",
            description_zh="删除冗余词句，保持原意",
            description_en="Remove redundancy while keeping meaning"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "60-80字冗余段落",
            "S3-S4": "80-120字冗余段落",
            "S5-S6": "120-160字冗余段落"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "SAY_MORE_WITH_LESS".
Goal: Remove redundancy while keeping meaning.

Level rules for {level}:
- {level_rules[level_key]}

materials.items:
- label: "wordy_text_zh"
- content: provide one wordy paragraph with obvious redundancy

instructions_zh:
- "删掉多余的词句"
- "不改变原意"
- "尽量更精炼"

ai_behavior.forbidden: ["提供精简后的范文", "打分"]"""


# ---------- 结构类游戏 ----------

class LogicSequencerGame(BaseChineseGame):
    """Game 7: 句子排序师"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="LOGIC_SEQUENCER",
            name_zh="句子排序师",
            name_en="Logic Sequencer",
            category=GameCategory.STRUCTURE,
            target_skill="结构",
            icon="🔢",
            description_zh="将打乱的句子排成连贯段落并说明理由",
            description_en="Reorder sentences into a coherent paragraph and explain reasoning"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "4-5个简单句",
            "S3-S4": "5-6个句子，含因果关系",
            "S5-S6": "6-7个句子，含对比和总结"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "LOGIC_SEQUENCER".
Goal: Reorder sentences into a coherent paragraph and explain reasoning.

Level rules for {level}:
- {level_rules[level_key]}

materials.items:
- Provide shuffled sentences, each as {{ "label": "sentence_1", "content": "..." }}
- The sentences when correctly ordered should form a logical paragraph

instructions_zh:
1) Reorder into correct sequence (write the order numbers)
2) Explain why (1-2 sentences)

ai_behavior.forbidden: ["提供正确顺序", "打分"]"""


class ParagraphRoleGame(BaseChineseGame):
    """Game 8: 段落功能判断"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="PARAGRAPH_ROLE",
            name_zh="段落功能判断",
            name_en="Paragraph Role",
            category=GameCategory.STRUCTURE,
            target_skill="结构",
            icon="📊",
            description_zh="判断段落的主要功能并提供文本证据",
            description_en="Identify the paragraph's main role and justify"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "功能明确的简单段落",
            "S3-S4": "功能较复杂的段落",
            "S5-S6": "可能有多重功能的段落"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        return f"""Output STRICT JSON only.

Create game_id = "PARAGRAPH_ROLE".
Goal: Identify the paragraph's main role and justify.

Level: {level}

materials.passage_zh: one paragraph appropriate for the level

materials.items:
- label: "roles"
- content: '["交代背景","提出观点","举例说明","分析原因","总结提升"]'

instructions_zh:
- Pick ONE role that best describes this paragraph
- Provide textual evidence (quote 3-8 characters only, not full sentences)

ai_behavior.forbidden: ["提供正确答案", "打分"]"""


class OutlineFirstGame(BaseChineseGame):
    """Game 9: 作文骨架搭建"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="OUTLINE_FIRST",
            name_zh="作文骨架搭建",
            name_en="Outline First",
            category=GameCategory.STRUCTURE,
            target_skill="结构",
            icon="🏗️",
            description_zh="为作文题目搭建大纲框架，不写完整段落",
            description_en="Build an outline without writing full essay"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "三段式简单大纲",
            "S3-S4": "包含至少一个理由或例子",
            "S5-S6": "包含反面观点或反思"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "OUTLINE_FIRST".
Goal: Build an outline without writing full essay.

Level rules for {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}

materials:
- items[0].label: "topic_zh" - provide a writing topic suitable for the level
- items[1].label: "word_count_target" - suggested word count

instructions_zh:
- Provide: 开头(1句目的), 主体(2-3段每段要点), 结尾(1句目的)
- Do NOT write full paragraphs

ai_behavior.forbidden: ["提供完整大纲范文", "打分"]"""


# ---------- 思维类游戏 ----------

class PerspectiveSwitchGame(BaseChineseGame):
    """Game 10: 换位思考机"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="PERSPECTIVE_SWITCH",
            name_zh="换位思考机",
            name_en="Perspective Switch",
            category=GameCategory.THINKING,
            target_skill="思维",
            icon="🔀",
            description_zh="从另一个人的角度重新描述同一事件",
            description_en="Reframe the same event from another person's perspective"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单情境，2个明确角色",
            "S3-S4": "日常冲突情境",
            "S5-S6": "复杂社会情境"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "PERSPECTIVE_SWITCH".
Goal: Reframe the same event from another person's perspective.

Level rules for {level}:
- {level_rules[level_key]}

materials.items:
- label: "scenario_zh" - a short scenario
- label: "roles_zh" - two roles to choose from (e.g., "学生" / "老师")

instructions_zh:
- Choose the other role (not the narrator)
- Write 3-5 sentences describing thoughts and reasons

ai_behavior.forbidden: ["评判角色的道德", "提供范文", "打分"]"""


class ChooseAndDefendGame(BaseChineseGame):
    """Game 11: 观点对决"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="CHOOSE_AND_DEFEND",
            name_zh="观点对决",
            name_en="Choose and Defend",
            category=GameCategory.THINKING,
            target_skill="思维",
            icon="⚔️",
            description_zh="选择一个观点并用理由辩护",
            description_en="Choose between two viewpoints and defend with reasons"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "选择 + 1个理由",
            "S3-S4": "选择 + 2个理由",
            "S5-S6": "选择 + 2个理由 + 1个可能的弱点/反驳"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "CHOOSE_AND_DEFEND".
Goal: Choose between two viewpoints and defend with reasons.

Level rules for {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}

materials.items:
- label: "viewpoint_A_zh" - first viewpoint
- label: "viewpoint_B_zh" - opposing viewpoint

instructions_zh based on level:
- S1-S2: Choose A or B, provide 1 reason
- S3-S4: Choose A or B, provide 2 reasons
- S5-S6: Choose A or B, provide 2 reasons + 1 possible weakness of your chosen viewpoint

ai_behavior.forbidden: ["评判观点对错", "提供范文", "打分"]"""


class WhatIfGame(BaseChineseGame):
    """Game 12: 如果……会怎样"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="WHAT_IF",
            name_zh="如果……会怎样",
            name_en="What If",
            category=GameCategory.THINKING,
            target_skill="思维",
            icon="🤔",
            description_zh="预测当关键条件改变时结果会如何变化",
            description_en="Predict outcome changes when a key condition changes"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单情境，明显的因果",
            "S3-S4": "日常情境，需要推理",
            "S5-S6": "复杂情境，多重影响"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        level_rules = self.get_level_rules()
        level_key = "S1-S2" if level in ["S1", "S2"] else ("S3-S4" if level in ["S3", "S4"] else "S5-S6")

        return f"""Output STRICT JSON only.

Create game_id = "WHAT_IF".
Goal: Predict outcome changes when a key condition changes.

Level rules for {level}:
- {level_rules[level_key]}

Topic domain: {topic_domain}

materials.items:
- label: "original_scenario_zh" - describe the original situation
- label: "changed_condition_zh" - the hypothetical change

instructions_zh:
- Explain: what changes + why (2-5 sentences depending on level)

ai_behavior.forbidden: ["提供范文", "打分"]"""


# ---------- 元认知类游戏 ----------

class DifficultySpotGame(BaseChineseGame):
    """Game 13: 难点定位"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="DIFFICULTY_SPOT",
            name_zh="难点定位",
            name_en="Difficulty Spot",
            category=GameCategory.METACOGNITION,
            target_skill="元认知",
            icon="🎯",
            description_zh="反思哪个部分最难以及原因",
            description_en="Metacognitive reflection on difficulty and reason"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单的难点描述",
            "S3-S4": "需要具体说明原因",
            "S5-S6": "需要分析学习策略"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        return f"""Output STRICT JSON only.

Create game_id = "DIFFICULTY_SPOT".
Goal: Metacognitive reflection on difficulty and reason.

Level: {level}

materials.items:
- label: "task_context_zh" - describe what the student just did (generic, like "完成了一篇阅读理解")

instructions_zh:
- Answer 2 questions:
  1) Which part was hardest?
  2) Why was it hard? (one concrete reason)

Output must encourage honesty and emphasize no penalty for admitting difficulty.

ai_behavior.allowed: ["鼓励诚实反思", "提出引导问题"]
ai_behavior.forbidden: ["打分", "评判难点选择"]"""


class ConfidenceTagGame(BaseChineseGame):
    """Game 14: 信心标注"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="CONFIDENCE_TAG",
            name_zh="信心标注",
            name_en="Confidence Tag",
            category=GameCategory.METACOGNITION,
            target_skill="元认知",
            icon="📊",
            description_zh="训练信心校准能力",
            description_en="Train confidence calibration"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单问题",
            "S3-S4": "中等难度问题",
            "S5-S6": "较难的推理问题"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        return f"""Output STRICT JSON only.

Create game_id = "CONFIDENCE_TAG".
Goal: Train confidence calibration.

Level: {level}
Topic domain: {topic_domain}

materials.items:
- label: "mini_question_zh" - one short question appropriate for the level
- label: "confidence_scale_zh" - "很确定 / 有点不确定 / 猜的"

instructions_zh:
- Provide your answer to the question
- Then choose one confidence tag
- Then write one sentence: why you chose that tag

ai_behavior.forbidden: ["打分", "评判信心选择"]"""


class NextTimePlanGame(BaseChineseGame):
    """Game 15: 我会怎么改"""

    def _get_config(self) -> GameConfig:
        return GameConfig(
            game_id="NEXT_TIME_PLAN",
            name_zh="我会怎么改",
            name_en="Next Time Plan",
            category=GameCategory.METACOGNITION,
            target_skill="元认知",
            icon="📝",
            description_zh="计划下次的一个改进步骤",
            description_en="Plan an improvement step without rewriting"
        )

    def get_level_rules(self) -> Dict[str, str]:
        return {
            "S1-S2": "简单的改进计划",
            "S3-S4": "具体可行的改进步骤",
            "S5-S6": "需要说明具体行动和时间"
        }

    def get_generation_prompt(self, level: str, difficulty: int, topic_domain: str) -> str:
        return f"""Output STRICT JSON only.

Create game_id = "NEXT_TIME_PLAN".
Goal: Plan an improvement step without rewriting.

Level: {level}

materials.items:
- label: "student_work_summary_zh" - a brief neutral summary of a generic task they might have done

instructions_zh:
- Answer:
  1) If you do it again, what ONE thing will you improve?
  2) What action will you take? (must be specific and doable in 5 minutes)

ai_behavior.forbidden: ["打分", "提供改进范文"]"""


# ==================== 引导阶段（Stage 2）====================

class ScaffoldingHelper:
    """引导阶段助手 - 当学生卡住时提供苏格拉底式引导"""

    @staticmethod
    def get_scaffold_prompt(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict[str, str]:
        """获取引导阶段的提示词"""

        system_prompt = """You are assisting a student who is stuck in a Chinese language training game.

Rules:
- Do NOT give the answer.
- Do NOT rewrite the student's response.
- Ask 1 to 3 guiding questions only.
- Keep questions aligned with the student level.
- Encourage the student to use their own words.
- Questions must be in Chinese.

Output STRICT JSON only with the following structure:
{
  "type": "scaffold_questions",
  "game_id": "",
  "level": "",
  "questions_zh": ["", "", ""]
}"""

        user_prompt = f"""The student is stuck. Generate guiding questions.

Input:
{{
  "game_id": "{game_id}",
  "level": "{level}",
  "student_text": "{student_text}",
  "task_materials": {json.dumps(task_materials, ensure_ascii=False)}
}}

Now produce the JSON with 1-3 guiding questions in Chinese."""

        return {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "phase": "scaffold"
        }


# ==================== 反馈阶段（Stage 3）====================

class FeedbackHelper:
    """反馈阶段助手 - 提供非侵入式的反思性反馈"""

    @staticmethod
    def get_feedback_prompt(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict[str, str]:
        """获取反馈阶段的提示词"""

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

Output STRICT JSON only with the following structure:
{{
  "type": "reflective_feedback",
  "game_id": "",
  "level": "",
  "strength_zh": "",
  "one_improvement_zh": "",
  "reflection_question_zh": ""
}}"""

        user_prompt = f"""Provide reflective feedback for this student's work.

Input:
{{
  "game_id": "{game_id}",
  "level": "{level}",
  "student_text": "{student_text}",
  "task_materials": {json.dumps(task_materials, ensure_ascii=False)}
}}

Now produce the JSON with:
1. strength_zh: ONE specific strength (genuine and specific)
2. one_improvement_zh: ONE gentle suggestion for improvement
3. reflection_question_zh: ONE thoughtful question to encourage reflection"""

        return {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "phase": "feedback"
        }


# ==================== 游戏管理器 ====================

class ChineseGameManager:
    """中文语文游戏管理器"""
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self._games: Dict[str, BaseChineseGame] = {}
        self._initialized = True
        self._register_all_games()
        logger.info(f"✅ ChineseGameManager initialized with {len(self._games)} games")

    def _register_all_games(self):
        """注册所有15个游戏"""
        games = [
            # 理解类
            MeaningBuilderGame(),
            WhatsMissingGame(),
            OneSentenceCaptureGame(),
            # 表达类
            ClarityRepairGame(),
            OneLineOpinionGame(),
            SayMoreWithLessGame(),
            # 结构类
            LogicSequencerGame(),
            ParagraphRoleGame(),
            OutlineFirstGame(),
            # 思维类
            PerspectiveSwitchGame(),
            ChooseAndDefendGame(),
            WhatIfGame(),
            # 元认知类
            DifficultySpotGame(),
            ConfidenceTagGame(),
            NextTimePlanGame(),
        ]

        for game in games:
            self._games[game.config.game_id] = game

    def get_game(self, game_id: str) -> Optional[BaseChineseGame]:
        """获取指定游戏"""
        return self._games.get(game_id)

    def get_all_games(self, include_disabled: bool = False) -> List[Dict[str, Any]]:
        """获取所有游戏信息"""
        games = []
        for game in self._games.values():
            if include_disabled or game.config.enabled:
                games.append(game.get_info())
        return games

    def get_games_by_category(self, category: str) -> List[Dict[str, Any]]:
        """按类别获取游戏"""
        return [
            game.get_info()
            for game in self._games.values()
            if game.config.category.value == category and game.config.enabled
        ]

    def get_categories(self) -> List[Dict[str, Any]]:
        """获取所有类别"""
        return [
            {"id": "理解", "name_zh": "理解类", "name_en": "Comprehension", "icon": "📖"},
            {"id": "表达", "name_zh": "表达类", "name_en": "Expression", "icon": "💬"},
            {"id": "结构", "name_zh": "结构类", "name_en": "Structure", "icon": "🏗️"},
            {"id": "思维", "name_zh": "思维类", "name_en": "Thinking", "icon": "🧠"},
            {"id": "元认知", "name_zh": "元认知类", "name_en": "Metacognition", "icon": "🔍"},
        ]

    def generate_task_prompt(self, game_id: str, level: str, difficulty: int = 1,
                             topic_domain: str = "daily_life") -> Dict[str, Any]:
        """生成任务提示词（阶段1）"""
        game = self.get_game(game_id)
        if not game:
            return {"success": False, "error": f"Game not found: {game_id}"}

        if level not in game.config.levels:
            return {"success": False, "error": f"Invalid level: {level}"}

        prompts = game.get_full_prompt(level, difficulty, topic_domain)

        return {
            "success": True,
            "phase": "generate",
            "game_id": game_id,
            "level": level,
            "difficulty": difficulty,
            "topic_domain": topic_domain,
            "system_prompt": prompts["system_prompt"],
            "user_prompt": prompts["user_prompt"],
            "input_json": prompts["input_json"],
            "requires_ai_call": True
        }

    def get_scaffold_prompt(self, game_id: str, level: str, student_text: str,
                            task_materials: Dict) -> Dict[str, Any]:
        """获取引导提示词（阶段2）"""
        game = self.get_game(game_id)
        if not game:
            return {"success": False, "error": f"Game not found: {game_id}"}

        prompts = ScaffoldingHelper.get_scaffold_prompt(game_id, level, student_text, task_materials)

        return {
            "success": True,
            **prompts,
            "game_id": game_id,
            "level": level,
            "requires_ai_call": True
        }

    def get_feedback_prompt(self, game_id: str, level: str, student_text: str,
                            task_materials: Dict) -> Dict[str, Any]:
        """获取反馈提示词（阶段3）"""
        game = self.get_game(game_id)
        if not game:
            return {"success": False, "error": f"Game not found: {game_id}"}

        prompts = FeedbackHelper.get_feedback_prompt(game_id, level, student_text, task_materials)

        return {
            "success": True,
            **prompts,
            "game_id": game_id,
            "level": level,
            "requires_ai_call": True
        }


# ==================== 全局实例 ====================

chinese_game_manager = ChineseGameManager()


# ==================== 便捷函数 ====================

def get_all_chinese_games() -> List[Dict]:
    """获取所有中文游戏"""
    return chinese_game_manager.get_all_games()


def get_chinese_games_by_category(category: str) -> List[Dict]:
    """按类别获取中文游戏"""
    return chinese_game_manager.get_games_by_category(category)


def get_chinese_game_categories() -> List[Dict]:
    """获取所有游戏类别"""
    return chinese_game_manager.get_categories()


def generate_chinese_task(game_id: str, level: str, difficulty: int = 1,
                          topic_domain: str = "daily_life") -> Dict:
    """生成中文游戏任务（阶段1）"""
    return chinese_game_manager.generate_task_prompt(game_id, level, difficulty, topic_domain)


def get_chinese_scaffold(game_id: str, level: str, student_text: str,
                         task_materials: Dict) -> Dict:
    """获取引导提示（阶段2）"""
    return chinese_game_manager.get_scaffold_prompt(game_id, level, student_text, task_materials)


def get_chinese_feedback(game_id: str, level: str, student_text: str,
                         task_materials: Dict) -> Dict:
    """获取反馈提示（阶段3）"""
    return chinese_game_manager.get_feedback_prompt(game_id, level, student_text, task_materials)


# ==================== 话题领域 ====================

TOPIC_DOMAINS = {
    "daily_life": {"zh": "日常生活", "en": "Daily Life"},
    "school_life": {"zh": "校园生活", "en": "School Life"},
    "family": {"zh": "家庭", "en": "Family"},
    "friendship": {"zh": "友谊", "en": "Friendship"},
    "technology": {"zh": "科技", "en": "Technology"},
    "environment": {"zh": "环境", "en": "Environment"},
    "culture": {"zh": "文化", "en": "Culture"},
    "sports": {"zh": "体育", "en": "Sports"},
    "arts": {"zh": "艺术", "en": "Arts"},
    "society": {"zh": "社会", "en": "Society"},
}


def get_topic_domains() -> Dict:
    """获取所有话题领域"""
    return TOPIC_DOMAINS


# ==================== 测试代码 ====================

if __name__ == "__main__":
    print("=" * 60)
    print("🎮 中文语文学习游戏系统测试")
    print("=" * 60)

    # 测试获取所有游戏
    print("\n📋 所有游戏列表:")
    games = get_all_chinese_games()
    for game in games:
        print(f"  {game['icon']} {game['game_id']}: {game['name_zh']} ({game['category']})")

    # 测试按类别获取
    print("\n📂 按类别分组:")
    for cat in get_chinese_game_categories():
        print(f"\n  {cat['icon']} {cat['name_zh']}:")
        cat_games = get_chinese_games_by_category(cat['id'])
        for g in cat_games:
            print(f"    - {g['name_zh']}")

    # 测试生成任务
    print("\n🎯 测试生成任务 (MEANING_BUILDER, S3):")
    result = generate_chinese_task("MEANING_BUILDER", "S3", difficulty=2, topic_domain="school_life")
    if result["success"]:
        print(f"  ✅ 成功生成提示词")
        print(f"  系统提示词长度: {len(result['system_prompt'])} 字符")
        print(f"  用户提示词长度: {len(result['user_prompt'])} 字符")
    else:
        print(f"  ❌ 失败: {result['error']}")

    # 测试引导阶段
    print("\n🆘 测试引导阶段:")
    scaffold = get_chinese_scaffold(
        "MEANING_BUILDER", "S3",
        "我不知道怎么写...",
        {"passage_zh": "测试段落"}
    )
    print(f"  ✅ 引导提示词生成成功" if scaffold["success"] else f"  ❌ 失败")

    # 测试反馈阶段
    print("\n💬 测试反馈阶段:")
    feedback = get_chinese_feedback(
        "MEANING_BUILDER", "S3",
        "这段话主要讲的是学习的重要性。",
        {"passage_zh": "测试段落"}
    )
    print(f"  ✅ 反馈提示词生成成功" if feedback["success"] else f"  ❌ 失败")

    print("\n" + "=" * 60)
    print("✅ 测试完成")
    print("=" * 60)