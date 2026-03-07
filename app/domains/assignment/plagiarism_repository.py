#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抄襲檢測 Repository
====================
數據訪問層，包含 2 個 Repository:
1. PlagiarismReportRepository - 檢測報告主表
2. PlagiarismPairRepository   - 相似配對明細表
"""

import json
import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

import numpy as np


class _NumpyEncoder(json.JSONEncoder):
    """Handle numpy types for JSON serialization."""
    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return super().default(obj)

from app.infrastructure.database.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class PlagiarismReportRepository(BaseRepository):
    """抄襲檢測報告 Repository"""

    TABLE = "plagiarism_reports"

    def find_latest_by_assignment(self, assignment_id: int) -> Optional[Dict[str, Any]]:
        """取得某作業最新的檢測報告"""
        rows = self.find_all(
            where="assignment_id = %s",
            params=(assignment_id,),
            order_by="id DESC",
            limit=1,
        )
        return rows[0] if rows else None

    def find_all_by_assignment(self, assignment_id: int) -> List[Dict[str, Any]]:
        """取得某作業的所有檢測報告（按時間倒序）"""
        return self.find_all(
            where="assignment_id = %s",
            params=(assignment_id,),
            order_by="created_at DESC",
        )

    def update_status(
        self,
        report_id: int,
        status: str,
        total_pairs: int = 0,
        flagged_pairs: int = 0,
        error_message: str = "",
    ) -> int:
        """更新報告狀態"""
        data: Dict[str, Any] = {"status": status}
        if total_pairs:
            data["total_pairs"] = total_pairs
        if flagged_pairs:
            data["flagged_pairs"] = flagged_pairs
        if error_message:
            data["error_message"] = error_message
        if status in ("completed", "failed"):
            data["completed_at"] = datetime.now()
        return self.update(data, where="id = %s", params=(report_id,))


class PlagiarismPairRepository(BaseRepository):
    """抄襲配對明細 Repository"""

    TABLE = "plagiarism_pairs"

    def batch_insert(self, pairs: List[Dict[str, Any]]) -> int:
        """批量插入配對結果"""
        if not pairs:
            return 0
        count = 0
        for pair in pairs:
            # 確保 matched_fragments 序列化為 JSON 字符串
            if "matched_fragments" in pair and not isinstance(pair["matched_fragments"], str):
                pair["matched_fragments"] = json.dumps(
                    pair["matched_fragments"], ensure_ascii=False, cls=_NumpyEncoder
                )
            self.insert(pair)
            count += 1
        return count

    def find_by_report(
        self,
        report_id: int,
        flagged_only: bool = False,
    ) -> List[Dict[str, Any]]:
        """取得報告的所有配對（按相似度倒序）"""
        conditions = ["report_id = %s"]
        params: list = [report_id]
        if flagged_only:
            conditions.append("is_flagged = 1")
        rows = self.find_all(
            where=" AND ".join(conditions),
            params=tuple(params),
            order_by="similarity_score DESC",
        )
        # 反序列化 matched_fragments
        for row in rows:
            if row.get("matched_fragments") and isinstance(row["matched_fragments"], str):
                try:
                    row["matched_fragments"] = json.loads(row["matched_fragments"])
                except (json.JSONDecodeError, TypeError):
                    pass
        return rows

    def find_pair_detail(self, pair_id: int) -> Optional[Dict[str, Any]]:
        """取得單個配對詳情"""
        row = self.find_by_id(pair_id)
        if row and row.get("matched_fragments") and isinstance(row["matched_fragments"], str):
            try:
                row["matched_fragments"] = json.loads(row["matched_fragments"])
            except (json.JSONDecodeError, TypeError):
                pass
        return row

    def delete_by_report(self, report_id: int) -> int:
        """刪除報告關聯的所有配對"""
        return self.delete(where="report_id = %s", params=(report_id,))
