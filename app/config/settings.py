#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一配置管理模块

使用 Pydantic BaseSettings 集中管理所有配置项，消除硬编码。
配置优先级: 环境变量 > .env 文件 > 默认值

使用方式:
    from app.config.settings import get_settings
    settings = get_settings()
    print(settings.db_host)
"""

import os
import json
import secrets
from pathlib import Path
from typing import List, Optional
from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings


# 项目根目录
BASE_DIR = Path(__file__).resolve().parent.parent.parent


class DatabaseSettings(BaseSettings):
    """数据库配置"""
    db_host: str = Field(default="127.0.0.1", description="数据库主机")
    db_port: int = Field(default=3306, description="数据库端口")
    db_user: str = Field(default="ai_demo", description="数据库用户")
    db_password: str = Field(default="DemoPass123!", description="数据库密码")
    db_name: str = Field(default="school_ai_demo", description="数据库名")
    db_charset: str = Field(default="utf8mb4", description="字符集")

    # 连接池配置
    db_pool_max_connections: int = Field(default=100, description="最大连接数")
    db_pool_min_cached: int = Field(default=20, description="最小缓存连接数")
    db_pool_max_cached: int = Field(default=50, description="最大缓存连接数")
    db_pool_max_shared: int = Field(default=0, description="最大共享连接数 (0=不共享)")
    db_pool_max_usage: int = Field(default=1000, description="单连接最大使用次数")
    db_pool_blocking: bool = Field(default=True, description="池满时阻塞")

    # 超时配置
    db_connect_timeout: int = Field(default=10, description="连接超时(秒)")
    db_read_timeout: int = Field(default=30, description="读取超时(秒)")
    db_write_timeout: int = Field(default=30, description="写入超时(秒)")


class JWTSettings(BaseSettings):
    """JWT 认证配置"""
    jwt_secret: str = Field(default="", description="JWT 签名密钥 (至少32字符)")
    jwt_algorithm: str = Field(default="HS256", description="JWT 算法")
    jwt_access_token_expire_hours: int = Field(default=24, description="访问令牌过期时间(小时)")
    jwt_refresh_token_expire_days: int = Field(default=7, description="刷新令牌过期时间(天)")

    @field_validator("jwt_secret", mode="before")
    @classmethod
    def resolve_jwt_secret(cls, v: str) -> str:
        """
        JWT 密钥加载优先级:
        1. 环境变量 JWT_SECRET (>= 32字符)
        2. jwt_secret.key 文件
        3. 开发模式自动生成 (每次重启变化，仅限开发)
        """
        if v and len(v) >= 32:
            return v

        # 尝试从密钥文件加载
        key_file = BASE_DIR / "jwt_secret.key"
        if key_file.exists():
            try:
                secret = key_file.read_text().strip()
                if secret and len(secret) >= 32:
                    return secret
            except Exception:
                pass

        # 开发模式: 生成临时密钥
        import logging
        logging.warning(
            "⚠️ JWT_SECRET 未配置或长度不足32字符，使用临时密钥。"
            "生产环境请设置环境变量 JWT_SECRET"
        )
        return secrets.token_hex(32)


class SecuritySettings(BaseSettings):
    """安全配置"""
    # 密码策略
    password_min_length: int = Field(default=8)
    password_max_length: int = Field(default=128)
    password_require_uppercase: bool = Field(default=True)
    password_require_lowercase: bool = Field(default=True)
    password_require_numbers: bool = Field(default=True)
    password_require_special: bool = Field(default=True)

    # 登录限制
    login_max_attempts_per_ip: int = Field(default=200, description="同一 IP 允许失败次数（学校共享 IP 场景需调高）")
    login_max_attempts_per_user: int = Field(default=10, description="同一用户允许失败次数")
    login_max_attempts_per_ip_user: int = Field(default=5, description="同一 IP+用户组合允许失败次数")
    login_block_duration: int = Field(default=300, description="IP 级别锁定时间(秒)")
    login_block_duration_user: int = Field(default=60, description="用户级别锁定时间(秒)")
    login_time_window: int = Field(default=600, description="检测窗口(秒)")
    login_ip_whitelist: List[str] = Field(
        default=["127.0.0.1", "::1", "72.255.249.193"],
        description="IP 白名单"
    )

    # 加密密钥文件
    encryption_key_file: str = Field(default=".encryption_key")
    private_key_file: str = Field(default="private_key.pem")
    public_key_file: str = Field(default="public_key.pem")

    @field_validator("login_ip_whitelist", mode="before")
    @classmethod
    def parse_ip_whitelist(cls, v):
        if isinstance(v, str):
            return [ip.strip() for ip in v.split(",") if ip.strip()]
        return v


class LLMSettings(BaseSettings):
    """LLM 配置"""
    # 本地模型 (Ollama)
    llm_local_model: str = Field(default="qwen3.5:35b", description="本地模型名称")
    llm_local_base_url: str = Field(default="http://localhost:11434", description="Ollama 服务地址")

    # API 模型 (Qwen / DashScope)
    llm_api_model: str = Field(default="qwen-plus", description="API 模型名称")
    llm_api_base_url: str = Field(default="https://dashscope.aliyuncs.com/compatible-mode/v1")
    llm_api_key: Optional[str] = Field(default=None, description="API 密钥")

    # 推理参数
    llm_temperature: float = Field(default=0.6, ge=0.0, le=2.0)
    llm_top_p: float = Field(default=0.95, ge=0.0, le=1.0)
    llm_timeout: int = Field(default=120, description="推理超时(秒)")
    llm_max_tokens: int = Field(default=4096)
    llm_enable_thinking: bool = Field(default=True, description="启用思考模式")
    llm_use_api: bool = Field(default=True, description="使用API而非本地模型")

    # 停止标记
    llm_stop_tokens: List[str] = Field(
        default=["<|im_start|>", "<|im_end|>", "<|endoftext|>"]
    )

    # 圖片生成
    image_gen_model: str = Field(default="x/flux2-klein:4b", description="圖片生成模型")
    image_gen_timeout: int = Field(default=600, description="圖片生成超時(秒)")
    image_gen_max_prompt_length: int = Field(default=500, description="圖片描述最大長度")

    # 內容安全審核
    content_moderation_model: str = Field(
        default="qwen3.5:4b", description="內容安全審核模型"
    )
    content_moderation_timeout: int = Field(
        default=10, description="審核超時(秒)"
    )
    content_moderation_enabled: bool = Field(
        default=True, description="啟用 LLM 安全審核"
    )
    content_moderation_max_concurrency: int = Field(
        default=2, description="安全審核最大並發數"
    )
    content_moderation_fail_closed: bool = Field(
        default=True, description="審核失敗時拒絕(True)或放行(False)"
    )

    # AI 話題相關性審核（討論區用，None 則跟隨 content_moderation_model）
    content_ai_related_model: Optional[str] = Field(
        default=None, description="AI 話題審核模型，None=跟隨安全審核模型"
    )
    content_ai_related_max_concurrency: int = Field(
        default=2, description="AI 話題審核最大並發數"
    )


class ServerSettings(BaseSettings):
    """服务器配置"""
    server_host: str = Field(default="0.0.0.0")
    server_port: int = Field(default=8002)
    server_workers: int = Field(default=1)
    server_debug: bool = Field(default=False)
    server_reload: bool = Field(default=False)

    # 并发控制
    concurrent_limit: int = Field(default=50, description="最大并发请求数")
    ai_concurrent_limit: int = Field(default=4, description="AI 推理并发容量（WeightedPriorityScheduler 總容量）")
    websocket_max_connections: int = Field(default=100)

    # CORS
    cors_origins: List[str] = Field(
        default=[
            "http://localhost:8002",
            "http://127.0.0.1:8002",
            "http://localhost:3000",
        ]
    )
    cors_allow_credentials: bool = Field(default=True)
    cors_allow_methods: List[str] = Field(default=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"])
    cors_allow_headers: List[str] = Field(default=["*"])

    # Ngrok (可选)
    ngrok_domain: Optional[str] = Field(default=None)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v):
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v


class Settings(
    DatabaseSettings,
    JWTSettings,
    SecuritySettings,
    LLMSettings,
    ServerSettings,
):
    """
    统一配置类 - 继承所有分类配置

    环境变量命名规则 (自动映射):
    - DB_HOST -> db_host
    - JWT_SECRET -> jwt_secret
    - LLM_LOCAL_MODEL -> llm_local_model
    - SERVER_PORT -> server_port

    使用方式:
        settings = get_settings()
        print(settings.db_host)       # 数据库主机
        print(settings.jwt_secret)    # JWT 密钥
        print(settings.llm_local_model) # 本地模型名称
    """
    # 应用信息
    app_name: str = Field(default="校园AI助手", description="应用名称")
    app_version: str = Field(default="2.0.0", description="应用版本")
    environment: str = Field(default="development", description="运行环境 (development/production)")

    # 路径配置
    base_dir: Path = Field(default=BASE_DIR)
    log_dir: str = Field(default="logs")
    upload_dir: str = Field(default="uploads")
    user_data_dir: str = Field(default="user_data")
    knowledge_base_dir: str = Field(default="Knowledge_base")
    vector_db_dir: str = Field(default="vector_db")

    model_config = {
        "env_file": str(BASE_DIR / ".env"),
        "env_file_encoding": "utf-8",
        "extra": "ignore",  # 忽略未定义的环境变量
        "case_sensitive": False,
    }

    def is_production(self) -> bool:
        """判断是否为生产环境"""
        return self.environment.lower() == "production"

    def get_db_url(self) -> str:
        """获取数据库连接 URL"""
        return (
            f"mysql+pymysql://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
            f"?charset={self.db_charset}"
        )

    def get_cors_origins(self) -> List[str]:
        """获取 CORS 允许来源 (含 ngrok)"""
        origins = list(self.cors_origins)
        if self.ngrok_domain:
            origins.append(f"https://{self.ngrok_domain}")
        return origins

    def load_security_config_from_file(self) -> None:
        """从 security_config.json 加载安全配置 (向后兼容)"""
        config_path = self.base_dir / "security_config.json"
        if config_path.exists():
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    data = json.load(f)

                # 密码策略
                if "password_policy" in data:
                    pp = data["password_policy"]
                    self.password_min_length = pp.get("min_length", self.password_min_length)
                    self.password_max_length = pp.get("max_length", self.password_max_length)
                    self.password_require_uppercase = pp.get("require_uppercase", self.password_require_uppercase)
                    self.password_require_lowercase = pp.get("require_lowercase", self.password_require_lowercase)
                    self.password_require_numbers = pp.get("require_numbers", self.password_require_numbers)
                    self.password_require_special = pp.get("require_special", self.password_require_special)

                # 登录安全
                if "login_security" in data:
                    ls = data["login_security"]
                    self.login_max_attempts_per_ip = ls.get("max_attempts_per_ip", self.login_max_attempts_per_ip)
                    self.login_max_attempts_per_user = ls.get("max_attempts_per_user", self.login_max_attempts_per_user)
                    self.login_block_duration = ls.get("block_duration", self.login_block_duration)
                    self.login_time_window = ls.get("time_window", self.login_time_window)
                    self.login_ip_whitelist = ls.get("ip_whitelist", self.login_ip_whitelist)

                # JWT
                if "jwt_security" in data:
                    js = data["jwt_security"]
                    self.jwt_access_token_expire_hours = js.get(
                        "access_token_expire_hours", self.jwt_access_token_expire_hours
                    )
                    self.jwt_refresh_token_expire_days = js.get(
                        "refresh_token_expire_days", self.jwt_refresh_token_expire_days
                    )

            except Exception as e:
                import logging
                logging.warning(f"加载 security_config.json 失败: {e}")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    获取全局配置单例

    使用 lru_cache 确保整个应用生命周期只创建一次 Settings 实例。
    在测试中可通过 get_settings.cache_clear() 清除缓存。
    """
    settings = Settings()
    # 向后兼容: 加载 security_config.json
    settings.load_security_config_from_file()
    return settings
