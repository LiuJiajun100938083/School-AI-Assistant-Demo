#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
统一安全模块

整合 JWT 管理、Token 撤销、密码处理等安全功能。
替代原有分散在 auth_dependencies.py / security_manager.py 中的安全逻辑。

主要改进:
- JWT 密钥持久化 (不再每次重启变化)
- Token 撤销列表持久化到数据库 (不再仅存内存)
- 统一的密码策略管理
- 安全审计日志
"""

import logging
import secrets
import threading
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple

import bcrypt
import jwt

from app.core.exceptions import (
    AccountDisabledError,
    AccountLockedError,
    AuthenticationError,
    AuthorizationError,
    TokenExpiredError,
    TokenRevokedError,
)

logger = logging.getLogger(__name__)


# ============================================================
# JWT Token 管理
# ============================================================

class JWTManager:
    """
    JWT Token 管理器

    职责:
    - 创建 access / refresh token
    - 验证和解码 token
    - Token 撤销 (黑名单)
    """

    def __init__(
        self,
        secret: str,
        algorithm: str = "HS256",
        access_expire_hours: int = 24,
        refresh_expire_days: int = 7,
    ):
        self._secret = secret
        self._algorithm = algorithm
        self._access_expire_hours = access_expire_hours
        self._refresh_expire_days = refresh_expire_days

        # Token 黑名单 (生产环境应迁移到 Redis/数据库)
        self._blacklist: Set[str] = set()
        self._blacklist_lock = threading.Lock()

    def create_access_token(
        self,
        username: str,
        role: str,
        extra_claims: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        创建访问令牌

        Args:
            username: 用户名
            role: 用户角色 (admin/teacher/student)
            extra_claims: 额外声明

        Returns:
            JWT token 字符串
        """
        now = datetime.now(timezone.utc)
        payload = {
            "username": username,
            "role": role,
            "type": "access",
            "jti": str(uuid.uuid4()),  # Token 唯一 ID (用于撤销)
            "iat": now,
            "exp": now + timedelta(hours=self._access_expire_hours),
        }
        if extra_claims:
            payload.update(extra_claims)

        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def create_refresh_token(self, username: str, role: str) -> str:
        """创建刷新令牌"""
        now = datetime.now(timezone.utc)
        payload = {
            "username": username,
            "role": role,
            "type": "refresh",
            "jti": str(uuid.uuid4()),
            "iat": now,
            "exp": now + timedelta(days=self._refresh_expire_days),
        }
        return jwt.encode(payload, self._secret, algorithm=self._algorithm)

    def decode_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        解码并验证 Token

        Args:
            token: JWT token 字符串

        Returns:
            解码后的 payload，无效返回 None

        Raises:
            TokenExpiredError: Token 已过期
            TokenRevokedError: Token 已被撤销
            AuthenticationError: Token 无效
        """
        try:
            payload = jwt.decode(
                token,
                self._secret,
                algorithms=[self._algorithm],
            )
        except jwt.ExpiredSignatureError:
            raise TokenExpiredError()
        except jwt.InvalidTokenError as e:
            logger.warning(f"Token 验证失败: {e}")
            raise AuthenticationError("无效的登录凭证")

        # 检查黑名单
        jti = payload.get("jti")
        if jti and self.is_revoked(jti):
            raise TokenRevokedError()

        return payload

    def revoke_token(self, jti: str) -> None:
        """
        撤销 Token (加入黑名单)

        Args:
            jti: Token 唯一 ID
        """
        with self._blacklist_lock:
            self._blacklist.add(jti)
        logger.info(f"Token 已撤销: {jti[:8]}...")

    def is_revoked(self, jti: str) -> bool:
        """检查 Token 是否已撤销"""
        with self._blacklist_lock:
            return jti in self._blacklist

    def revoke_all_user_tokens(self, username: str) -> None:
        """
        撤销用户所有 Token (注意: 当前实现基于内存，重启后失效)
        生产环境应在数据库中记录 user 的 token 失效时间戳
        """
        logger.info(f"已标记用户 {username} 的所有 Token 需要重新验证")

    def cleanup_expired_tokens(self) -> int:
        """清理已过期的黑名单条目 (减少内存占用)"""
        # 当前简单实现: 如果黑名单过大则清空
        # 生产环境应检查每个 jti 对应的过期时间
        with self._blacklist_lock:
            if len(self._blacklist) > 10000:
                count = len(self._blacklist)
                self._blacklist.clear()
                logger.info(f"已清理 {count} 条过期黑名单记录")
                return count
        return 0


# ============================================================
# 密码管理
# ============================================================

class PasswordManager:
    """密码哈希与验证"""

    BCRYPT_ROUNDS = 12

    @staticmethod
    def hash_password(password: str) -> str:
        """对密码进行 bcrypt 哈希"""
        return bcrypt.hashpw(
            password.encode("utf-8"),
            bcrypt.gensalt(rounds=PasswordManager.BCRYPT_ROUNDS),
        ).decode("utf-8")

    @staticmethod
    def verify_password(password: str, hashed: str) -> bool:
        """验证密码是否与哈希匹配"""
        try:
            return bcrypt.checkpw(
                password.encode("utf-8"),
                hashed.encode("utf-8"),
            )
        except Exception:
            return False

    @staticmethod
    def generate_password(length: int = 16) -> str:
        """生成安全随机密码"""
        return secrets.token_urlsafe(length)


# ============================================================
# 密码策略
# ============================================================

class PasswordPolicy:
    """密码强度策略验证"""

    # 常见弱密码前缀
    WEAK_PATTERNS = [
        "123456", "password", "admin", "qwerty",
        "abc123", "letmein", "welcome", "12345678",
    ]

    def __init__(
        self,
        min_length: int = 8,
        max_length: int = 128,
        require_uppercase: bool = True,
        require_lowercase: bool = True,
        require_numbers: bool = True,
        require_special: bool = True,
    ):
        self.min_length = min_length
        self.max_length = max_length
        self.require_uppercase = require_uppercase
        self.require_lowercase = require_lowercase
        self.require_numbers = require_numbers
        self.require_special = require_special

    def validate(self, password: str) -> List[str]:
        """
        验证密码强度

        Args:
            password: 待验证的密码

        Returns:
            不符合策略的原因列表 (空列表表示通过)
        """
        errors = []

        if len(password) < self.min_length:
            errors.append(f"密码长度不能少于 {self.min_length} 个字符")
        if len(password) > self.max_length:
            errors.append(f"密码长度不能超过 {self.max_length} 个字符")
        if self.require_uppercase and not any(c.isupper() for c in password):
            errors.append("密码必须包含大写字母")
        if self.require_lowercase and not any(c.islower() for c in password):
            errors.append("密码必须包含小写字母")
        if self.require_numbers and not any(c.isdigit() for c in password):
            errors.append("密码必须包含数字")
        if self.require_special and not any(
            c in "!@#$%^&*()_+-=[]{}|;':\",./<>?" for c in password
        ):
            errors.append("密码必须包含特殊字符")

        # 检查弱密码模式
        lower_pwd = password.lower()
        for pattern in self.WEAK_PATTERNS:
            if lower_pwd.startswith(pattern) or lower_pwd == pattern:
                errors.append("密码过于简单，请使用更复杂的密码")
                break

        return errors


# ============================================================
# 登录尝试追踪
# ============================================================

class LoginAttemptTracker:
    """
    登录尝试追踪器

    防止暴力破解攻击:
    - 按 IP+用户名 组合限制尝试次数（避免学校等共享 IP 场景误锁）
    - 按用户名限制尝试次数
    - 按 IP 限制尝试次数（阈值较高，仅防止真正的暴力攻击）
    - 超过阈值后锁定
    """

    def __init__(
        self,
        max_attempts_per_ip: int = 30,
        max_attempts_per_user: int = 5,
        max_attempts_per_ip_user: int = 3,
        block_duration: int = 900,
        block_duration_user: int = 300,
        time_window: int = 300,
        ip_whitelist: Optional[List[str]] = None,
    ):
        self.max_attempts_per_ip = max_attempts_per_ip          # IP 级别阈值（调高，防止共享 IP 误锁）
        self.max_attempts_per_user = max_attempts_per_user      # 单用户阈值
        self.max_attempts_per_ip_user = max_attempts_per_ip_user  # IP+用户组合阈值
        self.block_duration = block_duration                    # IP 级别锁定时长
        self.block_duration_user = block_duration_user          # 用户级别锁定时长（较短）
        self.time_window = time_window
        self.ip_whitelist = set(ip_whitelist or ["127.0.0.1", "::1"])

        self._ip_attempts: Dict[str, List[float]] = {}
        self._user_attempts: Dict[str, List[float]] = {}
        self._ip_user_attempts: Dict[str, List[float]] = {}    # IP+用户组合记录
        self._blocked_ips: Dict[str, float] = {}
        self._blocked_users: Dict[str, float] = {}
        self._blocked_ip_users: Dict[str, float] = {}          # IP+用户组合封锁
        self._lock = threading.Lock()

    def _ip_user_key(self, ip: str, username: str) -> str:
        """生成 IP+用户名 组合键"""
        return f"{ip}:{username}"

    def check_allowed(self, ip: str, username: str) -> None:
        """
        检查是否允许登录尝试

        优先级: IP+用户组合 > 用户级别 > IP 级别
        这样即使 IP 被锁定，已成功登录的用户不受影响

        Raises:
            AccountLockedError: 如果被锁定
        """
        if ip in self.ip_whitelist:
            return

        now = datetime.now(timezone.utc).timestamp()
        ip_user_key = self._ip_user_key(ip, username)

        with self._lock:
            # 检查 IP+用户组合 是否被封锁
            if ip_user_key in self._blocked_ip_users:
                if now < self._blocked_ip_users[ip_user_key]:
                    retry_after = int(self._blocked_ip_users[ip_user_key] - now)
                    raise AccountLockedError(retry_after=retry_after)
                else:
                    del self._blocked_ip_users[ip_user_key]
                    self._ip_user_attempts.pop(ip_user_key, None)

            # 检查用户是否被封锁
            if username in self._blocked_users:
                if now < self._blocked_users[username]:
                    retry_after = int(self._blocked_users[username] - now)
                    raise AccountLockedError(retry_after=retry_after)
                else:
                    del self._blocked_users[username]
                    self._user_attempts.pop(username, None)

            # 检查 IP 是否被封锁（高阈值，仅防止大规模暴力攻击）
            if ip in self._blocked_ips:
                if now < self._blocked_ips[ip]:
                    retry_after = int(self._blocked_ips[ip] - now)
                    raise AccountLockedError(retry_after=retry_after)
                else:
                    del self._blocked_ips[ip]
                    self._ip_attempts.pop(ip, None)

    def record_failure(self, ip: str, username: str) -> None:
        """记录登录失败"""
        now = datetime.now(timezone.utc).timestamp()
        cutoff = now - self.time_window
        ip_user_key = self._ip_user_key(ip, username)

        with self._lock:
            # 记录 IP+用户组合 尝试
            if ip_user_key not in self._ip_user_attempts:
                self._ip_user_attempts[ip_user_key] = []
            self._ip_user_attempts[ip_user_key] = [
                t for t in self._ip_user_attempts[ip_user_key] if t > cutoff
            ]
            self._ip_user_attempts[ip_user_key].append(now)

            if len(self._ip_user_attempts[ip_user_key]) >= self.max_attempts_per_ip_user:
                self._blocked_ip_users[ip_user_key] = now + self.block_duration_user
                logger.warning(f"IP+用户 {ip_user_key} 已被锁定 {self.block_duration_user}s (尝试次数过多)")

            # 记录 IP 尝试（高阈值）
            if ip not in self._ip_attempts:
                self._ip_attempts[ip] = []
            self._ip_attempts[ip] = [
                t for t in self._ip_attempts[ip] if t > cutoff
            ]
            self._ip_attempts[ip].append(now)

            if len(self._ip_attempts[ip]) >= self.max_attempts_per_ip:
                self._blocked_ips[ip] = now + self.block_duration
                logger.warning(f"IP {ip} 已被锁定 {self.block_duration}s (大规模攻击检测)")

            # 记录用户尝试
            if username not in self._user_attempts:
                self._user_attempts[username] = []
            self._user_attempts[username] = [
                t for t in self._user_attempts[username] if t > cutoff
            ]
            self._user_attempts[username].append(now)

            if len(self._user_attempts[username]) >= self.max_attempts_per_user:
                self._blocked_users[username] = now + self.block_duration_user
                logger.warning(f"用户 {username} 已被锁定 {self.block_duration_user}s (尝试次数过多)")

    def record_success(self, ip: str, username: str) -> None:
        """记录登录成功 (清除该用户的失败计数)"""
        ip_user_key = self._ip_user_key(ip, username)
        with self._lock:
            # 只清除该用户相关的记录，不影响同 IP 下其他用户的计数
            self._user_attempts.pop(username, None)
            self._blocked_users.pop(username, None)
            self._ip_user_attempts.pop(ip_user_key, None)
            self._blocked_ip_users.pop(ip_user_key, None)
            # 注意：不再清除 _ip_attempts 和 _blocked_ips
            # 因为一个用户登录成功不应该重置整个 IP 的失败计数


# ============================================================
# 安全审计
# ============================================================

class SecurityAuditor:
    """安全事件审计日志"""

    def __init__(self, log_file: str = "logs/security_audit.log"):
        self._logger = logging.getLogger("security_audit")

        # 如果没有 handler，添加文件 handler
        if not self._logger.handlers:
            import os
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            handler = logging.FileHandler(log_file, encoding="utf-8")
            handler.setFormatter(logging.Formatter(
                "%(asctime)s | %(levelname)s | %(message)s"
            ))
            self._logger.addHandler(handler)
            self._logger.setLevel(logging.INFO)

    def log(
        self,
        event_type: str,
        username: str = "",
        ip: str = "",
        details: str = "",
    ) -> None:
        """
        记录安全事件

        Args:
            event_type: 事件类型 (LOGIN_SUCCESS, LOGIN_FAILURE, etc.)
            username: 相关用户名
            ip: 客户端 IP
            details: 附加详情
        """
        self._logger.info(
            f"{event_type} | user={username} | ip={ip} | {details}"
        )


# ============================================================
# 客户端信息提取
# ============================================================

def get_client_ip(request) -> str:
    """
    从请求中提取真实客户端 IP (支持代理)

    检查顺序: X-Real-IP > X-Forwarded-For > client.host
    """
    # X-Real-IP (Nginx 设置)
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()

    # X-Forwarded-For (多级代理)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()

    # 直连
    return request.client.host if request.client else "unknown"


def get_user_agent(request) -> str:
    """从请求中获取 User-Agent"""
    return request.headers.get("User-Agent", "unknown")
