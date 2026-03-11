"""
課室日誌 — Service (業務邏輯層)
"""

import io
import logging
import re
from datetime import date, datetime
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
)

logger = logging.getLogger(__name__)

# 移動裝置 User-Agent 關鍵字
_MOBILE_UA_PATTERNS = re.compile(
    r"(Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry|Opera Mini|IEMobile)",
    re.IGNORECASE,
)


class ClassDiaryService:
    """課室日誌業務邏輯"""

    def __init__(
        self,
        entry_repo: ClassDiaryEntryRepository,
        reviewer_repo: ClassDiaryReviewerRepository,
        user_repo=None,
    ):
        self._entry_repo = entry_repo
        self._reviewer_repo = reviewer_repo
        self._user_repo = user_repo

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
        """檢查用戶是否有 Review 訪問權限（admin / reviewer / 班主任或副班 / 報告接收人）"""
        if role == "admin":
            return True
        if self._reviewer_repo.is_reviewer(username):
            return True
        # 檢查是否為某班的班主任或副班主任
        try:
            rows = self._entry_repo.raw_query(
                "SELECT class_code FROM classes "
                "WHERE teacher_username = %s OR vice_teacher_username = %s",
                (username, username),
            )
            if rows:
                return True
        except Exception:
            pass
        # 檢查是否為報告接收人
        try:
            rows = self._entry_repo.raw_query(
                "SELECT id FROM class_diary_report_recipients WHERE username = %s",
                (username,),
            )
            if rows:
                return True
        except Exception:
            pass
        return False

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
