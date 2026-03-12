"""
課室日誌路由
=============
教師掃碼課堂評級 + Review 查看 + 管理員 QR 碼 / Reviewer 管理。

教師端點（需教師/管理員登入）:
    POST  /api/class-diary/entries              提交評級
    GET   /api/class-diary/entries/by-class      查某班某日記錄（公開）
    PUT   /api/class-diary/entries/{id}          修改記錄

需登入端點:
    GET   /api/class-diary/review               Review 記錄
    GET   /api/class-diary/review/classes        班級列表
    GET   /api/class-diary/review/summary        匯總

管理員端點:
    GET   /api/class-diary/admin/qr/{code}       生成 QR 碼
    GET   /api/class-diary/admin/qr/batch        批量 QR ZIP
    GET   /api/class-diary/admin/reviewers       列出 reviewer
    POST  /api/class-diary/admin/reviewers       添加 reviewer
    DELETE /api/class-diary/admin/reviewers/{u}   移除 reviewer
    GET   /api/class-diary/admin/classes          班級列表
"""

import io
import json
import logging
from datetime import date
from typing import Optional
from urllib.parse import quote

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.core.exceptions import AppException, AuthorizationError
from app.core.responses import error_response, success_response
from app.domains.class_diary.schemas import (
    CreateEntryRequest,
    ReviewerRequest,
    UpdateEntryRequest,
)
logger = logging.getLogger(__name__)

router = APIRouter(tags=["課室日誌"])


# ====================================================================== #
#  工具函數                                                                #
# ====================================================================== #

def _get_service():
    from app.services.container import get_services
    return get_services().class_diary


def _verify_request(request: Request):
    """從 JWT 提取 (username, role)"""
    from app.services.container import get_services
    token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        token = request.query_params.get("token", "")
    if not token:
        raise AppException(code="UNAUTHORIZED", message="未登入", status_code=401)
    payload = get_services().auth.verify_token(token)
    return payload["username"], payload["role"]


def _verify_admin(request: Request):
    username, role = _verify_request(request)
    if role != "admin":
        raise AuthorizationError("需要管理員權限")
    return username, role


def _verify_reviewer(request: Request):
    """驗證 reviewer 或 admin 權限"""
    username, role = _verify_request(request)
    service = _get_service()
    if not service.check_review_access(username, role):
        from app.domains.class_diary.exceptions import ReviewAccessDeniedError
        raise ReviewAccessDeniedError()
    return username, role


def _get_base_url(request: Request) -> str:
    """從請求中提取站點根 URL"""
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("x-forwarded-host", request.headers.get("host", "localhost"))
    return f"{scheme}://{host}"


# ====================================================================== #
#  公開端點 — 教師掃碼提交（需登入）                                          #
# ====================================================================== #

@router.post("/api/class-diary/entries")
async def create_entry(request: Request):
    """提交課堂評級（需教師/管理員登入）"""
    try:
        username, role = _verify_request(request)
        if role == "student":
            raise AppException(
                code="FORBIDDEN",
                message="僅限教師或管理員提交評級",
                status_code=403,
            )

        body = await request.json()
        entry_data = CreateEntryRequest(**body)

        user_agent = request.headers.get("User-Agent", "")

        service = _get_service()
        result = service.create_entry(entry_data.model_dump(), user_agent, submitted_by=username)

        return success_response(result, "評級提交成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("提交評級失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/entries/by-class")
async def get_entries_by_class(
    class_code: str = Query(..., description="班級代碼"),
    entry_date: str = Query(..., description="日期 YYYY-MM-DD"),
):
    """查詢某班某日的評級記錄（公開，用於教師掃碼後查看已填記錄）"""
    try:
        service = _get_service()
        entries = service.get_entries_by_class_date(class_code, entry_date)

        for entry in entries:
            if "signature" in entry:
                entry["signature"] = bool(entry.get("signature"))

        return success_response(entries)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢記錄失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/classes")
async def get_classes_public():
    """公開端點 — 取得班級列表（供移動端表單選擇班級）"""
    try:
        service = _get_service()
        classes = service.get_all_classes()
        return success_response(classes)
    except Exception as e:
        logger.exception("取得班級列表失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/students/{class_code}")
async def get_students_for_class(class_code: str):
    """公開端點 — 取得該班學生列表（供移動端表單選擇學生）"""
    try:
        service = _get_service()
        students = service.get_students_for_class(class_code)
        return success_response(students)
    except Exception as e:
        logger.exception("取得學生列表失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/class-diary/entries/{entry_id}")
async def update_entry(entry_id: int, request: Request):
    """修改已提交的評級記錄（需教師/管理員登入）"""
    try:
        username, role = _verify_request(request)
        if role == "student":
            raise AppException(
                code="FORBIDDEN",
                message="僅限教師或管理員修改記錄",
                status_code=403,
            )

        service = _get_service()
        existing = service.get_entry(entry_id)

        if role != "admin":
            if not existing.get("submitted_by"):
                raise AuthorizationError("舊記錄僅限管理員修改")
            if existing["submitted_by"] != username:
                raise AuthorizationError("只能修改自己提交的記錄")

        body = await request.json()
        update_data = UpdateEntryRequest(**body)

        result = service.update_entry(entry_id, update_data.model_dump(exclude_none=True))

        return success_response(result, "記錄更新成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("更新記錄失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/class-diary/entries/{entry_id}")
async def delete_entry_by_teacher(entry_id: int, request: Request):
    """刪除記錄（教師只能刪自己的，管理員可刪任何）"""
    try:
        username, role = _verify_request(request)
        if role == "student":
            raise AppException(
                code="FORBIDDEN",
                message="僅限教師或管理員刪除記錄",
                status_code=403,
            )

        service = _get_service()
        existing = service.get_entry(entry_id)

        if role != "admin":
            if not existing.get("submitted_by"):
                raise AuthorizationError("舊記錄僅限管理員刪除")
            if existing["submitted_by"] != username:
                raise AuthorizationError("只能刪除自己提交的記錄")

        logger.info(
            "Entry %d deleted by %s (was: class=%s, date=%s, period=%d-%d, subject=%s)",
            entry_id, username,
            existing.get("class_code"), existing.get("entry_date"),
            existing.get("period_start", 0), existing.get("period_end", 0),
            existing.get("subject"),
        )

        service.delete_entry(entry_id)
        return success_response(None, "記錄已刪除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("刪除記錄失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  Review 端點（需登入 + reviewer 權限）                                    #
# ====================================================================== #

@router.get("/api/class-diary/review")
async def review_entries(
    request: Request,
    class_code: Optional[str] = Query(None, description="班級代碼"),
    entry_date: Optional[str] = Query(None, description="日期 YYYY-MM-DD"),
):
    """查看課堂評級記錄（需 reviewer 或 admin 權限）"""
    try:
        _verify_reviewer(request)

        service = _get_service()

        if not entry_date:
            entry_date = str(date.today())

        if class_code:
            entries = service.get_entries_by_class_date(class_code, entry_date)
        else:
            entries = service.get_entries_by_date(entry_date)

        return success_response(entries)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("Review 查詢失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/classes")
async def review_classes(
    request: Request,
    entry_date: Optional[str] = Query(None, description="日期 YYYY-MM-DD"),
):
    """獲取某日有記錄的班級列表"""
    try:
        _verify_reviewer(request)

        service = _get_service()
        if not entry_date:
            entry_date = str(date.today())

        classes = service.get_classes_with_entries(entry_date)
        return success_response(classes)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢班級列表失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/summary")
async def review_summary(
    request: Request,
    class_code: str = Query(..., description="班級代碼"),
    entry_date: str = Query(..., description="日期 YYYY-MM-DD"),
):
    """某班某日的匯總數據"""
    try:
        _verify_reviewer(request)

        service = _get_service()
        summary = service.get_summary(class_code, entry_date)
        return success_response(summary)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢匯總失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/check-access")
async def check_review_access(request: Request):
    """檢查當前用戶的 review 權限等級"""
    try:
        username, role = _verify_request(request)
        service = _get_service()
        tier_info = service.get_user_permission_tier(username, role)
        return success_response(tier_info)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/dashboard-data")
async def get_dashboard_data(
    request: Request,
    mode: str = Query(..., description="single_day 或 date_range"),
    entry_date: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
):
    """統一數據 API — 按 tier 返回聚合數據"""
    try:
        username, role = _verify_request(request)
        service = _get_service()
        tier = service.get_user_permission_tier(username, role)

        if not tier["has_access"]:
            from app.domains.class_diary.exceptions import ReviewAccessDeniedError
            raise ReviewAccessDeniedError()

        # ---------- 取得 entries ----------
        if mode == "single_day":
            if not entry_date:
                entry_date = str(date.today())
            entries = service.get_entries_by_date(entry_date)
        elif mode == "date_range":
            if not start_date or not end_date:
                return error_response(
                    "INVALID_PARAMS", "date_range 模式需要 start_date 和 end_date",
                    status_code=400,
                )
            if start_date > end_date:
                return error_response(
                    "INVALID_PARAMS", "start_date 不能晚於 end_date",
                    status_code=400,
                )
            entries = service.get_all_entries_by_date_range(start_date, end_date)
        else:
            return error_response(
                "INVALID_PARAMS", "mode 必須為 single_day 或 date_range",
                status_code=400,
            )

        # ---------- 班主任：過濾 entries ----------
        if tier["tier"] == "class_teacher" and tier["own_classes"]:
            own_set = set(tier["own_classes"])
            entries = [e for e in entries if e.get("class_code") in own_set]

        # ---------- 聚合 ----------
        if mode == "single_day":
            agg = service.aggregate_single_day(entries)
        else:
            agg = service.aggregate_date_range(entries)

        # ---------- 構建穩定 response ----------
        overview = agg.get("overview", {})
        charts = {}
        tables = {}

        if tier["tier"] != "report_recipient":
            charts["class_stats"] = agg.get("class_stats", [])
            if mode == "date_range":
                daily_summary = agg.get("daily_summary", [])
                for item in daily_summary:
                    if "date" in item and not isinstance(item["date"], str):
                        item["date"] = str(item["date"])
                charts["daily_summary"] = daily_summary
                charts["period_analysis"] = agg.get("period_analysis", [])
                charts["subject_analysis"] = agg.get("subject_analysis", [])
                charts["weekday_analysis"] = agg.get("weekday_analysis", [])
                charts["submitter_analysis"] = agg.get("submitter_analysis", [])
                charts["reason_analysis"] = agg.get("reason_analysis", [])

            if tier["can_view_raw_data"]:
                tables["records"] = agg.get("records", [])
                if mode == "date_range":
                    tables["student_records"] = agg.get("student_records", [])
                    tables["risk_students"] = agg.get("risk_students", [])

        return success_response({
            "permission": tier,
            "mode": mode,
            "overview": overview,
            "charts": charts,
            "tables": tables,
        })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢儀表板數據失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  管理員端點                                                              #
# ====================================================================== #

@router.get("/api/class-diary/admin/classes")
async def admin_list_classes(request: Request):
    """列出所有班級（管理員用，含班主任資訊）"""
    try:
        _verify_admin(request)
        service = _get_service()
        classes = service.list_admin_classes()
        return success_response(classes)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢班級失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/admin/qr/batch")
async def batch_qr(request: Request):
    """批量生成所有班級 QR 碼 ZIP（必須在 {class_code} 路由之前）"""
    try:
        _verify_admin(request)

        service = _get_service()
        classes = service.get_all_classes()
        class_codes = [c["class_code"] for c in classes]

        if not class_codes:
            return error_response("NO_CLASSES", "沒有班級記錄", status_code=404)

        base_url = _get_base_url(request)
        zip_data = service.generate_qr_codes_zip(class_codes, base_url)

        return Response(
            content=zip_data,
            media_type="application/zip",
            headers={
                "Content-Disposition": 'attachment; filename="class_diary_qrcodes.zip"'
            },
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("批量生成 QR 碼失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/admin/qr/{class_code}")
async def generate_qr(class_code: str, request: Request):
    """為指定班級生成 QR 碼 PNG"""
    try:
        _verify_admin(request)

        service = _get_service()
        base_url = _get_base_url(request)
        png_data = service.generate_qr_code(class_code, base_url)

        return Response(
            content=png_data,
            media_type="image/png",
            headers={"Content-Disposition": f'inline; filename="QR_{class_code}.png"'},
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("生成 QR 碼失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ---------- Reviewer 管理 ---------- #

@router.get("/api/class-diary/admin/reviewers")
async def list_reviewers(request: Request):
    """列出所有 reviewer"""
    try:
        _verify_admin(request)
        service = _get_service()
        reviewers = service.get_all_reviewers()
        return success_response(reviewers)

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/class-diary/admin/reviewers")
async def add_reviewer(request: Request):
    """添加 reviewer"""
    try:
        admin_user, _ = _verify_admin(request)
        body = await request.json()
        data = ReviewerRequest(**body)

        service = _get_service()
        added = service.add_reviewer(data.username, admin_user)

        if not added:
            return error_response("ALREADY_EXISTS", "該用戶已是 Reviewer", status_code=409)

        return success_response({"username": data.username}, "Reviewer 添加成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/class-diary/admin/reviewers/{username}")
async def remove_reviewer(username: str, request: Request):
    """移除 reviewer"""
    try:
        _verify_admin(request)
        service = _get_service()
        removed = service.remove_reviewer(username)

        if not removed:
            return error_response("NOT_FOUND", "該用戶不是 Reviewer", status_code=404)

        return success_response(None, "Reviewer 已移除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/class-diary/admin/entries/{entry_id}")
async def admin_delete_entry(entry_id: int, request: Request):
    """管理員刪除記錄"""
    try:
        _verify_admin(request)
        service = _get_service()
        service.delete_entry(entry_id)
        return success_response(None, "記錄已刪除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ---------- 班級管理 ---------- #

@router.post("/api/class-diary/admin/classes")
async def create_class(request: Request):
    """創建班級"""
    try:
        _verify_admin(request)
        body = await request.json()

        class_code = (body.get("class_code") or "").strip()
        class_name = (body.get("class_name") or "").strip()
        grade = (body.get("grade") or "").strip()

        if not class_code:
            return error_response("VALIDATION_ERROR", "班級代碼不可為空", status_code=400)
        if not class_name:
            class_name = class_code

        service = _get_service()
        result = service.create_class(class_code, class_name, grade)

        return success_response(result, "班級創建成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("創建班級失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.put("/api/class-diary/admin/classes/{class_code}/teachers")
async def update_class_teachers(class_code: str, request: Request):
    """設定班級的班主任和副班主任"""
    try:
        _verify_admin(request)
        body = await request.json()

        teacher_username = (body.get("teacher_username") or "").strip() or None
        vice_teacher_username = (body.get("vice_teacher_username") or "").strip() or None

        service = _get_service()
        result = service.update_class_teachers(class_code, teacher_username, vice_teacher_username)

        return success_response(result, "班主任設定已更新")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("更新班主任失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/class-diary/admin/classes/{class_code}")
async def delete_class(class_code: str, request: Request):
    """刪除班級"""
    try:
        _verify_admin(request)

        service = _get_service()
        service.delete_class(class_code)

        return success_response(None, "班級已刪除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  報告接收人管理                                                           #
# ====================================================================== #

@router.get("/api/class-diary/admin/report-recipients")
async def list_report_recipients(request: Request):
    """列出所有報告接收人"""
    try:
        _verify_admin(request)
        service = _get_service()
        recipients = service.list_report_recipients()
        return success_response(recipients)
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.post("/api/class-diary/admin/report-recipients")
async def add_report_recipient(request: Request):
    """添加報告接收人"""
    try:
        admin_user, _ = _verify_admin(request)
        body = await request.json()
        username = (body.get("username") or "").strip()
        if not username:
            return error_response("VALIDATION_ERROR", "用戶名不可為空", status_code=400)

        service = _get_service()
        added = service.add_report_recipient(username, admin_user)
        if not added:
            return error_response("ALREADY_EXISTS", "該用戶已是報告接收人", status_code=409)

        return success_response({"username": username}, "報告接收人添加成功")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.delete("/api/class-diary/admin/report-recipients/{username}")
async def remove_report_recipient(username: str, request: Request):
    """移除報告接收人"""
    try:
        _verify_admin(request)
        service = _get_service()
        service.remove_report_recipient(username)
        return success_response(None, "報告接收人已移除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  每日報告 — 生成 & 查詢                                                  #
# ====================================================================== #

@router.post("/api/class-diary/admin/generate-report")
async def admin_generate_report(request: Request):
    """管理員手動觸發報告生成（異步，立即返回）"""
    try:
        _verify_admin(request)
        body = await request.json()
        report_date = (body.get("report_date") or str(date.today())).strip()

        import asyncio
        service = _get_service()
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, service.generate_daily_report_sync, report_date)

        return success_response({"report_date": report_date, "status": "generating"}, "報告生成已啟動")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/daily-report")
async def get_daily_report(
    request: Request,
    entry_date: Optional[str] = Query(None, description="日期 YYYY-MM-DD"),
):
    """獲取每日 AI 報告（根據 tier 返回完整版或摘要版）"""
    try:
        username, role = _verify_request(request)
        service = _get_service()
        tier = service.get_user_permission_tier(username, role)

        if not tier["has_access"]:
            from app.domains.class_diary.exceptions import ReviewAccessDeniedError
            raise ReviewAccessDeniedError()

        if not entry_date:
            entry_date = str(date.today())

        report = service.get_daily_report(entry_date)

        is_reviewer = tier["tier"] in ("admin", "reviewer")
        is_recipient = tier["can_view_ai_report"]

        if report:
            anomalies = []
            if report.get("anomalies_json"):
                try:
                    anomalies = json.loads(report["anomalies_json"])
                except (json.JSONDecodeError, TypeError):
                    pass

            if tier["tier"] == "report_recipient":
                text = report.get("summary_text") or report["report_text"]
            else:
                text = report["report_text"]

            return success_response({
                "report_text": text,
                "anomalies": anomalies if is_reviewer else [],
                "status": report["status"],
                "is_recipient": is_recipient,
                "is_reviewer": is_reviewer,
            })
        else:
            return success_response({
                "report_text": None,
                "anomalies": [],
                "status": "none",
                "is_recipient": is_recipient,
                "is_reviewer": is_reviewer,
            })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢每日報告失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  日期範圍 AI 報告                                                         #
# ====================================================================== #

@router.post("/api/class-diary/admin/generate-range-report")
async def admin_generate_range_report(request: Request):
    """管理員觸發日期範圍報告生成"""
    try:
        admin_user, _ = _verify_admin(request)
        body = await request.json()
        start_date = (body.get("start_date") or "").strip()
        end_date = (body.get("end_date") or "").strip()

        if not start_date or not end_date:
            return error_response("VALIDATION_ERROR", "需要 start_date 和 end_date", status_code=400)
        if start_date > end_date:
            return error_response("VALIDATION_ERROR", "start_date 不能晚於 end_date", status_code=400)

        import asyncio
        service = _get_service()
        loop = asyncio.get_event_loop()
        loop.run_in_executor(
            None, service.generate_range_report_sync, start_date, end_date, admin_user
        )

        return success_response(
            {"start_date": start_date, "end_date": end_date, "status": "generating"},
            "範圍報告生成已啟動",
        )
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/range-report")
async def get_range_report(
    request: Request,
    start_date: str = Query(..., description="開始日期"),
    end_date: str = Query(..., description="結束日期"),
):
    """獲取日期範圍 AI 報告（根據 tier 返回完整版或摘要版）"""
    try:
        username, role = _verify_request(request)
        service = _get_service()
        tier = service.get_user_permission_tier(username, role)

        if not tier["has_access"]:
            from app.domains.class_diary.exceptions import ReviewAccessDeniedError
            raise ReviewAccessDeniedError()

        report = service.get_range_report(start_date, end_date)

        is_reviewer = tier["tier"] in ("admin", "reviewer")

        if report:
            anomalies = []
            if report.get("anomalies_json"):
                try:
                    anomalies = json.loads(report["anomalies_json"])
                except (json.JSONDecodeError, TypeError):
                    pass

            if tier["tier"] == "report_recipient":
                text = report.get("summary_text") or report["report_text"]
            else:
                text = report["report_text"]

            return success_response({
                "report_text": text,
                "anomalies": anomalies if is_reviewer else [],
                "status": report["status"],
                "is_reviewer": is_reviewer,
            })
        else:
            return success_response({
                "report_text": None,
                "anomalies": [],
                "status": "none",
                "is_reviewer": is_reviewer,
            })

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢範圍報告失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  匯出 XLSX                                                              #
# ====================================================================== #

@router.get("/api/class-diary/review/export")
async def export_entries_xlsx(
    request: Request,
    entry_date: Optional[str] = Query(None, description="日期 YYYY-MM-DD"),
):
    """匯出當天所有班級的記錄為 XLSX"""
    try:
        _verify_reviewer(request)

        if not entry_date:
            entry_date = str(date.today())

        service = _get_service()
        entries = service.get_entries_by_date(entry_date)
        agg = service.aggregate_single_day(entries)

        from app.domains.class_diary.excel_export import (
            build_single_day_xlsx,
            workbook_to_bytes,
        )
        wb = build_single_day_xlsx(agg, entry_date)
        output = io.BytesIO(workbook_to_bytes(wb))

        filename = f"課室日誌_{entry_date}.xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("匯出 XLSX 失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/review/export-range")
async def export_entries_range_xlsx(
    request: Request,
    start_date: str = Query(..., description="開始日期 YYYY-MM-DD"),
    end_date: str = Query(..., description="結束日期 YYYY-MM-DD"),
):
    """匯出日期範圍內所有班級的記錄為 XLSX（含學生統計等 10 個工作表）"""
    try:
        _verify_reviewer(request)

        if start_date > end_date:
            return error_response("INVALID_DATE_RANGE", "開始日期不能晚於結束日期", status_code=400)

        service = _get_service()
        entries = service.get_all_entries_by_date_range(start_date, end_date)
        agg = service.aggregate_date_range(entries)
        agg["_raw_entries"] = entries

        from app.domains.class_diary.excel_export import (
            build_date_range_xlsx,
            workbook_to_bytes,
        )
        wb = build_date_range_xlsx(agg, start_date, end_date)
        output = io.BytesIO(workbook_to_bytes(wb))

        filename = f"課室日誌_{start_date}_至_{end_date}.xlsx"
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("匯出日期範圍 XLSX 失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)
