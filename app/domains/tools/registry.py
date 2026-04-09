"""實用工具 — 集中註冊表

加新工具只需在此 list 加一個 ToolSpec。
首頁 DEFAULT_APP_MODULES 自動從這生成。
"""

from typing import List

from app.domains.tools.base import ToolSpec


TOOLS: List[ToolSpec] = [
    ToolSpec(
        id="tool_qrcode",
        name_zh="QR 碼生成器",
        name_en="QR Code Generator",
        description_zh="輸入文字或 URL,一鍵生成 QR 碼並下載",
        description_en="Generate QR code from text or URL",
        page_url="/tools/qrcode",
        needs_backend=True,
    ),
    ToolSpec(
        id="tool_image_convert",
        name_zh="圖片格式轉換",
        name_en="Image Format Converter",
        description_zh="PNG / JPG / WebP 互相轉換(瀏覽器本地處理)",
        description_en="Convert between PNG / JPG / WebP locally",
        page_url="/tools/image-convert",
        needs_backend=False,
    ),
    ToolSpec(
        id="tool_pdf_merge",
        name_zh="PDF 多功能工具",
        name_en="PDF Toolkit",
        description_zh="合併(圖片或 PDF)、提取頁面、壓縮、加浮水印 — 完全本地處理",
        description_en="Merge (images or PDFs), extract pages, compress, watermark — all local",
        page_url="/tools/pdf-merge",
        needs_backend=True,
    ),
    ToolSpec(
        id="tool_countdown",
        name_zh="倒數計時器",
        name_en="Countdown Timer",
        description_zh="課堂計時大字顯示,支援全螢幕投影",
        description_en="Classroom countdown with large display",
        page_url="/tools/countdown",
        needs_backend=False,
    ),
    ToolSpec(
        id="tool_roll_call",
        name_zh="課堂點名",
        name_en="Roll Call",
        description_zh="選班級隨機抽人或分組,可放回重抽",
        description_en="Random pick or group students by class",
        page_url="/tools/roll-call",
        needs_backend=True,
    ),
]


def get_tool(tool_id: str) -> ToolSpec:
    """按 id 查詢,找不到 raise KeyError"""
    for t in TOOLS:
        if t.id == tool_id:
            return t
    raise KeyError(f"unknown tool: {tool_id}")
