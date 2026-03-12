"""
課室日誌 — Service (業務邏輯層)
"""

import io
import json
import logging
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.domains.class_diary.exceptions import (
    EntryNotFoundError,
    InvalidClassCodeError,
    NotMobileDeviceError,
    ReviewAccessDeniedError,
)
from app.domains.class_diary.repository import (
    ClassDiaryEntryRepository,
    ClassDiaryReviewerRepository,
    ClassRepository,
    DailyReportRepository,
    RangeReportRepository,
    ReportRecipientRepository,
)

logger = logging.getLogger(__name__)

# 移動裝置 User-Agent 關鍵字
_MOBILE_UA_PATTERNS = re.compile(
    r"(Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile)",
    re.IGNORECASE,
)


class ClassDiaryService:
    """課室日誌業務邏輯（用例協調器）"""

    def __init__(
        self,
        entry_repo: ClassDiaryEntryRepository,
        reviewer_repo: ClassDiaryReviewerRepository,
        user_repo=None,
        class_repo: Optional["ClassRepository"] = None,
        recipient_repo: Optional["ReportRecipientRepository"] = None,
        daily_report_repo: Optional["DailyReportRepository"] = None,
        range_report_repo: Optional["RangeReportRepository"] = None,
    ):
        self._entry_repo = entry_repo
        self._reviewer_repo = reviewer_repo
        self._user_repo = user_repo
        self._class_repo = class_repo
        self._recipient_repo = recipient_repo
        self._daily_report_repo = daily_report_repo
        self._range_report_repo = range_report_repo

    # ================================================================== #
    #  評級記錄 CRUD                                                       #
    # ================================================================== #

    def create_entry(
        self, data: Dict[str, Any], user_agent: str = "", submitted_by: str = ""
    ) -> Dict[str, Any]:
        """
        創建課堂評級記錄

        Args:
            data: 評級數據 (已通過 schema 驗證)
            user_agent: 請求的 User-Agent
            submitted_by: 提交者用戶名

        Returns:
            創建的記錄 (含 id)
        """
        # 檢查節數重疊
        overlaps = self._entry_repo.find_overlapping_entries(
            data["class_code"], str(data["entry_date"]),
            data["period_start"], data["period_end"],
        )
        if overlaps:
            from app.domains.class_diary.exceptions import PeriodOverlapError
            existing = overlaps[0]
            raise PeriodOverlapError(
                existing["subject"],
                f"第{existing['period_start']}節-第{existing['period_end']}節",
            )

        # 構建數據庫記錄
        record = {
            "class_code": data["class_code"],
            "entry_date": str(data["entry_date"]),
            "period_start": data["period_start"],
            "period_end": data["period_end"],
            "subject": data["subject"],
            "absent_students": data.get("absent_students", ""),
            "late_students": data.get("late_students", ""),
            "discipline_rating": data["discipline_rating"],
            "cleanliness_rating": data["cleanliness_rating"],
            "commended_students": data.get("commended_students", ""),
            "appearance_issues": data.get("appearance_issues", ""),
            "rule_violations": data.get("rule_violations", ""),
            "medical_room_students": data.get("medical_room_students", ""),
            "signature": data["signature"],
            "submitted_from": self._summarize_ua(user_agent),
            "submitted_by": submitted_by,
        }

        try:
            entry_id = self._entry_repo.insert_get_id(record)
        except Exception as e:
            # 捕獲 DB duplicate key error，轉為 PeriodOverlapError
            if "duplicate" in str(e).lower():
                from app.domains.class_diary.exceptions import PeriodOverlapError
                raise PeriodOverlapError(data["subject"], f"第{data['period_start']}節")
            raise

        record["id"] = entry_id
        return record

    def update_entry(self, entry_id: int, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        更新已提交的評級記錄

        Args:
            entry_id: 記錄 ID
            data: 要更新的字段

        Returns:
            更新後的完整記錄
        """
        # 確認記錄存在
        existing = self._entry_repo.find_by_id(entry_id)
        if not existing:
            raise EntryNotFoundError(entry_id)

        # 過濾出非 None 的字段
        update_data = {k: v for k, v in data.items() if v is not None}
        if not update_data:
            return existing

        # 若更新了節數，檢查重疊（排除自身）
        if "period_start" in update_data or "period_end" in update_data:
            ps = update_data.get("period_start", existing["period_start"])
            pe = update_data.get("period_end", existing["period_end"])
            overlaps = self._entry_repo.find_overlapping_entries(
                existing["class_code"], str(existing["entry_date"]),
                ps, pe, exclude_id=entry_id,
            )
            if overlaps:
                from app.domains.class_diary.exceptions import PeriodOverlapError
                ov = overlaps[0]
                raise PeriodOverlapError(
                    ov["subject"],
                    f"第{ov['period_start']}節-第{ov['period_end']}節",
                )

        self._entry_repo.update(update_data, "id = %s", (entry_id,))

        # 返回更新後的記錄
        return self._entry_repo.find_by_id(entry_id)

    def get_entry(self, entry_id: int) -> Dict[str, Any]:
        """獲取單條記錄"""
        entry = self._entry_repo.find_by_id(entry_id)
        if not entry:
            raise EntryNotFoundError(entry_id)
        return entry

    def get_entries_by_class_date(
        self, class_code: str, entry_date: str
    ) -> List[Dict[str, Any]]:
        """獲取某班某日的所有記錄"""
        return self._entry_repo.find_by_class_and_date(class_code, entry_date)

    def get_entries_by_date(self, entry_date: str) -> List[Dict[str, Any]]:
        """獲取某日所有班級的記錄"""
        return self._entry_repo.find_all_by_date(entry_date)

    def get_all_entries_by_date_range(
        self, start_date: str, end_date: str
    ) -> List[Dict[str, Any]]:
        """獲取日期範圍內所有班級的記錄"""
        return self._entry_repo.find_all_by_date_range(start_date, end_date)

    def get_entries_by_date_range(
        self, class_code: str, start_date: str, end_date: str
    ) -> List[Dict[str, Any]]:
        """獲取日期範圍記錄"""
        return self._entry_repo.find_by_date_range(class_code, start_date, end_date)

    def get_summary(
        self, class_code: str, entry_date: str
    ) -> Optional[Dict[str, Any]]:
        """獲取某班某日的匯總"""
        return self._entry_repo.get_summary_by_class_date(class_code, entry_date)

    def get_classes_with_entries(self, entry_date: str) -> List[Dict[str, Any]]:
        """獲取某日有記錄的班級列表"""
        return self._entry_repo.get_classes_with_entries_on_date(entry_date)

    def delete_entry(self, entry_id: int) -> bool:
        """刪除記錄"""
        existing = self._entry_repo.find_by_id(entry_id)
        if not existing:
            raise EntryNotFoundError(entry_id)
        self._entry_repo.delete("id = %s", (entry_id,))
        return True

    # ================================================================== #
    #  Reviewer 權限管理                                                   #
    # ================================================================== #

    def check_review_access(self, username: str, role: str) -> bool:
        """檢查用戶是否有 Review 訪問權限"""
        return self.get_user_permission_tier(username, role)["has_access"]

    def get_user_permission_tier(self, username: str, role: str) -> Dict[str, Any]:
        """返回用戶權限 tier 及相關標記。

        判定順序：admin → reviewer → class_teacher → report_recipient → none
        同一用戶若屬多個身份，取最高優先級 tier。
        """
        base = {
            "tier": "none",
            "has_access": False,
            "own_classes": [],
            "can_view_raw_data": False,
            "can_export": False,
            "can_view_ai_report": False,
            "can_view_charts": False,
        }

        if role == "admin":
            base.update(tier="admin", has_access=True,
                        can_view_raw_data=True, can_export=True,
                        can_view_ai_report=True, can_view_charts=True)
            return base

        if self._reviewer_repo.is_reviewer(username):
            base.update(tier="reviewer", has_access=True,
                        can_view_raw_data=True, can_export=True,
                        can_view_ai_report=True, can_view_charts=True)
            return base

        teacher_classes = self.get_teacher_classes(username)
        if teacher_classes:
            base.update(tier="class_teacher", has_access=True,
                        own_classes=teacher_classes,
                        can_view_raw_data=True, can_export=False,
                        can_view_ai_report=False, can_view_charts=True)
            return base

        if self._is_report_recipient(username):
            base.update(tier="report_recipient", has_access=True,
                        can_view_raw_data=False, can_export=False,
                        can_view_ai_report=True, can_view_charts=False)
            return base

        return base

    def get_teacher_classes(self, username: str) -> List[str]:
        """獲取用戶擔任班主任或副班主任的所有班級代碼"""
        if self._class_repo:
            return self._class_repo.get_classes_for_teacher(username)
        try:
            rows = self._entry_repo.raw_query(
                "SELECT class_code FROM classes "
                "WHERE teacher_username = %s OR vice_teacher_username = %s",
                (username, username),
            )
            return [r["class_code"] for r in rows] if rows else []
        except Exception:
            return []

    def _is_report_recipient(self, username: str) -> bool:
        """檢查用戶是否為報告接收人"""
        if self._recipient_repo:
            return self._recipient_repo.is_recipient(username)
        try:
            rows = self._entry_repo.raw_query(
                "SELECT id FROM class_diary_report_recipients WHERE username = %s",
                (username,),
            )
            return bool(rows)
        except Exception:
            return False

    # ================================================================== #
    #  班級管理                                                            #
    # ================================================================== #

    def list_admin_classes(self) -> List[Dict[str, Any]]:
        """列出所有班級（含班主任資訊）"""
        if self._class_repo:
            return self._class_repo.get_all_ordered()
        return self._entry_repo.raw_query(
            "SELECT class_code, class_name, grade, teacher_username, "
            "vice_teacher_username FROM classes ORDER BY class_code"
        ) or []

    def create_class(
        self, class_code: str, class_name: str, grade: str
    ) -> Dict[str, Any]:
        """創建班級"""
        if self._class_repo:
            existing = self._class_repo.find_by_class_code(class_code)
            if existing:
                from app.core.exceptions import AppException
                raise AppException(
                    code="ALREADY_EXISTS",
                    message=f"班級 {class_code} 已存在",
                    status_code=409,
                )
            self._class_repo.create_class(class_code, class_name, grade)
        return {"class_code": class_code, "class_name": class_name, "grade": grade}

    def update_class_teachers(
        self,
        class_code: str,
        teacher_username: Optional[str],
        vice_teacher_username: Optional[str],
    ) -> Dict[str, Any]:
        """設定班級班主任"""
        if self._class_repo:
            self._class_repo.update_teachers(
                class_code, teacher_username, vice_teacher_username
            )
        return {
            "class_code": class_code,
            "teacher_username": teacher_username,
            "vice_teacher_username": vice_teacher_username,
        }

    def delete_class(self, class_code: str) -> None:
        """刪除班級"""
        if self._class_repo:
            self._class_repo.delete_by_code(class_code)

    # ================================================================== #
    #  報告接收人管理                                                       #
    # ================================================================== #

    def list_report_recipients(self) -> List[Dict[str, Any]]:
        """列出所有報告接收人"""
        if self._recipient_repo:
            return self._recipient_repo.get_all()
        return []

    def add_report_recipient(self, username: str, granted_by: str) -> bool:
        """添加報告接收人，返回是否成功（已存在返回 False）"""
        if self._recipient_repo:
            if self._recipient_repo.is_recipient(username):
                return False
            self._recipient_repo.add_recipient(username, granted_by)
            return True
        return False

    def remove_report_recipient(self, username: str) -> None:
        """移除報告接收人"""
        if self._recipient_repo:
            self._recipient_repo.remove_recipient(username)

    # ================================================================== #
    #  AI 報告 — 查詢                                                     #
    # ================================================================== #

    def get_daily_report(self, report_date: str) -> Optional[Dict[str, Any]]:
        """獲取每日 AI 報告"""
        if self._daily_report_repo:
            return self._daily_report_repo.get_by_date(report_date)
        return None

    def get_range_report(
        self, start_date: str, end_date: str
    ) -> Optional[Dict[str, Any]]:
        """獲取日期範圍 AI 報告"""
        if self._range_report_repo:
            return self._range_report_repo.get_by_range(start_date, end_date)
        return None

    # ================================================================== #
    #  AI 報告 — 生成（同步，供 run_in_executor 調用）                        #
    # ================================================================== #

    def generate_daily_report_sync(self, report_date: str) -> None:
        """同步生成每日報告"""
        from app.domains.class_diary.anomaly_detection import detect_anomalies
        from app.domains.class_diary.report_builder import (
            build_daily_report_prompt,
            split_report_versions,
        )
        from app.domains.class_diary.prompts import DAILY_REPORT_SYSTEM_PROMPT

        self._daily_report_repo.upsert_generating(report_date)

        try:
            entries = self.get_entries_by_date(report_date)
            anomalies = detect_anomalies(
                entries, format_behavior_fn=_format_behavior_field
            )
            prompt_text = build_daily_report_prompt(
                entries, anomalies, report_date,
                format_behavior_fn=_format_behavior_field,
            )

            if not entries:
                full_text = f"{report_date} 今天沒有任何課堂記錄。"
                summary_text = full_text
            else:
                from llm.services.qa_service import ask_ai_local
                ai_output, _ = ask_ai_local(
                    question=prompt_text,
                    subject="general",
                    system_prompt=DAILY_REPORT_SYSTEM_PROMPT,
                    task_type="summary",
                )
                full_text, summary_text = split_report_versions(ai_output)

            anomalies_json = json.dumps(anomalies, ensure_ascii=False)
            self._daily_report_repo.save_completed(
                report_date, full_text, summary_text, anomalies_json
            )
            logger.info(
                "每日報告生成完成: %s (%d 條記錄, %d 條異常)",
                report_date, len(entries), len(anomalies),
            )
        except Exception as e:
            logger.exception("每日報告生成失敗: %s", report_date)
            self._daily_report_repo.save_failed(report_date, str(e))
            raise

    def generate_range_report_sync(
        self, start_date: str, end_date: str, requested_by: str
    ) -> None:
        """同步生成日期範圍報告"""
        from app.domains.class_diary.anomaly_detection import detect_anomalies
        from app.domains.class_diary.report_builder import (
            build_range_report_prompt,
            split_report_versions,
        )
        from app.domains.class_diary.prompts import RANGE_REPORT_SYSTEM_PROMPT

        self._range_report_repo.upsert_generating(
            start_date, end_date, requested_by
        )

        try:
            entries = self.get_all_entries_by_date_range(start_date, end_date)
            agg = self.aggregate_date_range(entries)
            prompt_text = build_range_report_prompt(agg, start_date, end_date)

            if not entries:
                full_text = f"{start_date} 至 {end_date} 沒有任何課堂記錄。"
                summary_text = full_text
            else:
                from llm.services.qa_service import ask_ai_local
                ai_output, _ = ask_ai_local(
                    question=prompt_text,
                    subject="general",
                    system_prompt=RANGE_REPORT_SYSTEM_PROMPT,
                    task_type="summary",
                )
                full_text, summary_text = split_report_versions(ai_output)

            anomalies = detect_anomalies(
                entries, format_behavior_fn=_format_behavior_field
            )
            anomalies_json = json.dumps(anomalies, ensure_ascii=False)
            self._range_report_repo.save_completed(
                start_date, end_date, full_text, summary_text, anomalies_json,
            )
            logger.info(
                "範圍報告生成完成: %s ~ %s (%d 條記錄)",
                start_date, end_date, len(entries),
            )
        except Exception as e:
            logger.exception("範圍報告生成失敗: %s ~ %s", start_date, end_date)
            self._range_report_repo.save_failed(
                start_date, end_date, str(e)
            )
            raise

    def get_all_reviewers(self) -> List[Dict[str, Any]]:
        """獲取所有 reviewer"""
        return self._reviewer_repo.get_all_reviewers()

    def add_reviewer(self, username: str, granted_by: str) -> bool:
        """添加 reviewer"""
        if self._reviewer_repo.is_reviewer(username):
            return False  # 已存在
        self._reviewer_repo.add_reviewer(username, granted_by)
        return True

    def remove_reviewer(self, username: str) -> bool:
        """移除 reviewer"""
        rows = self._reviewer_repo.remove_reviewer(username)
        return rows > 0

    # ================================================================== #
    #  QR 碼生成                                                          #
    # ================================================================== #

    def generate_qr_code(self, class_code: str, base_url: str) -> bytes:
        """
        為指定班級生成 QR 碼 PNG

        Args:
            class_code: 班級代碼
            base_url: 站點根 URL (如 https://example.com)

        Returns:
            PNG 圖片的 bytes
        """
        import qrcode
        from PIL import Image, ImageDraw, ImageFont

        url = f"{base_url}/class-diary/rate/{class_code}"
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=4,
        )
        qr.add_data(url)
        qr.make(fit=True)

        qr_img = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        qr_w, qr_h = qr_img.size

        # 在 QR 碼下方添加班級名稱
        label_height = 48
        canvas = Image.new("RGB", (qr_w, qr_h + label_height), "white")
        canvas.paste(qr_img, (0, 0))

        draw = ImageDraw.Draw(canvas)
        label = class_code
        try:
            font = ImageFont.truetype("/System/Library/Fonts/STHeiti Medium.ttc", 28)
        except (OSError, IOError):
            try:
                font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 28)
            except (OSError, IOError):
                font = ImageFont.load_default()

        bbox = draw.textbbox((0, 0), label, font=font)
        text_w = bbox[2] - bbox[0]
        text_x = (qr_w - text_w) // 2
        text_y = qr_h + (label_height - (bbox[3] - bbox[1])) // 2
        draw.text((text_x, text_y), label, fill="black", font=font)

        buf = io.BytesIO()
        canvas.save(buf, format="PNG")
        buf.seek(0)
        return buf.getvalue()

    def generate_qr_codes_zip(
        self, class_codes: List[str], base_url: str
    ) -> bytes:
        """
        批量生成 QR 碼並打包為 ZIP

        Args:
            class_codes: 班級代碼列表
            base_url: 站點根 URL

        Returns:
            ZIP 文件的 bytes
        """
        import zipfile

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            for code in class_codes:
                png_data = self.generate_qr_code(code, base_url)
                zf.writestr(f"QR_{code}.png", png_data)

        zip_buf.seek(0)
        return zip_buf.getvalue()

    # ================================================================== #
    #  班級列表                                                            #
    # ================================================================== #

    def get_all_classes(self) -> List[Dict[str, Any]]:
        """從用戶管理的學生數據中提取班級列表"""
        if self._user_repo:
            class_names = self._user_repo.get_distinct_class_names()
            return [
                {"class_code": name, "class_name": name}
                for name in class_names
            ]
        # fallback: 從 classes 表
        sql = "SELECT id, class_code, class_name, grade FROM classes ORDER BY class_code"
        return self._entry_repo.raw_query(sql)

    def get_students_for_class(self, class_code: str) -> List[Dict[str, Any]]:
        """獲取某班的學生列表（供移動端表單使用）"""
        if self._user_repo:
            return self._user_repo.get_students_by_class(class_code)
        return []

    # ================================================================== #
    #  工具方法                                                            #
    # ================================================================== #

    @staticmethod
    def is_mobile_device(user_agent: str) -> bool:
        """檢測是否為移動裝置"""
        return bool(_MOBILE_UA_PATTERNS.search(user_agent))

    @staticmethod
    def _summarize_ua(user_agent: str) -> str:
        """提取 User-Agent 摘要"""
        if not user_agent:
            return ""
        # 截取前 200 字符
        return user_agent[:200]

    # ================================================================== #
    #  數據聚合（可被 Excel 匯出 / AI 分析共用）                              #
    # ================================================================== #

    def aggregate_single_day(self, entries: List[Dict]) -> Dict[str, Any]:
        """聚合單天數據：總覽 + 班級統計 + 格式化記錄"""
        if not entries:
            return {"overview": {}, "class_stats": [], "records": []}

        total = len(entries)
        by_class: Dict[str, list] = defaultdict(list)
        for e in entries:
            by_class[e.get("class_code", "")].append(e)

        overview = {
            "total_entries": total,
            "total_classes": len(by_class),
            "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in entries) / total, 1),
            "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in entries) / total, 1),
            "total_absent": sum(len(extract_student_names(e.get("absent_students", ""))) for e in entries),
            "total_late": sum(len(extract_student_names(e.get("late_students", ""))) for e in entries),
        }

        class_stats = []
        for cc in sorted(by_class):
            ces = by_class[cc]
            n = len(ces)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in ces)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in ces)
            class_stats.append({
                "class_code": cc,
                "entry_count": n,
                "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in ces) / n, 1),
                "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in ces) / n, 1),
                "absent_count": absent_n,
                "late_count": late_n,
            })

        return {"overview": overview, "class_stats": class_stats, "records": entries}

    def aggregate_date_range(self, entries: List[Dict]) -> Dict[str, Any]:
        """聚合日期範圍數據：全面統計分析"""
        if not entries:
            return {
                "overview": {}, "daily_summary": [], "student_records": [],
                "risk_students": [], "class_stats": {}, "period_analysis": [],
                "subject_analysis": [], "reason_analysis": [],
                "weekday_analysis": [], "submitter_analysis": [],
            }

        total = len(entries)
        dates_set = set()
        classes_set = set()
        for e in entries:
            dates_set.add(str(e.get("entry_date", "")))
            classes_set.add(e.get("class_code", ""))

        # ---- Overview ----
        overview = {
            "total_entries": total,
            "total_dates": len(dates_set),
            "total_classes": len(classes_set),
            "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in entries) / total, 1),
            "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in entries) / total, 1),
            "total_absent": sum(len(extract_student_names(e.get("absent_students", ""))) for e in entries),
            "total_late": sum(len(extract_student_names(e.get("late_students", ""))) for e in entries),
        }

        # ---- Daily Summary (with diff & 7-day moving average) ----
        by_date: Dict[str, list] = defaultdict(list)
        for e in entries:
            by_date[str(e.get("entry_date", ""))].append(e)

        daily_summary = []
        sorted_dates = sorted(by_date.keys())
        for i, d in enumerate(sorted_dates):
            des = by_date[d]
            n = len(des)
            avg_d = round(sum(e.get("discipline_rating", 0) for e in des) / n, 1)
            avg_c = round(sum(e.get("cleanliness_rating", 0) for e in des) / n, 1)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in des)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in des)
            violation_n = sum(len(extract_student_names(e.get("rule_violations", ""))) + len(extract_student_names(e.get("appearance_issues", ""))) for e in des)
            praise_n = sum(len(extract_student_names(e.get("commended_students", ""))) for e in des)

            # Previous day diff
            prev_disc = daily_summary[i - 1]["avg_discipline"] if i > 0 else None
            disc_diff = round(avg_d - prev_disc, 1) if prev_disc is not None else None

            # 7-day moving average
            window = daily_summary[max(0, i - 6):i] + [{"avg_discipline": avg_d, "avg_cleanliness": avg_c}]
            ma7_disc = round(sum(x["avg_discipline"] for x in window) / len(window), 1)
            ma7_clean = round(sum(x["avg_cleanliness"] for x in window) / len(window), 1)

            daily_summary.append({
                "date": d, "entry_count": n,
                "avg_discipline": avg_d, "avg_cleanliness": avg_c,
                "absent_count": absent_n, "late_count": late_n,
                "violation_count": violation_n, "praise_count": praise_n,
                "disc_diff": disc_diff,
                "ma7_discipline": ma7_disc, "ma7_cleanliness": ma7_clean,
            })

        # ---- Student Records ----
        student_map: Dict[Tuple[str, str], Dict] = {}  # (name, class) -> record

        for e in entries:
            cc = e.get("class_code", "")
            d = str(e.get("entry_date", ""))

            # Absent
            for name in extract_student_names(e.get("absent_students", "")):
                key = (name, cc)
                rec = student_map.setdefault(key, _new_student_record(name, cc))
                if d not in rec["absent_dates"]:
                    rec["absent_dates"].append(d)
                    rec["absent_count"] += 1

            # Late
            for name in extract_student_names(e.get("late_students", "")):
                key = (name, cc)
                rec = student_map.setdefault(key, _new_student_record(name, cc))
                if d not in rec["late_dates"]:
                    rec["late_dates"].append(d)
                    rec["late_count"] += 1

            # Violations (rule_violations + appearance_issues) - dedupe per entry
            seen_violation = set()
            for name in extract_student_names(e.get("rule_violations", "")):
                if name not in seen_violation:
                    seen_violation.add(name)
                    key = (name, cc)
                    rec = student_map.setdefault(key, _new_student_record(name, cc))
                    rec["violation_count"] += 1
                    if d not in rec["violation_dates"]:
                        rec["violation_dates"].append(d)
            for name in extract_student_names(e.get("appearance_issues", "")):
                if name not in seen_violation:
                    seen_violation.add(name)
                    key = (name, cc)
                    rec = student_map.setdefault(key, _new_student_record(name, cc))
                    rec["violation_count"] += 1
                    if d not in rec["violation_dates"]:
                        rec["violation_dates"].append(d)

            # Medical
            for name in extract_student_names(e.get("medical_room_students", "")):
                key = (name, cc)
                rec = student_map.setdefault(key, _new_student_record(name, cc))
                if d not in rec["medical_dates"]:
                    rec["medical_dates"].append(d)
                    rec["medical_count"] += 1

        student_records = sorted(
            student_map.values(),
            key=lambda r: r["absent_count"] + r["late_count"] + r["violation_count"] + r["medical_count"],
            reverse=True,
        )

        # ---- Risk Students ----
        risk_students = []
        for sr in student_records:
            all_dates = sorted(set(sr["absent_dates"] + sr["late_dates"] + sr["violation_dates"] + sr["medical_dates"]))
            if not all_dates:
                continue
            total_incidents = sr["absent_count"] + sr["late_count"] + sr["violation_count"] + sr["medical_count"]

            # Check 7-day window density
            recent_7d = 0
            if all_dates:
                last_date = datetime.strptime(all_dates[-1], "%Y-%m-%d")
                cutoff = last_date - timedelta(days=6)
                recent_7d = sum(1 for dt in all_dates if datetime.strptime(dt, "%Y-%m-%d") >= cutoff)

            risk_flags = []
            if sr["violation_count"] >= 3:
                risk_flags.append("violation>=3")
            if sr["absent_count"] >= 3:
                risk_flags.append("absent>=3")
            if recent_7d >= 3:
                risk_flags.append("7d>=3")

            if risk_flags:
                risk_students.append({
                    **sr,
                    "total_incidents": total_incidents,
                    "first_date": all_dates[0],
                    "last_date": all_dates[-1],
                    "involved_days": len(all_dates),
                    "risk_flags": risk_flags,
                })

        risk_students.sort(key=lambda r: r["total_incidents"], reverse=True)

        # ---- Class Stats (pivot: date x class) ----
        class_date_map: Dict[str, Dict[str, Dict]] = defaultdict(lambda: defaultdict(lambda: {"disc": [], "clean": []}))
        for e in entries:
            cc = e.get("class_code", "")
            d = str(e.get("entry_date", ""))
            class_date_map[d][cc]["disc"].append(e.get("discipline_rating", 0))
            class_date_map[d][cc]["clean"].append(e.get("cleanliness_rating", 0))

        sorted_classes = sorted(classes_set)
        class_stats = {
            "dates": sorted_dates,
            "classes": sorted_classes,
            "data": {},  # date -> {class -> {avg_disc, avg_clean}}
        }
        for d in sorted_dates:
            class_stats["data"][d] = {}
            for cc in sorted_classes:
                vals = class_date_map[d].get(cc)
                if vals and vals["disc"]:
                    class_stats["data"][d][cc] = {
                        "avg_discipline": round(sum(vals["disc"]) / len(vals["disc"]), 1),
                        "avg_cleanliness": round(sum(vals["clean"]) / len(vals["clean"]), 1),
                    }

        # ---- Period Analysis ----
        period_labels = ["早會", "第一節", "第二節", "第三節", "第四節",
                         "第五節", "第六節", "第七節", "第八節", "第九節"]
        period_map: Dict[int, list] = defaultdict(list)
        for e in entries:
            period_map[e.get("period_start", 0)].append(e)

        period_analysis = []
        for p in sorted(period_map):
            pes = period_map[p]
            n = len(pes)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in pes)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in pes)
            violation_n = sum(len(extract_student_names(e.get("rule_violations", ""))) + len(extract_student_names(e.get("appearance_issues", ""))) for e in pes)
            praise_n = sum(len(extract_student_names(e.get("commended_students", ""))) for e in pes)
            medical_n = sum(len(extract_student_names(e.get("medical_room_students", ""))) for e in pes)
            period_analysis.append({
                "period": p,
                "period_label": period_labels[p] if p < len(period_labels) else f"第{p}節",
                "entry_count": n,
                "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in pes) / n, 1),
                "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in pes) / n, 1),
                "absent_count": absent_n, "late_count": late_n,
                "violation_count": violation_n, "praise_count": praise_n,
                "medical_count": medical_n,
                "violation_rate": round(violation_n / n, 2) if n else 0,
                "praise_rate": round(praise_n / n, 2) if n else 0,
            })

        # ---- Subject Analysis ----
        subject_map: Dict[str, list] = defaultdict(list)
        for e in entries:
            subject_map[e.get("subject", "")].append(e)

        subject_analysis = []
        for subj in sorted(subject_map):
            ses = subject_map[subj]
            n = len(ses)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in ses)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in ses)
            violation_n = sum(len(extract_student_names(e.get("rule_violations", ""))) + len(extract_student_names(e.get("appearance_issues", ""))) for e in ses)
            praise_n = sum(len(extract_student_names(e.get("commended_students", ""))) for e in ses)
            medical_n = sum(len(extract_student_names(e.get("medical_room_students", ""))) for e in ses)
            subject_analysis.append({
                "subject": subj, "entry_count": n,
                "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in ses) / n, 1),
                "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in ses) / n, 1),
                "absent_count": absent_n, "late_count": late_n,
                "violation_count": violation_n, "praise_count": praise_n,
                "medical_count": medical_n,
                "violation_rate": round(violation_n / n, 2) if n else 0,
                "praise_rate": round(praise_n / n, 2) if n else 0,
            })

        # ---- Reason Analysis ----
        reason_map: Dict[Tuple[str, str], Dict] = {}  # (reason, category) -> stats
        _REASON_FIELDS = [
            ("commended_students", "表揚"),
            ("rule_violations", "課堂違規"),
            ("appearance_issues", "儀表"),
            ("medical_room_students", "醫務室"),
        ]
        for e in entries:
            cc = e.get("class_code", "")
            d = str(e.get("entry_date", ""))
            for field, category in _REASON_FIELDS:
                for reason, names in extract_students_with_reasons(e.get(field, "")):
                    rk = (reason, category)
                    rec = reason_map.setdefault(rk, {
                        "reason": reason, "category": category,
                        "total_count": 0, "students": set(), "classes": set(), "dates": set(),
                    })
                    rec["total_count"] += len(names)
                    rec["students"].update(names)
                    rec["classes"].add(cc)
                    rec["dates"].add(d)

        reason_analysis = []
        for rk, rec in reason_map.items():
            all_dates = sorted(rec["dates"])
            reason_analysis.append({
                "reason": rec["reason"], "category": rec["category"],
                "total_count": rec["total_count"],
                "student_count": len(rec["students"]),
                "class_count": len(rec["classes"]),
                "date_count": len(rec["dates"]),
                "first_date": all_dates[0] if all_dates else "",
                "last_date": all_dates[-1] if all_dates else "",
            })
        reason_analysis.sort(key=lambda r: r["total_count"], reverse=True)

        # ---- Weekday Analysis ----
        weekday_labels = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
        weekday_map: Dict[int, list] = defaultdict(list)
        for e in entries:
            try:
                dt = datetime.strptime(str(e.get("entry_date", "")), "%Y-%m-%d")
                weekday_map[dt.weekday()].append(e)
            except (ValueError, TypeError):
                pass

        weekday_analysis = []
        for wd in range(7):
            wes = weekday_map.get(wd, [])
            if not wes:
                continue
            n = len(wes)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in wes)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in wes)
            violation_n = sum(len(extract_student_names(e.get("rule_violations", ""))) + len(extract_student_names(e.get("appearance_issues", ""))) for e in wes)
            praise_n = sum(len(extract_student_names(e.get("commended_students", ""))) for e in wes)
            weekday_analysis.append({
                "weekday": wd, "weekday_label": weekday_labels[wd],
                "entry_count": n,
                "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in wes) / n, 1),
                "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in wes) / n, 1),
                "absent_count": absent_n, "late_count": late_n,
                "violation_count": violation_n, "praise_count": praise_n,
                "violation_rate": round(violation_n / n, 2) if n else 0,
                "praise_rate": round(praise_n / n, 2) if n else 0,
            })

        # ---- Submitter Analysis ----
        submitter_map: Dict[str, list] = defaultdict(list)
        for e in entries:
            sub = e.get("submitted_by", "") or ""
            if sub:
                submitter_map[sub].append(e)

        submitter_analysis = []
        for sub in sorted(submitter_map):
            ses = submitter_map[sub]
            n = len(ses)
            classes = set(e.get("class_code", "") for e in ses)
            absent_n = sum(len(extract_student_names(e.get("absent_students", ""))) for e in ses)
            late_n = sum(len(extract_student_names(e.get("late_students", ""))) for e in ses)
            violation_n = sum(len(extract_student_names(e.get("rule_violations", ""))) + len(extract_student_names(e.get("appearance_issues", ""))) for e in ses)
            praise_n = sum(len(extract_student_names(e.get("commended_students", ""))) for e in ses)
            submitter_analysis.append({
                "submitter": sub, "entry_count": n,
                "class_count": len(classes),
                "avg_discipline": round(sum(e.get("discipline_rating", 0) for e in ses) / n, 1),
                "avg_cleanliness": round(sum(e.get("cleanliness_rating", 0) for e in ses) / n, 1),
                "absent_count": absent_n, "late_count": late_n,
                "violation_count": violation_n, "praise_count": praise_n,
            })

        return {
            "overview": overview,
            "daily_summary": daily_summary,
            "student_records": student_records,
            "risk_students": risk_students,
            "class_stats": class_stats,
            "period_analysis": period_analysis,
            "subject_analysis": subject_analysis,
            "reason_analysis": reason_analysis,
            "weekday_analysis": weekday_analysis,
            "submitter_analysis": submitter_analysis,
        }


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


# ====================================================================== #
#  模組級工具函數（可被 Service / Router / AI 分析共用）                        #
# ====================================================================== #

_NAME_BRACKET_RE = re.compile(r"\(.*?\)$")


def normalize_student_name(raw: str) -> str:
    """正規化學生姓名：去空白、去尾部括號班號如 '陳大文(1A-01)' → '陳大文'"""
    name = raw.strip()
    if not name:
        return ""
    return _NAME_BRACKET_RE.sub("", name).strip()


def extract_student_names(value: str) -> List[str]:
    """從 JSON 或逗號/頓號分隔文字中提取學生名列表（正規化後去重）"""
    if not value or not value.strip():
        return []
    try:
        data = json.loads(value)
        if isinstance(data, list):
            names = []
            for item in data:
                if isinstance(item, dict):
                    names.extend(item.get("students", []))
                elif isinstance(item, str):
                    names.append(item)
            return list(dict.fromkeys(
                normalize_student_name(n) for n in names if normalize_student_name(n)
            ))
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass
    # 逗號/頓號分隔
    parts = re.split(r"[,，、;\s]+", value)
    return list(dict.fromkeys(
        normalize_student_name(p) for p in parts if normalize_student_name(p)
    ))


def extract_students_with_reasons(value: str) -> List[Tuple[str, List[str]]]:
    """提取 [(reason, [student_names]), ...] — 僅適用於 JSON 格式行為欄位"""
    if not value or not value.strip():
        return []
    try:
        data = json.loads(value)
        if isinstance(data, list):
            result = []
            for item in data:
                if isinstance(item, dict):
                    reason = item.get("reason", "")
                    students = [normalize_student_name(n) for n in item.get("students", []) if normalize_student_name(n)]
                    if students:
                        result.append((reason, students))
            return result
    except (json.JSONDecodeError, TypeError, AttributeError):
        pass
    # 非 JSON → 視為無原因的名單
    names = extract_student_names(value)
    if names:
        return [("", names)]
    return []


def _new_student_record(name: str, class_code: str) -> Dict[str, Any]:
    """創建空的學生統計記錄"""
    return {
        "name": name, "class_code": class_code,
        "absent_count": 0, "absent_dates": [],
        "late_count": 0, "late_dates": [],
        "violation_count": 0, "violation_dates": [],
        "medical_count": 0, "medical_dates": [],
    }
