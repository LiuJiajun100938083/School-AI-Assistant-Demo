"""
用户服务层 - UserService
========================
负责所有用户管理业务逻辑：
- 用户 CRUD（创建、查询、更新、删除）
- 批量导入（JSON / Excel）
- 用户资料管理
- 角色管理与权限验证
"""

import logging
import re
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.core.exceptions import (
    AuthorizationError,
    ConflictError,
    NotFoundError,
    PasswordTooWeakError,
    ValidationError,
)
from app.core.security import PasswordManager, PasswordPolicy
from app.config.settings import Settings, get_settings
from app.domains.user.repository import UserRepository

logger = logging.getLogger(__name__)

# 用户名正则：仅字母、数字、下划线，3-50 字符
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,50}$')
VALID_ROLES = {"admin", "teacher", "student"}


class UserService:
    """
    用户管理服务

    职责:
    1. 用户查询（列表、详情、按角色筛选）
    2. 用户创建（单个 / 批量 / Excel 导入）
    3. 用户更新（资料修改、状态切换）
    4. 用户删除（级联安全删除）
    5. 数据验证（用户名格式、角色合法性）
    """

    def __init__(
        self,
        user_repo: Optional[UserRepository] = None,
        settings: Optional[Settings] = None,
    ):
        self._repo = user_repo or UserRepository()
        self._settings = settings or get_settings()
        self._password_policy = PasswordPolicy(
            min_length=self._settings.password_min_length,
            require_uppercase=self._settings.password_require_uppercase,
            require_lowercase=self._settings.password_require_lowercase,
            require_numbers=self._settings.password_require_numbers,
            require_special=self._settings.password_require_special,
        )

    # ------------------------------------------------------------------ #
    #                           查询操作                                   #
    # ------------------------------------------------------------------ #

    def get_user(self, username: str) -> Dict[str, Any]:
        """
        获取用户详细信息

        Raises:
            NotFoundError: 用户不存在
        """
        user = self._repo.find_by_username(username)
        if not user:
            raise NotFoundError("用户", username)
        return self._sanitize_user(user)

    def get_user_profile(self, username: str) -> Dict[str, Any]:
        """
        获取用户公开资料（不含密码等敏感字段）

        Raises:
            NotFoundError: 用户不存在
        """
        profile = self._repo.get_user_profile(username)
        if not profile:
            raise NotFoundError("用户", username)
        return profile

    def list_users(
        self,
        role: Optional[str] = None,
        order_by: str = "username ASC",
    ) -> List[Dict[str, Any]]:
        """
        获取用户列表

        Args:
            role: 可选角色筛选 (admin/teacher/student)
            order_by: 排序方式
        """
        if role:
            self._validate_role(role)
            users = self._repo.list_users_by_role(role)
        else:
            users = self._repo.list_all_users(order_by)

        return [self._sanitize_user(u) for u in users]

    def get_user_stats(self) -> Dict[str, int]:
        """
        获取用户统计数据

        Returns:
            dict: {total_admins, total_teachers, total_students, active_students}
        """
        return {
            "total_admins": self._repo.count_by_role("admin"),
            "total_teachers": self._repo.count_by_role("teacher"),
            "total_students": self._repo.count_by_role("student"),
            "active_students": self._repo.count_active_students(),
        }

    # ------------------------------------------------------------------ #
    #                          创建操作                                    #
    # ------------------------------------------------------------------ #

    def create_user(
        self,
        username: str,
        password: str,
        role: str = "student",
        display_name: str = "",
        class_name: str = "",
        class_number: Optional[int] = None,
        email: str = "",
        english_name: str = "",
        card_id: Optional[str] = None,
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        创建单个用户

        Returns:
            dict: 新建用户信息

        Raises:
            ValidationError: 输入不合法
            ConflictError: 用户名已存在
            PasswordTooWeakError: 密码不符合策略
        """
        self._validate_username(username)
        self._validate_role(role)
        errors = self._password_policy.validate(password)
        if errors:
            raise PasswordTooWeakError(errors)

        if self._repo.username_exists(username):
            raise ConflictError("用户", username)

        password_hash = PasswordManager.hash_password(password)
        self._repo.create_user(
            username=username,
            password_hash=password_hash,
            role=role,
            display_name=display_name or username,
            class_name=class_name,
            class_number=class_number,
            email=email,
            english_name=english_name,
            card_id=card_id,
        )

        logger.info("用户创建成功: %s (role=%s, by=%s)", username, role, created_by)
        return self.get_user(username)

    def batch_create_users(
        self,
        users_data: List[Dict[str, str]],
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        批量创建用户（来自 JSON payload）

        Args:
            users_data: [{username, password, role?, display_name?, class_name?}]
            created_by: 操作者

        Returns:
            dict: {success_count, failed_count, failed_details}
        """
        success_count = 0
        failed_details = []
        existing_usernames = set(self._repo.get_all_usernames())

        for item in users_data:
            username = (item.get("username") or "").strip()
            password = item.get("password", "")
            role = item.get("role", "student")
            display_name = item.get("display_name", "")
            class_name = item.get("class_name", "")

            try:
                self._validate_username(username)
                self._validate_role(role)

                if username in existing_usernames:
                    raise ConflictError("用户", username)

                password_hash = PasswordManager.hash_password(password)
                self._repo.create_user(
                    username=username,
                    password_hash=password_hash,
                    role=role,
                    display_name=display_name or username,
                    class_name=class_name,
                )
                existing_usernames.add(username)
                success_count += 1

            except Exception as e:
                failed_details.append({
                    "username": username or "(空)",
                    "error": str(e),
                })

        logger.info(
            "批量创建用户完成: 成功=%d, 失败=%d (by=%s)",
            success_count, len(failed_details), created_by,
        )
        return {
            "success_count": success_count,
            "failed_count": len(failed_details),
            "failed_details": failed_details[:50],
        }

    def batch_import_from_excel(
        self,
        rows: List[Dict[str, str]],
        created_by: str = "system",
    ) -> Dict[str, Any]:
        """
        从 Excel 解析后的行数据批量导入

        Args:
            rows: 每行 = {username, password, display_name, class_name?, role?}
                 调用方负责使用 openpyxl 解析 Excel 并提取行
            created_by: 操作者

        Returns:
            dict: {success_count, failed_count, failed_details}
        """
        success_count = 0
        failed_details = []
        batch_buffer = []
        existing_usernames = set(self._repo.get_all_usernames())

        for idx, row in enumerate(rows, start=2):  # Excel 从第 2 行起
            username = (row.get("username") or "").strip()
            password = (row.get("password") or "").strip()
            display_name = (row.get("display_name") or "").strip()
            class_name = (row.get("class_name") or "").strip()
            role = (row.get("role") or "student").strip()

            if not username:
                failed_details.append({
                    "row": idx, "username": "(空)",
                    "error": "用户名不能为空",
                })
                continue

            if not USERNAME_PATTERN.match(username):
                failed_details.append({
                    "row": idx, "username": username,
                    "error": "用户名格式不正确（仅允许字母、数字、下划线，3-50字符）",
                })
                continue

            if not password:
                failed_details.append({
                    "row": idx, "username": username,
                    "error": "密码不能为空",
                })
                continue

            if username in existing_usernames:
                failed_details.append({
                    "row": idx, "username": username,
                    "error": "用户名已存在",
                })
                continue

            class_number_raw = row.get("class_number") or row.get("班號") or row.get("班号")
            class_number = int(class_number_raw) if class_number_raw else None

            english_name = (
                row.get("english_name") or row.get("英文名")
                or row.get("英文名稱") or ""
            ).strip()
            card_id = (
                row.get("card_id") or row.get("卡號")
                or row.get("卡号") or ""
            ).strip() or None

            password_hash = PasswordManager.hash_password(password)
            batch_buffer.append({
                "username": username,
                "password_hash": password_hash,
                "role": role,
                "display_name": display_name or username,
                "english_name": english_name,
                "card_id": card_id,
                "class_name": class_name,
                "class_number": class_number,
            })
            existing_usernames.add(username)

            # 每 100 条批量写入
            if len(batch_buffer) >= 100:
                count = self._repo.batch_create_users(batch_buffer)
                success_count += count
                batch_buffer.clear()

        # 写入剩余数据
        if batch_buffer:
            count = self._repo.batch_create_users(batch_buffer)
            success_count += count

        logger.info(
            "Excel 导入完成: 成功=%d, 失败=%d (by=%s)",
            success_count, len(failed_details), created_by,
        )
        return {
            "success_count": success_count,
            "failed_count": len(failed_details),
            "failed_details": failed_details[:50],
        }

    # ------------------------------------------------------------------ #
    #                          更新操作                                    #
    # ------------------------------------------------------------------ #

    def update_user(
        self,
        username: str,
        data: Dict[str, Any],
        updated_by: str = "system",
    ) -> Dict[str, Any]:
        """
        更新用户信息

        可更新字段: display_name, email, class_name, role, status

        Raises:
            NotFoundError: 用户不存在
            ValidationError: 输入不合法
        """
        user = self._repo.find_by_username(username)
        if not user:
            raise NotFoundError("用户", username)

        allowed_fields = {
            "display_name", "english_name", "card_id",
            "email", "class_name", "class_number",
            "role", "status", "is_active",
        }
        update_data = {k: v for k, v in data.items() if k in allowed_fields}
        if not update_data:
            raise ValidationError("没有可更新的字段")

        if "role" in update_data:
            self._validate_role(update_data["role"])

        update_data["updated_at"] = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        self._repo.update_user(username, update_data)
        logger.info("用户信息更新: %s (by=%s, fields=%s)",
                     username, updated_by, list(update_data.keys()))
        return self.get_user(username)

    def set_user_status(
        self,
        username: str,
        is_active: bool,
        operator: str = "system",
    ) -> bool:
        """
        启用/禁用用户

        Raises:
            NotFoundError: 用户不存在
            AuthorizationError: 不能禁用最后一个管理员
        """
        user = self._repo.find_by_username(username)
        if not user:
            raise NotFoundError("用户", username)

        if not is_active and user.get("role") == "admin":
            active_admins = len([
                u for u in self._repo.list_users_by_role("admin")
                if u.get("is_active", 1) == 1
            ])
            if active_admins <= 1:
                raise AuthorizationError("不能禁用最后一个管理员账户")

        self._repo.set_active(username, 1 if is_active else 0)
        status_text = "启用" if is_active else "禁用"
        logger.info("用户状态变更: %s → %s (by=%s)", username, status_text, operator)
        return True

    def set_user_locked(
        self,
        username: str,
        is_locked: bool,
        operator: str = "system",
    ) -> bool:
        """
        锁定/解锁用户账户

        Raises:
            NotFoundError: 用户不存在
            AuthorizationError: 不能锁定最后一个管理员
        """
        user = self._repo.find_by_username(username)
        if not user:
            raise NotFoundError("用户", username)

        if is_locked and user.get("role") == "admin":
            if self._repo.count_by_role("admin") <= 1:
                raise AuthorizationError("不能锁定最后一个管理员账户")

        self._repo.set_locked(username, 1 if is_locked else 0)
        status_text = "锁定" if is_locked else "解锁"
        logger.info("用户锁定变更: %s → %s (by=%s)", username, status_text, operator)
        return True

    # ------------------------------------------------------------------ #
    #                          删除操作                                    #
    # ------------------------------------------------------------------ #

    def delete_user(
        self,
        username: str,
        operator: str = "system",
    ) -> Dict[str, Any]:
        """
        删除用户（级联删除相关数据）

        Raises:
            NotFoundError: 用户不存在
            AuthorizationError: 不能删除最后一个管理员
        """
        user = self._repo.find_by_username(username)
        if not user:
            raise NotFoundError("用户", username)

        if user.get("role") == "admin":
            if self._repo.count_by_role("admin") <= 1:
                raise AuthorizationError("不能删除最后一个管理员账户")

        result = self._repo.delete_user_cascade(username)
        logger.info("用户已删除: %s (by=%s, cascade=%s)", username, operator, result)
        return result

    # ------------------------------------------------------------------ #
    #                          内部辅助方法                                 #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _validate_username(username: str) -> None:
        """验证用户名格式"""
        if not username:
            raise ValidationError("用户名不能为空")
        if not USERNAME_PATTERN.match(username):
            raise ValidationError(
                "用户名格式不正确：仅允许字母、数字、下划线，3-50 字符",
                field="username",
            )

    @staticmethod
    def _validate_role(role: str) -> None:
        """验证角色合法性"""
        if role not in VALID_ROLES:
            raise ValidationError(
                f"无效角色 '{role}'，合法值: {', '.join(VALID_ROLES)}",
                field="role",
            )

    @staticmethod
    def _sanitize_user(user: Dict[str, Any]) -> Dict[str, Any]:
        """移除用户字典中的敏感字段"""
        sanitized = dict(user)
        for key in ("password", "password_hash", "salt"):
            sanitized.pop(key, None)
        return sanitized
