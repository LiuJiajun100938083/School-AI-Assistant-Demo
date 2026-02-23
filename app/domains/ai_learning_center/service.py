"""
AI 学习中心服务层 - LearningCenterService
=========================================
职责:
1. 分类管理（创建、更新、删除、查询）
2. 内容管理（创建、发布、搜索、浏览）
3. 知识地图（节点、边、关联内容）
4. 学习路径（创建、步骤管理、发布）
5. AI 助手（问答功能）

使用依赖注入模式注入各个 Repository 实例。
所有 admin 参数接收 Tuple[str, str] = (username, role)。
"""

import json
import logging
from datetime import datetime
from typing import Any, AsyncGenerator, Callable, Dict, List, Optional, Tuple

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)

# 常量定义
VALID_CONTENT_TYPES = {"video_local", "video_external", "document", "image", "article"}
VALID_DIFFICULTIES = {"beginner", "intermediate", "advanced"}
VALID_CONTENT_STATUSES = {"draft", "published", "archived"}


class LearningCenterService:
    """
    AI 学习中心核心服务

    所有 admin 参数为 Tuple[str, str]，来自 require_teacher_or_admin 依赖，
    格式为 (username, role)。
    """

    def __init__(
        self,
        category_repo,
        content_repo,
        content_category_repo,
        node_repo,
        edge_repo,
        node_content_repo,
        path_repo,
        step_repo,
        settings=None,
    ):
        self._categories = category_repo
        self._contents = content_repo
        self._content_categories = content_category_repo
        self._nodes = node_repo
        self._edges = edge_repo
        self._node_contents = node_content_repo
        self._paths = path_repo
        self._steps = step_repo
        self._settings = settings
        self._ask_ai_func: Optional[Callable] = None

    # ================================================================
    # 外部依赖注入
    # ================================================================

    def set_ai_function(self, ask_ai: Callable):
        """注入 AI 问答函数"""
        self._ask_ai_func = ask_ai

    # ================================================================
    # 分类管理
    # ================================================================

    def create_category(
        self,
        admin: Tuple[str, str],
        name: str,
        description: str = "",
        slug: str = "",
        icon: str = "",
        parent_id: Optional[int] = None,
        sort_order: int = 0,
    ) -> Dict:
        """创建分类"""
        if not name or not name.strip():
            raise ValidationError("分类名称不能为空", field="name")

        # 自动生成 slug
        if not slug:
            import re
            slug = re.sub(r'[^a-z0-9]+', '-', name.lower().strip()).strip('-')

        # 检查 slug 唯一性
        existing = self._categories.find_by_slug(slug)
        if existing:
            raise ConflictError(f"Slug '{slug}' 已存在")

        # 验证父分类存在
        if parent_id:
            parent = self._categories.find_by_id(parent_id)
            if not parent:
                raise NotFoundError("分类", parent_id)

        username, _ = admin
        category_data = {
            "name": name.strip(),
            "slug": slug,
            "icon": icon or "📁",
            "description": description.strip() if description else "",
            "parent_id": parent_id,
            "sort_order": sort_order,
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._categories.insert_get_id(category_data)
        logger.info("创建分类: %s (id=%s)", name, new_id)

        category_data["id"] = new_id
        return category_data

    def update_category(self, admin: Tuple[str, str], category_id: int, data: Dict) -> Dict:
        """更新分类"""
        category = self._categories.find_by_id(category_id)
        if not category or category.get("is_deleted"):
            raise NotFoundError("分类", category_id)

        # 验证 slug 唯一性
        if "slug" in data and data["slug"] != category.get("slug"):
            existing = self._categories.find_by_slug(data["slug"])
            if existing:
                raise ConflictError(f"Slug '{data['slug']}' 已存在")

        if "name" in data and not data["name"].strip():
            raise ValidationError("分类名称不能为空", field="name")

        update_fields = {}
        for key in ("name", "slug", "icon", "description", "parent_id", "sort_order"):
            if key in data:
                update_fields[key] = data[key]

        update_fields["updated_at"] = datetime.now()

        self._categories.update(update_fields, "id = %s", (category_id,))
        logger.info("更新分类: %s", category_id)

        result = dict(category)
        result.update(update_fields)
        return result

    def delete_category(self, admin: Tuple[str, str], category_id: int) -> None:
        """软删除分类"""
        category = self._categories.find_by_id(category_id)
        if not category or category.get("is_deleted"):
            raise NotFoundError("分类", category_id)

        self._categories.soft_delete("id = %s", (category_id,))
        logger.info("删除分类: %s", category_id)

    def get_categories(self) -> List[Dict]:
        """获取分类列表（树形结构）"""
        categories = self._categories.find_tree()

        # 构建树形结构
        category_map = {c["id"]: dict(c) for c in categories}
        root_categories = []

        for cat in categories:
            cat_dict = category_map[cat["id"]]
            cat_dict.setdefault("children", [])
            parent_id = cat.get("parent_id")
            if not parent_id:
                root_categories.append(cat_dict)
            elif parent_id in category_map:
                parent = category_map[parent_id]
                parent.setdefault("children", [])
                parent["children"].append(cat_dict)

        return root_categories

    # ================================================================
    # 内容管理（Admin）
    # ================================================================

    def create_content(
        self,
        admin: Tuple[str, str],
        title: str,
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
        category_ids: Optional[List[int]] = None,
        status: str = "draft",
    ) -> Dict:
        """创建内容"""
        if not title or not title.strip():
            raise ValidationError("内容标题不能为空", field="title")

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
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._contents.insert_get_id(content_data)
        logger.info("创建内容: %s (id=%s)", title, new_id)

        # 关联分类
        if category_ids:
            self._content_categories.link(new_id, category_ids)

        content_data["id"] = new_id
        content_data["tags"] = tags or []
        content_data["category_ids"] = category_ids or []
        return content_data

    def update_content(self, admin: Tuple[str, str], content_id: int, data: Dict) -> Dict:
        """更新内容"""
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)

        if "title" in data and not data["title"].strip():
            raise ValidationError("内容标题不能为空", field="title")

        if "content_type" in data and data["content_type"] not in VALID_CONTENT_TYPES:
            raise ValidationError(
                f"内容类型必须是: {', '.join(VALID_CONTENT_TYPES)}",
                field="content_type",
            )

        update_fields = {}
        for key in (
            "title", "description", "content_type", "status",
            "file_path", "external_url", "article_content",
            "thumbnail_path", "duration", "video_platform",
        ):
            if key in data:
                update_fields[key] = data[key]

        if "tags" in data:
            update_fields["tags"] = json.dumps(data["tags"]) if data["tags"] else None

        update_fields["updated_at"] = datetime.now()

        self._contents.update(update_fields, "id = %s", (content_id,))

        # 更新分类关联
        if "category_ids" in data:
            self._content_categories.link(content_id, data["category_ids"] or [])

        logger.info("更新内容: %s", content_id)

        result = dict(content)
        result.update(update_fields)
        # 解析 tags
        self._parse_tags(result)
        return result

    def delete_content(self, admin: Tuple[str, str], content_id: int) -> None:
        """软删除内容"""
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)

        self._contents.soft_delete("id = %s", (content_id,))
        logger.info("删除内容: %s", content_id)

    def publish_content(self, admin: Tuple[str, str], content_id: int) -> Dict:
        """发布内容"""
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)

        update_data = {"status": "published", "updated_at": datetime.now()}
        self._contents.update(update_data, "id = %s", (content_id,))
        logger.info("发布内容: %s", content_id)

        result = dict(content)
        result.update(update_data)
        return result

    def reorder_contents(self, admin: Tuple[str, str], content_ids: List[int]) -> None:
        """批量更新内容排序"""
        for idx, content_id in enumerate(content_ids):
            self._contents.update(
                {"sort_order": idx},
                "id = %s",
                (content_id,),
            )
        logger.info("内容排序已更新: %d 条", len(content_ids))

    # ================================================================
    # 内容浏览（Public）
    # ================================================================

    def get_contents(
        self,
        content_type: Optional[str] = None,
        category_id: Optional[int] = None,
        tags: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        """获取已发布内容列表（分页）"""
        result = self._contents.find_published(
            content_type=content_type or "",
            category_id=category_id,
            search=search or "",
            page=page,
            page_size=page_size,
        )

        # 处理 tags
        for item in result.get("items", []):
            self._parse_tags(item)

        return result

    def get_content_detail(self, content_id: int) -> Dict:
        """获取内容详情并增加浏览数"""
        content = self._contents.find_by_id(content_id)
        if not content or content.get("is_deleted"):
            raise NotFoundError("内容", content_id)

        if content.get("status") != "published":
            raise NotFoundError("内容", content_id)

        # 增加浏览计数
        self._contents.increment_view(content_id)

        result = dict(content)
        result["view_count"] = (result.get("view_count") or 0) + 1
        self._parse_tags(result)

        # 添加分类信息
        result["categories"] = self._content_categories.find_by_content(content_id)
        return result

    def search_contents(
        self,
        keyword: str,
        page: int = 1,
        page_size: int = 20,
    ) -> Dict:
        """搜索内容"""
        result = self._contents.search_contents(
            keyword=keyword, page=page, page_size=page_size
        )

        for item in result.get("items", []):
            self._parse_tags(item)

        return result

    def get_stats(self) -> Dict:
        """获取学习中心统计信息"""
        by_type = self._contents.get_stats()
        total_contents = sum(by_type.values())
        by_category = self._content_categories.count_by_category()

        return {
            "total_contents": total_contents,
            "by_content_type": by_type,
            "by_category": {
                str(item["category_id"]): item["cnt"] for item in by_category
            },
            "total_categories": self._categories.count_active(),
            "total_nodes": self._nodes.count_active(),
            "total_paths": self._paths.count_published(),
        }

    # ================================================================
    # 知识地图
    # ================================================================

    def get_knowledge_map(self) -> Dict:
        """获取知识地图（节点和边）"""
        nodes_data = self._nodes.find_active()
        edges_data = self._edges.find_all_edges()

        nodes = []
        for node in nodes_data:
            node_dict = dict(node)
            # 获取关联的内容
            node_dict["contents"] = self._node_contents.find_by_node(node["id"])
            nodes.append(node_dict)

        return {
            "nodes": nodes,
            "edges": [dict(e) for e in edges_data],
        }

    def create_node(
        self,
        admin: Tuple[str, str],
        title: str,
        description: str = "",
        icon: str = "📌",
        color: str = "#006633",
        category_id: Optional[int] = None,
    ) -> Dict:
        """创建知识节点"""
        if not title or not title.strip():
            raise ValidationError("节点标题不能为空", field="title")

        username, _ = admin
        node_data = {
            "title": title.strip(),
            "description": description.strip() if description else "",
            "icon": icon,
            "color": color,
            "category_id": category_id,
            "position_x": 0,
            "position_y": 0,
            "is_pinned": 0,
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._nodes.insert_get_id(node_data)
        logger.info("创建节点: %s (id=%s)", title, new_id)

        node_data["id"] = new_id
        return node_data

    def update_node(self, admin: Tuple[str, str], node_id: int, data: Dict) -> Dict:
        """更新节点"""
        node = self._nodes.find_by_id(node_id)
        if not node or node.get("is_deleted"):
            raise NotFoundError("节点", node_id)

        if "title" in data and not data["title"].strip():
            raise ValidationError("节点标题不能为空", field="title")

        update_fields = {}
        for key in ("title", "description", "icon", "color", "category_id"):
            if key in data:
                update_fields[key] = data[key]

        update_fields["updated_at"] = datetime.now()

        self._nodes.update(update_fields, "id = %s", (node_id,))
        logger.info("更新节点: %s", node_id)

        result = dict(node)
        result.update(update_fields)
        return result

    def delete_node(self, admin: Tuple[str, str], node_id: int) -> None:
        """软删除节点（关联边通过 CASCADE 自动处理）"""
        node = self._nodes.find_by_id(node_id)
        if not node or node.get("is_deleted"):
            raise NotFoundError("节点", node_id)

        self._nodes.soft_delete("id = %s", (node_id,))
        logger.info("删除节点: %s", node_id)

    def update_node_position(
        self, admin: Tuple[str, str], node_id: int, x: float, y: float
    ) -> Dict:
        """更新节点位置"""
        node = self._nodes.find_by_id(node_id)
        if not node or node.get("is_deleted"):
            raise NotFoundError("节点", node_id)

        self._nodes.update(
            {"position_x": x, "position_y": y, "updated_at": datetime.now()},
            "id = %s",
            (node_id,),
        )
        logger.info("更新节点位置: %s", node_id)

        result = dict(node)
        result["position_x"] = x
        result["position_y"] = y
        return result

    def create_edge(
        self,
        admin: Tuple[str, str],
        source_node_id: int,
        target_node_id: int,
        relation_type: str = "related",
        label: str = "",
        weight: float = 1.0,
    ) -> Dict:
        """创建知识边"""
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
        }

        new_id = self._edges.insert_get_id(edge_data)
        logger.info("创建边: %s -> %s (id=%s)", source_node_id, target_node_id, new_id)

        edge_data["id"] = new_id
        return edge_data

    def delete_edge(self, admin: Tuple[str, str], edge_id: int) -> None:
        """删除边（硬删除，因为边表没有 is_deleted 列）"""
        edge = self._edges.find_by_id(edge_id)
        if not edge:
            raise NotFoundError("边", edge_id)

        self._edges.delete("id = %s", (edge_id,))
        logger.info("删除边: %s", edge_id)

    def link_node_contents(
        self,
        admin: Tuple[str, str],
        node_id: int,
        content_ids: List[int],
    ) -> Dict:
        """关联内容到节点"""
        node = self._nodes.find_by_id(node_id)
        if not node or node.get("is_deleted"):
            raise NotFoundError("节点", node_id)

        self._node_contents.link(node_id, content_ids)
        logger.info("关联 %d 个内容到节点: %s", len(content_ids), node_id)

        return {"node_id": node_id, "content_ids": content_ids}

    # ================================================================
    # 知识图谱批量导入
    # ================================================================

    def batch_import_knowledge_graph(
        self,
        admin: Tuple[str, str],
        nodes: List[Dict],
        edges: List[Dict] = None,
        content_links: List[Dict] = None,
        source_pdf: Optional[str] = None,
        clear_existing: bool = False,
    ) -> Dict:
        """
        批量导入知识图谱（节点 + 边 + 内容关联）

        Args:
            admin: (username, role) 管理员身份
            nodes: 节点列表，每个需有临时 id, title, description, icon, color
            edges: 边列表，source/target 为节点临时 id
            content_links: 内容关联列表，node 为节点临时 id
            source_pdf: PDF 文件名，用于自动匹配 content_id
            clear_existing: 是否清空现有图谱

        Returns:
            导入统计 {created_nodes, created_edges, created_links, skipped_links}
        """
        edges = edges or []
        content_links = content_links or []
        username, _ = admin

        # ---------- Phase 0: 清空（如需要）----------
        if clear_existing:
            # 清空边和关联后再清空节点
            all_nodes = self._nodes.find_active()
            for node in all_nodes:
                self._node_contents.delete("node_id = %s", (node["id"],))
            self._edges.raw_execute("DELETE FROM lc_knowledge_edges", ())
            self._nodes.raw_execute(
                "UPDATE lc_knowledge_nodes SET is_deleted = 1", ()
            )
            logger.info("批量导入：已清空现有知识图谱")

        # ---------- Phase 1: 创建节点 ----------
        temp_id_to_db_id: Dict[str, int] = {}
        created_nodes = 0

        for node in nodes:
            temp_id = node["id"]
            node_data = {
                "title": node["title"].strip(),
                "description": (node.get("description") or "").strip(),
                "icon": node.get("icon", "📌"),
                "color": node.get("color", "#006633"),
                "category_id": node.get("category_id"),
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

        logger.info("批量导入：创建 %d 个节点", created_nodes)

        # ---------- Phase 2: 创建边 ----------
        created_edges = 0
        for edge in edges:
            source_db_id = temp_id_to_db_id.get(edge["source"])
            target_db_id = temp_id_to_db_id.get(edge["target"])
            if source_db_id is None or target_db_id is None:
                logger.warning(
                    "批量导入：边 %s -> %s 引用的节点不存在，跳过",
                    edge["source"],
                    edge["target"],
                )
                continue

            edge_data = {
                "source_node_id": source_db_id,
                "target_node_id": target_db_id,
                "relation_type": edge.get("relation_type", "related"),
                "label": edge.get("label", ""),
                "weight": edge.get("weight", 1.0),
            }
            try:
                self._edges.insert_get_id(edge_data)
                created_edges += 1
            except Exception as e:
                logger.warning("批量导入：创建边失败 %s -> %s: %s", edge["source"], edge["target"], e)

        logger.info("批量导入：创建 %d 条边", created_edges)

        # ---------- Phase 3: 自动匹配 content_id ----------
        matched_content_id = None
        if source_pdf:
            # 在 lc_contents 中搜索文件名包含 source_pdf 的记录
            rows = self._contents.raw_query(
                "SELECT id, file_name, title FROM lc_contents WHERE is_deleted = 0 AND status = 'published'",
            )
            for row in rows:
                fname = row.get("file_name") or ""
                title = row.get("title") or ""
                # 匹配文件名或标题包含 source_pdf（去掉扩展名）
                pdf_stem = source_pdf.rsplit(".", 1)[0] if "." in source_pdf else source_pdf
                if source_pdf in fname or pdf_stem in fname or pdf_stem in title:
                    matched_content_id = row["id"]
                    logger.info(
                        "批量导入：匹配到 content_id=%d (file_name=%s)",
                        matched_content_id,
                        fname,
                    )
                    break

        # ---------- Phase 4: 创建内容关联 ----------
        created_links = 0
        skipped_links = 0
        for link in content_links:
            node_db_id = temp_id_to_db_id.get(link["node"])
            if node_db_id is None:
                logger.warning("批量导入：content_link 引用的节点 %s 不存在，跳过", link["node"])
                skipped_links += 1
                continue

            content_id = link.get("content_id") or matched_content_id
            if content_id is None:
                logger.warning("批量导入：无法确定 content_id，跳过节点 %s", link["node"])
                skipped_links += 1
                continue

            anchor = link.get("anchor")
            affected = self._node_contents.link_with_anchor(
                node_id=node_db_id,
                content_id=content_id,
                anchor=anchor,
                sort_order=0,
            )
            if affected > 0:
                created_links += 1
            else:
                skipped_links += 1

        logger.info(
            "批量导入：创建 %d 个内容关联，跳过 %d 个",
            created_links,
            skipped_links,
        )

        return {
            "created_nodes": created_nodes,
            "created_edges": created_edges,
            "created_links": created_links,
            "skipped_links": skipped_links,
        }

    # ================================================================
    # 学习路径
    # ================================================================

    def get_paths(self) -> List[Dict]:
        """获取所有已发布路径"""
        paths = self._paths.find_published()
        result = []
        for path in paths:
            path_dict = dict(path)
            self._parse_tags(path_dict)
            path_dict["steps"] = self._steps.find_by_path(path["id"])
            result.append(path_dict)
        return result

    def get_path_detail(self, path_id: int) -> Dict:
        """获取路径详情"""
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)

        result = dict(path)
        self._parse_tags(result)
        result["steps"] = self._steps.find_by_path(path_id)
        return result

    def create_path(
        self,
        admin: Tuple[str, str],
        title: str,
        description: str = "",
        icon: str = "🎯",
        difficulty: str = "beginner",
        estimated_hours: float = 1.0,
        tags: Optional[List[str]] = None,
    ) -> Dict:
        """创建学习路径"""
        if not title or not title.strip():
            raise ValidationError("路径标题不能为空", field="title")

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
            "status": "published",
            "created_by": username,
            "created_at": datetime.now(),
            "updated_at": datetime.now(),
            "is_deleted": 0,
        }

        new_id = self._paths.insert_get_id(path_data)
        logger.info("创建路径: %s (id=%s)", title, new_id)

        path_data["id"] = new_id
        path_data["tags"] = tags or []
        path_data["steps"] = []
        return path_data

    def update_path(self, admin: Tuple[str, str], path_id: int, data: Dict) -> Dict:
        """更新学习路径"""
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)

        if "title" in data and not data["title"].strip():
            raise ValidationError("路径标题不能为空", field="title")

        if "difficulty" in data and data["difficulty"] not in VALID_DIFFICULTIES:
            raise ValidationError(
                f"难度必须是: {', '.join(VALID_DIFFICULTIES)}",
                field="difficulty",
            )

        update_fields = {}
        for key in ("title", "description", "icon", "difficulty", "estimated_hours"):
            if key in data:
                update_fields[key] = data[key]

        if "tags" in data:
            update_fields["tags"] = json.dumps(data["tags"]) if data["tags"] else None

        update_fields["updated_at"] = datetime.now()

        self._paths.update(update_fields, "id = %s", (path_id,))
        logger.info("更新路径: %s", path_id)

        result = dict(path)
        result.update(update_fields)
        self._parse_tags(result)
        result["steps"] = self._steps.find_by_path(path_id)
        return result

    def delete_path(self, admin: Tuple[str, str], path_id: int) -> None:
        """软删除路径"""
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)

        self._paths.soft_delete("id = %s", (path_id,))
        logger.info("删除路径: %s", path_id)

    def update_path_steps(
        self,
        admin: Tuple[str, str],
        path_id: int,
        steps: List[Dict],
    ) -> List[Dict]:
        """更新路径步骤"""
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)

        self._steps.replace_steps(path_id, steps)

        result_steps = self._steps.find_by_path(path_id)
        logger.info("更新路径步骤: %s (%d 步)", path_id, len(steps))
        return result_steps

    def publish_path(self, admin: Tuple[str, str], path_id: int) -> Dict:
        """发布学习路径"""
        path = self._paths.find_by_id(path_id)
        if not path or path.get("is_deleted"):
            raise NotFoundError("学习路径", path_id)

        update_data = {"status": "published", "updated_at": datetime.now()}
        self._paths.update(update_data, "id = %s", (path_id,))
        logger.info("发布路径: %s", path_id)

        result = dict(path)
        result.update(update_data)
        self._parse_tags(result)
        result["steps"] = self._steps.find_by_path(path_id)
        return result

    # ================================================================
    # AI 助手
    # ================================================================

    def _build_kg_node_hint(self) -> str:
        """构建知识图谱节点提示，供 system prompt 注入。"""
        nodes = self._nodes.find_active()
        if not nodes:
            return ""
        lines = [f"- [{n['id']}] {n['title']}" for n in nodes]
        return (
            "以下是知识图谱中的知识点列表（供参考，回答时可提及相关知识点名称）：\n"
            + "\n".join(lines)
        )

    def _match_knowledge_nodes(self, answer_text: str, max_results: int = 5) -> list:
        """从 AI 回答中匹配相关知识图谱节点（基于标题子串匹配）。"""
        nodes = self._nodes.find_active()
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

        # 按标题长度降序（更具体的优先），截取前 max_results 个
        matched.sort(key=lambda x: len(x["title"]), reverse=True)
        return matched[:max_results]

    async def ai_ask(
        self,
        username: str,
        question: str,
        content_id: Optional[int] = None,
        context_filter: Optional[str] = None,
    ) -> Dict:
        """
        AI 问答（支持内容感知模式）。

        当 content_id 不为 None 时，走内容感知 RAG 流程；
        否则走原有通用问答流程，保持向后兼容。
        """
        if content_id is not None:
            return await self._ai_ask_with_content(
                username, question, content_id
            )

        if not self._ask_ai_func:
            return {
                "question": question,
                "answer": "AI 助手服务尚未配置，请联系管理员。",
                "context_sources": [],
            }

        try:
            import asyncio
            loop = asyncio.get_running_loop()

            # _ask_ai_func 是 ask_ai_subject(question, subject_code)，返回 (answer, thinking) 元组
            raw = await loop.run_in_executor(
                None, self._ask_ai_func, question, context_filter or ""
            )

            # 兼容：如果返回 dict 直接使用，否则从 tuple 构建
            if isinstance(raw, dict):
                result = raw
            else:
                answer, thinking = raw
                result = {
                    "question": question,
                    "answer": answer or "",
                    "thinking": thinking or "",
                    "context_sources": [],
                }

            logger.info("AI 回答成功: 用户=%s", username)
            # 匹配知识图谱相关节点
            result["related_nodes"] = self._match_knowledge_nodes(
                result.get("answer", "")
            )
            return result
        except Exception as e:
            logger.error("AI 回答失败: %s", e)
            return {
                "question": question,
                "answer": "AI 助手暂时无法回答，请稍后再试。",
                "context_sources": [],
                "related_nodes": [],
            }

    async def _ai_ask_with_content(
        self,
        username: str,
        question: str,
        content_id: int,
    ) -> Dict:
        """
        基于特定学习内容的 AI 问答（支持 PDF 页码引用）。

        流程：
        1. 查询内容元数据
        2. 懒索引（若未索引则即时建立）
        3. 内容级 RAG 检索（带页码信息）
        4. 构建 prompt → 调用 LLM → 解析响应
        5. 返回 answer + page_references
        """
        import asyncio
        from functools import partial

        from llm.rag.content_indexer import get_content_indexer
        from llm.rag.retrieval import get_context_for_content_with_pages
        from llm.rag.context import build_prompt_context
        from llm.prompts.templates import apply_thinking_mode
        from llm.providers.ollama import get_ollama_provider
        from llm.parsers.thinking_parser import parse_llm_response

        # 1. 获取内容元数据
        content = self._contents.find_by_id(content_id)
        if not content:
            return {
                "question": question,
                "answer": "找不到对应的学习内容。",
                "context_sources": [],
            }

        content_title = content.get("title", "")
        content_type = content.get("content_type", "")
        is_pdf = content_type == "document" and (
            (content.get("file_name") or "").lower().endswith(".pdf")
            or (content.get("mime_type") or "") == "application/pdf"
        )
        loop = asyncio.get_running_loop()

        # 2. 懒索引（含旧索引升级：缺少 page_numbers 时重建）
        indexer = get_content_indexer()
        indexed = await loop.run_in_executor(
            None, indexer.is_indexed, content_id
        )

        if not indexed:
            logger.info("懒索引触发: content_id=%s", content_id)
            await loop.run_in_executor(
                None, partial(indexer.index, content_id, dict(content))
            )
        elif is_pdf:
            # 旧索引可能缺少 page_numbers metadata，需要重建
            has_pages = await loop.run_in_executor(
                None, indexer.has_page_metadata, content_id
            )
            if not has_pages:
                logger.info("旧索引缺少页码，重建: content_id=%s", content_id)
                await loop.run_in_executor(
                    None, indexer.delete, content_id
                )
                await loop.run_in_executor(
                    None, partial(indexer.index, content_id, dict(content))
                )

        # 3. 内容级 RAG 检索（带页码）
        rag_context, page_refs = await loop.run_in_executor(
            None,
            partial(get_context_for_content_with_pages, question, content_id),
        )

        # 4. 构建 prompt 并调用 LLM
        has_pages = is_pdf and len(page_refs) > 0

        if has_pages:
            system_prompt = (
                f"你是 AI 学习助教。学生正在阅读「{content_title}」。\n"
                f"请基于以下检索到的内容片段，详细且完整地回答学生的问题。\n"
                f"每个片段标题已标注了对应的 PDF 页码。\n"
                f"回答时在首次引用某页内容时标注页码，格式为【第X页】。\n"
                f"请提供有条理的详细回答（步骤、要点、注意事项等）。\n"
                f"如果片段不足以回答，可结合通用知识，但请注明。"
            )
        else:
            system_prompt = (
                f"你是 AI 学习助教。学生正在阅读「{content_title}」。\n"
                f"请基于以下检索到的内容片段回答学生的问题。\n"
                f"如果片段不足以回答，可结合通用知识，但请注明。"
            )

        # 注入知识图谱节点提示
        kg_hint = self._build_kg_node_hint()
        if kg_hint:
            system_prompt += f"\n\n{kg_hint}"

        prompt = build_prompt_context(
            question=question,
            system_prompt=system_prompt,
            kb_context=rag_context,
        )

        thinking_prompt = apply_thinking_mode(prompt, task_type="qa")

        provider = get_ollama_provider()
        raw_response = await loop.run_in_executor(
            None, provider.invoke, thinking_prompt
        )

        answer, thinking = parse_llm_response(raw_response)

        logger.info(
            "内容感知 AI 回答: 用户=%s, content_id=%s, page_refs=%d",
            username,
            content_id,
            len(page_refs),
        )

        # 匹配知识图谱相关节点
        related_nodes = self._match_knowledge_nodes(answer)

        return {
            "question": question,
            "answer": answer,
            "thinking": thinking,
            "content_id": content_id,
            "content_title": content_title,
            "context_sources": [],
            "page_references": page_refs if has_pages else [],
            "related_nodes": related_nodes,
        }

    async def ai_ask_stream(
        self,
        username: str,
        question: str,
        content_id: Optional[int] = None,
    ) -> AsyncGenerator[str, None]:
        """
        AI 问答的流式版本 — 逐 token yield answer 文本。

        仅当有 content_id 时走内容感知 RAG + 流式输出；
        无 content_id 时回退到一次性返回完整回答。
        """
        if content_id is None:
            result = await self.ai_ask(username, question)
            yield result.get("answer", "")
            return

        import asyncio
        from functools import partial

        from llm.rag.content_indexer import get_content_indexer
        from llm.rag.retrieval import get_context_for_content
        from llm.rag.context import build_prompt_context
        from llm.prompts.templates import apply_thinking_mode
        from llm.providers.ollama import get_ollama_provider
        from llm.parsers.thinking_parser import StreamingThinkingParser

        # 1. 内容元数据
        content = self._contents.find_by_id(content_id)
        if not content:
            yield "找不到对应的学习内容。"
            return

        content_title = content.get("title", "")
        loop = asyncio.get_running_loop()

        # 2. 懒索引
        indexer = get_content_indexer()
        indexed = await loop.run_in_executor(None, indexer.is_indexed, content_id)
        if not indexed:
            logger.info("流式懒索引触发: content_id=%s", content_id)
            await loop.run_in_executor(
                None, partial(indexer.index, content_id, dict(content))
            )

        # 3. RAG 检索
        rag_context = await loop.run_in_executor(
            None, partial(get_context_for_content, question, content_id),
        )

        # 4. 构建 prompt
        system_prompt = (
            f"你是 AI 学习助教。学生正在阅读「{content_title}」。\n"
            f"请基于以下检索到的内容片段回答学生的问题。\n"
            f"如果片段不足以回答，可结合通用知识，但请注明。"
        )
        prompt = build_prompt_context(
            question=question,
            system_prompt=system_prompt,
            kb_context=rag_context,
        )
        thinking_prompt = apply_thinking_mode(prompt, task_type="qa")

        # 5. 流式调用 LLM，过滤 thinking 只输出 answer
        provider = get_ollama_provider()
        parser = StreamingThinkingParser()

        async for token in provider.async_stream(thinking_prompt):
            events = parser.feed(token)
            for evt in events:
                if evt.type == "answer" and evt.content:
                    yield evt.content

        for evt in parser.finish():
            if evt.type == "answer" and evt.content:
                yield evt.content

        logger.info(
            "流式内容感知回答完成: 用户=%s, content_id=%s",
            username, content_id,
        )

    # ================================================================
    # 私有方法
    # ================================================================

    @staticmethod
    def _parse_tags(item: Dict) -> None:
        """解析 JSON tags 字段为列表"""
        tags_val = item.get("tags")
        if isinstance(tags_val, str):
            try:
                item["tags"] = json.loads(tags_val)
            except (json.JSONDecodeError, TypeError):
                item["tags"] = []
        elif tags_val is None:
            item["tags"] = []
