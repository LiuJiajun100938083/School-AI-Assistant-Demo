#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LLM API 使用量 — Service 層

封裝 token 使用量記錄、統計、費用估算等業務邏輯。
"""

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.domains.llm_usage.repository import LlmUsageRepository

logger = logging.getLogger(__name__)

# DeepSeek 定價（參考值，可通過配置調整）
# deepseek-reasoner: input $0.55/1M tokens, output $2.19/1M tokens
PRICING = {
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
    "deepseek-chat": {"input": 0.27, "output": 1.10},
}
DEFAULT_PRICING = {"input": 0.55, "output": 2.19}


class LlmUsageService:
    """LLM API 使用量業務服務"""

    def __init__(self, repo: LlmUsageRepository):
        self._repo = repo

    # ============================================================
    # 初始化
    # ============================================================

    def init_system(self) -> None:
        """初始化系統（建表）"""
        try:
            self._repo.init_table()
            logger.info("LLM API 使用量系統初始化完成")
        except Exception as e:
            logger.error("LLM API 使用量系統初始化失敗: %s", e)
            raise

    # ============================================================
    # 記錄
    # ============================================================

    def record(
        self,
        user_id: Optional[int],
        provider: str,
        model: str,
        purpose: str,
        prompt_tokens: int = 0,
        completion_tokens: int = 0,
        total_tokens: int = 0,
        duration_ms: Optional[int] = None,
        status: str = "ok",
    ) -> int:
        """同步記錄一條 usage（在 run_in_executor 中調用）"""
        data = {
            "user_id": user_id,
            "provider": provider,
            "model": model,
            "purpose": purpose,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "duration_ms": duration_ms,
            "status": status,
        }
        record_id = self._repo.record_usage(data)
        logger.debug(
            "LLM usage 已記錄: id=%d, provider=%s, model=%s, purpose=%s, tokens=%d",
            record_id, provider, model, purpose, total_tokens,
        )
        return record_id

    async def record_async(
        self,
        user_id: Optional[int],
        provider: str,
        model: str,
        purpose: str,
        usage_dict: Dict[str, Any],
        duration_ms: Optional[int] = None,
        status: str = "ok",
    ) -> None:
        """異步記錄 usage（非阻塞，Service 層調用）"""
        try:
            loop = asyncio.get_event_loop()
            await loop.run_in_executor(
                None,
                lambda: self.record(
                    user_id=user_id,
                    provider=provider,
                    model=model,
                    purpose=purpose,
                    prompt_tokens=usage_dict.get("prompt_tokens", 0),
                    completion_tokens=usage_dict.get("completion_tokens", 0),
                    total_tokens=usage_dict.get("total_tokens", 0),
                    duration_ms=duration_ms,
                    status=status,
                ),
            )
        except Exception as e:
            logger.warning("異步記錄 LLM usage 失敗: %s", e)

    # ============================================================
    # 查詢
    # ============================================================

    def get_summary(self) -> Dict[str, Any]:
        """今日統計 + 預估費用"""
        logger.info("get_summary called")
        stats = self._repo.get_today_summary()
        logger.info("stats raw: %s, types: %s", stats, {k: type(v).__name__ for k, v in stats.items()})
        by_purpose = self._repo.get_usage_by_purpose()
        # MySQL SUM 返回 Decimal，轉為 int
        for row in by_purpose:
            for key in ("total_tokens", "call_count"):
                if key in row and row[key] is not None:
                    row[key] = int(row[key])

        prompt_tokens = int(stats.get("prompt_tokens", 0) or 0)
        completion_tokens = int(stats.get("completion_tokens", 0) or 0)
        total_tokens = int(stats.get("total_tokens", 0) or 0)
        call_count = int(stats.get("call_count", 0) or 0)

        # 使用默認定價估算費用
        pricing = DEFAULT_PRICING
        cost = (
            float(prompt_tokens) * pricing["input"] / 1_000_000
            + float(completion_tokens) * pricing["output"] / 1_000_000
        )

        return {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "call_count": call_count,
            "estimated_cost_usd": round(cost, 4),
            "by_purpose": by_purpose,
        }

    def get_daily_chart(self, days: int = 30) -> List[Dict[str, Any]]:
        """每日聚合數據（Chart.js 用）"""
        rows = self._repo.get_daily_stats(days)
        for row in rows:
            # date → str
            if hasattr(row.get("date"), "strftime"):
                row["date"] = row["date"].strftime("%Y-%m-%d")
            # Decimal → int（MySQL SUM 返回 Decimal）
            for key in ("prompt_tokens", "completion_tokens", "total_tokens", "call_count"):
                if key in row and row[key] is not None:
                    row[key] = int(row[key])
        return rows

    def get_recent(self, limit: int = 50) -> List[Dict[str, Any]]:
        """最近 N 條調用記錄"""
        rows = self._repo.get_recent(limit)
        for row in rows:
            if hasattr(row.get("created_at"), "strftime"):
                row["created_at"] = row["created_at"].strftime("%Y-%m-%d %H:%M:%S")
        return rows

    def get_usage_by_user(self, days: int = 30) -> List[Dict[str, Any]]:
        """按用戶聚合統計"""
        rows = self._repo.get_usage_by_user(days)
        for row in rows:
            for key in ("prompt_tokens", "completion_tokens", "total_tokens", "call_count"):
                if key in row and row[key] is not None:
                    row[key] = int(row[key])
            if hasattr(row.get("last_call_at"), "strftime"):
                row["last_call_at"] = row["last_call_at"].strftime("%Y-%m-%d %H:%M:%S")
            # 估算費用
            pricing = DEFAULT_PRICING
            cost = (
                float(row.get("prompt_tokens", 0)) * pricing["input"] / 1_000_000
                + float(row.get("completion_tokens", 0)) * pricing["output"] / 1_000_000
            )
            row["estimated_cost_usd"] = round(cost, 4)
        return rows
