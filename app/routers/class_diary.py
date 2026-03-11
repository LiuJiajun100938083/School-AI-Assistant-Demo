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

import csv
import io
import json
import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, Query, Request
from fastapi.responses import Response, StreamingResponse

from app.core.exceptions import AppException, AuthorizationError
from app.core.responses import error_response, success_response
from app.domains.class_diary.schemas import (
    CreateEntryRequest,
    ReviewerRequest,
    UpdateEntryRequest,
)
from app.infrastructure.database.pool import get_database_pool

logger = logging.getLogger(__name__)

router = APIRouter(tags=["課室日誌"])


# ====================================================================== #
#  工具函數                                                                #
# ====================================================================== #

def _get_service():
    from app.services.container import get_services
    return get_services().class_diary


def _format_behavior_field(value: str) -> str:
    """Format JSON behavior field for display, with backward compatibility.

    New JSON format: [{"reason": "聊天", "students": ["張三", "李四"]}, ...]
    Legacy format: plain text (comma/separator separated student names)
    """
    if not value or not value.strip():
        return ""
    try:
        data = json.loads(value)
        if isinstance(data, list):
            parts = []
            for item in data:
                reason = item.get("reason", "")
                students = item.get("students", [])
                if students:
                    joined = "、".join(students)
                    parts.append(f"{reason}: {joined}" if reason else joined)
            return "；".join(parts)
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass
    return value


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
#  數據庫初始化                                                            #
# ====================================================================== #

def init_class_diary_tables():
    """創建課室日誌相關數據表"""
    pool = get_database_pool()

    sqls = [
        """
        CREATE TABLE IF NOT EXISTS class_diary_entries (
            id                  INT AUTO_INCREMENT PRIMARY KEY,
            class_code          VARCHAR(20)  NOT NULL          COMMENT '班級代碼',
            entry_date          DATE         NOT NULL          COMMENT '上課日期',
            period_start        TINYINT      NOT NULL          COMMENT '起始節數 0=早會,1-9',
            period_end          TINYINT      NOT NULL          COMMENT '結束節數',
            subject             VARCHAR(100) NOT NULL          COMMENT '科目',
            absent_students     TEXT                           COMMENT '缺席學生',
            late_students       TEXT                           COMMENT '遲到學生',
            discipline_rating   TINYINT      NOT NULL DEFAULT 0 COMMENT '紀律 1-5',
            cleanliness_rating  TINYINT      NOT NULL DEFAULT 0 COMMENT '整潔 1-5',
            commended_students  TEXT                           COMMENT '嘉許學生',
            appearance_issues   TEXT                           COMMENT '儀表違規',
            rule_violations     TEXT                           COMMENT '課堂違規',
            signature           MEDIUMTEXT                     COMMENT '手寫簽名 base64',
            submitted_from      VARCHAR(255)                   COMMENT '提交來源 UA',
            created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_class_date (class_code, entry_date),
            INDEX idx_date (entry_date)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS class_diary_reviewers (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            username    VARCHAR(100) NOT NULL UNIQUE     COMMENT '被授權用戶名',
            granted_by  VARCHAR(100) NOT NULL            COMMENT '授權管理員',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS class_diary_daily_reports (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            report_date     DATE NOT NULL UNIQUE          COMMENT '報告日期',
            report_text     MEDIUMTEXT NOT NULL            COMMENT 'AI 生成的報告文本',
            anomalies_json  MEDIUMTEXT                    COMMENT '異常記錄 JSON',
            status          VARCHAR(20) DEFAULT 'pending' COMMENT 'pending/generating/done/failed',
            created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        """
        CREATE TABLE IF NOT EXISTS class_diary_report_recipients (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            username    VARCHAR(100) NOT NULL UNIQUE     COMMENT '報告接收人用戶名',
            granted_by  VARCHAR(100) NOT NULL            COMMENT '授權管理員',
            created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
    ]

    for sql in sqls:
        try:
            pool.execute_write(sql)
        except Exception as e:
            # 表已存在時忽略
            if "already exists" not in str(e).lower():
                logger.error("創建課室日誌表失敗: %s", e)

    logger.info("課室日誌數據表初始化完成")


# ====================================================================== #
#  公開端點 — 教師掃碼提交（無需登入）                                        #
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
        result = service.create_entry(entry_data.model_dump(), user_agent)

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

        # 公開端點不返回簽名數據（節省帶寬）
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
    """修改已提交的評級記錄"""
    try:
        body = await request.json()
        update_data = UpdateEntryRequest(**body)

        service = _get_service()
        result = service.update_entry(entry_id, update_data.model_dump(exclude_none=True))

        return success_response(result, "記錄更新成功")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("更新記錄失敗")
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
    """檢查當前用戶是否有 review 權限"""
    try:
        username, role = _verify_request(request)
        service = _get_service()
        has_access = service.check_review_access(username, role)
        return success_response({"has_access": has_access})
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  管理員端點                                                              #
# ====================================================================== #

@router.get("/api/class-diary/admin/classes")
async def admin_list_classes(request: Request):
    """列出所有班級（管理員用，含班主任資訊）"""
    try:
        _verify_admin(request)

        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()

        classes = pool.execute(
            "SELECT class_code, class_name, grade, teacher_username, vice_teacher_username "
            "FROM classes ORDER BY class_code"
        )
        return success_response(classes or [])

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("查詢班級失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)


@router.get("/api/class-diary/admin/qr/batch")
async def batch_qr(request: Request):
    """批量生成所有班級 QR 碼 ZIP（必須在 {class_code} 路由之前，否則 'batch' 被當作 class_code）"""
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
            class_name = class_code  # 默認使用代碼作為名稱

        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()

        # 檢查是否已存在
        existing = pool.execute(
            "SELECT id FROM classes WHERE class_code = %s", (class_code,)
        )
        if existing:
            return error_response("ALREADY_EXISTS", f"班級 {class_code} 已存在", status_code=409)

        pool.execute(
            "INSERT INTO classes (class_code, class_name, grade) VALUES (%s, %s, %s)",
            (class_code, class_name, grade),
        )

        return success_response(
            {"class_code": class_code, "class_name": class_name, "grade": grade},
            "班級創建成功",
        )

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

        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()

        pool.execute(
            "UPDATE classes SET teacher_username = %s, vice_teacher_username = %s WHERE class_code = %s",
            (teacher_username, vice_teacher_username, class_code),
        )

        return success_response(
            {"class_code": class_code, "teacher_username": teacher_username, "vice_teacher_username": vice_teacher_username},
            "班主任設定已更新",
        )

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

        from app.infrastructure.database import get_database_pool
        pool = get_database_pool()

        result = pool.execute(
            "DELETE FROM classes WHERE class_code = %s", (class_code,)
        )

        return success_response(None, "班級已刪除")

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  每日報告 — 報告接收人管理                                                 #
# ====================================================================== #

@router.get("/api/class-diary/admin/report-recipients")
async def list_report_recipients(request: Request):
    """列出所有報告接收人"""
    try:
        _verify_admin(request)
        pool = get_database_pool()
        rows = pool.execute(
            "SELECT username, granted_by, created_at FROM class_diary_report_recipients ORDER BY created_at"
        )
        return success_response(rows or [])
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

        pool = get_database_pool()
        existing = pool.execute(
            "SELECT id FROM class_diary_report_recipients WHERE username = %s", (username,)
        )
        if existing:
            return error_response("ALREADY_EXISTS", "該用戶已是報告接收人", status_code=409)

        pool.execute_write(
            "INSERT INTO class_diary_report_recipients (username, granted_by) VALUES (%s, %s)",
            (username, admin_user),
        )
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
        pool = get_database_pool()
        pool.execute_write(
            "DELETE FROM class_diary_report_recipients WHERE username = %s", (username,)
        )
        return success_response(None, "報告接收人已移除")
    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        return error_response("SERVER_ERROR", str(e), status_code=500)


# ====================================================================== #
#  每日報告 — 生成 & 查詢                                                  #
# ====================================================================== #

_REPORT_SYSTEM_PROMPT = """你是一位學校課室日誌分析助手。根據提供的課堂記錄數據，生成一份簡潔的每日報告。

要求：
1. 先給出整體概況（共幾個班有記錄，平均紀律/整潔分數）
2. 逐班列出：班級名、記錄數、平均分、重點問題
3. 重點標出「異常」：紀律或整潔 ≤ 2 分的課堂、缺席人數多的課堂、有違規記錄的課堂
4. 最後給出簡短的總結建議
5. 使用繁體中文，語氣正式但簡潔
6. 不要使用 Markdown 標題語法，使用【】來標記章節"""


def _detect_anomalies(entries: list) -> list:
    """規則檢測異常記錄"""
    anomalies = []
    for e in entries:
        reasons = []
        if e.get("discipline_rating") and int(e["discipline_rating"]) <= 2:
            reasons.append(f"紀律評分低 ({e['discipline_rating']}/5)")
        if e.get("cleanliness_rating") and int(e["cleanliness_rating"]) <= 2:
            reasons.append(f"整潔評分低 ({e['cleanliness_rating']}/5)")

        absent = (e.get("absent_students") or "").strip()
        if absent:
            count = len([s for s in absent.split(",") if s.strip()])
            if count > 3:
                reasons.append(f"缺席人數多 ({count}人)")

        violations_raw = (e.get("rule_violations") or "").strip()
        if violations_raw:
            reasons.append(f"課堂違規: {_format_behavior_field(violations_raw)[:80]}")
        appearance_raw = (e.get("appearance_issues") or "").strip()
        if appearance_raw:
            reasons.append(f"儀表問題: {_format_behavior_field(appearance_raw)[:80]}")
        medical_raw = (e.get("medical_room_students") or "").strip()
        if medical_raw:
            reasons.append(f"醫務室: {_format_behavior_field(medical_raw)[:80]}")

        if reasons:
            anomalies.append({
                "entry_id": e.get("id"),
                "class_code": e.get("class_code", ""),
                "period_start": e.get("period_start"),
                "period_end": e.get("period_end"),
                "subject": e.get("subject", ""),
                "reasons": reasons,
            })
    return anomalies


def _build_report_prompt(entries: list, anomalies: list, report_date: str) -> str:
    """把當天所有記錄組織成給 AI 的提問文本"""
    if not entries:
        return f"日期：{report_date}\n今天沒有任何課堂記錄。請簡單說明沒有數據。"

    # 按班級分組
    by_class = {}
    for e in entries:
        cc = e.get("class_code", "unknown")
        by_class.setdefault(cc, []).append(e)

    lines = [f"日期：{report_date}", f"共 {len(by_class)} 個班有記錄，合計 {len(entries)} 條。", ""]

    for cc, class_entries in sorted(by_class.items()):
        disc_avg = sum(int(e.get("discipline_rating") or 0) for e in class_entries) / len(class_entries)
        clean_avg = sum(int(e.get("cleanliness_rating") or 0) for e in class_entries) / len(class_entries)
        lines.append(f"【班級 {cc}】 {len(class_entries)} 條記錄, 平均紀律 {disc_avg:.1f}, 平均整潔 {clean_avg:.1f}")

        for e in class_entries:
            absent = (e.get("absent_students") or "").strip()
            late = (e.get("late_students") or "").strip()
            violations = _format_behavior_field((e.get("rule_violations") or "").strip())
            appearance = _format_behavior_field((e.get("appearance_issues") or "").strip())
            commended = _format_behavior_field((e.get("commended_students") or "").strip())
            medical = _format_behavior_field((e.get("medical_room_students") or "").strip())

            detail = f"  節{e.get('period_start', '?')}-{e.get('period_end', '?')} {e.get('subject', '')} 紀律{e.get('discipline_rating', '?')} 整潔{e.get('cleanliness_rating', '?')}"
            if absent:
                detail += f" 缺席:{absent}"
            if late:
                detail += f" 遲到:{late}"
            if violations:
                detail += f" 違規:{violations}"
            if appearance:
                detail += f" 儀表:{appearance}"
            if commended:
                detail += f" 嘉許:{commended}"
            if medical:
                detail += f" 醫務室:{medical}"
            lines.append(detail)
        lines.append("")

    if anomalies:
        lines.append(f"===== 異常記錄（共 {len(anomalies)} 條） =====")
        for a in anomalies:
            lines.append(f"  {a['class_code']} 節{a.get('period_start', '?')}-{a.get('period_end', '?')} {a['subject']}: {', '.join(a['reasons'])}")

    return "\n".join(lines)


def _generate_report_sync(report_date: str):
    """同步版本的報告生成（供 run_in_executor 調用）"""
    pool = get_database_pool()

    pool.execute_write(
        "INSERT INTO class_diary_daily_reports (report_date, report_text, status) "
        "VALUES (%s, '', 'generating') "
        "ON DUPLICATE KEY UPDATE status = 'generating', updated_at = NOW()",
        (report_date,),
    )

    try:
        service = _get_service()
        entries = service.get_entries_by_date(report_date)
        anomalies = _detect_anomalies(entries)
        prompt_text = _build_report_prompt(entries, anomalies, report_date)

        if not entries:
            report_text = f"{report_date} 今天沒有任何課堂記錄。"
        else:
            from llm.services.qa_service import ask_ai_local
            report_text, _ = ask_ai_local(
                question=prompt_text,
                subject="general",
                system_prompt=_REPORT_SYSTEM_PROMPT,
                task_type="summary",
            )

        anomalies_json = json.dumps(anomalies, ensure_ascii=False)
        pool.execute_write(
            "UPDATE class_diary_daily_reports "
            "SET report_text = %s, anomalies_json = %s, status = 'done', updated_at = NOW() "
            "WHERE report_date = %s",
            (report_text, anomalies_json, report_date),
        )
        logger.info("每日報告生成完成: %s (%d 條記錄, %d 條異常)", report_date, len(entries), len(anomalies))
    except Exception as e:
        logger.exception("每日報告生成失敗: %s", report_date)
        pool.execute_write(
            "UPDATE class_diary_daily_reports SET status = 'failed', report_text = %s, updated_at = NOW() WHERE report_date = %s",
            (f"生成失敗: {str(e)[:500]}", report_date),
        )
        raise


@router.post("/api/class-diary/admin/generate-report")
async def admin_generate_report(request: Request):
    """管理員手動觸發報告生成（異步，立即返回）"""
    try:
        _verify_admin(request)
        body = await request.json()
        report_date = (body.get("report_date") or str(date.today())).strip()

        import asyncio
        loop = asyncio.get_event_loop()
        loop.run_in_executor(None, _generate_report_sync, report_date)

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
    """獲取每日 AI 報告"""
    try:
        username, role = _verify_request(request)
        service = _get_service()

        if not service.check_review_access(username, role):
            from app.domains.class_diary.exceptions import ReviewAccessDeniedError
            raise ReviewAccessDeniedError()

        if not entry_date:
            entry_date = str(date.today())

        pool = get_database_pool()

        # 查詢報告
        rows = pool.execute(
            "SELECT report_text, anomalies_json, status, created_at "
            "FROM class_diary_daily_reports WHERE report_date = %s",
            (entry_date,),
        )
        report = rows[0] if rows else None

        # 檢查是否為報告接收人
        recipient_rows = pool.execute(
            "SELECT id FROM class_diary_report_recipients WHERE username = %s",
            (username,),
        )
        is_recipient = bool(recipient_rows)

        # 檢查是否為 reviewer（整理人，可匯出）
        is_reviewer = role == "admin" or service._reviewer_repo.is_reviewer(username)

        if report:
            anomalies = []
            if report.get("anomalies_json"):
                try:
                    anomalies = json.loads(report["anomalies_json"])
                except (json.JSONDecodeError, TypeError):
                    pass

            return success_response({
                "report_text": report["report_text"],
                "anomalies": anomalies,
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
#  匯出 CSV                                                               #
# ====================================================================== #

@router.get("/api/class-diary/review/export")
async def export_entries_csv(
    request: Request,
    entry_date: Optional[str] = Query(None, description="日期 YYYY-MM-DD"),
):
    """匯出當天所有班級的記錄為 CSV"""
    try:
        _verify_reviewer(request)

        if not entry_date:
            entry_date = str(date.today())

        service = _get_service()
        entries = service.get_entries_by_date(entry_date)

        period_labels = ["早會", "第一節", "第二節", "第三節", "第四節",
                         "第五節", "第六節", "第七節", "第八節", "第九節"]

        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow([
            "班級", "日期", "節數", "科目",
            "紀律", "整潔", "缺席學生", "遲到學生",
            "嘉許學生", "儀表問題", "課堂違規", "醫務室",
        ])

        for e in entries:
            ps = e.get("period_start", 0)
            pe = e.get("period_end", 0)
            period_text = period_labels[ps] if ps == pe and ps < len(period_labels) else f"{period_labels[min(ps, len(period_labels)-1)]}-{period_labels[min(pe, len(period_labels)-1)]}"
            writer.writerow([
                e.get("class_code", ""),
                e.get("entry_date", ""),
                period_text,
                e.get("subject", ""),
                e.get("discipline_rating", ""),
                e.get("cleanliness_rating", ""),
                e.get("absent_students", ""),
                e.get("late_students", ""),
                _format_behavior_field(e.get("commended_students", "")),
                _format_behavior_field(e.get("appearance_issues", "")),
                _format_behavior_field(e.get("rule_violations", "")),
                _format_behavior_field(e.get("medical_room_students", "")),
            ])

        csv_bytes = output.getvalue().encode("utf-8-sig")
        filename = f"class_diary_{entry_date}.csv"

        return Response(
            content=csv_bytes,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except AppException as e:
        return error_response(e.code, e.message, status_code=e.status_code)
    except Exception as e:
        logger.exception("匯出 CSV 失敗")
        return error_response("SERVER_ERROR", str(e), status_code=500)
