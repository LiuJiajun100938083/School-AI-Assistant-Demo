"""
系统管理路由 - SystemRouter
=============================
处理系统级 HTTP 端点：
- GET  /api/stats            - 服务器性能指标
- GET  /api/system/monitor   - 综合系统监控
- POST /api/process-temp-file - 临时文件处理
"""

import logging
import os
import platform
import tempfile
import uuid

from fastapi import APIRouter, Request, UploadFile, File

from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["系统"])


@router.get("/api/stats")
async def get_stats(request: Request):
    """获取服务器性能指标"""
    try:
        import psutil
        process = psutil.Process()

        stats = {
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory": {
                "total": psutil.virtual_memory().total,
                "used": psutil.virtual_memory().used,
                "available": psutil.virtual_memory().available,
                "percent": psutil.virtual_memory().percent,
            },
            "process": {
                "memory_rss": process.memory_info().rss,
                "cpu_percent": process.cpu_percent(),
                "threads": process.num_threads(),
            },
            "platform": {
                "system": platform.system(),
                "machine": platform.machine(),
                "python_version": platform.python_version(),
            },
        }
        return success_response(stats)

    except ImportError:
        return success_response({
            "message": "psutil 未安装，性能指标不可用",
            "platform": {
                "system": platform.system(),
                "machine": platform.machine(),
            },
        })
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/system/monitor")
async def get_system_monitor(request: Request):
    """综合系统监控（含数据库连接池状态）"""
    try:
        _verify_request(request)

        monitor = {"status": "running"}

        # 数据库池状态
        try:
            from app.infrastructure.database.pool import get_database_pool
            pool = get_database_pool()
            if pool:
                monitor["database_pool"] = pool.get_status()
        except Exception:
            monitor["database_pool"] = {"status": "unavailable"}

        # 用户统计
        try:
            monitor["user_stats"] = get_services().user.get_user_stats()
        except Exception:
            pass

        # 知识库统计
        try:
            monitor["knowledge_stats"] = get_services().subject.get_statistics()
        except Exception:
            pass

        return success_response(monitor)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/process-temp-file")
async def process_temp_file(request: Request, file: UploadFile = File(...)):
    """
    处理临时文件（上传 → 解析 → 返回文本内容）

    用于对话中上传文档后提取内容
    """
    try:
        _verify_request(request)

        # 验证大小
        content = await file.read()
        max_size = 100 * 1024 * 1024  # 100MB
        if len(content) > max_size:
            return error_response(
                "VALIDATION_ERROR",
                f"文件过大 ({len(content) / 1024 / 1024:.1f}MB)，上限 100MB",
                status_code=400,
            )

        # 保存到临时目录
        temp_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, file.filename)

        with open(temp_path, "wb") as f:
            f.write(content)

        # 尝试使用文件处理器
        extracted_text = ""
        try:
            from file_processor import FileProcessor
            processor = FileProcessor()
            result = processor.process_file(temp_path, file.filename, "temp")
            extracted_text = result.get("content", "") if result else ""
        except ImportError:
            # 回退：纯文本读取
            try:
                extracted_text = content.decode("utf-8", errors="ignore")
            except Exception:
                extracted_text = "[无法解析文件内容]"

        # 清理临时文件
        try:
            os.unlink(temp_path)
            os.rmdir(temp_dir)
        except Exception:
            pass

        return success_response({
            "temp_file_id": temp_id,
            "filename": file.filename,
            "file_size": len(content),
            "content": extracted_text[:50000],  # 截断过长内容
            "content_length": len(extracted_text),
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("处理临时文件失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _verify_request(request: Request):
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供认证令牌")
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]
