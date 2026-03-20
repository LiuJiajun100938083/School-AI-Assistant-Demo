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
MAX_CONVERSATIONS_PER_ANALYSIS = 5
# 每个对话取的最大消息数
MAX_MESSAGES_PER_CONVERSATION = 6


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
        services_getter: Optional[Callable] = None,
        settings: Optional[Settings] = None,
    ):
        self._analytics = analytics_repo or AnalyticsRepository()
        self._user = user_repo or UserRepository()
        self._conv = conv_repo or ConversationRepository()
        self._msg = msg_repo or MessageRepository()
        self._get_services = services_getter
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

    def get_latest_student_analysis(
        self,
        student_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        获取学生的最新分析报告（任意科目）

        Args:
            student_id: 学生用户名

        Returns:
            dict or None: 最新报告数据（含 risk_level, overall_summary 等）
        """
        return self._analytics.get_latest_student_analysis(student_id)

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
        """使用 LLM 生成学生分析报告（多源数据增强版）"""
        if not self._ask_ai_func:
            raise LLMServiceError("AI 服务未初始化，请调用 set_ai_function()")

        # 1) 收集多源结构化数据
        multi_source = self._collect_multi_source_data(username, subject)

        # 2) 收集对话消息
        conversations = self._analytics.get_student_conversations(
            username, limit=MAX_CONVERSATIONS_PER_ANALYSIS * 5,
        )
        subject_convs = [
            c for c in conversations
            if c.get("subject") == subject
        ][:MAX_CONVERSATIONS_PER_ANALYSIS]

        all_messages = []
        for conv in subject_convs:
            conv_id = conv.get("conversation_id")
            messages = self._msg.get_conversation_messages(
                conv_id, limit=MAX_MESSAGES_PER_CONVERSATION,
            )
            all_messages.extend(messages)

        # 至少需要对话数据或其他数据源之一
        if not all_messages and not multi_source:
            return self._default_report(username, subject, "暂无该学科学习数据")

        # 3) 构建增强上下文
        context = self._build_enriched_context(
            username, subject, multi_source, all_messages,
        )

        prompt = (
            f"请对以下学生的 {subject} 学习情况进行全面分析。\n"
            "请综合所有提供的数据维度（对话记录、知识掌握度、错题分布、练习成绩、"
            "考勤等），给出有数据支撑的分析，引用具体数字。\n"
            "对于薄弱知识点，请给出 3-5 条有针对性的学习建议。\n\n"
            f"{context}\n\n"
            "请返回以下字段（JSON 格式）：\n"
            "{\n"
            '  "knowledge_mastery": "知识掌握情况分析（引用具体掌握度百分比和薄弱点）",\n'
            '  "learning_style": "学习风格描述（基于对话模式和学习时段）",\n'
            '  "difficulty_level": "当前学习难度评估（基于错题类型和练习成绩）",\n'
            '  "emotion_analysis": "学习情绪与态度分析",\n'
            '  "suggestions": "3-5条具体改进建议（针对薄弱知识点和错题类型）",\n'
            '  "progress": "学习进步趋势（基于练习成绩和掌握度变化）",\n'
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

        try:
            self._analytics.save_student_report(username, subject, report)
        except Exception as e:
            logger.warning("保存分析报告失败: %s", e)

        return report

    def _collect_multi_source_data(
        self, username: str, subject: str,
    ) -> Dict[str, str]:
        """
        从各域服务收集预聚合摘要。

        每个数据源独立 try/except — 部分数据可用即可。
        通过 ServiceContainer 的公开接口调用，不直接依赖其他域的 repo。

        Returns:
            dict: {"section_title": "summary_text", ...}
        """
        summaries: Dict[str, str] = {}
        services = self._get_services() if self._get_services else None

        # 1. 对话统计（已注入的 conv repo）
        try:
            conv_stats = self._conv.get_conversation_stats(username)
            if conv_stats:
                summaries["对话学习数据"] = (
                    f"总对话数: {conv_stats.get('total', 0)}, "
                    f"总消息数: {conv_stats.get('messages', 0)}"
                )
        except Exception as e:
            logger.warning("收集对话数据失败: %s", e)

        # 2. 学习投入度（已注入的 analytics repo）
        try:
            engagement = self._analytics.get_student_engagement(username, days=30)
            active_hours = self._analytics.get_student_active_hours(username)
            if engagement:
                hours_str = ", ".join(
                    f"{h['hour']}时({h['count']}次)"
                    for h in (active_hours or [])[:5]
                )
                summaries["学习投入度"] = (
                    f"近30天活跃天数: {engagement.get('active_days', 0)}, "
                    f"对话总数: {engagement.get('total_conversations', 0)}。"
                    f"常用学习时段: {hours_str or '无数据'}"
                )
        except Exception as e:
            logger.warning("收集投入度数据失败: %s", e)

        if not services:
            return summaries

        # 3. 错题本 + 掌握度 + 练习（通过 MistakeBookService）
        try:
            mb_summary = services.mistake_book.get_learning_summary(
                username, subject if subject != "all" else None,
            )
            mastery = mb_summary.get("mastery_overview", {})
            if subject != "all" and subject in mastery:
                m = mastery[subject]
                summaries["知识掌握度"] = (
                    f"平均掌握度: {m['avg_mastery']}%, "
                    f"薄弱知识点: {m['weak_count']}个, "
                    f"已掌握: {m['strong_count']}个, "
                    f"下滑中: {m['declining_count']}个"
                )
            elif mastery:
                lines = [
                    f"{s}: 平均{d['avg_mastery']}%, 薄弱{d['weak_count']}个"
                    for s, d in mastery.items()
                ]
                summaries["各科知识掌握度"] = "; ".join(lines)

            weakest = mb_summary.get("weakest_points", [])
            if weakest:
                pts = [
                    f"{w.get('point_name', w.get('point_code', '?'))}"
                    f"({w.get('mastery_level', '?')}%)"
                    for w in weakest[:5]
                ]
                summaries["最薄弱知识点"] = ", ".join(pts)

            declining = mb_summary.get("declining_points", [])
            if declining:
                pts = [
                    w.get("point_name", w.get("point_code", "?"))
                    for w in declining[:5]
                ]
                summaries["掌握度下滑知识点"] = ", ".join(pts)

            error_stats = mb_summary.get("error_type_stats", [])
            if error_stats:
                errs = [
                    f"{e['error_type']}({e['cnt']}次)"
                    for e in error_stats[:5]
                ]
                summaries["错题类型分布"] = ", ".join(errs)

            scores = mb_summary.get("recent_practice_scores", [])
            if scores:
                avg_score = sum(
                    s.get("score", 0) for s in scores
                ) / len(scores)
                summaries["近期练习成绩"] = (
                    f"最近{len(scores)}次练习, 平均分: {avg_score:.1f}分"
                )

            total = mb_summary.get("total_mistakes", 0)
            streak = mb_summary.get("review_streak", 0)
            if total > 0:
                summaries["错题总览"] = (
                    f"共{total}道错题, 复习连续天数: {streak}天"
                )
        except Exception as e:
            logger.warning("收集错题本数据失败: %s", e)

        # 4. 考勤（通过 AttendanceService）
        try:
            att = services.attendance.get_student_attendance_summary(username)
            if att and att.get("detention_total", 0) > 0:
                summaries["考勤情况"] = (
                    f"留堂记录: {att['detention_total']}次, "
                    f"已完成: {att['detention_completed']}次, "
                    f"累计时长: {att['detention_minutes']}分钟"
                )
            elif att:
                summaries["考勤情况"] = "无留堂记录"
        except Exception as e:
            logger.warning("收集考勤数据失败: %s", e)

        # 5. 作业成绩（analytics repo 的 raw_query，数据留在本域）
        try:
            assignment_data = self._analytics.raw_query(
                "SELECT a.subject, s.score, s.status "
                "FROM assignment_submissions s "
                "JOIN assignments a ON s.assignment_id = a.id "
                "WHERE s.student_username = %s AND s.score IS NOT NULL "
                "ORDER BY s.submitted_at DESC LIMIT 20",
                (username,),
            )
            if assignment_data:
                subj_scores: Dict[str, List] = {}
                for row in assignment_data:
                    s = row.get("subject", "unknown")
                    if subject != "all" and s != subject:
                        continue
                    subj_scores.setdefault(s, []).append(row.get("score", 0))
                if subj_scores:
                    lines = []
                    for s, sc in subj_scores.items():
                        avg = sum(sc) / len(sc)
                        lines.append(f"{s}: 平均{avg:.1f}分({len(sc)}份作业)")
                    summaries["作业成绩"] = "; ".join(lines)
        except Exception as e:
            logger.warning("收集作业数据失败: %s", e)

        return summaries

    @staticmethod
    def _build_enriched_context(
        username: str,
        subject: str,
        summaries: Dict[str, str],
        messages: List[Dict[str, Any]],
    ) -> str:
        """将多源摘要 + 对话消息合并为 LLM 上下文"""
        lines = [f"学生: {username}", f"学科: {subject}", ""]

        # 结构化数据摘要
        if summaries:
            lines.append("=" * 40)
            lines.append("多维度学习数据")
            lines.append("=" * 40)
            for title, content in summaries.items():
                lines.append(f"【{title}】")
                lines.append(content)
                lines.append("")

        # 对话记录
        if messages:
            lines.append("=" * 40)
            lines.append("AI 对话记录（最近）")
            lines.append("=" * 40)
            for msg in messages:
                role = "学生" if msg.get("role") == "user" else "AI"
                content = msg.get("content", "")[:500]
                lines.append(f"[{role}] {content}")
            lines.append("")

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
