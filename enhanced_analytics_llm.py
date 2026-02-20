# enhanced_analytics_llm.py - 使用大模型增强的分析引擎（修复版）
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Optional, Any, Set
import logging
import asyncio
import json

# 修改：导入MySQL连接
from app.bridge import get_db

# 修复：添加异常处理，防止导入失败
try:
    from enhanced_analytics import enhanced_analytics
except ImportError:
    # 如果没有enhanced_analytics模块，创建一个简单的mock对象
    class MockAnalytics:
        def __init__(self):
            pass  # 已迁移至MySQL，此字段不再使用


    enhanced_analytics = MockAnalytics()
    logging.warning("enhanced_analytics 模块未找到，使用默认配置")

logger = logging.getLogger(__name__)


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
    preview_style_report: str = ""  # 新增：预习风格分析
    preview_level_report: str = ""  # 新增：预习程度分析


class EnhancedAnalyticsWithLLM:
    """使用大模型的增强分析引擎"""

    def __init__(self, original_analytics=None):
        # MySQL 版本不再依赖本地 db_path/init_database
        self.analytics = original_analytics

        # 任务追踪器
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._cancelled_tasks: Set[str] = set()

    def cancel_analysis(self, task_key: str) -> bool:
        """取消正在进行的分析任务"""
        if task_key in self._active_tasks:
            task = self._active_tasks[task_key]
            if not task.done():
                task.cancel()
                self._cancelled_tasks.add(task_key)
                logger.info(f"取消分析任务: {task_key}")
                return True
        return False

    def cancel_student_analysis(self, student_id: str, subject: str) -> bool:
        """取消特定学生的分析任务"""
        task_key = f"{student_id}_{subject}"
        return self.cancel_analysis(task_key)

    def get_all_students_summary(self) -> List[Dict]:
        """获取所有学生的摘要信息（管理员用）"""
        try:
            with get_db() as conn:
                cursor = conn.cursor()

                # 获取所有学生用户
                cursor.execute("""
                    SELECT 
                        u.username,
                        u.display_name,
                        u.class_name,
                        u.role,
                        COUNT(DISTINCT c.conversation_id) as total_conversations
                    FROM users u
                    LEFT JOIN conversations c ON u.username = c.username
                    WHERE u.role = 'student'
                    GROUP BY u.username, u.display_name, u.class_name, u.role
                    ORDER BY u.username
                """)

                students = []
                for row in cursor.fetchall():
                    if isinstance(row, dict):
                        student_data = {
                            'username': row.get('username'),
                            'student_id': row.get('username'),  # 兼容性
                            'display_name': row.get('display_name', ''),
                            'class_name': row.get('class_name', '未分班'),
                            'total_conversations': row.get('total_conversations', 0),
                            'active_subjects': []  # 可以进一步查询
                        }
                    else:
                        student_data = {
                            'username': row[0],
                            'student_id': row[0],  # 兼容性
                            'display_name': row[1] or '',
                            'class_name': row[2] or '未分班',
                            'total_conversations': row[4] or 0,
                            'active_subjects': []
                        }

                    # 获取活跃科目
                    cursor.execute("""
                        SELECT DISTINCT subject 
                        FROM conversations 
                        WHERE username = %s AND subject IS NOT NULL
                        LIMIT 5
                    """, (student_data['username'],))

                    subjects = cursor.fetchall()
                    if subjects:
                        student_data['active_subjects'] = [
                            s[0] if not isinstance(s, dict) else s.get('subject')
                            for s in subjects if s
                        ]

                    students.append(student_data)

                return students

        except Exception as e:
            logger.error(f"获取所有学生摘要失败: {e}")
            return []

    def get_latest_student_analysis(self, student_id: str) -> Optional[Dict]:
        """获取学生的最新分析报告"""
        try:
            with get_db() as conn:
                cursor = conn.cursor()

                # 从数据库获取最新的分析报告
                cursor.execute(
                    """
                    SELECT 
                        analysis_result,
                        analyzed_at
                    FROM student_analysis_reports
                    WHERE student_id = %s
                    ORDER BY analyzed_at DESC
                    LIMIT 1
                    """,
                    (student_id,)
                )

                result = cursor.fetchone()
                if result:
                    if isinstance(result, dict):
                        analysis_blob = result.get('analysis_result')
                        analyzed_at = result.get('analyzed_at')
                    else:
                        analysis_blob = result[0]
                        analyzed_at = result[1]

                    analysis_data = json.loads(analysis_blob) if isinstance(analysis_blob, str) else analysis_blob
                    if isinstance(analysis_data, dict):
                        analysis_data['analysis_date'] = analyzed_at.isoformat() if hasattr(analyzed_at, 'isoformat') and analyzed_at else None
                    return analysis_data

                return None

        except Exception as e:
            logger.error(f"获取学生最新分析失败: {e}")
            return None

    def get_teacher_classes(self, teacher_id: str) -> List[Dict]:
        """获取教师负责的班级列表"""
        try:
            with get_db() as conn:
                cursor = conn.cursor()

                cursor.execute(
                    """
                    SELECT DISTINCT
                        class_id,
                        class_name,
                        subject
                    FROM teacher_class_assignments
                    WHERE teacher_id = %s AND is_active = 1
                    """,
                    (teacher_id,)
                )

                classes = []
                for row in cursor.fetchall():
                    if isinstance(row, dict):
                        classes.append({
                            'class_id': row.get('class_id'),
                            'class_name': row.get('class_name') or row.get('class_id'),
                            'subject': row.get('subject')
                        })
                    else:
                        classes.append({
                            'class_id': row[0],
                            'class_name': (row[1] or row[0]),
                            'subject': row[2]
                        })

                return classes

        except Exception as e:
            logger.error(f"获取教师班级失败: {e}")
            return []


    def get_class_students_with_analytics(self, class_id: str) -> List[Dict]:
        """获取班级学生及其分析状态（MySQL 版）"""
        try:
            with get_db() as conn:
                cursor = conn.cursor()

                cursor.execute("""
                    SELECT 
                        u.username,
                        u.display_name,
                        u.class_name
                    FROM users u
                    WHERE u.class_name = %s AND u.role = 'student' AND u.is_active = 1
                """, (class_id,))

                students: List[Dict] = []
                for row in cursor.fetchall():
                    if isinstance(row, dict):
                        student = {
                            'username': row['username'],
                            'display_name': row['display_name'] or row['username'],
                            'class_name': row['class_name']
                        }
                    else:
                        student = {
                            'username': row[0],
                            'display_name': row[1] or row[0],
                            'class_name': row[2]
                        }
                    students.append(student)

                return students

        except Exception as e:
            logger.error(f"获取班级学生失败: {e}")
            return []


    # ---------- LLM 调用封装（同步） ----------
    def chat_with_deepseek(self, prompt: str) -> str:
        """通用的 LLM 调用封装（同步）- 使用统一配置"""
        try:
            from llm.services.qa_service import ask_ai_subject
            from llm.config import get_current_model
            answer, _ = ask_ai_subject(
                question=prompt,
                subject_code="general",
                use_api=False,
                model=None  # 使用配置管理器中的默认模型
            )
            logger.debug(f"LLM调用成功, 当前模型: {get_current_model()}")
            return answer
        except Exception as e:
            logger.error(f"调用 ask_ai_subject 失败: {e}")
            return "分析服务暂时不可用"

    # ---------- DeepSeek 封装（带超时，异步） ----------
    async def chat_with_deepseek_timeout(self, prompt: str, timeout: int = 30) -> Optional[str]:
        """在后台线程执行同步推理，并设置超时"""
        try:
            return await asyncio.wait_for(
                asyncio.to_thread(self.chat_with_deepseek, prompt),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.error(f"LLM 调用超时（{timeout}秒）")
            return None
        except Exception as e:
            logger.exception("LLM 调用异常: %s", e)
            return None

    # ---------- 数据准备：读取会话与构建上下文 ----------
    def _get_student_conversations(self, student_id: str, subject: str, days: int) -> List[Dict[str, Any]]:
        """从MySQL数据库获取学生对话数据"""
        from datetime import timedelta as _td
        from app.bridge import get_db

        conversations: List[Dict[str, Any]] = []
        cutoff_date = datetime.now() - _td(days=days)

        try:
            with get_db() as conn:
                cursor = conn.cursor()

                # 构建查询条件
                if subject and subject != 'all':
                    # 查询特定学科的对话
                    cursor.execute("""
                        SELECT c.conversation_id, c.title, c.subject,
                               c.created_at, c.updated_at
                        FROM conversations c
                        WHERE c.username = %s
                          AND c.subject = %s
                          AND c.is_deleted = FALSE
                          AND c.updated_at >= %s
                        ORDER BY c.updated_at DESC
                    """, (student_id, subject, cutoff_date))
                else:
                    # 查询所有学科的对话
                    cursor.execute("""
                        SELECT c.conversation_id, c.title, c.subject,
                               c.created_at, c.updated_at
                        FROM conversations c
                        WHERE c.username = %s
                          AND c.is_deleted = FALSE
                          AND c.updated_at >= %s
                        ORDER BY c.updated_at DESC
                    """, (student_id, cutoff_date))

                conv_rows = cursor.fetchall()

                for row in conv_rows:
                    conv_id = row['conversation_id'] if isinstance(row, dict) else row[0]
                    conv_subject = row['subject'] if isinstance(row, dict) else row[2]
                    created_at = row['created_at'] if isinstance(row, dict) else row[3]
                    updated_at = row['updated_at'] if isinstance(row, dict) else row[4]

                    # 获取该对话的消息
                    cursor.execute("""
                        SELECT role, content, timestamp
                        FROM messages
                        WHERE conversation_id = %s
                        ORDER BY timestamp ASC
                    """, (conv_id,))

                    messages = []
                    for msg_row in cursor.fetchall():
                        messages.append({
                            'role': msg_row['role'] if isinstance(msg_row, dict) else msg_row[0],
                            'content': msg_row['content'] if isinstance(msg_row, dict) else msg_row[1]
                        })

                    conversations.append({
                        "id": conv_id,
                        "subject": conv_subject,
                        "messages": messages,
                        "updated_at": updated_at.isoformat() if updated_at else "",
                        "created_at": created_at.isoformat() if created_at else ""
                    })

            logger.info(f"从数据库获取 {student_id} 的 {len(conversations)} 个对话 (学科: {subject})")

        except Exception as e:
            logger.error(f"从数据库读取对话历史失败: {e}")
            import traceback
            logger.error(traceback.format_exc())

        return conversations

    def _build_context(self, conversations: List[Dict[str, Any]]) -> str:
        ctx_lines: List[str] = []
        for conv in conversations[-3:]:
            msgs = conv.get('messages', [])[-4:]
            for m in msgs:
                role = "学生" if m.get('role') == 'user' else "AI"
                ctx_lines.append(f"{role}: {str(m.get('content', ''))[:200]}")
        return "\n".join(ctx_lines) if ctx_lines else "（无近期对话上下文）"

    # ---------- 主函数：单次LLM调用批量生成 ----------
    async def analyze_student_with_llm(
            self,
            student_id: str,
            subject: str,
            days: int = 30,
            for_teacher: bool = False,
            force_refresh: bool = False
    ) -> LLMAnalysisReport:
        """生成学生分析报告（支持取消）"""

        task_key = f"{student_id}_{subject}"

        # 若之前已经请求取消，直接中止
        if task_key in self._cancelled_tasks:
            self._cancelled_tasks.discard(task_key)
            logger.info(f"任务已被预先取消: {task_key}")
            raise asyncio.CancelledError()

        logger.info(f"分析请求: student={student_id}, subject={subject}, force_refresh={force_refresh}")

        # 缓存检查
        if not force_refresh:
            logger.info(f"开始检查缓存...")
            try:
                cached_report = self._get_cached_report(student_id, subject)
                logger.info(f"缓存检查完成: {'有缓存' if cached_report else '无缓存'}")
                if cached_report:
                    logger.info(f"📚 使用缓存的分析报告: {student_id}/{subject}")
                    return cached_report
            except Exception as cache_err:
                logger.error(f"缓存检查出错: {cache_err}")
                import traceback
                logger.error(traceback.format_exc())

        # 记录当前任务
        current_task = asyncio.current_task()
        if current_task:
            self._active_tasks[task_key] = current_task

        try:
            logger.info(f"🔄 生成新的分析报告: {student_id}/{subject}")

            # 数据准备
            conversations = self._get_student_conversations(student_id, subject, days)
            context = self._build_context(conversations)

            total_conversations = len(conversations)
            total_messages = sum(len(c.get('messages', [])) for c in conversations)
            active_days = min(days, total_conversations)

            # 合并提示词
            combined_prompt = f"""
            基于以下学生对话历史，请生成完整的学习分析报告。请用JSON格式返回，包含以下字段：

            对话上下文：
            {context}

            统计数据：
            - 总对话数：{total_conversations}
            - 总消息数：{total_messages}
            - 活跃天数：{active_days}

            请返回以下JSON格式（每项2-4句话）：
            {{
                "knowledge_mastery": "知识掌握情况分析",
                "learning_style": "学习风格分析",
                "difficulty": "学习困难分析",
                "emotion": "情感状态分析",
                "suggestion": "个性化学习建议",
                "progress": "学习进度评估",
                "overall_assessment": "综合评价",
                "teacher_attention": "教师需要关注的要点",
                "preview_style": "预习风格分析",
                "preview_level": "预习程度评估",
                "overall_summary": "200字以内的整体概览"
            }}
            """

            # 调用LLM（带可取消机制）
            response = await self._chat_with_deepseek_cancellable(combined_prompt, task_key, timeout=30)

            if not response:
                # 兜底：无返回时尝试同步一次（仍尊重取消状态）
                if task_key in self._cancelled_tasks:
                    raise asyncio.CancelledError()
                response = self.chat_with_deepseek(combined_prompt)

            # 解析JSON
            try:
                analysis_data = json.loads(response)
            except Exception:
                logger.warning("LLM 响应不是JSON格式，使用备用解析方案")
                analysis_data = self._parse_text_response(response or "")

            # 风险等级评估
            risk_level = self._evaluate_risk_level(
                student_id, conversations, total_conversations, total_messages, active_days
            )

            # 若预习字段缺失，使用备用补齐
            if not analysis_data.get('preview_style') or not analysis_data.get('preview_level'):
                preview = self._generate_preview_analysis(student_id, conversations, subject)
                analysis_data.setdefault('preview_style', preview.get('style', '暂无数据'))
                analysis_data.setdefault('preview_level', preview.get('level', '暂无数据'))

            # 报告对象
            report = LLMAnalysisReport(
                student_id=student_id,
                subject=subject,
                analysis_date=datetime.now().isoformat(),
                knowledge_mastery_report=analysis_data.get('knowledge_mastery', '暂无数据'),
                learning_style_report=analysis_data.get('learning_style', '暂无数据'),
                difficulty_report=analysis_data.get('difficulty', '暂无数据'),
                emotion_report=analysis_data.get('emotion', '暂无数据'),
                suggestion_report=analysis_data.get('suggestion', '暂无数据'),
                progress_report=analysis_data.get('progress', '暂无数据'),
                overall_assessment=analysis_data.get('overall_assessment', '暂无数据'),
                risk_level=risk_level,
                teacher_attention_points=analysis_data.get('teacher_attention', '暂无数据'),
                overall_summary=analysis_data.get('overall_summary', '暂无数据'),
                preview_style_report=analysis_data.get('preview_style', '暂无数据'),
                preview_level_report=analysis_data.get('preview_level', '暂无数据')
            )

            # 保存报告
            self._save_report_to_db(report)
            return report

        except asyncio.CancelledError:
            logger.info(f"分析任务被取消: {task_key}")
            raise
        except Exception as e:
            logger.error(f"生成分析报告失败: {e}")
            return self._create_default_report(student_id, subject, risk_level='unknown')
        finally:
            # 清理任务记录
            self._active_tasks.pop(task_key, None)
            self._cancelled_tasks.discard(task_key)

    async def _chat_with_deepseek_cancellable(self, prompt: str, task_key: str, timeout: int = 30) -> Optional[str]:
        """可取消的 DeepSeek 调用（并发检查取消状态）"""
        try:
            async def check_and_cancel_watch():
                # 周期性检查是否被取消
                for _ in range(timeout):
                    if task_key in self._cancelled_tasks:
                        raise asyncio.CancelledError()
                    await asyncio.sleep(1)

            # 并发运行：实际调用在线程池 + 取消监视
            llm_task = asyncio.create_task(asyncio.to_thread(self.chat_with_deepseek, prompt))
            watch_task = asyncio.create_task(check_and_cancel_watch())

            done, pending = await asyncio.wait(
                {llm_task, watch_task},
                return_when=asyncio.FIRST_COMPLETED,
                timeout=timeout
            )

            # 取消未完成的任务
            for t in pending:
                t.cancel()

            if task_key in self._cancelled_tasks:
                raise asyncio.CancelledError()

            if llm_task in done:
                return await llm_task
            return None

        except asyncio.CancelledError:
            raise
        except asyncio.TimeoutError:
            logger.error(f"LLM 调用超时（{timeout}秒）")
            return None
        except Exception as e:
            logger.exception("LLM 调用异常: %s", e)
            return None

    # ---------- 备用文本解析 ----------
    def _parse_text_response(self, text: str) -> Dict[str, str]:
        return {
            'knowledge_mastery': self._extract_section(text, '知识掌握'),
            'learning_style': self._extract_section(text, '学习风格'),
            'difficulty': self._extract_section(text, '学习困难'),
            'emotion': self._extract_section(text, '情感状态'),
            'suggestion': self._extract_section(text, '学习建议'),
            'progress': self._extract_section(text, '学习进度'),
            'overall_assessment': self._extract_section(text, '综合评价'),
            'teacher_attention': self._extract_section(text, '教师关注'),
            'preview_style': '暂无数据',
            'preview_level': '暂无数据',
            'overall_summary': (text[:200] if text else '暂无数据')
        }

    def _extract_section(self, text: str, keyword: str) -> str:
        if not text:
            return '暂无数据'
        # 极简启发式：以关键词为锚，截取其后最多200字
        idx = text.find(keyword)
        if idx == -1:
            return '暂无数据'
        snippet = text[idx: idx + 220]
        return snippet.replace('\n', ' ').strip()

    # ---------- 预习分析（保留原有实现） ----------
    def _generate_preview_analysis(self, student_id: str, conversations: List[Dict], subject: str) -> Dict:
        preview_indicators = {
            'proactive_questions': 0,
            'concept_exploration': 0,
            'preview_depth': 0,
            'self_learning': 0
        }

        for conv in conversations:
            messages = conv.get('messages', [])
            for msg in messages:
                if msg.get('role') == 'user':
                    content = str(msg.get('content', '') or '')
                    if any(kw in content for kw in ['预习', '提前', '先了解', '准备']):
                        preview_indicators['proactive_questions'] += 1
                    if any(kw in content for kw in ['为什么', '原理', '深入', '详细']):
                        preview_indicators['concept_exploration'] += 1
                    if len(content) > 100:
                        preview_indicators['preview_depth'] += 1

        style_prompt = (
            f"基于以下数据分析预习风格（100字以内）：\n"
            f"主动提问{preview_indicators['proactive_questions']}次，"
            f"概念探索{preview_indicators['concept_exploration']}次，"
            f"深度思考{preview_indicators['preview_depth']}次。"
        )

        level_prompt = (
            f"评估{subject}科目预习程度（100字以内）：\n"
            f"总对话{len(conversations)}次，"
            f"预习相关{preview_indicators['proactive_questions']}次。"
        )

        return {
            'style': self.chat_with_deepseek(style_prompt),
            'level': self.chat_with_deepseek(level_prompt)
        }

    # ---------- 风险评估与其它辅助（保留原有实现） ----------
    def _evaluate_risk_level(self, student_id: str, conversations: List[Dict],
                             total_conversations: int, total_messages: int,
                             active_days: int) -> str:
        risk_score = 0

        if active_days == 0:
            risk_score += 30
        elif active_days < 3:
            risk_score += 20
        elif active_days < 7:
            risk_score += 10

        if total_conversations > 0:
            avg_messages = total_messages / max(1, total_conversations)
            if avg_messages < 2:
                risk_score += 20
            elif avg_messages < 4:
                risk_score += 10
        else:
            risk_score += 20

        question_quality_score = self._assess_question_quality_batch(conversations)
        if question_quality_score < 0.3:
            risk_score += 25
        elif question_quality_score < 0.6:
            risk_score += 12

        emotional_state = self._assess_emotional_state(conversations)
        if emotional_state == "negative":
            risk_score += 25
        elif emotional_state == "neutral":
            risk_score += 12

        if risk_score >= 60:
            return "high"
        elif risk_score >= 30:
            return "medium"
        else:
            return "low"

    def _assess_question_quality_batch(self, conversations: List[Dict]) -> float:
        if not conversations:
            return 0.0

        quality_scores = []
        for conv in conversations[-5:]:
            messages = conv.get('messages', [])
            for msg in messages:
                if msg.get('role') == 'user':
                    content = str(msg.get('content', '') or '')
                    score = 0.5
                    if len(content) > 50:
                        score += 0.1
                    if '为什么' in content or 'why' in content.lower():
                        score += 0.2
                    if '如何' in content or 'how' in content.lower():
                        score += 0.2
                    quality_scores.append(min(1.0, score))

        return sum(quality_scores) / len(quality_scores) if quality_scores else 0.5

    def _assess_emotional_state(self, conversations: List[Dict]) -> str:
        if not conversations:
            return "neutral"

        positive_keywords = ['谢谢', '明白了', '很好', '有趣', '棒', '懂了']
        negative_keywords = ['不懂', '困难', '难', '烦', '不会', '看不懂']

        positive_count = 0
        negative_count = 0

        for conv in conversations[-3:]:
            messages = conv.get('messages', [])
            for msg in messages:
                if msg.get('role') == 'user':
                    content = str(msg.get('content', '') or '')
                    for keyword in positive_keywords:
                        if keyword in content:
                            positive_count += 1
                    for keyword in negative_keywords:
                        if keyword in content:
                            negative_count += 1

        if negative_count > positive_count * 1.5:
            return "negative"
        elif positive_count > negative_count * 1.5:
            return "positive"
        else:
            return "neutral"

    # ---------- 缓存读取/保存与摘要 ----------
    def _get_cached_report(self, student_id: str, subject: str) -> Optional[LLMAnalysisReport]:
        logger.info(f"检查缓存报告: {student_id}/{subject}")
        try:
            with get_db() as conn:
                # secure_database 默认使用 DictCursor，直接获取游标即可
                cursor = conn.cursor()
                # 检查返回类型来确定是否为字典游标
                use_dict = True  # DictCursor 默认返回字典

                logger.debug(f"执行缓存查询")
                cursor.execute('''
                SELECT student_id, subject, analysis_date,
                       knowledge_mastery_report, learning_style_report, difficulty_report,
                       emotion_report, suggestion_report, progress_report,
                       overall_assessment, risk_level,
                       teacher_attention_points, overall_summary,
                       preview_style_report, preview_level_report
                FROM student_analysis_reports
                WHERE student_id = %s AND subject = %s
                ORDER BY updated_at DESC
                LIMIT 1
            ''', (student_id, subject))

            row = cursor.fetchone()
            if not row:
                return None

            if use_dict and isinstance(row, dict):
                return LLMAnalysisReport(
                    student_id=row.get('student_id', ''),
                    subject=row.get('subject', ''),
                    analysis_date=row.get('analysis_date', '').isoformat() if hasattr(row.get('analysis_date', ''), 'isoformat') else str(row.get('analysis_date', '')),
                    knowledge_mastery_report=row.get('knowledge_mastery_report', '') or '',
                    learning_style_report=row.get('learning_style_report', '') or '',
                    difficulty_report=row.get('difficulty_report', '') or '',
                    emotion_report=row.get('emotion_report', '') or '',
                    suggestion_report=row.get('suggestion_report', '') or '',
                    progress_report=row.get('progress_report', '') or '',
                    overall_assessment=row.get('overall_assessment', '') or '',
                    risk_level=row.get('risk_level', 'low') or 'low',
                    teacher_attention_points=row.get('teacher_attention_points', '') or '',
                    overall_summary=row.get('overall_summary', '') or '',
                    preview_style_report=row.get('preview_style_report', '') or '',
                    preview_level_report=row.get('preview_level_report', '') or ''
                )
            else:
                return LLMAnalysisReport(
                    student_id=row[0],
                    subject=row[1],
                    analysis_date=str(row[2]),
                    knowledge_mastery_report=row[3] or '',
                    learning_style_report=row[4] or '',
                    difficulty_report=row[5] or '',
                    emotion_report=row[6] or '',
                    suggestion_report=row[7] or '',
                    progress_report=row[8] or '',
                    overall_assessment=row[9] or '',
                    risk_level=row[10] or 'low',
                    teacher_attention_points=row[11] or '',
                    overall_summary=row[12] or '',
                    preview_style_report=row[13] or '',
                    preview_level_report=row[14] or ''
                )
        except Exception as e:
            logger.error(f"获取缓存报告失败: {e}")
            import traceback
            logger.error(traceback.format_exc())
            return None

    def _save_report_to_db(self, report: LLMAnalysisReport):
        """保存分析报告到MySQL（保持原方法名以兼容现有调用）"""
        now_iso = datetime.now().isoformat()
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO student_analysis_reports
                (student_id, subject, analysis_date, 
                 knowledge_mastery_report, learning_style_report,
                 difficulty_report, emotion_report, suggestion_report,
                 progress_report, overall_assessment, risk_level,
                 preview_style_report, preview_level_report,
                 overall_summary, teacher_attention_points,
                 created_at, updated_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    analysis_date=VALUES(analysis_date),
                    knowledge_mastery_report=VALUES(knowledge_mastery_report),
                    learning_style_report=VALUES(learning_style_report),
                    difficulty_report=VALUES(difficulty_report),
                    emotion_report=VALUES(emotion_report),
                    suggestion_report=VALUES(suggestion_report),
                    progress_report=VALUES(progress_report),
                    overall_assessment=VALUES(overall_assessment),
                    risk_level=VALUES(risk_level),
                    preview_style_report=VALUES(preview_style_report),
                    preview_level_report=VALUES(preview_level_report),
                    overall_summary=VALUES(overall_summary),
                    teacher_attention_points=VALUES(teacher_attention_points),
                    updated_at=VALUES(updated_at)
            ''', (
                report.student_id, report.subject, report.analysis_date,
                report.knowledge_mastery_report, report.learning_style_report,
                report.difficulty_report, report.emotion_report,
                report.suggestion_report, report.progress_report,
                report.overall_assessment, report.risk_level,
                report.preview_style_report, report.preview_level_report,
                report.overall_summary, report.teacher_attention_points,
                now_iso, now_iso
            ))
            conn.commit()
        logger.info(f"✅ 报告已保存: {report.student_id}/{report.subject}")

    def get_student_summary(self, student_id: str) -> Dict:
        with get_db() as conn:
            try:
                cursor = conn.cursor(dictionary=True)
                dict_mode = True
            except TypeError:
                cursor = conn.cursor()
                dict_mode = False

            cursor.execute('''
                SELECT overall_summary, risk_level, preview_style_report,
                       preview_level_report, updated_at
                FROM student_analysis_reports
                WHERE student_id = %s
                ORDER BY updated_at DESC
                LIMIT 1
            ''', (student_id,))

            row = cursor.fetchone()
            if row:
                if dict_mode and isinstance(row, dict):
                    preview_status = self._evaluate_preview_status(row.get('preview_style_report'), row.get('preview_level_report'))
                    return {
                        'overall_summary': row.get('overall_summary') or '暂无总结',
                        'risk_level': row.get('risk_level') or 'unknown',
                        'preview_status': preview_status,
                        'last_updated': row.get('updated_at').isoformat() if row.get('updated_at') else None
                    }
                else:
                    preview_status = self._evaluate_preview_status(row[2] if row[2] else '', row[3] if row[3] else '')
                    return {
                        'overall_summary': row[0] or '暂无总结',
                        'risk_level': row[1] or 'unknown',
                        'preview_status': preview_status,
                        'last_updated': row[4].isoformat() if row[4] else None
                    }

        return {
            'overall_summary': '暂无数据',
            'risk_level': 'unknown',
            'preview_status': '未评估',
            'last_updated': None
        }

    def get_class_students(self, class_id: str) -> List[str]:
        """获取班级学生列表"""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT DISTINCT student_username
                FROM student_classes
                WHERE class_id = %s AND is_active = 1
            ''', (class_id,))
            return [row[0] for row in cursor.fetchall()]

    def get_teacher_assignments(self, teacher_username: str) -> List[Dict]:
        """获取教师的班级分配"""
        with get_db() as conn:
            try:
                cursor = conn.cursor(dictionary=True)
                dict_mode = True
            except TypeError:
                cursor = conn.cursor()
                dict_mode = False

            cursor.execute('''
                SELECT ta.*, c.class_name, c.grade
                FROM teacher_assignments ta
                JOIN classes c ON ta.class_id = c.id
                WHERE ta.teacher_username = %s AND ta.is_active = 1
            ''', (teacher_username,))

            results = cursor.fetchall()
            if results and not dict_mode:
                assignments = []
                for row in results:
                    assignments.append({
                        'id': row[0],
                        'teacher_username': row[1],
                        'class_id': row[2],
                        'subject_code': row[3],
                        'role': row[4],
                        'assigned_at': row[5],
                        'is_active': row[6],
                        'class_name': row[7],
                        'grade': row[8]
                    })
                return assignments
            return results or []

    def is_teacher_of_class(self, teacher_username: str, class_id: str) -> bool:
        """检查是否是班级教师"""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT COUNT(*) FROM teacher_assignments
                WHERE teacher_username = %s AND class_id = %s AND is_active = 1
            ''', (teacher_username, class_id))
            res = cursor.fetchone()
            return (res[0] if res else 0) > 0

    def generate_overview_data(self, class_id: Optional[str] = None,
                               subject: Optional[str] = None,
                               days: int = 30) -> Dict:
        """生成概览数据"""
        with get_db() as conn:
            cursor = conn.cursor()

            # 活跃学生数
            if class_id:
                cursor.execute('''
                    SELECT COUNT(DISTINCT la.student_username) as cnt
                    FROM learning_analytics la
                    JOIN student_classes sc ON la.student_username = sc.student_username
                    WHERE sc.class_id = %s 
                    AND la.analysis_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                ''', (class_id, days))
            else:
                cursor.execute('''
                    SELECT COUNT(DISTINCT student_username) as cnt
                    FROM learning_analytics
                    WHERE analysis_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                ''', (days,))
            row = cursor.fetchone()
            active_students = row[0] if row else 0

            # 平均掌握度
            query = "SELECT AVG(mastery_level) as avg_mastery FROM knowledge_mastery"
            params: List[Any] = []
            if class_id:
                query += " JOIN student_classes sc ON knowledge_mastery.student_id = sc.student_username WHERE sc.class_id = %s"
                params.append(class_id)
            if subject:
                if class_id:
                    query += " AND knowledge_mastery.subject = %s"
                else:
                    query += " WHERE knowledge_mastery.subject = %s"
                params.append(subject)
            cursor.execute(query, params)
            row = cursor.fetchone()
            avg_mastery = float(row[0]) if row and row[0] is not None else 0.0

            # 风险学生数
            cursor.execute('''
                SELECT COUNT(DISTINCT student_id) as cnt
                FROM student_analysis_reports
                WHERE risk_level IN ('high', 'medium')
            ''')
            row = cursor.fetchone()
            risk_students = row[0] if row else 0

            return {
                'active_students': active_students,
                'average_mastery': round(avg_mastery, 2),
                'risk_students': risk_students,
                'total_conversations': self._get_total_conversations(class_id, days),
                'improvement_rate': self._calculate_improvement_rate(class_id, subject, days)
            }

    def _get_total_conversations(self, class_id: Optional[str], days: int) -> int:
        """获取对话总数"""
        with get_db() as conn:
            cursor = conn.cursor()
            if class_id:
                cursor.execute('''
                    SELECT COUNT(DISTINCT c.conversation_id) 
                    FROM conversations c
                    JOIN student_classes sc ON c.username = sc.student_username
                    WHERE sc.class_id = %s 
                    AND c.updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                ''', (class_id, days))
            else:
                cursor.execute('''
                    SELECT COUNT(DISTINCT conversation_id) 
                    FROM conversations
                    WHERE updated_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
                ''', (days,))
            row = cursor.fetchone()
            return row[0] if row else 0

    def _calculate_improvement_rate(self, class_id: Optional[str],
                                    subject: Optional[str],
                                    days: int) -> float:
        """计算进步率（简单两段均值比较）"""
        with get_db() as conn:
            cursor = conn.cursor()
            half_days = max(1, days // 2)
            query = '''
                SELECT 
                    AVG(CASE WHEN lp.date >= DATE_SUB(CURDATE(), INTERVAL %s DAY) 
                        THEN lp.overall_progress ELSE NULL END) as recent_avg,
                    AVG(CASE WHEN lp.date &lt; DATE_SUB(CURDATE(), INTERVAL %s DAY) 
                        AND lp.date &gt;= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                        THEN lp.overall_progress ELSE NULL END) as previous_avg
                FROM learning_progress lp
            '''
            params: List[Any] = [half_days, half_days, days]
            if class_id:
                query += " JOIN student_classes sc ON lp.student_id = sc.student_username WHERE sc.class_id = %s"
                params.append(class_id)
            if subject:
                if class_id:
                    query += " AND lp.subject = %s"
                else:
                    query += " WHERE lp.subject = %s"
                params.append(subject)
            cursor.execute(query, params)
            row = cursor.fetchone()
            if row and row[0] is not None and row[1] is not None and row[1] != 0:
                improvement = ((row[0] - row[1]) / row[1] * 100)
                return round(float(improvement), 2)
            return 0.0

    def get_knowledge_mastery_overview(self, class_id: Optional[str] = None,
                                       subject: Optional[str] = None) -> Dict:
        """获取知识点掌握概览"""
        with get_db() as conn:
            cursor = conn.cursor()
            query = '''
                SELECT topic, AVG(mastery_level) as avg_mastery, COUNT(DISTINCT student_id) as student_count
                FROM knowledge_mastery
            '''
            conditions: List[str] = []
            params: List[Any] = []
            if class_id:
                conditions.append("student_id IN (SELECT student_username FROM student_classes WHERE class_id = %s)")
                params.append(class_id)
            if subject:
                conditions.append("subject = %s")
                params.append(subject)
            if conditions:
                query += " WHERE " + " AND ".join(conditions)
            query += " GROUP BY topic ORDER BY avg_mastery DESC LIMIT 20"
            cursor.execute(query, params)
            topics = []
            for row in cursor.fetchall():
                topics.append({
                    'topic': row[0],
                    'mastery': round(float(row[1]), 2) if row[1] is not None else 0.0,
                    'students': int(row[2]) if row[2] is not None else 0
                })
            return {
                'topics': topics,
                'total_topics': len(topics)
            }

    def get_class_progress_curves(self, class_id: str, subject: Optional[str] = None, days: int = 30) -> Dict:
        """获取班级进度曲线"""
        with get_db() as conn:
            cursor = conn.cursor()
            query = '''
                SELECT date, AVG(overall_progress) as avg_progress
                FROM learning_progress lp
                JOIN student_classes sc ON lp.student_id = sc.student_username
                WHERE sc.class_id = %s AND date &gt;= DATE_SUB(CURDATE(), INTERVAL %s DAY)
            '''
            params: List[Any] = [class_id, days]
            if subject:
                query += " AND lp.subject = %s"
                params.append(subject)
            query += " GROUP BY date ORDER BY date"
            cursor.execute(query, params)
            dates: List[str] = []
            progress: List[float] = []
            for row in cursor.fetchall():
                dates.append(row[0].strftime('%Y-%m-%d') if row[0] else '')
                progress.append(round(float(row[1]), 2) if row[1] is not None else 0.0)
            return {
                'dates': dates,
                'progress': progress
            }

    def get_overall_progress_curves(self, days: int = 30) -> Dict:
        """获取整体进度曲线"""
        with get_db() as conn:
            cursor = conn.cursor()
            cursor.execute('''
                SELECT date, AVG(overall_progress) as avg_progress
                FROM learning_progress
                WHERE date &gt;= DATE_SUB(CURDATE(), INTERVAL %s DAY)
                GROUP BY date ORDER BY date
            ''', (days,))
            dates: List[str] = []
            progress: List[float] = []
            for row in cursor.fetchall():
                dates.append(row[0].strftime('%Y-%m-%d') if row[0] else '')
                progress.append(round(float(row[1]), 2) if row[1] is not None else 0.0)
            return {
                'dates': dates,
                'progress': progress
            }

    def _evaluate_preview_status(self, style_report: str, level_report: str) -> str:
        if not style_report and not level_report:
            return '未评估'

        combined_text = (style_report or '') + (level_report or '')
        positive_keywords = ['良好', '主动', '积极', '优秀', '完整']
        negative_keywords = ['不足', '缺乏', '需要', '改进', '较差']

        positive_count = sum(1 for kw in positive_keywords if kw in combined_text)
        negative_count = sum(1 for kw in negative_keywords if kw in combined_text)

        if positive_count > negative_count:
            return '预习良好'
        elif negative_count > positive_count:
            return '需要加强'
        else:
            return '预习一般'

    # 修复：添加缺失的 _create_default_report 方法
    def _create_default_report(self, student_id: str, subject: str, risk_level: str = 'unknown') -> LLMAnalysisReport:
        """创建默认报告（当分析失败时使用）"""
        return LLMAnalysisReport(
            student_id=student_id,
            subject=subject,
            analysis_date=datetime.now().isoformat(),
            knowledge_mastery_report='分析服务暂时不可用',
            learning_style_report='分析服务暂时不可用',
            difficulty_report='分析服务暂时不可用',
            emotion_report='分析服务暂时不可用',
            suggestion_report='请稍后重试分析功能',
            progress_report='分析服务暂时不可用',
            overall_assessment='系统正在处理中，请稍后查看',
            risk_level=risk_level,
            teacher_attention_points='需要等待系统分析完成',
            overall_summary='分析服务暂时不可用，请稍后重试',
            preview_style_report='分析服务暂时不可用',
            preview_level_report='分析服务暂时不可用'
        )

    # 修复：将 cleanup_all_tasks 方法正确放在类内部
    def cleanup_all_tasks(self):
        """清理所有活动任务"""
        for task_key, task in list(self._active_tasks.items()):
            if not task.done():
                task.cancel()
        self._active_tasks.clear()
        self._cancelled_tasks.clear()
        logger.info("已清理所有分析任务")

    # 可选：添加其他可能需要的公共方法
    def get_all_reports(self, student_id: str) -> List[Dict]:
        """获取学生的所有科目报告"""
        reports = []

        try:
            # 使用 MySQL 连接而不是 sqlite3
            with get_db() as conn:
                cursor = conn.cursor()

                # MySQL 查询语法（使用 %s 而不是 ?）
                cursor.execute('''
                    SELECT subject, risk_level, overall_summary, updated_at
                    FROM student_analysis_reports
                    WHERE student_id = %s
                    ORDER BY updated_at DESC
                ''', (student_id,))  # 注意：参数是元组

                for row in cursor.fetchall():
                    # 处理字典或元组格式
                    if isinstance(row, dict):
                        reports.append({
                            'subject': row['subject'],
                            'risk_level': row['risk_level'],
                            'summary': row['overall_summary'],
                            'updated_at': row['updated_at'].isoformat() if row['updated_at'] else None
                        })
                    else:
                        # 元组格式：按照 SELECT 顺序
                        reports.append({
                            'subject': row[0],
                            'risk_level': row[1],
                            'summary': row[2],
                            'updated_at': row[3].isoformat() if row[3] else None
                        })

            return reports

        except Exception as e:
            logger.error(f"获取学生报告失败: {e}")
            return []

    def generate_overall_assessment(self, student_id: str, all_subjects_data: List[Dict]) -> str:
        """生成跨學科整體評估報告"""
        if not all_subjects_data:
            return "暫無足夠數據生成整體評估。請先在各學科中進行學習互動後再查看。"

        try:
            # 统计各科目情况
            high_risk = [s for s in all_subjects_data if s.get('risk_level') == 'high']
            medium_risk = [s for s in all_subjects_data if s.get('risk_level') == 'medium']
            low_risk = [s for s in all_subjects_data if s.get('risk_level') == 'low']

            total_hours = sum(s.get('hours', 0) for s in all_subjects_data)
            total_conversations = sum(s.get('conversations', 0) for s in all_subjects_data)

            # 构建评估文本
            assessment_parts = []

            # 总体概述
            assessment_parts.append(f"📊 總體學習概況：共學習 {len(all_subjects_data)} 個學科，"
                                   f"累計學習時長約 {total_hours:.1f} 小時，"
                                   f"進行了 {total_conversations} 次對話互動。")

            # 风险分布
            if high_risk:
                subjects = '、'.join([s.get('name', s.get('code', '')) for s in high_risk])
                assessment_parts.append(f"\n\n⚠️ 需要重點關注：{subjects} 學科存在較大學習困難，建議加強練習並尋求老師幫助。")

            if medium_risk:
                subjects = '、'.join([s.get('name', s.get('code', '')) for s in medium_risk])
                assessment_parts.append(f"\n\n📈 持續努力中：{subjects} 學科表現一般，建議保持學習節奏並針對薄弱環節加強。")

            if low_risk:
                subjects = '、'.join([s.get('name', s.get('code', '')) for s in low_risk])
                assessment_parts.append(f"\n\n✅ 表現優秀：{subjects} 學科掌握良好，請繼續保持！")

            # 建议
            if len(high_risk) > len(low_risk):
                assessment_parts.append("\n\n💡 整體建議：目前學習壓力較大，建議合理規劃時間，優先鞏固基礎知識，有困難及時向老師求助。")
            elif len(low_risk) > len(high_risk):
                assessment_parts.append("\n\n💡 整體建議：學習狀態良好，可以適當挑戰更高難度的內容，拓展知識面。")
            else:
                assessment_parts.append("\n\n💡 整體建議：學習穩定進行中，建議針對薄弱學科制定專項提升計劃。")

            return ''.join(assessment_parts)

        except Exception as e:
            logger.error(f"生成整體評估失敗: {e}")
            return "整體評估生成失敗，請稍後重試。"

    def generate_preview_analysis(self, student_id: str) -> Dict[str, str]:
        """生成學生學習預覽分析"""
        try:
            # 获取学生最近的所有科目学习数据
            all_conversations = []
            subjects = {}

            with get_db() as conn:
                cursor = conn.cursor()
                # 获取最近30天的对话记录
                cursor.execute('''
                    SELECT subject, COUNT(*) as count,
                           SUM(CASE WHEN created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) as recent_count
                    FROM conversations
                    WHERE username = %s AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY)
                    GROUP BY subject
                ''', (student_id,))

                for row in cursor.fetchall():
                    if isinstance(row, dict):
                        subjects[row['subject']] = {
                            'total': row['count'],
                            'recent': row['recent_count']
                        }
                    else:
                        subjects[row[0]] = {
                            'total': row[1],
                            'recent': row[2]
                        }

            # 生成各类分析报告
            style_report = self._generate_style_analysis(subjects)
            level_report = self._generate_level_analysis(subjects)
            cross_subject_report = self._generate_cross_subject_analysis(subjects)
            habit_report = self._generate_habit_analysis(subjects)

            return {
                'style': style_report,
                'level': level_report,
                'cross_subject': cross_subject_report,
                'habit': habit_report
            }

        except Exception as e:
            logger.error(f"生成預覽分析失敗: {e}")
            return {
                'style': '分析數據不足，請繼續學習後查看。',
                'level': '分析數據不足，請繼續學習後查看。',
                'cross_subject': '分析數據不足，請繼續學習後查看。',
                'habit': '分析數據不足，請繼續學習後查看。'
            }

    def _generate_style_analysis(self, subjects: Dict) -> str:
        """生成學習風格分析"""
        if not subjects:
            return "暫無學習記錄，無法分析學習風格。"

        total_interactions = sum(s.get('total', 0) for s in subjects.values())
        if total_interactions < 5:
            return "學習互動次數較少，建議多與AI助手交流以獲得更準確的風格分析。"

        # 分析学习分布
        subject_count = len(subjects)
        if subject_count == 1:
            return "目前主要專注於單一學科學習，建議適當拓展其他學科的學習。"
        elif subject_count <= 3:
            return "學習範圍較為集中，有明確的學習重點，建議保持專注的同時適當平衡各科。"
        else:
            return "學習涉及多個學科，表現出較廣泛的學習興趣，建議注意合理分配時間。"

    def _generate_level_analysis(self, subjects: Dict) -> str:
        """生成學習程度分析"""
        if not subjects:
            return "暫無學習記錄，無法分析學習程度。"

        total = sum(s.get('total', 0) for s in subjects.values())
        recent = sum(s.get('recent', 0) for s in subjects.values())

        if total < 10:
            return "學習處於起步階段，建議增加學習頻率以鞏固基礎。"
        elif recent > total * 0.5:
            return "近期學習非常活躍，保持良好的學習勢頭！"
        elif recent < total * 0.2:
            return "近期學習頻率有所下降，建議保持穩定的學習節奏。"
        else:
            return "學習節奏穩定，繼續保持規律的學習習慣。"

    def _generate_cross_subject_analysis(self, subjects: Dict) -> str:
        """生成跨學科分析"""
        if len(subjects) < 2:
            return "目前學習科目較少，建議逐步拓展學習範圍。"

        # 找出学习最多和最少的科目
        sorted_subjects = sorted(subjects.items(), key=lambda x: x[1].get('total', 0), reverse=True)

        top_subject = sorted_subjects[0][0] if sorted_subjects else '未知'
        low_subject = sorted_subjects[-1][0] if sorted_subjects else '未知'

        return f"您在 {top_subject} 學科投入最多，建議適當增加 {low_subject} 的學習時間，實現均衡發展。"

    def _generate_habit_analysis(self, subjects: Dict) -> str:
        """生成學習習慣分析"""
        if not subjects:
            return "暫無學習記錄，無法分析學習習慣。"

        total_recent = sum(s.get('recent', 0) for s in subjects.values())

        if total_recent >= 7:
            return "近一週學習頻繁，表現出良好的學習習慣，請注意適當休息。"
        elif total_recent >= 3:
            return "學習習慣良好，建議保持每天固定的學習時間。"
        elif total_recent >= 1:
            return "近期學習頻率偏低，建議制定學習計劃並堅持執行。"
        else:
            return "近一週無學習記錄，建議儘快恢復學習。"


# 创建全局实例（MySQL 版无需本地 db_path）
enhanced_analytics_llm = EnhancedAnalyticsWithLLM()
logger.info("✅ enhanced_analytics_llm 初始化完成（MySQL）")