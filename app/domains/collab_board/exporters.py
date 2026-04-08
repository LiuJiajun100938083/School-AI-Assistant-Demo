"""
佈告板匯出 — Provider 抽象 + 多格式實作
==========================================
Service 層拿到 board detail dict (含 posts / sections / comments 附加欄位)
後交給這裡匯出。純函式 / 不觸網路。

格式:
  - json : 機器可讀完整快照,最可靠,無外部依賴
  - xlsx : 適合教師整理成績/批改
  - pdf  : 文字列印版 (reportlab 可選;若無裝依賴則返回 UTF-8 文字)

Provider 介面:
    class Exporter(Protocol):
        content_type: str
        extension: str
        def export(self, detail: dict) -> bytes: ...

Service 透過 get_exporter(fmt) 取對應實作。
"""

from __future__ import annotations

import io
import json
import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, Dict, Protocol

logger = logging.getLogger(__name__)


# ----- Protocol --------------------------------------------------------------

class Exporter(Protocol):
    content_type: str
    extension: str

    def export(self, detail: Dict[str, Any]) -> bytes: ...


# ----- JSON ------------------------------------------------------------------

def _json_default(o: Any):
    if isinstance(o, (datetime, date)):
        return o.isoformat()
    if isinstance(o, bytes):
        return o.decode("utf-8", errors="replace")
    return str(o)


@dataclass
class JsonExporter:
    content_type: str = "application/json"
    extension: str = "json"

    def export(self, detail: Dict[str, Any]) -> bytes:
        return json.dumps(detail, ensure_ascii=False, indent=2, default=_json_default).encode("utf-8")


# ----- XLSX (需 openpyxl) ----------------------------------------------------

@dataclass
class XlsxExporter:
    content_type: str = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    extension: str = "xlsx"

    def export(self, detail: Dict[str, Any]) -> bytes:
        try:
            from openpyxl import Workbook
        except ImportError:
            logger.warning("openpyxl 未安裝,xlsx 匯出回退為 JSON")
            return JsonExporter().export(detail)

        wb = Workbook()
        ws = wb.active
        ws.title = "Posts"
        ws.append(["ID", "Author", "Section", "Kind", "Title", "Body", "Likes", "Comments", "Pinned", "Status", "Created"])
        section_map = {s["id"]: s.get("name", "") for s in detail.get("sections", [])}
        for p in detail.get("posts", []):
            ws.append([
                p.get("id"),
                p.get("author_name") or "",
                section_map.get(p.get("section_id"), ""),
                p.get("kind"),
                p.get("title") or "",
                (p.get("body") or "")[:500],
                p.get("like_count", 0),
                len(p.get("comments") or []),
                "Y" if p.get("pinned") else "",
                p.get("status"),
                str(p.get("created_at") or ""),
            ])

        # Comments sheet
        ws2 = wb.create_sheet("Comments")
        ws2.append(["PostID", "Author", "Body", "Created"])
        for p in detail.get("posts", []):
            for c in p.get("comments") or []:
                ws2.append([
                    p.get("id"),
                    c.get("author_name") or "",
                    (c.get("body") or "")[:500],
                    str(c.get("created_at") or ""),
                ])

        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()


# ----- PDF (需 reportlab,否則 fallback 純文字) --------------------------------

@dataclass
class PdfExporter:
    content_type: str = "application/pdf"
    extension: str = "pdf"

    def export(self, detail: Dict[str, Any]) -> bytes:
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer
        except ImportError:
            logger.warning("reportlab 未安裝,pdf 匯出回退為純文字")
            return self._fallback_text(detail)

        buf = io.BytesIO()
        doc = SimpleDocTemplate(buf, pagesize=A4, title=detail.get("board", {}).get("title", "Board"))
        styles = getSampleStyleSheet()
        story = []
        board = detail.get("board", {})
        story.append(Paragraph(f"<b>{board.get('title','')}</b>", styles["Title"]))
        if board.get("description"):
            story.append(Paragraph(board["description"], styles["Normal"]))
        story.append(Spacer(1, 12))

        for p in detail.get("posts", []):
            title = p.get("title") or ""
            author = p.get("author_name") or ""
            body = (p.get("body") or "").replace("\n", "<br/>")
            story.append(Paragraph(f"<b>{title}</b> — {author}", styles["Heading3"]))
            if body:
                story.append(Paragraph(body, styles["Normal"]))
            story.append(Spacer(1, 8))
        doc.build(story)
        return buf.getvalue()

    def _fallback_text(self, detail: Dict[str, Any]) -> bytes:
        lines = []
        board = detail.get("board", {})
        lines.append(board.get("title", ""))
        lines.append("=" * 60)
        if board.get("description"):
            lines.append(board["description"])
            lines.append("")
        for p in detail.get("posts", []):
            lines.append(f"[{p.get('author_name','')}] {p.get('title','')}")
            if p.get("body"):
                lines.append(p["body"])
            lines.append("")
        return "\n".join(lines).encode("utf-8")


# ----- Registry --------------------------------------------------------------

_REGISTRY: Dict[str, Exporter] = {
    "json": JsonExporter(),
    "xlsx": XlsxExporter(),
    "pdf":  PdfExporter(),
}

SUPPORTED_FORMATS = frozenset(_REGISTRY.keys())


def get_exporter(fmt: str) -> Exporter:
    fmt = (fmt or "json").lower()
    if fmt not in _REGISTRY:
        raise ValueError(f"unsupported format: {fmt}")
    return _REGISTRY[fmt]
