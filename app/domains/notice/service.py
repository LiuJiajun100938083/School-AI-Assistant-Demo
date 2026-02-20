"""
通知服务层 - NoticeService
===========================
负责所有通知/通告生成相关业务逻辑：
- 多轮对话式通知生成
- 通知类型分类（LLM）
- 模板管理（向量存储）
- DOCX 导出
- 香港学校通告格式
"""

import json
import logging
import os
import re
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    LLMServiceError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)

# 通知类型
NOTICE_TYPES = [
    "activity",      # 活动通知
    "exam",          # 考试通知
    "meeting",       # 会议通知
    "holiday",       # 假期通知
    "health",        # 健康通知
    "fee",           # 费用通知
    "uniform",       # 校服通知
    "competition",   # 竞赛通知
    "safety",        # 安全通知
    "general",       # 一般通知
]

# 对话阶段
STAGE_SELECT_TYPE = "select_type"
STAGE_COLLECTING = "collecting_info"
STAGE_CONFIRMING = "confirming"
STAGE_COMPLETED = "completed"

# 缓存目录
NOTICE_CACHE_DIR = "generated_notices"


class NoticeService:
    """
    通知生成服务 - 多轮对话式 AI 通知创建

    职责:
    1. 对话会话管理（创建、继续、结束）
    2. 智能字段收集（日期/地点/时间自动提取）
    3. 通知内容生成（基于模板风格学习）
    4. 通知类型分类（LLM 驱动）
    5. DOCX 导出（学校通告格式）
    6. 模板管理（上传、查询、向量搜索）
    """

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or get_settings()

        # 外部依赖
        self._ask_ai_func: Optional[Callable] = None
        self._search_templates: Optional[Callable] = None
        self._build_document: Optional[Callable] = None

        # 活跃会话缓存 {session_id: session_data}
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def set_external_functions(
        self,
        ask_ai: Callable = None,
        search_templates: Callable = None,
        build_document: Callable = None,
    ):
        """
        注入外部依赖

        Args:
            ask_ai: LLM 调用函数 (question, subject_code, ...) → (answer, thinking)
            search_templates: 模板搜索函数 (query, type) → [templates]
            build_document: DOCX 构建函数 (session_id, title, content, ref_no) → file_path
        """
        if ask_ai:
            self._ask_ai_func = ask_ai
        if search_templates:
            self._search_templates = search_templates
        if build_document:
            self._build_document = build_document

    # ================================================================== #
    #  对话管理                                                            #
    # ================================================================== #

    def start_conversation(
        self,
        notice_type: str = None,
        user: str = "system",
    ) -> Dict[str, Any]:
        """
        开始新的通知生成对话

        Args:
            notice_type: 通知类型（可选，不提供则进入类型选择阶段）
            user: 发起者

        Returns:
            dict: {session_id, stage, message, options?}
        """
        session_id = str(uuid.uuid4())

        if notice_type and notice_type in NOTICE_TYPES:
            stage = STAGE_COLLECTING
            message = self._get_collecting_prompt(notice_type)
        else:
            stage = STAGE_SELECT_TYPE
            message = "请选择要生成的通知类型："

        session = {
            "session_id": session_id,
            "stage": stage,
            "notice_type": notice_type or "",
            "collected_fields": {},
            "conversation_history": [],
            "created_by": user,
            "created_at": datetime.now().isoformat(),
            "progress": 0,
        }
        self._sessions[session_id] = session

        result = {
            "session_id": session_id,
            "stage": stage,
            "message": message,
        }

        if stage == STAGE_SELECT_TYPE:
            result["options"] = NOTICE_TYPES

        return result

    def continue_conversation(
        self,
        session_id: str,
        user_input: str,
    ) -> Dict[str, Any]:
        """
        继续通知生成对话

        Args:
            session_id: 会话 ID
            user_input: 用户输入

        Returns:
            dict: {session_id, stage, message, progress?, content?}

        Raises:
            NotFoundError: 会话不存在
        """
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("通知会话", session_id)

        stage = session["stage"]

        # 类型选择阶段
        if stage == STAGE_SELECT_TYPE:
            return self._handle_type_selection(session, user_input)

        # 信息收集阶段
        if stage == STAGE_COLLECTING:
            return self._handle_info_collection(session, user_input)

        # 确认阶段
        if stage == STAGE_CONFIRMING:
            return self._handle_confirmation(session, user_input)

        return {
            "session_id": session_id,
            "stage": stage,
            "message": "对话已结束",
        }

    def get_session(self, session_id: str) -> Dict[str, Any]:
        """获取会话状态"""
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("通知会话", session_id)
        return {
            "session_id": session["session_id"],
            "stage": session["stage"],
            "notice_type": session["notice_type"],
            "progress": session["progress"],
            "collected_fields": session["collected_fields"],
        }

    # ================================================================== #
    #  导出                                                                #
    # ================================================================== #

    def export_to_docx(
        self,
        session_id: str,
        title: str = None,
        ref_no: str = None,
    ) -> Dict[str, Any]:
        """
        将通知导出为 DOCX 文件

        Args:
            session_id: 会话 ID
            title: 通知标题（覆盖自动生成的）
            ref_no: 参考编号

        Returns:
            dict: {file_path, filename}

        Raises:
            NotFoundError: 会话不存在
            ValidationError: 通知内容未生成
        """
        session = self._sessions.get(session_id)
        if not session:
            raise NotFoundError("通知会话", session_id)

        content = session.get("generated_content", "")
        if not content:
            raise ValidationError("通知内容尚未生成，请先完成对话")

        final_title = title or session.get("collected_fields", {}).get("title", "通知")

        if self._build_document:
            try:
                file_path = self._build_document(
                    session_id, final_title, content, ref_no,
                )
                return {"file_path": file_path, "filename": f"{final_title}.docx"}
            except Exception as e:
                logger.error("导出 DOCX 失败: %s", e)
                raise LLMServiceError(f"导出失败: {e}") from e

        # 回退：保存为纯文本
        os.makedirs(NOTICE_CACHE_DIR, exist_ok=True)
        txt_path = os.path.join(NOTICE_CACHE_DIR, f"{session_id}.txt")
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(f"标题: {final_title}\n\n{content}")

        return {"file_path": txt_path, "filename": f"{final_title}.txt"}

    # ================================================================== #
    #  通知分类                                                            #
    # ================================================================== #

    def classify_notice(self, content: str) -> Dict[str, Any]:
        """
        使用 LLM 对通知内容进行类型分类

        Returns:
            dict: {"notice_type": str, "confidence": float}
        """
        if not self._ask_ai_func:
            return {"notice_type": "general", "confidence": 0.0}

        prompt = (
            "请判断以下通知内容属于哪种类型，"
            f"可选类型: {', '.join(NOTICE_TYPES)}\n"
            "请只返回类型名称。\n\n"
            f"通知内容:\n{content[:500]}"
        )

        try:
            response, _ = self._ask_ai_func(
                question=prompt,
                subject_code="",
                use_api=False,
                conversation_history=[],
            )
            # 从响应中提取类型
            result_type = response.strip().lower()
            for t in NOTICE_TYPES:
                if t in result_type:
                    return {"notice_type": t, "confidence": 0.85}

            return {"notice_type": "general", "confidence": 0.5}

        except Exception as e:
            logger.warning("通知分类失败: %s", e)
            return {"notice_type": "general", "confidence": 0.0}

    # ================================================================== #
    #  模板管理                                                            #
    # ================================================================== #

    def search_templates(
        self,
        query: str,
        notice_type: str = None,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """搜索相似模板"""
        if not self._search_templates:
            return []

        try:
            return self._search_templates(query, notice_type, limit)
        except Exception as e:
            logger.warning("模板搜索失败: %s", e)
            return []

    def list_templates(
        self,
        notice_type: str = None,
    ) -> List[Dict[str, Any]]:
        """获取模板列表"""
        if not self._search_templates:
            return []

        query = f"通知模板 {notice_type}" if notice_type else "通知模板"
        return self.search_templates(query, notice_type, limit=20)

    # ================================================================== #
    #  内部辅助方法                                                        #
    # ================================================================== #

    def _handle_type_selection(
        self, session: Dict, user_input: str,
    ) -> Dict[str, Any]:
        """处理类型选择"""
        input_lower = user_input.strip().lower()

        # 匹配类型
        selected = None
        for t in NOTICE_TYPES:
            if t in input_lower or input_lower in t:
                selected = t
                break

        if not selected:
            # 尝试 LLM 分类
            result = self.classify_notice(user_input)
            selected = result.get("notice_type", "general")

        session["notice_type"] = selected
        session["stage"] = STAGE_COLLECTING
        session["progress"] = 10

        message = self._get_collecting_prompt(selected)
        session["conversation_history"].append({
            "role": "user", "content": user_input,
        })
        session["conversation_history"].append({
            "role": "assistant", "content": message,
        })

        return {
            "session_id": session["session_id"],
            "stage": STAGE_COLLECTING,
            "notice_type": selected,
            "message": message,
            "progress": 10,
        }

    def _handle_info_collection(
        self, session: Dict, user_input: str,
    ) -> Dict[str, Any]:
        """处理信息收集"""
        # 智能字段提取
        extracted = self._extract_fields(user_input)
        session["collected_fields"].update(extracted)

        # 添加到对话历史
        session["conversation_history"].append({
            "role": "user", "content": user_input,
        })

        # 更新进度
        fields_count = len(session["collected_fields"])
        session["progress"] = min(90, 10 + fields_count * 15)

        # 使用 LLM 判断信息是否充足并生成回复
        if self._ask_ai_func:
            try:
                context = json.dumps(
                    session["collected_fields"], ensure_ascii=False,
                )
                history_text = "\n".join(
                    f"{'用户' if h['role'] == 'user' else 'AI'}: {h['content']}"
                    for h in session["conversation_history"][-6:]
                )

                prompt = (
                    f"你正在帮助用户生成一份{session['notice_type']}类型的学校通知。\n"
                    f"已收集的信息: {context}\n"
                    f"对话历史:\n{history_text}\n\n"
                    f"用户最新输入: {user_input}\n\n"
                    "请判断信息是否足够生成通知：\n"
                    "- 如果信息充足，请直接生成通知全文（繁体中文），"
                    "并在开头加上 [NOTICE_READY] 标记\n"
                    "- 如果信息不足，请询问缺少的关键信息"
                )

                response, _ = self._ask_ai_func(
                    question=prompt,
                    subject_code="",
                    use_api=False,
                    conversation_history=[],
                )

                if "[NOTICE_READY]" in response:
                    # 信息足够，生成通知
                    content = response.replace("[NOTICE_READY]", "").strip()
                    content = self._clean_notice_content(content)
                    session["generated_content"] = content
                    session["stage"] = STAGE_CONFIRMING
                    session["progress"] = 95

                    session["conversation_history"].append({
                        "role": "assistant", "content": content,
                    })

                    return {
                        "session_id": session["session_id"],
                        "stage": STAGE_CONFIRMING,
                        "message": "通知内容已生成，请确认是否满意：",
                        "content": content,
                        "progress": 95,
                    }
                else:
                    session["conversation_history"].append({
                        "role": "assistant", "content": response,
                    })
                    return {
                        "session_id": session["session_id"],
                        "stage": STAGE_COLLECTING,
                        "message": response,
                        "progress": session["progress"],
                    }

            except Exception as e:
                logger.error("LLM 对话失败: %s", e)

        # LLM 不可用时的回退
        return {
            "session_id": session["session_id"],
            "stage": STAGE_COLLECTING,
            "message": "已记录信息，请继续提供通知的详细内容。",
            "progress": session["progress"],
        }

    def _handle_confirmation(
        self, session: Dict, user_input: str,
    ) -> Dict[str, Any]:
        """处理确认阶段"""
        input_lower = user_input.strip().lower()

        if any(w in input_lower for w in ["确认", "可以", "好", "满意", "ok", "yes"]):
            session["stage"] = STAGE_COMPLETED
            session["progress"] = 100

            # 保存到缓存
            self._save_session_cache(session)

            return {
                "session_id": session["session_id"],
                "stage": STAGE_COMPLETED,
                "message": "通知已确认，可以导出为 DOCX 文件。",
                "progress": 100,
            }

        # 需要修改
        if self._ask_ai_func:
            try:
                prompt = (
                    f"用户对以下通知内容不满意，要求修改：\n\n"
                    f"当前通知内容:\n{session.get('generated_content', '')}\n\n"
                    f"用户修改要求: {user_input}\n\n"
                    "请根据要求修改通知内容（繁体中文）。"
                )

                response, _ = self._ask_ai_func(
                    question=prompt,
                    subject_code="",
                    use_api=False,
                    conversation_history=[],
                )

                content = self._clean_notice_content(response)
                session["generated_content"] = content

                return {
                    "session_id": session["session_id"],
                    "stage": STAGE_CONFIRMING,
                    "message": "已根据您的要求修改，请再次确认：",
                    "content": content,
                    "progress": 95,
                }

            except Exception as e:
                logger.error("修改通知失败: %s", e)

        return {
            "session_id": session["session_id"],
            "stage": STAGE_CONFIRMING,
            "message": "请描述您需要修改的部分。",
            "progress": 95,
        }

    @staticmethod
    def _get_collecting_prompt(notice_type: str) -> str:
        """根据通知类型获取收集信息的提示"""
        prompts = {
            "activity": "请提供活动详情：活动名称、日期、时间、地点、参加对象、注意事项等。",
            "exam": "请提供考试详情：考试科目、日期、时间、地点、考试范围、注意事项等。",
            "meeting": "请提供会议详情：会议主题、日期、时间、地点、参加人员、议程等。",
            "holiday": "请提供假期详情：假期名称、起止日期、复课日期、注意事项等。",
            "health": "请提供健康通知详情：主题、注意事项、措施、联系方式等。",
            "fee": "请提供费用详情：费用项目、金额、缴费截止日期、缴费方式等。",
            "uniform": "请提供校服通知详情：涉及事项、日期、要求、注意事项等。",
            "competition": "请提供竞赛详情：竞赛名称、日期、报名截止、参赛要求等。",
            "safety": "请提供安全通知详情：主题、注意事项、安全措施、联系方式等。",
        }
        return prompts.get(notice_type,
                           "请提供通知的详细内容：主题、日期、时间、地点及其他关键信息。")

    @staticmethod
    def _extract_fields(text: str) -> Dict[str, str]:
        """从文本中智能提取结构化字段"""
        fields = {}

        # 日期提取
        date_patterns = [
            r'(\d{4})[年/-](\d{1,2})[月/-](\d{1,2})[日号]?',
            r'(\d{1,2})[月/](\d{1,2})[日号]?',
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                fields["date"] = match.group(0)
                break

        # 时间提取
        time_match = re.search(
            r'(\d{1,2})[：:](\d{2})\s*[-–至到]\s*(\d{1,2})[：:](\d{2})',
            text,
        )
        if time_match:
            fields["time"] = time_match.group(0)
        else:
            time_match = re.search(r'(\d{1,2})[：:](\d{2})', text)
            if time_match:
                fields["time"] = time_match.group(0)

        # 地点提取
        place_match = re.search(
            r'(?:地点|场地|地方|在)[：:是为]?\s*([^\s,，。;；]{2,20})',
            text,
        )
        if place_match:
            fields["location"] = place_match.group(1)

        return fields

    @staticmethod
    def _clean_notice_content(content: str) -> str:
        """清理通知内容（去重复、规范格式）"""
        # 去除重复的敬启者/此致
        lines = content.split('\n')
        seen_salutation = False
        seen_closing = False
        cleaned = []

        for line in lines:
            stripped = line.strip()
            if "敬啟者" in stripped or "敬启者" in stripped:
                if seen_salutation:
                    continue
                seen_salutation = True
            if "此致" in stripped:
                if seen_closing:
                    continue
                seen_closing = True
            cleaned.append(line)

        return '\n'.join(cleaned)

    def _save_session_cache(self, session: Dict):
        """保存会话到缓存文件"""
        try:
            os.makedirs(NOTICE_CACHE_DIR, exist_ok=True)
            cache_path = os.path.join(
                NOTICE_CACHE_DIR, f"{session['session_id']}.json",
            )
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(session, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("保存会话缓存失败: %s", e)
