"""
认证路由 - AuthRouter
======================
处理所有认证相关的 HTTP 端点：
- POST /api/login          - 用户登录（明文密码）
- POST /api/secure-login   - 安全登录（RSA 加密）
- POST /api/register       - 用户注册
- POST /api/logout         - 用户登出
- GET  /api/verify         - 验证令牌
- POST /api/change-password - 修改密码
- GET  /api/public-key     - 获取 RSA 公钥
- GET  /api/password-policy - 获取密码策略
- POST /api/refresh-token  - 刷新令牌
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.core.dependencies import get_client_info, get_current_user, verify_token
from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["认证"])


# ====================================================================== #
#  登录 / 登出                                                            #
# ====================================================================== #

@router.post("/api/login")
async def login(request: Request):
    """用户登录（明文密码）"""
    try:
        body = await request.json()
        username = body.get("username", "").strip()
        password = body.get("password", "")

        if not username or not password:
            return error_response("VALIDATION_ERROR", "用户名和密码不能为空", status_code=400)

        # 获取客户端信息
        client_ip = _get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")

        result = await get_services().auth.login(
            username=username,
            password=password,
            client_ip=client_ip,
            user_agent=user_agent,
        )
        # login() 已返回 class_name，直接构建 user_info
        user_info = {
            "username": result["username"],
            "role": result["role"],
            "display_name": result["display_name"],
            "class_name": result.get("class_name", ""),
        }

        # 返回扁平结构，兼容前端预期格式
        return {
            "success": True,
            **result,
            "user_info": user_info,
        }

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("登录失败: %s", e)
        return error_response("SERVER_ERROR", "服务器内部错误", status_code=500)


@router.post("/api/secure-login")
async def secure_login(request: Request):
    """安全登录（RSA 加密密码）"""
    try:
        body = await request.json()
        username = body.get("username", "").strip()
        encrypted_password = body.get("password", "")

        if not username or not encrypted_password:
            return error_response("VALIDATION_ERROR", "用户名和密码不能为空", status_code=400)

        client_ip = _get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")

        # 获取解密函数（从旧系统兼容层）
        decrypt_func = _get_decrypt_func()
        if not decrypt_func:
            return error_response(
                "SERVICE_UNAVAILABLE", "RSA 加密服务不可用，请使用普通登录",
                status_code=503,
            )

        result = await get_services().auth.login_with_encrypted_password(
            username=username,
            encrypted_password=encrypted_password,
            decrypt_func=decrypt_func,
            client_ip=client_ip,
            user_agent=user_agent,
        )
        # login() 已返回 class_name，直接构建 user_info
        user_info = {
            "username": result["username"],
            "role": result["role"],
            "display_name": result["display_name"],
            "class_name": result.get("class_name", ""),
        }

        # 返回扁平结构，兼容前端预期格式
        return {
            "success": True,
            **result,
            "user_info": user_info,
        }

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("安全登录失败: %s", e)
        return error_response("SERVER_ERROR", "服务器内部错误", status_code=500)


@router.post("/api/register")
async def register(request: Request):
    """用户注册"""
    try:
        body = await request.json()
        username = body.get("username", "").strip()
        password = body.get("password", "")
        display_name = body.get("display_name", "")
        class_name = body.get("class_name", "")
        email = body.get("email", "")

        if not username or not password:
            return error_response("VALIDATION_ERROR", "用户名和密码不能为空", status_code=400)

        client_ip = _get_client_ip(request)

        # 先验证密码强度
        strength = get_services().auth.validate_password_strength(password)
        if not strength["valid"]:
            return error_response("PASSWORD_TOO_WEAK", "密码不符合要求",
                                  details=strength["errors"], status_code=422)

        # 创建用户
        user = get_services().user.create_user(
            username=username,
            password=password,
            role="student",
            display_name=display_name or username,
            class_name=class_name,
            email=email,
            created_by="self_register",
        )

        # 自动登录
        result = await get_services().auth.login(
            username=username,
            password=password,
            client_ip=client_ip,
        )
        return success_response(result, "注册成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("注册失败: %s", e)
        return error_response("SERVER_ERROR", "服务器内部错误", status_code=500)


@router.post("/api/logout")
async def logout(request: Request):
    """用户登出"""
    try:
        token = _extract_token(request)
        username = ""

        if token:
            try:
                payload = get_services().auth.verify_token(token)
                username = payload.get("username", "")
            except Exception:
                pass

        client_ip = _get_client_ip(request)
        get_services().auth.logout(token or "", username, client_ip)
        return success_response(None, "登出成功")

    except Exception as e:
        logger.warning("登出异常: %s", e)
        return success_response(None, "登出成功")


# ====================================================================== #
#  令牌验证 / 刷新                                                        #
# ====================================================================== #

@router.get("/api/verify")
async def verify_user_token(request: Request):
    """验证令牌有效性"""
    try:
        token = _extract_token(request)
        if not token:
            return error_response("AUTH_REQUIRED", "未提供认证令牌", status_code=401)

        payload = get_services().auth.verify_token(token)

        # 获取完整用户信息（含 login_count, last_login 等前端需要的字段）
        try:
            user = get_services().user.get_user(payload["username"])
            payload.update({
                "display_name": user.get("display_name", ""),
                "class_name": user.get("class_name", ""),
                "email": user.get("email", ""),
                "login_count": user.get("login_count", 0),
                "last_login": user.get("last_login", ""),
            })
        except Exception:
            pass

        return success_response(payload, "令牌有效")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("AUTH_FAILED", "认证失败", status_code=401)


@router.post("/api/refresh-token")
async def refresh_token(request: Request):
    """刷新访问令牌"""
    try:
        body = await request.json()
        refresh = body.get("refresh_token", "")
        if not refresh:
            return error_response("VALIDATION_ERROR", "未提供 refresh_token", status_code=400)

        result = get_services().auth.refresh_token(refresh)
        return success_response(result, "令牌已刷新")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("AUTH_FAILED", "刷新失败", status_code=401)


# ====================================================================== #
#  密码管理                                                               #
# ====================================================================== #

@router.post("/api/change-password")
async def change_password(request: Request):
    """修改密码"""
    try:
        token = _extract_token(request)
        if not token:
            return error_response("AUTH_REQUIRED", "未登录", status_code=401)

        payload = get_services().auth.verify_token(token)
        username = payload["username"]

        body = await request.json()
        current = body.get("current_password") or body.get("old_password", "")
        new_pwd = body.get("new_password", "")

        if not current or not new_pwd:
            return error_response("VALIDATION_ERROR", "请提供当前密码和新密码", status_code=400)

        client_ip = _get_client_ip(request)
        get_services().auth.change_password(username, current, new_pwd, client_ip)
        return success_response(None, "密码修改成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("修改密码失败: %s", e)
        return error_response("SERVER_ERROR", "服务器内部错误", status_code=500)


@router.get("/api/password-policy")
async def get_password_policy():
    """获取密码策略配置"""
    from app.config.settings import get_settings
    settings = get_settings()
    return success_response({
        "min_length": settings.password_min_length,
        "require_uppercase": settings.password_require_uppercase,
        "require_lowercase": settings.password_require_lowercase,
        "require_numbers": settings.password_require_numbers,
        "require_special": settings.password_require_special,
    })


# ====================================================================== #
#  安全信息                                                               #
# ====================================================================== #

@router.get("/api/public-key")
async def get_public_key():
    """获取 RSA 公钥（用于客户端加密密码）"""
    try:
        # 从旧系统兼容层获取公钥
        public_key = _get_public_key()
        if public_key:
            return success_response({"public_key": public_key})
        return error_response("NOT_AVAILABLE", "RSA 公钥不可用", status_code=503)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/security-info")
async def get_security_info(request: Request):
    """获取当前用户的安全信息"""
    try:
        token = _extract_token(request)
        if not token:
            return error_response("AUTH_REQUIRED", "未登录", status_code=401)

        payload = get_services().auth.verify_token(token)
        user = get_services().user.get_user(payload["username"])

        return success_response({
            "username": user.get("username"),
            "role": user.get("role"),
            "last_login": user.get("last_login"),
            "login_count": user.get("login_count", 0),
            "is_active": user.get("is_active", 1),
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _extract_token(request: Request) -> Optional[str]:
    """从请求头或查询参数提取 JWT"""
    # Authorization header
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    # Query parameter fallback
    return request.query_params.get("token")


def _get_client_ip(request: Request) -> str:
    """获取客户端真实 IP"""
    return (
        request.headers.get("x-real-ip")
        or request.headers.get("x-forwarded-for", "").split(",")[0].strip()
        or (request.client.host if request.client else "unknown")
    )


def _get_decrypt_func():
    """获取 RSA 解密函数（兼容旧系统）"""
    try:
        from crypto_utils import crypto_manager
        return crypto_manager.decrypt_password
    except ImportError:
        return None


def _get_public_key() -> Optional[str]:
    """获取 RSA 公钥（兼容旧系统）"""
    try:
        from crypto_utils import crypto_manager
        return crypto_manager.get_public_key_pem()
    except ImportError:
        return None
