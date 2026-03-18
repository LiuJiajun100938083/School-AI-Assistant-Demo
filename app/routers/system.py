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


@router.get("/api/admin/ai-monitor")
async def get_ai_monitor(request: Request):
    """AI 調度監控面板數據"""
    try:
        _verify_request(request)

        result = {}

        # 1. AI gate 詳細統計
        try:
            from app.core.ai_gate import get_ai_gate_detailed_stats
            result["ai_gate"] = await get_ai_gate_detailed_stats()
        except Exception as e:
            result["ai_gate"] = {"error": str(e)}

        # 2. 伺服器資源
        try:
            import psutil
            mem = psutil.virtual_memory()
            result["server"] = {
                "cpu_percent": psutil.cpu_percent(interval=0.1),
                "memory_percent": mem.percent,
                "memory_used_gb": round(mem.used / (1024 ** 3), 1),
                "memory_total_gb": round(mem.total / (1024 ** 3), 1),
                "memory_available_gb": round(mem.available / (1024 ** 3), 1),
            }
        except ImportError:
            result["server"] = {"error": "psutil not installed"}

        # 3. Ollama 連通性 + 運行態
        ollama_result = {
            "connected": False,
            "runtime_available": False,
            "latency_ms": None,
            "installed_models": [],
            "running_models": [],
            "last_error": None,
        }
        try:
            from app.core.ai_gate import get_shared_ollama_client
            from app.config.settings import get_settings
            import time as _time

            client = get_shared_ollama_client()
            t0 = _time.monotonic()

            # /api/tags — 已安裝模型
            try:
                resp_tags = await client.get("/api/tags", timeout=2.0)
                if resp_tags.status_code == 200:
                    tags_data = resp_tags.json()
                    ollama_result["installed_models"] = [
                        m.get("name", "") for m in tags_data.get("models", [])
                    ]
                    ollama_result["connected"] = True
            except Exception as e:
                ollama_result["last_error"] = f"tags: {e}"

            # /api/ps — 運行中模型
            try:
                resp_ps = await client.get("/api/ps", timeout=2.0)
                if resp_ps.status_code == 200:
                    ps_data = resp_ps.json()
                    ollama_result["running_models"] = [
                        {
                            "name": m.get("name", ""),
                            "size_vram": m.get("size_vram", 0),
                            "size": m.get("size", 0),
                        }
                        for m in ps_data.get("models", [])
                    ]
                    ollama_result["runtime_available"] = True
                    ollama_result["connected"] = True
            except Exception as e:
                err = f"ps: {e}"
                ollama_result["last_error"] = (
                    f"{ollama_result['last_error']}; {err}"
                    if ollama_result["last_error"] else err
                )

            latency = round((_time.monotonic() - t0) * 1000)
            ollama_result["latency_ms"] = latency

        except Exception as e:
            ollama_result["last_error"] = str(e)

        result["ollama"] = ollama_result

        # 4. 配置信息
        try:
            from app.config.settings import get_settings
            s = get_settings()
            result["config"] = {
                "ai_concurrent_limit": s.ai_concurrent_limit,
                "llm_local_model": s.llm_local_model,
                "llm_local_base_url": s.llm_local_base_url,
            }
        except Exception:
            pass

        return success_response(result)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/ai-task/force-release")
async def force_release_task(request: Request):
    """管理員強制釋放單個運行中的任務（僅釋放調度容量，不終止底層執行）"""
    try:
        username, _ = _verify_request(request)

        body = await request.json()
        task_id = body.get("task_id")
        if task_id is None:
            return error_response("INVALID_PARAM", "task_id is required", status_code=400)

        from app.core.ai_gate import get_scheduler
        scheduler = get_scheduler()
        result = await scheduler.force_release(int(task_id))

        if result is None:
            return error_response(
                "NOT_FOUND",
                f"Task {task_id} not found in running tasks",
                status_code=404,
            )

        logger.warning(
            "Admin %s force-released task: id=%d name=%s ran=%.1fs",
            username, task_id, result["task_name"], result["running_seconds"],
        )
        return success_response({"released": result})

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/admin/ai-task/force-release-stale")
async def force_release_stale_tasks(request: Request):
    """管理員批量強制釋放超時任務"""
    try:
        username, _ = _verify_request(request)

        body = await request.json()
        max_seconds = body.get("max_seconds", 1800)

        from app.core.ai_gate import get_scheduler
        scheduler = get_scheduler()
        released = await scheduler.force_release_stale(max_seconds=float(max_seconds))

        if released:
            logger.warning(
                "Admin %s force-released %d stale tasks (threshold=%ds): %s",
                username, len(released), max_seconds,
                ", ".join(f"{r['task_name']}(id={r['id']})" for r in released),
            )

        return success_response({
            "released_count": len(released),
            "released": released,
        })

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
            from llm.rag.file_processor import FileProcessor
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
