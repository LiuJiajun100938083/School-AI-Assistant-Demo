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
# 多圖合併 PDF
# ============================================================

PDF_MAX_IMAGES = 30
PDF_PER_FILE_MAX_SIZE = 20 * 1024 * 1024  # 20 MB

ALLOWED_IMAGE_MIMES = frozenset({
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
})
