"""
学科服务层 - SubjectService
============================
负责所有学科管理业务逻辑：
- 学科 CRUD
- 知识库文档管理（上传/删除/重建）
- 向量存储管理（ChromaDB 集成）
- 系统提示词管理
"""

import logging
import os
import shutil
import uuid
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    ConflictError,
    NotFoundError,
    ValidationError,
)
from app.domains.subject.repository import SubjectRepository

logger = logging.getLogger(__name__)

# 支持的文档格式
SUPPORTED_FORMATS = {".pdf", ".docx", ".txt", ".md"}
# 文档大小上限（字节）
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
# 知识库根目录名
KNOWLEDGE_BASE_DIR = "knowledge_base"
# 回收站目录名
TRASH_DIR = ".trash"


class SubjectService:
    """
    学科管理服务

    职责:
    1. 学科 CRUD（创建、查询、更新、删除）
    2. 知识库文档管理（上传、列表、删除、重建）
    3. 向量存储交互（文档嵌入、相似度搜索）
    4. 系统提示词管理（每个学科的 AI 行为配置）
    """

    def __init__(
        self,
        subject_repo: Optional[SubjectRepository] = None,
        settings: Optional[Settings] = None,
    ):
        self._repo = subject_repo or SubjectRepository()
        self._settings = settings or get_settings()

        # 外部依赖 - 延迟注入
        self._file_processor = None  # file_processor.process_file
        self._add_to_vector_store = None  # vector_store.add_document
        self._search_vector_store = None  # vector_store.search_documents
        self._get_vector_docs = None  # vector_store.get_documents_by_subject

    def set_external_functions(
        self,
        file_processor=None,
        add_to_vector_store: Callable = None,
        search_vector_store: Callable = None,
        get_vector_docs: Callable = None,
    ):
        """注入外部函数（避免循环导入）"""
        if file_processor:
            self._file_processor = file_processor
        if add_to_vector_store:
            self._add_to_vector_store = add_to_vector_store
        if search_vector_store:
            self._search_vector_store = search_vector_store
        if get_vector_docs:
            self._get_vector_docs = get_vector_docs

    # ================================================================== #
    #  学科 CRUD                                                           #
    # ================================================================== #

    def list_subjects(self, detailed: bool = False) -> List[Dict[str, Any]]:
        """
        获取学科列表

        Args:
            detailed: True 返回完整配置（管理员视图）
        """
        subjects = self._repo.list_subjects()
        result = []
        for s in subjects:
            # 解析 config JSON
            config = s.get("config", {})
            if isinstance(config, str):
                try:
                    import json
                    config = json.loads(config)
                except (json.JSONDecodeError, TypeError):
                    config = {}
            if not isinstance(config, dict):
                config = {}

            icon = config.get("icon", "📚")
            description = config.get("description", "")

            if not detailed:
                result.append({
                    "subject_code": s.get("subject_code"),
                    "subject_name": s.get("subject_name"),
                    "icon": icon,
                    "description": description,
                })
            else:
                result.append({
                    "subject_code": s.get("subject_code"),
                    "subject_name": s.get("subject_name"),
                    "icon": icon,
                    "config": config,
                })
        return result

    def get_subject(self, subject_code: str) -> Dict[str, Any]:
        """
        获取学科详情

        Raises:
            NotFoundError: 学科不存在
        """
        subject = self._repo.get_subject_config(subject_code)
        if not subject:
            raise NotFoundError("学科", subject_code)
        return subject

    def create_subject(
        self,
        subject_code: str,
        subject_name: str,
        icon: str = "📚",
        description: str = "",
        system_prompt: str = "",
    ) -> Dict[str, Any]:
        """
        创建新学科

        Raises:
            ConflictError: 学科代码已存在
        """
        if self._repo.subject_exists(subject_code):
            raise ConflictError("学科", subject_code)

        config = {
            "icon": icon,
            "description": description,
            "system_prompt": system_prompt,
            "doc_count": 0,
        }
        self._repo.save_subject(subject_code, subject_name, config)

        # 创建知识库目录
        kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, subject_code)
        os.makedirs(kb_dir, exist_ok=True)

        logger.info("学科创建成功: %s (%s)", subject_code, subject_name)
        return self.get_subject(subject_code)

    def update_subject(
        self,
        subject_code: str,
        subject_name: str = None,
        icon: str = None,
        description: str = None,
    ) -> Dict[str, Any]:
        """
        更新学科信息

        Raises:
            NotFoundError: 学科不存在
        """
        existing = self._repo.get_subject_config(subject_code)
        if not existing:
            raise NotFoundError("学科", subject_code)

        config = existing.get("config", {}) if isinstance(existing.get("config"), dict) else {}
        if icon is not None:
            config["icon"] = icon
        if description is not None:
            config["description"] = description

        name = subject_name or existing.get("subject_name", subject_code)
        self._repo.update_subject_config(subject_code, name, config)

        return self.get_subject(subject_code)

    def delete_subject(self, subject_code: str) -> bool:
        """
        删除学科

        Raises:
            NotFoundError: 学科不存在
            ValidationError: 学科下仍有文档
        """
        subject = self._repo.get_subject_config(subject_code)
        if not subject:
            raise NotFoundError("学科", subject_code)

        # 检查是否有文档
        kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, subject_code)
        if os.path.exists(kb_dir):
            files = [f for f in os.listdir(kb_dir) if not f.startswith(".")]
            if files:
                raise ValidationError(
                    f"学科 '{subject_code}' 下仍有 {len(files)} 个文档，"
                    "请先删除所有文档"
                )

        self._repo.delete_subject(subject_code)
        logger.info("学科已删除: %s", subject_code)
        return True

    # ================================================================== #
    #  系统提示词管理                                                       #
    # ================================================================== #

    def get_system_prompt(self, subject_code: str) -> str:
        """获取学科系统提示词"""
        subject = self._repo.get_subject_config(subject_code)
        if not subject:
            raise NotFoundError("学科", subject_code)

        config = subject.get("config", {})
        if isinstance(config, dict):
            return config.get("system_prompt", "")
        return ""

    def update_system_prompt(
        self,
        subject_code: str,
        system_prompt: str,
    ) -> bool:
        """更新学科系统提示词"""
        subject = self._repo.get_subject_config(subject_code)
        if not subject:
            raise NotFoundError("学科", subject_code)

        config = subject.get("config", {})
        if not isinstance(config, dict):
            config = {}
        config["system_prompt"] = system_prompt

        self._repo.update_subject_config(
            subject_code,
            subject.get("subject_name", subject_code),
            config,
        )
        logger.info("学科提示词已更新: %s", subject_code)
        return True

    # ================================================================== #
    #  知识库文档管理                                                       #
    # ================================================================== #

    def upload_document(
        self,
        subject_code: str,
        filename: str,
        file_content: bytes,
        uploaded_by: str = "system",
    ) -> Dict[str, Any]:
        """
        上传文档到知识库

        Args:
            subject_code: 学科代码
            filename: 文件名
            file_content: 文件二进制内容
            uploaded_by: 上传者

        Returns:
            dict: {filename, subject, file_size, document_count}

        Raises:
            ValidationError: 格式不支持或文件过大
            NotFoundError: 学科不存在
        """
        # 验证学科
        if not self._repo.subject_exists(subject_code):
            raise NotFoundError("学科", subject_code)

        # 验证文件
        ext = os.path.splitext(filename)[1].lower()
        if ext not in SUPPORTED_FORMATS:
            raise ValidationError(
                f"不支持的文件格式 '{ext}'，"
                f"支持: {', '.join(SUPPORTED_FORMATS)}"
            )

        if len(file_content) > MAX_FILE_SIZE:
            raise ValidationError(
                f"文件过大 ({len(file_content) / 1024 / 1024:.1f}MB)，"
                f"上限为 {MAX_FILE_SIZE / 1024 / 1024:.0f}MB"
            )

        # 保存文件
        kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, subject_code)
        os.makedirs(kb_dir, exist_ok=True)
        file_path = os.path.join(kb_dir, filename)

        with open(file_path, "wb") as f:
            f.write(file_content)

        # 处理文档 + 添加到向量存储
        doc_count = 0
        if self._file_processor and self._add_to_vector_store:
            try:
                result = self._file_processor.process_file(
                    file_path, filename, uploaded_by,
                )
                if result and result.get("content"):
                    self._add_to_vector_store(
                        content=result["content"],
                        subject=subject_code,
                        metadata={
                            "filename": filename,
                            "uploaded_by": uploaded_by,
                            "upload_time": datetime.now().isoformat(),
                        },
                    )
                    doc_count = 1
            except Exception as e:
                logger.error("文档处理失败: %s - %s", filename, e)

        logger.info(
            "文档上传: %s → %s (by=%s)",
            filename, subject_code, uploaded_by,
        )

        return {
            "filename": filename,
            "subject": subject_code,
            "file_size": len(file_content),
            "document_count": doc_count,
        }

    def list_documents(self, subject_code: str) -> List[Dict[str, Any]]:
        """列出学科下的所有文档"""
        kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, subject_code)
        if not os.path.exists(kb_dir):
            return []

        documents = []
        for filename in sorted(os.listdir(kb_dir)):
            if filename.startswith("."):
                continue
            filepath = os.path.join(kb_dir, filename)
            stat = os.stat(filepath)
            documents.append({
                "filename": filename,
                "file_size": stat.st_size,
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            })
        return documents

    def delete_document(
        self,
        subject_code: str,
        filename: str,
    ) -> bool:
        """
        删除文档（移到回收站）

        Raises:
            NotFoundError: 文档不存在
        """
        kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, subject_code)
        file_path = os.path.join(kb_dir, filename)

        if not os.path.exists(file_path):
            raise NotFoundError("文档", filename)

        # 移到回收站
        trash = os.path.join(TRASH_DIR, subject_code)
        os.makedirs(trash, exist_ok=True)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        trash_name = f"{timestamp}_{filename}"
        shutil.move(file_path, os.path.join(trash, trash_name))

        logger.info("文档已删除: %s/%s → trash", subject_code, filename)
        return True

    def search_knowledge(
        self,
        subject_code: str,
        query: str,
        limit: int = 5,
    ) -> List[Dict[str, Any]]:
        """
        在学科知识库中搜索

        Returns:
            list: [{content, metadata, score}]
        """
        if not self._search_vector_store:
            raise ValidationError("向量搜索服务未初始化")

        return self._search_vector_store(query, subject_code, k=limit)

    def get_statistics(self) -> Dict[str, Any]:
        """获取知识库统计"""
        repo_stats = self._repo.get_statistics()

        # 计算文件系统级别的统计
        total_docs = 0
        total_size = 0
        subjects_with_docs = 0

        subjects = repo_stats.get("subjects", [])
        for subj in subjects:
            code = subj.get("code", "")
            kb_dir = os.path.join(KNOWLEDGE_BASE_DIR, code)
            if os.path.exists(kb_dir):
                files = [f for f in os.listdir(kb_dir) if not f.startswith(".")]
                if files:
                    subjects_with_docs += 1
                total_docs += len(files)
                for f in files:
                    try:
                        total_size += os.path.getsize(os.path.join(kb_dir, f))
                    except OSError:
                        pass

        total_size_mb = f"{total_size / (1024 * 1024):.1f}"

        return {
            **repo_stats,
            "total_docs": total_docs,
            "total_documents": total_docs,
            "total_size_mb": total_size_mb,
            "subjects_with_docs": subjects_with_docs,
        }
