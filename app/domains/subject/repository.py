#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
学科 Repository

封装所有学科管理相关的数据库操作，
替代 subject_manager.py 中的数据库操作。
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class SubjectRepository(BaseRepository):
    """学科数据 Repository"""

    TABLE = "subjects"

    # ============================================================
    # 查询
    # ============================================================

    def get_subject(self, subject_code: str) -> Optional[Dict[str, Any]]:
        """根据学科代码查询"""
        return self.find_one("subject_code = %s", (subject_code,))

    def get_subject_config(self, subject_code: str) -> Optional[Dict[str, Any]]:
        """获取学科配置 (解析 JSON)"""
        row = self.find_one(
            "subject_code = %s",
            (subject_code,),
            columns="config",
        )
        if row and row.get("config"):
            try:
                return json.loads(row["config"]) if isinstance(row["config"], str) else row["config"]
            except (json.JSONDecodeError, TypeError):
                pass
        return None

    def list_subjects(self) -> List[Dict[str, Any]]:
        """获取所有学科"""
        return self.find_all(order_by="subject_code ASC")

    def subject_exists(self, subject_code: str) -> bool:
        """检查学科是否存在"""
        return self.exists("subject_code = %s", (subject_code,))

    def get_statistics(self) -> Dict[str, Any]:
        """获取学科统计信息"""
        rows = self.raw_query(
            "SELECT subject_code, subject_name, config FROM subjects ORDER BY subject_code"
        )
        stats = {
            "total_subjects": len(rows),
            "subjects": [],
        }
        for row in rows:
            config = {}
            if row.get("config"):
                try:
                    config = json.loads(row["config"]) if isinstance(row["config"], str) else row["config"]
                except (json.JSONDecodeError, TypeError):
                    pass
            stats["subjects"].append({
                "code": row["subject_code"],
                "name": row.get("subject_name", ""),
                "doc_count": config.get("doc_count", 0),
            })
        return stats

    # ============================================================
    # 写入
    # ============================================================

    def save_subject(
        self,
        subject_code: str,
        subject_name: str,
        config: Dict[str, Any],
    ) -> int:
        """创建或更新学科 (upsert)"""
        config_str = json.dumps(config, ensure_ascii=False)
        return self.raw_execute(
            "INSERT INTO subjects (subject_code, subject_name, config, created_at) "
            "VALUES (%s, %s, %s, %s) "
            "ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name), "
            "config = VALUES(config), updated_at = CURRENT_TIMESTAMP",
            (subject_code, subject_name, config_str, datetime.now()),
        )

    def update_subject_config(
        self,
        subject_code: str,
        subject_name: str,
        config: Dict[str, Any],
    ) -> int:
        """更新学科配置"""
        config_str = json.dumps(config, ensure_ascii=False)
        return self.raw_execute(
            "UPDATE subjects SET subject_name = %s, config = %s, "
            "updated_at = CURRENT_TIMESTAMP WHERE subject_code = %s",
            (subject_name, config_str, subject_code),
        )

    def delete_subject(self, subject_code: str) -> int:
        """删除学科"""
        return self.delete("subject_code = %s", (subject_code,))

    def batch_save_subjects(self, subjects: List[Dict[str, Any]]) -> int:
        """批量保存学科"""
        count = 0
        for s in subjects:
            count += self.save_subject(
                s["subject_code"],
                s["subject_name"],
                s.get("config", {}),
            )
        return count
