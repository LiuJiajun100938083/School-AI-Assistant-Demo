# enhanced_analytics.py - 增强版学习分析引擎（MySQL版本）
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
import json
import logging
from collections import defaultdict
import re
import hashlib
import math
from dataclasses import dataclass, asdict

# 修改：使用MySQL而不是SQLite
from app.bridge import get_db

logger = logging.getLogger(__name__)


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
    active_hours: List[int] = None
    preferred_topics: List[str] = None
    weak_areas: List[str] = None
    strong_areas: List[str] = None
    engagement_level: float = 0
    progress_rate: float = 0


class EnhancedAnalytics:
    """增强版学习分析引擎 - MySQL版本"""

    def __init__(self):
        """初始化分析引擎"""
        # 不需要初始化数据库，表已经在迁移脚本中创建
        self.knowledge_patterns = self._load_knowledge_patterns()
        self.difficulty_keywords = self._load_difficulty_keywords()
        self.emotion_indicators = self._load_emotion_indicators()

    def _load_knowledge_patterns(self) -> Dict[str, List[str]]:
        """加载知识点识别模式"""
        return {
            'programming': ['代码', '编程', '函数', '变量', '循环', '条件', '算法', 'API', '数据结构'],
            'mathematics': ['计算', '公式', '方程', '几何', '代数', '统计', '概率', '微积分'],
            'science': ['实验', '原理', '定律', '假设', '观察', '分析', '结论', '数据'],
            'language': ['语法', '词汇', '写作', '阅读', '翻译', '表达', '理解', '交流'],
            'history': ['历史', '事件', '人物', '年代', '文化', '影响', '原因', '结果']
        }

    def _load_difficulty_keywords(self) -> Dict[str, List[str]]:
        """加载难度识别关键词"""
        return {
            'confused': ['不懂', '不明白', '困惑', '迷惑', '为什么', '怎么会', '不理解'],
            'struggling': ['很难', '太难', '做不出', '不会', '卡住', '困难', '复杂'],
            'error': ['错误', '错了', '不对', '失败', '有问题', 'bug', '报错'],
            'help': ['帮助', '帮忙', '救命', '求助', '怎么办', '教教我', '指导']
        }

    def _load_emotion_indicators(self) -> Dict[str, List[str]]:
        """加载情绪识别指标"""
        return {
            'positive': ['太好了', '谢谢', '明白了', '懂了', '原来如此', '太棒了', '很有帮助'],
            'negative': ['唉', '烦', '郁闷', '讨厌', '无聊', '放弃', '不想学'],
            'neutral': ['哦', '嗯', '好的', '知道了', '了解', '可以', '行']
        }

    # ============ 1. 对话分析 ============
    def analyze_conversation(self, student_id: str, conversation_id: str,
                             messages: List[Dict], subject: str) -> Dict[str, Any]:
        """分析单个对话"""
        if not messages:
            return self._empty_analysis_result()

        # 提取基础指标
        metrics = self._extract_conversation_metrics(messages)

        # 识别知识点
        knowledge_points = self._identify_knowledge_points(messages, subject)

        # 分析难度
        difficulty_points = self._analyze_difficulty(messages)

        # 情绪分析
        emotion_trend = self._analyze_emotion(messages)

        # 生成建议
        suggestions = self._generate_suggestions(metrics, difficulty_points, emotion_trend)

        analysis_result = {
            'conversation_id': conversation_id,
            'student_id': student_id,
            'subject': subject,
            'metrics': asdict(metrics),
            'knowledge_points': knowledge_points,
            'difficulty_points': difficulty_points,
            'emotion_trend': emotion_trend,
            'suggestions': suggestions,
            'analyzed_at': datetime.now().isoformat()
        }

        # 保存到数据库
        self._save_conversation_analysis(student_id, conversation_id, subject, analysis_result)

        return analysis_result

    def _save_conversation_analysis(self, student_id: str, conversation_id: str,
                                    subject: str, analysis_result: Dict):
        """保存对话分析结果到MySQL"""
        with get_db() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                INSERT INTO conversation_analysis
                (student_username, conversation_id, subject_code, analysis_result, analyzed_at)
                VALUES (%s, %s, %s, %s, NOW())
                ON DUPLICATE KEY UPDATE
                analysis_result = VALUES(analysis_result),
                analyzed_at = NOW()
            ''', (student_id, conversation_id, subject, json.dumps(analysis_result, ensure_ascii=False)))

            conn.commit()

    def _extract_conversation_metrics(self, messages: List[Dict]) -> ConversationMetrics:
        """提取对话指标"""
        metrics = ConversationMetrics()

        user_messages = [m for m in messages if m.get('role') == 'user']

        if not user_messages:
            return metrics

        metrics.question_count = len(user_messages)

        # 平均问题长度
        total_length = sum(len(m.get('content', '')) for m in user_messages)
        metrics.avg_question_length = total_length / len(user_messages) if user_messages else 0

        # 问题复杂度（基于长度和特殊词汇）
        complexity_score = 0
        for msg in user_messages:
            content = msg.get('content', '')
            complexity_score += len(content) / 100  # 长度因素
            complexity_score += len(re.findall(r'[？?]', content)) * 0.5  # 问号数量
            complexity_score += len(re.findall(r'(如何|为什么|怎么|原理|机制|区别|联系)', content)) * 1  # 深度词汇

        metrics.question_complexity = min(complexity_score / len(user_messages), 10) if user_messages else 0

        # 话题多样性
        topics = set()
        for msg in user_messages:
            content = msg.get('content', '')
            # 提取关键词作为话题
            words = re.findall(r'[\u4e00-\u9fa5]+', content)
            topics.update(word for word in words if len(word) >= 2)

        metrics.topic_diversity = min(len(topics) / (len(user_messages) * 3), 1) if user_messages else 0

        # 交互深度
        metrics.interaction_depth = len(messages)

        return metrics

    def _identify_knowledge_points(self, messages: List[Dict], subject: str) -> List[Dict]:
        """识别对话中的知识点"""
        knowledge_points = []

        all_content = ' '.join(m.get('content', '') for m in messages)

        for category, keywords in self.knowledge_patterns.items():
            for keyword in keywords:
                if keyword in all_content:
                    knowledge_points.append({
                        'category': category,
                        'keyword': keyword,
                        'frequency': all_content.count(keyword)
                    })

        # 按频率排序
        knowledge_points.sort(key=lambda x: x['frequency'], reverse=True)

        return knowledge_points[:10]  # 返回前10个

    def _analyze_difficulty(self, messages: List[Dict]) -> List[Dict]:
        """分析学习难点"""
        difficulty_points = []

        for msg in messages:
            if msg.get('role') != 'user':
                continue

            content = msg.get('content', '')

            for difficulty_type, keywords in self.difficulty_keywords.items():
                for keyword in keywords:
                    if keyword in content:
                        difficulty_points.append({
                            'type': difficulty_type,
                            'keyword': keyword,
                            'content': content[:100],  # 截取前100字符
                            'timestamp': msg.get('timestamp', '')
                        })

        return difficulty_points

    def _analyze_emotion(self, messages: List[Dict]) -> Dict:
        """分析情绪变化趋势"""
        emotion_scores = []

        for msg in messages:
            if msg.get('role') != 'user':
                continue

            content = msg.get('content', '')
            score = 0

            # 计算情绪分数
            for keyword in self.emotion_indicators['positive']:
                if keyword in content:
                    score += 1

            for keyword in self.emotion_indicators['negative']:
                if keyword in content:
                    score -= 1

            emotion_scores.append(score)

        if not emotion_scores:
            return {'trend': 'neutral', 'scores': []}

        # 判断趋势
        avg_score = sum(emotion_scores) / len(emotion_scores)

        if avg_score > 0.5:
            trend = 'positive'
        elif avg_score < -0.5:
            trend = 'negative'
        else:
            trend = 'neutral'

        return {
            'trend': trend,
            'average_score': avg_score,
            'scores': emotion_scores
        }

    def _generate_suggestions(self, metrics: ConversationMetrics,
                              difficulty_points: List[Dict],
                              emotion_trend: Dict) -> List[str]:
        """生成学习建议"""
        suggestions = []

        # 基于问题复杂度
        if metrics.question_complexity < 3:
            suggestions.append("可以尝试提出更深入的问题，探索知识的本质和原理")
        elif metrics.question_complexity > 7:
            suggestions.append("问题较复杂，建议分解为多个小问题逐步解决")

        # 基于话题多样性
        if metrics.topic_diversity < 0.3:
            suggestions.append("建议扩展学习范围，探索相关的其他知识点")

        # 基于难点
        if len(difficulty_points) > 3:
            suggestions.append("遇到较多困难，建议复习基础知识或寻求额外帮助")

        # 基于情绪
        if emotion_trend['trend'] == 'negative':
            suggestions.append("保持积极心态，学习是循序渐进的过程")
        elif emotion_trend['trend'] == 'positive':
            suggestions.append("学习状态良好，继续保持！")

        return suggestions

    def _empty_analysis_result(self) -> Dict:
        """返回空的分析结果"""
        return {
            'metrics': asdict(ConversationMetrics()),
            'knowledge_points': [],
            'difficulty_points': [],
            'emotion_trend': {'trend': 'neutral', 'scores': []},
            'suggestions': []
        }

    # ============ 2. 学生画像生成 ============
    def generate_student_profile(self, student_id: str) -> StudentProfile:
        """生成学生学习画像"""
        profile = StudentProfile(student_id=student_id)

        with get_db() as conn:
            cursor = conn.cursor()

            # 获取学生的所有对话分析
            cursor.execute('''
                SELECT analysis_result
                FROM conversation_analysis
                WHERE student_username = %s
                ORDER BY analyzed_at DESC
                LIMIT 100
            ''', (student_id,))

            analyses = cursor.fetchall()

            if not analyses:
                return profile

            # 分析学习风格
            profile.learning_style = self._identify_learning_style(analyses)

            # 活跃时间分析
            profile.active_hours = self._analyze_active_hours(student_id)

            # 偏好主题
            profile.preferred_topics = self._analyze_preferred_topics(analyses)

            # 强弱项分析
            profile.weak_areas, profile.strong_areas = self._analyze_strengths_weaknesses(student_id)

            # 参与度
            profile.engagement_level = self._calculate_engagement_level(student_id)

            # 进步速度
            profile.progress_rate = self._calculate_progress_rate(student_id)

        return profile

    def _identify_learning_style(self, analyses: List) -> str:
        """识别学习风格"""
        style_indicators = {
            'visual': 0,
            'verbal': 0,
            'logical': 0,
            'social': 0
        }

        for row in analyses:
            try:
                if isinstance(row[0], str):
                    analysis = json.loads(row[0])
                else:
                    analysis = row[0]

                metrics = analysis.get('metrics', {})

                # 根据指标判断学习风格
                if metrics.get('avg_question_length', 0) > 50:
                    style_indicators['verbal'] += 1

                if metrics.get('question_complexity', 0) > 5:
                    style_indicators['logical'] += 1

            except:
                continue

        # 返回得分最高的风格
        if style_indicators:
            return max(style_indicators, key=style_indicators.get)
        return 'balanced'

    def _analyze_active_hours(self, student_id: str) -> List[int]:
        """分析活跃时间段"""
        with get_db() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                SELECT HOUR(created_at) as hour, COUNT(*) as count
                FROM conversations
                WHERE username = %s
                GROUP BY HOUR(created_at)
                ORDER BY count DESC
                LIMIT 3
            ''', (student_id,))

            results = cursor.fetchall()

            return [row[0] for row in results] if results else []

    def _analyze_preferred_topics(self, analyses: List) -> List[str]:
        """分析偏好主题"""
        topic_counts = defaultdict(int)

        for row in analyses:
            try:
                if isinstance(row[0], str):
                    analysis = json.loads(row[0])
                else:
                    analysis = row[0]

                for kp in analysis.get('knowledge_points', []):
                    topic_counts[kp['category']] += kp['frequency']
            except:
                continue

        # 返回前3个最常见的主题
        sorted_topics = sorted(topic_counts.items(), key=lambda x: x[1], reverse=True)
        return [topic for topic, _ in sorted_topics[:3]]

    def _analyze_strengths_weaknesses(self, student_id: str) -> Tuple[List[str], List[str]]:
        """分析强项和弱项"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取知识点掌握度
            cursor.execute('''
                SELECT topic, AVG(mastery_level) as avg_mastery
                FROM knowledge_mastery
                WHERE student_id = %s
                GROUP BY topic
                ORDER BY avg_mastery
            ''', (student_id,))

            results = cursor.fetchall()

            if not results:
                return [], []

            # 弱项：掌握度最低的3个
            weak_areas = [row[0] for row in results[:3] if row[1] < 0.5]

            # 强项：掌握度最高的3个
            strong_areas = [row[0] for row in results[-3:] if row[1] > 0.7]

            return weak_areas, strong_areas

    def _calculate_engagement_level(self, student_id: str) -> float:
        """计算参与度"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 最近30天的活跃度
            cursor.execute('''
                SELECT COUNT(DISTINCT DATE(created_at)) as active_days,
                       COUNT(*) as total_conversations
                FROM conversations
                WHERE username = %s
                AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            ''', (student_id,))

            result = cursor.fetchone()

            if result:
                active_days = result[0] or 0
                total_conversations = result[1] or 0

                # 参与度 = (活跃天数/30) * 0.5 + (对话数/60) * 0.5
                engagement = (active_days / 30) * 0.5 + min(total_conversations / 60, 1) * 0.5
                return round(engagement, 2)

            return 0.0

    def _calculate_progress_rate(self, student_id: str) -> float:
        """计算进步速度"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 比较最近和之前的平均进度
            cursor.execute('''
                SELECT 
                    AVG(CASE WHEN date >= DATE_SUB(CURDATE(), INTERVAL 15 DAY) 
                        THEN overall_progress ELSE NULL END) as recent_progress,
                    AVG(CASE WHEN date < DATE_SUB(CURDATE(), INTERVAL 15 DAY) 
                        AND date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
                        THEN overall_progress ELSE NULL END) as previous_progress
                FROM learning_progress
                WHERE student_id = %s
            ''', (student_id,))

            result = cursor.fetchone()

            if result and result[0] and result[1]:
                recent = result[0]
                previous = result[1]

                if previous > 0:
                    rate = ((recent - previous) / previous) * 100
                    return round(rate, 2)

            return 0.0

    # ============ 3. 知识点掌握度分析 ============
    def analyze_knowledge_mastery(self, student_id: str, subject: str,
                                  conversation_history: List[Dict]) -> Dict[str, Any]:
        """分析知识点掌握度"""
        knowledge_map = defaultdict(lambda: {'count': 0, 'correct': 0, 'mastery': 0})

        for conv in conversation_history:
            # 识别涉及的知识点
            knowledge_points = self._identify_knowledge_points(conv.get('messages', []), subject)

            for kp in knowledge_points:
                topic = kp['keyword']
                knowledge_map[topic]['count'] += 1

                # 简单判断是否掌握（基于回答长度和情绪）
                if self._check_understanding(conv.get('messages', [])):
                    knowledge_map[topic]['correct'] += 1

        # 计算掌握度
        mastery_report = {}
        for topic, data in knowledge_map.items():
            if data['count'] > 0:
                mastery = data['correct'] / data['count']
                mastery_report[topic] = {
                    'mastery_level': round(mastery, 2),
                    'practice_count': data['count'],
                    'confidence': self._calculate_confidence(data['count'], mastery)
                }

                # 保存到数据库
                self._update_knowledge_mastery(
                    student_id=student_id,
                    subject=subject,
                    topic=topic,
                    mastery_level=mastery,
                    confidence=mastery_report[topic]['confidence']
                )

        return mastery_report

    def _check_understanding(self, messages: List[Dict]) -> bool:
        """检查是否理解（简化版）"""
        for msg in messages:
            if msg.get('role') == 'user':
                content = msg.get('content', '')
                # 包含理解性词汇
                if any(word in content for word in ['明白', '懂了', '原来如此', '理解了']):
                    return True
                # 包含困惑词汇
                if any(word in content for word in ['不懂', '不明白', '为什么']):
                    return False
        return True

    def _calculate_confidence(self, practice_count: int, mastery: float) -> float:
        """计算置信度"""
        # 基于练习次数和掌握度
        confidence = min(practice_count / 10, 1) * 0.3 + mastery * 0.7
        return round(confidence, 2)

    def _update_knowledge_mastery(self, **kwargs):
        """更新知识点掌握度到数据库"""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO knowledge_mastery
                (student_id, subject, topic, subtopic, mastery_level, confidence,
                 last_reviewed, review_count, created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW(), 
                        COALESCE((SELECT review_count FROM knowledge_mastery 
                                 WHERE student_id=%s AND subject=%s AND topic=%s AND subtopic=%s), 0) + 1,
                        NOW(), NOW())
                ON DUPLICATE KEY UPDATE
                    mastery_level = VALUES(mastery_level),
                    confidence = VALUES(confidence),
                    last_reviewed = NOW(),
                    review_count = review_count + 1,
                    updated_at = NOW()
            ''', (
                kwargs.get('student_id'),
                kwargs.get('subject'),
                kwargs.get('topic'),
                kwargs.get('subtopic', ''),
                kwargs.get('mastery_level', 0),
                kwargs.get('confidence', 0),
                kwargs.get('student_id'),
                kwargs.get('subject'),
                kwargs.get('topic'),
                kwargs.get('subtopic', '')
            ))
            conn.commit()

    # ============ 4. 学习模式识别 ============
    def identify_learning_patterns(self, student_id: str) -> Dict[str, Any]:
        """识别学习模式"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 学习时间模式
            cursor.execute('''
                SELECT 
                    DAYOFWEEK(created_at) as day_of_week,
                    HOUR(created_at) as hour,
                    COUNT(*) as count
                FROM conversations
                WHERE username = %s
                AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DAYOFWEEK(created_at), HOUR(created_at)
            ''', (student_id,))

            time_patterns = cursor.fetchall()

            # 学习频率模式
            cursor.execute('''
                SELECT 
                    DATE(created_at) as date,
                    COUNT(*) as daily_count
                FROM conversations
                WHERE username = %s
                AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
                GROUP BY DATE(created_at)
            ''', (student_id,))

            frequency_data = cursor.fetchall()

            # 分析模式
            patterns = self._analyze_patterns(time_patterns, frequency_data)

            return patterns

    def _analyze_patterns(self, time_patterns: List, frequency_data: List) -> Dict:
        """分析学习模式"""
        patterns = {
            'peak_hours': [],
            'peak_days': [],
            'consistency_score': 0,
            'pattern_type': 'irregular'
        }

        if time_patterns:
            # 找出高峰时段
            hour_counts = defaultdict(int)
            day_counts = defaultdict(int)

            for row in time_patterns:
                day_counts[row[0]] += row[2]
                hour_counts[row[1]] += row[2]

            # 前3个高峰时段
            sorted_hours = sorted(hour_counts.items(), key=lambda x: x[1], reverse=True)
            patterns['peak_hours'] = [hour for hour, _ in sorted_hours[:3]]

            # 前3个高峰日
            sorted_days = sorted(day_counts.items(), key=lambda x: x[1], reverse=True)
            patterns['peak_days'] = [day for day, _ in sorted_days[:3]]

        if frequency_data:
            # 计算一致性分数
            daily_counts = [row[1] for row in frequency_data]
            if daily_counts:
                avg = sum(daily_counts) / len(daily_counts)
                variance = sum((x - avg) ** 2 for x in daily_counts) / len(daily_counts)
                std_dev = math.sqrt(variance)

                # 一致性分数：标准差越小，一致性越高
                patterns['consistency_score'] = max(0, 1 - (std_dev / (avg + 1)))

                # 判断模式类型
                if patterns['consistency_score'] > 0.7:
                    patterns['pattern_type'] = 'regular'
                elif patterns['consistency_score'] > 0.4:
                    patterns['pattern_type'] = 'semi-regular'
                else:
                    patterns['pattern_type'] = 'irregular'

        return patterns

    # ============ 5. 难度进展分析 ============
    def analyze_difficulty_progression(self, student_id: str, subject: str) -> Dict[str, Any]:
        """分析难度进展"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取最近的对话分析
            cursor.execute('''
                SELECT conversation_id, analysis_result, analyzed_at
                FROM conversation_analysis
                WHERE student_username = %s AND subject_code = %s
                ORDER BY analyzed_at
                LIMIT 50
            ''', (student_id, subject))

            analyses = cursor.fetchall()

            if not analyses:
                return {'progression': 'no_data', 'details': []}

            progression_data = []

            for row in analyses:
                try:
                    if isinstance(row[1], str):
                        analysis = json.loads(row[1])
                    else:
                        analysis = row[1]

                    metrics = analysis.get('metrics', {})
                    difficulty_points = analysis.get('difficulty_points', [])

                    progression_data.append({
                        'date': row[2].strftime('%Y-%m-%d') if row[2] else '',
                        'complexity': metrics.get('question_complexity', 0),
                        'difficulty_count': len(difficulty_points)
                    })
                except:
                    continue

            # 分析趋势
            if len(progression_data) >= 2:
                early_complexity = sum(d['complexity'] for d in progression_data[:len(progression_data) // 2]) / (
                            len(progression_data) // 2)
                late_complexity = sum(d['complexity'] for d in progression_data[len(progression_data) // 2:]) / (
                            len(progression_data) - len(progression_data) // 2)

                if late_complexity > early_complexity * 1.2:
                    progression = 'advancing'
                elif late_complexity < early_complexity * 0.8:
                    progression = 'declining'
                else:
                    progression = 'stable'
            else:
                progression = 'insufficient_data'

            return {
                'progression': progression,
                'details': progression_data,
                'recommendation': self._get_difficulty_recommendation(progression)
            }

    def _get_difficulty_recommendation(self, progression: str) -> str:
        """根据难度进展给出建议"""
        recommendations = {
            'advancing': '学习进展良好，可以尝试更有挑战性的内容',
            'stable': '保持当前学习节奏，逐步深入',
            'declining': '可能需要巩固基础，建议复习之前的内容',
            'insufficient_data': '需要更多学习数据来分析进展',
            'no_data': '开始学习并积累数据'
        }
        return recommendations.get(progression, '继续努力学习')

    # ============ 6. 跨学科分析 ============
    def analyze_cross_subject_performance(self, student_id: str) -> Dict[str, Any]:
        """分析跨学科表现"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取各科目的表现数据
            cursor.execute('''
                SELECT 
                    subject,
                    AVG(mastery_level) as avg_mastery,
                    COUNT(DISTINCT topic) as topic_count,
                    MAX(updated_at) as last_activity
                FROM knowledge_mastery
                WHERE student_id = %s
                GROUP BY subject
            ''', (student_id,))

            subject_data = cursor.fetchall()

            if not subject_data:
                return {'subjects': {}, 'recommendations': []}

            subjects = {}
            for row in subject_data:
                subjects[row[0]] = {
                    'average_mastery': round(row[1], 2) if row[1] else 0,
                    'topics_covered': row[2],
                    'last_activity': row[3].strftime('%Y-%m-%d') if row[3] else None
                }

            # 分析相关性和建议
            recommendations = self._generate_cross_subject_recommendations(subjects)

            return {
                'subjects': subjects,
                'recommendations': recommendations
            }

    def _generate_cross_subject_recommendations(self, subjects: Dict) -> List[str]:
        """生成跨学科建议"""
        recommendations = []

        if not subjects:
            return ['开始探索不同学科的学习']

        # 找出最强和最弱的科目
        sorted_subjects = sorted(subjects.items(),
                                 key=lambda x: x[1]['average_mastery'])

        if len(sorted_subjects) >= 2:
            weakest = sorted_subjects[0]
            strongest = sorted_subjects[-1]

            if strongest[1]['average_mastery'] - weakest[1]['average_mastery'] > 0.3:
                recommendations.append(
                    f"建议加强{weakest[0]}的学习，可以借鉴{strongest[0]}的学习方法"
                )

        # 检查学科平衡
        mastery_values = [s['average_mastery'] for s in subjects.values()]
        avg_mastery = sum(mastery_values) / len(mastery_values)

        if avg_mastery < 0.5:
            recommendations.append("整体掌握度偏低，建议增加学习时间和练习")
        elif avg_mastery > 0.8:
            recommendations.append("整体掌握度良好，可以挑战更高难度的内容")

        return recommendations

    # ============ 辅助方法 ============
    def get_teacher_classes(self, teacher_username: str) -> List[Dict]:
        """获取教师负责的班级"""
        with get_db() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                SELECT c.*, ta.subject_code, ta.role
                FROM teacher_assignments ta
                JOIN classes c ON ta.class_id = c.id
                WHERE ta.teacher_username = %s AND ta.is_active = 1
            ''', (teacher_username,))

            results = cursor.fetchall()

            classes = []
            for row in results:
                classes.append({
                    'class_id': row[0],
                    'class_code': row[1],
                    'class_name': row[2],
                    'grade': row[3],
                    'subject_code': row[9],
                    'role': row[10]
                })

            return classes

    def get_class_learning_warnings(self, class_id: str) -> List[Dict]:
        """获取班级学习预警"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取班级学生
            cursor.execute('''
                SELECT student_username FROM student_classes
                WHERE class_id = %s AND is_active = 1
            ''', (class_id,))

            students = [row[0] for row in cursor.fetchall()]

            warnings = []

            for student_id in students:
                # 检查最近活跃度
                cursor.execute('''
                    SELECT COUNT(*) FROM conversations
                    WHERE username = %s 
                    AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                ''', (student_id,))

                recent_count = cursor.fetchone()[0]

                if recent_count == 0:
                    warnings.append({
                        'student_id': student_id,
                        'severity': 'high',
                        'type': 'inactive',
                        'message': f'学生 {student_id} 最近7天无学习记录'
                    })

                # 检查掌握度
                cursor.execute('''
                    SELECT AVG(mastery_level) FROM knowledge_mastery
                    WHERE student_id = %s
                ''', (student_id,))

                result = cursor.fetchone()
                avg_mastery = result[0] if result and result[0] else 0

                if avg_mastery < 0.4:
                    warnings.append({
                        'student_id': student_id,
                        'severity': 'medium',
                        'type': 'low_mastery',
                        'message': f'学生 {student_id} 整体掌握度偏低 ({avg_mastery:.2%})'
                    })

            return warnings

    def get_all_learning_warnings(self) -> List[Dict]:
        """获取所有学习预警"""
        with get_db() as conn:
            cursor = conn.cursor()

            warnings = []

            # 检查风险学生
            cursor.execute('''
                SELECT student_id, risk_level, overall_summary
                FROM student_analysis_reports
                WHERE risk_level IN ('high', 'medium')
                ORDER BY updated_at DESC
                LIMIT 50
            ''')

            for row in cursor.fetchall():
                warnings.append({
                    'student_id': row[0],
                    'severity': row[1],
                    'type': 'risk_assessment',
                    'message': row[2][:100] if row[2] else '需要关注'
                })

            return warnings

    def assign_teacher_to_class(self, teacher_id: str, class_id: str,
                                subject: str, is_head_teacher: bool = False) -> bool:
        """分配教师到班级"""
        with get_db() as conn:
            cursor = conn.cursor()

            try:
                role = 'head_teacher' if is_head_teacher else 'subject_teacher'

                cursor.execute('''
                    INSERT INTO teacher_assignments
                    (teacher_username, class_id, subject_code, role, assigned_at, is_active)
                    VALUES (%s, %s, %s, %s, NOW(), 1)
                    ON DUPLICATE KEY UPDATE
                    role = VALUES(role),
                    is_active = 1
                ''', (teacher_id, class_id, subject, role))

                conn.commit()
                return True
            except Exception as e:
                logger.error(f"分配教师失败: {e}")
                return False

    def get_class_students_with_analytics(self, class_id: str) -> List[Dict]:
        """获取班级学生及其分析数据"""
        with get_db() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                SELECT 
                    sc.student_username,
                    COUNT(DISTINCT c.conversation_id) as conversation_count,
                    MAX(c.created_at) as last_active
                FROM student_classes sc
                LEFT JOIN conversations c ON sc.student_username = c.username
                WHERE sc.class_id = %s AND sc.is_active = 1
                GROUP BY sc.student_username
            ''', (class_id,))

            students = []
            for row in cursor.fetchall():
                # 获取额外的分析数据
                cursor.execute('''
                    SELECT AVG(mastery_level) FROM knowledge_mastery
                    WHERE student_id = %s
                ''', (row[0],))

                mastery_result = cursor.fetchone()
                avg_mastery = mastery_result[0] if mastery_result and mastery_result[0] else 0

                students.append({
                    'student_id': row[0],
                    'conversation_count': row[1],
                    'last_active': row[2].strftime('%Y-%m-%d %H:%M') if row[2] else 'Never',
                    'average_mastery': round(avg_mastery, 2)
                })

            return students

    def analyze_class_subject_performance(self, class_id: str, subject: str) -> Dict:
        """分析班级科目表现"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取班级学生
            cursor.execute('''
                SELECT student_username FROM student_classes
                WHERE class_id = %s AND is_active = 1
            ''', (class_id,))

            students = [row[0] for row in cursor.fetchall()]

            if not students:
                return {'error': 'No students in class'}

            # 分析每个学生的表现
            performances = []
            for student_id in students:
                cursor.execute('''
                    SELECT AVG(mastery_level) as avg_mastery,
                           COUNT(DISTINCT topic) as topics
                    FROM knowledge_mastery
                    WHERE student_id = %s AND subject = %s
                ''', (student_id, subject))

                result = cursor.fetchone()
                if result:
                    performances.append({
                        'student_id': student_id,
                        'mastery': result[0] or 0,
                        'topics_covered': result[1] or 0
                    })

            # 统计分析
            if performances:
                avg_class_mastery = sum(p['mastery'] for p in performances) / len(performances)

                return {
                    'class_average': round(avg_class_mastery, 2),
                    'student_count': len(performances),
                    'top_performers': sorted(performances, key=lambda x: x['mastery'], reverse=True)[:5],
                    'need_help': [p for p in performances if p['mastery'] < 0.5]
                }

            return {'error': 'No performance data available'}

    def get_subject_teacher_distribution(self) -> Dict:
        """获取科目教师分布"""
        with get_db() as conn:
            cursor = conn.cursor()

            cursor.execute('''
                SELECT subject_code, teacher_username, COUNT(DISTINCT class_id) as class_count
                FROM teacher_assignments
                WHERE is_active = 1
                GROUP BY subject_code, teacher_username
            ''')

            distribution = defaultdict(lambda: {'teachers': []})

            for row in cursor.fetchall():
                distribution[row[0]]['teachers'].append({
                    'username': row[1],
                    'class_count': row[2]
                })

            return dict(distribution)

    def calculate_subject_coverage(self) -> Dict:
        """计算科目覆盖率"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 总班级数
            cursor.execute('SELECT COUNT(*) FROM classes WHERE is_active = 1')
            total_classes = cursor.fetchone()[0]

            # 各科目覆盖的班级数
            cursor.execute('''
                SELECT subject_code, COUNT(DISTINCT class_id) as covered_classes
                FROM teacher_assignments
                WHERE is_active = 1
                GROUP BY subject_code
            ''')

            coverage = {}
            for row in cursor.fetchall():
                coverage[row[0]] = {
                    'covered': row[1],
                    'total': total_classes,
                    'percentage': round(row[1] / total_classes * 100, 1) if total_classes > 0 else 0
                }

            return coverage

    def get_student_class_ranking(self, student_id: str, class_id: str) -> Dict:
        """获取学生在班级中的排名"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取班级所有学生的平均掌握度
            cursor.execute('''
                SELECT 
                    sc.student_username,
                    COALESCE(AVG(km.mastery_level), 0) as avg_mastery
                FROM student_classes sc
                LEFT JOIN knowledge_mastery km ON sc.student_username = km.student_id
                WHERE sc.class_id = %s AND sc.is_active = 1
                GROUP BY sc.student_username
                ORDER BY avg_mastery DESC
            ''', (class_id,))

            rankings = cursor.fetchall()

            for idx, row in enumerate(rankings, 1):
                if row[0] == student_id:
                    return {
                        'rank': idx,
                        'total': len(rankings),
                        'percentile': round((len(rankings) - idx + 1) / len(rankings) * 100, 1),
                        'mastery': round(row[1], 2)
                    }

            return {'rank': None, 'total': len(rankings), 'percentile': 0, 'mastery': 0}

    def compare_with_classmates(self, student_id: str, class_id: str) -> Dict:
        """与同班同学比较"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 获取学生自己的数据
            cursor.execute('''
                SELECT AVG(mastery_level) FROM knowledge_mastery
                WHERE student_id = %s
            ''', (student_id,))

            student_mastery = cursor.fetchone()[0] or 0

            # 获取班级平均数据
            cursor.execute('''
                SELECT AVG(km.mastery_level)
                FROM knowledge_mastery km
                JOIN student_classes sc ON km.student_id = sc.student_username
                WHERE sc.class_id = %s AND sc.is_active = 1
            ''', (class_id,))

            class_average = cursor.fetchone()[0] or 0

            comparison = {
                'student_mastery': round(student_mastery, 2),
                'class_average': round(class_average, 2),
                'difference': round(student_mastery - class_average, 2),
                'status': 'above' if student_mastery > class_average else 'below' if student_mastery < class_average else 'equal'
            }

            return comparison


# 创建全局实例
enhanced_analytics = EnhancedAnalytics()