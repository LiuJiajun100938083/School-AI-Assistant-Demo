"""
学习分析服务层 - AnalyticsService
==================================
负责所有学习分析相关业务逻辑：
- 学生学习报告生成（LLM 驱动）
- 仪表板概览数据
- 知识掌握度追踪
- 风险等级评估
- 学习模式识别
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Any, Callable, Dict, List, Optional

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    LLMServiceError,
    NotFoundError,
    ValidationError,
)
from app.domains.analytics.repository import AnalyticsRepository
from app.domains.chat.repository import ConversationRepository, MessageRepository
from app.domains.user.repository import UserRepository

logger = logging.getLogger(__name__)

# 报告缓存有效期（小时）
DEFAULT_CACHE_HOURS = 24
# LLM 分析超时（秒）
ANALYSIS_TIMEOUT = 60
# 每个学科取的最大对话数
MAX_CONVERSATIONS_PER_ANALYSIS = 3
# 每个对话取的最大消息数
MAX_MESSAGES_PER_CONVERSATION = 4


class AnalyticsService:
    """
    学习分析服务 - 生成学生学习报告和洞察

    职责:
    1. 学生分析报告（基于 LLM 的综合分析）
    2. 仪表板数据（概览、统计、排行）
    3. 知识掌握度追踪（按学科/主题）
    4. 风险等级评估（活跃度、质量、情绪）
    5. 班级分析（聚合、对比）
    """

    def __init__(
        self,
        analytics_repo: Optional[AnalyticsRepository] = None,
        user_repo: Optional[UserRepository] = None,
        conv_repo: Optional[ConversationRepository] = None,
        msg_repo: Optional[MessageRepository] = None,
        settings: Optional[Settings] = None,
    ):
        self._analytics = analytics_repo or AnalyticsRepository()
        self._user = user_repo or UserRepository()
        self._conv = conv_repo or ConversationRepository()
        self._msg = msg_repo or MessageRepository()
        self._settings = settings or get_settings()

        # LLM 函数 - 延迟注入
        self._ask_ai_func: Optional[Callable] = None

        # 正在进行中的分析任务
        self._active_tasks: Dict[str, asyncio.Task] = {}

    def set_ai_function(self, ask_ai: Callable):
        """注入 AI 分析函数"""
        self._ask_ai_func = ask_ai

    # ================================================================== #
    #  Part 1: 仪表板                                                      #
    # ================================================================== #

    def get_dashboard_overview(self) -> Dict[str, Any]:
        """
        获取仪表板概览数据

        Returns:
            dict: {
                total_students, active_students,
                total_conversations, total_subjects, ...
            }
        """
        db_overview = self._analytics.get_dashboard_overview()
        user_stats = {
            "total_students": self._user.count_by_role("student"),
            "total_teachers": self._user.count_by_role("teacher"),
            "active_students": self._user.count_active_students(),
        }
        db_overview.update(user_stats)
        return db_overview

    def get_all_students_summary(self) -> List[Dict[str, Any]]:
        """
        获取所有学生的汇总数据（管理员/教师视图）

        Returns:
            list: [{username, display_name, conversation_count, message_count, last_active, ...}]
        """
        return self._analytics.get_all_students_summary()

    # ================================================================== #
    #  Part 2: 学生分析报告                                                #
    # ================================================================== #

    def get_student_report(
        self,
        username: str,
        subject: str,
        force_refresh: bool = False,
        max_cache_hours: int = DEFAULT_CACHE_HOURS,
    ) -> Dict[str, Any]:
        """
        获取学生学习分析报告

        优先返回缓存报告，缓存过期或强制刷新时重新生成。

        Args:
            username: 学生用户名
            subject: 学科代码
            force_refresh: 强制重新生成
            max_cache_hours: 缓存有效小时数

        Returns:
            dict: {
                "knowledge_mastery": str/dict,
                "learning_style": str,
                "difficulty_level": str,
                "emotion_analysis": str,
                "suggestions": str,
                "progress": str,
                "overall_assessment": str,
                "risk_level": str,
                "generated_at": str,
                "from_cache": bool,
            }

        Raises:
            NotFoundError: 学生不存在
            LLMServiceError: AI 生成失败
        """
        # 检查用户存在
        if not self._user.find_by_username(username):
            raise NotFoundError("学生", username)

        # 尝试缓存
        if not force_refresh:
            cached = self._analytics.get_cached_report(
                username, subject, max_cache_hours,
            )
            if cached:
                report = self._parse_report_data(cached)
                report["from_cache"] = True
                return report

        # 生成新报告
        report = self._generate_student_report(username, subject)
        report["from_cache"] = False
        return report

    async def get_student_report_async(
        self,
        username: str,
        subject: str,
        force_refresh: bool = False,
    ) -> Dict[str, Any]:
        """异步版本的学生报告生成（支持取消）"""
        task_key = f"{username}:{subject}"

        # 检查是否有正在进行的分析
        if task_key in self._active_tasks:
            existing = self._active_tasks[task_key]
            if not existing.done():
                return {"status": "in_progress", "message": "分析正在进行中"}

        # 创建异步任务
        loop = asyncio.get_event_loop()
        task = loop.run_in_executor(
            None,
            self.get_student_report,
            username, subject, force_refresh,
        )
        self._active_tasks[task_key] = task

        try:
            result = await asyncio.wait_for(task, timeout=ANALYSIS_TIMEOUT)
            return result
        except asyncio.TimeoutError:
            logger.warning("学生分析超时: %s/%s", username, subject)
            raise LLMServiceError("分析超时，请稍后重试")
        except asyncio.CancelledError:
            logger.info("学生分析已取消: %s/%s", username, subject)
            return {"status": "cancelled", "message": "分析已取消"}
        finally:
            self._active_tasks.pop(task_key, None)

    def cancel_analysis(self, username: str, subject: str) -> bool:
        """取消正在进行的分析任务"""
        task_key = f"{username}:{subject}"
        task = self._active_tasks.get(task_key)
        if task and not task.done():
            task.cancel()
            logger.info("已取消分析任务: %s", task_key)
            return True
        return False

    # ================================================================== #
    #  Part 3: 知识掌握度                                                  #
    # ================================================================== #

    def get_knowledge_mastery(
        self,
        username: str,
        subject: str,
    ) -> List[Dict[str, Any]]:
        """
        获取学生某学科的知识掌握度

        Returns:
            list: [{topic, mastery_level, practice_count, last_updated}]
        """
        return self._analytics.get_knowledge_mastery(username, subject)

    def update_knowledge_mastery(
        self,
        username: str,
        subject: str,
        topic: str,
        mastery_level: float,
    ) -> bool:
        """更新知识掌握度"""
        if mastery_level < 0 or mastery_level > 1:
            raise ValidationError("掌握度须在 0.0 到 1.0 之间")
        self._analytics.update_knowledge_mastery(
            username, subject, topic, mastery_level,
        )
        return True

    # ================================================================== #
    #  Part 4: 风险评估                                                    #
    # ================================================================== #

    def assess_student_risk(self, username: str) -> Dict[str, Any]:
        """
        评估学生学习风险等级

        基于以下维度:
        - 活跃度（最近登录时间、对话频率）
        - 消息质量（平均长度、问题深度）
        - 情绪倾向（正面/负面比例）

        Returns:
            dict: {"risk_level": "low"/"medium"/"high", "score": int, "factors": [...]}
        """
        score = 0
        factors = []

        # 获取学生对话统计
        stats = self._conv.get_conversation_stats(username)
        total_convs = stats.get("total", 0) if stats else 0

        # 因素1: 活跃度
        if total_convs == 0:
            score += 30
            factors.append("无对话记录")
        elif total_convs < 3:
            score += 20
            factors.append("对话数较少")
        elif total_convs < 7:
            score += 10
            factors.append("对话数一般")

        # 因素2: 最近活动
        recent_messages = self._msg.get_recent_user_messages(username, limit=10)
        if not recent_messages:
            score += 30
            factors.append("近期无活动")
        else:
            last_msg_time = recent_messages[0].get("timestamp") or recent_messages[0].get("created_at")
            if last_msg_time:
                if isinstance(last_msg_time, str):
                    try:
                        last_msg_time = datetime.strptime(
                            last_msg_time, "%Y-%m-%d %H:%M:%S",
                        )
                    except ValueError:
                        last_msg_time = None

                if last_msg_time:
                    days_since = (datetime.now() - last_msg_time).days
                    if days_since > 14:
                        score += 25
                        factors.append(f"超过 {days_since} 天未活动")
                    elif days_since > 7:
                        score += 15
                        factors.append(f"{days_since} 天未活动")
                    elif days_since > 3:
                        score += 5
                        factors.append(f"{days_since} 天未活动")

            # 因素3: 消息质量
            avg_length = sum(
                len(m.get("content", "")) for m in recent_messages
            ) / max(1, len(recent_messages))
            if avg_length < 20:
                score += 15
                factors.append("消息过短，可能缺乏深度")

        # 确定风险等级
        if score >= 60:
            risk_level = "high"
        elif score >= 30:
            risk_level = "medium"
        else:
            risk_level = "low"

        return {
            "risk_level": risk_level,
            "score": min(score, 100),
            "factors": factors,
        }

    # ================================================================== #
    #  Part 5: 班级分析                                                    #
    # ================================================================== #

    def get_class_analysis(
        self,
        class_name: str,
        subject: str,
    ) -> Dict[str, Any]:
        """
        班级级别学习分析

        Returns:
            dict: {
                "class_name": str,
                "student_count": int,
                "risk_distribution": {"high": int, "medium": int, "low": int},
                "students": [{username, risk_level, ...}],
            }
        """
        # 获取该班级学生
        students = self._user.list_users_by_role("student")
        class_students = [
            s for s in students
            if s.get("class_name") == class_name
        ]

        risk_distribution = {"high": 0, "medium": 0, "low": 0}
        student_summaries = []

        for student in class_students:
            username = student.get("username")
            risk = self.assess_student_risk(username)
            risk_level = risk["risk_level"]
            risk_distribution[risk_level] += 1

            # 获取该学科报告
            report = self._analytics.get_student_report(username, subject)

            student_summaries.append({
                "username": username,
                "display_name": student.get("display_name", username),
                "risk_level": risk_level,
                "risk_score": risk["score"],
                "has_report": report is not None,
            })

        # 按风险分数排序（高风险在前）
        student_summaries.sort(key=lambda x: x["risk_score"], reverse=True)

        return {
            "class_name": class_name,
            "subject": subject,
            "student_count": len(class_students),
            "risk_distribution": risk_distribution,
            "students": student_summaries,
        }

    # ================================================================== #
    #  内部辅助方法                                                        #
    # ================================================================== #

    def _generate_student_report(
        self,
        username: str,
        subject: str,
    ) -> Dict[str, Any]:
        """使用 LLM 生成学生分析报告"""
        if not self._ask_ai_func:
            raise LLMServiceError("AI 服务未初始化，请调用 set_ai_function()")

        # 1) 收集学生对话数据
        conversations = self._analytics.get_student_conversations(
            username, limit=MAX_CONVERSATIONS_PER_ANALYSIS * 5,
        )

        # 按学科过滤
        subject_convs = [
            c for c in conversations
            if c.get("subject") == subject
        ][:MAX_CONVERSATIONS_PER_ANALYSIS]

        if not subject_convs:
            # 无对话数据，返回默认报告
            return self._default_report(username, subject, "暂无该学科对话数据")

        # 2) 收集消息
        all_messages = []
        for conv in subject_convs:
            conv_id = conv.get("conversation_id")
            messages = self._msg.get_conversation_messages(
                conv_id, limit=MAX_MESSAGES_PER_CONVERSATION,
            )
            all_messages.extend(messages)

        if not all_messages:
            return self._default_report(username, subject, "暂无消息数据")

        # 3) 构建分析提示词
        context = self._build_analysis_context(username, subject, all_messages)

        prompt = (
            f"请对以下学生的 {subject} 学习情况进行全面分析，"
            "并以 JSON 格式返回分析结果。\n\n"
            f"{context}\n\n"
            "请返回以下字段（JSON 格式）：\n"
            "{\n"
            '  "knowledge_mastery": "知识掌握情况分析",\n'
            '  "learning_style": "学习风格描述",\n'
            '  "difficulty_level": "当前学习难度",\n'
            '  "emotion_analysis": "学习情绪分析",\n'
            '  "suggestions": "具体改进建议",\n'
            '  "progress": "学习进步趋势",\n'
            '  "overall_assessment": "整体评价",\n'
            '  "teacher_attention_points": "教师需关注的要点",\n'
            '  "risk_level": "low/medium/high"\n'
            "}"
        )

        # 4) 调用 LLM
        try:
            response, _ = self._ask_ai_func(
                question=prompt,
                subject_code=subject,
                use_api=False,
                conversation_history=[],
                model=self._settings.llm_local_model,
            )
        except Exception as e:
            logger.error("LLM 分析失败: %s", e)
            raise LLMServiceError(f"AI 分析失败: {e}") from e

        # 5) 解析并保存
        report = self._parse_llm_report(response)
        report["generated_at"] = datetime.now().isoformat()
        report["student_id"] = username
        report["subject"] = subject

        # 持久化
        try:
            self._analytics.save_student_report(username, subject, report)
        except Exception as e:
            logger.warning("保存分析报告失败: %s", e)

        return report

    @staticmethod
    def _build_analysis_context(
        username: str,
        subject: str,
        messages: List[Dict[str, Any]],
    ) -> str:
        """构建 LLM 分析的上下文"""
        lines = [f"学生: {username}", f"学科: {subject}", ""]
        for msg in messages:
            role = "学生" if msg.get("role") == "user" else "AI"
            content = msg.get("content", "")[:500]  # 截断过长内容
            lines.append(f"[{role}] {content}")
        return "\n".join(lines)

    @staticmethod
    def _parse_llm_report(response: str) -> Dict[str, Any]:
        """解析 LLM 返回的分析报告"""
        import json
        import re

        # 尝试提取 JSON
        json_match = re.search(r'\{[\s\S]*\}', response)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass

        # 回退：将整个响应作为 overall_assessment
        return {
            "knowledge_mastery": "",
            "learning_style": "",
            "difficulty_level": "",
            "emotion_analysis": "",
            "suggestions": "",
            "progress": "",
            "overall_assessment": response.strip(),
            "risk_level": "medium",
        }

    @staticmethod
    def _parse_report_data(cached: Dict[str, Any]) -> Dict[str, Any]:
        """解析缓存的报告数据"""
        import json

        report_data = cached.get("report_data")
        if isinstance(report_data, str):
            try:
                return json.loads(report_data)
            except (json.JSONDecodeError, TypeError):
                return {"overall_assessment": report_data}
        elif isinstance(report_data, dict):
            return report_data
        return {"overall_assessment": str(report_data) if report_data else ""}

    @staticmethod
    def _default_report(
        username: str, subject: str, reason: str,
    ) -> Dict[str, Any]:
        """生成默认空报告"""
        return {
            "student_id": username,
            "subject": subject,
            "knowledge_mastery": reason,
            "learning_style": "待分析",
            "difficulty_level": "待分析",
            "emotion_analysis": "待分析",
            "suggestions": "建议多进行 AI 对话学习",
            "progress": "待分析",
            "overall_assessment": reason,
            "risk_level": "medium",
            "generated_at": datetime.now().isoformat(),
        }
