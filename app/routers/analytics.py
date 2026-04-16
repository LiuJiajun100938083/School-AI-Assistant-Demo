"""
学习分析路由 - AnalyticsRouter
================================
处理所有学习分析相关的 HTTP 端点：
- GET  /api/analytics/overview                          - 仪表板概览
- GET  /api/analytics/knowledge                         - 知识掌握度
- GET  /api/analytics/progress                          - 进度曲线
- GET  /api/student/analysis/{subject}                  - 学生分析报告
- GET  /api/student/overall-analysis                    - 学生综合分析
- POST /api/student/analysis/cancel                     - 取消分析
- GET  /api/teacher/student/{id}/analysis/{subject}     - 教师查看学生报告
- GET  /api/teacher/student/{id}/overview               - 教师查看学生概览
- GET  /api/teacher/class/{id}/analysis/{subject}       - 班级分析
- POST /api/teacher/analysis/cancel                     - 教师取消分析
- GET  /api/admin/all-analysis                          - 管理员查看所有分析
"""

import logging
from typing import Dict, Optional

from fastapi import APIRouter, Request

from app.core.exceptions import AppException
from app.core.responses import error_response, success_response
from app.services import get_services

logger = logging.getLogger(__name__)

router = APIRouter(tags=["学习分析"])


# ====================================================================== #
#  仪表板                                                                 #
# ====================================================================== #

@router.get("/api/analytics/overview")
async def get_analytics_overview(request: Request):
    """仪表板概览数据"""
    try:
        _verify_request(request)
        overview = get_services().analytics.get_dashboard_overview()
        return success_response(overview)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/analytics/knowledge")
async def get_knowledge_analytics(request: Request):
    """知识掌握度分析"""
    try:
        username, _ = _verify_request(request)
        subject = request.query_params.get("subject", "")
        mastery = get_services().analytics.get_knowledge_mastery(username, subject)
        return success_response(mastery)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/analytics/progress")
async def get_progress_data(request: Request):
    """学习进度曲线"""
    try:
        username, _ = _verify_request(request)
        # 获取对话统计作为进度数据
        stats = get_services().chat.get_conversation_stats(username)
        distribution = get_services().chat.get_subject_distribution(username)

        return success_response({
            "stats": stats,
            "subject_distribution": distribution,
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/statistics")
async def get_admin_statistics(request: Request):
    """系统全局统计（管理员）"""
    try:
        _verify_request(request)
        overview = get_services().analytics.get_dashboard_overview()
        user_stats = get_services().user.get_user_stats()
        subject_stats = get_services().subject.get_statistics()

        # 前端直接读取 stats.total_documents 等字段（不包装在 data 中）
        result = {}
        if isinstance(overview, dict):
            result.update(overview)
        if isinstance(user_stats, dict):
            result.update(user_stats)
        # 将 subject_stats 中的关键字段提升到顶层
        if isinstance(subject_stats, dict):
            result["total_documents"] = subject_stats.get("total_docs", 0)
            result["total_subjects"] = subject_stats.get("total_subjects", 0)
        result["knowledge_base"] = subject_stats
        return result

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  学生分析报告                                                            #
# ====================================================================== #

@router.get("/api/student/analysis/{subject}")
async def get_student_analysis(subject: str, request: Request):
    """获取当前学生的学习分析报告"""
    try:
        username, _ = _verify_request(request)
        force = request.query_params.get("force", "false").lower() == "true"
        lang = _extract_lang(request)

        report = get_services().analytics.get_student_report(
            username=username,
            subject=subject,
            force_refresh=force,
            lang=lang,
        )
        return success_response(report)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.error("获取学生分析失败: %s", e)
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/student/overall-analysis")
async def get_student_overall_analysis(request: Request):
    """获取学生跨学科综合分析"""
    try:
        username, _ = _verify_request(request)
        lang = _extract_lang(request)

        # 获取所有学科
        subjects = get_services().subject.list_subjects(detailed=False)
        reports = {}
        risk_scores = []

        for subj in subjects:
            code = subj["subject_code"]
            try:
                report = get_services().analytics.get_student_report(
                    username=username, subject=code, lang=lang,
                )
                reports[code] = report
                # 风险分数转换
                risk = report.get("risk_level", "medium")
                risk_scores.append({"low": 1, "medium": 2, "high": 3}.get(risk, 2))
            except Exception:
                pass

        avg_risk = sum(risk_scores) / max(1, len(risk_scores))
        overall_risk = "low" if avg_risk < 1.5 else ("medium" if avg_risk < 2.5 else "high")

        return success_response({
            "username": username,
            "subject_reports": reports,
            "overall_risk_level": overall_risk,
            "subjects_analyzed": len(reports),
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/student/analysis/cancel")
async def cancel_student_analysis(request: Request):
    """取消学生分析任务"""
    try:
        username, _ = _verify_request(request)
        body = await request.json()
        subject = body.get("subject", "")

        cancelled = get_services().analytics.cancel_analysis(username, subject)
        return success_response({"cancelled": cancelled})

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  教师视角                                                               #
# ====================================================================== #

@router.get("/api/teacher/student/{student_id}/analysis/{subject}")
async def get_student_analysis_for_teacher(
    student_id: str, subject: str, request: Request,
):
    """教师查看学生分析报告"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        report = get_services().analytics.get_student_report(
            username=student_id, subject=subject,
        )

        # 添加风险评估
        risk = get_services().analytics.assess_student_risk(student_id)
        report["risk_assessment"] = risk

        return success_response(report)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/teacher/student/{student_id}/overview")
async def get_student_overview(student_id: str, request: Request):
    """教师查看学生概览"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        user = get_services().user.get_user(student_id)
        stats = get_services().chat.get_conversation_stats(student_id)
        risk = get_services().analytics.assess_student_risk(student_id)
        recent = get_services().chat.get_recent_messages(student_id, limit=10)

        return success_response({
            "student": user,
            "conversation_stats": stats,
            "risk_assessment": risk,
            "recent_messages": recent,
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/teacher/class/{class_id}/analysis/{subject}")
async def get_class_analysis(class_id: str, subject: str, request: Request):
    """班级分析"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        analysis = get_services().analytics.get_class_analysis(class_id, subject)
        return success_response(analysis)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/teacher/analysis/cancel")
async def cancel_teacher_analysis(request: Request):
    """教师取消学生分析"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        body = await request.json()
        student = body.get("student_id", "")
        subject = body.get("subject", "")

        cancelled = get_services().analytics.cancel_analysis(student, subject)
        return success_response({"cancelled": cancelled})

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/teacher/classes")
async def get_teacher_classes(request: Request):
    """获取班级列表（教师/管理员用，用于筛选）"""
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        # 获取所有学生的 class_name 去重
        students = get_services().user.list_users(role="student")
        class_set = set()
        for s in students:
            cn = s.get("class_name", "")
            if cn:
                class_set.add(cn)

        classes = sorted(class_set)
        return {
            "classes": [{"id": c, "name": c} for c in classes]
        }

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/teacher/students/summary")
async def get_teacher_students_summary(
    request: Request,
    class_name: Optional[str] = None,
):
    """
    教师获取学生摘要列表（從 student_risk_cache 表讀取）

    Query params:
        class_name: 可選班級篩選；不傳則回傳全校（用於管理員）

    每位學生的 risk_level/summary 由背景任務每日 03:00 預先計算寫入快取，
    這個端點只讀快取表，<10ms 完成。教師按「刷新數據」按鈕會呼叫
    /risk/refresh 強制重跑。
    """
    try:
        _, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        result = get_services().risk_cache.get_summary_by_class(class_name)
        # 對齊舊回應格式：每筆 row 加上 display_name 欄位（cache 用 student_name）
        students = []
        for r in result.get("students", []):
            students.append({
                "student_id": r.get("student_id", ""),
                "display_name": r.get("student_name", ""),
                "class_name": r.get("class_name", ""),
                "risk_level": r.get("risk_level", "unknown"),
                "risk_score": r.get("risk_score", 0),
                "risk_factors": r.get("risk_factors", []),
                "overall_summary": r.get("overall_summary", ""),
                "preview_status": r.get("preview_status", ""),
                "total_conversations": r.get("total_conversations", 0),
                "total_messages": r.get("total_messages", 0),
                "last_active": r.get("last_active"),
                "last_updated": r.get("updated_at"),
            })
        return {
            "students": students,
            "count": result.get("count", 0),
            "last_refresh": result.get("last_refresh"),
        }

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/teacher/students/at_risk")
async def get_teacher_top_at_risk(
    request: Request,
    limit: int = 10,
):
    """
    取全校風險最高的學生 Top N（從快取讀，<10ms）

    Query params:
        limit: 1-50，預設 10
    """
    try:
        _risk_username, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        if limit < 1:
            limit = 1
        if limit > 50:
            limit = 50

        result = get_services().risk_cache.get_top_at_risk(limit)
        students = []
        for r in result.get("students", []):
            students.append({
                "student_id": r.get("student_id", ""),
                "display_name": r.get("student_name", ""),
                "class_name": r.get("class_name", ""),
                "risk_level": r.get("risk_level", "unknown"),
                "risk_score": r.get("risk_score", 0),
                "risk_factors": r.get("risk_factors", []),
                "overall_summary": r.get("overall_summary", ""),
                "total_conversations": r.get("total_conversations", 0),
                "last_active": r.get("last_active"),
                "last_updated": r.get("updated_at"),
            })
        # 宠物金币：教师查看风险学生 +3（每天一次）
        try:
            from app.domains.pet.hooks import try_award_coins_by_username
            from datetime import date as _d
            try_award_coins_by_username(_risk_username, "review_at_risk", f"risk_{_d.today()}", "teacher")
        except Exception:
            pass

        return {
            "students": students,
            "count": result.get("count", 0),
            "last_refresh": result.get("last_refresh"),
        }

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# 強制刷新的速率限制（每位用戶 60 秒一次）
_force_refresh_last_ts: Dict[str, float] = {}
_FORCE_REFRESH_COOLDOWN = 60.0


@router.post("/api/teacher/students/risk/refresh")
async def force_refresh_student_risk(request: Request):
    """
    強制立即重新計算所有學生的風險快取（教師按「刷新數據」按鈕用）。

    通常每天 03:00 會自動跑；這個端點是給教師需要立刻看到最新資料時用。
    每位用戶 60 秒只能呼叫一次（rate limit）。
    """
    try:
        username, role = _verify_request(request)
        if role not in ("admin", "teacher"):
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要教师或管理员权限")

        # Rate limit
        import time as _time
        now = _time.monotonic()
        last = _force_refresh_last_ts.get(username, 0.0)
        if now - last < _FORCE_REFRESH_COOLDOWN:
            wait = _FORCE_REFRESH_COOLDOWN - (now - last)
            return error_response(
                "RATE_LIMIT",
                f"請等待 {wait:.0f} 秒後再試",
                status_code=429,
            )
        _force_refresh_last_ts[username] = now

        # 在 threadpool 跑（refresh_all 是同步、IO 重）
        import asyncio as _aio
        result = await _aio.to_thread(
            lambda: get_services().risk_cache.refresh_all()
        )
        return {"success": True, "data": result}

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/admin/all-analysis")
async def get_all_analysis(request: Request):
    """管理员获取所有学生分析汇总"""
    try:
        _, role = _verify_request(request)
        if role != "admin":
            from app.core.exceptions import AuthorizationError
            raise AuthorizationError("需要管理员权限")

        summaries = get_services().analytics.get_all_students_summary()
        return success_response(summaries)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  辅助函数                                                               #
# ====================================================================== #

def _verify_request(request: Request):
    """验证请求并返回 (username, role)"""
    auth = request.headers.get("authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else request.query_params.get("token")
    if not token:
        from app.core.exceptions import AuthenticationError
        raise AuthenticationError("未提供认证令牌")
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]


def _extract_lang(request: Request) -> str:
    """
    从请求中提取语言偏好。
    优先级：query param ?lang= > Accept-Language header > 默认 zh
    """
    # 1) 显式 query param
    lang = request.query_params.get("lang", "")
    if lang in ("en", "zh"):
        return lang
    # 2) Accept-Language header
    accept = request.headers.get("accept-language", "")
    if accept.startswith("en"):
        return "en"
    return "zh"
