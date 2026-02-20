"""
论坛系统配置
===========

集中管理所有配置项，支持环境变量覆盖。
"""

import os
from typing import List


class ForumConfig:
    """论坛系统配置类"""

    # ========== 基础配置 ==========
    # API前缀
    API_PREFIX: str = "/api/forum"

    # 分页配置
    DEFAULT_PAGE_SIZE: int = 20
    MAX_PAGE_SIZE: int = 100

    # ========== 内容限制 ==========
    # 标题长度
    TITLE_MIN_LENGTH: int = 5
    TITLE_MAX_LENGTH: int = 255

    # 内容长度
    CONTENT_MIN_LENGTH: int = 10
    CONTENT_MAX_LENGTH: int = 50000

    # 标签限制
    MAX_TAGS_PER_POST: int = 10
    TAG_MAX_LENGTH: int = 50

    # ========== 文件上传 ==========
    # 允许的文件类型
    ALLOWED_IMAGE_TYPES: List[str] = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    ALLOWED_DOCUMENT_TYPES: List[str] = [
        "application/pdf",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-powerpoint",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "text/plain",
        "text/markdown",
    ]

    # 文件大小限制 (字节)
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB
    MAX_IMAGE_SIZE: int = 5 * 1024 * 1024  # 5MB

    # 上传目录
    UPLOAD_DIR: str = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "uploads",
        "forum"
    )

    # ========== 匿名设置 ==========
    # 匿名名称前缀
    ANONYMOUS_PREFIX: str = "匿名用户"

    # ========== 通知配置 ==========
    # 通知保留天数
    NOTIFICATION_RETENTION_DAYS: int = 30

    # 最大未读通知数
    MAX_UNREAD_NOTIFICATIONS: int = 100

    # ========== 搜索配置 ==========
    # 最小搜索词长度
    MIN_SEARCH_LENGTH: int = 2

    # 搜索结果高亮
    SEARCH_HIGHLIGHT_TAG: str = "<mark>"

    # ========== 缓存配置 ==========
    # 热门主题缓存时间 (秒)
    TRENDING_CACHE_TTL: int = 300  # 5分钟

    # 标签列表缓存时间 (秒)
    TAGS_CACHE_TTL: int = 600  # 10分钟

    # ========== 权限配置 ==========
    # 可发布公告的角色
    ANNOUNCEMENT_ROLES: List[str] = ["teacher", "admin"]

    # 可设置private的角色
    PRIVATE_POST_ROLES: List[str] = ["teacher", "admin"]

    # 可置顶的角色
    PIN_POST_ROLES: List[str] = ["teacher", "admin"]

    # 可锁定的角色
    LOCK_POST_ROLES: List[str] = ["teacher", "admin"]

    # ========== WebSocket配置 ==========
    # WebSocket心跳间隔 (秒)
    WS_HEARTBEAT_INTERVAL: int = 30

    # WebSocket连接超时 (秒)
    WS_TIMEOUT: int = 60

    @classmethod
    def get_upload_dir(cls) -> str:
        """获取上传目录，不存在则创建"""
        if not os.path.exists(cls.UPLOAD_DIR):
            os.makedirs(cls.UPLOAD_DIR, exist_ok=True)
        return cls.UPLOAD_DIR


# 全局配置实例
forum_config = ForumConfig()
