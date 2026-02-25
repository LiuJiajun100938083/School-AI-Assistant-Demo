"""
认证服务层 - AuthService
========================
负责所有认证相关业务逻辑：
- 用户登录（明文 / RSA 加密）
- JWT Token 管理（创建、刷新、撤销）
- 密码管理（修改、重置、策略验证）
- 登录安全（尝试限制、IP 追踪、安全审计）
"""

import logging
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

from app.config.settings import Settings, get_settings
from app.core.exceptions import (
    AccountDisabledError,
    AccountLockedError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    PasswordTooWeakError,
    TokenExpiredError,
    TokenRevokedError,
    ValidationError,
)
from app.core.security import (
    JWTManager,
    LoginAttemptTracker,
    PasswordManager,
    PasswordPolicy,
    SecurityAuditor,
)
from app.domains.user.repository import UserRepository

logger = logging.getLogger(__name__)


class AuthService:
    """
    认证服务 - 管理登录、令牌、密码等安全操作

    职责:
    1. 用户认证（验证凭据、生成令牌）
    2. 令牌生命周期管理（创建、刷新、撤销、验证）
    3. 密码管理（修改、重置、策略检查）
    4. 安全审计（登录记录、异常检测）
    """

    def __init__(
        self,
        user_repo: Optional[UserRepository] = None,
        jwt_manager: Optional[JWTManager] = None,
        settings: Optional[Settings] = None,
    ):
        self._settings = settings or get_settings()
        self._user_repo = user_repo or UserRepository()
        self._jwt_manager = jwt_manager
        self._password_manager = PasswordManager()
        self._password_policy = PasswordPolicy(
            min_length=self._settings.password_min_length,
            require_uppercase=self._settings.password_require_uppercase,
            require_lowercase=self._settings.password_require_lowercase,
            require_numbers=self._settings.password_require_numbers,
            require_special=self._settings.password_require_special,
        )
        self._login_tracker = LoginAttemptTracker(
            max_attempts_per_ip=self._settings.login_max_attempts_per_ip,
            max_attempts_per_user=self._settings.login_max_attempts_per_user,
            max_attempts_per_ip_user=self._settings.login_max_attempts_per_ip_user,
            block_duration=self._settings.login_block_duration,
            block_duration_user=self._settings.login_block_duration_user,
            time_window=self._settings.login_time_window,
            ip_whitelist=self._settings.login_ip_whitelist,
        )
        self._auditor = SecurityAuditor()

    # ------------------------------------------------------------------ #
    #                          登录 / 认证                                 #
    # ------------------------------------------------------------------ #

    async def login(
        self,
        username: str,
        password: str,
        client_ip: str = "unknown",
        user_agent: str = "",
    ) -> Dict[str, Any]:
        """
        用户登录 - 验证凭据并返回令牌

        Args:
            username: 用户名
            password: 明文密码
            client_ip: 客户端 IP 地址
            user_agent: 浏览器 User-Agent

        Returns:
            dict: {
                "access_token": str,
                "refresh_token": str,
                "token_type": "bearer",
                "username": str,
                "role": str,
                "display_name": str,
            }

        Raises:
            AccountLockedError: IP 或用户被锁定
            AuthenticationError: 凭据无效
            AccountDisabledError: 账户已禁用
        """
        import asyncio
        loop = asyncio.get_event_loop()

        # 1) 检查登录尝试限制
        self._login_tracker.check_allowed(client_ip, username)

        # 2) 查找用户（在线程池中执行同步 DB 查询，不阻塞事件循环）
        user = await loop.run_in_executor(
            None, self._user_repo.find_by_username, username,
        )
        if not user:
            self._login_tracker.record_failure(client_ip, username)
            self._auditor.log(
                "LOGIN_FAILURE", username, client_ip,
                {"reason": "user_not_found", "user_agent": user_agent},
            )
            raise AuthenticationError("用户名或密码错误")

        # 3) 检查账户状态
        if user.get("is_active") == 0 or user.get("status") == "disabled":
            self._auditor.log(
                "LOGIN_FAILURE", username, client_ip,
                {"reason": "account_disabled"},
            )
            raise AccountDisabledError(username)

        if user.get("is_locked") == 1:
            self._auditor.log(
                "LOGIN_FAILURE", username, client_ip,
                {"reason": "account_locked"},
            )
            raise AccountLockedError(username)

        # 4) 验证密码（bcrypt 在线程池中异步执行，不阻塞事件循环）
        stored_hash = user.get("password") or user.get("password_hash", "")
        if not await self._verify_password_async(password, stored_hash, username):
            self._login_tracker.record_failure(client_ip, username)
            self._auditor.log(
                "LOGIN_FAILURE", username, client_ip,
                {"reason": "invalid_password", "user_agent": user_agent},
            )
            raise AuthenticationError("用户名或密码错误")

        # 5) 登录成功 - 清除失败记录
        self._login_tracker.record_success(client_ip, username)

        # 6) 生成令牌
        role = user.get("role", "student")
        display_name = user.get("display_name") or user.get("name") or username
        tokens = self._create_token_pair(username, role, display_name)

        # 7) 更新登录信息（线程池，不阻塞也不等待）
        try:
            loop.run_in_executor(
                None, self._user_repo.update_login_info, username,
            )
        except Exception as e:
            logger.warning("更新登录信息失败: %s (username=%s)", e, username)

        # 8) 安全审计
        self._auditor.log(
            "LOGIN_SUCCESS", username, client_ip,
            {
                "role": role,
                "user_agent": user_agent,
                "display_name": display_name,
            },
        )

        logger.info("用户登录成功: %s (role=%s, ip=%s)", username, role, client_ip)

        return {
            "access_token": tokens["access_token"],
            "refresh_token": tokens["refresh_token"],
            "token_type": "bearer",
            "username": username,
            "role": role,
            "display_name": display_name,
            "class_name": user.get("class_name", ""),
        }

    async def login_with_encrypted_password(
        self,
        username: str,
        encrypted_password: str,
        decrypt_func,
        client_ip: str = "unknown",
        user_agent: str = "",
    ) -> Dict[str, Any]:
        """
        RSA 加密密码登录

        Args:
            username: 用户名
            encrypted_password: RSA 加密后的密码
            decrypt_func: RSA 解密函数 (callable)
            client_ip: 客户端 IP
            user_agent: 浏览器标识

        Returns:
            同 login() 返回格式

        Raises:
            AuthenticationError: 解密失败或凭据无效
        """
        try:
            password = decrypt_func(encrypted_password)
        except Exception as e:
            logger.warning("RSA 密码解密失败: %s (ip=%s)", e, client_ip)
            raise AuthenticationError("密码解密失败，请刷新页面重试") from e

        return await self.login(username, password, client_ip, user_agent)

    # ------------------------------------------------------------------ #
    #                        令牌管理                                      #
    # ------------------------------------------------------------------ #

    def verify_token(self, token: str) -> Dict[str, Any]:
        """
        验证 JWT 令牌并返回用户信息

        Returns:
            dict: {"username": str, "role": str, "jti": str, "exp": int}

        Raises:
            TokenExpiredError: 令牌已过期
            TokenRevokedError: 令牌已被撤销
            AuthenticationError: 无效令牌
        """
        jwt_mgr = self._get_jwt_manager()
        try:
            payload = jwt_mgr.decode_token(token)
        except TokenExpiredError:
            raise
        except TokenRevokedError:
            raise
        except Exception as e:
            raise AuthenticationError(f"无效的令牌: {e}") from e

        return {
            "username": payload.get("username") or payload.get("sub", ""),
            "role": payload.get("role", "student"),
            "jti": payload.get("jti", ""),
            "exp": payload.get("exp"),
        }

    def refresh_token(self, refresh_token: str) -> Dict[str, str]:
        """
        使用 refresh_token 获取新的 access_token

        Returns:
            dict: {"access_token": str, "token_type": "bearer"}

        Raises:
            AuthenticationError: refresh_token 无效
        """
        payload = self.verify_token(refresh_token)
        username = payload["username"]
        role = payload["role"]

        # 确认用户仍存在且活跃
        user = self._user_repo.find_by_username_active(username)
        if not user:
            raise AuthenticationError("用户不存在或已被禁用")

        jwt_mgr = self._get_jwt_manager()
        new_access = jwt_mgr.create_access_token(username, role)

        return {"access_token": new_access, "token_type": "bearer"}

    def logout(
        self,
        token: str,
        username: str = "",
        client_ip: str = "unknown",
    ) -> bool:
        """
        登出 - 撤销当前令牌

        Returns:
            bool: 是否成功
        """
        jwt_mgr = self._get_jwt_manager()
        try:
            payload = jwt_mgr.decode_token(token)
            jti = payload.get("jti")
            if jti:
                jwt_mgr.revoke_token(jti)
        except Exception as e:
            logger.warning("登出时令牌撤销失败: %s", e)

        self._auditor.log("LOGOUT", username, client_ip, {})
        logger.info("用户登出: %s (ip=%s)", username, client_ip)
        return True

    def logout_all_sessions(
        self,
        username: str,
        client_ip: str = "unknown",
    ) -> bool:
        """撤销指定用户的所有令牌（强制全部登出）"""
        jwt_mgr = self._get_jwt_manager()
        jwt_mgr.revoke_all_user_tokens(username)
        self._auditor.log(
            "LOGOUT_ALL", username, client_ip,
            {"action": "revoke_all_tokens"},
        )
        logger.info("用户所有会话已登出: %s", username)
        return True

    # ------------------------------------------------------------------ #
    #                        密码管理                                      #
    # ------------------------------------------------------------------ #

    def change_password(
        self,
        username: str,
        current_password: str,
        new_password: str,
        client_ip: str = "unknown",
    ) -> bool:
        """
        修改密码

        Raises:
            AuthenticationError: 当前密码错误
            PasswordTooWeakError: 新密码不符合策略
            ValidationError: 新旧密码相同
        """
        # 1) 验证当前密码
        user = self._user_repo.find_by_username(username)
        if not user:
            raise AuthenticationError("用户不存在")

        stored_hash = user.get("password") or user.get("password_hash", "")
        if not self._verify_password(current_password, stored_hash, username):
            self._auditor.log(
                "PASSWORD_CHANGE_FAILURE", username, client_ip,
                {"reason": "wrong_current_password"},
            )
            raise AuthenticationError("当前密码错误")

        # 2) 检查新旧密码是否相同
        if current_password == new_password:
            raise ValidationError("新密码不能与当前密码相同")

        # 3) 验证密码策略
        errors = self._password_policy.validate(new_password)
        if errors:
            raise PasswordTooWeakError(errors)

        # 4) 更新密码
        new_hash = PasswordManager.hash_password(new_password)
        self._user_repo.update_password(username, new_hash)

        # 5) 撤销该用户所有旧令牌（安全措施）
        try:
            jwt_mgr = self._get_jwt_manager()
            jwt_mgr.revoke_all_user_tokens(username)
        except Exception as e:
            logger.warning("密码修改后撤销令牌失败: %s", e)

        self._auditor.log("PASSWORD_CHANGED", username, client_ip, {})
        logger.info("密码修改成功: %s", username)
        return True

    def reset_password(
        self,
        admin_username: str,
        target_username: str,
        new_password: str,
        client_ip: str = "unknown",
    ) -> bool:
        """
        管理员重置用户密码

        Raises:
            NotFoundError: 目标用户不存在
            PasswordTooWeakError: 密码不符合策略
        """
        user = self._user_repo.find_by_username(target_username)
        if not user:
            raise NotFoundError("用户", target_username)

        errors = self._password_policy.validate(new_password)
        if errors:
            raise PasswordTooWeakError(errors)

        new_hash = PasswordManager.hash_password(new_password)
        self._user_repo.update_password(target_username, new_hash)

        try:
            jwt_mgr = self._get_jwt_manager()
            jwt_mgr.revoke_all_user_tokens(target_username)
        except Exception as e:
            logger.warning("密码重置后撤销令牌失败: %s", e)

        self._auditor.log(
            "PASSWORD_RESET", admin_username, client_ip,
            {"target_user": target_username, "admin": admin_username},
        )
        logger.info("管理员 %s 重置了用户 %s 的密码", admin_username, target_username)
        return True

    def validate_password_strength(self, password: str) -> Dict[str, Any]:
        """
        检查密码强度（不执行修改）

        Returns:
            dict: {"valid": bool, "errors": list, "strength": str}
        """
        errors = self._password_policy.validate(password)
        if not errors:
            strength = "strong"
        elif len(errors) <= 1:
            strength = "medium"
        else:
            strength = "weak"

        return {"valid": len(errors) == 0, "errors": errors, "strength": strength}

    # ------------------------------------------------------------------ #
    #                        内部辅助方法                                   #
    # ------------------------------------------------------------------ #

    def _get_jwt_manager(self) -> JWTManager:
        """获取 JWT Manager 实例"""
        if self._jwt_manager:
            return self._jwt_manager
        try:
            from app.core.dependencies import _jwt_manager
            if _jwt_manager:
                return _jwt_manager
        except ImportError:
            pass
        # 回退：直接创建
        self._jwt_manager = JWTManager(
            secret=self._settings.jwt_secret,
            algorithm=self._settings.jwt_algorithm,
            access_expire_hours=self._settings.jwt_access_token_expire_hours,
            refresh_expire_days=self._settings.jwt_refresh_token_expire_days,
        )
        return self._jwt_manager

    def _create_token_pair(
        self, username: str, role: str, display_name: str = "",
    ) -> Dict[str, str]:
        """创建 access + refresh 令牌对"""
        jwt_mgr = self._get_jwt_manager()
        extra = {}
        if display_name:
            extra["display_name"] = display_name

        access_token = jwt_mgr.create_access_token(username, role, extra)
        refresh_token = jwt_mgr.create_refresh_token(username, role)

        return {"access_token": access_token, "refresh_token": refresh_token}

    async def _verify_password_async(
        self, plain: str, stored_hash: str, username: str = "",
    ) -> bool:
        """
        异步验证密码 - bcrypt 在线程池中执行，不阻塞事件循环

        兼容 bcrypt 哈希和明文迁移。
        """
        # bcrypt hash（以 $2b$, $2a$, $2y$ 开头）
        if stored_hash.startswith(("$2b$", "$2a$", "$2y$")):
            return await PasswordManager.verify_password_async(plain, stored_hash)

        # 旧系统明文密码兼容
        if plain == stored_hash:
            # 自动迁移：将明文升级为 bcrypt
            if username:
                try:
                    new_hash = PasswordManager.hash_password(plain)
                    self._user_repo.update_password(username, new_hash)
                    logger.info("已自动迁移明文密码到 bcrypt: %s", username)
                except Exception as e:
                    logger.debug("明文密码自动迁移失败: %s", e)
            return True

        return False

    def _verify_password(
        self, plain: str, stored_hash: str, username: str = "",
    ) -> bool:
        """
        同步验证密码 - 兼容 bcrypt 和明文迁移（供非 async 上下文使用）
        """
        if stored_hash.startswith(("$2b$", "$2a$", "$2y$")):
            return PasswordManager.verify_password(plain, stored_hash)

        if plain == stored_hash:
            if username:
                try:
                    new_hash = PasswordManager.hash_password(plain)
                    self._user_repo.update_password(username, new_hash)
                    logger.info("已自动迁移明文密码到 bcrypt: %s", username)
                except Exception as e:
                    logger.debug("明文密码自动迁移失败: %s", e)
            return True

        return False
