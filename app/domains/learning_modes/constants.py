# constants.py - 学习模式常量数据
"""
所有学习模式的常量数据：
- CHINESE_GAMES: 中文游戏配置
- CHINESE_CATEGORIES: 中文游戏类别
- TOPIC_DOMAINS: 话题领域
"""

from enum import Enum


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
