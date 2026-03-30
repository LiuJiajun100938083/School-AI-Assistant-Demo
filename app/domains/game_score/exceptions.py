#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
自定義遊戲計分 — 異常定義

繼承 AppException，由全局異常處理器統一捕獲並轉換為 JSON 響應。
"""

from app.core.exceptions import AppException


class GameScoreError(AppException):
    """遊戲計分基礎異常"""


class GameNotFoundForScoreError(GameScoreError):
    """遊戲不存在（提交分數時校驗）"""

    def __init__(self, game_uuid: str):
        super().__init__(
            code="GAME_NOT_FOUND",
            message=f"遊戲不存在: {game_uuid}",
            status_code=404,
        )


class ScoreRateLimitError(GameScoreError):
    """提交太頻繁"""

    def __init__(self):
        super().__init__(
            code="SCORE_RATE_LIMITED",
            message="提交太頻繁，請稍後再試",
            status_code=429,
        )


class AlreadyPlayedError(GameScoreError):
    """遊戲僅允許遊玩一次，且學生已有記錄"""

    def __init__(self, game_uuid: str):
        super().__init__(
            code="ALREADY_PLAYED",
            message="此遊戲僅允許遊玩一次",
            status_code=409,
        )


class MaxAttemptsReachedError(GameScoreError):
    """已達遊戲最大遊玩次數"""

    def __init__(self, game_uuid: str, max_attempts: int):
        super().__init__(
            code="MAX_ATTEMPTS_REACHED",
            message=f"已達最大遊玩次數 ({max_attempts})",
            status_code=409,
            details={"max_attempts": max_attempts},
        )
