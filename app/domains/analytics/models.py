#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学习分析领域模型

包含:
- ConversationMetrics: 对话质量指标
- StudentProfile: 学生学习档案
- LLMAnalysisReport: 大模型分析报告
- 知识模式常量 (knowledge_patterns, difficulty_keywords, emotion_indicators)
"""

from dataclasses import dataclass, field
from typing import List, Optional


# ============================================================
# 数据类
# ============================================================

@dataclass
class ConversationMetrics:
    """对话质量指标"""
    question_count: int = 0
    avg_question_length: float = 0
    question_complexity: float = 0
    topic_diversity: float = 0
    interaction_depth: int = 0
    response_relevance: float = 0


@dataclass
class StudentProfile:
    """学生学习档案"""
    student_id: str
    learning_style: str = "unknown"
    active_hours: Optional[List[int]] = None
    preferred_topics: Optional[List[str]] = None
    weak_areas: Optional[List[str]] = None
    strong_areas: Optional[List[str]] = None
    engagement_level: float = 0
    progress_rate: float = 0


@dataclass
class LLMAnalysisReport:
    """大模型分析报告（精简字段，覆盖外部常用引用）"""
    student_id: str
    subject: str
    analysis_date: str
    knowledge_mastery_report: str
    learning_style_report: str
    difficulty_report: str
    emotion_report: str
    suggestion_report: str
    progress_report: str
    overall_assessment: str
    risk_level: str
    teacher_attention_points: str
    overall_summary: str = ""
    preview_style_report: str = ""
    preview_level_report: str = ""


# ============================================================
# 知识模式常量
# ============================================================

KNOWLEDGE_PATTERNS = {
    'programming': ['代码', '编程', '函数', '变量', '循环', '条件', '算法', 'API', '数据结构'],
    'mathematics': ['计算', '公式', '方程', '几何', '代数', '统计', '概率', '微积分'],
    'science': ['实验', '原理', '定律', '假设', '观察', '分析', '结论', '数据'],
    'language': ['语法', '词汇', '写作', '阅读', '翻译', '表达', '理解', '交流'],
    'history': ['历史', '事件', '人物', '年代', '文化', '影响', '原因', '结果'],
}

DIFFICULTY_KEYWORDS = {
    'confused': ['不懂', '不明白', '困惑', '迷惑', '为什么', '怎么会', '不理解'],
    'struggling': ['很难', '太难', '做不出', '不会', '卡住', '困难', '复杂'],
    'error': ['错误', '错了', '不对', '失败', '有问题', 'bug', '报错'],
    'help': ['帮助', '帮忙', '救命', '求助', '怎么办', '教教我', '指导'],
}

EMOTION_INDICATORS = {
    'positive': ['太好了', '谢谢', '明白了', '懂了', '原来如此', '太棒了', '很有帮助'],
    'negative': ['唉', '烦', '郁闷', '讨厌', '无聊', '放弃', '不想学'],
    'neutral': ['哦', '嗯', '好的', '知道了', '了解', '可以', '行'],
}
