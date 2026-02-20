# learning_modes.py - 可扩展的学习模式模块
"""
AI学习伙伴 - 学习模式管理系统

包含:
1. 英文写作模块（三个阶段）
2. 中文语文训练模块（15个游戏）
3. AI问答模式
"""

import json
import logging
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Tuple

logger = logging.getLogger(__name__)


# ==================== 数据模型 ====================

@dataclass
class LearningModeConfig:
    """学习模式配置"""
    mode_id: str
    name: str
    name_en: str
    icon: str
    description: str
    description_en: str
    subjects: List[str]
    levels: List[str]
    enabled: bool = True
    order: int = 0
    settings: Dict[str, Any] = field(default_factory=dict)


@dataclass
class TaskResult:
    """任务生成结果"""
    success: bool
    task_id: str
    mode_id: str
    content: Dict[str, Any]
    metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None


# ==================== 学习模式基类 ====================

class BaseLearningMode(ABC):
    """学习模式基类"""

    def __init__(self):
        self.config: LearningModeConfig = self._get_config()

    @abstractmethod
    def _get_config(self) -> LearningModeConfig:
        pass

    @abstractmethod
    def generate_task(self, level: str, subject: str = None, **kwargs) -> TaskResult:
        pass

    @abstractmethod
    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        pass

    def get_info(self) -> Dict[str, Any]:
        return {
            "mode_id": self.config.mode_id,
            "name": self.config.name,
            "name_en": self.config.name_en,
            "icon": self.config.icon,
            "description": self.config.description,
            "description_en": self.config.description_en,
            "subjects": self.config.subjects,
            "levels": self.config.levels,
            "enabled": self.config.enabled,
            "order": self.config.order
        }


# ==================== 问答模式 ====================

class QAMode(BaseLearningMode):
    """问答学习模式"""

    def _get_config(self) -> LearningModeConfig:
        return LearningModeConfig(
            mode_id="qa",
            name="AI 問答",
            name_en="AI Q&A",
            icon="💬",
            description="向AI提問，獲取學科知識解答",
            description_en="Ask AI questions about your subjects",
            subjects=["all"],
            levels=["S1", "S2", "S3", "S4", "S5", "S6"],
            enabled=True,
            order=1
        )

    def generate_task(self, level: str, subject: str = None, **kwargs) -> TaskResult:
        return TaskResult(
            success=True,
            task_id=f"qa_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            mode_id="qa",
            content={"type": "welcome", "message": "歡迎使用AI問答！"}
        )

    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        return {"evaluated": False}


# ==================== 英文写作学习模式（整合三阶段）====================

class EnglishWritingMode(BaseLearningMode):
    """
    英文写作学习模式 - 整合三个阶段

    阶段1: 获取写作任务 (generate_task)
    阶段2: 写作过程引导 (get_guidance) - 苏格拉底式，不改写
    阶段3: 完成后反馈 (get_feedback) - 鼓励性，不打分
    """

    def _get_config(self) -> LearningModeConfig:
        return LearningModeConfig(
            mode_id="english_writing",
            name="英文寫作",
            name_en="English Writing",
            icon="✏️",
            description="完整的寫作學習：獲取題目 → 寫作引導 → 反饋評語",
            description_en="Complete writing journey: Get task → Guidance → Feedback",
            subjects=["english"],
            levels=["S1", "S2", "S3", "S4", "S5", "S6"],
            enabled=True,
            order=2,
            settings={
                "word_range": {
                    "S1": {"min": 60, "max": 80},
                    "S2": {"min": 80, "max": 100},
                    "S3": {"min": 120, "max": 150},
                    "S4": {"min": 150, "max": 180},
                    "S5": {"min": 200, "max": 250},
                    "S6": {"min": 250, "max": 300}
                }
            }
        )

    # ==================== 写作任务模板 ====================

    def _get_task_templates(self) -> Dict[str, List[Dict]]:
        return {
            "S1": [
                {"topic": "My Favourite Place at Home",
                 "instructions": "Write a short paragraph (60–80 words) describing your favourite place at home. Explain what this place looks like and why you like spending time there.",
                 "guiding_questions": ["Where is this place?", "What do you usually do there?",
                                       "How does it make you feel?"], "type": "descriptive"},
                {"topic": "My Best Friend",
                 "instructions": "Write a short paragraph (60–80 words) about your best friend. Describe who they are and why they are special to you.",
                 "guiding_questions": ["How did you meet?", "What do you like about them?",
                                       "What activities do you do together?"], "type": "descriptive"},
                {"topic": "My Favourite Food",
                 "instructions": "Write a short paragraph (60–80 words) about your favourite food. Describe what it tastes like and when you usually eat it.",
                 "guiding_questions": ["What is your favourite food?", "Why do you like it?",
                                       "When do you usually eat it?"], "type": "descriptive"},
                {"topic": "A Fun Weekend",
                 "instructions": "Write a short paragraph (60–80 words) about a fun weekend you had. Describe what you did and who you were with.",
                 "guiding_questions": ["What did you do?", "Who was with you?", "Why was it fun?"],
                 "type": "narrative"},
                {"topic": "My School Bag",
                 "instructions": "Write a short paragraph (60–80 words) describing your school bag. Tell us what is inside and why you chose this bag.",
                 "guiding_questions": ["What does your bag look like?", "What items are inside?",
                                       "Why did you choose it?"], "type": "descriptive"}
            ],
            "S2": [
                {"topic": "A Day Without Technology",
                 "instructions": "Write a short passage (80–100 words) about spending one whole day without any electronic devices. Describe what you did and how you felt.",
                 "guiding_questions": ["What activities did you try instead?", "Was it difficult or enjoyable? Why?"],
                 "type": "narrative"},
                {"topic": "My Ideal Classroom",
                 "instructions": "Write a short passage (80–100 words) describing your ideal classroom. What would it look like and what features would it have?",
                 "guiding_questions": ["What furniture and decorations would be there?",
                                       "What technology would you include?",
                                       "How would it help students learn better?"], "type": "descriptive"},
            ],
            "S3": [
                {"topic": "The Importance of Exercise",
                 "instructions": "Write a passage (120–150 words) explaining why regular exercise is important for teenagers. Include at least two benefits.",
                 "guiding_questions": ["What are the physical benefits?", "What are the mental benefits?",
                                       "How can teenagers fit exercise into busy schedules?"], "type": "expository"},
                {"topic": "A Lesson I Learned the Hard Way",
                 "instructions": "Write a passage (120–150 words) about a time when you learned an important lesson through a difficult experience.",
                 "guiding_questions": ["What happened?", "What did you learn?",
                                       "How did this experience change you?"], "type": "narrative"},
            ],
            "S4": [
                {"topic": "Should Homework Be Abolished?",
                 "instructions": "Write a passage (150–180 words) presenting your view on whether homework should be abolished. Give reasons for your opinion.",
                 "guiding_questions": ["What are the benefits of homework?", "What are the drawbacks?",
                                       "What alternative approaches might work?"], "type": "argumentative"},
            ],
            "S5": [
                {"topic": "The Impact of Social Media on Teenagers",
                 "instructions": "Write an essay (200–250 words) discussing both positive and negative effects of social media on teenagers.",
                 "guiding_questions": ["What benefits does social media provide?",
                                       "What are the potential risks or harms?",
                                       "How can teenagers use social media responsibly?"], "type": "argumentative"},
            ],
            "S6": [
                {"topic": "A Turning Point in My Life",
                 "instructions": "Write a reflective essay (250–300 words) about a significant turning point in your life and how it shaped who you are today.",
                 "guiding_questions": ["What was the situation before this turning point?",
                                       "What exactly happened?",
                                       "How did it change your perspective or actions?"], "type": "reflective"},
            ]
        }

    def generate_task(self, level: str, task_type: str = None, **kwargs) -> TaskResult:
        """阶段1: 生成写作任务"""
        templates = self._get_task_templates()
        level_tasks = templates.get(level, templates["S3"])

        if task_type:
            filtered = [t for t in level_tasks if t.get("type") == task_type]
            level_tasks = filtered if filtered else level_tasks

        task = random.choice(level_tasks)
        word_range = self.config.settings["word_range"].get(level, {"min": 100, "max": 150})
        task_id = f"writing_{level}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        return TaskResult(
            success=True,
            task_id=task_id,
            mode_id="english_writing",
            content={
                **task,
                "level": level,
                "word_range": word_range
            }
        )

    def get_all_tasks_for_level(self, level: str) -> List[Dict]:
        """获取某年级所有任务"""
        templates = self._get_task_templates()
        return templates.get(level, [])

    # ==================== 阶段2: 写作引导 ====================

    def get_guidance_system_prompt(self, level: str, guidance_type: str = "general") -> str:
        level_desc = {
            "S1": "a Secondary 1 student (age 12-13, beginner)",
            "S2": "a Secondary 2 student (age 13-14, elementary)",
            "S3": "a Secondary 3 student (age 14-15, intermediate)",
            "S4": "a Secondary 4 student (age 15-16, upper-intermediate)",
            "S5": "a Secondary 5 student (age 16-17, advanced)",
            "S6": "a Secondary 6 student (age 17-18, proficient)"
        }.get(level, "a secondary school student")

        return f"""You are a supportive AI Writing Companion for {level_desc}.

## STRICT RULES - YOU MUST FOLLOW:
- NEVER rewrite or correct the student's text directly.
- NEVER provide model sentences or sample paragraphs.
- NEVER give a score or grade.
- ONLY ask guiding questions to help the student think.
- Keep questions simple and appropriate for {level}.
- Use encouraging language.

## YOUR ROLE:
Ask 2-3 thoughtful questions that help the student:
1. Clarify their ideas
2. Expand their content
3. Improve their expression

## RESPONSE FORMAT:
Start with brief encouragement, then ask your guiding questions.
Keep your response under 100 words."""

    def get_guidance(self, student_text: str, level: str, guidance_type: str = "general",
                     task_context: str = None) -> Dict[str, Any]:
        """阶段2: 获取写作引导"""
        try:
            system_prompt = self.get_guidance_system_prompt(level, guidance_type)

            user_message = ""
            if task_context:
                user_message += f"Writing Task: {task_context}\n\n"
            user_message += f"Student's current writing:\n\n{student_text}\n\n"
            user_message += "Please provide guiding questions to help this student develop their writing further."

            return {
                "success": True,
                "phase": "guidance",
                "system_prompt": system_prompt,
                "user_message": user_message,
                "level": level,
                "guidance_type": guidance_type,
                "requires_ai_call": True
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    # ==================== 阶段3: 写作反馈 ====================

    def get_feedback_system_prompt(self, level: str) -> str:
        level_desc = {
            "S1": "a Secondary 1 student (age 12-13, beginner)",
            "S2": "a Secondary 2 student (age 13-14, elementary)",
            "S3": "a Secondary 3 student (age 14-15, intermediate)",
            "S4": "a Secondary 4 student (age 15-16, upper-intermediate)",
            "S5": "a Secondary 5 student (age 16-17, advanced)",
            "S6": "a Secondary 6 student (age 17-18, proficient)"
        }.get(level, "a secondary school student")

        return f"""You are an AI Learning Companion providing reflective feedback to {level_desc} after completing a writing task.

## STRICT RULES - YOU MUST FOLLOW:
- Do NOT give a score or grade.
- Do NOT rewrite sentences.
- Do NOT correct every grammar mistake.
- Do NOT compare the student to others.
- Do NOT use advanced terminology inappropriate for {level}.

## YOUR FEEDBACK MUST INCLUDE EXACTLY:

1. **One Strength** 💪
   Identify ONE specific strength related to ideas, structure, expression, or effort.
   Be genuine and specific about what they did well.

2. **One Area to Think About** 🤔
   Suggest ONE area the student could think about or improve.
   Focus on clarity, logic, or expression.
   Frame it as a gentle suggestion, not criticism.

3. **One Reflective Question** ❓
   End with ONE thoughtful question that encourages the student to think about their writing and how they might improve.

## TONE:
- Encouraging and respectful
- Focus on growth, not performance
- Warm but not patronizing
- Treat the student as a developing writer

## LEVEL ALIGNMENT:
- Use language appropriate for {level}
- Keep feedback accessible and clear
- Avoid jargon or complex explanations

## FORMAT:
Write in a conversational, supportive tone. Use the three sections above but make it feel natural, like a supportive mentor.

Your goal is to support learning awareness, NOT assessment."""

    def get_feedback(self, student_text: str, level: str, task_topic: str = None, task_instructions: str = None) -> \
            Dict[str, Any]:
        """阶段3: 获取完成后反馈"""
        try:
            system_prompt = self.get_feedback_system_prompt(level)

            user_message = ""
            if task_topic:
                user_message += f"Writing Topic: {task_topic}\n"
            if task_instructions:
                user_message += f"Task Instructions: {task_instructions}\n"
            user_message += f"\nStudent's Writing:\n\n{student_text}"

            word_count = len(student_text.split())
            user_message += f"\n\n[Word count: {word_count}]"

            return {
                "success": True,
                "phase": "feedback",
                "system_prompt": system_prompt,
                "user_message": user_message,
                "level": level,
                "word_count": word_count,
                "requires_ai_call": True
            }
        except Exception as e:
            return {"success": False, "error": str(e)}

    def evaluate_response(self, task_id: str, response: str, **kwargs) -> Dict[str, Any]:
        """统一评估接口"""
        return self.get_feedback(
            student_text=response,
            level=kwargs.get("level", "S3"),
            task_topic=kwargs.get("task_topic"),
            task_instructions=kwargs.get("task_instructions")
        )

    # ==================== 辅助方法 ====================

    def get_guidance_types(self) -> List[Dict]:
        return [
            {"id": "general", "name": "General", "name_zh": "綜合引導"},
            {"id": "clarification", "name": "Clarify Ideas", "name_zh": "澄清想法"},
            {"id": "expansion", "name": "Expand Content", "name_zh": "擴展內容"},
            {"id": "reflection", "name": "Reflect", "name_zh": "反思推理"},
            {"id": "structure", "name": "Structure", "name_zh": "組織結構"}
        ]

    def get_writing_types(self) -> List[Dict]:
        return [
            {"id": "descriptive", "name": "Descriptive", "name_zh": "描述性"},
            {"id": "narrative", "name": "Narrative", "name_zh": "敘事性"},
            {"id": "expository", "name": "Expository", "name_zh": "說明性"},
            {"id": "persuasive", "name": "Persuasive", "name_zh": "說服性"},
            {"id": "argumentative", "name": "Argumentative", "name_zh": "議論性"},
            {"id": "reflective", "name": "Reflective", "name_zh": "反思性"}
        ]


# ==================== 中文语文训练模式（15个游戏）====================

class ChineseGameCategory(Enum):
    """中文游戏类别"""
    COMPREHENSION = "理解"
    EXPRESSION = "表达"
    STRUCTURE = "结构"
    THINKING = "思维"
    METACOGNITION = "元认知"


# 游戏配置
CHINESE_GAMES = {
    # 理解类
    "MEANING_BUILDER": {
        "name_zh": "意思重建器", "name_en": "Meaning Builder",
        "category": "理解", "target_skill": "理解", "icon": "🔄",
        "description_zh": "用自己的话重述段落的主要意思",
        "level_rules": {
            "S1-S2": "60-120字段落，日常生活话题，具体内容",
            "S3-S4": "120-180字段落，包含1-2个隐含关系",
            "S5-S6": "180-250字段落，包含抽象观点或反思"
        }
    },
    "WHATS_MISSING": {
        "name_zh": "关键信息消失挑战", "name_en": "What's Missing",
        "category": "理解", "target_skill": "理解", "icon": "🔍",
        "description_zh": "找出摘要中遗漏的关键信息并说明原因",
        "level_rules": {
            "S1-S2": "短段落 + 遗漏一个关键细节的摘要",
            "S3-S4": "段落 + 遗漏因果/条件的不完整摘要",
            "S5-S6": "段落 + 遗漏核心论点/证据的不完整摘要"
        }
    },
    "ONE_SENTENCE_CAPTURE": {
        "name_zh": "一句话抓重点", "name_en": "One Sentence Capture",
        "category": "理解", "target_skill": "理解", "icon": "🎯",
        "description_zh": "用一句话概括段落的核心要点",
        "level_rules": {
            "S1-S2": "50-100字段落；允许简单句",
            "S3-S4": "100-160字段落；要求完整意思+关键细节",
            "S5-S6": "160-230字段落；要求抽象主旨+立场/含义"
        }
    },
    # 表达类
    "CLARITY_REPAIR": {
        "name_zh": "模糊句修复", "name_en": "Clarity Repair",
        "category": "表达", "target_skill": "表达", "icon": "🔧",
        "description_zh": "修改模糊的句子使其更清晰，但不添加新内容",
        "level_rules": {
            "S1-S2": "短句，日常情境",
            "S3-S4": "包含1-2个因果短语",
            "S5-S6": "包含抽象表达，要求精确"
        }
    },
    "ONE_LINE_OPINION": {
        "name_zh": "一句话立场", "name_en": "One Line Opinion",
        "category": "表达", "target_skill": "表达", "icon": "💬",
        "description_zh": "用一句话表达清晰立场和理由",
        "level_rules": {
            "S1-S2": "简单话题（校规、习惯）",
            "S3-S4": "日常伦理（助人、时间管理）",
            "S5-S6": "社会议题（课堂科技、隐私），保持中立"
        }
    },
    "SAY_MORE_WITH_LESS": {
        "name_zh": "删词挑战", "name_en": "Say More With Less",
        "category": "表达", "target_skill": "表达", "icon": "✂️",
        "description_zh": "删除冗余词句，保持原意",
        "level_rules": {
            "S1-S2": "60-80字冗余段落",
            "S3-S4": "80-120字冗余段落",
            "S5-S6": "120-160字冗余段落"
        }
    },
    # 结构类
    "LOGIC_SEQUENCER": {
        "name_zh": "句子排序师", "name_en": "Logic Sequencer",
        "category": "结构", "target_skill": "结构", "icon": "🔢",
        "description_zh": "将打乱的句子排成连贯段落并说明理由",
        "level_rules": {
            "S1-S2": "4-5个简单句",
            "S3-S4": "5-6个句子，含因果关系",
            "S5-S6": "6-7个句子，含对比和总结"
        }
    },
    "PARAGRAPH_ROLE": {
        "name_zh": "段落功能判断", "name_en": "Paragraph Role",
        "category": "结构", "target_skill": "结构", "icon": "📊",
        "description_zh": "判断段落的主要功能并提供文本证据",
        "level_rules": {
            "S1-S2": "功能明确的简单段落",
            "S3-S4": "功能较复杂的段落",
            "S5-S6": "可能有多重功能的段落"
        }
    },
    "OUTLINE_FIRST": {
        "name_zh": "作文骨架搭建", "name_en": "Outline First",
        "category": "结构", "target_skill": "结构", "icon": "🏗️",
        "description_zh": "为作文题目搭建大纲框架，不写完整段落",
        "level_rules": {
            "S1-S2": "三段式简单大纲",
            "S3-S4": "包含至少一个理由或例子",
            "S5-S6": "包含反面观点或反思"
        }
    },
    # 思维类
    "PERSPECTIVE_SWITCH": {
        "name_zh": "换位思考机", "name_en": "Perspective Switch",
        "category": "思维", "target_skill": "思维", "icon": "🔀",
        "description_zh": "从另一个人的角度重新描述同一事件",
        "level_rules": {
            "S1-S2": "简单情境，2个明确角色",
            "S3-S4": "日常冲突情境",
            "S5-S6": "复杂社会情境"
        }
    },
    "CHOOSE_AND_DEFEND": {
        "name_zh": "观点对决", "name_en": "Choose and Defend",
        "category": "思维", "target_skill": "思维", "icon": "⚔️",
        "description_zh": "选择一个观点并用理由辩护",
        "level_rules": {
            "S1-S2": "选择 + 1个理由",
            "S3-S4": "选择 + 2个理由",
            "S5-S6": "选择 + 2个理由 + 1个可能的弱点/反驳"
        }
    },
    "WHAT_IF": {
        "name_zh": "如果……会怎样", "name_en": "What If",
        "category": "思维", "target_skill": "思维", "icon": "🤔",
        "description_zh": "预测当关键条件改变时结果会如何变化",
        "level_rules": {
            "S1-S2": "简单情境，明显的因果",
            "S3-S4": "日常情境，需要推理",
            "S5-S6": "复杂情境，多重影响"
        }
    },
    # 元认知类
    "DIFFICULTY_SPOT": {
        "name_zh": "难点定位", "name_en": "Difficulty Spot",
        "category": "元认知", "target_skill": "元认知", "icon": "🎯",
        "description_zh": "反思哪个部分最难以及原因",
        "level_rules": {
            "S1-S2": "简单的难点描述",
            "S3-S4": "需要具体说明原因",
            "S5-S6": "需要分析学习策略"
        }
    },
    "CONFIDENCE_TAG": {
        "name_zh": "信心标注", "name_en": "Confidence Tag",
        "category": "元认知", "target_skill": "元认知", "icon": "📊",
        "description_zh": "训练信心校准能力",
        "level_rules": {
            "S1-S2": "简单问题",
            "S3-S4": "中等难度问题",
            "S5-S6": "较难的推理问题"
        }
    },
    "NEXT_TIME_PLAN": {
        "name_zh": "我会怎么改", "name_en": "Next Time Plan",
        "category": "元认知", "target_skill": "元认知", "icon": "📝",
        "description_zh": "计划下次的一个改进步骤",
        "level_rules": {
            "S1-S2": "简单的改进计划",
            "S3-S4": "具体可行的改进步骤",
            "S5-S6": "需要说明具体行动和时间"
        }
    }
}

CHINESE_CATEGORIES = [
    {"id": "理解", "name_zh": "理解类", "name_en": "Comprehension", "icon": "📖"},
    {"id": "表达", "name_zh": "表达类", "name_en": "Expression", "icon": "💬"},
    {"id": "结构", "name_zh": "结构类", "name_en": "Structure", "icon": "🏗️"},
    {"id": "思维", "name_zh": "思维类", "name_en": "Thinking", "icon": "🧠"},
    {"id": "元认知", "name_zh": "元认知类", "name_en": "Metacognition", "icon": "🔍"},
]

TOPIC_DOMAINS = {
    "daily_life": {"zh": "日常生活", "en": "Daily Life"},
    "school_life": {"zh": "校园生活", "en": "School Life"},
    "family": {"zh": "家庭", "en": "Family"},
    "friendship": {"zh": "友谊", "en": "Friendship"},
    "technology": {"zh": "科技", "en": "Technology"},
    "environment": {"zh": "环境", "en": "Environment"},
    "culture": {"zh": "文化", "en": "Culture"},
    "sports": {"zh": "体育", "en": "Sports"},
}


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


# ==================== 学习模式管理器 ====================

class LearningModeManager:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._modes: Dict[str, BaseLearningMode] = {}
        self._initialized = True
        self._register_default_modes()
        logger.info(f"✅ LearningModeManager initialized with {len(self._modes)} modes")

    def _register_default_modes(self):
        for mode in [QAMode(), EnglishWritingMode(), ChineseTrainingMode()]:
            self.register_mode(mode)

    def register_mode(self, mode: BaseLearningMode) -> bool:
        self._modes[mode.config.mode_id] = mode
        return True

    def get_mode(self, mode_id: str) -> Optional[BaseLearningMode]:
        return self._modes.get(mode_id)

    def get_all_modes(self, include_disabled: bool = False) -> List[Dict]:
        modes = [m.get_info() for m in self._modes.values() if include_disabled or m.config.enabled]
        return sorted(modes, key=lambda x: x.get("order", 999))

    def get_enabled_modes(self) -> List[Dict]:
        return self.get_all_modes(False)

    def generate_task(self, mode_id: str, level: str, **kwargs) -> TaskResult:
        mode = self.get_mode(mode_id)
        if not mode:
            return TaskResult(success=False, task_id="", mode_id=mode_id, content={}, error="Mode not found")
        return mode.generate_task(level, **kwargs)


# 全局实例
learning_mode_manager = LearningModeManager()


# ==================== 便捷函数 ====================

def get_available_modes() -> List[Dict]:
    return learning_mode_manager.get_enabled_modes()


def generate_writing_task(level: str, task_type: str = None) -> TaskResult:
    return learning_mode_manager.generate_task("english_writing", level, task_type=task_type)


def get_all_writing_tasks(level: str) -> List[Dict]:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_all_tasks_for_level(level) if isinstance(mode, EnglishWritingMode) else []


def get_writing_guidance(student_text: str, level: str, guidance_type: str = "general",
                         task_context: str = None) -> Dict:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_guidance(student_text, level, guidance_type, task_context) if isinstance(mode,
                                                                                             EnglishWritingMode) else {
        "success": False}


def get_writing_feedback(student_text: str, level: str, task_topic: str = None, task_instructions: str = None) -> Dict:
    mode = learning_mode_manager.get_mode("english_writing")
    return mode.get_feedback(student_text, level, task_topic, task_instructions) if isinstance(mode,
                                                                                               EnglishWritingMode) else {
        "success": False}


# ==================== 中文训练便捷函数 ====================

def get_chinese_games() -> List[Dict]:
    """获取所有中文游戏"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_all_games() if isinstance(mode, ChineseTrainingMode) else []


def get_chinese_categories() -> List[Dict]:
    """获取中文游戏类别"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_categories() if isinstance(mode, ChineseTrainingMode) else []


def generate_chinese_task(game_id: str, level: str, difficulty: int = 1,
                          topic_domain: str = "daily_life") -> TaskResult:
    """生成中文游戏任务"""
    return learning_mode_manager.generate_task(
        "chinese_training", level,
        game_id=game_id, difficulty=difficulty, topic_domain=topic_domain
    )


def get_chinese_scaffold(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict:
    """获取中文训练引导"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_scaffold(game_id, level, student_text, task_materials) if isinstance(mode,
                                                                                         ChineseTrainingMode) else {
        "success": False}


def get_chinese_feedback(game_id: str, level: str, student_text: str, task_materials: Dict) -> Dict:
    """获取中文训练反馈"""
    mode = learning_mode_manager.get_mode("chinese_training")
    return mode.get_feedback(game_id, level, student_text, task_materials) if isinstance(mode,
                                                                                         ChineseTrainingMode) else {
        "success": False}


if __name__ == "__main__":
    print("Testing Learning Modes...")

    # 测试英文写作
    result = generate_writing_task("S3")
    print(f"✅ English Writing Task: {result.content.get('topic')}")

    # 测试中文训练
    games = get_chinese_games()
    print(f"✅ Chinese Games: {len(games)} games loaded")

    categories = get_chinese_categories()
    print(f"✅ Chinese Categories: {len(categories)} categories")

    # 测试生成中文任务
    chinese_result = generate_chinese_task("MEANING_BUILDER", "S3")
    print(f"✅ Chinese Task generated: {chinese_result.success}")

    print("\n所有学习模式:")
    for mode in get_available_modes():
        print(f"  {mode['icon']} {mode['name']} ({mode['mode_id']})")