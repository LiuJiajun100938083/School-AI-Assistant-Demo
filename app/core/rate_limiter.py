#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
全局 API 限流中間件

Phase 1 安全加固：單進程內存版滑動窗口限流。
適用於 workers=1 的部署場景。多進程/多實例部署需遷移至 Redis。

設計原則：
- 配置驅動：限流規則從 settings 傳入，不硬編碼
- 單一職責：只做限流，不摻雜其他邏輯
- 一致性：429 響應格式與 AppException 的 error_response 統一
- 可擴展：未來切 Redis 只改存儲層（_check_and_record），不改中間件接口

⚠️ 架構限制（與 LoginAttemptTracker 相同）：
- 單進程有效。多 worker 時每個進程獨立計數，限流被攤薄。
- 重啟後狀態丟失。
- 高併發長時間運行需監控內存增長。
"""

import json
import logging
import re
import threading
import time
from collections import deque
from typing import Any, Dict, List, Optional, Tuple

from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp, Receive, Scope, Send

logger = logging.getLogger(__name__)

# 不限流的路徑前綴
_SKIP_PREFIXES = ("/static", "/docs", "/redoc", "/openapi.json", "/health", "/favicon.ico")


class RateLimitMiddleware:
    """
    全局 API 限流（ASGI 中間件，可通過 app.add_middleware 註冊）。

    Args:
        app: ASGI application
        rules: 限流規則列表，按順序匹配，命中第一條即停止。
               每條: {"pattern": "^/api/...", "max_requests": 60, "window": 60}
        enabled: 是否啟用限流（方便配置開關）
    """

    def __init__(self, app: ASGIApp, rules: List[Dict[str, Any]] = None, enabled: bool = True):
        self.app = app
        self.enabled = enabled

        # 預編譯正則規則
        self._rules: List[Tuple[re.Pattern, int, int]] = []
        for rule in (rules or []):
            try:
                pattern = re.compile(rule["pattern"])
                self._rules.append((pattern, rule["max_requests"], rule["window"]))
            except (KeyError, re.error) as e:
                logger.warning("限流規則無效，已跳過: %s → %s", rule, e)

        # 滑動窗口存儲：{(ip, rule_index): deque([timestamp, ...])}
        self._buckets: Dict[str, deque] = {}
        self._lock = threading.Lock()

        # 定期清理計數器
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # 5 分鐘清理一次過期 key

        if self._rules:
            logger.info(
                "[限流] 已載入 %d 條規則（Phase 1 單進程內存版）",
                len(self._rules),
            )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not self.enabled:
            return await self.app(scope, receive, send)

        path = scope.get("path", "")

        # 跳過靜態資源和文檔
        if any(path.startswith(prefix) for prefix in _SKIP_PREFIXES):
            return await self.app(scope, receive, send)

        # 不是 API 路徑，不限流
        if not path.startswith("/api/"):
            return await self.app(scope, receive, send)

        # 匹配規則（命中第一條即停止）
        matched_rule = self._match_rule(path)
        if matched_rule is None:
            return await self.app(scope, receive, send)

        rule_idx, max_requests, window = matched_rule

        # 獲取客戶端 IP（不信任 X-Forwarded-For，使用 socket IP）
        client_ip = self._get_client_ip(scope)

        # 檢查是否允許
        allowed, retry_after = self._check_and_record(client_ip, rule_idx, max_requests, window)

        if not allowed:
            # 返回 429
            response = self._build_429_response(path, max_requests, window, retry_after)
            return await response(scope, receive, send)

        return await self.app(scope, receive, send)

    def _match_rule(self, path: str) -> Optional[Tuple[int, int, int]]:
        """匹配第一條符合的規則，返回 (rule_index, max_requests, window) 或 None"""
        for idx, (pattern, max_req, window) in enumerate(self._rules):
            if pattern.search(path):
                return idx, max_req, window
        return None

    def _get_client_ip(self, scope: Scope) -> str:
        """
        從 ASGI scope 獲取客戶端 IP。

        不信任 X-Forwarded-For（避免偽造繞過限流）。
        直接使用 socket 連接的 IP。
        """
        client = scope.get("client")
        if client:
            return client[0]
        return "unknown"

    def _check_and_record(
        self, ip: str, rule_idx: int, max_requests: int, window: int
    ) -> Tuple[bool, int]:
        """
        滑動窗口限流檢查 + 記錄。

        Returns:
            (allowed, retry_after_seconds)
        """
        now = time.time()
        key = f"{ip}:{rule_idx}"

        with self._lock:
            # 定期清理過期 key
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup_stale_buckets(now)
                self._last_cleanup = now

            # 獲取或創建 bucket
            if key not in self._buckets:
                self._buckets[key] = deque()

            bucket = self._buckets[key]

            # 清除窗口外的舊記錄
            cutoff = now - window
            while bucket and bucket[0] < cutoff:
                bucket.popleft()

            # 檢查是否超限
            if len(bucket) >= max_requests:
                # 計算需要等待的時間
                retry_after = int(bucket[0] + window - now) + 1
                return False, max(retry_after, 1)

            # 記錄本次請求
            bucket.append(now)
            return True, 0

    def _cleanup_stale_buckets(self, now: float) -> None:
        """清理長時間未訪問的過期 bucket，防止內存無限增長"""
        stale_keys = []
        for key, bucket in self._buckets.items():
            if not bucket or (now - bucket[-1]) > 600:  # 10 分鐘無訪問
                stale_keys.append(key)
        for key in stale_keys:
            del self._buckets[key]
        if stale_keys:
            logger.debug("[限流] 清理了 %d 個過期 bucket", len(stale_keys))

    @staticmethod
    def _build_429_response(path: str, limit: int, window: int, retry_after: int) -> Response:
        """構建統一格式的 429 響應"""
        body = json.dumps(
            {
                "success": False,
                "error": {
                    "code": "RATE_LIMITED",
                    "message": "請求過於頻繁，請稍後再試",
                    "details": {
                        "path": path,
                        "limit": limit,
                        "window": window,
                        "retry_after": retry_after,
                    },
                },
                "detail": "請求過於頻繁，請稍後再試",
            },
            ensure_ascii=False,
        )
        return Response(
            content=body,
            status_code=429,
            media_type="application/json",
            headers={"Retry-After": str(retry_after)},
        )
