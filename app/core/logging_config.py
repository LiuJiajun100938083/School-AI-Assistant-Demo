#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一日志配置模块

替代项目中分散的 print() 和不一致的 logging 配置。
提供统一的日志格式、级别控制和输出管理。

使用方式:
    from app.core.logging_config import setup_logging

    # 应用启动时调用一次
    setup_logging(level="INFO", log_dir="logs")

    # 各模块正常使用 logging
    import logging
    logger = logging.getLogger(__name__)
    logger.info("服务启动完成")
"""

import logging
import os
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler, TimedRotatingFileHandler
from typing import Optional


# 日志格式
CONSOLE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s"
FILE_FORMAT = "%(asctime)s | %(levelname)-8s | %(name)-40s | %(funcName)s:%(lineno)d | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

# 过滤器: 抑制第三方库的噪声日志
NOISY_LOGGERS = [
    "urllib3",
    "httpx",
    "httpcore",
    "uvicorn.access",
    "watchfiles",
    "chromadb",
    "sentence_transformers",
    "transformers",
    "huggingface_hub",
    "torch",
]


class ColorFormatter(logging.Formatter):
    """带颜色的控制台日志格式化器"""

    COLORS = {
        logging.DEBUG: "\033[36m",     # 青色
        logging.INFO: "\033[32m",      # 绿色
        logging.WARNING: "\033[33m",   # 黄色
        logging.ERROR: "\033[31m",     # 红色
        logging.CRITICAL: "\033[35m",  # 紫色
    }
    RESET = "\033[0m"

    def format(self, record):
        color = self.COLORS.get(record.levelno, "")
        record.levelname = f"{color}{record.levelname:<8}{self.RESET}"
        return super().format(record)


def setup_logging(
    level: str = "INFO",
    log_dir: str = "logs",
    app_name: str = "school_ai",
    enable_file_log: bool = True,
    enable_color: bool = True,
    max_file_size_mb: int = 50,
    backup_count: int = 5,
) -> None:
    """
    配置全局日志系统

    Args:
        level: 日志级别 (DEBUG/INFO/WARNING/ERROR)
        log_dir: 日志文件目录
        app_name: 应用名称 (日志文件前缀)
        enable_file_log: 是否写入日志文件
        enable_color: 是否启用控制台颜色
        max_file_size_mb: 单个日志文件最大大小 (MB)
        backup_count: 保留的日志文件数量
    """
    log_level = getattr(logging, level.upper(), logging.INFO)

    # 获取根 logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)

    # 清除已有 handler (防止重复)
    root_logger.handlers.clear()

    # ---- 控制台 Handler ----
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    if enable_color and sys.stdout.isatty():
        console_handler.setFormatter(ColorFormatter(CONSOLE_FORMAT, datefmt=DATE_FORMAT))
    else:
        console_handler.setFormatter(logging.Formatter(CONSOLE_FORMAT, datefmt=DATE_FORMAT))
    root_logger.addHandler(console_handler)

    # ---- 文件 Handler ----
    if enable_file_log:
        os.makedirs(log_dir, exist_ok=True)

        # 主日志文件 (按大小轮转)
        main_log = os.path.join(log_dir, f"{app_name}.log")
        file_handler = RotatingFileHandler(
            main_log,
            maxBytes=max_file_size_mb * 1024 * 1024,
            backupCount=backup_count,
            encoding="utf-8",
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(logging.Formatter(FILE_FORMAT, datefmt=DATE_FORMAT))
        root_logger.addHandler(file_handler)

        # 错误日志文件 (仅 ERROR 及以上)
        error_log = os.path.join(log_dir, f"{app_name}_error.log")
        error_handler = RotatingFileHandler(
            error_log,
            maxBytes=max_file_size_mb * 1024 * 1024,
            backupCount=backup_count,
            encoding="utf-8",
        )
        error_handler.setLevel(logging.ERROR)
        error_handler.setFormatter(logging.Formatter(FILE_FORMAT, datefmt=DATE_FORMAT))
        root_logger.addHandler(error_handler)

    # ---- 抑制第三方噪声日志 ----
    for logger_name in NOISY_LOGGERS:
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    # uvicorn error logger 保持 INFO
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

    root_logger.info(
        f"日志系统初始化完成: level={level}, file_log={enable_file_log}, dir={log_dir}"
    )


def get_logger(name: str) -> logging.Logger:
    """
    获取命名日志器 (便捷函数)

    等同于 logging.getLogger(name)，但保证日志系统已初始化。

    Args:
        name: 日志器名称 (通常使用 __name__)

    Returns:
        Logger 实例
    """
    return logging.getLogger(name)
