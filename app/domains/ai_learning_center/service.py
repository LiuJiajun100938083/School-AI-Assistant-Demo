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
from typing import Any, Callable, Dict, List, Optional, Tuple

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
            "status": "draft",
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

    async def ai_ask(
        self,
        username: str,
        question: str,
        context_filter: Optional[str] = None,
    ) -> Dict:
        """AI 问答"""
        if not self._ask_ai_func:
            return {
                "question": question,
                "answer": "AI 助手服务尚未配置，请联系管理员。",
                "context_sources": [],
            }

        try:
            result = await self._ask_ai_func(question, context_filter)
            logger.info("AI 回答成功: 用户=%s", username)
            return result
        except Exception as e:
            logger.error("AI 回答失败: %s", e)
            return {
                "question": question,
                "answer": f"AI 助手暂时无法回答，请稍后再试。",
                "context_sources": [],
            }

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
