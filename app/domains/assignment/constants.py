#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
作業管理常量
============
文件類型映射、大小限制、允許的擴展名等。
"""

# 文件大小限制
MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB per file
MAX_FILES_PER_SUBMISSION = 5

# 允許的文件擴展名 → 類型映射
EXTENSION_TYPE_MAP = {
    # 文檔
    ".pdf": "pdf",
    ".doc": "document",
    ".docx": "document",
    ".ppt": "document",
    ".pptx": "document",
    ".xls": "document",
    ".xlsx": "document",
    ".txt": "code",
    ".md": "code",
    # 圖片
    ".jpg": "image",
    ".jpeg": "image",
    ".png": "image",
    ".gif": "image",
    ".bmp": "image",
    ".svg": "image",
    ".webp": "image",
    # 視頻
    ".mp4": "video",
    ".mov": "video",
    ".avi": "video",
    ".mkv": "video",
    ".webm": "video",
    # 代碼
    ".swift": "code",
    ".py": "code",
    ".js": "code",
    ".ts": "code",
    ".jsx": "code",
    ".tsx": "code",
    ".html": "code",
    ".css": "code",
    ".java": "code",
    ".c": "code",
    ".cpp": "code",
    ".h": "code",
    ".rb": "code",
    ".go": "code",
    ".rs": "code",
    ".json": "code",
    ".xml": "code",
    ".yaml": "code",
    ".yml": "code",
    # 壓縮包
    ".zip": "archive",
    ".rar": "archive",
    ".7z": "archive",
    ".tar": "archive",
    ".gz": "archive",
    ".swiftpm": "archive",
}

# 可直接讀取文本的擴展名 (用於 AI 批改)
TEXT_READABLE_EXTENSIONS = {
    ".swift", ".py", ".js", ".ts", ".jsx", ".tsx",
    ".html", ".css", ".java", ".c", ".cpp", ".h",
    ".rb", ".go", ".rs", ".json", ".xml", ".yaml", ".yml",
    ".txt", ".md",
}

# 可通過 FileProcessor 提取文本的擴展名
DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".pptx", ".doc", ".ppt"}

# 可轉 HTML 預覽的 Office 擴展名（用於 preview_file 白名單）
PREVIEWABLE_OFFICE_EXTENSIONS = {".docx", ".xlsx", ".pptx"}

# 可預覽的壓縮包擴展名（解壓後展示內部代碼）
PREVIEWABLE_ARCHIVE_EXTENSIONS = {".swiftpm"}

# 評分類型
RUBRIC_TYPES = (
    "points",           # 簡單計分 (默認)
    "analytic_levels",  # 分級描述量規
    "weighted_pct",     # 權重百分比制
    "checklist",        # 通過/不通過清單
    "competency",       # 能力等級制
    "dse_criterion",    # DSE 標準量規
    "holistic",         # 整體評分
)

# 作業狀態
ASSIGNMENT_STATUS = ("draft", "published", "closed")

# 提交狀態
SUBMISSION_STATUS = ("submitted", "graded", "returned")

# 目標類型
TARGET_TYPES = ("all", "class", "student")
