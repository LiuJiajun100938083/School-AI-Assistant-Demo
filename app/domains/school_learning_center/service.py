"""
学校学习中心服务层 - SchoolLearningCenterService
================================================
完全独立于 AI 学习中心，使用 slc_ 前缀的数据库表。
"""

import json
import logging
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple

from app.core.exceptions import NotFoundError, ValidationError

logger = logging.getLogger(__name__)

VALID_CONTENT_TYPES = {"video_local", "video_external", "document", "image", "article"}
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}


class SchoolLearningCenterService:
    """学校学习中心核心服务"""

    def __init__(
        self,
        content_repo,
        node_repo,
        edge_repo,
        node_content_repo,
        path_repo,
        step_repo,
        settings=None,
    ):
        self._contents = content_repo
        self._nodes = node_repo
        self._edges = edge_repo
        self._node_contents = node_content_repo
        self._paths = path_repo
        self._steps = step_repo
        self._settings = settings

    # ================================================================
    # 科目列表
    # ================================================================

    def get_subjects_with_content(self) -> List[Dict]:
        """获取所有活跃学科（从 subjects 表），并统计每个学科的内容数量"""
        try:
            rows = self._contents.raw_query(
                "SELECT subject_code, subject_name, config FROM subjects ORDER BY id ASC"
            )
            logger.info("SLC: 从 subjects 表查到 %d 条学科", len(rows) if rows else 0)
        except Exception as e:
            logger.exception("SLC: 查询 subjects 表失败: %s", e)
            rows = []

        if not rows:
            return []

        result = []
        for row in rows:
            code = row.get("subject_code")
            config = row.get("config") or {}
            if isinstance(config, str):
                try:
                    config = json.loads(config)
                except Exception:
                    config = {}
            elif isinstance(config, dict):
                pass  # MySQL JSON 列已自动解析
            else:
                config = {}
            try:
                count = self._contents.count_published_by_subject(code)
            except Exception:
                count = 0
            result.append({
                "subject_code": code,
                "subject_name": row.get("subject_name", code),
                "icon": config.get("icon", "📚"),
                "content_count": count,
            })

        return result

    # ================================================================
    # 内容浏览（Public）
    # ================================================================

    def get_contents(
        self,
        subject_code: Optional[str] = None,
        grade_level: Optional[str] = None,
        content_type: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        result = self._contents.find_published(
            subject_code=subject_code,
            grade_level=grade_level,
            content_type=content_type or "",
            search=search or "",
            page=page,
            page_size=page_size,
        )
        for item in result.get("items", []):
            self._parse_tags(item)
        return result

    def get_content_detail(self, content_id: int) -> Dict:
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)
        if content.get("status") != "published":
            raise NotFoundError("内容", content_id)
        self._contents.increment_view(content_id)
        result = dict(content)
        result["view_count"] = (result.get("view_count") or 0) + 1
        self._parse_tags(result)
        return result

    def search_contents(
        self,
        keyword: str,
        subject_code: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        result = self._contents.search_contents(
            keyword=keyword, subject_code=subject_code,
            page=page, page_size=page_size,
        )
        for item in result.get("items", []):
            self._parse_tags(item)
        return result

    def get_stats(self, subject_code: Optional[str] = None) -> Dict:
        by_type = self._contents.get_stats(subject_code=subject_code)
        total_contents = sum(by_type.values())
        return {
            "total_contents": total_contents,
            "by_content_type": by_type,
            "total_nodes": self._nodes.count_active(subject_code=subject_code),
            "total_paths": self._paths.count_published(subject_code=subject_code),
        }

    # ================================================================
    # 知识地图
    # ================================================================

    def get_knowledge_map(self, subject_code: Optional[str] = None) -> Dict:
        nodes_data = self._nodes.find_active(subject_code=subject_code)
        edges_data = self._edges.find_all_edges(subject_code=subject_code)

        nodes = []
        for node in nodes_data:
            node_dict = dict(node)
            node_dict["contents"] = self._node_contents.find_by_node(node["id"])
            nodes.append(node_dict)

        return {
            "nodes": nodes,
            "edges": [dict(e) for e in edges_data],
        }

    # ================================================================
    # 学习路径
    # ================================================================

    def get_paths(
        self,
        subject_code: Optional[str] = None,
        grade_level: Optional[str] = None,
    ) -> List[Dict]:
        paths = self._paths.find_published(
            subject_code=subject_code, grade_level=grade_level,
        )
        result = []
        for path in paths:
            path_dict = dict(path)
            self._parse_tags(path_dict)
            path_dict["steps"] = self._steps.find_by_path(path["id"])
            result.append(path_dict)
        return result

    def get_path_detail(self, path_id: int) -> Dict:
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)
        result = dict(path)
        self._parse_tags(result)
        steps = self._steps.find_by_path(path_id)
        for step in steps:
            cid = step.get("content_id")
            nid = step.get("node_id")
            if cid and nid:
                node_contents = self._node_contents.find_by_node(nid)
                for nc in node_contents:
                    if nc.get("content_id") == cid and nc.get("anchor"):
                        step["anchor"] = nc["anchor"]
                        break
            if cid:
                content = self._contents.find_by_id(cid)
                if content:
                    step["content_title"] = content.get("title", "")
                    step["content_type"] = content.get("content_type", "")
        result["steps"] = steps
        return result

    # ================================================================
    # 内容管理（Admin）
    # ================================================================

    def create_content(
        self,
        admin: Tuple[str, str],
        title: str,
        subject_code: str,
        description: str = "",
        content_type: str = "article",
        file_path: Optional[str] = None,
        file_name: Optional[str] = None,
        file_size: Optional[int] = None,
        mime_type: Optional[str] = None,
        external_url: Optional[str] = None,
        video_platform: Optional[str] = None,
        article_content: Optional[str] = None,
        thumbnail_path: Optional[str] = None,
        duration: Optional[int] = None,
        tags: Optional[List[str]] = None,
        status: str = "draft",
        grade_level: Optional[str] = None,
    ) -> Dict:
        if not title or not title.strip():
            raise ValidationError("内容标题不能为空", field="title")
        if not subject_code:
            raise ValidationError("科目代码不能为空", field="subject_code")
        if content_type not in VALID_CONTENT_TYPES:
            raise ValidationError(
                f"内容类型必须是: {', '.join(VALID_CONTENT_TYPES)}",
                field="content_type",
            )

        username, _ = admin
        content_data = {
            "title": title.strip(),
            "description": description.strip() if description else "",
            "content_type": content_type,
            "file_path": file_path,
            "file_name": file_name,
            "file_size": file_size,
            "mime_type": mime_type,
            "external_url": external_url,
            "video_platform": video_platform,
            "article_content": article_content,
            "thumbnail_path": thumbnail_path,
            "duration": duration,
            "tags": json.dumps(tags) if tags else None,
            "status": status,
            "view_count": 0,
            "subject_code": subject_code,
            "grade_level": grade_level,
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._contents.insert_get_id(content_data)
        logger.info("SLC 创建内容: %s (id=%s, subject=%s)", title, new_id, subject_code)

        content_data["id"] = new_id
        content_data["tags"] = tags or []
        return content_data

    def delete_content(self, admin: Tuple[str, str], content_id: int) -> None:
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)
        self._contents.soft_delete("id = %s", (content_id,))
        logger.info("SLC 删除内容: %s", content_id)

    def publish_content(self, admin: Tuple[str, str], content_id: int) -> Dict:
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)
        update_data = {"status": "published", "updated_at": datetime.now()}
        self._contents.update(update_data, "id = %s", (content_id,))
        result = dict(content)
        result.update(update_data)
        return result

    # ================================================================
    # 知识节点管理（Admin）
    # ================================================================

    def create_node(
        self,
        admin: Tuple[str, str],
        title: str,
        subject_code: str,
        description: str = "",
        icon: str = "📌",
        color: str = "#006633",
        grade_level: Optional[str] = None,
    ) -> Dict:
        if not title or not title.strip():
            raise ValidationError("节点标题不能为空", field="title")
        if not subject_code:
            raise ValidationError("科目代码不能为空", field="subject_code")

        username, _ = admin
        node_data = {
            "title": title.strip(),
            "description": description.strip() if description else "",
            "icon": icon,
            "color": color,
            "subject_code": subject_code,
            "grade_level": grade_level,
            "position_x": 0,
            "position_y": 0,
            "is_pinned": 0,
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._nodes.insert_get_id(node_data)
        logger.info("SLC 创建节点: %s (id=%s)", title, new_id)
        node_data["id"] = new_id
        return node_data

    def delete_node(self, admin: Tuple[str, str], node_id: int) -> None:
        node = self._nodes.find_by_id(node_id)
        if not node or node.get("is_deleted"):
            raise NotFoundError("节点", node_id)
        self._nodes.soft_delete("id = %s", (node_id,))
        logger.info("SLC 删除节点: %s", node_id)

    def create_edge(
        self,
        admin: Tuple[str, str],
        source_node_id: int,
        target_node_id: int,
        relation_type: str = "related",
        label: str = "",
        weight: float = 1.0,
        subject_code: Optional[str] = None,
    ) -> Dict:
        source = self._nodes.find_by_id(source_node_id)
        if not source or source.get("is_deleted"):
            raise NotFoundError("节点", source_node_id)
        target = self._nodes.find_by_id(target_node_id)
        if not target or target.get("is_deleted"):
            raise NotFoundError("节点", target_node_id)

        edge_data = {
            "source_node_id": source_node_id,
            "target_node_id": target_node_id,
            "relation_type": relation_type,
            "label": label,
            "weight": weight,
            "subject_code": subject_code,
            "is_deleted": 0,
        }
        new_id = self._edges.insert_get_id(edge_data)
        logger.info("SLC 创建边: %s -> %s (id=%s)", source_node_id, target_node_id, new_id)
        edge_data["id"] = new_id
        return edge_data

    def delete_edge(self, admin: Tuple[str, str], edge_id: int) -> None:
        edge = self._edges.find_by_id(edge_id)
        if not edge:
            raise NotFoundError("边", edge_id)
        self._edges.delete("id = %s", (edge_id,))
        logger.info("SLC 删除边: %s", edge_id)

    # ================================================================
    # 知识图谱批量导入
    # ================================================================

    def batch_import_knowledge_graph(
        self,
        admin: Tuple[str, str],
        nodes: List[Dict],
        subject_code: str,
        edges: List[Dict] = None,
        content_links: List[Dict] = None,
        source_pdf: Optional[str] = None,
        clear_existing: bool = False,
        grade_level: Optional[str] = None,
    ) -> Dict:
        edges = edges or []
        content_links = content_links or []
        username, _ = admin

        if not subject_code:
            raise ValidationError("科目代码不能为空", field="subject_code")

        if clear_existing:
            all_nodes = self._nodes.find_active(subject_code=subject_code)
            for node in all_nodes:
                self._node_contents.delete("node_id = %s", (node["id"],))
            self._edges.raw_execute(
                "DELETE FROM slc_knowledge_edges WHERE subject_code = %s",
                (subject_code,),
            )
            self._nodes.raw_execute(
                "UPDATE slc_knowledge_nodes SET is_deleted = 1 WHERE subject_code = %s",
                (subject_code,),
            )
            logger.info("SLC 批量导入：清空 %s 知识图谱", subject_code)

        # Phase 1: 创建节点
        temp_id_to_db_id: Dict[str, int] = {}
        created_nodes = 0
        for node in nodes:
            temp_id = node["id"]
            node_data = {
                "title": node["title"].strip(),
                "description": (node.get("description") or "").strip(),
                "icon": node.get("icon", "📌"),
                "color": node.get("color", "#006633"),
                "subject_code": subject_code,
                "grade_level": grade_level,
                "position_x": 0,
                "position_y": 0,
                "is_pinned": 0,
                "created_by": username,
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "is_deleted": 0,
            }
            new_id = self._nodes.insert_get_id(node_data)
            temp_id_to_db_id[temp_id] = new_id
            created_nodes += 1

        # Phase 2: 创建边
        created_edges = 0
        for edge in edges:
            source_db_id = temp_id_to_db_id.get(edge["source"])
            target_db_id = temp_id_to_db_id.get(edge["target"])
            if source_db_id is None or target_db_id is None:
                continue
            edge_data = {
                "source_node_id": source_db_id,
                "target_node_id": target_db_id,
                "relation_type": edge.get("relation_type", "related"),
                "label": edge.get("label", ""),
                "weight": edge.get("weight", 1.0),
                "subject_code": subject_code,
                "is_deleted": 0,
            }
            try:
                self._edges.insert_get_id(edge_data)
                created_edges += 1
            except Exception as e:
                logger.warning("SLC 创建边失败: %s", e)

        # Phase 3: 自动匹配 content_id
        matched_content_id = None
        if source_pdf:
            rows = self._contents.raw_query(
                "SELECT id, file_name, title FROM slc_contents WHERE is_deleted = 0 AND status = 'published'",
            )
            for row in rows:
                fname = row.get("file_name") or ""
                title = row.get("title") or ""
                pdf_stem = source_pdf.rsplit(".", 1)[0] if "." in source_pdf else source_pdf
                if source_pdf in fname or pdf_stem in fname or pdf_stem in title:
                    matched_content_id = row["id"]
                    break

        # Phase 4: 创建内容关联
        created_links = 0
        skipped_links = 0
        for link in content_links:
            node_db_id = temp_id_to_db_id.get(link["node"])
            if node_db_id is None:
                skipped_links += 1
                continue
            content_id = link.get("content_id") or matched_content_id
            if content_id is None:
                skipped_links += 1
                continue
            anchor = link.get("anchor")
            affected = self._node_contents.link_with_anchor(
                node_id=node_db_id,
                content_id=content_id,
                anchor=anchor,
            )
            if affected > 0:
                created_links += 1
            else:
                skipped_links += 1

        logger.info(
            "SLC 批量导入完成: %d 节点, %d 边, %d 关联",
            created_nodes, created_edges, created_links,
        )

        return {
            "created_nodes": created_nodes,
            "created_edges": created_edges,
            "created_links": created_links,
            "skipped_links": skipped_links,
        }

    # ================================================================
    # 学习路径管理（Admin）
    # ================================================================

    def create_path(
        self,
        admin: Tuple[str, str],
        title: str,
        subject_code: str,
        description: str = "",
        icon: str = "🎯",
        difficulty: str = "beginner",
        estimated_hours: float = 1.0,
        tags: Optional[List[str]] = None,
        grade_level: Optional[str] = None,
    ) -> Dict:
        if not title or not title.strip():
            raise ValidationError("路径标题不能为空", field="title")
        if not subject_code:
            raise ValidationError("科目代码不能为空", field="subject_code")
        if difficulty not in VALID_DIFFICULTIES:
            raise ValidationError(
                f"难度必须是: {', '.join(VALID_DIFFICULTIES)}",
                field="difficulty",
            )

        username, _ = admin
        path_data = {
            "title": title.strip(),
            "description": description.strip() if description else "",
            "icon": icon,
            "difficulty": difficulty,
            "estimated_hours": estimated_hours,
            "tags": json.dumps(tags) if tags else None,
            "subject_code": subject_code,
            "grade_level": grade_level,
            "status": "published",
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._paths.insert_get_id(path_data)
        logger.info("SLC 创建路径: %s (id=%s)", title, new_id)
        path_data["id"] = new_id
        path_data["tags"] = tags or []
        path_data["steps"] = []
        return path_data

    def delete_path(self, admin: Tuple[str, str], path_id: int) -> None:
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)
        self._paths.soft_delete("id = %s", (path_id,))
        logger.info("SLC 删除路径: %s", path_id)

    def batch_import_paths(
        self,
        admin: Tuple[str, str],
        paths: List[Dict],
        subject_code: str,
        clear_existing: bool = False,
        grade_level: Optional[str] = None,
    ) -> Dict:
        username, _ = admin

        if not subject_code:
            raise ValidationError("科目代码不能为空", field="subject_code")

        if clear_existing:
            self._paths.raw_execute(
                "UPDATE slc_learning_paths SET is_deleted = 1 WHERE subject_code = %s AND is_deleted = 0",
                (subject_code,),
            )
            logger.info("SLC 批量导入路径：清空 %s 路径", subject_code)

        # 预加载节点和内容用于匹配
        all_nodes = self._nodes.find_active(subject_code=subject_code)
        node_title_map = {}
        for n in all_nodes:
            title = (n.get("title") or "").strip()
            if title:
                node_title_map[title] = n["id"]
                node_title_map[title.lower()] = n["id"]

        all_contents = self._contents.raw_query(
            "SELECT id, file_name, title FROM slc_contents WHERE is_deleted = 0 AND status = 'published' AND subject_code = %s",
            (subject_code,),
        )
        pdf_cache = {}

        def match_content_id(source_pdf: str) -> Optional[int]:
            if not source_pdf:
                return None
            if source_pdf in pdf_cache:
                return pdf_cache[source_pdf]
            pdf_stem = source_pdf.rsplit(".", 1)[0] if "." in source_pdf else source_pdf
            for row in all_contents:
                fname = row.get("file_name") or ""
                t = row.get("title") or ""
                if source_pdf in fname or pdf_stem in fname or pdf_stem in t:
                    pdf_cache[source_pdf] = row["id"]
                    return row["id"]
            pdf_cache[source_pdf] = None
            return None

        created_paths = 0
        created_steps = 0
        skipped_steps = 0
        path_details = []

        for p in paths:
            path_data = {
                "title": p["title"].strip(),
                "description": (p.get("description") or "").strip(),
                "icon": p.get("icon", "🎯"),
                "difficulty": p.get("difficulty", "beginner"),
                "estimated_hours": p.get("estimated_hours", 1.0),
                "tags": json.dumps(p.get("tags")) if p.get("tags") else None,
                "subject_code": subject_code,
                "grade_level": grade_level,
                "status": "published",
                "created_by": username,
                "created_at": datetime.now(),
                "updated_at": datetime.now(),
                "is_deleted": 0,
            }

            path_id = self._paths.insert_get_id(path_data)
            created_paths += 1

            step_count = 0
            for step in p.get("steps", []):
                node_id = step.get("node_id")
                if not node_id and step.get("node_match"):
                    node_id = node_title_map.get(step["node_match"])
                    if not node_id:
                        node_id = node_title_map.get(step["node_match"].lower())

                content_id = step.get("content_id")
                if not content_id and step.get("source_pdf"):
                    content_id = match_content_id(step["source_pdf"])

                step_data = {
                    "path_id": path_id,
                    "step_order": step.get("step_order", 0),
                    "title": step.get("title", ""),
                    "description": step.get("description", ""),
                    "content_id": content_id,
                    "node_id": node_id,
                }
                try:
                    self._steps.insert(step_data)
                    step_count += 1
                    created_steps += 1
                except Exception as e:
                    logger.warning("SLC 步骤创建失败: %s", e)
                    skipped_steps += 1

            path_details.append({
                "path_id": path_id,
                "title": p["title"],
                "steps_count": step_count,
            })

        logger.info(
            "SLC 批量导入路径完成: %d 路径, %d 步骤, %d 跳过",
            created_paths, created_steps, skipped_steps,
        )

        return {
            "created_paths": created_paths,
            "created_steps": created_steps,
            "skipped_steps": skipped_steps,
            "path_details": path_details,
        }

    # ================================================================
    # AI 助手
    # ================================================================

    def _build_kg_node_hint(self, subject_code: Optional[str] = None) -> str:
        nodes = self._nodes.find_active(subject_code=subject_code)
        if not nodes:
            return ""
        lines = [f"- [{n['id']}] {n['title']}" for n in nodes]
        return (
            "以下是知识图谱中的知识点列表（供参考，回答时可提及相关知识点名称）：\n"
            + "\n".join(lines)
        )

    def _match_knowledge_nodes(self, answer_text: str, subject_code: Optional[str] = None, max_results: int = 5) -> list:
        nodes = self._nodes.find_active(subject_code=subject_code)
        if not nodes or not answer_text:
            return []
        matched = []
        answer_lower = answer_text.lower()
        for n in nodes:
            title = (n.get("title") or "").strip()
            if len(title) < 2:
                continue
            if title.lower() in answer_lower:
                matched.append({
                    "id": n["id"],
                    "title": title,
                    "icon": n.get("icon", "📌"),
                    "color": n.get("color", "#006633"),
                })
        matched.sort(key=lambda x: len(x["title"]), reverse=True)
        return matched[:max_results]

    async def ai_ask_stream(
        self,
        username: str,
        question: str,
        subject_code: Optional[str] = None,
        content_id: Optional[int] = None,
    ) -> AsyncGenerator[Dict, None]:
        import asyncio
        from functools import partial

        from llm.rag.context import build_prompt_context
        from llm.prompts.templates import apply_thinking_mode
        from llm.providers.ollama import get_ollama_provider

        loop = asyncio.get_running_loop()
        full_answer_parts = []
        page_references = []

        # 获取科目名称
        subject_name = subject_code or "学习"
        if subject_code:
            try:
                rows = self._contents.raw_query(
                    "SELECT subject_name FROM subjects WHERE subject_code = %s",
                    (subject_code,),
                )
                if rows:
                    subject_name = rows[0].get("subject_name", subject_code)
            except Exception:
                pass

        if content_id is not None:
            # ---- 内容感知 RAG 路径（PDF/文档问答） ----
            from llm.rag.content_indexer import get_content_indexer
            from llm.rag.retrieval import get_context_for_content_with_pages

            content = self._contents.find_by_id(content_id)
            if not content:
                yield {"type": "token", "content": "找不到对应的学习内容。"}
                yield {"type": "done", "related_nodes": [], "page_references": []}
                return

            content_title = content.get("title", "")
            is_pdf = (content.get("mime_type") or "").lower().find("pdf") >= 0 or \
                     (content.get("file_name") or content.get("file_path") or "").lower().endswith(".pdf")

            # 懒索引：如果该内容尚未被向量化，先触发索引
            indexer = get_content_indexer()
            indexed = await loop.run_in_executor(None, indexer.is_indexed, content_id)
            if not indexed:
                logger.info("SLC 流式懒索引触发: content_id=%s", content_id)
                await loop.run_in_executor(
                    None, partial(indexer.index, content_id, dict(content))
                )

            # RAG 检索（带页码引用）
            rag_context, page_refs = await loop.run_in_executor(
                None, partial(get_context_for_content_with_pages, question, content_id),
            )
            if is_pdf and page_refs:
                page_references = page_refs

            system_prompt = (
                f"你是学校 AI 学习助教，当前科目是「{subject_name}」。\n"
                f"学生正在阅读「{content_title}」。\n"
                f"请基于以下检索到的内容片段回答学生的问题。\n"
                f"如果片段不足以回答，可结合通用知识，但请注明。"
            )
            prompt = build_prompt_context(
                question=question,
                system_prompt=system_prompt,
                kb_context=rag_context,
            )
        else:
            # ---- 通用问答路径 ----
            system_prompt = (
                f"你是学校 AI 学习助教，当前科目是「{subject_name}」。\n"
                f"帮助学生解答该科目的学习问题。\n"
                f"请基于你的知识，提供清晰、专业的解答。\n"
                f"如果不确定，请如实告知。"
            )
            kg_hint = self._build_kg_node_hint(subject_code=subject_code)
            if kg_hint:
                system_prompt += f"\n\n{kg_hint}"

            prompt = build_prompt_context(
                question=question,
                system_prompt=system_prompt,
            )

        thinking_prompt = apply_thinking_mode(prompt, task_type="qa")

        provider = get_ollama_provider()

        async for token_type, token_content in provider.async_stream(thinking_prompt):
            if not token_content:
                continue
            if token_type == "thinking":
                yield {"type": "thinking", "content": token_content}
            else:
                full_answer_parts.append(token_content)
                yield {"type": "token", "content": token_content}

        full_answer = "".join(full_answer_parts)
        related_nodes = self._match_knowledge_nodes(full_answer, subject_code=subject_code)

        logger.info(
            "SLC AI 回答完成: user=%s, subject=%s, content_id=%s, page_refs=%d",
            username, subject_code, content_id, len(page_references),
        )

        yield {
            "type": "done",
            "related_nodes": related_nodes,
            "page_references": page_references,
        }

    # ================================================================
    # 私有方法
    # ================================================================

    @staticmethod
    def _parse_tags(item: Dict) -> None:
        tags_val = item.get("tags")
        if isinstance(tags_val, str):
            try:
                item["tags"] = json.loads(tags_val)
            except (json.JSONDecodeError, TypeError):
                item["tags"] = []
        elif tags_val is None:
            item["tags"] = []
