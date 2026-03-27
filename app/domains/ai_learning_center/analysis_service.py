"""
AI 学习中心 — 内容分析服务 (ContentAnalysisService)

职责单一：接收 content_id，完成 AI 分析全流程。
    1. 提取文档文本
    2. 调用 LLM 生成知识图谱 + 学习路径
    3. 通过现有 batch_import 持久化结果
    4. 维护分析状态机 (pending → processing → completed / failed)

依赖：
    - LearningCenterService（批量导入）
    - LCContentRepository（状态更新）
    - ContentTextExtractor（文本提取，复用 llm/rag）
    - ApiProvider（LLM 调用，复用 llm/providers）
"""

import json
import logging
import re
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from pydantic import ValidationError as PydanticValidationError

from .schemas import AIAnalysisResult, AnalysisStatus

logger = logging.getLogger(__name__)

# ================================================================
# 文本截断上限（约 30K tokens，留给输出空间）
# ================================================================
MAX_TEXT_CHARS = 60_000

# ================================================================
# AI 系统 Prompt — 要求返回严格 JSON
# ================================================================
ANALYSIS_SYSTEM_PROMPT = """你是一位专业的教育内容分析师。请分析以下文档内容，提取关键知识概念，并生成**有层级结构**的知识图谱和学习路径。

要求：
1. 提取文档中的核心知识概念作为节点（5-15 个为宜）
2. **必须构建树状层级结构**：
   - 设计 1-2 个根节点（代表文档的核心主题）
   - 其他节点作为根节点的子节点或孙节点
   - 用 relation_type = "includes" 表示父子包含关系（父 → 子）
   - 用 "prerequisite" 或 "related" 表示同级之间的交叉关系
3. 为每个节点标注它在文档中对应的页码（如果有页码标记）
4. 设计一条合理的学习路径，从基础到进阶

**层级结构示例**：
- 根节点 A (includes→) 子节点 B
- 根节点 A (includes→) 子节点 C
- 子节点 B (prerequisite→) 子节点 C（同级交叉关系）

请严格按照以下 JSON 格式返回，不要包含任何其他文字：

```json
{
  "nodes": [
    {
      "id": "n1",
      "title": "核心主题（根节点）",
      "description": "简要描述（1-2 句话）",
      "icon": "🎯",
      "color": "#006633"
    },
    {
      "id": "n2",
      "title": "子概念",
      "description": "简要描述",
      "icon": "📌",
      "color": "#0066cc"
    }
  ],
  "edges": [
    {
      "source": "n1",
      "target": "n2",
      "relation_type": "includes",
      "label": "包含"
    },
    {
      "source": "n2",
      "target": "n3",
      "relation_type": "prerequisite",
      "label": "前置依赖"
    }
  ],
  "content_links": [
    {
      "node": "n2",
      "anchor": {"type": "page", "page": 3}
    }
  ],
  "path": {
    "title": "学习路径标题",
    "description": "路径描述",
    "difficulty": "beginner",
    "estimated_hours": 2.0,
    "steps": [
      {
        "title": "步骤标题",
        "description": "步骤描述",
        "node_match": "对应节点的标题",
        "sort_order": 1
      }
    ]
  }
}
```

规则：
- relation_type 可以是: includes（父子层级，必须有）, prerequisite, related, extends
- **edges 中至少一半应为 includes 类型**，确保形成清晰的树状层级
- difficulty 只能是: beginner, intermediate, advanced
- nodes 至少 1 个，建议 5-15 个
- edges 中的 source/target 必须引用 nodes 中的 id
- content_links 中的 node 必须引用 nodes 中的 id
- steps 中的 node_match 应与某个 node 的 title 完全一致
- 只返回 JSON，不要有任何解释文字"""


class ContentAnalysisService:
    """
    AI 内容分析服务。

    设计：
        - 通过 ServiceContainer 注入依赖，不直接 import 具体实现
        - analyze() 是同步方法，由 run_in_executor 在线程池调用
        - 状态更新通过 contents_repo 直接操作，不经过 LearningCenterService
        - 知识图谱/学习路径导入通过 LearningCenterService 的批量方法
    """

    def __init__(
        self,
        learning_center_service,
        contents_repo,
    ):
        self._lc_service = learning_center_service
        self._contents_repo = contents_repo

    # ================================================================
    # 公开接口
    # ================================================================

    def analyze(self, content_id: int, content_meta: Dict[str, Any]) -> Dict[str, Any]:
        """
        执行完整的 AI 分析流程（同步，供后台线程调用）。

        Args:
            content_id: 内容记录 ID
            content_meta: 内容元信息，需包含:
                content_type, file_path, file_name, title,
                subject_code, grade_level, created_by

        Returns:
            分析统计结果 dict

        Raises:
            不会抛出异常 — 所有错误记录到 ai_analysis_error 字段
        """
        try:
            self._update_status(content_id, AnalysisStatus.PROCESSING)

            # 1. 提取文本
            text = self._extract_text(content_meta)
            if not text.strip():
                raise ValueError("无法从文件中提取文本内容")

            # 2. 截断（保护 token 限制）
            text = self._truncate_text(text)

            # 3. 调用 LLM
            raw_response = self._call_llm(content_meta.get("title", ""), text)

            # 4. 解析 + 验证 JSON
            result = self._parse_response(raw_response)

            # 5. 导入知识图谱
            admin = (content_meta.get("created_by", "system"), "admin")
            subject_code = content_meta.get("subject_code")
            grade_level = content_meta.get("grade_level")
            file_name = content_meta.get("file_name", "")

            kg_stats = self._import_knowledge_graph(
                admin, result, file_name, subject_code, grade_level
            )

            # 6. 导入学习路径
            path_stats = self._import_learning_path(
                admin, result, file_name, subject_code, grade_level
            )

            # 7. 标记完成
            stats = {**kg_stats, **path_stats}
            self._update_status(content_id, AnalysisStatus.COMPLETED)
            logger.info(
                "AI 分析完成: content_id=%s, nodes=%s, edges=%s, paths=%s",
                content_id,
                kg_stats.get("created_nodes", 0),
                kg_stats.get("created_edges", 0),
                path_stats.get("created_paths", 0),
            )
            return stats

        except Exception as e:
            error_msg = str(e)[:500]
            self._update_status(content_id, AnalysisStatus.FAILED, error=error_msg)
            logger.exception("AI 分析失败: content_id=%s", content_id)
            return {"error": error_msg}

    # ================================================================
    # 内部方法 — 每个方法职责单一
    # ================================================================

    def _update_status(
        self,
        content_id: int,
        status: str,
        error: Optional[str] = None,
    ) -> None:
        """更新分析状态（直接操作 Repository）。"""
        data: Dict[str, Any] = {
            "ai_analysis_status": status,
            "ai_analysis_at": datetime.now(),
        }
        if error is not None:
            data["ai_analysis_error"] = error
        elif status == AnalysisStatus.PROCESSING:
            data["ai_analysis_error"] = None  # 重新分析时清除旧错误

        self._contents_repo.update(data, "id = %s", (content_id,))

    def _extract_text(self, content_meta: Dict) -> str:
        """复用现有 ContentTextExtractor 提取文档文本。"""
        from llm.rag.content_indexer import ContentTextExtractor

        extractor = ContentTextExtractor()
        return extractor.extract(content_meta)

    def _truncate_text(self, text: str) -> str:
        """截断文本到安全长度，保留页码标记的完整性。"""
        if len(text) <= MAX_TEXT_CHARS:
            return text

        # 在截断点附近找到完整段落边界
        truncated = text[:MAX_TEXT_CHARS]
        last_newline = truncated.rfind("\n")
        if last_newline > MAX_TEXT_CHARS * 0.8:
            truncated = truncated[:last_newline]

        return truncated + "\n\n[... 文档内容已截断，以上为前半部分 ...]"

    def _call_llm(self, title: str, text: str) -> str:
        """通过 ApiProvider 调用 LLM，返回原始响应文本。"""
        from llm.config import get_llm_config
        from llm.providers.api_provider import ApiProvider

        config = get_llm_config()
        if not config.api_key:
            raise ValueError("未配置 API Key，无法执行 AI 分析")

        provider = ApiProvider(
            model=config.api_model,
            base_url=config.api_base_url,
            api_key=config.api_key,
            temperature=0.3,  # 结构化输出用较低温度
            max_tokens=config.max_tokens,
            timeout=180,  # 分析任务给更长超时
        )

        messages = [
            {"role": "system", "content": ANALYSIS_SYSTEM_PROMPT},
            {"role": "user", "content": f"文档标题：{title}\n\n{text}"},
        ]

        response = provider.invoke_with_messages(messages)

        # 检查 API 错误
        if response.startswith("[API Error]"):
            raise RuntimeError(f"LLM 调用失败: {response}")

        return response

    def _parse_response(self, raw: str) -> AIAnalysisResult:
        """
        解析 LLM 返回的 JSON。

        处理常见情况：
        - markdown code fences (```json ... ```)
        - 前后有多余文字
        - 编码问题
        """
        # 去除 markdown code fences
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*\n?", "", cleaned)
        cleaned = re.sub(r"\n?```\s*$", "", cleaned)
        cleaned = cleaned.strip()

        # 尝试提取 JSON 对象
        json_match = re.search(r"\{[\s\S]*\}", cleaned)
        if not json_match:
            raise ValueError(f"AI 响应中未找到有效 JSON 结构")

        json_str = json_match.group(0)

        try:
            data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON 解析失败: {e}")

        # 通过 Pydantic 模型验证
        try:
            return AIAnalysisResult(**data)
        except PydanticValidationError as e:
            raise ValueError(f"AI 输出格式验证失败: {e}")

    def _import_knowledge_graph(
        self,
        admin: Tuple[str, str],
        result: AIAnalysisResult,
        file_name: str,
        subject_code: Optional[str],
        grade_level: Optional[str],
    ) -> Dict[str, Any]:
        """调用 LearningCenterService.batch_import_knowledge_graph() 导入。"""
        nodes = [n.dict() for n in result.nodes]
        edges = [e.dict() for e in result.edges]
        content_links = [cl.dict() for cl in result.content_links]

        return self._lc_service.batch_import_knowledge_graph(
            admin=admin,
            nodes=nodes,
            edges=edges,
            content_links=content_links,
            source_pdf=file_name,
            subject_code=subject_code,
            grade_level=grade_level,
        )

    def _import_learning_path(
        self,
        admin: Tuple[str, str],
        result: AIAnalysisResult,
        file_name: str,
        subject_code: Optional[str],
        grade_level: Optional[str],
    ) -> Dict[str, Any]:
        """调用 LearningCenterService.batch_import_paths() 导入学习路径。"""
        if not result.path:
            return {"created_paths": 0, "created_steps": 0, "skipped_steps": 0}

        path_data = result.path.dict()

        # 为每个步骤: 映射字段名 + 添加 source_pdf
        for step in path_data.get("steps", []):
            step["source_pdf"] = file_name
            # AI 输出 sort_order，batch_import 期望 step_order
            if "sort_order" in step and "step_order" not in step:
                step["step_order"] = step.pop("sort_order")

        return self._lc_service.batch_import_paths(
            admin=admin,
            paths=[path_data],
            subject_code=subject_code,
            grade_level=grade_level,
        )
