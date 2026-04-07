#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
學生風險快取 Service

封裝對 student_risk_cache 表的業務邏輯：
- refresh_all(): 重新計算所有學生風險並寫入快取（背景任務每日 03:00 呼叫）
- refresh_one(username): 刷新單一學生（管理員手動觸發）
- get_summary_by_class(class_name): 從快取讀某班學生
- get_top_at_risk(limit): 從快取讀全校 Top N 高風險學生

設計理念：refresh_all() 是「貴」的（800 學生 × 多次 SQL ≈ 5–10 秒），
            但只在背景跑，不會卡住任何 API 請求。所有教師看到的端點直接
            從快取表讀，永遠 <10ms。
"""

import json
import logging
import time
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class RiskCacheService:
    """學生風險快取服務"""

    def __init__(self, repository, user_service, analytics_service, conv_repo=None, msg_repo=None):
        """
        Args:
            repository: RiskCacheRepository instance
            user_service: UserService — 用來列出所有學生
            analytics_service: AnalyticsService — 用來呼叫 assess_student_risk
            conv_repo / msg_repo: 可選，用於補充對話/訊息統計
        """
        self._repo = repository
        self._user = user_service
        self._analytics = analytics_service
        self._conv = conv_repo
        self._msg = msg_repo

    @property
    def repository(self):
        return self._repo

    # ============================================================
    # 刷新
    # ============================================================

    def refresh_all(self) -> Dict[str, Any]:
        """
        對所有 role=student 的用戶重新計算風險並寫入快取。

        回傳：{"refreshed": int, "errors": int, "elapsed_seconds": float}
        """
        start = time.time()
        try:
            students = self._user.list_users(role="student")
        except Exception as e:
            logger.error("無法列出學生用戶: %s", e)
            return {"refreshed": 0, "errors": 0, "elapsed_seconds": 0.0, "error": str(e)}

        rows: List[Dict[str, Any]] = []
        errors = 0

        for s in students:
            username = s.get("username")
            if not username:
                continue
            try:
                row = self._build_row(username, s)
                rows.append(row)
            except Exception as e:
                errors += 1
                logger.warning("刷新學生風險失敗 %s: %s", username, e)

        # 批次寫入
        written = 0
        if rows:
            try:
                written = self._repo.bulk_upsert(rows)
            except Exception as e:
                logger.error("批次寫入 student_risk_cache 失敗: %s", e)
                return {
                    "refreshed": 0,
                    "errors": errors + len(rows),
                    "elapsed_seconds": round(time.time() - start, 1),
                    "error": str(e),
                }

        elapsed = time.time() - start
        logger.info(
            "學生風險快取刷新完成: 寫入 %d 人, 失敗 %d, 耗時 %.1f 秒",
            written, errors, elapsed,
        )
        return {
            "refreshed": written,
            "errors": errors,
            "elapsed_seconds": round(elapsed, 1),
        }

    def refresh_one(self, username: str) -> Optional[Dict[str, Any]]:
        """單人刷新（教師查看單一學生時可選擇使用）"""
        try:
            user_profile = self._user.get_user(username)
        except Exception:
            user_profile = {"username": username}
        try:
            row = self._build_row(username, user_profile or {"username": username})
            self._repo.upsert_one(row)
            return self._repo.get_one(username)
        except Exception as e:
            logger.warning("刷新單一學生風險失敗 %s: %s", username, e)
            return None

    # ============================================================
    # 內部：建置一筆風險資料
    # ============================================================

    def _build_row(self, username: str, user_profile: Dict[str, Any]) -> Dict[str, Any]:
        """呼叫 assess_student_risk 並補上統計資訊，組成可寫入的 row"""
        risk = {}
        try:
            risk = self._analytics.assess_student_risk(username) or {}
        except Exception as e:
            logger.debug("assess_student_risk 失敗 %s: %s", username, e)
            risk = {"risk_level": "unknown", "score": 0, "factors": []}

        # 補充對話/訊息統計
        total_convs = 0
        total_msgs = 0
        last_active = None
        try:
            if self._conv:
                stats = self._conv.get_conversation_stats(username) or {}
                total_convs = int(stats.get("total", 0))
                total_msgs = int(stats.get("messages", 0) or 0)
        except Exception:
            pass
        try:
            if self._msg:
                recent = self._msg.get_recent_user_messages(username, limit=1) or []
                if recent:
                    ts = recent[0].get("timestamp") or recent[0].get("created_at")
                    if ts:
                        last_active = ts
        except Exception:
            pass

        # 簡短摘要：從風險因素生成
        factors = risk.get("factors") or []
        if factors:
            summary = "；".join(factors[:3])
        else:
            summary = "活躍正常" if risk.get("risk_level") == "low" else ""

        return {
            "student_id": username,
            "student_name": user_profile.get("display_name") or username,
            "class_name": user_profile.get("class_name") or "",
            "risk_level": risk.get("risk_level", "unknown"),
            "risk_score": int(risk.get("score", 0)),
            "risk_factors": json.dumps(factors, ensure_ascii=False),
            "total_conversations": total_convs,
            "total_messages": total_msgs,
            "last_active": last_active,
            "overall_summary": summary,
            "preview_status": user_profile.get("preview_status", ""),
        }

    # ============================================================
    # 查詢（純從快取讀）
    # ============================================================

    def get_summary_by_class(self, class_name: Optional[str] = None) -> Dict[str, Any]:
        """取某班學生（含 None = 全校）。回傳 {students, count, last_refresh}"""
        students = self._repo.get_by_class(class_name)
        return {
            "students": students,
            "count": len(students),
            "last_refresh": self._repo.latest_updated_at(),
        }

    def get_top_at_risk(self, limit: int = 10) -> Dict[str, Any]:
        """取全校最高風險學生 Top N"""
        students = self._repo.get_top_at_risk(limit)
        return {
            "students": students,
            "count": len(students),
            "last_refresh": self._repo.latest_updated_at(),
        }
