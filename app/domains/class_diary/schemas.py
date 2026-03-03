"""
課室日誌 — Pydantic 模型
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class CreateEntryRequest(BaseModel):
    """提交課堂評級"""

    class_code: str = Field(..., min_length=1, max_length=20, description="班級代碼")
    entry_date: date = Field(..., description="上課日期")
    period_start: int = Field(..., ge=0, le=9, description="起始節數 (0=早會, 1-9)")
    period_end: int = Field(..., ge=0, le=9, description="結束節數")
    subject: str = Field(..., min_length=1, max_length=100, description="科目名稱")

    # 可選字段
    absent_students: Optional[str] = Field(default="", max_length=2000, description="缺席學生")
    late_students: Optional[str] = Field(default="", max_length=2000, description="遲到學生")
    commended_students: Optional[str] = Field(default="", max_length=2000, description="值得嘉許的學生")
    appearance_issues: Optional[str] = Field(default="", max_length=2000, description="儀表違規")
    rule_violations: Optional[str] = Field(default="", max_length=2000, description="課堂違規")

    # 必填字段
    discipline_rating: int = Field(..., ge=1, le=5, description="紀律評級 1-5")
    cleanliness_rating: int = Field(..., ge=1, le=5, description="整潔評級 1-5")
    signature: str = Field(..., min_length=10, description="手寫簽名 (base64 PNG)")


class UpdateEntryRequest(BaseModel):
    """修改已提交的評級"""

    subject: Optional[str] = Field(default=None, min_length=1, max_length=100)
    absent_students: Optional[str] = Field(default=None, max_length=2000)
    late_students: Optional[str] = Field(default=None, max_length=2000)
    discipline_rating: Optional[int] = Field(default=None, ge=1, le=5)
    cleanliness_rating: Optional[int] = Field(default=None, ge=1, le=5)
    commended_students: Optional[str] = Field(default=None, max_length=2000)
    appearance_issues: Optional[str] = Field(default=None, max_length=2000)
    rule_violations: Optional[str] = Field(default=None, max_length=2000)
    signature: Optional[str] = Field(default=None, min_length=10)
    period_start: Optional[int] = Field(default=None, ge=0, le=9)
    period_end: Optional[int] = Field(default=None, ge=0, le=9)


class EntryResponse(BaseModel):
    """評級記錄響應"""

    id: int
    class_code: str
    entry_date: date
    period_start: int
    period_end: int
    subject: str
    absent_students: Optional[str] = ""
    late_students: Optional[str] = ""
    discipline_rating: int
    cleanliness_rating: int
    commended_students: Optional[str] = ""
    appearance_issues: Optional[str] = ""
    rule_violations: Optional[str] = ""
    signature: Optional[str] = ""
    submitted_from: Optional[str] = ""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ReviewerRequest(BaseModel):
    """添加 / 移除 Reviewer"""

    username: str = Field(..., min_length=1, max_length=100)
