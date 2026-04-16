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
from typing import Any, Dict, List, Optional, Protocol

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
    """
    以「卡片化」方式呈現整塊板,接近佈告板視覺:
      - 封面:板標題 + 描述 + meta (匯出時間 + 貼文數)
      - 每則貼文為獨立邊框卡片 (Table with BOX style)
      - 內嵌圖片 (從本地 web_static 路徑讀取)
      - 釘選徽章 / 標籤 / 作者 / 讚數 / 評論清單
    """
    content_type: str = "application/pdf"
    extension: str = "pdf"

    _cjk_font_registered: bool = False

    def _register_cjk(self) -> str:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.cidfonts import UnicodeCIDFont
        if not self._cjk_font_registered:
            try:
                pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
                self._cjk_font_registered = True
            except Exception as e:  # noqa: BLE001
                logger.warning("CJK font register failed: %s", e)
                return "Helvetica"
        return "STSong-Light"

    def _escape_xml(self, text: str) -> str:
        return (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def _resolve_local_image(self, url: str) -> Optional[str]:
        """把上傳圖片 URL 轉成本地檔案路徑, 其他來源返回 None"""
        if not url:
            return None
        from pathlib import Path
        base = Path(__file__).resolve().parent.parent.parent.parent
        # 新路徑: /uploads/boards/...
        if url.startswith("/uploads/"):
            rel = url[len("/uploads/"):]
            local = base / "uploads" / rel
            return str(local) if local.exists() else None
        # 舊路徑相容: /static/uploaded_boards/...
        if url.startswith("/static/"):
            rel = url[len("/static/"):]
            local = base / "web_static" / rel
            return str(local) if local.exists() else None
        return None

    def export(self, detail: Dict[str, Any]) -> bytes:
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4
            from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
            from reportlab.lib.units import mm
            from reportlab.platypus import (
                Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
            )
        except ImportError:
            logger.warning("reportlab 未安裝,pdf 匯出回退為純文字")
            return self._fallback_text(detail)

        font_name = self._register_cjk()

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            title=detail.get("board", {}).get("title", "Board"),
            leftMargin=15 * mm, rightMargin=15 * mm,
            topMargin=15 * mm, bottomMargin=15 * mm,
        )
        base = getSampleStyleSheet()
        title_style = ParagraphStyle(
            "CJKTitle", parent=base["Title"], fontName=font_name,
            fontSize=22, leading=28, alignment=0, textColor=colors.HexColor("#111827"),
        )
        meta_style = ParagraphStyle(
            "CJKMeta", parent=base["Normal"], fontName=font_name,
            fontSize=9, leading=12, textColor=colors.HexColor("#6b7280"),
        )
        card_title_style = ParagraphStyle(
            "CJKCardTitle", parent=base["Normal"], fontName=font_name,
            fontSize=13, leading=17, textColor=colors.HexColor("#111827"),
        )
        card_body_style = ParagraphStyle(
            "CJKCardBody", parent=base["Normal"], fontName=font_name,
            fontSize=10, leading=15, textColor=colors.HexColor("#1f2937"),
        )
        card_author_style = ParagraphStyle(
            "CJKCardAuthor", parent=base["Normal"], fontName=font_name,
            fontSize=9, leading=12, textColor=colors.HexColor("#6b7280"),
        )
        card_tag_style = ParagraphStyle(
            "CJKCardTag", parent=base["Normal"], fontName=font_name,
            fontSize=8, leading=11, textColor=colors.HexColor("#006633"),
        )
        comment_style = ParagraphStyle(
            "CJKComment", parent=base["Normal"], fontName=font_name,
            fontSize=9, leading=12, textColor=colors.HexColor("#4b5563"),
            leftIndent=10,
        )

        board = detail.get("board", {})
        posts = detail.get("posts", [])
        sections = {s["id"]: s for s in (detail.get("sections") or [])}

        story: List[Any] = []
        # ─── 封面區 ───
        story.append(Paragraph(self._escape_xml(board.get("title") or ""), title_style))
        if board.get("description"):
            story.append(Spacer(1, 4))
            story.append(Paragraph(self._escape_xml(board["description"]), meta_style))
        from datetime import datetime as _dt
        meta_line = f"共 {len(posts)} 則貼文　·　匯出於 {_dt.now().strftime('%Y-%m-%d %H:%M')}"
        story.append(Spacer(1, 4))
        story.append(Paragraph(meta_line, meta_style))
        story.append(Spacer(1, 14))

        # ─── 每則貼文 = 一個 bordered card ───
        # 可用寬度 = A4 減左右 margin
        page_w = A4[0] - 30 * mm
        for p in posts:
            card_flow: List[Any] = []

            # Header: 作者 · ♥讚數 · 釘選徽章 · 分欄
            header_parts = []
            author = self._escape_xml(p.get("author_name") or "")
            if author:
                header_parts.append(f"<b>{author}</b>")
            header_parts.append(f"♥ {p.get('like_count', 0)}")
            if p.get("pinned"):
                header_parts.append("<font color='#006633'>● 釘選</font>")
            if p.get("status") == "pending":
                header_parts.append("<font color='#92400e'>● 待審</font>")
            sec = sections.get(p.get("section_id"))
            if sec:
                header_parts.append(f"[{self._escape_xml(sec.get('name',''))}]")
            card_flow.append(Paragraph("　·　".join(header_parts), card_author_style))

            # Title
            if p.get("title"):
                card_flow.append(Spacer(1, 3))
                card_flow.append(Paragraph(
                    f"<b>{self._escape_xml(p['title'])}</b>", card_title_style,
                ))

            # Body
            body_raw = (p.get("body") or "").strip()
            if body_raw:
                card_flow.append(Spacer(1, 3))
                card_flow.append(Paragraph(
                    self._escape_xml(body_raw).replace("\n", "<br/>"),
                    card_body_style,
                ))

            # Image (media_url 或 media 陣列第一張)
            img_paths: List[str] = []
            for m in (p.get("media") or []):
                if isinstance(m, dict) and (m.get("mime") or "").startswith("image/"):
                    pth = self._resolve_local_image(m.get("url", ""))
                    if pth:
                        img_paths.append(pth)
            if not img_paths and p.get("kind") == "image" and p.get("media_url"):
                pth = self._resolve_local_image(p["media_url"])
                if pth:
                    img_paths.append(pth)

            for pth in img_paths[:3]:  # 單則貼文最多 3 張,避免頁面爆炸
                try:
                    img = Image(pth)
                    max_w = page_w - 20 * mm
                    max_h = 80 * mm
                    iw, ih = img.imageWidth, img.imageHeight
                    ratio = min(max_w / iw, max_h / ih, 1.0)
                    img.drawWidth = iw * ratio
                    img.drawHeight = ih * ratio
                    card_flow.append(Spacer(1, 5))
                    card_flow.append(img)
                except Exception as e:  # noqa: BLE001
                    logger.debug("PDF image embed fail %s: %s", pth, e)

            # Link (YouTube/Vimeo 顯示為文字連結)
            if p.get("kind") in ("link", "youtube", "vimeo") and p.get("link_url"):
                card_flow.append(Spacer(1, 3))
                card_flow.append(Paragraph(
                    f"🔗 <font color='#2563eb'>{self._escape_xml(p['link_url'])}</font>",
                    card_body_style,
                ))

            # Tags
            tags = p.get("tags") or []
            if tags:
                card_flow.append(Spacer(1, 3))
                card_flow.append(Paragraph(
                    "　".join(f"#{self._escape_xml(t)}" for t in tags),
                    card_tag_style,
                ))

            # Comments
            comments = p.get("comments") or []
            if comments:
                card_flow.append(Spacer(1, 5))
                card_flow.append(Paragraph(
                    f"<b>評論 ({len(comments)})</b>", card_author_style,
                ))
                for c in comments[:20]:
                    c_author = self._escape_xml(c.get("author_name") or "")
                    c_body = self._escape_xml(c.get("body") or "")
                    card_flow.append(Paragraph(
                        f"↳ <b>{c_author}</b>: {c_body}", comment_style,
                    ))

            # 把 card_flow 包進有邊框的 Table
            card_table = Table([[card_flow]], colWidths=[page_w])
            card_table.setStyle(TableStyle([
                ("BOX", (0, 0), (-1, -1), 0.6, colors.HexColor("#e5e7eb")),
                ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#ffffff")),
                ("LEFTPADDING", (0, 0), (-1, -1), 10),
                ("RIGHTPADDING", (0, 0), (-1, -1), 10),
                ("TOPPADDING", (0, 0), (-1, -1), 10),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                # 釘選貼文的左邊顯示品牌綠邊條
                *([("LINEBEFORE", (0, 0), (0, -1), 3, colors.HexColor("#006633"))]
                  if p.get("pinned") else []),
            ]))
            story.append(KeepTogether(card_table))
            story.append(Spacer(1, 10))

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
