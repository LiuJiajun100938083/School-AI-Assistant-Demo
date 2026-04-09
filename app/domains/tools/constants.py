"""實用工具 — 配置常數

所有魔術數字集中於此,service/router 禁止自己寫 literal。
"""

# ============================================================
# QR 碼生成器
# ============================================================

QR_MAX_TEXT_LEN = 2000
QR_SIZE_DEFAULT = 512
QR_SIZE_MIN = 128
QR_SIZE_MAX = 2048

# error correction 等級
QR_EC_CHOICES = frozenset({"L", "M", "Q", "H"})
QR_EC_DEFAULT = "M"

# ============================================================
# PDF 多功能工具 (合併 / 分割 / 壓縮 / 浮水印)
# ============================================================

# 圖片轉 PDF
PDF_MAX_IMAGES = 30
PDF_PER_FILE_MAX_SIZE = 20 * 1024 * 1024  # 20 MB / 單張圖片

ALLOWED_IMAGE_MIMES = frozenset({
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
})

# PDF 檔案限制 (分割 / 壓縮 / 浮水印 / PDF 合併 共用)
PDF_MAX_FILE_SIZE = 100 * 1024 * 1024  # 100 MB / 單個 PDF
PDF_MAX_PAGES = 2000                   # 單個 PDF 最多 2000 頁
PDF_MERGE_MAX_FILES = 20               # 最多合併 20 個 PDF

ALLOWED_PDF_MIMES = frozenset({
    "application/pdf",
    "application/x-pdf",
})

# 壓縮等級
PDF_COMPRESS_LEVELS = frozenset({"high", "medium", "low"})
PDF_COMPRESS_DEFAULT = "medium"
# (等級, 圖片重新取樣 DPI, JPEG quality)
PDF_COMPRESS_PRESETS = {
    "high":   (200, 85),   # 高品質  ~ 接近原檔
    "medium": (120, 70),   # 平衡   ~ 50-70% 縮小
    "low":    (72, 50),    # 最小檔 ~ 70-90% 縮小
}

# 浮水印參數
PDF_WATERMARK_MAX_TEXT_LEN = 80
PDF_WATERMARK_ANGLE_CHOICES = frozenset({-45, 0, 45, 90})
