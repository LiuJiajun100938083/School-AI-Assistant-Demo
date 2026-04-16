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
    - Token 撤销 (黑名单, 持久化到数据库)
    """

    _table_ensured: bool = False

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

        # 内存缓存 (加速高频 is_revoked 查询, 避免每次都查 DB)
        self._cache: Set[str] = set()
        self._cache_lock = threading.Lock()

        # 用户级 token 撤销缓存: username -> revoked_at (UTC datetime)
        self._user_revoked_at: Dict[str, datetime] = {}

        # 确保数据库表存在 (只执行一次)
        self._ensure_table()

    def _get_pool(self):
        """延迟获取数据库连接池, 避免循环导入"""
        from app.infrastructure.database import get_database_pool
        return get_database_pool()

    def _ensure_table(self) -> None:
        """创建 token_blacklist 表 (如果不存在)"""
        if JWTManager._table_ensured:
            return
        try:
            pool = self._get_pool()
            pool.execute_write("""
                CREATE TABLE IF NOT EXISTS token_blacklist (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    jti VARCHAR(200) NOT NULL UNIQUE,
                    username VARCHAR(100) DEFAULT '',
                    revoked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    expires_at DATETIME NOT NULL,
                    INDEX idx_jti (jti),
                    INDEX idx_expires (expires_at)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
            """)
            # 兼容升级: 旧表 jti 为 VARCHAR(36), 扩展以支持 user_revoke/family 前缀
            try:
                pool.execute_write(
                    "ALTER TABLE token_blacklist MODIFY COLUMN jti VARCHAR(200) NOT NULL"
                )
            except Exception:
                pass  # 已经是正确类型则忽略
            JWTManager._table_ensured = True
            logger.info("token_blacklist 表已就绪")
        except Exception as e:
            logger.warning(f"创建 token_blacklist 表失败 (将回退到内存模式): {e}")

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

    def create_refresh_token(
        self, username: str, role: str, family_id: str = None
    ) -> str:
        """
        创建刷新令牌

        Args:
            username: 用户名
            role: 用户角色
            family_id: Token 家族 ID (用于 Refresh Token Rotation)。
                       首次登录时为 None（自动生成新家族），
                       轮换时传入旧家族 ID 以保持关联。
        """
        now = datetime.now(timezone.utc)
        payload = {
            "username": username,
            "role": role,
            "type": "refresh",
            "jti": str(uuid.uuid4()),
            "family": family_id or str(uuid.uuid4()),
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

        # 检查单 token 黑名单
        jti = payload.get("jti")
        if jti and self.is_revoked(jti):
            raise TokenRevokedError()

        # 检查用户级撤销 (密码修改后所有旧 token 失效)
        username = payload.get("username")
        if username and self._is_user_tokens_revoked(username, payload.get("iat")):
            raise TokenRevokedError()

        return payload

    def revoke_token(self, jti: str, username: str = "", expires_at: Optional[datetime] = None) -> None:
        """
        撤销 Token (加入数据库黑名单)

        Args:
            jti: Token 唯一 ID
            username: 关联的用户名 (用于审计)
            expires_at: Token 过期时间 (用于清理)
        """
        if expires_at is None:
            expires_at = datetime.now(timezone.utc) + timedelta(hours=self._access_expire_hours)

        # 写入内存缓存
        with self._cache_lock:
            self._cache.add(jti)

        # 写入数据库
        try:
            pool = self._get_pool()
            pool.execute_write(
                "INSERT IGNORE INTO token_blacklist (jti, username, expires_at) VALUES (%s, %s, %s)",
                (jti, username, expires_at),
            )
        except Exception as e:
            logger.warning(f"写入 token_blacklist 失败 (内存缓存仍有效): {e}")

        logger.info(f"Token 已撤销: {jti[:8]}...")

    def is_revoked(self, jti: str) -> bool:
        """检查 Token 是否已撤销 (先查缓存, 再查数据库)"""
        # 快速路径: 内存缓存
        with self._cache_lock:
            if jti in self._cache:
                return True

        # 慢路径: 查数据库
        try:
            pool = self._get_pool()
            row = pool.execute_one(
                "SELECT 1 FROM token_blacklist WHERE jti = %s",
                (jti,),
            )
            if row:
                # 回填缓存
                with self._cache_lock:
                    self._cache.add(jti)
                return True
        except Exception as e:
            logger.warning(f"查询 token_blacklist 失败: {e}")

        return False

    def _is_user_tokens_revoked(self, username: str, token_iat: Optional[float]) -> bool:
        """检查 token 是否因用户级撤销（如密码修改）而失效"""
        if token_iat is None:
            return False

        # 快速路径: 内存缓存
        with self._cache_lock:
            revoked_at = self._user_revoked_at.get(username)

        # 慢路径: 查数据库并回填缓存
        if revoked_at is None:
            user_jti = f"user_revoke:{username}"
            try:
                pool = self._get_pool()
                row = pool.execute_one(
                    "SELECT revoked_at FROM token_blacklist WHERE jti = %s",
                    (user_jti,),
                )
                if row and row.get("revoked_at"):
                    revoked_at = row["revoked_at"]
                    if revoked_at.tzinfo is None:
                        revoked_at = revoked_at.replace(tzinfo=timezone.utc)
                    with self._cache_lock:
                        self._user_revoked_at[username] = revoked_at
                else:
                    return False
            except Exception as e:
                logger.warning(f"查询用户级 token 撤销失败: {e}")
                return False

        token_issued = datetime.fromtimestamp(token_iat, tz=timezone.utc)
        return token_issued < revoked_at

    def revoke_all_user_tokens(self, username: str) -> None:
        """
        撤销用户所有 Token

        向黑名单中插入一条用户级撤销记录 (jti = "user_revoke:{username}"),
        decode_token 验证时会比较 token 的 iat 与撤销时间,
        拒绝所有在撤销时间之前签发的 token。
        """
        now = datetime.now(timezone.utc)
        user_jti = f"user_revoke:{username}"
        expires_at = now + timedelta(days=max(self._refresh_expire_days, 7))

        # 更新内存缓存
        with self._cache_lock:
            self._user_revoked_at[username] = now

        # 持久化到数据库
        try:
            pool = self._get_pool()
            pool.execute_write(
                "DELETE FROM token_blacklist WHERE jti = %s", (user_jti,),
            )
            pool.execute_write(
                "INSERT INTO token_blacklist (jti, username, revoked_at, expires_at) "
                "VALUES (%s, %s, %s, %s)",
                (user_jti, username, now, expires_at),
            )
        except Exception as e:
            logger.warning(f"持久化用户级 token 撤销失败: {e}")

        logger.info(f"已撤销用户 {username} 在 {now} 之前签发的所有 Token")

    # ---- Refresh Token Rotation: 家族级撤销 ----

    def revoke_token_family(self, family_id: str, username: str = "") -> None:
        """
        撤销整个 Token 家族 (Refresh Token Replay Detection)

        当检测到已撤销的 refresh token 被重新使用时，
        撤销该家族的所有 token，强制用户重新登录。
        """
        family_jti = f"family:{family_id}"
        try:
            pool = self._get_pool()
            pool.execute_write(
                "INSERT IGNORE INTO token_blacklist (jti, username, expires_at) "
                "VALUES (%s, %s, %s)",
                (family_jti, username,
                 datetime.now(timezone.utc) + timedelta(days=self._refresh_expire_days)),
            )
            with self._cache_lock:
                self._cache.add(family_jti)
        except Exception as e:
            logger.warning(f"撤销 token 家族失败: {e}")

        logger.warning(
            "Token 家族已撤销 (replay detected): family=%s user=%s",
            family_id[:8], username,
        )

    def is_family_revoked(self, family_id: str) -> bool:
        """检查 Token 家族是否已被撤销"""
        return self.is_revoked(f"family:{family_id}")

    def cleanup_expired_tokens(self) -> int:
        """清理已过期的黑名单条目"""
        try:
            pool = self._get_pool()
            deleted = pool.execute_write(
                "DELETE FROM token_blacklist WHERE expires_at < NOW()"
            )
            # 同步清理内存缓存
            if deleted > 0:
                with self._cache_lock:
                    self._cache.clear()
            logger.info(f"已清理 {deleted} 条过期黑名单记录")
            return deleted
        except Exception as e:
            logger.warning(f"清理 token_blacklist 失败: {e}")
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
    async def verify_password_async(password: str, hashed: str) -> bool:
        """异步验证密码（在线程池中执行 bcrypt，避免阻塞事件循环）"""
        import asyncio
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, PasswordManager.verify_password, password, hashed
        )

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

    ⚠️ 架构限制说明 (Architecture Note):
    ------------------------------------
    当前实现使用 **进程内内存** (Python dict) 存储所有限流状态。
    这意味着:

    1. **多进程/多实例部署时无法共享状态**:
       如果使用 workers > 1 (gunicorn/uvicorn) 或多机部署，
       每个进程有独立的限流计数器，攻击者可以将请求分散到不同进程绕过限流。

    2. **进程重启后状态丢失**:
       应用重启后所有封锁记录和失败计数都会清空。

    3. **内存增长**:
       大量不同 IP/用户名组合会持续增长内存（虽然有时间窗口清理）。

    ✅ 当前 workers=1 单实例配置下，内存方案完全够用。

    未来 Redis 迁移路径 (Future Redis Migration):
    -------------------------------------------
    建议使用 Redis 替代内存存储:

    方案 A: Redis String + TTL (简单方案)
        SETEX  "block:user:{username}"  {block_duration}  1
        SETEX  "block:ip:{ip}"          {block_duration}  1

        key = f"attempts:ip_user:{ip}:{username}"
        count = redis.incr(key)
        if count == 1: redis.expire(key, time_window)
        if count >= max: redis.setex(f"block:ip_user:{ip}:{username}", block_dur, 1)

    方案 B: Redis Sorted Set (精确滑动窗口)
        ZADD "attempts:user:{username}" {timestamp} {uuid}
        ZREMRANGEBYSCORE "attempts:user:{username}" 0 {cutoff_ts}
        count = ZCARD "attempts:user:{username}"

    迁移步骤:
    1. 添加 redis 依赖 (redis[hiredis])
    2. 在 Settings 中添加 REDIS_URL 配置
    3. 创建 RedisLoginAttemptTracker 实现相同接口
    4. 在 AuthService 中根据配置选择 tracker 实现
    """

    def __init__(
        self,
        max_attempts_per_ip: int = 200,
        max_attempts_per_user: int = 5,
        max_attempts_per_ip_user: int = 3,
        block_duration: int = 120,
        block_duration_user: int = 300,
        time_window: int = 300,
        ip_whitelist: Optional[List[str]] = None,
    ):
        self.max_attempts_per_ip = max_attempts_per_ip          # IP 级别阈值（極高，學校共享 IP 不應連坐）
        self.max_attempts_per_user = max_attempts_per_user      # 单用户阈值
        self.max_attempts_per_ip_user = max_attempts_per_ip_user  # IP+用户组合阈值
        self.block_duration = block_duration                    # IP 级别锁定时长（短，僅防DDoS）
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
            # ⚠️ 關鍵：IP 級封禁不連坐——如果該用戶本人在此 IP 上沒有失敗記錄，放行
            if ip in self._blocked_ips:
                if now < self._blocked_ips[ip]:
                    # 只有該用戶自己也有失敗記錄時才封禁，避免教室共享 IP 連坐
                    user_has_failures = (
                        ip_user_key in self._ip_user_attempts
                        and len(self._ip_user_attempts[ip_user_key]) > 0
                    )
                    if user_has_failures:
                        retry_after = int(self._blocked_ips[ip] - now)
                        raise AccountLockedError(retry_after=retry_after)
                    # 該用戶無失敗記錄 → 放行（不因別人的錯誤被連坐）
                else:
                    del self._blocked_ips[ip]
                    self._ip_attempts.pop(ip, None)

    def record_failure(self, ip: str, username: str) -> None:
        """记录登录失败"""
        # 白名单 IP 不记录失败，避免学校共享 IP 场景误锁
        if ip in self.ip_whitelist:
            return

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

    def get_all_blocked(self) -> Dict[str, list]:
        """
        获取所有当前被封锁的条目（管理员查看用）

        同时清理已过期的条目，保持内存干净。

        Returns:
            {
                "blocked_users":    [{"username", "blocked_until", "remaining_seconds"}],
                "blocked_ips":      [{"ip", "blocked_until", "remaining_seconds"}],
                "blocked_ip_users": [{"key", "ip", "username", "blocked_until", "remaining_seconds"}]
            }
        """
        now = datetime.now(timezone.utc).timestamp()
        result: Dict[str, list] = {
            "blocked_users": [],
            "blocked_ips": [],
            "blocked_ip_users": [],
        }

        with self._lock:
            # --- blocked_users ---
            expired = [k for k, until in self._blocked_users.items() if until <= now]
            for k in expired:
                del self._blocked_users[k]
                self._user_attempts.pop(k, None)
            for username, until in self._blocked_users.items():
                result["blocked_users"].append({
                    "username": username,
                    "blocked_until": until,
                    "remaining_seconds": int(until - now),
                })

            # --- blocked_ips ---
            expired = [k for k, until in self._blocked_ips.items() if until <= now]
            for k in expired:
                del self._blocked_ips[k]
                self._ip_attempts.pop(k, None)
            for ip, until in self._blocked_ips.items():
                result["blocked_ips"].append({
                    "ip": ip,
                    "blocked_until": until,
                    "remaining_seconds": int(until - now),
                })

            # --- blocked_ip_users ---
            expired = [k for k, until in self._blocked_ip_users.items() if until <= now]
            for k in expired:
                del self._blocked_ip_users[k]
                self._ip_user_attempts.pop(k, None)
            for key, until in self._blocked_ip_users.items():
                parts = key.rsplit(":", 1)
                result["blocked_ip_users"].append({
                    "key": key,
                    "ip": parts[0] if len(parts) == 2 else key,
                    "username": parts[1] if len(parts) == 2 else "",
                    "blocked_until": until,
                    "remaining_seconds": int(until - now),
                })

        return result

    def unblock(self, block_type: str, key: str) -> bool:
        """
        手动解除封锁（管理员操作）

        同时清除对应的失败计数器，防止解锁后一次失败就立刻被重新封锁。

        Args:
            block_type: "user" / "ip" / "ip_user"
            key: 用户名、IP 地址、或 "ip:username" 组合键

        Returns:
            True 表示成功移除，False 表示未找到（可能已过期）
        """
        with self._lock:
            if block_type == "user":
                removed = self._blocked_users.pop(key, None) is not None
                self._user_attempts.pop(key, None)
                return removed
            elif block_type == "ip":
                removed = self._blocked_ips.pop(key, None) is not None
                self._ip_attempts.pop(key, None)
                return removed
            elif block_type == "ip_user":
                removed = self._blocked_ip_users.pop(key, None) is not None
                self._ip_user_attempts.pop(key, None)
                return removed
        return False


# ============================================================
# 安全审计
# ============================================================

class SecurityAuditor:
    """
    安全事件审计日志 — JSON Lines 格式

    标准化事件类型:
    - LOGIN_SUCCESS          用户登录成功
    - LOGIN_FAILURE          用户登录失败
    - LOGOUT                 用户登出
    - LOGOUT_ALL             撤销所有会话
    - TOKEN_REFRESH          Token 刷新成功
    - TOKEN_REFRESH_REPLAY   Token 刷新重放攻击（可能的凭据泄露）
    - PASSWORD_CHANGED       密码修改成功
    - PASSWORD_CHANGE_FAILURE 密码修改失败
    - PASSWORD_RESET         管理员重置密码
    - ACCOUNT_LOCKED         账户被自动锁定
    - ACCOUNT_UNLOCKED       管理员手动解锁账户
    - RATE_LIMIT_TRIGGERED   触发速率限制
    """

    def __init__(self, log_file: str = "logs/security_audit.log"):
        self._logger = logging.getLogger("security_audit")

        # 如果没有 handler，添加文件 handler
        if not self._logger.handlers:
            import os
            os.makedirs(os.path.dirname(log_file), exist_ok=True)
            handler = logging.FileHandler(log_file, encoding="utf-8")
            # JSON lines 格式 — 每行一条完整 JSON，便于机器解析和日志聚合
            handler.setFormatter(logging.Formatter("%(message)s"))
            self._logger.addHandler(handler)
            self._logger.setLevel(logging.INFO)

    def log(
        self,
        event_type: str,
        username: str = "",
        ip: str = "",
        details=None,
    ) -> None:
        """
        记录安全事件（结构化 JSON 格式）

        Args:
            event_type: 事件类型 (LOGIN_SUCCESS, LOGIN_FAILURE, etc.)
            username: 相关用户名
            ip: 客户端 IP
            details: 附加详情 (str 或 dict)
        """
        import json as _json
        from datetime import datetime as _dt, timezone as _tz

        # 兼容旧调用：str → {"message": str}
        if isinstance(details, str):
            extra = {"message": details} if details else {}
        elif isinstance(details, dict):
            extra = details
        else:
            extra = {}

        event = {
            "timestamp": _dt.now(_tz.utc).isoformat(),
            "event": event_type,
            "username": username,
            "ip": ip,
            **extra,
        }

        self._logger.info(_json.dumps(event, ensure_ascii=False))

        # 高危事件同时写入主应用日志（便于运维监控告警）
        _HIGH_SEVERITY = {
            "TOKEN_REFRESH_REPLAY", "ACCOUNT_LOCKED",
            "RATE_LIMIT_TRIGGERED", "LOGIN_FAILURE",
        }
        if event_type in _HIGH_SEVERITY:
            logger.warning(
                "SECURITY_ALERT: %s | user=%s | ip=%s | %s",
                event_type, username, ip, extra,
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
